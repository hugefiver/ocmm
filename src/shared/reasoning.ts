import type { Reasoning, ReasoningLevel, Variant } from "./types.ts"

export const REASONING_VALUES = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto"] as const satisfies readonly Reasoning[]

export const REASONING_INPUT_VALUES = [...REASONING_VALUES, "none"] as const

export type ReasoningInput = (typeof REASONING_INPUT_VALUES)[number]

const REASONING_SET: ReadonlySet<Reasoning> = new Set(REASONING_VALUES)

export function normalizeReasoning(value: ReasoningInput | undefined): Reasoning | undefined {
  return value === "none" ? "off" : value
}

export function splitReasoningSuffix(
  modelRef: string,
  options?: { providerContext?: boolean },
): { model: string; reasoning?: Reasoning } {
  const suffixStart = modelRef.lastIndexOf(":")
  if (suffixStart <= 0 || suffixStart === modelRef.length - 1) return { model: modelRef }

  const suffix = modelRef.slice(suffixStart + 1)
  if (!REASONING_SET.has(suffix as Reasoning)) return { model: modelRef }

  const hasProviderContext = options?.providerContext === true || modelRef.slice(0, suffixStart).includes("/")
  if (suffix === "max" && !hasProviderContext) return { model: modelRef }

  return { model: modelRef.slice(0, suffixStart), reasoning: suffix as Reasoning }
}

export function reasoningToVariant(reasoning: Reasoning): Variant | undefined {
  switch (reasoning) {
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
    case "max":
      return reasoning
    case "off":
    case "auto":
      return undefined
  }
}

export function variantToReasoningLevel(variant: Variant): ReasoningLevel | undefined {
  switch (variant) {
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
    case "max":
      return variant
    case "none":
    case "auto":
    case "thinking":
      return undefined
  }
}
