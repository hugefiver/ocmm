# MCP Infrastructure

> **Source**: `omo/packages/mcp-stdio-core/`, `omo/packages/mcp-client-core/`, `omo/packages/omo-opencode/src/mcp/`, `omo/packages/skills-loader-core/`
> **Status**: Not migrated. MEDIUM migration value.
> **Principle**: mcp-stdio-core + mcp-client-core = third-party (import); built-in MCPs + skill embedding = omo-own (reimplement config)
> **Note**: `omo/` refers to the gitignored reference implementation at `C:\Users\hugefiver\source\ocmm\omo\` (omo monorepo, npm `oh-my-opencode`). Paths in this doc are relative to that location.

## Architecture

3 layers:

```
mcp-stdio-core     → Zero-dep JSON-RPC 2.0 stdio framing (5 subpath exports)
mcp-client-core    → Client lifecycle + OAuth (30 src files)
omo-opencode/src/mcp/ → 5 built-in MCPs + config merge + skill embedding
```

## 1. mcp-stdio-core (`@oh-my-opencode/mcp-stdio-core`)

**Zero dependencies**. JSON-RPC 2.0 stdio framing and dispatch primitives. Consumed by LSP MCP servers, git-bash-mcp, lsp-daemon.

### Public API (5 subpath exports)

| Export | Key Exports |
|--------|------------|
| `./types` | `JsonRpcId`, `TextContent`, `McpToolDescriptor`, `JsonRpcError`, `JsonRpcResult`, `JsonRpcResponse`, `McpLifecycleLog` |
| `./record` | `isPlainRecord(value)` — type guard for `Record<string, unknown>` |
| `./responses` | `successResponse(id, result)`, `errorResponse(id, code, msg, data?)`, `jsonRpcId(value)`, `messageFromError(error)` |
| `./server` | `runJsonRpcStdioServer(config)` — async generator event loop with idle timeout |
| `./transport` | `readStdioJsonRpcMessages(input)` — async generator; `writeStdioJsonRpcResponse(output, response, mode)` |

### Dual Framing

Auto-detected by scanning buffer prefix for `content-length:`:
- `"line"` mode: `\n`-delimited JSON
- `"framed"` mode: `Content-Length: N\r\n\r\n` + body (per MCP spec)

### Server Lifecycle

```typescript
interface JsonRpcStdioServerConfig<HandlerOptions> {
  input: Readable
  output: Writable
  handler: McpRequestHandler<HandlerOptions>  // (input, options) => Promise<JsonRpcResponse | undefined>
  handlerOptions: HandlerOptions
  idleTimeoutMs?: number        // default: 600000 (10 min)
  onIdleTimeout?: () => void | Promise<void>
  log?: McpLifecycleLog
  parseErrorResponse?: (message: string) => JsonRpcResponse | undefined
  onHandlerError?: (error: unknown) => void
}
```

Idle timeout uses `timer.unref()` — never keeps process alive. Handler returns `undefined` to skip silently. Parse errors get default `-32700` response unless `parseErrorResponse` override is provided.

## 2. mcp-client-core (`@oh-my-opencode/mcp-client-core`)

Harness-neutral MCP client lifecycle + OAuth primitives. Consumes `@modelcontextprotocol/sdk ^1.29.0` (protocol v2025-03-26). 30 source files under `src/`.

### Public API (3 subpath groups)

| Export | Key Exports |
|--------|------------|
| `.` (barrel) | Re-exports `mcp-oauth/*` + `skill-mcp-manager/*` |
| `./mcp-oauth` | `McpOAuthProvider`, `discoverOAuthServerMetadata`, `getOrRegisterClient`, `buildAuthorizationUrl`, `generateCodeVerifier`, `generateCodeChallenge`, `startCallbackServer`, `runAuthorizationCodeRedirect`, `loadToken`, `saveToken`, `deleteToken`, `withRefreshMutex`, `isStepUpRequired`, `mergeScopes` |
| `./skill-mcp-manager` | `SkillMcpManager`, `buildSkillMcpClientKey`, `SkillMcpClientInfo`, `SkillMcpManagerState`, `McpClient`, `ConnectionType`, `ManagedClient` |

### Transport Types

- **stdio**: `StdioClientTransport` (local process via `command`/`args`)
- **HTTP**: `StreamableHTTPClientTransport` (remote server via `url`), replacing legacy `"sse"` type
- Detection: explicit `type` field > `url` presence > `command` presence

### Client Operations

`listTools()`, `listResources()`, `listPrompts()`, `callTool()`, `readResource()`, `getPrompt()` — all wrapped with 3-attempt retry + OAuth step-up.

## 3. Built-in MCPs (Tier 1)

Registered by `createBuiltinMcps()` in `omo/packages/omo-opencode/src/mcp/index.ts`:

| MCP | Type | URL/Command | Auth | Tools |
|-----|------|-------------|------|-------|
| **websearch** | remote | `https://mcp.exa.ai/mcp?tools=web_search_exa` (Exa) or `https://mcp.tavily.com/mcp/` (Tavily) | `EXA_API_KEY` or `TAVILY_API_KEY` | Web search |
| **context7** | remote | `https://mcp.context7.com/mcp` | `CONTEXT7_API_KEY` (optional) | Library docs |
| **grep_app** | remote | `https://mcp.grep.app` | None | GitHub code search |
| **lsp** | local stdio | Vendored `lsp-tools-mcp` / `lsp-daemon` | None | 7 lsp_* tools |
| **codegraph** | local stdio | `codegraph serve --mcp` | None | 8 codegraph_* tools |

## 4. Skill-Embedded MCP Manager (Tier 3)

### SKILL.md YAML Frontmatter Parsing

```yaml
---
name: my-skill
description: What this skill does
mcp:
  server-name:
    type: stdio                    # "stdio" | "http" | "sse" (legacy → http)
    command: npx
    args: [-y, @some/mcp-server]
    url: https://example.com/mcp   # for http
    headers:
      Authorization: Bearer ${API_KEY}
    env:
      MY_VAR: value
    oauth:
      clientId: my-client-id
      scopes: [read, write]
---
```

Parsed by `parseSkillMcpConfigFromFrontmatter()` in `packages/skills-loader-core/src/features/opencode-skill-loader/skill-mcp-config.ts`:

```typescript
export function parseSkillMcpConfigFromFrontmatter(content: string): SkillMcpConfig | undefined {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch) return undefined
  const parsed = yaml.load(frontmatterMatch[1]) as Record<string, unknown>
  if (parsed && typeof parsed === "object" && "mcp" in parsed && parsed.mcp) {
    return parsed.mcp as SkillMcpConfig
  }
  return undefined
}
```

Skills can also provide MCPs via companion `mcp.json` file (takes precedence over frontmatter).

### OAuth Flow (PKCE + DCR)

1. **Discovery**: `discoverOAuthServerMetadata(serverUrl)` → fetches `/.well-known/oauth-protected-resource`, then `/.well-known/oauth-authorization-server` (with caching)
2. **DCR**: `getOrRegisterClient()` → POST to `registrationEndpoint` (RFC 7591); falls back to static `clientId` if DCR unavailable
3. **PKCE**: `generateCodeVerifier()` (32 random bytes, base64url) → `generateCodeChallenge(verifier)` (SHA-256, base64url)
4. **Browser redirect**: `runAuthorizationCodeRedirect()` → opens system browser → local callback server (`http://127.0.0.1:{port}/oauth/callback`, 5 min timeout)
5. **Token exchange**: POST to `tokenEndpoint` with `authorization_code` grant + PKCE verifier
6. **Storage**: `~/.config/opencode/mcp-oauth/{server-hash}.json` (0600 permissions, atomic writes via temp file + rename)
7. **Refresh**: `withRefreshMutex()` prevents concurrent refresh storms per server URL
8. **Step-up**: On 403 with `WWW-Authenticate: Bearer scope="..."` header → merge scopes, re-authenticate
9. **Post-request refresh**: On 401/403 → try token refresh before failing

### Lifecycle

```
session.created → no action (lazy connection)
First MCP tool call → getOrCreateClient() creates + caches (race-safe via pendingConnections map)
Ongoing use → lastUsedAt timestamp updated
Idle >5 min → cleanup timer removes (60s interval, unref'd)
session.deleted → disconnectSession() closes all session clients
Process exit → disconnectAll() via SIGINT/SIGTERM/SIGBREAK handlers
```

**Client key format**: `${sessionID}:${skillName}:${serverName}` — enables per-session isolation.

## 5. Config Schema Fields

From `OhMyOpenCodeConfigSchema`:

```typescript
disabled_mcps: z.array(AnyMcpNameSchema).optional()          // ["websearch","context7","grep_app","lsp","codegraph"]
mcp_env_allowlist: z.array(z.string()).optional()             // env var allowlist for .mcp.json ${VAR}
websearch: WebsearchConfigSchema.optional()                   // { provider?: "exa" | "tavily" }
codegraph: CodegraphConfigSchema.optional()                   // { auto_provision, enabled, install_dir, telemetry, watch_debounce_ms }
claude_code: ClaudeCodeConfigSchema.optional()                // { mcp?: boolean } — master switch for .mcp.json
```

### MCP Merge Order (last wins)

```
1. createBuiltinMcps()              → Tier-1 built-in MCPs
2. .mcp.json (from loadMcpConfigs()) → Tier-2 Claude Code MCPs with ${VAR} env expansion
3. user mcp config                  → User overrides
4. plugin components (mcpServers)   → Plugin-provided MCPs
5. disabled_mcps filter             → Remove matching MCPs from all sources
```

## 6. Integration in omo-opencode

### Hook Registration

The `config` hook triggers a 6-phase pipeline. Phase 5 (`applyMcpConfig` in `mcp-config-handler.ts`) merges all MCP sources:

```typescript
const merged = {
  ...createBuiltinMcps(disabledMcps, pluginConfig, { cwd }),
  ...mcpResult.servers,       // from .mcp.json
  ...(userMcp ?? {}),
  ...pluginComponents.mcpServers,
}
```

### Tool Integration

The `skill_mcp` tool is registered in `createCoreTools()`:

```typescript
const skillMcpTool = factories.createSkillMcpTool({
  manager: managers.skillMcpManager,
  getLoadedSkills: () => skillContext.mergedSkills,
  getSessionID: getSessionIDForMcp,
})
tools.skill_mcp = skillMcpTool
```

The `skill_mcp` tool accepts: `mcp_name`, `tool_name` | `resource_name` | `prompt_name`, `arguments`, `grep` (output filter), `cdp_url` (Playwright CDP endpoint).

### Session Cleanup

On `session.deleted` event:
```typescript
await managers.skillMcpManager.disconnectSession(sessionInfo.id)
```

## 7. External Dependencies

| Package | Dependencies |
|---------|-------------|
| `mcp-stdio-core` | **None** (zero dependencies, Node.js streams only) |
| `mcp-client-core` | `@modelcontextprotocol/sdk ^1.29.0`, `@oh-my-opencode/claude-code-compat-core`, `@oh-my-opencode/utils`, `zod ^4.4.3` |
| Built-in MCPs (plugin-level) | LSP: vendored `lsp-tools-mcp`; codegraph: resolved from PATH or bundled npm; remote MCPs: HTTP only |
| SKILL.md YAML parsing | `js-yaml ^4.1.1` |

## 8. Test Coverage

| Test file | Scenarios | Lines |
|-----------|-----------|-------|
| `mcp-stdio-core/src/server.test.ts` | Line request, parse error override | 49 |
| `mcp-stdio-core/src/transport.test.ts` | Line/framed read, framed write | 54 |
| `mcp-client-core/src/skill-mcp-manager/core-behavior.test.ts` | Connection type, env cleaning, redaction, client key | 61 |
| `mcp-client-core/src/mcp-oauth/storage.test.ts` | Save/load/delete/legacy/list tokens | 147 |
| `mcp-client-core/src/mcp-oauth/callback-server.port.test.ts` | Port allocation | ~50 |
| `omo-opencode/src/features/skill-mcp-manager/manager.test.ts` | Full SkillMcpManager | 1181 |
| `omo-opencode/src/features/skill-mcp-manager/disconnect-cleanup.test.ts` | Disconnect + cleanup | 133 |
| `omo-opencode/src/features/skill-mcp-manager/connection-env-vars.test.ts` | ${VAR} expansion per scope | 296 |
| `omo-opencode/src/features/skill-mcp-manager/connection-race.test.ts` | Race condition prevention | ~100 |
| `omo-opencode/src/features/skill-mcp-manager/oauth-handler.test.ts` | OAuth step-up + refresh | ~100 |
| `omo-opencode/src/features/skill-mcp-manager/manager-oauth-retry.test.ts` | OAuth retry | ~100 |
| `omo-opencode/src/features/skill-mcp-manager/env-cleaner.test.ts` | Env cleaner filtering | ~80 |
| `omo-opencode/src/features/skill-mcp-manager/http-client.test.ts` | HTTP client | ~80 |
| `omo-opencode/src/features/skill-mcp-manager/plugin-reload-mcp-survival.test.ts` | Plugin reload | ~80 |
| `omo-opencode/src/features/mcp-oauth/discovery.test.ts` | 5 scenarios: PRM + AS, 404 fallback, caching | 238 |
| `omo-opencode/src/plugin-handlers/mcp-config-handler.test.ts` | Merge, disabled_mcps, user disable | 186 |
| `omo-opencode/src/mcp/websearch.test.ts` | Exa/Tavily provider config | 89 |
| `omo-opencode/src/mcp/lsp.test.ts` | 8 scenarios: binary resolution | 288 |
| `omo-opencode/src/mcp/codegraph.test.ts` | 9 scenarios: binary resolution | 193 |

**Total**: ~3500+ lines across ~25 test files.

## Migration Assessment

**Verdict**: PORT core packages + reimplement plugin adapter

**What to port (third-party, import directly)**:
1. `mcp-stdio-core` — zero-dep, directly usable
2. `mcp-client-core` — OAuth self-contained, only depends on `@modelcontextprotocol/sdk`, `zod`, utils
3. `SkillMcpManager` + `SkillMcpConfig` parsing from `skills-loader-core`

**What to reimplement (omo-own)**:
1. Built-in MCP definitions (websearch, context7, grep_app, lsp, codegraph) — plugin-level config objects, easy to replicate
2. MCP config merge handler — adapt to ocmm's config hook
3. `skill_mcp` tool registration — adapt to ocmm's tool registry
4. `.mcp.json` loader (Tier-2) — Claude Code compatibility

**Config fields for ocmm**:
- `disabled_mcps: string[]` — disable by name
- `mcp_env_allowlist: string[]` — env var allowlist for security
- `websearch: { provider: "exa" | "tavily" }` — provider selection
- `codegraph: { enabled, auto_provision, install_dir, telemetry }` — codegraph config

**Effort**: MEDIUM (~30 src files for mcp-client-core port + ~10 files for plugin adapter)
**Priority**: MEDIUM — MCP infra is valuable but ocmm may not need all 5 built-in MCPs immediately
