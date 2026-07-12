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
