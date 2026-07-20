# Codex Prompt Policy Design

## Status

Approved for planning by an unambiguous self-review. The user supplied the required design constraints, requested this standalone specification and implementation plan, and explicitly excluded implementation, installation, and Git writes from this session.

## Problem

The three Codex-family deepwork prompts currently require a full test suite and every criterion scenario after each increment:

- `prompts/v1/deepwork/codex.md`
- `prompts/omo/deepwork/codex.md`
- `prompts/codex/deepwork/codex.md`

That cadence repeats unchanged verification and conflicts with the repository's newer changed-input validation principle. The same prompts also describe delegated work with environment-local envelope fields but do not require the observable `GOAL`, `STOP WHEN`, and `EVIDENCE` contract or explicitly distinguish a child's stopping condition from completion of the parent run.

This is a prompt-policy change, not a Codex runtime compatibility change. `src/codex/plugin-generator.ts` separately owns MultiAgent V1/V2 compatibility and generated-agent routing. Its existing behavior and API must not change.

## Repository Findings

1. All three `deepwork/codex.md` sources contain the same broad verification requirements at the end of the `PIN → RED → GREEN → SURFACE → CLEAN` loop.
2. v1 and Codex already use per-child completion/integration checks followed by a final acceptance review. The omo source retains its stricter unconditional final verification gate. This change preserves each environment's final review authority rather than redesigning review composition.
3. The environment-local delegation fields are currently `TASK`, `EXPECTED OUTCOME`, `REQUIRED TOOLS`, `MUST DO`, `MUST NOT DO`, and `CONTEXT`. They must remain and gain `GOAL`, `STOP WHEN`, and `EVIDENCE`.
4. `src/hooks/config.ts:371-426` shows that generated Codex profiles use `gpt.md` plus the additive GPT-5.6 calibration for functional agents, and category prompts plus that calibration for categories. `prompts/codex/deepwork/codex.md` is not injected into the current generated `dw-*` bundle.
5. Therefore a source-only Codex prompt policy refresh should regenerate to no tracked bundle delta. Changing `src/codex/plugin-generator.ts` to force propagation would conflate prompt policy with runtime V1/V2 routing and is out of scope.
6. `src/codex/plugin-generator.test.ts` already pins exact-profile, direct-composition, generic/flat dispatch, V1/V2 tool names, and the generated local envelope `TASK, ROLE, DELIVERABLE, SCOPE, VERIFY, REQUIRED SKILLS, CONTEXT, CONSTRAINTS`. Those tests are regression evidence and remain unchanged; implementation evidence that contradicts finding 4 blocks this plan and requires a revised design.
7. Repository maintenance rules require every `prompts/v1/**` change to update `docs/v1-maintenance.md` and every `prompts/omo/**` behavior change to update `docs/prompt-sync.md` in the same commit.

## Goals

- Run only changed/touched tests and affected scenarios after each increment.
- Re-run a broader suite, typecheck, or build only after relevant inputs have changed since its last green result.
- Run one appropriate full integrated pass before the final user-visible message.
- Preserve complete RED/GREEN/SURFACE/CLEAN evidence for complex work and preserve the existing final acceptance authority.
- Preserve every environment-local delegation field and add `GOAL`, `STOP WHEN`, and `EVIDENCE`.
- Require the parent to verify returned evidence instead of trusting a completion claim.
- State that delegated `STOP WHEN` terminates only the bounded child assignment; the parent run ends only when the entire user goal and required verification are complete.
- Keep the GPT-5.6 specialization files unchanged.
- Keep runtime MultiAgent V1/V2 compatibility and `src/codex/plugin-generator.ts` unchanged.
- Deliver the complete source, tests, synchronization records, specification, and plan as exactly one eventual semantic commit.

## Non-Goals

- No changes to `prompts/{v1,omo,codex}/deepwork/gpt-5.6.md`.
- No changes to `src/hooks/config.ts`, `src/intent/prompt-loader.ts`, `src/codex/plugin-generator.ts`, runtime tool schemas, model routing, profile selection, configuration schema, or generated-agent compatibility fallbacks.
- No new runtime-only API or prompt assembly branch.
- No redesign of LIGHT/HEAVY classification, success-criteria sizing, cleanup receipts, review-role selection, or final acceptance.
- No unrelated prompt cleanup, wording normalization, or style-only expansion.
- No hand-editing generated files.
- No software installation, commit, push, tag, or other Git write in this planning session.

## Approaches Considered

### 1. Refresh the three source prompts and prove generated non-interference — selected

Update the shared validation loop, delegation reliability section, and parent stop rule in the three `codex.md` sources. Add source-level RED/GREEN assertions to `src/intent/prompt-loader.test.ts`, retain the existing generator compatibility test as a characterization gate, regenerate through the existing command, and require no tracked generated-bundle delta.

This is the smallest change that satisfies the requested policy while preserving runtime ownership boundaries.

### 2. Inject the refreshed Codex prompt into every generated profile

Change `deepworkPromptForAgent()` or `generateCodexPlugin()` so generated profiles carry `deepwork/codex.md`. This would create a bundle delta, but it would alter prompt assembly and potentially duplicate `gpt.md` plus GPT-5.6 guidance. It also changes runtime semantics solely to make generation visibly change, so it is rejected.

### 3. Put the cadence and delegation refresh into GPT-5.6 calibration

The existing additive GPT-5.6 layer already discusses changed-input validation and bounded delegation. Expanding it would reach generated profiles, but the requested behavior applies to the Codex deepwork policy across model families. It would duplicate generic workflow doctrine inside a model specialization and violate the explicit requirement to leave GPT-5.6 unchanged, so it is rejected.

## Selected Prompt Contract

### Increment validation

The execution loop in each source will say:

1. Run diagnostics on changed files and only the tests and scenarios touched or affected by the current increment.
2. Re-run a broader suite, typecheck, or build only when relevant inputs have changed since that gate's last green result.
3. Do not re-run unchanged criteria after every increment.
4. Before the final user-visible message, run one appropriate full pass over the integrated change.
5. HEAVY work still completes RED, GREEN, SURFACE, and CLEAN evidence for every criterion and still passes its existing final acceptance authority.

This changes repetition frequency, not proof strength. A failed targeted check is fixed and rerun. If the fix changes inputs covered by a previously green broader gate, that broader gate becomes stale and must be included in the next appropriate pass.

### Delegation envelope

Each environment keeps its current dispatch mechanism and local fields. The reliability section will require:

- Existing fields: `TASK`, `EXPECTED OUTCOME`, `REQUIRED TOOLS`, `MUST DO`, `MUST NOT DO`, `CONTEXT`.
- Added fields: `GOAL`, `STOP WHEN`, `EVIDENCE`.
- `GOAL` names the bounded child outcome.
- `STOP WHEN` names the child's observable completion condition.
- `EVIDENCE` names what the child must return.
- The parent checks returned `EVIDENCE` against `GOAL` before integrating the result.
- Child `STOP WHEN` never shortens the parent run; parent completion still means the whole user goal and all required verification are complete.

The OpenCode sources retain `task()` and their background/session wording. The Codex source retains `multi_agent_v1.spawn_agent()`, `fork_context`, and its no-session-resume limitation. This policy text does not change generated MultiAgent V1/V2 fallback routing.

### Final review and stopping

The v1 and Codex final acceptance sections remain intact. The omo unconditional reviewer gate remains intact. The parent stop rule gains an explicit whole-goal prefix but continues to require passing scenarios, cleanup receipts, current notepad state, and the applicable final review approval.

## Data Flow and Boundaries

1. `loadAllPrompts()` reads each changed source exactly as before.
2. `src/intent/prompt-loader.test.ts` reads all three source files and verifies the common policy, preserved workflow evidence, and absence of the superseded per-increment full-suite wording.
3. Existing OpenCode prompt selection remains unchanged.
4. Existing Codex generation continues through `generateCodexPlugin()` without prompt-routing edits.
5. `pnpm run gen:codex-plugin` refreshes `.agents/plugins/marketplace.json`, `.codex/agents/**`, and `plugins/deepwork/**` through the current generator.
6. Because the changed `codex.md` source is outside the current generated-profile assembly path, every tracked generated file must remain byte-equivalent. A generated delta is a blocker, not permission to edit the generator.

## File Map

### Create now

- `docs/superpowers/specs/2026-07-20-codex-prompt-policy-design.md` — this design.
- `docs/superpowers/plans/2026-07-20-codex-prompt-policy.md` — executable TDD plan.

### Modify during implementation

- `prompts/v1/deepwork/codex.md` — v1 validation cadence, delegation evidence contract, and whole-goal stop wording.
- `prompts/omo/deepwork/codex.md` — omo counterpart while retaining its existing final verification gate.
- `prompts/codex/deepwork/codex.md` — Codex counterpart while retaining Codex-native dispatch/session wording.
- `src/intent/prompt-loader.test.ts` — shared source-level RED/GREEN policy assertions.
- `docs/v1-maintenance.md` — v1 mapping row plus Codex plugin prompt synchronization note.
- `docs/prompt-sync.md` — omo/Codex model-family mapping and local policy/runtime-boundary record.

### Inspect, test, regenerate, and require unchanged

- `src/codex/plugin-generator.ts` — inspect only; no diff permitted.
- `src/codex/plugin-generator.test.ts` — run existing V1/V2 and generated-bundle compatibility tests; no diff expected.
- `.agents/plugins/marketplace.json` — regenerate and require unchanged.
- `.codex/agents/**` — regenerate and require unchanged.
- `plugins/deepwork/**` — regenerate and require unchanged.

The eventual commit contains exactly the two task artifacts and six modified source/test/synchronization files above. Generated roots and generator source/tests must have no staged delta.

## Error Handling

- If the new prompt-loader test does not fail before prompt edits, tighten it until it proves the missing cadence/delegation behavior; do not proceed with a false RED.
- If a source variant cannot express the shared policy without changing its local dispatch or final-review semantics, stop and revise the design rather than normalize the environments opportunistically.
- If existing `src/codex/plugin-generator.test.ts` fails before source edits, treat it as a baseline blocker unrelated to this change.
- If generation produces a tracked bundle delta, stop, preserve the diff as evidence, and investigate the contradicted assembly finding. Do not edit or stage `src/codex/plugin-generator.ts`, `src/codex/plugin-generator.test.ts`, or generated files under this plan.
- Never suppress, skip, narrow, or delete a failing test to make the plan green.
- Do not repeat a green suite/typecheck/build unless a relevant input changed afterward.

## Testing Strategy

### RED

Add one source-level test named `Codex deepwork prompts use incremental validation and evidence-bounded delegation` to `src/intent/prompt-loader.test.ts`. Before prompt edits, run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/intent/prompt-loader.test.ts
```

Expected: the new test fails because the prompts still require a full suite and every scenario after each increment and do not contain the complete `GOAL` / `STOP WHEN` / `EVIDENCE` contract.

### GREEN

After updating all three prompt sources, run the same command.

Expected: all `prompt-loader.test.ts` tests pass; the new test proves incremental cadence, all nine delegation fields, parent evidence verification, child/parent stop separation, RED/GREEN/SURFACE/CLEAN retention, and final review retention.

### Runtime compatibility characterization

Before and after source changes, run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts
```

Expected: all tests pass without modifying the test file. Existing assertions continue to prove exact-profile/direct-composition/generic dispatch order, MultiAgent V1/V2 compatibility names, and the generated runtime envelope.

### Generation surface

After the final successful build, run `pnpm run gen:codex-plugin`. Require empty path-scoped status and diff for `.agents/plugins/marketplace.json`, `.codex/agents`, and `plugins/deepwork`. This is the real-surface proof that the prompt-policy change did not alter runtime bundle routing.

### Final full pass

After all source, test, documentation, and build inputs settle, run one final integrated pass:

```powershell
pnpm run typecheck
pnpm test
pnpm run build
```

All three commands must exit 0. If a failure causes an input change, rerun the affected check immediately and then perform one fresh final integrated pass before the final message. Do not rerun a green gate when no relevant input changed.

## Acceptance Criteria

1. The three `deepwork/codex.md` sources share the requested increment-validation and delegation-evidence semantics while retaining environment-local tool/session wording.
2. Each increment runs only touched tests and affected scenarios; broader suite/typecheck/build gates run only after relevant input changes; one full integrated pass occurs before final reporting.
3. Complex-task RED/GREEN/SURFACE/CLEAN evidence and applicable final acceptance remain mandatory.
4. Existing local delegation fields remain, `GOAL` / `STOP WHEN` / `EVIDENCE` are added, and the parent verifies evidence.
5. Child stopping and parent run completion are explicitly distinct; the parent run ends only after the whole user goal and required verification complete.
6. GPT-5.6 sources, runtime V1/V2 compatibility, prompt assembly, generator source, generator tests, schemas, and routing code are unchanged.
7. Prompt-loader RED/GREEN, existing generator characterization tests, generation no-diff proof, typecheck, full tests, and build pass.
8. `docs/v1-maintenance.md` and `docs/prompt-sync.md` record the source synchronization and policy/runtime boundary.
9. No placeholder, unrelated refactor, runtime-only API, weakened final verification, generated hand edit, installation, push, or tag is introduced.
10. The eventual implementation is staged and committed only after explicit Git-write authorization, as exactly one semantic commit containing the two task artifacts and six intended modified files.

## Self-Review

- Placeholder scan: no placeholder token, incomplete section, or deferred design choice.
- Internal consistency: source-level policy changes and expected generated no-diff both follow the inspected assembly path.
- Scope: one prompt-policy change with synchronized tests/docs and a no-change runtime compatibility boundary.
- Ambiguity: generated bundle handling is explicit—regenerate and require no tracked delta; a delta blocks implementation rather than expanding scope.
