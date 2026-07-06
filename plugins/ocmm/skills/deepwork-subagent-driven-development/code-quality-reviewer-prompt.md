# Code Quality Reviewer Prompt Template

Use this template only for an exceptional narrow code-quality consultation after a completion/integration check exposes a quality or maintainability risk.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable)

**Do not dispatch automatically after every task.** Do not require a prior spec-reviewer pass unless the same concern also needs a spec-compliance consultation.

```
Task tool (general-purpose):
  Use template at requesting-code-review/code-reviewer.md

  DESCRIPTION: [task summary, from implementer's report]
  PLAN_OR_REQUIREMENTS: Task N from [plan-file]
  BASE_SHA: [commit before task]
  HEAD_SHA: [current commit]
```

**In addition to standard code quality concerns, the reviewer should check:**
- Does each file have one clear responsibility with a well-defined interface?
- Are units decomposed so they can be understood and tested independently?
- Is the implementation following the file structure from the plan?
- Did this implementation create new files that are already large, or significantly grow existing files? (Don't flag pre-existing file sizes — focus on what this change contributed.)

**Code reviewer returns:** Strengths, Issues (Critical/Important/Minor), Assessment
