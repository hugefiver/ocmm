/**
 * Loads markdown prompts from disk at plugin startup.
 *
 * Layout under <pluginRoot>/prompts/<workflow>/:
 *     deepwork/{default,gpt,gpt-5.6,gpt-6-astra,claude-opus-5,gemini,glm,codex,planner,kimi-k27,swe-2}.md
 *     agents/{orchestrator,reviewer,planner,clarifier,plan-critic}.md
 *     category/{frontend,creative,hard-reasoning,research,quick,coding,normal-task,complex,deep,documenting,cross-cutting}.md
 *
 * The `workflow` parameter ('v1' | 'codex') selects the subdirectory.
 * Synchronous, runs once at plugin init, caches in memory. Missing files are
 * tolerated (skipped with a debug log).
 *
 * `cross-cutting` is an opt-in category: its prompt is loaded but the category
 * is only registered when the user explicitly names it in config.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isPlannerAgent } from "./detectors.ts"
import { classifyModelFamily, isClaudeOpus5Model, isGpt6AstraModel, isGpt6SolModel, isKimiK2CodePromptModel, isSwe2Model, parseGptVersion, type ModelFamily } from "./model-family.ts"
import { log } from "../shared/logger.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PROMPTS_ROOT = join(HERE, "..", "..", "prompts")

export type Workflow = "v1" | "codex"

type DeepworkVariant = "default" | "gpt" | "gpt-5.6" | "gpt-6-astra" | "claude-opus-5" | "gemini" | "glm" | "codex" | "planner" | ModelCalibrationVariant
export type ModelCalibrationVariant = "kimi-k27" | "swe-2"
type AgentPromptName = "orchestrator" | "reviewer" | "planner" | "clarifier" | "plan-critic"
type CategoryName =
  | "frontend"
  | "creative"
  | "hard-reasoning"
  | "research"
  | "quick"
  | "coding"
  | "normal-task"
  | "complex"
  | "deep"
  | "documenting"
  | "cross-cutting"

const DEEPWORK_VARIANTS: DeepworkVariant[] = ["default", "gpt", "gpt-5.6", "gpt-6-astra", "claude-opus-5", "gemini", "glm", "codex", "planner", "kimi-k27", "swe-2"]
const AGENT_PROMPT_NAMES: AgentPromptName[] = ["orchestrator", "reviewer", "planner", "clarifier", "plan-critic"]
const CATEGORY_NAMES: CategoryName[] = [
  "frontend",
  "creative",
  "hard-reasoning",
  "research",
  "quick",
  "coding",
  "normal-task",
  "complex",
  "deep",
  "documenting",
  "cross-cutting",
]

const deepworkPrompts = new Map<DeepworkVariant, string>()
const agentPrompts = new Map<string, string>()
const categoryPrompts = new Map<string, string>()
const categoryModelCalibrations = new Map<string, Map<string, string>>()
let shellSafetyPrompt = ""

function loadFile(absPath: string): string | null {
  try {
    return readFileSync(absPath, "utf8")
  } catch {
    return null
  }
}

export function loadAllPrompts(
  rootDir: string = DEFAULT_PROMPTS_ROOT,
  workflow: Workflow = "v1",
): void {
  deepworkPrompts.clear()
  agentPrompts.clear()
  categoryPrompts.clear()
  categoryModelCalibrations.clear()
  shellSafetyPrompt = loadFile(join(rootDir, "shared", "shell-safety.md")) ?? ""
  const base = join(rootDir, workflow)
  for (const v of DEEPWORK_VARIANTS) {
    const text = loadFile(join(base, "deepwork", `${v}.md`))
    if (text == null) {
      log.debug(`prompt missing: ${workflow}/deepwork/${v}.md (root=${rootDir})`)
    } else {
      deepworkPrompts.set(v, text)
    }
  }
  for (const name of CATEGORY_NAMES) {
    const text = loadFile(join(base, "category", `${name}.md`))
    if (text == null) {
      log.debug(`prompt missing: ${workflow}/category/${name}.md (root=${rootDir})`)
    } else {
      const parsed = splitCategoryPrompt(text)
      categoryPrompts.set(name, parsed.base)
      if (parsed.calibrations.size > 0) categoryModelCalibrations.set(name, parsed.calibrations)
    }
  }
  for (const name of AGENT_PROMPT_NAMES) {
    const text = loadFile(join(base, "agents", `${name}.md`))
    if (text == null) {
      log.debug(`prompt missing: ${workflow}/agents/${name}.md (root=${rootDir})`)
    } else {
      agentPrompts.set(name, text)
    }
  }
  log.info(
    `loaded prompts: workflow=${workflow} deepwork=${deepworkPrompts.size}/${DEEPWORK_VARIANTS.length}, ` +
      `agents=${agentPrompts.size}/${AGENT_PROMPT_NAMES.length}, ` +
      `category=${categoryPrompts.size}/${CATEGORY_NAMES.length}`,
  )
}

/**
 * Config-time variant selection based on agent name + final selected model.
 * Unlike the old runtime `pickDeepworkVariant`, this uses the resolved model
 * after explicit user configuration, alias inheritance, and catalog upgrades.
 */
export function pickDeepworkVariantForAgent(opts: {
  agentName: string
  preferenceModel: string
}): DeepworkVariant {
  if (isPlannerAgent(opts.agentName)) return "planner"
  if (opts.agentName === "orchestrator" && isClaudeOpus5Model(opts.preferenceModel)) {
    return "claude-opus-5"
  }
  if (isGpt56Model(opts.preferenceModel) || isGpt6SolModel(opts.preferenceModel)) return "gpt-5.6"
  if (isGpt6AstraModel(opts.preferenceModel)) return "gpt-6-astra"
  const family = classifyModelFamily({
    providerID: "",
    modelID: opts.preferenceModel,
  })
  if (family === "codex") return "codex"
  if (family === "gpt") return "gpt"
  if (family === "gemini") return "gemini"
  if (family === "glm") return "glm"
  return "default"
}

/** GPT-5.6 family, including Sol, Terra, Luna, and provider-versioned aliases. */
export function isGpt56Model(modelID: string): boolean {
  const version = parseGptVersion(modelID)
  return version !== null && version[0] === 5 && version[1] === 6
}

/** Exact GPT-6 Astra family, including provider-prefixed and suffixed aliases. */
export function isGpt6Model(modelID: string): boolean {
  return isGpt6AstraModel(modelID)
}

/** Additive model calibrations, kept independent from reasoning-family classification. */
export function pickModelCalibrationVariants(
  modelID: string,
  carryAhead = false,
): ModelCalibrationVariant[] {
  if (carryAhead) return ["kimi-k27", "swe-2"]
  if (isKimiK2CodePromptModel(modelID)) return ["kimi-k27"]
  if (isSwe2Model(modelID)) return ["swe-2"]
  return []
}

export function getDeepworkPrompt(variant: DeepworkVariant): string {
  return deepworkPrompts.get(variant) ?? ""
}
export function getAgentPrompt(name: string): string {
  return agentPrompts.get(name) ?? ""
}
export function getCategoryPrompt(name: string): string {
  return categoryPrompts.get(name) ?? ""
}

export function getCategoryModelCalibration(
  name: string,
  modelID: string,
  carryAhead = false,
): string {
  const calibration = categoryModelCalibrations.get(name)?.get("gpt-6-astra") ?? ""
  return carryAhead || isGpt6AstraModel(modelID) ? calibration : ""
}

export function getShellSafetyPrompt(): string {
  return shellSafetyPrompt
}

export const _internals = { classifyModelFamily } as {
  classifyModelFamily: (o: { providerID?: string; modelID: string }) => ModelFamily
}

function splitCategoryPrompt(text: string): { base: string; calibrations: Map<string, string> } {
  const calibrations = new Map<string, string>()
  const base = text.replace(
    /\r?\n?<model-calibration model="([^"]+)">\r?\n([\s\S]*?)\r?\n<\/model-calibration>\r?\n?/g,
    (_block, model: string, calibration: string) => {
      calibrations.set(model, calibration.trim())
      return "\n"
    },
  ).trimEnd()
  return { base, calibrations }
}
