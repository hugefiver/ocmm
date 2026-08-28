import { test } from "node:test"
import assert from "node:assert/strict"

import {
  applyRequirementDefaults,
  createRuntimeFallbackDispatchReservations,
  resolveRetryTarget,
  type DispatchReservationOwner,
} from "./event-handler-support.ts"
import type { FallbackEntry, ModelRequirement } from "../shared/types.ts"

test("requirement defaults retain canonical reasoning alongside a legacy variant", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [],
    reasoning: "off",
    variant: "high",
  }
  const entry: FallbackEntry = { providers: ["openai"], model: "gpt-5.6-sol" }

  const defaulted = applyRequirementDefaults(requirement, entry)

  assert.deepEqual(defaulted, {
    providers: ["openai"],
    model: "gpt-5.6-sol",
    reasoning: "off",
    variant: "high",
  })
  assert.deepEqual(entry, { providers: ["openai"], model: "gpt-5.6-sol" })
})

test("entry inference metadata takes precedence over requirement defaults", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [],
    reasoning: "off",
    variant: "high",
  }
  const entry: FallbackEntry = {
    providers: ["openai"],
    model: "gpt-5.6-sol",
    reasoning: "max",
    variant: "low",
  }

  const defaulted = applyRequirementDefaults(requirement, entry)

  assert.deepEqual(defaulted, entry)
  assert.deepEqual(entry, {
    providers: ["openai"],
    model: "gpt-5.6-sol",
    reasoning: "max",
    variant: "low",
  })
})

test("retry target pins the actual identity while retaining canonical reasoning", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [{ providers: ["openai", "github-copilot"], model: "gpt-5.6-sol" }],
    reasoning: "high",
  }

  const target = resolveRetryTarget(requirement, {
    providerID: "github-copilot",
    modelID: "gpt-5.6-sol",
  })

  assert.deepEqual(target, {
    providerID: "github-copilot",
    modelID: "gpt-5.6-sol",
    entry: {
      providers: ["github-copilot"],
      model: "gpt-5.6-sol",
      reasoning: "high",
    },
  })
})

const reservationOwner: DispatchReservationOwner = {
  generation: 7,
  routeSnapshotId: 11,
  targetModel: "provider/fallback-a",
}

test("dispatch reservations keep one owner record per session and settle only that owner", () => {
  const reservations = createRuntimeFallbackDispatchReservations()

  assert.equal(reservations.acquire("ses_owner", reservationOwner), true)
  assert.deepEqual(reservations.get("ses_owner"), {
    ...reservationOwner,
    state: "reserved",
  })
  assert.equal(reservations.acquire("ses_owner", {
    generation: 8,
    routeSnapshotId: 12,
    targetModel: "provider/fallback-b",
  }), false)
  assert.equal(reservations.settle("ses_owner", reservationOwner, "accepted"), true)
  assert.deepEqual(reservations.get("ses_owner"), {
    ...reservationOwner,
    state: "accepted",
  })

  assert.equal(reservations.acquire("ses_owner_ambiguous", reservationOwner), true)
  assert.equal(reservations.settle("ses_owner_ambiguous", reservationOwner, "possibly-accepted"), true)
  assert.deepEqual(reservations.get("ses_owner_ambiguous"), {
    ...reservationOwner,
    state: "possibly-accepted",
  })
})

test("dispatch reservation owner fencing rejects every stale owner field", () => {
  const staleOwners: DispatchReservationOwner[] = [
    { ...reservationOwner, generation: reservationOwner.generation + 1 },
    { ...reservationOwner, routeSnapshotId: reservationOwner.routeSnapshotId + 1 },
    { ...reservationOwner, targetModel: "provider/fallback-b" },
  ]

  for (const [index, staleOwner] of staleOwners.entries()) {
    const sessionID = `ses_stale_owner_${index}`
    const reservations = createRuntimeFallbackDispatchReservations()
    assert.equal(reservations.acquire(sessionID, reservationOwner), true)

    assert.equal(reservations.settle(sessionID, staleOwner, "possibly-accepted"), false)
    assert.deepEqual(reservations.get(sessionID), { ...reservationOwner, state: "reserved" })
    assert.equal(reservations.clear(sessionID, staleOwner), false)
    assert.deepEqual(reservations.get(sessionID), { ...reservationOwner, state: "reserved" })
  }
})

test("lifecycle clear is unconditional and permits reacquisition", () => {
  const reservations = createRuntimeFallbackDispatchReservations()
  assert.equal(reservations.acquire("ses_lifecycle", reservationOwner), true)

  assert.equal(reservations.clear("ses_lifecycle"), true)
  assert.equal(reservations.get("ses_lifecycle"), undefined)
  assert.equal(reservations.acquire("ses_lifecycle", {
    generation: 8,
    routeSnapshotId: 12,
    targetModel: "provider/fallback-b",
  }), true)
})
