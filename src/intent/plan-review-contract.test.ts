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
  assert.match(requestingReviewRow, /target's maximum supported effort/)

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
