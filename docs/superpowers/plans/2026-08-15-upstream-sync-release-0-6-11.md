# Upstream Sync and 0.6.11 Release Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 1-4 touch overlapping generated/docs surfaces, so execute in order; do not run implementation subagents in parallel on shared files.

**Goal:** Adapt the approved upstream sync candidates into ocmm and publish patch release `v0.6.11`.

**Architecture:** Keep behavior in the existing local layers: runtime fallback in `src/runtime-fallback` and `src/config`, MCP config in `src/mcp`, model routing in `src/intent`/`src/hooks`, workflow policy in v1 skills/prompts, and release artifacts through the existing generators. Do not cherry-pick large upstream systems; implement only local equivalents with focused tests and generated artifact refresh.

**Tech Stack:** TypeScript, Zod, Node `node:test`, Markdown prompt/skill sources, pnpm generators, Rust ocmm-lsp build, GitHub Actions release workflow.

**Global Constraints:**
- Do not introduce `.omo` coding-agent session scanning; keep existing `.senpi`/`.pi` behavior unchanged.
- Do not import OMO 5.0/Senpi/memory-core/omo-native runtime systems, dual Momus+Oracle plan review, or the full upstream model-capability registry.
- Preserve explicit user override semantics: `runtimeFallback.retryOnPatterns` arrays replace defaults; explicit `.mcp.json`/config MCP servers override builtins; explicit model/reasoning config remains authoritative except for local safety guards.
- `package.json.ocmm.lspVersion` remains `0.3.2`; this is a main `ocmm` patch release only.
- PowerShell commands must be short and inspectable; do not use `$home` as a custom variable; no destructive cleanup except existing generator-contained resets.
- Subagents must not run Git writes. The orchestrator may commit, tag, push, and run the release checker only because the user explicitly authorized final submit/push/publish.

---

### Task 1: Runtime fallback, idle continuation, and MCP cwd

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/runtime-fallback/error-classifier.test.ts`
- Modify: `src/config/schema.test.ts`
- Modify: `src/runtime-fallback/idle-state.ts`
- Modify: `src/runtime-fallback/event-handler.ts`
- Modify: `src/runtime-fallback/event-handler-idle-continuation.ts`
- Modify: `src/runtime-fallback/event-handler-idle-continuation.test.ts`
- Modify: `src/mcp/index.ts`
- Modify: `src/mcp/index.test.ts`
- Generated: `schema.json`

**Interfaces:**
- Consumes: `classifyError(error, cfg, now?)`, `IdleContinuationState`, `resolveMcpServers(config, { cwd })`, `McpServerConfig`.
- Produces: retryable upstream request failure pattern, non-retryable idle stop marker, and local MCP `cwd?: string` support.

- [ ] **Step 1: Write failing runtime fallback tests**

In `src/runtime-fallback/error-classifier.test.ts`, add `"upstream request failed"` to the positive bounded default matrix and ensure explicit override semantics still reject defaults:

```ts
assert.equal(classifyError("Error from provider: Upstream request failed", cfg).retryable, true)
const override = { ...cfg, retryOnPatterns: ["provider-specific failure"] }
assert.equal(classifyError("provider-specific failure", override).retryable, true)
assert.equal(classifyError("upstream request failed", override).retryable, false)
```

In `src/config/schema.test.ts`, update the complete literal default array with `"upstream request failed"` in the transient-service section.

- [ ] **Step 2: Write failing idle continuation tests**

In `src/runtime-fallback/event-handler-idle-continuation.test.ts`, add a test using `createRuntimeFallbackEventHandler()` with `idleState.globalEnabled = true` and unfinished todos. Send `makeErrorEvent("ses_nonretry", { status: 400, isRetryable: false }, { agent: "orchestrator" })`, then `makeIdleEvent("ses_nonretry")`, and assert no continuation prompt is sent and session data records the stop marker. Add a companion test proving `status: 404, isRetryable: false` does not stop idle continuation.

- [ ] **Step 3: Write failing MCP cwd tests**

In `src/mcp/index.test.ts`, assert:

```ts
const servers = resolveMcpServers(defaultMcpConfig, { cwd, disabledMcps: ["websearch"] })
assert.equal(servers.lsp?.type, "local")
assert.equal(servers.lsp?.type === "local" ? servers.lsp.cwd : undefined, cwd)
```

Also assert that `createBuiltinMcps(..., [], { cwd })` sets only the builtin LSP local server `cwd`, and that explicit `mcp.servers.lsp` still overrides the builtin.

- [ ] **Step 4: Run focused tests for RED**

Run:

```text
node --test --experimental-strip-types src/runtime-fallback/error-classifier.test.ts src/config/schema.test.ts src/runtime-fallback/event-handler-idle-continuation.test.ts src/mcp/index.test.ts
```

Expected: fails because the pattern, idle stop marker, and MCP `cwd` are absent.

- [ ] **Step 5: Implement runtime fallback and idle stop marker**

Add `"upstream request failed"` to `DEFAULT_RUNTIME_FALLBACK_RETRY_PATTERNS`.

Extend `IdleSessionData` with an optional stop marker:

```ts
idleStoppedByNonRetryableRequest?: boolean
```

Add helper `markSessionIdleStoppedByNonRetryableRequest(state, sessionID)` in `idle-state.ts`. It should allocate/refresh generation like abort handling, preserve lifecycle deletion semantics, and set the marker without clearing existing data.

In `event-handler.ts`, after `classifyError()` and before any fallback dispatch, if `classification.retryable === false` and the extracted status is `400` or `422` and the raw error has `isRetryable === false` directly or in a nested `error`/`cause` record, call the marker helper. Do not mark other statuses.

In `handleIdleContinuation()`, return before todo reads when `data?.idleStoppedByNonRetryableRequest === true`.

- [ ] **Step 6: Implement MCP `cwd` support**

Add optional `cwd` to `McpLocalServerConfigSchema`, `McpServerConfig` parsing, `local()` options, and `BuiltinMcpOptions`. Pass `options.cwd` from `resolveMcpServers()` into `createBuiltinMcps()` and from builtin LSP into `local()`.

Keep merge order unchanged so explicit config and `.mcp.json` override builtin LSP.

- [ ] **Step 7: Regenerate schema and run focused GREEN**

Run:

```text
pnpm run gen-schema
node --test --experimental-strip-types src/runtime-fallback/error-classifier.test.ts src/config/schema.test.ts src/runtime-fallback/event-handler-idle-continuation.test.ts src/mcp/index.test.ts
```

Expected: all focused tests pass and `schema.json` includes local MCP `cwd`.

---

### Task 2: Model routing, visible variants, and temperature guard

**Files:**
- Modify: `src/intent/model-family.ts`
- Modify: `src/intent/model-family.test.ts`
- Modify: `src/intent/prompt-loader.ts`
- Modify: `src/hooks/config.ts`
- Modify: `src/hooks/config.test.ts`
- Modify: `src/hooks/chat-params.ts`
- Modify: chat params tests if existing focused coverage requires it (`src/hooks/chat-params*.test.ts`)

**Interfaces:**
- Consumes: `extractModelName(fullId: string)`, `parseGptVersion(modelID: string)`, `isGpt56Model(modelID: string)`, `reasoningToVariant(reasoning)`, and chat params route effects.
- Produces: hosted-vendor GPT name normalization, registered visible `variant`, and stripped unsupported explicit temperature.

- [ ] **Step 1: Write failing model-family tests**

In `model-family.test.ts`, import `parseGptVersion` and `supportsNativeGptMaxReasoning`, then assert:

```ts
assert.equal(extractModelName("amazon-bedrock/openai.gpt-5.6"), "gpt-5.6")
assert.deepEqual(parseGptVersion("amazon-bedrock/us.openai.gpt-5.4"), [5, 4, 0])
assert.equal(supportsNativeGptMaxReasoning("amazon-bedrock/openai.gpt-5.6"), true)
assert.equal(extractModelName("vendor/notgpt.openai.gpt-5.6"), "notgpt.openai.gpt-5.6")
```

Add config/prompt coverage proving `builder` with model `amazon-bedrock/openai.gpt-5.6` receives GPT-5.6 calibration.

- [ ] **Step 2: Write failing config/chat tests**

In `config.test.ts`, assert that configured `agents.planner.models[0].reasoning = "max"` registers `target.agent.planner.variant === "max"`, while `reasoning: "auto"` and `reasoning: "none"` do not register a variant. Existing model, prompt, and route assertions must still pass.

In the chat-params test file, add explicit-temperature cases showing route/user `temperature` is removed for `gpt`/`codex` reasoning-style families and Claude Opus 4.7+ but preserved for unknown or Kimi/MiniMax families.

- [ ] **Step 3: Run focused tests for RED**

Run:

```text
node --test --experimental-strip-types src/intent/model-family.test.ts src/hooks/config.test.ts src/hooks/chat-params.test.ts
```

If this repository has split chat params tests, run the matching `src/hooks/chat-params*.test.ts` files.

- [ ] **Step 4: Implement hosted GPT normalization**

In `extractModelName()`, after stripping provider path, normalize known hosted vendor prefixes only when the suffix is a GPT model ID. The intended cases are `openai.gpt-5.6` and regional `us.openai.gpt-5.4`; arbitrary dotted non-GPT names must stay unchanged.

Update `isGpt56Model()` to call `extractModelName(modelID)` before regex matching.

- [ ] **Step 5: Implement visible variant lowering**

In `applyAgentEntry()` inside `src/hooks/config.ts`, after registration overrides are copied, derive a visible variant from the head fallback entry's canonical `reasoning` when `existing.variant` is unset:

```ts
const visibleVariant = head.reasoning ? reasoningToVariant(head.reasoning) : undefined
if (visibleVariant && existing.variant === undefined) existing.variant = visibleVariant
```

Use local `reasoningToVariant()` so `off`, `auto`, and normalized `none` do not become visible variants.

- [ ] **Step 6: Implement unsupported temperature stripping**

In `chat-params.ts`, add a small guard that deletes or avoids setting `output.temperature` when the family is GPT/Codex or Claude Opus 4.7+ and the current route/entry has explicit temperature. Apply after entry overrides and fast options so the final output is safe. Do not remove temperature for generic, Kimi, MiniMax, Gemini, GLM, DeepSeek, or older Claude unless evidence says they reject it.

- [ ] **Step 7: Run focused GREEN**

Run the same focused tests. Expected: hosted GPT IDs get GPT-5.6 prompt/native max, visible variants are registered only for concrete reasoning levels, and unsupported temperature is stripped only for selected families.

---

### Task 3: Skills, prompts, ast-grep, and maintenance docs

**Files:**
- Modify: `skills/ast-grep/install.ps1`
- Modify: `skills/ast-grep/install.sh`
- Modify: `skills/ast-grep/references/install.md`
- Modify: `skills/ast-grep/SOURCE`
- Modify: `skills/ast-grep/tests/smoke.sh`
- Modify: `skills/v1/writing-plans/SKILL.md`
- Modify: `prompts/v1/agents/plan-critic.md`
- Modify: `prompts/omo/agents/plan-critic.md`
- Modify: `prompts/v1/deepwork/gemini.md`
- Modify: `prompts/v1/deepwork/glm.md`
- Modify: corresponding `prompts/omo/deepwork/gemini.md` and `prompts/omo/deepwork/glm.md` only if needed for prompt-sync alignment
- Modify: `docs/v1-maintenance.md`
- Modify: `docs/prompt-sync.md`
- Modify: prompt/skill source tests in `src/intent/prompt-loader.test.ts` or `src/intent/skill-loader.test.ts`

**Interfaces:**
- Consumes: v1 writing-plans plan-critic loop, local plan-critic receipt prompt, ast-grep installer fallback version.
- Produces: bounded plan-review convergence, proportional Gemini/GLM verification wording, and ast-grep `0.45.0` fallback metadata.

- [ ] **Step 1: Write failing source-contract tests**

Add tests asserting:

```ts
assert.match(writingPlans, /max(?:imum)?\s+5\s+review rounds|5\s+round/i)
assert.match(writingPlans, /blocker eligibility/i)
assert.match(writingPlans, /non-blocking notes/i)
assert.match(writingPlans, /ledger freeze/i)
assert.match(writingPlans, /smallest edit/i)
assert.match(planCriticPrompt, /explicit requirement|accepted decision/i)
assert.match(planCriticPrompt, /non-blocking note/i)
assert.match(geminiPrompt, /Simple.*targeted verification|SCENARIO CONTRACT \(tier-dependent\)/is)
assert.match(glmPrompt, /Moderate.*happy path.*adjacent regression|SCENARIO CONTRACT \(tier-dependent\)/is)
assert.doesNotMatch(geminiPrompt, /TDD \(MANDATORY, NO EXCEPTIONS\)/)
```

Add ast-grep string tests or source assertions that all local ast-grep source files use `0.45.0` and no `0.43.0` remains under `skills/ast-grep`.

- [ ] **Step 2: Run focused tests for RED**

Run:

```text
node --test --experimental-strip-types src/intent/prompt-loader.test.ts src/intent/skill-loader.test.ts
```

- [ ] **Step 3: Update ast-grep skill version strings**

Replace `0.43.0` with `0.45.0` in the installer defaults, docs, SOURCE provenance, and smoke fixture under `skills/ast-grep`. Do not edit the `omo/` upstream worktree.

- [ ] **Step 4: Add bounded plan-review convergence**

In `skills/v1/writing-plans/SKILL.md`, add a bounded convergence subsection under `plan-critic Review Loop`:

- default max rounds: 5, unless the user explicitly requested unlimited review or `review N 次就下一步`;
- blocker eligibility: explicit requirement/accepted decision, existing failing regression, reproducible broken flow, concrete security/data-loss/compatibility risk, external API/provider/release contract conflict;
- ineligible findings become non-blocking notes and approval with notes counts as approval;
- after round 1, freeze the accepted blocker ledger and subsequent rounds validate only those blockers, regressions from fixes, or new eligible blockers;
- fixes must be the smallest plan edit and must not expand scope;
- cap exhaustion stops and asks the user or records delegated-without-plan-approval only when the user explicitly delegated that behavior.

Mirror the blocker eligibility and non-blocking note policy into `prompts/v1/agents/plan-critic.md` and `prompts/omo/agents/plan-critic.md`, preserving local role names and v1 three-state verdict.

- [ ] **Step 5: Proportion Gemini/GLM verification text**

Replace unconditional 3+ scenarios / mandatory no-exceptions TDD wording in Gemini and GLM deepwork prompts with tier-dependent wording:

- Simple: existing test or targeted command; no formal scenario table.
- Moderate: happy path plus one adjacent regression; tests for new behavior, test-after acceptable when straightforward.
- Complex/high-risk: 3+ scenarios and RED/GREEN/SURFACE evidence.
- Exempt pure prompt text, formatting, comments, version bumps, and rename-only changes with final-report justification.

Keep manual QA and final review gates for user-visible or significant implementation work.

- [ ] **Step 6: Update maintenance docs**

In `docs/v1-maintenance.md`, record the writing-plans bounded-convergence adaptation, Gemini/GLM proportional verification update, and ast-grep shared skill version bump if the shared-skill inventory references ast-grep. In `docs/prompt-sync.md`, record the omo/v1 plan-critic convergence alignment and Gemini/GLM prompt proportionality adaptation. Mention excluded `.omo`/Senpi and dual-review systems where relevant.

- [ ] **Step 7: Run focused GREEN**

Run the focused prompt/skill tests. Expected: all source-contract assertions pass.

---

### Task 4: Version bump, generated artifacts, full verification, review, commit, push, release

**Files:**
- Modify: `package.json`
- Generated: `schema.json`
- Generated: `.agents/plugins/marketplace.json`
- Generated: `.codex/agents/**`
- Generated: `plugins/deepwork/**`
- Potential generated package metadata under `plugins/deepwork/package.json` and `plugins/deepwork/.codex-plugin/plugin.json`

**Interfaces:**
- Consumes: source changes from Tasks 1-3 and package version `0.6.10`.
- Produces: consistent version `0.6.11`, regenerated schemas/bundles, verified commit, pushed `master`, pushed tag `v0.6.11`, and release-completion receipt.

- [ ] **Step 1: Bump main package version**

Update `package.json` version from `0.6.10` to `0.6.11`; do not change `ocmm.lspVersion`.

- [ ] **Step 2: Regenerate schema and Codex plugin bundle**

Run:

```text
pnpm run gen-schema
pnpm run build:ts
pnpm run gen:codex-plugin
```

Expected: schema and generated bundle versions reflect source changes and package version.

- [ ] **Step 3: Run targeted and full verification**

Run focused tests from Tasks 1-3, then:

```text
pnpm run typecheck
pnpm test
pnpm run build
git diff --check
```

Run LSP diagnostics on changed TypeScript files. If tests fail, fix the smallest cause and rerun affected gates.

- [ ] **Step 4: Final acceptance review**

Use the requesting-code-review workflow on the complete working-tree diff. Because this is cross-module and release-facing, dispatch both the first available Oracle and the primary-lane Reviewer in parallel if callable; otherwise use the available review profiles and record unavailable profiles. Fix any `[product]` blockers and supply any `[evidence]` blockers, then re-review changed artifacts until every required receipt approves the same current identity.

- [ ] **Step 5: Commit after review**

Inspect:

```text
git status --short
git diff --stat
git diff
git log --oneline -10
```

Stage only intended files and commit with semantic message:

```text
feat: sync upstream workflow fixes for 0.6.11
```

Body: mention runtime fallback/MCP/model compatibility/workflow convergence and version bump. No AI attribution or trailers.

- [ ] **Step 6: Push and tag**

Push the reviewed commit to `master`, create tag `v0.6.11` matching local release style, push the tag, then record the commit SHA.

- [ ] **Step 7: Prove release completion**

Run:

```text
pnpm --silent run check:release-completion -- --mode remote --repository hugefiver/ocmm --tag v0.6.11 --deadline-ms 5400000 --poll-ms 15000
```

If exit `0` and receipt outcome is `COMPLETED`, report release complete with tag, SHA, run URL, assets, and checksum status. If `FAILED` or `UNRESOLVED`, report the fixed tag/SHA/run identity and stop without moving the tag or repairing in place.

---

## Self-Review

- Spec coverage: Tasks cover all approved candidates 1/2/4/6/7/9/10, prompt proportionality, version bump, generated artifacts, verification, review, commit, push, and release proof.
- Placeholder scan: no TODO/TBD placeholders; all paths and commands are concrete.
- Type consistency: interfaces reference existing functions/types and named new optional fields/helpers.
- Scope check: the plan is one coordinated patch release; excluded `.omo`/Senpi/runtime/capability-registry systems remain non-goals.
