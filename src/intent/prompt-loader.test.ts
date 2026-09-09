import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  loadAllPrompts,
  getDeepworkPrompt,
  getAgentPrompt,
  getCategoryPrompt,
  getCategoryModelCalibration,
  getShellSafetyPrompt,
  pickDeepworkVariantForAgent,
  isGpt56Model,
  isGpt6Model,
} from "./prompt-loader.ts"

const DEEPWORK_VARIANTS = ["default", "gpt", "gpt-5.6", "gpt-6-astra", "claude-opus-5", "gemini", "glm", "codex", "planner"] as const

function makeTempRoot(workflow: "v1" | "codex"): string {
  const root = mkdtempSync(join(tmpdir(), "ocmm-prompts-"))
  mkdirSync(join(root, "shared"), { recursive: true })
  mkdirSync(join(root, workflow, "deepwork"), { recursive: true })
  mkdirSync(join(root, workflow, "agents"), { recursive: true })
  mkdirSync(join(root, workflow, "category"), { recursive: true })
  return root
}

const GPT56_WORKFLOWS = ["v1", "codex"] as const

test("loadAllPrompts loads files from the workflow subdir", () => {
  const root = makeTempRoot("codex")
  try {
    writeFileSync(join(root, "codex", "deepwork", "default.md"), "default-content")
    writeFileSync(join(root, "codex", "category", "frontend.md"), "frontend-content")
    loadAllPrompts(root, "codex")
    assert.equal(getDeepworkPrompt("default"), "default-content")
    assert.equal(getCategoryPrompt("frontend"), "frontend-content")
    assert.equal(getCategoryPrompt("documenting"), "")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadAllPrompts loads the workflow-independent shell safety prompt", () => {
  const root = makeTempRoot("v1")
  try {
    writeFileSync(join(root, "shared", "shell-safety.md"), "shell-safety-content")
    loadAllPrompts(root, "v1")
    assert.equal(getShellSafetyPrompt(), "shell-safety-content")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadAllPrompts defaults to v1 workflow", () => {
  const root = makeTempRoot("v1")
  try {
    writeFileSync(join(root, "v1", "deepwork", "planner.md"), "planner-content")
    loadAllPrompts(root)
    assert.equal(getDeepworkPrompt("planner"), "planner-content")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("reload clears stale cache so removed files disappear", () => {
  const rootA = makeTempRoot("v1")
  const rootB = makeTempRoot("codex")
  try {
    writeFileSync(join(rootA, "v1", "deepwork", "default.md"), "from-v1")
    loadAllPrompts(rootA, "v1")
    assert.equal(getDeepworkPrompt("default"), "from-v1")

    writeFileSync(join(rootB, "codex", "deepwork", "gpt.md"), "from-codex")
    loadAllPrompts(rootB, "codex")
    assert.equal(getDeepworkPrompt("default"), "", "stale default.md must be gone after reload")
    assert.equal(getDeepworkPrompt("gpt"), "from-codex")
    assert.equal(getShellSafetyPrompt(), "", "stale shell safety prompt must be gone after reload")
  } finally {
    rmSync(rootA, { recursive: true, force: true })
    rmSync(rootB, { recursive: true, force: true })
  }
})

test("loadAllPrompts loads specialized deepwork variants", () => {
  const root = makeTempRoot("codex")
  try {
    writeFileSync(join(root, "codex", "deepwork", "glm.md"), "glm-content")
    writeFileSync(join(root, "codex", "deepwork", "codex.md"), "codex-content")
    writeFileSync(join(root, "codex", "deepwork", "gpt-5.6.md"), "gpt-5.6-content")
    writeFileSync(join(root, "codex", "deepwork", "claude-opus-5.md"), "claude-opus-5-content")
    loadAllPrompts(root, "codex")
    assert.equal(getDeepworkPrompt("glm"), "glm-content")
    assert.equal(getDeepworkPrompt("codex"), "codex-content")
    assert.equal(getDeepworkPrompt("gpt-5.6"), "gpt-5.6-content")
    assert.equal(getDeepworkPrompt("claude-opus-5"), "claude-opus-5-content")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadAllPrompts loads functional agent prompts", () => {
  const root = makeTempRoot("v1")
  try {
    writeFileSync(join(root, "v1", "agents", "reviewer.md"), "reviewer-role")
    writeFileSync(join(root, "v1", "agents", "plan-critic.md"), "plan-critic-role")
    loadAllPrompts(root, "v1")
    assert.equal(getAgentPrompt("reviewer"), "reviewer-role")
    assert.equal(getAgentPrompt("plan-critic"), "plan-critic-role")
    assert.equal(getAgentPrompt("builder"), "")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("real workflows load functional agents, deepwork prompts, and categories", () => {
  const root = join(process.cwd(), "prompts")
  for (const workflow of ["v1", "codex"] as const) {
    loadAllPrompts(root, workflow)
    for (const name of ["orchestrator", "reviewer", "planner", "clarifier", "plan-critic"]) {
      const source = readFileSync(join(root, workflow, "agents", `${name}.md`), "utf8")
      assert.ok(source.length > 0, `${workflow}/${name} source missing`)
      assert.equal(getAgentPrompt(name).trim(), source.trim(), `${workflow}/${name}`)
    }
    for (const variant of DEEPWORK_VARIANTS) {
      const prompt = getDeepworkPrompt(variant)
      const source = readFileSync(join(root, workflow, "deepwork", `${variant}.md`), "utf8")
      assert.ok(source.length > 0, `${workflow}/${variant} source missing`)
      assert.equal(prompt.trim(), source.trim(), `${workflow}/${variant}`)
    }
    for (const category of [
      "frontend",
      "creative",
      "hard-reasoning",
      "research",
      "quick",
      "coding",
      "normal-task",
      "complex",
      "deep",
      "documenting",
    ]) {
      const source = readFileSync(join(root, workflow, "category", `${category}.md`), "utf8")
      assert.ok(source.length > 0, `${workflow}/${category} source missing`)
      const loaded = getCategoryPrompt(category).trim()
      assert.ok(loaded.length > 0, `${workflow}/${category} category missing`)
      assert.ok(source.trim().startsWith(loaded), `${workflow}/${category}`)
    }
  }
})

test("pickDeepworkVariantForAgent picks planner for planner agent", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "planner", preferenceModel: "claude-opus-5" }),
    "planner",
  )
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "plan", preferenceModel: "anything" }),
    "planner",
  )
})

test("pickDeepworkVariantForAgent picks gpt variant for gpt model", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "builder", preferenceModel: "gpt-5.5" }),
    "gpt",
  )
})

test("pickDeepworkVariantForAgent isolates GPT-5.6 from other GPT families", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "builder", preferenceModel: "gpt-5.6-sol" }),
    "gpt-5.6",
  )
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "builder", preferenceModel: "amazon-bedrock/openai.gpt-5.6" }),
    "gpt-5.6",
  )
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "builder", preferenceModel: "amazon-bedrock/us.openai.gpt-5.4" }),
    "gpt",
  )
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "builder", preferenceModel: "gpt-5.7-sol" }),
    "gpt",
  )
  assert.equal(isGpt56Model("vercel/openai/gpt-5.6-terra"), true)
  assert.equal(isGpt56Model("amazon-bedrock/openai.gpt-5.6"), true)
  assert.equal(isGpt56Model("gpt-5.7-sol"), false)
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "orchestrator", preferenceModel: "gpt-5.6-terra" }),
    "gpt-5.6",
  )
})

test("pickDeepworkVariantForAgent reserves the Astra variant for GPT-6 Astra", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "builder", preferenceModel: "gpt-6-astra" }),
    "gpt-6-astra",
  )
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "builder", preferenceModel: "openai/gpt-6-astra-fast" }),
    "gpt-6-astra",
  )
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "builder", preferenceModel: "amazon-bedrock/openai.gpt-7-preview" }),
    "gpt",
  )
  assert.equal(isGpt56Model("gpt-6-astra"), false)
  assert.equal(isGpt6Model("gpt-6-astra"), true)
  assert.equal(isGpt6Model("openai/gpt-6-astra-fast"), true)
  assert.equal(isGpt6Model("gpt-6-preview"), false)
  assert.equal(isGpt6Model("gpt-7-preview"), false)
  assert.equal(isGpt6Model("gpt-5.6-sol"), false)
})

test("pickDeepworkVariantForAgent reserves the Opus 5 calibration for orchestrator", () => {
  for (const modelID of [
    "claude-opus-5",
    "anthropic/claude-opus-5",
    "claude-opus-5-20260728",
    "claude-opus-5.latest",
  ]) {
    assert.equal(
      pickDeepworkVariantForAgent({ agentName: "orchestrator", preferenceModel: modelID }),
      "claude-opus-5",
      modelID,
    )
  }
  for (const agentName of ["reviewer", "coding", "deep"]) {
    assert.equal(
      pickDeepworkVariantForAgent({ agentName, preferenceModel: "claude-opus-5" }),
      "default",
      agentName,
    )
  }
})

test("pickDeepworkVariantForAgent picks gemini variant for gemini model", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "reviewer", preferenceModel: "gemini-3.1-pro" }),
    "gemini",
  )
})

test("pickDeepworkVariantForAgent picks glm variant for GLM models", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "orchestrator", preferenceModel: "glm-5.1" }),
    "glm",
  )
})

test("pickDeepworkVariantForAgent picks codex variant for Codex models", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "builder", preferenceModel: "codex-mini-latest" }),
    "codex",
  )
})

test("pickDeepworkVariantForAgent defaults for unknown families", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "orchestrator", preferenceModel: "claude-opus-4-7" }),
    "default",
  )
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "orchestrator", preferenceModel: "unknown-model" }),
    "default",
  )
})

test("category files expose GPT-6 Astra calibrations for only three categories", () => {
  const root = join(process.cwd(), "prompts")
  const expected = ["hard-reasoning", "deep", "cross-cutting"]
  for (const workflow of GPT56_WORKFLOWS) {
    loadAllPrompts(root, workflow)
    for (const name of expected) {
      const category = getCategoryPrompt(name)
      const calibration = getCategoryModelCalibration(name, "gpt-6-astra")
      assert.doesNotMatch(category, /<model-calibration/, `${workflow}/category/${name}.md base leaked marker`)
      assert.ok(calibration.length > 0, `${workflow}/category/${name}.md Astra calibration missing`)
      assert.equal(getCategoryModelCalibration(name, "openai/gpt-6-astra-fast"), calibration)
      assert.equal(getCategoryModelCalibration(name, "gpt-6-preview"), "")
      assert.equal(getCategoryModelCalibration(name, "gpt-7-preview"), "")
      assert.equal(getCategoryModelCalibration(name, "gpt-5.6-sol"), "")
      assert.equal(getCategoryModelCalibration(name, "gpt-5.6-sol", true), calibration)
    }
    for (const name of ["frontend", "creative", "research", "quick", "coding", "normal-task", "complex", "documenting"]) {
      assert.equal(getCategoryModelCalibration(name, "gpt-6-astra"), "", `${workflow}/category/${name}.md must have no Astra block`)
    }
  }
})
