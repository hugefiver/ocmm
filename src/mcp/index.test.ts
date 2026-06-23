import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  createBuiltinMcps,
  createConfiguredMcpManager,
  loadSkillMcpConfig,
  parseSkillMcpFrontmatter,
  resolveMcpServers,
} from "./index.ts"

test("createBuiltinMcps returns enabled remote builtins and respects disabled list", () => {
  const servers = createBuiltinMcps(
    { enabled: true, envAllowlist: [], websearch: { provider: "exa" }, servers: {} },
    ["grep_app", "lsp"],
  )

  assert.equal(servers.websearch?.type, "remote")
  assert.equal(servers.context7?.type, "remote")
  assert.equal(servers.grep_app, undefined)
  assert.equal(servers.lsp, undefined)
  assert.equal(servers.codegraph?.type, "local")
  assert.equal(servers.codegraph?.enabled, false)
})

test("createBuiltinMcps only injects API-key headers when env allowlisted", () => {
  const previous = process.env.EXA_API_KEY
  process.env.EXA_API_KEY = "secret-exa"
  try {
    const blocked = createBuiltinMcps({ enabled: true, envAllowlist: [], websearch: { provider: "exa" }, servers: {} })
    assert.equal(blocked.websearch?.type === "remote" ? blocked.websearch.headers : undefined, undefined)

    const allowed = createBuiltinMcps({
      enabled: true,
      envAllowlist: ["EXA_API_KEY"],
      websearch: { provider: "exa" },
      servers: {},
    })
    assert.deepEqual(allowed.websearch?.type === "remote" ? allowed.websearch.headers : undefined, {
      Authorization: "Bearer secret-exa",
    })
  } finally {
    if (previous === undefined) delete process.env.EXA_API_KEY
    else process.env.EXA_API_KEY = previous
  }
})

test("resolveMcpServers merges builtins, mcp.json, and explicit config with disabled filter", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-mcp-resolve-"))
  try {
    writeFileSync(
      join(cwd, ".mcp.json"),
      JSON.stringify({ local_docs: { type: "remote", url: "https://json.example/mcp" } }),
    )

    const servers = resolveMcpServers(
      {
        enabled: true,
        envAllowlist: [],
        websearch: { provider: "exa" },
        servers: {
          context7: { type: "remote", url: "https://override.example/mcp" },
          custom: { type: "local", command: "node", args: ["server.js"] },
        },
      },
      { cwd, disabledMcps: ["websearch"] },
    )

    assert.equal(servers.websearch, undefined)
    assert.equal(servers.context7?.type, "remote")
    assert.equal(servers.context7.type === "remote" ? servers.context7.url : "", "https://override.example/mcp")
    assert.equal(servers.local_docs?.type, "remote")
    assert.deepEqual(servers.custom?.type === "local" ? servers.custom.command : undefined, ["node", "server.js"])
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("parseSkillMcpFrontmatter reads simple embedded MCP server config", () => {
  const parsed = parseSkillMcpFrontmatter(`---
name: docs
mcp:
  docs:
    type: remote
    url: https://docs.example/mcp
    oauth: false
  local:
    type: local
    command: node
    args: [server.js, --mcp]
---
# Docs
`)

  assert.equal(parsed.servers.docs?.type, "remote")
  assert.equal(parsed.servers.local?.type, "local")
  assert.deepEqual(parsed.servers.local?.type === "local" ? parsed.servers.local.command : undefined, [
    "node",
    "server.js",
    "--mcp",
  ])
})

test("loadSkillMcpConfig prefers companion mcp.json", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-skill-mcp-"))
  try {
    const skillDir = join(root, "skill")
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nmcp:\n  ignored:\n    type: remote\n    url: https://ignored.example/mcp\n---\n",
    )
    writeFileSync(
      join(skillDir, "mcp.json"),
      JSON.stringify({ preferred: { type: "remote", url: "https://preferred.example/mcp" } }),
    )

    const loaded = await loadSkillMcpConfig(skillDir)
    assert.equal(loaded.servers.ignored, undefined)
    assert.equal(loaded.servers.preferred?.type, "remote")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("configured manager exposes deterministic seam responses", async () => {
  const manager = createConfiguredMcpManager({ docs: { type: "remote", url: "https://docs.example/mcp", enabled: true } })

  assert.equal(manager.servers().docs?.type, "remote")
  const result = await manager.invoke({ mcpName: "docs", toolName: "search", arguments: { q: "zod" } })
  assert.match(result.content, /"mcp": "docs"/)
  assert.match(result.content, /transport is not active/)
})
