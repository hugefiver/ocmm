# ocmm-native upstream adaptations implementation plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt selected upstream omo workflow improvements into ocmm-native OpenCode and Codex behavior, including planner semantics, full-scope prompts, QA/review classification, Codex MultiAgentV2 compatibility, and GPT cross-generation review routing.

**Architecture:** This is a prompt-and-policy change with a small model-routing data update. Workflow semantics live in prompts and v1 skills, default model routing lives in `src/data/agents.ts`, and Codex behavior is emitted by `src/codex/plugin-generator.ts`; tests assert the contracts through real prompt loading, routing resolution, and generated bundle checks.

**Tech Stack:** TypeScript, Node test runner with `--experimental-strip-types`, Zod config/types, markdown prompt files, generated Codex plugin artifacts.

**Global Constraints:**
- Do not wholesale copy upstream wording; adapt as ocmm-native workflow guidance.
- Keep global shell adaptation and GPT-5.6 subagent restraint intact.
- Do not implement polling/background backoff or frontend layout-mechanics in this change.
- Keep OpenCode and Codex behavior as close as practical, while documenting Codex MultiAgentV2 as prompt compatibility only.
- Do not run git write commands inside subagents; final commit/release requires explicit user authorization.

---

### Task 1: Workflow prompt semantics

**Files:**
- Modify: `skills/v1/brainstorming/SKILL.md`
- Modify: `skills/v1/writing-plans/SKILL.md`
- Modify: `skills/v1/requesting-code-review/SKILL.md`
- Modify: `skills/v1/subagent-driven-development/SKILL.md`
- Modify: `prompts/{omo,v1,codex}/deepwork/{default,gpt,gpt-5.6,gemini,glm,codex,planner}.md`
- Modify: `prompts/{omo,v1,codex}/agents/clarifier.md`
- Modify: `docs/v1-maintenance.md`
- Modify: `docs/prompt-sync.md`
- Test: `src/intent/prompt-loader.test.ts`

**Interfaces:**
- Consumes: prompt-loader real path loading through `loadPromptSet()` / existing prompt-loader tests.
- Produces: prompt contracts for discovery-before-planning, complex-purpose planner trigger, answer-when-answerable, full-request scope default, narrower review gate language, and `[product]` / `[evidence]` feedback classification.

- [ ] **Step 1: Add failing prompt-contract tests**

Add tests in `src/intent/prompt-loader.test.ts` that load real `omo`, `v1`, and `codex` prompt sets and assert each effective deepwork variant (`default`, `gpt`, `gpt-5.6`, `gemini`, `glm`, `codex`, `planner`) contains or composes the intended workflow contract where applicable. Do not rely only on a single aggregate `joinedPrompts` assertion. For each workflow, build a map of variant text and assert:

```ts
assert.match(variantText, /answer-when-answerable|answer when answerable/i)
assert.match(variantText, /full requested scope|full-request scope|complete requested outcome/i)
assert.match(variantText, /\[product\]/)
assert.match(variantText, /\[evidence\]/)
assert.doesNotMatch(variantText, /minimum viable|MVP/i)
```

Also assert that v1 brainstorming text contains discovery-before-planning language and that planner trigger text no longer depends only on `5+ steps` or `Task has 2+ steps`.

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
node --test --experimental-strip-types src/intent/prompt-loader.test.ts
```

Expected: FAIL because the new contract strings are not yet present or MVP/minimum-viable wording still exists.

- [ ] **Step 3: Update v1 workflow skills**

Edit `skills/v1/brainstorming/SKILL.md` so the context exploration step explicitly says the first discovery wave comes before decomposition/planner decisions. Preserve the design HARD-GATE.

Edit `skills/v1/writing-plans/SKILL.md` so planner/file-plan usage is tied to relatively complex tasks with clear purpose, unclear boundaries/dependencies after discovery, or durable multi-step coordination. State that clear bounded work may use a contextual plan without writing a plan file.

Edit `skills/v1/requesting-code-review/SKILL.md` and `skills/v1/subagent-driven-development/SKILL.md` so review/QA feedback can label blockers as `[product]` or `[evidence]`, and evidence-only blockers require proof, not product changes.

- [ ] **Step 4: Update model-family prompts**

For `prompts/{omo,v1,codex}/deepwork/{default,gpt,gpt-5.6,gemini,glm,codex,planner}.md`, adapt the following ideas in local wording:

```md
Discovery before planning: run a first evidence-gathering wave before deciding whether planner/decomposition is needed.
Planner trigger: use planner for relatively complex, purpose-clear work when durable coordination is needed; use a contextual plan for clear bounded work.
Answer when answerable: for research/explanation tasks, stop once evidence supports the answer.
Full requested scope: do not reduce to MVP/phase-1 unless the user asks or decomposition is required.
Review/QA labels: classify blockers as [product] or [evidence].
```

Keep existing shell adaptation sections intact. In `gpt-5.6.md`, preserve the GPT-5.6-only subagent restraint and add the new general workflow contracts without turning them into additional GPT-5.6-only behavior.

- [ ] **Step 5: Remove default MVP narrowing from clarifier prompts**

Edit `prompts/{omo,v1,codex}/agents/clarifier.md` so scope questions ask for exact/full requested outcome, explicit exclusions, and decomposition needs, not “minimum viable” or MVP by default.

- [ ] **Step 6: Update sync docs**

Update `docs/v1-maintenance.md` for every changed v1 prompt/skill row. Update `docs/prompt-sync.md` to record these as ocmm-native adaptations inspired by upstream omo, not direct sync.

- [ ] **Step 7: Re-run prompt tests**

Run:

```powershell
node --test --experimental-strip-types src/intent/prompt-loader.test.ts
```

Expected: PASS.

---

### Task 2: Observation notes and GPT cross-generation routing

**Files:**
- Modify: `docs/prompt-sync.md`
- Modify: `src/data/agents.ts`
- Modify: `src/routing/resolver.test.ts`
- Modify: `src/hooks/config.test.ts` if catalog behavior requires explicit coverage
- Modify: `src/codex/plugin-generator.test.ts` for generated model guidance assertions

**Interfaces:**
- Consumes: user-approved observation-only status for polling/background backoff and frontend layout-mechanics; `BUILTIN_AGENTS` model requirements and `resolveModelRouting()` fallback resolution.
- Produces: sync documentation that records observation-only candidates without implementation; reviewer/oracle fallback guidance that preserves configured heterogeneous or cross-generation review entries while allowing GPT-5.6 native max on the primary review lane when selected/requested.

- [ ] **Step 0: Record observation-only upstream candidates**

Update `docs/prompt-sync.md` with an “Observation-only upstream candidates” note:

```md
- Polling/background backoff is tracked as an observation item only; do not implement until ocmm sees repeated wait-loop or stale-polling failures.
- Frontend layout-mechanics is tracked as an observation item only; evaluate in a dedicated frontend skill pass rather than this workflow/model-routing change.
```

Do not edit frontend skill rules or implement backoff behavior in this task.

- [ ] **Step 1: Add failing fallback-chain tests**

In `src/routing/resolver.test.ts`, add assertions that oracle/cross-check routing preserves configured heterogeneous or cross-generation review entries while primary review can use GPT-5.6 native max when selected:

```ts
// Expected oracle/cross-check behavior:
// prefer configured heterogeneous or otherwise non-identical entries before same-lane fallback;
// primary reviewer may use GPT-5.6 native max when selected/requested.
```

Use existing resolver helpers and direct `BUILTIN_AGENTS` inspection if that is the current pattern.

- [ ] **Step 2: Run the failing routing tests**

Run:

```powershell
node --test --experimental-strip-types src/routing/resolver.test.ts
```

Expected: FAIL if oracle/cross-check routing does not preserve configured heterogeneous diversity or if primary review cannot use GPT-5.6 native max when selected.

- [ ] **Step 3: Update model fallback chains**

Edit `src/data/agents.ts` so review entries preserve configured cross-check diversity and primary-review max semantics:

```ts
{ model: "configured-primary-review-model", variant: "max", providers: ["configured-provider"] }
```

Keep oracle/cross-check heterogeneous entries ahead of same-model fallback where configured. Do not delete existing Claude/Gemini/GLM entries unless a test proves they conflict.

- [ ] **Step 4: Guard catalog promotion semantics if needed**

Inspect `selectCatalogModel()` tests. If oracle catalog promotion would always choose a same-generation supplemental lane despite a configured heterogeneous/cross-generation fallback entry, add a test describing intended behavior and adjust only the oracle/cross-check path. Preserve existing primary-lane/catalog successor behavior for primary agents/categories.

- [ ] **Step 5: Re-run routing/config tests**

Run:

```powershell
node --test --experimental-strip-types src/routing/resolver.test.ts src/hooks/config.test.ts src/routing/model-upgrades.test.ts
```

Expected: PASS.

---

### Task 3: Codex workflow skill and MultiAgentV2 compatibility

**Files:**
- Modify: `src/codex/plugin-generator.ts`
- Modify: `src/codex/plugin-generator.test.ts`
- Generated after implementation: `.agents/plugins/marketplace.json`, `.codex/agents/**`, `plugins/deepwork/**`

**Interfaces:**
- Consumes: generated Codex workflow skill text from `renderWorkflowSkill()` and generated agent profile instructions.
- Produces: Codex plugin guidance for MultiAgentV2 flat tools and explicitly configured complex multi-module three-review cross-validation.

- [ ] **Step 1: Add failing generator tests**

In `src/codex/plugin-generator.test.ts`, assert the generated workflow skill contains:

```ts
assert.match(skillText, /MultiAgentV2/i)
assert.match(skillText, /spawn_agent/i)
assert.match(skillText, /wait_agent/i)
assert.match(skillText, /followup_task/i)
assert.match(skillText, /oracle-high/i)
assert.match(skillText, /explicitly configured/i)
assert.match(skillText, /available.*not disabled|not disabled.*available/i)
```

- [ ] **Step 2: Run the failing generator tests**

Run:

```powershell
node --test --experimental-strip-types src/codex/plugin-generator.test.ts
```

Expected: FAIL if the current workflow skill hardcodes a same-generation oracle lane or lacks explicit MultiAgentV2 tool mapping.

- [ ] **Step 3: Update generated workflow text**

Edit `renderWorkflowSkill()` / `codexAgentInstructions()` in `src/codex/plugin-generator.ts`:

- Add MultiAgentV2 tool mapping wording: `spawn_agent`, `wait_agent`, `followup_task`, `interrupt_agent`, `fork_turns` when available; otherwise use existing task/subagent compatibility.
- Update runtime model selection: reviewer can use GPT-5.6 native `max`; oracle/cross-check should preserve cross-generation or heterogeneous diversity according to the configured catalog.
- For complex multi-module tasks, allow three-review cross-validation only when `oracle-high` is explicitly configured by user/profile, available in the current catalog/dispatch surface, and not disabled.

- [ ] **Step 4: Re-run generator tests**

Run:

```powershell
node --test --experimental-strip-types src/codex/plugin-generator.test.ts
```

Expected: PASS.

---

### Task 4: Regenerate bundles and verify

**Files:**
- Generated: `.agents/plugins/marketplace.json`
- Generated: `.codex/agents/**`
- Generated: `plugins/deepwork/**`
- Verify: `schema.json` should not change unless schema code changes unexpectedly.

**Interfaces:**
- Consumes: all source prompt/code changes from Tasks 1-3.
- Produces: synchronized Codex plugin bundle and final verification evidence.

- [ ] **Step 1: Run full build before generation**

Run:

```powershell
pnpm run build
```

Expected: TypeScript build and LSP build succeed. If Windows reports `EPERM` for `dist/bin/ocmm-lsp-*.exe`, identify and stop only the stale workspace LSP process holding that exact path, then rerun `pnpm run build`.

- [ ] **Step 2: Regenerate Codex plugin**

Run after the full build so the Codex bundle copies fresh runtime assets:

```powershell
pnpm run gen:codex-plugin
```

Expected: generator writes 22 agents, 14 skills, 4 MCP servers, `.codex/agents`, and `.agents/plugins/marketplace.json`.

- [ ] **Step 3: Run targeted tests**

Run with local profile cleared:

```powershell
$oldProfile = $env:OCMM_PROFILE; $env:OCMM_PROFILE = $null; node --test --experimental-strip-types src/intent/prompt-loader.test.ts src/routing/resolver.test.ts src/routing/model-upgrades.test.ts src/hooks/config.test.ts src/codex/plugin-generator.test.ts; $testExit = $LASTEXITCODE; $env:OCMM_PROFILE = $oldProfile; exit $testExit
```

Expected: all targeted tests pass.

- [ ] **Step 4: Run full verification**

Run:

```powershell
git diff --check
pnpm run typecheck
$oldProfile = $env:OCMM_PROFILE; $env:OCMM_PROFILE = $null; pnpm test; $testExit = $LASTEXITCODE; $env:OCMM_PROFILE = $oldProfile; if ($testExit -ne 0) { exit $testExit }
pnpm run build
pnpm run gen:codex-plugin
git diff --check
```

Expected: no whitespace errors, typecheck passes, TypeScript and Rust tests pass, full build succeeds, regenerated Codex artifacts remain synchronized.

- [ ] **Step 5: Final acceptance review**

Dispatch both `oracle` and `reviewer` over the final diff because this touches prompts, generated bundles, model routing, and workflow semantics. Fix Critical/Important findings, regenerate as needed, and repeat until both approve.
