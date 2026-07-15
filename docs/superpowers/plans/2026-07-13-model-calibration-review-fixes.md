# Model Calibration Review Fixes Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make catalog promotion, prompt calibration, runtime routing, fallback behavior, and GPT reviewer/oracle reasoning obey one consistent effective-model policy.

**Architecture:** Add a pure shared model-upgrade module, record final registered models during config registration, and consume the shared policy in resolver/fallback paths. Keep category prompts authoritative while appending the guarded GPT-5.6 calibration, then regenerate all Codex artifacts.

**Tech Stack:** TypeScript 6, Node test runner, Zod configuration, pnpm, Rust/Cargo build verification.

**Global Constraints:**
- Work only in `C:/Users/hugefiver/source/ocmm-wt-fix-051-review` on `codex/fix-0.5.1-review`.
- Do not commit, push, tag, or modify the main worktree without explicit user authorization.
- Preserve explicit model choice and alias inheritance.
- GPT reviewer/oracle reasoning is never below `xhigh`; local `max` remains available for complex/high-risk work.
- Any `skills/v1` or `prompts/v1` edit must update `docs/v1-maintenance.md`; any `prompts/omo` edit must update `docs/prompt-sync.md`.
- Regenerate `.codex/agents`, `.agents/plugins/marketplace.json`, and `plugins/deepwork` after generator-source changes.

**Shared State Contract:**
- `src/index.ts` owns one `const registeredAgentModels = new Map<string, string>()` per plugin instance.
- Map keys are final registered agent/category names; values are canonical `providerID/modelID` strings exactly as written to `target.agent[name].model`.
- `createConfigHandler` accepts `registeredAgentModels?: Map<string, string>`, clears it at the start of every config-hook invocation (including `registerBuiltinAgents=false`), and repopulates it only after builtins, categories, custom agents, and compatibility aliases are finalized.
- `createEventHandler` accepts `registeredAgentModels?: ReadonlyMap<string, string>` and forwards it to `RuntimeFallbackDeps`; the fallback handler reads but never mutates it.
- Config reloads cannot leave stale entries: the next config registration clears/rebuilds the same plugin-instance map. Session creation/deletion clears per-session fallback state only, not registered model state.

---

### Task 1: Centralize catalog and successor policy

**Files:**
- Create: `src/routing/model-upgrades.ts`
- Create: `src/routing/model-upgrades.test.ts`
- Modify: `src/hooks/config.ts`
- Modify: `src/hooks/config.test.ts`

**Interfaces:**
- Consumes: `ModelRequirement`, `FallbackEntry`, host provider catalog records.
- Produces: `selectCatalogModel(target, agentName, requirement): string | undefined` and `matchRequirementSuccessor(requirement, providerID, modelID): FallbackEntry | null`.

- [ ] **Step 1: Add failing policy tests**

Cover:

```ts
assert.equal(selectCatalogModel(targetWithPrimaryLane, "reviewer", reviewerRequirement), "configured-primary-successor-model")
assert.equal(selectCatalogModel(targetWithOnlyOlderPrimaryLane, "reviewer", reviewerRequirement), undefined)
assert.equal(matchRequirementSuccessor(reviewerRequirement, "configured-provider", "configured-primary-successor-model")?.model, "configured-primary-successor-model")
assert.equal(matchRequirementSuccessor(oracleRequirement, "configured-provider", "configured-cross-check-successor-model")?.model, "configured-cross-check-successor-model")
```

Add config-hook regressions for reviewer model inheritance plus `oracle: { description: "..." }`, existing host GPT-5.6 model calibration, and provider priority.

Use this exact alias fixture and assertions:

```ts
const configured = {
  ...defaultConfig(),
  agents: {
    reviewer: { model: "configured-primary-review-model" },
    oracle: { description: "custom oracle" },
  },
}
const registeredAgentModels = new Map<string, string>()
const target = {
  agent: {},
  provider: { configured: { models: { "configured-cross-check-successor-model": {} } } },
}
await createConfigHandler({ getConfig: () => configured, registeredAgentModels })(target, undefined)
assert.equal((target.agent.oracle as Record<string, unknown>).model, "configured-primary-review-model")
assert.equal(registeredAgentModels.get("oracle"), "configured-primary-review-model")
```

- [ ] **Step 2: Run targeted tests and capture RED**

Run:

```powershell
node --test --experimental-strip-types src/routing/model-upgrades.test.ts src/hooks/config.test.ts
```

Expected: new assertions fail against the current implementation.

- [ ] **Step 3: Implement the pure policy and config integration**

Use numeric version tuples, a minimum GPT tuple of `[5, 6, 0]`, and provider indexes taken from the compatible fallback entry. In `config.ts`, suppress promotion when the normalized effective requirement came from an explicit model or `defaultAlias`, pass the existing/final model into prompt selection, and populate an optional `registeredAgentModels` map from final agent entries.

Required public signatures:

```ts
export function selectCatalogModel(
  target: Record<string, unknown>,
  agentName: string,
  requirement: ModelRequirement,
): string | undefined

export function matchRequirementSuccessor(
  requirement: ModelRequirement,
  providerID: string | undefined,
  modelID: string,
): FallbackEntry | null
```

Required config-handler shape:

```ts
export function createConfigHandler(args: {
  getConfig: () => OcmmConfig
  skillsRoot?: string
  cwd?: string
  registeredAgentModels?: Map<string, string>
}) { /* ... */ }

args.registeredAgentModels?.clear()
// ...finish all registration and aliases...
for (const [name, raw] of Object.entries(agentMap)) {
  if (isRecord(raw) && typeof raw.model === "string") {
    args.registeredAgentModels?.set(name, raw.model)
  }
}
```

- [ ] **Step 4: Re-run targeted tests**

Expected: all Task 1 tests pass and existing explicit-model tests remain green.

### Task 2: Align runtime routing, fallback, and review reasoning

**Files:**
- Modify: `src/routing/resolver.ts`
- Modify: `src/routing/resolver.test.ts`
- Modify: `src/hooks/chat-params.ts`
- Modify: `src/hooks/chat-params.test.ts`
- Modify: `src/runtime-fallback/event-handler.ts`
- Modify: `src/runtime-fallback/event-handler.test.ts`
- Modify: `src/hooks/event.ts`
- Modify: `src/index.ts`
- Modify: `src/data/agents.ts`

**Interfaces:**
- Consumes: `matchRequirementSuccessor`, shared registered-model map, actual chat/event model IDs.
- Produces: alias-aware shared effective-requirement resolution, successor-aware `Resolution`, correct fallback starting index, and reviewer/oracle GPT effort floor.

- [ ] **Step 1: Add failing routing and reasoning tests**

Add assertions that:

```ts
resolveModelRouting({ agentName: "reviewer", providerID: "configured-provider", modelID: "configured-primary-successor" })
// returns the configured primary successor, source === "agent-default", variant === "xhigh"

// chat.params reviewer/oracle with GPT and no/lower variant
// emits reasoningEffort === "xhigh"

// explicit max remains the applied max variant and emits the target maximum
```

Add fallback tests where the actual registered/event model is outside the static chain; the first dispatched fallback must be chain index 0, not index 1.

Add two exact fallback regressions:

```ts
// A secondary provider is still the same static chain layer.
// requirement entry: configured primary and secondary providers for model "configured-primary-review-model"
// failed event model: secondary configured provider with the same configured model
// expected: do not dispatch that same entry again.

// Versioned-alias boundaries are explicit.
// model-a-20260713 matches model-a; model-a2 does not match model-a.

// A description-only oracle inherits the reviewer user chain.
// reviewer: primary + fallback-a + fallback-b; oracle: { description: "custom" }
// expected first retry follows reviewer fallback-a, not builtin oracle chain.
```

Replace these existing expectations rather than adding contradictory coverage:

```ts
// src/routing/resolver.test.ts
// "oracle routes to its own cross-gen builtin chain"
assert.equal(oracle!.variant, "xhigh")

// src/hooks/chat-params.test.ts
// default reviewer on GPT: high -> xhigh
assert.equal(output.options.reasoningEffort, "xhigh")

// explicit reviewer minimal/medium no longer bypasses the review floor
assert.equal(minimalOutput.options.reasoningEffort, "xhigh")
assert.equal(mediumOutput.options.reasoningEffort, "xhigh")
```

Add distinct cases for both roles and all override boundaries:

```ts
for (const agentName of ["reviewer", "oracle", "oracle-high", "plan-critic"]) {
  // absent variant -> xhigh
  // explicit minimal -> xhigh
  // explicit xhigh -> xhigh
  // explicit max -> applied variant max and native max only on max-capable targets; older GPT-like targets gate to xhigh
  // direct reasoningEffort "low" -> final xhigh
  // direct reasoningEffort "max" -> native max only on GPT-5.6-capable targets; older/unknown GPT-like targets gate to xhigh
}
```

- [ ] **Step 2: Run targeted tests and capture RED**

```powershell
node --test --experimental-strip-types src/routing/resolver.test.ts src/hooks/chat-params.test.ts src/runtime-fallback/event-handler.test.ts
```

- [ ] **Step 3: Implement successor matching and fallback initialization**

Extract and export an alias-aware requirement resolver from `src/routing/resolver.ts`:

```ts
export function resolveEffectiveRequirement(opts: {
  agentName: string
  agentsConfig?: Record<string, AgentEntry>
  categoriesConfig?: Record<string, CategoryEntry>
}): { requirement: ModelRequirement; source: Resolution["source"] } | null
```

It preserves the existing priority: direct/canonical user agent requirement, builtin `defaultAlias`, builtin agent requirement, user category requirement, builtin category requirement. `resolveModelRouting` and `runtime-fallback/event-handler.ts` must both call this helper, eliminating the event handler's separate `getRequirementForAgent` implementation.

Pass `providerID` through model matching. On first fallback error, derive the initial model from the event, then registered map, then chain head; set `fallbackIndex` to its exact static chain index or `-1`, and set `activeModel` to that initial key.

Constructor/data-flow changes are exact:

```ts
// src/index.ts
const registeredAgentModels = new Map<string, string>()
config: createConfigHandler({ getConfig, cwd, registeredAgentModels })
// pass the same map to createEventHandler

// src/hooks/event.ts and RuntimeFallbackDeps
registeredAgentModels?: ReadonlyMap<string, string>

// first session.error state
const registeredModel = agent ? deps.registeredAgentModels?.get(agent) : undefined
const initialKey = eventModel
  ? modelKey(eventModel.providerID, eventModel.modelID)
  : registeredModel ?? chainHeadKey
state = createFallbackState(initialKey)
state.activeModel = initialKey
state.fallbackIndex = requirement.fallbackChain.findIndex(
  (entry) => entry.providers.includes(initialProviderID)
    && (initialModelID === entry.model
      || new RegExp(`^${escapeRegExp(entry.model)}[-_.]`).test(initialModelID)),
)
// All providers in an entry are equivalent for exact/versioned-alias matching.
// Catalog successors are deliberately not treated as the same static entry:
// findIndex returns -1 so the ordered fallback chain restarts at index 0.
// so findNextAvailableFallback starts at index 0.
```

The handler must retain the parsed `{ providerID, modelID }` used to build `initialKey`; do not recover it by splitting an opaque string. The registered map value may be parsed at its first `/`, matching the repository's canonical provider/model format.

Use the same boundary-aware exact/versioned-alias predicate in resolver and fallback code. Do not use raw `startsWith`; it must not treat unrelated model IDs that merely share a prefix as the same fallback layer.

- [ ] **Step 4: Enforce review and plan-review reasoning floor**

Change review and plan-review fallback entries to at least xhigh-equivalent effort. In chat params, floor applied variant and final direct reasoning controls after all overrides:

```ts
const REVIEW_AGENTS = new Set(["reviewer", "oracle", "oracle-high", "plan-critic"])
// below xhigh or missing -> xhigh-equivalent; GPT-5.6-capable max remains native max;
// older/unknown GPT-like max gates to xhigh
```

Apply the floor twice in the existing ordering:

1. Before `translateVariant`, replace absent/below-`xhigh` `appliedVariant` with `xhigh`; preserve local `max` as a semantic request.
2. After direct `resolution.entry.reasoningEffort` and all other entry controls are applied, replace absent/below-`xhigh` final effort with the family-specific xhigh-equivalent; preserve native `max` only for GPT-5.6-capable GPT-like/Codex-like targets and other max-capable families.

The floor activates only for review and plan-review agents. Other agents retain existing explicit-variant semantics.

- [ ] **Step 5: Re-run targeted tests**

Expected: successor entries, fallback order, and xhigh/max policy all pass.

### Task 3: Calibrate category prompts and Codex profiles

**Files:**
- Modify: `src/hooks/config.ts`
- Modify: `src/hooks/config.category.test.ts`
- Modify: `src/codex/plugin-generator.ts`
- Modify: `src/codex/plugin-generator.test.ts`
- Modify: `skills/v1/requesting-code-review/SKILL.md`
- Modify: `docs/v1-maintenance.md`

**Interfaces:**
- Consumes: final selected category model and `getDeepworkPrompt("gpt-5.6")`.
- Produces: category prompt with guarded additive calibration; generated reviewer/oracle profile effort `xhigh`.

- [ ] **Step 1: Add failing prompt/generator assertions**

Assert all ten category profiles contain the guarded model-family execution calibration, host category selections for that family receive the layer, and generated reviewer/oracle TOML contains the expected review effort floor.

Use `buildCodexAgents(...)` to iterate the exact category names from `BUILTIN_CATEGORIES` and assert every corresponding `developerInstructions` contains the calibration. In the self-contained bundle test, read `dw-reviewer.toml` and assert both reviewer and oracle contain `model_reasoning_effort = "xhigh"`.

- [ ] **Step 2: Run targeted tests and capture RED**

```powershell
node --test --experimental-strip-types src/hooks/config.category.test.ts src/codex/plugin-generator.test.ts
```

- [ ] **Step 3: Compose category calibration and update policy copy**

Keep `getCategoryPrompt(c.name)` authoritative. Append only the matching family calibration layer inside the existing workflow-calibration envelope when the final selected OpenCode model matches that family; always carry the guarded layer for Codex packaging. Update generated deepwork tables and instructions to say review agents use an xhigh-equivalent floor and max-capable selected models can use native `max` when requested.

- [ ] **Step 4: Update the v1 skill and source-mapping row together**

Add the same reasoning policy and optional plan-oracle semantics to `requesting-code-review`, and record both in its `docs/v1-maintenance.md` row.

- [ ] **Step 5: Re-run targeted tests**

Expected: prompt and generator assertions pass.

### Task 4: Repair documentation contracts

**Files:**
- Modify: `docs/prompt-sync.md`
- Modify: `docs/v1-maintenance.md`
- Modify: `skills/frontend/references/design/README.md`
- Modify: `skills/frontend/references/design/design-system-architecture.md`
- Modify: `src/intent/plan-review-contract.test.ts`
- Modify: `src/codex/plugin-generator.test.ts`

**Interfaces:**
- Consumes: repository prompt-sync rules and frontend gate definitions.
- Produces: internally consistent maintenance and frontend contracts.

- [ ] **Step 1: Add contract assertions**

Assert the prompt layout includes `gpt-5.6`, v1 rows mention current receipt/optional oracle behavior, frontend docs say nine sections, and planned showcase primitives are explicitly distinct from reusable components used two or more times.

Exact required phrases:

```ts
assert.match(promptSync, /deepwork\/\{default,gpt,gpt-5\.6,gemini,glm,codex,planner\}/)
assert.match(v1Maintenance, /optional high-risk plan consultation/i)
assert.match(v1Maintenance, /current plan revision/i)
assert.match(frontendArchitecture, /nine sections/i)
assert.match(frontendArchitecture, /Planned Showcase Primitives/)
assert.match(frontendArchitecture, /not reusable component documentation/i)
```

- [ ] **Step 2: Run contract tests and capture RED**

```powershell
node --test --experimental-strip-types src/intent/plan-review-contract.test.ts src/codex/plugin-generator.test.ts
```

- [ ] **Step 3: Update source and maintenance docs**

Use `Planned Showcase Primitives` as a pre-implementation verification checklist; retain component documentation only for implemented reusable patterns. Correct all eight/nine wording and prompt layout examples.

- [ ] **Step 4: Re-run contract tests**

Expected: all contract assertions pass.

### Task 5: Regenerate and verify the release surface

**Files:**
- Regenerate: `.agents/plugins/marketplace.json`
- Regenerate: `.codex/agents/*.toml`
- Regenerate: `plugins/deepwork/**`

**Interfaces:**
- Consumes: generator source, prompts, skills, and current package version.
- Produces: deterministic self-contained Codex plugin bundle.

- [ ] **Step 1: Build TypeScript and regenerate**

```powershell
pnpm run build:ts
pnpm run gen:codex-plugin
```

- [ ] **Step 2: Verify targeted and full suites**

```powershell
pnpm run typecheck
pnpm test
pnpm run build
git diff --check
```

Expected: all commands exit 0. The worktree has no running staged LSP binary, so the Windows build staging path must succeed.

- [ ] **Step 3: Verify generated determinism**

Run `pnpm run gen:codex-plugin` again and confirm the second run produces no additional diff.

- [ ] **Step 4: Final independent review**

Ask reviewer and oracle to inspect the complete worktree diff, tests, effective-model invariants, and xhigh/max policy. Resolve confirmed findings and rerun affected checks.

- [ ] **Step 5: Report without committing**

Report changed files, verification evidence, worktree path, branch, and uncommitted status. Do not stage or commit without the user's next instruction.
