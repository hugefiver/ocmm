import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createPlugin } from "./index.ts"

function withIsolatedConfig<T>(projectConfig: unknown | null, run: (cwd: string) => T): T {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-index-xdg-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-index-project-"))
  const previousXdg = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    if (projectConfig !== null) {
      mkdirSync(join(cwd, ".opencode"), { recursive: true })
      writeFileSync(join(cwd, ".opencode", "ocmm.jsonc"), JSON.stringify(projectConfig, null, 2))
    }
    return run(cwd)
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdg
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
}

test("plugin omits hashline edit tool by default", () => {
  withIsolatedConfig(null, (cwd) => {
    const { pluginInterface } = createPlugin({ directory: cwd })
    assert.equal(pluginInterface.tool, undefined)
    assert.equal(typeof pluginInterface["tool.execute.after"], "function")
  })
})

test("plugin exposes hashline edit tool when hashline is enabled", () => {
  withIsolatedConfig({ hashline: { enabled: true } }, (cwd) => {
    const { pluginInterface } = createPlugin({ directory: cwd })
    assert.equal(typeof pluginInterface["tool.execute.after"], "function")
    assert.equal(typeof pluginInterface.tool?.edit.execute, "function")
  })
})
