import { test } from "node:test"
import assert from "node:assert/strict"

import { dispatchFallbackRetry } from "./dispatcher.ts"
import type { OcmmClient } from "./dispatcher.ts"
import type { FallbackEntry } from "../shared/types.ts"

type PromptCall = {
  sessionID: string
  body: Record<string, unknown>
  directory?: string
}

function makeClient(messagesResp: unknown): { client: OcmmClient; calls: PromptCall[] } {
  const calls: PromptCall[] = []
  const client: OcmmClient = {
    session: {
      async abort() {
        return undefined
      },
      async messages() {
        return messagesResp
      },
      async prompt(args: {
        path: { id: string }
        body: Record<string, unknown>
        query?: { directory?: string }
      }) {
        calls.push({
          sessionID: args.path.id,
          body: args.body,
          ...(args.query?.directory !== undefined ? { directory: args.query.directory } : {}),
        })
        return undefined
      },
    },
  }
  return { client, calls }
}

const entry: FallbackEntry = { providers: ["hoo"], model: "fallback-model" }

test("extracts single user message parts", async () => {
  const messagesResp = {
    messages: [
      { role: "user", parts: [{ type: "text", text: "hello" }] },
      { role: "assistant", parts: [{ type: "text", text: "hi there" }] },
    ],
  }
  const { client, calls } = makeClient(messagesResp)

  const ok = await dispatchFallbackRetry({
    client,
    sessionID: "ses_1",
    newEntry: entry,
    reason: "rate_limit",
  })

  assert.equal(ok, true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]?.body.parts, [{ type: "text", text: "hello" }])
})

test("extracts latest contiguous user-message block (multiple adjacent user messages)", async () => {
  const messagesResp = {
    messages: [
      { role: "user", parts: [{ type: "text", text: "first" }] },
      { role: "assistant", parts: [{ type: "text", text: "reply1" }] },
      { role: "user", parts: [{ type: "text", text: "second" }] },
      { role: "user", parts: [{ type: "text", text: "third" }] },
    ],
  }
  const { client, calls } = makeClient(messagesResp)

  const ok = await dispatchFallbackRetry({
    client,
    sessionID: "ses_1",
    newEntry: entry,
    reason: "rate_limit",
  })

  assert.equal(ok, true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]?.body.parts, [
    { type: "text", text: "second" },
    { type: "text", text: "third" },
  ])
})

test("stops collecting at first non-user after latest block", async () => {
  const messagesResp = {
    messages: [
      { role: "user", parts: [{ type: "text", text: "older" }] },
      { role: "assistant", parts: [{ type: "text", text: "older-reply" }] },
      { role: "user", parts: [{ type: "text", text: "latest-a" }] },
      { role: "user", parts: [{ type: "text", text: "latest-b" }] },
      { role: "assistant", parts: [{ type: "text", text: "assistant-again" }] },
    ],
  }
  const { client, calls } = makeClient(messagesResp)

  const ok = await dispatchFallbackRetry({
    client,
    sessionID: "ses_1",
    newEntry: entry,
    reason: "rate_limit",
  })

  assert.equal(ok, true)
  // The latest user block is empty because the last message is assistant.
  // Scanning backward: assistant (skip, no user collected yet) -> latest-b (user, collect) -> latest-a (user, collect) -> older-reply (assistant, break).
  assert.deepEqual(calls[0]?.body.parts, [
    { type: "text", text: "latest-a" },
    { type: "text", text: "latest-b" },
  ])
})

test("returns false when no user messages exist", async () => {
  const messagesResp = {
    messages: [
      { role: "assistant", parts: [{ type: "text", text: "only assistant" }] },
    ],
  }
  const { client, calls } = makeClient(messagesResp)

  const ok = await dispatchFallbackRetry({
    client,
    sessionID: "ses_1",
    newEntry: entry,
    reason: "rate_limit",
  })

  assert.equal(ok, false)
  assert.equal(calls.length, 0)
})

test("does not cross assistant boundary when latest user block has no parts", async () => {
  const messagesResp = {
    messages: [
      { role: "user", parts: [{ type: "text", text: "older" }] },
      { role: "assistant", parts: [{ type: "text", text: "reply" }] },
      { role: "user", parts: [] },
    ],
  }
  const { client, calls } = makeClient(messagesResp)

  const ok = await dispatchFallbackRetry({
    client,
    sessionID: "ses_1",
    newEntry: entry,
    reason: "rate_limit",
  })

  assert.equal(ok, false)
  assert.equal(calls.length, 0)
})

test("uses content field when parts is absent", async () => {
  const messagesResp = {
    messages: [
      { role: "user", content: [{ type: "text", text: "from-content" }] },
    ],
  }
  const { client, calls } = makeClient(messagesResp)

  const ok = await dispatchFallbackRetry({
    client,
    sessionID: "ses_1",
    newEntry: entry,
    reason: "rate_limit",
  })

  assert.equal(ok, true)
  assert.deepEqual(calls[0]?.body.parts, [{ type: "text", text: "from-content" }])
})

test("normalizes string content field when parts is absent", async () => {
  const messagesResp = {
    messages: [
      { role: "user", content: "hello" },
    ],
  }
  const { client, calls } = makeClient(messagesResp)

  const ok = await dispatchFallbackRetry({
    client,
    sessionID: "ses_1",
    newEntry: entry,
    reason: "rate_limit",
  })

  assert.equal(ok, true)
  assert.deepEqual(calls[0]?.body.parts, [{ type: "text", text: "hello" }])
})

test("passes agent and directory through to prompt", async () => {
  const messagesResp = {
    messages: [
      { role: "user", parts: [{ type: "text", text: "hi" }] },
    ],
  }
  const { client, calls } = makeClient(messagesResp)

  const ok = await dispatchFallbackRetry({
    client,
    sessionID: "ses_1",
    directory: "/wd",
    agent: "builder",
    newEntry: entry,
    reason: "rate_limit",
  })

  assert.equal(ok, true)
  assert.equal(calls[0]?.body.agent, "builder")
  assert.equal(calls[0]?.directory, "/wd")
})

test("prevents concurrent dispatch for same session", async () => {
  const messagesResp = {
    messages: [
      { role: "user", parts: [{ type: "text", text: "hi" }] },
    ],
  }
  const { client, calls } = makeClient(messagesResp)

  // Launch two concurrently
  const [r1, r2] = await Promise.all([
    dispatchFallbackRetry({ client, sessionID: "ses_dup", newEntry: entry, reason: "rate_limit" }),
    dispatchFallbackRetry({ client, sessionID: "ses_dup", newEntry: entry, reason: "rate_limit" }),
  ])

  // One succeeds, one is skipped as in-flight
  assert.equal(r1 || r2, true)
  assert.equal(!r1 || !r2, true) // exactly one false
  assert.equal(calls.length, 1)
})

test("variant and reasoningEffort are passed through to prompt body", async () => {
  const messagesResp = {
    messages: [
      { role: "user", parts: [{ type: "text", text: "hi" }] },
    ],
  }
  const { client, calls } = makeClient(messagesResp)

  const variantEntry: FallbackEntry = {
    providers: ["hoo"],
    model: "variant-model",
    variant: "max",
    reasoningEffort: "high",
  }

  await dispatchFallbackRetry({
    client,
    sessionID: "ses_var",
    newEntry: variantEntry,
    reason: "rate_limit",
  })

  assert.equal(calls[0]?.body.variant, "max")
  assert.equal(calls[0]?.body.reasoningEffort, "high")
})

test("returns false when messages fetch throws", async () => {
  let messagesCalls = 0
  const client: OcmmClient = {
    session: {
      async abort() { return undefined },
      async messages() {
        messagesCalls++
        throw new Error("network error")
      },
      async prompt() { return undefined },
    },
  }

  const ok = await dispatchFallbackRetry({
    client,
    sessionID: "ses_err",
    newEntry: entry,
    reason: "rate_limit",
  })

  assert.equal(ok, false)
  assert.equal(messagesCalls, 1)
})

test("returns false when prompt dispatch throws", async () => {
  let promptCalls = 0
  const messagesResp = {
    messages: [
      { role: "user", parts: [{ type: "text", text: "hi" }] },
    ],
  }
  const client: OcmmClient = {
    session: {
      async abort() { return undefined },
      async messages() { return messagesResp },
      async prompt() {
        promptCalls++
        throw new Error("prompt rejected")
      },
    },
  }

  const ok = await dispatchFallbackRetry({
    client,
    sessionID: "ses_prompt_err",
    newEntry: entry,
    reason: "rate_limit",
  })

  assert.equal(ok, false)
  assert.equal(promptCalls, 1)
})
