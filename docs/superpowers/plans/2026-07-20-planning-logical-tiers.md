# Planning Logical Tiers Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Materialize explicit `planner` and `plan-critic` logical-tier profiles through one shared tier engine while preserving canonical role behavior, availability-aware selection, Oracle/Reviewer semantics, and the plan-critic xhigh-equivalent review floor.

**Architecture:** Schema-independent tier-name helpers and a pure shared materializer will own cloning, normal requirement resolution, registration inheritance, and explicit-only suffix construction. Review and planning adapters will attach distinct identities and role policies; registration, routing, permissions, prompts, OpenCode review floors, and Codex generation will consume those adapters without inventing unavailable profiles. Planner and plan-critic selection remains an availability-aware orchestrator/workflow policy rather than an automatic router.

**Tech Stack:** TypeScript 6 strict ESM, Zod 4, Node.js 22 `node:test`, OpenCode plugin hooks, PowerShell 7, pnpm generators, JSON/JSONC, Markdown, generated JSON Schema and Codex TOML/plugin assets.

**Global Constraints:**
- The approved design is `docs/superpowers/specs/2026-07-20-planning-logical-tiers-design.md`; if this plan and the design differ, stop and correct the plan before implementation.
- `normal` is the unsuffixed canonical role. It is never a `variants` key and no `planner-normal` or `plan-critic-normal` profile is valid.
- Only explicitly configured `low`, `high`, and `max` overrides synthesize suffix profiles. Never infer profile availability from a config example, prompt, or generated file.
- `AgentEntry.variant` and fallback-entry variants remain native model controls; do not add logical tiers to the shared `Variant` union.
- Every planner tier keeps planner prompt/calibration, `mode: "all"`, locale prefix, question permission, planner delegation policy, and the task allowlist of read-only utilities plus the unsuffixed `reviewer`.
- Every plan-critic tier keeps plan-critic prompt/receipt semantics, `mode: "subagent"`, read-only permissions/delegation, and the xhigh-equivalent review-effort floor.
- `plan-critic-low` may select a cheaper or lower-latency model, but native/input/direct low effort must still be raised to the family-specific xhigh equivalent. This invariant must be locked by OpenCode, Codex, prompt-contract, and documentation tests.
- Planner tiers never receive a review floor merely because they use logical-tier suffixes.
- Preserve all Oracle ordinal ordering, `oracle-second` alias/migration behavior, Reviewer grammar, explicit-only review tiers, disable semantics, catalog lanes, and Oracle/Reviewer floors.
- Parsed but unmaterialized planning suffixes return no OCMM effective requirement and must not fall through to a normal built-in. A valid host-provided suffix may remain host-owned.
- Changes under `prompts/v1/` or `skills/v1/` update `docs/v1-maintenance.md` in the same integration boundary. Changes under `prompts/omo/` update `docs/prompt-sync.md`.
- Schema changes run `pnpm run gen-schema` and include `schema.json`.
- Prompt, skill, registration, or Codex-generator changes run `pnpm run gen:codex-plugin` and synchronize `.agents/plugins/marketplace.json`, `.codex/agents`, and `plugins/deepwork`.
- Use Windows PowerShell syntax. Do not install software.
- Before profile-sensitive tests or generators, save, clear, and restore `OCMM_PROFILE` and `OCMM_NO_PROFILE` with `try/finally`.
- At execution start, record `git status --short` as a protected baseline. Do not edit, stage, remove, or include any pre-existing path outside this plan's File Map; compare final status with that baseline instead of requiring an otherwise dirty worktree to become clean.
- Do not execute `git add`, `git commit`, `git push`, `git tag`, or another Git write during Tasks 1-5. After every task and the final gate pass, prepare exactly one advisory commit; execute it only after separate explicit user authorization.

## File Map

### Create

| File | Responsibility |
|---|---|
| `src/logical-tiers/names.ts` | Schema-independent tier constants, types, suffix split, and canonical profile-name construction. |
| `src/logical-tiers/names.test.ts` | Normal/suffix parsing, order, and name-construction coverage. |
| `src/logical-tiers/materialize.ts` | Shared requirement/registration cloning, normal-base resolution, override application, and explicit-only materialization. |
| `src/logical-tiers/materialize.test.ts` | Deep clone, fallback propagation, model-only override, source, suppression, ordering, and disable tests. |
| `src/planning-agents/names.ts` | Reserved planning namespace, canonical runtime identity parser, and role predicates. |
| `src/planning-agents/names.test.ts` | Canonical/suffix/malformed planning-name tests. |
| `src/planning-agents/profiles.ts` | Planner/plan-critic policy table, expansion, disable policy, and effective-profile map. |
| `src/planning-agents/profiles.test.ts` | Default normals, explicit-only tiers, policy inheritance, requirement inheritance, and disable tests. |

### Modify

| File | Responsibility |
|---|---|
| `src/config/schema.ts` | Generic logical-tier schemas/compatibility exports and semantic eligibility for canonical planning roles. |
| `src/config/schema.test.ts` | Planning variants, invalid reserved names, compatibility aliases, and generated-schema union. |
| `src/config/load.test.ts` | Direct tolerant config loading retains valid canonical planning variants while discarding only invalid logical-tier fields. |
| `src/config/profiles.test.ts` | Tolerant profile loading of invalid planning-tier fields without sibling loss. |
| `src/review-agents/names.ts` | Reuse shared tier names/types while preserving review grammar and aliases. |
| `src/review-agents/names.test.ts` | Regression-lock every review ordinal/tier/alias/reserved-name case. |
| `src/review-agents/expand.ts` | Replace duplicated clone/override mechanics with the shared materializer; retain review policy and ordering. |
| `src/review-agents/expand.test.ts` | Prove review output and safety metadata remain unchanged. |
| `src/hooks/config.ts` | Register review/planning managed profiles, apply role policy by identity, inherit prompt source/mode/locale/permissions, and publish routes. |
| `src/hooks/config.test.ts` | Planning registration, prompts, modes, locale, task/question permissions, host suffixes, routes, and inherited overrides. |
| `src/routing/resolver.ts` | Exclusive planning-profile requirement lookup before ordinary built-ins. |
| `src/routing/resolver.test.ts` | Configured, absent, disabled, and normal planning requirement resolution. |
| `src/routing/model-upgrades.ts` | Canonicalize planning suffixes to the base role's existing Sol lane. |
| `src/routing/model-upgrades.test.ts` | Planner/plan-critic suffix lane inheritance without changing review lanes. |
| `src/permissions/index.ts` | Recognize parsed planning profiles as built-ins for guards. |
| `src/permissions/index.test.ts` | Planning-profile depth/session behavior where the existing guard suite owns it. |
| `src/permissions/subagent-git-guard.test.ts` | Generated planning-profile builtin recognition. |
| `src/hooks/chat-params.ts` | Role-based plan-critic floor detection for materialized and host-provided suffix profiles. |
| `src/hooks/chat-params.test.ts` | Plan-critic-low floor, native max preservation, route miss, and planner no-floor tests. |
| `src/codex/plugin-generator.ts` | Plan-critic suffix floor and availability-aware generated workflow guidance; generic profile generation remains unchanged. |
| `src/codex/plugin-generator.test.ts` | Configured-only planning TOMLs, canonical prompt inheritance, effort floors, omissions, and selector wording. |
| `src/intent/prompt-loader.test.ts` | Three-workflow orchestrator selector and canonical planner calibration contracts. |
| `src/intent/plan-review-contract.test.ts` | Writing-plans selector, plan-critic-low floor wording, active docs, and sync-doc contracts. |
| `prompts/v1/agents/orchestrator.md` | Availability-aware planner/plan-critic tier selection. |
| `prompts/omo/agents/orchestrator.md` | Same selector semantics for omo. |
| `prompts/codex/agents/orchestrator.md` | Same selector semantics for Codex. |
| `skills/v1/writing-plans/SKILL.md` | Availability-aware plan-critic round selection and explicit floor invariant. |
| `README.md` | User-facing config example, materialization, availability, and safety semantics. |
| `AGENTS.md` | Maintainer/release guidance for generated planning profiles and floors. |
| `docs/architecture.md` | Shared materializer, role adapters, route exclusivity, and floor data flow. |
| `examples/ocmm.example.jsonc` | Valid planner/plan-critic `variants` example. |
| `docs/v1-maintenance.md` | Synchronized v1 orchestrator prompt and writing-plans behavior. |
| `docs/prompt-sync.md` | Synchronized omo orchestrator prompt behavior. |

### Generate

| Path | Responsibility |
|---|---|
| `schema.json` | JSON Schema generated from the final `OcmmConfigSchema`. |
| `.agents/plugins/marketplace.json` | Codex marketplace manifest from the final package/config. |
| `.codex/agents/**` | Default generated `dw-*` profiles; no suffix profile appears without an explicit generator config. |
| `plugins/deepwork/**` | Synchronized Codex prompts, skills, agents, metadata, and runtime bundle. |

### Intentionally unchanged

- `src/shared/types.ts`: `Variant`, `ModelRequirement`, and `Agent` already contain the native controls and `promptSource` required by the design.
- `src/data/agents.ts`: canonical planner remains max by default and canonical plan-critic remains xhigh by default.
- `src/config/review-agent-migration.ts`: planning tiers introduce no aliases or legacy key migration.
- Canonical planner and plan-critic role prompt files: suffixes reuse them through `promptSource`; selector policy belongs to the orchestrator/workflow.
- Historical specs/plans remain unchanged.

## Requirement-to-Task Coverage

| Requirement | Covered by |
|---|---|
| Shared materializer and review behavior preservation | Task 1 |
| Planning grammar, policy, explicit-only profiles, schema/tolerant loading | Task 2 |
| Registration, prompt/mode/locale/permission inheritance, exclusive routing, Sol lanes, guards | Task 3 |
| OpenCode and Codex plan-critic floors; configured-only Codex profiles | Task 4 |
| Availability selector, prompt/skill sync, active docs, generated artifacts, full verification | Task 5 |

---

### Task 1: Extract Logical-Tier Mechanics Without Changing Review Behavior

**Files:**
- Create: `src/logical-tiers/names.ts`
- Create: `src/logical-tiers/names.test.ts`
- Create: `src/logical-tiers/materialize.ts`
- Create: `src/logical-tiers/materialize.test.ts`
- Modify: `src/config/schema.ts:ReviewVariantOverrideSchema, ReviewVariantsSchema`
- Modify: `src/review-agents/names.ts:ReviewLogicalTier, parseReviewAgentName`
- Modify: `src/review-agents/names.test.ts`
- Modify: `src/review-agents/expand.ts:ReviewAgentRegistrationOverrides, normalRequirement, expandReviewAgents`
- Modify: `src/review-agents/expand.test.ts`

**Interfaces:**
- Consumes: `AgentEntry`, `ModelRequirement`, `Agent`, `normalizeAgentShorthand()`, `parseModelString()`, current review identity/ordering, and current review disable policy.
- Produces: `LogicalTier`, `LogicalTierSuffix`, `splitLogicalTierProfileName()`, `logicalTierProfileName()`, `AgentProfileRegistrationOverrides`, `ResolvedLogicalTierBase`, `MaterializedLogicalTierProfile`, `resolveLogicalTierBase()`, and `materializeLogicalTierProfiles()`.
- Invariant: `expandReviewAgents()` returns the same names, order, requirements, registration fields, sources, suppression metadata, and disabled results as before this extraction.

- [ ] **Step 1: Write failing pure naming tests.**

Create `src/logical-tiers/names.test.ts` with these assertions:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"
import {
  LOGICAL_TIER_ORDER,
  LOGICAL_TIER_SUFFIXES,
  logicalTierProfileName,
  splitLogicalTierProfileName,
} from "./names.ts"

test("logical tier names keep normal unsuffixed and parse only supported suffixes", () => {
  assert.deepEqual(LOGICAL_TIER_SUFFIXES, ["low", "high", "max"])
  assert.deepEqual(LOGICAL_TIER_ORDER, ["normal", "low", "high", "max"])
  assert.deepEqual(splitLogicalTierProfileName("planner"), { baseName: "planner", logicalTier: "normal" })
  assert.deepEqual(splitLogicalTierProfileName("planner-high"), { baseName: "planner", logicalTier: "high" })
  assert.deepEqual(splitLogicalTierProfileName("plan-critic-max"), { baseName: "plan-critic", logicalTier: "max" })
  assert.deepEqual(splitLogicalTierProfileName("planner-normal"), { baseName: "planner-normal", logicalTier: "normal" })
  assert.equal(logicalTierProfileName("planner", "normal"), "planner")
  assert.equal(logicalTierProfileName("planner", "low"), "planner-low")
})
```

- [ ] **Step 2: Write failing materialization tests.**

Create `src/logical-tiers/materialize.test.ts` and use one metadata-rich base:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"
import type { ResolvedLogicalTierBase } from "./materialize.ts"
import { materializeLogicalTierProfiles } from "./materialize.ts"

const base = (): ResolvedLogicalTierBase => ({
  requirement: {
    variant: "xhigh",
    requiresModel: "gpt-5.5",
    requiresProvider: ["openai", "github-copilot"],
    fallbackChain: [
      {
        providers: ["openai", "github-copilot"],
        model: "gpt-5.5",
        variant: "xhigh",
        temperature: 0.2,
        thinking: { type: "enabled", budgetTokens: 4_000 },
      },
      { providers: ["anthropic"], model: "claude-opus-4-7", variant: "xhigh" },
    ],
  },
  registration: {
    description: "canonical role",
    skills: ["writing-plans"],
    permission: { task: "deny" },
  },
  resolutionSource: "agent-default",
  suppressCatalogUpgrade: false,
})

test("materialization emits normal plus explicit tiers without sharing mutable state", () => {
  const profiles = materializeLogicalTierProfiles({
    baseName: "planner",
    base: base(),
    variants: {
      low: "low",
      high: { model: "openai/gpt-5.6-sol" },
      max: { model: "openai/gpt-5.6-sol", variant: "max" },
    },
    isDisabled: () => false,
  })
  assert.deepEqual(profiles.map(({ name, logicalTier }) => [name, logicalTier]), [
    ["planner", "normal"],
    ["planner-low", "low"],
    ["planner-high", "high"],
    ["planner-max", "max"],
  ])
  assert.deepEqual(profiles[1]!.requirement.fallbackChain.map((entry) => entry.variant), ["low", "low"])
  assert.equal(profiles[2]!.requirement.fallbackChain[0]!.model, "gpt-5.6-sol")
  assert.equal(profiles[2]!.requirement.fallbackChain[0]!.variant, "xhigh")
  assert.equal(profiles[2]!.requirement.fallbackChain[1]!.model, "claude-opus-4-7")
  assert.equal(profiles[2]!.suppressCatalogUpgrade, true)
  assert.equal(profiles[3]!.requirement.variant, "max")
  assert.deepEqual(profiles.slice(1).map((profile) => profile.resolutionSource), ["user-config", "user-config", "user-config"])

  profiles[1]!.requirement.fallbackChain[0]!.providers.push("mutated")
  profiles[1]!.requirement.fallbackChain[0]!.thinking!.budgetTokens = 1
  profiles[1]!.registration.skills!.push("mutated")
  assert.deepEqual(profiles[0]!.requirement.fallbackChain[0]!.providers, ["openai", "github-copilot"])
  assert.equal(profiles[0]!.requirement.fallbackChain[0]!.thinking!.budgetTokens, 4_000)
  assert.deepEqual(profiles[0]!.registration.skills, ["writing-plans"])
})

test("materialization omits absent and disabled tiers", () => {
  const profiles = materializeLogicalTierProfiles({
    baseName: "plan-critic",
    base: base(),
    variants: { low: "low", high: "high" },
    isDisabled: (name) => name === "plan-critic-high",
  })
  assert.deepEqual(profiles.map((profile) => profile.name), ["plan-critic", "plan-critic-low"])
})
```

Add focused `resolveLogicalTierBase()` tests proving configured direct requirements, built-in defaults, built-in `defaultAlias`, registration deep cloning, explicit model suppression, disabled normal entries, and a configured non-built-in base with no requirement throwing an error that names the base.

- [ ] **Step 3: Run the RED shared-layer tests.**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/logical-tiers/names.test.ts src/logical-tiers/materialize.test.ts src/review-agents/names.test.ts src/review-agents/expand.test.ts
```

Expected: non-zero because `src/logical-tiers/*` and generic schema exports do not exist. Existing review tests continue to describe the behavior that must remain green after extraction.

- [ ] **Step 4: Implement schema-independent logical-tier naming.**

Create `src/logical-tiers/names.ts` with the exact public API from the design:

```ts
export const LOGICAL_TIER_SUFFIXES = ["low", "high", "max"] as const
export const LOGICAL_TIER_ORDER = ["normal", ...LOGICAL_TIER_SUFFIXES] as const

export type LogicalTierSuffix = (typeof LOGICAL_TIER_SUFFIXES)[number]
export type LogicalTier = (typeof LOGICAL_TIER_ORDER)[number]

export function splitLogicalTierProfileName(name: string): {
  baseName: string
  logicalTier: LogicalTier
} {
  for (const tier of LOGICAL_TIER_SUFFIXES) {
    const suffix = `-${tier}`
    if (name.endsWith(suffix) && name.length > suffix.length) {
      return { baseName: name.slice(0, -suffix.length), logicalTier: tier }
    }
  }
  return { baseName: name, logicalTier: "normal" }
}

export function logicalTierProfileName(baseName: string, tier: LogicalTier): string {
  return tier === "normal" ? baseName : `${baseName}-${tier}`
}
```

Do not import schema, built-ins, or review/planning modules from this file.

- [ ] **Step 5: Generalize the tier schema with compatibility exports.**

In `src/config/schema.ts`, define `LogicalTierVariantOverrideSchema`, `LogicalTierVariantsSchema`, `LogicalTierVariantOverride`, and `LogicalTierVariants` with the same strict union currently used by review variants. Point `AgentEntrySchema.variants` at `LogicalTierVariantsSchema`, then preserve source compatibility:

```ts
export const ReviewVariantOverrideSchema = LogicalTierVariantOverrideSchema
export const ReviewVariantsSchema = LogicalTierVariantsSchema
export type ReviewVariantOverride = LogicalTierVariantOverride
export type ReviewVariants = LogicalTierVariants
```

Do not change semantic eligibility in this step; Task 2 expands it after the planning parser exists.

- [ ] **Step 6: Implement the shared materializer.**

Create `src/logical-tiers/materialize.ts` with the signatures in the design. Move the current review expansion's clone, registration extraction, explicit-selection, native-variant, and primary-model logic into exported role-neutral functions. Use these exact state transitions in `materializeLogicalTierProfiles()`:

```ts
const output: MaterializedLogicalTierProfile[] = []
for (const logicalTier of LOGICAL_TIER_ORDER) {
  const name = logicalTierProfileName(args.baseName, logicalTier)
  if (args.isDisabled(name)) continue
  if (logicalTier === "normal") {
    output.push({ name, logicalTier, ...cloneResolvedBase(args.base) })
    continue
  }
  const override = args.variants?.[logicalTier]
  if (override === undefined) continue
  output.push({
    name,
    logicalTier,
    requirement: applyLogicalTierOverride(args.base.requirement, override),
    registration: cloneRegistration(args.base.registration),
    resolutionSource: "user-config",
    suppressCatalogUpgrade:
      args.base.suppressCatalogUpgrade || (typeof override === "object" && "model" in override),
  })
}
return output
```

`resolveLogicalTierBase()` must implement the six resolution branches specified in the design. Error text is role neutral: `logical tier base ${baseName} must resolve a normal model requirement before registration`.

- [ ] **Step 7: Refactor the review adapter to consume the shared layer.**

In `src/review-agents/names.ts`, replace its local tier union/suffix split with imports from `src/logical-tiers/names.ts`, preserving this compatibility type:

```ts
export type ReviewLogicalTier = LogicalTier
```

In `src/review-agents/expand.ts`:

1. Alias `ReviewAgentRegistrationOverrides` to `AgentProfileRegistrationOverrides`.
2. For each Oracle slot and Reviewer, call `resolveLogicalTierBase({ baseName: slot, agents: input.agents, builtin })`.
3. Call `materializeLogicalTierProfiles()` with the configured canonical entry's `variants` and `isExpandedReviewAgentDisabled()`.
4. Attach `ReviewAgentIdentity`, `sourceSlot`, and `promptSource: "reviewer"` to each result.
5. Preserve current Oracle-before-Reviewer, ordinal, and `LOGICAL_TIER_ORDER` sorting.
6. Preserve `canonicalizeReviewAgentName()` in disabled-name normalization and later-slot validation behavior.

Do not move Oracle ordinals, aliases, default-slot enumeration, or review safety into the shared module.

- [ ] **Step 8: Run shared and review GREEN tests.**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/logical-tiers/names.test.ts src/logical-tiers/materialize.test.ts src/review-agents/names.test.ts src/review-agents/expand.test.ts src/config/schema.test.ts
```

Expected: all selected tests pass. Review expansion names remain `oracle`, `oracle-2nd`, `reviewer` by default; only configured review tiers/later slots appear; string overrides still reach every fallback; aliases/order/disables are unchanged.

- [ ] **Step 9: Typecheck the extracted interfaces.**

Run:

```powershell
pnpm run typecheck
```

Expected: exit 0 with no duplicate schema type exports, import cycles, or review-adapter type regressions.

---

### Task 2: Add Planning Identity, Role Policy, Expansion, and Schema Eligibility

**Files:**
- Create: `src/planning-agents/names.ts`
- Create: `src/planning-agents/names.test.ts`
- Create: `src/planning-agents/profiles.ts`
- Create: `src/planning-agents/profiles.test.ts`
- Modify: `src/config/schema.ts:AgentsConfigSchema.superRefine`
- Modify: `src/config/schema.test.ts:logical tier validation tests`
- Modify: `src/config/load.test.ts:tolerant direct config planning variant coverage`
- Modify: `src/config/profiles.test.ts:tolerant planning variant coverage`

**Interfaces:**
- Consumes: Task 1 `LogicalTier`, `splitLogicalTierProfileName()`, `resolveLogicalTierBase()`, `materializeLogicalTierProfiles()`, canonical built-in planner/plan-critic requirements, and `AgentEntry.variants`.
- Produces: `PlanningAgentRole`, `PlanningAgentIdentity`, `parsePlanningAgentName()`, `isPlanningAgentName()`, `isReservedPlanningAgentName()`, `PlanningAgentPolicy`, `PLANNING_AGENT_POLICIES`, `ExpandedPlanningAgent`, `isExpandedPlanningAgentDisabled()`, `expandPlanningAgents()`, and `expandedPlanningAgentMap()`.
- Invariant: logical tier never changes role policy; only the requirement/source/suppression/name differs.

- [ ] **Step 1: Write failing planning-name tests.**

Create `src/planning-agents/names.test.ts`:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"
import {
  isPlanningAgentName,
  isReservedPlanningAgentName,
  parsePlanningAgentName,
} from "./names.ts"

test("planning identities accept canonical normal and supported suffix profiles", () => {
  for (const role of ["planner", "plan-critic"] as const) {
    assert.deepEqual(parsePlanningAgentName(role), {
      role,
      logicalTier: "normal",
      canonicalName: role,
    })
    for (const logicalTier of ["low", "high", "max"] as const) {
      const name = `${role}-${logicalTier}`
      assert.deepEqual(parsePlanningAgentName(name), { role, logicalTier, canonicalName: name })
      assert.equal(isPlanningAgentName(name), true)
    }
  }
})

test("planning namespaces reserve malformed and direct config suffix names", () => {
  for (const name of [
    "planner-normal", "planner-2nd", "planner-fast", "plan-critic-normal",
    "plan-critic-2nd", "plan-critic-fast",
  ]) {
    assert.equal(parsePlanningAgentName(name), null, name)
    assert.equal(isReservedPlanningAgentName(name), true, name)
  }
  assert.equal(isReservedPlanningAgentName("custom-planner"), false)
})
```

- [ ] **Step 2: Write failing planning expansion tests.**

Create `src/planning-agents/profiles.test.ts` with these core cases:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"
import { expandPlanningAgents } from "./profiles.ts"

test("planning expansion emits default normals and only explicit suffixes", () => {
  assert.deepEqual(expandPlanningAgents().map((profile) => profile.name), ["planner", "plan-critic"])

  const profiles = expandPlanningAgents({
    agents: {
      planner: { variants: { high: "max" } },
      "plan-critic": {
        variants: { low: { model: "openai/gpt-5.5", variant: "low" }, max: "max" },
      },
    },
  })
  assert.deepEqual(profiles.map((profile) => profile.name), [
    "planner", "planner-high", "plan-critic", "plan-critic-low", "plan-critic-max",
  ])
  assert.equal(profiles.find((profile) => profile.name === "planner-high")!.policy.mode, "all")
  assert.equal(profiles.find((profile) => profile.name === "planner-high")!.policy.permissionClass, "planner")
  assert.equal(profiles.find((profile) => profile.name === "planner-high")!.policy.reviewEffortFloor, false)
  assert.equal(profiles.find((profile) => profile.name === "plan-critic-low")!.policy.mode, "subagent")
  assert.equal(profiles.find((profile) => profile.name === "plan-critic-low")!.policy.permissionClass, "read-only")
  assert.equal(profiles.find((profile) => profile.name === "plan-critic-low")!.policy.reviewEffortFloor, true)
})

test("planning disable policy cascades from base and isolates exact suffixes", () => {
  const input = {
    agents: {
      planner: { variants: { low: "low" as const, high: "high" as const } },
      "plan-critic": { variants: { low: "low" as const, high: "high" as const } },
    },
    disabledAgents: ["planner-high", "plan-critic"],
  }
  assert.deepEqual(expandPlanningAgents(input).map((profile) => profile.name), ["planner", "planner-low"])
})
```

Add cases proving canonical entry `disabled: true` disables all role tiers, requirement/registration values are deep-cloned through the shared layer, a model-only tier suppresses catalog upgrade, and profile order is planner then plan-critic with normal/low/high/max order inside each role.

- [ ] **Step 3: Change schema tests from review-only to tier-capable canonical roles.**

In `src/config/schema.test.ts`, replace the existing planner rejection with acceptance for both planning roles:

```ts
test("logical tier variants accept canonical review and planning roles", () => {
  const parsed = OcmmConfigSchema.parse({
    agents: {
      oracle: { variants: { high: "max" } },
      reviewer: { variants: { low: "low" } },
      planner: { variants: { low: { model: "openai/gpt-5.5", variant: "high" }, high: "max" } },
      "plan-critic": { variants: { low: { model: "openai/gpt-5.5", variant: "low" }, max: "max" } },
    },
  })
  assert.equal(parsed.agents.planner?.variants?.high, "max")
  assert.deepEqual(parsed.agents["plan-critic"]?.variants?.low, {
    model: "openai/gpt-5.5",
    variant: "low",
  })
})

test("logical tier variants reject noncanonical and ineligible agent entries", () => {
  for (const agents of [
    { builder: { variants: { high: "max" } } },
    { "planner-high": { model: "openai/gpt-5.6-sol" } },
    { "plan-critic-low": { model: "openai/gpt-5.5" } },
    { "planner-normal": { model: "openai/gpt-5.5" } },
    { "plan-critic-2nd": { model: "openai/gpt-5.5" } },
    { planner: { variants: { normal: "high" } } },
    { "plan-critic": { variants: { low: {} } } },
  ]) {
    assert.equal(OcmmConfigSchema.safeParse({ agents }).success, false, JSON.stringify(agents))
  }
})
```

Keep the existing generated JSON-Schema union test and later Oracle cross-entry tests. Rename test text from “review variant” to “logical tier variant” where the assertion is now generic.

In `src/config/profiles.test.ts`, extend the tolerant-loading fixture so an invalid planning `variants.low.variant` is removed while a valid sibling model/description and lower-priority config remain intact. In `src/config/load.test.ts`, update the former review-only tolerant-loading matrix so valid `planner.variants.high` remains present and the test names the generic logical-tier boundary.

- [ ] **Step 4: Run planning/schema RED tests.**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/planning-agents/names.test.ts src/planning-agents/profiles.test.ts src/config/schema.test.ts src/config/load.test.ts src/config/profiles.test.ts
```

Expected: non-zero because planning identity/expansion does not exist and schema still rejects planning `variants`.

- [ ] **Step 5: Implement the planning identity leaf module.**

Create `src/planning-agents/names.ts` with no schema imports:

```ts
import type { LogicalTier } from "../logical-tiers/names.ts"
import { logicalTierProfileName, splitLogicalTierProfileName } from "../logical-tiers/names.ts"

export const PLANNING_AGENT_NAMES = ["planner", "plan-critic"] as const
export type PlanningAgentRole = (typeof PLANNING_AGENT_NAMES)[number]
export type PlanningAgentIdentity = {
  role: PlanningAgentRole
  logicalTier: LogicalTier
  canonicalName: string
}

export function parsePlanningAgentName(name: string): PlanningAgentIdentity | null {
  const { baseName, logicalTier } = splitLogicalTierProfileName(name)
  if (!PLANNING_AGENT_NAMES.includes(baseName as PlanningAgentRole)) return null
  const role = baseName as PlanningAgentRole
  return { role, logicalTier, canonicalName: logicalTierProfileName(role, logicalTier) }
}

export function isPlanningAgentName(name: string): boolean {
  return parsePlanningAgentName(name) !== null
}

export function isReservedPlanningAgentName(name: string): boolean {
  return PLANNING_AGENT_NAMES.some((role) => name === role || name.startsWith(`${role}-`))
}
```

The schema will distinguish canonical unsuffixed keys from valid runtime suffix identities.

- [ ] **Step 6: Implement planning role policies and expansion.**

Create `src/planning-agents/profiles.ts` with the exact policy table from the design. For each role in `PLANNING_AGENT_NAMES`:

1. Read its canonical entry and `BUILTIN_AGENT_INDEX` entry.
2. Call `resolveLogicalTierBase()`.
3. Materialize normal plus explicit variants.
4. Parse each materialized name with `parsePlanningAgentName()` and attach a cloned policy.
5. Apply base/suffix disable semantics through `isExpandedPlanningAgentDisabled()`.
6. Sort by role order then `LOGICAL_TIER_ORDER`.

Use this exact disable predicate:

```ts
export function isExpandedPlanningAgentDisabled(
  name: string,
  input: PlanningAgentExpansionInput,
): boolean {
  const identity = parsePlanningAgentName(name)
  if (!identity) return false
  const disabled = new Set(input.disabledAgents ?? [])
  if (disabled.has(identity.role) || disabled.has(identity.canonicalName)) return true
  return input.agents?.[identity.role]?.disabled === true
}
```

- [ ] **Step 7: Extend semantic schema validation without weakening review checks.**

In `AgentsConfigSchema.superRefine`, compute review and planning canonical-normal status independently:

```ts
const reviewIdentity = parseReviewAgentName(name)
const canonicalReviewNormal =
  reviewIdentity?.logicalTier === "normal" && reviewIdentity.canonicalName === name
const planningIdentity = parsePlanningAgentName(name)
const canonicalPlanningNormal =
  planningIdentity?.logicalTier === "normal" && planningIdentity.canonicalName === name
const canonicalTierBase = canonicalReviewNormal || canonicalPlanningNormal

if (
  (isReservedReviewAgentName(name) || isReservedPlanningAgentName(name))
  && !canonicalTierBase
) {
  ctx.addIssue({
    code: "custom",
    path: [name],
    message: "logical-tier agent config keys must be canonical unsuffixed roles or review slots",
  })
}
if (entry.variants !== undefined && !canonicalTierBase) {
  ctx.addIssue({
    code: "custom",
    path: [name, "variants"],
    message: "variants is allowed only on canonical Oracle, Reviewer, planner, or plan-critic entries",
  })
}
```

Leave the second loop's `LATER_ORACLE_SLOT_NAMES` resolution check unchanged and review-specific.

- [ ] **Step 8: Run planning/schema GREEN tests.**

Run in an environment with ambient profile selection cleared:

```powershell
& {
  $savedProfile = $env:OCMM_PROFILE
  $savedNoProfile = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/planning-agents/names.test.ts src/planning-agents/profiles.test.ts src/config/schema.test.ts src/config/load.test.ts src/config/profiles.test.ts src/review-agents/names.test.ts src/review-agents/expand.test.ts
    if ($LASTEXITCODE -ne 0) { throw "planning/schema focused tests failed" }
  }
  finally {
    if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
    if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
  }
}
```

Expected: all selected tests pass; planner and plan-critic variants are accepted only on unsuffixed canonical entries, direct and layered tolerant loading retain valid planning variants, and all review regressions remain green.

- [ ] **Step 9: Typecheck the new planning modules.**

Run:

```powershell
pnpm run typecheck
```

Expected: exit 0. `src/config/schema.ts` imports only `src/planning-agents/names.ts`, never `profiles.ts`, so no schema/materializer cycle exists.

---

### Task 3: Integrate Planning Profiles into Registration, Routing, Permissions, and Model Upgrades

**Files:**
- Modify: `src/hooks/config.ts:delegationContractFor, deepworkPromptForAgent, createConfigHandler, registerDefaultPermissions`
- Modify: `src/hooks/config.test.ts`
- Modify: `src/routing/resolver.ts:resolveEffectiveRequirement`
- Modify: `src/routing/resolver.test.ts`
- Modify: `src/routing/model-upgrades.ts:gptLaneForAgent`
- Modify: `src/routing/model-upgrades.test.ts`
- Modify: `src/permissions/index.ts:isBuiltinAgentName`
- Modify: `src/permissions/index.test.ts`
- Modify: `src/permissions/subagent-git-guard.test.ts`

**Interfaces:**
- Consumes: Task 2 planning identity/profile APIs, Task 1 review profiles, built-in route selection/publication, `Agent.promptSource`, existing permission graphs, and existing GPT Sol-lane mapping for canonical planner/plan-critic.
- Produces: registered planning profiles with canonical behavior; exclusive planning-profile effective requirements; planning-suffix Sol-lane selection; guard recognition of parsed planning names.
- Invariant: a generated suffix differs from its canonical role only in name and materialized route/registration override; host-provided unmaterialized suffixes receive no invented OCMM route.

- [ ] **Step 1: Write failing config registration and role-inheritance tests.**

Add this integration shape to `src/hooks/config.test.ts` using the file's existing `PLANNER_TASK_RULES`, `READ_ONLY_TASK_RULES`, `agentPermission()`, `delegationContract()`, and `publishedRoute()` helpers:

```ts
test("config registers only configured planning tiers with canonical role behavior", async () => {
  const configured = {
    ...defaultConfig(),
    locale: "zh-CN",
    agents: {
      planner: {
        description: "tiered planner",
        promptAppend: "PLANNER_TIER_APPEND",
        variants: { high: { model: "openai/gpt-5.6-sol", variant: "max" as const } },
      },
      "plan-critic": {
        promptAppend: "CRITIC_TIER_APPEND",
        variants: { low: { model: "openai/gpt-5.5", variant: "low" as const } },
      },
    },
  }
  const registry = createEffectiveRouteRegistry()
  const handler = createConfigHandler({ getConfig: () => configured, routeRegistry: registry })
  const target: { agent: Record<string, unknown> } = { agent: {} }
  await handler(target, undefined)

  assert.ok(target.agent.planner)
  assert.ok(target.agent["planner-high"])
  assert.ok(target.agent["plan-critic"])
  assert.ok(target.agent["plan-critic-low"])
  assert.equal(target.agent["planner-low"], undefined)
  assert.equal(target.agent["plan-critic-high"], undefined)

  const plannerHigh = target.agent["planner-high"] as Record<string, unknown>
  assert.equal(plannerHigh.mode, "all")
  assert.match(String(plannerHigh.prompt), /Agent Role: planner/)
  assert.match(String(plannerHigh.prompt), /PLANNER_TIER_APPEND/)
  assert.match(String(plannerHigh.prompt), /<ocmm-locale-guidance>/)
  assertExactTaskRules(agentPermission(target.agent, "planner-high").task, PLANNER_TASK_RULES, "planner-high")
  assert.equal(agentPermission(target.agent, "planner-high").question, "allow")
  assert.match(delegationContract(target.agent, "planner-high"), /unsuffixed `reviewer` at most once/i)

  const criticLow = target.agent["plan-critic-low"] as Record<string, unknown>
  assert.equal(criticLow.mode, "subagent")
  assert.match(String(criticLow.prompt), /Agent Role: plan-critic/)
  assert.match(String(criticLow.prompt), /CRITIC_TIER_APPEND/)
  assert.doesNotMatch(String(criticLow.prompt), /<ocmm-locale-guidance>/)
  assertExactTaskRules(agentPermission(target.agent, "plan-critic-low").task, READ_ONLY_TASK_RULES, "plan-critic-low")
  assert.match(delegationContract(target.agent, "plan-critic-low"), /read-only role/i)

  assert.equal(publishedRoute(registry, "planner-high").model, "openai/gpt-5.6-sol")
  assert.equal(publishedRoute(registry, "plan-critic-low").model, "openai/gpt-5.5")
})
```

Add separate tests proving:

- default config still registers only `planner` and `plan-critic`, not any planning suffix;
- `disabledAgents: ["planner-high"]` removes only that generated suffix, while base `planner` disable removes all planner profiles;
- a pre-existing host `planner-high` or `plan-critic-low` remains when unconfigured and not disabled, but the route registry has no matching entry;
- explicit registration overrides (`tools`, `permission`, `skills`, `temperature`, `topP`, `maxTokens`, `thinking`, `reasoningEffort`) are cloned into each generated planning profile without shared mutation;
- planner suffix prompt calibration contains the planner deepwork layer rather than the default non-planner layer.

- [ ] **Step 2: Write failing resolver, model-lane, and guard tests.**

Add to `src/routing/resolver.test.ts`:

```ts
test("planning routing resolves only explicitly materialized suffix profiles", () => {
  const agentsConfig = {
    planner: { variants: { high: { model: "openai/gpt-5.6-sol", variant: "max" as const } } },
    "plan-critic": { variants: { low: { model: "openai/gpt-5.5", variant: "low" as const } } },
  }
  assert.equal(resolveModelRouting({
    agentName: "planner-high", providerID: "openai", modelID: "gpt-5.6-sol", agentsConfig,
  })?.variant, "max")
  assert.equal(resolveModelRouting({
    agentName: "plan-critic-low", providerID: "openai", modelID: "gpt-5.5", agentsConfig,
  })?.variant, "low")
  assert.equal(resolveModelRouting({
    agentName: "planner-low", providerID: "openai", modelID: "gpt-5.5", agentsConfig,
  }), null)
  assert.equal(resolveModelRouting({
    agentName: "plan-critic-high", providerID: "openai", modelID: "gpt-5.5", agentsConfig,
  }), null)
})

test("planning routing respects base and suffix disables", () => {
  const agentsConfig = { planner: { variants: { high: "max" as const } } }
  assert.equal(resolveModelRouting({
    agentName: "planner-high", providerID: "openai", modelID: "gpt-5.5",
    agentsConfig, disabledAgents: ["planner-high"],
  }), null)
  assert.equal(resolveModelRouting({
    agentName: "planner", providerID: "openai", modelID: "gpt-5.5", agentsConfig,
  })?.source, "agent-default")
})
```

Add to `src/routing/model-upgrades.test.ts`:

```ts
test("planning catalog lanes ignore logical tier suffixes", () => {
  const target = { provider: { openai: { models: { "gpt-5.7-sol": {}, "gpt-5.7-terra": {} } } } }
  assert.equal(
    selectCatalogModel(target, "planner-high", BUILTIN_AGENT_INDEX.get("planner")!.requirement),
    "openai/gpt-5.7-sol",
  )
  assert.equal(
    selectCatalogModel(target, "plan-critic-low", BUILTIN_AGENT_INDEX.get("plan-critic")!.requirement),
    "openai/gpt-5.7-sol",
  )
})
```

Extend `src/permissions/subagent-git-guard.test.ts` with `isBuiltinAgentName("planner-high") === true`, `isBuiltinAgentName("plan-critic-low") === true`, malformed planning names false, and existing review identities unchanged. Add an `src/permissions/index.test.ts` regression using the existing session/depth harness so a generated planning profile is classified as a managed non-primary agent and cannot bypass subagent depth or Git-write policy.

- [ ] **Step 3: Run registration/routing RED tests.**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/routing/resolver.test.ts src/routing/model-upgrades.test.ts src/permissions/index.test.ts src/permissions/subagent-git-guard.test.ts
```

Expected: non-zero because planning profiles are not registered, suffix routes fall through/return no explicit expansion, suffix lanes are not canonicalized, and guards do not recognize the names.

- [ ] **Step 4: Make prompt and delegation policy role-aware.**

In `src/hooks/config.ts`:

1. Change `deepworkPromptForAgent()` to call `pickDeepworkVariantForAgent()` with `agent.promptSource ?? agent.name`.
2. Parse planning identity once in `delegationContractFor()` and branch on `identity.role` instead of exact suffix-sensitive names.
3. Keep utility leaf, review, standard subagent, and coordinator policies unchanged.

The planner and read-only branches must have this shape:

```ts
const planningIdentity = parsePlanningAgentName(name)
const planningRole = planningIdentity?.role
const readOnlyReviewRole = isReviewAgentName(name) || planningRole === "plan-critic"

if (planningRole === "planner") {
  return wrapDelegationContract([
    // Use the current canonical planner strings unchanged.
  ])
}
if (READ_ONLY_WORKFLOW_AGENT_SET.has(name) || readOnlyReviewRole) {
  return wrapDelegationContract([
    // Use the current canonical read-only strings unchanged.
  ])
}
```

Do not add suffix names to static role arrays.

- [ ] **Step 5: Register one managed logical-tier profile stream.**

In `createConfigHandler()`:

1. Extend the initial host disable pass with `isExpandedPlanningAgentDisabled()`.
2. Skip `parsePlanningAgentName(a.name)` in the ordinary built-in loop so canonical planner/plan-critic are not double registered.
3. Map review and planning expansions into one private `ManagedLogicalTierRegistration` shape:

```ts
type ManagedLogicalTierRegistration = {
  name: string
  requirement: ModelRequirement
  registration: AgentProfileRegistrationOverrides
  resolutionSource: "user-config" | "agent-default"
  suppressCatalogUpgrade: boolean
  policy: {
    promptSource: string
    mode: "all" | "subagent"
    includeLocalePrefix: boolean
  }
}
```

4. Review profiles map to reviewer prompt, subagent mode, and no locale prefix. Planning profiles use their policy directly.
5. Register each managed profile through the existing `applyAgentEntry()`, primary selection, and `registerEffectiveRoute()` flow.
6. Set `extras.promptPrefix = buildLocaleGuidance(cfg.locale)` only when `policy.includeLocalePrefix` is true.
7. Build terminal suffixes with the runtime profile name so `delegationContractFor()` can parse its role.
8. Skip parsed planning names in the custom configured-agent loop.

The synthetic agent construction and route source are exact:

```ts
const synthetic: Agent = {
  name: profile.name,
  ...(profile.registration.description ? { description: profile.registration.description } : {}),
  requirement: profile.requirement,
  promptSource: profile.policy.promptSource,
}
const effective = resolveRouteRequirement(cfg, profile.name) ?? {
  requirement: profile.requirement,
  source: profile.resolutionSource,
}
```

Do not fall back to a hardcoded `agent-default` source for a user-configured tier.

- [ ] **Step 6: Apply permissions by planning identity.**

In `registerDefaultPermissions()`, replace exact planner/plan-critic special cases with one pass over `agentMap`:

```ts
for (const [name, entry] of Object.entries(agentMap)) {
  if (!isRecord(entry)) continue
  const planning = parsePlanningAgentName(name)
  if (planning?.role === "planner") {
    mergePermission(entry, {
      task: taskAllowlist([...READ_ONLY_UTILITY_AGENTS, "reviewer"]),
      question: "allow",
    }, false)
    continue
  }
  if (planning?.role === "plan-critic" || isReviewAgentName(name)) {
    mergePermission(entry, { task: taskAllowlist(READ_ONLY_UTILITY_AGENTS) }, false)
  }
}
```

Remove only the now-redundant exact planner and exact plan-critic branches. Preserve explicit user/host permission precedence (`overwrite: false`) and every unrelated permission loop.

- [ ] **Step 7: Add exclusive planning resolution and canonical model lanes.**

In `src/routing/resolver.ts`, after review identity handling and before ordinary user/builtin/category fallback, add:

```ts
if (parsePlanningAgentName(agentName)) {
  const profile = expandedPlanningAgentMap({ agents: agentsConfig, disabledAgents }).get(agentName)
  return profile
    ? { requirement: profile.requirement, source: profile.resolutionSource }
    : null
}
```

Use `identity.canonicalName` as the lookup key if the parser ever normalizes input; current planning identities have no aliases.

In `src/routing/model-upgrades.ts:gptLaneForAgent()`, canonicalize before reading `GPT_AGENT_LANES`:

```ts
const planning = parsePlanningAgentName(agentName)
if (planning) return GPT_AGENT_LANES[planning.role]
```

Keep review lane handling and later-Oracle “no invented lane” behavior unchanged.

In `src/permissions/index.ts:isBuiltinAgentName()`, append `|| isPlanningAgentName(name)`. Do not modify `canonicalizeTaskSubagentType()` because planning profiles have no aliases.

- [ ] **Step 8: Run registration/routing GREEN tests.**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/routing/resolver.test.ts src/routing/model-upgrades.test.ts src/permissions/index.test.ts src/permissions/subagent-git-guard.test.ts src/planning-agents/names.test.ts src/planning-agents/profiles.test.ts src/review-agents/expand.test.ts
```

Expected: all selected tests pass; explicitly configured planning suffixes inherit their role behavior and route, missing suffixes remain absent/null, planner/plan-critic use Sol lanes, and review behavior remains green.

- [ ] **Step 9: Typecheck the integrated registration path.**

Run:

```powershell
pnpm run typecheck
```

Expected: exit 0 with no duplicate registration union, prompt-source, route-source, or permission-policy errors.

---

### Task 4: Lock Plan-Critic Floors and Generic Codex Planning Profiles

**Files:**
- Modify: `src/hooks/chat-params.ts:isReviewFloorAgent, applyHostProfileReviewFloor`
- Modify: `src/hooks/chat-params.test.ts`
- Modify: `src/codex/plugin-generator.ts:codexReasoningEffort, planning profile rendering support`
- Modify: `src/codex/plugin-generator.test.ts`

**Interfaces:**
- Consumes: `parsePlanningAgentName()`, Task 3 effective routes/registered agents, current family-specific review floors, GPT-5.6 native-max detection, and generic `buildCodexAgents()` iteration.
- Produces: plan-critic floor detection for every suffix and route-miss host profile; configured-only `dw-planner-*`/`dw-plan-critic-*` specifications; generated planning-profile inventory for Task 5 workflow text.
- Invariant: logical low changes only the selected requirement/model. The final plan-critic output effort is never below the existing xhigh-equivalent floor.

- [ ] **Step 1: Write failing OpenCode floor and no-floor tests.**

Add to `src/hooks/chat-params.test.ts`:

```ts
test("plan-critic logical low selects its cheaper route but retains the xhigh floor", async () => {
  const cfg = OcmmConfigSchema.parse({
    agents: {
      "plan-critic": {
        variants: { low: { model: "openai/gpt-5.5", variant: "low" } },
      },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  for (const variant of [undefined, "minimal", "low"] as const) {
    clearResolutions()
    const output = { options: { reasoningEffort: "low" } as Record<string, unknown> }
    await handler(makeInput({
      agentName: "plan-critic-low",
      modelID: "gpt-5.5",
      ...(variant ? { variant } : {}),
    }), output)
    assert.equal(output.options.reasoningEffort, "xhigh", String(variant))
    assert.equal(recentResolutions().at(-1)!.applied.variant, "xhigh", String(variant))
  }
})

test("plan-critic max keeps GPT-5.6 native max while planner tiers are not floored", async () => {
  const cfg = OcmmConfigSchema.parse({
    agents: {
      planner: { variants: { low: { model: "openai/gpt-5.5", variant: "low" } } },
      "plan-critic": { variants: { max: { model: "openai/gpt-5.6-sol", variant: "max" } } },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => cfg })

  const planner = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "planner-low", modelID: "gpt-5.5" }), planner)
  assert.equal(planner.options.reasoningEffort, "low")

  const critic = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "plan-critic-max", modelID: "gpt-5.6-sol" }), critic)
  assert.equal(critic.options.reasoningEffort, "max")
})

test("host-provided plan-critic suffixes are floored without an invented route", async () => {
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map())
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  const critic = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "plan-critic-low", modelID: "gpt-5.5", variant: "minimal" }), critic)
  assert.equal(critic.options.reasoningEffort, "xhigh")
  assert.equal(recentResolutions().at(-1)!.source, "host-profile-floor")

  const planner = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "planner-low", modelID: "gpt-5.5", variant: "low" }), planner)
  assert.equal(planner.options.reasoningEffort, "low")
})
```

Extend the existing family-specific matrix so `plan-critic-low` is tested on Gemini, GLM, Claude, and DeepSeek and receives the same output as unsuffixed plan-critic. Keep Oracle/Reviewer matrices unchanged.

- [ ] **Step 2: Write failing Codex profile/floor tests.**

Add to `src/codex/plugin-generator.test.ts`:

```ts
test("Codex emits only configured planning tiers with canonical prompts and critic floors", async () => {
  const agents = await buildCodexAgents({
    config: {
      ...defaultConfig(),
      workflow: "codex",
      agents: {
        planner: { variants: { high: { model: "openai/gpt-5.6-sol", variant: "max" as const } } },
        "plan-critic": {
          variants: {
            low: { model: "openai/gpt-5.5", variant: "low" as const },
            max: { model: "openai/gpt-5.6-sol", variant: "max" as const },
          },
        },
      },
    },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })
  const bySource = new Map(agents.map((agent) => [agent.sourceName, agent]))
  assert.equal(bySource.has("planner-high"), true)
  assert.equal(bySource.has("planner-low"), false)
  assert.equal(bySource.has("plan-critic-low"), true)
  assert.equal(bySource.has("plan-critic-high"), false)
  assert.equal(bySource.has("plan-critic-max"), true)
  assert.equal(bySource.get("planner-high")!.name, "dw-planner-high")
  assert.match(bySource.get("planner-high")!.developerInstructions, /Agent Role: planner/)
  assert.match(bySource.get("plan-critic-low")!.developerInstructions, /Agent Role: plan-critic/)
  assert.equal(bySource.get("plan-critic-low")!.model, "gpt-5.5")
  assert.equal(bySource.get("plan-critic-low")!.reasoningEffort, "xhigh")
  assert.equal(bySource.get("plan-critic-max")!.reasoningEffort, "max")
})
```

Extend the self-contained bundle test with a custom config in a temporary output root and assert `dw-planner-high.toml`, `dw-plan-critic-low.toml`, and `dw-plan-critic-max.toml` exist, absent suffixes do not, canonical role text appears, and `dw-plan-critic-low.toml` contains `model_reasoning_effort = "xhigh"`.

- [ ] **Step 3: Run floor/Codex RED tests.**

Run with ambient profile selection isolated:

```powershell
& {
  $savedProfile = $env:OCMM_PROFILE
  $savedNoProfile = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/hooks/chat-params.test.ts src/codex/plugin-generator.test.ts
    $code = $LASTEXITCODE
    if ($code -eq 0) { throw "RED unexpectedly passed before planning floor/Codex integration" }
  }
  finally {
    if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
    if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
  }
}
```

Expected: non-zero because suffix plan critics are not recognized by the floor predicates and Codex does not yet preserve their floor.

- [ ] **Step 4: Make OpenCode floor detection planning-role aware.**

In `src/hooks/chat-params.ts`, import `parsePlanningAgentName()` and replace exact `plan-critic` matching:

```ts
function isReviewFloorAgent(agentName: string | undefined): boolean {
  if (agentName === undefined) return false
  const planning = parsePlanningAgentName(agentName)
  return planning?.role === "plan-critic" || parseReviewAgentName(agentName) !== null
}
```

In `applyHostProfileReviewFloor()`, derive max from either role grammar:

```ts
const reviewIdentity = args.agentName === undefined ? null : parseReviewAgentName(args.agentName)
const planningIdentity = args.agentName === undefined ? null : parsePlanningAgentName(args.agentName)
const logicalTier = reviewIdentity?.logicalTier ?? planningIdentity?.logicalTier
const baseVariant: Variant = logicalTier === "max" ? "max" : "xhigh"
```

Do not alter family-specific floors, GPT-5.6 native-max preservation, unsupported-max caps, or host-profile source recording.

- [ ] **Step 5: Make Codex effort calculation use the same role predicate.**

In `src/codex/plugin-generator.ts:codexReasoningEffort()`, parse planning identity and floor when its role is `plan-critic`:

```ts
const planning = parsePlanningAgentName(sourceName)
const protectedReview = planning?.role === "plan-critic" || parseReviewAgentName(sourceName) !== null
if (protectedReview && effort !== "xhigh" && effort !== "max") return "xhigh"
```

Preserve the current order: derive direct/native effort, cap unsupported non-GPT-5.6 max, then apply the review minimum. Do not floor planner profiles.

Add a pure `renderPlanningLogicalTierProfiles(agents)` helper analogous to `renderOrderedOracleProfiles()`. It returns one line per canonical planning role with only the generated profile names, in normal/low/high/max order. Task 5 inserts this inventory into workflow text; no dispatch decision occurs here.

- [ ] **Step 6: Run floor/Codex GREEN tests.**

Run:

```powershell
& {
  $savedProfile = $env:OCMM_PROFILE
  $savedNoProfile = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/hooks/chat-params.test.ts src/codex/plugin-generator.test.ts src/hooks/config.test.ts src/routing/resolver.test.ts
    if ($LASTEXITCODE -ne 0) { throw "planning floor/Codex tests failed" }
  }
  finally {
    if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
    if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
  }
}
```

Expected: all selected tests pass. `plan-critic-low` selects its configured model but emits xhigh-equivalent effort; GPT-5.6 max survives; planner-low remains low; only configured Codex suffix profiles exist.

- [ ] **Step 7: Typecheck floor and generator changes.**

Run:

```powershell
pnpm run typecheck
```

Expected: exit 0.

---

### Task 5: Add Availability-Aware Selection, Synchronize Docs, Generate Artifacts, and Verify

**Files:**
- Modify: `prompts/v1/agents/orchestrator.md`
- Modify: `prompts/omo/agents/orchestrator.md`
- Modify: `prompts/codex/agents/orchestrator.md`
- Modify: `skills/v1/writing-plans/SKILL.md`
- Modify: `src/codex/plugin-generator.ts:renderWorkflowSkill`
- Modify: `src/intent/prompt-loader.test.ts`
- Modify: `src/intent/plan-review-contract.test.ts`
- Modify: `src/codex/plugin-generator.test.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/architecture.md`
- Modify: `examples/ocmm.example.jsonc`
- Modify: `docs/v1-maintenance.md`
- Modify: `docs/prompt-sync.md`
- Generate: `schema.json`
- Generate: `.agents/plugins/marketplace.json`
- Generate: `.codex/agents/**`
- Generate: `plugins/deepwork/**`

**Interfaces:**
- Consumes: the exact planning profile names materialized by Tasks 1-4, current registered/callable profile availability, current plan-critic receipt loop, Codex generated-agent inventory, and repository prompt/schema synchronization rules.
- Produces: one deterministic selector policy across v1/omo/Codex, active user/maintainer documentation, regenerated schema/bundle artifacts, and a fully verified one-commit integration boundary.
- Invariant: selection guidance never fabricates a suffix; low is considered only for an explicit cost/latency request; every plan-critic tier retains the same receipt semantics and xhigh-equivalent floor.

- [ ] **Step 1: Write failing prompt/skill/documentation contract tests.**

Add to `src/intent/prompt-loader.test.ts`:

```ts
test("orchestrators select planning logical tiers only from current availability", () => {
  for (const workflow of ["v1", "omo", "codex"] as const) {
    const text = readFileSync(join(process.cwd(), "prompts", workflow, "agents", "orchestrator.md"), "utf8")
    assert.match(text, /planner.*plan-critic.*current.*(?:callable|registered).*availability/is, workflow)
    assert.match(text, /small or clear.*unsuffixed.*normal/is, workflow)
    assert.match(text, /complex.*high.*normal/is, workflow)
    assert.match(text, /security.*performance.*data loss.*release.*runtime safety.*max.*high.*normal/is, workflow)
    assert.match(text, /low.*only.*explicit.*cost.*latency/is, workflow)
    assert.match(text, /never.*(?:invent|synthesize|fabricate).*profile/is, workflow)
    assert.match(text, /plan-critic-low.*model.*(?:cost|latency).*not.*effort.*xhigh/is, workflow)
  }
})
```

Add to `src/intent/plan-review-contract.test.ts`:

```ts
test("writing-plans selects only available plan-critic tiers without lowering review effort", () => {
  const skill = read("skills", "v1", "writing-plans", "SKILL.md")
  assert.match(skill, /inspect.*current.*(?:callable|registered).*plan-critic.*profile/is)
  assert.match(skill, /small or clear.*`plan-critic`/is)
  assert.match(skill, /complex.*`plan-critic-high`.*`plan-critic`/is)
  assert.match(skill, /high-risk.*`plan-critic-max`.*`plan-critic-high`.*`plan-critic`/is)
  assert.match(skill, /`plan-critic-low`.*explicit.*cost.*latency/is)
  assert.match(skill, /never.*(?:invent|synthesize|fabricate).*profile/is)
  assert.match(skill, /`plan-critic-low`.*cheaper.*model.*xhigh-equivalent.*floor/is)
})
```

Extend the active-doc test to require all four docs (`README.md`, `AGENTS.md`, `docs/architecture.md`, `examples/ocmm.example.jsonc`) to mention `planner`, `plan-critic`, `variants`, explicit-only suffix generation, and the plan-critic-low floor. Extend synchronization assertions so `docs/v1-maintenance.md` records both the orchestrator selector and writing-plans selector, while `docs/prompt-sync.md` records the omo selector.

In `src/codex/plugin-generator.test.ts`, extend generated workflow assertions:

```ts
assert.match(workflowSkill, /Planning logical-tier profiles in this bundle/i)
assert.match(workflowSkill, /current callable dispatch-tool schema.*availability/is)
assert.match(workflowSkill, /small or clear.*unsuffixed.*normal/is)
assert.match(workflowSkill, /complex.*high.*normal/is)
assert.match(workflowSkill, /high-risk.*max.*high.*normal/is)
assert.match(workflowSkill, /low.*only.*explicit.*cost.*latency/is)
assert.match(workflowSkill, /plan-critic-low.*lower-cost.*model.*xhigh-equivalent.*floor/is)
```

Add a configured generator fixture and assert its planning inventory lists exactly the generated normal/suffix names while an absent suffix is not listed.

- [ ] **Step 2: Run selector/docs RED tests.**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/intent/prompt-loader.test.ts src/intent/plan-review-contract.test.ts src/codex/plugin-generator.test.ts
```

Expected: non-zero because selector/floor wording and generated planning inventory are not yet present.

- [ ] **Step 3: Add the same planning selector to all orchestrator prompts.**

Add a `Planning logical-tier selection` section to each of:

- `prompts/v1/agents/orchestrator.md`
- `prompts/omo/agents/orchestrator.md`
- `prompts/codex/agents/orchestrator.md`

Use this decision table verbatim in meaning and keep each file's existing formatting style:

```text
Before a fresh planner or plan-critic dispatch, inspect the current callable/registered agent names. Profile examples and generated files are not availability evidence.

For base role R (`planner` or `plan-critic`):
- explicit user cost/latency request: R-low -> R;
- small or clear work without that request: R (unsuffixed normal);
- complex, cross-module, or coordination-heavy work: R-high -> R;
- security, performance, data-loss, release-safety, runtime-safety, or critical-migration work: R-max -> R-high -> R.

Choose the first candidate that is actually available. Never invent or synthesize a missing profile. A tier changes only the configured model route; it does not change role, prompt, mode, permissions, or receipt semantics. `plan-critic-low` is a lower-cost/lower-latency model-selection option, not a lower-effort review: it retains the xhigh-equivalent floor.
```

Do not add selector logic to canonical planner or plan-critic role prompts. They execute the role selected by the orchestrator and must remain tier-independent.

- [ ] **Step 4: Make writing-plans select plan-critic profiles by availability.**

In `skills/v1/writing-plans/SKILL.md`, add `Plan-Critic Profile Selection` immediately before the existing plan-critic review loop. State:

1. Inspect current callable/registered plan-critic names before starting a fresh critic session.
2. Explicit cost/latency request: `plan-critic-low`, then `plan-critic`.
3. Small or clear plan: `plan-critic`.
4. Complex/cross-module plan: `plan-critic-high`, then `plan-critic`.
5. Security/performance/data-loss/release/runtime-safety/critical migration: `plan-critic-max`, then `plan-critic-high`, then `plan-critic`.
6. Select the first actually available profile; never invent a suffix.
7. Continue the same `task_id` inside an existing review stage rather than changing tiers mid-stage.
8. All tiers use the same current-revision receipt contract.
9. `plan-critic-low` changes only the cheaper/lower-latency model route and always retains the xhigh-equivalent effort floor.

Replace hardcoded initial dispatch wording in the loop with “the selected available plan-critic profile”; keep verdicts, current-revision invalidation, loop caps, approval conditionality, and handoff rules unchanged.

- [ ] **Step 5: Render generated planning inventory and selector guidance in Codex.**

In `src/codex/plugin-generator.ts:renderWorkflowSkill()`:

1. Call Task 4's `renderPlanningLogicalTierProfiles(agents)`.
2. Insert `### Planning logical-tier profiles in this bundle` and the exact generated inventory.
3. Add the same candidate order as Step 3.
4. State that the generated inventory describes installation output, while the current callable dispatch-tool schema remains the final availability signal.
5. Change plan-review examples from an unconditional exact `dw-plan-critic` name to a normal-profile example explicitly governed by the selector.
6. Update Plan review and Tier assignments text to `dw-plan-critic*` and state every suffix has an xhigh minimum.
7. State explicitly that `dw-plan-critic-low` can select a lower-cost model but its TOML/runtime effort remains xhigh-equivalent.

Do not add a planning-specific TOML writer. `buildCodexAgents()` remains the only agent-spec source.

- [ ] **Step 6: Update active docs and synchronization records.**

Update each document with these exact responsibilities:

- `README.md`: show the design's JSONC example; explain unsuffixed normal, explicit-only suffixes, availability checks, role inheritance, and the plan-critic-low floor.
- `examples/ocmm.example.jsonc`: add valid `planner` and `plan-critic` variants alongside the existing Oracle/Reviewer example, using a lower-cost plan-critic low model and a GPT-5.6 max profile.
- `docs/architecture.md`: document `logical-tiers/names -> materialize -> review/planning adapters -> registration/resolver -> chat/Codex floor` data flow and exclusive suffix resolution.
- `AGENTS.md`: document generated `dw-planner-*`/`dw-plan-critic-*` profiles, explicit-only generation, callable availability, and the non-negotiable plan-critic floor in release/bundle verification guidance.
- `docs/v1-maintenance.md`: update the v1 orchestrator prompt row and writing-plans skill row with availability order and floor semantics. Record new shared source behavior only as local adaptation, not as an upstream workflow rename.
- `docs/prompt-sync.md`: update the omo orchestrator row with the same selector semantics.

Do not describe low as lower rigor, do not promise profiles that are not configured, and do not change historical design/plan records.

- [ ] **Step 7: Regenerate schema and Codex artifacts in an isolated environment.**

Run:

```powershell
& {
  $savedProfile = $env:OCMM_PROFILE
  $savedNoProfile = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue

    pnpm run gen-schema
    if ($LASTEXITCODE -ne 0) { throw "gen-schema failed" }
    pnpm run gen:codex-plugin
    if ($LASTEXITCODE -ne 0) { throw "gen:codex-plugin failed" }

    $first = git diff -- schema.json .agents/plugins/marketplace.json .codex/agents plugins/deepwork | Out-String
    if ($LASTEXITCODE -ne 0) { throw "first generated diff failed" }

    pnpm run gen-schema
    if ($LASTEXITCODE -ne 0) { throw "second gen-schema failed" }
    pnpm run gen:codex-plugin
    if ($LASTEXITCODE -ne 0) { throw "second gen:codex-plugin failed" }

    $second = git diff -- schema.json .agents/plugins/marketplace.json .codex/agents plugins/deepwork | Out-String
    if ($LASTEXITCODE -ne 0) { throw "second generated diff failed" }
    if ($first -ne $second) { throw "generators are not deterministic for the current revision" }
  }
  finally {
    if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
    if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
  }
}
```

Expected: both generators exit 0 twice and the generated diff is identical across runs. Because the repository's default config has no planning suffix overrides, `.codex/agents/dw-planner-low.toml`, `.codex/agents/dw-planner-high.toml`, `.codex/agents/dw-planner-max.toml`, and all suffixed `dw-plan-critic-*` files remain absent from the default generated tree; configured-only generation is proven in the temporary generator tests.

- [ ] **Step 8: Run the complete focused GREEN suite.**

Run with ambient profile selection cleared:

```powershell
& {
  $savedProfile = $env:OCMM_PROFILE
  $savedNoProfile = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    node --test --experimental-strip-types --test-reporter=spec src/logical-tiers/names.test.ts src/logical-tiers/materialize.test.ts src/planning-agents/names.test.ts src/planning-agents/profiles.test.ts src/review-agents/names.test.ts src/review-agents/expand.test.ts src/config/schema.test.ts src/config/load.test.ts src/config/profiles.test.ts src/hooks/config.test.ts src/routing/resolver.test.ts src/routing/model-upgrades.test.ts src/permissions/index.test.ts src/permissions/subagent-git-guard.test.ts src/hooks/chat-params.test.ts src/codex/plugin-generator.test.ts src/intent/prompt-loader.test.ts src/intent/plan-review-contract.test.ts
    if ($LASTEXITCODE -ne 0) { throw "planning logical tier focused suite failed" }
  }
  finally {
    if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
    if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
  }
}
```

Expected: every selected test passes. The output includes new shared/planning unit tests plus existing review, schema, routing, permission, floor, Codex, and prompt regressions.

- [ ] **Step 9: Perform real-surface generated-profile and schema QA.**

Run:

```powershell
if (Test-Path -LiteralPath ".codex/agents/dw-planner-high.toml") { throw "default bundle invented dw-planner-high" }
if (Test-Path -LiteralPath ".codex/agents/dw-plan-critic-low.toml") { throw "default bundle invented dw-plan-critic-low" }

rg -n '"variants"|"low"|"high"|"max"' schema.json
if ($LASTEXITCODE -ne 0) { throw "generated schema lacks logical tier keys" }
rg -n 'Planning logical-tier|plan-critic-low|xhigh-equivalent|current callable' plugins/deepwork/skills/deepwork/SKILL.md plugins/deepwork/skills/deepwork-writing-plans/SKILL.md plugins/deepwork/agents/dw-orchestrator.toml
if ($LASTEXITCODE -ne 0) { throw "generated Codex bundle lacks planning selector/floor guidance" }
```

Expected: no default suffix TOML exists, generated schema contains the tier keys, and generated Codex workflow/orchestrator/writing-plans content contains availability and floor guidance.

- [ ] **Step 10: Run repository-wide quality gates.**

Run:

```powershell
& {
  $savedProfile = $env:OCMM_PROFILE
  $savedNoProfile = $env:OCMM_NO_PROFILE
  try {
    Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    pnpm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }
    pnpm test
    if ($LASTEXITCODE -ne 0) { throw "full test suite failed" }
    pnpm run build
    if ($LASTEXITCODE -ne 0) { throw "build failed" }
  }
  finally {
    if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
    if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
  }
}
```

Expected: TypeScript typecheck, all TypeScript and Rust tests, TypeScript build, and release Rust build complete successfully.

- [ ] **Step 11: Inspect the one-commit integration boundary without writing Git state.**

Run:

```powershell
git status --short
git diff --check
if ($LASTEXITCODE -ne 0) { throw "whitespace/error-marker check failed" }
git diff --stat
git diff -- docs/superpowers/specs/2026-07-20-planning-logical-tiers-design.md docs/superpowers/plans/2026-07-20-planning-logical-tiers.md src/logical-tiers src/planning-agents src/review-agents src/config/schema.ts src/config/load.test.ts src/hooks/config.ts src/routing/resolver.ts src/routing/model-upgrades.ts src/permissions/index.ts src/hooks/chat-params.ts src/codex/plugin-generator.ts prompts/v1/agents/orchestrator.md prompts/omo/agents/orchestrator.md prompts/codex/agents/orchestrator.md skills/v1/writing-plans/SKILL.md README.md AGENTS.md docs/architecture.md examples/ocmm.example.jsonc docs/v1-maintenance.md docs/prompt-sync.md schema.json .agents/plugins/marketplace.json .codex/agents plugins/deepwork
```

Expected: no whitespace errors; every new path beyond the protected execution-start baseline belongs to the File Map; the diff shows schema/prompt/generated synchronization and no change that lowers Oracle, Reviewer, or plan-critic floors. Pre-existing unrelated paths remain untouched and visible in status.

## One-Commit Boundary

After Tasks 1-5, focused tests, generators, real-surface QA, full gates, and diff inspection are green, prepare one atomic integration commit containing the design, plan, implementation, tests, docs, schema, and generated Codex artifacts. Do not execute these commands without separate explicit user authorization:

```powershell
git add docs/superpowers/specs/2026-07-20-planning-logical-tiers-design.md docs/superpowers/plans/2026-07-20-planning-logical-tiers.md src/logical-tiers src/planning-agents src/review-agents src/config/schema.ts src/config/schema.test.ts src/config/load.test.ts src/config/profiles.test.ts src/hooks/config.ts src/hooks/config.test.ts src/routing/resolver.ts src/routing/resolver.test.ts src/routing/model-upgrades.ts src/routing/model-upgrades.test.ts src/permissions/index.ts src/permissions/index.test.ts src/permissions/subagent-git-guard.test.ts src/hooks/chat-params.ts src/hooks/chat-params.test.ts src/codex/plugin-generator.ts src/codex/plugin-generator.test.ts src/intent/prompt-loader.test.ts src/intent/plan-review-contract.test.ts prompts/v1/agents/orchestrator.md prompts/omo/agents/orchestrator.md prompts/codex/agents/orchestrator.md skills/v1/writing-plans/SKILL.md README.md AGENTS.md docs/architecture.md examples/ocmm.example.jsonc docs/v1-maintenance.md docs/prompt-sync.md schema.json .agents/plugins/marketplace.json .codex/agents plugins/deepwork
git commit -m "feat: add planning logical tier profiles" -m "Share tier materialization across planning and review roles while preserving availability and review-effort safety."
```

Expected after an authorized commit: exactly one semantic commit contains every feature path listed above; `git status --short` contains no remaining feature path and otherwise matches the protected pre-execution baseline. Do not stage pre-existing unrelated paths, and do not split generated artifacts, prompt sync docs, or the plan-critic floor tests into a second commit.

## Self-Review

- Spec coverage: Tasks 1-5 map every design requirement, including shared materialization, review regression safety, planning policy inheritance, schema eligibility and direct/layered tolerant loading, route exclusivity, availability selection, Codex generation, and docs/artifacts.
- Critical safety coverage: Task 4 tests `plan-critic-low` with lower native/direct effort and host route miss; Task 5 locks the same invariant in prompts, skill, docs, generated Codex text, and real-surface QA.
- Type consistency: `LogicalTier`, `LogicalTierVariants`, `AgentProfileRegistrationOverrides`, `ExpandedPlanningAgent`, and parser/policy names are identical across the design and every task.
- TDD consistency: every behavior-changing task begins with focused failing tests, records the expected failure, implements the minimal boundary, and runs a focused green suite before typecheck.
- Placeholder scan: no placeholder marker, shorthand cross-reference, unresolved branch, or unnamed implementation API remains.
- Scope check: no automatic runtime selector, universal role registry, role-prompt duplication, planning alias, Oracle behavior change, or review-floor reduction is included.
- QA executability: all commands are PowerShell-compatible, exact, agent-executable, environment-isolated where profile state matters, and include generated and real-surface evidence beyond unit tests.

## Plan Review Handoff

- Intended execution order: Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5 -> one authorized commit.
- Formal plan-critic receipt status: `waiting for fresh receipt` (this plan correction invalidates every earlier receipt; the orchestrator owns the current-revision critic loop and this planner session does not dispatch it).
- Residual assumptions: the current built-in planner and plan-critic requirements remain present in `src/data/agents.ts`, and no concurrent change rewrites the managed-agent registration or Codex generation boundaries before execution. If either changes, re-run discovery and update this plan before implementation.
