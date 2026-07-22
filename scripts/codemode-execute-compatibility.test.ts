import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { ChildProcess, spawn } from "node:child_process"
import test from "node:test"

import * as compatibilityRunner from "./codemode-execute-compatibility.ts"
import {
  buildChildEnvironment,
  buildDirectLspSmokeCommand,
  buildOpenCodeConfig,
  buildProbeCode,
  buildProbePrompt,
  classifyXdgPaths,
  classifyProbe,
  cleanupRunTopology,
  deniedToolVisible,
  hashOpenCodeExecutable,
  parseCliOptions,
  parseDirectLspToolsList,
  parseHostSignals,
  parseHookTrace,
  readAttemptPidLedger,
  runAttempt,
  runAttemptSequence,
  runCli,
  runCommand,
  runProbe,
  sanitizeFixture,
  type AttemptRecord,
  type CommandOptions,
  type CommandResult,
  type LiveProbeOptions,
  type NormalizedFacts,
  type RunAttemptFn,
} from "./codemode-execute-compatibility.ts"

const REQUIRED = ["codemode_probe_identity", "codemode_probe_json_error", "lsp_status"]
const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
const FIXTURES_ROOT = join(PROJECT_ROOT, "scripts", "fixtures")
const MCP_FIXTURE = join(FIXTURES_ROOT, "codemode-execute-probe-mcp.mjs")
const TRACE_PLUGIN_FIXTURE = join(FIXTURES_ROOT, "codemode-execute-hook-trace-plugin.mjs")
const PROCESS_WRAPPER_FIXTURE = join(FIXTURES_ROOT, "codemode-execute-process-wrapper.mjs")
const BARRIER_XDG_LABELS = ["data", "bin", "log", "repos", "cache", "config", "state"]

function validProviderConfig(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...extra,
    provider: { test: { npm: "@ai-sdk/openai-compatible", models: { model: {} } } },
  }
}

const EXPECTED_OPENCODE_1_18_4_BUNDLED_PROVIDER_NPM_IDS = [
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

test("OpenCode 1.18.4 exports the exact version and bundled provider baseline", () => {
  const exports = compatibilityRunner as unknown as Record<string, unknown>
  assert.equal(exports.SUPPORTED_OPENCODE_VERSION, "1.18.4")
  assert.deepEqual(
    exports.OPENCODE_1_18_4_BUNDLED_PROVIDER_NPM_IDS,
    EXPECTED_OPENCODE_1_18_4_BUNDLED_PROVIDER_NPM_IDS,
  )
  assert.equal(Object.hasOwn(exports, "OPENCODE_1_18_3_BUNDLED_PROVIDER_NPM_IDS"), false)
})

test("strict CodeMode JSONL parser returns only safe structural facts", () => {
  const parser = (compatibilityRunner as unknown as {
    parseOpenCodeRunJsonl?: (text: string) => unknown
  }).parseOpenCodeRunJsonl
  assert.equal(typeof parser, "function")
  if (typeof parser !== "function") return

  const event = (type: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    type,
    timestamp: 1_725_000_000,
    sessionID: "private-session-id",
    ...(type === "error" ? { error: { message: "private error" } } : { part: { type: "text" } }),
    ...extra,
  })
  const validTypes = ["tool_use", "step_start", "step_finish", "text", "reasoning", "error"]
  const valid = validTypes.map((type) => JSON.stringify(event(type))).join("\r\n \r\n")
  assert.deepEqual(parser(valid), {
    eventCount: 6,
    eventTypes: validTypes,
    nonErrorPartCount: 5,
    errorEventCount: 1,
  })
  const serialized = JSON.stringify(parser(valid))
  assert.doesNotMatch(serialized, /private-session-id|1725000000|private error|session|timestamp/i)

  const invalid = [
    "",
    " \r\n\t",
    "not-json",
    "[]",
    "null",
    JSON.stringify(event("unknown")),
    JSON.stringify({ type: "text", sessionID: "private-session-id", part: {} }),
    JSON.stringify(event("text", { timestamp: null })),
    JSON.stringify(event("text", { timestamp: "1" })),
    JSON.stringify({ type: "text", timestamp: 1, part: {} }),
    JSON.stringify(event("text", { sessionID: "   " })),
    JSON.stringify({ type: "text", timestamp: 1, sessionID: "private-session-id" }),
    JSON.stringify(event("text", { part: [] })),
    JSON.stringify({ type: "error", timestamp: 1, sessionID: "private-session-id" }),
  ]
  for (const text of invalid) assert.equal(parser(text), null, text)
})

function barrierPathsFor(root: string): string {
  return BARRIER_XDG_LABELS.map((label) => `${label}  ${join(root, label)}`).join("\n")
}

function isolatedConfigFor(root: string): string {
  return `[ocmm] config loaded: project=${join(root, ".opencode", "ocmm.jsonc")}, user=<none>`
}

function environmentFingerprint(env: NodeJS.ProcessEnv): string {
  return createHash("sha256")
    .update(JSON.stringify(Object.entries(env).sort(([left], [right]) => left.localeCompare(right))))
    .digest("hex")
}

async function runBarrierCase(
  parentRoot: string,
  providerConfig: string,
  name: string,
  pathsText: string,
  configText: string,
  mcpText: string,
): Promise<string[]> {
  const rootPath = join(parentRoot, name)
  const calls: string[] = []
  const fakeRunCommand = async (_command: string, args: string[]): Promise<CommandResult> => {
    let stdout = ""
    let stage = "unknown"
    if (args[0] === "--version") {
      stage = "version"
      stdout = "1.18.4\n"
    } else if (args[0] === "debug" && args[1] === "paths") {
      stage = "paths"
      stdout = pathsText
    } else if (args[0] === "debug" && args[1] === "config") {
      stage = "config"
      stdout = configText
    } else if (args[0] === "mcp") {
      stage = "mcp"
      stdout = mcpText
    } else if (args[0] === "run") {
      stage = "run"
      stdout = `${JSON.stringify({ type: "text", timestamp: 1, sessionID: "test-session", part: { type: "text" } })}\n`
    }
    calls.push(stage)
    return { exitCode: 0, stdout, stderr: "", timedOut: false, pid: null }
  }
  await runAttempt({
    id: "attempt-1",
    rootPath,
    options: {
      providerConfig,
      model: "test/model",
      fixtureOut: join(parentRoot, "unused.json"),
      opencode: "opencode",
      timeoutMs: 1000,
    },
    runCommand: fakeRunCommand,
    nativeLspPath: process.execPath,
  })
  return calls
}

const DIRECT_LSP_TOOL_NAMES = [
  "status",
  "diagnostics",
  "goto_definition",
  "find_references",
  "find_symbol_related",
  "symbols",
  "prepare_rename",
  "rename",
]

function directLspResponse(): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: { tools: DIRECT_LSP_TOOL_NAMES.map((name) => ({ name })) },
  })
}

function attemptRecordFor(context: { id: "attempt-1" | "attempt-2"; rootPath: string }): AttemptRecord {
  mkdirSync(join(context.rootPath, "pid"), { recursive: true })
  const facts = passingFacts()
  return {
    id: context.id,
    rootPath: context.rootPath,
    pids: { host: [], wrapper: [], fixture: [], native: [] },
    facts,
    cleanup: {
      pidLedgerComplete: true,
      trackedPids: 0,
      remainingPids: 0,
      terminationAttempted: false,
      removalAttempted: false,
      removalFailed: false,
      rootRemoved: false,
    },
  }
}

async function waitForExit(child: ReturnType<typeof spawn>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  let stdout = ""
  let stderr = ""
  child.stdout?.setEncoding("utf8")
  child.stderr?.setEncoding("utf8")
  child.stdout?.on("data", (chunk) => { stdout += chunk })
  child.stderr?.on("data", (chunk) => { stderr += chunk })
  const code = await new Promise<number | null>((resolveExit, reject) => {
    child.once("error", reject)
    child.once("exit", resolveExit)
  })
  return { code, stdout, stderr }
}

function parseJsonLines(path: string): unknown[] {
  return readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line))
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH"
  }
}

async function waitForProcessExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!processExists(pid)) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25))
  }
  assert.fail(`process ${pid} survived wrapper exit`)
}

async function waitForFile(path: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (existsSync(path)) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25))
  }
  assert.fail(`file was not created: ${path}`)
}

function passingFacts(): NormalizedFacts {
  return {
    host: {
      openCodeAvailable: true,
      openCodeVersion: "1.18.4",
      openCodeSha256: "a".repeat(64),
      platform: "win32-x64",
      providerModel: "test/model",
      ocmmRevision: "3327762",
      worktreeDirty: true,
    },
    prerequisites: {
      providerConfigAvailable: true,
      modelAvailable: true,
      buildArtifactsAvailable: true,
      directLspSmoke: true,
    },
    safety: { xdgState: "isolated", secretsAbsent: true, cleanupComplete: true },
    registration: {
      ocmmLoaded: true,
      isolatedProjectConfig: true,
      lspConnected: true,
      probeConnected: true,
    },
    execute: {
      featureUnsupported: false,
      activationAmbiguous: false,
      modelDeclinedTwice: false,
      timedOut: false,
      permissionBlocked: false,
      outputClassifiable: true,
      outputJsonlFacts: {
        eventCount: 1,
        eventTypes: ["text"],
        nonErrorPartCount: 1,
        errorEventCount: 0,
      },
      outerBeforeCount: 1,
      outerAfterCount: 1,
      outerArgumentKeys: ["code"],
      exactCode: true,
      executeProbeMarker: true,
      deniedHidden: true,
      lspOk: true,
      identityOk: true,
      hookPayloadOk: true,
      emittedTask: false,
    },
    hooks: {
      nestedBefore: [...REQUIRED],
      nestedAfter: [...REQUIRED],
      allNestedCallIdsPresent: true,
      completedMetadataTools: ["$codemode_search", ...REQUIRED],
    },
    mcpEvents: ["tools/call:identity", "tools/call:json_error"],
    cleanup: {
      attemptCount: 1,
      pidLedgerComplete: true,
      trackedPids: 4,
      remainingPids: 0,
      attemptRootsRemoved: 1,
      removalAttempted: true,
      removalFailed: false,
      parentRootRemoved: true,
    },
  }
}

function nonPassingBaseline(): NormalizedFacts {
  return {
    host: {
      openCodeAvailable: false,
      openCodeVersion: null,
      openCodeSha256: null,
      platform: "win32-x64",
      providerModel: "test/model",
      ocmmRevision: null,
      worktreeDirty: false,
    },
    prerequisites: {
      providerConfigAvailable: true,
      modelAvailable: true,
      buildArtifactsAvailable: false,
      directLspSmoke: false,
    },
    safety: { xdgState: "unknown", secretsAbsent: true, cleanupComplete: true },
    registration: {
      ocmmLoaded: false,
      isolatedProjectConfig: false,
      lspConnected: false,
      probeConnected: false,
    },
    execute: {
      featureUnsupported: false,
      activationAmbiguous: false,
      modelDeclinedTwice: false,
      timedOut: false,
      permissionBlocked: false,
      outputClassifiable: true,
      outputJsonlFacts: null,
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
    hooks: {
      nestedBefore: [],
      nestedAfter: [],
      allNestedCallIdsPresent: false,
      completedMetadataTools: [],
    },
    mcpEvents: [],
    cleanup: {
      attemptCount: 0,
      pidLedgerComplete: true,
      trackedPids: 0,
      remainingPids: 0,
      attemptRootsRemoved: 0,
      removalAttempted: true,
      removalFailed: false,
      parentRootRemoved: true,
    },
  }
}

function cleanModelRefusalFacts(): NormalizedFacts {
  const facts = nonPassingBaseline()
  facts.safety.xdgState = "isolated"
  facts.registration = {
    ocmmLoaded: true,
    isolatedProjectConfig: true,
    lspConnected: true,
    probeConnected: true,
  }
  facts.execute.outputClassifiable = true
  return facts
}

test("classifyProbe returns PASS only for complete evidence", () => {
  assert.deepEqual(classifyProbe(passingFacts()), {
    status: "PASS",
    reasonCode: "all-required-probes-passed",
    exitCode: 0,
    goNoGo: "GO",
  })
})

test("exact execute code attestation is mandatory for PASS", () => {
  const mismatch = passingFacts()
  mismatch.execute.exactCode = false
  assert.deepEqual(classifyProbe(mismatch), {
    status: "FAIL",
    reasonCode: "execute-code-mismatch",
    exitCode: 2,
    goNoGo: "NO-GO",
  })

  const parsedWrong = parseHookTrace(JSON.stringify({
    phase: "before",
    tool: "execute",
    hasSessionID: true,
    hasCallID: true,
    argumentKeys: ["code"],
    nestedStatuses: [],
    safeMarkers: { exactCode: false },
  }))
  assert.equal(parsedWrong.exactCode, false)
})

test("classifyProbe emits stable FAIL reasons for compatibility defects", () => {
  const cases: Array<[string, (facts: NormalizedFacts) => void]> = [
    ["xdg-isolation-failed", (f) => { f.safety.xdgState = "escaped" }],
    ["sanitized-evidence-leak", (f) => { f.safety.secretsAbsent = false }],
    ["cleanup-incomplete", (f) => { f.safety.cleanupComplete = false }],
    ["host-version-missing", (f) => { f.host.openCodeVersion = "" }],
    ["host-binary-hash-missing", (f) => { f.host.openCodeSha256 = null }],
    ["attempt-topology-invalid", (f) => { f.cleanup.attemptCount = 0; f.cleanup.attemptRootsRemoved = 0 }],
    ["tracked-process-evidence-missing", (f) => { f.cleanup.trackedPids = 0 }],
    ["ocmm-plugin-not-loaded", (f) => { f.registration.ocmmLoaded = false }],
    ["lsp-mcp-not-connected", (f) => { f.registration.lspConnected = false }],
    ["probe-mcp-not-connected", (f) => { f.registration.probeConnected = false }],
    ["execute-hook-count-invalid", (f) => { f.execute.outerAfterCount = 0 }],
    ["nested-hook-count-invalid", (f) => { f.hooks.nestedAfter = ["lsp_status"] }],
    ["provider-run-jsonl-invalid", (f) => { f.execute.outputJsonlFacts = null }],
    ["provider-run-jsonl-invalid", (f) => {
      f.execute.outputJsonlFacts = { eventCount: 0, eventTypes: [], nonErrorPartCount: 0, errorEventCount: 0 }
    }],
    ["provider-run-jsonl-invalid", (f) => {
      f.execute.outputJsonlFacts = { eventCount: 2, eventTypes: ["text"], nonErrorPartCount: 2, errorEventCount: 0 }
    }],
    ["provider-run-jsonl-invalid", (f) => {
      f.execute.outputJsonlFacts = { eventCount: 2, eventTypes: ["text", "step_finish"], nonErrorPartCount: 1, errorEventCount: 0 }
    }],
    ["provider-run-jsonl-invalid", (f) => {
      f.execute.outputJsonlFacts = { eventCount: 1, eventTypes: ["text"], nonErrorPartCount: 0, errorEventCount: 1 }
    }],
    ["provider-run-jsonl-invalid", (f) => {
      f.execute.outputJsonlFacts = { eventCount: 1, eventTypes: ["error"], nonErrorPartCount: 0, errorEventCount: 1 }
    }],
    ["nested-mcp-count-invalid", (f) => { f.mcpEvents = ["tools/call:identity"] }],
    ["nested-call-id-missing", (f) => { f.hooks.allNestedCallIdsPresent = false }],
    ["denied-tool-visible-or-called", (f) => { f.execute.deniedHidden = false }],
    ["unexpected-task-dispatch", (f) => { f.execute.emittedTask = true }],
  ]
  for (const [reason, mutate] of cases) {
    const facts = passingFacts()
    mutate(facts)
    const result = classifyProbe(facts)
    assert.equal(result.status, "FAIL", reason)
    assert.equal(result.reasonCode, reason)
    assert.equal(result.exitCode, 2)
    assert.equal(result.goNoGo, "NO-GO")
  }
})

test("classifyProbe preserves structured SKIP and DEFER without calling them pass", () => {
  const missingHost = passingFacts()
  missingHost.host.openCodeAvailable = false
  assert.deepEqual(classifyProbe(missingHost), {
    status: "SKIP",
    reasonCode: "opencode-not-found",
    exitCode: 3,
    goNoGo: "NO-DECISION",
  })

  const unsupported = passingFacts()
  unsupported.execute.featureUnsupported = true
  unsupported.execute.outerBeforeCount = 0
  unsupported.execute.outerAfterCount = 0
  assert.equal(classifyProbe(unsupported).status, "SKIP")
  assert.equal(classifyProbe(unsupported).reasonCode, "codemode-unsupported-by-host")

  const ambiguous = passingFacts()
  ambiguous.execute.activationAmbiguous = true
  ambiguous.execute.outerBeforeCount = 0
  ambiguous.execute.outerAfterCount = 0
  assert.equal(classifyProbe(ambiguous).status, "DEFER")
  assert.equal(classifyProbe(ambiguous).reasonCode, "codemode-activation-ambiguous")

  const declined = passingFacts()
  declined.execute.modelDeclinedTwice = true
  declined.execute.outerBeforeCount = 0
  declined.execute.outerAfterCount = 0
  assert.equal(classifyProbe(declined).status, "DEFER")
  assert.equal(classifyProbe(declined).reasonCode, "model-did-not-call-execute")
})

test("provider and model availability have distinct fixture-backed SKIP reasons", () => {
  const provider = passingFacts()
  provider.prerequisites.providerConfigAvailable = false
  provider.prerequisites.modelAvailable = false
  assert.deepEqual(classifyProbe(provider), {
    status: "SKIP",
    reasonCode: "provider-config-unavailable",
    exitCode: 3,
    goNoGo: "NO-DECISION",
  })

  const model = passingFacts()
  model.prerequisites.modelAvailable = false
  assert.equal(classifyProbe(model).status, "SKIP")
  assert.equal(classifyProbe(model).reasonCode, "model-unavailable")
})

test("timeout with unobserved XDG is DEFER from a non-passing baseline", () => {
  const facts = nonPassingBaseline()
  facts.execute.timedOut = true
  facts.execute.modelDeclinedTwice = true
  assert.deepEqual(classifyProbe(facts), {
    status: "DEFER",
    reasonCode: "host-command-timeout",
    exitCode: 4,
    goNoGo: "NO-DECISION",
  })
})

test("unclassifiable output with unobserved XDG is DEFER from a non-passing baseline", () => {
  const facts = nonPassingBaseline()
  facts.execute.outputClassifiable = false
  facts.execute.modelDeclinedTwice = true
  assert.deepEqual(classifyProbe(facts), {
    status: "DEFER",
    reasonCode: "unclassifiable-output",
    exitCode: 4,
    goNoGo: "NO-DECISION",
  })
})

test("observed XDG escape outranks timeout and unclassifiable output", () => {
  const facts = nonPassingBaseline()
  facts.safety.xdgState = "escaped"
  facts.execute.timedOut = true
  facts.execute.outputClassifiable = false
  assert.deepEqual(classifyProbe(facts), {
    status: "FAIL",
    reasonCode: "xdg-isolation-failed",
    exitCode: 2,
    goNoGo: "NO-GO",
  })
})

test("unobserved XDG alone is DEFER rather than isolation FAIL", () => {
  const facts = passingFacts()
  facts.safety.xdgState = "unknown"
  assert.deepEqual(classifyProbe(facts), {
    status: "DEFER",
    reasonCode: "xdg-unobserved",
    exitCode: 4,
    goNoGo: "NO-DECISION",
  })
})

test("unobserved XDG outranks registration failures", () => {
  const facts = passingFacts()
  facts.safety.xdgState = "unknown"
  facts.registration = {
    ocmmLoaded: false,
    isolatedProjectConfig: false,
    lspConnected: false,
    probeConnected: false,
  }
  assert.deepEqual(classifyProbe(facts), {
    status: "DEFER",
    reasonCode: "xdg-unobserved",
    exitCode: 4,
    goNoGo: "NO-DECISION",
  })
})

test("permission blockage remains a dedicated DEFER reason", () => {
  const facts = nonPassingBaseline()
  facts.execute.permissionBlocked = true
  facts.execute.modelDeclinedTwice = true
  assert.equal(classifyProbe(facts).status, "DEFER")
  assert.equal(classifyProbe(facts).reasonCode, "permission-blocked")
})

test("PASS rejects duplicate required calls and hook evidence", () => {
  const duplicateBefore = passingFacts()
  duplicateBefore.hooks.nestedBefore.push("lsp_status")
  assert.equal(classifyProbe(duplicateBefore).reasonCode, "nested-hook-count-invalid")

  const duplicateMcp = passingFacts()
  duplicateMcp.mcpEvents.push("tools/call:identity")
  assert.equal(classifyProbe(duplicateMcp).reasonCode, "nested-mcp-count-invalid")

  const duplicateOuter = passingFacts()
  duplicateOuter.execute.outerBeforeCount = 2
  assert.equal(classifyProbe(duplicateOuter).reasonCode, "execute-hook-count-invalid")
})

test("nested hooks and completed metadata have separate exact CodeMode contracts", () => {
  const requiredMetadata = ["$codemode_search", ...REQUIRED]
  const passing = passingFacts()
  assert.deepEqual(passing.hooks.nestedBefore, REQUIRED)
  assert.deepEqual(passing.hooks.nestedAfter, REQUIRED)
  assert.deepEqual(passing.hooks.completedMetadataTools, requiredMetadata)
  assert.equal(classifyProbe(passing).status, "PASS")

  for (const field of ["nestedBefore", "nestedAfter", "completedMetadataTools"] as const) {
    for (const [shape, mutate] of [
      ["missing", (values: string[]) => values.slice(1)],
      ["duplicate", (values: string[]) => [...values, values[0]!]],
      ["extra", (values: string[]) => [...values, "unexpected_tool"]],
    ] as const) {
      const facts = passingFacts()
      facts.hooks[field] = mutate(facts.hooks[field])
      assert.notEqual(classifyProbe(facts).status, "PASS", `${field} ${shape}`)
    }
  }

  const trace = parseHookTrace([
    { phase: "before", tool: "execute", hasSessionID: true, hasCallID: true, argumentKeys: ["code"], nestedStatuses: [], safeMarkers: {} },
    ...REQUIRED.map((tool) => ({ phase: "before", tool, hasSessionID: true, hasCallID: true, argumentKeys: [], nestedStatuses: [], safeMarkers: {} })),
    ...REQUIRED.map((tool) => ({ phase: "after", tool, hasSessionID: true, hasCallID: true, argumentKeys: [], nestedStatuses: [], safeMarkers: {} })),
    {
      phase: "after", tool: "execute", hasSessionID: true, hasCallID: true, argumentKeys: [],
      nestedStatuses: requiredMetadata.map((tool) => ({ tool, status: "completed" })), safeMarkers: {},
    },
  ].map((row) => JSON.stringify(row)).join("\n"))
  assert.deepEqual(trace.nestedBefore, REQUIRED)
  assert.deepEqual(trace.nestedAfter, REQUIRED)
  assert.deepEqual(trace.completedMetadataTools, requiredMetadata)
  assert.equal(trace.nestedAfter.includes("$codemode_search"), false)
})

test("safety failures override feature SKIP and DEFER", () => {
  const facts = passingFacts()
  facts.execute.featureUnsupported = true
  facts.execute.activationAmbiguous = true
  facts.safety.cleanupComplete = false
  assert.equal(classifyProbe(facts).status, "FAIL")
  assert.equal(classifyProbe(facts).reasonCode, "cleanup-incomplete")
})

test("sanitizeFixture emits only the whitelist schema and is deterministic", () => {
  const facts = passingFacts()
  const result = classifyProbe(facts)
  const first = sanitizeFixture(facts, result)
  const second = sanitizeFixture(structuredClone(facts), { ...result })
  assert.equal(JSON.stringify(first, null, 2), JSON.stringify(second, null, 2))
  assert.deepEqual(Object.keys(first), [
    "schemaVersion",
    "status",
    "reasonCode",
    "goNoGo",
    "host",
    "isolation",
    "registration",
    "execute",
    "permissions",
    "hooks",
    "mcp",
    "cleanup",
  ])
  const text = JSON.stringify(first)
  assert.doesNotMatch(text, /sessionID|callID|apiKey|Authorization|Bearer/i)
  assert.doesNotMatch(text, /[A-Za-z]:\\|\\\\|\/(?:home|Users|tmp)\//)
})

test("sanitizeFixture rejects unapproved identity and model strings", () => {
  const facts = passingFacts()
  facts.host.providerModel = "C:\\secret\\provider.json"
  assert.throws(() => sanitizeFixture(facts, classifyProbe(facts)), /unsafe evidence string/)

  const secret = passingFacts()
  secret.host.providerModel = "Bearer abc123"
  assert.throws(() => sanitizeFixture(secret, classifyProbe(secret)), /unsafe evidence string/)

  for (const prefix of ["sk-live-secret", "ghp_example", "AKIAEXAMPLE", "xoxb-example", "xoxp-example", "xoxa-example", "xoxr-example", "xoxs-example"]) {
    const prefixed = passingFacts()
    prefixed.host.providerModel = prefix
    assert.throws(() => sanitizeFixture(prefixed, classifyProbe(prefixed)), /unsafe evidence string/, prefix)
  }
})

test("runProbe fallback redacts every required secret prefix and writes sanitized FAIL", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-secret-fallback-"))
  try {
    for (const [index, secret] of [
      "sk-live-secret",
      "ghp_example",
      "AKIAEXAMPLE",
      "xoxb-example",
      "xoxp-example",
      "xoxa-example",
      "xoxr-example",
      "xoxs-example",
    ].entries()) {
      const fixtureOut = join(root, `secret-${index}.json`)
      const stdout: string[] = []
      const outcome = await runProbe({
        providerConfig: null,
        model: `provider/${secret}`,
        fixtureOut,
        opencode: "opencode",
        timeoutMs: 1000,
      }, { writeStdout: (text) => stdout.push(text), writeStderr: () => undefined })
      assert.equal(outcome.result.status, "FAIL", secret)
      assert.equal(outcome.result.reasonCode, "sanitized-evidence-leak", secret)
      const fixture = JSON.parse(readFileSync(fixtureOut, "utf8")) as {
        status: string
        reasonCode: string
        host: { providerModel: string }
      }
      assert.equal(fixture.host.providerModel, "redacted")
      assert.equal(stdout.filter((line) => line.startsWith("OCMM_CODEMODE_RESULT=FAIL:sanitized-evidence-leak:")).length, 1)
      assert.doesNotMatch(JSON.stringify(fixture), new RegExp(secret, "i"))
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("probe prompt contains the exact one-call CodeMode program", () => {
  const code = buildProbeCode()
  const prompt = buildProbePrompt()
  assert.equal(prompt.includes(`\`\`\`js\n${code}\n\`\`\``), true)
  assert.match(prompt, /Call the `execute` tool exactly once/)
  assert.match(prompt, /tools\.\$codemode\.search\(\{ query: "codemode_probe\.denied"/)
  assert.match(prompt, /denied\.items\.some\(\(item\) => item\.path === "tools\.codemode_probe\.denied"\)/)
  assert.doesNotMatch(prompt, /search\(\{ path:|Array\.isArray\(denied\)/)
  assert.match(prompt, /tools\.lsp\.status\(\{\}\)/)
  assert.match(prompt, /tools\.codemode_probe\.identity/)
  assert.match(prompt, /OCMM_CODEMODE_EXECUTE_PROBE/)
  assert.doesNotMatch(prompt, /task\s*\(/i)
})

test("CodeMode denied visibility uses official items/path search results", () => {
  assert.equal(deniedToolVisible({ items: [], remaining: 0, next: null }), false)
  assert.equal(deniedToolVisible({
    items: [{ path: "tools.codemode_probe.identity" }, { path: "tools.codemode_probe.denied" }],
    remaining: 0,
    next: null,
  }), true)
  assert.equal(deniedToolVisible({ items: [{ path: "codemode_probe.denied" }] }), false)
  assert.equal(deniedToolVisible([{ path: "tools.codemode_probe.denied" }]), false)
})

test("direct LSP smoke command owns the native binary directly", () => {
  const nativeLsp = "C:\\probe\\dist\\bin\\ocmm-lsp.exe"
  const smoke = buildDirectLspSmokeCommand(nativeLsp)
  assert.deepEqual(smoke, {
    command: nativeLsp,
    args: ["mcp"],
    input: `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`,
  })
  assert.doesNotMatch(JSON.stringify(smoke), /dist[\\/]cli[\\/]ocmm-lsp\.js/i)
})

test("direct LSP smoke parser accepts only the strict canonical JSON-RPC envelope", () => {
  assert.equal(parseDirectLspToolsList(directLspResponse()), true)
  assert.equal(parseDirectLspToolsList(JSON.stringify({
    id: 1, result: { tools: DIRECT_LSP_TOOL_NAMES.map((name) => ({ name })) },
  })), false)
  assert.equal(parseDirectLspToolsList(JSON.stringify({
    jsonrpc: "1.0", id: 1, result: { tools: DIRECT_LSP_TOOL_NAMES.map((name) => ({ name })) },
  })), false)
  assert.equal(parseDirectLspToolsList(`noise ${directLspResponse()}`), false)
  assert.equal(parseDirectLspToolsList(JSON.stringify({
    jsonrpc: "2.0", id: 2, result: { tools: DIRECT_LSP_TOOL_NAMES.map((name) => ({ name })) },
  })), false)
  assert.equal(parseDirectLspToolsList(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -1 } })), false)
  assert.equal(parseDirectLspToolsList(JSON.stringify({
    jsonrpc: "2.0", id: 1, result: { tools: [...DIRECT_LSP_TOOL_NAMES.slice(0, 7).map((name) => ({ name })), {}] },
  })), false)
  assert.equal(parseDirectLspToolsList(JSON.stringify({
    jsonrpc: "2.0", id: 1, result: { tools: DIRECT_LSP_TOOL_NAMES.filter((name) => name !== "find_symbol_related").map((name) => ({ name })) },
  })), false)
  assert.equal(parseDirectLspToolsList(JSON.stringify({
    jsonrpc: "2.0", id: 1, result: { tools: [...DIRECT_LSP_TOOL_NAMES, "unexpected_tool"].map((name) => ({ name })) },
  })), false)
  assert.equal(parseDirectLspToolsList(JSON.stringify({
    jsonrpc: "2.0", id: 1, result: { tools: [...DIRECT_LSP_TOOL_NAMES.slice(0, 7), "rename", "rename"].map((name) => ({ name })) },
  })), false)
})

test("tracked CodeMode compatibility fixture is a complete sanitized PASS receipt", () => {
  const fixtureText = readFileSync(join(FIXTURES_ROOT, "opencode-codemode-execute-compatibility.json"), "utf8")
  assert.doesNotMatch(
    fixtureText,
    /api[ _-]?key|authorization|bearer\s+|session[ _-]?id|call[ _-]?id|\b(?:sk-|ghp_|AKIA|xox[bpars]-)|[A-Za-z]:[\\/]|\\\\|\/(?:home|Users|tmp)\//i,
  )
  const assertRecord = (value: unknown, name: string): Record<string, unknown> => {
    assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${name} must be an object`)
    return value as Record<string, unknown>
  }
  const assertExactKeys = (value: Record<string, unknown>, expected: string[]): void => {
    assert.deepEqual(Object.keys(value).sort(), [...expected].sort())
  }
  const fixture = assertRecord(JSON.parse(fixtureText), "fixture")

  const assertNoUnsafeFields = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(assertNoUnsafeFields)
      return
    }
    if (value === null || typeof value !== "object") return
    for (const [key, nested] of Object.entries(value)) {
      assert.doesNotMatch(
        key,
        /^(?:api(?:_|-)?key|authorization|session(?:_|-)?id|call(?:_|-)?id|path|raw(?:_|-)?(?:output|log)|stdout|stderr)$/i,
      )
      assertNoUnsafeFields(nested)
    }
  }

  assertExactKeys(fixture, [
    "cleanup", "execute", "goNoGo", "hooks", "host", "isolation", "mcp", "permissions", "reasonCode", "registration", "schemaVersion", "status",
  ])
  assertNoUnsafeFields(fixture)
  const host = assertRecord(fixture.host, "fixture.host")
  const isolation = assertRecord(fixture.isolation, "fixture.isolation")
  const registration = assertRecord(fixture.registration, "fixture.registration")
  const execute = assertRecord(fixture.execute, "fixture.execute")
  const outputJsonlFacts = assertRecord(execute.outputJsonlFacts, "fixture.execute.outputJsonlFacts")
  const permissions = assertRecord(fixture.permissions, "fixture.permissions")
  const hooks = assertRecord(fixture.hooks, "fixture.hooks")
  const mcp = assertRecord(fixture.mcp, "fixture.mcp")
  const cleanup = assertRecord(fixture.cleanup, "fixture.cleanup")
  assertExactKeys(host, ["featureFlag", "ocmmRevision", "openCodeSha256", "openCodeVersion", "platform", "providerModel", "worktreeDirty"])
  assertExactKeys(isolation, ["projectConfigIsolated", "xdgState"])
  assertExactKeys(registration, ["directLspSmoke", "lspConnected", "ocmmLoaded", "probeConnected"])
  assertExactKeys(execute, [
    "argumentKeys", "emittedTask", "exactCode", "executeProbeMarker", "hookPayloadOk", "identityOk", "lspOk", "outerAfterCount", "outerBeforeCount", "outputClassifiable", "outputJsonlFacts", "permissionBlocked", "timedOut",
  ])
  assertExactKeys(outputJsonlFacts, ["errorEventCount", "eventCount", "eventTypes", "nonErrorPartCount"])
  assertExactKeys(permissions, ["deniedCalled", "deniedHidden", "deniedTool"])
  assertExactKeys(hooks, ["allNestedToolsIdentified", "completedMetadataTools", "nestedAfter", "nestedBefore"])
  assertExactKeys(mcp, ["deniedCount", "identityCount", "jsonErrorCount"])
  assertExactKeys(cleanup, ["attemptCount", "attemptRootsRemoved", "parentRootRemoved", "pidLedgerComplete", "remainingPids", "removalAttempted", "removalFailed", "trackedPids"])
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.status, "PASS")
  assert.equal(fixture.reasonCode, "all-required-probes-passed")
  assert.equal(fixture.goNoGo, "GO")
  assert.equal(host.openCodeVersion, "1.18.4")
  assert.equal(host.platform, "win32-x64")
  assert.equal(host.providerModel, "apai/gpt-5.6-terra")
  assert.match(String(host.openCodeSha256), /^[a-f0-9]{64}$/i)
  assert.match(String(host.ocmmRevision), /^[a-f0-9]{4,40}$/i)
  assert.equal(host.worktreeDirty, true)
  assert.equal(host.featureFlag, "OPENCODE_EXPERIMENTAL_CODE_MODE")
  assert.equal(isolation.xdgState, "isolated")
  assert.equal(isolation.projectConfigIsolated, true)
  assert.equal(registration.ocmmLoaded, true)
  assert.equal(registration.lspConnected, true)
  assert.equal(registration.probeConnected, true)
  assert.equal(registration.directLspSmoke, true)
  assert.equal(execute.outerBeforeCount, 1)
  assert.equal(execute.outerAfterCount, 1)
  assert.ok(Array.isArray(execute.argumentKeys))
  assert.deepEqual(execute.argumentKeys, ["code"])
  assert.equal(execute.timedOut, false)
  assert.equal(execute.permissionBlocked, false)
  assert.equal(execute.outputClassifiable, true)
  assert.ok(Array.isArray(outputJsonlFacts.eventTypes))
  assert.deepEqual(outputJsonlFacts, {
    eventCount: 6,
    eventTypes: ["step_start", "tool_use", "step_finish", "step_start", "text", "step_finish"],
    nonErrorPartCount: 6,
    errorEventCount: 0,
  })
  assert.equal(execute.exactCode, true)
  assert.equal(execute.executeProbeMarker, true)
  assert.equal(execute.lspOk, true)
  assert.equal(execute.identityOk, true)
  assert.equal(execute.hookPayloadOk, true)
  assert.equal(execute.emittedTask, false)
  assert.equal(permissions.deniedTool, "codemode_probe_denied")
  assert.equal(permissions.deniedHidden, true)
  assert.equal(permissions.deniedCalled, false)
  assert.ok(Array.isArray(hooks.nestedBefore))
  assert.ok(Array.isArray(hooks.nestedAfter))
  assert.ok(Array.isArray(hooks.completedMetadataTools))
  assert.deepEqual([...hooks.nestedBefore].sort(), [...REQUIRED].sort())
  assert.deepEqual([...hooks.nestedAfter].sort(), [...REQUIRED].sort())
  assert.deepEqual([...hooks.completedMetadataTools].sort(), ["$codemode_search", ...REQUIRED].sort())
  assert.equal(hooks.allNestedToolsIdentified, true)
  assert.equal(mcp.identityCount, 1)
  assert.equal(mcp.jsonErrorCount, 1)
  assert.equal(mcp.deniedCount, 0)
  assert.equal(cleanup.attemptCount, 1)
  assert.equal(cleanup.pidLedgerComplete, true)
  assert.ok(Number(cleanup.trackedPids) > 0)
  assert.equal(cleanup.remainingPids, 0)
  assert.equal(cleanup.attemptRootsRemoved, 1)
  assert.equal(cleanup.removalAttempted, true)
  assert.equal(cleanup.removalFailed, false)
  assert.equal(cleanup.parentRootRemoved, true)
})

test("runProbe starts model attempts only after every preflight gate passes", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-preflight-gates-"))
  const provider = join(root, "provider.json")
  writeFileSync(provider, JSON.stringify(validProviderConfig()))
  try {
    const scenarios = [
      { name: "unsupported-version", expectedAttempts: 0 },
      { name: "locator-timeout", expectedAttempts: 0 },
      { name: "git-failure", expectedAttempts: 0 },
      { name: "direct-malformed", expectedAttempts: 0 },
      { name: "direct-failure", expectedAttempts: 0 },
      { name: "clean", expectedAttempts: 1 },
    ] as const
    for (const scenario of scenarios) {
      let attempts = 0
      const fakePreflight = async (command: string, args: string[]): Promise<CommandResult> => {
        if (args[0] === "--version") {
          return {
            exitCode: 0,
            stdout: scenario.name === "unsupported-version" ? "1.18.3\n" : "1.18.4\n",
            stderr: "",
            timedOut: false,
            pid: null,
          }
        }
        if (/where\.exe$/i.test(command)) {
          if (scenario.name === "locator-timeout") {
            return { exitCode: null, stdout: "", stderr: "", timedOut: true, pid: null }
          }
          return { exitCode: 0, stdout: `${process.execPath}\n`, stderr: "", timedOut: false, pid: null }
        }
        if (command === "git" && args[0] === "rev-parse") {
          if (scenario.name === "git-failure") {
            return { exitCode: 1, stdout: "", stderr: "fatal: unavailable", timedOut: false, pid: null }
          }
          return { exitCode: 0, stdout: "abcdef1\n", stderr: "", timedOut: false, pid: null }
        }
        if (command === "git" && args[0] === "status") {
          return { exitCode: 0, stdout: "", stderr: "", timedOut: false, pid: null }
        }
        return {
          exitCode: scenario.name === "direct-failure" ? 1 : 0,
          stdout: scenario.name === "direct-malformed" ? "not-json but names status diagnostics rename" : directLspResponse(),
          stderr: "",
          timedOut: false,
          pid: null,
        }
      }
      const outcome = await runProbe({
        providerConfig: provider,
        model: "test/model",
        fixtureOut: join(root, `${scenario.name}.json`),
        opencode: "opencode",
        timeoutMs: 1000,
      }, {
        runCommand: fakePreflight,
        runAttempt: async (context) => {
          attempts += 1
          return attemptRecordFor(context)
        },
        writeStdout: () => undefined,
        writeStderr: () => undefined,
      })
      assert.equal(attempts, scenario.expectedAttempts, scenario.name)
      if (scenario.name === "unsupported-version") assert.equal(outcome.result.reasonCode, "unclassifiable-output")
      if (scenario.name === "locator-timeout") assert.equal(outcome.result.reasonCode, "host-command-timeout")
      if (scenario.name === "git-failure") assert.equal(outcome.result.reasonCode, "unclassifiable-output")
      if (scenario.name === "direct-malformed" || scenario.name === "direct-failure") {
        assert.equal(outcome.result.reasonCode, "direct-lsp-smoke-failed")
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("runProbe parent version barrier stops 1.18.3 before every later preflight surface", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-parent-version-barrier-"))
  const provider = join(root, "provider.json")
  writeFileSync(provider, JSON.stringify(validProviderConfig()))
  try {
    const runVersion = async (version: string): Promise<{
      calls: string[]
      stdout: string[]
      outcome: Awaited<ReturnType<typeof runProbe>>
    }> => {
      const calls: string[] = []
      const stdout: string[] = []
      const outcome = await runProbe({
        providerConfig: provider,
        model: "test/model",
        fixtureOut: join(root, `version-${version}.json`),
        opencode: "opencode",
        timeoutMs: 1000,
      }, {
        runCommand: async (command, args): Promise<CommandResult> => {
          if (args[0] === "--version") {
            calls.push("version")
            return { exitCode: 0, stdout: `${version}\n`, stderr: "", timedOut: false, pid: null }
          }
          if (/where\.exe$/i.test(command)) {
            calls.push("location")
            return { exitCode: 0, stdout: `${process.execPath}\n`, stderr: "", timedOut: false, pid: null }
          }
          if (command === "git" && args[0] === "rev-parse") {
            calls.push("revision")
            return { exitCode: 0, stdout: "abcdef1\n", stderr: "", timedOut: false, pid: null }
          }
          if (command === "git" && args[0] === "status") {
            calls.push("dirty")
            return { exitCode: 0, stdout: "", stderr: "", timedOut: false, pid: null }
          }
          calls.push("direct-lsp")
          return { exitCode: 0, stdout: directLspResponse(), stderr: "", timedOut: false, pid: null }
        },
        runAttempt: async (context) => {
          calls.push("attempt")
          return attemptRecordFor(context)
        },
        writeStdout: (text) => stdout.push(text),
        writeStderr: () => undefined,
      })
      return { calls, stdout, outcome }
    }

    const unsupported = await runVersion("1.18.3")
    assert.deepEqual(unsupported.calls, ["version"])
    assert.deepEqual(unsupported.outcome.result, {
      status: "DEFER",
      reasonCode: "unclassifiable-output",
      exitCode: 4,
      goNoGo: "NO-DECISION",
    })
    assert.equal(unsupported.outcome.facts.cleanup.parentRootRemoved, true)
    assert.equal(unsupported.stdout.filter((line) => line.startsWith("OCMM_CODEMODE_RESULT=")).length, 1)

    const supported = await runVersion("1.18.4")
    assert.deepEqual(supported.calls.slice(0, 4), ["version", "location", "revision", "dirty"])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("provider preflight rejects malformed JSON and non-bundled SDK routes without host execution", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-provider-shape-"))
  try {
    const cases: Array<[string, string]> = [
      ["missing", JSON.stringify({ share: "disabled" })],
      ["empty", JSON.stringify({ provider: {} })],
      ["array", JSON.stringify({ provider: [] })],
      ["invalid-entry", JSON.stringify({ provider: { test: "not-an-object" } })],
      ["malformed-json", "{ provider: invalid json }"],
      ["truncated-json", '{"provider":{"test":'],
      ["missing-explicit-sdk", JSON.stringify({ provider: { test: { models: { model: {} } } } })],
      ["dynamic-provider-sdk", JSON.stringify({ provider: { test: { npm: "custom-provider-sdk", models: { model: {} } } } })],
      ["file-provider-sdk", JSON.stringify({ provider: { test: { npm: "file:///outside/provider.mjs", models: { model: {} } } } })],
      ["dynamic-model-sdk", JSON.stringify({ provider: {
        test: {
          npm: "@ai-sdk/openai-compatible",
          models: { model: { provider: { npm: "custom-provider-sdk" } } },
        },
      } })],
      ["file-model-sdk", JSON.stringify({ provider: {
        test: {
          npm: "@ai-sdk/openai-compatible",
          models: { model: { provider: { npm: "file:///outside/provider.mjs" } } },
        },
      } })],
      ["model-not-declared", JSON.stringify({ provider: {
        test: { npm: "@ai-sdk/openai-compatible", models: { other: {} } },
      } })],
      ["secondary-dynamic-model-sdk", JSON.stringify({ provider: {
        test: {
          npm: "@ai-sdk/openai-compatible",
          models: { model: {}, other: { provider: { npm: "custom-provider-sdk" } } },
        },
      } })],
    ]
    for (const [name, contents] of cases) {
      const provider = join(root, `${name}.json`)
      writeFileSync(provider, contents)
      let hostCalls = 0
      const outcome = await runProbe({
        providerConfig: provider,
        model: "test/model",
        fixtureOut: join(root, `${name}-result.json`),
        opencode: "opencode",
        timeoutMs: 1000,
      }, {
        runCommand: async () => {
          hostCalls += 1
          return { exitCode: 0, stdout: "", stderr: "", timedOut: false, pid: null }
        },
        writeStdout: () => undefined,
        writeStderr: () => undefined,
      })
      assert.equal(hostCalls, 0, name)
      assert.equal(outcome.result.status, "SKIP", name)
      assert.equal(outcome.result.reasonCode, "provider-config-unavailable", name)
      assert.equal(outcome.facts.cleanup.attemptCount, 0, name)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("runAttempt treats version as a hard barrier before paths config MCP and provider", async () => {
  const parentRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-version-barrier-"))
  const providerConfig = join(parentRoot, "provider.json")
  writeFileSync(providerConfig, JSON.stringify(validProviderConfig()))
  try {
    const scenarios = [
      { name: "nonzero", version: { exitCode: 1, stdout: "1.18.4\n", stderr: "fatal", timedOut: false, pid: null }, expected: ["version"] },
      { name: "malformed", version: { exitCode: 0, stdout: "OpenCode current\n", stderr: "", timedOut: false, pid: null }, expected: ["version"] },
      { name: "leading-zero-core", version: { exitCode: 0, stdout: "01.2.3\n", stderr: "", timedOut: false, pid: null }, expected: ["version"] },
      { name: "leading-zero-prerelease", version: { exitCode: 0, stdout: "1.2.3-01\n", stderr: "", timedOut: false, pid: null }, expected: ["version"] },
      { name: "empty-prerelease-identifier", version: { exitCode: 0, stdout: "1.2.3-alpha..1\n", stderr: "", timedOut: false, pid: null }, expected: ["version"] },
      { name: "unsupported-host-version", version: { exitCode: 0, stdout: "1.18.3\n", stderr: "", timedOut: false, pid: null }, expected: ["version"] },
      { name: "timeout", version: { exitCode: null, stdout: "1.18.4\n", stderr: "", timedOut: true, pid: null }, expected: ["version"] },
      { name: "clean", version: { exitCode: 0, stdout: "1.18.4\n", stderr: "", timedOut: false, pid: null }, expected: ["version", "paths", "config", "mcp", "run"] },
    ] as const
    for (const scenario of scenarios) {
      const rootPath = join(parentRoot, scenario.name)
      const calls: string[] = []
      let managedConfigChecked = false
      const command = async (_command: string, args: string[], commandOptions: CommandOptions): Promise<CommandResult> => {
        if (args[0] === "--version") {
          const managedConfig = String(commandOptions.env.OPENCODE_TEST_MANAGED_CONFIG_DIR)
          assert.equal(managedConfig, join(rootPath, "managed-config"), scenario.name)
          assert.deepEqual(readdirSync(managedConfig), [], scenario.name)
          managedConfigChecked = true
          calls.push("version")
          return scenario.version
        }
        if (args[0] === "debug" && args[1] === "paths") {
          calls.push("paths")
          return { exitCode: 0, stdout: barrierPathsFor(rootPath), stderr: "", timedOut: false, pid: null }
        }
        if (args[0] === "debug" && args[1] === "config") {
          calls.push("config")
          return { exitCode: 0, stdout: isolatedConfigFor(rootPath), stderr: "", timedOut: false, pid: null }
        }
        if (args[0] === "mcp") {
          calls.push("mcp")
          return { exitCode: 0, stdout: "● lsp connected\n● codemode_probe connected", stderr: "", timedOut: false, pid: null }
        }
        calls.push("run")
        return {
          exitCode: 0,
          stdout: `${JSON.stringify({ type: "text", timestamp: 1, sessionID: "test-session", part: { type: "text" } })}\n`,
          stderr: "",
          timedOut: false,
          pid: null,
        }
      }
      const attempt = await runAttempt({
        id: "attempt-1",
        rootPath,
        options: {
          providerConfig,
          model: "test/model",
          fixtureOut: join(parentRoot, "unused.json"),
          opencode: "opencode",
          timeoutMs: 1000,
        },
        runCommand: command,
        nativeLspPath: process.execPath,
      })
      assert.deepEqual(calls, scenario.expected, scenario.name)
      assert.equal(managedConfigChecked, true, scenario.name)
      if (scenario.expected.length === 1) {
        assert.equal(attempt.cleanup.pidLedgerComplete, true, scenario.name)
      }
      if (scenario.name === "clean") {
        assert.deepEqual(attempt.facts.execute.outputJsonlFacts, {
          eventCount: 1,
          eventTypes: ["text"],
          nonErrorPartCount: 1,
          errorEventCount: 0,
        })
        assert.doesNotMatch(JSON.stringify(attempt.facts.execute.outputJsonlFacts), /test-session|timestamp|session/i)
      }
      if (scenario.name !== "clean") {
        const unsupportedVersion = scenario.name === "unsupported-host-version"
        assert.equal(attempt.facts.host.openCodeAvailable, unsupportedVersion, scenario.name)
        assert.equal(attempt.facts.host.openCodeVersion, unsupportedVersion ? "1.18.3" : null, scenario.name)
        assert.equal(attempt.facts.registration.ocmmLoaded, false, scenario.name)
        assert.equal(attempt.facts.registration.lspConnected, false, scenario.name)
      }
    }
  } finally {
    rmSync(parentRoot, { recursive: true, force: true })
  }
})

test("provider run disables plugin debug so JSONL stdout remains parseable", async () => {
  const parentRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-provider-debug-"))
  const providerConfig = join(parentRoot, "provider.json")
  const baseEnvironmentFingerprint = environmentFingerprint(process.env)
  writeFileSync(providerConfig, JSON.stringify(validProviderConfig()))
  try {
    const rootPath = join(parentRoot, "attempt")
    const debugByStage: Record<string, string | undefined> = {}
    const validEvent = JSON.stringify({
      type: "text",
      timestamp: 1,
      sessionID: "test-session",
      part: { type: "text" },
    })
    const attempt = await runAttempt({
      id: "attempt-1",
      rootPath,
      options: {
        providerConfig,
        model: "test/model",
        fixtureOut: join(parentRoot, "unused.json"),
        opencode: "opencode",
        timeoutMs: 1000,
      },
      nativeLspPath: process.execPath,
      runCommand: async (_command, args, commandOptions): Promise<CommandResult> => {
        const stage = args[0] === "--version"
          ? "version"
          : args[0] === "debug" && args[1] === "paths"
            ? "paths"
            : args[0] === "debug" && args[1] === "config"
              ? "config"
              : args[0] === "mcp"
                ? "mcp"
                : "run"
        debugByStage[stage] = commandOptions.env.OCMM_DEBUG
        if (stage === "version") {
          return { exitCode: 0, stdout: "1.18.4\n", stderr: "", timedOut: false, pid: null }
        }
        if (stage === "paths") {
          return { exitCode: 0, stdout: barrierPathsFor(rootPath), stderr: "", timedOut: false, pid: null }
        }
        if (stage === "config") {
          return { exitCode: 0, stdout: isolatedConfigFor(rootPath), stderr: "", timedOut: false, pid: null }
        }
        if (stage === "mcp") {
          return { exitCode: 0, stdout: "● lsp connected\n● codemode_probe connected", stderr: "", timedOut: false, pid: null }
        }
        const stdout = commandOptions.env.OCMM_DEBUG === "1"
          ? `[ocmm] provider debug diagnostic\n${validEvent}\n`
          : `${validEvent}\n`
        return { exitCode: 0, stdout, stderr: "", timedOut: false, pid: null }
      },
    })

    assert.deepEqual({
      barrierDebug: [debugByStage.version, debugByStage.paths, debugByStage.config, debugByStage.mcp],
      runDebug: debugByStage.run,
      outputJsonlFacts: attempt.facts.execute.outputJsonlFacts,
    }, {
      barrierDebug: ["1", "1", "1", "1"],
      runDebug: "0",
      outputJsonlFacts: {
        eventCount: 1,
        eventTypes: ["text"],
        nonErrorPartCount: 1,
        errorEventCount: 0,
      },
    })
    assert.equal(environmentFingerprint(process.env), baseEnvironmentFingerprint)
  } finally {
    rmSync(parentRoot, { recursive: true, force: true })
  }
})

test("runAttempt enforces XDG, config, and MCP barriers before provider execution", async () => {
  const parentRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-barriers-"))
  const providerConfig = join(parentRoot, "provider.json")
  writeFileSync(providerConfig, JSON.stringify(validProviderConfig()))

  try {
    const escapedRoot = join(parentRoot, "escaped")
    const escapedPaths = `${barrierPathsFor(escapedRoot)}\nstate  C:\\Users\\outside\\state`
    assert.deepEqual(
      await runBarrierCase(parentRoot, providerConfig, "escaped", escapedPaths, "", ""),
      ["version", "paths"],
    )

    const unknownRoot = join(parentRoot, "unknown")
    assert.deepEqual(
      await runBarrierCase(parentRoot, providerConfig, "unknown", `data  ${join(unknownRoot, "data")}`, "", ""),
      ["version", "paths"],
    )

    const badConfigRoot = join(parentRoot, "bad-config")
    const badConfig = `[ocmm] config loaded: project=${join(badConfigRoot, ".opencode", "ocmm.jsonc")}, user=present`
    assert.deepEqual(
      await runBarrierCase(parentRoot, providerConfig, "bad-config", barrierPathsFor(badConfigRoot), badConfig, ""),
      ["version", "paths", "config"],
    )

    const wrongRoot = join(parentRoot, "wrong-root")
    const outsideConfig = `[ocmm] config loaded: project=${join(parentRoot, "outside", ".opencode", "ocmm.jsonc")}, user=<none>`
    assert.deepEqual(
      await runBarrierCase(parentRoot, providerConfig, "wrong-root", barrierPathsFor(wrongRoot), outsideConfig, ""),
      ["version", "paths", "config"],
    )

    const splitConfigRoot = join(parentRoot, "split-config")
    const splitConfig = `[ocmm] config loaded:\nconfig loaded: project=${join(splitConfigRoot, ".opencode", "ocmm.jsonc")}, user=<none>`
    assert.deepEqual(
      await runBarrierCase(parentRoot, providerConfig, "split-config", barrierPathsFor(splitConfigRoot), splitConfig, ""),
      ["version", "paths", "config"],
    )

    const missingMcpRoot = join(parentRoot, "missing-mcp")
    assert.deepEqual(
      await runBarrierCase(
        parentRoot, providerConfig, "missing-mcp", barrierPathsFor(missingMcpRoot), isolatedConfigFor(missingMcpRoot), "lsp connected",
      ),
      ["version", "paths", "config", "mcp"],
    )

    const negativeMcpRoot = join(parentRoot, "negative-mcp")
    assert.deepEqual(
      await runBarrierCase(
        parentRoot, providerConfig, "negative-mcp",
        barrierPathsFor(negativeMcpRoot),
        isolatedConfigFor(negativeMcpRoot),
        "✗ lsp not connected\n✗ codemode_probe not connected",
      ),
      ["version", "paths", "config", "mcp"],
    )

    const mixedMcpRoot = join(parentRoot, "mixed-mcp")
    assert.deepEqual(
      await runBarrierCase(
        parentRoot, providerConfig, "mixed-mcp",
        barrierPathsFor(mixedMcpRoot),
        isolatedConfigFor(mixedMcpRoot),
        "✗ lsp failed\n✓ codemode_probe connected",
      ),
      ["version", "paths", "config", "mcp"],
    )

    const completeRoot = join(parentRoot, "complete")
    assert.deepEqual(
      await runBarrierCase(
        parentRoot, providerConfig, "complete",
        barrierPathsFor(completeRoot),
        isolatedConfigFor(completeRoot),
        "● lsp connected\n● codemode_probe connected",
      ),
      ["version", "paths", "config", "mcp", "run"],
    )
  } finally {
    rmSync(parentRoot, { recursive: true, force: true })
  }
})

test("pre-MCP barriers allow absent ownership ledgers", async () => {
  const parentRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-pre-mcp-ledgers-"))
  const providerConfig = join(parentRoot, "provider.json")
  writeFileSync(providerConfig, JSON.stringify(validProviderConfig()))
  try {
    const cases = [
      { name: "version", expected: ["version"], version: { exitCode: 1, stdout: "", stderr: "", timedOut: false, pid: null } },
      { name: "paths", expected: ["version", "paths"], version: { exitCode: 0, stdout: "1.18.4\n", stderr: "", timedOut: false, pid: null } },
      { name: "config", expected: ["version", "paths", "config"], version: { exitCode: 0, stdout: "1.18.4\n", stderr: "", timedOut: false, pid: null } },
    ] as const
    for (const scenario of cases) {
      const rootPath = join(parentRoot, scenario.name)
      const calls: string[] = []
      const attempt = await runAttempt({
        id: "attempt-1",
        rootPath,
        options: {
          providerConfig,
          model: "test/model",
          fixtureOut: join(parentRoot, "unused.json"),
          opencode: "opencode",
          timeoutMs: 1000,
        },
        nativeLspPath: process.execPath,
        runCommand: async (_command, args): Promise<CommandResult> => {
          if (args[0] === "--version") {
            calls.push("version")
            return scenario.version
          }
          if (args[0] === "debug" && args[1] === "paths") {
            calls.push("paths")
            return {
              exitCode: 0,
              stdout: scenario.name === "paths" ? `data  ${join(rootPath, "data")}` : barrierPathsFor(rootPath),
              stderr: "",
              timedOut: false,
              pid: null,
            }
          }
          if (args[0] === "debug" && args[1] === "config") {
            calls.push("config")
            return {
              exitCode: 0,
              stdout: `[ocmm] config loaded: project=${join(rootPath, ".opencode", "ocmm.jsonc")}, user=present`,
              stderr: "",
              timedOut: false,
              pid: null,
            }
          }
          assert.fail(`unexpected MCP/provider command: ${args.join(" ")}`)
        },
      })
      assert.deepEqual(calls, scenario.expected, scenario.name)
      assert.equal(attempt.cleanup.pidLedgerComplete, true, scenario.name)
      assert.deepEqual(attempt.pids.fixture, [], scenario.name)
      assert.deepEqual(attempt.pids.wrapper, [], scenario.name)
      assert.deepEqual(attempt.pids.native, [], scenario.name)
    }
  } finally {
    rmSync(parentRoot, { recursive: true, force: true })
  }
})

test("runAttempt config barrier requires exactly one correct ocmm marker", async () => {
  const parentRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-config-count-"))
  const providerConfig = join(parentRoot, "provider.json")
  writeFileSync(providerConfig, JSON.stringify(validProviderConfig()))
  try {
    const duplicateRoot = join(parentRoot, "duplicate-correct")
    const correct = isolatedConfigFor(duplicateRoot)
    assert.deepEqual(
      await runBarrierCase(
        parentRoot, providerConfig, "duplicate-correct", barrierPathsFor(duplicateRoot), `${correct}\n${correct}`, "",
      ),
      ["version", "paths", "config"],
    )

    const wrongMixedRoot = join(parentRoot, "correct-wrong")
    const wrong = `[ocmm] config loaded: project=${join(parentRoot, "outside", ".opencode", "ocmm.jsonc")}, user=<none>`
    assert.deepEqual(
      await runBarrierCase(
        parentRoot, providerConfig, "correct-wrong", barrierPathsFor(wrongMixedRoot),
        `${isolatedConfigFor(wrongMixedRoot)}\n${wrong}`, "",
      ),
      ["version", "paths", "config"],
    )

    const userMixedRoot = join(parentRoot, "correct-user")
    const user = `[ocmm] config loaded: project=${join(userMixedRoot, ".opencode", "ocmm.jsonc")}, user=present`
    assert.deepEqual(
      await runBarrierCase(
        parentRoot, providerConfig, "correct-user", barrierPathsFor(userMixedRoot),
        `${isolatedConfigFor(userMixedRoot)}\n${user}`, "",
      ),
      ["version", "paths", "config"],
    )
  } finally {
    rmSync(parentRoot, { recursive: true, force: true })
  }
})

test("runAttempt MCP barrier rejects duplicate and cross-line statuses", async () => {
  const parentRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-mcp-count-"))
  const providerConfig = join(parentRoot, "provider.json")
  writeFileSync(providerConfig, JSON.stringify(validProviderConfig()))
  try {
    const duplicateLspRoot = join(parentRoot, "duplicate-lsp")
    assert.deepEqual(
      await runBarrierCase(
        parentRoot, providerConfig, "duplicate-lsp", barrierPathsFor(duplicateLspRoot),
        isolatedConfigFor(duplicateLspRoot), "lsp connected\nlsp connected\ncodemode_probe connected",
      ),
      ["version", "paths", "config", "mcp"],
    )

    const duplicateProbeRoot = join(parentRoot, "duplicate-probe")
    assert.deepEqual(
      await runBarrierCase(
        parentRoot, providerConfig, "duplicate-probe", barrierPathsFor(duplicateProbeRoot),
        isolatedConfigFor(duplicateProbeRoot), "lsp connected\ncodemode_probe connected\ncodemode_probe connected",
      ),
      ["version", "paths", "config", "mcp"],
    )

    const splitLspRoot = join(parentRoot, "split-lsp")
    assert.deepEqual(
      await runBarrierCase(
        parentRoot, providerConfig, "split-lsp", barrierPathsFor(splitLspRoot),
        isolatedConfigFor(splitLspRoot), "lsp\nconnected\ncodemode_probe connected",
      ),
      ["version", "paths", "config", "mcp"],
    )

    const splitProbeRoot = join(parentRoot, "split-probe")
    assert.deepEqual(
      await runBarrierCase(
        parentRoot, providerConfig, "split-probe", barrierPathsFor(splitProbeRoot),
        isolatedConfigFor(splitProbeRoot), "lsp connected\ncodemode_probe\nconnected",
      ),
      ["version", "paths", "config", "mcp"],
    )

    const sameLineMixedRoot = join(parentRoot, "same-line-mixed")
    assert.deepEqual(
      await runBarrierCase(
        parentRoot, providerConfig, "same-line-mixed", barrierPathsFor(sameLineMixedRoot),
        isolatedConfigFor(sameLineMixedRoot), "● lsp connected lsp failed\n● codemode_probe connected",
      ),
      ["version", "paths", "config", "mcp"],
    )

    const trailingJunkRoot = join(parentRoot, "trailing-junk")
    assert.deepEqual(
      await runBarrierCase(
        parentRoot, providerConfig, "trailing-junk", barrierPathsFor(trailingJunkRoot),
        isolatedConfigFor(trailingJunkRoot), "● lsp connected unexpected\n● codemode_probe connected",
      ),
      ["version", "paths", "config", "mcp"],
    )
  } finally {
    rmSync(parentRoot, { recursive: true, force: true })
  }
})

test("OpenCode hashing follows a sibling Scoop shim to the real executable", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-shim-"))
  try {
    const shimExecutable = join(root, "opencode.exe")
    const shimMetadata = join(root, "opencode.shim")
    const target = join(root, "real-opencode.exe")
    writeFileSync(shimExecutable, "shim executable bytes")
    writeFileSync(target, "real target bytes")
    writeFileSync(shimMetadata, `path = "${target}"\n`)
    const expectedTargetHash = createHash("sha256").update(readFileSync(target)).digest("hex")
    const shimHash = createHash("sha256").update(readFileSync(shimExecutable)).digest("hex")
    assert.notEqual(expectedTargetHash, shimHash)
    assert.equal(hashOpenCodeExecutable(shimExecutable), expectedTargetHash)
    assert.equal(hashOpenCodeExecutable(target), expectedTargetHash)
    assert.doesNotMatch(String(hashOpenCodeExecutable(shimExecutable)), /[\\/]/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("OpenCode hashing fails closed for an existing invalid Scoop shim", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-shim-invalid-"))
  try {
    const cases = [
      { name: "malformed", shim: "not a path assignment\n" },
      { name: "relative", shim: "path = relative-opencode.exe\n" },
      { name: "missing", shim: `path = "${join(root, "missing-target.exe")}"\n` },
    ]
    for (const entry of cases) {
      const executable = join(root, `${entry.name}.exe`)
      writeFileSync(executable, `shim bytes ${entry.name}`)
      writeFileSync(join(root, `${entry.name}.shim`), entry.shim)
      assert.equal(hashOpenCodeExecutable(executable), null, entry.name)
    }

    const direct = join(root, "direct.exe")
    writeFileSync(direct, "direct bytes")
    assert.equal(
      hashOpenCodeExecutable(direct),
      createHash("sha256").update(readFileSync(direct)).digest("hex"),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("OpenCode config keeps only provider allowlist and exact isolated probe surfaces", () => {
  const base = validProviderConfig({
    $schema: "https://opencode.ai/config.json",
    enabled_providers: ["test"],
    disabled_providers: ["unused"],
    share: "auto",
    autoupdate: true,
    plugin: ["host-plugin", "npm-dangerous-plugin"],
    mcp: { hostile: { type: "remote", url: "https://outside.invalid" } },
    permission: { execute: "deny", bash: "allow", task: "allow", unrelated: "allow" },
    command: { hostile: { template: "do not load" } },
    instructions: ["C:\\outside\\AGENTS.md"],
    skills: { paths: ["C:\\outside\\skills"] },
    references: { hostile: { path: "C:\\outside" } },
    agent: { hostile: { model: "other/model" } },
    arbitrary: "must be stripped",
  })
  const merged = buildOpenCodeConfig(base, {
    ocmmPlugin: "C:\\repo\\dist\\index.js",
    tracePlugin: "C:\\repo\\scripts\\fixtures\\codemode-execute-hook-trace-plugin.mjs",
    nodePath: "C:\\node.exe",
    probeMcp: "C:\\repo\\scripts\\fixtures\\codemode-execute-probe-mcp.mjs",
  })
  assert.equal(merged.$schema, base.$schema)
  assert.deepEqual(merged.provider, base.provider)
  assert.deepEqual(merged.enabled_providers, ["test"])
  assert.deepEqual(merged.disabled_providers, ["unused"])
  assert.equal(merged.share, "disabled")
  assert.equal(merged.autoupdate, false)
  assert.deepEqual(merged.plugin, [
    "C:\\repo\\dist\\index.js",
    "C:\\repo\\scripts\\fixtures\\codemode-execute-hook-trace-plugin.mjs",
  ])
  assert.deepEqual(merged.mcp, {
    codemode_probe: {
      type: "local",
      command: ["C:\\node.exe", "C:\\repo\\scripts\\fixtures\\codemode-execute-probe-mcp.mjs"],
      enabled: true,
    },
  })
  assert.deepEqual(merged.permission, {
    task: "deny",
    bash: "deny",
    execute: "allow",
    "lsp_*": "allow",
    "codemode_probe_*": "allow",
    codemode_probe_denied: "deny",
  })
  assert.deepEqual(Object.keys(merged.permission as Record<string, unknown>), [
    "task", "bash", "execute", "lsp_*", "codemode_probe_*", "codemode_probe_denied",
  ])
  assert.deepEqual(Object.keys(merged), [
    "$schema", "provider", "enabled_providers", "disabled_providers", "share", "autoupdate", "plugin", "mcp", "permission",
  ])
  for (const forbidden of ["host-plugin", "npm-dangerous-plugin", "hostile", "do not load", "AGENTS.md", "arbitrary"]) {
    assert.equal(JSON.stringify(merged).includes(forbidden), false, forbidden)
  }
})

test("OpenCode 1.18.4 provider SDK routes are limited to the bundled no-install map", () => {
  const options = {
    ocmmPlugin: "C:\\repo\\dist\\index.js",
    tracePlugin: "C:\\repo\\scripts\\fixtures\\codemode-execute-hook-trace-plugin.mjs",
    nodePath: "C:\\node.exe",
    probeMcp: "C:\\repo\\scripts\\fixtures\\codemode-execute-probe-mcp.mjs",
  }
  const bundledProviderNpmIds = (compatibilityRunner as unknown as {
    OPENCODE_1_18_4_BUNDLED_PROVIDER_NPM_IDS: readonly string[]
  }).OPENCODE_1_18_4_BUNDLED_PROVIDER_NPM_IDS
  assert.deepEqual(
    [...bundledProviderNpmIds],
    [...EXPECTED_OPENCODE_1_18_4_BUNDLED_PROVIDER_NPM_IDS],
  )
  for (const npm of bundledProviderNpmIds) {
    assert.doesNotThrow(() => buildOpenCodeConfig({
      provider: { test: { npm, models: { model: {} } } },
    }, options), `provider-level ${npm}`)
    assert.doesNotThrow(() => buildOpenCodeConfig({
      provider: { test: { models: { model: { provider: { npm } } } } },
    }, options), `model-level ${npm}`)
  }

  const rejected = [
    { provider: { test: { models: { model: {} } } } },
    { provider: { test: { npm: "custom-provider-sdk", models: { model: {} } } } },
    { provider: { test: { npm: "file:///outside/provider.mjs", models: { model: {} } } } },
    { provider: {
      test: {
        npm: "@ai-sdk/openai-compatible",
        models: { model: { provider: { npm: "custom-provider-sdk" } } },
      },
    } },
    { provider: {
      test: {
        npm: "@ai-sdk/openai-compatible",
        models: { model: { provider: { npm: "file:///outside/provider.mjs" } } },
      },
    } },
  ]
  for (const config of rejected) {
    assert.throws(() => buildOpenCodeConfig(config, options), /bundled provider SDK/i)
  }
})

test("poisoned parent environment cannot override isolated child evidence", () => {
  const parentEnv = {
    PATH: "C:\\bin",
    home: "C:\\outside\\home",
    UserProfile: "C:\\outside\\profile",
    OPENCODE_EXPERIMENTAL: "true",
    opencode_config: "C:\\outside\\opencode.json",
    OpenCode_Config_Content: "secret inline config",
    opencode_CONFIG_dir: "C:\\outside\\config",
    OpenCode_PERMISSION: "deny",
    opencode_disable_project_config: "true",
    OpenCode_Pure: "true",
    opencode_plugin_meta_file: "C:\\outside\\plugins.json",
    OpenCode_Auto_Share: "true",
    OpenCode_Test_Home: "C:\\outside\\test-home",
    opencode_TEST_managed_config_DIR: "C:\\ProgramData\\opencode",
    ocmm_fast: "true",
    Ocmm_Profile: "poisoned-profile",
    OCMM_no_profile: "true",
    PROVIDER_API_KEY: "preserve-provider-credential",
  }
  const originalParent = { ...parentEnv }
  const env = buildChildEnvironment(
    parentEnv,
    {
      runRoot: "C:\\Temp\\opencode\\probe",
      lspCommand: ["node", "wrapper.mjs", "pids.json", "ocmm-lsp.exe", "mcp"],
      hookTracePath: "C:\\Temp\\opencode\\probe\\raw\\hooks.jsonl",
      mcpEventsPath: "C:\\Temp\\opencode\\probe\\raw\\mcp.jsonl",
      fixturePidPath: "C:\\Temp\\opencode\\probe\\pid\\fixture.jsonl",
      stopSignalPath: "C:\\Temp\\opencode\\probe\\pid\\stop",
    },
  )
  assert.equal(env.OPENCODE_EXPERIMENTAL, "false")
  assert.equal(env.OPENCODE_EXPERIMENTAL_CODE_MODE, "true")
  assert.equal(env.OCMM_DEBUG, "1")
  assert.equal(env.HOME, "C:\\Temp\\opencode\\probe")
  assert.equal(env.USERPROFILE, "C:\\Temp\\opencode\\probe")
  assert.equal(env.OPENCODE_CONFIG, "C:\\Temp\\opencode\\probe\\opencode.json")
  assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG, "1")
  assert.equal(env.OPENCODE_TEST_HOME, "C:\\Temp\\opencode\\probe")
  assert.equal(env.OPENCODE_TEST_MANAGED_CONFIG_DIR, "C:\\Temp\\opencode\\probe\\managed-config")
  const removedKeys = new Set([
    "OPENCODE_CONFIG_CONTENT",
    "OPENCODE_CONFIG_DIR",
    "OPENCODE_PERMISSION",
    "OPENCODE_PURE",
    "OPENCODE_PLUGIN_META_FILE",
    "OPENCODE_AUTO_SHARE",
    "OCMM_FAST",
    "OCMM_PROFILE",
    "OCMM_NO_PROFILE",
  ])
  for (const key of Object.keys(env)) assert.equal(removedKeys.has(key.toUpperCase()), false, key)
  assert.equal(Object.keys(env).filter((key) => key.toUpperCase() === "HOME").length, 1)
  assert.equal(Object.keys(env).filter((key) => key.toUpperCase() === "USERPROFILE").length, 1)
  assert.equal(Object.keys(env).filter((key) => key.toUpperCase() === "OPENCODE_CONFIG").length, 1)
  assert.equal(Object.keys(env).filter((key) => key.toUpperCase() === "OPENCODE_DISABLE_PROJECT_CONFIG").length, 1)
  assert.equal(Object.keys(env).filter((key) => key.toUpperCase() === "OPENCODE_TEST_HOME").length, 1)
  assert.equal(Object.keys(env).filter((key) => key.toUpperCase() === "OPENCODE_TEST_MANAGED_CONFIG_DIR").length, 1)
  assert.equal(env.PROVIDER_API_KEY, "preserve-provider-credential")
  assert.deepEqual(parentEnv, originalParent)
  assert.equal(env.XDG_CONFIG_HOME, "C:\\Temp\\opencode\\probe\\xdg-config")
  assert.equal(env.XDG_DATA_HOME, "C:\\Temp\\opencode\\probe\\xdg-data")
  assert.equal(env.XDG_STATE_HOME, "C:\\Temp\\opencode\\probe\\xdg-state")
  assert.equal(env.XDG_CACHE_HOME, "C:\\Temp\\opencode\\probe\\xdg-cache")
  assert.match(String(env.OCMM_CODEMODE_STOP_PATH), /probe\\pid\\stop$/)
  assert.equal(
    env.OCMM_CODEMODE_EXPECTED_CODE_SHA256,
    createHash("sha256").update(buildProbeCode()).digest("hex"),
  )
  assert.deepEqual(JSON.parse(String(env.OCMM_LSP_COMMAND)), [
    "node", "wrapper.mjs", "pids.json", "ocmm-lsp.exe", "mcp",
  ])
})

test("attempt-local environment and allowlisted config exclude poisoned ancestor and home sources", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-source-isolation-"))
  const ancestor = join(root, "poisoned-ancestor")
  const poisonedHome = join(root, "poisoned-home")
  const attemptRoot = join(root, "attempt")
  const outsidePlugin = join(ancestor, "hostile-plugin.mjs")
  const attemptConfig = join(attemptRoot, "opencode.json")
  try {
    mkdirSync(join(ancestor, ".opencode"), { recursive: true })
    mkdirSync(join(poisonedHome, ".config", "opencode"), { recursive: true })
    mkdirSync(attemptRoot, { recursive: true })
    writeFileSync(join(ancestor, "opencode.json"), JSON.stringify({ plugin: [outsidePlugin] }))
    writeFileSync(join(ancestor, "AGENTS.md"), "poisoned ancestor instructions")
    writeFileSync(join(poisonedHome, ".config", "opencode", "opencode.json"), JSON.stringify({ share: "auto" }))
    writeFileSync(outsidePlugin, "export default {}")

    const env = buildChildEnvironment({
      ...process.env,
      HOME: poisonedHome,
      USERPROFILE: poisonedHome,
      OPENCODE_CONFIG: join(ancestor, "opencode.json"),
      OPENCODE_CONFIG_DIR: join(ancestor, ".opencode"),
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugin: [outsidePlugin] }),
    }, {
      runRoot: attemptRoot,
      lspCommand: [process.execPath, "wrapper.mjs", "pids.json", "ocmm-lsp.exe", "mcp"],
      hookTracePath: join(attemptRoot, "raw", "hooks.jsonl"),
      mcpEventsPath: join(attemptRoot, "raw", "mcp.jsonl"),
      fixturePidPath: join(attemptRoot, "pid", "fixture.jsonl"),
      stopSignalPath: join(attemptRoot, "pid", "stop"),
    })
    const config = buildOpenCodeConfig(validProviderConfig({
      plugin: [outsidePlugin],
      instructions: [join(ancestor, "AGENTS.md")],
      share: "auto",
    }), {
      ocmmPlugin: join(PROJECT_ROOT, "dist", "index.js"),
      tracePlugin: TRACE_PLUGIN_FIXTURE,
      nodePath: process.execPath,
      probeMcp: MCP_FIXTURE,
    })
    writeFileSync(attemptConfig, `${JSON.stringify(config, null, 2)}\n`)

    assert.equal(env.HOME, attemptRoot)
    assert.equal(env.USERPROFILE, attemptRoot)
    assert.equal(env.OPENCODE_CONFIG, attemptConfig)
    assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG, "1")
    const construction = JSON.stringify({ cwd: attemptRoot, command: "opencode", env, config })
    for (const poison of [ancestor, poisonedHome, outsidePlugin, "poisoned ancestor instructions"]) {
      assert.equal(construction.includes(poison), false, poison)
    }
    assert.deepEqual(config.plugin, [join(PROJECT_ROOT, "dist", "index.js"), TRACE_PLUGIN_FIXTURE])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("MCP fixture serves deterministic newline JSON-RPC probes without marker leakage", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-mcp-"))
  const eventsPath = join(root, "events.jsonl")
  const pidDirectory = join(root, "pid")
  const pidPath = join(pidDirectory, "fixture.jsonl")
  mkdirSync(pidDirectory)

  try {
    const child = spawn(process.execPath, [MCP_FIXTURE], {
      env: {
        ...process.env,
        OCMM_CODEMODE_PROBE_EVENTS: eventsPath,
        OCMM_CODEMODE_PROBE_PID_FILE: pidPath,
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })
    const fixedMarker = "OCMM_CODEMODE_EXECUTE_PROBE"
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" },
    })}\n`)
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`)
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "identity", arguments: { marker: fixedMarker } },
    })}\n`)
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "json_error", arguments: {} },
    })}\n`)
    child.stdin.end()

    const { code, stdout, stderr } = await waitForExit(child)
    assert.equal(code, 0, stderr)
    const responses = stdout.trim().split("\n").map((line) => JSON.parse(line)) as Array<{
      id: number
      result?: { tools?: Array<{ name: string }>; content?: Array<{ text: string }> }
    }>
    assert.deepEqual(responses.find((response) => response.id === 2)?.result?.tools?.map((tool) => tool.name), [
      "identity", "json_error", "denied",
    ])
    assert.match(responses.find((response) => response.id === 3)?.result?.content?.[0]?.text ?? "", new RegExp(fixedMarker))
    assert.match(
      responses.find((response) => response.id === 4)?.result?.content?.[0]?.text ?? "",
      /OCMM_CODEMODE_HOOK_SENTINEL/,
    )

    const pidRows = parseJsonLines(pidPath) as Array<{ fixturePid: unknown }>
    assert.equal(pidRows.length, 1)
    assert.equal(typeof pidRows[0]?.fixturePid, "number")
    assert.ok(Number.isInteger(pidRows[0]?.fixturePid))

    const eventText = readFileSync(eventsPath, "utf8")
    assert.doesNotMatch(eventText, new RegExp(fixedMarker))
    assert.deepEqual((parseJsonLines(eventsPath) as Array<{ event: string }>).map((row) => row.event), [
      "started", "tools/list", "tools/call:identity", "tools/call:json_error", "stopped",
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
    assert.equal(existsSync(root), false)
  }
})

test("MCP identity rejects wrong or missing markers without emitting the success marker", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-mcp-invalid-"))
  const eventsPath = join(root, "events.jsonl")
  const pidDirectory = join(root, "pid")
  const pidPath = join(pidDirectory, "fixture.jsonl")
  mkdirSync(pidDirectory)
  try {
    const child = spawn(process.execPath, [MCP_FIXTURE], {
      env: {
        ...process.env,
        OCMM_CODEMODE_PROBE_EVENTS: eventsPath,
        OCMM_CODEMODE_PROBE_PID_FILE: pidPath,
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "identity", arguments: { marker: "wrong" } },
    })}\n`)
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "identity", arguments: {} },
    })}\n`)
    child.stdin.end()
    const completed = await waitForExit(child)
    assert.equal(completed.code, 0, completed.stderr)
    assert.doesNotMatch(completed.stdout, /OCMM_CODEMODE_EXECUTE_PROBE/)
    const responses = completed.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line)) as Array<{
      id: number
      error?: { code: number; message: string }
    }>
    assert.deepEqual(responses.map((response) => response.error?.code), [-32602, -32602])
    assert.doesNotMatch(readFileSync(eventsPath, "utf8"), /wrong|OCMM_CODEMODE_EXECUTE_PROBE/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("MCP fixture exits on its attempt-local stop signal", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-mcp-stop-"))
  const eventsPath = join(root, "events.jsonl")
  const pidDirectory = join(root, "pid")
  const pidPath = join(pidDirectory, "fixture.jsonl")
  const stopPath = join(pidDirectory, "stop")
  mkdirSync(pidDirectory)
  const child = spawn(process.execPath, [MCP_FIXTURE], {
    env: {
      ...process.env,
      OCMM_CODEMODE_PROBE_EVENTS: eventsPath,
      OCMM_CODEMODE_PROBE_PID_FILE: pidPath,
      OCMM_CODEMODE_STOP_PATH: stopPath,
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
  const completion = waitForExit(child)
  try {
    await waitForFile(pidPath)
    writeFileSync(stopPath, "stop\n")
    const completed = await Promise.race([
      completion,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("MCP fixture ignored stop signal")), 1500)),
    ])
    assert.equal(completed.code, 0, completed.stderr)
    assert.match(readFileSync(eventsPath, "utf8"), /"event":"stopped"/)
  } finally {
    if (child.exitCode === null) {
      child.stdin.end()
      await completion.catch(() => undefined)
    }
    rmSync(root, { recursive: true, force: true })
  }
})

test("trace plugin records only redacted hook-shape evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-trace-"))
  const tracePath = join(root, "trace.jsonl")
  const previousTracePath = process.env.OCMM_CODEMODE_TRACE_PATH
  const previousCodeHash = process.env.OCMM_CODEMODE_EXPECTED_CODE_SHA256
  process.env.OCMM_CODEMODE_TRACE_PATH = tracePath
  process.env.OCMM_CODEMODE_EXPECTED_CODE_SHA256 = createHash("sha256").update(buildProbeCode()).digest("hex")

  try {
    const plugin = await import(`${pathToFileURL(TRACE_PLUGIN_FIXTURE).href}?test=${Date.now()}-${Math.random()}`)
    const hooks = plugin.default.server()
    const before = hooks["tool.execute.before"]
    const after = hooks["tool.execute.after"]
    assert.ok(before)
    assert.ok(after)

    const privateMarker = "MUST_NOT_APPEAR_IN_TRACE"
    await before(
      { toolID: "EXECUTE", sessionID: "private-session", callID: "private-call" },
      { args: { marker: privateMarker } },
    )
    await after(
      {
        tool: { name: "CoDeMode_Probe_Identity" },
        session_id: "private-session",
        call_id: "private-call",
        args: { marker: privateMarker },
      },
      {
        output: 'OCMM_CODEMODE_EXECUTE_PROBE {"deniedVisible": false, "lspOk": true, "identityOk": true, "hookPayloadOk": true}',
        metadata: {
          toolCalls: [
            { tool: "LSP_Status", status: "completed" },
            { tool: "CoDeMode_Probe_Json_Error", status: "error" },
            { tool: "ignored", status: "invalid" },
          ],
        },
      },
    )

    const traceText = readFileSync(tracePath, "utf8")
    assert.doesNotMatch(traceText, /MUST_NOT_APPEAR_IN_TRACE|private-session|private-call/)
    assert.deepEqual(parseJsonLines(tracePath), [
      {
        phase: "before",
        tool: "execute",
        hasSessionID: true,
        hasCallID: true,
        argumentKeys: ["marker"],
        nestedStatuses: [],
        safeMarkers: {
          exactCode: false,
          executeProbe: false,
          deniedHidden: false,
          lspOk: false,
          identityOk: false,
          hookPayloadOk: false,
        },
      },
      {
        phase: "after",
        tool: "codemode_probe_identity",
        hasSessionID: true,
        hasCallID: true,
        argumentKeys: ["marker"],
        nestedStatuses: [
          { tool: "lsp_status", status: "completed" },
          { tool: "codemode_probe_json_error", status: "error" },
        ],
        safeMarkers: {
          exactCode: false,
          executeProbe: true,
          deniedHidden: true,
          lspOk: true,
          identityOk: true,
          hookPayloadOk: true,
        },
      },
    ])
  } finally {
    if (previousTracePath === undefined) delete process.env.OCMM_CODEMODE_TRACE_PATH
    else process.env.OCMM_CODEMODE_TRACE_PATH = previousTracePath
    if (previousCodeHash === undefined) delete process.env.OCMM_CODEMODE_EXPECTED_CODE_SHA256
    else process.env.OCMM_CODEMODE_EXPECTED_CODE_SHA256 = previousCodeHash
    rmSync(root, { recursive: true, force: true })
    assert.equal(existsSync(root), false)
  }
})

test("trace before hook supports official second-parameter args and first-parameter fallback", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-trace-before-"))
  const tracePath = join(root, "trace.jsonl")
  const previousTracePath = process.env.OCMM_CODEMODE_TRACE_PATH
  const previousCodeHash = process.env.OCMM_CODEMODE_EXPECTED_CODE_SHA256
  process.env.OCMM_CODEMODE_TRACE_PATH = tracePath
  process.env.OCMM_CODEMODE_EXPECTED_CODE_SHA256 = createHash("sha256").update(buildProbeCode()).digest("hex")
  try {
    const plugin = await import(`${pathToFileURL(TRACE_PLUGIN_FIXTURE).href}?before=${Date.now()}-${Math.random()}`)
    const before = plugin.default.server()["tool.execute.before"]
    await before(
      { tool: "execute", sessionID: "official-session", callID: "official-call" },
      { args: { code: buildProbeCode() } },
    )
    await before(
      {
        tool: "lsp_status",
        sessionID: "compat-session",
        callID: "compat-call",
        args: { workspace: "COMPAT_VALUE_MUST_NOT_APPEAR" },
      },
      {},
    )
    await before(
      {
        tool: "codemode_probe_identity",
        sessionID: "both-session",
        callID: "both-call",
        args: { legacy: "FIRST_PARAMETER_MUST_NOT_WIN" },
      },
      { args: { marker: "SECOND_PARAMETER_MUST_WIN" } },
    )
    const text = readFileSync(tracePath, "utf8")
    assert.doesNotMatch(text, /codemode_probe\.denied|COMPAT_VALUE_MUST_NOT_APPEAR|FIRST_PARAMETER_MUST_NOT_WIN|SECOND_PARAMETER_MUST_WIN|official-session|compat-session|both-session/)
    const rows = parseJsonLines(tracePath) as Array<{ tool: string; argumentKeys: string[]; safeMarkers: { exactCode: boolean } }>
    assert.deepEqual(rows.map((row) => ({ tool: row.tool, argumentKeys: row.argumentKeys })), [
      { tool: "execute", argumentKeys: ["code"] },
      { tool: "lsp_status", argumentKeys: ["workspace"] },
      { tool: "codemode_probe_identity", argumentKeys: ["marker"] },
    ])
    assert.deepEqual(rows.map((row) => row.safeMarkers.exactCode), [true, false, false])
  } finally {
    if (previousTracePath === undefined) delete process.env.OCMM_CODEMODE_TRACE_PATH
    else process.env.OCMM_CODEMODE_TRACE_PATH = previousTracePath
    if (previousCodeHash === undefined) delete process.env.OCMM_CODEMODE_EXPECTED_CODE_SHA256
    else process.env.OCMM_CODEMODE_EXPECTED_CODE_SHA256 = previousCodeHash
    rmSync(root, { recursive: true, force: true })
  }
})

test("trace exact-code attestation rejects wrong and missing execute code without leaking values", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-trace-code-"))
  const tracePath = join(root, "trace.jsonl")
  const previousTracePath = process.env.OCMM_CODEMODE_TRACE_PATH
  const previousCodeHash = process.env.OCMM_CODEMODE_EXPECTED_CODE_SHA256
  process.env.OCMM_CODEMODE_TRACE_PATH = tracePath
  process.env.OCMM_CODEMODE_EXPECTED_CODE_SHA256 = createHash("sha256").update(buildProbeCode()).digest("hex")
  try {
    const plugin = await import(`${pathToFileURL(TRACE_PLUGIN_FIXTURE).href}?code=${Date.now()}-${Math.random()}`)
    const before = plugin.default.server()["tool.execute.before"]
    await before({ tool: "execute", sessionID: "s1", callID: "c1" }, { args: { code: buildProbeCode() } })
    await before({ tool: "execute", sessionID: "s2", callID: "c2" }, { args: { code: "WRONG_CODE_MUST_NOT_LEAK" } })
    await before({ tool: "execute", sessionID: "s3", callID: "c3" }, { args: {} })
    const text = readFileSync(tracePath, "utf8")
    assert.doesNotMatch(text, /codemode_probe\.denied|WRONG_CODE_MUST_NOT_LEAK|s[123]|c[123]/)
    const rows = parseJsonLines(tracePath) as Array<{ safeMarkers: { exactCode: boolean } }>
    assert.deepEqual(rows.map((row) => row.safeMarkers.exactCode), [true, false, false])

    for (const row of rows.slice(1)) {
      const forged = passingFacts()
      forged.execute.exactCode = row.safeMarkers.exactCode
      assert.equal(classifyProbe(forged).reasonCode, "execute-code-mismatch")
    }
  } finally {
    if (previousTracePath === undefined) delete process.env.OCMM_CODEMODE_TRACE_PATH
    else process.env.OCMM_CODEMODE_TRACE_PATH = previousTracePath
    if (previousCodeHash === undefined) delete process.env.OCMM_CODEMODE_EXPECTED_CODE_SHA256
    else process.env.OCMM_CODEMODE_EXPECTED_CODE_SHA256 = previousCodeHash
    rmSync(root, { recursive: true, force: true })
  }
})

test("process wrapper records real native child exit and leaves no survivor", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-wrapper-"))
  const pidDirectory = join(root, "pid")
  const pidPath = join(pidDirectory, "lsp.jsonl")
  mkdirSync(pidDirectory)

  try {
    const child = spawn(process.execPath, [
      PROCESS_WRAPPER_FIXTURE,
      pidPath,
      process.execPath,
      "-e",
      "setTimeout(() => process.exit(0), 25)",
    ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
    const { code, stderr } = await waitForExit(child)
    assert.equal(code, 0, stderr)

    const pidRows = parseJsonLines(pidPath) as Array<{ wrapperPid: unknown; nativePid: unknown }>
    assert.equal(pidRows.length, 1)
    assert.equal(typeof pidRows[0]?.wrapperPid, "number")
    assert.ok(Number.isInteger(pidRows[0]?.wrapperPid))
    assert.equal(typeof pidRows[0]?.nativePid, "number")
    assert.ok(Number.isInteger(pidRows[0]?.nativePid))
    await waitForProcessExit(pidRows[0]?.nativePid as number)
  } finally {
    rmSync(root, { recursive: true, force: true })
    assert.equal(existsSync(root), false)
  }
})

test("process wrapper stop signal terminates and reaps its owned native child", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-wrapper-stop-"))
  const pidDirectory = join(root, "pid")
  const pidPath = join(pidDirectory, "lsp.jsonl")
  const stopPath = join(pidDirectory, "stop")
  mkdirSync(pidDirectory)
  let child: ReturnType<typeof spawn> | null = null
  let completion: ReturnType<typeof waitForExit> | null = null
  let nativePid: number | null = null
  try {
    child = spawn(process.execPath, [
      PROCESS_WRAPPER_FIXTURE,
      pidPath,
      process.execPath,
      "-e",
      "setInterval(() => {}, 1000)",
    ], {
      env: { ...process.env, OCMM_CODEMODE_STOP_PATH: stopPath },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    completion = waitForExit(child)
    await waitForFile(pidPath)
    nativePid = (parseJsonLines(pidPath)[0] as { nativePid: number }).nativePid
    assert.equal(testPidAlive(nativePid), true)
    writeFileSync(stopPath, "stop\n")
    const completed = await Promise.race([
      completion,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("wrapper ignored stop signal")), 1500)),
    ])
    assert.equal(completed.code, 0, completed.stderr)
    await waitForProcessExit(nativePid)
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM")
      if (completion) await completion.catch(() => undefined)
    }
    rmSync(root, { recursive: true, force: true })
  }
})

test("process wrapper clears its stop watcher when native spawn fails", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-wrapper-error-"))
  const pidDirectory = join(root, "pid")
  const pidPath = join(pidDirectory, "lsp.jsonl")
  mkdirSync(pidDirectory)
  try {
    const completed = await runCommand(process.execPath, [
      PROCESS_WRAPPER_FIXTURE,
      pidPath,
      join(root, "missing-native.exe"),
    ], {
      cwd: root,
      env: { ...process.env, OCMM_CODEMODE_STOP_PATH: join(pidDirectory, "stop") },
      timeoutMs: 1000,
    })
    assert.equal(completed.timedOut, false)
    assert.equal(completed.exitCode, 1)
    assert.match(completed.stderr, /ENOENT|not found/i)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("runCommand waits for close and drains inherited descendant output", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-close-drain-"))
  const marker = `OCMM_RUNCOMMAND_LATE_CLOSE_${process.pid}_${Date.now()}`
  const descendantCode = `setTimeout(() => { process.stdout.write(${JSON.stringify(`${marker}\n`)}) }, 1200)`
  const parentCode = [
    'const { spawn } = require("node:child_process")',
    `const child = spawn(process.execPath, ["-e", ${JSON.stringify(descendantCode)}], ` +
      '{ stdio: ["ignore", "inherit", "inherit"], detached: true, windowsHide: true })',
    "child.unref()",
    "setTimeout(() => process.exit(0), 50)",
  ].join("; ")
  const started = Date.now()
  try {
    const completed = await runCommand(process.execPath, ["-e", parentCode], {
      cwd: root,
      env: { ...process.env },
      timeoutMs: 4000,
    })
    const elapsed = Date.now() - started
    assert.equal(completed.timedOut, false)
    assert.equal(completed.exitCode, 0)
    assert.equal(elapsed >= 1000, true, `runCommand resolved before close after ${elapsed}ms`)
    assert.match(completed.stdout, new RegExp(marker))
  } finally {
    const remaining = 1600 - (Date.now() - started)
    if (remaining > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, remaining))
    rmSync(root, { recursive: true, force: true })
  }
})

test("runCommand never kills an exited child while a descendant holds inherited output", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-exited-child-"))
  const marker = `OCMM_RUNCOMMAND_EXITED_CHILD_${process.pid}_${Date.now()}`
  const descendantCode = `setTimeout(() => { process.stdout.write(${JSON.stringify(`${marker}\n`)}) }, 2300)`
  const parentCode = [
    'const { spawn } = require("node:child_process")',
    `const child = spawn(process.execPath, ["-e", ${JSON.stringify(descendantCode)}], ` +
      '{ stdio: ["ignore", "inherit", "inherit"], detached: true, windowsHide: true })',
    "child.unref()",
    "setTimeout(() => process.exit(0), 50)",
  ].join("; ")
  const originalKill = ChildProcess.prototype.kill
  let killCalls = 0
  const started = Date.now()
  ChildProcess.prototype.kill = function (signal?: NodeJS.Signals | number): boolean {
    killCalls += 1
    return originalKill.call(this, signal)
  }
  try {
    const completed = await runCommand(process.execPath, ["-e", parentCode], {
      cwd: root,
      env: { ...process.env },
      timeoutMs: 2000,
    })
    const elapsed = Date.now() - started
    assert.equal(completed.timedOut, true)
    assert.equal(completed.exitCode, 0)
    assert.equal(killCalls, 0, "Child.kill was called after the direct child exit event")
    assert.equal(elapsed >= 2100, true, `runCommand resolved before descendant close after ${elapsed}ms`)
    assert.match(completed.stdout, new RegExp(marker))
  } finally {
    ChildProcess.prototype.kill = originalKill
    const remaining = 3000 - (Date.now() - started)
    if (remaining > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, remaining))
    rmSync(root, { recursive: true, force: true })
  }
})

test("process wrapper reaps its native child when ownership ledger append fails", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-wrapper-ledger-error-"))
  const pidDirectory = join(root, "pid")
  const invalidLedgerPath = join(pidDirectory, "lsp-as-directory")
  mkdirSync(invalidLedgerPath, { recursive: true })
  try {
    const completed = await runCommand(process.execPath, [
      PROCESS_WRAPPER_FIXTURE,
      invalidLedgerPath,
      process.execPath,
      "-e",
      "setInterval(() => {}, 1000)",
    ], {
      cwd: root,
      env: { ...process.env, OCMM_CODEMODE_STOP_PATH: join(pidDirectory, "stop") },
      timeoutMs: 1500,
    })
    assert.equal(completed.timedOut, false)
    assert.equal(completed.exitCode, 1)
    assert.match(completed.stderr, /failed to record process ownership/i)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("process wrapper keeps ledger failure nonzero when native exits successfully", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-wrapper-ledger-exit-zero-"))
  const invalidLedgerPath = join(root, "lsp-as-directory")
  mkdirSync(invalidLedgerPath)
  try {
    const completed = await runCommand(process.execPath, [
      PROCESS_WRAPPER_FIXTURE,
      invalidLedgerPath,
      process.execPath,
      "-e",
      "process.exit(0)",
    ], {
      cwd: root,
      env: { ...process.env, OCMM_CODEMODE_STOP_PATH: join(root, "stop") },
      timeoutMs: 1500,
    })
    assert.equal(completed.timedOut, false)
    assert.equal(completed.exitCode, 1)
    assert.match(completed.stderr, /failed to record process ownership/i)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("MCP startup missing ownership ledgers preserves cleanup evidence roots", async () => {
  const parentRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-mcp-ledger-boundary-"))
  const rootPath = join(parentRoot, "attempt-1")
  const providerConfig = join(parentRoot, "provider.json")
  writeFileSync(providerConfig, JSON.stringify(validProviderConfig()))
  try {
    let wrapperResult: CommandResult | null = null
    const nativeStartedPath = join(rootPath, "native-started")
    const nativeStoppedPath = join(rootPath, "native-stopped")
    const nativeCode = [
      'const fs = require("node:fs")',
      `fs.writeFileSync(${JSON.stringify(nativeStartedPath)}, "started")`,
      `process.on("SIGTERM", () => { fs.writeFileSync(${JSON.stringify(nativeStoppedPath)}, "stopped"); process.exit(0) })`,
      "setInterval(() => {}, 1000)",
    ].join("; ")
    const command = async (_command: string, args: string[], options: CommandOptions): Promise<CommandResult> => {
      if (args[0] === "--version") {
        return { exitCode: 0, stdout: "1.18.4\n", stderr: "", timedOut: false, pid: null }
      }
      if (args[0] === "debug" && args[1] === "paths") {
        return { exitCode: 0, stdout: barrierPathsFor(rootPath), stderr: "", timedOut: false, pid: null }
      }
      if (args[0] === "debug" && args[1] === "config") {
        return { exitCode: 0, stdout: isolatedConfigFor(rootPath), stderr: "", timedOut: false, pid: null }
      }
      assert.equal(args[0], "mcp")
      const lspCommand = JSON.parse(String(options.env.OCMM_LSP_COMMAND)) as string[]
      const lspLedgerPath = lspCommand[2]
      assert.equal(lspLedgerPath, join(rootPath, "pid", "lsp.jsonl"))
      mkdirSync(lspLedgerPath)
      wrapperResult = await runCommand(process.execPath, [
        PROCESS_WRAPPER_FIXTURE,
        lspLedgerPath,
        process.execPath,
        "-e",
        nativeCode,
      ], {
        cwd: rootPath,
        env: options.env,
        timeoutMs: 1500,
      })
      assert.equal(wrapperResult.timedOut, false)
      assert.equal(wrapperResult.exitCode, 1)
      assert.match(wrapperResult.stderr, /failed to record process ownership/i)
      assert.equal(existsSync(nativeStartedPath), true)
      assert.equal(existsSync(nativeStoppedPath), true)
      rmSync(lspLedgerPath, { recursive: true, force: true })
      return {
        exitCode: 0,
        stdout: "lsp not connected\ncodemode_probe not connected\n",
        stderr: wrapperResult.stderr,
        timedOut: false,
        pid: wrapperResult.pid,
      }
    }

    const attempt = await runAttempt({
      id: "attempt-1",
      rootPath,
      options: {
        providerConfig,
        model: "test/model",
        fixtureOut: join(parentRoot, "unused.json"),
        opencode: "opencode",
        timeoutMs: 1500,
      },
      runCommand: command,
      nativeLspPath: process.execPath,
    })
    assert.ok(wrapperResult)
    assert.equal(attempt.facts.registration.lspConnected, false)
    assert.equal(attempt.facts.registration.probeConnected, false)
    assert.deepEqual(attempt.pids.fixture, [])
    assert.deepEqual(attempt.pids.wrapper, [])
    assert.deepEqual(attempt.pids.native, [])
    assert.equal(attempt.cleanup.pidLedgerComplete, false)

    const cleanup = await cleanupRunTopology(parentRoot, [attempt])
    assert.equal(cleanup.attempts[0]?.cleanup.pidLedgerComplete, false)
    assert.equal(cleanup.aggregate.pidLedgerComplete, false)
    assert.equal(cleanup.aggregate.removalAttempted, false)
    assert.equal(cleanup.aggregate.parentRootRemoved, false)
    assert.deepEqual(cleanup.residualRoots, [rootPath, parentRoot])
    assert.equal(existsSync(rootPath), true)
    assert.equal(existsSync(parentRoot), true)
    assert.deepEqual(classifyProbe({ ...attempt.facts, cleanup: cleanup.aggregate }), {
      status: "FAIL",
      reasonCode: "cleanup-incomplete",
      exitCode: 2,
      goNoGo: "NO-GO",
    })
  } finally {
    rmSync(parentRoot, { recursive: true, force: true })
  }
})

test("CLI parser preserves missing provider/model as structured SKIP inputs", () => {
  const absent = parseCliOptions([])
  assert.equal(absent.providerConfig, null)
  assert.equal(absent.model, null)
  assert.match(absent.fixtureOut, /scripts[\\/]fixtures[\\/]opencode-codemode-execute-compatibility\.json$/)

  const invalidProvider = parseCliOptions(["--provider-config", "relative.json", "--model", "p/m"])
  assert.equal(invalidProvider.providerConfig, null)
  assert.equal(invalidProvider.model, "p/m")
})

test("CLI writes fixture and result line when provider config is unavailable", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-cli-provider-"))
  try {
    const fixture = join(root, "provider-skip.json")
    const child = spawn(process.execPath, [
      "--experimental-strip-types",
      resolve("scripts/codemode-execute-compatibility.ts"),
      "--fixture-out",
      fixture,
    ], { cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] })
    const completed = await waitForExit(child)
    assert.equal(completed.code, 3)
    const saved = JSON.parse(readFileSync(fixture, "utf8")) as Record<string, unknown>
    assert.equal(saved.status, "SKIP")
    assert.equal(saved.reasonCode, "provider-config-unavailable")
    assert.equal(saved.goNoGo, "NO-DECISION")
    assert.equal((saved.isolation as { xdgState: string }).xdgState, "unknown")
    assert.equal((saved.cleanup as { parentRootRemoved: boolean }).parentRootRemoved, true)
    assert.match(completed.stdout, /OCMM_CODEMODE_RESULT=SKIP:provider-config-unavailable:/)
    assert.equal(completed.stdout.split(/\r?\n/).filter((line) => line.startsWith("OCMM_CODEMODE_RESULT=")).length, 1)
    assert.doesNotMatch(completed.stdout + completed.stderr, /apiKey|Authorization|Bearer/i)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("CLI writes fixture and result line when model is unavailable", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-cli-model-"))
  try {
    const provider = join(root, "provider.json")
    const fixture = join(root, "model-skip.json")
    writeFileSync(provider, JSON.stringify(validProviderConfig()))
    const child = spawn(process.execPath, [
      "--experimental-strip-types",
      resolve("scripts/codemode-execute-compatibility.ts"),
      "--provider-config",
      provider,
      "--fixture-out",
      fixture,
    ], { cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] })
    const completed = await waitForExit(child)
    assert.equal(completed.code, 3)
    const saved = JSON.parse(readFileSync(fixture, "utf8")) as Record<string, unknown>
    assert.equal(saved.status, "SKIP")
    assert.equal(saved.reasonCode, "model-unavailable")
    assert.equal(saved.goNoGo, "NO-DECISION")
    assert.equal((saved.isolation as { xdgState: string }).xdgState, "unknown")
    assert.equal((saved.cleanup as { parentRootRemoved: boolean }).parentRootRemoved, true)
    assert.match(completed.stdout, /OCMM_CODEMODE_RESULT=SKIP:model-unavailable:/)
    assert.equal(completed.stdout.split(/\r?\n/).filter((line) => line.startsWith("OCMM_CODEMODE_RESULT=")).length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("classifyXdgPaths distinguishes unknown, isolated, and escaped", () => {
  const root = "C:\\Temp\\opencode\\probe"
  const good = ["data", "bin", "log", "repos", "cache", "config", "state"]
    .map((name) => `${name}  ${root}\\${name}`)
    .join("\n")
  assert.equal(classifyXdgPaths(good, root), "isolated")
  assert.equal(classifyXdgPaths("data  C:\\Temp\\opencode\\probe\\data", root), "unknown")
  assert.equal(classifyXdgPaths(`${good}\nstate  C:\\Users\\me\\.local\\state`, root), "escaped")
})

test("parseHookTrace pairs exact nested identities without preserving ids or values", () => {
  const lines = [
    { phase: "before", tool: "execute", hasSessionID: true, hasCallID: true, argumentKeys: ["code"], nestedStatuses: [], safeMarkers: {} },
    { phase: "before", tool: "lsp_status", hasSessionID: true, hasCallID: true, argumentKeys: [], nestedStatuses: [], safeMarkers: {} },
    { phase: "after", tool: "lsp_status", hasSessionID: true, hasCallID: true, argumentKeys: [], nestedStatuses: [], safeMarkers: {} },
    { phase: "after", tool: "execute", hasSessionID: true, hasCallID: true, argumentKeys: ["code"], nestedStatuses: [{ tool: "lsp.status", status: "completed" }], safeMarkers: { executeProbe: true, deniedHidden: true, lspOk: true, identityOk: true, hookPayloadOk: true } },
  ].map((value) => JSON.stringify(value)).join("\n")
  const parsed = parseHookTrace(lines)
  assert.equal(parsed.outerBeforeCount, 1)
  assert.equal(parsed.outerAfterCount, 1)
  assert.deepEqual(parsed.nestedBefore, ["lsp_status"])
  assert.deepEqual(parsed.nestedAfter, ["lsp_status"])
  assert.deepEqual(parsed.outerArgumentKeys, ["code"])
  assert.equal(JSON.stringify(parsed).includes("session"), false)
})

test("parseHookTrace accepts safe result markers only from authoritative outer phases", () => {
  const nestedForgery = parseHookTrace([
    {
      phase: "before", tool: "execute", hasSessionID: true, hasCallID: true,
      argumentKeys: ["code"], nestedStatuses: [],
      safeMarkers: { executeProbe: true, deniedHidden: true, lspOk: true, identityOk: true, hookPayloadOk: true },
    },
    {
      phase: "after", tool: "codemode_probe_identity", hasSessionID: true, hasCallID: true,
      argumentKeys: [], nestedStatuses: [],
      safeMarkers: { exactCode: true, executeProbe: true, deniedHidden: true, lspOk: true, identityOk: true, hookPayloadOk: true },
    },
    {
      phase: "after", tool: "execute", hasSessionID: true, hasCallID: true,
      argumentKeys: [], nestedStatuses: [], safeMarkers: {},
    },
  ].map((row) => JSON.stringify(row)).join("\n"))
  assert.deepEqual({
    exactCode: nestedForgery.exactCode,
    executeProbeMarker: nestedForgery.executeProbeMarker,
    deniedHidden: nestedForgery.deniedHidden,
    lspOk: nestedForgery.lspOk,
    identityOk: nestedForgery.identityOk,
    hookPayloadOk: nestedForgery.hookPayloadOk,
  }, {
    exactCode: false,
    executeProbeMarker: false,
    deniedHidden: false,
    lspOk: false,
    identityOk: false,
    hookPayloadOk: false,
  })
  assert.deepEqual(nestedForgery.nestedAfter, ["codemode_probe_identity"])
  const forged = passingFacts()
  forged.execute.exactCode = nestedForgery.exactCode
  forged.execute.executeProbeMarker = nestedForgery.executeProbeMarker
  forged.execute.deniedHidden = nestedForgery.deniedHidden
  forged.execute.lspOk = nestedForgery.lspOk
  forged.execute.identityOk = nestedForgery.identityOk
  forged.execute.hookPayloadOk = nestedForgery.hookPayloadOk
  assert.notEqual(classifyProbe(forged).status, "PASS")

  const authoritative = parseHookTrace([
    {
      phase: "before", tool: "execute", hasSessionID: true, hasCallID: true,
      argumentKeys: ["code"], nestedStatuses: [],
      safeMarkers: { exactCode: true, executeProbe: true, deniedHidden: true, lspOk: true, identityOk: true, hookPayloadOk: true },
    },
    {
      phase: "after", tool: "execute", hasSessionID: true, hasCallID: true,
      argumentKeys: [], nestedStatuses: [],
      safeMarkers: { exactCode: false, executeProbe: true, deniedHidden: true, lspOk: true, identityOk: true, hookPayloadOk: true },
    },
  ].map((row) => JSON.stringify(row)).join("\n"))
  assert.deepEqual({
    exactCode: authoritative.exactCode,
    executeProbeMarker: authoritative.executeProbeMarker,
    deniedHidden: authoritative.deniedHidden,
    lspOk: authoritative.lspOk,
    identityOk: authoritative.identityOk,
    hookPayloadOk: authoritative.hookPayloadOk,
  }, {
    exactCode: true,
    executeProbeMarker: true,
    deniedHidden: true,
    lspOk: true,
    identityOk: true,
    hookPayloadOk: true,
  })
})

test("parseHookTrace keeps null tool identities classifiable as deterministic defects", () => {
  const nullOuter = parseHookTrace(JSON.stringify({
    phase: "before",
    tool: null,
    hasSessionID: true,
    hasCallID: true,
    argumentKeys: ["code"],
    nestedStatuses: [],
    safeMarkers: {},
  }))
  assert.equal(nullOuter.outerBeforeCount, 0)
  assert.deepEqual(nullOuter.nestedBefore, ["unusable_tool_identity"])
  const outerFacts = passingFacts()
  outerFacts.execute.outerBeforeCount = nullOuter.outerBeforeCount
  outerFacts.hooks.nestedBefore = nullOuter.nestedBefore
  assert.equal(classifyProbe(outerFacts).reasonCode, "execute-hook-count-invalid")

  const nullNested = parseHookTrace([
    { phase: "before", tool: "execute", hasSessionID: true, hasCallID: true, argumentKeys: ["code"], nestedStatuses: [], safeMarkers: {} },
    { phase: "before", tool: null, hasSessionID: true, hasCallID: true, argumentKeys: [], nestedStatuses: [], safeMarkers: {} },
    { phase: "after", tool: "execute", hasSessionID: true, hasCallID: true, argumentKeys: [], nestedStatuses: [], safeMarkers: {} },
  ].map((row) => JSON.stringify(row)).join("\n"))
  const nestedFacts = passingFacts()
  nestedFacts.hooks.nestedBefore = nullNested.nestedBefore
  assert.equal(classifyProbe(nestedFacts).reasonCode, "nested-hook-count-invalid")
})

test("host signals ignore model prose and trust only error envelopes or host stderr", () => {
  const prose = JSON.stringify({
    type: "text",
    part: { type: "text", text: "execute unsupported; permission denied; code mode disabled" },
  })
  assert.deepEqual(parseHostSignals(prose, ""), {
    permissionBlocked: false,
    featureUnsupported: false,
    activationAmbiguous: false,
  })
  assert.deepEqual(parseHostSignals(JSON.stringify({
    type: "error",
    error: { data: { message: "tool execute is unsupported" } },
  }), ""), {
    permissionBlocked: false,
    featureUnsupported: true,
    activationAmbiguous: false,
  })
  assert.equal(parseHostSignals("", "ERROR permission denied by host").permissionBlocked, true)
  assert.equal(parseHostSignals("", "ERROR code mode disabled by host").activationAmbiguous, true)
  assert.equal(parseHostSignals(JSON.stringify({
    type: "error",
    error: { data: { message: "code mode disabled by host" } },
  }), "").activationAmbiguous, true)
})

test("nonzero trusted activation ambiguity remains classifiable and forbids retry", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-activation-"))
  const provider = join(root, "provider.json")
  const fixtureOut = join(root, "activation.json")
  writeFileSync(provider, JSON.stringify(validProviderConfig()))
  try {
    const attemptRoot = join(root, "source-attempt")
    const fakeAttemptCommand = async (_command: string, args: string[]): Promise<CommandResult> => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "1.18.4\n", stderr: "", timedOut: false, pid: null }
      if (args[0] === "debug" && args[1] === "paths") {
        return { exitCode: 0, stdout: barrierPathsFor(attemptRoot), stderr: "", timedOut: false, pid: null }
      }
      if (args[0] === "debug" && args[1] === "config") {
        return { exitCode: 0, stdout: isolatedConfigFor(attemptRoot), stderr: "", timedOut: false, pid: null }
      }
      if (args[0] === "mcp") {
        return { exitCode: 0, stdout: "● lsp connected\n● codemode_probe connected", stderr: "", timedOut: false, pid: null }
      }
      return {
        exitCode: 1,
        stdout: "",
        stderr: "ERROR code mode disabled by host",
        timedOut: false,
        pid: null,
      }
    }
    const observedAttempt = await runAttempt({
      id: "attempt-1",
      rootPath: attemptRoot,
      options: { providerConfig: provider, model: "test/model", fixtureOut, opencode: "opencode", timeoutMs: 1000 },
      runCommand: fakeAttemptCommand,
      nativeLspPath: process.execPath,
    })
    assert.equal(observedAttempt.facts.execute.activationAmbiguous, true)
    assert.equal(observedAttempt.facts.execute.outputClassifiable, true)

    let attemptCalls = 0
    const preflightCommand = async (command: string, args: string[]): Promise<CommandResult> => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "1.18.4\n", stderr: "", timedOut: false, pid: null }
      if (/where\.exe$/i.test(command)) return { exitCode: 0, stdout: `${process.execPath}\n`, stderr: "", timedOut: false, pid: null }
      if (command === "git" && args[0] === "rev-parse") return { exitCode: 0, stdout: "abcdef1\n", stderr: "", timedOut: false, pid: null }
      if (command === "git" && args[0] === "status") return { exitCode: 0, stdout: "", stderr: "", timedOut: false, pid: null }
      return { exitCode: 0, stdout: directLspResponse(), stderr: "", timedOut: false, pid: null }
    }
    const outcome = await runProbe({
      providerConfig: provider,
      model: "test/model",
      fixtureOut,
      opencode: "opencode",
      timeoutMs: 1000,
    }, {
      runCommand: preflightCommand,
      runAttempt: async ({ id, rootPath }) => {
        attemptCalls += 1
        mkdirSync(join(rootPath, "pid"), { recursive: true })
        return {
          ...observedAttempt,
          id,
          rootPath,
          pids: { host: [], wrapper: [], fixture: [], native: [] },
          cleanup: { ...observedAttempt.cleanup, pidLedgerComplete: true },
        }
      },
      writeStdout: () => undefined,
      writeStderr: () => undefined,
    })
    assert.equal(attemptCalls, 1)
    assert.deepEqual(outcome.result, {
      status: "DEFER",
      reasonCode: "codemode-activation-ambiguous",
      exitCode: 4,
      goNoGo: "NO-DECISION",
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("featureUnsupported matches only execute itself and trusted unsupported forbids retry", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-unsupported-"))
  const provider = join(root, "provider.json")
  const fixtureOut = join(root, "unsupported.json")
  writeFileSync(provider, JSON.stringify(validProviderConfig()))
  try {
    for (const message of [
      "ERROR unknown tool: execute",
      "ERROR tool execute is unsupported",
      "ERROR execute tool is not available",
    ]) assert.equal(parseHostSignals("", message).featureUnsupported, true, message)
    for (const message of [
      "ERROR execute failed because nested tool lsp_status is not available",
      "ERROR execute child lsp_status is unsupported",
      "ERROR nested tool unavailable during execute",
    ]) assert.equal(parseHostSignals("", message).featureUnsupported, false, message)

    const observeAttempt = async (attemptRoot: string, runStderr: string): Promise<AttemptRecord> => {
      const fakeAttemptCommand = async (_command: string, args: string[]): Promise<CommandResult> => {
        if (args[0] === "--version") return { exitCode: 0, stdout: "1.18.4\n", stderr: "", timedOut: false, pid: null }
        if (args[0] === "debug" && args[1] === "paths") {
          return { exitCode: 0, stdout: barrierPathsFor(attemptRoot), stderr: "", timedOut: false, pid: null }
        }
        if (args[0] === "debug" && args[1] === "config") {
          return { exitCode: 0, stdout: isolatedConfigFor(attemptRoot), stderr: "", timedOut: false, pid: null }
        }
        if (args[0] === "mcp") {
          return { exitCode: 0, stdout: "● lsp connected\n● codemode_probe connected", stderr: "", timedOut: false, pid: null }
        }
        return { exitCode: 1, stdout: "", stderr: runStderr, timedOut: false, pid: null }
      }
      return await runAttempt({
        id: "attempt-1",
        rootPath: attemptRoot,
        options: { providerConfig: provider, model: "test/model", fixtureOut, opencode: "opencode", timeoutMs: 1000 },
        runCommand: fakeAttemptCommand,
        nativeLspPath: process.execPath,
      })
    }

    const observedAttempt = await observeAttempt(join(root, "source-attempt"), "ERROR unknown tool: execute")
    assert.equal(observedAttempt.facts.execute.featureUnsupported, true)
    assert.equal(observedAttempt.facts.execute.outputClassifiable, true)

    const nestedFailure = await observeAttempt(
      join(root, "nested-attempt"),
      "ERROR execute failed because nested tool lsp_status is not available",
    )
    assert.equal(nestedFailure.facts.execute.featureUnsupported, false)
    assert.equal(nestedFailure.facts.execute.outputClassifiable, false)
    const nestedFacts = passingFacts()
    nestedFacts.execute = { ...nestedFacts.execute, ...nestedFailure.facts.execute }
    assert.deepEqual(classifyProbe(nestedFacts), {
      status: "DEFER",
      reasonCode: "unclassifiable-output",
      exitCode: 4,
      goNoGo: "NO-DECISION",
    })

    let attemptCalls = 0
    const preflightCommand = async (command: string, args: string[]): Promise<CommandResult> => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "1.18.4\n", stderr: "", timedOut: false, pid: null }
      if (/where\.exe$/i.test(command)) return { exitCode: 0, stdout: `${process.execPath}\n`, stderr: "", timedOut: false, pid: null }
      if (command === "git" && args[0] === "rev-parse") return { exitCode: 0, stdout: "abcdef1\n", stderr: "", timedOut: false, pid: null }
      if (command === "git" && args[0] === "status") return { exitCode: 0, stdout: "", stderr: "", timedOut: false, pid: null }
      return { exitCode: 0, stdout: directLspResponse(), stderr: "", timedOut: false, pid: null }
    }
    const outcome = await runProbe({
      providerConfig: provider,
      model: "test/model",
      fixtureOut,
      opencode: "opencode",
      timeoutMs: 1000,
    }, {
      runCommand: preflightCommand,
      runAttempt: async ({ id, rootPath }) => {
        attemptCalls += 1
        mkdirSync(join(rootPath, "pid"), { recursive: true })
        return {
          ...observedAttempt,
          id,
          rootPath,
          pids: { host: [], wrapper: [], fixture: [], native: [] },
          cleanup: { ...observedAttempt.cleanup, pidLedgerComplete: true },
        }
      },
      writeStdout: () => undefined,
      writeStderr: () => undefined,
    })
    assert.equal(attemptCalls, 1)
    assert.deepEqual(outcome.result, {
      status: "SKIP",
      reasonCode: "codemode-unsupported-by-host",
      exitCode: 3,
      goNoGo: "NO-DECISION",
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("timeout kills a long-lived wrapper child and cleanup removes the real directory", async () => {
  const parentRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-timeout-"))
  const root = join(parentRoot, "attempt-1")
  const pidDir = join(root, "pid")
  mkdirSync(pidDir, { recursive: true })
  const pidFile = join(pidDir, "lsp.jsonl")
  const wrapper = resolve("scripts/fixtures/codemode-execute-process-wrapper.mjs")
  let observedPids: number[] = []
  try {
    const completed = await runCommand(
      process.execPath,
      [wrapper, pidFile, process.execPath, "-e", "setInterval(() => {}, 1000)"],
      {
        cwd: root,
        env: { ...process.env, OCMM_CODEMODE_STOP_PATH: join(pidDir, "stop") },
        timeoutMs: 1000,
      },
    )
    assert.equal(completed.timedOut, true)
    assert.equal(existsSync(pidFile), true)
    const recorded = JSON.parse(readFileSync(pidFile, "utf8")) as { wrapperPid: number; nativePid: number }
    assert.ok(Number.isInteger(recorded.wrapperPid))
    assert.ok(Number.isInteger(recorded.nativePid))
    observedPids = [recorded.wrapperPid, recorded.nativePid, completed.pid].filter((value): value is number =>
      typeof value === "number" && value > 0)
    await waitForProcessExit(recorded.wrapperPid)
    await waitForProcessExit(recorded.nativePid)

    const baseline = nonPassingBaseline()
    const attempt: AttemptRecord = {
      id: "attempt-1",
      rootPath: root,
      pids: { host: [completed.pid ?? -1], wrapper: [recorded.wrapperPid], fixture: [], native: [recorded.nativePid] },
      facts: baseline,
      cleanup: {
        pidLedgerComplete: true,
        trackedPids: observedPids.length,
        remainingPids: observedPids.length,
        terminationAttempted: false,
        removalAttempted: false,
        removalFailed: false,
        rootRemoved: false,
      },
    }
    const cleanup = await cleanupRunTopology(parentRoot, [attempt])
    assert.equal(cleanup.aggregate.trackedPids > 0, true)
    assert.equal(cleanup.aggregate.remainingPids, 0)
    assert.equal(cleanup.aggregate.removalAttempted, true)
    assert.equal(cleanup.aggregate.removalFailed, false, JSON.stringify(cleanup))
    assert.equal(cleanup.aggregate.attemptRootsRemoved, 1)
    assert.equal(cleanup.aggregate.parentRootRemoved, true)
  } finally {
    rmSync(parentRoot, { recursive: true, force: true })
  }
  for (const pid of observedPids) {
    let alive = true
    try { process.kill(pid, 0) } catch { alive = false }
    assert.equal(alive, false, `PID still alive: ${pid}`)
  }
  assert.equal(existsSync(root), false)
  assert.equal(existsSync(parentRoot), false)
})

test("retry requires clean isolated registration and only clean model refusal gets attempt 2", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-retry-"))
  const options: LiveProbeOptions = {
    providerConfig: "C:\\outside\\provider.json",
    model: "test/model",
    fixtureOut: join(root, "fixture.json"),
    opencode: "opencode",
    timeoutMs: 1000,
  }
  const runCase = async (mutate?: (facts: NormalizedFacts) => void): Promise<number> => {
    let calls = 0
    const fake: RunAttemptFn = async ({ id, rootPath }) => {
      calls += 1
      const facts = cleanModelRefusalFacts()
      mutate?.(facts)
      return {
        id,
        rootPath,
        pids: { host: [], wrapper: [], fixture: [], native: [] },
        facts,
        cleanup: {
          pidLedgerComplete: true,
          trackedPids: 0,
          remainingPids: 0,
          terminationAttempted: false,
          removalAttempted: false,
          removalFailed: false,
          rootRemoved: false,
        },
      }
    }
    await runAttemptSequence(root, options, fake)
    return calls
  }
  try {
    assert.equal(await runCase(), 2)
    assert.equal(await runCase((facts) => { facts.safety.xdgState = "unknown" }), 1)
    assert.equal(await runCase((facts) => { facts.safety.xdgState = "escaped" }), 1)
    for (const field of ["ocmmLoaded", "isolatedProjectConfig", "lspConnected", "probeConnected"] as const) {
      assert.equal(await runCase((facts) => { facts.registration[field] = false }), 1, field)
    }
    assert.equal(await runCase((facts) => { facts.execute.outputClassifiable = false }), 1)
    assert.equal(await runCase((facts) => { facts.execute.timedOut = true }), 1)
    assert.equal(await runCase((facts) => { facts.execute.permissionBlocked = true }), 1)
    assert.equal(await runCase((facts) => { facts.execute.featureUnsupported = true }), 1)
    assert.equal(await runCase((facts) => { facts.execute.activationAmbiguous = true }), 1)
    assert.equal(await runCase((facts) => { facts.execute.outerBeforeCount = 1 }), 1)
    assert.equal(await runCase((facts) => { facts.execute.outerAfterCount = 1 }), 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

async function createTwoAttemptTopology(parentRoot: string): Promise<{
  attempts: AttemptRecord[]
  pids: number[]
  children: Array<ReturnType<typeof spawn>>
}> {
  const pids: number[] = []
  const children: Array<ReturnType<typeof spawn>> = []
  const options: LiveProbeOptions = {
    providerConfig: "C:\\outside\\provider.json",
    model: "test/model",
    fixtureOut: join(parentRoot, "fixture.json"),
    opencode: "opencode",
    timeoutMs: 1000,
  }
  const fakeAttempt: RunAttemptFn = async ({ id, rootPath }) => {
    mkdirSync(join(rootPath, "pid"), { recursive: true })
    const stopPath = join(rootPath, "pid", "stop")
    const start = (): number => {
      const child = spawn(process.execPath, [
        "-e",
        "const fs=require('node:fs');const p=process.argv[1];setInterval(()=>{if(fs.existsSync(p))process.exit(0)},20)",
        stopPath,
      ], { stdio: "ignore", windowsHide: true })
      assert.ok(child.pid)
      children.push(child)
      pids.push(child.pid)
      return child.pid
    }
    const ledger = { host: [start()], wrapper: [start()], fixture: [start()], native: [start()] }
    writeFileSync(join(rootPath, "pid", "fixture.jsonl"), `${JSON.stringify({ fixturePid: ledger.fixture[0] })}\n`)
    writeFileSync(join(rootPath, "pid", "lsp.jsonl"), `${JSON.stringify({
      wrapperPid: ledger.wrapper[0],
      nativePid: ledger.native[0],
    })}\n`)
    const baseline = cleanModelRefusalFacts()
    return {
      id,
      rootPath,
      pids: ledger,
      facts: baseline,
      cleanup: {
        pidLedgerComplete: true,
        trackedPids: 4,
        remainingPids: 4,
        terminationAttempted: false,
        removalAttempted: false,
        removalFailed: false,
        rootRemoved: false,
      },
    }
  }
  const attempts = await runAttemptSequence(parentRoot, options, fakeAttempt)
  return { attempts, pids, children }
}

function testPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

test("two-attempt cleanup kills every role before deleting both attempts and parent", async () => {
  const parentRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-two-attempts-"))
  let pids: number[] = []
  let children: Array<ReturnType<typeof spawn>> = []
  try {
    const topology = await createTwoAttemptTopology(parentRoot)
    pids = topology.pids
    children = topology.children
    assert.deepEqual(topology.attempts.map((attempt) => attempt.id), ["attempt-1", "attempt-2"])
    assert.deepEqual(topology.attempts.map((attempt) => attempt.rootPath), [
      join(parentRoot, "attempt-1"),
      join(parentRoot, "attempt-2"),
    ])
    for (const attempt of topology.attempts) {
      for (const role of ["host", "wrapper", "fixture", "native"] as const) {
        assert.equal(attempt.pids[role].length, 1, `${attempt.id} missing ${role} PID`)
      }
    }
    const removalOrder: string[] = []
    const cleanup = await cleanupRunTopology(parentRoot, topology.attempts, [], (path) => {
      for (const pid of pids) assert.equal(testPidAlive(pid), false, `deletion began before PID ${pid} died`)
      removalOrder.push(path)
      rmSync(path, { recursive: true, force: true })
    })
    assert.deepEqual(removalOrder, [
      join(parentRoot, "attempt-2"),
      join(parentRoot, "attempt-1"),
      parentRoot,
    ])
    assert.deepEqual(cleanup.aggregate, {
      attemptCount: 2,
      pidLedgerComplete: true,
      trackedPids: 8,
      remainingPids: 0,
      attemptRootsRemoved: 2,
      removalAttempted: true,
      removalFailed: false,
      parentRootRemoved: true,
    })
    for (const attempt of cleanup.attempts) {
      assert.equal(attempt.cleanup.terminationAttempted, true)
      assert.equal(attempt.cleanup.remainingPids, 0)
      assert.equal(attempt.cleanup.rootRemoved, true)
      assert.equal(existsSync(attempt.rootPath), false)
    }
    for (const pid of pids) assert.equal(testPidAlive(pid), false)
    assert.equal(existsSync(parentRoot), false)
  } finally {
    for (const child of children) { if (child.exitCode === null) child.kill("SIGKILL") }
    rmSync(parentRoot, { recursive: true, force: true })
  }
})

test("one attempt-root deletion error makes the two-attempt aggregate cleanup FAIL", async () => {
  const parentRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-two-attempt-failure-"))
  let pids: number[] = []
  let children: Array<ReturnType<typeof spawn>> = []
  try {
    const topology = await createTwoAttemptTopology(parentRoot)
    pids = topology.pids
    children = topology.children
    let injected = false
    const cleanup = await cleanupRunTopology(parentRoot, topology.attempts, [], (path) => {
      for (const pid of pids) assert.equal(testPidAlive(pid), false, `deletion began before PID ${pid} died`)
      if (!injected && path === join(parentRoot, "attempt-2")) {
        injected = true
        throw new Error("forced attempt-2 removal failure")
      }
      rmSync(path, { recursive: true, force: true })
    })
    assert.equal(injected, true)
    assert.equal(cleanup.attempts[1]!.cleanup.removalFailed, true)
    assert.equal(cleanup.aggregate.attemptCount, 2)
    assert.equal(cleanup.aggregate.attemptRootsRemoved, 2)
    assert.equal(cleanup.aggregate.parentRootRemoved, true)
    assert.equal(cleanup.aggregate.removalFailed, true)
    const facts = passingFacts()
    facts.cleanup = cleanup.aggregate
    assert.equal(classifyProbe(facts).status, "FAIL")
    assert.equal(classifyProbe(facts).reasonCode, "cleanup-incomplete")
    for (const pid of pids) assert.equal(testPidAlive(pid), false)
    assert.equal(existsSync(join(parentRoot, "attempt-1")), false)
    assert.equal(existsSync(join(parentRoot, "attempt-2")), false)
    assert.equal(existsSync(parentRoot), false)
  } finally {
    for (const child of children) { if (child.exitCode === null) child.kill("SIGKILL") }
    rmSync(parentRoot, { recursive: true, force: true })
  }
})

test("malformed PID ledger retains valid rows, marks cleanup incomplete, and preserves roots", async () => {
  const parentRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-malformed-ledger-"))
  const root = join(parentRoot, "attempt-1")
  const pidRoot = join(root, "pid")
  const stopPath = join(pidRoot, "stop")
  mkdirSync(pidRoot, { recursive: true })
  const children: Array<ReturnType<typeof spawn>> = []
  const start = (): number => {
    const child = spawn(process.execPath, [
      "-e",
      "const fs=require('node:fs');const p=process.argv[1];setInterval(()=>{if(fs.existsSync(p))process.exit(0)},20)",
      stopPath,
    ], { stdio: "ignore", windowsHide: true })
    assert.ok(child.pid)
    children.push(child)
    return child.pid
  }
  const fixturePids = [start(), start()]
  const wrapperPids = [start(), start()]
  const nativePids = [start(), start()]
  writeFileSync(join(pidRoot, "fixture.jsonl"), [
    JSON.stringify({ fixturePid: fixturePids[0] }),
    "not-json",
    JSON.stringify({ fixturePid: fixturePids[1] }),
  ].join("\n"))
  writeFileSync(join(pidRoot, "lsp.jsonl"), [
    JSON.stringify({ wrapperPid: wrapperPids[0], nativePid: nativePids[0] }),
    "{malformed",
    JSON.stringify({ wrapperPid: wrapperPids[1], nativePid: nativePids[1] }),
  ].join("\n"))
  try {
    assert.deepEqual(readAttemptPidLedger(root), {
      host: [],
      fixture: fixturePids,
      wrapper: wrapperPids,
      native: nativePids,
    })
    const facts = cleanModelRefusalFacts()
    const attempt: AttemptRecord = {
      id: "attempt-1",
      rootPath: root,
      pids: { host: [], wrapper: [], fixture: [], native: [] },
      facts,
      cleanup: {
        pidLedgerComplete: true,
        trackedPids: 0,
        remainingPids: 0,
        terminationAttempted: false,
        removalAttempted: false,
        removalFailed: false,
        rootRemoved: false,
      },
    }
    const cleanup = await cleanupRunTopology(parentRoot, [attempt], [], undefined, 1000)
    assert.equal(cleanup.aggregate.pidLedgerComplete, false)
    assert.equal(cleanup.aggregate.trackedPids, 6)
    assert.equal(cleanup.aggregate.remainingPids, 0)
    assert.equal(cleanup.aggregate.removalAttempted, false)
    assert.equal(cleanup.aggregate.parentRootRemoved, false)
    assert.equal(existsSync(root), true)
    assert.equal(existsSync(parentRoot), true)
    assert.deepEqual(cleanup.residualRoots, [root, parentRoot])
  } finally {
    for (const child of children) { if (child.exitCode === null) child.kill("SIGKILL") }
    rmSync(parentRoot, { recursive: true, force: true })
  }
})

test("unreadable PID ledger is incomplete evidence and preserves every cleanup root", async () => {
  const parentRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-unreadable-ledger-"))
  const root = join(parentRoot, "attempt-1")
  const pidRoot = join(root, "pid")
  mkdirSync(join(pidRoot, "fixture.jsonl"), { recursive: true })
  try {
    const attempt: AttemptRecord = {
      id: "attempt-1",
      rootPath: root,
      pids: { host: [], wrapper: [], fixture: [], native: [] },
      facts: cleanModelRefusalFacts(),
      cleanup: {
        pidLedgerComplete: true,
        trackedPids: 0,
        remainingPids: 0,
        terminationAttempted: false,
        removalAttempted: false,
        removalFailed: false,
        rootRemoved: false,
      },
    }
    const cleanup = await cleanupRunTopology(parentRoot, [attempt], [], undefined, 50)
    assert.equal(cleanup.aggregate.pidLedgerComplete, false)
    assert.equal(cleanup.aggregate.removalAttempted, false)
    assert.equal(cleanup.aggregate.parentRootRemoved, false)
    assert.deepEqual(cleanup.residualRoots, [root, parentRoot])
    assert.equal(existsSync(root), true)
  } finally {
    rmSync(parentRoot, { recursive: true, force: true })
  }
})

test("PID probe permission errors fail closed and prevent cleanup deletion", async () => {
  const parentRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-pid-permission-"))
  const syntheticPid = 2_147_483_000
  const originalKill = process.kill
  Object.defineProperty(process, "kill", {
    configurable: true,
    writable: true,
    value: (pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === syntheticPid && signal === 0) {
        const error = new Error("permission denied") as NodeJS.ErrnoException
        error.code = "EPERM"
        throw error
      }
      return originalKill(pid, signal)
    },
  })
  try {
    const cleanup = await cleanupRunTopology(parentRoot, [], [syntheticPid], undefined, 25)
    assert.equal(cleanup.aggregate.remainingPids, 1)
    assert.equal(cleanup.aggregate.removalAttempted, false)
    assert.equal(cleanup.aggregate.parentRootRemoved, false)
    assert.deepEqual(cleanup.residualRoots, [parentRoot])
    assert.equal(existsSync(parentRoot), true)
  } finally {
    Object.defineProperty(process, "kill", { configurable: true, writable: true, value: originalKill })
    rmSync(parentRoot, { recursive: true, force: true })
  }
})

test("cleanup observes but never terminates a live historical host PID", async () => {
  const parentRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-pid-reuse-"))
  const root = join(parentRoot, "attempt-1")
  mkdirSync(join(root, "pid"), { recursive: true })
  const sentinel = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
    windowsHide: true,
  })
  assert.ok(sentinel.pid)
  const sentinelExit = waitForExit(sentinel)
  try {
    const facts = cleanModelRefusalFacts()
    const attempt: AttemptRecord = {
      id: "attempt-1",
      rootPath: root,
      pids: { host: [sentinel.pid], wrapper: [], fixture: [], native: [] },
      facts,
      cleanup: {
        pidLedgerComplete: true,
        trackedPids: 1,
        remainingPids: 1,
        terminationAttempted: false,
        removalAttempted: false,
        removalFailed: false,
        rootRemoved: false,
      },
    }
    const cleanup = await cleanupRunTopology(parentRoot, [attempt], [], undefined, 150)
    assert.equal(testPidAlive(sentinel.pid), true)
    assert.equal(cleanup.aggregate.remainingPids, 1)
    assert.equal(cleanup.aggregate.removalAttempted, false)
    assert.equal(cleanup.aggregate.parentRootRemoved, false)
    assert.equal(existsSync(root), true)
  } finally {
    if (sentinel.exitCode === null) sentinel.kill("SIGKILL")
    await sentinelExit.catch(() => undefined)
    rmSync(parentRoot, { recursive: true, force: true })
  }
})

test("cleanup removal failure writes FAIL fixture and exits 2 instead of generic 3", async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-cleanup-failure-"))
  const fixture = join(outputRoot, "cleanup-failure.json")
  const stdout: string[] = []
  const stderr: string[] = []
  let cleanupRoot: string | null = null
  try {
    const exitCode = await runCli(["--fixture-out", fixture], {
      removeRoot: (path) => {
        cleanupRoot = path
        throw new Error("forced deterministic removal failure")
      },
      writeStdout: (text) => stdout.push(text),
      writeStderr: (text) => stderr.push(text),
    })
    assert.equal(exitCode, 2)
    const saved = JSON.parse(readFileSync(fixture, "utf8")) as {
      status: string
      reasonCode: string
      isolation: { xdgState: string }
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
    assert.equal(saved.status, "FAIL")
    assert.equal(saved.reasonCode, "cleanup-incomplete")
    assert.equal(saved.isolation.xdgState, "unknown")
    assert.deepEqual(saved.cleanup, {
      attemptCount: 0,
      pidLedgerComplete: true,
      trackedPids: 0,
      remainingPids: 0,
      attemptRootsRemoved: 0,
      removalAttempted: true,
      removalFailed: true,
      parentRootRemoved: false,
    })
    assert.equal(stdout.filter((line) => line.startsWith("OCMM_CODEMODE_RESULT=FAIL:cleanup-incomplete:")).length, 1)
    assert.equal(stderr.filter((line) => line.startsWith("OCMM_CODEMODE_CLEANUP_REQUIRED=")).length, 1)
    assert.ok(cleanupRoot)
    const reportedRoot = stderr[0]!.trim().slice("OCMM_CODEMODE_CLEANUP_REQUIRED=".length)
    assert.equal(reportedRoot, cleanupRoot)
    assert.equal(existsSync(cleanupRoot), true)
    assert.equal(JSON.stringify(saved).includes(cleanupRoot), false)
    assert.doesNotMatch(JSON.stringify(saved), /forced deterministic removal failure/)
  } finally {
    if (cleanupRoot) rmSync(cleanupRoot, { recursive: true, force: true })
    rmSync(outputRoot, { recursive: true, force: true })
  }
})

test("internal preflight failure after run-root creation writes structured DEFER evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-internal-error-"))
  const provider = join(root, "provider.json")
  const fixture = join(root, "internal-error.json")
  const stdout: string[] = []
  const stderr: string[] = []
  writeFileSync(provider, JSON.stringify(validProviderConfig()))
  try {
    const outcome = await runProbe({
      providerConfig: provider,
      model: "test/model",
      fixtureOut: fixture,
      opencode: "opencode",
      timeoutMs: 1000,
    }, {
      runCommand: async () => { throw new Error("sk-private internal C:\\private\\path") },
      writeStdout: (text) => stdout.push(text),
      writeStderr: (text) => stderr.push(text),
    })
    assert.equal(outcome.result.status, "DEFER")
    assert.equal(outcome.result.reasonCode, "unclassifiable-output")
    assert.equal(outcome.result.exitCode, 4)
    assert.equal(stdout.filter((line) => line.startsWith("OCMM_CODEMODE_RESULT=DEFER:unclassifiable-output:")).length, 1)
    assert.deepEqual(stderr, [])
    const savedText = readFileSync(fixture, "utf8")
    const saved = JSON.parse(savedText) as { status: string; reasonCode: string; cleanup: { parentRootRemoved: boolean } }
    assert.equal(saved.status, "DEFER")
    assert.equal(saved.reasonCode, "unclassifiable-output")
    assert.equal(saved.cleanup.parentRootRemoved, true)
    assert.doesNotMatch(savedText, /sk-private|private|internal|[A-Za-z]:\\/i)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("fixture write failure uses structured fallback and preserves cleanup FAIL", async () => {
  const approvedParent = join(String(process.env.LOCALAPPDATA), "Temp", "opencode")
  const fallbackFixture = join(approvedParent, `ocmm-codemode-execute-compatibility-fallback-${process.pid}.json`)
  const primaryFixture = resolve("scripts/fixtures/opencode-codemode-execute-compatibility.json")
  const directoryPrimary = mkdtempSync(join(tmpdir(), "ocmm-codemode-fixture-directory-"))
  const cleanupRoots: string[] = []
  rmSync(fallbackFixture, { force: true })

  const runCase = async (cleanupFails: boolean): Promise<void> => {
    const stdout: string[] = []
    const stderr: string[] = []
    let writeCount = 0
    const exitCode = await runCli(["--fixture-out", primaryFixture], {
      removeRoot: cleanupFails
        ? (path) => {
            cleanupRoots.push(path)
            throw new Error("forced cleanup failure")
          }
        : undefined,
      writeFixture: (path, contents) => {
        writeCount += 1
        if (writeCount === 1) throw new Error("sk-private finalizer C:\\private\\requested.json")
        mkdirSync(resolve(path, ".."), { recursive: true })
        writeFileSync(path, contents)
      },
      writeStdout: (text) => stdout.push(text),
      writeStderr: (text) => stderr.push(text),
    })
    assert.equal(writeCount, 2)
    assert.equal(existsSync(fallbackFixture), true)
    const savedText = readFileSync(fallbackFixture, "utf8")
    const saved = JSON.parse(savedText) as { status: string; reasonCode: string; goNoGo: string; cleanup: { parentRootRemoved: boolean } }
    if (cleanupFails) {
      assert.equal(exitCode, 2)
      assert.equal(saved.status, "FAIL")
      assert.equal(saved.reasonCode, "cleanup-incomplete")
      assert.equal(saved.goNoGo, "NO-GO")
      assert.equal(saved.cleanup.parentRootRemoved, false)
      assert.equal(stderr.filter((line) => line.startsWith("OCMM_CODEMODE_CLEANUP_REQUIRED=")).length, 1)
    } else {
      assert.equal(exitCode, 4)
      assert.equal(saved.status, "DEFER")
      assert.equal(saved.reasonCode, "fixture-write-failed")
      assert.equal(saved.goNoGo, "NO-DECISION")
      assert.equal(saved.cleanup.parentRootRemoved, true)
      assert.deepEqual(stderr, [])
    }
    assert.equal(stdout.length, 1)
    assert.equal(stdout[0], `OCMM_CODEMODE_RESULT=${saved.status}:${saved.reasonCode}:${fallbackFixture}\n`)
    assert.doesNotMatch(savedText + stdout.join("") + stderr.join(""), /sk-private|private\\requested|forced cleanup failure/i)
  }

  try {
    await runCase(false)
    await runCase(true)
    rmSync(fallbackFixture, { force: true })
    const stdout: string[] = []
    const stderr: string[] = []
    let writeCount = 0
    const directoryExit = await runCli(["--fixture-out", directoryPrimary], {
      writeFixture: (path, contents) => {
        writeCount += 1
        if (path === directoryPrimary) {
          writeFileSync(path, contents)
          return
        }
        if (path === primaryFixture) throw new Error("default fallback unavailable")
        writeFileSync(path, contents)
      },
      writeStdout: (text) => stdout.push(text),
      writeStderr: (text) => stderr.push(text),
    })
    assert.equal(writeCount, 3)
    assert.equal(directoryExit, 4)
    assert.deepEqual(stderr, [])
    assert.deepEqual(stdout, [`OCMM_CODEMODE_RESULT=DEFER:fixture-write-failed:${fallbackFixture}\n`])
    const directorySaved = JSON.parse(readFileSync(fallbackFixture, "utf8")) as { status: string; reasonCode: string }
    assert.deepEqual(directorySaved, { ...directorySaved, status: "DEFER", reasonCode: "fixture-write-failed" })
  } finally {
    rmSync(fallbackFixture, { force: true })
    rmSync(directoryPrimary, { recursive: true, force: true })
    for (const root of cleanupRoots) rmSync(root, { recursive: true, force: true })
  }
})

test("fixture write exhaustion preserves DEFER and cleanup FAIL exit codes", async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "ocmm-codemode-fixture-exhaustion-"))
  const primaryFixture = join(outputRoot, "requested.json")
  const cleanupRoots: string[] = []

  const runCase = async (cleanupFails: boolean): Promise<void> => {
    const stdout: string[] = []
    const stderr: string[] = []
    let writeCount = 0
    const exitCode = await runCli(["--fixture-out", primaryFixture], {
      removeRoot: cleanupFails
        ? (path) => {
            cleanupRoots.push(path)
            throw new Error("forced cleanup failure")
          }
        : undefined,
      writeFixture: () => {
        writeCount += 1
        throw new Error("Bearer sk-private C:\\private\\requested.json")
      },
      writeStdout: (text) => stdout.push(text),
      writeStderr: (text) => stderr.push(text),
    })

    assert.equal(writeCount, 3)
    assert.deepEqual(stdout, [])
    assert.doesNotMatch(stdout.join("") + stderr.join(""), /Bearer|sk-private|private\\requested|forced cleanup failure/i)
    if (cleanupFails) {
      assert.equal(exitCode, 2)
      assert.equal(stderr.filter((line) => line.startsWith("OCMM_CODEMODE_CLEANUP_REQUIRED=")).length, 1)
      assert.equal(stderr.at(-1), "OCMM_CODEMODE_FIXTURE_UNAVAILABLE=FAIL:cleanup-incomplete\n")
    } else {
      assert.equal(exitCode, 4)
      assert.deepEqual(stderr, ["OCMM_CODEMODE_FIXTURE_UNAVAILABLE=DEFER:fixture-write-failed\n"])
    }
  }

  try {
    await runCase(false)
    await runCase(true)
  } finally {
    for (const root of cleanupRoots) rmSync(root, { recursive: true, force: true })
    rmSync(outputRoot, { recursive: true, force: true })
  }
})
