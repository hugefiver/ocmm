import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { defaultConfig } from "../config/schema.ts"
import { createRulesInjector, matchingRuleBlocks } from "./rules-injector.ts"

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "ocmm-rules-hook-"))
}

function write(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, content)
}

test("matchingRuleBlocks returns formatted matching rule output", async () => {
  const project = makeRoot()
  const home = makeRoot()
  try {
    const file = join(project, "src", "app.ts")
    write(file, "export const app = true\n")
    write(join(project, ".omo", "rules", "typescript.md"), "---\nglobs: [\"**/*.ts\"]\n---\nUse strict types.\n")
    write(join(home, ".claude", "rules", "ignored.md"), "---\nalwaysApply: true\n---\nignored\n")

    const blocks = await matchingRuleBlocks({
      filePath: file,
      projectRoot: project,
      homeDir: home,
      skipClaudeUserRules: true,
    })
    assert.equal(blocks.length, 1)
    assert.match(blocks[0] ?? "", /\[Rule: \.omo\/rules\/typescript\.md\]/)
    assert.match(blocks[0] ?? "", /\[Match: glob: \*\*\/\*\.ts\]/)
    assert.match(blocks[0] ?? "", /Use strict types\./)
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

test("rules injector appends rules only when enabled and hook is not disabled", async () => {
  const project = makeRoot()
  try {
    const file = join(project, "src", "app.ts")
    write(file, "export const app = true\n")
    write(join(project, ".omo", "rules", "typescript.md"), "---\nglobs: [\"**/*.ts\"]\n---\nRule body.\n")

    const output = { output: "Read output", metadata: { filePath: file } }
    const enabled = createRulesInjector({
      getConfig: () => ({ ...defaultConfig(), rules: { enabled: true, skipClaudeUserRules: true } }),
      projectRoot: project,
      homeDir: project,
    })
    await enabled({ tool: "read", args: { filePath: file } }, output)
    assert.match(output.output, /\[Rule: \.omo\/rules\/typescript\.md\]/)

    const disabledOutput = { output: "Read output", metadata: { filePath: file } }
    const disabled = createRulesInjector({
      getConfig: () => ({
        ...defaultConfig(),
        rules: { enabled: true, skipClaudeUserRules: false },
        disabledHooks: ["rules-injector"],
      }),
      projectRoot: project,
      homeDir: project,
    })
    await disabled({ tool: "read", args: { filePath: file } }, disabledOutput)
    assert.equal(disabledOutput.output, "Read output")
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})
