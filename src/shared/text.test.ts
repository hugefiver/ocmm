import { test } from "node:test"
import assert from "node:assert/strict"

import { stripLeadingUtf8Bom } from "./text.ts"

test("stripLeadingUtf8Bom removes only one BOM at the start", () => {
  assert.equal(stripLeadingUtf8Bom("plain text"), "plain text")
  assert.equal(stripLeadingUtf8Bom("before\uFEFFafter"), "before\uFEFFafter")
  assert.equal(stripLeadingUtf8Bom("\uFEFFtext"), "text")
  assert.equal(stripLeadingUtf8Bom("\uFEFF\uFEFFtext"), "\uFEFFtext")
})
