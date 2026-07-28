# Model Chain and Opus 5 Calibration Design

## Status

Approved. This is subproject 3 of the user-authorized five-item synchronization. It is the authoritative design for the model-chain refresh and the Claude Opus 5 prompt calibration only.

## Context

The built-in static fallback chains in `src/data/agents.ts` and `src/data/categories.ts` still name Claude Opus 4.7, Kimi K2.6 or K2P5, and GPT-5.5. Runtime catalog selection can promote some GPT entries, but it is conditional on a provider catalog and cannot improve an offline or no-catalog startup. The existing catalog logic already assigns GPT Sol and Terra lanes and preserves Oracle's exact cross-generation preference.

Prompt composition already loads model-family deepwork files from `prompts/{omo,v1,codex}/deepwork`, combines them with role or category prompts in `src/hooks/config.ts`, and produces the Codex bundle through `src/codex/plugin-generator.ts`. It currently has a GPT-5.6 ahead-of-runtime layer for Codex.

The working tree intentionally contains the eleven subproject 1 and 2 paths recorded by the requester: seven tracked code/test files and four untracked specs/plans. They are concurrent work and remain untouched. This specification adds one file only. Subprojects 4 and 5 are outside this design.

## Goals

- Make locally usable, static defaults prefer Claude Opus 5, Kimi K3, and the assigned GPT-5.6 lane while retaining every prior fallback.
- Preserve local provider aliases, existing order where the new adjacent entry does not require a move, variants, and tuning fields.
- Add a small Opus 5 execution calibration for the orchestrator without replacing role prompts, workflow rules, authorization, or terminal policies.
- Keep explicit agent/category configuration, aliases, host-selected models, and catalog availability ahead of built-in static defaults.
- Cover the selection, composition, and static-chain invariants with focused tests, then synchronize generated Codex artifacts and prompt-maintenance records.

## Non-goals

- No nearest-parent lookup, unified configuration, migration, resolver-precedence change, or provider-alias change.
- No wholesale copy of upstream provider inventories, upstream branding, automatic Git writes, or implicit package installation.
- No `ModelFamily` enum expansion or variant-translator behavior change. Opus 5 remains in `claude-opus-47-plus` for reasoning translation.
- No retiering to upstream `medium`, `low`, or `max` values. New entries retain the old entry's local variant and tuning.
- No forced target-model insertion into `quick`, `doc-search`, or `code-search` when those chains do not already carry the corresponding legacy model.
- No Opus 5 calibration attached to categories, non-orchestrator functional agents, or project 1/2 files.

## Approaches

### A. Replace chains and providers wholesale from upstream

Rejected. This would import providers that are not local defaults, including `vercel`, `opencode`, `moonshotai`, and `opencode-go`, reorder local choices, and blur the distinction between a local fallback contract and an upstream catalog.

### B. Insert modern local entries beside their legacy counterparts

Selected. Add each modern identity immediately before its existing counterpart, copying the counterpart's providers, variant, and tuning. Kimi K3 is inserted once before the first older Kimi entry in each chain. This gives static availability a current local preference while preserving the prior fallback sequence and the resolver's established precedence.

### C. Depend only on catalog upgrades

Rejected. Catalog upgrades do not cover offline, absent-catalog, or provider-limited startup. They are an enhancement over a static chain, not a substitute for one.

## Architecture

The implementation has four bounded responsibilities:

1. `src/data/agents.ts` and `src/data/categories.ts` define the static baseline chains.
2. `src/intent/model-family.ts` identifies the narrowly named Opus 5 model without changing broad family classification.
3. `src/intent/prompt-loader.ts` inventories and selects the Opus 5 additive variant, after the planner override and only for the orchestrator prompt identity.
4. `src/hooks/config.ts` composes the effective prompt. OpenCode workflows add the specialization only to an Opus 5 orchestrator. Codex carries the guarded layer only in the generated orchestrator profile because runtime model selection can happen after generation.

`src/routing/model-upgrades.ts` remains the runtime catalog-upgrade authority. Static defaults and catalog promotion complement each other: the former works without a catalog, while the latter may select an available newer lane. Resolver ordering remains explicit configuration, alias/effective requirement resolution, catalog promotion where already permitted, then the static fallback head.

## Exact Model-Chain Policy

### Provider boundary

New static entries use only the aliases already present in this repository:

| Model family | Providers |
| --- | --- |
| Anthropic | `["anthropic"]` |
| OpenAI | `["openai", "github-copilot"]` |
| Kimi | `["kimi-for-coding", "moonshot"]` |

The table expresses the required provider arrays as TypeScript literals. No other upstream provider name is introduced.

### Claude Opus 5 insertion

For every existing `{ model: "claude-opus-4-7" }` entry in either built-in catalog, insert one immediately preceding `{ model: "claude-opus-5" }` entry. Copy the source entry's `providers`, `variant`, and every present tuning field. Keep the Opus 4.7 entry in place after the inserted entry.

### Kimi K3 insertion

For each chain that contains `kimi-k2.6` or `k2p5`, insert exactly one `{ providers: ["kimi-for-coding", "moonshot"], model: "kimi-k3" }` before that chain's first older Kimi entry. Keep all older Kimi entries in their original order. A chain may never contain two K3 entries.

### GPT-5.6 insertion and lane policy

For each existing GPT-5.5 entry, add an immediately preceding GPT-5.6 entry with the same OpenAI provider array, variant, and tuning. The required identities are:

| Lane | Built-ins that receive it |
| --- | --- |
| Sol, `gpt-5.6-sol` | `orchestrator`, `builder`, `reviewer`, `oracle-2nd`, `planner`, `clarifier`, `plan-critic`, `media-reader`, `frontend`, `creative`, `hard-reasoning`, `research`, `coding`, `deep` |
| Terra, `gpt-5.6-terra` | `oracle`, `normal-task`, `complex` |

`oracle` already has `gpt-5.6-terra`. Do not add a duplicate. Move that existing entry to immediately before its GPT-5.5 entry while leaving the preceding Opus, Gemini, and GPT-5.4 entries in their existing order. The Oracle catalog selector skips lane entries during its exact cross-generation scan, so exact GPT-5.4 and GPT-5.5 catalog matches continue to win even though Terra is adjacent before GPT-5.5 in the static chain. GPT-5.5 remains available after the modern entry in every affected chain.

## Opus 5 Prompt Composition and Data Flow

### Source files and content

Add `claude-opus-5.md` in each source directory:

- `prompts/omo/deepwork/claude-opus-5.md`
- `prompts/v1/deepwork/claude-opus-5.md`
- `prompts/codex/deepwork/claude-opus-5.md`

Each file is an additive calibration of roughly 15 to 30 lines. The omo file may be plain additive text. The v1 and Codex files use the existing `<deepwork-mode>` envelope. They do not contain a complete role prompt, Sisyphus branding, or a replacement for locally authoritative workflow instructions.

The shared calibration has four precise directions:

1. Deliver the requested scope, neither silently expanding it nor omitting required parts.
2. Use direct tools when a few calls can complete the work. Dispatch only for a matching specialist domain or an independent, sizeable work track. Do not dispatch an agent to review the same work just completed by the parent.
3. Run each evidence gate once while its inputs are unchanged. Preserve any required final review and required evidence.
4. Start with one sentence, remain quiet between tool calls, and finish with a short outcome-first report.

The Codex source begins with an applicability guard: only `claude-opus-5` models apply this layer; all other runtime models ignore it. This permits ahead-of-runtime carriage without assigning Opus 5 behavior to another model.

### Detector and variant selection

`isClaudeOpus5Model(modelID: string): boolean` is an exported exact detector in `src/intent/model-family.ts`. It first uses `extractModelName`, so both `claude-opus-5` and `anthropic/claude-opus-5` work. Its accepted normalized-name grammar is `/^claude-opus-5(?:$|[-.](?:20\d{6}(?:[-.][a-z0-9]+)*|[a-z][a-z0-9-]*))$/i`: the exact name, a date snapshot, or a named snapshot after `-` or `.`. It rejects a different major/minor identity such as `claude-opus-4-8`, `claude-opus-5.0`, `claude-opus-50`, `claude-sonnet-5`, and arbitrary strings containing the text. This prevents semantic-version lookalikes from receiving the Opus 5 specialization.

`DeepworkVariant` gains `claude-opus-5`, and `DEEPWORK_VARIANTS` loads it for all three workflows. `pickDeepworkVariantForAgent()` keeps planner precedence first. It returns `claude-opus-5` only when the prompt source or agent identity resolves to `orchestrator` and the selected model passes `isClaudeOpus5Model`. All other Opus 5 roles remain on their existing default or role-prompt path.

### Effective composition

For omo and v1, `deepworkPromptForAgent()` composes `default + claude-opus-5` exactly once for the Opus 5 orchestrator. The existing GPT base plus GPT-5.6 specialization composition remains unchanged. A planner always receives its planner prompt, even if its selected model is Opus 5.

For Codex, retain the existing GPT and GPT-5.6 ahead-of-runtime behavior. Append the guarded Opus 5 layer only to the Codex orchestrator profile, not builders, reviewers, planners, categories, or generated aliases. Category composition remains role prompt plus the existing guarded GPT-5.6 layer only. Role prompts, local workflow rules, authorization, the delegation contract, required evidence, and final acceptance remain authoritative over the additive layer.

## Files and Ownership

| File or area | Change |
| --- | --- |
| `src/data/agents.ts` | Adjacent static fallback insertions and the Oracle Terra relocation without duplication. |
| `src/data/categories.ts` | Adjacent static fallback insertions where a matching legacy entry exists. |
| `src/data/model-requirements.test.ts` | New focused static-chain contract tests. |
| `src/intent/model-family.ts` and `.test.ts` | Exact exported Opus 5 detector, with broad family behavior unchanged. |
| `src/intent/prompt-loader.ts` and `.test.ts` | Variant inventory/loading and planner-first, orchestrator-only selection. |
| `src/hooks/config.ts`, `.test.ts`, and `.category.test.ts` | OpenCode and Codex effective-prompt composition, exclusions, and exact-once assertions. |
| `src/codex/plugin-generator.test.ts` | Generated orchestrator's guarded Opus 5 carriage and non-orchestrator exclusion. |
| `prompts/{omo,v1,codex}/deepwork/claude-opus-5.md` | Compact additive calibration sources. |
| `docs/prompt-sync.md` and `docs/v1-maintenance.md` | Prompt inventory, source mapping, envelope, guard, and maintenance synchronization. |
| `.agents/plugins/marketplace.json`, `.codex/agents`, `plugins/deepwork` | Generated only through the existing generator, and included only if the generator changes them. |

Production code in `src/routing/model-upgrades.ts`, resolver precedence, provider alias configuration, and schema generation are not modified. If a test fixture must reflect the new static head, update the fixture only; do not change production catalog-upgrade behavior.

## Error and Fallback Behavior

Missing prompt sources remain tolerated by the existing loader and log a debug message. A missing Opus 5 file therefore does not break startup, but the targeted source inventory test prevents an intended release from silently omitting it.

If Opus 5, K3, or GPT-5.6 is unavailable, normal fallback proceeds to the retained legacy adjacent entry and then to the remaining chain. Provider availability does not cause a foreign provider to be synthesized. An explicit model, requirement, alias-derived requirement, or host-owned model retains its existing priority. Catalog promotion can still choose an eligible newer model under its current rules, including Oracle's exact cross-generation preference.

## Testing and Quality Assurance

### Detector and loader tests

- Test exact and provider-prefixed Opus 5 names plus accepted hyphen/dot snapshot forms.
- Test rejection of Opus 4.8, Opus 5.0-like, Opus 50, non-Opus Claude, and unrelated names.
- Verify `classifyModelFamily()` still returns `claude-opus-47-plus` for Opus 5 and variant translation is unchanged.
- Verify the three-source variant inventory/count, v1/Codex envelopes, and the Codex guard.
- Verify planner precedence and orchestrator-only selection, including prompt-source identities for generated profiles.

### Static-chain contract tests

The focused data test iterates every built-in agent and category chain. It asserts that each old Opus 4.7 and GPT-5.5 entry has exactly one immediately preceding required modern counterpart with identical providers, variant, and tuning; every Kimi-bearing chain has exactly one K3 before its first older Kimi entry; legacy entries remain; and no chain duplicates a modern identity. It separately verifies the required Sol/Terra assignment, Oracle's single Terra entry, and preserved cross-generation order. Existing explicit-config, alias, and catalog-precedence tests must continue to pass.

### Prompt and generated-surface tests

- Assert OpenCode's effective Opus 5 orchestrator prompt contains `default` and the Opus 5 calibration exactly once.
- Assert non-orchestrator functional agents and every category exclude the Opus 5 calibration, including when their selected model is Opus 5.
- Assert Codex's generated orchestrator carries the guarded Opus 5 source, while all other generated profiles and categories do not.
- Preserve the existing GPT-5.6 guard and ahead-of-runtime behavior in every currently covered Codex path.

### Commands and runtime surface

Run focused Node tests for the changed data, detector, loader, config/category composition, and Codex generator; then run `pnpm run typecheck`, the full test suite, `pnpm run build:ts`, and `pnpm run gen:codex-plugin`. Run generation twice and compare the second result to confirm it is stable. Inspect the generated diff and include only actual generator output under the three declared generated roots.

Run one isolated OpenCode configuration surface check with a credential-free custom catalog. It must show an Opus 5 orchestrator selection and the prompt marker through `oc debug agent orchestrator` or an equivalent plugin configuration surface. The check must use isolated state/config directories, must not install software, and must not stop any user process. When command examples are needed in implementation records, provide both Bash and PowerShell forms.

The final implementation review is a complex cross-module review and uses both the configured Oracle and Reviewer after the implementation diff exists.

## Documentation and Generated Synchronization

Adding an omo prompt updates `docs/prompt-sync.md`. Adding the v1 prompt updates `docs/v1-maintenance.md`. Both records must identify the Opus 5 layer as additive, orchestrator-only, and subordinate to existing authority layers. The Codex record must state that the guard permits orchestrator-only ahead-of-runtime carriage.

Generated files are never hand-edited. `pnpm run build:ts` precedes `pnpm run gen:codex-plugin`; tracked changes are accepted only when they are a deterministic consequence of the source changes. No schema regeneration is needed because this design does not change the configuration schema.

## Acceptance Criteria

1. The only new subproject 3 artifact at this stage is this specification. Project 1/2 dirty paths remain byte-for-byte untouched, and project 4/5 work is absent.
2. All specified static fallback insertions, retention rules, provider arrays, lane assignments, and Oracle ordering invariants hold.
3. Opus 5 detector matching is exact, exported, provider-prefix aware, snapshot-aware, and rejects the defined lookalikes.
4. Opus 5 remains in `claude-opus-47-plus`; no variant-translator, resolver-precedence, provider-alias, or catalog-upgrade algorithm change is made.
5. The three calibration files are short, additive, locally named, synchronized in intent, and preserve the required authority boundaries.
6. OpenCode composes the Opus 5 layer once for the orchestrator only. Codex carries its guarded layer for the orchestrator only. Categories and other roles exclude it.
7. Targeted tests, typecheck, full suite, TypeScript build, deterministic generator run, and isolated runtime surface check pass with their evidence recorded.
8. Prompt-maintenance documents and only actual generated artifact deltas are synchronized. No Git staging, commit, push, tag, automatic installation, or user-process termination occurs.

## Spec Self-review

Placeholder scan passed: the document contains no unresolved implementation marker. Internal consistency passed: static defaults, runtime catalog upgrades, and prompt composition have separate stated responsibilities. Scope passed: this is one bounded model-chain and calibration implementation plan. Ambiguity passed: detector boundaries, insertion order, lane ownership, Codex carriage, exclusions, evidence gates, and concurrent-work boundaries are explicit.
