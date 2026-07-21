import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export type ProbeStatus = "PASS" | "FAIL" | "SKIP" | "DEFER"
export type XdgState = "unknown" | "isolated" | "escaped"

export type NormalizedFacts = {
  host: {
    openCodeAvailable: boolean
    openCodeVersion: string | null
    openCodeSha256: string | null
    platform: string
    providerModel: string | null
    ocmmRevision: string | null
    worktreeDirty: boolean
  }
  prerequisites: {
    providerConfigAvailable: boolean
    modelAvailable: boolean
    buildArtifactsAvailable: boolean
    directLspSmoke: boolean
  }
  safety: {
    xdgState: XdgState
    secretsAbsent: boolean
    cleanupComplete: boolean
  }
  registration: {
    ocmmLoaded: boolean
    isolatedProjectConfig: boolean
    lspConnected: boolean
    probeConnected: boolean
  }
  execute: {
    featureUnsupported: boolean
    activationAmbiguous: boolean
    modelDeclinedTwice: boolean
    timedOut: boolean
    permissionBlocked: boolean
    outputClassifiable: boolean
    outerBeforeCount: number
    outerAfterCount: number
    outerArgumentKeys: string[]
    exactCode: boolean
    executeProbeMarker: boolean
    deniedHidden: boolean
    lspOk: boolean
    identityOk: boolean
    hookPayloadOk: boolean
    emittedTask: boolean
  }
  hooks: {
    nestedBefore: string[]
    nestedAfter: string[]
    allNestedCallIdsPresent: boolean
    completedMetadataTools: string[]
  }
  mcpEvents: string[]
  cleanup: {
    attemptCount: number
    pidLedgerComplete: boolean
    trackedPids: number
    remainingPids: number
    attemptRootsRemoved: number
    removalAttempted: boolean
    removalFailed: boolean
    parentRootRemoved: boolean
  }
}

export type ProbeResult = {
  status: ProbeStatus
  reasonCode: string
  exitCode: 0 | 2 | 3 | 4
  goNoGo: "GO" | "NO-GO" | "NO-DECISION"
}

export const REQUIRED_NESTED_TOOLS = [
  "lsp_status",
  "codemode_probe_identity",
  "codemode_probe_json_error",
] as const

const EXIT = { PASS: 0, FAIL: 2, SKIP: 3, DEFER: 4 } as const

function result(status: ProbeStatus, reasonCode: string): ProbeResult {
  return {
    status,
    reasonCode,
    exitCode: EXIT[status],
    goNoGo: status === "PASS" ? "GO" : status === "FAIL" ? "NO-GO" : "NO-DECISION",
  }
}

function count(values: readonly string[], expected: string): number {
  return values.filter((value) => value === expected).length
}

function exactlyRequired(values: readonly string[], required: readonly string[]): boolean {
  return values.length === required.length && required.every((value) => count(values, value) === 1)
}

export function classifyProbe(facts: NormalizedFacts): ProbeResult {
  if (
    !facts.safety.cleanupComplete ||
    !facts.cleanup.pidLedgerComplete ||
    !facts.cleanup.removalAttempted ||
    facts.cleanup.removalFailed ||
    !facts.cleanup.parentRootRemoved ||
    facts.cleanup.attemptRootsRemoved !== facts.cleanup.attemptCount ||
    facts.cleanup.remainingPids > 0
  ) {
    return result("FAIL", "cleanup-incomplete")
  }
  if (facts.safety.xdgState === "escaped") return result("FAIL", "xdg-isolation-failed")
  if (!facts.safety.secretsAbsent) return result("FAIL", "sanitized-evidence-leak")

  if (!facts.prerequisites.providerConfigAvailable) return result("SKIP", "provider-config-unavailable")
  if (!facts.prerequisites.modelAvailable) return result("SKIP", "model-unavailable")
  if (facts.execute.timedOut) return result("DEFER", "host-command-timeout")
  if (facts.execute.permissionBlocked) return result("DEFER", "permission-blocked")
  if (!facts.execute.outputClassifiable) return result("DEFER", "unclassifiable-output")
  if (!facts.host.openCodeAvailable) return result("SKIP", "opencode-not-found")
  if (!facts.prerequisites.buildArtifactsAvailable) return result("SKIP", "build-artifacts-unavailable")
  if (!facts.host.openCodeVersion?.trim()) return result("FAIL", "host-version-missing")
  if (!facts.host.openCodeSha256 || !/^[a-f0-9]{64}$/i.test(facts.host.openCodeSha256)) {
    return result("FAIL", "host-binary-hash-missing")
  }
  if (!facts.prerequisites.directLspSmoke) return result("FAIL", "direct-lsp-smoke-failed")
  if (facts.safety.xdgState === "unknown") return result("DEFER", "xdg-unobserved")
  if (!facts.registration.ocmmLoaded) return result("FAIL", "ocmm-plugin-not-loaded")
  if (!facts.registration.isolatedProjectConfig) return result("FAIL", "non-isolated-ocmm-config")
  if (!facts.registration.lspConnected) return result("FAIL", "lsp-mcp-not-connected")
  if (!facts.registration.probeConnected) return result("FAIL", "probe-mcp-not-connected")

  if (facts.execute.featureUnsupported) return result("SKIP", "codemode-unsupported-by-host")
  if (facts.execute.activationAmbiguous) return result("DEFER", "codemode-activation-ambiguous")
  if (facts.execute.modelDeclinedTwice) return result("DEFER", "model-did-not-call-execute")
  if (facts.cleanup.attemptCount < 1 || facts.cleanup.attemptCount > 2) {
    return result("FAIL", "attempt-topology-invalid")
  }
  if (facts.cleanup.trackedPids <= 0) return result("FAIL", "tracked-process-evidence-missing")
  if (!facts.execute.exactCode) return result("FAIL", "execute-code-mismatch")
  if (
    facts.execute.outerBeforeCount !== 1 ||
    facts.execute.outerAfterCount !== 1 ||
    count(facts.execute.outerArgumentKeys, "code") !== 1
  ) {
    return result("FAIL", "execute-hook-count-invalid")
  }
  if (
    !exactlyRequired(facts.hooks.nestedBefore, REQUIRED_NESTED_TOOLS) ||
    !exactlyRequired(facts.hooks.nestedAfter, REQUIRED_NESTED_TOOLS) ||
    !exactlyRequired(facts.hooks.completedMetadataTools, REQUIRED_NESTED_TOOLS)
  ) {
    return result("FAIL", "nested-hook-count-invalid")
  }
  if (!facts.hooks.allNestedCallIdsPresent) return result("FAIL", "nested-call-id-missing")
  if (!facts.execute.deniedHidden || facts.mcpEvents.includes("tools/call:denied")) {
    return result("FAIL", "denied-tool-visible-or-called")
  }
  if (
    facts.execute.emittedTask ||
    facts.hooks.nestedBefore.includes("task") ||
    facts.hooks.nestedAfter.includes("task")
  ) {
    return result("FAIL", "unexpected-task-dispatch")
  }
  if (
    !facts.execute.executeProbeMarker ||
    !facts.execute.lspOk ||
    !facts.execute.identityOk ||
    !facts.execute.hookPayloadOk
  ) {
    return result("FAIL", "nested-result-propagation-failed")
  }
  if (
    count(facts.mcpEvents, "tools/call:identity") !== 1 ||
    count(facts.mcpEvents, "tools/call:json_error") !== 1
  ) {
    return result("FAIL", "nested-mcp-count-invalid")
  }
  return result("PASS", "all-required-probes-passed")
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

const UNSAFE_EVIDENCE_STRING = /api[ _-]?key|authorization|bearer\s+|session[ _-]?id|call[ _-]?id|\b(?:sk-|ghp_|AKIA|xox[bpars]-)|(?:^[A-Za-z]:[\\/]|[A-Za-z]:\\|\\\\|(?:^|[\s"'([{=,:])\/(?:[^/\s]+(?:\/|$)))/i

function assertSafeEvidence(value: unknown, key = "root"): void {
  if (typeof value === "string") {
    if (UNSAFE_EVIDENCE_STRING.test(value)) throw new Error(`unsafe evidence string at ${key}`)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeEvidence(item, `${key}[${index}]`))
    return
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      if (/api[ _-]?key|authorization|bearer|token|secret|password|credential|session[ _-]?id|call[ _-]?id/i.test(childKey)) {
        throw new Error(`unsafe evidence key at ${key}.${childKey}`)
      }
      assertSafeEvidence(child, `${key}.${childKey}`)
    }
  }
}

export function sanitizeFixture(facts: NormalizedFacts, probeResult: ProbeResult): Record<string, unknown> {
  const fixture: Record<string, unknown> = {
    schemaVersion: 1,
    status: probeResult.status,
    reasonCode: probeResult.reasonCode,
    goNoGo: probeResult.goNoGo,
    host: {
      openCodeVersion: facts.host.openCodeVersion,
      openCodeSha256: facts.host.openCodeSha256,
      platform: facts.host.platform,
      providerModel: facts.host.providerModel,
      ocmmRevision: facts.host.ocmmRevision,
      worktreeDirty: facts.host.worktreeDirty,
      featureFlag: "OPENCODE_EXPERIMENTAL_CODE_MODE",
    },
    isolation: {
      xdgState: facts.safety.xdgState,
      projectConfigIsolated: facts.registration.isolatedProjectConfig,
    },
    registration: {
      ocmmLoaded: facts.registration.ocmmLoaded,
      lspConnected: facts.registration.lspConnected,
      probeConnected: facts.registration.probeConnected,
      directLspSmoke: facts.prerequisites.directLspSmoke,
    },
    execute: {
      outerBeforeCount: facts.execute.outerBeforeCount,
      outerAfterCount: facts.execute.outerAfterCount,
      argumentKeys: sortedUnique(facts.execute.outerArgumentKeys),
      timedOut: facts.execute.timedOut,
      permissionBlocked: facts.execute.permissionBlocked,
      outputClassifiable: facts.execute.outputClassifiable,
      exactCode: facts.execute.exactCode,
      executeProbeMarker: facts.execute.executeProbeMarker,
      lspOk: facts.execute.lspOk,
      identityOk: facts.execute.identityOk,
      hookPayloadOk: facts.execute.hookPayloadOk,
      emittedTask: facts.execute.emittedTask,
    },
    permissions: {
      deniedTool: "codemode_probe_denied",
      deniedHidden: facts.execute.deniedHidden,
      deniedCalled: facts.mcpEvents.includes("tools/call:denied"),
    },
    hooks: {
      nestedBefore: [...facts.hooks.nestedBefore].sort(),
      nestedAfter: [...facts.hooks.nestedAfter].sort(),
      completedMetadataTools: [...facts.hooks.completedMetadataTools].sort(),
      allNestedToolsIdentified: facts.hooks.allNestedCallIdsPresent,
    },
    mcp: {
      identityCount: count(facts.mcpEvents, "tools/call:identity"),
      jsonErrorCount: count(facts.mcpEvents, "tools/call:json_error"),
      deniedCount: count(facts.mcpEvents, "tools/call:denied"),
    },
    cleanup: {
      attemptCount: facts.cleanup.attemptCount,
      pidLedgerComplete: facts.cleanup.pidLedgerComplete,
      trackedPids: facts.cleanup.trackedPids,
      remainingPids: facts.cleanup.remainingPids,
      attemptRootsRemoved: facts.cleanup.attemptRootsRemoved,
      removalAttempted: facts.cleanup.removalAttempted,
      removalFailed: facts.cleanup.removalFailed,
      parentRootRemoved: facts.cleanup.parentRootRemoved,
    },
  }
  assertSafeEvidence(fixture)
  return fixture
}

export type ConfigOptions = {
  ocmmPlugin: string
  tracePlugin: string
  nodePath: string
  probeMcp: string
  model?: string
}

export type ChildEnvironmentOptions = {
  runRoot: string
  lspCommand: string[]
  hookTracePath: string
  mcpEventsPath: string
  fixturePidPath: string
  stopSignalPath: string
}

export function deniedToolVisible(searchResult: unknown): boolean {
  if (!isRecord(searchResult) || !Array.isArray(searchResult.items)) return false
  return searchResult.items.some((item) => isRecord(item) && item.path === "tools.codemode_probe.denied")
}

export function buildProbeCode(): string {
  return `const denied = await tools.$codemode.search({ query: "codemode_probe.denied", limit: 50 })
const [lsp, identity, hookPayload] = await Promise.all([
  tools.lsp.status({}),
  tools.codemode_probe.identity({ marker: "OCMM_CODEMODE_EXECUTE_PROBE" }),
  tools.codemode_probe.json_error({}),
])
return {
  marker: "OCMM_CODEMODE_EXECUTE_PROBE",
  deniedVisible: denied.items.some((item) => item.path === "tools.codemode_probe.denied"),
  lspOk: Boolean(lsp),
  identityOk: String(identity).includes("OCMM_CODEMODE_EXECUTE_PROBE"),
  hookPayloadOk: String(hookPayload).includes("OCMM_CODEMODE_HOOK_SENTINEL"),
}`
}

export function buildProbePrompt(): string {
  const code = buildProbeCode()
  return [
    "Call the `execute` tool exactly once.",
    "Pass the following code exactly as the `code` argument; do not call task, bash, or any direct MCP tool.",
    "```js",
    code,
    "```",
    "After execute returns, reply with one short sentence. Do not invent results.",
  ].join("\n")
}

export const SUPPORTED_OPENCODE_VERSION = "1.18.3"

export const OPENCODE_1_18_3_BUNDLED_PROVIDER_NPM_IDS = [
  "@ai-sdk/amazon-bedrock",
  "@ai-sdk/amazon-bedrock/mantle",
  "@ai-sdk/anthropic",
  "@ai-sdk/azure",
  "@ai-sdk/google",
  "@ai-sdk/google-vertex",
  "@ai-sdk/google-vertex/anthropic",
  "@ai-sdk/openai",
  "@ai-sdk/openai-compatible",
  "@openrouter/ai-sdk-provider",
  "@ai-sdk/xai",
  "@ai-sdk/mistral",
  "@ai-sdk/groq",
  "@ai-sdk/deepinfra",
  "@ai-sdk/cerebras",
  "@ai-sdk/cohere",
  "@ai-sdk/gateway",
  "@ai-sdk/togetherai",
  "@ai-sdk/perplexity",
  "@ai-sdk/vercel",
  "@ai-sdk/alibaba",
  "gitlab-ai-provider",
  "@ai-sdk/github-copilot",
  "venice-ai-sdk-provider",
] as const

const BUNDLED_PROVIDER_NPM_IDS = new Set<string>(OPENCODE_1_18_3_BUNDLED_PROVIDER_NPM_IDS)

function bundledNpm(value: unknown): value is string {
  return typeof value === "string" && BUNDLED_PROVIDER_NPM_IDS.has(value)
}

function usableProviderObject(value: unknown): value is Record<string, Record<string, unknown>> {
  if (!isRecord(value)) return false
  const entries = Object.entries(value)
  return entries.length > 0 && entries.every(([name, config]) => {
    if (!name.trim() || !isRecord(config) || !isRecord(config.models)) return false
    if (Object.hasOwn(config, "npm") && !bundledNpm(config.npm)) return false
    const providerNpm = bundledNpm(config.npm) ? config.npm : null
    const models = Object.entries(config.models)
    return models.length > 0 && models.every(([modelName, model]) => {
      if (!modelName.trim() || !isRecord(model)) return false
      if (model.provider !== undefined && !isRecord(model.provider)) return false
      const modelProvider = isRecord(model.provider) ? model.provider : null
      if (modelProvider && Object.hasOwn(modelProvider, "npm") && !bundledNpm(modelProvider.npm)) return false
      return bundledNpm(modelProvider?.npm) || providerNpm !== null
    })
  })
}

function providerDeclaresModel(
  providers: Record<string, Record<string, unknown>>,
  model: string,
): boolean {
  const [providerID, modelID] = model.split("/")
  if (!providerID || !modelID) return false
  const provider = providers[providerID]
  return isRecord(provider?.models) && Object.hasOwn(provider.models, modelID)
}

function validStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.trim().length > 0)) return null
  return [...value]
}

export function buildOpenCodeConfig(base: Record<string, unknown>, options: ConfigOptions): Record<string, unknown> {
  if (!usableProviderObject(base.provider)) {
    throw new Error("provider config must use only bundled provider SDK routes")
  }
  if (options.model && !providerDeclaresModel(base.provider, options.model)) {
    throw new Error("provider config must declare the selected bundled provider model")
  }
  const enabledProviders = validStringArray(base.enabled_providers)
  const disabledProviders = validStringArray(base.disabled_providers)
  return {
    ...(typeof base.$schema === "string" && base.$schema.trim() ? { $schema: base.$schema } : {}),
    provider: base.provider,
    ...(enabledProviders ? { enabled_providers: enabledProviders } : {}),
    ...(disabledProviders ? { disabled_providers: disabledProviders } : {}),
    share: "disabled",
    autoupdate: false,
    plugin: [options.ocmmPlugin, options.tracePlugin],
    mcp: {
      codemode_probe: {
        type: "local",
        command: [options.nodePath, options.probeMcp],
        enabled: true,
      },
    },
    permission: {
      task: "deny",
      bash: "deny",
      execute: "allow",
      "lsp_*": "allow",
      "codemode_probe_*": "allow",
      codemode_probe_denied: "deny",
    },
  }
}

export function buildChildEnvironment(
  base: NodeJS.ProcessEnv,
  options: ChildEnvironmentOptions,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }
  const controlledKeys = new Set([
    "HOME",
    "USERPROFILE",
    "OPENCODE_CONFIG",
    "OPENCODE_CONFIG_CONTENT",
    "OPENCODE_CONFIG_DIR",
    "OPENCODE_PERMISSION",
    "OPENCODE_DISABLE_PROJECT_CONFIG",
    "OPENCODE_PURE",
    "OPENCODE_PLUGIN_META_FILE",
    "OPENCODE_AUTO_SHARE",
    "OPENCODE_TEST_HOME",
    "OPENCODE_TEST_MANAGED_CONFIG_DIR",
    "OCMM_FAST",
    "OCMM_PROFILE",
    "OCMM_NO_PROFILE",
  ])
  for (const key of Object.keys(env)) {
    if (controlledKeys.has(key.toUpperCase())) delete env[key]
  }
  env.HOME = options.runRoot
  env.USERPROFILE = options.runRoot
  env.OPENCODE_CONFIG = join(options.runRoot, "opencode.json")
  env.OPENCODE_DISABLE_PROJECT_CONFIG = "1"
  env.OPENCODE_TEST_HOME = options.runRoot
  env.OPENCODE_TEST_MANAGED_CONFIG_DIR = join(options.runRoot, "managed-config")
  env.XDG_CONFIG_HOME = join(options.runRoot, "xdg-config")
  env.XDG_DATA_HOME = join(options.runRoot, "xdg-data")
  env.XDG_STATE_HOME = join(options.runRoot, "xdg-state")
  env.XDG_CACHE_HOME = join(options.runRoot, "xdg-cache")
  env.OCMM_DEBUG = "1"
  env.OPENCODE_EXPERIMENTAL = "false"
  env.OPENCODE_EXPERIMENTAL_CODE_MODE = "true"
  env.OCMM_LSP_COMMAND = JSON.stringify(options.lspCommand)
  env.OCMM_CODEMODE_TRACE_PATH = options.hookTracePath
  env.OCMM_CODEMODE_PROBE_EVENTS = options.mcpEventsPath
  env.OCMM_CODEMODE_PROBE_PID_FILE = options.fixturePidPath
  env.OCMM_CODEMODE_STOP_PATH = options.stopSignalPath
  env.OCMM_CODEMODE_EXPECTED_CODE_SHA256 = createHash("sha256").update(buildProbeCode()).digest("hex")
  return env
}

export type AttemptPidLedger = {
  host: number[]
  wrapper: number[]
  fixture: number[]
  native: number[]
}

export type AttemptCleanupEvidence = {
  pidLedgerComplete: boolean
  trackedPids: number
  remainingPids: number
  terminationAttempted: boolean
  removalAttempted: boolean
  removalFailed: boolean
  rootRemoved: boolean
}

export type AttemptRecord = {
  id: "attempt-1" | "attempt-2"
  rootPath: string
  pids: AttemptPidLedger
  facts: Omit<NormalizedFacts, "cleanup">
  cleanup: AttemptCleanupEvidence
}

export type CliOptions = {
  providerConfig: string | null
  model: string | null
  fixtureOut: string
  opencode: string
  timeoutMs: number
}

export type LiveProbeOptions = CliOptions & { providerConfig: string; model: string }

export type CommandOptions = {
  cwd: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
  input?: string
}

export type CommandResult = {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  pid: number | null
}

export type RunAttemptContext = {
  id: "attempt-1" | "attempt-2"
  rootPath: string
  options: LiveProbeOptions
  runCommand?: typeof runCommand
  nativeLspPath?: string
}

export type RunAttemptFn = (context: RunAttemptContext) => Promise<AttemptRecord>

export type TopologyCleanupResult = {
  attempts: AttemptRecord[]
  aggregate: NormalizedFacts["cleanup"]
  residualRoots: string[]
}

export type ProbeDependencies = {
  removeRoot?: (path: string) => void
  runAttempt?: RunAttemptFn
  runCommand?: typeof runCommand
  writeFixture?: (path: string, contents: string) => void
  writeStdout?: (text: string) => void
  writeStderr?: (text: string) => void
}

export type ProbeOutcome = {
  facts: NormalizedFacts
  result: ProbeResult
}

class FixtureFinalizationError extends Error {
  readonly probeResult: ProbeResult

  constructor(probeResult: ProbeResult) {
    super("safe fixture fallback unavailable")
    this.name = "FixtureFinalizationError"
    this.probeResult = probeResult
  }
}

type HookTraceFacts = Pick<NormalizedFacts["execute"],
  | "outerBeforeCount"
  | "outerAfterCount"
  | "outerArgumentKeys"
  | "exactCode"
  | "executeProbeMarker"
  | "deniedHidden"
  | "lspOk"
  | "identityOk"
  | "hookPayloadOk"
> & NormalizedFacts["hooks"]

const DYNAMIC_XDG_LABELS = ["data", "bin", "log", "repos", "cache", "config", "state"] as const
const MAX_COMMAND_OUTPUT = 16 * 1024 * 1024
const UNUSABLE_TOOL_IDENTITY = "unusable_tool_identity"
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_FIXTURE = join(REPO_ROOT, "scripts", "fixtures", "opencode-codemode-execute-compatibility.json")

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function pathIsInside(path: string, parent: string): boolean {
  const fromParent = relative(parent, path)
  return fromParent === "" || (!fromParent.startsWith("..") && !isAbsolute(fromParent))
}

function normalizeToolName(value: string): string {
  return value.toLowerCase().replaceAll(".", "_")
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
}

function parseXdgRows(output: string): Array<{ label: typeof DYNAMIC_XDG_LABELS[number]; path: string }> {
  const labels = new Set<string>(DYNAMIC_XDG_LABELS)
  const rows: Array<{ label: typeof DYNAMIC_XDG_LABELS[number]; path: string }> = []
  for (const originalLine of stripAnsi(output).split(/\r?\n/)) {
    const line = originalLine.replace(/^\s*[│|]\s*/, "").trim()
    const match = /^(data|bin|log|repos|cache|config|state)\s+(.+?)\s*$/i.exec(line)
    if (!match || !labels.has(match[1]!.toLowerCase())) continue
    const label = match[1]!.toLowerCase() as typeof DYNAMIC_XDG_LABELS[number]
    const observedPath = match[2]!.trim()
    if (isAbsolute(observedPath)) rows.push({ label, path: resolve(observedPath) })
  }
  return rows
}

export function parseCliOptions(argv: string[]): CliOptions {
  const values = new Map<string, string>()
  const supported = new Set(["--provider-config", "--model", "--fixture-out", "--opencode", "--timeout-ms"])
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith("--") || value === undefined) throw new Error(`invalid argument near ${key ?? "<end>"}`)
    if (!supported.has(key)) throw new Error(`unknown argument: ${key}`)
    values.set(key, value)
  }
  const providerValue = values.get("--provider-config")
  const providerConfig = providerValue && isAbsolute(providerValue) ? resolve(providerValue) : null
  const modelValue = values.get("--model")
  const model = modelValue && /^[^/\s]+\/[^/\s]+$/.test(modelValue) ? modelValue : null
  const fixtureOut = resolve(values.get("--fixture-out") ?? DEFAULT_FIXTURE)
  const timeoutMs = Number(values.get("--timeout-ms") ?? "120000")
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000) {
    throw new Error("--timeout-ms must be an integer >= 1000")
  }
  return {
    providerConfig,
    model,
    fixtureOut,
    opencode: values.get("--opencode") ?? "opencode",
    timeoutMs,
  }
}

export function classifyXdgPaths(output: string, runRoot: string): XdgState {
  const rows = parseXdgRows(output)
  for (const row of rows) {
    if (!pathIsInside(row.path, resolve(runRoot))) return "escaped"
  }
  if (rows.length !== DYNAMIC_XDG_LABELS.length) return "unknown"
  for (const label of DYNAMIC_XDG_LABELS) {
    if (rows.filter((row) => row.label === label).length !== 1) return "unknown"
  }
  return "isolated"
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(record).every((key) => allowed.has(key))
}

export function parseHookTrace(text: string): HookTraceFacts {
  const result: HookTraceFacts = {
    outerBeforeCount: 0,
    outerAfterCount: 0,
    outerArgumentKeys: [],
    exactCode: false,
    executeProbeMarker: false,
    deniedHidden: false,
    lspOk: false,
    identityOk: false,
    hookPayloadOk: false,
    nestedBefore: [],
    nestedAfter: [],
    allNestedCallIdsPresent: true,
    completedMetadataTools: [],
  }
  const nestedIdentityEvidence: boolean[] = []
  for (const line of text.split(/\r?\n/).filter((value) => value.trim().length > 0)) {
    const parsed: unknown = JSON.parse(line)
    if (!isRecord(parsed) || !hasOnlyKeys(parsed, [
      "phase", "tool", "hasSessionID", "hasCallID", "argumentKeys", "nestedStatuses", "safeMarkers",
    ])) throw new Error("invalid hook trace row")
    if ((parsed.phase !== "before" && parsed.phase !== "after") ||
      (typeof parsed.tool !== "string" && parsed.tool !== null)) {
      throw new Error("invalid hook trace phase or tool")
    }
    if (typeof parsed.hasSessionID !== "boolean" || typeof parsed.hasCallID !== "boolean") {
      throw new Error("invalid hook trace identity shape")
    }
    if (!Array.isArray(parsed.argumentKeys) || !parsed.argumentKeys.every((key) => typeof key === "string")) {
      throw new Error("invalid hook trace argument keys")
    }
    if (!Array.isArray(parsed.nestedStatuses) || !isRecord(parsed.safeMarkers) ||
      !hasOnlyKeys(parsed.safeMarkers, ["exactCode", "executeProbe", "deniedHidden", "lspOk", "identityOk", "hookPayloadOk"])) {
      throw new Error("invalid hook trace metadata")
    }
    for (const value of Object.values(parsed.safeMarkers)) {
      if (typeof value !== "boolean") throw new Error("invalid hook trace marker")
    }
    const statuses: Array<{ tool: string; status: "running" | "completed" | "error" }> = []
    for (const status of parsed.nestedStatuses) {
      if (!isRecord(status) || !hasOnlyKeys(status, ["tool", "status"]) || typeof status.tool !== "string" ||
        (status.status !== "running" && status.status !== "completed" && status.status !== "error")) {
        throw new Error("invalid hook trace nested status")
      }
      statuses.push({ tool: normalizeToolName(status.tool), status: status.status })
    }

    const tool = parsed.tool === null ? UNUSABLE_TOOL_IDENTITY : normalizeToolName(parsed.tool)
    if (tool === "execute") {
      if (parsed.phase === "before") {
        result.outerBeforeCount += 1
        result.outerArgumentKeys.push(...parsed.argumentKeys)
        result.exactCode ||= parsed.safeMarkers.exactCode === true
      } else {
        result.outerAfterCount += 1
        result.executeProbeMarker ||= parsed.safeMarkers.executeProbe === true
        result.deniedHidden ||= parsed.safeMarkers.deniedHidden === true
        result.lspOk ||= parsed.safeMarkers.lspOk === true
        result.identityOk ||= parsed.safeMarkers.identityOk === true
        result.hookPayloadOk ||= parsed.safeMarkers.hookPayloadOk === true
      }
    } else {
      const target = parsed.phase === "before" ? result.nestedBefore : result.nestedAfter
      target.push(tool)
      nestedIdentityEvidence.push(parsed.hasSessionID && parsed.hasCallID)
    }
    result.completedMetadataTools.push(...statuses
      .filter((status) => status.status === "completed")
      .map((status) => status.tool))
  }
  result.allNestedCallIdsPresent = nestedIdentityEvidence.every(Boolean)
  return result
}

function appendBounded(current: string, chunk: unknown): string {
  const next = current + String(chunk)
  return next.length <= MAX_COMMAND_OUTPUT ? next : next.slice(-MAX_COMMAND_OUTPUT)
}

async function terminateLiveChild(
  child: ReturnType<typeof spawn>,
  isExited: () => boolean,
  isClosed: () => boolean,
): Promise<void> {
  if (isExited() || isClosed()) return
  try { child.kill("SIGKILL") } catch { /* direct child already closed */ }
}

function requestAttemptStop(env: NodeJS.ProcessEnv): boolean {
  const stopPath = env.OCMM_CODEMODE_STOP_PATH
  if (!stopPath || !isAbsolute(stopPath)) return false
  try {
    writeFileSync(stopPath, "", { flag: "wx" })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return true
    return false
  }
}

export async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions,
): Promise<CommandResult> {
  return await new Promise((resolveCommand) => {
    let stdout = ""
    let stderr = ""
    let timedOut = false
    let settled = false
    let closeFallbackTimer: NodeJS.Timeout | undefined
    let timer: NodeJS.Timeout | undefined
    let observedExitCode: number | null = null
    let exitObserved = false
    let childClosed = false
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        windowsHide: true,
        stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      })
    } catch (error) {
      resolveCommand({
        exitCode: null,
        stdout,
        stderr: error instanceof Error ? error.message : String(error),
        timedOut,
        pid: null,
      })
      return
    }
    const finish = (exitCode: number | null): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (closeFallbackTimer) clearTimeout(closeFallbackTimer)
      resolveCommand({ exitCode, stdout, stderr, timedOut, pid: child.pid ?? null })
    }
    const armCloseFallback = (terminateIfRunning: boolean): void => {
      if (closeFallbackTimer) return
      closeFallbackTimer = setTimeout(() => {
        if (terminateIfRunning && !childClosed && !exitObserved) {
          try { child.kill("SIGKILL") } catch { /* direct child already closed */ }
        }
        finish(observedExitCode)
      }, 2500)
    }
    child.stdout?.setEncoding("utf8")
    child.stderr?.setEncoding("utf8")
    child.stdout?.on("data", (chunk) => { stdout = appendBounded(stdout, chunk) })
    child.stderr?.on("data", (chunk) => { stderr = appendBounded(stderr, chunk) })
    child.once("error", (error) => {
      stderr = appendBounded(stderr, `${stderr ? "\n" : ""}${error.message}`)
      armCloseFallback(false)
    })
    child.once("exit", (code) => {
      exitObserved = true
      observedExitCode = code
      armCloseFallback(false)
    })
    child.once("close", (code) => {
      childClosed = true
      finish(code ?? observedExitCode)
    })
    if (options.input !== undefined) child.stdin?.end(options.input)
    timer = setTimeout(() => {
      timedOut = true
      armCloseFallback(true)
      if (!child.pid) return
      const stopRequested = requestAttemptStop(options.env)
      void (async () => {
        if (stopRequested) await new Promise((resolveDelay) => setTimeout(resolveDelay, 300))
        await terminateLiveChild(child, () => exitObserved, () => childClosed)
      })()
    }, options.timeoutMs)
  })
}

function validPids(values: unknown[]): number[] {
  return [...new Set(values.filter((value): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value !== process.pid))]
}

type PidRows = { rows: Record<string, unknown>[]; complete: boolean }
type AttemptPidLedgerState = { ledger: AttemptPidLedger; complete: boolean }

function readPidRows(path: string): PidRows {
  if (!existsSync(path)) return { rows: [], complete: true }
  const rows: Record<string, unknown>[] = []
  let complete = true
  let text: string
  try {
    text = readFileSync(path, "utf8")
  } catch {
    return { rows, complete: false }
  }
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    try {
      const parsed: unknown = JSON.parse(line)
      if (isRecord(parsed)) rows.push(parsed)
      else complete = false
    } catch {
      complete = false
    }
  }
  return { rows, complete }
}

function validPid(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value !== process.pid
}

function readAttemptPidLedgerState(attemptRoot: string, hostPids: number[] = []): AttemptPidLedgerState {
  const fixtureResult = readPidRows(join(attemptRoot, "pid", "fixture.jsonl"))
  const lspResult = readPidRows(join(attemptRoot, "pid", "lsp.jsonl"))
  let complete = fixtureResult.complete && lspResult.complete && hostPids.every(validPid)
  const fixture: number[] = []
  const wrapper: number[] = []
  const native: number[] = []
  for (const row of fixtureResult.rows) {
    if (!hasOnlyKeys(row, ["fixturePid"]) || !validPid(row.fixturePid)) complete = false
    if (validPid(row.fixturePid)) fixture.push(row.fixturePid)
  }
  for (const row of lspResult.rows) {
    if (!hasOnlyKeys(row, ["wrapperPid", "nativePid"]) || !validPid(row.wrapperPid) || !validPid(row.nativePid)) {
      complete = false
    }
    if (validPid(row.wrapperPid)) wrapper.push(row.wrapperPid)
    if (validPid(row.nativePid)) native.push(row.nativePid)
  }
  return {
    ledger: {
      host: validPids(hostPids),
      fixture: validPids(fixture),
      wrapper: validPids(wrapper),
      native: validPids(native),
    },
    complete,
  }
}

export function readAttemptPidLedger(attemptRoot: string, hostPids: number[] = []): AttemptPidLedger {
  return readAttemptPidLedgerState(attemptRoot, hostPids).ledger
}

function mergeLedgers(left: AttemptPidLedger, right: AttemptPidLedger): AttemptPidLedger {
  return {
    host: validPids([...left.host, ...right.host]),
    wrapper: validPids([...left.wrapper, ...right.wrapper]),
    fixture: validPids([...left.fixture, ...right.fixture]),
    native: validPids([...left.native, ...right.native]),
  }
}

function ledgerPids(ledger: AttemptPidLedger): number[] {
  return validPids([...ledger.host, ...ledger.wrapper, ...ledger.fixture, ...ledger.native])
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH"
  }
}

const sleep = (milliseconds: number) => new Promise<void>((resolveSleep) => setTimeout(resolveSleep, milliseconds))
const removeRootDefault = (path: string): void => rmSync(path, { recursive: true, force: true })

export async function cleanupRunTopology(
  parentRoot: string,
  attempts: AttemptRecord[],
  parentPids: number[] = [],
  removeRoot: (path: string) => void = removeRootDefault,
  reapTimeoutMs = 5000,
): Promise<TopologyCleanupResult> {
  const refreshed = attempts.map((attempt) => {
    const state = readAttemptPidLedgerState(attempt.rootPath, attempt.pids.host)
    let stopSignalWritten = true
    try {
      writeFileSync(join(attempt.rootPath, "pid", "stop"), "stop\n", { flag: "wx" })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "EEXIST") stopSignalWritten = false
    }
    return {
      attempt: { ...attempt, pids: mergeLedgers(attempt.pids, state.ledger) },
      pidLedgerComplete: attempt.cleanup.pidLedgerComplete && state.complete && stopSignalWritten,
    }
  })
  const tracked = validPids([
    ...parentPids,
    ...refreshed.flatMap(({ attempt }) => ledgerPids(attempt.pids)),
  ])

  const deadline = Date.now() + reapTimeoutMs
  while (tracked.some(pidAlive) && Date.now() < deadline) await sleep(25)
  const remainingPids = tracked.filter(pidAlive).length
  const pidLedgerComplete = refreshed.every((entry) => entry.pidLedgerComplete)

  if (remainingPids > 0 || !pidLedgerComplete) {
    const finalizedAttempts = refreshed.map(({ attempt, pidLedgerComplete }) => ({
      ...attempt,
      cleanup: {
        pidLedgerComplete,
        trackedPids: ledgerPids(attempt.pids).length,
        remainingPids: ledgerPids(attempt.pids).filter(pidAlive).length,
        terminationAttempted: true,
        removalAttempted: false,
        removalFailed: false,
        rootRemoved: !existsSync(attempt.rootPath),
      },
    }))
    const attemptRootsRemoved = finalizedAttempts.filter((attempt) => attempt.cleanup.rootRemoved).length
    return {
      attempts: finalizedAttempts,
      aggregate: {
        attemptCount: finalizedAttempts.length,
        pidLedgerComplete,
        trackedPids: tracked.length,
        remainingPids,
        attemptRootsRemoved,
        removalAttempted: false,
        removalFailed: false,
        parentRootRemoved: !existsSync(parentRoot),
      },
      residualRoots: [...new Set([
        ...finalizedAttempts.filter((attempt) => existsSync(attempt.rootPath)).map((attempt) => attempt.rootPath),
        ...(existsSync(parentRoot) ? [parentRoot] : []),
      ])],
    }
  }

  const finalizedById = new Map<AttemptRecord["id"], AttemptRecord>()
  for (const entry of [...refreshed].reverse()) {
    let removalFailed = false
    try { removeRoot(entry.attempt.rootPath) } catch { removalFailed = true }
    const rootRemoved = !existsSync(entry.attempt.rootPath)
    finalizedById.set(entry.attempt.id, {
      ...entry.attempt,
      cleanup: {
        pidLedgerComplete: entry.pidLedgerComplete,
        trackedPids: ledgerPids(entry.attempt.pids).length,
        remainingPids: ledgerPids(entry.attempt.pids).filter(pidAlive).length,
        terminationAttempted: true,
        removalAttempted: true,
        removalFailed: removalFailed || !rootRemoved,
        rootRemoved,
      },
    })
  }

  let parentRemovalFailed = false
  try { removeRoot(parentRoot) } catch { parentRemovalFailed = true }
  const parentRootRemoved = !existsSync(parentRoot)
  const finalizedAttempts = attempts.map((attempt) => {
    const finalized = finalizedById.get(attempt.id) ?? attempt
    return { ...finalized, cleanup: { ...finalized.cleanup, rootRemoved: !existsSync(finalized.rootPath) } }
  })
  const attemptRootsRemoved = finalizedAttempts.filter((attempt) => attempt.cleanup.rootRemoved).length
  const removalFailed = parentRemovalFailed || !parentRootRemoved ||
    finalizedAttempts.some((attempt) => attempt.cleanup.removalFailed)
  const residualRoots = [...new Set([
    ...finalizedAttempts.filter((attempt) => existsSync(attempt.rootPath)).map((attempt) => attempt.rootPath),
    ...(existsSync(parentRoot) ? [parentRoot] : []),
  ])]
  return {
    attempts: finalizedAttempts,
    aggregate: {
      attemptCount: finalizedAttempts.length,
      pidLedgerComplete: finalizedAttempts.every((attempt) => attempt.cleanup.pidLedgerComplete),
      trackedPids: tracked.length,
      remainingPids,
      attemptRootsRemoved,
      removalAttempted: finalizedAttempts.every((attempt) => attempt.cleanup.removalAttempted),
      removalFailed,
      parentRootRemoved,
    },
    residualRoots,
  }
}

function initialFacts(options: CliOptions): NormalizedFacts {
  return {
    host: {
      openCodeAvailable: false,
      openCodeVersion: null,
      openCodeSha256: null,
      platform: `${process.platform}-${process.arch}`,
      providerModel: options.model,
      ocmmRevision: null,
      worktreeDirty: false,
    },
    prerequisites: {
      providerConfigAvailable: false,
      modelAvailable: options.model !== null,
      buildArtifactsAvailable: false,
      directLspSmoke: false,
    },
    safety: { xdgState: "unknown", secretsAbsent: true, cleanupComplete: false },
    registration: { ocmmLoaded: false, isolatedProjectConfig: false, lspConnected: false, probeConnected: false },
    execute: {
      featureUnsupported: false,
      activationAmbiguous: false,
      modelDeclinedTwice: false,
      timedOut: false,
      permissionBlocked: false,
      outputClassifiable: true,
      outerBeforeCount: 0,
      outerAfterCount: 0,
      outerArgumentKeys: [],
      exactCode: false,
      executeProbeMarker: false,
      deniedHidden: false,
      lspOk: false,
      identityOk: false,
      hookPayloadOk: false,
      emittedTask: false,
    },
    hooks: { nestedBefore: [], nestedAfter: [], allNestedCallIdsPresent: false, completedMetadataTools: [] },
    mcpEvents: [],
    cleanup: {
      attemptCount: 0,
      pidLedgerComplete: true,
      trackedPids: 0,
      remainingPids: 0,
      attemptRootsRemoved: 0,
      removalAttempted: false,
      removalFailed: false,
      parentRootRemoved: false,
    },
  }
}

function factsWithoutCleanup(facts: NormalizedFacts): Omit<NormalizedFacts, "cleanup"> {
  const { cleanup: _cleanup, ...withoutCleanup } = facts
  return withoutCleanup
}

function emptyLedger(): AttemptPidLedger {
  return { host: [], wrapper: [], fixture: [], native: [] }
}

function preCleanupEvidence(pids: AttemptPidLedger, pidLedgerComplete: boolean): AttemptCleanupEvidence {
  const tracked = ledgerPids(pids)
  return {
    pidLedgerComplete,
    trackedPids: tracked.length,
    remainingPids: tracked.filter(pidAlive).length,
    terminationAttempted: false,
    removalAttempted: false,
    removalFailed: false,
    rootRemoved: false,
  }
}

function findNativeLsp(): string | null {
  const binRoot = join(REPO_ROOT, "dist", "bin")
  if (!existsSync(binRoot)) return null
  const names = readdirSync(binRoot)
  const candidates = process.platform === "win32"
    ? ["ocmm-lsp.exe", ...names.filter((name) => /^ocmm-lsp-.*-pc-windows-msvc\.exe$/i.test(name))]
    : ["ocmm-lsp", ...names.filter((name) => /^ocmm-lsp-/i.test(name))]
  for (const name of candidates) {
    const path = join(binRoot, name)
    try { if (statSync(path).isFile()) return path } catch { /* try next candidate */ }
  }
  return null
}

export function buildDirectLspSmokeCommand(nativeLsp: string): {
  command: string
  args: string[]
  input: string
} {
  return {
    command: nativeLsp,
    args: ["mcp"],
    input: `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`,
  }
}

function writeCommandRaw(root: string, name: string, commandResult: CommandResult): void {
  writeFileSync(join(root, `${name}.stdout.log`), commandResult.stdout)
  writeFileSync(join(root, `${name}.stderr.log`), commandResult.stderr)
}

function parseMcpEvents(path: string): string[] {
  if (!existsSync(path)) return []
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    const row: unknown = JSON.parse(line)
    if (!isRecord(row) || !hasOnlyKeys(row, ["event"]) || typeof row.event !== "string") {
      throw new Error("invalid MCP event row")
    }
    return row.event
  })
}

function jsonOutputClassifiable(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return false
  try {
    const eventTypes = new Set(["step_start", "tool_use", "text", "reasoning", "step_finish", "error"])
    return lines.every((line) => {
      const event: unknown = JSON.parse(line)
      if (!isRecord(event) || typeof event.type !== "string" || !eventTypes.has(event.type)) return false
      return event.type === "error" ? Object.hasOwn(event, "error") : isRecord(event.part)
    })
  } catch {
    return false
  }
}

export type HostSignals = {
  permissionBlocked: boolean
  featureUnsupported: boolean
  activationAmbiguous: boolean
}

export function parseHostSignals(stdout: string, stderr: string): HostSignals {
  const evidence: string[] = []
  for (const line of stdout.split(/\r?\n/).filter((value) => value.trim())) {
    try {
      const event: unknown = JSON.parse(line)
      if (isRecord(event) && event.type === "error" && Object.hasOwn(event, "error")) {
        evidence.push(JSON.stringify(event.error))
      }
    } catch { /* malformed JSON is handled by output classification, not signal inference */ }
  }
  for (const originalLine of stripAnsi(stderr).split(/\r?\n/).filter((value) => value.trim())) {
    const line = originalLine.trim()
    try {
      const event: unknown = JSON.parse(line)
      if (isRecord(event) && event.type === "error" && Object.hasOwn(event, "error")) {
        evidence.push(JSON.stringify(event.error))
      }
      continue
    } catch { /* inspect only recognizable host-log lines below */ }
    if (/^(?:\[[^\]]*(?:error|fatal)[^\]]*\]|error\b|err\b|fatal\b|permission (?:denied|blocked)\b|approval required\b|not approved\b|execute\b|code\s*mode\b)/i.test(line)) {
      evidence.push(line)
    }
  }
  const trusted = evidence.join("\n")
  const featureUnsupported = [
    /\bunknown\s+tool\s*:\s*["'`]?execute["'`]?(?=\W|$)/i,
    /\btool\s+["'`]?execute["'`]?\s+is\s+unsupported\b/i,
    /\b["'`]?execute["'`]?\s+tool\s+is\s+not\s+available\b/i,
  ].some((pattern) => pattern.test(trusted))
  return {
    permissionBlocked: /permission denied|permission blocked|approval required|not approved/i.test(trusted),
    featureUnsupported,
    activationAmbiguous: /code\s*mode[\s\S]{0,80}(?:disabled|not enabled|experimental flag)/i.test(trusted),
  }
}

function sameResolvedPath(left: string, right: string): boolean {
  if (!isAbsolute(left)) return false
  const leftResolved = resolve(left)
  const rightResolved = resolve(right)
  return process.platform === "win32"
    ? leftResolved.toLowerCase() === rightResolved.toLowerCase()
    : leftResolved === rightResolved
}

function parseOcmmRegistration(text: string, attemptRoot: string): {
  ocmmLoaded: boolean
  isolatedProjectConfig: boolean
} {
  const expectedConfig = join(attemptRoot, ".opencode", "ocmm.jsonc")
  const markerLines: string[] = []
  for (const originalLine of stripAnsi(text).split(/\r?\n/)) {
    const line = originalLine.trim()
    if (!/^\[ocmm\]\s+config loaded:/i.test(line)) continue
    markerLines.push(line)
  }
  if (markerLines.length !== 1) {
    return { ocmmLoaded: markerLines.length > 0, isolatedProjectConfig: false }
  }
  const marker = /^\[ocmm\]\s+config loaded:\s+project=(.+?),\s+user=<none>\s*$/i.exec(markerLines[0]!)
  return {
    ocmmLoaded: true,
    isolatedProjectConfig: Boolean(marker?.[1] && sameResolvedPath(marker[1], expectedConfig)),
  }
}

function parseMcpConnections(text: string): { lspConnected: boolean; probeConnected: boolean } {
  const statuses = new Map<string, string[]>()
  const statusPattern = /^(lsp|codemode_probe)\s+(not connected|not initialized|needs authentication|needs client registration|connected|disabled|failed|disconnected)$/i
  for (const originalLine of stripAnsi(text).split(/\r?\n/)) {
    const normalizedLine = originalLine.trim().replace(/^[^\p{L}\p{N}_]+/u, "").trim()
    const match = statusPattern.exec(normalizedLine)
    if (!match?.[1] || !match[2]) continue
    const name = match[1].toLowerCase()
    const entries = statuses.get(name) ?? []
    entries.push(match[2].toLowerCase())
    statuses.set(name, entries)
  }
  const exactlyConnected = (name: string): boolean => {
    const entries = statuses.get(name) ?? []
    return entries.length === 1 && entries[0] === "connected"
  }
  return {
    lspConnected: exactlyConnected("lsp"),
    probeConnected: exactlyConnected("codemode_probe"),
  }
}

function ocmmAgentConfig(model: string): Record<string, unknown> {
  return {
    workflow: "v1",
    agents: {
      orchestrator: { model, variant: "max" },
      builder: { model, variant: "high" },
      reviewer: { model, variant: "high" },
      planner: { model, variant: "max" },
    },
    debug: true,
  }
}

function parseSemanticVersion(output: string): string | null {
  const value = output.trim()
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+(.+))?$/.exec(value)
  if (!match) return null
  const validNumeric = (part: string): boolean => /^(?:0|[1-9]\d*)$/.test(part)
  if (![match[1]!, match[2]!, match[3]!].every(validNumeric)) return null
  const prerelease = match[4]
  if (prerelease !== undefined) {
    const identifiers = prerelease.split(".")
    if (identifiers.some((identifier) => !/^[0-9A-Za-z-]+$/.test(identifier) ||
      (/^\d+$/.test(identifier) && !validNumeric(identifier)))) return null
  }
  const build = match[5]
  if (build !== undefined && build.split(".").some((identifier) => !/^[0-9A-Za-z-]+$/.test(identifier))) return null
  return value
}

export async function runAttempt(context: RunAttemptContext): Promise<AttemptRecord> {
  const baseline = initialFacts(context.options)
  baseline.prerequisites.providerConfigAvailable = true
  baseline.prerequisites.modelAvailable = true
  const facts = factsWithoutCleanup(baseline)
  const hostPids: number[] = []
  const commandResults: CommandResult[] = []
  let pids = emptyLedger()
  const rawRoot = join(context.rootPath, "raw")

  const finalize = (forceIncomplete = false): AttemptRecord => {
    const hostSignals = parseHostSignals(
      commandResults.map((item) => item.stdout).join("\n"),
      commandResults.map((item) => item.stderr).join("\n"),
    )
    facts.execute.permissionBlocked ||= hostSignals.permissionBlocked
    facts.execute.featureUnsupported ||= hostSignals.featureUnsupported
    facts.execute.activationAmbiguous ||= hostSignals.activationAmbiguous
    const pidState = readAttemptPidLedgerState(context.rootPath, hostPids)
    pids = pidState.ledger
    const pidLedgerComplete = !forceIncomplete && pidState.complete &&
      (!facts.registration.probeConnected || pids.fixture.length > 0) &&
      (!facts.registration.lspConnected || (pids.wrapper.length > 0 && pids.native.length > 0))
    return {
      id: context.id,
      rootPath: context.rootPath,
      pids,
      facts,
      cleanup: preCleanupEvidence(pids, pidLedgerComplete),
    }
  }

  try {
    for (const directory of [
      context.rootPath,
      join(context.rootPath, ".opencode"),
      join(context.rootPath, "xdg-config"),
      join(context.rootPath, "xdg-data"),
      join(context.rootPath, "xdg-state"),
      join(context.rootPath, "xdg-cache"),
      join(context.rootPath, "managed-config"),
      rawRoot,
      join(context.rootPath, "pid"),
    ]) mkdirSync(directory, { recursive: true })

    const providerValue: unknown = JSON.parse(readFileSync(context.options.providerConfig, "utf8"))
    if (!isRecord(providerValue)) throw new Error("provider config must contain a JSON object")
    const tracePlugin = join(REPO_ROOT, "scripts", "fixtures", "codemode-execute-hook-trace-plugin.mjs")
    const probeMcp = join(REPO_ROOT, "scripts", "fixtures", "codemode-execute-probe-mcp.mjs")
    const processWrapper = join(REPO_ROOT, "scripts", "fixtures", "codemode-execute-process-wrapper.mjs")
    const nativeLsp = context.nativeLspPath ?? findNativeLsp()
    if (!nativeLsp) throw new Error("native LSP artifact unavailable")
    const opencodeConfig = buildOpenCodeConfig(providerValue, {
      ocmmPlugin: join(REPO_ROOT, "dist", "index.js"),
      tracePlugin,
      nodePath: process.execPath,
      probeMcp,
      model: context.options.model,
    })
    writeFileSync(join(context.rootPath, "opencode.json"), `${JSON.stringify(opencodeConfig, null, 2)}\n`)
    writeFileSync(
      join(context.rootPath, ".opencode", "ocmm.jsonc"),
      `${JSON.stringify(ocmmAgentConfig(context.options.model), null, 2)}\n`,
    )
    const hookTracePath = join(rawRoot, "hooks.jsonl")
    const mcpEventsPath = join(rawRoot, "mcp-events.jsonl")
    const fixturePidPath = join(context.rootPath, "pid", "fixture.jsonl")
    const lspPidPath = join(context.rootPath, "pid", "lsp.jsonl")
    const stopSignalPath = join(context.rootPath, "pid", "stop")
    const env = buildChildEnvironment(process.env, {
      runRoot: context.rootPath,
      lspCommand: [process.execPath, processWrapper, lspPidPath, nativeLsp, "mcp"],
      hookTracePath,
      mcpEventsPath,
      fixturePidPath,
      stopSignalPath,
    })
    const runCommandImpl = context.runCommand ?? runCommand
    const execute = async (name: string, args: string[]): Promise<CommandResult> => {
      const commandResult = await runCommandImpl(context.options.opencode, args, {
        cwd: context.rootPath,
        env,
        timeoutMs: context.options.timeoutMs,
      })
      if (commandResult.pid !== null) hostPids.push(commandResult.pid)
      commandResults.push(commandResult)
      facts.execute.timedOut ||= commandResult.timedOut
      writeCommandRaw(rawRoot, name, commandResult)
      return commandResult
    }

    // Barrier 1: prove the attempt-local host version before loading any later host surface.
    const versionResult = await execute("version", ["--version"])
    const attemptVersion = parseSemanticVersion(versionResult.stdout)
    const versionParsed = versionResult.exitCode === 0 && !versionResult.timedOut && attemptVersion !== null
    const versionClean = versionParsed && attemptVersion === SUPPORTED_OPENCODE_VERSION
    facts.host.openCodeAvailable = versionParsed
    facts.host.openCodeVersion = versionParsed ? attemptVersion : null
    if (!versionClean) {
      if (!versionResult.timedOut && versionResult.exitCode === 0) facts.execute.outputClassifiable = false
      return finalize()
    }

    // Barrier 2: prove the process-local XDG topology before loading provider-facing surfaces.
    const pathsResult = await execute("debug-paths", ["debug", "paths", "--print-logs", "--log-level", "DEBUG"])
    facts.safety.xdgState = classifyXdgPaths(pathsResult.stdout, context.rootPath)
    const pathRows = parseXdgRows(pathsResult.stdout)
    if (!pathsResult.stdout.trim() || pathRows.length === 0 || (pathsResult.exitCode !== 0 && !pathsResult.timedOut)) {
      facts.execute.outputClassifiable = false
    }
    if (facts.execute.timedOut || !facts.execute.outputClassifiable || facts.safety.xdgState !== "isolated") {
      return finalize()
    }

    // Barrier 3: require exact isolated ocmm registration before starting MCP processes.
    const configResult = await execute("debug-config", ["debug", "config", "--print-logs", "--log-level", "DEBUG"])
    const configText = `${configResult.stdout}\n${configResult.stderr}`
    const configRegistration = parseOcmmRegistration(configText, context.rootPath)
    facts.registration.ocmmLoaded = configRegistration.ocmmLoaded
    facts.registration.isolatedProjectConfig = configRegistration.isolatedProjectConfig
    if (configResult.exitCode !== 0 && !configResult.timedOut) facts.execute.outputClassifiable = false
    if (facts.execute.timedOut || !facts.execute.outputClassifiable ||
      !facts.registration.ocmmLoaded || !facts.registration.isolatedProjectConfig) {
      return finalize()
    }

    // Barrier 4: require both isolated MCP connections before making a provider/model call.
    const mcpResult = await execute("mcp-list", ["mcp", "list", "--print-logs", "--log-level", "DEBUG"])
    const mcpText = `${mcpResult.stdout}\n${mcpResult.stderr}`
    const mcpConnections = parseMcpConnections(mcpText)
    facts.registration.lspConnected = mcpConnections.lspConnected
    facts.registration.probeConnected = mcpConnections.probeConnected
    if (mcpResult.exitCode !== 0 && !mcpResult.timedOut) facts.execute.outputClassifiable = false
    if (facts.execute.timedOut || !facts.execute.outputClassifiable ||
      !facts.registration.lspConnected || !facts.registration.probeConnected) {
      return finalize()
    }

    // Only a fully isolated and registered attempt may reach the provider/model.
    const runResult = await execute("run", [
      "run", "--format", "json", "--print-logs", "--log-level", "DEBUG",
      "--model", context.options.model, "--agent", "orchestrator", buildProbePrompt(),
    ])
    const runSignals = parseHostSignals(runResult.stdout, runResult.stderr)
    facts.execute.permissionBlocked ||= runSignals.permissionBlocked
    facts.execute.featureUnsupported ||= runSignals.featureUnsupported
    facts.execute.activationAmbiguous ||= runSignals.activationAmbiguous

    let traceFacts: HookTraceFacts
    try {
      traceFacts = parseHookTrace(existsSync(hookTracePath) ? readFileSync(hookTracePath, "utf8") : "")
    } catch {
      traceFacts = parseHookTrace("")
      facts.execute.outputClassifiable = false
    }
    facts.execute.outerBeforeCount = traceFacts.outerBeforeCount
    facts.execute.outerAfterCount = traceFacts.outerAfterCount
    facts.execute.outerArgumentKeys = traceFacts.outerArgumentKeys
    facts.execute.exactCode = traceFacts.exactCode
    facts.execute.executeProbeMarker = traceFacts.executeProbeMarker
    facts.execute.deniedHidden = traceFacts.deniedHidden
    facts.execute.lspOk = traceFacts.lspOk
    facts.execute.identityOk = traceFacts.identityOk
    facts.execute.hookPayloadOk = traceFacts.hookPayloadOk
    facts.hooks = {
      nestedBefore: traceFacts.nestedBefore,
      nestedAfter: traceFacts.nestedAfter,
      allNestedCallIdsPresent: traceFacts.allNestedCallIdsPresent,
      completedMetadataTools: traceFacts.completedMetadataTools,
    }
    facts.execute.emittedTask = traceFacts.nestedBefore.includes("task") || traceFacts.nestedAfter.includes("task")
    try {
      facts.mcpEvents = parseMcpEvents(mcpEventsPath)
    } catch {
      facts.mcpEvents = []
      facts.execute.outputClassifiable = false
    }
    const stderrOnlyTrustedSignal = runResult.stdout.trim() === "" &&
      (runSignals.activationAmbiguous || runSignals.featureUnsupported || runSignals.permissionBlocked)
    if (!jsonOutputClassifiable(runResult.stdout) && !stderrOnlyTrustedSignal) {
      facts.execute.outputClassifiable = false
    }
    if (runResult.exitCode !== 0 && !facts.execute.featureUnsupported && !facts.execute.permissionBlocked &&
      !facts.execute.activationAmbiguous && !runResult.timedOut) {
      facts.execute.outputClassifiable = false
    }
    return finalize()
  } catch {
    facts.execute.outputClassifiable = false
    return finalize(true)
  }
}

function completedWithoutExecute(attempt: AttemptRecord): boolean {
  const execute = attempt.facts.execute
  const registration = attempt.facts.registration
  return attempt.facts.safety.xdgState === "isolated" && registration.ocmmLoaded &&
    registration.isolatedProjectConfig && registration.lspConnected && registration.probeConnected &&
    execute.outputClassifiable && !execute.timedOut && !execute.permissionBlocked &&
    !execute.featureUnsupported && !execute.activationAmbiguous &&
    execute.outerBeforeCount === 0 && execute.outerAfterCount === 0
}

export async function runAttemptSequence(
  parentRoot: string,
  options: LiveProbeOptions,
  runAttemptImpl: RunAttemptFn = runAttempt,
): Promise<AttemptRecord[]> {
  const first = await runAttemptImpl({ id: "attempt-1", rootPath: join(parentRoot, "attempt-1"), options })
  const attempts = [first]
  if (completedWithoutExecute(first)) {
    attempts.push(await runAttemptImpl({ id: "attempt-2", rootPath: join(parentRoot, "attempt-2"), options }))
  }
  return attempts
}

function mergeAttemptFacts(facts: NormalizedFacts, attempts: AttemptRecord[]): void {
  if (attempts.length === 0) return
  facts.host.openCodeAvailable = attempts.every((attempt) => attempt.facts.host.openCodeAvailable)
  facts.host.openCodeVersion = attempts.map((attempt) => attempt.facts.host.openCodeVersion).find((value) => value !== null) ?? facts.host.openCodeVersion
  facts.safety.xdgState = attempts.some((attempt) => attempt.facts.safety.xdgState === "escaped")
    ? "escaped"
    : attempts.every((attempt) => attempt.facts.safety.xdgState === "isolated") ? "isolated" : "unknown"
  facts.registration = {
    ocmmLoaded: attempts.every((attempt) => attempt.facts.registration.ocmmLoaded),
    isolatedProjectConfig: attempts.every((attempt) => attempt.facts.registration.isolatedProjectConfig),
    lspConnected: attempts.every((attempt) => attempt.facts.registration.lspConnected),
    probeConnected: attempts.every((attempt) => attempt.facts.registration.probeConnected),
  }
  facts.execute = {
    featureUnsupported: attempts.some((attempt) => attempt.facts.execute.featureUnsupported),
    activationAmbiguous: attempts.some((attempt) => attempt.facts.execute.activationAmbiguous),
    modelDeclinedTwice: attempts.length === 2 && attempts.every(completedWithoutExecute),
    timedOut: facts.execute.timedOut || attempts.some((attempt) => attempt.facts.execute.timedOut),
    permissionBlocked: attempts.some((attempt) => attempt.facts.execute.permissionBlocked),
    outputClassifiable: attempts.every((attempt) => attempt.facts.execute.outputClassifiable),
    outerBeforeCount: attempts.reduce((sum, attempt) => sum + attempt.facts.execute.outerBeforeCount, 0),
    outerAfterCount: attempts.reduce((sum, attempt) => sum + attempt.facts.execute.outerAfterCount, 0),
    outerArgumentKeys: attempts.flatMap((attempt) => attempt.facts.execute.outerArgumentKeys),
    exactCode: attempts.some((attempt) => attempt.facts.execute.exactCode),
    executeProbeMarker: attempts.some((attempt) => attempt.facts.execute.executeProbeMarker),
    deniedHidden: attempts.some((attempt) => attempt.facts.execute.deniedHidden),
    lspOk: attempts.some((attempt) => attempt.facts.execute.lspOk),
    identityOk: attempts.some((attempt) => attempt.facts.execute.identityOk),
    hookPayloadOk: attempts.some((attempt) => attempt.facts.execute.hookPayloadOk),
    emittedTask: attempts.some((attempt) => attempt.facts.execute.emittedTask),
  }
  facts.hooks = {
    nestedBefore: attempts.flatMap((attempt) => attempt.facts.hooks.nestedBefore),
    nestedAfter: attempts.flatMap((attempt) => attempt.facts.hooks.nestedAfter),
    allNestedCallIdsPresent: attempts.every((attempt) => attempt.facts.hooks.allNestedCallIdsPresent),
    completedMetadataTools: attempts.flatMap((attempt) => attempt.facts.hooks.completedMetadataTools),
  }
  facts.mcpEvents = attempts.flatMap((attempt) => attempt.facts.mcpEvents)
}

function cleanupComplete(cleanup: NormalizedFacts["cleanup"]): boolean {
  return cleanup.pidLedgerComplete && cleanup.remainingPids === 0 &&
    cleanup.attemptRootsRemoved === cleanup.attemptCount && cleanup.removalAttempted &&
    !cleanup.removalFailed && cleanup.parentRootRemoved
}

function providerConfigUsable(path: string | null, model: string | null): boolean {
  if (!path || !isAbsolute(path) || !existsSync(path)) return false
  try {
    const providerRealPath = realpathSync(path)
    const repoRealPath = realpathSync(REPO_ROOT)
    if (pathIsInside(providerRealPath, repoRealPath) || !statSync(providerRealPath).isFile()) return false
    const parsed: unknown = JSON.parse(readFileSync(providerRealPath, "utf8"))
    if (!isRecord(parsed) || !usableProviderObject(parsed.provider)) return false
    return model === null || providerDeclaresModel(parsed.provider, model)
  } catch {
    return false
  }
}

function artifactsAvailable(nativeLsp: string | null): boolean {
  return nativeLsp !== null && [
    join(REPO_ROOT, "dist", "index.js"),
    join(REPO_ROOT, "dist", "cli", "ocmm-lsp.js"),
    join(REPO_ROOT, "scripts", "fixtures", "codemode-execute-hook-trace-plugin.mjs"),
    join(REPO_ROOT, "scripts", "fixtures", "codemode-execute-probe-mcp.mjs"),
    join(REPO_ROOT, "scripts", "fixtures", "codemode-execute-process-wrapper.mjs"),
  ].every((path) => existsSync(path) && statSync(path).isFile())
}

const REQUIRED_DIRECT_LSP_TOOLS = [
  "status",
  "diagnostics",
  "goto_definition",
  "find_references",
  "find_symbol_related",
  "symbols",
  "prepare_rename",
  "rename",
] as const

export function parseDirectLspToolsList(output: string): boolean {
  try {
    const envelope: unknown = JSON.parse(output.trim())
    if (!isRecord(envelope) || envelope.jsonrpc !== "2.0" || envelope.id !== 1 ||
      Object.hasOwn(envelope, "error") || !isRecord(envelope.result) ||
      !Array.isArray(envelope.result.tools)) return false
    if (!envelope.result.tools.every((tool) => isRecord(tool) && typeof tool.name === "string")) return false
    const names = envelope.result.tools.map((tool) => (tool as { name: string }).name)
    return REQUIRED_DIRECT_LSP_TOOLS.every((name) => names.includes(name))
  } catch {
    return false
  }
}

function hashFile(path: string): string | null {
  try { return createHash("sha256").update(readFileSync(path)).digest("hex") } catch { return null }
}

function regularFile(path: string): string | null {
  try {
    const resolvedPath = realpathSync(path)
    return statSync(resolvedPath).isFile() ? resolvedPath : null
  } catch {
    return null
  }
}

export function hashOpenCodeExecutable(candidate: string): string | null {
  const executable = regularFile(candidate)
  if (!executable) return null
  if (/\.exe$/i.test(executable)) {
    const shimPath = executable.replace(/\.exe$/i, ".shim")
    if (existsSync(shimPath)) {
      try {
        const pathLines = readFileSync(shimPath, "utf8").split(/\r?\n/)
          .filter((line) => /^\s*path\b/i.test(line))
        if (pathLines.length !== 1) return null
        const match = /^\s*path\s*=\s*(?:"([^"]+)"|'([^']+)'|(.+?))\s*$/i.exec(pathLines[0]!)
        const target = match?.[1] ?? match?.[2] ?? match?.[3]
        if (!target || !isAbsolute(target)) return null
        const realTarget = regularFile(target)
        return realTarget ? hashFile(realTarget) : null
      } catch {
        return null
      }
    }
  }
  return hashFile(executable)
}

function firstRegularFile(lines: string): string | null {
  for (const line of lines.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    try { if (isAbsolute(line) && statSync(line).isFile()) return line } catch { /* try next line */ }
  }
  return null
}

function redactUnsafeFactStrings(facts: NormalizedFacts): NormalizedFacts {
  const safe = structuredClone(facts)
  const redact = (value: string | null): string | null =>
    value !== null && UNSAFE_EVIDENCE_STRING.test(value) ? "redacted" : value
  safe.host.openCodeVersion = redact(safe.host.openCodeVersion)
  safe.host.openCodeSha256 = redact(safe.host.openCodeSha256)
  safe.host.providerModel = redact(safe.host.providerModel)
  safe.host.ocmmRevision = redact(safe.host.ocmmRevision)
  safe.execute.outerArgumentKeys = safe.execute.outerArgumentKeys.map((value) => redact(value) ?? "redacted")
  safe.hooks.nestedBefore = safe.hooks.nestedBefore.map((value) => redact(value) ?? "redacted")
  safe.hooks.nestedAfter = safe.hooks.nestedAfter.map((value) => redact(value) ?? "redacted")
  safe.hooks.completedMetadataTools = safe.hooks.completedMetadataTools.map((value) => redact(value) ?? "redacted")
  safe.mcpEvents = safe.mcpEvents.map((value) => redact(value) ?? "redacted")
  return safe
}

function writeFixtureDefault(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

function fallbackFixtureCandidates(primary: string, approvedParent: string): string[] {
  const resolvedPrimary = resolve(primary)
  const tempEvidence = join(
    approvedParent,
    `ocmm-codemode-execute-compatibility-fallback-${process.pid}.json`,
  )
  return [...new Set([
    resolve(DEFAULT_FIXTURE),
    resolve(tempEvidence),
  ])].filter((candidate) => candidate !== resolvedPrimary)
}

export async function runProbe(
  options: CliOptions,
  dependencies: ProbeDependencies = {},
): Promise<ProbeOutcome> {
  const effectiveOptions = { ...options, fixtureOut: resolve(options.fixtureOut) }
  let facts = initialFacts(effectiveOptions)
  const writeStdout = dependencies.writeStdout ?? ((text: string) => process.stdout.write(text))
  const writeStderr = dependencies.writeStderr ?? ((text: string) => process.stderr.write(text))
  const approvedParent = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Temp", "opencode") : ""
  if (!approvedParent || !existsSync(approvedParent) || !statSync(approvedParent).isDirectory()) {
    throw new Error("approved OpenCode temp parent is unavailable")
  }
  const runRoot = mkdtempSync(join(approvedParent, "ocmm-codemode-execute-"))
  const preflightRaw = join(runRoot, "preflight", "raw")
  let attemptRecords: AttemptRecord[] = []
  const parentPids: number[] = []
  let cleanup: TopologyCleanupResult | null = null
  try {
    mkdirSync(preflightRaw, { recursive: true })
    facts.prerequisites.providerConfigAvailable = providerConfigUsable(effectiveOptions.providerConfig, effectiveOptions.model)
    facts.prerequisites.modelAvailable = effectiveOptions.model !== null && /^[^/\s]+\/[^/\s]+$/.test(effectiveOptions.model)
    if (facts.prerequisites.providerConfigAvailable && facts.prerequisites.modelAvailable) {
      const liveOptions = effectiveOptions as LiveProbeOptions
      const runCommandImpl = dependencies.runCommand ?? runCommand
      const preflight = async (name: string, command: string, args: string[], input?: string): Promise<CommandResult> => {
        const commandResult = await runCommandImpl(command, args, {
          cwd: REPO_ROOT,
          env: { ...process.env },
          timeoutMs: effectiveOptions.timeoutMs,
          input,
        })
        if (commandResult.pid !== null) parentPids.push(commandResult.pid)
        facts.execute.timedOut ||= commandResult.timedOut
        writeCommandRaw(preflightRaw, name, commandResult)
        return commandResult
      }
      const versionResult = await preflight("opencode-version", effectiveOptions.opencode, ["--version"])
      const preflightVersion = parseSemanticVersion(versionResult.stdout)
      facts.host.openCodeAvailable = versionResult.exitCode === 0 && !versionResult.timedOut && preflightVersion !== null
      facts.host.openCodeVersion = facts.host.openCodeAvailable ? preflightVersion : null
      const versionClean = facts.host.openCodeAvailable && facts.host.openCodeVersion === SUPPORTED_OPENCODE_VERSION
      if (facts.host.openCodeAvailable && !versionClean) facts.execute.outputClassifiable = false

      let executablePath: string | null = null
      if (isAbsolute(effectiveOptions.opencode)) executablePath = firstRegularFile(effectiveOptions.opencode)
      else {
        const locator = process.platform === "win32" ? "where.exe" : "which"
        const located = await preflight("opencode-location", locator, [effectiveOptions.opencode])
        if (located.exitCode === 0 && !located.timedOut) executablePath = firstRegularFile(located.stdout)
      }
      if (executablePath) facts.host.openCodeSha256 = hashOpenCodeExecutable(executablePath)
      const executableClean = executablePath !== null && facts.host.openCodeSha256 !== null

      const revision = await preflight("git-revision", "git", ["rev-parse", "--short", "HEAD"])
      const revisionText = revision.stdout.trim()
      facts.host.ocmmRevision = /^[0-9a-f]{4,40}$/i.test(revisionText) ? revisionText : null
      const revisionClean = revision.exitCode === 0 && !revision.timedOut && facts.host.ocmmRevision !== null
      const dirty = await preflight("git-dirty", "git", ["status", "--porcelain"])
      const dirtyClean = dirty.exitCode === 0 && !dirty.timedOut
      facts.host.worktreeDirty = dirtyClean && dirty.stdout.trim().length > 0
      if ((!revisionClean || !dirtyClean) && !facts.execute.timedOut) facts.execute.outputClassifiable = false

      const nativeLsp = findNativeLsp()
      facts.prerequisites.buildArtifactsAvailable = artifactsAvailable(nativeLsp)
      const basePreflightClean = versionClean && executableClean && revisionClean && dirtyClean &&
        facts.prerequisites.buildArtifactsAvailable && nativeLsp !== null && !facts.execute.timedOut
      if (basePreflightClean && nativeLsp !== null) {
        const smoke = buildDirectLspSmokeCommand(nativeLsp)
        const direct = await preflight(
          "direct-lsp",
          smoke.command,
          smoke.args,
          smoke.input,
        )
        facts.prerequisites.directLspSmoke = direct.exitCode === 0 && !direct.timedOut && parseDirectLspToolsList(direct.stdout)
      }
      const preflightClean = basePreflightClean && facts.prerequisites.directLspSmoke && !facts.execute.timedOut
      if (preflightClean) {
        attemptRecords = await runAttemptSequence(runRoot, liveOptions, dependencies.runAttempt ?? runAttempt)
        mergeAttemptFacts(facts, attemptRecords)
      }
    }
  } catch {
    facts.execute.outputClassifiable = false
  } finally {
    try {
      cleanup = await cleanupRunTopology(runRoot, attemptRecords, parentPids, dependencies.removeRoot ?? removeRootDefault)
    } catch {
      const tracked = validPids([
        ...parentPids,
        ...attemptRecords.flatMap((attempt) => ledgerPids(attempt.pids)),
      ])
      const fallbackAttempts = attemptRecords.map((attempt) => ({
        ...attempt,
        cleanup: {
          ...attempt.cleanup,
          pidLedgerComplete: false,
          trackedPids: ledgerPids(attempt.pids).length,
          remainingPids: ledgerPids(attempt.pids).filter(pidAlive).length,
          terminationAttempted: true,
          removalAttempted: false,
          removalFailed: true,
          rootRemoved: !existsSync(attempt.rootPath),
        },
      }))
      cleanup = {
        attempts: fallbackAttempts,
        aggregate: {
          attemptCount: fallbackAttempts.length,
          pidLedgerComplete: false,
          trackedPids: tracked.length,
          remainingPids: tracked.filter(pidAlive).length,
          attemptRootsRemoved: fallbackAttempts.filter((attempt) => attempt.cleanup.rootRemoved).length,
          removalAttempted: false,
          removalFailed: true,
          parentRootRemoved: !existsSync(runRoot),
        },
        residualRoots: [...new Set([
          ...fallbackAttempts.filter((attempt) => existsSync(attempt.rootPath)).map((attempt) => attempt.rootPath),
          ...(existsSync(runRoot) ? [runRoot] : []),
        ])],
      }
    }
    facts.cleanup = cleanup.aggregate
    facts.safety.cleanupComplete = cleanupComplete(cleanup.aggregate)
  }

  if (!cleanup) throw new Error("cleanup evidence unavailable")
  for (const residualRoot of cleanup.residualRoots) {
    writeStderr(`OCMM_CODEMODE_CLEANUP_REQUIRED=${residualRoot}\n`)
  }
  let probeResult = classifyProbe(facts)
  let fixture: Record<string, unknown>
  try {
    fixture = sanitizeFixture(facts, probeResult)
  } catch {
    facts.safety.secretsAbsent = false
    facts = redactUnsafeFactStrings(facts)
    probeResult = classifyProbe(facts)
    fixture = sanitizeFixture(facts, probeResult)
  }
  const writeFixture = dependencies.writeFixture ?? writeFixtureDefault
  let actualFixtureOut = effectiveOptions.fixtureOut
  const serialize = (value: Record<string, unknown>): string => `${JSON.stringify(value, null, 2)}\n`
  try {
    writeFixture(actualFixtureOut, serialize(fixture))
  } catch {
    if (probeResult.status !== "FAIL") probeResult = result("DEFER", "fixture-write-failed")
    fixture = sanitizeFixture(facts, probeResult)
    let fallbackWritten = false
    for (const candidate of fallbackFixtureCandidates(actualFixtureOut, approvedParent)) {
      try {
        writeFixture(candidate, serialize(fixture))
        actualFixtureOut = candidate
        fallbackWritten = true
        break
      } catch { /* try the next safe fallback */ }
    }
    if (!fallbackWritten) throw new FixtureFinalizationError(probeResult)
  }
  writeStdout(`OCMM_CODEMODE_RESULT=${probeResult.status}:${probeResult.reasonCode}:${actualFixtureOut}\n`)
  return { facts, result: probeResult }
}

export async function runCli(
  argv: string[],
  dependencies: ProbeDependencies = {},
): Promise<0 | 2 | 3 | 4> {
  const writeStderr = dependencies.writeStderr ?? ((text: string) => process.stderr.write(text))
  try {
    const options = parseCliOptions(argv)
    const { result: probeResult } = await runProbe(options, dependencies)
    return probeResult.exitCode
  } catch (error) {
    if (error instanceof FixtureFinalizationError) {
      writeStderr(`OCMM_CODEMODE_FIXTURE_UNAVAILABLE=${error.probeResult.status}:${error.probeResult.reasonCode}\n`)
      return error.probeResult.exitCode
    }
    writeStderr(`${error instanceof Error ? error.message : String(error)}\n`)
    return 3
  }
}

const isMain = process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) process.exitCode = await runCli(process.argv.slice(2))
