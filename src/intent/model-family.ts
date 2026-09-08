/**
 * Model-family detectors.
 *
 * Pure functions; no I/O. Mirrors the upstream model-family detector rules
 * used by OpenCode plugins for variant routing decisions.
 */

const DOTTED_VENDOR_MODEL_PREFIXES: Record<string, RegExp> = {
  openai: /^(?:gpt-|o\d|chatgpt-|codex-)/,
  anthropic: /^claude-/,
  google: /^gemini-/,
  zhipu: /^glm-/,
  deepseek: /^deepseek-/,
}

function stripDottedVendorModelPrefix(name: string): string {
  const parts = name.split(".")
  const directVendor = parts[0]?.toLowerCase()
  const directModelStart = parts.slice(1).join(".")
  const directPattern = directVendor ? DOTTED_VENDOR_MODEL_PREFIXES[directVendor] : undefined
  if (directPattern?.test(directModelStart.toLowerCase())) return directModelStart

  const region = parts[0]?.toLowerCase()
  const regionalVendor = parts[1]?.toLowerCase()
  const regionalModelStart = parts.slice(2).join(".")
  const regionalPattern = regionalVendor ? DOTTED_VENDOR_MODEL_PREFIXES[regionalVendor] : undefined
  if (/^(?:[a-z]{2}|[a-z]{2}-[a-z]+-\d+)$/.test(region ?? "") && regionalPattern?.test(regionalModelStart.toLowerCase())) {
    return regionalModelStart
  }
  return name
}

/** Strip the leading "providerId/" and known dotted vendor namespace if present. */
export function extractModelName(fullId: string): string {
  const idx = fullId.lastIndexOf("/")
  const name = idx >= 0 ? fullId.slice(idx + 1) : fullId
  return stripDottedVendorModelPrefix(name)
}

export function isGptModel(modelID: string): boolean {
  return modelID.toLowerCase().includes("gpt")
}

export function parseGptVersion(modelID: string): [number, number, number] | null {
  const name = extractModelName(modelID).toLowerCase()
  const match = name.match(/^gpt-(\d+)(?:[-_.](\d+))?(?:[-_.](\d+))?(?:$|[-_.])/)
  if (!match) return null
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

export function supportsNativeGptMaxReasoning(modelID: string): boolean {
  const version = parseGptVersion(modelID)
  if (version === null) return false
  return (version[0] === 5 && version[1] >= 6) || version[0] >= 6
}

/** Exact GPT-6 Astra family, including provider prefixes and suffixed aliases such as -fast. */
export function isGpt6AstraModel(modelID: string): boolean {
  return /^gpt-6-astra(?:$|[-_.])/.test(extractModelName(modelID).toLowerCase())
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

export function isClaudeOpus5Model(modelID: string): boolean {
  const name = extractModelName(modelID)
  return /^claude-opus-5(?:$|[-.](?:20\d{6}(?:[-.][a-z0-9]+)*|[a-z][a-z0-9-]*))$/i.test(name)
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
  if (isClaudeOpus5Model(name) || isClaudeOpus47OrLaterModel(name)) return "claude-opus-47-plus"
  if (isClaudeModel(name)) return "claude"
  if (isGeminiModel(modelID, providerID)) return "gemini"
  if (isKimiK27Model(name)) return "kimi-k27"
  if (isKimiK2Model(name)) return "kimi"
  if (isMiniMaxModel(name)) return "minimax"
  if (isGlmModel(name)) return "glm"
  if (isDeepSeekModel(name, providerID)) return "deepseek"
  return "unknown"
}
