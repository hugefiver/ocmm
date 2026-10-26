import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
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
  pickModelCalibrationVariants,
} from "./prompt-loader.ts"

const DEEPWORK_VARIANTS = ["default", "gpt", "claude-opus-5", "gemini", "glm", "codex", "planner", "kimi", "gemini-4", "swe-2"] as const

function makeTempRoot(workflow: "v1" | "codex"): string {
  const root = mkdtempSync(join(tmpdir(), "ocmm-prompts-"))
  mkdirSync(join(root, "shared"), { recursive: true })
  mkdirSync(join(root, workflow, "deepwork"), { recursive: true })
  mkdirSync(join(root, workflow, "agents"), { recursive: true })
  mkdirSync(join(root, workflow, "category"), { recursive: true })
  return root
}

const WORKFLOWS = ["v1", "codex"] as const

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
    writeFileSync(join(root, "codex", "deepwork", "gpt.md"), "gpt-content")
    writeFileSync(join(root, "codex", "deepwork", "claude-opus-5.md"), "claude-opus-5-content")
    writeFileSync(join(root, "codex", "deepwork", "kimi.md"), "kimi-content")
    writeFileSync(join(root, "codex", "deepwork", "gemini-4.md"), "gemini-4-content")
    writeFileSync(join(root, "codex", "deepwork", "swe-2.md"), "swe-2-content")
    loadAllPrompts(root, "codex")
    assert.equal(getDeepworkPrompt("glm"), "glm-content")
    assert.equal(getDeepworkPrompt("codex"), "codex-content")
    assert.equal(getDeepworkPrompt("gpt"), "gpt-content")
    assert.equal(getDeepworkPrompt("claude-opus-5"), "claude-opus-5-content")
    assert.equal(getDeepworkPrompt("kimi"), "kimi-content")
    assert.equal(getDeepworkPrompt("gemini-4"), "gemini-4-content")
    assert.equal(getDeepworkPrompt("swe-2"), "swe-2-content")
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
      assert.ok(getAgentPrompt(name).trim().length > 0, `${workflow}/${name} agent missing`)
    }
    for (const variant of DEEPWORK_VARIANTS) {
      assert.ok(getDeepworkPrompt(variant).trim().length > 0, `${workflow}/${variant} deepwork prompt missing`)
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
      "cross-cutting",
    ]) {
      assert.ok(getCategoryPrompt(category).trim().length > 0, `${workflow}/${category} category missing`)
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

test("all recognized GPT generations and aliases select the same calibration without changing planner identity", () => {
  for (const modelID of [
    "gpt-5.5",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "vercel/openai/gpt-5.6-luna",
    "amazon-bedrock/openai.gpt-5.6",
    "amazon-bedrock/us.openai.gpt-5.4",
    "gpt-5.7-sol",
    "gpt-6-sol",
    "gpt-6-sol-fast",
    "openai/gpt-6-sol",
    "providers/openai/gpt-6-sol-fast",
    "amazon-bedrock/openai.gpt-6-sol",
    "gpt-6-astra",
    "openai/gpt-6-astra-fast",
    "gpt-6-luna",
    "providers/openai/gpt-6-luna-fast",
    "gpt-6-preview",
    "amazon-bedrock/openai.gpt-7-preview",
  ]) {
    for (const agentName of ["builder", "orchestrator", "reviewer"]) {
      assert.equal(pickDeepworkVariantForAgent({ agentName, preferenceModel: modelID }), "gpt", `${agentName}/${modelID}`)
    }
    assert.equal(pickDeepworkVariantForAgent({ agentName: "planner", preferenceModel: modelID }), "planner", modelID)
    assert.deepEqual(pickModelCalibrationVariants(modelID), ["gpt"], modelID)
  }
})

test("pickDeepworkVariantForAgent reserves the Opus 5/5.5 calibration for orchestrator", () => {
  for (const modelID of [
    "claude-opus-5",
    "anthropic/claude-opus-5",
    "claude-opus-5-20260728",
    "claude-opus-5.latest",
    "claude-opus-5-5",
    "claude-opus-5.5",
    "anthropic/claude-opus-5-5",
    "claude-opus-5-5-20260728",
    "claude-opus-5-5@default",
    "amazon-bedrock/global.anthropic.claude-opus-5-5",
    "claude-opus-5@default",
    "claude-opus-5.5@default",
  ]) {
    assert.equal(
      pickDeepworkVariantForAgent({ agentName: "orchestrator", preferenceModel: modelID }),
      "claude-opus-5",
      modelID,
    )
  }
  for (const modelID of ["claude-opus-5", "claude-opus-5-5@default", "amazon-bedrock/global.anthropic.claude-opus-5-5"]) {
    for (const agentName of ["reviewer", "builder", "coding", "deep"]) {
      assert.equal(
        pickDeepworkVariantForAgent({ agentName, preferenceModel: modelID }),
        "default",
        `${agentName}/${modelID}`,
      )
    }
  }
  for (const modelID of [
    "claude-opus-5-5@other",
    "claude-opus-5-5@default-extra",
    "claude-opus-5-5@default@default",
    "claude-opus-5-50@default",
    "prefix-claude-opus-5-5@default",
    "amazon-bedrock/global.unknown.claude-opus-5-5",
    "amazon-bedrock/global.anthropic.anthropic.claude-opus-5-5",
    "amazon-bedrock/global.openai.claude-opus-5-5",
  ]) {
    assert.notEqual(
      pickDeepworkVariantForAgent({ agentName: "orchestrator", preferenceModel: modelID }),
      "claude-opus-5",
      modelID,
    )
  }
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "planner", preferenceModel: "claude-opus-5-5@default" }),
    "planner",
  )
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
  for (const modelID of ["codex-mini-latest", "openai/gpt-5.3-codex", "provider/codex-latest"]) {
    assert.deepEqual(pickModelCalibrationVariants(modelID), ["gpt"], modelID)
  }
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

test("additive model calibration selector distinguishes Kimi, Gemini 4, SWE-2, and carry-ahead", () => {
  const cases: Array<[string, readonly string[]]> = [
    ["moonshot/KIMI-K2.7", ["kimi"]],
    ["moonshot/kimi-k2-8-preview", ["kimi"]],
    ["kimi-for-coding/kimi-for-coding", ["kimi"]],
    ["kimi-for-coding/kimi-for-coding-highspeed", ["kimi"]],
    ["devin/swe-2-high", ["swe-2"]],
    ["DEVIN/SWE-2.MAX", ["swe-2"]],
    ["devin/swe-20", []],
    ["provider-kimi-for-coding/unrelated", []],
    ["moonshot/kimi-k2.6", ["kimi"]],
    ["moonshot/kimi-k3", ["kimi"]],
    ["moonshot/kimi-k3.1", ["kimi"]],
    ["moonshot/k2-p5", ["kimi"]],
    ["google/gemini-4-argon", ["gemini-4"]],
    ["provider/us.google.gemini-4.1-pro", ["gemini-4"]],
    ["google/gemini-40-pro", []],
    ["unknown/model", []],
    ["zhipu/glm-5.2", []],
    ["google/gemini-3.1-pro", []],
    ["anthropic/claude-opus-5", []],
  ]
  for (const [modelID, expected] of cases) {
    assert.deepEqual(pickModelCalibrationVariants(modelID), expected, modelID)
  }
  assert.deepEqual(pickModelCalibrationVariants("unknown/model", true), ["gpt", "kimi", "gemini-4", "swe-2"])
})

test("shipped categories have no separate generation-specific calibration", () => {
  const root = join(process.cwd(), "prompts")
  for (const workflow of WORKFLOWS) {
    loadAllPrompts(root, workflow)
    for (const name of ["hard-reasoning", "deep", "cross-cutting", "frontend", "creative", "research", "quick", "coding", "normal-task", "complex", "documenting"]) {
      for (const model of ["gpt-5.5", "gpt-5.6-sol", "openai/gpt-6-sol", "gpt-6-astra", "gpt-6-luna", "claude-opus-5"]) {
        assert.equal(getCategoryModelCalibration(name, model), "", `${workflow}/${name}/${model}`)
        assert.equal(getCategoryModelCalibration(name, model, true), "", `${workflow}/${name}/${model} carry-ahead`)
      }
    }
  }
})

test("category extension seam selects model families, ignores unsupported keys, and clears on reload", () => {
  const root = makeTempRoot("v1")
  try {
    writeFileSync(join(root, "v1", "category", "deep.md"), [
      "category-role",
      '<model-calibration model="gpt">\ngeneric-gpt-extension\n</model-calibration>',
      '<model-calibration model="gemini">\ngemini-extension\n</model-calibration>',
      '<model-calibration model="kimi-k27">\nkimi-family-extension\n</model-calibration>',
      '<model-calibration model="swe-2">\nswe-extension\n</model-calibration>',
      '<model-calibration model="unsupported-family">\nunsupported-extension\n</model-calibration>',
    ].join("\n"))
    loadAllPrompts(root, "v1")
    assert.equal(getCategoryPrompt("deep").trim(), "category-role")
    for (const model of ["gpt-5.6-sol", "openai/gpt-6-astra-fast", "gpt-6-luna", "codex-mini-latest"]) {
      assert.equal(getCategoryModelCalibration("deep", model), "generic-gpt-extension", model)
    }
    assert.equal(getCategoryModelCalibration("deep", "google/gemini-3-pro"), "gemini-extension")
    assert.equal(getCategoryModelCalibration("deep", "anthropic/claude-opus-5"), "")
    assert.equal(getCategoryModelCalibration("deep", "moonshot/kimi-k2.7"), "kimi-family-extension")
    assert.equal(getCategoryModelCalibration("deep", "unknown/model", true), "generic-gpt-extension\n\n---\n\nkimi-family-extension\n\n---\n\nswe-extension")
    writeFileSync(join(root, "v1", "category", "deep.md"), "replacement-role")
    loadAllPrompts(root, "v1")
    assert.equal(getCategoryPrompt("deep"), "replacement-role")
    assert.equal(getCategoryModelCalibration("deep", "gpt-6-astra", true), "")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
