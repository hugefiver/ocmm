# dsmm

`dsmm` is a DeepSeek Harness (`dsh`) migration of ocmm's deepwork workflow. It is a dsh-native Cordis bundle, not an OpenCode compatibility layer.

## v0.1 scope

v0.1 delivers the smallest useful local bundle:

- registers the `dsmm` Host plugin through `cordis.patch.yml`;
- keeps deepwork opt-in by default through the `/deepwork [off|message]` command;
- contributes the `dsmm:deepwork` system-prompt section only while deepwork mode is active;
- registers four bundled runtime skills: `brainstorming`, `writing-plans`, `requesting-code-review`, and `receiving-code-review`;
- applies DeepSeek V4 Pro prompt calibration when configured and the active model matches DeepSeek V4 Pro.

v0.1 intentionally excludes exit-tool approval, UI/client work, publishing, OpenCode hook parity, runtime fallback, idle continuation, and MCP/LSP packaging.

## v0.2 role preset preview

v0.2 adds dsh agent preset templates for dsmm's core deepwork roles: orchestrator, planner, plan critic, reviewer, code-search, doc-search, clarifier, and media-reader. Preset materialization remains opt-in and dsmm does not replace dsh's default `agent-presets` configuration or default preset automatically.

See [`docs/agent-presets.md`](docs/agent-presets.md) for enabling materialization, disabling individual roles, and adding the managed preset root to dsh discovery with an explicit profile patch.

## v0.3 workflow skill completeness

v0.3 completes the bundled deepwork workflow skill set while keeping deepwork scoped and opt-in. The seven runtime skills are configurable under `settings.skills`:

- `brainstorming`
- `writing-plans`
- `subagent-driven-development`
- `dispatching-parallel-agents`
- `requesting-code-review`
- `receiving-code-review`
- `remove-ai-slops`

Workflow policy is configurable under `settings.workflow`: `workflow.strictGates` controls whether deepwork gates are strict, `workflow.reviewCap` caps review/planning loops, and `workflow.finalReviewPolicy` selects final review routing (`simple-oracle-complex-reviewer`, `reviewer-only`, or `off`). These settings apply to dsmm deepwork behavior only; they do not make dsmm global outside the active mode.

## v0.4 safety guards

- v0.4 safety guards: dsh-native `tools/pre-execute` / `tools/post-execute` policies for shell dialect mistakes, git writes, large tool output, plan checklist formatting, question labels, and todo discipline. See [`docs/safety-guards.md`](docs/safety-guards.md).
- DSMM role presets expose bundled skills through the preset-scoped `dsmm/preset-skills` package export. This keeps skill registration role-bound instead of making it global; materialization ownership and safe legacy migration are documented in [`docs/agent-presets.md`](docs/agent-presets.md).

## v0.5 MCP and LSP integration

v0.5 adds disabled-by-default LSP/MCP settings and a copyable opt-in dsh MCP client patch for `ocmm-lsp mcp`. Users who want diagnostics, symbols, definitions, references, and rename tools can enable the `@deepseek-ai/dsh-mcp-client` row from [`docs/lsp.md`](docs/lsp.md) without changing the default dsmm prompt-only install path.

## Install into a disposable profile

Build the local package, point dsh state at a disposable home, install the local bundle into a throwaway profile, and inspect the resulting config:

```powershell
pnpm --filter dsmm build
$env:DSH_HOME = "$env:TEMP\dsmm-dsh-home"
dsh plugin --profile dsmm-smoke add .\dsmm
dsh --profile dsmm-smoke --dump-config
```

Expected result: the dumped config contains the `dsmm` bundle row from `cordis.patch.yml`, including `id: dsmm`. Remove the disposable `DSH_HOME` directory when finished if you no longer need it.

## Required Docker smoke for safety remediation

The Docker smoke is mandatory acceptance for this safety remediation. It builds dsmm in a container, installs the pinned dsh package, installs dsmm into an isolated `dsmm-smoke` profile, checks that `dsh --profile dsmm-smoke --dump-config` includes `id: dsmm`, verifies bundled skill registration settings, and smoke-tests role preset materialization/discovery.

```powershell
pnpm --filter dsmm smoke:docker
```

The required Docker smoke needs Docker and network access to fetch `@deepseek-ai/dsh@0.1.1-rc.2`. Source-only development checks remain `pnpm --filter dsmm test`, `pnpm --filter dsmm typecheck:test`, and `pnpm --filter dsmm build`.

## Configuration sketch

`cordis.patch.yml` installs dsmm with these defaults:

```yaml
- insert:
    - id: dsmm
      name: dsmm
      config:
        modeName: deepwork
        defaultActive: false
        promptOrder: 50
        deepseekV4ProCalibration: auto
        workflow:
          strictGates: true
          reviewCap: 5
          finalReviewPolicy: simple-oracle-complex-reviewer
```

`modeName` controls the slash command and prompt label. The persisted session event remains the fixed internal `deepwork/mode` event.

## Implementation plan

- `docs/implementation-plan-v0.1.md` is the dsmm-local copy of the approved v0.1 MVP implementation plan.
- `docs/implementation-plan-v0.3.md` is the dsmm-local copy of the approved v0.3 workflow skills implementation plan.
- `docs/implementation-plan-v0.4.md` is the dsmm-local copy of the approved v0.4 safety guards implementation plan.
- `../docs/superpowers/plans/2026-08-21-dsmm-mvp.md` remains the workflow-reviewed source plan artifact in this repository.
- `../docs/superpowers/plans/2026-08-22-dsmm-workflow-skills.md` remains the workflow-reviewed source plan artifact for v0.3.
- `../docs/superpowers/plans/2026-08-23-dsmm-safety-guards.md` remains the workflow-reviewed source plan artifact for v0.4.

Supporting design material remains in `docs/design.md`, `docs/roadmap.md`, `docs/skill-sync.md`, and `docs/research/`.
