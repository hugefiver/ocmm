/**
 * Model-family detectors.
 *
 * Pure name recognition shared by prompt, capability, and catalog routing.
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

type ModelKind = "gpt" | "codex" | "claude" | "grok" | "gemini" | "kimi" | "minimax" | "glm" | "deepseek" | "swe-2" | "o-series"
type Version = [number, number, number]

function isKimiK31OrLaterVersion(version: Version | null): boolean {
  return version !== null && (version[0] > 3 || (version[0] === 3 && version[1] >= 1))
}

type GptLane = "sol" | "terra" | "astra" | "luna"
type ClaudeSeries = "opus" | "sonnet" | "haiku" | "fable" | "mythos"

function seriesKind(series: string | undefined): "gpt" | "claude" | undefined {
  switch (series) {
    case "sol": case "terra": case "astra": case "luna": return "gpt"
    case "opus": case "sonnet": case "haiku": return "claude"
    default: return undefined
  }
}

/** Semantic facts for the first identifier in a complete model field, never a guessed route. */
export function recognizeModelName(modelID: string, promptAliases = false): {
  kind: ModelKind
  generation?: number
  version: Version | null
  versionParts: number
  lane?: GptLane
  series?: GptLane | ClaudeSeries
  codex: boolean
  mini: boolean
  opus: boolean
  fable: boolean
  fable52: boolean
  swe2OrLater: boolean
  kimiAlias?: number
  kimi27: boolean
} | null {
  const tokens: string[] = []
  const positions: number[] = []
  // Split only declared compact connections; arbitrary alphanumeric words stay intact.
  for (const match of modelID.toLowerCase().matchAll(/[^-_.\s/@:]+/g)) {
    let word = match[0]
    let position = match.index
    const kimiVersion = promptAliases ? word.match(/^k(\d+)(?:p(\d+))?$/) : null
    const legacyK27 = word === "k27" && tokens.at(-1) === "kimi"
    if (kimiVersion && Number(kimiVersion[1]) >= 3 && !legacyK27) {
      tokens.push("k", kimiVersion[1]!)
      positions.push(position, position + 1)
      if (kimiVersion[2] !== undefined) {
        tokens.push(kimiVersion[2])
        positions.push(position + 2 + kimiVersion[1]!.length)
      }
      continue
    }
    const prefix = word.match(/^(chatgpt|gpt|opus|sonnet|haiku|sol|terra|astra|luna)(?=\d)/)?.[0]
      ?? (promptAliases ? word.match(/^(grok|gemini|fable|mythos|swe)(?=\d)/)?.[0] : undefined)
    if (prefix) {
      tokens.push(prefix)
      positions.push(position)
      word = word.slice(prefix.length)
      position += prefix.length
    }
    const suffix = word.match(/^(\d+)(sol|terra|astra|luna|opus|sonnet|haiku)$/)
    if (suffix) {
      tokens.push(suffix[1]!, suffix[2]!)
      positions.push(position, position + suffix[1]!.length)
    } else {
      tokens.push(word)
      positions.push(position)
    }
  }
  function separator(index: number): string {
    return modelID.slice(positions[index - 1]! + tokens[index - 1]!.length, positions[index])
  }
  function connected(index: number): boolean {
    return index > 0 && index < tokens.length && !/[@:]/.test(separator(index))
  }
  function versionSuffix(token: string): boolean {
    return /^\d+[km]$|^(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(token)
  }
  function versionStartsAt(index: number): boolean {
    return connected(index) && /^\d/.test(tokens[index]!) && !versionSuffix(tokens[index]!)
  }
  function versionAt(index: number, kind?: ModelKind) {
    const numbers: number[] = []
    let end = index
    while (end < tokens.length && (end === index || connected(end))) {
      const token = tokens[end]!
      if (!/^\d+$/.test(token) || versionSuffix(token)) break
      numbers.push(Number(token))
      end += 1
    }
    const adjacentSeries = connected(end) && separator(end) === "" ? seriesKind(tokens[end]) : undefined
    const promptVersion = promptAliases && (kind === "claude" || kind === "gemini" || kind === "swe-2" || kind === undefined)
    const wildcard = promptVersion && connected(end) && separator(end) === "." && tokens[end]!.startsWith("x")
    const partial = (adjacentSeries !== undefined && kind !== undefined && adjacentSeries !== kind)
      || (connected(end) && separator(end) === "."
        && /^\d+[a-z]/.test(tokens[end]!) && !/^\d+[km]$/.test(tokens[end]!))
      || (promptVersion && versionStartsAt(end))
      || (wildcard && (kind !== "gemini" || numbers.length !== 1 || tokens[end] !== "x" || versionStartsAt(end + 1)))
    const version: Version | null = numbers.length > 0 && numbers.length <= 3 && !partial
      && (!promptVersion || numbers.every(Number.isSafeInteger))
      ? [numbers[0]!, numbers[1] ?? 0, numbers[2] ?? 0] : null
    return { version, generation: numbers[0], versionParts: numbers.length, end: partial ? end + 1 : end }
  }
  function kindAt(index: number): ModelKind | undefined {
    const token = tokens[index]
    const familyToken = token?.match(/^(chatgpt|gpt|codex|claude|grok|gemini|kimi|minimax|glm|deepseek)(?=\d)/)?.[1] ?? token
    switch (familyToken) {
      case "gpt": case "chatgpt": return "gpt"
      case "grok": return promptAliases ? "grok" : undefined
      case "codex": case "claude": case "gemini": case "kimi":
      case "minimax": case "glm": case "deepseek": return familyToken
      case "fable": return "claude"
      case "mythos": return promptAliases ? "claude" : undefined
      case "swe": return promptAliases || tokens[index + 1] === "2" ? "swe-2" : undefined
      case "k": return promptAliases && (index === 0 || separator(index).includes("/"))
        && connected(index + 1) && separator(index + 1) === ""
        && versionAt(index + 1).version !== null ? "kimi" : undefined
      case "k2": return /^p[5678]$/.test(tokens[index + 1] ?? "") ? "kimi" : undefined
      default:
        if (/^k2p[5678]$/.test(token ?? "")) return "kimi"
        if (/^o\d$/.test(token ?? "")) return "o-series"
        return undefined
    }
  }
  function identifierAt(index: number, scopeStart = 0) {
    const explicit = kindAt(index)
    const series = seriesKind(tokens[index])
    if (explicit || (series && versionStartsAt(index + 1))) {
      const kind = explicit ?? series!
      let versionStart = index + 1
      let localSeries = series ? tokens[index] : undefined
      if (promptAliases && kind === "kimi" && tokens[versionStart] === "k" && connected(versionStart)) {
        versionStart += 1
      }
      const fable = kind === "claude" && (tokens[index] === "fable" || tokens[index + 1] === "fable")
      const promptSeries = (token: string | undefined) => promptAliases && (token === "fable" || token === "mythos")
      if (promptSeries(tokens[index])) {
        localSeries = tokens[index]
      } else if (tokens[index] === "claude" && connected(versionStart) && promptSeries(tokens[versionStart])) {
        localSeries = tokens[versionStart++]
      } else if (explicit && connected(versionStart) && (seriesKind(tokens[versionStart]) === kind || tokens[versionStart] === "fable" && kind === "claude")) {
        localSeries = seriesKind(tokens[versionStart]) ? tokens[versionStart] : undefined
        versionStart += 1
      }
      // Legacy compact aliases outside GPT establish only their coarse family.
      const compact = /\d/.test(tokens[index]!)
      const parsed = connected(versionStart) && !compact ? versionAt(versionStart, kind)
        : { version: null, generation: undefined, versionParts: 0, end: versionStart }
      let coreEnd = Math.max(versionStart, parsed.end)
      if (!compact && parsed.end === versionStart && connected(versionStart) && /^\d/.test(tokens[versionStart]!)) coreEnd += 1
      if (!localSeries && parsed.version && seriesKind(tokens[coreEnd]) === kind && connected(coreEnd)
        && !versionStartsAt(coreEnd + 1)) {
        localSeries = tokens[coreEnd]
        coreEnd += 1
      }
      return { kind, ...parsed, coreEnd, series: localSeries, fable }
    }
    // A numeric-front identifier starts at the whole sequence, never a minor/patch tail.
    const numericContinuation = index > scopeStart && connected(index)
      && (/^\d/.test(tokens[index - 1]!) || separator(index) === "." && /\d$/.test(tokens[index - 1]!))
    if (/^\d+$/.test(tokens[index]!) && !numericContinuation) {
      const parsed = versionAt(index)
      const kind = seriesKind(tokens[parsed.end])
      if (parsed.version && kind && connected(parsed.end)) {
        return { kind, ...parsed, coreEnd: parsed.end + 1, series: tokens[parsed.end], fable: false }
      }
    }
    return undefined
  }
  let start = 0
  while (start < tokens.length && !identifierAt(start)) start += 1
  if (start === tokens.length) return null
  const identifier = identifierAt(start)!
  const { kind, version, versionParts, generation, series, fable } = identifier
  let end = tokens.length
  let codex = kind === "codex"
  for (let index = identifier.coreEnd; index < tokens.length; index += 1) {
    const next = identifierAt(index, identifier.coreEnd)
    // Codex qualifies GPT; other independent identifiers end the scope.
    if (kind === "gpt" && tokens[index] === "codex" && !codex) {
      codex = true
      continue
    }
    if (tokens[start] === "kimi" && next?.kind === "kimi" && index === start + 1 && tokens[index]?.startsWith("k2")) continue
    if (next !== undefined) {
      end = index
      break
    }
  }
  const attributes = tokens.slice(start + 1, end)
  const opus = series === "opus"
  const lane = kind === "gpt" && version !== null ? series as GptLane | undefined : undefined
  const alias = tokens[start] === "k2" ? tokens[start + 1] : tokens[start]
  const kimiAlias = kind === "kimi" && /^k2p[5678]$|^p[5678]$/.test(alias ?? "")
    ? Number(alias!.at(-1)) : undefined
  const kimi27 = kind === "kimi" && (kimiAlias === 7 || (tokens[start] === "kimi" && (
    attributes[0] === "k27" || attributes[0] === "k2p7"
    || (attributes[0] === "k2" && (attributes[1] === "p7" || attributes[1] === "7")))))
  return {
    kind, generation, version, versionParts, lane, series: series as GptLane | ClaudeSeries | undefined, codex,
    mini: attributes.includes("mini"), opus, fable, kimiAlias, kimi27,
    swe2OrLater: kind === "swe-2" && version !== null && version[0] >= 2,
    fable52: (series === "fable" || series === "mythos") && version !== null
      && (version[0] > 5 || (version[0] === 5 && version[1] >= 2)),
  }
}

export function isGptModel(modelID: string): boolean {
  return recognizeModelName(modelID)?.kind === "gpt"
}

export function parseGptVersion(modelID: string): [number, number, number] | null {
  const model = recognizeModelName(modelID)
  return model?.kind === "gpt" ? model.version : null
}

export function supportsNativeGptMaxReasoning(modelID: string): boolean {
  const version = parseGptVersion(modelID)
  if (version === null) return false
  return (version[0] === 5 && version[1] >= 6) || version[0] >= 6
}

/** Exact GPT-6 Astra family, including provider prefixes and suffixed aliases such as -fast. */
export function isGpt6AstraModel(modelID: string): boolean {
  const model = recognizeModelName(modelID)
  return model?.lane === "astra" && model.versionParts === 1 && model.version?.[0] === 6
}

/** Exact GPT-6 Luna family, including provider prefixes and suffixed aliases such as -fast. */
export function isGpt6LunaModel(modelID: string): boolean {
  const model = recognizeModelName(modelID)
  return model?.lane === "luna" && model.versionParts === 1 && model.version?.[0] === 6
}

/** Exact GPT-6 Sol family, including provider prefixes and suffixed aliases such as -fast. */
export function isGpt6SolModel(modelID: string): boolean {
  const model = recognizeModelName(modelID)
  return model?.lane === "sol" && model.versionParts === 1 && model.version?.[0] === 6
}

/** Sol 6.1+ exposes low through max, but not none/minimal reasoning effort. */
export function isGpt61OrLaterSolModel(modelID: string): boolean {
  const model = recognizeModelName(modelID)
  const version = model?.version
  return model?.lane === "sol" && version != null && (version[0] > 6 || (version[0] === 6 && version[1] >= 1))
}

export function isCodexModel(modelID: string, providerID?: string): boolean {
  const model = recognizeModelName(modelID)
  return model ? model.codex : (providerID?.toLowerCase().includes("codex") ?? false)
}

export function isMiniModel(modelID: string): boolean {
  return recognizeModelName(modelID)?.mini ?? false
}

export function isClaudeModel(modelID: string): boolean {
  return recognizeModelName(modelID)?.kind === "claude"
}

export function isClaudeOpus5Model(modelID: string): boolean {
  const model = recognizeModelName(modelID)
  return model?.opus === true && model.version?.[0] === 5
    && (model.versionParts === 1 || (model.versionParts === 2 && model.version[1] === 5))
}

export function isClaudeOpus47OrLaterModel(modelID: string): boolean {
  const model = recognizeModelName(modelID)
  if (model?.fable) return true
  const version = model?.version
  return model?.opus === true && version != null && (version[0] > 4 || (version[0] === 4 && version[1] >= 7))
}

export function isKimiK2Model(modelID: string): boolean {
  const model = recognizeModelName(modelID)
  return model?.kind === "kimi" && model.kimiAlias !== 8
}

export function isKimiK27Model(modelID: string): boolean {
  return recognizeModelName(modelID)?.kimi27 ?? false
}

/** Kimi prompt selection spans generations without changing effort-family routing. */
export function isKimiPromptModel(modelID: string): boolean {
  return recognizeModelName(modelID, true)?.kind === "kimi"
}

export function isKimiK31OrLaterPromptModel(modelID: string): boolean {
  const model = recognizeModelName(modelID, true)
  return model?.kind === "kimi" && isKimiK31OrLaterVersion(model.version)
}

/** Select the Gemini 4 calibration for this and later generations. */
export function isGemini4PromptModel(modelID: string): boolean {
  const model = recognizeModelName(modelID, true)
  return model?.kind === "gemini" && model.version !== null && model.version[0] >= 4
}

/** Devin SWE-2 effort lanes. This is a prompt match, not a Kimi reasoning family. */
export function isSwe2Model(modelID: string): boolean {
  return recognizeModelName(modelID)?.kind === "swe-2"
}

export function isMiniMaxModel(modelID: string): boolean {
  return recognizeModelName(modelID)?.kind === "minimax"
}

export function isGlmModel(modelID: string): boolean {
  return recognizeModelName(modelID)?.kind === "glm"
}

export function isDeepSeekModel(modelID: string, providerID?: string): boolean {
  const model = recognizeModelName(modelID)
  return model ? model.kind === "deepseek" : (providerID?.toLowerCase().includes("deepseek") ?? false)
}

export function isGeminiModel(fullId: string, providerID?: string): boolean {
  const model = recognizeModelName(fullId)
  const provider = providerID?.toLowerCase()
  return model ? model.kind === "gemini" : provider === "google" || provider === "google-vertex"
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

/** Reasoning-family projection; provider hints apply only without a model identifier. */
export function classifyModelFamily(opts: {
  providerID?: string
  modelID: string
}): ModelFamily {
  const { providerID, modelID } = opts
  const model = recognizeModelName(modelID)
  if (model) {
    if (model.codex) return "codex"
    if (model.kind === "claude") return isClaudeOpus47OrLaterModel(modelID) ? "claude-opus-47-plus" : "claude"
    if (model.kind === "kimi") return model.kimi27 ? "kimi-k27" : model.kimiAlias === 8 ? "unknown" : "kimi"
    if (model.kind === "swe-2" || model.kind === "o-series" || model.kind === "grok") return "unknown"
    return model.kind
  }
  if (isCodexModel(modelID, providerID)) return "codex"
  if (isGeminiModel(modelID, providerID)) return "gemini"
  if (isDeepSeekModel(modelID, providerID)) return "deepseek"
  return "unknown"
}
