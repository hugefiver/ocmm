import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { homedir } from "node:os"

const PROJECT_RULE_SOURCES = [
  { source: "omo", dir: ".omo/rules", priority: 0, instructionsOnly: false },
  { source: "claude", dir: ".claude/rules", priority: 1, instructionsOnly: false },
  { source: "cursor", dir: ".cursor/rules", priority: 2, instructionsOnly: false },
  { source: "github-instructions", dir: ".github/instructions", priority: 3, instructionsOnly: true },
  { source: "sisyphus", dir: ".sisyphus/rules", priority: 5, instructionsOnly: false },
] as const

const GLOBAL_RULE_SOURCES = [
  { source: "global-omo", dir: ".omo/rules", priority: 0 },
  { source: "global-opencode", dir: ".opencode/rules", priority: 1 },
  { source: "global-sisyphus", dir: ".sisyphus/rules", priority: 2 },
  { source: "global-claude", dir: ".claude/rules", priority: 3 },
] as const

const EXCLUDED_SCAN_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".turbo",
  ".next",
  "coverage",
])

const GLOBAL_DISTANCE = 9999
const COPILOT_RULE = ".github/copilot-instructions.md"
const AGENTS_FILENAME = "AGENTS.md"

export type RuleMetadata = {
  description?: string
  globs?: string[]
  paths?: string[]
  applyTo?: string[]
  alwaysApply?: boolean
}

export type RuleFile = {
  path: string
  realPath: string
  relativePath: string
  source: string
  isGlobal: boolean
  distance: number
  priority: number
  metadata: RuleMetadata
  content: string
}

export type RuleMatch = {
  applies: boolean
  reason?: string
}

export type FindRuleFilesInput = {
  projectRoot: string
  filePath: string
  homeDir?: string
  skipClaudeUserRules?: boolean
}

export type FindAgentsMdInput = {
  startDir: string
  rootDir: string
  skipRoot?: boolean
}

type CandidateInput = {
  path: string
  source: string
  isGlobal: boolean
  distance: number
  priority: number
  projectRoot: string
  homeDir: string | null
}

type ParsedRule = {
  metadata: RuleMetadata
  content: string
}

export function findRuleFiles(input: FindRuleFilesInput): RuleFile[] {
  const projectRoot = resolve(input.projectRoot)
  const home = input.homeDir === null ? null : resolve(input.homeDir ?? homedir())
  const currentFile = resolve(input.filePath)
  const startDir = fileStartDir(currentFile)
  const candidates: RuleFile[] = []
  let dir = startDir
  let distance = 0

  while (isInsideOrEqual(dir, projectRoot)) {
    for (const source of PROJECT_RULE_SOURCES) {
      candidates.push(
        ...scanRuleDir({
          root: join(dir, source.dir),
          instructionsOnly: source.instructionsOnly,
          candidate: {
            source: source.source,
            isGlobal: false,
            distance,
            priority: source.priority,
            projectRoot,
            homeDir: home,
          },
        }),
      )
    }

    if (samePath(dir, projectRoot)) break
    const parent = dirname(dir)
    if (samePath(parent, dir)) break
    dir = parent
    distance += 1
  }

  const copilot = readRuleCandidate({
    path: join(projectRoot, COPILOT_RULE),
    source: "github-copilot",
    isGlobal: false,
    distance: 0,
    priority: 4,
    projectRoot,
    homeDir: home,
  })
  if (copilot) candidates.push(copilot)

  if (home) {
    for (const source of GLOBAL_RULE_SOURCES) {
      if (input.skipClaudeUserRules && source.source === "global-claude") continue
      candidates.push(
        ...scanRuleDir({
          root: join(home, source.dir),
          instructionsOnly: false,
          candidate: {
            source: source.source,
            isGlobal: true,
            distance: GLOBAL_DISTANCE,
            priority: source.priority,
            projectRoot,
            homeDir: home,
          },
        }),
      )
    }
  }

  return dedupeRules(candidates).sort(compareRules)
}

export function shouldApplyRule(rule: RuleFile | RuleMetadata, filePath: string, projectRoot: string): RuleMatch {
  const metadata = "metadata" in rule ? rule.metadata : rule
  if (metadata.alwaysApply === true) return { applies: true, reason: "alwaysApply" }

  const globs = collectRuleGlobs(metadata)
  if (globs.length === 0) return { applies: false }

  const relativeFile = toPosix(relative(projectRoot, resolve(filePath)))
  const base = basename(filePath)
  let matchedReason: string | undefined

  for (const pattern of globs) {
    if (pattern.startsWith("!")) {
      const negative = pattern.slice(1)
      if (matchesGlob(negative, relativeFile, base)) return { applies: false, reason: `excluded: ${pattern}` }
      continue
    }

    if (matchesGlob(pattern, relativeFile, base)) matchedReason ??= `glob: ${pattern}`
  }

  return matchedReason ? { applies: true, reason: matchedReason } : { applies: false }
}

export function findAgentsMdUp(input: FindAgentsMdInput): string[] {
  const root = resolve(input.rootDir)
  let dir = fileStartDir(resolve(input.startDir))
  if (!isInsideOrEqual(dir, root)) return []

  const found: string[] = []
  const skipRoot = input.skipRoot ?? true

  while (isInsideOrEqual(dir, root)) {
    if (!(skipRoot && samePath(dir, root))) {
      const agentsPath = join(dir, AGENTS_FILENAME)
      if (existsSync(agentsPath) && isSafeFileUnder(agentsPath, root)) found.push(agentsPath)
    }

    if (samePath(dir, root)) break
    const parent = dirname(dir)
    if (samePath(parent, dir)) break
    dir = parent
  }

  return found.reverse()
}

export function parseRuleMarkdown(text: string): ParsedRule {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const lines = normalized.split("\n")
  if (lines[0] !== "---") return { metadata: {}, content: text }

  const closeIndex = lines.findIndex((line, index) => index > 0 && line === "---")
  if (closeIndex === -1) return { metadata: {}, content: text }

  return {
    metadata: parseFrontmatterLines(lines.slice(1, closeIndex)),
    content: lines.slice(closeIndex + 1).join("\n"),
  }
}

function scanRuleDir(args: {
  root: string
  instructionsOnly: boolean
  candidate: Omit<CandidateInput, "path">
}): RuleFile[] {
  if (!existsSync(args.root)) return []
  const rootReal = safeRealPath(args.root)
  const results: RuleFile[] = []

  function visit(dir: string): void {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      if (err instanceof Error) return
      return
    }

    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (EXCLUDED_SCAN_DIRS.has(entry.name)) continue
        if (!isInsideOrEqual(safeRealPath(path), rootReal)) continue
        visit(path)
        continue
      }

      if (!entry.isFile()) continue
      if (!isRuleFilename(entry.name, args.instructionsOnly)) continue
      const rule = readRuleCandidate({ ...args.candidate, path })
      if (rule) results.push(rule)
    }
  }

  visit(args.root)
  return results
}

function readRuleCandidate(input: CandidateInput): RuleFile | null {
  if (!existsSync(input.path) || !isSafeFileUnder(input.path, input.isGlobal ? input.homeDir : input.projectRoot)) {
    return null
  }

  try {
    const parsed = parseRuleMarkdown(readFileSync(input.path, "utf8"))
    return {
      path: input.path,
      realPath: safeRealPath(input.path),
      relativePath: ruleRelativePath(input),
      source: input.source,
      isGlobal: input.isGlobal,
      distance: input.distance,
      priority: input.priority,
      metadata: parsed.metadata,
      content: parsed.content,
    }
  } catch (err) {
    if (err instanceof Error) return null
    return null
  }
}

function parseFrontmatterLines(lines: string[]): RuleMetadata {
  const metadata: RuleMetadata = {}
  let currentArrayKey: "globs" | "paths" | "applyTo" | null = null

  for (const rawLine of lines) {
    if (rawLine.trim().length === 0) continue

    const listItem = /^\s*-\s*(.+)$/.exec(rawLine)
    if (listItem && currentArrayKey) {
      pushMetadataValues(metadata, currentArrayKey, [parseScalar(listItem[1] ?? "")])
      continue
    }

    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(rawLine)
    if (!pair) {
      currentArrayKey = null
      continue
    }

    const key = normalizeFrontmatterKey(pair[1] ?? "")
    const value = pair[2] ?? ""
    currentArrayKey = null
    if (!key) continue

    if (key === "alwaysApply") {
      metadata.alwaysApply = /^(true|yes|on)$/i.test(value.trim())
      continue
    }

    if (key === "description") {
      metadata.description = parseScalar(value)
      continue
    }

    const values = parseStringArray(value)
    pushMetadataValues(metadata, key, values)
    if (value.trim().length === 0) currentArrayKey = key
  }

  return metadata
}

function normalizeFrontmatterKey(key: string): keyof RuleMetadata | null {
  if (key === "description") return "description"
  if (key === "globs") return "globs"
  if (key === "paths") return "paths"
  if (key === "applyTo") return "applyTo"
  if (key === "alwaysApply") return "alwaysApply"
  return null
}

function parseStringArray(value: string): string[] {
  const trimmed = value.trim()
  if (trimmed.length === 0) return []
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim()
    if (inner.length === 0) return []
    return inner.split(",").map(parseScalar).filter((item) => item.length > 0)
  }
  return [parseScalar(trimmed)].filter((item) => item.length > 0)
}

function parseScalar(value: string): string {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function pushMetadataValues(
  metadata: RuleMetadata,
  key: "globs" | "paths" | "applyTo",
  values: string[],
): void {
  if (values.length === 0) return
  metadata[key] = [...(metadata[key] ?? []), ...values]
}

function collectRuleGlobs(metadata: RuleMetadata): string[] {
  return [metadata.globs, metadata.paths, metadata.applyTo].flatMap((value) => value ?? [])
}

function matchesGlob(pattern: string, relativeFile: string, base: string): boolean {
  const normalized = toPosix(pattern).replace(/^\.\//, "")
  const regexp = globToRegExp(normalized)
  return regexp.test(relativeFile) || regexp.test(base)
}

function globToRegExp(pattern: string): RegExp {
  let source = "^"
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]
    const next = pattern[i + 1]

    if (char === "*" && next === "*") {
      if (pattern[i + 2] === "/") {
        source += "(?:.*/)?"
        i += 2
      } else {
        source += ".*"
        i += 1
      }
      continue
    }

    if (char === "*") {
      source += "[^/]*"
      continue
    }

    if (char === "?") {
      source += "[^/]"
      continue
    }

    source += escapeRegExp(char ?? "")
  }
  return new RegExp(`${source}$`)
}

function escapeRegExp(char: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char
}

function isRuleFilename(name: string, instructionsOnly: boolean): boolean {
  if (instructionsOnly) return name.endsWith(".instructions.md")
  return name.endsWith(".md") || name.endsWith(".mdc")
}

function fileStartDir(path: string): string {
  try {
    return statSync(path).isDirectory() ? path : dirname(path)
  } catch (err) {
    if (err instanceof Error) return dirname(path)
    return dirname(path)
  }
}

function isSafeFileUnder(path: string, root: string | null): boolean {
  if (!root) return false
  return isInsideOrEqual(safeRealPath(path), safeRealPath(root))
}

function safeRealPath(path: string): string {
  try {
    return realpathSync(path)
  } catch (err) {
    if (err instanceof Error) return resolve(path)
    return resolve(path)
  }
}

function isInsideOrEqual(path: string, root: string): boolean {
  const rel = relative(root, path)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

function samePath(a: string, b: string): boolean {
  return normalizeKey(a) === normalizeKey(b)
}

function normalizeKey(path: string): string {
  const resolved = resolve(path)
  return process.platform === "win32" ? resolved.toLowerCase() : resolved
}

function toPosix(path: string): string {
  return path.replace(/\\/g, "/")
}

function ruleRelativePath(input: CandidateInput): string {
  if (!input.isGlobal) return toPosix(relative(input.projectRoot, input.path))
  if (input.homeDir) return `~/${toPosix(relative(input.homeDir, input.path))}`
  return toPosix(input.path)
}

function dedupeRules(rules: RuleFile[]): RuleFile[] {
  const seen = new Map<string, RuleFile>()
  for (const rule of rules) {
    const key = normalizeKey(rule.realPath)
    if (!seen.has(key)) seen.set(key, rule)
  }
  return [...seen.values()]
}

function compareRules(a: RuleFile, b: RuleFile): number {
  if (a.isGlobal !== b.isGlobal) return a.isGlobal ? 1 : -1
  if (a.distance !== b.distance) return a.distance - b.distance
  if (a.priority !== b.priority) return a.priority - b.priority
  const relativeCompare = a.relativePath.localeCompare(b.relativePath)
  if (relativeCompare !== 0) return relativeCompare
  return a.realPath.localeCompare(b.realPath)
}
