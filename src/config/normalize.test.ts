import { test } from "node:test"
import assert from "node:assert/strict"

import { OcmmConfigSchema } from "./schema.ts"
import { normalizeShorthand } from "./normalize.ts"

test("schema accepts omo-style category shorthand: model + fallbackModels", () => {
  const parsed = OcmmConfigSchema.safeParse({
    categories: {
      frontend: {
        model: "hoo/deepseek-v4-pro",
        fallbackModels: ["hoo/kimi-k2.6", "hoo/glm-5.2"],
      },
    },
  })
  assert.equal(parsed.success, true)
  if (!parsed.success) return
  assert.equal(parsed.data.categories?.frontend?.model, "hoo/deepseek-v4-pro")
  assert.equal(parsed.data.categories?.frontend?.fallbackModels?.length, 2)
})

test("schema accepts mixed string + object entries in fallbackModels", () => {
  const parsed = OcmmConfigSchema.safeParse({
    categories: {
      "hard-reasoning": {
        model: "hoo/deepseek-v4-pro",
        variant: "max",
        fallbackModels: [
          "hoo/glm-5.2",
          { providers: ["hoo"], model: "kimi-k2.6", variant: "high" },
        ],
      },
    },
  })
  assert.equal(parsed.success, true)
})

test("schema accepts agents shorthand identical to categories", () => {
  const parsed = OcmmConfigSchema.safeParse({
    agents: {
      orchestrator: {
        model: "hoo/glm-5.2",
        fallbackModels: ["hoo/kimi-k2.6"],
      },
    },
  })
  assert.equal(parsed.success, true)
})

test("schema accepts shared skills namespace", () => {
  const parsed = OcmmConfigSchema.safeParse({
    skills: {
      sources: [
        "./skills-extra",
        { path: "./more-skills", recursive: false, glob: "git-*" },
      ],
      enable: ["git-master"],
      disable: ["debugging"],
    },
  })
  assert.equal(parsed.success, true)
  if (!parsed.success) return
  assert.deepEqual(parsed.data.skills.enable, ["git-master"])
  assert.deepEqual(parsed.data.skills.disable, ["debugging"])
  assert.deepEqual(parsed.data.skills.sources[1], {
    path: "./more-skills",
    recursive: false,
    glob: "git-*",
  })
})

test("schema defaults shared skills namespace to empty arrays", () => {
  const parsed = OcmmConfigSchema.parse({})
  assert.deepEqual(parsed.skills, { sources: [], enable: [], disable: [] })
})

test("schema accepts hashline namespace and defaults disabled", () => {
  assert.deepEqual(OcmmConfigSchema.parse({}).hashline, { enabled: false })

  const parsed = OcmmConfigSchema.safeParse({ hashline: { enabled: true } })
  assert.equal(parsed.success, true)
  if (!parsed.success) return
  assert.equal(parsed.data.hashline.enabled, true)
})

test("schema accepts rich agent override fields", () => {
  const parsed = OcmmConfigSchema.safeParse({
    agents: {
      reviewer: {
        model: "openai/gpt-5.5",
        tools: { bash: false, read: true },
        skills: ["git-master", "debugging"],
        promptAppend: "file://./reviewer-extra.md",
        temperature: 0.2,
        topP: 0.9,
        maxTokens: 12000,
        thinking: { type: "enabled", budgetTokens: 2000 },
        reasoningEffort: "high",
      },
    },
  })
  assert.equal(parsed.success, true)
  if (!parsed.success) return
  assert.deepEqual(parsed.data.agents?.reviewer?.tools, { bash: false, read: true })
  assert.deepEqual(parsed.data.agents?.reviewer?.skills, ["git-master", "debugging"])
  assert.equal(parsed.data.agents?.reviewer?.promptAppend, "file://./reviewer-extra.md")
  assert.equal(parsed.data.agents?.reviewer?.reasoningEffort, "high")
})

test("schema keeps categories strict for agent-only override fields", () => {
  const parsed = OcmmConfigSchema.safeParse({
    categories: {
      frontend: {
        model: "openai/gpt-5.5",
        tools: { bash: false },
      },
    },
  })
  assert.equal(parsed.success, false)
})

test("normalizeShorthand turns shorthand model into single-entry chain", () => {
  const norm = normalizeShorthand({ model: "hoo/glm-5.2" })
  assert.ok(norm)
  assert.deepEqual(norm!.requirement?.fallbackChain, [
    { providers: ["hoo"], model: "glm-5.2" },
  ])
})

test("normalizeShorthand promotes top-level variant onto first entry", () => {
  const norm = normalizeShorthand({
    model: "openai/gpt-5.5",
    variant: "high",
  })
  assert.equal(norm!.requirement?.variant, "high")
  assert.equal(norm!.requirement?.fallbackChain[0]?.variant, "high")
})

test("normalizeShorthand expands fallbackModels strings", () => {
  const norm = normalizeShorthand({
    model: "hoo/glm-5.2",
    fallbackModels: ["hoo/kimi-k2.6", "hoo/deepseek-v4-flash"],
  })
  assert.equal(norm!.requirement?.fallbackChain.length, 3)
  assert.equal(norm!.requirement?.fallbackChain[1]?.model, "kimi-k2.6")
  assert.equal(norm!.requirement?.fallbackChain[2]?.model, "deepseek-v4-flash")
})

test("normalizeShorthand passes through full requirement when present", () => {
  const norm = normalizeShorthand({
    requirement: {
      fallbackChain: [{ providers: ["custom"], model: "x", variant: "low" }],
      variant: "low",
    },
  })
  assert.equal(norm!.requirement?.fallbackChain[0]?.model, "x")
  assert.equal(norm!.requirement?.variant, "low")
})

test("normalizeShorthand returns disabled flag when set", () => {
  const norm = normalizeShorthand({ disabled: true })
  assert.equal(norm!.disabled, true)
  assert.equal(norm!.requirement, undefined)
})

test("normalizeShorthand returns undefined for undefined input", () => {
  assert.equal(normalizeShorthand(undefined), undefined)
})

test("normalizeShorthand returns object with no requirement when only description set", () => {
  const norm = normalizeShorthand({ description: "x" })
  assert.equal(norm!.description, "x")
  assert.equal(norm!.requirement, undefined)
})
