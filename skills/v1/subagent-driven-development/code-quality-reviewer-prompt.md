# Code Quality Reviewer Prompt Template

Use this template only when an implemented change benefits from focused code-quality or maintainability review.

**Purpose:** Evaluate whether the current implementation is sound, maintainable, and appropriately verified.

```
Task tool (general-purpose):
  Use template at requesting-code-review/code-reviewer.md

  Supply, without a required field order:
  - goal and acceptance criteria;
  - current diff or committed range, including new files;
  - relevant verification evidence;
  - global constraints;
  - focused dependency, interface, or maintainability context when material.
```

The reviewer does the review directly and does not dispatch subagents or second-opinion reviewers. Evaluate the change's contribution rather than penalizing unrelated pre-existing structure. Check boundaries, interfaces, local conventions, unnecessary complexity, error behavior, and whether the supplied evidence supports the relevant claims.

Report concrete findings with severity, location, impact, and supporting evidence. No fixed first-line verdict, field order, or receipt is required. Rerun only when substantive review input changes.
