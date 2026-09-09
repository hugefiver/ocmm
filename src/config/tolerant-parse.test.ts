import assert from "node:assert/strict"
import { test } from "node:test"
import { z } from "zod"

import { deepMerge } from "./merge.ts"
import { tolerantParse, tolerantParseLayers, type TolerantParseLayer } from "./tolerant-parse.ts"

test("tolerantParse reports silently stripped keys without traversing an unknown parent", () => {
  const result = tolerantParse(z.object({ nested: z.object({ enabled: z.boolean() }) }), {
    nested: { enabled: true, typo: "ignored" },
    unknownParent: { one: { two: { three: true } } },
  })

  assert.equal(result.success, true)
  assert.deepEqual(result.unknownKeys, [
    { path: ["nested", "typo"] },
    { path: ["unknownParent"] },
  ])
})

test("tolerantParse removes concrete strict unknown keys instead of their parent", () => {
  const schema = z.object({ fast: z.object({ enabled: z.boolean(), count: z.number() }).strict() })
  const result = tolerantParse(schema, { fast: { enabled: true, count: 2, typo: "ignored" } })

  assert.equal(result.success, true)
  assert.deepEqual(result.success && result.data.fast, { enabled: true, count: 2 })
  assert.deepEqual(result.unknownKeys, [{ path: ["fast", "typo"] }])
})

test("tolerantParse does not classify type-invalid fields as unknown", () => {
  const result = tolerantParse(z.object({ enabled: z.boolean(), count: z.number().optional() }), {
    enabled: true,
    count: "invalid",
  })

  assert.equal(result.success, true)
  assert.deepEqual(result.success && result.data, { enabled: true })
  assert.deepEqual(result.unknownKeys, [])
})

test("tolerantParse reports unknowns only from the union branch that becomes valid", () => {
  const schema = z.union([
    z.object({ type: z.literal("local"), command: z.string() }).strict(),
    z.object({ type: z.literal("remote"), url: z.string() }).strict(),
  ])
  const result = tolerantParse(schema, { type: "local", command: "serve", typo: true })

  assert.equal(result.success, true)
  assert.deepEqual(result.success && result.data, { type: "local", command: "serve" })
  assert.deepEqual(result.unknownKeys, [{ path: ["typo"] }])
})

test("tolerantParse waits for an invalid union field to be repaired before classifying unknowns", () => {
  const schema = z.union([
    z.object({ type: z.literal("local"), command: z.string(), retries: z.number().optional() }).strict(),
    z.object({ type: z.literal("remote"), url: z.string() }).strict(),
  ])
  const result = tolerantParse(schema, {
    type: "local",
    command: "serve",
    retries: "invalid",
    typo: true,
  })

  assert.equal(result.success, true)
  assert.deepEqual(result.success && result.data, { type: "local", command: "serve" })
  assert.deepEqual(result.unknownKeys, [{ path: ["typo"] }])
})

test("tolerantParse compares retained array elements after invalid elements are removed", () => {
  const schema = z.object({ entries: z.array(z.object({ name: z.string() })) })
  const result = tolerantParse(schema, {
    entries: [
      { name: 42, ignored: "invalid element" },
      { name: "kept", typo: true },
    ],
  })

  assert.equal(result.success, true)
  assert.deepEqual(result.success && result.data.entries, [{ name: "kept" }])
  assert.deepEqual(result.unknownKeys, [{ path: ["entries", 1, "typo"] }])
})

test("tolerantParseLayers maps unknown paths to the input layer that contains them", () => {
  const layers: TolerantParseLayer[] = [
    { value: { nested: { enabled: true } } },
    { value: { nested: { typo: "project" } } },
  ]
  const result = tolerantParseLayers(
    z.object({ nested: z.object({ enabled: z.boolean() }) }),
    layers,
    (values) => values.reduce((merged, layer) => deepMerge(merged, layer.value), {}),
  )

  assert.equal(result.success, true)
  assert.equal(result.success && result.data.nested.enabled, true)
  assert.deepEqual(result.unknownKeys, [{ path: ["nested", "typo"], layer: 1 }])
})

test("tolerantParseLayers restores a valid lower value without reporting the invalid override as unknown", () => {
  const layers: TolerantParseLayer[] = [
    { value: { nested: { count: 1 } } },
    { value: { nested: { count: "invalid", typo: true } } },
  ]
  const result = tolerantParseLayers(
    z.object({ nested: z.object({ count: z.number() }) }),
    layers,
    (values) => values.reduce((merged, layer) => deepMerge(merged, layer.value), {}),
  )

  assert.equal(result.success, true)
  assert.equal(result.success && result.data.nested.count, 1)
  assert.deepEqual(result.unknownKeys, [{ path: ["nested", "typo"], layer: 1 }])
})

test("tolerantParse does not report legal dynamic record keys", () => {
  const schema = z.object({
    agents: z.record(z.string(), z.object({ model: z.string() })),
    headers: z.record(z.string(), z.string()),
    env: z.record(z.string(), z.string()),
    options: z.record(z.string(), z.unknown()),
  })
  const result = tolerantParse(schema, {
    agents: { custom: { model: "provider/model" } },
    headers: { "X-Custom": "value" },
    env: { CUSTOM_ENV: "value" },
    options: { arbitrary: { nested: true } },
  })

  assert.equal(result.success, true)
  assert.deepEqual(result.unknownKeys, [])
})

test("tolerantParse keeps dangerous keys fail-closed without ordinary unknown diagnostics", () => {
  const result = tolerantParse(
    z.object({ safe: z.boolean() }).strict(),
    JSON.parse('{"safe":true,"__proto__":{"polluted":true},"prototype":1,"constructor":2}'),
  )

  assert.equal(result.success, true)
  assert.deepEqual(result.success && result.data, { safe: true })
  assert.deepEqual(result.unknownKeys, [])
  assert.equal(Reflect.get(Object.prototype, "polluted"), undefined)
})

test("tolerantParse failure results still expose an empty unknown-key list", () => {
  const result = tolerantParse(z.object({ enabled: z.boolean() }), "not-an-object")

  assert.equal(result.success, false)
  assert.deepEqual(result.unknownKeys, [])
  assert.ok(!result.success && result.issues.length > 0)
})
