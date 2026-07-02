---
name: brainstorming
description: "Use before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
---

<!-- v1 fork of superpowers/brainstorming.
     Upstream: obra/superpowers v6.0.3.
     Adjustments: removed visual-companion section (not applicable to ocmm's
     declarative prompt model); removed spec-document-reviewer-prompt reference
     (spec review is handled by receiving-code-review skill in v1); replaced
     "invoke writing-plans skill" language to match v1's auto-injected skill
     model; step 2 restructured to conditional clarifier consultation on
     ambiguity; step 7 spec approval made conditional (user delegation OR
     self-review unambiguous pass); HARD-GATE approval sources expanded to
     three (user approval / self-review pass / user delegation). See
     docs/v1-maintenance.md for sync rules. -->

# Brainstorming Ideas Into Designs

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by understanding the current project context, then resolve ambiguity (consulting the `clarifier` agent when needed). Once you understand what you're building, present the design and obtain approval.

<HARD-GATE>
Do NOT write any code, scaffold any project, or take any implementation action until the design has been approved. Approval is granted by ANY ONE of:
  (a) explicit user approval of the presented design, OR
  (b) self-review (step 6) passing all four checks with no unresolved ambiguity, OR
  (c) explicit user delegation — "你自己决定" / "你看着办" / "you decide" (full session), OR
      "无需批准自行继续" / "proceed without approval" (current node only), OR
      "review N 次就下一步" / "review N times then proceed" (caps the plan-critic loop at N iterations).
This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process. A todo list, a single-function utility, a config change — all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple projects), but you MUST present it and obtain approval.

## User Delegation Forms

The user may delegate approval authority at any point. Delegation is honored for the scope specified:

| Form | Scope | Effect |
|---|---|---|
| "你自己决定" / "你看着办" / "you decide" | Full session | Skip all approval gates (spec and plan) |
| "无需批准自行继续" / "proceed without approval" | Current node only | Skip the current approval gate, then resume normal approval |
| "review N 次就下一步" / "review N times then proceed" | plan-critic loop | Cap the writing-plans plan-critic loop at N iterations; proceed after N even if not unambiguous |

## Checklist

You MUST create a task for each of these items and complete them in order:

1. **Explore project context** — check files, docs, recent commits
2. **Ambiguity assessment + conditional clarifier consultation** — assess the requirement; if purpose/constraints/success criteria are all clear, skip to step 3; otherwise consult the `clarifier` agent and use its Questions for User to drive user Q&A
3. **Propose 2-3 approaches** — with trade-offs and your recommendation
4. **Present design** — in sections scaled to their complexity, get user approval after each section
5. **Write design doc** — save to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit
6. **Spec self-review** — quick inline check for placeholders, contradictions, ambiguity, scope
7. **Conditional spec approval** — skip user approval if delegation applies OR self-review passed with no ambiguity; otherwise present spec to user for approval
8. **Transition to implementation** — proceed to the writing-plans skill

## The Process

**Understanding the idea:**

- Check out the current project state first (files, docs, recent commits)
- Before asking detailed questions, assess scope: if the request describes multiple independent subsystems, flag this immediately. Don't spend questions refining details of a project that needs to be decomposed first.
- If the project is too large for a single spec, help the user decompose into sub-projects: what are the independent pieces, how do they relate, what order should they be built? Then brainstorm the first sub-project through the normal design flow. Each sub-project gets its own spec → plan → implementation cycle.
- For appropriately-scoped projects, proceed to ambiguity assessment (step 2)

**Ambiguity assessment + conditional clarifier consultation (step 2):**

1. Assess whether the requirement has ambiguity in purpose, constraints, or success criteria.
2. If everything is clear, skip step 2 entirely and proceed to step 3.
3. If ambiguity exists, dispatch the `clarifier` agent with the requirement and project context. The clarifier returns: Intent Classification, Pre-Analysis Findings, Questions for User (max 3), Identified Risks, Directives for planner, Recommended Approach.
4. Use the clarifier's Questions for User to drive user Q&A — one question at a time, multiple choice preferred when possible. If the clarifier returns no questions, proceed to step 3.
5. Focus on understanding: purpose, constraints, success criteria

**Exploring approaches:**

- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why

**Presenting the design:**

- Once you believe you understand what you're building, present the design
- Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing
- Be ready to go back and clarify if something doesn't make sense

**Design for isolation and clarity:**

- Break the system into smaller units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently
- For each unit, you should be able to answer: what does it do, how do you use it, and what does it depend on?
- Can someone understand what a unit does without reading its internals? Can you change the internals without breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are also easier to work with - you reason better about code you can hold in context at once, and your edits are more reliable when files are focused. When a file grows large, that's often a signal that it's doing too much.

**Working in existing codebases:**

- Explore the current structure before proposing changes. Follow existing patterns.
- Where existing code has problems that affect the work (e.g., a file that's grown too large, unclear boundaries, tangled responsibilities), include targeted improvements as part of the design - the way a good developer improves code they're working in.
- Don't propose unrelated refactoring. Stay focused on what serves the current goal.

## After the Design

**Documentation:**

- Write the validated design (spec) to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Commit the design document to git

**Spec Self-Review (step 6):**
After writing the spec document, look at it with fresh eyes:

1. **Placeholder scan:** Any "TBD", "TODO", incomplete sections, or vague requirements? Fix them.
2. **Internal consistency:** Do any sections contradict each other? Does the architecture match the feature descriptions?
3. **Scope check:** Is this focused enough for a single implementation plan, or does it need decomposition?
4. **Ambiguity check:** Could any requirement be interpreted two different ways? If so, pick one and make it explicit.

Fix any issues inline. No need to re-review — just fix and move on.

**Conditional Spec Approval (step 7):**
After the spec self-review loop passes, determine whether user approval is required:

- **Auto-skip** if ANY of:
  - The user has delegated approval (any form in the table above).
  - Self-review ambiguity check (item 4) passed with no unresolved ambiguity.
- **Require user approval** otherwise. Present the spec:

  > "Spec written and committed to `<path>`. Please review it and let me know if you want to make any changes before we start writing out the implementation plan."

  Wait for the user's response. If they request changes, make them and re-run the spec review loop. Only proceed once the user approves.

**Implementation:**

- Proceed to the writing-plans skill to create a detailed implementation plan

## Key Principles

- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-3 approaches before settling
- **Incremental validation** - Present design, obtain approval before moving on
- **Be flexible** - Go back and clarify when something doesn't make sense
