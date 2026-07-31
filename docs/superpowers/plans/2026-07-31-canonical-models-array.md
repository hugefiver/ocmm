# Canonical `models[]` Agent/Category Configuration Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept canonical agent/category `models[]` configuration and normalize it into ocmm's existing fallback chain with deterministic validation, precedence, cloning, merge, routing, and documentation behavior.

**Architecture:** Add a configuration-boundary schema and mapper only: canonical strings/objects become existing `FallbackEntry` values inside `ModelRequirement.fallbackChain` before routing. Extend the three direct-selection recognizers, then prove existing effective-route, `chat.params`, and runtime-fallback consumers preserve and lower the normalized metadata without introducing a parallel runtime representation.

**Tech Stack:** TypeScript 6, Node.js 22+ built-in test runner, Zod 4, pnpm, generated JSON Schema, immutable effective-route snapshots, OpenCode plugin hooks, Windows PowerShell, Cargo/Rust repository gates.

**Global Constraints:**
- Canonical `models[]` is allowed only on agent/category shorthand and contains one or more string or `{ model, reasoning?, temperature?, top_p?, max_tokens? }` entries.
- `model` is non-empty; `reasoning` uses the existing `ReasoningInputEnum` including deprecated input alias `none`; `temperature` is `0..2`; `top_p` is `0..1`; `max_tokens` is a positive integer.
- `provider_options` is not part of the ocmm contract. Existing tolerant Zod object behavior strips it and every other unknown canonical object field before normalization.
- Generic config loading tolerantly prunes invalid canonical elements and a resulting empty `models` field while preserving valid siblings and lower-priority layers. Direct schema parsing reports invalid declared fields and empty arrays.
- Normalize immediately to the existing `ModelRequirement.fallbackChain`; do not add another runtime graph, provider/model defaults, a model catalog, provider chains, or provider-option passthrough.
- Source precedence is accepted non-empty `models` → `requirement.fallbackChain` → `model` plus `fallbackModels` → `alias`; never merge canonical and legacy chains.
- With both `models` and `requirement`, replace only the normalized requirement's chain; preserve immutable-cloned guards and defaults. Explicit shorthand `reasoning`/`variant` overrides requirement defaults, while model-object fields remain entry-local.
- Strings reuse `parseModelString`; objects map `top_p` to `topP` and `max_tokens` to `maxTokens`. Explicit object reasoning wins its model suffix, and all canonical suffix safety from `c4ee569` remains unchanged.
- `models` arrays replace across ordinary user/project layers and profile overlays. Never add `models` to `ACCUMULATING_ARRAY_KEYS`; root/profile global `fallbackModels` behavior remains unchanged.
- Alias resolution deep-clones the normalized requirement, direct `models` suppresses alias, and canonical planning/review normals with `models` satisfy normal-profile invariants and suppress catalog promotion.
- Preserve existing resolver, effective-route, `chat.params`, runtime-fallback, canonical reasoning, and fallback behavior. Do not change their production code unless a focused integration test proves the current `FallbackEntry` contract is insufficient.
- Regenerate `schema.json` with `pnpm run gen-schema` in the same parent-owned feature commit as `src/config/schema.ts`.
- Keep the current custom JSON Schema converter unchanged: it exposes union/object fields and enums but does not serialize Zod bounds. Direct Zod tests are the authority for non-empty/numeric validation.
- Update only the existing README configuration example/reference and profile replacement table; do not change defaults, versions, prompts, skills, release files, generated Codex bundles, dead-chain diagnostics, or coding-agent-session behavior.
- Use Windows PowerShell semantics. Clear `OCMM_PROFILE`, `OCMM_NO_PROFILE`, and `OCMM_FAST` before schema generation, tests, typecheck, and build.
- Do not install software, terminate user processes, or touch user OpenCode configuration. Real-surface QA uses isolated XDG roots under the approved OS temporary directory and makes no model request.
- No implementation worker may run `git add`, `git commit`, `git push`, `git tag`, or another Git write. Tasks 1-4 end at non-Git completion checkpoints; exactly one parent-only commit boundary exists after Task 5 verification and QA.

---

## File responsibility map

| File | Action | Responsibility |
| --- | --- | --- |
| `src/config/schema.ts` | Modify | Canonical entry schemas/type, shorthand field, later-Oracle direct requirement recognition and message. |
| `src/config/schema.test.ts` | Modify | Canonical acceptance, bounds, unknown stripping, direct rejection, generated shape, later-Oracle invariant. |
| `schema.json` | Regenerate | Agent/category editor schema generated from the changed Zod source. |
| `src/config/normalize.ts` | Modify | Canonical entry mapper, direct-source precedence, requirement-chain replacement, defaults and guards. |
| `src/config/normalize.test.ts` | Modify | Mapping, suffix precedence, source precedence, requirement defaults/guards, and clone isolation. |
| `src/config/load.test.ts` | Modify | Ordinary-layer replacement and tolerant pruning/lower-layer restoration. |
| `src/config/profiles.test.ts` | Modify | Active-profile nested `models` replacement. |
| `src/config/profile-aliases.test.ts` | Modify | Normalized canonical target cloning and direct canonical alias suppression. |
| `src/logical-tiers/materialize.ts` | Modify | Include `models` in explicit model selection recognition. |
| `src/logical-tiers/materialize.test.ts` | Modify | Canonical normal-profile resolution, catalog suppression, and clone isolation. |
| `src/hooks/config.ts` | Modify | Include `models` in explicit route selection recognition. |
| `src/hooks/config.test.ts` | Modify | Host primary, published canonical chain, category/agent registration, and planning catalog suppression. |
| `src/routing/effective-route.test.ts` | Modify | Existing route materialization preserves normalized entry controls and guards. |
| `src/hooks/chat-params.test.ts` | Modify | Existing consumer lowers cross-family reasoning and concrete canonical entry options. |
| `src/runtime-fallback/dispatcher.test.ts` | Modify | Existing dispatcher selects a normalization-derived fallback without leaking unsupported fields. |
| `README.md` | Modify | Canonical example, shape/bounds, precedence/defaults, and replacement semantics. |
| `docs/superpowers/specs/2026-07-31-canonical-models-array-design.md` | Existing design artifact | Authoritative behavior, scope, and acceptance contract. |
| `docs/superpowers/plans/2026-07-31-canonical-models-array.md` | This plan | Serial TDD execution, evidence, and parent handoff. |

Production files that must remain unchanged unless Task 4 exposes a concrete contract defect: `src/config/merge.ts`, `src/shared/types.ts`, `src/routing/resolver.ts`, `src/routing/effective-route.ts`, `src/routing/route-registry.ts`, `src/hooks/chat-params.ts`, `src/runtime-fallback/event-handler-support.ts`, and `src/runtime-fallback/dispatcher.ts`.

## Execution order

1. Task 1 defines the accepted schema and generated editor contract.
2. Task 2 maps that parsed contract into the existing runtime requirement with complete precedence and cloning rules.
3. Task 3 locks layered replacement, tolerant recovery, aliases, normal-profile invariants, and direct-selection recognition.
4. Task 4 proves the normalized contract through current route/chat/fallback consumers and updates README.
5. Task 5 runs deterministic schema, repository, diagnostics, real-surface, cleanup, and scope gates.

Tasks are serial because they share `AgentEntry`/`CategoryEntry` inference, normalization semantics, and overlapping integration fixtures.

### Task 1: Add the canonical schema and generated contract

**Files:**
- Modify: `src/config/schema.ts:19-65,703-706`
- Modify: `src/config/schema.test.ts:6-18,290-330,390-427`
- Regenerate: `schema.json`

**Interfaces:**
- Consumes: `ReasoningInputEnum`, `AgentEntrySchema`, `CategoryEntrySchema`, `AgentsConfigSchemaForJsonSchema`, and deterministic `scripts/gen-schema.ts`.
- Produces: `CanonicalModelEntryObjectSchema`, `CanonicalModelEntrySchema`, `CanonicalModelEntryConfig`, and `models?: CanonicalModelEntryConfig[]` on `AgentEntry`/`CategoryEntry`.

- [ ] **Step 1: Add failing schema acceptance, stripping, and validation tests**

Extend the `src/config/schema.test.ts` import with `CanonicalModelEntryObjectSchema` and `CanonicalModelEntrySchema`, then add:

```ts
test("canonical models accept strings and bounded objects on agents and categories", () => {
  const input = {
    models: [
      "openai/gpt-5.6-sol:high",
      {
        model: "anthropic/claude-sonnet-4-6:max",
        reasoning: "none" as const,
        temperature: 0,
        top_p: 1,
        max_tokens: 1,
        provider_options: { ignored: true },
        ignored: "value",
      },
    ],
  }

  const expected = {
    models: [
      "openai/gpt-5.6-sol:high",
      {
        model: "anthropic/claude-sonnet-4-6:max",
        reasoning: "none",
        temperature: 0,
        top_p: 1,
        max_tokens: 1,
      },
    ],
  }
  assert.deepEqual(AgentEntrySchema.parse(input), expected)
  assert.deepEqual(CategoryEntrySchema.parse(input), expected)
  assert.deepEqual(CanonicalModelEntrySchema.parse(input.models[1]), expected.models[1])
})

test("canonical models reject empty arrays and invalid declared fields for direct callers", () => {
  const invalid = [
    [],
    [""],
    [{ model: "" }],
    [{ model: "x/y", reasoning: "extreme" }],
    [{ model: "x/y", temperature: -0.01 }],
    [{ model: "x/y", temperature: 2.01 }],
    [{ model: "x/y", top_p: -0.01 }],
    [{ model: "x/y", top_p: 1.01 }],
    [{ model: "x/y", max_tokens: 0 }],
    [{ model: "x/y", max_tokens: 1.5 }],
  ]

  for (const models of invalid) {
    assert.equal(AgentEntrySchema.safeParse({ models }).success, false, JSON.stringify(models))
    assert.equal(CategoryEntrySchema.safeParse({ models }).success, false, JSON.stringify(models))
  }

  for (const reasoning of ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto", "none"] as const) {
    assert.equal(CanonicalModelEntryObjectSchema.parse({ model: "x/y", reasoning }).reasoning, reasoning)
  }
})
```

- [ ] **Step 2: Run the schema suite and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts
```

Expected: non-zero exit because `CanonicalModelEntrySchema` is not exported and `models` is currently stripped as an unknown shorthand field.

- [ ] **Step 3: Implement the canonical schema and inferred type**

Insert after `ModelRequirementSchema` in `src/config/schema.ts`:

```ts
export const CanonicalModelEntryObjectSchema = z.object({
  model: z.string().min(1),
  reasoning: ReasoningInputEnum.optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().positive().optional(),
})

export const CanonicalModelEntrySchema = z.union([
  z.string().min(1),
  CanonicalModelEntryObjectSchema,
])
```

Add the field to `ShorthandFields` before legacy `model`:

```ts
const ShorthandFields = {
  description: z.string().optional(),
  alias: z.string().optional(),
  variant: VariantEnum.optional(),
  reasoning: ReasoningInputEnum.optional(),
  models: z.array(CanonicalModelEntrySchema).min(1).optional(),
  model: z.string().optional(),
  fallbackModels: z.array(ModelStringOrEntrySchema).optional(),
  requirement: ModelRequirementSchema.optional(),
}
```

Export the inferred type with the existing config types:

```ts
export type CanonicalModelEntryConfig = z.infer<typeof CanonicalModelEntrySchema>
```

Do not call `.strict()` on the canonical object and do not declare `provider_options`.

- [ ] **Step 4: Run the schema suite and verify GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts
```

Expected: exit `0`; canonical values survive, unknown canonical object fields are absent, every invalid direct case fails, and the suite reports `fail 0`.

- [ ] **Step 5: Regenerate twice and inspect the agent/category JSON Schema surface**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run gen-schema
$firstHash = (Get-FileHash -LiteralPath "schema.json" -Algorithm SHA256).Hash
pnpm run gen-schema
$secondHash = (Get-FileHash -LiteralPath "schema.json" -Algorithm SHA256).Hash
if ($firstHash -ne $secondHash) { throw "schema.json generation is not idempotent" }
@'
import { readFileSync } from "node:fs"
const schema = JSON.parse(readFileSync("schema.json", "utf8"))
const entries = {
  agent: schema.properties.agents.additionalProperties,
  category: schema.properties.categories.additionalProperties,
}
for (const [name, entry] of Object.entries(entries)) {
  const models = entry.properties.models
  const branches = models.items.anyOf ?? models.items.oneOf
  if (!Array.isArray(branches) || branches.length !== 2) throw new Error(`${name} models union mismatch`)
  const stringBranch = branches.find((branch) => branch.type === "string")
  const objectBranch = branches.find((branch) => branch.type === "object")
  if (!stringBranch) throw new Error(`${name} string model branch missing`)
  if (!objectBranch?.required?.includes("model")) throw new Error(`${name} object model requirement missing`)
  const props = objectBranch.properties
  const expected = ["max_tokens", "model", "reasoning", "temperature", "top_p"]
  if (JSON.stringify(Object.keys(props).sort()) !== JSON.stringify(expected)) throw new Error(`${name} canonical field vocabulary mismatch`)
  const reasoning = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto", "none"]
  if (JSON.stringify(props.reasoning.enum) !== JSON.stringify(reasoning)) throw new Error(`${name} reasoning enum mismatch`)
  if (Object.prototype.hasOwnProperty.call(props, "provider_options")) throw new Error(`${name} provider_options leaked`)
}
console.log("canonical models schema verified for agents and categories")
'@ | node --input-type=module
```

Expected: both generations exit `0`, hashes match, and the structural probe prints `canonical models schema verified for agents and categories`. Direct schema tests, not the current custom JSON Schema converter, prove non-empty and numeric bounds.

- [ ] **Step 6: Record the schema completion checkpoint**

Checkpoint: the direct schema suite passes, both generated-schema runs are byte-identical, and the generated agent/category surface exposes the intended canonical fields. Continue to Task 2 without staging or committing.

### Task 2: Normalize canonical entries with complete precedence and immutable guards

**Files:**
- Modify: `src/config/normalize.ts:7-12,35-104`
- Modify: `src/config/normalize.test.ts:1-191`

**Interfaces:**
- Consumes: `CanonicalModelEntryConfig`, `parseModelString(modelStr, variant?, reasoningInput?)`, `normalizeRequirementConfig(req)`, and existing `FallbackEntry`/`ModelRequirement`.
- Produces: private `normalizeCanonicalModelEntry(raw): FallbackEntry` and `normalizeDirectRequirement(entry)` with precedence `models > requirement > model + fallbackModels` before alias resolution.

- [ ] **Step 1: Add failing mapping, precedence, default, and clone tests**

Add `type AgentEntry` to the schema type import in `src/config/normalize.test.ts`, then add:

```ts
test("canonical models map to fallback entries and override every legacy chain source", () => {
  const source = {
    models: [
      "openai/gpt-5.6-sol:high",
      {
        model: "anthropic/claude-sonnet-4-6:max",
        reasoning: "none" as const,
        temperature: 0.2,
        top_p: 0.8,
        max_tokens: 8_192,
      },
    ],
    reasoning: "high" as const,
    variant: "max" as const,
    model: "legacy/primary",
    fallbackModels: ["legacy/fallback"],
    alias: "qualified:target",
    requirement: {
      reasoning: "low" as const,
      variant: "medium" as const,
      requiresModel: "guarded-model",
      requiresAnyModel: true,
      requiresProvider: ["openai", "anthropic"],
      fallbackChain: [{ providers: ["legacy"], model: "requirement-chain" }],
    },
  } satisfies AgentEntry

  const result = normalizeDirectRequirement(source)!
  assert.deepEqual(result, {
    reasoning: "high",
    variant: "max",
    requiresModel: "guarded-model",
    requiresAnyModel: true,
    requiresProvider: ["openai", "anthropic"],
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol", reasoning: "high" },
      {
        providers: ["anthropic"],
        model: "claude-sonnet-4-6",
        reasoning: "off",
        temperature: 0.2,
        topP: 0.8,
        maxTokens: 8_192,
      },
    ],
  })
  assert.notEqual(result.requiresProvider, source.requirement.requiresProvider)
  result.requiresProvider!.push("mutated")
  assert.deepEqual(source.requirement.requiresProvider, ["openai", "anthropic"])
})

test("canonical models preserve requirement defaults when shorthand defaults are absent", () => {
  const result = normalizeDirectRequirement({
    models: [
      { model: "openai/gpt-5.6-sol:max", temperature: 2, top_p: 0, max_tokens: 1 },
    ],
    requirement: {
      reasoning: "low",
      variant: "medium",
      requiresAnyModel: false,
      fallbackChain: [{ providers: ["legacy"], model: "discarded" }],
    },
  })

  assert.deepEqual(result, {
    reasoning: "low",
    variant: "medium",
    requiresAnyModel: false,
    fallbackChain: [{
      providers: ["openai"],
      model: "gpt-5.6-sol",
      reasoning: "max",
      temperature: 2,
      topP: 0,
      maxTokens: 1,
    }],
  })
})

test("direct canonical models suppress aliases and keep entry fields local", () => {
  let aliasCalls = 0
  const result = normalizeShorthand(
    {
      alias: "target",
      reasoning: "medium",
      models: [
        { model: "openai/gpt-5.6-sol:high", reasoning: "none", temperature: 0.4 },
        "anthropic/claude-sonnet-4-6:low",
      ],
    },
    {
      selfName: "source",
      resolveAlias: () => {
        aliasCalls++
        return normalizeShorthand({ model: "legacy/target" })
      },
    },
  )

  assert.equal(aliasCalls, 0)
  assert.deepEqual(result?.requirement, {
    reasoning: "medium",
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol", reasoning: "off", temperature: 0.4 },
      { providers: ["anthropic"], model: "claude-sonnet-4-6", reasoning: "low" },
    ],
  })
  assert.equal(result?.requirement?.fallbackChain[1]?.temperature, undefined)
})
```

- [ ] **Step 2: Run normalization tests and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/normalize.test.ts
```

Expected: non-zero exit because parsed `models` is not yet mapped; requirement or legacy sources win and the expected canonical chains are absent.

- [ ] **Step 3: Add the canonical entry mapper**

Import `CanonicalModelEntryConfig` from `./schema.ts`, then add after `normalizeFallbackEntryConfig()`:

```ts
function normalizeCanonicalModelEntry(raw: CanonicalModelEntryConfig): FallbackEntry {
  if (typeof raw === "string") return parseModelString(raw)

  const entry = parseModelString(raw.model, undefined, raw.reasoning)
  if (raw.temperature !== undefined) entry.temperature = raw.temperature
  if (raw.top_p !== undefined) entry.topP = raw.top_p
  if (raw.max_tokens !== undefined) entry.maxTokens = raw.max_tokens
  return entry
}
```

Do not accept or spread unknown fields. `parseModelString` remains the only canonical suffix parser.

- [ ] **Step 4: Implement direct-source precedence and requirement-chain replacement**

Replace the opening of `normalizeDirectRequirement()` with:

```ts
export function normalizeDirectRequirement(
  entry: AgentEntry | CategoryEntry | undefined,
): ModelRequirement | undefined {
  if (!entry) return undefined

  if (entry.models?.length) {
    const fallbackChain = entry.models.map(normalizeCanonicalModelEntry)
    const requirement: ModelRequirement = entry.requirement
      ? { ...normalizeRequirementConfig(entry.requirement), fallbackChain }
      : { fallbackChain }
    const reasoning: Reasoning | undefined = normalizeReasoning(entry.reasoning)
    if (reasoning !== undefined) requirement.reasoning = reasoning
    if (entry.variant !== undefined) requirement.variant = entry.variant
    return requirement
  }

  if (entry.requirement) return normalizeRequirementConfig(entry.requirement)

  const chain: FallbackEntry[] = []
  if (entry.model) chain.push(parseModelString(entry.model, entry.variant, entry.reasoning))
  if (entry.fallbackModels) {
    for (const model of entry.fallbackModels) chain.push(normalizeFallbackEntryConfig(model))
  }
  if (chain.length === 0) return undefined

  const requirement: ModelRequirement = { fallbackChain: chain }
  const reasoning: Reasoning | undefined = normalizeReasoning(entry.reasoning)
  if (reasoning !== undefined) requirement.reasoning = reasoning
  if (entry.variant !== undefined) requirement.variant = entry.variant
  return requirement
}
```

The legacy branch is retained exactly after the new canonical branch.

- [ ] **Step 5: Run normalization tests and verify GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/normalize.test.ts
```

Expected: exit `0`; all new precedence/mapping/clone assertions and existing legacy/alias/suffix tests report `fail 0`.

- [ ] **Step 6: Record the normalization completion checkpoint**

Checkpoint: canonical mapping, precedence, requirement defaults/guards, alias suppression, and clone isolation pass together with all legacy normalization regressions. Continue to Task 3 without staging or committing.

### Task 3: Lock merge, tolerant load, profile, alias, and explicit-selection semantics

**Files:**
- Modify: `src/config/schema.ts:367-435`
- Modify: `src/config/schema.test.ts:437-470`
- Modify: `src/config/load.test.ts:145-157,446-558`
- Modify: `src/config/profiles.test.ts:904-958`
- Modify: `src/config/profile-aliases.test.ts:110-206`
- Modify: `src/logical-tiers/materialize.ts:128-131`
- Modify: `src/logical-tiers/materialize.test.ts:131-166`
- Modify: `src/hooks/config.ts:530-535`
- Modify: `src/hooks/config.test.ts:639-702`

**Interfaces:**
- Consumes: Task 2 `normalizeDirectRequirement()`, current `deepMerge()` replacement-by-default policy, tolerant layered loading, alias clone helpers, and logical-tier materialization.
- Produces: `models` recognition in `hasDirectNormalRequirement()`, `hasExplicitModelSelection()`, and `hasExplicitRouteSelection()`; evidence that arrays replace, malformed data recovers, and clones stay independent.

- [ ] **Step 1: Add failing ordinary-layer and tolerant recovery tests**

Add to `src/config/load.test.ts` after the existing merge policy test:

```ts
test("nested canonical models replace across ordinary and profile merges", () => {
  const base = { agents: { worker: { models: ["base/one", "base/two"] } } }
  const override = { agents: { worker: { models: ["project/only"] } } }

  assert.deepEqual(deepMerge(base, override), override)
  assert.deepEqual(deepMerge(base, override, undefined, { profileOverlay: true }), override)
})
```

Add after `withUserAndProjectConfigs()`:

```ts
test("loadConfig replaces project models and restores lower models after an invalid override", () => {
  withUserAndProjectConfigs(
    {
      agents: {
        worker: {
          models: ["user/primary", { model: "user/fallback", temperature: 0.4 }],
          description: "user",
        },
      },
    },
    {
      agents: {
        worker: {
          models: ["project/only"],
          description: "project",
        },
      },
    },
    (config) => {
      assert.deepEqual(config.agents?.worker?.models, ["project/only"])
      assert.equal(config.agents?.worker?.description, "project")
    },
  )

  withUserAndProjectConfigs(
    { agents: { worker: { models: ["user/restored"], description: "user" } } },
    { agents: { worker: { models: [{ model: "", temperature: 3 }], description: "project" } } },
    (config) => {
      assert.deepEqual(config.agents?.worker?.models, ["user/restored"])
      assert.equal(config.agents?.worker?.description, "project")
    },
  )
})

test("loadConfig removes unrecoverable canonical models while preserving a legacy sibling", () => {
  withProjectConfig({
    agents: {
      worker: {
        model: "legacy/primary",
        models: [{ model: "", top_p: 2 }],
      },
    },
  }, (config) => {
    assert.equal(config.agents?.worker?.models, undefined)
    assert.equal(config.agents?.worker?.model, "legacy/primary")
  })
})
```

- [ ] **Step 2: Add failing profile replacement, later-Oracle, alias, and logical-tier tests**

Add to `src/config/profiles.test.ts` near the existing profile array tests:

```ts
test("profile overlay replaces nested canonical models", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: { planner: { models: ["base/primary", "base/fallback"] } },
      profiles: {
        focused: { agents: { planner: { models: ["profile/only"] } } },
      },
      activeProfile: "focused",
    })
    const { config } = loadWithXdg(xdg)
    assert.deepEqual(config.agents?.planner?.models, ["profile/only"])
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})
```

Extend the accepted cases in `direct schema rejects later Oracle slots without a resolved normal requirement` in `src/config/schema.test.ts` with:

```ts
{ "oracle-7th": { models: ["openai/gpt-5.6-sol"] } },
```

Add to `src/config/profile-aliases.test.ts`:

```ts
test("qualified aliases clone normalized canonical chains and guards", () => {
  const config = configWithAgents({ source: { alias: "precision:reviewer" } })
  const target: AgentEntry = {
    models: [
      "openai/gpt-5.6-sol:high",
      { model: "anthropic/claude-sonnet-4-6", temperature: 0.2, top_p: 0.8, max_tokens: 4_096 },
    ],
    requirement: {
      requiresModel: "gpt-5.6-sol",
      requiresAnyModel: true,
      requiresProvider: ["openai", "anthropic"],
      fallbackChain: [{ providers: ["discarded"], model: "discarded" }],
    },
  }
  const result = materializeQualifiedAgentAliases({
    config,
    baseAgents: config.agents ?? {},
    profiles: profiles({ precision: { agents: { reviewer: target } } }),
  })
  const requirement = result.agents?.source?.requirement!

  assert.deepEqual(requirement, {
    requiresModel: "gpt-5.6-sol",
    requiresAnyModel: true,
    requiresProvider: ["openai", "anthropic"],
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol", reasoning: "high" },
      { providers: ["anthropic"], model: "claude-sonnet-4-6", temperature: 0.2, topP: 0.8, maxTokens: 4_096 },
    ],
  })
  requirement.fallbackChain[0]!.providers.push("mutated")
  requirement.requiresProvider!.push("mutated")
  assert.deepEqual(target.requirement.requiresProvider, ["openai", "anthropic"])
})
```

Extend `source direct requirements and shorthand models override a qualified alias` with this fixture and assertion:

```ts
modelsSource: { alias: "precision:reviewer", models: ["source/CANONICAL"] },
```

```ts
assert.equal(result.agents?.modelsSource?.requirement, undefined)
assert.deepEqual(result.agents?.modelsSource?.models, ["source/CANONICAL"])
```

Add to `src/logical-tiers/materialize.test.ts`:

```ts
test("resolveLogicalTierBase treats canonical models as explicit user selection", () => {
  const configured: AgentEntry = {
    models: [
      "openai/gpt-5.6-sol:high",
      { model: "anthropic/claude-sonnet-4-6", temperature: 0.2 },
    ],
    requirement: {
      requiresProvider: ["openai", "anthropic"],
      fallbackChain: [{ providers: ["discarded"], model: "discarded" }],
    },
  }
  const resolved = resolveLogicalTierBase({ baseName: "planner", agents: { planner: configured } })!

  assert.equal(resolved.resolutionSource, "user-config")
  assert.equal(resolved.suppressCatalogUpgrade, true)
  assert.deepEqual(resolved.requirement.fallbackChain, [
    { providers: ["openai"], model: "gpt-5.6-sol", reasoning: "high" },
    { providers: ["anthropic"], model: "claude-sonnet-4-6", temperature: 0.2 },
  ])
  resolved.requirement.fallbackChain[0]!.providers.push("mutated")
  resolved.requirement.requiresProvider!.push("mutated")
  assert.deepEqual(configured.requirement?.requiresProvider, ["openai", "anthropic"])
})
```

- [ ] **Step 3: Add a failing config-hook catalog-suppression assertion**

Add to `src/hooks/config.test.ts` near the configured planning profile tests:

```ts
test("canonical models on managed normal profiles suppress catalog upgrades", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    agents: {
      planner: {
        models: ["openai/configured-planner", "anthropic/configured-fallback"],
        variants: { high: "high" as const },
      },
    },
  }
  const target: { agent: Record<string, unknown>; provider: Record<string, unknown> } = {
    agent: {},
    provider: { openai: { models: { "gpt-5.7-sol": {} } } },
  }

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
  })(target, undefined)

  for (const name of ["planner", "planner-high"]) {
    assert.equal((target.agent[name] as Record<string, unknown>).model, "openai/configured-planner")
    assert.equal(publishedRoute(routeRegistry, name).primarySource, "user-requirement")
  }
})
```

- [ ] **Step 4: Run the focused semantics suites and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts src/config/load.test.ts src/config/profiles.test.ts src/config/profile-aliases.test.ts src/logical-tiers/materialize.test.ts src/hooks/config.test.ts
```

Expected: non-zero exit. Merge and tolerant normalization tests may already pass, but the later-Oracle invariant and explicit logical-tier/config selection still reject or catalog-promote `models` because the three recognition lists omit it.

- [ ] **Step 5: Extend the three direct-selection recognizers**

Update `hasDirectNormalRequirement()` in `src/config/schema.ts`:

```ts
function hasDirectNormalRequirement(entry: z.infer<typeof AgentEntrySchema>): boolean {
  return entry.requirement !== undefined
    || (Array.isArray(entry.models) && entry.models.length > 0)
    || (typeof entry.model === "string" && entry.model.trim().length > 0)
    || (Array.isArray(entry.fallbackModels) && entry.fallbackModels.length > 0)
}
```

Change its later-Oracle validation message to:

```ts
message: "later Oracle slots must resolve a normal model requirement through models, model, fallbackModels, requirement, or alias",
```

Update `hasExplicitModelSelection()` in `src/logical-tiers/materialize.ts`:

```ts
function hasExplicitModelSelection(entry: AgentEntry | undefined): boolean {
  return !!entry && ["models", "model", "fallbackModels", "requirement", "alias"]
    .some((key) => entry[key as keyof AgentEntry] !== undefined)
}
```

Update `hasExplicitRouteSelection()` in `src/hooks/config.ts`:

```ts
function hasExplicitRouteSelection(cfg: OcmmConfig, name: string): boolean {
  return [cfg.agents?.[name], cfg.categories?.[name]].some((entry) =>
    entry !== undefined && ["models", "model", "fallbackModels", "requirement", "alias"].some((field) =>
      Object.prototype.hasOwnProperty.call(entry, field)
    )
  )
}
```

Do not edit `src/config/merge.ts`; replacement is already its default array behavior.

- [ ] **Step 6: Run the focused semantics suites and verify GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts src/config/load.test.ts src/config/profiles.test.ts src/config/profile-aliases.test.ts src/logical-tiers/materialize.test.ts src/hooks/config.test.ts
```

Expected: exit `0`; ordinary/profile replacement, tolerant lower-layer restoration, canonical alias cloning, direct alias suppression, later-Oracle acceptance, and managed catalog suppression all report `fail 0`.

- [ ] **Step 7: Record the configuration-semantics integration checkpoint**

Checkpoint: merge, tolerant recovery, profile replacement, alias cloning, later-Oracle acceptance, and catalog suppression pass as one integrated configuration contract. Continue to Task 4 without staging or committing.

### Task 4: Prove existing consumers and document the user contract

**Files:**
- Modify: `src/hooks/config.test.ts:1486-1608`
- Modify: `src/routing/effective-route.test.ts:1-12,258-338`
- Modify: `src/hooks/chat-params.test.ts:4-9,1344-1432`
- Modify: `src/runtime-fallback/dispatcher.test.ts:4-7,332-354`
- Modify: `README.md:442-471,634-645,783-839`
- Verify unchanged: `src/routing/effective-route.ts`, `src/hooks/chat-params.ts`, `src/runtime-fallback/dispatcher.ts`, `src/shared/types.ts`

**Interfaces:**
- Consumes: Task 2 normalized `ModelRequirement`, `buildEffectiveModelRoute()`, `createConfigHandler()`, `createChatParamsHandler()`, `dispatchFallbackRetry()`, and existing `FallbackEntry` controls.
- Produces: evidence that one normalized chain drives host registration, immutable routes, cross-family lowering, and fallback dispatch; README's canonical configuration contract.

- [ ] **Step 1: Add config-hook and effective-route contract tests**

Add to `src/hooks/config.test.ts` near registry-managed publication tests:

```ts
test("config publishes canonical agent and category models as complete fallback routes", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    agents: {
      "canonical-worker": {
        models: [
          "openai/gpt-5.6-sol:high",
          { model: "anthropic/claude-sonnet-4-6", reasoning: "low" as const, temperature: 0.2, top_p: 0.8, max_tokens: 4_096 },
        ],
      },
    },
    categories: {
      "canonical-category": { models: ["google/gemini-3.1-pro", "openai/gpt-5.6-sol"] },
    },
  }
  const target: { agent: Record<string, unknown>; provider: Record<string, unknown> } = { agent: {}, provider: {} }

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
  })(target, undefined)

  assert.equal((target.agent["canonical-worker"] as Record<string, unknown>).model, "openai/gpt-5.6-sol")
  assert.equal((target.agent["canonical-category"] as Record<string, unknown>).model, "google/gemini-3.1-pro")
  assert.deepEqual(publishedRoute(routeRegistry, "canonical-worker").requirement.fallbackChain, [
    { providers: ["openai"], model: "gpt-5.6-sol", reasoning: "high" },
    { providers: ["anthropic"], model: "claude-sonnet-4-6", reasoning: "low", temperature: 0.2, topP: 0.8, maxTokens: 4_096 },
  ])
  assert.deepEqual(publishedRoute(routeRegistry, "canonical-category").requirement.fallbackChain, [
    { providers: ["google"], model: "gemini-3.1-pro" },
    { providers: ["openai"], model: "gpt-5.6-sol" },
  ])
})
```

Import `normalizeDirectRequirement` in `src/routing/effective-route.test.ts`, then add:

```ts
test("effective routes preserve normalized canonical controls and requirement guards", () => {
  const requirement = normalizeDirectRequirement({
    models: [
      { model: "openai/gpt-5.6-sol:high", temperature: 0.2, top_p: 0.8, max_tokens: 4_096 },
      "anthropic/claude-sonnet-4-6:low",
    ],
    requirement: {
      requiresModel: "gpt-5.6-sol",
      requiresAnyModel: true,
      requiresProvider: ["openai", "anthropic"],
      fallbackChain: [{ providers: ["discarded"], model: "discarded" }],
    },
  })!
  const route = buildEffectiveModelRoute({
    selectedModel: "openai/gpt-5.6-sol",
    requirement,
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastMode: false,
    fastModels: fastModels(),
  })

  assert.deepEqual(route.requirement, requirement)
  assert.notEqual(route.requirement, requirement)
  assert.notEqual(route.requirement.fallbackChain, requirement.fallbackChain)
  assert.notEqual(route.requirement.requiresProvider, requirement.requiresProvider)
})
```

- [ ] **Step 2: Add normalization-derived `chat.params` cross-family tests**

Import `normalizeDirectRequirement` in `src/hooks/chat-params.test.ts`, then add:

```ts
test("chat.params lowers canonical models entry controls for each actual family", async () => {
  clearResolutions()
  const requirement = normalizeDirectRequirement({
    models: [
      { model: "openai/gpt-5.4-mini:high", temperature: 0.2, top_p: 0.8, max_tokens: 4_096 },
      { model: "anthropic/claude-sonnet-4-6:low", temperature: 0.4, top_p: 0.6, max_tokens: 2_048 },
    ],
  })!
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.4-mini",
    requirement,
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastPath: { kind: "off" },
  }]]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  const gpt = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", providerID: "openai", modelID: "gpt-5.4-mini" }), gpt)
  assert.deepEqual(gpt, {
    options: { reasoningEffort: "high" },
    temperature: 0.2,
    topP: 0.8,
    maxOutputTokens: 4_096,
  })

  const claude = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", providerID: "anthropic", modelID: "claude-sonnet-4-6" }), claude)
  assert.deepEqual(claude, {
    options: { thinking: { type: "enabled", budgetTokens: 2_048 } },
    temperature: 0.4,
    topP: 0.6,
    maxOutputTokens: 2_048,
  })
})
```

- [ ] **Step 3: Add a normalization-derived fallback dispatcher test**

Import `normalizeDirectRequirement` in `src/runtime-fallback/dispatcher.test.ts`, then add:

```ts
test("dispatcher selects a canonical models fallback without leaking entry controls", async () => {
  const { client, calls } = makeClient({
    messages: [{ role: "user", parts: [{ type: "text", text: "retry" }] }],
  })
  const requirement = normalizeDirectRequirement({
    models: [
      "openai/gpt-5.6-sol:high",
      { model: "anthropic/claude-sonnet-4-6:low", temperature: 0.2, top_p: 0.8, max_tokens: 4_096 },
    ],
  })!

  const ok = await dispatchFallbackRetry({
    client,
    sessionID: "ses_canonical_models",
    newEntry: requirement.fallbackChain[1]!,
    reason: "rate_limit",
  })

  assert.equal(ok, true)
  assert.equal(calls[0]?.body.providerID, "anthropic")
  assert.equal(calls[0]?.body.modelID, "claude-sonnet-4-6")
  for (const field of ["reasoning", "variant", "temperature", "topP", "maxTokens", "maxOutputTokens"]) {
    assert.equal(calls[0]?.body[field], undefined, field)
  }
})
```

- [ ] **Step 4: Run consumer contract tests and verify GREEN without production consumer edits**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/routing/effective-route.test.ts src/hooks/chat-params.test.ts src/runtime-fallback/dispatcher.test.ts
```

Expected: exit `0`; the current consumers honor the normalized `FallbackEntry` contract, both model families receive correct final options, dispatcher bodies remain wire-compatible, and no route/chat/fallback production file changes are needed. If this command fails, stop at the failing contract and return to the design owner rather than creating a second runtime representation.

- [ ] **Step 5: Update README's example and shorthand reference**

Replace the configuration-section introduction with wording that matches the existing tolerant Zod behavior:

```markdown
Schema (Zod-validated; unknown object keys are stripped). Declared invalid fields fail direct schema parsing and are pruned locally by runtime loading so valid siblings and lower-priority values can survive. All fields optional:
```

In the main `agents` example, use canonical `models` for `orchestrator` while retaining `reviewer` as a legacy shorthand example and `builder` as the full requirement example:

```jsonc
"orchestrator": {
  "reasoning": "high",
  "models": [
    "openai/gpt-5.6-sol",
    {
      "model": "anthropic/claude-sonnet-4-6",
      "reasoning": "max",
      "temperature": 0.2,
      "top_p": 0.8,
      "max_tokens": 8192
    }
  ]
},
```

Use canonical `models` in the `hard-reasoning` category example:

```jsonc
"hard-reasoning": {
  "models": ["openai/gpt-5.6-sol:xhigh"]
},
```

Replace the shorthand table rows for model selection with:

```markdown
| `models`         | non-empty array of `string \| { model, reasoning?, temperature?, top_p?, max_tokens? }` | Preferred canonical fallback chain. Objects validate `temperature` `0..2`, `top_p` `0..1`, and positive integer `max_tokens`; unknown keys are stripped. |
| `model`          | `"provider/model"` string                                                                        | Legacy primary shorthand. Split into `providers: [provider]` plus `model`. |
| `variant`        | `"low" \| "medium" \| "high" \| "xhigh" \| "max" \| "minimal" \| "none" \| "auto" \| "thinking"` | Requirement default; with legacy `model`, also promoted onto the first chain entry. |
| `reasoning`      | `"off" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh" \| "max" \| "auto"`; deprecated input alias `"none"` | Canonical requirement default. An individual `models` object value is entry-local and wins its model suffix. |
| `fallbackModels` | array of `string \| FallbackEntry`                                                               | Legacy fallback shorthand appended after legacy `model`; its ordinary user/project accumulation behavior is unchanged. |
| `requirement`    | full `ModelRequirement` object                                                                   | Full guards/defaults. With `models`, only its chain is replaced; otherwise it outranks legacy `model`/`fallbackModels`. |
```

Immediately below the table, add:

```markdown
Direct model-source precedence is `models` → `requirement` → `model` plus `fallbackModels` → `alias`; chains are never merged. When `models` and `requirement` coexist, ocmm preserves cloned requirement guards and defaults while replacing only `fallbackChain`. Explicit top-level `reasoning`/`variant` overrides requirement defaults; per-model object fields stay on that entry. `provider_options` is not supported and, like other unknown object fields, is stripped before runtime.
```

In the profile merge table, add nested canonical arrays as a distinct row and adjust the following note:

```markdown
| Nested `agents.*.models`, `categories.*.models`     | **Replaced** (the overlay owns the complete canonical chain) |
```

```markdown
Nested canonical `models` arrays replace across both ordinary user/project layers and profiles. Root `fallbackModels` and `disabledAgents` remain unioned across user/project configs and replaced by profiles.
```

- [ ] **Step 6: Re-run consumer tests and inspect README terms**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/routing/effective-route.test.ts src/hooks/chat-params.test.ts src/runtime-fallback/dispatcher.test.ts
rg -n "models|provider_options|top_p|max_tokens|Direct model-source precedence|Nested canonical" README.md
```

Expected: tests exit `0`; README search shows the canonical example, all five object fields, precedence, unsupported provider options, and replacement semantics while legacy `fallbackModels` documentation remains present.

- [ ] **Step 7: Record the consumer and documentation integration checkpoint**

Checkpoint: config publication, effective-route preservation, cross-family option lowering, fallback dispatch compatibility, and README documentation pass together. Continue to Task 5 without staging or committing.

### Task 5: Complete repository and isolated OpenCode verification

**Files:**
- Verify: every file in the responsibility map
- Verify cleanup: `$env:LOCALAPPDATA\Temp\opencode\ocmm-canonical-models-$PID`

**Interfaces:**
- Consumes: the complete Tasks 1-4 revision and built modules under `dist/`.
- Produces: targeted/full test receipts, deterministic generated schema, type/build receipts, changed-file diagnostics, no-request OpenCode primary/fallback evidence, cleanup evidence, and exact scope evidence.

- [ ] **Step 1: Run the complete targeted contract set**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts src/config/normalize.test.ts src/config/load.test.ts src/config/profiles.test.ts src/config/profile-aliases.test.ts src/logical-tiers/materialize.test.ts src/hooks/config.test.ts src/routing/effective-route.test.ts src/hooks/chat-params.test.ts src/runtime-fallback/dispatcher.test.ts
```

Expected: exit `0`; summary reports `fail 0`.

- [ ] **Step 2: Prove generated schema idempotency and exact canonical field vocabulary**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run gen-schema
$schemaHash = (Get-FileHash -LiteralPath "schema.json" -Algorithm SHA256).Hash
pnpm run gen-schema
$schemaHashAfter = (Get-FileHash -LiteralPath "schema.json" -Algorithm SHA256).Hash
if ($schemaHash -ne $schemaHashAfter) { throw "schema.json generation is not idempotent" }
@'
import { readFileSync } from "node:fs"
const schema = JSON.parse(readFileSync("schema.json", "utf8"))
for (const [name, entry] of Object.entries({
  agent: schema.properties.agents.additionalProperties,
  category: schema.properties.categories.additionalProperties,
})) {
  const models = entry.properties.models
  const branches = models.items.anyOf ?? models.items.oneOf
  const object = branches.find((branch) => branch.type === "object")
  const string = branches.find((branch) => branch.type === "string")
  if (!string || !object?.required?.includes("model")) throw new Error(`${name}: canonical union mismatch`)
  const expected = ["max_tokens", "model", "reasoning", "temperature", "top_p"]
  if (JSON.stringify(Object.keys(object.properties).sort()) !== JSON.stringify(expected)) throw new Error(`${name}: canonical field vocabulary mismatch`)
  const reasoning = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto", "none"]
  if (JSON.stringify(object.properties.reasoning.enum) !== JSON.stringify(reasoning)) throw new Error(`${name}: reasoning enum mismatch`)
  if (object.properties.provider_options !== undefined) throw new Error(`${name}: provider_options leaked`)
}
console.log("schema canonical models boundaries verified")
'@ | node --input-type=module
```

Expected: both generation commands exit `0`, hashes match, and inspection prints `schema canonical models boundaries verified`; Task 1 direct Zod tests remain the bounds receipt.

- [ ] **Step 3: Run typecheck, full tests, and build**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run typecheck
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm test
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run build
```

Expected: all commands exit `0`; TypeScript reports no errors, Node and Cargo tests have zero failures, and TypeScript plus native LSP artifacts build under `dist/`. If an existing user process locks an output, do not terminate it; report the build gate as blocked.

- [ ] **Step 4: Run diagnostics for every changed TypeScript file**

Prefer LSP diagnostics with severity `all` for:

```text
src/config/schema.ts
src/config/schema.test.ts
src/config/normalize.ts
src/config/normalize.test.ts
src/config/load.test.ts
src/config/profiles.test.ts
src/config/profile-aliases.test.ts
src/logical-tiers/materialize.ts
src/logical-tiers/materialize.test.ts
src/hooks/config.ts
src/hooks/config.test.ts
src/routing/effective-route.test.ts
src/hooks/chat-params.test.ts
src/runtime-fallback/dispatcher.test.ts
```

Expected: no diagnostics for every file. If the TypeScript language server is unavailable, do not install it; run this installed-compiler fallback, which explicitly includes excluded test files in `rootNames`:

```powershell
@'
import path from "node:path"
import ts from "typescript"

const files = [
  "src/config/schema.ts",
  "src/config/schema.test.ts",
  "src/config/normalize.ts",
  "src/config/normalize.test.ts",
  "src/config/load.test.ts",
  "src/config/profiles.test.ts",
  "src/config/profile-aliases.test.ts",
  "src/logical-tiers/materialize.ts",
  "src/logical-tiers/materialize.test.ts",
  "src/hooks/config.ts",
  "src/hooks/config.test.ts",
  "src/routing/effective-route.test.ts",
  "src/hooks/chat-params.test.ts",
  "src/runtime-fallback/dispatcher.test.ts",
]
const configPath = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json")
if (!configPath) throw new Error("tsconfig.json not found")
const loaded = ts.readConfigFile(configPath, ts.sys.readFile)
if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, "\n"))
const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(configPath), undefined, configPath)
const absoluteFiles = files.map((file) => path.resolve(file))
const targets = new Set(absoluteFiles.map((file) => file.toLowerCase()))
const rootNames = [...new Set([...parsed.fileNames.map((file) => path.resolve(file)), ...absoluteFiles])]
const program = ts.createProgram({ rootNames, options: parsed.options })
const missing = absoluteFiles.filter((file) => program.getSourceFile(file) === undefined)
if (missing.length) throw new Error(`diagnostic targets missing from compiler program: ${missing.join(", ")}`)
const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) =>
  diagnostic.file === undefined || targets.has(path.resolve(diagnostic.file.fileName).toLowerCase())
)
if (diagnostics.length) {
  const host = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  }
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, host))
  process.exit(1)
}
console.log("changed-file compiler diagnostics: 0")
'@ | node --input-type=module
```

Expected fallback: exit `0` and print `changed-file compiler diagnostics: 0`; the missing-target assertion proves all 14 changed source/test files entered the compiler program.

- [ ] **Step 5: Run isolated no-request OpenCode QA and remove all temporary state**

Run from the repository root after the build:

```powershell
$pluginPath = (Resolve-Path -LiteralPath "dist\index.js").Path
$repoRoot = (Resolve-Path -LiteralPath ".").Path
$tempParent = Join-Path $env:LOCALAPPDATA "Temp\opencode"
if (-not (Test-Path -LiteralPath $tempParent)) { throw "approved OpenCode temporary parent is missing" }
$testRoot = Join-Path $tempParent ("ocmm-canonical-models-" + $PID)
$sandbox = Join-Path $testRoot "sandbox"
$evidence = Join-Path $testRoot "evidence"
$locationPushed = $false
$qaPassed = $false
try {
  New-Item -ItemType Directory -Force -Path (Join-Path $sandbox ".opencode"), (Join-Path $sandbox "xdg-config"), (Join-Path $sandbox "xdg-data"), (Join-Path $sandbox "xdg-state"), (Join-Path $sandbox "xdg-cache"), $evidence | Out-Null
  $env:XDG_CONFIG_HOME = Join-Path $sandbox "xdg-config"
  $env:XDG_DATA_HOME = Join-Path $sandbox "xdg-data"
  $env:XDG_STATE_HOME = Join-Path $sandbox "xdg-state"
  $env:XDG_CACHE_HOME = Join-Path $sandbox "xdg-cache"
  $env:OCMM_DEBUG = "1"
  $env:OCMM_QA_SANDBOX = $sandbox
  $env:OCMM_QA_REPO = $repoRoot

  $openCodeConfig = @{
    '$schema' = 'https://opencode.ai/config.json'
    plugin = @($pluginPath)
    disabled_providers = @('opencode', 'openrouter', 'github-copilot', 'openai')
    provider = @{
      qa = @{
        npm = '@ai-sdk/openai-compatible'
        name = 'Canonical Models QA'
        options = @{ apiKey = 'temporary-qa-value'; baseURL = 'http://127.0.0.1:1' }
        models = @{
          'gpt-5.6-sol' = @{ name = 'QA GPT' }
          'claude-sonnet-4-6' = @{ name = 'QA Claude' }
          'gemini-3.1-pro' = @{ name = 'QA Gemini' }
        }
      }
    }
  } | ConvertTo-Json -Depth 12
  Set-Content -LiteralPath (Join-Path $sandbox "opencode.json") -Value $openCodeConfig -Encoding utf8

  $ocmmConfig = @{
    agents = @{
      'canonical-agent' = @{
        models = @(
          'qa/gpt-5.6-sol:high',
          @{ model = 'qa/claude-sonnet-4-6'; reasoning = 'low'; temperature = 0.2; top_p = 0.8; max_tokens = 4096 }
        )
        requirement = @{
          requiresAnyModel = $true
          requiresProvider = @('qa')
          fallbackChain = @(@{ providers = @('discarded'); model = 'discarded' })
        }
      }
    }
    categories = @{
      'canonical-category' = @{
        models = @('qa/gemini-3.1-pro', 'qa/gpt-5.6-sol')
      }
    }
    debug = $true
  } | ConvertTo-Json -Depth 12
  Set-Content -LiteralPath (Join-Path $sandbox ".opencode\ocmm.jsonc") -Value $ocmmConfig -Encoding utf8

  Push-Location -LiteralPath $sandbox
  $locationPushed = $true
  opencode debug paths 2>&1 | Tee-Object -FilePath (Join-Path $evidence "opencode-debug-paths.txt")
  if ($LASTEXITCODE -ne 0) { throw "opencode debug paths failed" }
  opencode debug config --print-logs --log-level DEBUG 2>&1 | Tee-Object -FilePath (Join-Path $evidence "opencode-debug-config.txt")
  if ($LASTEXITCODE -ne 0) { throw "opencode debug config failed" }
  opencode debug agent canonical-agent --print-logs --log-level DEBUG 2>&1 | Tee-Object -FilePath (Join-Path $evidence "canonical-agent.txt")
  if ($LASTEXITCODE -ne 0) { throw "canonical-agent debug resolution failed" }
  opencode debug agent canonical-category --print-logs --log-level DEBUG 2>&1 | Tee-Object -FilePath (Join-Path $evidence "canonical-category.txt")
  if ($LASTEXITCODE -ne 0) { throw "canonical-category debug resolution failed" }
  Pop-Location
  $locationPushed = $false

  $pathsText = Get-Content -LiteralPath (Join-Path $evidence "opencode-debug-paths.txt") -Raw
  $agentText = Get-Content -LiteralPath (Join-Path $evidence "canonical-agent.txt") -Raw
  $categoryText = Get-Content -LiteralPath (Join-Path $evidence "canonical-category.txt") -Raw
  if ($pathsText -notmatch [regex]::Escape($sandbox)) { throw "OpenCode XDG paths escaped the sandbox" }
  if ($agentText -notmatch 'qa/gpt-5\.6-sol' -or $agentText -match 'gpt-5\.6-sol:high') { throw "canonical agent primary mismatch" }
  if ($categoryText -notmatch 'qa/gemini-3\.1-pro') { throw "canonical category primary mismatch" }

  @'
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"

const repo = process.env.OCMM_QA_REPO
const sandbox = process.env.OCMM_QA_SANDBOX
if (!repo || !sandbox) throw new Error("QA paths missing")
const load = await import(pathToFileURL(path.join(repo, "dist/config/load.js")).href)
const hooks = await import(pathToFileURL(path.join(repo, "dist/hooks/config.js")).href)
const routes = await import(pathToFileURL(path.join(repo, "dist/routing/route-registry.js")).href)
const prompts = await import(pathToFileURL(path.join(repo, "dist/intent/prompt-loader.js")).href)
const config = load.loadOpenCodePluginConfig({ cwd: sandbox, includeUser: false }).config
prompts.loadAllPrompts(path.join(repo, "prompts"), config.workflow)
const registry = routes.createEffectiveRouteRegistry()
const target = { agent: {}, provider: { qa: { models: { "gpt-5.6-sol": {}, "claude-sonnet-4-6": {}, "gemini-3.1-pro": {} } } } }
await hooks.createConfigHandler({ getConfig: () => config, routeRegistry: registry, getFastMode: () => false })(target, undefined)
assert.equal(target.agent["canonical-agent"].model, "qa/gpt-5.6-sol")
assert.equal(target.agent["canonical-category"].model, "qa/gemini-3.1-pro")
const agentRoute = registry.snapshot().routes.get("canonical-agent")
const categoryRoute = registry.snapshot().routes.get("canonical-category")
assert.ok(agentRoute)
assert.ok(categoryRoute)
assert.deepEqual(agentRoute.requirement.fallbackChain, [
  { providers: ["qa"], model: "gpt-5.6-sol", reasoning: "high" },
  { providers: ["qa"], model: "claude-sonnet-4-6", reasoning: "low", temperature: 0.2, topP: 0.8, maxTokens: 4096 },
])
assert.equal(agentRoute.requirement.requiresAnyModel, true)
assert.deepEqual(agentRoute.requirement.requiresProvider, ["qa"])
assert.deepEqual(categoryRoute.requirement.fallbackChain, [
  { providers: ["qa"], model: "gemini-3.1-pro" },
  { providers: ["qa"], model: "gpt-5.6-sol" },
])
console.log("isolated canonical models primary and fallback metadata verified")
'@ | node --input-type=module | Tee-Object -FilePath (Join-Path $evidence "built-module-route-probe.txt")
  if ($LASTEXITCODE -ne 0) { throw "built-module route probe failed" }
  $qaPassed = $true
}
finally {
  if ($locationPushed) { Pop-Location }
  $env:XDG_CONFIG_HOME = $null
  $env:XDG_DATA_HOME = $null
  $env:XDG_STATE_HOME = $null
  $env:XDG_CACHE_HOME = $null
  $env:OCMM_DEBUG = $null
  $env:OCMM_QA_SANDBOX = $null
  $env:OCMM_QA_REPO = $null
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
if (-not $qaPassed) { throw "isolated OpenCode canonical models QA failed" }
if (Test-Path -LiteralPath $testRoot) { throw "isolated OpenCode temporary state remains" }
Write-Output "isolated OpenCode canonical models QA passed and temporary state was removed"
```

Expected: all debug commands exit `0`; debug surfaces show `qa/gpt-5.6-sol` and `qa/gemini-3.1-pro`; the built-module probe prints `isolated canonical models primary and fallback metadata verified`; no model request occurs; final output confirms cleanup and the test root no longer exists.

- [ ] **Step 6: Inspect whitespace, staged state, and exact changed-file scope**

```powershell
git diff --check
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw "staged changes are forbidden for implementation workers" }
$allowed = @(
  "README.md",
  "docs/superpowers/specs/2026-07-31-canonical-models-array-design.md",
  "docs/superpowers/plans/2026-07-31-canonical-models-array.md",
  "schema.json",
  "src/config/schema.ts",
  "src/config/schema.test.ts",
  "src/config/normalize.ts",
  "src/config/normalize.test.ts",
  "src/config/load.test.ts",
  "src/config/profiles.test.ts",
  "src/config/profile-aliases.test.ts",
  "src/logical-tiers/materialize.ts",
  "src/logical-tiers/materialize.test.ts",
  "src/hooks/config.ts",
  "src/hooks/config.test.ts",
  "src/routing/effective-route.test.ts",
  "src/hooks/chat-params.test.ts",
  "src/runtime-fallback/dispatcher.test.ts"
)
$changed = @((git diff --name-only); (git ls-files --others --exclude-standard)) | Sort-Object -Unique
$unexpected = @($changed | Where-Object { $_ -notin $allowed })
if ($unexpected.Count -gt 0) { throw "unexpected changed paths: $($unexpected -join ', ')" }
git status --short
git diff --name-only
```

Expected: `git diff --check` exits `0`; cached diff is empty; changed and untracked paths are a subset of the allowlist; no prompt, skill, release, version, package, default-chain, provider-option/catalog, shared runtime type, route/chat/fallback production, or generated Codex bundle file appears.

- [ ] **Step 7: Parent-only suggested commit and review handoff**

The implementation worker returns the complete current diff and all Task 5 receipts to the parent. The parent owns final implementation acceptance and any configured Reviewer/Oracle dispatch. Any implementation edit after a review receipt requires rerunning the affected focused command and the complete Task 5 wave.

Suggested final parent commit message: `feat: add canonical models array configuration`. This plan never authorizes an implementation worker to stage or commit.

## Acceptance-criteria coverage map

| Design criterion | Plan evidence |
| --- | --- |
| 1. Non-empty canonical strings/objects on agents/categories and generated schema | Task 1 schema matrix, generation, and structural probes. |
| 2. Unknown fields including `provider_options` never reach runtime | Task 1 stripping assertion and generated-property absence; Task 2 explicit field mapper. |
| 3. Tolerant generic pruning and strict direct validation | Task 1 invalid direct matrix; Task 3 project/lower-layer/legacy-sibling tests. |
| 4. Mapping to `FallbackEntry`, suffix safety, and explicit reasoning precedence | Task 2 mapper and expected normalized chains; existing suffix regressions. |
| 5. Exact source precedence with no chain merge | Task 2 all-sources fixture and direct alias call-count assertion. |
| 6. Requirement chain replacement, cloned guards/defaults, shorthand overrides, entry-local controls | Task 2 requirement fixtures and mutation check; Task 3 alias/logical-tier clone checks. |
| 7. Ordinary/profile replacement, aliases, normal invariants, catalog suppression | Task 3 merge/load/profile/alias/schema/logical-tier/config suites. |
| 8. Existing route/chat/fallback consumers preserve and lower the normalized contract | Task 4 config publication, effective route, cross-family `chat.params`, and dispatcher tests. |
| 9. User-facing documentation is complete and surgical | Task 4 exact README example, table, precedence paragraph, and profile note. |
| 10. Schema, tests, typecheck, build, diagnostics, isolated QA, cleanup, scope | Task 5 exact commands and expected receipts. |
| 11. Prohibited scope, installation, and Git writes remain absent | Global constraints, unchanged production list, Task 5 allowlist/cached check, four non-Git task checkpoints, and the single parent-only boundary after verification. |

## Inline self-review receipt

- Spec coverage passed: all eleven acceptance criteria map to a task and an executable evidence channel.
- Placeholder scan passed: every behavior-changing step includes exact paths, symbols, test code, implementation code, commands, and expected outcomes.
- Type consistency passed: configuration uses `CanonicalModelEntryConfig`; runtime continues to use `FallbackEntry` and `ModelRequirement`; snake-case fields are mapped once to current camel-case runtime names.
- Precedence consistency passed: canonical source selection, requirement defaults, entry-local fields, aliases, merge layers, catalog suppression, and runtime consumers use one ordering throughout.
- Task sizing passed: five serial tasks each end in an independently testable schema, normalization, configuration-semantics, consumer/documentation, or repository-verification outcome.
- QA executability passed: commands use PowerShell, clear ambient routing variables, include excluded tests in diagnostics fallback, make no real model request, and clean temporary state in `finally`.
- Scope and Git safety passed: only Markdown was written during planning; Tasks 1-4 have non-Git completion checkpoints; exactly one parent-only commit boundary and one suggested message remain after Task 5 verification and QA.
- Ambiguity review passed: no unresolved design or implementation choice remains.
- Receipt status: `waiting for receipt`; this planner did not dispatch `plan-critic` because formal review dispatch belongs to the orchestrator.
