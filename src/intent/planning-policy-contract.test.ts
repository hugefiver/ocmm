import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import { defaultConfig } from "../config/schema.ts"
import { createConfigHandler } from "../hooks/config.ts"
import { getDeepworkPrompt, loadAllPrompts, type Workflow } from "./prompt-loader.ts"

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
  "claude-opus-5",
  "kimi-k27",
  "swe-2",
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
  assert.match(text, /(?:explicit(?:ly)? user(?: request|[- ]requested skip)|user explicitly requests)/i, `${label}: an explicit user-requested skip must remain available`)
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

function assertDelegationAndDeepThreshold(text: string, label: string): void {
  assert.match(
    text,
    /prefer to decompose authorized work yourself[\s\S]{0,140}best-fitting callable[\s\S]{0,30}subagent/i,
    `${label}: orchestrator must actively split and delegate bounded work`,
  )
  assert.match(
    text,
    /routine implementation or multi-file coordination[\s\S]{0,150}`coding`, `normal-task`, `complex`[\s\S]{0,170}multiple files or steps alone do not warrant `deep`[\s\S]{0,100}genuinely complex systems engineering/i,
    `${label}: routine and multi-file work must not default to deep`,
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
    assertDelegationAndDeepThreshold(orchestrator, `${workflow} orchestrator`)
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
      "openai/gpt-5.5",
      "openai/gpt-5.6-sol",
      "providers/openai/gpt-6-sol-fast",
      "openai/gpt-6-astra",
      "apai/gpt-6-luna",
      "amazon-bedrock/openai.gpt-7-preview",
      "openai/codex-mini-latest",
      "anthropic/claude-opus-5",
      "google/gemini-3-pro",
      "zhipu/glm-5.1",
    ]) {
      const assembled = await assembledPrompt(workflow, "orchestrator", model)
      assertComplexPlanningDefault(assembled, `${workflow} assembled orchestrator ${model}`)
      assertDelegationAndDeepThreshold(assembled, `${workflow} assembled orchestrator ${model}`)
      assert.ok(
        assembled.indexOf("Agent Role: orchestrator") < assembled.indexOf("workflow-model-calibration"),
        `${workflow}/${model}: role policy must precede model calibration`,
      )
    }

    for (const model of ["openai/gpt-5.5", "openai/gpt-5.6-sol", "openai/gpt-6-sol", "openai/gpt-6-astra", "apai/gpt-6-luna"]) {
      const assembledPlanner = await assembledPrompt(workflow, "planner", model)
      assertComplexPlanningDefault(assembledPlanner, `${workflow} assembled planner ${model}`)
      assert.match(assembledPlanner, /planner never dispatches that review/i)
      const calibration = getDeepworkPrompt("gpt").trim()
      assert.ok(calibration, `${workflow}: loaded GPT calibration`)
      assert.equal(assembledPlanner.split(calibration).length - 1, 1, `${workflow}/${model}: planner calibration once`)
      assert.ok(assembledPlanner.indexOf("Agent Role: planner") < assembledPlanner.indexOf(calibration))
      assert.match(assembledPlanner, /formal planner dispatch[\s\S]{0,200}orchestrator-owned/i)
    }
  }

  loadAllPrompts(PROMPTS_ROOT, "v1")
})

test("GPT delivery calibration and critic policy connect outcomes to proportionate reusable evidence", () => {
  for (const workflow of WORKFLOWS) {
    const gpt = prompt(workflow, "deepwork", "gpt")
    const critic = prompt(workflow, "agents", "plan-critic")
    const glm = prompt(workflow, "deepwork", "glm")
    assert.match(gpt, /complete[^.\n]{0,140}(?:outcome|result)/i, `${workflow}: full outcome`)
    assert.match(gpt, /worker[\s\S]{0,450}(?:caller|parent|orchestrator)/i, `${workflow}: worker stop boundary`)
    assert.match(gpt, /(?:role|permission)[\s\S]{0,250}(?:authoritative|override|boundar|scope)/i, `${workflow}: calibration cannot expand role`)
    assert.match(critic, /(?:critical|necessary|required|user)[^.\n]{0,180}(?:state|outcome|result)[\s\S]{0,350}evidence/i, `${workflow}: critic checks outcome-to-evidence coverage`)
    for (const [name, text] of [["gpt", gpt], ["glm", glm]] as const) {
      assert.match(text, /(?:reuse|re-use)[\s\S]{0,300}evidence/i, `${workflow}/${name}: evidence reuse`)
      assert.match(text, /(?:files|inputs)[\s\S]{0,180}dependenc[\s\S]{0,180}environment/i, `${workflow}/${name}: validity inputs`)
      assert.match(text, /(?:phase|stage)[\s\S]{0,350}(?:blocker|blocked)[\s\S]{0,350}(?:plan|change)/i, `${workflow}/${name}: substantive progress communication`)
      assert.doesNotMatch(text, /run one appropriate final pass|(?:always|mandatory|unconditional)[^\n.]{0,80}final (?:pass|verification)/i, `${workflow}/${name}: no unconditional rerun`)
    }
    assert.doesNotMatch(gpt, /GPT-5\.6 EXECUTION CALIBRATION|GPT-6 ASTRA EXECUTION CALIBRATION|(?:all|every) GPT[^.\n]{0,80}(?:support|native)[^.\n]{0,40}`max`/i)
    assert.doesNotMatch(critic, /(?:require|mandatory)[^.\n]{0,70}(?:IS table|fixed state table)/i)
  }
})
