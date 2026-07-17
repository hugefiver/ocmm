import assert from "node:assert/strict"
import { test } from "node:test"

import {
  createHarness,
  deferred,
  errorInput,
  flush,
  runtimeConfig,
  target,
} from "./subagent-429-controller-fixture.ts"

test("table-driven: retry|switch × dispatch true|false × queued-idle-settle|queued-settle-idle accounts and dispatches exactly once", async () => {
  for (const type of ["retry", "switch"] as const) {
    for (const dispatchResult of [true, false] as const) {
      for (const order of ["queued-idle-settle", "queued-settle-idle"] as const) {
        const result = deferred<boolean>()
        let firstCommits = 0
        let prepareCalls = 0
        const fallback = target("provider-b", "model-b")
        const successor = target("provider-c", "model-c")
        const config = type === "switch"
          ? runtimeConfig({ subagent429: { enabled: true, maxRetries: 0, providerScopes: {} } })
          : runtimeConfig({ subagent429: { enabled: true, maxRetries: 5, providerScopes: {} } })
        const { controller, scheduler, dispatches } = createHarness({
          dispatchRetry: async () => result.promise,
        })
        controller.onSessionCreated("child", true)

        controller.on429(errorInput("child", {
          config,
          prepareSwitch: type === "switch"
            ? () => {
              prepareCalls++
              return {
                ok: true,
                prepared: {
                  target: prepareCalls === 1 ? fallback : successor,
                  attempt: prepareCalls,
                  commit: () => { if (prepareCalls === 1) firstCommits++ },
                },
              }
            }
            : undefined,
        }))
        controller.onIdle("child")
        await scheduler.run(0)
        assert.equal(dispatches.length, 1, `[${type}/${dispatchResult}/${order}] first request started`)

        // Queue a 429 while the first dispatch is still in flight.
        const queued = controller.on429(errorInput("child", {
          config,
          ...(type === "switch"
            ? {
              prepareSwitch: () => {
                prepareCalls++
                return {
                  ok: true,
                  prepared: {
                    target: successor,
                    attempt: prepareCalls,
                    commit: () => { if (prepareCalls === 1) firstCommits++ },
                  },
                }
              },
            }
            : {}),
        }))
        assert.equal(queued.handled, true, `[${type}/${dispatchResult}/${order}] queued 429 handled`)

        if (order === "queued-idle-settle") {
          controller.onIdle("child")
          result.resolve(dispatchResult)
          await flush()
        } else {
          result.resolve(dispatchResult)
          await flush()
          controller.onIdle("child")
        }

        assert.equal(dispatches.length, 1, `[${type}/${dispatchResult}/${order}] no extra request before next gate runs`)

        if (type === "retry") {
          // delay 1000 (not 2000) proves the retry was accounted exactly once.
          assert.equal(scheduler.tasks[1]?.delayMs, 1_000, `[retry/${dispatchResult}/${order}] next gate ordinal 2 / 1000ms`)
        } else {
          assert.equal(firstCommits, 1, `[switch/${dispatchResult}/${order}] first prepared commit exactly once`)
        }

        // No extra idle here: the queued/settled idle already satisfied the
        // next gate's error-idle barrier, so running the timer alone must
        // dispatch exactly one next request.
        await scheduler.run(1)
        await flush()
        assert.equal(dispatches.length, 2, `[${type}/${dispatchResult}/${order}] only one next request starts`)
      }
    }
  }
})
