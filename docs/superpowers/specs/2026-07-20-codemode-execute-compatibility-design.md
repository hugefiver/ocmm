# OpenCode CodeMode `execute` Compatibility Spike Design

**Date:** 2026-07-20
**Status:** Approved by self-review for planning
**Scope:** Evidence-first compatibility spike; no default product-behavior change

## Goal

Create a reproducible, isolated live-host probe that determines whether the installed OpenCode host can expose CodeMode `execute`, make ocmm-registered MCP tools visible inside it, preserve permissions, and deliver nested MCP calls to plugin `tool.execute.before` / `tool.execute.after` hooks with usable tool identities. The spike must produce an explicit `PASS`, `FAIL`, `SKIP`, or `DEFER` result and must not change ocmm product behavior by default.

## Known Facts and Discovery Evidence

### OpenCode / CodeMode

- The supported and observed host baseline is OpenCode `1.18.4` (`opencode --version`, observed 2026-07-22), pinned to upstream tag `v1.18.4` commit `49c69c5ed3ccf706b61b3febb43c8aaff7f8325e`.
- Upstream `packages/opencode/src/tool/code-mode.ts` defines the outer tool ID as `execute`, accepts `{ code: string }`, and describes it as a confined orchestration script with access to connected MCP tools.
- Upstream `packages/opencode/src/effect/runtime-flags.ts` gates the tool with `OPENCODE_EXPERIMENTAL_CODE_MODE`; the broad `OPENCODE_EXPERIMENTAL` flag is only a fallback when the direct flag is unset. The probe will set the direct flag and set the broad flag to false.
- Upstream `packages/opencode/src/tool/code-mode.ts` explicitly triggers `tool.execute.before` and `tool.execute.after` around each nested MCP call. The nested hook input uses the flattened MCP key such as `lsp_status`; the CodeMode program uses the namespaced path such as `tools.lsp.status({})`.
- CodeMode visibility is permission-filtered. A hard-denied MCP tool must not appear in the CodeMode catalog.
- OpenCode `1.18.4` exposes `tools.$codemode.search({ query?, namespace?, limit?, offset? })` and returns `{ items, remaining, next }`; visibility checks must inspect the exact `item.path`, not treat the result as an array.
- OpenCode `1.18.4` calls `tool.execute.before` with identity in the first argument and mutable `{ args }` in the second argument. The trace fixture also supports the compatibility shape where `input.args` carries arguments, preferring second-argument keys without recording values.
- OpenCode `1.18.4` resolves `Global.Path.home` from `OPENCODE_TEST_HOME` before `HOME`/`USERPROFILE` and honors `OPENCODE_TEST_MANAGED_CONFIG_DIR` for managed configuration (otherwise Windows can use `ProgramData`). Both test controls therefore require explicit attempt-local values rather than mere HOME/XDG isolation.
- OpenCode `1.18.4` calls `Npm.add()` for a selected model SDK unless its effective `model.provider.npm ?? provider.npm` is a key in that version's finite `BUNDLED_PROVIDERS` map. The supported no-install keys are exactly `@ai-sdk/amazon-bedrock`, `@ai-sdk/amazon-bedrock/mantle`, `@ai-sdk/anthropic`, `@ai-sdk/azure`, `@ai-sdk/google`, `@ai-sdk/google-vertex`, `@ai-sdk/google-vertex/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, `@openrouter/ai-sdk-provider`, `@ai-sdk/xai`, `@ai-sdk/mistral`, `@ai-sdk/groq`, `@ai-sdk/deepinfra`, `@ai-sdk/cerebras`, `@ai-sdk/cohere`, `@ai-sdk/gateway`, `@ai-sdk/togetherai`, `@ai-sdk/perplexity`, `@ai-sdk/vercel`, `@ai-sdk/alibaba`, `gitlab-ai-provider`, `@ai-sdk/github-copilot`, and `venice-ai-sdk-provider`. The unchanged 24-item map is owned by `OPENCODE_1_18_4_BUNDLED_PROVIDER_NPM_IDS`; dynamic package names and `file://` SDK routes are outside this spike.
- Provider-run stdout is a strict six-event JSONL surface: `tool_use`, `step_start`, `step_finish`, `text`, and `reasoning` require a record-valued `part`; `error` requires an `error` property; every row requires finite numeric `timestamp` and non-empty string `sessionID`. Empty, malformed, unknown, or wrong-shape output fails closed as unclassifiable. Independently of parse success, PASS requires non-null aggregate facts with a positive event count, event-type length equal to that count, non-error plus error counts equal to it, and exactly zero error events; a missing or inconsistent aggregate is `FAIL/provider-run-jsonl-invalid`.
- Nested plugin hooks and completed CodeMode metadata are separate authorities. Nested before/after hooks are exactly `lsp_status`, `codemode_probe_identity`, and `codemode_probe_json_error`. Completed metadata is exactly `$codemode_search`, `lsp_status`, `codemode_probe_identity`, and `codemode_probe_json_error`; `$codemode_search` is metadata-only and must never be invented as a nested hook row.
- CodeMode is not bash, a task/subagent dispatcher, or a general JavaScript runtime.

Upstream source is supporting evidence only. The go/no-go decision comes from the isolated live-host run because installed versions and payload shapes can differ from current upstream.

### ocmm

- `src/index.ts:172-175` wires `tool.execute.before` to `permissionGuards.before` and composes all after handlers under `tool.execute.after`.
- `src/hooks/config.ts:1108-1120` registers resolved MCP servers into the actual OpenCode `mcp` configuration.
- `src/mcp/index.ts:63-102` enables the built-in `lsp` MCP by default; `resolveOcmmLspCommand()` resolves its command and honors `OCMM_LSP_COMMAND`.
- `src/mcp/index.ts:269-305` resolves the LSP server from an environment override, packaged binaries, build outputs, Cargo, or PATH.
- `src/permissions/index.ts:1331-1350` accepts tool identity from `toolID`, `toolId`, `toolName`, `name`, a string `tool`, or object-valued `tool.name/id/key`.
- `src/permissions/index.ts:603-632` applies the subagent-depth guard only when `toolName(rawInput) === "task"`. `execute` must remain outside depth accounting.
- `AGENTS.md:141-304` requires live OpenCode tests to use isolated XDG config/data/state/cache directories, capture `opencode debug paths`, avoid persistent credentials, and clean up afterward.
- No existing checked-in live integration script covers CodeMode. The reusable assets are the AGENTS.md isolation/host commands, the native LSP `tools/list` smoke command, and the sanitized live-derived fixture pattern in `src/runtime-fallback/fixtures/opencode-task-interruption.json`.

## Approaches Considered

### 1. One-off manual OpenCode session

Run `opencode run` with the feature flag and inspect terminal output by hand.

**Advantages:** Minimal implementation effort.

**Rejected because:** It cannot reliably prove XDG isolation, exact nested tool identities, before/after hook symmetry, permission filtering, cleanup, or absence of secrets. Model prose could be mistaken for evidence.

### 2. Checked-in probe harness with ephemeral live state and a sanitized fixture — selected

Add a dependency-free TypeScript runner plus three small fixtures: a deterministic local MCP server, a hook-trace plugin, and a process wrapper for the native LSP MCP. The runner creates one parent run root with `attempt-1` and optional `attempt-2` child roots. Each attempt returns its root, role-separated host/wrapper/fixture/native PID ledger, observations, and pre-cleanup evidence. Each attempt has a private stop signal watched by the MCP fixture and wrapper; outer cleanup signals cooperative shutdown and observes recorded PIDs but never sends a signal to a historical PID. Failed aggregate cleanup is itself structured evidence.

**Advantages:** Reproducible, version-labelled, real-host evidence; deterministic PASS/FAIL rules; no provider credentials or raw session data enter the repository; no product behavior changes.

**Trade-off:** A real model/provider configuration is still required to make the outer `execute` call. A missing provider config or model produces a sanitized `SKIP` fixture plus the normal `OCMM_CODEMODE_RESULT` line; timeout, permission blockage, or unclassifiable host output produces `DEFER`. Passing harness unit tests proves only that the classifier and cleanup machinery work and must never be reported as live compatibility `PASS`.

### 3. Add diagnostic logging inside ocmm product hooks

Instrument `src/index.ts` or `src/permissions/index.ts` to log every hook payload.

**Rejected because:** It changes product behavior before a defect exists, risks logging sensitive arguments, and makes the spike itself alter the surface under test.

## Architecture

The spike has two layers:

1. **Checked-in deterministic harness and fixtures.** These provide a local MCP with known tools, a trace-only OpenCode plugin that records redacted hook envelopes, a PID-tracking process wrapper for LSP, pure evidence classification, and unit tests.
2. **Ephemeral live-host run.** The runner projects a caller-supplied strict-JSON provider configuration through a provider-only top-level allowlist into each created attempt root, invokes the real OpenCode CLI, aggregates one or two attempt records, signals attempt-owned services to stop, then observes process/root cleanup. A malformed/incomplete PID ledger, surviving recorded PID, failed attempt-root deletion, or failed parent-root deletion produces `FAIL/cleanup-incomplete` without blindly terminating a potentially reused PID.

The harness does not patch ocmm. A live `FAIL` opens a separate, evidence-scoped remediation cycle; it does not authorize speculative changes within this spike.

## Components and File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/codemode-execute-compatibility.ts` | Create | Parent/attempt orchestration, role-separated PID ledgers, aggregate cleanup, isolated config construction, trace parsing, whitelist sanitization, classification, and fixture writing. |
| `scripts/codemode-execute-compatibility.test.ts` | Create | Unit tests for two-attempt topology/cleanup, tri-state XDG/status precedence, deterministic child/parent deletion failure, secret/path redaction, hook validation, fixture/result/exit routing, and determinism. |
| `scripts/fixtures/codemode-execute-probe-mcp.mjs` | Create | Dependency-free stdio MCP server exposing `identity`, `json_error`, and `denied`; strictly validates the fixed identity marker, appends one `{ fixturePid }` JSONL row, and exits on its attempt-local stop signal. |
| `scripts/fixtures/codemode-execute-hook-trace-plugin.mjs` | Create | Companion OpenCode plugin recording before/after phase, normalized tool ID, argument-key names, safe outer-result markers, and nested metadata status; never records argument values or full outputs. |
| `scripts/fixtures/codemode-execute-process-wrapper.mjs` | Create | Starts native `ocmm-lsp mcp`, installs ownership handlers, appends one `{ wrapperPid, nativePid }` JSONL row, forwards stdio, and on stop or ledger-write failure terminates and reaps only its owned direct native child. |
| `scripts/fixtures/opencode-codemode-execute-compatibility.json` | Generate | Sanitized live-derived host fixture containing only version, tri-state XDG observation, booleans/counts, reason code, normalized tool IDs/statuses, and cleanup outcome. |

No files under `src/**`, `prompts/**`, `skills/**`, `schema.json`, or product configuration are modified by the spike.

## Probe Fixture Contract

### Local MCP tools

The fixture MCP server is named `codemode_probe`, producing flattened host IDs such as `codemode_probe_identity` and CodeMode paths such as `tools.codemode_probe.identity`.

| Tool | Input | Output | Purpose |
|---|---|---|---|
| `identity` | `{ marker: "OCMM_CODEMODE_EXECUTE_PROBE" }` | Fixed text containing `OCMM_CODEMODE_EXECUTE_PROBE`; wrong/missing marker returns JSON-RPC `-32602` without the success marker | Prove nested transport and exact argument delivery. |
| `json_error` | `{}` | Fixed text `JSON parse error: OCMM_CODEMODE_HOOK_SENTINEL` | Provide a recognizable, non-secret child output and expose actual after-hook payload shape. No product mutation is assumed. |
| `denied` | `{}` | Fixed text that must never be observed | Prove hard-denied MCP tools are absent from the CodeMode catalog and are not called. |

The server writes JSONL events containing only `started`, `tools/list`, `tools/call:<name>`, and `stopped`; no arbitrary arguments are persisted.

### Hook trace plugin

For each hook, the companion plugin records only:

```ts
type HookTrace = {
  phase: "before" | "after"
  tool: string | null
  hasSessionID: boolean
  hasCallID: boolean
  argumentKeys: string[]
  nestedStatuses: Array<{ tool: string; status: "running" | "completed" | "error" }>
  safeMarkers: {
    exactCode: boolean
    executeProbe: boolean
    deniedHidden: boolean
    lspOk: boolean
    identityOk: boolean
    hookPayloadOk: boolean
  }
}
```

It never records session IDs, call IDs, argument values, expected/actual hashes, full tool output, provider data, environment variables, or absolute paths. `buildProbeCode()` is the single source of the exact program bytes. The runner passes only their SHA-256 through child-only `OCMM_CODEMODE_EXPECTED_CODE_SHA256`; the official before hook hashes the received string `code`, constant-compares the digest, and stores only `safeMarkers.exactCode`. Wrong or missing code therefore cannot be forged into PASS through output markers. Raw MCP event labels stay inside the disposable root; the sanitized fixture exposes only safe numeric keys `identityCount`, `jsonErrorCount`, and `deniedCount`.

### CodeMode program

The real-host prompt instructs the model to call `execute` exactly once with this exact program:

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

The model's final prose is not evidence. Permission/unsupported/activation signals come only from structured OpenCode `error` envelopes and recognizable host stderr error/log lines; stdout `text` events are excluded. Unsupported-host evidence is deliberately narrow and must identify `execute` itself: accepted forms are `unknown tool: execute`, `tool execute is unsupported`, and `execute tool is not available` (case-insensitive, with optional quoting around `execute`). A message such as `execute failed because nested tool lsp_status is not available` or `execute child ... unsupported` is not feature-unsupported evidence. The trace plugin, MCP event stream, non-prose OpenCode events, and process exit statuses are evidence.

## Isolated Data Flow

1. For a live model attempt, require successfully built `dist/index.js`, `dist/cli/ocmm-lsp.js`, and a Windows native LSP binary in the invocation source. The prerequisite-only provider/model `SKIP` path executes before build-artifact checks. When the main repository wrapper is missing/noncanonical or its build output is locked, the live transaction builds a disposable current-source tree with `pnpm --dir <temp-source> --config.verify-deps-before-run=false run build` rather than writing the main repository `dist`.
2. Accept optional `--provider-config` and `--model` arguments. If either is missing or unusable, skip host execution, construct a sanitized fixture with reason `provider-config-unavailable` or `model-unavailable`, print the normal result line, and exit `3`. A supplied provider file must be strict JSON, absolute, outside the repository, and contain a non-empty `provider` object with the selected provider/model declared. Truncated/malformed JSON, missing/empty/array entries, undeclared selected models, missing explicit SDK identities, and any provider-level or per-model `provider.npm` route outside the exact OpenCode `1.18.4` bundled map are `provider-config-unavailable` and execute no host command. Its content is never logged or copied into evidence.
3. Create one unique parent `runRoot` under `$env:LOCALAPPDATA\Temp\opencode`. The parent contains only `preflight/raw` plus child roots and has no shared attempt PID files. Before creating `attempt-1`, require every preflight gate: successful non-timeout version exactly `1.18.4`, resolved executable with valid target hash, successful valid Git revision, successful dirty-state command, all build artifacts, and successful non-timeout strict native-LSP JSON-RPC smoke. A different otherwise-valid host version is outside the pinned no-install contract, creates zero attempts, and remains `DEFER/unclassifiable-output`; timeout is `DEFER/host-command-timeout`; malformed Git output is unclassifiable; missing build/hash and failed smoke retain their structured reasons. A parent version mismatch stops before executable location/hash, Git evidence, artifact inspection, direct LSP smoke, attempt creation, and model invocation, while outer cleanup, classification, fixture fallback, and the single result line still complete. Every failure creates zero attempts/model calls. Only the clean path creates `attempt-1`; `attempt-2` remains the single permitted retry. Each created attempt has its own `.opencode`, four XDG directories, empty `managed-config`, `raw`, and `pid` directories.
4. For each attempt, construct a new `$attemptRoot\opencode.json` from a provider-only allowlist rather than merging arbitrary top-level input:
   - retain only a non-empty string `$schema`, the validated `provider` object, and valid string-array `enabled_providers` / `disabled_providers` values;
   - force `share: "disabled"` and `autoupdate: false`;
   - install exactly two local file plugins: built `dist/index.js` and the trace fixture; inherited npm/file plugins are discarded;
   - install only the local `codemode_probe` MCP at this stage (the ocmm plugin registers `lsp` later); inherited local/remote MCPs are discarded;
   - replace permissions with the exact ordered map `task: deny`, `bash: deny`, `execute: allow`, `lsp_*: allow`, `codemode_probe_*: allow`, and `codemode_probe_denied: deny` exactly last.
   All other top-level fields—including `instructions`, `skills`, `references`, `agent`, `command`, share/autoshare input, and arbitrary keys—are discarded. Provider entries are retained only after every configured model has a demonstrably bundled effective SDK and the selected provider/model is explicitly declared. Provider-level `npm` and per-model `provider.npm` values are validated against the exact OpenCode `1.18.4` map; missing, dynamic package, and `file://` routes fail before any host command. The probe never installs or provisions an SDK.
5. Write `$attemptRoot\.opencode\ocmm.jsonc` with `workflow: "v1"`, `debug: true`, and all required ocmm agents mapped to the supplied model.
6. Launch every OpenCode command with child-only environment values:
   - first remove inherited `HOME`, `USERPROFILE`, `OPENCODE_CONFIG`, `OPENCODE_CONFIG_CONTENT`, `OPENCODE_CONFIG_DIR`, `OPENCODE_PERMISSION`, `OPENCODE_DISABLE_PROJECT_CONFIG`, `OPENCODE_PURE`, `OPENCODE_PLUGIN_META_FILE`, `OPENCODE_AUTO_SHARE`, `OPENCODE_TEST_HOME`, `OPENCODE_TEST_MANAGED_CONFIG_DIR`, `OCMM_FAST`, `OCMM_PROFILE`, and `OCMM_NO_PROFILE` using case-insensitive key comparison (required by Windows environment semantics), so a poisoned parent cannot redirect home/config/plugin/managed-config discovery, override permissions, switch pure mode, auto-share evidence, or alter ocmm fast/model/profile routing; provider credential/model environment variables are retained rather than cleared generically;
   - then set `HOME`, `USERPROFILE`, and `OPENCODE_TEST_HOME` to the attempt root, set `OPENCODE_TEST_MANAGED_CONFIG_DIR` to the pre-created empty `$attemptRoot\managed-config`, set `OPENCODE_CONFIG` to exactly `$attemptRoot\opencode.json`, and set `OPENCODE_DISABLE_PROJECT_CONFIG=1`; keep `OPENCODE_CONFIG_CONTENT` and `OPENCODE_CONFIG_DIR` absent. These explicit values prevent ancestor/user/test-home/Windows `ProgramData` managed config, `.opencode`, `AGENTS.md`, and instruction sources from joining the attempt;
   - all four XDG variables pointing inside that attempt root;
   - set base attempt/barrier `OCMM_DEBUG=1`; only the provider `opencode run` command receives a copied environment with `OCMM_DEBUG=0` so plugin diagnostics cannot contaminate its strict JSONL stdout. Version, paths, config, and MCP barriers remain debug-enabled, which proves isolated registration before the provider call; hook and MCP evidence remain active during that call;
   - `OPENCODE_EXPERIMENTAL=false`;
   - `OPENCODE_EXPERIMENTAL_CODE_MODE=true`;
   - `OCMM_LSP_COMMAND` set to an exact JSON command using the PID-tracking wrapper and the built native LSP binary;
   - trace/event files, append-only `pid/fixture.jsonl` and `pid/lsp.jsonl` ledgers, private `pid/stop` signaling, and only the expected-code SHA-256 (never code bytes) inside that attempt child environment.
7. `runAttempt()` records every host command PID directly, tolerantly reads every valid `{ fixturePid }` and `{ wrapperPid, nativePid }` row while marking any malformed row incomplete, and returns an attempt record containing its absolute child root, four PID-role arrays, observations, and a pre-cleanup evidence slot. It never deletes or terminates resources.
8. Each attempt is a gated sequence, not an unconditional command list:
   - run `opencode --version` first and stop immediately unless it exits `0`, does not time out, stdout is one strict semantic version, and that version is exactly the supported no-install contract `1.18.4`. Core numeric identifiers and numeric prerelease identifiers cannot have leading zeroes, and prerelease/build identifiers cannot be empty or contain characters outside `[0-9A-Za-z-]`; failure, another valid version, or malformed/version-shaped-invalid output runs no debug-path/config/MCP/provider command and returns a non-passing partial attempt;
   - only after the version barrier run `opencode debug paths`, immediately classify all seven dynamic XDG labels, and stop the attempt before config/MCP/model work unless the result is classifiable and exactly `isolated`;
   - run `opencode debug config` only after that proof, count every `[ocmm] config loaded:` marker, and stop before MCP/model work unless the total is exactly one and that unique line identifies this attempt's own `.opencode/ocmm.jsonc` with `user=<none>`; duplicate correct markers, a correct marker mixed with wrong-root/user/malformed markers, split markers, another attempt/root, or a user config do not pass. Marker presence may set `ocmmLoaded`, but `isolatedProjectConfig` remains false unless the unique-marker rule passes;
   - run `opencode mcp list` next, strip only ANSI/glyph prefixes, anchor each normalized full line to exactly one known server plus one allowed status, and stop before the provider/model call unless there is exactly one `lsp connected` row and one `codemode_probe connected` row; failed, `not connected`, duplicate, mixed, same-line multi-status, trailing-junk, or cross-line status text does not pass; OpenCode `1.18.4` rows such as `● lsp connected` pass;
   - only after all three barriers run the real `opencode run --format json` provider/model call.
    A nonzero provider-run exit carrying trusted activation-ambiguity or precise unsupported-host evidence remains classifiable: stderr-only activation with empty stdout becomes `DEFER/codemode-activation-ambiguous`, while one of the three explicit execute-itself patterns becomes `SKIP/codemode-unsupported-by-host`; neither can retry. A nested-tool unavailable/unsupported failure is not this signal and therefore remains `DEFER/unclassifiable-output` unless another precise reason exists. Trusted permission evidence may likewise remain classifiable for its higher-priority `DEFER/permission-blocked` result. Non-empty malformed stdout still fails closed as unclassifiable. Every already-run host PID and raw output remains in the attempt record for outer cleanup. Unknown or escaped XDG can never reach provider/model execution.
9. The outer `finally` refreshes PID files for every returned attempt, writes each private stop signal, and waits boundedly for every recorded PID to disappear. It never sends a signal to a historical PID. Only when every ledger is complete and every recorded PID is gone may it remove `attempt-2`, `attempt-1`, and the parent. On timeout, `runCommand()` writes the same attempt-local stop signal first so MCP/wrapper descendants can self-exit through their owned `Child` handles, then boundedly terminates its direct `Child` only if neither `exit` nor `close` has been observed. Once `exit` is observed it never invokes `Child.kill()`, even when an inherited descendant still holds stdout/stderr open; it waits for `close` or the bounded close fallback instead. It never starts a PID-directed tree-kill helper.

The parent process environment is never mutated; child environments are constructed as copies, stripped of the exact home/test-home/managed-config/OpenCode/ocmm control list above, and then given explicit attempt-local config, HOME/USERPROFILE/test-home, empty managed config, XDG, and probe overrides.

## Real Host Commands

The runner CLI shape is below. The recorded migration invocation is the guarded disposable-source transaction in the 2026-07-22 migration plan: it supplies a temporary provider JSON, runs from that source, and uses that source's default fixture path. It must not be substituted with a main-repository build or fixture write:

```powershell
$providerConfig = $env:OCMM_CODEMODE_PROVIDER_CONFIG
$providerModel = $env:OCMM_CODEMODE_MODEL
$probeArgs = @()
if (-not [string]::IsNullOrWhiteSpace($providerConfig)) { $probeArgs += @("--provider-config", $providerConfig) }
if (-not [string]::IsNullOrWhiteSpace($providerModel)) { $probeArgs += @("--model", $providerModel) }

node --experimental-strip-types scripts/codemode-execute-compatibility.ts @probeArgs
$probeExit = $LASTEXITCODE
```

When provider and model prerequisites are available, the runner invokes these host commands internally with the isolated child environment and run-root working directory. Each arrow is a hard barrier; failure stops the attempt before the commands to its right:

```powershell
opencode --version
# require exit 0, no timeout, and exactly the pinned OpenCode 1.18.4 semantic version
opencode debug paths --print-logs --log-level DEBUG
# require classifiable xdgState === isolated
opencode debug config --print-logs --log-level DEBUG
# require ocmm loaded from the isolated project config
opencode mcp list --print-logs --log-level DEBUG
# require lsp and codemode_probe connected
opencode run --format json --print-logs --log-level DEBUG --model $providerModel --agent orchestrator $probePrompt
```

The live direct LSP smoke owns the already-resolved native executable directly; it does not run the TypeScript wrapper, so a timeout cannot orphan an untracked native descendant:

```powershell
'{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | & $nativeLsp mcp
```

The smoke parser accepts only one exact JSON object with `jsonrpc === "2.0"`, `id === 1`, no `error`, and `result.tools` as an array whose entries all have string `name`. It requires the exact eight-name multiset—`status`, `diagnostics`, `goto_definition`, `find_references`, `find_symbol_related`, `symbols`, `prepare_rename`, and `rename`—each exactly once. Missing/wrong protocol versions, arbitrary text containing those names, a wrong ID, an error envelope, malformed tool entries, a missing canonical tool, a duplicate, or an extra tool fail.

## Outcome Model

The runner uses stable exit codes:

| Exit | Status | Meaning |
|---:|---|---|
| `0` | `PASS` | All required compatibility assertions succeeded; go for the exact recorded host version/configuration only. |
| `2` | `FAIL` | An actual contract violation was observed. Any incomplete PID/removal aggregate is `cleanup-incomplete`; an actually observed outside XDG path is `xdg-isolation-failed`. Cleanup failure still writes the fixture/result line and prints any residue path. |
| `3` | `SKIP` | A prerequisite is absent, including provider config (`provider-config-unavailable`) or model (`model-unavailable`), or the host demonstrably lacks CodeMode. The CLI still writes a sanitized fixture and result line. No compatibility claim. |
| `4` | `DEFER` | Host execution timed out (`host-command-timeout`), permissions blocked it (`permission-blocked`), output could not be safely classified (`unclassifiable-output`), XDG remained unobserved after an otherwise classifiable run (`xdg-unobserved`), activation remained ambiguous, two otherwise completed/classifiable attempts omitted `execute`, or the requested fixture location could not be finalized and a safe fallback was used (`fixture-write-failed`). No compatibility claim. |

Classification evaluates incomplete PID/removal evidence first so cleanup failure always becomes `FAIL/cleanup-incomplete` rather than generic exit `3`. An actually observed `xdgState: "escaped"` is then `FAIL/xdg-isolation-failed`. For `xdgState: "unknown"`, prerequisite, timeout, permission, unclassifiable-output, host, build, version/hash, and direct-native-smoke results retain precedence; after those checks, `DEFER/xdg-unobserved` is returned before any registration failure. This preserves precise zero-attempt preflight failures. Only `"isolated"` may reach registration classification or PASS.

## PASS Criteria

`PASS` requires every item below:

1. `openCodeVersion` is a non-empty string and `openCodeSha256` is a non-empty SHA-256 value, recorded without the binary path. When `where.exe` returns a Scoop `opencode.exe` shim with a sibling `opencode.shim`, parsing, absolute target resolution, regular-file validation, and target hashing must all succeed; otherwise hashing fails closed and never falls back to shim bytes. With no sibling `.shim`, a direct regular executable is hashed directly.
2. `xdgState === "isolated"`: in every created attempt, `opencode debug paths` shows all seven dynamic labels—data, bin, log, repos, cache, config, and state—exactly once under that attempt root; only host-reported home/tmp may remain outside.
3. ocmm loads from built `dist/index.js`, its isolated project config is selected, and no user config path is reported.
4. `opencode mcp list` reports both `lsp` and `codemode_probe` connected.
5. Direct native-LSP `tools/list` passes the strict JSON-RPC envelope check and includes all eight current canonical tools; the preflight command is the resolved native executable plus `mcp`, not `node dist/cli/ocmm-lsp.js mcp`.
6. The outer hook trace contains exactly one `execute` before event and exactly one `execute` after event with argument key `code`. Parser authority is phase-specific: only `execute.before` may establish `exactCode`, and only `execute.after` may establish `executeProbe`, `deniedHidden`, `lspOk`, `identityOk`, and `hookPayloadOk`. Nested rows can establish identities/statuses but never outer PASS markers.
7. Nested plugin hooks and completed CodeMode metadata are separate authorities. PASS requires exactly one before and one after hook for each of `lsp_status`, `codemode_probe_identity`, and `codemode_probe_json_error`, each with a non-empty tool identity and call ID presence. PASS independently requires the completed metadata multiset to be exactly `$codemode_search`, `lsp_status`, `codemode_probe_identity`, and `codemode_probe_json_error`; `$codemode_search` is metadata-only and must not appear as a nested plugin hook. Any hook or completed-metadata multiset defect fails closed as `nested-hook-count-invalid`.
8. MCP events prove `identity` and `json_error` were called exactly once and `denied` was never called.
9. The outer safe result markers prove `deniedVisible === false`, LSP returned a value, and both fixed probe markers returned through CodeMode.
10. No `task` call is generated by the probe. No assertion, configuration, or product change treats `execute` as subagent depth.
11. `attemptCount` is 1 or 2; every attempt has a complete host/wrapper/fixture/native PID ledger; `trackedPids > 0`; all unique parent/attempt PIDs are dead before any deletion starts; `attemptRootsRemoved === attemptCount`; and the parent root is removed.
12. The sanitized fixture passes the repository secret/path scan.

PASS is scoped to the exact `openCodeVersion`, platform, feature flag, ocmm commit/worktree state, and provider/model recorded by the fixture. It must not be generalized to untested host versions.

## FAIL Criteria

Any actually observed contract violation is `FAIL`, including safety failures that occur before CodeMode invocation:

- `lsp` or `codemode_probe` is absent/disconnected or missing from CodeMode while direct MCP registration succeeds.
- A hard-denied tool is visible or called.
- The received `execute.code` is missing or differs byte-for-byte from `buildProbeCode()`; this is deterministic `FAIL/execute-code-mismatch` even when all output/MCP markers are otherwise forged.
- A required nested MCP call is missing or duplicated, does not reach exactly one event in both hook phases, has an empty/unusable identity, or phase identities do not match.
- A required nested call fails transport or result propagation.
- The hook trace or sanitized fixture contains argument values, credentials, IDs, or absolute paths.
- At least one actually observed dynamic XDG path escapes its attempt root (`xdgState: "escaped"`). Absence of path evidence is not this failure.
- Any attempt PID ledger is incomplete, any parent/attempt PID remains alive, any attempt root removal fails, the removed-attempt count differs from the created-attempt count, or the parent root cannot be removed.
- The harness reports success based only on model prose rather than traces/events.

## SKIP and DEFER Criteria

### SKIP

- OpenCode executable is missing.
- Provider config is missing, non-absolute, inside the repository, unreadable, truncated/malformed strict JSON, missing the selected provider/model, or contains any SDK route not explicitly bundled by OpenCode `1.18.4`: `provider-config-unavailable`. These checks occur before every host command, so dynamic package and `file://` SDK routes cannot reach `Npm.add()` or import.
- Model is missing or not a `provider/model` string: `model-unavailable`.
- Build artifacts required for ocmm/LSP are absent.
- With `OPENCODE_EXPERIMENTAL_CODE_MODE=true`, the host deterministically reports that `execute` is unsupported or unknown.

Every prerequisite `SKIP`, including invocation with neither provider argument nor model argument, writes the whitelist-only fixture with `xdgState: "unknown"`, prints exactly `` `OCMM_CODEMODE_RESULT=SKIP:${result.reasonCode}:${options.fixtureOut}` `` with a resolved fixture path, and exits `3`. Missing provider config has precedence over missing model.

### DEFER

- Any required host command reaches its hard timeout: `host-command-timeout`.
- Noninteractive permissions block the requested `execute` or nested MCP call: `permission-blocked`.
- OpenCode JSON/log/trace output cannot be normalized without guessing: `unclassifiable-output`.
- An otherwise classifiable run finishes without enough `debug paths` evidence to prove isolation or escape: `xdg-unobserved`.
- The host accepts the feature flag but tool exposure cannot be determined.
- A trusted structured error or host stderr line reports activation ambiguity, including with a nonzero provider-run exit: `codemode-activation-ambiguous`; this remains classifiable and never retries.
- The model fails to make the exact `execute` call on two fresh attempts only when both attempts prove isolated XDG, ocmm and isolated project registration, both MCP connections, classifiable output, no timeout/permission/unsupported/activation signal, and zero outer hook pair. Unknown/escaped XDG or any registration failure forbids retry. Timeout, permission blockage, and unclassifiable output must never be collapsed into `model-did-not-call-execute`.

Neither status is a pass. Both retain a structured reason code and the evidence that was actually established.

## Go / No-Go Decision

- **GO:** fixture status is `PASS`; compatibility may be claimed only for the recorded host version/platform/configuration.
- **NO-GO:** fixture status is `FAIL`; do not enable, advertise, or depend on the compatibility path.
- **NO DECISION:** fixture status is `SKIP` or `DEFER`; resolve the prerequisite or host ambiguity and rerun.

`FAIL/cleanup-incomplete` is a harness/environment safety failure: remove any stderr-reported residue, if present, and rerun. It is not evidence of an ocmm compatibility defect and does not open the product-fix gate.

## Product-Fix Gate

This spike does not modify product code. A product repair is allowed only when all conditions hold:

1. Two fresh isolated runs reproduce the same `FAIL` reason on the same host version.
2. The sanitized trace identifies the failing boundary as ocmm-owned rather than host feature absence, provider nondeterminism, or fixture error.
3. The captured payload can be replayed in a failing unit test before product code changes.
4. The repair is limited to the proven surface:
   - hook identity/payload adaptation: `src/permissions/index.ts` plus focused tests;
   - MCP registration/visibility: `src/hooks/config.ts` and/or `src/mcp/index.ts` plus focused tests.
5. A separate design/plan and commit boundary are created for the repair.

`execute` must never be added to subagent-depth accounting. A host version without CodeMode is not an ocmm defect and must not trigger a product patch.

## Error Handling and Cleanup

- Every child command has a hard timeout. Timeout with `xdgState: "unknown"` produces `DEFER`; it becomes XDG `FAIL` only if an outside path was actually observed, or cleanup `FAIL` if cleanup itself fails.
- Each attempt records every host command PID in memory, appends every fixture PID to `pid/fixture.jsonl`, and appends every wrapper/native pair to `pid/lsp.jsonl`. Parsing is incremental and tolerant: valid rows before and after malformed rows remain tracked, while any malformed/invalid row or ledger read failure marks the ledger incomplete without escaping cleanup.
- `runCommand()` owns its direct `Child`, caches the exit code on `exit`, and resolves both normal and timed-out commands only on `close`, after inherited stdout/stderr handles have drained. Its 16 MiB bound remains active through that close, so safe output emitted late by an inherited descendant is captured. A bounded close fallback handles a missing `close`, and spawn errors also wait for `close` with that safe fallback. On timeout it first writes `OCMM_CODEMODE_STOP_PATH`, waits briefly for stop-aware MCP/wrapper descendants to terminate and reap their own children, then applies a bounded direct-child fallback only while neither `exit` nor `close` has been observed. It never calls `Child.kill()` after `exit`, even if descendant-held pipes delay `close`. It does not launch `taskkill` or target any recorded PID.
- In the sole outer `finally`, cleanup writes `pid/stop` for every attempt. The MCP fixture exits; the wrapper terminates and reaps its owned native child. Outer cleanup only observes historical host/wrapper/fixture/native PIDs. Only an `ESRCH` liveness result proves absence; permission and unknown probe errors fail closed as alive/unobservable. If any ledger is incomplete or any PID remains at the deadline, no child or parent deletion begins and residual roots are reported. An unexpected cleanup exception is converted to incomplete/removal-failed aggregate evidence so the sanitized fixture and one result line are still emitted.
- Raw logs, generated provider-allowlisted attempt config, XDG state, API keys, session data, and PID files are confined to their attempt roots. They are deleted on successful aggregate cleanup; any failed child or parent deletion remains failure evidence even if a later parent deletion happens to remove the child.
- Only the sanitized fixture may remain in the repository. Its serializer constructs a new whitelist object; it never redacts by regex from a raw object.
- Before fixture write, reject strings matching common secret prefixes including `sk-`, `ghp_`, `AKIA`, and `xoxb-`/`xoxp-`/`xoxa-`/`xoxr-`/`xoxs-`, plus `apiKey`, `Authorization`, session/call ID prefixes, drive-root/UNC/POSIX absolute paths, or the external provider-config path. The approved `deniedCalled` key remains valid because bare `call` is not rejected.
- Scan only the whitelist candidate fixture, not internal normalized-field names. If that candidate fails, set `secretsAbsent: false`, replace rejected serialized string values with `redacted`, classify `FAIL/sanitized-evidence-leak`, and validate/serialize the safe replacement object. Never skip the structured failure fixture.
- `cleanupRunTopology()` catches each child/parent deletion exception and returns per-attempt plus aggregate evidence: attempt count, PID-ledger completeness, tracked/remaining PID counts, removed-attempt count, aggregate removal failure, and parent-root removal. On cleanup failure, the runner writes `FAIL/cleanup-incomplete`, prints every still-existing residual root, prints the normal result line, and exits `2`.
- The deterministic topology test creates two attempt roots with one owned stop-aware child in each host/wrapper/fixture/native role. It proves all eight self-exit before the first deletion, both child roots and the parent are absent, and any one injected child-root deletion error preserves aggregate `cleanup-incomplete` even if parent deletion later removes that child. Separate regressions prove malformed ledgers preserve all valid PIDs and roots, a live unrelated PID placed in historical host evidence is observed but never killed, and an MCP startup attempt with missing fixture or LSP ownership rows remains `cleanup-incomplete` even when connection registration fails. Pre-MCP exits remain distinguishable and may have no MCP ownership rows.
- Any internal/preflight/live exception after `runRoot` exists is normalized to safe facts (normally `DEFER/unclassifiable-output`), cleaned, sanitized, written with exactly one result line, and never serialized. Only malformed CLI parsing or failure before a run root exists uses the generic exit-3 catch.
- Fixture finalization occurs only after topology cleanup and sanitization. A primary parent-directory or file write failure is never serialized and never prints a premature result line. For non-FAIL outcomes it regenerates the whitelist fixture as `DEFER/fixture-write-failed`, tries the default repository fixture when different, then a deterministic evidence file under the approved OpenCode temp parent, and prints exactly one result line containing the actual successful fallback path. Any existing `FAIL`—especially `FAIL/cleanup-incomplete`—keeps its status/reason and uses fallback only as a location. Only the result line may contain that resolved fallback path; neither requested path nor raw write error enters the fixture. If all three durable locations fail, no truthful path-bearing receipt can be emitted: stdout remains empty, stderr emits only `OCMM_CODEMODE_FIXTURE_UNAVAILABLE=<status>:<reason>`, and the CLI preserves the already classified exit (`4` for `DEFER/fixture-write-failed`, `2` for an existing `FAIL`) rather than converting it to generic exit `3`.

## Testing Strategy

### Unit tests

- PASS requires every required fact.
- PASS requires non-empty host version/hash, `trackedPids > 0`, and exact count `1` for every required outer/nested hook and MCP call; zero or duplicate evidence fails.
- PASS independently rejects null, empty, count-inconsistent, or error-bearing provider-run JSONL facts as `FAIL/provider-run-jsonl-invalid`, even when every other evidence field is favorable.
- Each missing required nested tool/hook pair produces a named `FAIL` reason.
- Denied visibility/call produces `FAIL`.
- Missing provider config/model produces a fixture-backed `SKIP` and result line even before any live model call.
- Non-passing baselines prove timeout and unclassifiable output with `xdgState: "unknown"` each preserve their own `DEFER` reason; an actually observed `"escaped"` state overrides those to XDG `FAIL`.
- A deterministic throwing delete dependency proves cleanup failure produces a safe fixture/result, residue-path stderr, and exit `2`, not generic exit `3`.
- A deterministic retry sequence creates `attempt-1` and `attempt-2`, returns all four PID roles from each, and proves topology-wide reap-before-delete ordering plus aggregate failure from one injected child-root deletion error.
- Sanitization rejects credentials, IDs, absolute paths, and raw outputs.
- Sanitization explicitly rejects the `sk-`, `ghp_`, `AKIA`, and Slack `xox*-` prefix families while retaining the approved `deniedCalled` key.
- Sanitization output is deterministic for identical normalized facts.
- The trace plugin records key names and all six safe-marker booleans but not values or hashes. The parser accepts `exactCode` only from outer `execute.before`, accepts the five result markers only from outer `execute.after`, and ignores marker claims from nested rows while retaining nested identities/statuses. Tests independently cover exact/wrong/missing `execute.code`, nested marker forgery, authoritative outer positive markers, official second-parameter before args, first-parameter compatibility fallback, and null tool identity.
- The fixture MCP implements initialize, tools/list, exact identity-argument validation, tools/call, stop-signal exit, and clean stdio shutdown without external dependencies.
- The process wrapper records PIDs, forwards child exit status, proves stop-signal termination/reaping of its direct native child, clears its stop watcher when native spawn fails, and reaps the owned child if ledger append fails after spawn. The run-attempt integration regression drives that real append-failure path through the MCP barrier and proves missing ownership evidence prevents root deletion and classifies as `FAIL/cleanup-incomplete`.
- A long-lived wrapped child is timed out and killed; separate real process tests make a normally exiting parent leave a detached descendant holding inherited stdout/stderr, prove `runCommand()` waits roughly 1.2 seconds for `close`, capture the descendant's late safe marker, and prove a timeout occurring after the direct parent's `exit` never invokes `Child.kill()`. Separate topology assertions check every PID role, both attempt directories, and the parent directory outside the serialized fixture.
- Pure/integrated tests pin official CodeMode search `{ query, limit }` / `{ items }` semantics and the exact catalog path `tools.codemode_probe.denied`; the strict six-event JSONL envelope, load-bearing PASS aggregate, and malformed/unknown/wrong-shape rejection; centralized exact-code hashing/attestation; provider-only top-level config allowlisting plus the exact OpenCode `1.18.4` bundled SDK map and local plugin/MCP/permission maps; distinct three-hook and four-metadata multisets; host-signal exclusion of model prose, precise execute-itself unsupported patterns, nested-tool negative patterns, and nonzero activation/unsupported preservation; strict retry prerequisites; fail-closed Scoop shim target hashing; strict native-direct JSON-RPC exact-eight multiset parsing; zero-attempt preflight gates; pinned parent and attempt-local `1.18.4` version barriers; barrier command order including duplicate-correct and correct-plus-wrong/user config markers plus duplicate/cross-line/negative/mixed/same-line/trailing-junk MCP rows; unknown-XDG classification precedence; and structured fixture output after an injected internal preflight exception.
- Mixed-case poisoned-parent tests prove HOME/USERPROFILE/test-home plus all managed-config/OpenCode/ocmm config/plugin/permission/share/routing controls are replaced or removed, explicit config/project-disable/test-home, an empty attempt-local managed-config directory, and four XDG roots are local, provider credentials remain, and the input object is unchanged. A live-like deterministic construction with poisoned ancestor/home configs, plugin, and instructions proves none enters the child command/config. Provider-shape tests reject missing/empty objects, malformed and truncated JSON, undeclared models, missing SDK identity, dynamic packages, `file://` routes, and unsafe provider-level/per-model overrides without host execution. Strict native smoke tests reject missing and `1.0` JSON-RPC versions. Fixture finalization tests cover fail-once fallback, an actual existing-directory primary, and total primary/default/temp exhaustion: successful cleanup becomes or remains `DEFER/fixture-write-failed`/exit `4`, while injected cleanup failure remains `FAIL/cleanup-incomplete`/exit `2`.

### Real-surface QA

- Build ocmm and native LSP.
- Run direct native-LSP `tools/list` smoke. Separately smoke `node dist/cli/ocmm-lsp.js mcp` only as an isolated Task 5 build/wrapper verification, not as the live compatibility preflight.
- Run the live host probe with the direct feature flag.
- Inspect the generated structured fixture, not raw logs.
- Run repository typecheck, tests, and build.
- Run secret/path scans against the fixture.
- Verify `git diff` contains only the spike harness, fixtures, fixture evidence, spec, and plan.
- The checked fixture may remain `SKIP/NO-DECISION` when no external provider/model is supplied; that is not a live compatibility PASS. The unrelated planning-logical-tiers spec/plan are outside this spike and excluded from all edits.

## Commit Boundary

Delivery is intentionally uncommitted. Do not stage, commit, push, or tag. The only permitted worktree delta is the seven-path migration allowlist: the runner, its test, the sanitized result fixture, the two current compatibility documents, and the two 2026-07-22 migration documents. It contains no product-code repair. A reproducible product repair still requires a later, separately approved change.

## Risks and Mitigations

1. **Model non-determinism.** Use exact code, inspect hook/MCP events instead of prose, retry only once in a fresh run, then `DEFER`.
2. **Host version drift.** The SDK no-install proof is pinned to OpenCode `1.18.4`; any other valid version creates no live attempt and remains NO DECISION. Record exact version/hash and never install or upgrade OpenCode as part of the spike.
3. **Credential leakage.** Provider config must be outside the repository; raw config/logs stay under the disposable root; fixture serialization is whitelist-only and secret-scanned.
4. **Cross-attempt leaked processes, PID reuse, or raw state.** Keep role-separated ledgers per attempt, refresh every valid PID row, signal only attempt-owned services, and observe historical PIDs without killing them. Preserve roots whenever ledgers are incomplete or a PID survives; make full child-plus-parent cleanup a PASS criterion.
5. **False compatibility from upstream source.** Upstream establishes expected contracts only; live traces decide.
6. **Accidental depth-guard expansion.** Assert no `task` call and forbid any `execute` depth accounting change.

## Self-Review

- **Placeholder scan:** No unresolved placeholder, incomplete branch, or unspecified status exists.
- **Consistency:** The architecture, file map, live commands, outcome model, and commit boundary all preserve the evidence-only scope.
- **Scope:** One uncommitted harness/fixture migration; any product repair is explicitly separate.
- **Ambiguity:** Parent/attempt topology, four PID roles, reap-before-delete ordering, aggregate cleanup failure, XDG `unknown`/`isolated`/`escaped`, exit codes, provider/model absence, timeout, permission blockage, and exact-count PASS evidence are defined deterministically.

## Migration and Live Receipt — 2026-07-22

Task 1 recorded a RED-to-GREEN migration of the exact host-version, provider-map, JSONL-envelope, parent/attempt barrier, and hook-versus-metadata regressions. Its final tracked harness was GREEN at `73/73`; that unit result was not by itself live compatibility PASS.

Task 2 extracted an ephemeral strict-JSON apai-only config from the known JSONC user config, retaining only the selected provider plus permitted `$schema`/enabled/disabled provider arrays. All configured apai SDK routes passed the exact 24-item `1.18.4` no-install validation; no provider body, credential, base URL, authorization value, or raw config entered the repository or receipt. A disposable temp source was archived from `HEAD`, overlaid with current runtime inputs, made into a disposable Git repository, and built through a verified `node_modules` junction. The isolated build passed and its wrapper exposed exactly the eight canonical LSP tools.

The initial real host receipt was correctly `DEFER/unclassifiable-output`, exit `4`, not PASS: with `OCMM_DEBUG="1"`, ocmm plugin info logging wrote non-JSON diagnostics to provider-run stdout alongside otherwise valid official JSONL. The strict parser was not relaxed. A required RED test reproduced that mechanism by showing debug-enabled barriers plus a debug-enabled provider run and null JSONL facts. The minimal GREEN fix copies the attempt environment only for provider `run` and sets `OCMM_DEBUG="0"`; version, paths, config, and MCP barriers remain debug-enabled. The focused regression and unchanged strict-parser test pass.

The single new toggle-proof probe emitted exactly `PASS/all-required-probes-passed`, exit `0`, for OpenCode `1.18.4` (SHA-256 `59b66e1983b2665b498f234a17bf92e78e0e9e3f8c77406edf8dcf3e6239ee5c`) and `apai/gpt-5.6-terra`; its disposable source revision was `15404c9` and intentionally dirty with the current overlay. The sanitized fixture proves isolated XDG/project config; ocmm/LSP/probe registration and eight-tool direct LSP smoke; one exact outer `execute` before/after pair with `code`; strict JSONL facts `6` events (`step_start`, `tool_use`, `step_finish`, `step_start`, `text`, `step_finish`), six non-error parts, and zero error events; the exact three nested hook identities; the exact four completed metadata identities including `$codemode_search`; successful result propagation; denied-tool hiding; and MCP counts `1/1/0`. Cleanup is complete: one attempt, `16` tracked PIDs, zero remaining PIDs, one removed attempt root, and removed parent root. The validated sanitized temp-source fixture alone refreshed the tracked fixture; all provider, raw, fallback, build, junction, source, run-root, and task-owned process state was removed. The final tracked harness is GREEN at `74/74`, and typecheck passes with ambient profile controls removed. No installation, process kill, stage, commit, push, or tag occurred.

Post-live evidence hardening added a load-bearing PASS check for structurally consistent, non-error provider-run JSONL facts; changed direct LSP smoke from canonical-name subset acceptance to an exact eight-tool multiset; and added a deterministic regression that reads the tracked sanitized PASS fixture. That regression now locks the exact top-level and every retained nested-object schema, plus every retained PASS field—including host platform/revision/dirty-state/feature flag, `permissions.deniedTool`, and `hooks.allNestedToolsIdentified`—alongside status, host/model/hash, registration, execute/JSONL, hook/metadata, MCP, and cleanup facts. The existing fixture already satisfies these stronger checks, so this evidence test remains GREEN and no paid provider/model rerun was necessary. The current full harness is `75/75`.
