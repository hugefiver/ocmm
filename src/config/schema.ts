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

export const OcmmConfigSchema = z
  .object({
    categories: z.record(z.string(), CategoryEntrySchema).optional(),
    agents: z.record(z.string(), AgentEntrySchema).optional(),
    disabledAgents: z.array(z.string()).optional(),
    fallbackModels: z.array(z.string()).optional(),
    systemDefaultModel: z.string().optional(),
    intent: z
      .object({
        enabled: z.boolean().default(true),
        skipAgents: z.array(z.string()).default([]),
      })
      .default({ enabled: true, skipAgents: [] }),
    runtimeFallback: RuntimeFallbackConfigSchema,
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

export function defaultConfig(): OcmmConfig {
  return OcmmConfigSchema.parse({})
}
