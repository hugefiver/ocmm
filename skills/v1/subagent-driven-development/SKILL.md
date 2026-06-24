---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
---

<!-- v1 fork of superpowers/subagent-driven-development.
     Upstream: obra/superpowers v6.0.3.
     Adjustments: removed executing-plans comparison (excluded from v1);
     removed using-git-worktrees and finishing-a-development-branch references
     (not in v1); removed test-driven-development reference (TDD is described
     inline in v1); final code review uses requesting-code-review skill only.
     See docs/v1-maintenance.md for sync rules. -->

# Subagent-Driven Development

Execute plan by dispatching fresh subagent per task, with two-stage review after each: spec compliance review first, then code quality review.

**Why subagents:** You delegate tasks to specialized agents with isolated context. By precisely crafting their instructions and context, you ensure they stay focused and succeed at their task. They should never inherit your session's context or history — you construct exactly what they need. This also preserves your own context for coordination work.

**Core principle:** Fresh subagent per task + two-stage review (spec then quality) = high quality, fast iteration

**Continuous execution:** Do not pause to check in with your human partner between tasks. Execute all tasks from the plan without stopping. The only reasons to stop are: BLOCKED status you cannot resolve, ambiguity that genuinely prevents progress, or all tasks complete. "Should I continue?" prompts and progress summaries waste their time — they asked you to execute the plan, so execute it.

## When to Use

- You have an implementation plan
- Tasks are mostly independent
- You are executing in the current session

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

Use the least powerful model that can handle each role to conserve cost and increase speed.

**Mechanical implementation tasks** (isolated functions, clear specs, 1-2 files): use a fast, cheap model. Most implementation tasks are mechanical when the plan is well-specified.

**Integration and judgment tasks** (multi-file coordination, pattern matching, debugging): use a standard model.

**Architecture, design, and review tasks**: use the most capable available model.

**Task complexity signals:**
- Touches 1-2 files with a complete spec → cheap model
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

## Integration

**Required workflow skills:**
- **writing-plans** - Creates the plan this skill executes
- **requesting-code-review** - Code review template for reviewer subagents
- **receiving-code-review** - How to handle reviewer feedback
