---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
---

<!-- v1 fork of superpowers/subagent-driven-development.
     Upstream: obra/superpowers v6.1.1+ (synced 2026-07-03).
     Adjustments: removed executing-plans comparison (excluded from v1);
     removed using-git-worktrees and finishing-a-development-branch references
     (not in v1); removed test-driven-development reference (TDD is described
     inline in v1); final code review uses requesting-code-review skill only.
     Synced v6.1.1+: Model Selection rewrite (explicit model dispatch, turn-count
     beats token price, tiered guidance); Constructing Reviewer Prompts section
      (no pre-judging, no open-ended directives, verbatim global constraints, no
      history pasting, findings handling by severity); Narration discipline rule;
      task-type analysis hint (prefer dispatching-parallel-agents for independent
      tasks); Final Acceptance Review stage updated with ordered Oracle slot
      priority and logical tiers. v1 intentionally replaces per-task reviewer loops with
      completion/integration checks plus one final acceptance review; ⚠️ Items
      section (reviewer "Cannot verify from diff" items). Did NOT sync:
     review-package/task-brief bash scripts (Windows incompatible); progress
     ledger (v1 uses TodoWrite); File Handoffs/Durable Progress sections
     (depend on scripts).
     See docs/v1-maintenance.md for sync rules. -->

# Subagent-Driven Development

Execute plan by dispatching a fresh subagent per task, running a completion/integration check after each returned agent, and running one final acceptance review after all tasks are done.

**Why subagents:** You delegate tasks to specialized agents with isolated context. By precisely crafting their instructions and context, you ensure they stay focused and succeed at their task. They should never inherit your session's context or history — you construct exactly what they need. This also preserves your own context for coordination work.

**Core principle:** Fresh subagent per task + per-agent completion/integration check + final acceptance review = high quality without drowning in per-subtask reviews

**Continuous execution:** Do not pause to check in with your human partner between tasks. Execute all tasks from the plan without stopping. The only reasons to stop are: BLOCKED status you cannot resolve, ambiguity that genuinely prevents progress, or all tasks complete. "Should I continue?" prompts and progress summaries waste their time — they asked you to execute the plan, so execute it.

**Narration discipline:** Between tool calls, write at most one line of narration. The todo list and tool results carry the record — do not duplicate progress in prose. Reserve prose for decisions, blockers, and questions to your partner.

## When to Use

- You have an implementation plan
- Tasks are mostly independent
- You are executing in the current session

**Task-type analysis before execution:** Before dispatching the first implementer, assess the plan. If the plan has 2+ independent tasks with no shared state or sequential dependencies, prefer the `dispatching-parallel-agents` skill to execute them concurrently rather than dispatching them one-by-one here. This skill's sequential per-task loop is for tasks with dependencies or shared state.

## The Process

1. **Read plan, extract all tasks with full text, note context, create TodoWrite**
2. **Per task:**
   a. Dispatch implementer subagent (use implementer-prompt.md template)
   b. If implementer asks questions, answer and re-dispatch
   c. Implementer implements, tests, self-reviews, and reports changed files plus a suggested commit message. Subagents do not commit, stage, push, or run any Git write command.
   d. **Completion/Integration check (not a full review):** Read the agent's summary, inspect touched files/diff, run targeted tests or record implementer evidence, verify the task is complete, and check whether the change conflicts with earlier tasks or needs follow-up by the same implementer
   e. If the completion check finds gaps, re-dispatch the same implementer to fix them
   f. Mark task complete in TodoWrite
3. **After all tasks:** Dispatch final code reviewer subagent for the entire implementation (use requesting-code-review skill)

**Git ownership:** Subagents do not commit, stage, push, or run any Git write command. They return changed files and a suggested commit message to the orchestrator, along with verification evidence. The orchestrator performs any Git write only after explicit user authorization.

## Model Selection

Use the least powerful model that can handle each role — but **always specify the model explicitly** when dispatching a subagent. Omitting it inherits the session model, which is usually the most expensive.

**Turn count beats token price.** The cheapest model often takes 2-3× more turns to complete a task; the aggregate cost is frequently higher than a mid-tier model that completes it in one pass. Apply a mid-tier floor to reviewers and prose-heavy implementers.

**Tiered guidance:**
- **Plan contains complete code → transcription work → cheapest tier.** The implementer is copying and adapting, not designing.
- **Integration / judgment tasks** (multi-file coordination, pattern matching): standard model.
- **Reviewers and prose-heavy implementers:** mid-tier floor. Cheap models miss subtle defects and produce vague reviews.
- **Final whole-branch review:** most capable available model. This is the last gate before merge.
- **Review tasks scale by diff size / complexity / risk.** A 10-line single-file diff does not need the most capable reviewer; a 500-line cross-module change does.

**Task complexity signals:**
- Touches 1-2 files with a complete spec → cheapest tier
- Touches multiple files with integration concerns → standard model
- Requires design judgment or broad codebase understanding → most capable model

## Handling Implementer Status

Implementer subagents report one of four statuses. Handle each appropriately:

**DONE:** Run the completion/integration check, then continue to the next task. Do not dispatch spec-reviewer or code-quality-reviewer for a clean DONE result. If the work needs a commit, the implementer reports the intended files and message; the orchestrator handles any Git write only after explicit user authorization.

**DONE_WITH_CONCERNS:** The implementer completed the work but flagged doubts. Read the concerns before proceeding. If the concerns are about correctness or scope, resolve them before continuing. If an actual implementation diff shows a high-risk code-quality or cross-task integration concern, a narrow early implementation review is allowed; otherwise note the concern and continue after the completion check.

**NEEDS_CONTEXT:** The implementer needs information that wasn't provided. Provide the missing context and re-dispatch.

**BLOCKED:** The implementer cannot complete the task. Assess the blocker:
1. If it's a context problem, provide more context and re-dispatch with the same model
2. If the task requires more reasoning, re-dispatch with a more capable model
3. If the task is too large, break it into smaller pieces
4. If the plan itself is wrong, escalate to the human

**Never** ignore an escalation or force the same model to retry without changes. If the implementer said it's stuck, something needs to change.

## Prompt Templates

- `./implementer-prompt.md` - Dispatch implementer subagent
- `./spec-reviewer-prompt.md` - Optional narrow consultation when a completion check reveals a scope/compliance risk
- `./code-quality-reviewer-prompt.md` - Optional narrow consultation when a completion check reveals a quality/maintainability risk

## TDD Cycle

Each implementation task follows TDD:
1. **RED**: Write a failing test that captures the desired behavior
2. **GREEN**: Write minimal code to make the test pass
3. **REFACTOR**: Clean up the code while keeping tests green
4. **REGRESSION**: Run the full test suite to verify no regressions

## Advantages

- Subagents follow TDD naturally
- Fresh context per task (no confusion)
- Parallel-safe (subagents don't interfere)
- Subagent can ask questions (before AND during work)
- Same session (no handoff)
- Continuous progress (no waiting)
- Completion checkpoints automatic
- No file reading overhead (controller provides full text)
- Controller curates exactly what context is needed
- Questions surfaced before work begins (not after)
- One final acceptance review covers the whole change instead of repeating full reviews per subtask

## Red Flags

**Never:**
- Start implementation on main/master branch without explicit user consent
- Skip the completion/integration check after an implementer returns
- Treat a completion/integration check as a substitute for the final acceptance review
- Dispatch spec-reviewer/code-quality-reviewer automatically after every DONE subtask
- Proceed with unfixed issues
- Dispatch multiple implementation subagents in parallel (conflicts)
- Make subagent read plan file (provide full text instead)
- Skip scene-setting context (subagent needs to understand where task fits)
- Ignore subagent questions (answer before letting them proceed)
- Accept "close enough" when the completion check shows the task is not done
- Let implementer self-review replace the completion check or the final acceptance review
- Move to next task while the completion check has open issues
- Confuse narrow early review of an actual implementation diff with architecture consultation, debugging, plan review, or routine per-task review

**If subagent asks questions:**
- Answer clearly and completely
- Provide additional context if needed
- Don't rush them into implementation

**If the completion check finds issues:**
- Re-dispatch the same implementer to fix them
- Re-run the completion check after fixes
- Repeat until the task is actually done

**If a reviewer is consulted early (only for an implemented diff with DONE_WITH_CONCERNS, user-requested strict step-by-step code review, or an obvious high-risk integration conflict):**
- Implementer (same subagent) fixes the findings
- Re-check only the narrow blocker or concern that triggered the consultation
- Repeat only until that blocker is resolved

**If subagent fails task:**
- Dispatch a fix subagent with specific instructions; the fix subagent also reports changes instead of committing.
- Don't try to fix manually (context pollution)

## Completion / Integration Check

After each implementer returns, run this check before moving to the next task. It is lightweight and focused on factual verification, not a full reviewer-style audit.

**Read the summary:** What was done, what was not done, what evidence the implementer provides.

**Verify completion:** Does the diff satisfy the task's acceptance criteria? Are the files that should have been created/modified actually present?

**Inspect touched files / diff:** Read the changed files or diff. Look for obvious omissions, scope creep, or unintended edits.

**Run targeted tests or record evidence:** If the task has targeted tests, run them. If not, record the implementer's test output or other evidence in the todo list.

**Check integration / conflicts:** Does this change conflict with earlier tasks (same files, inverted assumptions, duplicated logic)? If yes, resolve before continuing, either by re-dispatching the same implementer or by requesting narrow implementation review of the actual diff when the conflict is high-risk.

**When to request early implementation review:** Reviewer/Oracle use is exceptional and requires an actual implementation diff. It is reserved for:
- DONE_WITH_CONCERNS where the concern is about implemented-code correctness, implemented architecture, or cross-task impact
- User explicitly asks for strict step-by-step code review of implemented work
- Obvious high-risk conflict or regression visible between implemented tasks

Do not use Reviewer or Oracle profiles for a BLOCKED task with no implementation to inspect, pre-implementation architecture, plan defects, or root-cause debugging; route those through the orchestrator's ordinary decision, plan, or debugging workflow.

Do not dispatch spec-reviewer or code-quality-reviewer after a clean DONE result. If early consultation is needed, ask for the narrow issue to be evaluated; do not recreate the old routine per-task review loop.

## Constructing Reviewer Prompts

Reviewer prompts shape what the reviewer finds. A poorly constructed prompt pre-judges findings, bloats context with history, or sends the reviewer on irrelevant tangents.

**Do not pre-judge findings.** If your prompt contains any of these, stop — you are pre-judging:
- "Do not flag X" / "don't treat Y as a defect"
- "At most Minor" / "this is expected"
- "The plan chose this approach"

The reviewer must evaluate the diff on its merits. If you have context the reviewer lacks, state it as context, not as a verdict.

**Do not add open-ended directives** without a task-specific reason. "Check all uses of this function," "run race tests if useful," "verify every edge case" — these send the reviewer on unfocused tangents. Point them at specific concerns instead.

**Do not let reviewers re-run tests** the implementer already ran. The reviewer evaluates the diff and the test results the implementer reported. Re-running wastes time and tokens.

**Global constraints block.** Copy the plan's Global Constraints (or spec constraints) **verbatim** into the reviewer prompt — exact values, formats, relationships. This is the reviewer's attention lens. The reviewer template already contains process rules; you add the task-specific constraints.

**Do not paste accumulated history into dispatch prompts.** Each dispatch gets exactly the context it needs — the task text, the diff, the constraints. A real session once dispatched 42k characters where 99% was pasted conversation history. The reviewer cannot use that; it dilutes focus.

**Dispatch the diff, not a summary.** When early consultation or final acceptance review is needed, the reviewer needs the actual diff with context, not your description of it. Structure the dispatch with the review input, the diff, and the task description; the review input may be a committed range or a working-tree/staged diff. The final acceptance review uses `code-reviewer.md` via the requesting-code-review skill; `spec-reviewer-prompt.md` and `code-quality-reviewer-prompt.md` are optional narrow-consult tools only, not routine per-task gates.

**Handling findings:**
- **Critical + Important** → dispatch a fix subagent. Each fix dispatch must include: the test name that covers the fix, the command to run it, and the expected output.
  - If a finding is labeled `[product]`, change the implementation to address it.
  - If a finding is labeled `[evidence]`, supply the missing evidence/proof; do not change product behavior unless the evidence exposes a real defect.
- **Minor** → record in the todo list / ledger; the final acceptance review triages them. Do not dispatch per-Minor fix subagents.
- **Plan-mandated behavior flagged as a defect** → the plan overrode a default. Do not auto-fix. Surface to your human partner for adjudication: "Reviewer flagged X, but the plan mandated Y. Which wins?"
- **Final review findings** → dispatch ONE fix subagent carrying all findings, not one subagent per finding.

## Final Acceptance Review

After all plan tasks are marked complete, before declaring the work done, run a final acceptance review over the full change set. This is distinct from completion/integration checks — it evaluates the work as a whole.

**1. Assess complexity and choose reviewers deliberately:**

Review selection has two independent axes: role/model priority and logical rigor.

- `reviewer` is the primary-model or primary-lane self-review profile. Oracle profiles are external-model cross-check slots ordered by selection priority as `oracle`, `oracle-2nd`, then configured `oracle-3rd` through `oracle-9th`.
- `oracle-2nd` and later slots mean lower selection priority, never stronger capability.
- Logical rigor tiers are `low`, `normal`, `high`, `max` (`normal` is the unsuffixed profile; other tiers are used only when configured and available).
- Explicit user model configuration remains authoritative and may remove model heterogeneity.

| Complexity / evidence shape | Criteria | Reviewer(s) | Tier choice |
|---|---|---|---|
| Simple | 1-2 tasks, single module, no architectural change | first available Oracle | `normal` |
| Complex / cross-module | 3+ tasks, cross-module integration, architectural change, migration | first available Oracle + `reviewer` in parallel | configured `high`, otherwise `normal` |
| Security / performance / data-loss / release / runtime-safety | high-impact risk profile regardless of file count | first available Oracle + `reviewer` in parallel | configured `max`, otherwise `high`, otherwise `normal` |
| Additional evidence requested | user/orchestrator asks for more independent model evidence | additional Oracle slots in order (start with `oracle-2nd`, then later configured/available slots in ordinal order) | keep the intentionally selected tier |

The orchestrator performs this selection after all tasks complete. Do not fan out reviews merely because several Oracle slots or tiers are registered. Collect only intentionally requested reviews. A later Oracle slot is another configured model perspective, not a stronger reviewer.

**2. Dispatch the acceptance review:**

Use the `requesting-code-review` skill. Pass either a committed range or an uncommitted working-tree/staged diff:
- committed range: `BASE_SHA`, `HEAD_SHA`, `DESCRIPTION`, and `PLAN_OR_REQUIREMENTS` when the orchestrator has already created a user-authorized commit;
- working-tree/staged diff: `git diff --stat`, `git diff`, `git diff --cached --stat`, `git diff --cached`, `DESCRIPTION`, and `PLAN_OR_REQUIREMENTS` when implementation subagents returned uncommitted changes.

Do not require implementation subagents to commit, stage, or push merely to create review SHAs. The orchestrator owns any Git write and performs it only after explicit user authorization.

For baseline dispatch: use the selected first available Oracle, and add `reviewer` only when the complexity table says so.

For additional evidence: add the next configured/available Oracle slot(s) in ordinal order, each with the same review input and context. Do not add slots automatically without an intentional evidence need.

**3. Process feedback:**

- Use the `receiving-code-review` skill to handle feedback with technical rigor.
- Fix Critical/Important issues, re-review, loop.
- Only declare the work done when the reviewer(s) approve.

**4. When to skip:**

The final acceptance review is mandatory unless the user explicitly delegates ("你自己决定" / "无需批准自行继续"). Completion/integration checks do not replace final acceptance review.

## Integration

**Required workflow skills:**
- **writing-plans** - Creates the plan this skill executes
- **requesting-code-review** - Code review template for reviewer subagents
- **receiving-code-review** - How to handle reviewer feedback
