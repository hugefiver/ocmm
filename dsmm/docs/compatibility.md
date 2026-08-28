# DSMM v1.0 Compatibility

## Compatibility authority

`@deepseek-ai/dsh@0.1.1-rc.2` at commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` is the sole compatibility authority for this release. Only DSH 0.1.1-rc.2 is verified; peer ranges are installation contracts, not compatibility claims for later DSH releases.

The peer installation contracts are `@deepseek-ai/cordis@^4.0.1` and `@deepseek-ai/dsh-attachment`, `@deepseek-ai/dsh-brand`, `@deepseek-ai/dsh-invariants`, `@deepseek-ai/dsh-llm`, and `@deepseek-ai/dsh-timeout` at `^0.1.1-rc.2`.

## Compatibility matrix

| Surface | Fixed version or boundary | Evidence level |
| --- | --- | --- |
| Node.js | `>=22` | verified |
| DSH | `0.1.1-rc.2` | verified |
| Cordis | `^4.0.1` | supported by contract |
| DSH component peers | `^0.1.1-rc.2` | supported by contract |
| Linux container | `Node 22 Bookworm` | verified |
| Windows | `Node >=22` | supported by contract |
| macOS | `Node >=22` | supported by contract |
| Web | `host command/status` | supported by contract |
| Headless | `file config and --dump-config` | verified |
| TUI | `DSH 0.1.1-rc.2` | unavailable |
| LSP/MCP | `external ocmm-lsp mcp` | optional |
| Runtime recovery | `process-local` | optional |
| DeepSeek V4 Pro calibration | `deepseek-official/deepseek-v4-pro` | optional |

## Command and runtime boundaries

`/deepwork` and `/dsmm-status` are host-adapter commands, not headless task-text commands. Web exposes host command/status but has no custom panel.

Headless uses `$DSH_HOME/settings.yaml` or profile files plus `--dump-config`; real task execution requires a separately configured provider and uses `dsmm.defaultActive: true`.

DSH 0.1.1-rc.2 has no official TUI bundle; a future adapter may consume the pure status API.

## Evidence limits

Linux Node 22 Bookworm has complete packed-runtime proof. Windows and macOS have source/package tests only and no runtime claim.

LSP/MCP and runtime recovery are disabled by default. DeepSeek V4 Pro calibration applies only to the exact `deepseek-official/deepseek-v4-pro` route.

The evidence levels are `verified` for direct proof on the fixed surface, `supported by contract` for installation or host boundaries, `unavailable` for a missing rc.2 surface, and `optional` for disabled or external integrations.
