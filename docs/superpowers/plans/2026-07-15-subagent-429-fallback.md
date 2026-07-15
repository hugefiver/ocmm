# Subagent Initial 429 Retry and Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retry a newly created child session's initial explicit HTTP 429 on the same model, using recovery-aware timing and event-ownership barriers, before advancing through its existing fallback chain.

**Architecture:** Add a session-local `subagent-429-controller.ts` that owns retry budgets, blocked scopes, prior-error-idle barriers, timer/dispatch generations, and queued provider outcomes. `event-handler.ts` resolves lineage and model context, prepares non-mutating switches, and supplies one dedicated no-abort dispatch callback; `FallbackState` remains the only owner of chain index and model-switch attempts.

**Tech Stack:** TypeScript 6 strict mode, Zod 4, Node 22+ `node:test`, injected scheduler/clock/random sources, pnpm schema generation, Markdown/JSONC documentation.

**Global Constraints:**
- Preserve `docs/superpowers/specs/2026-07-15-subagent-429-fallback-design.md` exactly; the latest approved verification contract has 13 groups.
- `runtimeFallback.subagent429` is strict and defaults to `{ enabled: true, maxRetries: 5, providerScopes: {} }`; an unlisted provider defaults to model scope.
- `runtimeFallback.maxAttempts` counts committed model switches only. Same-model retries never call `commitFallback()`.
- `maxRetries` counts additional same-model requests proven to have run. `0` prepares a switch immediately, but dispatch still waits for both a zero-delay scheduler tick and the 429-owned idle.
- Recovery hints strictly greater than `600_000` ms use a zero-delay timer; hints at or below that threshold wait in full; missing hints use equal jitter with `raw = min(30_000, 1_000 * 2 ** retriesUsed)` and `delay = floor(raw / 2 + random * raw / 2)`.
- Every handled 429 creates a prior-error-idle barrier. Its next retry or switch starts exactly once only after both `delayReady` and `errorIdleObserved` are true, regardless of arrival order.
- Dedicated retry and switch dispatches call `dispatchFallbackRetry({ abortBeforeDispatch: false })`. Generic callers omit the option and retain the current best-effort pre-abort behavior.
- During a dedicated dispatch generation, the first provider outcome wins: either `Queued429` or `QueuedOtherError`. Later provider outcomes for that generation are duplicates. An idle after `Queued429` marks its `errorIdleObserved`; an idle without a queued 429 marks `ActiveDispatch.idleObserved`.
- Settlement precedence is queued provider outcome first, then `idleObserved`, then `awaiting-result`. A queued 429 carries its observed error-idle into the next barrier; a queued other error performs one post-settlement generic handoff.
- A same-model result commits its retry count exactly once when dispatch returns `true` or any current-generation queued provider outcome proves the request ran. A bare `false` stops without a count.
- A switch is prepared without mutating chain index/attempts, dispatched, then committed exactly once on `true` or any current-generation queued provider outcome. A bare `false` never commits.
- A non-429 received while waiting, awaiting, or initial-pending stops dedicated state and is handled immediately by generic fallback. During active dispatch it queues one async generic handoff, which runs only after dispatch settlement and in-flight guard release.
- When an in-flight switch 429 has no model payload, `event-handler.ts` uses the controller's active dispatch target. Queued processing always overwrites its target with that active target.
- Model scope keys are `model:<providerID>/<modelID>` and provider scope keys are `provider:<providerID>`. All maps and timers remain inside one child session.
- Candidate filtering evaluates `entry.providers[0]`, matching the provider the dispatcher actually uses; this feature does not alter multi-provider dispatch policy.
- Root sessions, initial non-429 child errors, later non-activated 429 errors, regex-only matches, disabled configuration, and generic fallback retain existing behavior.
- `runtimeFallback.dispatch: false` logs the decision but does not schedule, count, block, prepare, commit, or dispatch.
- The event API has no attempt ID and plugin event hooks are fire-and-forget. Controller-owned lifecycle/timer/dispatch generations and object identity must reject every stale completion.
- `src/config/schema.ts` changes include the profile partial and regenerated root `schema.json` in the same task.
- Update `README.md`, `docs/architecture.md`, and `examples/ocmm.example.jsonc`.
- Do not install software.
- Subagents never execute Git write commands. They report files, evidence, and a suggested semantic commit message.
- The orchestrator is already authorized to inspect each integrated task, rerun its focused checks, and create one atomic semantic commit. It never pushes or tags under this plan.

---

## File Map

**Create:**
- `src/config/schema.test.ts` — direct defaults, validation, and nested strictness.
- `src/runtime-fallback/subagent-429-controller.ts` — dedicated event-ownership state machine.
- `src/runtime-fallback/subagent-429-controller.test.ts` — deterministic barrier, generation, queue, settlement, budget, and scope tests.

**Modify:**
- `src/config/schema.ts` — `Subagent429ConfigSchema`, runtime defaults, profile partial, inferred type.
- `src/config/profiles.test.ts` — partial nested profile override.
- `schema.json` — generated root and profile surfaces.
- `src/runtime-fallback/error-classifier.ts` and `.test.ts` — bounded `recoveryDelayMs` extraction.
- `src/runtime-fallback/fallback-state.ts` and `.test.ts` — optional candidate-blocking predicate.
- `src/runtime-fallback/dispatcher.ts` and `.test.ts` — default-preserving `abortBeforeDispatch?: boolean`.
- `src/runtime-fallback/event-handler.ts` and `.test.ts` — lineage, active-target resolution, no-abort dedicated dispatch, switch prepare/dispatch/commit, lifecycle, and real event ordering.
- `README.md`, `docs/architecture.md`, `examples/ocmm.example.jsonc` — user and architecture documentation.

**Intentionally unchanged:**
- `src/hooks/event.ts` — production uses default scheduler/clock/random; tests inject directly into `createRuntimeFallbackEventHandler()`.
- `src/permissions/index.ts` — only its four parent-session field spellings are mirrored.
- `src/runtime-fallback/index.ts` — controller remains internal and is imported directly.

---

### Task 1: Add Strict Configuration, Profile Overlay, and Generated Schema

**Files:**
- Create: `src/config/schema.test.ts`
- Modify: `src/config/schema.ts:156-173,251-279,409-421,499-511`
- Modify: `src/config/profiles.test.ts:209-225`
- Generate: `schema.json`

**Interfaces:**
- Consumes: `OcmmConfigSchema`, `defaultConfig()`, `ProfileEntrySchema`, `loadConfig()`.
- Produces: `Subagent429ConfigSchema`, `Subagent429Config`, and `RuntimeFallbackConfig["subagent429"]`.

- [ ] **Step 1: Create failing schema tests**

Create `src/config/schema.test.ts`:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"

import { defaultConfig, OcmmConfigSchema } from "./schema.ts"

test("subagent429 defaults to enabled five retries and model-default scopes", () => {
  assert.deepEqual(defaultConfig().runtimeFallback.subagent429, {
    enabled: true,
    maxRetries: 5,
    providerScopes: {},
  })
})

test("subagent429 accepts zero retries and both scope values", () => {
  const cfg = OcmmConfigSchema.parse({
    runtimeFallback: {
      subagent429: {
        enabled: false,
        maxRetries: 0,
        providerScopes: { openai: "model", anthropic: "provider" },
      },
    },
  })
  assert.deepEqual(cfg.runtimeFallback.subagent429, {
    enabled: false,
    maxRetries: 0,
    providerScopes: { openai: "model", anthropic: "provider" },
  })
})

test("subagent429 rejects invalid retry counts scopes and unknown keys", () => {
  for (const value of [-1, 1.5]) {
    assert.equal(OcmmConfigSchema.safeParse({
      runtimeFallback: { subagent429: { maxRetries: value } },
    }).success, false)
  }
  assert.equal(OcmmConfigSchema.safeParse({
    runtimeFallback: { subagent429: { providerScopes: { openai: "account" } } },
  }).success, false)
  assert.equal(OcmmConfigSchema.safeParse({
    runtimeFallback: { subagent429: { recoveryThresholdMinutes: 10 } },
  }).success, false)
})
```

Append to `src/config/profiles.test.ts`:

```ts
test("profile partially overrides runtimeFallback.subagent429", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      runtimeFallback: {
        subagent429: {
          enabled: true,
          maxRetries: 5,
          providerScopes: { openai: "model" },
        },
      },
      profiles: {
        strict: {
          runtimeFallback: {
            subagent429: {
              maxRetries: 0,
              providerScopes: { openai: "provider" },
            },
          },
        },
      },
      activeProfile: "strict",
    })
    const { config } = loadWithXdg(xdg)
    assert.equal(config.runtimeFallback.subagent429.enabled, true)
    assert.equal(config.runtimeFallback.subagent429.maxRetries, 0)
    assert.deepEqual(config.runtimeFallback.subagent429.providerScopes, { openai: "provider" })
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run the red test**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts src/config/profiles.test.ts
```

Expected: FAIL because `subagent429` is absent and strict parsing rejects it.

- [ ] **Step 3: Implement main and profile schemas**

```ts
const Subagent429ScopeSchema = z.enum(["model", "provider"])

const defaultSubagent429Config = () => ({
  enabled: true,
  maxRetries: 5,
  providerScopes: {},
})

export const Subagent429ConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    maxRetries: z.number().int().min(0).default(5),
    providerScopes: z.record(z.string(), Subagent429ScopeSchema).default({}),
  })
  .strict()
  .default(defaultSubagent429Config)

const ProfileSubagent429ConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    maxRetries: z.number().int().min(0).optional(),
    providerScopes: z.record(z.string(), Subagent429ScopeSchema).optional(),
  })
  .strict()
```

Add `subagent429: defaultSubagent429Config()` to `defaultRuntimeFallbackConfig`, `subagent429: Subagent429ConfigSchema` to `RuntimeFallbackConfigSchema`, `subagent429: ProfileSubagent429ConfigSchema.optional()` to the profile partial, and:

```ts
export type Subagent429Config = z.infer<typeof Subagent429ConfigSchema>
```

- [ ] **Step 4: Pass tests and regenerate schema**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts src/config/profiles.test.ts
pnpm run gen-schema
node -e "const fs=require('node:fs');const s=JSON.parse(fs.readFileSync('schema.json','utf8'));const a=s.properties.runtimeFallback.properties.subagent429;const b=s.properties.profiles.additionalProperties.properties.runtimeFallback.properties.subagent429;if(!a||!b||a.additionalProperties!==false||b.additionalProperties!==false)throw new Error('invalid subagent429 schema');console.log('subagent429 schema synchronized')"
```

Expected: tests pass and the final command prints `subagent429 schema synchronized`.

- [ ] **Step 5: Report and integrate**

The subagent reports four files, evidence, and suggested message `feat: configure subagent 429 retries`. It performs no Git writes. The orchestrator reruns checks and may create that atomic commit; it does not push or tag.

---

### Task 2: Parse Explicit 429 Recovery-Time Hints

**Files:**
- Modify: `src/runtime-fallback/error-classifier.ts`
- Modify: `src/runtime-fallback/error-classifier.test.ts`

**Interfaces:**
- Consumes: bounded top-level, `error`, `cause`, and `response.headers` values.
- Produces: `extractRecoveryDelayMs(error, now?)` and `ErrorClassification.recoveryDelayMs`.

- [ ] **Step 1: Add failing deterministic tests**

Update imports and append:

```ts
import {
  classifyError,
  extractErrorName,
  extractRecoveryDelayMs,
  extractStatusCode,
} from "./error-classifier.ts"

const NOW = Date.parse("2026-07-15T12:00:00.000Z")

test("recovery parser reads supported bounded fields headers dates and messages", () => {
  const cases: Array<[unknown, number]> = [
    [{ retryAfter: 90 }, 90_000],
    [{ error: { retry_after: "12m" } }, 720_000],
    [{ cause: { retryDelay: "1.5 seconds" } }, 1_500],
    [{ retryAfterMs: 2_500 }, 2_500],
    [{ error: { retry_after_ms: "1750" } }, 1_750],
    [{ response: { headers: { "Retry-After": "120" } } }, 120_000],
    [{ response: { headers: { "retry-after": "Wed, 15 Jul 2026 12:02:00 GMT" } } }, 120_000],
    [{ retryAfter: "2026-07-15T12:03:00.000Z" }, 180_000],
    [{ message: "retry after 90 seconds" }, 90_000],
    [{ error: "try again in 12m" }, 720_000],
    [{ cause: "reset at 2026-07-15T12:04:00.000Z" }, 240_000],
  ]
  for (const [error, expected] of cases) {
    assert.equal(extractRecoveryDelayMs(error, NOW), expected)
  }
})

test("recovery parser chooses longest positive and rejects ambiguous values", () => {
  assert.equal(extractRecoveryDelayMs({
    retryAfter: 30,
    error: { retryAfterMs: 90_000 },
    cause: { message: "try again in 2 minutes" },
  }, NOW), 120_000)
  for (const error of [
    { message: "request 429 failed at shard 90" },
    { retryAfter: 0 },
    { retryAfter: -5 },
    { retryAfter: "soon" },
    { retryAfter: "2026-07-15T11:59:00.000Z" },
    { metadata: { nested: { retryAfter: 90 } } },
  ]) {
    assert.equal(extractRecoveryDelayMs(error, NOW), undefined)
  }
})

test("classification exposes recovery only for explicit status 429", () => {
  assert.equal(classifyError({ status: 429, retryAfter: 90 }, cfg, NOW).recoveryDelayMs, 90_000)
  assert.equal(classifyError({ status: 503, retryAfter: 90 }, cfg, NOW).recoveryDelayMs, undefined)
  assert.equal(classifyError({ message: "rate limit; retry after 90 seconds" }, cfg, NOW).recoveryDelayMs, undefined)
})
```

- [ ] **Step 2: Run red test**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/error-classifier.test.ts
```

Expected: FAIL because the extractor and field do not exist.

- [ ] **Step 3: Implement bounded parsing**

```ts
const RECOVERY_FIELDS = ["retryAfter", "retry_after", "retryDelay", "retryAfterMs", "retry_after_ms"] as const
const UNIT_MS: Readonly<Record<string, number>> = {
  ms: 1, millisecond: 1, milliseconds: 1,
  s: 1_000, sec: 1_000, secs: 1_000, second: 1_000, seconds: 1_000,
  m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000,
  h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000,
}
const DURATION_RE = /^(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|secs?|sec|s|minutes?|mins?|min|m|hours?|hrs?|hr|h)$/i
const MESSAGE_DURATION_RE = /\b(?:retry\s+after|try\s+again\s+in|reset\s+in)\s+(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|secs?|sec|s|minutes?|mins?|min|m|hours?|hrs?|hr|h)\b/gi
const MESSAGE_TIMESTAMP_RE = /\b(?:reset\s+at|retry\s+at|try\s+again\s+at)\s+([^,;]+(?:Z|GMT))\b/gi

function positiveDelay(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined
}

function parseTimestampDelay(value: string, now: number): number | undefined {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? positiveDelay(timestamp - now) : undefined
}

function parseRecoveryValue(value: unknown, numericUnitMs: number, now: number): number | undefined {
  if (typeof value === "number") return positiveDelay(value * numericUnitMs)
  if (typeof value !== "string") return undefined
  const text = value.trim()
  if (/^\d+(?:\.\d+)?$/.test(text)) return positiveDelay(Number(text) * numericUnitMs)
  const match = DURATION_RE.exec(text)
  if (match) {
    const multiplier = UNIT_MS[match[2]!.toLowerCase()]
    return multiplier === undefined ? undefined : positiveDelay(Number(match[1]) * multiplier)
  }
  return parseTimestampDelay(text, now)
}

function collectMessageDelays(message: string, now: number): number[] {
  const delays: number[] = []
  for (const match of message.matchAll(MESSAGE_DURATION_RE)) {
    const multiplier = UNIT_MS[match[2]!.toLowerCase()]
    const delay = multiplier === undefined ? undefined : positiveDelay(Number(match[1]) * multiplier)
    if (delay !== undefined) delays.push(delay)
  }
  for (const match of message.matchAll(MESSAGE_TIMESTAMP_RE)) {
    const delay = parseTimestampDelay(match[1]!, now)
    if (delay !== undefined) delays.push(delay)
  }
  return delays
}

export function extractRecoveryDelayMs(error: unknown, now: number = Date.now()): number | undefined {
  if (!isRecord(error)) return undefined
  const records = [error]
  if (isRecord(error.error)) records.push(error.error)
  if (isRecord(error.cause)) records.push(error.cause)
  const candidates: number[] = []
  for (const record of records) {
    for (const field of RECOVERY_FIELDS) {
      const unit = field.endsWith("Ms") || field.endsWith("_ms") ? 1 : 1_000
      const delay = parseRecoveryValue(record[field], unit, now)
      if (delay !== undefined) candidates.push(delay)
    }
    if (typeof record.message === "string") candidates.push(...collectMessageDelays(record.message, now))
  }
  for (const key of ["error", "cause"] as const) {
    if (typeof error[key] === "string") candidates.push(...collectMessageDelays(error[key], now))
  }
  if (isRecord(error.response) && isRecord(error.response.headers)) {
    for (const [name, value] of Object.entries(error.response.headers)) {
      if (name.toLowerCase() !== "retry-after") continue
      const delay = parseRecoveryValue(value, 1_000, now)
      if (delay !== undefined) candidates.push(delay)
    }
  }
  return candidates.length === 0 ? undefined : Math.max(...candidates)
}
```

Extend `ErrorClassification` with `recoveryDelayMs?: number`, add optional `now` to `classifyError`, compute recovery only for `statusCode === 429`, and spread it into all existing return branches.

- [ ] **Step 4: Pass tests and typecheck**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/error-classifier.test.ts
pnpm run typecheck
```

Expected: tests pass and typecheck exits 0.

- [ ] **Step 5: Report and integrate**

The subagent reports both files, evidence, and suggested message `feat: parse 429 recovery hints`. It performs no Git writes. The orchestrator reruns checks and may create that atomic commit; it does not push or tag.

---

### Task 3: Add Backward-Compatible Candidate Blocking

**Files:**
- Modify: `src/runtime-fallback/fallback-state.ts`
- Modify: `src/runtime-fallback/fallback-state.test.ts`

**Interfaces:**
- Consumes: `findNextAvailableFallback()`, `peekNextFallback()`, `prepareFallback()`.
- Produces: `FallbackCandidateBlocker = (entry: FallbackEntry) => boolean`.

- [ ] **Step 1: Add failing tests**

```ts
test("candidate blocker skips entries while omission preserves current behavior", () => {
  const filteredState = createFallbackState("hoo/primary-model")
  const filtered = peekNextFallback(
    filteredState, req, "hoo/primary-model", 3, 60, NOW,
    (entry) => entry.providers[0] === "hoo",
  )
  assert.equal(filtered.ok, true)
  if (filtered.ok) assert.equal(filtered.entry.model, "fallback-c")
  assert.equal(filteredState.attempts, 0)

  const defaultState = createFallbackState("hoo/primary-model")
  const unchanged = peekNextFallback(defaultState, req, "hoo/primary-model", 3, 60, NOW)
  assert.equal(unchanged.ok, true)
  if (unchanged.ok) assert.equal(unchanged.entry.model, "fallback-a")
})

test("prepareFallback forwards blocker and commits selected entry", () => {
  const state = createFallbackState("hoo/primary-model")
  const result = prepareFallback(
    state, req, "hoo/primary-model", 3, 60, NOW,
    (entry) => entry.model === "fallback-a",
  )
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.entry.model, "fallback-b")
  assert.equal(state.fallbackIndex, 2)
  assert.equal(state.attempts, 1)
})
```

- [ ] **Step 2: Run red test**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/fallback-state.test.ts
```

Expected: FAIL because the final predicate is unsupported.

- [ ] **Step 3: Implement and thread predicate**

```ts
export type FallbackCandidateBlocker = (entry: FallbackEntry) => boolean

export function findNextAvailableFallback(
  state: FallbackState,
  chain: FallbackEntry[],
  cooldownSeconds: number,
  justFailedModelKey: string,
  now: number = Date.now(),
  isCandidateBlocked: FallbackCandidateBlocker = () => false,
): { entry: FallbackEntry; index: number } | null {
  for (let i = state.fallbackIndex + 1; i < chain.length; i++) {
    const entry = chain[i]
    if (!entry) continue
    const key = modelKey(entry.providers[0] ?? "", entry.model)
    if (key === justFailedModelKey) continue
    if (isModelInCooldown(key, state, cooldownSeconds, now)) continue
    if (isCandidateBlocked(entry)) continue
    return { entry, index: i }
  }
  return null
}
```

Add the same final defaulted parameter to `peekNextFallback()` and `prepareFallback()`, forwarding it to `findNextAvailableFallback()` without reordering existing arguments.

- [ ] **Step 4: Pass tests and typecheck**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/fallback-state.test.ts
pnpm run typecheck
```

Expected: tests pass and typecheck exits 0.

- [ ] **Step 5: Report and integrate**

The subagent reports both files, evidence, and suggested message `feat: filter blocked fallback candidates`. It performs no Git writes. The orchestrator reruns checks and may create that atomic commit; it does not push or tag.

---

### Task 4: Add Dedicated No-Abort Dispatch and the 429 Event-Ownership Controller

**Files:**
- Modify: `src/runtime-fallback/dispatcher.ts`
- Modify: `src/runtime-fallback/dispatcher.test.ts`
- Create: `src/runtime-fallback/subagent-429-controller.ts`
- Create: `src/runtime-fallback/subagent-429-controller.test.ts`

**Interfaces:**
- Consumes: `RuntimeFallbackConfig`, `FallbackCandidateBlocker`, `FallbackEntry`, `dispatchFallbackRetry()`.
- Produces: `DispatchArgs.abortBeforeDispatch?: boolean`, `createSubagent429Controller()`, `prepareSwitch`, `QueuedOutcome`, async generic handoff, barrier/generation state, and `getActiveDispatchTarget()`.

- [ ] **Step 1: Add failing dispatcher option tests**

Append to `src/runtime-fallback/dispatcher.test.ts`:

```ts
test("dispatcher aborts by default", async () => {
  let abortCalls = 0
  let promptCalls = 0
  const client: OcmmClient = {
    session: {
      async abort() { abortCalls += 1 },
      async messages() {
        return { messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }] }
      },
      async prompt() { promptCalls += 1 },
    },
  }
  assert.equal(await dispatchFallbackRetry({
    client, sessionID: "default", newEntry: entry, reason: "status 429",
  }), true)
  assert.equal(abortCalls, 1)
  assert.equal(promptCalls, 1)
})

test("dispatcher skips abort only when abortBeforeDispatch is false", async () => {
  let abortCalls = 0
  let promptCalls = 0
  const client: OcmmClient = {
    session: {
      async abort() { abortCalls += 1 },
      async messages() {
        return { messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }] }
      },
      async prompt() { promptCalls += 1 },
    },
  }
  assert.equal(await dispatchFallbackRetry({
    client,
    sessionID: "dedicated",
    newEntry: entry,
    reason: "status 429",
    abortBeforeDispatch: false,
  }), true)
  assert.equal(abortCalls, 0)
  assert.equal(promptCalls, 1)
})
```

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/dispatcher.test.ts
```

Expected: FAIL because the option is missing and both calls abort.

- [ ] **Step 2: Implement the default-preserving option**

```ts
export type DispatchArgs = {
  client: OcmmClient
  sessionID: string
  directory?: string
  agent?: string
  newEntry: FallbackEntry
  reason: string
  abortBeforeDispatch?: boolean
}
```

Wrap the existing abort block without changing messages, parts, prompt, or in-flight behavior:

```ts
if (args.abortBeforeDispatch !== false) {
  try {
    await client.session.abort({ path: { id: sessionID } })
  } catch (err) {
    log.debug(`abort failed (best-effort): ${(err as Error).message}`)
  }
}
```

Run the dispatcher command again. Expected: all tests pass, default abort remains one call, and explicit `false` prompts with zero aborts.

- [ ] **Step 3: Create deterministic controller test helpers**

Create `src/runtime-fallback/subagent-429-controller.test.ts`:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"

import { defaultConfig, type RuntimeFallbackConfig } from "../config/schema.ts"
import type { FallbackCandidateBlocker } from "./fallback-state.ts"
import {
  createSubagent429Controller,
  type Subagent429Decision,
  type Subagent429ErrorInput,
  type Subagent429PreparedSwitch,
  type Subagent429Scheduler,
  type Subagent429Target,
} from "./subagent-429-controller.ts"

type Scheduled = { delayMs: number; run: () => Promise<void>; cancelled: boolean }

class FakeScheduler implements Subagent429Scheduler {
  readonly tasks: Scheduled[] = []
  schedule(delayMs: number, run: () => Promise<void>): () => void {
    const task = { delayMs, run, cancelled: false }
    this.tasks.push(task)
    return () => { task.cancelled = true }
  }
  pendingDelays(): number[] {
    return this.tasks.filter((task) => !task.cancelled).map((task) => task.delayMs)
  }
  async runNext(): Promise<void> {
    const task = this.tasks.find((candidate) => !candidate.cancelled)
    assert.ok(task, "expected scheduled task")
    task.cancelled = true
    await task.run()
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

async function flushController(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

function handledAction(decision: Subagent429Decision): Exclude<Subagent429Decision, { handled: false }>["action"] {
  assert.equal(decision.handled, true)
  if (!decision.handled) throw new Error("expected handled decision")
  return decision.action
}

const PRIMARY: Subagent429Target = {
  providerID: "openai",
  modelID: "primary",
  entry: { providers: ["openai"], model: "primary", variant: "high" },
}
const FALLBACK: Subagent429Target = {
  providerID: "anthropic",
  modelID: "fallback",
  entry: { providers: ["anthropic"], model: "fallback", variant: "high" },
}

function config(
  subagent429: Partial<RuntimeFallbackConfig["subagent429"]> = {},
  runtime: Partial<RuntimeFallbackConfig> = {},
): RuntimeFallbackConfig {
  const base = defaultConfig().runtimeFallback
  return { ...base, ...runtime, subagent429: { ...base.subagent429, ...subagent429 } }
}

function makeHarness(options: { deferredDispatch?: boolean; dispatchValue?: boolean } = {}) {
  let now = 1_000_000
  const scheduler = new FakeScheduler()
  const dispatches: Subagent429Target[] = []
  const gates: Array<ReturnType<typeof deferred<boolean>>> = []
  const preparedFrom: Subagent429Target[] = []
  const blockers: FallbackCandidateBlocker[] = []
  const logFields: Array<Record<string, unknown>> = []
  let commitCalls = 0
  const controller = createSubagent429Controller({
    scheduler,
    clock: () => now,
    random: () => 0.5,
    dispatchRetry: ({ target }) => {
      dispatches.push(target)
      if (!options.deferredDispatch) return Promise.resolve(options.dispatchValue ?? true)
      const gate = deferred<boolean>()
      gates.push(gate)
      return gate.promise
    },
    logger: {
      debug() {},
      info(_message: unknown, fields?: unknown) {
        if (typeof fields === "object" && fields !== null && !Array.isArray(fields)) {
          logFields.push(fields as Record<string, unknown>)
        }
      },
      warn() {},
    },
  })
  const input = (
    sessionID: string,
    target: Subagent429Target,
    runtimeConfig: RuntimeFallbackConfig,
    recoveryDelayMs?: number,
  ): Subagent429ErrorInput => ({
    sessionID,
    agent: "orchestrator",
    target,
    classification: {
      reason: "status 429",
      ...(recoveryDelayMs !== undefined ? { recoveryDelayMs } : {}),
    },
    runtimeConfig,
    prepareSwitch: (failedTarget, isCandidateBlocked) => {
      preparedFrom.push(failedTarget)
      blockers.push(isCandidateBlocked)
      const prepared: Subagent429PreparedSwitch = {
        target: FALLBACK,
        attempt: 1,
        commit() { commitCalls += 1 },
      }
      return { ok: true, prepared }
    },
  })
  return {
    controller,
    scheduler,
    dispatches,
    gates,
    preparedFrom,
    blockers,
    logFields,
    input,
    commitCalls: () => commitCalls,
    setNow(value: number) { now = value },
  }
}
```

- [ ] **Step 4: Add failing barrier and idle-ownership tests**

```ts
test("delay-ready and error-idle arrive in either order and start once", async () => {
  for (const order of ["delay-first", "idle-first"] as const) {
    const h = makeHarness()
    const sessionID = `child-${order}`
    h.controller.onSessionCreated(sessionID, true)
    h.controller.on429(h.input(sessionID, PRIMARY, config(), 90_000))
    if (order === "delay-first") {
      await h.scheduler.runNext()
      await flushController()
      assert.equal(h.dispatches.length, 0)
      h.controller.onIdle(sessionID)
    } else {
      h.controller.onIdle(sessionID)
      assert.equal(h.dispatches.length, 0)
      await h.scheduler.runNext()
    }
    await flushController()
    assert.deepEqual(h.dispatches, [PRIMARY])
  }
})

test("old error idle satisfies only the barrier", async () => {
  const h = makeHarness({ deferredDispatch: true })
  const input = h.input("child", PRIMARY, config(), 90_000)
  h.controller.onSessionCreated("child", true)
  h.controller.on429(input)
  h.controller.onIdle("child")
  await h.scheduler.runNext()
  await flushController()
  h.gates[0]!.resolve(true)
  await flushController()
  assert.equal(h.controller.on429(input).handled, true)
  assert.deepEqual(h.scheduler.pendingDelays(), [90_000])
})

test("single success idle before prompt resolution clears after settlement", async () => {
  const h = makeHarness({ deferredDispatch: true })
  const input = h.input("child", PRIMARY, config(), 0)
  h.controller.onSessionCreated("child", true)
  h.controller.on429(input)
  await h.scheduler.runNext()
  h.controller.onIdle("child")
  await flushController()
  assert.equal(h.controller.onIdle("child").kind, "dispatch-idle-observed")
  h.gates[0]!.resolve(true)
  await flushController()
  assert.deepEqual(h.controller.on429(input), { handled: false })
})
```

- [ ] **Step 5: Add failing queued outcome and commit tests**

```ts
test("false plus queued same-model 429 counts once and queued beats idle", async () => {
  const h = makeHarness({ deferredDispatch: true })
  const input = h.input("child", PRIMARY, config({ maxRetries: 1 }), 0)
  h.controller.onSessionCreated("child", true)
  h.controller.on429(input)
  await h.scheduler.runNext()
  h.controller.onIdle("child")
  await flushController()
  assert.equal(handledAction(h.controller.on429(input)), "queued-429")
  assert.equal(handledAction(h.controller.on429(input)), "duplicate-outcome")
  assert.equal(h.controller.onIdle("child").kind, "queued-error-idle-observed")
  h.gates[0]!.resolve(false)
  await flushController()
  assert.deepEqual(h.preparedFrom, [PRIMARY])
  assert.deepEqual(h.scheduler.pendingDelays(), [0])
})

test("bare false retry stops without counting", async () => {
  const h = makeHarness({ deferredDispatch: true })
  const input = h.input("child", PRIMARY, config({ maxRetries: 1 }), 0)
  h.controller.onSessionCreated("child", true)
  h.controller.on429(input)
  await h.scheduler.runNext()
  h.controller.onIdle("child")
  await flushController()
  h.gates[0]!.resolve(false)
  await flushController()
  assert.deepEqual(h.controller.on429(input), { handled: false })
  assert.deepEqual(h.preparedFrom, [])
})

test("switch false plus queued 429 commits once and uses active target", async () => {
  const h = makeHarness({ deferredDispatch: true })
  const runtimeConfig = config({ maxRetries: 0 })
  h.controller.onSessionCreated("child", true)
  h.controller.on429(h.input("child", PRIMARY, runtimeConfig))
  await h.scheduler.runNext()
  h.controller.onIdle("child")
  await flushController()
  assert.deepEqual(h.dispatches, [FALLBACK])
  assert.equal(handledAction(h.controller.on429(h.input("child", PRIMARY, runtimeConfig))), "queued-429")
  h.controller.onIdle("child")
  h.gates[0]!.resolve(false)
  await flushController()
  assert.equal(h.commitCalls(), 1)
  assert.deepEqual(h.preparedFrom, [PRIMARY, FALLBACK])
})

test("bare false switch never commits", async () => {
  const h = makeHarness({ deferredDispatch: true })
  const input = h.input("child", PRIMARY, config({ maxRetries: 0 }))
  h.controller.onSessionCreated("child", true)
  h.controller.on429(input)
  await h.scheduler.runNext()
  h.controller.onIdle("child")
  await flushController()
  h.gates[0]!.resolve(false)
  await flushController()
  assert.equal(h.commitCalls(), 0)
  assert.deepEqual(h.controller.on429(input), { handled: false })
})

test("successful switch commits exactly once", async () => {
  const h = makeHarness({ deferredDispatch: true })
  const input = h.input("child", PRIMARY, config({ maxRetries: 0 }))
  h.controller.onSessionCreated("child", true)
  h.controller.on429(input)
  await h.scheduler.runNext()
  h.controller.onIdle("child")
  await flushController()
  h.gates[0]!.resolve(true)
  await flushController()
  assert.equal(h.commitCalls(), 1)
  h.controller.onIdle("child")
  assert.equal(h.commitCalls(), 1)
})

test("queued 429 accounting covers retry and switch across result and idle orders", async () => {
  for (const kind of ["retry", "switch"] as const) {
    for (const dispatched of [true, false]) {
      for (const order of ["queued-idle-settle", "queued-settle-idle"] as const) {
        const h = makeHarness({ deferredDispatch: true })
        const runtimeConfig = config({ maxRetries: kind === "retry" ? 2 : 0 })
        const input = h.input("child", PRIMARY, runtimeConfig, 0)
        h.controller.onSessionCreated("child", true)
        const initial = h.controller.on429(input)
        assert.equal(
          handledAction(initial),
          kind === "retry" ? "retry-gated" : "switch-gated",
        )
        if (initial.handled && initial.action === "retry-gated") {
          assert.equal(initial.retryOrdinal, 1)
        }
        await h.scheduler.runNext()
        h.controller.onIdle("child")
        await flushController()
        assert.equal(handledAction(h.controller.on429(input)), "queued-429")

        if (order === "queued-idle-settle") {
          assert.equal(h.controller.onIdle("child").kind, "queued-error-idle-observed")
          h.gates[0]!.resolve(dispatched)
          await flushController()
        } else {
          h.gates[0]!.resolve(dispatched)
          await flushController()
          assert.deepEqual(h.scheduler.pendingDelays(), [0])
          assert.equal(
            h.controller.onIdle("child").kind,
            "error-idle-observed",
            "post-settlement idle satisfies the queued error barrier",
          )
        }

        assert.deepEqual(
          h.preparedFrom,
          kind === "retry" ? [] : [PRIMARY, FALLBACK],
        )
        assert.equal(h.commitCalls(), kind === "switch" ? 1 : 0)
        if (kind === "retry") {
          const retryOrdinals = h.logFields
            .map((fields) => fields.retryOrdinal)
            .filter((value): value is number => typeof value === "number")
          assert.deepEqual(retryOrdinals, [1, 2])
        }
        assert.deepEqual(h.scheduler.pendingDelays(), [0])
        await h.scheduler.runNext()
        await flushController()
        assert.equal(h.dispatches.length, 2)
      }
    }
  }
})

test("active non-429 queues one post-settlement handoff for true and false", async () => {
  for (const dispatched of [true, false]) {
    const h = makeHarness({ deferredDispatch: true })
    const input = h.input("child", PRIMARY, config({ maxRetries: 1 }), 0)
    const handedOff: Subagent429Target[] = []
    h.controller.onSessionCreated("child", true)
    h.controller.on429(input)
    await h.scheduler.runNext()
    h.controller.onIdle("child")
    await flushController()
    const other = h.controller.onOtherError({
      sessionID: "child",
      runGenericFallback: async (target) => { handedOff.push(target) },
    })
    assert.equal(other.handled, true)
    if (other.handled) assert.equal(other.action, "queued-other-error")
    assert.equal(handledAction(h.controller.on429(input)), "duplicate-outcome")
    h.gates[0]!.resolve(dispatched)
    await flushController()
    assert.deepEqual(handedOff, [PRIMARY])
    assert.deepEqual(h.controller.on429(input), { handled: false })
  }
})

test("first provider outcome wins between queued 429 and queued other error", async () => {
  const first429 = makeHarness({ deferredDispatch: true })
  const input429 = first429.input("first-429", PRIMARY, config(), 0)
  let handoffCalls = 0
  first429.controller.onSessionCreated("first-429", true)
  first429.controller.on429(input429)
  await first429.scheduler.runNext()
  first429.controller.onIdle("first-429")
  await flushController()
  assert.equal(handledAction(first429.controller.on429(input429)), "queued-429")
  const duplicateOther = first429.controller.onOtherError({
    sessionID: "first-429",
    runGenericFallback: async () => { handoffCalls += 1 },
  })
  assert.equal(duplicateOther.handled, true)
  if (duplicateOther.handled) assert.equal(duplicateOther.action, "duplicate-outcome")
  first429.gates[0]!.resolve(false)
  await flushController()
  assert.equal(handoffCalls, 0)

  const firstOther = makeHarness({ deferredDispatch: true })
  const inputOther = firstOther.input("first-other", PRIMARY, config(), 0)
  firstOther.controller.onSessionCreated("first-other", true)
  firstOther.controller.on429(inputOther)
  await firstOther.scheduler.runNext()
  firstOther.controller.onIdle("first-other")
  await flushController()
  firstOther.controller.onOtherError({
    sessionID: "first-other",
    runGenericFallback: async () => { handoffCalls += 1 },
  })
  assert.equal(handledAction(firstOther.controller.on429(inputOther)), "duplicate-outcome")
  firstOther.gates[0]!.resolve(true)
  await flushController()
  assert.equal(handoffCalls, 1)
})

test("waiting non-429 is unhandled immediately and stale active handoff is cancelled", async () => {
  const waiting = makeHarness()
  waiting.controller.onSessionCreated("waiting", true)
  waiting.controller.on429(waiting.input("waiting", PRIMARY, config(), 90_000))
  const immediate = waiting.controller.onOtherError({
    sessionID: "waiting",
    runGenericFallback: async () => { throw new Error("must be called by handler") },
  })
  assert.deepEqual(immediate, { handled: false })
  assert.deepEqual(waiting.scheduler.pendingDelays(), [])

  const stale = makeHarness({ deferredDispatch: true })
  const staleInput = stale.input("stale", PRIMARY, config(), 0)
  let staleHandoffs = 0
  stale.controller.onSessionCreated("stale", true)
  stale.controller.on429(staleInput)
  await stale.scheduler.runNext()
  stale.controller.onIdle("stale")
  await flushController()
  stale.controller.onOtherError({
    sessionID: "stale",
    runGenericFallback: async () => { staleHandoffs += 1 },
  })
  stale.controller.onDeleted("stale")
  stale.controller.onSessionCreated("stale", true)
  stale.gates[0]!.resolve(true)
  await flushController()
  assert.equal(staleHandoffs, 0)
})
```

- [ ] **Step 6: Add failing retry algorithm, scope, isolation, and stale-completion tests**

```ts
test("five long probes precede the switch", async () => {
  const h = makeHarness()
  const input = h.input("child", PRIMARY, config(), 900_000)
  h.controller.onSessionCreated("child", true)
  for (let retry = 1; retry <= 5; retry++) {
    assert.equal(handledAction(h.controller.on429(input)), "retry-gated")
    await h.scheduler.runNext()
    h.controller.onIdle("child")
    await flushController()
    assert.equal(h.dispatches.length, retry)
  }
  assert.equal(handledAction(h.controller.on429(input)), "switch-gated")
})

test("ten-minute transition and equal-jitter cap are deterministic", async () => {
  const long = makeHarness()
  long.controller.onSessionCreated("long", true)
  long.controller.on429(long.input("long", PRIMARY, config(), 900_000))
  assert.deepEqual(long.scheduler.pendingDelays(), [0])
  await long.scheduler.runNext()
  long.controller.onIdle("long")
  await flushController()
  long.controller.on429(long.input("long", PRIMARY, config(), 600_000))
  assert.deepEqual(long.scheduler.pendingDelays(), [600_000])

  const jitter = makeHarness()
  jitter.controller.onSessionCreated("jitter", true)
  const input = jitter.input("jitter", PRIMARY, config({ maxRetries: 8 }))
  for (const delay of [750, 1_500, 3_000, 6_000, 12_000, 22_500, 22_500, 22_500]) {
    jitter.controller.on429(input)
    assert.equal(jitter.scheduler.pendingDelays()[0], delay)
    await jitter.scheduler.runNext()
    jitter.controller.onIdle("jitter")
    await flushController()
  }
})

test("model and provider scope blockers expire locally", () => {
  const model = makeHarness()
  model.controller.onSessionCreated("model", true)
  model.controller.on429(model.input("model", PRIMARY, config({ maxRetries: 0 }), 900_000))
  assert.equal(model.blockers[0]!({ providers: ["openai"], model: "primary" }), true)
  assert.equal(model.blockers[0]!({ providers: ["openai"], model: "other" }), false)
  model.setNow(1_900_001)
  assert.equal(model.blockers[0]!({ providers: ["openai"], model: "primary" }), false)

  const provider = makeHarness()
  provider.controller.onSessionCreated("provider", true)
  provider.controller.on429(provider.input("provider", PRIMARY, config({
    maxRetries: 0,
    providerScopes: { openai: "provider" },
  }), 900_000))
  assert.equal(provider.blockers[0]!({ providers: ["openai"], model: "other" }), true)
  assert.equal(provider.blockers[0]!({ providers: ["anthropic"], model: "other" }), false)

  const cooldown = makeHarness()
  cooldown.controller.onSessionCreated("cooldown", true)
  cooldown.controller.on429(cooldown.input("cooldown", PRIMARY, config(
    { maxRetries: 0 },
    { cooldownSeconds: 60 },
  )))
  assert.equal(cooldown.blockers[0]!({ providers: ["openai"], model: "primary" }), true)
  cooldown.setNow(1_060_001)
  assert.equal(cooldown.blockers[0]!({ providers: ["openai"], model: "primary" }), false)
})

test("two sessions keep independent barriers timers and deletion", async () => {
  const h = makeHarness()
  h.controller.onSessionCreated("a", true)
  h.controller.onSessionCreated("b", true)
  h.controller.on429(h.input("a", PRIMARY, config(), 90_000))
  h.controller.on429(h.input("b", PRIMARY, config(), 120_000))
  h.controller.onIdle("a")
  h.controller.onIdle("b")
  h.controller.onDeleted("a")
  assert.deepEqual(h.scheduler.pendingDelays(), [120_000])
  await h.scheduler.runNext()
  await flushController()
  assert.deepEqual(h.dispatches, [PRIMARY])
})

test("one session's retry count and blocked deadline do not affect another", async () => {
  const h = makeHarness()
  const runtimeConfig = config({ maxRetries: 1 })
  h.controller.onSessionCreated("a", true)
  h.controller.onSessionCreated("b", true)
  const inputA = h.input("a", PRIMARY, runtimeConfig, 900_000)
  const inputB = h.input("b", PRIMARY, runtimeConfig, 900_000)
  h.controller.on429(inputA)
  await h.scheduler.runNext()
  h.controller.onIdle("a")
  await flushController()
  assert.equal(handledAction(h.controller.on429(inputA)), "switch-gated")
  assert.equal(handledAction(h.controller.on429(inputB)), "retry-gated")
  assert.equal(h.blockers.length, 1)
})

test("stale completion cannot mutate a recreated session", async () => {
  const h = makeHarness({ deferredDispatch: true })
  const input = h.input("a", PRIMARY, config(), 0)
  h.controller.onSessionCreated("a", true)
  h.controller.on429(input)
  await h.scheduler.runNext()
  h.controller.onIdle("a")
  await flushController()
  h.controller.onDeleted("a")
  h.controller.onSessionCreated("a", true)
  h.gates[0]!.resolve(true)
  await flushController()
  assert.equal(h.controller.onIdle("a").kind, "initial-succeeded")
})
```

- [ ] **Step 7: Run controller test red**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/subagent-429-controller.test.ts
```

Expected: FAIL because the controller and its barrier/prepare interfaces do not exist.

- [ ] **Step 8: Implement exact public types**

Create `src/runtime-fallback/subagent-429-controller.ts` with:

```ts
import type { RuntimeFallbackConfig } from "../config/schema.ts"
import type { FallbackEntry } from "../shared/types.ts"
import { log as defaultLog } from "../shared/logger.ts"
import type { FallbackCandidateBlocker, PeekResult } from "./fallback-state.ts"

export type Subagent429Scope = "model" | "provider"
export type Subagent429Target = { providerID: string; modelID: string; entry: FallbackEntry }
export type Subagent429Scheduler = { schedule(delayMs: number, run: () => Promise<void>): () => void }
export type Subagent429DispatchInput = {
  sessionID: string
  agent?: string
  target: Subagent429Target
  reason: string
}
export type Subagent429PreparedSwitch = {
  target: Subagent429Target
  attempt: number
  commit: () => void
}
export type Subagent429PrepareFailure =
  Extract<PeekResult, { ok: false }>["reason"] | "dispatch-failed"
export type Subagent429PrepareResult =
  | { ok: true; prepared: Subagent429PreparedSwitch }
  | { ok: false; reason: Subagent429PrepareFailure }
export type Subagent429ErrorInput = {
  sessionID: string
  agent?: string
  target: Subagent429Target
  classification: { reason: string; recoveryDelayMs?: number }
  runtimeConfig: RuntimeFallbackConfig
  prepareSwitch: (
    failedTarget: Subagent429Target,
    isCandidateBlocked: FallbackCandidateBlocker,
  ) => Subagent429PrepareResult
}
export type Subagent429GenericHandoff = (
  activeTarget: Subagent429Target,
) => Promise<void>
export type Subagent429OtherErrorInput = {
  sessionID: string
  runGenericFallback: Subagent429GenericHandoff
}
export type Queued429 = {
  kind: "429"
  dispatchGeneration: number
  input: Subagent429ErrorInput
  errorIdleObserved: boolean
}
export type QueuedOtherError = {
  kind: "other"
  dispatchGeneration: number
  runGenericFallback: Subagent429GenericHandoff
}
export type QueuedOutcome = Queued429 | QueuedOtherError
export type Subagent429Decision =
  | { handled: false }
  | { handled: true; action: "retry-gated"; delayMs: number; retryOrdinal: number; scope: Subagent429Scope }
  | { handled: true; action: "switch-gated"; attempt: number; target: Subagent429Target }
  | { handled: true; action: "queued-429"; dispatchGeneration: number }
  | { handled: true; action: "duplicate-outcome"; dispatchGeneration: number }
  | { handled: true; action: "observe-only" }
  | { handled: true; action: "stopped"; reason: Subagent429PrepareFailure | "dispatch-unavailable" }
export type Subagent429OtherErrorDecision =
  | { handled: false }
  | { handled: true; action: "queued-other-error"; dispatchGeneration: number }
  | { handled: true; action: "duplicate-outcome"; dispatchGeneration: number }
export type Subagent429IdleResult = {
  kind:
    | "untracked"
    | "initial-succeeded"
    | "error-idle-observed"
    | "dispatch-idle-observed"
    | "queued-error-idle-observed"
    | "retry-succeeded"
  suppressIdleContinuation: boolean
}
export type Subagent429Controller = {
  onSessionCreated(sessionID: string, isChild: boolean): void
  on429(input: Subagent429ErrorInput): Subagent429Decision
  onOtherError(input: Subagent429OtherErrorInput): Subagent429OtherErrorDecision
  onIdle(sessionID: string): Subagent429IdleResult
  onDeleted(sessionID: string): void
  getActiveDispatchTarget(sessionID: string): Subagent429Target | undefined
}
export type Subagent429ControllerDeps = {
  scheduler?: Subagent429Scheduler
  clock?: () => number
  random?: () => number
  dispatchRetry?: (input: Subagent429DispatchInput) => Promise<boolean>
  logger?: Pick<typeof defaultLog, "debug" | "info" | "warn">
}
```

- [ ] **Step 9: Implement the complete state machine**

Use these private types:

```ts
type PreparedDispatch =
  | {
      kind: "retry"
      target: Subagent429Target
      agent?: string
      reason: string
      scope: Subagent429Scope
      scopeKey: string
      retriesUsed: number
      retryOrdinal: number
    }
  | {
      kind: "switch"
      target: Subagent429Target
      agent?: string
      reason: string
      attempt: number
      commit: () => void
    }
type PendingGate = {
  timerGeneration: number
  delayReady: boolean
  errorIdleObserved: boolean
  started: boolean
  dispatch: PreparedDispatch
}
type ActiveDispatch = {
  generation: number
  lifecycleGeneration: number
  dispatch: PreparedDispatch
  idleObserved: boolean
  queuedOutcome?: QueuedOutcome
  accounted: boolean
}
type Session429State = {
  phase: "initial-pending" | "waiting-barrier" | "dispatching" | "awaiting-result"
  outcome: "none" | "known-429" | "queued-429" | "queued-other-error"
  currentTarget?: Subagent429Target
  retryCounts: Map<string, number>
  blockedUntil: Map<string, number>
  lastRecoveryDeadline: Map<string, number>
  lifecycleGeneration: number
  timerGeneration: number
  nextDispatchGeneration: number
  pendingGate?: PendingGate
  activeDispatch?: ActiveDispatch
  cancelTimer?: () => void
}
```

Implement constants, scope helpers, and equal jitter exactly as specified in Global Constraints, then implement the factory with this complete control flow:

```ts
export function createSubagent429Controller(
  deps: Subagent429ControllerDeps,
): Subagent429Controller {
  const scheduler = deps.scheduler ?? {
    schedule(delayMs: number, run: () => Promise<void>) {
      const handle = setTimeout(() => { void run() }, delayMs)
      return () => clearTimeout(handle)
    },
  }
  const clock = deps.clock ?? Date.now
  const random = deps.random ?? Math.random
  const logger = deps.logger ?? defaultLog
  const sessions = new Map<string, Session429State>()

  const stop = (sessionID: string, expected?: Session429State): void => {
    const state = sessions.get(sessionID)
    if (!state || (expected !== undefined && state !== expected)) return
    state.lifecycleGeneration += 1
    state.timerGeneration += 1
    state.nextDispatchGeneration += 1
    state.cancelTimer?.()
    state.cancelTimer = undefined
    state.pendingGate = undefined
    state.activeDispatch = undefined
    sessions.delete(sessionID)
  }

  const blocker = (
    state: Session429State,
    runtimeConfig: RuntimeFallbackConfig,
  ): FallbackCandidateBlocker => (entry) => {
    const providerID = entry.providers[0] ?? ""
    const scope = runtimeConfig.subagent429.providerScopes[providerID] ?? "model"
    const key = scope === "provider"
      ? `provider:${providerID}`
      : `model:${providerID}/${entry.model}`
    return (state.blockedUntil.get(key) ?? 0) > clock()
  }

  const isCurrent = (
    sessionID: string,
    state: Session429State,
    active: ActiveDispatch,
  ): boolean =>
    sessions.get(sessionID) === state &&
    state.lifecycleGeneration === active.lifecycleGeneration &&
    state.activeDispatch?.generation === active.generation

  const maybeStart = (sessionID: string, state: Session429State, gate: PendingGate): void => {
    if (sessions.get(sessionID) !== state || state.pendingGate !== gate) return
    if (gate.started || !gate.delayReady || !gate.errorIdleObserved) return
    gate.started = true
    state.pendingGate = undefined
    state.cancelTimer = undefined
    state.nextDispatchGeneration += 1
    const active: ActiveDispatch = {
      generation: state.nextDispatchGeneration,
      lifecycleGeneration: state.lifecycleGeneration,
      dispatch: gate.dispatch,
      idleObserved: false,
      accounted: false,
    }
    state.activeDispatch = active
    state.phase = "dispatching"
    state.outcome = "none"
    void settle(sessionID, state, active)
  }

  const installGate = (
    sessionID: string,
    state: Session429State,
    dispatch: PreparedDispatch,
    delayMs: number,
    errorIdleObserved: boolean,
  ): void => {
    state.timerGeneration += 1
    const timerGeneration = state.timerGeneration
    state.cancelTimer?.()
    const gate: PendingGate = {
      timerGeneration,
      delayReady: false,
      errorIdleObserved,
      started: false,
      dispatch,
    }
    state.pendingGate = gate
    state.phase = "waiting-barrier"
    state.outcome = "known-429"
    state.cancelTimer = scheduler.schedule(delayMs, async () => {
      if (sessions.get(sessionID) !== state ||
          state.pendingGate !== gate ||
          state.timerGeneration !== timerGeneration) return
      state.cancelTimer = undefined
      gate.delayReady = true
      maybeStart(sessionID, state, gate)
    })
  }

  const process429 = (
    state: Session429State,
    input: Subagent429ErrorInput,
    errorIdleObserved: boolean,
  ): Subagent429Decision => {
    if (!input.runtimeConfig.subagent429.enabled) {
      stop(input.sessionID, state)
      return { handled: false }
    }
    if (!input.runtimeConfig.dispatch) {
      logger.info("subagent429 observe-only", {
        sessionID: input.sessionID,
        providerID: input.target.providerID,
        modelID: input.target.modelID,
      })
      stop(input.sessionID, state)
      return { handled: true, action: "observe-only" }
    }
    if (!deps.dispatchRetry) {
      stop(input.sessionID, state)
      return { handled: true, action: "stopped", reason: "dispatch-unavailable" }
    }
    state.currentTarget = input.target
    const scope: Subagent429Scope = input.runtimeConfig.subagent429.providerScopes[input.target.providerID] ?? "model"
    const key = scope === "provider"
      ? `provider:${input.target.providerID}`
      : `model:${input.target.providerID}/${input.target.modelID}`
    const retriesUsed = state.retryCounts.get(key) ?? 0
    const now = clock()
    const recoveryDelayMs = input.classification.recoveryDelayMs
    if (recoveryDelayMs !== undefined) state.lastRecoveryDeadline.set(key, now + recoveryDelayMs)

    if (retriesUsed >= input.runtimeConfig.subagent429.maxRetries) {
      state.blockedUntil.set(
        key,
        state.lastRecoveryDeadline.get(key) ?? now + input.runtimeConfig.cooldownSeconds * 1_000,
      )
      const result = input.prepareSwitch(input.target, blocker(state, input.runtimeConfig))
      if (!result.ok) {
        logger.warn("subagent429 switch stopped", {
          sessionID: input.sessionID,
          providerID: input.target.providerID,
          modelID: input.target.modelID,
          scope,
          reason: result.reason,
        })
        stop(input.sessionID, state)
        return { handled: true, action: "stopped", reason: result.reason }
      }
      installGate(input.sessionID, state, {
        kind: "switch",
        target: result.prepared.target,
        ...(input.agent !== undefined ? { agent: input.agent } : {}),
        reason: input.classification.reason,
        attempt: result.prepared.attempt,
        commit: result.prepared.commit,
      }, 0, errorIdleObserved)
      logger.info("subagent429 switch gated", {
        sessionID: input.sessionID,
        providerID: result.prepared.target.providerID,
        modelID: result.prepared.target.modelID,
        attempt: result.prepared.attempt,
        delayMs: 0,
        scope,
        reason: "retry-budget-exhausted",
      })
      return {
        handled: true,
        action: "switch-gated",
        attempt: result.prepared.attempt,
        target: result.prepared.target,
      }
    }

    const raw = Math.min(30_000, 1_000 * (2 ** retriesUsed))
    const sample = Math.min(Math.max(random(), 0), 1 - Number.EPSILON)
    const delayMs = recoveryDelayMs === undefined
      ? Math.floor(raw / 2 + sample * raw / 2)
      : recoveryDelayMs > 600_000 ? 0 : recoveryDelayMs
    installGate(input.sessionID, state, {
      kind: "retry",
      target: input.target,
      ...(input.agent !== undefined ? { agent: input.agent } : {}),
      reason: input.classification.reason,
      scope,
      scopeKey: key,
      retriesUsed,
      retryOrdinal: retriesUsed + 1,
    }, delayMs, errorIdleObserved)
    logger.info("subagent429 retry gated", {
      sessionID: input.sessionID,
      providerID: input.target.providerID,
      modelID: input.target.modelID,
      retryOrdinal: retriesUsed + 1,
      delayMs,
      scope,
    })
    return {
      handled: true,
      action: "retry-gated",
      delayMs,
      retryOrdinal: retriesUsed + 1,
      scope,
    }
  }

  async function settle(
    sessionID: string,
    state: Session429State,
    active: ActiveDispatch,
  ): Promise<void> {
    let dispatched = false
    try {
      dispatched = await deps.dispatchRetry!({
        sessionID,
        ...(active.dispatch.agent !== undefined ? { agent: active.dispatch.agent } : {}),
        target: active.dispatch.target,
        reason: active.dispatch.reason,
      })
    } catch {
      dispatched = false
    }
    if (!isCurrent(sessionID, state, active)) return
    const queuedOutcome = active.queuedOutcome
    const requestProven = dispatched || queuedOutcome !== undefined
    if (requestProven && !active.accounted) {
      active.accounted = true
      if (active.dispatch.kind === "retry") {
        state.retryCounts.set(active.dispatch.scopeKey, active.dispatch.retriesUsed + 1)
      } else {
        active.dispatch.commit()
      }
    }
    state.activeDispatch = undefined
    if (requestProven) state.currentTarget = active.dispatch.target
    if (queuedOutcome?.kind === "429") {
      process429(
        state,
        { ...queuedOutcome.input, target: active.dispatch.target },
        queuedOutcome.errorIdleObserved,
      )
      return
    }
    if (queuedOutcome?.kind === "other") {
      const runGenericFallback = queuedOutcome.runGenericFallback
      stop(sessionID, state)
      try {
        await runGenericFallback(active.dispatch.target)
      } catch {
        logger.warn("subagent429 generic handoff failed", {
          sessionID,
          providerID: active.dispatch.target.providerID,
          modelID: active.dispatch.target.modelID,
          reason: "handoff-threw",
        })
      }
      return
    }
    if (active.idleObserved) {
      stop(sessionID, state)
      return
    }
    if (!dispatched) {
      logger.warn("subagent429 dispatch stopped", {
        sessionID,
        providerID: active.dispatch.target.providerID,
        modelID: active.dispatch.target.modelID,
        kind: active.dispatch.kind,
        reason: "bare-false",
      })
      stop(sessionID, state)
      return
    }
    state.phase = "awaiting-result"
    state.outcome = "none"
  }

  return {
    onSessionCreated(sessionID, isChild) {
      stop(sessionID)
      if (!isChild) return
      sessions.set(sessionID, {
        phase: "initial-pending",
        outcome: "none",
        retryCounts: new Map(),
        blockedUntil: new Map(),
        lastRecoveryDeadline: new Map(),
        lifecycleGeneration: 0,
        timerGeneration: 0,
        nextDispatchGeneration: 0,
      })
    },
    on429(input) {
      const state = sessions.get(input.sessionID)
      if (!state) return { handled: false }
      if (!input.runtimeConfig.subagent429.enabled) {
        stop(input.sessionID, state)
        return { handled: false }
      }
      const active = state.activeDispatch
      if (state.phase === "dispatching" && active) {
        if (active.queuedOutcome) {
          return {
            handled: true,
            action: "duplicate-outcome",
            dispatchGeneration: active.generation,
          }
        }
        active.queuedOutcome = {
          kind: "429",
          dispatchGeneration: active.generation,
          input,
          errorIdleObserved: false,
        }
        state.outcome = "queued-429"
        return { handled: true, action: "queued-429", dispatchGeneration: active.generation }
      }
      if (state.phase === "waiting-barrier") {
        return {
          handled: true,
          action: "duplicate-outcome",
          dispatchGeneration: state.nextDispatchGeneration,
        }
      }
      return process429(state, input, false)
    },
    onOtherError(input) {
      const state = sessions.get(input.sessionID)
      if (!state) return { handled: false }
      const active = state.activeDispatch
      if (state.phase === "dispatching" && active) {
        if (active.queuedOutcome) {
          return {
            handled: true,
            action: "duplicate-outcome",
            dispatchGeneration: active.generation,
          }
        }
        active.queuedOutcome = {
          kind: "other",
          dispatchGeneration: active.generation,
          runGenericFallback: input.runGenericFallback,
        }
        state.outcome = "queued-other-error"
        return {
          handled: true,
          action: "queued-other-error",
          dispatchGeneration: active.generation,
        }
      }
      stop(input.sessionID, state)
      return { handled: false }
    },
    onIdle(sessionID) {
      const state = sessions.get(sessionID)
      if (!state) return { kind: "untracked", suppressIdleContinuation: false }
      if (state.phase === "initial-pending") {
        stop(sessionID, state)
        return { kind: "initial-succeeded", suppressIdleContinuation: false }
      }
      const gate = state.pendingGate
      if (state.phase === "waiting-barrier" && gate) {
        gate.errorIdleObserved = true
        maybeStart(sessionID, state, gate)
        return { kind: "error-idle-observed", suppressIdleContinuation: true }
      }
      const active = state.activeDispatch
      if (state.phase === "dispatching" && active) {
        if (active.queuedOutcome?.kind === "429") {
          active.queuedOutcome.errorIdleObserved = true
          return { kind: "queued-error-idle-observed", suppressIdleContinuation: true }
        }
        active.idleObserved = true
        return { kind: "dispatch-idle-observed", suppressIdleContinuation: true }
      }
      stop(sessionID, state)
      return { kind: "retry-succeeded", suppressIdleContinuation: false }
    },
    onDeleted(sessionID) { stop(sessionID) },
    getActiveDispatchTarget(sessionID) {
      return sessions.get(sessionID)?.activeDispatch?.dispatch.target
    },
  }
}
```

The order is mandatory: gate start clears prior outcome; settlement validates identity and generations; `requestProven` accounts once; the first queued provider outcome outranks idle; queued 429 receives active target plus `errorIdleObserved`; queued other error stops dedicated state and awaits its generic handoff only after `dispatchRetry` has settled and released the dispatcher's in-flight guard; bare false stops without accounting.

- [ ] **Step 10: Pass focused tests and typecheck**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/dispatcher.test.ts src/runtime-fallback/subagent-429-controller.test.ts src/runtime-fallback/error-classifier.test.ts src/runtime-fallback/fallback-state.test.ts
pnpm run typecheck
```

Expected: all selected tests pass and typecheck exits 0.

- [ ] **Step 11: Report and integrate**

The subagent reports four files, evidence, and suggested message `feat: add event-owned subagent 429 retries`. It performs no Git writes. The orchestrator reruns checks and may create that atomic commit; it does not push or tag.

---

### Task 5: Integrate Event Lineage, Active Targets, Barriers, and Prepare/Commit Switching

**Files:**
- Modify: `src/runtime-fallback/event-handler.ts`
- Modify: `src/runtime-fallback/event-handler.test.ts`
- Test unchanged behavior: `src/runtime-fallback/dispatcher.test.ts`

**Interfaces:**
- Consumes: controller APIs from Task 4, `classifyError(error, cfg, now)`, existing `FallbackState`, `peekNextFallback()`, `commitFallback()`, and `dispatchFallbackRetry()`.
- Produces: optional `RuntimeFallbackDeps.scheduler/clock/random`, dedicated no-abort dispatch, active-target fallback for model-less in-flight errors, and idempotent switch commits.

- [ ] **Step 1: Add real-event test helpers**

Add near existing event test helpers:

```ts
import type { Subagent429Scheduler } from "./subagent-429-controller.ts"

type ParentField = "parentID" | "parentId" | "parentSessionID" | "parentSessionId"

function makeCreatedEvent(sessionID: string, parentField?: ParentField) {
  return {
    event: {
      type: "session.created",
      properties: {
        sessionID,
        ...(parentField !== undefined ? { [parentField]: "parent" } : {}),
      },
    },
  }
}

class FakeScheduler implements Subagent429Scheduler {
  readonly tasks: Array<{ delayMs: number; run: () => Promise<void>; cancelled: boolean }> = []
  schedule(delayMs: number, run: () => Promise<void>): () => void {
    const task = { delayMs, run, cancelled: false }
    this.tasks.push(task)
    return () => { task.cancelled = true }
  }
  pendingDelays(): number[] {
    return this.tasks.filter((task) => !task.cancelled).map((task) => task.delayMs)
  }
  async runNext(): Promise<void> {
    const task = this.tasks.find((candidate) => !candidate.cancelled)
    assert.ok(task, "expected event-handler timer")
    task.cancelled = true
    await task.run()
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

async function flushEvents(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

function makeControlledClient() {
  const calls: PromptCall[] = []
  const prompts: Array<ReturnType<typeof deferred<void>>> = []
  let abortCalls = 0
  const client: OcmmClient = {
    session: {
      async abort() { abortCalls += 1 },
      async messages() {
        return { messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }] }
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
        const gate = deferred<void>()
        prompts.push(gate)
        await gate.promise
      },
    },
  }
  return {
    client,
    calls,
    prompts,
    abortCalls: () => abortCalls,
    resolvePrompt(index: number) { prompts[index]!.resolve(undefined) },
    rejectPrompt(index: number) { prompts[index]!.reject(new Error("prompt rejected")) },
  }
}
```

- [ ] **Step 2: Add failing activation, barrier, no-abort, and lineage tests**

```ts
test("real handler waits for delay and 429 idle then retries same model without abort", async () => {
  const fixture = makeControlledClient()
  const scheduler = new FakeScheduler()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: fixture.client,
    scheduler,
    clock: () => 1_000_000,
  })
  await handler(makeCreatedEvent("child", "parentID"))
  await handler(makeErrorEvent("child", { status: 429, retryAfter: 90 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await scheduler.runNext()
  await flushEvents()
  assert.equal(fixture.calls.length, 0)
  await handler(makeIdleEvent("child"))
  await flushEvents()
  assert.equal(fixture.calls[0]?.body.modelID, "primary-model")
  assert.equal(fixture.abortCalls(), 0)
  fixture.resolvePrompt(0)
  await flushEvents()
})

test("all four parent fields activate the dedicated path", async () => {
  for (const [index, field] of ([
    "parentID", "parentId", "parentSessionID", "parentSessionId",
  ] as const).entries()) {
    const { client, calls } = makeMockClient()
    const scheduler = new FakeScheduler()
    const cfg = makeConfig()
    const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, scheduler })
    const sessionID = `child-${index}`
    await handler(makeCreatedEvent(sessionID, field))
    await handler(makeErrorEvent(sessionID, { status: 429, retryAfterMs: 1 }, {
      agent: "orchestrator",
      model: { providerID: "hoo", modelID: "primary-model" },
    }))
    await handler(makeIdleEvent(sessionID))
    await scheduler.runNext()
    await flushEvents()
    assert.equal(calls[0]?.body.modelID, "primary-model")
  }
})
```

- [ ] **Step 3: Add failing deferred success-idle and queued precedence tests**

```ts
test("single success idle before prompt resolution clears dedicated state", async () => {
  const fixture = makeControlledClient()
  const scheduler = new FakeScheduler()
  const cfg = makeConfig({ subagent429: { maxRetries: 1 } })
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: fixture.client,
    scheduler,
    clock: () => 1_000_000,
  })
  const error = () => makeErrorEvent("child", { status: 429, retryAfterMs: 1 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  })
  await handler(makeCreatedEvent("child", "parentID"))
  await handler(error())
  await scheduler.runNext()
  await handler(makeIdleEvent("child"))
  await flushEvents()
  assert.equal(fixture.calls.length, 1)

  await handler(makeIdleEvent("child"))
  fixture.resolvePrompt(0)
  await flushEvents()

  const later = handler(error())
  await flushEvents()
  assert.equal(fixture.calls[1]?.body.modelID, "fallback-a")
  fixture.resolvePrompt(1)
  await later
  assert.equal(fixture.abortCalls(), 1, "only the later generic fallback aborts")
})

test("false plus queued same-model 429 is counted and switched after inherited idle", async () => {
  const fixture = makeControlledClient()
  const scheduler = new FakeScheduler()
  const cfg = makeConfig({ subagent429: { maxRetries: 1 } })
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: fixture.client,
    scheduler,
    clock: () => 1_000_000,
  })
  const error = () => makeErrorEvent("child", { status: 429, retryAfter: 900 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  })
  await handler(makeCreatedEvent("child", "parentID"))
  await handler(error())
  await scheduler.runNext()
  await handler(makeIdleEvent("child"))
  await flushEvents()
  await handler(error())
  await handler(makeIdleEvent("child"))
  fixture.rejectPrompt(0)
  await flushEvents()

  assert.deepEqual(scheduler.pendingDelays(), [0])
  await scheduler.runNext()
  await flushEvents()
  assert.deepEqual(fixture.calls.map((call) => call.body.modelID), [
    "primary-model",
    "fallback-a",
  ])
  assert.equal(fixture.abortCalls(), 0)
  fixture.resolvePrompt(1)
  await flushEvents()
})

test("false plus queued switch commits once and model-less error uses active fallback target", async () => {
  const fixture = makeControlledClient()
  const scheduler = new FakeScheduler()
  const cfg = makeConfig({ maxAttempts: 2, subagent429: { maxRetries: 0 } })
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: fixture.client,
    scheduler,
    clock: () => 1_000_000,
  })
  await handler(makeCreatedEvent("child", "parentID"))
  await handler(makeErrorEvent("child", { status: 429 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await scheduler.runNext()
  await handler(makeIdleEvent("child"))
  await flushEvents()
  assert.equal(fixture.calls[0]?.body.modelID, "fallback-a")

  await handler(makeErrorEvent("child", { status: 429 }, { agent: "orchestrator" }))
  await handler(makeIdleEvent("child"))
  fixture.rejectPrompt(0)
  await flushEvents()
  assert.deepEqual(scheduler.pendingDelays(), [0])
  await scheduler.runNext()
  await flushEvents()
  assert.deepEqual(fixture.calls.map((call) => call.body.modelID), ["fallback-a", "fallback-b"])
  assert.equal(fixture.abortCalls(), 0)
  fixture.resolvePrompt(1)
  await flushEvents()
})

test("queued switch commit consumes the single maxAttempts budget", async () => {
  const fixture = makeControlledClient()
  const scheduler = new FakeScheduler()
  const cfg = makeConfig({ maxAttempts: 1, subagent429: { maxRetries: 0 } })
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: fixture.client,
    scheduler,
    clock: () => 1_000_000,
  })
  await handler(makeCreatedEvent("child", "parentID"))
  await handler(makeErrorEvent("child", { status: 429 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await scheduler.runNext()
  await handler(makeIdleEvent("child"))
  await flushEvents()
  await handler(makeErrorEvent("child", { status: 429 }, { agent: "orchestrator" }))
  await handler(makeIdleEvent("child"))
  fixture.rejectPrompt(0)
  await flushEvents()
  assert.deepEqual(fixture.calls.map((call) => call.body.modelID), ["fallback-a"])
  assert.deepEqual(scheduler.pendingDelays(), [])
})

test("bare false switch does not commit and later generic fallback selects the same entry", async () => {
  const fixture = makeControlledClient()
  const scheduler = new FakeScheduler()
  const cfg = makeConfig({ maxAttempts: 2, subagent429: { maxRetries: 0 } })
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: fixture.client,
    scheduler,
    clock: () => 1_000_000,
  })
  const initial = () => makeErrorEvent("child", { status: 429 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  })
  await handler(makeCreatedEvent("child", "parentID"))
  await handler(initial())
  await scheduler.runNext()
  await handler(makeIdleEvent("child"))
  await flushEvents()
  fixture.rejectPrompt(0)
  await flushEvents()

  const later = handler(initial())
  await flushEvents()
  assert.deepEqual(fixture.calls.map((call) => call.body.modelID), ["fallback-a", "fallback-a"])
  fixture.resolvePrompt(1)
  await later
})

test("active non-429 performs one generic handoff after true and false settlement", async () => {
  for (const settlement of ["resolve", "reject"] as const) {
    const fixture = makeControlledClient()
    const scheduler = new FakeScheduler()
    const cfg = makeConfig({ subagent429: { maxRetries: 2 } })
    const handler = createRuntimeFallbackEventHandler({
      getConfig: () => cfg,
      client: fixture.client,
      scheduler,
      clock: () => 1_000_000,
    })
    await handler(makeCreatedEvent("child", "parentID"))
    await handler(makeErrorEvent("child", { status: 429, retryAfterMs: 1 }, {
      agent: "orchestrator",
      model: { providerID: "hoo", modelID: "primary-model" },
    }))
    await scheduler.runNext()
    await handler(makeIdleEvent("child"))
    await flushEvents()

    const other = () => makeErrorEvent("child", { status: 503 }, {
      agent: "orchestrator",
    })
    await handler(other())
    await handler(other())
    await handler(makeIdleEvent("child"))
    if (settlement === "resolve") fixture.resolvePrompt(0)
    else fixture.rejectPrompt(0)
    await flushEvents()

    assert.deepEqual(fixture.calls.map((call) => call.body.modelID), [
      "primary-model",
      "fallback-a",
    ])
    assert.equal(fixture.abortCalls(), 1, "only generic handoff uses pre-abort")
    fixture.resolvePrompt(1)
    await flushEvents()
  }
})

test("queued switch non-429 commits then hands off from active fallback target", async () => {
  const fixture = makeControlledClient()
  const scheduler = new FakeScheduler()
  const cfg = makeConfig({ maxAttempts: 2, subagent429: { maxRetries: 0 } })
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: fixture.client,
    scheduler,
    clock: () => 1_000_000,
  })
  await handler(makeCreatedEvent("child", "parentID"))
  await handler(makeErrorEvent("child", { status: 429 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await scheduler.runNext()
  await handler(makeIdleEvent("child"))
  await flushEvents()
  assert.equal(fixture.calls[0]?.body.modelID, "fallback-a")

  await handler(makeErrorEvent("child", { status: 503 }, { agent: "orchestrator" }))
  await handler(makeIdleEvent("child"))
  fixture.rejectPrompt(0)
  await flushEvents()
  assert.deepEqual(fixture.calls.map((call) => call.body.modelID), ["fallback-a", "fallback-b"])
  fixture.resolvePrompt(1)
  await flushEvents()
})

test("deletion and recreation cancel a stale queued generic handoff", async () => {
  const fixture = makeControlledClient()
  const scheduler = new FakeScheduler()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: fixture.client,
    scheduler,
    clock: () => 1_000_000,
  })
  await handler(makeCreatedEvent("child", "parentID"))
  await handler(makeErrorEvent("child", { status: 429, retryAfterMs: 1 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await scheduler.runNext()
  await handler(makeIdleEvent("child"))
  await flushEvents()
  await handler(makeErrorEvent("child", { status: 503 }, { agent: "orchestrator" }))
  await handler({ event: { type: "session.deleted", properties: { sessionID: "child" } } })
  await handler(makeCreatedEvent("child", "parentID"))
  fixture.resolvePrompt(0)
  await flushEvents()
  assert.deepEqual(fixture.calls.map((call) => call.body.modelID), ["primary-model"])
  assert.equal(fixture.abortCalls(), 0)
})
```

- [ ] **Step 4: Add failing bare-false, scope, budget, isolation, and generic regression tests**

```ts
test("bare false dedicated retry stops and a later 429 is generic", async () => {
  const fixture = makeControlledClient()
  const scheduler = new FakeScheduler()
  const cfg = makeConfig({ subagent429: { maxRetries: 1 } })
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: fixture.client,
    scheduler,
    clock: () => 1_000_000,
  })
  const error = () => makeErrorEvent("child", { status: 429, retryAfterMs: 1 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  })
  await handler(makeCreatedEvent("child", "parentID"))
  await handler(error())
  await scheduler.runNext()
  await handler(makeIdleEvent("child"))
  await flushEvents()
  fixture.rejectPrompt(0)
  await flushEvents()
  const later = handler(error())
  await flushEvents()
  assert.equal(fixture.calls[1]?.body.modelID, "fallback-a")
  fixture.resolvePrompt(1)
  await later
})

test("scope filtering chooses same-provider model only for model scope", async () => {
  for (const expected of [
    { scope: "model" as const, providerID: "openai", modelID: "same-provider" },
    { scope: "provider" as const, providerID: "anthropic", modelID: "other-provider" },
  ]) {
    const { client, calls } = makeMockClient()
    const scheduler = new FakeScheduler()
    const cfg = OcmmConfigSchema.parse({
      agents: {
        orchestrator: {
          requirement: {
            fallbackChain: [
              { providers: ["openai"], model: "primary" },
              { providers: ["openai"], model: "same-provider" },
              { providers: ["anthropic"], model: "other-provider" },
            ],
          },
        },
      },
      runtimeFallback: {
        subagent429: {
          maxRetries: 0,
          providerScopes: { openai: expected.scope },
        },
      },
    })
    const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, scheduler })
    const sessionID = `child-${expected.scope}`
    await handler(makeCreatedEvent(sessionID, "parentID"))
    await handler(makeErrorEvent(sessionID, { status: 429 }, {
      agent: "orchestrator",
      model: { providerID: "openai", modelID: "primary" },
    }))
    await handler(makeIdleEvent(sessionID))
    await scheduler.runNext()
    await flushEvents()
    assert.equal(calls[0]?.body.providerID, expected.providerID)
    assert.equal(calls[0]?.body.modelID, expected.modelID)
  }
})

test("fresh fallback budget does not consume a second maxAttempts switch", async () => {
  const { client, calls } = makeMockClient()
  const scheduler = new FakeScheduler()
  const cfg = makeConfig({ maxAttempts: 1, subagent429: { maxRetries: 1 } })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, scheduler })
  const send = async (modelID: string) => {
    await handler(makeErrorEvent("child", { status: 429, retryAfter: 900 }, {
      agent: "orchestrator",
      model: { providerID: "hoo", modelID },
    }))
    await handler(makeIdleEvent("child"))
    await scheduler.runNext()
    await flushEvents()
  }
  await handler(makeCreatedEvent("child", "parentID"))
  await send("primary-model")
  await send("primary-model")
  await send("fallback-a")
  await handler(makeErrorEvent("child", { status: 429 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "fallback-a" },
  }))
  assert.deepEqual(calls.map((call) => call.body.modelID), [
    "primary-model",
    "fallback-a",
    "fallback-a",
  ])
})

test("root non-429 regex-only and disabled flows remain generic", async () => {
  const cases = [
    { parentField: undefined, error: { status: 429 }, overrides: {} },
    { parentField: "parentID" as const, error: { status: 503 }, overrides: {} },
    { parentField: "parentID" as const, error: { message: "rate limit" }, overrides: {} },
    { parentField: "parentID" as const, error: { status: 429 }, overrides: { subagent429: { enabled: false } } },
  ]
  for (const [index, scenario] of cases.entries()) {
    const { client, calls } = makeMockClient()
    const scheduler = new FakeScheduler()
    const cfg = makeConfig(scenario.overrides)
    const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, scheduler })
    const sessionID = `case-${index}`
    await handler(makeCreatedEvent(sessionID, scenario.parentField))
    await handler(makeErrorEvent(sessionID, scenario.error, {
      agent: "orchestrator",
      model: { providerID: "hoo", modelID: "primary-model" },
    }))
    assert.deepEqual(scheduler.pendingDelays(), [])
    assert.equal(calls[0]?.body.modelID, "fallback-a")
  }
})

test("initial idle consumes child activation so a later 429 is generic", async () => {
  const { client, calls } = makeMockClient()
  const scheduler = new FakeScheduler()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, scheduler })
  await handler(makeCreatedEvent("child", "parentID"))
  await handler(makeIdleEvent("child"))
  await handler(makeErrorEvent("child", { status: 429, retryAfter: 90 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.deepEqual(scheduler.pendingDelays(), [])
  assert.deepEqual(calls.map((call) => call.body.modelID), ["fallback-a"])
})

test("initial non-429 consumes child activation before a later 429", async () => {
  const { client, calls } = makeMockClient()
  const scheduler = new FakeScheduler()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, scheduler })
  await handler(makeCreatedEvent("child", "parentID"))
  await handler(makeErrorEvent("child", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await handler(makeErrorEvent("child", { status: 429, retryAfter: 90 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "fallback-a" },
  }))
  assert.deepEqual(scheduler.pendingDelays(), [])
  assert.deepEqual(calls.map((call) => call.body.modelID), ["fallback-a", "fallback-b"])
})
```

Add separate concrete tests for:

```ts
test("session deletion cancels one child without affecting another", async () => {
  const { client, calls } = makeMockClient()
  const scheduler = new FakeScheduler()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, scheduler })
  for (const [sessionID, delay] of [["a", 90], ["b", 120]] as const) {
    await handler(makeCreatedEvent(sessionID, "parentID"))
    await handler(makeErrorEvent(sessionID, { status: 429, retryAfter: delay }, {
      agent: "orchestrator",
      model: { providerID: "hoo", modelID: "primary-model" },
    }))
    await handler(makeIdleEvent(sessionID))
  }
  await handler({ event: { type: "session.deleted", properties: { sessionID: "a" } } })
  assert.deepEqual(scheduler.pendingDelays(), [120_000])
  await scheduler.runNext()
  await flushEvents()
  assert.deepEqual(calls.map((call) => call.sessionID), ["b"])
})

test("non-429 cancels active dedicated timer and uses generic fallback", async () => {
  const { client, calls } = makeMockClient()
  const scheduler = new FakeScheduler()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, scheduler })
  await handler(makeCreatedEvent("child", "parentID"))
  await handler(makeErrorEvent("child", { status: 429, retryAfter: 90 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await handler(makeErrorEvent("child", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.deepEqual(scheduler.pendingDelays(), [])
  assert.deepEqual(calls.map((call) => call.body.modelID), ["fallback-a"])
})

test("observe-only and single-model exhaustion do not loop", async () => {
  const observed = makeMockClient()
  const observedScheduler = new FakeScheduler()
  const observedCfg = makeConfig({ dispatch: false })
  const observedHandler = createRuntimeFallbackEventHandler({
    getConfig: () => observedCfg,
    client: observed.client,
    scheduler: observedScheduler,
  })
  await observedHandler(makeCreatedEvent("observed", "parentID"))
  await observedHandler(makeErrorEvent("observed", { status: 429 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.deepEqual(observed.calls, [])
  assert.deepEqual(observedScheduler.pendingDelays(), [])

  const single = makeMockClient()
  const singleScheduler = new FakeScheduler()
  const singleCfg = OcmmConfigSchema.parse({
    agents: {
      orchestrator: {
        requirement: { fallbackChain: [{ providers: ["hoo"], model: "only" }] },
      },
    },
    runtimeFallback: { subagent429: { maxRetries: 1 } },
  })
  const singleHandler = createRuntimeFallbackEventHandler({
    getConfig: () => singleCfg,
    client: single.client,
    scheduler: singleScheduler,
  })
  await singleHandler(makeCreatedEvent("single", "parentID"))
  const singleError = () => makeErrorEvent("single", { status: 429, retryAfter: 900 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "only" },
  })
  await singleHandler(singleError())
  await singleHandler(makeIdleEvent("single"))
  await singleScheduler.runNext()
  await flushEvents()
  await singleHandler(singleError())
  assert.deepEqual(singleScheduler.pendingDelays(), [])
  assert.deepEqual(single.calls.map((call) => call.body.modelID), ["only"])
})
```

- [ ] **Step 5: Run event-handler test red**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/event-handler.test.ts
```

Expected: FAIL because lineage is untracked, barrier dependencies are absent, dedicated calls abort, active provider outcomes are skipped by the in-flight guard, active target is unavailable, generic fallback is duplicated inline, and switch dispatch commits too early.

- [ ] **Step 6: Add lineage, target, and dependency helpers**

Add:

```ts
type ModelIdentity = { providerID: string; modelID: string }

function resolveParentSessionID(props: unknown): string | null {
  if (!isRecord(props)) return null
  for (const key of ["parentID", "parentId", "parentSessionID", "parentSessionId"] as const) {
    const value = props[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return null
}

function parseModelIdentity(value: string | null | undefined): ModelIdentity | null {
  if (!value) return null
  const slash = value.indexOf("/")
  if (slash <= 0 || slash === value.length - 1) return null
  return { providerID: value.slice(0, slash), modelID: value.slice(slash + 1) }
}

function resolveRetryTarget(
  requirement: ModelRequirement,
  identity: ModelIdentity,
): Subagent429Target {
  const matched = requirement.fallbackChain.find((entry) =>
    entryExactlyMatchesModel(entry, identity.providerID, identity.modelID),
  ) ?? matchRequirementSuccessor(requirement, identity.providerID, identity.modelID)
    ?? requirement.fallbackChain.find((entry) =>
      entryMatchesModel(entry, identity.providerID, identity.modelID),
    )
  const template = matched ?? { providers: [identity.providerID], model: identity.modelID }
  return {
    ...identity,
    entry: {
      ...template,
      providers: [identity.providerID],
      model: identity.modelID,
      ...(template.variant === undefined && requirement.variant !== undefined
        ? { variant: requirement.variant }
        : {}),
    },
  }
}
```

Replace `parseRegisteredModel()` with `parseModelIdentity()` and update its registered-agent-model caller.

Import `createSubagent429Controller`, `Subagent429Scheduler`, and `Subagent429Target` from `./subagent-429-controller.ts`, and add `ModelRequirement` to the existing type imports from `../shared/types.ts`.

Extend dependencies:

```ts
export type RuntimeFallbackDeps = {
  getConfig: () => OcmmConfig
  client?: OcmmClient
  directory?: string
  idleState?: IdleContinuationState
  clearSessionIntent?: (sessionID: string) => void
  registeredAgentModels?: ReadonlyMap<string, string>
  scheduler?: Subagent429Scheduler
  clock?: () => number
  random?: () => number
}
```

- [ ] **Step 7: Create one controller with no-abort dedicated dispatch**

Add this complete helper inside `createRuntimeFallbackEventHandler()` after `sessionStates` and before the controller. It is the only generic fallback implementation used by ordinary errors and deferred handoffs:

```ts
const clock = deps.clock ?? Date.now

type GenericFallbackInput = {
  cfg: OcmmConfig
  sessionID: string
  agent?: string
  classification: ErrorClassification
  requirement: ModelRequirement
  state: FallbackState
  failedTarget: Subagent429Target
}

const runGenericFallback = async (input: GenericFallbackInput): Promise<void> => {
  if (!input.classification.retryable) return
  if (input.requirement.fallbackChain.length <= 1) {
    log.info(`no fallback chain configured for agent=${input.agent ?? "<none>"}; skipping`)
    return
  }
  const failedKey = modelKey(input.failedTarget.providerID, input.failedTarget.modelID)
  markModelFailed(input.state, failedKey, clock())
  const peek = peekNextFallback(
    input.state,
    input.requirement,
    failedKey,
    input.cfg.runtimeFallback.maxAttempts,
    input.cfg.runtimeFallback.cooldownSeconds,
    clock(),
  )
  if (!peek.ok) {
    log.warn(`fallback exhausted: ${peek.reason} (session=${input.sessionID.slice(0, 16)}…)`)
    return
  }
  log.info(
    `fallback attempt ${peek.nextAttempts}/${input.cfg.runtimeFallback.maxAttempts}: ` +
      `model=${peek.entry.providers[0] ?? ""}/${peek.entry.model}`,
  )
  if (!input.cfg.runtimeFallback.dispatch) {
    log.info(`dispatch disabled; observe-only`)
    return
  }
  if (!deps.client) {
    log.warn(`no client available; cannot dispatch (observe-only)`)
    return
  }
  const dispatched = await dispatchFallbackRetry({
    client: deps.client,
    sessionID: input.sessionID,
    ...(deps.directory !== undefined ? { directory: deps.directory } : {}),
    ...(input.agent !== undefined ? { agent: input.agent } : {}),
    newEntry: peek.entry,
    reason: input.classification.reason,
  })
  if (dispatched) commitFallback(input.state, peek.entry, peek.index)
}
```

Immediately after that helper, create the controller:

```ts
const subagent429 = createSubagent429Controller({
  ...(deps.scheduler !== undefined ? { scheduler: deps.scheduler } : {}),
  clock,
  ...(deps.random !== undefined ? { random: deps.random } : {}),
  ...(deps.client !== undefined ? {
    dispatchRetry: ({ sessionID, agent, target, reason }) => dispatchFallbackRetry({
      client: deps.client!,
      sessionID,
      ...(deps.directory !== undefined ? { directory: deps.directory } : {}),
      ...(agent !== undefined ? { agent } : {}),
      newEntry: target.entry,
      reason,
      abortBeforeDispatch: false,
    }),
  } : {}),
  logger: log,
})
```

The Task 4 `PreparedDispatch.agent` field keeps same-model and switched prompts on the original agent while both use no-abort dispatch.

- [ ] **Step 8: Route lifecycle and in-flight errors**

Use:

```ts
if (eventType === "session.created") {
  if (sessionID) {
    sessionStates.delete(sessionID)
    subagent429.onSessionCreated(sessionID, resolveParentSessionID(props) !== null)
  }
  return
}

if (eventType === "session.deleted") {
  if (sessionID) {
    subagent429.onDeleted(sessionID)
    (deps.clearSessionIntent ?? defaultClearSessionIntent)(sessionID)
    sessionStates.delete(sessionID)
    if (deps.idleState) clearSession(deps.idleState, sessionID)
  }
  return
}

if (eventType === "session.idle") {
  if (sessionID) {
    const dedicatedIdle = subagent429.onIdle(sessionID)
    (deps.clearSessionIntent ?? defaultClearSessionIntent)(sessionID)
    if (!dedicatedIdle.suppressIdleContinuation) {
      await handleIdleContinuation(deps, sessionID)
    }
  }
  return
}
```

Delete the old pre-classification `isDispatchInFlight()` return. Step 9 replaces it with outcome-aware routing after classification and fallback-context resolution.

- [ ] **Step 9: Resolve context and route the first provider outcome**

After abort filtering, classify and resolve the agent requirement before applying the in-flight guard:

```ts
const classification = classifyError(error, cfg.runtimeFallback, clock())
const dispatchInFlight = isDispatchInFlight(sessionID)
const isDedicated429 = classification.retryable && classification.statusCode === 429
const agent = resolveAgent(props)
const effective = agent
  ? resolveEffectiveRequirement({
      agentName: agent,
      agentsConfig: cfg.agents,
      categoriesConfig: cfg.categories,
    })
  : null
const requirement = effective?.requirement ?? null
if (!requirement || requirement.fallbackChain.length === 0) {
  const outcome = subagent429.onOtherError({
    sessionID,
    runGenericFallback: async () => {
      log.info(`generic handoff has no fallback context for agent=${agent ?? "<none>"}`)
    },
  })
  if (outcome.handled || dispatchInFlight) return
  log.info(`no fallback chain configured for agent=${agent ?? "<none>"}; skipping`)
  return
}
```

Move `FallbackState` initialization before the `fallbackChain.length <= 1` guard using this complete block:

```ts
const eventModel = resolveEventModel(props)
let state = sessionStates.get(sessionID)
if (!state) {
  const head = requirement.fallbackChain[0]
  const chainHeadModel = head
    ? { providerID: head.providers[0] ?? "", modelID: head.model }
    : null
  const registeredModel = agent
    ? parseModelIdentity(deps.registeredAgentModels?.get(agent))
    : null
  const initialModel = eventModel ?? registeredModel ?? chainHeadModel
  if (!initialModel) {
    subagent429.onOtherError({
      sessionID,
      runGenericFallback: async () => {
        log.info(`generic handoff could not determine initial model for agent=${agent ?? "<none>"}`)
      },
    })
    return
  }
  const initialKey = modelKey(initialModel.providerID, initialModel.modelID)
  state = createFallbackState(initialKey)
  state.activeModel = initialKey
  state.fallbackIndex = requirement.fallbackChain.findIndex((entry) =>
    entryExactlyMatchesModel(entry, initialModel.providerID, initialModel.modelID),
  )
  if (state.fallbackIndex < 0 && !matchRequirementSuccessor(
    requirement,
    initialModel.providerID,
    initialModel.modelID,
  )) {
    state.fallbackIndex = requirement.fallbackChain.findIndex((entry) =>
      entryMatchesModel(entry, initialModel.providerID, initialModel.modelID),
    )
  }
  sessionStates.set(sessionID, state)
}

let justFailedKey: string | null = null
if (eventModel) {
  justFailedKey = modelKey(eventModel.providerID, eventModel.modelID)
} else if (state.activeModel) {
  justFailedKey = state.activeModel
} else if (requirement.fallbackChain[0]) {
  const primary: FallbackEntry = requirement.fallbackChain[0]
  justFailedKey = modelKey(primary.providers[0] ?? "", primary.model)
}
```

Then resolve the actual target. The widened `parseModelIdentity(string | null | undefined)` signature makes the nullable final expression strict-TypeScript-safe:

```ts
const activeDispatchTarget = subagent429.getActiveDispatchTarget(sessionID)
const activeIdentity = eventModel
  ?? (activeDispatchTarget
    ? { providerID: activeDispatchTarget.providerID, modelID: activeDispatchTarget.modelID }
    : null)
  ?? parseModelIdentity(state.activeModel)
  ?? parseModelIdentity(justFailedKey)
if (!activeIdentity) {
  subagent429.onOtherError({
    sessionID,
    runGenericFallback: async () => {
      log.info(`generic handoff could not resolve active model for session=${sessionID}`)
    },
  })
  return
}
const retryTarget = eventModel
  ? resolveRetryTarget(requirement, eventModel)
  : activeDispatchTarget ?? resolveRetryTarget(requirement, activeIdentity)
```

Create one closure that captures the current classification, requirement, `FallbackState`, config, and agent, while accepting the actual active dispatch target from the controller:

```ts
const runDeferredGenericFallback = (activeTarget: Subagent429Target): Promise<void> =>
  runGenericFallback({
    cfg,
    sessionID,
    ...(agent !== undefined ? { agent } : {}),
    classification,
    requirement,
    state,
    failedTarget: activeTarget,
  })
```

Route explicit 429 and other errors through first-outcome ownership:

```ts
if (isDedicated429) {
  const decision = subagent429.on429({
    sessionID,
    ...(agent !== undefined ? { agent } : {}),
    target: retryTarget,
    classification: {
      reason: classification.reason,
      ...(classification.recoveryDelayMs !== undefined
        ? { recoveryDelayMs: classification.recoveryDelayMs }
        : {}),
    },
    runtimeConfig: cfg.runtimeFallback,
    prepareSwitch: (failedTarget, isCandidateBlocked) => {
      const failedKey = modelKey(failedTarget.providerID, failedTarget.modelID)
      markModelFailed(state, failedKey, clock())
      const peek = peekNextFallback(
        state,
        requirement,
        failedKey,
        cfg.runtimeFallback.maxAttempts,
        cfg.runtimeFallback.cooldownSeconds,
        clock(),
        isCandidateBlocked,
      )
      if (!peek.ok) return peek
      let committed = false
      return {
        ok: true,
        prepared: {
          target: resolveRetryTarget(requirement, {
            providerID: peek.entry.providers[0] ?? "",
            modelID: peek.entry.model,
          }),
          attempt: peek.nextAttempts,
          commit() {
            if (committed) return
            committed = true
            commitFallback(state, peek.entry, peek.index)
          },
        },
      }
    },
  })
  if (decision.handled) return
} else {
  const outcome = subagent429.onOtherError({
    sessionID,
    runGenericFallback: runDeferredGenericFallback,
  })
  if (outcome.handled) return
}
if (dispatchInFlight) return
await runGenericFallback({
  cfg,
  sessionID,
  ...(agent !== undefined ? { agent } : {}),
  classification,
  requirement,
  state,
  failedTarget: retryTarget,
})
return
```

Delete the old duplicated generic fallback block after this return. Both ordinary errors and queued non-429 handoffs now use `runGenericFallback()`, whose dispatcher call omits `abortBeforeDispatch` and therefore preserves default abort behavior.

- [ ] **Step 10: Pass real-handler and all runtime-fallback tests**

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="real handler|queued|success idle|non-429|generic handoff|scope filtering|fresh fallback" src/runtime-fallback/event-handler.test.ts
node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/error-classifier.test.ts src/runtime-fallback/fallback-state.test.ts src/runtime-fallback/dispatcher.test.ts src/runtime-fallback/subagent-429-controller.test.ts src/runtime-fallback/event-handler.test.ts
pnpm run typecheck
```

Expected: targeted event-order tests pass without real waiting; all runtime fallback tests pass; typecheck exits 0.

- [ ] **Step 11: Report and integrate**

The subagent reports two changed files, targeted/full runtime evidence, and suggested message `feat: integrate event-owned subagent 429 fallback`. It performs no Git writes. The orchestrator reruns checks and may create that atomic commit; it does not push or tag.

---

### Task 6: Document Configuration and Event-Ownership Semantics

**Files:**
- Modify: `README.md:284-301,579-600`
- Modify: `docs/architecture.md:103-139`
- Modify: `examples/ocmm.example.jsonc:65-83,90-100`

**Interfaces:**
- Consumes: verified schema and runtime behavior from Tasks 1-5.
- Produces: user-facing defaults, retry/switch accounting, no-abort ownership, and barrier/settlement documentation.

- [ ] **Step 1: Establish missing documentation evidence**

```powershell
rg -n "subagent429|errorIdleObserved|abortBeforeDispatch|QueuedOutcome" README.md docs/architecture.md examples/ocmm.example.jsonc
```

Expected before edits: no feature documentation in these files.

- [ ] **Step 2: Update README examples and behavior**

Add this object to both runtime fallback examples:

```jsonc
"subagent429": {
  "enabled": true,
  "maxRetries": 5,
  "providerScopes": {
    "anthropic": "provider",
    "openai": "model"
  }
}
```

Document all of these statements:

1. Only a newly created child with one of the four supported parent fields can activate the dedicated flow.
2. Only an explicit classified 429 activates it; regex-only rate-limit text remains generic.
3. Every handled 429 waits for both its delay timer and its following idle before the next dedicated dispatch.
4. Dedicated retries/switches skip pre-abort; generic fallback still aborts best-effort.
5. Hints over ten minutes probe with a zero-delay timer, hints at or below ten minutes wait in full, and no-hint retries use capped equal jitter.
6. `maxRetries` defaults to five; zero prepares a switch; each switched model receives a fresh budget.
7. `maxAttempts` counts committed model switches only.
8. Model scope is the default; provider scope blocks all entries dispatched through that provider within the child session.
9. The first queued provider outcome outranks idle at dispatch settlement. Queued 429 continues the barrier flow; queued non-429 performs one post-settlement generic handoff from the active target. False plus either queued outcome proves the request ran, while bare false stops.
10. `dispatch: false` remains observe-only.

Correct “last user message” to “latest contiguous user-message block.”

- [ ] **Step 3: Update architecture flow and ownership**

Use this event flow:

```text
session.error(429) -> prepare retry/switch gate
timer -> delayReady
error-owned session.idle -> errorIdleObserved
both true -> no-abort dedicated dispatch generation
  first provider outcome -> Queued429 | QueuedOtherError
  idle after Queued429 -> Queued429.errorIdleObserved
  idle without queue -> ActiveDispatch.idleObserved
dispatch settlement -> QueuedOutcome > idleObserved > awaiting-result
Queued429 -> account/commit once -> process queued target serially
QueuedOtherError -> account/commit once -> stop dedicated -> generic handoff once
session.deleted/non-429 -> invalidate lifecycle/timer/dispatch generations
```

Document ownership:

```text
FallbackState: fallbackIndex, committed model-switch attempts, activeModel,
generic failed-model cooldowns

Subagent429 controller: initial marker, scope retry counts, blocked deadlines,
pending delay/idle gate, ActiveDispatch.idleObserved, QueuedOutcome union,
Queued429.errorIdleObserved, queued generic-handoff callback,
one timer, lifecycle/timer/dispatch generations
```

State explicitly that idle never clears `FallbackState`.

- [ ] **Step 4: Update the JSONC example and profile partial**

Use:

```jsonc
"runtimeFallback": {
  "enabled": true,
  "dispatch": true,
  "maxAttempts": 3,
  "cooldownSeconds": 60,
  "retryOnStatusCodes": [429, 500, 502, 503, 504],
  "retryOnPatterns": [
    "rate limit",
    "overloaded",
    "temporarily unavailable",
    "service unavailable",
    "internal server error",
    "gateway timeout",
    "bad gateway",
    "capacity",
    "try again"
  ],
  "subagent429": {
    "enabled": true,
    "maxRetries": 5,
    "providerScopes": {
      "anthropic": "provider",
      "openai": "model"
    }
  }
}
```

Change the `gpu` profile partial to:

```jsonc
"runtimeFallback": {
  "maxAttempts": 5,
  "subagent429": { "maxRetries": 2 }
}
```

- [ ] **Step 5: Verify documentation**

```powershell
rg -n "subagent429|maxRetries|providerScopes|error-owned|no-abort|queued provider|generic handoff|model switches|observe-only" README.md docs/architecture.md examples/ocmm.example.jsonc
```

Expected: all three files contain `subagent429`; README and architecture contain barrier, no-abort, queued precedence, scope, retry, switch, and observe-only semantics.

- [ ] **Step 6: Report and integrate**

The subagent reports three files, grep evidence, and suggested message `docs: document subagent 429 event ownership`. It performs no Git writes. The orchestrator reruns checks and may create that atomic commit; it does not push or tag.

---

### Task 7: Run Full Verification and Independent Concurrency Review

**Files:**
- Verify: every file in the File Map.
- Modify after a finding only in the owning task's files, with a new failing regression test first.

**Interfaces:**
- Consumes: all implementation, generated schema, tests, and documentation.
- Produces: real-surface evidence, deterministic generation evidence, repository quality gates, and an independent review verdict.

- [ ] **Step 1: Run the controlled real event surface**

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="real handler|single success idle|false plus queued|model-less error|non-429|generic handoff|scope filtering|fresh fallback" src/runtime-fallback/event-handler.test.ts
```

Expected: targeted tests pass with fake scheduling and controlled prompt promises. Evidence includes zero dedicated aborts, one pre-resolution success idle, no second success idle, queued-429 order combinations, first-provider-outcome precedence, post-settlement non-429 handoff, actual fallback target resolution, and bare-false behavior.

- [ ] **Step 2: Verify schema generation is deterministic**

```powershell
$before = (Get-FileHash -Algorithm SHA256 "schema.json").Hash; pnpm run gen-schema; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; $after = (Get-FileHash -Algorithm SHA256 "schema.json").Hash; if ($before -ne $after) { throw "schema.json changed during regeneration" }; "schema.json regeneration is deterministic"
```

Expected: prints `schema.json regeneration is deterministic`.

- [ ] **Step 3: Run required repository gates**

```powershell
pnpm run typecheck
pnpm test
pnpm run build
```

Expected:
- typecheck exits 0 with no diagnostics;
- all TypeScript and Rust tests pass;
- TypeScript and native LSP builds complete successfully.

- [ ] **Step 4: Perform independent review**

Use the requesting-code-review workflow with a fresh reviewer. Require explicit findings on:

- each handled 429's two-signal barrier and exactly-once start in both arrival orders;
- dedicated no-abort versus generic default abort;
- `ActiveDispatch.idleObserved`, `Queued429.errorIdleObserved`, and the `QueuedOutcome` first-wins union;
- settlement precedence and the single pre-resolution success idle path;
- retry and switch `true/false × queued-idle-settle/queued-settle-idle` accounting exactly once;
- switch prepare without index/attempt mutation, commit once on true/queued provider outcome, no commit on bare false;
- active non-429 true/false settlement, exactly-once generic handoff after in-flight release, waiting-stage immediate generic fallback, and stale handoff cancellation;
- active fallback target use when an in-flight event omits model data;
- stale lifecycle/timer/dispatch generation completion after deletion, non-429, and recreation;
- five-probe, ten-minute, jitter cap, zero budget, fresh-model budget, scope, isolation, observe-only, no-candidate, and generic regressions;
- logs contain identifiers/ordinals/delays/scopes/reasons but no provider payload.

Expected: no unresolved correctness finding. Any correction returns to its owning task, begins with a failing test, reruns focused checks, and requires a fresh review.

- [ ] **Step 5: Report final evidence**

The subagent reports the complete file list, targeted event result, schema hash result, three gate results, and review verdict. It performs no Git writes. The orchestrator confirms Tasks 1-6 are atomically committed and may commit a Task 7 regression correction if one was required; it does not push or tag.

---

## Dependency and Review Order

1. Task 1 defines controller configuration and generated schema.
2. Tasks 2 and 3 are independent after Task 1.
3. Task 4 depends on Tasks 1-3 and owns both no-abort dispatcher support and the controller protocol.
4. Task 5 depends on the complete Task 4 interfaces and integrates real events with prepare/dispatch/commit.
5. Task 6 documents only behavior proven by Tasks 1-5.
6. Task 7 follows all implementation and documentation commits; any edit invalidates the previous review verdict.

Each task is one review boundary. Subagents never stage or commit. The authorized orchestrator may create one atomic semantic commit after each focused integration check. No step pushes or tags.

## Spec-to-Test Coverage (13 Groups)

| Requirement | Evidence |
|---|---|
| 1. Initial child 429 retries same model | Task 4 barrier test; Task 5 real handler same-model/no-abort test |
| 2. Five long probes before switch | Task 4 `five long probes precede the switch` |
| 3. Long hint falling to ten minutes waits | Task 4 ten-minute transition test |
| 4. Missing hint uses capped equal jitter | Task 4 eight-delay deterministic sequence |
| 5. `maxRetries: 0` falls back | Task 4 switch-gate tests; Task 5 model-less switch test |
| 6. Fresh budget per model; switch consumes `maxAttempts` | Task 5 fresh-fallback sequence and idempotent commit closure |
| 7. Model/provider scope filtering | Tasks 4 and 5 scope tests |
| 8. Session isolation | Task 4 recreation/isolation and Task 5 two-session deletion tests |
| 9. Generic regressions | Task 5 root/non-429/idle/regex/disabled data-driven tests plus existing 503 tests |
| 10. Barrier order, no-abort, single success idle, first queued outcome, cleanup | Task 4 barrier/idle/first-wins/stale tests; Task 5 controlled-prompt tests |
| 11. Retry/switch queued-order accounting and non-429 handoff | Task 4 eight queued-429 combinations plus true/false other-outcome and stale-handoff tests; Task 5 real true/false non-429, switch-target, waiting-stage, deletion, and queued-429 tests |
| 12. Recovery extraction | Task 2 bounded fields, headers, dates, messages, invalid, and longest tests |
| 13. Config parsing | Task 1 defaults, zero, invalid, strictness, profile, generated surfaces |

## Writing-Plans Self-Review

- **Spec coverage:** All 13 latest verification groups map to concrete tests and exact commands; the old 12-group mapping is removed.
- **Placeholder scan:** The user-specified forbidden planning phrases have zero matches. Every behavior-changing step includes real TypeScript, exact fixtures/assertions, a command, and expected evidence.
- **Type consistency:** `Subagent429Target`, `Subagent429ErrorInput`, `Subagent429PreparedSwitch`, `Subagent429PrepareResult`, `Subagent429OtherErrorInput`, `Queued429`, `QueuedOtherError`, `QueuedOutcome`, `PendingGate`, `ActiveDispatch`, controller methods, `runGenericFallback`, and dispatcher option use one spelling and one meaning throughout Tasks 4-7.
- **Concurrency consistency:** Every handled 429 installs a two-signal gate; dispatch is no-abort; the first provider outcome wins; true or queued outcome accounts once; queued 429 target/barrier propagate; queued other error hands off once after settlement; stale generations cannot mutate replacement state or invoke stale handoff.
- **Version-control consistency:** Subagents report only; the authorized orchestrator may make atomic semantic commits after checks and never pushes or tags.
- **Residual risk:** OpenCode supplies no attempt ID. The controller therefore relies on observed event order plus its own dispatch generations; the controlled tests exercise the verified error-before-idle and idle-before-promise-settlement orders.
