import { z } from "zod"

const VariantEnum = z.enum([
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

export const FallbackEntrySchema = z.object({
  providers: z.array(z.string().min(1)).min(1),
  model: z.string().min(1),
  variant: VariantEnum.optional(),
  reasoningEffort: z.string().optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
  thinking: z
    .object({
      type: z.enum(["enabled", "disabled"]),
      budgetTokens: z.number().int().positive().optional(),
    })
    .optional(),
})

export const ModelRequirementSchema = z.object({
  fallbackChain: z.array(FallbackEntrySchema).min(1),
  variant: VariantEnum.optional(),
  requiresModel: z.string().optional(),
  requiresAnyModel: z.boolean().optional(),
  requiresProvider: z.array(z.string()).optional(),
})

const ModelStringOrEntrySchema = z.union([z.string().min(1), FallbackEntrySchema])

const ShorthandFields = {
  description: z.string().optional(),
  variant: VariantEnum.optional(),
  model: z.string().optional(),
  fallbackModels: z.array(ModelStringOrEntrySchema).optional(),
  requirement: ModelRequirementSchema.optional(),
}

export const CategoryEntrySchema = z.object(ShorthandFields).strict()

export const AgentEntrySchema = z
  .object({
    ...ShorthandFields,
    disabled: z.boolean().optional(),
  })
  .strict()

/**
 * Reactive runtime-fallback config.
 *
 * Fires on `session.error`: if the error is retryable (matching status codes
 * or patterns), we pick the next model from the agent/category fallback chain
 * and re-dispatch the prompt via `ctx.client.session.prompt`.
 *
 * `dispatch: false` makes the hook observe-only (classify + log, no retry).
 */
export const RuntimeFallbackConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** When false, only classify + log; never call ctx.client.session.prompt. */
    dispatch: z.boolean().default(true),
    /** Max retries per session before giving up. */
    maxAttempts: z.number().int().positive().default(3),
    /** Per-model cooldown window in seconds. */
    cooldownSeconds: z.number().int().positive().default(60),
    /** HTTP status codes that trigger a retry. */
    retryOnStatusCodes: z
      .array(z.number().int())
      .default([429, 500, 502, 503, 504]),
    /** Regex patterns matched against the error message; match => retryable. */
    retryOnPatterns: z
      .array(z.string())
      .default([
        "rate limit",
        "overloaded",
        "temporarily unavailable",
        "service unavailable",
        "internal server error",
        "gateway timeout",
        "bad gateway",
        "capacity",
        "try again",
      ]),
  })
  .default({})

/**
 * A profile is a partial config overlay. It may carry any top-level field
 * EXCEPT `profiles` and `activeProfile` themselves (nested profiles are not
 * allowed — keeps the model flat and avoids recursion ambiguity).
 *
 * At load time, after merging user + project configs, the active profile (if
 * any) is deep-merged over the result. Profile wins over both user and project.
 */
export const ProfileEntrySchema = z
  .object({
    categories: z.record(z.string(), CategoryEntrySchema).optional(),
    agents: z.record(z.string(), AgentEntrySchema).optional(),
    disabledAgents: z.array(z.string()).optional(),
    fallbackModels: z.array(z.string()).optional(),
    systemDefaultModel: z.string().optional(),
    intent: z
      .object({
        enabled: z.boolean().optional(),
        skipAgents: z.array(z.string()).optional(),
      })
      .optional(),
    // Partial form of RuntimeFallbackConfig — only specified fields override.
    // We avoid .default({}) here so a profile that omits runtimeFallback
    // doesn't inject defaults that would clobber the base config on merge.
    runtimeFallback: z
      .object({
        enabled: z.boolean().optional(),
        dispatch: z.boolean().optional(),
        maxAttempts: z.number().int().positive().optional(),
        cooldownSeconds: z.number().int().positive().optional(),
        retryOnStatusCodes: z.array(z.number().int()).optional(),
        retryOnPatterns: z.array(z.string()).optional(),
      })
      .optional(),
    registerBuiltinAgents: z.boolean().optional(),
    promptsRoot: z.string().optional(),
    debug: z.boolean().optional(),
  })
  .strict()

export const OcmmConfigSchema = z
  .object({
    categories: z.record(z.string(), CategoryEntrySchema).optional(),
    agents: z.record(z.string(), AgentEntrySchema).optional(),
    disabledAgents: z.array(z.string()).optional(),
    fallbackModels: z.array(z.string()).optional(),
    systemDefaultModel: z.string().optional(),
    /** 'v1' enables the superpowers 5-phase chain; 'omo' uses upstream omo prompts. */
    workflow: z.enum(["omo", "v1"]).default("omo"),
    intent: z
      .object({
        enabled: z.boolean().default(true),
        skipAgents: z.array(z.string()).default([]),
      })
      .default({ enabled: true, skipAgents: [] }),
    runtimeFallback: RuntimeFallbackConfigSchema,
    /** Named partial overlays selectable via `activeProfile` or OCMM_PROFILE. */
    profiles: z.record(z.string(), ProfileEntrySchema).default({}),
    /**
     * Name of the profile to apply at load time. Overridden by the OCMM_PROFILE
     * env var when set. If the named profile doesn't exist, it is silently
     * ignored (the base config loads unchanged).
     */
    activeProfile: z.string().optional(),
    registerBuiltinAgents: z.boolean().default(true),
    promptsRoot: z.string().optional(),
    debug: z.boolean().default(false),
  })
  .strict()

export type OcmmConfig = z.infer<typeof OcmmConfigSchema>
export type AgentEntry = z.infer<typeof AgentEntrySchema>
export type CategoryEntry = z.infer<typeof CategoryEntrySchema>
export type FallbackEntryConfig = z.infer<typeof FallbackEntrySchema>
export type ModelRequirementConfig = z.infer<typeof ModelRequirementSchema>
export type RuntimeFallbackConfig = z.infer<typeof RuntimeFallbackConfigSchema>
export type ProfileEntry = z.infer<typeof ProfileEntrySchema>

export function defaultConfig(): OcmmConfig {
  return OcmmConfigSchema.parse({})
}
