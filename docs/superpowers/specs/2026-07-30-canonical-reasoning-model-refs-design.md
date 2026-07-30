# Canonical Reasoning Model References Design

## Status

Approved through the user's full-session autonomous implementation delegation. This specification is authoritative for the canonical reasoning and model-suffix compatibility change. It is intentionally uncommitted because Git writes require separate explicit permission.

## Context

ocmm currently represents model inference intent through three overlapping surfaces:

- `Variant` on `ModelRequirement` and `FallbackEntry` drives family-specific translation in `chat.params`.
- `reasoningEffort` is a concrete entry or agent override applied after variant translation.
- model strings identify only `provider/model`; they cannot carry an inference level.

The pulled OMO upstream added a canonical reasoning vocabulary, `provider/model:level` references, and final-model lowering. ocmm already has a stronger local family translator, route snapshots, review floors, and snapshot-safe runtime fallback. The correct adaptation is therefore to add a canonical input to those mechanisms rather than copy the upstream runtime or replace local policy.

## Goals

- Add canonical `reasoning` values `off|minimal|low|medium|high|xhigh|max|auto` to agent, category, requirement, and fallback-entry configuration.
- Accept the deprecated input alias `none` for `reasoning` and normalize it to `off` before routing.
- Parse known canonical suffixes such as `openai/gpt-5.6-sol:high` without corrupting model IDs that legitimately contain a colon.
- Preserve legacy `variant`, `reasoningEffort`, `thinking`, logical-tier, review-floor, fast-route, and runtime-fallback behavior.
- Lower canonical reasoning once at `chat.params`, using the actual provider/model selected for that call.
- Make cross-family fallback recalculate provider parameters instead of carrying parameters lowered for the failed model.
- Expose canonical reasoning in the resolution ledger for diagnostics.

## Non-goals

- No `models[]` configuration surface or model-catalog redesign.
- No arbitrary custom canonical reasoning passthrough. Custom host profiles continue to use host-provided variants; ocmm configuration remains schema-validated.
- No removal or deprecation enforcement for `variant`, `reasoningEffort`, or `thinking`.
- No category availability/dead-chain gating, task validation, provider-chain changes, or Senpi runtime code.
- No model-capability database. Existing local family detection and translation remain the capability boundary.
- No prompt, agent-role, category-default, release-flow, or asynchronous-QA changes.

## Approaches

### A. Compatibility-first dual-track normalization

Selected. Add canonical `reasoning` alongside legacy fields, normalize only at the configuration boundary, preserve it through effective routes and runtime fallback, and translate it in `chat.params`. This delivers the new contract while keeping existing configuration and local policy stable.

### B. Replace `variant` and `reasoningEffort`

Rejected. Logical tiers, built-in chains, request-local variants, review floors, and user configurations all depend on the existing fields. A forced migration would create unnecessary breakage and broaden this work into a release migration.

### C. Parse suffixes only

Rejected. A suffix-only patch would write back into the legacy variant track and leave `variant`/`reasoningEffort` ambiguity unresolved. It would also fail to define the distinct `off` and `auto` semantics.

## Data Model

`src/shared/types.ts` gains:

```ts
type ReasoningLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
type Reasoning = ReasoningLevel | "auto"
```

`FallbackEntry` and `ModelRequirement` gain `reasoning?: Reasoning`. `Resolution` carries the selected canonical reasoning separately from legacy `variant`. `ResolutionEntry.applied` gains `reasoning?: Reasoning` so logs distinguish canonical selection from the resulting provider parameter.

The existing `Variant` type remains unchanged, including `none`, `auto`, and `thinking`. This deliberately preserves legacy semantics: `variant: "none"` remains a no-op, while canonical `reasoning: "off"` actively disables reasoning where the model family exposes a control.

## Configuration and Normalization

`src/config/schema.ts` adds a canonical reasoning input enum containing the canonical values plus the deprecated `none` alias. It is accepted in:

- agent/category shorthand;
- `ModelRequirementSchema`;
- `FallbackEntrySchema`.

Normalization converts `none` to `off` and ensures no routing structure contains the alias. Existing schema-tolerant parsing remains responsible for pruning malformed values.

### Model suffix parsing

A focused shared reasoning module owns normalization and suffix splitting. It recognizes only canonical values and `auto`; `:none` and unknown suffixes remain part of the model ID.

- `openai/gpt-5.6-sol:high` becomes model `openai/gpt-5.6-sol`, reasoning `high`.
- `gpt-5.6-sol:high` also parses because `high` is unambiguous.
- bare `gpt-5.6-sol:max` remains unchanged because `:max` may be a real model-ID ending.
- provider-prefixed `openai/gpt-5.6-sol:max` parses.
- a fallback object with explicit `providers` may parse its model's `:max`, because provider context removes the ambiguity.
- unknown `provider/model:custom` remains model `model:custom`.

An explicit `reasoning` field wins over a suffix on the same primary or object entry. A suffix supplies only a missing entry-level value. The existing primary `variant` argument and requirement-level legacy variant remain untouched.

## Resolution Precedence

For a matched model entry, resolution uses this order:

1. valid runtime `message.variant`;
2. entry canonical `reasoning`;
3. requirement canonical `reasoning`;
4. entry legacy `variant`;
5. requirement legacy `variant`.

A runtime variant suppresses canonical reasoning for that request because the host/user made a request-local selection. Entry canonical reasoning is more specific than requirement canonical reasoning. Canonical reasoning is preferred over legacy variant when both exist.

Concrete entry controls remain final overrides after translation:

1. canonical reasoning or legacy variant is translated;
2. `reasoningEffort` may replace the translated effort;
3. `thinking`, `temperature`, `topP`, and `maxTokens` apply through their existing paths;
4. fast options and protected review floors retain their current final authority.

## Final-model Lowering

Provider-specific lowering remains in `src/hooks/chat-params.ts`, after route resolution and model-family classification. A new `translateReasoning` path handles canonical semantics:

- `auto`: no provider parameter unless a protected review floor raises it.
- `off`: GPT/Codex/DeepSeek receive `reasoningEffort: "none"`; ordinary Claude receives disabled thinking; protected Claude Opus 4.7+ receives no reasoning override under the existing local policy; Gemini/GLM receive disabled thinking plus `reasoningEffort: "none"`; generic temperature-only families receive no override.
- `minimal` through `max`: use the existing variant translator and model-specific max cap.

Built-in canonical levels retain existing non-user minimum normalization, including raising `off` where the equivalent legacy `none` is already raised by local model-family policy. Canonical `auto` remains a no-op. Explicit user configuration bypasses the minimum exactly as explicit legacy variants do. Protected planning/review identities still receive the xhigh-equivalent floor, which may replace a lower canonical level.

The ledger records the effective canonical reasoning after normalization/flooring and the final concrete options. Legacy-only routes continue recording only `applied.variant` and concrete options.

## Runtime Fallback

Effective route snapshots retain canonical reasoning without lowering it. `applyRequirementDefaults()` supplies a missing entry-level canonical default before supplying a legacy variant default.

The fallback dispatcher continues to send the selected provider/model and legacy request fields understood by OpenCode. It does not invent a `reasoning` request-body field. The subsequent `chat.params` call resolves the selected entry from the immutable route snapshot and lowers canonical reasoning against the new actual model. This preserves snapshot fencing and prevents a GPT effort from being reused for Claude, Gemini, or another family.

## Error and Compatibility Behavior

- Unknown or ambiguous suffixes are preserved as model IDs rather than rejected.
- Invalid `reasoning` configuration is handled by the existing tolerant schema boundary; valid sibling fields survive according to current behavior.
- Existing configs with only `variant` or concrete tuning produce byte-for-byte equivalent routing effects.
- A requirement object is normalized recursively instead of cast directly, so `none` aliases and model suffixes cannot leak into runtime types.
- Alias resolution, logical-tier materialization, effective-route cloning, successor matching, and route snapshot immutability continue to operate on the expanded structures.

## Files and Ownership

| Area | Responsibility |
| --- | --- |
| `src/shared/reasoning.ts` and tests | Canonical vocabulary, alias normalization, suffix splitting, and canonical-to-legacy bridge helpers. |
| `src/shared/types.ts` | Canonical reasoning types and route/ledger fields. |
| `src/config/schema.ts`, `schema.json` | New accepted configuration fields and generated editor schema. |
| `src/config/normalize.ts` and tests | Recursive normalization, suffix handling, explicit-field precedence, and legacy preservation. |
| `src/routing/resolver.ts` and tests | Canonical selection precedence and request-local override. |
| `src/routing/variant-translator.ts` and tests | Canonical family effects for `off`, `auto`, and the existing ladder. |
| `src/hooks/chat-params.ts` and tests | Final-model lowering, review floor integration, concrete override order, and ledger evidence. |
| `src/routing/effective-route.ts` and tests | Preserve requirement canonical defaults when synthesizing a selected primary. |
| `src/runtime-fallback/event-handler-support.ts`, dispatcher tests, and fallback tests | Preserve canonical defaults and prove cross-family re-resolution without unsupported body fields. |

No prompt-maintenance document changes are required because no file under `prompts/omo`, `prompts/v1`, or `skills/v1` changes.

## Testing and QA

### Focused contracts

- Normalize explicit `reasoning`, deprecated `none`, primary/fallback suffixes, object-entry suffixes, explicit-field precedence, unknown suffixes, and bare `:max` ambiguity.
- Resolve entry vs requirement reasoning and runtime variant precedence.
- Translate `off`, `auto`, normal levels, unsupported GPT `max`, explicit user levels, and protected review floors.
- Prove a GPT primary and Claude/Gemini fallback each receive family-correct output on separate `chat.params` calls.
- Prove fallback dispatch does not emit unsupported canonical fields and legacy `variant`/`reasoningEffort` passthrough remains unchanged.
- Verify synthesized effective primaries retain requirement reasoning.
- Regenerate and inspect `schema.json`.

### Repository gates

Run targeted Node tests, `pnpm run gen-schema`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build`. Run LSP diagnostics on every changed TypeScript file when the configured server is available. If `typescript-language-server` is unavailable, do not install it; use the repository's installed TypeScript Compiler API to collect syntactic and semantic diagnostics for the complete changed-file list, and retain that exact zero-diagnostic receipt alongside the repository typecheck.

### Real surface

Build the plugin and use an isolated XDG OpenCode sandbox. Load a configuration containing a canonical reasoning field and suffixed model reference, then inspect the resolved agent/config surface with OpenCode debug commands. Record command output under the approved OS temporary directory, clean the sandbox, and do not install software or touch user configuration.

## Acceptance Criteria

1. Canonical reasoning and model suffixes are accepted at every declared configuration boundary and normalized into one runtime representation.
2. `none` input becomes canonical `off`; `off` and `auto` have their specified semantics without changing legacy `variant: none|auto` behavior.
3. Ambiguous or unknown suffixes remain model IDs; provider-prefixed and provider-context `:max` parse safely.
4. Runtime variant, entry/requirement reasoning, and legacy variant precedence matches this specification.
5. Provider-specific lowering occurs only in `chat.params` using the current actual model, and cross-family fallback does not reuse stale parameters.
6. Concrete tuning overrides, fast options, review floors, route snapshots, aliases, and logical-tier behavior remain compatible.
7. `schema.json`, targeted tests, typecheck, full tests, build, per-file diagnostics through LSP or the specified TypeScript Compiler API fallback, and isolated OpenCode surface verification pass.
8. No `models[]`, provider-chain, prompt, task, Senpi, daemon, release, or unrelated refactor enters the diff.
9. No Git staging, commit, push, tag, package installation, or user-process termination occurs.

## Spec Self-review

Placeholder scan passed: no incomplete marker remains. Internal consistency passed: canonical reasoning is preserved until the one provider-lowering boundary, while legacy fields retain their current path. Scope passed: the design is one configuration-to-runtime behavior change with bounded schema, routing, fallback, and evidence surfaces. Ambiguity passed: vocabulary, suffix rules, precedence, override order, `off`/`auto` behavior, fallback handling, non-goals, and acceptance gates are explicit.
