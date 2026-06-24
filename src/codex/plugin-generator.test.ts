import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { isAbsolute, join } from "node:path"

import { defaultConfig } from "../config/schema.ts"
import {
  buildCodexAgents,
  CODEX_MARKETPLACE_NAME,
  CODEX_PLUGIN_DIR,
  CODEX_PLUGIN_NAME,
  createCodexMcpManifest,
  createMarketplaceManifest,
  createPluginManifest,
  generateCodexPlugin,
} from "./plugin-generator.ts"

test("Codex manifest declares ocmm plugin resources", () => {
  const manifest = createPluginManifest("1.2.3")

  assert.equal(manifest.name, CODEX_PLUGIN_NAME)
  assert.equal(manifest.version, "1.2.3")
  assert.equal(manifest.skills, "./skills/")
  assert.equal(manifest.mcpServers, "./.mcp.json")
  assert.equal((manifest.interface as Record<string, unknown>).displayName, "ocmm")
})

test("Codex marketplace points at the local plugins/ocmm bundle", () => {
  const marketplace = createMarketplaceManifest()

  assert.equal(marketplace.name, CODEX_MARKETPLACE_NAME)
  const plugins = marketplace.plugins as Array<Record<string, unknown>>
  assert.equal(plugins[0]?.name, CODEX_PLUGIN_NAME)
  assert.deepEqual(plugins[0]?.source, { source: "local", path: "./plugins/ocmm" })
})

test("Codex MCP manifest uses Codex server shape", () => {
  const cfg = {
    ...defaultConfig(),
    disabledMcps: ["websearch", "lsp"],
    mcp: {
      ...defaultConfig().mcp,
      servers: {
        docs: { type: "remote" as const, url: "https://docs.example/mcp", enabled: true },
        local: { type: "local" as const, command: ["node", "server.js"], enabled: true },
      },
    },
  }

  const manifest = createCodexMcpManifest(cfg, process.cwd())

  assert.equal((manifest.mcpServers.docs as Record<string, unknown>).url, "https://docs.example/mcp")
  assert.equal((manifest.mcpServers.local as Record<string, unknown>).command, "node")
  assert.deepEqual((manifest.mcpServers.local as Record<string, unknown>).args, ["server.js"])
  assert.equal(manifest.mcpServers.websearch, undefined)
})

test("Codex MCP manifest publishes package-relative ocmm-lsp by default", () => {
  const manifest = createCodexMcpManifest(
    defaultConfig(),
    process.cwd(),
    join(process.cwd(), CODEX_PLUGIN_DIR),
  )
  const lsp = manifest.mcpServers.lsp as Record<string, unknown>

  assert.equal(lsp.command, "node")
  assert.deepEqual(lsp.args, ["../../dist/cli/ocmm-lsp.js", "mcp"])
  assert.equal(lsp.cwd, ".")

  const serialized = JSON.stringify(lsp)
  assert.doesNotMatch(serialized, /target[\\/]release/)
  assert.doesNotMatch(serialized, /crates[\\/]ocmm-lsp/)
  assert.equal(serialized.includes(process.cwd()), false)
})

test("Codex MCP manifest preserves explicit lsp overrides", () => {
  const cfg = {
    ...defaultConfig(),
    mcp: {
      ...defaultConfig().mcp,
      servers: {
        lsp: { type: "local" as const, command: "custom-lsp", args: ["mcp"], enabled: true },
      },
    },
  }

  const manifest = createCodexMcpManifest(cfg, process.cwd())
  const lsp = manifest.mcpServers.lsp as Record<string, unknown>

  assert.equal(lsp.command, "custom-lsp")
  assert.deepEqual(lsp.args, ["mcp"])
})

test("Codex agents are generated from ocmm prompts and Codex-compatible fallback models", async () => {
  const agents = await buildCodexAgents({
    config: defaultConfig(),
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })

  const orchestrator = agents.find((agent) => agent.name === "ocmm-orchestrator")
  const builder = agents.find((agent) => agent.name === "ocmm-builder")
  const deep = agents.find((agent) => agent.name === "ocmm-deep")
  const documenting = agents.find((agent) => agent.name === "ocmm-documenting")

  assert.ok(orchestrator)
  assert.equal(orchestrator.model, "gpt-5.5")
  assert.equal(orchestrator.reasoningEffort, "high")
  assert.match(orchestrator.developerInstructions, /Agent Role: orchestrator|DEEPWORK MODE ENABLED/)
  assert.match(orchestrator.developerInstructions, /Codex tool compatibility/)
  assert.ok(builder)
  assert.equal(builder.model, "gpt-5.5")
  assert.ok(deep)
  assert.equal(deep.reasoningEffort, "high")
  assert.ok(documenting)
  assert.equal(documenting.model, "gpt-5.5")
})

test("generateCodexPlugin writes a self-contained bundle", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codex-plugin-"))
  try {
    const result = await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "plugins", "ocmm"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      config: defaultConfig(),
      packageVersion: "9.9.9",
    })

    const manifest = JSON.parse(readFileSync(join(result.pluginRoot, ".codex-plugin", "plugin.json"), "utf8")) as Record<string, unknown>
    const marketplace = JSON.parse(readFileSync(result.marketplacePath, "utf8")) as Record<string, unknown>
    const orchestrator = readFileSync(join(result.pluginRoot, "agents", "ocmm-orchestrator.toml"), "utf8")
    const workflowSkill = readFileSync(join(result.pluginRoot, "skills", "ocmm-workflow", "SKILL.md"), "utf8")
    const deepworkSkill = readFileSync(join(result.pluginRoot, "skills", "deepwork-writing-plans", "SKILL.md"), "utf8")
    const gitAgentMetadata = readFileSync(join(result.pluginRoot, "skills", "git-master", "agents", "openai.yaml"), "utf8")
    const mcpManifest = readFileSync(join(result.pluginRoot, ".mcp.json"), "utf8")
    const mcp = JSON.parse(mcpManifest) as { mcpServers: Record<string, { args?: string[] }> }
    const lspEntrypoint = mcp.mcpServers.lsp?.args?.[0] ?? ""

    assert.equal(manifest.version, "9.9.9")
    assert.equal(marketplace.name, CODEX_MARKETPLACE_NAME)
    assert.match(mcpManifest, /"lsp"/)
    assert.match(mcpManifest, /ocmm-lsp\.js/)
    assert.equal(isAbsolute(lspEntrypoint), false)
    assert.match(orchestrator, /^name = "ocmm-orchestrator"$/m)
    assert.match(workflowSkill, /Generated Agents/)
    assert.match(deepworkSkill, /^---\nname: deepwork-writing-plans$/m)
    assert.doesNotMatch(gitAgentMetadata, /search_terms/)
    assert.equal(result.agentCount > 10, true)
    assert.equal(result.skillCount >= 6, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
