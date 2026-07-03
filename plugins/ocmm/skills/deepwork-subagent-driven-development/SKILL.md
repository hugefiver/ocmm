---
name: deepwork-subagent-driven-development
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
     tasks). Watch-items (not yet decided): two-stage→single task reviewer
     merge (upstream collapsed spec-reviewer + code-quality-reviewer into one
     task-reviewer; v1 retains two-stage as deliberate design — spec-first
     catches wrong-direction code before quality review); ⚠️ Items section
     (reviewer "Cannot verify from diff" items). Did NOT sync:
     review-package/task-brief bash scripts (Windows incompatible); progress
     ledger (v1 uses TodoWrite); File Handoffs/Durable Progress sections
     (depend on scripts).
     See docs/v1-maintenance.md for sync rules. -->

# Subagent-Driven Development

Execute plan by dispatching fresh subagent per task, with two-stage review after each: spec compliance review first, then code quality review.

**Why subagents:** You delegate tasks to specialized agents with isolated context. By precisely crafting their instructions and context, you ensure they stay focused and succeed at their task. They should never inherit your session's context or history — you construct exactly what they need. This also preserves your own context for coordination work.

**Core principle:** Fresh subagent per task + two-stage review (spec then quality) = high quality, fast iteration

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
   c. Implementer implements, tests, commits, self-reviews
   d. Dispatch spec reviewer subagent (use spec-reviewer-prompt.md template)
   e. If spec reviewer finds gaps, implementer fixes, re-review
   f. Dispatch code quality reviewer subagent (use code-quality-reviewer-prompt.md template)
   g. If code quality reviewer finds issues, implementer fixes, re-review
   h. Mark task complete in TodoWrite
3. **After all tasks:** Dispatch final code reviewer subagent for entire implementation (use requesting-code-review skill)

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

**DONE:** Proceed to spec compliance review.

**DONE_WITH_CONCERNS:** The implementer completed the work but flagged doubts. Read the concerns before proceeding. If the concerns are about correctness or scope, address them before review. If they're observations (e.g., "this file is getting large"), note them and proceed to review.

**NEEDS_CONTEXT:** The implementer needs information that wasn't provided. Provide the missing context and re-dispatch.

**BLOCKED:** The implementer cannot complete the task. Assess the blocker:
1. If it's a context problem, provide more context and re-dispatch with the same model
2. If the task requires more reasoning, re-dispatch with a more capable model
3. If the task is too large, break it into smaller pieces
4. If the plan itself is wrong, escalate to the human

**Never** ignore an escalation or force the same model to retry without changes. If the implementer said it's stuck, something needs to change.

## Prompt Templates

- `./implementer-prompt.md` - Dispatch implementer subagent
- `./spec-reviewer-prompt.md` - Dispatch spec compliance reviewer subagent
- `./code-quality-reviewer-prompt.md` - Dispatch code quality reviewer subagent

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
- Review checkpoints automatic
- No file reading overhead (controller provides full text)
- Controller curates exactly what context is needed
- Questions surfaced before work begins (not after)

## Red Flags

**Never:**
- Start implementation on main/master branch without explicit user consent
- Skip reviews (spec compliance OR code quality)
- Proceed with unfixed issues
- Dispatch multiple implementation subagents in parallel (conflicts)
- Make subagent read plan file (provide full text instead)
- Skip scene-setting context (subagent needs to understand where task fits)
- Ignore subagent questions (answer before letting them proceed)
- Accept "close enough" on spec compliance (spec reviewer found issues = not done)
- Skip review loops (reviewer found issues = implementer fixes = review again)
- Let implementer self-review replace actual review (both are needed)
- Start code quality review before spec compliance is approved (wrong order)
- Move to next task while either review has open issues

**If subagent asks questions:**
- Answer clearly and completely
- Provide additional context if needed
- Don't rush them into implementation

**If reviewer finds issues:**
- Implementer (same subagent) fixes them
- Reviewer reviews again
- Repeat until approved
- Don't skip the re-review

**If subagent fails task:**
- Dispatch fix subagent with specific instructions
- Don't try to fix manually (context pollution)

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

**Dispatch the diff, not a summary.** The reviewer needs the actual diff with context, not your description of it. Structure the dispatch with the commit range, the diff, and the task description — the reviewer prompt templates (`spec-reviewer-prompt.md`, `code-quality-reviewer-prompt.md` for per-task; `code-reviewer.md` via the requesting-code-review skill for final acceptance) already shape this.

**Handling findings:**
- **Critical + Important** → dispatch a fix subagent. Each fix dispatch must include: the test name that covers the fix, the command to run it, and the expected output.
- **Minor** → record in the todo list / ledger; the final acceptance review triages them. Do not dispatch per-Minor fix subagents.
- **Plan-mandated behavior flagged as a defect** → the plan overrode a default. Do not auto-fix. Surface to your human partner for adjudication: "Reviewer flagged X, but the plan mandated Y. Which wins?"
- **Final review findings** → dispatch ONE fix subagent carrying all findings, not one subagent per finding.

## Final Acceptance Review

After all plan tasks are marked complete, before declaring the work done, run a final acceptance review over the full change set. This is distinct from the per-task reviews — it evaluates the work as a whole.

**1. Assess complexity:**

| Complexity | Signal | Reviewer(s) |
|---|---|---|
| Simple | 1-2 tasks, single module, no architectural change | `oracle` (self-supervision) |
| Complex | 3+ tasks, cross-module, architectural change, security/performance sensitive, migration | `oracle` + `reviewer` (both, in parallel) |

The orchestrator judges complexity from the plan scope and actual changes. When unsure, upgrade to both.

**2. Dispatch the acceptance review:**

Use the `requesting-code-review` skill. Pass the full change range:
- `BASE_SHA` = commit before the first task of the plan
- `HEAD_SHA` = current HEAD (after all tasks)
- `DESCRIPTION` = summary of the complete feature/work
- `PLAN_OR_REQUIREMENTS` = the plan file path

For both-reviewer dispatch: spawn two subagents in parallel (one `oracle`, one `reviewer`), each with the same SHAs and context. Collect both feedback sets before proceeding.

**3. Process feedback:**

- Use the `receiving-code-review` skill to handle feedback with technical rigor.
- Fix Critical/Important issues, re-review, loop.
- Only declare the work done when the reviewer(s) approve.

**4. When to skip:**

The final acceptance review is mandatory unless the user explicitly delegates ("你自己决定" / "无需批准自行继续"). For a single trivial task already covered by a per-task review, the orchestrator may judge a separate acceptance pass redundant — state this judgment explicitly.

## Integration

**Required workflow skills:**
- **writing-plans** - Creates the plan this skill executes
- **requesting-code-review** - Code review template for reviewer subagents
- **receiving-code-review** - How to handle reviewer feedback

## Codex Compatibility

- When this skill mentions TodoWrite, use Codex `update_plan`.
- When this skill mentions OpenCode `task(...)`, use Codex `multi_agent_v1.spawn_agent` when available.
- When this skill mentions OpenCode-specific tool names, choose the nearest Codex tool with the same intent and preserve the workflow contract.
