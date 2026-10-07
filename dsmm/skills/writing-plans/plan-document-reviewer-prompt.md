> DSH adapter boundary: resolve this resource from the loaded skill's directory resourceBase. Examples are not authority: installation/download/login, private state, Git writes and destructive operations need exact explicit authorization. Use only tools and native roles actually exposed in the current catalog and allowed by the caller; otherwise use a real direct fallback or report the limitation. Translate shell examples to the active runtime.

# Plan Document Reviewer Prompt Template

Use this template for the default blocker-focused review of a complex implementation plan, or when review is otherwise required after the plan is complete. The orchestrator dispatches it; the planner does not.

**Purpose:** Determine whether the plan can reach the approved outcome without missing material dependencies, interfaces, risks, or acceptance evidence.

```
Assignment content (not a tool-call schema; send through a permitted callable native role tool):
  description: "Review implementation plan"
  prompt: |
    Review this implementation plan against the supplied goal and constraints.
    Do the review yourself; do not dispatch another reviewer or worker.

    Supply, in whatever order is clearest:
    - the goal and ideal end state;
    - acceptance criteria;
    - the current complete plan;
    - source requirements or design context;
    - relevant repository or verification evidence;
    - global constraints.

    Evaluate outcome coverage, dependencies and interfaces, task/wave boundaries,
    material risks, executability, and whether the proposed evidence can actually
    demonstrate success. Distinguish blockers from optional improvements. Do not
    require fixed headings, tiny scripted steps, a RED transcript, scenario counts,
    per-task reviews, commits, or a particular implementation when an evidence-based
    equivalent preserves the approved goal, constraints, permissions, and acceptance.

    Report concrete findings with their impact and supporting evidence. A substantive
    blocker must be corrected, rebutted with evidence, or escalated before implementation;
    optional improvements do not block. A conclusion may be included, but no fixed first
    line, field order, verdict token, hash, or receipt is required. An acknowledgement or
    status label alone is not review evidence.
```

Rerun only the affected review when substantive inputs change enough to affect its conclusion. Editorial or formatting changes alone do not invalidate the prior analysis, and review must not become an open-ended loop.
