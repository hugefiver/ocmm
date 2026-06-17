/**
 * Variant -> per-model-family inference parameters.
 *
 * Different providers express "reasoning intensity" differently:
 *   - OpenAI / GPT family : `options.reasoningEffort` ∈ {minimal, low, medium, high}
 *   - Anthropic Claude   : `options.thinking = { type, budgetTokens }`
 *   - Anthropic Opus 4.7+: extended thinking with larger budget for `max`/`xhigh`
 *   - Google Gemini      : same `reasoningEffort` style; thinking via `options.thinking`
 *   - Kimi / GLM / MiniMax / unknown : best-effort temperature-only translation
 *
 * The translator never overwrites concrete values that are already explicitly set
 * by the caller for non-variant fields. Variant fields (reasoningEffort/thinking)
 * are owned by us when a variant is chosen.
 */

import type { ModelFamily } from "../intent/model-family.ts"
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
 * minimal/none -> "minimal", low -> "low", medium -> "medium",
 * high/auto/thinking -> "high", xhigh/max -> "high" (OpenAI lacks an "xhigh" tier; we keep "high" but raise temperature).
 */
function gptVariant(variant: Variant): VariantEffect {
  switch (variant) {
    case "minimal":
    case "none":
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
    case "max":
      return { reasoningEffort: "high" }
    default:
      return NEUTRAL
  }
}

/**
 * Anthropic extended-thinking ladder.
 *
 * On Opus-4.7+ we lean into thinking budgets. On other Claude variants we
 * still emit a thinking block but with smaller budgets so callers can
 * decide whether to keep it.
 */
function claudeVariant(variant: Variant, opus47Plus: boolean): VariantEffect {
  const budget = (n: number) => ({
    thinking: { type: "enabled" as const, budgetTokens: n },
  })
  switch (variant) {
    case "minimal":
    case "none":
      return { thinking: { type: "disabled" } }
    case "low":
      return budget(opus47Plus ? 4_096 : 2_048)
    case "medium":
    case "auto":
      return budget(opus47Plus ? 12_288 : 6_144)
    case "high":
    case "thinking":
      return budget(opus47Plus ? 24_576 : 12_288)
    case "xhigh":
      return budget(opus47Plus ? 49_152 : 16_384)
    case "max":
      return budget(opus47Plus ? 65_536 : 24_576)
    default:
      return NEUTRAL
  }
}

/** Gemini reasoning is exposed via reasoningEffort + a coarse thinking flag. */
function geminiVariant(variant: Variant): VariantEffect {
  switch (variant) {
    case "minimal":
    case "none":
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
 * rough temperature shaping plus an effort hint that downstream providers may ignore.
 */
function genericVariant(variant: Variant): VariantEffect {
  switch (variant) {
    case "minimal":
    case "none":
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

export function translateVariant(family: ModelFamily, variant: Variant): VariantEffect {
  switch (family) {
    case "gpt":
      return gptVariant(variant)
    case "claude-opus-47-plus":
      return claudeVariant(variant, true)
    case "claude":
      return claudeVariant(variant, false)
    case "gemini":
      return geminiVariant(variant)
    case "kimi":
    case "kimi-k27":
    case "minimax":
    case "glm":
    case "unknown":
    default:
      return genericVariant(variant)
  }
}
