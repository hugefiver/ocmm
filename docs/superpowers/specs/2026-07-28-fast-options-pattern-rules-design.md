# Fast Options Pattern Rules Design

## Goal

Extend OpenCode `--fast` behavior with a configuration-driven fallback that matches the runtime provider, model, and SDK and injects provider-specific `chat.params` options. Existing explicit model mappings and catalog-backed `-fast` model handling remain the preferred paths; option rules are eligible only when neither existing path handles the route.

## Scope

This design covers:

1. A `fastModels.rules` configuration surface with structured glob matching and arbitrary provider options.
2. Whole-array profile replacement for those rules.
3. Route metadata that distinguishes an existing fast-model path from the fallback option path.
4. Runtime matching and ordered deep merging into `chat.params` output options.
5. Schema, generated schema, OpenCode documentation, focused tests, and full verification.

It does not change the CLI activation contract, model mapping syntax, catalog suffix discovery, fallback-chain ordering, unmanaged OpenCode agents, or Codex behavior.

## Existing Behavior and Constraints

- `src/routing/effective-route.ts::selectFastCandidate` currently requires `--fast` activation, checks an explicit `fastModels.mappings[provider/model]` first, and otherwise accepts `<model>-fast` only when it exists in the selected provider catalog.
- `buildEffectiveModelRoute` publishes the selected model and transformed fallback requirement through the effective route registry.
- `src/hooks/chat-params.ts` can mutate `output.options`, but its input normalization currently retains only `providerID` and `modelID`.
- OpenCode's current `chat.params` contract provides a complete model object. The SDK package used for a request is exposed as `model.api.npm`; provider context is supplied separately.
- Profile overlays already replace arrays rather than accumulating them.
- Changes to `OcmmConfigSchema` require regeneration of root `schema.json`.

## Considered Approaches

### 1. Nested structured rules under `fastModels`

Add ordered `{ match, options }` entries to `fastModels.rules`. This keeps all `--fast` policy together, is straightforward to validate, and naturally follows existing profile array replacement.

### 2. Independent top-level `fastOptions`

This separates model promotion from option injection, but splits one user-facing mode across unrelated configuration sections and makes precedence less obvious.

### 3. Composite string keys mapped to options

Keys such as `provider=...;model=...;sdk=...` are compact but require a new parser and escaping rules, produce weaker validation errors, and are harder to extend.

### Decision

Use nested structured `fastModels.rules`.

## User-Facing Configuration

```jsonc
{
  "fastModels": {
    "providers": ["openai"],
    "mappings": {},
    "rules": [
      {
        "match": {
          "provider": "openai-*",
          "model": "gpt-5.*",
          "sdk": "@ai-sdk/openai*"
        },
        "options": {
          "serviceTier": "priority"
        }
      },
      {
        "match": {
          "model": "gpt-5.6-*"
        },
        "options": {
          "telemetry": {
            "fast": true
          }
        }
      }
    ]
  },
  "profiles": {
    "economy": {
      "fastModels": {
        "rules": [
          {
            "match": { "sdk": "@ai-sdk/openai-compatible" },
            "options": { "serviceTier": "flex" }
          }
        ]
      }
    }
  }
}
```

The conceptual schema is:

```ts
type FastOptionRule = {
  match: {
    provider?: string
    model?: string
    sdk?: string
  }
  options: Record<string, unknown>
}

type FastModelsConfig = {
  providers: string[]
  mappings: Record<string, string>
  rules: FastOptionRule[]
}
```

Root `fastModels.rules` defaults to `[]`. The profile form makes `rules` optional and injects no child default. When a profile declares `fastModels.rules`, its array replaces the root array in full; when omitted, the root array is inherited.

## Match Contract

Each rule has a strict `match` object and strict rule object.

- `provider`, `model`, and `sdk` are optional non-empty strings.
- At least one match field is required.
- Values are case-sensitive, whole-string globs.
- `*` matches zero or more arbitrary characters, including `/`.
- `?` matches exactly one arbitrary character.
- All declared fields must match (logical AND).
- Runtime values are `model.providerID`, `model.modelID`, and `model.api.npm`, respectively.
- A rule requiring `sdk` does not match when SDK metadata is absent.
- Unknown match or rule fields are rejected by schema validation.
- `options` must be an object. An empty object is valid but has no effect.

Option rules do not use `fastModels.providers` as an additional allowlist. Their provider scope is expressed directly through `match.provider`. This allows an options-based fast mechanism for a provider that has no separate fast model and therefore does not need model-promotion allowlisting.

## Fast-Path Precedence

For each OCMM-managed effective route, config-time fast resolution follows this order:

1. If fast mode is disabled, publish the unchanged route with the option fallback disabled.
2. If a fully qualified mapping key exists, the mapping path is authoritative.
   - A distinct mapped model uses the existing fast-model transformation.
   - A self-mapping remains the existing no-op and does not fall through to option rules.
3. If the selected model already ends in `-fast`, preserve the existing no-op and do not apply option rules.
4. If the provider is allowlisted and the catalog contains `<model>-fast`, use the existing suffix transformation.
5. Otherwise, leave the selected model and requirement unchanged and mark the effective route as eligible for option rules.

This preserves current explicit-mapping and suffix behavior. A provider not listed in `fastModels.providers` may still reach the independent option-rule path.

The internal `EffectiveModelRoute` gains a discriminant representing these outcomes, conceptually:

```ts
type FastPath = "off" | "model" | "options"
```

`off` covers disabled fast mode and authoritative existing-path no-ops. `model` means a mapped or catalog-backed fast model was selected. `options` means fast mode is active and no existing model path handled the route.

## Runtime Option Application

`chat.params` reads one effective route registry snapshot as it does today. Rules are evaluated only when:

- the requested agent or category has a published OCMM-managed route, and
- that route's fast path is `options`.

Unmanaged OpenCode agents and published route misses remain unchanged.

Matching uses the actual runtime request model rather than only the config-time primary. Consequently, after runtime fallback switches provider or model, rules are evaluated again against that actual provider/model/SDK identity. A route handled by the existing model path never enters option mode, including after it falls back from a promoted fast model to its original model.

All matching rules are processed in declaration order. Their `options` are deep-merged as follows:

- plain objects merge recursively;
- arrays replace earlier arrays;
- scalar and null values replace earlier values;
- later matching rules win on conflicts.

The merged result is then deep-merged over the current `output.options`, so configured fast options win ordinary provider and route option conflicts. Existing review and plan-critic minimum reasoning floors remain the final write and may raise protected reasoning controls after the rule merge. Other option keys pass through unchanged.

The deep merge is non-mutating with respect to configuration values and does not retain references that a later hook invocation could mutate.

## Errors and Diagnostics

Invalid rule configuration fails Zod parsing and follows the existing whole-config load fallback policy. Runtime matching itself is a pure no-throw operation: missing metadata or no matches produces a no-op.

Debug logging may report the selected fast path and the number or indexes of matching rules. It must not serialize option values because provider options may contain secrets or sensitive request metadata.

## Component Boundaries

Expected implementation surfaces are:

- `src/config/schema.ts` and schema tests: root/profile rule schemas and inferred types.
- A focused routing helper adjacent to `effective-route.ts`: glob matching and ordered, non-mutating option merging.
- `src/routing/effective-route.ts`, shared route types, and route tests: fast-path discrimination without changing route/fallback semantics.
- `src/hooks/chat-params.ts` and tests: retain SDK identity, evaluate eligible rules, merge options, and preserve final review floors.
- Config/profile integration tests: profile replacement and reload behavior.
- `schema.json`, `README.md`, `docs/architecture.md`, and `examples/ocmm.example.jsonc`: generated and user-facing synchronization.

Exact helper filenames may be refined in the implementation plan, but fast-model resolution and runtime option matching must remain independently testable.

## Testing Strategy

### Schema and profiles

- Omitted `rules` defaults to `[]` at the root.
- Profile omission preserves root rules; profile declaration replaces the whole rule array.
- Empty match objects, empty patterns, unknown fields, and non-object options fail validation.
- Nested option objects, arrays, scalars, and null values parse.

### Pure matching and merge

- Provider/model/SDK globs match whole strings with the specified `*` and `?` behavior.
- Declared fields combine with AND semantics.
- Missing SDK metadata prevents SDK-constrained matches.
- Multiple matches deep-merge in declaration order; arrays and scalars replace; inputs are not mutated.

### Route precedence

- Distinct explicit mappings remain authoritative and do not enable option rules.
- Self-mappings remain authoritative no-ops and do not enable option rules.
- Already-`-fast` selected models remain no-ops and do not enable option rules.
- Catalog-backed suffix candidates remain preferred.
- A provider outside the model-promotion allowlist can enter option mode.
- Disabled fast mode never enters option mode.

### Chat integration

- A published option-mode route merges matching options into `output.options`.
- Ordinary provider options are overridden on conflict; later matching rules override earlier rules.
- Actual runtime fallback provider/model/SDK values are matched on each call.
- Model-mode, off-mode, unmatched, missing-SDK, unmanaged-agent, and published-route-miss cases are unchanged.
- Review and plan-critic floors remain effective after configured options are merged.
- Reloaded profile rules replace the prior snapshot behavior after successful config publication.

### Final verification

Run:

```powershell
pnpm run gen-schema
pnpm run typecheck
pnpm test
pnpm run build
```

## Acceptance Criteria

1. Existing explicit mapping and catalog suffix promotion retain their current model and fallback-chain behavior and always take precedence over option rules.
2. `--fast` uses option rules only for OCMM-managed routes that no existing model path handled.
3. Rules match actual runtime provider, model, and `model.api.npm` values through documented case-sensitive whole-string globs.
4. Every matching rule contributes options in declaration order through deterministic deep merging, with later rules winning conflicts.
5. Profile rule arrays replace root arrays exactly according to existing overlay semantics.
6. Option rules are independent of `fastModels.providers`, while existing model promotion remains allowlisted.
7. Runtime fallback requests re-evaluate option rules against their actual model identity; promoted model routes never switch into option mode.
8. Invalid configuration fails at load time, runtime no-match cases are silent, and logs never expose option values.
9. Unmanaged OpenCode agents and Codex behavior remain unchanged.
10. Generated schema, documentation, focused tests, typecheck, full tests, and build are synchronized and pass.
