/**
 * Loads markdown prompts from disk at plugin startup.
 *
 * Layout under <pluginRoot>/prompts/<workflow>/:
 *     deepwork/{default,gpt,claude,grok,deepseek,gemini,gemini-4,glm,codex,planner,kimi,kimi-k3-1,swe-2}.md
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
import { classifyModelFamily, recognizeModelName, isGemini4PromptModel, isKimiK31OrLaterPromptModel, isKimiPromptModel, type ModelFamily } from "./model-family.ts"
import { log } from "../shared/logger.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PROMPTS_ROOT = join(HERE, "..", "..", "prompts")

export type Workflow = "v1" | "codex"

type DeepworkVariant = "default" | "gemini" | "glm" | "codex" | "planner" | ModelCalibrationVariant
export type ModelCalibrationVariant = "gpt" | "claude" | "grok" | "deepseek" | "kimi" | "kimi-k3-1" | "gemini-4" | "swe-2"
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

const DEEPWORK_VARIANTS: DeepworkVariant[] = ["default", "gpt", "claude", "grok", "deepseek", "gemini", "gemini-4", "glm", "codex", "planner", "kimi", "kimi-k3-1", "swe-2"]
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
let avoidAiSlopPrompt = ""

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
  avoidAiSlopPrompt = loadFile(join(rootDir, "shared", "avoid-ai-slop.md")) ?? ""
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
  return pickModelBaseCalibrationVariant(opts.preferenceModel) ?? "default"
}

export function pickModelBaseCalibrationVariant(
  modelID: string,
): "codex" | "gpt" | "gemini" | "glm" | null {
  const model = recognizeModelName(modelID, true)
  const family = model?.codex ? "codex" : model?.kind
  if (family === "codex" || family === "gpt" || family === "gemini" || family === "glm") {
    return family
  }
  return null
}

/** Additive model calibrations, kept independent from reasoning-family classification. */
export function pickModelCalibrationVariants(
  modelID: string,
): ModelCalibrationVariant[] {
  const model = recognizeModelName(modelID, true)
  if (model?.kind === "claude") return ["claude"]
  if (model?.kind === "grok") return ["grok"]
  if (model?.kind === "deepseek") return ["deepseek"]
  if (model?.kind === "kimi") return [isKimiK31OrLaterPromptModel(modelID) ? "kimi-k3-1" : "kimi"]
  if (model?.kind === "gpt" || model?.codex) return ["gpt"]
  if (isGemini4PromptModel(modelID)) return ["gemini-4"]
  if (model?.swe2OrLater) return ["swe-2"]
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
): string {
  const calibrations = categoryModelCalibrations.get(name)
  const family = classifyModelFamily({ modelID })
  const model = recognizeModelName(modelID, true)
  const variant = model?.kind === "claude" ? "claude" : model?.kind === "grok" ? "unknown"
    : model?.kind === "swe-2" ? model.swe2OrLater ? "swe-2" : "unknown"
    : isKimiK31OrLaterPromptModel(modelID) ? "kimi-k3-1"
    : isKimiPromptModel(modelID) ? family === "kimi-k27" ? family : "kimi"
    : family === "codex" ? "gpt" : family
  return calibrations?.get(variant) ?? ""
}

export function getShellSafetyPrompt(): string {
  return shellSafetyPrompt
}

export function getAvoidAiSlopPrompt(): string {
  return avoidAiSlopPrompt
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
