# delegate-core & Background Agent System

> **Source**: `omo/packages/delegate-core/` (pure functions), `omo/packages/omo-opencode/src/features/background-agent/` (engine)
> **Status**: Not migrated. Port delegate-core (380 LOC) + ConcurrencyManager (175 LOC) — OPTIONAL (Phase 7). BackgroundManager: SKIP (OpenCode built-in).
> **Principle**: omo-own — reimplement (delegate-core is pure functions, easy to port; BackgroundManager is tightly coupled to OpenCode session API)
> **Note**: `omo/` refers to the gitignored reference implementation at `C:\Users\hugefiver\source\ocmm\omo\` (omo monorepo, npm `oh-my-opencode`). Paths in this doc are relative to that location.
> **Important**: OpenCode already provides `task`, `background_output`, `background_cancel` as built-in tools. The design spec marks BackgroundManager as **Skip** and Phase 7 (task enhancement) as **optional**. This KB doc is reference material; only port delegate-core + ConcurrencyManager if Phase 7 is pursued.

## Critical Distinction

**`delegate-core` is NOT the background engine.** It's a small (~380 LOC, 3 files) purely functional library for model selection + error detection used by the `task()` tool. The actual orchestration engine is `BackgroundManager` (~5500 LOC, 45 files) in `omo-opencode/src/features/background-agent/`.

## delegate-core (`omo/packages/delegate-core/`)

**Package**: `@oh-my-opencode/delegate-core` (v0.1.0, private, harness-neutral)
**Deps**: `@oh-my-opencode/model-core` (fuzzyMatchModel, normalizeModel, parseModelString, parseVariantFromModelID, transformModelForProvider)

### Public API (3 files)

| Export | File | Purpose |
|---|---|---|
| `resolveModelForDelegateTask(input, deps)` | `model-selection.ts` | 7-step model resolution for `task` tool |
| `DelegateFallbackEntry` | `model-selection.ts` | `{ providers: string[], model: string, variant?: string }` |
| `DelegateModelResolutionInput` | `model-selection.ts` | `{ userModel?, userFallbackModels?, categoryDefaultModel?, isUserConfiguredCategoryModel?, fallbackChain?, availableModels, systemDefaultModel? }` |
| `DelegateModelResolutionResult` | `model-selection.ts` | `{ model, variant?, fallbackEntry?, matchedFallback? } \| { skipped: true } \| undefined` |
| `DelegateModelResolutionDeps` | `model-selection.ts` | `{ connectedProviders, hasProviderModelsCache, hasConnectedProvidersCache, log? }` |
| `detectDelegateTaskError(output)` | `retry-patterns.ts` | Pattern-matches 9 error types from task() output |
| `DELEGATE_TASK_ERROR_PATTERNS` | `retry-patterns.ts` | 9 entries: missing_run_in_background, missing_load_skills, mutual_exclusion, missing_category_or_agent, unknown_category, empty_agent, unknown_agent, primary_agent, unknown_skills |
| `buildRetryGuidance(errorInfo)` | `retry-guidance.ts` | Builds retry instruction with fix hint + available options |

### 7-Step Model Resolution (purely functional)

```
1. userModel override → promote first reachable userFallbackModels if unreachable
2. skip sentinel {skipped: true} if availableModels AND connectedProviders caches both empty
3. category default model (user-set → returned as-is; else fuzzy-matched against availableModels)
4. user fallback_models[] array
5. hardcoded fallbackChain[] (per-entry providers, exact-then-fuzzy match)
6. system default model
7. undefined
```

**Cold-cache sentinel**: When `availableModels.size === 0` AND `connectedProviders === null` AND both caches cold → returns `{ skipped: true }`. Caller defers model resolution until cache populates.

### Test Coverage (2 files, ~70 LOC)

| File | Scenarios |
|---|---|
| `model-selection.test.ts` (54 LOC) | Cold cache → skipped sentinel; user primary unreachable → promotes fallback with variant; fallback chain with connected provider cache |
| `retry-patterns.test.ts` (15 LOC) | Unknown category detected → retry guidance preserves available options |

## Background Agent Engine (`omo-opencode/src/features/background-agent/`)

### BackgroundManager (3188 LOC, `manager.ts`)

**Task lifecycle**: `pending → [ConcurrencyManager queue] → running → [polling loop] → completed | error | cancelled | interrupt`

### Launch Flow

1. `reserveSubagentSpawn()` — checks subagent depth limit, registers root descendant
2. Creates `BackgroundTask` with `status: "pending"`, ID `bg_{8-char-uuid}`
3. Records first `BackgroundTaskAttempt` via `startAttempt()`
4. Adds to task map, task history, pending-by-parent tracking
5. Pushes to `queuesByKey[key]` (FIFO per concurrency key)
6. Fires `processKey(key)` (fire-and-forget)
7. Returns task immediately — caller gets `{ id, status: "pending", ... }`

### BackgroundTask Type (key fields)

```typescript
interface BackgroundTask {
  id: string                    // "bg_<uuid8>"
  sessionId?: string            // OpenCode session ID (set when running)
  rootSessionId?: string        // Root ancestor session for depth tracking
  parentSessionId: string       // Parent OpenCode session
  parentMessageId: string
  teamRunId?: string
  description: string
  prompt: string
  agent: string                 // Agent name (explore, oracle, etc.)
  spawnDepth?: number
  status: BackgroundTaskStatus  // pending | running | completed | error | cancelled | interrupt
  progress?: TaskProgress       // { toolCalls, lastTool?, toolCallWindow?, lastUpdate }
  model?: DelegatedModelConfig  // { providerID, modelID, variant? }
  fallbackChain?: FallbackEntry[]
  attemptCount?: number
  attempts?: BackgroundTaskAttempt[]
  category?: string
  skillContent?: string
}
```

## Concurrency Model

**File**: `concurrency.ts` (175 LOC, zero deps)

### Key Format & Priority

| Config | Example | Key | Limit |
|---|---|---|---|
| `modelConcurrency` | `{ "anthropic/claude-sonnet-4-6": 5 }` | Exact model string | 5 |
| `providerConcurrency` | `{ "anthropic": 3 }` | Provider name only | 3 |
| `defaultConcurrency` | `2` | Falls through | 2 |
| (none) | — | Model string | **5** (hard default) |

`0` means `Infinity` (unlimited).

### FIFO Queue Implementation

```typescript
class ConcurrencyManager {
  private counts: Map<string, number> = new Map()       // active per key
  private queues: Map<string, QueueEntry[]> = new Map()  // FIFO waiters per key

  async acquire(model: string, taskId?: string): Promise<void>
  // If count < limit: increment count, return immediately
  // Else: push Promise to queue, await until release() resolves it

  release(model: string): void
  // Try to hand off slot to next waiter in queue
  // If no waiters: decrement count

  cancelWaiter(model: string, taskId: string): boolean
  cancelWaiters(model: string): void
  clear(): void
}
```

**Queue entry**: `{ taskId?, resolve, rawReject, settled }` — settled flag prevents double-resolution.

**Slot handoff**: On `release()`, if a waiter exists in queue, slot transfers directly (count stays same). Only decrements count when no waiters remain.

**Independent models**: Different models use separate keys and queues — no interference.

## Circuit Breaker (loop-detector.ts, 102 LOC)

Not a traditional circuit breaker (no open/half-open/closed states). Detects **consecutive same-tool+same-input calls**.

### Config

```typescript
interface CircuitBreakerSettings {
  enabled: boolean           // default: true
  maxToolCalls: number       // default: 4000 (total tool calls per task)
  consecutiveThreshold: number // default: 20 (same tool+input consecutively)
}
```

### Detection

- `recordToolCall(window, toolName, settings, toolInput)` → creates/updates `ToolCallWindow`
- Signature: `"toolName::<sorted-JSON-input>"` (or `"toolName::__unknown-input__"` if no input)
- Same signature consecutively: increments count
- `detectRepetitiveToolUse(window)` → `{ triggered: true, toolName, repeatedCount }` when `consecutiveCount >= threshold`

**Events observed**: `message.part.updated` with `type: "tool"` from background session's SSE stream.

### Test Coverage (manager-circuit-breaker.test.ts, 490 lines)

- 20 consecutive `read` events with no state.input → task keeps running (flat format)
- Diverse tool calls → no trigger even at threshold
- Same tool+input at threshold → task enters error state
- Same tool+input slightly below threshold → task keeps running
- Different input keys (same tool) → no trigger
- `read` tool input `{ path: "x" }` × threshold + once different → no trigger

## Task Lifecycle Details

### Pending → Running

1. `BackgroundManager.launch()` creates task with `status: "pending"`, pushes to queue
2. `processKey()` dequeues, calls `concurrencyManager.acquire(key)` — may block
3. Acquired → `startTask(item, ctx)` called (spawner.ts)
4. `startTask()`:
   - Creates OpenCode child session via `client.session.create({ body: { parentID }, query: { directory } })`
   - Sets `task.status = "running"`, `task.sessionId = sessionID`, `task.startedAt = new Date()`
   - Applies session prompt params, builds prompt body with skill content
   - Calls `client.session.prompt(sessionID, body)` fire-and-forget (promise caught for error handling)
   - Optionally fires tmux callback for TUI visualization

### Completion Detection (two signals, BOTH required)

1. **Session idle event** — OpenCode `session.idle` event via SSE
2. **Stability detection** — message count unchanged for 10s (3+ consecutive polls at 3s interval)

Both must agree before task transitions to `"completed"`.

### Notification Flow

```
task completed → notifyParentSession(task)
  → buildBackgroundTaskNotificationText() (template)
  → if parent session active: queuePendingParentWake() with debounce
  → if parent session idle: queuePendingParentWake() with short debounce
  → ParentWakeNotifier.flush() → dispatchInternalPrompt() → injects system message into parent session
```

### Error Handling

- `error-classifier.ts` maps provider errors → `BackgroundTaskError` categories
- `fallback-retry-handler.ts` coordinates retries with runtime-fallback system
- `attempt-lifecycle.ts` tracks retry attempts per task
- `subagent-spawn-limits.ts` enforces max subagent depth
- `abort-with-timeout.ts` force-aborts tasks past `syncPollTimeoutMs`

## IPC / Transport

**There is no custom IPC.** Background agent communicates with parent entirely through OpenCode's session API:

- **Task creation**: `client.session.create({ body: { parentID }, ... })` — creates child session
- **Prompt injection**: `client.session.prompt(sessionID, promptBody)` — fire-and-forget for background, await for sync
- **Result collection**: Poll child session messages via `client.session.listMessages()` or `client.session.get()`
- **Parent notification**: `dispatchInternalPrompt()` injects system message into parent session via OpenCode's `session.prompt` API
- **No shared memory, no message passing, no filesystem IPC** — all communication through OpenCode's session abstraction

`background_output` tool queries `BackgroundManager.getTask(taskId)` which returns task's cached state (sessionId, status, result, etc.).

## Tool Registration

### `task` tool (createDelegateTask)

**File**: `omo/packages/omo-opencode/src/tools/delegate-task/tools.ts`

| Parameter | Type | Description |
|---|---|---|
| `prompt` | string (required) | Full detailed prompt |
| `description` | string (optional) | Auto-generated from prompt if omitted |
| `run_in_background` | boolean (optional) | Default false (sync). true = async |
| `category` | string (optional) | XOR with subagent_type |
| `subagent_type` | string (optional) | XOR with category |
| `load_skills` | string[] (optional) | Skills to inject |
| `task_id` | string (optional) | Continuation session id |
| `command` | string (optional) | Triggering command |

### `call_omo_agent` tool (createCallOmoAgent)

**File**: `omo/packages/omo-opencode/src/tools/call-omo-agent/tools.ts`

Narrower than `task`:

| Parameter | Type | Description |
|---|---|---|
| `subagent_type` | string (required) | Only `explore` or `librarian` |
| `prompt` | string (required) | Task prompt |
| `description` | string (optional) | Short description |
| `run_in_background` | boolean (required) | Must be explicitly set |
| `session_id` | string (optional) | Resume existing session (sync only) |

**Key differences from `task`**: No category system; no `load_skills`; fixed agent set (explore, librarian only); model resolved from agent's fallback chain, not category config.

### `background_output` / `background_cancel` tools

Legacy interface. `background_output(task_id, block?, full_session?, message_limit?, include_thinking?)` polls task state and fetches session messages.

## Config Fields

From `omo/packages/omo-opencode/src/config/schema/background-task.ts`:

```typescript
const BackgroundTaskConfigSchema = z.object({
  defaultConcurrency: z.number().min(1).optional(),         // default 5
  providerConcurrency: z.record(z.string(), z.number().min(0)).optional(),
  modelConcurrency: z.record(z.string(), z.number().min(0)).optional(),
  maxDepth: z.number().int().min(1).optional(),              // subagent spawn depth limit
  staleTimeoutMs: z.number().min(60000).optional(),         // default 180000 (3min)
  messageStalenessTimeoutMs: z.number().min(60000).optional(), // default 1800000 (30min)
  taskTtlMs: z.number().min(300000).optional(),             // default 1800000 (30min)
  sessionGoneTimeoutMs: z.number().min(10000).optional(),   // default 60000 (1min)
  taskCleanupDelayMs: z.number().min(60000).optional(),     // default 600000 (10min)
  syncPollTimeoutMs: z.number().min(60000).optional(),
  maxToolCalls: z.number().int().min(10).optional(),         // default 200
  circuitBreaker: CircuitBreakerConfigSchema.optional(),    // { enabled, maxToolCalls, consecutiveThreshold }
})
```

## External Dependencies

| Package | Dependencies |
|---|---|
| `delegate-core` | `@oh-my-opencode/model-core` (fuzzy matching, model normalization, variant parsing) |
| Background Agent (omo-opencode) | `@opencode-ai/plugin` (OpenCode plugin SDK — client.session API), `zod`, Node.js builtins |
| omo-opencode (overall) | 18 core packages + 3 MCP packages (all workspace-local); no runtime npm deps beyond `zod` and `@opencode-ai/plugin` |

## Test Coverage

### delegate-core (2 files, ~70 LOC)
| File | Scenarios |
|---|---|
| `model-selection.test.ts` (54 LOC) | Cold cache → skipped; user primary unreachable → promotes fallback; fallback chain with provider cache |
| `retry-patterns.test.ts` (15 LOC) | Unknown category detected → retry guidance preserves options |

### Background Agent (64 test files)
Key files:
- `manager.test.ts` — Launch, cancel, getTask, lifecycle transitions
- `manager.polling.test.ts` — 3s polling loop, completion detection
- `manager-circuit-breaker.test.ts` (490 LOC) — Consecutive tool call detection, threshold behavior
- `concurrency.test.ts` (522 LOC) — Limit priority, FIFO ordering, independent models, cancel/clear
- `concurrency-cancel-waiter.test.ts` — Canceling specific waiters
- `spawner.test.ts` — Session creation, prompt injection, fallback agent
- `loop-detector.test.ts` — Tool call signature, detection logic
- `fallback-retry-handler.test.ts` — Retry coordination
- `error-classifier.test.ts` — Error categorization
- `task-poller.test.ts` — Stale task detection, polling intervals
- `parent-wake-notifier.test.ts` — Parent notification injection
- `parent-wake-dedupe.test.ts` — Deduplication of parent wake calls
- `session-idle-event-handler.test.ts` — Idle event → completion signal
- `subagent-spawn-limits.test.ts` — Depth limit enforcement
- `subagent-failure-parent-isolation.test.ts` — Error isolation between parent and child
- `process-cleanup.test.ts` — Cleanup on process exit
- `compaction-aware-message-resolver.test.ts` — Result resolution across compaction

## Migration Decision Matrix

| Capability | delegate-core (port) | Background Agent (build) |
|---|---|---|
| What it provides | Model resolution + error detection for `task()` | Full background orchestration engine |
| LOC | ~380 (3 files) | ~5500 (45 files) |
| State | Pure functions, zero state | Full state machine (3188 LOC manager) |
| Concurrency | None | ConcurrencyManager (FIFO, per-key limits) |
| Circuit breaker | None | Loop detector (consecutive tool calls) |
| Task lifecycle | None | 6-state FSM with polling + event signals |
| IPC/Transport | None | OpenCode session API (child sessions) |
| Parent notification | None | ParentWakeNotifier (system message injection) |
| Retry handling | Error detection only | Full fallback retry with attempt tracking |
| Dependencies | model-core only | OpenCode plugin SDK, zod |
| Test coverage | 2 files, ~70 LOC | 64 test files |

### Recommendation for ocmm

**IMPORTANT — Design Spec Revision**: The design spec (Phase 7) marks BackgroundManager as **Skip** because OpenCode already provides `task`, `background_output`, `background_cancel` as built-in tools. Porting BackgroundManager is NOT recommended unless a clear gap is identified.

**Port `delegate-core`** (~380 LOC) — pure, harness-neutral. **OPTIONAL** — only if Phase 7 (task enhancement) is pursued.

**Port `ConcurrencyManager`** (~175 LOC) — standalone FIFO queue with per-key limits, no external deps. **OPTIONAL** — only if Phase 7 is pursued.

**Do NOT build `BackgroundManager`** — OpenCode's built-in `task` tool already provides background agent functionality. Building a 3188 LOC replacement would duplicate existing infrastructure.

The concurrency model (FIFO queue, per-key limits, slot handoff) is the most portable part — if Phase 7 is pursued, ConcurrencyManager can be imported directly.
