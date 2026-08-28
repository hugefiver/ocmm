import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler } from "./event-handler.ts"
import {
  createRuntimeFallbackRetryStatusTracker,
  parseRetryStatusEvent,
  retryStatusKey,
  type RetryStatusEvent,
} from "./event-handler-support.ts"
import { createEffectiveRouteRegistry } from "../routing/route-registry.ts"
import {
  makeConfig,
  makeControlledClient,
  makeCreatedEvent,
  makeMockClient,
  makeStatusEvent,
} from "./event-handler-test-fixtures.ts"
import type { EffectiveModelRoute, ModelRequirement } from "../shared/types.ts"

function statusRetry(
  sessionID: string,
  modelID: string | undefined,
  options: {
    providerID?: string
    variant?: string
    attempt?: string | number
    message?: string
    agent?: string
  } = {},
) {
  const model = modelID === undefined
    ? undefined
    : {
      providerID: options.providerID ?? "hoo",
      modelID,
      ...(options.variant === undefined ? {} : { variant: options.variant }),
    }
  return makeStatusEvent(sessionID, {
    type: "retry",
    ...(model === undefined ? {} : { model }),
    ...(options.attempt === undefined ? {} : { attempt: options.attempt }),
    ...(options.message === undefined ? {} : { message: options.message }),
  }, { agent: options.agent ?? "orchestrator" })
}

function publishRoute(
  registry: ReturnType<typeof createEffectiveRouteRegistry>,
  fallbackChain: ModelRequirement["fallbackChain"],
): void {
  const generation = registry.beginBuild()
  const route: EffectiveModelRoute = {
    model: "provider/primary",
    requirement: { fallbackChain },
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastPath: { kind: "off" },
  }
  assert.equal(registry.publish(generation, new Map([["worker", route]])), true)
}

test("retry status parser is strict, normalized, and uses documented field precedence", () => {
  assert.deepEqual(parseRetryStatusEvent({
    status: {
      type: "retry",
      model: { providerID: " OpenAI ", modelID: " GPT-5 ", variant: " Medium " },
      variant: " HIGH ",
      attempt: 2,
      message: "  Try\t  Again\nNow  ",
      isRetryable: false,
    },
    model: { providerID: "ignored", modelID: "ignored", variant: "ignored" },
  }), {
    providerID: "openai",
    modelID: "gpt-5",
    variant: "high",
    attempt: "2",
    message: "try again now",
  })

  assert.deepEqual(parseRetryStatusEvent({
    status: { type: "retry", attempt: 2.5 },
    model: { providerID: " Anthropic ", modelID: " Claude ", variant: "ignored" },
    message: "must not be read",
  }), {
    providerID: "anthropic",
    modelID: "claude",
    variant: "unknown",
    attempt: "unknown",
    message: "unknown",
  })
  assert.equal(parseRetryStatusEvent({ status: { type: "busy", isRetryable: true } }), null)
  assert.equal(parseRetryStatusEvent({ status: { isRetryable: true } }), null)
})

test("retry status keys collapse normalized duplicates but isolate every semantic segment", () => {
  const base: RetryStatusEvent = {
    providerID: "OpenAI",
    modelID: "gpt-5",
    variant: "HIGH",
    attempt: "2",
    message: "  Try   Again  ",
  }
  assert.equal(retryStatusKey(base), "openai/gpt-5|high|2|try again")
  assert.equal(retryStatusKey({ ...base, message: "TRY\tAGAIN" }), retryStatusKey(base))

  const distinct = [
    base,
    { ...base, providerID: "azure" },
    { ...base, modelID: "gpt-5-mini" },
    { ...base, variant: "low" },
    { ...base, attempt: "3" },
    { ...base, message: "try later" },
  ]
  assert.equal(new Set(distinct.map(retryStatusKey)).size, distinct.length)
  assert.equal(retryStatusKey({
    providerID: "",
    modelID: " ",
    variant: "",
    attempt: "",
    message: " \t ",
  }), "unknown/unknown|unknown|unknown|unknown")
})

test("retry status tracker is per-session, collapses exact duplicates, and evicts the 257th oldest key", () => {
  const tracker = createRuntimeFallbackRetryStatusTracker()
  const now = 10_000
  assert.equal(tracker.accept("session-a", "same", now), true)
  assert.equal(tracker.accept("session-a", "same", now), false)
  assert.equal(tracker.accept("session-b", "same", now), true)

  for (let index = 0; index <= 256; index++) {
    assert.equal(tracker.accept("bounded", `key-${index}`, now + index), true)
  }
  assert.equal(tracker.accept("bounded", "key-256", now + 257), false)
  assert.equal(tracker.accept("bounded", "key-0", now + 257), true)
  assert.equal(tracker.accept("bounded", "key-1", now + 258), true)
})

test("retry status tracker expires at 30 minutes and clear removes only the named session", () => {
  const tracker = createRuntimeFallbackRetryStatusTracker()
  const insertedAt = 50_000
  assert.equal(tracker.accept("expiring", "key", insertedAt), true)
  assert.equal(tracker.accept("expiring", "key", insertedAt + 30 * 60_000 - 1), false)
  assert.equal(tracker.accept("expiring", "key", insertedAt + 30 * 60_000), true)

  assert.equal(tracker.accept("kept", "key", insertedAt), true)
  tracker.clear("expiring")
  assert.equal(tracker.accept("expiring", "key", insertedAt + 1), true)
  assert.equal(tracker.accept("kept", "key", insertedAt + 1), false)
})

test("session.status dispatches once for normalized duplicates and ignores non-retry statuses", async () => {
  const { client, calls } = makeMockClient()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client })
  const first = statusRetry("status-dedupe", "PRIMARY-MODEL", {
    providerID: " HOO ",
    variant: "HIGH",
    attempt: 1,
    message: " Try   Again ",
  })
  const duplicate = statusRetry("status-dedupe", "primary-model", {
    providerID: "hoo",
    variant: "high",
    attempt: "1",
    message: "try\tagain",
  })

  await handler(first)
  await handler(duplicate)
  await handler(makeStatusEvent("status-dedupe", { type: "busy", isRetryable: true }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "fallback-a" },
  }))

  assert.deepEqual(calls.map((call) => call.body.modelID), ["fallback-a"])
})

test("pending retry status ignores old and model-less evidence, then advances from the explicit target", async () => {
  const { client, calls } = makeMockClient()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client })
  const sessionID = "status-pending"

  await handler(statusRetry(sessionID, "primary-model", { attempt: 1, message: "retry" }))
  await handler(statusRetry(sessionID, "primary-model", { attempt: 2, message: "new old evidence" }))
  await handler(statusRetry(sessionID, undefined, { attempt: 2, message: "unknown target" }))
  assert.deepEqual(calls.map((call) => call.body.modelID), ["fallback-a"])

  await handler(statusRetry(sessionID, "fallback-a", {
    variant: "medium",
    attempt: 2,
    message: "fallback also failed",
  }))
  assert.deepEqual(calls.map((call) => call.body.modelID), ["fallback-a", "fallback-b"])
})

test("created and deleted-recreated lifecycle transitions clear retry keys and pending ownership", async () => {
  const { client, calls } = makeMockClient()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client })
  const sessionID = "status-lifecycle"
  const retry = statusRetry(sessionID, "primary-model", { attempt: 1, message: "retry" })

  await handler(retry)
  await handler(makeCreatedEvent(sessionID))
  await handler(retry)
  assert.deepEqual(calls.map((call) => call.body.modelID), ["fallback-a", "fallback-b"])

  await handler({ event: { type: "session.deleted", properties: { sessionID } } })
  await handler(retry)
  assert.equal(calls.length, 2, "deleted session remains suppressed")
  await handler(makeCreatedEvent(sessionID))
  await handler(retry)
  assert.deepEqual(calls.map((call) => call.body.modelID), ["fallback-a", "fallback-b", "fallback-a"])
})

test("route snapshot replacement clears an otherwise duplicate retry key and pending owner", async () => {
  const { client, calls } = makeMockClient()
  const registry = createEffectiveRouteRegistry()
  publishRoute(registry, [
    { providers: ["provider"], model: "primary" },
    { providers: ["provider"], model: "snapshot-next" },
  ])
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => makeConfig(),
    client,
    routeRegistry: registry,
  })
  const retry = statusRetry("status-route", "primary", {
    providerID: "provider",
    attempt: 1,
    message: "retry",
    agent: "worker",
  })

  await handler(retry)
  publishRoute(registry, [
    { providers: ["provider"], model: "primary" },
    { providers: ["provider"], model: "replacement-next" },
  ])
  await handler(retry)

  assert.deepEqual(calls.map((call) => call.body.modelID), ["snapshot-next", "replacement-next"])
})

test("confirmed model-variant transitions clear prior retry keys", async () => {
  const mock = makeControlledClient()
  mock.setMessages({ messages: [] })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client: mock.client })
  const options = { attempt: 1, message: "retry" }

  await handler(statusRetry("status-variant", "primary-model", { ...options, variant: "high" }))
  await handler(statusRetry("status-variant", "primary-model", { ...options, variant: "low" }))
  await handler(statusRetry("status-variant", "primary-model", { ...options, variant: "high" }))

  assert.equal(mock.messages, 3)
  assert.equal(mock.calls.length, 0)
})
