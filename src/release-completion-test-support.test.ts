import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"

import {
  expectedReleaseAssets,
  parseReleaseTarget,
  validateStagedReleaseAssets,
  type CliRuntime,
  type HttpClient,
  type ReleaseCompletionReceipt,
} from "../scripts/check-release-completion.ts"
import { ocmmLspPlatformPackages } from "./shared/ocmm-lsp-binary.ts"

export function lspPlatformPackagesFixture() {
  return ocmmLspPlatformPackages()
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

export function makeReleaseRoot(mainVersion = "1.2.3", lspVersion = "4.5.6", pinnedLspVersion = "4.5.6"): string {
  const root = mkdtempSync(join(tmpdir(), "ocmm-release-completion-"))
  writeJson(join(root, "package.json"), {
    name: "ocmm",
    version: mainVersion,
    ocmm: { lspVersion: pinnedLspVersion },
  })
  mkdirSync(join(root, "crates", "ocmm-lsp"), { recursive: true })
  writeFileSync(join(root, "crates", "ocmm-lsp", "Cargo.toml"), `[package]\nname = "ocmm-lsp"\nversion = "${lspVersion}"\n`)
  return root
}

export function replaceRootPackage(root: string, value: unknown): void {
  writeJson(join(root, "package.json"), value)
}

export const FIXED_CHECKED_AT = new Date("2027-01-02T03:04:05.000Z")

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

export function writeValidStagedAssets(root: string, tag: string): string {
  const assetsDir = join(root, "release-assets")
  mkdirSync(assetsDir, { recursive: true })
  const target = parseReleaseTarget(tag, root)
  const payloads = expectedReleaseAssets(target).filter((name) => name !== "SHA256SUMS.txt")
  const rows: string[] = []
  for (const [index, name] of payloads.entries()) {
    const bytes = Buffer.from(`asset-${index}-${name}\n`)
    writeFileSync(join(assetsDir, name), bytes)
    rows.push(`${sha256(bytes)}  ${name}`)
  }
  writeFileSync(join(assetsDir, "SHA256SUMS.txt"), `${rows.join("\n")}\n`)
  return assetsDir
}

export function validateStaged(root: string, assetsDir: string, tag: string): ReturnType<typeof validateStagedReleaseAssets> {
  let receipt: ReturnType<typeof validateStagedReleaseAssets> | undefined
  assert.doesNotThrow(() => {
    receipt = validateStagedReleaseAssets(root, assetsDir, tag, FIXED_CHECKED_AT)
  })
  assert.ok(receipt)
  return receipt
}

export type PlannedResponse =
  | { status: number; json: unknown; headers?: Readonly<Record<string, string>> }
  | { status: number; bytes: Uint8Array; headers?: Readonly<Record<string, string>> }
  | { error: Error }

export class FakeClock {
  currentMs = Date.parse("2027-01-15T08:00:00.000Z")
  readonly sleeps: number[] = []

  now(): Date {
    return new Date(this.currentMs)
  }

  async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms)
    this.currentMs += ms
  }
}

export function jsonResponse(status: number, value: unknown, headers: Readonly<Record<string, string>> = {}): PlannedResponse {
  return { status, json: value, headers }
}

export function createHttpFixture(routes: Readonly<Record<string, readonly PlannedResponse[]>>): {
  http: HttpClient
  requests: Array<{ url: string; headers: Readonly<Record<string, string>> }>
} {
  const queues = new Map(Object.entries(routes).map(([url, responses]) => [url, [...responses]]))
  const requests: Array<{ url: string; headers: Readonly<Record<string, string>> }> = []
  return {
    requests,
    http: async (request) => {
      requests.push({ url: request.url, headers: request.headers })
      const next = queues.get(request.url)?.shift()
      assert.ok(next, `unexpected HTTP request ${request.url}`)
      if ("error" in next) throw next.error
      const body = "json" in next ? Buffer.from(JSON.stringify(next.json)) : Buffer.from(next.bytes)
      const headers = Object.fromEntries(
        Object.entries(next.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value.trim()]),
      )
      return { status: next.status, headers, body }
    },
  }
}

export const REPOSITORY = "octo/ocmm"
export const GITHUB_API_ORIGIN = "https://api.github.com"
export const GITHUB_API = `https://api.github.com/repos/${REPOSITORY}`
export const MAIN_TAG = "v1.2.3"
export const LSP_TAG = "ocmm-lsp-v4.5.6"
export const HEAD_SHA = "a".repeat(40)
export const MOVED_HEAD_SHA = "c".repeat(40)
export const ANNOTATED_TAG_SHA = "b".repeat(40)

const nativePlatforms = [
  "linux-x64-gnu",
  "linux-arm64-gnu",
  "linux-x64-musl",
  "linux-arm64-musl",
  "win32-x64",
  "win32-arm64",
  "darwin-x64",
  "darwin-arm64",
] as const

export const mainJobs = [
  { name: "Verify (ocmm)", conclusion: "success" },
  { name: "Download pinned ocmm-lsp binaries", conclusion: "success" },
  { name: "Package and publish ocmm", conclusion: "success" },
  { name: "Package and publish ocmm-lsp packages", conclusion: "skipped" },
  { name: "GitHub Release", conclusion: "success" },
] as const

export const lspJobs = [
  { name: "Verify (ocmm-lsp)", conclusion: "success" },
  ...nativePlatforms.map((platform) => ({ name: `Native ocmm-lsp (${platform})`, conclusion: "success" })),
  { name: "Package and publish ocmm-lsp packages", conclusion: "success" },
  { name: "Download pinned ocmm-lsp binaries", conclusion: "skipped" },
  { name: "Package and publish ocmm", conclusion: "skipped" },
  { name: "GitHub Release", conclusion: "success" },
] as const

export function tagRefUrl(tag: string): string {
  return `${GITHUB_API}/git/ref/tags/${encodeURIComponent(tag)}`
}

export function tagObjectUrl(sha: string): string {
  return `${GITHUB_API}/git/tags/${sha}`
}

export function discoveryUrl(tag: string): string {
  return `${GITHUB_API}/actions/workflows/release.yml/runs?event=push&branch=${encodeURIComponent(tag)}&per_page=100`
}

export function fixedRunUrl(runId: number): string {
  return `${GITHUB_API}/actions/runs/${runId}`
}

export function jobsUrl(runId: number, attempt: number): string {
  return `${GITHUB_API}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`
}

export function lightweightTagRoutes(tag: string, headSha: string, count = 2): Record<string, PlannedResponse[]> {
  return {
    [tagRefUrl(tag)]: Array.from({ length: count }, () => jsonResponse(200, {
      object: { type: "commit", sha: headSha },
    })),
  }
}

export function annotatedTagRoutes(tag: string, headSha: string, count = 2): Record<string, PlannedResponse[]> {
  return {
    [tagRefUrl(tag)]: Array.from({ length: count }, () => jsonResponse(200, {
      object: { type: "tag", sha: ANNOTATED_TAG_SHA },
    })),
    [tagObjectUrl(ANNOTATED_TAG_SHA)]: Array.from({ length: count }, () => jsonResponse(200, {
      object: { type: "commit", sha: headSha },
    })),
  }
}

export function workflowRun(
  tag: string,
  headSha: string,
  runId: number,
  attempt: number,
  status = "completed",
  conclusion: unknown = "success",
): Record<string, unknown> {
  return {
    id: runId,
    run_attempt: attempt,
    event: "push",
    path: ".github/workflows/release.yml",
    head_branch: tag,
    head_sha: headSha,
    status,
    conclusion,
  }
}

export function remoteOptions(root: string, tag: string, clock: FakeClock, http: HttpClient, runId?: number) {
  return {
    root,
    repository: REPOSITORY,
    tag,
    deadlineMs: 100,
    pollIntervalMs: 10,
    checkedAt: clock.now(),
    http,
    clock,
    ...(runId === undefined ? {} : { runId }),
  }
}

export function combineRoutes(...groups: ReadonlyArray<Record<string, readonly PlannedResponse[]>>): Record<string, readonly PlannedResponse[]> {
  return Object.assign({}, ...groups)
}

export interface RemoteReleaseAsset {
  name: string
  size: number
  browser_download_url: string
}

export interface RemoteReleaseFixture {
  readonly names: readonly string[]
  readonly payloads: readonly string[]
  readonly bytes: Map<string, Uint8Array>
  readonly release: {
    tag_name: string
    draft: boolean
    prerelease: boolean
    response_secret: string
    assets: RemoteReleaseAsset[]
  }
  readonly routes: Record<string, readonly PlannedResponse[]>
}

export function releaseUrl(tag: string): string {
  return `${GITHUB_API}/releases/tags/${encodeURIComponent(tag)}`
}

export function releaseAssetUrl(name: string): string {
  return `https://downloads.example.invalid/${encodeURIComponent(name)}`
}

export const receiptSurfaceKeys = [
  "identity",
  "workflow",
  "jobs",
  "githubRelease",
  "releaseAssets",
  "checksums",
  "npm",
  "githubPackages",
  "pinnedLspRelease",
] as const

export function makeRemoteReleaseFixture(root: string, tag: string): RemoteReleaseFixture {
  const target = parseReleaseTarget(tag, root)
  const names = expectedReleaseAssets(target)
  const payloads = names.filter((name) => name !== "SHA256SUMS.txt")
  const bytes = new Map<string, Uint8Array>()

  for (const [index, name] of payloads.entries()) {
    bytes.set(name, Buffer.from(`remote-release-${index}-${name}\n`))
  }
  bytes.set(
    "SHA256SUMS.txt",
    Buffer.from(`${payloads.map((name) => `${sha256(bytes.get(name) ?? new Uint8Array())}  ${name}`).join("\n")}\n`),
  )

  const release = {
    tag_name: tag,
    draft: false,
    prerelease: true,
    response_secret: "release-response-secret",
    assets: names.map((name) => ({
      name,
      size: bytes.get(name)?.byteLength ?? 0,
      browser_download_url: releaseAssetUrl(name),
    })),
  }
  const routes: Record<string, readonly PlannedResponse[]> = {
    [releaseUrl(tag)]: [jsonResponse(200, release)],
  }
  for (const name of names) {
    routes[releaseAssetUrl(name)] = [{ status: 200, bytes: bytes.get(name) ?? new Uint8Array() }]
  }

  return { names, payloads, bytes, release, routes }
}

export function replaceRemoteReleaseAssetBytes(fixture: RemoteReleaseFixture, name: string, bytes: Uint8Array): void {
  const asset = fixture.release.assets.find((candidate) => candidate.name === name)
  assert.ok(asset, `missing fixture asset ${name}`)
  fixture.bytes.set(name, bytes)
  asset.size = bytes.byteLength
  fixture.routes[releaseAssetUrl(name)] = [{ status: 200, bytes }]
}

export function successfulWorkflowRoutes(
  tag: string,
  runId: number,
  attempt: number,
  jobs: readonly { name: string; conclusion: string }[],
): Record<string, readonly PlannedResponse[]> {
  return {
    [discoveryUrl(tag)]: [jsonResponse(200, {
      total_count: 1,
      workflow_runs: [workflowRun(tag, HEAD_SHA, runId, attempt)],
    })],
    [fixedRunUrl(runId)]: [jsonResponse(200, workflowRun(tag, HEAD_SHA, runId, attempt))],
    [jobsUrl(runId, attempt)]: [jsonResponse(200, { total_count: jobs.length, jobs })],
  }
}

export const NPMJS_REGISTRY = "https://registry.npmjs.org"
export const GITHUB_PACKAGES_REGISTRY = "https://npm.pkg.github.com"
export const GITHUB_TOKEN = "sentinel-secret-token"

export function registryMetadataUrl(registry: string, packageName: string): string {
  return `${registry}/${encodeURIComponent(packageName)}`
}

export function registryManifest(name: string, version: string): Record<string, unknown> {
  return { versions: { [version]: { name, version } }, "dist-tags": { latest: "99.99.99" } }
}

export function npmProofRoutes(targetTag: string, root: string): Record<string, readonly PlannedResponse[]> {
  const target = parseReleaseTarget(targetTag, root)
  const packageNames = target.lane === "ocmm"
    ? ["ocmm"]
    : ocmmLspPlatformPackages().map((platform) => platform.packageName)
  return Object.fromEntries(packageNames.map((name) => [
    registryMetadataUrl(NPMJS_REGISTRY, name),
    [jsonResponse(200, registryManifest(name, target.version))],
  ]))
}

export function pinnedLspReleaseUrl(version = "4.5.6"): string {
  return `${GITHUB_API}/releases/tags/ocmm-lsp-v${version}`
}

export function fullMainRoutes(root: string, event: "push" | "workflow_dispatch" = "push"): Record<string, readonly PlannedResponse[]> {
  const remote = makeRemoteReleaseFixture(root, MAIN_TAG)
  const fixed = { ...workflowRun(MAIN_TAG, HEAD_SHA, 42, 3), event }
  return combineRoutes(
    lightweightTagRoutes(MAIN_TAG, HEAD_SHA, 12),
    event === "push"
      ? successfulWorkflowRoutes(MAIN_TAG, 42, 3, mainJobs)
      : {
          [fixedRunUrl(42)]: [jsonResponse(200, fixed)],
          [jobsUrl(42, 3)]: [jsonResponse(200, { total_count: mainJobs.length, jobs: mainJobs })],
        },
    remote.routes,
    npmProofRoutes(MAIN_TAG, root),
    {
      [registryMetadataUrl(GITHUB_PACKAGES_REGISTRY, "@octo/ocmm")]: [jsonResponse(200, registryManifest("@octo/ocmm", "1.2.3"))],
      [pinnedLspReleaseUrl()]: [jsonResponse(200, { tag_name: "ocmm-lsp-v4.5.6", draft: false, assets: [] })],
    },
  )
}

export function fullLspRoutes(root: string): Record<string, readonly PlannedResponse[]> {
  const remote = makeRemoteReleaseFixture(root, LSP_TAG)
  return combineRoutes(
    lightweightTagRoutes(LSP_TAG, HEAD_SHA, 12),
    successfulWorkflowRoutes(LSP_TAG, 77, 2, lspJobs),
    remote.routes,
    npmProofRoutes(LSP_TAG, root),
  )
}

export function remoteOptionsWithToken(root: string, tag: string, clock: FakeClock, http: HttpClient, runId?: number) {
  return { ...remoteOptions(root, tag, clock, http, runId), githubToken: GITHUB_TOKEN }
}

export const receiptKeys = [
  "schemaVersion",
  "outcome",
  "checkedAt",
  "repository",
  "lane",
  "tag",
  "version",
  "headSha",
  "runId",
  "runAttempt",
  "runUrl",
  "prerelease",
  "surfaces",
  "jobs",
  "assets",
  "packages",
  "errors",
] as const

export function makeCliReceipt(outcome: "COMPLETED" | "FAILED" | "UNRESOLVED", checkedAt: Date): ReleaseCompletionReceipt {
  const root = makeReleaseRoot()
  try {
    const assetsDir = writeValidStagedAssets(root, "v1.2.3")
    return { ...validateStagedReleaseAssets(root, assetsDir, "v1.2.3", checkedAt), outcome }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

export function makeCliRuntime(
  clock: CliRuntime["clock"],
  receipt: ReleaseCompletionReceipt,
  output: string[],
  calls: { check: number; staged: number },
): CliRuntime {
  return {
    clock,
    check: async () => {
      calls.check += 1
      return receipt
    },
    validateStaged: () => {
      calls.staged += 1
      return receipt
    },
    writeStdout: (value) => { output.push(value) },
  }
}

export function copyReleaseCheckerPackageFiles(root: string): void {
  for (const relativePath of [
    join("scripts", "check-release-completion.ts"),
    join("scripts", "lsp-package-manifest.ts"),
    join("src", "shared", "ocmm-lsp-binary.ts"),
  ]) {
    const destination = join(root, relativePath)
    mkdirSync(join(destination, ".."), { recursive: true })
    copyFileSync(join(process.cwd(), relativePath), destination)
  }
  cpSync(
    join(process.cwd(), "scripts", "release-completion"),
    join(root, "scripts", "release-completion"),
    { recursive: true },
  )
}

export function resolvePnpmForSmoke(): string {
  if (process.platform !== "win32") return "pnpm"
  const directories = (process.env.PATH ?? process.env.Path ?? "").split(delimiter)
  for (const directory of directories) {
    for (const name of ["pnpm.cmd", "pnpm.exe"]) {
      const candidate = join(directory, name)
      if (existsSync(candidate)) return candidate
    }
  }
  throw new Error("pnpm executable is not available on PATH")
}

export function runPackageScript(root: string, args: string[], env: NodeJS.ProcessEnv): { status: number; stdout: string; stderr: string } {
  const pnpm = resolvePnpmForSmoke()
  const packageArgs = ["--silent", "run", "check:release-completion", "--", ...args]
  const result = process.platform === "win32" && pnpm.endsWith(".cmd")
    ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", pnpm, ...packageArgs], { cwd: root, env, encoding: "utf8" })
    : spawnSync(pnpm, packageArgs, { cwd: root, env, encoding: "utf8" })
  if (result.error) throw result.error
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

export function assertMachineReadableReceipt(stdout: string): ReleaseCompletionReceipt {
  assert.equal(stdout.endsWith("\n"), true)
  const receipt = JSON.parse(stdout) as ReleaseCompletionReceipt
  assert.equal(stdout, `${JSON.stringify(receipt, null, 2)}\n`)
  assert.deepEqual(Object.keys(receipt), receiptKeys)
  assert.deepEqual(Object.keys(receipt.surfaces), receiptSurfaceKeys)
  return receipt
}
