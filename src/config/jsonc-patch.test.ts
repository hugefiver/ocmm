import { test } from "node:test"
import assert from "node:assert/strict"
import { patchTopLevelScalar, PatchError } from "./jsonc-patch.ts"

test("sets an existing top-level string field, preserving comments", () => {
  const src = `{
  // workflow selection
  "workflow": "v1",
  "activeProfile": "old",
  "debug": false
}`
  const out = patchTopLevelScalar(src, "activeProfile", "co")
  assert.ok(out.includes(`"activeProfile": "co"`))
  assert.ok(out.includes(`// workflow selection`))
  assert.ok(out.includes(`"workflow": "v1"`))
  assert.ok(!out.includes(`"old"`))
})

test("inserts a new field into an object that already has properties", () => {
  const src = `{
  "workflow": "v1"
}`
  const out = patchTopLevelScalar(src, "activeProfile", "co")
  assert.ok(out.includes(`"activeProfile": "co"`))
  assert.ok(out.includes(`"workflow": "v1"`))
  // comma before the new field
  assert.ok(out.includes(`"v1",\n  "activeProfile"`))
})

test("inserts a new field into an empty object", () => {
  const src = `{}`
  const out = patchTopLevelScalar(src, "activeProfile", "co")
  assert.ok(out.includes(`"activeProfile": "co"`))
  assert.ok(!out.includes(","))
})

test("removes an existing field, fixing trailing comma", () => {
  const src = `{
  "workflow": "v1",
  "activeProfile": "co"
}`
  const out = patchTopLevelScalar(src, "activeProfile", null)
  assert.ok(!out.includes(`"activeProfile"`))
  assert.ok(out.includes(`"workflow": "v1"`))
  // no dangling comma after workflow now
  assert.ok(out.includes(`"workflow": "v1"\n}`))
})

test("removes a middle field, preserving surrounding commas", () => {
  const src = `{
  "workflow": "v1",
  "activeProfile": "co",
  "debug": false
}`
  const out = patchTopLevelScalar(src, "activeProfile", null)
  assert.ok(!out.includes(`"activeProfile"`))
  assert.ok(out.includes(`"workflow": "v1",`))
  assert.ok(out.includes(`"debug": false`))
})

test("remove is idempotent when field absent", () => {
  const src = `{
  "workflow": "v1"
}`
  const out = patchTopLevelScalar(src, "activeProfile", null)
  assert.equal(out, src)
})

test("preserves block comments around the patched line", () => {
  const src = `{
  /* top */ "activeProfile": "old", /* trailing */
  "debug": false
}`
  const out = patchTopLevelScalar(src, "activeProfile", "co")
  assert.ok(out.includes(`/* top */`))
  assert.ok(out.includes(`/* trailing */`))
  assert.ok(out.includes(`"activeProfile": "co"`))
})

test("sets a boolean field", () => {
  const src = `{
  "debug": false
}`
  const out = patchTopLevelScalar(src, "debug", true)
  assert.ok(out.includes(`"debug": true`))
})

test("sets a number field", () => {
  const src = `{
  "count": 1
}`
  const out = patchTopLevelScalar(src, "count", 42)
  assert.ok(out.includes(`"count": 42`))
})

test("throws PatchError on unparseable input", () => {
  const src = `{ this is not valid`
  assert.throws(
    () => patchTopLevelScalar(src, "activeProfile", "co"),
    PatchError,
  )
})

test("value with special chars is JSON-escaped", () => {
  const src = `{
  "activeProfile": "x"
}`
  const out = patchTopLevelScalar(src, "activeProfile", 'a"b\\c')
  assert.ok(out.includes(`"activeProfile": "a\\"b\\\\c"`))
})

test("sets an existing field whose current value contains a comma (no duplicate key)", () => {
  const src = `{
  "activeProfile": "a,b"
}`
  const out = patchTopLevelScalar(src, "activeProfile", "co")
  // Must not produce a duplicate key — count occurrences of the key.
  const keyCount = (out.match(/"activeProfile"/g) || []).length
  assert.equal(keyCount, 1)
  assert.ok(out.includes(`"activeProfile": "co"`))
  assert.ok(!out.includes(`"a,b"`))
})

test("sets an existing field whose current value contains a brace", () => {
  const src = `{
  "note": "a}b"
}`
  const out = patchTopLevelScalar(src, "note", "x")
  const keyCount = (out.match(/"note"/g) || []).length
  assert.equal(keyCount, 1)
  assert.ok(out.includes(`"note": "x"`))
})

test("inserts a new field when last property has a trailing line comment", () => {
  const src = `{
  "workflow": "v1" // my workflow
}`
  const out = patchTopLevelScalar(src, "activeProfile", "co")
  assert.ok(out.includes(`"activeProfile": "co"`))
  assert.ok(out.includes(`// my workflow`))
  // must be valid (no PatchError thrown)
  const keyCount = (out.match(/"activeProfile"/g) || []).length
  assert.equal(keyCount, 1)
})

test("inserts a new field when object contains only comments", () => {
  const src = `{
  // just a comment
}`
  const out = patchTopLevelScalar(src, "activeProfile", "co")
  assert.ok(out.includes(`"activeProfile": "co"`))
  assert.ok(out.includes(`// just a comment`))
  // comment text must not be corrupted with a comma
  assert.ok(!out.includes(`comment,`))
})
