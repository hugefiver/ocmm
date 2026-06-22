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

const AgentOverrideFields = {
  tools: z.record(z.string(), z.boolean()).optional(),
  skills: z.array(z.string()).optional(),
  promptAppend: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().positive().optional(),
  thinking: z
    .object({
      type: z.enum(["enabled", "disabled"]),
      budgetTokens: z.number().int().positive().optional(),
    })
    .optional(),
  reasoningEffort: z
    .enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"])
    .optional(),
}

const FeatureGateArrayFields = {
  disabledHooks: z.array(z.string()).optional(),
  disabledTools: z.array(z.string()).optional(),
  disabledSkills: z.array(z.string()).optional(),
  disabledCommands: z.array(z.string()).optional(),
  disabledMcps: z.array(z.string()).optional(),
}

export const SkillSourceEntrySchema = z.union([
  z.string().min(1),
  z
    .object({
      path: z.string().min(1),
      recursive: z.boolean().default(true),
      glob: z.string().optional(),
    })
    .strict(),
])

export const SkillsConfigSchema = z
  .object({
    sources: z.array(SkillSourceEntrySchema).default([]),
    enable: z.array(z.string()).default([]),
    disable: z.array(z.string()).default([]),
  })
  .strict()
  .default({})

const ProfileSkillsConfigSchema = z
  .object({
    sources: z.array(SkillSourceEntrySchema).optional(),
    enable: z.array(z.string()).optional(),
    disable: z.array(z.string()).optional(),
  })
  .strict()

export const CategoryEntrySchema = z.object(ShorthandFields).strict()

export const AgentEntrySchema = z
  .object({
    ...ShorthandFields,
    ...AgentOverrideFields,
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
    ...FeatureGateArrayFields,
    skills: ProfileSkillsConfigSchema.optional(),
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

export const IsolationModeSchema = z.enum(["none", "inline", "config-file", "config-dir", "xdg"])

export const ShimConfigSchema = z
  .object({
    mode: IsolationModeSchema.default("none"),
    configDir: z.string().optional(),
    configFile: z.string().optional(),
    opencode: z.string().optional(),
    keepOmo: z.boolean().optional(),
    noProviders: z.boolean().optional(),
    noPlugins: z.boolean().optional(),
  })
  .strict()

export type IsolationMode = z.infer<typeof IsolationModeSchema>
export type ShimConfig = z.infer<typeof ShimConfigSchema>

export const OcmmConfigSchema = z
  .object({
    categories: z.record(z.string(), CategoryEntrySchema).optional(),
    agents: z.record(z.string(), AgentEntrySchema).optional(),
    disabledAgents: z.array(z.string()).optional(),
    ...FeatureGateArrayFields,
    skills: SkillsConfigSchema,
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
    /** Defaults for the `ocmm` shim binary. CLI flags override these. */
    shim: ShimConfigSchema.optional(),
  })
  .strict()

export type OcmmConfig = z.infer<typeof OcmmConfigSchema>
export type AgentEntry = z.infer<typeof AgentEntrySchema>
export type CategoryEntry = z.infer<typeof CategoryEntrySchema>
export type FallbackEntryConfig = z.infer<typeof FallbackEntrySchema>
export type ModelRequirementConfig = z.infer<typeof ModelRequirementSchema>
export type RuntimeFallbackConfig = z.infer<typeof RuntimeFallbackConfigSchema>
export type ProfileEntry = z.infer<typeof ProfileEntrySchema>
export type SkillSourceEntry = z.infer<typeof SkillSourceEntrySchema>
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>

export function defaultConfig(): OcmmConfig {
  return OcmmConfigSchema.parse({})
}
