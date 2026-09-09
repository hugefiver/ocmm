# Spec Compliance Reviewer Prompt Template

Use this template only when an implemented change benefits from a focused requirements-compliance review.

**Purpose:** Evaluate whether the current implementation reaches the approved goal without material omission or scope expansion.

```
Task tool (general-purpose):
  description: "Review implementation against requirements"
  prompt: |
    Review the actual implementation yourself. Do not dispatch another reviewer,
    worker, or evidence-gathering subagent.

    Supply the goal, acceptance criteria, current diff or committed range including
    new files, relevant verification evidence, and global constraints. Add only the
    context needed to understand dependencies, interfaces, and approved rulings.
    No fixed field order is required.

    Compare the actual code and new files to the criteria. Identify missing behavior,
    unjustified scope, incompatible assumptions, or evidence gaps with file/line
    references and technical impact. Allow minimal evidence-based equivalent
    implementations that preserve the approved goal, constraints, permissions, and
    acceptance criteria.

    Report concrete findings and supporting evidence. Do not rely on an implementer
    status or acknowledgement, and do not require a fixed first-line verdict or
    receipt. If the supplied material is insufficient, identify the missing evidence.
```

Rerun only if substantive implementation, criteria, constraints, or evidence relevant to this review changes.
