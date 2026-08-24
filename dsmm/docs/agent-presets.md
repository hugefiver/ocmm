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

When materialization is enabled, dsmm writes only enabled role presets into the configured managed root. Disabled roles are absent from that root. Every current managed role directory contains the role-bound `.dsmm-managed-preset` marker with the exact v1 form `dsmm-managed-preset/v1` and `role=dsmm-<role>` lines. dsmm does not make any dsmm role the default dsh preset, and `dsmm/cordis.patch.yml` does not replace or auto-enable dsh's `agent-presets` configuration.

DSMM refuses to claim a foreign role directory. A missing marker, a mismatched marker, a marker bound to another role, or a malformed legacy shape is foreign and is never overwritten or removed. A current v1 marker with extra entries, or any linked directory or managed file, fails the reconciliation instead of being modified. The only supported legacy migration is the exact old `managed by dsmm` marker with the expected three regular files and no extra entries. On the next enabled reconciliation, that safe legacy shape is updated in place to the v1 role-bound marker; everything else remains untouched.

Each static DSMM role preset also installs one preset-scoped `dsmm/preset-skills` plugin row. It registers that preset's configured bundled skills only when the preset's `skills` service is available; it does not globally replace dsh skill configuration or make the role's skills visible to unrelated presets.

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
