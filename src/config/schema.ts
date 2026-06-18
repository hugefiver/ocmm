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

export function defaultConfig(): OcmmConfig {
  return OcmmConfigSchema.parse({})
}
