import { existsSync, statSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"

import type { OcmmConfig } from "../config/schema.ts"
import { isRecord } from "../shared/logger.ts"
import { BUILTIN_AGENT_INDEX } from "../data/agents.ts"

const READ_TOOL = "read"
const WRITE_TOOL = "write"
const README_BUDGET = 12000
const DEFAULT_TRUNCATE_LIMIT = 50000
const WEBFETCH_TRUNCATE_LIMIT = 10000
const MAX_QUESTION_LABEL_LENGTH = 30
const REDIRECT_TIMEOUT_MS = 3000
const MAX_TRACKED_SESSIONS = 50

const JSON_ERROR_NOTICE = `[JSON PARSE ERROR - IMMEDIATE ACTION REQUIRED]
The previous tool output appears to contain a JSON parse failure. Inspect the raw output, identify the invalid JSON fragment, and retry with corrected JSON rather than repeating the same call.`

const TASK_EMPTY_NOTICE = `[Task Empty Response Warning]
The task tool returned an empty response. Treat this as a failed delegation: retry with more context or inspect the task session before relying on the result.`

export const TODOWRITE_DESCRIPTION = `Create and update a structured todo list. Each todo title must encode WHERE, HOW, WHY, and EXPECTED RESULT in this format: "[WHERE] [HOW] to [WHY] - expect [RESULT]". Keep exactly one todo in progress, mark completed immediately after finishing, and avoid vague items like "fix auth" or "implement feature".`

type ToolHook = (input: unknown, output: unknown) => Promise<void>
type ToolDefinitionHook = (input: unknown, output: unknown) => Promise<void>

export type PermissionGuardHooks = {
  before: ToolHook
  after: ToolHook
  definition: ToolDefinitionHook
  event?: (input: unknown) => Promise<void>
}

export type FsyncSkipEvent = {
  path: string
  reason: string
}

export type FsyncSkipTracker = {
  record(event: FsyncSkipEvent): void
  drain(): FsyncSkipEvent[]
}

export type RedirectResolver = (url: string) => Promise<string | null>

export function createFsyncSkipTracker(): FsyncSkipTracker {
  const events: FsyncSkipEvent[] = []
  return {
    record(event) {
      events.push(event)
    },
    drain() {
      return events.splice(0, events.length)
    },
  }
}

export function createPermissionGuards(args: {
  getConfig: () => OcmmConfig
  projectRoot: string
  taskSystemEnabled?: () => boolean
  redirectResolver?: RedirectResolver
  fsyncTracker?: FsyncSkipTracker
  agentsSessionCache?: Map<string, Set<string>>
  sessionAgentMap?: Map<string, string>
}): PermissionGuardHooks {
  const readPermissions = new Map<string, Set<string>>()
  const readmeSessionCache = new Map<string, Set<string>>()
  const lastAccess = new Map<string, number>()
  const projectRoot = resolve(args.projectRoot)

  return {
    before: async (rawInput, rawOutput) => {
      const config = args.getConfig()
      await trackReadPermission(config, rawInput, readPermissions, readmeSessionCache, lastAccess, projectRoot)
      guardNotepadWrite(config, rawInput, projectRoot)
      guardExistingFileWrite(config, rawInput, readPermissions, projectRoot)
      warnBashFileRead(config, rawInput, rawOutput)
      guardSubagentGit(config, rawInput, args.sessionAgentMap)
      truncateQuestionLabels(config, rawInput, rawOutput)
      guardTodoRead(config, rawInput, args.taskSystemEnabled)
      await rewriteWebfetchRedirect(config, rawInput, rawOutput, args.redirectResolver)
    },
    after: async (rawInput, rawOutput) => {
      const config = args.getConfig()
      replaceEmptyTaskOutput(config, rawInput, rawOutput)
      await injectDirectoryReadme(config, rawInput, rawOutput, projectRoot, readmeSessionCache)
      warnCommentChecker(config, rawInput, rawOutput)
      await warnPlanFormat(config, rawInput, rawOutput, projectRoot)
      warnReadImageResize(config, rawInput, rawOutput)
      appendJsonRecovery(config, rawInput, rawOutput)
      appendFsyncWarnings(config, rawOutput, args.fsyncTracker)
      truncateLargeToolOutput(config, rawInput, rawOutput)
    },
    definition: async (rawInput, rawOutput) => {
      const config = args.getConfig()
      if (hookDisabled(config, "todo-description-override", "todoDescriptionOverride")) return
      if (!isRecord(rawOutput)) return
      if (toolIdentifier(rawInput) !== "todowrite") return
      rawOutput.description = TODOWRITE_DESCRIPTION
    },
    event: createGuardEventHandler({
      readPermissions,
      readmeSessionCache,
      lastAccess,
      ...(args.agentsSessionCache !== undefined ? { agentsSessionCache: args.agentsSessionCache } : {}),
      ...(args.sessionAgentMap !== undefined ? { sessionAgentMap: args.sessionAgentMap } : {}),
    }),
  }
}

function createGuardEventHandler(caches: {
  readPermissions: Map<string, Set<string>>
  readmeSessionCache: Map<string, Set<string>>
  lastAccess: Map<string, number>
  agentsSessionCache?: Map<string, Set<string>>
  sessionAgentMap?: Map<string, string>
}): (input: unknown) => Promise<void> {
  return async (raw: unknown) => {
    if (!isRecord(raw)) return
    const event = (raw as Record<string, unknown>).event ?? raw
    const eventType = (event as Record<string, unknown>).type
    if (eventType !== "session.deleted" && eventType !== "session.compacted") return
    const props = (event as Record<string, unknown>).properties ?? event
    const sid = (props as Record<string, unknown>).sessionID ?? (props as Record<string, unknown>).sessionId
    if (typeof sid !== "string") return
    caches.readPermissions.delete(sid)
    caches.readmeSessionCache.delete(sid)
    caches.lastAccess.delete(sid)
    caches.agentsSessionCache?.delete(sid)
    caches.sessionAgentMap?.delete(sid)
  }
}

async function trackReadPermission(
  config: OcmmConfig,
  rawInput: unknown,
  readPermissions: Map<string, Set<string>>,
  readmeSessionCache: Map<string, Set<string>>,
  lastAccess: Map<string, number>,
  projectRoot: string,
): Promise<void> {
  if (hookDisabled(config, "write-existing-file-guard", "writeExistingFileGuard")) return
  if (toolName(rawInput) !== READ_TOOL) return
  const filePath = filePathFromArgs(rawInput, projectRoot)
  if (!filePath) return
  const canonical = canonicalExistingFile(filePath, projectRoot)
  if (!canonical || !isInside(projectRoot, canonical)) return
  const session = sessionId(rawInput)
  let paths = readPermissions.get(session)
  if (!paths) {
    paths = new Set<string>()
    readPermissions.set(session, paths)
  }
  paths.add(canonical)
  touchSession(lastAccess, session, MAX_TRACKED_SESSIONS, readPermissions, readmeSessionCache)
}

function touchSession(
  lastAccess: Map<string, number>,
  sessionId: string,
  maxSessions: number,
  ...cachesToClean: Array<Map<string, unknown>>
): void {
  lastAccess.set(sessionId, Date.now())
  if (lastAccess.size <= maxSessions) return
  let oldestKey: string | null = null
  let oldestTime = Infinity
  for (const [key, time] of lastAccess) {
    if (key === sessionId) continue
    if (time < oldestTime) {
      oldestTime = time
      oldestKey = key
    }
  }
  if (oldestKey) {
    lastAccess.delete(oldestKey)
    for (const cache of cachesToClean) {
      cache.delete(oldestKey)
    }
  }
}

function guardExistingFileWrite(
  config: OcmmConfig,
  rawInput: unknown,
  readPermissions: Map<string, Set<string>>,
  projectRoot: string,
): void {
  if (hookDisabled(config, "write-existing-file-guard", "writeExistingFileGuard")) return
  if (toolName(rawInput) !== WRITE_TOOL) return
  const args = argsRecord(rawInput)
  const filePath = filePathFromArgs(rawInput, projectRoot)
  if (!filePath || args?.overwrite === true) return

  const canonical = canonicalExistingFile(filePath, projectRoot)
  if (!canonical || !isInside(projectRoot, canonical) || isUnderSpecialDir(projectRoot, canonical, ".omo")) return

  const session = sessionId(rawInput)
  const paths = readPermissions.get(session)
  if (paths?.has(canonical)) {
    paths.delete(canonical)
    return
  }

  throw new Error("File already exists. Use Read first, then edit the existing file instead of overwriting it with Write.")
}

function guardNotepadWrite(config: OcmmConfig, rawInput: unknown, projectRoot: string): void {
  if (hookDisabled(config, "notepad-write-guard", "notepadWriteGuard")) return
  const name = toolName(rawInput)
  if (name !== WRITE_TOOL && name !== "edit" && name !== "multiedit") return
  const filePath = filePathFromArgs(rawInput, projectRoot)
  if (!filePath) return
  const normalized = resolve(filePath).split(/[\\/]+/)
  for (let i = 0; i < normalized.length - 1; i += 1) {
    if ((normalized[i] === ".omo" || normalized[i] === ".sisyphus") && normalized[i + 1] === "notepads") {
      throw new Error("Notepad files are protected. Use the dedicated notepad workflow instead of Write/Edit.")
    }
  }
}

function warnBashFileRead(config: OcmmConfig, rawInput: unknown, rawOutput: unknown): void {
  if (hookDisabled(config, "bash-file-read-guard", "bashFileReadGuard")) return
  if (toolName(rawInput) !== "bash") return
  const command = stringArg(rawInput, "command")
  if (!command || !isSimpleFileReadCommand(command)) return
  const out = outputRecord(rawOutput)
  if (!out) return
  out.message = "This looks like a simple file read. Prefer the Read tool so line numbers and file metadata stay structured."
}

function guardSubagentGit(
  config: OcmmConfig,
  rawInput: unknown,
  sessionAgentMap?: Map<string, string>,
): void {
  if (hookDisabled(config, "subagent-git-guard", "subagentGitGuard")) return
  if (!sessionAgentMap) return
  if (toolName(rawInput) !== "bash") return
  const command = stringArg(rawInput, "command")
  if (!command) return
  if (!isGitWriteCommand(command)) return
  const sid = sessionId(rawInput)
  const agentName = sessionAgentMap.get(sid)
  if (!agentName) return // unknown session — safe default, don't block
  if (isBuiltinAgentName(agentName)) return // main agent — allow
  throw new Error(
    `ocmm: subagent sessions are not allowed to run git write commands (commit, push, tag, reset --hard, rebase, cherry-pick, revert). The main agent must handle version control. (agent: ${agentName})`,
  )
}

export function isSimpleFileReadCommand(command: string): boolean {
  if (/[|;&<>`]/.test(command)) return false
  const tokens = tokenizeCommand(command)
  if (tokens.length < 2) return false
  const [cmd, ...rest] = tokens
  if (cmd === "cat") return rest.length === 1 && !rest[0]?.startsWith("-")
  if (cmd !== "head" && cmd !== "tail") return false
  if (rest.length === 1) return !rest[0]?.startsWith("-")
  if (rest.length === 3 && rest[0] === "-n" && /^\d+$/.test(rest[1] ?? "")) return true
  if (rest.length === 2 && /^-\d+$/.test(rest[0] ?? "")) return true
  return false
}

function truncateQuestionLabels(config: OcmmConfig, rawInput: unknown, rawOutput: unknown): void {
  if (hookDisabled(config, "question-label-truncator", "questionLabelTruncator")) return
  const name = toolName(rawInput)
  if (name !== "askuserquestion" && name !== "ask_user_question" && name !== "question") return
  const args = mutableArgs(rawInput, rawOutput)
  if (!args || !Array.isArray(args.questions)) return

  for (const question of args.questions) {
    if (!isRecord(question) || !Array.isArray(question.options)) continue
    for (const option of question.options) {
      if (!isRecord(option) || typeof option.label !== "string") continue
      if (option.label.length > MAX_QUESTION_LABEL_LENGTH) {
        option.label = `${option.label.slice(0, MAX_QUESTION_LABEL_LENGTH - 3)}...`
      }
    }
  }
}

function guardTodoRead(
  config: OcmmConfig,
  rawInput: unknown,
  taskSystemEnabled: (() => boolean) | undefined,
): void {
  if (hookDisabled(config, "tasks-todowrite-disabler", "tasksTodowriteDisabler")) return
  if (toolName(rawInput) !== "todoread") return
  if (!taskSystemEnabled?.()) return
  throw new Error("TodoRead is disabled while the task system is active. Use TodoWrite updates as the source of truth.")
}

async function rewriteWebfetchRedirect(
  config: OcmmConfig,
  rawInput: unknown,
  rawOutput: unknown,
  redirectResolver: RedirectResolver | undefined,
): Promise<void> {
  if (hookDisabled(config, "webfetch-redirect-guard", "webfetchRedirectGuard")) return
  if (toolName(rawInput) !== "webfetch") return
  const args = mutableArgs(rawInput, rawOutput)
  if (!args || typeof args.url !== "string") return
  const next = await (redirectResolver ?? resolveRedirectUrl)(args.url)
  if (next && next !== args.url) args.url = next
}

export async function resolveRedirectUrl(url: string, timeoutMs = REDIRECT_TIMEOUT_MS): Promise<string | null> {
  const fetchImpl = globalThis.fetch
  if (!fetchImpl) return null
  let current = url
  for (let i = 0; i < 5; i += 1) {
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined
    let response: Response | null
    try {
      response = await Promise.race([
        fetchImpl(current, { method: "HEAD", redirect: "manual", signal: controller.signal }),
        new Promise<null>((resolveTimeout) => {
          timeout = setTimeout(() => {
            controller.abort()
            resolveTimeout(null)
          }, timeoutMs)
        }),
      ])
    } catch {
      return null
    } finally {
      if (timeout) clearTimeout(timeout)
    }
    if (response === null) return null
    if (response.status < 300 || response.status >= 400) return current === url ? null : current
    const location = response.headers.get("location")
    if (!location) return null
    current = new URL(location, current).toString()
  }
  return null
}

function replaceEmptyTaskOutput(config: OcmmConfig, rawInput: unknown, rawOutput: unknown): void {
  if (hookDisabled(config, "empty-task-response-detector", "emptyTaskResponseDetector")) return
  const name = toolName(rawInput)
  if (name !== "task") return
  const out = outputRecord(rawOutput)
  if (!out || typeof out.output !== "string" || out.output.trim().length > 0) return
  out.output = TASK_EMPTY_NOTICE
}

async function injectDirectoryReadme(
  config: OcmmConfig,
  rawInput: unknown,
  rawOutput: unknown,
  projectRoot: string,
  readmeSessionCache: Map<string, Set<string>>,
): Promise<void> {
  if (hookDisabled(config, "directory-readme-injector", "directoryReadmeInjector")) return
  if (toolName(rawInput) !== READ_TOOL) return
  const out = outputRecord(rawOutput)
  if (!out || typeof out.output !== "string" || out.output.includes("[Directory README:")) return
  const targetPath = filePathFromOutput(rawInput, out, projectRoot)
  if (!targetPath) return
  // Only inject for files inside the project root — avoid polluting context
  // with README from external directories (e.g. ~/.config/opencode).
  const root = resolve(projectRoot)
  const rel = relative(root, resolve(targetPath))
  if (rel.startsWith("..") || isAbsolute(rel)) return
  const readme = findNearestReadme(targetPath, projectRoot)
  if (!readme || resolve(readme) === resolve(targetPath)) return
  const session = sessionId(rawInput) ?? "default"
  const readmeDir = dirname(readme)
  let injected = readmeSessionCache.get(session)
  if (!injected) {
    injected = new Set<string>()
    readmeSessionCache.set(session, injected)
  }
  if (injected.has(readmeDir)) return
  const content = await readText(readme)
  if (content === null) return
  injected.add(readmeDir)
  const { text, truncated } = truncateText(content, README_BUDGET)
  out.output = `${out.output}\n\n[Directory README: ${readme}]\n${text}${
    truncated ? `\n[Directory README truncated: ${readme}]` : ""
  }`
}

function warnCommentChecker(config: OcmmConfig, rawInput: unknown, rawOutput: unknown): void {
  if (hookDisabled(config, "comment-checker", "commentChecker")) return
  const name = toolName(rawInput)
  if (name !== WRITE_TOOL && name !== "edit" && name !== "multiedit") return
  const text = contentArgs(rawInput).join("\n")
  if (text.length === 0 || /ocmm-comment-checker:\s*ignore|comment-checker:\s*ignore/i.test(text)) return
  if (!/(generated by (chatgpt|ai)|this code was generated|auto-generated by ai)/i.test(text)) return
  appendOutput(rawOutput, "\n\n[Comment Checker Warning]\nAvoid AI-attribution comments in committed source. Remove generated-by-AI comments or add an explicit bypass marker if intentional.")
}

async function warnPlanFormat(
  config: OcmmConfig,
  rawInput: unknown,
  rawOutput: unknown,
  projectRoot: string,
): Promise<void> {
  if (hookDisabled(config, "plan-format-validator", "planFormatValidator")) return
  const name = toolName(rawInput)
  if (name !== WRITE_TOOL && name !== "edit" && name !== "multiedit") return
  const filePath = filePathFromArgs(rawInput, projectRoot)
  if (!filePath || !isPlanPath(filePath)) return
  const text = contentArgs(rawInput).join("\n") || await readText(filePath)
  if (!text) return
  const badLines = malformedPlanCheckboxLines(text)
  if (badLines.length === 0) return
  appendOutput(rawOutput, `\n\n[Plan Format Warning]\nMalformed checklist lines detected: ${badLines.join(", ")}. Use '- [ ] **Step N: ...**' or '- [x] **Step N: ...**'.`)
}

function warnReadImageResize(config: OcmmConfig, rawInput: unknown, rawOutput: unknown): void {
  if (hookDisabled(config, "read-image-resizer", "readImageResizer")) return
  if (toolName(rawInput) !== READ_TOOL || !hasImageMetadata(rawOutput)) return
  appendOutput(rawOutput, "\n\n[Image Resize Notice]\nLarge image resizing is not active in this dependency-free build; verify image dimensions manually if model limits matter.")
}

function appendJsonRecovery(config: OcmmConfig, rawInput: unknown, rawOutput: unknown): void {
  if (hookDisabled(config, "json-error-recovery", "jsonErrorRecovery")) return
  const name = toolName(rawInput) ?? ""
  if (jsonRecoveryExcluded(name)) return
  const out = outputRecord(rawOutput)
  if (!out || typeof out.output !== "string") return
  if (out.output.includes("[JSON PARSE ERROR - IMMEDIATE ACTION REQUIRED]")) return
  if (!containsJsonParseError(out.output)) return
  out.output = `${out.output}\n\n${JSON_ERROR_NOTICE}`
}

export function containsJsonParseError(text: string): boolean {
  return /(json\.parse|unexpected (token|end).*json|invalid json|json parse error|failed to parse json|malformed json|unexpected end of json input|syntaxerror: unexpected token.*json|json[^\n]*expected \}|json[^\n]*unexpected eof)/i.test(text)
}

function appendFsyncWarnings(config: OcmmConfig, rawOutput: unknown, tracker: FsyncSkipTracker | undefined): void {
  if (hookDisabled(config, "fsync-skip-warning", "fsyncSkipWarning")) return
  const events = tracker?.drain() ?? []
  if (events.length === 0) return
  appendOutput(
    rawOutput,
    `\n\n[Fsync Skip Warning]\n${events.map((event) => `- ${event.path}: ${event.reason}`).join("\n")}`,
  )
}

function truncateLargeToolOutput(config: OcmmConfig, rawInput: unknown, rawOutput: unknown): void {
  if (hookDisabled(config, "tool-output-truncator", "toolOutputTruncator")) return
  const name = toolName(rawInput) ?? ""
  const out = outputRecord(rawOutput)
  if (!out || typeof out.output !== "string") return
  const limit = name === "webfetch" ? WEBFETCH_TRUNCATE_LIMIT : DEFAULT_TRUNCATE_LIMIT
  if (!shouldTruncateTool(name) || out.output.length <= limit) return
  const omitted = out.output.length - limit
  out.output = `${out.output.slice(0, limit)}\n\n[Tool Output Truncated]\nOmitted ${omitted} characters from ${name} output.`
}

function shouldTruncateTool(name: string): boolean {
  return new Set([
    "grep",
    "glob",
    "lsp_diagnostics",
    "interactive_bash",
    "skill_mcp",
    "webfetch",
    "bash",
  ]).has(name)
}

function malformedPlanCheckboxLines(text: string): number[] {
  const bad: number[] = []
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (/^\s*-\s*\[[^ xX\]]+\]/.test(line) || /^\s*-\[/.test(line) || /^\s*-\s*\[\s*\]\s*$/.test(line)) {
      bad.push(index + 1)
    }
  })
  return bad
}

function isPlanPath(filePath: string): boolean {
  const parts = resolve(filePath).split(/[\\/]+/)
  return parts.includes(".omo") && parts.includes("plans") && filePath.toLowerCase().endsWith(".md")
}

function findNearestReadme(filePath: string, projectRoot: string): string | null {
  let current = dirname(canonicalExistingFile(filePath, projectRoot) ?? absolutize(filePath, projectRoot))
  const root = resolve(projectRoot)
  while (isInside(root, current) || current === root) {
    for (const name of ["README.md", "readme.md"]) {
      const candidate = resolve(current, name)
      if (existsSync(candidate) && safeStatFile(candidate)) return candidate
    }
    if (current === root) break
    const next = dirname(current)
    if (next === current) break
    current = next
  }
  return null
}

function contentArgs(rawInput: unknown): string[] {
  const args = argsRecord(rawInput)
  if (!args) return []
  const values: string[] = []
  collectContentValues(args, values)
  return values
}

function collectContentValues(value: unknown, values: string[]): void {
  if (typeof value === "string") {
    values.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectContentValues(item, values)
    return
  }
  if (!isRecord(value)) return
  for (const key of ["content", "text", "newString", "lines", "line", "body"]) {
    if (key in value) collectContentValues(value[key], values)
  }
  if (Array.isArray(value.edits)) collectContentValues(value.edits, values)
}

function hasImageMetadata(rawOutput: unknown): boolean {
  const out = outputRecord(rawOutput)
  if (!out || !isRecord(out.metadata)) return false
  const mime = out.metadata.mime ?? out.metadata.mimeType ?? out.metadata.contentType
  if (typeof mime === "string" && mime.toLowerCase().startsWith("image/")) return true
  const attachments = out.metadata.attachments
  if (!Array.isArray(attachments)) return false
  return attachments.some((item) => isRecord(item) && typeof item.mime === "string" && item.mime.startsWith("image/"))
}

function filePathFromOutput(rawInput: unknown, rawOutput: Record<string, unknown>, baseDir: string): string | null {
  if (isRecord(rawOutput.metadata)) {
    for (const key of ["filePath", "path", "file", "file_path"]) {
      const value = rawOutput.metadata[key]
      if (typeof value === "string" && value.length > 0) return absolutize(value, baseDir)
    }
  }
  return filePathFromArgs(rawInput, baseDir)
}

function filePathFromArgs(rawInput: unknown, baseDir = process.cwd()): string | null {
  const args = argsRecord(rawInput)
  if (!args) return null
  for (const key of ["filePath", "path", "file", "file_path"]) {
    const value = args[key]
    if (typeof value === "string" && value.length > 0) return absolutize(value, baseDir)
  }
  return null
}

function stringArg(rawInput: unknown, key: string): string | null {
  const args = argsRecord(rawInput)
  const value = args?.[key]
  return typeof value === "string" ? value : null
}

function argsRecord(rawInput: unknown): Record<string, unknown> | null {
  if (!isRecord(rawInput) || !isRecord(rawInput.args)) return null
  return rawInput.args
}

function mutableArgs(rawInput: unknown, rawOutput: unknown): Record<string, unknown> | null {
  const out = outputRecord(rawOutput)
  if (!out) return null
  if (isRecord(out.args)) return out.args
  const inputArgs = argsRecord(rawInput)
  if (inputArgs) {
    out.args = inputArgs
    return inputArgs
  }
  out.args = {}
  return out.args as Record<string, unknown>
}

function outputRecord(rawOutput: unknown): Record<string, unknown> | null {
  return isRecord(rawOutput) ? rawOutput : null
}

function appendOutput(rawOutput: unknown, suffix: string): void {
  const out = outputRecord(rawOutput)
  if (!out || typeof out.output !== "string") return
  out.output = `${out.output}${suffix}`
}

function toolName(rawInput: unknown): string | null {
  const id = toolIdentifier(rawInput)
  return id ? id.toLowerCase() : null
}

function toolIdentifier(rawInput: unknown): string | null {
  if (!isRecord(rawInput)) return null
  for (const key of ["toolID", "toolId", "toolName", "name"]) {
    const value = rawInput[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  const tool = rawInput.tool
  if (typeof tool === "string") return tool
  if (isRecord(tool)) {
    for (const key of ["name", "id", "key"]) {
      const value = tool[key]
      if (typeof value === "string" && value.length > 0) return value
    }
  }
  return null
}

function sessionId(rawInput: unknown): string {
  if (!isRecord(rawInput)) return "global"
  for (const key of ["sessionID", "sessionId", "session_id"]) {
    const value = rawInput[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return "global"
}

const GIT_WRITE_COMMAND_RE = /\bgit\s+(?:commit|push|tag|reset\s+--hard|rebase|cherry-pick|revert)\b/

const BUILTIN_AGENT_ALIASES = new Set(["oracle", "explore"])

/** Check if a shell command string contains a git write operation. */
export function isGitWriteCommand(command: string): boolean {
  return GIT_WRITE_COMMAND_RE.test(command)
}

/** Check if an agent name is a builtin agent (including aliases like oracle, explore). */
export function isBuiltinAgentName(name: string): boolean {
  return BUILTIN_AGENT_INDEX.has(name) || BUILTIN_AGENT_ALIASES.has(name)
}

export function hookDisabled(config: OcmmConfig, name: string, alias?: string): boolean {
  return config.disabledHooks?.includes(name) === true || (alias !== undefined && config.disabledHooks?.includes(alias) === true)
}

function canonicalExistingFile(filePath: string, projectRoot: string): string | null {
  const absolute = absolutize(filePath, projectRoot)
  if (!safeStatFile(absolute)) return null
  return absolute
}

function safeStatFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

function absolutize(filePath: string, baseDir: string): string {
  return isAbsolute(filePath) ? resolve(filePath) : resolve(baseDir, filePath)
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel.length === 0 || (!rel.startsWith("..") && !isAbsolute(rel))
}

function isUnderSpecialDir(projectRoot: string, filePath: string, dirName: string): boolean {
  const rel = relative(projectRoot, filePath)
  return rel === dirName || rel.startsWith(`${dirName}${sep}`)
}

function tokenizeCommand(command: string): string[] {
  const tokens: string[] = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(command)) !== null) tokens.push(match[1] ?? match[2] ?? match[3] ?? "")
  return tokens
}

function jsonRecoveryExcluded(name: string): boolean {
  if (name.startsWith("session_")) return true
  return new Set([
    "bash",
    "read",
    "glob",
    "grep",
    "webfetch",
    "look_at",
    "grep_app_searchgithub",
    "websearch_web_search_exa",
    "todowrite",
    "todoread",
    "task",
    "background_output",
    "skill",
    "skill_mcp",
  ]).has(name)
}

function truncateText(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false }
  return { text: text.slice(0, limit), truncated: true }
}

async function readText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8")
  } catch {
    return null
  }
}
