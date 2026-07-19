import assert from "node:assert/strict"
import { test } from "node:test"

import type { EffectiveModelRoute } from "../shared/types.ts"
import { createEffectiveRouteRegistry } from "./route-registry.ts"

const route = (model: string): EffectiveModelRoute => ({
  model,
  requirement: {
    fallbackChain: [{
      providers: ["openai"],
      model: "fallback",
      thinking: { type: "enabled", budgetTokens: 32 },
    }],
    requiresProvider: ["openai"],
  },
  requirementSource: "agent-default",
  primarySource: "builtin-requirement",
})

test("initial snapshot is unpublished, empty, and has id zero", () => {
  const registry = createEffectiveRouteRegistry()

  assert.equal(registry.snapshot().published, false)
  assert.equal(registry.snapshot().snapshotId, 0)
  assert.deepEqual([...registry.snapshot().routes], [])
})

test("publishing an empty map creates the first published snapshot", () => {
  const registry = createEffectiveRouteRegistry()

  assert.equal(registry.publish(registry.beginBuild(), new Map()), true)
  assert.equal(registry.snapshot().published, true)
  assert.equal(registry.snapshot().snapshotId, 1)
  assert.deepEqual([...registry.snapshot().routes], [])
})

test("a later successful publication replaces all routes and increments once", () => {
  const registry = createEffectiveRouteRegistry()

  assert.equal(registry.publish(registry.beginBuild(), new Map([
    ["builder", route("openai/gpt-5.6")],
  ])), true)
  const firstSnapshot = registry.snapshot()

  assert.equal(registry.publish(registry.beginBuild(), new Map([
    ["reviewer", route("openai/gpt-5.6-terra")],
    ["planner", route("openai/gpt-5.6")],
  ])), true)

  const secondSnapshot = registry.snapshot()
  assert.notEqual(secondSnapshot, firstSnapshot)
  assert.equal(secondSnapshot.snapshotId, 2)
  assert.deepEqual([...secondSnapshot.routes.keys()], ["reviewer", "planner"])
  assert.equal(secondSnapshot.routes.has("builder"), false)
})

test("a stale publication leaves the exact preceding successful snapshot intact", () => {
  const registry = createEffectiveRouteRegistry()
  const generation1 = registry.beginBuild()
  const generation2 = registry.beginBuild()

  assert.equal(registry.publish(generation2, new Map([
    ["builder", route("openai/gpt-5.6")],
  ])), true)
  const successfulSnapshot = registry.snapshot()

  assert.equal(registry.publish(generation1, new Map([
    ["reviewer", route("openai/gpt-5.6-terra")],
  ])), false)
  assert.equal(registry.snapshot(), successfulSnapshot)
  assert.deepEqual([...registry.snapshot().routes], [...successfulSnapshot.routes])
})

test("starting a build that never publishes leaves prior success intact", () => {
  const registry = createEffectiveRouteRegistry()

  assert.equal(registry.publish(registry.beginBuild(), new Map([
    ["builder", route("openai/gpt-5.6")],
  ])), true)
  const successfulSnapshot = registry.snapshot()

  registry.beginBuild()

  assert.equal(registry.snapshot(), successfulSnapshot)
})

test("publishing copies the input map", () => {
  const registry = createEffectiveRouteRegistry()
  const routes = new Map([["builder", route("openai/gpt-5.6")]])

  assert.equal(registry.publish(registry.beginBuild(), routes), true)
  routes.clear()
  routes.set("reviewer", route("openai/gpt-5.6-terra"))

  assert.deepEqual([...registry.snapshot().routes.keys()], ["builder"])
})

test("current snapshot identity changes only after a successful publication", () => {
  const registry = createEffectiveRouteRegistry()
  const initialSnapshotId = registry.snapshot().snapshotId

  const generation1 = registry.beginBuild()
  assert.equal(registry.isCurrentSnapshot(initialSnapshotId), true)

  registry.beginBuild()
  assert.equal(registry.publish(generation1, new Map()), false)
  assert.equal(registry.isCurrentSnapshot(initialSnapshotId), true)

  assert.equal(registry.publish(2, new Map()), true)
  assert.equal(registry.isCurrentSnapshot(initialSnapshotId), false)
  assert.equal(registry.isCurrentSnapshot(registry.snapshot().snapshotId), true)
})

test("snapshot returns its current object unchanged until publication succeeds", () => {
  const registry = createEffectiveRouteRegistry()
  const initialSnapshot = registry.snapshot()
  const generation1 = registry.beginBuild()

  assert.equal(registry.snapshot(), initialSnapshot)
  registry.beginBuild()
  assert.equal(registry.publish(generation1, new Map()), false)
  assert.equal(registry.snapshot(), initialSnapshot)

  assert.equal(registry.publish(2, new Map()), true)
  const publishedSnapshot = registry.snapshot()
  assert.notEqual(publishedSnapshot, initialSnapshot)
  assert.equal(registry.snapshot(), publishedSnapshot)
})

test("published snapshots cannot be mutated through runtime casts", () => {
  const registry = createEffectiveRouteRegistry()
  const inputRoute = route("openai/gpt-5.6")
  assert.equal(registry.publish(registry.beginBuild(), new Map([
    ["builder", inputRoute],
  ])), true)

  const snapshot = registry.snapshot()
  const publishedRoute = snapshot.routes.get("builder")!
  const entry = publishedRoute.requirement.fallbackChain[0]!
  const mutableRoutes = snapshot.routes as Map<string, EffectiveModelRoute>

  inputRoute.model = "openai/input-mutated"
  inputRoute.requirement.fallbackChain[0]!.providers.push("input-provider")
  inputRoute.requirement.fallbackChain[0]!.thinking!.budgetTokens = 16
  inputRoute.requirement.requiresProvider!.push("input-provider")

  assert.throws(() => {
    ;(snapshot as { published: boolean }).published = false
  })
  assert.equal(mutableRoutes.set, undefined)
  assert.equal(mutableRoutes.delete, undefined)
  assert.equal(mutableRoutes.clear, undefined)
  assert.throws(() => mutableRoutes.set("reviewer", route("openai/gpt-5.6-terra")))
  assert.throws(() => mutableRoutes.delete("builder"))
  assert.throws(() => mutableRoutes.clear())
  assert.throws(() => {
    ;(publishedRoute as { model: string }).model = "openai/mutated"
  })
  assert.throws(() => {
    publishedRoute.requirement.fallbackChain.push({ providers: ["anthropic"], model: "added" })
  })
  assert.throws(() => {
    publishedRoute.requirement.fallbackChain.splice(0, 1)
  })
  assert.throws(() => {
    entry.providers.push("anthropic")
  })
  assert.throws(() => {
    entry.thinking!.budgetTokens = 64
  })
  assert.throws(() => {
    publishedRoute.requirement.requiresProvider!.push("anthropic")
  })

  assert.equal(snapshot.published, true)
  assert.deepEqual([...snapshot.routes], [["builder", route("openai/gpt-5.6")]])
})
