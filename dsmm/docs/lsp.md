# DSMM LSP boundary

This version doesn't enable DSMM-managed external LSP. The integration implementation, public interfaces and original `lsp` configuration are retained, but automatic MCP mounting stays off even when stored configuration contains `lsp.enabled:true`. Saving settings, enabling Deepwork or restarting the Host doesn't provide an activation path. DSMM's settings UI hides LSP controls.

The default `cordis.patch.yml` doesn't add an MCP client row. This restriction applies only to DSMM's automatic integration: it doesn't disable DSH's own LSP services or an MCP server independently configured by the operator. DSMM doesn't download servers or native binaries.

## Retained manual example

The historical [manual patch](../patches/ocmm-lsp-mcp.example.cordis.patch.yml) remains available as a native-host configuration reference, not a supported DSMM activation entry for this version. Independently managed MCP composition remains the operator's responsibility, including executable availability, namespace uniqueness and native lifecycle ownership.

The retained example describes:

- `serverName: dsmm_lsp`
- `command: ocmm-lsp`
- `args: ["mcp"]`, equivalent to running `ocmm-lsp mcp`
- `transport: stdio`
- `failOnStartupError: true`
- `toolCallTimeoutMs: 60000`

## Retained tool interface

An independently mounted native MCP client using `serverName: dsmm_lsp` uses the following tool names. This inventory describes the retained interface, not tools automatically available from DSMM in this version:

- `mcp__dsmm_lsp__status`
- `mcp__dsmm_lsp__diagnostics`
- `mcp__dsmm_lsp__goto_definition`
- `mcp__dsmm_lsp__find_references`
- `mcp__dsmm_lsp__find_symbol_related`
- `mcp__dsmm_lsp__symbols`
- `mcp__dsmm_lsp__prepare_rename`
- `mcp__dsmm_lsp__rename`
- `mcp__dsmm_lsp__format`

`format` applies the language server's document edits to the source file atomically. The debug adapter protocol (DAP) remains a separate debugging surface and is not an MCP tool.

DSMM's read-only role restrictions don't grant rename or format permission. The retained `lspRuntime` status interface reports bounded state, diagnostic codes and tool names, not executable paths, arguments or environment values. Tool discovery alone doesn't prove language-server availability or a successful symbol query.

DSMM 0.3.1 targets exactly DSH `0.2.1-rc.2`. Automatic external LSP mounting isn't delivered; the retained interface inventory isn't an activation path.

DSH's native definition/references/implementation/hover surface isn't a promise of diagnostics, rename or format. The retained external interface above doesn't expand that native scope. Independently managed MCP users must verify actual executable and language-server availability; DSMM doesn't certify or repair that environment.
