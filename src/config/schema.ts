/**
 * Zod schema for ocmm user config.
 *
 * Two JSON locations are supported (deep-merged, project wins):
 *     1. <pwd>/.opencode/ocmm.json[c]
 *     2. ~/.config/opencode/ocmm.json[c]   (or %APPDATA%\opencode\ocmm.json[c] on Windows)
 *
 * The schema mirrors the FallbackEntry / ModelRequirement types so users can
 * override any built-in agent or category by supplying matching keys.
 */

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

export const AgentEntrySchema = z.object({
  description: z.string().optional(),
  /** Provide either a full ModelRequirement or just a `model` shortcut. */
  requirement: ModelRequirementSchema.optional(),
  model: z.string().optional(),
  /** Disable the agent (don't register it via config hook). */
  disabled: z.boolean().optional(),
})

export const OcmmConfigSchema = z
  .object({
    /** Override or add categories (key = category name). */
    categories: z.record(z.string(), ModelRequirementSchema).optional(),
    /** Override or add agents (key = agent name). */
    agents: z.record(z.string(), AgentEntrySchema).optional(),
    /** Names of built-in agents to NOT register. */
    disabledAgents: z.array(z.string()).optional(),
    /** Plain list of fallback model strings ("provider/model"). */
    fallbackModels: z.array(z.string()).optional(),
    /** Hard system default (terminal fallback). */
    systemDefaultModel: z.string().optional(),
    /** Intent gate config. */
    intent: z
      .object({
        enabled: z.boolean().default(true),
        skipAgents: z.array(z.string()).default([]),
      })
      .default({ enabled: true, skipAgents: [] }),
    /** Whether the plugin should register its built-in agents. */
    registerBuiltinAgents: z.boolean().default(true),
    /** Override prompts dir. */
    promptsRoot: z.string().optional(),
    /** Verbose logging. */
    debug: z.boolean().default(false),
  })
  .strict()

export type OcmmConfig = z.infer<typeof OcmmConfigSchema>
export type AgentEntry = z.infer<typeof AgentEntrySchema>
export type FallbackEntryConfig = z.infer<typeof FallbackEntrySchema>
export type ModelRequirementConfig = z.infer<typeof ModelRequirementSchema>

/** Default returned when no config file is found. */
export function defaultConfig(): OcmmConfig {
  return OcmmConfigSchema.parse({})
}
