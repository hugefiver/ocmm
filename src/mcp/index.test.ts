import { test } from "node:test"
import assert from "node:assert/strict"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  createBuiltinMcps,
  createConfiguredMcpManager,
  loadSkillMcpConfig,
  ocmmLspBinaryNames,
  parseSkillMcpFrontmatter,
  resolveOcmmLspCommand,
  resolveMcpServers,
} from "./index.ts"

function writeExecutable(path: string): void {
  writeFileSync(path, "")
  if (process.platform !== "win32") chmodSync(path, 0o755)
}

test("createBuiltinMcps returns enabled builtins and respects disabled list", () => {
  const servers = createBuiltinMcps(
    { enabled: true, envAllowlist: [], websearch: { provider: "exa" }, servers: {} },
    ["grep_app", "lsp"],
  )

  assert.equal(servers.websearch?.type, "remote")
  assert.equal(servers.context7?.type, "remote")
  assert.equal(servers.grep_app, undefined)
  assert.equal(servers.lsp, undefined)
  assert.equal(servers.codegraph, undefined)
  assert.equal(servers["ast-grep"], undefined)
})

test("createBuiltinMcps registers project-owned ocmm-lsp when available", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-lsp-root-"))
  try {
    const bin = process.platform === "win32" ? "ocmm-lsp.exe" : "ocmm-lsp"
    mkdirSync(join(root, "dist", "bin"), { recursive: true })
    writeExecutable(join(root, "dist", "bin", bin))

    const servers = createBuiltinMcps(
      { enabled: true, envAllowlist: [], websearch: { provider: "exa" }, servers: {} },
      [],
      { packageRoot: root, pathEnv: "" },
    )

    assert.equal(servers.lsp?.type, "local")
    assert.deepEqual(servers.lsp?.type === "local" ? servers.lsp.command : undefined, [join(root, "dist", "bin", bin), "mcp"])
    assert.equal(
      servers.lsp?.type === "local" ? servers.lsp.environment?.OCMM_LSP_PROJECT_CONFIG.includes(".opencode/ocmm-lsp.json") : false,
      true,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("resolveOcmmLspCommand prefers platform-suffixed package binary", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-lsp-platform-"))
  try {
    const [platformBin, fallbackBin] = ocmmLspBinaryNames()
    mkdirSync(join(root, "dist", "bin"), { recursive: true })
    writeExecutable(join(root, "dist", "bin", fallbackBin))
    writeExecutable(join(root, "dist", "bin", platformBin))
    writeFileSync(join(root, "package.json"), "{}")

    const resolved = resolveOcmmLspCommand({ packageRoot: root, pathEnv: "" })

    assert.equal(resolved.enabled, true)
    assert.equal(resolved.source, "package-bin")
    assert.deepEqual(resolved.command, [join(root, "dist", "bin", platformBin), "mcp"])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("ocmmLspBinaryNames mirrors release artifact names", () => {
  assert.deepEqual(ocmmLspBinaryNames("linux", "x64", "gnu"), ["ocmm-lsp-x86_64-unknown-linux-gnu", "ocmm-lsp"])
  assert.deepEqual(ocmmLspBinaryNames("linux", "arm64", "gnu"), ["ocmm-lsp-aarch64-unknown-linux-gnu", "ocmm-lsp"])
  assert.deepEqual(ocmmLspBinaryNames("darwin", "x64"), ["ocmm-lsp-x86_64-apple-darwin", "ocmm-lsp"])
  assert.deepEqual(ocmmLspBinaryNames("darwin", "arm64"), ["ocmm-lsp-aarch64-apple-darwin", "ocmm-lsp"])
  assert.deepEqual(ocmmLspBinaryNames("win32", "x64"), ["ocmm-lsp-x86_64-pc-windows-msvc.exe", "ocmm-lsp.exe"])
  assert.deepEqual(ocmmLspBinaryNames("win32", "arm64"), ["ocmm-lsp-aarch64-pc-windows-msvc.exe", "ocmm-lsp.exe"])
  assert.deepEqual(ocmmLspBinaryNames("linux", "x64", "musl"), ["ocmm-lsp"])
})

test("resolveOcmmLspCommand prefers release binary over cargo source fallback", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-lsp-release-"))
  try {
    const bin = process.platform === "win32" ? "ocmm-lsp.exe" : "ocmm-lsp"
    const release = join(root, "target", "release")
    mkdirSync(release, { recursive: true })
    writeExecutable(join(release, bin))
    writeFileSync(join(root, "package.json"), "{}")

    const resolved = resolveOcmmLspCommand({ packageRoot: root, pathEnv: "" })

    assert.equal(resolved.enabled, true)
    assert.equal(resolved.source, "target-release")
    assert.deepEqual(resolved.command, [join(release, bin), "mcp"])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("resolveOcmmLspCommand falls back to cargo source when binary is absent", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-lsp-cargo-"))
  try {
    const crate = join(root, "crates", "ocmm-lsp")
    mkdirSync(crate, { recursive: true })
    writeFileSync(join(root, "package.json"), "{}")
    writeFileSync(join(crate, "Cargo.toml"), "[package]\nname = \"ocmm-lsp\"\nversion = \"0.1.0\"\n")

    const resolved = resolveOcmmLspCommand({
      packageRoot: root,
      pathEnv: "",
      resolveExecutable: (command) => command === "cargo" ? "cargo" : undefined,
    })

    assert.equal(resolved.enabled, true)
    assert.equal(resolved.source, "cargo-source")
    assert.deepEqual(resolved.command, ["cargo", "run", "--quiet", "--manifest-path", join(crate, "Cargo.toml"), "--", "mcp"])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("resolveOcmmLspCommand prefers project cargo source over PATH binary", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-lsp-cargo-before-path-"))
  try {
    const crate = join(root, "crates", "ocmm-lsp")
    mkdirSync(crate, { recursive: true })
    writeFileSync(join(root, "package.json"), "{}")
    writeFileSync(join(crate, "Cargo.toml"), "[package]\nname = \"ocmm-lsp\"\nversion = \"0.1.0\"\n")

    const resolved = resolveOcmmLspCommand({
      packageRoot: root,
      pathEnv: "",
      resolveExecutable: (command) => command === "cargo" ? "cargo" : command === "ocmm-lsp" ? "global-ocmm-lsp" : undefined,
    })

    assert.equal(resolved.enabled, true)
    assert.equal(resolved.source, "cargo-source")
    assert.deepEqual(resolved.command, ["cargo", "run", "--quiet", "--manifest-path", join(crate, "Cargo.toml"), "--", "mcp"])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("resolveOcmmLspCommand treats OCMM_LSP_COMMAND JSON array as exact command", () => {
  const previous = process.env.OCMM_LSP_COMMAND
  process.env.OCMM_LSP_COMMAND = JSON.stringify(["custom-lsp", "mcp"])
  try {
    const resolved = resolveOcmmLspCommand({ packageRoot: undefined, pathEnv: "" })
    assert.equal(resolved.source, "env")
    assert.deepEqual(resolved.command, ["custom-lsp", "mcp"])
  } finally {
    if (previous === undefined) delete process.env.OCMM_LSP_COMMAND
    else process.env.OCMM_LSP_COMMAND = previous
  }
})

test("resolveOcmmLspCommand appends mcp to plain OCMM_LSP_COMMAND", () => {
  const previous = process.env.OCMM_LSP_COMMAND
  process.env.OCMM_LSP_COMMAND = "custom-lsp"
  try {
    const resolved = resolveOcmmLspCommand({ packageRoot: undefined, pathEnv: "" })
    assert.equal(resolved.source, "env")
    assert.deepEqual(resolved.command, ["custom-lsp", "mcp"])
  } finally {
    if (previous === undefined) delete process.env.OCMM_LSP_COMMAND
    else process.env.OCMM_LSP_COMMAND = previous
  }
})

test("resolveOcmmLspCommand is disabled when project binary and cargo fallback are absent", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-lsp-missing-"))
  try {
    writeFileSync(join(root, "package.json"), "{}")

    const resolved = resolveOcmmLspCommand({ packageRoot: root, pathEnv: "" })

    assert.equal(resolved.enabled, false)
    assert.equal(resolved.source, "missing")
    assert.deepEqual(resolved.command, ["ocmm-lsp", "mcp"])
    assert.equal(resolved.command.includes("omo-lsp"), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
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

test("resolveMcpServers lets explicit lsp config override builtin lsp", () => {
  const servers = resolveMcpServers(
    {
      enabled: true,
      envAllowlist: [],
      websearch: { provider: "exa" },
      servers: {
        lsp: { type: "local", command: "custom-lsp", args: ["mcp"] },
      },
    },
    { disabledMcps: ["websearch"] },
  )

  assert.deepEqual(servers.lsp?.type === "local" ? servers.lsp.command : undefined, ["custom-lsp", "mcp"])
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
