# Canonical Reasoning Model References Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add canonical reasoning configuration and safe `provider/model:level` parsing while preserving legacy routing and lowering the selected intent exactly once against the actual runtime model in `chat.params`.

**Architecture:** Introduce a pure shared canonical-reasoning module, normalize all accepted configuration forms into `Reasoning`, and carry that value independently from legacy `Variant` through requirements, resolver results, effective-route snapshots, and runtime fallback metadata. Keep provider-specific effects in `src/hooks/chat-params.ts`: the resolver selects canonical or legacy intent, `src/routing/variant-translator.ts` lowers canonical semantics by actual family, concrete knobs and fast options apply in their existing order, and protected review floors remain final authority.

**Tech Stack:** TypeScript 6, Node.js 22+ built-in test runner, Zod 4, pnpm, generated JSON Schema, immutable effective-route snapshots, OpenCode plugin hooks, Windows PowerShell, Cargo/Rust for repository-wide gates.

**Global Constraints:**
- Canonical `reasoning` accepts exactly `off|minimal|low|medium|high|xhigh|max|auto`; deprecated input `none` normalizes to `off` before routing.
- Existing `Variant` remains unchanged, including `none`, `auto`, and `thinking`; legacy `variant: "none"` remains a no-op, while canonical `reasoning: "off"` actively disables reasoning where supported.
- Recognize only canonical model suffixes; preserve unknown suffixes and ambiguous bare `:max` as part of the model ID. Parse provider-prefixed `:max` and object-entry `:max` only when provider context is present.
- An explicit entry-level `reasoning` field wins over the suffix on the same primary or fallback object. A suffix only supplies a missing entry-level canonical value.
- Resolution precedence is runtime `message.variant` → entry canonical reasoning → requirement canonical reasoning → entry legacy variant → requirement legacy variant.
- Canonical `auto` adds no provider parameter unless a protected review floor raises it. Canonical `off` uses the family-specific disable behavior from the approved specification; protected Claude Opus 4.7+ retains its existing no-reasoning-override policy.
- Provider-specific lowering occurs only in `src/hooks/chat-params.ts` and always uses the actual `input.model.providerID` and `input.model.modelID` for that call.
- Preserve concrete override order: translated canonical reasoning or legacy variant → `reasoningEffort` → `thinking`, `temperature`, `topP`, and `maxTokens` → fast options → protected review floor.
- Runtime fallback preserves canonical metadata in the immutable route snapshot, emits no unsupported `reasoning` prompt-body field, and relies on the next `chat.params` invocation to lower against the new family.
- Preserve tolerant parsing, aliases, logical tiers, successor matching, fast-route behavior, route snapshot fencing, and legacy `variant`/`reasoningEffort` passthrough.
- Any `OcmmConfigSchema` change requires `pnpm run gen-schema`; `schema.json` is generated and must not be hand-edited.
- Run every shell command with Windows PowerShell syntax. Clear `OCMM_PROFILE`, `OCMM_NO_PROFILE`, and `OCMM_FAST` before schema generation, tests, typecheck, or build.
- Do not install software, terminate user processes, or touch user OpenCode configuration. Isolated OpenCode QA must use separate XDG directories under the approved OS temporary directory. Prefer `lsp_diagnostics`; if `typescript-language-server` is unavailable, use the installed TypeScript Compiler API fallback defined in the final verification wave.
- Do not add `models[]`, provider chains, prompt changes, Senpi behavior, task validation, daemon behavior, release-flow changes, or unrelated refactors.
- Do not modify `prompts/omo/`, `prompts/v1/`, `skills/v1/`, `docs/v1-maintenance.md`, generated Codex bundles, or the approved specification.
- The user has not authorized Git writes. Never execute `git add`, `git commit`, `git push`, `git tag`, or another Git write command; each task records only a suggested semantic commit message.

---

## File responsibility map

| File | Action | Responsibility |
| --- | --- | --- |
| `src/shared/reasoning.ts` | Create | Canonical vocabulary, deprecated-alias normalization, suffix splitting, and canonical/legacy bridge helpers. |
| `src/shared/reasoning.test.ts` | Create | Pure vocabulary, alias, suffix ambiguity, provider-context, and bridge contracts. |
| `src/shared/types.ts` | Modify | `ReasoningLevel`, `Reasoning`, route-entry/requirement canonical fields, resolver ledger evidence. |
| `src/config/schema.ts` | Modify | Accept canonical reasoning plus input alias at agent/category shorthand, requirement, and fallback-entry boundaries. |
| `src/config/schema.test.ts` | Modify | Boundary matrix and tolerant malformed-value sibling preservation. |
| `schema.json` | Regenerate | Generated editor schema synchronized from Zod. |
| `src/config/normalize.ts` | Modify | Recursively normalize aliases and suffixes without casting configuration objects into runtime types. |
| `src/config/normalize.test.ts` | Modify | Primary/fallback/object/requirement suffixes, explicit precedence, ambiguity, unknown suffixes, aliases, and legacy preservation. |
| `src/logical-tiers/materialize.ts` | Modify | Preserve a parsed canonical suffix when a logical-tier override replaces the primary model. |
| `src/logical-tiers/materialize.test.ts` | Modify | Model-only tier override canonical suffix and unchanged legacy tier behavior. |
| `src/routing/resolver.ts` | Modify | Canonical-vs-legacy selection and runtime request-local precedence. |
| `src/routing/resolver.test.ts` | Modify | Entry/requirement/runtime precedence, fallback-to-head, alias, and successor coverage. |
| `src/routing/variant-translator.ts` | Modify | Pure canonical normalization and family effects for `off`, `auto`, and the existing ladder. |
| `src/routing/variant-translator.test.ts` | Modify | Canonical family matrix, explicit/non-user normalization, unsupported GPT max, and legacy regressions. |
| `src/routing/effective-route.ts` | Modify | Preserve requirement canonical reasoning when synthesizing an unmatched selected primary. |
| `src/routing/effective-route.test.ts` | Modify | Synthesized/fast primary canonical metadata. |
| `src/routing/route-registry.test.ts` | Modify | Snapshot cloning and immutability for canonical fields. |
| `src/hooks/chat-params.ts` | Modify | Final-model canonical lowering, canonical ledger evidence, concrete override order, fast options, and review floors. |
| `src/hooks/chat-params.test.ts` | Modify | `off`/`auto`, runtime override, actual-family fallback calls, minimums/caps, concrete options, fast options, ledger, and review authority. |
| `src/runtime-fallback/event-handler-support.ts` | Modify | Apply requirement canonical defaults before legacy defaults while preserving selected-entry metadata. |
| `src/runtime-fallback/event-handler-support.test.ts` | Create | Canonical/legacy defaulting and retry-target pinning contracts. |
| `src/runtime-fallback/dispatcher.ts` | Modify | Omit unsupported canonical fields and suppress lower-priority legacy variant emission when canonical metadata owns the retry. |
| `src/runtime-fallback/dispatcher.test.ts` | Modify | Canonical omission plus unchanged legacy variant and concrete `reasoningEffort` passthrough. |
| `src/runtime-fallback/event-handler-fallback-dispatch.test.ts` | Modify | Published cross-family canonical fallback dispatch and route-snapshot preservation. |

## Execution order

1. Task 1 defines the canonical runtime vocabulary and pure parsing helpers.
2. Task 2 accepts the vocabulary at every declared Zod boundary and regenerates `schema.json`.
3. Task 3 converts all parsed forms into one runtime representation and carries suffixes through logical-tier model replacement.
4. Task 4 selects canonical reasoning independently from legacy variants with the specified precedence.
5. Task 5 defines family-specific canonical effects without changing legacy translation.
6. Task 6 proves effective-route synthesis and snapshot publication preserve canonical metadata.
7. Task 7 performs the only provider lowering in `chat.params` and records effective canonical evidence.
8. Task 8 preserves canonical fallback metadata without placing unsupported canonical fields in OpenCode prompt bodies.
9. The final verification wave runs generated-schema, targeted/full tests, diagnostics, build, isolated OpenCode QA, cleanup, scope checks, and final Reviewer plus Oracle acceptance.

### Task 1: Establish the canonical reasoning vocabulary and pure model-suffix parser

**Files:**
- Create: `src/shared/reasoning.ts`
- Create: `src/shared/reasoning.test.ts`
- Modify: `src/shared/types.ts:10-34,40-71,112-126`

**Interfaces:**
- Consumes: Existing `Variant`, `FallbackEntry`, `ModelRequirement`, and `ResolutionEntry` types from `src/shared/types.ts`.
- Produces: `ReasoningLevel`, `Reasoning`, `REASONING_VALUES`, `REASONING_INPUT_VALUES`, `ReasoningInput`, `normalizeReasoning(value)`, `splitReasoningSuffix(modelRef, options)`, `reasoningToVariant(reasoning)`, and `variantToReasoningLevel(variant)`.

- [ ] **Step 1: Write the failing pure-contract tests**

Create `src/shared/reasoning.test.ts` with this coverage:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  REASONING_INPUT_VALUES,
  REASONING_VALUES,
  normalizeReasoning,
  reasoningToVariant,
  splitReasoningSuffix,
  variantToReasoningLevel,
} from "./reasoning.ts"

test("canonical reasoning normalizes only the deprecated none input alias", () => {
  assert.deepEqual(REASONING_VALUES, ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto"])
  assert.deepEqual(REASONING_INPUT_VALUES, [...REASONING_VALUES, "none"])
  assert.equal(normalizeReasoning("none"), "off")
  for (const value of REASONING_VALUES) assert.equal(normalizeReasoning(value), value)
  assert.equal(normalizeReasoning(undefined), undefined)
})

test("known suffixes split without corrupting unknown or ambiguous model ids", () => {
  assert.deepEqual(splitReasoningSuffix("openai/gpt-5.6-sol:high"), {
    model: "openai/gpt-5.6-sol",
    reasoning: "high",
  })
  assert.deepEqual(splitReasoningSuffix("gpt-5.6-sol:high"), {
    model: "gpt-5.6-sol",
    reasoning: "high",
  })
  assert.deepEqual(splitReasoningSuffix("gpt-5.6-sol:max"), { model: "gpt-5.6-sol:max" })
  assert.deepEqual(splitReasoningSuffix("openai/gpt-5.6-sol:max"), {
    model: "openai/gpt-5.6-sol",
    reasoning: "max",
  })
  assert.deepEqual(splitReasoningSuffix("gpt-5.6-sol:max", { providerContext: true }), {
    model: "gpt-5.6-sol",
    reasoning: "max",
  })
  assert.deepEqual(splitReasoningSuffix("provider/model:custom"), { model: "provider/model:custom" })
  assert.deepEqual(splitReasoningSuffix("openai/gpt-5.6-sol:none"), { model: "openai/gpt-5.6-sol:none" })
})

test("canonical ladder bridges to legacy translation without conflating off or auto", () => {
  for (const value of ["minimal", "low", "medium", "high", "xhigh", "max"] as const) {
    assert.equal(reasoningToVariant(value), value)
    assert.equal(variantToReasoningLevel(value), value)
  }
  assert.equal(reasoningToVariant("off"), undefined)
  assert.equal(reasoningToVariant("auto"), undefined)
  for (const variant of ["none", "auto", "thinking"] as const) {
    assert.equal(variantToReasoningLevel(variant), undefined)
  }
})
```

- [ ] **Step 2: Run the new suite and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/shared/reasoning.test.ts
```

Expected: non-zero exit because `src/shared/reasoning.ts` does not exist.

- [ ] **Step 3: Add runtime types and implement the pure helper module**

Add to `src/shared/types.ts` immediately after `ThinkingMode`:

```ts
export type ReasoningLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
export type Reasoning = ReasoningLevel | "auto"
```

Add `reasoning?: Reasoning` to both `FallbackEntry` and `ModelRequirement`. Add `reasoning?: Reasoning` to `ResolutionEntry.applied`; do not change `Variant` or `KNOWN_VARIANTS`.

Create `src/shared/reasoning.ts`:

```ts
import type { Reasoning, ReasoningLevel, Variant } from "./types.ts"

export const REASONING_VALUES = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "auto",
] as const satisfies readonly Reasoning[]

export const REASONING_INPUT_VALUES = [...REASONING_VALUES, "none"] as const
export type ReasoningInput = (typeof REASONING_INPUT_VALUES)[number]

const REASONING_SET = new Set<Reasoning>(REASONING_VALUES)
const VARIANT_REASONING_LEVEL_SET = new Set<ReasoningLevel>([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
])

export function normalizeReasoning(value: ReasoningInput | undefined): Reasoning | undefined {
  return value === "none" ? "off" : value
}

export function splitReasoningSuffix(
  modelRef: string,
  options?: { providerContext?: boolean },
): { model: string; reasoning?: Reasoning } {
  const separator = modelRef.lastIndexOf(":")
  if (separator <= 0 || separator === modelRef.length - 1) return { model: modelRef }

  const suffix = modelRef.slice(separator + 1)
  if (!REASONING_SET.has(suffix as Reasoning)) return { model: modelRef }

  const model = modelRef.slice(0, separator)
  const providerContext = options?.providerContext === true || model.includes("/")
  if (suffix === "max" && !providerContext) return { model: modelRef }
  return { model, reasoning: suffix as Reasoning }
}

export function reasoningToVariant(reasoning: Reasoning): Variant | undefined {
  return reasoning === "off" || reasoning === "auto" ? undefined : reasoning
}

export function variantToReasoningLevel(variant: Variant): ReasoningLevel | undefined {
  return VARIANT_REASONING_LEVEL_SET.has(variant as ReasoningLevel)
    ? variant as ReasoningLevel
    : undefined
}
```

`variantToReasoningLevel` deliberately returns only the shared `minimal` through `max` ladder; `Variant` cannot contain canonical `off`.

- [ ] **Step 4: Run the pure suite and verify GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/shared/reasoning.test.ts
```

Expected: exit `0`; all three tests pass and the summary reports `fail 0`.

- [ ] **Step 5: Record the review boundary without a Git write**

Suggested commit message only: `feat: add canonical reasoning primitives`. Do not stage or commit.

### Task 2: Accept canonical reasoning at every configuration boundary and regenerate the editor schema

**Files:**
- Modify: `src/config/schema.ts:1-59`
- Modify: `src/config/schema.test.ts:1-16,266-352`
- Regenerate: `schema.json`

**Interfaces:**
- Consumes: `REASONING_INPUT_VALUES` and `ReasoningInput` from Task 1.
- Produces: `ReasoningInputEnum`; parsed `reasoning?: ReasoningInput` on agent/category shorthand, `ModelRequirementSchema`, and `FallbackEntrySchema`; generated JSON Schema enums at all four boundaries.

- [ ] **Step 1: Add failing schema-boundary and tolerant-parse tests**

Extend the schema-test imports with `CategoryEntrySchema`, `FallbackEntrySchema`, and `ModelRequirementSchema`, then add:

```ts
test("canonical reasoning is accepted at every declared configuration boundary", () => {
  const values = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto", "none"] as const
  for (const reasoning of values) {
    assert.equal(AgentEntrySchema.parse({ model: "openai/gpt-5.6-sol", reasoning }).reasoning, reasoning)
    assert.equal(CategoryEntrySchema.parse({ model: "openai/gpt-5.6-sol", reasoning }).reasoning, reasoning)
    assert.equal(ModelRequirementSchema.parse({
      fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol" }],
      reasoning,
    }).reasoning, reasoning)
    assert.equal(FallbackEntrySchema.parse({
      providers: ["openai"],
      model: "gpt-5.6-sol",
      reasoning,
    }).reasoning, reasoning)
  }
})

test("invalid canonical reasoning is pruned while valid siblings survive tolerant parsing", () => {
  const result = tolerantParse(AgentEntrySchema, {
    model: "openai/gpt-5.6-sol",
    reasoning: "extreme",
    variant: "high",
  })
  assert.equal(result.success, true)
  assert.deepEqual(result.success && result.data, {
    model: "openai/gpt-5.6-sol",
    variant: "high",
  })
})
```

- [ ] **Step 2: Run the focused schema suite and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts
```

Expected: non-zero exit because Zod currently strips `reasoning` at all four boundaries.

- [ ] **Step 3: Add the canonical input enum without changing the legacy variant enum**

Import and define the new enum near `VariantEnum`:

```ts
import { REASONING_INPUT_VALUES } from "../shared/reasoning.ts"

export const ReasoningInputEnum = z.enum(REASONING_INPUT_VALUES)
```

Add `reasoning: ReasoningInputEnum.optional()` to:

```ts
export const FallbackEntrySchema = z.object({
  providers: z.array(z.string().min(1)).min(1),
  model: z.string().min(1),
  reasoning: ReasoningInputEnum.optional(),
  variant: VariantEnum.optional(),
  // retain every existing concrete field unchanged
})

export const ModelRequirementSchema = z.object({
  fallbackChain: z.array(FallbackEntrySchema).min(1),
  reasoning: ReasoningInputEnum.optional(),
  variant: VariantEnum.optional(),
  // retain every existing guard unchanged
})

const ShorthandFields = {
  description: z.string().optional(),
  alias: z.string().optional(),
  reasoning: ReasoningInputEnum.optional(),
  variant: VariantEnum.optional(),
  model: z.string().optional(),
  fallbackModels: z.array(ModelStringOrEntrySchema).optional(),
  requirement: ModelRequirementSchema.optional(),
}
```

Do not add canonical reasoning to `LogicalTierVariantOverrideSchema`, `AgentOverrideFields`, or the legacy `VariantEnum`.

- [ ] **Step 4: Run the focused schema suite and verify GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts
```

Expected: exit `0`; every canonical value and the deprecated input alias are retained at all four boundaries, malformed reasoning is pruned, and all pre-existing schema tests report `fail 0`.

- [ ] **Step 5: Regenerate and structurally inspect `schema.json`**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run gen-schema
node --input-type=module -e "import {readFileSync} from 'node:fs'; const s=JSON.parse(readFileSync('schema.json','utf8')); const expected=['off','minimal','low','medium','high','xhigh','max','auto','none']; const agent=s.properties.agents.additionalProperties; const category=s.properties.categories.additionalProperties; const nodes={agent:agent.properties.reasoning,category:category.properties.reasoning,requirement:agent.properties.requirement.properties.reasoning,fallback:agent.properties.requirement.properties.fallbackChain.items.properties.reasoning}; for(const [name,node] of Object.entries(nodes)){if(JSON.stringify(node?.enum)!==JSON.stringify(expected)) throw new Error(name+' reasoning enum mismatch')} console.log('canonical reasoning present at agent, category, requirement, and fallback boundaries')"
```

Expected: generation prints `wrote ...\schema.json`; inspection prints `canonical reasoning present at agent, category, requirement, and fallback boundaries` and exits `0`.

- [ ] **Step 6: Record the review boundary without a Git write**

Suggested commit message only: `feat: accept canonical reasoning configuration`. Do not stage or commit.

### Task 3: Normalize aliases and model suffixes into canonical runtime requirements

**Files:**
- Modify: `src/config/normalize.ts:1-61`
- Modify: `src/config/normalize.test.ts:1-117`
- Modify: `src/logical-tiers/materialize.ts:76-87`
- Modify: `src/logical-tiers/materialize.test.ts:37-85`

**Interfaces:**
- Consumes: `normalizeReasoning`, `splitReasoningSuffix`, `ReasoningInput`, `Reasoning`, and the Zod-inferred configuration types from Tasks 1-2.
- Produces: `parseModelString(modelStr, variant?, reasoning?)`; recursively normalized `FallbackEntry` and `ModelRequirement` objects containing no `reasoning: "none"`; suffix-aware logical-tier primary replacement.

- [ ] **Step 1: Add failing normalization tests for every suffix and precedence rule**

Extend the normalize-test import to include `parseModelString`, then add:

Replace the identity assertions in the existing `normalizeDirectRequirement gives requirement precedence over shorthand models` test because recursive normalization must return an independent runtime object:

```ts
const direct = normalizeDirectRequirement(entry)
assert.deepEqual(direct, requirement)
assert.notEqual(direct, requirement)
assert.notEqual(direct!.fallbackChain, requirement.fallbackChain)
assert.notEqual(direct!.fallbackChain[0], requirement.fallbackChain[0])

const shorthand = normalizeShorthand(entry)?.requirement
assert.deepEqual(shorthand, requirement)
assert.notEqual(shorthand, requirement)
```

Then add the new canonical cases:

```ts
test("normalization handles canonical fields, aliases, suffixes, and max ambiguity", () => {
  const result = normalizeDirectRequirement({
    model: "openai/gpt-5.6-sol:high",
    reasoning: "none",
    variant: "auto",
    fallbackModels: [
      "anthropic/claude-sonnet-4-6:max",
      "gpt-5.6-sol:max",
      "provider/model:custom",
      { providers: ["google"], model: "gemini-3.1-pro:max" },
      { providers: ["zhipu"], model: "glm-5.2:max", reasoning: "low" },
    ],
  })!

  assert.deepEqual(result, {
    reasoning: "off",
    variant: "auto",
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol", reasoning: "off", variant: "auto" },
      { providers: ["anthropic"], model: "claude-sonnet-4-6", reasoning: "max" },
      { providers: [], model: "gpt-5.6-sol:max" },
      { providers: ["provider"], model: "model:custom" },
      { providers: ["google"], model: "gemini-3.1-pro", reasoning: "max" },
      { providers: ["zhipu"], model: "glm-5.2", reasoning: "low" },
    ],
  })
})

test("requirement objects normalize recursively instead of leaking input aliases", () => {
  const source = {
    requirement: {
      reasoning: "none" as const,
      variant: "high" as const,
      fallbackChain: [
        { providers: ["openai"], model: "gpt-5.6-sol:max" },
        { providers: ["anthropic"], model: "claude-sonnet-4-6:low", reasoning: "none" as const },
      ],
    },
  }
  assert.deepEqual(normalizeDirectRequirement(source), {
    reasoning: "off",
    variant: "high",
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol", reasoning: "max" },
      { providers: ["anthropic"], model: "claude-sonnet-4-6", reasoning: "off" },
    ],
  })
})

test("multi-hop aliases preserve normalized canonical reasoning", () => {
  const result = normalizeAgentShorthand("outer", {
    outer: { alias: "middle" },
    middle: { alias: "target" },
    target: { model: "openai/gpt-5.6-sol:high", reasoning: "none" },
  })
  assert.equal(result?.requirement?.reasoning, "off")
  assert.deepEqual(result?.requirement?.fallbackChain[0], {
    providers: ["openai"],
    model: "gpt-5.6-sol",
    reasoning: "off",
  })
})
```

Add to `src/logical-tiers/materialize.test.ts`:

```ts
test("model-only logical tier overrides retain a parsed canonical suffix", () => {
  const profile = materializeLogicalTierProfiles({
    baseName: "planner",
    base: base(),
    variants: { high: { model: "openai/gpt-5.6-sol:high" } },
    isDisabled: () => false,
  }).find(({ name }) => name === "planner-high")!

  assert.equal(profile.requirement.fallbackChain[0]!.model, "gpt-5.6-sol")
  assert.equal(profile.requirement.fallbackChain[0]!.reasoning, "high")
  assert.equal(profile.requirement.fallbackChain[0]!.variant, "xhigh")
})
```

- [ ] **Step 2: Run both focused suites and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/normalize.test.ts src/logical-tiers/materialize.test.ts
```

Expected: non-zero exit because normalization still casts requirement objects, does not strip recognized suffixes, leaks `none`, and logical-tier replacement drops parsed canonical metadata.

- [ ] **Step 3: Replace casts with explicit recursive normalization**

Update the imports and signatures in `src/config/normalize.ts`:

```ts
import { normalizeReasoning, splitReasoningSuffix, type ReasoningInput } from "../shared/reasoning.ts"
import type { FallbackEntry, ModelRequirement, Reasoning, Variant } from "../shared/types.ts"

export function parseModelString(
  modelStr: string,
  variant?: Variant,
  reasoningInput?: ReasoningInput,
): FallbackEntry {
  const parsed = splitReasoningSuffix(modelStr)
  const slash = parsed.model.indexOf("/")
  const provider = slash >= 0 ? parsed.model.slice(0, slash) : ""
  const model = slash >= 0 ? parsed.model.slice(slash + 1) : parsed.model
  const reasoning = normalizeReasoning(reasoningInput) ?? parsed.reasoning
  return {
    providers: provider ? [provider] : [],
    model,
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(variant !== undefined ? { variant } : {}),
  }
}
```

Replace both cast-based normalizers with explicit copies:

```ts
function normalizeFallbackEntryConfig(raw: string | FallbackEntryConfig): FallbackEntry {
  if (typeof raw === "string") return parseModelString(raw)
  const { reasoning: reasoningInput, providers, model, thinking, ...rest } = raw
  const parsed = splitReasoningSuffix(model, { providerContext: providers.length > 0 })
  const reasoning: Reasoning | undefined = normalizeReasoning(reasoningInput) ?? parsed.reasoning
  return {
    ...rest,
    providers: [...providers],
    model: parsed.model,
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(thinking !== undefined ? { thinking: { ...thinking } } : {}),
  }
}

function normalizeRequirementConfig(req: ModelRequirementConfig): ModelRequirement {
  const { fallbackChain, reasoning: reasoningInput, requiresProvider, ...rest } = req
  const reasoning = normalizeReasoning(reasoningInput)
  return {
    ...rest,
    fallbackChain: fallbackChain.map(normalizeFallbackEntryConfig),
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(requiresProvider !== undefined ? { requiresProvider: [...requiresProvider] } : {}),
  }
}
```

Replace `normalizeDirectRequirement()` with the complete normalized construction:

```ts
export function normalizeDirectRequirement(
  entry: AgentEntry | CategoryEntry | undefined,
): ModelRequirement | undefined {
  if (!entry) return undefined
  if (entry.requirement) return normalizeRequirementConfig(entry.requirement)

  const chain: FallbackEntry[] = []
  const reasoning = normalizeReasoning(entry.reasoning)
  if (entry.model) chain.push(parseModelString(entry.model, entry.variant, entry.reasoning))
  if (entry.fallbackModels) {
    for (const model of entry.fallbackModels) chain.push(normalizeFallbackEntryConfig(model))
  }
  if (chain.length === 0) return undefined

  return {
    fallbackChain: chain,
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(entry.variant !== undefined ? { variant: entry.variant } : {}),
  }
}
```

Do not copy shorthand reasoning onto fallback entries; it remains a requirement default. The primary receives it because it is the explicit field on that same primary declaration.

- [ ] **Step 4: Carry parsed suffix metadata through logical-tier primary replacement**

Change the primary replacement in `src/logical-tiers/materialize.ts` to:

```ts
cloned.fallbackChain[0] = {
  ...primary,
  providers: [...parsed.providers],
  model: parsed.model,
  ...(parsed.reasoning !== undefined ? { reasoning: parsed.reasoning } : {}),
}
```

Keep `withNativeVariant()` unchanged: logical tiers remain a legacy-variant surface, and a model suffix is an entry-level canonical override rather than a replacement for tier variants.

- [ ] **Step 5: Run both focused suites and verify GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/shared/reasoning.test.ts src/config/normalize.test.ts src/logical-tiers/materialize.test.ts
```

Expected: exit `0`; explicit canonical values beat suffixes, aliases normalize to `off`, provider-context `:max` parses, bare `:max` and unknown suffixes remain model IDs, logical tiers retain suffix metadata, and all legacy tests report `fail 0`.

- [ ] **Step 6: Record the review boundary without a Git write**

Suggested commit message only: `feat: normalize canonical model references`. Do not stage or commit.

### Task 4: Resolve canonical reasoning with request-local and legacy precedence

**Files:**
- Modify: `src/routing/resolver.ts:10-44,86-192`
- Modify: `src/routing/resolver.test.ts:145-199,229-266,368-435`

**Interfaces:**
- Consumes: Normalized `FallbackEntry.reasoning?: Reasoning` and `ModelRequirement.reasoning?: Reasoning` from Task 3; existing `inputVariant` validation.
- Produces: `Resolution = { entry, reasoning?, variant?, source }`, with exactly one selected intent track and runtime variant suppressing canonical reasoning.

- [ ] **Step 1: Add failing resolver precedence tests**

Add these focused tests:

```ts
test("canonical reasoning outranks legacy variants by entry and requirement specificity", () => {
  const requirement = {
    reasoning: "medium" as const,
    variant: "max" as const,
    fallbackChain: [
      { providers: ["openai"], model: "entry-canonical", reasoning: "low" as const, variant: "xhigh" as const },
      { providers: ["openai"], model: "requirement-canonical", variant: "low" as const },
    ],
  }
  const entry = resolveModelRouting({
    agentName: "builder",
    providerID: "openai",
    modelID: "entry-canonical",
    effectiveRequirement: { requirement, source: "user-config" },
  })!
  assert.equal(entry.reasoning, "low")
  assert.equal(entry.variant, undefined)

  const requirementDefault = resolveModelRouting({
    agentName: "builder",
    providerID: "openai",
    modelID: "requirement-canonical",
    effectiveRequirement: { requirement, source: "user-config" },
  })!
  assert.equal(requirementDefault.reasoning, "medium")
  assert.equal(requirementDefault.variant, undefined)
})

test("valid runtime variants suppress canonical reasoning for that request", () => {
  const result = resolveModelRouting({
    agentName: "builder",
    providerID: "openai",
    modelID: "gpt-5.4-mini",
    inputVariant: "low",
    effectiveRequirement: {
      source: "user-config",
      requirement: {
        reasoning: "off",
        fallbackChain: [{ providers: ["openai"], model: "gpt-5.4-mini", reasoning: "high" }],
      },
    },
  })!
  assert.equal(result.reasoning, undefined)
  assert.equal(result.variant, "low")
})

test("canonical defaults apply to fallback-to-head and synthesized successors", () => {
  const requirement = {
    reasoning: "high" as const,
    fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol", reasoning: "max" as const }],
  }
  const foreign = resolveModelRouting({
    agentName: "builder",
    providerID: "other",
    modelID: "foreign",
    effectiveRequirement: { requirement, source: "user-config" },
  })!
  assert.equal(foreign.entry.model, "gpt-5.6-sol")
  assert.equal(foreign.reasoning, "max")

  const successor = resolveModelRouting({
    agentName: "builder",
    providerID: "openai",
    modelID: "gpt-5.7-sol",
    effectiveRequirement: { requirement, source: "user-config" },
  })!
  assert.equal(successor.entry.model, "gpt-5.7-sol")
  assert.equal(successor.entry.reasoning, "max")
  assert.equal(successor.reasoning, "max")
})
```

Extend the existing multi-hop alias test with a canonical suffix or explicit `reasoning: "off"` and assert `result?.reasoning === "off"` while retaining the existing model/source assertions.

- [ ] **Step 2: Run the resolver suite and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/resolver.test.ts
```

Expected: non-zero exit because `Resolution` has no canonical field and current chain selection considers only legacy variants.

- [ ] **Step 3: Implement one-track canonical-or-legacy selection**

Import `Reasoning` and extend `Resolution`:

```ts
export type Resolution = {
  entry: FallbackEntry
  reasoning?: Reasoning
  variant?: Variant
  source: "user-config" | "agent-default" | "category-default" | "input-variant"
}
```

Add a helper and use it in exact, successor, prefix, and fallback-to-head branches:

```ts
type EffectiveIntent = { reasoning?: Reasoning; variant?: Variant }

function effectiveIntent(entry: FallbackEntry, requirement: ModelRequirement): EffectiveIntent {
  const reasoning = entry.reasoning ?? requirement.reasoning
  if (reasoning !== undefined) return { reasoning }
  const variant = entry.variant ?? requirement.variant
  return variant === undefined ? {} : { variant }
}
```

Replace `pickFromChain()` with an intent-carrying result:

```ts
function pickFromChain(
  req: ModelRequirement,
  providerID: string | undefined,
  modelID: string,
): { entry: FallbackEntry; intent: EffectiveIntent } | null {
  for (const entry of req.fallbackChain) {
    if (entryExactlyMatchesModel(entry, providerID, modelID)) {
      return { entry, intent: effectiveIntent(entry, req) }
    }
  }
  const successor = matchRequirementSuccessor(req, providerID, modelID)
  if (successor) return { entry: successor, intent: effectiveIntent(successor, req) }
  for (const entry of req.fallbackChain) {
    if (entryMatchesModel(entry, providerID, modelID)) {
      return { entry, intent: effectiveIntent(entry, req) }
    }
  }
  return null
}
```

Replace `buildResolution()` with:

```ts
function buildResolution(
  entry: FallbackEntry,
  intent: EffectiveIntent,
  inputVariant: string | undefined,
  source: Resolution["source"],
): Resolution {
  if (inputVariant && isValidVariant(inputVariant)) {
    return { entry, variant: inputVariant, source }
  }
  return {
    entry,
    source,
    ...(intent.reasoning !== undefined ? { reasoning: intent.reasoning } : {}),
    ...(intent.reasoning === undefined && intent.variant !== undefined ? { variant: intent.variant } : {}),
  }
}
```

Use `buildResolution(matched.entry, matched.intent, inputVariant, source)` for a matched entry and `buildResolution(fallback, effectiveIntent(fallback, req), inputVariant, source)` for fallback-to-head. Preserve the existing non-user max policy for protected categories by replacing its final return with:

```ts
return resolution.reasoning !== undefined
  ? { ...resolution, reasoning: "max", variant: undefined }
  : { ...resolution, variant: "max" }
```

Preserve the existing input-only resolution branch and every source-selection rule.

- [ ] **Step 4: Run resolver and model-upgrade suites and verify GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/resolver.test.ts src/routing/resolver.category.test.ts src/routing/model-upgrades.test.ts
```

Expected: exit `0`; canonical and legacy precedence is exact, runtime variants suppress canonical intent, successors retain metadata, and legacy category/alias/model-upgrade behavior reports `fail 0`.

- [ ] **Step 5: Record the review boundary without a Git write**

Suggested commit message only: `feat: resolve canonical reasoning precedence`. Do not stage or commit.

### Task 5: Translate canonical reasoning by actual model family without changing legacy variants

**Files:**
- Modify: `src/routing/variant-translator.ts:17-26,198-243`
- Modify: `src/routing/variant-translator.test.ts:1-85`

**Interfaces:**
- Consumes: `Reasoning`, `reasoningToVariant`, `variantToReasoningLevel`, existing `normalizeVariantForModel()`, `translateVariant()`, and `ModelFamily`.
- Produces: `normalizeReasoningForModel({ family, modelID, reasoning }): Reasoning` and `translateReasoning(family, reasoning, options?): VariantEffect`.

- [ ] **Step 1: Add failing canonical family-matrix tests**

Extend the translator-test import and add:

```ts
test("canonical off actively disables supported family controls", () => {
  assert.deepEqual(translateReasoning("gpt", "off", { modelID: "gpt-5.6-sol", respectExplicit: true }), { reasoningEffort: "none" })
  assert.deepEqual(translateReasoning("codex", "off", { modelID: "gpt-5.6-codex", respectExplicit: true }), { reasoningEffort: "none" })
  assert.deepEqual(translateReasoning("deepseek", "off"), { reasoningEffort: "none" })
  assert.deepEqual(translateReasoning("claude", "off"), { thinking: { type: "disabled" } })
  assert.deepEqual(translateReasoning("claude-opus-47-plus", "off"), {})
  assert.deepEqual(translateReasoning("gemini", "off"), {
    reasoningEffort: "none",
    thinking: { type: "disabled" },
  })
  assert.deepEqual(translateReasoning("glm", "off"), {
    reasoningEffort: "none",
    thinking: { type: "disabled" },
  })
  assert.deepEqual(translateReasoning("unknown", "off"), {})
})

test("canonical auto never injects a provider parameter", () => {
  for (const family of ["gpt", "codex", "claude", "claude-opus-47-plus", "gemini", "glm", "deepseek", "unknown"] as const) {
    assert.deepEqual(translateReasoning(family, "auto", { modelID: "model" }), {}, family)
  }
})

test("canonical ladder keeps model minimums, explicit bypass, and GPT max caps", () => {
  assert.equal(normalizeReasoningForModel({ family: "gpt", modelID: "gpt-5.5", reasoning: "low" }), "high")
  assert.equal(normalizeReasoningForModel({ family: "gpt", modelID: "gpt-5.5", reasoning: "max" }), "xhigh")
  assert.equal(normalizeReasoningForModel({ family: "gpt", modelID: "gpt-5.5", reasoning: "off" }), "high")
  assert.equal(normalizeReasoningForModel({ family: "gpt", modelID: "gpt-5.5", reasoning: "auto" }), "auto")
  assert.deepEqual(translateReasoning("gpt", "low", {
    modelID: "gpt-5.5",
    respectExplicit: true,
  }), { reasoningEffort: "low" })
  assert.deepEqual(translateReasoning("gpt", "max", {
    modelID: "gpt-5.5",
    respectExplicit: true,
  }), { reasoningEffort: "xhigh" })
  assert.deepEqual(translateReasoning("gpt", "max", {
    modelID: "gpt-5.6-sol",
    respectExplicit: true,
  }), { reasoningEffort: "max" })
})
```

- [ ] **Step 2: Run the translator suite and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/variant-translator.test.ts
```

Expected: non-zero exit because canonical translator exports do not exist.

- [ ] **Step 3: Add canonical normalization and family lowering beside the legacy translator**

Add imports from `src/shared/reasoning.ts` and `Reasoning` from shared types. Implement:

```ts
export function normalizeReasoningForModel(opts: {
  family: ModelFamily
  modelID: string
  reasoning: Reasoning
}): Reasoning {
  if (opts.reasoning === "auto") return opts.reasoning
  const variant = opts.reasoning === "off" ? "none" : reasoningToVariant(opts.reasoning)
  if (variant === undefined) return opts.reasoning
  const normalized = normalizeVariantForModel({
    family: opts.family,
    modelID: opts.modelID,
    variant,
  })
  if (opts.reasoning === "off" && normalized === "none") return "off"
  return variantToReasoningLevel(normalized) ?? opts.reasoning
}

export function translateReasoning(
  family: ModelFamily,
  reasoning: Reasoning,
  opts?: { modelID?: string; respectExplicit?: boolean },
): VariantEffect {
  const effectiveReasoning = opts?.modelID && !opts.respectExplicit
    ? normalizeReasoningForModel({ family, modelID: opts.modelID, reasoning })
    : reasoning

  if (effectiveReasoning === "auto") return NEUTRAL
  if (effectiveReasoning === "off") {
    switch (family) {
      case "gpt":
      case "codex":
      case "deepseek":
        return { reasoningEffort: "none" }
      case "claude":
        return { thinking: { type: "disabled" } }
      case "claude-opus-47-plus":
        return NEUTRAL
      case "gemini":
      case "glm":
        return { reasoningEffort: "none", thinking: { type: "disabled" } }
      default:
        return NEUTRAL
    }
  }

  const variant = reasoningToVariant(effectiveReasoning)
  return variant === undefined
    ? NEUTRAL
    : translateVariant(family, variant, { ...opts, respectExplicit: true })
}
```

Do not alter any existing `translateVariant()` branch. In particular, legacy `none` stays neutral and legacy `auto` keeps its current family-specific behavior.

- [ ] **Step 4: Run translator and model-family suites and verify GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/variant-translator.test.ts src/intent/model-family.test.ts
```

Expected: exit `0`; canonical `off`, canonical `auto`, normal levels, explicit bypass, and max caps pass while every legacy translator assertion still reports `fail 0`.

- [ ] **Step 5: Record the review boundary without a Git write**

Suggested commit message only: `feat: translate canonical reasoning by family`. Do not stage or commit.

### Task 6: Preserve canonical reasoning in effective routes and immutable snapshots

**Files:**
- Modify: `src/routing/effective-route.ts:116-125`
- Modify: `src/routing/effective-route.test.ts:155-225,280-336`
- Modify: `src/routing/route-registry.test.ts:7-20,132-179`

**Interfaces:**
- Consumes: Expanded `ModelRequirement` and `FallbackEntry` types from Task 1.
- Produces: Synthesized selected primaries containing requirement-level canonical defaults; published snapshots that retain independent entry/requirement canonical values and cannot be changed through the input route.

- [ ] **Step 1: Add failing effective-route and snapshot regression tests**

Change the unmatched-primary test to use both tracks:

```ts
const requirement: ModelRequirement = {
  ...metadataRequirement(),
  reasoning: "high",
  variant: "max",
}
const materialized = materializeSelectedPrimary(requirement, "openai/gpt-6")
assert.deepEqual(materialized.fallbackChain[0], {
  providers: ["openai"],
  model: "gpt-6",
  reasoning: "high",
  variant: "max",
})
```

Add `reasoning: "off"` to the original primary in the existing fast-route copy test and retain the full deep equality assertion so the generated fast entry and original fallback both keep `off`.

In `src/routing/route-registry.test.ts`, add `reasoning: "high"` on the requirement and `reasoning: "off"` on its entry in the `route()` fixture. In the immutability test, mutate the input route after publication:

```ts
inputRoute.requirement.reasoning = "auto"
inputRoute.requirement.fallbackChain[0]!.reasoning = "max"
assert.equal(publishedRoute.requirement.reasoning, "high")
assert.equal(entry.reasoning, "off")
```

Retain every existing freeze and deep-clone assertion.

- [ ] **Step 2: Run both route suites and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/effective-route.test.ts src/routing/route-registry.test.ts
```

Expected: non-zero exit because an unmatched synthesized primary currently copies only the requirement legacy variant. The snapshot assertions may already pass through spread-copying and remain required compatibility evidence.

- [ ] **Step 3: Preserve the canonical default when synthesizing a selected primary**

Change only the unmatched-primary branch in `materializeSelectedPrimary()`:

```ts
primary = {
  providers: [selected.providerID],
  model: selected.modelID,
  ...(requirement.reasoning !== undefined ? { reasoning: requirement.reasoning } : {}),
  ...(requirement.variant !== undefined ? { variant: requirement.variant } : {}),
}
```

No production change is needed in `cloneEntry`, `cloneRequirement`, `route-registry.ts`, `model-upgrades.ts`, or fast-route copying because their existing object spreads carry primitive canonical fields. The tests lock that evidence and protect against future narrowing.

- [ ] **Step 4: Run route, registry, and model-upgrade suites and verify GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/effective-route.test.ts src/routing/route-registry.test.ts src/routing/model-upgrades.test.ts
```

Expected: exit `0`; synthesized, exact, successor, boundary-prefix, fast, and published snapshot paths retain canonical metadata and all summaries report `fail 0`.

- [ ] **Step 5: Record the review boundary without a Git write**

Suggested commit message only: `feat: preserve canonical route metadata`. Do not stage or commit.

### Task 7: Lower canonical reasoning once in chat.params and record canonical ledger evidence

**Files:**
- Modify: `src/hooks/chat-params.ts:9-26,54-67,370-473`
- Modify: `src/hooks/chat-params.test.ts:1-229,503-733,933-1111`

**Interfaces:**
- Consumes: `Resolution.reasoning`, `normalizeReasoningForModel()`, `translateReasoning()`, existing family classification, concrete knobs, fast-option merge, and review-floor helpers.
- Produces: Family-correct final provider options for the actual runtime model; `ResolutionEntry.applied.reasoning` after normalization/capping/flooring; unchanged legacy-only ledger and output behavior.

- [ ] **Step 1: Add failing tests for distinct canonical and legacy semantics**

Add a focused matrix using GPT mini so legacy minimum normalization does not obscure semantics:

```ts
test("chat.params distinguishes canonical off and auto from legacy none and auto", async () => {
  const cases = [
    { name: "canonical off", entry: { reasoning: "off" }, expected: { reasoningEffort: "none" }, ledger: { reasoning: "off" } },
    { name: "canonical auto", entry: { reasoning: "auto" }, expected: {}, ledger: { reasoning: "auto" } },
    { name: "legacy none", entry: { variant: "none" }, expected: {}, ledger: { variant: "none" } },
    { name: "legacy auto", entry: { variant: "auto" }, expected: { reasoningEffort: "medium" }, ledger: { variant: "auto" } },
  ] as const

  for (const testCase of cases) {
    clearResolutions()
    const cfg = OcmmConfigSchema.parse({
      agents: {
        builder: {
          requirement: {
            fallbackChain: [{ providers: ["openai"], model: "gpt-5.4-mini", ...testCase.entry }],
          },
        },
      },
    })
    const output = { options: {} as Record<string, unknown> }
    await createChatParamsHandler({ getConfig: () => cfg })(
      makeInput({ agentName: "builder", modelID: "gpt-5.4-mini" }),
      output,
    )
    assert.deepEqual(output.options, testCase.expected, testCase.name)
    assert.deepEqual(recentResolutions().at(-1)!.applied, {
      ...testCase.ledger,
      ...testCase.expected,
    }, testCase.name)
  }
})
```

Add a request-local override assertion:

```ts
test("chat.params request-local variant suppresses canonical reasoning", async () => {
  clearResolutions()
  const cfg = OcmmConfigSchema.parse({
    agents: { builder: { model: "openai/gpt-5.4-mini", reasoning: "off" } },
  })
  const output = { options: {} as Record<string, unknown> }
  await createChatParamsHandler({ getConfig: () => cfg })(
    makeInput({ agentName: "builder", modelID: "gpt-5.4-mini", variant: "low" }),
    output,
  )
  assert.equal(output.options.reasoningEffort, "low")
  assert.equal(recentResolutions().at(-1)!.applied.reasoning, undefined)
  assert.equal(recentResolutions().at(-1)!.applied.variant, "low")
})
```

- [ ] **Step 2: Add failing actual-family, override-order, and review-floor tests**

Add a published route and call the same handler separately for its GPT primary and cross-family fallbacks:

```ts
test("chat.params re-lowers one canonical route for each actual fallback family", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.6-sol",
    requirement: {
      reasoning: "high",
      fallbackChain: [
        { providers: ["openai"], model: "gpt-5.6-sol" },
        { providers: ["anthropic"], model: "claude-sonnet-4-6" },
        { providers: ["google"], model: "gemini-3.1-pro" },
      ],
    },
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastPath: { kind: "off" },
  }]]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })
  const cases = [
    { providerID: "openai", modelID: "gpt-5.6-sol", expected: { reasoningEffort: "high" } },
    { providerID: "anthropic", modelID: "claude-sonnet-4-6", expected: { thinking: { type: "enabled", budgetTokens: 12_288 } } },
    { providerID: "google", modelID: "gemini-3.1-pro", expected: { reasoningEffort: "high", thinking: { type: "enabled" } } },
  ] as const
  for (const testCase of cases) {
    const output = { options: {} as Record<string, unknown> }
    await handler(makeInput({
      agentName: "builder",
      providerID: testCase.providerID,
      modelID: testCase.modelID,
    }), output)
    assert.deepEqual(output.options, testCase.expected, testCase.modelID)
    const applied = recentResolutions().at(-1)!.applied
    assert.equal(applied.reasoning, "high", testCase.modelID)
    assert.equal(applied.variant, undefined, testCase.modelID)
  }
})
```

Add these two order assertions:

```ts
test("canonical lowering yields to explicit concrete controls", async () => {
  clearResolutions()
  const cfg = OcmmConfigSchema.parse({
    agents: {
      builder: {
        requirement: {
          fallbackChain: [{
            providers: ["openai"],
            model: "gpt-5.6-sol",
            reasoning: "high",
            reasoningEffort: "low",
            thinking: { type: "disabled" },
            temperature: 0.2,
            topP: 0.8,
            maxTokens: 4096,
          }],
        },
      },
    },
  })
  const output = { options: {} as Record<string, unknown> }
  await createChatParamsHandler({ getConfig: () => cfg })(
    makeInput({ agentName: "builder", modelID: "gpt-5.6-sol" }),
    output,
  )
  assert.deepEqual(output, {
    options: { reasoningEffort: "low", thinking: { type: "disabled" } },
    temperature: 0.2,
    topP: 0.8,
    maxOutputTokens: 4096,
  })
  assert.equal(recentResolutions().at(-1)!.applied.reasoning, "high")
})

test("canonical review floors remain authoritative after concrete and fast overrides", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["reviewer", {
    model: "openai/gpt-5.5",
    requirement: {
      fallbackChain: [{ providers: ["openai"], model: "gpt-5.5", reasoning: "off", reasoningEffort: "low" }],
    },
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastPath: {
      kind: "options",
      defaultRules: false,
      rules: [{ match: { model: "gpt-5.5" }, options: { reasoningEffort: "minimal" } }],
    },
  }]]))
  const output = { options: {} as Record<string, unknown> }
  await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
    makeInput({ agentName: "reviewer", modelID: "gpt-5.5" }),
    output,
  )
  assert.equal(output.options.reasoningEffort, "xhigh")
  assert.equal(recentResolutions().at(-1)!.applied.reasoning, "xhigh")
  assert.equal(recentResolutions().at(-1)!.applied.variant, undefined)
})
```

Add the exact minimum/cap matrix:

```ts
test("chat.params records canonical minimum normalization and GPT max caps", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  const route = (
    modelID: string,
    reasoning: "low" | "max",
    requirementSource: "agent-default" | "user-config",
  ): EffectiveModelRoute => ({
    model: `openai/${modelID}`,
    requirement: {
      fallbackChain: [{ providers: ["openai"], model: modelID, reasoning }],
    },
    requirementSource,
    primarySource: requirementSource === "user-config" ? "user-requirement" : "builtin-requirement",
    fastPath: { kind: "off" },
  })
  publishRoutes(registry, new Map([
    ["builtin-low", route("gpt-5.5", "low", "agent-default")],
    ["user-low", route("gpt-5.5", "low", "user-config")],
    ["max-old", route("gpt-5.5", "max", "user-config")],
    ["max-native", route("gpt-5.6-sol", "max", "user-config")],
  ]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })
  for (const [agentName, modelID, expected] of [
    ["builtin-low", "gpt-5.5", "high"],
    ["user-low", "gpt-5.5", "low"],
    ["max-old", "gpt-5.5", "xhigh"],
    ["max-native", "gpt-5.6-sol", "max"],
  ] as const) {
    const output = { options: {} as Record<string, unknown> }
    await handler(makeInput({ agentName, modelID }), output)
    assert.equal(output.options.reasoningEffort, expected, agentName)
    assert.equal(recentResolutions().at(-1)!.applied.reasoning, expected, agentName)
    assert.equal(recentResolutions().at(-1)!.applied.variant, undefined, agentName)
  }
})
```

- [ ] **Step 3: Run the chat.params suite and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/hooks/chat-params.test.ts
```

Expected: non-zero exit because `chat.params` ignores `Resolution.reasoning`, canonical `off`/`auto` do not lower, and the ledger has no effective canonical field.

- [ ] **Step 4: Add canonical normalization, capping, and review-floor helpers**

Import `normalizeReasoningForModel`, `translateReasoning`, `reasoningToVariant`, `Reasoning`, and `ReasoningLevel`. Add:

```ts
function floorReviewReasoning(reasoning: Reasoning): ReasoningLevel {
  return reasoning === "max" || reasoning === "xhigh" ? reasoning : "xhigh"
}

function capUnsupportedNativeMaxReasoning(
  family: string,
  modelID: string,
  reasoning: Reasoning | undefined,
): Reasoning | undefined {
  return (family === "gpt" || family === "codex")
    && reasoning === "max"
    && !supportsNativeGptMaxReasoning(modelID)
    ? "xhigh"
    : reasoning
}
```

Do not merge canonical types into `Variant`; keep separate local variables and separate ledger fields.

- [ ] **Step 5: Replace the single legacy-only translation block with dual-track final-model lowering**

Use this order after family classification:

```ts
const explicitIntent = resolution.source === "user-config" || !!input.message.variant
let appliedReasoning: Reasoning | undefined = resolution.reasoning
let appliedVariant: Variant | undefined = resolution.variant

if (appliedReasoning !== undefined && !explicitIntent) {
  appliedReasoning = normalizeReasoningForModel({
    family,
    modelID: input.model.modelID,
    reasoning: appliedReasoning,
  })
}
if (appliedVariant !== undefined && !explicitIntent) {
  appliedVariant = normalizeVariantForModel({
    family,
    modelID: input.model.modelID,
    variant: appliedVariant,
  })
}

if (requiresReviewVariantFloor(agentName, family)) {
  if (appliedReasoning !== undefined) appliedReasoning = floorReviewReasoning(appliedReasoning)
  else appliedVariant = floorReviewVariant(appliedVariant)
}
appliedReasoning = capUnsupportedNativeMaxReasoning(family, input.model.modelID, appliedReasoning)
appliedVariant = capUnsupportedNativeMaxVariant(family, input.model.modelID, appliedVariant)

const effect = appliedReasoning !== undefined
  ? translateReasoning(family, appliedReasoning, {
      modelID: input.model.modelID,
      respectExplicit: true,
    })
  : appliedVariant !== undefined
    ? translateVariant(family, appliedVariant, {
        modelID: input.model.modelID,
        respectExplicit: explicitIntent,
      })
    : {}
```

Apply `effect.reasoningEffort`, `effect.thinking`, and `effect.temperature` exactly as the existing block does. Keep all concrete entry controls, `applyFastOptionRoute()`, and `applyReviewOutputFloor()` in their current positions. Pass this internal floor basis to the final floor:

```ts
const reviewFloorVariant = appliedReasoning !== undefined
  ? reasoningToVariant(appliedReasoning)
  : appliedVariant
applyReviewOutputFloor({
  agentName,
  family,
  modelID: input.model.modelID,
  appliedVariant: reviewFloorVariant,
  outputOptions: output.options,
})
```

For protected canonical `off` or `auto`, `floorReviewReasoning()` has already converted the value to `xhigh`, so `reviewFloorVariant` is defined. For ordinary `off`/`auto`, `applyReviewOutputFloor()` is a no-op because the identity is not protected.

- [ ] **Step 6: Record canonical evidence without polluting legacy-only ledger entries**

In the resolved-route ledger object, use:

```ts
applied: {
  ...(appliedReasoning !== undefined ? { reasoning: appliedReasoning } : {}),
  ...(appliedVariant !== undefined ? { variant: appliedVariant } : {}),
  // retain the existing final concrete option extraction unchanged
}
```

Keep the host-profile-floor no-resolution branch legacy-only. Update the debug line to print both selected tracks without changing the source:

```ts
`reasoning=${appliedReasoning ?? "<none>"} variant=${appliedVariant ?? "<none>"} source=${resolution.source}`
```

- [ ] **Step 7: Run focused routing and hook suites and verify GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/shared/reasoning.test.ts src/routing/resolver.test.ts src/routing/variant-translator.test.ts src/routing/effective-route.test.ts src/routing/route-registry.test.ts src/hooks/chat-params.test.ts
```

Expected: exit `0`; all canonical matrices pass, GPT/Claude/Gemini calls receive only family-correct effects, concrete knobs and fast options precede final floors, canonical ledger entries contain `reasoning` without `variant`, and every existing legacy hook test reports `fail 0`.

- [ ] **Step 8: Record the review boundary without a Git write**

Suggested commit message only: `feat: lower canonical reasoning in chat params`. Do not stage or commit.

### Task 8: Preserve canonical runtime fallback metadata without unsupported prompt fields

**Files:**
- Modify: `src/runtime-fallback/event-handler-support.ts:67-90`
- Create: `src/runtime-fallback/event-handler-support.test.ts`
- Modify: `src/runtime-fallback/dispatcher.ts:106-115`
- Modify: `src/runtime-fallback/dispatcher.test.ts:306-330`
- Modify: `src/runtime-fallback/event-handler-fallback-dispatch.test.ts:23-42,120-132`

**Interfaces:**
- Consumes: `FallbackEntry.reasoning`, `ModelRequirement.reasoning`, immutable route snapshots, `dispatchFallbackRetry()`, and the next OpenCode `chat.params` lifecycle call.
- Produces: `applyRequirementDefaults()` that supplies canonical then legacy defaults; retry targets retaining canonical metadata; prompt bodies that never contain `reasoning` and do not emit a lower-priority legacy `variant` when canonical reasoning owns the selected entry.

- [ ] **Step 1: Write failing unit tests for canonical fallback defaults and retry target pinning**

Create `src/runtime-fallback/event-handler-support.test.ts`:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"

import { applyRequirementDefaults, resolveRetryTarget } from "./event-handler-support.ts"

test("requirement defaults add canonical reasoning before the legacy variant default", () => {
  const requirement = {
    reasoning: "off" as const,
    variant: "high" as const,
    fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol" }],
  }
  assert.deepEqual(applyRequirementDefaults(requirement, requirement.fallbackChain[0]!), {
    providers: ["openai"],
    model: "gpt-5.6-sol",
    reasoning: "off",
    variant: "high",
  })
  assert.deepEqual(applyRequirementDefaults(requirement, {
    providers: ["openai"],
    model: "gpt-5.6-sol",
    reasoning: "max",
    variant: "low",
  }), {
    providers: ["openai"],
    model: "gpt-5.6-sol",
    reasoning: "max",
    variant: "low",
  })
})

test("retry targets retain canonical metadata while pinning the actual provider and model", () => {
  const target = resolveRetryTarget({
    reasoning: "high",
    fallbackChain: [{ providers: ["openai", "github-copilot"], model: "gpt-5.6-sol" }],
  }, {
    providerID: "github-copilot",
    modelID: "gpt-5.6-sol",
  })
  assert.deepEqual(target, {
    providerID: "github-copilot",
    modelID: "gpt-5.6-sol",
    entry: {
      providers: ["github-copilot"],
      model: "gpt-5.6-sol",
      reasoning: "high",
    },
  })
})
```

- [ ] **Step 2: Add failing dispatcher and published fallback assertions**

Retain the existing legacy passthrough test and add:

```ts
test("canonical retry metadata is not emitted as an unsupported prompt field", async () => {
  const { client, calls } = makeClient({
    messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
  })
  await dispatchFallbackRetry({
    client,
    sessionID: "ses_canonical",
    reason: "rate_limit",
    newEntry: {
      providers: ["anthropic"],
      model: "claude-sonnet-4-6",
      reasoning: "high",
      variant: "max",
      reasoningEffort: "low",
    },
  })
  assert.equal(calls[0]?.body.reasoning, undefined)
  assert.equal(calls[0]?.body.variant, undefined)
  assert.equal(calls[0]?.body.reasoningEffort, "low")
})
```

Add an event-handler integration test that publishes this route, reports the GPT primary as failed, and inspects the Claude dispatch body:

```ts
test("published canonical cross-family fallback dispatches only model identity and legacy concrete fields", async () => {
  const { client, calls } = makeMockClient()
  const registry = createEffectiveRouteRegistry()
  const generation = registry.beginBuild()
  registry.publish(generation, new Map([["builder", {
    model: "openai/gpt-5.6-sol",
    requirement: {
      reasoning: "high",
      fallbackChain: [
        { providers: ["openai"], model: "gpt-5.6-sol" },
        { providers: ["anthropic"], model: "claude-sonnet-4-6" },
      ],
    },
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastPath: { kind: "off" },
  }]]))
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => makeConfig(),
    client,
    routeRegistry: registry,
  })
  await handler(makeErrorEvent("ses_cross_family", { status: 503 }, {
    agent: "builder",
    model: { providerID: "openai", modelID: "gpt-5.6-sol" },
  }))
  assert.equal(calls[0]?.body.providerID, "anthropic")
  assert.equal(calls[0]?.body.modelID, "claude-sonnet-4-6")
  assert.equal(calls[0]?.body.reasoning, undefined)
  assert.equal(calls[0]?.body.variant, undefined)
})
```

- [ ] **Step 3: Run the fallback suites and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/event-handler-support.test.ts src/runtime-fallback/dispatcher.test.ts src/runtime-fallback/event-handler-fallback-dispatch.test.ts
```

Expected: non-zero exit because requirement canonical defaults are not applied and a lower-priority legacy variant is still emitted when canonical metadata is present.

- [ ] **Step 4: Apply canonical and legacy requirement defaults in order**

Replace `applyRequirementDefaults()` with:

```ts
export function applyRequirementDefaults(
  requirement: ModelRequirement | null | undefined,
  entry: FallbackEntry,
): FallbackEntry {
  let resolved = entry
  if (resolved.reasoning === undefined && requirement?.reasoning !== undefined) {
    resolved = { ...resolved, reasoning: requirement.reasoning }
  }
  if (resolved.variant === undefined && requirement?.variant !== undefined) {
    resolved = { ...resolved, variant: requirement.variant }
  }
  return resolved
}
```

Keep `resolveRetryTarget()` pinning behavior unchanged; its existing spread now carries the expanded metadata.

- [ ] **Step 5: Keep prompt bodies legacy-compatible without overriding canonical selection**

In `dispatchFallbackRetry()`, retain `providerID`, `modelID`, `parts`, optional `agent`, and concrete `reasoningEffort`. Change only legacy variant emission:

```ts
if (newEntry.variant && newEntry.reasoning === undefined) body.variant = newEntry.variant
if (newEntry.reasoningEffort) body.reasoningEffort = newEntry.reasoningEffort
```

Do not add `body.reasoning`. Canonical metadata remains in the route snapshot; OpenCode invokes `chat.params` again for the dispatched model, and Task 7 resolves that actual entry from the immutable route before family lowering.

- [ ] **Step 6: Run all relevant generic and dedicated fallback suites and verify GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/event-handler-support.test.ts src/runtime-fallback/dispatcher.test.ts src/runtime-fallback/event-handler-fallback-dispatch.test.ts src/runtime-fallback/event-handler-failed-model-resolution.test.ts src/runtime-fallback/event-handler-dedicated-429-switching.test.ts src/runtime-fallback/event-handler-dedicated-429-idle-suppression.test.ts src/runtime-fallback/fallback-state.test.ts
```

Expected: exit `0`; canonical metadata survives defaults and snapshot selection, canonical fields and lower-priority variants are absent from canonical retry bodies, legacy-only `variant` and concrete `reasoningEffort` still pass through, and generic/dedicated snapshot fencing reports `fail 0`.

- [ ] **Step 7: Record the review boundary without a Git write**

Suggested commit message only: `feat: preserve canonical fallback routing`. Do not stage or commit.

## Final verification wave

This is a verification wave rather than a product-change task. If any check fails, return to the owning task, add or retain a reproducing RED assertion, make the smallest in-scope correction, rerun that task's GREEN command, then restart this wave from the targeted tests. Do not patch forward in this section.

- [ ] **Run the complete targeted TypeScript contract set**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/shared/reasoning.test.ts src/config/schema.test.ts src/config/normalize.test.ts src/logical-tiers/materialize.test.ts src/routing/resolver.test.ts src/routing/resolver.category.test.ts src/routing/model-upgrades.test.ts src/routing/variant-translator.test.ts src/routing/effective-route.test.ts src/routing/route-registry.test.ts src/hooks/chat-params.test.ts src/runtime-fallback/event-handler-support.test.ts src/runtime-fallback/dispatcher.test.ts src/runtime-fallback/event-handler-fallback-dispatch.test.ts src/runtime-fallback/event-handler-failed-model-resolution.test.ts src/runtime-fallback/event-handler-dedicated-429-switching.test.ts src/runtime-fallback/event-handler-dedicated-429-idle-suppression.test.ts src/runtime-fallback/fallback-state.test.ts
```

Expected: exit `0`; summary reports `fail 0`.

- [ ] **Prove generated schema idempotency and inspect every canonical boundary**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run gen-schema
$schemaHash = (Get-FileHash -LiteralPath "schema.json" -Algorithm SHA256).Hash
pnpm run gen-schema
$schemaHashAfter = (Get-FileHash -LiteralPath "schema.json" -Algorithm SHA256).Hash
if ($schemaHash -ne $schemaHashAfter) { throw "schema.json generation is not idempotent" }
node --input-type=module -e "import {readFileSync} from 'node:fs'; const s=JSON.parse(readFileSync('schema.json','utf8')); const expected=['off','minimal','low','medium','high','xhigh','max','auto','none']; const agent=s.properties.agents.additionalProperties; const category=s.properties.categories.additionalProperties; const nodes={agent:agent.properties.reasoning,category:category.properties.reasoning,requirement:agent.properties.requirement.properties.reasoning,fallback:agent.properties.requirement.properties.fallbackChain.items.properties.reasoning}; for(const [name,node] of Object.entries(nodes)){if(JSON.stringify(node?.enum)!==JSON.stringify(expected)) throw new Error(name+' reasoning enum mismatch')} console.log('schema reasoning boundaries verified')"
```

Expected: both generations succeed, hashes match, and inspection prints `schema reasoning boundaries verified`.

- [ ] **Run repository typecheck, full tests, and build**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run typecheck
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm test
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run build
```

Expected: all three commands exit `0`; TypeScript reports no errors, Node and Cargo test summaries have zero failures, and TypeScript plus release LSP artifacts are built under `dist/`. If a user process locks an artifact, do not terminate it; record the build gate as blocked rather than claiming acceptance.

- [ ] **Run per-file diagnostics on every changed TypeScript file**

First invoke `lsp_diagnostics` with `severity: "all"` for:

```text
src/shared/reasoning.ts
src/shared/reasoning.test.ts
src/shared/types.ts
src/config/schema.ts
src/config/schema.test.ts
src/config/normalize.ts
src/config/normalize.test.ts
src/logical-tiers/materialize.ts
src/logical-tiers/materialize.test.ts
src/routing/resolver.ts
src/routing/resolver.test.ts
src/routing/variant-translator.ts
src/routing/variant-translator.test.ts
src/routing/effective-route.ts
src/routing/effective-route.test.ts
src/routing/route-registry.test.ts
src/hooks/chat-params.ts
src/hooks/chat-params.test.ts
src/runtime-fallback/event-handler-support.ts
src/runtime-fallback/event-handler-support.test.ts
src/runtime-fallback/dispatcher.ts
src/runtime-fallback/dispatcher.test.ts
src/runtime-fallback/event-handler-fallback-dispatch.test.ts
```

Expected: every call returns no diagnostics. If the environment reports that `typescript-language-server` is unavailable, do not install it. Run this exact compiler-diagnostics fallback against the same complete file list:

```powershell
node --input-type=module -e "import path from 'node:path'; import ts from 'typescript'; const files=['src/shared/reasoning.ts','src/shared/reasoning.test.ts','src/shared/types.ts','src/config/schema.ts','src/config/schema.test.ts','src/config/normalize.ts','src/config/normalize.test.ts','src/logical-tiers/materialize.ts','src/logical-tiers/materialize.test.ts','src/routing/resolver.ts','src/routing/resolver.test.ts','src/routing/variant-translator.ts','src/routing/variant-translator.test.ts','src/routing/effective-route.ts','src/routing/effective-route.test.ts','src/routing/route-registry.test.ts','src/hooks/chat-params.ts','src/hooks/chat-params.test.ts','src/runtime-fallback/event-handler-support.ts','src/runtime-fallback/event-handler-support.test.ts','src/runtime-fallback/dispatcher.ts','src/runtime-fallback/dispatcher.test.ts','src/runtime-fallback/event-handler-fallback-dispatch.test.ts']; const configPath=ts.findConfigFile('.',ts.sys.fileExists,'tsconfig.json'); if(!configPath) throw new Error('tsconfig.json not found'); const loaded=ts.readConfigFile(configPath,ts.sys.readFile); if(loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText,'\n')); const parsed=ts.parseJsonConfigFileContent(loaded.config,ts.sys,path.dirname(configPath),undefined,configPath); const absoluteFiles=files.map((file)=>path.resolve(file)); const targets=new Set(absoluteFiles.map((file)=>file.toLowerCase())); const rootNames=[...new Set([...parsed.fileNames.map((file)=>path.resolve(file)),...absoluteFiles])]; const program=ts.createProgram({rootNames,options:parsed.options}); const missing=absoluteFiles.filter((file)=>program.getSourceFile(file)===undefined); if(missing.length) throw new Error('diagnostic targets missing from compiler program: '+missing.join(', ')); const diagnostics=ts.getPreEmitDiagnostics(program).filter((diagnostic)=>diagnostic.file===undefined||targets.has(path.resolve(diagnostic.file.fileName).toLowerCase())); if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:(file)=>file,getCurrentDirectory:()=>process.cwd(),getNewLine:()=>ts.sys.newLine})); process.exit(1)} console.log('changed-file compiler diagnostics: 0')"
```

Expected fallback: exit `0` and print `changed-file compiler diagnostics: 0`. The explicit root-name union brings the changed `*.test.ts` files into the compiler program despite the repository tsconfig exclusion, and the missing-target assertion proves all 23 requested files were loaded before diagnostics are filtered. This uses the already installed compiler, adds no dependency, includes global program diagnostics plus every changed source/test file, and complements rather than replaces the mandatory `pnpm run typecheck` gate.

- [ ] **Run isolated OpenCode real-surface QA and clean all temporary state**

Run from the repository root after `pnpm run build`. The sandbox contains no real credential and performs debug/config inspection only; it makes no model request.

```powershell
$pluginPath = (Resolve-Path -LiteralPath "dist\index.js").Path
$testRoot = Join-Path $env:LOCALAPPDATA ("Temp\opencode\ocmm-canonical-reasoning-" + $PID)
$sandbox = Join-Path $testRoot "sandbox"
$evidence = Join-Path $testRoot "evidence"
$qaPassed = $false
$locationPushed = $false
try {
  New-Item -ItemType Directory -Force -Path (Join-Path $sandbox ".opencode"), (Join-Path $sandbox "xdg-config"), (Join-Path $sandbox "xdg-data"), (Join-Path $sandbox "xdg-state"), (Join-Path $sandbox "xdg-cache"), $evidence | Out-Null
  $env:XDG_CONFIG_HOME = Join-Path $sandbox "xdg-config"
  $env:XDG_DATA_HOME = Join-Path $sandbox "xdg-data"
  $env:XDG_STATE_HOME = Join-Path $sandbox "xdg-state"
  $env:XDG_CACHE_HOME = Join-Path $sandbox "xdg-cache"
  $env:OCMM_DEBUG = "1"

  $openCodeConfig = @{
    '$schema' = 'https://opencode.ai/config.json'
    plugin = @($pluginPath)
    disabled_providers = @('opencode', 'openrouter', 'github-copilot', 'openai')
    provider = @{
      qa = @{
        npm = '@ai-sdk/openai-compatible'
        name = 'Canonical Reasoning QA'
        options = @{ apiKey = 'temporary-qa-value'; baseURL = 'http://127.0.0.1:1' }
        models = @{
          'gpt-5.6-sol' = @{ name = 'QA GPT' }
          'claude-sonnet-4-6' = @{ name = 'QA Claude' }
        }
      }
    }
  } | ConvertTo-Json -Depth 10
  Set-Content -LiteralPath (Join-Path $sandbox "opencode.json") -Value $openCodeConfig -Encoding utf8

  $ocmmConfig = @{
    agents = @{
      'canonical-explicit' = @{ model = 'qa/gpt-5.6-sol'; reasoning = 'off' }
      'canonical-suffix' = @{
        model = 'qa/gpt-5.6-sol:high'
        fallbackModels = @(@{ providers = @('qa'); model = 'claude-sonnet-4-6:max' })
      }
    }
    debug = $true
  } | ConvertTo-Json -Depth 10
  Set-Content -LiteralPath (Join-Path $sandbox ".opencode\ocmm.jsonc") -Value $ocmmConfig -Encoding utf8

  Push-Location -LiteralPath $sandbox
  $locationPushed = $true
  opencode debug paths 2>&1 | Tee-Object -FilePath (Join-Path $evidence "opencode-debug-paths.txt")
  if ($LASTEXITCODE -ne 0) { throw "opencode debug paths failed" }
  $pathsText = Get-Content -LiteralPath (Join-Path $evidence "opencode-debug-paths.txt") -Raw
  if ($pathsText -notmatch [regex]::Escape($sandbox)) { throw "OpenCode XDG paths escaped the sandbox" }

  opencode debug config --print-logs --log-level DEBUG 2>&1 | Tee-Object -FilePath (Join-Path $evidence "opencode-debug-config.txt")
  if ($LASTEXITCODE -ne 0) { throw "opencode debug config failed" }
  opencode debug agent canonical-explicit --print-logs --log-level DEBUG 2>&1 | Tee-Object -FilePath (Join-Path $evidence "canonical-explicit-agent.txt")
  if ($LASTEXITCODE -ne 0) { throw "canonical-explicit agent resolution failed" }
  opencode debug agent canonical-suffix --print-logs --log-level DEBUG 2>&1 | Tee-Object -FilePath (Join-Path $evidence "canonical-suffix-agent.txt")
  if ($LASTEXITCODE -ne 0) { throw "canonical-suffix agent resolution failed" }

  $explicitText = Get-Content -LiteralPath (Join-Path $evidence "canonical-explicit-agent.txt") -Raw
  $suffixText = Get-Content -LiteralPath (Join-Path $evidence "canonical-suffix-agent.txt") -Raw
  if ($explicitText -notmatch 'gpt-5\.6-sol') { throw "explicit canonical agent model missing" }
  if ($suffixText -notmatch 'gpt-5\.6-sol' -or $suffixText -match 'gpt-5\.6-sol:high') { throw "canonical suffix was not removed from the resolved model" }
  $qaPassed = $true
}
finally {
  if ($locationPushed) { Pop-Location }
  $env:XDG_CONFIG_HOME = $null
  $env:XDG_DATA_HOME = $null
  $env:XDG_STATE_HOME = $null
  $env:XDG_CACHE_HOME = $null
  $env:OCMM_DEBUG = $null
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
if (-not $qaPassed) { throw "isolated OpenCode canonical reasoning QA failed" }
if (Test-Path -LiteralPath $testRoot) { throw "isolated OpenCode temporary state remains" }
Write-Output "isolated OpenCode canonical reasoning QA passed and temporary state was removed"
```

Expected: plugin load logs identify ocmm, both custom agents resolve, `canonical-suffix` exposes `qa/gpt-5.6-sol` without `:high`, no network call occurs, the final line confirms pass, and `Test-Path -LiteralPath $testRoot` is `False` after cleanup.

- [ ] **Inspect the final scope and whitespace without writing Git state**

```powershell
git diff --check
git status --short
git diff --name-only
```

Expected: `git diff --check` exits `0`; status contains only the files in this plan, the approved uncommitted specification, and this plan. There are no changes under `prompts/`, `skills/`, `.github/`, release scripts, package manifests, Senpi/task/provider-chain surfaces, or generated Codex bundles. Do not stage any file.

- [ ] **Obtain final Reviewer and Oracle implementation acceptance**

After all commands and diagnostics above pass, freeze the current diff and evidence. The orchestrator, not an implementation worker, dispatches one read-only `reviewer` implementation self-review and one read-only `oracle` external cross-check against:

```text
Approved spec: docs/superpowers/specs/2026-07-30-canonical-reasoning-model-refs-design.md
Implementation plan: docs/superpowers/plans/2026-07-30-canonical-reasoning-model-refs.md
Review scope: the complete current diff plus targeted/full test, schema, typecheck, build, diagnostics, and isolated OpenCode QA receipts
Required checks: all nine acceptance criteria; canonical/legacy semantic separation; suffix ambiguity; precedence; one chat.params lowering point; cross-family fallback; concrete/fast/floor order; snapshot fencing; prohibited-scope absence; no Git or installation writes
Non-goals: reviewers must not edit files, execute Git writes, broaden scope, or substitute inferred success for command evidence
```

Expected: both reviewers explicitly accept the same current revision with no critical or high finding. Any code or test edit invalidates both receipts; return to the owning TDD task, rerun the full verification wave, and request fresh Reviewer plus Oracle acceptance.

- [ ] **Record final suggested commit message without executing it**

Suggested final commit message only: `feat: add canonical reasoning model references`. Git staging and commit remain prohibited until the user separately authorizes them.

## Acceptance-criteria coverage map

| Spec criterion | Plan evidence |
| --- | --- |
| 1. Every declared boundary accepts and normalizes one canonical representation | Tasks 1-3; generated-schema structural inspection; normalize tests. |
| 2. `none` → `off`; canonical `off`/`auto` differ from legacy `variant: none|auto` | Tasks 1, 3, 5, and 7; pure and hook semantic matrices. |
| 3. Unknown/ambiguous suffix preservation and safe provider-context `:max` | Tasks 1 and 3; pure suffix and end-to-end normalization matrices. |
| 4. Runtime, entry/requirement canonical, and legacy precedence | Task 4 plus Task 7 request-local hook assertion. |
| 5. Only `chat.params` lowers against the current model; fallback does not reuse stale family parameters | Tasks 5, 7, and 8; separate GPT/Claude/Gemini calls, prompt-body omission, and published cross-family dispatch. |
| 6. Concrete knobs, fast options, floors, snapshots, aliases, logical tiers remain compatible | Tasks 3, 4, 6, 7, and 8; full existing regression suites. |
| 7. Schema, tests, typecheck, build, diagnostics, and isolated OpenCode verification pass | Final verification wave with exact commands, expected results, and cleanup. |
| 8. Prohibited features and unrelated refactors stay out of the diff | Global constraints, file responsibility map, and final scope inspection. |
| 9. No Git writes, installation, or user-process termination | Every task's non-executing suggested message, global constraints, build-lock rule, and final status-only Git checks. |

## Inline self-review receipt

- Spec coverage: all goals, compatibility clauses, focused contracts, repository gates, real-surface requirements, and nine acceptance criteria map to explicit tasks or final evidence.
- Placeholder scan: every product step names exact files, symbols, code, commands, and expected outcomes; no incomplete implementation marker or cross-task shorthand remains.
- Type consistency: `ReasoningInput` exists only at the schema boundary; runtime structures use `Reasoning`; resolver, translator, hook, route, fallback, and ledger names are consistent end-to-end.
- Ordering consistency: canonical metadata is normalized before routing, selected independently from `Variant`, preserved in snapshots/fallback, and lowered only in `chat.params`; concrete knobs, fast options, and final review floors retain authority.
- Scope check: the file map excludes all specified non-goals and introduces only one focused shared module plus one focused fallback-support test.
- QA executability: all shell commands use PowerShell, all expected outputs are stated, the OpenCode sandbox is isolated and self-cleaning, and an unavailable TypeScript LSP uses the explicit installed-compiler diagnostics receipt without installing software or weakening the mandatory repository typecheck.
- Git safety: no staging or commit command appears; suggested semantic messages are inert text pending separate user permission.
- Plan status: saved complete current revision; plan-critic returned `[OKAY-UNAMBIGUOUS]`. User approval is also delegated for this session, so execution may begin without another approval pause.
