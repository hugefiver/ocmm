import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { computeLineHash } from "../hashline/index.ts"
import { executeHashlineEditTool } from "./hashline-edit.ts"

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "ocmm-hashline-tool-"))
}

test("hashline edit tool updates files and publishes metadata", async () => {
  const root = tempRoot()
  const filePath = join(root, "sample.txt")
  const metadata: unknown[] = []
  try {
    writeFileSync(filePath, "alpha\nbeta\ngamma", "utf8")

    const result = await executeHashlineEditTool(
      {
        filePath,
        edits: [
          { op: "replace", pos: `2#${computeLineHash(2, "beta")}`, lines: "BETA" },
          { op: "append", pos: `1#${computeLineHash(1, "alpha")}`, lines: ["inserted"] },
        ],
      },
      { metadata: (value) => metadata.push(value) },
    )

    assert.equal(result, `Updated ${filePath}`)
    assert.equal(readFileSync(filePath, "utf8"), "alpha\ninserted\nBETA\ngamma")
    assert.equal(metadata.length, 1)
    const meta = metadata[0] as { metadata: { firstChangedLine?: number; diff?: string } }
    assert.equal(meta.metadata.firstChangedLine, 2)
    assert.match(meta.metadata.diff ?? "", /^--- /)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("hashline edit tool rejects stale anchors", async () => {
  const root = tempRoot()
  const filePath = join(root, "sample.txt")
  try {
    writeFileSync(filePath, "alpha\nchanged", "utf8")

    const result = await executeHashlineEditTool({
      filePath,
      edits: [{ op: "replace", pos: `2#${computeLineHash(2, "beta")}`, lines: "BETA" }],
    })

    assert.match(result, /^Error: hash mismatch - /)
    assert.match(result, />>> 2#/)
    assert.equal(readFileSync(filePath, "utf8"), "alpha\nchanged")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("hashline edit tool creates, renames, and deletes files", async () => {
  const root = tempRoot()
  const filePath = join(root, "created.txt")
  const renamedPath = join(root, "renamed.txt")
  try {
    const createResult = await executeHashlineEditTool({
      filePath,
      edits: [{ op: "append", lines: ["created"] }],
    })
    assert.equal(createResult, `Updated ${filePath}`)
    assert.equal(readFileSync(filePath, "utf8"), "created")

    const moveResult = await executeHashlineEditTool({
      filePath,
      rename: renamedPath,
      edits: [{ op: "append", pos: `1#${computeLineHash(1, "created")}`, lines: ["next"] }],
    })
    assert.equal(moveResult, `Moved ${filePath} to ${renamedPath}`)
    assert.equal(readFileSync(renamedPath, "utf8"), "created\nnext")

    const deleteResult = await executeHashlineEditTool({ filePath: renamedPath, delete: true, edits: [] })
    assert.equal(deleteResult, `Successfully deleted ${renamedPath}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
