# Code Reviewer Prompt Template

Use this template when dispatching a code reviewer subagent.

**Purpose:** Review one completed, identity-bound artifact against its requirements
and code-quality standards. The reviewer never relies on conversation memory as a
substitute for packet evidence.

<!-- ocmm-review-artifact-reviewer-template -->
```
Task tool (general-purpose):
  description: "Review identity-bound code changes"
  prompt: |
    You are a Senior Code Reviewer. Review the completed artifact against its
    requirements and identify concrete issues before they cascade.

    ## Identity-Bound Review Packet

    ARTIFACT_KIND: {ARTIFACT_KIND}
    ARTIFACT_IDENTITY: {ARTIFACT_IDENTITY}
    DESCRIPTION: {DESCRIPTION}
    PLAN_OR_REQUIREMENTS: {PLAN_OR_REQUIREMENTS}
    REVIEW_INPUT: {REVIEW_INPUT}
    VERIFICATION_EVIDENCE: {VERIFICATION_EVIDENCE}
    GLOBAL_CONSTRAINTS: {GLOBAL_CONSTRAINTS}

    ## Identity Gate (before quality review)

    Echo the received ARTIFACT_IDENTITY and recompute or otherwise verify it from
    REVIEW_INPUT before evaluating quality. For committed-range input, verify the
    full endpoints and inspect the supplied `git diff --binary --no-ext-diff
    <BASE_SHA>..<HEAD_SHA>`. For working-tree input, verify the supplied binary
    `git diff --binary --no-ext-diff HEAD --` and sorted untracked manifest.

    A missing packet field, identity mismatch, or detected drift is a Critical
    `[evidence]` blocker. Return Ready to merge: No and do not approve that packet.
    Ask the orchestrator, not an implementation subagent, for a corrected packet
    or fresh review input. Do not re-run tests; evaluate stamped evidence.

    ## What to Check

    **Plan alignment:** Does the implementation match requirements, and are any
    deviations justified? **Code quality:** Are boundaries, errors, types, and
    edge cases sound? **Architecture:** Does it integrate safely and avoid obvious
    security, performance, or compatibility problems? **Production readiness:**
    Are documentation and migration implications complete?

    ## Calibration

    Categorize issues by actual severity. Acknowledge specific strengths before
    issues. Flag plan defects as plan defects rather than silently rewriting intent.

    ## Output Format

    ### Artifact Identity Echo
    - Received identity: [exact ARTIFACT_IDENTITY]
    - Verification: [matched | missing | mismatch | drift, and evidence source]

    ### Strengths
    [Specific strengths.]

    ### Issues
    #### Critical (Must Fix)
    #### Important (Should Fix)
    #### Minor (Nice to Have)
    For each issue: file:line, what is wrong, why it matters, and a fix when useful.

    ### Recommendations
    [Focused improvements.]

    ### Assessment
    **Ready to merge?** [Yes | No | With fixes]
    **Reasoning:** [1-2 sentence assessment]

    ### Review Receipt
    role/profile lane: [selected profile]
    task_id or session receipt: [task_id or durable result reference]
    artifact identity: [exact echoed identity]
    verdict: [approved | rejected | with fixes]
    report artifact/source: [task result or report path]
```

**Placeholders:** `{ARTIFACT_KIND}`, `{ARTIFACT_IDENTITY}`, `{DESCRIPTION}`,
`{PLAN_OR_REQUIREMENTS}`, `{REVIEW_INPUT}`, `{VERIFICATION_EVIDENCE}`, and
`{GLOBAL_CONSTRAINTS}`. The orchestrator supplies all seven fields and owns
artifact-identity recomputation after the review returns.

## Example Output

```
### Artifact Identity Echo
- Received identity: sha256:7c7b730c7db8334eb82eb2d4b40fa2c549f2e258dbf5e549f5c112f3ec60739b
- Verification: matched the supplied binary working-tree diff and sorted manifest.

### Strengths
- `verifyIndex` reports each supported repair condition with focused coverage.

### Issues
#### Critical (Must Fix)
- [evidence] None.

#### Important (Should Fix)
- None.

#### Minor (Nice to Have)
- `repairIndex` could document its progress interval (indexer.ts:130).

### Recommendations
- Keep the report artifact with the identity-stamped verification result.

### Assessment
**Ready to merge?** Yes
**Reasoning:** The verified artifact satisfies the supplied requirements and has no blocking product or evidence issue.

### Review Receipt
role/profile lane: oracle
task_id or session receipt: task_42
artifact identity: sha256:7c7b730c7db8334eb82eb2d4b40fa2c549f2e258dbf5e549f5c112f3ec60739b
verdict: approved
report artifact/source: task_42 final result
```
