/**
 * Loads markdown prompts from disk at plugin startup.
 *
 * Layout under <pluginRoot>/prompts/:
 *     deepwork/{default,gpt,gemini,planner,codex}.md
 *     mode/{superplan,team}.md
 *     category/{frontend,creative,hard-reasoning,research,quick,low-effort,high-effort,writing}.md
 *
 * Synchronous, runs once at plugin init, caches in memory. Missing files are
 * tolerated (skipped with a debug log).
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isPlannerAgent } from "./detectors.ts"
import type { IntentType } from "./detectors.ts"
import { classifyModelFamily, type ModelFamily } from "./model-family.ts"
import { log } from "../shared/logger.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PROMPTS_ROOT = join(HERE, "..", "..", "prompts")

type DeepworkVariant = "default" | "gpt" | "gemini" | "planner" | "codex"
type ModeVariant = "superplan" | "team"
type CategoryName =
  | "frontend"
  | "creative"
  | "hard-reasoning"
  | "research"
  | "quick"
  | "low-effort"
  | "high-effort"
  | "writing"

const DEEPWORK_VARIANTS: DeepworkVariant[] = ["default", "gpt", "gemini", "planner", "codex"]
const MODE_VARIANTS: ModeVariant[] = ["superplan", "team"]
const CATEGORY_NAMES: CategoryName[] = [
  "frontend",
  "creative",
  "hard-reasoning",
  "research",
  "quick",
  "low-effort",
  "high-effort",
  "writing",
]

const deepworkPrompts = new Map<DeepworkVariant, string>()
const modePrompts = new Map<ModeVariant, string>()
const categoryPrompts = new Map<string, string>()

function loadFile(absPath: string): string | null {
  try {
    return readFileSync(absPath, "utf8")
  } catch {
    return null
  }
}

export function loadAllPrompts(rootDir = DEFAULT_PROMPTS_ROOT): void {
  for (const v of DEEPWORK_VARIANTS) {
    const text = loadFile(join(rootDir, "deepwork", `${v}.md`))
    if (text == null) {
      log.debug(`prompt missing: deepwork/${v}.md (root=${rootDir})`)
    } else {
      deepworkPrompts.set(v, text)
    }
  }
  for (const v of MODE_VARIANTS) {
    const text = loadFile(join(rootDir, "mode", `${v}.md`))
    if (text == null) {
      log.debug(`prompt missing: mode/${v}.md (root=${rootDir})`)
    } else {
      modePrompts.set(v, text)
    }
  }
  for (const name of CATEGORY_NAMES) {
    const text = loadFile(join(rootDir, "category", `${name}.md`))
    if (text == null) {
      log.debug(`prompt missing: category/${name}.md (root=${rootDir})`)
    } else {
      categoryPrompts.set(name, text)
    }
  }
  log.info(
    `loaded prompts: deepwork=${deepworkPrompts.size}/${DEEPWORK_VARIANTS.length}, ` +
      `mode=${modePrompts.size}/${MODE_VARIANTS.length}, ` +
      `category=${categoryPrompts.size}/${CATEGORY_NAMES.length}`,
  )
}

export function pickDeepworkVariant(opts: {
  agentName?: string | undefined
  providerID?: string | undefined
  modelID: string
}): DeepworkVariant {
  if (isPlannerAgent(opts.agentName ?? "")) return "planner"
  const family = classifyModelFamily({
    providerID: opts.providerID,
    modelID: opts.modelID,
  })
  if (family === "gpt") return "gpt"
  if (family === "gemini") return "gemini"
  return "default"
}

export function getDeepworkPrompt(variant: DeepworkVariant): string {
  return deepworkPrompts.get(variant) ?? ""
}
export function getModePrompt(variant: ModeVariant): string {
  return modePrompts.get(variant) ?? ""
}
export function getCategoryPrompt(name: string): string {
  return categoryPrompts.get(name) ?? ""
}

export function composeIntentPrompt(opts: {
  intent: IntentType
  agentName?: string | undefined
  providerID?: string | undefined
  modelID: string
}): string {
  const deepwork = () => {
    const pickOpts: Parameters<typeof pickDeepworkVariant>[0] = { modelID: opts.modelID }
    if (opts.agentName !== undefined) pickOpts.agentName = opts.agentName
    if (opts.providerID !== undefined) pickOpts.providerID = opts.providerID
    return getDeepworkPrompt(pickDeepworkVariant(pickOpts))
  }
  switch (opts.intent) {
    case "deepwork":
      return deepwork()
    case "team":
      return getModePrompt("team")
    case "superplan":
      return getModePrompt("superplan")
    case "superplan-deepwork": {
      const sp = getModePrompt("superplan")
      const dw = deepwork()
      if (!sp && !dw) return ""
      if (!sp) return dw
      if (!dw) return sp
      return `${sp}\n\n---\n\n${dw}`
    }
    default:
      return ""
  }
}

export const _internals = { classifyModelFamily } as {
  classifyModelFamily: (o: { providerID?: string; modelID: string }) => ModelFamily
}
