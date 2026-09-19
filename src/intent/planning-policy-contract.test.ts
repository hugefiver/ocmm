import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import { defaultConfig } from "../config/schema.ts"
import { createConfigHandler } from "../hooks/config.ts"
import { loadAllPrompts, type Workflow } from "./prompt-loader.ts"

const ROOT = process.cwd()
const PROMPTS_ROOT = join(ROOT, "prompts")
const WORKFLOWS: Workflow[] = ["v1", "codex"]
const DEEPWORK_VARIANTS = [
  "default",
  "gpt",
  "glm",
  "gemini",
  "codex",
  "planner",
  "gpt-5.6",
  "gpt-6-astra",
  "claude-opus-5",
] as const

function prompt(workflow: Workflow, area: "agents" | "deepwork", name: string): string {
  return readFileSync(join(PROMPTS_ROOT, workflow, area, `${name}.md`), "utf8")
}

function assertComplexPlanningDefault(text: string, label: string): void {
  assert.match(
    text,
    /complex business or behavior implementation[\s\S]{0,500}planner[\s\S]{0,250}plan-critic[\s\S]{0,250}implementation/i,
    `${label}: complex implementation must carry the complete planning sequence`,
  )
  assert.match(
    text,
    /limited[\s\S]{0,100}simple[\s\S]{0,100}low-risk[\s\S]{0,120}(?:clear(?:ly)? bounded|clear boundaries)/i,
    `${label}: the direct path must stay narrowly bounded`,
  )
  assert.match(text, /(?:explicit(?:ly)? user request|user explicitly requests)/i, `${label}: an explicit user-requested skip must remain available`)
  assert.match(
    text,
    /(?:clear requirements[^.]{0,180}(?:do not|not)[^.]{0,80}(?:exempt|escape|excuse)|even when (?:requirements|discovery)[^.]{0,140}clear)/i,
    `${label}: clarity, evidence, or capability must not become a complex-work escape`,
  )
  assert.doesNotMatch(text, /clear-boundary work with a single obvious path[^.]{0,120}execute directly/i)
  assert.doesNotMatch(
    text,
    /plan-critic[^\n.]{0,120}(?:optional|advisory by default|not a mandatory (?:gate|loop))/i,
    `${label}: plan criticism must not be downgraded to an optional complex-work stage`,
  )
}

async function assembledPrompt(workflow: Workflow, name: "orchestrator" | "planner", model: string): Promise<string> {
  loadAllPrompts(PROMPTS_ROOT, workflow)
  const configured = {
    ...defaultConfig(),
    workflow,
    agents: {
      ...defaultConfig().agents,
      [name]: { model },
    },
  }
  const target: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => configured })(target, undefined)
  return String((target.agent[name] as Record<string, unknown>).prompt ?? "")
}

test("planning policy stays consistent across role, model, and adapter layers", async () => {
  for (const workflow of WORKFLOWS) {
    const orchestrator = prompt(workflow, "agents", "orchestrator")
    const planner = prompt(workflow, "agents", "planner")
    const critic = prompt(workflow, "agents", "plan-critic")

    assertComplexPlanningDefault(orchestrator, `${workflow} orchestrator`)
    assert.match(orchestrator, /exclusive owner of workflow-agent composition/i)
    assert.match(orchestrator, /blocker must be corrected, rebutted with concrete evidence, or escalated/i)
    assert.match(orchestrator, /non-blocking improvements do not delay implementation/i)
    assert.match(orchestrator, /explanation or research requests still end in an answer/i)
    assert.match(orchestrator, /without adding a second approval gate to an already authorized task/i)
    assert.match(orchestrator, /user-requested planning skip never authorizes crossing security, data, public API\/protocol, permission, or irreversible-action boundaries/i)
    assert.match(orchestrator, /pure wording or documentation edit[\s\S]{0,160}limited, simple, low risk, and clearly bounded/i)
    assert.match(orchestrator, /unsuffixed normal profiles are the baseline/i)

    assert.match(planner, /planner never dispatches that review/i)
    assert.match(planner, /non-blocking suggestions do not hold implementation/i)
    assert.match(critic, /read-only blocker finder/i)
    assert.match(critic, /cannot be relabeled advisory and ignored/i)
    assert.match(critic, /do not require hashes, a fixed receipt or verdict format/i)
    assert.match(critic, /after a substantive change that affects the prior conclusion, revisit only the affected claims/i)

    for (const variant of DEEPWORK_VARIANTS) {
      const combined = `${orchestrator}\n\n${prompt(workflow, "deepwork", variant)}`
      assertComplexPlanningDefault(combined, `${workflow}/${variant}`)
    }

    for (const model of [
      "openai/gpt-5.6-sol",
      "openai/gpt-6-astra",
      "anthropic/claude-opus-5",
      "google/gemini-3-pro",
      "zhipu/glm-5.1",
    ]) {
      const assembled = await assembledPrompt(workflow, "orchestrator", model)
      assertComplexPlanningDefault(assembled, `${workflow} assembled orchestrator ${model}`)
      assert.ok(
        assembled.indexOf("Agent Role: orchestrator") < assembled.indexOf("workflow-model-calibration"),
        `${workflow}/${model}: role policy must precede model calibration`,
      )
    }

    const assembledPlanner = await assembledPrompt(workflow, "planner", "openai/gpt-5.6-sol")
    assertComplexPlanningDefault(assembledPlanner, `${workflow} assembled planner`)
    assert.match(assembledPlanner, /planner never dispatches that review/i)
  }

  loadAllPrompts(PROMPTS_ROOT, "v1")
})
