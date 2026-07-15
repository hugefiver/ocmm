import { test } from "node:test"
import assert from "node:assert/strict"

import { defaultConfig, Subagent429ConfigSchema } from "./schema.ts"

test("Subagent429ConfigSchema applies defaults", () => {
  assert.deepEqual(Subagent429ConfigSchema.parse({}), {
    enabled: true,
    maxRetries: 5,
    providerScopes: {},
  })
})

test("defaultConfig applies subagent429 defaults", () => {
  assert.deepEqual(defaultConfig().runtimeFallback.subagent429, {
    enabled: true,
    maxRetries: 5,
    providerScopes: {},
  })
})

test("Subagent429ConfigSchema accepts zero retries and model/provider scopes", () => {
  assert.deepEqual(
    Subagent429ConfigSchema.parse({
      maxRetries: 0,
      providerScopes: {
        openai: "model",
        anthropic: "provider",
      },
    }),
    {
      enabled: true,
      maxRetries: 0,
      providerScopes: {
        openai: "model",
        anthropic: "provider",
      },
    },
  )
})

test("Subagent429ConfigSchema rejects invalid values and unknown fields", () => {
  for (const input of [
    { maxRetries: -1 },
    { maxRetries: 1.5 },
    { providerScopes: { openai: "account" } },
    { recoveryThresholdMinutes: 10 },
  ]) {
    assert.throws(() => Subagent429ConfigSchema.parse(input))
  }
})
