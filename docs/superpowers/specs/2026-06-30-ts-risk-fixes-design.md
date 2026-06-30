# TS Risk Fixes Design

## Context

The code review identified three TypeScript runtime risks that can be fixed independently from the larger Rust LSP and release-platform work:

1. `src/routing/ledger.ts` and `src/hooks/chat-message.ts` keep module-level state that can leak across multiple plugin instances or tests.
2. Runtime fallback can mark the wrong failed model when a `session.error` event has no model payload, and retry currently forwards only one user message.
3. `subagent-git-guard` uses a regex that can miss git write commands when global git options appear before the subcommand, such as `git -c user.name=x commit`.

Rust LSP modularization/error-injection tests and Linux musl release binaries are confirmed risks but are out of scope for this implementation batch. They should be handled in separate designs because they affect Rust architecture, CI release matrices, and packaging docs.

## Goals

- Scope route-resolution ledger state to each plugin instance while preserving compatibility for existing tests and imports.
- Scope chat-message/system-transform session intent state to each plugin instance and ensure event cleanup uses the same store.
- Make fallback failed-model detection prefer explicit event model, then known active fallback state, and only then primary fallback chain entry.
- Preserve more user retry context by reprompting with the latest contiguous user-message block instead of a single last user message.
- Replace git-write regex detection with token-based git command parsing that handles common global git options before write subcommands.
- Add focused unit tests for each changed behavior.

## Non-Goals

- Do not refactor `crates/ocmm-lsp/src/main.rs` in this batch.
- Do not add Linux musl release assets or CI matrix entries in this batch.
- Do not change public configuration schema.
- Do not introduce a full shell parser; the git guard only needs robust enough token parsing for realistic `git` invocations through the existing shell-command hook.
- Do not reconstruct full conversation history during fallback retry, because OpenCode `client.session.prompt()` accepts a new prompt body rather than a whole replay transcript.

## Design

### 1. Per-plugin state isolation

`src/routing/ledger.ts` will expose a small `createResolutionLedger()` factory that owns `entries` and `listeners`. The existing module-level functions (`recordResolution`, `recentResolutions`, `clearResolutions`, `onResolution`) will remain as wrappers around a default ledger so existing tests and consumers do not break. `createPlugin()` will instantiate its own ledger and pass `ledger.recordResolution` to the chat params handler.

`src/hooks/chat-message.ts` will introduce a `createSessionIntentStore()` factory with operations for queuing prompts, consuming once-prompts, marking v1 skills queued, and clearing a session. `createChatMessageHandler()` and `createSystemTransformHandler()` will accept the same store from `createPlugin()`. The event cleanup path will use that store's `clearSessionIntent()` instead of the current module-level map. Existing exported cleanup helpers can stay as default-store wrappers for test compatibility.

### 2. Runtime fallback model and context handling

Fallback state already lives inside `createRuntimeFallbackEventHandler()`. The state will also track the active model used for the current attempt. Failed-model detection will use this order:

1. `session.error` event model payload, when available.
2. Active model recorded in fallback state for that session.
3. First fallback-chain entry as a final fallback.

When a retry is prepared, fallback selection first peeks at the next candidate without mutating state. The chosen fallback entry becomes the active model only after `dispatchFallbackRetry()` succeeds. This prevents missing event model payloads from repeatedly marking the primary model as failed after a previous fallback attempt, without advancing state for observe-only, missing-client, or failed-dispatch paths.

`dispatchFallbackRetry()` will replace `extractLastUserParts()` with extraction of the latest contiguous block of user messages. It will scan messages backward, collect adjacent user messages, preserve chronological order, and concatenate their `parts` or text content into a single prompt parts array. It will stop at the first non-user message before that block. This keeps multi-message user input from the same turn while avoiding replay of assistant/tool history.

### 3. Token-based git write guard

`isGitWriteCommand()` will use the existing `tokenizeCommand()` helper. It will find `git`, skip common global options that can precede the subcommand, then classify the real subcommand:

- Always blocked: `commit`, `push`, `tag`, `rebase`, `cherry-pick`, `revert`.
- Conditionally blocked: `reset --hard`.

The parser will skip option forms that consume a following value (`-c`, `--git-dir`, `--work-tree`, `--namespace`, `--config-env`, `--exec-path`, `--super-prefix`) and single-token/global flags (`--no-pager`, `--paginate`, `--bare`, `--literal-pathspecs`, `--no-optional-locks`, etc.). Unknown options before the subcommand will be skipped conservatively when they start with `-`; once a non-option token appears, it is treated as the subcommand.

This intentionally stays focused on direct `git` invocations. It does not attempt to detect shell aliases, functions, or arbitrary wrapper scripts.

## Data Flow

- `createPlugin()` constructs per-instance `resolutionLedger` and `sessionIntentStore`.
- `chat.params` records route decisions into the instance ledger.
- `chat.message` queues v1 skills and command prompts into the instance session intent store.
- `system.transform` consumes queued prompts from the same store.
- `event` clears the same store on `session.deleted` and uses runtime fallback state to track active retry model.
- `tool.execute.before` uses token-based git write classification when subagent git guard is active.

## Error Handling

- If fallback still cannot infer a failed model, it uses the primary chain entry as today's behavior does, but only after checking explicit event data and active state.
- If no user parts can be extracted for retry, fallback dispatch continues to return a clear failure reason instead of sending an empty prompt.
- Git guard parsing failures should fail closed for known write subcommands when tokenization succeeds, but should not block non-write commands such as `git status`, `git log`, or `git diff`.

## Testing

Targeted tests will cover:

- Two independently created chat-message/system-transform handler pairs do not share queued prompts or v1-skill state.
- A plugin-instance ledger does not leak records into another plugin-instance ledger; default ledger compatibility remains intact.
- Runtime fallback without event model uses active fallback state after the first retry instead of always marking the primary model.
- Fallback retry extracts the latest contiguous user-message block in chronological order.
- Git guard blocks `git -c user.name=x commit`, `git --no-pager push`, and `git reset --hard`, while allowing `git status`, `git log`, and non-hard `git reset`.

Verification commands:

- `pnpm run typecheck`
- Focused `node --test --experimental-strip-types --test-reporter=spec` runs for changed TypeScript test files
- `pnpm test` if focused tests pass and runtime cost is acceptable

## Follow-Up Work

- Create a separate Rust LSP design for splitting `crates/ocmm-lsp/src/main.rs` into modules and adding child-process failure/timeout tests plus an end-to-end MCP smoke test.
- Create a separate release-platform design for Linux musl binaries, covering target triples, GitHub Actions runner/toolchain setup, package path validation, docs, and `ocmm-lsp-binary.ts` behavior.

## Self-Review

- Placeholder scan: no placeholder sections remain.
- Consistency check: scope, goals, and testing all target only the approved TS batch.
- Scope check: Rust LSP and musl release are explicitly excluded and captured as follow-up work.
- Ambiguity check: fallback context preservation is defined as latest contiguous user-message block, not full transcript replay.
