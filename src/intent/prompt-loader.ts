/**
 * Loads markdown prompts from disk at plugin startup.
 *
 * Layout under <pluginRoot>/prompts/:
 *     ultrawork/{default,gpt,gemini,planner,codex}.md
 *     mode/{hyperplan,team}.md
 *
 * The loader is synchronous, runs once at module init, and caches the results
 * in memory. Missing files are tolerated (we just skip them and log a warn).
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isPlannerAgent } from "./detectors.ts"
import type { IntentType } from "./detectors.ts"
import { classifyModelFamily, type ModelFamily } from "./model-family.ts"
import { log } from "../shared/logger.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
/** Default location: ../../prompts (relative to dist/intent/). */
const DEFAULT_PROMPTS_ROOT = join(HERE, "..", "..", "prompts")

type UltraworkVariant = "default" | "gpt" | "gemini" | "planner" | "codex"
type ModeVariant = "hyperplan" | "team"

const ULTRAWORK_VARIANTS: UltraworkVariant[] = ["default", "gpt", "gemini", "planner", "codex"]
const MODE_VARIANTS: ModeVariant[] = ["hyperplan", "team"]

const ultraworkPrompts = new Map<UltraworkVariant, string>()
const modePrompts = new Map<ModeVariant, string>()

function loadFile(absPath: string): string | null {
  try {
    return readFileSync(absPath, "utf8")
  } catch {
    return null
  }
}

export function loadAllPrompts(rootDir = DEFAULT_PROMPTS_ROOT): void {
  for (const v of ULTRAWORK_VARIANTS) {
    const text = loadFile(join(rootDir, "ultrawork", `${v}.md`))
    if (text == null) {
      log.debug(`prompt missing: ultrawork/${v}.md (root=${rootDir})`)
    } else {
      ultraworkPrompts.set(v, text)
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
  log.info(
    `loaded prompts: ultrawork=${ultraworkPrompts.size}/${ULTRAWORK_VARIANTS.length}, ` +
      `mode=${modePrompts.size}/${MODE_VARIANTS.length}`,
  )
}

/** Pick the best ultrawork variant for the active agent + model. */
export function pickUltraworkVariant(opts: {
  agentName?: string | undefined
  providerID?: string | undefined
  modelID: string
}): UltraworkVariant {
  if (isPlannerAgent(opts.agentName ?? "")) return "planner"
  const family = classifyModelFamily({
    providerID: opts.providerID,
    modelID: opts.modelID,
  })
  if (family === "gpt") return "gpt"
  if (family === "gemini") return "gemini"
  return "default"
}

/** Lookup helpers. Return empty string when missing so callers can string-concat safely. */
export function getUltraworkPrompt(variant: UltraworkVariant): string {
  return ultraworkPrompts.get(variant) ?? ""
}
export function getModePrompt(variant: ModeVariant): string {
  return modePrompts.get(variant) ?? ""
}

/**
 * Compose the full system-prompt addition for a detected intent.
 * Returns "" when nothing is loaded — caller should noop.
 */
export function composeIntentPrompt(opts: {
  intent: IntentType
  agentName?: string | undefined
  providerID?: string | undefined
  modelID: string
}): string {
  const ultrawork = () =>
    getUltraworkPrompt(
      pickUltraworkVariant({
        agentName: opts.agentName,
        providerID: opts.providerID,
        modelID: opts.modelID,
      }),
    )
  switch (opts.intent) {
    case "ultrawork":
      return ultrawork()
    case "team":
      return getModePrompt("team")
    case "hyperplan":
      return getModePrompt("hyperplan")
    case "hyperplan-ultrawork": {
      const hp = getModePrompt("hyperplan")
      const uw = ultrawork()
      if (!hp && !uw) return ""
      if (!hp) return uw
      if (!uw) return hp
      return `${hp}\n\n---\n\n${uw}`
    }
    default:
      return ""
  }
}

/** Test helper: known classifier passthrough. */
export const _internals = { classifyModelFamily } as {
  classifyModelFamily: (o: { providerID?: string; modelID: string }) => ModelFamily
}
