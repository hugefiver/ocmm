# LSP Integration Technical Reference

> Source: `omo/packages/lsp-core/`, `omo/packages/lsp-tools-mcp/`, `omo/packages/lsp-daemon/`, `omo/packages/omo-opencode/src/mcp/`
> **Note**: `omo/` refers to the gitignored reference implementation at `C:\Users\hugefiver\source\ocmm\omo\` (omo monorepo, npm `oh-my-opencode`). Paths in this doc are relative to that location.

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

Config paths searched: `.opencode/lsp.json`, `.omo/lsp.json`, `.omo/lsp-client.json`, `.codex/lsp-client.json` (project), `~/.codex/lsp-client.json` (user). Merge priority: project > user > builtin.

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

## 9. CRITICAL: ocmm Already Has These 7 LSP Tools

**IMPORTANT FINDING**: The current session's available tools include: `lsp_diagnostics`, `lsp_find_references`, `lsp_goto_definition`, `lsp_prepare_rename`, `lsp_rename`, `lsp_status`, `lsp_symbols` — these are the SAME 7 LSP tools provided by OpenCode's built-in LSP integration (via the IDE/host environment).

This means:
- **ocmm may NOT need its own LSP daemon** if OpenCode's built-in LSP is sufficient
- The daemon exists primarily for the **Codex edition** (where every tool call spawns a fresh process)
- For OpenCode-only plugins, the direct `omo-lsp` MCP process (lsp-tools-mcp) is sufficient — starts once per plugin load and stays warm

## 10. Migration Decision Matrix

| Approach | When to Use | Effort | Recommendation |
|----------|-------------|--------|----------------|
| **A. Skip LSP** — OpenCode built-in LSP is enough | If OpenCode's LSP works well in target environments | Zero | Default for ocmm |
| **B. Port lsp-core only** — register as stdio MCP, no daemon | If need broader language coverage than built-in | Medium (~30 source files) | If built-in insufficient |
| **C. Port full daemon** — lsp-core + lsp-daemon | If need shared daemon across sessions/cwd | High (~40 files + socket IPC) | Only if multi-cwd needed |

### Categorization
- **Type**: Infrastructure — depends on OpenCode's built-in LSP coverage assessment
- **Priority**: MEDIUM (OpenCode likely already provides this; verify gap first)
- **Effort**: LOW (skip) / MEDIUM (port core) / HIGH (port daemon)
- **Dependencies**: `@oh-my-opencode/mcp-stdio-core` (if porting)

### Migration steps (if porting — Approach B):
1. Port `lsp-core/src/lsp/` — manager, client, connection, json-rpc-connection, config-loader, server-definitions, server-resolution, server-installation, formatters, workspace-edit, language-mappings, directory-diagnostics
2. Port `lsp-core/src/mcp.ts` — `runMcpStdioServer()` handler
3. Port `lsp-core/src/tools/` — 7 tool executors
4. Skip: `lsp-daemon/src/` entirely (proxy, daemon-server, daemon-client, ensure-daemon, lock, socket-jsonrpc)
5. Adapt: Config paths from `.codex/lsp-client.json` to ocmm convention
6. Decide: Port all 51 server definitions or curate subset
7. Register as stdio MCP in ocmm's plugin config
