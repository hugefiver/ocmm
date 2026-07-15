# Oracle High Supplemental Review Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `oracle-high` as an optional high-effort supplemental review agent and document triple-review gating by explicit configuration, availability, and disabled state.

**Architecture:** The built-in agent catalog gains `oracle-high`; existing config registration, routing, and Codex generation consume that catalog. Review workflow guidance treats `oracle-high` as an optional third reviewer, never as an automatic default triggered only by built-in existence.

**Tech Stack:** TypeScript, Zod schema generation, Node test runner, Codex plugin generator, Markdown skill/docs.

**Global Constraints:**
- Do not hardcode provider/channel requirements in active guidance.
- Concrete model names may remain only as built-in defaults, tests, or reference examples.
- `oracle-high` triple-review participation requires explicit user/profile configuration, current availability, and not disabled.
- `oracle` remains cross-generation/cross-check; `reviewer` remains primary external review; `oracle-high` is supplemental high-effort review.
- Regenerate `schema.json` after editing `src/config/schema.ts`.
- Regenerate Codex plugin artifacts after editing generator, built-in agents, or v1 skills.
- Do not run git commit/push/tag/write commands without explicit user authorization.

---

### Task 1: Add Built-In Agent, Schema Name, Permissions, and Routing

**Files:**
- Modify: `src/data/agents.ts`
- Modify: `src/config/schema.ts`
- Modify: `src/hooks/config.ts`
- Modify: `src/routing/model-upgrades.ts`
- Test: `src/hooks/config.test.ts`
- Test: `src/routing/model-upgrades.test.ts`
- Test: `src/routing/resolver.test.ts`
- Test: `src/routing/resolver.category.test.ts`

**Interfaces:**
- Consumes: existing `Agent` type, `AGENT_NAMES`, `registerDefaultPermissions()`, `GPT_LANE_BY_AGENT`, `resolveModelRouting()`.
- Produces: built-in `oracle-high` agent, schema-valid `oracle-high` config key, read-only default permissions, and primary review-lane catalog routing.

- [ ] **Step 1: Add failing tests for config registration and permissions**

Add assertions to `src/hooks/config.test.ts` that `oracle-high` is registered as a subagent, uses a reviewer-derived prompt, has `task: "deny"`, is skipped by `disabledAgents`, and selects the configured primary review successor when the catalog contains max-capable primary and cross-check options.

Run:

```powershell
$env:OCMM_PROFILE = $null; pnpm exec node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts
```

Expected before implementation: tests fail because `oracle-high` is missing.

- [ ] **Step 2: Add failing routing tests**

Add tests that `resolveModelRouting()` for `oracle-high` returns the local `variant: "max"` while runtime/Codex output gates that local max to `xhigh` on GPT-like models without native max, and that catalog successor selection for `oracle-high` chooses the configured primary review lane rather than the oracle cross-check lane.

Run:

```powershell
$env:OCMM_PROFILE = $null; pnpm exec node --test --experimental-strip-types --test-reporter=spec src/routing/resolver.test.ts src/routing/model-upgrades.test.ts
```

Expected before implementation: tests fail because `oracle-high` is unknown or unmapped.

- [ ] **Step 3: Implement the agent catalog entry**

In `src/data/agents.ts`, update the header from 10 to 11 built-in agents and insert `oracle-high` after `oracle`:

```ts
  {
    name: "oracle-high",
    description:
      "Supplemental high-effort reviewer for configured multi-review final gates. Uses the primary review lane when explicitly enabled.",
    promptSource: "reviewer",
    requirement: {
      variant: "max",
      fallbackChain: [
        // configured primary review entry without native max support
        // configured max-capable review entry
        // configured heterogeneous review entry
      ],
    },
  },
```

Do not add `defaultAlias`; explicit config should not silently inherit `reviewer`.

- [ ] **Step 4: Update schema, permissions, and lane map**

In `src/config/schema.ts`, add `"oracle-high"` next to `"oracle"` in `AGENT_NAMES`.

In `src/hooks/config.ts`, add `"oracle-high"` to the review/search read-only deny list in `registerDefaultPermissions()`.

In `src/routing/model-upgrades.ts`, add an `oracle-high` entry for the primary review lane:

```ts
  ["oracle-high", "sol"],
```

to `GPT_LANE_BY_AGENT`. The internal lane key is implementation detail; guidance must describe the behavior as primary review-lane selection rather than a required model/channel.

- [ ] **Step 5: Run Task 1 tests**

Run:

```powershell
$env:OCMM_PROFILE = $null; pnpm exec node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/routing/resolver.test.ts src/routing/model-upgrades.test.ts
```

Expected after implementation: all selected tests pass.

---

### Task 2: Update Codex Generation and Active Review Guidance

**Files:**
- Modify: `src/codex/plugin-generator.ts`
- Modify: `src/codex/plugin-generator.test.ts`
- Modify: `skills/v1/requesting-code-review/SKILL.md`
- Modify: `skills/v1/subagent-driven-development/SKILL.md`
- Modify: `docs/v1-maintenance.md`
- Modify: `docs/prompt-sync.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Generated later: `plugins/deepwork/**`, `.codex/agents/**`, `.agents/plugins/marketplace.json`

**Interfaces:**
- Consumes: registered `oracle-high`, Codex agent generation, v1 review skills.
- Produces: `dw-oracle-high` generated profile, provider-neutral optional third-review guidance, synchronized docs.

- [ ] **Step 1: Add failing Codex generator tests**

Update `src/codex/plugin-generator.test.ts` to assert:

```ts
const oracleHigh = agents.find((agent) => agent.name === "dw-oracle-high")
assert.equal(oracleHigh?.sourceName, "oracle-high")
assert.equal(oracleHigh?.reasoningEffort, "xhigh")
```

Also add `oracle-high` to review floor scenarios, add a GPT-5.6 configured scenario that preserves native `max`, and add bundle assertions that `dw-oracle-high.toml` exists and workflow guidance mentions the explicit configuration + availability + not-disabled gate.

Run:

```powershell
$env:OCMM_PROFILE = $null; pnpm exec node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts
```

Expected before generator implementation: tests fail because `dw-oracle-high` and guidance are missing.

- [ ] **Step 2: Update Codex generator behavior and prose**

In `src/codex/plugin-generator.ts`:

- Add `dw-oracle-high` to delegation bullets.
- Add a “Supplemental high-effort review” lane to the runtime model selection table and tier assignment table.
- Update the independent review rule to state default complex review remains `dw-oracle + dw-reviewer`, and `dw-oracle-high` is added only when explicitly configured, available, and not disabled.
- Add `oracle-high` to `codexReasoningEffort()` review floor logic.
- Update `codexAgentInstructions()` to mention the optional supplemental reviewer gate without provider/channel names.

- [ ] **Step 3: Update v1 skills**

In `skills/v1/requesting-code-review/SKILL.md`:

- Change “Two reviewer agents” to reviewer agents.
- Add `oracle-high` as optional supplemental high-effort reviewer.
- Update complexity and dispatch guidance so simple uses `oracle`, complex defaults to `oracle + reviewer`, and complex/high-risk can add `oracle-high` only when explicitly configured, available, and not disabled.
- Include `oracle-high` in reasoning policy with `max` default or at least xhigh floor.

In `skills/v1/subagent-driven-development/SKILL.md`:

- Update final acceptance review guidance with the same optional third-review rule.

- [ ] **Step 4: Update docs**

In `docs/v1-maintenance.md`, update rows for `requesting-code-review`, `subagent-driven-development`, and relevant shared review guidance to mention optional `oracle-high`.

In `docs/prompt-sync.md`, update functional-agent mapping and prompt structure notes so `oracle` is not described as merely mapping to `reviewer`, and `oracle-high` is documented as reusing reviewer prompt.

In `AGENTS.md`, mention generated `dw-oracle-high` and its explicit-config/available/not-disabled gate.

In `README.md`, add `oracle` and `oracle-high` rows to the built-in agents table and remove stale wording that says `@oracle` maps to `reviewer` if present.

- [ ] **Step 5: Run Task 2 tests**

Run:

```powershell
$env:OCMM_PROFILE = $null; pnpm exec node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts src/intent/plan-review-contract.test.ts
```

Expected after implementation: selected tests pass.

---

### Task 3: Regenerate Schema and Codex Artifacts, Then Verify

**Files:**
- Generated: `schema.json`
- Generated: `plugins/deepwork/**`
- Generated: `.codex/agents/**`
- Generated: `.agents/plugins/marketplace.json`

**Interfaces:**
- Consumes: source/schema/generator/skill changes from Tasks 1 and 2.
- Produces: synchronized generated artifacts and verification evidence.

- [ ] **Step 1: Regenerate schema**

Run:

```powershell
$env:OCMM_PROFILE = $null; pnpm run gen-schema
```

Expected: `schema.json` updates and includes `oracle-high` where agent names are enumerated.

- [ ] **Step 2: Regenerate Codex plugin bundle**

Run:

```powershell
$env:OCMM_PROFILE = $null; pnpm run gen:codex-plugin
```

Expected: `plugins/deepwork`, `.codex/agents`, and `.agents/plugins/marketplace.json` regenerate. `dw-oracle-high.toml` exists in both generated agent directories.

- [ ] **Step 3: Run targeted verification**

Run:

```powershell
$env:OCMM_PROFILE = $null; pnpm exec node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/routing/resolver.test.ts src/routing/model-upgrades.test.ts src/codex/plugin-generator.test.ts src/intent/plan-review-contract.test.ts src/config/load.test.ts
```

Expected: all targeted tests pass.

- [ ] **Step 4: Run full verification**

Run:

```powershell
$env:OCMM_PROFILE = $null; pnpm run typecheck; if ($LASTEXITCODE -eq 0) { pnpm test }; if ($LASTEXITCODE -eq 0) { pnpm run build }
```

Expected: typecheck, TS/Node tests, Rust tests, and build all pass.

- [ ] **Step 5: Run static consistency checks**

Run:

```powershell
git diff --check
rg "oracle-high" src docs skills plugins .codex README.md AGENTS.md schema.json
rg "Preferred fallback chain|Deepwork preferred chain|hardcoded provider" src docs skills plugins .codex README.md AGENTS.md
```

Expected: `oracle-high` appears in intended source/docs/generated artifacts; stale forced-review/provider wording does not appear in active guidance.

---

### Task 4: Final Review Gate

**Files:**
- No planned edits unless review feedback identifies issues.

**Interfaces:**
- Consumes: completed implementation and verification evidence.
- Produces: oracle and reviewer final approval or actionable feedback.

- [ ] **Step 1: Dispatch final reviews in parallel**

Send both `oracle` and `reviewer` the current diff, requirements, and verification evidence. Ask for Critical/Important/Minor findings.

- [ ] **Step 2: Process feedback**

For every Critical or Important finding:

1. Verify it directly against the codebase.
2. Fix if valid.
3. Regenerate schema/Codex artifacts if affected.
4. Rerun targeted tests and the relevant broader verification.
5. Rerun final review because the tree changed.

- [ ] **Step 3: Report completion**

Report changed areas, verification commands/results, final review verdicts, and remind that no git commit was performed.
