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
  pickDeepworkVariantForAgent,
} from "./prompt-loader.ts"

function makeTempRoot(workflow: "omo" | "v1"): string {
  const root = mkdtempSync(join(tmpdir(), "ocmm-prompts-"))
  mkdirSync(join(root, workflow, "deepwork"), { recursive: true })
  mkdirSync(join(root, workflow, "agents"), { recursive: true })
  mkdirSync(join(root, workflow, "category"), { recursive: true })
  return root
}

test("loadAllPrompts loads files from the workflow subdir", () => {
  const root = makeTempRoot("omo")
  try {
    writeFileSync(join(root, "omo", "deepwork", "default.md"), "default-content")
    writeFileSync(join(root, "omo", "category", "frontend.md"), "frontend-content")
    loadAllPrompts(root, "omo")
    assert.equal(getDeepworkPrompt("default"), "default-content")
    assert.equal(getCategoryPrompt("frontend"), "frontend-content")
    assert.equal(getCategoryPrompt("documenting"), "")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadAllPrompts defaults to omo workflow", () => {
  const root = makeTempRoot("omo")
  try {
    writeFileSync(join(root, "omo", "deepwork", "planner.md"), "planner-content")
    loadAllPrompts(root)
    assert.equal(getDeepworkPrompt("planner"), "planner-content")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("reload clears stale cache so removed files disappear", () => {
  const rootA = makeTempRoot("omo")
  const rootB = makeTempRoot("v1")
  try {
    writeFileSync(join(rootA, "omo", "deepwork", "default.md"), "from-omo")
    loadAllPrompts(rootA, "omo")
    assert.equal(getDeepworkPrompt("default"), "from-omo")

    writeFileSync(join(rootB, "v1", "deepwork", "gpt.md"), "from-v1")
    loadAllPrompts(rootB, "v1")
    assert.equal(getDeepworkPrompt("default"), "", "stale default.md must be gone after reload")
    assert.equal(getDeepworkPrompt("gpt"), "from-v1")
  } finally {
    rmSync(rootA, { recursive: true, force: true })
    rmSync(rootB, { recursive: true, force: true })
  }
})

test("loadAllPrompts loads glm and codex deepwork variants", () => {
  const root = makeTempRoot("omo")
  try {
    writeFileSync(join(root, "omo", "deepwork", "glm.md"), "glm-content")
    writeFileSync(join(root, "omo", "deepwork", "codex.md"), "codex-content")
    loadAllPrompts(root, "omo")
    assert.equal(getDeepworkPrompt("glm"), "glm-content")
    assert.equal(getDeepworkPrompt("codex"), "codex-content")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadAllPrompts loads functional agent prompts", () => {
  const root = makeTempRoot("omo")
  try {
    writeFileSync(join(root, "omo", "agents", "reviewer.md"), "reviewer-role")
    writeFileSync(join(root, "omo", "agents", "plan-critic.md"), "plan-critic-role")
    loadAllPrompts(root, "omo")
    assert.equal(getAgentPrompt("reviewer"), "reviewer-role")
    assert.equal(getAgentPrompt("plan-critic"), "plan-critic-role")
    assert.equal(getAgentPrompt("worker"), "")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("real workflows include functional agents and wrapped v1 deepwork prompts", () => {
  const root = join(process.cwd(), "prompts")
  for (const workflow of ["omo", "v1"] as const) {
    loadAllPrompts(root, workflow)
    for (const name of ["orchestrator", "reviewer", "planner", "clarifier", "plan-critic"]) {
      assert.match(getAgentPrompt(name), new RegExp(`Agent Role: ${name}`), `${workflow}/${name}`)
    }
    for (const variant of ["default", "gpt", "gemini", "glm", "codex", "planner"] as const) {
      const prompt = getDeepworkPrompt(variant)
      assert.ok(prompt.length > 0, `${workflow}/${variant} prompt missing`)
      if (workflow === "v1") {
        assert.match(prompt, /^<deepwork-mode>/, `${workflow}/${variant} missing opening tag`)
        assert.match(prompt, /<\/deepwork-mode>\s*$/, `${workflow}/${variant} missing closing tag`)
      }
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
      assert.ok(getCategoryPrompt(category).length > 0, `${workflow}/${category} category missing`)
    }
  }
})

test("pickDeepworkVariantForAgent picks planner for planner agent", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "planner", preferenceModel: "claude-opus-4-7" }),
    "planner",
  )
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "plan", preferenceModel: "anything" }),
    "planner",
  )
})

test("pickDeepworkVariantForAgent picks gpt variant for gpt model", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "worker", preferenceModel: "gpt-5.5" }),
    "gpt",
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
    pickDeepworkVariantForAgent({ agentName: "worker", preferenceModel: "codex-mini-latest" }),
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
