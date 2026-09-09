---
name: receiving-code-review
description: Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation
---

<!-- v1 fork of superpowers/receiving-code-review.
     Upstream: obra/superpowers v6.2.0 (synced 2026-08-02).
     Adjustments: self-contained technical evaluation remains; findings are
     evidence, not fixed verdict/receipt gates, and follow-up review is limited to
     substantively changed inputs. See docs/v1-maintenance.md for sync rules. -->

# Code Review Reception

## Overview

Code review requires technical evaluation, not emotional performance.

**Core principle:** Verify before implementing. Preserve the approved goal and constraints. Technical correctness over social comfort.

## Evaluate the Feedback

1. Read the complete substantive feedback.
2. Restate or clarify the technical requirement when needed.
3. Verify the claim against current code, requirements, and evidence.
4. Classify it as a product defect, evidence gap, optional improvement, incorrect finding, or decision that changes approved intent.
5. Apply the smallest justified correction or push back with evidence.
6. Rerun only affected verification and review surfaces.

A reviewer status, verdict label, acknowledgement, or receipt-shaped response is informational. The cited code, reasoning, and evidence determine whether action is required. Reviewer approval is not a substitute for verification.

## Clarification and Escalation

Clarify an item before implementing it when ambiguity would materially change the correction. Independent clear items may proceed while clarification is pending if doing so cannot create rework or violate shared assumptions.

Escalate instead of deciding when a proposed response changes scope or acceptance, weakens security or data guarantees, changes a public API/protocol, expands permissions, requires an irreversible action, conflicts with the user's approved direction, or would otherwise be a pure guess.

For a non-material ambiguity, choose a safe reversible interpretation from repository evidence. Record a significant ruling or assumption with its reason and cost if wrong.

## Source-Specific Handling

### From the user

- Treat the direction as authoritative after understanding its scope.
- Ask only when ambiguity changes the deliverable or risk.
- Do not expand authorization beyond the request's semantics.
- Skip performative agreement; act or state the technical interpretation.

### From an external reviewer

Check whether the suggestion:

- is correct for this codebase and supported platforms;
- breaks existing behavior or approved acceptance criteria;
- overlooks why the current implementation exists;
- adds unused or speculative functionality;
- conflicts with global constraints or user decisions.

Push back with code, requirements, test results, or protocol/platform evidence when it is wrong. If evidence is unavailable and the decision is material, state the gap and escalate rather than guessing.

## Product Findings vs Evidence Findings

- **Product defect:** Correct the implementation with the smallest change that preserves approved intent.
- **Evidence gap:** Add or rerun the evidence needed to establish the claim; do not rewrite product behavior unless investigation reveals a real defect.
- **Optional improvement:** Record or defer it according to scope and value; it does not block a proven result.
- **Intent-changing proposal:** Return it to the decision owner rather than silently broadening scope.

Keep real security, data-loss, protocol/API, compatibility, release, and irreversible-operation safeguards intact even when a finding is inconvenient.

## Implementing Valid Findings

Group related findings when one coherent correction and evidence path covers them. Use focused deterministic tests at real regression seams, or other useful evidence such as typechecks, builds, runtime probes, and inspection where those better prove the outcome. There is no universal RED transcript, scenario count, one-review-per-finding, or full-suite requirement.

Deep workers and implementers may choose a minimal evidence-based equivalent correction when it preserves the approved goal, constraints, permissions, and acceptance criteria. Record significant rulings or assumptions, why they were made, and the cost if wrong.

## Follow-Up Review

Rerun only the review lanes affected by substantive changes to code, new files, requirements, acceptance criteria, constraints, or relevant evidence. Do not rerun review for formatting, narration, labels, or unrelated changes.

An optional or redundant reviewer that times out, acknowledges without analysis, or adds no evidence does not block a result already established by sufficient current evidence. A review explicitly required by the user or governing process still must be completed, and substantive unresolved high-impact risks remain blockers.

## Git Boundary

Implementing a review fix does not authorize a commit. A commit request does not authorize push, tag, rebase, or release. A clear user request can authorize its exact Git operation without a redundant confirmation, but permissions never expand to another operation or repository.

## Communication

Avoid performative agreement such as "You're absolutely right" or "Great point." Prefer:

- `Fixed <specific issue> in <location>; <evidence>.`
- `Verified the finding against <source>; the minimal correction is <change>.`
- `This would conflict with <requirement/evidence>; I recommend no change because <reason>.`
- `I cannot verify <claim> without <missing evidence>; this is material because <impact>.`

If earlier pushback was wrong, correct it factually and proceed without a long apology.

## Common Mistakes

| Mistake | Better response |
|---|---|
| Performative agreement | State the technical interpretation or action |
| Blind implementation | Verify against current code and requirements |
| Treating a label as proof | Evaluate cited evidence and actual changes |
| Broadening scope | Preserve the approved goal and constraints |
| Repeating every review | Rerun only substantively affected review |
| Guessing through material risk | Escalate the decision |
| Treating optional review as a gate | Rely on sufficient current evidence unless review is required |
