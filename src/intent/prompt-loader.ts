/**
 * Loads markdown prompts from disk at plugin startup.
 *
 * Layout under <pluginRoot>/prompts/<workflow>/:
 *     deepwork/{default,gpt,gemini,glm,codex,planner}.md
 *     agents/{orchestrator,reviewer,planner,clarifier,plan-critic}.md
 *     category/{frontend,creative,hard-reasoning,research,quick,coding,normal-task,complex,deep,documenting}.md
 *
 * The `workflow` parameter ('omo' | 'v1') selects the subdirectory.
 * Synchronous, runs once at plugin init, caches in memory. Missing files are
 * tolerated (skipped with a debug log).
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isPlannerAgent } from "./detectors.ts"
import { classifyModelFamily, type ModelFamily } from "./model-family.ts"
import { log } from "../shared/logger.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PROMPTS_ROOT = join(HERE, "..", "..", "prompts")

export type Workflow = "omo" | "v1"

type DeepworkVariant = "default" | "gpt" | "gemini" | "glm" | "codex" | "planner"
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

const DEEPWORK_VARIANTS: DeepworkVariant[] = ["default", "gpt", "gemini", "glm", "codex", "planner"]
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
]

const deepworkPrompts = new Map<DeepworkVariant, string>()
const agentPrompts = new Map<string, string>()
const categoryPrompts = new Map<string, string>()

function loadFile(absPath: string): string | null {
  try {
    return readFileSync(absPath, "utf8")
  } catch {
    return null
  }
}

export function loadAllPrompts(
  rootDir: string = DEFAULT_PROMPTS_ROOT,
  workflow: Workflow = "omo",
): void {
  deepworkPrompts.clear()
  agentPrompts.clear()
  categoryPrompts.clear()
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
      categoryPrompts.set(name, text)
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
 * Config-time variant selection based on agent name + declared preference model.
 * Unlike the old runtime `pickDeepworkVariant`, this does NOT inspect the
 * actual chat model — it uses the agent's fallbackChain[0].model.
 */
export function pickDeepworkVariantForAgent(opts: {
  agentName: string
  preferenceModel: string
}): DeepworkVariant {
  if (isPlannerAgent(opts.agentName)) return "planner"
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

export function getDeepworkPrompt(variant: DeepworkVariant): string {
  return deepworkPrompts.get(variant) ?? ""
}
export function getAgentPrompt(name: string): string {
  return agentPrompts.get(name) ?? ""
}
export function getCategoryPrompt(name: string): string {
  return categoryPrompts.get(name) ?? ""
}

export const _internals = { classifyModelFamily } as {
  classifyModelFamily: (o: { providerID?: string; modelID: string }) => ModelFamily
}
