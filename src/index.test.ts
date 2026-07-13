import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createPlugin } from "./index.ts"

async function withIsolatedConfig<T>(projectConfig: unknown | null, run: (cwd: string) => T | Promise<T>): Promise<T> {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-index-xdg-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-index-project-"))
  const previousXdg = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    if (projectConfig !== null) {
      mkdirSync(join(cwd, ".opencode"), { recursive: true })
      writeFileSync(join(cwd, ".opencode", "ocmm.jsonc"), JSON.stringify(projectConfig, null, 2))
    }
    return await run(cwd)
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdg
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
}

test("plugin omits hashline edit tool and exposes skill_mcp by default", async () => {
  await withIsolatedConfig(null, (cwd) => {
    const { pluginInterface } = createPlugin({ directory: cwd })
    assert.equal(pluginInterface.tool?.edit, undefined)
    assert.equal(typeof pluginInterface.tool?.skill_mcp.execute, "function")
    assert.equal(typeof pluginInterface["tool.execute.before"], "function")
    assert.equal(typeof pluginInterface["tool.execute.after"], "function")
    assert.equal(typeof pluginInterface["tool.definition"], "function")
  })
})

test("plugin exposes hashline edit tool when hashline is enabled", async () => {
  await withIsolatedConfig({ hashline: { enabled: true } }, (cwd) => {
    const { pluginInterface } = createPlugin({ directory: cwd })
    assert.equal(typeof pluginInterface["tool.execute.after"], "function")
    assert.equal(typeof pluginInterface.tool?.edit.execute, "function")
  })
})

test("plugin exposes skill_mcp tool when MCP servers are configured", async () => {
  await withIsolatedConfig(
    { mcp: { servers: { docs: { type: "remote", url: "https://docs.example/mcp" } } } },
    async (cwd) => {
      const { pluginInterface } = createPlugin({ directory: cwd })
      assert.equal(typeof pluginInterface.tool?.skill_mcp.execute, "function")

      const result = await pluginInterface.tool!.skill_mcp.execute(
        { mcp_name: "docs", tool_name: "search", arguments: { q: "zod" } },
        {},
      )
      assert.match(result, /"mcp": "docs"/)
      assert.match(result, /transport is not active/)
    },
  )
})

test("reload refreshes config-dependent tool map", async () => {
  await withIsolatedConfig(null, (cwd) => {
    const configPath = join(cwd, ".opencode", "ocmm.jsonc")
    mkdirSync(join(cwd, ".opencode"), { recursive: true })
    writeFileSync(configPath, JSON.stringify({ hashline: { enabled: true } }))

    const { pluginInterface, reload } = createPlugin({ directory: cwd })
    assert.equal(typeof pluginInterface.tool?.edit.execute, "function")

    writeFileSync(configPath, JSON.stringify({ mcp: { servers: { docs: { type: "remote", url: "https://docs.example/mcp" } } } }))
    reload()
    assert.equal(pluginInterface.tool?.edit, undefined)
    assert.equal(typeof pluginInterface.tool?.skill_mcp.execute, "function")

    writeFileSync(configPath, JSON.stringify({}))
    reload()
    assert.equal(pluginInterface.tool?.edit, undefined)
    assert.equal(typeof pluginInterface.tool?.skill_mcp.execute, "function")
  })
})

test("plugin tool after hook composes hashline and rules injectors", async () => {
  await withIsolatedConfig({ hashline: { enabled: true }, rules: { enabled: true } }, async (cwd) => {
    const file = join(cwd, "src", "app.ts")
    mkdirSync(join(cwd, "src"), { recursive: true })
    writeFileSync(file, "export const app = true\n")
    writeFileSync(join(cwd, "src", "AGENTS.md"), "Use src context.\n")
    mkdirSync(join(cwd, ".omo", "rules"), { recursive: true })
    writeFileSync(
      join(cwd, ".omo", "rules", "typescript.md"),
      "---\nglobs: [\"**/*.ts\"]\n---\nUse strict types.\n",
    )

    const { pluginInterface } = createPlugin({ directory: cwd })
    const output = { output: "1: export const app = true", metadata: { filePath: file } }
    await pluginInterface["tool.execute.after"]?.({ tool: "read", args: { filePath: file } }, output)

    assert.match(output.output, /^1#[A-Z]{2}\|export const app = true/)
    assert.match(output.output, /\[Rule: \.omo\/rules\/typescript\.md\]/)
    assert.match(output.output, /\[Directory Context: /)
  })
})

test("plugin before and definition hooks expose permission guards", async () => {
  await withIsolatedConfig(null, async (cwd) => {
    const file = join(cwd, "existing.txt")
    writeFileSync(file, "old")
    const { pluginInterface } = createPlugin({ directory: cwd })

    await assert.rejects(
      pluginInterface["tool.execute.before"]?.(
        { tool: "write", sessionID: "s1", args: { filePath: file, content: "new" } },
        {},
      ),
      /File already exists/,
    )

    const definitionOutput = { description: "old" }
    await pluginInterface["tool.definition"]?.({ toolID: "todowrite" }, definitionOutput)
    assert.match(definitionOutput.description, /WHERE, HOW, WHY/)
  })
})

test("plugin tracks subagent depth and blocks task dispatches beyond maxDepth", async () => {
  await withIsolatedConfig(null, async (cwd) => {
    const { pluginInterface } = createPlugin({ directory: cwd })

    // Fire session.created events to build depth: main -> d1 -> d2 -> d3.
    await pluginInterface.event?.({ type: "session.created", properties: { sessionID: "main" } })
    await pluginInterface.event?.({ type: "session.created", properties: { sessionID: "d1", parentID: "main" } })
    await pluginInterface.event?.({ type: "session.created", properties: { sessionID: "d2", parentID: "d1" } })
    await pluginInterface.event?.({ type: "session.created", properties: { sessionID: "d3", parentID: "d2" } })

    // depth 3 == default maxDepth 3 -> blocked.
    await assert.rejects(
      pluginInterface["tool.execute.before"]?.(
        { tool: "task", sessionID: "d3", args: { description: "x", subagent_type: "coding", prompt: "y" } },
        {},
      ),
      /subagent nesting depth limit reached.*current depth: 3/,
    )

    // depth 2 still allowed
    await pluginInterface["tool.execute.before"]?.(
      { tool: "task", sessionID: "d2", args: { description: "x", subagent_type: "coding", prompt: "y" } },
      {},
    )
  })
})
