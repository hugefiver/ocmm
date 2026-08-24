# dsmm LSP MCP Integration

dsmm v0.5 keeps LSP/MCP disabled by default. The default `cordis.patch.yml` installs only the dsmm prompt, skill, guard, and preset behavior; it does not add an MCP client row.

Enable LSP support only in an explicit dsh profile by applying the opt-in patch at `patches/ocmm-lsp-mcp.example.cordis.patch.yml`. The patch inserts one `@deepseek-ai/dsh-mcp-client` row named `dsmm-lsp-mcp` that starts `ocmm-lsp mcp` over stdio.

## dsh MCP patch settings

The example patch uses these LSP/MCP settings:

- `serverName: dsmm_lsp`
- `command: ocmm-lsp`
- `args: ["mcp"]`, equivalent to running `ocmm-lsp mcp`
- `transport: stdio`
- `failOnStartupError: true`
- `toolCallTimeoutMs: 60000`

If `ocmm-lsp` is not on `PATH`, copy the example patch and replace `command: ocmm-lsp` with an absolute wrapper path for the environment where dsh will run.

## Tools exposed to dsh

With `serverName: dsmm_lsp`, the dsh MCP client exposes these public tool names to the model:

- `mcp__dsmm_lsp__status`
- `mcp__dsmm_lsp__diagnostics`
- `mcp__dsmm_lsp__goto_definition`
- `mcp__dsmm_lsp__find_references`
- `mcp__dsmm_lsp__find_symbol_related`
- `mcp__dsmm_lsp__symbols`
- `mcp__dsmm_lsp__prepare_rename`
- `mcp__dsmm_lsp__rename`

## Verification

Direct MCP verification should start `ocmm-lsp mcp`, send a JSON-RPC `tools/list` request, and assert that the eight raw MCP tools are present: `status`, `diagnostics`, `goto_definition`, `find_references`, `find_symbol_related`, `symbols`, `prepare_rename`, and `rename`. It should also call the `diagnostics` tool against a temporary diagnostic-emitting LSP fixture to prove the server can route a real LSP request.

Docker bridge verification should install dsmm into a disposable dsh profile, apply `patches/ocmm-lsp-mcp.example.cordis.patch.yml`, mount `@deepseek-ai/dsh-mcp-client`, and call `mcp__dsmm_lsp__diagnostics` against the same temporary diagnostic fixture. This proves the dsh MCP bridge sees the public tool name and can pass the diagnostic request through to `ocmm-lsp mcp`.
