# Deepwork for DeepSeek Harness

Deepwork adapts ocmm's deepwork workflow to DeepSeek Harness. Its package remains `@dsmm/dsmm`: a DSH-native Cordis bundle, not an OpenCode compatibility layer.

This package targets `@deepseek-ai/dsh@0.2.0-rc.2`, the npm `latest` resolved on 2026-10-03. The current `0.1.6` source contract preserves native root-model authority and adds a compact current-session profile selector alongside structured native route controls, independent session profiles and delegated-role route strategies. Human-facing names remain **Deepwork** and **DW Role**. 0.1.6 publication and Desktop acceptance remain pending. The completed 0.1.5 publication is immutable historical evidence, not proof for 0.1.6; older identities, including 0.1.4's separately controlled published-origin continuation, stay unchanged. Package, configuration, tool and role IDs retain the `dsmm` namespace.

The immutable `dsmm-scoped-v0.1.3` tag remains at `2bdea4b`. Its CI run `37235817488` failed before packing or publication because pnpm 11 ignored the required esbuild/koffi build scripts. The later 0.1.4 origin published accepted bytes but its original verification saw a registry 404; its completed fixed-origin continuation preserves that failed original CI history. The stopped 0.1.2 frozen tag/artifact and draft Release remain untouched and unpublished. The successor target is 0.1.6; none of these facts authorizes rewriting earlier identities.

## Current functionality

- Opt-in deepwork mode and `/deepwork [off|message]`, plus the inspection-only `/dsmm-status [json]`.
- Seven scoped core workflow skills synchronized with current ocmm: risk-based discovery, complex-work planning and criticism, bounded implementation, evidence-led review, parallel execution, and behavior-preserving cleanup.
- Twelve native roles displayed as `DW …`, with enabled DW Orchestrator, DW Builder, and DW Planner eligible for the native root Agent preset selector. The other nine roles remain auxiliary delegation roles; disabled Builder is absent from both selector and child tools. Read-only constraints are enforced through native tool composition. Models remain user-selected; Oracle names alone do not guarantee model heterogeneity.
- Exact-route V41 Flash calibration for `deepseek-official/deepseek-flash` and `deepseek-account/deepseek-flash`, preserving V4 Pro settings. Runtime selects only adapter-advertised reasoning efforts.
- Delegated-role provider/model/exact-effort controls, ordered candidates, independent per-role `startup-lock` (default) or explicit `rate-limit-fallback`, and finite correlated no-output-safe retries. Ordinary roots keep their native initial model and exact effort, not a profile-role primary; explicit native model choices remain authoritative across later turns, profile reapply and cold resume. Supported explicit overrides survive for trusted live, owned, zero-prefix one-shot children. No new model-visible model-selection permission is added; exact configured efforts are not downgraded.
- Native Settings → Deepwork Profiles (`Deepwork 配置档`) with structured role/retry controls and byte-preserving Advanced JSONC. Global default and current-session Apply are distinct; CAS-protected sidecars pin independent immutable revisions and admission epochs. Save alone activates neither scope.
- Compact native session-header profile selector: normal switching keeps the current model. The separate explicit “Switch and use profile model” choice invokes native model selection and saves its native default, like the Models tab. A committed profile remains applied if model selection is unavailable or unconfirmed; the UI reports the separate model result and preserves newer native choices.
- Scoped shell/Git/plan/question/todo guards and separately opt-in bounded idle continuation.
- Optional external `ocmm-lsp mcp` integration with nine tools including atomic `format`. Debugging/DAP is an on-demand skill, not additional LSP tools or automatic prompt injection.

The native host owns child-session controls, depth limits, permission checks, cancellation, and model authentication. DSMM does not replace those with an OpenCode retry dispatcher.

Native plugin metadata comes from exported `locale/en.json` and `locale/zh.json` resources with `meta.title: Deepwork` and localized descriptions—not an invented manifest `displayName`. `/dsmm-status`, `/deepwork`, `dsmm-*` role IDs, callable tools and persistence formats remain compatible technical interfaces. Branding does not change activation, permissions or routing.

Durable session metadata requires explicit deployment-only `sessionPersistence: {root, compression}` configuration. The main `@dsmm/dsmm` Loader entry internally mounts the native JSONL companion and waits for readiness before runtime hooks. The public `./session-persistence` export is a library building block, not a second Loader entry to install alongside the client package. Preserve the existing effective root/compression and disable the exact stock JSONL row at startup; there is no automatic custom-root migration or hot replacement. An incompatible durable provider blocks DSMM custom appends; ephemeral Hosts without persistence remain allowed. Existing unmarked logs require separately authorized backup/metadata repair, never automatic rewriting. See [persistence compatibility](docs/compatibility.md#session-persistence-compatibility) for the bounded startup patch and pending artifact gate.

## Install and configure

Install the exact registry version after terminal verified publication with `dsh plugin --profile <profile> add @dsmm/dsmm@0.1.6`. For isolated development verification, use a built and packed artifact:

```powershell
pnpm --dir dsmm build
pnpm --dir dsmm pack --pack-destination <temporary-artifact-directory>
$env:DSH_HOME = "<disposable-test-home>"
dsh --profile <profile> --from-default-profile headless --dump-config
dsh plugin --profile <profile> add <absolute-path-to-dsmm-dsmm-0.1.6.tgz>
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

The [historical 0.1.1 migration guide](docs/migration-from-ocmm.md) explains the earlier ocmm/DSH adapter migration; use the current profile and upgrade guides above for 0.1.6 behavior.

For a delegated-role model, configure `roleRouting.dsmm-reviewer.primary` with native `provider`, `model`, and optional `reasoningEffort`, then choose its strategy/retry policy where needed. These policies do not silently replace the ordinary root's native model; using a profile's main-model choice is an explicit user action. There are no built-in provider routes or API keys. See [model routing](docs/model-routing.md) and [runtime recovery](docs/runtime-recovery.md) for admission, bounded RATE_LIMIT rollover and migration from old generic automatic fallback.

Without active mode or a selected DSMM Agent preset, DSMM workflow prompts and default-scoped guards do not apply. Applying a runtime profile does not select a role. Global Apply leaves existing live Agents, including blank Agents, unchanged. A separate current-session Apply reserves native idle maintenance and changes only that root's admission epoch; old children stay old, later native children inherit the new snapshot. Cold resume honors an explicit session sidecar, otherwise the current global default. Headless task text is not a slash-command adapter.

## Verification

```powershell
pnpm --dir dsmm typecheck:test
pnpm --dir dsmm test
pnpm --dir dsmm check:release
pnpm --dir dsmm smoke:docker
```

A separately authorized credentialed, packed real-model diagnostic is also available from this checkout. It is **not** the independent 0.1.6 Docker/UI release gate; that gate must not copy credentials, sessions, Desktop configuration or browser authentication:

```powershell
node dsmm/scripts/live-dsh-smoke.mjs --runtime <npm-prefix-with-pinned-dsh> --package <packed-dsmm.tgz> --provider deepseek-account --credentials <existing-dsh-credentials-file> --receipt <sanitized-receipt.json>
```

Add `--delegate` to verify the actual `dsmm_reviewer` child persona, inherited Flash route and strict read-only tool inventory. Use `--probe-only` first to inspect the role schema without credentials or a model call. `--effort low` can keep this bounded smoke inexpensive; the runner checks the final persisted request header against that explicit choice.

The test copies only native account records into a temporary home, verifies a real read/write/model round-trip, checks the exact route and DSMM prompt, and removes temporary credentials and sessions. It does not print reasoning or credentials, log into a browser, modify the original credential file, or silently use a different model. API-key testing uses `--provider deepseek-official` and an existing `DEEPSEEK_API_KEY` environment variable.

These commands are verification procedures, not a claim they have passed for the final 0.1.6 artifact. The dedicated DSMM workflow builds a fresh CI tarball with pnpm, Docker-gates its exact bytes, and publishes through OIDC with genuine provenance; the old 0.1.2 bootstrap is not used. See [compatibility](docs/compatibility.md) and [release policy](docs/releasing.md) for terminal publication and later Desktop evidence boundaries.
