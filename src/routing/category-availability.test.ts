import assert from "node:assert/strict"
import { test } from "node:test"

import type { ModelRequirement } from "../shared/types.ts"
import {
  resolveCategoryAvailabilityDiagnostic,
  type ResolveCategoryAvailabilityDiagnosticArgs,
} from "./category-availability.ts"

function resolve(
  overrides: Partial<ResolveCategoryAvailabilityDiagnosticArgs> = {},
) {
  return resolveCategoryAvailabilityDiagnostic({
    name: "diagnostic-category",
    target: {},
    requirement: {
      fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol" }],
    },
    requirementSource: "category-default",
    primarySource: "builtin-requirement",
    selectedModel: "openai/gpt-5.6-sol",
    ...overrides,
  })
}

test("exact catalog matches are available and preserve provenance", () => {
  const diagnostic = resolve({
    target: { provider: { openai: { models: { "gpt-5.6-sol": {} } } } },
  })

  assert.equal(diagnostic.status, "available")
  assert.equal(diagnostic.reason, "catalog-match")
  assert.equal(diagnostic.requirementSource, "category-default")
  assert.equal(diagnostic.primarySource, "builtin-requirement")
  assert.equal(diagnostic.selectedModel, "openai/gpt-5.6-sol")
  assert.equal(diagnostic.routePreserved, true)
  assert.deepEqual(diagnostic.candidates, [{
    index: 0,
    model: "gpt-5.6-sol",
    providers: ["openai"],
    status: "available",
    reasons: ["catalog-match"],
  }])
})

test("requiresAnyModel uses an observed eligible provider only when requiresModel is absent", () => {
  const anyModel = resolve({
    selectedModel: "requested-model",
    target: { provider: { openai: { models: { "different-model": {} } } } },
    requirement: {
      requiresAnyModel: true,
      requiresProvider: ["openai"],
      fallbackChain: [{ providers: [], model: "requested-model" }],
    },
  })
  assert.equal(anyModel.status, "available")
  assert.equal(anyModel.reason, "catalog-any-model")
  assert.deepEqual(anyModel.candidates[0], {
    index: 0,
    model: "requested-model",
    providers: ["openai"],
    status: "available",
    reasons: ["catalog-any-model"],
  })

  const exactGuardWins = resolve({
    selectedModel: "expected-model",
    target: { provider: { openai: { models: { "different-model": {} } } } },
    requirement: {
      requiresModel: "expected-model",
      requiresAnyModel: true,
      fallbackChain: [{ providers: ["openai"], model: "expected-model" }],
    },
  })
  assert.equal(exactGuardWins.status, "unknown")
  assert.deepEqual(exactGuardWins.candidates[0]?.reasons, ["model-unobserved"])
})

test("provider-unspecified candidates use stable observed providers", () => {
  const diagnostic = resolve({
    selectedModel: "shared-model",
    target: {
      provider: {
        zeta: { models: { other: {} } },
        alpha: { models: { "shared-model": {} } },
      },
    },
    requirement: {
      fallbackChain: [{ providers: [], model: "shared-model" }],
    },
  })

  assert.equal(diagnostic.status, "available")
  assert.deepEqual(diagnostic.candidates[0]?.providers, ["alpha", "zeta"])
  assert.deepEqual(diagnostic.candidates[0]?.reasons, ["catalog-match"])
})

test("diagnostic keys are stable across catalog property order", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [{ providers: [], model: "shared-model" }],
  }
  const first = resolve({
    selectedModel: "shared-model",
    requirement,
    target: {
      provider: {
        zeta: { models: { other: {} } },
        alpha: { models: { "shared-model": {} } },
      },
    },
  })
  const second = resolve({
    selectedModel: "shared-model",
    requirement,
    target: {
      provider: {
        alpha: { models: { "shared-model": {} } },
        zeta: { models: { other: {} } },
      },
    },
  })

  assert.equal(first.key, second.key)
})

test("missing and malformed catalog evidence remains unknown", () => {
  const cases: Array<{
    name: string
    target: Record<string, unknown>
    reason: "provider-unobserved" | "model-unobserved"
  }> = [
    { name: "provider field absent", target: {}, reason: "provider-unobserved" },
    { name: "provider field malformed", target: { provider: [] }, reason: "provider-unobserved" },
    { name: "provider entry malformed", target: { provider: { openai: "invalid" } }, reason: "provider-unobserved" },
    { name: "models field absent", target: { provider: { openai: {} } }, reason: "model-unobserved" },
    { name: "models field malformed", target: { provider: { openai: { models: [] } } }, reason: "model-unobserved" },
    { name: "model key absent", target: { provider: { openai: { models: {} } } }, reason: "model-unobserved" },
  ]

  for (const item of cases) {
    const diagnostic = resolve({ target: item.target })
    assert.equal(diagnostic.status, "unknown", item.name)
    assert.equal(diagnostic.reason, "catalog-incomplete", item.name)
    assert.deepEqual(diagnostic.candidates[0]?.reasons, [item.reason], item.name)
  }
})

test("only exact-model and provider guard conflicts make candidates dead", () => {
  const modelConflict = resolve({
    requirement: {
      requiresModel: "required-model",
      fallbackChain: [{ providers: ["openai"], model: "other-model" }],
    },
  })
  assert.equal(modelConflict.status, "dead")
  assert.equal(modelConflict.reason, "structural-conflict")
  assert.deepEqual(modelConflict.candidates[0]?.reasons, ["requires-model-mismatch"])

  const providerConflict = resolve({
    requirement: {
      requiresProvider: ["anthropic"],
      fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol" }],
    },
  })
  assert.equal(providerConflict.status, "dead")
  assert.equal(providerConflict.reason, "structural-conflict")
  assert.deepEqual(providerConflict.candidates[0]?.reasons, ["requires-provider-mismatch"])
})

test("mixed dead and catalog-unknown candidates aggregate to unknown", () => {
  const diagnostic = resolve({
    selectedModel: "unqualified-selection",
    requirement: {
      requiresProvider: ["openai"],
      fallbackChain: [
        { providers: ["anthropic"], model: "blocked" },
        { providers: ["openai"], model: "unobserved" },
      ],
    },
  })

  assert.equal(diagnostic.status, "unknown")
  assert.equal(diagnostic.reason, "catalog-incomplete")
  assert.deepEqual(diagnostic.candidates.map(({ status, reasons }) => ({ status, reasons })), [
    { status: "dead", reasons: ["requires-provider-mismatch"] },
    { status: "unknown", reasons: ["provider-unobserved"] },
  ])
})

test("an empty chain is dead even when selectedModel is qualified", () => {
  const diagnostic = resolve({
    selectedModel: "openai/synthetic-must-not-revive-empty-chain",
    requirement: { fallbackChain: [] },
  })

  assert.equal(diagnostic.status, "dead")
  assert.equal(diagnostic.reason, "no-candidates")
  assert.deepEqual(diagnostic.candidates, [])
})

test("selected-primary materialization is used without mutating route inputs", () => {
  const requirement: ModelRequirement = {
    variant: "max",
    requiresProvider: ["openai", "anthropic"],
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.5", temperature: 0.2 },
      { providers: ["anthropic"], model: "claude-opus-4-7" },
    ],
  }
  const target = {
    provider: { openai: { models: { "gpt-5.7-sol": {} } } },
  }
  const requirementBefore = structuredClone(requirement)
  const targetBefore = structuredClone(target)

  const diagnostic = resolve({
    requirement,
    target,
    selectedModel: "openai/gpt-5.7-sol",
    primarySource: "catalog-upgrade",
  })

  assert.equal(diagnostic.candidates[0]?.model, "gpt-5.7-sol")
  assert.deepEqual(diagnostic.candidates[0]?.providers, ["openai"])
  assert.equal(diagnostic.candidates[0]?.status, "available")
  assert.equal(diagnostic.primarySource, "catalog-upgrade")
  assert.deepEqual(requirement, requirementBefore)
  assert.deepEqual(target, targetBefore)
})

test("diagnostics and keys contain no provider options or model-entry secrets", () => {
  const sentinel = "CATEGORY_AVAILABILITY_SECRET_SENTINEL"
  const target = {
    provider: {
      openai: {
        apiKey: sentinel,
        options: { baseURL: `https://${sentinel}.invalid` },
        models: { known: { token: sentinel } },
      },
    },
  }
  const diagnostic = resolve({
    target,
    selectedModel: "openai/known",
    requirement: { fallbackChain: [{ providers: ["openai"], model: "known" }] },
  })

  assert.equal(diagnostic.status, "available")
  assert.doesNotMatch(JSON.stringify(diagnostic), new RegExp(sentinel))
})
