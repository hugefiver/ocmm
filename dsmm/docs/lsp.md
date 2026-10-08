# dsmm LSP MCP Integration

dsmm keeps LSP/MCP disabled by default. The default `cordis.patch.yml` installs only the dsmm prompt, skill, guard, and preset behavior; it does not add an MCP client row.

Enable DSMM-managed LSP with explicit `lsp.enabled:true` in the global/native deployment layer. Startup resolves the already-installed `@deepseek-ai/dsh-mcp-client` public package from trusted `profileContext.installAnchor`, mounts its namespace plugin through Cordis and awaits initial tool synchronization. No private Loader import, persisted extra row, home/directory guess, hardcoded SDK path or installation is involved. Missing anchor/package/tools report sanitized unavailable state; `failOnStartupError:true` fails startup. No fake successful tool is registered.

The separate opt-in patch at `patches/ocmm-lsp-mcp.example.cordis.patch.yml` remains a manual native-host alternative. Do not enable both with the same `serverName`: the native bridge owns namespace uniqueness. The default `cordis.patch.yml` remains unchanged and LSP is **disabled by default**.

## dsh MCP patch settings

The example patch uses these LSP/MCP settings:

- `serverName: dsmm_lsp`
- `command: ocmm-lsp`
- `args: ["mcp"]`, equivalent to running `ocmm-lsp mcp`
- `transport: stdio`
- `failOnStartupError: true`
- `toolCallTimeoutMs: 60000`

If `ocmm-lsp` is not on `PATH`, explicitly configure the already-installed executable/wrapper. DSMM never downloads a server or native binary. LSP mounting uses frozen startup settings: desired save/new admission cannot start/stop/reconcile MCP; differences are restart-required. Actual scope teardown remains native-owned and closes the connection/process and unregisters its tool generation.

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
- `mcp__dsmm_lsp__format`

`format` applies the language server's document edits to the source file atomically. The debug adapter protocol (DAP) remains a separate debugging surface and is not an MCP tool.

Read-only roles permit status/diagnostics/navigation/symbol lookup and prepare-rename, but not rename/format. Exact Agent/definition/realm guards enforce this independently of common/helper toggles. `lspRuntime` is a safe status projection containing state, fixed diagnostic code and tool names, never paths/arguments/environment values. Bridge-ready is not proof that a language server is installed or capable: native diagnostics must report actual availability/failure.

The keyless native test mounts the installed `ocmm-lsp` through real MCP, checks all nine actual names including symbol-related, calls status, exercises cancellation/read-only rejection, confirms desired off does not remount, and awaits owned process exit/tool withdrawal. rc.2's auto protocol negotiation may close an initial stdio probe and start the negotiated transport; this is native-equivalent, not multiple simultaneous established servers or a DSMM retry scheduler.

## Verification

The Windows native cold-query proof uses the unchanged test and a byte-identical, already-installed executable copied into a run-owned temporary fixture. Its first empty-cache request returns one definition and two references; no warm-up, retry, request rewriting or opaque-target parsing is involved. This is isolated bridge verification, not a production relocation policy.

The original workspace executable entry still fails in this environment: an owned managed child can read its marker but receives `EPERM` when creating an owned log. The same executable bytes at the temporary entry complete the native query. The underlying protection/permission mechanism has not been identified; this is not proof of a URI or compilation defect, and the default entry has not been repaired. DSMM does not copy binaries persistently, install servers or change system protection/permissions to bypass that restriction. Report actual server failure rather than treating tool discovery or bridge-ready as a successful symbol query.

Direct MCP verification should start `ocmm-lsp mcp`, send a JSON-RPC `tools/list` request, and assert that the nine raw MCP tools are present: `status`, `diagnostics`, `goto_definition`, `find_references`, `find_symbol_related`, `symbols`, `prepare_rename`, `rename`, and `format`. It should call `diagnostics` and `format` against a temporary LSP fixture, then read back the formatted source file.

Docker bridge verification should install dsmm into a disposable dsh profile, apply `patches/ocmm-lsp-mcp.example.cordis.patch.yml`, mount `@deepseek-ai/dsh-mcp-client`, and call `mcp__dsmm_lsp__diagnostics` against the same temporary diagnostic fixture. This proves the dsh MCP bridge sees the public tool name and can pass the diagnostic request through to `ocmm-lsp mcp`.
