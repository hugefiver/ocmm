/**
 * Shared types for ocmm.
 *
 * The model-routing data model intentionally mirrors the upstream
 * FallbackEntry/ModelRequirement concepts, so configs stay portable.
 */

export type ThinkingMode = "enabled" | "disabled"

/** Reasoning intensity / variant a model entry asks for. */
export type Variant =
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "minimal"
  | "none"
  | "auto"
  | "thinking"

export const KNOWN_VARIANTS: ReadonlySet<Variant> = new Set<Variant>([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "minimal",
  "none",
  "auto",
  "thinking",
])

/**
 * One concrete fallback layer: provider candidates + model id, with optional inference knobs.
 * Compatible with the upstream FallbackEntry shape.
 */
export type FallbackEntry = {
  /** Acceptable provider IDs in priority order (e.g. ["github-copilot", "openai"]). */
  providers: string[]
  /** The model id (without provider prefix). */
  model: string
  /** Effort/intensity tier; translated to provider-specific params. */
  variant?: Variant
  /** Direct override for OpenAI-style reasoning effort if you need to bypass the variant table. */
  reasoningEffort?: string
  /** Inference knobs. */
  temperature?: number
  topP?: number
  maxTokens?: number
  /** Anthropic-style extended thinking configuration. */
  thinking?: {
    type: ThinkingMode
    budgetTokens?: number
  }
}

/** Per-agent or per-category requirement: chain of fallbacks plus selection guards. */
export type ModelRequirement = {
  fallbackChain: FallbackEntry[]
  /** Default variant if a fallback entry doesn't set one. */
  variant?: Variant
  /** When set, only an exact match is acceptable (no fuzzy fallback). */
  requiresModel?: string
  /** When true, any model from the connected providers is acceptable. */
  requiresAnyModel?: boolean
  /** Restrict eligible providers (subset of provider IDs). */
  requiresProvider?: string[]
}

/** Lightweight category descriptor used for documentation + delegate-task hints. */
export type Category = {
  name: string
  description: string
  requirement: ModelRequirement
}

export type Agent = {
  name: string
  /** Free-text role description (used in registered agent prompts). */
  description?: string
  requirement: ModelRequirement
  /** When set, load the prompt from this agent name instead of `name`. */
  promptSource?: string
  /** When set, inject `alias = defaultAlias` if the user config has no model config and no alias. */
  defaultAlias?: string
}

/** A trace entry recorded each time we select / adjust a model for a chat call. */
export type ResolutionEntry = {
  ts: number
  sessionID: string
  agent: string
  /** What we received from OpenCode. */
  input: { providerID: string; modelID: string; variant?: string }
  /** What we ended up applying to output (variant + flat option keys). */
  applied: {
    variant?: Variant
    reasoningEffort?: string
    thinking?: { type: ThinkingMode; budgetTokens?: number }
    temperature?: number
    topP?: number
    maxOutputTokens?: number
  }
  /** Why we chose this entry (used in logs). */
  source: ResolutionSource
}

export type ResolutionSource =
  | "user-config"
  | "agent-default"
  | "category-default"
  | "input-variant"
  | "host-profile-floor"
  | "no-op"
