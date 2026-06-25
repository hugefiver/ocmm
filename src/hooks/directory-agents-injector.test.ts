import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { defaultConfig } from "../config/schema.ts"
import { agentsBlocks, createDirectoryAgentsInjector } from "./directory-agents-injector.ts"

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "ocmm-agents-hook-"))
}

function write(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, content)
}

test("agentsBlocks appends root-most directory AGENTS context", async () => {
  const project = makeRoot()
  try {
    const file = join(project, "src", "feature", "app.ts")
    write(join(project, "AGENTS.md"), "root ignored\n")
    write(join(project, "src", "AGENTS.md"), "src rules\n")
    write(join(project, "src", "feature", "AGENTS.md"), "feature rules\n")
    write(file, "x\n")

    const blocks = await agentsBlocks({ filePath: file, projectRoot: project })
    assert.equal(blocks.length, 2)
    assert.match(blocks[0] ?? "", /\[Directory Context: .+src.+AGENTS\.md\]/)
    assert.match(blocks[0] ?? "", /src rules/)
    assert.match(blocks[1] ?? "", /feature rules/)
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

test("directory AGENTS injector is read-only and disabledHooks gated", async () => {
  const project = makeRoot()
  try {
    const file = join(project, "src", "app.ts")
    write(join(project, "src", "AGENTS.md"), "Use src context.\n")
    write(file, "x\n")

    const output = { output: "Read output", metadata: { filePath: file } }
    const injector = createDirectoryAgentsInjector({
      getConfig: () => ({ ...defaultConfig(), rules: { enabled: true, skipClaudeUserRules: false } }),
      projectRoot: project,
    })
    await injector({ tool: "read", args: { filePath: file } }, output)
    assert.match(output.output, /\[Directory Context: /)
    assert.match(output.output, /Use src context\./)

    const writeOutput = { output: "Write output", metadata: { filePath: file } }
    await injector({ tool: "write", args: { filePath: file } }, writeOutput)
    assert.equal(writeOutput.output, "Write output")

    const disabledOutput = { output: "Read output", metadata: { filePath: file } }
    const disabled = createDirectoryAgentsInjector({
      getConfig: () => ({
        ...defaultConfig(),
        rules: { enabled: true, skipClaudeUserRules: false },
        disabledHooks: ["directory-agents-injector"],
      }),
      projectRoot: project,
    })
    await disabled({ tool: "read", args: { filePath: file } }, disabledOutput)
    assert.equal(disabledOutput.output, "Read output")
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

test("agents injector caches per session — does not re-inject same dir", async () => {
  const root = makeRoot()
  try {
    write(join(root, "src", "AGENTS.md"), "# Project Rules\n")
    write(join(root, "src", "app.ts"), "")
    const sessionCache = new Map<string, Set<string>>()
    const injector = createDirectoryAgentsInjector({
      getConfig: () => ({ ...defaultConfig(), rules: { enabled: true, skipClaudeUserRules: false } }),
      projectRoot: root,
      sessionCache,
    })
    const input1 = { tool: "read", sessionID: "s1", args: { filePath: join(root, "src", "app.ts") } }
    const output1 = { output: "file content" }
    await injector(input1, output1)
    assert.match(output1.output, /\[Directory Context:/)
    const input2 = { tool: "read", sessionID: "s1", args: { filePath: join(root, "src", "app.ts") } }
    const output2 = { output: "file content 2" }
    await injector(input2, output2)
    assert.doesNotMatch(output2.output, /\[Directory Context:/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("agents injector injects again for different session", async () => {
  const root = makeRoot()
  try {
    write(join(root, "src", "AGENTS.md"), "# Project Rules\n")
    write(join(root, "src", "app.ts"), "")
    const sessionCache = new Map<string, Set<string>>()
    const injector = createDirectoryAgentsInjector({
      getConfig: () => ({ ...defaultConfig(), rules: { enabled: true, skipClaudeUserRules: false } }),
      projectRoot: root,
      sessionCache,
    })
    await injector(
      { tool: "read", sessionID: "s1", args: { filePath: join(root, "src", "app.ts") } },
      { output: "content" },
    )
    const output2 = { output: "content 2" }
    await injector(
      { tool: "read", sessionID: "s2", args: { filePath: join(root, "src", "app.ts") } },
      output2,
    )
    assert.match(output2.output, /\[Directory Context:/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
