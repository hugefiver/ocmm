import { existsSync, readFileSync, realpathSync, statSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"

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
      guardSubagentGit(config, rawInput, projectRoot, args.sessionAgentMap)
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
  projectRoot: string,
  sessionAgentMap?: Map<string, string>,
): void {
  if (hookDisabled(config, "subagent-git-guard", "subagentGitGuard")) return
  if (!sessionAgentMap) return
  if (toolName(rawInput) !== "bash") return
  const command = stringArg(rawInput, "command")
  if (!command) return
  if (!isGitWriteCommand(command)) return
  const workdir = bashWorkingDirectory(rawInput, projectRoot)
  if (gitWritesAllowedInTempRepo(command, workdir, projectRoot)) return
  const sid = sessionId(rawInput)
  const agentName = sessionAgentMap.get(sid)
  if (!agentName) return // unknown session — safe default, don't block
  if (isBuiltinAgentName(agentName)) return // main agent — allow
  throw new Error(
      `ocmm: subagent sessions are not allowed to run git write commands (commit, push, tag, reset --hard, rebase, cherry-pick, revert). The main agent must handle version control. (agent: ${agentName})`,
  )
}

function bashWorkingDirectory(rawInput: unknown, projectRoot: string): string {
  const args = argsRecord(rawInput)
  for (const key of ["workdir", "cwd", "directory"] as const) {
    const value = args?.[key] ?? (isRecord(rawInput) ? rawInput[key] : undefined)
    if (typeof value === "string" && value.length > 0) return absolutize(value, projectRoot)
  }
  return projectRoot
}

function gitWritesAllowedInTempRepo(command: string, baseDir: string, projectRoot: string): boolean {
  const status = gitWriteTempStatus(tokenizeGitCommand(command), baseDir, projectRoot)
  return status.foundWrite && status.allowed
}

function gitWriteTempStatus(
  tokens: GitCommandToken[],
  baseDir: string,
  projectRoot: string,
  inheritedEnv: { gitDir?: string | null; workTree?: string | null; tempDenied?: boolean } = {},
  shell: "pwsh" | "cmd" = "pwsh",
): { foundWrite: boolean; allowed: boolean; gitDir: string | null; workTree: string | null; tempDenied: boolean } {
  const segments = splitIntoSegmentsGit(splitGitSeparators(tokens))
  let foundWrite = false
  let envGitDir: string | null = inheritedEnv.gitDir ?? null
  let envWorkTree: string | null = inheritedEnv.workTree ?? null
  let tempDenied = inheritedEnv.tempDenied === true

  for (const segment of segments) {
    if (segment.length === 0) continue
    const wrapper = extractWrapperScriptGit(segment)
    if (wrapper !== null) {
      const wrapperShell = normalizeCommandName(segment[0]!.text) === "cmd" ? "cmd" : "pwsh"
      const nested = wrapper[0]?.quoted
        ? gitWriteTempStatus(tokenizeGitCommand(wrapper[0]!.text), baseDir, projectRoot, { gitDir: envGitDir, workTree: envWorkTree, tempDenied }, wrapperShell)
        : gitWriteTempStatus(wrapper, baseDir, projectRoot, { gitDir: envGitDir, workTree: envWorkTree, tempDenied }, wrapperShell)
      tempDenied = tempDenied || nested.tempDenied
      if (!nested.allowed) return { foundWrite: true, allowed: false, gitDir: envGitDir, workTree: envWorkTree, tempDenied }
      foundWrite = foundWrite || nested.foundWrite
      continue
    }

    if (normalizeCommandName(segment[0]!.text) !== "git") {
      // Track PowerShell env assignments before the git segment.
      const env = extractGitEnvAssignment(segment, baseDir, shell)
      if (env) {
        if ((env.gitDir !== undefined && !isValidGitDir(env.gitDir, projectRoot))
            || (env.workTree !== undefined && !isValidTempDirectoryOutsideProject(env.workTree, projectRoot))) {
          tempDenied = true
        }
        if (env.gitDir !== undefined) envGitDir = env.gitDir
        if (env.workTree !== undefined) envWorkTree = env.workTree
      }
      continue
    }

    const segTexts = segment.map((t) => t.text)
    const subIdx = findGitSubcommandIndex(segTexts, 1)
    if (subIdx === -1) continue
    const context = gitExecutionContext(segTexts, baseDir, subIdx, projectRoot)
    if (!context) {
      tempDenied = true
      continue
    }
    if (context.tempDenied) tempDenied = true
    const subcommand = segTexts[subIdx]
    if (subcommand === undefined || !GIT_WRITE_SUBCOMMANDS.has(subcommand)) continue
    if (hasHelpFlag(segTexts, subIdx + 1, subcommand)) continue
    if (subcommand === "reset" && !hasResetHardFlag(segTexts, subIdx + 1)) continue
    if (subcommand === "tag" && isTagListOnly(segTexts, subIdx + 1)) continue

    if (!isAllowedTempGitContext(context, envGitDir, envWorkTree, tempDenied || context.tempDenied, projectRoot)) {
      return { foundWrite: true, allowed: false, gitDir: envGitDir, workTree: envWorkTree, tempDenied }
    }
    foundWrite = true
  }

  return { foundWrite, allowed: true, gitDir: envGitDir, workTree: envWorkTree, tempDenied }
}

function isAllowedTempGitContext(
  context: { workingDirectory: string; gitDir: string | null; workTree: string | null },
  envGitDir: string | null,
  envWorkTree: string | null,
  tempDenied: boolean,
  projectRoot: string,
): boolean {
  if (tempDenied) return false
  if (envGitDir !== null && !isValidGitDir(envGitDir, projectRoot)) return false
  if (envWorkTree !== null && !isValidTempDirectoryOutsideProject(envWorkTree, projectRoot)) return false

  const effectiveGitDir = context.gitDir ?? envGitDir
  const effectiveWorkTree = context.workTree ?? envWorkTree
  if (effectiveGitDir !== null && !isValidGitDir(effectiveGitDir, projectRoot)) return false
  if (effectiveWorkTree !== null && !isValidTempDirectoryOutsideProject(effectiveWorkTree, projectRoot)) return false

  if (effectiveGitDir !== null && effectiveWorkTree !== null) {
    return true
  }
  if (effectiveGitDir !== null && isStandaloneBareGitDir(effectiveGitDir)) {
    return true
  }

  return isTempGitRepositoryContext(context.workingDirectory, projectRoot)
}

function isValidTempDirectoryOutsideProject(path: string, projectRoot: string): boolean {
  const tempRoot = canonicalPath(tmpdir())
  const canonical = canonicalDirectory(path)
  if (!canonical) return false
  if (!isInside(tempRoot, canonical)) return false
  const projectCanonical = canonicalPath(projectRoot)
  if (isInside(projectCanonical, canonical)) return false
  // Block paths that are ancestors of projectRoot (would version-control the project tree)
  if (isInside(canonical, projectCanonical)) return false
  return true
}

/** Validate that a path is a real git directory (bare or .git) under temp.
 *  Must contain at least one git marker: HEAD, or (config + objects), or refs.
 *  Also requires the path to be an existing directory under temp and outside project.
 *  Additionally, checks that the effective repo root is disjoint from projectRoot:
 *  for standard `.git` directories, the repo root is the parent; for bare gitdirs
 *  not named `.git`, the gitdir itself is the repo root. */
function isValidGitDir(path: string, projectRoot: string): boolean {
  if (!isValidTempDirectoryOutsideProject(path, projectRoot)) return false
  try {
    const gitDir = canonicalPath(path)
    if (safeStatFile(join(gitDir, "HEAD"))) return isRepoRootDisjointFromProject(gitDir, projectRoot)
    if (safeStatFile(join(gitDir, "config")) && safeStatDirectory(join(gitDir, "objects"))) return isRepoRootDisjointFromProject(gitDir, projectRoot)
    if (safeStatDirectory(join(gitDir, "refs"))) return isRepoRootDisjointFromProject(gitDir, projectRoot)
    return false
  } catch {
    return false
  }
}

/** For a standard .git directory, the effective repo root is the parent directory.
 *  For bare gitdirs (not named .git), the gitdir itself is the repo root.
 *  Returns true only when the repo root is fully disjoint from projectRoot
 *  (not inside projectRoot, and not an ancestor containing projectRoot). */
function isRepoRootDisjointFromProject(gitDir: string, projectRoot: string): boolean {
  const repoRoot = effectiveRepoRootForGitDir(gitDir)
  const repoRootCanonical = canonicalPath(repoRoot)
  const projectCanonical = canonicalPath(projectRoot)
  if (isInside(projectCanonical, repoRootCanonical)) return false
  if (isInside(repoRootCanonical, projectCanonical)) return false
  return true
}

function isStandaloneBareGitDir(gitDir: string): boolean {
  const canonical = canonicalPath(gitDir)
  if (basename(canonical).toLowerCase() === ".git") return false
  const parent = dirname(canonical)
  return !(basename(parent).toLowerCase() === "worktrees" && basename(dirname(parent)).toLowerCase() === ".git")
}

function effectiveRepoRootForGitDir(gitDir: string): string {
  if (basename(gitDir).toLowerCase() === ".git") return dirname(gitDir)

  const parent = dirname(gitDir)
  if (basename(parent).toLowerCase() === "worktrees") {
    const gitMarker = dirname(parent)
    if (basename(gitMarker).toLowerCase() === ".git") return dirname(gitMarker)
  }

  return gitDir
}

function gitExecutionContext(tokens: string[], baseDir: string, subIdx: number, projectRoot: string): {
  workingDirectory: string
  gitDir: string | null
  workTree: string | null
  tempDenied: boolean
} | null {
  let workingDirectory = baseDir
  let gitDir: string | null = null
  let workTree: string | null = null
  let tempDenied = false

  for (let i = 1; i < subIdx; i++) {
    const token = tokens[i]
    if (token === undefined) continue
    if (token === "-C") {
      const value = tokens[i + 1]
      if (value === undefined || value.length === 0) { tempDenied = true; return null }
      workingDirectory = absolutize(value, workingDirectory)
      if (!isValidTempDirectoryOutsideProject(workingDirectory, projectRoot)) tempDenied = true
      i += 1
      continue
    }
    if (token === "-c") {
      const value = tokens[i + 1]
      if (value === undefined) return null
      const configuredWorkTree = gitConfigWorkTree(value)
      if (configuredWorkTree !== null) {
        if (configuredWorkTree.length === 0) { tempDenied = true; i += 1; continue }
        workTree = absolutize(configuredWorkTree, workingDirectory)
        if (!isValidTempDirectoryOutsideProject(workTree, projectRoot)) tempDenied = true
      }
      i += 1
      continue
    }
    if (token === "--git-dir") {
      const value = tokens[i + 1]
      if (value === undefined || value.length === 0) { tempDenied = true; i += 1; continue }
      gitDir = absolutize(value, workingDirectory)
      if (!isValidGitDir(gitDir, projectRoot)) tempDenied = true
      i += 1
      continue
    }
    if (token.startsWith("--git-dir=")) {
      const raw = token.slice("--git-dir=".length)
      if (raw.length === 0) { tempDenied = true; continue }
      gitDir = absolutize(raw, workingDirectory)
      if (!isValidGitDir(gitDir, projectRoot)) tempDenied = true
      continue
    }
    if (token === "--work-tree") {
      const value = tokens[i + 1]
      if (value === undefined || value.length === 0) { tempDenied = true; i += 1; continue }
      workTree = absolutize(value, workingDirectory)
      if (!isValidTempDirectoryOutsideProject(workTree, projectRoot)) tempDenied = true
      i += 1
      continue
    }
    if (token.startsWith("--work-tree=")) {
      const raw = token.slice("--work-tree=".length)
      if (raw.length === 0) { tempDenied = true; continue }
      workTree = absolutize(raw, workingDirectory)
      if (!isValidTempDirectoryOutsideProject(workTree, projectRoot)) tempDenied = true
      continue
    }
    if (GIT_VALUE_OPTIONS.has(token)) {
      i += 1
    }
  }

  return { workingDirectory, gitDir, workTree, tempDenied }
}

function isTempGitRepositoryContext(directory: string, projectRoot: string): boolean {
  const tempRoot = canonicalPath(tmpdir())
  const start = canonicalPath(directory)
  if (!isInside(tempRoot, start)) return false
  if (isValidGitDir(start, projectRoot) && isStandaloneBareGitDir(start)) return true
  const root = findTempGitRoot(start, tempRoot, projectRoot)
  if (root === null) return false
  const rootCanonical = canonicalPath(root)
  const projectCanonical = canonicalPath(projectRoot)
  // Block when temp repo contains projectRoot (ancestor that version-controls the project tree)
  if (isInside(projectCanonical, rootCanonical)) return false
  // Block when temp repo is inside projectRoot
  if (isInside(rootCanonical, projectCanonical)) return false
  return true
}

function findTempGitRoot(directory: string, tempRoot: string, projectRoot: string): string | null {
  let current = directory
  while (isInside(tempRoot, current)) {
    const marker = resolve(current, ".git")
    if (isValidTempGitMarker(marker, tempRoot, projectRoot)) return current
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

/** Validate a .git marker (directory or file) is a genuine valid git directory under temp.
 *  - .git directory: must be a valid git dir via isValidGitDir (under temp, outside project, contains git markers).
 *  - .git file (worktree): must start with `gitdir:`, resolve the referenced
 *    path relative to the .git file's parent, canonicalize, and pass isValidGitDir.
 *    Malformed or outside-temp gitdir => rejected. */
function isValidTempGitMarker(marker: string, tempRoot: string, projectRoot: string): boolean {
  try {
    const st = statSync(marker)
    if (st.isDirectory()) {
      return isValidGitDir(marker, projectRoot)
    }
    if (st.isFile()) {
      return isTempWorktreeGitFile(marker, projectRoot)
    }
  } catch {
    // no .git at all — not a valid marker
  }
  return false
}

/** Parse a .git file (git worktree link), resolve the referenced gitdir,
 *  and verify it is a valid git dir under tempRoot. Returns false for any
 *  parse failure or gitdir that is not a valid temp git dir. */
function isTempWorktreeGitFile(gitFile: string, projectRoot: string): boolean {
  let content: string
  try {
    content = readFileSync(gitFile, "utf8")
  } catch {
    return false
  }
  const firstLine = content.split(/\r?\n/, 1)[0]?.trimEnd() ?? ""
  const match = firstLine.match(/^gitdir:\s*(.+?)\s*$/)
  if (!match || !match[1]) return false
  const gitdir = match[1]
  // Resolve relative to the .git file's parent directory
  const resolved = absolutize(gitdir, dirname(gitFile))
  return isValidGitDir(resolved, projectRoot)
}

function gitConfigWorkTree(value: string): string | null {
  const match = value.match(/^core\.worktree=(.+)$/i)
  if (match?.[1] !== undefined) return match[1]
  if (/^core\.worktree=$/i.test(value)) return ""
  return null
}

function canonicalDirectory(path: string): string | null {
  try {
    if (!statSync(path).isDirectory()) return null
    return realpathSync(path)
  } catch {
    return null
  }
}

function canonicalPath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
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

/** Git global options that consume a following value (skip option + value). */
const GIT_VALUE_OPTIONS = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
  "--exec-path",
  "--super-prefix",
])

/** Git global flags that do NOT consume a following value (skip flag only). */
const GIT_FLAG_OPTIONS = new Set([
  "--no-pager",
  "--paginate",
  "--bare",
  "--literal-pathspecs",
  "--no-optional-locks",
])

/** Git post-subcommand options that consume a following value.
 *  Used by hasHelpFlag to skip option+value so that --help used as
 *  an option value is not mistaken for a help flag.
 *  -u / --local-user is subcommand-specific: value-consuming only for tag
 *  (--local-user), not for commit/push (--set-upstream). Handled in hasHelpFlag. */
const GIT_POST_VALUE_OPTIONS = new Set([
  "-m", "--message",
  "--author",
  "-F", "--file",
  "--date",
  "-c", "--reuse-message",
  "-C", "--reedit-message",
  "--template",
  "--trailer",
  "--repo",
  "--receive-pack",
  "-o", "--push-option",
  "--exec",
  "--onto",
  "--strategy", "--strategy-option",
])

/** Tag-specific options that consume a following value.
 *  Only treated as value-consuming when subcommand is "tag". */
const GIT_TAG_VALUE_OPTIONS = new Set(["-u", "--local-user"])

/** Git subcommands that mutate the repository or push to remotes. */
const GIT_WRITE_SUBCOMMANDS = new Set([
  "commit",
  "push",
  "tag",
  "reset",
  "rebase",
  "cherry-pick",
  "revert",
])

const BUILTIN_AGENT_ALIASES = new Set(["oracle", "explore"])

type GitCommandToken = { text: string; quoted: boolean; startsQuoted?: boolean }

const ESCAPED_GIT_SEPARATOR_CHARS = new Map<string, string>([
  [";", "\uE000"],
  ["&", "\uE001"],
  ["|", "\uE002"],
])

/** Shell command separators including single `&` for cmd /c compatibility. */
const GIT_COMMAND_SEPARATORS = new Set([";", "&&", "||", "|", "&"])

/**
 * Check if a shell command string contains a git write operation.
 *
 * Splits the command into segments at shell separators (`;`, `&&`, `||`, `|`, `&`).
 * For each segment:
 * - Shell wrappers (`pwsh -c`, `powershell -Command`, `cmd /c`) are recursively inspected.
 * - A leading `git` token triggers git subcommand classification within that segment only.
 *
 * Scans are bounded to the current segment — tokens after separators are not visible
 * to `reset --hard` or `tag` listing logic within the segment.
 *
 * Only `reset --hard` is blocked; non-hard `git reset` is allowed.
 * `git tag` is only blocked for create/delete, not for listing (`-l`, `--list`, or bare).
 * `git help` and `git --help` are treated as read-only.
 */
export function isGitWriteCommand(command: string): boolean {
  return containsGitWriteTokens(tokenizeGitCommand(command))
}

/** Core git-write check operating on pre-tokenized GitCommandTokens.
 *  Splits separators, splits into segments, and checks each segment
 *  for git write subcommands — including recursive wrapper inspection. */
function containsGitWriteTokens(tokens: GitCommandToken[]): boolean {
  // Split glued separators only in unquoted tokens.
  const splitTokens = splitGitSeparators(tokens)

  // Split into segments bounded by shell separators.
  const segments = splitIntoSegmentsGit(splitTokens)

  for (const segment of segments) {
    if (segment.length === 0) continue

    // Detect shell wrappers at the start of this segment only.
    const segWrapper = extractWrapperScriptGit(segment)
    if (segWrapper !== null) {
      // Leading quoted token = shell script string (e.g. pwsh -c "git status;git commit -m x").
      // Parse it as a full command so internal separators are handled at the shell level.
      // Additional tokens after a quoted PowerShell/cmd payload are wrapper arguments,
      // not part of the script string, and must not hide writes in the script.
      if (segWrapper[0]?.quoted) {
        if (isGitWriteCommand(segWrapper[0]!.text)) return true
      } else {
        // Multiple tokens or unquoted payload: process with quote metadata preserved
        // so that quoted ordinary args (e.g. -m "hi;bye") are not split into command boundaries.
        if (containsGitWriteTokens(segWrapper)) return true
      }
      continue
    }

    // Only match git at the start of a segment (case-insensitive, .exe suffix normalized)
    if (normalizeCommandName(segment[0]!.text) !== "git") continue

    // Map segment tokens to plain strings for subcommand helpers.
    const segTexts = segment.map((t) => t.text)

    const subIdx = findGitSubcommandIndex(segTexts, 1)
    if (subIdx === -1) continue
    const subcommand = segTexts[subIdx]
    if (subcommand === undefined || !GIT_WRITE_SUBCOMMANDS.has(subcommand)) continue
    // --help anywhere after the subcommand means this is a help request (read-only)
    if (hasHelpFlag(segTexts, subIdx + 1, subcommand)) continue
    // reset requires --hard (bounded to this segment)
    if (subcommand === "reset" && !hasResetHardFlag(segTexts, subIdx + 1)) continue
    // tag: only block create/delete, not list (bounded to this segment)
    if (subcommand === "tag" && isTagListOnly(segTexts, subIdx + 1)) continue
    return true
  }
  return false
}

/** Split GitCommandTokens on glued shell separators (`;`, `&&`, `||`, `|`, `&`) only in unquoted tokens.
 *  Quoted tokens are passed through unsplit so that separators inside quoted strings
 *  (e.g. `-m "hi;bye"`) are not mistaken for command boundaries. */
function splitGitSeparators(tokens: GitCommandToken[]): GitCommandToken[] {
  const result: GitCommandToken[] = []
  // Match longer separators first so `||` is not split as two `|` tokens.
  const sepRe = /(&&|\|\||[;&|])/g
  for (const token of tokens) {
    // Quoted tokens are passed through unsplit.
    if (token.quoted) {
      result.push(token)
      continue
    }
    // Fast path: no separator characters at all.
    if (!/[;&|]/.test(token.text)) {
      result.push(token)
      continue
    }
    const parts = token.text.split(sepRe)
    for (const part of parts) {
      if (part !== undefined && part !== "") {
        result.push({ text: restoreEscapedGitSeparators(part), quoted: false })
      }
    }
  }
  return result
}

/** Split GitCommandTokens into command segments separated by `;`, `&&`, `||`, `|`, or `&`. */
function splitIntoSegmentsGit(tokens: GitCommandToken[]): GitCommandToken[][] {
  const segments: GitCommandToken[][] = []
  let current: GitCommandToken[] = []
  for (const token of tokens) {
    if (GIT_COMMAND_SEPARATORS.has(token.text)) {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }
    } else {
      current.push(token)
    }
  }
  if (current.length > 0) segments.push(current)
  return segments
}

/** If the segment starts with a shell wrapper (`pwsh`, `powershell`, `cmd`,
 *  each optionally with `.exe`), scan forward from position 1 for the
 *  payload-delimiter flag and return tokens after it.
 *
 *  pwsh / powershell: find first `-c` or `-command` (case-insensitive) after
 *    segment[0]; payload starts after that flag. Common flags like `-NoProfile`
 *    before `-c` are skipped.
 *  cmd: find first `/c` (case-insensitive) after segment[0]; payload starts
 *    after that flag. `/d` before `/c` is skipped.
 *
 *  Only checks at segment start — wrapper words in plain arguments
 *  (e.g. `echo pwsh -c x`) are not mistaken for wrappers. */
function extractWrapperScriptGit(segment: GitCommandToken[]): GitCommandToken[] | null {
  if (segment.length < 3) return null
  const cmd = normalizeCommandName(segment[0]!.text)

  if (cmd === "pwsh" || cmd === "powershell") {
    // Find first -c or -Command flag (case-insensitive) after position 0
    for (let i = 1; i < segment.length; i++) {
      const t = segment[i]!.text.toLowerCase()
      if (t === "-c" || t === "-command") {
        return segment.slice(i + 1)
      }
    }
    return null
  }

  if (cmd === "cmd") {
    // Find first /c flag (case-insensitive) after position 0
    for (let i = 1; i < segment.length; i++) {
      const t = segment[i]!.text.toLowerCase()
      if (t === "/c") {
        return segment.slice(i + 1)
      }
    }
    return null
  }

  return null
}

/** Detect PowerShell-style git environment assignments in a non-git segment.
 *  Returns extracted values for `$env:GIT_DIR` and `$env:GIT_WORK_TREE`
 *  (case-insensitive env var name). Values are absolutized against baseDir.
 *  Returns null if no git env assignment is found. */
function extractGitEnvAssignment(
  segment: GitCommandToken[],
  baseDir: string,
  shell: "pwsh" | "cmd",
): { gitDir?: string; workTree?: string } | null {
  let gitDir: string | undefined
  let workTree: string | undefined
  let found = false

  for (let i = 0; i < segment.length; i++) {
    const t = segment[i]!.text
    if (shell === "cmd" && i === 0 && normalizeCommandName(t) === "set") {
      const assignment = segment[i + 1]?.text
      const cmdEnv = assignment?.match(/^(GIT_DIR|GIT_WORK_TREE)=(.*)$/i)
      if (cmdEnv) {
        found = true
        const varName = cmdEnv[1]!.toUpperCase()
        const value = cmdEnv[2]!
        if (varName === "GIT_DIR") {
          gitDir = value
        } else if (varName === "GIT_WORK_TREE") {
          workTree = value
        }
      }
      continue
    }
    if (shell !== "pwsh" || i !== 0 || segment[i]!.startsQuoted === true) continue
    // Match $env:GIT_DIR=value, $env:GIT_WORK_TREE=value (case-insensitive var)
    // PowerShell separator is ; so we look for assignments before ; or end-of-segment
    const envMatch = t.match(/^\$env:(GIT_DIR|GIT_WORK_TREE)=(.*)$/i)
    if (envMatch) {
      found = true
      const varName = envMatch[1]!.toUpperCase()
      let value = envMatch[2]!
      // $env:GIT_DIR= "value" — = is fused with var name, value is in the next token
      if (value.length === 0 && segment[i + 1]?.text !== undefined) {
        value = segment[i + 1]!.text
        i += 1
      }
      // The value might include trailing ; for chained assignments
      const cleanValue = value.split(";")[0]!
      if (varName === "GIT_DIR") {
        gitDir = cleanValue
      } else if (varName === "GIT_WORK_TREE") {
        workTree = cleanValue
      }
      continue
    }

    const spacedEnvMatch = t.match(/^\$env:(GIT_DIR|GIT_WORK_TREE)$/i)
    if (spacedEnvMatch) {
      const nextToken = segment[i + 1]?.text
      if (nextToken === "=" && segment[i + 2]?.text !== undefined) {
        // $env:GIT_DIR = value
        found = true
        const varName = spacedEnvMatch[1]!.toUpperCase()
        const value = segment[i + 2]!.text
        if (varName === "GIT_DIR") {
          gitDir = value
        } else if (varName === "GIT_WORK_TREE") {
          workTree = value
        }
        i += 2
      } else if (nextToken?.startsWith("=")) {
        // $env:GIT_DIR ="value" or $env:GIT_DIR =value — = is fused with the value
        found = true
        const varName = spacedEnvMatch[1]!.toUpperCase()
        const value = nextToken.slice(1)
        if (varName === "GIT_DIR") {
          gitDir = value
        } else if (varName === "GIT_WORK_TREE") {
          workTree = value
        }
        i += 1
      }
    }
  }

  if (!found) return null
  // Strip surrounding quotes from values (e.g. $env:GIT_DIR="C:\path" -> C:\path)
  const unquote = (v: string | undefined): string | undefined => {
    if (v === undefined) return undefined
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1)
    }
    return v
  }
  const unwrappedGitDir = gitDir !== undefined ? unquote(gitDir) : undefined
  const unwrappedWorkTree = workTree !== undefined ? unquote(workTree) : undefined
  // Absolutize env values against baseDir (like explicit --git-dir/--work-tree).
  // Empty env values are NOT absolutized — they stay empty so directory checks
  // reject them instead of resolving to baseDir.
  return {
    gitDir: unwrappedGitDir !== undefined ? (unwrappedGitDir.length === 0 ? "" : absolutize(unwrappedGitDir, baseDir)) : undefined,
    workTree: unwrappedWorkTree !== undefined ? (unwrappedWorkTree.length === 0 ? "" : absolutize(unwrappedWorkTree, baseDir)) : undefined,
  }
}

/** Find the index of the git subcommand after `start`, skipping global options.
 * Returns -1 for help invocations (`git help`, `git --help`). */
function findGitSubcommandIndex(tokens: string[], start: number): number {
  let i = start
  while (i < tokens.length) {
    const token = tokens[i]
    if (token === undefined) return -1
    // -- ends option parsing; next token is the subcommand (if any)
    if (token === "--") return i + 1 < tokens.length ? i + 1 : -1
    // --help/-h anywhere before the subcommand means the command is a help request
    if (token === "--help" || token === "-h") return -1
    // Value-consuming global option: skip option and its value
    if (GIT_VALUE_OPTIONS.has(token)) {
      i += 2
      continue
    }
    // Standalone flag or unknown long option: skip one token
    if (GIT_FLAG_OPTIONS.has(token) || token.startsWith("--")) {
      i += 1
      continue
    }
    // Unknown short option (e.g. -C, -v): skip conservatively (one token only)
    if (token.startsWith("-") && token.length > 1) {
      i += 1
      continue
    }
    // First non-option token is the subcommand
    if (token === "help") return -1 // git help <anything> is read-only
    return i
  }
  return -1
}

/** `git tag` with no name, `-l`, or `--list` is read-only listing — not a write.
 *  Once list mode (`-l`/`--list`) is seen before `--`, remaining non-option
 *  operands are list patterns, not tag-name writes — unless a write option
 *  (`-d`, `-a`, `-s`, `-m`, `-u` or their long forms) also appears.
 *  Tag filter options (`--contains`, `--no-contains`, `--merged`, `--no-merged`,
 *  `--points-at`) imply read-only list/filter mode and consume the following value.
 *  Display/verify/list options (`-n`, `-v`, `--sort`, `--format`, `--ignore-case`)
 *  imply read-only mode. `--sort=...` and `--format=...` are single-token forms.
 *  Returns true only when no write signal appears and at least bare-list
 *  or list-mode semantics remain. */
function isTagListOnly(tokens: string[], start: number): boolean {
  let listMode = false
  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === undefined) continue
    if (t === "--") {
      // -- ends option parsing. If we're in list mode and no write option
      // has appeared, operands after -- are list patterns → read-only.
      // But if we're not in list mode, operands after -- are tag names → write.
      return listMode
    }
    if (t === "-d" || t === "--delete" || t === "-a" || t === "--annotate" || t === "-s" || t === "--sign" || t === "-m" || t === "--message" || t === "-u" || t === "--local-user") {
      return false
    }
    if (t === "-l" || t === "--list" || t === "-n" || t === "-v" || t === "--ignore-case" || t === "-i" || t === "--verify"
        || (t.startsWith("-n") && /^-n\d+$/.test(t))
        || t === "--column" || t.startsWith("--column=") || t === "--no-column"
        || t === "--color" || t.startsWith("--color=") || t === "--no-color"
        || t === "--omit-empty") {
      listMode = true
      continue
    }
    // --sort[=...] and --format[=...]: single-token or value-consuming forms
    if (t === "--sort" || t.startsWith("--sort=") || t === "--format" || t.startsWith("--format=")) {
      listMode = true
      // --sort=... / --format=... are single-token; --sort / --format consume next token
      if (t === "--sort" || t === "--format") {
        i += 1 // skip the value consumed by this option
      }
      continue
    }
    // Tag filter options (fused `=` form): single-token, no value to skip
    if (t.startsWith("--contains=") || t.startsWith("--no-contains=") || t.startsWith("--merged=") || t.startsWith("--no-merged=") || t.startsWith("--points-at=")) {
      listMode = true
      continue
    }
    // Tag filter options (space-separated form): consume next token as value
    if (t === "--contains" || t === "--no-contains" || t === "--merged" || t === "--no-merged" || t === "--points-at") {
      listMode = true
      i += 1 // skip the value consumed by this option
      continue
    }
    // Non-option token: if list mode is active, it's a list pattern (read-only).
    // If not, it's a tag name → write.
    if (!t.startsWith("-")) {
      if (!listMode) return false
      // In list mode, non-option tokens are patterns — still read-only
      continue
    }
    // Unknown option flag — skip it (conservative: assume it doesn't signal a write)
  }
  // Reached end of tokens without a write option.
  // Bare `git tag` or `git tag -l`/`git tag --list` with only patterns → read-only.
  return true
}

/** Check whether `reset` is followed by `--hard` before `--` end-of-options.
 *  `--hard` after `--` is a path operand, not a reset mode flag. */
function hasResetHardFlag(tokens: string[], start: number): boolean {
  for (let i = start; i < tokens.length; i++) {
    if (tokens[i] === "--") return false
    if (tokens[i] === "--hard") return true
  }
  return false
}

/** Check whether a `--help` or `-h` flag appears after the subcommand.
 *  `--help`/`-h` used as an option value (e.g. `-m --help`, `-m -h`, `--author --help`) or after `--` is NOT a help flag.
 *  Value-consuming post-subcommand options skip the following token so that
 *  `--help` appearing as an option value is not mistaken for a help flag.
 *  `-u`/`--local-user` only consumes a value for the `tag` subcommand
 *  (where it means `--local-user`); for other subcommands it's `--set-upstream`
 *  or a regular flag and does not consume a following token. */
function hasHelpFlag(tokens: string[], start: number, subcommand?: string): boolean {
  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === undefined) continue
    if (t === "--") return false // --help/-h after -- is an operand, not a flag
    if (GIT_POST_VALUE_OPTIONS.has(t)) {
      i += 1 // skip the value consumed by this option
      continue
    }
    // -u/--local-user only consumes a value for the tag subcommand
    if (subcommand === "tag" && GIT_TAG_VALUE_OPTIONS.has(t)) {
      i += 1
      continue
    }
    if (t === "--help" || t === "-h") return true
  }
  return false
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

function safeStatDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory()
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

/** Quote-aware tokenizer for git command parsing.
 *  Preserves whether each token came from double/single quotes so that
 *  separators inside quoted strings are not split into command boundaries. */
function tokenizeGitCommand(command: string): GitCommandToken[] {
  const tokens: GitCommandToken[] = []
  let current = ""
  let quoted = false
  let startsQuoted = false
  let quote: "'" | '"' | null = null

  const push = () => {
    if (current.length > 0 || quoted) tokens.push({ text: current, quoted, startsQuoted })
    current = ""
    quoted = false
    startsQuoted = false
  }

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (ch === undefined) continue

    if (ch === "`") {
      const next = command[i + 1]
      if (next !== undefined) {
        current += ESCAPED_GIT_SEPARATOR_CHARS.get(next) ?? next
        quoted = quoted || quote !== null
        i += 1
      }
      continue
    }

    if (quote !== null) {
      if (ch === quote) {
        if (command[i + 1] === quote) {
          current += quote
          i += 1
        } else {
          quote = null
        }
      } else {
        current += ch
      }
      continue
    }

    if (/\s/.test(ch)) {
      push()
    } else if (quoted && /[;&|]/.test(ch)) {
      push()
      current += ch
    } else if (ch === '"' || ch === "'") {
      if (current.length === 0 && !quoted) startsQuoted = true
      quoted = true
      quote = ch
    } else {
      current += ch
    }
  }

  push()
  return tokens
}

function restoreEscapedGitSeparators(text: string): string {
  let restored = text
  for (const [separator, placeholder] of ESCAPED_GIT_SEPARATOR_CHARS) {
    restored = restored.replaceAll(placeholder, separator)
  }
  return restored
}

/** Normalize a command name for comparison: lowercase and strip .exe suffix. */
function normalizeCommandName(text: string): string {
  const unquoted = ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
    ? text.slice(1, -1)
    : text
  const lower = unquoted.toLowerCase()
  const base = lower.split(/[\\/]/).pop() ?? lower
  return base.endsWith(".exe") ? base.slice(0, -4) : base
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
