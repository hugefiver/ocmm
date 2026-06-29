import { describe, test } from "node:test"
import assert from "node:assert"
import { isGitWriteCommand, isBuiltinAgentName } from "./index.ts"

describe("isGitWriteCommand", () => {
  test("matches git commit", () => {
    assert.ok(isGitWriteCommand("git commit -m test"))
  })
  test("matches git push", () => {
    assert.ok(isGitWriteCommand("git push origin main"))
  })
  test("matches git tag", () => {
    assert.ok(isGitWriteCommand("git tag v1.0"))
  })
  test("matches git reset --hard", () => {
    assert.ok(isGitWriteCommand("git reset --hard HEAD~1"))
  })
  test("matches git rebase", () => {
    assert.ok(isGitWriteCommand("git rebase main"))
  })
  test("matches git cherry-pick", () => {
    assert.ok(isGitWriteCommand("git cherry-pick abc123"))
  })
  test("matches git revert", () => {
    assert.ok(isGitWriteCommand("git revert HEAD"))
  })
  test("does NOT match git status", () => {
    assert.ok(!isGitWriteCommand("git status"))
  })
  test("does NOT match git log", () => {
    assert.ok(!isGitWriteCommand("git log --oneline"))
  })
  test("does NOT match git diff", () => {
    assert.ok(!isGitWriteCommand("git diff"))
  })
  test("matches git commit after env var prefix", () => {
    assert.ok(isGitWriteCommand('$env:CI = "true"; git commit -m test'))
  })
  test("matches git commit after cd", () => {
    assert.ok(isGitWriteCommand("cd /tmp; git commit -m test"))
  })
})

describe("isBuiltinAgentName", () => {
  test("recognizes orchestrator", () => {
    assert.ok(isBuiltinAgentName("orchestrator"))
  })
  test("recognizes builder", () => {
    assert.ok(isBuiltinAgentName("builder"))
  })
  test("recognizes reviewer", () => {
    assert.ok(isBuiltinAgentName("reviewer"))
  })
  test("recognizes alias oracle as builtin", () => {
    assert.ok(isBuiltinAgentName("oracle"))
  })
  test("recognizes alias explore as builtin", () => {
    assert.ok(isBuiltinAgentName("explore"))
  })
  test("does NOT recognize coding (category, not builtin agent)", () => {
    assert.ok(!isBuiltinAgentName("coding"))
  })
  test("does NOT recognize deep (category, not builtin agent)", () => {
    assert.ok(!isBuiltinAgentName("deep"))
  })
})
