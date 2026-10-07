# Deepwork 0.1.9 Compatibility and Upgrade

This document describes the prospective 0.1.9 source contract and required acceptance evidence. It does not claim that the final 0.1.9 artifact has passed Docker, been published, or been activated in Desktop. Completed 0.1.5 and 0.1.6 publication/continuation evidence stays immutable and does not prove 0.1.9. Historical 0.1.1 checks and the stopped 0.1.2 frozen draft are not substitute evidence for this update; the old 0.1.2 tag/artifact/draft stay untouched and unpublished. The 0.1.9 plugin behavior is unchanged from 0.1.8; only release Action verification controls change to an exact shared 20-minute 404 visibility budget and a 45-minute verify job. The 0.1.8 npm publication is genuine but its original terminal receipt failed with GitHub skipped; Desktop remains on 0.1.7 and CLI/TUI on 0.1.6 until a separately completed successor rollout.

0.1.7 is npm published and Desktop installed, but not a completed GitHub Release. Preserve immutable tag `dsmm-scoped-v0.1.7`, package and source `1ca0bf6e89916d17ddc663e1e06f6c15256cf453`; original run `37312038470/1` failed verification, GitHub was skipped, and terminal evidence remained `UNRESOLVED`/`FAILED`. Neither installation nor registry presence supplies completion authority. The authorized 0.1.9 Desktop upgrade waits for the new identity's terminal `COMPLETED` evidence, while the existing CLI/TUI 0.1.6 installation remains untouched.

0.1.8 is genuinely npm published, but not a completed GitHub Release. Its immutable `dsmm-scoped-v0.1.8` source is `569eb8398cd6082d2c59679a0adc0198aeeb883e`, with confirmed published tarball SHA256 `803117222bff06af977752a3a421f4975bc3a511a61e7914960219132e31e301`. Original run `37350981167/1` ended terminal `FAILED`, with GitHub skipped: the old shared 300-second visibility budget expired before npm's record `2026-10-05T18:01:24.500Z`, after the publication job at `17:52:09` on 2026-10-05. Preserve its tag, source, package, provenance, bytes and failed receipt; no old-tag mutation, republishing, rerun, receipt adoption or in-place repair is authorized. Desktop remains on 0.1.7 and CLI/TUI on 0.1.6, unchanged. The prospective 0.1.9 keeps the same plugin behavior as 0.1.8 and changes only release Action verification visibility/deadline controls; its Desktop rollout still waits for its own terminal `COMPLETED`.

The immutable 0.1.3 tag at `2bdea4b` is also preserved. Its run `37235817488` failed before pack/publish on pnpm 11's ignored esbuild/koffi build scripts. 0.1.4's published-origin bytes and failed original verify/404 history are preserved by their separate fixed continuation controls, not rewritten by a successor. The 0.1.9 gate requires fresh clean Linux installation/build evidence; existing compiled output is not a substitute.

Deepwork is the native plugin title in both exported metadata locales, with localized descriptions. Profiles are displayed as **Deepwork Profiles** / **Deepwork 配置档**, and twelve roles as `DW …`. Package `@dsmm/dsmm`, Loader `dsmm`, role/tool/provider IDs, commands, schemas and persistence vocabulary remain compatible. Native metadata-reader and actual UI evidence must prove the display names; a manifest `displayName` is not a supported substitute.

## Compatibility authority

### Stage A source contract (2026-10-07; not a publication/host-install claim)

The working source now uses rc.2 `SystemPrompt.AssembleContext.scope/signal` and validates exact live Agent identity; the optional dsh-agent assembly augmentation is not required. Common prompt text never contains bundled skill bodies. Ordinary presets are off unless an effective default or explicit intent enables them; DW role presets default on, but a durable explicit off always wins. Persona, read-only and Git/host permission boundaries remain independent.

The native skill provider is Agent-scoped, disposable and lazy for seven core skills plus debugging. It queries only the parent/global metadata snapshot, yields to every non-DSMM ancestor winner regardless of rank/source, and publishes nothing on incomplete observations. Native revision invalidation, cancellation and generation/parent fencing prevent stale body delivery. No standing preset/global private-mode provider or prompt-body fallback is retained. Missing native registry capability is a diagnostic/refusal, not fictitious availability.

Scope APIs are resolved through the existing declared `dsh-agent-preset-registry` peer graph; skill types come through the declared `dsh-skill-filesystem` contract. No global SDK path or new dependency is embedded. The legacy `preset-skills` export remains a no-op compatibility entry until generated assets are refreshed in B.

Deployment configuration is the main plugin's native Loader Config/entry, not `settings.register`. Runtime profiles retain immutable admissions and idle/CAS persistence. Keyless contract tests use real Cordis Loader, native preset/AgentLoop/skill/tool services and a local LLM adapter; they do not prove plugin Config UI, authenticated Desktop, full B/C/D parity or publication.

The current migration targets `@deepseek-ai/dsh@0.2.0-rc.2`, the official npm latest/next version resolved on 2026-10-03. `0.2.1-alpha.1` is an alpha channel, not the selected compatibility authority. The CLI's actual version and installed package identity must both match the pinned target.

DSH 0.1.1-rc.2 was the historical baseline; it is not the authority for this updated working tree. Installation ranges are not proof of compatibility with future releases.

The installation contracts include `@deepseek-ai/cordis@~4.0.4`, `@deepseek-ai/schemastery@~3.18.4`, and the package's declared DSH component peers pinned to `0.2.0-rc.2`. Role identity additionally consumes the native `@deepseek-ai/dsh-subagent` public contract; a child lifecycle or descriptor is not reimplemented.

## Compatibility matrix

| Surface | Fixed version or boundary | Evidence level |
| --- | --- | --- |
| Node.js | `>=22` | required; final artifact check pending |
| DSH | `0.2.0-rc.2` | pinned authority; final native acceptance required |
| Cordis | `~4.0.4` | supported by contract |
| DSH component peers | `0.2.0-rc.2` | supported by contract |
| Linux container | `Node 22 Bookworm` | independent frozen-artifact gate required |
| Windows Desktop | installed official `0.2.0-rc.2` carrier/host | post-publication native check required |
| macOS | `Node >=22` | supported by contract |
| Native Settings | additive Deepwork Profiles client and authenticated RPC | compiled UI/RPC/storage and actual Desktop are separate proofs |
| Headless | deployment config and native role tools | no Agent preset selection in the one-shot runner |
| TUI | `DSH 0.2.0-rc.2` | existing official 0.1.6 CLI/TUI installation verified; new 0.1.9 menu proof is Web/Desktop only |
| LSP/MCP | `external ocmm-lsp mcp` | optional |
| Runtime recovery | `process-local` | optional |
| Per-role model/effort/fallback policy | native request, subagent and descriptor seams | opt-in; exact configured capability required |
| Runtime profiles | independent drafts, immutable revisions, global pointer and scoped CAS sidecars | global new-Agent defaults; explicit idle session epochs; cold sidecar retention |
| Durable DSMM metadata | deployment-only `sessionPersistence` on main DSMM entry | explicit startup integration; frozen-artifact/production acceptance pending |
| DeepSeek V4 Pro calibration | `deepseek-official/deepseek-v4-pro` | optional |
| DeepSeek V41 Flash calibration | `native DeepSeek providers/deepseek-flash` | optional |

## Command and runtime boundaries

`/deepwork` and `/dsmm-status` are host-adapter commands, not headless task-text commands. The current native client provides Settings → Deepwork Profiles without replacing native navigation, provider/account UI, or the Agent preset selector. There are no model-visible profile-management tools or anonymous file endpoints.

The 0.1.9 Web/Desktop header contributes one icon-only native profile menu in sessionless, blank and active views, yielding to native navigation ownership. One profile list handles normal profile switching that keeps the current model and invokes no native model selection. One `@use-model` **Use profile model** action reads the current admitted immutable profile model without reapplying a later saved revision; successful profile CAS remains authoritative for profile changes, not a prerequisite repeated by this independent model action. It retains native-default persistence like the Models tab and existing manual-model-intent race fencing. Disabled mutations leave the menu inspectable and refreshable. Successes are accessible live announcements only, not visible success prose; short sanitized refusal details use allowlisted codes/fields and refresh/retry guidance, never raw messages or paths. No verbose normal-menu descriptions or duplicate profile-model list remains. These are required new-menu contracts, not a claim of authenticated Desktop acceptance; the historical 0.1.6 SELECT and 0.1.7 menu proof contracts remain unchanged.

The menu's **Deepwork** toggle controls common workflow/skill visibility for ordinary and DW presets. Official minimal mode defaults off unless saved explicit `deepwork/mode` intent exists; a same-default choice still persists that intent, which survives profile changes and reopen. DW presets default on but are not locked; explicit off retains their persona/permissions. Sessionless/busy/unavailable mutations fail closed; mode never creates a session or changes native preset, model or global runtime default.

Headless uses profile `cordis.patch.yml` plus `--dump-config`; real task execution requires a separately configured provider and uses `dsmm.defaultActive: true`. Old `$DSH_HOME/settings.yaml` namespaces must be migrated explicitly; DSMM does not mutate that file.

The old directory discovery `roots/includeUserRoot` no longer configures the native preset registry. DSMM registers only enabled `primary`/`all` roots: Orchestrator, Builder and Planner. Disabled Builder is absent from both selector and child tools. The other nine roles remain auxiliary delegation roles; all twelve static `agent-presets/` directories are inspection templates, not scan roots. The loading correction is native `persona.prefix` plus instructions `maxBytes: 65536`.

DSH's headless one-shot runner does not select or compose Agent presets: headless role delegation must use native role tools, not a registry default. Native preset selection must be tested through a preset-capable host with a blank session. The managed preset-directory materializer remains an opt-in export facility, not discovery evidence.

Trusted live, owned, zero-prefix native one-shot children preserve supported explicit provider/model/effort overrides through final request headers. The role primary supplies alias defaults; it is not an unconditional child override. Ordinary roots preserve their native initial and explicit provider/model/exact effort rather than profile-primary resolution, including later turns, profile reapply and cold resume. Delegated-child policies retain their separate ownership and request-preflight restrictions. `modelSelectionSettings:false` and native tool/permission/depth/cancellation limits are unchanged; this adds no model-visible model-selection authority. See [model routing](model-routing.md).

## Session persistence compatibility

DSH 0.2.0-rc.2's native `Session.append` cannot attach the `ignorable` envelope marker required for stock readers to skip unknown custom event types. DSMM's source update provides a public persistence Service companion that delegates to the native JSONL provider in a separate Context instead of patching the vendor reader or redefining its known event vocabulary. The `@dsmm/dsmm/session-persistence` export is a **library building block**, not a separate Loader package entry alongside the main client-bearing package. Multiple active Loader sources from this package can conflict in native client registration.

The companion validates and clones only `deepwork/mode` and `dsmm/role-policy` records with their exact supported envelope/payload shapes, adding `ignorable: true` for persistence. Other event types are unchanged; malformed DSMM metadata is rejected rather than broadly declared safe. DSMM-aware readers retain the metadata while stock readers can skip these two marked records. The main metadata guard refuses a DSMM custom append when an installed durable persistence provider is incompatible; an ephemeral Host with no persistence is allowed.

The approved source integration uses only the main `@dsmm/dsmm` Loader entry with deployment-only `config.sessionPersistence`. Its `root` must be the unchanged **effective absolute root** of the existing native JSONL provider; its `compression` preserves the effective `zstd` or `none` choice. DSMM mounts the class internally and waits for readiness before runtime hooks. Installation/default bundles remain unchanged until an operator explicitly opts in; no custom root is guessed or silently migrated. Disable the exact existing provider at startup first. If a persistence service is already active, DSMM refuses hot replacement.

For the proven stock base Web/headless/Desktop bundle row, the exact target is ID `session-persistence-jsonl` with name `@deepseek-ai/dsh-session-persistence-jsonl`. This is a **conceptual partial patch**, not a ready-to-copy replacement: substitute the actual effective root/compression and include every existing DSMM config value under `config` before use.

```yaml
- id: session-persistence-jsonl
  name: '@deepseek-ai/dsh-session-persistence-jsonl'
  disabled: true
- id: dsmm
  name: '@dsmm/dsmm'
  config:
    # Retain ALL existing DSMM config values here.
    sessionPersistence:
      root: '<unchanged-effective-absolute-root>'
      compression: '<unchanged-effective-zstd-or-none>'
```

Native `name` is a target identity assertion, **not a rename**. Native patch `config` replaces the whole config object; adding only the field above would erase prior DSMM settings. Keep one active main DSMM entry, preserve unrelated Loader rows and do not add a second `./session-persistence` entry. Minimal SDK compositions may use another persistence row ID such as `sessions`, or no provider; those variants are not automatically covered by the stock patch and require exact native composition verification.

This startup contract is not a completed final Docker or global-release result. The frozen-artifact gate must still prove the binding, marked durable writes and native/stock read behavior before authorized rollout. Do not weaken the known-vocabulary guard or treat an export resolving as proof that the service owns durable persistence.

This prevents future unsafe DSMM writes but does not repair existing unmarked logs. Any repair needs explicit authorization, a targeted recoverable backup, validation and metadata-only changes. There is no automatic log rewriting, history deletion or general unknown-event bypass. Preserve existing logs and report a failed stock-reader restore instead of silently resetting the session.

## Upgrade limits before global rollout

DSMM runtime profiles are independent JSONC drafts beneath the native `profileContext.dir`, not additional DSH deployment profiles. Deployment roles/skills/preset composition/LSP/provider/account/install and `sessionPersistence` settings remain restart-scoped and cannot be changed by a runtime profile. Supported runtime values can be saved into a draft explicitly; save alone never activates it or rewrites deployment configuration. Apply pins immutable bytes and updates only the minimal selection pointer. See [profiles](profiles.md).

Every existing live Agent, **including a blank Agent**, retains its admitted settings when the global default is applied/reset. Explicit current-session selection is separate: native idle maintenance and CAS/epoch checks commit only that ordinary root's sidecar before publishing its immutable admission. Existing children keep their old epoch; later genuinely owned children inherit the new one. Sidecar cold resume retains the exact pinned revision/baseline even after draft/global changes. Sessions without a sidecar keep the old global-current behavior. Corrupt/unavailable sidecars never silently fall back; native clear/compact does not transfer choices by inferred lineage.

Old profile documents remain loadable, but omitted strategy now means safer `startup-lock`: a legacy generic chain no longer causes later generic automatic hopping. `runtimeRecovery.enabled` remains parse-compatible and controls legacy continuation concerns, not the two role strategies. Explicitly opt in per role to bounded `rate-limit-fallback` where desired. Every DSMM retry, including same-route retry, requires correlated native no-output evidence; partial text, reasoning or tool fragments refuse terminally without invoking a competing always-retry owner. See [runtime recovery](runtime-recovery.md).

Older sessions directly selected into now-auxiliary roles can fail native cold resume because their root preset ID is no longer registered. This is a known native compatibility limitation, not permission to silently replace the persona, reset a session, or erase its history. Disclose it before rollout and preserve historical data; if restoring such sessions is required, stop and obtain direction rather than substituting a root. Package rollback does not authorize history or credential changes.

Global/system Desktop migration is the **third phase**: independent frozen-artifact Docker acceptance first, verified immutable npm/GitHub publication second, and only then authorized Desktop package/configuration changes. Preserve unrelated deployment rows, account/provider catalog, role policies (including disabled Builder), active mode, and UI preferences. Use the installation-owned carrier with the app fully quit; neither standalone CLI nor a renamed/copied Desktop profile is a supported substitute.

## Evidence limits

The Linux packed-lifecycle smoke pins pnpm `12.8.1` and retains DSH's native `nodeLinker: hoisted` profile layout. On Linux Node 22, pnpm `11.9.0` with that layout and DSMM's auto-installed peer graph can print `Done` after removal without exiting; the same failure was reproduced directly without DSH, while `12.8.1` returned normally. A printed `Done` is not uninstall completion. This does not claim the same failure on Windows or modify a user's existing package manager or profile. The smoke enforces a bounded fail-closed timeout and checks actual remove/reinstall exits and profile state.

The matrix separates required 0.1.9 evidence from historical CLI/configuration, source-contract and credentialed model evidence. A version string or unit test alone establishes neither native preset health nor UI/runtime behavior. Windows, Linux, Web, and macOS evidence are not interchangeable. The already verified official CLI/TUI 0.1.6 installation is not unfinished rollout work and must not be repeated as part of the new Desktop upgrade.

The independent Docker gate installs the exact frozen tarball into a fresh pinned native runtime/home and verifies root selection, actual read-only child denials, aliased-parent route preflight, runtime snapshot behavior, and the **same compiled DSMM UI** using native client/slots/RPC and real profile storage. A supported composition-owned in-process operator/Gateway carrier and test-owned browser bridge provide no-credential native component/RPC/storage proof. No user login, copied cookie, launcher token, browser state, Desktop data, account records or authentication bypass is permitted. This proof is not authenticated Desktop/Web-launch proof; actual Desktop mounting and authorized operations remain the later check.

LSP/MCP and runtime recovery are disabled by default. V4 Pro calibration remains limited to the exact `deepseek-official/deepseek-v4-pro` route. V41 Flash calibration recognizes only `deepseek-official/deepseek-flash` and `deepseek-account/deepseek-flash`, whose native DSH catalog label is `DeepSeek-V41-Flash`; similarly named third-party models do not match.

A separately authorized credentialed smoke must prove the actual selected request route, DSMM prompt, successful tools, and subsequent model response without substituting another model. Account and API-key authentication are distinct; an AAPI key is not assumed valid for the official endpoint. Paid chat cannot replace the no-credential Docker/UI gate, and no publication, browser/UI, untested OS, or future-release claim follows from it.

Desktop package management uses the installation-owned `dsh.cmd` only while the app is fully quit. Even that carrier cannot boot or dump the reserved Desktop profile. Installation/manifest checks and isolated native model tests do not prove actual Electron-host activation: use an authorized native inventory or the desktop UI, never an anonymous RPC workaround.
