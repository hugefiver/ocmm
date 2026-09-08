import assert from "node:assert/strict"
import { test } from "node:test"

import { BUILTIN_AGENTS } from "./agents.ts"
import { BUILTIN_CATEGORIES } from "./categories.ts"
import type { FallbackEntry } from "../shared/types.ts"

type BuiltinChain = {
  label: string
  fallbackChain: FallbackEntry[]
}

const LEGACY_KIMI_MODELS = new Map<string, string[]>([
  ["agent:orchestrator", ["kimi-k2.6", "k2p5"]],
  ["agent:media-reader", ["kimi-k2.6"]],
  ["category:complex", ["k2p5"]],
  ["category:deep", ["kimi-k2.6"]],
  ["category:documenting", ["k2p5"]],
])

const SOL_RECIPIENTS = [
  "agent:orchestrator",
  "agent:builder",
  "agent:reviewer",
  "agent:oracle-2nd",
  "agent:planner",
  "agent:clarifier",
  "agent:plan-critic",
  "agent:media-reader",
  "category:frontend",
  "category:creative",
  "category:hard-reasoning",
  "category:research",
  "category:coding",
  "category:deep",
  "category:cross-cutting",
]

const TERRA_RECIPIENTS = ["agent:oracle", "category:normal-task", "category:complex"]

const GPT55_RECIPIENTS = [
  ...SOL_RECIPIENTS.filter((label) => label !== "category:cross-cutting"),
  ...TERRA_RECIPIENTS,
]

const ASTRA_RECIPIENTS = [
  "category:hard-reasoning",
  "category:deep",
  "category:cross-cutting",
  "agent:plan-critic",
  "category:frontend",
  "category:creative",
]

const OPUS_RECIPIENTS = [
  "agent:orchestrator",
  "agent:reviewer",
  "agent:oracle",
  "agent:oracle-2nd",
  "agent:planner",
  "agent:clarifier",
  "agent:plan-critic",
  "category:frontend",
  "category:creative",
  "category:hard-reasoning",
  "category:research",
  "category:complex",
  "category:deep",
  "category:cross-cutting",
]

const LOCAL_PROVIDERS: Record<string, string[]> = {
  "claude-opus-5": ["anthropic"],
  "kimi-k3": ["kimi-for-coding", "moonshot"],
  "gpt-5.6-sol": ["openai", "github-copilot"],
  "gpt-5.6-terra": ["openai", "github-copilot"],
}

function builtinChains(): BuiltinChain[] {
  return [
    ...BUILTIN_AGENTS.map((agent) => ({
      label: `agent:${agent.name}`,
      fallbackChain: agent.requirement.fallbackChain,
    })),
    ...BUILTIN_CATEGORIES.map((category) => ({
      label: `category:${category.name}`,
      fallbackChain: category.requirement.fallbackChain,
    })),
  ]
}

function labelsWithModel(chains: BuiltinChain[], model: string): string[] {
  return chains
    .filter(({ fallbackChain }) => fallbackChain.some((entry) => entry.model === model))
    .map(({ label }) => label)
    .sort()
}

function assertAdjacentReplacement(
  chains: BuiltinChain[],
  legacyModel: string,
  modernModelForChain: string | ((label: string) => string),
): void {
  for (const { label, fallbackChain } of chains) {
    for (const [index, legacy] of fallbackChain.entries()) {
      if (legacy.model !== legacyModel) continue
      const modernModel = typeof modernModelForChain === "string" ? modernModelForChain : modernModelForChain(label)
      const modern = fallbackChain[index - 1]
      assert.ok(modern, `${label} must place ${modernModel} before ${legacyModel}`)
      assert.equal(modern.model, modernModel, `${label} must place ${modernModel} immediately before ${legacyModel}`)
      assert.deepEqual(modern, { ...legacy, model: modernModel }, `${label} must retain ${legacyModel} tuning on ${modernModel}`)
    }
  }
}

test("built-in chains retain legacy fallbacks beside their current local replacements", () => {
  const chains = builtinChains()

  assert.deepEqual(labelsWithModel(chains, "claude-opus-4-7"), [...OPUS_RECIPIENTS].sort())
  assert.deepEqual(labelsWithModel(chains, "gpt-5.5"), [...GPT55_RECIPIENTS].sort())
  assert.deepEqual(labelsWithModel(chains, "kimi-k3"), [...LEGACY_KIMI_MODELS.keys()].sort())

  assertAdjacentReplacement(chains, "claude-opus-4-7", "claude-opus-5")
  for (const { label, fallbackChain } of chains) {
    const legacyKimi = fallbackChain.filter((entry) => entry.model === "kimi-k2.6" || entry.model === "k2p5")
    if (legacyKimi.length === 0) continue

    const k3Entries = fallbackChain.filter((entry) => entry.model === "kimi-k3")
    assert.equal(k3Entries.length, 1, `${label} must contain exactly one Kimi K3 fallback`)
    assert.deepEqual(k3Entries[0], {
      providers: ["kimi-for-coding", "moonshot"],
      model: "kimi-k3",
    })
    assert.equal(
      fallbackChain.indexOf(k3Entries[0]!),
      fallbackChain.indexOf(legacyKimi[0]!) - 1,
      `${label} must place Kimi K3 immediately before its first legacy Kimi fallback`,
    )
    assert.deepEqual(
      legacyKimi.map((entry) => entry.model),
      LEGACY_KIMI_MODELS.get(label),
      `${label} must retain its legacy Kimi order`,
    )
  }

  assertAdjacentReplacement(
    chains,
    "gpt-5.5",
    (label) => TERRA_RECIPIENTS.includes(label) ? "gpt-5.6-terra" : "gpt-5.6-sol",
  )
})

test("GPT-5.6 lane assignment, local aliases, and Oracle order remain static contracts", () => {
  const chains = builtinChains()

  assert.deepEqual(labelsWithModel(chains, "gpt-5.6-sol"), [...SOL_RECIPIENTS].sort())
  assert.deepEqual(labelsWithModel(chains, "gpt-5.6-terra"), [...TERRA_RECIPIENTS].sort())
  assert.deepEqual(labelsWithModel(chains, "gpt-6-astra"), [...ASTRA_RECIPIENTS].sort())
  for (const { label, fallbackChain } of chains) {
    const astraIndex = fallbackChain.findIndex((entry) => entry.model === "gpt-6-astra")
    if (astraIndex === -1) continue
    const successor = fallbackChain[astraIndex + 1]
    assert.equal(successor?.model, "gpt-5.6-sol", `${label} must place gpt-6-astra before its sol fallback`)
    const solEntry = fallbackChain.find((entry) => entry.model === "gpt-5.6-sol")
    if (solEntry) {
      assert.deepEqual(
        { ...fallbackChain[astraIndex]!, model: "gpt-5.6-sol" },
        solEntry,
        `${label} must retain sol tuning on gpt-6-astra`,
      )
    }
  }

  for (const { label, fallbackChain } of chains) {
    for (const model of ["claude-opus-5", "kimi-k3", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-6-astra"]) {
      assert.ok(
        fallbackChain.filter((entry) => entry.model === model).length <= 1,
        `${label} must not duplicate ${model}`,
      )
    }
    for (const entry of fallbackChain) {
      const localProviders = LOCAL_PROVIDERS[entry.model]
      if (localProviders) {
        assert.deepEqual(entry.providers, localProviders, `${label} must use local aliases for ${entry.model}`)
      }
      assert.ok(
        !entry.providers.some((provider) => ["vercel", "opencode", "moonshotai", "opencode-go"].includes(provider)),
        `${label} must not introduce foreign upstream providers`,
      )
    }
  }

  const oracle = BUILTIN_AGENTS.find((agent) => agent.name === "oracle")!.requirement.fallbackChain
  assert.deepEqual(
    oracle.map((entry) => entry.model),
    [
      "claude-opus-5",
      "claude-opus-4-7",
      "gemini-3.1-pro",
      "gpt-5.4",
      "gpt-5.6-terra",
      "gpt-5.5",
      "glm-5.1",
    ],
  )
})
