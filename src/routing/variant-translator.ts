/**
 * Variant -> per-model-family inference parameters.
 *
 * Different providers express "reasoning intensity" differently:
 *   - OpenAI / GPT/Codex family : `options.reasoningEffort`; non-mini built-ins are generally at least high,
 *     except exact GPT-6 Sol/Luna off and GPT-family Sol/Luna/Astra minimal
 *   - Anthropic Claude   : `options.thinking = { type, budgetTokens }`
 *   - Anthropic Opus 4.7+: no thinking override from ocmm
 *   - Google Gemini      : same `reasoningEffort` style; thinking via `options.thinking`
 *   - GLM latest models  : `thinking` + `reasoningEffort`
 *   - DeepSeek latest models : `reasoningEffort` with high/max canonical levels
 *   - Kimi / MiniMax / unknown : best-effort temperature-only translation
 *
 * Explicit user variants bypass built-in minimum-level normalization; concrete
 * reasoningEffort/thinking fields are handled by the chat.params hook.
 */

import { isGpt6AstraModel, isGpt6LunaModel, isGpt6SolModel, isMiniModel, supportsNativeGptMaxReasoning, type ModelFamily } from "../intent/model-family.ts"
import { reasoningToVariant, variantToReasoningLevel } from "../shared/reasoning.ts"
import type { Reasoning, ThinkingMode, Variant } from "../shared/types.ts"

export type VariantEffect = {
  reasoningEffort?: string
  thinking?: { type: ThinkingMode; budgetTokens?: number }
  temperature?: number
}

const NEUTRAL: VariantEffect = {}

/**
 * Map a variant to OpenAI-style reasoningEffort.
 *
 * Mini models keep the full ladder. Non-mini GPT/Codex built-ins generally
 * normalize below-high requests to high; exact GPT-6 off and GPT-family
 * minimal exceptions use their supported effort rung instead. Codex static
 * profiles retain the generic built-in minimal floor.
 */
function gptVariant(variant: Variant, modelID = ""): VariantEffect {
  switch (variant) {
    case "none":
      return NEUTRAL
    case "minimal":
      return { reasoningEffort: "minimal" }
    case "low":
      return { reasoningEffort: "low" }
    case "medium":
    case "auto":
      return { reasoningEffort: "medium" }
    case "high":
    case "thinking":
      return { reasoningEffort: "high" }
    case "xhigh":
      return { reasoningEffort: "xhigh" }
    case "max":
      return { reasoningEffort: supportsNativeGptMaxReasoning(modelID) ? "max" : "xhigh" }
    default:
      return NEUTRAL
  }
}

/**
 * Anthropic extended-thinking ladder.
 *
 * `none` is a true no-op. `minimal` disables thinking explicitly. Opus 4.7+
 * is handled separately and never receives an ocmm thinking budget.
 */
function claudeVariant(variant: Variant): VariantEffect {
  const budget = (n: number) => ({
    thinking: { type: "enabled" as const, budgetTokens: n },
  })
  switch (variant) {
    case "none":
      return NEUTRAL
    case "minimal":
      return { thinking: { type: "disabled" } }
    case "low":
      return budget(2_048)
    case "medium":
    case "auto":
      return budget(6_144)
    case "high":
    case "thinking":
      return budget(12_288)
    case "xhigh":
      return budget(16_384)
    case "max":
      return budget(24_576)
    default:
      return NEUTRAL
  }
}

/** Gemini reasoning is exposed via reasoningEffort + a coarse thinking flag. `none` is a no-op. */
function geminiVariant(variant: Variant): VariantEffect {
  switch (variant) {
    case "none":
      return NEUTRAL
    case "minimal":
      return { reasoningEffort: "minimal" }
    case "low":
      return { reasoningEffort: "low" }
    case "medium":
    case "auto":
      return { reasoningEffort: "medium" }
    case "high":
    case "thinking":
    case "xhigh":
      return { reasoningEffort: "high", thinking: { type: "enabled" } }
    case "max":
      return { reasoningEffort: "high", thinking: { type: "enabled" } }
    default:
      return NEUTRAL
  }
}

/**
 * Best-effort fallback translator for providers without a public reasoning knob:
 * rough temperature shaping. `none` is a true no-op (no temperature override).
 */
function genericVariant(variant: Variant): VariantEffect {
  switch (variant) {
    case "none":
      return NEUTRAL
    case "minimal":
      return { temperature: 0.0 }
    case "low":
      return { temperature: 0.2 }
    case "medium":
    case "auto":
      return { temperature: 0.5 }
    case "high":
    case "thinking":
      return { temperature: 0.7 }
    case "xhigh":
      return { temperature: 0.85 }
    case "max":
      return { temperature: 1.0 }
    default:
      return NEUTRAL
  }
}

function atLeastHigh(variant: Variant): Variant {
  switch (variant) {
    case "none":
    case "minimal":
    case "low":
    case "medium":
    case "auto":
      return "high"
    default:
      return variant
  }
}

function glmVariant(variant: Variant, respectExplicit = false): VariantEffect {
  switch (variant) {
    case "none":
      return NEUTRAL
    case "minimal":
      return { reasoningEffort: "minimal" }
    case "low":
      return { reasoningEffort: respectExplicit ? "low" : "high", thinking: { type: "enabled" } }
    case "medium":
      return { reasoningEffort: respectExplicit ? "medium" : "high", thinking: { type: "enabled" } }
    case "auto":
    case "high":
    case "thinking":
      return { reasoningEffort: "high", thinking: { type: "enabled" } }
    case "xhigh":
      return { reasoningEffort: respectExplicit ? "xhigh" : "max", thinking: { type: "enabled" } }
    case "max":
      return { reasoningEffort: "max", thinking: { type: "enabled" } }
    default:
      return NEUTRAL
  }
}

function deepSeekVariant(variant: Variant, respectExplicit = false): VariantEffect {
  switch (variant) {
    case "none":
      return NEUTRAL
    case "minimal":
      return { reasoningEffort: respectExplicit ? "minimal" : "high" }
    case "low":
      return { reasoningEffort: respectExplicit ? "low" : "high" }
    case "medium":
      return { reasoningEffort: respectExplicit ? "medium" : "high" }
    case "auto":
    case "high":
    case "thinking":
      return { reasoningEffort: "high" }
    case "xhigh":
      return { reasoningEffort: respectExplicit ? "xhigh" : "max" }
    case "max":
      return { reasoningEffort: "max" }
    default:
      return NEUTRAL
  }
}

export function normalizeVariantForModel(opts: {
  family: ModelFamily
  modelID: string
  variant: Variant
}): Variant {
  const { family, modelID, variant } = opts
  if ((family === "gpt" || family === "codex") && !isMiniModel(modelID)) {
    if (family === "gpt" && variant === "minimal" && (isGpt6SolModel(modelID) || isGpt6LunaModel(modelID) || isGpt6AstraModel(modelID))) {
      return "low"
    }
    if (variant === "max" && !supportsNativeGptMaxReasoning(modelID)) return "xhigh"
    return atLeastHigh(variant)
  }
  if (family === "claude-opus-47-plus" || family === "glm" || family === "deepseek") {
    return atLeastHigh(variant)
  }
  return variant
}

/** Normalize canonical reasoning through the legacy model-family variant rules. */
export function normalizeReasoningForModel(opts: {
  family: ModelFamily
  modelID: string
  reasoning: Reasoning
}): Reasoning {
  const { family, modelID, reasoning } = opts
  if (reasoning === "auto") return reasoning

  if (reasoning === "off") {
    if (family === "gpt" || family === "codex") {
      if (isGpt6SolModel(modelID) || isGpt6LunaModel(modelID)) return "off"
      if (isGpt6AstraModel(modelID)) return "low"
    }
    const normalized = normalizeVariantForModel({ family, modelID, variant: "none" })
    return normalized === "none" ? "off" : variantToReasoningLevel(normalized) ?? reasoning
  }

  const variant = reasoningToVariant(reasoning)
  if (!variant) return reasoning
  const normalized = normalizeVariantForModel({ family, modelID, variant })
  return variantToReasoningLevel(normalized) ?? reasoning
}

/** Translate canonical reasoning without changing legacy variant semantics. */
export function translateReasoning(
  family: ModelFamily,
  reasoning: Reasoning,
  opts?: { modelID?: string; respectExplicit?: boolean },
): VariantEffect {
  const effectiveReasoning = opts?.modelID && !opts.respectExplicit
    ? normalizeReasoningForModel({ family, modelID: opts.modelID, reasoning })
    : reasoning

  if (effectiveReasoning === "auto") return NEUTRAL

  if (effectiveReasoning === "off") {
    switch (family) {
      case "gpt":
      case "codex":
      case "deepseek":
        return { reasoningEffort: "none" }
      case "claude":
        return { thinking: { type: "disabled" } }
      case "gemini":
      case "glm":
        return { reasoningEffort: "none", thinking: { type: "disabled" } }
      case "claude-opus-47-plus":
      case "kimi":
      case "kimi-k27":
      case "minimax":
      case "unknown":
      default:
        return NEUTRAL
    }
  }

  const variant = reasoningToVariant(effectiveReasoning)
  if (!variant) return NEUTRAL
  return translateVariant(family, variant, { ...opts, respectExplicit: true })
}

export function translateVariant(
  family: ModelFamily,
  variant: Variant,
  opts?: { modelID?: string; respectExplicit?: boolean },
): VariantEffect {
  const effectiveVariant = opts?.modelID && !opts.respectExplicit
    ? normalizeVariantForModel({ family, modelID: opts.modelID, variant })
    : variant
  switch (family) {
    case "gpt":
    case "codex":
      return gptVariant(effectiveVariant, opts?.modelID)
    case "claude-opus-47-plus":
      return NEUTRAL
    case "claude":
      return claudeVariant(effectiveVariant)
    case "gemini":
      return geminiVariant(effectiveVariant)
    case "glm":
      return glmVariant(effectiveVariant, opts?.respectExplicit)
    case "deepseek":
      return deepSeekVariant(effectiveVariant, opts?.respectExplicit)
    case "kimi":
    case "kimi-k27":
    case "minimax":
    case "unknown":
    default:
      return genericVariant(effectiveVariant)
  }
}
