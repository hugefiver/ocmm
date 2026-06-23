import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { deepMerge, loadConfig, stripJsoncCommentsAndTrailingCommas } from "./load.ts"
import { defaultConfig } from "./schema.ts"

test("stripJsoncCommentsAndTrailingCommas keeps strings intact", () => {
  const src = `{
  // a comment
  "url": "https://example.com",
  "regex": "// not a comment",
  "trailing": [1, 2, 3,], /* block */
}`
  const out = stripJsoncCommentsAndTrailingCommas(src)
  const parsed = JSON.parse(out) as Record<string, unknown>
  assert.equal(parsed.url, "https://example.com")
  assert.equal(parsed.regex, "// not a comment")
  assert.deepEqual(parsed.trailing, [1, 2, 3])
})

test("deepMerge: scalars and objects override; key-aware arrays union", () => {
  const a = {
    debug: false,
    intent: { enabled: true, skipAgents: ["a"] },
    fallbackModels: ["openai/gpt-5", "openai/gpt-4"],
    disabledAgents: ["code-search"],
    disabledHooks: ["hook-a"],
    disabledTools: ["tool-a"],
    disabledSkills: ["skill-a"],
    disabledCommands: ["command-a"],
    disabledMcps: ["mcp-a"],
    other: [1, 2],
  }
  const b = {
    debug: true,
    intent: { skipAgents: ["b"] },
    fallbackModels: ["openai/gpt-5.5"],
    disabledAgents: ["code-search", "doc-search"],
    disabledHooks: ["hook-b"],
    disabledTools: ["tool-a", "tool-b"],
    disabledSkills: ["skill-b"],
    disabledCommands: ["command-b"],
    disabledMcps: ["mcp-b"],
    other: [3],
  }
  const merged = deepMerge(a, b) as typeof a
  assert.equal(merged.debug, true)
  assert.equal(merged.intent.enabled, true)
  assert.deepEqual(merged.intent.skipAgents, ["b"]) // generic arrays override
  // unioned-arrays
  assert.deepEqual(merged.fallbackModels.sort(), [
    "openai/gpt-4",
    "openai/gpt-5",
    "openai/gpt-5.5",
  ])
  assert.deepEqual(merged.disabledAgents.sort(), ["code-search", "doc-search"])
  assert.deepEqual(merged.disabledHooks.sort(), ["hook-a", "hook-b"])
  assert.deepEqual(merged.disabledTools.sort(), ["tool-a", "tool-b"])
  assert.deepEqual(merged.disabledSkills.sort(), ["skill-a", "skill-b"])
  assert.deepEqual(merged.disabledCommands.sort(), ["command-a", "command-b"])
  assert.deepEqual(merged.disabledMcps.sort(), ["mcp-a", "mcp-b"])
  assert.deepEqual(merged.other, [3])
})

test("workflow field defaults to omo", () => {
  const cfg = defaultConfig()
  assert.equal(cfg.workflow, "omo")
})

test("deepMerge: workflow scalar replaces (project wins)", () => {
  const user = { workflow: "v1" as const }
  const project = { workflow: "omo" as const }
  const merged = deepMerge(user, project) as { workflow: string }
  assert.equal(merged.workflow, "omo")
})

test("project config cannot extend mcp envAllowlist", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-load-xdg-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-load-project-"))
  const previousXdg = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    mkdirSync(join(xdg, "opencode"), { recursive: true })
    mkdirSync(join(cwd, ".opencode"), { recursive: true })
    writeFileSync(join(xdg, "opencode", "ocmm.jsonc"), JSON.stringify({ mcp: { envAllowlist: ["USER_KEY"] } }))
    writeFileSync(join(cwd, ".opencode", "ocmm.jsonc"), JSON.stringify({ mcp: { envAllowlist: ["PROJECT_KEY"] } }))

    const { config } = loadConfig({ cwd })
    assert.deepEqual(config.mcp.envAllowlist, ["USER_KEY"])
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdg
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
})
