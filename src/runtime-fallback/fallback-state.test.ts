import { test } from "node:test"
import assert from "node:assert/strict"

import {
  createFallbackState,
  findNextAvailableFallback,
  isModelInCooldown,
  markModelFailed,
  modelKey,
  peekNextFallback,
  commitFallback,
  prepareFallback,
} from "./fallback-state.ts"
import type { FallbackEntry, ModelRequirement } from "../shared/types.ts"

const chain: FallbackEntry[] = [
  { providers: ["hoo"], model: "primary-model" },
  { providers: ["hoo"], model: "fallback-a" },
  { providers: ["hoo"], model: "fallback-b" },
  { providers: ["other"], model: "fallback-c" },
]

const req: ModelRequirement = { fallbackChain: chain }

const NOW = 1_000_000

test("modelKey joins provider and model with slash", () => {
  assert.equal(modelKey("hoo", "glm-5.2"), "hoo/glm-5.2")
  assert.equal(modelKey("", "glm-5.2"), "/glm-5.2")
})

test("createFallbackState starts at index 0 with 0 attempts", () => {
  const s = createFallbackState("hoo/primary-model")
  assert.equal(s.fallbackIndex, 0)
  assert.equal(s.attempts, 0)
  assert.equal(s.failedModels.size, 0)
})

test("markModelFailed records timestamp", () => {
  const s = createFallbackState("hoo/primary-model")
  markModelFailed(s, "hoo/primary-model", NOW)
  assert.equal(s.failedModels.get("hoo/primary-model"), NOW)
})

test("isModelInCooldown true within window, false after", () => {
  const s = createFallbackState("hoo/primary-model")
  markModelFailed(s, "hoo/x", NOW)
  assert.equal(isModelInCooldown("hoo/x", s, 60, NOW + 30_000), true)
  assert.equal(isModelInCooldown("hoo/x", s, 60, NOW + 61_000), false)
  assert.equal(isModelInCooldown("hoo/other", s, 60, NOW), false)
})

test("findNextAvailableFallback skips the just-failed model", () => {
  const s = createFallbackState("hoo/primary-model")
  const r = findNextAvailableFallback(s, chain, 60, "hoo/primary-model", NOW)
  assert.equal(r?.entry.model, "fallback-a")
  assert.equal(r?.index, 1)
})

test("findNextAvailableFallback skips cooldown models", () => {
  const s = createFallbackState("hoo/primary-model")
  markModelFailed(s, "hoo/fallback-a", NOW)
  const r = findNextAvailableFallback(s, chain, 60, "hoo/primary-model", NOW + 1000)
  assert.equal(r?.entry.model, "fallback-b")
})

test("findNextAvailableFallback returns null when chain exhausted", () => {
  const s = createFallbackState("hoo/primary-model")
  s.fallbackIndex = chain.length - 1
  const r = findNextAvailableFallback(s, chain, 60, "hoo/primary-model", NOW)
  assert.equal(r, null)
})

test("prepareFallback returns max-attempts when attempts exhausted", () => {
  const s = createFallbackState("hoo/primary-model")
  s.attempts = 3
  const r = prepareFallback(s, req, "hoo/primary-model", 3, 60, NOW)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "max-attempts")
})

test("prepareFallback returns no-fallback-chain when requirement null", () => {
  const s = createFallbackState("hoo/primary-model")
  const r = prepareFallback(s, null, "hoo/primary-model", 3, 60, NOW)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "no-fallback-chain")
})

test("prepareFallback returns no-next-model when all in cooldown", () => {
  const s = createFallbackState("hoo/primary-model")
  markModelFailed(s, "hoo/fallback-a", NOW)
  markModelFailed(s, "hoo/fallback-b", NOW)
  markModelFailed(s, "other/fallback-c", NOW)
  const r = prepareFallback(s, req, "hoo/primary-model", 3, 60, NOW + 1000)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "no-next-model")
})

test("prepareFallback advances state on success", () => {
  const s = createFallbackState("hoo/primary-model")
  const r = prepareFallback(s, req, "hoo/primary-model", 3, 60, NOW)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.entry.model, "fallback-a")
    assert.equal(r.index, 1)
    assert.equal(r.attempts, 1)
  }
  assert.equal(s.fallbackIndex, 1)
  assert.equal(s.attempts, 1)
})

test("prepareFallback advances to next index on second call", () => {
  const s = createFallbackState("hoo/primary-model")
  prepareFallback(s, req, "hoo/primary-model", 3, 60, NOW)
  const r = prepareFallback(s, req, "hoo/fallback-a", 3, 60, NOW + 1000)
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.entry.model, "fallback-b")
  assert.equal(s.fallbackIndex, 2)
  assert.equal(s.attempts, 2)
})

test("prepareFallback sets activeModel to the selected entry", () => {
  const s = createFallbackState("hoo/primary-model")
  const r = prepareFallback(s, req, "hoo/primary-model", 3, 60, NOW)
  assert.equal(r.ok, true)
  assert.equal(s.activeModel, "hoo/fallback-a")
})

test("prepareFallback updates activeModel on each advance", () => {
  const s = createFallbackState("hoo/primary-model")
  prepareFallback(s, req, "hoo/primary-model", 3, 60, NOW)
  assert.equal(s.activeModel, "hoo/fallback-a")
  prepareFallback(s, req, "hoo/fallback-a", 3, 60, NOW + 1000)
  assert.equal(s.activeModel, "hoo/fallback-b")
})

// ── peekNextFallback + commitFallback (non-mutating peek, explicit commit) ──

test("peekNextFallback does NOT mutate state", () => {
  const s = createFallbackState("hoo/primary-model")
  const originalIndex = s.fallbackIndex
  const originalAttempts = s.attempts
  const originalActiveModel = s.activeModel

  const r = peekNextFallback(s, req, "hoo/primary-model", 3, 60, NOW)

  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.entry.model, "fallback-a")
    assert.equal(r.index, 1)
    assert.equal(r.nextAttempts, 1)
  }
  // State must be unchanged
  assert.equal(s.fallbackIndex, originalIndex)
  assert.equal(s.attempts, originalAttempts)
  assert.equal(s.activeModel, originalActiveModel)
})

test("commitFallback advances state after peek", () => {
  const s = createFallbackState("hoo/primary-model")

  const peek = peekNextFallback(s, req, "hoo/primary-model", 3, 60, NOW)
  assert.equal(peek.ok, true)
  if (!peek.ok) return

  commitFallback(s, peek.entry, peek.index)

  assert.equal(s.fallbackIndex, 1)
  assert.equal(s.attempts, 1)
  assert.equal(s.activeModel, "hoo/fallback-a")
})

test("peek then multiple peeks without commit returns same entry", () => {
  const s = createFallbackState("hoo/primary-model")

  const r1 = peekNextFallback(s, req, "hoo/primary-model", 3, 60, NOW)
  const r2 = peekNextFallback(s, req, "hoo/primary-model", 3, 60, NOW)

  assert.equal(r1.ok, true)
  assert.equal(r2.ok, true)
  if (r1.ok && r2.ok) {
    assert.equal(r1.entry.model, r2.entry.model)
    assert.equal(r1.index, r2.index)
  }
  assert.equal(s.attempts, 0) // still uncommitted
})

test("peekNextFallback returns max-attempts when attempts exhausted", () => {
  const s = createFallbackState("hoo/primary-model")
  s.attempts = 3
  const r = peekNextFallback(s, req, "hoo/primary-model", 3, 60, NOW)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "max-attempts")
})

test("peekNextFallback returns no-next-model when all in cooldown", () => {
  const s = createFallbackState("hoo/primary-model")
  markModelFailed(s, "hoo/fallback-a", NOW)
  markModelFailed(s, "hoo/fallback-b", NOW)
  markModelFailed(s, "other/fallback-c", NOW)
  const r = peekNextFallback(s, req, "hoo/primary-model", 3, 60, NOW + 1000)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "no-next-model")
  // State unchanged even on failure
  assert.equal(s.attempts, 0)
  assert.equal(s.fallbackIndex, 0)
})

test("peekNextFallback skips provider-blocked candidates without mutating state", () => {
  const s = createFallbackState("hoo/primary-model")
  const blocker = (entry: FallbackEntry) => entry.providers[0] === "hoo"

  const r = peekNextFallback(s, req, "hoo/primary-model", 3, 60, NOW, blocker)

  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.entry.model, "fallback-c")
    assert.equal(r.index, 3)
    assert.equal(r.nextAttempts, 1)
  }
  assert.equal(s.fallbackIndex, 0)
  assert.equal(s.attempts, 0)
  assert.equal(s.activeModel, undefined)
})

test("peekNextFallback without a candidate blocker retains fallback-a", () => {
  const s = createFallbackState("hoo/primary-model")

  const r = peekNextFallback(s, req, "hoo/primary-model", 3, 60, NOW)

  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.entry.model, "fallback-a")
    assert.equal(r.index, 1)
  }
})

test("prepareFallback skips a provider/model-blocked candidate and commits the next entry", () => {
  const s = createFallbackState("hoo/primary-model")
  const blocker = (entry: FallbackEntry) =>
    entry.providers[0] === "hoo" && entry.model === "fallback-a"

  const r = prepareFallback(s, req, "hoo/primary-model", 3, 60, NOW, blocker)

  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.entry.model, "fallback-b")
    assert.equal(r.index, 2)
    assert.equal(r.attempts, 1)
  }
  assert.equal(s.fallbackIndex, 2)
  assert.equal(s.attempts, 1)
  assert.equal(s.activeModel, "hoo/fallback-b")
})
