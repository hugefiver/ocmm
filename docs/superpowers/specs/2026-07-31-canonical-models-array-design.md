# Canonical `models[]` Agent/Category Configuration Design

## Status

Approved through the user's full-session autonomous design and implementation delegation. This specification is authoritative for the fourth independent feature: adapting canonical `models[]` agent/category configuration into ocmm's existing fallback contract. It remains uncommitted because this session may not perform Git writes.

## Context

ocmm currently accepts two direct shorthand routes for agents and categories:

- `requirement.fallbackChain`, the complete runtime-oriented contract;
- `model` plus legacy `fallbackModels`, a convenient shorthand normalized into that contract.

The upstream OMO configuration now exposes canonical `models[]` entries as strings or model-reference objects. ocmm already has a mature `ModelRequirement`/`FallbackEntry` wire contract, immutable effective routes, cross-family runtime fallback, final-model reasoning lowering, profile overlays, and tolerant layered configuration loading. Adding another runtime graph would duplicate those mechanisms and let behavior drift. The adaptation therefore belongs only at the configuration boundary.

## Goals

- Accept canonical `models[]` on both agent and category shorthand.
- Validate the canonical string/object shape and its bounded concrete options.
- Normalize accepted entries immediately into the existing `ModelRequirement.fallbackChain` contract.
- Define deterministic precedence against `requirement`, `model`, `fallbackModels`, and `alias`.
- Preserve requirement defaults and guards when `models[]` replaces only an existing requirement's chain.
- Preserve tolerant generic loading, strict direct validation, alias cloning, profile replacement, logical-tier invariants, catalog-upgrade suppression, route snapshots, cross-family fallback, and final `chat.params` option lowering.
- Document the new user-facing shorthand without deprecating legacy configuration.

## Non-goals

- No parallel runtime model graph.
- No provider/model defaults, model catalog, provider chains, or provider-option passthrough.
- No `provider_options` field in ocmm's canonical entry contract.
- No changes to root/profile global `fallbackModels`, logical-tier override schema, built-in defaults, or fallback-chain semantics.
- No resolver, effective-route, `chat.params`, dispatcher, shared runtime type, prompt, skill, release-pipeline, version, or generated Codex bundle behavior change unless a failing integration test proves an existing consumer does not honor `FallbackEntry`.
- No dead-chain diagnostics, availability policy, coding-agent sessions, or unrelated refactor.

## Approaches

### A. Configuration-boundary adapter to `fallbackChain`

Selected. Add the canonical schema only to agent/category shorthand, map it in `src/config/normalize.ts`, and feed every downstream consumer the existing `ModelRequirement` and `FallbackEntry` structures. This is the smallest compatibility surface, reuses all current cloning/routing/fallback behavior, and confines new semantics to validation, normalization, and direct-selection recognition.

### B. Dual runtime graph

Rejected. Carrying `models[]` beside `fallbackChain` would require duplicate resolver, effective-route, route-registry, `chat.params`, and fallback-dispatch branches. The two representations could diverge on precedence, cloning, defaults, and selected-entry metadata.

### C. Full OMO model catalog and `provider_options`

Rejected. OMO's broader catalog, provider-default, migration, and provider-option machinery is outside ocmm's current wire contract. Copying it would turn a bounded compatibility adapter into a provider/runtime redesign and would bypass existing family-specific option lowering.

## Canonical Configuration Contract

`src/config/schema.ts` will define and export the object and union schemas:

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

`ShorthandFields` gains:

```ts
models: z.array(CanonicalModelEntrySchema).min(1).optional()
```

The inferred `CanonicalModelEntryConfig` type is exported for normalization. Because both `AgentEntrySchema` and `CategoryEntrySchema` spread `ShorthandFields`, the same contract applies to agents, categories, profile entries, and generated JSON Schema agent/category surfaces without changing logical-tier override syntax.

Canonical entries are:

```ts
type CanonicalModelEntryConfig =
  | string
  | {
      model: string
      reasoning?: ReasoningInput
      temperature?: number
      top_p?: number
      max_tokens?: number
    }
```

Validation rules are exact:

- string entries and object `model` values are non-empty;
- `reasoning` uses the existing `ReasoningInputEnum`, including deprecated input alias `none`;
- `temperature` is within `0..2`;
- `top_p` is within `0..1`;
- `max_tokens` is a positive integer;
- accepted `models` arrays contain at least one entry.

The object is intentionally a normal tolerant Zod object rather than `.strict()`. Unknown fields are stripped. In particular, `provider_options` is not declared, is removed at parsing, and never reaches normalization or runtime.

Direct schema callers receive validation failures for an empty `models` array or invalid declared fields. Generic runtime loading keeps its existing tolerant policy: malformed elements are removed, a resulting empty array is removed as an invalid field, and valid legacy siblings or lower-priority layered values survive.

Changing `OcmmConfigSchema` requires regenerating and checking in `schema.json` with `pnpm run gen-schema`. Generation must remain deterministic across two consecutive runs. The repository's current custom JSON Schema converter exposes object/union fields and enums but does not serialize Zod string/array/numeric bounds or integer checks; this feature does not broaden that generator globally. Direct Zod tests remain authoritative for non-empty and numeric validation, while generated-schema checks prove both agent/category surfaces expose only the intended canonical field vocabulary.

## Normalization and Precedence

### Canonical entry mapping

`src/config/normalize.ts` adds one private mapper from `CanonicalModelEntryConfig` to `FallbackEntry`:

- A string reuses `parseModelString(raw)`.
- An object starts with `parseModelString(raw.model, undefined, raw.reasoning)`.
- `temperature` remains `temperature`.
- `top_p` becomes `topP`.
- `max_tokens` becomes `maxTokens`.
- No other object field is copied.

This preserves the canonical reasoning suffix safety added in `c4ee569`: recognized suffix parsing remains context-sensitive, ambiguous bare `:max` remains intact, and an explicit object `reasoning` value wins the model suffix through the existing `parseModelString` contract. Individual object controls remain only on their corresponding `FallbackEntry`.

### Route-source precedence

`normalizeDirectRequirement()` uses this exact direct-source order:

1. accepted, non-empty `models[]`;
2. `requirement.fallbackChain`;
3. `model` plus `fallbackModels`;
4. `alias` resolution in `normalizeShorthand()`.

Sources are never merged. A direct `models[]` chain ignores legacy `model`/`fallbackModels` and suppresses `alias`.

When `models[]` and `requirement` coexist, normalization first immutably normalizes and clones the requirement, then replaces only `fallbackChain`. It preserves cloned `requiresModel`, `requiresAnyModel`, `requiresProvider`, requirement `reasoning`, and requirement `variant`. Explicit shorthand `reasoning` or `variant` values override the corresponding requirement-level defaults. If shorthand defaults are absent, requirement defaults remain. If there is no requirement, the normalized models chain becomes a new requirement and any supplied shorthand `reasoning`/`variant` becomes its default.

Top-level defaults never overwrite entry-local canonical fields. Existing resolver order continues to select entry reasoning/variant before requirement defaults.

## Merge, Profiles, Aliases, and Direct-selection Recognition

`models` arrays replace rather than accumulate:

- ordinary user/project deep merge already replaces arrays unless their key appears in `ACCUMULATING_ARRAY_KEYS`;
- `models` must not be added to `ACCUMULATING_ARRAY_KEYS`;
- profile overlays already replace every array, so an active profile owns its complete `models` chain.

Qualified alias materialization continues to call `normalizeDirectRequirement()` and deep-clone the returned requirement. Consequently a target `models[]` chain is already canonical before cloning, guards and nested providers are independent, and a source with direct `models[]` is not materialized from its alias.

Three direct-selection recognizers must include `models`:

1. `hasDirectNormalRequirement()` in `src/config/schema.ts`, so later canonical Oracle slots with `models[]` satisfy the strict normal-profile invariant. Its validation message must list `models`.
2. `hasExplicitModelSelection()` in `src/logical-tiers/materialize.ts`, so canonical planning/review normals configured with `models[]` suppress catalog promotion.
3. `hasExplicitRouteSelection()` in `src/hooks/config.ts`, so non-registry and category/agent route decisions treat `models[]` as explicit user selection.

No other profile, alias, logical-tier, or merge production code changes are required.

## Downstream Runtime Behavior

The adapter terminates at `ModelRequirement.fallbackChain`. Existing consumers remain authoritative:

- the resolver chooses entries from the normalized fallback chain;
- effective-route materialization and route-registry snapshots clone and freeze the existing fields;
- config registration uses the chain head as the host-visible primary and publishes the complete chain;
- `chat.params` lowers canonical reasoning against the actual provider/model and applies entry `temperature`, `topP`, and `maxTokens` to `temperature`, `topP`, and `maxOutputTokens`;
- runtime fallback selects the next existing `FallbackEntry`, omits unsupported canonical/provider knobs from prompt bodies, and relies on the next `chat.params` call for family-specific lowering.

Integration tests must prove these paths with a GPT-family primary and an Anthropic-family fallback. They should not trigger production edits to resolver, effective-route, `chat.params`, dispatcher, or shared runtime types when the existing contract works.

## Error and Compatibility Behavior

- Strict direct parsing rejects empty `models`, empty model identities, invalid reasoning, out-of-range temperature/top-p, and non-positive/non-integral token limits.
- Tolerant generic loading removes only invalid canonical elements/fields and preserves valid siblings and lower layers according to current layered parsing rules.
- Unknown canonical object fields are silently stripped; they cannot become runtime fields.
- `models[]` does not merge with legacy chains, so route order is deterministic.
- Existing configurations that omit `models` retain their current precedence and byte-equivalent normalized shape.
- Existing canonical reasoning suffix behavior is unchanged.
- Alias, requirement, route, and logical-tier clones remain immutable with no shared nested arrays.

## User-facing Documentation

`README.md` has an appropriate configuration section, so this feature requires a surgical documentation update rather than relying only on generated schema:

- add an agent/category `models` example containing a string and an object;
- list the object keys, bounds, and stripped-unknown-field behavior;
- document precedence `models > requirement > model + fallbackModels > alias`;
- explain top-level `reasoning`/`variant` defaults versus entry-local controls;
- state that nested `agents.*.models` and `categories.*.models` arrays replace across ordinary user/project layers and profiles;
- retain legacy `fallbackModels` documentation and clarify that the root global `fallbackModels` accumulator is unchanged.

No prompt-maintenance or release documentation change is needed because no prompt, skill, or release file changes.

## Files and Ownership

| File | Responsibility |
| --- | --- |
| `src/config/schema.ts` | Canonical entry schemas/types, shorthand `models`, later-Oracle direct requirement recognition. |
| `schema.json` | Generated agent/category editor contract. |
| `src/config/normalize.ts` | Canonical-entry mapping, precedence, requirement-chain replacement, immutable defaults/guards. |
| `src/logical-tiers/materialize.ts` | Treat `models` as explicit normal-profile model selection. |
| `src/hooks/config.ts` | Treat `models` as explicit route selection. |
| `README.md` | User-facing example, reference, precedence, and replacement semantics. |
| `src/config/schema.test.ts` | Direct validation, unknown-field stripping, and later-Oracle invariant. |
| `src/config/normalize.test.ts` | Mapping, suffix precedence, chain precedence, defaults, guards, and cloning. |
| `src/config/load.test.ts` | Ordinary-layer replacement and tolerant invalid/empty pruning with lower-layer survival. |
| `src/config/profiles.test.ts` | Active-profile `models` replacement. |
| `src/config/profile-aliases.test.ts` | Canonical target cloning and direct-source alias suppression. |
| `src/logical-tiers/materialize.test.ts` | Explicit selection, no catalog upgrade, and clone isolation. |
| `src/hooks/config.test.ts` | Host primary, complete published chain, and catalog-suppression integration. |
| `src/routing/effective-route.test.ts` | Existing route materialization preserves mapped controls and guards. |
| `src/hooks/chat-params.test.ts` | Existing consumer performs cross-family reasoning and concrete option lowering. |
| `src/runtime-fallback/dispatcher.test.ts` | Normalization-derived fallback selects provider/model without leaking unsupported fields. |

`src/config/merge.ts`, route/fallback production consumers, and shared runtime types are test-only evidence surfaces for this feature and should remain unchanged.

## Testing and QA

### Focused contracts

- Schema acceptance for strings and objects on agents/categories, every numeric boundary, deprecated `reasoning: none`, unknown-field stripping, empty/invalid direct rejection, and later-Oracle acceptance.
- Normalization of string/object entries, snake-case to camel-case option mapping, explicit reasoning over suffix, direct-source precedence, requirement default/guard preservation, shorthand default override, and deep-clone isolation.
- Ordinary user/project and active-profile array replacement without changing `fallbackModels` accumulation.
- Tolerant pruning of invalid entries and resulting empty arrays while preserving valid legacy siblings and lower-layer values.
- Qualified alias materialization and direct `models` suppression.
- Logical-tier and config-hook explicit-selection recognition.
- Effective-route, `chat.params`, and dispatcher integration through the existing `FallbackEntry` contract.

### Repository gates

Run the complete focused suite, generate `schema.json` twice and compare SHA-256 hashes, structurally inspect generated agent/category schemas, run `pnpm run typecheck`, `pnpm test`, and `pnpm run build`, then inspect every changed TypeScript file with LSP diagnostics. If a TypeScript language server is unavailable, use the already installed TypeScript Compiler API with the changed tests explicitly added to `rootNames`, because repository `tsconfig.json` excludes test files. Do not install software.

### Real surface

After a successful build, create an isolated OpenCode sandbox under `$env:LOCALAPPDATA\Temp\opencode\ocmm-canonical-models-$PID` with separate XDG config, data, state, and cache roots. Configure an agent and a category with canonical `models[]`, run `opencode debug paths`, `opencode debug config`, and `opencode debug agent` without a real model request, and prove the host-visible primary. Because OpenCode's debug agent surface does not expose ocmm's internal fallback metadata, run a no-request in-process probe against built `loadOpenCodePluginConfig`, `createConfigHandler`, and `createEffectiveRouteRegistry` to assert the same sandbox configuration publishes the full fallback chain and entry controls. Always clear environment variables and remove the temporary tree in `finally`.

## Acceptance Criteria

1. Agent and category shorthand accept a non-empty canonical `models[]` containing strings or bounded canonical objects, and generated JSON Schema exposes the canonical string/object surface and field vocabulary without `provider_options`.
2. Unknown object fields, including `provider_options`, are stripped and cannot reach runtime.
3. Generic loading tolerantly prunes invalid/empty canonical data while preserving valid legacy siblings and lower layers; direct schema parsing reports invalid declared data.
4. Normalization maps every canonical entry to the existing `FallbackEntry` shape and preserves canonical suffix safety and explicit reasoning precedence.
5. Direct-source precedence is exactly `models > requirement > model + fallbackModels > alias`, with no chain merging.
6. `models` plus `requirement` replaces only the chain, preserves cloned guards/defaults, and honors explicit shorthand default overrides without leaking entry-local controls.
7. Ordinary and profile overlays replace `models` arrays; aliases clone normalized requirements; canonical review/planning entries satisfy normal invariants and suppress catalog promotion.
8. Existing effective-route, `chat.params`, and fallback consumers preserve the complete chain, perform cross-family reasoning, and lower concrete options without production behavior changes.
9. README documents the canonical shorthand, bounds, precedence, defaults, replacement behavior, and unchanged legacy/root fallback behavior.
10. Focused tests, deterministic schema generation, typecheck, full tests, build, changed-file diagnostics, isolated no-request OpenCode QA, cleanup, and diff/scope checks pass.
11. No prohibited runtime/catalog/provider/default/prompt/skill/release/version scope enters the diff, and no installation or Git write occurs in implementation workers.

## Commit and Review Boundary

This is one independent feature. After implementation and all evidence pass, the parent may create one semantic commit containing schema source, generated schema, normalization, recognition changes, tests, README, this design, and the implementation plan. Suggested message: `feat: add canonical models array configuration`. Implementation workers must not stage, commit, push, or tag.

## Spec Self-review

- Placeholder scan passed: every contract, boundary, and verification surface is concrete.
- Internal consistency passed: canonical data exists only at the configuration boundary and becomes the existing runtime contract immediately.
- Scope passed: one cross-cutting but cohesive compatibility feature maps to one serial implementation plan and one parent-owned commit.
- Ambiguity passed: entry shape, bounds, tolerant/strict behavior, precedence, merge policy, cloning, direct-selection recognition, downstream ownership, documentation, and acceptance evidence are explicit.
- Residual risk review passed: no unresolved product or implementation decision remains.
