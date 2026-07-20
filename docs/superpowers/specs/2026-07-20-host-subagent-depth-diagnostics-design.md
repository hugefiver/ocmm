# Host Subagent Depth Diagnostics Design

## Goal

Add a read-only compatibility diagnostic for OpenCode's top-level `subagent_depth` and ocmm's `subagent.maxDepth`, while preserving both products' defaults, older-host compatibility, and ocmm's existing task-only guard semantics.

## Context and Established Behavior

OpenCode commit `285d315b4e5355e0a94608acc0678a11b720079e` (2026-07-15, `fix(core): limit subagent nesting depth`) added an optional top-level `subagent_depth` non-negative integer. OpenCode's Task tool uses `cfg.subagent_depth ?? 1`, walks parent sessions to obtain the caller depth, and rejects a Task dispatch when `currentDepth >= subagent_depth`.

ocmm independently defines `subagent.maxDepth` as an integer from `0` through `20`, with default `3`. `guardSubagentDepth()` in `src/permissions/index.ts` rejects only `toolName(rawInput) === "task"` when `currentDepth >= config.subagent.maxDepth`. Main sessions are depth `0`; therefore a limit of `1` allows a main session to create a depth-1 child but prevents that child from creating a depth-2 child.

When both guards are active, the actual Task nesting limit is the lower value. With current defaults, a new OpenCode host effectively limits nesting to `1`, even though ocmm retains its local default of `3`.

The OpenCode plugin SDK's `config` hook receives the resolved host config object directly. An explicitly configured `subagent_depth` is therefore observable without reading files or querying another API. The field is optional, however, and OpenCode applies its default in the Task implementation rather than materializing `1` into the config object. Field absence consequently cannot distinguish an older host with no host limit from a newer host using the implicit default of `1`.

Existing ocmm configuration and startup messages use `src/shared/logger.ts`. All `debug`, `info`, `warn`, and `error` output is prefixed with `[ocmm]`, gated by `OCMM_DEBUG`, and protected against console failures. The new diagnostic follows that pattern rather than creating an always-on output channel.

## Approaches Considered

### 1. Isolated pure diagnostic plus config-hook reporter — selected

Create a small module that validates the observable host field, computes the effective limit and limiting side, formats a secret-free diagnostic, and deduplicates emissions. Wire one reporter instance into each `createConfigHandler()` instance.

This gives the compatibility matrix a directly testable pure interface, keeps host-field knowledge out of the large registration handler, and makes read-only/no-leak behavior explicit. It adds one focused source file and test file.

### 2. Inline all logic in `src/hooks/config.ts`

This minimizes file count, but mixes compatibility classification, message formatting, deduplication, and agent registration. Testing would require console interception for every matrix row, and future host-compatibility changes would further enlarge an already large file.

### 3. Documentation only

This is maximally compatible with older hosts and cannot mutate anything, but it does not report an explicitly observable conflict. It therefore fails the runtime-diagnostic requirement.

Mutating host config is not an acceptable approach: ocmm must never set `subagent_depth`, copy `subagent.maxDepth` into host config, or change either default.

## Architecture

### Pure diagnostic interface

Create `src/hooks/subagent-depth-diagnostics.ts` with these interfaces:

```ts
export type SubagentDepthDiagnostic = {
  key: string
  level: "info" | "warn"
  message: string
}

export type SubagentDepthDiagnosticLogger = {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
}

export function resolveSubagentDepthDiagnostic(
  hostConfig: unknown,
  config: OcmmConfig,
): SubagentDepthDiagnostic | null

export function createSubagentDepthDiagnosticReporter(
  logger?: SubagentDepthDiagnosticLogger,
): (hostConfig: unknown, config: OcmmConfig) => void
```

`resolveSubagentDepthDiagnostic()` reads only the direct `subagent_depth` property. It treats the field as observable only when the value is a finite, non-negative integer. It returns `null` for an absent field, malformed input, negative/fractional/non-finite values, or a non-record host config. Host validation normally rejects these invalid values first, but defensive handling keeps synthetic tests and older hook shapes non-disruptive.

The function considers the ocmm guard disabled when `disabledHooks` contains either canonical `subagent-depth-guard` or the existing compatibility alias `subagentDepthGuard`. When enabled, it computes `effective = Math.min(hostDepth, config.subagent.maxDepth)`. Equal values produce `info`; unequal values produce `warn` and identify the stricter side. When the ocmm guard is disabled, the observed host value is the sole effective Task limit and produces `info`, not a conflict warning.

The returned `key` contains only the guard state and numeric limits. The reporter keeps a private `Set<string>` and emits each diagnostic key at most once per `createConfigHandler()` instance. A newly observed combination emits once; returning later to an already emitted combination does not emit again.

### Exact messages

The logger supplies the existing `[ocmm]` prefix. The diagnostic supplies exactly one of these message bodies:

```text
subagent depth compatibility: OpenCode subagent_depth=1, ocmm subagent.maxDepth=3, effective=1 (host is stricter; task dispatches only)
subagent depth compatibility: OpenCode subagent_depth=3, ocmm subagent.maxDepth=3, effective=3 (limits agree; task dispatches only)
subagent depth compatibility: OpenCode subagent_depth=5, ocmm subagent.maxDepth=3, effective=3 (ocmm is stricter; task dispatches only)
subagent depth compatibility: OpenCode subagent_depth=1, ocmm subagent-depth-guard=disabled, effective=1 (host only; task dispatches only)
```

The first and third messages use `warn`; the second and fourth use `info`. Values are interpolated as validated integers. Messages never include the full host config, config paths, providers, models, environment variables, credentials, or arbitrary field values.

### Config-hook integration

`createConfigHandler()` creates one reporter before returning its async hook. After validating `rawInput`, it continues to resolve the host target as today:

```ts
const target = isRecord(rawInput.config) ? rawInput.config : rawInput
```

After obtaining the current `OcmmConfig`, the hook invokes the reporter with `target` and `cfg` before either registration branch. This ensures diagnostics do not depend on `registerBuiltinAgents`, route-registry mode, or successful agent registration.

`ConfigHandlerBaseArgs` gains an optional `logger` containing `info` and `warn`. Production defaults to the existing `log`; tests inject a recorder. Existing config registration messages use the same selected logger. This is dependency injection only and does not add a user configuration field.

The reporter never writes to `target`. In particular, it must not add, delete, normalize, or replace `target.subagent_depth`. The existing config handler may continue its unrelated agent/skill/command/MCP registration mutations.

## Compatibility Matrix

The cutoff is the host capability introduced by commit `285d315`; no semantic-version parser or minimum-version dependency is added.

| Host situation | `subagent_depth` observable in hook | ocmm guard | Actual Task limit | Runtime diagnostic |
| --- | ---: | --- | ---: | --- |
| Host before `285d315`; field unsupported/absent | No | Enabled, local `3` | `3` from ocmm | None; preserve old-host behavior |
| Host at/after `285d315`; field omitted | No | Enabled, local `3` | `1` from host implicit default | None because old host and implicit default are indistinguishable; documentation explains the cap |
| New host; explicit host `0`, local `3` | Yes | Enabled | `0` | `warn`, host stricter |
| New host; explicit host `1`, local `3` | Yes | Enabled | `1` | `warn`, host stricter |
| New host; explicit host `3`, local `3` | Yes | Enabled | `3` | `info`, limits agree |
| New host; explicit host `5`, local `3` | Yes | Enabled | `3` | `warn`, ocmm stricter |
| New host; explicit host `1` | Disabled | Disabled | `1` from host | `info`, host only |
| Any host; tool name is `execute` rather than `task` | Irrelevant | Irrelevant | Not governed by these Task-depth controls | No tool reclassification and no depth-guard expansion |

If a future host exposes a materialized default in the config hook, it naturally enters the observed rows without version detection. If a future hook stops exposing the field, behavior falls back to the unobservable rows without failing startup.

## Documentation

Update `README.md` with:

- the host commit/capability and host default of `1`;
- the unchanged ocmm default of `3`;
- `effective = min(host, ocmm)` while both guards are active;
- the observed-field diagnostic and `OCMM_DEBUG=1` requirement;
- the absent-field ambiguity between old hosts and a new host's implicit default;
- the guarantee that ocmm never writes host `subagent_depth`;
- the fact that both controls govern `task` dispatches, not a tool named `execute`.

Update the `subagent-depth-guard` row in `AGENTS.md` so repository guidance no longer implies that local `3` is necessarily the actual host limit.

Do not modify `src/config/schema.ts` or `schema.json`, and do not run `pnpm run gen-schema`: the host field is not an ocmm field and the local schema/default are unchanged. No prompt files change, so prompt synchronization documents and generated Codex bundles are outside scope.

## Error Handling and Privacy

- Diagnostics are observational. Failure to observe or validate a host value returns no diagnostic and never blocks config registration.
- The reporter uses the existing logger, whose methods swallow console errors; diagnostic calculation itself does not perform I/O.
- Invalid synthetic host values are ignored rather than echoed.
- Deduplication state stores only static labels and validated integers.
- A test host config containing a sentinel secret proves neither message nor key contains that sentinel and proves the input is structurally unchanged by the pure resolver.

## Test Strategy

### Unit tests

Create `src/hooks/subagent-depth-diagnostics.test.ts` with table-driven coverage for:

- host stricter (`0` and `1` versus local `3`);
- equal limits;
- ocmm stricter;
- canonical and compatibility-alias guard disablement;
- absent, malformed, negative, fractional, `NaN`, and infinite host values;
- exact level, key, effective value, and message text;
- no mutation and no sentinel-secret leakage;
- one emission per diagnostic key, including an `A → B → A` sequence.

### Config-hook integration tests

Extend `src/hooks/config.test.ts` to inject a recording logger and prove:

- an explicit host field is diagnosed before registration and remains unchanged;
- two calls through one handler emit the compatibility diagnostic once;
- a host config without the field emits no compatibility diagnostic;
- `registerBuiltinAgents: false` still receives the diagnostic;
- unrelated config registration logs remain available through the injected logger.

### Guard-scope regression

Extend `src/permissions/index.test.ts` with a regression that places a session at the local maximum and calls the before-hook with `tool: "execute"`. The call must not be rejected by `subagent-depth-guard`. Existing `task` blocking tests remain unchanged and continue proving task-only enforcement.

### Verification commands

Run targeted Node tests, then the repository-required gates:

```powershell
node --test --experimental-strip-types src/hooks/subagent-depth-diagnostics.test.ts src/hooks/config.test.ts src/permissions/index.test.ts
pnpm run typecheck
pnpm test
pnpm run build
git diff --check
git diff --exit-code -- src/config/schema.ts schema.json
```

The final command must produce no output and exit `0`, proving there was no ocmm schema change or generated-schema drift.

### Live verification and fallback

The isolated live OpenCode `debug config` probe remains the primary acceptance check. The plan supplies an executable PowerShell 7 script whose `Invoke-BoundedProcess` uses `ProcessStartInfo`, `.ArgumentList.Add()`, concurrent `ReadToEndAsync()` calls, a `15s` `WaitForExit`, a process-local `Kill($true)` only on timeout, and a bounded stream drain. Every `opencode debug config` invocation uses that helper. A full-host `PASS` requires exactly one host-stricter compatibility line, preservation of the explicit host value in resolved config, silence for a second isolated probe without the field, and cleanup of all temporary config and log material outside the repository.

A partial-runtime fallback is permitted only when the host external-plugin loader is shown to block before hooks run. The evidence must use a fully isolated environment, clear inherited `OPENCODE_CONFIG_CONTENT`, `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, and OCMM profiles, and establish all of the following:

- the `plugin: []` baseline exits `0`;
- the same external plugin is declared as a Windows absolute path, canonical file URI, and relative path;
- all three declarations time out before the configured hook deadline; and
- each timed-out run has zero `[ocmm] config loaded` and `config: registered` markers.

If any declaration exits naturally and reaches the hook, the script must run the full explicit and absent assertions, not defer. Only with the strict all-timeout control evidence may it produce `DEFERRED_PRE_HOOK_TIMEOUT` with the receipt label `DEFERRED: host loader pre-hook`. A nonzero natural exit, an undrained stream, a timeout with a marker, or a mixed outcome without a natural hook-ready path is `FAIL_INVESTIGATE`, not a fallback. The deferred result is not a full-host `PASS` and does not prove OpenCode external-plugin loader integration. It calls the actual built `dist/index.js` plugin's `server({ directory })` result and invokes its returned real `config` hook. Its receipt records the built-artifact SHA-256, an explicit target called twice with the exact compatibility line emitted once and its own `subagent_depth` property still equal to `1`, and a fresh target without the field that emits no compatibility marker and does not materialize the field. It also confirms that temporary files plus every inherited environment variable and process state were cleaned up, and that no secret was logged. The final output is a safe JSON summary, never raw host config, raw logs, or a secret.

For this verification receipt, installed OpenCode was `1.18.3`; after the stated isolation and inheritance cleanup, the `plugin: []` baseline exited `0` in `2.196s`. The external plugin declarations for Windows absolute path, canonical file URI, and relative path each reached the `15s` timeout with zero hook markers (`config loaded=0`, `config: registered=0`). The built `dist/index.js` SHA-256 was `F1785B3B9852C2BA8E24B11936BEBEDC47EDC04B425DE3469253617E6E582BB0`; the direct real-hook probe exited `0` in `223ms`, produced the exact compatibility line once across two explicit-target calls, retained own-property value `1`, stayed silent and non-materializing for a fresh absent-field target, leaked no secret, and cleaned its temporary, environment, and process state. Record this receipt as `DEFERRED: host loader pre-hook`, not `PASS`.

When the host loader becomes available, rerun the original full isolated OpenCode probe. The partial-runtime receipt cannot replace that full-host acceptance check.

## File Map

### Create

- `src/hooks/subagent-depth-diagnostics.ts` — pure observation, compatibility classification, exact message formatting, and per-handler deduplication.
- `src/hooks/subagent-depth-diagnostics.test.ts` — compatibility, privacy, read-only, and deduplication matrix.

### Modify

- `src/hooks/config.ts` — instantiate and invoke the reporter; use an injectable config logger.
- `src/hooks/config.test.ts` — config-hook integration and unobservable-field compatibility tests.
- `src/permissions/index.test.ts` — lock the unchanged `task`-only scope against `execute` reclassification.
- `README.md` — user-facing host/local effective-limit and old-host guidance.
- `AGENTS.md` — repository guidance for the effective limit.

### Intentionally unchanged

- `src/config/schema.ts`
- `schema.json`
- `src/permissions/index.ts`
- host configuration files and host defaults
- prompt sources, prompt synchronization documents, and generated Codex bundles

## Commit Boundary

Implementation, tests, documentation, this design, and its implementation plan form one atomic change and should be committed once as `feat: diagnose host subagent depth limits`. No intermediate commit or generated-schema commit is needed.

This planning session does not create the commit; repository commit guard requires explicit user authorization for git writes.
