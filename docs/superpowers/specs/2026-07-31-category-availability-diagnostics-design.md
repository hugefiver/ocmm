# Category Availability Diagnostics Design

## Goal

Add read-only category model-availability diagnostics that distinguish observed availability, structurally impossible chains, and incomplete catalog evidence without changing category registration, route selection, or runtime fallback behavior.

## Scope

This feature covers:

- a pure category diagnostic resolver;
- safe extraction of the host provider/model catalog;
- stable, deduplicated `OCMM_DEBUG` log reporting for built-in and custom categories;
- tests proving diagnostics never gate or mutate routes;
- user-facing documentation for the status meanings.

This feature does not add model availability gating, change provider/model defaults, modify canonical `models[]`, alter route snapshots, or copy Senpi task/TUI/runtime behavior.

## Existing Constraints

- `target.provider[providerID].models` proves only that a provider/model was observed in the current host config. It does not prove that the catalog is complete or that credentials and runtime access work.
- `requiresModel`, `requiresAnyModel`, and `requiresProvider` are metadata today. The resolver, config registration, effective route, route registry, and runtime fallback do not enforce them as gates.
- Canonical `models[]` is already normalized into `ModelRequirement.fallbackChain`; diagnostics must consume that single runtime chain.
- Explicit user routes must remain registered even when diagnostics report `dead` or `unknown`.
- The default logger is gated by `OCMM_DEBUG`; diagnostics must not add unconditional output.

## Approaches Considered

### 1. Pure resolver plus debug reporter — selected

Resolve a stable diagnostic from the selected model, normalized requirement, provenance, and observed host catalog. Emit it through a per-handler deduplicating reporter. This keeps policy independently testable and makes the integration observational.

### 2. Add diagnostics to route snapshots — rejected

This would make diagnostics queryable but expand the immutable route contract and every snapshot consumer. Runtime fallback would become coupled to information it must not treat as authoritative.

### 3. Soft-gate built-in categories — rejected

Skipping a category when the host catalog lacks a model would treat an incomplete or dynamic catalog as closed-world evidence. That can remove routes that remain callable at runtime.

## Architecture

Create `src/routing/category-availability.ts` with no I/O. It will:

1. Materialize the actual selected primary with `materializeSelectedPrimary()` so diagnostics inspect the same selected identity and ordered fallback chain as registration.
2. Extract a minimal catalog observation from `target.provider` without retaining unrelated provider configuration or credentials.
3. Evaluate each candidate against structural guards and observed catalog keys.
4. Aggregate candidates into `available`, `dead`, or `unknown`.

Create `src/hooks/category-availability-diagnostics.ts` as the logging adapter. It will resolve a diagnostic, deduplicate by a stable key for the lifetime of one config handler, and emit a single structured message. `dead` uses `warn`; `available` and `unknown` use `info`. Every message states that the route was preserved.

`src/hooks/config.ts` will instantiate one reporter beside the existing subagent-depth reporter. It will call the reporter only after `applyAgentEntry()` succeeds for:

- every enabled built-in category;
- every successfully registered custom category.

The call uses the already selected primary and already resolved effective requirement. It does not feed any value back into registration or route construction.

## Public Data Contract

```ts
type CategoryAvailabilityStatus = "available" | "dead" | "unknown"

type CategoryCandidateStatus = "available" | "dead" | "unknown"

type CategoryCandidateReason =
  | "catalog-match"
  | "catalog-any-model"
  | "requires-model-mismatch"
  | "requires-provider-mismatch"
  | "provider-unobserved"
  | "model-unobserved"

type CategoryCandidateDiagnostic = Readonly<{
  index: number
  model: string
  providers: readonly string[]
  status: CategoryCandidateStatus
  reasons: readonly CategoryCandidateReason[]
}>

type CategoryAvailabilityDiagnostic = Readonly<{
  key: string
  name: string
  status: CategoryAvailabilityStatus
  reason:
    | "catalog-match"
    | "catalog-any-model"
    | "structural-conflict"
    | "no-candidates"
    | "catalog-incomplete"
  requirementSource: RequirementSource
  primarySource: PrimarySource
  selectedModel: string
  routePreserved: true
  candidates: readonly CategoryCandidateDiagnostic[]
}>
```

The exact exported function accepts typed route inputs plus the raw host config:

```ts
resolveCategoryAvailabilityDiagnostic(args: {
  name: string
  target: Record<string, unknown>
  requirement: ModelRequirement
  requirementSource: RequirementSource
  primarySource: PrimarySource
  selectedModel: string
}): CategoryAvailabilityDiagnostic
```

The diagnostic contains no API keys, provider options, response bodies, URLs, or full host config.

## Candidate Evaluation

The resolver first materializes the selected model as the primary candidate, preserving the effective chain order and deduplicating exactly as route construction already does.

For each candidate:

1. If `requiresModel` exists and the candidate model differs, the candidate is `dead` with `requires-model-mismatch`.
2. Candidate providers are its explicit providers. If none are explicit, use `requiresProvider` when present; otherwise use all observed provider IDs.
3. If explicit candidate providers and `requiresProvider` have no intersection, the candidate is `dead` with `requires-provider-mismatch`.
4. If no provider can be observed or inferred, the candidate is `unknown` with `provider-unobserved`.
5. If `requiresModel` is absent and `requiresAnyModel === true`, any eligible observed provider with at least one observed model makes the candidate `available` with `catalog-any-model`.
6. An exact eligible provider/model key makes the candidate `available` with `catalog-match`.
7. A missing provider is `unknown` with `provider-unobserved`. An observed provider without the exact model, or without an observable model map, is `unknown` with `model-unobserved`.

`requiresModel` is the exact guard and therefore takes precedence over `requiresAnyModel`.

## Aggregate Status

- `available`: at least one candidate is available.
- `dead`: the chain is empty, or every candidate is structurally dead because of guard conflicts.
- `unknown`: at least one candidate remains structurally eligible, but the observed catalog cannot prove availability.

Catalog absence alone never produces `dead`. This is the core fail-safe rule.

## Reporting

The reporter serializes a stable, human-readable summary containing:

- category name;
- aggregate status and reason;
- requirement and primary provenance;
- selected model;
- `routePreserved=true`;
- candidate index/model/provider/status/reasons.

The stable diagnostic key covers all those non-secret fields. Repeated config hook calls with the same diagnostic emit once per handler. A changed diagnostic emits once for the new key.

## Error Handling

- Unknown or malformed host provider structures are treated as unobserved catalog evidence, not exceptions.
- The pure resolver accepts normalized typed requirements and always returns a diagnostic.
- The reporter has no authority to throw, disable, replace, reorder, or rewrite a route.
- The existing logger already swallows console failures; no new fallback logger is added.

## Testing Strategy

### Pure resolver

Add `src/routing/category-availability.test.ts` covering:

- exact catalog match;
- `requiresAnyModel` with an observed eligible provider;
- unknown provider/model/catalog shapes;
- provider-unspecified candidates;
- exact-model and provider structural conflicts;
- mixed dead/unknown candidates aggregating to unknown;
- empty chain aggregating to dead;
- selected-primary materialization and no input mutation;
- no secret/provider-option leakage.

### Reporter

Add `src/hooks/category-availability-diagnostics.test.ts` covering:

- stable info/warn selection;
- one emission per key;
- a changed key emits again;
- message contains `routePreserved=true` and no unrelated host data.

### Config integration

Extend `src/hooks/config.category.test.ts` to prove:

- built-in categories emit diagnostics only after successful registration;
- custom categories emit diagnostics;
- disabled or unregistered categories do not emit;
- explicit `models`, legacy model, and structurally conflicting requirements remain registered and published unchanged;
- catalog selection and route snapshot contents remain unchanged;
- repeated config calls are deduplicated.

### Final gates

- focused diagnostic/config tests;
- `pnpm run typecheck`;
- `pnpm test`;
- `pnpm run build`;
- TypeScript diagnostics for every changed TS/test file, using the approved Compiler API fallback if the language server remains unavailable;
- isolated OpenCode debug-config run showing `available`, `unknown`, and `dead` messages while the corresponding routes remain registered;
- `git diff --check` and exact scope inspection.

## Acceptance Criteria

1. Category diagnostics use exactly `available`, `dead`, and `unknown`.
2. Missing or incomplete catalog evidence never produces `dead`.
3. Only structural guard conflicts or an empty chain produce `dead`.
4. Exact catalog observations and `requiresAnyModel` observations produce `available`.
5. Built-in and custom categories report through `OCMM_DEBUG`-gated logging with per-handler deduplication.
6. Every report states `routePreserved=true`.
7. Registration, selected primary, route snapshot, runtime fallback, provider defaults, and canonical `models[]` behavior remain unchanged.
8. Explicit user routes remain registered for all statuses.
9. No secret-bearing host fields appear in diagnostics.

## Self-Review

- Placeholder scan: passed; no incomplete sections.
- Consistency: the three-state rules, candidate rules, and acceptance criteria agree.
- Scope: one pure resolver, one reporter, config integration, tests, and documentation; no runtime gating.
- Ambiguity: `dead` is explicitly limited to structural impossibility, and catalog absence is explicitly `unknown`.
