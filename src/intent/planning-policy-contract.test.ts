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
  const variants = ["default", "gpt", "glm", "gemini", "codex", "planner", "claude-opus-5", "kimi", "gemini-4", "swe-2"]
  const roles = ["orchestrator", "planner", "plan-critic"]
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
      loadAllPrompts(root, workflow)

      for (const [model, selectedVariant, calibration] of [
        ["openai/gpt-5.5", "gpt", "gpt"],
        ["providers/openai/gpt-6-sol-fast", "gpt", "gpt"],
        ["amazon-bedrock/openai.gpt-7-preview", "gpt", "gpt"],
        ["openai/codex-mini-latest", "codex", "gpt"],
        ["anthropic/claude-opus-5", "claude-opus-5", ""],
        ["google/gemini-3-pro", "gemini", ""],
        ["google/gemini-4-argon", "gemini", "gemini-4"],
        ["zhipu/glm-5.1", "glm", ""],
        ["moonshot/kimi-k2.8", "default", "kimi"],
        ["moonshot/kimi-k3.1", "default", "kimi"],
        ["devin/swe-2-high", "default", "swe-2"],
      ]) {
        const configured = {
          ...defaultConfig(),
          workflow,
          agents: {
            orchestrator: { model },
            planner: { model, variants: { high: "high" as const } },
            "plan-critic": { model, variants: { low: "low" as const } },
          },
        }
        const target: { agent: Record<string, unknown> } = { agent: {} }
        await createConfigHandler({ getConfig: () => configured, skillsRoot: join(root, "skills") })(target, undefined)

        for (const name of ["orchestrator", "planner", "planner-high", "plan-critic", "plan-critic-low"]) {
          const role = name === "planner-high" ? "planner" : name === "plan-critic-low" ? "plan-critic" : name
          const assembled = String((target.agent[name] as Record<string, unknown>).prompt)
          const expectedLayers = workflow === "codex"
            ? [
              ...(role === "planner" ? ["planner"] : []),
              "codex",
              ...(role === "orchestrator" ? ["claude-opus-5"] : []),
              "gpt", "kimi", "gemini-4", "swe-2",
            ]
            : [...new Set([
              ...(role === "planner" ? ["planner"] : selectedVariant === "claude-opus-5" && role === "orchestrator"
                ? ["default", "claude-opus-5"]
                : [selectedVariant === "claude-opus-5" ? "default" : selectedVariant!]),
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
        }
      }
    }
  } finally {
    loadAllPrompts(join(process.cwd(), "prompts"), "v1")
    rmSync(root, { recursive: true, force: true })
  }
})
