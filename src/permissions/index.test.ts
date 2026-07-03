import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
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

/** Create a temp directory with a .git subdirectory containing a minimal HEAD marker. */
function tempValidGitRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-git-repo-"))
  mkdirSync(join(repo, ".git"))
  writeFileSync(join(repo, ".git", "HEAD"), "ref: refs/heads/main\n")
  return repo
}

/** Create a temp bare-git-dir-style directory (not a working tree, just a .git dir). */
function tempBareGitDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ocmm-temp-gitdir-"))
  writeFileSync(join(dir, "HEAD"), "ref: refs/heads/main\n")
  return dir
}

/** Create a valid .git directory inside an existing temp dir (for repos that need markers). */
function makeValidGitDir(repo: string): void {
  writeFileSync(join(repo, ".git", "HEAD"), "ref: refs/heads/main\n")
}

test("bash file read detector matches only simple file reads", () => {
  assert.equal(isSimpleFileReadCommand("cat src/index.ts"), true)
  assert.equal(isSimpleFileReadCommand("head -n 20 src/index.ts"), true)
  assert.equal(isSimpleFileReadCommand("tail -20 src/index.ts"), true)
  assert.equal(isSimpleFileReadCommand("cat src/index.ts | rg foo"), false)
  assert.equal(isSimpleFileReadCommand("cat -n src/index.ts"), false)
})

test("write existing file guard blocks overwrite even after a prior read (two-tier)", async () => {
  const root = tempProject()
  try {
    const file = join(root, "existing.txt")
    writeFileSync(file, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    // Without overwrite: always blocked (baseline), even after read.
    await assert.rejects(
      guards.before({ tool: "write", sessionID: "s1", args: { filePath: file, content: "new" } }, {}),
      /File already exists/,
    )
    await guards.before({ tool: "read", sessionID: "s1", args: { filePath: file } }, {})
    await assert.rejects(
      guards.before({ tool: "write", sessionID: "s1", args: { filePath: file, content: "new" } }, {}),
      /File already exists/,
    )

    // With overwrite=true and hook enabled (default): enhancement tier blocks it.
    await assert.rejects(
      guards.before({ tool: "write", sessionID: "s1", args: { filePath: file, content: "new", overwrite: true } }, {}),
      /write-existing-file-guard hook blocks/,
    )
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

// --- Blocker 1: .git dir/file must be a valid gitdir (not just temp directory) ---

test("subagent .git directory without git markers is blocked even under temp", async () => {
  const project = process.cwd()
  const emptyRepo = mkdtempSync(join(tmpdir(), "ocmm-temp-empty-git-"))
  try {
    mkdirSync(join(emptyRepo, ".git")) // no HEAD, no config/objects, no refs
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput("git commit -m x", "s1", emptyRepo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(emptyRepo, { recursive: true, force: true })
  }
})

test("subagent .git worktree file pointing to temp dir without markers is blocked", async () => {
  const project = tempProject()
  const gitdir = mkdtempSync(join(tmpdir(), "ocmm-temp-gitdir-no-markers-"))
  const worktree = mkdtempSync(join(tmpdir(), "ocmm-temp-wt-no-markers-"))
  try {
    // gitdir exists from mkdtempSync but has no git markers
    writeFileSync(join(worktree, ".git"), `gitdir: ${gitdir}\n`)
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput("git commit -m x", "s1", worktree), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(gitdir, { recursive: true, force: true })
    rmSync(worktree, { recursive: true, force: true })
  }
})

// --- Blocker 2: Empty explicit overrides set permanent tempDenied ---

test("subagent empty --work-tree blocks even with valid git-dir", async () => {
  const project = process.cwd()
  const gitdir = tempBareGitDir()
  const worktree = mkdtempSync(join(tmpdir(), "ocmm-temp-wt-empty-"))
  try {
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(
        `git --git-dir "${gitdir}" --work-tree "" commit -m x`, "s1", project,
      ), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(gitdir, { recursive: true, force: true })
    rmSync(worktree, { recursive: true, force: true })
  }
})

test("subagent empty -C blocks even with valid git-dir and work-tree", async () => {
  const project = process.cwd()
  const repo = tempValidGitRepo()
  try {
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(
        `git -C "" --git-dir "${join(repo, ".git")}" --work-tree "${repo}" commit -m x`, "s1", project,
      ), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent empty core.worktree= blocks even with valid git-dir and work-tree", async () => {
  const project = process.cwd()
  const repo = tempValidGitRepo()
  try {
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(
        `git -c core.worktree= --git-dir "${join(repo, ".git")}" --work-tree "${repo}" commit -m x`, "s1", project,
      ), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

// --- Blocker 3: Empty env work-tree override bypass ---

test("subagent empty env work-tree blocks even with explicit valid temp overrides", async () => {
  const project = process.cwd()
  const repo = tempValidGitRepo()
  try {
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(
        `$env:GIT_WORK_TREE=""; git --git-dir "${join(repo, ".git")}" --work-tree "${repo}" commit -m x`, "s1", project,
      ), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

// Blocker 1: cmd wrapper must not swallow outer command segments

test("cmd quoted wrapper with later project write is blocked", async () => {
  const project = tempProject()
  const tempRepo = tempValidGitRepo()
  try {
    mkdirSync(join(project, ".git"))
    const cmd = `cmd /c "git --git-dir ${join(tempRepo, ".git")} --work-tree ${tempRepo} commit -m x" & git -C "${project}" commit -m x`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", project), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(tempRepo, { recursive: true, force: true })
  }
})

test("cmd quoted wrapper no-write with later valid temp write is allowed", async () => {
  const project = process.cwd()
  const tempRepo = tempValidGitRepo()
  try {
    const cmd = `cmd /c "echo hi" & git --git-dir "${join(tempRepo, ".git")}" --work-tree "${tempRepo}" commit -m x`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await guards.before(gitGuardInput(cmd, "s1", project), {})
  } finally {
    rmSync(tempRepo, { recursive: true, force: true })
  }
})

// Blocker 2: explicit --git-dir must be a valid gitdir, not just a temp directory

test("explicit git-dir pointing to temp dir without git markers is blocked", async () => {
  const project = process.cwd()
  const tempDir = mkdtempSync(join(tmpdir(), "ocmm-temp-not-gitdir-"))
  try {
    // Create a directory that exists but has no git markers
    const fakeGitDir = join(tempDir, "fake.git")
    mkdirSync(fakeGitDir)
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(
        gitGuardInput(`git --git-dir "${fakeGitDir}" --work-tree "${tempDir}" commit -m x`, "s1", project),
        {},
      ),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
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
    const file = join(root, "newfile.txt")
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

function gitGuardInput(command: string, sessionID = "s1", workdir?: string): Record<string, unknown> {
  return {
    tool: "bash",
    sessionID,
    args: {
      command,
      ...(workdir !== undefined ? { workdir } : {}),
    },
  }
}

function subagentSessionMap(sessionID = "s1", agent = "coding"): Map<string, string> {
  return new Map([[sessionID, agent]])
}

test("subagent git writes are allowed inside temp git repositories", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-git-repo-"))
  try {
    mkdirSync(join(repo, ".git"))
    writeFileSync(join(repo, ".git", "HEAD"), "ref: refs/heads/main\n")
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await guards.before(gitGuardInput("git commit -m x", "s1", repo), {})
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent git writes remain blocked for the project repo even when project is under temp", async () => {
  const project = tempProject()
  try {
    mkdirSync(join(project, ".git"))
    writeFileSync(join(project, ".git", "HEAD"), "ref: refs/heads/main\n")
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput("git commit -m x", "s1", project), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

test("subagent git write blocked when temp repo is ancestor containing projectRoot", async () => {
  const project = tempProject()
  const projectCanonical = join(project, "project")
  try {
    mkdirSync(projectCanonical, { recursive: true })
    mkdirSync(join(project, ".git"))
    writeFileSync(join(project, ".git", "HEAD"), "ref: refs/heads/main\n")
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: projectCanonical,
      sessionAgentMap: subagentSessionMap(),
    })

    // workdir = ancestor temp repo
    await assert.rejects(
      () => guards.before(gitGuardInput("git commit -m x", "s1", project), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

test("subagent git -C to ancestor temp repo containing projectRoot is blocked", async () => {
  const project = tempProject()
  const projectCanonical = join(project, "project")
  try {
    mkdirSync(projectCanonical, { recursive: true })
    mkdirSync(join(project, ".git"))
    writeFileSync(join(project, ".git", "HEAD"), "ref: refs/heads/main\n")
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: projectCanonical,
      sessionAgentMap: subagentSessionMap(),
    })

    // git -C <ancestorRepo> from projectRoot
    await assert.rejects(
      () => guards.before(gitGuardInput(`git -C "${project}" commit -m x`, "s1", projectCanonical), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

test("subagent git -C writes are allowed when target repo is under temp", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-git-c-"))
  try {
    mkdirSync(join(repo, ".git"))
    writeFileSync(join(repo, ".git", "HEAD"), "ref: refs/heads/main\n")
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await guards.before(gitGuardInput(`git -C "${repo}" commit -m x`, "s1", project), {})
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent git writes still require a temp git repository marker", async () => {
  const project = tempProject()
  const notRepo = mkdtempSync(join(tmpdir(), "ocmm-temp-not-repo-"))
  try {
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput("git commit -m x", "s1", notRepo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(notRepo, { recursive: true, force: true })
  }
})

test("subagent git -C writes remain blocked when target repo is outside temp", async () => {
  const project = process.cwd()
  const tempRepo = mkdtempSync(join(tmpdir(), "ocmm-temp-git-block-"))
  try {
    mkdirSync(join(tempRepo, ".git"))
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(`git -C "${project}" commit -m x`, "s1", tempRepo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(tempRepo, { recursive: true, force: true })
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

test("subagent git write blocked when .git is a worktree file pointing outside temp", async () => {
  const project = tempProject()
  const worktree = mkdtempSync(join(tmpdir(), "ocmm-worktree-"))
  try {
    // .git file pointing to the project's .git directory (outside temp via -C canonical)
    // Use the project's temp dir — since project is under tmpdir(), we need an
    // outside-temp reference. Use process.cwd()/.git which is a real git dir.
    const projectGitDir = join(process.cwd(), ".git")
    writeFileSync(join(worktree, ".git"), `gitdir: ${projectGitDir}\n`)
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput("git commit -m x", "s1", worktree), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(worktree, { recursive: true, force: true })
  }
})

test("subagent git write blocked when .git worktree file has gitdir below first line", async () => {
  const project = tempProject()
  const worktree = mkdtempSync(join(tmpdir(), "ocmm-worktree-bogus-"))
  const tempGitDir = mkdtempSync(join(tmpdir(), "ocmm-temp-gitdir-bogus-"))
  try {
    mkdirSync(join(tempGitDir, ".git"))
    writeFileSync(join(worktree, ".git"), `bogus\ngitdir: ${tempGitDir}/.git\n`)
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput("git commit -m x", "s1", worktree), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(worktree, { recursive: true, force: true })
    rmSync(tempGitDir, { recursive: true, force: true })
  }
})

test("subagent git write blocked when .git worktree file points to missing temp gitdir", async () => {
  const project = tempProject()
  const worktree = mkdtempSync(join(tmpdir(), "ocmm-worktree-missing-"))
  try {
    writeFileSync(join(worktree, ".git"), `gitdir: ${join(tmpdir(), "ocmm-missing-gitdir", ".git")}\n`)
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput("git commit -m x", "s1", worktree), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(worktree, { recursive: true, force: true })
  }
})

test("subagent git write blocked when PowerShell env override points outside temp", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-env-"))
  try {
    mkdirSync(join(repo, ".git"))
    const projectGitDir = join(process.cwd(), ".git")
    const projectRoot = process.cwd()
    const cmd = `$env:GIT_DIR="${projectGitDir}"; $env:GIT_WORK_TREE="${projectRoot}"; git commit -m x`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent git write blocked when spaced PowerShell env override points outside temp", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-env-spaced-"))
  try {
    mkdirSync(join(repo, ".git"))
    const projectGitDir = join(process.cwd(), ".git")
    const cmd = `$env:GIT_DIR = "${projectGitDir}"; git commit -m x`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent git write blocked when env override before wrapper points outside temp", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-env-wrapper-"))
  try {
    mkdirSync(join(repo, ".git"))
    const projectGitDir = join(process.cwd(), ".git")
    const cmd = `$env:GIT_DIR="${projectGitDir}"; pwsh -c "git commit -m x"`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent explicit temp git-dir and work-tree write is allowed from project root", async () => {
  const project = process.cwd()
  const repo = tempValidGitRepo()
  try {
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await guards.before(
      gitGuardInput(`git --git-dir "${join(repo, ".git")}" --work-tree "${repo}" commit -m x`, "s1", project),
      {},
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent explicit temp git-dir and work-tree write requires existing gitdir", async () => {
  const project = process.cwd()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-explicit-missing-"))
  try {
    const missingGitDir = join(repo, ".git")
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(`git --git-dir "${missingGitDir}" --work-tree "${repo}" commit -m x`, "s1", project), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent outside-temp env override stays blocked after temp reassignment", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-env-taint-"))
  try {
    mkdirSync(join(repo, ".git"))
    const projectGitDir = join(process.cwd(), ".git")
    const cmd = `$env:GIT_DIR="${projectGitDir}"; $env:GIT_DIR="${join(repo, ".git")}"; git --work-tree "${repo}" commit -m x`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent git -c core.worktree outside temp is blocked", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-core-worktree-"))
  try {
    mkdirSync(join(repo, ".git"))
    const outside = process.cwd()
    const cmd = `git -C "${repo}" -c core.worktree="${outside}" reset --hard HEAD`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent cmd set git env override outside temp is blocked", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-cmd-env-"))
  try {
    mkdirSync(join(repo, ".git"))
    const outside = process.cwd()
    const cmd = `cmd /c set GIT_DIR=${join(outside, ".git")} & set GIT_WORK_TREE=${outside} & git commit -m x`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent bare set git env spoof is ignored outside cmd wrapper", async () => {
  const gitdir = tempBareGitDir()
  try {
    const cmd = `set GIT_DIR=${gitdir}; git tag v1.0`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: process.cwd(),
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", process.cwd()), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(gitdir, { recursive: true, force: true })
  }
})

test("subagent echoed PowerShell git env spoof is ignored", async () => {
  const repo = tempValidGitRepo()
  try {
    const cmd = `echo '$env:GIT_DIR=${join(repo, ".git")}'; git --work-tree "${repo}" commit -m x`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: process.cwd(),
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", process.cwd()), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent quoted PowerShell git env string spoof is ignored", async () => {
  const repo = tempValidGitRepo()
  try {
    const cmd = `'$env:GIT_DIR=${join(repo, ".git")}'; git --work-tree "${repo}" commit -m x`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: process.cwd(),
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", process.cwd()), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent git write blocked when explicit work-tree targets temp project repo", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-explicit-project-worktree-"))
  try {
    mkdirSync(join(project, ".git"))
    mkdirSync(join(repo, ".git"))
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(`git -C "${repo}" --work-tree "${project}" commit -m x`, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent git write blocked when explicit git-dir targets temp project repo", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-explicit-project-gitdir-"))
  try {
    mkdirSync(join(project, ".git"))
    mkdirSync(join(repo, ".git"))
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(`git -C "${repo}" --git-dir "${join(project, ".git")}" commit -m x`, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent git write blocked when explicit temp work-tree is missing", async () => {
  const project = process.cwd()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-explicit-missing-worktree-"))
  try {
    mkdirSync(join(repo, ".git"))
    const missingWorkTree = join(tmpdir(), "ocmm-missing-worktree")
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(`git -C "${repo}" --work-tree "${missingWorkTree}" commit -m x`, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent cmd set git env override stays blocked after explicit temp git options", async () => {
  const project = tempProject()
  const repo = tempValidGitRepo()
  try {
    const outside = process.cwd()
    const cmd = `cmd /c set GIT_DIR=${join(outside, ".git")} & git --git-dir "${join(repo, ".git")}" --work-tree "${repo}" commit -m x`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent git write allowed when .git is a worktree file pointing to temp gitdir", async () => {
  const project = tempProject()
  const gitdir = mkdtempSync(join(tmpdir(), "ocmm-temp-gitdir-"))
  const worktree = mkdtempSync(join(tmpdir(), "ocmm-temp-wt-"))
  try {
    mkdirSync(join(gitdir, ".git"))
    writeFileSync(join(gitdir, ".git", "HEAD"), "ref: refs/heads/main\n")
    writeFileSync(join(worktree, ".git"), `gitdir: ${gitdir}/.git\n`)
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await guards.before(gitGuardInput("git commit -m x", "s1", worktree), {})
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(gitdir, { recursive: true, force: true })
    rmSync(worktree, { recursive: true, force: true })
  }
})

test("subagent git write blocked when temp worktree gitdir points to temp project repo", async () => {
  const project = tempProject()
  const worktree = mkdtempSync(join(tmpdir(), "ocmm-temp-project-linked-wt-"))
  try {
    mkdirSync(join(project, ".git"))
    writeFileSync(join(worktree, ".git"), `gitdir: ${join(project, ".git")}\n`)
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput("git commit -m x", "s1", worktree), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(worktree, { recursive: true, force: true })
  }
})

test("subagent env project gitdir blocks even when CLI points back to temp", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-env-project-taint-"))
  try {
    mkdirSync(join(project, ".git"))
    mkdirSync(join(repo, ".git"))
    const cmd = `$env:GIT_DIR="${join(project, ".git")}"; git --git-dir "${join(repo, ".git")}" --work-tree "${repo}" commit -m x`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent missing env gitdir blocks even when CLI points back to temp", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-env-missing-taint-"))
  try {
    mkdirSync(join(repo, ".git"))
    const missingGitDir = join(tmpdir(), "ocmm-missing-env-gitdir", ".git")
    const cmd = `$env:GIT_DIR="${missingGitDir}"; git --git-dir "${join(repo, ".git")}" --work-tree "${repo}" commit -m x`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent duplicate explicit git-dir blocks when earlier one is missing", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-duplicate-gitdir-"))
  try {
    mkdirSync(join(repo, ".git"))
    const missingGitDir = join(tmpdir(), "ocmm-missing-explicit-gitdir", ".git")
    const cmd = `git --git-dir "${missingGitDir}" --git-dir "${join(repo, ".git")}" --work-tree "${repo}" commit -m x`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent cmd quoted payload temp git write is allowed", async () => {
  const project = process.cwd()
  const repo = tempValidGitRepo()
  try {
    const cmd = `cmd /c "git --git-dir ${join(repo, ".git")} --work-tree ${repo} commit -m x"`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await guards.before(gitGuardInput(cmd, "s1", project), {})
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent git write blocked when PowerShell env assignment has space before =", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-env-space-before-eq-"))
  try {
    mkdirSync(join(repo, ".git"))
    const projectGitDir = join(process.cwd(), ".git")
    const projectRoot = process.cwd()
    const cmd = `$env:GIT_DIR ="${projectGitDir}"; $env:GIT_WORK_TREE ="${projectRoot}"; git commit -m x`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent git write blocked when PowerShell env assignment has space after =", async () => {
  const project = tempProject()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-env-space-after-eq-"))
  try {
    mkdirSync(join(repo, ".git"))
    const projectGitDir = join(process.cwd(), ".git")
    const cmd = `$env:GIT_DIR= "${projectGitDir}"; git commit -m x`
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(cmd, "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent git write blocked when -C points to project root despite valid explicit temp options", async () => {
  const project = process.cwd()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-c-project-"))
  try {
    mkdirSync(join(repo, ".git"))
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(
        `git -C "${project}" --git-dir "${join(repo, ".git")}" --work-tree "${repo}" commit -m x`,
        "s1", project,
      ), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent git write blocked when -C points to missing directory despite valid explicit temp options", async () => {
  const project = process.cwd()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-c-missing-"))
  try {
    mkdirSync(join(repo, ".git"))
    const missingPath = join(tmpdir(), "ocmm-missing-c-dir")
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(
        `git -C "${missingPath}" --git-dir "${join(repo, ".git")}" --work-tree "${repo}" commit -m x`,
        "s1", project,
      ), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

// --- Blocker 4: Ancestor repo root containing projectRoot ---

/** Create a temp ancestor directory with a .git marker whose parent contains projectRoot. */
function tempAncestorGitRepo(projectChildName: string): { ancestor: string; project: string } {
  const ancestor = mkdtempSync(join(tmpdir(), "ocmm-ancestor-"))
  mkdirSync(join(ancestor, ".git"))
  writeFileSync(join(ancestor, ".git", "HEAD"), "ref: refs/heads/main\n")
  const project = join(ancestor, projectChildName)
  mkdirSync(project, { recursive: true })
  return { ancestor, project }
}

test("subagent explicit --git-dir to ancestor .git containing projectRoot is blocked", async () => {
  const { ancestor, project } = tempAncestorGitRepo("project")
  const wt = mkdtempSync(join(tmpdir(), "ocmm-temp-wt-"))
  try {
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(
        `git --git-dir "${join(ancestor, ".git")}" --work-tree "${wt}" commit -m x`, "s1", project,
      ), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(ancestor, { recursive: true, force: true })
    rmSync(wt, { recursive: true, force: true })
  }
})

test("subagent env GIT_DIR to ancestor .git containing projectRoot is blocked and tainted", async () => {
  const { ancestor, project } = tempAncestorGitRepo("project")
  const wt = mkdtempSync(join(tmpdir(), "ocmm-temp-wt-"))
  try {
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(
        `$env:GIT_DIR="${join(ancestor, ".git")}"; git --work-tree "${wt}" commit -m x`, "s1", project,
      ), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(ancestor, { recursive: true, force: true })
    rmSync(wt, { recursive: true, force: true })
  }
})

test("subagent worktree .git file gitdir pointing to ancestor .git containing projectRoot is blocked", async () => {
  const { ancestor, project } = tempAncestorGitRepo("project")
  const worktree = mkdtempSync(join(tmpdir(), "ocmm-temp-wt-linked-"))
  try {
    writeFileSync(join(worktree, ".git"), `gitdir: ${join(ancestor, ".git")}\n`)
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput("git commit -m x", "s1", worktree), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(ancestor, { recursive: true, force: true })
    rmSync(worktree, { recursive: true, force: true })
  }
})

test("subagent explicit temp --git-dir <tempRepo>/.git --work-tree <tempRepo> from non-temp project root is allowed when disjoint", async () => {
  const project = process.cwd()
  const repo = tempValidGitRepo()
  try {
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await guards.before(
      gitGuardInput(`git --git-dir "${join(repo, ".git")}" --work-tree "${repo}" commit -m x`, "s1", project),
      {},
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent worktree admin gitdir under ancestor .git containing projectRoot is blocked", async () => {
  const { ancestor, project } = tempAncestorGitRepo("project")
  const linked = mkdtempSync(join(tmpdir(), "ocmm-linked-worktree-admin-"))
  try {
    mkdirSync(join(ancestor, ".git", "worktrees", "wt1"), { recursive: true })
    writeFileSync(join(ancestor, ".git", "worktrees", "wt1", "HEAD"), "ref: refs/heads/main\n")
    writeFileSync(join(linked, ".git"), `gitdir: ${join(ancestor, ".git", "worktrees", "wt1")}\n`)
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput("git commit -m x", "s1", linked), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(ancestor, { recursive: true, force: true })
    rmSync(linked, { recursive: true, force: true })
  }
})

test("subagent explicit worktree admin gitdir under ancestor .git containing projectRoot is blocked", async () => {
  const { ancestor, project } = tempAncestorGitRepo("project")
  const wt = mkdtempSync(join(tmpdir(), "ocmm-admin-wt-"))
  try {
    mkdirSync(join(ancestor, ".git", "worktrees", "wt1"), { recursive: true })
    writeFileSync(join(ancestor, ".git", "worktrees", "wt1", "HEAD"), "ref: refs/heads/main\n")
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(
        `git --git-dir "${join(ancestor, ".git", "worktrees", "wt1")}" --work-tree "${wt}" commit -m x`, "s1", project,
      ), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(ancestor, { recursive: true, force: true })
    rmSync(wt, { recursive: true, force: true })
  }
})

test("subagent env worktree admin gitdir under ancestor .git containing projectRoot is blocked", async () => {
  const { ancestor, project } = tempAncestorGitRepo("project")
  const wt = mkdtempSync(join(tmpdir(), "ocmm-admin-env-wt-"))
  try {
    mkdirSync(join(ancestor, ".git", "worktrees", "wt1"), { recursive: true })
    writeFileSync(join(ancestor, ".git", "worktrees", "wt1", "HEAD"), "ref: refs/heads/main\n")
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput(
        `$env:GIT_DIR="${join(ancestor, ".git", "worktrees", "wt1")}"; git --work-tree "${wt}" commit -m x`, "s1", project,
      ), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(ancestor, { recursive: true, force: true })
    rmSync(wt, { recursive: true, force: true })
  }
})

test("subagent .git HEAD directory is not treated as a valid git marker", async () => {
  const project = process.cwd()
  const repo = mkdtempSync(join(tmpdir(), "ocmm-temp-head-dir-"))
  try {
    mkdirSync(join(repo, ".git", "HEAD"), { recursive: true })
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await assert.rejects(
      () => guards.before(gitGuardInput("git commit -m x", "s1", repo), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent wrapper-local temp env does not leak to later project git write", async () => {
  const project = tempProject()
  const repo = tempValidGitRepo()
  try {
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })
    const command = `pwsh -c '$env:GIT_DIR="${join(repo, ".git")}"; $env:GIT_WORK_TREE="${repo}"; git status'; git commit -m x`

    await assert.rejects(
      () => guards.before(gitGuardInput(command, "s1", project), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent read-only git segment with invalid -C taints later temp write", async () => {
  const project = tempProject()
  const repo = tempValidGitRepo()
  try {
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })
    const command = `git -C "${project}" status; git --git-dir "${join(repo, ".git")}" --work-tree "${repo}" commit -m x`

    await assert.rejects(
      () => guards.before(gitGuardInput(command, "s1", project), {}),
      /subagent sessions are not allowed/,
    )
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})

test("subagent explicit bare temp gitdir write is allowed", async () => {
  const project = process.cwd()
  const gitdir = tempBareGitDir()
  try {
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await guards.before(gitGuardInput(`git --git-dir "${gitdir}" tag v1.0`, "s1", project), {})
  } finally {
    rmSync(gitdir, { recursive: true, force: true })
  }
})

test("subagent bare temp gitdir workdir write is allowed", async () => {
  const project = process.cwd()
  const gitdir = tempBareGitDir()
  try {
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: project,
      sessionAgentMap: subagentSessionMap(),
    })

    await guards.before(gitGuardInput("git tag v1.0", "s1", gitdir), {})
  } finally {
    rmSync(gitdir, { recursive: true, force: true })
  }
})

test("edit/multiedit guard requires a prior read in the same session", async () => {
  const root = tempProject()
  try {
    const file = join(root, "existing.txt")
    writeFileSync(file, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    // edit without prior read -> throws
    await assert.rejects(
      guards.before({ tool: "edit", sessionID: "s1", args: { filePath: file, content: "new" } }, {}),
      /was not read in this session/,
    )

    // read then edit -> passes
    await guards.before({ tool: "read", sessionID: "s1", args: { filePath: file } }, {})
    await guards.before({ tool: "edit", sessionID: "s1", args: { filePath: file, content: "new" } }, {})

    // second edit (token persistent, not consumed) -> passes
    await guards.before({ tool: "edit", sessionID: "s1", args: { filePath: file, content: "newer" } }, {})

    // different session, no read -> throws
    await assert.rejects(
      guards.before({ tool: "edit", sessionID: "s2", args: { filePath: file, content: "new" } }, {}),
      /was not read in this session/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("edit/multiedit guard allows new files, .omo, and outside-project targets", async () => {
  const root = tempProject()
  try {
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    // new (non-existent) file -> passes
    await guards.before({ tool: "edit", sessionID: "s1", args: { filePath: join(root, "newfile.txt"), content: "x" } }, {})

    // .omo special dir -> passes
    mkdirSync(join(root, ".omo"), { recursive: true })
    const omoFile = join(root, ".omo", "data.txt")
    writeFileSync(omoFile, "old")
    await guards.before({ tool: "edit", sessionID: "s1", args: { filePath: omoFile, content: "x" } }, {})

    // outside projectRoot -> passes
    const outside = tempProject()
    try {
      writeFileSync(join(outside, "ext.txt"), "old")
      await guards.before({ tool: "edit", sessionID: "s1", args: { filePath: join(outside, "ext.txt"), content: "x" } }, {})
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("edit/multiedit guard is disabled when write-existing-file-guard hook is disabled", async () => {
  const root = tempProject()
  try {
    const file = join(root, "existing.txt")
    writeFileSync(file, "old")
    const config = { ...defaultConfig(), disabledHooks: ["write-existing-file-guard"] }
    const guards = createPermissionGuards({ getConfig: () => config, projectRoot: root })

    // no prior read, hook disabled -> passes
    await guards.before({ tool: "edit", sessionID: "s1", args: { filePath: file, content: "x" } }, {})
    await guards.before({ tool: "multiedit", sessionID: "s1", args: { filePath: file, edits: [] } }, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard blocks redirects to existing project files", async () => {
  const root = tempProject()
  try {
    const existing = join(root, "existing.txt")
    writeFileSync(existing, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    const cases: Array<{ cmd: string; pattern?: RegExp }> = [
      { cmd: `echo x > ${existing}`, pattern: /writes to an existing project file/ },
      { cmd: `echo x >> ${existing}`, pattern: /writes to an existing project file/ },
      { cmd: `echo x 2> ${existing}`, pattern: /writes to an existing project file/ },
      { cmd: `echo x &> ${existing}`, pattern: /writes to an existing project file/ },
      { cmd: `echo x 1>> ${existing}`, pattern: /writes to an existing project file/ },
    ]
    for (const { cmd, pattern } of cases) {
      await assert.rejects(
        guards.before({ tool: "bash", sessionID: "s1", args: { command: cmd } }, {}),
        pattern ?? /writes to an existing project file/,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard allows redirects to new files, /dev/null, and outside-project targets", async () => {
  const root = tempProject()
  try {
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    const cases = [
      `echo x > ${join(root, "newfile.txt")}`,
      `echo x > /dev/null`,
      `echo x >> /dev/null`,
      `echo x 2> /dev/null`,
    ]
    // outside-project existing file
    const outside = tempProject()
    try {
      writeFileSync(join(outside, "ext.txt"), "old")
      cases.push(`echo x > ${join(outside, "ext.txt")}`)
      for (const cmd of cases) {
        await guards.before({ tool: "bash", sessionID: "s1", args: { command: cmd } }, {})
      }
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard blocks tee/dd/install/truncate on existing project files", async () => {
  const root = tempProject()
  try {
    const existing = join(root, "existing.txt")
    writeFileSync(existing, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    const cases = [
      `tee ${existing} <<< "x"`,
      `tee -a ${existing} <<< "x"`,
      `dd of=${existing} bs=1`,
      `install -m 644 /dev/null ${existing}`,
      `truncate -s 0 ${existing}`,
    ]
    for (const cmd of cases) {
      await assert.rejects(
        guards.before({ tool: "bash", sessionID: "s1", args: { command: cmd } }, {}),
        /writes to an existing project file/,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard blocks sed -i / perl -i / ruby -i in-place edits on existing files", async () => {
  const root = tempProject()
  try {
    const existing = join(root, "existing.txt")
    writeFileSync(existing, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    const cases = [
      `sed -i 's/a/b/g' ${existing}`,
      `sed -i.bak 's/a/b/g' ${existing}`,
      `perl -i -pe 's/a/b/g' ${existing}`,
      `ruby -i -pe 'sub(/a/, "b")' ${existing}`,
    ]
    for (const cmd of cases) {
      await assert.rejects(
        guards.before({ tool: "bash", sessionID: "s1", args: { command: cmd } }, {}),
        /writes to an existing project file/,
      )
    }

    // sed without -i (writes to stdout) -> passes
    await guards.before({ tool: "bash", sessionID: "s1", args: { command: `sed 's/a/b/g' ${existing}` } }, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard blocks cp/mv overwriting existing project files", async () => {
  const root = tempProject()
  try {
    const src = join(root, "src.txt")
    const dest = join(root, "dest.txt")
    writeFileSync(src, "src")
    writeFileSync(dest, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    await assert.rejects(
      guards.before({ tool: "bash", sessionID: "s1", args: { command: `cp ${src} ${dest}` } }, {}),
      /writes to an existing project file/,
    )
    await assert.rejects(
      guards.before({ tool: "bash", sessionID: "s1", args: { command: `mv ${src} ${dest}` } }, {}),
      /writes to an existing project file/,
    )

    // cp to a new dest (does not exist) -> passes
    await guards.before({ tool: "bash", sessionID: "s1", args: { command: `cp ${src} ${join(root, "newdest.txt")}` } }, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard is disabled when hook is disabled and ignores non-bash tools", async () => {
  const root = tempProject()
  try {
    const existing = join(root, "existing.txt")
    writeFileSync(existing, "old")
    const config = { ...defaultConfig(), disabledHooks: ["bash-file-write-guard"] }
    const guards = createPermissionGuards({ getConfig: () => config, projectRoot: root })

    // hook disabled -> all shell writes pass
    await guards.before({ tool: "bash", sessionID: "s1", args: { command: `echo x > ${existing}` } }, {})
    await guards.before({ tool: "bash", sessionID: "s1", args: { command: `tee ${existing} <<< x` } }, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard blocks write commands across pipelines and sequences", async () => {
  const root = tempProject()
  try {
    const existing = join(root, "existing.txt")
    writeFileSync(existing, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    // Each bypass pattern that targets existing.txt in a non-first segment must be blocked.
    const cases = [
      `echo new | tee ${existing}`,
      `echo new | dd of=${existing}`,
      `echo x | sed -i 's/a/b/' ${existing}`,
      `true; tee ${existing} <<< x`,
      `true && echo y > ${existing}`,
      `false || cp src.txt ${existing}`,
    ]
    for (const cmd of cases) {
      await assert.rejects(
        guards.before({ tool: "bash", sessionID: "s1", args: { command: cmd } }, {}),
        /writes to an existing project file/,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard blocks combined short flags with -i (sed -Ei, perl -pi, perl -pie)", async () => {
  const root = tempProject()
  try {
    const existing = join(root, "existing.txt")
    writeFileSync(existing, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    const cases = [
      `sed -Ei 's/a/b/g' ${existing}`,
      `sed -ni 's/a/b/gp' ${existing}`,
      `perl -pi 's/a/b/g' ${existing}`,
      `perl -pie 's/a/b/g' ${existing}`,
      `ruby -pi -e 'sub(/a/, "b")' ${existing}`,
    ]
    for (const cmd of cases) {
      await assert.rejects(
        guards.before({ tool: "bash", sessionID: "s1", args: { command: cmd } }, {}),
        /writes to an existing project file/,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard blocks sh -c / bash -c with quoted redirect to existing file", async () => {
  const root = tempProject()
  try {
    const existing = join(root, "existing.txt")
    writeFileSync(existing, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    // Subshell with a quoted script body that redirects to an existing file.
    await assert.rejects(
      guards.before({ tool: "bash", sessionID: "s1", args: { command: `sh -c "echo x > ${existing}"` } }, {}),
      /writes to an existing project file/,
    )
    await assert.rejects(
      guards.before({ tool: "bash", sessionID: "s1", args: { command: `bash -c 'echo x > ${existing}'` } }, {}),
      /writes to an existing project file/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard allows install -t DIR and cp -t DIR (directory target, not file overwrite)", async () => {
  const root = tempProject()
  try {
    const src = join(root, "src.txt")
    const subdir = join(root, "subdir")
    writeFileSync(src, "src")
    mkdirSync(subdir, { recursive: true })
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    // install -t DIR and --target-directory=DIR copy into a directory, not over a file.
    await guards.before({ tool: "bash", sessionID: "s1", args: { command: `install -t ${subdir} ${src}` } }, {})
    await guards.before({ tool: "bash", sessionID: "s1", args: { command: `install --target-directory=${subdir} ${src}` } }, {})
    // cp -t DIR likewise.
    await guards.before({ tool: "bash", sessionID: "s1", args: { command: `cp -t ${subdir} ${src}` } }, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard blocks subshell with pipe/semicolon inside quoted script body", async () => {
  const root = tempProject()
  try {
    const existing = join(root, "existing.txt")
    writeFileSync(existing, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    // The script body contains a separator (| or ;) before the write command.
    // Regression: splitCommandSegments on the OUTER token stream used to chop
    // the quoted script body at internal separators, so the subshell detector
    // never saw the full script. Now subshell -c is scanned before splitting.
    const cases = [
      `sh -c "echo x | tee ${existing}"`,
      `sh -c "echo x; echo y > ${existing}"`,
      `bash -c 'echo x | tee ${existing}'`,
      `sh -c "echo a | grep b | tee ${existing}"`,
      `bash -c 'echo x; tee ${existing} <<< y'`,
    ]
    for (const command of cases) {
      await assert.rejects(
        () => guards.before({ tool: "bash", sessionID: "s1", args: { command } }, {}),
        /bash-file-write-guard|File already exists/,
        `expected block for: ${command}`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard blocks redirects with trailing punctuation (grouped/sequenced)", async () => {
  const root = tempProject()
  try {
    const existing = join(root, "existing.txt")
    const newfile = join(root, "new.txt")
    writeFileSync(existing, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    // Redirect target must not fuse with trailing shell operators/punctuation.
    // Regression: \S+ captured `file;` / `file)` / `file; }` as the target,
    // and isExistingProjectFile rejected the fused name → bypass.
    const blockCases = [
      `echo x > ${existing};`,
      `echo x > ${existing}; echo done`,
      `(echo x > ${existing})`,
      `{ echo x > ${existing}; }`,
      // C6: trailing-quote fusion. `eval "echo x > file"` exposes `> file"`
      // to the flat scan; \S+ captured `file"` → stat failed → bypass.
      // The unquoted target char class now excludes `"` and `'`.
      `eval "echo x > ${existing}"`,
      `eval 'echo x > ${existing}'`,
      // C7: backtick fusion. `echo `echo x > file`` fuses `file` with the
      // closing backtick. The char class now also excludes backtick.
      `echo \`\echo x > ${existing}\``,
    ]
    for (const command of blockCases) {
      await assert.rejects(
        () => guards.before({ tool: "bash", sessionID: "s1", args: { command } }, {}),
        /bash-file-write-guard|File already exists/,
        `expected block for: ${command}`,
      )
    }
    // New files with trailing punctuation must still be allowed (no false positive).
    await guards.before({ tool: "bash", sessionID: "s1", args: { command: `echo x > ${newfile};` } }, {})
    await guards.before({ tool: "bash", sessionID: "s1", args: { command: `(echo x > ${newfile})` } }, {})
    // Properly-quoted existing-file target must still block (quoted alternation branch).
    await assert.rejects(
      () => guards.before({ tool: "bash", sessionID: "s1", args: { command: `echo x > "${existing}"` } }, {}),
      /bash-file-write-guard|File already exists/,
      `expected block for quoted target: echo x > "${existing}"`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
