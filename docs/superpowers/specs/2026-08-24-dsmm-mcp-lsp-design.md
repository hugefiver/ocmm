# dsmm MCP/LSP Integration Design

Date: 2026-08-24

## Goal

Implement dsmm v0.5 by exposing ocmm's existing `ocmm-lsp mcp` server through dsh-native MCP client configuration while keeping dsmm's prompt/mode bundle usable with MCP/LSP fully disabled.

## Context and evidence

- `dsmm/docs/roadmap.md` defines v0.5 as MCP and LSP integration: provide dsh MCP client configuration for `ocmm-lsp` or a renamed wrapper, document diagnostics/symbols/definitions/references/rename tools, and verify the MCP server lists tools in Docker smoke.
- The ocmm package already exposes a Node bin wrapper named `ocmm-lsp` at `dist/cli/ocmm-lsp.js`. The wrapper locates the platform binary from optional platform packages, `dist/bin/`, `bin/`, Cargo build output, or `PATH`, then spawns it with the provided args.
- `crates/ocmm-lsp/tests/mcp_stdio.rs` proves `ocmm-lsp mcp` is a stdio MCP server and that `tools/list` exposes `status`, `diagnostics`, `goto_definition`, `find_references`, `find_symbol_related`, `symbols`, `prepare_rename`, and `rename`.
- Upstream dsh `@deepseek-ai/dsh-mcp-client` is a Cordis plugin requiring `tools`; one row connects to one MCP server. Stdio config uses `transport: stdio`, `serverName`, `command`, `args`, `env`, `cwd`, `toolCallTimeoutMs`, `failOnStartupError`, and optional `reconnect`. It exposes public tool names as `mcp__<serverName>__<rawToolName>`.
- dsh has no general CLI that simply prints the live tool registry. Reliable verification should combine direct `ocmm-lsp mcp` `tools/list` with dsh profile `--dump-config` and, where feasible, a programmatic or headless dsh MCP client smoke.

## Design choice

Use an opt-in dsh MCP bridge for the existing `ocmm-lsp mcp` server.

The default `dsmm/cordis.patch.yml` must not insert `@deepseek-ai/dsh-mcp-client`. A missing native binary or missing dsh MCP package must not break users who only want dsmm prompts, skills, role presets, and safety guards. Instead, dsmm v0.5 ships:

1. a small `dsmm/src/lsp.ts` helper module that renders and validates the dsh MCP row for ocmm-lsp;
2. an example patch under `dsmm/patches/ocmm-lsp-mcp.example.cordis.patch.yml`;
3. documentation under `dsmm/docs/lsp.md` describing tool names and enablement;
4. tests and Docker smoke checks that prove the patch shape and `ocmm-lsp mcp` `tools/list` surface.

This is preferred over adding an MCP row to the default bundle because v0.5 acceptance explicitly allows users to keep MCP/LSP disabled. It is also preferred over a dsh-native LSP service rewrite because the roadmap asks to expose ocmm's LSP value and the existing MCP server already carries the desired tool API.

## Interfaces

`dsmm/src/lsp.ts` owns the dsmm-side MCP/LSP configuration surface.

Expected exports:

```ts
export const DSMM_LSP_SERVER_NAME = "dsmm_lsp";
export const DSMM_LSP_TOOL_NAMES = [
  "status",
  "diagnostics",
  "goto_definition",
  "find_references",
  "find_symbol_related",
  "symbols",
  "prepare_rename",
  "rename"
] as const;

export interface DsmmLspMcpConfig {
  enabled: boolean;
  serverName: string;
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
  toolCallTimeoutMs: number;
  failOnStartupError: boolean;
}

export function resolveLspMcpConfig(input?: Partial<DsmmLspMcpConfig>): DsmmLspMcpConfig;
export function renderLspMcpPatch(config?: Partial<DsmmLspMcpConfig>): string;
export function publicLspToolName(rawName: DsmmLspToolName, serverName?: string): string;
```

Defaults:

- `enabled: false`
- `serverName: "dsmm_lsp"`
- `command: "ocmm-lsp"`
- `args: ["mcp"]`
- `env: {}`
- `toolCallTimeoutMs: 60000`
- `failOnStartupError: true` in the example patch and smoke configuration, so integration failures are loud when the user intentionally enables MCP/LSP.

The helper must validate dsh constraints without importing dsh MCP internals: `serverName` must match `[A-Za-z0-9_-]{1,32}`, command must be non-empty, args must be strings, and timeout must be a positive integer. This keeps dsmm tests independent from whether `@deepseek-ai/dsh-mcp-client` is installed locally.

## Patch shape

The example patch should be explicit and copyable:

```yaml
# Example only: opt-in dsmm LSP MCP bridge.
# Requires ocmm-lsp to be on PATH or command to be replaced with an absolute wrapper path.
- insert:
    - id: dsmm-lsp-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: dsmm_lsp
        command: ocmm-lsp
        args:
          - mcp
        env: {}
        cwd: ''
        toolCallTimeoutMs: 60000
        failOnStartupError: true
```

With this default server name, dsh model-facing tool names are:

- `mcp__dsmm_lsp__status`
- `mcp__dsmm_lsp__diagnostics`
- `mcp__dsmm_lsp__goto_definition`
- `mcp__dsmm_lsp__find_references`
- `mcp__dsmm_lsp__find_symbol_related`
- `mcp__dsmm_lsp__symbols`
- `mcp__dsmm_lsp__prepare_rename`
- `mcp__dsmm_lsp__rename`

## Settings and packaging

Add an `lsp` settings subtree to dsmm so users can see and test the disabled-by-default posture from code and docs:

```yaml
dsmm:
  lsp:
    enabled: false
    serverName: dsmm_lsp
    command: ocmm-lsp
    args: [mcp]
    toolCallTimeoutMs: 60000
    failOnStartupError: true
```

The settings do not mutate the active dsh plugin graph by themselves. dsh composition still comes from profile patches. This keeps the separation between settings plane and composition plane consistent with earlier dsmm work.

`dsmm/package.json` should include the new `patches/` and docs assets in the package tarball. It should not add `@deepseek-ai/dsh-mcp-client` as a hard runtime dependency unless implementation tests prove package resolution requires it. The example patch names the dsh plugin; the user's profile/dsh installation is responsible for resolving that plugin when enabled.

## Verification strategy

v0.5 verification has three layers:

1. Unit tests for `resolveLspSettings()`, `toDshMcpClientConfig()`, `renderLspMcpPatch()`, tool-name derivation, package asset inclusion, and disabled-by-default settings.
2. Direct MCP smoke against `ocmm-lsp mcp` using JSON-RPC `tools/list`, asserting the eight expected tools, then calling `diagnostics` against a temporary diagnostic-emitting LSP fixture. In source checkouts this may use the existing `dist/cli/ocmm-lsp.js` after `pnpm run build`, or a direct binary path in `dist/bin/` when present.
3. Docker smoke extension that verifies the opt-in patch is present, dsh `--dump-config --patch <patch>` includes the `@deepseek-ai/dsh-mcp-client` row, and a live dsh MCP client mount exposes and calls `mcp__dsmm_lsp__diagnostics` against the same temporary diagnostic fixture.

The roadmap acceptance says a disposable dsh profile can call at least one LSP diagnostic tool through MCP. v0.5 must therefore include a deterministic diagnostic-emitting LSP fixture in the smoke path rather than substituting `status` as the proof surface.

## Non-goals

- Do not make MCP/LSP part of the default `dsmm/cordis.patch.yml`.
- Do not replace ocmm-lsp with a dsh-native LSP service in v0.5.
- Do not depend on OpenCode `.mcp.json` shape or OpenCode MCP runtime behavior.
- Do not require global dsh config mutation; examples and smoke must use disposable profile/patch files.
- Do not add publishing or release packaging changes beyond dsmm-local package assets.

## Self-review

- Placeholder scan: no TBD/TODO placeholders remain.
- Internal consistency: the design consistently treats MCP/LSP as opt-in composition, not settings-only or default bundle behavior.
- Scope check: the work is one implementation plan focused on dsmm v0.5 artifacts, tests, docs, and smoke; dsh-native LSP service and release publishing remain outside scope.
- Ambiguity check: diagnostic proof is no longer ambiguous; the smoke path must exercise `diagnostics` through `ocmm-lsp mcp` and through the dsh MCP client bridge.
