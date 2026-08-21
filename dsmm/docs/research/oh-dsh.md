# oh-dsh Research Notes

Source target: `https://github.com/hust-open-atom-club/oh-dsh`

## Project shape

oh-dsh is a dsh runtime distribution that combines desktop, web, and TUI surfaces. The repo is organized around a top-level package plus workspace plugins under `plugins/`, with separate patch layers for desktop and web profiles.

Relevant observed structure:

```text
oh-dsh/
  bin/
  src/
    cli.ts
    profile.ts
    plugin.ts
    contracts.ts
    runtime*.ts
  plugins/
    desktop-frame/
    better-sidebar-runtime/
    plugin-marketplace/
    skins/
    vision/
    shared/
    tui/
  cordis.patch.yml
  web/cordis.patch.yml
  docs/
  tests/
```

## Bundle and profile pattern

oh-dsh follows dsh's package manifest model:

- top-level package exports the Host plugin entry, client entry, and compiled patch;
- `dsh.bundle.patch` points to the shipped `cordis.patch.yml`;
- profile assembly lists dsh base/web/headless bundles plus oh-dsh's own bundle;
- user patch layers remain separate from shipped bundle patches.

This is directly useful for dsmm: ship dsmm as a bundle layer and let users override it from their profile patch.

## Patch organization

oh-dsh uses patch rows to disable upstream defaults and insert its own plugin rows. The key idea is not the specific desktop plugins, but the pattern:

```yaml
- insert:
    - id: oh-desktop-frame
      name: '@oh-dsh/desktop-frame'
    - id: oh-vision
      name: '@oh-dsh/vision'
```

For dsmm, the equivalent is a small set of rows for the dsmm Host plugin, mode definition, settings namespace, prompts, and skill provider.

## Host/Client separation

oh-dsh packages can expose both Host and Client entries. Host plugins provide services and register prompt/tool/settings contributions. Client plugins inject browser UI surfaces.

dsmm MVP should stay Host-only. A client/settings panel can come later, after the dsh plugin APIs and dsmm settings model are stable.

## Settings seam

oh-dsh distinguishes two planes:

- composition plane: profile bundle rows and `cordis.patch.yml` decide which plugins exist;
- settings plane: user-editable YAML/JSON controls personal preferences.

dsmm should adopt this split. Deepwork availability is composition; mode name, auto-entry, calibration strictness, and skill toggles are settings.

## Custom mode relevance

oh-dsh tracks dsh mode/plan-mode design notes. The important behavior for dsmm is that a mode is session-scoped state, not a global prompt mutation. A mode contributes model-visible instructions while active and can be entered through commands or UI mode selection.

Current public dsh documentation exposes `@deepseek-ai/dsh-plan-mode`, not a generic arbitrary named `@deepseek-ai/dsh-mode` package. dsmm should therefore implement its own `deepwork` mode plugin using the same principles, or adapt to an upstream generic mode package if it becomes available. This satisfies the requirement that deepwork should be opt-in rather than global.

## Borrowed design decisions

1. Ship defaults as a bundle patch, not as instructions for users to paste manually.
2. Keep profile/user patch layers override-friendly.
3. Separate Host capability registration from optional Client UI.
4. Use a settings namespace for user-editable behavior.
5. Treat mode as the activation boundary for workflow behavior.

## Not copied into MVP

- Electron desktop shell.
- Web/TUI UI composition.
- Plugin marketplace transaction system.
- Vision tool integration.
- Sidebar and panel controls.

Those features are valuable in oh-dsh, but dsmm's MVP is a workflow/mode bundle rather than a UI runtime distribution.
