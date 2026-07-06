# OCMM/LSP Versioned npm Packages Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `ocmm` and `ocmm-lsp` versioning, publish `ocmm-lsp` as eight platform npm optional packages, add npmjs.org release CI, and document default hook behavior.

**Architecture:** Add a shared LSP platform manifest used by runtime detection and release scripts. Keep checked-in workspace package manifests for the eight `ocmm-lsp-*` packages, normalize them to exact LSP versions only when packing/publishing, and route release CI by `v*.*.*` vs `ocmm-lsp-v*` tags.

**Tech Stack:** TypeScript ESM, Node 22 `node:test`, pnpm 11 workspaces, GitHub Actions, Cargo/Rust `ocmm-lsp`, npm package metadata `os`/`cpu`/`libc` optional dependencies.

**Global Constraints:**
- Do not change hook behavior or defaults.
- Do not publish to npm during local implementation.
- Do not execute `git commit`, `git push`, `git tag`, or any git write command without explicit user permission.
- Do not require `ocmm` and `ocmm-lsp` versions to match.
- LSP platform matrix must include Linux GNU x64/arm64, Linux musl x64/arm64, Darwin x64/arm64, and Windows x64/arm64.
- Source checkout may use workspace optional dependencies; publish-time package metadata must use exact LSP versions.
- `pnpm run typecheck`, `pnpm test`, and `pnpm run build` must pass before the implementation is considered complete.

---

## File Structure

- Create: `pnpm-workspace.yaml` — declares the root package and `packages/*` platform packages as a pnpm workspace.
- Modify: `.gitignore` — stop ignoring `pnpm-workspace.yaml`; keep generated platform package `bin/` payloads ignored.
- Modify: `package.json` — add workspace optional dependencies, `ocmm.lspVersion` as the pinned default LSP version for main-package releases, and package/release helper scripts.
- Create/modify: `packages/ocmm-lsp-*/package.json` — checked-in platform package manifests with `os`/`cpu`/`libc`, `files: ["bin"]`, and LSP version metadata.
- Modify: `src/shared/ocmm-lsp-binary.ts` — central runtime-safe platform manifest, musl support, package-name mapping, target mapping, and binary-name helpers.
- Modify: `src/mcp/index.ts` — teach built-in LSP command resolution to prefer installed platform package binaries before bundled/local fallbacks.
- Modify: `src/cli/ocmm-lsp.ts` — reuse the shared resolver and improve diagnostics for optional dependency omissions.
- Modify: `src/mcp/index.test.ts` — add tests for eight-platform mappings, workspace/platform package resolution, and fallback behavior.
- Create: `scripts/lsp-package-manifest.ts` — release/package-only manifest helpers, Cargo version reader, staging helpers, and publish metadata normalization helpers.
- Create: `scripts/sync-lsp-packages.ts` — updates checked-in platform package manifests and root optional dependency entries.
- Create: `scripts/stage-lsp-packages.ts` — copies native binaries into platform packages, writes publish-time metadata, and validates package contents.
- Create: `scripts/check-release-version.ts` — validates `v*` against `package.json.version` and `ocmm-lsp-v*` against `Cargo.toml` version.
- Create: `scripts/normalize-ocmm-package.ts` — stages three package directories: npmjs.org `ocmm` without native LSP binaries, OpenCode GitHub Release `ocmm` with pinned LSP binaries, and package-root-shaped Codex GitHub Release assets with pinned LSP binaries.
- Modify: `.github/workflows/release.yml` — route by release kind, add eight-target LSP package publish path, add main `ocmm` npmjs.org publish path, preserve GitHub Release/GitHub Packages behavior.
- Modify: `README.md` — update install/release/LSP packaging docs and add default-enabled hook table.
- Modify: `AGENTS.md` — update release workflow guidance to separate `v*.*.*` and `ocmm-lsp-v*` releases and include npmjs.org behavior.
- Test: `src/mcp/index.test.ts` plus script-level tests either as `src/shared/ocmm-lsp-binary.test.ts` or by exporting pure helpers and testing through `src/mcp/index.test.ts`.

---

### Task 1: Platform manifest, workspace packages, and version sync scaffolding

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `.gitignore`
- Modify: `package.json`
- Create: `packages/ocmm-lsp-linux-x64-gnu/package.json`
- Create: `packages/ocmm-lsp-linux-arm64-gnu/package.json`
- Create: `packages/ocmm-lsp-linux-x64-musl/package.json`
- Create: `packages/ocmm-lsp-linux-arm64-musl/package.json`
- Create: `packages/ocmm-lsp-darwin-x64/package.json`
- Create: `packages/ocmm-lsp-darwin-arm64/package.json`
- Create: `packages/ocmm-lsp-windows-x64/package.json`
- Create: `packages/ocmm-lsp-windows-arm64/package.json`
- Create: `scripts/lsp-package-manifest.ts`
- Create: `scripts/sync-lsp-packages.ts`
- Test: `src/mcp/index.test.ts`

**Interfaces:**
- Consumes: `crates/ocmm-lsp/Cargo.toml` package version.
- Produces: `LSP_PLATFORMS`, `readCargoPackageVersion(cargoTomlPath: string): string`, `syncLspPackageManifests(options?: SyncLspPackageOptions): void`, and checked-in platform package manifests consumed by Tasks 2, 3, and 4.

- [ ] **Step 1: Write failing tests for platform package metadata**

Add imports and a test to `src/mcp/index.test.ts` after the existing `ocmmLspBinaryNames mirrors release artifact names` test:

```ts
import {
  ocmmLspBinaryNames,
  ocmmLspPackageName,
  ocmmLspReleaseTarget,
  ocmmLspPlatformPackages,
} from "./index.ts"

test("ocmm-lsp platform manifest covers npm package names and native targets", () => {
  assert.equal(ocmmLspReleaseTarget("linux", "x64", "gnu"), "x86_64-unknown-linux-gnu")
  assert.equal(ocmmLspReleaseTarget("linux", "arm64", "gnu"), "aarch64-unknown-linux-gnu")
  assert.equal(ocmmLspReleaseTarget("linux", "x64", "musl"), "x86_64-unknown-linux-musl")
  assert.equal(ocmmLspReleaseTarget("linux", "arm64", "musl"), "aarch64-unknown-linux-musl")
  assert.equal(ocmmLspPackageName("linux", "x64", "gnu"), "ocmm-lsp-linux-x64-gnu")
  assert.equal(ocmmLspPackageName("linux", "arm64", "gnu"), "ocmm-lsp-linux-arm64-gnu")
  assert.equal(ocmmLspPackageName("linux", "x64", "musl"), "ocmm-lsp-linux-x64-musl")
  assert.equal(ocmmLspPackageName("linux", "arm64", "musl"), "ocmm-lsp-linux-arm64-musl")
  assert.equal(ocmmLspPackageName("darwin", "x64"), "ocmm-lsp-darwin-x64")
  assert.equal(ocmmLspPackageName("darwin", "arm64"), "ocmm-lsp-darwin-arm64")
  assert.equal(ocmmLspPackageName("win32", "x64"), "ocmm-lsp-windows-x64")
  assert.equal(ocmmLspPackageName("win32", "arm64"), "ocmm-lsp-windows-arm64")
  assert.deepEqual(
    ocmmLspPlatformPackages().map((item) => item.packageName),
    [
      "ocmm-lsp-linux-x64-gnu",
      "ocmm-lsp-linux-arm64-gnu",
      "ocmm-lsp-linux-x64-musl",
      "ocmm-lsp-linux-arm64-musl",
      "ocmm-lsp-darwin-x64",
      "ocmm-lsp-darwin-arm64",
      "ocmm-lsp-windows-x64",
      "ocmm-lsp-windows-arm64",
    ],
  )
})
```

Also update the existing `ocmmLspBinaryNames mirrors release artifact names` test so the musl assertion becomes:

```ts
assert.deepEqual(ocmmLspBinaryNames("linux", "x64", "musl"), ["ocmm-lsp-x86_64-unknown-linux-musl", "ocmm-lsp"])
assert.deepEqual(ocmmLspBinaryNames("linux", "arm64", "musl"), ["ocmm-lsp-aarch64-unknown-linux-musl", "ocmm-lsp"])
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec "src/mcp/index.test.ts"
```

Expected: FAIL because `ocmmLspPackageName` and `ocmmLspPlatformPackages` are not exported and musl release targets are not mapped.

- [ ] **Step 3: Add runtime-safe LSP platform manifest exports**

Replace `src/shared/ocmm-lsp-binary.ts` with this shape, preserving existing function names and adding new exports:

```ts
export type OcmmLspLinuxLibc = "gnu" | "musl" | "unknown"

export interface OcmmLspPlatformPackage {
  packageName: string
  platform: NodeJS.Platform
  arch: NodeJS.Architecture
  linuxLibc?: Exclude<OcmmLspLinuxLibc, "unknown">
  target: string
  binaryName: string
  os: string[]
  cpu: string[]
  libc?: string[]
}

const LSP_PLATFORM_PACKAGES: readonly OcmmLspPlatformPackage[] = [
  platformPackage("ocmm-lsp-linux-x64-gnu", "linux", "x64", "gnu", "x86_64-unknown-linux-gnu", ["linux"], ["x64"], ["glibc"]),
  platformPackage("ocmm-lsp-linux-arm64-gnu", "linux", "arm64", "gnu", "aarch64-unknown-linux-gnu", ["linux"], ["arm64"], ["glibc"]),
  platformPackage("ocmm-lsp-linux-x64-musl", "linux", "x64", "musl", "x86_64-unknown-linux-musl", ["linux"], ["x64"], ["musl"]),
  platformPackage("ocmm-lsp-linux-arm64-musl", "linux", "arm64", "musl", "aarch64-unknown-linux-musl", ["linux"], ["arm64"], ["musl"]),
  platformPackage("ocmm-lsp-darwin-x64", "darwin", "x64", undefined, "x86_64-apple-darwin", ["darwin"], ["x64"]),
  platformPackage("ocmm-lsp-darwin-arm64", "darwin", "arm64", undefined, "aarch64-apple-darwin", ["darwin"], ["arm64"]),
  platformPackage("ocmm-lsp-windows-x64", "win32", "x64", undefined, "x86_64-pc-windows-msvc", ["win32"], ["x64"]),
  platformPackage("ocmm-lsp-windows-arm64", "win32", "arm64", undefined, "aarch64-pc-windows-msvc", ["win32"], ["arm64"]),
]

function platformPackage(
  packageName: string,
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
  linuxLibc: Exclude<OcmmLspLinuxLibc, "unknown"> | undefined,
  target: string,
  os: string[],
  cpu: string[],
  libc?: string[],
): OcmmLspPlatformPackage {
  const ext = platform === "win32" ? ".exe" : ""
  return { packageName, platform, arch, linuxLibc, target, binaryName: `ocmm-lsp-${target}${ext}`, os, cpu, ...(libc ? { libc } : {}) }
}

export function ocmmLspPlatformPackages(): readonly OcmmLspPlatformPackage[] {
  return LSP_PLATFORM_PACKAGES
}

export function detectLinuxLibc(platform = process.platform): OcmmLspLinuxLibc {
  if (platform !== "linux") return "unknown"
  const report = typeof process.report?.getReport === "function" ? process.report.getReport() as Record<string, unknown> : undefined
  const header = report?.header
  if (
    header &&
    typeof header === "object" &&
    "glibcVersionRuntime" in header &&
    typeof header.glibcVersionRuntime === "string"
  ) {
    return "gnu"
  }
  return "musl"
}

export function ocmmLspPlatformPackage(
  platform = process.platform,
  arch = process.arch,
  linuxLibc = detectLinuxLibc(platform),
): OcmmLspPlatformPackage | undefined {
  return LSP_PLATFORM_PACKAGES.find((item) => {
    if (item.platform !== platform || item.arch !== arch) return false
    if (item.platform !== "linux") return true
    return item.linuxLibc === linuxLibc
  })
}

export function ocmmLspPackageName(
  platform = process.platform,
  arch = process.arch,
  linuxLibc = detectLinuxLibc(platform),
): string | undefined {
  return ocmmLspPlatformPackage(platform, arch, linuxLibc)?.packageName
}

export function ocmmLspReleaseTarget(
  platform = process.platform,
  arch = process.arch,
  linuxLibc = detectLinuxLibc(platform),
): string | undefined {
  return ocmmLspPlatformPackage(platform, arch, linuxLibc)?.target
}

export function ocmmLspExecutableExtension(platform = process.platform): string {
  return platform === "win32" ? ".exe" : ""
}

export function ocmmLspBinaryNames(
  platform = process.platform,
  arch = process.arch,
  linuxLibc = detectLinuxLibc(platform),
): string[] {
  const ext = ocmmLspExecutableExtension(platform)
  const platformPackage = ocmmLspPlatformPackage(platform, arch, linuxLibc)
  return platformPackage ? [platformPackage.binaryName, `ocmm-lsp${ext}`] : [`ocmm-lsp${ext}`]
}

export function unsupportedOcmmLspPlatformMessage(
  platform = process.platform,
  arch = process.arch,
  linuxLibc = detectLinuxLibc(platform),
): string | undefined {
  if (ocmmLspReleaseTarget(platform, arch, linuxLibc)) return undefined
  if (platform === "linux") {
    return `No ocmm-lsp npm package or bundled binary is published for ${platform}-${arch}-${linuxLibc}; build from source with pnpm run build:lsp.`
  }
  return `No ocmm-lsp npm package or bundled binary is published for ${platform}-${arch}; build from source with pnpm run build:lsp.`
}
```

Update `src/mcp/index.ts` re-exports:

```ts
export {
  ocmmLspBinaryNames,
  ocmmLspPackageName,
  ocmmLspPlatformPackage,
  ocmmLspPlatformPackages,
  ocmmLspReleaseTarget,
} from "../shared/ocmm-lsp-binary.ts"
```

- [ ] **Step 4: Add workspace and package manifest scaffolding**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "."
  - "packages/*"
```

Modify `.gitignore` by removing the `pnpm-workspace.yaml` line and adding generated native payload ignores:

```gitignore
packages/ocmm-lsp-*/bin/
packages/ocmm-lsp-*/*.tgz
```

Modify root `package.json`:

```json
{
  "optionalDependencies": {
    "ocmm-lsp-linux-x64-gnu": "workspace:*",
    "ocmm-lsp-linux-arm64-gnu": "workspace:*",
    "ocmm-lsp-linux-x64-musl": "workspace:*",
    "ocmm-lsp-linux-arm64-musl": "workspace:*",
    "ocmm-lsp-darwin-x64": "workspace:*",
    "ocmm-lsp-darwin-arm64": "workspace:*",
    "ocmm-lsp-windows-x64": "workspace:*",
    "ocmm-lsp-windows-arm64": "workspace:*"
  },
  "scripts": {
    "sync:lsp-packages": "node --experimental-strip-types scripts/sync-lsp-packages.ts",
    "stage:lsp-packages": "node --experimental-strip-types scripts/stage-lsp-packages.ts",
    "check:release-version": "node --experimental-strip-types scripts/check-release-version.ts"
  },
  "ocmm": {
    "lspVersion": "0.3.1"
  }
}
```

Preserve all existing fields/scripts; add the new keys in the existing `scripts` object, add `optionalDependencies` near `dependencies`, and add `ocmm.lspVersion` as the canonical LSP version that `ocmm` installs by default. `ocmm.lspVersion` starts at the currently supported LSP version but is independent of the current `Cargo.toml` version after this migration.

- [ ] **Step 5: Implement manifest sync script and checked-in package manifests**

Create `scripts/lsp-package-manifest.ts` with pure helpers:

```ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import { ocmmLspPlatformPackages } from "../src/shared/ocmm-lsp-binary.ts"

export interface SyncLspPackageOptions {
  root?: string
  write?: boolean
}

export interface OcmmPackageMetadata {
  lspVersion?: string
}

export function projectRoot(root = resolve(import.meta.dirname, "..")): string {
  return root
}

export function readCargoPackageVersion(cargoTomlPath: string): string {
  const text = readFileSync(cargoTomlPath, "utf8")
  const match = text.match(/^version\s*=\s*"([^"]+)"/m)
  if (!match?.[1]) throw new Error(`Could not read package version from ${cargoTomlPath}`)
  return match[1]
}

export function lspVersion(root: string): string {
  return readCargoPackageVersion(join(root, "crates", "ocmm-lsp", "Cargo.toml"))
}

export function readRootPackage(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>
}

export function pinnedOcmmLspVersion(root: string): string {
  const pkg = readRootPackage(root)
  const ocmm = pkg.ocmm as OcmmPackageMetadata | undefined
  if (typeof ocmm?.lspVersion !== "string" || ocmm.lspVersion.length === 0) {
    throw new Error("package.json must define ocmm.lspVersion for the LSP version installed by ocmm")
  }
  return ocmm.lspVersion
}

export function platformPackageJson(version: string, packageName: string) {
  const platform = ocmmLspPlatformPackages().find((item) => item.packageName === packageName)
  if (!platform) throw new Error(`Unknown ocmm-lsp platform package: ${packageName}`)
  return {
    name: platform.packageName,
    version,
    description: `Native ocmm-lsp binary for ${platform.packageName.replace("ocmm-lsp-", "")}`,
    license: "LicenseRef-AAAPL",
    os: platform.os,
    cpu: platform.cpu,
    ...(platform.libc ? { libc: platform.libc } : {}),
    files: ["bin"],
  }
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}
```

Create `scripts/sync-lsp-packages.ts`:

```ts
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { ocmmLspPlatformPackages } from "../src/shared/ocmm-lsp-binary.ts"
import { lspVersion, platformPackageJson, readRootPackage, writeJson } from "./lsp-package-manifest.ts"

const root = resolve(import.meta.dirname, "..")
const version = lspVersion(root)

for (const platform of ocmmLspPlatformPackages()) {
  writeJson(join(root, "packages", platform.packageName, "package.json"), platformPackageJson(version, platform.packageName))
}

const rootPackagePath = join(root, "package.json")
const rootPackage = readRootPackage(root)
rootPackage.optionalDependencies = Object.fromEntries(
  ocmmLspPlatformPackages().map((platform) => [platform.packageName, "workspace:*"]),
)
rootPackage.ocmm = { ...(rootPackage.ocmm as Record<string, unknown> | undefined), lspVersion: (rootPackage.ocmm as { lspVersion?: string } | undefined)?.lspVersion ?? version }
writeJson(rootPackagePath, rootPackage)
```

Run:

```powershell
node --experimental-strip-types scripts/sync-lsp-packages.ts
```

Expected: creates the eight `packages/ocmm-lsp-*/package.json` files and updates root `package.json` optional dependencies.

- [ ] **Step 6: Run dependency install and targeted tests**

Run:

```powershell
pnpm install --lockfile-only
node --test --experimental-strip-types --test-reporter=spec "src/mcp/index.test.ts"
```

Expected: `pnpm-lock.yaml` updates for workspace packages and the targeted test PASSes.

- [ ] **Step 7: Report task completion without committing**

Report the changed files and suggested semantic commit message only:

```text
Suggested commit: feat: add lsp platform package manifest
Files: pnpm-workspace.yaml, .gitignore, package.json, pnpm-lock.yaml, packages/ocmm-lsp-*/package.json, scripts/lsp-package-manifest.ts, scripts/sync-lsp-packages.ts, src/shared/ocmm-lsp-binary.ts, src/mcp/index.ts, src/mcp/index.test.ts
```

Do not run `git commit` unless the orchestrator has explicit user permission.

---

### Task 2: Runtime platform package resolver for MCP and CLI

**Files:**
- Modify: `src/shared/ocmm-lsp-binary.ts`
- Modify: `src/mcp/index.ts`
- Modify: `src/cli/ocmm-lsp.ts`
- Modify: `src/mcp/index.test.ts`

**Interfaces:**
- Consumes: `ocmmLspPlatformPackage()`, `ocmmLspBinaryNames()`, and platform package manifests from Task 1.
- Produces: `ocmmLspPackageBinaryCandidates(packageRoot?: string): string[]`, `resolveOcmmLspCommand()` source value `platform-package`, and CLI diagnostics used by release smoke tests.

- [ ] **Step 1: Write failing resolver tests**

Add tests to `src/mcp/index.test.ts` near the existing resolver tests:

```ts
test("resolveOcmmLspCommand prefers installed platform npm package over bundled dist binary", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-lsp-platform-package-"))
  try {
    const platform = ocmmLspPlatformPackages().find((item) => item.platform === process.platform && item.arch === process.arch)
    assert.ok(platform, "current platform must be represented by the LSP manifest")
    const packageBin = join(root, "node_modules", platform.packageName, "bin", platform.binaryName)
    const fallbackBin = process.platform === "win32" ? "ocmm-lsp.exe" : "ocmm-lsp"
    mkdirSync(join(root, "node_modules", platform.packageName, "bin"), { recursive: true })
    mkdirSync(join(root, "dist", "bin"), { recursive: true })
    writeExecutable(packageBin)
    writeExecutable(join(root, "dist", "bin", fallbackBin))
    writeFileSync(join(root, "package.json"), "{}")

    const resolved = resolveOcmmLspCommand({ packageRoot: root, pathEnv: "" })

    assert.equal(resolved.enabled, true)
    assert.equal(resolved.source, "platform-package")
    assert.deepEqual(resolved.command, [packageBin, "mcp"])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("resolveOcmmLspCommand falls back to bundled dist binary when optional package is absent", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-lsp-dist-fallback-"))
  try {
    const [platformBin] = ocmmLspBinaryNames()
    mkdirSync(join(root, "dist", "bin"), { recursive: true })
    writeExecutable(join(root, "dist", "bin", platformBin))
    writeFileSync(join(root, "package.json"), "{}")

    const resolved = resolveOcmmLspCommand({ packageRoot: root, pathEnv: "" })

    assert.equal(resolved.enabled, true)
    assert.equal(resolved.source, "package-bin")
    assert.deepEqual(resolved.command, [join(root, "dist", "bin", platformBin), "mcp"])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

Update `OcmmLspCommandResolution.source` expectations to include `"platform-package"`.

- [ ] **Step 2: Run targeted tests to verify failure**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec "src/mcp/index.test.ts"
```

Expected: FAIL because `resolveOcmmLspCommand()` does not search `node_modules/<platform-package>/bin` and the source union lacks `platform-package`.

- [ ] **Step 3: Implement package candidate helpers**

Add helpers to `src/shared/ocmm-lsp-binary.ts`:

```ts
import { join } from "node:path"

export function ocmmLspPackageBinaryCandidates(
  packageRoot: string,
  platform = process.platform,
  arch = process.arch,
  linuxLibc = detectLinuxLibc(platform),
): string[] {
  const platformPackage = ocmmLspPlatformPackage(platform, arch, linuxLibc)
  if (!platformPackage) return []
  return [join(packageRoot, "node_modules", platformPackage.packageName, "bin", platformPackage.binaryName)]
}

export function expectedOcmmLspPackageName(
  platform = process.platform,
  arch = process.arch,
  linuxLibc = detectLinuxLibc(platform),
): string {
  return ocmmLspPackageName(platform, arch, linuxLibc) ?? `unsupported-${platform}-${arch}${platform === "linux" ? `-${linuxLibc}` : ""}`
}
```

Keep runtime code independent from release-only scripts.

- [ ] **Step 4: Update MCP resolver order**

Modify imports in `src/mcp/index.ts`:

```ts
import { ocmmLspBinaryNames, ocmmLspPackageBinaryCandidates } from "../shared/ocmm-lsp-binary.ts"
```

Change the source union:

```ts
source: "env" | "platform-package" | "package-bin" | "target-release" | "target-debug" | "path" | "cargo-source" | "missing"
```

In `resolveOcmmLspCommand()`, put platform package candidates before `dist/bin`:

```ts
const candidates: Array<{ path: string; source: OcmmLspCommandResolution["source"] }> = [
  ...ocmmLspPackageBinaryCandidates(packageRoot).map((path) => ({ path, source: "platform-package" as const })),
  ...packageBinNames.map((name) => ({ path: join(packageRoot, "dist", "bin", name), source: "package-bin" as const })),
  ...packageBinNames.map((name) => ({ path: join(packageRoot, "bin", name), source: "package-bin" as const })),
  { path: join(packageRoot, "target", "release", binName), source: "target-release" },
  { path: join(packageRoot, "target", "debug", binName), source: "target-debug" },
]
```

- [ ] **Step 5: Update CLI wrapper to use the same search order and diagnostics**

In `src/cli/ocmm-lsp.ts`, replace `binaryPaths()` with candidate construction that includes package binaries and bundled binaries:

```ts
import {
  expectedOcmmLspPackageName,
  ocmmLspBinaryNames,
  ocmmLspPackageBinaryCandidates,
  unsupportedOcmmLspPlatformMessage,
} from "../shared/ocmm-lsp-binary.ts"

function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..")
}

function binaryPaths(): string[] {
  const root = packageRoot()
  const binDir = join(dirname(fileURLToPath(import.meta.url)), "..", "bin")
  return [
    ...ocmmLspPackageBinaryCandidates(root),
    ...ocmmLspBinaryNames().map((name) => join(binDir, name)),
  ]
}
```

Change the missing-binary error to:

```ts
const unsupported = unsupportedOcmmLspPlatformMessage()
console.error([
  "ocmm-lsp binary not found.",
  `Expected optional npm package: ${expectedOcmmLspPackageName()}`,
  "If this is an npm install, reinstall without --omit=optional and ensure optional dependencies are enabled.",
  "If this is a source checkout, run pnpm run build:lsp.",
  ...(unsupported ? [unsupported] : []),
  "Checked:",
  ...candidates.map((candidate) => `  ${candidate}`),
].join("\n"))
```

- [ ] **Step 6: Run targeted tests and diagnostics**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec "src/mcp/index.test.ts"
pnpm run typecheck
```

Expected: targeted tests PASS; typecheck PASS.

- [ ] **Step 7: Report task completion without committing**

Report:

```text
Suggested commit: feat: resolve lsp optional platform packages
Files: src/shared/ocmm-lsp-binary.ts, src/mcp/index.ts, src/cli/ocmm-lsp.ts, src/mcp/index.test.ts
```

Do not run `git commit` unless explicitly authorized.

---

### Task 3: LSP package staging and release-version validation scripts

**Files:**
- Modify: `scripts/lsp-package-manifest.ts`
- Create: `scripts/stage-lsp-packages.ts`
- Create: `scripts/check-release-version.ts`
- Create: `scripts/normalize-ocmm-package.ts`
- Modify: `package.json`
- Test: `src/mcp/index.test.ts`

**Interfaces:**
- Consumes: `ocmmLspPlatformPackages()` and package manifests from Tasks 1-2.
- Produces: CLI scripts used by `.github/workflows/release.yml`: `sync:lsp-packages`, `stage:lsp-packages`, `check:release-version`, and `normalize-ocmm-package`.

- [ ] **Step 1: Add script-helper tests for version parsing and publish metadata**

Create `src/shared/ocmm-lsp-binary.test.ts` if `src/mcp/index.test.ts` becomes too broad, or append to `src/mcp/index.test.ts`:

```ts
test("platform package metadata uses exact lsp version and npm platform constraints", () => {
  const version = "1.2.3"
  const linuxMusl = ocmmLspPlatformPackages().find((item) => item.packageName === "ocmm-lsp-linux-x64-musl")
  assert.ok(linuxMusl)
  assert.deepEqual(linuxMusl.os, ["linux"])
  assert.deepEqual(linuxMusl.cpu, ["x64"])
  assert.deepEqual(linuxMusl.libc, ["musl"])
  assert.equal(`${version}`, "1.2.3")
})
```

This locks the manifest fields that the staging scripts serialize.

- [ ] **Step 2: Run targeted tests to verify baseline**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec "src/mcp/index.test.ts"
```

Expected: PASS if Tasks 1-2 are complete; this task adds staging behavior without changing runtime tests.

- [ ] **Step 3: Extend `scripts/lsp-package-manifest.ts` with staging helpers**

Add helpers:

```ts
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs"

export function stagePlatformBinary(root: string, packageName: string, sourceBinary: string): string {
  const platform = ocmmLspPlatformPackages().find((item) => item.packageName === packageName)
  if (!platform) throw new Error(`Unknown ocmm-lsp platform package: ${packageName}`)
  if (!existsSync(sourceBinary)) throw new Error(`Missing native binary for ${packageName}: ${sourceBinary}`)
  const packageDir = join(root, "packages", packageName)
  const binDir = join(packageDir, "bin")
  rmSync(binDir, { recursive: true, force: true })
  mkdirSync(binDir, { recursive: true })
  const target = join(binDir, platform.binaryName)
  copyFileSync(sourceBinary, target)
  if (!platform.binaryName.endsWith(".exe")) chmodSync(target, 0o755)
  return target
}

export function exactLspOptionalDependencies(version: string): Record<string, string> {
  return Object.fromEntries(ocmmLspPlatformPackages().map((platform) => [platform.packageName, version]))
}
```

- [ ] **Step 4: Implement `scripts/stage-lsp-packages.ts`**

Create a script that accepts a native artifact directory and stages binaries:

```ts
import { join, resolve } from "node:path"

import { ocmmLspPlatformPackages } from "../src/shared/ocmm-lsp-binary.ts"
import { lspVersion, platformPackageJson, stagePlatformBinary, writeJson } from "./lsp-package-manifest.ts"

const root = resolve(import.meta.dirname, "..")
const artifactDir = process.argv[2] ? resolve(process.argv[2]) : join(root, "dist", "bin")
const version = lspVersion(root)

for (const platform of ocmmLspPlatformPackages()) {
  writeJson(join(root, "packages", platform.packageName, "package.json"), platformPackageJson(version, platform.packageName))
  const staged = stagePlatformBinary(root, platform.packageName, join(artifactDir, platform.binaryName))
  console.log(`staged ${platform.packageName}: ${staged}`)
}
```

- [ ] **Step 5: Implement release version checker**

Create `scripts/check-release-version.ts`:

```ts
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { lspVersion } from "./lsp-package-manifest.ts"

const root = resolve(import.meta.dirname, "..")
const tag = process.env.RELEASE_TAG ?? process.argv[2]
if (!tag) throw new Error("RELEASE_TAG or argv[2] is required")

const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version?: string }

if (tag.startsWith("v")) {
  const expected = `v${rootPackage.version}`
  if (tag !== expected) throw new Error(`release tag ${tag} does not match package version ${expected}`)
  console.log("release-kind=ocmm")
} else if (tag.startsWith("ocmm-lsp-v")) {
  const expected = `ocmm-lsp-v${lspVersion(root)}`
  if (tag !== expected) throw new Error(`release tag ${tag} does not match ocmm-lsp version ${expected}`)
  console.log("release-kind=ocmm-lsp")
} else {
  throw new Error(`Unsupported release tag ${tag}; use vX.Y.Z or ocmm-lsp-vA.B.C`)
}
```

- [ ] **Step 6: Implement main package normalization script**

Create `scripts/normalize-ocmm-package.ts`:

```ts
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"

import { exactLspOptionalDependencies, pinnedOcmmLspVersion, writeJson } from "./lsp-package-manifest.ts"

const root = resolve(import.meta.dirname, "..")
const outputRoot = resolve(process.argv[2] ?? join(root, "dist", "package"))
const npmDir = join(outputRoot, "ocmm-npm")
const githubDir = join(outputRoot, "ocmm-github")
const codexDir = join(outputRoot, "codex-github")
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>
const lspVersion = pinnedOcmmLspVersion(root)

const packageEntries = [
  ".agents",
  "dist",
  "plugins",
  "prompts",
  "skills",
  "README.md",
  "LICENSE",
  "LICENSE.zh.md",
  "LICENSE.bilingual.md",
  "package.json",
]

function copyPackageTree(dest: string): void {
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  for (const entry of packageEntries) {
    const source = join(root, entry)
    if (existsSync(source)) cpSync(source, join(dest, entry), { recursive: true })
  }
}

function writeNormalizedPackage(dest: string): void {
  writeJson(join(dest, "package.json"), {
    ...pkg,
    optionalDependencies: exactLspOptionalDependencies(lspVersion),
    ocmm: { ...(pkg.ocmm as Record<string, unknown> | undefined), lspVersion },
  })
}

copyPackageTree(npmDir)
rmSync(join(npmDir, "dist", "bin"), { recursive: true, force: true })
rmSync(join(npmDir, "plugins", "ocmm", "dist", "bin"), { recursive: true, force: true })
writeNormalizedPackage(npmDir)

copyPackageTree(githubDir)
writeNormalizedPackage(githubDir)
if (!existsSync(join(githubDir, "dist", "bin"))) {
  throw new Error("GitHub Release package staging requires pinned ocmm-lsp binaries in dist/bin before normalization")
}

rmSync(codexDir, { recursive: true, force: true })
mkdirSync(codexDir, { recursive: true })
for (const entry of [".agents", "plugins", "dist", "README.md", "LICENSE", "LICENSE.zh.md", "LICENSE.bilingual.md", "package.json"]) {
  const source = join(githubDir, entry)
  if (existsSync(source)) cpSync(source, join(codexDir, entry), { recursive: true })
}
if (!existsSync(join(codexDir, "plugins", "ocmm", "dist", "bin"))) {
  throw new Error("Codex GitHub Release package requires plugin-local pinned ocmm-lsp binaries")
}

console.log(`npm-package-dir=${npmDir}`)
console.log(`github-package-dir=${githubDir}`)
console.log(`codex-package-dir=${codexDir}`)
console.log(`normalized ocmm optionalDependencies to pinned ocmm-lsp ${lspVersion}`)
```

The three output directories have distinct roles:

- `dist/package/ocmm-npm`: npmjs.org `ocmm`, no native LSP binaries.
- `dist/package/ocmm-github`: OpenCode GitHub Release tarball, package-root-shaped and self-contained with pinned native LSP binaries.
- `dist/package/codex-github`: Codex marketplace GitHub Release tarball, package-root-shaped and self-contained with `.agents/plugins/marketplace.json`, `plugins/ocmm/`, root `dist/`, README, actual root license files, and `package.json`.

Add package scripts:

```json
{
  "scripts": {
    "normalize:ocmm-package": "node --experimental-strip-types scripts/normalize-ocmm-package.ts"
  }
}
```

- [ ] **Step 7: Smoke the scripts locally without publishing**

Run:

```powershell
$env:RELEASE_TAG = "v$(node -p "JSON.parse(require('node:fs').readFileSync('package.json','utf8')).version")"; pnpm run check:release-version
$env:RELEASE_TAG = "ocmm-lsp-v$(node -e "const fs=require('node:fs'); const t=fs.readFileSync('crates/ocmm-lsp/Cargo.toml','utf8'); console.log(t.match(/^version\\s*=\\s*\"([^\"]+)\"/m)[1])")"; pnpm run check:release-version
$env:RELEASE_TAG = $null
```

Expected: first command prints `release-kind=ocmm`; second prints `release-kind=ocmm-lsp`; no files are published.

After `pnpm run build` and after pinned LSP binaries have been staged in `dist/bin`, smoke the package staging script:

```powershell
pnpm run normalize:ocmm-package -- "dist/package"
Test-Path -LiteralPath "dist/package/ocmm-npm/dist/bin"
Test-Path -LiteralPath "dist/package/ocmm-github/dist/bin"
```

Expected: first `Test-Path` prints `False`; second prints `True`. This proves the npmjs.org package staging directory excludes native LSP binaries while the GitHub Release package staging directory remains self-contained.

- [ ] **Step 8: Report task completion without committing**

Report:

```text
Suggested commit: feat: add lsp package staging scripts
Files: scripts/lsp-package-manifest.ts, scripts/stage-lsp-packages.ts, scripts/check-release-version.ts, scripts/normalize-ocmm-package.ts, package.json, src/mcp/index.test.ts
```

Do not run git write commands.

---

### Task 4: Release workflow split and npmjs.org publishing

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `package.json`

**Interfaces:**
- Consumes: scripts from Task 3 and platform package manifests from Task 1.
- Produces: CI paths for `v*.*.*` and `ocmm-lsp-v*` tags, npmjs.org publish steps, GitHub Release assets, and optional GitHub Packages publish.

- [ ] **Step 1: Add workflow-level release kind routing**

Modify `.github/workflows/release.yml` trigger:

```yaml
on:
  push:
    tags:
      - "v*.*.*"
      - "ocmm-lsp-v*"
  workflow_dispatch:
    inputs:
      release_kind:
        description: "Release kind"
        required: true
        type: choice
        options:
          - ocmm
          - ocmm-lsp
      tag:
        description: "Existing tag to publish, for example v0.3.2 or ocmm-lsp-v0.4.0"
        required: true
        type: string
      publish_github_package:
        description: "Also publish @owner/ocmm to GitHub Packages for ocmm releases"
        required: false
        default: true
        type: boolean
      prerelease:
        description: "Mark the GitHub Release as a prerelease"
        required: false
        default: false
        type: boolean
```

Add env values:

```yaml
env:
  NODE_VERSION: "24"
  PNPM_VERSION: "11.9.0"
  RELEASE_TAG: ${{ github.event_name == 'workflow_dispatch' && inputs.tag || github.ref_name }}
  RELEASE_KIND: ${{ github.event_name == 'workflow_dispatch' && inputs.release_kind || (startsWith(github.ref_name, 'ocmm-lsp-v') && 'ocmm-lsp' || 'ocmm') }}
```

Update workflow permissions so npm Trusted Publishing can request an OIDC token:

```yaml
permissions:
  contents: write
  packages: write
  id-token: write
```

- [ ] **Step 2: Route jobs by release kind**

Keep `verify`, but avoid LSP package staging in verify. Add job `if` conditions:

```yaml
native:
  if: env.RELEASE_KIND == 'ocmm-lsp'

stage-pinned-lsp:
  if: env.RELEASE_KIND == 'ocmm'

lsp-package:
  if: env.RELEASE_KIND == 'ocmm-lsp'

ocmm-package:
  if: env.RELEASE_KIND == 'ocmm'

github-release:
  needs:
    - lsp-package
    - ocmm-package
  if: always() && !failure() && !cancelled()
```

If GitHub Actions rejects `env` in job-level `if`, use the equivalent expression directly:

```yaml
if: ${{ github.event_name == 'workflow_dispatch' && inputs.release_kind == 'ocmm-lsp' || startsWith(github.ref_name, 'ocmm-lsp-v') }}
```

`native` is intentionally LSP-only. The `ocmm` release lane must not rebuild native LSP from the current checkout because that would bind the main package to the current `Cargo.toml` version. It uses the pinned `package.json.ocmm.lspVersion` instead.

- [ ] **Step 3: Expand native matrix to eight targets**

Replace native matrix include entries with eight rows:

```yaml
- os: ubuntu-22.04
  platform: linux-x64-gnu
  binary: ocmm-lsp-x86_64-unknown-linux-gnu
  source: target/x86_64-unknown-linux-gnu/release/ocmm-lsp
  rust_target: x86_64-unknown-linux-gnu
- os: ubuntu-24.04-arm
  platform: linux-arm64-gnu
  binary: ocmm-lsp-aarch64-unknown-linux-gnu
  source: target/aarch64-unknown-linux-gnu/release/ocmm-lsp
  rust_target: aarch64-unknown-linux-gnu
- os: ubuntu-22.04
  platform: linux-x64-musl
  binary: ocmm-lsp-x86_64-unknown-linux-musl
  source: target/x86_64-unknown-linux-musl/release/ocmm-lsp
  rust_target: x86_64-unknown-linux-musl
- os: ubuntu-24.04-arm
  platform: linux-arm64-musl
  binary: ocmm-lsp-aarch64-unknown-linux-musl
  source: target/aarch64-unknown-linux-musl/release/ocmm-lsp
  rust_target: aarch64-unknown-linux-musl
- os: windows-latest
  platform: win32-x64
  binary: ocmm-lsp-x86_64-pc-windows-msvc.exe
  source: target/x86_64-pc-windows-msvc/release/ocmm-lsp.exe
  rust_target: x86_64-pc-windows-msvc
- os: windows-11-arm
  platform: win32-arm64
  binary: ocmm-lsp-aarch64-pc-windows-msvc.exe
  source: target/aarch64-pc-windows-msvc/release/ocmm-lsp.exe
  rust_target: aarch64-pc-windows-msvc
- os: macos-15-intel
  platform: darwin-x64
  binary: ocmm-lsp-x86_64-apple-darwin
  source: target/x86_64-apple-darwin/release/ocmm-lsp
  rust_target: x86_64-apple-darwin
- os: macos-14
  platform: darwin-arm64
  binary: ocmm-lsp-aarch64-apple-darwin
  source: target/aarch64-apple-darwin/release/ocmm-lsp
  rust_target: aarch64-apple-darwin
```

Use `cargo-zigbuild` for Linux musl targets and regular `cargo build --target` for all other targets:

```yaml
- name: Install Rust target
  run: rustup target add ${{ matrix.rust_target }}

- name: Install Zig for musl cross builds
  if: contains(matrix.rust_target, 'musl')
  uses: goto-bus-stop/setup-zig@v2
  with:
    version: 0.13.0

- name: Install cargo-zigbuild for musl cross builds
  if: contains(matrix.rust_target, 'musl')
  run: cargo install cargo-zigbuild --locked

- name: Build native binary
  shell: bash
  run: |
    if [[ "${{ matrix.rust_target }}" == *musl ]]; then
      cargo zigbuild --release -p ocmm-lsp --target "${{ matrix.rust_target }}"
    else
      cargo build --release -p ocmm-lsp --target "${{ matrix.rust_target }}"
    fi
```

All matrix `source` values must use `target/<rust_target>/release/...`, matching the `--target` output directory. Do not use `target/release/...` in this workflow.

- [ ] **Step 4: Add LSP package job**

Create `lsp-package` job after `native`:

```yaml
lsp-package:
  name: Package and publish ocmm-lsp platform packages
  runs-on: ubuntu-latest
  needs:
    - verify
    - native
  if: ${{ github.event_name == 'workflow_dispatch' && inputs.release_kind == 'ocmm-lsp' || startsWith(github.ref_name, 'ocmm-lsp-v') }}
  steps:
    - uses: actions/checkout@v7
      with:
        ref: ${{ github.event_name == 'workflow_dispatch' && inputs.tag || github.ref }}
    - uses: actions/setup-node@v6
      with:
        node-version: ${{ env.NODE_VERSION }}
        registry-url: https://registry.npmjs.org
    - name: Enable pnpm
      run: |
        corepack enable
        corepack prepare pnpm@${PNPM_VERSION} --activate
    - name: Install dependencies
      run: pnpm install --frozen-lockfile
    - name: Check release version
      run: pnpm run check:release-version
    - uses: actions/download-artifact@v8
      with:
        pattern: ocmm-lsp-*
        path: dist/bin
        merge-multiple: true
    - name: Stage platform packages
      run: pnpm run stage:lsp-packages -- dist/bin
    - name: Pack and publish platform packages
      run: |
        mkdir -p release-assets
        for pkg in packages/ocmm-lsp-*; do
          name="$(node -p "JSON.parse(require('node:fs').readFileSync('$pkg/package.json','utf8')).name")"
          version="$(node -p "JSON.parse(require('node:fs').readFileSync('$pkg/package.json','utf8')).version")"
          cp "$pkg/bin"/ocmm-lsp-* release-assets/
          if npm view "$name@$version" version --registry=https://registry.npmjs.org >/dev/null 2>&1; then
            echo "$name@$version already exists on npmjs.org; skipping."
            npm pack "$pkg" --pack-destination release-assets --json
          else
            npm pack "$pkg" --pack-destination release-assets --json
            npm publish "$pkg" --registry=https://registry.npmjs.org --access public
          fi
        done
        cd release-assets
        shasum -a 256 * > SHA256SUMS.txt
    - uses: actions/upload-artifact@v7
      with:
        name: github-release-assets
        path: release-assets/*
        if-no-files-found: error
```

This job always copies each native binary into `release-assets` and always creates the real `ocmm-lsp-*.tgz` package tarball asset with `npm pack`. If the package version already exists on npmjs.org, reruns skip only `npm publish`; they still regenerate the tarball asset and checksums for the GitHub Release.

- [ ] **Step 5: Add pinned LSP asset staging for `ocmm` releases**

Create a `stage-pinned-lsp` job after `verify` and before `ocmm-package`:

```yaml
stage-pinned-lsp:
  name: Stage pinned ocmm-lsp binaries for ocmm release
  runs-on: ubuntu-latest
  needs: verify
  if: ${{ github.event_name == 'workflow_dispatch' && inputs.release_kind == 'ocmm' || startsWith(github.ref_name, 'v') }}
  steps:
    - uses: actions/checkout@v7
      with:
        ref: ${{ github.event_name == 'workflow_dispatch' && inputs.tag || github.ref }}
    - uses: actions/setup-node@v6
      with:
        node-version: ${{ env.NODE_VERSION }}
    - name: Read pinned LSP version
      id: lsp
      run: |
        version="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json','utf8')).ocmm.lspVersion")"
        if [ -z "$version" ] || [ "$version" = "undefined" ]; then
          echo "package.json ocmm.lspVersion is required for ocmm releases" >&2
          exit 1
        fi
        echo "version=$version" >> "$GITHUB_OUTPUT"
    - name: Download pinned LSP release assets
      env:
        GH_TOKEN: ${{ github.token }}
      run: |
        mkdir -p dist/bin
        gh release download "ocmm-lsp-v${{ steps.lsp.outputs.version }}" --pattern 'ocmm-lsp-*' --dir dist/bin --clobber
        rm -f dist/bin/*.tgz dist/bin/SHA256SUMS.txt
        test -f dist/bin/ocmm-lsp-x86_64-unknown-linux-gnu
        test -f dist/bin/ocmm-lsp-aarch64-unknown-linux-gnu
        test -f dist/bin/ocmm-lsp-x86_64-unknown-linux-musl
        test -f dist/bin/ocmm-lsp-aarch64-unknown-linux-musl
        test -f dist/bin/ocmm-lsp-x86_64-apple-darwin
        test -f dist/bin/ocmm-lsp-aarch64-apple-darwin
        test -f dist/bin/ocmm-lsp-x86_64-pc-windows-msvc.exe
        test -f dist/bin/ocmm-lsp-aarch64-pc-windows-msvc.exe
    - uses: actions/upload-artifact@v7
      with:
        name: pinned-ocmm-lsp-binaries
        path: dist/bin/*
        if-no-files-found: error
```

This job downloads native assets from the already-published `ocmm-lsp-vA.B.C` GitHub Release selected by `package.json.ocmm.lspVersion`. It does not build Rust and does not read `Cargo.toml`.

- [ ] **Step 6: Convert existing package job into `ocmm-package`**

Rename `package` job to `ocmm-package`, keep existing GitHub Release asset behavior, and change:

```yaml
if: ${{ github.event_name == 'workflow_dispatch' && inputs.release_kind == 'ocmm' || startsWith(github.ref_name, 'v') }}
```

Set dependencies to use pinned LSP assets rather than the `native` matrix:

```yaml
needs:
  - verify
  - stage-pinned-lsp
```

Replace `Check release version` with:

```yaml
- name: Check release version
  run: pnpm run check:release-version
```

After building TypeScript and before packing, download pinned LSP binaries, regenerate the Codex bundle with those pinned binaries, and create separate package staging directories:

```yaml
- uses: actions/download-artifact@v8
  with:
    name: pinned-ocmm-lsp-binaries
    path: dist/bin
- name: Regenerate Codex bundle with pinned LSP binaries
  run: pnpm run gen:codex-plugin
- name: Normalize ocmm package metadata
  run: pnpm run normalize:ocmm-package -- dist/package
```

Replace direct root `pnpm pack` with separate npmjs.org and GitHub Release packaging:

```yaml
- name: Verify npmjs.org ocmm package excludes native LSP binaries
  working-directory: dist/package/ocmm-npm
  run: |
    npm pack --dry-run --json > ../../ocmm-npm-pack-dry-run.json
    if grep -q 'dist/bin/ocmm-lsp' ../../ocmm-npm-pack-dry-run.json; then
      echo "npmjs.org ocmm package must not contain native LSP binaries" >&2
      exit 1
    fi
- name: Pack GitHub Release ocmm package
  working-directory: dist/package/ocmm-github
  run: pnpm pack
```

Rename the produced GitHub tarball from `dist/package/ocmm-github` to `release-assets/ocmm-opencode-plugin-${version}.tgz`. Build the Codex tarball from the root of `dist/package/codex-github` so the `ocmm-codex-plugin-${version}.tgz` asset remains package-root-shaped and contains `.agents/plugins/marketplace.json`, `plugins/ocmm/`, root `dist/`, README, package metadata, and actual root license files.

Add npmjs.org publish after tarball creation and before GitHub Packages publish:

```yaml
- name: Publish ocmm to npmjs.org
  if: github.event_name == 'push' || inputs.release_kind == 'ocmm'
  working-directory: dist/package/ocmm-npm
  run: |
    version="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
    if npm view "ocmm@$version" version --registry=https://registry.npmjs.org >/dev/null 2>&1; then
      echo "ocmm@$version is already published to npmjs.org; skipping."
    else
      npm publish . --registry=https://registry.npmjs.org
    fi
```

Keep the existing GitHub Packages publish behavior, but run it from a normalized staging directory rather than the repo root:

```yaml
- name: Publish package to GitHub Packages
  if: github.event_name == 'push' || inputs.publish_github_package
  working-directory: dist/package/ocmm-github
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    owner="${GITHUB_REPOSITORY_OWNER,,}"
    node - <<'NODE'
    const fs = require('node:fs')
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    const owner = process.env.GITHUB_REPOSITORY_OWNER.toLowerCase()
    pkg.name = `@${owner}/ocmm`
    pkg.publishConfig = { registry: 'https://npm.pkg.github.com' }
    fs.writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`)
    NODE
    printf '@%s:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=%s\n' "$owner" "$NODE_AUTH_TOKEN" > .npmrc
    version="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
    if npm view "@${owner}/ocmm@$version" version --registry=https://npm.pkg.github.com >/dev/null 2>&1; then
      echo "@${owner}/ocmm@$version is already published to GitHub Packages; skipping."
    else
      pnpm publish --registry=https://npm.pkg.github.com --access public --no-git-checks
    fi
```

The scoped rename and `publishConfig` mutation happen only inside `dist/package/ocmm-github`; the repo root `package.json` and `dist/package/ocmm-npm` remain unchanged.

- [ ] **Step 7: Validate YAML and release-script references locally**

Run:

```powershell
pnpm run typecheck
pnpm run check:release-version
```

For the second command, set a valid tag first as in Task 3 Step 7. Expected: typecheck PASS and release-version check PASS for both tag kinds.

- [ ] **Step 8: Report task completion without committing**

Report:

```text
Suggested commit: ci: split ocmm and lsp release publishing
Files: .github/workflows/release.yml, package.json
Required npm configuration: Trusted Publishing entries on npmjs.org for `ocmm` and every `ocmm-lsp-*` package, using GitHub Actions repository `hugefiver/ocmm`, workflow filename `release.yml` (the file at `.github/workflows/release.yml`), and publish permission.
```

Do not run git write commands.

---

### Task 5: Documentation and hook defaults table

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `plugins/ocmm/README.md` only if generated Codex README content changes as part of `gen:codex-plugin`

**Interfaces:**
- Consumes: final tag/package/release behavior from Tasks 1-4.
- Produces: user-facing documentation for npm install, LSP package architecture, release process, and hook defaults.

- [ ] **Step 1: Update README install section**

Replace statements that releases do not require npmjs.org with current behavior:

```md
### From npmjs.org

Install the main package from npmjs.org:

```bash
pnpm add ocmm
```

The `ocmm` package declares the eight `ocmm-lsp-*` platform packages as optional dependencies. npm-compatible package managers install the package matching the current `os`/`cpu`/`libc` by default. If optional dependencies are disabled (`--omit=optional`, package-manager config, or an older package manager without `libc` filtering), the `ocmm-lsp` wrapper reports the expected package name and falls back to bundled GitHub Release binaries or a local `pnpm run build:lsp` build.
```

Keep GitHub Release and GitHub Packages sections, but update URLs from `/download/v${VERSION}/...` to `/download/v${VERSION}/....`

- [ ] **Step 2: Update LSP distribution docs**

Replace the musl unsupported note with:

```md
Linux GNU and musl builds are published for x64 and arm64. The npm platform packages are:

- `ocmm-lsp-linux-x64-gnu`
- `ocmm-lsp-linux-arm64-gnu`
- `ocmm-lsp-linux-x64-musl`
- `ocmm-lsp-linux-arm64-musl`
- `ocmm-lsp-darwin-x64`
- `ocmm-lsp-darwin-arm64`
- `ocmm-lsp-windows-x64`
- `ocmm-lsp-windows-arm64`
```

Update the resolution paragraph:

```md
Resolution prefers the installed platform npm package, then bundled release binaries in `dist/bin/`, then local Cargo release/debug builds, then `cargo run` from `crates/ocmm-lsp/`, then a PATH `ocmm-lsp`.
```

- [ ] **Step 3: Add hook defaults table**

Add a README section near configuration docs:

```md
## Default hook behavior

`disabledHooks` defaults to `["directory-readme-injector"]`. Therefore `directory-readme-injector` is disabled by default, and every other hook listed below is enabled unless user config disables it.

| Hook | Default | Effect |
|---|---|---|
| `directory-readme-injector` | Disabled | Inject nearest README content into directory read output |
| `directory-agents-injector` | Enabled | Inject directory `AGENTS.md` guidance/config |
| `write-existing-file-guard` | Enabled | Prevent unsafe direct writes/patches without required read policy |
| `notepad-write-guard` | Enabled | Protect internal notepad paths from writes |
| `bash-file-read-guard` | Enabled | Warn when shell is used for file reads that should use read tools |
| `bash-file-write-guard` | Enabled | Block shell write bypasses for existing project files |
| `question-label-truncator` | Enabled | Truncate overly long question option labels |
| `tasks-todowrite-disabler` | Enabled | Disable conflicting todo-read behavior while task tooling is active |
| `webfetch-redirect-guard` | Enabled | Rewrite webfetch requests to final redirected URL |
| `empty-task-response-detector` | Enabled | Replace empty subagent task output with a diagnostic warning |
| `comment-checker` | Enabled | Warn about AI-attribution comments in code output |
| `plan-format-validator` | Enabled | Warn on malformed plan checklist formatting |
| `read-image-resizer` | Enabled | Warn about large image read/resize constraints |
| `json-error-recovery` | Enabled | Append recovery guidance for JSON parse errors |
| `fsync-skip-warning` | Enabled | Surface warnings when fsync operations are skipped |
| `tool-output-truncator` | Enabled | Truncate oversized tool outputs |
| `todo-description-override` | Enabled | Override todowrite tool description with stricter format guidance |
| `commit-guard-injector` | Enabled | Inject no-automatic-git-commit instruction into system prompt |
| `subagent-git-guard` | Enabled | Block subagents from git write commands |
```

- [ ] **Step 4: Update AGENTS release instructions**

Replace the release workflow section lines that say GitHub-only and `vX.Y.Z` with:

```md
The `.github/workflows/release.yml` workflow has two release lanes:

- `vX.Y.Z` publishes the main `ocmm` package, OpenCode/Codex GitHub Release assets, optional GitHub Packages `@<owner>/ocmm`, and npmjs.org `ocmm`.
- `ocmm-lsp-vA.B.C` publishes the eight `ocmm-lsp-*` platform packages and LSP native GitHub Release assets.

`package.json` is the canonical `ocmm` version. `crates/ocmm-lsp/Cargo.toml` is the canonical LSP version. They do not need to match. The root package optionalDependencies record which LSP version `ocmm` installs by default.
```

Update publishing steps to describe separate version bumps and tag names. Remove the instruction to keep `package.json` and `Cargo.toml` in sync.

- [ ] **Step 5: Run docs-adjacent generation check**

Run:

```powershell
pnpm run gen:codex-plugin
git diff -- .agents/plugins/marketplace.json plugins/ocmm README.md AGENTS.md
```

Expected: generated Codex plugin diff is either empty or limited to expected README/runtime bundle changes caused by previous build outputs. Do not commit; report generated files that need inclusion.

- [ ] **Step 6: Report task completion without committing**

Report:

```text
Suggested commit: docs: document split ocmm lsp releases
Files: README.md, AGENTS.md, optional generated plugins/ocmm files if gen:codex-plugin changes them
```

Do not run git write commands.

---

### Task 6: End-to-end verification and release dry runs

**Files:**
- Modify only if verification exposes defects in earlier tasks.
- Test: full repository verification commands.

**Interfaces:**
- Consumes: all outputs from Tasks 1-5.
- Produces: final evidence that the feature works locally and CI scripts are internally consistent.

- [ ] **Step 1: Run TypeScript typecheck**

Run:

```powershell
pnpm run typecheck
```

Expected: exit code 0.

- [ ] **Step 2: Run full test suite**

Run:

```powershell
pnpm test
```

Expected: TypeScript node tests and Cargo tests pass.

- [ ] **Step 3: Run full build**

Run:

```powershell
pnpm run build
```

Expected: TypeScript emits `dist/`; Cargo builds `ocmm-lsp`; `dist/bin` contains both target-specific and fallback local binaries for the current platform.

- [ ] **Step 4: Run LSP MCP smoke test**

Run:

```powershell
'{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist\cli\ocmm-lsp.js mcp
```

Expected: output lists `status`, `diagnostics`, `goto_definition`, `find_references`, `symbols`, `prepare_rename`, and `rename`.

- [ ] **Step 5: Dry-run platform package staging on current platform assets**

If only the local current-platform binary exists, do not fake all eight binaries in the repo. Instead, use a temp directory under the OS temp path:

```powershell
$tmp = Join-Path $env:TEMP "ocmm-lsp-stage-dryrun"
rm.exe -rf "$tmp"
mkdir.exe -p "$tmp"
node -e "const fs=require('node:fs'); const path=require('node:path'); const bins=['ocmm-lsp-x86_64-unknown-linux-gnu','ocmm-lsp-aarch64-unknown-linux-gnu','ocmm-lsp-x86_64-unknown-linux-musl','ocmm-lsp-aarch64-unknown-linux-musl','ocmm-lsp-x86_64-apple-darwin','ocmm-lsp-aarch64-apple-darwin','ocmm-lsp-x86_64-pc-windows-msvc.exe','ocmm-lsp-aarch64-pc-windows-msvc.exe']; for (const b of bins) fs.writeFileSync(path.join(process.argv[1], b), '')" "$tmp"
pnpm run stage:lsp-packages -- "$tmp"
```

Expected: each `packages/ocmm-lsp-*/bin/` gets exactly one expected binary. Clean generated package `bin/` directories after inspection:

```powershell
rm.exe -rf packages\ocmm-lsp-*\bin
rm.exe -rf "$tmp"
```

- [ ] **Step 6: Run npm pack dry-runs without publishing**

Run:

```powershell
pnpm run normalize:ocmm-package -- "dist/package"
Push-Location "dist/package/ocmm-npm"; npm pack --dry-run --json; Pop-Location
Push-Location "dist/package/ocmm-github"; npm pack --dry-run --json; Pop-Location
foreach ($pkg in Get-ChildItem -Directory packages\ocmm-lsp-*) { npm pack $pkg.FullName --dry-run --json }
```

Expected: `dist/package/ocmm-npm` dry-run does not include `dist/bin/ocmm-lsp*`; `dist/package/ocmm-github` dry-run includes the pinned self-contained `dist/bin/ocmm-lsp*` payloads; each platform package dry-run includes `package/bin/<expected-binary>` and `package/package.json` after staging.

- [ ] **Step 7: Run LSP diagnostics on changed TypeScript files**

Run `lsp_diagnostics` on:

```text
src/shared/ocmm-lsp-binary.ts
src/mcp/index.ts
src/cli/ocmm-lsp.ts
```

Expected: no new TypeScript errors.

- [ ] **Step 8: Final review report without committing**

Report:

```text
Verification passed:
- pnpm run typecheck
- pnpm test
- pnpm run build
- LSP MCP smoke test
- npm pack dry-runs
- lsp_diagnostics on changed TS files

Suggested commit grouping:
1. feat: add lsp platform package manifest
2. feat: resolve lsp optional platform packages
3. feat: add lsp package staging scripts
4. ci: split ocmm and lsp release publishing
5. docs: document split ocmm lsp releases
```

Do not commit unless the user explicitly authorizes git write operations.
