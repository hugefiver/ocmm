# DSMM v0.7 Runtime Recovery Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement opt-in DSMM v0.7 runtime recovery so DSH host retries win, configured provider/model fallbacks are bounded and reconstructable from durable request headers, unfinished scoped work can receive bounded continuation, and unsupported automatic subagent follow-up remains explicitly out of scope.

**Architecture:** Add one pure recovery-policy module for failure classification and durable-event folding, then one runtime-recovery module whose root listeners hold only process-local, agent-fenced pending-route and continuation state. The request-error listener delegates to the host first, the fallback request listener remains downstream of the existing prepend model-routing listener, and turn-stopping continuation depends only on durable todo/goal state; generated `dsmm/lib/**` is refreshed only in the final task for each complete source revision.

**Tech Stack:** TypeScript 6 ESM/NodeNext, Node.js 22 `node:test`, Schemastery, Cordis `^4.0.1`, DeepSeek Harness `@deepseek-ai/dsh@0.1.1-rc.2`, pnpm workspace, npm pack dry-run, and Docker packaged-runtime smoke.

**Spec:** `docs/superpowers/specs/2026-08-25-dsmm-runtime-recovery-design.md`

**Global Constraints:**
- Treat the approved design as authoritative and target `@deepseek-ai/dsh@0.1.1-rc.2` at commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.
- Let downstream host `agent/request-error` policy act first; return its `{ kind: "retry" }` decision unchanged and do not schedule a DSMM fallback when it retries.
- Use only exact HTTP-status membership and case-insensitive exact failure-code membership; do not parse provider messages or add arbitrary regular-expression classifiers.
- Do not add timers, backoff, provider calls, polling, session aborts, cross-process retry state, provider discovery, or automatically constructed fallback chains.
- Do not append or counterfeit `llm/retry`; durable `request/header` events are the route-transition reconstruction source.
- Keep fallback pending state process-local, keyed by live agent identity and exact `(turn, step)`, consumed at most once, and cleared on registration disposal.
- Keep continuation counts process-local and bounded per live agent and turn; after a cold restart, continuation waits for explicit user or host turn resumption.
- Require a current unfinished `todo/write` after the latest `turn/start` or a latest durable `goal/change` with phase `active` before steering.
- Do not implement automatic subagent follow-up, synthesize a parent prompt or identifier, or treat live-only `subagent/end` as durable recovery evidence.
- Preserve all existing flat v0.6 settings and exact-route model-routing behavior.
- Register runtime recovery before model routing in `apply()`; keep model routing as the prepend outer `agent/request` listener and the fallback request hook at default order downstream of it.
- A fallback handoff replaces only `provider` and `model`, removes the prior adapter-owned `reasoningEffort`, and preserves every other downstream field and nested reference.
- Recovery disabled must leave DSMM prompts, skills, guards, LSP, and model routing active.
- Log only sanitized route/control metadata; never include prompt bodies, provider error bodies, credentials, or steering prompt text in warnings.
- Preserve HEAD `cedd30b1abd03cf00b9ce330fa3b1805d76cb401` and every reviewed uncommitted v0.6 change; do not stage, commit, stash, reset, checkout, rebase, clean, push, or tag.
- Do not install software or host dependencies. The pinned Docker smoke may install only its declared DSH package inside its disposable image/profile.
- Do not generate or alter working-tree `dsmm/lib/**` before Task 7; targeted RED/GREEN checks compile only an OS-temporary mirror.
- Generate working-tree `dsmm/lib/**` exactly once for each complete source revision entering Task 7. Any reviewer-driven correction to source, tests, docs, package metadata, or smoke code invalidates generated output, gate evidence, review packets, and receipts and restarts Task 7 from generation.
- Run root `pnpm test` once per source revision that reaches final review. Preserve and report any unrelated Windows Job parallel flake exactly; do not retry an unchanged revision or conceal it with serialization, threshold, or test changes.
- Final acceptance requires Oracle and primary Reviewer approvals for one common, recomputed current working-tree identity.
- No Git write is authorized by design or plan delegation; suggested commit messages are review boundaries only.

---

## Requirement and evidence map

| Approved requirement | Implementation task | Primary evidence |
|---|---|---|
| Restart-scoped recovery settings, defaults, bounds, and exact rc.2 structural types | Task 1 | `dsmm/test/runtime-recovery-types.test.ts`, `dsmm/test/settings.test.ts` |
| Pure exact classifier, route-history fold, unfinished-work fold, and bounded selector | Task 2 | `dsmm/test/recovery-policy.test.ts` |
| Host-first request-error policy, one-shot route handoff, and v0.6 routing order | Task 3 | fallback and composed-waterfall cases in `dsmm/test/runtime-recovery.test.ts` |
| Bounded turn-stopping continuation, sanitized failure, registration/disposal, state cleanup | Task 4 | continuation/lifecycle cases in `dsmm/test/runtime-recovery.test.ts` |
| Public exports, package inventory, settings/behavior docs, and subagent reconstruction notes | Task 5 | `dsmm/test/package.test.ts`, `dsmm/docs/runtime-recovery.md` |
| Real pinned rc.2 request-error/request/turn-stopping dispatch with no provider network | Task 6 | Docker markers `RUNTIME_RECOVERY_FALLBACK_OK` and `RUNTIME_RECOVERY_CONTINUATION_OK` |
| Roadmap status, generated modules, full DSMM/root/pack/Docker gates, common-identity reviews | Task 7 | final gate log and matching Oracle/Reviewer receipts |

## File map

### New focused modules and tests

- Create `dsmm/src/recovery-policy.ts` — pure failure classification, exact route comparison, durable request-header folding, durable unfinished-work folding, and fallback selection.
- Create `dsmm/src/runtime-recovery.ts` — DSH root listener registration plus process-local pending handoff and continuation state.
- Create `dsmm/test/runtime-recovery-types.test.ts` — compile/runtime fixtures for the exact narrow rc.2 request-error, request-header, todo, goal, and turn-stopping structures DSMM consumes.
- Create `dsmm/test/recovery-policy.test.ts` — pure classifier/folder/selector tables.
- Create `dsmm/test/runtime-recovery.test.ts` — host-first waterfalls, fallback handoff, model-routing composition, continuation, and lifecycle tests.
- Create `dsmm/docs/runtime-recovery.md` — settings, fallback/continuation behavior, durable reconstruction, error handling, cold-restart boundary, and subagent recovery notes.

### Existing source, tests, and package surfaces

- Modify `dsmm/src/dsh-types.ts` — add only the narrow public rc.2 structural contracts used by recovery.
- Modify `dsmm/src/settings.ts` and `dsmm/test/settings.test.ts` — nested restart-scoped recovery settings, schemas, defaults, defensive copies, normalization, and bounds.
- Modify `dsmm/src/index.ts` and `dsmm/test/settings.test.ts` — register runtime recovery before model routing while preserving existing settings and request-hook behavior.
- Modify `dsmm/test/model-routing.test.ts` — retain the v0.6 prepend listener/order contract in a composed fallback regression.
- Modify `dsmm/test/package.test.ts`, `dsmm/package.json`, and `dsmm/README.md` — public exports and shipped recovery documentation.
- Modify `dsmm/scripts/docker-smoke.mjs` and `dsmm/test/docker-smoke-assets.test.ts` — pinned real DSH structural dispatch and no-network runtime proof.
- Modify `dsmm/docs/roadmap.md` only in Task 7 after packaged runtime evidence passes.

### Generated output

- Regenerate only in Task 7: `dsmm/lib/**` — add `recovery-policy.*` and `runtime-recovery.*`, update declarations/maps for changed source, and preserve every reviewed v0.6 generated module.

## Dependency order, fresh-subagent protocol, and review boundaries

1. The parent implementation session captures the preserved HEAD, full working-tree status, and a byte-sensitive `dsmm/lib/**` baseline before dispatching Task 1.
2. Use a fresh implementation subagent for each task. Give it only that task, the approved spec, this plan, the captured lib baseline, and the explicit instruction not to commit; never reuse a task agent for a later task.
3. After each Task 1-6 return, the parent checks the named GREEN evidence, confirms the exact allowed file boundary, recomputes the lib identity, and proceeds continuously only when it still equals the pre-Task-1 baseline.
4. Task 1 defines settings and structural types consumed by every later task. Task 2 is pure and consumes only Task 1 contracts.
5. Task 3 adds fallback request hooks and protects v0.6 request ordering. Task 4 independently adds continuation and completes lifecycle/state cleanup.
6. Task 5 documents and ships the completed public surface. Task 6 is the first real pinned package/runtime proof.
7. Task 7 is the sole working-tree generation point and the authoritative current-revision integration/review boundary.
8. Suggested commit messages mark independently reviewable boundaries, but no task runs `git add`, `git commit`, or another Git write.

## Pre-task preservation receipt and targeted TDD helper

Before Task 1, the parent runs this read-only PowerShell receipt from the repository root and records the printed lib identity in task-tracking state. The parent includes that literal identity in every fresh Task 1-6 subagent prompt.

```powershell
$head = (@(git rev-parse HEAD) -join "`n").Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne "cedd30b1abd03cf00b9ce330fa3b1805d76cb401") { throw "unexpected HEAD: $head" }
git status --short

function Get-DsmmLibIdentity {
  $paths = @(git ls-files --cached --others --exclude-standard -- "dsmm/lib") | Sort-Object
  if ($LASTEXITCODE -ne 0) { throw "cannot enumerate dsmm/lib" }
  $rows = foreach ($path in $paths) {
    $hash = (@(git hash-object -- "$path") -join "`n").Trim()
    if ($LASTEXITCODE -ne 0 -or $hash -notmatch '^[0-9a-f]{40,64}$') { throw "cannot hash $path" }
    "$path`t$hash"
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($rows -join "`n"))
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return "sha256:" + [Convert]::ToHexString($sha.ComputeHash($bytes)).ToLowerInvariant() }
  finally { $sha.Dispose() }
}

$dsmmLibBaselineIdentity = Get-DsmmLibIdentity
$dsmmLibBaselineIdentity
```

Define this helper once in the parent implementation session. It copies current DSMM inputs into an exact OS-temporary mirror, junctions only the already-present DSMM dependencies, generates only the mirror's `lib`, runs named tests, and removes only the verified mirror.

```powershell
function Invoke-DsmmRuntimeRecoveryMirrorTests {
  param([Parameter(Mandatory = $true)][string[]]$Tests)

  $workspaceRoot = (Resolve-Path -LiteralPath ".").Path
  $dsmmRoot = Join-Path $workspaceRoot "dsmm"
  $tempParent = [IO.Path]::GetTempPath().TrimEnd([IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $tempParent -PathType Container)) { throw "OS temp parent is unavailable: $tempParent" }
  $mirror = Join-Path $tempParent ("dsmm-runtime-recovery-test-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $mirror | Out-Null

  try {
    foreach ($directory in @("src", "test", "skills", "prompts", "agent-presets", "docs", "patches", "scripts", "docker")) {
      $sourceDirectory = Join-Path $dsmmRoot $directory
      if (Test-Path -LiteralPath $sourceDirectory -PathType Container) {
        Copy-Item -LiteralPath $sourceDirectory -Destination (Join-Path $mirror $directory) -Recurse
      }
    }
    foreach ($file in @("package.json", "tsconfig.json", "tsconfig.test.json", "cordis.patch.yml", "README.md")) {
      Copy-Item -LiteralPath (Join-Path $dsmmRoot $file) -Destination (Join-Path $mirror $file)
    }

    $existingModules = Join-Path $dsmmRoot "node_modules"
    if (-not (Test-Path -LiteralPath $existingModules -PathType Container)) {
      throw "dsmm/node_modules must already exist; do not install from this helper"
    }
    New-Item -ItemType Junction -Path (Join-Path $mirror "node_modules") -Target $existingModules | Out-Null

    pnpm --dir $dsmmRoot exec tsc -p (Join-Path $mirror "tsconfig.json")
    if ($LASTEXITCODE -ne 0) { throw "temporary DSMM source build failed" }
    $resolvedTests = @($Tests | ForEach-Object { Join-Path $mirror $_ })
    node --test --experimental-strip-types $resolvedTests
    if ($LASTEXITCODE -ne 0) { throw "temporary DSMM targeted test failed" }
  } finally {
    $resolvedMirror = [IO.Path]::GetFullPath($mirror)
    $expectedPrefix = [IO.Path]::GetFullPath($tempParent + [IO.Path]::DirectorySeparatorChar)
    if (-not $resolvedMirror.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase) -or $resolvedMirror -eq $expectedPrefix.TrimEnd([IO.Path]::DirectorySeparatorChar)) {
      throw "refusing to remove unexpected mirror path: $resolvedMirror"
    }
    Remove-Item -LiteralPath $resolvedMirror -Recurse -Force
  }
}
```

For every RED command, accept only the named missing symbol/assertion as the expected failure; compiler, dependency, environment, or unrelated regression failures are blockers. For every GREEN command, require exit `0`. After each Task 1-6 GREEN, run `Get-DsmmLibIdentity` and require exact equality with the captured pre-Task-1 value.

---

### Task 1: Recovery settings and exact DSH rc.2 structural contracts

**Files:**
- Modify: `dsmm/src/dsh-types.ts`
- Modify: `dsmm/src/settings.ts`
- Modify: `dsmm/test/settings.test.ts`
- Create: `dsmm/test/runtime-recovery-types.test.ts`

**Interfaces:**
- Consumes: existing `DshAgent`, `DshLlmCallConfig`, generic `DshSessionEvent`, Schemastery settings registration, and all reviewed v0.6 settings unchanged.
- Produces in `dsh-types.ts`:
  - `DshLlmFailure { readonly message: string; readonly code: string; readonly status?: number; readonly providerRetryAfterMs?: number; readonly requestId?: unknown }`, matching the pinned public `LlmFailure` field requirements without importing its private runtime class.
  - `DshEpochHeader { config: DshLlmCallConfig; [key: string]: unknown }`
  - `AgentRequestErrorFrame { agent: DshAgent; turn: number; step: number; provider: string; failure: DshLlmFailure; retryPolicy: unknown; signal: AbortSignal }`
  - `DshRequestErrorAction = { kind: "retry" } | undefined`
  - `AgentTurnStoppingFrame { agent: DshAgent; turn: number; signal: AbortSignal }`
  - narrow `DshStepBoundaryEventData { turn; step }`, `DshRequestHeaderEventData { header: DshEpochHeader; reason: "initial" | "resume" | "change" }`, `DshTodoWriteEventData`, and `DshTodoItem` (`content` plus `pending | in_progress | completed`).
  - `DshGoalSnapshot` with exact `id`, positive `revision`, `objective`, `phase: "active" | "paused" | "blocked" | "complete"`, optional `blockedReason`, and `maxGoalRounds`; `DshGoalChangeEventData` as the rc.2 version-1 non-clear snapshot union or clear tombstone.
  - `DshSession.requestHeader?(): DshEpochHeader | undefined` plus typed `agent/request-error` and `agent/turn-stopping` `DshContext.on` overloads.
- Produces in `settings.ts`:
  - `DsmmRecoveryRoute { provider: string; model: string }`
  - `DsmmRuntimeRecoverySettings` exactly matching the approved nested shape.
  - `DsmmPluginConfig.runtimeRecovery` as a deep partial config and `DsmmSettings.runtimeRecovery` as fully resolved restart-scoped settings.
  - normalization bounds `0..10` for both `maxFallbackAttempts` and `idleContinuation.maxContinuations`.

**Integration boundary:** This task defines data and settings only. It adds no listeners, retries, steering, timers, event append, generated lib output, docs, or roadmap change.

- [ ] **Step 1: Add failing exact structural-contract fixtures**

Create `runtime-recovery-types.test.ts` with a structural agent/session and these exact rc.2-shaped values:

```ts
const signal = new AbortController().signal;
const failedConfig = { provider: "primary", model: "primary-model", reasoningEffort: "high" };
const header: DshEpochHeader = { config: failedConfig };
const events: DshSessionEvent[] = [
  { type: "turn/start", data: { turn: 4 } },
  { type: "step/start", data: { turn: 4, step: 2 } satisfies DshStepBoundaryEventData },
  { type: "request/header", data: { header, reason: "initial" } satisfies DshRequestHeaderEventData },
  { type: "todo/write", data: { todos: [{ content: "Ship v0.7", status: "in_progress" }] } satisfies DshTodoWriteEventData },
  {
    type: "goal/change",
    data: {
      kind: "goal/change",
      version: 1,
      operation: "create",
      goal: { id: "goal-1", revision: 1, objective: "Ship v0.7", phase: "active", maxGoalRounds: 5 },
      roundsStarted: 0,
      createdAt: 1,
      updatedAt: 1
    } satisfies DshGoalChangeEventData
  },
  { type: "step/end", data: { turn: 4, step: 2 } satisfies DshStepBoundaryEventData }
];
const agent: DshAgent = {
  session: { events, append() {}, requestHeader: () => header },
  steer() {}
};
const failure: DshLlmFailure = {
  status: 429,
  code: "rate_limit",
  message: "sensitive provider body",
  providerRetryAfterMs: 250
};
const requestErrorFrame: AgentRequestErrorFrame = {
  agent,
  turn: 4,
  step: 2,
  provider: "primary",
  failure,
  retryPolicy: { owner: "host" },
  signal
};
const turnStoppingFrame: AgentTurnStoppingFrame = { agent, turn: 4, signal };
```

Assert exact field identity, that a typed request-error listener can return the same `const hostRetry = { kind: "retry" } as const`, and that a typed turn-stopping listener returns `Promise<void>`. Do not invent an `llm/retry` payload type.

- [ ] **Step 2: Add failing defaults, schema, normalization, and defensive-copy tests**

Extend every complete settings expectation with:

```ts
runtimeRecovery: {
  enabled: false,
  retryOnStatusCodes: [429, 500, 502, 503, 504],
  retryOnCodes: [],
  fallbackRoutes: [],
  maxFallbackAttempts: 2,
  idleContinuation: {
    enabled: false,
    maxContinuations: 3,
    prompt: "Continue the current task from the durable goal or unfinished todo list. Do not repeat completed work."
  }
}
```

Add one normalization test with statuses `[429, 429, 99, 600, 500.5, 503]`, codes `[" ETIMEDOUT ", "etimedout", "", "ECONNRESET"]`, duplicate/blank trimmed routes, `maxFallbackAttempts: 99`, and `idleContinuation.maxContinuations: -4`. Require statuses `[429, 503]`, codes `["etimedout", "econnreset"]`, only valid exact trimmed route pairs, and limits `10` and `0`. Assert non-finite limits fall back to defaults, explicit empty arrays stay empty, returned arrays/routes/nested settings do not alias defaults or input, and attached restart-scoped settings are normalized before both `install()` and request-time getters.

- [ ] **Step 3: Run RED**

```powershell
Invoke-DsmmRuntimeRecoveryMirrorTests @("test/runtime-recovery-types.test.ts", "test/settings.test.ts")
```

Expected: FAIL because the recovery structural types, `runtimeRecovery` settings shape, defaults, schemas, and normalization do not exist. The failure must not be an unrelated v0.6 regression.

- [ ] **Step 4: Implement the minimal structural types and restart-scoped settings**

Keep `DshSessionEvent` generic and add only named narrow payloads consumed by recovery. Add overloads before the existing `on(event: string, listener: DshEventListener, options?: unknown)` overload:

```ts
on?(
  event: "agent/request-error",
  listener: (frame: AgentRequestErrorFrame, next: () => Promise<DshRequestErrorAction>) => Promise<DshRequestErrorAction>,
  options?: boolean | { prepend?: boolean; global?: boolean }
): unknown;
on?(
  event: "agent/turn-stopping",
  listener: (frame: AgentTurnStoppingFrame) => void | Promise<void>,
  options?: boolean | { prepend?: boolean; global?: boolean }
): unknown;
```

Add `runtimeRecovery` to both Schemastery objects. Normalize status/code/route arrays without mutating caller input; lowercase normalized codes; trim routes and deduplicate only exact normalized `(provider, model)` pairs; floor finite limits then clamp to `0..10`; preserve the configured prompt string. `resolveConfig()` must return fresh arrays, route objects, and nested recovery objects on every call. Keep settings registration `{ applies: "restart" }` and all flat v0.6 keys unchanged.

- [ ] **Step 5: Run GREEN and verify no runtime behavior or lib generation leaked in**

```powershell
Invoke-DsmmRuntimeRecoveryMirrorTests @("test/runtime-recovery-types.test.ts", "test/settings.test.ts", "test/model-routing.test.ts")
rg "agent/request-error|agent/turn-stopping|requestHeader" "dsmm/src/dsh-types.ts" "dsmm/test/runtime-recovery-types.test.ts"
rg "runtimeRecovery" "dsmm/src/settings.ts" "dsmm/test/settings.test.ts"
$currentLibIdentity = Get-DsmmLibIdentity
if ($currentLibIdentity -ne $dsmmLibBaselineIdentity) { throw "dsmm/lib changed before Task 7: $currentLibIdentity" }
```

Expected: all named tests PASS; structural searches show the exact new contracts; model-routing regressions remain green; working-tree lib identity is unchanged.

**Suggested commit message (do not execute):** `feat(dsmm): add runtime recovery settings and DSH contracts`

---

### Task 2: Pure failure classification and durable event folding

**Files:**
- Create: `dsmm/src/recovery-policy.ts`
- Create: `dsmm/test/recovery-policy.test.ts`

**Interfaces:**
- Consumes: Task 1 `DshLlmFailure`, `DshSessionEvent`, narrow durable payloads, `DsmmRecoveryRoute`, and `DsmmRuntimeRecoverySettings`.
- Produces:
  - `RecoveryFailureDecision = { kind: "retryable"; matchedBy: "status" | "code" } | { kind: "ignored" }`
  - `classifyRecoveryFailure(failure, settings): RecoveryFailureDecision`
  - `foldAttemptedRecoveryRoutes(events, turn, step): DsmmRecoveryRoute[]`
  - `DurableRecoveryWork { incompleteTodo: boolean; activeGoal: boolean }`
  - `foldDurableRecoveryWork(events): DurableRecoveryWork`
  - `selectFallbackRoute({ failedRoute, attemptedRoutes, fallbackRoutes, maxFallbackAttempts }): DsmmRecoveryRoute | undefined`

**Integration boundary:** Every export is deterministic and side-effect free. This task imports no Cordis context, agent controller, logger, timer, provider adapter, or message helper and appends no event.

- [ ] **Step 1: Write the failing exact classifier table**

Cover these exact decisions:

```ts
const failure = (overrides: Partial<DshLlmFailure>): DshLlmFailure => ({
  message: "sensitive provider failure",
  code: "OTHER",
  ...overrides
});
assert.deepEqual(classifyRecoveryFailure(failure({ status: 429 }), settings), { kind: "retryable", matchedBy: "status" });
assert.deepEqual(classifyRecoveryFailure(failure({ status: 401, code: "ETIMEDOUT" }), settings), { kind: "retryable", matchedBy: "code" });
assert.deepEqual(classifyRecoveryFailure(failure({ status: 401, code: "etimedout" }), settings), { kind: "retryable", matchedBy: "code" });
assert.deepEqual(classifyRecoveryFailure(failure({ status: 401, code: "prefix-etimedout" }), settings), { kind: "ignored" });
assert.deepEqual(classifyRecoveryFailure(failure({ status: 401, message: "ETIMEDOUT 429" }), settings), { kind: "ignored" });
assert.deepEqual(classifyRecoveryFailure(failure({ status: 429, code: "ETIMEDOUT", providerRetryAfterMs: 60_000 }), settings), { kind: "retryable", matchedBy: "status" });
```

Use settings with `retryOnStatusCodes: [429, 503]` and `retryOnCodes: ["etimedout"]`. Also assert missing/non-integer status and non-string code are ignored through casted malformed inputs. There must be no delay/timer assertion because `providerRetryAfterMs` is host metadata only.

- [ ] **Step 2: Write failing exact request-header, todo, goal, and selector tables**

For `foldAttemptedRecoveryRoutes()`, use exact `step/start { turn, step }`, `request/header { header: { config }, reason }`, and `step/end { turn, step }` events. Headers have no coordinates of their own. Seed the requested step with the latest valid request header in force before its matching `step/start`, because rc.2 omits an unchanged header in a later step; then append valid header changes enclosed before the matching `step/end` or a later boundary. Require valid non-empty provider/model strings, ordered first occurrence, and exact-pair deduplication. Include headers outside a step, inside another turn/step, after the matching step end, malformed headers/reasons/boundaries, repeated host retries on the same route, and case-distinct routes.

Add an explicit inherited-header cap regression: place primary route `primary/a` in the latest valid header before `step/start { turn: 4, step: 2 }`, omit an unchanged primary header inside the step, then append fallback `fallback/b` as a `change` header inside the step. The fold must return `[primary/a, fallback/b]`, and `selectFallbackRoute()` with `maxFallbackAttempts: 1` must return `undefined` rather than incorrectly selecting `fallback/c`.

For `foldDurableRecoveryWork()`, cover:

1. `todo/write` before the latest `turn/start` is stale.
2. The latest valid `todo/write` after that start is incomplete for `pending` or `in_progress`.
3. A later all-`completed` write clears todo eligibility.
4. The latest valid version-1 non-clear `goal/change` remains eligible only while `goal.phase === "active"`, independent of turn start. `paused`, `blocked`, `complete`, and a valid `operation: "clear"` tombstone clear eligibility.
5. Malformed todo/goal data is ignored rather than treated as unfinished.

For `selectFallbackRoute()`, use primary route `primary/a` and fallbacks `[fallback/b, fallback/c]`; require `fallback/b` first, skip failed/attempted duplicates, choose `fallback/c` after durable history records `fallback/b`, and return `undefined` when two distinct post-primary routes already consume `maxFallbackAttempts: 2`. Require `maxFallbackAttempts: 0` to disable selection.

- [ ] **Step 3: Run RED**

```powershell
Invoke-DsmmRuntimeRecoveryMirrorTests @("test/recovery-policy.test.ts")
```

Expected: FAIL because `lib/recovery-policy.js` and every named pure export are absent.

- [ ] **Step 4: Implement the minimal pure policy**

Classification checks integer `failure.status` membership first, then lowercased exact `failure.code` membership, and otherwise returns `{ kind: "ignored" }`. It never reads `message` or `providerRetryAfterMs`.

`foldAttemptedRecoveryRoutes()` scans raw events in order, remembers the latest valid header before the requested `step/start`, seeds the route list from that inherited header, reads enclosed exact `{ header, reason }` changes through `header.config`, exits at the matching `step/end` or any later step/turn boundary, and returns fresh route objects. A malformed pre-step header never replaces the previous valid seed. `foldDurableRecoveryWork()` finds the final `turn/start` index, folds only the newest valid todo write after it, and folds the latest valid version-1 goal snapshot or clear tombstone across the full durable list.

`selectFallbackRoute()` treats `attemptedRoutes` as the ordered, deduplicated request-header history. The first attempted route is the original route; every later distinct route consumes one fallback attempt. It returns the first configured route that is not the failed route and not already attempted only while that count is below the configured cap.

- [ ] **Step 5: Run GREEN and scan for prohibited side effects**

```powershell
Invoke-DsmmRuntimeRecoveryMirrorTests @("test/recovery-policy.test.ts", "test/runtime-recovery-types.test.ts", "test/settings.test.ts")
rg -n "setTimeout|setInterval|agent/request|agent/turn-stopping|\.append\(|\.steer\(|llm/retry|message" "dsmm/src/recovery-policy.ts"
$currentLibIdentity = Get-DsmmLibIdentity
if ($currentLibIdentity -ne $dsmmLibBaselineIdentity) { throw "dsmm/lib changed before Task 7: $currentLibIdentity" }
```

Expected: all named tests PASS; the prohibited-side-effect search prints nothing (the classifier must not read `message`); working-tree lib identity is unchanged.

**Suggested commit message (do not execute):** `feat(dsmm): add pure runtime recovery policy`

---

### Task 3: Host-first fallback request hooks and model-routing order

**Files:**
- Create: `dsmm/src/runtime-recovery.ts`
- Create: `dsmm/test/runtime-recovery.test.ts`
- Modify: `dsmm/src/index.ts`
- Modify: `dsmm/test/settings.test.ts`
- Modify: `dsmm/test/model-routing.test.ts`

**Interfaces:**
- Consumes: Tasks 1-2 types/pure helpers, `DeepworkModeController.active()`, `resolveSelectedAgentPreset()`, `isDsmmRoleId()`, and the current live settings getter.
- Produces:
  - `registerRuntimeRecovery(ctx: DshContext, controller: DeepworkModeController, getSettings: () => DsmmSettings): void`
  - one default-order `agent/request` pending-handoff listener.
  - one `{ prepend: true }` `agent/request-error` listener that awaits downstream host policy first.
  - internal `PendingRecoveryRoute { turn: number; step: number; route: DsmmRecoveryRoute }` entries in a `WeakMap<DshAgent, PendingRecoveryRoute>`.

**Integration boundary:** This task implements route fallback only. It does not register turn-stopping yet, steer, add timers, emit events, discover providers, or change `model-routing.ts`; Task 4 adds continuation independently.

- [ ] **Step 1: Build a failing listener harness and host-first waterfall tests**

The harness captures listeners and options, composes prepend listeners outside default listeners, records `next()` order, exposes effect cleanup, and creates agents with mutable durable events plus `requestHeader()`.

Cover all exact cases:

1. Downstream returns `const hostRetry = { kind: "retry" } as const`; recovery returns the same object reference, never reads `requestHeader()`, and the next request is unchanged.
2. Downstream rejection propagates unchanged and no DSMM warning/fallback is produced.
3. Disabled recovery, aborted signal, inactive/non-DSMM scope, non-retryable failure, missing header, and event-provider/header-provider mismatch return downstream `undefined` with no pending handoff.
4. Retryable `429` with downstream `undefined`, active scope, matching latest header, and unattempted configured route returns `{ kind: "retry" }`.
5. The repeated exact agent/turn/step request changes only provider/model, deletes prior `reasoningEffort`, preserves nested fields by identity, and consumes the pending handoff once.
6. A different agent, turn, or step never consumes the pending route; a later exact coordinate can consume it.
7. Durable request-header history skips an already attempted route after registration disposal/recreation and enforces `maxFallbackAttempts` without cross-process state.
8. Session `append()` stays at zero and durable events contain no `llm/retry`.
9. A DSMM internal classification/header/folding exception logs one sanitized warning and returns the downstream host decision; a `next()` exception is not swallowed.

- [ ] **Step 2: Add a failing composed v0.6 model-routing regression**

Use the real `registerRuntimeRecovery()` and `registerModelRouting()` against one fake waterfall registry. Register recovery first; register model routing second with its existing prepend option. Schedule a fallback from `primary/primary-model` to `deepseek-official/deepseek-v4-pro`, then dispatch repeated `agent/request` with a downstream object containing prior `reasoningEffort: "low"` and unknown nested fields.

Record the order and require:

```ts
assert.deepEqual(order, ["model-routing:before-next", "recovery:before-next", "base", "recovery:after-next", "model-routing:after-next"]);
assert.equal(result.provider, "deepseek-official");
assert.equal(result.model, "deepseek-v4-pro");
assert.equal(result.reasoningEffort, "high");
assert.equal(result.unknownNested, downstream.unknownNested);
```

The fake resolver must receive only the final fallback route. This locks the fallback request hook downstream of the existing outer model-routing hook and proves adapter calibration occurs after stale reasoning effort is removed.

Add a second composed dispatch with `runtimeRecovery.enabled: false` and an already exact `deepseek-official/deepseek-v4-pro` downstream route. Require no request-error fallback state, but require the unchanged v0.6 model-routing listener to resolve and add advertised `reasoningEffort: "high"`. Existing prompt, skill, guard, and LSP suites remain part of Task 7, proving recovery disablement does not disable those independent features.

- [ ] **Step 3: Run RED**

```powershell
Invoke-DsmmRuntimeRecoveryMirrorTests @("test/runtime-recovery.test.ts", "test/model-routing.test.ts", "test/settings.test.ts")
```

Expected: FAIL because `registerRuntimeRecovery`, request-error registration, pending handoff, and root integration are absent.

- [ ] **Step 4: Implement the host-first request-error and one-shot request flow**

The request-error listener must have this control order:

```ts
const downstream = await next();
if (downstream?.kind === "retry") return downstream;
try {
  const currentSettings = getSettings();
  const settings = currentSettings.runtimeRecovery;
  if (!settings.enabled || frame.signal.aborted) return downstream;
  const preset = resolveSelectedAgentPreset(frame.agent.session);
  const inScope = controller.active(frame.agent, currentSettings.defaultActive) || isDsmmRoleId(preset);
  if (!inScope || classifyRecoveryFailure(frame.failure, settings).kind !== "retryable") return downstream;
  const header = frame.agent.session.requestHeader?.();
  if (header === undefined || header.config.provider !== frame.provider) return downstream;
  const route = selectFallbackRoute({
    failedRoute: { provider: header.config.provider, model: header.config.model },
    attemptedRoutes: foldAttemptedRecoveryRoutes(frame.agent.session.events, frame.turn, frame.step),
    fallbackRoutes: settings.fallbackRoutes,
    maxFallbackAttempts: settings.maxFallbackAttempts
  });
  if (route === undefined) return downstream;
  pendingByAgent.set(frame.agent, { turn: frame.turn, step: frame.step, route });
  return { kind: "retry" };
} catch {
  (ctx.logger)?.warn("dsmm runtime recovery could not evaluate fallback; preserving the host request-error decision");
  return downstream;
}
```

Read the failed route only from `frame.agent.session.requestHeader()?.config`; require exact provider equality with `frame.provider`. Fold matching durable headers and choose only a configured unattempted route. Do not call provider APIs or use `providerRetryAfterMs`.

The default-order request listener first awaits `next()`, then looks up the live agent. On an exact turn/step match, delete the pending entry before returning a new object. Destructure away `reasoningEffort`, preserve every other field/reference, and set configured provider/model. On no exact match, return the original downstream object reference.

At module scope, use a `WeakSet<DshContext>` to prevent duplicate root registration. Capture functional listener disposers. An effect cleanup calls disposers, resets the pending `WeakMap`, and removes the context from the set so a replacement lifecycle can register cleanly.

In `index.apply()`, call `registerRuntimeRecovery(ctx, controller, getSettings)` immediately before the existing `registerModelRouting(ctx, controller, getSettings)` call. Add a registration-order assertion in `settings.test.ts`: recovery's default request and prepend request-error listener registrations must occur before the `['llm']` model-routing injection; the existing settings/systemPrompt injection remains unchanged.

- [ ] **Step 5: Run GREEN and prove order/non-event boundaries**

```powershell
Invoke-DsmmRuntimeRecoveryMirrorTests @("test/runtime-recovery.test.ts", "test/model-routing.test.ts", "test/settings.test.ts", "test/recovery-policy.test.ts")
rg -n "registerRuntimeRecovery|registerModelRouting" "dsmm/src/index.ts"
rg -n "llm/retry|setTimeout|setInterval|providerRetryAfterMs|\.append\(" "dsmm/src/runtime-recovery.ts"
$currentLibIdentity = Get-DsmmLibIdentity
if ($currentLibIdentity -ne $dsmmLibBaselineIdentity) { throw "dsmm/lib changed before Task 7: $currentLibIdentity" }
```

Expected: all named tests PASS; index search shows recovery immediately before model routing; prohibited runtime constructs print no matches except that `providerRetryAfterMs` must also be absent; lib identity is unchanged.

**Suggested commit message (do not execute):** `feat(dsmm): add bounded host-first fallback hooks`

---

### Task 4: Durable-work continuation and complete registration lifecycle

**Files:**
- Modify: `dsmm/src/runtime-recovery.ts`
- Modify: `dsmm/test/runtime-recovery.test.ts`
- Modify: `dsmm/test/settings.test.ts`

**Interfaces:**
- Consumes: Task 2 `foldDurableRecoveryWork()`, Task 3 registration/state, `createUserMessage()` from `@deepseek-ai/dsh-llm`, current scope resolution, and live recovery settings.
- Produces:
  - one default-order `agent/turn-stopping` serial listener.
  - internal `ContinuationCounter { turn: number; count: number }` entries in `WeakMap<DshAgent, ContinuationCounter>`.
  - a complete three-listener registration lifecycle whose cleanup resets both process-local maps.

**Integration boundary:** Continuation queues only the configured user message through the current agent. It does not issue a provider call, start a turn, poll, persist a synthetic plugin note, resume a child, or add automatic subagent follow-up.

- [ ] **Step 1: Add failing todo/goal turn-stopping eligibility tests**

Cover these exact serial-listener cases:

1. Enabled recovery + enabled continuation + active scope + non-aborted signal + current `pending` todo steers once.
2. Current `in_progress` todo steers; all-`completed` todo does not.
3. A todo written before the latest `turn/start` does not steer.
4. Latest version-1 goal snapshot phase `active` steers without a todo; latest `paused`, `blocked`, `complete`, valid clear tombstone, malformed, or absent goal does not.
5. A selected DSMM preset is in scope even when deepwork mode is inactive; ordinary inactive scope is not.
6. Recovery disabled, continuation disabled, aborted signal, and `maxContinuations: 0` do not steer.
7. Repeated stopping on one turn stops exactly at the configured cap; a new turn receives a fresh cap.
8. The steered value equals `createUserMessage({ content: [{ type: "text", text: configuredPrompt }], source: { kind: "user" } })` structurally.
9. A steering rejection consumes one bounded attempt, logs one sanitized warning, and does not reject turn shutdown.

The warning assertion must reject the configured prompt text, thrown error text, todo content, goal text, credentials, and provider error bodies.

- [ ] **Step 2: Add failing registration, disposal, and process-local cleanup tests**

Assert exactly one listener for each of `agent/request`, `agent/request-error`, and `agent/turn-stopping` after duplicate `registerRuntimeRecovery()` calls. Assert request is default order, request-error has `{ prepend: true }`, and turn-stopping is default order.

Capture all returned listener disposers and the effect cleanup. Schedule a pending fallback and consume one continuation slot, run cleanup, and assert:

- every disposer runs once;
- no disposed listener is callable through the harness registry;
- re-registration succeeds once;
- the old pending route no longer applies;
- the old continuation count no longer suppresses one eligible steer in the replacement lifecycle.

Assert no `subagent/end` listener is registered and no code path synthesizes a parent follow-up.

- [ ] **Step 3: Run RED**

```powershell
Invoke-DsmmRuntimeRecoveryMirrorTests @("test/runtime-recovery.test.ts", "test/settings.test.ts")
```

Expected: FAIL because no turn-stopping listener, continuation count, steering behavior, or complete three-listener cleanup exists.

- [ ] **Step 4: Implement bounded continuation and full cleanup**

Register `agent/turn-stopping` at default order. In the listener, read current settings and return unless both recovery/continuation toggles, scope, signal, durable unfinished-work fold, and cap are eligible. Keep one `{ turn, count }` entry per live agent so a new turn replaces the old count rather than growing an unbounded turn map.

Increment/reserve the count before awaiting `agent.steer()` so repeated steering failures cannot create an unbounded retry loop. Call `createUserMessage()` with exactly one text block and `source: { kind: "user" }`. Catch steering errors, warn with only a fixed sanitized sentence plus turn number, and return normally.

Extend Task 3 cleanup to reset both `WeakMap` instances. Listener-registration failures remove the context from the module `WeakSet`, dispose already-created listeners, clear state, and rethrow so partial registration cannot survive.

- [ ] **Step 5: Run GREEN and prove no unsupported recovery path exists**

```powershell
Invoke-DsmmRuntimeRecoveryMirrorTests @("test/runtime-recovery.test.ts", "test/recovery-policy.test.ts", "test/settings.test.ts", "test/model-routing.test.ts")
rg -n "subagent/end|setTimeout|setInterval|llm/retry|providerRetryAfterMs|abort\(|\.append\(" "dsmm/src/runtime-recovery.ts"
rg -n "agent/request|agent/request-error|agent/turn-stopping" "dsmm/src/runtime-recovery.ts" "dsmm/test/runtime-recovery.test.ts"
$currentLibIdentity = Get-DsmmLibIdentity
if ($currentLibIdentity -ne $dsmmLibBaselineIdentity) { throw "dsmm/lib changed before Task 7: $currentLibIdentity" }
```

Expected: all named tests PASS; the prohibited-path search prints nothing; listener search shows exactly the intended three event names; lib identity is unchanged.

**Suggested commit message (do not execute):** `feat(dsmm): add bounded durable-work continuation`

---

### Task 5: Public exports, documentation, and package surface

**Files:**
- Modify: `dsmm/src/index.ts`
- Modify: `dsmm/test/package.test.ts`
- Modify: `dsmm/package.json`
- Modify: `dsmm/README.md`
- Create: `dsmm/docs/runtime-recovery.md`

**Interfaces:**
- Consumes: completed Tasks 1-4 public settings, pure helpers, and registration function.
- Produces from package root:
  - `classifyRecoveryFailure`, `foldAttemptedRecoveryRoutes`, `foldDurableRecoveryWork`, `selectFallbackRoute`, and `registerRuntimeRecovery` function exports.
  - `RecoveryFailureDecision`, `DurableRecoveryWork`, `DsmmRecoveryRoute`, `DsmmRuntimeRecoverySettings`, and the narrow public DSH recovery type exports.
  - shipped `docs/runtime-recovery.md` and README link/configuration sketch.

**Integration boundary:** This task changes documentation/package metadata and root exports only. It does not change listener behavior, generated lib, Docker proof, or roadmap implementation status.

- [ ] **Step 1: Add failing package/export/document contract assertions**

In `package.test.ts`:

- require `docs/runtime-recovery.md` in `package.json.files` and in the exact README local-doc link list;
- dynamically import `../lib/index.js` in mirror tests and require every function export named above;
- assert recovery docs name exact defaults, `0..10` bounds, host-first retry, exact status/code matching, durable route headers, one-shot `(agent, turn, step)` fencing, stale reasoning-effort removal, todo/goal eligibility, cold-restart behavior, and disable isolation;
- assert the subagent section distinguishes continuable from one-shot children, calls live `subagent/end` diagnostic only, reconstructs from parent `subagent/descriptor` plus child durable `turn/end`, and tells users to continue the known child session explicitly;
- assert docs deny fake `llm/retry`, timers, cross-process automatic retry, provider discovery, provider-message classification, and automatic parent follow-up.

- [ ] **Step 2: Run RED**

```powershell
Invoke-DsmmRuntimeRecoveryMirrorTests @("test/package.test.ts", "test/runtime-recovery.test.ts", "test/recovery-policy.test.ts")
```

Expected: FAIL because root exports and `docs/runtime-recovery.md` package/README contracts are missing.

- [ ] **Step 3: Export the approved public surface**

Add value exports from `recovery-policy.ts` and `runtime-recovery.ts`; add type exports from those modules, `settings.ts`, and `dsh-types.ts`. Preserve every v0.6 export and keep `apply()` registration order unchanged.

- [ ] **Step 4: Write and ship the exact recovery documentation**

Create `runtime-recovery.md` with these sections:

1. **Scope and defaults** — nested settings, exact defaults, `0..10` caps, opt-in/disabled isolation.
2. **Host retry and fallback** — host decision wins, exact classifier, matching header/provider, durable attempted routes, configured-order selection, one-shot fencing, no timer/provider call.
3. **Request ordering** — runtime request listener downstream of prepend model routing; fallback removes stale adapter effort; outer routing calibrates only the final exact official V4 Pro route.
4. **Durable continuation** — current todo after latest turn start or latest active goal, per-agent/turn cap, steering failure behavior.
5. **Cold restart** — route history reconstructable; process-local pending/count state is not; no continuation until user/host resumes a turn.
6. **Subagent recovery** — continuable versus one-shot, live-only diagnostic end, descriptor plus child turn-end reconstruction, explicit continuation of the known child.
7. **Non-goals and logging** — all prohibited automation/events/classifiers and sanitized warnings.

Add the exact file path to `dsmm/package.json.files`. Add a README v0.7 section/link and extend the YAML sketch with the nested defaults. Do not edit the roadmap yet.

- [ ] **Step 5: Run GREEN and inspect denial language/package scope**

```powershell
Invoke-DsmmRuntimeRecoveryMirrorTests @("test/package.test.ts", "test/runtime-recovery.test.ts", "test/recovery-policy.test.ts", "test/model-routing.test.ts")
rg -n "runtimeRecovery|runtime-recovery" "dsmm/src/index.ts" "dsmm/package.json" "dsmm/README.md" "dsmm/docs/runtime-recovery.md" "dsmm/test/package.test.ts"
rg -n "subagent/descriptor|subagent/end|turn/end|llm/retry|cross-process|provider discovery" "dsmm/docs/runtime-recovery.md"
$currentLibIdentity = Get-DsmmLibIdentity
if ($currentLibIdentity -ne $dsmmLibBaselineIdentity) { throw "dsmm/lib changed before Task 7: $currentLibIdentity" }
```

Expected: all named tests PASS; searches show the shipped public contract and explicit recovery boundaries; lib identity is unchanged.

**Suggested commit message (do not execute):** `docs(dsmm): document and export runtime recovery`

---

### Task 6: Pinned DSH rc.2 fallback and continuation proof

**Files:**
- Modify: `dsmm/scripts/docker-smoke.mjs`
- Modify: `dsmm/test/docker-smoke-assets.test.ts`

**Interfaces:**
- Consumes: packed DSMM root exports; pinned `agentEvents(ctx, agent)` rc.2 dispatcher; real request-error and request waterfalls plus the turn-stopping serial contract; existing fake LLM adapter and mounted core services.
- Produces: exactly one `RUNTIME_RECOVERY_FALLBACK_OK` marker and one `RUNTIME_RECOVERY_CONTINUATION_OK` marker before the existing final `DSMM_PACKAGED_RUNTIME_SMOKE_OK`, with zero paid/provider stream calls.

**Integration boundary:** This task changes only smoke code/static smoke assertions. It proves the packed package against pinned rc.2 and preserves every existing package, model-routing, safety, skills, preset, and LSP marker.

- [ ] **Step 1: Add failing exact smoke-asset assertions**

Extend `docker-smoke-assets.test.ts` to require:

- runtime recovery settings with primary and exact official fallback routes;
- a structural fake agent whose session exposes durable `events`, `requestHeader()`, and `append()` and whose `steer()` records messages;
- `runtime.agentEvents(ctx, agent).waterfall("agent/request-error", errorPayload, async () => hostRetry)` followed by the host-declined `async () => undefined` case;
- the host retry singleton winning by object identity;
- the host-declined DSMM retry followed by `.waterfall("agent/request", { turn, step, signal }, async () => downstream)`;
- a durable `step/start`, exact `{ header: { config }, reason }` request-header append, and `step/end` sequence containing the returned fallback config and a fold proving both routes;
- `.serial("agent/turn-stopping", { turn, signal })` for unfinished and completed todo cases;
- absence of `llm/retry` events and `streamCalls === 0`;
- each new marker exactly once and ordered before the final packaged-runtime marker.

- [ ] **Step 2: Run RED**

```powershell
Invoke-DsmmRuntimeRecoveryMirrorTests @("test/docker-smoke-assets.test.ts")
```

Expected: FAIL because the pinned smoke has only the v0.6 model-routing waterfall and lacks request-error fallback and turn-stopping continuation proof.

- [ ] **Step 3: Implement the real host-first/fallback structural dispatch**

Add `smokeRuntimeRecovery(runtime, dsmm, installedPackageRoot)` after the existing model-routing smoke. Mount DSMM with recovery enabled, statuses `[429]`, fallback route `deepseek-official/deepseek-v4-pro`, `maxFallbackAttempts: 2`, continuation enabled with cap `1`, and model calibration `auto/high`. Register the existing no-network fake adapter for the official route.

Use this exact external request-error payload shape; `agentEvents()` injects the agent itself:

```js
const errorPayload = {
  turn: 7,
  step: 2,
  provider: "primary",
  failure: {
    status: 429,
    code: "rate_limit",
    message: "sensitive smoke provider body",
    providerRetryAfterMs: 60_000
  },
  retryPolicy: { owner: "host" },
  signal
};
```

First make a downstream host listener return one frozen `{ kind: "retry" }` and assert exact identity plus no pending route on a repeated request. Then make the same downstream listener decline via `next()`, require DSMM `{ kind: "retry" }`, and dispatch the repeated request. Require final official provider/model, v0.6 calibrated `reasoningEffort: "high"`, preservation of unknown/nested fields, and no old primary effort.

Build the durable sequence with `step/start { turn: 7, step: 2 }`, primary `request/header { header: { config: primaryConfig }, reason: "initial" }`, repeated fallback `request/header { header: { config: result }, reason: "change" }`, and matching `step/end`. Call packed `foldAttemptedRecoveryRoutes()` and require `[primary/primary-model, deepseek-official/deepseek-v4-pro]`. Assert no durable event has type `llm/retry`, `providerRetryAfterMs` caused no timer, and adapter `stream()` was never entered.

- [ ] **Step 4: Implement the real turn-stopping serial dispatch**

Create one scoped structural agent with exact durable events:

```js
[
  { type: "deepwork/mode", data: { active: true } },
  { type: "turn/start", data: { turn: 8 } },
  { type: "todo/write", data: { todos: [{ content: "Ship v0.7", status: "in_progress" }] } }
]
```

Dispatch `serial("agent/turn-stopping", { turn: 8, signal })` twice and require exactly one recorded steer because the cap is one. Create another scoped agent whose latest todo statuses are all `completed`; require zero steers. Assert the one message contains the configured continuation prompt and no synthetic child/session identifier.

Print each recovery marker once only after its assertions pass. Preserve all existing marker assertions and cleanup of context, adapter, agent handles, disposable profile/home/workspace, and image.

- [ ] **Step 5: Run static GREEN, then the real pinned packaged-runtime gate**

```powershell
Invoke-DsmmRuntimeRecoveryMirrorTests @("test/docker-smoke-assets.test.ts")
$currentLibIdentity = Get-DsmmLibIdentity
if ($currentLibIdentity -ne $dsmmLibBaselineIdentity) { throw "dsmm/lib changed before Task 7: $currentLibIdentity" }
pnpm --filter dsmm smoke:docker
if ($LASTEXITCODE -ne 0) { throw "DSMM pinned Docker recovery smoke failed" }
```

Expected: static test PASS; lib identity remains the captured v0.6 baseline; Docker prints both new recovery markers exactly once plus all existing markers and final `DSMM_PACKAGED_RUNTIME_SMOKE_OK`; no provider stream executes.

**Suggested commit message (do not execute):** `test(dsmm): prove runtime recovery on pinned DSH`

---

### Task 7: Authoritative lib generation, full gates, and common-identity review

**Files:**
- Modify after Task 6 passes: `dsmm/docs/roadmap.md`
- Regenerate exactly once for the current source revision: `dsmm/lib/**`
- Verify only: all Task 1-6 source/tests/docs/package/smoke files plus preserved v0.6 working-tree changes.

**Interfaces:**
- Consumes: completed Tasks 1-6, unchanged preserved HEAD/lib baseline, and successful pinned recovery/package markers.
- Produces: implemented v0.7 roadmap status, synchronized generated exports, exact packed inventory, all DSMM/root/Docker evidence, one canonical working-tree identity, and matching approved Oracle/Reviewer receipts.

**Integration boundary:** This is the only working-tree generation task and the final acceptance boundary. It introduces no new runtime design. Any source correction exits this task, returns to the owning task, and restarts this entire task at the RED/pre-generation check.

- [ ] **Step 1: Mark v0.7 implemented only after packaged proof exists**

Confirm Task 6 output contains both recovery markers and `DSMM_PACKAGED_RUNTIME_SMOKE_OK`. Then add this sentence directly under `## v0.7 — Runtime recovery`:

```md
Status: implemented in v0.7 with host-first request-error policy, bounded configured route fallback reconstructed from durable request headers, opt-in todo/goal continuation, documented subagent recovery boundaries, and pinned DSH rc.2 packaged-runtime coverage.
```

Do not change v0.8+ scope or claim automatic subagent follow-up.

- [ ] **Step 2: Run the expected failing generated-module RED check**

First re-assert HEAD and the pre-Task-1 lib identity:

```powershell
$head = (@(git rev-parse HEAD) -join "`n").Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne "cedd30b1abd03cf00b9ce330fa3b1805d76cb401") { throw "unexpected HEAD: $head" }
$preGenerationLibIdentity = Get-DsmmLibIdentity
if ($preGenerationLibIdentity -ne $dsmmLibBaselineIdentity) { throw "working-tree dsmm/lib changed before final generation" }

$missingGenerated = @(
  "dsmm/lib/recovery-policy.js",
  "dsmm/lib/recovery-policy.d.ts",
  "dsmm/lib/runtime-recovery.js",
  "dsmm/lib/runtime-recovery.d.ts"
) | Where-Object { Test-Path -LiteralPath $_ }
if ($missingGenerated.Count -ne 0) { throw "v0.7 generated modules appeared before Task 7: $($missingGenerated -join ', ')" }
throw "EXPECTED RED: v0.7 generated recovery modules are absent before authoritative generation"
```

Expected: the command reaches only the final explicit `EXPECTED RED` failure. An earlier failure means HEAD or reviewed v0.6 lib state was not preserved and blocks generation.

- [ ] **Step 3: Generate working-tree lib exactly once for this complete source revision**

```powershell
pnpm --filter dsmm build
if ($LASTEXITCODE -ne 0) { throw "authoritative DSMM build failed" }
```

Do not run another command that invokes `dsmm/package.json`'s `build` script while this source revision is unchanged. Inspect generated exports:

```powershell
foreach ($path in @(
  "dsmm/lib/recovery-policy.js",
  "dsmm/lib/recovery-policy.d.ts",
  "dsmm/lib/runtime-recovery.js",
  "dsmm/lib/runtime-recovery.d.ts"
)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "missing generated recovery module: $path" }
}
rg "classifyRecoveryFailure|foldAttemptedRecoveryRoutes|foldDurableRecoveryWork|selectFallbackRoute|registerRuntimeRecovery|runtimeRecovery" "dsmm/lib"
```

Expected: new JS/declaration/map files exist, root declarations expose the recovery surface, settings declarations contain the nested shape, and all reviewed v0.6 generated modules remain.

- [ ] **Step 4: Run DSMM type/test gates without rebuilding lib**

```powershell
pnpm --dir ".\dsmm" exec tsc -p ".\tsconfig.test.json" --noEmit
if ($LASTEXITCODE -ne 0) { throw "DSMM test typecheck failed" }
pnpm --dir ".\dsmm" exec node --test --experimental-strip-types "test/*.test.ts"
if ($LASTEXITCODE -ne 0) { throw "DSMM tests failed" }
```

Expected: test typecheck exits `0`; all DSMM tests pass, including exact structural, pure, hook, package, smoke-asset, and preserved v0.6 suites. These direct commands do not invoke a second DSMM build.

- [ ] **Step 5: Verify exact npm pack dry-run inventory**

```powershell
$packJson = @(npm pack ".\dsmm" --dry-run --json)
if ($LASTEXITCODE -ne 0) { throw "DSMM npm pack dry-run failed" }
$pack = ($packJson -join "`n") | ConvertFrom-Json
$paths = @($pack[0].files | ForEach-Object { $_.path })
$required = @(
  "lib/index.js", "lib/index.d.ts",
  "lib/model-routing.js", "lib/model-routing.d.ts",
  "lib/recovery-policy.js", "lib/recovery-policy.d.ts",
  "lib/runtime-recovery.js", "lib/runtime-recovery.d.ts",
  "docs/model-routing.md", "docs/runtime-recovery.md",
  "README.md", "package.json"
)
foreach ($path in $required) {
  if ($paths -notcontains $path) { throw "packed dsmm artifact missing $path" }
}
```

Expected: exit `0`, every required path is present, and dry-run creates no tarball.

- [ ] **Step 6: Run pinned Docker and all root gates once on the current revision**

```powershell
pnpm --filter dsmm smoke:docker
if ($LASTEXITCODE -ne 0) { throw "DSMM pinned Docker runtime smoke failed" }
git diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff whitespace check failed" }
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "root typecheck failed" }
pnpm test
$rootTestExit = $LASTEXITCODE
if ($rootTestExit -ne 0) { throw "root tests failed; preserve exact output and report any unrelated Windows Job parallel flake without retrying" }
pnpm run build
if ($LASTEXITCODE -ne 0) { throw "root build failed" }
```

Expected: Docker emits `RUNTIME_RECOVERY_FALLBACK_OK`, `RUNTIME_RECOVERY_CONTINUATION_OK`, `MODEL_ROUTING_WATERFALL_OK`, every existing safety/skills/preset/LSP marker, and `DSMM_PACKAGED_RUNTIME_SMOKE_OK`; diff check and all root gates exit `0`. Do not rerun root tests on unchanged input.

- [ ] **Step 7: Capture one canonical working-tree identity and common review packet**

Use the exact canonical PowerShell wrapper from `skills/v1/requesting-code-review/SKILL.md` rather than reproducing or changing its identity algorithm:

```powershell
$skillPath = Join-Path (Get-Location) "skills/v1/requesting-code-review/SKILL.md"
$extractor = @'
const { readFileSync } = require("node:fs");
const text = readFileSync(process.argv[1], "utf8");
const marker = "<!-- ocmm-review-artifact-" + "identity-js -->";
const at = text.indexOf(marker);
if (at < 0 || text.indexOf(marker, at + marker.length) !== -1) throw new Error("canonical marker missing or duplicate");
const following = text.slice(at + marker.length);
const fence = /^\r?\n```js\r?\n([\s\S]*?)\r?\n```(?:\r?\n|$)/.exec(following);
if (!fence) throw new Error("canonical fence missing or not adjacent");
process.stdout.write(fence[1]);
'@
$scriptLines = @(node -e $extractor $skillPath)
if ($LASTEXITCODE -ne 0 -or $scriptLines.Count -eq 0) { throw "cannot extract canonical review identity module" }
$script = $scriptLines -join "`n"
$artifactIdentityLines = @(node --input-type=module -e $script)
if ($LASTEXITCODE -ne 0 -or $artifactIdentityLines.Count -eq 0) { throw "cannot calculate review artifact identity" }
$artifactIdentity = $artifactIdentityLines -join "`n"
if ($artifactIdentity -notmatch '^sha256:[0-9a-f]{64}$') { throw "canonical review artifact identity has an invalid format" }
$artifactIdentity
```

Construct one packet:

```text
ARTIFACT_KIND: working-tree
ARTIFACT_IDENTITY: value printed by the canonical wrapper
DESCRIPTION: DSMM v0.7 host-first runtime recovery, bounded durable fallback/continuation, exact rc.2 structural types, docs/package integration, generated lib, and pinned runtime proof, preserving reviewed v0.6 model routing
PLAN_OR_REQUIREMENTS: docs/superpowers/plans/2026-08-25-dsmm-runtime-recovery.md and docs/superpowers/specs/2026-08-25-dsmm-runtime-recovery-design.md
BASELINE: HEAD cedd30b1abd03cf00b9ce330fa3b1805d76cb401 plus reviewed uncommitted v0.6 model-routing changes
REVIEW_INPUT: current binary diff from HEAD plus bytewise-sorted non-ignored untracked manifest, as required by requesting-code-review
VERIFICATION_EVIDENCE: Task 7 DSMM typecheck/tests, exact pack inventory, pinned Docker markers, diff check, and root typecheck/test/build captured for this identity
GLOBAL_CONSTRAINTS: the complete Global Constraints section of this plan, verbatim
SOURCE_REVISION_RULE: any reviewer-driven correction to source/tests/docs/package/smoke invalidates lib, all gate evidence, packet, and receipts and restarts Task 7 at generation
```

Send this identical packet in parallel to the first currently callable Oracle lane and the primary Reviewer lane. This is cross-module runtime-safety work: select configured `high` profiles when callable, otherwise the unsuffixed normal profiles. Do not use either lane to review this implementation plan.

- [ ] **Step 8: Accept only matching current-identity receipts; restart on every source correction**

After each lane returns, rerun the canonical identity wrapper. Reject timeout, partial output, missing fields, conditional approval, stale evidence, or identity mismatch. Each accepted receipt records:

```text
role/profile lane: selected Oracle or primary Reviewer profile
task_id or session receipt: durable task/session reference
artifact identity: the common current sha256 identity
verdict: approved
report artifact/source: task result or durable review report source
```

If either lane reports a product/source issue, verify it, return to the owning Task 1-6 with a fresh implementation subagent, apply only the validated correction, and invalidate all generated output, DSMM/root/pack/Docker evidence, packets, and receipts. Restart Task 7 at Step 2 and run exactly one DSMM generation plus the full gates for the corrected source revision. Evidence-only omissions that change no file require the missing gate and a fresh common packet/receipts; they never authorize reuse of a stale conditional receipt.

Final acceptance requires both approved receipts and one final parent recomputation equal to their common identity.

- [ ] **Step 9: Final read-only preservation receipt and handoff**

```powershell
$head = (@(git rev-parse HEAD) -join "`n").Trim()
if ($head -ne "cedd30b1abd03cf00b9ce330fa3b1805d76cb401") { throw "HEAD changed during implementation" }
git status --short
git diff --stat
git diff --check
```

Expected: HEAD is unchanged; reviewed v0.6 plus intended v0.7 spec/plan/source/tests/docs/package/smoke/generated changes remain unstaged; no installation artifacts or unrelated files appear; diff check passes. Report that no Git write occurred and request separate authorization before any commit or push.

**Suggested commit message (do not execute):** `feat(dsmm): complete v0.7 runtime recovery`

---

## Self-review

**Spec coverage:** All acceptance requirements map to Tasks 1-7. Host-first retry and bounded fallback are Task 3; exact pure classification and durable folds are Task 2; todo/goal continuation and process-local cleanup are Task 4; disabled isolation and settings are Tasks 1/3/4; subagent reconstruction limits are Task 5; pinned rc.2 no-network proof is Task 6; current generated/package/repository/review evidence is Task 7.

**Interface consistency:** `DsmmRuntimeRecoverySettings` is the sole resolved recovery settings shape; `DsmmRecoveryRoute` is shared by settings, pure policy, and runtime state; request-error/action/header/turn-stopping signatures match the approved narrow rc.2 contracts; runtime registration receives the existing `DeepworkModeController` and live settings getter; model routing remains the outer prepend request listener while recovery request handoff is default-order downstream.

**Placeholder scan:** Passed. Every task names exact files, interfaces, RED command and named expected failure, minimal implementation behavior, GREEN command/evidence, integration boundary, and a non-executed suggested commit message. No deferred-work marker or unnamed implementation step remains.

**PowerShell scan:** Passed. Commands use PowerShell syntax, quoted explicit project paths/patterns, `$LASTEXITCODE` checks, no Bash `export`, no shell `&&`, no `/dev/null`, and no unsafe unverified recursive deletion.

**Generated-output scan:** Passed. Tasks 1-6 use the temporary mirror and compare a byte-sensitive working-tree `dsmm/lib/**` identity to the preserved reviewed-v0.6 baseline. Task 7 begins with the same identity check and an expected failing absence check, then performs the sole authoritative generation for that source revision.

**Scope check:** The plan adds no fake native retry event, message/regex classifier, timer, polling, session abort, provider discovery, automatic chain construction, cross-process retry/count state, provider call, or automatic subagent follow-up. Existing v0.6 model-routing semantics are protected by a composed ordering regression and all v0.6 gates.

**Verification check:** Targeted tasks stay out of working-tree lib, the pinned Docker proof uses real rc.2 event dispatch with structural fake agents and zero provider stream calls, final pack inventory includes new generated/docs surfaces, all DSMM/root gates run on one source revision, and Oracle plus primary Reviewer receipts bind to one recomputed identity.
