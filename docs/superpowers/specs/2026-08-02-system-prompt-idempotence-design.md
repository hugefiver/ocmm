# System Prompt Idempotence Design

**Date:** 2026-08-02
**Status:** Approved by clarified user scope and ambiguity-free self-review

## Goal

Make repeated construction of the same OpenCode system prompt idempotent without changing agent reuse, task dispatch, model behavior, session lifecycle, or provider options.

## Scope

- Modify only the system prompt composition performed by `createSystemTransformHandler()`.
- Preserve the current visible session prompt and Commit Guard text exactly.
- Preserve array, string, and absent `system` shapes.
- Add no session-level receipt, `WeakSet`, model-visible marker, task interception, or agent reuse policy.

Agent reuse remains exactly as it is today. The model and current callable task schema continue to decide whether an existing child session is useful; this change neither encourages nor enforces additional reuse.

## Design

Introduce small stateless deterministic helpers local to `src/hooks/chat-message.ts` that append or prepend an exact block only when that block is not already present in the position owned by ocmm:

- For array systems, the session prompt is an exact first element and the Commit Guard is an exact last element.
- For string systems, the session prompt is an exact prefix separated by two newlines and the Commit Guard is an exact suffix separated by two newlines.
- For absent systems, construction retains the existing array behavior.

Calling the handler twice with the same input and output therefore leaves the second result byte-for-byte unchanged. A separate output for the same session still receives the complete prompt because no cross-request state is stored.

The helpers do not remove or rewrite host text. A coincidental occurrence in the middle of a host prompt does not count as an ocmm-owned prefix or suffix and is left untouched.

## Error Handling

The existing `getConfig()` failure behavior remains unchanged: session prompt construction may succeed while Commit Guard construction logs a warning and is skipped. No retry state is introduced.

## Tests

Extend `src/hooks/chat-message.test.ts` to prove:

1. Repeated array construction does not duplicate the session prompt or Commit Guard.
2. Repeated string construction is byte-for-byte stable.
3. Two distinct outputs in the same session each receive the complete prompt.
4. A middle occurrence of either text is not treated as an owned prefix or suffix.
5. Disabled Commit Guard and throwing config behavior remain unchanged.

Run the focused test, typecheck, full test suite, build, `git diff --check`, and final identity-bound implementation review.

## Non-Goals

- No agent/session reuse optimization.
- No task hook or argument rewriting.
- No cache key, provider, breakpoint, message, tool schema, or permission changes.
- No prompt text compression or role-prompt synchronization.
