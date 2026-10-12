# DSMM for DeepSeek Harness

DSMM (`@dsmm/dsmm`) adds native configuration, role delegation and child controls to DeepSeek Harness. **DSMM** is the Plugins page and package title; **Deepwork** is its optional workflow module. It isn't an OpenCode compatibility layer.

This guide describes the **local source candidate**, targeting `@deepseek-ai/dsh@0.2.0-rc.2` and Node.js 22 or later. `package.json` still says `0.2.0`, an already published registry version. The new source features described here aren't a claim that the registry artifact was updated or a new npm release was published. Use the actual local packed artifact for candidate evaluation. Package/smoke acceptance and actual Desktop activation are separate checks, not implied by this documentation.

## What the candidate provides

### Native configuration and profiles

**Plugins → DSMM** edits the sparse global deployment base. The bundle and actual row Config pages also expose the native profile override when the Host supplies its authorized form. **Save Global DSMM** changes only central `config.json`; **Save current DSH profile override** changes only that exact native entry's patch. Neither save restarts the Host, cancels work or applies a named profile. Core settings remain usable without a session and with Deepwork cold-off.

**Settings → Deepwork Profiles** separates four states: editor draft, saved revision, future-default pin and current-session admission. Save doesn't activate a revision. Future-default selection leaves existing Agents alone; current-session Apply requires the exact idle ordinary root, selection CAS and admission epoch. Invalid JSONC and conflicts remain visible without discarding the draft. `blank-label` is a nonblocking warning; unknown, unsafe and retired fields still refuse.

The Conversation profile menu preserves the native model when switching profiles. Its separate **Use profile model** action reads the current admitted immutable revision, not a later saved draft. Newer native model/effort intent remains authoritative. The **Deepwork** toggle persists explicit intent, including same-default choices; DW presets default on but can be turned off without losing persona or permission boundaries. Sessionless controls don't create a session, and busy/unavailable mutations fail closed. See [profiles](docs/profiles.md) and [settings/status](docs/settings-status.md).

### Roles, models and language

The inventory contains 11 base roles and 11 categories displayed as `DW …`. Only enabled Orchestrator, Builder and Planner are root-eligible; the other 19 are auxiliary. Cross-cutting defaults off. Role-disabled diagnostics distinguish required roles, startup availability, deployment enablement and actual admission. Catalog visibility isn't execution permission, and role names don't guarantee different models.

Delegation supports `level:"normal"` by default and explicitly configured `low`, `high` and `max` for eligible targets. Exact unsupported effort refuses rather than degrading. `subagents.toolTopology` selects per-role tools or parameterized `dsmm_role`/`dsmm_category` tools. Model-facing `route` overrides are absent unless deployment explicitly grants them; named profiles can't grant that permission. Ordinary roots retain native provider/model/effort. Child primary routes supply defaults, not unconditional overrides.

Named profiles can narrow enabled roles and capture visible-output `locale`: `en`, `zh-Hans`, `zh-Hant`, `ja`, `ko`, `de`, `fr`, `es`, `pt-BR`, or `ru`. A user's explicit output-language request wins. Locale doesn't change internal reasoning, UI/project language, technical IDs or exact quotations. Children keep their captured route, locale and authority after a parent profile change. See [model routing](docs/model-routing.md) and [Agent presets and child control](docs/agent-presets.md).

### Child execution and controls

Foreground one-shot is the default. With explicitly enabled native jobs, an authorized handoff transfers the **same running native one-shot** to background, preserving its run identity rather than spawning a second child. The child panel shows real runs, direct children and a read-only descendant tree, with initial capture versus own native request route and explicit unknown/disabled states.

Managed direct continuable children support **Queue**, **Steer** and interrupt under current exact-parent authority. Idle/cold continuation retains the durable child ID; a terminal one-shot isn't a continuable session. An inbox receipt means accepted, not completed. Unknown transport outcomes retain the draft and disable automatic resend. Refresh doesn't retry a send. These controls require the explicit ready Host runtime described below; seeing a panel or role catalog alone doesn't prove availability.

Native Host ownership still governs lifecycle, depth, permissions, cancellation, storage, attachments and model authentication. DSMM adds capture and delivery fences, not a replacement scheduler or a second retry dispatcher. [Runtime recovery](docs/runtime-recovery.md) describes finite, positively no-output-safe retries and per-role `startup-lock`/opt-in `rate-limit-fallback`; partial text, reasoning or tool fragments forbid replay.

### Workflow resources

Fourteen configurable Agent-scoped skills use metadata discovery and lazy body loading. Explicit Deepwork off hides DSMM skills without removing Host/project skills or role restrictions. Scoped shell/Git/plan/question/todo guards remain bounded by native authority. Idle continuation is separately opt-in. External `ocmm-lsp mcp` integration is optional; debugging/DAP is an on-demand skill, not an automatic debugger service. `/deepwork [off|message]` and inspection-only `/dsmm-status [json]` are Host-adapter commands, not headless task-text commands.

## Use a local artifact

Start with the built and packed candidate supplied by your artifact checks, not a registry reinstall of `0.2.0`. For a disposable CLI evaluation, the minimal installation step is:

```powershell
$env:DSH_HOME = "<disposable-test-home>"
dsh --profile <test-profile> --from-default-profile headless --dump-config
dsh plugin --profile <test-profile> add <absolute-path-to-local-candidate.tgz>
dsh --profile <test-profile> --dump-config
```

Use an empty test home and a fresh profile. These are operator-run examples, not permission to install software or touch a real Desktop/TUI profile. Headless needs a separately configured native provider and effective `defaultActive:true` for task execution; it doesn't select Agent presets. Don't copy credentials or account records into a test. `--dump-config` shows native Loader composition, not the full global-aware DSMM admission.

For a real installation, authorize the target carrier and profile separately after artifact checks. Desktop and CLI/TUI profiles are independent. Keep the existing provider/account configuration, exact effort, unrelated Loader rows and history. Desktop package handling belongs to its installation-owned carrier with the app fully quit; a standalone CLI or copied Desktop profile isn't a substitute, and package installation alone doesn't prove Electron activation.

### Explicit managed runtime startup

The default `cordis.patch.yml` adds only the main DSMM entry and **doesn't replace the stock runtime**. Managed delivery requires an explicit cold overlay based on [patches/subagent-runtime.yml](patches/subagent-runtime.yml), followed by an independent restart. Verify the actual native row identity, disable the stock `subagent` row, and bind one Host-owned DSMM runtime in the same scope. Preserve native spawn/fork/model/Gateway services and copy any explicit stock capacity/depth settings into the new row.

`@dsmm/dsmm/subagent-runtime` maps to `lib/runtime-integration.js`; its default export is the Host-owned startup plugin. It isn't automatic hot replacement or merely the bare runtime class. Inspect `binding`, `deliveryFenceReady` and `restartRequired` separately. A stock, missing or unready binding reports its limitation instead of claiming managed readiness. See [runtime composition](docs/settings-status.md#child-runtime-composition) and [compatibility](docs/compatibility.md).

### Configuration and capture boundaries

Resolution is **defaults → sparse global deployment → explicit native entry/profile → immutable named overlay**. Objects merge, arrays replace, and unset removes only the current layer's key. Global storage is `<resolvedDshHome>/plugins/dsmm`, a DSMM convention; trusted home resolution uses explicit `profileContext.home`, then `DSH_HOME`, then the native `~/.dsh` default.

Startup freezes mounted capabilities. New ordinary roots capture current valid desired deployment; existing roots, including blank ones, and their future children keep their baseline. Explicit idle profile Apply replaces only the permitted overlay on that old baseline. Existing children stay captured. Saves don't remount services or upgrade permissions; absent startup capability requires restart. Global-only `modules.deepwork.enabled` defaults true, while ordinary mode defaults off. Turning the module on from cold-off requires an explicit restart.

Global writes retain byte-revision CAS, cooperative locking and final recheck; native profile saves retain their own authorization/CAS. They aren't a cross-layer transaction or protection against every non-cooperating editor. The fixed configuration RPC requires the real native operator peer, public loopback bind, writable Host and lifetime rechecks. A loopback-looking URL or client assertion doesn't grant access.

Durable DSMM metadata needs explicit deployment-only `sessionPersistence` on the main entry, preserving the existing effective root/compression and disabling the exact stock JSONL row at startup. The public `./session-persistence` export is a library building block, not a second Loader entry. See [persistence compatibility](docs/compatibility.md#session-persistence-compatibility).

## Upgrade and safety limits

The experimental legacy read adapter is **off by default** and programmatic-only. `DsmmHostStartupOptions.experimentalLegacyRead` requires real closed Host collaborators through `createDsmmHostPlugin` or named `apply`'s third argument. The old `legacyRead` option isn't consumed. No YAML/JSON flag certifies Host callbacks, approvals or durability. Cross-process cleanup, pre-drain ordering and published replay aren't fully verified; missing capability stays unavailable. See [legacy boundaries](docs/compatibility.md#experimental-legacy-read).

Existing exact legacy profile libraries stay read-only with their immutable pins; there is no automatic migration or same-name fallback. Retired `deepseekV4ProMaxReasoningPresets` and `deepseekFlashMaxReasoningPresets` reject with `deprecated-field`; configure explicit levels deliberately, without rewriting old fields automatically. Older auxiliary-root sessions can fail native cold resume. Preserve history and obtain direction rather than substituting a persona or resetting a session.

For earlier ocmm adapters, consult the [historical migration guide](docs/migration-from-ocmm.md). [Source synchronization](docs/skill-sync.md) covers fixed-pin resources and offline readiness. [Release policy](docs/releasing.md) covers publication evidence, which doesn't establish this candidate's Desktop/TUI activation. No user configuration, account, history or installation is automatically changed.

*Author's note: For a DSH operator evaluating the local candidate; use an isolated artifact first and authorize each real installation or compatibility repair separately.*
