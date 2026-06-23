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
