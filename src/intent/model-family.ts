/**
 * Model-family detectors.
 *
 * Pure functions; no I/O. Mirrors the upstream model-family detector rules
 * used by OpenCode plugins for variant routing decisions.
 */

/** Strip the leading "providerId/" if present. */
export function extractModelName(fullId: string): string {
  const idx = fullId.lastIndexOf("/")
  return idx >= 0 ? fullId.slice(idx + 1) : fullId
}

export function isGptModel(modelID: string): boolean {
  return modelID.toLowerCase().includes("gpt")
}

export function isCodexModel(modelID: string, providerID?: string): boolean {
  const lc = modelID.toLowerCase()
  const provider = providerID?.toLowerCase() ?? ""
  return lc.includes("codex") || provider.includes("codex")
}

export function isMiniModel(modelID: string): boolean {
  const name = extractModelName(modelID).toLowerCase()
  return /(^|[-_.])mini($|[-_.])/.test(name)
}

export function isClaudeModel(modelID: string): boolean {
  return modelID.toLowerCase().includes("claude")
}

export function isClaudeOpus47OrLaterModel(modelID: string): boolean {
  const lc = modelID.toLowerCase()
  if (lc.includes("claude-fable")) return true
  const m = lc.match(/claude-opus-(\d+)-(\d+)/)
  if (!m) return false
  const major = Number.parseInt(m[1] ?? "0", 10)
  const minor = Number.parseInt(m[2] ?? "0", 10)
  return major > 4 || (major === 4 && minor >= 7)
}

export function isKimiK2Model(modelID: string): boolean {
  const lc = modelID.toLowerCase()
  return lc.includes("kimi") || /k2[-.]?p[567]/.test(lc)
}

export function isKimiK27Model(modelID: string): boolean {
  const lc = modelID.toLowerCase()
  return /kimi-k2[.-]?7/.test(lc) || /k2[-.]?p7/.test(lc)
}

export function isMiniMaxModel(modelID: string): boolean {
  return modelID.toLowerCase().includes("minimax")
}

export function isGlmModel(modelID: string): boolean {
  return modelID.toLowerCase().includes("glm")
}

export function isDeepSeekModel(modelID: string, providerID?: string): boolean {
  const lc = modelID.toLowerCase()
  const provider = providerID?.toLowerCase() ?? ""
  return lc.includes("deepseek") || provider.includes("deepseek")
}

export function isGeminiModel(fullId: string, providerID?: string): boolean {
  const lc = fullId.toLowerCase()
  if (lc.startsWith("google/") || lc.startsWith("google-vertex/")) return true
  if (providerID === "google" || providerID === "google-vertex") return true
  if (
    providerID === "github-copilot"
    && extractModelName(fullId).toLowerCase().startsWith("gemini")
  ) {
    return true
  }
  return extractModelName(fullId).toLowerCase().startsWith("gemini-")
}

/** Family enum used by variant translator and deepwork prompt variant selection. */
export type ModelFamily =
  | "codex"
  | "gpt"
  | "claude-opus-47-plus"
  | "claude"
  | "gemini"
  | "kimi-k27"
  | "kimi"
  | "minimax"
  | "glm"
  | "deepseek"
  | "unknown"

/** Coarsest family classification, in priority order. */
export function classifyModelFamily(opts: {
  providerID?: string
  modelID: string
}): ModelFamily {
  const { providerID, modelID } = opts
  const name = extractModelName(modelID)
  if (isCodexModel(modelID, providerID) || isCodexModel(name, providerID)) return "codex"
  if (isGptModel(name)) return "gpt"
  if (isClaudeOpus47OrLaterModel(name)) return "claude-opus-47-plus"
  if (isClaudeModel(name)) return "claude"
  if (isGeminiModel(modelID, providerID)) return "gemini"
  if (isKimiK27Model(name)) return "kimi-k27"
  if (isKimiK2Model(name)) return "kimi"
  if (isMiniMaxModel(name)) return "minimax"
  if (isGlmModel(name)) return "glm"
  if (isDeepSeekModel(name, providerID)) return "deepseek"
  return "unknown"
}
