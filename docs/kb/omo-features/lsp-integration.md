# LSP Integration Technical Reference

> Source: `omo/packages/lsp-core/`, `omo/packages/lsp-tools-mcp/`, `omo/packages/lsp-daemon/`, `omo/packages/omo-opencode/src/mcp/`
> **Note**: `omo/` refers to the gitignored reference implementation at `C:\Users\hugefiver\source\ocmm\omo\` (omo monorepo, npm `oh-my-opencode`). Paths in this doc are relative to that location.

> **Current ocmm status**: Migrated as a project-owned Rust stdio MCP server,
> `ocmm-lsp`. ocmm registers the built-in MCP name `lsp` with `ocmm-lsp mcp`
> by default, replacing the earlier upstream `omo-lsp mcp` dependency. The
> native server implements the seven upstream primary contracts, the local
> grouped `find_symbol_related` tool, and `lsp_*` aliases. It uses line or
> Content-Length JSON-RPC framing and supports project config at
> `.opencode/ocmm-lsp.json`, `.opencode/lsp.json`, and
> `.codex/lsp-client.json`.

## 1. Package Layering

```
omo-opencode (plugin) ── registers as tier-1 MCP "lsp"
        │
lsp-daemon (omo-lsp-daemon bin) ── stdio proxy + socket server
        │
lsp-tools-mcp (omo-lsp bin) ── thin re-export shim
        │
lsp-core (Bun/TS) ── harness-neutral engine: LspManager, LspClient, 7 tools
```

**Key insight**: `lsp-core` is the ONLY package with real logic. `lsp-tools-mcp` and `lsp-daemon` are thin deployment shims.

## 2. The 7 LSP Tools (Complete Contracts)

Defined in `lsp-core/src/tools/definitions.ts` as `LSP_MCP_TOOLS` array.

### Tool 1: `status` / `lsp_status`
- **Schema**: `{}` (no params)
- **Output**: Lists configured servers (install state + source) and active clients (aliveness + ref counts)

### Tool 2: `diagnostics` / `lsp_diagnostics`
- **Schema**: `filePath` (req), `severity` (enum: error|warning|information|hint|all)
- **Output**: Formatted diagnostic lines. Max 200.
- **Directory mode**: Walks directory, caps at 50 files, infers extension from most common
- **Errors**: Missing dependency → `missingDependencyResult` (install hint)

### Tool 3: `goto_definition` / `lsp_goto_definition`
- **Schema**: `filePath` (req), `line` (req, 1-based), `character` (req, 0-based)
- **Output**: Formatted location lines. Supports `LocationLink` (targetUri, targetRange, etc.)

### Tool 4: `find_references` / `lsp_find_references`
- **Schema**: `filePath` (req), `line` (req), `character` (req), `includeDeclaration` (bool, default true)
- **Output**: Formatted location lines. Max 200 references (truncated)

### Tool 5: `symbols` / `lsp_symbols`
- **Schema**: `filePath` (req), `scope` (req, enum: document|workspace), `query` (string), `limit` (number)
- **Output**: Hierarchical document symbols OR flat workspace symbols. Max 200 (configurable via `limit`)
- **Errors**: Workspace scope without query → `{errorKind: "missing_query"}`

### Tool 6: `prepare_rename` / `lsp_prepare_rename`
- **Schema**: `filePath` (req), `line` (req), `character` (req)
- **Output**: `PrepareRenameResult` (range + placeholder) or null

### Tool 7: `rename` / `lsp_rename`
- **Schema**: `filePath` (req), `line` (req), `character` (req), `newName` (req)
- **Output**: Apply result (success/failure with change/file counts)
- **Workspace edit application**: Uses `fs.writeFileSync`/`fs.renameSync`/`fs.unlinkSync` directly

### Bonus Tool 8: `install_decision` / `lsp_install_decision`
- **Schema**: `server_id` (req), `decision` (req, enum: declined|allowed)
- **Output**: Confirmation. Persisted to `~/.codex/lsp-client-install-decisions.json`

## 3. Core Architecture

### LspManager (`lsp/manager.ts`)
- Ref-counted client pool keyed by `${root}::${serverId}`
- Reaps idle clients (5min) and stuck-initializing (60s)
- API: `getClient()`, `releaseClient()`, `invalidateClient()`, `warmupClient()`, `stopAll()`, `getSnapshot()`
- Singleton via `getLspManager()` / `disposeDefaultLspManager()`

### LspClient (`lsp/client.ts`)
- Extends `LspClientConnection`
- Methods: `openFile()`, `definition()`, `references()`, `documentSymbols()`, `workspaceSymbols()`, `diagnostics()`, `prepareRename()`, `rename()`
- Manages opened files, tracks document versions, syncs text changes

### withLspClient (`lsp/client-wrapper.ts`)
```typescript
withLspClient(filePath, fn, toolName, options)
  → Resolves workspace root (walk up for .git/package.json/etc.)
  → Finds server for extension
  → Acquires client from manager
  → Calls fn, releases client
  → Retries once on dead connection (read-only tools only)
```

### 51 Built-in Server Definitions (`lsp/server-definitions.ts`)
Including: typescript, deno, vue, eslint, oxlint, biome (14 extensions), gopls, rust-analyzer, clangd, pyright, basedpyright, ruff, ty, bash-ls, jdtls (Java), lua-ls, php (intelephense), dart, terraform-ls, prisma, zls, razor, etc.

### Timeouts (`lsp/constants.ts`)
```
DEFAULT_MAX_REFERENCES       = 200
DEFAULT_MAX_SYMBOLS          = 200
DEFAULT_MAX_DIAGNOSTICS      = 200
DEFAULT_MAX_DIRECTORY_FILES  = 50
REQUEST_TIMEOUT_MS           = 15_000
INIT_TIMEOUT_MS              = 60_000
IDLE_TIMEOUT_MS              = 5 * 60_000  (5 min)
REAPER_INTERVAL_MS           = 60_000
```

## 4. Daemon Architecture (lsp-daemon)

Two subcommands of `omo-lsp-daemon`:
- `mcp` (default): stdio MCP **proxy** → forwards `tools/call` to daemon via socket
- `daemon`: **server** on socket

### IPC Protocol Flow
```
Host (OpenCode agent)
  │  stdin/stdout (MCP stdio JSON-RPC)
  ▼
omo-lsp-daemon mcp (PROXY)
  │  unix socket / named pipe (newline-delimited JSON-RPC)
  ▼
omo-lsp-daemon daemon (SERVER)
  ├── handleDaemonMessage()
  │     ├── extractRequestContext() → strips _context
  │     ├── runWithRequestContext(cwd, env)
  │     │     └── handleLspMcpRequest() → executeLspTool()
  └── LspManager
        └── LspClient instances
              └── language server process (stdio JSON-RPC)
```

### Socket paths
```
Base dir: $CODEX_LSP_DAEMON_DIR → $PLUGIN_DATA/daemon → ~/.codex/codex-lsp/daemon
Under: v<version>/
  socket:  <dir>/daemon.sock  (Unix) or \\.\pipe\omo-lsp-<version>-<sha256[:16]> (Windows)
  lock:    <dir>/daemon.lock
  pid:     <dir>/daemon.pid
  log:     <dir>/daemon.log
```

### Daemon lifecycle
- **Lazy startup**: `ensureDaemonRunning()` — probe → lock → spawn detached → poll until reachable
- **Idle shutdown**: Checks every 60s, shuts down after 30min with no connections AND no active LSP clients
- **Cleanup**: Removes socket/PID/endpoint files, disposes `LspManager`

### RequestContext (`request-context.ts`)
- `AsyncLocalStorage`-based cwd/env threading
- Critical for shared daemon mode (one process serves multiple working dirs)
- **Irrelevant for per-session MCP mode**

## 5. OpenCode Integration

### Registration (`omo-opencode/src/mcp/lsp.ts`)
`createLspMcpConfig()` resolves daemon CLI path:
1. **Dist CLI**: `packages/lsp-daemon/dist/cli.js` in ancestor walk → `node <path> mcp`
2. **Source CLI**: `packages/lsp-daemon/src/cli.ts` + tools dist → `bun <path> mcp`
3. **Bootstrap**: Inline Node.js script that builds packages then launches

Environment variable set: `LSP_TOOLS_MCP_PROJECT_CONFIG = .opencode/lsp.json:.omo/lsp.json:.omo/lsp-client.json`

### ocmm registration (`src/mcp/index.ts`)

`createBuiltinMcps()` registers the OpenCode MCP named `lsp` with a local
stdio command resolved by `resolveOcmmLspCommand()`:

1. `OCMM_LSP_COMMAND` when explicitly set. JSON arrays are treated as exact
   commands; plain strings receive the `mcp` argument.
2. Bundled release binaries under `dist/bin/` (platform target first, fallback
   binary name second).
3. Local Cargo release/debug binaries under `target/`.
4. `cargo run --manifest-path crates/ocmm-lsp/Cargo.toml -- mcp` when source is
   present and Cargo is on PATH.
5. A PATH `ocmm-lsp`.
6. Disabled built-in config when none of the above exists.

ocmm sets `OCMM_LSP_PROJECT_CONFIG` to this path list (using the platform path
delimiter, `:` on POSIX and `;` on Windows):

```
.opencode/ocmm-lsp.json:.opencode/lsp.json:.codex/lsp-client.json
```

Use `disabledMcps:["lsp"]` to turn it off, or define `mcp.servers.lsp` to
replace the built-in command.

### Config Gating (`oh-my-opencode-config.ts`)
```jsonc
{
  "disabled_mcps": ["lsp"],      // Disable LSP MCP
  "mcp_env_allowlist": ["VAR"]   // Env vars allowed through to MCPs
}
```

### Tool Registration
LSP tools are NOT registered in the `tool` hook. They come from the built-in MCP server "lsp". OpenCode discovers them via `tools/list`.

LSP tools appear in `LOW_PRIORITY_TOOL_ORDER` for `max_tools` trimming.

## 6. LSP Client Config Format

```json
{
  "lsp": {
    "typescript": {
      "command": ["typescript-language-server", "--stdio"],
      "extensions": [".ts", ".tsx", ".js", ".jsx"],
      "disabled": false,
      "priority": 0,
      "env": { "NODE_OPTIONS": "--max-old-space-size=4096" },
      "initialization": { "diagnostics": { "enable": true } }
    },
    "rust": { "disabled": true }
  }
}
```

Upstream config paths searched: `.opencode/lsp.json`, `.omo/lsp.json`, `.omo/lsp-client.json`, `.codex/lsp-client.json` (project), `~/.codex/lsp-client.json` (user). Merge priority: project > user > builtin.

ocmm config paths searched by `ocmm-lsp`: `.opencode/ocmm-lsp.json`, `.opencode/lsp.json`, `.codex/lsp-client.json` (project), then `~/.config/opencode/ocmm-lsp.json` (user). `OCMM_LSP_PROJECT_CONFIG` and `OCMM_LSP_USER_CONFIG` can override those paths. Builtin ids inherit command/extensions; custom ids are valid when a config entry supplies both `command` and `extensions`.

## 7. Dependencies

| Package | Deps | Notes |
|---------|------|-------|
| **lsp-core** | `@oh-my-opencode/mcp-stdio-core` (workspace) | Only workspace dep; custom JSON-RPC (NOT `vscode-jsonrpc`) |
| **lsp-tools-mcp** | lsp-core + mcp-stdio-core (file: links) | Dev deps only |
| **lsp-daemon** | Same as lsp-tools-mcp | Same pattern |

**NO external npm packages beyond workspace links.** Custom JSON-RPC framing in `src/lsp/json-rpc-connection.ts`.

## 8. Test Coverage (38 test files)

### lsp-core (3 files)
- `tool-surface.test.ts` — tool definitions (names, aliases, schemas)
- `mcp-protocol-pin.test.ts` — MCP JSON-RPC compliance
- `lsp/utils.test.ts` — utility functions

### lsp-tools-mcp (25 files)
Covers: tool dispatch, manager lifecycle, client-wrapper, LSP process, JSON-RPC, server definitions, server resolution, install state, install security, config loading, config security, startup failure, request context, workspace edit, transport security, formatters, effective extension, directory diagnostics, initialize timeout, utils, package smoke.

### lsp-daemon (10 files)
Covers: daemon round-trip, client connection, client retry, daemon startup, proxy, proxy protocol, request routing, socket JSON-RPC, paths, lock.

### omo-opencode (1 file)
- `src/mcp/lsp.test.ts` — `createLspMcpConfig()`: CLI resolution, bootstrap, security, disable when missing

## 9. ocmm Native LSP Migration Result

The previous assessment was that OpenCode environments may already expose the
7 LSP tools. The migration decision is now settled for ocmm: we ship a native
`ocmm-lsp` stdio MCP and register it as the default built-in `lsp` MCP when it
can be resolved. This removes the runtime dependency on upstream `omo-lsp` and
keeps the tool surface available in isolated OpenCode test environments.

The eight canonical tools are:
- `status` / `lsp_status`
- `diagnostics` / `lsp_diagnostics`
- `goto_definition` / `lsp_goto_definition`
- `find_references` / `lsp_find_references`
- `find_symbol_related` / `lsp_find_symbol_related`
- `symbols` / `lsp_symbols`
- `prepare_rename` / `lsp_prepare_rename`
- `rename` / `lsp_rename`

Symbol-related requests accept `filePath`, one-based `line`, and zero-based
`character`. `find_symbol_related` runs definition, implementation, and
references sequentially in one fresh language-server session. Each group has
status `ok`, `unsupported`, or `error`, with canonical URI/range items.
Failures use structured `code`, `message`, and `data`; unsupported capabilities
use JSON-RPC code `-32601`. Items are deduplicated within each group. When a
server returns a `LocationLink`, the native server uses `targetUri` with
`targetSelectionRange` when available, then falls back to `targetRange`.
Process shutdown is bounded and graceful. On Windows, the server creates an
unnamed `KILL_ON_JOB_CLOSE` Job Object, launches the wrapper suspended, assigns
it to the Job, verifies its initial thread owner, and resumes only after that
ownership barrier succeeds. The Job remains open during the graceful-exit
window; timeout terminates the Job and boundedly polls the direct child for
reaping. The cleanup primitive returns any failure to its caller, while
`LspSession::shutdown()` intentionally treats cleanup as best-effort. Other
platforms retain bounded direct-child cleanup. There is no daemon.

This migration intentionally does not port the full upstream daemon. The native
server is a direct stdio MCP process with a curated builtin language-server
table and project/user config overrides.

## 10. Migration Decision Matrix

| Approach | When to Use | Effort | Recommendation |
|----------|-------------|--------|----------------|
| **A. Skip LSP** — OpenCode built-in LSP is enough | If a host already guarantees these tools | Zero | Superseded for ocmm default |
| **B. Port core as stdio MCP, no daemon** | If need stable bundled tools without upstream runtime dependency | Medium | **Chosen: native Rust `ocmm-lsp`** |
| **C. Port full daemon** — lsp-core + lsp-daemon | If need shared daemon across sessions/cwd | High (~40 files + socket IPC) | Future-only if multi-cwd reuse becomes necessary |

### Categorization
- **Type**: Infrastructure — depends on OpenCode's built-in LSP coverage assessment
- **Priority**: Done for core stdio MCP; daemon remains low priority.
- **Effort**: Implemented as a standalone Rust crate instead of importing upstream TS packages.
- **Dependencies**: Cargo + `serde`/`serde_json`/`anyhow`; no upstream omo runtime dependency.

### Historical migration checklist (superseded by native Rust implementation)
1. Port `lsp-core/src/lsp/` — replaced by `crates/ocmm-lsp/src/main.rs`.
2. Port `lsp-core/src/mcp.ts` — replaced by native stdio JSON-RPC handling.
3. Port `lsp-core/src/tools/` — covered by the seven upstream-compatible native handlers plus local find_symbol_related aggregation.
4. Skip `lsp-daemon/src/` — still skipped; no shared socket daemon locally.
5. Adapt config paths — done with `.opencode/ocmm-lsp.json`, `.opencode/lsp.json`, and `.codex/lsp-client.json`.
6. Decide server definitions — currently a curated builtin table plus config overrides.
7. Register as stdio MCP in ocmm's plugin config — done through `createBuiltinMcps()`.
