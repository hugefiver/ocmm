# Codex Runtime Compatibility Design

## Goal

Refresh every generator-owned Codex runtime-guidance surface so `create_goal`, MultiAgent V1, V2-style flat tools, fork parameters, and generic delegation follow one callable-schema-authoritative contract without modifying source prompt validation or review cadence.

## Scope

The authoritative implementation remains `src/codex/plugin-generator.ts`. The compatibility contract must reach all three surfaces produced by that generator:

1. `renderWorkflowSkill()` → `plugins/deepwork/skills/deepwork/SKILL.md`.
2. `codexAgentInstructions()` → `developer_instructions` in all generated agent TOMLs under both `.codex/agents/` and `plugins/deepwork/agents/`.
3. `normalizeSkillForCodex()` → the `## Codex Compatibility` section in every copied/flattened generated skill under `plugins/deepwork/skills/`, excluding the separately rendered workflow skill.

In scope:

- `src/codex/plugin-generator.ts`
- `src/codex/plugin-generator.test.ts`
- all generated files whose contents derive from the three functions above
- this design and its implementation plan

Out of scope:

- source prompts under `prompts/{omo,v1,codex}/`
- source skills under `skills/` and `skills/v1/`
- `docs/v1-maintenance.md`, which remains unchanged because the repository's reciprocal v1 sync rule applies only when its source prompts or source skills change
- prompt validation, review cadence, or orchestration policy
- OpenCode routing, permissions, hooks, config, or schema
- runtime feature-detection code
- a stable `multi_agent_v2` namespace claim
- sending `fork_context` to a V2-style flat tool

## Verified Current Problem

The same stale generic contract is emitted independently in three places:

- `renderWorkflowSkill()` emits `TASK`/`DELIVERABLE`/`VERIFY` fields and V1 examples with unconditional `fork_context=false`.
- `codexAgentInstructions()` appends an authoritative hard-gate that requires `TASK, ROLE, DELIVERABLE, SCOPE, VERIFY, REQUIRED SKILLS, CONTEXT, and CONSTRAINTS` in every generated agent profile.
- `normalizeSkillForCodex()` appends the same legacy label set to each normalized skill.

Consequences:

- Updating only the workflow skill leaves every agent profile and normalized skill in conflict.
- Current tests explicitly accept the old agent and workflow contracts.
- V2 guidance does not prove that `fork_context` is forbidden or that `fork_turns: none` is conditional on the callable schema exposing `fork_turns`.
- The generated bundle has no cross-surface consistency test.

The generator does not inspect a live Codex tool registry. It can only emit instructions that tell the runtime agent how to inspect its current callable schema and degrade safely.

## Design Decision

Introduce one shared internal dispatch contract and reuse it in all three generation paths:

```typescript
function renderCodexGenericDelegationEnvelope(): string
function renderCodexDispatchCompatibility(): string
function renderCodexRuntimeCompatibility(): string
```

- `renderCodexGenericDelegationEnvelope()` renders the exact canonical three-line generic envelope.
- `renderCodexDispatchCompatibility()` renders one reusable `### Callable Dispatch Contract` section containing schema authority, route order, V1/V2/fork rules, `create_goal`, profile disclaimers, and the canonical envelope.
- `renderCodexRuntimeCompatibility()` wraps that shared section with workflow-skill-specific profile references and degradation guidance.

The existing functions change as follows:

- `renderWorkflowSkill(config, agents)` interpolates `renderCodexRuntimeCompatibility()` once and removes its legacy standalone delegation block.
- `codexAgentInstructions(args)` replaces its legacy hard-gate sentence with `renderCodexDispatchCompatibility()` after `Original Deepwork prompt`, so the generated compatibility block remains later and authoritative without editing source prompts.
- `normalizeSkillForCodex(skillDir, name?)` retains Codex tool substitutions, removes the legacy envelope sentence, and ensures the shared callable-dispatch section is present exactly once even when the source skill already has a `## Codex Compatibility` heading.

These helpers remain module-private. No package API, config field, runtime hook, or schema is added.

## Canonical Callable Dispatch Contract

### Callable-schema authority

The current callable tool schema is the only authority for tool availability and accepted parameters. Names and examples are compatibility hints. Fields hidden by the callable schema must be omitted rather than inferred from another Codex version, installed TOML, documentation snapshot, or adjacent tool.

Prompt text cannot enable a missing feature. A generic dispatch must not claim that it loaded a profile, selected a model, attached a skill, or inherited context unless the callable schema exposes and performs that operation.

Compatibility routing never widens the active role's delegation permissions, target allowlist, or workflow ownership.

### Route order

Use the first complete callable route:

1. **Exact profile** — use `agent_type`, `agent_path`, `agent_nickname`, or another selector only when the callable schema explicitly guarantees that it selects the generated `dw-*` profile.
2. **Direct composition** — use a callable tool only when its current callable schema exposes every model field required by the role, the schema-exact `reasoning` or `reasoning_effort` field when the role requires reasoning, the role's full system/developer instructions, and all required skills. Report this as composition, not exact-profile selection.
3. **V1/V2 generic or flat dispatch** — send the canonical envelope through the actual message field. The child uses inherited/default runtime behavior unless a valid override is exposed.
4. **Local execution** — use only when no callable native dispatch route exists.

`task_name` is task identity, not a profile selector.

### Compatibility matrix

| Surface | Required schema evidence | Allowed behavior | Forbidden or omitted behavior |
|---|---|---|---|
| `create_goal` | The tool is callable and a user, system, or developer instruction explicitly requests runtime goal creation | Call it with fields exposed by its schema | Do not call during ordinary workflow activation, planning, or delegation; `GOAL:` in a message is not a tool request |
| Exact-profile V1 | `multi_agent_v1.spawn_agent` is callable and its schema documents `agent_type` as profile selection | Use `agent_type`; use `model` and the schema's exact `reasoning` or `reasoning_effort` field only when exposed and required | The default example omits `fork_context`; never add hidden fields |
| Direct composition | Exact profile is unavailable and the current callable schema exposes every role-required model field, the schema-exact `reasoning` or `reasoning_effort` field when required, full system/developer instructions, and all required skills | Supply the actual generated developer instructions and required skills as composition | Do not claim exact-profile selection or unexposed skill loading |
| Generic V1 | V1 spawn is callable but exact profile/direct composition is incomplete | Send the canonical generic envelope | Do not claim message text or TOML content selected a profile |
| V2-style flat | Flat `spawn_agent`, `wait_agent`, `followup_task`, or `interrupt_agent` is callable | Use only those callable names | Never send `fork_context`; never synthesize a stable `multi_agent_v2.*` call |
| V2/generic fork | The callable schema exposes `fork_turns` | Use `fork_turns: none` when no context is requested; use another documented value only for explicit branch exploration | If `fork_turns` is hidden, omit it; never emit an unconditional example containing it |
| Generic-only | A callable dispatch tool exposes task identity and a message field | Send the canonical envelope; use only other fields actually exposed | `task_name` does not select a profile; do not invent model, reasoning, profile, skill, item, or fork fields |
| No native dispatch | No callable route is present | Execute locally within the active role's permissions | Do not imply prompt text enabled a missing tool |

### Fork rules

- The default V1 example is `multi_agent_v1.spawn_agent(agent_type="dw-plan-critic", message="Review the saved implementation plan and return one current-revision verdict.")`; it contains no `fork_context`.
- V1 may add `fork_context` only when the callable V1 schema exposes it and an explicit context-inheritance decision requires it.
- V2-style flat tools never receive `fork_context`.
- Only when the callable schema exposes `fork_turns` may the agent use `none` for no context. If the field is hidden, it is omitted.
- No default call example contains `fork_turns`; conditional prose defines its use.

### Canonical generic envelope

Every generic V1, V2-flat, or generic-only message uses exactly this required envelope:

```text
GOAL: State one imperative, bounded outcome, including the role, scope, constraints, and required work.
STOP WHEN: State the exact completion condition and non-goal boundary.
EVIDENCE: State the paths, commands, outputs, or observations that prove completion.
```

Additional task details may follow, but they do not create a second mandatory label vocabulary. The compatibility contract must not retain or endorse the legacy canonical sequence containing `TASK`, `DELIVERABLE`, `VERIFY`, `REQUIRED SKILLS`, or `CONSTRAINTS`.

### `create_goal` gate

`create_goal` is opt-in. Call it only when a user, system, or developer instruction explicitly asks for runtime goal creation. Ordinary deepwork activation, planning, delegation, or a `GOAL:` envelope line does not satisfy that gate. If the explicit request exists but the tool is not callable, continue with available workflow controls and report that the operation is unavailable.

## Three-Surface Data Flow

1. `renderCodexDispatchCompatibility()` becomes the single source for the shared callable contract.
2. `renderCodexRuntimeCompatibility()` embeds it in the workflow skill and adds workflow-only generated-profile references.
3. `codexAgentInstructions()` embeds the same shared section after the original composed prompt and before Oracle-specific guidance.
4. `normalizeSkillForCodex()` ensures the same shared section exists once under or after the Codex compatibility material for every copied skill.
5. `writeCodexAgents()` writes identical profile content to the plugin and project agent roots.
6. `writeCodexSkills()` writes the workflow skill separately and copies/normalizes all other skills.
7. `pnpm run gen:codex-plugin` regenerates every affected tracked artifact; generated files are never hand-edited.

## Testing Strategy

### Actual generated-bundle test

Add this exact test to `src/codex/plugin-generator.test.ts`:

```text
generated Codex bundle shares one callable-schema contract across workflow, agents, and normalized skills
```

The test generates a temporary bundle and reads the actual outputs:

- the workflow skill at `skills/deepwork/SKILL.md`;
- every bundled agent TOML under `agents/`, decoding `developer_instructions` with `JSON.parse` because `tomlString()` uses `JSON.stringify`;
- each matching project agent TOML under `.codex/agents/`, asserting byte equality with the bundled copy;
- every normalized skill `SKILL.md` under `skills/` except the separately rendered `deepwork` workflow skill.

For every actual surface, extract `### Callable Dispatch Contract` and assert it is byte-identical to the workflow skill's contract. Then assert:

- the default V1 call exists and contains neither `fork_context` nor `fork_turns`;
- V1 sends `model` only when the current callable schema exposes `model`, and sends exactly the schema-named `reasoning` or `reasoning_effort` field only when that exact field is exposed; the default call contains none of those optional fields;
- direct composition requires every role-required model field, the schema-exact reasoning field when required, full system/developer instructions, and all required skills; it is reported as composition rather than exact-profile selection;
- V1 optional fork use is explicitly schema-gated;
- V2 explicitly enumerates `spawn_agent`, `wait_agent`, `followup_task`, and `interrupt_agent`, uses each only when callable and only with parameters exposed by that tool's schema, never receives `fork_context`, and emits no `multi_agent_v2.*` call;
- `fork_turns: none` is allowed only when the schema exposes `fork_turns`, and hidden fields are omitted;
- `GOAL:`, `STOP WHEN:`, and `EVIDENCE:` all exist;
- the legacy generic label sequences do not exist in the extracted contract or in generated agent/normalized-skill compatibility material;
- `create_goal` remains explicit-request-only;
- generic dispatch does not claim profile, model, skill, or feature activation.

### Existing-test correction

Update `generateCodexPlugin writes a self-contained bundle` and the in-memory agent test so they no longer accept:

- `TASK, ROLE, DELIVERABLE, SCOPE, VERIFY, REQUIRED SKILLS, CONTEXT, and CONSTRAINTS`;
- the backticked normalized-skill equivalent;
- workflow placeholders beginning with `TASK:`, `DELIVERABLE:`, or `VERIFY:`;
- default `fork_context=false` examples.

Replace those assertions with positive canonical-triad checks and narrow negative checks for the exact legacy compatibility sequences. Unrelated task-format prose embedded in source prompts is not rewritten by this change; the later generated hard-gate is authoritative.

## Generated Diff

The expected tracked generated delta is exactly 58 files:

- 22 bundled agent TOMLs under `plugins/deepwork/agents/`.
- The same 22 project agent TOMLs under `.codex/agents/`.
- 13 normalized `SKILL.md` files under `plugins/deepwork/skills/`.
- `plugins/deepwork/skills/deepwork/SKILL.md`.

The 22 agent names are:

```text
dw-builder, dw-clarifier, dw-code-search, dw-coding, dw-complex, dw-creative,
dw-deep, dw-doc-search, dw-documenting, dw-explore, dw-frontend,
dw-hard-reasoning, dw-media-reader, dw-normal-task, dw-oracle, dw-oracle-2nd,
dw-orchestrator, dw-plan-critic, dw-planner, dw-quick, dw-research, dw-reviewer
```

The 13 normalized skill paths are:

```text
plugins/deepwork/skills/ast-grep/SKILL.md
plugins/deepwork/skills/debugging/SKILL.md
plugins/deepwork/skills/deepwork-brainstorming/SKILL.md
plugins/deepwork/skills/deepwork-dispatching-parallel-agents/SKILL.md
plugins/deepwork/skills/deepwork-receiving-code-review/SKILL.md
plugins/deepwork/skills/deepwork-requesting-code-review/SKILL.md
plugins/deepwork/skills/deepwork-subagent-driven-development/SKILL.md
plugins/deepwork/skills/deepwork-writing-plans/SKILL.md
plugins/deepwork/skills/frontend/SKILL.md
plugins/deepwork/skills/git-master/SKILL.md
plugins/deepwork/skills/init-deep/SKILL.md
plugins/deepwork/skills/remove-ai-slops/SKILL.md
plugins/deepwork/skills/using-git-worktrees/SKILL.md
```

`.agents/plugins/marketplace.json`, manifests, package metadata, plugin README, skill auxiliary files, and runtime staging are regenerated verification surfaces but are expected to remain byte-identical.

## File Map

| File or set | Action | Responsibility |
|---|---|---|
| `src/codex/plugin-generator.ts` | Modify | Add shared envelope/dispatch/runtime renderers and integrate `renderWorkflowSkill()`, `codexAgentInstructions()`, and `normalizeSkillForCodex()` |
| `src/codex/plugin-generator.test.ts` | Modify | Test actual generated workflow, agent instructions, normalized skills, fork behavior, consistency, and legacy-contract absence |
| `.codex/agents/dw-*.toml` for the 22 listed names | Regenerate | Project agent developer instructions |
| `plugins/deepwork/agents/dw-*.toml` for the 22 listed names | Regenerate | Bundled agent developer instructions |
| The 13 listed normalized `SKILL.md` files | Regenerate | Shared Codex compatibility section |
| `plugins/deepwork/skills/deepwork/SKILL.md` | Regenerate | Workflow runtime compatibility surface |
| `docs/superpowers/specs/2026-07-20-codex-runtime-compatibility-design.md` | Modify | Reviewed design authority |
| `docs/superpowers/plans/2026-07-20-codex-runtime-compatibility.md` | Modify | Executable TDD implementation plan |

## Commit Boundary

The reviewed design, plan, generator source, direct tests, and exactly 58 generated files form one atomic 62-path change: four source/test/spec/plan artifacts plus 58 generated files. `docs/v1-maintenance.md` remains unchanged under the repository's reciprocal v1 sync rule because this task does not modify source prompts or source skills. No intermediate commit is appropriate because all three generated compatibility surfaces must change together. A later explicitly authorized commit should use `fix(codex): unify runtime delegation compatibility`.

## Acceptance Criteria

1. One shared internal dispatch renderer feeds workflow, agent, and normalized-skill compatibility surfaces.
2. All three actual generated surfaces contain byte-identical `### Callable Dispatch Contract` content.
3. Generic delegation uses the canonical `GOAL`/`STOP WHEN`/`EVIDENCE` envelope and does not endorse the legacy generic contract.
4. The default V1 call contains no `model`, `reasoning`, `reasoning_effort`, `fork_context`, or `fork_turns`; `model` and the schema's exact reasoning-field spelling are sent only when exposed by the current callable V1 schema.
5. V2 explicitly maps callable flat `spawn_agent`, `wait_agent`, `followup_task`, and `interrupt_agent`; each is used only with parameters exposed by its own schema, no stable namespace or hidden parameter is invented, and `fork_context` is never sent.
6. `fork_turns: none` is used only when the callable schema exposes `fork_turns`; hidden fields are omitted.
7. `task_name` is explicitly not a profile selector.
8. `create_goal` is explicit-request-only and never automatic.
9. Source prompts, source skills, and `docs/v1-maintenance.md` remain unchanged; no prompt validation or review-cadence policy is introduced.
10. The generated delta is exactly the 58 files listed by set, and the final single-commit allowlist is exactly 62 paths.
11. Targeted tests, typecheck, full tests, build, generation, deterministic regeneration, and real generated-surface probes pass.
