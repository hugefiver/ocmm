import assert from "node:assert/strict"

import type { OcmmClient } from "./dispatcher.ts"
import type { Subagent429Scheduler } from "./subagent-429-controller.ts"
import { OcmmConfigSchema } from "../config/schema.ts"
import type { EffectiveRouteRegistry } from "../routing/route-registry.ts"
import type { EffectiveModelRoute } from "../shared/types.ts"

export type PromptCall = {
  sessionID: string
  body: Record<string, unknown>
  directory?: string
}

export function makeMockClient(): { client: OcmmClient; calls: PromptCall[]; messagesResp: unknown } {
  const calls: PromptCall[] = []
  const messagesResp: unknown = {
    messages: [
      { role: "user", parts: [{ type: "text", text: "hello" }] },
      { role: "assistant", parts: [{ type: "text", text: "hi" }] },
    ],
  }
  const client: OcmmClient = {
    session: {
      async abort() {
        return undefined
      },
      async messages() {
        return messagesResp
      },
      async prompt(args: { path: { id: string }; body: Record<string, unknown>; query?: { directory?: string } }) {
        calls.push({
          sessionID: args.path.id,
          body: args.body,
          ...(args.query?.directory !== undefined ? { directory: args.query.directory } : {}),
        })
        return undefined
      },
    },
  }
  return { client, calls, messagesResp }
}

export function makeConfig(overrides: Record<string, unknown> = {}) {
  return OcmmConfigSchema.parse({
    agents: {
      orchestrator: {
        model: "hoo/primary-model",
        fallbackModels: ["hoo/fallback-a", "hoo/fallback-b"],
      },
    },
    runtimeFallback: overrides,
  })
}

export function makeErrorEvent(
  sessionID: string,
  error: unknown,
  extras: Record<string, unknown> = {},
) {
  return {
    event: {
      type: "session.error",
      properties: { sessionID, error, ...extras },
    },
  }
}

export function makeIdleEvent(sessionID: string) {
  return { event: { type: "session.idle", properties: { sessionID } } }
}

export type ScheduledHandlerTask = {
  delayMs: number
  run: () => Promise<void>
  cancelled: boolean
}

export class FakeHandlerScheduler implements Subagent429Scheduler {
  readonly tasks: ScheduledHandlerTask[] = []

  schedule(delayMs: number, run: () => Promise<void>): () => void {
    const task: ScheduledHandlerTask = { delayMs, run, cancelled: false }
    this.tasks.push(task)
    return () => { task.cancelled = true }
  }

  async run(index: number): Promise<void> {
    const task = this.tasks[index]
    assert.ok(task, `missing scheduled task ${index}`)
    if (!task.cancelled) await task.run()
  }
}

export function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

export async function flushHandler(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
  await Promise.resolve()
}

export function makeHandlerConfig(
  chain: Array<{ providers: string[]; model: string; variant?: "low" | "medium" | "high" }>,
  runtimeFallback: Record<string, unknown> = {},
  requirementOptions: Record<string, unknown> = {},
) {
  return OcmmConfigSchema.parse({
    agents: { worker: { requirement: { fallbackChain: chain, ...requirementOptions } } },
    runtimeFallback,
  })
}

export function standardHandlerChain() {
  return [
    { providers: ["provider-a"], model: "primary", variant: "high" as const },
    { providers: ["provider-b"], model: "fallback-a", variant: "medium" as const },
    { providers: ["provider-c"], model: "fallback-b", variant: "low" as const },
  ]
}

export function publishWorkerRouteSnapshot(
  registry: EffectiveRouteRegistry,
  chain: EffectiveModelRoute["requirement"]["fallbackChain"] = standardHandlerChain(),
): number {
  const generation = registry.beginBuild()
  const routes = new Map<string, EffectiveModelRoute>([
    ["worker", {
      model: "provider-a/primary",
      requirement: { fallbackChain: chain },
      requirementSource: "user-config",
      primarySource: "user-requirement",
    }],
  ])
  assert.equal(registry.publish(generation, routes), true)
  return registry.snapshot().snapshotId
}

export type ControlledClientPhases = {
  abortResults?: Array<Promise<unknown>>
  messagesResults?: Array<Promise<unknown>>
  onMessagesResolved?: () => void
}

export function makeControlledClient(
  promptResults: Array<Promise<unknown>> = [],
  phases: ControlledClientPhases = {},
) {
  const calls: PromptCall[] = []
  let aborts = 0
  let messages = 0
  let messagesResp: unknown = {
    messages: [{ role: "user", parts: [{ type: "text", text: "retry this" }] }],
  }
  const client: OcmmClient = {
    session: {
      async abort() {
        aborts++
        return phases.abortResults?.shift() ?? undefined
      },
      async messages() {
        messages++
        const response = await (phases.messagesResults?.shift() ?? Promise.resolve(messagesResp))
        phases.onMessagesResolved?.()
        return response
      },
      async prompt(args: { path: { id: string }; body: Record<string, unknown>; query?: { directory?: string } }) {
        calls.push({ sessionID: args.path.id, body: args.body })
        return promptResults.shift() ?? Promise.resolve()
      },
    },
  }
  return {
    client,
    calls,
    get aborts() { return aborts },
    get messages() { return messages },
    setMessages(response: unknown) { messagesResp = response },
  }
}

export function makeCreatedEvent(sessionID: string, parent: Record<string, string> = {}) {
  return { event: { type: "session.created", properties: { sessionID, ...parent } } }
}

export function modelFor(modelID: string, providerID = "provider-a") {
  return { providerID, modelID }
}

export function dispatchedModels(calls: PromptCall[]): string[] {
  return calls
    .filter((call) => typeof call.body.modelID === "string")
    .map((call) => `${call.body.providerID as string}/${call.body.modelID as string}`)
}
