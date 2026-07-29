# Prompt and Skill Upstream Sync Design

## Status

Approved by unambiguous self-review. This is subproject 4 of the five-item synchronization requested by the user.

## Context

The local upstream checkout is `./omo` at `79a15710a4a637d7958ba8f54d8070cf8e8a883d`. Since the previous ocmm synchronization, upstream added three relevant behavior sets:

- GPT run-scoped goal, live todo, and stop-goal discipline;
- flaky-test triage guidance for the debugging skill;
- interaction and motion mechanics guidance for the frontend skill.

The upstream text cannot be copied wholesale. Its automatic commit behavior conflicts with ocmm's user-authorization gate for Git writes; its unconditional `create_goal` wording is not valid on every local harness; several command examples are Bash-only; and its frontend guidance assumes external catalogs and skills that ocmm does not ship.

## Goals

1. Synchronize the useful behavior of all three upstream changes into ocmm's existing prompt and skill architecture.
2. Keep OpenCode, the skill-driven deepwork workflow, and Codex semantically aligned while using each harness's available tracking surface.
3. Make flaky-test investigation deterministic and evidence-led without hiding failures.
4. Add interaction mechanics as a composable frontend reference without changing the existing style-skill selection model.
5. Regenerate the Codex bundle deterministically and prove the new shared-skill references are shipped.

## Non-goals

- No automatic commits, history-mimicking commit cadence, or weakening of the Git authorization gate.
- No runtime goal controller, new tracking tool, or unconditional `create_goal` call.
- No new frontend package, vendored component catalog, designpowers layer, or `/visual-qa` dependency.
- No retry wrapper, arbitrary sleep, quarantine, or test deletion as a flaky-test remedy.
- No project 5 Codex artifact-identity or hash-receipt work.
- No broad prompt rewrite, unrelated skill cleanup, config-schema change, or software installation.

## Considered Approaches

### A. Copy upstream files wholesale

Rejected. This would import incompatible tool names, automatic Git writes, Bash-only commands, upstream branding, and unavailable frontend dependencies.

### B. Bounded semantic adaptation

Selected. Preserve the upstream behavioral intent but express it through ocmm's current tools, authorization rules, role ownership, shell adaptation, and generated-bundle architecture.

### C. Record the changes as observation-only documentation

Rejected. The missing behavior would remain absent from model-facing prompts and skill routing.

## Design

### 1. GPT run contract

Update all three sources:

- `prompts/omo/deepwork/gpt.md`
- `prompts/v1/deepwork/gpt.md`
- `prompts/codex/deepwork/gpt.md`

Add a concise run-scoped contract with these invariants:

- For multi-step work, use the tracking surface available in the current harness. Keep atomic items, exactly one active item, immediate status transitions, and insert newly discovered required work when found. Do not batch-complete items at the end.
- Register a persistent goal only when `create_goal` is actually available and the user, system, or developer instruction explicitly requests or authorizes that mechanism. Otherwise keep the run goal in the existing todo, plan, or notepad surface.
- Define the parent run's stop condition from the complete requested behavior plus required evidence, cleanup, and any triggered final review. A child delegation's `STOP WHEN` ends only the child task and never replaces the parent stop condition.
- Stop after the run condition is satisfied. Do not repeat validation when relevant inputs have not changed.

The OMO and skill-driven sources use local todo/notepad wording. The Codex source names `update_plan` where tool-specific wording is useful. The three sources must not instruct the model to commit automatically. Existing implementation gates, planning thresholds, scenario/TDD/QA rules, and review ownership remain authoritative.

Machine-facing tests should assert the effective contract rather than freeze entire prose blocks. They must prove the live-todo and parent-stop semantics are present, and that unconditional `create_goal` and automatic-commit instructions are absent.

### 2. Flaky triage reference

Add:

- `skills/debugging/references/methodology/03-flaky-triage.md`

Update:

- `skills/debugging/SKILL.md`

The router should recognize flaky, intermittent, order-dependent, and CI-only failures and route them to the new reference. The reference defines a three-run signature:

1. rerun the same command unchanged;
2. run the failing case in isolation;
3. run the quiet full affected scope;
4. add deterministic shuffle and seed evidence only when order dependence is plausible.

Classify the signature as one of: product race/timing, environment contention, order or fixture leakage, or resource-limit pressure. Inspect shared temporary roots, fixed ports, process-global environment/config, shared databases/caches, and cross-test locks. Repair isolation or namespacing at the cause.

Forbidden remedies are retry wrappers, arbitrary sleeps, quarantine, deletion, assertion weakening, or killing another user's process. If the cause cannot be fixed in scope, report the classification and evidence as an unresolved finding.

Command examples must be shell-neutral or paired. Bash examples may use `mktemp` and standard POSIX tools; PowerShell examples use a GUID-scoped directory under the approved temp root and native PowerShell inspection such as `Get-NetTCPConnection`. No example may require installing a utility.

The local debugging escalation policy remains unchanged: after two failed evidence rounds, one `hard-reasoning` escalation is allowed only for a genuinely difficult root-cause problem. Reviewer and Oracle profiles are not debugging agents.

### 3. Frontend interaction mechanics

Add the project-original adaptation:

- `skills/frontend/references/design/interaction-skill.md`

Update:

- `skills/frontend/SKILL.md`
- `skills/frontend/.gitignore`
- `skills/frontend/references/design/README.md`
- `skills/frontend/references/design/_INDEX.md`
- `skills/frontend/ATTRIBUTION.md`

The new file is a stacking mechanics reference, not a mutually exclusive style skill. The existing twelve style/taste choices remain unchanged. The overall design reference count increases from 83 to 84.

The reference requires the worker to:

- read the project's existing `DESIGN.md`, component conventions, and motion stack first;
- define an interaction-state matrix for relevant hover, focus, press, open/close, loading, success, error, disabled, and reduced-motion states;
- use motion only to communicate state or spatial continuity;
- prefer transform and opacity for smooth compositing, avoid input latency, and use interruptible spring motion for spatial interactions when the existing stack supports it;
- inspect `package.json` before proposing a new dependency and record its bundle/runtime cost; new dependencies still require the task's normal design and authorization process;
- drive the real browser surface in normal and reduced-motion modes, covering keyboard focus as well as pointer interaction, and capture the available trace or screenshot evidence.

External interaction catalogs are optional inspiration only. The implementation must not depend on network availability, vendor catalog components, mention an unavailable `/visual-qa` command, or assume Tailwind/Motion is installed.

### 4. Provenance and maintenance records

Update:

- `docs/prompt-sync.md`
- `docs/v1-maintenance.md`

The records must name the upstream commits and source paths, describe the bounded adaptations, and explicitly record the rejected automatic-commit, unconditional-goal, Bash-only, branding, and unavailable-tool behavior. `docs/v1-maintenance.md` must stay synchronized with both the `prompts/v1/` and shared-skill changes.

`skills/frontend/ATTRIBUTION.md` lists `interaction-skill.md` under the project-original local adaptation section. It must not misrepresent the file as a vendored third-party catalog.

`skills/frontend/.gitignore` must add an exact negation for `references/design/interaction-skill.md`, alongside the existing project-original design-doc exceptions. The source must be normally trackable; release preparation must not rely on `git add -f`.

### 5. Generated Codex bundle

Run the existing TypeScript build and generator. Generated files under `plugins/deepwork/skills/debugging/**` and `plugins/deepwork/skills/frontend/**` are outputs only and must never be edited by hand.

Generator tests should prove:

- the new debugging and interaction references exist in the generated bundle;
- their bytes equal the source files;
- the generated debugging/frontend router files equal their sources;
- the existing full tracked freshness contract remains green.

Run generation twice and require an identical second inventory and byte set.

## Data Flow

1. OpenCode and skill-driven sessions load their GPT prompt from the workflow-specific source.
2. Codex agent generation consumes the Codex GPT source through the existing prompt composition path.
3. OpenCode loads shared skills directly from `skills/`.
4. `src/codex/plugin-generator.ts` copies the same shared skills into `plugins/deepwork/skills/`.
5. Tests compare source and generated files so a source-only or generated-only update cannot pass.

No new runtime API or persistent state is introduced.

## Error Handling and Safety

- Missing or unavailable external frontend inspiration does not block implementation; the local mechanics contract is complete by itself.
- A flaky test that cannot be reproduced after the prescribed signature remains classified with evidence; it is not silently marked fixed.
- Shell examples must not select or spawn a different shell solely to match the example.
- Temporary QA roots must be unique, isolated, and removed in `finally` cleanup. User processes and user configuration are never terminated or overwritten.
- Existing prompt authority and skill-trigger gates override any narrower sentence in the new material.

## Verification

### Targeted tests

- `src/intent/prompt-loader.test.ts`: effective GPT run-contract presence, parent/child stop distinction, conditional goal use, and absence of automatic-commit language for all three workflows.
- shared-skill loader tests, if existing coverage exposes the source inventory.
- `src/codex/plugin-generator.test.ts`: source/generated reference inventory and byte equality.

Avoid brittle full-prose snapshots. Test stable headings, contracts, inventory, and byte-copy behavior.

### Repository gates

- `pnpm run typecheck`
- targeted Node tests
- `pnpm test`
- `pnpm run build`
- `pnpm run build:ts`
- two deterministic `pnpm run gen:codex-plugin` runs
- `git diff --check`

### Real surfaces

- In an isolated OpenCode configuration, load the built plugin and verify the effective GPT prompt includes the run contract without unconditional goal or Git-write instructions.
- In an isolated Codex/plugin inspection surface, verify the generated debugging and frontend skill references resolve from the packaged plugin root.
- Do not use credentials for registry/config probes and do not modify the real OpenCode or Codex configuration.

### Acceptance review

Because this change crosses model-facing prompts, shared skills, docs, and generated artifacts, final acceptance requires the first available Oracle and the primary-lane Reviewer over the complete project-4 working-tree diff and evidence.

## Acceptance Criteria

1. All three GPT prompt sources implement the same run-scoped goal/todo/stop semantics through their native tracking vocabulary.
2. No source introduces automatic commits or unconditional `create_goal` behavior.
3. The debugging router exposes deterministic flaky triage with paired or shell-neutral examples and cause-oriented remedies.
4. The frontend router exposes a project-original interaction mechanics reference that stacks with, rather than replaces, the existing style selection.
5. Design reference counts, index entries, provenance, prompt-sync, v1 maintenance records, and the project-original `.gitignore` exception are internally consistent.
6. Generated Codex skill files exactly mirror source and are stable across a second generation run.
7. Targeted tests, typecheck, full tests, build, isolated surfaces, diff checks, and dual final reviewers pass.
8. Project 5 and release-version changes are absent from this subproject.

## Self-review

- Placeholder scan: no incomplete section or deferred requirement.
- Internal consistency: prompt, skill, docs, generator, and QA responsibilities align.
- Scope: one bounded synchronization subproject; project 5 and release work remain separate.
- Ambiguity: tracking, stop ownership, shell behavior, provenance, reference counts, generation, and review gates are explicit.
