# Fast Model Routing and Cross-Profile Alias Design

## Goal

Add an `ocmm --fast` launch mode that promotes an available fast counterpart of every OCMM-managed primary model, keeps the original model as the immediately following fallback, and preserves the rest of the existing fallback chain.

The same change adds qualified agent model aliases in the form `<profile>:<agent>`, allowing the active configuration to reuse another profile's effective model requirement without importing that profile's permissions, prompts, tools, or other behavior.

This design defines the implementation contract only. The current task ends after a reviewed implementation plan.

## Scope

This design covers:

1. Parsing `--fast` in the `ocmm` shim and communicating the opt-in to the OpenCode plugin process.
2. Provider allowlisting and explicit original-to-fast model mappings.
3. Catalog-backed automatic `-fast` discovery.
4. Construction and sharing of the final effective model requirement used by registration, chat routing, and runtime fallback.
5. Qualified `agents.*.alias` references to effective model requirements in other profiles.
6. OpenCode plugin behavior, schema generation, documentation, and verification.

It does not:

- Rewrite the provider catalog.
- Fast-promote arbitrary OpenCode agents that OCMM does not manage.
- Enable fast routing without the `--fast` opt-in or an equivalent explicit `OCMM_FAST=1` process environment.
- Import non-model behavior from another profile.
- Add equivalent behavior, compatibility guarantees, or generated artifacts for the Codex plugin.

## Context and Constraints

- `src/cli/shim.ts` is the user-facing `ocmm` executable. Unknown arguments currently pass through to OpenCode.
- The OpenCode plugin does not receive the shim's parsed argument object, so the shim must communicate the opt-in through the child process environment.
- `src/hooks/config.ts` can inspect `target.provider[provider].models`, but this catalog contains only models exposed by the current host configuration.
- The final primary model may come from an existing same-name OpenCode agent, an explicit user requirement, catalog successor selection, or a built-in requirement.
- `src/hooks/config.ts` currently registers only the selected model string. Chat routing and runtime fallback later recompute requirements from raw config.
- Changing only the registered model would not guarantee that the original model follows its fast counterpart during runtime fallback.
- `src/config/load.ts` sees inline, user-directory, and project-directory profiles, but only the active profile is overlaid into the returned `OcmmConfig`. A dedicated OpenCode-plugin load boundary can retain inactive directory descriptors and pre-active base agents internally without exposing them in `config.profiles`.
- The existing `loadConfig` API is shared beyond the OpenCode plugin. In particular, `src/codex/plugin-generator.ts` first calls it with `host:"codex"` and may fall back to `host:"opencode"`, so `host === "opencode"` is not sufficient to identify an OpenCode plugin runtime load.
- Qualified aliases therefore materialize only through `loadOpenCodePluginConfig`, called by the OpenCode plugin's initial load and `reload()`. Ordinary `loadConfig` calls retain their existing signature and behavior and leave aliases containing `:` unmaterialized.
- Existing unqualified aliases resolve within one `agents` record, use direct model fields before `alias`, and copy only the target requirement.
- Schema source changes require regenerating root `schema.json`.
- No Git write is authorized as part of this planning task.

## Considered Approaches

### 1. OpenCode-plugin-boundary alias materialization plus a config-time effective-route registry

Resolve qualified profile aliases in `loadOpenCodePluginConfig`, which uses an internal load pipeline that retains every precedence-selected profile descriptor and the pre-active base agents. The ordinary `loadConfig` entry point may share parsing, schema, and merge helpers, but it never requests qualified-alias materialization. During the config hook, select the actual primary model, optionally transform its requirement for fast routing, and atomically publish the final route to a shared registry.

Advantages:

- Every downstream consumer sees one final requirement.
- The fast transformation can use both the selected primary and the provider catalog.
- Runtime fallback receives the required `fast -> original -> remaining chain` order.
- Qualified profile aliases do not require profile registries to leak through every routing API.
- OpenCode registration and runtime fallback receive materialized aliases through one plugin-only load path, while generic and Codex callers remain outside the feature boundary even when they request the `opencode` host layout.

Disadvantage: the plugin needs an explicit loading facade in addition to a small shared route registry with explicit reload semantics.

### 2. Mutate `OcmmConfig` after the config hook selects models

This avoids a registry, but makes the parsed configuration mutable, mixes user intent with runtime-derived catalog state, and creates ordering hazards during reload.

### 3. Rewrite only `chat.params`

This is local, but runtime fallback would still use the original requirement and could skip the original primary after a fast-model failure. It cannot satisfy the fallback-order contract.

### Decision

Use approach 1: qualified-alias materialization at the explicit OpenCode-plugin load boundary, followed by config-time fast transformation and atomic publication of final effective routes. Host selection controls file locations only; it is never the feature gate.

## User-Facing Configuration

### CLI

```powershell
ocmm --fast run "Review this change"
```

`--fast` is an OCMM-only flag. The shim removes it from passthrough arguments and sets `OCMM_FAST=1` in the spawned OpenCode process.

The flag is CLI-only and is not added to the persistent `shim` defaults. Direct plugin launches may opt in with `OCMM_FAST=1` or `OCMM_FAST=true`; all other values are disabled.

Arguments after the explicit `--` separator remain passthrough arguments. Therefore `ocmm -- --fast` continues to pass `--fast` to OpenCode and does not enable OCMM fast routing.

Without `--fast`, or when `OCMM_FAST` is neither exactly `1` nor exactly `true`, model selection remains unchanged.

### Fast model policy

```jsonc
{
  "fastModels": {
    "providers": ["openai", "github-copilot"],
    "mappings": {
      "openai/gpt-5.6-sol": "gpt-5.6-sol-turbo",
      "github-copilot/claude-sonnet-4.6": "claude-sonnet-4.6-fast"
    }
  }
}
```

The root schema is conceptually:

```ts
type FastModelsConfig = {
  providers: string[]
  mappings: Record<string, string>
}
```

`OcmmConfigSchema` defaults the complete object to `{ providers: [], mappings: {} }`. The profile schema uses a partial form in which the object and both child fields are optional and no child default is injected; otherwise an unrelated profile would erase base policy during overlay.

Rules:

- `providers` is an exact, case-sensitive allowlist of Provider IDs.
- Omitting `providers` and setting `providers: []` both disable fast promotion for every Provider.
- The allowlist gates both automatic discovery and explicit mappings.
- A mapping key is a fully qualified original model identity, `provider/model-id`.
- A mapping value is the fast model ID within the same Provider. It is not a second fully qualified identity and may itself contain `/` characters.
- Mapping keys use the implementable `^[^/]+/.+$` constraint. Mapping values must contain at least one non-whitespace character.
- A profile may override `fastModels.providers`; the existing profile array-replacement rule applies.
- `fastModels.mappings` is a record and follows existing deep-merge behavior, allowing a profile to add or replace mappings by key.

The user explicitly selected an opt-in Provider policy: omission means disabled rather than all Providers enabled.

### Qualified model aliases

```jsonc
{
  "agents": {
    "oracle": {
      "alias": "precision:reviewer",
      "description": "Local behavior remains local"
    }
  }
}
```

`precision:reviewer` means: resolve the effective model requirement of `reviewer` as if profile `precision` were active, then use that requirement for the source `oracle` entry.

Only `agents.*.alias` gains this grammar. Existing unqualified aliases retain their current semantics. Category alias behavior is unchanged.

Any agent alias containing `:` uses the new grammar and is split at the first colon. Both sides must be non-empty. The profile segment must match `^[A-Za-z0-9_-]+$`, matching the profile-management CLI's accepted names; the agent segment may contain any non-empty existing agent key except another qualified split is not inferred after the first colon. This is an intentional compatibility break for a hypothetical existing agent key containing `:`; such a key can no longer be targeted through `alias` because the previous implementation did not reserve an escape syntax.

## Qualified Alias Resolution

### Profile source precedence

Profile lookup preserves current precedence:

1. Inline profiles from the merged base config.
2. User profile-directory entries override matching inline profiles.
3. Project profile-directory entries override matching user entries.

Directory discovery retains a descriptor for every candidate, including its origin path, parsed value, and parse or shape error. An invalid higher-precedence descriptor still shadows a valid lower-precedence profile with the same name; lookup must not silently fall through to the lower entry.

Only an active or qualified-referenced directory profile must pass validation. An invalid, unreferenced inactive directory profile does not affect the active configuration. Inline profiles continue to be validated by the existing root schema even when inactive.

### Effective profile view

For a reference to `<profile>:<agent>`, the resolver constructs the target profile's effective agent view from:

```text
base agents + target profile agent overlay
```

`base agents` means the user-plus-project merged agents before the currently active profile is applied. The current active profile's agent overlay must not leak into the target view. The target profile is not made active globally, and its non-agent fields do not affect the current load.

Within the target profile scope:

- An unqualified alias resolves against the target profile's effective agent view.
- Another qualified alias may enter a different profile scope.
- Direct `model`, `fallbackModels`, or `requirement` fields retain their current precedence over `alias`.

### Imported data

The qualified alias imports the complete normalized `ModelRequirement`:

- `fallbackChain`
- requirement-level native `variant`
- `requiresModel`
- `requiresAnyModel`
- `requiresProvider`
- model-entry Provider, model, native variant, and existing model-control metadata

It does not import:

- `description`
- `disabled`
- `tools` or `permission`
- `skills` or `promptAppend`
- agent-level temperature, top-p, max-token, thinking, or reasoning overrides
- any profile-wide setting

The source agent's local non-model fields remain authoritative.

### Cycle identity

Cycle detection uses a scoped node identity rather than an agent name alone:

```text
[scope, agent]
```

The implementation uses a structured tuple or collision-safe encoded pair, not raw string concatenation. Scopes distinguish the active effective configuration from each named profile. This detects direct and multi-profile cycles without treating same-named agents in different profiles as the same node.

### Errors

The following make qualified alias materialization fail:

- Missing profile.
- Referenced profile that fails `ProfileEntrySchema` validation.
- Missing target agent in the target effective view.
- Target agent with no resolvable model requirement.
- Direct or transitive scoped alias cycle.

The error includes the complete scoped alias path. At `loadOpenCodePluginConfig`, the entire merged configuration is rejected atomically; the boundary logs the validation or materialization error and returns `defaultConfig()`. OCMM must not silently fall back only the affected agent while accepting the rest of the invalid configuration.

Within that OpenCode-plugin boundary, an invalid directory profile that is selected as active also rejects the load instead of being discarded and replaced by a lower-precedence same-name profile. A missing active profile retains the existing stale-selection behavior: warn and load the base config. Missing profiles are strict errors only when named by a qualified alias. Ordinary `loadConfig` does not run qualified-alias resolution, does not emit these strict qualified-alias errors, and preserves its existing generic load and failure behavior.

## Fast Model Selection

### Activation

Fast promotion runs only when all conditions hold:

1. The process has fast mode enabled by the shim or an explicitly supported environment value.
2. The selected primary has a valid `provider/model` identity.
3. The Provider is listed in `fastModels.providers`.
4. A valid fast candidate is found.

### Candidate precedence

For selected primary `provider/A`:

1. If `fastModels.mappings["provider/A"]` exists, its value is authoritative.
2. Otherwise the automatic candidate is `A-fast`.
3. The automatic candidate is accepted only when `target.provider[provider].models` contains it.
4. An explicit mapping does not require catalog visibility. This is the escape hatch for Provider capabilities that the host catalog does not enumerate or that use irregular names.

The Provider allowlist still applies to explicit mappings. A mapping cannot switch Providers.

### No-op cases

Promotion does nothing when:

- Fast mode is disabled.
- The Provider is not allowlisted.
- The selected model already ends in `-fast` and no distinct explicit mapping applies.
- The mapping points to the original model.
- No explicit mapping exists and the automatic candidate is absent from the Provider catalog.
- The selected model cannot be parsed into a Provider and model ID.

These are expected no-op outcomes, not runtime errors.

## Effective Requirement Construction

### Final primary first

The existing primary precedence remains unchanged:

1. Existing same-name OpenCode model.
2. Explicit user model requirement.
3. Catalog-confirmed successor selected by current upgrade logic.
4. Built-in requirement head.

Fast promotion occurs after this primary is selected, so it applies consistently regardless of source.

### Materializing the selected entry

A Provider-qualified selected `provider/model` is always materialized into the requirement, even when fast mode is disabled. It is matched back to the effective requirement using the same exact, successor, and prefix-boundary semantics as routing.

- If a baseline entry matches, copy its model-control metadata and pin its Provider to the selected Provider.
- If no entry matches, synthesize an original entry with the selected Provider/model and the requirement-level native variant when present.
- Agent-level controls remain on the registered agent and are not moved into fallback entries.

This first stage produces:

```text
[O, ...remaining entries]
```

where `O` is the final selected primary. The exact baseline entry used to materialize `O` is removed from the remainder. For a successor or prefix match, only that matched baseline entry is removed. If no entry matches, the complete original chain remains after `O`. Exact duplicate entries use ordered Providers plus model ID as identity and are removed stably.

This unconditional Provider-qualified primary materialization aligns fallback indexes for existing OpenCode models and catalog successors independently of fast mode.

If the final selected model is unqualified or otherwise cannot produce a non-empty Provider/model identity, OCMM preserves the baseline requirement unchanged and disables fast promotion for that route. It must not synthesize an entry with `providers: []`, because runtime fallback cannot dispatch such an entry. The later request/event Provider remains authoritative under existing behavior.

### Chain transformation

The optional fast stage transforms the already materialized chain. For original selected entry `O` and fast entry `F`:

```text
[F, O, ...remaining entries]
```

Rules:

- `F` is a copy of `O` with only the model ID changed.
- Both `F` and `O` are pinned to the selected Provider.
- The original model is always index 1 and therefore the first model-switch fallback after the fast model.
- Remaining entries preserve the order produced by primary materialization.
- Exact duplicates of `F` or `O`, using ordered Providers plus model ID as identity, are removed from the remainder.
- Entries with a different Provider list or model remain unchanged.
- Requirement-level constraints and native variant defaults are preserved.

Both stages are pure. A fast no-op returns the primary-materialized requirement, not the pre-materialization raw requirement.

## Shared Effective Route Registry

### Route shape

The plugin maintains an internal route per OCMM-managed agent or category:

```ts
type EffectiveModelRoute = {
  model: string
  requirement: ModelRequirement
  requirementSource: ResolutionSource
  primarySource: "existing-model" | "user-requirement" | "catalog-upgrade" | "builtin-requirement"
}
```

The registry is internal runtime state, not user configuration.

`requirementSource` retains the current routing provenance used by `chat.params` to decide whether model controls were explicitly configured. `primarySource` records how registration selected the final model. Catalog or existing-model selection changes only `primarySource`; it must not overwrite baseline requirement provenance and thereby change explicit-variant behavior.

The two fields are orthogonal. `requirementSource` is determined only by the baseline requirement and never by the selected primary:

| Baseline requirement | Final primary | `requirementSource` | `primarySource` |
| --- | --- | --- | --- |
| User agent/category requirement | Existing same-name OpenCode model | `user-config` | `existing-model` |
| User agent/category requirement | Its selected configured model | `user-config` | `user-requirement` |
| Built-in agent requirement | Existing same-name OpenCode model | `agent-default` | `existing-model` |
| Built-in agent requirement | Catalog successor | `agent-default` | `catalog-upgrade` |
| Built-in agent requirement | Built-in head | `agent-default` | `builtin-requirement` |
| Built-in category requirement | Catalog successor or built-in head | `category-default` | `catalog-upgrade` or `builtin-requirement` |

`input-variant` is request-local provenance and is never stored in an effective route. It continues to be applied by `chat.params` after route lookup.

### Publication

The registry stores `{ published, snapshotId, routes }` and a monotonically increasing config-build generation. Each config-hook invocation reserves a generation and builds a complete next route map locally. It may publish only if it is still the latest-started invocation and registration completed successfully.

Successful publication atomically replaces the complete previous snapshot and increments `snapshotId`. A successfully published empty route map is distinct from a registry that has never published. A failed or stale config-hook invocation leaves the last successful snapshot intact.

If no fast promotion occurs, the registry still stores the final selected model and its effective requirement. This keeps registration and fallback selection aligned for catalog-selected and existing OpenCode primaries.

### Consumers

- Config registration uses `route.model`.
- `chat.params` uses `route.requirement` when resolving the named OCMM agent/category and continues to match the request's actual input model against that requirement.
- Runtime fallback uses the same `route.requirement` and `route.model` for initial identity and fallback-index alignment.
- Consumers may use the existing raw-config requirement resolver only before any snapshot has been successfully published. Once `published` is true, a missing route is a real absence and must not trigger raw agent/category requirement recomputation. Route-independent request behavior, including explicit `inputVariant` handling for unmanaged agents, remains unchanged.
- Runtime `FallbackState` and each subagent-429 session controller record the route `snapshotId`. If a later event observes a different snapshot, it discards the old fallback state, stops the old controller timer/generation, and rebuilds against the current route before making another fallback decision.
- Every scheduled or queued 429 retry, prepared switch, generic-fallback handoff, dispatch, and commit carries the snapshot ID captured when it was created. It rechecks the current ID immediately before side effects. A mismatch cancels the stale operation and prevents both dispatch and commit of its old target.

The OpenCode plugin path replaces its `registeredAgentModels` map with this route registry. Existing out-of-scope callers of the shared config handler, including Codex generation, retain a compatibility path with current non-fast behavior; this feature must not require their migration.

## Agents and Categories

Fast promotion applies to every route that OCMM manages and registers:

- Built-in agents.
- Configured custom agents with model requirements.
- Built-in categories represented as agent profiles.
- Configured categories.
- A same-name agent already present in the OpenCode config when OCMM registration would otherwise preserve its model.
- OCMM compatibility aliases such as `explore`.

It does not iterate over and rewrite unrelated entries in `target.agent`.

Compatibility aliases receive their own final route after the alias entry is merged. If OpenCode or user configuration gives the alias a model distinct from its target, that actual alias primary is materialized and optionally fast-promoted; the implementation must not blindly copy the target's route snapshot.

## Codex Non-Scope

These two capabilities are specified only for the OpenCode plugin. The implementation does not add Codex-specific route-registry wiring, profile-directory handling, environment isolation, generator behavior, tests, documentation, or generated artifacts.

Shared schema, parsing, merge, or descriptor helpers may incidentally be reused by existing Codex code, but such reuse does not constitute the feature. Both of the generator's ordinary `loadConfig` calls—including its `host:"opencode"` fallback—remain unmaterialized. This design does not guarantee that `--fast` or `<profile>:<agent>` works in Codex and must not expand work solely to provide Codex parity.

## Reload and Environment Isolation

- The shim sets `OCMM_FAST=1` only in the child environment; it does not mutate its parent process environment.
- `createPlugin` uses `loadOpenCodePluginConfig({ cwd })` for both its initial configuration and `reload()`; no OpenCode plugin lifecycle load relies on ordinary `loadConfig` or on a host-value check to enable qualified aliases.
- `createPlugin` parses `OCMM_FAST` once per load/reload boundary and passes the resulting boolean into config registration; routing helpers never read process environment directly.
- `reload()` re-runs config loading. Until a newer config-hook invocation publishes successfully, consumers retain the last successful route snapshot. The publication's new `snapshotId` invalidates per-session fallback indexes and pending subagent-429 work before their next side effect.
- Test commands that load profiles must save, clear, and restore ambient `OCMM_PROFILE` and `OCMM_NO_PROFILE` so developer shell state cannot alter fixtures.
- Tests of fast activation must similarly control and restore `OCMM_FAST`.

## File and Component Boundaries

Expected implementation surfaces include:

- `src/cli/shim.ts` and `src/cli/shim.test.ts`: parse `--fast`, build child environment, update help, and prove passthrough behavior.
- `src/config/schema.ts`, schema tests, and `schema.json`: add `fastModels` configuration and profile overlay support.
- `src/config/load.ts` and load/profile tests: expose `LoadConfigOptions`, preserve ordinary `loadConfig` semantics, add the OpenCode-plugin-only `loadOpenCodePluginConfig` facade over an internal descriptor/base-agent pipeline, and materialize qualified aliases only in that facade.
- `src/config/normalize.ts` or a focused adjacent module: scoped alias grammar, requirement-only profile resolution, and cycle detection.
- A focused routing module: pure fast-candidate and effective-chain transformation.
- A focused route-registry module: generation-safe atomic snapshots and snapshot IDs.
- `src/hooks/config.ts`: choose the final primary, build effective routes including compatibility aliases, and publish the registry.
- `src/hooks/chat-params.ts`, `src/routing/resolver.ts`, and runtime-fallback wiring: consume the shared requirement.
- `src/index.ts`: use the OpenCode-plugin load facade for initial load and reload, then own and inject the registry.
- `README.md`, `docs/architecture.md`, and relevant examples: document CLI/config/alias behavior.

Exact file decomposition may be refined in the implementation plan, but alias resolution, fast transformation, and route-registry ownership must remain separately testable units.

## Testing Strategy

### CLI

- `parseArgs(["--fast", "run", "x"])` enables fast and leaves only `run x` as passthrough.
- `parseArgs(["--", "--fast"])` does not enable fast and preserves the argument.
- Child environment contains `OCMM_FAST=1` only when enabled.
- Help text documents the flag and its Provider-policy dependency.

### Schema and profile loading

- Omitted and empty `providers` both parse as disabled.
- Valid mappings parse; malformed keys and empty values fail.
- Profile `providers` replaces the base array; mappings merge by key.
- Qualified alias integration through `loadOpenCodePluginConfig` resolves inline, user-directory, and project-directory profiles with current precedence.
- An invalid higher-precedence same-name profile shadows lower-precedence valid entries and fails only when active or referenced.
- Target profile view includes base agents plus the target overlay.
- Qualified multi-hop and qualified-to-unqualified chains resolve in the correct scope.
- The complete model requirement, including `requiresModel`, `requiresAnyModel`, and `requiresProvider`, crosses the profile boundary; no behavior fields do.
- Missing profile/agent, invalid referenced profile, and scoped cycles reject the full config.
- Invalid unreferenced inactive directory profiles remain inert.
- Ordinary `loadConfig({ host:"opencode" })` leaves an alias containing `:` unchanged and does not apply the OpenCode-plugin strict qualified-alias failure policy.

### Fast transformation

- Allowlisted automatic `A-fast` is selected only when catalog-confirmed.
- Explicit mapping wins and works without catalog visibility.
- Provider gating applies to both paths.
- Existing `-fast`, self-mapping, missing catalog candidate, and malformed selected identities are no-ops.
- Unqualified selected models preserve the baseline chain and never synthesize a provider-less fallback entry.
- Fast and original inherit entry metadata.
- The chain is exactly fast, original, then stable deduplicated remainder.
- Non-fast catalog successors and existing OpenCode primaries are still materialized at chain index 0.
- Catalog successors and previously registered OpenCode models are materialized correctly.

### Integration

- Built-in agent, configured agent, built-in category, and configured category routes all support fast promotion.
- Unmanaged OpenCode agents remain unchanged.
- Chat routing and runtime fallback read the same effective requirement snapshot.
- A retryable failure from a fast primary dispatches the original primary next.
- `explore` and other compatibility aliases receive a route matching their final merged model; `explore-fast` falls back to its original model.
- Initial plugin load and `reload()` both use the dedicated OpenCode-plugin config boundary; successful route publication replaces rather than accumulates routes, failed and stale builds retain the last successful snapshot, and changed snapshot IDs reset session fallback indexes.
- If a 429 timer or prepared switch is queued before a new route snapshot publishes, the stale target performs no dispatch or commit and its controller state is stopped.

### Final verification

Run, with ambient profile and fast variables isolated where relevant:

```powershell
pnpm run gen-schema
pnpm run typecheck
pnpm test
pnpm run build
```

Use an isolated fake OpenCode executable or equivalent fixture to prove the real shim surface removes `--fast`, sets `OCMM_FAST=1`, and leaves non-fast invocation unchanged. Exercise a runtime fallback scenario proving `provider/A-fast` fails into `provider/A` before any existing later fallback.

## Acceptance Criteria

1. `ocmm --fast` is consumed by the shim, sets the child opt-in, and is not passed to OpenCode.
2. No fast promotion occurs without an explicitly allowlisted Provider.
3. Explicit mappings are authoritative within the allowlist and automatic suffix candidates require catalog confirmation.
4. Every Provider-qualified final primary is materialized at chain index 0 even without fast mode; unqualified primaries preserve the baseline chain; every promoted route has the exact leading order `fast, original` with preserved metadata and stable remaining fallbacks.
5. Agents, categories, and compatibility aliases use the same behavior regardless of how their final primary was selected.
6. OpenCode registration, chat routing, and runtime fallback consume one final effective requirement snapshot with explicit success, failure, stale-build, and reload semantics.
7. `<profile>:<agent>` resolves the target profile's effective model requirement and imports no non-model behavior only when configuration is loaded through `loadOpenCodePluginConfig`; the OpenCode plugin uses that boundary for initial load and reload.
8. At the OpenCode-plugin load boundary, qualified alias errors reject the entire configuration under the default-config failure policy and invalid higher-precedence profile descriptors never fall through to lower-precedence entries. Ordinary `loadConfig`, including `host:"opencode"`, does not materialize qualified aliases and retains its existing behavior.
9. Codex-specific implementation and generated artifacts remain outside this feature's scope; `src/codex/plugin-generator.ts` is unchanged, and its ordinary `loadConfig` fallback to the OpenCode host layout does not activate the feature.
10. Schema, documentation, focused tests, full tests, typecheck, and build are synchronized and pass.
