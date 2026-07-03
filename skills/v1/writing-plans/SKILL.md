---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

<!-- v1 fork of superpowers/writing-plans.
     Upstream: obra/superpowers v6.1.1+ (synced 2026-07-03).
     Adjustments: removed executing-plans cross-reference (excluded from v1);
     removed using-git-worktrees reference (not in v1); subagent-driven is the
     only execution path in v1; added mandatory plan-critic review loop with
     three-state verdict (REJECT/OKAY/OKAY-UNAMBIGUOUS) after self-review;
     plan approval now conditional (user delegation OR [OKAY-UNAMBIGUOUS]).
     Synced v6.1.1+: added Task Right-Sizing section, Global Constraints header
     field, and Interfaces block (Consumes/Produces) per task.
     See docs/v1-maintenance.md for sync rules. -->

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Task Right-Sizing

A task is the smallest unit that has its own test cycle. Tasks that are too large create context bloat for the implementer and make review harder; tasks that are too small create coordination overhead without value.

- **Fold setup, config, scaffolding, and docs into the task that needs them.** A "create the directory structure" task is not a task — it belongs in the first task that uses that structure.
- **Only split when a reviewer could meaningfully reject one task while approving its neighbor.** If two tasks always pass or fail together, they are one task.
- **Each task must end with an independently testable deliverable.** The test at the end of the task must prove the task's value, not just "the code compiles."
- **Resist splitting by technical layer.** "Write the types" then "write the implementation" is two tasks that always pass or fail together — combine them.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**Global Constraints:** [Project-level constraints from the spec — version floors, dependency limits, naming/copy rules, platform requirements. Copy verbatim from the spec, one constraint per line. Each task implicitly includes these.]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Interfaces:**
- Consumes: [What this task uses from upstream tasks — exact function/type names and signatures, e.g. `parseConfig(path: string): Config` from Task 1]
- Produces: [What downstream tasks depend on — exact function/type names and signatures, e.g. `validateInput(input: Input): Result`]

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Remember
- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## plan-critic Review Loop

After self-review passes, submit the plan to the `plan-critic` agent for a mandatory review loop. The plan-critic agent reads the plan path or inline plan and returns a three-state verdict.

**Loop procedure:**

1. Submit the plan to the `plan-critic` agent (pass the plan file path, or the inline plan if not yet saved).
2. Dispatch the plan-critic agent and wait for its verdict.
3. Branch on the verdict:

   | Verdict | Meaning | Action |
   |---|---|---|
   | `[REJECT]` | Critical blockers exist; plan not executable as-is | Apply the blocker fixes (max 3), re-run self-review, resubmit. Loop. |
   | `[OKAY]` | Plan is executable; residual uncertainty/ambiguity remains | Exit the loop. Proceed to user approval (unless delegation applies). |
   | `[OKAY-UNAMBIGUOUS]` | Plan is executable AND logically clear with no ambiguity | Exit the loop. Skip user approval. Proceed to Execution Handoff. |

**Loop cap (user delegation "review N 次就下一步"):**

If the user has delegated with "review N 次就下一步" / "review N times then proceed", cap the loop at N iterations. After N iterations:
- If still `[REJECT]`: record the unresolved blockers in the plan (as a "Known Unresolved Blockers" section) and proceed anyway. Do not block the workflow.
- If `[OKAY]` or `[OKAY-UNAMBIGUOUS]` reached before N: exit early.

**Plan approval conditionality:**

After the loop exits, determine whether user approval is required:

- **Auto-skip** if ANY of:
  - The user has delegated approval (any form — see the brainstorming skill's User Delegation Forms table).
  - The loop exited with `[OKAY-UNAMBIGUOUS]`.
- **Require user approval** otherwise (loop exited with `[OKAY]`, no delegation). Present the plan:

  > "Plan written to `<path>`. plan-critic verdict: `[OKAY]` (executable, residual uncertainty). Please review and approve before execution, or delegate with '你自己决定' / '无需批准自行继续' to proceed."

  Wait for the user's response. If they request changes, make them, re-run self-review, and re-run the plan-critic loop. Only proceed once the user approves or delegates.

## Execution Handoff

After saving the plan, proceed to the subagent-driven-development skill to execute it.

**Execution:**
- Fresh subagent per task + two-stage review (spec compliance, then code quality)
- Continuous execution — no pause between tasks
