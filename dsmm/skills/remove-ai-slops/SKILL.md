---
name: remove-ai-slops
description: "Remove AI-generated code slop from branch changes or an explicit file list. Locks behavior with regression tests FIRST, then runs categorized cleanup with bounded permitted work, then verifies with quality gates. Covers 10 slop categories. MUST USE when the user asks to \"remove slop\", \"clean AI code\", \"deslop\", \"clean up AI-generated code\", \"remove AI slop\", or wants to clean up AI-generated patterns."
---

## DSH resource and authority contract

This is a full OCMM source adaptation for DSH 0.2.0-rc.2, not an OpenCode or Codex runtime. Source product names in transcript formats, examples, paths and attribution remain descriptive; they are not a host switch.

- Load this skill through the native skill tool only when its trigger matches. Resolve every relative reference/script/asset from the directory resourceBase returned with this skill, not from the project cwd or an OCMM checkout. Use available read/glob/grep to inspect resources; use write/edit and the active bash or pwsh only within the actual role and host permissions.
- External documentation uses actual web_search/web_fetch or an available documentation service. Context7, GitHub MCP, browser, image and LSP tools are optional catalog capabilities, not bundled calls. Use a real available equivalent or report unavailable evidence; never invent an MCP, Task, todo or compression API.
- Source role names are logical assignments: code-search/explore maps to dsmm-code-search, and other canonical roles/categories map to dsmm-<name>. Dispatch only through the actual role-specific native subagent tool in the current catalog, within the caller's effective policy, depth and authority. No generated file, metadata row or template proves callability. A missing permitted role is a blocker for a required formal stage, not permission to invent it or bypass planning.
- Templates describe assignment content, not a callable argument schema. Native continuation, background, message/interrupt and result handling are used only when actually exposed and supported; do not send task_id, subagent_type or guessed timeout fields. Otherwise perform permitted direct work or return the dependency to the stage owner.
- Use a concise response or an authorized project plan for tracking when no native tracking tool is exposed. Compression is unavailable unless a real tool is exposed; do not simulate it. Role responsibilities, explicit-off common/skill visibility, and the terminal delegation contract override broader examples in a resource.
- Installation, package-manager bootstrap, downloads, authentication/login, credential/profile access, Git writes and destructive actions require explicit authorization for the exact action. Reference commands are not automatic operations. Worktree consent does not authorize dependency installation or later branch deletion. Read before changing an existing file; preserve unrelated user work. Never silently restore/reset a working tree to repair a failed cleanup.
- Browser/debug QA uses run-owned isolated state, no imported credentials or browser profile, and only already available software unless separately authorized. Keep commands in the active shell dialect. Report unverified surfaces honestly.

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

10. **Mixed-responsibility modules** — Identify ownership/cohesion problems, not a LOC quota. Split by responsibility only when necessary for the approved cleanup; do not manufacture helpers, interfaces, comments or opt-out markers to satisfy a counter. Verify preserved behavior at the affected seam.

## 6-Phase Flow

### Phase 0: Plan

State the bounded scope and evidence plan; use an exposed native tracking tool or authorized plan artifact only when coordination needs it.

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

### Phase 4: Bounded slop removal

Use direct edits first. Delegate independent cleanup only when an actually callable permitted native role owns a useful bounded deliverable; respect file ownership, inherited authority and depth. Choose concurrency from actual dependencies and capacity, not a batch quota. Integrate results before dependent work.

Each file gets a detailed prompt containing:
- The category checklist for that file
- The cleanup order
- Hard constraints: behavior must be preserved, no public API signature changes, no deleting type annotations, no introducing new abstractions, minimal diff.

An acknowledgment, partial output or wait timeout is not completion evidence. Inspect the actual result, failed checks and unresolved blockers; do not require status tokens or invented polling APIs.

### Phase 5: Quality gates + critical review

Applicable quality gates (reuse unchanged passing evidence; do not duplicate equivalent checks or invent missing tooling):
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
3. Read the current diff and directly undo only your own problematic edit. A destructive Git restore requires separate explicit authorization and must never overwrite unrelated user changes.
4. Direct-edit to re-apply only the provably-safe changes.
5. Re-run gates + checklists.

Stop and escalate when evidence exposes a material blocker, unsafe equivalence, or an authorization decision; do not impose an arbitrary attempt quota.

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
- **Useful concurrency only**: No fixed agent/batch count. Do not create redundant helpers or tests; existing green regression coverage remains the behavior lock, and new coverage targets an uncovered observable regression.
