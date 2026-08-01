import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

import {
  main,
  type CliRuntime,
  type ReleaseCompletionReceipt,
} from "../scripts/check-release-completion.ts"
import {
  assertMachineReadableReceipt,
  copyReleaseCheckerPackageFiles,
  makeCliReceipt,
  makeCliRuntime,
  receiptKeys,
  receiptSurfaceKeys,
  runPackageScript,
  writeValidStagedAssets,
  writeJson,
} from "./release-completion-test-support.test.ts"

test("main writes one stable JSON receipt and maps all outcomes to fixed exit codes", async () => {
  const checkedAt = new Date("2027-02-03T04:05:06.000Z")
  const clock = { now: () => checkedAt, sleep: async () => {} }
  const expectedExitCodes = new Map([
    ["COMPLETED", 0],
    ["FAILED", 1],
    ["UNRESOLVED", 2],
  ] as const)

  for (const [outcome, expectedExitCode] of expectedExitCodes) {
    const output: string[] = []
    const calls = { check: 0, staged: 0 }
    const receipt = makeCliReceipt(outcome, checkedAt)
    const exitCode = await main(
      ["--mode", "staged", "--tag", "v1.2.3", "--assets-dir", "ignored-by-runtime"],
      {},
      makeCliRuntime(clock, receipt, output, calls),
    )

    assert.equal(exitCode, expectedExitCode)
    assert.equal(calls.check, 0)
    assert.equal(calls.staged, 1)
    assert.deepEqual(output, [`${JSON.stringify(receipt, null, 2)}\n`])
    const parsed = JSON.parse(output[0] ?? "") as ReleaseCompletionReceipt
    assert.deepEqual(Object.keys(parsed), receiptKeys)
    assert.deepEqual(Object.keys(parsed.surfaces), receiptSurfaceKeys)
  }
})

test("main passes one injected checkedAt to staged remote and argument-failure receipts", async () => {
  const checkedAt = new Date("2027-02-03T04:05:06.000Z")
  let nowCalls = 0
  const clock = {
    now: () => {
      nowCalls += 1
      return checkedAt
    },
    sleep: async () => {},
  }
  const receipt = makeCliReceipt("COMPLETED", checkedAt)
  const output: string[] = []
  let stagedCheckedAt: Date | undefined
  let remoteCheckedAt: Date | undefined
  let remoteClock: CliRuntime["clock"] | undefined
  let checkCalls = 0
  let stagedCalls = 0
  const runtime: CliRuntime = {
    clock,
    check: async (options) => {
      checkCalls += 1
      remoteCheckedAt = options.checkedAt
      remoteClock = options.clock
      return receipt
    },
    validateStaged: (_root, _assetsDir, _tag, value) => {
      stagedCalls += 1
      stagedCheckedAt = value
      return receipt
    },
    writeStdout: (value) => { output.push(value) },
  }

  assert.equal(
    await main(["--mode", "staged", "--tag", "v1.2.3", "--assets-dir", "assets"], {}, runtime),
    0,
  )
  assert.strictEqual(stagedCheckedAt, checkedAt)

  assert.equal(
    await main(["--mode", "remote", "--repository", "octo/ocmm", "--tag", "v1.2.3"], {}, runtime),
    0,
  )
  assert.strictEqual(remoteCheckedAt, checkedAt)
  assert.strictEqual(remoteClock, clock)

  assert.equal(await main(["--mode", "remote", "--tag", "v1.2.3"], {}, runtime), 1)
  assert.equal(nowCalls, 3)
  assert.equal(stagedCalls, 1)
  assert.equal(checkCalls, 1)
  const invalidReceipt = JSON.parse(output[2] ?? "") as ReleaseCompletionReceipt
  assert.equal(invalidReceipt.checkedAt, "2027-02-03T04:05:06.000Z")
})

test("main rejects missing duplicate unknown and invalid CLI options before remote checking", async () => {
  const checkedAt = new Date("2027-02-03T04:05:06.000Z")
  const invalidArgv: readonly string[][] = [
    ["--tag", "v1.2.3"],
    ["--mode", "remote", "--repository", "octo/ocmm"],
    ["--mode", "invalid", "--tag", "v1.2.3"],
    ["--mode", "remote", "--repository", "invalid", "--tag", "v1.2.3"],
    ["--mode", "remote", "--repository", "octo/ocmm", "--tag", ""],
    ["--mode", "remote", "--repository", "octo/ocmm", "--tag", "v1.2.3", "--run-id", "0"],
    ["--mode", "remote", "--repository", "octo/ocmm", "--tag", "v1.2.3", "--deadline-ms", "0"],
    ["--mode", "remote", "--repository", "octo/ocmm", "--tag", "v1.2.3", "--poll-ms", "0"],
    ["--mode", "staged", "--tag", "v1.2.3", "--assets-dir", ""],
    ["--mode", "remote", "--repository", "octo/ocmm", "--tag", "v1.2.3", "--tag", "v9.9.9"],
    ["--mode", "remote", "--repository", "octo/ocmm", "--tag", "v1.2.3", "--unknown", "value"],
    ["--mode", "remote", "--repository", "octo/ocmm", "--tag", "v1.2.3", "positional"],
    ["--mode", "remote", "--repository", "octo/ocmm", "--tag", "v1.2.3", "--assets-dir", "assets"],
    ["--mode", "staged", "--tag", "v1.2.3", "--assets-dir", "assets", "--deadline-ms", "1"],
  ]

  for (const argv of invalidArgv) {
    const output: string[] = []
    const calls = { check: 0, staged: 0 }
    const runtime = makeCliRuntime(
      { now: () => checkedAt, sleep: async () => {} },
      makeCliReceipt("COMPLETED", checkedAt),
      output,
      calls,
    )
    assert.equal(await main(argv, {}, runtime), 1)
    assert.deepEqual(calls, { check: 0, staged: 0 })
    assert.equal(output.length, 1)
    assert.equal((JSON.parse(output[0] ?? "") as ReleaseCompletionReceipt).outcome, "FAILED")
  }
})

test("main never serializes GITHUB_TOKEN", async () => {
  const token = "github-token-secret-sentinel"
  const checkedAt = new Date("2027-02-03T04:05:06.000Z")
  const output: string[] = []
  const runtime: CliRuntime = {
    clock: { now: () => checkedAt, sleep: async () => {} },
    check: async (options) => {
      assert.equal(options.githubToken, token)
      throw new Error(token)
    },
    validateStaged: () => {
      throw new Error(token)
    },
    writeStdout: (value) => { output.push(value) },
  }

  assert.equal(
    await main(["--mode", "remote", "--repository", "octo/ocmm", "--tag", "v1.2.3"], { GITHUB_TOKEN: token }, runtime),
    1,
  )
  assert.equal(output.length, 1)
  assert.equal(output.join("").includes(token), false)
})

test("remote main accepts an empty environment and reports missing GitHub Packages proof as UNRESOLVED", async () => {
  const checkedAt = new Date("2027-02-03T04:05:06.000Z")
  const receipt = makeCliReceipt("UNRESOLVED", checkedAt)
  const output: string[] = []
  let checkOptions: Parameters<CliRuntime["check"]>[0] | undefined
  const runtime: CliRuntime = {
    clock: { now: () => checkedAt, sleep: async () => {} },
    check: async (options) => {
      checkOptions = options
      return receipt
    },
    validateStaged: () => {
      throw new Error("staged validation must not run for remote mode")
    },
    writeStdout: (value) => { output.push(value) },
  }

  const exitCode = await main(
    ["--mode", "remote", "--repository", "octo/ocmm", "--tag", "v1.2.3"],
    {},
    runtime,
  )

  assert.equal(exitCode, 2)
  assert.ok(checkOptions)
  assert.equal("githubToken" in checkOptions, false)
  assert.deepEqual(output, [`${JSON.stringify(receipt, null, 2)}\n`])
  assert.equal((JSON.parse(output[0] ?? "") as ReleaseCompletionReceipt).outcome, "UNRESOLVED")
})

test("release instructions make GitHub Packages proof optional without local token preflights", () => {
  const sources = [
    "skills/publish/SKILL.md",
    "AGENTS.md",
    "README.md",
  ].map((path) => ({ path, source: readFileSync(join(process.cwd(), path), "utf8") }))

  for (const { path, source } of sources) {
    assert.doesNotMatch(
      source,
      /IsNullOrWhiteSpace\(\$env:GITHUB_TOKEN\)[\s\S]{0,200}throw/,
      `${path} must not block release work on a local token preflight`,
    )
    assert.match(
      source,
      /No local `?GITHUB_TOKEN`? is needed to bump, tag, push, or trigger CI/i,
      `${path} must allow authorized tag publication without a local token`,
    )
    assert.match(
      source,
      /optional authentication for GitHub Packages proof/i,
      `${path} must describe the token as optional GitHub Packages proof authentication`,
    )
    assert.match(
      source,
      /UNRESOLVED.*exit `?2`?.*(?:does not|never) block.*authorized tag.*CI/is,
      `${path} must preserve fail-closed proof without blocking authorized tag/CI publication`,
    )
  }
})

test("real staged package-script smoke is network-free and machine-readable", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-release-cli-smoke-"))
  const token = "github-token-secret-sentinel"
  const networkSentinel = "network-denied-sentinel"
  try {
    const productPackage = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }
    assert.equal(
      productPackage.scripts["check:release-completion"],
      "node --experimental-strip-types scripts/check-release-completion.ts",
    )
    writeJson(join(root, "package.json"), {
      name: "ocmm-release-cli-smoke",
      version: "0.6.6",
      type: "module",
      scripts: { "check:release-completion": productPackage.scripts["check:release-completion"] },
      ocmm: { lspVersion: "0.3.2" },
    })
    mkdirSync(join(root, "crates", "ocmm-lsp"), { recursive: true })
    writeFileSync(join(root, "crates", "ocmm-lsp", "Cargo.toml"), "[package]\nname = \"ocmm-lsp\"\nversion = \"0.3.2\"\n")
    copyReleaseCheckerPackageFiles(root)
    const assetsDir = writeValidStagedAssets(root, "v0.6.6")
    const preload = join(root, "network-denied.mjs")
    writeFileSync(preload, `globalThis.fetch = async () => { throw new Error(${JSON.stringify(networkSentinel)}) }\n`)
    const env = {
      ...process.env,
      GITHUB_TOKEN: token,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${pathToFileURL(preload).href}`].filter(Boolean).join(" "),
    }

    const staged = runPackageScript(root, ["--mode", "staged", "--tag", "v0.6.6", "--assets-dir", assetsDir], env)
    assert.equal(staged.status, 0)
    assert.equal(staged.stderr, "")
    const stagedReceipt = assertMachineReadableReceipt(staged.stdout)
    assert.equal(stagedReceipt.schemaVersion, 1)
    assert.equal(stagedReceipt.outcome, "COMPLETED")
    assert.equal(stagedReceipt.repository, "local")
    assert.equal(stagedReceipt.lane, "ocmm")
    assert.equal(stagedReceipt.tag, "v0.6.6")
    assert.equal(stagedReceipt.version, "0.6.6")
    assert.equal(Number.isFinite(Date.parse(stagedReceipt.checkedAt)), true)
    for (const output of [staged.stdout, staged.stderr]) {
      assert.equal(output.includes(token), false)
      assert.equal(output.includes(networkSentinel), false)
    }

    const invalid = runPackageScript(root, ["--mode", "remote", "--repository", "invalid", "--tag", "v1.2.3"], env)
    assert.equal(invalid.status, 1)
    assert.equal(invalid.stderr, "")
    assert.equal(assertMachineReadableReceipt(invalid.stdout).outcome, "FAILED")
    for (const output of [invalid.stdout, invalid.stderr]) {
      assert.equal(output.includes(token), false)
      assert.equal(output.includes(networkSentinel), false)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
