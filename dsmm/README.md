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

## Install into a disposable profile

Build the local package, point dsh state at a disposable home, install the local bundle into a throwaway profile, and inspect the resulting config:

```powershell
pnpm --filter dsmm build
$env:DSH_HOME = "$env:TEMP\dsmm-dsh-home"
dsh plugin --profile dsmm-smoke add .\dsmm
dsh --profile dsmm-smoke --dump-config
```

Expected result: the dumped config contains the `dsmm` bundle row from `cordis.patch.yml`, including `id: dsmm`. Remove the disposable `DSH_HOME` directory when finished if you no longer need it.

## Optional Docker smoke

The Docker smoke builds dsmm in a container, installs the requested dsh package, installs dsmm into an isolated `dsmm-smoke` profile, and checks that `dsh --profile dsmm-smoke --dump-config` includes `id: dsmm`.

```powershell
pnpm --filter dsmm smoke:docker
```

The Docker smoke is optional because it requires Docker and network access to fetch `@deepseek-ai/dsh`. Normal development acceptance remains `pnpm --filter dsmm test`, `pnpm --filter dsmm typecheck:test`, and `pnpm --filter dsmm build`.

## Configuration sketch

`cordis.patch.yml` installs dsmm with these v0.1 defaults:

```yaml
- insert:
    - id: dsmm
      name: dsmm
      config:
        modeName: deepwork
        defaultActive: false
        promptOrder: 50
        deepseekV4ProCalibration: auto
```

`modeName` controls the slash command and prompt label. The persisted v0.1 session event remains the fixed internal `deepwork/mode` event.

## Implementation plan

- `docs/implementation-plan-v0.1.md` is the dsmm-local copy of the approved v0.1 MVP implementation plan.
- `../docs/superpowers/plans/2026-08-21-dsmm-mvp.md` remains the workflow-reviewed source plan artifact in this repository.

Supporting design material remains in `docs/design.md`, `docs/roadmap.md`, and `docs/research/`.
