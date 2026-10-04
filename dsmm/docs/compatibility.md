# DSMM 0.1.1 Compatibility

## Compatibility authority

The current migration targets `@deepseek-ai/dsh@0.2.0-rc.2`, the official npm latest/next version resolved on 2026-10-03. `0.2.1-alpha.1` is an alpha channel, not the selected compatibility authority. The CLI's actual version and installed package identity must both match the pinned target.

DSH 0.1.1-rc.2 was the historical baseline; it is not the authority for this updated working tree. Installation ranges are not proof of compatibility with future releases.

The installation contracts include `@deepseek-ai/cordis@~4.0.4`, `@deepseek-ai/schemastery@~3.18.4`, and the package's declared DSH component peers pinned to `0.2.0-rc.2`. Role identity additionally consumes the native `@deepseek-ai/dsh-subagent` public contract; a child lifecycle or descriptor is not reimplemented.

## Compatibility matrix

| Surface | Fixed version or boundary | Evidence level |
| --- | --- | --- |
| Node.js | `>=22` | verified |
| DSH | `0.2.0-rc.2` | verified |
| Cordis | `~4.0.4` | supported by contract |
| DSH component peers | `0.2.0-rc.2` | supported by contract |
| Linux container | `Node 22 Bookworm` | verified |
| Windows | `Node >=22` | verified |
| macOS | `Node >=22` | supported by contract |
| Web | `host command/status` | supported by contract |
| Headless | `profile config and --dump-config` | verified |
| TUI | `DSH 0.2.0-rc.2` | unavailable |
| LSP/MCP | `external ocmm-lsp mcp` | optional |
| Runtime recovery | `process-local` | optional |
| Per-role model/effort/fallback policy | native request, subagent and descriptor seams | opt-in; exact configured capability required |
| DeepSeek V4 Pro calibration | `deepseek-official/deepseek-v4-pro` | optional |
| DeepSeek V41 Flash calibration | `native DeepSeek providers/deepseek-flash` | optional |

## Command and runtime boundaries

`/deepwork` and `/dsmm-status` are host-adapter commands, not headless task-text commands. Web exposes host command/status but has no custom panel.

Headless uses profile `cordis.patch.yml` plus `--dump-config`; real task execution requires a separately configured provider and uses `dsmm.defaultActive: true`. Old `$DSH_HOME/settings.yaml` namespaces must be migrated explicitly; DSMM does not mutate that file.

The old directory discovery `roots/includeUserRoot` no longer configures the native preset registry. DSMM uses native preset definitions in preset-capable hosts and role-specific subagent tool composition; ordinary native subagents otherwise inherit the parent preset. DSH's headless one-shot runner does not select or compose agent presets: headless role delegation must use native role tools, not a registry default. The original managed preset directory materializer remains an opt-in export facility, not discovery evidence.

## Evidence limits

The Linux packed-lifecycle smoke pins pnpm `12.8.1` and retains DSH's native `nodeLinker: hoisted` profile layout. On Linux Node 22, pnpm `11.9.0` with that layout and DSMM's auto-installed peer graph can print `Done` after removal without exiting; the same failure was reproduced directly without DSH, while `12.8.1` returned normally. A printed `Done` is not uninstall completion. This does not claim the same failure on Windows or modify a user's existing package manager or profile. The smoke enforces a bounded fail-closed timeout and checks actual remove/reinstall exits and profile state.

The matrix separates observed CLI/configuration and source-contract evidence from packed runtime and credentialed model evidence. See the dated migration/test report for actual completed checks; a version string or a successful unit test alone does not establish an end-to-end model result. Windows, Linux, Web, and macOS evidence are not interchangeable.

LSP/MCP and runtime recovery are disabled by default. V4 Pro calibration remains limited to the exact `deepseek-official/deepseek-v4-pro` route. V41 Flash calibration recognizes only `deepseek-official/deepseek-flash` and `deepseek-account/deepseek-flash`, whose native DSH catalog label is `DeepSeek-V41-Flash`; similarly named third-party models do not match.

A credentialed smoke must prove the actual selected request route, DSMM prompt, successful tools, and subsequent model response without substituting another model. Account and API-key authentication are distinct; an AAPI key is not assumed valid for the official endpoint. No publication, browser/UI, untested OS, or future-release claim follows from these checks.

Desktop package management uses the installation-owned `dsh.cmd` only while the app is fully quit. Even that carrier cannot boot or dump the reserved Desktop profile. Installation/manifest checks and isolated native model tests do not prove actual Electron-host activation: use an authorized native inventory or the desktop UI, never an anonymous RPC workaround.
