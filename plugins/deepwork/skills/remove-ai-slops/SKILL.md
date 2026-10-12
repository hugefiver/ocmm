---
name: remove-ai-slops
description: "Remove AI-generated code slop from branch changes or an explicit file list. Establishes regression coverage for final valid requirements, then runs categorized cleanup via parallel task agents in batches of 5 and verifies with quality gates. Covers 10 slop categories. MUST USE when the user asks to \"remove slop\", \"clean AI code\", \"deslop\", \"clean up AI-generated code\", \"remove AI slop\", or wants to clean up AI-generated patterns."
---

# Remove AI Slops Skill

## Inputs

- **Default scope**: branch diff vs `merge-base main` (no arguments needed)
- **Optional scope**: explicit file list passed by the caller

## What this skill does

Cleans AI-generated slop from a bounded set of changed files while preserving final valid requirements and committed contracts. Establishes relevant regression coverage first, then runs a categorized multi-pass cleanup and verifies with applicable quality gates and self-review. Correct only task-owned edits when verification fails.

The safety invariant: **relevant functional and external-interface requirements have passing regression evidence before cleanup**. Don't lock uncommitted intermediate behavior or descriptive text merely because it exists. Git commits are the compatibility boundary; existing committed contracts still bind files with uncommitted edits. Public API/protocol, security, data, permission, and irreversible-operation changes require their applicable authorization.

## 10 Slop Categories

### Stylistic

1. **Obvious comments**: Comments that restate what the code does, useless TODOs, commented-out code. KEEP: current design reasons and meaningful BDD markers, not development or decision history.
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

9. **Missing tests**: Valid functional or external-interface requirements lack regression coverage. Add the narrowest meaningful test, not a lock for every changed file or intermediate behavior.

### Structural

10. **Oversized modules** — Files over 250 pure LOC. Must execute full modular refactoring (not just flagging): list violations, split by responsibility, name files by concept (no utils/helpers catch-alls), show the split plan, extract clean modules, verify. Opt-out: `// SIZE_OK` or `# SIZE_OK` comment.

## 6-Phase Flow

### Phase 0: Size the work

Use session-level coordination only when it helps. Non-product routine docs or maintenance cleanup does not require planner/critic/review dispatch or a plan/report/evidence file; resolve it directly or ask/delegate a bounded task when needed. Complex product behavior implementation retains its applicable planning policy, and explicit process requirements or concrete major safety risks retain necessary verification.

### Phase 1: Determine scope

```
git diff $(git merge-base main HEAD)..HEAD --name-only
```

Filter out: deleted files, binary files, generated files.

### Phase 2: Establish valid regression coverage (NON-NEGOTIABLE)

For each in-scope behavior-bearing file:
1. Identify final valid functional requirements and committed public/observable contracts.
2. Check if existing tests cover it.
3. If a meaningful regression seam lacks coverage, write the narrowest test for that requirement.
4. Tests must be GREEN before cleanup starts.

If you can't establish passing evidence for a required functional contract, stop cleanup of that behavior. Documentation-only edits use semantic review and applicable loading/delivery checks, not invented text-lock tests.

Don't add string, regex, snapshot, or parsed-content locks for documentation, commit messages, package information, or error/log wording without functional or system-boundary significance. Don't test decision counterexamples or removed components' absence. Update corresponding tests when requirements change; delete tests dedicated to removed modules, helpers, tools, or subsystems. Valid negative safety, protocol, and input-handling tests remain appropriate. Documentation and comments state the concise final design, not the cleanup history.

### Phase 3: Cleanup plan

Keep the categories, cleanup order, and material risks needed for current execution in session, not a per-file workspace ledger.

Safety order (safe → dangerous):
comments → dead code → defensive → duplication → complexity → abstraction/boundary → performance → tests → oversized-modules

### Phase 4: Parallel slop removal via task agents (batches of 5)

For product code cleanup, process files via `task(description=..., subagent_type=..., prompt=...)`. Resolvable non-product docs or maintenance cleanup runs directly; use a bounded worker only when it materially helps. When delegating, batch up to 5 independent files concurrently; pass `background: true` only when the current callable schema exposes `background` and the parent has independent work. Otherwise omit it and keep the batch foreground; integrate every result before starting the next batch.

Each file gets a detailed prompt containing:
- The category checklist for that file
- The cleanup order
- Hard constraints: final valid requirements and committed contracts must be preserved; no unauthorized public API changes, no deleting type annotations, no introducing new abstractions, minimal diff. Don't preserve uncommitted transition behavior or add descriptive-text, decision-counterexample, or removed-component absence tests.

Batch failure handling: a wait timeout is not a failure. Require sub-agents to report WORKING or BLOCKED.

### Phase 5: Applicable quality gates + self-review

Select the meaningful gates for the changed surface and concrete risk; reuse sufficient unchanged evidence rather than repeating all gates after each correction:
1. Regression tests still green
2. Lint clean
3. Typecheck clean
4. Unit + integration tests green
5. Static security scan clean (if applicable)

3 review checklists:
- **Safety**: No unauthorized contract change, no security regression, no data loss risk.
- **Behavior**: Final valid functional and external-interface requirements are covered; committed contracts remain intact.
- **Quality**: No new slop introduced, diff is minimal, naming is consistent.

### Phase 6: Fix issues

If a gate fails:
1. Identify the change that caused the failure.
2. Explain why.
3. Use a patch to correct only this task's problematic hunk; never discard existing user edits or perform unauthorized Git writes.
4. Direct-edit to re-apply only the provably-safe changes.
5. Re-run affected gates and reassess the relevant safety/behavior/quality concern, not every unchanged check.

If the same file fails 3 times, STOP and escalate to the user.

## Output Format

Return this report in conversation; don't create a workspace report or evidence file unless explicitly requested as a deliverable.

```
## Scope
<files in scope>

## Delivered Result
<current implementation and changed files>

## Regression Coverage
<valid requirements covered, green baseline status>

## Quality Gates
<gates: PASS/FAIL/N/A + evidence>

## Critical Review
<Safety/Behavior/Quality findings>

## Remaining Risks
<slop noticed but out of scope, concerns>

## Final Status
CLEAN | ISSUES FIXED | REQUIRES ATTENTION
```

## Core Principles

- **Valid regression coverage first**: Protect final functional requirements and external contracts, not intermediate implementations. Phase 2 is non-negotiable.
- **Don't bundle unrelated refactors**: A single cleanup commit containing dead code + abstraction + performance is unreviewable and unbisectable. Stay in slop scope.
- **Algorithm changes are NOT slop fixes**: If equivalence requires proof, it's a refactor, not a slop fix. It belongs in a separate change.
- **Don't silently skip**: If a gate is N/A, say N/A and why. If it fails, say it fails.
- **Keep current design reasons**: Remove restating comments and development/decision histories; retain explanations needed to maintain the final design.
- **Don't touch out-of-scope files**: If you notice slop elsewhere, report it in Remaining Risks only.
- **When in doubt, SKIP**: Don't guess. Skip and report.
- **Batch only useful independent work**: When delegation is warranted, use up to 5 concurrent files; don't dispatch extra workers to fill a batch or for resolvable non-product cleanup.

## Codex Compatibility

- When this skill mentions TodoWrite, use Codex `update_plan`.
- When this skill mentions OpenCode `task(...)`, preserve its task contract and use the current callable Codex dispatch route.
- When this skill mentions OpenCode-specific tool names, choose the nearest callable Codex tool with the same intent and preserve the workflow contract.

### Callable Dispatch Contract

The current callable dispatch-tool schema is the only authority. Examples are not feature proof; omit hidden fields.

Compatibility routing never relaxes role delegation permission, target allowlists, or workflow ownership. Only call `create_goal` when a user, system, or developer instruction explicitly requests runtime goal creation. Ordinary workflow, planning, delegation, or a `GOAL:` line does not qualify.

Use the first permitted route in this order:

1. **Exact profile** — use `agent_type`, `agent_path`, or `agent_nickname` only when the current callable schema explicitly guarantees it selects a generated `dw-*` profile.
2. **Direct composition** — use only when the current callable schema exposes every model field required by the role, the schema-exact `reasoning` or `reasoning_effort` field when the role requires reasoning, the role's full system/developer instructions, and all required skills. Report this route as composition, not exact-profile selection.
3. **V1/V2 generic or flat dispatch** — state the permitted role, bounded goal, and material constraints clearly; the brief prompts below are optional guidance. The child keeps its default or inherited runtime model unless the callable schema exposes and receives a valid explicit override.
4. **Local execution** — resolvable non-product routine work may run directly without entering dispatch routing. Otherwise use this fallback when no callable native dispatch tool is available. When delegation is not permitted, preserve the role contract and its workflow owner rather than routing around that restriction.

For generic or flat dispatch, clear prose is sufficient. These labels are illustrative, not required protocol fields or report sections:

`GOAL:` Describe the permitted role, bounded outcome, and material scope/ownership constraints.
`STOP WHEN:` Describe the observable completion condition and relevant non-goals.
`EVIDENCE:` Describe useful completion evidence; the worker may find corresponding resources within scope.

Workers may discover relevant resources within the communicated scope; do not require exhaustive file lists, per-item revision/hash/receipt locks, or fixed report fields. Discovery does not expand permissions or bypass material ownership, irreversible-operation, or protocol/integrity identity boundaries. Workers run lightweight local checks for substantive changes and return outcomes, changes, local evidence/results, and material risks or unverified coverage in conversation, not workspace reports. The orchestrator owns integration and consolidated global/heavy verification, not full suites per small task; required safety, release, pre-commit, and user checks remain binding. A generic brief does not load a profile, select a model, attach a skill, or enable a missing feature.

When the planning logical-tier selector chooses the unsuffixed normal profile and the callable schema proves exact-profile selection is available, the V1 example is `multi_agent_v1.spawn_agent(agent_type="dw-plan-critic", message="Review the current implementation plan and return concrete findings with supporting evidence.")`. V1 may send `model` only when the current callable schema exposes `model`. V1 may send exactly the schema-named `reasoning` or `reasoning_effort` field only when that exact field is exposed. If either field is hidden, omit it; never send both reasoning spellings. V1 may add `fork_context` only when the callable V1 schema exposes it and an explicit inheritance decision requires it.

V2-style flat dispatch uses `spawn_agent` to create, `wait_agent` to await, `followup_task` to continue, and `interrupt_agent` to stop. Use each flat tool only when it is present in the current callable schema and pass only parameters exposed by that tool's schema. No stable `multi_agent_v2` namespace is guaranteed. V2-style flat tools never receive `fork_context`. Never synthesize a namespace, copy parameters between tools, or add hidden parameters.

Only when the callable schema exposes `fork_turns` may the agent use `fork_turns: none` to request no context. If `fork_turns` is hidden, omit it. Other `fork_turns` values are only for explicit branch exploration.

`task_name` is an identity, not a profile selector. Do not pass `dw-*.toml` as a prompt, item, or skill attachment: generated TOML files are installation artifacts, not runtime skills.
