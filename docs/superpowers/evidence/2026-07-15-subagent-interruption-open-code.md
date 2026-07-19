# OpenCode Subagent Interruption Probe — 2026-07-15

- OpenCode version: `1.18.3`
- Probe root: `C:\Users\HUGEFI~1\AppData\Local\Temp\opencode\ocmm-interruption-probe`
- Fake provider: local Node built-ins HTTP server on `127.0.0.1:41990`
- OpenCode server: `127.0.0.1:41991`

## Isolation and config proof

- Every live probe command used `workdir = C:\Users\HUGEFI~1\AppData\Local\Temp\opencode\ocmm-interruption-probe`.
- Before each probe run, the environment was isolated by saving and clearing:
  - `OCMM_PROFILE`
  - `OCMM_NO_PROFILE`
  - `OPENCODE_CONFIG_CONTENT`
  - `OPENCODE_CONFIG`
  - `OPENCODE_CONFIG_DIR`
- Probe-local XDG paths were set under the probe root for `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, and `XDG_CACHE_HOME`.
- `OCMM_PLUGIN_ENTRY` was set to repo build output: `C:\Users\hugefiver\source\ocmm\dist\index.js`.
- Saved env vars were restored after each run. `OPENCODE_CONFIG_CONTENT` value was never printed or recorded.
- `opencode debug paths` resolved to probe-local `config/data/state/cache` directories.
- `opencode debug agent doc-search --print-logs --log-level DEBUG` under isolation resolved:
  - `providerID: ocmm-local-probe`
  - `modelID: retry429`

## Probe setup summary

- Fake provider models and behavior:
  - `orchestrator-tool`: streams OpenAI-compatible tool-call delta chunks (`delta.tool_calls` header + argument deltas + `finish_reason=tool_calls`).
  - `retry429`: returns either HTTP 429 rate-limit or HTTP 400 rate-limit body depending on prompt mode.
  - `resume-disconnect`: transport disconnect unless latest user text contains `RESUMED`; then returns success.
  - `success`: generic success text.
  - `abort-hold`: holds request to allow explicit abort.
- Wrapper plugin captured only sanitized fields for:
  - `session.created`
  - `session.error`
  - `session.idle`
  - `session.deleted`
  - `message.part.updated`
  - `tool.execute.after` (before/after)
- Wrapper intentionally did not log prompt content, credentials, auth payloads, or raw provider error bodies.

## Focused transport-first result (required first gate)

- Transport probe was run first (`INTERRUPTION_PROBE`) with `code-search -> resume-disconnect` configured to disconnect unless resumed.
- Observed runtime behavior:
  - child session created,
  - child `session.error` surfaced as `MessageAbortedError`,
  - repeated child `session.idle`,
  - no terminal parent `message.part.updated` task-error payload was captured for that transport child,
  - the original parent task call completed after two `resume-disconnect` provider requests while retaining one child,
  - no terminal transport-child `tool.execute.after` payload exposed a resumable task identifier,
  - no resumable `task_id` appeared in captured parent task input or metadata.
- Because no explicit `task_id` was exposed, no manual resume call could be made without violating the “no fabrication” rule.
- Parent produced `PARENT_DONE` through the original task call. For contract persistence this is `handoff: original-call`; no manual task-ID continuation was attempted.

## Prior findings preserved from earlier live probes

1. Under proper isolation, `opencode debug agent doc-search` resolves to `providerID: ocmm-local-probe`, `modelID: retry429`.
2. HTTP 429 can be internally retried by OpenCode/AI SDK without surfacing child `session.error` in short windows; HTTP 400 (`message: rate limit; retry later`, `type: rate_limit_error`) does surface child `session.error`, and current runtime fallback did not dispatch `success` in this observed path.
3. The final focused run confirmed transport-disconnect recovery inside the original task call (`handoff: original-call`) while retaining one child.
4. This focused run used the stricter transport behavior to attempt terminal/task_id capture. No explicit `task_id` surfaced, and no IDs were inferred or fabricated.

## Combined probe outcomes

### 1) 429 behavior (live runtime truth)

- In HTTP 429 mode, fake provider recorded heavy repeated `retry429` calls (`retry429HttpCalls: 268` at capture snapshot; in-flight retries can continue briefly after snapshot collection).
- In this window, no child `session.error` surfaced for that 429 child (`fallback429ChildErrorObserved: false`).
- This matches prior finding: internal retries can continue without quickly surfacing `session.error` to ocmm.

### 2) Surfaced retryable child error (rate-limit 400 shape)

- In HTTP 400 mode (`message: rate limit; retry later`, `type: rate_limit_error`), child `session.error` surfaced with sanitized shape:
  - `type: session.error`
  - `sessionID: ses_REDACTED`
  - `errorName: APIError`
- No `success` dispatch occurred (`successCalls: 0`) under this observed runtime/config path.
- This preserves prior requirement to report actual runtime truth (no invented fallback success).

### 3) Explicit abort non-recovery

- `ABORT_PROBE` created a hold child request; explicit child abort was issued.
- `abort-hold` request count did not increase after abort path.
- Result: `explicitAbortRecovered: false` (expected).

## Captured event classes

Observed in this run:

- `session.created`
- `session.error`
- `session.idle`
- `message.part.updated`
- `tool.execute.after`

Not observed in this run:

- `session.deleted`

No REST endpoint variant probe produced a `session.deleted` event in the captured log window; evidence reflects this directly rather than inferring deletion behavior.

## Contract decisions persisted to fixture

- `handoff`: `original-call`
- `taskIDObserved`: `null`
- `resumeReusedChildSession`: `false`
- `explicitAbortRecovered`: `false`

And critically:

- `taskIDObserved` was **not** inferred from child session ID.
- Because no explicit `task_id` was observed, fixture stores JSON `null` and evidence records this explicitly.

## Persisted-fixture branch provenance

The committed fixture is a sanitized **cross-branch contract aggregate**, not one atomic event trace. `terminalParentTaskPart` and `handoff` come from the focused transport branch. In that branch, `terminalParentTaskPart` is `null`, the original task call completed with one child after two provider requests, and no task ID or continuation notice was fabricated.

The non-null `toolExecuteAfter` field and `retryableChildError: APIError` come from the HTTP-400 rate-limit branch, where OpenCode surfaced the retryable child error and a task after-hook observation. `original-call` means the focused transport path completed within the original task invocation; it does **not** mean that a continuation notice was appended. The aggregate therefore correctly keeps `noticePresent: false`.

## Sanitization notes

- All session IDs in the committed fixture are redacted to `ses_REDACTED`.
- Fixture includes only sanitized contract fields:
  - `openCodeVersion`
  - `sessionCreated`
  - `retryableChildError`
  - `terminalParentTaskPart`
  - `toolExecuteAfter`
  - `handoff`
  - `taskIDObserved`
  - `resumeReusedChildSession`
  - `explicitAbortRecovered`
- No API keys, provider credentials, prompt payloads, or raw provider error payload bodies were persisted.

## Temporary artifact cleanup

- Temporary probe root cleanup completed after validation.
- Final verification observed `PROBE_ROOT_EXISTS=False` for `C:\Users\HUGEFI~1\AppData\Local\Temp\opencode\ocmm-interruption-probe`.
