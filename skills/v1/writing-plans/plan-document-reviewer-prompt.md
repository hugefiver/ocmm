# Plan Document Reviewer Prompt Template

Use this template when independent plan review is useful after the plan is complete.

**Purpose:** Determine whether the plan can reach the approved outcome without missing material dependencies, interfaces, risks, or acceptance evidence.

```
Task tool (general-purpose):
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

    Report concrete findings with their impact and supporting evidence. A conclusion
    may be included, but no fixed first line, field order, verdict token, or receipt is
    required. An acknowledgement or status label alone is not review evidence.
```

Rerun this review only when its substantive inputs change. Editorial or formatting changes alone do not invalidate the prior analysis.
