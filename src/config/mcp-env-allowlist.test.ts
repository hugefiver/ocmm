import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { createBuiltinMcps } from "../mcp/index.ts"
import { loadConfig, loadOpenCodePluginConfig, loadProfileDescriptorsFromDir } from "./load.ts"
import type { McpConfig, OcmmConfig } from "./schema.ts"

const API_KEYS = ["EXA_API_KEY", "TAVILY_API_KEY", "CONTEXT7_API_KEY"] as const
const FAKE_KEYS = {
  EXA_API_KEY: "fake-ocmm-exa",
  TAVILY_API_KEY: "fake-ocmm-tavily",
  CONTEXT7_API_KEY: "fake-ocmm-context7",
}
const PIPELINES = [
  { name: "loadConfig OpenCode", host: "opencode", load: (cwd: string) => loadConfig({ cwd, host: "opencode" }) },
  { name: "loadConfig Codex", host: "codex", load: (cwd: string) => loadConfig({ cwd, host: "codex" }) },
  { name: "loadOpenCodePluginConfig", host: "opencode", load: (cwd: string) => loadOpenCodePluginConfig({ cwd }) },
] as const
type Entry = "root" | "inline" | "directory"
type Fixture = { cwd: string; userDir: string; projectDir: string }

function withFixture(host: "opencode" | "codex", run: (fixture: Fixture) => void): void {
  const root = mkdtempSync(join(tmpdir(), "ocmm-mcp-trust-"))
  const cwd = join(root, "project")
  const xdg = join(root, "xdg")
  const codexHome = join(root, "codex-user")
  const userDir = host === "codex" ? codexHome : join(xdg, "opencode")
  const projectDir = join(cwd, host === "codex" ? ".codex" : ".opencode")
  const saved = new Map<string, string | undefined>()
  for (const key of ["XDG_CONFIG_HOME", "CODEX_HOME", "OCMM_PROFILE", "OCMM_NO_PROFILE", "OCMM_FAST", "OPENCODE_CONFIG_CONTENT", ...API_KEYS]) {
    saved.set(key, process.env[key])
  }
  try {
    for (const key of saved.keys()) delete process.env[key]
    process.env.XDG_CONFIG_HOME = xdg
    process.env.CODEX_HOME = codexHome
    for (const key of API_KEYS) process.env[key] = FAKE_KEYS[key]
    mkdirSync(join(userDir, "ocmm-profiles"), { recursive: true })
    mkdirSync(join(projectDir, "ocmm-profiles"), { recursive: true })
    run({ cwd, userDir, projectDir })
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(root, { recursive: true, force: true })
  }
}

function writeConfig(dir: string, value: unknown): void {
  writeFileSync(join(dir, "ocmm.jsonc"), JSON.stringify(value))
}

function writeContribution(dir: string, entry: Entry, mcp: unknown): void {
  const contribution = { debug: true, mcp }
  if (entry === "directory") {
    writeConfig(dir, { activeProfile: "selected" })
    writeFileSync(join(dir, "ocmm-profiles", "selected.jsonc"), JSON.stringify(contribution))
  } else {
    writeConfig(dir, entry === "root"
      ? contribution
      : { profiles: { selected: contribution }, activeProfile: "selected" })
  }
}

function assertMcpAccess(mcp: McpConfig, allowed: readonly string[]): void {
  // Construct both built-in search providers with the loader's unchanged allowlist.
  for (const provider of ["exa", "tavily"] as const) {
    const servers = createBuiltinMcps({ ...mcp, websearch: { provider } }, ["lsp", "grep_app"])
    const searchKey = provider === "exa" ? "EXA_API_KEY" : "TAVILY_API_KEY"
    const expectedSearchHeaders = allowed.includes(searchKey) ? { Authorization: `Bearer ${FAKE_KEYS[searchKey]}` } : undefined
    if (provider === "tavily" && !allowed.includes(searchKey)) {
      assert.equal(servers.websearch, undefined)
    } else {
      assert.equal(servers.websearch?.type, "remote")
      assert.deepEqual(servers.websearch?.type === "remote" ? servers.websearch.headers : undefined, expectedSearchHeaders)
    }
    assert.equal(servers.context7?.type, "remote")
    assert.deepEqual(servers.context7?.type === "remote" ? servers.context7.headers : undefined,
      allowed.includes("CONTEXT7_API_KEY") ? { Authorization: `Bearer ${FAKE_KEYS.CONTEXT7_API_KEY}` } : undefined)
  }
}

function assertProjectSiblings(config: OcmmConfig): void {
  assert.equal(config.debug, true)
  assert.equal(config.mcp.enabled, true)
  assert.equal(config.mcp.websearch.provider, "tavily")
  assert.equal(config.mcp.servers.project?.type, "remote")
}

for (const pipeline of PIPELINES) {
  const projectEntries: Entry[] = pipeline.host === "codex" ? ["root", "inline"] : ["root", "inline", "directory"]
  for (const entry of projectEntries) {
    test(`${pipeline.name}: project ${entry} cannot authorize MCP environment keys`, () => {
      withFixture(pipeline.host, ({ cwd, projectDir }) => {
        writeContribution(projectDir, entry, {
          enabled: true,
          envAllowlist: API_KEYS,
          websearch: { provider: "tavily" },
          servers: { project: { type: "remote", url: "https://project.example/mcp" } },
        })
        const loaded = pipeline.load(cwd)
        assert.equal(loaded.sources.user, undefined)
        assert.equal(loaded.sources.project, join(projectDir, "ocmm.jsonc"))
        assert.equal(loaded.activeProfile, entry === "root" ? undefined : "selected")
        assert.deepEqual(loaded.config.mcp.envAllowlist, [])
        if (entry === "inline") assert.equal(loaded.config.profiles.selected?.mcp?.envAllowlist, undefined)
        assertProjectSiblings(loaded.config)
        assertMcpAccess(loaded.config.mcp, [])
      })
    })

    for (const attempt of [
      { name: "extend", value: API_KEYS },
      { name: "replace", value: ["TAVILY_API_KEY"] },
      { name: "clear", value: [] },
      { name: "invalidate", value: "TAVILY_API_KEY" },
    ]) {
      test(`${pipeline.name}: project ${entry} cannot ${attempt.name} the trusted root allowlist`, () => {
        withFixture(pipeline.host, ({ cwd, userDir, projectDir }) => {
          writeConfig(userDir, { mcp: {
            enabled: false,
            envAllowlist: ["EXA_API_KEY", "CONTEXT7_API_KEY"],
            websearch: { provider: "exa" },
            servers: { user: { type: "remote", url: "https://user.example/mcp" } },
          } })
          writeContribution(projectDir, entry, {
            enabled: true,
            envAllowlist: attempt.value,
            websearch: { provider: "tavily" },
            servers: { project: { type: "remote", url: "https://project.example/mcp" } },
          })
          if (entry !== "root") process.env.OCMM_PROFILE = "selected"
          const loaded = pipeline.load(cwd)
          assert.deepEqual(loaded.config.mcp.envAllowlist, ["EXA_API_KEY", "CONTEXT7_API_KEY"])
          assert.equal(loaded.config.mcp.servers.user?.type, "remote")
          assertProjectSiblings(loaded.config)
          assertMcpAccess(loaded.config.mcp, ["EXA_API_KEY", "CONTEXT7_API_KEY"])
        })
      })
    }
  }

  for (const entry of ["root", "inline", "directory"] as const) {
    test(`${pipeline.name}: trusted user ${entry} retains MCP environment authorization`, () => {
      withFixture(pipeline.host, ({ cwd, userDir, projectDir }) => {
        writeContribution(userDir, entry, { envAllowlist: API_KEYS, websearch: { provider: "tavily" } })
        writeConfig(projectDir, { mcp: { envAllowlist: [] } })
        const loaded = pipeline.load(cwd)
        assert.deepEqual(loaded.config.mcp.envAllowlist, API_KEYS)
        assertMcpAccess(loaded.config.mcp, API_KEYS)
      })
    })
  }

  test(`${pipeline.name}: same-name project inline preserves trusted inline replacement and siblings`, () => {
    withFixture(pipeline.host, ({ cwd, userDir, projectDir }) => {
      writeConfig(userDir, {
        mcp: { envAllowlist: ["CONTEXT7_API_KEY"] },
        profiles: { selected: { mcp: { envAllowlist: ["EXA_API_KEY"], enabled: false } } },
        activeProfile: "selected",
      })
      writeContribution(projectDir, "inline", { envAllowlist: ["TAVILY_API_KEY"], websearch: { provider: "tavily" } })
      const config = pipeline.load(cwd).config
      assert.deepEqual(config.mcp.envAllowlist, ["EXA_API_KEY"])
      assert.deepEqual(config.profiles.selected?.mcp?.envAllowlist, ["EXA_API_KEY"])
      assert.equal(config.mcp.enabled, false)
      assert.equal(config.mcp.websearch.provider, "tavily")
      assertMcpAccess(config.mcp, ["EXA_API_KEY"])
    })
  })

  test(`${pipeline.name}: trusted directory winner shadows inline allowlists rather than merging them`, () => {
    withFixture(pipeline.host, ({ cwd, userDir, projectDir }) => {
      writeConfig(userDir, {
        mcp: { envAllowlist: ["EXA_API_KEY"] },
        profiles: { selected: { mcp: { envAllowlist: ["CONTEXT7_API_KEY"] } } },
      })
      writeFileSync(join(userDir, "ocmm-profiles", "selected.jsonc"), JSON.stringify({
        mcp: { envAllowlist: ["TAVILY_API_KEY"], websearch: { provider: "tavily" } },
        agents: { orchestrator: { model: "USER-DIRECTORY" } },
      }))
      writeContribution(projectDir, "inline", { envAllowlist: API_KEYS })
      const config = pipeline.load(cwd).config
      assert.deepEqual(config.mcp.envAllowlist, ["TAVILY_API_KEY"])
      assert.equal(config.agents?.orchestrator?.model, "USER-DIRECTORY")
      assertMcpAccess(config.mcp, ["TAVILY_API_KEY"])
    })
  })

  test(`${pipeline.name}: OCMM_NO_PROFILE keeps inline authorization inactive without dropping user base`, () => {
    withFixture(pipeline.host, ({ cwd, userDir, projectDir }) => {
      writeConfig(userDir, {
        mcp: { envAllowlist: ["CONTEXT7_API_KEY"] },
        profiles: { selected: { mcp: { envAllowlist: ["EXA_API_KEY"] } } },
      })
      writeConfig(projectDir, {
        profiles: {
          selected: { mcp: { envAllowlist: ["TAVILY_API_KEY"] } },
          unused: { mcp: { envAllowlist: API_KEYS, enabled: false } },
        },
        activeProfile: "selected",
      })
      process.env.OCMM_PROFILE = "selected"
      process.env.OCMM_NO_PROFILE = "1"
      const loaded = pipeline.load(cwd)
      assert.equal(loaded.activeProfile, undefined)
      assert.deepEqual(loaded.config.mcp.envAllowlist, ["CONTEXT7_API_KEY"])
      assert.deepEqual(loaded.config.profiles.selected?.mcp?.envAllowlist, ["EXA_API_KEY"])
      assert.equal(loaded.config.profiles.unused?.mcp?.envAllowlist, undefined)
      assert.equal(loaded.config.profiles.unused?.mcp?.enabled, false)
      assertMcpAccess(loaded.config.mcp, ["CONTEXT7_API_KEY"])
    })
  })

  test(`${pipeline.name}: project filtering leaves unrelated root and inline option objects intact`, () => {
    withFixture(pipeline.host, ({ cwd, projectDir }) => {
      const options = { mcp: { envAllowlist: API_KEYS }, profiles: { nested: { mcp: { envAllowlist: API_KEYS } } } }
      const rules = [{ match: { provider: "example" }, options }]
      writeConfig(projectDir, {
        mcp: { envAllowlist: API_KEYS },
        fastModels: { rules },
        profiles: { selected: { mcp: { envAllowlist: API_KEYS }, fastModels: { rules } } },
        activeProfile: "selected",
      })
      const config = pipeline.load(cwd).config
      assert.deepEqual(config.mcp.envAllowlist, [])
      assert.equal(config.profiles.selected?.mcp?.envAllowlist, undefined)
      assert.deepEqual(config.fastModels.rules[0]?.options, options)
      assert.deepEqual(config.profiles.selected?.fastModels?.rules?.[0]?.options, options)
      assertMcpAccess(config.mcp, [])
    })
  })

  if (pipeline.host === "opencode") {
    test(`${pipeline.name}: project directory filtering retains pre-migration review conflict evidence`, () => {
      withFixture(pipeline.host, ({ cwd, projectDir }) => {
        writeConfig(projectDir, { agents: { "oracle-2nd": { model: "openai/BASE" } }, activeProfile: "selected" })
        writeFileSync(join(projectDir, "ocmm-profiles", "selected.jsonc"), JSON.stringify({
          agents: { "oracle-high": { model: "openai/LEGACY" } },
          mcp: { envAllowlist: API_KEYS },
          debug: true,
        }))
        const loaded = pipeline.load(cwd)
        assert.equal(loaded.activeProfile, "selected")
        assert.equal(loaded.config.debug, false)
        assert.equal(loaded.config.agents, undefined)
        assert.deepEqual(loaded.config.mcp.envAllowlist, [])
        assertMcpAccess(loaded.config.mcp, [])
      })
    })

    test(`${pipeline.name}: filtered project directory winner does not resurrect shadowed user authorization`, () => {
      withFixture(pipeline.host, ({ cwd, userDir, projectDir }) => {
        writeConfig(userDir, {
          mcp: { envAllowlist: ["CONTEXT7_API_KEY"] },
          profiles: { selected: { mcp: { envAllowlist: ["EXA_API_KEY"] } } },
        })
        writeFileSync(join(userDir, "ocmm-profiles", "selected.jsonc"), JSON.stringify({
          mcp: { envAllowlist: ["TAVILY_API_KEY"] },
          agents: { orchestrator: { model: "USER-DIRECTORY" } },
        }))
        writeContribution(projectDir, "directory", { envAllowlist: API_KEYS, websearch: { provider: "tavily" } })
        // Preferred JSONC must remain the project winner after filtering, even when JSON is also present.
        writeFileSync(join(projectDir, "ocmm-profiles", "selected.json"), JSON.stringify({ locale: "zh-CN" }))
        const loaded = pipeline.load(cwd)
        assert.equal(loaded.activeProfile, "selected")
        assert.equal(loaded.config.debug, true)
        assert.equal(loaded.config.locale, undefined)
        assert.equal(loaded.config.agents?.orchestrator, undefined)
        assert.deepEqual(loaded.config.mcp.envAllowlist, ["CONTEXT7_API_KEY"])
        assertMcpAccess(loaded.config.mcp, ["CONTEXT7_API_KEY"])
      })
    })
  } else {
    test(`${pipeline.name}: project directory profiles remain isolated from Codex loading`, () => {
      withFixture(pipeline.host, ({ cwd, userDir, projectDir }) => {
        writeContribution(userDir, "directory", { envAllowlist: ["EXA_API_KEY"] })
        writeContribution(projectDir, "directory", { envAllowlist: API_KEYS, enabled: false })
        const config = pipeline.load(cwd).config
        assert.deepEqual(config.mcp.envAllowlist, ["EXA_API_KEY"])
        assert.equal(config.mcp.enabled, true)
        assertMcpAccess(config.mcp, ["EXA_API_KEY"])
      })
    })
  }
}

test("directory descriptor filtering preserves source, errors, and unrelated nested objects", () => {
  withFixture("opencode", ({ userDir, projectDir }) => {
    const options = { mcp: { envAllowlist: ["UNRELATED_OPTION"] } }
    const value = {
      mcp: { envAllowlist: API_KEYS, enabled: false },
      fastModels: { rules: [{ match: { provider: "example" }, options }] },
    }
    for (const dir of [userDir, projectDir]) {
      writeFileSync(join(dir, "ocmm-profiles", "selected.jsonc"), JSON.stringify(value))
      writeFileSync(join(dir, "ocmm-profiles", "invalid.jsonc"), JSON.stringify({ ...value, activeProfile: "nested" }))
    }
    const project = loadProfileDescriptorsFromDir(join(projectDir, "ocmm-profiles"), "project-directory")
    const user = loadProfileDescriptorsFromDir(join(userDir, "ocmm-profiles"), "user-directory")
    const descriptor = project.get("selected")!
    assert.equal(descriptor.source, "project-directory")
    assert.equal(descriptor.path, join(projectDir, "ocmm-profiles", "selected.jsonc"))
    assert.equal(descriptor.error, undefined)
    assert.deepEqual(descriptor.value, { ...value, mcp: { enabled: false } })
    assert.deepEqual(user.get("selected")?.value, value)
    assert.equal(project.get("invalid")?.error?.kind, "shape")
    assert.equal(user.get("invalid")?.error?.kind, "shape")
    assert.deepEqual((project.get("invalid")?.value as { mcp: unknown }).mcp, { enabled: false })
  })
})
