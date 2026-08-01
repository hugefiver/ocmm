# OpenCode Background Subagents Design

**Date:** 2026-08-01
**Status:** Approved for implementation after self-review

## Goal

Let users explicitly start OpenCode through the `ocmm` shim with OpenCode's native experimental background-subagent capability enabled, and teach OpenCode orchestrators to use that capability only when the active `task` schema exposes it.

The implementation is an enablement and guidance layer. OpenCode remains the sole owner of child-session creation, process-local background jobs, completion/error notification, extension, and cancellation.

## Scope

1. Add an ocmm-only startup flag:

   ```text
   ocmm --background-subagents <opencode arguments>
   ```

2. Set `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true` only in the spawned OpenCode child process when the flag is present.
3. Add OpenCode-specific orchestrator guidance for native `background: true` behavior.
4. Add regression coverage proving existing task-output, interruption, and idle-continuation hooks do not mistake normal background-task lifecycle signals for failures or work requiring extra continuation.
5. Document the flag, experimental status, shim boundary, and host-owned lifecycle.

## Non-goals

- No ocmm job registry, queue, polling API, cancellation tool, persistence, restart recovery, or daemon.
- No `task_status`, `background_output`, or `background_cancel` compatibility tools.
- No inference of `task_id` from child session IDs.
- No changes to Task permissions, `subagent.maxDepth`, host `subagent_depth`, 429 fallback, or route semantics.
- No persistent ocmm config field or config-schema change.
- No OpenCode environment flag in Codex manifests, prompts, or generated agent profiles.
- No replacement of existing wrapper-specific `run_in_background` examples outside the OpenCode orchestrator guidance.

## Chosen Approach

Use a thin CLI adapter plus capability-gated model guidance.

This follows the existing `--fast` shim pattern, keeps the experimental capability opt-in per startup, and avoids duplicating OpenCode's runtime. A persistent config field would add schema and precedence semantics without serving the requested startup-parameter use case. An ocmm-owned task manager would conflict with the host's child sessions and process-local `BackgroundJob` registry.

## CLI Contract

### Argument parsing

`ShimArgs` gains `backgroundSubagents: boolean`. `parseArgs()` consumes `--background-subagents` only before the passthrough separator.

| Invocation | Shim behavior | OpenCode passthrough |
|---|---|---|
| `ocmm --background-subagents run hello` | Enable child env | `run hello` |
| `ocmm run hello` | Explicitly clear inherited enablement | `run hello` |
| `ocmm -- --background-subagents` | Do not enable | `--background-subagents` |

No shorthand is added. The explicit name avoids collision with OpenCode's model-facing `background` Task field and future host CLI options.

### Child environment

`buildChildEnv()` continues to copy the parent environment before modification.

- Enabled: set `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` to the exact string `"true"`.
- Disabled: delete every case variant of inherited `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` so Windows' case-insensitive environment cannot silently enable the feature.
- Never mutate `process.env` or the caller-provided parent object.

The behavior applies uniformly to `none`, `inline`, `config-file`, `config-dir`, and `xdg` isolation modes because child environment construction precedes mode-specific OpenCode configuration variables.

Direct `opencode` execution and direct plugin loading bypass the shim and therefore bypass this convenience flag. `ocmm-lsp` is unrelated.

## Runtime Data Flow

```text
ocmm CLI
  -> parseArgs consumes --background-subagents
  -> buildChildEnv copies and updates child-only environment
  -> spawn OpenCode with unchanged passthrough arguments
  -> OpenCode reads its experimental runtime flag at startup
  -> OpenCode exposes task.background when supported
  -> orchestrator may submit a detached child task
  -> OpenCode injects completion/error back into the parent session
```

ocmm does not observe or manage a separate background-job identity. Existing session events remain ordinary parent/child session events.

## Model-facing Guidance

Update the OpenCode orchestrator role prompts in both workflows:

- `prompts/v1/agents/orchestrator.md`
- `prompts/omo/agents/orchestrator.md`

The guidance must state:

1. Use native `background: true` only if the currently callable `task` schema actually exposes `background`.
2. Use background mode only when the parent has useful independent work; keep dependencies that require the result immediately in foreground mode.
3. OpenCode automatically injects completion or error into the parent; do not poll.
4. `task_id` continues the child session and is not a polling job ID.
5. Do not invent `task_status`, `background_output`, or `background_cancel` unless the active schema independently exposes such tools.
6. If a wrapper exposes a different field such as `run_in_background`, follow that schema exactly and do not mix both field names.
7. Background work is process-local and not restart-durable.

The two orchestrator prompts must remain semantically aligned while preserving their existing workflow-specific wording. Codex prompts and generated Codex agents must not receive this OpenCode-specific contract.

Because prompt files change, the same change set must update:

- `docs/v1-maintenance.md` for `prompts/v1/**`.
- `docs/prompt-sync.md` for `prompts/omo/**`.

## Existing Hook Compatibility

No runtime hook changes are planned without a failing compatibility test.

### Empty task response

OpenCode's background submission returns a non-empty running-task acknowledgement. Add a regression fixture proving the `empty-task-response-detector` preserves that acknowledgement and does not replace it with an empty-response warning.

### Interruption output adapter

Add or extend coverage proving a normal running/completed background-task result is not classified as a transport interruption and receives no manual continuation notice.

### Idle continuation

Background child completion can produce normal child-session idle events. Add coverage proving a child idle without unfinished todos causes no `session.prompt`. Existing opt-in idle continuation semantics remain unchanged for sessions that genuinely contain unfinished todos.

If all compatibility tests pass against the current implementation, no production hook file changes are made.

## Error Handling

- Unknown shim arguments continue to pass through under existing rules.
- An older OpenCode version may ignore the environment variable; ocmm does not claim capability unless the runtime Task schema exposes the field.
- OpenCode startup or Task errors continue through existing child process exit and session error handling.
- The CLI does not probe or pin an OpenCode version, because schema capability is the model-facing source of truth and the feature remains host-owned.

## Shell Safety Addendum

The final ocmm prompt change adds one shared shell-safety prompt to every
built-in agent and category in the omo, v1, and Codex workflows, independent of
model family. A single composition-layer injection avoids duplicating the same
contract across dozens of model and category prompts. Terminal commands must
remain short and inspectable instead of combining unrelated setup, validation,
execution, and cleanup into one invocation.

PowerShell commands must never use `$home` or a case variant as a custom
variable because PowerShell variable names are case-insensitive and `$HOME` is
an automatic variable. Recursive or batch deletion must fail closed: prefer an
exact literal target, require any unavoidable variable to be explicitly
assigned and non-empty, and reject filesystem roots, the user home, the
workspace, or an unexpected parent before deletion. Destructive cleanup stays
separate from setup and execution so its target can be inspected immediately
before it runs.

## Documentation

Update the root `README.md` CLI usage and flag table with:

- Exact invocation and environment variable.
- Experimental OpenCode-only status.
- Child-process-only behavior and explicit clearing when absent.
- `--` passthrough behavior.
- Direct `opencode` bypass.
- Automatic completion notification and absence of ocmm polling/persistence.
- Requirement to launch a new OpenCode process for startup flags to take effect.

## Test Strategy

### CLI unit tests

- Parse `--background-subagents` before `--`.
- Preserve it after `--` as passthrough.
- Set the child environment to `"true"` when enabled.
- Remove an inherited value when disabled.
- Remove mixed-case inherited variants and leave only the canonical uppercase key when enabled.
- Preserve the parent environment object.
- Combine correctly with profile, no-profile, fast, and isolation modes.
- Include the flag in help output.

### Process-surface test

Use a fake OpenCode executable or equivalent child fixture to capture arguments and the single relevant environment value. Do not run a model request. Prove the flag is consumed by the shim and only the child sees enablement.

### Prompt tests

- Both OpenCode orchestrator prompts contain the capability gate, foreground/background selection rule, automatic notification rule, `task_id` semantics, and no-invented-tool rule.
- Wrapper-specific fields remain schema-dependent.
- Codex prompt and generated agent surfaces do not gain `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` or the OpenCode-native field contract.
- Prompt maintenance documents are synchronized.
- Every built-in agent and category prompt assembled for omo, v1, and Codex
  carries exactly one copy of the short-command, `$home` prohibition, and
  fail-closed recursive/batch deletion contract, regardless of model family.
- Existing host prompts remain intact, and repeated config passes keep exactly
  one shell-safety block.

### Hook regressions

- Running acknowledgement remains unchanged.
- Normal background result does not trigger interruption recovery.
- Child idle without pending work emits no prompt.

### Repository gates

Run focused tests first, then:

```text
pnpm run typecheck
pnpm test
pnpm run build
```

Run the official Codex generator only as a determinism check; this OpenCode-only change must not produce unexpected Codex generated-file drift.

## Acceptance Criteria

1. `ocmm --background-subagents` launches OpenCode with `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true` in the child only.
2. Omitting the flag removes inherited enablement.
3. `--` preserves the same text as an OpenCode argument instead of consuming it.
4. All shim isolation modes retain existing behavior.
5. OpenCode orchestrator guidance uses native background mode only when supported and never invents polling/cancel tools.
6. Codex surfaces remain free of OpenCode-specific enablement semantics.
7. Existing Task permission, depth, fallback, interruption, and idle behavior is unchanged unless a regression test proves a required correction.
8. Focused tests, typecheck, full tests, build, and a no-model process-surface check pass.
9. Shared shell guidance reaches every built-in agent and category across all
   workflows and model families, prevents complex one-shot destructive
   commands, and rejects unassigned, empty, root, home, workspace, or
   unexpected-parent deletion targets, including PowerShell `$home` variable
   collisions.

## Commit Boundary

No Git commit is performed without separate explicit user permission. The design, plan, implementation, tests, and documentation may remain as a reviewed working-tree change until that permission is given.
