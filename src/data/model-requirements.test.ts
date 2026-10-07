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
const CURRENT_SOL_RECIPIENTS = [
  ...SOL_RECIPIENTS.filter((label) => !["agent:planner", "category:deep"].includes(label)),
  ...TERRA_RECIPIENTS,
]

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
  "agent:planner",
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
  "gpt-6.1-sol": ["openai", "github-copilot"],
  "gpt-6-luna": ["openai", "github-copilot"],
  "gpt-6-astra": ["openai", "github-copilot"],
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
    chains.filter(({ label }) => label !== "agent:oracle"),
    "gpt-5.5",
    (label) => ["agent:planner", "category:deep"].includes(label) ? "gpt-6-astra" : "gpt-6.1-sol",
  )
})

test("GPT-6/6.1 lane assignment, compatibility fallbacks, and Oracle order remain static contracts", () => {
  const chains = builtinChains()

  assert.deepEqual(labelsWithModel(chains, "gpt-6.1-sol"), [...CURRENT_SOL_RECIPIENTS].sort())
  assert.deepEqual(labelsWithModel(chains, "gpt-5.6-sol"), [])
  assert.deepEqual(labelsWithModel(chains, "gpt-5.6-terra"), [])
  assert.deepEqual(labelsWithModel(chains, "gpt-6-luna"), ["agent:code-search", "agent:doc-search", "category:quick"])
  assert.deepEqual(labelsWithModel(chains, "gpt-6-astra"), [...ASTRA_RECIPIENTS].sort())
  for (const { label, fallbackChain } of chains) {
    const astraIndex = fallbackChain.findIndex((entry) => entry.model === "gpt-6-astra")
    if (astraIndex === -1) continue
    const successor = fallbackChain[astraIndex + 1]
    assert.equal(successor?.model, ["agent:planner", "category:deep"].includes(label) ? "gpt-5.5" : "gpt-6.1-sol", label)
    const solEntry = fallbackChain.find((entry) => entry.model === "gpt-6.1-sol")
    if (solEntry) {
      assert.deepEqual(
        { ...fallbackChain[astraIndex]!, model: "gpt-6.1-sol" },
        solEntry,
        `${label} must retain sol tuning on gpt-6-astra`,
      )
    }
  }

  for (const { label, fallbackChain } of chains) {
    for (const model of ["claude-opus-5", "kimi-k3", "gpt-6.1-sol", "gpt-6-luna", "gpt-6-astra"]) {
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
      "gpt-6.1-sol",
      "gpt-5.4",
      "gpt-5.5",
      "glm-5.1",
    ],
  )
  assert.deepEqual(oracle.filter((entry) => entry.model.startsWith("gpt-")), [
    { providers: ["openai", "github-copilot"], model: "gpt-6.1-sol", variant: "xhigh" },
    { providers: ["openai", "github-copilot"], model: "gpt-5.4", variant: "xhigh" },
    { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "xhigh" },
  ])
  assertAdjacentReplacement(chains, "gpt-5.4-mini-fast", "gpt-6-luna")
  assertAdjacentReplacement(chains, "gpt-5.4-mini", "gpt-6-luna")
  for (const { label, fallbackChain } of chains) {
    const firstGpt = fallbackChain.find((entry) => entry.model.startsWith("gpt-"))
    if (!firstGpt) continue
    assert.match(firstGpt.model, /^gpt-6(?:\.1)?-(?:sol|luna|astra)$/, label)
  }
})

test("GPT migration preserves every non-GPT fallback in its original order", () => {
  const expected = {
    "agent:orchestrator": ["claude-opus-5", "claude-opus-4-7", "kimi-k3", "kimi-k2.6", "k2p5", "glm-5.1"],
    "agent:builder": [],
    "agent:reviewer": ["gemini-3.1-pro", "claude-opus-5", "claude-opus-4-7", "glm-5.1"],
    "agent:oracle": ["claude-opus-5", "claude-opus-4-7", "gemini-3.1-pro", "glm-5.1"],
    "agent:oracle-2nd": ["claude-opus-5", "claude-opus-4-7", "gemini-3.1-pro", "glm-5.1"],
    "agent:doc-search": ["qwen3.5-plus", "minimax-m3", "claude-haiku-4-5"],
    "agent:code-search": ["qwen3.5-plus", "minimax-m3", "claude-haiku-4-5"],
    "agent:planner": ["claude-opus-5", "claude-opus-4-7", "glm-5.1", "gemini-3.1-pro"],
    "agent:clarifier": ["claude-sonnet-4-6", "claude-opus-5", "claude-opus-4-7", "glm-5.1"],
    "agent:plan-critic": ["claude-opus-5", "claude-opus-4-7", "gemini-3.1-pro", "glm-5.1"],
    "agent:media-reader": ["kimi-k3", "kimi-k2.6", "glm-4.6v"],
    "category:frontend": ["gemini-3.1-pro", "claude-opus-5", "claude-opus-4-7"],
    "category:creative": ["gemini-3.1-pro", "claude-opus-5", "claude-opus-4-7"],
    "category:hard-reasoning": ["claude-opus-5", "claude-opus-4-7", "gemini-3.1-pro"],
    "category:research": ["claude-opus-5", "claude-opus-4-7", "gemini-3.1-pro"],
    "category:quick": ["claude-haiku-4-5"],
    "category:coding": ["claude-sonnet-4-6"],
    "category:normal-task": ["claude-sonnet-4-6", "gemini-3-flash", "minimax-m3"],
    "category:complex": ["claude-opus-5", "claude-opus-4-7", "gemini-3.1-pro", "kimi-k3", "k2p5"],
    "category:deep": ["claude-opus-5", "claude-opus-4-7", "gemini-3.1-pro", "kimi-k3", "kimi-k2.6", "glm-5.1"],
    "category:documenting": ["kimi-k3", "k2p5", "gemini-3-flash", "claude-sonnet-4-6"],
    "category:cross-cutting": ["claude-opus-5", "claude-opus-4-7", "gemini-3.1-pro"],
  }
  assert.deepEqual(Object.fromEntries(builtinChains().map(({ label, fallbackChain }) => [
    label, fallbackChain.filter((entry) => !entry.model.startsWith("gpt-")).map((entry) => entry.model),
  ])), expected)
})
