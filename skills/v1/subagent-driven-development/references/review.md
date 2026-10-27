# Conditional Implementation Review

Load this reference only when independent implementation review is explicitly required or materially useful under the parent skill.

## Constructing Review Requests

Provide the reviewer with the goal, acceptance criteria, current diff or committed range including new files, relevant verification evidence, and global constraints. Add focused context for a known concern without pre-judging the conclusion. Do not paste accumulated session history or require a fixed packet schema, receipt, or first-line verdict.

Reviewers inspect the actual change and evidence; they should not rerun expensive checks without a reason. Treat their findings according to technical merit. Re-request only the affected review for a newly identified or resolved blocker, a substantive correction, or relevant new evidence or constraints. An editorial prompt change, repeated concern, or unchanged uncertainty does not stale otherwise applicable review analysis.

## When Review Is Useful

Consider focused review for a high-risk implementation concern, uncertain complex fix, meaningful cross-module integration, security/data/protocol/compatibility/release risk, or explicit user request. Consider a whole-change review before merge or delivery when the size or risk benefits from independent scrutiny.

Review is not unconditional. A proven low-risk result need not wait for an optional or redundant reviewer, and reviewer approval is not a substitute for evidence. When review is required by the user or a governing release/safety process, satisfy that requirement and resolve substantive blockers before completion.

## Handling Findings

Use the `receiving-code-review` skill. Fix validated blocking defects or missing required evidence. Group related findings into a coherent correction rather than spawning one worker per comment. Push back with code, requirements, or evidence when a finding is incorrect or would change approved intent.

After a substantive fix, rerun affected evidence and any review whose blocker or supporting evidence changed. Do not rerun unaffected reviews. Preserve the approved goal and constraints; escalate feedback that would change scope, acceptance, safety/data guarantees, public APIs/protocols, permissions, or irreversible behavior.
