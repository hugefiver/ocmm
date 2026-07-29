# Review Artifact Identity Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind every committed-range or dirty-working-tree implementation review packet, lane receipt, and verification claim to one exact artifact identity, propagate that contract through generated Codex surfaces, and prove it through TDD and isolated real-surface QA.

**Architecture:** Keep one canonical, marker-delimited Node ES module in `skills/v1/requesting-code-review/SKILL.md`; Bash and PowerShell wrappers extract and execute that same body rather than maintaining copies. Static and disposable-repository tests enforce the packet/receipt lifecycle and snapshot behavior, while the unchanged Codex generator copies normalized skills and the concise orchestrator mandate into generated and installed surfaces. The parent orchestrator owns identity recomputation, selected-lane dispatch, stale-verdict rejection, and the final common-identity Oracle + Reviewer receipts; no runtime ledger or production hash utility is introduced.

**Tech Stack:** Markdown prompts and skills, TypeScript, Node 22 `node:test`, Git, pnpm, the existing Codex plugin generator, PowerShell 7, OpenCode CLI, and Codex CLI.

**Global Constraints:**
- The authoritative approved design is `docs/superpowers/specs/2026-07-29-review-artifact-identity-design.md`; implement it completely and do not broaden or reinterpret it.
- Repository baseline is branch `master` at `12bd1e24bdfba3e364981481127eba382b9c3a43` with 49 pre-existing Project 4 dirty paths; the Project 5 spec is the 50th dirty path and this plan becomes the 51st before implementation.
- Preserve every existing Project 4 hunk and untracked byte. Overlapping Project 5 edits in `docs/prompt-sync.md`, `docs/v1-maintenance.md`, `src/intent/prompt-loader.test.ts`, `src/codex/plugin-generator.test.ts`, and generated orchestrator TOMLs must be appended as distinct hunks or generator-derived additions.
- Do not stage, commit, push, tag, reset, restore, stash, install software, terminate processes, change global Git configuration, or perform any other Git write in the project repository. Git writes are allowed only inside the disposable OS-temp repositories created by the behavioral test.
- Use PowerShell 7 syntax for repository and Windows QA commands. Bash and PowerShell snippets inside the skill are deliberately separate user-facing examples; never leak Bash assignment, heredoc, chaining, or redirection syntax into the PowerShell example.
- Keep `package.json` version `0.6.4` and `package.json.ocmm.lspVersion` `0.3.2`; do not change package manifests, config schema, `schema.json`, Cargo versions, release workflows, or LSP assets.
- Keep the canonical working-tree algorithm as one authoritative JavaScript body in `skills/v1/requesting-code-review/SKILL.md`; do not add a production script, CLI, MCP, schema, runtime service, `.omo/*` state, ledger, or Git-object/index mutation.
- Working-tree identities are exactly lowercase `sha256:<64hex>` over HEAD, the one combined binary tracked diff, and bytewise-sorted non-ignored untracked final state. Committed identities are the full `BASE_SHA`/`HEAD_SHA` pair.
- Packets have exactly the seven named fields `ARTIFACT_KIND`, `ARTIFACT_IDENTITY`, `DESCRIPTION`, `PLAN_OR_REQUIREMENTS`, `REVIEW_INPUT`, `VERIFICATION_EVIDENCE`, and `GLOBAL_CONSTRAINTS`; receipts have exactly the five named fields specified by the design.
- Missing identity, mismatch, missing receipt evidence, or post-dispatch drift is an `[evidence]` blocker and cannot yield approval. Never reconstruct a lost receipt from memory or relabel earlier evidence with a later identity.
- Preserve existing reviewer-selection, logical-tier, no-extra-fan-out, same-task continuation, changed-input verification, review-effort floor, and no-implementation-subagent-Git-write policies.
- Generated files are outputs only. Do not hand-edit `.codex/agents/**` or `plugins/deepwork/**`; run `pnpm run build:ts` before generation and accept only deterministic generator-produced deltas.
- Final Project 5 implementation acceptance is parent-orchestrator-owned: after all product/test/generated/docs bytes settle, compute one current identity and dispatch the selected first available Oracle plus primary-lane Reviewer with the same packet. Coding workers do not review and do not perform Git writes.

---

## Baseline, file map, and dependency order

Run all repository commands from `C:\Users\hugefiver\source\ocmm`.

### Authoritative source, test, and documentation files

| Path | Responsibility |
|---|---|
| `skills/v1/requesting-code-review/SKILL.md` | Owns the committed/working identity contract, the sole canonical Node body, shell-specific extraction wrappers, packet fields, evidence stamping, drift rejection, and receipt lifecycle. |
| `skills/v1/requesting-code-review/code-reviewer.md` | Carries the seven packet placeholders, identity echo/verification gate, no-test-rerun rule, mismatch rejection, and five-field receipt output. |
| `skills/v1/subagent-driven-development/SKILL.md` | Captures one packet for selected lanes, preserves same reviewer task IDs after fixes, and requires final receipts at one common current identity. |
| `prompts/omo/agents/orchestrator.md` | Adds only the concise orchestrator ownership/skill trigger; no algorithm duplication. |
| `prompts/v1/agents/orchestrator.md` | Mirrors the same model-facing mandate without visible version-label wording. |
| `prompts/codex/agents/orchestrator.md` | Mirrors the same mandate for generated Codex orchestrator profiles. |
| `src/intent/plan-review-contract.test.ts` | Enforces source packet/receipt/marker grammar and executes the extracted canonical algorithm in a disposable Git repository. |
| `src/intent/prompt-loader.test.ts` | Proves OMO and skill-driven loaded orchestrator prompts, plus all three sources, expose only the concise mandate. |
| `src/codex/plugin-generator.test.ts` | Proves source/fresh/tracked normalized skill bytes, exact markers, generated orchestrator mandate, and non-orchestrator exclusion. |
| `docs/prompt-sync.md` | Records prompt/Codex provenance, five upstream SHAs, bounded local adaptation, and explicit no-runtime-ledger decision. |
| `docs/v1-maintenance.md` | Updates governed skill/template/prompt mapping rows and adds the Project 5 provenance section. |

### Generator-owned consumers

The generator may produce real Project 5 deltas only in these tracked consumers:

- `.codex/agents/dw-orchestrator.toml`
- `plugins/deepwork/agents/dw-orchestrator.toml`
- `plugins/deepwork/skills/deepwork-requesting-code-review/SKILL.md`
- `plugins/deepwork/skills/deepwork-requesting-code-review/code-reviewer.md`
- `plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md`

The generation transaction still inventories `.agents/plugins/marketplace.json`, all of `.codex/agents`, and all of `plugins/deepwork`. Files rewritten to identical bytes must not appear as new final deltas. `src/codex/plugin-generator.ts` remains unchanged.

### Serial execution and review boundaries

1. Task 1 establishes and tests the source identity/packet/receipt contract, prompt mandate, and synchronized provenance.
2. Task 2 adds generator-facing tests, then builds TypeScript and regenerates twice from Task 1's settled source.
3. Task 3 reruns all final gates and real surfaces at one unchanged identity, performs scope/security/cleanup checks, and emits the identity-bound packet for parent-owned final review.

Each task ends with a read-only working-tree boundary. No task stages or commits files.

---

### Task 1: Source identity contract, behavioral TDD, prompts, and provenance

**Files:**
- Modify: `src/intent/plan-review-contract.test.ts`
- Modify: `src/intent/prompt-loader.test.ts`
- Modify: `skills/v1/requesting-code-review/SKILL.md`
- Modify: `skills/v1/requesting-code-review/code-reviewer.md`
- Modify: `skills/v1/subagent-driven-development/SKILL.md`
- Modify: `prompts/omo/agents/orchestrator.md`
- Modify: `prompts/v1/agents/orchestrator.md`
- Modify: `prompts/codex/agents/orchestrator.md`
- Modify: `docs/prompt-sync.md`
- Modify: `docs/v1-maintenance.md`

**Interfaces:**
- Consumes: the approved identity algorithm and packet lifecycle; existing `read(...)` helper in `src/intent/plan-review-contract.test.ts`; existing `loadAllPrompts(...)` / `getAgentPrompt(...)`; existing reviewer selection and same-task continuation policies.
- Produces: marker contract `ocmm-review-artifact-identity-js`, `ocmm-review-artifact-bash`, `ocmm-review-artifact-powershell`, `ocmm-review-artifact-packet`, `ocmm-review-artifact-reviewer-template`, and `ocmm-review-artifact-final-acceptance`; exact concise mandate `Final implementation acceptance must load and follow the applicable identity-bound requesting-code-review skill. The orchestrator owns artifact-identity recomputation, one common packet for selected lanes, stale-verdict rejection, and completion only when every required receipt has the same current identity.`; source tests consumed by Tasks 2 and 3.

- [ ] **Step 1: Freeze the baseline evidence and classify overlapping Project 4 hunks**

Run this read-only PowerShell block before editing:

```powershell
$head = git rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $head -ne "12bd1e24bdfba3e364981481127eba382b9c3a43") { throw "unexpected HEAD: $head" }
$branch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $branch -ne "master") { throw "unexpected branch: $branch" }

$status = @(git status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw "git status failed" }
if ($status.Count -ne 51) { throw "expected Project 4's 49 paths plus Project 5 spec and plan; got $($status.Count)" }
git diff --binary --no-ext-diff HEAD -- "docs/prompt-sync.md" "docs/v1-maintenance.md" "src/intent/prompt-loader.test.ts" "src/codex/plugin-generator.test.ts" ".codex/agents/dw-orchestrator.toml" "plugins/deepwork/agents/dw-orchestrator.toml"
if ($LASTEXITCODE -ne 0) { throw "overlap diff inspection failed" }
```

Expected: HEAD and branch match exactly; status has 51 paths; the displayed overlap contains Project 4 sections/tests/generated prompt content only. Record the output in the parent task state. Do not redirect it into the repository and do not modify or reformat those hunks.

- [ ] **Step 2: Add canonical extraction helpers and failing source-contract tests**

Change the imports at the top of `src/intent/plan-review-contract.test.ts` to this exact set, preserving the existing `assert`, `test`, `root`, and `read` declarations:

```ts
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
```

Immediately after `const read = ...`, add these helpers and tests:

```ts
const REVIEW_ARTIFACT_SCRIPT_START = "<!-- ocmm-review-artifact-identity-js:start -->"
const REVIEW_ARTIFACT_SCRIPT_END = "<!-- ocmm-review-artifact-identity-js:end -->"

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

function extractMarkedRegion(markdown: string, startMarker: string, endMarker: string): string {
  assert.equal(countOccurrences(markdown, startMarker), 1, `expected one ${startMarker}`)
  assert.equal(countOccurrences(markdown, endMarker), 1, `expected one ${endMarker}`)
  const start = markdown.indexOf(startMarker) + startMarker.length
  const end = markdown.indexOf(endMarker, start)
  assert.ok(end > start, `${endMarker} must follow ${startMarker}`)
  return markdown.slice(start, end).trim()
}

function extractCanonicalReviewArtifactScript(markdown: string): string {
  const region = extractMarkedRegion(markdown, REVIEW_ARTIFACT_SCRIPT_START, REVIEW_ARTIFACT_SCRIPT_END)
  const match = region.match(/^```js\r?\n([\s\S]*?)\r?\n```$/)
  assert.ok(match, "canonical review artifact region must contain exactly one JavaScript fence")
  return match[1]!
}

function runFixtureGit(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}

function computeFixtureIdentity(cwd: string, script: string): string {
  return execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

test("review artifact identity contract binds packets, receipts, and shell wrappers", () => {
  const requesting = read("skills", "v1", "requesting-code-review", "SKILL.md")
  const reviewer = read("skills", "v1", "requesting-code-review", "code-reviewer.md")
  const subagent = read("skills", "v1", "subagent-driven-development", "SKILL.md")
  const canonicalScript = extractCanonicalReviewArtifactScript(requesting)

  assert.match(requesting, /committed-range:BASE_SHA=<40-or-64-hex>;HEAD_SHA=<40-or-64-hex>/)
  assert.match(requesting, /sha256:<64-lowercase-hex>/)
  assert.match(canonicalScript, /record\("head", runGit\("rev-parse", "HEAD"\)\)/)
  assert.match(canonicalScript, /record\("tracked-diff", runGit\("diff", "--binary", "--no-ext-diff", "HEAD", "--"\)\)/)
  assert.match(canonicalScript, /sort\(Buffer\.compare\)/)
  assert.match(canonicalScript, /stat\.isSymbolicLink\(\)[\s\S]*readlinkSync/)
  assert.match(canonicalScript, /process\.stdout\.write\(`sha256:\$\{hash\.digest\("hex"\)\}\\n`\)/)

  const packetFields = [
    "ARTIFACT_KIND",
    "ARTIFACT_IDENTITY",
    "DESCRIPTION",
    "PLAN_OR_REQUIREMENTS",
    "REVIEW_INPUT",
    "VERIFICATION_EVIDENCE",
    "GLOBAL_CONSTRAINTS",
  ] as const
  const packetPattern = new RegExp(packetFields.map((field) => `${field}:`).join("[\\s\\S]*"))
  assert.match(extractMarkedRegion(requesting, "<!-- ocmm-review-artifact-packet:start -->", "<!-- ocmm-review-artifact-packet:end -->"), packetPattern)
  for (const field of packetFields) assert.match(reviewer, new RegExp(`\\{${field}\\}`), field)

  const receiptPattern = /role\/profile lane[\s\S]*task_id or session receipt[\s\S]*artifact identity[\s\S]*verdict[\s\S]*report artifact\/source/i
  assert.match(requesting, receiptPattern)
  assert.match(reviewer, receiptPattern)
  assert.match(subagent, receiptPattern)

  assert.match(requesting, /parent recomputes the current artifact identity before accepting each verdict/i)
  assert.match(requesting, /missing.*mismatch.*drift.*\[evidence\]/is)
  assert.match(requesting, /Never recreate or reconstruct a missing receipt from memory/i)
  assert.match(requesting, /continue the same `task_id` or session receipt/i)
  assert.match(requesting, /There is no new durable ledger, review runtime, or hash CLI/i)
  assert.doesNotMatch(requesting, /implementation subagents? (?:must|required to) (?:commit|stage)/i)

  const bash = extractMarkedRegion(requesting, "<!-- ocmm-review-artifact-bash:start -->", "<!-- ocmm-review-artifact-bash:end -->")
  const powershell = extractMarkedRegion(requesting, "<!-- ocmm-review-artifact-powershell:start -->", "<!-- ocmm-review-artifact-powershell:end -->")
  for (const wrapper of [bash, powershell]) {
    assert.match(wrapper, /ocmm-review-artifact-identity-js:start/)
    assert.match(wrapper, /ocmm-review-artifact-identity-js:end/)
    assert.doesNotMatch(wrapper, /createHash|record\("tracked-diff"/, "wrapper duplicated canonical algorithm")
  }
  assert.match(bash, /<<'NODE'/)
  assert.match(bash, /\$\(/)
  assert.match(bash, /\|\| exit \$\?/)
  assert.doesNotMatch(bash, /\$LASTEXITCODE|@'/)
  assert.match(powershell, /@'/)
  assert.match(powershell, /\$LASTEXITCODE/)
  assert.match(powershell, /throw "canonical artifact identity/)
  assert.doesNotMatch(powershell, /cat <<|\|\| exit|printf '%s|artifact_identity=/)

  assert.match(reviewer, /echo the received `ARTIFACT_IDENTITY`/i)
  assert.match(reviewer, /missing.*mismatch.*drift.*no approval/is)
  assert.match(reviewer, /Do not re-run tests/i)
  assert.match(subagent, /capture the same packet once for all deliberately selected lanes/i)
  assert.match(subagent, /new packet and a new artifact identity/i)
  assert.match(subagent, /same reviewer task IDs/i)
  assert.match(subagent, /one common current identity/i)
})

test("canonical review artifact identity tracks the complete disposable repository state", () => {
  const requesting = read("skills", "v1", "requesting-code-review", "SKILL.md")
  const script = extractCanonicalReviewArtifactScript(requesting)
  const fixture = mkdtempSync(join(tmpdir(), "ocmm-review-artifact-"))
  const trackedPath = join(fixture, "tracked.txt")
  const untrackedPath = join(fixture, "untracked.bin")
  const ignoredPath = join(fixture, "ignored.txt")
  const symlinkPath = join(fixture, "untracked-link")

  try {
    runFixtureGit(fixture, "init", "--initial-branch=main")
    runFixtureGit(fixture, "config", "user.name", "OCMM Fixture")
    runFixtureGit(fixture, "config", "user.email", "fixture@example.invalid")
    writeFileSync(trackedPath, "base\n")
    writeFileSync(join(fixture, ".gitignore"), "ignored.txt\n")
    runFixtureGit(fixture, "add", "tracked.txt", ".gitignore")
    runFixtureGit(fixture, "commit", "--quiet", "-m", "baseline")

    const baseline = computeFixtureIdentity(fixture, script)
    assert.match(baseline, /^sha256:[0-9a-f]{64}$/)
    assert.equal(computeFixtureIdentity(fixture, script), baseline, "unchanged snapshot must be stable")

    writeFileSync(trackedPath, "tracked edit\n")
    assert.notEqual(computeFixtureIdentity(fixture, script), baseline, "tracked edit must change identity")
    writeFileSync(trackedPath, "base\n")
    assert.equal(computeFixtureIdentity(fixture, script), baseline, "tracked revert must restore baseline")

    writeFileSync(trackedPath, "staged state\n")
    runFixtureGit(fixture, "add", "tracked.txt")
    const stagedOnly = computeFixtureIdentity(fixture, script)
    writeFileSync(trackedPath, "staged state\nunstaged final state\n")
    const stagedAndUnstaged = computeFixtureIdentity(fixture, script)
    assert.notEqual(stagedAndUnstaged, stagedOnly, "unstaged final bytes must be represented with staged bytes")
    assert.notEqual(stagedAndUnstaged, baseline)
    runFixtureGit(fixture, "reset", "--quiet", "HEAD", "--", "tracked.txt")
    writeFileSync(trackedPath, "base\n")
    assert.equal(computeFixtureIdentity(fixture, script), baseline, "mixed tracked revert must restore baseline")

    writeFileSync(untrackedPath, Buffer.from([0, 1, 2, 3]))
    const untrackedAdded = computeFixtureIdentity(fixture, script)
    assert.notEqual(untrackedAdded, baseline, "untracked add must change identity")
    writeFileSync(untrackedPath, Buffer.from([0, 1, 2, 4]))
    const untrackedChanged = computeFixtureIdentity(fixture, script)
    assert.notEqual(untrackedChanged, untrackedAdded, "untracked byte change must change identity")
    rmSync(untrackedPath)
    assert.equal(computeFixtureIdentity(fixture, script), baseline, "untracked removal must restore baseline")

    writeFileSync(ignoredPath, "ignored one\n")
    assert.equal(computeFixtureIdentity(fixture, script), baseline, "ignored add must not change identity")
    writeFileSync(ignoredPath, "ignored two\n")
    assert.equal(computeFixtureIdentity(fixture, script), baseline, "ignored edit must not change identity")
    rmSync(ignoredPath)

    try {
      symlinkSync("target-a", symlinkPath)
      const symlinkA = computeFixtureIdentity(fixture, script)
      rmSync(symlinkPath)
      symlinkSync("target-b", symlinkPath)
      const symlinkB = computeFixtureIdentity(fixture, script)
      assert.notEqual(symlinkA, symlinkB, "untracked symlink target bytes must change identity")
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      assert.ok(["EPERM", "EACCES", "ENOSYS", "ENOTSUP"].includes(code ?? ""), `unexpected symlink failure: ${code}`)
      assert.match(script, /stat\.isSymbolicLink\(\)[\s\S]*readlinkSync\(path, \{ encoding: "buffer" \}\)/)
    } finally {
      rmSync(symlinkPath, { force: true })
    }

    assert.equal(computeFixtureIdentity(fixture, script), baseline, "full fixture revert must restore baseline")
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
```

This test performs `git init`, local `git config`, `git add`, `git commit`, and `git reset` only inside its unique OS-temp fixture. It never reads or changes global Git configuration and always removes the fixture.

- [ ] **Step 3: Add the failing loaded-prompt mandate test without disturbing Project 4's test**

Immediately after `test("orchestrator prompts describe code review as review-input based", ...)` in `src/intent/prompt-loader.test.ts`, append this complete test. Do not edit the existing Project 4 `GPT run contract defines bounded tracking and parent stop ownership` test.

```ts
test("orchestrator prompts load the concise identity-bound review mandate", () => {
  const mandate = "Final implementation acceptance must load and follow the applicable identity-bound requesting-code-review skill. The orchestrator owns artifact-identity recomputation, one common packet for selected lanes, stale-verdict rejection, and completion only when every required receipt has the same current identity."

  for (const workflow of ["omo", "v1"] as const) {
    loadAllPrompts(join(process.cwd(), "prompts"), workflow)
    const loaded = getAgentPrompt("orchestrator")
    assert.equal(countOccurrences(loaded, mandate), 1, `${workflow}: loaded mandate count`)
  }

  for (const workflow of ["omo", "v1", "codex"] as const) {
    const source = readFileSync(join(process.cwd(), "prompts", workflow, "agents", "orchestrator.md"), "utf8")
    assert.equal(countOccurrences(source, mandate), 1, `${workflow}: source mandate count`)
    assert.doesNotMatch(source, /ocmm-review-artifact-identity-js|createHash|tracked-diff/, `${workflow}: algorithm leaked into orchestrator`)
    assert.doesNotMatch(source, /identity-bound v1 review/i, `${workflow}: visible version wording`)
  }
})
```

In the existing `test("v1 implementer template and maintenance docs record flat workflow ownership", ...)`, replace only the five stale review-input assertions at the current lines 665-669:

```ts
  assert.match(requestingReview, /For uncommitted work, compute exactly `sha256:<64-lowercase-hex>`/i)
  assert.match(requestingReview, /git diff --binary --no-ext-diff HEAD --/)
  assert.match(requestingReview, /ARTIFACT_KIND:[\s\S]*ARTIFACT_IDENTITY:[\s\S]*GLOBAL_CONSTRAINTS:/)
  assert.match(requestingReview, /Do not require implementation subagents to commit/i)
  assert.doesNotMatch(requestingReview, /git diff --stat\s+git diff/s)
  assert.match(reviewerTemplate, /## Identity-Bound Review Packet/)
  assert.match(reviewerTemplate, /\{ARTIFACT_KIND\}[\s\S]*\{ARTIFACT_IDENTITY\}[\s\S]*\{GLOBAL_CONSTRAINTS\}/)
  assert.match(reviewerTemplate, /### Artifact Identity Echo/)
  assert.match(reviewerTemplate, /### Review Receipt/)
  assert.doesNotMatch(reviewerTemplate, /## Git Range or Working-Tree Diff to Review/)
```

Do not change any assertion after this replacement or any Project 4 GPT run-contract test. The Task 1 GREEN command below selects both `review-input based` and the new mandate test, so this stale-contract migration is exercised before Task 1 closes.

- [ ] **Step 4: Run the new targeted tests and verify RED**

Run each command independently:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="review artifact identity|canonical review artifact identity" src/intent/plan-review-contract.test.ts
if ($LASTEXITCODE -eq 0) { throw "review artifact tests unexpectedly passed before source implementation" }
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="concise identity-bound review mandate" src/intent/prompt-loader.test.ts
if ($LASTEXITCODE -eq 0) { throw "orchestrator mandate test unexpectedly passed before prompt implementation" }
```

Expected: the first command fails because `ocmm-review-artifact-identity-js:start` is absent; the second fails with loaded mandate count `0`. No unrelated selected test fails.

- [ ] **Step 5: Replace the requesting skill's old review-input section with the complete identity contract**

In `skills/v1/requesting-code-review/SKILL.md`, preserve frontmatter, Reviewer Selection, and Red Flags. Replace the current `## How to Request` section through the feedback-classification paragraph immediately before `## Reviewer Selection` with this exact block. Also append `2026-07-29 identity-bound artifact packets, canonical working-tree hashing, drift rejection, and five-field receipts` to the existing top adjustment comment without changing its prior text.

````markdown
## How to Request

### 1. Choose the artifact kind and compute its identity

`ARTIFACT_KIND` is exactly `committed-range` or `working-tree`. `ARTIFACT_IDENTITY` is mandatory and opaque: equality proves that the reviewed product bytes are the same, not that tests or review judgment are correct.

Use a committed range only when an orchestrator-owned, user-authorized commit already exists. Resolve both endpoints to full hashes and retain both values:

```text
committed-range:BASE_SHA=<40-or-64-hex>;HEAD_SHA=<40-or-64-hex>
```

**Bash committed-range example:**

```bash
base_ref='origin/main'
head_ref='HEAD'
base_sha="$(git rev-parse "$base_ref")" || exit $?
head_sha="$(git rev-parse "$head_ref")" || exit $?
if [[ ! "$base_sha" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]] || [[ ! "$head_sha" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]]; then
  printf '%s\n' 'git returned a non-full commit identity' >&2
  exit 1
fi
artifact_kind='committed-range'
artifact_identity="committed-range:BASE_SHA=$base_sha;HEAD_SHA=$head_sha"
git diff --binary --no-ext-diff "$base_sha..$head_sha" -- || exit $?
printf '%s\n' "$artifact_identity"
```

**PowerShell committed-range example:**

```powershell
$baseRef = "origin/main"
$headRef = "HEAD"
$baseSha = git rev-parse $baseRef
if ($LASTEXITCODE -ne 0) { throw "git rev-parse failed for $baseRef" }
$headSha = git rev-parse $headRef
if ($LASTEXITCODE -ne 0) { throw "git rev-parse failed for $headRef" }
if ($baseSha -notmatch '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' -or $headSha -notmatch '^(?:[0-9a-f]{40}|[0-9a-f]{64})$') {
  throw "git returned a non-full commit identity"
}
$artifactKind = "committed-range"
$artifactIdentity = "committed-range:BASE_SHA=$baseSha;HEAD_SHA=$headSha"
$range = "$baseSha..$headSha"
git diff --binary --no-ext-diff $range --
if ($LASTEXITCODE -ne 0) { throw "git diff failed for $range" }
$artifactIdentity
```

For uncommitted work, compute exactly `sha256:<64-lowercase-hex>` from the current HEAD, the one combined binary tracked diff, and every bytewise-sorted non-ignored untracked final-state entry. Node is already a host dependency; do not install anything.

The following marker-delimited Node ES module is the single canonical algorithm. Domain records are NUL-delimited and length-framed. Git paths remain raw bytes and use `Buffer.compare`, never locale ordering.

<!-- ocmm-review-artifact-identity-js:start -->
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
<!-- ocmm-review-artifact-identity-js:end -->

`git diff --binary --no-ext-diff HEAD --` is deliberately one record: it represents the final combined staged and unstaged state of every tracked path. The untracked set excludes ignored files. Regular files contribute their bytes; symbolic links contribute target bytes and are never followed. A Git failure, malformed NUL list, unreadable entry, unsupported entry type, or Node failure closes the review gate without an identity. The algorithm does not stage, commit, create an index, write a Git object, or mutate the worktree.

Both wrappers below extract the exact canonical fenced body from the active skill copy and execute it. The repository-source path is shown; when using an installed generated skill, set only the skill path to that installed `SKILL.md`.

<!-- ocmm-review-artifact-bash:start -->
**Bash working-tree example:**

```bash
skill_path='skills/v1/requesting-code-review/SKILL.md'
canonical_js="$(
  node --input-type=module - "$skill_path" <<'NODE'
import { readFileSync } from "node:fs";
const markdown = readFileSync(process.argv[2], "utf8");
const startMarker = "<!-- ocmm-review-artifact-identity-js:start -->";
const endMarker = "<!-- ocmm-review-artifact-identity-js:end -->";
if (markdown.split(startMarker).length !== 2 || markdown.split(endMarker).length !== 2) throw new Error("canonical artifact identity markers are missing or duplicated");
const start = markdown.indexOf(startMarker) + startMarker.length;
const end = markdown.indexOf(endMarker, start);
const match = markdown.slice(start, end).trim().match(/^```js\r?\n([\s\S]*?)\r?\n```$/);
if (!match) throw new Error("canonical artifact identity JavaScript fence is malformed");
process.stdout.write(match[1]);
NODE
)" || exit $?
artifact_identity="$(node --input-type=module -e "$canonical_js")" || exit $?
if [[ ! "$artifact_identity" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  printf '%s\n' 'canonical artifact identity output was malformed' >&2
  exit 1
fi
printf '%s\n' "$artifact_identity"
```
<!-- ocmm-review-artifact-bash:end -->

<!-- ocmm-review-artifact-powershell:start -->
**PowerShell working-tree example:**

```powershell
$skillPath = "skills/v1/requesting-code-review/SKILL.md"
$extractor = @'
import { readFileSync } from "node:fs";
const markdown = readFileSync(process.argv[2], "utf8");
const startMarker = "<!-- ocmm-review-artifact-identity-js:start -->";
const endMarker = "<!-- ocmm-review-artifact-identity-js:end -->";
if (markdown.split(startMarker).length !== 2 || markdown.split(endMarker).length !== 2) throw new Error("canonical artifact identity markers are missing or duplicated");
const start = markdown.indexOf(startMarker) + startMarker.length;
const end = markdown.indexOf(endMarker, start);
const match = markdown.slice(start, end).trim().match(/^```js\r?\n([\s\S]*?)\r?\n```$/);
if (!match) throw new Error("canonical artifact identity JavaScript fence is malformed");
process.stdout.write(match[1]);
'@
$canonicalJs = @($extractor | node --input-type=module - $skillPath)
if ($LASTEXITCODE -ne 0) { throw "canonical artifact identity extraction failed" }
$canonicalJs = $canonicalJs -join "`n"
$artifactIdentity = node --input-type=module -e $canonicalJs
if ($LASTEXITCODE -ne 0) { throw "canonical artifact identity computation failed" }
if ($artifactIdentity -notmatch '^sha256:[0-9a-f]{64}$') { throw "canonical artifact identity output was malformed" }
$artifactIdentity
```
<!-- ocmm-review-artifact-powershell:end -->

### 2. Capture one identity-bound packet

Immediately before dispatch, recompute the identity and capture one packet. Every deliberately selected lane receives byte-for-byte equivalent packet content except its intended role/profile designation.

<!-- ocmm-review-artifact-packet:start -->
```text
ARTIFACT_KIND: committed-range | working-tree
ARTIFACT_IDENTITY: identity produced by the contract above
DESCRIPTION: implemented change summary
PLAN_OR_REQUIREMENTS: exact plan path or supplied requirements
REVIEW_INPUT: exact committed range, or current binary tracked diff plus sorted non-ignored untracked manifest and commands
VERIFICATION_EVIDENCE: command, concise result, sanitized artifact/report source, and this artifact identity for every captured proof
GLOBAL_CONSTRAINTS: verbatim task constraints
```
<!-- ocmm-review-artifact-packet:end -->

For `working-tree`, `REVIEW_INPUT` contains `git diff --binary --no-ext-diff HEAD --` output and the sorted untracked manifest with `file` or `symlink` types. Do not paste raw secret-bearing logs; cite a sanitized report path or digest when raw output is unsafe or too large. Evidence captured for one identity cannot be relabeled after an edit.

### 3. Dispatch only the deliberately selected review lanes

Use the current callable reviewer/Oracle profile selected by the policy below and fill every placeholder in `code-reviewer.md`. Do not add lanes merely because the packet changed. Reviewers evaluate the supplied tests and reports; they do not re-run tests already executed by the implementer.

### 4. Validate each result and preserve an exact receipt

Before quality review, each lane echoes `ARTIFACT_IDENTITY` and verifies or recomputes the declared input. Missing identity, mismatch, missing required packet or receipt fields, and drift are `[evidence]` blockers and return no approval.

When a lane returns, the parent recomputes the current artifact identity before accepting each verdict. A different identity makes that verdict stale. Fixes continue the same `task_id` or session receipt under the existing review-efficiency policy, but every changed artifact receives a new packet and identity; rerun affected evidence and the required final pass before acceptance.

Every accepted lane receipt records exactly:

```text
role/profile lane
task_id or session receipt
artifact identity
verdict
report artifact/source
```

Final acceptance requires every deliberately selected lane to approve one common current identity. There is no new durable ledger, review runtime, or hash CLI. If compaction or continuation loses an exact receipt and it cannot be re-read from the task result, current notepad, or report artifact, the receipt is absent. Never recreate or reconstruct a missing receipt from memory; re-review the current identity.

Do not require implementation subagents to commit, stage, or push merely to create review evidence. The orchestrator owns any project-repository Git write and performs it only after explicit user authorization.

**Feedback classification:** Review findings may be labeled `[product]` (a product behavior or implementation defect) or `[evidence]` (missing, stale, mismatched, or insufficient proof). Add evidence for an `[evidence]` finding; change product behavior only when the evidence reveals a real defect.
````

Replace the complete existing `## Example` section between Reviewer Selection and `## Red Flags` with this identity-complete example:

````markdown
## Example

```text
[All implementation tasks complete: Add verification and repair workflow]

ARTIFACT_KIND: working-tree
ARTIFACT_IDENTITY: sha256:0000000000000000000000000000000000000000000000000000000000000000
DESCRIPTION: Added verifyIndex() and repairIndex() with four issue types.
PLAN_OR_REQUIREMENTS: docs/superpowers/plans/deployment-plan.md
REVIEW_INPUT: binary diff and typed untracked-manifest artifacts in the approved OS-temp evidence directory, with their SHA-256 digests and capture commands
VERIFICATION_EVIDENCE: targeted and full-suite results with sanitized report sources, stamped with the same example identity
GLOBAL_CONSTRAINTS: no schema change; no implementation-subagent Git writes; preserve existing public behavior

[Dispatch the deliberately selected review lanes with the same packet.]

[One lane returns this exact receipt shape:]
role/profile lane: oracle
task_id or session receipt: ses_example
artifact identity: sha256:0000000000000000000000000000000000000000000000000000000000000000
verdict: rejected
report artifact/source: task result ses_example

[Fix the finding, recompute identity, rerun affected evidence and the required final pass, then continue the same lane task_id with the new packet.]
```
````

The example must contain all seven packet fields and all five receipt fields. Remove the old three-field `DESCRIPTION` / `PLAN_OR_REQUIREMENTS` / `REVIEW_INPUT` dispatch and the old raw `git diff --stat` sequence rather than leaving two competing examples.

- [ ] **Step 6: Make the reviewer template identity-gated and receipt-complete**

In `skills/v1/requesting-code-review/code-reviewer.md`, replace the prompt content from `## What Was Implemented` through the paragraph before `## What to Check` with this exact block:

````markdown
    <!-- ocmm-review-artifact-reviewer-template:start -->
    ## Identity-Bound Review Packet

    ```text
    ARTIFACT_KIND: {ARTIFACT_KIND}
    ARTIFACT_IDENTITY: {ARTIFACT_IDENTITY}
    DESCRIPTION: {DESCRIPTION}
    PLAN_OR_REQUIREMENTS: {PLAN_OR_REQUIREMENTS}
    REVIEW_INPUT: {REVIEW_INPUT}
    VERIFICATION_EVIDENCE: {VERIFICATION_EVIDENCE}
    GLOBAL_CONSTRAINTS: {GLOBAL_CONSTRAINTS}
    ```

    Before examining quality, echo the received `ARTIFACT_IDENTITY` and recompute or otherwise verify it from `REVIEW_INPUT`. If any packet field or receipt field is missing, the identity is missing or mismatched, or the artifact drifted, report a Critical `[evidence]` blocker, set **Ready to merge?** to **No**, and return no approval for this packet.

    For a committed range, inspect the provided full base/head pair and binary diff. For working-tree review, inspect the supplied combined `git diff --binary --no-ext-diff HEAD --` output and sorted non-ignored untracked manifest. Ask the orchestrator for missing evidence; never ask an implementation subagent to commit or stage.

    Do not re-run tests. Evaluate the supplied `VERIFICATION_EVIDENCE`, its report source, and its artifact-identity stamp. A passing test claim is not established by hash equality alone.
    <!-- ocmm-review-artifact-reviewer-template:end -->
````

Immediately before `### Strengths` in the Output Format, add:

```markdown
    ### Artifact Identity Echo

    **ARTIFACT_IDENTITY:** [echo the exact received value]
    **Identity verification:** [matched | blocked as evidence]
```

Immediately after the Assessment reasoning line, add this exact receipt block:

```markdown
    ### Review Receipt

    ```text
    role/profile lane: exact selected lane
    task_id or session receipt: exact current task/session receipt
    artifact identity: exact echoed ARTIFACT_IDENTITY
    verdict: approved or rejected
    report artifact/source: exact task result, notepad, or report source
    ```
```

Replace the bottom Placeholders list and Reviewer-returns sentence with:

```markdown
**Placeholders:**
- `{ARTIFACT_KIND}` — exactly `committed-range` or `working-tree`
- `{ARTIFACT_IDENTITY}` — full committed endpoint pair or lowercase `sha256:<64hex>`
- `{DESCRIPTION}` — brief summary of what was built
- `{PLAN_OR_REQUIREMENTS}` — exact plan path, task text, or requirements
- `{REVIEW_INPUT}` — full committed range and commands, or binary tracked diff plus sorted untracked manifest
- `{VERIFICATION_EVIDENCE}` — command/result/source evidence stamped with this identity
- `{GLOBAL_CONSTRAINTS}` — verbatim task constraints

**Reviewer returns:** Artifact Identity Echo, Strengths, Issues (Critical / Important / Minor), Recommendations, Assessment, and the exact five-field Review Receipt. A mismatch or drift returns no approval.
```

Replace the existing `## Example Output` section through end of file with this identity-complete output example:

````markdown
## Example Output

### Artifact Identity Echo

**ARTIFACT_IDENTITY:** sha256:0000000000000000000000000000000000000000000000000000000000000000
**Identity verification:** matched

### Strengths
- The implementation matches the supplied plan and carries focused regression evidence.

### Issues

#### Important
1. **Missing help text in CLI wrapper**
   - File: `index-conversations:1-31`
   - Issue: no `--help` case exposes the supported concurrency option.
   - Fix: add the documented help case and its focused test.

### Recommendations
- Address the Important finding, then refresh affected evidence and the final identity-bound packet.

### Assessment

**Ready to merge?** No

**Reasoning:** The supplied artifact is readable and identity-matched, but the Important product finding blocks acceptance.

### Review Receipt

```text
role/profile lane: oracle
task_id or session receipt: ses_example
artifact identity: sha256:0000000000000000000000000000000000000000000000000000000000000000
verdict: rejected
report artifact/source: task result ses_example
```
````

Extend the Task 1 source-contract test after the existing receipt assertions with:

```ts
  const skillExample = requesting.slice(requesting.indexOf("## Example"), requesting.indexOf("## Red Flags"))
  assert.match(skillExample, packetPattern)
  assert.match(skillExample, receiptPattern)
  assert.doesNotMatch(skillExample, /git diff --stat\s+git diff/s)
  const reviewerExample = reviewer.slice(reviewer.indexOf("## Example Output"))
  assert.match(reviewerExample, /### Artifact Identity Echo/)
  assert.match(reviewerExample, receiptPattern)
```

This prevents either legacy incomplete example from surviving the migration.

- [ ] **Step 7: Make final acceptance capture one packet and converge on one identity**

In `skills/v1/subagent-driven-development/SKILL.md`, keep the existing selection table unchanged. Replace Final Acceptance Review steps 2 and 3 (from `**2. Dispatch the acceptance review:**` through the current feedback bullets) with this complete block:

````markdown
<!-- ocmm-review-artifact-final-acceptance:start -->
**2. Capture one identity-bound packet and dispatch the selected lanes:**

Load the `requesting-code-review` skill and follow its canonical committed-range or working-tree identity procedure. Recompute immediately before dispatch, then capture the same packet once for all deliberately selected lanes. The seven packet fields are:

```text
ARTIFACT_KIND
ARTIFACT_IDENTITY
DESCRIPTION
PLAN_OR_REQUIREMENTS
REVIEW_INPUT
VERIFICATION_EVIDENCE
GLOBAL_CONSTRAINTS
```

For baseline dispatch, use the selected first available Oracle and add `reviewer` only when the complexity table says so. Every selected lane receives byte-for-byte equivalent packet content except its intended role/profile designation. Do not add a later Oracle merely because identity changed.

Each returned receipt records exactly:

```text
role/profile lane
task_id or session receipt
artifact identity
verdict
report artifact/source
```

The parent recomputes identity after every lane returns. Missing identity, missing receipt fields, mismatch, or drift is an `[evidence]` blocker and cannot approve. Never recreate a missing receipt from conversation memory.

**3. Process feedback and converge on one current identity:**

- Use the `receiving-code-review` skill to verify every finding.
- Send all Critical/Important fixes through one fix subagent. If the artifact changes, issue a new packet and a new artifact identity.
- Continue the same reviewer task IDs under the existing review-session efficiency policy; do not replace lanes or create new reviewer identities solely because fixes changed bytes.
- Rerun evidence affected by the fix and then the existing required final pass. Stamp new evidence with the new identity; never relabel earlier output.
- Recompute identity before accepting each continued verdict. A verdict for an older identity remains stale even when its task ID is current.
- Only declare completion when all deliberately selected lane receipts have all five fields, approve one common current identity, and cite re-readable report sources.

No implementation subagent commits, stages, or pushes for this flow, and no durable ledger or review runtime is created.
<!-- ocmm-review-artifact-final-acceptance:end -->
````

- [ ] **Step 8: Add the same concise mandate to all three orchestrator sources**

In each of these files, insert the exact sentence below immediately after the existing reviewer/Oracle tier-selection paragraph in `## Workflow-Agent Composition Ownership` and before `### Planning logical-tier selection`:

- `prompts/omo/agents/orchestrator.md`
- `prompts/v1/agents/orchestrator.md`
- `prompts/codex/agents/orchestrator.md`

```markdown
Final implementation acceptance must load and follow the applicable identity-bound requesting-code-review skill. The orchestrator owns artifact-identity recomputation, one common packet for selected lanes, stale-verdict rejection, and completion only when every required receipt has the same current identity.
```

Do not add algorithm details, packet field lists, shell commands, hashes, or a visible workflow-version label to these prompts.

- [ ] **Step 9: Update governed mapping rows and append exact Project 5 provenance**

Make only append-style Project 5 documentation changes; retain the existing Project 4 sections byte-for-byte.

In `docs/prompt-sync.md`, append this sentence to the `orchestrator` Local adaptation cell in the Functional Agent Mapping table:

```markdown
**2026-07-29 review-artifact adaptation:** final implementation acceptance loads the identity-bound requesting-code-review skill; the orchestrator owns recomputation, common selected-lane packets, stale-verdict rejection, and common-current-identity completion, while prompt sources do not duplicate the algorithm.
```

Then insert this complete section immediately after `## Project 4 Prompt and Shared-Skill Sync (2026-07-29)` and its bullets:

```markdown
## Project 5 Review Artifact Identity (2026-07-29)

- Reviewed upstream evidence-staleness and review-loop work at exact commits `1cc0be6c49269e1e7d85bd78e8af9cb7b6e430b4`, `ab0411bb7bbb805613e48724740a976ed263af8d`, `bf5f9d6a208c6fb483272d68f74a56418b488af6`, `ba0383d7bdee6755dcf6e7b50c6288978b3df229`, and `f2ae890b66de54f926befe674b363b616e93107c`.
- `prompts/{omo,v1,codex}/agents/orchestrator.md` carry one aligned, concise trigger and ownership mandate. The canonical algorithm, shell examples, packet fields, evidence stamping, drift rules, and receipts remain owned by `skills/v1/requesting-code-review/` and its generated Codex copy.
- The bounded local adaptation supports either a full committed base/head pair or an uncommitted content-addressed working-tree snapshot. It preserves local no-Git-write, selected-lane, changed-input, same-task continuation, review-effort, and no-extra-fan-out policies.
- Upstream commit-oriented loop state is not copied wholesale: ocmm adds no `.omo/*` ledger, `ledger.jsonl`, hash CLI, schema, MCP, review runtime, automatic commit, staging requirement, or production generator change. Missing receipts are re-reviewed, never reconstructed from memory.
```

In `docs/v1-maintenance.md`:

1. Append this exact bold clause to the Adjustments cell for `requesting-code-review` and set its Last synced date to `2026-07-29`:

```markdown
**2026-07-29 review-artifact adaptation:** one marker-delimited canonical Node SHA-256 body covers dirty snapshots; shell-specific wrappers execute that body; committed ranges use full endpoint pairs; seven-field packets, identity-stamped evidence, parent drift checks, and five-field receipts fail closed without a runtime ledger or Git-write requirement.
```

2. Append this exact bold clause to the Adjustments cell for `subagent-driven-development` and set its Last synced date to `2026-07-29`:

```markdown
**2026-07-29 review-artifact adaptation:** capture one common packet for selected lanes, continue the same reviewer task IDs after fixes with a new identity, and finish only when all required five-field receipts approve one common current identity.
```

3. Append this sentence to the `requesting-code-review/code-reviewer.md` Adjustments cell in Skill Template Files:

```markdown
**2026-07-29:** adds all seven packet placeholders, identity echo/verification, no-test-rerun evaluation, mismatch/drift no-approval behavior, and the exact five-field receipt.
```

4. Append this sentence to the `agents/orchestrator.md` Adapted for v1 cell in Prompt Source Mapping:

```markdown
**2026-07-29:** adds only the concise identity-bound requesting-code-review trigger and orchestrator ownership; algorithm detail remains in the skill and no model-visible version wording is introduced.
```

5. Insert this section immediately after `## Project 4 GPT Prompt Sync (2026-07-29)` and its bullets:

```markdown
## Project 5 Review Artifact Identity (2026-07-29)

- Reviewed exact upstream commits `1cc0be6c49269e1e7d85bd78e8af9cb7b6e430b4`, `ab0411bb7bbb805613e48724740a976ed263af8d`, `bf5f9d6a208c6fb483272d68f74a56418b488af6`, `ba0383d7bdee6755dcf6e7b50c6288978b3df229`, and `f2ae890b66de54f926befe674b363b616e93107c` for stale-evidence and review-loop guarantees.
- `skills/v1/requesting-code-review/{SKILL.md,code-reviewer.md}`, `skills/v1/subagent-driven-development/SKILL.md`, and the skill-driven/Codex orchestrator sources implement a bounded local contract: full committed endpoint pairs or a canonical content-addressed working tree, one selected-lane packet, identity verification, parent recomputation, identity-stamped evidence, same-task fix continuation, and one common final identity.
- Generated Codex skills are normalized copies and generated orchestrator profiles carry only the concise mandate. The adaptation adds no durable ledger, `.omo/*` loop state, review runtime, CLI, schema, MCP, automatic Git write, commit/staging requirement, or production generator change.
```

- [ ] **Step 10: Run Task 1 GREEN tests and preserve Project 4 contracts**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="review artifact identity|canonical review artifact identity|review skills use ordered Oracle priority" src/intent/plan-review-contract.test.ts
if ($LASTEXITCODE -ne 0) { throw "source identity contract tests failed" }
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="concise identity-bound review mandate|review-input based|v1 implementer template and maintenance docs record flat workflow ownership|GPT run contract" src/intent/prompt-loader.test.ts
if ($LASTEXITCODE -ne 0) { throw "prompt mandate or preserved Project 4 tests failed" }
```

Expected: the disposable-repository test proves stable unchanged identity, tracked changes, staged-plus-unstaged final state, untracked add/change, ignored exclusion, revert-to-baseline, and symlink-target behavior or the allowed Windows static fallback. The prompt command passes the new mandate plus existing review-input and Project 4 run-contract tests.

- [ ] **Step 11: Close the Task 1 boundary without Git writes**

Run:

```powershell
$task1Paths = @(
  "src/intent/plan-review-contract.test.ts",
  "src/intent/prompt-loader.test.ts",
  "skills/v1/requesting-code-review/SKILL.md",
  "skills/v1/requesting-code-review/code-reviewer.md",
  "skills/v1/subagent-driven-development/SKILL.md",
  "prompts/omo/agents/orchestrator.md",
  "prompts/v1/agents/orchestrator.md",
  "prompts/codex/agents/orchestrator.md",
  "docs/prompt-sync.md",
  "docs/v1-maintenance.md"
)
git diff --check -- $task1Paths
if ($LASTEXITCODE -ne 0) { throw "Task 1 whitespace check failed" }
git diff --stat -- $task1Paths
git status --short
```

Expected: whitespace check exits 0; only the ten listed source/test/doc paths are inspected; Project 4 hunks and tests remain present; nothing is staged or committed.

---

### Task 2: Generated Codex contract TDD and deterministic regeneration

**Files:**
- Modify: `src/codex/plugin-generator.test.ts`
- Generate: `.codex/agents/dw-orchestrator.toml`
- Generate: `plugins/deepwork/agents/dw-orchestrator.toml`
- Generate: `plugins/deepwork/skills/deepwork-requesting-code-review/SKILL.md`
- Generate: `plugins/deepwork/skills/deepwork-requesting-code-review/code-reviewer.md`
- Generate: `plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md`
- Inspect only: `src/codex/plugin-generator.ts`

**Interfaces:**
- Consumes: Task 1's exact markers and concise mandate; existing `listRelativeFiles(...)`, `parseGeneratedDeveloperInstructions(...)`, `generateCodexPlugin(...)`, `CODEX_AGENT_PREFIX`, `CODEX_PLUGIN_DIR`, and normalized-skill compatibility suffix.
- Produces: `assertGeneratedV1SkillTree(name: string, temporaryPluginRoot: string): void`; test `Codex generated review identity contract mirrors source, temporary, tracked, and orchestrator surfaces`; deterministic sorted path/SHA-256/status/diff inventories for both generator passes.

- [ ] **Step 1: Add the normalized v1 skill-tree helper and failing generator contract test**

Immediately after the existing `assertGeneratedSharedSkillTree(...)` helper in `src/codex/plugin-generator.test.ts`, append:

```ts
function assertGeneratedV1SkillTree(name: string, temporaryPluginRoot: string): void {
  const sourceRoot = join(process.cwd(), "skills", "v1", name)
  const codexName = `deepwork-${name}`
  const temporaryRoot = join(temporaryPluginRoot, "skills", codexName)
  const trackedRoot = join(process.cwd(), CODEX_PLUGIN_DIR, "skills", codexName)
  const sourceFiles = listRelativeFiles(sourceRoot)
  const temporaryFiles = listRelativeFiles(temporaryRoot)
  const trackedFiles = listRelativeFiles(trackedRoot)

  assert.deepEqual(temporaryFiles, sourceFiles, `temporary ${codexName} inventory differs from source`)
  assert.deepEqual(trackedFiles, sourceFiles, `tracked ${codexName} inventory is stale`)

  for (const file of sourceFiles) {
    const source = readFileSync(join(sourceRoot, file))
    const temporary = readFileSync(join(temporaryRoot, file))
    const tracked = readFileSync(join(trackedRoot, file))
    assert.deepEqual(tracked, temporary, `tracked ${codexName}/${file} differs from fresh generation`)

    if (file === "SKILL.md") {
      const expectedPrefix = source
        .toString("utf8")
        .replace(/^name:\s*.+$/m, `name: ${codexName}`)
        .trimEnd()
      const temporaryText = temporary.toString("utf8")
      assert.ok(temporaryText.startsWith(`${expectedPrefix}\n\n## Codex Compatibility`), `${codexName} normalized source prefix drift`)
      assertCanonicalCodexDispatchContract(
        extractCallableDispatchContract(temporaryText, `${codexName} temporary skill`),
        `${codexName} temporary skill`,
      )
    } else {
      assert.deepEqual(temporary, source, `${codexName}/${file} must remain a byte-for-byte source copy`)
    }
  }
}

function extractReviewArtifactScript(text: string, label: string): string {
  const startMarker = "<!-- ocmm-review-artifact-identity-js:start -->"
  const endMarker = "<!-- ocmm-review-artifact-identity-js:end -->"
  assert.equal(countOccurrences(text, startMarker), 1, `${label}: canonical start marker count`)
  assert.equal(countOccurrences(text, endMarker), 1, `${label}: canonical end marker count`)
  const start = text.indexOf(startMarker) + startMarker.length
  const end = text.indexOf(endMarker, start)
  const match = text.slice(start, end).trim().match(/^```js\r?\n([\s\S]*?)\r?\n```$/)
  assert.ok(match, `${label}: malformed canonical JavaScript fence`)
  return match[1]!
}
```

Append this test immediately after the existing Project 4 `Codex generated debugging and frontend skill trees mirror source inventory and bytes` test, leaving that test unchanged:

```ts
test("Codex generated review identity contract mirrors source, temporary, tracked, and orchestrator surfaces", async () => {
  const root = mkdtempSync(join(tmpdir(), "deepwork-codex-review-identity-"))
  try {
    const result = await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, CODEX_PROJECT_AGENTS_DIR),
      config: { ...defaultConfig(), workflow: "codex" },
      packageVersion: "9.9.9",
    })

    assertGeneratedV1SkillTree("requesting-code-review", result.pluginRoot)
    assertGeneratedV1SkillTree("subagent-driven-development", result.pluginRoot)

    const sourceRequesting = readFileSync(join(process.cwd(), "skills", "v1", "requesting-code-review", "SKILL.md"), "utf8")
    const temporaryRequesting = readFileSync(join(result.pluginRoot, "skills", "deepwork-requesting-code-review", "SKILL.md"), "utf8")
    const trackedRequesting = readFileSync(join(process.cwd(), CODEX_PLUGIN_DIR, "skills", "deepwork-requesting-code-review", "SKILL.md"), "utf8")
    const sourceTemplate = readFileSync(join(process.cwd(), "skills", "v1", "requesting-code-review", "code-reviewer.md"))
    const temporaryTemplate = readFileSync(join(result.pluginRoot, "skills", "deepwork-requesting-code-review", "code-reviewer.md"))
    const trackedTemplate = readFileSync(join(process.cwd(), CODEX_PLUGIN_DIR, "skills", "deepwork-requesting-code-review", "code-reviewer.md"))
    const temporarySubagent = readFileSync(join(result.pluginRoot, "skills", "deepwork-subagent-driven-development", "SKILL.md"), "utf8")
    const trackedSubagent = readFileSync(join(process.cwd(), CODEX_PLUGIN_DIR, "skills", "deepwork-subagent-driven-development", "SKILL.md"), "utf8")

    assert.equal(extractReviewArtifactScript(temporaryRequesting, "temporary requesting skill"), extractReviewArtifactScript(sourceRequesting, "source requesting skill"))
    assert.equal(extractReviewArtifactScript(trackedRequesting, "tracked requesting skill"), extractReviewArtifactScript(sourceRequesting, "source requesting skill"))
    assert.deepEqual(temporaryTemplate, sourceTemplate)
    assert.deepEqual(trackedTemplate, sourceTemplate)

    for (const [label, text, markers] of [
      ["temporary requesting skill", temporaryRequesting, ["ocmm-review-artifact-identity-js:start", "ocmm-review-artifact-bash:start", "ocmm-review-artifact-powershell:start", "ocmm-review-artifact-packet:start"]],
      ["tracked requesting skill", trackedRequesting, ["ocmm-review-artifact-identity-js:start", "ocmm-review-artifact-bash:start", "ocmm-review-artifact-powershell:start", "ocmm-review-artifact-packet:start"]],
      ["temporary reviewer template", temporaryTemplate.toString("utf8"), ["ocmm-review-artifact-reviewer-template:start"]],
      ["tracked reviewer template", trackedTemplate.toString("utf8"), ["ocmm-review-artifact-reviewer-template:start"]],
      ["temporary subagent skill", temporarySubagent, ["ocmm-review-artifact-final-acceptance:start"]],
      ["tracked subagent skill", trackedSubagent, ["ocmm-review-artifact-final-acceptance:start"]],
    ] as const) {
      for (const marker of markers) assert.match(text, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${label}: ${marker}`)
    }

    const mandate = "Final implementation acceptance must load and follow the applicable identity-bound requesting-code-review skill. The orchestrator owns artifact-identity recomputation, one common packet for selected lanes, stale-verdict rejection, and completion only when every required receipt has the same current identity."
    const sourceOrchestrator = readFileSync(join(process.cwd(), "prompts", "codex", "agents", "orchestrator.md"), "utf8")
    const temporaryProjectToml = readFileSync(join(result.projectAgentsRoot!, `${CODEX_AGENT_PREFIX}-orchestrator.toml`), "utf8")
    const temporaryPluginToml = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-orchestrator.toml`), "utf8")
    const trackedProjectToml = readFileSync(join(process.cwd(), CODEX_PROJECT_AGENTS_DIR, `${CODEX_AGENT_PREFIX}-orchestrator.toml`), "utf8")
    const trackedPluginToml = readFileSync(join(process.cwd(), CODEX_PLUGIN_DIR, "agents", `${CODEX_AGENT_PREFIX}-orchestrator.toml`), "utf8")
    assert.equal(temporaryProjectToml, temporaryPluginToml, "temporary orchestrator copies differ")
    assert.equal(trackedProjectToml, temporaryProjectToml, "tracked project orchestrator is stale")
    assert.equal(trackedPluginToml, temporaryPluginToml, "tracked plugin orchestrator is stale")

    assert.equal(countOccurrences(sourceOrchestrator, mandate), 1, "Codex source orchestrator mandate")
    for (const [label, toml] of [
      ["temporary project orchestrator", temporaryProjectToml],
      ["temporary plugin orchestrator", temporaryPluginToml],
      ["tracked project orchestrator", trackedProjectToml],
      ["tracked plugin orchestrator", trackedPluginToml],
    ] as const) {
      const instructions = parseGeneratedDeveloperInstructions(toml, label)
      assert.equal(countOccurrences(instructions, mandate), 1, `${label}: mandate count`)
      assert.doesNotMatch(instructions, /ocmm-review-artifact-identity-js|record\("tracked-diff"/, `${label}: algorithm duplication`)
    }

    const temporaryBuilder = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-builder.toml`), "utf8")
    assert.doesNotMatch(parseGeneratedDeveloperInstructions(temporaryBuilder, "temporary builder"), /artifact-identity recomputation, one common packet for selected lanes/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run the generator test and verify RED against stale tracked consumers**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="generated review identity contract" src/codex/plugin-generator.test.ts
if ($LASTEXITCODE -eq 0) { throw "generated review identity test unexpectedly passed before regeneration" }
```

Expected: FAIL at the first tracked freshness comparison, such as `tracked deepwork-requesting-code-review/SKILL.md differs from fresh generation` or `tracked project orchestrator is stale`. Fresh temporary output itself must be generated successfully.

- [ ] **Step 3: Build TypeScript, generate twice, and compare exact sorted path/hash/status/diff snapshots**

Run this complete PowerShell transaction. It uses only the approved temp parent for evidence and never edits generated files by hand:

```powershell
$repoRoot = (Get-Location).Path
$tempParent = "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode"
if (-not (Test-Path -LiteralPath $tempParent -PathType Container)) { throw "approved temp parent missing" }
$evidenceRoot = Join-Path $tempParent ("project5-generation-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $evidenceRoot | Out-Null
$generatedScopes = @(".agents/plugins/marketplace.json", ".codex/agents", "plugins/deepwork")

function Get-GeneratedSnapshot([string]$Root) {
  $manifest = [System.Collections.Generic.List[string]]::new()
  $marketplace = Join-Path $Root ".agents\plugins\marketplace.json"
  $manifest.Add(".agents/plugins/marketplace.json`t$((Get-FileHash -LiteralPath $marketplace -Algorithm SHA256).Hash.ToLowerInvariant())")
  foreach ($relativeRoot in @(".codex\agents", "plugins\deepwork")) {
    $absoluteRoot = Join-Path $Root $relativeRoot
    foreach ($item in Get-ChildItem -LiteralPath $absoluteRoot -File -Recurse) {
      $relativePath = [IO.Path]::GetRelativePath($Root, $item.FullName).Replace("\", "/")
      $hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      $manifest.Add("$relativePath`t$hash")
    }
  }

  $status = @(& git status --porcelain=v1 --untracked-files=all -- $generatedScopes)
  if ($LASTEXITCODE -ne 0) { throw "generated-scope git status failed" }
  $diff = @(& git diff --binary --no-ext-diff -- $generatedScopes)
  if ($LASTEXITCODE -ne 0) { throw "generated-scope git diff failed" }
  [pscustomobject]@{
    Manifest = @($manifest | Sort-Object)
    Status = @($status | Sort-Object)
    Diff = @($diff)
  }
}

try {
  pnpm run build:ts
  if ($LASTEXITCODE -ne 0) { throw "pnpm run build:ts failed" }

  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw "first pnpm run gen:codex-plugin failed" }
  $first = Get-GeneratedSnapshot $repoRoot
  [IO.File]::WriteAllLines((Join-Path $evidenceRoot "first-manifest.tsv"), [string[]]$first.Manifest)
  [IO.File]::WriteAllLines((Join-Path $evidenceRoot "first-status.txt"), [string[]]$first.Status)
  [IO.File]::WriteAllLines((Join-Path $evidenceRoot "first-diff.patch"), [string[]]$first.Diff)

  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw "second pnpm run gen:codex-plugin failed" }
  $second = Get-GeneratedSnapshot $repoRoot
  [IO.File]::WriteAllLines((Join-Path $evidenceRoot "second-manifest.tsv"), [string[]]$second.Manifest)
  [IO.File]::WriteAllLines((Join-Path $evidenceRoot "second-status.txt"), [string[]]$second.Status)
  [IO.File]::WriteAllLines((Join-Path $evidenceRoot "second-diff.patch"), [string[]]$second.Diff)

  if (@(Compare-Object $first.Manifest $second.Manifest -SyncWindow 0).Count -ne 0) { throw "generated path/SHA-256 manifest changed on second run" }
  if (@(Compare-Object $first.Status $second.Status -SyncWindow 0).Count -ne 0) { throw "generated git status inventory changed on second run" }
  if (@(Compare-Object $first.Diff $second.Diff -SyncWindow 0).Count -ne 0) { throw "generated binary diff inventory changed on second run" }
  "DETERMINISTIC_GENERATION_PASS files=$($second.Manifest.Count) status=$($second.Status.Count) diffLines=$($second.Diff.Count)"
} finally {
  if (Test-Path -LiteralPath $evidenceRoot) { Remove-Item -LiteralPath $evidenceRoot -Recurse -Force }
}
```

Expected: `build:ts` passes; both generator runs report their normal counts; the final line reports positive inventory counts; sorted paths plus lowercase SHA-256 values, sorted status, and exact binary diff lines are identical between runs; the evidence root is removed.

- [ ] **Step 4: Run the generated-contract GREEN test and inspect real generator deltas**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="generated review identity contract|generated debugging and frontend skill trees" src/codex/plugin-generator.test.ts
if ($LASTEXITCODE -ne 0) { throw "generated review identity or preserved Project 4 contract failed" }
git diff --check -- "src/codex/plugin-generator.test.ts" ".codex/agents" "plugins/deepwork"
if ($LASTEXITCODE -ne 0) { throw "Task 2 generated whitespace check failed" }
git diff --stat -- "src/codex/plugin-generator.test.ts" ".codex/agents" "plugins/deepwork"
git status --short
```

Expected: both Project 5 and Project 4 named tests pass; tracked fresh output equals temporary output; the requesting template is byte-for-byte copied; normalized skill prefixes and canonical compatibility suffixes pass; only the five listed generated consumers contain real Project 5 deltas, although Project 4 keeps its existing generated deltas. `src/codex/plugin-generator.ts` remains clean.

---

### Task 3: Identity-stamped full gates, isolated installed surfaces, scope audit, and final packet

**Files:**
- Verify only: every Task 1 and Task 2 source/test/doc/generated path
- Verify only: `package.json`, `schema.json`, `src/config/schema.ts`, `.github/workflows/release.yml`, `crates/ocmm-lsp/Cargo.toml`
- Create temporarily and clean: unique directories under `C:\Users\HUGEFI~1\AppData\Local\Temp\opencode`

**Interfaces:**
- Consumes: Task 1's marker-delimited canonical algorithm and Task 2's fresh generated trees; exact final target tests and existing CLIs.
- Produces: one final lowercase `sha256:<64hex>`; identity-stamped targeted/typecheck/full-test/build/generator/real-surface/scope receipts; exact seven-field packet for parent dispatch; parent-owned Oracle and Reviewer five-field receipts at one common identity.

- [ ] **Step 1: Extract the canonical body once and establish the unchanged QA identity**

Run this exact PowerShell block; it executes the same marked body used by the source behavioral test and does not duplicate the algorithm:

```powershell
$skillPath = "skills/v1/requesting-code-review/SKILL.md"
$extractor = @'
import { readFileSync } from "node:fs";
const markdown = readFileSync(process.argv[2], "utf8");
const startMarker = "<!-- ocmm-review-artifact-identity-js:start -->";
const endMarker = "<!-- ocmm-review-artifact-identity-js:end -->";
if (markdown.split(startMarker).length !== 2 || markdown.split(endMarker).length !== 2) throw new Error("canonical artifact identity markers are missing or duplicated");
const start = markdown.indexOf(startMarker) + startMarker.length;
const end = markdown.indexOf(endMarker, start);
const match = markdown.slice(start, end).trim().match(/^```js\r?\n([\s\S]*?)\r?\n```$/);
if (!match) throw new Error("canonical artifact identity JavaScript fence is malformed");
process.stdout.write(match[1]);
'@
$canonicalJs = @($extractor | node --input-type=module - $skillPath)
if ($LASTEXITCODE -ne 0) { throw "canonical artifact identity extraction failed" }
$canonicalJs = $canonicalJs -join "`n"
function Get-CurrentArtifactIdentity {
  $identity = node --input-type=module -e $canonicalJs
  if ($LASTEXITCODE -ne 0) { throw "canonical artifact identity computation failed" }
  if ($identity -notmatch '^sha256:[0-9a-f]{64}$') { throw "canonical artifact identity output was malformed: $identity" }
  return [string]$identity
}
$qaIdentity = Get-CurrentArtifactIdentity
$gateEvidence = [System.Collections.Generic.List[string]]::new()
function Invoke-IdentityBoundGate([string]$Name, [string]$Command, [scriptblock]$Action) {
  $before = Get-CurrentArtifactIdentity
  if ($before -ne $qaIdentity) { throw "$Name started at changed identity $before" }
  & $Action
  $after = Get-CurrentArtifactIdentity
  if ($after -ne $qaIdentity) { throw "$Name changed tracked/untracked product identity to $after" }
  $gateEvidence.Add("name=$Name; command=$Command; result=PASS; source=current task result; identity=$after")
}
"QA_IDENTITY=$qaIdentity"
```

Expected: one lowercase `sha256:` identity is printed. Keep this PowerShell session active through Steps 2-8. If any later gate detects drift, stop, classify the changed bytes, regenerate when source-derived, establish a new identity, and restart all required final gates; never relabel earlier evidence.

- [ ] **Step 2: Run all focused contract tests, including the disposable-repository behavior test**

In the same session:

```powershell
Invoke-IdentityBoundGate "target-plan-review-contract" 'node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="review artifact identity|canonical review artifact identity|review skills use ordered Oracle priority" src/intent/plan-review-contract.test.ts' {
  node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="review artifact identity|canonical review artifact identity|review skills use ordered Oracle priority" src/intent/plan-review-contract.test.ts
  if ($LASTEXITCODE -ne 0) { throw "target plan-review contract failed" }
}
Invoke-IdentityBoundGate "target-prompt-loader" 'node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="concise identity-bound review mandate|review-input based|v1 implementer template and maintenance docs record flat workflow ownership|GPT run contract" src/intent/prompt-loader.test.ts' {
  node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="concise identity-bound review mandate|review-input based|v1 implementer template and maintenance docs record flat workflow ownership|GPT run contract" src/intent/prompt-loader.test.ts
  if ($LASTEXITCODE -ne 0) { throw "target prompt-loader contract failed" }
}
Invoke-IdentityBoundGate "target-codex-generator" 'node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="generated review identity contract|generated debugging and frontend skill trees|self-contained bundle" src/codex/plugin-generator.test.ts' {
  node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="generated review identity contract|generated debugging and frontend skill trees|self-contained bundle" src/codex/plugin-generator.test.ts
  if ($LASTEXITCODE -ne 0) { throw "target Codex generator contract failed" }
}
```

Expected: all selected tests pass. The algorithm behavior test uses only a disposable temp repository, performs no project Git write, uses repository-local Git config only, and removes its fixture.

- [ ] **Step 3: Run typecheck, full tests, final TypeScript build, and final deterministic generator gate**

Run each gate independently in the same session:

```powershell
$repoRoot = (Get-Location).Path
Invoke-IdentityBoundGate "typecheck" "pnpm run typecheck" {
  pnpm run typecheck
  if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }
}
Invoke-IdentityBoundGate "full-tests" "pnpm test" {
  pnpm test
  if ($LASTEXITCODE -ne 0) { throw "pnpm test failed" }
}
Invoke-IdentityBoundGate "build-ts" "pnpm run build:ts" {
  pnpm run build:ts
  if ($LASTEXITCODE -ne 0) { throw "pnpm run build:ts failed" }
}
Invoke-IdentityBoundGate "final-generator-determinism" "pnpm run gen:codex-plugin twice; compare sorted path/SHA-256, status, and binary diff snapshots" {
  $generatedScopes = @(".agents/plugins/marketplace.json", ".codex/agents", "plugins/deepwork")
  function Get-FinalGeneratedSnapshot {
    $manifest = [System.Collections.Generic.List[string]]::new()
    $marketplace = Join-Path $repoRoot ".agents\plugins\marketplace.json"
    $manifest.Add(".agents/plugins/marketplace.json`t$((Get-FileHash -LiteralPath $marketplace -Algorithm SHA256).Hash.ToLowerInvariant())")
    foreach ($relativeRoot in @(".codex\agents", "plugins\deepwork")) {
      $absoluteRoot = Join-Path $repoRoot $relativeRoot
      foreach ($item in Get-ChildItem -LiteralPath $absoluteRoot -File -Recurse) {
        $relativePath = [IO.Path]::GetRelativePath($repoRoot, $item.FullName).Replace("\", "/")
        $hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $manifest.Add("$relativePath`t$hash")
      }
    }
    $status = @(& git status --porcelain=v1 --untracked-files=all -- $generatedScopes)
    if ($LASTEXITCODE -ne 0) { throw "final generated-scope status failed" }
    $diff = @(& git diff --binary --no-ext-diff -- $generatedScopes)
    if ($LASTEXITCODE -ne 0) { throw "final generated-scope diff failed" }
    [pscustomobject]@{ Manifest = @($manifest | Sort-Object); Status = @($status | Sort-Object); Diff = @($diff) }
  }

  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw "first final generator pass failed" }
  $firstFinalGeneration = Get-FinalGeneratedSnapshot
  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw "second final generator pass failed" }
  $secondFinalGeneration = Get-FinalGeneratedSnapshot
  if (@(Compare-Object $firstFinalGeneration.Manifest $secondFinalGeneration.Manifest -SyncWindow 0).Count -ne 0) { throw "final generated path/SHA-256 manifest drift" }
  if (@(Compare-Object $firstFinalGeneration.Status $secondFinalGeneration.Status -SyncWindow 0).Count -ne 0) { throw "final generated status drift" }
  if (@(Compare-Object $firstFinalGeneration.Diff $secondFinalGeneration.Diff -SyncWindow 0).Count -ne 0) { throw "final generated diff drift" }
}
```

Expected: strict TypeScript passes; all Node and Rust tests pass; TypeScript build passes; both final generator runs report their normal counts; sorted path/SHA-256, status, and exact diff snapshots match; generation changes no identity after Task 2's TDD regeneration.

- [ ] **Step 4: Run the root full build and allow only the proven native-EXE live-lock fallback**

Run this block outside `Invoke-IdentityBoundGate` so the exact root failure can be classified, then manually require `Get-CurrentArtifactIdentity` still equals `$qaIdentity`:

```powershell
$repoRoot = (Get-Location).Path
$tempParent = "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode"
if (-not (Test-Path -LiteralPath $tempParent -PathType Container)) { throw "approved temp parent missing" }
$buildEvidenceRoot = Join-Path $tempParent ("project5-build-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $buildEvidenceRoot | Out-Null
$rootBuildLog = Join-Path $buildEvidenceRoot "root-build.log"
$rootBuildBlocked = $false

try {
  pnpm run build *>&1 | Tee-Object -FilePath $rootBuildLog
  $rootBuildExit = $LASTEXITCODE
  if ($rootBuildExit -ne 0) {
    $buildText = [IO.File]::ReadAllText($rootBuildLog)
    $binaryPattern = [regex]::Escape((Join-Path $repoRoot "dist\bin\ocmm-lsp")) + ".*\.exe"
    $rootBuildBlocked =
      $buildText -match '(?i)\b(?:EPERM|EBUSY)\b' -and
      $buildText -match '(?i)\b(?:unlink|delete|remove)\b' -and
      $buildText -match $binaryPattern
    $disallowedCause = $buildText -match '(?i)could not compile|error\[E\d+\]|command not found|not recognized|cannot find module|target.*release.*not found'
    if (-not $rootBuildBlocked -or $disallowedCause) { throw "root build failed for a non-live-lock cause" }
    "ROOT_BUILD_BLOCKED_BY_LIVE_NATIVE_LOCK"
  } else {
    "ROOT_BUILD_PASS"
  }

  function Assert-LspToolsList([string]$WrapperPath) {
    $request = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
    $responseText = ($request | node $WrapperPath mcp | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw "LSP wrapper failed: $WrapperPath" }
    $response = $responseText | ConvertFrom-Json
    if ($response.jsonrpc -ne "2.0" -or [int]$response.id -ne 1 -or $response.PSObject.Properties.Name -contains "error") { throw "invalid LSP tools/list envelope" }
    $actual = @($response.result.tools | ForEach-Object { $_.name }) | Sort-Object
    $expected = @("diagnostics", "find_references", "find_symbol_related", "goto_definition", "prepare_rename", "rename", "status", "symbols") | Sort-Object
    if ($actual.Count -ne 8 -or @(Compare-Object $expected $actual).Count -ne 0) { throw "LSP wrapper did not expose exactly eight canonical tools" }
    "LSP_TOOLS_PASS count=8 wrapper=$WrapperPath"
  }

  if (-not $rootBuildBlocked) {
    Assert-LspToolsList (Join-Path $repoRoot "dist\cli\ocmm-lsp.js")
    $gateEvidence.Add("name=root-build; command=pnpm run build; result=PASS; source=current task result; identity=$qaIdentity")
    $gateEvidence.Add("name=lsp-wrapper-eight-tools; command=JSON-RPC tools/list through dist/cli/ocmm-lsp.js mcp; result=PASS count=8; source=current task result; identity=$qaIdentity")
  } else {
    $isolatedRoot = Join-Path $tempParent ("project5-isolated-build-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $isolatedRoot | Out-Null
    try {
      robocopy.exe $repoRoot $isolatedRoot /E /XD .git node_modules dist target omo /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -gt 7) { throw "robocopy failed with exit $LASTEXITCODE" }
      if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "node_modules") -PathType Container)) { throw "root node_modules missing; do not install" }
      New-Item -ItemType Junction -Path (Join-Path $isolatedRoot "node_modules") -Target (Join-Path $repoRoot "node_modules") | Out-Null
      node (Join-Path $isolatedRoot "node_modules\typescript\bin\tsc") -p (Join-Path $isolatedRoot "tsconfig.json")
      if ($LASTEXITCODE -ne 0) { throw "isolated TypeScript build failed" }
      node --experimental-strip-types (Join-Path $isolatedRoot "scripts\build-ocmm-lsp.ts")
      if ($LASTEXITCODE -ne 0) { throw "isolated native build failed" }
      Assert-LspToolsList (Join-Path $isolatedRoot "dist\cli\ocmm-lsp.js")
      "ISOLATED_BUILD_PASS root_build_status=BLOCKED"
      $gateEvidence.Add("name=root-build; command=pnpm run build; result=BLOCKED-live-native-lock; source=current task result; identity=$qaIdentity")
      $gateEvidence.Add("name=isolated-build; command=isolated TypeScript build plus scripts/build-ocmm-lsp.ts; result=PASS; source=current task result; identity=$qaIdentity")
      $gateEvidence.Add("name=isolated-lsp-wrapper-eight-tools; command=JSON-RPC tools/list through isolated dist/cli/ocmm-lsp.js mcp; result=PASS count=8; source=current task result; identity=$qaIdentity")
    } finally {
      $junction = Join-Path $isolatedRoot "node_modules"
      if (Test-Path -LiteralPath $junction) { Remove-Item -LiteralPath $junction -Force }
      if (Test-Path -LiteralPath $isolatedRoot) { Remove-Item -LiteralPath $isolatedRoot -Recurse -Force }
    }
  }
  if ((Get-CurrentArtifactIdentity) -ne $qaIdentity) { throw "build gate changed product identity" }
} finally {
  if (Test-Path -LiteralPath $buildEvidenceRoot) { Remove-Item -LiteralPath $buildEvidenceRoot -Recurse -Force }
}
```

Expected primary result: root build PASS and root wrapper exact-eight PASS. The only accepted fallback trigger is `EPERM`/`EBUSY` plus delete/unlink/remove plus a root `dist\bin\ocmm-lsp*.exe` path and no compiler/tool/module/target cause. In fallback, report the root gate as `BLOCKED`, not passed; require isolated TypeScript/native build and exact-eight wrapper evidence; remove the junction before recursive cleanup; do not inspect or terminate the locking process. A final release stage still requires an actual root build pass.

- [ ] **Step 5: Verify the mandate through isolated OMO and skill-driven OpenCode surfaces without a model call**

Run this complete PowerShell block. It saves, clears, and restores inherited config/profile/credential variables, captures only temporary evidence, calls `opencode debug agent orchestrator`, and makes no provider request:

```powershell
$repoRoot = (Get-Location).Path
$tempParent = "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode"
$testRoot = Join-Path $tempParent ("project5-opencode-" + [guid]::NewGuid().ToString("N"))
$envNames = @(
  "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME",
  "OPENCODE_CONFIG", "OPENCODE_CONFIG_CONTENT", "OPENCODE_CONFIG_DIR", "OPENCODE_DISABLE_AUTOUPDATE",
  "OCMM_DEBUG", "OCMM_PROFILE", "OCMM_NO_PROFILE", "OCMM_FAST",
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "AZURE_OPENAI_API_KEY", "CODEX_API_KEY"
)
$savedEnv = @{}
foreach ($name in $envNames) { $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name, "Process") }
$pushed = $false
$mandate = "Final implementation acceptance must load and follow the applicable identity-bound requesting-code-review skill. The orchestrator owns artifact-identity recomputation, one common packet for selected lanes, stale-verdict rejection, and completion only when every required receipt has the same current identity."

try {
  foreach ($directory in @(".opencode", "xdg-config", "xdg-data", "xdg-state", "xdg-cache", "evidence")) {
    New-Item -ItemType Directory -Path (Join-Path $testRoot $directory) -Force | Out-Null
  }
  $opencodeConfig = [ordered]@{
    '$schema' = "https://opencode.ai/config.json"
    plugin = @((Join-Path $repoRoot "dist\index.js"))
    autoupdate = $false
    share = "disabled"
    disabled_providers = @("opencode", "openrouter", "github-copilot", "openai")
  }
  [IO.File]::WriteAllText((Join-Path $testRoot "opencode.json"), ($opencodeConfig | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))

  $env:XDG_CONFIG_HOME = Join-Path $testRoot "xdg-config"
  $env:XDG_DATA_HOME = Join-Path $testRoot "xdg-data"
  $env:XDG_STATE_HOME = Join-Path $testRoot "xdg-state"
  $env:XDG_CACHE_HOME = Join-Path $testRoot "xdg-cache"
  $env:OPENCODE_CONFIG = $null
  $env:OPENCODE_CONFIG_CONTENT = $null
  $env:OPENCODE_CONFIG_DIR = $null
  $env:OPENCODE_DISABLE_AUTOUPDATE = "1"
  $env:OCMM_DEBUG = "1"
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  $env:OCMM_FAST = $null
  foreach ($name in @("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "AZURE_OPENAI_API_KEY", "CODEX_API_KEY")) { [Environment]::SetEnvironmentVariable($name, $null, "Process") }

  Push-Location $testRoot
  $pushed = $true
  $pathsOutput = @(& opencode debug paths 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "opencode debug paths failed" }
  $normalizedPaths = ($pathsOutput -join "`n").Replace("\", "/").ToLowerInvariant()
  foreach ($name in @("xdg-config", "xdg-data", "xdg-state", "xdg-cache")) {
    $expected = (Join-Path $testRoot $name).Replace("\", "/").ToLowerInvariant()
    if (-not $normalizedPaths.Contains($expected)) { throw "OpenCode path escaped isolation: $expected" }
  }

  foreach ($workflow in @("omo", "v1")) {
    $ocmmConfig = [ordered]@{ workflow = $workflow; debug = $true; agents = [ordered]@{ orchestrator = [ordered]@{ model = "openai/gpt-5.6-sol"; variant = "max" } } }
    [IO.File]::WriteAllText((Join-Path $testRoot ".opencode\ocmm.jsonc"), ($ocmmConfig | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
    $agentOutput = @(& opencode debug agent orchestrator --print-logs --log-level DEBUG 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "OpenCode $workflow orchestrator inspection failed" }
    [IO.File]::WriteAllLines((Join-Path $testRoot "evidence\$workflow-orchestrator.txt"), [string[]]$agentOutput)
    $agentText = $agentOutput -join "`n"
    if (-not $agentText.Contains($mandate)) { throw "$workflow orchestrator missing identity-bound mandate" }
    if ($agentText -match 'ocmm-review-artifact-identity-js|record\("tracked-diff"') { throw "$workflow orchestrator duplicated the algorithm" }
  }
  "ISOLATED_OPENCODE_PASS workflows=omo,v1 modelCalls=0 identity=$qaIdentity"
  $gateEvidence.Add("name=isolated-opencode-omo-v1; command=opencode debug paths and opencode debug agent orchestrator for omo and v1; result=PASS modelCalls=0; source=current task result; identity=$qaIdentity")
} finally {
  if ($pushed) { Pop-Location }
  foreach ($name in $envNames) { [Environment]::SetEnvironmentVariable($name, $savedEnv[$name], "Process") }
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
if ((Get-CurrentArtifactIdentity) -ne $qaIdentity) { throw "OpenCode QA changed product identity" }
```

Expected: both OMO and skill-driven debug-agent outputs contain the exact mandate once, no algorithm marker/body appears, all four XDG roots are isolated, no model call occurs, inherited credentials/config are restored, and the temp root is removed.

- [ ] **Step 6: Verify the installed Codex cache copy, hashes, and markers under isolated `CODEX_HOME`**

Run this complete block from the repository root:

```powershell
$repoRoot = (Get-Location).Path
$tempParent = "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode"
$testRoot = Join-Path $tempParent ("project5-codex-" + [guid]::NewGuid().ToString("N"))
$envNames = @(
  "CODEX_HOME", "CODEX_DISABLE_AUTO_UPDATE",
  "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME",
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "AZURE_OPENAI_API_KEY", "CODEX_API_KEY"
)
$savedEnv = @{}
foreach ($name in $envNames) { $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name, "Process") }
$pushed = $false
$mandate = "Final implementation acceptance must load and follow the applicable identity-bound requesting-code-review skill. The orchestrator owns artifact-identity recomputation, one common packet for selected lanes, stale-verdict rejection, and completion only when every required receipt has the same current identity."

try {
  foreach ($directory in @("codex-home", "xdg-config", "xdg-data", "xdg-state", "xdg-cache", "evidence")) {
    New-Item -ItemType Directory -Path (Join-Path $testRoot $directory) -Force | Out-Null
  }
  $env:CODEX_HOME = Join-Path $testRoot "codex-home"
  $env:CODEX_DISABLE_AUTO_UPDATE = "1"
  $env:XDG_CONFIG_HOME = Join-Path $testRoot "xdg-config"
  $env:XDG_DATA_HOME = Join-Path $testRoot "xdg-data"
  $env:XDG_STATE_HOME = Join-Path $testRoot "xdg-state"
  $env:XDG_CACHE_HOME = Join-Path $testRoot "xdg-cache"
  foreach ($name in @("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "AZURE_OPENAI_API_KEY", "CODEX_API_KEY")) { [Environment]::SetEnvironmentVariable($name, $null, "Process") }
  [IO.File]::WriteAllText((Join-Path $env:CODEX_HOME "config.toml"), "check_for_update_on_startup = false`ndisable_response_storage = true`n", [Text.UTF8Encoding]::new($false))

  Push-Location $repoRoot
  $pushed = $true
  $marketplaceOutput = @(& codex plugin marketplace add $repoRoot --json 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "codex plugin marketplace add failed" }
  $addOutput = @(& codex plugin add deepwork@deepwork-local --json 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "codex plugin add failed" }
  $listOutput = @(& codex plugin list --available --json 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "codex plugin list failed" }
  [IO.File]::WriteAllLines((Join-Path $testRoot "evidence\marketplace-add.txt"), [string[]]$marketplaceOutput)
  [IO.File]::WriteAllLines((Join-Path $testRoot "evidence\plugin-add.txt"), [string[]]$addOutput)
  [IO.File]::WriteAllLines((Join-Path $testRoot "evidence\plugin-list.json"), [string[]]$listOutput)

  $addJson = ($addOutput -join "`n") | ConvertFrom-Json
  if (-not $addJson.installedPath) { throw "codex plugin add did not return installedPath" }
  $installedRoot = [IO.Path]::GetFullPath([string]$addJson.installedPath)
  $codexHomeRoot = [IO.Path]::GetFullPath($env:CODEX_HOME)
  $relativeToHome = [IO.Path]::GetRelativePath($codexHomeRoot, $installedRoot)
  if ($relativeToHome -eq ".." -or $relativeToHome.StartsWith("..\")) { throw "installed plugin escaped isolated CODEX_HOME" }
  $trackedRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot "plugins\deepwork"))
  if ($installedRoot -eq $trackedRoot) { throw "Codex resolved source instead of installed cache" }

  $hashPaths = @(
    "skills\deepwork-requesting-code-review\SKILL.md",
    "skills\deepwork-requesting-code-review\code-reviewer.md",
    "skills\deepwork-subagent-driven-development\SKILL.md"
  )
  foreach ($relativePath in $hashPaths) {
    $installed = Join-Path $installedRoot $relativePath
    $tracked = Join-Path $trackedRoot $relativePath
    $installedHash = (Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash
    $trackedHash = (Get-FileHash -LiteralPath $tracked -Algorithm SHA256).Hash
    if ($installedHash -ne $trackedHash) { throw "installed/tracked hash mismatch: $relativePath" }
  }

  $installedRequesting = [IO.File]::ReadAllText((Join-Path $installedRoot "skills\deepwork-requesting-code-review\SKILL.md"))
  $installedTemplate = [IO.File]::ReadAllText((Join-Path $installedRoot "skills\deepwork-requesting-code-review\code-reviewer.md"))
  $installedSubagent = [IO.File]::ReadAllText((Join-Path $installedRoot "skills\deepwork-subagent-driven-development\SKILL.md"))
  $installedOrchestrator = [IO.File]::ReadAllText((Join-Path $installedRoot "agents\dw-orchestrator.toml"))
  foreach ($marker in @("ocmm-review-artifact-identity-js:start", "ocmm-review-artifact-bash:start", "ocmm-review-artifact-powershell:start", "ocmm-review-artifact-packet:start")) {
    if (-not $installedRequesting.Contains($marker)) { throw "installed requesting skill missing $marker" }
  }
  if (-not $installedTemplate.Contains("ocmm-review-artifact-reviewer-template:start")) { throw "installed reviewer template marker missing" }
  if (-not $installedSubagent.Contains("ocmm-review-artifact-final-acceptance:start")) { throw "installed subagent marker missing" }
  if (-not $installedOrchestrator.Contains($mandate)) { throw "installed orchestrator mandate missing" }
  "ISOLATED_CODEX_PASS installedPath=$installedRoot hashes=3 markers=6 mandate=1 identity=$qaIdentity"
  $gateEvidence.Add("name=isolated-codex-installed-surfaces; command=codex plugin marketplace add, plugin add, plugin list, installed hash and marker checks; result=PASS; source=current task result; identity=$qaIdentity")
} finally {
  if ($pushed) { Pop-Location }
  foreach ($name in $envNames) { [Environment]::SetEnvironmentVariable($name, $savedEnv[$name], "Process") }
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
if ((Get-CurrentArtifactIdentity) -ne $qaIdentity) { throw "Codex QA changed product identity" }
```

Expected: local marketplace/add/list succeed without credentials or model calls; `installedPath` is under isolated `CODEX_HOME` and differs from tracked source; all three installed files hash-equal tracked generated counterparts; all six contract markers and the concise mandate are present; environment is restored and the temp root is removed.

- [ ] **Step 7: Enforce exact scope, empty index, versions, secrets, whitespace, and cleanup**

Run this fail-closed block in the same session:

```powershell
$statusLines = @(git status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw "git status failed" }
$changedPaths = @($statusLines | ForEach-Object { $_.Substring(3).Trim('"').Replace("\", "/") })
$project5NewPaths = @(
  "docs/superpowers/plans/2026-07-29-review-artifact-identity.md",
  "skills/v1/requesting-code-review/SKILL.md",
  "skills/v1/requesting-code-review/code-reviewer.md",
  "skills/v1/subagent-driven-development/SKILL.md",
  "prompts/omo/agents/orchestrator.md",
  "prompts/v1/agents/orchestrator.md",
  "prompts/codex/agents/orchestrator.md",
  "src/intent/plan-review-contract.test.ts",
  "plugins/deepwork/skills/deepwork-requesting-code-review/SKILL.md",
  "plugins/deepwork/skills/deepwork-requesting-code-review/code-reviewer.md",
  "plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md"
)
$knownBaselinePaths = @(
  ".codex/agents/dw-builder.toml", ".codex/agents/dw-clarifier.toml", ".codex/agents/dw-code-search.toml", ".codex/agents/dw-doc-search.toml", ".codex/agents/dw-explore.toml", ".codex/agents/dw-media-reader.toml", ".codex/agents/dw-oracle-2nd.toml", ".codex/agents/dw-oracle.toml", ".codex/agents/dw-orchestrator.toml", ".codex/agents/dw-plan-critic.toml", ".codex/agents/dw-planner.toml", ".codex/agents/dw-reviewer.toml",
  "docs/prompt-sync.md", "docs/v1-maintenance.md",
  "plugins/deepwork/agents/dw-builder.toml", "plugins/deepwork/agents/dw-clarifier.toml", "plugins/deepwork/agents/dw-code-search.toml", "plugins/deepwork/agents/dw-doc-search.toml", "plugins/deepwork/agents/dw-explore.toml", "plugins/deepwork/agents/dw-media-reader.toml", "plugins/deepwork/agents/dw-oracle-2nd.toml", "plugins/deepwork/agents/dw-oracle.toml", "plugins/deepwork/agents/dw-orchestrator.toml", "plugins/deepwork/agents/dw-plan-critic.toml", "plugins/deepwork/agents/dw-planner.toml", "plugins/deepwork/agents/dw-reviewer.toml",
  "plugins/deepwork/skills/debugging/SKILL.md", "plugins/deepwork/skills/debugging/references/methodology/03-flaky-triage.md", "plugins/deepwork/skills/frontend/.gitignore", "plugins/deepwork/skills/frontend/ATTRIBUTION.md", "plugins/deepwork/skills/frontend/SKILL.md", "plugins/deepwork/skills/frontend/references/design/README.md", "plugins/deepwork/skills/frontend/references/design/_INDEX.md", "plugins/deepwork/skills/frontend/references/design/interaction-skill.md",
  "prompts/codex/deepwork/gpt.md", "prompts/omo/deepwork/gpt.md", "prompts/v1/deepwork/gpt.md",
  "skills/debugging/SKILL.md", "skills/debugging/references/methodology/03-flaky-triage.md", "skills/frontend/.gitignore", "skills/frontend/ATTRIBUTION.md", "skills/frontend/SKILL.md", "skills/frontend/references/design/README.md", "skills/frontend/references/design/_INDEX.md", "skills/frontend/references/design/interaction-skill.md",
  "src/codex/plugin-generator.test.ts", "src/intent/prompt-loader.test.ts",
  "docs/superpowers/plans/2026-07-29-prompt-skill-upstream-sync.md", "docs/superpowers/specs/2026-07-29-prompt-skill-upstream-sync-design.md", "docs/superpowers/specs/2026-07-29-review-artifact-identity-design.md"
)
$expectedPaths = @($knownBaselinePaths + $project5NewPaths | Sort-Object -Unique)
$actualPaths = @($changedPaths | Sort-Object -Unique)
$scopeDifference = @(Compare-Object $expectedPaths $actualPaths -SyncWindow 0)
if ($scopeDifference.Count -ne 0) { throw "dirty scope differs from exact Project 4 + Project 5 allowlist:`n$($scopeDifference | Out-String)" }
if ($actualPaths.Count -ne 61) { throw "expected 61 dirty paths after implementation; got $($actualPaths.Count)" }

git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw "staged index is not empty" }

$protectedPaths = @("package.json", "schema.json", "src/config/schema.ts", ".github/workflows/release.yml", "crates/ocmm-lsp/Cargo.toml")
git diff --exit-code -- $protectedPaths
if ($LASTEXITCODE -ne 0) { throw "package/schema/release/LSP protected path changed" }
git diff --cached --exit-code -- $protectedPaths
if ($LASTEXITCODE -ne 0) { throw "staged protected path changed" }
$package = [IO.File]::ReadAllText((Join-Path $repoRoot "package.json")) | ConvertFrom-Json
if ($package.version -ne "0.6.4" -or $package.ocmm.lspVersion -ne "0.3.2") { throw "package or LSP pin changed" }

$secretPattern = '(?i)(?:sk-[a-z0-9_-]{20,}|gh[pousr]_[a-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token)\s*[:=]\s*["''][a-z0-9_./+=-]{16,}["''])'
& rg -n --hidden $secretPattern -- $actualPaths
if ($LASTEXITCODE -eq 0) { throw "possible secret found in dirty paths" }
if ($LASTEXITCODE -gt 1) { throw "secret scan failed" }

git diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff --check failed" }
if ((Get-CurrentArtifactIdentity) -ne $qaIdentity) { throw "scope/security checks observed artifact drift" }
$gateEvidence.Add("name=scope-61-paths; command=git status --porcelain=v1 --untracked-files=all and exact allowlist comparison; result=PASS count=61; source=current task result; identity=$qaIdentity")
$gateEvidence.Add("name=cached-index-empty; command=git diff --cached --quiet; result=PASS; source=current task result; identity=$qaIdentity")
$gateEvidence.Add("name=versions-schema-release-protected; command=git diff protected paths and inspect package.json version/LSP pin; result=PASS; source=current task result; identity=$qaIdentity")
$gateEvidence.Add("name=secret-scan; command=rg credential/private-key pattern over all dirty paths; result=PASS no-match; source=current task result; identity=$qaIdentity")
$gateEvidence.Add("name=git-diff-check; command=git diff --check; result=PASS; source=current task result; identity=$qaIdentity")
git diff --stat
git status --short
```

Expected: exact 61-path union; Project 4's 49 paths, Project 5 spec, plan, overlapping appended edits, ten genuinely new implementation/generated paths, and no extra paths. Cached diff is empty; versions remain `0.6.4` / `0.3.2`; protected schema/release/LSP paths are clean; secret scan returns exit 1; `git diff --check` exits 0.

- [ ] **Step 8: Recompute the final identity and capture the large packet as hashed OS-temp evidence**

Still in the same session, run:

```powershell
$finalIdentity = Get-CurrentArtifactIdentity
if ($finalIdentity -ne $qaIdentity) { throw "final artifact identity drifted from QA identity" }

$evidenceParent = "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode"
if (-not (Test-Path -LiteralPath $evidenceParent -PathType Container)) { throw "approved evidence parent is missing" }
$reviewEvidenceRoot = Join-Path $evidenceParent ("project5-review-packet-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $reviewEvidenceRoot | Out-Null
$binaryDiffPath = Join-Path $reviewEvidenceRoot "working-tree.binary.diff"
$untrackedManifestPath = Join-Path $reviewEvidenceRoot "untracked-manifest.tsv"
$verificationEvidencePath = Join-Path $reviewEvidenceRoot "verification-evidence.txt"
$reviewPacketPath = Join-Path $reviewEvidenceRoot "review-packet.txt"

$captureScript = @'
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";

const [diffPath, manifestPath] = process.argv.slice(2);
if (!diffPath || !manifestPath) throw new Error("capture artifact paths are required");
const runGit = (...args) => execFileSync("git", args, { encoding: "buffer", maxBuffer: 1024 * 1024 * 1024 });
writeFileSync(diffPath, runGit("diff", "--binary", "--no-ext-diff", "HEAD", "--"));

const raw = runGit("ls-files", "--others", "--exclude-standard", "-z");
const paths = [];
let start = 0;
for (let index = 0; index < raw.length; index += 1) {
  if (raw[index] === 0) {
    if (index !== start) paths.push(raw.subarray(start, index));
    start = index + 1;
  }
}
if (start !== raw.length) throw new Error("git NUL output was not terminated");
paths.sort(Buffer.compare);
const lines = paths.map((path) => {
  const stat = lstatSync(path);
  const type = stat.isFile() ? "file" : stat.isSymbolicLink() ? "symlink" : null;
  if (!type) throw new Error(`unsupported untracked entry type: ${path.toString("utf8")}`);
  const bytes = type === "file" ? readFileSync(path) : readlinkSync(path, { encoding: "buffer" });
  const digest = createHash("sha256").update(bytes).digest("hex");
  return `${JSON.stringify(path.toString("utf8"))}\t${type}\tsha256:${digest}`;
});
writeFileSync(manifestPath, lines.length === 0 ? "" : `${lines.join("\n")}\n`, "utf8");
'@
$captureScript | node --input-type=module - $binaryDiffPath $untrackedManifestPath
if ($LASTEXITCODE -ne 0) { throw "review input artifact capture failed" }

$evidenceSummary = @($gateEvidence | Sort-Object) -join "; "
$utf8NoBom = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($verificationEvidencePath, ($evidenceSummary + "`n"), $utf8NoBom)
$binaryDiffSha = (Get-FileHash -LiteralPath $binaryDiffPath -Algorithm SHA256).Hash.ToLowerInvariant()
$manifestSha = (Get-FileHash -LiteralPath $untrackedManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$verificationEvidenceSha = (Get-FileHash -LiteralPath $verificationEvidencePath -Algorithm SHA256).Hash.ToLowerInvariant()
$globalConstraints = @'
- The authoritative approved design is `docs/superpowers/specs/2026-07-29-review-artifact-identity-design.md`; implement it completely and do not broaden or reinterpret it.
- Repository baseline is branch `master` at `12bd1e24bdfba3e364981481127eba382b9c3a43` with 49 pre-existing Project 4 dirty paths; the Project 5 spec is the 50th dirty path and this plan becomes the 51st before implementation.
- Preserve every existing Project 4 hunk and untracked byte. Overlapping Project 5 edits in `docs/prompt-sync.md`, `docs/v1-maintenance.md`, `src/intent/prompt-loader.test.ts`, `src/codex/plugin-generator.test.ts`, and generated orchestrator TOMLs must be appended as distinct hunks or generator-derived additions.
- Do not stage, commit, push, tag, reset, restore, stash, install software, terminate processes, change global Git configuration, or perform any other Git write in the project repository. Git writes are allowed only inside the disposable OS-temp repositories created by the behavioral test.
- Use PowerShell 7 syntax for repository and Windows QA commands. Bash and PowerShell snippets inside the skill are deliberately separate user-facing examples; never leak Bash assignment, heredoc, chaining, or redirection syntax into the PowerShell example.
- Keep `package.json` version `0.6.4` and `package.json.ocmm.lspVersion` `0.3.2`; do not change package manifests, config schema, `schema.json`, Cargo versions, release workflows, or LSP assets.
- Keep the canonical working-tree algorithm as one authoritative JavaScript body in `skills/v1/requesting-code-review/SKILL.md`; do not add a production script, CLI, MCP, schema, runtime service, `.omo/*` state, ledger, or Git-object/index mutation.
- Working-tree identities are exactly lowercase `sha256:<64hex>` over HEAD, the one combined binary tracked diff, and bytewise-sorted non-ignored untracked final state. Committed identities are the full `BASE_SHA`/`HEAD_SHA` pair.
- Packets have exactly the seven named fields `ARTIFACT_KIND`, `ARTIFACT_IDENTITY`, `DESCRIPTION`, `PLAN_OR_REQUIREMENTS`, `REVIEW_INPUT`, `VERIFICATION_EVIDENCE`, and `GLOBAL_CONSTRAINTS`; receipts have exactly the five named fields specified by the design.
- Missing identity, mismatch, missing receipt evidence, or post-dispatch drift is an `[evidence]` blocker and cannot yield approval. Never reconstruct a lost receipt from memory or relabel earlier evidence with a later identity.
- Preserve existing reviewer-selection, logical-tier, no-extra-fan-out, same-task continuation, changed-input verification, review-effort floor, and no-implementation-subagent-Git-write policies.
- Generated files are outputs only. Do not hand-edit `.codex/agents/**` or `plugins/deepwork/**`; run `pnpm run build:ts` before generation and accept only deterministic generator-produced deltas.
- Final Project 5 implementation acceptance is parent-orchestrator-owned: after all product/test/generated/docs bytes settle, compute one current identity and dispatch the selected first available Oracle plus primary-lane Reviewer with the same packet. Coding workers do not review and do not perform Git writes.
'@
$reviewPacket = @"
ARTIFACT_KIND: working-tree
ARTIFACT_IDENTITY: $finalIdentity
DESCRIPTION: Project 5 adds canonical committed/working-tree review identity, identity-gated packets and receipts, same-task drift handling, synchronized orchestrator ownership, and generator-propagated Codex surfaces while preserving all Project 4 work.
PLAN_OR_REQUIREMENTS: docs/superpowers/specs/2026-07-29-review-artifact-identity-design.md and docs/superpowers/plans/2026-07-29-review-artifact-identity.md
REVIEW_INPUT: command=git diff --binary --no-ext-diff HEAD --; artifact=$binaryDiffPath; sha256=$binaryDiffSha; command=git ls-files --others --exclude-standard -z with bytewise sorting/type/content digests; artifact=$untrackedManifestPath; sha256=$manifestSha
VERIFICATION_EVIDENCE: artifact=$verificationEvidencePath; sha256=$verificationEvidenceSha; identity=$finalIdentity
GLOBAL_CONSTRAINTS: $globalConstraints
"@
[IO.File]::WriteAllText($reviewPacketPath, $reviewPacket, $utf8NoBom)
$reviewPacketSha = (Get-FileHash -LiteralPath $reviewPacketPath -Algorithm SHA256).Hash.ToLowerInvariant()
$packetFields = @("ARTIFACT_KIND", "ARTIFACT_IDENTITY", "DESCRIPTION", "PLAN_OR_REQUIREMENTS", "REVIEW_INPUT", "VERIFICATION_EVIDENCE", "GLOBAL_CONSTRAINTS")
foreach ($field in $packetFields) {
  if ([regex]::Matches($reviewPacket, "(?m)^$field:").Count -ne 1) { throw "packet field missing or duplicated: $field" }
}
if ((Get-CurrentArtifactIdentity) -ne $finalIdentity) { throw "packet assembly observed artifact drift" }
"review_packet_path=$reviewPacketPath"
"review_packet_sha256=$reviewPacketSha"
"binary_diff_path=$binaryDiffPath"
"binary_diff_sha256=$binaryDiffSha"
"untracked_manifest_path=$untrackedManifestPath"
"untracked_manifest_sha256=$manifestSha"
"verification_evidence_path=$verificationEvidencePath"
"verification_evidence_sha256=$verificationEvidenceSha"
```

Expected: final identity is exactly the identity stamped on every accepted final gate. The potentially multi-megabyte binary diff, typed/content-digested untracked manifest, and sanitized verification evidence are raw files under one approved OS-temp evidence root; `review-packet.txt` contains all seven fields, their absolute artifact paths and SHA-256 digests, the shared identity, and verbatim global constraints. Only the concise path/digest receipt is printed. Keep `$reviewEvidenceRoot` until the parent finishes both required review receipts; do not write packet artifacts into the product tree.

- [ ] **Step 9: Hand the packet to the parent for fresh common-identity acceptance**

The implementation worker returns, without dispatching review:

1. `$finalIdentity`, `$reviewEvidenceRoot`, and the absolute path plus SHA-256 digest for `review-packet.txt`, `working-tree.binary.diff`, `untracked-manifest.tsv`, and `verification-evidence.txt`; do not return the full packet or diff through task text;
2. targeted behavioral/static/prompt/generator PASS results;
3. typecheck, full tests, `build:ts`, Task 2 deterministic generation, and final identity-stamped two-pass generator determinism results;
4. root build PASS plus exact-eight wrapper receipt, or truthful root `BLOCKED` plus isolated build/wrapper PASS;
5. isolated OpenCode OMO/skill-driven and isolated installed Codex receipts;
6. exact 61-path scope, empty cached index, version/schema/release/LSP protection, secret scan, cleanup, and `git diff --check` receipts.

The parent first recomputes `$finalIdentity`, verifies every returned file digest, and reads the seven-field packet from the returned absolute path. It then selects the first currently available Oracle and primary-lane Reviewer at the required configured tier and dispatches both with the same packet path/digest and review-input artifact paths/digests, differing only in intended role/profile designation. Each lane must read and verify those artifacts rather than relying on a truncated task-text copy. The parent records exactly these five fields per lane:

```text
role/profile lane
task_id or session receipt
artifact identity
verdict
report artifact/source
```

The parent recomputes identity after each result and accepts only both approvals at `$finalIdentity`. If a fix changes bytes, the old verdicts and evidence are stale: continue the same Oracle and Reviewer task IDs, create a new packet/identity in a new approved temp evidence root, rerun affected proofs plus the required final pass, and require both receipts at the new common identity. Do not add lanes, reconstruct receipts from memory, stage, or commit. Remove each stale evidence root after it is superseded. After both current receipts are recorded and one final identity recomputation matches, remove the current `$reviewEvidenceRoot` in a `finally` block and verify it no longer exists.

Until the parent returns both current five-field lane receipts, report the implementation-plan receipt status exactly as `waiting for receipt`; a dispatch acknowledgement, timeout, partial response, stale identity, or older report is never a receipt.

Report this suggested commit only for later explicit user authorization; do not execute it:

```text
feat: bind review evidence to artifact identity

Add canonical dirty-tree identity, identity-bound review receipts, generated Codex propagation, and stale-verdict enforcement.
```

---

## Requirement coverage and self-review checklist

- **Identity inputs:** Task 1 preserves the exact design algorithm, one combined tracked binary diff, bytewise untracked order, regular/symlink bytes, ignored exclusion, fail-closed behavior, lowercase output, and full committed endpoints.
- **Canonical ownership and shells:** Task 1 stores one marker-delimited JavaScript body; both distinct wrappers extract it; source tests reject algorithm duplication and Bash leakage into PowerShell.
- **Behavioral proof:** Task 1's disposable Git test covers unchanged stability, tracked edits, staged-plus-unstaged final state, untracked add/change, ignored changes, complete revert, and supported-platform symlinks, with static symlink grammar fallback only for platform denial.
- **Packets and receipts:** Task 1 defines exactly seven packet and five receipt fields, lane identity echo/verification, no reviewer test rerun, parent recomputation, `[evidence]` mismatch/drift blocking, no memory reconstruction, same-task continuation, and common-current-identity completion.
- **Prompts and synchronization:** Task 1 adds the same concise mandate to OMO, skill-driven, and Codex orchestrators without algorithm duplication or visible version wording; both docs contain the five exact upstream SHAs, bounded adaptation, mapping-row updates, and no-runtime-ledger decision while retaining Project 4.
- **Generated surfaces:** Task 2 proves normalized source/fresh/tracked inventories and bytes for both v1 skills, byte-equal reviewer template copying, exact markers, source/temp/tracked orchestrator mandate, other-agent exclusion, and no production generator edit.
- **Determinism:** Task 2 runs `build:ts`, generates twice, and compares complete sorted path/SHA-256, sorted status, and exact binary diff inventories over marketplace, `.codex/agents`, and the whole plugin tree.
- **Final QA:** Task 3 runs focused tests, the algorithm fixture, typecheck, full tests, final `build:ts`, generator freshness, root build or tightly classified live-lock fallback, exact-eight wrapper smoke, isolated OpenCode, and isolated installed Codex surfaces at one unchanged identity.
- **Safety and scope:** Task 3 requires exact 61-path Project 4 + Project 5 scope, empty cached index, secret-free dirty files, clean whitespace, unchanged package/LSP pins, no schema/release/LSP paths, no install/process kill, environment restoration, and temp cleanup.
- **Review ownership:** Task 3 emits the exact identity-bound packet; only the parent dispatches fresh Oracle + Reviewer review and accepts five-field receipts at one recomputed common identity. Coding agents perform neither review nor Git writes.
- **Placeholder review:** all file paths, marker names, helper signatures, test bodies, markdown additions, commands, expected RED/GREEN outcomes, packet fields, receipt fields, and fallback criteria are explicit; no deferred implementation choice remains.
- **Interface consistency:** `ocmm-review-artifact-*` markers, mandate text, seven packet names, five receipt names, generated destinations, test names, and final identity grammar are identical across all tasks.
- **PowerShell and cross-platform review:** repository commands use PowerShell sequencing and `$LASTEXITCODE`; the skill's Bash and PowerShell examples are intentionally separate and fail closed; no shell switching or installation is required.
- **Scope review:** this plan covers Project 5 only, preserves Project 4, and excludes release/version/schema/LSP/runtime/ledger/production-generator work.
