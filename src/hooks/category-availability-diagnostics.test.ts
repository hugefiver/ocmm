import assert from "node:assert/strict"
import { test } from "node:test"

import type { ResolveCategoryAvailabilityDiagnosticArgs } from "../routing/category-availability.ts"
import { createCategoryAvailabilityDiagnosticReporter } from "./category-availability-diagnostics.ts"

type LoggedCall = { level: "info" | "warn"; message: string }

function args(
  overrides: Partial<ResolveCategoryAvailabilityDiagnosticArgs> = {},
): ResolveCategoryAvailabilityDiagnosticArgs {
  return {
    name: "reporter-category",
    target: {},
    requirement: { fallbackChain: [{ providers: ["openai"], model: "wanted" }] },
    requirementSource: "user-config",
    primarySource: "user-requirement",
    selectedModel: "openai/wanted",
    ...overrides,
  }
}

function capture() {
  const calls: LoggedCall[] = []
  const reporter = createCategoryAvailabilityDiagnosticReporter({
    info(...values: unknown[]) {
      calls.push({ level: "info", message: String(values[0]) })
    },
    warn(...values: unknown[]) {
      calls.push({ level: "warn", message: String(values[0]) })
    },
  })
  return { calls, reporter }
}

test("available and unknown report at info while dead reports at warn", () => {
  const { calls, reporter } = capture()

  reporter(args({ target: { provider: { openai: { models: { wanted: {} } } } } }))
  reporter(args({ name: "unknown-category" }))
  reporter(args({
    name: "dead-category",
    requirement: {
      requiresModel: "required",
      fallbackChain: [{ providers: ["openai"], model: "other" }],
    },
  }))

  assert.deepEqual(calls.map(({ level }) => level), ["info", "info", "warn"])
  assert.match(calls[0]!.message, /name="reporter-category" status=available reason=catalog-match/)
  assert.match(calls[1]!.message, /name="unknown-category" status=unknown reason=catalog-incomplete/)
  assert.match(calls[2]!.message, /name="dead-category" status=dead reason=structural-conflict/)
  for (const call of calls) {
    assert.match(call.message, /routePreserved=true/)
    assert.match(call.message, /requirementSource=user-config primarySource=user-requirement/)
    assert.match(call.message, /candidates=\[#0\(/)
  }
})

test("one reporter emits each stable key once and emits a changed key", () => {
  const { calls, reporter } = capture()
  const providerMissing = args()
  const modelMissing = args({ target: { provider: { openai: { models: {} } } } })

  reporter(providerMissing)
  reporter(providerMissing)
  reporter(modelMissing)
  reporter(providerMissing)

  assert.equal(calls.length, 2)
  assert.match(calls[0]!.message, /reasons=\["provider-unobserved"\]/)
  assert.match(calls[1]!.message, /reasons=\["model-unobserved"\]/)
})

test("messages exclude unrelated host data and logger failures never escape", () => {
  const sentinel = "CATEGORY_REPORTER_SECRET_SENTINEL"
  const { calls, reporter } = capture()
  reporter(args({
    target: {
      unrelated: sentinel,
      provider: {
        openai: {
          apiKey: sentinel,
          models: { wanted: { privateValue: sentinel } },
        },
      },
    },
  }))
  assert.equal(calls.length, 1)
  assert.doesNotMatch(calls[0]!.message, new RegExp(sentinel))

  const throwingReporter = createCategoryAvailabilityDiagnosticReporter({
    info() {
      throw new Error("logger info failed")
    },
    warn() {
      throw new Error("logger warn failed")
    },
  })
  assert.doesNotThrow(() => throwingReporter(args()))
  assert.doesNotThrow(() => throwingReporter(args({
    name: "dead-throwing-logger",
    requirement: { fallbackChain: [] },
  })))
})
