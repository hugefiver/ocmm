/**
 * Variant -> per-model-family inference parameters.
 *
 * Different providers express "reasoning intensity" differently:
 *   - OpenAI / GPT/Codex family : `options.reasoningEffort`; non-mini built-ins are never below high
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

import { isMiniModel, supportsNativeGptMaxReasoning, type ModelFamily } from "../intent/model-family.ts"
import type { ThinkingMode, Variant } from "../shared/types.ts"

export type VariantEffect = {
  reasoningEffort?: string
  thinking?: { type: ThinkingMode; budgetTokens?: number }
  temperature?: number
}

const NEUTRAL: VariantEffect = {}

/**
 * Map a variant to OpenAI-style reasoningEffort.
 *
 * Mini models keep the full ladder. Non-mini GPT/Codex built-ins normalize any
 * below-high or no-op request to high before this function is called.
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
    if (variant === "max" && !supportsNativeGptMaxReasoning(modelID)) return "xhigh"
    return atLeastHigh(variant)
  }
  if (family === "claude-opus-47-plus" || family === "glm" || family === "deepseek") {
    return atLeastHigh(variant)
  }
  return variant
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
