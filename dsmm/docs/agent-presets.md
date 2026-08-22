# dsmm agent presets

dsmm v0.2 ships DeepSeek Harness (`dsh`) agent preset templates for the core deepwork roles. The bundled templates live under `agent-presets/` and include the orchestrator, planner, plan critic, reviewer, code-search, doc-search, clarifier, and media-reader role personas.

## Opt-in materialization

Preset materialization is disabled by default. Enable it only in the dsh profile where you want dsmm to write managed preset directories:

```yaml
- id: dsmm
  config:
    presets:
      materialize: true
      root: /absolute/path/to/dsmm-managed-agent-presets
    roles:
      dsmm-reviewer: false # optional per-role toggle
```

When materialization is enabled, dsmm writes only enabled role presets into the configured managed root. Disabled roles are absent from that root. dsmm does not make any dsmm role the default dsh preset, and `dsmm/cordis.patch.yml` does not replace or auto-enable dsh's `agent-presets` configuration.

## Adding the managed root to dsh discovery

To make dsh discover materialized dsmm presets, explicitly add the managed root to the `agent-presets` service in a profile or patch you control:

```yaml
- id: agent-presets
  config:
    default: standard
    roots:
      - path: /absolute/path/to/dsmm-managed-agent-presets
        trust: user
    includeUserRoot: true
```

Important: dsh patch layers replace the whole `agent-presets` config row. If you patch this row, restate every value you still need, including `default`, all `roots`, and `includeUserRoot`. Keeping `default: standard` preserves dsh's default preset while adding dsmm's managed root as an extra discovery location.

See `patches/agent-presets-root.example.cordis.patch.yml` for a commented example. It is documentation only and is not auto-applied by dsmm.
