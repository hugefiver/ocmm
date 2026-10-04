# Deepwork for DeepSeek Harness

Deepwork adapts ocmm's deepwork workflow to DeepSeek Harness. Its package remains `@dsmm/dsmm`: a DSH-native Cordis bundle, not an OpenCode compatibility layer.

This package targets `@deepseek-ai/dsh@0.2.0-rc.2`, the npm `latest` resolved on 2026-10-03. The current `0.1.4` source contract includes native Agent preset loading repairs and independent-file runtime profiles, with human-facing **Deepwork** branding and **DW Role** display names. Publication and Desktop acceptance remain pending. The old 0.1.2 frozen tag/artifact and draft Release stay untouched and unpublished; the existing `@dsmm/dsmm@0.1.1` release remains immutable. Package, configuration, tool and role IDs retain the `dsmm` namespace.

The immutable `dsmm-scoped-v0.1.3` tag remains at `2bdea4b`. Its CI run `37235817488` failed before packing or publication because pnpm 11 ignored the required esbuild/koffi build scripts. The successor target is 0.1.4; this does not authorize rewriting either earlier release identity.

## Current functionality

- Opt-in deepwork mode and `/deepwork [off|message]`, plus the inspection-only `/dsmm-status [json]`.
- Seven scoped core workflow skills synchronized with current ocmm: risk-based discovery, complex-work planning and criticism, bounded implementation, evidence-led review, parallel execution, and behavior-preserving cleanup.
- Twelve native roles displayed as `DW …`, with enabled DW Orchestrator, DW Builder, and DW Planner eligible for the native root Agent preset selector. The other nine roles remain auxiliary delegation roles; disabled Builder is absent from both selector and child tools. Read-only constraints are enforced through native tool composition. Models remain user-selected; Oracle names alone do not guarantee model heterogeneity.
- Exact-route V41 Flash calibration for `deepseek-official/deepseek-flash` and `deepseek-account/deepseek-flash`, preserving V4 Pro settings. Runtime selects only adapter-advertised reasoning efforts.
- Role provider/model/effort defaults and ordered opt-in host-first fallbacks. Supported explicit native overrides survive for trusted live, owned, zero-prefix one-shot children; root and cold/unowned/seeded-fork requests retain profile-primary policy. No new model-visible model-selection permission is added. Exact configured efforts are not silently downgraded.
- Native Settings → Deepwork Profiles (`Deepwork 配置档`) for creating, reading, editing, saving and explicitly applying JSONC drafts. Selected bytes are pinned separately as immutable revisions; save alone never activates a draft.
- Scoped shell/Git/plan/question/todo guards, optional host-first fallback and bounded continuation.
- Optional external `ocmm-lsp mcp` integration with nine tools including atomic `format`. Debugging/DAP is an on-demand skill, not additional LSP tools or automatic prompt injection.

The native host owns child-session controls, depth limits, permission checks, cancellation, and model authentication. DSMM does not replace those with an OpenCode retry dispatcher.

Native plugin metadata comes from exported `locale/en.json` and `locale/zh.json` resources with `meta.title: Deepwork` and localized descriptions—not an invented manifest `displayName`. `/dsmm-status`, `/deepwork`, `dsmm-*` role IDs, callable tools and persistence formats remain compatible technical interfaces. Branding does not change activation, permissions or routing.

Durable session metadata requires explicit deployment-only `sessionPersistence: {root, compression}` configuration. The main `@dsmm/dsmm` Loader entry internally mounts the native JSONL companion and waits for readiness before runtime hooks. The public `./session-persistence` export is a library building block, not a second Loader entry to install alongside the client package. Preserve the existing effective root/compression and disable the exact stock JSONL row at startup; there is no automatic custom-root migration or hot replacement. An incompatible durable provider blocks DSMM custom appends; ephemeral Hosts without persistence remain allowed. Existing unmarked logs require separately authorized backup/metadata repair, never automatic rewriting. See [persistence compatibility](docs/compatibility.md#session-persistence-compatibility) for the bounded startup patch and pending artifact gate.

## Install and configure

Install the exact registry version after terminal verified publication with `dsh plugin --profile <profile> add @dsmm/dsmm@0.1.4`. For isolated development verification, use a built and packed artifact:

```powershell
pnpm --dir dsmm build
pnpm --dir dsmm pack --pack-destination <temporary-artifact-directory>
$env:DSH_HOME = "<disposable-test-home>"
dsh --profile <profile> --from-default-profile headless --dump-config
dsh plugin --profile <profile> add <absolute-path-to-dsmm-dsmm-0.1.4.tgz>
dsh --profile <profile> --dump-config
```

The template command initializes a fresh isolated headless deployment profile, not a DSMM runtime profile. For an existing Web profile, keep its original template and configuration. Desktop rollout must wait for independent frozen-artifact Docker acceptance and verified npm/GitHub publication, then use its official installed carrier while the app is fully quit. Read the [upgrade limitations](docs/compatibility.md) before rollout, especially older auxiliary-root sessions.

On DSH 0.2, deployment settings and the runtime baseline belong to the profile's `cordis.patch.yml`:

```yaml
- id: dsmm
  config:
    defaultActive: true
    workflow:
      policy: risk-based
    deepseekFlashCalibration: auto
    deepseekFlashDefaultReasoningEffort: high
```

This runtime-baseline example is not the full durable-persistence patch. Native patch `config` replaces the whole DSMM config: retain all existing settings when adding `sessionPersistence`. A YAML `name` asserts the targeted plugin identity; it does not rename it. Keep exactly one active main DSMM package Loader source to avoid competing native client contributions. See the [startup procedure](docs/compatibility.md#session-persistence-compatibility).

Do not copy the old `settings.yaml` namespace or preset-discovery roots into the new host. Runtime drafts instead live at `<profileContext.dir>/dsmm-profiles/<id>.jsonc`; there is no embedded profiles object in plugin config. See [runtime profiles](docs/profiles.md), [settings/status](docs/settings-status.md), and [agent roles](docs/agent-presets.md).

The [historical 0.1.1 migration guide](docs/migration-from-ocmm.md) explains the earlier ocmm/DSH adapter migration; use the current profile and upgrade guides above for 0.1.4 behavior.

For a role-specific model, configure `roleRouting.dsmm-reviewer.primary` with native `provider`, `model`, and optional `reasoningEffort`. There are no built-in provider routes or API keys. See [model routing](docs/model-routing.md) for policy precedence and [runtime recovery](docs/runtime-recovery.md) for the opt-in fallback gate.

Without active mode or a selected DSMM Agent preset, DSMM workflow prompts and default-scoped guards do not apply. Applying a runtime profile does not select a role. Existing live Agents, including blank Agents, retain their admitted settings; children and recovery inherit the parent snapshot. After Host restart, resumed sessions use the current selected runtime revision, not a historical per-session profile. Headless task text is not a slash-command adapter.

## Verification

```powershell
pnpm --dir dsmm typecheck:test
pnpm --dir dsmm test
pnpm --dir dsmm check:release
pnpm --dir dsmm smoke:docker
```

A separately authorized credentialed, packed real-model diagnostic is also available from this checkout. It is **not** the independent 0.1.4 Docker/UI release gate; that gate must not copy credentials, sessions, Desktop configuration or browser authentication:

```powershell
node dsmm/scripts/live-dsh-smoke.mjs --runtime <npm-prefix-with-pinned-dsh> --package <packed-dsmm.tgz> --provider deepseek-account --credentials <existing-dsh-credentials-file> --receipt <sanitized-receipt.json>
```

Add `--delegate` to verify the actual `dsmm_reviewer` child persona, inherited Flash route and strict read-only tool inventory. Use `--probe-only` first to inspect the role schema without credentials or a model call. `--effort low` can keep this bounded smoke inexpensive; the runner checks the final persisted request header against that explicit choice.

The test copies only native account records into a temporary home, verifies a real read/write/model round-trip, checks the exact route and DSMM prompt, and removes temporary credentials and sessions. It does not print reasoning or credentials, log into a browser, modify the original credential file, or silently use a different model. API-key testing uses `--provider deepseek-official` and an existing `DEEPSEEK_API_KEY` environment variable.

These commands are verification procedures, not a claim they have passed for the final 0.1.4 artifact. The dedicated DSMM workflow builds a fresh CI tarball with pnpm, Docker-gates its exact bytes, and publishes through OIDC with genuine provenance; the old 0.1.2 bootstrap is not used. See [compatibility](docs/compatibility.md) and [release policy](docs/releasing.md) for terminal publication and later Desktop evidence boundaries.
