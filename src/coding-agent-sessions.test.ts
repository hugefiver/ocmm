import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import {
  ASIDE_DB_SCRIPT,
  assertSandboxedChildEnv,
  cleanupSandbox,
  jsonMap,
  rows,
  runFinder,
  runFinderFailure,
  runPythonInline,
  sanitizedChildEnv,
  writeJson,
  writeJsonl,
} from "./coding-agent-sessions-test-support.ts"

test("sanitized coding-agent child environments stay inside the sandbox and omit credential-shaped keys", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "ocmm-agent-sessions-env-"))
  try {
    const env = sanitizedChildEnv(sandbox, {
      PATH: process.env.PATH,
      HOME: "C:/real-home-must-not-survive",
      OPENCODE_CONFIG_CONTENT: '{"plugin":["C:/escape/plugin.js"]}',
      OPENCODE_CONFIG_DIR: "C:/escape/opencode-config",
      OPENAI_API_KEY: "synthetic-value",
      GITHUB_TOKEN: "synthetic-value",
      PASSWORD: "synthetic-value",
      AUTH_MODE: "synthetic-value",
      SAFE_FIXTURE_FLAG: "retained",
    })
    assertSandboxedChildEnv(sandbox, env)
    assert.equal(env.OPENCODE_CONFIG_CONTENT, undefined)
    assert.equal(env.OPENCODE_CONFIG_DIR, join(sandbox, "opencode_config_dir"))
    assert.equal(env.OPENAI_API_KEY, undefined)
    assert.equal(env.GITHUB_TOKEN, undefined)
    assert.equal(env.PASSWORD, undefined)
    assert.equal(env.AUTH_MODE, undefined)
    assert.equal(env.SAFE_FIXTURE_FLAG, "retained")
    assert.equal(env.PYTHONUTF8, "1")
  } finally {
    cleanupSandbox(sandbox)
  }
})

test("Aside CLI fixtures cover state.db joining, transcript fallback, and list/find/search/read/get aliases", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "ocmm-agent-sessions-aside-"))
  try {
    const exportRoot = join(sandbox, "aside-export")
    const userRoot = join(exportRoot, ".aside", "u", "0")
    const mainTranscript = join(userRoot, "sessions", "2026-07-29_main1", "messages.jsonl")
    const childTranscript = join(userRoot, "sessions", "2026-07-29_child1", "messages.jsonl")
    writeJsonl(mainTranscript, [
      { role: "user", content: "find the ambassador benefits", timestamp: 1785295598204 },
      { role: "assistant", content: [{ type: "text", text: "fixture response" }], provider: "fixture-provider", model: "fixture-model", timestamp: 1785295598449 },
      { role: "user", content: "summarize the benefits", timestamp: 1785295599000 },
    ])
    writeJsonl(childTranscript, [{ role: "user", content: "verify the settings context", timestamp: 1785295600000 }])
    runPythonInline(sandbox, ASIDE_DB_SCRIPT, [join(userRoot, "state.db"), "main1", "child1"])

    const listed = rows(runFinder(sandbox, exportRoot, "aside", ["list"]))
    assert.deepEqual(listed.map((item) => item.id), ["main1"])
    assert.equal(listed[0]?.platform, "aside")
    assert.equal(listed[0]?.subagent_count, 1)
    assert.equal(listed[0]?.cwd, "C:/fixture/aside")
    assert.equal(listed[0]?.provider, "fixture-provider")
    assert.equal(listed[0]?.model, "fixture-model")
    assert.equal(listed[0]?.path, mainTranscript)
    assert.deepEqual(rows(runFinder(sandbox, exportRoot, "aside", ["list", "--include-subagents"])).map((item) => item.id).sort(), ["child1", "main1"])

    const found = runFinder(sandbox, exportRoot, "aside", ["find", "ambassador"])
    const searched = runFinder(sandbox, exportRoot, "aside", ["search", "ambassador"])
    assert.deepEqual(found, searched)
    assert.equal(rows(found).length, 1)
    assert.equal(rows(rows(found)[0]!, "match_reasons")[0]?.query, "ambassador")
    const repeated = runFinder(sandbox, exportRoot, "aside", ["search", "--query", "ambassador", "--query", "benefits"])
    assert.deepEqual(rows(repeated, "queries").map((item) => item.query).sort(), ["ambassador", "benefits"])

    const read = runFinder(sandbox, exportRoot, "aside", ["read", "main1"])
    const get = runFinder(sandbox, exportRoot, "aside", ["get", "main1"])
    assert.deepEqual(read, get)
    const detail = rows(read)[0]!
    const prompts = jsonMap(detail.prompts)
    assert.equal(prompts.first_user_message, "find the ambassador benefits")
    assert.equal(prompts.last_user_message, "summarize the benefits")
    assert.ok(Array.isArray(detail.events))
    const children = detail.subagents
    assert.ok(Array.isArray(children))
    assert.equal(jsonMap(children[0]).parent_id, "main1")
    assert.equal(jsonMap(children[0]).agent, "Check settings context")

    const fallbackRoot = join(sandbox, "aside-fallback")
    const fallbackTranscript = join(fallbackRoot, ".aside", "u", "0", "sessions", "2026-07-30_solo1", "messages.jsonl")
    writeJsonl(fallbackTranscript, [
      { role: "user", content: "fallback prompt", timestamp: 1785295598204 },
      { role: "assistant", content: [{ type: "text", text: "fixture response" }], provider: "fixture-provider", model: "fixture-model", timestamp: 1785295598449 },
    ])
    const fallback = rows(runFinder(sandbox, fallbackRoot, "aside", ["list"]))
    assert.deepEqual(fallback.map((item) => ({ id: item.id, platform: item.platform, path: item.path, prompt: item.first_user_message })), [{
      id: "solo1",
      platform: "aside",
      path: fallbackTranscript,
      prompt: "fallback prompt",
    }])
    const fallbackDetail = rows(runFinder(sandbox, fallbackRoot, "aside", ["get", "solo1"]))[0]!
    assert.equal(jsonMap(fallbackDetail.prompts).first_user_message, "fallback prompt")
    assert.deepEqual(rows(runFinder(sandbox, join(sandbox, "absent-root"), "aside", ["list"])), [])

    const invalid = runFinderFailure(sandbox, exportRoot, "aside", ["search", "ambassador", "--platform", "aside,claude"])
    assert.match(invalid.stderr, /Use repeated --platform flags/)
  } finally {
    cleanupSandbox(sandbox)
  }
})

test("Claude file fixtures expose safe list/search/find output through explicit roots", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "ocmm-agent-sessions-claude-"))
  try {
    const root = join(sandbox, "claude-export")
    const transcript = join(root, "transcripts", "claude-beta.jsonl")
    writeJsonl(transcript, [
      { sessionId: "claude-beta", type: "user", timestamp: "2026-06-10T00:00:00Z", cwd: "C:/fixture/claude", content: "unrelated fixture prompt" },
      { sessionId: "claude-beta", type: "user", timestamp: "2026-06-10T00:00:03Z", cwd: "C:/fixture/claude", content: "claude review notes" },
    ])
    const listed = rows(runFinder(sandbox, root, "claude", ["list"]))
    assert.equal(listed[0]?.id, "claude-beta")
    assert.equal(listed[0]?.platform, "claude")
    assert.equal(listed[0]?.path, transcript)
    assert.equal(listed[0]?.cwd, "C:/fixture/claude")

    const searched = runFinder(sandbox, root, "claude", ["search", "review notes"])
    const found = runFinder(sandbox, root, "claude", ["find", "review notes"])
    assert.deepEqual(found, searched)
    assert.equal(rows(searched)[0]?.platform, "claude")
    assert.equal(rows(rows(searched)[0]!, "match_reasons")[0]?.query, "review notes")
    const repeated = rows(runFinder(sandbox, root, "claude", ["search", "--query", "review", "--query", "notes"]), "queries")
    assert.deepEqual(repeated.map((item) => item.query).sort(), ["notes", "review"])
    assert.ok(repeated.every((item) => rows(item).length === 1))

    const detail = rows(runFinder(sandbox, root, "claude", ["get", "claude-beta"]))[0]!
    assert.deepEqual(jsonMap(detail.prompts), {
      first_user_message: "unrelated fixture prompt",
      last_user_message: "claude review notes",
    })
  } finally {
    cleanupSandbox(sandbox)
  }
})

test("OpenCode storage fixtures preserve parent-child linkage without invoking opencode", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "ocmm-agent-sessions-opencode-"))
  try {
    const root = join(sandbox, "opencode-export")
    const store = join(root, "storage", "session", "hash1")
    writeJson(join(store, "ses_main.json"), {
      id: "ses_main",
      title: "main fixture",
      directory: "C:/fixture/opencode",
      time: { created: 1000, updated: 2000 },
    })
    writeJson(join(store, "ses_child.json"), {
      id: "ses_child",
      parentID: "ses_main",
      title: "explore docs",
      agent: "explore",
      directory: "C:/fixture/opencode",
      time: { created: 1100, updated: 1900 },
    })
    const listed = rows(runFinder(sandbox, root, "opencode", ["list"]))
    assert.deepEqual(listed.map((item) => item.id), ["ses_main"])
    assert.equal(listed[0]?.cwd, "C:/fixture/opencode")
    assert.equal(listed[0]?.subagent_count, 1)
    assert.deepEqual(rows(runFinder(sandbox, root, "opencode", ["list", "--include-subagents"])).map((item) => item.id).sort(), ["ses_child", "ses_main"])
    const detail = rows(runFinder(sandbox, root, "opencode", ["get", "ses_main"]))[0]!
    const children = detail.subagents
    assert.ok(Array.isArray(children))
    assert.equal(jsonMap(children[0]).id, "ses_child")
    assert.equal(jsonMap(children[0]).parent_id, "ses_main")
    assert.equal(jsonMap(children[0]).agent, "explore")
  } finally {
    cleanupSandbox(sandbox)
  }
})
