# OpenCode CodeMode `execute` Compatibility Spike Implementation Plan

> **Status:** Implemented and verification-ready. This revision is authoritative for the eight-path compatibility-spike scope.

**Goal:** Produce isolated, sanitized evidence for OpenCode CodeMode `execute` compatibility without changing ocmm product behavior or terminating processes by historical PID.

**Architecture:** The runner creates one parent temp root and one or two attempt roots. `runCommand()` owns each live direct child and is the only layer permitted to force-stop that object before `close`. Attempt-local MCP/wrapper fixtures watch `pid/stop`; outer cleanup writes stop signals, observes recorded PIDs, and removes roots only after every ledger is complete and every recorded PID is gone.

**Runtime:** Node.js TypeScript strip-types, dependency-free fixture processes, OpenCode CLI, native `ocmm-lsp` artifacts.

---

## Exact Scope

| Path | Responsibility |
|---|---|
| `docs/superpowers/specs/2026-07-20-codemode-execute-compatibility-design.md` | Authoritative behavior and evidence contract. |
| `docs/superpowers/plans/2026-07-20-codemode-execute-compatibility.md` | Current implementation and verification plan. |
| `scripts/codemode-execute-compatibility.ts` | Runner, CLI, normalization, cleanup, sanitization. |
| `scripts/codemode-execute-compatibility.test.ts` | Mutation-resistant unit/integration harness. |
| `scripts/fixtures/codemode-execute-probe-mcp.mjs` | Deterministic stdio MCP and stop-signal participant. |
| `scripts/fixtures/codemode-execute-hook-trace-plugin.mjs` | Redacted hook-shape trace plugin. |
| `scripts/fixtures/codemode-execute-process-wrapper.mjs` | Owned native-LSP wrapper and stop-signal participant. |
| `scripts/fixtures/opencode-codemode-execute-compatibility.json` | Sanitized live or structured-SKIP fixture. |

Do not modify `src/**`, prompts, skills, schema, product configuration, package metadata, lockfiles, or planning-logical-tiers documents. Do not install software or perform Git writes.

---

## Stable Runner Interfaces

Keep `ProbeStatus`, `XdgState`, and `NormalizedFacts` stable. Export and test:

```ts
type AttemptPidLedger = { host: number[]; wrapper: number[]; fixture: number[]; native: number[] }
type AttemptCleanupEvidence = {
  pidLedgerComplete: boolean
  trackedPids: number
  remainingPids: number
  terminationAttempted: boolean
  removalAttempted: boolean
  removalFailed: boolean
  rootRemoved: boolean
}
type AttemptRecord = {
  id: "attempt-1" | "attempt-2"
  rootPath: string
  pids: AttemptPidLedger
  facts: Omit<NormalizedFacts, "cleanup">
  cleanup: AttemptCleanupEvidence
}
type CliOptions = {
  providerConfig: string | null
  model: string | null
  fixtureOut: string
  opencode: string
  timeoutMs: number
}
type LiveProbeOptions = CliOptions & { providerConfig: string; model: string }
type CommandOptions = { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; input?: string }
type CommandResult = {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  pid: number | null
}
type RunAttemptContext = {
  id: "attempt-1" | "attempt-2"
  rootPath: string
  options: LiveProbeOptions
  runCommand?: typeof runCommand
  nativeLspPath?: string
}
type RunAttemptFn = (context: RunAttemptContext) => Promise<AttemptRecord>
type TopologyCleanupResult = {
  attempts: AttemptRecord[]
  aggregate: NormalizedFacts["cleanup"]
  residualRoots: string[]
}
type ProbeDependencies = {
  removeRoot?: (path: string) => void
  runAttempt?: RunAttemptFn
  runCommand?: typeof runCommand
  writeFixture?: (path: string, contents: string) => void
  writeStdout?: (text: string) => void
  writeStderr?: (text: string) => void
}
```

Required functions include `parseCliOptions`, `classifyXdgPaths`, `parseHookTrace`, `parseHostSignals`, `runCommand`, `readAttemptPidLedger`, `runAttempt`, `runAttemptSequence`, `cleanupRunTopology`, `deniedToolVisible`, `buildProbeCode`, `buildDirectLspSmokeCommand`, `parseDirectLspToolsList`, `hashOpenCodeExecutable`, `runProbe`, and `runCli`.

---

## Evidence Contracts

### CodeMode search

OpenCode `1.18.3` accepts `tools.$codemode.search({ query?, namespace?, limit?, offset? })` and returns `{ items, remaining, next }`. The exact probe is:

```js
const denied = await tools.$codemode.search({ query: "codemode_probe.denied", limit: 50 })
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
}
```

OpenCode `1.18.3` maps tool descriptions through `toolExpression`, so the query remains `codemode_probe.denied` but the returned exact catalog path is `tools.codemode_probe.denied`. `deniedToolVisible()` mirrors that exact `{ items[].path }` contract for deterministic tests. The unprefixed path and array-style search results are rejected.

### Exact identity argument

The MCP `identity` input schema uses a fixed `const` marker. A call succeeds only when `message.params.arguments.marker === "OCMM_CODEMODE_EXECUTE_PROBE"`. Wrong or missing values return JSON-RPC `-32602` and never emit the success marker. Event files contain only safe event labels and never marker values.

### Hook trace

The before hook supports both:

1. official host shape: first parameter `{ tool, sessionID, callID }`, second parameter `{ args }`;
2. compatibility shape: first parameter also carries `args`.

Second-parameter args take precedence. Only sorted argument-key names are written. `tool` may be `null`; parsing maps it to `unusable_tool_identity`, preserving classifiability while exact-count classification returns deterministic `FAIL` rather than `DEFER`.

`buildProbeCode()` is the single source of the exact program bytes and `buildProbePrompt()` embeds that value byte-for-byte. The runner computes its SHA-256 and passes only that digest through child-only `OCMM_CODEMODE_EXPECTED_CODE_SHA256`. For the official execute-before args (second parameter first, first-parameter fallback), the trace plugin hashes string `code`, constant-compares the digest, and stores only a boolean—never code/hash/path.

The trace schema contains all six safe booleans:

```ts
safeMarkers: {
  exactCode: boolean
  executeProbe: boolean
  deniedHidden: boolean
  lspOk: boolean
  identityOk: boolean
  hookPayloadOk: boolean
}
```

Parser authority is outer-only and phase-specific. Only `phase="before", tool="execute"` may establish `exactCode`. Only `phase="after", tool="execute"` may establish `executeProbe`, `deniedHidden`, `lspOk`, `identityOk`, and `hookPayloadOk`. Nested before/after rows retain normalized tool identities and statuses but their `safeMarkers` never satisfy outer PASS evidence.

### Trusted host signals

`permissionBlocked`, `featureUnsupported`, and `activationAmbiguous` are derived only from:

- structured `--format json` events with `type: "error"`; and
- recognizable host error/fatal/permission/execute/CodeMode stderr lines.

Stdout `text`/`reasoning` event prose is never host evidence. JSON event classification recognizes `step_start`, `tool_use`, `text`, `reasoning`, `step_finish`, and `error`, requiring `part` for non-error events and `error` for error events.

A nonzero provider-run exit does not force unclassifiable output when trusted `activationAmbiguous`, `featureUnsupported`, or `permissionBlocked` evidence exists. `featureUnsupported` accepts only explicit execute-itself forms: `unknown tool: execute`, `tool execute is unsupported`, and `execute tool is not available` (case-insensitive, with optional quoting around `execute`). It rejects nested/child failures such as `execute failed because nested tool lsp_status is not available` and `execute child ... unsupported`; those nonzero empty-stdout runs remain `DEFER/unclassifiable-output` unless another precise reason exists. With empty stdout, trusted activation remains `DEFER/codemode-activation-ambiguous`, precise trusted unsupported evidence remains `SKIP/codemode-unsupported-by-host`, and trusted permission evidence retains its higher-priority `DEFER/permission-blocked`; all are ineligible for retry. Non-empty malformed stdout still fails closed.

### Retry eligibility

`attempt-2` is created only when attempt 1 has:

- `xdgState === "isolated"`;
- ocmm loaded from the isolated project config;
- both `lsp` and `codemode_probe` connected;
- classifiable output;
- no timeout, permission, unsupported, or activation-ambiguity signal; and
- zero outer `execute` before and after events.

Unknown/escaped XDG or any registration failure forbids retry. `modelDeclinedTwice` requires exactly two attempts that both satisfy the same clean-refusal predicate. No third attempt exists.

### Attempt isolation barriers

Parse the caller file as strict JSON and require a non-empty `provider` object with the selected `provider/model` explicitly declared. Missing, empty, array, malformed or truncated JSON, undeclared models, missing explicit SDK identity, and non-bundled SDK routes are `SKIP/provider-config-unavailable` and execute no host command. For the pinned OpenCode `1.18.3` contract, validate every provider-level `npm` and per-model `provider.npm` effective route against exactly: `@ai-sdk/amazon-bedrock`, `@ai-sdk/amazon-bedrock/mantle`, `@ai-sdk/anthropic`, `@ai-sdk/azure`, `@ai-sdk/google`, `@ai-sdk/google-vertex`, `@ai-sdk/google-vertex/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, `@openrouter/ai-sdk-provider`, `@ai-sdk/xai`, `@ai-sdk/mistral`, `@ai-sdk/groq`, `@ai-sdk/deepinfra`, `@ai-sdk/cerebras`, `@ai-sdk/cohere`, `@ai-sdk/gateway`, `@ai-sdk/togetherai`, `@ai-sdk/perplexity`, `@ai-sdk/vercel`, `@ai-sdk/alibaba`, `gitlab-ai-provider`, `@ai-sdk/github-copilot`, and `venice-ai-sdk-provider`. Reject dynamic package names and `file://` routes before any host command so the caller config cannot reach OpenCode `1.18.3` `Npm.add()` or a local dynamic import. Construct a new attempt `opencode.json` from only a valid string `$schema`, the validated provider object, and valid string-array `enabled_providers` / `disabled_providers`. Force `share: "disabled"` and `autoupdate: false`; install exactly the built ocmm file plugin plus trace file plugin; install only local `codemode_probe` MCP; and replace permissions with the exact ordered map `task: deny`, `bash: deny`, `execute: allow`, `lsp_*: allow`, `codemode_probe_*: allow`, `codemode_probe_denied: deny`. Discard inherited plugins/MCPs/permissions/instructions/skills/references/agents/commands/share and arbitrary top-level keys. The harness never installs or provisions a provider SDK.

Construct each child environment from a copy and remove inherited `HOME`, `USERPROFILE`, `OPENCODE_CONFIG`, `OPENCODE_CONFIG_CONTENT`, `OPENCODE_CONFIG_DIR`, `OPENCODE_PERMISSION`, `OPENCODE_DISABLE_PROJECT_CONFIG`, `OPENCODE_PURE`, `OPENCODE_PLUGIN_META_FILE`, `OPENCODE_AUTO_SHARE`, `OPENCODE_TEST_HOME`, `OPENCODE_TEST_MANAGED_CONFIG_DIR`, `OCMM_FAST`, `OCMM_PROFILE`, and `OCMM_NO_PROFILE` with case-insensitive key comparison. Then set canonical `HOME`, `USERPROFILE`, and `OPENCODE_TEST_HOME` to the attempt root; set `OPENCODE_TEST_MANAGED_CONFIG_DIR` to a pre-created empty `<attemptRoot>/managed-config`; set `OPENCODE_CONFIG` to exactly `<attemptRoot>/opencode.json`; and set `OPENCODE_DISABLE_PROJECT_CONFIG="1"`. `OPENCODE_CONFIG_CONTENT` and `OPENCODE_CONFIG_DIR` remain absent. Set all four XDG roots inside the attempt. This blocks parent/ancestor/home/test-home and Windows `ProgramData` managed config, `.opencode`, `AGENTS.md`, instruction/plugin injection, permission/pure/share/routing overrides without generically deleting provider credential/model variables. The input environment object remains unchanged.

`runAttempt()` executes only this gated sequence:

1. `opencode --version`; return the complete partial attempt immediately unless exit is `0`, timeout is false, stdout is exactly one strict semantic version, and that version equals the pinned supported contract `1.18.3`. Reject another otherwise-valid version, core/numeric-prerelease leading zeroes, empty prerelease/build identifiers, and invalid identifier characters. No debug-path/config/MCP/provider command runs after nonzero, timeout, unsupported-version, malformed, or version-shaped-invalid output;
2. `opencode debug paths`; parse immediately and return unless output is classifiable and `xdgState === "isolated"`;
3. `opencode debug config`; count every `[ocmm] config loaded:` marker and require the total to be exactly one; that unique line must exactly equal `[ocmm] config loaded: project=<attemptRoot>/.opencode/ocmm.jsonc, user=<none>` before starting MCP processes. Zero markers, duplicate correct markers, correct mixed with wrong-root/user/malformed markers, split markers, another root, or any user config fail the barrier. `ocmmLoaded` may still record that one or more markers were observed, but `isolatedProjectConfig` is false unless the unique-marker rule passes;
4. `opencode mcp list`; strip ANSI/glyph prefixes and anchor the full normalized line to exactly one server plus one allowed status. Require exactly one `lsp connected` row plus exactly one `codemode_probe connected` row before a provider/model call—`not connected`, failed, duplicate, mixed, same-line multi-status, trailing-junk, or cross-line status text fails the barrier, while `● lsp connected` passes;
5. only then run `opencode run --format json ... --model ...`.

Every early return preserves all command PIDs and raw outputs already produced. Escaped, partial, missing, timed-out, or otherwise unproved XDG never reaches config, MCP, or provider/model execution. Missing config markers never reach MCP/model execution. Missing MCP connections never reach the model.

### Parent preflight gate

`runProbe()` calls `runAttemptSequence()` only after successful non-timeout version output exactly equal to `1.18.3`, resolved executable target plus valid SHA-256, successful valid Git revision, successful dirty-state command, all build artifacts, and strict successful direct-native LSP smoke. A different valid host version is outside the pinned no-install proof, creates zero attempts, and remains `DEFER/unclassifiable-output`. Locator/direct timeout is `host-command-timeout`; malformed Git evidence is `unclassifiable-output`; missing build/hash and failed/malformed smoke retain their structured reason. Every failed gate creates zero attempt roots/model calls and cannot retry. Only the clean gate invokes the injected/default `runAttempt`.

### Direct native LSP smoke

The live preflight uses `buildDirectLspSmokeCommand(nativeLsp)` and invokes exactly `<resolved-native-lsp> mcp` with the `tools/list` JSON line on stdin. It never invokes `node dist/cli/ocmm-lsp.js mcp`; therefore `runCommand()` directly owns the native process on timeout. `parseDirectLspToolsList()` accepts only one JSON object with `jsonrpc === "2.0"`, `id === 1`, no `error`, `result.tools` as objects with string names, and all eight current canonical names including `find_symbol_related`; missing/`1.0` versions, name-containing prose, wrong IDs, errors, malformed tools, and missing names fail. The generated TypeScript wrapper remains a required build artifact and is smoke-tested separately during the Task 5 isolated build verification.

### OpenCode executable hash

When `where.exe` returns a direct regular executable with no sibling `.shim`, hash that file. If a sibling Scoop `.shim` exists, path parsing, absolute target resolution, regular-file validation, and target hashing must all succeed; malformed/relative/missing targets return `null` and never fall back to shim executable bytes. Serialize only the SHA-256 value, never either path.

### Structured internal errors

Malformed CLI arguments remain the generic `runCli` exit-3 catch. After `runRoot` exists, internal/preflight/live exceptions set `outputClassifiable: false`, proceed through the sole cleanup, write a sanitized fixture, emit exactly one normal result line, and normally classify `DEFER/unclassifiable-output`. Raw exceptions are never serialized.

After cleanup and sanitization, finalization calls the injectable/default fixture writer exactly once for the requested path. If its parent-directory creation or file write fails, no result line has yet been printed and no raw error/requested path is serialized. A non-FAIL result is regenerated as `DEFER/fixture-write-failed`; an existing `FAIL`, especially `cleanup-incomplete`, retains its status/reason. The finalizer then tries the default repository fixture when it differs from the primary, followed by `ocmm-codemode-execute-compatibility-fallback-<runner-pid>.json` directly under the approved OpenCode temp parent. It prints one normal result line only after a candidate succeeds, using that actual resolved path. If every durable location fails, stdout remains empty because no truthful receipt path exists; emit only `OCMM_CODEMODE_FIXTURE_UNAVAILABLE=<status>:<reason>` to stderr and preserve the classified exit (`4` for the finalization DEFER or `2` for an existing FAIL). Malformed CLI parsing remains the only ordinary pre-runRoot generic exit `3`.

### Secret rejection

Whitelist serialization rejects credentials/paths/IDs plus the common secret prefixes `sk-`, `ghp_`, `AKIA`, `xoxb-`, `xoxp-`, `xoxa-`, `xoxr-`, and `xoxs-`. Fallback replaces rejected string values with exactly `redacted`, sets `secretsAbsent: false`, and writes `FAIL/sanitized-evidence-leak`. The approved key `deniedCalled` is accepted; bare `call` is not a leak pattern.

---

## Process Ownership and Cleanup

### `runCommand`

- Capture stdout/stderr with a 16 MiB bound each.
- Apply a hard timeout.
- Cache the process exit code on `exit`, but resolve both normal and timed-out commands only after `close` has drained stdout/stderr. A real inherited-handle regression requires a detached descendant's safe marker emitted about 1.2 seconds after parent exit to be present in the result.
- Own the spawned `Child` object until `close`; spawn errors also wait for `close` and have the same bounded close fallback.
- If `close` never arrives, the existing bounded 2.5-second fallback may resolve safely with the cached exit code while preserving the output bound.
- On timeout, terminate only while neither `exit` nor `close` has been observed for that direct child.
- On timeout, write the attempt-local `OCMM_CODEMODE_STOP_PATH` first and briefly wait for stop-aware MCP/wrapper descendants to terminate and reap their own direct children. Then, only if the host command has emitted neither `exit` nor `close`, use its owned `Child.kill()` as the bounded fallback. Once `exit` is observed, never call `Child.kill()` even if a descendant still holds inherited output pipes; keep waiting for `close` or the bounded close fallback. Do not launch `taskkill` or target a recorded PID.
- Never later use a recorded PID to terminate the command or a possibly reused process.

### Attempt stop signal

Every attempt has private `pid/stop`:

- MCP fixture polls only `OCMM_CODEMODE_STOP_PATH`, emits safe `stopped`, and exits.
- Process wrapper installs ownership handlers before appending its ledger row. It polls the same stop path, sends termination through its owned native `Child`, applies a bounded direct-child fallback, reaps the child, then exits. If ledger append fails after spawn, it immediately runs that same owned-child stop/reap path and exits nonzero.
- Neither stop path nor any PID is serialized in the checked fixture.

### PID ledgers

- Host PIDs are in-memory evidence after `runCommand` has awaited them.
- MCP appends `{ fixturePid }` rows to `pid/fixture.jsonl`.
- Wrapper appends `{ wrapperPid, nativePid }` rows to `pid/lsp.jsonl`.
- Parsing continues after malformed lines, retains every valid row in encounter order, deduplicates valid PIDs, and marks the ledger incomplete. Existence/read races, unreadable files, directories in place of files, and other read failures are incomplete evidence rather than thrown cleanup errors.

### Outer cleanup

`cleanupRunTopology()`:

1. refreshes every attempt ledger without discarding valid rows;
2. writes each attempt-local stop signal;
3. observes the union of parent/host/wrapper/fixture/native PIDs until the bounded deadline; only `ESRCH` proves absence, while permission or unknown probe errors fail closed as still alive/unobservable;
4. never calls `taskkill`, `process.kill(..., signal)`, or another PID-directed termination API;
5. if any ledger is incomplete or any PID remains alive, performs no child/parent deletion and returns residual roots;
6. otherwise deletes `attempt-2`, `attempt-1`, then parent, capturing every deletion error even when a later parent deletion removes a failed child.

Any incomplete ledger, surviving PID, removal error, or residual root is `FAIL/cleanup-incomplete` and exit `2` with a safe fixture/result line. A live unrelated sentinel in historical host evidence must survive cleanup; tests stop that owned sentinel afterward through its direct `Child` handle.

---

## CLI and Outcome Rules

- Supported arguments only: `--provider-config`, `--model`, `--fixture-out`, `--opencode`, `--timeout-ms`.
- Provider config must be absolute, strict JSON, readable, a regular file, and outside the repository.
- Model must be `provider/model`.
- Missing/invalid provider takes precedence over missing/invalid model.
- Early prerequisite paths still create and remove exactly one parent run root, write the fixture, emit exactly one result line, and return exit `3`.
- `runRoot` is created only under existing `$LOCALAPPDATA\Temp\opencode`.
- Cleanup safety precedes every compatibility classification.
- An observed escaped XDG is an early `FAIL`. Unknown XDG is classified after prerequisite, timeout, permission, unclassifiable-output, host, build, version/hash, and direct-native-smoke checks, but before ocmm/config/MCP registration failures, yielding `DEFER/xdg-unobserved` rather than a false plugin defect.
- PASS additionally requires `exactCode: true`; otherwise the deterministic result is `FAIL/execute-code-mismatch`, even when output markers and MCP events are otherwise forged. Neither code bytes nor expected/actual hashes are serialized.
- A requested fixture mkdir/write failure after successful cleanup becomes `DEFER/fixture-write-failed` and exit `4` at a safe fallback path. Fixture location failure never overrides an existing `FAIL`; cleanup failure remains `FAIL/cleanup-incomplete` and exit `2` while using fallback only for storage.
- `PASS` is exit `0`, `FAIL` exit `2`, `SKIP` exit `3`, and `DEFER` exit `4`; only `PASS` is GO.

The final line is exactly:

```text
OCMM_CODEMODE_RESULT=<PASS|FAIL|SKIP|DEFER>:<reason-code>:<resolved-fixture-path>
```

---

## Required Test Matrix

The harness must cover:

1. complete PASS facts and stable FAIL/SKIP/DEFER precedence;
2. provider/model fixture-backed SKIP and exact one result line;
3. XDG unknown/isolated/escaped classification;
4. official CodeMode query/items semantics and exact `tools.codemode_probe.denied` visible-item evaluation, rejecting the unprefixed path;
5. exact identity success plus wrong/missing marker JSON-RPC errors with no marker leakage;
6. official second-parameter and compatibility first-parameter before args, exact/wrong/missing code attestation, outer-phase-only safe-marker authority, nested marker forgery rejection, and no code/hash/value leakage;
7. null outer/nested tool identities producing deterministic FAIL reasons;
8. model prose ignored while structured error/host stderr produces trusted signals; explicit execute-itself unsupported forms are accepted while nested/child unsupported failures are rejected and remain unclassifiable; nonzero stderr-only trusted activation and precise unsupported evidence remain classifiable with exact `DEFER/codemode-activation-ambiguous` or `SKIP/codemode-unsupported-by-host`, and neither retries;
9. strict attempt barriers and retry rejection: nonzero/malformed attempt-local version runs no later command; escaped/unknown XDG never reaches config/MCP/run; zero, duplicate-correct, correct-plus-wrong/user/malformed, split, wrong-root, or user config markers never reach MCP/run; missing, failed, `not connected`, mixed, duplicate, cross-line, same-line multi-status, or trailing-junk MCP status never reaches run; glyph-prefixed exact connected rows pass; only fully isolated exact-count registration reaches the provider/model and only clean isolated refusal reaches two attempts;
10. hostile provider config retains only provider allowlist fields, validates provider-level and per-model SDK routes against the exact OpenCode `1.18.3` bundled map, forces sharing/update off, installs exactly two local plugins/one local MCP, and replaces permissions with the exact task/bash deny plus execute/LSP/probe allow map and denied-probe rule last;
11. native-direct LSP smoke command construction never references `dist/cli/ocmm-lsp.js`; strict JSON-RPC rejects missing/`1.0` versions plus prose/wrong-id/error/malformed/missing-tool envelopes and requires all eight canonical names;
12. Scoop shim target hash differs from shim bytes and is selected; malformed/relative/missing-target existing shims fail closed; no-shim direct regular-file hash works;
13. injected preflight locator timeout, Git failure, direct-smoke malformed/failure, and clean success prove model-attempt count is zero except on the clean path;
14. structured sanitized DEFER after injected preflight exception;
15. secret rejection for every required prefix while `deniedCalled` remains valid;
16. normal exit waits for `close` and drains late inherited descendant output; a timeout after direct-parent `exit` never calls `Child.kill()` while descendant-held output still drains; timeout requests cooperative stop, the wrapper reaps its owned native child, and the runner closes only its still-unexited owned direct host child with no taskkill helper;
17. MCP/wrapper stop-signal behavior, including wrapper watcher cleanup after native spawn failure and native reap after ledger-append failure; once MCP startup is attempted, missing fixture or LSP ownership rows mark the attempt incomplete even when the corresponding MCP never reaches `connected`, while pre-MCP exits still permit absent ledgers;
18. two attempts with eight owned stop-aware role processes, all dead before first deletion;
19. malformed or unreadable ledger retaining any valid rows, marking incomplete, and preserving roots;
20. live historical-host sentinel PID surviving outer cleanup plus EPERM PID-probe failure closing safely without deletion;
21. injected attempt deletion failure and CLI parent deletion failure preserving `cleanup-incomplete`;
22. unknown XDG with all registration booleans false remains `DEFER/xdg-unobserved`;
23. mixed-case poisoned HOME/USERPROFILE/test-home/managed-config and OpenCode/ocmm controls are replaced or removed; explicit config path, project-disable flag, HOME/USERPROFILE/test-home, empty managed config, and four XDG roots are attempt-local before the first host command without mutating input or clearing provider credentials; a live-like poisoned ancestor/home/config/plugin/instruction construction contributes no reference;
24. fail-once primary fixture writing and an actual existing-directory primary produce one `DEFER/fixture-write-failed` fallback receipt after successful cleanup, while the same location failure preserves an existing `FAIL/cleanup-incomplete`;
25. primary/default/temp writer exhaustion emits no false path-bearing receipt, uses fixed safe stderr only, and preserves DEFER exit `4` or existing cleanup FAIL exit `2` rather than generic exit `3`;
26. missing, empty, array, malformed/truncated JSON, undeclared selected model, missing explicit SDK identity, dynamic package, `file://`, and unsafe provider-level/per-model SDK routes create zero host commands/attempts and produce provider-unavailable SKIP;
27. attempt-local nonzero, timeout, another valid host version, malformed, core-leading-zero, numeric-prerelease-leading-zero, or empty-identifier version stops after exactly `--version`, while exactly `1.18.3` reaches the existing clean barrier path; parent preflight likewise creates zero attempts for every other version.

---

## Verification Commands

### RED/GREEN harness

```powershell
node --test --experimental-strip-types scripts/codemode-execute-compatibility.test.ts
if ($LASTEXITCODE -ne 0) { throw "compatibility harness failed" }
```

### Timeout/cleanup stress when process code changes

```powershell
foreach ($run in 1..3) {
  node --test --experimental-strip-types `
    --test-name-pattern="timeout|runCommand waits for close and drains inherited descendant output|runCommand never kills an exited child|two-attempt|malformed PID ledger|unreadable PID ledger|historical host PID|PID probe permission|stop signal|ownership ledger append|ledger failure|MCP startup missing ownership ledgers" `
    scripts/codemode-execute-compatibility.test.ts
  if ($LASTEXITCODE -ne 0) { throw "stress run $run failed" }
}
```

This review fix changes only the attempt-level ledger completeness boundary; it does not change `runCommand`, wrappers, or topology cleanup. The full harness and focused missing-ledger regression cover the changed input, while the previously recorded three-round process stress receipt remains applicable and need not be repeated.

### Focused current external-review blockers

```powershell
node --test --experimental-strip-types `
  --test-name-pattern="OpenCode 1.18.3 provider SDK routes|OpenCode config keeps only provider allowlist|poisoned parent environment|attempt-local environment and allowlisted config|provider preflight rejects|version as a hard barrier|runProbe starts model attempts" `
  scripts/codemode-execute-compatibility.test.ts
if ($LASTEXITCODE -ne 0) { throw "current external-review blocker tests failed" }
```

### Focused prior external-review blockers

```powershell
node --test --experimental-strip-types `
  --test-name-pattern="poisoned parent environment cannot override isolated child evidence|fixture write failure uses structured fallback and preserves cleanup FAIL|fixture write exhaustion preserves DEFER and cleanup FAIL exit codes|direct LSP smoke parser accepts only the strict canonical JSON-RPC envelope" `
  scripts/codemode-execute-compatibility.test.ts
if ($LASTEXITCODE -ne 0) { throw "external-review blocker tests failed" }
```

### Focused 21-test compatibility QA

```powershell
node --test --experimental-strip-types `
  --test-name-pattern="exact execute code attestation is mandatory for PASS|probe prompt contains the exact one-call CodeMode program|CodeMode denied visibility uses official items/path search results|direct LSP smoke command owns the native binary directly|direct LSP smoke parser accepts only the strict canonical JSON-RPC envelope|runProbe starts model attempts only after every preflight gate passes|nonzero trusted activation ambiguity remains classifiable and forbids retry|featureUnsupported matches only execute itself and trusted unsupported forbids retry|runCommand waits for close and drains inherited descendant output|runCommand never kills an exited child|safe result markers only from authoritative outer phases|OpenCode hashing fails closed for an existing invalid Scoop shim|OpenCode config keeps only provider allowlist|OpenCode 1.18.3 provider SDK routes|poisoned parent environment cannot override isolated child evidence|attempt-local environment and allowlisted config|provider preflight rejects|version as a hard barrier|trace exact-code attestation rejects wrong and missing execute code without leaking values|runAttempt config barrier requires exactly one correct ocmm marker|runAttempt MCP barrier rejects duplicate and cross-line statuses" `
  scripts/codemode-execute-compatibility.test.ts
if ($LASTEXITCODE -ne 0) { throw "final-blocker tests failed" }
```

### Typecheck

```powershell
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }
```

### Build only when live eligible

```powershell
$providerConfig = $env:OCMM_CODEMODE_PROVIDER_CONFIG
$providerModel = $env:OCMM_CODEMODE_MODEL
$liveEligible = -not [string]::IsNullOrWhiteSpace($providerConfig) -and
  -not [string]::IsNullOrWhiteSpace($providerModel)
if ($liveEligible) {
  pnpm run build
  if ($LASTEXITCODE -ne 0) { throw "build failed" }

  # Task 5 build/wrapper smoke is separate from the live native-direct preflight.
  $wrapperTools = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist\cli\ocmm-lsp.js mcp
  if ($LASTEXITCODE -ne 0 -or $wrapperTools -notmatch '"status"') { throw "built LSP wrapper smoke failed" }
}
```

### Real or structured-SKIP CLI

```powershell
$probeArgs = @("--fixture-out", "scripts/fixtures/opencode-codemode-execute-compatibility.json")
if (-not [string]::IsNullOrWhiteSpace($env:OCMM_CODEMODE_PROVIDER_CONFIG)) {
  $probeArgs += @("--provider-config", $env:OCMM_CODEMODE_PROVIDER_CONFIG)
}
if (-not [string]::IsNullOrWhiteSpace($env:OCMM_CODEMODE_MODEL)) {
  $probeArgs += @("--model", $env:OCMM_CODEMODE_MODEL)
}
node --experimental-strip-types scripts/codemode-execute-compatibility.ts @probeArgs
$probeExit = $LASTEXITCODE
if ($probeExit -notin @(0, 2, 3, 4)) { throw "unexpected probe exit: $probeExit" }
```

With neither environment variable, require exactly `SKIP:provider-config-unavailable`, exit `3`, `NO-DECISION`, unknown XDG, zero attempts/PIDs, successful parent removal, and no build. This checked fixture is not a live compatibility PASS.

### Fixture and residue checks

Validate the whitelist schema, status/reason/go-no-go consistency, cleanup aggregate, and leak regex including required secret prefixes. Require no task-owned Node process, no `taskkill.exe` helper, no stderr-reported run root, and no surviving disposable test root. Use only direct test-owned `Child` handles for emergency test cleanup.

### Scope and whitespace

```powershell
git diff --check
git status --short
```

For untracked task files, use `git diff --no-index --check -- NUL <path>` and accept exit `1` as “different with no whitespace diagnostics.” Confirm exactly the eight CodeMode paths plus the caller's unrelated two planning-logical-tiers documents, and no protected product/package path. The planning-logical-tiers files are explicitly out of scope and must remain untouched.

---

## Completion Receipt

Report the focused RED failures and final GREEN counts, full harness count (at least 69), typecheck exit, prior applicable timeout/close cleanup stress receipt (do not rerun when process code is unchanged), exact OpenCode `1.18.3` bundled-SDK no-install allowlist, test-home/empty-managed-config/provider-shape/version-barrier evidence, fixture-write fallback/exhaustion receipts, exact live/SKIP line and exit, fixture whitelist/leak results, process/root cleanup counts, documentation synchronization, eight-path scope, excluded planning-logical-tiers paths, and confirmation that no Git write occurred. A unit-test GREEN or structured SKIP is not a live compatibility PASS.

Current revision receipt: the historical RED was `0/5` for the original five-test blocker set, while the current external-review focused command is GREEN at `7/7`; focused compatibility QA is `21/21`. The missing-ledger review regression was RED at `0/1` under the old connected-only rule and is GREEN together with the pre-MCP control at `2/2`; the full harness is `69/69`; typecheck exits `0`. No caller provider/model is present, so build/provider execution is skipped and the real CLI emits exactly one `SKIP:provider-config-unavailable` receipt with exit `3`, zero cleanup-residue lines, sanitized fixture cleanup complete, and zero task-owned Node/`taskkill.exe` residue. This is NO DECISION, not PASS.
