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

test("plugin omits hashline edit tool by default", async () => {
  await withIsolatedConfig(null, (cwd) => {
    const { pluginInterface } = createPlugin({ directory: cwd })
    assert.equal(pluginInterface.tool, undefined)
    assert.equal(typeof pluginInterface["tool.execute.after"], "function")
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
