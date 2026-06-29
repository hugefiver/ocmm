import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { stripJsoncCommentsAndTrailingCommas } from "../config/load.ts"

// We test the pure logic functions by importing them from the shim module.
// The shim's main() spawns a child process, so we test the helpers directly.
import {
  parseArgs,
  buildIsolatedConfig,
  resolvePluginPath,
  readShimDefaults,
} from "./shim.ts"

function dedupArray<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

describe("shim parseArgs", () => {
  it("parses --profile", () => {
    const args = parseArgs(["--profile", "work"])
    assert.equal(args.profile, "work")
    assert.equal(args.noProviders, false)
    assert.equal(args.noPlugins, false)
    assert.equal(args.reset, false)
    assert.equal(args.help, false)
    assert.deepEqual(args.passthrough, [])
  })

  it("parses -p as shorthand for --profile", () => {
    const args = parseArgs(["-p", "work"])
    assert.equal(args.profile, "work")
    assert.deepEqual(args.passthrough, [])
  })

  it("parses --no-profile", () => {
    const args = parseArgs(["--no-profile"])
    assert.equal(args.noProfile, true)
  })

  it("parses -n as shorthand for --no-profile", () => {
    const args = parseArgs(["-n"])
    assert.equal(args.noProfile, true)
  })

  it("parses --no-providers and --no-plugins separately", () => {
    const a1 = parseArgs(["--no-providers"])
    assert.equal(a1.noProviders, true)
    assert.equal(a1.noPlugins, false)

    const a2 = parseArgs(["--no-plugins"])
    assert.equal(a2.noProviders, false)
    assert.equal(a2.noPlugins, true)
  })

  it("parses --ocmm-only as shorthand for both", () => {
    const args = parseArgs(["--ocmm-only"])
    assert.equal(args.noProviders, true)
    assert.equal(args.noPlugins, true)
  })

  it("parses --reset", () => {
    const args = parseArgs(["--reset"])
    assert.equal(args.reset, true)
  })

  it("parses --help and -h", () => {
    assert.equal(parseArgs(["--help"]).help, true)
    assert.equal(parseArgs(["-h"]).help, true)
  })

  it("parses --config-dir", () => {
    const args = parseArgs(["--config-dir", "/tmp/my-ocmm"])
    assert.equal(args.configDir, "/tmp/my-ocmm")
  })

  it("parses --opencode", () => {
    const args = parseArgs(["--opencode", "/usr/local/bin/opencode"])
    assert.equal(args.opencodeBin, "/usr/local/bin/opencode")
  })

  it("parses --keep-omo", () => {
    const args = parseArgs(["--keep-omo"])
    assert.equal(args.keepOmo, true)
  })

  it("defaults keepOmo to false", () => {
    const args = parseArgs([])
    assert.equal(args.keepOmo, false)
  })

  it("separates -- passthrough args", () => {
    const args = parseArgs(["--profile", "p", "--", "run", "--model", "hoo/glm-5.2", "hello"])
    assert.equal(args.profile, "p")
    assert.deepEqual(args.passthrough, ["run", "--model", "hoo/glm-5.2", "hello"])
  })

  it("passes through unknown args before --", () => {
    const args = parseArgs(["run", "--model", "hoo/glm-5.2"])
    assert.deepEqual(args.passthrough, ["run", "--model", "hoo/glm-5.2"])
  })

  it("passes through -c and --continue to opencode", () => {
    const args = parseArgs(["-c", "run", "hello"])
    assert.deepEqual(args.passthrough, ["-c", "run", "hello"])
    assert.equal(args.profile, undefined)

    const args2 = parseArgs(["--continue", "run", "hello"])
    assert.deepEqual(args2.passthrough, ["--continue", "run", "hello"])
  })

  it("combines ocmm flags with opencode passthrough", () => {
    const args = parseArgs(["-p", "work", "-c", "run", "hello"])
    assert.equal(args.profile, "work")
    assert.deepEqual(args.passthrough, ["-c", "run", "hello"])
  })

  it("parses --mode", () => {
    for (const m of ["none", "inline", "config-file", "config-dir", "xdg"] as const) {
      const args = parseArgs(["--mode", m])
      assert.equal(args.mode, m, `--mode ${m} should parse`)
    }
  })

  it("parses --config-file", () => {
    const args = parseArgs(["--config-file", "/tmp/my-config.json"])
    assert.equal(args.configFile, "/tmp/my-config.json")
  })

  it("handles empty args", () => {
    const args = parseArgs([])
    assert.equal(args.profile, undefined)
    assert.equal(args.mode, undefined)
    assert.equal(args.noProviders, false)
    assert.deepEqual(args.passthrough, [])
  })
})

describe("shim dedupArray", () => {
  it("removes duplicates", () => {
    assert.deepEqual(dedupArray(["a", "b", "a", "c", "b"]), ["a", "b", "c"])
  })

  it("handles empty array", () => {
    assert.deepEqual(dedupArray([]), [])
  })

  it("handles single element", () => {
    assert.deepEqual(dedupArray(["x"]), ["x"])
  })
})

describe("shim resolvePluginPath", () => {
  it("returns an existing plugin entry path", () => {
    const p = resolvePluginPath()
    assert.ok(/index\.(js|ts)$/.test(p), `expected index.js or index.ts, got ${p}`)
    assert.ok(existsSync(p), `plugin path does not exist: ${p}`)
  })
})

describe("shim buildIsolatedConfig", () => {
  let tempHome: string
  let origXdgConfig: string | undefined

  before(() => {
    tempHome = mkdtempSync(join(tmpdir(), "ocmm-shim-test-"))
    origXdgConfig = process.env.XDG_CONFIG_HOME
    // Create a fake global opencode config
    const globalConfigDir = join(tempHome, "opencode")
    mkdirSync(globalConfigDir, { recursive: true })
    const globalConfig = {
      provider: {
        hoo: { npm: "@ai-sdk/anthropic", options: { apiKey: "test-key" } },
      },
      disabled_providers: ["opencode", "openrouter"],
      plugin: ["occo", "opencode-dcp", "oh-my-openagent@latest"],
      agent: {
        compaction: { model: "hoo/deepseek-v4-pro" },
        title: { model: "hoo/deepseek-v4-flash" },
      },
      compaction: { auto: true, reserved: 5000 },
    }
    writeFileSync(join(globalConfigDir, "opencode.json"), JSON.stringify(globalConfig))
    process.env.XDG_CONFIG_HOME = tempHome
  })

  after(() => {
    if (origXdgConfig !== undefined) {
      process.env.XDG_CONFIG_HOME = origXdgConfig
    } else {
      delete process.env.XDG_CONFIG_HOME
    }
    rmSync(tempHome, { recursive: true, force: true })
  })

  it("merges providers, plugins, agent, compaction from global (omo stripped by default)", () => {
    const config = buildIsolatedConfig({
      mergeProviders: true,
      mergePlugins: true,
    })
    assert.ok(config.provider, "provider should be merged")
    assert.ok(config.provider!["hoo"], "hoo provider should be present")
    assert.deepEqual(config.disabled_providers, ["opencode", "openrouter"])
    assert.ok(config.agent, "agent should be merged")
    assert.ok(config.compaction, "compaction should be merged")
    assert.ok(config.plugin, "plugin array should exist")
    // occo + opencode-dcp + ocmm = 3 (oh-my-openagent stripped by default)
    assert.ok(config.plugin!.length >= 3, "should have global plugins (minus omo) + ocmm")
    assert.ok(config.plugin!.includes("occo"))
    assert.ok(config.plugin!.includes("opencode-dcp"))
    assert.ok(!config.plugin!.some((p) => p.includes("oh-my-openagent")), "omo should be stripped")
  })

  it("adds ocmm plugin path always", () => {
    const config = buildIsolatedConfig({
      mergeProviders: true,
      mergePlugins: true,
    })
    const pluginPath = resolvePluginPath()
    assert.ok(config.plugin!.includes(pluginPath), "ocmm plugin path should be in array")
  })

  it("strips oh-my-openagent variants (bare, @version, scoped)", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "ocmm-shim-omo-"))
    const origHome = process.env.XDG_CONFIG_HOME
    mkdirSync(join(emptyDir, "opencode"), { recursive: true })
    writeFileSync(
      join(emptyDir, "opencode", "opencode.json"),
      JSON.stringify({
        plugin: [
          "oh-my-openagent",
          "oh-my-openagent@latest",
          "occo",
          "@scope/oh-my-openagent",
        ],
      }),
    )
    process.env.XDG_CONFIG_HOME = emptyDir
    try {
      const config = buildIsolatedConfig({
        mergeProviders: false,
        mergePlugins: true,
      })
      assert.ok(config.plugin!.includes("occo"))
      assert.ok(!config.plugin!.some((p) => p.includes("oh-my-openagent")), "no omo variant should remain")
    } finally {
      process.env.XDG_CONFIG_HOME = origHome
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })

  it("keeps oh-my-openagent when keepOmo=true", () => {
    const config = buildIsolatedConfig({
      mergeProviders: true,
      mergePlugins: true,
      keepOmo: true,
    })
    assert.ok(
      config.plugin!.some((p) => p.includes("oh-my-openagent")),
      "omo should be present when keepOmo=true",
    )
  })

  it("skips providers when mergeProviders=false", () => {
    const config = buildIsolatedConfig({
      mergeProviders: false,
      mergePlugins: true,
    })
    assert.equal(config.provider, undefined)
    assert.equal(config.disabled_providers, undefined)
    assert.equal(config.agent, undefined)
    assert.ok(config.compaction)
    assert.ok(config.plugin!.includes("occo"))
  })

  it("skips plugins when mergePlugins=false", () => {
    const config = buildIsolatedConfig({
      mergeProviders: true,
      mergePlugins: false,
    })
    assert.ok(config.provider, "provider should still be merged")
    assert.ok(config.provider!["hoo"])
    assert.equal(config.plugin!.length, 1)
    const pluginPath = resolvePluginPath()
    assert.equal(config.plugin![0], pluginPath)
  })

  it("handles missing global config gracefully", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "ocmm-shim-empty-"))
    const origHome = process.env.XDG_CONFIG_HOME
    process.env.XDG_CONFIG_HOME = emptyDir
    try {
      const config = buildIsolatedConfig({
        mergeProviders: true,
        mergePlugins: true,
      })
      assert.equal(config.provider, undefined)
      assert.equal(config.compaction, undefined)
      assert.ok(config.plugin, "plugin array should still exist")
      assert.equal(config.plugin!.length, 1, "only ocmm plugin should be present")
    } finally {
      process.env.XDG_CONFIG_HOME = origHome
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })
})

describe("shim readShimDefaults", () => {
  let tempHome: string
  let origXdgConfig: string | undefined

  before(() => {
    tempHome = mkdtempSync(join(tmpdir(), "ocmm-shim-defaults-"))
    origXdgConfig = process.env.XDG_CONFIG_HOME
    const globalConfigDir = join(tempHome, "opencode")
    mkdirSync(globalConfigDir, { recursive: true })
    writeFileSync(
      join(globalConfigDir, "ocmm.jsonc"),
      JSON.stringify({
        workflow: "v1",
        shim: {
          mode: "inline",
          configDir: "/custom/iso-dir",
          configFile: "/custom/opencode.json",
          opencode: "/usr/local/bin/opencode",
          keepOmo: true,
          noProviders: true,
        },
      }),
    )
    process.env.XDG_CONFIG_HOME = tempHome
  })

  after(() => {
    if (origXdgConfig !== undefined) {
      process.env.XDG_CONFIG_HOME = origXdgConfig
    } else {
      delete process.env.XDG_CONFIG_HOME
    }
    rmSync(tempHome, { recursive: true, force: true })
  })

  it("reads shim defaults from ocmm.jsonc", async () => {
    const mod = await import("./shim.ts")
    const defaults = mod.readShimDefaults()
    assert.equal(defaults.mode, "inline")
    assert.equal(defaults.configDir, "/custom/iso-dir")
    assert.equal(defaults.configFile, "/custom/opencode.json")
    assert.equal(defaults.opencode, "/usr/local/bin/opencode")
    assert.equal(defaults.keepOmo, true)
    assert.equal(defaults.noProviders, true)
    assert.equal(defaults.noPlugins, undefined)
  })

  it("returns empty object when no shim config exists", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "ocmm-shim-empty2-"))
    const origHome = process.env.XDG_CONFIG_HOME
    process.env.XDG_CONFIG_HOME = emptyDir
    try {
      const mod = await import("./shim.ts")
      const defaults = mod.readShimDefaults()
      assert.deepEqual(defaults, {})
    } finally {
      process.env.XDG_CONFIG_HOME = origHome
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })
})
