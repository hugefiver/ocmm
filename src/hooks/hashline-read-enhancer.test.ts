import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { defaultConfig } from "../config/schema.ts"
import { computeLineHash } from "../hashline/index.ts"
import { createHashlineReadEnhancer, transformReadOutput } from "./hashline-read-enhancer.ts"

function enabledConfig() {
  return { ...defaultConfig(), hashline: { enabled: true } }
}

test("hashline read enhancer leaves output unchanged when disabled", async () => {
  const handler = createHashlineReadEnhancer({ getConfig: () => defaultConfig() })
  const output = { output: "1: alpha\n2: beta" }

  await handler({ tool: "read" }, output)

  assert.equal(output.output, "1: alpha\n2: beta")
})

test("hashline read enhancer tags raw numbered Read output", async () => {
  const handler = createHashlineReadEnhancer({ getConfig: enabledConfig })
  const output = { output: "1: alpha\n2: beta" }

  await handler({ tool: "read" }, output)

  assert.equal(
    output.output,
    `1#${computeLineHash(1, "alpha")}|alpha\n2#${computeLineHash(2, "beta")}|beta`,
  )
})

test("hashline read enhancer tags content blocks and skips truncated lines", () => {
  const transformed = transformReadOutput(
    `<content>\n1: alpha\n2: skipped ${"... (line truncated to 2000 chars)"}\n3: gamma\n</content>`,
  )

  assert.equal(
    transformed,
    `<content>\n1#${computeLineHash(1, "alpha")}|alpha\n2: skipped ... (line truncated to 2000 chars)\n3#${computeLineHash(3, "gamma")}|gamma\n</content>`,
  )
})

test("hashline read enhancer summarizes successful Write output from file path", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-hashline-read-"))
  const filePath = join(root, "written.txt")
  try {
    writeFileSync(filePath, "alpha\nbeta\n", "utf8")
    const handler = createHashlineReadEnhancer({ getConfig: enabledConfig })
    const output = { output: "Wrote file" }

    await handler({ tool: { name: "write" }, args: { filePath } }, output)

    assert.equal(output.output, "File written successfully. 2 lines written.")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
