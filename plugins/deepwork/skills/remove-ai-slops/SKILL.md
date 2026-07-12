---
name: remove-ai-slops
description: "Remove AI-generated code slop from branch changes or an explicit file list. Locks behavior with regression tests FIRST, then runs categorized cleanup via parallel task agents in batches of 5, then verifies with quality gates. Covers 10 slop categories. MUST USE when the user asks to \"remove slop\", \"clean AI code\", \"deslop\", \"clean up AI-generated code\", \"remove AI slop\", or wants to clean up AI-generated patterns."
---

# Remove AI Slops Skill

## Inputs

- **Default scope**: branch diff vs `merge-base main` (no arguments needed)
- **Optional scope**: explicit file list passed by the caller

## What this skill does

Cleans AI-generated slop from a bounded set of changed files while strictly preserving behavior. Locks behavior with regression tests first, then runs a categorized multi-pass cleanup, then verifies with quality gates and a critical review. Reverts and direct-edits when verification fails.

The core safety invariant: **behavior is locked by green tests before a single line is removed**. A checklist alone is not safety; a passing regression test is.

## 10 Slop Categories

### Stylistic

1. **Obvious comments** — Comments that restate what the code does, useless TODOs, commented-out code. KEEP: comments explaining WHY, BDD markers.
2. **Over-defensive code** — Null checks on guaranteed values, try/catch around code that cannot throw, instanceof/type guards on statically-typed params, multi-layer redundant validation, broad catch-all (catch Exception / empty catch). REFACTOR: narrow exceptions, add type narrowing.
3. **Excessive complexity** — Deep nesting (>3 levels), nested ternaries, complex boolean (4+ predicates), long parameter lists (>5), god functions (>50 lines), if/elif variant chains (should be exhaustive pattern matching), `any`/`object` type annotations (should be interfaces/generics/unions).

### Structural

4. **Needless abstraction** — Pass-through wrappers, single-use helpers, speculative indirection, single-implementation interfaces, factory functions that only call constructors.
5. **Boundary violations** — Wrong-layer imports, responsibility leaks, hidden coupling, pure functions with side effects.
6. **Dead code** — Unused imports, unused private functions, unreachable branches, stale feature flags, debug leftovers (console.log, print, dbg!, console.error).

### Hidden cost

7. **Duplication** — Copy-pasted branches, redundant helpers, repeated magic numbers. KEEP: coincidental repetition where intents differ.
8. **Performance equivalences** — O(n²)→O(n), hoist loop-invariant computations, unnecessary intermediate collections, string concatenation in loops (use join/array push), redundant DB/API calls in loops (batch them), redundant deep copies, repeated len()/size() calls (cache). Hard rule: only apply when equivalence is obvious.

### Behavior coverage

9. **Missing tests** — Changed files with behavior but no regression test locking it. Fix: ADD the narrowest test.

### Structural

10. **Oversized modules** — Files over 250 pure LOC. Must execute full modular refactoring (not just flagging): list violations, split by responsibility, name files by concept (no utils/helpers catch-alls), show the split plan, extract clean modules, verify. Opt-out: `// SIZE_OK` or `# SIZE_OK` comment.

## 6-Phase Flow

### Phase 0: Plan

Use TodoWrite to plan all phases before starting.

### Phase 1: Determine scope

```
git diff $(git merge-base main HEAD)..HEAD --name-only
```

Filter out: deleted files, binary files, generated files.

### Phase 2: Lock behavior with regression tests (NON-NEGOTIABLE)

For each in-scope file:
1. Identify the public/observable behavior.
2. Check if existing tests cover it.
3. If not covered, write the narrowest regression test that locks the behavior.
4. Tests must be GREEN before cleanup starts.

If you cannot establish a green baseline for a file, STOP. Do not clean that file.

### Phase 3: Cleanup plan

Per file, list: categories present, cleanup order, risk level.

Safety order (safe → dangerous):
comments → dead code → defensive → duplication → complexity → abstraction/boundary → performance → tests → oversized-modules

### Phase 4: Parallel slop removal via task agents (batches of 5)

Process files via the task tool with appropriate category agents. Batch 5 files in parallel (`run_in_background=true`), wait for all to complete before the next batch.

Each file gets a detailed prompt containing:
- The category checklist for that file
- The cleanup order
- Hard constraints: behavior must be preserved, no public API signature changes, no deleting type annotations, no introducing new abstractions, minimal diff.

Batch failure handling: a wait timeout is not a failure. Require sub-agents to report WORKING or BLOCKED.

### Phase 5: Quality gates + critical review

5 quality gates:
1. Regression tests still green
2. Lint clean
3. Typecheck clean
4. Unit + integration tests green
5. Static security scan clean (if applicable)

3 review checklists:
- **Safety**: No behavior change, no security regression, no data loss risk.
- **Behavior**: All observable behavior preserved, edge cases handled identically.
- **Quality**: No new slop introduced, diff is minimal, naming is consistent.

### Phase 6: Fix issues

If a gate fails:
1. Identify the change that caused the failure.
2. Explain why.
3. `git checkout` to revert the problematic hunk.
4. Direct-edit to re-apply only the provably-safe changes.
5. Re-run gates + checklists.

If the same file fails 3 times, STOP and escalate to the user.

## Output Format

```
## Scope
<files in scope>

## Behavior Lock
<tests written, green baseline status>

## Cleanup Plan
<per-file categories + order>

## Per-File Results
<file: what was removed/changed>

## Quality Gates
<gates: PASS/FAIL/N/A + evidence>

## Critical Review
<Safety/Behavior/Quality findings>

## Issues Found & Fixed
<problems + fixes>

## Remaining Risks
<slop noticed but out of scope, concerns>

## Final Status
CLEAN | ISSUES FIXED | REQUIRES ATTENTION
```

## Core Principles

- **Behavior lock first**: Regression tests ARE the safety mechanism. The checklist is a supplement, not a replacement. Phase 2 is non-negotiable.
- **Don't bundle unrelated refactors**: A single cleanup commit containing dead code + abstraction + performance is unreviewable and unbisectable. Stay in slop scope.
- **Algorithm changes are NOT slop fixes**: If equivalence requires proof, it's a refactor, not a slop fix. It belongs in a separate change.
- **Don't silently skip**: If a gate is N/A, say N/A and why. If it fails, say it fails.
- **Don't delete WHY comments**: "It's obvious from the code" is rarely true for the next reader. Only delete comments that restate WHAT.
- **Don't touch out-of-scope files**: If you notice slop elsewhere, report it in Remaining Risks only.
- **When in doubt, SKIP**: Don't guess. Skip and report.
- **Batch 5 in parallel**: More than 5 merges noise and context contention. Fewer than 5 wastes parallelism.

## Codex Compatibility

- When this skill mentions TodoWrite, use Codex `update_plan`.
- When this skill mentions OpenCode `task(...)`, use the current callable Codex subagent-dispatch tool and preserve the task contract. Treat an agent_type, agent_path, or agent_nickname field as an exact profile selector only when its current schema or documentation explicitly guarantees that behavior; otherwise prefer complete direct composition, then generic/flat dispatch.
- A generic/flat child message must be self-contained and labeled `TASK`, `ROLE`, `DELIVERABLE`, `SCOPE`, `VERIFY`, `REQUIRED SKILLS`, `CONTEXT`, and `CONSTRAINTS`; do not claim it loaded a `dw-*` profile.
- When this skill mentions OpenCode-specific tool names, choose the nearest Codex tool with the same intent and preserve the workflow contract.
