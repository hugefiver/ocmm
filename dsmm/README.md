# dsmm

`dsmm` is a DeepSeek Harness (`dsh`) migration of ocmm's deepwork workflow. It is a dsh-native Cordis bundle, not an OpenCode compatibility layer.

## v0.1 scope

v0.1 delivers the smallest useful local bundle:

- registers the `dsmm` Host plugin through `cordis.patch.yml`;
- keeps deepwork opt-in by default through the `/deepwork [off|message]` command;
- contributes the `dsmm:deepwork` system-prompt section only while deepwork mode is active;
- registers four bundled runtime skills: `brainstorming`, `writing-plans`, `requesting-code-review`, and `receiving-code-review`;
- applies DeepSeek V4 Pro prompt calibration only for the configured exact official route while deepwork is active.

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

## v0.6 model routing

v0.6 documents exact-route DeepSeek V4 Pro calibration and its active-mode-or-selected-DSMM-preset scope. The prompt explains the runtime policy; the `agent/request` handler remains the only component that selects an advertised reasoning effort. See [`docs/model-routing.md`](docs/model-routing.md) for route matching, calibration modes, preset max policy, capability fallback, and boundaries.

## v0.7 runtime recovery

`runtimeRecovery` is an opt-in request-level recovery policy. It preserves the host's retry decision, can hand a host-declined retry to an explicitly configured fallback route, and can steer one bounded continuation only when durable unfinished work is present. It is disabled by default and does not change prompts, skills, guards, LSP, or model routing when disabled. See [`docs/runtime-recovery.md`](docs/runtime-recovery.md) for the exact matching, recovery, restart, subagent, and non-goal boundaries.

## v0.8 settings and status

The fixed `/dsmm-status` command is discoverable through the existing dsh Web command UI and reports the current normalized DSMM status without adding a custom card, panel, or client bundle:

```text
/dsmm-status
/dsmm-status json
```

Headless profiles remain file-configured and can inspect their resolved values with `dsh --profile <profile> --dump-config`. A future TUI may run the host command or consume the pure snapshot API; rc.2 has no official TUI bundle. See [`docs/settings-status.md`](docs/settings-status.md) for the command contract, complete settings defaults, and boundaries.

## v1.0 release readiness

The reviewed package is prepared as 1.0.0, but publication is pending separate authorization. Read the [compatibility matrix][compatibility], [migration guide][migration], and [release and rollback guide][releasing] before treating this reviewed working tree as a distribution candidate.

## Install into a disposable profile

Point dsh state at a disposable home and install only the reviewed artifact appropriate to its evidence. Current reviewed artifact: install the locally packed dsmm-1.0.0.tgz. After separately proven publication: install the exact dsmm@1.0.0 registry version.

```powershell
$env:DSH_HOME = "$env:TEMP\dsmm-dsh-home"
dsh plugin --profile <name> add <tarball-or-exact-version>
dsh plugin --profile <name> list
dsh --profile <name> --dump-config
```

Expected result: the dumped config contains the `dsmm` bundle row from `cordis.patch.yml`, including `id: dsmm`. For headless operation, set `dsmm.defaultActive: true` in settings or the profile; `/deepwork` and `/dsmm-status` are host-adapter commands, not headless task-text commands. Remove the disposable `DSH_HOME` directory when finished if you no longer need it.

## Stable packed-runtime proof

The mandatory Docker proof validates add/list/dump/remove/reinstall/global isolation against the locally packed artifact; it is readiness evidence, not publication proof. This stable packed-runtime proof defines the required acceptance boundary.

The current smoke builds dsmm in a container, installs the pinned dsh package, installs dsmm into an isolated `dsmm-v1-smoke` profile, checks that `dsh --profile dsmm-v1-smoke --dump-config` includes `id: dsmm`, verifies bundled skill registration settings, and smoke-tests role preset materialization/discovery.

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
        deepseekV4ProDefaultReasoningEffort: high
        deepseekV4ProMaxReasoningPresets:
          - dsmm-plan-critic
          - dsmm-reviewer
        workflow:
          strictGates: true
          reviewCap: 5
          finalReviewPolicy: simple-oracle-complex-reviewer
        runtimeRecovery:
          enabled: false
          retryOnStatusCodes: [429, 500, 502, 503, 504]
          retryOnCodes: []
          fallbackRoutes: []
          maxFallbackAttempts: 2
          idleContinuation:
            enabled: false
            maxContinuations: 3
            prompt: "Continue the current task from the durable goal or unfinished todo list. Do not repeat completed work."
```

`modeName` controls the slash command and prompt label. The persisted session event remains the fixed internal `deepwork/mode` event. Runtime-recovery attempt and continuation caps are restart-scoped settings; finite values are floored and clamped to `0..10`.

## Implementation plan

- `docs/implementation-plan-v0.1.md` is the dsmm-local copy of the approved v0.1 MVP implementation plan.
- `docs/implementation-plan-v0.3.md` is the dsmm-local copy of the approved v0.3 workflow skills implementation plan.
- `docs/implementation-plan-v0.4.md` is the dsmm-local copy of the approved v0.4 safety guards implementation plan.
- `../docs/superpowers/plans/2026-08-21-dsmm-mvp.md` remains the workflow-reviewed source plan artifact in this repository.
- `../docs/superpowers/plans/2026-08-22-dsmm-workflow-skills.md` remains the workflow-reviewed source plan artifact for v0.3.
- `../docs/superpowers/plans/2026-08-23-dsmm-safety-guards.md` remains the workflow-reviewed source plan artifact for v0.4.

Supporting design material remains in `docs/design.md`, `docs/roadmap.md`, `docs/skill-sync.md`, and `docs/research/`.

[compatibility]: docs/compatibility.md
[migration]: docs/migration-from-ocmm.md
[releasing]: docs/releasing.md
