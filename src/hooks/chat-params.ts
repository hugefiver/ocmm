/**
 * `chat.params` hook handler.
 *
 * Mutates output.options / output.temperature / etc. based on the matching
 * FallbackEntry and variant translation. Never throws; returns silently if the
 * input shape is unfamiliar (forward compatibility with future OpenCode versions).
 */

import { resolveModelRouting } from "../routing/resolver.ts"
import { normalizeVariantForModel, translateVariant } from "../routing/variant-translator.ts"
import { recordResolution as defaultRecordResolution } from "../routing/ledger.ts"
import { classifyModelFamily, isMiniModel, supportsNativeGptMaxReasoning } from "../intent/model-family.ts"
import { isRecord, log } from "../shared/logger.ts"
import type { OcmmConfig } from "../config/schema.ts"
import type { Variant, ResolutionEntry } from "../shared/types.ts"

const BELOW_HIGH_REASONING = new Set(["none", "minimal", "low", "medium", "auto"])
const REVIEW_AGENTS = new Set(["reviewer", "oracle", "oracle-high", "plan-critic"])
const REVIEW_VARIANT_FLOOR_FAMILIES = new Set([
  "gpt",
  "codex",
  "claude",
  "claude-opus-47-plus",
  "gemini",
  "glm",
  "deepseek",
])

function requiresReviewVariantFloor(agentName: string | undefined, family: string): boolean {
  return !!agentName && REVIEW_AGENTS.has(agentName) && REVIEW_VARIANT_FLOOR_FAMILIES.has(family)
}

function floorReviewVariant(variant: Variant | undefined): Variant {
  return variant === "xhigh" || variant === "max" ? variant : "xhigh"
}

function capUnsupportedNativeMaxVariant(family: string, modelID: string, variant: Variant | undefined): Variant | undefined {
  if ((family === "gpt" || family === "codex") && variant === "max" && !supportsNativeGptMaxReasoning(modelID)) {
    return "xhigh"
  }
  return variant
}

function thinkingBudget(value: unknown): number | undefined {
  return isRecord(value) && typeof value.budgetTokens === "number" ? value.budgetTokens : undefined
}

function thinkingEnabled(value: unknown): boolean {
  return isRecord(value) && value.type === "enabled"
}

function applyReviewOutputFloor(args: {
  agentName: string | undefined
  family: string
  modelID: string
  appliedVariant: Variant | undefined
  outputOptions: Record<string, unknown>
}): void {
  if (!requiresReviewVariantFloor(args.agentName, args.family)) return

  const floorVariant = floorReviewVariant(args.appliedVariant)
  const directEffort = args.outputOptions.reasoningEffort
  const gptMaxSupported = supportsNativeGptMaxReasoning(args.modelID)
  const directMaxSupported = directEffort === "max" && (args.family !== "gpt" && args.family !== "codex" || gptMaxSupported)
  const effortFloor = floorVariant === "max" && (args.family !== "gpt" && args.family !== "codex" || gptMaxSupported)
    ? "max"
    : "xhigh"

  if (args.family === "gpt" || args.family === "codex" || args.family === "deepseek") {
    if (directEffort !== "xhigh" && directEffort !== "max") args.outputOptions.reasoningEffort = effortFloor
    else if (directEffort === "max" && !directMaxSupported) args.outputOptions.reasoningEffort = "xhigh"
    return
  }

  if (args.family === "glm") {
    if (directEffort !== "xhigh" && directEffort !== "max") args.outputOptions.reasoningEffort = effortFloor
    if (!thinkingEnabled(args.outputOptions.thinking)) args.outputOptions.thinking = { type: "enabled" }
    return
  }

  if (args.family === "gemini") {
    args.outputOptions.reasoningEffort = "high"
    if (!thinkingEnabled(args.outputOptions.thinking)) args.outputOptions.thinking = { type: "enabled" }
    return
  }

  if (args.family === "claude" || args.family === "claude-opus-47-plus") {
    const minBudget = floorVariant === "max" || directEffort === "max" ? 24_576 : 16_384
    if (!thinkingEnabled(args.outputOptions.thinking) || (thinkingBudget(args.outputOptions.thinking) ?? 0) < minBudget) {
      args.outputOptions.thinking = { type: "enabled", budgetTokens: minBudget }
    }
    delete args.outputOptions.reasoningEffort
  }
}

function protectedModelHasNoReasoningParam(family: string): boolean {
  return family === "claude-opus-47-plus"
}

function normalizeReasoningEffortForModel(args: {
  family: string
  modelID: string
  reasoningEffort: string
  explicit: boolean
}): string | undefined {
  const effort = args.reasoningEffort.toLowerCase()
  if ((args.family === "gpt" || args.family === "codex") && effort === "max" && !supportsNativeGptMaxReasoning(args.modelID)) {
    return "xhigh"
  }
  if (args.explicit) return args.reasoningEffort
  if (protectedModelHasNoReasoningParam(args.family)) return undefined
  if ((args.family === "gpt" || args.family === "codex") && !isMiniModel(args.modelID)) {
    return BELOW_HIGH_REASONING.has(effort)
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
  sessionAgentMap?: Map<string, string>
  recordResolution?: (entry: ResolutionEntry) => void
}): (input: unknown, output: unknown) => Promise<void> {
  const record = args.recordResolution ?? defaultRecordResolution
  return async (rawInput, rawOutput) => {
    const input = readInput(rawInput)
    if (!input) return
    const output = ensureOutput(rawOutput)
    if (!output) return

    const cfg = args.getConfig()
    const agentName = typeof input.agent === "string" ? input.agent : input.agent.name

    if (args.sessionAgentMap && input.sessionID) {
      args.sessionAgentMap.set(input.sessionID, agentName ?? "")
    }

    const resolution = resolveModelRouting({
      agentName,
      modelID: input.model.modelID,
      providerID: input.model.providerID,
      inputVariant: input.message.variant,
      agentsConfig: cfg.agents,
      categoriesConfig: cfg.categories,
    })

    if (!resolution) {
      record({
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
    }
    if (requiresReviewVariantFloor(agentName, family)) {
      appliedVariant = floorReviewVariant(appliedVariant)
    }
    appliedVariant = capUnsupportedNativeMaxVariant(family, input.model.modelID, appliedVariant)
    if (appliedVariant) {
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
    applyReviewOutputFloor({ agentName, family, modelID: input.model.modelID, appliedVariant, outputOptions: output.options })

    record({
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
