import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { defaultConfig } from "../config/schema.ts"
import { createConfigHandler } from "../hooks/config.ts"
import { loadAllPrompts } from "./prompt-loader.ts"

test("planning role composition orders and deduplicates synthetic model layers", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-planning-composition-"))
  const variants = ["default", "gpt", "claude", "grok", "deepseek", "gemini", "gemini-4", "glm", "codex", "planner", "kimi", "kimi-k3-1", "swe-2"]
  const roles = ["orchestrator", "reviewer", "planner", "clarifier", "plan-critic"]
  const marker = (area: string, name: string) => `[fixture:${area}:${name}]`
  try {
    mkdirSync(join(root, "skills"))
    for (const workflow of ["v1", "codex"] as const) {
      for (const [area, names] of [["agents", roles], ["deepwork", variants]] as const) {
        mkdirSync(join(root, workflow, area), { recursive: true })
        for (const name of names) {
          writeFileSync(join(root, workflow, area, `${name}.md`), marker(area, name))
        }
      }
      mkdirSync(join(root, workflow, "category"), { recursive: true })
      writeFileSync(join(root, workflow, "category", "deep.md"), marker("category", "deep"))
      loadAllPrompts(root, workflow)

      for (const [model, selectedVariant, calibration] of [
        ["openai/gpt-5.5", "gpt", "gpt"],
        ["providers/openai/gpt-6-sol-fast", "gpt", "gpt"],
        ["amazon-bedrock/openai.gpt-7-preview", "gpt", "gpt"],
        ["openai/codex-mini-latest", "codex", "gpt"],
        ["anthropic/claude", "default", "claude"],
        ["anthropic/claude-opus-5", "default", "claude"],
        ["anthropic/claude-sonnet-4-6", "default", "claude"],
        ["anthropic/claude-haiku-4-5", "default", "claude"],
        ["anthropic/claude-fable-5.10", "default", "claude"],
        ["gateway/mythos-6-gpt-6", "default", "claude"],
        ["xai/grok-4", "default", "grok"],
        ["github-copilot/grok-4-gpt-6", "default", "grok"],
        ["deepseek/deepseek-v4-pro", "default", "deepseek"],
        ["deepseek/deepseek-flash", "default", "deepseek"],
        ["google/gemini-3-pro", "gemini", ""],
        ["google/gemini-4-argon", "gemini", "gemini-4"],
        ["openai/gpt-6.2-astra", "gpt", "gpt"], ["openai/gpt-6.2-sol", "gpt", "gpt"],
        ["google/gemini-5-pro", "gemini", "gemini-4"], ["anthropic/opus6.1", "default", "claude"],
        ["zhipu/glm-5.1", "glm", ""],
        ["moonshot/kimi-k2.8", "default", "kimi"],
        ["moonshot/kimi-k3.1", "default", "kimi-k3-1"],
        ["devin/swe-2-high", "default", "swe-2"],
        ["provider-kimi-for-coding/unrelated", "default", ""],
        ["gemini-4-provider/unrelated", "default", ""],
        ["swe-2-provider/unrelated", "default", ""],
        ["gpt-6-sol/gemini-4-pro", "gemini", "gemini-4"],
        ["gateway/gpt-6-sol/gemini-4-pro", "gpt", "gpt"],
        ["gateway/auto-gpt/6.1/sol", "gpt", "gpt"],
        ["gateway/auto-swe/2/high-gpt-6", "default", "swe-2"],
        ["gateway/auto-k2p8-gpt-6", "default", "kimi"],
        ["gateway/auto-claude_opus_5_5-20261101", "default", "claude"],
        ["codex/gpt-5.6", "gpt", "gpt"],
        ["google/sol6.1", "gpt", "gpt"],
        ["anthropic/gpt6.1sol", "gpt", "gpt"],
        ["gateway/sol6.1-codex", "codex", "gpt"],
        ["gateway/opus4.7", "default", "claude"],
        ["gateway/opus5.5-2m", "default", "claude"],
        ["gateway/opus5.5foo-gpt6.1sol", "default", "claude"],
        ["gateway/sonnet5.5", "default", "claude"],
        ["gateway/haiku5", "default", "claude"],
        ["6.1sol/gemini-4-pro", "gemini", "gemini-4"],
        ["gateway/6.1sol/gemini-4-pro", "gpt", "gpt"],
      ]) {
        const configured = {
          ...defaultConfig(),
          workflow,
          agents: {
            orchestrator: { model },
            reviewer: { model },
            planner: { model, variants: { high: "high" as const } },
            clarifier: { model },
            "plan-critic": { model, variants: { low: "low" as const } },
          },
          categories: { deep: { model } },
        }
        const target: { agent: Record<string, unknown> } = { agent: {} }
        await createConfigHandler({ getConfig: () => configured, skillsRoot: join(root, "skills") })(target, undefined)
        assert.equal((target.agent.orchestrator as Record<string, unknown>).model, model)
        const modelBase = selectedVariant
        const category = target.agent.deep as Record<string, unknown>
        assert.equal(category.model, model)
        const categoryPrompt = String(category.prompt)
        const categoryRoleMarker = marker("category", "deep")
        const categoryLayers = [...new Set([
          modelBase,
          ...(workflow === "codex" ? ["codex"] : []),
          ...(calibration ? [calibration] : []),
        ])]
        assert.equal(categoryPrompt.split(categoryRoleMarker).length - 1, 1, `${workflow}/${model}/category/role once`)
        let previousCategoryLayer = categoryPrompt.indexOf(categoryRoleMarker)
        for (const layer of categoryLayers) {
          const layerMarker = marker("deepwork", layer)
          assert.equal(categoryPrompt.split(layerMarker).length - 1, 1, `${workflow}/${model}/category/${layer}: once`)
          const index = categoryPrompt.indexOf(layerMarker)
          assert.ok(index > previousCategoryLayer, `${workflow}/${model}/category/${layer}: layer order`)
          previousCategoryLayer = index
        }
        for (const layer of variants.filter((variant) => !categoryLayers.includes(variant))) {
          assert.equal(categoryPrompt.includes(marker("deepwork", layer)), false, `${workflow}/${model}/category/${layer}: not selected`)
        }

        for (const name of ["orchestrator", "reviewer", "planner", "planner-high", "clarifier", "plan-critic", "plan-critic-low"]) {
          const role = name === "planner-high" ? "planner" : name === "plan-critic-low" ? "plan-critic" : name
          const entry = target.agent[name] as Record<string, unknown>
          const assembled = String(entry.prompt)
          const expectedLayers = [...new Set([
            ...(role === "planner" ? ["planner", modelBase] : [modelBase]),
            ...(workflow === "codex" ? ["codex"] : []),
            ...(calibration ? [calibration] : []),
          ])]
          const roleMarker = marker("agents", role)
          assert.equal(assembled.split(roleMarker).length - 1, 1, `${workflow}/${model}/${name}: role once`)
          let previous = assembled.indexOf(roleMarker)
          for (const layer of expectedLayers) {
            const layerMarker = marker("deepwork", layer)
            assert.equal(assembled.split(layerMarker).length - 1, 1, `${workflow}/${model}/${name}/${layer}: once`)
            const index = assembled.indexOf(layerMarker)
            assert.ok(index > previous, `${workflow}/${model}/${name}/${layer}: layer order`)
            previous = index
          }
          for (const layer of variants.filter((variant) => !expectedLayers.includes(variant))) {
            assert.equal(assembled.includes(marker("deepwork", layer)), false, `${workflow}/${model}/${name}/${layer}: not selected`)
          }
          if (role === "plan-critic") {
            const permission = entry.permission as Record<string, unknown>
            const task = permission.task as Record<string, unknown>
            assert.equal(entry.mode, "subagent", `${workflow}/${model}/${name}: subagent mode`)
            assert.equal(task["*"], "deny", `${workflow}/${model}/${name}: deny unknown delegation`)
            assert.equal(task["code-search"], "allow", `${workflow}/${model}/${name}: read-only utility allowed`)
            assert.equal(task.coding, undefined, `${workflow}/${model}/${name}: editing worker excluded`)
            assert.equal(assembled.split("<ocmm-delegation-contract>").length - 1, 1, `${workflow}/${model}/${name}: delegation boundary once`)
            assert.equal(assembled.split("<ocmm-workflow-boundaries>").length - 1, 1, `${workflow}/${model}/${name}: workflow boundary once`)
          }
        }
      }
      for (const catalogModel of ["Group/GPT 6_2_ASTRA-fast", "Group/6.2Astra-128k"]) {
        const target = {
          agent: {} as Record<string, unknown>,
          provider: { openai: { models: { [catalogModel]: {} } } },
        }
        await createConfigHandler({ getConfig: () => ({ ...defaultConfig(), workflow }), skillsRoot: join(root, "skills") })(target, undefined)
        for (const name of ["orchestrator", "deep"]) {
          const assembled = target.agent[name] as Record<string, unknown>
          assert.equal(assembled.model, `openai/${catalogModel}`)
          assert.equal(String(assembled.prompt).split(marker("deepwork", "gpt")).length - 1, 1)
        }
      }
    }
  } finally {
    loadAllPrompts(join(process.cwd(), "prompts"), "v1")
    rmSync(root, { recursive: true, force: true })
  }
})
