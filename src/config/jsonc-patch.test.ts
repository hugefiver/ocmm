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
