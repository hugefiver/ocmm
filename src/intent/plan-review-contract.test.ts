import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { test } from "node:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = process.cwd()
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8")

function countExact(text: string, needle: string): number {
  return text.split(needle).length - 1
}

function markerComment(marker: string): string {
  return `<!-- ${marker} -->`
}

function extractMarkedFence(text: string, marker: string, language: string): string {
  const comment = markerComment(marker)
  assert.equal(countExact(text, comment), 1, `${marker} marker must appear exactly once`)
  const markerOffset = text.indexOf(comment)
  const following = text.slice(markerOffset + comment.length)
  const fence = new RegExp(
    "^\\r?\\n" + "```" + language + "\\r?\\n([\\s\\S]*?)\\r?\\n```(?:\\r?\\n|$)",
  ).exec(following)
  assert.notEqual(fence, null, `${marker} must introduce one adjacent ${language} fence`)
  return fence![1]
}

function runFixtureGit(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim()
}

function computeFixtureIdentity(cwd: string, script: string): string {
  return execFileSync("node", ["--input-type=module", "-e", script], {
    cwd,
    encoding: "utf8",
  }).trim()
}

test("plan review requires a current complete receipt before handoff", () => {
  const skill = read("skills", "v1", "writing-plans", "SKILL.md")
  const v1Critic = read("prompts", "v1", "agents", "plan-critic.md")
  const codexCritic = read("prompts", "codex", "agents", "plan-critic.md")
  const v1Planner = read("prompts", "v1", "agents", "planner.md")
  const codexPlanner = read("prompts", "codex", "agents", "planner.md")

  for (const text of [v1Critic, codexCritic]) {
    assert.match(text, /complete, current plan revision/i)
    assert.match(text, /any later plan edit requires a fresh round/i)
    assert.match(text, /Never emit `?\[OKAY\]/)
  }
  for (const text of [v1Planner, codexPlanner]) {
    assert.match(text, /waiting for receipt/i)
    assert.match(text, /timeout, partial response, or an older-plan verdict is never a pass/i)
  }
  assert.match(skill, /Timeouts, `WORKING`, acknowledgements, partial output, a missing verdict/i)
  assert.match(skill, /any plan edit invalidates every earlier receipt/i)
  assert.match(skill, /delegated-without-plan-approval/)
  assert.match(skill, /Reviewer and Oracle profiles do not review implementation plans/i)
})

test("maintenance docs preserve prompt layout and plan review receipts", () => {
  const promptSync = read("docs", "prompt-sync.md")
  const v1Maintenance = read("docs", "v1-maintenance.md")
  const plannerPrompt = read("prompts", "v1", "agents", "planner.md")
  const criticPrompt = read("prompts", "v1", "agents", "plan-critic.md")
  const sourceRow = (name: string) =>
    v1Maintenance
      .split(/\r?\n/)
      .find((line) => line.startsWith(`| ${name} |`)) ?? ""

  assert.match(promptSync, /deepwork\/\{default,gpt,gpt-5\.6,claude-opus-5,gemini,glm,codex,planner\}/)
  assert.match(v1Maintenance, /Reviewer and Oracle profiles do not review plans/i)
  assert.match(v1Maintenance, /current-revision/i)

  const requestingReviewRow = sourceRow("requesting-code-review")
  assert.match(requestingReviewRow, /Reviewer is primary-model\/primary-lane self-review/i)
  assert.match(requestingReviewRow, /Oracle slots are external-model cross-checks/i)
  assert.match(requestingReviewRow, /xhigh-equivalent floors/i)
  assert.match(requestingReviewRow, /GPT-5\.6 may use native `max`/)

  for (const source of [plannerPrompt, criticPrompt]) {
    assert.match(source, /current `?plan-critic`? receipt covers exactly one complete, current plan revision/i)
    assert.match(source, /any plan edit invalidates that receipt and requires a fresh review/i)
  }

  assert.match(sourceRow("agents/planner.md"), /current-revision plan-critic receipt semantics/i)
  const criticRow = sourceRow("agents/plan-critic.md")
  assert.match(criticRow, /exactly one complete, current plan revision/i)
  assert.match(criticRow, /current `plan-critic` receipt/i)
  assert.match(criticRow, /any plan edit invalidates that receipt and requires a fresh review/i)
})

test("frontend DESIGN.md docs separate planned showcase checks from reusable entries", () => {
  const frontendReadme = read("skills", "frontend", "references", "design", "README.md")
  const frontendArchitecture = read(
    "skills",
    "frontend",
    "references",
    "design",
    "design-system-architecture.md",
  )

  assert.match(frontendReadme, /nine-section structure/i)
  assert.match(frontendArchitecture, /nine sections/i)
  assert.match(frontendArchitecture, /Planned Showcase Primitives/)
  assert.match(frontendArchitecture, /not reusable component documentation/i)

  for (const source of [frontendReadme, frontendArchitecture]) {
    assert.match(source, /Planned Showcase Primitives/)
    assert.match(source, /pre-implementation verification checklist/i)
    assert.match(source, /not reusable component documentation/i)
    assert.match(source, /implemented reusable patterns used 2\+ times/i)
  }
})

test("review skills use ordered Oracle priority and logical tiers", () => {
  const reviewSkills = [
    read("skills", "v1", "requesting-code-review", "SKILL.md"),
    read("skills", "v1", "subagent-driven-development", "SKILL.md"),
  ]

  for (const text of reviewSkills) {
    assert.match(text, /oracle-2nd.*priority/is)
    assert.match(text, /low.*normal.*high.*max/is)
    assert.match(text, /first available.*Oracle/is)
    assert.match(text, /additional.*Oracle.*in order/is)
    assert.match(text, /runtime-safety.*max.*high.*normal/is)
    assert.doesNotMatch(text, /triple review|third reviewer|supplemental high-effort|high-intensity reviewer/i)
  }
})

test("review artifact identity contract binds packets, receipts, and shell wrappers", () => {
  const skill = read("skills", "v1", "requesting-code-review", "SKILL.md")
  const reviewerTemplate = read("skills", "v1", "requesting-code-review", "code-reviewer.md")
  const subagentSkill = read("skills", "v1", "subagent-driven-development", "SKILL.md")
  const markers = [
    "ocmm-review-artifact-identity-js",
    "ocmm-review-artifact-identity-bash",
    "ocmm-review-artifact-identity-powershell",
    "ocmm-review-artifact-identity-packet",
  ]

  for (const marker of markers) {
    assert.equal(countExact(skill, markerComment(marker)), 1, `${marker} marker`)
  }
  assert.equal(
    countExact(reviewerTemplate, markerComment("ocmm-review-artifact-reviewer-template")),
    1,
  )
  assert.equal(
    countExact(subagentSkill, markerComment("ocmm-review-artifact-final-acceptance")),
    1,
  )

  const canonical = extractMarkedFence(skill, "ocmm-review-artifact-identity-js", "js")
  const bash = extractMarkedFence(skill, "ocmm-review-artifact-identity-bash", "bash")
  const powershell = extractMarkedFence(skill, "ocmm-review-artifact-identity-powershell", "powershell")
  const packet = extractMarkedFence(skill, "ocmm-review-artifact-identity-packet", "text")

  assert.match(canonical, /import \{ createHash \} from "node:crypto"/)
  assert.match(canonical, /import \{ execFileSync \} from "node:child_process"/)
  assert.match(canonical, /encoding: "buffer", maxBuffer: 1024 \* 1024 \* 1024/)
  assert.match(canonical, /record\("head", runGit\("rev-parse", "HEAD"\)\)/)
  assert.equal(
    countExact(canonical, 'runGit("diff", "--binary", "--no-ext-diff", "HEAD", "--")'),
    1,
    "one combined tracked diff record",
  )
  assert.match(canonical, /runGit\("ls-files", "--others", "--exclude-standard", "-z"\)/)
  assert.match(canonical, /\.sort\(Buffer\.compare\)/)
  assert.match(
    canonical,
    /if \(index === start\) throw new Error\("git NUL output contained an empty field"\)/,
  )
  assert.match(canonical, /stat\.isFile\(\).*readFileSync\(path\)/s)
  assert.match(canonical, /stat\.isSymbolicLink\(\).*readlinkSync\(path, \{ encoding: "buffer" \}\)/s)
  assert.match(canonical, /unsupported untracked entry type/)
  assert.match(canonical, /process\.stdout\.write\(`sha256:\$\{hash\.digest\("hex"\)\}\\n`\)/)

  for (const wrapper of [bash, powershell]) {
    assert.match(wrapper, /readFileSync/)
    assert.match(wrapper, /ocmm-review-artifact-" \+ "identity-js/)
    assert.match(wrapper, /node --input-type=module -e/)
    assert.match(wrapper, /```js\\r\?\\n/)
    assert.doesNotMatch(wrapper, /createHash|record\(/)
  }
  assert.match(bash, /skill_path='skills\/v1\/requesting-code-review\/SKILL\.md'/)
  assert.match(bash, /readFileSync\(process\.argv\[1\], "utf8"\)/)
  assert.match(bash, /\$\(\s*node --input-type=module/s)
  assert.match(bash, /\|\| exit \$\?/)
  assert.match(bash, /\^sha256:\[0-9a-f\]\{64\}\$/)
  assert.match(bash, /if ! node -e .*artifact_identity.*; then exit 1; fi/s)
  assert.doesNotMatch(bash, /@'|\$LASTEXITCODE/)
  assert.match(powershell, /\$skillPath/)
  assert.match(powershell, /readFileSync\(process\.argv\[1\], "utf8"\)/)
  assert.match(powershell, /@'/)
  assert.match(powershell, /\$LASTEXITCODE -ne 0/)
  assert.match(powershell, /\$scriptLines = @\(node -e \$extractor \$skillPath\)/)
  assert.match(powershell, /\$script = \$scriptLines -join "`n"/)
  assert.match(powershell, /\$artifactIdentityLines = @\(node --input-type=module -e \$script\)/)
  assert.match(powershell, /\$artifactIdentity = \$artifactIdentityLines -join "`n"/)
  assert.match(powershell, /\^sha256:\[0-9a-f\]\{64\}\$/)
  assert.doesNotMatch(powershell, /artifact_identity=|\$\(/)

  assert.match(skill, /BASE_SHA=\$\(git rev-parse HEAD~1\).*\nif \[ \$\? -ne 0 \]; then exit 1; fi/s)
  assert.match(skill, /HEAD_SHA=\$\(git rev-parse HEAD\).*\nif \[ \$\? -ne 0 \]; then exit 1; fi/s)
  assert.match(skill, /sha_pattern='\^\(\[0-9a-f\]\{40\}\|\[0-9a-f\]\{64\}\)\$'/)
  assert.match(skill, /\[\[ "\$BASE_SHA" =~ \$sha_pattern \]\] \|\| exit 1/)
  assert.match(skill, /\[\[ "\$HEAD_SHA" =~ \$sha_pattern \]\] \|\| exit 1/)
  assert.match(skill, /git diff --binary --no-ext-diff "\$BASE_SHA\.\.\$HEAD_SHA" \|\| exit \$\?/)
  assert.match(skill, /\$baseShaLines = @\(git rev-parse HEAD~1\)/)
  assert.match(skill, /\$baseSha = \(\$baseShaLines -join "`n"\)\.Trim\(\)/)
  assert.match(skill, /\$headShaLines = @\(git rev-parse HEAD\)/)
  assert.match(skill, /\$headSha = \(\$headShaLines -join "`n"\)\.Trim\(\)/)
  assert.match(skill, /\$baseSha -notmatch '\^\(\?:\[0-9a-f\]\{40\}\|\[0-9a-f\]\{64\}\)\$'/)
  assert.match(skill, /\$headSha -notmatch '\^\(\?:\[0-9a-f\]\{40\}\|\[0-9a-f\]\{64\}\)\$'/)
  assert.match(
    skill,
    /git diff --binary --no-ext-diff "\$baseSha\.\.\$headSha"\s+if \(\$LASTEXITCODE -ne 0\) \{ throw/,
  )

  const packetFields = [...packet.matchAll(/^([A-Z_]+):/gm)].map((match) => match[1])
  assert.deepEqual(packetFields, [
    "ARTIFACT_KIND",
    "ARTIFACT_IDENTITY",
    "DESCRIPTION",
    "PLAN_OR_REQUIREMENTS",
    "REVIEW_INPUT",
    "VERIFICATION_EVIDENCE",
    "GLOBAL_CONSTRAINTS",
  ])
  const receiptFields = [
    "role/profile lane",
    "task_id or session receipt",
    "artifact identity",
    "verdict",
    "report artifact/source",
  ]
  assert.match(skill, new RegExp(receiptFields.map((field) => `${field}:`).join("[\\s\\S]*")))
  assert.match(reviewerTemplate, new RegExp(receiptFields.map((field) => `${field}:`).join("[\\s\\S]*")))
  assert.match(subagentSkill, new RegExp(receiptFields.map((field) => `${field}:`).join("[\\s\\S]*")))
  for (const text of [skill, reviewerTemplate, subagentSkill]) {
    assert.doesNotMatch(text, /\bwith fixes\b/i)
    assert.match(text, /verdict:\s*(?:<|\[)approved \| rejected(?:>|\])/i)
  }
  assert.match(reviewerTemplate, /\*\*Ready to merge\?\*\*\s*\[Yes \| No\]/)
  assert.match(
    skill,
    /final acceptance only when every required receipt\s+has the same common current identity and `verdict: approved`/i,
  )
  assert.match(
    subagentSkill,
    /completion only when every required receipt has all five fields, the same\s+common current identity, and `verdict: approved`/i,
  )
  assert.match(skill, /parent recompute.*after.*return/i)
  assert.match(skill, /\[evidence\].*(?:missing|mismatch|drift).*blocker/i)
  assert.match(skill, /same.*task_id.*new packet.*identity/is)
  assert.match(skill, /no memory reconstruction/i)
  assert.match(skill, /no (?:ledger|runtime|hash CLI)/i)
  assert.match(skill, /Do not require\s+implementation subagents to commit/i)
  assert.match(skill, /hash.*identity.*not.*quality/i)
  assert.match(reviewerTemplate, /Do not re-run tests/i)
  assert.match(reviewerTemplate, /evaluate stamped evidence/i)
  assert.match(reviewerTemplate, /Artifact Identity Echo/)
  assert.match(reviewerTemplate, /Review Receipt/)
  assert.match(subagentSkill, /common current\s+identity/i)
  assert.match(subagentSkill, /same review task IDs.*new.*packet.*identity/is)
  assert.match(subagentSkill, /no memory reconstruction|never reconstruct.*memory/i)
  assert.match(subagentSkill, /no (?:ledger|Git)/i)

  const exampleStart = skill.indexOf("## Example")
  assert.notEqual(exampleStart, -1)
  const example = skill.slice(exampleStart)
  for (const field of [...packetFields, ...receiptFields]) assert.match(example, new RegExp(field, "i"))
  assert.doesNotMatch(example, /git diff --stat\s+git diff/s)
})

test("review artifact identity authoritative mapping rows stay current", () => {
  const v1Maintenance = read("docs", "v1-maintenance.md")
  const promptSync = read("docs", "prompt-sync.md")
  const v1Row = (name: string) =>
    v1Maintenance
      .split(/\r?\n/)
      .find((line) => line.startsWith(`| ${name} |`)) ?? ""
  const promptSyncRow = (name: string) =>
    promptSync
      .split(/\r?\n/)
      .find((line) => line.startsWith(`| \`${name}\` |`)) ?? ""

  const subagentRow = v1Row("subagent-driven-development")
  assert.match(subagentRow, /2026-07-29/)
  assert.match(subagentRow, /common current identity packet/i)
  assert.match(subagentRow, /parent recompute/i)
  assert.match(subagentRow, /same task continuation.*new identity/i)
  assert.match(subagentRow, /all required receipts.*current/i)

  const requestingReviewRow = v1Row("requesting-code-review")
  assert.match(requestingReviewRow, /2026-07-29/)
  assert.match(requestingReviewRow, /committed endpoints.*working canonical identity/i)
  assert.match(requestingReviewRow, /exact packet.*receipt/i)
  assert.match(requestingReviewRow, /\[evidence\].*mismatch.*drift.*blocker/i)
  assert.match(requestingReviewRow, /no memory reconstruction.*runtime ledger/i)

  const reviewerTemplateRow = v1Row("requesting-code-review/code-reviewer.md")
  assert.match(reviewerTemplateRow, /2026-07-29/)
  assert.match(reviewerTemplateRow, /identity echo.*verification/i)
  assert.match(reviewerTemplateRow, /\[evidence\].*mismatch.*drift.*blocker/i)
  assert.match(reviewerTemplateRow, /evaluate stamped evidence.*no test rerun/i)

  const v1OrchestratorRow = v1Row("agents/orchestrator.md")
  assert.match(v1OrchestratorRow, /2026-07-29/)
  assert.match(v1OrchestratorRow, /identity-bound skill mandate/i)
  assert.match(v1OrchestratorRow, /common packet.*recompute.*current receipts/i)
  assert.match(v1OrchestratorRow, /without algorithm duplication/i)

  const promptSyncOrchestratorRow = promptSyncRow("orchestrator")
  assert.match(promptSyncOrchestratorRow, /2026-07-29/)
  assert.match(promptSyncOrchestratorRow, /omo\/v1\/codex/i)
  assert.match(promptSyncOrchestratorRow, /identity-bound skill mandate/i)
  assert.match(promptSyncOrchestratorRow, /common packet.*recompute.*current receipts/i)
})

test("canonical review artifact identity parser rejects malformed NUL fields", () => {
  const skill = read("skills", "v1", "requesting-code-review", "SKILL.md")
  const canonical = extractMarkedFence(skill, "ocmm-review-artifact-identity-js", "js")
  const executionStart = 'record("ocmm-review-artifact-v1", "");'
  assert.equal(countExact(canonical, executionStart), 1, "canonical execution must have one exact start")
  const executionOffset = canonical.indexOf(executionStart)
  assert.notEqual(executionOffset, -1, "canonical execution start must be present")
  const harness = canonical.replace(
    canonical.slice(executionOffset),
    `const asUtf8 = (bytes) => nulFields(bytes).map((field) => field.toString("utf8"));
if (JSON.stringify(asUtf8(Buffer.alloc(0))) !== "[]") throw new Error("empty buffer must yield no fields");
if (JSON.stringify(asUtf8(Buffer.from("foo\\0"))) !== '["foo"]') throw new Error("normal terminator must yield one field");
for (const bytes of [Buffer.from("\\0"), Buffer.from("\\0foo\\0"), Buffer.from("foo\\0\\0"), Buffer.from("foo")]) {
  let threw = false;
  try {
    nulFields(bytes);
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(\`expected malformed NUL output to throw: \${bytes.toString("hex")}\`);
}
process.stdout.write("NUL_FIELDS_PASS\\n");`,
  )
  assert.notEqual(harness, canonical, "harness must replace canonical top-level execution")
  assert.doesNotMatch(harness, /record\("head", runGit\(/)
  const output = execFileSync("node", ["--input-type=module", "-e", harness], {
    encoding: "utf8",
  }).trim()
  assert.equal(output, "NUL_FIELDS_PASS")
})

test("canonical review artifact identity tracks the complete disposable repository state", () => {
  const skill = read("skills", "v1", "requesting-code-review", "SKILL.md")
  const canonical = extractMarkedFence(skill, "ocmm-review-artifact-identity-js", "js")
  const fixture = mkdtempSync(join(tmpdir(), "ocmm-review-artifact-"))

  try {
    runFixtureGit(fixture, "init")
    runFixtureGit(fixture, "config", "user.name", "Review Artifact Test")
    runFixtureGit(fixture, "config", "user.email", "review-artifact@example.test")
    writeFileSync(join(fixture, ".gitignore"), "ignored-entry.txt\n")
    writeFileSync(join(fixture, "tracked.txt"), "baseline\n")
    runFixtureGit(fixture, "add", ".gitignore", "tracked.txt")
    runFixtureGit(fixture, "commit", "-m", "fixture baseline")

    const baseline = computeFixtureIdentity(fixture, canonical)
    assert.match(baseline, /^sha256:[0-9a-f]{64}$/)
    assert.equal(computeFixtureIdentity(fixture, canonical), baseline, "unchanged identity is stable")

    writeFileSync(join(fixture, "tracked.txt"), "tracked edit\n")
    assert.notEqual(computeFixtureIdentity(fixture, canonical), baseline, "tracked edit changes identity")
    writeFileSync(join(fixture, "tracked.txt"), "baseline\n")
    assert.equal(computeFixtureIdentity(fixture, canonical), baseline, "tracked revert returns baseline")

    writeFileSync(join(fixture, "tracked.txt"), "staged only\n")
    runFixtureGit(fixture, "add", "tracked.txt")
    const stagedOnly = computeFixtureIdentity(fixture, canonical)
    writeFileSync(join(fixture, "tracked.txt"), "staged plus unstaged\n")
    assert.notEqual(computeFixtureIdentity(fixture, canonical), stagedOnly, "final tracked state includes staged and unstaged changes")
    runFixtureGit(fixture, "reset", "--hard", "HEAD")
    assert.equal(computeFixtureIdentity(fixture, canonical), baseline, "full tracked revert returns baseline")

    const untracked = join(fixture, "untracked.bin")
    writeFileSync(untracked, Buffer.from([0, 1, 2]))
    const untrackedAdded = computeFixtureIdentity(fixture, canonical)
    assert.notEqual(untrackedAdded, baseline, "untracked add changes identity")
    writeFileSync(untracked, Buffer.from([0, 1, 3]))
    assert.notEqual(computeFixtureIdentity(fixture, canonical), untrackedAdded, "untracked content changes identity")
    rmSync(untracked)
    assert.equal(computeFixtureIdentity(fixture, canonical), baseline, "untracked removal returns baseline")

    const ignored = join(fixture, "ignored-entry.txt")
    writeFileSync(ignored, "ignored one\n")
    assert.equal(computeFixtureIdentity(fixture, canonical), baseline, "ignored add is excluded")
    writeFileSync(ignored, "ignored two\n")
    assert.equal(computeFixtureIdentity(fixture, canonical), baseline, "ignored change is excluded")

    const link = join(fixture, "untracked-link")
    try {
      symlinkSync("first-target", link, "file")
      const firstLink = computeFixtureIdentity(fixture, canonical)
      rmSync(link)
      symlinkSync("second-target", link, "file")
      assert.notEqual(computeFixtureIdentity(fixture, canonical), firstLink, "symlink target changes identity")
      rmSync(link)
    } catch (error: unknown) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : ""
      assert.match(code, /^(EPERM|EACCES|ENOSYS|ENOTSUP)$/)
      assert.match(canonical, /readlinkSync\(path, \{ encoding: "buffer" \}\)/)
    }

    assert.equal(computeFixtureIdentity(fixture, canonical), baseline, "full revert returns baseline")
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test("writing-plans selects only available plan-critic tiers without lowering review effort", () => {
  const skill = read("skills", "v1", "writing-plans", "SKILL.md")
  assert.match(skill, /inspect.*current.*(?:callable|registered).*plan-critic.*profile/is)
  assert.match(skill, /small or clear.*`plan-critic`/is)
  assert.match(skill, /complex.*`plan-critic-high`.*`plan-critic`/is)
  assert.match(skill, /high-risk.*`plan-critic-max`.*`plan-critic-high`.*`plan-critic`/is)
  assert.match(skill, /`plan-critic-low`.*explicit.*cost.*latency/is)
  assert.match(skill, /never.*(?:invent|synthesize|fabricate).*profile/is)
  assert.match(skill, /same `task_id`.*existing review stage/is)
  assert.match(skill, /same current-revision receipt contract/is)
  assert.match(skill, /`plan-critic-low`.*cheaper.*model.*xhigh-equivalent.*floor/is)
})

test("plan-critic review loop uses bounded convergence and eligible blockers", () => {
  const skill = read("skills", "v1", "writing-plans", "SKILL.md")
  const critics = [
    read("prompts", "v1", "agents", "plan-critic.md"),
    read("prompts", "omo", "agents", "plan-critic.md"),
  ]

  assert.match(skill, /Default: at most 5 plan-critic review rounds/i)
  assert.match(skill, /review N 次就下一步.*cap at N rounds/is)
  assert.match(skill, /unlimited\/infinite plan review: no cap/i)
  assert.match(skill, /Blocker eligibility and notes/i)
  assert.match(skill, /explicit requirement.*accepted design\/plan decision/is)
  assert.match(skill, /existing failing regression/i)
  assert.match(skill, /reproducible broken flow|reproducibly broken/i)
  assert.match(skill, /security.*data-loss.*compatibility.*release-safety.*runtime-safety/is)
  assert.match(skill, /external API.*provider.*release contract/is)
  assert.match(skill, /non-blocking note/i)
  assert.match(skill, /Approval-with-notes is still approval/i)
  assert.match(skill, /Blocker ledger freeze after round 1/i)
  assert.match(skill, /smallest plan edit.*without expanding scope/is)
  assert.match(skill, /Default cap: stop and ask the user/i)
  assert.doesNotMatch(skill, /Momus\+Oracle|dual Momus|dual.*Oracle/i)

  for (const critic of critics) {
    assert.match(critic, /## Blocker Eligibility/)
    assert.match(critic, /explicit requirement.*accepted design\/plan decision/is)
    assert.match(critic, /existing failing regression/i)
    assert.match(critic, /reproducibly broken/i)
    assert.match(critic, /security.*data-loss.*compatibility.*release-safety.*runtime-safety/is)
    assert.match(critic, /external API.*provider.*release contract/is)
    assert.match(critic, /non-blocking note/i)
    assert.match(critic, /Approval with notes is approval/i)
    assert.match(critic, /blocker ledger is frozen/i)
    assert.match(critic, /smallest plan edits.*without expanding scope/is)
    assert.match(critic, /\[REJECT\].*eligible blockers/is)
    assert.match(critic, /\[OKAY-UNAMBIGUOUS\]/)
    assert.doesNotMatch(critic, /Momus\+Oracle|dual Momus|dual.*Oracle/i)
  }
})

test("Gemini and GLM verification requirements scale by change size", () => {
  const prompts = [
    read("prompts", "v1", "deepwork", "gemini.md"),
    read("prompts", "omo", "deepwork", "gemini.md"),
    read("prompts", "v1", "deepwork", "glm.md"),
    read("prompts", "omo", "deepwork", "glm.md"),
  ]

  for (const prompt of prompts) {
    assert.match(prompt, /Small single-surface changes.*1-2 targeted scenarios/is)
    assert.match(prompt, /Moderate behavioral changes.*happy path.*adjacent regression/is)
    assert.match(prompt, /high-risk changes.*3\+ scenarios/is)
    assert.match(prompt, /Documentation, prompt text, and visual-only changes/is)
    assert.match(prompt, /real test seam|test seam exists/i)
    assert.doesNotMatch(prompt, /TDD \(MANDATORY, NO EXCEPTIONS\)/)
    assert.doesNotMatch(prompt, /Define 3\+ scenarios, each with a binary pass condition/)
    assert.doesNotMatch(prompt, /Every production change — features, fixes, refactors, perf, glue, config-with-logic — follows RED→GREEN→SURFACE/)
  }
})

test("active docs describe canonical review variants and interruption recovery", () => {
  const files = ["README.md", "AGENTS.md", "docs/architecture.md", "examples/ocmm.example.jsonc"]
  const texts = new Map(files.map((path) => [path, readFileSync(join(process.cwd(), path), "utf8")]))
  for (const [path, text] of texts) {
    assert.match(text, /oracle-2nd/, path)
    assert.match(text, /variants/, path)
    assert.doesNotMatch(text, /supplemental high-intensity|optional third reviewer|triple review/i, path)
  }
  assert.match(texts.get("README.md")!, /agents\.oracle-high.*migrat.*agents\.oracle-2nd/is)
  assert.match(texts.get("README.md")!, /subagent-interruption-recovery/)
  assert.match(texts.get("AGENTS.md")!, /message\.part\.updated/)
  assert.match(texts.get("docs/architecture.md")!, /single.*429 controller/is)
})

test("active docs and synchronization records describe planning logical tiers", () => {
  const files = ["README.md", "AGENTS.md", "docs/architecture.md", "examples/ocmm.example.jsonc"]
  for (const path of files) {
    const text = read(path)
    assert.match(text, /planner/i, path)
    assert.match(text, /plan-critic/i, path)
    assert.match(text, /variants/i, path)
    assert.match(text, /(?:explicit(?:ly)? configured|explicit-only).*(?:suffix|profile)|(?:suffix|profile).*only.*explicit/is, path)
    assert.match(text, /plan-critic-low.*(?:xhigh-equivalent|xhigh).*(?:floor|minimum)/is, path)
  }

  const v1Maintenance = read("docs", "v1-maintenance.md")
  assert.match(v1Maintenance, /writing-plans.*current callable availability.*plan-critic-low.*xhigh/is)
  assert.match(v1Maintenance, /agents\/orchestrator\.md.*callable-profile tier selection/is)

  const promptSync = read("docs", "prompt-sync.md")
  assert.match(promptSync, /orchestrator.*planner.*plan-critic.*availability/is)
})
