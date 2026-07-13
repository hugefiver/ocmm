# Model Calibration Review Fixes Design

## Goal

Repair the confirmed `v0.5.0..v0.5.1` review findings without changing explicit model choice semantics, and make one effective runtime model drive prompt calibration, parameter routing, and fallback behavior. GPT-family `reviewer` and `oracle` work must use at least `xhigh` reasoning; complex or high-risk work may retain the local `max` task variant, translated to the highest effort accepted by the target GPT/Codex surface.

## Confirmed Findings

The combined reports are technically valid:

- A description-only `oracle` entry can lose its inherited `reviewer` requirement when catalog promotion runs afterward.
- Equal-version catalog candidates use alphabetical provider order instead of the requirement's priority order.
- Catalog promotion accepts pre-5.6 Sol/Terra names even though the policy requires preserving defaults without GPT-5.6 or newer.
- A catalog successor is registered outside the static fallback chain, so runtime routing can use the wrong entry and fallback traversal can skip the chain head.
- Existing host `agent.<name>.model` values are preserved but not used for GPT-5.6 prompt selection.
- Category agents and generated Codex category profiles do not receive the guarded GPT-5.6 calibration.
- GPT reviewer/oracle defaults and runtime normalization can remain at `high`, below the requested floor.
- The v1/prompt maintenance rows, prompt layout example, frontend section count, and primitive-showcase wording are inconsistent with the changed artifacts.

## Approaches Considered

### A. Patch each call site independently

Add local conditions in `config.ts`, `resolver.ts`, `chat-params.ts`, and the fallback handler. This is the smallest textual diff, but it repeats GPT/GLM version parsing and makes the four surfaces drift again.

### B. Shared model-upgrade policy plus a registered-model map — selected

Create a small pure routing module that owns GPT lane parsing, the 5.6 floor, provider-priority catalog selection, and successor matching. The config hook records each final registered model in a shared map. Runtime routing reuses the successor matcher, while fallback initialization uses the registered model (or the event model) to choose the correct starting index.

This keeps user model selection, prompt selection, chat parameters, and fallback state aligned without mutating the user-facing ocmm schema.

### C. Rewrite effective models into `OcmmConfig`

Materialize catalog models into `cfg.agents` so existing runtime code sees them. This couples host catalog state to persisted configuration, risks overwriting explicit configuration, and would require schema/generated-schema changes. It is rejected.

## Architecture

### Shared upgrade policy

`src/routing/model-upgrades.ts` will expose pure helpers:

- select a catalog model only when a matching GPT Sol/Terra model is at least 5.6, or a matching GLM successor is at least 5.2;
- preserve provider order from the compatible fallback entry;
- synthesize a runtime `FallbackEntry` for a supported successor while retaining the baseline entry's variant and inference controls.

### Effective model registration

The config hook will determine the final model in this order:

1. existing host `agent.<name>.model`;
2. explicit or inherited ocmm requirement;
3. eligible catalog promotion;
4. built-in requirement head.

The same final model will select prompt calibration and populate a shared `registeredAgentModels` map. Injected `defaultAlias` requirements count as explicit effective requirements and therefore suppress catalog promotion.

### Runtime routing and fallback

`resolveModelRouting` will expose one alias-aware effective-requirement resolver shared with runtime fallback, and will treat compatible GPT/GLM successors as matches instead of falling back to an unrelated chain head. Runtime fallback state will start at the actual failed model's exact chain index; matching checks every provider in an entry, not only `providers[0]`. An actual catalog/raw model outside the static chain starts at `-1`, so fallback index 0 remains eligible.

### Reviewer/oracle reasoning policy

For GPT and Codex families:

- `reviewer` and `oracle` default GPT entries use variant `xhigh`;
- chat parameter routing raises absent or lower variants/efforts to `xhigh` after all overrides;
- local `max` remains `max` in routing/ledger semantics and translates to the highest provider-supported GPT effort (`xhigh` for the current GPT/Codex translator);
- an explicit `reasoningEffort: "max"` remains `max` rather than being lowered.

Model choice remains user-controlled; only the reasoning floor for these review roles is enforced.

### Prompt and generated artifacts

Functional agents use their final selected model for prompt specialization. Category agents keep their authoritative category prompt and receive only the additive, guarded GPT-5.6 layer. Codex generation always carries that guarded layer because dispatch-time overrides are not known at packaging time.

The generator remains the source of truth for `.codex/agents` and `plugins/deepwork`.

### Documentation repair

- Update v1 source-mapping rows for the receipt and optional-oracle changes.
- Add `gpt-5.6` to the prompt layout example.
- Describe reviewer/oracle GPT reasoning as `xhigh` minimum with `max` task-level escalation.
- Correct the frontend template to nine sections.
- Separate planned showcase primitives from reusable component documentation.

## Error Handling and Compatibility

- Unknown/custom models continue to use existing fallback behavior.
- Explicit model strings and aliases are never catalog-overridden.
- Existing callers that do not provide a registered-model map retain the old fallback default.
- No configuration schema change is required.

## Verification

- Failing-first tests for alias/catalog interaction, provider priority, pre-5.6 rejection, host-model calibration, category calibration, successor routing, fallback index selection, and reviewer/oracle reasoning floor.
- Generator tests asserting all category profiles contain the guarded calibration and reviewer/oracle profiles use `xhigh`.
- Contract tests for v1/prompt/frontend documentation.
- `pnpm run typecheck`, `pnpm test`, `pnpm run build`, generated-bundle cleanliness, and final independent reviewer/oracle inspection.

## Self-Review

- Placeholder scan: no placeholders or deferred decisions.
- Internal consistency: one effective model drives all four runtime surfaces; no schema mutation is proposed.
- Scope: limited to confirmed 0.5.1 review findings and the requested reviewer/oracle reasoning policy.
- Ambiguity: `max` is explicitly defined as a task-level variant that maps to the highest effort supported by the GPT/Codex target, resolving the xhigh/max wording without inventing an unsupported API value.
