import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"

import { defaultConfig } from "../config/schema.ts"
import {
  containsJsonParseError,
  createFsyncSkipTracker,
  createPermissionGuards,
  isSimpleFileReadCommand,
  resolveRedirectUrl,
  TODOWRITE_DESCRIPTION,
} from "./index.ts"

function tempProject(): string {
  return mkdtempSync(join(tmpdir(), "ocmm-guards-"))
}

function configWithReadme(): ReturnType<typeof defaultConfig> {
  return { ...defaultConfig(), disabledHooks: [] }
}

test("bash file read detector matches only simple file reads", () => {
  assert.equal(isSimpleFileReadCommand("cat src/index.ts"), true)
  assert.equal(isSimpleFileReadCommand("head -n 20 src/index.ts"), true)
  assert.equal(isSimpleFileReadCommand("tail -20 src/index.ts"), true)
  assert.equal(isSimpleFileReadCommand("cat src/index.ts | rg foo"), false)
  assert.equal(isSimpleFileReadCommand("cat -n src/index.ts"), false)
})

test("write existing file guard requires a prior read in the same session", async () => {
  const root = tempProject()
  try {
    const file = join(root, "existing.txt")
    writeFileSync(file, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    await assert.rejects(
      guards.before({ tool: "write", sessionID: "s1", args: { filePath: file, content: "new" } }, {}),
      /File already exists/,
    )

    await guards.before({ tool: "read", sessionID: "s1", args: { filePath: file } }, {})
    await guards.before({ tool: "write", sessionID: "s1", args: { filePath: file, content: "new" } }, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("write guard resolves relative paths from project root, not process cwd", async () => {
  const root = tempProject()
  const other = tempProject()
  const previousCwd = process.cwd()
  try {
    mkdirSync(join(root, "src"), { recursive: true })
    const file = join(root, "src", "existing.txt")
    writeFileSync(file, "old")
    process.chdir(other)
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })
    await assert.rejects(
      guards.before({ tool: "write", args: { filePath: relative(root, file), content: "new" } }, {}),
      /File already exists/,
    )
  } finally {
    process.chdir(previousCwd)
    rmSync(root, { recursive: true, force: true })
    rmSync(other, { recursive: true, force: true })
  }
})

test("before guards protect notepads, warn on bash reads, truncate question labels, and rewrite redirects", async () => {
  const root = tempProject()
  try {
    const guards = createPermissionGuards({
      getConfig: defaultConfig,
      projectRoot: root,
      redirectResolver: async () => "https://example.com/final",
    })

    await assert.rejects(
      guards.before({ tool: "write", args: { filePath: join(root, ".omo", "notepads", "a.md") } }, {}),
      /Notepad files are protected/,
    )

    const bashOutput: Record<string, unknown> = {}
    await guards.before({ tool: "bash", args: { command: "cat package.json" } }, bashOutput)
    assert.match(String(bashOutput.message), /Prefer the Read tool/)

    const questionOutput: Record<string, unknown> = {}
    await guards.before(
      {
        tool: "ask_user_question",
        args: { questions: [{ options: [{ label: "abcdefghijklmnopqrstuvwxyz123456789" }] }] },
      },
      questionOutput,
    )
    const args = questionOutput.args as { questions: Array<{ options: Array<{ label: string }> }> }
    assert.equal(args.questions[0]!.options[0]!.label.length, 30)
    assert.equal(args.questions[0]!.options[0]!.label.endsWith("..."), true)

    const webfetchOutput: Record<string, unknown> = {}
    await guards.before({ tool: "webfetch", args: { url: "https://example.com/start" } }, webfetchOutput)
    assert.deepEqual(webfetchOutput.args, { url: "https://example.com/final" })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("redirect resolver timeout returns null instead of hanging", async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch
    const started = Date.now()
    assert.equal(await resolveRedirectUrl("https://example.com/slow", 10), null)
    assert.ok(Date.now() - started < 1000)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("after guards add task/json/readme/plan/fsync/truncation notices", async () => {
  const root = tempProject()
  try {
    mkdirSync(join(root, "src"), { recursive: true })
    const file = join(root, "src", "app.ts")
    writeFileSync(file, "export const app = true\n")
    writeFileSync(join(root, "src", "README.md"), "Use local README context.\n")
    const tracker = createFsyncSkipTracker()
    const guards = createPermissionGuards({ getConfig: configWithReadme, projectRoot: root, fsyncTracker: tracker })

    const taskOutput = { output: "" }
    await guards.after({ tool: "task" }, taskOutput)
    assert.match(taskOutput.output, /Task Empty Response Warning/)

    const readOutput = { output: "1: export const app = true", metadata: { filePath: file } }
    await guards.after({ tool: "read", args: { filePath: file } }, readOutput)
    assert.match(readOutput.output, /\[Directory README: /)

    tracker.record({ path: file, reason: "test skip" })
    const fsyncOutput = { output: "Updated" }
    await guards.after({ tool: "write", args: { filePath: file } }, fsyncOutput)
    assert.match(fsyncOutput.output, /\[Fsync Skip Warning\]/)

    const jsonOutput = { output: "Error: Unexpected token } in JSON at position 2" }
    await guards.after({ tool: "custom_tool" }, jsonOutput)
    assert.equal(containsJsonParseError(jsonOutput.output), true)
    assert.match(jsonOutput.output, /JSON PARSE ERROR/)

    const planOutput = { output: "Updated" }
    await guards.after(
      { tool: "write", args: { filePath: join(root, ".omo", "plans", "x.md"), content: "- [ ]\n" } },
      planOutput,
    )
    assert.match(planOutput.output, /Plan Format Warning/)

    const longOutput = { output: "x".repeat(10050) }
    await guards.after({ tool: "webfetch" }, longOutput)
    assert.match(longOutput.output, /Tool Output Truncated/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("definition guard overrides todowrite description and disabledHooks gates guards", async () => {
  const root = tempProject()
  try {
    const disabledConfig = () => ({
      ...defaultConfig(),
      disabledHooks: ["todo-description-override", "bash-file-read-guard"],
    })
    const guards = createPermissionGuards({ getConfig: disabledConfig, projectRoot: root })

    const definitionOutput = { description: "old" }
    await guards.definition({ toolID: "todowrite" }, definitionOutput)
    assert.equal(definitionOutput.description, "old")

    const bashOutput: Record<string, unknown> = {}
    await guards.before({ tool: "bash", args: { command: "cat package.json" } }, bashOutput)
    assert.equal(bashOutput.message, undefined)

    const enabledGuards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })
    await enabledGuards.definition({ toolID: "todowrite" }, definitionOutput)
    assert.equal(definitionOutput.description, TODOWRITE_DESCRIPTION)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("directory readme injector injects only once per session per readme dir", async () => {
  const root = tempProject()
  try {
    mkdirSync(join(root, "src"), { recursive: true })
    const file = join(root, "src", "app.ts")
    writeFileSync(file, "export const app = true\n")
    writeFileSync(join(root, "src", "README.md"), "README content.\n")
    const guards = createPermissionGuards({ getConfig: configWithReadme, projectRoot: root })

    const out1 = { output: "1: export const app = true", metadata: { filePath: file } }
    await guards.after({ tool: "read", sessionID: "s1", args: { filePath: file } }, out1)
    assert.match(out1.output, /\[Directory README: /)

    const out2 = { output: "1: export const app = true", metadata: { filePath: file } }
    await guards.after({ tool: "read", sessionID: "s1", args: { filePath: file } }, out2)
    assert.doesNotMatch(out2.output, /\[Directory README: /)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("directory readme injector injects again for a different session", async () => {
  const root = tempProject()
  try {
    mkdirSync(join(root, "src"), { recursive: true })
    const file = join(root, "src", "app.ts")
    writeFileSync(file, "export const app = true\n")
    writeFileSync(join(root, "src", "README.md"), "README content.\n")
    const guards = createPermissionGuards({ getConfig: configWithReadme, projectRoot: root })

    const out1 = { output: "1: export const app = true", metadata: { filePath: file } }
    await guards.after({ tool: "read", sessionID: "s1", args: { filePath: file } }, out1)
    assert.match(out1.output, /\[Directory README: /)

    const out2 = { output: "1: export const app = true", metadata: { filePath: file } }
    await guards.after({ tool: "read", sessionID: "s2", args: { filePath: file } }, out2)
    assert.match(out2.output, /\[Directory README: /)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("event handler cleans up per-session read permissions on session.deleted", async () => {
  const root = tempProject()
  try {
    const file = join(root, "existing.txt")
    writeFileSync(file, "old")
    const guards = createPermissionGuards({ getConfig: configWithReadme, projectRoot: root })

    await guards.before({ tool: "read", sessionID: "s1", args: { filePath: file } }, {})

    if (guards.event) {
      await guards.event({ type: "session.deleted", properties: { sessionID: "s1" } })
    }

    await assert.rejects(
      guards.before({ tool: "write", sessionID: "s1", args: { filePath: file, content: "new" } }, {}),
      /File already exists/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("event handler cleans up per-session readme cache on session.compacted", async () => {
  const root = tempProject()
  try {
    mkdirSync(join(root, "src"), { recursive: true })
    const file = join(root, "src", "app.ts")
    writeFileSync(file, "export const app = true\n")
    writeFileSync(join(root, "src", "README.md"), "README content.\n")
    const guards = createPermissionGuards({ getConfig: configWithReadme, projectRoot: root })

    const out1 = { output: "1: export const app = true", metadata: { filePath: file } }
    await guards.after({ tool: "read", sessionID: "s1", args: { filePath: file } }, out1)
    assert.match(out1.output, /\[Directory README: /)

    if (guards.event) {
      await guards.event({ type: "session.compacted", properties: { sessionID: "s1" } })
    }

    const out2 = { output: "1: export const app = true", metadata: { filePath: file } }
    await guards.after({ tool: "read", sessionID: "s1", args: { filePath: file } }, out2)
    assert.match(out2.output, /\[Directory README: /)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("event handler ignores unknown event types", async () => {
  const root = tempProject()
  try {
    const file = join(root, "existing.txt")
    writeFileSync(file, "old")
    const guards = createPermissionGuards({ getConfig: configWithReadme, projectRoot: root })

    await guards.before({ tool: "read", sessionID: "s1", args: { filePath: file } }, {})
    if (guards.event) {
      await guards.event({ type: "session.idle", properties: { sessionID: "s1" } })
    }
    await guards.before({ tool: "write", sessionID: "s1", args: { filePath: file, content: "new" } }, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("event handler is optional and not invoked when absent", () => {
  const root = tempProject()
  try {
    const guards = createPermissionGuards({ getConfig: configWithReadme, projectRoot: root })
    assert.equal(typeof guards.event, "function")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("directory readme injector does not inject for files outside project root", async () => {
  const root = tempProject()
  const externalDir = mkdtempSync(join(tmpdir(), "ocmm-external-"))
  try {
    mkdirSync(join(root, "src"), { recursive: true })
    writeFileSync(join(root, "src", "README.md"), "Project README.\n")
    const externalFile = join(externalDir, "external.ts")
    writeFileSync(externalFile, "export const external = true\n")
    writeFileSync(join(externalDir, "README.md"), "External README.\n")

    const guards = createPermissionGuards({ getConfig: configWithReadme, projectRoot: root })
    const out = { output: "1: export const external = true", metadata: { filePath: externalFile } }
    await guards.after({ tool: "read", sessionID: "s1", args: { filePath: externalFile } }, out)
    assert.doesNotMatch(out.output, /\[Directory README: /)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(externalDir, { recursive: true, force: true })
  }
})
