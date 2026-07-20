# Host Subagent Depth Diagnostics Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Report the observable effective Task nesting limit and host/ocmm conflicts without mutating OpenCode config, changing either default, or breaking hosts that do not expose `subagent_depth`.

**Architecture:** Add a pure `subagent-depth-diagnostics` module that validates only the host's direct `subagent_depth` field, classifies the effective limit, formats fixed secret-free messages, and deduplicates each numeric state per config-handler instance. Invoke it from the existing `config` hook through the current `OCMM_DEBUG`-gated logger; leave the ocmm schema and task-only permission guard implementation unchanged.

**Tech Stack:** TypeScript 6, Node 22+ built-in test runner, existing ocmm logger/config hooks, pnpm, OpenCode `debug config` for isolated live QA.

**Global Constraints:**
- Do not set, delete, normalize, or otherwise mutate OpenCode `subagent_depth`.
- Do not change OpenCode's implicit default of `1` or ocmm's `subagent.maxDepth` default of `3`.
- Do not modify `src/config/schema.ts` or `schema.json`, and do not run `pnpm run gen-schema`.
- Treat an absent or invalid host field as unobservable; do not infer a host version or emit a runtime diagnostic.
- When both guards are active, report `effective = Math.min(hostDepth, config.subagent.maxDepth)`.
- Keep diagnostics read-only, deduplicated per handler instance and diagnostic key, `OCMM_DEBUG`-gated, and free of config objects, paths, providers, models, environment variables, and credentials.
- Keep `guardSubagentDepth()` scoped exactly to `task`; never treat a tool named `execute` as `task`.
- Do not change `src/permissions/index.ts`, host configuration files, prompt files, prompt synchronization documents, or generated Codex bundles.
- Use the OpenCode capability boundary introduced by commit `285d315b4e5355e0a94608acc0678a11b720079e`; do not add version parsing or a host SDK dependency.
- Produce one atomic implementation commit only after all targeted, full-suite, build, schema-no-diff, and primary full-host checks pass, or after the documented pre-hook host-loader fallback establishes only the permitted partial-runtime evidence.

---

## File Map

### Create

- `src/hooks/subagent-depth-diagnostics.ts` — pure host-field observation, compatibility classification, exact message formatting, and reporter deduplication.
- `src/hooks/subagent-depth-diagnostics.test.ts` — table-driven compatibility, malformed/unobservable input, read-only/privacy, and deduplication tests.

### Modify

- `src/hooks/config.ts:24,437-455,585-604,934-936` — select an injectable logger, create one reporter per handler, invoke it after host/config resolution, and route existing config registration messages through the selected logger.
- `src/hooks/config.test.ts` — prove config-hook wiring, one-time emission, unobservable-field silence, no host-field mutation, and compatibility with `registerBuiltinAgents: false`.
- `src/permissions/index.test.ts:568-640` — add a regression proving a tool named `execute` is outside the task-depth guard.
- `README.md:319-321,427-455` — document host/local effective limits, observability limits, exact operational behavior, and update the hook summary.
- `AGENTS.md:139` — qualify the local default with the host limit and task-only scope.

### Intentionally unchanged

- `src/config/schema.ts`
- `schema.json`
- `src/permissions/index.ts`
- `.opencode/**`, `opencode.json`, and `opencode.jsonc` inside the repository
- `prompts/**`, `docs/v1-maintenance.md`, `docs/prompt-sync.md`, `.codex/agents/**`, `.agents/plugins/marketplace.json`, and `plugins/deepwork/**`

---

### Task 1: Pure compatibility diagnostic and deduplicating reporter

**Files:**
- Create: `src/hooks/subagent-depth-diagnostics.ts`
- Create: `src/hooks/subagent-depth-diagnostics.test.ts`

**Interfaces:**
- Consumes: `OcmmConfig`, a host config value of unknown shape, and the existing `log.info`/`log.warn` contract.
- Produces: `resolveSubagentDepthDiagnostic(hostConfig: unknown, config: OcmmConfig): SubagentDepthDiagnostic | null` and `createSubagentDepthDiagnosticReporter(logger?: SubagentDepthDiagnosticLogger): (hostConfig: unknown, config: OcmmConfig) => void`.

- [ ] **Step 1: Write the failing pure-function, privacy, and deduplication tests**

Create `src/hooks/subagent-depth-diagnostics.test.ts` with this content:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"

import { defaultConfig, type OcmmConfig } from "../config/schema.ts"
import {
  createSubagentDepthDiagnosticReporter,
  resolveSubagentDepthDiagnostic,
} from "./subagent-depth-diagnostics.ts"

function configWithDepth(maxDepth: number, disabledHooks: string[] = []): OcmmConfig {
  return {
    ...defaultConfig(),
    disabledHooks,
    subagent: { maxDepth },
  }
}

test("resolves the observable host and ocmm subagent depth compatibility matrix", () => {
  const cases = [
    {
      name: "host zero is stricter",
      hostDepth: 0,
      config: configWithDepth(3),
      expected: {
        key: "host:0|ocmm:3",
        level: "warn",
        message: "subagent depth compatibility: OpenCode subagent_depth=0, ocmm subagent.maxDepth=3, effective=0 (host is stricter; task dispatches only)",
      },
    },
    {
      name: "host one is stricter",
      hostDepth: 1,
      config: configWithDepth(3),
      expected: {
        key: "host:1|ocmm:3",
        level: "warn",
        message: "subagent depth compatibility: OpenCode subagent_depth=1, ocmm subagent.maxDepth=3, effective=1 (host is stricter; task dispatches only)",
      },
    },
    {
      name: "limits agree",
      hostDepth: 3,
      config: configWithDepth(3),
      expected: {
        key: "host:3|ocmm:3",
        level: "info",
        message: "subagent depth compatibility: OpenCode subagent_depth=3, ocmm subagent.maxDepth=3, effective=3 (limits agree; task dispatches only)",
      },
    },
    {
      name: "ocmm is stricter",
      hostDepth: 5,
      config: configWithDepth(3),
      expected: {
        key: "host:5|ocmm:3",
        level: "warn",
        message: "subagent depth compatibility: OpenCode subagent_depth=5, ocmm subagent.maxDepth=3, effective=3 (ocmm is stricter; task dispatches only)",
      },
    },
    {
      name: "canonical guard disablement leaves host only",
      hostDepth: 1,
      config: configWithDepth(3, ["subagent-depth-guard"]),
      expected: {
        key: "host:1|ocmm:disabled",
        level: "info",
        message: "subagent depth compatibility: OpenCode subagent_depth=1, ocmm subagent-depth-guard=disabled, effective=1 (host only; task dispatches only)",
      },
    },
    {
      name: "compatibility alias disablement leaves host only",
      hostDepth: 1,
      config: configWithDepth(3, ["subagentDepthGuard"]),
      expected: {
        key: "host:1|ocmm:disabled",
        level: "info",
        message: "subagent depth compatibility: OpenCode subagent_depth=1, ocmm subagent-depth-guard=disabled, effective=1 (host only; task dispatches only)",
      },
    },
  ] as const

  for (const item of cases) {
    assert.deepEqual(
      resolveSubagentDepthDiagnostic({ subagent_depth: item.hostDepth }, item.config),
      item.expected,
      item.name,
    )
  }
})

test("returns no diagnostic when the host depth field is not safely observable", () => {
  const config = configWithDepth(3)
  const inputs: unknown[] = [
    null,
    [],
    {},
    Object.create({ subagent_depth: 1 }),
    { subagent_depth: undefined },
    { subagent_depth: "1" },
    { subagent_depth: -1 },
    { subagent_depth: 1.5 },
    { subagent_depth: Number.NaN },
    { subagent_depth: Number.POSITIVE_INFINITY },
  ]

  for (const input of inputs) {
    assert.equal(resolveSubagentDepthDiagnostic(input, config), null)
  }
})

test("reads without mutation and never includes unrelated host config or secrets", () => {
  const hostConfig = {
    subagent_depth: 1,
    provider: { private: { apiKey: "DEPTH_DIAGNOSTIC_SECRET_SENTINEL" } },
  }
  const before = structuredClone(hostConfig)

  const diagnostic = resolveSubagentDepthDiagnostic(hostConfig, configWithDepth(3))

  assert.ok(diagnostic)
  assert.deepEqual(hostConfig, before)
  assert.doesNotMatch(`${diagnostic.key}\n${diagnostic.message}`, /DEPTH_DIAGNOSTIC_SECRET_SENTINEL/)
})

test("reports each diagnostic key once per reporter instance", () => {
  const calls: Array<{ level: "info" | "warn"; message: string }> = []
  const reporter = createSubagentDepthDiagnosticReporter({
    info(...args: unknown[]) {
      calls.push({ level: "info", message: String(args[0]) })
    },
    warn(...args: unknown[]) {
      calls.push({ level: "warn", message: String(args[0]) })
    },
  })
  const config = configWithDepth(3)

  reporter({ subagent_depth: 1 }, config)
  reporter({ subagent_depth: 1 }, config)
  reporter({ subagent_depth: 3 }, config)
  reporter({ subagent_depth: 1 }, config)
  reporter({}, config)

  assert.deepEqual(calls, [
    {
      level: "warn",
      message: "subagent depth compatibility: OpenCode subagent_depth=1, ocmm subagent.maxDepth=3, effective=1 (host is stricter; task dispatches only)",
    },
    {
      level: "info",
      message: "subagent depth compatibility: OpenCode subagent_depth=3, ocmm subagent.maxDepth=3, effective=3 (limits agree; task dispatches only)",
    },
  ])
})
```

- [ ] **Step 2: Run the new test and verify the missing module is the only expected failure**

Run:

```powershell
node --test --experimental-strip-types src/hooks/subagent-depth-diagnostics.test.ts
```

Expected: non-zero exit with `ERR_MODULE_NOT_FOUND` for `src/hooks/subagent-depth-diagnostics.ts`; there must be no unrelated test-runner failure.

- [ ] **Step 3: Implement the pure resolver and reporter**

Create `src/hooks/subagent-depth-diagnostics.ts` with this content:

```ts
import type { OcmmConfig } from "../config/schema.ts"
import { isRecord, log } from "../shared/logger.ts"

const SUBAGENT_DEPTH_GUARD_NAMES = new Set([
  "subagent-depth-guard",
  "subagentDepthGuard",
])

export type SubagentDepthDiagnostic = {
  key: string
  level: "info" | "warn"
  message: string
}

export type SubagentDepthDiagnosticLogger = {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
}

function observedHostDepth(hostConfig: unknown): number | undefined {
  if (!isRecord(hostConfig) || !Object.hasOwn(hostConfig, "subagent_depth")) return undefined
  const value = hostConfig.subagent_depth
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return undefined
  return value
}

function depthGuardEnabled(config: OcmmConfig): boolean {
  return !config.disabledHooks.some((name) => SUBAGENT_DEPTH_GUARD_NAMES.has(name))
}

export function resolveSubagentDepthDiagnostic(
  hostConfig: unknown,
  config: OcmmConfig,
): SubagentDepthDiagnostic | null {
  const hostDepth = observedHostDepth(hostConfig)
  if (hostDepth === undefined) return null

  if (!depthGuardEnabled(config)) {
    return {
      key: `host:${hostDepth}|ocmm:disabled`,
      level: "info",
      message: `subagent depth compatibility: OpenCode subagent_depth=${hostDepth}, ocmm subagent-depth-guard=disabled, effective=${hostDepth} (host only; task dispatches only)`,
    }
  }

  const ocmmDepth = config.subagent.maxDepth
  const effective = Math.min(hostDepth, ocmmDepth)
  const relation = hostDepth === ocmmDepth
    ? "limits agree"
    : hostDepth < ocmmDepth
      ? "host is stricter"
      : "ocmm is stricter"

  return {
    key: `host:${hostDepth}|ocmm:${ocmmDepth}`,
    level: hostDepth === ocmmDepth ? "info" : "warn",
    message: `subagent depth compatibility: OpenCode subagent_depth=${hostDepth}, ocmm subagent.maxDepth=${ocmmDepth}, effective=${effective} (${relation}; task dispatches only)`,
  }
}

export function createSubagentDepthDiagnosticReporter(
  logger: SubagentDepthDiagnosticLogger = log,
): (hostConfig: unknown, config: OcmmConfig) => void {
  const emitted = new Set<string>()

  return (hostConfig, config) => {
    const diagnostic = resolveSubagentDepthDiagnostic(hostConfig, config)
    if (!diagnostic || emitted.has(diagnostic.key)) return
    emitted.add(diagnostic.key)
    logger[diagnostic.level](diagnostic.message)
  }
}
```

- [ ] **Step 4: Run the module tests and typecheck the new public signatures**

Run:

```powershell
node --test --experimental-strip-types src/hooks/subagent-depth-diagnostics.test.ts
pnpm run typecheck
```

Expected: four subtests pass; TypeScript exits `0` with no diagnostics.

---

### Task 2: Config-hook wiring and task-only scope regression

**Files:**
- Modify: `src/hooks/config.ts:24,437-455,585-604,934-936`
- Modify: `src/hooks/config.test.ts`
- Modify: `src/permissions/index.test.ts:568-640`

**Interfaces:**
- Consumes: `createSubagentDepthDiagnosticReporter()` from Task 1, the resolved config-hook target, current `OcmmConfig`, and `toolName(rawInput)` behavior in the unchanged permission guard.
- Produces: one reporter instance per `createConfigHandler()` instance; an optional `ConfigHandlerBaseArgs.logger`; integration evidence that explicit host values are reported but never changed; regression evidence that `execute` remains outside the guard.

- [ ] **Step 1: Add failing config-hook integration tests**

Append these tests before the helper functions at the end of `src/hooks/config.test.ts`:

```ts
test("config reports an observed host subagent depth once without mutating it", async () => {
  const calls: Array<{ level: "info" | "warn"; message: string }> = []
  const config = { ...defaultConfig(), registerBuiltinAgents: false }
  const handler = createConfigHandler({
    getConfig: () => config,
    logger: {
      info(...args: unknown[]) {
        calls.push({ level: "info", message: String(args[0]) })
      },
      warn(...args: unknown[]) {
        calls.push({ level: "warn", message: String(args[0]) })
      },
    },
  })
  const target = {
    subagent_depth: 1,
    privateValue: "CONFIG_HOOK_SECRET_SENTINEL",
  }

  await handler(target, undefined)
  await handler(target, undefined)

  const depthCalls = calls.filter((call) => call.message.startsWith("subagent depth compatibility:"))
  assert.deepEqual(depthCalls, [
    {
      level: "warn",
      message: "subagent depth compatibility: OpenCode subagent_depth=1, ocmm subagent.maxDepth=3, effective=1 (host is stricter; task dispatches only)",
    },
  ])
  assert.equal(target.subagent_depth, 1)
  assert.equal(target.privateValue, "CONFIG_HOOK_SECRET_SENTINEL")
  assert.doesNotMatch(JSON.stringify(depthCalls), /CONFIG_HOOK_SECRET_SENTINEL/)
  assert.ok(calls.some((call) => call.message.startsWith("config: registered")))
})

test("config stays silent when host subagent depth is not observable", async () => {
  const calls: string[] = []
  const target: Record<string, unknown> = {}
  const handler = createConfigHandler({
    getConfig: defaultConfig,
    logger: {
      info(...args: unknown[]) {
        calls.push(String(args[0]))
      },
      warn(...args: unknown[]) {
        calls.push(String(args[0]))
      },
    },
  })

  await handler(target, undefined)

  assert.equal(Object.hasOwn(target, "subagent_depth"), false)
  assert.equal(calls.some((message) => message.startsWith("subagent depth compatibility:")), false)
})
```

- [ ] **Step 2: Run the config tests and verify the new diagnostic assertion fails**

Run:

```powershell
node --test --experimental-strip-types src/hooks/config.test.ts
```

Expected: the new observed-host test fails because no depth diagnostic is captured; existing config tests continue to pass.

- [ ] **Step 3: Wire one reporter into each config handler and use the selected logger**

Apply these exact structural changes to `src/hooks/config.ts`:

```ts
import { isRecord, log } from "../shared/logger.ts"
import {
  createSubagentDepthDiagnosticReporter,
  type SubagentDepthDiagnosticLogger,
} from "./subagent-depth-diagnostics.ts"
```

Extend `ConfigHandlerBaseArgs`:

```ts
export type ConfigHandlerBaseArgs = {
  getConfig: () => OcmmConfig
  skillsRoot?: string
  cwd?: string
  logger?: SubagentDepthDiagnosticLogger
}
```

Initialize the selected logger and reporter once, outside the returned async hook:

```ts
export function createConfigHandler(
  args: ConfigHandlerArgs,
): (input: unknown, output: unknown) => Promise<void> {
  const logger = args.logger ?? log
  const reportSubagentDepth = createSubagentDepthDiagnosticReporter(logger)

  return async (rawInput, _output) => {
```

After `target` and `cfg` are both available, invoke the reporter without assigning to `target`:

```ts
    const target = isRecord(rawInput.config) ? rawInput.config : rawInput
    const routeBuild = registryManaged
      ? { fastMode: args.getFastMode(), nextRoutes: new Map<string, ReturnType<typeof buildEffectiveModelRoute>>() }
      : undefined
    const cfg = compatibilityConfig ?? args.getConfig()
    reportSubagentDepth(target, cfg)
    const registered = registerSkillsAndCommands(target, cfg, args.skillsRoot)
```

Replace both existing `log.info(...)` registration calls in this function with `logger.info(...)`. Do not replace unrelated log calls in other modules.

- [ ] **Step 4: Run config tests and typecheck**

Run:

```powershell
node --test --experimental-strip-types src/hooks/config.test.ts
pnpm run typecheck
```

Expected: all config tests pass, including one warning across two calls to the same handler; TypeScript exits `0`.

- [ ] **Step 5: Add the unchanged-scope regression for a tool named `execute`**

Add this test immediately after the existing `subagent depth guard is disabled when hook is disabled` test in `src/permissions/index.test.ts`:

```ts
test("subagent depth guard does not treat execute as task", async () => {
  const root = tempProject()
  try {
    const guards = createPermissionGuards({
      getConfig: defaultConfig,
      projectRoot: root,
      sessionDepthMap: new Map([["s1", 3]]),
    })

    await guards.before({ tool: "execute", sessionID: "s1", args: {} }, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

Do not edit `src/permissions/index.ts`; its existing `toolName(rawInput) !== "task"` early return is the required behavior.

- [ ] **Step 6: Run all depth-related tests together**

Run:

```powershell
node --test --experimental-strip-types src/hooks/subagent-depth-diagnostics.test.ts src/hooks/config.test.ts src/permissions/index.test.ts src/index.test.ts src/config/load.test.ts src/config/profiles.test.ts
```

Expected: all listed test files pass; existing default-`3`, profile override, plugin wiring, and task-blocking tests remain green alongside the new diagnostics.

---

### Task 3: User and maintainer compatibility documentation

**Files:**
- Modify: `README.md:319-321,427-455`
- Modify: `AGENTS.md:139`

**Interfaces:**
- Consumes: exact messages and compatibility decisions from Tasks 1-2.
- Produces: user-facing instructions for observed, implicit-default, older-host, disabled-guard, and task-only cases; corrected repository guidance.

- [ ] **Step 1: Add the compatibility section to README**

Insert this section after the main configuration example and before `### Canonical review-slot configuration`:

```markdown
### OpenCode host subagent depth compatibility

OpenCode commit `285d315b4e5355e0a94608acc0678a11b720079e` added the top-level `subagent_depth` setting with an implicit default of `1`. ocmm's separate `subagent.maxDepth` remains defaulted to `3`. While both guards are active, the effective maximum for `task` dispatches is the lower value; ocmm never copies its value into host config and never changes either default.

When OpenCode exposes an explicit `subagent_depth` to the plugin `config` hook, `OCMM_DEBUG=1` enables one deduplicated compatibility message for each observed host/local combination. Equal values log at `info`; mismatches log at `warn` and name the stricter side. Disabling ocmm's `subagent-depth-guard` leaves the observed host value as the sole reported limit.

An absent field is intentionally not inferred. It can mean either an older OpenCode host without this setting or a newer host using the implicit default of `1`; ocmm emits no runtime compatibility message in either case. On a newer host with the field omitted, the actual default combination is therefore host `1`, ocmm `3`, effective `1` even though only this documentation can explain it.

| Host/config case | ocmm guard | Effective `task` limit | Diagnostic |
| --- | --- | ---: | --- |
| Pre-`285d315` host; field unavailable | Enabled at `3` | `3` from ocmm | None |
| New host; field omitted | Enabled at `3` | `1` from host default | None; field is not observable |
| New host; explicit `subagent_depth: 1` | Enabled at `3` | `1` | `warn`: host is stricter |
| New host; explicit `subagent_depth: 3` | Enabled at `3` | `3` | `info`: limits agree |
| New host; explicit `subagent_depth: 5` | Enabled at `3` | `3` | `warn`: ocmm is stricter |
| New host; explicit `subagent_depth: 1` | Disabled | `1` from host | `info`: host only |

Both controls are specific to OpenCode's `task` dispatch path. ocmm does not classify a tool named `execute` as `task` and does not apply the depth guard to it.
```

- [ ] **Step 2: Update both hook summaries without changing the declared local default**

Replace the `subagent-depth-guard` row in `README.md` and `AGENTS.md` with:

```markdown
| `subagent-depth-guard` | Enabled | Blocks `task` dispatches that would exceed local `subagent.maxDepth` (default `3`); when host `subagent_depth` is observable, the effective limit is the lower active value and `OCMM_DEBUG` logs compatibility once per combination. Never treats `execute` as `task`. |
```

- [ ] **Step 3: Check documentation for all required guarantees and no schema-generation instruction**

Run:

```powershell
rg -n "285d315|subagent_depth|effective|field omitted|never copies|execute" README.md AGENTS.md
git diff -- README.md AGENTS.md | rg "gen-schema"
```

Expected: the first command finds the new compatibility section and both updated rows; the second command produces no output, proving this change did not add schema-generation instructions to either document.

---

### Task 4: Full verification, isolated live QA, and one atomic commit

**Files:**
- Verify: all files listed in this plan
- Verify unchanged: `src/config/schema.ts`, `schema.json`, `src/permissions/index.ts`, host config, prompts, and generated bundles
- Include in final commit: `docs/superpowers/specs/2026-07-20-host-subagent-depth-diagnostics-design.md` and `docs/superpowers/plans/2026-07-20-host-subagent-depth-diagnostics.md`

**Interfaces:**
- Consumes: completed implementation, tests, and documentation from Tasks 1-3.
- Produces: repository gate evidence, primary full-host evidence for observed and unobservable shapes when the host loader runs, or a documented host-block plus built-hook partial-runtime receipt when it does not; a clean scope check; and exactly one atomic commit.

- [ ] **Step 1: Run targeted tests, typecheck, complete tests, and build once**

Run from the repository root:

```powershell
node --test --experimental-strip-types src/hooks/subagent-depth-diagnostics.test.ts src/hooks/config.test.ts src/permissions/index.test.ts src/index.test.ts src/config/load.test.ts src/config/profiles.test.ts
pnpm run typecheck
pnpm test
pnpm run build
```

Expected:

- every targeted Node test passes;
- `pnpm run typecheck` exits `0` with no TypeScript diagnostics;
- `pnpm test` passes both the TypeScript suite and `cargo test -p ocmm-lsp`;
- `pnpm run build` produces TypeScript output and release LSP binaries without errors.

- [ ] **Step 2: Prove schema, guard implementation, prompts, and generated bundles stayed out of scope**

Run:

```powershell
git diff --check
git diff --exit-code -- src/config/schema.ts schema.json src/permissions/index.ts prompts docs/v1-maintenance.md docs/prompt-sync.md .codex/agents .agents/plugins/marketplace.json plugins/deepwork
```

Expected: both commands exit `0` with no output. Do not run `pnpm run gen-schema` or `pnpm run gen:codex-plugin`.

- [ ] **Step 3: Run an isolated live OpenCode config-hook probe**

Run this PowerShell script from the repository root after `pnpm run build`:

```powershell
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repo = (Get-Location).Path
$approvedParent = Join-Path $env:LOCALAPPDATA "Temp\opencode"
if (-not (Test-Path -LiteralPath $approvedParent -PathType Container)) {
  throw "Approved OpenCode temp parent is absent: $approvedParent"
}
$root = Join-Path $approvedParent ("ocmm-host-depth-diagnostics-" + [guid]::NewGuid().ToString("N"))
$envNames = @(
  "OPENCODE_CONFIG_CONTENT", "OPENCODE_CONFIG", "OPENCODE_CONFIG_DIR",
  "OCMM_PROFILE", "OCMM_NO_PROFILE",
  "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME",
  "OCMM_DEBUG"
)
$priorEnv = @{}
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$expected = "subagent depth compatibility: OpenCode subagent_depth=1, ocmm subagent.maxDepth=3, effective=1 (host is stricter; task dispatches only)"
$sentinel = "HOST_DEPTH_PROBE_SENTINEL"
$report = [ordered]@{ status = "FAIL_INVESTIGATE"; cleanupComplete = $false }
$exitCode = 1

function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Invoke-BoundedProcess {
  param(
    [string]$FileName,
    [string[]]$Arguments,
    [string]$WorkingDirectory,
    [int]$TimeoutSeconds = 15
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FileName
  $startInfo.WorkingDirectory = $WorkingDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($argument in $Arguments) { [void]$startInfo.ArgumentList.Add($argument) }

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  if (-not $process.Start()) { throw "Failed to start $FileName" }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $timedOut = -not $process.WaitForExit($TimeoutSeconds * 1000)
  if ($timedOut) {
    $process.Kill($true)
    $process.WaitForExit()
  }
  $streamDrained = [System.Threading.Tasks.Task]::WaitAll(
    [System.Threading.Tasks.Task[]]@($stdoutTask, $stderrTask), 5000
  )
  $stopwatch.Stop()
  $result = [pscustomobject]@{
    pid = $process.Id
    exit = $process.ExitCode
    timedOut = $timedOut
    elapsedMs = [math]::Round($stopwatch.Elapsed.TotalMilliseconds)
    streamDrained = $streamDrained
    stdout = if ($streamDrained) { $stdoutTask.GetAwaiter().GetResult() } else { "" }
    stderr = if ($streamDrained) { $stderrTask.GetAwaiter().GetResult() } else { "" }
  }
  $process.Dispose()
  return $result
}

function Get-CombinedOutput {
  param($Result)
  return "$($Result.stdout)`n$($Result.stderr)"
}

function Get-ConfigLoadedMarkerCount {
  param($Result)
  return [regex]::Matches((Get-CombinedOutput $Result), '\[ocmm\]\s+config loaded:').Count
}

function Get-ConfigRegisteredMarkerCount {
  param($Result)
  return [regex]::Matches((Get-CombinedOutput $Result), '\[ocmm\]\s+config:\s+registered').Count
}

function Get-HookMarkerCount {
  param($Result)
  return (Get-ConfigLoadedMarkerCount $Result) + (Get-ConfigRegisteredMarkerCount $Result)
}
function Get-PluginDeclaration {
  param([string]$Form, [string]$AttemptDirectory, [string]$ArtifactPath)
  switch ($Form) {
    "absolute" { return $ArtifactPath }
    "fileUri" { return ([uri]::new($ArtifactPath)).AbsoluteUri }
    "relative" { return [System.IO.Path]::GetRelativePath($AttemptDirectory, $ArtifactPath) }
    default { throw "Unknown plugin declaration form: $Form" }
  }
}

function New-AttemptDirectory {
  param([string]$Name)
  $directory = Join-Path $root $Name
  [System.IO.Directory]::CreateDirectory($directory) | Out-Null
  [System.IO.Directory]::CreateDirectory((Join-Path $directory ".opencode")) | Out-Null
  Write-Utf8NoBom (Join-Path $directory ".opencode\ocmm.jsonc") '{ "registerBuiltinAgents": false, "debug": true }'
  return $directory
}

function Write-HostConfig {
  param([string]$AttemptDirectory, [object[]]$Plugins, [bool]$IncludeDepth)
  $config = [ordered]@{
    '$schema' = "https://opencode.ai/config.json"
    plugin = $Plugins
  }
  if ($IncludeDepth) { $config.subagent_depth = 1 }
  Write-Utf8NoBom (Join-Path $AttemptDirectory "opencode.json") ($config | ConvertTo-Json -Depth 5)
}

function Invoke-ConfigProbe {
  param([string]$AttemptDirectory)
  return Invoke-BoundedProcess -FileName $opencodePath -Arguments @("debug", "config", "--print-logs", "--log-level", "DEBUG") -WorkingDirectory $AttemptDirectory
}

function Get-SafeAttemptSummary {
  param([string]$Form, $Result)
  return [ordered]@{
    form = $Form
    pid = $Result.pid
    exit = $Result.exit
    timedOut = $Result.timedOut
    elapsedMs = $Result.elapsedMs
    streamDrained = $Result.streamDrained
    configLoadedMarkerCount = Get-ConfigLoadedMarkerCount $Result
    configRegisteredMarkerCount = Get-ConfigRegisteredMarkerCount $Result
    hookMarkerCount = Get-HookMarkerCount $Result
  }
}

try {
  foreach ($name in $envNames) {
    $priorEnv[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, $null, "Process")
  }
  [System.IO.Directory]::CreateDirectory($root) | Out-Null
  $env:XDG_CONFIG_HOME = Join-Path $root "xdg-config"
  $env:XDG_DATA_HOME = Join-Path $root "xdg-data"
  $env:XDG_STATE_HOME = Join-Path $root "xdg-state"
  $env:XDG_CACHE_HOME = Join-Path $root "xdg-cache"
  $env:OCMM_DEBUG = "1"
  foreach ($path in @($env:XDG_CONFIG_HOME, $env:XDG_DATA_HOME, $env:XDG_STATE_HOME, $env:XDG_CACHE_HOME)) {
    [System.IO.Directory]::CreateDirectory($path) | Out-Null
  }

  $opencodePath = (Get-Command opencode -CommandType Application -ErrorAction Stop).Source
  $nodePath = (Get-Command node -CommandType Application -ErrorAction Stop).Source
  $artifact = (Resolve-Path (Join-Path $repo "dist\index.js") -ErrorAction Stop).Path
  $artifactSha256 = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash

  $baselineDirectory = New-AttemptDirectory "baseline"
  Write-HostConfig -AttemptDirectory $baselineDirectory -Plugins @() -IncludeDepth $false
  $baseline = Invoke-ConfigProbe $baselineDirectory
  if ($baseline.timedOut -or $baseline.exit -ne 0 -or -not $baseline.streamDrained) {
    throw "Baseline must exit naturally with code 0 and drained streams"
  }

  $attempts = @()
  foreach ($form in @("absolute", "fileUri", "relative")) {
    $attemptDirectory = New-AttemptDirectory "external-$form"
    $declaration = Get-PluginDeclaration -Form $form -AttemptDirectory $attemptDirectory -ArtifactPath $artifact
    Write-HostConfig -AttemptDirectory $attemptDirectory -Plugins @($declaration) -IncludeDepth $true
    $result = Invoke-ConfigProbe $attemptDirectory
    $attempts += [pscustomobject]@{ form = $form; directory = $attemptDirectory; result = $result }
  }

  $report.baseline = Get-SafeAttemptSummary -Form "pluginEmpty" -Result $baseline
  $report.externalAttempts = @($attempts | ForEach-Object { Get-SafeAttemptSummary -Form $_.form -Result $_.result })
  $invalidAttempt = @($attempts | Where-Object {
    -not $_.result.streamDrained -or
    (-not $_.result.timedOut -and $_.result.exit -ne 0) -or
    ($_.result.timedOut -and (Get-HookMarkerCount $_.result) -gt 0)
  })
  if ($invalidAttempt.Count -gt 0) { throw "External-plugin attempts require investigation" }

  $hookReady = @($attempts | Where-Object {
    -not $_.result.timedOut -and $_.result.exit -eq 0 -and (Get-HookMarkerCount $_.result) -gt 0
  })
  if ($hookReady.Count -gt 0) {
    $form = $hookReady[0].form
    $explicitDirectory = New-AttemptDirectory "full-explicit"
    Write-HostConfig -AttemptDirectory $explicitDirectory -Plugins @((Get-PluginDeclaration $form $explicitDirectory $artifact)) -IncludeDepth $true
    $explicit = Invoke-ConfigProbe $explicitDirectory
    if ($explicit.timedOut -or $explicit.exit -ne 0 -or -not $explicit.streamDrained) { throw "Full explicit probe did not exit naturally" }
    $explicitText = Get-CombinedOutput $explicit
    if ([regex]::Matches($explicitText, [regex]::Escape($expected)).Count -ne 1) { throw "Full explicit probe did not emit exactly one compatibility line" }
    if ($explicitText -notmatch '"subagent_depth"\s*:\s*1') { throw "Full explicit probe did not preserve subagent_depth" }

    $absentDirectory = New-AttemptDirectory "full-absent"
    Write-HostConfig -AttemptDirectory $absentDirectory -Plugins @((Get-PluginDeclaration $form $absentDirectory $artifact)) -IncludeDepth $false
    $absent = Invoke-ConfigProbe $absentDirectory
    if ($absent.timedOut -or $absent.exit -ne 0 -or -not $absent.streamDrained) { throw "Full absent-field probe did not exit naturally" }
    if ((Get-CombinedOutput $absent) -match [regex]::Escape("subagent depth compatibility:")) { throw "Full absent-field probe emitted a compatibility line" }

    $report.status = "PASS"
    $report.fullHost = [ordered]@{
      form = $form
      explicitCompatibilityCount = [regex]::Matches($explicitText, [regex]::Escape($expected)).Count
      absentCompatibilityCount = [regex]::Matches((Get-CombinedOutput $absent), [regex]::Escape("subagent depth compatibility:")).Count
    }
    $exitCode = 0
  } elseif (@($attempts | Where-Object { $_.result.timedOut -and (Get-HookMarkerCount $_.result) -eq 0 }).Count -eq 3) {
    $directDirectory = New-AttemptDirectory "direct-built-hook"
    $probePath = Join-Path $directDirectory "probe.mjs"
    $probeSource = @'
import { pathToFileURL } from "node:url"

const [artifact, directory, expected, sentinel] = process.argv.slice(2)
const captured = []
for (const name of ["log", "info", "warn", "error"]) {
  console[name] = (...args) => captured.push(args.map((value) => String(value)).join(" "))
}
const pluginModule = (await import(pathToFileURL(artifact).href)).default
const pluginInterface = pluginModule.server({ directory })
const config = pluginInterface.config
const explicitTarget = { subagent_depth: 1, privateValue: sentinel }
const explicitInput = { config: explicitTarget }
const explicitBefore = { own: Object.hasOwn(explicitTarget, "subagent_depth"), value: explicitTarget.subagent_depth, sentinelOwn: Object.hasOwn(explicitTarget, "privateValue") }
await config(explicitInput, undefined)
await config(explicitInput, undefined)
const explicitAfter = { own: Object.hasOwn(explicitTarget, "subagent_depth"), value: explicitTarget.subagent_depth, sentinelOwn: Object.hasOwn(explicitTarget, "privateValue") }
const explicitCompatibility = captured.filter((entry) => entry.includes("subagent depth compatibility:"))
const absentTarget = { privateValue: sentinel }
const absentInput = { config: absentTarget }
const absentBefore = { own: Object.hasOwn(absentTarget, "subagent_depth"), sentinelOwn: Object.hasOwn(absentTarget, "privateValue") }
await config(absentInput, undefined)
const absentAfter = { own: Object.hasOwn(absentTarget, "subagent_depth"), sentinelOwn: Object.hasOwn(absentTarget, "privateValue") }
const compatibility = captured.filter((entry) => entry.includes("subagent depth compatibility:"))
const capturedHasSentinel = captured.some((entry) => entry.includes(sentinel))
process.stdout.write(JSON.stringify({
  explicit: { before: explicitBefore, after: explicitAfter, compatibilityCount: explicitCompatibility.length, exactCount: explicitCompatibility.filter((entry) => entry.includes(expected)).length },
  absent: { before: absentBefore, after: absentAfter, exactCount: compatibility.slice(explicitCompatibility.length).filter((entry) => entry.includes(expected)).length, compatibilityCount: compatibility.length - explicitCompatibility.length },
  capturedHasSentinel,
  capturedCount: captured.length,
}))
'@
    Write-Utf8NoBom -Path $probePath -Content $probeSource
    $direct = Invoke-BoundedProcess -FileName $nodePath -Arguments @($probePath, $artifact, $directDirectory, $expected, $sentinel) -WorkingDirectory $directDirectory
    if ($direct.timedOut -or $direct.exit -ne 0 -or -not $direct.streamDrained -or -not [string]::IsNullOrEmpty($direct.stderr)) { throw "Direct built-hook probe failed" }
    $directReceipt = $direct.stdout | ConvertFrom-Json -ErrorAction Stop
    if ($directReceipt.explicit.compatibilityCount -ne 1 -or $directReceipt.explicit.exactCount -ne 1 -or -not $directReceipt.explicit.before.own -or -not $directReceipt.explicit.after.own -or $directReceipt.explicit.before.value -ne 1 -or $directReceipt.explicit.after.value -ne 1 -or -not $directReceipt.explicit.before.sentinelOwn -or -not $directReceipt.explicit.after.sentinelOwn) { throw "Direct explicit-target assertions failed" }
    if ($directReceipt.absent.exactCount -ne 0 -or $directReceipt.absent.compatibilityCount -ne 0 -or $directReceipt.absent.before.own -or $directReceipt.absent.after.own -or -not $directReceipt.absent.before.sentinelOwn -or -not $directReceipt.absent.after.sentinelOwn) { throw "Direct absent-target assertions failed" }
    if ($directReceipt.capturedHasSentinel) { throw "Direct built-hook probe captured the sentinel" }

    $report.status = "DEFERRED_PRE_HOOK_TIMEOUT"
    $report.deferredLabel = "DEFERRED: host loader pre-hook"
    $report.artifactSha256 = $artifactSha256
    $report.directBuiltHook = [ordered]@{
      pid = $direct.pid
      exit = $direct.exit
      timedOut = $direct.timedOut
      elapsedMs = $direct.elapsedMs
      explicitCompatibilityCount = $directReceipt.explicit.compatibilityCount
      explicitExactCount = $directReceipt.explicit.exactCount
      explicitBeforeValue = $directReceipt.explicit.before.value
      explicitAfterValue = $directReceipt.explicit.after.value
      absentExactCount = $directReceipt.absent.exactCount
      absentCompatibilityCount = $directReceipt.absent.compatibilityCount
      absentBeforeOwn = $directReceipt.absent.before.own
      absentAfterOwn = $directReceipt.absent.after.own
      capturedHasSentinel = $directReceipt.capturedHasSentinel
    }
    $exitCode = 0
  } else {
    throw "External-plugin outcome is mixed or did not reach the strict deferred condition"
  }
} catch {
  $report.status = "FAIL_INVESTIGATE"
  $report.reason = $_.Exception.Message
} finally {
  foreach ($name in $envNames) { [Environment]::SetEnvironmentVariable($name, $priorEnv[$name], "Process") }
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
  $report.cleanupComplete = -not (Test-Path -LiteralPath $root)
  if (-not $report.cleanupComplete) { $report.status = "FAIL_INVESTIGATE"; $exitCode = 1 }
  [Console]::Out.WriteLine(($report | ConvertTo-Json -Depth 8 -Compress))
  exit $exitCode
}
```

Expected: every `opencode debug config` call goes through `Invoke-BoundedProcess`; no synchronous shell invocation is allowed. A natural exit with a hook marker executes the full explicit and absent assertions and may produce `PASS`. The direct built-hook probe runs only when all three external declarations time out with zero markers, and then produces `DEFERRED_PRE_HOOK_TIMEOUT` plus the receipt label `DEFERRED: host loader pre-hook`. A nonzero natural exit, an undrained stream, a timeout with a marker, or a mixed outcome without a natural hook-ready path is `FAIL_INVESTIGATE`, not a fallback. The final JSON is a safe summary only: it never includes raw host config, raw logs, or the sentinel. The partial result proves current built plugin/config-hook behavior, not OpenCode external-plugin loader integration. When a host path becomes available, rerun the full probe.

Current receipt: installed OpenCode `1.18.3`; after full isolation and inheritance/profile cleanup, `plugin: []` exited `0` in `2.196s`. Windows absolute-path, canonical-file-URI, and relative-path external declarations each timed out at `15s` with zero hook markers (`config loaded=0`, `config: registered=0`). `dist/index.js` SHA-256 was `F1785B3B9852C2BA8E24B11936BEBEDC47EDC04B425DE3469253617E6E582BB0`. The direct actual-hook probe exited `0` in `223ms`, emitted the exact compatibility line once across two explicit-target calls, preserved own-property value `1`, left a fresh absent-field target silent and non-materialized, leaked no secret, and completed cleanup. Its result is `DEFERRED: host loader pre-hook`, not `PASS`.

- [ ] **Step 4: Perform final scope, incomplete-item, and secret checks**

Run:

```powershell
rg -n "T[B]D|T[O]DO|F[I]XME|implement la[t]er|similar to abo[v]e" src/hooks/subagent-depth-diagnostics.ts README.md AGENTS.md docs/superpowers/specs/2026-07-20-host-subagent-depth-diagnostics-design.md docs/superpowers/plans/2026-07-20-host-subagent-depth-diagnostics.md
rg -n "DEPTH_DIAGNOSTIC_SECRET_SENTINEL|CONFIG_HOOK_SECRET_SENTINEL" src/hooks/subagent-depth-diagnostics.ts README.md AGENTS.md
git status --short
git diff --stat
git diff -- src/hooks/subagent-depth-diagnostics.ts src/hooks/subagent-depth-diagnostics.test.ts src/hooks/config.ts src/hooks/config.test.ts src/permissions/index.test.ts README.md AGENTS.md docs/superpowers/specs/2026-07-20-host-subagent-depth-diagnostics-design.md docs/superpowers/plans/2026-07-20-host-subagent-depth-diagnostics.md
git log --oneline -10
```

Expected:

- both `rg` commands produce no output, proving there are no incomplete-item terms and no sentinel strings in production code or operational documentation; sentinel strings remain confined to their test fixtures;
- the requested change contributes exactly nine paths: two new source/test files, three modified source-test files, two modified operational docs, and two planning artifacts;
- pre-existing unrelated worktree files, including other untracked planning documents, remain unstaged and unchanged;
- the full diff contains no host config write, default change, `execute` reclassification, secret value in production output, or unrelated user change.

- [ ] **Step 5: Stage the exact atomic change and inspect it**

Run only after explicit git-write authorization:

```powershell
git add -- src/hooks/subagent-depth-diagnostics.ts src/hooks/subagent-depth-diagnostics.test.ts src/hooks/config.ts src/hooks/config.test.ts src/permissions/index.test.ts README.md AGENTS.md docs/superpowers/specs/2026-07-20-host-subagent-depth-diagnostics-design.md docs/superpowers/plans/2026-07-20-host-subagent-depth-diagnostics.md
git diff --staged --check
git diff --staged --stat
git diff --staged -- src/hooks/subagent-depth-diagnostics.ts src/hooks/subagent-depth-diagnostics.test.ts src/hooks/config.ts src/hooks/config.test.ts src/permissions/index.test.ts README.md AGENTS.md docs/superpowers/specs/2026-07-20-host-subagent-depth-diagnostics-design.md docs/superpowers/plans/2026-07-20-host-subagent-depth-diagnostics.md
```

Expected: staged diff contains exactly nine paths: two new source/test files, three modified source-test files, two modified operational docs, and two planning artifacts. `src/config/schema.ts`, `schema.json`, `src/permissions/index.ts`, host config, prompts, and generated files are absent.

- [ ] **Step 6: Create the single commit and verify repository state**

Run only after Step 5 confirms the staged scope and explicit authorization remains in force:

```powershell
git commit -m "feat: diagnose host subagent depth limits" -m "Report read-only host/ocmm depth compatibility and document old-host behavior without changing either default."
git log -1 --oneline
git status --short
```

Expected: exactly one new semantic commit with subject `feat: diagnose host subagent depth limits`; `git status --short` is empty unless it shows pre-existing unrelated user changes that were deliberately left unstaged.

---

## Requirement-to-Task Coverage

| Requirement | Plan coverage |
| --- | --- |
| Read-only host observation | Task 1 resolver/no-mutation test; Task 2 integration assertion; Task 4 live resolved-config check |
| Effective lower active value | Task 1 matrix for host/equal/ocmm/disabled cases |
| Exact conflict and agreement messages | Task 1 exact string assertions; Task 3 documentation; Task 4 live assertion |
| Deduplicated logging | Task 1 `A → B → A` reporter test; Task 2 same-handler double invocation; Task 4 exactly-one live count |
| No secrets | Task 1 sentinel input; Task 2 hook sentinel; Task 4 production/source scan |
| Older host and unobservable-field compatibility | Task 1 invalid/absent matrix; Task 2 silent integration; Task 3 matrix; Task 4 absent-field process |
| Do not write host `3` or change either default | Global constraints; Task 2 non-mutation; Task 3 wording; Task 4 diff/live checks |
| Keep `task`-only scope; do not classify `execute` | Task 2 regression; Task 3 explicit documentation; `src/permissions/index.ts` no-diff gate |
| No schema change/generation | Global constraints; intentionally unchanged map; Task 4 schema no-diff check |
| Version compatibility without version parser | Task 3 commit-boundary documentation and shape-based tests; no dependency change |
| Tests, build, and real-surface QA | Task 4 uses a bounded PowerShell process helper for every host probe. A natural hook-ready declaration runs full-host explicit/absent QA. Only three timed-out zero-marker declarations permit the built-hook partial receipt, which is explicitly not complete host-loader verification. |
| One commit | Task 4 exact staging and single semantic commit boundary |
