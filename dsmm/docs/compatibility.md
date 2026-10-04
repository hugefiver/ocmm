# DSMM 0.1.2 Compatibility and Upgrade

This document describes the 0.1.2 source contract and required acceptance evidence. It does not claim that the final 0.1.2 artifact has passed Docker, been published, or been activated in Desktop. Historical 0.1.1 checks are not substitute evidence for this update.

## Compatibility authority

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
| Native Settings | additive DSMM Profiles client and authenticated RPC | compiled UI/RPC/storage and actual Desktop are separate proofs |
| Headless | deployment config and native role tools | no Agent preset selection in the one-shot runner |
| TUI | `DSH 0.2.0-rc.2` | unavailable |
| LSP/MCP | `external ocmm-lsp mcp` | optional |
| Runtime recovery | `process-local` | optional |
| Per-role model/effort/fallback policy | native request, subagent and descriptor seams | opt-in; exact configured capability required |
| Runtime profiles | independent drafts, immutable revisions, minimal pointer | new-Agent application; no historical snapshot guarantee after restart |
| Durable DSMM metadata | deployment-only `sessionPersistence` on main DSMM entry | explicit startup integration; frozen-artifact/production acceptance pending |
| DeepSeek V4 Pro calibration | `deepseek-official/deepseek-v4-pro` | optional |
| DeepSeek V41 Flash calibration | `native DeepSeek providers/deepseek-flash` | optional |

## Command and runtime boundaries

`/deepwork` and `/dsmm-status` are host-adapter commands, not headless task-text commands. The 0.1.2 native client adds Settings → DSMM Profiles without replacing native navigation, provider/account UI, or the Agent preset selector. There are no model-visible profile-management tools or anonymous file endpoints.

Headless uses profile `cordis.patch.yml` plus `--dump-config`; real task execution requires a separately configured provider and uses `dsmm.defaultActive: true`. Old `$DSH_HOME/settings.yaml` namespaces must be migrated explicitly; DSMM does not mutate that file.

The old directory discovery `roots/includeUserRoot` no longer configures the native preset registry. DSMM registers only enabled `primary`/`all` roots: Orchestrator, Builder and Planner. Disabled Builder is absent from both selector and child tools. The other nine roles remain auxiliary delegation roles; all twelve static `agent-presets/` directories are inspection templates, not scan roots. The loading correction is native `persona.prefix` plus instructions `maxBytes: 65536`.

DSH's headless one-shot runner does not select or compose Agent presets: headless role delegation must use native role tools, not a registry default. Native preset selection must be tested through a preset-capable host with a blank session. The managed preset-directory materializer remains an opt-in export facility, not discovery evidence.

Trusted live, owned, zero-prefix native one-shot children preserve supported explicit provider/model/effort overrides through final request headers. The role primary supplies alias defaults; it is not an unconditional child override. Roots, cold/unowned children and parent-seeded forks retain profile-primary resolution. `modelSelectionSettings:false` and native tool/permission/depth/cancellation limits are unchanged; this adds no model-visible model-selection authority. See [model routing](model-routing.md).

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

Every existing live Agent, **including a blank Agent**, retains its admitted runtime settings when a profile is applied/reset. Children and recovery inherit the parent snapshot. Retention ends with the live Host: after restart, cold-resumed sessions use the current selected revision and native current definition. There is no cross-restart historical profile snapshot guarantee.

Older sessions directly selected into now-auxiliary roles can fail native cold resume because their root preset ID is no longer registered. This is a known native compatibility limitation, not permission to silently replace the persona, reset a session, or erase its history. Disclose it before rollout and preserve historical data; if restoring such sessions is required, stop and obtain direction rather than substituting a root. Package rollback does not authorize history or credential changes.

Global/system Desktop migration is the **third phase**: independent frozen-artifact Docker acceptance first, verified immutable npm/GitHub publication second, and only then authorized Desktop package/configuration changes. Preserve unrelated deployment rows, account/provider catalog, role policies (including disabled Builder), active mode, and UI preferences. Use the installation-owned carrier with the app fully quit; neither standalone CLI nor a renamed/copied Desktop profile is a supported substitute.

## Evidence limits

The Linux packed-lifecycle smoke pins pnpm `12.8.1` and retains DSH's native `nodeLinker: hoisted` profile layout. On Linux Node 22, pnpm `11.9.0` with that layout and DSMM's auto-installed peer graph can print `Done` after removal without exiting; the same failure was reproduced directly without DSH, while `12.8.1` returned normally. A printed `Done` is not uninstall completion. This does not claim the same failure on Windows or modify a user's existing package manager or profile. The smoke enforces a bounded fail-closed timeout and checks actual remove/reinstall exits and profile state.

The matrix separates required 0.1.2 evidence from historical CLI/configuration, source-contract and credentialed model evidence. A version string or unit test alone establishes neither native preset health nor UI/runtime behavior. Windows, Linux, Web, and macOS evidence are not interchangeable.

The independent Docker gate installs the exact frozen tarball into a fresh pinned native runtime/home and verifies root selection, actual read-only child denials, aliased-parent route preflight, runtime snapshot behavior, and the **same compiled DSMM UI** using native client/slots/RPC and real profile storage. A supported composition-owned in-process operator/Gateway carrier and test-owned browser bridge provide no-credential native component/RPC/storage proof. No user login, copied cookie, launcher token, browser state, Desktop data, account records or authentication bypass is permitted. This proof is not authenticated Desktop/Web-launch proof; actual Desktop mounting and authorized operations remain the later check.

LSP/MCP and runtime recovery are disabled by default. V4 Pro calibration remains limited to the exact `deepseek-official/deepseek-v4-pro` route. V41 Flash calibration recognizes only `deepseek-official/deepseek-flash` and `deepseek-account/deepseek-flash`, whose native DSH catalog label is `DeepSeek-V41-Flash`; similarly named third-party models do not match.

A separately authorized credentialed smoke must prove the actual selected request route, DSMM prompt, successful tools, and subsequent model response without substituting another model. Account and API-key authentication are distinct; an AAPI key is not assumed valid for the official endpoint. Paid chat cannot replace the no-credential Docker/UI gate, and no publication, browser/UI, untested OS, or future-release claim follows from it.

Desktop package management uses the installation-owned `dsh.cmd` only while the app is fully quit. Even that carrier cannot boot or dump the reserved Desktop profile. Installation/manifest checks and isolated native model tests do not prove actual Electron-host activation: use an authorized native inventory or the desktop UI, never an anonymous RPC workaround.
