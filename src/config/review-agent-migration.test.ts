import { test } from "node:test"
import assert from "node:assert/strict"
import {
  ReviewConfigConflictError,
  assertSelectedReviewProfileCompatible,
  prepareConfigLayers,
  prepareReviewProfile,
} from "./review-agent-migration.ts"

test("legacy oracle-high migrates to oracle-2nd and warns with source", () => {
  const warnings: string[] = []
  const prepared = prepareConfigLayers([
    { source: "C:/config/user.jsonc", value: { agents: { "oracle-high": { model: "openai/gpt-5.5" } } } },
  ], (message) => warnings.push(message))
  const migrated = prepared.layers[0]!.value as { agents: Record<string, unknown> }
  assert.deepEqual(Object.keys(migrated.agents), ["oracle-2nd"])
  assert.match(warnings[0] ?? "", /agents\.oracle-high.*C:\/config\/user\.jsonc.*agents\.oracle-2nd/)
})

test("different spellings collide across active base layers", () => {
  assert.throws(
    () => prepareConfigLayers([
      { source: "user", value: { agents: { "oracle-high": { model: "openai/gpt-5.5" } } } },
      { source: "project", value: { agents: { "oracle-2nd": { model: "anthropic/claude-opus-4-7" } } } },
    ], () => {}),
    /oracle-high.*user.*oracle-2nd.*project/,
  )
})

test("alias and canonical keys collide inside one agent map", () => {
  assert.throws(
    () => prepareConfigLayers([{
      source: "project",
      value: {
        agents: {
          "oracle-second": { model: "a/one" },
          "oracle-2nd": { model: "b/two" },
        },
      },
    }], () => {}),
    /oracle-second.*oracle-2nd|oracle-2nd.*oracle-second/,
  )
})

test("canonical-to-canonical override remains valid", () => {
  assert.doesNotThrow(() => prepareConfigLayers([
    { source: "user", value: { agents: { "oracle-2nd": { model: "a/one" } } } },
    { source: "project", value: { agents: { "oracle-2nd": { model: "b/two" } } } },
  ], () => {}))
})

test("every inline profile is canonicalized and retains provenance for selection-time conflicts", () => {
  const prepared = prepareConfigLayers([{
    source: "user",
    value: {
      agents: { "oracle-2nd": { model: "a/one" } },
      profiles: {
        inactive: { agents: { "oracle-high": { model: "b/two" } } },
        selected: { agents: { "oracle-second": { model: "c/three" } } },
      },
    },
  }], () => {})
  const value = prepared.layers[0]!.value as {
    profiles: Record<string, { agents: Record<string, unknown> }>
  }
  assert.deepEqual(Object.keys(value.profiles.inactive!.agents), ["oracle-2nd"])
  assert.deepEqual(Object.keys(value.profiles.selected!.agents), ["oracle-2nd"])
  assert.equal(prepared.inlineProfiles.get("inactive")?.length, 1)
  assert.throws(
    () => assertSelectedReviewProfileCompatible(
      prepared.baseOrigins,
      prepared.inlineProfiles.get("selected") ?? [],
    ),
    ReviewConfigConflictError,
  )
})

test("a shadowing directory profile is the only profile compared with base", () => {
  const prepared = prepareConfigLayers([{
    source: "base",
    value: {
      agents: { "oracle-2nd": { model: "a/one" } },
      profiles: { selected: { agents: { "oracle-high": { model: "b/two" } } } },
    },
  }], () => {})
  const winner = prepareReviewProfile({
    name: "selected",
    source: "C:/project/.opencode/ocmm-profiles/selected.jsonc",
    value: { agents: { "oracle-2nd": { model: "c/three" } } },
  }, () => {})
  assert.doesNotThrow(() => assertSelectedReviewProfileCompatible(prepared.baseOrigins, [winner]))
})
