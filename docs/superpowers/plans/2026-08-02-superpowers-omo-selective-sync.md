# Superpowers and OMO Selective Sync Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 1, 2, and 3 have disjoint source/test files and may run in parallel; Task 4 follows their integration because Task 2 also updates README, and Task 5 performs final generation and verification.

**Goal:** Selectively sync Superpowers v6.2.0 prompt improvements, expand transient runtime-fallback recognition, and add lightweight bounded research without changing ocmm's implicit planning semantics.

**Architecture:** Keep each behavior in its existing authoritative layer: v1 skill sources for workflow policy, `src/config/schema.ts` for fallback defaults, and aligned research category prompts for research behavior. Preserve user override semantics and existing identity-bound review; regenerate Codex artifacts only after all source edits integrate.

**Tech Stack:** Markdown prompt/skill sources, TypeScript, Zod, Node `node:test`, pnpm Codex/schema generators.

**Global Constraints:**
- No SDD workspace, progress ledger, workspace cleanup script, automatic worktree, or subagent Git write.
- No routine spec-reviewer or code-quality-reviewer pass after each subtask.
- No runtime plan-state tracker or strict explicit-request/plan-artifact gate.
- No OMO status-event retry feature, data-scientist skill, model-chain update, or Senpi runtime subsystem.
- Preserve user-provided `retryOnPatterns` replacement semantics.
- Keep ordinary research subject to Answer-When-Answerable; no mandatory persistence or new tools.
- Commands must remain short and inspectable and must not use `$home` or a case variant as a PowerShell custom variable. No ad hoc recursive or batch deletion is allowed. The official Codex generator is the sole exception after its exact generated roots are inspected; its existing containment check must remain unchanged, and no deletion target may come from a shell variable.
- Do not commit, stage, push, tag, or perform another Git write without separate explicit user authorization.

---

### Task 1: Selective Superpowers v6.2.0 skill adaptation

**Files:**
- Modify: `skills/v1/brainstorming/SKILL.md`
- Modify: `skills/v1/writing-plans/SKILL.md`
- Modify: `skills/v1/requesting-code-review/SKILL.md`
- Modify: `skills/v1/receiving-code-review/SKILL.md`
- Modify: `skills/v1/dispatching-parallel-agents/SKILL.md`
- Modify: `skills/v1/subagent-driven-development/SKILL.md`
- Modify: `skills/v1/subagent-driven-development/implementer-prompt.md`
- Test: `src/intent/skill-loader.test.ts`

**Interfaces:**
- Consumes: existing v1 skill loading and final-review identity contracts.
- Produces: updated source skills with same-stage continuation, bounded correction, scoped recheck, and falsifiable-test guidance.

- [ ] **Step 1: Add failing source-contract tests**

Add a v1 source-contract test in `src/intent/skill-loader.test.ts` that reads the
repository skill sources and asserts:

```ts
assert.match(skill, /same implementer.*task_id|continue.*same implementer.*task_id/is)
assert.match(skill, /two correction rounds.*same blocker|two.*no.*progress/is)
assert.match(skill, /five correction rounds.*hard ceiling/is)
assert.match(skill, /recheck only.*affected blocker|affected evidence/is)
assert.match(implementer, /observable input, action, and output/i)
assert.match(implementer, /production change.*make the test fail/i)
assert.match(implementer, /expected values.*not.*derived.*implementation/i)
assert.match(implementer, /mutation check/i)
assert.match(implementer, /structural contract tests/i)
```

Also assert that the five synced skills identify v6.2.0 and that SDD contains no
normative requirement to create an automatic workspace, ledger, cleanup script,
or subagent commit.

- [ ] **Step 2: Run the focused test and capture RED**

Run:

```text
node --test --experimental-strip-types src/intent/skill-loader.test.ts
```

Expected: FAIL because the continuation, bounded-correction, and falsifiable-test wording is not present yet.

- [ ] **Step 3: Apply the selected v6.2.0 prose reductions**

- `brainstorming`: update provenance to v6.2.0, add `YAGNI ruthlessly` under approach exploration, and remove the final `Key Principles` recap.
- `writing-plans`: update provenance to v6.2.0 and remove `## Remember`.
- `dispatching-parallel-agents`: update provenance to v6.2.0; remove the time-saved sentence, `Key Benefits`, and `Real-World Impact` while preserving verification and integration rules.
- `receiving-code-review`: update provenance to v6.2.0 and remove `The Bottom Line`.
- `requesting-code-review`: update provenance to v6.2.0 while preserving the canonical identity module, seven-field packet, five-field receipt, and local reviewer selection.
- `subagent-driven-development`: update provenance to v6.2.0 while explicitly
  recording that workspace/ledger scripts, automatic cleanup, routine per-task
  reviews, and subagent Git writes remain rejected local differences.

- [ ] **Step 4: Add SDD continuation and bounded-correction behavior**

In `subagent-driven-development/SKILL.md`:

- Continue the same implementer `task_id` for corrections to the same task/artifact.
- Start fresh when task, goal, stage, or artifact objective changes, or context is stale/unavailable.
- Recheck only the affected blocker, files, and evidence after a correction.
- After two no-progress rounds, require controller adjudication before another dispatch.
- Stop automatic correction after five rounds; do not approve with open blockers.
- Remove the upstream-style `Advantages` recap.

Do not introduce a workspace, ledger, automatic cleanup, per-task full review, subagent Git write, or fixed model ladder.

- [ ] **Step 5: Add falsifiable-test guidance**

In `implementer-prompt.md`, replace the generic testing checklist with rules requiring observable input/action/output, a named production mutation that should fail, independent expected values, and a lightweight mutation check for high-risk/subtle behavior. State that marker/inventory/generated-file tests are valid structural contracts but cannot be the only runtime-behavior evidence.

- [ ] **Step 6: Re-run the focused test and capture GREEN**

Run the same Node test command.

Expected: all `src/intent/skill-loader.test.ts` tests pass.

---

### Task 2: Expand bounded runtime-fallback retry defaults

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/runtime-fallback/error-classifier.test.ts`
- Modify: `src/config/schema.test.ts`
- Modify: `README.md`
- Modify: `examples/ocmm.example.jsonc`

**Interfaces:**
- Consumes: `classifyError(error, config, now?)` and existing `runtimeFallback.retryOnPatterns` replacement semantics.
- Produces: one canonical default regex array used by both runtime default constructors and documentation.

- [ ] **Step 1: Add failing positive, negative, and override tests**

Add a positive matrix to `error-classifier.test.ts` covering request pressure, usage/quota exhaustion, credential cooling, unsupported models, transient service errors, standalone textual `429`/`503`/`529`, and all approved Chinese messages. Add negative cases for bare `quota`, `4290`, `503abc`, `5299`, `context limit exhausted`, `input exceeds the context window; reduce it and try again`, supported-model documentation, and `invalid request payload; correct it and try again`.

Add an explicit override test:

```ts
const override = { ...cfg, retryOnPatterns: ["provider-specific failure"] }
assert.equal(classifyError("provider-specific failure", override).retryable, true)
assert.equal(classifyError("rate limit", override).retryable, false)
```

In `schema.test.ts`, assert the complete literal default array returned by `defaultConfig().runtimeFallback.retryOnPatterns`.

- [ ] **Step 2: Run focused tests and capture RED**

Run:

```text
node --test --experimental-strip-types src/runtime-fallback/error-classifier.test.ts src/config/schema.test.ts
```

Expected: FAIL because the new patterns are absent.

- [ ] **Step 3: Define and reuse the canonical pattern array**

Add `DEFAULT_RUNTIME_FALLBACK_RETRY_PATTERNS` in `src/config/schema.ts` and use copies of it in both `defaultRuntimeFallbackConfig()` and `RuntimeFallbackConfigSchema`.

The array keeps existing bounded server failures and adds these semantic forms:

```ts
[
  "rate.?limit",
  "too.?many.?requests",
  "usage.?quota.{0,20}?(?:exceeded|exhausted|reached)",
  "quota.?exceeded",
  "(?:exceeded|exhausted|reached).{0,20}?quota",
  "free.?usage.{0,20}?(?:exceeded|exhausted|limit)",
  "usage.?exceeded",
  "(?:usage|quota)\\s+limit\\s+exhausted",
  "exhausted\\s+your\\s+capacity",
  "all\\s+credentials\\s+for\\s+model",
  "cool(?:ing)?\\s+down",
  "model.{0,20}?not.{0,10}?supported",
  "model_not_supported",
  "service.?unavailable",
  "temporarily.?unavailable",
  "overloaded",
  "internal server error",
  "gateway timeout",
  "bad gateway",
  "try\\s+again\\s+(?:later|shortly|in\\s+\\d+\\s*(?:seconds?|minutes?))",
  "\\b429\\b",
  "\\b503\\b",
  "\\b529\\b",
  "使用上限",
  "频率限制",
  "请求过于频繁",
  "暂时不可用",
  "服务不可用",
  "请稍后重试",
]
```

Do not add bare `quota`, `unavailable`, `credit`, `balance`, `timeout`, or `connection error`.

- [ ] **Step 4: Synchronize documented defaults**

Replace the stale arrays in `README.md` and `examples/ocmm.example.jsonc` with the canonical list. Leave the historical implementation plan unchanged.

- [ ] **Step 5: Re-run focused tests and capture GREEN**

Run the same two-file Node test command.

Expected: all focused tests pass, including user override and negative cases.

---

### Task 3: Add lightweight bounded research semantics

**Files:**
- Modify: `prompts/omo/category/research.md`
- Modify: `prompts/v1/category/research.md`
- Modify: `prompts/codex/category/research.md`
- Modify: `src/intent/prompt-loader.test.ts`
- Modify: `docs/prompt-sync.md`

**Interfaces:**
- Consumes: existing research category loading and global Answer-When-Answerable policy.
- Produces: aligned optional bounded-excursion guidance in all three workflow sources.

- [ ] **Step 1: Add a failing cross-workflow prompt test**

Add a focused test that loads each workflow and asserts the research prompt contains exactly one `## BOUNDED RESEARCH` section plus branch question, small evidence/time budget, exit condition, fold-back, repeated no-value stopping, and optional concise evidence-count wording.

- [ ] **Step 2: Run the focused test and capture RED**

Run:

```text
node --test --experimental-strip-types src/intent/prompt-loader.test.ts
```

Expected: FAIL because the bounded-research section is absent.

- [ ] **Step 3: Add the aligned conditional section**

Insert after `## OPERATING POSTURE` in all three category sources:

```md
## BOUNDED RESEARCH

For complex research, state the specific branch question before exploring it and set a small evidence or time budget. Define the exit condition up front: stop when the branch answers the question, the evidence is sufficient, or further lookup is unlikely to change the conclusion. Fold useful findings back into the caller's main question rather than opening additional branches. After repeated excursions produce no new decision-relevant evidence, stop exploring. Close with the answer and, when useful, a concise count of sources, checks, or unresolved gaps.
```

Do not add journals, ledgers, teams, mandatory files, new tools, or fixed runtime timers.

- [ ] **Step 4: Update prompt synchronization documentation**

Record the OMO source baseline `b072d2791`, bounded-research adaptation, cross-workflow alignment, and explicitly rejected persistence/team/document requirements in `docs/prompt-sync.md`.

- [ ] **Step 5: Re-run the focused test and capture GREEN**

Run the same prompt-loader command.

Expected: all prompt-loader tests pass.

---

### Task 4: Remove the local GitHub-token publishing preflight

**Files:**
- Modify: `skills/publish/SKILL.md`
- Modify: `AGENTS.md`
- Modify: `README.md` (after Task 2's retry-pattern documentation update)
- Test: `src/release-completion-cli.test.ts`

**Interfaces:**
- Consumes: existing optional `githubToken` checker option and fail-closed
  `UNRESOLVED` GitHub Packages surface.
- Produces: release instructions that never block authorized version/tag
  publication on a workstation token while preserving truthful completion
  receipts.

- [ ] **Step 1: Add failing no-token operational-contract tests**

In `src/release-completion-cli.test.ts`, add one test that invokes remote `main`
with an empty environment, asserts `runtime.check` is called with no
`githubToken`, returns an `UNRESOLVED` fixture, and maps it to exit `2` with one
JSON receipt. Add a source-contract test that reads `skills/publish/SKILL.md`,
`AGENTS.md`, and `README.md`, rejects the
`IsNullOrWhiteSpace($env:GITHUB_TOKEN)` throwing
preflight, and requires wording that the token is optional authentication for
GitHub Packages proof rather than a publishing prerequisite.

- [ ] **Step 2: Run the focused test and capture RED**

Run:

```text
node --test --experimental-strip-types src/release-completion-cli.test.ts
```

Expected: FAIL because the publish skill and repository instructions still
contain the throwing token preflight.

- [ ] **Step 3: Remove only the local preflight**

In `skills/publish/SKILL.md`, `AGENTS.md`, and `README.md`:

- invoke `pnpm --silent run check:release-completion ...` directly;
- state that local `GITHUB_TOKEN` is optional and enables authenticated GitHub
  Packages proof;
- state that a main tag push without that proof returns `UNRESOLVED`/exit `2`
  but the authorized tag and CI publication are not blocked;
- preserve `COMPLETED` as the only completion outcome, token redaction,
  immutable tags, and no in-place repair.

Do not change `.github/workflows/release.yml`; CI continues using its own
`${{ github.token }}`.

- [ ] **Step 4: Re-run the focused test and capture GREEN**

Run the same release CLI test command.

Expected: all release CLI tests pass, including no-token invocation and secret
redaction.

---

### Task 5: Integrate maintenance docs and generated artifacts

**Files:**
- Modify: `docs/v1-maintenance.md`
- Generate: `plugins/deepwork/skills/deepwork-*/**`
- Generate: `plugins/deepwork/skills/publish/**`
- Generate: `plugins/deepwork/agents/dw-*.toml` (all profiles embed brainstorming)
- Generate: `.codex/agents/dw-*.toml` (all profiles embed brainstorming)
- Verify: `schema.json`
- Test: `src/codex/plugin-generator.test.ts`

**Interfaces:**
- Consumes: completed Tasks 1–4 source changes.
- Produces: synchronized provenance docs, deterministic generated Codex copies, and full repository evidence.

- [ ] **Step 1: Update v1 maintenance mapping**

Set all six v1 Superpowers fork rows to the reviewed v6.2.0 baseline/date while preserving local adjustments. Record:

- the five selected prose reductions;
- SDD same-task continuation, scoped recheck, no-progress adjudication, and hard ceiling;
- falsifiable behavioral-test guidance and structural-contract distinction;
- the bounded-research alignment across v1/Codex;
- rejection of strict runtime plan gating because implicit planner, inline plan, clarifier, delegated approval, and direct implementation paths remain valid.
- the publish skill's optional local token semantics and retained fail-closed
  completion result.

- [ ] **Step 2: Regenerate schema and prove no schema-shape drift**

Run:

```text
pnpm run gen-schema
```

Expected: command succeeds; `schema.json` has no semantic diff because only default values changed.

- [ ] **Step 3: Regenerate the Codex plugin bundle**

Before generation, inspect and confirm these exact repository-owned roots:

```text
.codex/agents
plugins/deepwork/agents
plugins/deepwork/skills
plugins/deepwork/dist
```

The generator's `resetGeneratedDir()` resolves each path and rejects any target
outside its expected project/plugin root. This verified official generator is
the only recursive-reset exception in this task; do not run a separate delete
command and do not pass a shell variable as a deletion target.

Run:

```text
pnpm run gen:codex-plugin
```

Expected: generated v1 and shared skill copies reflect their sources; all
generated profiles reflect the updated embedded brainstorming source;
`dw-research` also reflects bounded research. No unrelated generated surface
changes.

- [ ] **Step 4: Run focused integrated tests**

Run:

```text
node --test --experimental-strip-types src/intent/skill-loader.test.ts src/intent/prompt-loader.test.ts src/runtime-fallback/error-classifier.test.ts src/config/schema.test.ts src/release-completion-cli.test.ts src/release-completion-registries-retry.test.ts src/codex/plugin-generator.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 5: Run repository gates**

Run each command separately:

```text
pnpm run typecheck
pnpm test
pnpm run build
git diff --check
```

Expected: every command exits 0. If the environment exposes a pre-existing `OCMM_PROFILE`, clear it only for the test process. Use the already installed direct CPython path if the coding-agent-sessions tests require it; do not install additional software.

- [ ] **Step 6: Verify scope and perform final acceptance**

Inspect `git status --short` and `git diff --stat`; confirm only the approved sources, docs, tests, spec/plan, and deterministic generated artifacts changed. Compute the canonical working-tree identity from `skills/v1/requesting-code-review/SKILL.md`, dispatch the required Oracle and Reviewer lanes with one common packet, and accept only matching current-identity `approved` receipts.
