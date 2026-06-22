import { test } from "node:test"
import assert from "node:assert/strict"

import {
  applyHashlineEditsWithReport,
  computeLineHash,
  formatHashLine,
  generateUnifiedDiff,
  normalizeHashlineEdits,
  parseLineRef,
  validateLineRefs,
} from "./index.ts"

test("formats and parses stable line references", () => {
  const formatted = formatHashLine(2, "  return true")
  const hash = computeLineHash(2, "  return true")

  assert.equal(formatted, `2#${hash}|  return true`)
  assert.deepEqual(parseLineRef(`>>> 2 # ${hash}|  return true`), { line: 2, hash })
})

test("reports hash mismatches with updated line references", () => {
  const stale = `2#${computeLineHash(2, "old")}`

  assert.throws(
    () => validateLineRefs(["one", "new", "three"], [stale]),
    /line has changed since last read[\s\S]*>>> 2#/,
  )
})

test("applies multiple edits against the original snapshot", () => {
  const content = ["alpha", "beta", "gamma"].join("\n")
  const edits = normalizeHashlineEdits([
    { op: "replace", pos: `2#${computeLineHash(2, "beta")}`, lines: "BETA" },
    { op: "append", pos: `1#${computeLineHash(1, "alpha")}`, lines: ["inserted"] },
  ])

  const report = applyHashlineEditsWithReport(content, edits)

  assert.equal(report.content, ["alpha", "inserted", "BETA", "gamma"].join("\n"))
  assert.equal(report.noopEdits, 0)
  assert.equal(report.deduplicatedEdits, 0)
})

test("minimal unified diff reports additions and deletions", () => {
  const diff = generateUnifiedDiff("a\nb\nc\n", "a\nB\nc\nd\n", "file.txt")

  assert.match(diff, /^--- file\.txt\n\+\+\+ file\.txt\n@@ /)
  assert.match(diff, /^-b$/m)
  assert.match(diff, /^\+B$/m)
  assert.match(diff, /^\+d$/m)
})
