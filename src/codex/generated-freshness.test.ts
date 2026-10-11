import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { test } from "node:test"

import { loadSharedSkills, V1_SKILL_DIRS } from "../intent/skill-loader.ts"
import {
  buildCodexAgents,
  CODEX_MARKETPLACE_FILE,
  CODEX_MARKETPLACE_NAME,
  CODEX_PLUGIN_DIR,
  CODEX_PLUGIN_NAME,
  CODEX_PROJECT_AGENTS_DIR,
  CODEX_WORKFLOW_SKILL_NAME,
  createCodexMcpManifest,
  loadAdapterConfig,
} from "./plugin-generator.ts"

const repositoryRoot = process.cwd()

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
}

function readRuntimeAgentFields(path: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const assignment = line.match(/^(name|model|model_reasoning_effort|nickname_candidates)\s*=\s*(.+)$/)
    if (!assignment) continue
    const [, key, value] = assignment
    assert.equal(Object.hasOwn(fields, key!), false, `${path}: duplicate ${key}`)
    fields[key!] = JSON.parse(value!) as unknown
  }
  return fields
}

test("tracked Codex artifacts deliver current configured runtime fields and resource inventory", { concurrency: false }, async () => {
  const runRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-resource-contract-"))
  const previousCodexHome = process.env.CODEX_HOME
  const previousNoProfile = process.env.OCMM_NO_PROFILE
  try {
    const codexHome = join(runRoot, "codex-home")
    mkdirSync(codexHome)
    process.env.CODEX_HOME = codexHome
    process.env.OCMM_NO_PROFILE = "1"
    const loaded = loadAdapterConfig(repositoryRoot)
    assert.equal(loaded.host, "codex")

    const pluginRoot = join(repositoryRoot, CODEX_PLUGIN_DIR)
    const version = readJson(join(repositoryRoot, "package.json")).version
    const manifest = readJson(join(pluginRoot, ".codex-plugin", "plugin.json"))
    assert.equal(manifest.name, CODEX_PLUGIN_NAME)
    assert.equal(manifest.version, version)
    assert.equal(manifest.skills, "./skills/")
    assert.equal(manifest.mcpServers, "./.mcp.json")
    assert.deepEqual(readJson(join(pluginRoot, "package.json")), {
      name: "deepwork-codex-plugin-runtime", version, private: true, type: "module",
    })
    const marketplace = readJson(join(repositoryRoot, CODEX_MARKETPLACE_FILE))
    assert.equal(marketplace.name, CODEX_MARKETPLACE_NAME)
    const plugins = marketplace.plugins as Array<Record<string, unknown>>
    assert.equal(plugins.length, 1)
    assert.equal(plugins[0]?.name, CODEX_PLUGIN_NAME)
    assert.deepEqual(plugins[0]?.source, { source: "local", path: `./${CODEX_PLUGIN_DIR}` })
    assert.deepEqual(plugins[0]?.policy, { installation: "AVAILABLE", authentication: "ON_INSTALL" })
    assert.deepEqual(readJson(join(pluginRoot, ".mcp.json")), createCodexMcpManifest(loaded.config, repositoryRoot, pluginRoot))

    const sourceSkillsRoot = join(repositoryRoot, "skills")
    const agents = await buildCodexAgents({ config: loaded.config, cwd: repositoryRoot, skillsRoot: sourceSkillsRoot })
    for (const agentsRoot of [join(pluginRoot, "agents"), join(repositoryRoot, CODEX_PROJECT_AGENTS_DIR)]) {
      assert.deepEqual(readdirSync(agentsRoot).sort(), agents.map((agent) => `${agent.name}.toml`).sort())
      for (const agent of agents) {
        assert.deepEqual(readRuntimeAgentFields(join(agentsRoot, `${agent.name}.toml`)), {
          name: agent.name,
          model: agent.model,
          model_reasoning_effort: agent.reasoningEffort,
          nickname_candidates: [agent.name, agent.sourceName],
        })
      }
    }

    const disabled = new Set([...loaded.config.skills.disable, ...(loaded.config.disabledSkills ?? [])])
    const sharedSkills = loadSharedSkills({
      rootDir: sourceSkillsRoot,
      sources: loaded.config.skills.sources,
      enable: loaded.config.skills.enable,
      disable: [...disabled],
    })
    const skillNames = [
      CODEX_WORKFLOW_SKILL_NAME,
      ...sharedSkills.map((skill) => basename(skill.path)),
      ...V1_SKILL_DIRS.filter((name) => !disabled.has(name) && !disabled.has(`deepwork-${name}`)
        && existsSync(join(sourceSkillsRoot, "v1", name, "SKILL.md"))).map((name) => `deepwork-${name}`),
    ].sort()
    const skillsRoot = join(pluginRoot, "skills")
    assert.deepEqual(readdirSync(skillsRoot).sort(), skillNames)
    for (const name of skillNames) {
      const path = join(skillsRoot, name, "SKILL.md")
      assert.equal(statSync(path).isFile(), true, `${name}: delivered skill resource`)
      assert.equal(readFileSync(path, "utf8").match(/^name:\s*(.+)$/m)?.[1], name, `${name}: discoverable identity`)
    }
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = previousCodexHome
    if (previousNoProfile === undefined) delete process.env.OCMM_NO_PROFILE
    else process.env.OCMM_NO_PROFILE = previousNoProfile
    rmSync(runRoot, { recursive: true, force: true })
  }
})
