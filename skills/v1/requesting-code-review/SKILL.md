---
name: requesting-code-review
description: Use after all implementation tasks complete, after major features are integrated, or before merging to verify work meets requirements
---

<!-- v1 fork of superpowers/requesting-code-review.
     Upstream: obra/superpowers v6.0.3.
     Adjustments: removed executing-plans and subagent-driven-development
     cross-references (v1 uses subagent-driven as the only path); added
     Reviewer Selection section for ordered Oracle slot semantics and logical
      tiers (oracle slots = external-model priority ordering, reviewer =
      primary-lane self-review, tiers = low/normal/high/max). Project 5 adaptation:
      canonical review-artifact identity binds review packets and receipts without
      a ledger, runtime, hash CLI, or Git-write requirement. See docs/v1-maintenance.md for sync
      rules. -->

# Requesting Code Review

Dispatch a code reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history. This keeps the reviewer focused on the work product, not your thought process, and preserves your own context for continued work.

**Core principle:** Review implemented code or an integrated change set. Reviewer/Oracle profiles are not research, ideation, architecture-design, debugging, or general-answer consultants.

## When to Request Review

**Mandatory:**
- After all implementation tasks complete
- After completing a major feature
- Before merge to main

**Optional but valuable:**
- After completing a high-risk implementation increment that needs focused code-quality validation
- After fixing a complex bug when the fix remains uncertain after local verification

## How to Request

**1. Construct one identity-bound review packet before dispatch.**

Set `ARTIFACT_KIND` to exactly `committed-range` or `working-tree`. Its mandatory
`ARTIFACT_IDENTITY` is an opaque comparison value, not proof that a test or review
is correct.

For an orchestrator-owned, user-authorized committed range, resolve full endpoint
hashes and use exactly:

```text
committed-range:BASE_SHA=<40-or-64-hex>;HEAD_SHA=<40-or-64-hex>
```

```bash
BASE_SHA=$(git rev-parse HEAD~1) # or origin/main
if [ $? -ne 0 ]; then exit 1; fi
HEAD_SHA=$(git rev-parse HEAD)
if [ $? -ne 0 ]; then exit 1; fi
sha_pattern='^([0-9a-f]{40}|[0-9a-f]{64})$'
[[ "$BASE_SHA" =~ $sha_pattern ]] || exit 1
[[ "$HEAD_SHA" =~ $sha_pattern ]] || exit 1
ARTIFACT_IDENTITY="committed-range:BASE_SHA=$BASE_SHA;HEAD_SHA=$HEAD_SHA"
git diff --binary --no-ext-diff "$BASE_SHA..$HEAD_SHA" || exit $?
```

```powershell
$baseShaLines = @(git rev-parse HEAD~1) # or origin/main
if ($LASTEXITCODE -ne 0) { throw "cannot resolve BASE_SHA" }
$baseSha = ($baseShaLines -join "`n").Trim()
if ($baseSha -notmatch '^(?:[0-9a-f]{40}|[0-9a-f]{64})$') { throw "BASE_SHA must be a full lowercase Git object ID" }
$headShaLines = @(git rev-parse HEAD)
if ($LASTEXITCODE -ne 0) { throw "cannot resolve HEAD_SHA" }
$headSha = ($headShaLines -join "`n").Trim()
if ($headSha -notmatch '^(?:[0-9a-f]{40}|[0-9a-f]{64})$') { throw "HEAD_SHA must be a full lowercase Git object ID" }
$artifactIdentity = "committed-range:BASE_SHA=$baseSha;HEAD_SHA=$headSha"
git diff --binary --no-ext-diff "$baseSha..$headSha"
if ($LASTEXITCODE -ne 0) { throw "cannot produce committed review diff" }
```

For a working tree, calculate the canonical lowercase `sha256:<64-lowercase-hex>`
identity immediately before dispatch. This module is authoritative: it records raw
`HEAD` bytes, one final combined binary tracked diff, and bytewise-sorted,
non-ignored untracked entries. It is read-only and fails closed for Git errors,
unreadable files, malformed NUL output, and unsupported entry types.

<!-- ocmm-review-artifact-identity-js -->
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
      if (index === start) throw new Error("git NUL output contained an empty field");
      fields.push(bytes.subarray(start, index));
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

The shell wrappers extract and execute the exact fenced module from this current
skill file. They intentionally do not reproduce the algorithm.

<!-- ocmm-review-artifact-identity-bash -->
```bash
# Substitute the installed/generated skill copy when this source-relative default is unavailable.
skill_path='skills/v1/requesting-code-review/SKILL.md'
extract_script() {
  node -e 'const { readFileSync } = require("node:fs"); const text = readFileSync(process.argv[1], "utf8"); const marker = "<!-- ocmm-review-artifact-" + "identity-js -->"; const at = text.indexOf(marker); if (at < 0 || text.indexOf(marker, at + marker.length) !== -1) throw new Error("canonical marker missing or duplicate"); const following = text.slice(at + marker.length); const fence = /^\r?\n```js\r?\n([\s\S]*?)\r?\n```(?:\r?\n|$)/.exec(following); if (!fence) throw new Error("canonical fence missing or not adjacent"); process.stdout.write(fence[1]);' "$skill_path"
}
script="$(extract_script)" || exit $?
artifact_identity="$(
  node --input-type=module -e "$script"
)" || exit $?
if ! node -e 'process.exit(/^sha256:[0-9a-f]{64}$/.test(process.argv[1]) ? 0 : 1)' "$artifact_identity"; then exit 1; fi
printf '%s\n' "$artifact_identity"
```

<!-- ocmm-review-artifact-identity-powershell -->
```powershell
# Substitute the installed/generated skill copy when this source-relative default is unavailable.
$skillPath = Join-Path (Get-Location) "skills/v1/requesting-code-review/SKILL.md"
$extractor = @'
const { readFileSync } = require("node:fs");
const text = readFileSync(process.argv[1], "utf8");
const marker = "<!-- ocmm-review-artifact-" + "identity-js -->";
const at = text.indexOf(marker);
if (at < 0 || text.indexOf(marker, at + marker.length) !== -1) throw new Error("canonical marker missing or duplicate");
const following = text.slice(at + marker.length);
const fence = /^\r?\n```js\r?\n([\s\S]*?)\r?\n```(?:\r?\n|$)/.exec(following);
if (!fence) throw new Error("canonical fence missing or not adjacent");
process.stdout.write(fence[1]);
'@
$scriptLines = @(node -e $extractor $skillPath)
if ($LASTEXITCODE -ne 0 -or $scriptLines.Count -eq 0) { throw "cannot extract canonical review identity module" }
$script = $scriptLines -join "`n"
$artifactIdentityLines = @(node --input-type=module -e $script)
if ($LASTEXITCODE -ne 0 -or $artifactIdentityLines.Count -eq 0) { throw "cannot calculate review artifact identity" }
$artifactIdentity = $artifactIdentityLines -join "`n"
if ($artifactIdentity -notmatch '^sha256:[0-9a-f]{64}$') { throw "canonical review artifact identity has an invalid format" }
$artifactIdentity
```

<!-- ocmm-review-artifact-identity-packet -->
```text
ARTIFACT_KIND: committed-range | working-tree
ARTIFACT_IDENTITY: <committed range identity or canonical working identity>
DESCRIPTION: <implemented change summary>
PLAN_OR_REQUIREMENTS: <path or supplied requirements>
REVIEW_INPUT: <binary range diff, or binary working diff plus sorted manifest>
VERIFICATION_EVIDENCE: <command, concise result, source/artifact, identity at capture>
GLOBAL_CONSTRAINTS: <verbatim task constraints>
```

For a working tree, `REVIEW_INPUT` contains the current
`git diff --binary --no-ext-diff HEAD --` output and the sorted untracked manifest
with entry types. If raw output is unsafe or large, cite a sanitized report
artifact/path and digest instead. Stamp each evidence capture with the packet
identity; hash equality proves artifact identity, not quality.

Send the same packet to every deliberately selected lane, apart from its intended
role/profile designation. Each Reviewer or Oracle verifies the input, echoes its
identity before evaluating quality, and returns a receipt. Parent recompute occurs immediately after each lane return. A `[evidence]` missing identity,
mismatch, drift, or incomplete receipt is a blocker: reject the verdict and do not
approve the packet.

Continue fixes in the same `task_id` during the same review stage, but create a
new packet and new artifact identity after every changed input. Re-run only
affected evidence, then finish final acceptance only when all required receipts
share one common current identity. If a receipt is lost or cannot be reread, it is
absent: re-review; no memory reconstruction. No ledger, review runtime, hash CLI,
or implementation-subagent Git requirement is introduced. Do not require
implementation subagents to commit, stage, or push merely to create review input.

Every receipt contains exactly these five fields, in order:

```text
role/profile lane: <selected reviewer or Oracle profile>
task_id or session receipt: <task_id or durable session/result reference>
artifact identity: <received and verified identity>
verdict: <approved | rejected | with fixes>
report artifact/source: <review report path or task-result source>
```

**2. Dispatch the selected code-review lane(s).**

Use the applicable Task tool and fill `code-reviewer.md` with the complete packet.
The selection table below still determines which intentionally selected Oracle and
Reviewer lanes receive it; configured profiles never cause automatic fan-out.

**3. Act on feedback.**
- Fix Critical issues immediately
- Fix Important issues before declaring done
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

**Feedback classification:** Review findings may be labeled `[product]` (proposed change to product behavior or implementation) or `[evidence]` (a missing or insufficient proof/artifact). An `[evidence]` blocker means the current behavior may be acceptable but the proof is not — add the missing evidence rather than changing product behavior. A `[product]` blocker requires a behavior or implementation change. Do not treat an `[evidence]` finding as a mandate to rewrite code.

## Reviewer Selection

Review selection has two independent axes: role/model priority and logical rigor.

### Axis 1 — Role/Model Priority

- `reviewer` is the primary-model or primary-lane self-review profile; `reviewer-2nd` does not exist.
- Oracle profiles are external-model cross-check slots ordered as `oracle`, `oracle-2nd`, then configured `oracle-3rd` through `oracle-9th`.
- `oracle-2nd` and every later slot have lower selection priority, never greater capability.
- Explicit user model configuration remains authoritative and may remove model heterogeneity.

### Axis 2 — Logical Rigor Tiers

- Logical tiers are `low`, `normal`, `high`, `max`.
- `normal` is the unsuffixed profile (`oracle`, `reviewer`).
- Tier-suffixed profiles are used only when configured and available.

**Selection by work shape:**

| Work shape | Reviewer(s) | Tier choice |
|---|---|---|
| Simple / single-stage (1-2 tasks, one module, no architectural change) | first available Oracle | `normal` |
| Complex / cross-module / large integration | first available Oracle + `reviewer` (parallel) | configured `high`, otherwise `normal` |
| Security / performance / data-loss / release / runtime-safety work | first available Oracle + `reviewer` (parallel) | configured `max`, otherwise `high`, otherwise `normal` |
| Additional evidence requested | additional Oracle slots in order (`oracle-2nd`, then later configured slots) | keep the intentionally selected tier; user override is still subject to availability/disabled profiles/floors |

**Dispatch semantics:**

- Configuring several slots or tiers never triggers automatic fan-out by itself.
- A higher logical tier can be selected without adding more reviewers.
- A later Oracle slot is another configured model perspective, not a stronger reviewer.
- User overrides are allowed, but availability, disabled profiles, and floor constraints still apply.

Reviewer and Oracle profiles do not review implementation plans; `plan-critic` owns plan receipts. A timeout, partial response, or review of a different revision is not an acceptance conclusion.

**Reasoning policy:** Every parsed Oracle/Reviewer profile retains an `xhigh` minimum floor when the selected model family exposes that control; otherwise use the highest supported review effort for that family. This floor remains in effect while logical tier selection still includes `low`/`normal`/`high`/`max` semantics. GPT-5.6 supports native `max`, so complex or high-risk review/verification on GPT-5.6 can request local `max` directly; other model families use local `max` only when their cataloged controls expose a maximum-effort level. `plan-critic` uses `xhigh` minimum and may be raised by explicit local configuration. Example model names are references only; explicit user configuration and currently available models decide the actual selection.

## Example

```
[All implementation tasks complete: Add verification and repair workflow.]

You: I will capture one identity-bound final-review packet before dispatch.

Identity-Bound Review Packet
ARTIFACT_KIND: working-tree
ARTIFACT_IDENTITY: sha256:7c7b730c7db8334eb82eb2d4b40fa2c549f2e258dbf5e549f5c112f3ec60739b
DESCRIPTION: Added verifyIndex() and repairIndex() with four issue types.
PLAN_OR_REQUIREMENTS: docs/superpowers/plans/deployment-plan.md
REVIEW_INPUT: current binary working-tree diff and sorted untracked manifest in artifacts/review-input.txt (digest recorded)
VERIFICATION_EVIDENCE: node --test ... => 18 passed; artifacts/verify-index.txt; stamped sha256:7c7b730c7db8334eb82eb2d4b40fa2c549f2e258dbf5e549f5c112f3ec60739b
GLOBAL_CONSTRAINTS: no implementation-subagent Git writes; preserve the requested API.

[Dispatch the intentionally selected Oracle with that packet.]
[Parent recomputes the identity after the result; it still matches.]

Review Receipt
role/profile lane: oracle
task_id or session receipt: task_42
artifact identity: sha256:7c7b730c7db8334eb82eb2d4b40fa2c549f2e258dbf5e549f5c112f3ec60739b
verdict: approved
report artifact/source: task_42 final result

You: The required receipt has the common current identity; final acceptance may complete.
```

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Declare done with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See template at: `requesting-code-review/code-reviewer.md`
