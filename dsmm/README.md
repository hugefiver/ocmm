# DSMM for DeepSeek Harness

DSMM is the DSH-native configuration/control bundle for ocmm's Deepwork module. Its package remains `@dsmm/dsmm`, not an OpenCode compatibility layer.

This package targets the installed SDK `@deepseek-ai/dsh@0.2.0-rc.2`. The working **0.1.9** source adds official native Plugins → **DSMM**, separate global/profile deployment editors and captured-state inspection. **Deepwork** remains the module/mode name and **DW Role** the role naming. The independent named JSONC Profiles editor, native model picker/**Use profile model**, session permissions and durable mode intent are retained. Official Desktop source compatibility is tracked separately at `5badb15009ae1756c3afe0ae0cef1faafc290ccc` (`0.2.1-alpha.1`), without changing the SDK pin. Publication, final artifact gates and actual Electron/Desktop acceptance remain pending. Completed 0.1.5 publication, completed 0.1.6 publication/continuation and earlier release identities are immutable historical evidence, not proof for this source.

0.1.7 is already npm published and locally installed in Desktop, but it is not a completed GitHub Release. Its immutable `dsmm-scoped-v0.1.7` source is `1ca0bf6e89916d17ddc663e1e06f6c15256cf453`; original run `37312038470/1` failed verification, its GitHub job was skipped, and terminal evidence remained `UNRESOLVED`/`FAILED`. Preserve that package, tag, source and failed history. The authorized successor is `@dsmm/dsmm@0.1.9` / `dsmm-scoped-v0.1.9`; its Desktop installation waits for its own terminal `COMPLETED` proof.

0.1.8 is genuinely npm published, but not a completed GitHub Release. Its immutable `dsmm-scoped-v0.1.8` source is `569eb8398cd6082d2c59679a0adc0198aeeb883e`, with confirmed published tarball SHA256 `803117222bff06af977752a3a421f4975bc3a511a61e7914960219132e31e301`. Original run `37350981167/1` ended terminal `FAILED`, with GitHub skipped: the old shared 300-second visibility budget expired before npm's record `2026-10-05T18:01:24.500Z`, after the publication job at `17:52:09` on 2026-10-05. Preserve its tag, source, package, provenance, bytes and failed receipt; no old-tag mutation, republishing, rerun, receipt adoption or in-place repair is authorized. Desktop remains on 0.1.7 and CLI/TUI on 0.1.6, unchanged. The original release-only 0.1.9 proposal kept 0.1.8 behavior and changed verification controls to a shared 20-minute 404 visibility budget and 45-minute verify job. Current working source includes A/B/C0 changes without a version bump; Desktop rollout still waits for its own terminal `COMPLETED`.

The immutable `dsmm-scoped-v0.1.3` tag remains at `2bdea4b`. Its CI run `37235817488` failed before packing or publication because pnpm 11 ignored the required esbuild/koffi build scripts. The later 0.1.4 origin published accepted bytes but its original verification saw a registry 404; its completed fixed-origin continuation preserves that failed original CI history. The stopped 0.1.2 frozen tag/artifact and draft Release remain untouched and unpublished. The successor target is 0.1.9; none of these facts authorizes rewriting earlier identities.

## Current functionality

- Opt-in deepwork mode and `/deepwork [off|message]`, plus the inspection-only `/dsmm-status [json]`.
- Global-only `modules.deepwork.enabled` ceiling (default `true`), separate from ordinary mode default `false`. Core configuration and the native DSMM Plugins page remain usable when DW is cold-off, without a conversation/session. Desired-on then requires an explicit independent restart; save does not restart, remount or cancel work. Existing parents/future children retain their captures. See [module lifecycle and APIs](docs/settings-status.md#global-module-ceiling-d0).
- Native DSMM item, installed-bundle page and actual row Config page. **Save Global DSMM** changes only central `config.json`; **Save current DSH profile override** uses that exact entry's native form/revision and changes only its native patch. Every applicable feature has structural controls or bounded schema-validated Advanced JSON. Explicit/default pins, inheritance, higher Host pins, desired/startup/next-root/current admission and revision conflicts remain distinct. There is no Save-all or second settings store. See [native deployment UI](docs/settings-status.md#native-plugins-configuration-d).
- Fourteen configurable Agent-scoped skills, including core workflow and specialist resources, with metadata discovery and lazy body loading. Explicit Deepwork off hides DSMM skills without removing host/project skills.
- The content inventory has 11 base roles and 11 categories displayed as `DW …`, with enabled DW Orchestrator, DW Builder and DW Planner eligible for the native root Agent preset selector. The other 19 items are auxiliary; cross-cutting defaults off. Content presence doesn't prove the remaining C delegation/continuation mechanisms. Read-only constraints retain native tool-composition authority. Models remain user-selected; Oracle names alone don't guarantee model heterogeneity.
- Exact-route V41 Flash calibration for `deepseek-official/deepseek-flash` and `deepseek-account/deepseek-flash`, preserving V4 Pro settings. Runtime selects only adapter-advertised reasoning efforts.
- Delegated-role provider/model/exact-effort controls, ordered candidates, independent per-role `startup-lock` (default) or explicit `rate-limit-fallback`, and finite correlated no-output-safe retries. Ordinary roots keep their native initial model and exact effort, not a profile-role primary; explicit native model choices remain authoritative across later turns, profile reapply and cold resume. Supported explicit overrides survive for trusted live, owned, zero-prefix one-shot children. No new model-visible model-selection permission is added; exact configured efforts are not downgraded.
- Native Settings → Deepwork Profiles (`Deepwork 配置档`) with structured role/retry controls and byte-preserving Advanced JSONC. Global default and current-session Apply are distinct; CAS-protected sidecars pin independent immutable revisions and admission epochs. Save alone activates neither scope.
- One icon-only native profile menu in sessionless, blank and active views with one profile list: normal profile switching keeps the current model after successful profile CAS and never selects a model. The single `@use-model` action, **Use profile model**, reads the current admitted immutable profile's model without reapplying a subsequently saved draft revision. It uses native model selection and native-default persistence like the Models tab, with existing manual-model-intent race fencing; a newer native choice remains authoritative. Disabled mutations do not hide state or refresh. Successes use accessible live announcements only, never persistent visible success prose; errors are short sanitized allowlisted codes/fields with refresh/retry guidance, never raw wire messages or paths.
- **Deepwork** toggle: official minimal conversations default off unless a saved explicit `deepwork/mode` event says otherwise. Explicit same-default choices persist, and mode intent survives profile changes and reopen. DW presets default on but aren't locked; explicit off retains persona, read-only and Git/host permissions. Sessionless, busy or unavailable mutations fail closed.
- Scoped shell/Git/plan/question/todo guards and separately opt-in bounded idle continuation.
- Optional external `ocmm-lsp mcp` integration with nine tools including atomic `format`. Debugging/DAP is an on-demand skill, not additional LSP tools or automatic prompt injection.

The native host owns child-session controls, depth limits, permission checks, cancellation, and model authentication. DSMM does not replace those with an OpenCode retry dispatcher.

Native plugin metadata comes from exported `locale/en.json` and `locale/zh.json` resources with `meta.title: DSMM` and localized descriptions, not an invented manifest `displayName`. `/dsmm-status`, `/deepwork`, `dsmm-*` role IDs, callable tools and persistence formats remain compatible technical interfaces. Branding does not change activation, permissions or routing.

Durable session metadata requires explicit deployment-only `sessionPersistence: {root, compression}` configuration. The main `@dsmm/dsmm` Loader entry internally mounts the native JSONL companion and waits for readiness before runtime hooks. The public `./session-persistence` export is a library building block, not a second Loader entry to install alongside the client package. Preserve the existing effective root/compression and disable the exact stock JSONL row at startup; there is no automatic custom-root migration or hot replacement. An incompatible durable provider blocks DSMM custom appends; ephemeral Hosts without persistence remain allowed. Existing unmarked logs require separately authorized backup/metadata repair, never automatic rewriting. See [persistence compatibility](docs/compatibility.md#session-persistence-compatibility) for the bounded startup patch and pending artifact gate.

## Install and configure

### Layered configuration and capture

Version remains **0.1.9**. C0's layered storage/capture contract is consumed by C's role/continuation policy, D0's module ceiling and D's native Plugins UI. Real isolated rc.2 Web Hosts with the actual package/bundle/row ledger provide browser evidence; this is not private migration, publication or Electron testing. Native ConfigEditor can emit a compatibility `loader/partial-dispose` signal without actual fiber disposal; see [the observed native boundary](docs/settings-status.md#save-authority-and-concurrency).

The public home resolver is loaded through `createRequire` anchored at the declared filesystem peer. Priority is trusted explicit `profileContext.home` → `DSH_HOME` → official `~/.dsh`. DSMM uses `<resolvedDshHome>/plugins/dsmm` by its own convention, **not an official mandated plugin layout**. Sparse `config.json` provides global deployment values; the actual native entry/profile supplies explicit sparse overrides. Business defaults → global → profile → applied immutable named/session overlay is the resolution order. Objects merge recursively, arrays replace, and unset removes only the current layer's key. Explicit same-default values remain overrides. Invalid/unknown/prototype keys, non-JSON data and raw refs are rejected. `DSMM_CONFIG_SCHEMA` stays plain/sparse; native `Config` uses separate optional volatile `DSMM_NATIVE_CONFIG_SCHEMA` transport, not expanded defaults.

Startup awaits validation before mounting consumers, then freezes its snapshot. New ordinary roots await latest valid desired deployment plus the applied immutable overlay. Old roots and their future children keep the entire old snapshot/epoch; an idle profile switch changes only the overlay on that old deployment baseline. `getSettings(agent)` is authoritative; no-argument `getSettings()` stays the validated runtime named default. `modeName`, `promptOrder`, standing presets/materialization and LSP stay startup-scoped. Role policy intersects startup substrate and permissions; absent capability requires explicit restart. Saves don't create a restart/idle queue or cancel old admitted work.

Central `profiles/` shares named drafts/revisions, while `.state/<sha256(canonical-profile-identity+actual-entry)>/` isolates selections and session sidecars under the same documents lock. The old explicit `.../dsmm-profiles` constructor remains compatible. If the current profile's exact old library exists, runtime origin is strictly read-only with no lock/write, retaining full immutable pins. Corruption refuses rather than choosing a central same-name draft. Copy/import is explicit, non-destructive and fixture-verified only, not a production migration framework. Native auth/sessionPersistence locations aren't moved. See [profiles](docs/profiles.md).

The fixed `dsmmConfig` Remote `describe`/`describeModules`/`describeSettings`/`save` backend accepts exact edits and no root/file/entry arguments. All require native invocation peer identity equal to `connection.operator`, public current `webServer.host === '127.0.0.1'` and `settings.writable === true`, with lifetime/connection rechecks before commit. It is core-owned and remains available on cold-off. Unknown/remote carriers fail closed; client `isLoopback` isn't trusted. Reverse proxies/tunnels aren't automatically safe. This is a local writable control-operator capability, not a model tool.

Reads create no files or locks. Global save uses actual-byte SHA256 (or absent) CAS, a cooperative lock, final revision recheck and temp-file rename; it isn't a universal transaction against external editors. It doesn't touch profile patches or invoke Loader patch/reload/dispose/cancel. Native profile saves use only volatile transport and native authorization/CAS. The two layers aren't a cross-layer transaction. See [settings/status](docs/settings-status.md) for the backend and native UI boundaries.

### Installation and explicit profile overrides

Install the exact registry version after terminal verified publication with `dsh plugin --profile <profile> add @dsmm/dsmm@0.1.9`. For isolated development verification, use a built and packed artifact:

Cold tracked source deliberately lacks gitignored frontend bodies/data/Python and provenance. With dependencies already provisioned, first run `node dsmm/scripts/materialize-frontend.mjs --sync` from the repository root: this explicit operation fetches only declared fixed-pin resources/licenses and executes no vendor scripts. Then `node dsmm/scripts/materialize-frontend.mjs --check` and `node --experimental-strip-types dsmm/scripts/check-source-assets.mjs` verify offline 118 frontend resources, 158 source records and 47 role assets before build/test. Ready resync performs zero requests; ordinary build/check stays offline and fails closed on missing/drifted resources. For exact tracked snapshot/real 459-file tarball verification, Windows archive byte-preservation and the unchanged historical publisher's DSMM-title incompatibility, see [source readiness](docs/releasing.md#cold-tracked-source-and-offline-distribution-checks). This is not install or publication authorization.

Desktop and CLI/TUI have independent native deployment profiles. Installing into `desktop` does not install into `dsh-tui`. The existing official CLI/TUI `@dsmm/dsmm@0.1.6` installation is already verified and enabled with `defaultActive: true`; it is not unfinished rollout work and this Desktop upgrade does not repeat TUI setup. For a separately authorized future TUI upgrade after 0.1.9 terminal completion, the exact-version command is `dsh plugin --profile dsh-tui add @dsmm/dsmm@0.1.9 --save-exact`. Launch with `dsh --profile dsh-tui` (or the TUI launcher); a bare `dsh` does not select the Desktop profile. Keep the existing TUI bundle, provider, model, effort and environment-based preset/resume settings. Do not copy Desktop credentials or providers. When enabling durable Deepwork metadata, also follow the single-provider [persistence startup procedure](docs/compatibility.md#session-persistence-compatibility), preserving the existing root and compression. Merely adding the package does not activate Deepwork.

```powershell
pnpm --dir dsmm build
pnpm --dir dsmm pack --pack-destination <temporary-artifact-directory>
$env:DSH_HOME = "<disposable-test-home>"
dsh --profile <profile> --from-default-profile headless --dump-config
dsh plugin --profile <profile> add <absolute-path-to-dsmm-dsmm-0.1.9.tgz>
dsh --profile <profile> --dump-config
```

The template command initializes a fresh isolated headless deployment profile, not a DSMM runtime profile. For an existing Web profile, keep its original template and configuration. Desktop rollout must wait for independent frozen-artifact Docker acceptance and verified npm/GitHub publication, then use its official installed carrier while the app is fully quit. Read the [upgrade limitations](docs/compatibility.md) before rollout, especially older auxiliary-root sessions.

On DSH 0.2, the profile's `cordis.patch.yml` supplies explicit overrides above the sparse DSMM global base. This example pins profile values; it isn't the JSON format for `config.json`:

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

Don't copy the old `settings.yaml` namespace or preset-discovery roots into the new host. New runtime drafts live at `<resolvedDshHome>/plugins/dsmm/profiles/<id>.jsonc`, with profile/entry-scoped state. An existing current-profile legacy library keeps its read-only origin; nothing is automatically migrated. There is no embedded profiles object in plugin config. See [runtime profiles](docs/profiles.md), [settings/status](docs/settings-status.md), and [agent roles](docs/agent-presets.md).

The [historical 0.1.1 migration guide](docs/migration-from-ocmm.md) explains the earlier ocmm/DSH adapter migration; use the current profile and upgrade guides above for 0.1.9 behavior.

For a delegated-role model, configure `roleRouting.dsmm-reviewer.primary` with native `provider`, `model`, and optional `reasoningEffort`, then choose its strategy/retry policy where needed. These policies do not silently replace the ordinary root's native model; using a profile's main-model choice is an explicit user action. There are no built-in provider routes or API keys. See [model routing](docs/model-routing.md) and [runtime recovery](docs/runtime-recovery.md) for admission, bounded RATE_LIMIT rollover and migration from old generic automatic fallback.

Without active mode, DSMM common workflow/skills don't apply; a selected DW persona retains its independent permission boundaries. Applying a runtime profile doesn't select a role. Global named Apply and desired deployment saves leave existing live Agents, including blank Agents, unchanged. A separate current-session Apply reserves native idle maintenance and changes only that root's overlay/epoch on its old deployment baseline; old children stay old, later native children inherit the new snapshot. Cold resume uses an explicit origin-pinned sidecar, otherwise the scoped named default, with current valid desired deployment in a new admission. Headless task text isn't a slash-command adapter.

## Verification

```powershell
pnpm --dir dsmm typecheck:test
pnpm --dir dsmm test
pnpm --dir dsmm check:release
pnpm --dir dsmm smoke:docker
```

A separately authorized credentialed, packed real-model diagnostic is also available from this checkout. It is **not** the independent 0.1.9 Docker/UI release gate; that gate must not copy credentials, sessions, Desktop configuration or browser authentication:

```powershell
node dsmm/scripts/live-dsh-smoke.mjs --runtime <npm-prefix-with-pinned-dsh> --package <packed-dsmm.tgz> --provider deepseek-account --credentials <existing-dsh-credentials-file> --receipt <sanitized-receipt.json>
```

Add `--delegate` to verify the actual `dsmm_reviewer` child persona, inherited Flash route and strict read-only tool inventory. Use `--probe-only` first to inspect the role schema without credentials or a model call. `--effort low` can keep this bounded smoke inexpensive; the runner checks the final persisted request header against that explicit choice.

The test copies only native account records into a temporary home, verifies a real read/write/model round-trip, checks the exact route and DSMM prompt, and removes temporary credentials and sessions. It does not print reasoning or credentials, log into a browser, modify the original credential file, or silently use a different model. API-key testing uses `--provider deepseek-official` and an existing `DEEPSEEK_API_KEY` environment variable.

These commands are verification procedures, not a claim they have passed for the final 0.1.9 artifact. The dedicated DSMM workflow builds a fresh CI tarball with pnpm, Docker-gates its exact bytes, and publishes through OIDC with genuine provenance; the old 0.1.2 bootstrap is not used. See [compatibility](docs/compatibility.md) and [release policy](docs/releasing.md) for the exact shared visibility budget, terminal publication and later Desktop evidence boundaries.
