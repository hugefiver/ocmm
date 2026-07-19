# Oracle Priority, Review Variants, and Subagent Recovery Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy capability-ranked `oracle-high` behavior with canonical ordered Oracle slots and logical review tiers, add safe child-interruption correlation on top of the existing 429 controller, and synchronize OpenCode, Codex, prompts, skills, schema, and documentation.

**Architecture:** A context-sensitive name grammar in `src/review-agents/names.ts` distinguishes runtime tier names from legacy config migration, while a pure `expandReviewAgents()` phase materializes the one canonical profile set consumed by registration, routing, permissions, and Codex. Runtime recovery remains owned by the existing subagent 429 controller: one durable child-session record holds lineage/correlation and an optional retry substate, `message.part.updated` contributes evidence only, and a shared `createRuntimeFallbackRuntime()` exposes event and task-output adapters without a second retry state machine. Output-side correlation (the `tool.execute.after` notice adapter) resolves by lineage (child session ID plus parent session/part identity) plus an explicit real task ID from the adapter's hook input/output metadata, never by `callID` substitution.

**Tech Stack:** TypeScript 6 strict mode, Zod 4, Node 22+ `node:test`, OpenCode plugin hooks and HTTP server, PowerShell 7, pnpm generators, JSONC, Markdown, generated Codex TOML profiles.

**Global Constraints:**
- `oracle-high` currently means a supplemental high-intensity third reviewer with a Sol-lane/max default. That meaning is removed.
- `AgentEntry.variant` is a native model variant. The requested logical tiers are a separate concept and must not be added to the existing `Variant` type.
- Canonical Oracle slot names are `oracle`, `oracle-2nd`, `oracle-3rd`, `oracle-4th`, `oracle-5th`, `oracle-6th`, `oracle-7th`, `oracle-8th`, and `oracle-9th`.
- `oracle-second` is accepted as a configuration or runtime invocation alias for `oracle-2nd`, then canonicalized immediately. It is never retained as a separate entry and does not produce a duplicate Codex profile.
- The ordinal is model priority, highest first. It does not imply capability or reasoning effort.
- Merely configuring multiple slots never causes automatic fan-out.
- `normal` is represented by the unsuffixed slot name. Only explicitly configured `low`, `high`, and `max` tier overrides generate suffixed profiles.
- Reviewer names are valid only with ordinal 1; do not create `reviewer-2nd` through `reviewer-9th`.
- `plan-critic` remains a review-floor agent but is not part of the Oracle/Reviewer naming grammar.
- The object form of a review tier is strict and must contain at least one of `model` or `variant`; `normal` is not a `variants` key.
- A `variants` field on a non-Oracle/non-Reviewer agent is a configuration error rather than ignored data.
- A string tier override materializes its native variant across the cloned requirement and every cloned fallback entry so fallback dispatch preserves that tier.
- A model-only tier override replaces only the primary model/provider, retains the normal primary inference controls and effective native variant, preserves the remaining normal fallback chain, and does not mutate the source entry.
- Existing review-agent xhigh-equivalent floors still apply after tier resolution. Logical `low` never bypasses the review safety floor.
- Legacy config key `agents.oracle-high` migrates before schema validation to `agents.oracle-2nd` with a source-aware deprecation warning. Different spellings targeting the same canonical slot across active layers are errors; canonical-to-canonical overrides remain valid.
- Keep the existing strict-schema/tolerant-runtime boundary: `schema.json` and direct `OcmmConfigSchema` parsing reject malformed review declarations, while `loadConfig()` discards only schema-mismatched review fields or entries and preserves valid siblings/lower layers. Only ambiguous legacy/canonical migration collisions return defaults.
- Runtime `task(subagent_type="oracle-high")` means the first Oracle slot at logical high. `disabledAgents: ["oracle-high"]` disables only that generated tier.
- Disabling an unsuffixed review slot, including `agents.oracle.disabled: true`, `agents.oracle-2nd.disabled: true`, or the equivalent canonical later-slot/Reviewer entry, disables that slot and all generated tiers. Disabling a suffixed tier disables only that tier.
- `oracle-2nd` replaces the built-in `oracle-high`, retains reviewer prompt reuse, and has normal review semantics. Active guidance must not call later slots stronger, higher-capability, or more intense.
- Slots 3 through 9 are registered only when explicitly configured.
- The runtime fallback already owns `session.error`, `session.idle`, and `session.deleted`. Do not create a second retry state machine, fallback index, retry budget, scheduler, or synthetic parent prompt.
- `childSessionID` is the interruption-correlation primary key. Parent session plus part identity deduplicates task events; provider `callID` is retained as evidence but is never the sole identity. Output-side correlation (the `tool.execute.after` notice adapter) resolves by lineage (child session ID plus parent session/part identity) plus an explicit real task ID from the adapter's hook input or output metadata; it never substitutes `childSessionID` for `taskID` and never treats the hook input `callID` as a resumable task ID.
- `message.part.updated` records association/evidence only and never independently authorizes or dispatches a retry.
- The `tool.execute.after` adapter never dispatches. It may append one continuation notice only when an existing resumable child session ID is proven.
- Explicit user abort, permission denial, deleted child, unknown agent, ordinary empty output, malformed payload, and exhausted retry/fallback budgets do not trigger recovery.
- Disabling `subagent-interruption-recovery` gates only the new correlation/notice behavior; existing generic fallback and subagent 429 behavior remain unchanged.
- Do not assume OpenCode invokes `tool.execute.after` for failed calls. The event path is the provider-error source of record.
- Run an isolated live OpenCode XDG probe after the 429 prerequisite and before implementing interruption correlation. Sanitize captured payloads; do not persist credentials, prompts, or raw provider errors.
- When facts are clear, answer or proceed directly. Ask the user only when the choice changes the deliverable shape, required information cannot be found with available tools, or proceeding risks material rework.
- The orchestrator alone composes workflow agents. Planner, Reviewer/Oracle, Clarifier, and Plan Critic may perform only the bounded read-only lookup allowed by the approved role matrix and may not nest workflow judgments into one another.
- Changes under `prompts/v1/` or `skills/v1/` update `docs/v1-maintenance.md` in the same integration boundary. Changes under `prompts/omo/` update `docs/prompt-sync.md`.
- Any config-schema or hook-name change runs `pnpm run gen-schema` and includes `schema.json` in the same integration boundary.
- Any built-in agent, config registration, Codex generator, prompt, or v1 skill change runs `pnpm run gen:codex-plugin` and synchronizes `.agents/plugins/marketplace.json`, `.codex/agents`, and `plugins/deepwork`.
- Historical files `docs/superpowers/specs/2026-07-14-oracle-high-review-design.md` and `docs/superpowers/plans/2026-07-14-oracle-high-review.md` remain unchanged historical records.
- Use Windows PowerShell syntax for every command. Do not install software.
- Every command that runs `src/config/load.test.ts`, `src/config/profiles.test.ts`, `src/codex/plugin-generator.test.ts`, `pnpm test`, `pnpm run gen:codex-plugin`, or a live OpenCode probe must save, clear, and restore both `OCMM_PROFILE` and `OCMM_NO_PROFILE`; ambient profile selection is not test or generation input.
- Every dirty or untracked runtime-fallback prerequisite path reported by Task 1 is parallel work. Task 1 may inspect those paths but must not edit, overwrite, revert, stash, reset, or clean them; this plan may extend the controller/event architecture only after the existing 429 plan Tasks 1-5 are fully integrated and the hard gate passes.
- No task executes `git commit`, `git push`, `git tag`, or another Git write command. Every suggested commit remains advisory until the user gives separate explicit authorization.

## File Map

**Create:**
- `src/review-agents/names.ts` — runtime review-name grammar, canonical identities, reserved namespace checks, and ordered Oracle slot constants.
- `src/review-agents/names.test.ts` — complete canonical/alias/tier/ordinal grammar coverage.
- `src/config/review-agent-migration.ts` — context-specific pre-schema config-key migration with provenance, warnings, and active-layer collision detection.
- `src/config/review-agent-migration.test.ts` — base/project/profile migration, warning, shadowing, and conflict tests.
- `src/review-agents/expand.ts` — pure normal-slot and logical-tier expansion, inheritance, deep cloning, and disabled policy.
- `src/review-agents/expand.test.ts` — expansion, fallback preservation, non-mutation, priority ordering, and disable tests.
- `src/shared/opencode-events.ts` — pure decoding for current and legacy session lineage and parent task-part evidence.
- `src/shared/opencode-events.test.ts` — nested/flat payload and malformed-event tests, including the sanitized live fixture.
- `src/runtime-fallback/interruption-output-adapter.ts` — task transport-output notice adapter with no dispatch authority.
- `src/runtime-fallback/interruption-output-adapter.test.ts` — notice, deduplication, disabled-hook, abort/denial/unknown/empty exclusions.
- `src/runtime-fallback/fixtures/opencode-task-interruption.json` — sanitized event and task-output shapes captured by the isolated live probe.
- `docs/superpowers/evidence/2026-07-15-subagent-interruption-open-code.md` — probe commands, sanitized observations, and the original-call/resume/notice-only outcome decision.

**Modify:**
- `src/config/schema.ts` — strict review variants, canonical slot enum entries, reserved-name semantic validation, and `subagent-interruption-recovery` hook name.
- `src/config/schema.test.ts` — strict variants, reserved grammar, hook default, and generated-schema assertions.
- `src/config/load.ts` — migrate each base layer before merge and the precedence-selected active profile before overlay.
- `src/config/load.test.ts` — source-aware migration and cross-source spelling-collision tests.
- `src/config/profiles.test.ts` — active profile migration/collision and profile replacement behavior.
- `src/data/agents.ts` — rename the built-in `oracle-high` entry to normal-semantics `oracle-2nd`.
- `src/hooks/config.ts` — register one OCMM-expanded review profile set, inherit registration overrides, preserve valid host-provided parsed review profiles, and disable matching host profiles only through explicit disabled policy; parser-based floors still apply to host profiles.
- `src/hooks/config.test.ts` — built-ins, generated tiers, later configured slots, inheritance, disabled cascade, and no duplicate alias.
- `src/hooks/chat-params.ts` — parser-based review floor with independent `plan-critic` branch.
- `src/hooks/chat-params.test.ts` — every parsed tier, logical-low floor, alias, max cap, and plan-critic regressions.
- `src/routing/resolver.ts` — resolve expanded review profiles and runtime aliases; remove static `oracle-high` semantics.
- `src/routing/resolver.test.ts` — normal/tier requirement resolution, alias, disabled, and fallback inheritance.
- `src/routing/model-upgrades.ts` — choose upgrade lanes from canonical slot identity, ignoring logical tier suffixes.
- `src/routing/model-upgrades.test.ts` — slot 1 Terra behavior, slot 2 secondary lane, tier suffixes, and no invented later-slot lane.
- `src/permissions/index.ts` — rewrite `task` target alias before OpenCode lookup, recognize parsed review agents, and consume shared lineage decoding.
- `src/permissions/index.test.ts` — task target rewrite and nested lineage regression coverage.
- `src/permissions/subagent-git-guard.test.ts` — generated review names and alias builtin-name recognition.
- `src/codex/plugin-generator.ts` — consume expanded profiles, remove duplicate requirement resolution/static review sets, and render ordered priority/tier guidance.
- `src/codex/plugin-generator.test.ts` — canonical profiles, no aliases, native variant floors, configured slots, and generated guidance.
- `src/runtime-fallback/subagent-429-controller.ts` — prerequisite controller extended with durable child correlation and optional retry substate.
- `src/runtime-fallback/subagent-429-controller-interruption.test.ts` — duplicate/out-of-order correlation and durable-record tests on the existing controller (split filename; the legacy monolithic `subagent-429-controller.test.ts` was decomposed into `subagent-429-controller-{gate-policy,lifecycle,settlement,matrix,delay-scope,interruption}.test.ts`).
- `src/runtime-fallback/event-handler.ts` — shared controller lifecycle, retryable evidence, task-part association, and no duplicate dispatch.
- `src/runtime-fallback/event-handler-support.ts` — delegate session/parent lineage extraction to the shared OpenCode event decoder while preserving model/target/lifecycle helpers.
- `src/runtime-fallback/event-handler-interruption-recovery.test.ts` — both event orders, duplicate events, exclusions, deletion, and 429 ownership regression (split filename; the legacy monolithic `event-handler.test.ts` was decomposed into `event-handler-{dedicated-429-gates,dedicated-429-switching,dedicated-429-session-lifecycle,dedicated-429-retries,dedicated-429-idle-suppression,failed-model-resolution,fallback-dispatch,idle-continuation,interruption-recovery}.test.ts`).
- `src/runtime-fallback/index.ts` — export the shared runtime factory/types needed by the hook wrapper.
- `src/hooks/event.ts` — expose `createEventRuntime()` while retaining the existing event-only wrapper for tests/callers.
- `src/index.ts` — wire one runtime instance into both `event` and first-position `tool.execute.after` adapters.
- `src/index.test.ts` — hook composition and no-dispatch output-adapter integration.
- `skills/v1/requesting-code-review/SKILL.md` — ordered Oracle priority and per-role logical tier guidance.
- `skills/v1/subagent-driven-development/SKILL.md` — ordered final-acceptance selection without fixed triple review.
- `prompts/v1/deepwork/gpt-5.6.md`, `prompts/omo/deepwork/gpt-5.6.md`, `prompts/codex/deepwork/gpt-5.6.md` — safe-default question threshold and role-aware nesting matrix.
- `prompts/{v1,omo,codex}/agents/orchestrator.md` — exclusive workflow-agent composition ownership and ordered review terminology.
- `prompts/{v1,omo,codex}/agents/planner.md` — leaf research default plus at most one concrete-blocker Reviewer consultation.
- `prompts/{v1,omo,codex}/agents/reviewer.md` — leaf lookup only; no Reviewer/Oracle/workflow-role nesting.
- `prompts/{v1,omo,codex}/agents/clarifier.md` — leaf ambiguity discovery only; no workflow-role nesting.
- `prompts/{v1,omo,codex}/agents/plan-critic.md` — leaf claim verification only; no workflow-role nesting.
- `src/intent/prompt-loader.test.ts` — three-workflow question/delegation contract tests.
- `src/intent/plan-review-contract.test.ts` — active review-skill and documentation terminology contracts.
- `README.md` — config examples, migration, ordered profiles, hook behavior, and continuation notice.
- `AGENTS.md` — hook table, generated Codex profile semantics, release checks, and live probe guidance.
- `docs/architecture.md` — expansion boundary and single-controller interruption data flow.
- `examples/ocmm.example.jsonc` — strict variants and hook-disable examples.
- `docs/v1-maintenance.md` — v1 skill/prompt mapping updates.
- `docs/prompt-sync.md` — omo prompt and Oracle/Reviewer mapping updates.

**Generate:**
- `schema.json` — generated from the final `OcmmConfigSchema` and `HOOK_NAMES`.
- `.agents/plugins/marketplace.json` — regenerated Codex marketplace manifest.
- `.codex/agents/**` — canonical generated `dw-*` profiles with no `dw-oracle-second` duplicate.
- `plugins/deepwork/**` — synchronized prompts, skills, profiles, runtime bundle, and plugin metadata.

**Intentionally unchanged:**
- `src/config/normalize.ts` and `src/config/normalize.test.ts` — `normalizeAgentShorthand()` and `parseModelString()` are already exported with the signatures consumed by expansion; logical tiers remain outside `Variant`.
- `src/runtime-fallback/error-classifier.ts` and `src/runtime-fallback/error-classifier.test.ts` — the completed 429 classifier is a prerequisite interface; this plan adds no competing parser edits.
- `src/runtime-fallback/dispatcher.ts`, `src/runtime-fallback/dispatcher.test.ts`, `src/runtime-fallback/fallback-state.ts`, and `src/runtime-fallback/fallback-state.test.ts` — prerequisite interfaces and regression tests are verified but not edited by this plan.
- `docs/superpowers/specs/2026-07-14-oracle-high-review-design.md` and `docs/superpowers/plans/2026-07-14-oracle-high-review.md` — historical migration evidence only.
- No array-based Oracle configuration, automatic review fan-out, persistent recovery store, or synthetic parent prompt is added.

---

### Task 1: Preflight and Hard-Gate on Subagent 429 Tasks 1-5

**Files:**
- Inspect only: `docs/superpowers/plans/2026-07-15-subagent-429-fallback.md`
- Inspect only: `src/config/schema.ts`
- Inspect only: `src/runtime-fallback/error-classifier.ts`
- Inspect only: `src/runtime-fallback/error-classifier.test.ts`
- Inspect only: `src/runtime-fallback/fallback-state.ts`
- Inspect only: `src/runtime-fallback/dispatcher.ts`
- Inspect only: `src/runtime-fallback/subagent-429-controller.ts`
- Inspect only: `src/runtime-fallback/event-handler.ts`
- Inspect only: `src/runtime-fallback/event-handler-support.ts`
- Inspect only: corresponding `*.test.ts` files

**Interfaces:**
- Consumes: the complete existing plan Tasks 1-5 and whatever worktree state exists when execution starts.
- Produces: a binary prerequisite receipt proving the schema, recovery parser, blocker predicate, no-abort dispatcher, controller, and event integration all exist and pass together.

- [ ] **Step 1: Record the protected worktree without changing it**

Run:

```powershell
git status --short
git diff --name-only -- src/runtime-fallback
```

Expected: the commands report the live state without asserting that any particular prerequisite file is dirty, tracked, or absent. Record modified and untracked runtime-fallback paths. Do not run checkout, restore, reset, stash, clean, or any Git write command.

- [ ] **Step 2: Run the exact prerequisite marker gate**

```powershell
$missing = [System.Collections.Generic.List[string]]::new()
function Assert-TextMarker([string]$Path, [string]$Pattern, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) { $missing.Add("${Label}: missing file $Path"); return }
  rg -q -- $Pattern $Path
  if ($LASTEXITCODE -ne 0) { $missing.Add("${Label}: missing marker $Pattern in $Path") }
}
Assert-TextMarker 'src/config/schema.ts' 'Subagent429ConfigSchema' '429 Task 1 schema'
Assert-TextMarker 'src/runtime-fallback/error-classifier.ts' 'extractRecoveryDelayMs' '429 Task 2 classifier'
Assert-TextMarker 'src/runtime-fallback/fallback-state.ts' 'FallbackCandidateBlocker' '429 Task 3 candidate blocker'
Assert-TextMarker 'src/runtime-fallback/dispatcher.ts' 'abortBeforeDispatch' '429 Task 4 no-abort dispatch'
Assert-TextMarker 'src/runtime-fallback/subagent-429-controller.ts' 'createSubagent429Controller' '429 Task 4 controller'
Assert-TextMarker 'src/runtime-fallback/event-handler.ts' 'createSubagent429Controller' '429 Task 5 controller construction'
Assert-TextMarker 'src/runtime-fallback/event-handler.ts' 'controller\.on429' '429 Task 5 429 routing'
Assert-TextMarker 'src/runtime-fallback/event-handler.ts' 'controller\.onOtherError' '429 Task 5 generic handoff routing'
Assert-TextMarker 'src/runtime-fallback/event-handler.ts' 'controller\.onIdle' '429 Task 5 idle barrier routing'
Assert-TextMarker 'src/runtime-fallback/event-handler.ts' 'createRuntimeFallbackSessionLifecycle' '429 Task 5 lifecycle integration'
Assert-TextMarker 'src/runtime-fallback/event-handler-support.ts' 'resolveRetryTarget' '429 Task 5 event support'
if ($missing.Count -gt 0) {
  $missing | ForEach-Object { $_ }
  throw 'STOP: complete docs/superpowers/plans/2026-07-15-subagent-429-fallback.md Tasks 1-5 before continuing this plan.'
}
'subagent 429 prerequisite markers integrated'
```

Expected: either the command prints `subagent 429 prerequisite markers integrated`, or it prints every missing marker and throws the exact `STOP` error. Any missing marker, especially event-handler routing, ends this plan run; report the output and require completion of `docs/superpowers/plans/2026-07-15-subagent-429-fallback.md` Tasks 1-5 in its own integration flow. Do not create or repair prerequisite runtime files from this plan.

- [ ] **Step 3: Run focused prerequisite tests only after every marker passes**

```powershell
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
try {
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts src/config/profiles.test.ts src/runtime-fallback/error-classifier.test.ts src/runtime-fallback/fallback-state.test.ts src/runtime-fallback/dispatcher.test.ts src/runtime-fallback/subagent-429-controller-*.test.ts src/runtime-fallback/event-handler-*.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'focused prerequisite tests failed' }
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'prerequisite typecheck failed' }
```

Expected: all selected tests pass and typecheck exits 0. A missing test file, failed assertion, or type error is a failed prerequisite gate: stop and require completion of the existing 429 plan Tasks 1-5 before Task 2.

- [ ] **Step 4: Record the prerequisite receipt**

Report the live `git status --short`, marker-gate output, focused test counts, typecheck result, and the exact prerequisite files already present. The receipt authorizes Task 2 only; it authorizes no Git write and no edit to the parallel prerequisite files.

---

### Task 2: Capture the Live OpenCode Task/Interruption Contract

**Files:**
- Create: `src/runtime-fallback/fixtures/opencode-task-interruption.json`
- Create: `docs/superpowers/evidence/2026-07-15-subagent-interruption-open-code.md`
- Temporary only: `C:\Users\HUGEFI~1\AppData\Local\Temp\opencode\ocmm-interruption-probe\**`

**Interfaces:**
- Consumes: the integrated 429 runtime from Task 1, built `dist/index.js`, installed `opencode` with its bundled `@ai-sdk/openai-compatible` provider, a Node-built-ins fake provider, and isolated XDG directories.
- Produces: sanitized current-runtime payloads for `session.created`, `session.error`, `session.idle`, `session.deleted`, `message.part.updated`, and `tool.execute.after`; an explicit `taskIDObserved` value that is never inferred from a child session ID; and one exact handoff outcome: `original-call`, `same-task-id`, or `notice-only`.

- [ ] **Step 1: Establish the credential-free local probe**

```powershell
pnpm run build
$probeParent = 'C:\Users\HUGEFI~1\AppData\Local\Temp\opencode'
if (-not (Test-Path -LiteralPath $probeParent)) { throw "Pre-approved temp parent is missing: $probeParent" }
$probeRoot = 'C:\Users\HUGEFI~1\AppData\Local\Temp\opencode\ocmm-interruption-probe'
if (Test-Path -LiteralPath $probeRoot) { Remove-Item -LiteralPath $probeRoot -Recurse -Force }
New-Item -ItemType Directory -Path $probeRoot, "$probeRoot\xdg-config\opencode", "$probeRoot\xdg-data\opencode", "$probeRoot\xdg-state", "$probeRoot\xdg-cache", "$probeRoot\.opencode" -Force | Out-Null
$env:XDG_CONFIG_HOME = "$probeRoot\xdg-config"
$env:XDG_DATA_HOME = "$probeRoot\xdg-data"
$env:XDG_STATE_HOME = "$probeRoot\xdg-state"
$env:XDG_CACHE_HOME = "$probeRoot\xdg-cache"
$env:OCMM_PROBE_LOG = "$probeRoot\events.jsonl"
$env:OCMM_FAKE_PROVIDER_LOG = "$probeRoot\provider.jsonl"
$env:OCMM_PLUGIN_ENTRY = (Resolve-Path -LiteralPath 'dist/index.js').Path
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null

opencode debug paths
```

Expected: build passes; `data`, `cache`, `config`, and `state` point under `$probeRoot`; and no config or auth file is copied from the user's normal OpenCode directories. The probe uses OpenCode's bundled compatible provider and runs no package-manager command.

- [ ] **Step 2: Write the deterministic Node-built-ins fake provider**

Write `$probeRoot\fake-provider.mjs` with this exact content:

```javascript
import { appendFileSync } from "node:fs"
import { createServer } from "node:http"

const port = 41990
const logPath = process.env.OCMM_FAKE_PROVIDER_LOG
let resumeOrdinal = 0
let abortHoldRequests = 0

function writeLog(value) {
  if (logPath) appendFileSync(logPath, `${JSON.stringify(value)}\n`, "utf8")
}

function latestUserText(messages) {
  const user = [...messages].reverse().find((message) => message?.role === "user")
  if (typeof user?.content === "string") return user.content
  if (!Array.isArray(user?.content)) return ""
  return user.content.map((part) => typeof part?.text === "string" ? part.text : "").join("\n")
}

function hasToolResultAfterLatestUser(messages) {
  let latestUser = -1
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === "user") latestUser = index
  }
  return messages.slice(latestUser + 1).some((message) => message?.role === "tool")
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "application/json", ...headers })
  response.end(JSON.stringify(body))
}

function sendChat(response, requestBody, message, finishReason) {
  const model = requestBody.model
  if (!requestBody.stream) {
    sendJson(response, 200, {
      id: "chatcmpl_ocmm_probe",
      object: "chat.completion",
      created: 1,
      model,
      choices: [{ index: 0, message, finish_reason: finishReason }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    })
    return
  }
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" })
  response.write(`data: ${JSON.stringify({
    id: "chatcmpl_ocmm_probe",
    object: "chat.completion.chunk",
    created: 1,
    model,
    choices: [{ index: 0, delta: message, finish_reason: null }],
  })}\n\n`)
  response.write(`data: ${JSON.stringify({
    id: "chatcmpl_ocmm_probe",
    object: "chat.completion.chunk",
    created: 1,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  })}\n\n`)
  response.end("data: [DONE]\n\n")
}

function taskArguments(userText) {
  const resume = userText.match(/RESUME_PROBE\s+task_id=([^\s]+)/)
  if (resume) {
    return {
      description: "Resume interrupted child",
      prompt: "Return RESUMED and finish.",
      subagent_type: "code-search",
      task_id: resume[1],
    }
  }
  if (userText.includes("ABORT_PROBE")) {
    return { description: "Hold child request", prompt: "Wait until aborted.", subagent_type: "media-reader" }
  }
  if (userText.includes("INTERRUPTION_PROBE")) {
    return { description: "Probe transport interruption", prompt: "Return RECOVERED.", subagent_type: "code-search" }
  }
  return { description: "Probe 429 fallback", prompt: "Return RECOVERED.", subagent_type: "doc-search" }
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { healthy: true })
    return
  }
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    sendJson(response, 404, { error: { message: "unsupported probe path" } })
    return
  }
  let raw = ""
  request.setEncoding("utf8")
  request.on("data", (chunk) => { raw += chunk })
  request.on("end", () => {
    const body = JSON.parse(raw)
    writeLog({ model: body.model, stream: body.stream === true })
    if (body.model === "retry429") {
      sendJson(response, 429, { error: { message: "rate limit; retry after 0 seconds", type: "rate_limit_error" } }, { "retry-after": "0" })
      return
    }
    if (body.model === "resume-disconnect") {
      resumeOrdinal += 1
      if (resumeOrdinal === 1) response.destroy()
      else sendChat(response, body, { role: "assistant", content: "RESUMED" }, "stop")
      return
    }
    if (body.model === "abort-hold") {
      abortHoldRequests += 1
      const timer = setTimeout(() => {
        if (!response.destroyed && !response.writableEnded) sendChat(response, body, { role: "assistant", content: "HOLD_TIMEOUT" }, "stop")
      }, 30000)
      request.on("close", () => clearTimeout(timer))
      return
    }
    if (body.model === "orchestrator-tool") {
      if (hasToolResultAfterLatestUser(body.messages)) {
        sendChat(response, body, { role: "assistant", content: "PARENT_DONE" }, "stop")
        return
      }
      sendChat(response, body, {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call_ocmm_probe",
          type: "function",
          function: { name: "task", arguments: JSON.stringify(taskArguments(latestUserText(body.messages))) },
        }],
      }, "tool_calls")
      return
    }
    sendChat(response, body, { role: "assistant", content: "RECOVERED" }, "stop")
  })
})

server.listen(port, "127.0.0.1", () => writeLog({ listening: port }))
```

Expected: the server uses only Node built-ins. `retry429` exercises 429 fallback, the first `resume-disconnect` request deterministically disconnects while its second request succeeds, and every `abort-hold` request remains pending long enough for explicit abort. Resume and abort counters are independent.

- [ ] **Step 3: Write the sanitizing wrapper plugin**

Write `$probeRoot\probe-plugin.mjs` with this exact content:

```javascript
import { appendFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const { default: ocmm } = await import(pathToFileURL(process.env.OCMM_PLUGIN_ENTRY).href)
const logPath = process.env.OCMM_PROBE_LOG

function record(value, key) {
  return value && typeof value === "object" && !Array.isArray(value) ? value[key] : undefined
}

function firstString(value, keys) {
  for (const key of keys) {
    const found = record(value, key)
    if (typeof found === "string" && found.length > 0) return found
  }
}

function sanitizeEvent(raw) {
  const event = record(raw, "event") ?? raw
  const props = record(event, "properties") ?? event
  const part = record(props, "part")
  const state = record(part, "state")
  const metadata = record(state, "metadata")
  const input = record(state, "input")
  const info = record(props, "info")
  const error = record(props, "error")
  const errorText = typeof record(state, "error") === "string" ? record(state, "error") : ""
  const normalizedTaskError = /permission denied/i.test(errorText)
    ? "Permission denied"
    : /aborted|interrupted/i.test(errorText)
      ? "Tool execution aborted"
      : errorText ? "Other task error" : undefined
  return {
    type: record(event, "type"),
    sessionID: firstString(props, ["sessionID", "sessionId"]) ?? firstString(part, ["sessionID", "sessionId"]) ?? firstString(info, ["id"]),
    parentSessionID: firstString(props, ["parentID", "parentId", "parentSessionID", "parentSessionId"]) ?? firstString(info, ["parentID", "parentId"]),
    part: part && typeof part === "object" ? {
      id: firstString(part, ["id"]),
      type: record(part, "type"),
      tool: record(part, "tool"),
      callID: firstString(part, ["callID", "callId"]),
      state: {
        status: record(state, "status"),
        error: normalizedTaskError,
        input: {
          task_id: firstString(input, ["task_id", "taskID", "taskId"]),
          subagent_type: firstString(input, ["subagent_type"]),
        },
        metadata: {
          interrupted: record(metadata, "interrupted") === true,
          sessionId: firstString(metadata, ["sessionId", "sessionID"]),
        },
      },
    } : undefined,
    errorName: firstString(error, ["name", "type"]),
    statusCode: record(error, "status") ?? record(error, "statusCode"),
  }
}

function sanitizeAfter(input, output) {
  const metadata = record(output, "metadata")
  const args = record(input, "args")
  const body = typeof record(output, "output") === "string" ? record(output, "output") : ""
  return {
    tool: firstString(input, ["tool", "toolName", "toolID", "toolId"]),
    sessionID: firstString(input, ["sessionID", "sessionId"]),
    callID: firstString(input, ["callID", "callId"]),
    childSessionID: firstString(metadata, ["sessionId", "sessionID"]),
    taskID: firstString(metadata, ["task_id", "taskID", "taskId"])
      ?? firstString(output, ["task_id", "taskID", "taskId"])
      ?? firstString(args, ["task_id", "taskID", "taskId"]),
    outputKind: /permission denied/i.test(body) ? "permission-denied" : /unknown agent/i.test(body) ? "unknown-agent" : /aborted|interrupted|connection (?:closed|reset)/i.test(body) ? "interrupted" : body.trim() ? "other" : "empty",
    noticePresent: body.includes("[Subagent interruption recovery]"),
  }
}

async function write(kind, payload) {
  if (logPath) await appendFile(logPath, `${JSON.stringify({ kind, payload })}\n`, "utf8")
}

export default {
  id: "ocmm-interruption-probe",
  server(input, options) {
    const hooks = ocmm.server(input, options)
    return {
      ...hooks,
      event: async (payload) => {
        const clean = sanitizeEvent(payload)
        if (["session.created", "session.error", "session.idle", "session.deleted", "message.part.updated"].includes(clean.type)) await write("event", clean)
        await hooks.event?.(payload)
      },
      "tool.execute.after": async (hookInput, hookOutput) => {
        await write("tool.execute.after.before", sanitizeAfter(hookInput, hookOutput))
        await hooks["tool.execute.after"]?.(hookInput, hookOutput)
        await write("tool.execute.after.after", sanitizeAfter(hookInput, hookOutput))
      },
    }
  },
}
```

- [ ] **Step 4: Write isolated configs with no copied provider credentials**

Run in the same PowerShell session:

```powershell
$opencodeConfig = [ordered]@{
  '$schema' = 'https://opencode.ai/config.json'
  plugin = @("$probeRoot\probe-plugin.mjs")
  provider = [ordered]@{
    'ocmm-local-probe' = [ordered]@{
      npm = '@ai-sdk/openai-compatible'
      name = 'OCMM local probe'
      options = [ordered]@{ baseURL = 'http://127.0.0.1:41990/v1'; apiKey = 'local-probe-not-a-credential' }
      models = [ordered]@{
        'orchestrator-tool' = [ordered]@{ name = 'Probe orchestrator'; limit = [ordered]@{ context = 64000; output = 4096 } }
        retry429 = [ordered]@{ name = 'Probe 429'; limit = [ordered]@{ context = 64000; output = 4096 } }
        'resume-disconnect' = [ordered]@{ name = 'Probe resumable disconnect'; limit = [ordered]@{ context = 64000; output = 4096 } }
        success = [ordered]@{ name = 'Probe success'; limit = [ordered]@{ context = 64000; output = 4096 } }
        'abort-hold' = [ordered]@{ name = 'Probe abort hold'; limit = [ordered]@{ context = 64000; output = 4096 } }
      }
    }
  }
}
[System.IO.File]::WriteAllText("$probeRoot\opencode.json", ($opencodeConfig | ConvertTo-Json -Depth 20), [System.Text.UTF8Encoding]::new($false))

$ocmmConfig = [ordered]@{
  workflow = 'v1'
  debug = $true
  agents = [ordered]@{
    orchestrator = [ordered]@{ model = 'ocmm-local-probe/orchestrator-tool' }
    'doc-search' = [ordered]@{ model = 'ocmm-local-probe/retry429'; fallbackModels = @('ocmm-local-probe/success') }
    'code-search' = [ordered]@{ model = 'ocmm-local-probe/resume-disconnect' }
    'media-reader' = [ordered]@{ model = 'ocmm-local-probe/abort-hold' }
  }
  runtimeFallback = [ordered]@{
    enabled = $true
    dispatch = $true
    maxAttempts = 3
    cooldownSeconds = 1
    retryOnStatusCodes = @(429, 500, 502, 503, 504)
    retryOnPatterns = @('fetch failed', 'connection reset', 'other side closed', 'rate limit')
    subagent429 = [ordered]@{ enabled = $true; maxRetries = 0; providerScopes = [ordered]@{} }
  }
}
[System.IO.File]::WriteAllText("$probeRoot\.opencode\ocmm.jsonc", ($ocmmConfig | ConvertTo-Json -Depth 20), [System.Text.UTF8Encoding]::new($false))
```

Expected: both files are valid JSON; the only API key text is the fixed non-secret local probe literal. No normal user config, auth file, provider token, or external provider base URL is read or copied.

- [ ] **Step 5: Start both servers and run the exact REST probes**

Run this complete block in the same PowerShell session:

```powershell
$fakeProviderProcess = $null
$serverProcess = $null
$baseUrl = 'http://127.0.0.1:41991'
$directoryQuery = [uri]::EscapeDataString($probeRoot)

function Wait-Http([string]$Uri, [int]$TimeoutSeconds) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    try { return Invoke-RestMethod -Method Get -Uri $Uri -TimeoutSec 2 } catch { Start-Sleep -Milliseconds 200 }
  }
  throw "Timed out waiting for $Uri"
}

function New-ProbeSession([string]$Title) {
  $body = @{ title = $Title } | ConvertTo-Json -Compress
  $session = Invoke-RestMethod -Method Post -Uri "$baseUrl/session?directory=$directoryQuery" -ContentType 'application/json' -Body $body
  if ([string]::IsNullOrWhiteSpace($session.id)) { throw "Session creation returned no id for $Title" }
  return [string]$session.id
}

function Send-ProbePrompt([string]$SessionID, [string]$Text) {
  $body = [ordered]@{
    agent = 'orchestrator'
    model = [ordered]@{ providerID = 'ocmm-local-probe'; modelID = 'orchestrator-tool' }
    parts = @([ordered]@{ type = 'text'; text = $Text })
  } | ConvertTo-Json -Depth 8 -Compress
  $encoded = [uri]::EscapeDataString($SessionID)
  Invoke-WebRequest -Method Post -Uri "$baseUrl/session/$encoded/prompt_async?directory=$directoryQuery" -ContentType 'application/json' -Body $body | Out-Null
}

function Get-ProbeChildren([string]$SessionID) {
  $encoded = [uri]::EscapeDataString($SessionID)
  return @(Invoke-RestMethod -Method Get -Uri "$baseUrl/session/$encoded/children?directory=$directoryQuery")
}

function Wait-ProbeChild([string]$SessionID, [int]$TimeoutSeconds) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    $children = @(Get-ProbeChildren $SessionID)
    if ($children.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace($children[0].id)) { return [string]$children[0].id }
    Start-Sleep -Milliseconds 200
  }
  throw "Timed out waiting for child of $SessionID"
}

function Get-ProbeMessagesText([string]$SessionID) {
  $encoded = [uri]::EscapeDataString($SessionID)
  $messages = Invoke-RestMethod -Method Get -Uri "$baseUrl/session/$encoded/message?directory=$directoryQuery"
  return ($messages | ConvertTo-Json -Depth 30 -Compress)
}

function Wait-TextCount([string]$SessionID, [string]$Pattern, [int]$Count, [int]$TimeoutSeconds, [bool]$ThrowOnTimeout) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ([regex]::Matches((Get-ProbeMessagesText $SessionID), $Pattern).Count -ge $Count) { return $true }
    Start-Sleep -Milliseconds 250
  }
  if ($ThrowOnTimeout) { throw "Timed out waiting for $Count occurrence(s) of $Pattern in $SessionID" }
  return $false
}

function Read-JsonLines([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  return @([System.IO.File]::ReadAllLines($Path) | Where-Object { $_.Trim().Length -gt 0 } | ForEach-Object { $_ | ConvertFrom-Json })
}

try {
  $nodeExe = (Get-Command node).Source
  $opencodeExe = (Get-Command opencode).Source
  $fakeProviderProcess = Start-Process -FilePath $nodeExe -ArgumentList @("$probeRoot\fake-provider.mjs") -WorkingDirectory $probeRoot -PassThru -RedirectStandardOutput "$probeRoot\fake-provider.stdout.log" -RedirectStandardError "$probeRoot\fake-provider.stderr.log"
  Wait-Http 'http://127.0.0.1:41990/health' 15 | Out-Null
  $serverProcess = Start-Process -FilePath $opencodeExe -ArgumentList @('serve', '--hostname', '127.0.0.1', '--port', '41991') -WorkingDirectory $probeRoot -PassThru -RedirectStandardOutput "$probeRoot\opencode.stdout.log" -RedirectStandardError "$probeRoot\opencode.stderr.log"
  $health = Wait-Http "$baseUrl/global/health" 30

  $fallbackParent = New-ProbeSession 'ocmm-429-probe'
  Send-ProbePrompt $fallbackParent 'FALLBACK_PROBE'
  $fallbackChild = Wait-ProbeChild $fallbackParent 30
  [void](Wait-TextCount $fallbackParent 'PARENT_DONE' 1 60 $true)
  $providerRows = @(Read-JsonLines $env:OCMM_FAKE_PROVIDER_LOG)
  if (@($providerRows | Where-Object { $_.model -eq 'retry429' }).Count -lt 1) { throw '429 model was not called' }
  $fallbackSuccessCalls = @($providerRows | Where-Object { $_.model -eq 'success' }).Count

  $transportParent = New-ProbeSession 'ocmm-transport-probe'
  Send-ProbePrompt $transportParent 'INTERRUPTION_PROBE'
  $transportChild = Wait-ProbeChild $transportParent 30
  $transportReturned = Wait-TextCount $transportParent 'PARENT_DONE' 1 30 $false
  Start-Sleep -Milliseconds 500
  $eventRows = @(Read-JsonLines $env:OCMM_PROBE_LOG)
  $terminalRows = @($eventRows | Where-Object {
    $_.kind -eq 'event' -and $_.payload.type -eq 'message.part.updated' -and
    $_.payload.part.state.metadata.sessionId -eq $transportChild -and $_.payload.part.state.status -eq 'error'
  })
  # OpenCode 1.18.3 may surface the transport failure only as child
  # session.error/session.idle without a terminal parent task part. Persist
  # that null branch rather than guessing a task ID or parent-part shape.
  $providerRows = @(Read-JsonLines $env:OCMM_FAKE_PROVIDER_LOG)
  $resumeCallsBefore = @($providerRows | Where-Object { $_.model -eq 'resume-disconnect' }).Count
  if ($resumeCallsBefore -ne 1) { throw "Expected exactly one disconnected resume request before continuation, observed $resumeCallsBefore" }

  $taskIDs = @($terminalRows | ForEach-Object { $_.payload.part.state.input.task_id } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  $afterTaskIDs = @($eventRows | Where-Object {
    $_.kind -eq 'tool.execute.after.before' -and $_.payload.childSessionID -eq $transportChild
  } | ForEach-Object { $_.payload.taskID } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  $taskID = if ($taskIDs.Count -gt 0) { [string]$taskIDs[$taskIDs.Count - 1] } elseif ($afterTaskIDs.Count -gt 0) { [string]$afterTaskIDs[$afterTaskIDs.Count - 1] } else { $null }
  $handoff = if ($transportReturned) { 'original-call' } else { 'notice-only' }
  $resumeReusedChildSession = $false
  if (-not $transportReturned -and $taskID) {
    $beforeChildren = @(Get-ProbeChildren $transportParent)
    Send-ProbePrompt $transportParent "RESUME_PROBE task_id=$taskID"
    $resumed = Wait-TextCount $transportParent 'PARENT_DONE' 1 30 $false
    $afterChildren = @(Get-ProbeChildren $transportParent)
    $sameChildPresent = @($afterChildren | Where-Object { $_.id -eq $transportChild }).Count -eq 1
    $providerRows = @(Read-JsonLines $env:OCMM_FAKE_PROVIDER_LOG)
    $resumeCallsAfter = @($providerRows | Where-Object { $_.model -eq 'resume-disconnect' }).Count
    $resumeProviderCalled = $resumeCallsAfter -eq ($resumeCallsBefore + 1)
    $resumeReusedChildSession = $resumed -and $resumeProviderCalled -and $sameChildPresent -and $afterChildren.Count -eq $beforeChildren.Count
    if ($resumeReusedChildSession) { $handoff = 'same-task-id' }
  }

  $abortParent = New-ProbeSession 'ocmm-explicit-abort-probe'
  Send-ProbePrompt $abortParent 'ABORT_PROBE'
  $abortChild = Wait-ProbeChild $abortParent 30
  $holdDeadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    $providerRows = @(Read-JsonLines $env:OCMM_FAKE_PROVIDER_LOG)
    $holdBeforeAbort = @($providerRows | Where-Object { $_.model -eq 'abort-hold' }).Count
    if ($holdBeforeAbort -ge 1) { break }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $holdDeadline)
  if ($holdBeforeAbort -ne 1) { throw "Expected one in-flight hold request before abort, observed $holdBeforeAbort" }
  $encodedAbortChild = [uri]::EscapeDataString($abortChild)
  Invoke-RestMethod -Method Post -Uri "$baseUrl/session/$encodedAbortChild/abort?directory=$directoryQuery" -ContentType 'application/json' -Body '{}' | Out-Null
  Start-Sleep -Seconds 2
  $providerRows = @(Read-JsonLines $env:OCMM_FAKE_PROVIDER_LOG)
  $holdAfterAbort = @($providerRows | Where-Object { $_.model -eq 'abort-hold' }).Count
  $explicitAbortRecovered = $holdAfterAbort -gt $holdBeforeAbort
  if ($explicitAbortRecovered) { throw 'Explicit abort triggered another hold dispatch' }

  $allRows = @(Read-JsonLines $env:OCMM_PROBE_LOG)
  $createdRows = @($allRows | Where-Object { $_.kind -eq 'event' -and $_.payload.type -eq 'session.created' -and $_.payload.sessionID -eq $transportChild })
  $errorRows = @($allRows | Where-Object { $_.kind -eq 'event' -and $_.payload.type -eq 'session.error' -and $_.payload.sessionID -eq $transportChild })
  $afterRows = @($allRows | Where-Object { $_.kind -eq 'tool.execute.after.before' -and $_.payload.childSessionID -eq $transportChild })
  if ($createdRows.Count -eq 0) { throw 'Live gate failed: child session.created payload was not captured' }
  if ($errorRows.Count -eq 0) { throw 'Live gate failed: retryable child session.error payload was not captured' }
  $result = [ordered]@{
    openCodeVersion = [string]$health.version
    sessionCreated = if ($createdRows.Count -gt 0) { $createdRows[0].payload } else { $null }
    retryableChildError = if ($errorRows.Count -gt 0) { $errorRows[0].payload } else { $null }
    terminalParentTaskPart = if ($terminalRows.Count -gt 0) { $terminalRows[0].payload } else { $null }
    toolExecuteAfter = if ($afterRows.Count -gt 0) { $afterRows[0].payload } else { $null }
    handoff = $handoff
    taskIDObserved = $taskID
    childSessionIDObserved = $transportChild
    resumeReusedChildSession = $resumeReusedChildSession
    explicitAbortRecovered = $explicitAbortRecovered
    eventOrder = @($allRows | ForEach-Object { if ($_.kind -eq 'event') { [string]$_.payload.type } else { [string]$_.kind } })
  }
  [System.IO.File]::WriteAllText("$probeRoot\result.json", ($result | ConvertTo-Json -Depth 30), [System.Text.UTF8Encoding]::new($false))
} finally {
  if ($serverProcess -and -not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id -Force }
  if ($fakeProviderProcess -and -not $fakeProviderProcess.HasExited) { Stop-Process -Id $fakeProviderProcess.Id -Force }
}
```

Expected: both processes stop in `finally`; `$probeRoot\result.json` exists; `retry429`, `resume-disconnect`, and `abort-hold` were called; observed `success` calls are recorded rather than invented; a terminal parent task part is persisted when present and otherwise remains JSON `null`; a successful resume requires exactly one additional `resume-disconnect` call and preserves the child count; explicit abort makes no second `abort-hold` request; and `handoff` is exactly one allowed value. A child session ID is evidence only and is never copied into `taskIDObserved`.

- [ ] **Step 6: Persist the sanitized fixture and evidence with exact observed values**

Run:

```powershell
$result = [System.IO.File]::ReadAllText("$probeRoot\result.json") | ConvertFrom-Json
$fixture = [ordered]@{
  openCodeVersion = $result.openCodeVersion
  sessionCreated = $result.sessionCreated
  retryableChildError = $result.retryableChildError
  terminalParentTaskPart = $result.terminalParentTaskPart
  toolExecuteAfter = $result.toolExecuteAfter
  handoff = $result.handoff
  taskIDObserved = $result.taskIDObserved
  resumeReusedChildSession = [bool]$result.resumeReusedChildSession
  explicitAbortRecovered = [bool]$result.explicitAbortRecovered
}
$fixtureText = $fixture | ConvertTo-Json -Depth 30
$fixtureText = $fixtureText -replace 'ses_[A-Za-z0-9_-]+', 'ses_REDACTED'
$fixtureDirectory = 'src/runtime-fallback/fixtures'
$evidenceDirectory = 'docs/superpowers/evidence'
if (-not (Test-Path -LiteralPath 'src/runtime-fallback')) { throw 'Missing expected parent: src/runtime-fallback' }
if (-not (Test-Path -LiteralPath 'docs/superpowers')) { throw 'Missing expected parent: docs/superpowers' }
New-Item -ItemType Directory -Path $fixtureDirectory, $evidenceDirectory -Force | Out-Null
[System.IO.File]::WriteAllText('src/runtime-fallback/fixtures/opencode-task-interruption.json', $fixtureText, [System.Text.UTF8Encoding]::new($false))

$eventOrder = @($result.eventOrder) -join ' -> '
$taskIDLine = if ([string]::IsNullOrWhiteSpace([string]$result.taskIDObserved)) { 'No explicit task_id was exposed; childSessionID was not substituted.' } else { 'An explicit task_id field was exposed and preserved independently of childSessionID.' }
$evidence = @"
# OpenCode Subagent Interruption Probe — 2026-07-15

- OpenCode version: $($result.openCodeVersion)
- Fake provider: local Node-built-ins HTTP server on 127.0.0.1:41990
- OpenCode server: 127.0.0.1:41991
- Credential handling: no user config, auth, or provider environment credential was read or copied
- Event order: $eventOrder
- Handoff: $($result.handoff)
- Resume reused child: $($result.resumeReusedChildSession)
- Explicit abort recovered automatically: $($result.explicitAbortRecovered)
- Task identifier evidence: $taskIDLine

The deterministic path exercised a 429 response, a surfaced rate-limit error, a socket disconnect, and explicit abort. `session.error` remained the provider-error source of record. The selected handoff value comes from REST-visible parent/child behavior plus terminal parent task evidence when present; a missing terminal part remains null. No synthetic parent prompt, fabricated task ID, or duplicate child was introduced by the probe.
"@
[System.IO.File]::WriteAllText('docs/superpowers/evidence/2026-07-15-subagent-interruption-open-code.md', $evidence, [System.Text.UTF8Encoding]::new($false))
```

Expected: both target directories exist; the fixture contains only sanitized wrapper fields and redacted session IDs. It contains no prompt, API key, auth object, full provider error, local user path, or fabricated task ID. The evidence records the exact ports, event order, branch provenance, and branch decision, including a null terminal/task-ID shape when that is the live runtime result.

- [ ] **Step 7: Clean every temporary process, file, and environment variable**

```powershell
if ($serverProcess -and -not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id -Force }
if ($fakeProviderProcess -and -not $fakeProviderProcess.HasExited) { Stop-Process -Id $fakeProviderProcess.Id -Force }
$env:XDG_CONFIG_HOME = $null
$env:XDG_DATA_HOME = $null
$env:XDG_STATE_HOME = $null
$env:XDG_CACHE_HOME = $null
$env:OCMM_PROBE_LOG = $null
$env:OCMM_FAKE_PROVIDER_LOG = $null
$env:OCMM_PLUGIN_ENTRY = $null
$env:OCMM_PROFILE = $savedProfile
$env:OCMM_NO_PROFILE = $savedNoProfile
if (Test-Path -LiteralPath $probeRoot) { Remove-Item -LiteralPath $probeRoot -Recurse -Force }
if (Test-Path -LiteralPath $probeRoot) { throw 'Probe cleanup failed' }
'interruption probe cleanup complete'
```

Expected: prints `interruption probe cleanup complete`; all temporary artifacts were confined to the pre-approved temp root and are gone. No user provider configuration or credential environment variable was read or changed.

- [ ] **Step 8: Integration report/checkpoint**

Report the OpenCode version, deterministic 429/transport/abort assertions, explicit `taskIDObserved` result, handoff enum, resume-provider call count, sanitized fixture/evidence paths, and cleanup marker. If any gate failed, stop before Task 10; do not infer missing event fields or continuation semantics. Do not commit; separate explicit user authorization is required.

---

### Task 3: Add the Context-Sensitive Review-Agent Name Grammar

**Files:**
- Create: `src/review-agents/names.ts`
- Create: `src/review-agents/names.test.ts`

**Interfaces:**
- Consumes: no config schema or runtime state.
- Produces: `OracleOrdinal`, `OracleSlotName`, `ReviewAgentRole`, `ReviewLogicalTier`, `ReviewAgentIdentity`, `ORACLE_SLOT_NAMES`, `parseReviewAgentName(name: string): ReviewAgentIdentity | null`, `canonicalizeReviewAgentName(name: string): string | null`, `isReviewAgentName(name: string): boolean`, and `isReservedReviewAgentName(name: string): boolean`.

- [ ] **Step 1: Write the failing exhaustive grammar tests**

Create `src/review-agents/names.test.ts`:

```typescript
import { test } from "node:test"
import assert from "node:assert/strict"

import {
  ORACLE_SLOT_NAMES,
  canonicalizeReviewAgentName,
  isReservedReviewAgentName,
  parseReviewAgentName,
} from "./names.ts"

test("parses all nine Oracle slots and every logical tier", () => {
  for (const [index, slot] of ORACLE_SLOT_NAMES.entries()) {
    for (const tier of ["normal", "low", "high", "max"] as const) {
      const name = tier === "normal" ? slot : `${slot}-${tier}`
      assert.deepEqual(parseReviewAgentName(name), {
        role: "oracle",
        ordinal: index + 1,
        logicalTier: tier,
        canonicalSlot: slot,
        canonicalName: name,
      })
    }
  }
})

test("Reviewer supports tiers but never ordinal slots", () => {
  for (const tier of ["normal", "low", "high", "max"] as const) {
    const name = tier === "normal" ? "reviewer" : `reviewer-${tier}`
    assert.deepEqual(parseReviewAgentName(name), {
      role: "reviewer",
      ordinal: 1,
      logicalTier: tier,
      canonicalSlot: "reviewer",
      canonicalName: name,
    })
  }
  assert.equal(parseReviewAgentName("reviewer-2nd"), null)
})

test("runtime oracle-second alias canonicalizes only the unsuffixed second slot", () => {
  assert.equal(canonicalizeReviewAgentName("oracle-second"), "oracle-2nd")
  assert.equal(parseReviewAgentName("oracle-second")?.ordinal, 2)
  assert.equal(parseReviewAgentName("oracle-second-high"), null)
})

test("rejects malformed and out-of-range reserved review names", () => {
  for (const name of [
    "oracle-2", "oracle-10th", "oracle-normal", "oracle-2nd-normal",
    "oracle-0th", "oracle-tenth", "reviewer-normal", "reviewer-9th",
  ]) {
    assert.equal(parseReviewAgentName(name), null, name)
    assert.equal(isReservedReviewAgentName(name), true, name)
  }
  assert.equal(isReservedReviewAgentName("review-helper"), false)
})
```

- [ ] **Step 2: Run the RED test**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/review-agents/names.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./names.ts`.

- [ ] **Step 3: Implement the complete pure name module**

Create `src/review-agents/names.ts`:

```typescript
export const ORACLE_SLOT_NAMES = [
  "oracle",
  "oracle-2nd",
  "oracle-3rd",
  "oracle-4th",
  "oracle-5th",
  "oracle-6th",
  "oracle-7th",
  "oracle-8th",
  "oracle-9th",
] as const

export type OracleSlotName = (typeof ORACLE_SLOT_NAMES)[number]
export type OracleOrdinal = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type ReviewAgentRole = "oracle" | "reviewer"
export type ReviewLogicalTier = "low" | "normal" | "high" | "max"

export type ReviewAgentIdentity = {
  role: ReviewAgentRole
  ordinal: OracleOrdinal
  logicalTier: ReviewLogicalTier
  canonicalSlot: OracleSlotName | "reviewer"
  canonicalName: string
}

const TIER_SUFFIXES = ["low", "high", "max"] as const
const ORACLE_ORDINALS = new Map<OracleSlotName, OracleOrdinal>(
  ORACLE_SLOT_NAMES.map((slot, index) => [slot, (index + 1) as OracleOrdinal]),
)

function splitLogicalTier(name: string): { slot: string; tier: ReviewLogicalTier } {
  for (const tier of TIER_SUFFIXES) {
    const suffix = `-${tier}`
    if (name.endsWith(suffix)) return { slot: name.slice(0, -suffix.length), tier }
  }
  return { slot: name, tier: "normal" }
}

export function parseReviewAgentName(name: string): ReviewAgentIdentity | null {
  const runtimeCanonical = name === "oracle-second" ? "oracle-2nd" : name
  const { slot, tier } = splitLogicalTier(runtimeCanonical)
  if (slot === "reviewer") {
    return {
      role: "reviewer",
      ordinal: 1,
      logicalTier: tier,
      canonicalSlot: "reviewer",
      canonicalName: tier === "normal" ? "reviewer" : `reviewer-${tier}`,
    }
  }
  const ordinal = ORACLE_ORDINALS.get(slot as OracleSlotName)
  if (ordinal === undefined) return null
  const canonicalSlot = slot as OracleSlotName
  return {
    role: "oracle",
    ordinal,
    logicalTier: tier,
    canonicalSlot,
    canonicalName: tier === "normal" ? canonicalSlot : `${canonicalSlot}-${tier}`,
  }
}

export function canonicalizeReviewAgentName(name: string): string | null {
  return parseReviewAgentName(name)?.canonicalName ?? null
}

export function isReviewAgentName(name: string): boolean {
  return parseReviewAgentName(name) !== null
}

export function isReservedReviewAgentName(name: string): boolean {
  return name === "oracle" || name.startsWith("oracle-") || name === "reviewer" || name.startsWith("reviewer-")
}
```

Config migration must not call `parseReviewAgentName("oracle-high")` to interpret a raw config slot key; Task 4 owns that legacy-only context.

- [ ] **Step 4: Run GREEN tests and typecheck**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/review-agents/names.test.ts
pnpm run typecheck
```

Expected: four tests pass and typecheck exits 0.

- [ ] **Step 5: Integration report/checkpoint**

Report both files, all accepted/rejected names, test output, and typecheck result. Suggested semantic commit message: `feat: centralize review agent names`. Do not commit; separate explicit user authorization is required.

---

### Task 4: Add Strict Review Variants and Pre-Merge Config Migration

**Files:**
- Create: `src/config/review-agent-migration.ts`
- Create: `src/config/review-agent-migration.test.ts`
- Modify: `src/config/schema.ts`
- Modify: `src/config/schema.test.ts`
- Modify: `src/config/load.ts`
- Modify: `src/config/load.test.ts`
- Modify: `src/config/profiles.test.ts`
- Generate: `schema.json`

**Interfaces:**
- Consumes: `parseReviewAgentName()`, `isReservedReviewAgentName()`, `deepMerge()`, existing user→project→selected-profile precedence, and native `VariantEnum`.
- Produces: `ReviewVariantOverrideSchema`, `ReviewVariantsSchema`, `ReviewVariantOverride`, `ReviewVariants`, `ReviewConfigConflictError`, `prepareConfigLayers()`, `prepareReviewProfile()`, `assertSelectedReviewProfileCompatible()`, provenance-bearing profile-file entries, and canonical parsed config.

- [ ] **Step 1: Write RED schema tests for strict variants and reserved names**

Append to `src/config/schema.test.ts` and import `OcmmConfigSchema`:

```typescript
test("review variants accept native strings and non-empty strict objects", () => {
  const parsed = OcmmConfigSchema.parse({
    agents: {
      oracle: {
        model: "openai/gpt-5.6-terra",
        variants: {
          low: "low",
          high: { variant: "max" },
          max: { model: "openai/gpt-5.6-sol", variant: "max" },
        },
      },
      reviewer: { model: "google/gemini-3.1-pro", variants: { high: "xhigh" } },
    },
  })
  assert.equal(parsed.agents?.oracle?.variants?.max && typeof parsed.agents.oracle.variants.max, "object")
})

test("review variants reject empty objects unknown keys normal tier and non-review agents", () => {
  for (const agents of [
    { oracle: { model: "openai/gpt-5.6-terra", variants: { high: {} } } },
    { oracle: { model: "openai/gpt-5.6-terra", variants: { normal: "high" } } },
    { oracle: { model: "openai/gpt-5.6-terra", variants: { high: { model: "x/y", extra: true } } } },
    { planner: { model: "openai/gpt-5.6-sol", variants: { high: "max" } } },
  ]) assert.equal(OcmmConfigSchema.safeParse({ agents }).success, false)
})

test("reserved review namespace accepts only canonical normal config slots", () => {
  for (const name of ["oracle-high", "oracle-2", "oracle-10th", "oracle-2nd-high", "reviewer-2nd", "reviewer-high", "oracle-second"]) {
    assert.equal(OcmmConfigSchema.safeParse({ agents: { [name]: { model: "openai/gpt-5.6-sol" } } }).success, false, name)
  }
  assert.equal(OcmmConfigSchema.safeParse({ agents: { "oracle-9th": { model: "openai/gpt-5.6-sol" } } }).success, true)
})
```

- [ ] **Step 2: Write RED pure migration tests for base layers and stored profiles**

Create `src/config/review-agent-migration.test.ts`:

```typescript
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  ReviewConfigConflictError,
  assertSelectedReviewProfileCompatible,
  prepareConfigLayers,
  prepareReviewProfile,
} from "./review-agent-migration.ts"

test("legacy oracle-high migrates to oracle-2nd and warns with source", () => {
  const warnings: string[] = []
  const prepared = prepareConfigLayers([
    { source: "C:/config/user.jsonc", value: { agents: { "oracle-high": { model: "openai/gpt-5.5" } } } },
  ], (message) => warnings.push(message))
  const migrated = prepared.layers[0]!.value as { agents: Record<string, unknown> }
  assert.deepEqual(Object.keys(migrated.agents), ["oracle-2nd"])
  assert.match(warnings[0] ?? "", /agents\.oracle-high.*C:\/config\/user\.jsonc.*agents\.oracle-2nd/)
})

test("different spellings collide across active base layers", () => {
  assert.throws(
    () => prepareConfigLayers([
      { source: "user", value: { agents: { "oracle-high": { model: "openai/gpt-5.5" } } } },
      { source: "project", value: { agents: { "oracle-2nd": { model: "anthropic/claude-opus-4-7" } } } },
    ], () => {}),
    /oracle-high.*user.*oracle-2nd.*project/,
  )
})

test("alias and canonical keys collide inside one agent map", () => {
  assert.throws(
    () => prepareConfigLayers([{
      source: "project",
      value: {
        agents: {
          "oracle-second": { model: "a/one" },
          "oracle-2nd": { model: "b/two" },
        },
      },
    }], () => {}),
    /oracle-second.*oracle-2nd|oracle-2nd.*oracle-second/,
  )
})

test("canonical-to-canonical override remains valid", () => {
  assert.doesNotThrow(() => prepareConfigLayers([
    { source: "user", value: { agents: { "oracle-2nd": { model: "a/one" } } } },
    { source: "project", value: { agents: { "oracle-2nd": { model: "b/two" } } } },
  ], () => {}))
})

test("every inline profile is canonicalized without colliding with base while inactive", () => {
  const prepared = prepareConfigLayers([{
    source: "user",
    value: {
      agents: { "oracle-2nd": { model: "a/one" } },
      profiles: {
        inactive: { agents: { "oracle-high": { model: "b/two" } } },
        selected: { agents: { "oracle-second": { model: "c/three" } } },
      },
    },
  }], () => {})
  const value = prepared.layers[0]!.value as {
    profiles: Record<string, { agents: Record<string, unknown> }>
  }
  assert.deepEqual(Object.keys(value.profiles.inactive!.agents), ["oracle-2nd"])
  assert.deepEqual(Object.keys(value.profiles.selected!.agents), ["oracle-2nd"])
  assert.equal(prepared.inlineProfiles.get("inactive")?.length, 1)
  assert.throws(
    () => assertSelectedReviewProfileCompatible(
      prepared.baseOrigins,
      prepared.inlineProfiles.get("selected") ?? [],
    ),
    ReviewConfigConflictError,
  )
})

test("a shadowing directory profile is the only profile compared with base", () => {
  const prepared = prepareConfigLayers([{
    source: "base",
    value: {
      agents: { "oracle-2nd": { model: "a/one" } },
      profiles: { selected: { agents: { "oracle-high": { model: "b/two" } } } },
    },
  }], () => {})
  const winner = prepareReviewProfile({
    name: "selected",
    source: "C:/project/.opencode/ocmm-profiles/selected.jsonc",
    value: { agents: { "oracle-2nd": { model: "c/three" } } },
  }, () => {})
  assert.doesNotThrow(() => assertSelectedReviewProfileCompatible(prepared.baseOrigins, [winner]))
})
```

- [ ] **Step 3: Run RED schema and migration tests**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts src/config/review-agent-migration.test.ts
```

Expected: FAIL because `variants` is rejected and `review-agent-migration.ts` does not exist.

- [ ] **Step 4: Implement context-specific layer/profile preparation with exact public APIs**

Create `src/config/review-agent-migration.ts` with these exports:

```typescript
export type ReviewConfigSpelling = "canonical" | "legacy-oracle-high" | "oracle-second-alias"

export type ReviewConfigOrigin = {
  canonicalKey: "oracle-2nd"
  originalKey: "oracle-2nd" | "oracle-high" | "oracle-second"
  spelling: ReviewConfigSpelling
  source: string
}

export type ReviewConfigLayerInput = { source: string; value: unknown }

export type PreparedReviewProfile = {
  name: string
  source: string
  value: unknown
  origins: ReadonlyMap<string, ReviewConfigOrigin>
}

export type PreparedReviewConfigLayer = {
  source: string
  value: unknown
}

export type PreparedReviewConfigLayers = {
  layers: readonly PreparedReviewConfigLayer[]
  baseOrigins: ReadonlyMap<string, ReviewConfigOrigin>
  inlineProfiles: ReadonlyMap<string, readonly PreparedReviewProfile[]>
}

export class ReviewConfigConflictError extends Error {
  readonly code = "OCMM_REVIEW_CONFIG_CONFLICT"
}
```

The file must export implementations with these exact signatures:

- `prepareReviewProfile(input: { name: string; source: string; value: unknown }, warn: (message: string) => void): PreparedReviewProfile`
- `prepareConfigLayers(layers: readonly ReviewConfigLayerInput[], warn: (message: string) => void): PreparedReviewConfigLayers`
- `assertSelectedReviewProfileCompatible(baseOrigins: ReadonlyMap<string, ReviewConfigOrigin>, selectedProfiles: readonly PreparedReviewProfile[]): void`

Implement the following deterministic rules in those functions:

1. Only raw agent-map keys have migration semantics: `oracle-high` maps to `oracle-2nd` as legacy config, and `oracle-second` maps to `oracle-2nd` as the one accepted config alias. `oracle-second-high` is untouched and later rejected by schema. Runtime name parsing is never called to interpret raw `agents.oracle-high`.
2. Canonicalize `agents` on every base layer before merge. `prepareConfigLayers()` compares base origins across layers: identical original spellings may override by normal precedence; different spellings targeting `oracle-2nd` throw `ReviewConfigConflictError` naming both keys and both sources.
3. Canonicalize every inline `profiles[name].agents` map inside its own layer before schema parsing. Store one `PreparedReviewProfile` contribution per source in `inlineProfiles`. Detect duplicate spellings within that profile object, but do not compare any inline profile with base during preparation.
4. `prepareReviewProfile()` applies the same within-profile canonicalization to each user/project directory profile and records its file path. It never compares that profile with base.
5. `assertSelectedReviewProfileCompatible()` receives only the profile contribution(s) that actually won precedence. It first checks different spellings across those selected contributions, then checks their winning origins against `baseOrigins`. It does not inspect shadowed directory or inactive profiles.
6. Every `oracle-high` migration emits ``deprecated agents.oracle-high in ${source}; migrated to agents.oracle-2nd. Configure logical high with agents.oracle.variants.high.`` using the concrete base or profile source. Alias migration emits no deprecation warning.
7. Input objects, nested agent entries, and profile entries are not mutated; only enclosing maps are shallow-copied to replace keys.

The implementation is complete when the Step 2 tests compile without casts to undocumented state, warnings contain concrete sources, and no exported function accepts or returns a mutable global migration state.

- [ ] **Step 5: Implement strict review variant schemas and key-aware agent-map validation**

In `src/config/schema.ts`, export the native enum and add:

```typescript
import { isReservedReviewAgentName, parseReviewAgentName } from "../review-agents/names.ts"

export const VariantEnum = z.enum([
  "low", "medium", "high", "xhigh", "max", "minimal", "none", "auto", "thinking",
])

export const ReviewVariantOverrideSchema = z.union([
  VariantEnum,
  z.object({ model: z.string().min(1).optional(), variant: VariantEnum.optional() })
    .strict()
    .refine((value) => value.model !== undefined || value.variant !== undefined, {
      message: "review variant object must contain model and/or variant",
    }),
])

export const ReviewVariantsSchema = z.object({
  low: ReviewVariantOverrideSchema.optional(),
  high: ReviewVariantOverrideSchema.optional(),
  max: ReviewVariantOverrideSchema.optional(),
}).strict()
```

Add `variants: ReviewVariantsSchema.optional()` to `AgentEntrySchema`. Replace both agent records with one validated schema:

```typescript
const AgentsConfigSchema = z.record(z.string(), AgentEntrySchema).superRefine((agents, ctx) => {
  for (const [name, entry] of Object.entries(agents)) {
    const identity = parseReviewAgentName(name)
    const canonicalNormal = identity?.logicalTier === "normal" && identity.canonicalName === name
    if (isReservedReviewAgentName(name) && !canonicalNormal) {
      ctx.addIssue({ code: "custom", path: [name], message: "review-agent config keys must be canonical unsuffixed slots oracle, oracle-2nd through oracle-9th, or reviewer" })
    }
    if (entry.variants !== undefined && !canonicalNormal) {
      ctx.addIssue({ code: "custom", path: [name, "variants"], message: "variants is allowed only on canonical Oracle or Reviewer normal-slot entries" })
    }
  }
})
```

Use `AgentsConfigSchema.optional()` in both `ProfileEntrySchema.agents` and `OcmmConfigSchema.agents`. Remove legacy `oracle-high` from `AGENT_NAMES`; add canonical `oracle-2nd` through `oracle-9th`. Export:

```typescript
export type ReviewVariantOverride = z.infer<typeof ReviewVariantOverrideSchema>
export type ReviewVariants = z.infer<typeof ReviewVariantsSchema>
```

- [ ] **Step 6: Integrate migration at layer boundaries without false profile conflicts**

In `src/config/load.ts`, add these exact source-bearing profile APIs while preserving `loadProfilesFromDir(dir): Record<string, unknown>` as a compatibility wrapper:

```typescript
export type ProfileFileEntry = { source: string; value: unknown }
```

Add the implementation with exact signature `loadProfileEntriesFromDir(dir: string): Record<string, ProfileFileEntry>`.

`loadProfileEntriesFromDir()` keeps the current `.jsonc`-over-`.json` precedence and defensive nested-profile stripping, and returns each winning file's absolute path in `source`. `loadProfilesFromDir()` maps those entries back to their `.value` fields so existing callers and tests keep their contract.

Refactor `loadConfig()` in this exact order:

1. Read user and project files into `ReviewConfigLayerInput[]`, applying `stripProjectOnlyFields()` to the project value before preparation and recording `sources` as today.
2. Call `prepareConfigLayers(rawLayers, (message) => log.warn(message))` once. Deep-merge only `prepared.layers[].value`, in input order.
3. Determine `activeProfile` from the canonical merged base using the existing environment precedence.
4. Load every user/project directory profile through `loadProfileEntriesFromDir()` and immediately pass each entry through `prepareReviewProfile()`. This canonicalizes directory entries before selection without comparing inactive entries with base.
5. Build profile values with the unchanged precedence: merged inline value, then user-directory whole-profile replacement, then project-directory whole-profile replacement.
6. Determine selected provenance separately: project-directory winner is one prepared profile; otherwise user-directory winner is one prepared profile; otherwise use all prepared inline contributions for that name in user→project order.
7. Call `assertSelectedReviewProfileCompatible(prepared.baseOrigins, selectedContributions)` only for the active winning profile. Then overlay its canonical value with `{ profileOverlay: true }`.
8. Parse with `OcmmConfigSchema.safeParse()` as today. Canonicalized inactive inline profiles remain in `merged.profiles`, so `ProfileEntrySchema` validates them successfully.
9. Catch `ReviewConfigConflictError` inside `loadConfig()`, call `log.warn()` once with `ocmm review-agent config conflict; using defaults: ${error.message}`, and return `defaultConfig()` with the discovered `sources` and `activeProfile`. The pure preparation APIs still throw for unit tests; `loadConfig()` preserves its established safe-default contract and never silently applies one spelling over another.

No migration conflict escapes `loadConfig()`. `createPlugin()` retains its outer defensive catch for unrelated unexpected errors.

- [ ] **Step 7: Add complete load/profile integration tests**

In `src/config/load.test.ts`, import `loadProfileEntriesFromDir` and add:

```typescript
test("loadProfileEntriesFromDir retains the winning profile source path", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-profile-source-"))
  try {
    writeFileSync(join(root, "focused.json"), JSON.stringify({ debug: false }))
    writeFileSync(join(root, "focused.jsonc"), JSON.stringify({ debug: true }))
    const loaded = loadProfileEntriesFromDir(root)
    assert.equal(loaded.focused?.source, join(root, "focused.jsonc"))
    assert.deepEqual(loaded.focused?.value, { debug: true })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

In `src/config/profiles.test.ts`, import `defaultConfig` and append these complete tests, reusing the existing `makeTempXdg()`, `writeConfig()`, and `loadWithXdg()` helpers:

```typescript
test("loader migrates legacy base config before schema validation", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, { agents: { "oracle-high": { model: "openai/gpt-5.5" } } })
    const loaded = loadWithXdg(xdg)
    assert.equal(loaded.config.agents?.["oracle-high"], undefined)
    assert.equal(loaded.config.agents?.["oracle-2nd"]?.model, "openai/gpt-5.5")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("loader logs an active base-profile spelling conflict and returns defaults", () => {
  const xdg = makeTempXdg()
  const previousDebug = process.env.OCMM_DEBUG
  const originalWarn = console.warn
  const warnings: string[] = []
  process.env.OCMM_DEBUG = "1"
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")) }
  try {
    writeConfig(xdg, {
      agents: { "oracle-2nd": { model: "openai/gpt-5.5" } },
      profiles: { selected: { agents: { "oracle-second": { model: "anthropic/claude-opus-4-7" } } } },
      activeProfile: "selected",
    })
    const loaded = loadWithXdg(xdg)
    assert.deepEqual(loaded.config, defaultConfig())
    assert.match(warnings.join("\n"), /config conflict.*using defaults.*oracle-2nd.*oracle-second/is)
  } finally {
    console.warn = originalWarn
    if (previousDebug === undefined) delete process.env.OCMM_DEBUG
    else process.env.OCMM_DEBUG = previousDebug
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("inactive inline profiles are canonicalized and remain schema-valid", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: { "oracle-2nd": { model: "openai/gpt-5.5" } },
      profiles: { inactive: { agents: { "oracle-high": { model: "anthropic/claude-opus-4-7" } } } },
    })
    const loaded = loadWithXdg(xdg)
    assert.equal(loaded.config.agents?.["oracle-2nd"]?.model, "openai/gpt-5.5")
    assert.equal(loaded.config.profiles.inactive?.agents?.["oracle-high"], undefined)
    assert.equal(loaded.config.profiles.inactive?.agents?.["oracle-2nd"]?.model, "anthropic/claude-opus-4-7")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("project directory profile shadows a conflicting lower inline spelling", () => {
  const xdg = makeTempXdg()
  const project = mkdtempSync(join(tmpdir(), "ocmm-review-profile-project-"))
  try {
    writeConfig(xdg, {
      agents: { "oracle-2nd": { model: "openai/gpt-5.5" } },
      profiles: { selected: { agents: { "oracle-high": { model: "google/gemini-3.1-pro" } } } },
      activeProfile: "selected",
    })
    const directory = join(project, ".opencode", "ocmm-profiles")
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, "selected.jsonc"), JSON.stringify({
      agents: { "oracle-2nd": { model: "anthropic/claude-opus-4-7" } },
    }))
    const loaded = loadWithXdg(xdg, project)
    assert.equal(loaded.config.agents?.["oracle-2nd"]?.model, "anthropic/claude-opus-4-7")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})
```

- [ ] **Step 8: Run GREEN tests and regenerate schema**

```powershell
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
try {
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts src/config/review-agent-migration.test.ts src/config/load.test.ts src/config/profiles.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'review config migration tests failed' }
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
pnpm run gen-schema
node -e 'const fs=require("node:fs");const s=fs.readFileSync("schema.json","utf8");for(const x of ["variants","oracle-2nd","oracle-9th"])if(!s.includes(x))throw new Error("schema missing "+x);if(s.includes("\"normal\": {\n"))throw new Error("normal tier leaked");console.log("review variants schema synchronized")'
pnpm run typecheck
```

Expected: all selected tests pass; the node assertion prints `review variants schema synchronized`; typecheck exits 0.

- [ ] **Step 9: Integration report/checkpoint**

Report migration cases, source-path warning evidence, profile-shadow behavior, strict-schema failures, generated schema check, and touched files. Suggested semantic commit message: `feat: migrate review slots and validate variants`. Do not commit; separate explicit user authorization is required.

---

### Task 5: Implement Pure Review-Profile Expansion and Disable Policy

**Files:**
- Create: `src/review-agents/expand.ts`
- Create: `src/review-agents/expand.test.ts`
- Modify: `src/data/agents.ts`

**Interfaces:**
- Consumes: canonical normal-slot config from Task 4, `BUILTIN_AGENT_INDEX`, `normalizeAgentShorthand()`, native `Variant`, and runtime-name identities from Task 3.
- Produces: `ReviewAgentRegistrationOverrides`, `ExpandedReviewAgent`, `ReviewAgentExpansionInput`, `expandReviewAgents(input): ExpandedReviewAgent[]`, `expandedReviewAgentMap(input): ReadonlyMap<string, ExpandedReviewAgent>`, and `isExpandedReviewAgentDisabled(name, input): boolean`.

`expandReviewAgents()` is the sole materialization source. Tasks 6-8 may filter or index its result, but config registration, resolver/chat params, runtime fallback, and Codex must not independently clone a review requirement or enumerate configured tiers.

- [ ] **Step 1: Write failing expansion tests for built-ins, configured slots, and ordered tiers**

Create `src/review-agents/expand.test.ts` with these initial tests:

```typescript
import { test } from "node:test"
import assert from "node:assert/strict"

import type { AgentEntry } from "../config/schema.ts"
import { ORACLE_SLOT_NAMES } from "./names.ts"
import { expandReviewAgents, expandedReviewAgentMap } from "./expand.ts"

test("expands built-in normal slots and only explicitly configured later slots and tiers", () => {
  const agents: Record<string, AgentEntry> = {
    oracle: { variants: { high: "max" } },
    "oracle-3rd": { model: "anthropic/claude-opus-4-7", variants: { low: "high" } },
    reviewer: { variants: { max: { model: "openai/gpt-5.6-sol", variant: "max" } } },
  }
  const names = expandReviewAgents({ agents }).map((profile) => profile.name)
  assert.deepEqual(names.filter((name) => name.startsWith("oracle")), [
    "oracle", "oracle-high", "oracle-2nd", "oracle-3rd", "oracle-3rd-low",
  ])
  assert.deepEqual(names.filter((name) => name.startsWith("reviewer")), ["reviewer", "reviewer-max"])
  for (const slot of ORACLE_SLOT_NAMES.slice(3)) assert.equal(names.includes(slot), false)
})

test("oracle slots retain priority order without dispatch or automatic fan-out", () => {
  const agents: Record<string, AgentEntry> = {
    "oracle-5th": { model: "e/five" },
    "oracle-3rd": { model: "c/three" },
  }
  const normals = expandReviewAgents({ agents })
    .filter((profile) => profile.identity.role === "oracle" && profile.identity.logicalTier === "normal")
    .map((profile) => profile.name)
  assert.deepEqual(normals, ["oracle", "oracle-2nd", "oracle-3rd", "oracle-5th"])
})

test("built-in normal slots do not synthesize logical tiers", () => {
  const names = expandReviewAgents().map((profile) => profile.name)
  assert.deepEqual(names, ["oracle", "oracle-2nd", "reviewer"])
  assert.equal(names.includes("oracle-high"), false)
  assert.equal(names.includes("oracle-2nd-high"), false)
})
```

- [ ] **Step 2: Add failing inheritance, model replacement, and non-mutation tests**

Append:

```typescript
test("tier expansion deep-clones requirements and materializes native variants across fallbacks", () => {
  const normal: AgentEntry = {
    requirement: {
      variant: "xhigh",
      requiresProvider: ["openai", "anthropic"],
      fallbackChain: [
        { providers: ["openai"], model: "primary", variant: "xhigh", temperature: 0.2, thinking: { type: "enabled", budgetTokens: 4096 } },
        { providers: ["anthropic"], model: "fallback", variant: "max", maxTokens: 12000 },
      ],
    },
    tools: { read: true, task: false },
    permission: { webfetch: "allow" },
    skills: ["requesting-code-review"],
    promptAppend: "Review the actual diff.",
    temperature: 0.4,
    variants: {
      low: "low",
      high: { model: "google/gemini-3.1-pro" },
      max: { model: "openai/gpt-5.6-sol", variant: "max" },
    },
  }
  const agents = { "oracle-3rd": normal }
  const before = structuredClone(agents)
  const profiles = expandedReviewAgentMap({ agents })

  const low = profiles.get("oracle-3rd-low")!
  assert.equal(low.requirement.variant, "low")
  assert.deepEqual(low.requirement.fallbackChain.map((entry) => entry.variant), ["low", "low"])

  const high = profiles.get("oracle-3rd-high")!
  assert.deepEqual(high.requirement.fallbackChain.map((entry) => `${entry.providers[0]}/${entry.model}`), [
    "google/gemini-3.1-pro", "anthropic/fallback",
  ])
  assert.deepEqual(high.requirement.requiresProvider, ["google", "anthropic"])
  assert.equal(high.requirement.fallbackChain[0]?.variant, "xhigh")
  assert.equal(high.requirement.fallbackChain[0]?.temperature, 0.2)

  const max = profiles.get("oracle-3rd-max")!
  assert.deepEqual(max.requirement.fallbackChain.map((entry) => entry.variant), ["max", "max"])
  assert.deepEqual(max.registration.skills, ["requesting-code-review"])
  assert.equal(max.registration.promptAppend, "Review the actual diff.")
  assert.deepEqual(agents, before)
  assert.notEqual(max.requirement, normal.requirement)
  assert.notEqual(max.requirement.fallbackChain[0], normal.requirement?.fallbackChain[0])
})

test("variant-only tier is user-configured but inherits catalog suppression from normal", () => {
  const builtinTier = expandedReviewAgentMap({ agents: { oracle: { variants: { high: "max" } } } }).get("oracle-high")!
  assert.equal(builtinTier.resolutionSource, "user-config")
  assert.equal(builtinTier.suppressCatalogUpgrade, false)

  const explicitTier = expandedReviewAgentMap({
    agents: { oracle: { model: "openai/gpt-5.6-terra", variants: { high: "max" } } },
  }).get("oracle-high")!
  assert.equal(explicitTier.suppressCatalogUpgrade, true)
})
```

- [ ] **Step 3: Add failing disable-cascade and unresolved-slot tests**

Append:

```typescript
test("unsuffixed disable cascades while suffixed disable is profile-only", () => {
  const agents: Record<string, AgentEntry> = {
    oracle: { variants: { high: "max", max: "max" } },
    reviewer: { variants: { high: "xhigh" } },
  }
  assert.deepEqual(
    expandReviewAgents({ agents, disabledAgents: ["oracle-high"] }).map((profile) => profile.name).filter((name) => name.startsWith("oracle")),
    ["oracle", "oracle-max", "oracle-2nd"],
  )
  assert.equal(expandReviewAgents({ agents, disabledAgents: ["oracle"] }).some((profile) => profile.name.startsWith("oracle") && !profile.name.startsWith("oracle-2nd")), false)
  assert.equal(expandReviewAgents({ agents, disabledAgents: ["oracle-second"] }).some((profile) => profile.name.startsWith("oracle-2nd")), false)
  assert.equal(expandReviewAgents({ agents: { reviewer: { ...agents.reviewer, disabled: true } } }).some((profile) => profile.name.startsWith("reviewer")), false)
})

test("later slot must resolve a normal requirement before any tier can exist", () => {
  assert.throws(
    () => expandReviewAgents({ agents: { "oracle-4th": { description: "missing model", variants: { high: "max" } } } }),
    /oracle-4th.*normal model requirement/,
  )
})
```

- [ ] **Step 4: Run the RED expansion test**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/review-agents/expand.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./expand.ts`.

- [ ] **Step 5: Rename the second built-in slot, then implement exact expansion types and clone helpers**

In `src/data/agents.ts`, rename the old `oracle-high` entry before expansion depends on it:

```typescript
  {
    name: "oracle-2nd",
    description:
      "Second-priority Oracle review model for additional independent evidence. Priority does not imply greater capability or effort.",
    promptSource: "reviewer",
    requirement: {
      variant: "high",
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "xhigh" },
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "xhigh" },
        { providers: ["zhipu"], model: "glm-5.1", variant: "xhigh" },
      ],
    },
  },
```

Update the catalog header/count and remove capability-ranked wording for this entry. Do not add built-ins for slots 3 through 9.

Create `src/review-agents/expand.ts` beginning with:

```typescript
import { normalizeAgentShorthand, parseModelString, type PermissionValue } from "../config/normalize.ts"
import type { AgentEntry, ReviewVariantOverride } from "../config/schema.ts"
import { BUILTIN_AGENT_INDEX } from "../data/agents.ts"
import type { FallbackEntry, ModelRequirement, Variant } from "../shared/types.ts"
import {
  ORACLE_SLOT_NAMES,
  canonicalizeReviewAgentName,
  parseReviewAgentName,
  type OracleSlotName,
  type ReviewAgentIdentity,
  type ReviewLogicalTier,
} from "./names.ts"

export type ReviewAgentRegistrationOverrides = {
  description?: string
  permission?: Record<string, PermissionValue>
  tools?: Record<string, boolean>
  skills?: string[]
  promptAppend?: string
  temperature?: number
  topP?: number
  maxTokens?: number
  thinking?: { type: "enabled" | "disabled"; budgetTokens?: number }
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
}

export type ExpandedReviewAgent = {
  name: string
  identity: ReviewAgentIdentity
  sourceSlot: OracleSlotName | "reviewer"
  promptSource: "reviewer"
  requirement: ModelRequirement
  registration: ReviewAgentRegistrationOverrides
  resolutionSource: "user-config" | "agent-default"
  suppressCatalogUpgrade: boolean
}

export type ReviewAgentExpansionInput = {
  agents?: Record<string, AgentEntry>
  disabledAgents?: readonly string[]
}

function cloneEntry(entry: FallbackEntry): FallbackEntry {
  return {
    ...entry,
    providers: [...entry.providers],
    ...(entry.thinking ? { thinking: { ...entry.thinking } } : {}),
  }
}

function cloneRequirement(requirement: ModelRequirement): ModelRequirement {
  return {
    ...requirement,
    fallbackChain: requirement.fallbackChain.map(cloneEntry),
    ...(requirement.requiresProvider ? { requiresProvider: [...requirement.requiresProvider] } : {}),
  }
}

function withNativeVariant(requirement: ModelRequirement, variant: Variant): ModelRequirement {
  const cloned = cloneRequirement(requirement)
  return {
    ...cloned,
    variant,
    fallbackChain: cloned.fallbackChain.map((entry) => ({ ...entry, variant })),
  }
}

function replacePrimaryModel(requirement: ModelRequirement, model: string): ModelRequirement {
  const cloned = cloneRequirement(requirement)
  const parsed = parseModelString(model)
  const primary = cloned.fallbackChain[0]
  if (!primary) throw new Error("review profile has no primary fallback entry")
  cloned.fallbackChain[0] = { ...primary, providers: [...parsed.providers], model: parsed.model }
  if (cloned.requiresModel !== undefined) cloned.requiresModel = parsed.model
  if (cloned.requiresProvider !== undefined) {
    if (parsed.providers.length === 0) delete cloned.requiresProvider
    else cloned.requiresProvider = [...new Set(cloned.fallbackChain.flatMap((entry) => entry.providers))]
  }
  return cloned
}

function applyTierOverride(requirement: ModelRequirement, override: ReviewVariantOverride): ModelRequirement {
  if (typeof override === "string") return withNativeVariant(requirement, override)
  const withModel = override.model ? replacePrimaryModel(requirement, override.model) : cloneRequirement(requirement)
  return override.variant ? withNativeVariant(withModel, override.variant) : withModel
}
```

- [ ] **Step 6: Implement registration inheritance and disabled-slot policy**

Continue the same file:

```typescript
const REGISTRATION_KEYS = [
  "description", "tools", "permission", "skills", "promptAppend",
  "temperature", "topP", "maxTokens", "thinking", "reasoningEffort",
] as const

function registrationFrom(entry: AgentEntry | undefined, fallbackDescription?: string): ReviewAgentRegistrationOverrides {
  const registration: ReviewAgentRegistrationOverrides = {}
  if (fallbackDescription) registration.description = fallbackDescription
  if (!entry) return registration
  for (const key of REGISTRATION_KEYS) {
    const value = entry[key]
    if (value === undefined) continue
    if (Array.isArray(value)) (registration as Record<string, unknown>)[key] = [...value]
    else if (typeof value === "object" && value !== null) (registration as Record<string, unknown>)[key] = structuredClone(value)
    else (registration as Record<string, unknown>)[key] = value
  }
  return registration
}

function hasExplicitModelSelection(entry: AgentEntry | undefined): boolean {
  return !!entry && ["model", "fallbackModels", "requirement", "alias"].some((key) => entry[key as keyof AgentEntry] !== undefined)
}

function disabledNames(input: ReviewAgentExpansionInput): Set<string> {
  return new Set((input.disabledAgents ?? []).map((name) => canonicalizeReviewAgentName(name) ?? name))
}

export function isExpandedReviewAgentDisabled(name: string, input: ReviewAgentExpansionInput): boolean {
  const identity = parseReviewAgentName(name)
  if (!identity) return false
  const disabled = disabledNames(input)
  if (disabled.has(identity.canonicalName) || disabled.has(identity.canonicalSlot)) return true
  const normalEntry = input.agents?.[identity.canonicalSlot]
  return normalEntry?.disabled === true
}
```

The unsuffixed slot check intentionally cascades to tiers. Because `canonicalizeReviewAgentName("oracle-high")` remains `oracle-high`, disabling that runtime name does not disable `oracle-2nd`.

- [ ] **Step 7: Implement deterministic expansion**

Finish the file:

```typescript
function normalRequirement(
  slot: OracleSlotName | "reviewer",
  input: ReviewAgentExpansionInput,
): { requirement: ModelRequirement; source: "user-config" | "agent-default"; suppressCatalogUpgrade: boolean } | null {
  const configured = input.agents?.[slot]
  const builtin = BUILTIN_AGENT_INDEX.get(slot)
  if (!configured && !builtin) return null
  const normalized = normalizeAgentShorthand(slot, input.agents)
  if (configured?.disabled || normalized?.disabled) return null
  if (normalized?.requirement) {
    return { requirement: cloneRequirement(normalized.requirement), source: "user-config", suppressCatalogUpgrade: hasExplicitModelSelection(configured) }
  }
  if (configured && builtin?.defaultAlias && !configured.alias) {
    const alias = normalizeAgentShorthand(builtin.defaultAlias, input.agents)
    if (alias?.requirement) return { requirement: cloneRequirement(alias.requirement), source: "user-config", suppressCatalogUpgrade: true }
  }
  if (builtin) return { requirement: cloneRequirement(builtin.requirement), source: "agent-default", suppressCatalogUpgrade: false }
  throw new Error(`review slot ${slot} must resolve a normal model requirement before registration`)
}

function pushProfile(
  output: ExpandedReviewAgent[],
  slot: OracleSlotName | "reviewer",
  tier: ReviewLogicalTier,
  requirement: ModelRequirement,
  registration: ReviewAgentRegistrationOverrides,
  resolutionSource: "user-config" | "agent-default",
  suppressCatalogUpgrade: boolean,
  input: ReviewAgentExpansionInput,
): void {
  const name = tier === "normal" ? slot : `${slot}-${tier}`
  const identity = parseReviewAgentName(name)
  if (!identity || isExpandedReviewAgentDisabled(name, input)) return
  output.push({
    name: identity.canonicalName,
    identity,
    sourceSlot: slot,
    promptSource: "reviewer",
    requirement: cloneRequirement(requirement),
    registration: structuredClone(registration),
    resolutionSource,
    suppressCatalogUpgrade,
  })
}

export function expandReviewAgents(input: ReviewAgentExpansionInput = {}): ExpandedReviewAgent[] {
  const output: ExpandedReviewAgent[] = []
  const normalSlots: Array<OracleSlotName | "reviewer"> = [...ORACLE_SLOT_NAMES, "reviewer"]
  for (const slot of normalSlots) {
    const resolved = normalRequirement(slot, input)
    if (!resolved) continue
    const configured = input.agents?.[slot]
    const builtin = BUILTIN_AGENT_INDEX.get(slot)
    const registration = registrationFrom(configured, configured?.description ?? builtin?.description)
    pushProfile(output, slot, "normal", resolved.requirement, registration, resolved.source, resolved.suppressCatalogUpgrade, input)
    for (const tier of ["low", "high", "max"] as const) {
      const override = configured?.variants?.[tier]
      if (override === undefined) continue
      pushProfile(
        output,
        slot,
        tier,
        applyTierOverride(resolved.requirement, override),
        registration,
        "user-config",
        resolved.suppressCatalogUpgrade || (typeof override === "object" && override.model !== undefined),
        input,
      )
    }
  }
  output.sort((left, right) => {
    if (left.identity.role !== right.identity.role) return left.identity.role === "oracle" ? -1 : 1
    if (left.identity.ordinal !== right.identity.ordinal) return left.identity.ordinal - right.identity.ordinal
    const rank = { normal: 0, low: 1, high: 2, max: 3 } as const
    return rank[left.identity.logicalTier] - rank[right.identity.logicalTier]
  })
  return output
}

export function expandedReviewAgentMap(input: ReviewAgentExpansionInput = {}): ReadonlyMap<string, ExpandedReviewAgent> {
  return new Map(expandReviewAgents(input).map((profile) => [profile.name, profile]))
}
```

- [ ] **Step 8: Run GREEN expansion tests and typecheck**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/review-agents/names.test.ts src/review-agents/expand.test.ts src/config/normalize.test.ts
pnpm run typecheck
```

Expected: all tests pass; source objects remain deeply equal to their snapshots; typecheck exits 0.

- [ ] **Step 9: Integration report/checkpoint**

Report the built-in rename, exact expansion signatures, emitted default/configured profile order, model/variant inheritance evidence, disable cases, and non-mutation assertions. Tasks 5-8 are one generated-artifact boundary because the built-in rename changes Codex output; do not create an intermediate commit before Task 8 regenerates artifacts. Suggested semantic commit message: `feat: expand ordered review profiles`. Do not commit; separate explicit user authorization is required.

---

### Task 6: Register Expanded Profiles and Canonicalize Task Targets

**Files:**
- Modify: `src/hooks/config.ts`
- Modify: `src/hooks/config.test.ts`
- Modify: `src/permissions/index.ts`
- Modify: `src/permissions/index.test.ts`
- Modify: `src/permissions/subagent-git-guard.test.ts`

**Interfaces:**
- Consumes: the Task 5 `oracle-2nd` built-in, `expandReviewAgents()`, `isExpandedReviewAgentDisabled()`, `parseReviewAgentName()`, and the existing config-handler prompt/permission helpers.
- Produces: dynamic review profile registration, inherited runtime fields, slot-wide disable behavior for host entries, and pre-lookup rewrite of `task.args.subagent_type` from `oracle-second` to `oracle-2nd`.

- [ ] **Step 1: Replace old config tests with failing canonical registration tests**

Update the existing oracle-high assertions in `src/hooks/config.test.ts` and add:

- Default built-in, prompt-reuse, read-only permission, model, and disable assertions that referred to the former supplemental slot must now assert `oracle-2nd`.
- A test may mention runtime `oracle-high` only after its config fixture defines `agents.oracle.variants.high`.
- The existing disabled-agent test must use `oracle-2nd` to disable the second slot; add `oracle-high` separately only in the configured-tier test proving first-slot tier-only disable behavior.

```typescript
test("default config registers only normal review built-ins", async () => {
  const target: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: defaultConfig })(target, undefined)
  assert.ok(target.agent.oracle)
  assert.ok(target.agent["oracle-2nd"])
  assert.ok(target.agent.reviewer)
  assert.equal(target.agent["oracle-high"], undefined)
  assert.equal(target.agent["oracle-2nd-high"], undefined)
})

test("config registers canonical review profiles and no runtime alias duplicate", async () => {
  const config = {
    ...defaultConfig(),
    agents: {
      oracle: { variants: { high: "max" as const } },
      "oracle-3rd": { model: "anthropic/claude-opus-4-7", variants: { max: "max" as const } },
      reviewer: { variants: { low: "high" as const } },
    },
  }
  const target: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => config })(target, undefined)
  for (const name of ["oracle", "oracle-high", "oracle-2nd", "oracle-3rd", "oracle-3rd-max", "reviewer", "reviewer-low"]) {
    assert.ok(target.agent[name], name)
    assert.equal((target.agent[name] as Record<string, unknown>).mode, "subagent")
    assert.equal(((target.agent[name] as Record<string, unknown>).permission as Record<string, unknown>).task, "deny")
  }
  assert.equal(target.agent["oracle-second"], undefined)
})

test("generated tiers inherit review registration overrides", async () => {
  const config = {
    ...defaultConfig(),
    agents: {
      reviewer: {
        model: "openai/gpt-5.6-sol",
        tools: { read: true, task: false },
        permission: { webfetch: "allow" as const },
        skills: ["requesting-code-review"],
        promptAppend: "Inspect the complete diff.",
        temperature: 0.25,
        variants: { high: "max" as const },
      },
    },
  }
  const target: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => config })(target, undefined)
  const high = target.agent["reviewer-high"] as Record<string, unknown>
  assert.deepEqual(high.skills, ["requesting-code-review"])
  assert.equal(high.temperature, 0.25)
  assert.match(String(high.prompt), /Inspect the complete diff\./)
  assert.equal((high.permission as Record<string, unknown>).task, "deny")
  assert.equal((high.permission as Record<string, unknown>).webfetch, "allow")
})

test("slot disable cascades and disables pre-existing host profiles", async () => {
  const config = {
    ...defaultConfig(),
    agents: { oracle: { variants: { high: "max" as const } } },
    disabledAgents: ["oracle"],
  }
  const target = { agent: { oracle: { model: "host/model" }, "oracle-high": { model: "host/model" }, "oracle-2nd": { model: "host/second" } } }
  await createConfigHandler({ getConfig: () => config })(target, undefined)
  assert.equal((target.agent.oracle as Record<string, unknown>).disable, true)
  assert.equal((target.agent["oracle-high"] as Record<string, unknown>).disable, true)
  assert.notEqual((target.agent["oracle-2nd"] as Record<string, unknown>).disable, true)
})
```

- [ ] **Step 2: Add failing task-target and builtin-name tests**

Append to `src/permissions/index.test.ts` using the existing `createPermissionGuards()` fixture:

```typescript
test("task before-hook canonicalizes oracle-second before OpenCode agent lookup", async () => {
  const guards = createPermissionGuards({ getConfig: enabledConfig, projectRoot: process.cwd() })
  const input = { tool: "task", sessionID: "parent", args: { subagent_type: "oracle-second", prompt: "review" } }
  const output: Record<string, unknown> = {}
  await guards.before(input, output)
  assert.equal((output.args as Record<string, unknown>).subagent_type, "oracle-2nd")
})
```

Append to `src/permissions/subagent-git-guard.test.ts`:

```typescript
test("recognizes canonical and generated review profiles as builtins", () => {
  for (const name of ["oracle-2nd", "oracle-9th-max", "reviewer-low", "oracle-second"]) {
    assert.equal(isBuiltinAgentName(name), true, name)
  }
  assert.equal(isBuiltinAgentName("reviewer-2nd"), false)
})
```

- [ ] **Step 3: Run RED registration and permission tests**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/permissions/index.test.ts src/permissions/subagent-git-guard.test.ts
```

Expected: FAIL because config registration does not consume generated profiles and task arguments are not rewritten at the hook output surface.

- [ ] **Step 4: Register review profiles from the expansion result exactly once**

In `src/hooks/config.ts`:

1. Skip parsed review built-ins in the existing `BUILTIN_AGENTS` loop.
2. Before custom-agent registration, iterate `expandReviewAgents({ agents: cfg.agents, disabledAgents: cfg.disabledAgents })`.
3. Construct an `Agent` from each profile's name/description/requirement/prompt source.
4. Select a catalog model only when `suppressCatalogUpgrade` is false.
5. Apply inherited registration values and append `promptAppend` after the composed role/model prompt.
6. Exclude every config key for which `parseReviewAgentName(name)` is non-null from the ordinary custom-agent loop; normal review slots and generated tiers are owned only by expansion.

Use this exact loop:

```typescript
for (const profile of expandReviewAgents({ agents: cfg.agents, disabledAgents: cfg.disabledAgents })) {
  const synthetic: Agent = {
    name: profile.name,
    ...(profile.registration.description ? { description: profile.registration.description } : {}),
    requirement: profile.requirement,
    promptSource: profile.promptSource,
  }
  const existingModel = rawAgentModel(agentMap, profile.name)
  const catalogModel = !existingModel && !profile.suppressCatalogUpgrade
    ? selectCatalogModel(target, profile.name, profile.requirement)
    : undefined
  const finalModel = existingModel ?? catalogModel ?? fmtModel(profile.requirement.fallbackChain[0]!)
  let prompt = promptForBuiltinAgent(synthetic, { requirement: profile.requirement }, cfg.workflow, finalModel)
  if (profile.registration.promptAppend) prompt = `${prompt}\n\n${profile.registration.promptAppend.trim()}`
  applyAgentEntry(agentMap, synthetic, {
    ...(profile.registration.description ? { description: profile.registration.description } : {}),
    requirement: profile.requirement,
    ...(profile.registration.permission ? { permission: profile.registration.permission } : {}),
  }, { mode: "subagent", model: finalModel, prompt }, profile.registration)
}
```

Extend `applyAgentEntry()` with a final `registration?: ReviewAgentRegistrationOverrides` parameter. Copy `skills`, `temperature`, `topP`, `maxTokens`, `thinking`, and `reasoningEffort` only when the host entry has not already set them. Merge `tools` into permission through the same true/false conversion used by `normalizeShorthand()`. Preserve host-defined model/prompt/description precedence.

- [ ] **Step 5: Apply disabled policy to host entries and parser-based permissions**

Before registration, mark matching existing host agents disabled:

```typescript
for (const [name, raw] of Object.entries(agentMap)) {
  const review = parseReviewAgentName(name)
  const disabledReview = review && isExpandedReviewAgentDisabled(name, {
    agents: cfg.agents,
    disabledAgents: cfg.disabledAgents,
  })
  if ((disabled.has(name) || disabledReview) && isRecord(raw)) raw.disable = true
}
```

In `registerDefaultPermissions()`, replace the static review names with:

```typescript
for (const [name, entry] of Object.entries(agentMap)) {
  if (isRecord(entry) && (isReviewAgentName(name) || name === "plan-critic")) {
    mergePermission(entry, { task: "deny" }, false)
  }
}
```

Keep doc/code search and other read-only agents in their existing separate list.

- [ ] **Step 6: Canonicalize the runtime task alias and builtin checks**

At the beginning of `permissionGuards.before`, before depth/permission evaluation, call `canonicalizeTaskSubagentType(rawInput, rawOutput)`. Use the same `rawOutput.args` mutation contract already exercised by `rewriteWebfetchRedirect()` and `truncateQuestionLabels()`:

```typescript
function canonicalizeTaskSubagentType(rawInput: unknown, rawOutput: unknown): void {
  if (toolName(rawInput) !== "task") return
  const args = mutableArgs(rawInput, rawOutput)
  if (!args || typeof args.subagent_type !== "string") return
  const canonical = canonicalizeReviewAgentName(args.subagent_type)
  if (canonical && canonical !== args.subagent_type) args.subagent_type = canonical
}
```

Update `isBuiltinAgentName()`:

```typescript
export function isBuiltinAgentName(name: string): boolean {
  return BUILTIN_AGENT_INDEX.has(name) || name === "explore" || isReviewAgentName(name)
}
```

`canonicalizeReviewAgentName()` changes only `oracle-second` among accepted aliases; canonical runtime names remain unchanged. `isBuiltinAgentName()` consumes the shared review grammar solely for builtin recognition and does not maintain or extend a subagent-git-guard alias set. Neither path reinterprets legacy config or registers a duplicate profile.

- [ ] **Step 7: Run GREEN registration tests and typecheck**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/review-agents/expand.test.ts src/hooks/config.test.ts src/permissions/index.test.ts src/permissions/subagent-git-guard.test.ts
pnpm run typecheck
```

Expected: all selected tests pass; default registration contains `oracle-2nd` but not default `oracle-high`; configured tiers inherit fields; typecheck exits 0.

- [ ] **Step 8: Integration report/checkpoint**

Report built-in catalog changes, registered profile names, host-disable evidence, task alias rewrite, permissions, tests, and typecheck. Tasks 5-8 form one generated-artifact boundary; do not authorize or create an intermediate commit before Task 8 regenerates Codex. Suggested eventual semantic commit message: `feat: register ordered oracle review profiles`. Do not commit; separate explicit user authorization is required.

---

### Task 7: Route Expanded Profiles and Preserve Review Floors

**Files:**
- Modify: `src/routing/resolver.ts`
- Modify: `src/routing/resolver.test.ts`
- Modify: `src/routing/model-upgrades.ts`
- Modify: `src/routing/model-upgrades.test.ts`
- Modify: `src/hooks/chat-params.ts`
- Modify: `src/hooks/chat-params.test.ts`
- Modify: `src/runtime-fallback/event-handler.ts`
- Modify: `src/runtime-fallback/event-handler-fallback-dispatch.test.ts`

**Interfaces:**
- Consumes: `expandedReviewAgentMap()`, `parseReviewAgentName()`, canonical disabled policy, current `Resolution`, and the existing family-specific review output floor.
- Produces: `ResolveOpts.disabledAgents?: readonly string[]`, expanded review requirement resolution, canonical-slot catalog lane selection, parsed review floor enforcement, and an independent explicit `plan-critic` floor branch.

- [ ] **Step 1: Add failing resolver tests for normal/tier/alias/disabled requirements**

Replace old built-in `oracle-high` assumptions in `src/routing/resolver.test.ts` and add:

- Change former second-slot default resolution assertions from `oracle-high` to `oracle-2nd`.
- Keep `oracle-high` only in fixtures that define `agents.oracle.variants.high`; those assertions must resolve the first slot's generated high requirement.

```typescript
test("review routing resolves generated tiers and runtime alias from one expansion", () => {
  const agentsConfig = {
    oracle: {
      model: "openai/gpt-5.6-terra",
      fallbackModels: ["anthropic/claude-opus-4-7"],
      variants: {
        low: "low" as const,
        max: { model: "openai/gpt-5.6-sol", variant: "max" as const },
      },
    },
  }
  const low = resolveModelRouting({
    agentName: "oracle-low", providerID: "anthropic", modelID: "claude-opus-4-7", agentsConfig,
  })
  assert.equal(low?.source, "user-config")
  assert.equal(low?.variant, "low")

  const max = resolveModelRouting({
    agentName: "oracle-max", providerID: "openai", modelID: "gpt-5.6-sol", agentsConfig,
  })
  assert.equal(max?.entry.model, "gpt-5.6-sol")
  assert.equal(max?.variant, "max")

  const second = resolveModelRouting({
    agentName: "oracle-second", providerID: "openai", modelID: "gpt-5.5", agentsConfig,
  })
  assert.equal(second?.source, "agent-default")
})

test("disabled review profile does not resolve", () => {
  assert.equal(resolveModelRouting({
    agentName: "oracle-high",
    providerID: "openai",
    modelID: "gpt-5.6-terra",
    agentsConfig: { oracle: { variants: { high: "max" } } },
    disabledAgents: ["oracle-high"],
  }), null)
})
```

- [ ] **Step 2: Add failing catalog-lane tests based on canonical slot identity**

Replace the old `oracle-high` lane test in `src/routing/model-upgrades.test.ts`:

The former Sol-lane assertion becomes `oracle-2nd`; a new `oracle-high` assertion uses the first slot and therefore expects the same Terra lane as `oracle`.

```typescript
test("review catalog lanes ignore logical tier suffixes", () => {
  const target = { provider: { openai: { models: {
    "gpt-5.7-sol": {}, "gpt-5.7-terra": {},
  } } } }
  const oracle = BUILTIN_AGENT_INDEX.get("oracle")!.requirement
  const second = BUILTIN_AGENT_INDEX.get("oracle-2nd")!.requirement
  assert.equal(selectCatalogModel(target, "oracle-low", oracle), "openai/gpt-5.7-terra")
  assert.equal(selectCatalogModel(target, "oracle-high", oracle), "openai/gpt-5.7-terra")
  assert.equal(selectCatalogModel(target, "oracle-2nd-max", second), "openai/gpt-5.7-sol")
  assert.equal(selectCatalogModel(target, "reviewer-high", BUILTIN_AGENT_INDEX.get("reviewer")!.requirement), "openai/gpt-5.7-sol")
})

test("later Oracle slots receive no invented GPT lane", () => {
  const requirement = { fallbackChain: [{ providers: ["openai"], model: "gpt-5.5", variant: "xhigh" as const }] }
  const target = { provider: { openai: { models: { "gpt-5.7-sol": {}, "gpt-5.7-terra": {} } } } }
  assert.equal(selectCatalogModel(target, "oracle-3rd", requirement), undefined)
})
```

- [ ] **Step 3: Add failing chat-floor tests for every parsed identity**

Update `src/hooks/chat-params.test.ts`:

```typescript
test("logical low review profiles retain the xhigh-equivalent safety floor", async () => {
  const config = {
    ...defaultConfig(),
    agents: {
      oracle: { model: "openai/gpt-5.6-terra", variants: { low: "low" as const } },
      "oracle-2nd": { model: "openai/gpt-5.6-sol", variants: { low: "minimal" as const } },
      reviewer: { model: "openai/gpt-5.6-sol", variants: { low: "low" as const } },
    },
  }
  for (const agentName of ["oracle-low", "oracle-2nd-low", "reviewer-low", "oracle-second"] as const) {
    const output = { options: {} as Record<string, unknown> }
    const modelID = agentName === "oracle-second" ? "gpt-5.6-sol" : agentName === "oracle-low" ? "gpt-5.6-terra" : "gpt-5.6-sol"
    await createChatParamsHandler({ getConfig: () => config })(makeInput({ agentName, modelID }), output)
    assert.equal(output.options.reasoningEffort, "xhigh", agentName)
  }
})

test("plan-critic floor remains independent of review-name parsing", async () => {
  const output = { options: {} as Record<string, unknown> }
  await createChatParamsHandler({ getConfig: () => defaultConfig() })(makeInput({ agentName: "plan-critic", modelID: "gpt-5.5" }), output)
  assert.equal(output.options.reasoningEffort, "xhigh")
})

test("generated non-GPT review tiers receive family-specific floors", async () => {
  const config = OcmmConfigSchema.parse({
    agents: {
      oracle: {
        model: "anthropic/claude-opus-4-6",
        variant: "minimal",
        variants: { high: { model: "google/gemini-3.1-pro", variant: "minimal" } },
      },
      reviewer: {
        model: "google/gemini-3.1-pro",
        variants: { low: { model: "zhipu/glm-5.2", variant: "minimal" } },
      },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => config })
  const gemini: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "oracle-high", providerID: "google", modelID: "gemini-3.1-pro" }), gemini)
  assert.deepEqual(gemini, { options: { reasoningEffort: "high", thinking: { type: "enabled" } } })

  const glm: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "reviewer-low", providerID: "zhipu", modelID: "glm-5.2" }), glm)
  assert.deepEqual(glm, { options: { reasoningEffort: "xhigh", thinking: { type: "enabled" } } })
})
```

Update the existing `chat.params applies review floors after explicit non-GPT high-effort controls` fixture in the same file: remove its raw `agents["oracle-high"]` entry, express that GLM route as `agents.oracle.variants.high`, and keep its Gemini, Claude, GLM, and independent `plan-critic` assertions. No test may pass legacy config directly to `OcmmConfigSchema.parse()`.

- [ ] **Step 4: Run the RED routing test set**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/routing/resolver.test.ts src/routing/model-upgrades.test.ts src/hooks/chat-params.test.ts src/runtime-fallback/event-handler-fallback-dispatch.test.ts
```

Expected: FAIL because the resolver and floor still use static names and the lane map still assigns old `oracle-high` semantics.

- [ ] **Step 5: Resolve review agents from expansion before ordinary built-ins/categories**

In `src/routing/resolver.ts`, extend both option types:

```typescript
export type ResolveOpts = {
  agentName?: string
  modelID: string
  providerID?: string
  inputVariant?: string
  agentsConfig?: Record<string, AgentEntry>
  categoriesConfig?: Record<string, CategoryEntry>
  disabledAgents?: readonly string[]
}
```

At the start of `resolveEffectiveRequirement()` canonicalize runtime names and consume expansion:

```typescript
const reviewIdentity = parseReviewAgentName(agentName)
if (reviewIdentity) {
  const profile = expandedReviewAgentMap({ agents: agentsConfig, disabledAgents }).get(reviewIdentity.canonicalName)
  return profile
    ? { requirement: profile.requirement, source: profile.resolutionSource }
    : null
}
const canonicalName = AGENT_ALIASES.get(agentName) ?? agentName
```

Add `disabledAgents?: readonly string[]` to `resolveEffectiveRequirement()` and pass it from `resolveModelRouting()`. Keep the existing `explore → code-search` compatibility alias for non-review agents. Do not reconstruct tier requirements in this file.

- [ ] **Step 6: Select GPT lanes from `canonicalSlot`, not runtime suffix**

In `src/routing/model-upgrades.ts`, remove static `oracle-high` mapping and add:

```typescript
function gptLaneForAgent(agentName: string): "sol" | "terra" | undefined {
  const review = parseReviewAgentName(agentName)
  if (review?.role === "reviewer") return "sol"
  if (review?.canonicalSlot === "oracle") return "terra"
  if (review?.canonicalSlot === "oracle-2nd") return "sol"
  if (review) return undefined
  return GPT_LANE_BY_AGENT.get(agentName)
}
```

Use `gptLaneForAgent(agentName)` in `selectCatalogModel()`. Apply the exact cross-generation-entry preference only when `parseReviewAgentName(agentName)?.canonicalSlot === "oracle"`; logical tier suffixes do not change that slot policy. Later slots return no GPT lane and rely on their explicit configured requirement.

- [ ] **Step 7: Replace static chat review names with parser plus explicit plan-critic**

In `src/hooks/chat-params.ts`:

```typescript
function isReviewFloorAgent(agentName: string | undefined): boolean {
  return agentName === "plan-critic" || (agentName !== undefined && parseReviewAgentName(agentName) !== null)
}

function requiresReviewVariantFloor(agentName: string | undefined, family: string): boolean {
  return isReviewFloorAgent(agentName) && REVIEW_VARIANT_FLOOR_FAMILIES.has(family)
}
```

Delete the static `REVIEW_AGENTS`. Pass `disabledAgents: cfg.disabledAgents` to `resolveModelRouting()`. Keep `floorReviewVariant()`, native GPT-5.6 `max` handling, and family-specific output floors unchanged.

- [ ] **Step 8: Pass expanded/disabled config to runtime fallback resolution**

In every `resolveEffectiveRequirement()` call in `src/runtime-fallback/event-handler.ts`, add:

```typescript
disabledAgents: cfg.disabledAgents,
```

Add a regression in `event-handler-fallback-dispatch.test.ts` proving a disabled generated review tier is not assigned a fallback requirement and does not dispatch. Do not edit the classifier or create interruption logic in this task.

- [ ] **Step 9: Run GREEN routing tests and typecheck**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/review-agents/names.test.ts src/review-agents/expand.test.ts src/routing/resolver.test.ts src/routing/model-upgrades.test.ts src/hooks/chat-params.test.ts src/runtime-fallback/event-handler-fallback-dispatch.test.ts
pnpm run typecheck
```

Expected: all selected tests pass; logical low outputs remain xhigh-equivalent; plan-critic still floors; typecheck exits 0.

- [ ] **Step 10: Integration report/checkpoint**

Report resolver signatures, canonical lane results, logical-low floor evidence, plan-critic regression, runtime fallback disabled behavior, and test output. Tasks 5-8 remain one atomic generated-artifact boundary. Suggested eventual semantic commit message: `feat: route ordered review variants`. Do not commit; separate explicit user authorization is required.

---

### Task 8: Generate Canonical Codex Review Profiles and Ordered Guidance

**Files:**
- Modify: `src/codex/plugin-generator.ts`
- Modify: `src/codex/plugin-generator.test.ts`
- Generate: `.agents/plugins/marketplace.json`
- Generate: `.codex/agents/**`
- Generate: `plugins/deepwork/**`

**Interfaces:**
- Consumes: the filtered expanded profile set registered by `createConfigHandler()`, `resolveEffectiveRequirement()`, and `parseReviewAgentName()`.
- Produces: canonical `dw-oracle-2nd`, configured tier/later-slot profiles, no `dw-oracle-second`, parser-based review floors, and model-facing ordered priority/logical tier guidance.

- [ ] **Step 1: Rewrite Codex tests to express the new canonical default surface**

In `src/codex/plugin-generator.test.ts`, replace old supplemental-profile assertions and add:

Before adding the new cases, migrate every existing `oracle-high` fixture deterministically:

- Former built-in/supplemental-slot model, alias, prompt, file, and reasoning assertions become `oracle-2nd` / `dw-oracle-2nd`.
- A case intentionally testing the new first-slot logical-high route moves its override under `agents.oracle.variants.high` and keeps runtime/source name `oracle-high` / `dw-oracle-high`.
- Default generation assertions delete `dw-oracle-high`; configured-tier assertions create it explicitly.
- Fixed third-review/supplemental guidance assertions are removed and replaced by the ordered/tier contract below.

```typescript
test("Codex emits canonical default review slots without legacy or alias duplicates", async () => {
  const agents = await buildCodexAgents({
    config: { ...defaultConfig(), workflow: "codex" },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })
  const names = new Set(agents.map((agent) => agent.name))
  assert.equal(names.has("dw-oracle"), true)
  assert.equal(names.has("dw-oracle-2nd"), true)
  assert.equal(names.has("dw-reviewer"), true)
  assert.equal(names.has("dw-oracle-high"), false)
  assert.equal(names.has("dw-oracle-second"), false)
})

test("Codex emits only configured logical tiers and later Oracle slots", async () => {
  const config = {
    ...defaultConfig(),
    workflow: "codex" as const,
    agents: {
      oracle: { variants: { high: "max" as const } },
      "oracle-3rd": { model: "openai/gpt-5.6-sol", variants: { max: "max" as const } },
      reviewer: { variants: { low: "low" as const } },
    },
  }
  const agents = await buildCodexAgents({ config, cwd: process.cwd(), skillsRoot: join(process.cwd(), "skills") })
  const names = agents.map((agent) => agent.name)
  for (const name of ["dw-oracle-high", "dw-oracle-3rd", "dw-oracle-3rd-max", "dw-reviewer-low"]) assert.ok(names.includes(name), name)
  assert.equal(names.includes("dw-oracle-low"), false)
  assert.equal(names.includes("dw-reviewer-2nd"), false)
})
```

- [ ] **Step 2: Add failing Codex floor and workflow-copy tests**

Append:

```typescript
test("Codex review floors use parsed identities and preserve GPT-5.6 native max", async () => {
  const config = {
    ...defaultConfig(),
    workflow: "codex" as const,
    agents: {
      oracle: { model: "openai/gpt-5.6-terra", variants: { low: "low" as const, max: "max" as const } },
      "oracle-2nd": { model: "openai/gpt-5.5", variants: { low: "minimal" as const } },
      reviewer: { model: "openai/gpt-5.6-sol", variants: { max: "max" as const } },
    },
  }
  const agents = await buildCodexAgents({ config, cwd: process.cwd(), skillsRoot: join(process.cwd(), "skills") })
  const effort = new Map(agents.map((agent) => [agent.sourceName, agent.reasoningEffort]))
  assert.equal(effort.get("oracle-low"), "xhigh")
  assert.equal(effort.get("oracle-max"), "max")
  assert.equal(effort.get("oracle-2nd-low"), "xhigh")
  assert.equal(effort.get("reviewer-max"), "max")
})

test("generated workflow describes ordered priority and per-role tiers without capability ranking", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-ordered-review-"))
  try {
    await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, ".codex", "agents"),
      config: { ...defaultConfig(), workflow: "codex" },
      packageVersion: "9.9.9",
    })
    const skill = readFileSync(join(root, "plugins", "deepwork", "skills", "deepwork", "SKILL.md"), "utf8")
    assert.match(skill, /Oracle priority.*oracle.*oracle-2nd/is)
    assert.match(skill, /logical tier.*low.*normal.*high.*max/is)
    assert.match(skill, /configuring multiple.*does not.*fan-out/is)
    assert.match(skill, /runtime-safety.*max.*high.*normal/is)
    assert.doesNotMatch(skill, /supplemental high-intensity|stronger Oracle|triple-review/i)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 3: Run RED Codex tests**

```powershell
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
try {
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
```

Expected: FAIL because the generator still expects the old static `oracle-high` built-in and guidance.

- [ ] **Step 4: Remove duplicate requirement resolution and consume canonical expansion**

In `src/codex/plugin-generator.ts`:

- Delete local `AGENT_ALIASES`, `requirementForName()`, and recursive `resolveRequirementForName()`.
- Resolve each generated source name through the shared resolver:

```typescript
const effective = resolveEffectiveRequirement({
  agentName: sourceName,
  agentsConfig: args.config.agents,
  categoriesConfig: args.config.categories,
  disabledAgents: args.config.disabledAgents,
})
const requirement = effective?.requirement ?? null
```

- Keep non-review category resolution through the shared resolver; do not implement another tier/model clone.
- In `codexReasoningEffort()`, replace the static review condition with:

```typescript
const reviewFloor = args.sourceName === "plan-critic" || parseReviewAgentName(args.sourceName) !== null
if (reviewFloor && isGptCodex) return gated === "xhigh" || gated === "max" ? gated : "xhigh"
```

- Sort Oracle guidance by `identity.ordinal`; tier choice never reorders slots.

- [ ] **Step 5: Replace old supplemental copy with exact ordered semantics**

Render these statements in `renderWorkflowSkill()` and `codexAgentInstructions()`:

```markdown
### Ordered Oracle review

- Oracle slots are model priority, not capability ranking: `dw-oracle`, then `dw-oracle-2nd` through configured later slots.
- The unsuffixed profile is logical `normal`; configured `-low`, `-high`, and `-max` profiles select task rigor independently of slot priority.
- Simple final acceptance selects the first available Oracle normal profile.
- Complex cross-module final acceptance selects the first available Oracle plus Reviewer; for each role choose configured `high`, falling back to unsuffixed `normal` when `high` is absent.
- Security, performance, data-loss, release, or runtime-safety review selects configured `max`, otherwise configured `high`, otherwise unsuffixed `normal`.
- Logical `low` is selected only by an explicit user/workflow cost-or-latency request and still receives the review-effort floor.
- Additional Oracle passes select later configured slots in order only when additional independent evidence is explicitly needed.
- Configuring several Oracle profiles never dispatches them automatically.
- Reviewer has logical tier variants only and has no ordinal profiles.
```

Remove every active phrase that treats `oracle-high` as a third, stronger, supplemental, high-intensity, or max-default reviewer. `dw-oracle-high` may appear only as the generated first-slot logical-high profile when configured.

- [ ] **Step 6: Run GREEN Codex tests and regenerate all Codex artifacts**

```powershell
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
try {
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts src/hooks/config.test.ts src/routing/resolver.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'Codex focused tests failed' }
  pnpm run build:ts
  if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed before Codex staging' }
  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw 'Codex generation failed' }
  if (-not (Test-Path -LiteralPath '.codex/agents/dw-oracle-2nd.toml')) { throw 'missing dw-oracle-2nd' }
  if (Test-Path -LiteralPath '.codex/agents/dw-oracle-second.toml') { throw 'alias profile must not exist' }
  if (Test-Path -LiteralPath '.codex/agents/dw-oracle-high.toml') { throw 'default logical-high profile must not exist without variants.high' }
  pnpm run typecheck
  if ($LASTEXITCODE -ne 0) { throw 'typecheck failed' }
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
```

Expected: tests pass; generation succeeds; `dw-oracle-2nd.toml` exists in both generated agent directories; alias/default-high checks do not throw; typecheck exits 0.

- [ ] **Step 7: Integration report/checkpoint**

Report source profile list, generated profile list, floor assertions, stale-copy scan, artifact paths, and typecheck. Suggested semantic commit message for Tasks 5-8 as one separately authorized boundary: `feat: add ordered oracle review variants`. Do not commit; separate explicit user authorization is required.

---

### Task 9: Replace Fixed Triple Review with Ordered Oracle Selection in Skills

**Files:**
- Modify: `skills/v1/requesting-code-review/SKILL.md`
- Modify: `skills/v1/subagent-driven-development/SKILL.md`
- Modify: `docs/v1-maintenance.md`
- Modify: `docs/prompt-sync.md`
- Modify: `src/intent/plan-review-contract.test.ts`
- Generate: `.agents/plugins/marketplace.json`
- Generate: `.codex/agents/**`
- Generate: `plugins/deepwork/**`

**Interfaces:**
- Consumes: canonical profile names and ordered/tier guidance from Task 8.
- Produces: workflow-facing first-available/first-N selection rules, per-role logical-tier choice, and no fixed triple-review or capability-ranked `oracle-high` semantics.

- [ ] **Step 1: Add failing active-skill contract tests**

Append to `src/intent/plan-review-contract.test.ts`:

```typescript
test("review skills use ordered Oracle priority and logical tiers", () => {
  for (const path of [
    "skills/v1/requesting-code-review/SKILL.md",
    "skills/v1/subagent-driven-development/SKILL.md",
  ]) {
    const text = readFileSync(join(process.cwd(), path), "utf8")
    assert.match(text, /oracle-2nd.*priority/is, path)
    assert.match(text, /low.*normal.*high.*max/is, path)
    assert.match(text, /first available.*Oracle/is, path)
    assert.match(text, /additional.*Oracle.*in order/is, path)
    assert.match(text, /runtime-safety.*max.*high.*normal/is, path)
    assert.doesNotMatch(text, /triple review|third reviewer|supplemental high-effort|high-intensity reviewer/i, path)
  }
})
```

- [ ] **Step 2: Run the RED skill contract test**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/intent/plan-review-contract.test.ts
```

Expected: FAIL because both skills still prescribe optional fixed triple review with old `oracle-high` semantics.

- [ ] **Step 3: Replace the Reviewer Selection section exactly**

In `skills/v1/requesting-code-review/SKILL.md`, replace the old agent/task-shape/dispatch tables with:

```markdown
## Reviewer Selection

Review selection has two independent axes:

1. **Role/model priority** — Oracle slots are ordered `oracle`, `oracle-2nd`, through configured `oracle-9th`. Later means lower selection priority, never greater capability.
2. **Logical rigor** — each configured Oracle slot and `reviewer` may expose `low`, `normal`, `high`, or `max`. `normal` is unsuffixed; other tiers exist only when configured.

| Work shape | Default independent evidence |
|---|---|
| Simple / single-stage | first available Oracle slot at logical `normal` |
| Complex / cross-module | first available Oracle slot + `reviewer`; select configured `high` for each role, otherwise unsuffixed `normal` |
| Security, performance, data-loss, release, or runtime-safety | first available Oracle slot + `reviewer`; select configured `max`, otherwise configured `high`, otherwise unsuffixed `normal` |
| Additional independent evidence explicitly needed | add later configured Oracle slots in ordinal order; do not skip an available earlier slot without a concrete reason |
| User override | use the explicitly requested roles/tiers subject to availability, disabled state, and review-effort floors |

Configuring several Oracle slots or tiers never causes automatic fan-out. A higher logical tier may be selected without adding reviewers, and adding a later Oracle does not imply that it is stronger. Reviewer exposes tiers only; `reviewer-2nd` and later ordinals do not exist.
```

Update the reasoning policy so every parsed Oracle/Reviewer profile retains the xhigh-equivalent floor, logical low included. Keep the separate `plan-critic` receipt statement.

- [ ] **Step 4: Replace Final Acceptance Review selection and dispatch**

In `skills/v1/subagent-driven-development/SKILL.md`, use:

```markdown
| Complexity | Reviewer selection |
|---|---|
| Simple | first available Oracle at `normal` |
| Complex / cross-module | first available Oracle + `reviewer`, in parallel; configured `high` otherwise unsuffixed `normal` |
| Security, performance, data-loss, release, or runtime-safety | first available Oracle + `reviewer`, in parallel; configured `max`, otherwise configured `high`, otherwise unsuffixed `normal` |
| Additional evidence required | add the next configured/available Oracle slots in ordinal order |

The orchestrator makes this explicit selection after all tasks integrate. It must not fan out merely because several slots or tiers are registered. Collect every intentionally requested review before processing findings. A later Oracle is another configured model perspective, not a stronger reviewer.
```

Remove the fixed three-reviewer branch and all statements that old `oracle-high` is optional supplemental capacity.

- [ ] **Step 5: Synchronize maintenance documents**

In `docs/v1-maintenance.md`, update the `requesting-code-review` and `subagent-driven-development` rows with ordered Oracle priority and logical tiers, preserving their upstream/version metadata. In `docs/prompt-sync.md`, replace the `oracle-high` functional-agent row and the 2026-07-14 supplemental-review history in active mapping with:

```markdown
| Oracle slot family | (derived from reviewer prompt) | `oracle` and `oracle-2nd` are built-in ordered model slots; configured `oracle-3rd` through `oracle-9th` and logical tier profiles reuse `reviewer` via expansion. Priority does not imply capability. |
```

Keep the historical design/plan files unchanged and note that the 2026-07-15 design supersedes active `oracle-high` semantics.

- [ ] **Step 6: Run GREEN contracts and regenerate Codex**

```powershell
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
try {
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  node --test --experimental-strip-types --test-reporter=spec src/intent/plan-review-contract.test.ts src/intent/prompt-loader.test.ts src/codex/plugin-generator.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'review contract tests failed' }
  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw 'Codex generation failed' }
  rg -n "triple review|third reviewer|supplemental high-effort|high-intensity reviewer" skills/v1/requesting-code-review skills/v1/subagent-driven-development docs/v1-maintenance.md docs/prompt-sync.md plugins/deepwork/skills
  if ($LASTEXITCODE -eq 0) { throw 'stale active review semantics remain' }
  if ($LASTEXITCODE -gt 1) { throw 'active review semantics scan failed to run' }
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
```

Expected: tests pass; generator succeeds; `rg` returns exit 1 and the guard does not throw.

- [ ] **Step 7: Integration report/checkpoint**

Report changed skill sections, maintenance rows, generated files, RED/GREEN evidence, and stale-copy scan. Suggested semantic commit message: `docs: order oracle acceptance reviews`. Do not commit; separate explicit user authorization is required.

---

### Task 10: Extend the Existing 429 Controller with Durable Interruption Correlation

**Files:**
- Create: `src/shared/opencode-events.ts`
- Create: `src/shared/opencode-events.test.ts`
- Modify: `src/runtime-fallback/subagent-429-controller.ts`
- Create: `src/runtime-fallback/subagent-429-controller-interruption.test.ts`
- Modify: `src/runtime-fallback/event-handler.ts`
- Modify: `src/runtime-fallback/event-handler-support.ts`
- Create: `src/runtime-fallback/event-handler-interruption-recovery.test.ts`
- Modify: `src/permissions/index.ts`
- Modify: `src/permissions/index.test.ts`

**Interfaces:**
- Consumes: the sanitized live evidence from Task 2 and the integrated `Subagent429Controller` from Task 1.
- Produces: `SessionLineage`, `TaskPartInterruptionEvidence`, `resolveSessionLineageProperties(props)`, `resolveSessionLineage(raw)`, `resolveTaskPartInterruption(raw)`, exact `SubagentInterruptionCorrelation`, durable child records keyed by child session ID, and correlation methods on the one existing controller.
- Runtime-truth adaptation: OpenCode `1.18.3` may validly produce `terminalParentTaskPart: null` and `taskIDObserved: null` for the transport child. Fixture-driven Task 10 decoder/output tests branch on that observed no-terminal-part shape instead of stopping or fabricating a task ID; the safety rule against child-session-ID substitution remains unchanged.

- [ ] **Step 1: Write failing current/legacy event decoder tests**

Create `src/shared/opencode-events.test.ts`:

```typescript
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  resolveSessionLineage,
  resolveSessionLineageProperties,
  resolveTaskPartInterruption,
} from "./opencode-events.ts"

const liveFixture = JSON.parse(readFileSync(
  new URL("../runtime-fallback/fixtures/opencode-task-interruption.json", import.meta.url),
  "utf8",
)) as {
  sessionCreated: unknown
  terminalParentTaskPart: unknown
  taskIDObserved: string | null
}

test("decodes the sanitized live fixture without inventing task identity", () => {
  const lineage = resolveSessionLineage(liveFixture.sessionCreated)
  const task = resolveTaskPartInterruption(liveFixture.terminalParentTaskPart)
  assert.ok(lineage?.sessionID)
  if (liveFixture.terminalParentTaskPart === null) {
    assert.equal(task, null)
    assert.equal(liveFixture.taskIDObserved, null)
    return
  }
  assert.equal(task?.terminalTaskErrorObserved, true)
  const terminal = liveFixture.terminalParentTaskPart as {
    part?: { state?: { input?: { task_id?: string } } }
  }
  assert.equal(task?.taskID, terminal.part?.state?.input?.task_id)
  if (task?.taskID !== undefined) assert.equal(task.taskID, liveFixture.taskIDObserved)
})

test("resolves current nested and legacy flat session lineage", () => {
  assert.deepEqual(resolveSessionLineage({
    event: { type: "session.created", properties: { info: { id: "child", parentID: "parent" } } },
  }), { sessionID: "child", parentSessionID: "parent" })
  for (const key of ["parentID", "parentId", "parentSessionID", "parentSessionId"] as const) {
    assert.deepEqual(resolveSessionLineage({
      event: { type: "session.created", properties: { sessionID: `child-${key}`, [key]: "parent" } },
    }), { sessionID: `child-${key}`, parentSessionID: "parent" })
  }
  assert.deepEqual(resolveSessionLineageProperties({ session: { id: "child" }, parentSessionId: "parent" }), {
    sessionID: "child",
    parentSessionID: "parent",
  })
})

test("decodes a terminal parent task part with child session identity", () => {
  assert.deepEqual(resolveTaskPartInterruption({
    event: {
      type: "message.part.updated",
      properties: {
        sessionID: "parent",
        part: {
          id: "prt_1",
          sessionID: "parent",
          type: "tool",
          tool: "task",
          callID: "call_provider_1",
          state: {
            status: "error",
            error: "Tool execution aborted",
            input: { subagent_type: "oracle-second", task_id: "tsk_resume_1" },
            metadata: { sessionId: "child", interrupted: true },
          },
        },
      },
    },
  }), {
    childSessionID: "child",
    parentSessionID: "parent",
    parentPartID: "prt_1",
    callID: "call_provider_1",
    agent: "oracle-second",
    taskID: "tsk_resume_1",
    terminalTaskErrorObserved: true,
    transportInterrupted: true,
    errorText: "Tool execution aborted",
  })
})

test("ignores completed non-task malformed and child-less task parts", () => {
  for (const raw of [
    {},
    { event: { type: "message.part.updated", properties: { part: { type: "tool", tool: "read", state: { status: "error" } } } } },
    { event: { type: "message.part.updated", properties: { sessionID: "p", part: { type: "tool", tool: "task", state: { status: "completed", metadata: { sessionId: "c" } } } } } },
    { event: { type: "message.part.updated", properties: { sessionID: "p", part: { type: "tool", tool: "task", state: { status: "error", metadata: {} } } } } },
  ]) assert.equal(resolveTaskPartInterruption(raw), null)
})

test("never fabricates taskID from childSessionID", () => {
  const evidence = resolveTaskPartInterruption({
    event: {
      type: "message.part.updated",
      properties: {
        sessionID: "parent",
        part: {
          id: "prt_2",
          type: "tool",
          tool: "task",
          state: { status: "error", error: "Tool execution aborted", input: {}, metadata: { sessionId: "child" } },
        },
      },
    },
  })
  assert.equal(evidence?.childSessionID, "child")
  assert.equal(evidence?.taskID, undefined)
})
```

- [ ] **Step 2: Run RED shared decoder tests**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/shared/opencode-events.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./opencode-events.ts`.

- [ ] **Step 3: Implement the pure event decoder and reuse lineage in the depth guard**

Create `src/shared/opencode-events.ts`:

```typescript
import { isRecord } from "./logger.ts"

export type SessionLineage = { sessionID: string; parentSessionID?: string }
export type TaskPartInterruptionEvidence = {
  childSessionID: string
  parentSessionID: string
  parentPartID?: string
  callID?: string
  agent?: string
  taskID?: string
  terminalTaskErrorObserved: true
  transportInterrupted: boolean
  errorText: string
}

function stringField(value: unknown, keys: readonly string[]): string | undefined {
  if (!isRecord(value)) return undefined
  for (const key of keys) {
    const found = value[key]
    if (typeof found === "string" && found.length > 0) return found
  }
  return undefined
}

export function eventEnvelope(raw: unknown): { type: string; properties: Record<string, unknown> } | null {
  if (!isRecord(raw)) return null
  const event = isRecord(raw.event) ? raw.event : raw
  const type = typeof event.type === "string" ? event.type : ""
  if (!type) return null
  const properties = isRecord(event.properties) ? event.properties : event
  return { type, properties }
}

export function resolveSessionLineageProperties(props: unknown): SessionLineage | null {
  if (!isRecord(props)) return null
  const info = isRecord(props.info) ? props.info : undefined
  const session = isRecord(props.session) ? props.session : undefined
  const sessionID = stringField(props, ["sessionID", "sessionId"])
    ?? stringField(session, ["id", "sessionID", "sessionId"])
    ?? stringField(info, ["id", "sessionID", "sessionId"])
  if (!sessionID) return null
  const parentSessionID = stringField(props, ["parentID", "parentId", "parentSessionID", "parentSessionId"])
    ?? stringField(session, ["parentID", "parentId", "parentSessionID", "parentSessionId"])
    ?? stringField(info, ["parentID", "parentId", "parentSessionID", "parentSessionId"])
  return { sessionID, ...(parentSessionID ? { parentSessionID } : {}) }
}

export function resolveSessionLineage(raw: unknown): SessionLineage | null {
  const envelope = eventEnvelope(raw)
  return envelope ? resolveSessionLineageProperties(envelope.properties) : null
}

export function resolveTaskPartInterruption(raw: unknown): TaskPartInterruptionEvidence | null {
  const envelope = eventEnvelope(raw)
  if (!envelope || envelope.type !== "message.part.updated") return null
  const part = isRecord(envelope.properties.part) ? envelope.properties.part : undefined
  if (!part || part.type !== "tool" || part.tool !== "task") return null
  const state = isRecord(part.state) ? part.state : undefined
  if (!state || state.status !== "error") return null
  const metadata = isRecord(state.metadata) ? state.metadata : undefined
  const input = isRecord(state.input) ? state.input : undefined
  const childSessionID = stringField(metadata, ["sessionId", "sessionID"])
  const parentSessionID = stringField(envelope.properties, ["sessionID", "sessionId"])
    ?? stringField(part, ["sessionID", "sessionId"])
  if (!childSessionID || !parentSessionID) return null
  const inputTaskID = stringField(input, ["task_id", "taskID", "taskId"])
  const errorText = typeof state.error === "string" ? state.error : ""
  return {
    childSessionID,
    parentSessionID,
    ...(stringField(part, ["id"]) ? { parentPartID: stringField(part, ["id"])! } : {}),
    ...(stringField(part, ["callID", "callId"]) ? { callID: stringField(part, ["callID", "callId"])! } : {}),
    ...(stringField(input, ["subagent_type", "agent"]) ? { agent: stringField(input, ["subagent_type", "agent"])! } : {}),
    ...(inputTaskID ? { taskID: inputTaskID } : {}),
    terminalTaskErrorObserved: true,
    transportInterrupted: metadata?.interrupted === true,
    errorText,
  }
}
```

Use `resolveSessionLineage()` in `createGuardEventHandler()` instead of its flat-only parent parsing. Preserve the fail-closed unknown-parent depth rule and existing deletion cleanup.

In `src/runtime-fallback/event-handler-support.ts`, preserve every model/target/lifecycle export and replace only the duplicate lineage bodies:

```typescript
export function resolveRuntimeFallbackSessionID(props: unknown): string {
  return resolveSessionLineageProperties(props)?.sessionID ?? ""
}

export function resolveParentSessionID(props: unknown): string | undefined {
  return resolveSessionLineageProperties(props)?.parentSessionID
}
```

Import `resolveSessionLineageProperties` from `../shared/opencode-events.ts`. This makes the runtime fallback and subagent-depth guard consume one parent-ID spelling policy without moving `createRuntimeFallbackSessionLifecycle()`, retry-target resolution, or fallback-state helpers.

- [ ] **Step 4: Write failing durable-correlation and ordering tests on the existing controller**

Create `src/runtime-fallback/subagent-429-controller-interruption.test.ts` using the existing controller test harness:

```typescript
test("task part and retryable child error correlate in either order", () => {
  for (const order of ["part-first", "error-first"] as const) {
    const h = createHarness()
    h.controller.onSessionCreated(order, true)
    assert.equal(h.controller.recordSessionLineage({ childSessionID: order, parentSessionID: "parent", agent: "oracle" }), "recorded")
    const part = {
      childSessionID: order,
      parentSessionID: "parent",
      parentPartID: `part-${order}`,
      callID: `call-${order}`,
      agent: "oracle",
      taskID: `task-${order}`,
      terminalTaskErrorObserved: true as const,
    }
    if (order === "part-first") {
      h.controller.recordTaskPart(part)
      h.controller.markRetryableChildError(order)
    } else {
      h.controller.markRetryableChildError(order)
      h.controller.recordTaskPart(part)
    }
    assert.deepEqual(h.controller.getInterruptionCorrelation({ childSessionID: order }), {
      childSessionID: order,
      parentSessionID: "parent",
      callID: `call-${order}`,
      agent: "oracle",
      taskID: `task-${order}`,
      terminalTaskErrorObserved: true,
      retryableChildErrorObserved: true,
      explicitlyAborted: false,
    })
  }
})

test("duplicate parent parts and repeated child errors are idempotent", () => {
  const h = createHarness()
  h.controller.onSessionCreated("child", true)
  h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent" })
  const part = {
    childSessionID: "child", parentSessionID: "parent", parentPartID: "part", callID: "call",
    taskID: "task-child", terminalTaskErrorObserved: true as const,
  }
  assert.equal(h.controller.recordTaskPart(part), "recorded")
  assert.equal(h.controller.recordTaskPart(part), "duplicate")
  assert.ok(h.controller.getInterruptionCorrelation({ childSessionID: "child", parentSessionID: "parent", parentPartID: "call" }))
  h.controller.markRetryableChildError("child")
  h.controller.markRetryableChildError("child")
  assert.equal(h.controller.getInterruptionCorrelation({ childSessionID: "child" })?.retryableChildErrorObserved, true)
})

test("retry-flow settlement retains correlation until deletion", async () => {
  const h = createHarness()
  h.controller.onSessionCreated("child", true)
  h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent" })
  h.controller.recordTaskPart({
    childSessionID: "child", parentSessionID: "parent", parentPartID: "part",
    taskID: "task-child", terminalTaskErrorObserved: true,
  })
  h.controller.onIdle("child")
  assert.ok(h.controller.getInterruptionCorrelation({ childSessionID: "child" }))
  h.controller.onDeleted("child")
  assert.equal(h.controller.getInterruptionCorrelation({ childSessionID: "child" }), undefined)
})

test("explicit abort and deleted child cannot be recovered by stale task evidence", () => {
  const h = createHarness()
  h.controller.onSessionCreated("child", true)
  h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent" })
  h.controller.markExplicitAbort("child")
  assert.equal(h.controller.getInterruptionCorrelation({ childSessionID: "child" })?.explicitlyAborted, true)
  h.controller.onDeleted("child")
  assert.equal(h.controller.recordTaskPart({
    childSessionID: "child", parentSessionID: "parent", parentPartID: "late",
    taskID: "task-child", terminalTaskErrorObserved: true,
  }), "untracked")
})

test("explicit abort cancels a pending 429 gate while retaining abort evidence", async () => {
  const h = createHarness({ dispatchRetry: async () => true })
  h.controller.onSessionCreated("child", true)
  h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent" })
  h.controller.on429(errorInput("child", { recoveryDelayMs: 100 }))
  assert.equal(h.scheduler.tasks[0]?.cancelled, false)
  h.controller.markExplicitAbort("child")
  assert.equal(h.scheduler.tasks[0]?.cancelled, true)
  assert.equal(h.controller.getInterruptionCorrelation({ childSessionID: "child" })?.explicitlyAborted, true)
  assert.deepEqual(h.controller.onIdle("child"), { kind: "untracked", suppressIdleContinuation: false })
  await h.scheduler.run(0, true)
  await flush()
  assert.deepEqual(h.dispatches, [])
})
```

- [ ] **Step 5: Run RED controller tests**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/subagent-429-controller-interruption.test.ts
```

Expected: FAIL because the existing controller has no lineage, task-part, retryable-evidence, abort-evidence, lookup, or notice-claim methods.

- [ ] **Step 6: Add exact correlation interfaces to the existing controller**

In `src/runtime-fallback/subagent-429-controller.ts`, export:

```typescript
export type SubagentInterruptionCorrelation = {
  childSessionID: string
  parentSessionID: string
  callID?: string
  agent?: string
  taskID?: string
  terminalTaskErrorObserved: boolean
  retryableChildErrorObserved: boolean
  explicitlyAborted: boolean
}

export type SubagentSessionLineageInput = {
  childSessionID: string
  parentSessionID: string
  agent?: string
}

export type SubagentTaskPartEvidence = {
  childSessionID: string
  parentSessionID: string
  parentPartID?: string
  callID?: string
  agent?: string
  taskID?: string
  terminalTaskErrorObserved: true
}

export type SubagentCorrelationLookup = {
  childSessionID?: string
  parentSessionID?: string
  parentPartID?: string
  taskID?: string
}
```

Extend `Subagent429Controller` with:

```typescript
export type Subagent429Controller = {
  onSessionCreated(sessionID: string, isChild: boolean): void
  on429(input: Subagent429ErrorInput): Subagent429Decision
  onOtherError(input: Subagent429OtherErrorInput): Subagent429OtherErrorDecision
  onIdle(sessionID: string): Subagent429IdleResult
  onDeleted(sessionID: string): void
  getActiveDispatchTarget(sessionID: string): Subagent429Target | undefined
  recordSessionLineage(input: SubagentSessionLineageInput): "recorded" | "untracked"
  recordTaskPart(input: SubagentTaskPartEvidence): "recorded" | "duplicate" | "untracked"
  markRetryableChildError(childSessionID: string): void
  markExplicitAbort(childSessionID: string): void
  getInterruptionCorrelation(input: SubagentCorrelationLookup): Readonly<SubagentInterruptionCorrelation> | undefined
  claimInterruptionNotice(input: SubagentCorrelationLookup): boolean
}
```

Preserve every prerequisite signature unchanged, especially `onSessionCreated(sessionID: string, isChild: boolean): void`, `on429()`, `onOtherError()`, `onIdle()`, `onDeleted()`, and `getActiveDispatchTarget()`. New correlation methods are additive.

- [ ] **Step 7: Separate durable child lifetime from optional 429-flow lifetime**

Refactor only the existing controller's map wrapper; keep `Session429State` as the sole retry/budget/generation implementation:

```typescript
type DurableChildRecord = {
  correlation?: SubagentInterruptionCorrelation
  retry?: Session429State
  seenParentParts: Set<string>
  parentEvidenceIDs: Set<string>
  claimedNotices: Set<string>
}

const sessions = new Map<string, DurableChildRecord>()

function createRetryState(sessionID: string, record: DurableChildRecord): Session429State {
  let retry!: Session429State
  retry = new Session429State(
    sessionID,
    stateDeps,
    () => sessions.get(sessionID) === record && record.retry === retry,
    () => {
      if (sessions.get(sessionID) === record && record.retry === retry) record.retry = undefined
    },
  )
  return retry
}
```

Implement the wrapper transitions exactly:

1. `onSessionCreated(sessionID, isChild)` calls `previous?.retry?.stop()`, deletes the previous record, and returns for a root session. For a child, it inserts a new empty durable record, then assigns `record.retry = createRetryState(sessionID, record)`. A duplicate active `session.created` for an already-tracked child without an intervening `session.deleted` is idempotent: it does not reset durable correlation, parent evidence, or the retry substate. The delete-and-recreate reset applies only after an explicit `session.deleted` -> `session.created` sequence for that child session ID.
2. Existing `on429()`, `onOtherError()`, `onIdle()`, and `getActiveDispatchTarget()` delegate to `record.retry`; absent retry returns each method's existing untracked/handled-false value.
3. A `Session429State` stop callback clears only `record.retry`. It never deletes correlation. This preserves the previous retry semantics while retaining lineage until session deletion.
4. `onDeleted()` calls `record.retry?.stop()` and deletes the durable record. There is no tombstone set: stale `recordTaskPart()` sees no record, returns `untracked`, and never recreates a deleted child.
5. `recordSessionLineage()` populates correlation only on an already-tracked child. It canonicalizes a supplied runtime review-agent alias through Task 3 and otherwise preserves the agent string.
6. `recordTaskPart()` also requires an existing record and matching child/parent lineage. Its deduplication key is ``${parentSessionID}:${parentPartID ?? callID ?? taskID ?? childSessionID}``. It adds both supplied `parentPartID` and `callID` values to `parentEvidenceIDs`; a provider `callID` is never used without the parent-session constraint. It copies `taskID` only when evidence supplied one.
7. `markRetryableChildError()` only flips its boolean on an existing correlation. `markExplicitAbort()` sets `explicitlyAborted = true`, calls `record.retry?.stop()`, and relies on the existing identity-checked stop callback to clear `record.retry`; it preserves durable correlation for the no-notice decision but cancels timers/generations before any later idle. Neither method creates records or retry flows.
8. `getInterruptionCorrelation()` resolves by `childSessionID` first. A `taskID` lookup scans existing records for an exact stored `correlation.taskID`. A supplied `parentSessionID` must equal correlation lineage, and a supplied `parentPartID` must be in `parentEvidenceIDs`. It never treats `childSessionID` as `taskID`.
9. `claimInterruptionNotice()` requires a resolved non-aborted correlation and an explicit `lookup.taskID`. When correlation already stores a task ID, the values must match; when it does not, the explicit output-adapter task ID is accepted without being rewritten as a child ID. Its claim key uses parent session plus parent part/task identity and returns true exactly once.

No field from `Session429State` is accessed directly. No retry counter, blocked scope, timer, dispatch generation, fallback index, scheduler, or budget moves into correlation.

- [ ] **Step 8: Add event-handler tests for evidence-only behavior and exclusions**

Create `src/runtime-fallback/event-handler-interruption-recovery.test.ts` with the following helper implementation and tests, reusing the prerequisite 429 test helpers where appropriate:

```typescript
function makeParentTaskErrorEvent(input: {
  parent: string
  child: string
  partID: string
  callID?: string
  taskID?: string
  agent?: string
  errorText?: string
  interrupted?: boolean
}) {
  return {
    event: {
      type: "message.part.updated",
      properties: {
        sessionID: input.parent,
        part: {
          id: input.partID,
          sessionID: input.parent,
          type: "tool",
          tool: "task",
          ...(input.callID === undefined ? {} : { callID: input.callID }),
          state: {
            status: "error",
            error: input.errorText ?? "Tool execution aborted",
            input: {
              ...(input.agent === undefined ? {} : { subagent_type: input.agent }),
              ...(input.taskID === undefined ? {} : { task_id: input.taskID }),
            },
            metadata: { sessionId: input.child, interrupted: input.interrupted ?? true },
          },
        },
      },
    },
  }
}

test("parent terminal task event never dispatches without retryable child error", async () => {
  const { client, calls } = makeMockClient()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client })
  await handler(makeCreatedEvent("child", { parentID: "parent" }))
  const event = makeParentTaskErrorEvent({ parent: "parent", child: "child", partID: "part", callID: "call", taskID: "task-1" })
  await handler(event)
  await handler(event)
  assert.deepEqual(calls, [])
})

test("parent task and retryable child error work in both arrival orders exactly once", async () => {
  for (const order of ["parent-first", "child-first"] as const) {
    const { client, calls } = makeMockClient()
    const cfg = makeConfig({ subagent429: { maxRetries: 0 } })
    const scheduler = new FakeHandlerScheduler()
    const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, scheduler })
    await handler(makeCreatedEvent(`child-${order}`, { parentID: "parent" }))
    const parent = makeParentTaskErrorEvent({
      parent: "parent",
      child: `child-${order}`,
      partID: `part-${order}`,
      callID: `call-${order}`,
      taskID: `task-${order}`,
      agent: "orchestrator",
    })
    const child = makeErrorEvent(`child-${order}`, { status: 429 }, { agent: "orchestrator", model: { providerID: "hoo", modelID: "primary-model" } })
    if (order === "parent-first") { await handler(parent); await handler(child) }
    else { await handler(child); await handler(parent) }
    await handler(makeIdleEvent(`child-${order}`))
    await scheduler.run(0)
    await flushHandler()
    assert.equal(calls.length, 1, order)
  }
})

test("abort permission denial unknown agent and deletion do not recover", async () => {
  const { client, calls } = makeMockClient()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client })
  await handler(makeCreatedEvent("aborted", { parentID: "parent" }))
  await handler(makeErrorEvent("aborted", { name: "MessageAbortedError", isAbort: true }, { agent: "orchestrator" }))
  await handler(makeParentTaskErrorEvent({ parent: "parent", child: "aborted", partID: "aborted-part", taskID: "aborted-task" }))
  await handler(makeCreatedEvent("denied", { parentID: "parent" }))
  await handler(makeParentTaskErrorEvent({ parent: "parent", child: "denied", partID: "denied-part", taskID: "denied-task", errorText: "Permission denied" }))
  await handler(makeCreatedEvent("unknown", { parentID: "parent" }))
  await handler(makeErrorEvent("unknown", { status: 429 }, { agent: "missing-agent" }))
  await handler({ event: { type: "session.deleted", properties: { sessionID: "unknown" } } })
  await handler(makeParentTaskErrorEvent({ parent: "parent", child: "unknown", partID: "late", callID: "late", taskID: "late-task" }))
  assert.deepEqual(calls, [])
})

test("429 then explicit abort cancels the pending gate before idle or timer", async () => {
  const { client, calls } = makeMockClient()
  const scheduler = new FakeHandlerScheduler()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client, scheduler })
  await handler(makeCreatedEvent("aborted-429", { parentID: "parent" }))
  await handler(makeErrorEvent("aborted-429", { status: 429, retryAfter: 1 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.equal(scheduler.tasks[0]?.cancelled, false)
  await handler(makeErrorEvent("aborted-429", { name: "MessageAbortedError", isAbort: true }, { agent: "orchestrator" }))
  assert.equal(scheduler.tasks[0]?.cancelled, true)
  await handler(makeIdleEvent("aborted-429"))
  await scheduler.run(0)
  await flushHandler()
  assert.deepEqual(calls, [])
})

test("disabled interruption hook ignores correlation while preserving existing 429 fallback", async () => {
  const { client, calls } = makeMockClient()
  const scheduler = new FakeHandlerScheduler()
  const cfg = OcmmConfigSchema.parse({
    ...makeConfig({ subagent429: { maxRetries: 0 } }),
    disabledHooks: ["subagent-interruption-recovery"],
  })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, scheduler })
  await handler(makeCreatedEvent("disabled-child", { parentID: "parent" }))
  await handler(makeParentTaskErrorEvent({
    parent: "parent",
    child: "disabled-child",
    partID: "part",
    taskID: "task-disabled",
  }))
  await handler(makeErrorEvent("disabled-child", { status: 429 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await handler(makeIdleEvent("disabled-child"))
  await scheduler.run(0)
  await flushHandler()
  assert.equal(calls.length, 1)
})
```

- [ ] **Step 9: Wire lifecycle and evidence into the existing event authority**

In `src/runtime-fallback/event-handler.ts`:

- Preserve `createRuntimeFallbackSessionLifecycle()`, guarded-client dispatch, stale-generation waits, `runGenericFallback()`, `resolveRetryTarget()`, and the existing `controller` variable. Correlation adds evidence to that controller; it does not replace lifecycle or generic fallback support.
- Decode `session.created` with `resolveSessionLineage()`, call the unchanged `onSessionCreated(sessionID, parentSessionID !== undefined)`, and, when the new hook is enabled and a parent exists, call `recordSessionLineage({ childSessionID: sessionID, parentSessionID })`.
- Process `message.part.updated` before the `eventType !== "session.error"` return. When the hook is enabled and `resolveTaskPartInterruption()` returns evidence, canonicalize its agent through `canonicalizeReviewAgentName()` and call `recordTaskPart()`; return without dispatch.
- For `session.error`, evaluate the existing `isAbortError(error)` check before the `runtimeFallback.enabled` early return. When the new hook is enabled, call `markExplicitAbort(sessionID)` before existing idle-abort cleanup, then return. This preserves the generic fallback gate while ensuring a disabled runtime fallback cannot cause a misleading output notice for an explicit abort.
- Resolve missing child agent from `getInterruptionCorrelation({ childSessionID: sessionID })?.agent` when event payload omits it.
- Call `markRetryableChildError(sessionID)` only after classification is retryable and a known effective agent requirement exists. The existing `on429()` or generic fallback remains the only dispatch path.
- Keep existing 429/generic ownership and in-flight generation checks. Repeated task/error/idle events must not create a second dispatch.
- On deletion, call the existing controller `onDeleted()` before other cache cleanup.

Define this closure next to `clock`, then gate only the new lineage/part/correlation calls with it:

```typescript
const interruptionRecoveryEnabled = (): boolean =>
  !deps.getConfig().disabledHooks.includes("subagent-interruption-recovery")
```

Do not move `cfg` above unrelated lifecycle branches and do not gate pre-existing 429, generic fallback, lifecycle generation, or idle-continuation behavior with this hook.

- [ ] **Step 10: Run GREEN shared/controller/event/depth tests**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/shared/opencode-events.test.ts src/runtime-fallback/subagent-429-controller-*.test.ts src/runtime-fallback/event-handler-*.test.ts src/runtime-fallback/fallback-state.test.ts src/runtime-fallback/dispatcher.test.ts src/permissions/index.test.ts
pnpm run typecheck
```

Expected: all selected tests pass; both event orders dispatch once; evidence-only/exclusion tests dispatch zero; typecheck exits 0.

- [ ] **Step 11: Integration report/checkpoint**

Report decoded live/current field paths, durable-vs-retry state boundary, exact controller signatures, duplicate/out-of-order outcomes, disabled-hook behavior, and prerequisite 429 regression results. Suggested semantic commit message: `feat: correlate subagent interruption evidence`. Do not commit; separate explicit user authorization is required.

---

### Task 11: Add the Non-Dispatching Output Adapter and Hook Surface

**Files:**
- Create: `src/runtime-fallback/interruption-output-adapter.ts`
- Create: `src/runtime-fallback/interruption-output-adapter.test.ts`
- Modify: `src/config/schema.ts`
- Modify: `src/config/schema.test.ts`
- Modify: `src/runtime-fallback/event-handler.ts`
- Modify: `src/runtime-fallback/index.ts`
- Modify: `src/hooks/event.ts`
- Modify: `src/index.ts`
- Modify: `src/index.test.ts`
- Generate: `schema.json`

**Interfaces:**
- Consumes: `Subagent429Controller` correlation lookup/notice claim from Task 10 and the observed `tool.execute.after` shape from Task 2.
- Produces: `createSubagentInterruptionOutputAdapter(args): (input: unknown, output: unknown) => Promise<void>`, exact continuation notice behavior, `RuntimeFallbackRuntime { event, afterTask }`, `createRuntimeFallbackRuntime(deps: RuntimeFallbackDeps): RuntimeFallbackRuntime`, `createEventRuntime(args: RuntimeFallbackDeps): RuntimeFallbackRuntime`, and default-enabled `subagent-interruption-recovery` configuration.

- [ ] **Step 1: Write failing output-adapter tests**

Create `src/runtime-fallback/interruption-output-adapter.test.ts`:

```typescript
import { test } from "node:test"
import assert from "node:assert/strict"

import { OcmmConfigSchema, defaultConfig } from "../config/schema.ts"
import { createSubagentInterruptionOutputAdapter, SUBAGENT_CONTINUATION_NOTICE_PREFIX } from "./interruption-output-adapter.ts"

function controller(overrides: Partial<{ explicitlyAborted: boolean; taskID: string; correlated: boolean }> = {}) {
  let claimed = false
  return {
    getInterruptionCorrelation() {
      if (overrides.correlated === false) return undefined
      return {
        childSessionID: "child", parentSessionID: "parent",
        ...(overrides.taskID === undefined ? { taskID: "tsk_resume_1" } : { taskID: overrides.taskID }),
        terminalTaskErrorObserved: true, retryableChildErrorObserved: false,
        explicitlyAborted: overrides.explicitlyAborted ?? false,
      }
    },
    claimInterruptionNotice() {
      if (claimed || overrides.correlated === false) return false
      claimed = true
      return true
    },
  }
}

test("appends one manual continuation notice for an explicit correlated task ID", async () => {
  const output = {
    output: "Tool execution aborted",
    metadata: { sessionId: "child", interrupted: true },
  }
  const adapter = createSubagentInterruptionOutputAdapter({
    getConfig: () => defaultConfig(),
    controller: controller(),
  })
  await adapter({ tool: "task", sessionID: "parent", callID: "part-1" }, output)
  assert.match(output.output, new RegExp(SUBAGENT_CONTINUATION_NOTICE_PREFIX))
  assert.match(output.output, /resumable task identifier "tsk_resume_1"/)
  assert.match(output.output, /task_id field/)
  assert.doesNotMatch(output.output, /task\s*\(/)
  await adapter({ tool: "task", sessionID: "parent", callID: "part-1" }, output)
  assert.equal(output.output.match(new RegExp(SUBAGENT_CONTINUATION_NOTICE_PREFIX, "g"))?.length, 1)
})

test("preserves exclusions and ordinary empty output", async () => {
  for (const scenario of [
    { text: "", child: "child", ctl: controller() },
    { text: "Permission denied", child: "child", ctl: controller() },
    { text: "Unknown agent type: missing", child: "child", ctl: controller() },
    { text: "Tool execution aborted", child: "child", ctl: controller({ taskID: "" }) },
    { text: "Tool execution aborted", child: "child", ctl: controller({ explicitlyAborted: true }) },
    { text: "Tool execution aborted", child: "deleted", ctl: controller({ correlated: false }) },
  ]) {
    const output: { output: string; metadata?: { sessionId: string } } = { output: scenario.text }
    if (scenario.child) output.metadata = { sessionId: scenario.child }
    await createSubagentInterruptionOutputAdapter({ getConfig: () => defaultConfig(), controller: scenario.ctl })(
      { tool: "task", sessionID: "parent", callID: "part" }, output,
    )
    assert.equal(output.output, scenario.text)
  }
})

test("disabled hook leaves interrupted task output unchanged", async () => {
  const config = OcmmConfigSchema.parse({ disabledHooks: ["subagent-interruption-recovery"] })
  const output = { output: "Tool execution aborted", metadata: { sessionId: "child" } }
  await createSubagentInterruptionOutputAdapter({ getConfig: () => config, controller: controller() })(
    { tool: "task", sessionID: "parent", callID: "part" }, output,
  )
  assert.equal(output.output, "Tool execution aborted")
})
```

- [ ] **Step 2: Add failing schema and plugin-composition tests**

Append to `src/config/schema.test.ts`:

```typescript
test("subagent-interruption-recovery is a valid default-enabled hook", () => {
  const defaults = defaultConfig()
  assert.equal(defaults.disabledHooks.includes("subagent-interruption-recovery"), false)
  const disabled = OcmmConfigSchema.parse({ disabledHooks: ["subagent-interruption-recovery"] })
  assert.deepEqual(disabled.disabledHooks, ["subagent-interruption-recovery"])
})
```

Append to `src/index.test.ts` using a mock client with a prompt counter:

```typescript
test("task after-hook appends recovery notice without prompting any session", async () => {
  await withIsolatedConfig(null, async (cwd) => {
    let promptCalls = 0
    const client = {
      session: {
        async abort() {},
        async messages() { return { messages: [] } },
        async prompt() { promptCalls += 1 },
      },
    }
    const { pluginInterface } = createPlugin({ directory: cwd, client })
    await pluginInterface.event?.({
      event: { type: "session.created", properties: { sessionID: "child", parentID: "parent" } },
    })
    await pluginInterface.event?.({
      event: {
        type: "message.part.updated",
        properties: {
          sessionID: "parent",
          part: {
            id: "part",
            type: "tool",
            tool: "task",
            state: {
              status: "error",
              error: "Tool execution aborted",
              input: { task_id: "tsk_resume_1", subagent_type: "code-search" },
              metadata: { sessionId: "child", interrupted: true },
            },
          },
        },
      },
    })
    const output = { output: "Tool execution aborted", metadata: { sessionId: "child" } }
    await pluginInterface["tool.execute.after"]?.(
      { tool: "task", sessionID: "parent", callID: "part" },
      output,
    )
    assert.match(output.output, /resumable task identifier "tsk_resume_1"/)
    assert.equal(promptCalls, 0)
  })
})
```

- [ ] **Step 3: Run RED adapter/schema/index tests**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/interruption-output-adapter.test.ts src/config/schema.test.ts src/index.test.ts
```

Expected: FAIL because the adapter/factory/hook name do not exist.

- [ ] **Step 4: Implement the pure output adapter with exact exclusions**

Create `src/runtime-fallback/interruption-output-adapter.ts`:

```typescript
import type { OcmmConfig } from "../config/schema.ts"
import { isRecord } from "../shared/logger.ts"
import type { Subagent429Controller } from "./subagent-429-controller.ts"

export const SUBAGENT_CONTINUATION_NOTICE_PREFIX = "[Subagent interruption recovery]"
const INTERRUPTION = /tool execution (?:was )?(?:aborted|interrupted)|transport (?:closed|interrupted)|connection (?:closed|reset)/i
const EXCLUDED = /permission (?:denied|rejected)|unknown agent(?: type)?/i

function text(value: unknown, keys: readonly string[]): string | undefined {
  if (!isRecord(value)) return undefined
  for (const key of keys) {
    const found = value[key]
    if (typeof found === "string" && found.length > 0) return found
  }
  return undefined
}

function toolName(input: unknown): string {
  return (text(input, ["tool", "toolName", "toolID", "toolId", "name"]) ?? "").toLowerCase()
}

function taskEvidence(input: unknown, output: Record<string, unknown>): {
  childSessionID?: string
  taskID?: string
} {
  const metadata = isRecord(output.metadata) ? output.metadata : undefined
  const args = isRecord(input) && isRecord(input.args) ? input.args : undefined
  const childSessionID = text(metadata, ["sessionId", "sessionID"])
  const taskID = text(metadata, ["task_id", "taskID", "taskId"])
    ?? text(output, ["task_id", "taskID", "taskId"])
    ?? text(args, ["task_id", "taskID", "taskId"])
  const body = typeof output.output === "string" ? output.output : ""
  const bodyTaskID = body.match(/\btask_id\s*[:=]\s*["']?([A-Za-z0-9._:-]+)/i)?.[1]
  const explicitTaskID = taskID ?? bodyTaskID
  return {
    ...(childSessionID ? { childSessionID } : {}),
    ...(explicitTaskID ? { taskID: explicitTaskID } : {}),
  }
}

export function createSubagentInterruptionOutputAdapter(args: {
  getConfig: () => OcmmConfig
  controller: Pick<Subagent429Controller, "getInterruptionCorrelation" | "claimInterruptionNotice">
}): (input: unknown, output: unknown) => Promise<void> {
  return async (input, rawOutput) => {
    const config = args.getConfig()
    if (config.disabledHooks?.includes("subagent-interruption-recovery")) return
    if (toolName(input) !== "task" || !isRecord(rawOutput) || typeof rawOutput.output !== "string") return
    const original = rawOutput.output
    if (!original.trim() || !INTERRUPTION.test(original) || EXCLUDED.test(original)) return
    const evidence = taskEvidence(input, rawOutput)
    if (!evidence.childSessionID && !evidence.taskID) return
    const parentSessionID = text(input, ["sessionID", "sessionId", "session_id"])
    const parentPartID = text(input, ["callID", "callId"])
    const lookup = {
      ...(evidence.childSessionID ? { childSessionID: evidence.childSessionID } : {}),
      ...(parentSessionID ? { parentSessionID } : {}),
      ...(parentPartID ? { parentPartID } : {}),
      ...(evidence.taskID ? { taskID: evidence.taskID } : {}),
    }
    const correlation = args.controller.getInterruptionCorrelation(lookup)
    const resumableTaskID = evidence.taskID ?? correlation?.taskID
    if (!correlation || correlation.explicitlyAborted || !resumableTaskID) return
    const claim = { ...lookup, taskID: resumableTaskID }
    if (!args.controller.claimInterruptionNotice(claim)) return
    rawOutput.output = `${original}\n\n${SUBAGENT_CONTINUATION_NOTICE_PREFIX}\n` +
      `The task output exposed resumable task identifier "${resumableTaskID}". ` +
      `Preserve that exact value for a manual continuation through the task tool's task_id field. ` +
      `This output adapter did not dispatch, create a child, or prompt the parent session.`
  }
}
```

The adapter treats the hook input `callID` as parent part identity, matching the live probe. It never equates that value with the provider tool-call `part.callID`.

- [ ] **Step 5: Add the hook name and regenerate schema**

Add `"subagent-interruption-recovery"` to `HOOK_NAMES` in `src/config/schema.ts`. Do not add it to the default `disabledHooks`, so it is enabled by default.

```powershell
pnpm run gen-schema
node -e "const fs=require('node:fs');const s=fs.readFileSync('schema.json','utf8');if(!s.includes('subagent-interruption-recovery'))throw new Error('hook missing');console.log('interruption hook schema synchronized')"
```

Expected: prints `interruption hook schema synchronized`.

- [ ] **Step 6: Construct one runtime and expose both adapters**

Refactor `src/runtime-fallback/event-handler.ts` mechanically without changing the already-tested event body:

1. Keep `RuntimeFallbackDeps` and every helper in place.
2. Add the complete exported runtime type below.
3. Rename the implementation factory declaration from `createRuntimeFallbackEventHandler` to `createRuntimeFallbackRuntime` and change its return type to `RuntimeFallbackRuntime`.
4. Keep the existing `sessionStates`, `clock`, `lifecycle`, `controller`, `runGenericFallback`, and `createSubagent429Controller()` construction inside that factory. Change the existing `return async (raw) => {` token to `const event = async (raw: unknown): Promise<void> => {`; the closure contents from its first record guard through its last dispatch commit remain byte-for-byte in that closure.
5. Immediately after the event closure closes, return `{ event, afterTask: createSubagentInterruptionOutputAdapter({ getConfig: deps.getConfig, controller }) }`.
6. Add the compatibility wrapper below. There is exactly one controller per `createRuntimeFallbackRuntime()` call; the wrapper creates one runtime and returns its event member.

```typescript
export type RuntimeFallbackRuntime = {
  event: (input: unknown) => Promise<void>
  afterTask: (input: unknown, output: unknown) => Promise<void>
}

export function createRuntimeFallbackEventHandler(deps: RuntimeFallbackDeps): (input: unknown) => Promise<void> {
  return createRuntimeFallbackRuntime(deps).event
}
```

Export `RuntimeFallbackRuntime`, `RuntimeFallbackDeps`, `createRuntimeFallbackRuntime`, and the compatibility wrapper from `src/runtime-fallback/index.ts`.

Replace `src/hooks/event.ts` with the same explicit API for both callers:

```typescript
import {
  createRuntimeFallbackRuntime,
  type RuntimeFallbackDeps,
  type RuntimeFallbackRuntime,
} from "../runtime-fallback/index.ts"

export function createEventRuntime(args: RuntimeFallbackDeps): RuntimeFallbackRuntime {
  return createRuntimeFallbackRuntime(args)
}

export function createEventHandler(args: RuntimeFallbackDeps): (input: unknown) => Promise<void> {
  return createEventRuntime(args).event
}
```

- [ ] **Step 7: Wire the output adapter before the empty-task detector**

In `src/index.ts`, replace the current `createEventHandler()` construction with this one runtime construction, use `fallbackRuntime.event` in `composedEvent`, and put `fallbackRuntime.afterTask` first in `toolAfterHandlers`:

```typescript
const fallbackRuntime = createEventRuntime({
  getConfig,
  ...(input?.client !== undefined ? { client: input.client } : {}),
  directory: cwd,
  idleState,
  registeredAgentModels,
  clearSessionIntent: (sessionID) => sessionIntentStore.clearSessionIntent(sessionID),
})

const toolAfterHandlers = [
  fallbackRuntime.afterTask,
  createHashlineReadEnhancer({ getConfig }),
  createRulesInjector({ getConfig, projectRoot: cwd }),
  createDirectoryAgentsInjector({ getConfig, projectRoot: cwd, sessionCache: agentsSessionCache }),
  permissionGuards.after,
]
```

An ordinary empty task output is ignored by `afterTask` and remains owned by `empty-task-response-detector`. A failed task call may never reach this list; event correlation still records it.

- [ ] **Step 8: Run GREEN adapter/factory/schema tests and runtime regressions**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/interruption-output-adapter.test.ts src/runtime-fallback/subagent-429-controller-*.test.ts src/runtime-fallback/event-handler-*.test.ts src/permissions/index.test.ts src/config/schema.test.ts src/index.test.ts
pnpm run typecheck
```

Expected: all selected tests pass; no adapter test increments a dispatch/prompt counter; typecheck exits 0.

- [ ] **Step 9: Integration report/checkpoint**

Report notice/exclusion cases, one-controller factory evidence, hook ordering, schema generation output, zero-dispatch assertion, and test results. Suggested semantic commit message: `feat: add subagent interruption recovery hook`. Do not commit; separate explicit user authorization is required.

---

### Task 12: Tighten GPT-5.6 Questions and Orchestrator Composition Ownership

**Files:**
- Modify: `prompts/v1/deepwork/gpt-5.6.md`
- Modify: `prompts/omo/deepwork/gpt-5.6.md`
- Modify: `prompts/codex/deepwork/gpt-5.6.md`
- Modify: `prompts/v1/agents/orchestrator.md`
- Modify: `prompts/omo/agents/orchestrator.md`
- Modify: `prompts/codex/agents/orchestrator.md`
- Modify: `src/intent/prompt-loader.test.ts`
- Modify: `docs/v1-maintenance.md`
- Modify: `docs/prompt-sync.md`
- Generate: `.agents/plugins/marketplace.json`
- Generate: `.codex/agents/**`
- Generate: `plugins/deepwork/**`

**Interfaces:**
- Consumes: the approved GPT-5.6 question threshold and role delegation matrix.
- Produces: synchronized safe-default/direct-progress guidance and an explicit rule that only the orchestrator composes workflow-role agents.

- [ ] **Step 1: Add failing three-workflow prompt contract tests**

Append to `src/intent/prompt-loader.test.ts`:

```typescript
test("GPT-5.6 prompts proceed under clear facts and ask only deliverable-changing questions", () => {
  for (const workflow of ["v1", "omo", "codex"] as const) {
    const text = readFileSync(join(process.cwd(), "prompts", workflow, "deepwork", "gpt-5.6.md"), "utf8")
    assert.match(text, /When facts are clear, answer or proceed directly/i, workflow)
    assert.match(text, /safe default.*state the assumption.*continue/i, workflow)
    assert.match(text, /changes the deliverable shape/i, workflow)
    assert.match(text, /cannot be found with available tools/i, workflow)
    assert.match(text, /material rework/i, workflow)
    assert.match(text, /Do not ask for confirmation after routine discovery, planning, integration, or verification milestones/i, workflow)
  }
})

test("orchestrator alone owns workflow-role composition in all prompt sets", () => {
  for (const workflow of ["v1", "omo", "codex"] as const) {
    const text = readFileSync(join(process.cwd(), "prompts", workflow, "agents", "orchestrator.md"), "utf8")
    assert.match(text, /exclusive owner.*workflow-agent composition/i, workflow)
    assert.match(text, /ordered Oracle/i, workflow)
    assert.match(text, /configuring multiple.*does not.*fan-out/i, workflow)
    assert.match(text, /complex.*configured high.*otherwise.*normal/is, workflow)
    assert.match(text, /runtime-safety.*configured max.*configured high.*normal/is, workflow)
  }
})
```

- [ ] **Step 2: Run RED prompt tests**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/intent/prompt-loader.test.ts
```

Expected: FAIL because the exact question threshold and exclusive composition text are absent.

- [ ] **Step 3: Add the identical GPT-5.6 question threshold to all three variants**

Insert after `## Outcome-first execution` in each GPT-5.6 prompt, preserving the v1/Codex `<deepwork-mode>` envelopes:

```markdown
## Questions and safe defaults

- When facts are clear, answer or proceed directly.
- When a safe default exists, state the assumption briefly and continue.
- Ask the user only when the choice changes the deliverable shape, required information cannot be found with available tools, or proceeding risks material rework.
- Do not ask for confirmation after routine discovery, planning, integration, or verification milestones.
```

Do not copy this section into generic `gpt.md`, `default.md`, Gemini, GLM, Codex-general, or planner calibration files. Apart from the named insertion and the workflow-composition replacement in Step 4, do not edit another GPT-5.6 section.

- [ ] **Step 4: Add the role-aware composition matrix to all three GPT-5.6 variants**

Replace the generic nested-delegation sentence with:

```markdown
## Workflow-role composition

The orchestrator is the exclusive owner of workflow-agent composition. Every allowed nested call still needs a distinct deliverable and must respect the configured depth limit.

| Current role | Allowed nested work | Prohibited workflow nesting |
|---|---|---|
| orchestrator | Any justified role under routing, skill, and authorization gates | speculative calls without a distinct deliverable |
| planner | leaf `code-search`, `doc-search`, or equivalent read-only fact gathering; at most one `reviewer` consultation for one concrete blocking architecture decision | planner, Oracle variants, plan-critic, implementation agents, routine reviewer self-checks |
| reviewer / Oracle variant | read-only source or documentation lookup only when required to verify a finding | planner, reviewer-to-Oracle, Oracle-to-reviewer, plan-critic, implementation agents |
| clarifier | read-only discovery required to resolve ambiguity | planner, reviewer/Oracle, plan-critic, implementation agents |
| plan-critic | read-only lookup required to verify a plan claim | planner, reviewer/Oracle, another plan-critic, implementation agents |

A role agent never delegates its defining judgment to another workflow role.
```

- [ ] **Step 5: Add exclusive composition ownership to all orchestrator prompts**

Insert immediately after `## Delegation Table` and its existing table in each orchestrator prompt:

```markdown
## Workflow-Agent Composition Ownership

You are the exclusive owner of workflow-agent composition. Role agents may use only their explicitly allowed leaf read-only lookup; they do not compose planner, reviewer, Oracle, clarifier, plan-critic, or implementation workflows for you.

Oracle selection is ordered by configured model priority: `oracle`, `oracle-2nd`, then configured later slots. Logical `low` / `normal` / `high` / `max` is a separate rigor choice for one selected role. Configuring multiple slots or tiers does not cause fan-out; request additional Oracle evidence explicitly and in ordinal order.

Tier selection is deterministic: simple work uses unsuffixed `normal`; complex cross-module work uses configured `high`, otherwise `normal`; security, performance, data-loss, release, or runtime-safety work uses configured `max`, otherwise configured `high`, otherwise `normal`. Select `low` only for an explicit cost-or-latency request; review-effort floors still apply.
```

Update only the delegation table's self-supervision row to say `ordered Oracle slot/profile`, and keep Reviewer as a single role with variants only. Do not rewrite Intent Gate, Subagent Git Limitations, tool contracts, verification, or scope sections.

- [ ] **Step 6: Synchronize maintenance docs and regenerate Codex**

Update the GPT-5.6 and orchestrator rows in `docs/v1-maintenance.md`. In `docs/prompt-sync.md`, record the question threshold, orchestrator composition ownership, and the rule that GPT-5.6 restraint remains exclusive to `deepwork/gpt-5.6.md`.

```powershell
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
try {
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  node --test --experimental-strip-types --test-reporter=spec src/intent/prompt-loader.test.ts src/codex/plugin-generator.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'prompt and Codex tests failed' }
  pnpm run build:ts
  if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed before Codex staging' }
  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw 'Codex generation failed' }
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
```

Expected: tests pass; generated `dw-orchestrator.toml` and workflow skill include the synchronized text; generator exits 0.

- [ ] **Step 7: Integration report/checkpoint**

Report all six prompt files, exact contract assertions, maintenance rows, generated artifacts, and tests. Suggested semantic commit message: `docs: tighten GPT-5.6 orchestration defaults`. Do not commit; separate explicit user authorization is required.

---

### Task 13: Bound Nested Delegation in Planner, Reviewer, Clarifier, and Plan Critic Prompts

**Files:**
- Modify: `prompts/v1/agents/planner.md`
- Modify: `prompts/omo/agents/planner.md`
- Modify: `prompts/codex/agents/planner.md`
- Modify: `prompts/v1/agents/reviewer.md`
- Modify: `prompts/omo/agents/reviewer.md`
- Modify: `prompts/codex/agents/reviewer.md`
- Modify: `prompts/v1/agents/clarifier.md`
- Modify: `prompts/omo/agents/clarifier.md`
- Modify: `prompts/codex/agents/clarifier.md`
- Modify: `prompts/v1/agents/plan-critic.md`
- Modify: `prompts/omo/agents/plan-critic.md`
- Modify: `prompts/codex/agents/plan-critic.md`
- Modify: `src/intent/prompt-loader.test.ts`
- Modify: `docs/v1-maintenance.md`
- Modify: `docs/prompt-sync.md`
- Generate: `.agents/plugins/marketplace.json`
- Generate: `.codex/agents/**`
- Generate: `plugins/deepwork/**`

**Interfaces:**
- Consumes: orchestrator ownership from Task 12.
- Produces: role-local leaf lookup boundaries, planner's one-blocker Reviewer cap, and explicit prohibition of Reviewer/Oracle/Clarifier/Plan Critic workflow nesting.

- [ ] **Step 1: Add failing agent-specific contract tests**

Append to `src/intent/prompt-loader.test.ts`:

```typescript
test("agent-specific prompts enforce bounded leaf delegation", () => {
  for (const workflow of ["v1", "omo", "codex"] as const) {
    const root = join(process.cwd(), "prompts", workflow, "agents")
    const planner = readFileSync(join(root, "planner.md"), "utf8")
    assert.match(planner, /leaf.*code-search.*doc-search/is, `${workflow}/planner`)
    assert.match(planner, /at most one.*reviewer.*concrete blocking architecture decision/is, `${workflow}/planner`)
    assert.match(planner, /never.*Oracle.*plan-critic.*implementation/is, `${workflow}/planner`)

    const reviewer = readFileSync(join(root, "reviewer.md"), "utf8")
    assert.match(reviewer, /leaf read-only.*lookup/i, `${workflow}/reviewer`)
    assert.match(reviewer, /never.*planner.*reviewer.*Oracle.*plan-critic.*implementation/is, `${workflow}/reviewer`)

    const clarifier = readFileSync(join(root, "clarifier.md"), "utf8")
    assert.match(clarifier, /read-only discovery.*resolve ambiguity/i, `${workflow}/clarifier`)
    assert.match(clarifier, /never.*planner.*reviewer.*Oracle.*plan-critic.*implementation/is, `${workflow}/clarifier`)

    const critic = readFileSync(join(root, "plan-critic.md"), "utf8")
    assert.match(critic, /read-only lookup.*verify.*plan claim/i, `${workflow}/plan-critic`)
    assert.match(critic, /never.*planner.*reviewer.*Oracle.*another plan-critic.*implementation/is, `${workflow}/plan-critic`)
  }
})
```

- [ ] **Step 2: Run RED prompt contracts**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/intent/prompt-loader.test.ts
```

Expected: FAIL because the current planner has an uncapped Reviewer suggestion and the other role prompts do not state the complete nesting boundary.

- [ ] **Step 3: Add the exact planner boundary before `## Plan Requirements` in all three planner prompts**

Insert immediately before the existing `## Plan Requirements` heading in each planner prompt:

```markdown
## Nested Delegation Boundary

- Default to direct planning after the first discovery wave.
- Delegate only leaf `code-search`, `doc-search`, or equivalent read-only fact gathering when it saves context or resolves a named unknown.
- You may consult `reviewer` at most once, and only for one concrete blocking architecture, security, or performance decision that repository evidence cannot settle.
- Never dispatch planner, an Oracle variant, plan-critic, an implementation agent, or a routine Reviewer self-check. A subagent that edits product files is still you implementing by proxy.
- Every allowed leaf call states one deliverable, scope, non-goals, and evidence. Stop when that fact is available.
```

In each existing `## First Action` section, replace only its ask-if-unclear sentence with: `Infer safe defaults and continue; ask one blocking question only when an unresolved choice changes the plan deliverables and available tools cannot answer it.` Do not edit Planner Scope, Plan Requirements, Task Quality Bar, Self-Review, Parallel Task Dispatch, or Handoff.

- [ ] **Step 4: Add the exact Reviewer/Oracle boundary before `## Scope Discipline`**

Insert immediately before `## Scope Discipline` and remove only the older sentence that gives a contradictory absolute nested-agent rule:

```markdown
## Nested Delegation Boundary

You remain read-only. Use direct read/search tools first. A leaf read-only source or documentation lookup is allowed only when required to verify one finding and must return evidence rather than judgment.

Never dispatch planner, reviewer, an Oracle variant, clarifier, plan-critic, or an implementation agent. Reviewer-to-Oracle and Oracle-to-Reviewer nesting are prohibited. Do not delegate the consultation's defining judgment.
```

Because Oracle profiles reuse `reviewer.md`, this one boundary applies to Reviewer and every Oracle slot/tier. In `## Grounding Rules`, replace only the ambiguity question sentence with: `State and use a safe interpretation; ask only when competing interpretations change the deliverable and direct tools cannot resolve them.` Do not edit Expertise, Decision Framework, or Response Structure.

- [ ] **Step 5: Add exact Clarifier and Plan Critic boundaries at deterministic anchors**

Insert the Clarifier section immediately before `## Output Contract`:

```markdown
## Nested Delegation Boundary

Use direct evidence first. You may request only leaf read-only discovery needed to resolve a named ambiguity. Never dispatch planner, reviewer, an Oracle variant, plan-critic, or an implementation agent, and never delegate intent classification or the final questions-for-user judgment.
```

Insert the Plan Critic section immediately before `## Decision Framework`:

```markdown
## Nested Delegation Boundary

Use direct file/search tools first. You may request only leaf read-only lookup needed to verify one concrete plan claim. Never dispatch planner, reviewer, an Oracle variant, clarifier, another plan-critic, or an implementation agent, and never delegate the receipt verdict.
```

The existing plan-path question remains allowed because the deliverable cannot exist without a readable plan. Do not edit intent-specific Clarifier analysis, Plan Critic receipt rules, checked criteria, output format, or verdict semantics.

- [ ] **Step 6: Synchronize docs, run GREEN tests, and regenerate Codex**

Update all four agent rows in `docs/v1-maintenance.md` and the functional-agent mapping/maintenance notes in `docs/prompt-sync.md`.

```powershell
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
try {
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  node --test --experimental-strip-types --test-reporter=spec src/intent/prompt-loader.test.ts src/intent/plan-review-contract.test.ts src/codex/plugin-generator.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'role prompt contracts failed' }
  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw 'Codex generation failed' }
  rg -n "Never dispatch planner|at most one.*reviewer|leaf read-only" plugins/deepwork/agents .codex/agents
  if ($LASTEXITCODE -ne 0) { throw 'generated nested-delegation rules missing' }
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
```

Expected: tests and generation pass; `rg` finds the corresponding rules in generated planner/reviewer/clarifier/plan-critic profiles.

- [ ] **Step 7: Integration report/checkpoint**

Report all 12 source prompts, role-by-role allowed/prohibited behavior, contract tests, maintenance docs, generated profiles, and `rg` evidence. Suggested semantic commit message: `docs: bound workflow role nesting`. Do not commit; separate explicit user authorization is required.

---

### Task 14: Document Configuration, Migration, Recovery, and Generated Surfaces

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/architecture.md`
- Modify: `examples/ocmm.example.jsonc`
- Modify: `src/intent/plan-review-contract.test.ts`

**Interfaces:**
- Consumes: final names, schema, expansion, routing, recovery, and prompt semantics from Tasks 3-13.
- Produces: active user/maintainer guidance that matches generated behavior and explicitly supersedes old supplemental `oracle-high` semantics.

- [ ] **Step 1: Add failing active-documentation contract tests**

Append to `src/intent/plan-review-contract.test.ts`:

```typescript
test("active docs describe canonical review variants and interruption recovery", () => {
  const files = ["README.md", "AGENTS.md", "docs/architecture.md", "examples/ocmm.example.jsonc"]
  const texts = new Map(files.map((path) => [path, readFileSync(join(process.cwd(), path), "utf8")]))
  for (const [path, text] of texts) {
    assert.match(text, /oracle-2nd/, path)
    assert.match(text, /variants/, path)
    assert.doesNotMatch(text, /supplemental high-intensity|optional third reviewer|triple review/i, path)
  }
  assert.match(texts.get("README.md")!, /agents\.oracle-high.*migrat.*agents\.oracle-2nd/is)
  assert.match(texts.get("README.md")!, /subagent-interruption-recovery/)
  assert.match(texts.get("AGENTS.md")!, /message\.part\.updated/)
  assert.match(texts.get("docs/architecture.md")!, /single.*429 controller/is)
})
```

- [ ] **Step 2: Run RED documentation contract**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/intent/plan-review-contract.test.ts
```

Expected: FAIL because active docs still describe the old generated `oracle-high` profile or omit the new surfaces.

- [ ] **Step 3: Add the exact review configuration example to README and the example config**

Use this JSONC in both files, retaining each file's surrounding comments/style:

```jsonc
{
  "agents": {
    "oracle": {
      "model": "openai/gpt-5.6-terra",
      "variant": "xhigh",
      "variants": {
        "low": "high",
        "high": "max",
        "max": { "model": "openai/gpt-5.6-sol", "variant": "max" }
      }
    },
    "oracle-2nd": {
      "model": "anthropic/claude-opus-4-7",
      "variant": "xhigh",
      "variants": { "max": "max" }
    },
    "oracle-3rd": { "model": "google/gemini-3.1-pro" },
    "reviewer": {
      "model": "openai/gpt-5.6-sol",
      "variants": { "high": { "variant": "max" } }
    }
  }
}
```

Explain immediately below:

- unsuffixed means logical normal;
- logical tier and native model variant are separate;
- slots are priority, not capability;
- slot 3-9 require explicit config;
- multiple configured profiles do not fan out;
- Reviewer has no ordinal slots;
- xhigh-equivalent review floors still apply to logical low;
- `agents.oracle-high` is a deprecated config spelling migrated to `agents.oracle-2nd`, while runtime `oracle-high` is first-slot logical high;
- alias/canonical collisions fail.

- [ ] **Step 4: Document disable and recovery behavior**

Add:

```jsonc
{
  "disabledAgents": ["oracle-2nd", "oracle-high"],
  "disabledHooks": ["subagent-interruption-recovery"]
}
```

State that `oracle-2nd` disables that whole slot and its tiers; `oracle-high` disables only first-slot logical high. Document that interruption recovery:

1. reuses the existing 429/generic fallback controller and budgets;
2. keys correlation by child session and deduplicates parent parts;
3. treats child `session.error` as provider-error evidence;
4. never retries explicit abort/permission denial/unknown agent/deletion/ordinary empty output;
5. may append one manual-continuation notice only for an explicit task identifier observed in task input/output or correlated parent-part evidence; it never substitutes `childSessionID` for `task_id`, dispatches from `tool.execute.after`, or synthesizes a parent prompt.

- [ ] **Step 5: Update architecture and maintainer hook/generated-profile tables**

In `docs/architecture.md`, add this data flow:

```text
raw config layer
  -> context-specific legacy/alias migration with provenance
  -> schema + semantic validation
  -> pure review profile expansion
  -> one canonical candidate map
  -> OpenCode registration / resolver / floors / permissions / Codex generation

OpenCode lifecycle + task-part events
  -> shared event decoder
  -> one durable child record in the existing 429 controller
  -> existing 429 or generic fallback owns dispatch
  -> task-output adapter may append one resume notice; it owns no retry state
```

In `AGENTS.md`:

- replace generated `dw-oracle-high` built-in wording with default `dw-oracle-2nd` plus configured tier profiles;
- add the `subagent-interruption-recovery` row to the hook table as enabled by default;
- list `session.created/error/idle/deleted`, `message.part.updated`, and output-adapter responsibilities;
- add the isolated XDG probe command/evidence path and state that raw logs/credentials are temporary;
- retain schema and Codex synchronization rules.

- [ ] **Step 6: Run GREEN documentation contracts and stale-copy checks**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/intent/plan-review-contract.test.ts src/intent/prompt-loader.test.ts
rg -n "supplemental high-intensity|optional third reviewer|triple review" README.md AGENTS.md docs/architecture.md examples/ocmm.example.jsonc skills/v1 prompts/v1 prompts/omo prompts/codex
if ($LASTEXITCODE -eq 0) { throw 'stale active capability-ranked review wording remains' }
if ($LASTEXITCODE -gt 1) { throw 'active documentation semantics scan failed to run' }
```

Expected: tests pass; `rg` exits 1 and the guard does not throw. Historical specs/plans are intentionally excluded from this scan.

- [ ] **Step 7: Integration report/checkpoint**

Report updated headings/tables/examples, migration and disable wording, architecture flow, hook table, contract tests, and stale scan. Suggested semantic commit message: `docs: document oracle priorities and recovery`. Do not commit; separate explicit user authorization is required.

---

### Task 15: Regenerate, Verify the Real Surface, and Run Final Acceptance Review

**Files:**
- Generate/verify: `schema.json`
- Generate/verify: `.agents/plugins/marketplace.json`
- Generate/verify: `.codex/agents/**`
- Generate/verify: `plugins/deepwork/**`
- Verify: every source, test, prompt, skill, documentation, fixture, and evidence file listed above

**Interfaces:**
- Consumes: all completed Tasks 1-14 and the original approved spec.
- Produces: idempotent generated artifacts, focused/full automated evidence, repeated live XDG evidence on the implemented hook, clean diff checks, and final independent review findings.

- [ ] **Step 1: Run the complete focused test matrix**

```powershell
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
try {
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  node --test --experimental-strip-types --test-reporter=spec src/review-agents/names.test.ts src/config/review-agent-migration.test.ts src/config/schema.test.ts src/config/load.test.ts src/config/profiles.test.ts src/config/normalize.test.ts src/review-agents/expand.test.ts src/hooks/config.test.ts src/routing/resolver.test.ts src/routing/model-upgrades.test.ts src/hooks/chat-params.test.ts src/permissions/index.test.ts src/permissions/subagent-git-guard.test.ts src/codex/plugin-generator.test.ts src/shared/opencode-events.test.ts src/runtime-fallback/error-classifier.test.ts src/runtime-fallback/fallback-state.test.ts src/runtime-fallback/dispatcher.test.ts src/runtime-fallback/subagent-429-controller-*.test.ts src/runtime-fallback/event-handler-*.test.ts src/runtime-fallback/interruption-output-adapter.test.ts src/index.test.ts src/intent/prompt-loader.test.ts src/intent/plan-review-contract.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'complete focused test matrix failed' }
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
```

Expected: every selected test passes; no test waits for a real retry delay.

- [ ] **Step 2: Regenerate schema twice and prove idempotence**

```powershell
pnpm run gen-schema
$schemaHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'schema.json').Hash
pnpm run gen-schema
$schemaHashAgain = (Get-FileHash -Algorithm SHA256 -LiteralPath 'schema.json').Hash
if ($schemaHash -ne $schemaHashAgain) { throw 'schema generation is not idempotent' }
if (-not ((Get-Content -LiteralPath 'schema.json' -Raw).Contains('subagent-interruption-recovery'))) { throw 'generated schema missing interruption hook' }
'schema generation idempotent'
```

Expected: prints `schema generation idempotent`.

- [ ] **Step 3: Run typecheck, full tests, and full build before Codex staging**

```powershell
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'typecheck failed' }
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
try {
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  pnpm test
  if ($LASTEXITCODE -ne 0) { throw 'full test suite failed' }
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
pnpm run build
if ($LASTEXITCODE -ne 0) { throw 'build failed' }
```

Expected: TypeScript strict check, all Node/Rust tests, TypeScript build, and Rust release build pass. The resulting root `dist/` is the exact runtime source staged by every following Codex generation.

- [ ] **Step 4: Regenerate Codex twice from the final build and prove the generated tree is stable**

```powershell
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
try {
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw 'first Codex generation failed' }
  $before = node -e "const{createHash}=require('node:crypto');const{readdirSync,readFileSync,statSync}=require('node:fs');const{join}=require('node:path');const roots=['.agents/plugins/marketplace.json','.codex/agents','plugins/deepwork'];const files=[];function walk(p){const s=statSync(p);if(s.isDirectory())for(const n of readdirSync(p).sort())walk(join(p,n));else files.push(p)}for(const r of roots)walk(r);const h=createHash('sha256');for(const f of files.sort()){h.update(f.replaceAll('\\','/'));h.update(readFileSync(f))}process.stdout.write(h.digest('hex'))"
  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw 'second Codex generation failed' }
  $after = node -e "const{createHash}=require('node:crypto');const{readdirSync,readFileSync,statSync}=require('node:fs');const{join}=require('node:path');const roots=['.agents/plugins/marketplace.json','.codex/agents','plugins/deepwork'];const files=[];function walk(p){const s=statSync(p);if(s.isDirectory())for(const n of readdirSync(p).sort())walk(join(p,n));else files.push(p)}for(const r of roots)walk(r);const h=createHash('sha256');for(const f of files.sort()){h.update(f.replaceAll('\\','/'));h.update(readFileSync(f))}process.stdout.write(h.digest('hex'))"
  if ($before.Trim() -ne $after.Trim()) { throw 'Codex generation is not idempotent' }
  'Codex generation idempotent'
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
```

Expected: prints `Codex generation idempotent`.

- [ ] **Step 5: Inspect exact generated profile and staged-runtime invariants**

```powershell
foreach ($root in @('.codex/agents', 'plugins/deepwork/agents')) {
  if (-not (Test-Path -LiteralPath "$root/dw-oracle.toml")) { throw "missing $root/dw-oracle.toml" }
  if (-not (Test-Path -LiteralPath "$root/dw-oracle-2nd.toml")) { throw "missing $root/dw-oracle-2nd.toml" }
  if (-not (Test-Path -LiteralPath "$root/dw-reviewer.toml")) { throw "missing $root/dw-reviewer.toml" }
  if (Test-Path -LiteralPath "$root/dw-oracle-high.toml") { throw "unconfigured logical-high profile leaked into $root" }
  if (Test-Path -LiteralPath "$root/dw-oracle-second.toml") { throw "duplicate alias in $root" }
  if (Test-Path -LiteralPath "$root/dw-reviewer-2nd.toml") { throw "Reviewer ordinal leaked in $root" }
}
rg -n "Oracle priority|logical tier|does not.*fan-out" plugins/deepwork/skills/deepwork/SKILL.md
function Get-TreeHash([string]$root) {
  if (-not (Test-Path -LiteralPath $root)) { throw "missing runtime tree: $root" }
  $hash = node -e 'const{createHash}=require("node:crypto");const{readdirSync,readFileSync,statSync}=require("node:fs");const{join,relative}=require("node:path");const root=process.argv[1];const files=[];function walk(p){const s=statSync(p);if(s.isDirectory())for(const n of readdirSync(p).sort())walk(join(p,n));else files.push(p)}walk(root);const h=createHash("sha256");for(const f of files){h.update(relative(root,f).replaceAll("\\","/"));h.update(readFileSync(f))}process.stdout.write(h.digest("hex"))' $root
  if ($LASTEXITCODE -ne 0) { throw "failed to hash runtime tree: $root" }
  return $hash.Trim()
}
foreach ($relativeRuntime in @('cli', 'shared', 'bin')) {
  $rootRuntime = "dist/$relativeRuntime"
  $stagedRuntime = "plugins/deepwork/dist/$relativeRuntime"
  if ((Get-TreeHash $rootRuntime) -ne (Get-TreeHash $stagedRuntime)) {
    throw "Codex staged runtime is stale: $relativeRuntime"
  }
}
```

Expected: no invariant throws; `rg` finds ordered/tier/non-fan-out guidance; the actually staged `dist/cli`, `dist/shared`, and `dist/bin` trees match their root build trees exactly.

- [ ] **Step 6: Repeat the isolated live XDG probe against the implemented hook**

Repeat Task 2 Steps 1-8 with a fresh probe directory, but omit only the initial `pnpm run build` command from Task 2 Step 1 and reuse the final root `dist/` produced by this Task's Step 3. Do not rebuild during or after the probe. Compare the new sanitized result with the saved fixture/evidence: preserve the files and record an exact match when equal; update both files and rerun decoder tests when any sanitized field or outcome differs. Verify all three real surfaces:

1. a retryable child provider/transport failure produces exactly one existing-controller recovery or clean fallback;
2. after a terminal parent task part, the implemented policy follows the captured `handoff` enum—original result, manual continuation using an explicitly observed `task_id`, or notice-only—with no child-ID substitution, duplicate child, or synthetic parent prompt;
3. explicit child abort produces no automatic dispatch and no misleading continuation notice.

Expected: raw JSONL shows no duplicate dispatch generation; sanitized fixture still matches decoder tests; cleanup removes the isolated XDG/config/log tree; no auth file was copied or created; root `dist/` remains byte-identical to the build already staged and checked in Steps 4-5.

- [ ] **Step 7: Run final static and diff checks**

```powershell
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed' }
rg -n --glob '!*.test.ts' "supplemental high-intensity|optional third reviewer|triple review" src README.md AGENTS.md docs/architecture.md docs/v1-maintenance.md docs/prompt-sync.md examples skills/v1 prompts/v1 prompts/omo prompts/codex plugins/deepwork .codex/agents
if ($LASTEXITCODE -eq 0) { throw 'stale or invalid active semantics remain' }
if ($LASTEXITCODE -gt 1) { throw 'stale-semantics scan failed to run' }
git status --short
```

Expected: `git diff --check` exits 0; stale scan exits 1; status shows only intentional implementation/generated/evidence files plus any separately reported pre-existing changes.

- [ ] **Step 8: Run final acceptance review without automatic fan-out**

Because this is a runtime-safety and config-migration change, explicitly request two independent reviews in parallel: the first available Oracle and `reviewer`. For each role select configured `max`; when absent select configured `high`; when absent select unsuffixed `normal`. Do not add later Oracle slots merely because they exist. Give both reviewers the approved spec path, this plan path, full diff, focused/full verification evidence, live-probe evidence, and constraints.

Expected: both return complete findings or clean verdicts. Verify every Critical/Important `[product]` or `[evidence]` finding directly. If any fix changes the tree, rerun Steps 1-7 in full—including full build before Codex staging and the staged-runtime hash check—then rerun this final review against the new revision.

- [ ] **Step 9: Final integration report/checkpoint**

Report all changed/generated surfaces, task-by-task evidence, exact generator hashes, focused/full command results, live outcome, final reviewer verdicts, residual risks, and `git status --short`. Suggested semantic commit message for a separately authorized final integration: `feat: add oracle priorities and subagent recovery`. Do not commit, push, or tag; separate explicit user authorization is required.

---

## Execution Order and Integration Boundaries

1. Task 1 is a dynamic hard gate. If any required marker or focused prerequisite test is missing or failing, stop this plan and finish the existing 429 plan Tasks 1-5 before Task 2.
2. Task 2 captures the actual OpenCode event/output contract before new interruption-correlation code is written.
3. Tasks 3-4 establish names and config migration/schema.
4. Tasks 5-8 are one behavior/generated-artifact boundary: built-in rename/expansion → registration → routing/floors → Codex. Do not commit an intermediate unsynchronized generated state.
5. Task 9 updates review workflow skills and immediately regenerates their Codex copies.
6. Tasks 10-11 extend the one existing controller, then add the notice adapter/hook/schema surface.
7. Tasks 12-13 synchronize GPT-5.6 and role-specific prompt contracts, with Codex regeneration after each coherent prompt boundary.
8. Task 14 updates active user/maintainer documentation.
9. Task 15 regenerates from final sources, runs all gates and the live probe, and performs final acceptance review.

Every implementation task uses one fresh subagent and ends with the stated integration report. The orchestrator reads the returned diff, checks for overlap with pre-existing dirty files, and reruns that task's focused command before starting its dependent task.

## Requirement-to-Task Coverage Self-Review

- Dynamic 429 prerequisite gate and protection of parallel runtime-fallback work: Task 1.
- Live current-runtime shape and parent handoff proof before correlation: Task 2; repeated after implementation in Task 15.
- Canonical names, ordinal bounds, runtime alias, Reviewer ordinal restriction: Task 3.
- Strict variants, legacy migration/warning/collision, source/profile ordering, generated schema: Task 4.
- Built-in rename, normal semantics, pure inheritance/model override/fallback preservation/non-mutation, on-demand slots, and disabled expansion: Task 5.
- Expanded registration, inherited permissions, host-disable behavior, and task alias rewrite before host lookup: Task 6.
- Resolver/model upgrade/chat floor/runtime fallback consumers and independent plan-critic floor: Task 7.
- Canonical Codex profiles, no aliases, ordered guidance, native max/floors: Task 8.
- Ordered review workflow semantics and per-role tiers: Task 9.
- One-controller correlation, all lifecycle events, duplicate/out-of-order and exclusion tests: Task 10.
- Default-enabled hook, no-dispatch output adapter, explicit-task-ID manual notice, and empty-detector ownership: Task 11.
- GPT-5.6 safe defaults/questions and orchestrator composition ownership: Task 12.
- Planner/Reviewer/Oracle/Clarifier/Plan Critic nesting bounds: Task 13.
- README, AGENTS, architecture, example, maintenance synchronization: Tasks 9, 12-14.
- Final focused tests, both generators, typecheck, full tests, build, live XDG probe, `git diff --check`, and no Git writes: Task 15.

Self-review result for orchestrator handoff: all approved-spec requirements map to a task; public signatures and canonical names are consistent; no implementation task splits tests from its behavior; no array config, Reviewer ordinals, automatic fan-out, second retry state, synthetic parent prompt, software installation, or Git write is planned.

## Planner Self-Review Receipt

- Spec coverage: all naming, migration, expansion, registration, routing, Codex, interruption, prompt, documentation, generation, and real-surface requirements map to Tasks 1-15 above.
- Red-flag scan: no unfinished-marker text, optional-path wording, fake code comments, unresolved angle-bracket values, legacy migration API names, fabricated task-call syntax, or forbidden first-item truncation command remains. TypeScript spread operators and literal XML prompt tags are intentional code constructs.
- Type/signature consistency: migration, expansion, resolver, controller-correlation, runtime factory, event decoder, and output-adapter names are consistent from producer tasks through every consumer task.
- PowerShell syntax: every fenced PowerShell block parses with `System.Management.Automation.Language.Parser`; commands use PowerShell syntax and fixed Windows paths.
- Diff hygiene: both `git diff --check -- docs/superpowers/plans/2026-07-15-oracle-priority-variants-subagent-recovery.md` and the no-index check required for this untracked plan report no whitespace errors.
- Review handoff: plan-critic was not invoked in this planner session, as explicitly requested; the orchestrator owns mandatory review of this exact saved revision.
