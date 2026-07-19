# GPT-5.6 Prompt Simplification Design

## Status

Approved by an unambiguous self-review after the user requested implementation. The user subsequently required implementation in an isolated worktree and explicitly authorized committing and merging the finished change back into the main repository.

## Problem

The three additive GPT-5.6 calibration files are each about 6.8k characters and repeat general workflow rules already supplied by role prompts, `gpt.md`, category prompts, injected skills, and terminal delegation contracts. The resulting GPT-5.6 profiles are materially longer than necessary, especially after v1 skill injection and Codex adapter wrapping.

## Upstream Evidence

The source of truth for this change is GitHub, not a local omo checkout:

- Repository: `code-yeongyu/oh-my-openagent`
- Checked branch: `dev`
- Checked commit: `e8d842a38a7e0ed3edd5fc74f88247f8b63075ad`
- Current OpenCode prompt: `packages/omo-opencode/src/agents/hephaestus/gpt-5-6.ts`
- Current Codex rule: `packages/omo-codex/plugin/components/rules/bundled-rules/hephaestus/gpt-5.6.md`
- Current GPT-5.6 plan reviewer: `packages/omo-opencode/src/agents/momus-gpt-5-6.ts`

Merged prompt work used as design evidence:

- PR #6012: shorter outcome-first prompts, rules stated once, prioritization instead of generic brevity, preserved output contracts, and 12–27% reductions in planner-support prompts.
- PR #6010: a role-specific GPT-5.6 Momus prompt 36% shorter than the GPT-5.5 prompt while preserving its complete review contract.
- PR #6100: observable `GOAL` / `STOP WHEN` / `EVIDENCE` outcomes for delegated work, with invariants stated at their source rather than appended repeatedly.
- PR #6151: avoid empty or short-interval polling because each poll replays accumulated context; rerun validation only after relevant inputs change, plus one final full pass.

The shared upstream doctrine is:

1. Lead with the outcome and observable completion condition.
2. State each rule once and preserve role/output contracts.
3. Express output guidance as prioritization, not generic “be brief” commands that may truncate the requested artifact.
4. Reserve absolute language for true invariants.
5. Use decision rules instead of long anti-pattern catalogs.
6. Avoid context-expensive polling and unchanged-input revalidation.

## Goals

- Turn `gpt-5.6.md` into a genuinely additive model calibration rather than a second workflow prompt.
- Preserve every local GPT-5.6-specific contract that is not authoritative elsewhere.
- Adopt the current upstream waiting and bounded-revalidation guidance in runtime-neutral wording.
- Keep v1, omo, and Codex GPT-5.6 calibration synchronized in intent.
- Reduce each calibration file from roughly 6.8k characters to at most 3.5k characters.
- Preserve existing model routing, role permissions, approval gates, verification tiers, and generated Codex profile behavior.

## Non-Goals

- Do not rewrite `gpt.md`, role prompts, category prompts, skills, or `createConfigHandler()`.
- Do not copy the full Hephaestus or Momus role prompt into ocmm.
- Do not change model defaults, fallback chains, reasoning translation, configuration schema, or delegation permissions.
- Do not weaken brainstorming approval, review, testing, manual-QA, or Git-write constraints supplied by higher-authority layers.
- Do not modify historical design or plan documents that recorded earlier decisions.

## Approaches Considered

### 1. Simplify only the three additive calibration files — selected

Keep the current assembly architecture and make the specialization contain only GPT-5.6-specific execution guidance. Update tests so shared workflow semantics are verified on the effective base-plus-specialization prompt rather than duplicated inside the specialization.

This gives the requested reduction with the smallest behavioral surface.

### 2. Make prompt assembly role-aware

Change `createConfigHandler()` so different roles receive different GPT-5.6 fragments. This can save more tokens, but it expands the task into prompt-assembly architecture, adds branching and test burden, and risks inconsistent Codex generation.

### 3. Replace local prompts with upstream role-specific prompts

Copy Hephaestus for primary agents and Momus for plan review. This conflicts with ocmm role names, skills, approval semantics, tool contracts, and terminal delegation contracts. It would increase rather than reduce duplicated authority.

## Selected Prompt Contract

Each `prompts/{omo,v1,codex}/deepwork/gpt-5.6.md` will retain a short applicability paragraph and four compact sections.

### Applicability and authority

- Apply only to the GPT-5.6 family; Codex may carry it ahead of runtime selection, so non-5.6 models ignore it.
- GPT-5.6 native `max` remains distinct from `xhigh`.
- Explicit user configuration, role scope, authorization, injected skills, verification policy, and the terminal delegation contract remain authoritative.

### Outcome-first execution

- Identify the concrete requested outcome and an observable completion condition.
- Continue until that condition and required verification hold, then stop rather than adding process.
- Preserve the complete requested deliverable; concise reporting removes repetition, not requested content.
- Ask only when the choice changes the deliverable, required information is unavailable through tools, the action is destructive, or proceeding risks material rework. Otherwise use a stated safe assumption and continue.

### Retrieval and delegation

- Prefer direct tools and stop retrieval when evidence is sufficient to act or answer.
- Delegate only when the effective role/delegation contract permits it and a bounded result materially improves completion.
- Multiple steps, routine confirmation, or a desire for another opinion are insufficient reasons to delegate.
- A delegated task must define its outcome, stopping condition, evidence, scope, and non-goals; the parent verifies returned evidence rather than trusting a completion claim.

This concise decision rule replaces the workflow-role matrix and duplicated allowlist. Exact permissions continue to come from role prompts and the terminal delegation contract.

### Context-efficient waiting and validation

- Run long commands with a suitable timeout or use one completion signal; do not repeatedly poll unchanged state or perform empty short-interval reads.
- After two unchanged checks, increase the wait or switch to a completion signal.
- Rerun validation only when relevant inputs changed after the last green result; perform one appropriate final pass instead of identical repeated gates.

### Reporting priority

- Lead with the outcome, then evidence, residual risk, and any unverified item.
- For review work, retain the role-defined verdict or finding format.
- Trim process narration, restatements, generic reassurance, and non-actionable commentary before trimming required facts or artifacts.
- Do not infer permission to modify from an explanation, research, diagnosis, review, or planning request.

## Removed Duplication

The specialization will no longer carry dedicated copies of:

- `Shell Adaptation`
- `Discovery Before Planning`
- `Planner Trigger`
- `Answer-When-Answerable`
- generic `Scope`
- the workflow-role composition matrix
- detailed utility/specialist allowlists
- orchestrator-owned workflow lists
- `[product]` / `[evidence]` review explanation

These remain available through `gpt.md`, role/category prompts, injected skills, and terminal delegation contracts. Category prompts already carry shell adaptation directly because category paths may not receive `gpt.md`.

## Data Flow

No assembly code changes:

1. `loadAllPrompts()` loads the shortened specialization.
2. `deepworkPromptForAgent()` combines `gpt.md` or `planner.md` with the specialization for GPT-5.6 functional agents.
3. `promptForBuiltinCategory()` combines each category role prompt with the specialization.
4. `createConfigHandler()` appends locale and delegation contracts as before.
5. `generateCodexPlugin()` regenerates `.codex/agents/**` and `plugins/deepwork/**` from the same assembly path.

## Files

Authoritative prompt changes:

- `prompts/omo/deepwork/gpt-5.6.md`
- `prompts/v1/deepwork/gpt-5.6.md`
- `prompts/codex/deepwork/gpt-5.6.md`

Tests and synchronization records:

- `src/intent/prompt-loader.test.ts`
- `src/hooks/config.category.test.ts`
- `src/codex/plugin-generator.test.ts`
- `docs/prompt-sync.md`
- `docs/v1-maintenance.md`

Generated output is refreshed with the direct script body, `node --experimental-strip-types scripts/gen-codex-plugin.ts`; generated files are never hand-edited. Candidate generation may stage ignored runtime files under `plugins/deepwork/dist/**` from `dist/{cli,shared,bin}`. Those files are separately verified by source-to-staged path mapping and SHA-256, are explicitly ignored, and never enter the tracked diff.

## Testing

### Prompt source tests

- All three specialization files contain the upstream-derived outcome, stopping, prioritization, waiting, bounded-revalidation, safe-default, authorization, and delegation-threshold semantics.
- All three remain at or below 3.5k characters.
- Removed generic section headings do not return.
- v1, omo, and Codex source files remain equivalent except for existing wrapper/authority wording required by each environment.

### Effective prompt tests

- General discovery/planner/answer/scope/shell/review semantics are checked against the effective base-plus-specialization prompt for GPT-5.6 rather than requiring them in the additive file alone.
- Planner continues to receive planner doctrine plus the specialization.
- Categories retain their role prompt and shell rules plus the specialization.
- Non-GPT-5.6 routing remains unchanged.

### Generated Codex tests

- Generated GPT-5.6-capable profiles contain the concise calibration and the new waiting/revalidation rules.
- Generated profiles do not contain the removed GPT-5.6 section headings.
- Generator output is regenerated only after confirming the currently tracked generated roots are clean; the post-generation diff must be limited to expected instruction changes.

### Repository gates

- Targeted prompt-loader, effective-category, and Codex generator tests.
- Direct TypeScript typecheck through the main checkout's existing TypeScript binary.
- All non-config TypeScript tests pass, while the captured complete TypeScript suite retains exactly 24 baseline failures limited to `src/config/load.test.ts` and `src/config/profiles.test.ts`; this task must add no failures.
- `cargo test -p ocmm-lsp` and the direct TypeScript/Rust build bodies pass.
- Direct Codex generator runs followed by tracked-bundle consistency checks and a deterministic 140-entry generated-map comparison.

## Acceptance Criteria

1. GitHub evidence is recorded with repository, branch SHA, source paths, and merged PR references.
2. Each GPT-5.6 calibration file is no more than 3.5k characters and at least 40% smaller than its current version.
3. The three workflows preserve the same model-specific intent.
4. Native `max`, explicit configuration priority, safe-default question threshold, authorization boundary, and conservative delegation remain present.
5. Outcome/completion, no-empty-polling, backed-off waiting, and changed-input revalidation are present.
6. Generic duplicated workflow sections are absent from the specialization while effective composed prompts retain their behavior.
7. Targeted tests, typecheck, all non-config TypeScript tests, Rust tests, build, and generated-output checks pass. The complete TypeScript suite has exactly the captured 24 baseline failures in `src/config/load.test.ts` and `src/config/profiles.test.ts`, with no additional failures.
8. No unrelated user files or existing untracked design/plan files are modified.

## Repository Safety

At discovery time, the three prompt sources, both sync documents, three prompt/category/generator tests, and generated Codex roots are clean. Implementation occurs on a dedicated sibling worktree branch. The task spec and plan are copied into that worktree and committed with the implementation. The captured concurrent dirty state in the main checkout may contain tracked or untracked changes, but its porcelain status, index entries, and regular-file SHA-256 values must remain unchanged throughout integration and must not overlap the 54 task paths. Otherwise integration stops without stashing, resetting, or overwriting concurrent work. Push and tag operations remain out of scope.
