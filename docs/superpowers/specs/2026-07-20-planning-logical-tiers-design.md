# Planning Logical Tiers Design

## Goal

Add explicit logical-tier profiles for `planner` and `plan-critic` by extracting the existing Oracle/Reviewer tier expansion into a shared materialization layer while keeping naming, permissions, prompts, selection policy, and review-safety rules owned by role-specific adapters.

The result must preserve every current Oracle, Reviewer, planner, and plan-critic invariant. In particular, `plan-critic-low` may select a cheaper or lower-latency model route, but it must never reduce the plan-critic xhigh-equivalent review-effort floor.

## Scope

This design covers:

1. A role-neutral logical-tier naming and requirement-materialization layer.
2. Review-specific and planning-specific profile adapters.
3. `variants.low`, `variants.high`, and `variants.max` on canonical `planner` and `plan-critic` entries.
4. OpenCode registration, routing, model upgrades, permissions, prompts, and review floors for generated planning profiles.
5. Availability-aware planner and plan-critic selection guidance.
6. Generic Codex generation of explicitly materialized planning profiles.
7. Schema, prompt, documentation, generated-artifact, and migration regression coverage.

It does not implement the feature. The implementation is described in `docs/superpowers/plans/2026-07-20-planning-logical-tiers.md`.

## Context and Non-Negotiable Constraints

- `normal` is represented by the unsuffixed canonical role (`planner` or `plan-critic`). It is not a `variants` key and no `*-normal` profile is valid.
- Only explicitly configured `low`, `high`, and `max` overrides are synthesized. Configuration examples do not prove runtime availability.
- `AgentEntry.variant` and fallback-entry variants remain native model controls. Logical tiers are profile-selection metadata and must not be added to the shared `Variant` union.
- `planner` keeps its current default max route, `mode: "all"`, planner prompt/calibration, locale prefix, question permission, planner-only delegation contract, and task allowlist.
- `plan-critic` keeps its current prompt, read-only/subagent policy, receipt semantics, delegation contract, and xhigh-equivalent output floor.
- Every generated planning tier inherits the canonical role's prompt source, mode, permissions, registration overrides, route semantics, catalog-upgrade lane, and Codex generation behavior.
- Oracle ordinal priority, Oracle aliases/migration, Reviewer naming, review disable semantics, and Oracle/Reviewer xhigh-equivalent floors must not change.
- Unconfigured suffixes must not acquire an OCMM route through ordinary built-in fallback. Valid host-provided suffix profiles may remain host-owned, but OCMM must not synthesize their models or prompts.
- Schema source changes require `pnpm run gen-schema` and a synchronized `schema.json`.
- Changes under `prompts/v1/` or `skills/v1/` require a same-boundary `docs/v1-maintenance.md` update. Changes under `prompts/omo/` require `docs/prompt-sync.md`.
- Prompt, skill, registration, or Codex-generator changes require `pnpm run gen:codex-plugin` and synchronized `.agents/plugins/marketplace.json`, `.codex/agents`, and `plugins/deepwork`.
- The implementation is one integration boundary and one advisory commit. No Git write is authorized by this design session.

## Considered Approaches

### 1. Shared materializer with role-specific adapters

Extract deep cloning, normal requirement resolution, registration inheritance, native-variant propagation, primary-model replacement, explicit-only suffix creation, and catalog-suppression metadata into a role-neutral module. Keep Oracle ordinals/aliases and planning permissions/prompts in separate adapters.

Advantages:

- One implementation of the data transformation that is already common.
- Role behavior cannot accidentally leak through generic tier code.
- Oracle priority and review floors remain explicit safety policies rather than incidental suffix behavior.
- Additional tier-capable roles can reuse the primitive only after defining a deliberate role adapter.

Cost: registration and resolution must consume a small common profile shape instead of assuming every generated tier is a review agent.

### 2. Copy review expansion into a planning module

This would minimize the first refactor, but clone/model override semantics, fallback propagation, registration fields, disable rules, and catalog suppression would immediately have two implementations. Future fixes could diverge, especially around model-only overrides and deep cloning.

### 3. Replace all agent registration with one universal role registry

A universal registry could encode every built-in agent, mode, permission class, prompt source, and tier policy. It is broader than the requested change, creates migration risk for unrelated agents/categories, and obscures the review-only Oracle ordinal and safety rules.

### Decision

Use approach 1. The shared layer owns only logical-tier mechanics; review and planning adapters own identity and role policy. Do not introduce a universal agent registry or duplicate the materialization algorithm.

## Naming Contract

### Shared logical tier grammar

Create `src/logical-tiers/names.ts` as a schema-independent leaf module:

```ts
export const LOGICAL_TIER_SUFFIXES = ["low", "high", "max"] as const
export const LOGICAL_TIER_ORDER = ["normal", "low", "high", "max"] as const

export type LogicalTierSuffix = (typeof LOGICAL_TIER_SUFFIXES)[number]
export type LogicalTier = (typeof LOGICAL_TIER_ORDER)[number]

export function splitLogicalTierProfileName(name: string): {
  baseName: string
  logicalTier: LogicalTier
}

export function logicalTierProfileName(baseName: string, tier: LogicalTier): string
```

`splitLogicalTierProfileName("planner-high")` returns `{ baseName: "planner", logicalTier: "high" }`; a name without a supported suffix returns itself with `logicalTier: "normal"`. `logicalTierProfileName(base, "normal")` returns the unsuffixed base.

The pure naming module must not import `src/config/schema.ts`. This prevents the cycle `schema -> planning names -> materializer -> schema`.

### Planning identity grammar

Create `src/planning-agents/names.ts`:

```ts
export const PLANNING_AGENT_NAMES = ["planner", "plan-critic"] as const
export type PlanningAgentRole = (typeof PLANNING_AGENT_NAMES)[number]

export type PlanningAgentIdentity = {
  role: PlanningAgentRole
  logicalTier: LogicalTier
  canonicalName: string
}

export function parsePlanningAgentName(name: string): PlanningAgentIdentity | null
export function isPlanningAgentName(name: string): boolean
export function isReservedPlanningAgentName(name: string): boolean
```

Valid runtime names are:

```text
planner
planner-low
planner-high
planner-max
plan-critic
plan-critic-low
plan-critic-high
plan-critic-max
```

There are no planning aliases or ordinals. Direct config keys such as `planner-high`, `plan-critic-low`, `planner-normal`, `plan-critic-2nd`, or another malformed name in either reserved namespace are rejected. Only canonical unsuffixed entries configure tiers.

### Review identity compatibility

`src/review-agents/names.ts` imports `LogicalTier` and the shared split/name helpers, then preserves its existing role, ordinal, canonical-slot, alias, and reserved-name behavior. `ReviewLogicalTier` remains exported as a compatibility alias of `LogicalTier`.

`oracle-second` continues to canonicalize only as the unsuffixed runtime alias of `oracle-2nd`. `oracle-second-high` remains invalid. The shared suffix helper does not weaken review grammar.

## Configuration Contract

Rename the schema concept from review-only to generic logical tiers while keeping compatibility exports:

```ts
export const LogicalTierVariantOverrideSchema = z.union([
  VariantEnum,
  z.object({ model: z.string().min(1), variant: VariantEnum.optional() }).strict(),
  z.object({ variant: VariantEnum }).strict(),
])

export const LogicalTierVariantsSchema = z.object({
  low: LogicalTierVariantOverrideSchema.optional(),
  high: LogicalTierVariantOverrideSchema.optional(),
  max: LogicalTierVariantOverrideSchema.optional(),
}).strict()

export type LogicalTierVariantOverride = z.infer<typeof LogicalTierVariantOverrideSchema>
export type LogicalTierVariants = z.infer<typeof LogicalTierVariantsSchema>

export const ReviewVariantOverrideSchema = LogicalTierVariantOverrideSchema
export const ReviewVariantsSchema = LogicalTierVariantsSchema
export type ReviewVariantOverride = LogicalTierVariantOverride
export type ReviewVariants = LogicalTierVariants
```

`AgentEntrySchema.variants` uses `LogicalTierVariantsSchema`. Semantic validation allows `variants` only on:

- a canonical unsuffixed Oracle slot;
- canonical unsuffixed `reviewer`;
- canonical `planner`;
- canonical `plan-critic`.

The later-Oracle cross-entry requirement check remains review-specific and unchanged. Arbitrary agents still cannot declare `variants`.

### Configuration example

```jsonc
{
  "agents": {
    "planner": {
      "variants": {
        "low": {
          "model": "openai/gpt-5.5",
          "variant": "high"
        },
        "high": "max",
        "max": {
          "model": "openai/gpt-5.6-sol",
          "variant": "max"
        }
      }
    },
    "plan-critic": {
      "variants": {
        "low": {
          "model": "openai/gpt-5.5",
          "variant": "low"
        },
        "high": "xhigh",
        "max": {
          "model": "openai/gpt-5.6-sol",
          "variant": "max"
        }
      }
    }
  }
}
```

This materializes all eight planning runtime names. The native `variant: "low"` on `plan-critic-low` is accepted as route input but is raised to the xhigh-equivalent floor by chat/Codex output policy. The logical low profile therefore changes model selection only; it cannot lower review rigor.

## Shared Materialization Layer

Create `src/logical-tiers/materialize.ts` with these public boundaries:

```ts
export type AgentProfileRegistrationOverrides = {
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

export type ResolvedLogicalTierBase = {
  requirement: ModelRequirement
  registration: AgentProfileRegistrationOverrides
  resolutionSource: "user-config" | "agent-default"
  suppressCatalogUpgrade: boolean
}

export type MaterializedLogicalTierProfile = ResolvedLogicalTierBase & {
  name: string
  logicalTier: LogicalTier
}

export function resolveLogicalTierBase(args: {
  baseName: string
  agents?: Record<string, AgentEntry>
  builtin?: Agent
}): ResolvedLogicalTierBase | null

export function materializeLogicalTierProfiles(args: {
  baseName: string
  base: ResolvedLogicalTierBase
  variants?: LogicalTierVariants
  isDisabled(profileName: string): boolean
}): MaterializedLogicalTierProfile[]
```

`resolveLogicalTierBase()` centralizes current `normalizeAgentShorthand`, built-in `defaultAlias`, registration-field cloning, explicit model-selection detection, and built-in fallback behavior:

1. No configured entry and no built-in returns `null`.
2. A disabled normal entry returns `null`.
3. A resolved configured requirement is cloned and marked `user-config`.
4. A configured entry that activates a built-in `defaultAlias` uses the resolved alias requirement, marks `user-config`, and suppresses catalog upgrade.
5. Otherwise the built-in requirement is cloned and marked `agent-default`.
6. A configured non-built-in base without a resolvable requirement throws a role-neutral error naming the base.

`materializeLogicalTierProfiles()` applies these invariants:

1. Emit normal first unless disabled.
2. Emit suffixes in `low`, `high`, `max` order only when their override exists and the exact suffix is not disabled.
3. Deep-clone every fallback entry, provider array, thinking block, and `requiresProvider` array. No output shares mutable requirement or registration state with another tier or the source config.
4. A string override writes the native variant to the cloned requirement and every cloned fallback entry.
5. A model override replaces only the primary fallback's provider/model, preserves its inference controls and the remaining fallback chain, and updates existing `requiresModel`/`requiresProvider` constraints consistently.
6. A model-only override retains the normal native variant.
7. A suffixed profile has `resolutionSource: "user-config"`.
8. A suffixed model override sets `suppressCatalogUpgrade: true`; a variant-only override inherits the base suppression value.

The shared layer does not parse Oracle ordinals, choose prompts, assign modes, choose permissions, or apply review floors.

## Role-Specific Adapters

### Review adapter

`src/review-agents/expand.ts` becomes a thin adapter around the shared materializer. It remains solely responsible for:

- enumerating `oracle` through `oracle-9th` plus `reviewer`;
- preserving built-in availability for `oracle`, `oracle-2nd`, and `reviewer`;
- requiring explicit normal requirements for later Oracle slots;
- canonicalizing `oracle-second` only where currently supported;
- applying base-disable cascade and exact-suffix disable behavior;
- attaching `ReviewAgentIdentity`, `sourceSlot`, `promptSource: "reviewer"`, subagent/read-only role policy, and review ordering;
- retaining every current Oracle/Reviewer xhigh-equivalent safety rule outside materialization.

Existing exported review registration types may alias the shared registration type to avoid downstream churn.

### Planning adapter

Create `src/planning-agents/profiles.ts`:

```ts
export type PlanningAgentPolicy = {
  promptSource: PlanningAgentRole
  mode: "all" | "subagent"
  permissionClass: "planner" | "read-only"
  includeLocalePrefix: boolean
  reviewEffortFloor: boolean
}

export const PLANNING_AGENT_POLICIES: Record<PlanningAgentRole, PlanningAgentPolicy> = {
  planner: {
    promptSource: "planner",
    mode: "all",
    permissionClass: "planner",
    includeLocalePrefix: true,
    reviewEffortFloor: false,
  },
  "plan-critic": {
    promptSource: "plan-critic",
    mode: "subagent",
    permissionClass: "read-only",
    includeLocalePrefix: false,
    reviewEffortFloor: true,
  },
}

export type ExpandedPlanningAgent = MaterializedLogicalTierProfile & {
  identity: PlanningAgentIdentity
  policy: PlanningAgentPolicy
}

export type PlanningAgentExpansionInput = {
  agents?: Record<string, AgentEntry>
  disabledAgents?: readonly string[]
}

export function isExpandedPlanningAgentDisabled(
  name: string,
  input: PlanningAgentExpansionInput,
): boolean

export function expandPlanningAgents(
  input?: PlanningAgentExpansionInput,
): ExpandedPlanningAgent[]

export function expandedPlanningAgentMap(
  input?: PlanningAgentExpansionInput,
): ReadonlyMap<string, ExpandedPlanningAgent>
```

Both canonical normal roles are built in and materialize by default. Suffixes materialize only from canonical role `variants`. Disabling `planner` or setting `agents.planner.disabled: true` disables planner normal and all planner suffixes; disabling `planner-high` disables only that suffix. The same rule applies to plan-critic.

The policy object is the authoritative difference between roles. Logical tiers never change it.

## Registration, Prompt, Permission, and Routing Data Flow

```text
normalized OcmmConfig
  -> schema validates canonical tier-capable entries
  -> shared resolveLogicalTierBase/materializeLogicalTierProfiles
       -> review adapter attaches ordinal/review policy
       -> planning adapter attaches planner/plan-critic policy
  -> config hook registers one structural managed-profile stream
       -> role prompt source + deepwork calibration
       -> mode / locale prefix / terminal policies
       -> inherited registration overrides
       -> selected primary + effective route publication
  -> resolver reads the matching expanded profile exclusively
  -> chat.params applies request controls, then review floor where required
  -> Codex generator consumes the same registered agents and effective requirements
```

### Config registration

The ordinary built-in loop skips every parsed review or planning identity, including unsuffixed `planner` and `plan-critic`. A common managed-profile registration helper consumes the structurally shared profile fields and the adapter policy.

For every synthesized planning profile:

- `promptSource` is the canonical role, so no suffixed prompt files are created;
- planner tiers receive `mode: "all"`, locale prefix, planner terminal/delegation policy, question permission, and the task allowlist `read-only utilities + unsuffixed reviewer`;
- plan-critic tiers receive `mode: "subagent"`, no locale prefix, the plan-critic terminal/delegation policy, and the read-only utility allowlist;
- description, permissions, tools, skills, prompt append, and inference controls inherit from the canonical entry;
- prompt calibration uses `agent.promptSource ?? agent.name`, ensuring every planner tier receives planner model guidance;
- route registration uses the materialized requirement and source, and catalog upgrade is permitted only when `suppressCatalogUpgrade` is false.

The initial host-agent disable pass recognizes planning identities. It may disable a host-provided suffix according to base/suffix policy without synthesizing that suffix.

### Exclusive routing and availability

`resolveEffectiveRequirement()` checks parsed planning identities before ordinary built-in/category resolution, exactly as it already does for review identities:

```text
parsed planning name
  -> expandedPlanningAgentMap(config)
  -> matching materialized profile requirement, or null
  -> never fall through to BUILTIN_AGENT_INDEX by suffix
```

Thus `planner-high` and `plan-critic-low` resolve only when explicitly materialized. Their normal roles continue to resolve by default. A host-provided but unmaterialized suffix can execute on the host's actual model, but OCMM publishes no invented route for it.

`src/routing/model-upgrades.ts` canonicalizes a planning identity to `identity.role` before consulting the static GPT lane map. Every planning suffix therefore inherits the existing Sol lane of its canonical role. Explicit tier models still suppress catalog replacement.

`src/permissions/index.ts:isBuiltinAgentName()` recognizes parsed planning identities so depth and Git guards classify generated profiles correctly. No planning alias rewrite is added.

## Plan-Critic Safety Floor

The safety predicate becomes role based:

```ts
function isReviewFloorAgent(agentName: string | undefined): boolean {
  if (!agentName) return false
  const planning = parsePlanningAgentName(agentName)
  return planning?.role === "plan-critic" || parseReviewAgentName(agentName) !== null
}
```

The same predicate, or a shared equivalent, is used by OpenCode `chat.params` and Codex `codexReasoningEffort()`.

Safety is applied after route resolution, input variants, direct `reasoningEffort`, thinking controls, and model-family translation:

- GPT/Codex/DeepSeek plan-critic tiers receive at least `xhigh`.
- Gemini receives the existing high/thinking equivalent.
- GLM receives the existing xhigh/thinking equivalent.
- Claude receives the existing xhigh-equivalent thinking budget.
- GPT-5.6 native `max` remains `max`.
- Unsupported GPT/Codex `max` remains capped to `xhigh`.
- `planner-*` never receives a review floor merely because it is a logical-tier profile.

Route-miss handling also parses planning identities: a real host-provided `plan-critic-low/high/max` receives the floor against its actual host provider/model without borrowing another configured route. A host-provided `planner-*` does not.

This invariant must be stated in user docs, prompt guidance, the writing-plans skill, architecture docs, and both OpenCode and Codex tests: **`plan-critic-low` is a lower-cost model-selection profile, never a lower-effort review profile.**

## Availability-Aware Selection Policy

Tier selection is model-facing orchestration policy, not an automatic runtime dispatcher. Before choosing a suffixed planner or plan-critic profile, the orchestrator or writing-plans workflow must inspect the current callable/registered profile names.

For either base role `R` (`planner` or `plan-critic`):

1. Explicit user cost/latency request: try `R-low`, then `R`.
2. Small or clear work without an explicit cost/latency request: use `R`.
3. Complex, cross-module, or coordination-heavy work: try `R-high`, then `R`.
4. High-risk work involving security, performance, data loss, release safety, runtime safety, or a critical migration: try `R-max`, then `R-high`, then `R`.

At each step, select the first candidate proven available by the current task/subagent schema or registered-agent catalog. Never dispatch a suffix that is absent, never infer availability from configuration examples or generated files, and never reinterpret the tier as a permission or role change.

The policy belongs in:

- `prompts/v1/agents/orchestrator.md`;
- `prompts/omo/agents/orchestrator.md`;
- `prompts/codex/agents/orchestrator.md`;
- `skills/v1/writing-plans/SKILL.md` for plan-critic rounds;
- the generated Codex workflow skill rendered by `src/codex/plugin-generator.ts`.

Planner and plan-critic role prompt files remain canonical and are reused unchanged unless a test proves a missing role invariant. Selection belongs to the composing orchestrator/workflow, not to the selected role.

## Codex Generation

`buildCodexAgents()` remains a generic consumer of the agents produced by `createConfigHandler()` and requirements produced by `resolveEffectiveRequirement()`. No planning-tier-specific TOML loop is added.

When configured, profiles are emitted as:

```text
dw-planner-low
dw-planner-high
dw-planner-max
dw-plan-critic-low
dw-plan-critic-high
dw-plan-critic-max
```

Absent suffixes produce no TOML. Generated planning profiles reuse their canonical role developer instructions and model route. Every generated `dw-plan-critic-*` TOML records an xhigh-equivalent minimum; `dw-plan-critic-low` can use a cheaper model but cannot emit low reasoning effort.

The generated workflow skill lists the profiles that the bundle actually generated, but its dispatch guidance still treats the current callable dispatch schema as the final availability signal. A generated file is not by itself proof that a runtime can call that profile.

## Error Handling and Compatibility

- Direct schema parsing rejects malformed reserved planning names, direct suffix config keys, `normal`, empty override objects, unknown override fields, and `variants` on arbitrary roles.
- Tolerant layered loading keeps the existing behavior: remove only invalid fields/entries where recoverable and preserve valid siblings/lower layers.
- Missing unconfigured planning suffixes resolve to `null`; they do not fall back to a normal built-in route.
- A configured planning base that cannot resolve a normal requirement fails profile expansion with the canonical base named. Built-in planner and plan-critic defaults normally prevent this case.
- Base disable and exact-suffix disable are deterministic and do not mutate host profiles unrelated to the parsed planning identity.
- The compatibility exports `ReviewVariantOverrideSchema`, `ReviewVariantsSchema`, `ReviewVariantOverride`, and `ReviewVariants` remain available.
- Oracle/Reviewer expansion output, ordering, aliases, disable cascade, catalog lanes, prompts, permissions, and floors are regression-locked.
- No existing profile name is renamed and no migration rewrite is required.

## Testing Strategy

### Shared materializer and adapters

- Prove generic suffix parsing/order/name construction.
- Prove deep cloning, string variant propagation to every fallback, model-only primary replacement, fallback preservation, source metadata, and catalog suppression.
- Prove review expansion output is unchanged after delegation to the shared layer.
- Prove planning normal defaults, explicit-only suffixes, canonical identity parsing, role policy inheritance, malformed-name rejection, and base/suffix disable semantics.

### Schema and tolerant loading

- Accept planner and plan-critic variants in all valid string/object forms.
- Continue accepting canonical Oracle/Reviewer variants.
- Reject variants on ordinary agents, direct suffix config keys, explicit normal, malformed reserved planning names, empty objects, and unknown fields.
- Keep later Oracle requirement checks unchanged.
- Regenerate `schema.json` and assert the model-or-variant union.
- Prove tolerant profile loading drops an invalid planning override without dropping valid siblings.

### Registration, routing, prompts, and permissions

- Default config registers only unsuffixed planner and plan-critic planning profiles.
- Explicit variants register only the requested suffixes.
- Planner suffixes inherit mode `all`, locale, planner prompt/calibration, question permission, planner task allowlist, delegation policy, overrides, and Sol-lane catalog upgrades.
- Plan-critic suffixes inherit subagent/read-only policy, receipt prompt, overrides, and Sol-lane upgrades.
- Unconfigured suffix requirements resolve to `null`; disabled suffixes resolve to `null`; normal roles retain defaults.
- Host-provided unconfigured suffixes are not assigned invented OCMM routes.
- Generated planning identities are recognized by depth/Git guards.

### Safety floors

- A cheaper-model `plan-critic-low` with native `minimal`/`low` and direct low effort still emits the xhigh-equivalent floor.
- `plan-critic-high` and `plan-critic-max` preserve the same role floor, with GPT-5.6 native max retained and unsupported max capped.
- Host-provided route-miss plan-critic suffixes receive the floor against the actual host model.
- `planner-low/high/max` retain their configured native effort and never receive the review floor.
- Existing Oracle/Reviewer floor tests remain green.

### Selection and Codex

- v1, omo, and Codex orchestrator prompts require an availability check, exact fallback order, normal for ordinary small/clear work, and low only for explicit cost/latency requests.
- Writing-plans uses the same availability-aware plan-critic selector and states the low-profile floor invariant.
- Codex emits only configured planning suffix TOMLs, reuses canonical prompts, omits absent profiles, and floors every plan-critic tier.
- Generated workflow text lists generated profiles without treating files as callable proof.

### Final verification

Run targeted Node tests, `pnpm run gen-schema`, `pnpm run gen:codex-plugin`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build`. Inspect generated/schema/prompt diffs and run `git diff --check` before the advisory one-commit boundary.

## Documentation and Generated Artifacts

Update:

- `README.md`
- `AGENTS.md`
- `docs/architecture.md`
- `examples/ocmm.example.jsonc`
- `docs/v1-maintenance.md`
- `docs/prompt-sync.md`
- `schema.json`
- `.agents/plugins/marketplace.json`
- `.codex/agents/**`
- `plugins/deepwork/**`

The active docs must show a planning variants example, explicit-only materialization, availability-aware selection, role-policy inheritance, and the plan-critic-low floor invariant.

## Implementation Order and Integration Boundary

1. Add schema-independent logical-tier names and shared materialization with unit tests.
2. Refactor the review adapter and add planning identity/profile adapters with regression tests.
3. Integrate schema, registration, routing, model upgrades, permissions, and prompt-source calibration.
4. Extend OpenCode and Codex plan-critic floor detection to planning identities.
5. Update selector prompts/skills, active docs, and synchronization docs.
6. Regenerate schema and Codex artifacts, run all verification, and prepare one integration commit after separate Git-write authorization.

## Out of Scope

- Automatic tier selection in the runtime router.
- Synthesizing all suffixes by default.
- Planning ordinals, aliases, or arbitrary user-defined tier-capable roles.
- A universal role registry or unrelated registration refactor.
- Any reduction of Oracle, Reviewer, or plan-critic review floors.
- Changing planner or plan-critic role scope based on tier.
- Automatic fan-out to multiple planners or plan critics.
- Installing software or performing Git writes in this session.

## Self-Review

- Placeholder scan: no placeholder marker, incomplete section, or deferred design decision remains.
- Internal consistency: logical tier controls profile/model selection; native variant controls model inference; role adapters control prompts, mode, permissions, and safety.
- Scope check: the shared extraction, two role adapters, integration surfaces, selector guidance, and generated artifacts form one cross-cutting but single-purpose implementation boundary.
- Ambiguity check: valid names, schema eligibility, explicit-only availability, disable behavior, host-profile behavior, selector fallback order, and the `plan-critic-low` xhigh-equivalent floor are explicit.
