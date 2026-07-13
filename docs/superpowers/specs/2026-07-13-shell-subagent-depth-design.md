# Shell Adaptation and Subagent Depth Design

## Goal

Make all ocmm OpenCode prompts guide agents to adapt command examples to the actual runtime shell, enforce a configurable maximum subagent nesting depth for every model family, and add GPT-5.6-specific restraint against speculative subagent delegation.

## Design

Every effective deepwork prompt variant and every category prompt gains shell-adaptation guidance: shell snippets in prompts and skills are examples only. Before writing a command, the model must use the shell/platform named by the runtime context and translate examples into that shell instead of assuming Bash, PowerShell, or a separate VM. This covers `default`, `gpt`, `gemini`, `glm`, `codex`, `planner`, `gpt-5.6`, and all category prompt paths for each workflow. Existing command-lens wording that hardcodes Bash or PowerShell becomes shell-neutral.

GPT-5.6 calibration prompts gain only the model-specific subagent restraint. GPT-5.6 Sol/Terra/Luna should default to direct work and reserve subagents for context-saving exploration/research or independent complete tasks; nested subagent calls require a distinct deliverable and must respect the configured depth limit.

Configuration adds `subagent.maxDepth`, defaulting to `3`. Depth counts only subagent layers: main session depth `0`, first subagent `1`, and so on. With the default, main → depth 1 → depth 2 → depth 3 is allowed, while creating depth 4 is blocked. `0` is valid and blocks all task dispatches. The guard is named `subagent-depth-guard` and is enabled by default through `disabledHooks` semantics.

Implementation uses the existing `tool.execute.before` permission guard surface. A shared `sessionDepthMap` is owned by `src/index.ts`, passed to permission guards, and updated from `session.created` events using `parentID`/`parentId`/`parentSessionID`/`parentSessionId` metadata. `session.deleted` removes the deleted session depth, while `session.compacted` does not clear depth because compaction is not a new session. When explicit depth is unavailable at task-guard time, the guard falls back to the existing `sessionAgentMap`: built-in/unknown sessions are treated as depth `0`, while known non-built-in subagent sessions fail closed at the configured maximum depth so missing ancestry cannot bypass the limit.

## Verification

- Config tests prove the default and profile overlay behavior for `subagent.maxDepth`.
- Permission tests prove default depth blocking, event parent-depth tracking, fallback depth inference, and `disabledHooks` opt-out.
- Prompt/docs changes are synchronized through `docs/v1-maintenance.md`, `docs/prompt-sync.md`, generated schema, and generated Codex bundle; coverage includes category prompt paths that do not always inherit a deepwork layer.
- Plugin-level wiring tests prove depth is tracked through `createPlugin()` event and task hook composition.
