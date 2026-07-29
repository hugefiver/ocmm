# Review Artifact Identity and Evidence Design

**Date:** 2026-07-29
**Status:** Approved (self-review pass)
**Scope:** Bind Codex and local final-review evidence to the exact committed range or dirty working-tree artifact that was reviewed. Add a canonical Node SHA-256 snapshot algorithm with Bash and PowerShell invocation examples. This is project 5 and must not alter project 4's existing hunks.

## Context and Failure Mode

The local review workflow accepts a committed range or `git diff` plus `git diff --cached` for uncommitted work, but a PASS is not bound to a revision. A reviewer can therefore approve an earlier diff, then the tree can change before final acceptance. Conversation memory is not a durable substitute for a reviewable artifact identity.

Upstream work addressed related stale-evidence problems with commit-oriented loop state and `.omo/*/ledger.jsonl`. Those assumptions do not fit this repository: local implementation work can remain uncommitted, has no review runtime or CLI, and cannot require automatic Git writes. This design adapts the evidence guarantee to the existing skill and prompt surfaces rather than importing upstream runtime state.

## Goals

1. Identify every review input with either a full committed range or a content-addressed working-tree snapshot.
2. Send one identical identity-bound review packet to every deliberately selected Oracle or Reviewer lane.
3. Make an identity mismatch, missing identity, or post-dispatch drift an `[evidence]` blocker that cannot yield approval.
4. Preserve the existing review selection policy, no-extra-fan-out rule, changed-input policy, and no-Git-write rule.
5. Keep the detailed algorithm and shell examples in the canonical requesting-code-review skill, then propagate it through the existing Codex generator.

## Non-Goals

- No `.omo/ulw-loop`, start-work ledger, `ledger.jsonl`, review runtime, hash CLI, schema, MCP, or automatic Git write.
- No commit or staging requirement for implementation subagents.
- No weakening of final review, changed-input reruns, or review-effort floors.
- No raw secrets or raw logs in review packets.
- No project 4 redesign, package/LSP/schema/version/release change, or production generator-code change.

## Approaches Considered

### A. Copy the upstream commit and tree ledger wholesale, rejected

This would require committed work and a durable runtime ledger that the local workflow does not own. It would import CLI and automatic-commit assumptions while still failing to describe ordinary dirty-tree review precisely.

### B. Local content-addressed artifact identity, selected

Use a full `BASE_SHA` and `HEAD_SHA` pair for committed review, or a SHA-256 identity over the current HEAD, binary tracked diff, and untracked final state for dirty review. The skill packet and task receipt carry that identity. It works without staging, committing, temporary indexes, or Git object writes.

### C. Keep diff-only review plus conversation-memory approval, rejected

The current simple path is easy to use but cannot distinguish an approved artifact from a later changed artifact. It leaves the stale-PASS failure mode open.

## Identity Architecture

`ARTIFACT_KIND` is either `committed-range` or `working-tree`. `ARTIFACT_IDENTITY` is mandatory and is an opaque comparison value, not a claim that tests are correct.

For a committed input, the identity is the exact pair of full hashes:

```text
committed-range:BASE_SHA=<40-or-64-hex>;HEAD_SHA=<40-or-64-hex>
```

The packet must include the full output of `git rev-parse <base>` and `git rev-parse <head>`, not abbreviated display hashes. Approval binds to both endpoints, the role/profile lane, task ID or session receipt, verdict, and report source.

For a dirty input, the identity has the canonical form `sha256:<64-lowercase-hex>`. It represents the repository snapshot at the moment the Node program finishes reading it. It includes:

1. The exact bytes returned by `git rev-parse HEAD`.
2. The exact bytes returned by `git diff --binary --no-ext-diff HEAD --`. This is the final combined staged and unstaged state of tracked paths.
3. Every non-ignored untracked path from `git ls-files --others --exclude-standard -z`, sorted bytewise, plus its type marker and its regular-file bytes or symbolic-link target bytes.

Ignored files are outside the product artifact. Review reports, logs, and other evidence outputs are also not product bytes unless they are tracked or non-ignored untracked product files. The evidence manifest points to those outputs separately and stamps each capture with the artifact identity.

The algorithm fails closed on a Git command failure, unreadable entry, unsupported untracked entry type, or an impossible repository state. It does not stage, commit, create a temporary index, write a Git object, or mutate the worktree.

## Canonical Working-Tree Algorithm

The following is the single canonical Node ES module. Node is already a host dependency, so no install is needed. Domain records are NUL-delimited and length-framed so binary data, including NUL bytes, cannot make two input sequences ambiguous. Paths remain raw Git-output bytes and are sorted with `Buffer.compare`, not locale ordering.

```js
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";

const runGit = (...args) =>
  execFileSync("git", args, { encoding: "buffer", maxBuffer: 1024 * 1024 * 1024 });
const nul = Buffer.from([0]);
const hash = createHash("sha256");

function record(tag, bytes) {
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, "utf8");
  hash.update(Buffer.from(tag, "ascii"));
  hash.update(nul);
  hash.update(Buffer.from(String(body.length), "ascii"));
  hash.update(nul);
  hash.update(body);
  hash.update(nul);
}

function nulFields(bytes) {
  const fields = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0) {
      if (index !== start) fields.push(bytes.subarray(start, index));
      start = index + 1;
    }
  }
  if (start !== bytes.length) throw new Error("git NUL output was not terminated");
  return fields;
}

record("ocmm-review-artifact-v1", "");
record("head", runGit("rev-parse", "HEAD"));
record("tracked-diff", runGit("diff", "--binary", "--no-ext-diff", "HEAD", "--"));

const untracked = nulFields(
  runGit("ls-files", "--others", "--exclude-standard", "-z"),
).sort(Buffer.compare);

for (const path of untracked) {
  const stat = lstatSync(path);
  record("untracked-path", path);
  if (stat.isFile()) {
    record("untracked-type", "file");
    record("untracked-bytes", readFileSync(path));
  } else if (stat.isSymbolicLink()) {
    record("untracked-type", "symlink");
    record("untracked-bytes", readlinkSync(path, { encoding: "buffer" }));
  } else {
    throw new Error(`unsupported untracked entry type: ${path.toString("utf8")}`);
  }
}

process.stdout.write(`sha256:${hash.digest("hex")}\n`);
```

`git diff --binary --no-ext-diff HEAD --` is deliberately one record. It carries Git's complete binary patch serialization for all tracked final-state changes, including additions, deletions, renames, staged edits, and unstaged edits relative to HEAD. An unchanged tracked file is already identified by HEAD. A symlink is represented by its target bytes, never by the file it resolves to.

### Bash invocation

The Bash wrapper uses command substitution and a quoted heredoc. Its heredoc body is the canonical module above, unchanged.

```bash
artifact_identity="$(node --input-type=module -e "$(cat <<'NODE'
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
const runGit = (...args) => execFileSync("git", args, { encoding: "buffer", maxBuffer: 1024 * 1024 * 1024 });
const nul = Buffer.from([0]);
const hash = createHash("sha256");
function record(tag, bytes) { const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, "utf8"); hash.update(Buffer.from(tag, "ascii")); hash.update(nul); hash.update(Buffer.from(String(body.length), "ascii")); hash.update(nul); hash.update(body); hash.update(nul); }
function nulFields(bytes) { const fields = []; let start = 0; for (let index = 0; index < bytes.length; index += 1) { if (bytes[index] === 0) { if (index !== start) fields.push(bytes.subarray(start, index)); start = index + 1; } } if (start !== bytes.length) throw new Error("git NUL output was not terminated"); return fields; }
record("ocmm-review-artifact-v1", ""); record("head", runGit("rev-parse", "HEAD")); record("tracked-diff", runGit("diff", "--binary", "--no-ext-diff", "HEAD", "--"));
for (const path of nulFields(runGit("ls-files", "--others", "--exclude-standard", "-z")).sort(Buffer.compare)) { const stat = lstatSync(path); record("untracked-path", path); if (stat.isFile()) { record("untracked-type", "file"); record("untracked-bytes", readFileSync(path)); } else if (stat.isSymbolicLink()) { record("untracked-type", "symlink"); record("untracked-bytes", readlinkSync(path, { encoding: "buffer" })); } else { throw new Error(`unsupported untracked entry type: ${path.toString("utf8")}`); } }
process.stdout.write(`sha256:${hash.digest("hex")}\n`);
NODE
)" )"
printf '%s\n' "$artifact_identity"
```

### PowerShell invocation

The PowerShell wrapper uses a single-quoted here-string and passes it directly to Node. It is not Bash syntax and has no command substitution. Its here-string body is the same canonical module.

```powershell
$script = @'
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
const runGit = (...args) => execFileSync("git", args, { encoding: "buffer", maxBuffer: 1024 * 1024 * 1024 });
const nul = Buffer.from([0]);
const hash = createHash("sha256");
function record(tag, bytes) { const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, "utf8"); hash.update(Buffer.from(tag, "ascii")); hash.update(nul); hash.update(Buffer.from(String(body.length), "ascii")); hash.update(nul); hash.update(body); hash.update(nul); }
function nulFields(bytes) { const fields = []; let start = 0; for (let index = 0; index < bytes.length; index += 1) { if (bytes[index] === 0) { if (index !== start) fields.push(bytes.subarray(start, index)); start = index + 1; } } if (start !== bytes.length) throw new Error("git NUL output was not terminated"); return fields; }
record("ocmm-review-artifact-v1", ""); record("head", runGit("rev-parse", "HEAD")); record("tracked-diff", runGit("diff", "--binary", "--no-ext-diff", "HEAD", "--"));
for (const path of nulFields(runGit("ls-files", "--others", "--exclude-standard", "-z")).sort(Buffer.compare)) { const stat = lstatSync(path); record("untracked-path", path); if (stat.isFile()) { record("untracked-type", "file"); record("untracked-bytes", readFileSync(path)); } else if (stat.isSymbolicLink()) { record("untracked-type", "symlink"); record("untracked-bytes", readlinkSync(path, { encoding: "buffer" })); } else { throw new Error(`unsupported untracked entry type: ${path.toString("utf8")}`); } }
process.stdout.write(`sha256:${hash.digest("hex")}\n`);
'@
$artifactIdentity = node --input-type=module -e $script
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$artifactIdentity
```

## Review Packet and Receipt Lifecycle

The requesting-code-review skill builds one packet before dispatch. Every selected lane receives byte-for-byte equivalent packet content except its intended role/profile designation.

```text
ARTIFACT_KIND: committed-range | working-tree
ARTIFACT_IDENTITY: <identity defined above>
DESCRIPTION: <implemented change summary>
PLAN_OR_REQUIREMENTS: <path or supplied requirements>
REVIEW_INPUT: <exact committed range, or current working-tree/staged commands,
               output, and untracked manifest>
VERIFICATION_EVIDENCE: <targeted test or real-QA command, result summary,
                        artifact/report source, each stamped with this identity>
GLOBAL_CONSTRAINTS: <verbatim task constraints>
```

For working-tree review, `REVIEW_INPUT` includes the current output of `git diff --binary --no-ext-diff HEAD --` and the sorted untracked manifest with entry types. It does not paste raw secret-bearing logs. A report can cite a sanitized artifact path or result digest when the full command output is unsafe or too large.

Before examining quality, a Reviewer or Oracle must echo the received `ARTIFACT_IDENTITY` and recompute or otherwise verify the declared input identity. Missing identity, an identity mismatch, a missing required receipt field, or detected drift is an `[evidence]` blocker. The lane must return no approval for that packet.

When each lane returns, the parent recomputes the identity before accepting its verdict. If it differs, the verdict is stale. A receipt verdict is binary: exactly `approved` or `rejected`. Fixes continue in the same task ID during the same review stage under the existing local efficiency policy, but each changed artifact gets a new packet and identity. Re-run only evidence affected by the change, then complete final acceptance only when every required receipt has the same common current identity and verdict `approved`. Do not add lanes merely because a packet changed.

Each returned review receipt records exactly:

```text
role/profile lane
task_id or session receipt
artifact identity
verdict: approved | rejected
report artifact/source
```

There is no new durable ledger. If a continuation or compaction loses an exact receipt, or the receipt cannot be re-read from the task result, notepad, or current report artifact, it is absent. Never recreate it from memory. Re-review the current identity instead.

Hash equality proves that the reviewed product artifact is the same product artifact. It does not prove that a test passed correctly, that QA covered the requirement, or that a reviewer reached a sound conclusion.

## Components and File Changes

| Area | Planned change |
|---|---|
| `skills/v1/requesting-code-review/SKILL.md` | Canonical identity contract, complete Node algorithm, Bash and PowerShell examples, packet fields, drift handling, evidence-stamping policy, and receipt requirements. |
| `skills/v1/requesting-code-review/code-reviewer.md` | Add `{ARTIFACT_IDENTITY}` and `{VERIFICATION_EVIDENCE}` placeholders. Require identity echo/verification and an `[evidence]` blocker for missing, mismatched, or drifted input. |
| `skills/v1/subagent-driven-development/SKILL.md` | Make final acceptance use the common packet and identity, preserve same-task review fixes, and require a common current identity before completion. |
| `prompts/omo/agents/orchestrator.md` | Add a concise mandate to load and use the identity-bound requesting-code-review skill. Do not duplicate the algorithm. |
| `prompts/v1/agents/orchestrator.md` | Mirror the concise mandate for the skill-driven workflow. |
| `prompts/codex/agents/orchestrator.md` | Mirror the concise mandate for generated Codex profiles. |
| `docs/prompt-sync.md` | Record OMO/Codex prompt synchronization and generated-consumer expectations. |
| `docs/v1-maintenance.md` | Record the v1 skill and prompt synchronization. |
| `src/intent/prompt-loader.test.ts` | Assert the source prompt mandate is loaded in the applicable OMO and v1 paths. |
| `src/intent/plan-review-contract.test.ts` | Assert the review contract exposes the packet, identity, mismatch blocker, and receipt rules. |
| `src/codex/plugin-generator.test.ts` | Assert generated Codex content carries the mandate and copies the skill/template contract. |

The following are generated consumers, not hand-maintained implementations: `.codex/agents/dw-orchestrator.toml`, `plugins/deepwork/agents/dw-orchestrator.toml`, `plugins/deepwork/skills/deepwork-requesting-code-review/SKILL.md`, `plugins/deepwork/skills/deepwork-requesting-code-review/code-reviewer.md`, and `plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md`. The generator production code remains unchanged. Accept only deterministic deltas that actually result from regeneration; inspect any additional generated files before accepting them.

## Generated Data Flow and Real QA

Source prompts and v1 skills feed the existing Codex plugin generator, which copies the generated agent and skill payloads into `.codex/` and `plugins/deepwork/`. Verify source, temporary generation output, and tracked generated bytes against the generator's current contracts. Run deterministic generation twice and require the second pass to be clean.

For OpenCode, use an isolated configuration and debug-agent inspection for both OMO and v1. Confirm the orchestrator exposes the concise identity-bound-review mandate. For Codex, use an isolated `CODEX_HOME`, install the generated plugin, and inspect the installed requesting-code-review skill. Confirm its canonical algorithm, both shell markers, receipt fields, and source-hash correspondence. Do not make a model request as part of this verification.

## Error Handling and Evidence Rules

- An unreadable path, non-zero Git command, malformed NUL list, unsupported untracked entry type, or Node failure is a closed review gate. Report the command failure without fabricating an identity.
- Identity recomputation happens immediately before dispatch and after each lane returns. It also happens after every fix before reuse of evidence or a verdict.
- Test and real-QA evidence records the command, concise result, source/artifact location, and identity at capture. Never relabel old output with a later identity.
- After a change, rerun affected proofs and then the existing required final pass for the changed-input policy. Do not rerun unrelated proofs solely to create volume.
- A stale, missing, or mismatched lane receipt is an evidence failure, not a product defect unless inspection independently finds a product defect.

## Project 4 Overlap and Scope Control

Project 4 already has dirty changes across docs, prompt-loader and plugin-generator tests, and generated orchestrator TOML files. Project 5 must preserve every project 4 hunk byte-for-byte and append only its own independent content. Existing project 4 specs, plans, and reference additions remain intact.

Before implementation, classify every diff hunk by project. Do not discard, reformat, regenerate away, or fold project 4 work into project 5. Project 5 may modify overlapping files only by adding distinguishable project 5 hunks. It must not touch package versions, LSP assets, schema generation, or release workflow content.

## Acceptance Criteria

1. A committed review packet binds its verdict to full `BASE_SHA` and `HEAD_SHA`, lane, task/session receipt, and report source.
2. A dirty review packet produces a lowercase `sha256:<64hex>` identity from HEAD, the binary tracked diff, and bytewise-sorted non-ignored untracked final state.
3. The documented Bash and PowerShell invocations run the same canonical Node module and print the same identity for the same snapshot.
4. Reviewer and Oracle packets require identity echo/verification; missing, mismatch, or drift blocks approval as `[evidence]`.
5. Parent recomputation rejects stale PASS results, and final acceptance has every required lane receipt at one common current identity with verdict `approved`.
6. Receipts have all five required fields and missing recoverable evidence causes re-review, never memory reconstruction.
7. Evidence is identity-stamped when captured and cannot be relabeled after edits.
8. Source prompts only mandate use of the review skill. The canonical skill owns algorithm detail and shell examples.
9. Targeted tests, typecheck, full test, `build:ts`, two deterministic generator passes, and root build pass. If the root build has the same external live-lock failure, report it as BLOCKED with isolated fallback evidence; release staging still requires a real root gate.
10. Scope, staged-state, secret, and diff checks pass. Final Oracle and Reviewer review approves the common current identity. No extra lanes are added without an intentional evidence need.

## Self-Review

1. **Placeholder scan:** Passed. This specification has no unfinished markers or deferred decisions.
2. **Internal consistency:** Passed. The identity definition, packet rules, receipt rules, and test plan all use the same committed versus working-tree split.
3. **Scope check:** Passed. It is one prompt-and-skill contract change with generated copies and focused tests, not a runtime or release project.
4. **Ambiguity check:** Passed. The exact snapshot inputs, record framing, failure behavior, stale-verdict response, generated verification, and project 4 boundary are explicit.
