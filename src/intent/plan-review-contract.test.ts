import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { join } from "node:path"

const root = process.cwd()
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8")

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
  assert.match(skill, /never replaces the current `plan-critic` receipt/i)
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

  assert.match(promptSync, /deepwork\/\{default,gpt,gpt-5\.6,gemini,glm,codex,planner\}/)
  assert.match(v1Maintenance, /optional high-risk plan consultation/i)
  assert.match(v1Maintenance, /current plan revision/i)

  const requestingReviewRow = sourceRow("requesting-code-review")
  assert.match(requestingReviewRow, /optional high-risk plan consultation/i)
  assert.match(requestingReviewRow, /`xhigh` minimum/)
  assert.match(requestingReviewRow, /local `max`/)
  assert.match(requestingReviewRow, /GPT-5\.6 supports native `max`/)

  for (const source of [plannerPrompt, criticPrompt]) {
    assert.match(source, /current `?plan-critic`? receipt covers exactly one complete, current plan revision/i)
    assert.match(source, /any plan edit invalidates that receipt and requires a fresh review/i)
  }

  for (const rowName of ["agents/planner.md", "agents/plan-critic.md"]) {
    const row = sourceRow(rowName)
    assert.match(row, /exactly one complete, current plan revision/i)
    assert.match(row, /current `plan-critic` receipt/i)
    assert.match(row, /any plan edit invalidates that receipt and requires a fresh review/i)
  }
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
  assert.match(v1Maintenance, /writing-plans.*currently callable\/registered.*plan-critic-low.*xhigh/is)
  assert.match(v1Maintenance, /agents\/orchestrator\.md.*planner.*plan-critic.*availability/is)

  const promptSync = read("docs", "prompt-sync.md")
  assert.match(promptSync, /orchestrator.*planner.*plan-critic.*availability/is)
})
