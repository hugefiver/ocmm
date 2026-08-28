# OMO Remaining Candidates Design

**Date:** 2026-08-28
**Status:** Approved through user delegation
**Upstream baseline:** `./omo@ef1c392f10eafb28913eb7815143c328d88aad47`
**ocmm baseline:** `1bd02f01bcc2a13ae5dafaff44670fa1bf5f3098`

## Summary

Import every remaining OMO v5 capability that fits ocmm's existing philosophy without importing OMO's beta multi-harness architecture. The implementation remains an OpenCode-first plugin with explicit configuration, bounded in-memory state, cross-platform safety, generated-artifact parity, and evidence-bound completion.

The work has three native surfaces:

1. Strengthen the existing TypeScript runtime-fallback and model-capability paths.
2. Synchronize narrowly selected prompt and skill semantics across omo, v1, and Codex sources.
3. Add document formatting to the existing Rust `ocmm-lsp` MCP server.

These surfaces share one specification and one final acceptance review, but remain separately testable implementation units.

## Goals

- Recover safely from terminal quota HTTP 402 failures, including provider errors wrapped in abort-shaped errors.
- Prevent duplicate fallback prompts when dispatch completion is concurrent or ambiguous.
- Consume retry-bearing `session.status` events without repeated-error stalls.
- Preserve context-overflow/native compaction behavior even when users configure status 400 as retryable.
- Let real provider/model capability metadata override temperature family heuristics when the host supplies it.
- Scale scenario count and TDD requirements to actual change risk and available test seams.
- Reject broken or unrelated `sg` executables at every resolver tier.
- Preserve research provenance and surface archive/proxy limitations.
- Capture external planning constraints and route plan tasks through existing local executor categories.
- Provide safe, capability-aware whole-document LSP formatting with encoding-correct edits and atomic file replacement.

## Non-goals

- Senpi DAGs, Memory v2, thread/mailbox state, telemetry, native evaluation, or unified config migration.
- Persistent goal/assumption ledgers, automatic worktrees, pull requests, checkpoints, commits, or pushes.
- Trusting arbitrary provider `isRetryable: true` fields.
- OMO's prompt-async-gate package, retry toast/runtime, resident LSP manager, daemon, IPC, socket authentication, or LRU clients.
- Range formatting, on-type formatting, code actions, formatter installation, or a generic workspace-edit transaction framework.
- Replacing existing 429, interruption-correlation, review-identity, variant, or LSP initialization fixes that ocmm already owns.

## Architecture

### 1. Runtime error shape and classification

Create one bounded error-shape reader used by the classifier and event handler. It examines only the root plus the `error`, `data`, and `cause` fields to a fixed maximum depth, tracks visited objects, and extracts:

- numeric `status`, `statusCode`, or numeric/string `code`;
- error `name`;
- error `message`.

It must not recursively traverse arbitrary object graphs and must not elevate a provider boolean such as `isRetryable` into policy.

Classification order becomes:

1. Detect a root or nested error whose name is exactly `ContextOverflowError`; classify it as non-retryable before configured statuses or message patterns.
2. Apply explicitly unsafe/non-retryable status policy.
3. Apply configured retry status codes, including the new default `402`.
4. Apply existing retryable and non-retryable message patterns.

The default `runtimeFallback.retryOnStatusCodes` becomes `[402, 429, 500, 502, 503, 504]`. A user-supplied array continues to replace the default rather than merge with it, so users can explicitly disable 402 handling.

An explicit user abort marker (`isAbort: true`) is always terminal, including when the same error contains status 402. A provider abort-shaped error identified only by `AbortError`/`DOMException` remains terminal except when all of these are true:

- the bounded shape contains status 402;
- runtime fallback is enabled and 402 is configured retryable;
- the session and effective agent route can resolve a fallback chain.

That exception proceeds through normal lifecycle, suppression, classification, and dispatch gates. It does not record explicit-user-abort tombstones because it never applies to an explicit user abort marker. A non-402 abort keeps the current behavior.

### 2. Dispatch outcome and reservation gate

Replace `dispatchFallbackRetry(): Promise<boolean>` with a typed result:

```ts
type DispatchFallbackOutcome =
  | { status: "accepted" }
  | { status: "possibly-accepted"; error: unknown }
  | { status: "rejected"; reason: "in-flight" | "stale" | "messages" | "empty-parts" }
```

The boundary is intentionally conservative:

- failures before invoking `client.session.prompt` are `rejected` and release the reservation;
- a resolved prompt call is `accepted`;
- any rejection after prompt invocation is `possibly-accepted`, because the SDK cannot prove whether the host accepted the prompt before the transport failed.

Add a per-session reservation owned by `{ generation, routeSnapshotId, targetModel }`. Reservation acquisition happens before abort/messages/prompt I/O. The existing lifecycle's `guardedClient`, `trackDispatch`, `waitForStaleDispatches`, generation checks, and route snapshot checks remain authoritative.

The generic fallback flow is:

1. Resolve and peek the next fallback without mutating the committed fallback index.
2. Acquire the current generation/snapshot reservation. Concurrent attempts return `rejected/in-flight`.
3. Dispatch through the guarded client.
4. On `rejected`, release the reservation and do not call `commitFallback`.
5. On `accepted` or `possibly-accepted`, commit the target and retain a pending record. This prevents a duplicate prompt while the host outcome is unresolved.
6. Clear pending state when a current event proves the target model is active/failed, when the generation or route snapshot changes, or when the session is created/deleted.

Pending state never survives process restart. An `accepted` or `possibly-accepted` record is not released by a timer because elapsed time cannot prove that the host rejected the prompt; only current lifecycle/model evidence may clear it. The map remains bounded to one record per live session and is cleared with session lifecycle state.

### 3. `session.status` retry ingestion

Extend the event hook to recognize `session.status` with `status.type === "retry"`. Normalize a retry key from:

```text
provider/model + variant + attempt + whitespace-normalized lowercase message
```

Missing model/provider fields use stable `unknown` segments; they are not guessed from unrelated providers. Keep a bounded per-session insertion-ordered set. Repeated identical keys are ignored; distinct attempts/messages/models may advance fallback.

Status processing shares the same route resolution, classification, generation, snapshot, reservation, and generic fallback path as `session.error`. It must not create a second fallback implementation.

Pending behavior:

- a retry event explicitly naming the pending target proves that target was active; clear pending and allow the event to advance from that target;
- an event naming the old model while a target is pending is ignored as stale;
- a model-less duplicate while pending is ignored because it cannot prove target ownership.

Clear retry keys and pending records on `session.created`, `session.deleted`, lifecycle generation replacement, or a confirmed model/variant transition. Enforce both a maximum key count and an age limit so long-lived sessions cannot grow state without bound.

### 4. Temperature capability seam

Extract temperature support into a pure provider-scoped resolver:

```ts
type ModelTemperatureCapability = {
  providerID: string
  modelID: string
  supportsTemperature?: boolean
}

function supportsModelTemperature(input: ModelTemperatureCapability): boolean
```

Resolution precedence is:

1. a real runtime boolean supplied on the current model input;
2. an explicit bundled provider/model capability entry, if present;
3. the existing family/model-name heuristic.

Model normalization may remove recognized variant/reasoning suffixes for lookup, but lookup keys always include normalized provider ID. Metadata from one provider must never affect a same-named model from another provider. No network fetch, background cache, migration, or new configuration surface is introduced.

If the current OpenCode hook payload exposes no reliable capability boolean, the first implementation still introduces the pure seam and injectable tests while preserving heuristic behavior. It must not fabricate metadata.

### 5. Proportional scenario and TDD contracts

Synchronize the remaining strict prompts:

- `prompts/omo/deepwork/default.md`
- `prompts/omo/deepwork/gpt.md`
- `prompts/v1/deepwork/default.md`

Required semantics:

- small, single-surface changes use one or two targeted scenarios;
- multi-surface, high-risk, security, runtime-safety, data-loss, migration, or release work uses at least three scenarios;
- every change covers its happy path, while edge and adjacent-regression scenarios are required only when the risk exists;
- test-first is mandatory when production behavior has a real deterministic test seam;
- work without a meaningful seam uses the strongest real-surface verification instead of synthetic prose-pinning tests;
- characterization tests precede refactors only when behavior regression could otherwise be hidden.

Update `docs/prompt-sync.md` and `docs/v1-maintenance.md` with the adapted upstream provenance and local differences.

### 6. Strict ast-grep resolution

In `skills/ast-grep/scripts/ast_grep_helper.py`, apply the same probe to every candidate source: environment override, runtime download, cache, Homebrew, and PATH.

A candidate is usable only when:

- it is an executable file or resolvable command;
- `<candidate> --version` exits zero within five seconds;
- combined stdout/stderr contains `ast-grep`, case-insensitively.

A failed, timed-out, or misleading candidate is skipped and resolution continues to the next tier. The helper must not install or download anything as part of this change.

Add deterministic tests with fake candidates that cover a valid binary, non-zero exit, timeout, unrelated `sg`, and fallback to the next tier. Preserve existing PowerShell and POSIX smoke tests.

Update `skills/init-deep/SKILL.md` so structural repository tasks begin with one AST-shaped probe when `sg` is available. `rg` remains the text search tool and LSP remains the semantic reference tool. If no valid `sg` is found, report that structural measurement was unavailable and continue with read-only evidence.

### 7. Research provenance hygiene

Apply the same compact provenance contract to:

- `prompts/omo/category/research.md`
- `prompts/v1/category/research.md`
- `prompts/codex/category/research.md`

The contract requires agents to:

- retain source route and retrieval/publication date when tools provide them;
- label archives and snapshots with their snapshot timestamp and never present them as live state;
- treat proxy, mirror, cached, or explicitly untrusted output as indirect evidence and corroborate material claims through an independent route;
- state when a tool does not expose provenance rather than inventing source fields.

It does not require exhaustive research, a second worker for every claim, a citation graph, or persistent research assets.

### 8. Planning constraints and executor recommendation

Extend `skills/v1/writing-plans/SKILL.md` with a compact extrinsic-constraints pass before finalizing `Global Constraints`. It checks only constraints material to the requested outcome:

- budget or paid-service limits;
- mandated or prohibited technology stack;
- expected scale/capacity;
- audience, privacy, compliance, or accessibility obligations.

Unknown values are not invented. The plan records a reversible default when one is safe; otherwise it identifies the unresolved decision for the approval gate.

Each implementation task gains exactly one field:

```markdown
**Recommended executor:** `coding`
```

The value must be an existing local category or role appropriate to implementation: `quick`, `coding`, `normal-task`, `complex`, `deep`, `frontend`, or `documenting`. `hard-reasoning` may be recommended only when the task output is a difficult decision rather than code. Planning/review roles are not implementation executors.

Update `skills/v1/subagent-driven-development/SKILL.md` to consume this field as a recommendation. The orchestrator must still verify profile availability, file ownership conflicts, task dependencies, security/runtime-safety rigor, and whether direct execution is smaller. The recommendation never overrides routing policy and does not introduce a goal/assumption ledger.

Regenerate the official Codex bundle rather than editing generated skill copies.

### 9. Rust LSP whole-document formatting

Add MCP tool `format` and alias `lsp_format` to `crates/ocmm-lsp/src/main.rs`.

Input schema:

```json
{
  "type": "object",
  "properties": { "filePath": { "type": "string" } },
  "required": ["filePath"],
  "additionalProperties": false
}
```

#### Capability and encoding negotiation

The initialize request advertises `general.positionEncodings: ["utf-8", "utf-16"]`. `LspSession::initialize` retains:

- whether `capabilities.documentFormattingProvider` is `true` or an options object;
- `capabilities.positionEncoding`, defaulting to UTF-16 when absent.

An unsupported negotiated encoding is a tool error rather than a guessed conversion.

If formatting is not advertised, return a non-error typed result:

```json
{
  "status": "unavailable",
  "reason": "capability_not_advertised",
  "linesAdded": 0,
  "linesRemoved": 0
}
```

#### Request and unchanged result

Send `textDocument/formatting` for the opened URI with fixed options:

```json
{
  "tabSize": 4,
  "insertSpaces": false,
  "trimTrailingWhitespace": true,
  "insertFinalNewline": true,
  "trimFinalNewlines": true
}
```

`null`, an empty edit array, or edits producing byte-identical UTF-8 content returns `status: "unchanged"`. It does not write, replace, or alter the target mtime.

#### Edit normalization

All edits apply to one immutable source snapshot. Validation must reject:

- non-integer or negative positions;
- nonexistent lines;
- UTF-8 byte offsets that split a code point;
- UTF-16 offsets that split a surrogate pair;
- reversed ranges;
- overlapping ranges;
- conflicting insertions at the same zero-width position.

Exactly identical edits are deduplicated. Adjacent edits and distinct zero-width insertions at distinct positions are valid. Convert positions to byte offsets using the negotiated encoding, then sort edits by descending start/end offset and apply them to the original bytes. Preserve untouched CRLF/LF bytes exactly.

Immediately before commit, reread the target and require byte equality with the original snapshot. A same-length concurrent modification is therefore detected and never overwritten.

#### Atomic replacement and resynchronization

Write the formatted bytes to a unique `create_new` temporary file in the target directory, preserve the target permissions, flush and `sync_all`, then atomically replace the target:

- Unix uses same-directory rename replacement;
- Windows uses `MoveFileExW` with replace-existing/write-through semantics through a Windows-only `windows-sys` dependency;
- Windows must never delete the target before rename.

On validation, stale-snapshot, temp-write, or replacement failure, clean up the owned temp file and leave the target bytes unchanged.

After a successful replacement, send `textDocument/didClose`, then `textDocument/didOpen` with incremented version and the full new text. If resynchronization fails after disk commit, return an error whose details include `committed: true`; never claim the file was untouched.

Successful output is:

```json
{
  "status": "formatted",
  "linesAdded": 2,
  "linesRemoved": 1,
  "committed": true
}
```

Line deltas compare logical old/new line sequences and are zero for unavailable/unchanged results.

## File Boundaries

Expected source changes are limited to:

- `src/runtime-fallback/{error-classifier,dispatcher,event-handler,event-handler-support,event-handler-generic-fallback}.ts` and focused tests/fixtures;
- `src/config/schema.ts` and generated `schema.json`;
- `src/hooks/chat-params.ts` plus a focused capability module/test if separation keeps files bounded;
- the listed `prompts/omo`, `prompts/v1`, and `prompts/codex` files;
- `skills/ast-grep/**`, `skills/init-deep/SKILL.md`, `skills/v1/{writing-plans,subagent-driven-development}/SKILL.md`;
- official generated Codex artifacts produced by `pnpm run gen:codex-plugin`;
- `docs/{prompt-sync,v1-maintenance}.md`;
- `crates/ocmm-lsp/{src/main.rs,Cargo.toml,tests/mcp_stdio.rs,tests/fixtures/mock_lsp.mjs}` and `Cargo.lock` if Windows atomic replacement needs `windows-sys`.

Do not refactor unrelated fallback, prompt-loading, routing, or LSP code.

## Verification

### Runtime fallback

- 402 + provider `AbortError` dispatches exactly once when 402 is configured and a fallback exists.
- Explicit `isAbort: true` with root or nested 402, ordinary user abort, disabled fallback, omitted 402, or missing chain never dispatches.
- Nested 402 is found within the bounded shape; cycles and excessive depth terminate safely.
- `ContextOverflowError + 400` remains non-retryable while an ordinary explicitly configured 400 remains retryable.
- Concurrent errors invoke one prompt.
- Pre-prompt failure releases the reservation and permits a later retry.
- Prompt rejection after invocation becomes possibly accepted and suppresses duplicates.
- Session deletion/recreation and stale route snapshots prevent stale commits.
- `session.status` duplicate keys collapse; distinct attempt/message/model keys advance; pending target evidence advances safely; old/model-less pending events do not duplicate.
- Existing 429, lifecycle, interruption recovery, idle continuation, and generic fallback suites remain green.

### Model capability

- runtime `supportsTemperature: false` strips temperature;
- runtime `true` preserves temperature even when the family heuristic says unsupported;
- normalized suffix lookup is provider scoped;
- absent metadata preserves current heuristic behavior.

### Prompt and skills

- direct review confirms old unconditional 3+ scenario and universal TDD text is absent only from targeted prompts;
- prompt loader/registry and generated Codex parity tests pass;
- strict ast-grep resolver tests cover valid, wrong, failed, timed-out, and fallback candidates;
- existing `smoke.ps1` runs on Windows;
- generated inventory and byte parity remain exact.

### LSP formatting

- `tools/list` exposes `format`; `lsp_format` normalizes to it.
- capability missing/false returns unavailable without changing bytes or mtime.
- null/empty/byte-identical edits return unchanged without changing mtime.
- valid unordered edits format correctly under UTF-8 and UTF-16, including non-BMP text and CRLF.
- invalid boundaries, reversed/overlapping/conflicting edits, stale snapshots, and locked targets fail without corrupting the source.
- successful formatting traces initialize, didOpen, formatting, didClose, didOpen, shutdown, exit.
- post-commit resync failure reports `committed: true`.
- diagnostics, navigation, rename, workspace-boundary, alias, and framing regressions remain green.

### Repository gates

- `pnpm run gen-schema`
- `pnpm run build:ts` followed by `pnpm run gen:codex-plugin`
- targeted TypeScript, Python/PowerShell skill, and Rust MCP tests
- `pnpm run typecheck`
- `pnpm test`
- `pnpm run build`
- diagnostics on changed source files when the matching language servers are available
- real MCP stdio call demonstrating `format` on a temporary fixture with a mock formatter

## Acceptance

The batch is complete only when every included surface is implemented, generated artifacts match their sources, repository gates pass or an environmental blocker is precisely evidenced, and the same final artifact identity receives all required unconditional review approvals. Git commit/push remains a separate explicitly authorized action.
