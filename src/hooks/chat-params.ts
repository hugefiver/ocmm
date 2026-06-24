/**
 * `chat.params` hook handler.
 *
 * Mutates output.options / output.temperature / etc. based on the matching
 * FallbackEntry and variant translation. Never throws; returns silently if the
 * input shape is unfamiliar (forward compatibility with future OpenCode versions).
 */

import { resolveModelRouting } from "../routing/resolver.ts"
import { normalizeVariantForModel, translateVariant } from "../routing/variant-translator.ts"
import { recordResolution } from "../routing/ledger.ts"
import { classifyModelFamily, isMiniModel } from "../intent/model-family.ts"
import { isRecord, log } from "../shared/logger.ts"
import type { OcmmConfig } from "../config/schema.ts"
import type { Variant } from "../shared/types.ts"

const BELOW_HIGH_REASONING = new Set(["none", "minimal", "low", "medium", "auto"])
const ABOVE_HIGH_REASONING = new Set(["xhigh", "max", "thinking"])

function protectedModelHasNoReasoningParam(family: string): boolean {
  return family === "claude-opus-47-plus"
}

function normalizeReasoningEffortForModel(args: {
  family: string
  modelID: string
  reasoningEffort: string
  explicit: boolean
}): string | undefined {
  if (args.explicit) return args.reasoningEffort
  const effort = args.reasoningEffort.toLowerCase()
  if (protectedModelHasNoReasoningParam(args.family)) return undefined
  if ((args.family === "gpt" || args.family === "codex") && !isMiniModel(args.modelID)) {
    return BELOW_HIGH_REASONING.has(effort) || ABOVE_HIGH_REASONING.has(effort)
      ? "high"
      : args.reasoningEffort
  }
  return args.reasoningEffort
}

/** Narrow the runtime shape OpenCode passes us. */
type ChatParamsInput = {
  sessionID: string
  agent: { name?: string } | string
  model: { providerID: string; modelID: string }
  provider: { id: string }
  message: { variant?: string }
}

type ChatParamsOutput = {
  temperature?: number
  topP?: number
  topK?: number
  maxOutputTokens?: number
  options: Record<string, unknown>
}

function readInput(raw: unknown): ChatParamsInput | null {
  if (!isRecord(raw)) return null
  const sessionID = raw.sessionID
  if (typeof sessionID !== "string") return null

  let agentName: string | undefined
  if (typeof raw.agent === "string") agentName = raw.agent
  else if (isRecord(raw.agent) && typeof raw.agent.name === "string") agentName = raw.agent.name

  if (!isRecord(raw.model)) return null
  const providerID = typeof raw.model.providerID === "string"
    ? raw.model.providerID
    : isRecord(raw.provider) && typeof raw.provider.id === "string"
      ? raw.provider.id
      : undefined
  const modelID = typeof raw.model.modelID === "string"
    ? raw.model.modelID
    : typeof raw.model.id === "string"
      ? raw.model.id
      : undefined
  if (!providerID || !modelID) return null

  const message = isRecord(raw.message) ? raw.message : {}
  return {
    sessionID,
    agent: { name: agentName ?? "" },
    model: { providerID, modelID },
    provider: { id: typeof raw.provider === "object" && raw.provider && "id" in raw.provider ? String((raw.provider as Record<string, unknown>).id ?? providerID) : providerID },
    message: { variant: typeof message.variant === "string" ? message.variant : undefined },
  }
}

function ensureOutput(raw: unknown): ChatParamsOutput | null {
  if (!isRecord(raw)) return null
  if (!isRecord(raw.options)) raw.options = {}
  return raw as ChatParamsOutput
}

export function createChatParamsHandler(args: {
  getConfig: () => OcmmConfig
}): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput, rawOutput) => {
    const input = readInput(rawInput)
    if (!input) return
    const output = ensureOutput(rawOutput)
    if (!output) return

    const cfg = args.getConfig()
    const agentName = typeof input.agent === "string" ? input.agent : input.agent.name

    const resolution = resolveModelRouting({
      agentName,
      modelID: input.model.modelID,
      providerID: input.model.providerID,
      inputVariant: input.message.variant,
      agentsConfig: cfg.agents,
      categoriesConfig: cfg.categories,
    })

    if (!resolution) {
      recordResolution({
        ts: Date.now(),
        sessionID: input.sessionID,
        agent: agentName ?? "",
        input: {
          providerID: input.model.providerID,
          modelID: input.model.modelID,
          variant: input.message.variant,
        },
        applied: {},
        source: "no-op",
      })
      return
    }

    const family = classifyModelFamily({
      providerID: input.model.providerID,
      modelID: input.model.modelID,
    })

    // Variant translation
    let appliedVariant: Variant | undefined = resolution.variant
    if (appliedVariant) {
      if (resolution.source !== "user-config" && !input.message.variant) {
        appliedVariant = normalizeVariantForModel({
          family,
          modelID: input.model.modelID,
          variant: appliedVariant,
        })
      }
      const effect = translateVariant(family, appliedVariant, {
        modelID: input.model.modelID,
        respectExplicit: resolution.source === "user-config" || !!input.message.variant,
      })
      if (effect.reasoningEffort !== undefined) {
        output.options.reasoningEffort = effect.reasoningEffort
      }
      if (effect.thinking !== undefined) {
        output.options.thinking = effect.thinking
      }
      if (effect.temperature !== undefined && output.temperature === undefined) {
        output.temperature = effect.temperature
      }
    }

    if (resolution.entry.reasoningEffort !== undefined) {
      const effort = normalizeReasoningEffortForModel({
        family,
        modelID: input.model.modelID,
        reasoningEffort: resolution.entry.reasoningEffort,
        explicit: resolution.source === "user-config",
      })
      if (effort !== undefined) output.options.reasoningEffort = effort
      else delete output.options.reasoningEffort
    }
    if (
      resolution.entry.thinking !== undefined
      && (resolution.source === "user-config" || !protectedModelHasNoReasoningParam(family))
    ) {
      output.options.thinking = resolution.entry.thinking
    }
    if (resolution.entry.temperature !== undefined) {
      output.temperature = resolution.entry.temperature
    }
    if (resolution.entry.topP !== undefined) {
      output.topP = resolution.entry.topP
    }
    if (resolution.entry.maxTokens !== undefined && resolution.entry.maxTokens > 0) {
      output.maxOutputTokens = resolution.entry.maxTokens
    }

    recordResolution({
      ts: Date.now(),
      sessionID: input.sessionID,
      agent: agentName ?? "",
      input: {
        providerID: input.model.providerID,
        modelID: input.model.modelID,
        variant: input.message.variant,
      },
      applied: {
        ...(appliedVariant ? { variant: appliedVariant } : {}),
        ...(typeof output.options.reasoningEffort === "string"
          ? { reasoningEffort: output.options.reasoningEffort }
          : {}),
        ...(isRecord(output.options.thinking)
          ? {
              thinking: {
                type: (output.options.thinking.type as "enabled" | "disabled") ?? "disabled",
                ...(typeof output.options.thinking.budgetTokens === "number"
                  ? { budgetTokens: output.options.thinking.budgetTokens }
                  : {}),
              },
            }
          : {}),
        ...(typeof output.temperature === "number" ? { temperature: output.temperature } : {}),
        ...(typeof output.topP === "number" ? { topP: output.topP } : {}),
        ...(typeof output.maxOutputTokens === "number"
          ? { maxOutputTokens: output.maxOutputTokens }
          : {}),
      },
      source: resolution.source,
    })

    if (cfg.debug) {
      log.debug(
        `routed agent=${agentName ?? "<none>"} model=${input.model.providerID}/${input.model.modelID} ` +
          `variant=${appliedVariant ?? "<none>"} source=${resolution.source}`,
      )
    }
  }
}
