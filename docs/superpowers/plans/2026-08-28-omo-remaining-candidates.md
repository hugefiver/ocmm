# OMO Remaining Candidates Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all nine approved OMO remaining candidates as separately testable runtime, prompt/skill, tooling, and Rust LSP changes, then prove the integrated working tree with generated-artifact parity, repository gates, real MCP formatting QA, and identity-bound review.

**Architecture:** Keep the three native surfaces isolated: TypeScript runtime/model capability, synchronized prompt/skill semantics, and Rust whole-document formatting. Each lane introduces a narrow pure seam or state owner, advances through test-first tasks, and joins only at one official generation wave and one final acceptance packet.

**Tech Stack:** TypeScript 6, Node.js 22 built-in test runner, Zod, Python 3 standard library `unittest`, PowerShell 7, Rust/Cargo, `serde_json`, Windows-only `windows-sys`, MCP JSON-RPC, LSP 3.17 semantics.

**Spec:** `docs/superpowers/specs/2026-08-28-omo-remaining-candidates-design.md`

**Global Constraints:**
- Do not introduce Senpi DAGs, Memory v2, thread/mailbox state, telemetry, native evaluation, unified config migration, persistent goal/assumption ledgers, daemon/IPC/socket infrastructure, resident LSP managers, prompt-async-gate, range/on-type formatting, code actions, formatter installers, or generic workspace-edit transactions.
- Do not create automatic worktrees, pull requests, checkpoints, commits, pushes, tags, or any other Git writes; every task ends with a report checkpoint, and the parent may request separate explicit authorization for final Git writes.
- Use PowerShell 7 syntax and Windows-safe paths for executable commands; never use Bash operators or run the POSIX smoke script from Windows.
- Do not install software or add dependencies except the specification-required Windows-target-only `windows-sys` Cargo dependency.
- Generated artifacts may be changed only by their official generator: `schema.json` via `pnpm run gen-schema`, Codex artifacts via `pnpm run gen:codex-plugin`, and `Cargo.lock` via Cargo dependency resolution; never hand-edit generated copies.
- Any `src/config/schema.ts` change must regenerate `schema.json` in the same integrated working tree.
- Any `prompts/omo/**` change must update `docs/prompt-sync.md`; any `prompts/v1/**` or `skills/v1/**` change must update `docs/v1-maintenance.md` in the same integrated working tree.
- Preserve OpenCode-first explicit configuration, bounded in-memory state, provider scoping, lifecycle/snapshot fencing, existing 429/interruption/idle behavior, and user arrays replacing rather than merging defaults.
- Treat runtime safety and filesystem safety as high-risk: no duplicate ambiguous dispatch, no stale commit, no target pre-delete on Windows, and no completion claim without a common current artifact identity.
- Final source generation occurs once after all source tasks: run `pnpm run gen-schema` once, then `pnpm run build:ts` followed by `pnpm run gen:codex-plugin` once; verification must not rerun either generator.

---

## File Map

### Runtime fallback and configuration

- `src/runtime-fallback/error-classifier.ts` — bounded error-shape extraction and classification precedence.
- `src/runtime-fallback/error-classifier.test.ts` — nested/cyclic/depth/context-overflow classification tests.
- `src/config/schema.ts` — default runtime fallback status list including 402.
- `src/config/schema.test.ts` — replacement/default semantics for status arrays.
- `src/runtime-fallback/dispatcher.ts` — typed dispatch outcome and pre-prompt/current checks.
- `src/runtime-fallback/dispatcher.test.ts` — accepted, rejected, and possibly-accepted boundary tests.
- `src/runtime-fallback/event-handler-support.ts` — lifecycle-owned reservation/pending store and bounded retry-status parsing/tracking.
- `src/runtime-fallback/event-handler-generic-fallback.ts` — shared reservation-aware generic fallback flow.
- `src/runtime-fallback/event-handler.ts` — 402 abort exception, event reconciliation, and `session.status` ingestion.
- `src/runtime-fallback/event-handler-test-fixtures.ts` — focused error/status event factories and controlled prompt fixtures.
- `src/runtime-fallback/event-handler-fallback-dispatch.test.ts` — integrated 402, reservation, stale-generation, and pending tests.
- `src/runtime-fallback/event-handler-status-retry.test.ts` — bounded/deduplicated retry-status behavior.

### Temperature capability

- `src/hooks/model-temperature-capability.ts` — pure provider-scoped capability resolver.
- `src/hooks/model-temperature-capability.test.ts` — metadata precedence, suffix normalization, and provider isolation.
- `src/hooks/chat-params.ts` — provider/model resolver consumption with no unverified host capability extraction.
- `src/hooks/chat-params.test.ts` — hook-level strip/preserve behavior.

### Prompt, research, planning, and executor semantics

- `prompts/omo/deepwork/default.md`, `prompts/omo/deepwork/gpt.md`, `prompts/v1/deepwork/default.md` — proportional scenario and test-seam rules.
- `prompts/omo/category/research.md`, `prompts/v1/category/research.md`, `prompts/codex/category/research.md` — compact provenance contract.
- `skills/v1/writing-plans/SKILL.md` — extrinsic-constraints pass and one executor recommendation per task.
- `skills/v1/subagent-driven-development/SKILL.md` — recommendation consumption under existing routing authority.
- `src/intent/proportional-scenario-contract.test.ts` — structural prompt contract checks.
- `src/intent/research-provenance-contract.test.ts` — cross-workflow provenance checks.
- `src/intent/planning-executor-contract.test.ts` — planning/SDD contract checks.
- `docs/prompt-sync.md`, `docs/v1-maintenance.md` — upstream baseline, local adaptations, and exclusions.

### ast-grep and init-deep

- `skills/ast-grep/scripts/ast_grep_helper.py` — common every-tier binary probe.
- `skills/ast-grep/tests/test_resolver.py` — deterministic fake-candidate resolver tests.
- `skills/ast-grep/tests/smoke.ps1`, `skills/ast-grep/tests/smoke.sh` — preserved platform smoke surfaces.
- `skills/init-deep/SKILL.md` — first AST-shaped measurement and read-only fallback.

### Rust LSP formatting

- `crates/ocmm-lsp/src/main.rs` — tool descriptor/alias, capability negotiation, edit normalization, atomic replacement, and resynchronization.
- `crates/ocmm-lsp/Cargo.toml` — Windows-target-only `windows-sys` dependency.
- `Cargo.lock` — Cargo-generated dependency lock update.
- `crates/ocmm-lsp/tests/mcp_stdio.rs` — MCP/LSP formatting integration and safety tests.
- `crates/ocmm-lsp/tests/fixtures/mock_lsp.mjs` — deterministic formatting capability/edit/resync scenarios.
- `scripts/codemode-execute-compatibility.ts` — strict direct-LSP inventory updated from eight to nine canonical tools.
- `scripts/codemode-execute-compatibility.test.ts` — exact parser acceptance/rejection tests.

### Official generated outputs

- `schema.json` — generated config schema.
- `.agents/plugins/marketplace.json` — generated Codex marketplace metadata.
- `.codex/agents/dw-research.toml` — generated Codex research profile.
- `plugins/deepwork/agents/dw-research.toml` — generated bundled research profile.
- `plugins/deepwork/skills/deepwork-writing-plans/SKILL.md` — generated writing-plans copy.
- `plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md` — generated SDD copy.
- `plugins/deepwork/skills/ast-grep/scripts/ast_grep_helper.py` and `plugins/deepwork/skills/ast-grep/tests/test_resolver.py` — generated ast-grep copies.
- `plugins/deepwork/skills/init-deep/SKILL.md` — generated init-deep copy.

## Dependency Waves

| Wave | Tasks | Parallelism and dependency rule |
|---|---|---|
| 1 | 1, 2, 3, 4, 5, 6 | Run in parallel; file ownership does not overlap across the six lanes. |
| 2 | 7, 8, 9, 10 | Task 7 consumes 1+2; Task 8 follows 4 because it shares sync docs; Task 9 consumes 6; Task 10 consumes 6 and is independent of Task 9 files. |
| 3 | 11, 12, 13 | Task 11 follows 7; Task 12 follows 8 because it shares sync docs; Task 13 follows 9. These three lanes run in parallel. |
| 4 | 14 | Wait for every source task 1-13; perform the only schema/Codex generation pass. |
| 5 | 15 | Run targeted checks, repository gates, diagnostics, and real MCP QA against the generated integrated tree. |
| 6 | 16 | Bind evidence and required reviews to one unchanged working-tree identity; report, but do not perform Git writes. |

## Wave 1 — Independent foundations

### Task 1: Bounded error shape, classification precedence, and default 402

**Depends on:** None

**Files:**
- Modify: `src/runtime-fallback/error-classifier.ts`
- Modify: `src/runtime-fallback/error-classifier.test.ts`
- Modify: `src/config/schema.ts`
- Modify: `src/config/schema.test.ts`
- Generated later by Task 14: `schema.json`

**Interfaces:**
- Consumes: `RuntimeFallbackConfig` from `src/config/schema.ts`; `isRecord(value: unknown): value is Record<string, unknown>`.
- Produces: `BoundedErrorShape`, `readBoundedErrorShape(error: unknown, maxDepth?: number): BoundedErrorShape`, unchanged `classifyError(error, cfg, now): ErrorClassification`, and default status list `[402, 429, 500, 502, 503, 504]`.

**Recommended executor:** `complex`

- [ ] **Step 1: Add failing bounded-shape traversal tests**

Add table-driven tests that assert nested `error/data/cause` status/name/message extraction, root/nested string messages, numeric string codes, root-first stable order, cycle termination, and depth-5 exclusion with default depth 4.

```ts
assert.deepEqual(readBoundedErrorShape({
  error: { data: { cause: { statusCode: "402", name: "QuotaError", message: "quota" } } },
}), { statusCodes: [402], names: ["QuotaError"], messages: ["quota"] })
```

- [ ] **Step 2: Add failing classification and schema-policy tests**

Add exact nested `ContextOverflowError` priority over configured 400, ignored provider `isRetryable` booleans in either direction, ordinary configured 400 retryability, nested 402 retryability, unchanged 429 recovery delay, new default status list, and user-array replacement assertions.

```ts
const overflow = classifyError(
  { status: 400, cause: { name: "ContextOverflowError", message: "compact me" } },
  { ...runtimeConfig, retryOnStatusCodes: [400] },
)
assert.equal(overflow.retryable, false)
assert.equal(overflow.reason, "context overflow")
```

- [ ] **Step 3: Run the focused tests and observe RED**

Run:

```powershell
node --test --experimental-strip-types "src/runtime-fallback/error-classifier.test.ts" "src/config/schema.test.ts"
```

Expected: FAIL because `readBoundedErrorShape` is absent, ContextOverflow currently loses to status 400, and defaults omit 402.

- [ ] **Step 4: Implement the bounded reader**

Use these exact public types and bounded traversal rules:

```ts
export type BoundedErrorShape = {
  statusCodes: number[]
  names: string[]
  messages: string[]
}

export function readBoundedErrorShape(error: unknown, maxDepth = 4): BoundedErrorShape {
  const output: BoundedErrorShape = {
    statusCodes: [], names: [], messages: [],
  }
  const queue: Array<{ value: unknown; depth: number }> = [{ value: error, depth: 0 }]
  const visited = new Set<object>()
  while (queue.length > 0) {
    const current = queue.shift()!
    if (typeof current.value === "string") {
      if (!output.messages.includes(current.value)) output.messages.push(current.value)
      continue
    }
    if (!isRecord(current.value) || visited.has(current.value)) continue
    visited.add(current.value)
    const status = current.value.status ?? current.value.statusCode ?? current.value.code
    const parsed = typeof status === "number"
      ? status
      : typeof status === "string" && /^\d+$/.test(status.trim())
        ? Number(status)
        : undefined
    if (parsed !== undefined && Number.isFinite(parsed) && !output.statusCodes.includes(parsed)) output.statusCodes.push(parsed)
    if (typeof current.value.name === "string" && !output.names.includes(current.value.name)) output.names.push(current.value.name)
    if (typeof current.value.message === "string" && !output.messages.includes(current.value.message)) output.messages.push(current.value.message)
    if (current.depth < maxDepth) {
      for (const key of ["error", "data", "cause"] as const) {
        queue.push({ value: current.value[key], depth: current.depth + 1 })
      }
    }
  }
  return output
}
```

- [ ] **Step 5: Wire the reader into classification**

In `classifyError`, read the shape once; return non-retryable `reason: "context overflow"` when any exact name is `ContextOverflowError`; then honor configured statuses in shape order; then existing retry patterns. Ignore provider `isRetryable` booleans in either direction. Derive the reported message/status/name from the first bounded entries, preserve existing recovery metadata parsing, and use bounded status 429 for delay calculation.

- [ ] **Step 6: Change both source defaults without touching generated schema**

Set both `defaultRuntimeFallbackConfig().retryOnStatusCodes` and `RuntimeFallbackConfigSchema`'s default to:

```ts
[402, 429, 500, 502, 503, 504]
```

Keep array replacement semantics unchanged. Leave `schema.json` untouched for Task 14.

- [ ] **Step 7: Run the focused GREEN tests**

Run:

```powershell
node --test --experimental-strip-types "src/runtime-fallback/error-classifier.test.ts" "src/config/schema.test.ts"
```

Expected: PASS; cycle/depth cases terminate, ContextOverflow wins over configured 400, ordinary configured 400 retries, and default/replacement assertions pass.

- [ ] **Step 8: Report checkpoint**

Report changed files, RED/GREEN command output, confirmation that `schema.json` is still untouched, and suggested semantic commit message `feat: harden runtime fallback error classification`. Do not stage or commit.

### Task 2: Typed dispatch outcomes and lifecycle-owned reservation store

**Depends on:** None

**Files:**
- Modify: `src/runtime-fallback/dispatcher.ts`
- Modify: `src/runtime-fallback/dispatcher.test.ts`
- Modify: `src/runtime-fallback/event-handler-support.ts`
- Modify: `src/runtime-fallback/event-handler-support.test.ts`
- Modify: `src/runtime-fallback/event-handler-generic-fallback.ts`
- Modify: `src/runtime-fallback/event-handler.ts`
- Modify: `src/runtime-fallback/event-handler-fallback-dispatch.test.ts`

**Interfaces:**
- Consumes: `OcmmClient`, `FallbackEntry`, runtime lifecycle generation and route snapshot IDs.
- Produces: `DispatchFallbackOutcome`, `DispatchReservationOwner`, `DispatchReservationRecord`, `RuntimeFallbackDispatchReservations`, and `createRuntimeFallbackDispatchReservations()`.

**Recommended executor:** `deep`

- [ ] **Step 1: Add failing dispatcher outcome-boundary tests**

Cover message-fetch failure, empty parts, stale pre-prompt check, resolved prompt, prompt rejection after invocation, and same-session in-flight rejection.

```ts
assert.deepEqual(await dispatchFallbackRetry(argsWithMessageFailure), {
  status: "rejected", reason: "messages",
})
assert.deepEqual(await dispatchFallbackRetry(argsWithStalePrePromptCheck), {
  status: "rejected", reason: "stale",
})
const ambiguous = await dispatchFallbackRetry(argsWithRejectedPrompt)
assert.equal(ambiguous.status, "possibly-accepted")
assert.equal(ambiguous.error, promptError)
```

- [ ] **Step 2: Add failing reservation ownership tests**

In `event-handler-support.test.ts`, cover one record per session, same-owner settle, stale-owner settle refusal, stale-owner clear refusal, unconditional lifecycle clear, and reacquisition after clear.

- [ ] **Step 3: Run focused tests and observe RED**

Run:

```powershell
node --test --experimental-strip-types "src/runtime-fallback/dispatcher.test.ts" "src/runtime-fallback/event-handler-support.test.ts" "src/runtime-fallback/event-handler-fallback-dispatch.test.ts"
```

Expected: FAIL because dispatcher returns boolean and no reservation store exists.

- [ ] **Step 4: Replace the boolean boundary with the exact union**

```ts
export type DispatchFallbackOutcome =
  | { status: "accepted" }
  | { status: "possibly-accepted"; error: unknown }
  | { status: "rejected"; reason: "in-flight" | "stale" | "messages" | "empty-parts" }

export type DispatchArgs = {
  client: OcmmClient
  sessionID: string
  directory?: string
  agent?: string
  newEntry: FallbackEntry
  reason: string
  abortBeforeDispatch?: boolean
  isCurrent?: () => boolean
}
```

Return `rejected/in-flight` before I/O, `rejected/messages` on fetch failure, `rejected/empty-parts` for no user parts, and `rejected/stale` when `isCurrent?.()` is false immediately before prompt invocation. Set a local `promptInvoked` flag immediately before calling `client.session.prompt`; resolve to `accepted`; any catch after that call returns `possibly-accepted` with the original error.

- [ ] **Step 5: Implement owner-checked reservation and pending state**

```ts
export type DispatchReservationOwner = {
  generation: number
  routeSnapshotId: number
  targetModel: string
}

export type DispatchReservationRecord = DispatchReservationOwner & {
  state: "reserved" | "accepted" | "possibly-accepted"
}

export type RuntimeFallbackDispatchReservations = {
  acquire(sessionID: string, owner: DispatchReservationOwner): boolean
  settle(sessionID: string, owner: DispatchReservationOwner, state: "accepted" | "possibly-accepted"): boolean
  get(sessionID: string): DispatchReservationRecord | undefined
  clear(sessionID: string, owner?: DispatchReservationOwner): boolean
}

export function createRuntimeFallbackDispatchReservations(): RuntimeFallbackDispatchReservations
```

Implement one `Map<string, DispatchReservationRecord>` entry per session. Compare all three owner fields before settle or owner-scoped clear so a stale completion cannot clear a newer record. Do not add timers or persistence.

- [ ] **Step 6: Adapt both existing consumers before the reservation integration task**

In `event-handler-generic-fallback.ts`, commit on `accepted` or `possibly-accepted` and do not commit on `rejected`. In the dedicated 429 callback in `event-handler.ts`, return `true` for `accepted`/`possibly-accepted` and `false` for `rejected`. This keeps Task 2 independently green while Task 7 adds the reservation/pending retention around the same typed outcomes.

- [ ] **Step 7: Run focused tests and observe GREEN**

Run:

```powershell
node --test --experimental-strip-types "src/runtime-fallback/dispatcher.test.ts" "src/runtime-fallback/event-handler-support.test.ts" "src/runtime-fallback/event-handler-fallback-dispatch.test.ts"
```

Expected: PASS for typed boundary and owner fencing; existing body/variant/reasoning assertions remain green.

- [ ] **Step 8: Report checkpoint**

Report the exact exported signatures, RED/GREEN evidence, and suggested semantic commit message `refactor: type fallback dispatch outcomes`. Do not stage or commit.

### Task 3: Provider-scoped temperature capability seam

**Depends on:** None

**Files:**
- Create: `src/hooks/model-temperature-capability.ts`
- Create: `src/hooks/model-temperature-capability.test.ts`
- Modify: `src/hooks/chat-params.ts`
- Modify: `src/hooks/chat-params.test.ts`

**Interfaces:**
- Consumes: `ChatParamsInput.model.providerID`, `ChatParamsInput.model.modelID`, and an optional resolver argument reserved for a future reliable runtime `supportsTemperature` boolean; the current hook has no verified host field and passes `undefined`.
- Produces: `ModelTemperatureCapability` and `supportsModelTemperature(input: ModelTemperatureCapability): boolean`.

**Recommended executor:** `coding`

- [ ] **Step 1: Add failing pure capability tests**

Test runtime false/true precedence, the same model ID under two providers, recognized colon reasoning suffix normalization, and absent metadata preserving the current heuristic.

```ts
assert.equal(supportsModelTemperature({
  providerID: "openai",
  modelID: "gpt-5.6-codex:high",
  supportsTemperature: true,
}), true)
assert.equal(supportsModelTemperature({
  providerID: "openai",
  modelID: "gpt-5.6-codex:high",
  supportsTemperature: false,
}), false)
```

- [ ] **Step 2: Add failing hook-level heuristic-preservation tests**

In `chat-params.test.ts`, prove the current hook passes provider/model through the resolver while preserving existing no-metadata behavior: GPT-5/o/Codex still strip temperature and supported families preserve it. Add a raw payload containing `model.supportsTemperature: true` and assert it is ignored because no current OpenCode host contract in this repository establishes that field.

- [ ] **Step 3: Run focused tests and observe RED**

Run:

```powershell
node --test --experimental-strip-types "src/hooks/model-temperature-capability.test.ts" "src/hooks/chat-params.test.ts"
```

Expected: FAIL because the pure resolver module and provider-scoped hook integration do not exist.

- [ ] **Step 4: Implement the pure precedence resolver**

```ts
export type ModelTemperatureCapability = {
  providerID: string
  modelID: string
  supportsTemperature?: boolean
}

const BUNDLED_TEMPERATURE_CAPABILITIES: ReadonlyMap<string, boolean> = new Map()
function normalizeTemperatureLookupModel(modelID: string): string {
  return splitReasoningSuffix(modelID, { providerContext: true }).model
}
function modelDoesNotSupportTemperatureHeuristically(modelID: string): boolean

export function supportsModelTemperature(input: ModelTemperatureCapability): boolean {
  if (typeof input.supportsTemperature === "boolean") return input.supportsTemperature
  const providerID = input.providerID.trim().toLowerCase()
  const modelID = normalizeTemperatureLookupModel(input.modelID)
  const bundled = BUNDLED_TEMPERATURE_CAPABILITIES.get(`${providerID}/${modelID}`)
  if (bundled !== undefined) return bundled
  return !modelDoesNotSupportTemperatureHeuristically(modelID)
}
```

Keep the bundled map empty unless an existing repository-owned provider/model fact is available. Reuse `splitReasoningSuffix` from `src/shared/reasoning.ts`, whose recognized colon suffixes are `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, and `auto`; never strip hyphenated model-name segments. Keep every map key provider-qualified.

- [ ] **Step 5: Wire the resolver without inventing host metadata**

Do not extend `ChatParamsInput` with a capability field and do not read `raw.model.supportsTemperature`; the current host payload contract has no verified path for it. Replace `stripUnsupportedTemperature(modelID, output)` with:

```ts
function stripUnsupportedTemperature(
  capability: ModelTemperatureCapability,
  output: ChatParamsOutput,
): void {
  if (output.temperature !== undefined && !supportsModelTemperature(capability)) {
    delete output.temperature
  }
}
```

Pass provider ID and model ID at both current call sites, leaving `supportsTemperature` undefined. The pure resolver retains the optional boolean seam for a future host field only after that field is independently documented and tested. Add no config, cache, fetch, or migration.

- [ ] **Step 6: Run focused tests and observe GREEN**

Run:

```powershell
node --test --experimental-strip-types "src/hooks/model-temperature-capability.test.ts" "src/hooks/chat-params.test.ts"
```

Expected: PASS; pure explicit metadata precedence and provider scoping hold, while the current hook consumes no unverified field and legacy behavior is unchanged.

- [ ] **Step 7: Report checkpoint**

Report that no host metadata field was consumed, provider-scoping evidence, RED/GREEN output, and suggested semantic commit message `feat: add temperature capability resolver`. Do not stage or commit.

### Task 4: Proportional scenario and deterministic-seam TDD prompts

**Depends on:** None

**Files:**
- Create: `src/intent/proportional-scenario-contract.test.ts`
- Modify: `prompts/omo/deepwork/default.md`
- Modify: `prompts/omo/deepwork/gpt.md`
- Modify: `prompts/v1/deepwork/default.md`
- Modify: `docs/prompt-sync.md`
- Modify: `docs/v1-maintenance.md`

**Interfaces:**
- Consumes: approved risk tiers and deterministic-test-seam distinction from the design spec.
- Produces: the same six proportional scenario/TDD semantics on all three targeted prompts and synchronized provenance records.

**Recommended executor:** `documenting`

- [ ] **Step 1: Add a failing semantic contract test**

Read only the three targeted prompt files. Assert each contains small single-surface `one or two` guidance, high-risk `at least three` guidance, happy-path coverage, risk-conditional edge/adjacent coverage, deterministic-seam test-first language, strongest real-surface fallback, and conditional characterization tests. Assert the old unconditional `3+`/universal-production-change formulations are absent from these files only.

```ts
for (const prompt of targetedPrompts) {
  assert.match(prompt, /one or two targeted scenarios/i)
  assert.match(prompt, /at least three scenarios/i)
  assert.match(prompt, /real deterministic test seam/i)
  assert.match(prompt, /strongest real-surface verification/i)
  assert.doesNotMatch(prompt, /3\+ realistic scenarios/i)
}
```

- [ ] **Step 2: Run the contract test and observe RED**

Run:

```powershell
node --test --experimental-strip-types "src/intent/proportional-scenario-contract.test.ts"
```

Expected: FAIL because the targeted prompts currently disagree and two contain unconditional scenario/TDD rules.

- [ ] **Step 3: Apply the same compact contract to all three prompts**

Use this semantic content, adapted only to each prompt's surrounding voice:

```markdown
- Small, single-surface changes use one or two targeted scenarios. Multi-surface, security, runtime-safety, data-loss, migration, release, or otherwise high-risk work uses at least three.
- Every change covers its happy path. Add edge and adjacent-regression scenarios only where that risk exists.
- Work test-first when production behavior has a real deterministic test seam. Without one, use the strongest real-surface verification rather than synthetic prose-pinning tests.
- Add characterization tests before a refactor only when they are needed to expose a behavior regression.
```

Remove only the conflicting unconditional text in the three listed prompts. Do not broaden changes to Gemini/GLM or unrelated prompt files.

- [ ] **Step 4: Synchronize prompt maintenance docs**

In `docs/prompt-sync.md`, record OMO baseline `./omo@ef1c392f10eafb28913eb7815143c328d88aad47`, the proportional adaptation, and the exclusion of OMO beta multi-harness machinery. In `docs/v1-maintenance.md`, record the v1 default prompt adaptation and the same deterministic-seam/no-synthetic-test boundary.

- [ ] **Step 5: Run focused GREEN tests**

Run:

```powershell
node --test --experimental-strip-types "src/intent/proportional-scenario-contract.test.ts" "src/intent/prompt-loader.test.ts"
```

Expected: PASS; all targeted semantics align and prompt loading remains valid.

- [ ] **Step 6: Report checkpoint**

Report the three prompt files, both synchronized docs, RED/GREEN evidence, and suggested semantic commit message `docs: make scenario and tdd guidance proportional`. Do not stage or commit.

### Task 5: Strict every-tier ast-grep probe and init-deep structural first probe

**Depends on:** None

**Files:**
- Modify: `skills/ast-grep/scripts/ast_grep_helper.py`
- Create: `skills/ast-grep/tests/test_resolver.py`
- Verify unchanged behavior: `skills/ast-grep/tests/smoke.ps1`
- Preserve for POSIX CI: `skills/ast-grep/tests/smoke.sh`
- Modify: `skills/init-deep/SKILL.md`
- Generated later by Task 14: `plugins/deepwork/skills/ast-grep/**`
- Generated later by Task 14: `plugins/deepwork/skills/init-deep/SKILL.md`

**Interfaces:**
- Consumes: resolver candidate tiers for environment override, runtime directory, cache, Homebrew, and PATH.
- Produces: `probe_ast_grep_candidate(candidate: str | Path, timeout_seconds: float = 5.0) -> Path | None` and init-deep's one AST-shaped initial measurement rule.

**Recommended executor:** `coding`

- [ ] **Step 1: Add deterministic single-candidate probe tests**

Use `tempfile`, `unittest`, and `unittest.mock` only. Patch `subprocess.run` for valid `ast-grep` output, non-zero exit, timeout, and unrelated `sg` output.

```py
with patch.object(helper.subprocess, "run", return_value=CompletedProcess(
    [str(candidate), "--version"], 0, stdout="ast-grep 0.40.0", stderr=""
)):
    self.assertEqual(helper.probe_ast_grep_candidate(candidate), candidate.resolve())

with patch.object(helper.subprocess, "run", side_effect=TimeoutExpired(str(candidate), 5.0)):
    self.assertIsNone(helper.probe_ast_grep_candidate(candidate))
```

- [ ] **Step 2: Add fallback-tier and init-deep contract tests**

Patch tier candidate providers so a rejected environment override falls through to a valid runtime/cache/PATH candidate. Add a source-contract assertion that init-deep requires exactly one AST-shaped first probe and a read-only `rg`/LSP fallback when no valid binary exists.

- [ ] **Step 3: Run resolver tests and observe RED**

Run:

```powershell
python -m unittest "skills/ast-grep/tests/test_resolver.py" -v
```

Expected: FAIL because the common probe and init-deep contract are absent.

- [ ] **Step 4: Implement one common probe**

```py
def probe_ast_grep_candidate(
    candidate: str | Path,
    timeout_seconds: float = 5.0,
) -> Path | None:
    raw = str(candidate)
    resolved_text = shutil.which(raw) if not Path(raw).is_absolute() else raw
    if resolved_text is None:
        return None
    resolved = Path(resolved_text).resolve()
    if not resolved.is_file() or (os.name != "nt" and not os.access(resolved, os.X_OK)):
        return None
    try:
        completed = subprocess.run(
            [str(resolved), "--version"],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    version_text = f"{completed.stdout}\n{completed.stderr}"
    return resolved if completed.returncode == 0 and "ast-grep" in version_text.lower() else None
```

- [ ] **Step 5: Route every resolver tier through the probe**

Route environment override, runtime directory, cache, Homebrew, and PATH through this function and continue to the next tier on `None`. Remove the PATH-only special case. Do not download, install, mutate PATH, or cache a failed result.

- [ ] **Step 6: Update init-deep without changing search tool roles**

Require one AST-shaped `sg` query before structural decomposition when the validated resolver returns a candidate. Keep `rg` for text and LSP for semantic references. If no candidate validates, require the worker to report that structural measurement was unavailable and continue using read-only evidence.

- [ ] **Step 7: Run unit and Windows smoke GREEN checks**

Run:

```powershell
python -m unittest "skills/ast-grep/tests/test_resolver.py" -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pwsh -NoProfile -File "skills/ast-grep/tests/smoke.ps1"
```

Expected: all resolver cases PASS and the existing PowerShell smoke script exits 0. Preserve `smoke.sh` for POSIX CI without invoking it on Windows.

- [ ] **Step 8: Report checkpoint**

Report tier coverage, timeout value, smoke evidence, no-install confirmation, and suggested semantic commit message `fix: validate every ast-grep resolver candidate`. Do not stage or commit.

### Task 6: LSP format descriptor, alias, capability, and encoding negotiation

**Depends on:** None

**Files:**
- Modify: `crates/ocmm-lsp/src/main.rs`
- Modify: `crates/ocmm-lsp/tests/mcp_stdio.rs`
- Modify: `crates/ocmm-lsp/tests/fixtures/mock_lsp.mjs`

**Interfaces:**
- Consumes: existing MCP `tools/list`/`tools/call`, `LspSession::initialize`, and JSON-RPC mock fixture.
- Produces: canonical tool `format`, alias `lsp_format`, `PositionEncoding::{Utf8, Utf16}`, `formatting_supported: bool`, and retained document version.

**Recommended executor:** `deep`

- [ ] **Step 1: Add failing descriptor and alias tests**

Assert the descriptor's exact schema, canonical tool-list membership, and `lsp_format` alias normalization.

```rust
assert_eq!(format_tool["inputSchema"], json!({
    "type": "object",
    "properties": { "filePath": { "type": "string" } },
    "required": ["filePath"],
    "additionalProperties": false
}));
```

- [ ] **Step 2: Add failing capability and encoding scenarios**

Extend the mock fixture for formatting true + UTF-8, formatting options object + UTF-16, missing capability, false capability, absent encoding, and unsupported encoding. Assert advertised client encodings, UTF-16 default, typed unavailable, and a tool error for unsupported encoding.

- [ ] **Step 3: Run the focused Rust tests and observe RED**

Run:

```powershell
cargo test -p ocmm-lsp --test mcp_stdio tools_list_exposes_lsp_tools -- --exact
cargo test -p ocmm-lsp --test mcp_stdio format_capability_and_encoding_negotiation
```

Expected: FAIL because `format`/`lsp_format` and negotiated formatting state do not exist.

- [ ] **Step 4: Add descriptor, alias, and dispatch branch**

Add `format` to `tool_descriptors()`, map `lsp_format` to `format` in `normalize_tool_name`, and dispatch through a dedicated `format_tool(file_path)` branch. Use the exact schema asserted above; do not add range or formatting-option inputs.

- [ ] **Step 5: Retain negotiated capability and encoding state**

```rust
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PositionEncoding { Utf8, Utf16 }

struct LspSession {
    formatting_supported: bool,
    position_encoding: PositionEncoding,
    document_version: u64,
    // Preserve every existing field unchanged.
}
```

Advertise `"general": { "positionEncodings": ["utf-8", "utf-16"] }`. Parse initialize results so `documentFormattingProvider` accepts `true` or an object, absent/false means unavailable, `positionEncoding` absent means UTF-16, and any other explicit encoding returns a tool error. Keep initial `didOpen` version 1.

- [ ] **Step 6: Return typed unavailable before a formatting request**

```json
{
  "status": "unavailable",
  "reason": "capability_not_advertised",
  "linesAdded": 0,
  "linesRemoved": 0
}
```

When capability is missing/false, return this as a non-error result and do not issue `textDocument/formatting` or touch the file.

- [ ] **Step 7: Run focused GREEN tests**

Run:

```powershell
cargo test -p ocmm-lsp --test mcp_stdio tools_list_exposes_lsp_tools -- --exact
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
cargo test -p ocmm-lsp --test mcp_stdio format_capability_and_encoding_negotiation
```

Expected: PASS; the tool list contains nine canonical tools, alias reaches the same branch, and negotiation behavior is exact.

- [ ] **Step 8: Report checkpoint**

Report descriptor schema, trace evidence for advertised encodings, RED/GREEN results, and suggested semantic commit message `feat: negotiate lsp document formatting`. Do not stage or commit.

## Wave 2 — First integrations

### Task 7: 402 AbortError exception and reservation-aware generic fallback

**Depends on:** Tasks 1 and 2

**Files:**
- Modify: `src/runtime-fallback/event-handler.ts`
- Modify: `src/runtime-fallback/event-handler-generic-fallback.ts`
- Modify: `src/runtime-fallback/event-handler-test-fixtures.ts`
- Modify: `src/runtime-fallback/event-handler-fallback-dispatch.test.ts`
- Modify: `src/runtime-fallback/event-handler-idle-continuation.test.ts`

**Interfaces:**
- Consumes: `readBoundedErrorShape`, `DispatchFallbackOutcome`, `RuntimeFallbackDispatchReservations`, lifecycle generation, route snapshot, `peekNextFallback`, and `commitFallback`.
- Produces: exactly-once 402 abort dispatch and pending reconciliation for accepted/possibly-accepted targets.

**Recommended executor:** `deep`

- [ ] **Step 1: Add the failing 402 eligibility matrix**

Test nested 402 + name-based provider AbortError dispatch once; disabled fallback, omitted 402, missing session, missing effective agent/chain, and ordinary abort do not dispatch. Test both root and nested 402 combined with explicit `isAbort: true`; each must preserve tombstone/idle behavior and never dispatch.

```ts
await handler(quotaAbortEvent)
assert.equal(client.promptCalls.length, 1)
assert.equal(state.activeModel, "fallback/provider-model")
```

- [ ] **Step 2: Add failing concurrent and outcome-boundary integration tests**

Test concurrent eligible errors invoke one prompt, pre-prompt stale/messages rejection releases reservation, and post-invocation rejection commits the selected target and leaves a possibly-accepted pending record.

- [ ] **Step 3: Add failing lifecycle/pending reconciliation tests**

Test target-model evidence clears pending; old-model/model-less evidence does not duplicate; session delete/recreate clears ownership; and stale route snapshots cannot commit or clear a newer reservation.

- [ ] **Step 4: Run focused integration tests and observe RED**

Run:

```powershell
node --test --experimental-strip-types "src/runtime-fallback/event-handler-fallback-dispatch.test.ts" "src/runtime-fallback/event-handler-idle-continuation.test.ts"
```

Expected: FAIL because all abort-shaped errors return early and the generic flow still consumes a boolean without pending ownership.

- [ ] **Step 5: Gate the 402 abort exception without weakening ordinary aborts**

Implement this decision order in `event-handler.ts`:

```ts
const earlyShape = readBoundedErrorShape(earlyError)
const abortShaped = isRuntimeFallbackAbort(earlyError)
const explicitUserAbort = isExplicitRuntimeFallbackAbort(earlyError)
const quotaAbortCandidate = abortShaped
  && !explicitUserAbort
  && earlyShape.statusCodes.includes(402)

// Preserve current terminal-abort handling unless every quota condition holds.
const quotaAbortEligible = quotaAbortCandidate
  && cfg.runtimeFallback.enabled
  && cfg.runtimeFallback.retryOnStatusCodes.includes(402)
  && sessionID.length > 0
  && requirement !== null
  && requirement.fallbackChain.length > 1
```

Resolve the effective agent/route before finalizing `quotaAbortEligible`, using the same published/current route snapshot used later by generic fallback. If `explicitUserAbort` is true or eligibility is otherwise false, execute the current abort path including explicit-abort tombstones. If true, bypass only the name-based provider-abort terminal return and proceed through suppression, `classifyError`, lifecycle, reservation, and generic dispatch; do not record explicit-abort evidence for that provider event.

- [ ] **Step 6: Acquire reservation before abort/messages/prompt I/O**

Add `reservations` to `GenericFallbackContext`. Build owner from current generation, route snapshot, and `modelKey(entry.providers[0] ?? "", entry.model)`. Acquire immediately after peeking and before `waitForStaleDispatches` or client I/O. Pass `isCurrent` to dispatcher.

```ts
const outcome = await lifecycle.trackDispatch(
  sessionID,
  generation,
  dispatchFallbackRetry({
    client: lifecycle.guardedClient(sessionID, generation, isCurrent),
    sessionID,
    newEntry: entry,
    reason: classification.reason,
    isCurrent,
  }),
)

if (outcome.status === "rejected") {
  reservations.clear(sessionID, owner)
  return
}
commitFallback(state, entry, peek.index)
reservations.settle(sessionID, owner, outcome.status)
```

Leave accepted/possibly-accepted records pending without a timer.

- [ ] **Step 7: Map typed outcomes into the dedicated 429 controller**

Map `accepted` and `possibly-accepted` to `true` for the existing controller and `rejected` to `false`; do not fork or replace the dedicated scheduler/controller.

- [ ] **Step 8: Reconcile pending only with current lifecycle/model evidence**

Clear on session creation/deletion, generation replacement, route-snapshot mismatch, or an event explicitly naming the pending target as active/failed. Ignore old-model and model-less evidence while a pending target exists. Owner-check every clear so stale completion cannot erase new state.

- [ ] **Step 9: Run focused GREEN and existing fallback regression tests**

Run:

```powershell
node --test --experimental-strip-types "src/runtime-fallback/event-handler-fallback-dispatch.test.ts" "src/runtime-fallback/event-handler-idle-continuation.test.ts" "src/runtime-fallback/event-handler-dedicated-429-gates.test.ts" "src/runtime-fallback/event-handler-dedicated-429-session-lifecycle.test.ts"
```

Expected: PASS; 402 exception is exact, ambiguous prompt suppression holds, and the existing 429 gates, dedicated lifecycle, and idle behavior remain green.

- [ ] **Step 10: Report checkpoint**

Report condition-matrix results, pending state ownership, regression files actually run, and suggested semantic commit message `feat: recover safely from quota abort failures`. Do not stage or commit.

### Task 8: Research provenance contract across omo, v1, and Codex

**Depends on:** Task 4

**Files:**
- Create: `src/intent/research-provenance-contract.test.ts`
- Modify: `prompts/omo/category/research.md`
- Modify: `prompts/v1/category/research.md`
- Modify: `prompts/codex/category/research.md`
- Modify: `docs/prompt-sync.md`
- Modify: `docs/v1-maintenance.md`
- Generated later by Task 14: `.codex/agents/dw-research.toml`
- Generated later by Task 14: `plugins/deepwork/agents/dw-research.toml`

**Interfaces:**
- Consumes: route/date metadata exposed by research tools and the approved direct-versus-indirect evidence distinction.
- Produces: one compact provenance contract with identical semantics on all three workflow prompts.

**Recommended executor:** `documenting`

- [ ] **Step 1: Add a failing cross-workflow contract test**

Assert each prompt requires route/date retention when supplied, archive/snapshot timestamp plus non-live labeling, proxy/mirror/cache/untrusted indirect-evidence labeling plus independent corroboration for material claims, and explicit absence rather than invented provenance. Assert it does not require exhaustive research, a second worker per claim, citation graphs, or persistent research artifacts.

```ts
for (const prompt of researchPrompts) {
  assert.match(prompt, /route.*date/i)
  assert.match(prompt, /archive|snapshot/i)
  assert.match(prompt, /indirect evidence/i)
  assert.match(prompt, /independent route/i)
  assert.match(prompt, /does not expose provenance/i)
}
```

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```powershell
node --test --experimental-strip-types "src/intent/research-provenance-contract.test.ts"
```

Expected: FAIL because the provenance contract is absent.

- [ ] **Step 3: Add the compact four-rule contract to all three prompts**

```markdown
- Retain the source route and retrieval or publication date when the tool supplies them.
- Label archives and snapshots with their snapshot timestamp; never present them as live state.
- Treat proxy, mirror, cache, and explicitly untrusted output as indirect evidence; corroborate material claims through an independent route.
- When a tool does not expose provenance, state that limitation instead of inventing source fields.
```

Do not add exhaustive-research requirements, mandatory second workers, citation graphs, or persistent evidence assets.

- [ ] **Step 4: Append synchronized provenance notes**

Update both sync docs after Task 4's entries. Record the OMO baseline hash, the three-surface alignment, and the explicit local exclusions above. Preserve prior historical entries.

- [ ] **Step 5: Run focused GREEN tests**

Run:

```powershell
node --test --experimental-strip-types "src/intent/research-provenance-contract.test.ts" "src/intent/prompt-loader.test.ts"
```

Expected: PASS; all three source prompts expose the same bounded contract and load successfully.

- [ ] **Step 6: Report checkpoint**

Report the three source prompts, doc entries, RED/GREEN evidence, and suggested semantic commit message `docs: preserve research provenance across workflows`. Do not stage or commit.

### Task 9: Encoding-correct immutable-snapshot edit normalization

**Depends on:** Task 6

**Files:**
- Modify: `crates/ocmm-lsp/src/main.rs`

**Interfaces:**
- Consumes: `PositionEncoding` from Task 6 and LSP `TextEdit[]` JSON.
- Produces: `NormalizedTextEdit`, `normalize_formatting_edits`, `apply_normalized_edits`, and logical line-delta calculation.

**Recommended executor:** `deep`

- [ ] **Step 1: Add failing valid-edit Rust tests**

Inside the existing `#[cfg(test)]` module, cover UTF-8 and UTF-16 positions, non-BMP characters, CRLF preservation, unordered edits, exact duplicate dedupe, adjacent ranges, and distinct zero-width insertions.

```rust
let source = "a😀b\r\nsecond\n".as_bytes();
let edits = json!([
    {"range":{"start":{"line":1,"character":0},"end":{"line":1,"character":6}},"newText":"SECOND"},
    {"range":{"start":{"line":0,"character":1},"end":{"line":0,"character":3}},"newText":"X"}
]);
let normalized = normalize_formatting_edits(source, edits.as_array().unwrap(), PositionEncoding::Utf16).unwrap();
assert_eq!(apply_normalized_edits(source, &normalized).unwrap(), b"aXb\r\nSECOND\n");
```

- [ ] **Step 2: Add failing invalid-edit Rust tests**

Add non-integer, negative, nonexistent-line, split UTF-8 code point, split UTF-16 surrogate, reversed-range, overlap, and conflicting same-point insertion cases. Assert each returns an error before application.

- [ ] **Step 3: Run normalization tests and observe RED**

Run:

```powershell
cargo test -p ocmm-lsp normalize_formatting_edits
```

Expected: FAIL because the normalization/apply functions do not exist.

- [ ] **Step 4: Add exact edit types and line index conversion**

```rust
#[derive(Clone, Debug, Eq, PartialEq)]
struct NormalizedTextEdit {
    start: usize,
    end: usize,
    new_text: Vec<u8>,
}

fn normalize_formatting_edits(
    source: &[u8],
    edits: &[Value],
    encoding: PositionEncoding,
) -> Result<Vec<NormalizedTextEdit>>;

fn apply_normalized_edits(
    source: &[u8],
    edits: &[NormalizedTextEdit],
) -> Result<Vec<u8>>;

fn logical_line_delta(original: &[u8], replacement: &[u8]) -> Result<(usize, usize)>;
```

Parse source as valid UTF-8 once. Build logical line starts while retaining original newline bytes. Convert UTF-8 characters as byte offsets and UTF-16 characters as code-unit offsets; reject mid-codepoint/surrogate positions. Require integer non-negative line/character values and existing lines. Convert every range against the same original source.

- [ ] **Step 5: Enforce deterministic edit-set validity**

Sort canonical edits by `(start, end, new_text)` to dedupe exact duplicates, reject overlapping non-empty ranges and differing insertions at the same zero-width position, then sort accepted edits descending by `(start, end)` for application. Allow adjacent edits and insertions at different offsets. Apply only to the immutable original bytes; preserve all untouched CRLF/LF bytes.

- [ ] **Step 6: Apply edits and add logical line deltas**

Implement a helper that compares `split_terminator`-equivalent logical old/new line sequences and returns `(lines_added, lines_removed)`. Treat resulting byte equality as unchanged before any file write.

- [ ] **Step 7: Run normalization GREEN tests**

Run:

```powershell
cargo test -p ocmm-lsp normalize_formatting_edits
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
cargo test -p ocmm-lsp apply_normalized_edits
```

Expected: PASS for all encoding, ordering, boundary, dedupe, conflict, and CRLF cases.

- [ ] **Step 8: Report checkpoint**

Report exact signatures, invalid-position matrix, immutable-source evidence, and suggested semantic commit message `feat: normalize lsp formatting edits safely`. Do not stage or commit.

### Task 10: Direct-LSP compatibility inventory includes format

**Depends on:** Task 6

**Files:**
- Modify: `scripts/codemode-execute-compatibility.ts`
- Modify: `scripts/codemode-execute-compatibility.test.ts`

**Interfaces:**
- Consumes: canonical nine-tool MCP `tools/list` inventory from Task 6.
- Produces: `parseDirectLspToolsList(output: string): boolean` accepting exactly the nine canonical tools including `format`.

**Recommended executor:** `coding`

- [ ] **Step 1: Add failing strict-inventory tests**

Update the canonical success fixture to include `format`. Add rejection cases for the old eight-tool set, duplicate `format`, missing `format`, and any extra unknown tool.

```ts
assert.equal(parseDirectLspToolsList(directLspResponse()), true)
assert.equal(parseDirectLspToolsList(JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  result: { tools: DIRECT_LSP_TOOL_NAMES
    .filter((name) => name !== "format")
    .map((name) => ({ name })) },
})), false)
```

- [ ] **Step 2: Run the focused parser test and observe RED**

Run:

```powershell
node --test --experimental-strip-types --test-name-pattern "direct LSP smoke parser" "scripts/codemode-execute-compatibility.test.ts"
```

Expected: FAIL because the source still requires exactly eight tools.

- [ ] **Step 3: Add `format` to the canonical required tuple**

Append only `"format"` to `REQUIRED_DIRECT_LSP_TOOLS`. Keep strict envelope, exact inventory, duplicate, and unknown-tool rejection unchanged. This adjacent compatibility change is required because the existing real direct-smoke parser would otherwise reject the newly specified server; do not modify unrelated codemode behavior.

- [ ] **Step 4: Run the focused parser test and observe GREEN**

Run:

```powershell
node --test --experimental-strip-types --test-name-pattern "direct LSP smoke parser" "scripts/codemode-execute-compatibility.test.ts"
```

Expected: PASS for the exact nine-tool inventory and all malformed/extra/missing cases.

- [ ] **Step 5: Report checkpoint**

Report why this tightly scoped adjacent file is necessary for acceptance, RED/GREEN evidence, and suggested semantic commit message `test: recognize lsp format in direct compatibility smoke`. Do not stage or commit.

## Wave 3 — Stateful and filesystem-safe integrations

### Task 11: Bounded and deduplicated `session.status` retry ingestion

**Depends on:** Task 7

**Files:**
- Modify: `src/runtime-fallback/event-handler-support.ts`
- Modify: `src/runtime-fallback/event-handler.ts`
- Modify: `src/runtime-fallback/event-handler-generic-fallback.ts`
- Modify: `src/runtime-fallback/event-handler-test-fixtures.ts`
- Create: `src/runtime-fallback/event-handler-status-retry.test.ts`
- Modify: `src/runtime-fallback/event-handler-fallback-dispatch.test.ts`

**Interfaces:**
- Consumes: route/classification/generation/snapshot/reservation generic flow from Task 7.
- Produces: `RetryStatusEvent`, `parseRetryStatusEvent`, `retryStatusKey`, and `RuntimeFallbackRetryStatusTracker` bounded to 256 keys/session and 30 minutes.

**Recommended executor:** `deep`

- [ ] **Step 1: Add failing retry-key and bound tests**

Test exact duplicate collapse, distinct attempt/message/model/variant keys, whitespace/lowercase message normalization, stable `unknown` segments, provider isolation, 257th-key oldest eviction, and 30-minute expiry using an injected clock.

```ts
assert.equal(retryStatusKey({
  providerID: "OpenAI",
  modelID: "gpt-5",
  variant: "high",
  attempt: "2",
  message: "  Try   Again  ",
}), "openai/gpt-5|high|2|try again")
```

- [ ] **Step 2: Add failing lifecycle and pending-evidence tests**

Test created/deleted/generation/confirmed-transition clearing, pending target advancement, stale old-model ignore, model-less pending ignore, and non-retry status ignore.

- [ ] **Step 3: Run the focused status test and observe RED**

Run:

```powershell
node --test --experimental-strip-types "src/runtime-fallback/event-handler-status-retry.test.ts"
```

Expected: FAIL because `session.status` and its bounded tracker are not implemented.

- [ ] **Step 4: Implement the strict parser and normalized key**

```ts
export type RetryStatusEvent = {
  providerID: string
  modelID: string
  variant: string
  attempt: string
  message: string
}

export function parseRetryStatusEvent(props: unknown): RetryStatusEvent | null
export function retryStatusKey(status: RetryStatusEvent): string

```

Accept only `props.status.type === "retry"`. Read model identity from `props.status.model.providerID/modelID` first and then `props.model.providerID/modelID`; read variant from `props.status.variant` and then `props.status.model.variant`; read attempt and message only from `props.status.attempt/message`. Accept string or finite integer attempt input and normalize it to the output string. Use literal `unknown` for absent provider, model, variant, attempt, or message segments. Normalize identifiers to lowercase trimmed text and messages with `trim().toLowerCase().replace(/\s+/g, " ")`. Never infer fields from route state or use `isRetryable: true`.

- [ ] **Step 5: Implement the bounded per-session tracker**

```ts

export type RuntimeFallbackRetryStatusTracker = {
  accept(sessionID: string, key: string, now: number): boolean
  clear(sessionID: string): void
}

export function createRuntimeFallbackRetryStatusTracker(
  maxKeysPerSession = 256,
  maxAgeMs = 30 * 60_000,
): RuntimeFallbackRetryStatusTracker
```

Store insertion timestamps in a per-session `Map<string, number>`. Before duplicate lookup, delete entries with `now - insertedAt >= maxAgeMs`; after insertion, delete oldest entries until size is at most `maxKeysPerSession`.

- [ ] **Step 6: Route accepted retry statuses through the existing generic path**

In `event-handler.ts`, handle `session.status` before the `session.error`-only return. Construct an internal trusted `ErrorClassification`:

```ts
const classification: ErrorClassification = {
  retryable: true,
  reason: "session.status retry",
  message: retryStatus.message,
}
```

Then use the same agent/effective requirement, fallback state, model target, generation, route snapshot, reservation, and `runGenericFallback` path as `session.error`; do not implement a second dispatcher.

- [ ] **Step 7: Apply pending evidence and lifecycle clearing rules**

If the status explicitly names the pending target, clear pending and process it as the failed/active current model so fallback can advance. If it names the old model while pending, ignore it. If model/provider are unknown while pending, ignore it. Clear tracker and pending records on created, deleted, generation replacement, route snapshot replacement, or confirmed model/variant transition.

- [ ] **Step 8: Run focused and regression GREEN tests**

Run:

```powershell
node --test --experimental-strip-types "src/runtime-fallback/event-handler-status-retry.test.ts" "src/runtime-fallback/event-handler-fallback-dispatch.test.ts" "src/runtime-fallback/event-handler-idle-continuation.test.ts"
```

Expected: PASS; duplicate keys collapse, distinct evidence advances, pending ambiguity cannot duplicate, and idle/generic behavior remains green.

- [ ] **Step 9: Report checkpoint**

Report bounds (256 keys/session, 30 minutes), key examples, lifecycle clearing evidence, and suggested semantic commit message `feat: ingest bounded retry status events`. Do not stage or commit.

### Task 12: Extrinsic planning constraints and executor recommendation consumption

**Depends on:** Task 8

**Files:**
- Create: `src/intent/planning-executor-contract.test.ts`
- Modify: `skills/v1/writing-plans/SKILL.md`
- Modify: `skills/v1/subagent-driven-development/SKILL.md`
- Modify: `docs/v1-maintenance.md`
- Generated later by Task 14: `plugins/deepwork/skills/deepwork-writing-plans/SKILL.md`
- Generated later by Task 14: `plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md`

**Interfaces:**
- Consumes: existing plan `Global Constraints`, local implementation categories, and SDD routing checks.
- Produces: one `**Recommended executor:**` field per implementation task and bounded extrinsic-constraint discovery/consumption rules.

**Recommended executor:** `documenting`

- [ ] **Step 1: Add a failing planning/SDD contract test**

Assert writing-plans checks budget/paid services, mandated/prohibited stack, scale/capacity, and audience/privacy/compliance/accessibility before final Global Constraints; unknowns are not invented; reversible defaults are used only when safe; unresolved material decisions reach approval. Assert Task Structure contains exactly one recommendation field and the exact allowed categories. Assert SDD checks callable availability, file conflicts, dependencies, security/runtime rigor, and direct-execution size, and states that the recommendation never overrides routing or creates a goal/assumption ledger.

```ts
const taskContract = writingPlans.slice(
  writingPlans.indexOf("## Task Structure"),
  writingPlans.indexOf("## Self-Review"),
)
assert.equal(taskContract.match(/\*\*Recommended executor:\*\*/g)?.length, 1)
for (const executor of ["quick", "coding", "normal-task", "complex", "deep", "frontend", "documenting"]) {
  assert.match(writingPlans, new RegExp(`\\b${executor}\\b`))
}
assert.match(subagentDriven, /file ownership conflicts/i)
assert.match(subagentDriven, /never overrides routing policy/i)
```

- [ ] **Step 2: Run the contract test and observe RED**

Run:

```powershell
node --test --experimental-strip-types "src/intent/planning-executor-contract.test.ts"
```

Expected: FAIL because neither contract exists.

- [ ] **Step 3: Add the extrinsic-constraints pass before Global Constraints finalization**

Specify a compact pass over only material external constraints: budget/paid-service limits; mandated/prohibited technologies; expected scale/capacity; audience/privacy/compliance/accessibility. Require repository/request evidence first, no invented values, a safe reversible default when one exists, and an explicit approval-gate decision otherwise.

- [ ] **Step 4: Add exactly one executor field to the task template and validation guidance**

Insert the bold literal `**Recommended executor:**`, one space, then the inline-code category `` `coding` `` between each task's Interfaces block and first checkbox.

Allow only `quick`, `coding`, `normal-task`, `complex`, `deep`, `frontend`, or `documenting` for implementation. Permit `hard-reasoning` only when a task's output is a genuinely difficult decision rather than code. Explicitly reject planner, plan-critic, Reviewer, and Oracle profiles as implementation executors. Require exactly one field per implementation task, not per checkbox step.

- [ ] **Step 5: Teach SDD to consume but not obey blindly**

Before dispatch, require SDD/orchestrator to verify the recommended profile is callable, files do not conflict with active tasks, dependencies are satisfied, security/runtime rigor is sufficient, and direct execution is not smaller. State that routing policy and explicit user configuration remain authoritative and no goal/assumption ledger is introduced.

- [ ] **Step 6: Synchronize v1 maintenance provenance**

Record baseline `./omo@ef1c392f10eafb28913eb7815143c328d88aad47`, the local category allowlist, the extrinsic-pass adaptation, routing authority, and exclusions of persistent ledgers/automatic Git in `docs/v1-maintenance.md`.

- [ ] **Step 7: Run focused GREEN tests**

Run:

```powershell
node --test --experimental-strip-types "src/intent/planning-executor-contract.test.ts" "src/intent/plan-review-contract.test.ts"
```

Expected: PASS; one recommendation field, allowlist, extrinsic pass, and SDD checks are present without changing plan-review identity semantics.

- [ ] **Step 8: Report checkpoint**

Report contract assertions, maintenance-doc entry, RED/GREEN evidence, and suggested semantic commit message `docs: route plan tasks through local executors`. Do not stage or commit.

### Task 13: Atomic whole-document formatting and post-commit resynchronization

**Depends on:** Task 9

**Files:**
- Modify: `crates/ocmm-lsp/src/main.rs`
- Modify: `crates/ocmm-lsp/Cargo.toml`
- Generate via Cargo only: `Cargo.lock`
- Modify: `crates/ocmm-lsp/tests/mcp_stdio.rs`
- Modify: `crates/ocmm-lsp/tests/fixtures/mock_lsp.mjs`

**Interfaces:**
- Consumes: format descriptor/capability from Task 6 and normalized immutable-snapshot edits from Task 9.
- Produces: fixed formatting request, unchanged/formatted typed results, `atomic_replace_if_unchanged`, Windows replace-through semantics, and didClose/didOpen resync.

**Recommended executor:** `deep`

- [ ] **Step 1: Add failing unchanged and encoding-success scenarios**

Extend the mock fixture and integration tests for null, empty, byte-identical, UTF-8 unordered edits, and UTF-16 non-BMP/CRLF edits. Name the real-surface scenario `format_utf16_crlf`; for input `fn  subject() {}\r\n`, return one UTF-16 edit replacing line 0 characters 2-4 with one space. For unavailable/unchanged, capture bytes and `metadata.modified()` before/after and assert equality.

```rust
assert_eq!(details(&response), &json!({
    "status": "formatted",
    "linesAdded": 0,
    "linesRemoved": 0,
    "committed": true
}));
```

- [ ] **Step 2: Add failing validation and stale/locked-target scenarios**

Add invalid boundaries, reversed/overlap/conflicting edits, same-length stale snapshot, a deterministic mutation injected after temp-file `sync_all` but before the final stale comparison, and Windows-only locked target cases. Assert each returns an error and preserves the concurrent writer's exact source bytes.

- [ ] **Step 3: Add failing resync trace scenarios**

Add the exact success trace and a post-commit didOpen failure scenario. Assert success records both didOpen notifications and failure details contain `committed:true`.

```rust
assert_eq!(trace_methods(&proc), vec![
    "initialize", "initialized", "textDocument/didOpen",
    "textDocument/formatting", "textDocument/didClose",
    "textDocument/didOpen", "shutdown", "exit",
]);
```

- [ ] **Step 4: Run focused MCP tests and observe RED**

Run:

```powershell
cargo test -p ocmm-lsp --test mcp_stdio format_
```

Expected: FAIL because format requests, atomic commit, unchanged mtime, and resynchronization are incomplete.

- [ ] **Step 5: Send the exact fixed formatting request and classify unchanged**

Use opened document URI and:

```json
{
  "tabSize": 4,
  "insertSpaces": false,
  "trimTrailingWhitespace": true,
  "insertFinalNewline": true,
  "trimFinalNewlines": true
}
```

Treat `null`, `[]`, and byte-identical output as `{status:"unchanged",linesAdded:0,linesRemoved:0}`. Return before temp creation or metadata mutation.

Use this result type at the tool boundary:

```rust
#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
enum FormatResult {
    Unavailable {
        reason: String,
        #[serde(rename = "linesAdded")] lines_added: usize,
        #[serde(rename = "linesRemoved")] lines_removed: usize,
    },
    Unchanged {
        #[serde(rename = "linesAdded")] lines_added: usize,
        #[serde(rename = "linesRemoved")] lines_removed: usize,
    },
    Formatted {
        #[serde(rename = "linesAdded")] lines_added: usize,
        #[serde(rename = "linesRemoved")] lines_removed: usize,
        committed: bool,
    },
}
```

- [ ] **Step 6: Add target-only Windows dependency through Cargo**

Add to `crates/ocmm-lsp/Cargo.toml`:

```toml
[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.61", features = ["Win32_Storage_FileSystem"] }
```

Do not edit `Cargo.lock`. The next Cargo command must resolve and write it through Cargo; inspect the resulting lock diff for only the dependency closure.

- [ ] **Step 7: Implement stale check and durable same-directory temp write**

```rust
fn atomic_replace_if_unchanged(
    path: &Path,
    original: &[u8],
    replacement: &[u8],
) -> Result<()>;
```

Create a unique same-directory temp named from target basename, process ID, and an `AtomicU64` counter using `OpenOptions::create_new(true)`, copy target permissions, write all replacement bytes, flush, and `sync_all`. After `sync_all` and immediately before platform replacement, reread `path` and require byte equality with `original`; if it differs, delete only the owned temp and return a stale-snapshot error that preserves the concurrent bytes. Clean only the temp path owned by this call on every failure. Keep this path separate from `apply_text_edits_to_file`/workspace-edit code.

- [ ] **Step 8: Implement platform-specific atomic replacement**

Only after the post-`sync_all` byte comparison succeeds, perform replacement without intervening work. On Unix use same-directory rename replacement. On Windows call `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH`; never delete the target first. Surface stale, write, locked-target, and replace failures without changing target bytes.

- [ ] **Step 9: Resynchronize the committed document and report committed failures**

After replacement, send `textDocument/didClose`, increment `document_version`, update the session's full text, and send `textDocument/didOpen`. On success return:

```json
{"status":"formatted","linesAdded":2,"linesRemoved":1,"committed":true}
```

On didClose/didOpen failure after replacement, return a tool error whose details include `"committed": true`; never return unchanged or imply rollback.

- [ ] **Step 10: Run focused GREEN tests and inspect Cargo lock generation**

Run:

```powershell
cargo test -p ocmm-lsp --test mcp_stdio format_
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
cargo test -p ocmm-lsp normalize_formatting_edits
```

Expected: PASS; Cargo updates `Cargo.lock`, all failure cases preserve bytes, unchanged preserves mtime, both encodings format correctly, success resyncs, and post-commit failure says `committed: true`.

- [ ] **Step 11: Report checkpoint**

Report Windows replacement flags, Cargo-generated lock changes, safety matrix, trace evidence, and suggested semantic commit message `feat: add atomic lsp document formatting`. Do not stage or commit.

## Wave 4 — Single official generation pass

### Task 14: Regenerate schema and Codex artifacts once

**Depends on:** Tasks 1-13

**Files:**
- Generate: `schema.json`
- Generate: `.agents/plugins/marketplace.json`
- Generate: `.codex/agents/dw-research.toml`
- Generate: `plugins/deepwork/agents/dw-research.toml`
- Generate: `plugins/deepwork/skills/deepwork-writing-plans/SKILL.md`
- Generate: `plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md`
- Generate: `plugins/deepwork/skills/ast-grep/scripts/ast_grep_helper.py`
- Generate: `plugins/deepwork/skills/ast-grep/tests/test_resolver.py`
- Generate: `plugins/deepwork/skills/init-deep/SKILL.md`

**Interfaces:**
- Consumes: completed schema, prompt, skill, and ast-grep source changes from Tasks 1, 4, 5, 8, and 12.
- Produces: official generated outputs byte-aligned with current sources and a TypeScript build consumed by generation.

**Recommended executor:** `complex`

- [ ] **Step 1: Prove generated paths were not hand-edited before generation**

Run:

```powershell
git diff --exit-code -- "schema.json" ".agents/plugins/marketplace.json" ".codex/agents" "plugins/deepwork"
```

Expected: exit 0 with no diff. If it fails, stop and report the pre-existing generated-file edit; do not overwrite ambiguous ownership.

- [ ] **Step 2: Run the schema generator exactly once**

Run:

```powershell
pnpm run gen-schema
```

Expected: exit 0 and `schema.json` reflects default status 402. Do not invoke this generator again during this plan.

- [ ] **Step 3: Build TypeScript, then run the Codex generator exactly once**

Run:

```powershell
pnpm run build:ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm run gen:codex-plugin
```

Expected: both commands exit 0 and generator-owned research/skill/ast-grep/init-deep outputs change from source inputs. Do not invoke `gen:codex-plugin` again during this plan.

- [ ] **Step 4: Inspect generated inventory without regenerating**

Run:

```powershell
git status --short --untracked-files=all -- "schema.json" ".agents/plugins/marketplace.json" ".codex/agents" "plugins/deepwork"
```

Expected: only official generator-owned paths are listed; required generated copies in this task's Files section are present. Reject source-path leakage, Cargo `target/`, local absolute paths, and missing generated test copies.

- [ ] **Step 5: Run parity tests without a second generator invocation**

Run:

```powershell
node --test --experimental-strip-types "src/codex/plugin-generator.test.ts" "src/config/schema.test.ts"
```

Expected: PASS for source/generated byte parity, generated inventory, v1 skill trees, research profiles, and schema behavior.

- [ ] **Step 6: Report checkpoint**

Report the one-time command receipt, generated path inventory, parity output, and suggested semantic commit message `chore: regenerate schema and codex bundle`. Do not stage or commit.

## Wave 5 — Integrated verification and real-surface QA

### Task 15: Run targeted checks, repository gates, diagnostics, and real MCP formatting QA

**Depends on:** Task 14

**Files:**
- Verify: `src/runtime-fallback/error-classifier.ts`
- Verify: `src/runtime-fallback/error-classifier.test.ts`
- Verify: `src/runtime-fallback/dispatcher.ts`
- Verify: `src/runtime-fallback/dispatcher.test.ts`
- Verify: `src/runtime-fallback/event-handler-support.ts`
- Verify: `src/runtime-fallback/event-handler-support.test.ts`
- Verify: `src/runtime-fallback/event-handler-generic-fallback.ts`
- Verify: `src/runtime-fallback/event-handler.ts`
- Verify: `src/runtime-fallback/event-handler-test-fixtures.ts`
- Verify: `src/runtime-fallback/event-handler-fallback-dispatch.test.ts`
- Verify: `src/runtime-fallback/event-handler-status-retry.test.ts`
- Verify: `src/runtime-fallback/event-handler-idle-continuation.test.ts`
- Verify: `src/config/schema.ts`
- Verify: `src/config/schema.test.ts`
- Verify: `schema.json`
- Verify: `src/hooks/model-temperature-capability.ts`
- Verify: `src/hooks/model-temperature-capability.test.ts`
- Verify: `src/hooks/chat-params.ts`
- Verify: `src/hooks/chat-params.test.ts`
- Verify: `prompts/omo/deepwork/default.md`
- Verify: `prompts/omo/deepwork/gpt.md`
- Verify: `prompts/v1/deepwork/default.md`
- Verify: `prompts/omo/category/research.md`
- Verify: `prompts/v1/category/research.md`
- Verify: `prompts/codex/category/research.md`
- Verify: `src/intent/proportional-scenario-contract.test.ts`
- Verify: `src/intent/research-provenance-contract.test.ts`
- Verify: `src/intent/planning-executor-contract.test.ts`
- Verify: `src/intent/prompt-loader.test.ts`
- Verify: `src/intent/plan-review-contract.test.ts`
- Verify: `src/codex/plugin-generator.test.ts`
- Verify: `skills/v1/writing-plans/SKILL.md`
- Verify: `skills/v1/subagent-driven-development/SKILL.md`
- Verify: `docs/prompt-sync.md`
- Verify: `docs/v1-maintenance.md`
- Verify: `skills/ast-grep/scripts/ast_grep_helper.py`
- Verify: `skills/ast-grep/tests/test_resolver.py`
- Verify: `skills/ast-grep/tests/smoke.ps1`
- Verify: `skills/ast-grep/tests/smoke.sh`
- Verify: `skills/init-deep/SKILL.md`
- Verify: `crates/ocmm-lsp/src/main.rs`
- Verify: `crates/ocmm-lsp/Cargo.toml`
- Verify: `Cargo.lock`
- Verify: `crates/ocmm-lsp/tests/mcp_stdio.rs`
- Verify: `crates/ocmm-lsp/tests/fixtures/mock_lsp.mjs`
- Verify: `scripts/codemode-execute-compatibility.ts`
- Verify: `scripts/codemode-execute-compatibility.test.ts`
- Verify: `.agents/plugins/marketplace.json`
- Verify: `.codex/agents/dw-research.toml`
- Verify: `plugins/deepwork/agents/dw-research.toml`
- Verify: `plugins/deepwork/skills/deepwork-writing-plans/SKILL.md`
- Verify: `plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md`
- Verify: `plugins/deepwork/skills/ast-grep/scripts/ast_grep_helper.py`
- Verify: `plugins/deepwork/skills/ast-grep/tests/test_resolver.py`
- Verify: `plugins/deepwork/skills/init-deep/SKILL.md`
- Temporary QA only: a uniquely named directory under `[System.IO.Path]::GetTempPath()` removed by the QA script

**Interfaces:**
- Consumes: the complete generated working tree.
- Produces: command/evidence table for targeted tests, full gates, diagnostics, real MCP bytes/result/trace, and cleanup.

**Recommended executor:** `deep`

- [ ] **Step 1: Run all targeted TypeScript contract and runtime tests**

Run:

```powershell
node --test --experimental-strip-types "src/runtime-fallback/error-classifier.test.ts" "src/runtime-fallback/dispatcher.test.ts" "src/runtime-fallback/event-handler-fallback-dispatch.test.ts" "src/runtime-fallback/event-handler-status-retry.test.ts" "src/runtime-fallback/event-handler-idle-continuation.test.ts" "src/config/schema.test.ts" "src/hooks/model-temperature-capability.test.ts" "src/hooks/chat-params.test.ts" "src/intent/proportional-scenario-contract.test.ts" "src/intent/research-provenance-contract.test.ts" "src/intent/planning-executor-contract.test.ts" "src/intent/prompt-loader.test.ts" "src/intent/plan-review-contract.test.ts" "src/codex/plugin-generator.test.ts" "scripts/codemode-execute-compatibility.test.ts"
```

Expected: exit 0; every new contract and existing adjacent regression passes.

- [ ] **Step 2: Run Python and Windows skill checks**

Run:

```powershell
python -m unittest "skills/ast-grep/tests/test_resolver.py" -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pwsh -NoProfile -File "skills/ast-grep/tests/smoke.ps1"
```

Expected: exit 0; all fake candidates and the Windows smoke pass. Confirm `smoke.sh` remains tracked for POSIX CI without running it on Windows.

- [ ] **Step 3: Run focused and full Rust checks**

Run:

```powershell
cargo test -p ocmm-lsp --test mcp_stdio
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
cargo test -p ocmm-lsp
```

Expected: exit 0; formatting plus diagnostics/navigation/rename/workspace-boundary/alias/framing/shutdown regressions pass.

- [ ] **Step 4: Run repository gates in order**

Run each command separately and retain its exit code/output:

```powershell
pnpm run typecheck
```

```powershell
pnpm test
```

```powershell
pnpm run build
```

Expected: each exits 0. These commands do not rerun schema or Codex generators.

- [ ] **Step 5: Run diagnostics on every changed source language when available**

Use the LSP diagnostics tool on changed `.ts` files, `crates/ocmm-lsp/src/main.rs`, and `skills/ast-grep/scripts/ast_grep_helper.py`. Expected: no error diagnostics. If a matching language server is unavailable, record its status output as environmental evidence rather than claiming diagnostics passed.

- [ ] **Step 6: Execute a direct real MCP stdio formatting probe through the built wrapper**

Run this PowerShell block from repository root; it writes only to a unique OS-temp directory and removes it in `finally`:

```powershell
$qaScriptPath = Join-Path ([System.IO.Path]::GetTempPath()) ("ocmm-format-qa-" + [guid]::NewGuid().ToString("N") + ".mjs")
$qaScript = @'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(join(tmpdir(), "ocmm-format-real-"));
try {
  const subject = join(root, "subject.rs");
  const config = join(root, "ocmm-lsp.json");
  const trace = join(root, "trace.jsonl");
  const wrapper = resolve("dist/cli/ocmm-lsp.js");
  const fixture = resolve("crates/ocmm-lsp/tests/fixtures/mock_lsp.mjs");
  writeFileSync(subject, "fn  subject() {}\r\n", "utf8");
  writeFileSync(trace, "", "utf8");
  writeFileSync(config, JSON.stringify({
    lsp: { mock: {
      command: [process.execPath, fixture],
      extensions: [".rs"],
      priority: 10000,
      env: { MOCK_LSP_SCENARIO: "format_utf16_crlf", MOCK_LSP_TRACE: trace },
    } },
  }), "utf8");
  const input = [
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "format", arguments: { filePath: subject } } },
  ].map((value) => JSON.stringify(value)).join("\n") + "\n";
  const run = spawnSync(process.execPath, [wrapper, "mcp"], {
    cwd: root,
    input,
    encoding: "utf8",
    env: {
      ...process.env,
      OCMM_LSP_PROJECT_CONFIG: config,
      OCMM_LSP_USER_CONFIG: join(root, "missing-user-config.json"),
    },
  });
  if (run.status !== 0) throw new Error(`MCP exit ${run.status}: ${run.stderr}`);
  const responses = run.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const names = responses[0].result.tools.map((tool) => tool.name);
  if (!names.includes("format")) throw new Error("format missing from tools/list");
  const details = responses[1].result.details;
  if (responses[1].result.isError || details.status !== "formatted" || details.committed !== true) {
    throw new Error(`unexpected format result: ${JSON.stringify(responses[1])}`);
  }
  if (!readFileSync(subject).equals(Buffer.from("fn subject() {}\r\n"))) {
    throw new Error("formatted bytes or CRLF differ");
  }
  const methods = readFileSync(trace, "utf8").trim().split(/\r?\n/)
    .filter(Boolean).map((line) => JSON.parse(line).method).filter(Boolean);
  const expectedMethods = [
    "initialize", "initialized", "textDocument/didOpen",
    "textDocument/formatting", "textDocument/didClose",
    "textDocument/didOpen", "shutdown", "exit",
  ];
  if (JSON.stringify(methods) !== JSON.stringify(expectedMethods)) {
    throw new Error(`unexpected trace: ${JSON.stringify(methods)}`);
  }
  console.log(JSON.stringify({ status: details.status, committed: details.committed, methods }));
} finally {
  rmSync(root, { recursive: true, force: true });
}
'@
[System.IO.File]::WriteAllText($qaScriptPath, $qaScript, [System.Text.UTF8Encoding]::new($false))
try {
  node $qaScriptPath
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  if ([System.IO.File]::Exists($qaScriptPath)) { [System.IO.File]::Delete($qaScriptPath) }
}
```

Expected: one JSON line with `status:"formatted"`, `committed:true`, and the required LSP methods; subject bytes become exactly `fn subject() {}\r\n`; both temporary script and workspace are removed.

- [ ] **Step 7: Check diff hygiene and generated-boundary safety**

Run:

```powershell
git diff --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git status --short --untracked-files=all
```

Expected: `git diff --check` exits 0; status lists only plan-authorized source/tests/docs, Cargo-generated lock data, schema, and official Codex outputs. No temp QA files, `target/`, credentials, local config, or unexpected historical specs/plans are present.

- [ ] **Step 8: Report checkpoint**

Produce a command/evidence table with command, exit code, concise assertion, and any environmental diagnostic blocker. Include the real MCP JSON and cleanup confirmation. Suggest semantic commit grouping only; do not stage, commit, push, or tag.

## Wave 6 — Identity-bound final acceptance

### Task 16: Capture one artifact identity and obtain required unconditional reviews

**Depends on:** Task 15

**Files:**
- Read: `skills/v1/requesting-code-review/SKILL.md`
- Read: `docs/superpowers/plans/2026-08-28-omo-remaining-candidates.md`
- Read: `docs/superpowers/specs/2026-08-28-omo-remaining-candidates-design.md`
- Read via binary Git diff and typed untracked manifest: the exact changed-file inventory reported by Task 15 Step 7
- Product-file modifications: none unless a reviewer identifies a valid blocker, in which case return to the owning task and invalidate prior evidence/receipts

**Interfaces:**
- Consumes: complete unchanged working tree and Task 15 evidence.
- Produces: canonical `sha256:<64hex>` working-tree identity, one seven-field review packet, and same-identity five-field receipts from the required lanes.

**Recommended executor:** `deep`

- [ ] **Step 1: Freeze the review candidate and capture binary review input**

Run:

```powershell
git status --short --untracked-files=all
git diff --binary --no-ext-diff HEAD --
```

Build the review input from that binary tracked diff plus a byte-sorted untracked manifest with entry types. Store its current task-result reference in `$reviewInputReference`, store Task 15's identity-stamped evidence table reference in `$verificationEvidence`, and store the complete header constraints text in `$globalConstraints`. Do not stage files to simplify review input.

- [ ] **Step 2: Compute identity by extracting the current canonical module**

Run the exact PowerShell wrapper from the current skill rather than copying its hash algorithm:

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

Expected: exactly one canonical `sha256:` identity. Stamp every verification item from Task 15 with this identity.

- [ ] **Step 3: Select only the required available review lanes**

Inspect current callable profile names; generated files are not availability proof. Because this is runtime/filesystem-safety work, select the first available Oracle lane plus `reviewer` in parallel, using available tier priority `max`, then `high`, then unsuffixed normal. Do not auto-fan-out to extra Oracle slots and do not use Reviewer/Oracle for plan review.

- [ ] **Step 4: Send the identical seven-field packet to both selected lanes**

Render the packet as an expanding PowerShell here-string so the saved/sent packet contains concrete runtime values:

```powershell
$packet = @"
ARTIFACT_KIND: working-tree
ARTIFACT_IDENTITY: $artifactIdentity
DESCRIPTION: Implement all nine OMO remaining candidates with bounded runtime state, synchronized prompt/skill semantics, strict ast-grep validation, provider-scoped temperature support, and atomic whole-document LSP formatting.
PLAN_OR_REQUIREMENTS: docs/superpowers/plans/2026-08-28-omo-remaining-candidates.md and docs/superpowers/specs/2026-08-28-omo-remaining-candidates-design.md
REVIEW_INPUT: $reviewInputReference
VERIFICATION_EVIDENCE: $verificationEvidence
GLOBAL_CONSTRAINTS: $globalConstraints
"@
$packet
```

Expected: the rendered packet contains no variable names or explanatory substitutions. Send that identical rendered string to both lanes and require unconditional review of product correctness, runtime safety, filesystem safety, scope, generated parity, and evidence sufficiency.

- [ ] **Step 5: Validate each five-field receipt and recompute identity immediately**

Each receipt must contain exactly, in order: role/profile lane; task_id or durable session receipt; artifact identity; verdict `approved` or `rejected`; report artifact/source. After each lane returns, rerun Step 2. Reject any missing field, mismatched identity, partial response, conditional approval, or identity drift.

- [ ] **Step 6: Handle blockers without preserving stale receipts**

For a valid product blocker, return to its owning task, add a failing regression, apply the smallest in-scope fix, rerun affected targeted checks plus Tasks 14-15 only when their inputs changed, compute a new identity, and request fresh reviews for the new packet. For an evidence blocker, add the missing executable proof without unrelated product edits, recompute identity, and request fresh receipts. Never repair by moving an immutable tag or by staging/committing.

- [ ] **Step 7: Report final acceptance checkpoint**

Report the common current identity, selected lanes, both concrete five-field receipts, Task 15 evidence summary, changed-file inventory, residual environmental blockers, and suggested semantic commit groupings. Completion requires every required receipt to say `approved` for the same current identity. State explicitly that Git writes remain unperformed and require separate parent/user authorization.

## Requirement-to-Task Traceability

| Spec requirement | Implementing tasks | Acceptance evidence |
|---|---|---|
| 1. Bounded error shape, default 402, AbortError exception, ContextOverflow priority | 1, 7, 11 | Nested/cycle/depth/classification tests; 402 condition matrix; runtime regression suite |
| 2. Typed dispatch result and generation/snapshot/target reservation/pending | 2, 7, 11 | Outcome-boundary tests; owner-fencing tests; concurrent/ambiguous/stale integration tests |
| 3. Bounded/deduplicated `session.status` retry ingestion | 11 | Key normalization, bounds/age, pending evidence, lifecycle clearing tests |
| 4. Provider-scoped temperature capability seam | 3 | Pure precedence/provider tests and chat hook tests |
| 5. Proportional scenario and TDD prompt sync | 4, 14, 15 | Prompt contract test, sync docs, generated parity, prompt-loader gate |
| 6. Every-tier ast-grep probe and init-deep first AST probe | 5, 14, 15 | Fake-candidate unit tests, Windows smoke, generated copy parity |
| 7. Research provenance across omo/v1/codex | 8, 14, 15 | Cross-workflow contract test, synchronized docs, generated research profiles |
| 8. Extrinsic planning constraints and executor recommendation | 12, 14, 15 | Writing-plans/SDD contract test, maintenance doc, generated skill parity |
| 9. Rust whole-document `format`/`lsp_format` | 6, 9, 10, 13, 15 | MCP descriptor/alias/capability/encoding/edit/atomic/resync tests, strict compatibility parser, direct real MCP probe |
| Official generation and schema synchronization | 1, 4, 5, 8, 12, 14 | One schema generation, one Codex generation, parity tests, generated inventory |
| Repository gates and diagnostics | 15 | Targeted suites, `typecheck`, `test`, `build`, diagnostics evidence |
| Same-identity final review and no autonomous Git | 16 | Canonical identity, two required same-identity approvals, report-only checkpoints |

## Execution Handoff

Execute continuously through the six waves with a fresh worker per task. Before dispatching a task, honor its dependency list and verify that no concurrent worker owns any file in its Files section; recommendations guide selection but never override callable availability or routing policy. Execution begins only after the parent obtains a current receipt from the mandatory unsuffixed `plan-critic` review.
