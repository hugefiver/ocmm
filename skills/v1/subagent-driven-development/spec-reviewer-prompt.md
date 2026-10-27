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
    context needed to understand dependencies, interfaces, and current constraints.
    No fixed field order is required.

    Compare the actual code and new files to the criteria. Identify missing behavior,
    unjustified scope, incompatible assumptions, or evidence gaps with file/line
    references and technical impact. Consider supported inputs and failure conditions
    implied by established interfaces and ordinary valid use even when the criteria do
    not enumerate them, without inventing new features. Allow minimal evidence-based
    equivalent implementations that preserve the approved goal, constraints,
    permissions, and acceptance criteria.

    Evaluate final valid requirements and committed contracts, not intermediate
    behavior or decision history. Tests cover functionality and external interfaces,
    not descriptive-text locks, decision counterexamples, or removed-component
    absence. Update tests with requirements and delete removed components' tests.

    Report concrete findings and supporting evidence. Do not rely on an implementer
    status or acknowledgement, and do not require a fixed first-line verdict or
    receipt. For an important behavior you cannot judge, state the behavior, why
    judgment is unavailable, and the missing evidence or product decision; no fixed
    heading, quota, or list is required.
```

Rerun only if substantive implementation, criteria, constraints, or evidence relevant to this review changes.
