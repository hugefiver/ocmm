import { test } from "node:test"
import assert from "node:assert/strict"
import { hasUnfinishedTodos } from "./todo-reader.ts"
import type { OcmmClient } from "./dispatcher.ts"

function makeClient(messagesResp: unknown): { client: OcmmClient; calls: number } {
  let calls = 0
  const client = {
    session: {
      abort: async () => {},
      messages: async () => {
        calls++
        return messagesResp
      },
      prompt: async () => {},
    },
  } as unknown as OcmmClient
  return { client, calls }
}

test("returns false when no todowrite tool calls exist", async () => {
  const { client } = makeClient({ data: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] })
  const result = await hasUnfinishedTodos(client, "ses_1")
  assert.equal(result, false)
})

test("returns true when todowrite result has pending items", async () => {
  const { client } = makeClient({
    data: [
      {
        role: "assistant",
        parts: [
          {
            type: "tool",
            tool: "todowrite",
            state: { todos: [{ content: "task", status: "pending" }, { content: "done", status: "completed" }] },
          },
        ],
      },
    ],
  })
  const result = await hasUnfinishedTodos(client, "ses_1")
  assert.equal(result, true)
})

test("returns false when all todos are completed", async () => {
  const { client } = makeClient({
    data: [
      {
        role: "assistant",
        parts: [
          {
            type: "tool",
            tool: "todowrite",
            state: { todos: [{ content: "done", status: "completed" }] },
          },
        ],
      },
    ],
  })
  const result = await hasUnfinishedTodos(client, "ses_1")
  assert.equal(result, false)
})

test("returns true when todos have in_progress status", async () => {
  const { client } = makeClient({
    data: [
      {
        role: "assistant",
        parts: [
          {
            type: "tool",
            tool: "todowrite",
            state: { todos: [{ content: "wip", status: "in_progress" }] },
          },
        ],
      },
    ],
  })
  const result = await hasUnfinishedTodos(client, "ses_1")
  assert.equal(result, true)
})

test("returns false on parse error (defensive)", async () => {
  const { client } = makeClient({ broken: true })
  const result = await hasUnfinishedTodos(client, "ses_1")
  assert.equal(result, false)
})

test("scans messages from the end, stops at first todowrite call", async () => {
  const messagesResp = {
    data: [
      {
        role: "assistant",
        parts: [{ type: "tool", tool: "todowrite", state: { todos: [{ content: "old", status: "pending" }] } }],
      },
      {
        role: "assistant",
        parts: [{ type: "tool", tool: "todowrite", state: { todos: [{ content: "new", status: "completed" }] } }],
      },
    ],
  }
  const { client } = makeClient(messagesResp)
  const result = await hasUnfinishedTodos(client, "ses_1")
  assert.equal(result, false)
})

test("client.session.messages is called with correct sessionID", async () => {
  let capturedPath: unknown = null
  const client = {
    session: {
      abort: async () => {},
      messages: async (args: any) => {
        capturedPath = args.path
        return { data: [] }
      },
      prompt: async () => {},
    },
  } as unknown as OcmmClient
  await hasUnfinishedTodos(client, "ses_42")
  assert.deepEqual(capturedPath, { id: "ses_42" })
})
