import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  loadAllPrompts,
  getDeepworkPrompt,
  getModePrompt,
  getCategoryPrompt,
} from "./prompt-loader.ts"

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ocmm-prompts-"))
  mkdirSync(join(root, "deepwork"), { recursive: true })
  mkdirSync(join(root, "mode"), { recursive: true })
  mkdirSync(join(root, "category"), { recursive: true })
  return root
}

test("loadAllPrompts loads files that exist and tolerates missing ones", () => {
  const root = makeTempRoot()
  try {
    writeFileSync(join(root, "deepwork", "default.md"), "default-content")
    writeFileSync(join(root, "mode", "team.md"), "team-content")
    loadAllPrompts(root)
    assert.ok(getDeepworkPrompt("default").length > 0)
    assert.equal(getModePrompt("team"), "team-content")
    assert.equal(getCategoryPrompt("frontend"), "")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("reload clears stale cache so removed files disappear", () => {
  const rootA = makeTempRoot()
  const rootB = makeTempRoot()
  try {
    writeFileSync(join(rootA, "deepwork", "default.md"), "from-root-a")
    writeFileSync(join(rootA, "mode", "superplan.md"), "sp-a")
    loadAllPrompts(rootA)
    assert.equal(getDeepworkPrompt("default"), "from-root-a")
    assert.equal(getModePrompt("superplan"), "sp-a")

    // rootB has a different file set — no default.md, but has gpt.md
    writeFileSync(join(rootB, "deepwork", "gpt.md"), "gpt-b")
    loadAllPrompts(rootB)
    assert.equal(getDeepworkPrompt("default"), "", "stale default.md must be gone after reload")
    assert.equal(getDeepworkPrompt("gpt"), "gpt-b")
    assert.equal(getModePrompt("superplan"), "", "stale superplan.md must be gone after reload")
  } finally {
    rmSync(rootA, { recursive: true, force: true })
    rmSync(rootB, { recursive: true, force: true })
  }
})
