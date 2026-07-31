import assert from "node:assert/strict"
import { mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import {
  expectedReleaseAssets,
  parseReleaseTarget,
  validateStagedReleaseAssets,
} from "../scripts/check-release-completion.ts"
import {
  FIXED_CHECKED_AT,
  lspPlatformPackagesFixture,
  makeReleaseRoot,
  replaceRootPackage,
  sha256,
  validateStaged,
  writeValidStagedAssets,
} from "./release-completion-test-support.test.ts"

test("parseReleaseTarget accepts only exact local main and LSP stable tags", () => {
  const root = makeReleaseRoot()
  try {
    assert.deepEqual(parseReleaseTarget("v1.2.3", root), {
      lane: "ocmm",
      tag: "v1.2.3",
      version: "1.2.3",
      pinnedLspVersion: "4.5.6",
    })
    assert.deepEqual(parseReleaseTarget("ocmm-lsp-v4.5.6", root), {
      lane: "ocmm-lsp",
      tag: "ocmm-lsp-v4.5.6",
      version: "4.5.6",
      pinnedLspVersion: null,
    })

    for (const tag of ["v1.2", "v01.2.3", "v1.2.3-beta.1", "v1.2.3+build", "ocmm-lsp-v4.5", " ocmm-lsp-v4.5.6"] as const) {
      assert.throws(() => parseReleaseTarget(tag, root), /strict release tag/)
    }
    assert.throws(() => parseReleaseTarget("v9.9.9", root), /does not match root package version/)
    assert.throws(() => parseReleaseTarget("ocmm-lsp-v9.9.9", root), /does not match ocmm-lsp Cargo version/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }

  for (const rootPackage of [
    { name: "ocmm", version: 123, ocmm: { lspVersion: "4.5.6" } },
    { name: "ocmm", ocmm: { lspVersion: "4.5.6" } },
  ]) {
    const invalidRoot = makeReleaseRoot()
    try {
      replaceRootPackage(invalidRoot, rootPackage)
      assert.throws(() => parseReleaseTarget("v1.2.3", invalidRoot), /Missing string version in root package\.json/)
    } finally {
      rmSync(invalidRoot, { recursive: true, force: true })
    }
  }

  for (const pinnedLspVersion of ["4.5", "04.5.6", "4.5.6-beta.1", "4.5.6+build"] as const) {
    const invalidRoot = makeReleaseRoot("1.2.3", "4.5.6", pinnedLspVersion)
    try {
      assert.throws(() => parseReleaseTarget("v1.2.3", invalidRoot), /Invalid ocmm\.lspVersion: expected strict version/)
    } finally {
      rmSync(invalidRoot, { recursive: true, force: true })
    }
  }

  for (const ocmm of [undefined, { lspVersion: 456 }] as const) {
    const invalidRoot = makeReleaseRoot()
    try {
      replaceRootPackage(invalidRoot, { name: "ocmm", version: "1.2.3", ocmm })
      assert.throws(() => parseReleaseTarget("v1.2.3", invalidRoot), /Missing ocmm\.lspVersion/)
    } finally {
      rmSync(invalidRoot, { recursive: true, force: true })
    }
  }
})

test("expectedReleaseAssets returns the exact main and seventeen-file LSP inventories", () => {
  const root = makeReleaseRoot()
  try {
    const main = parseReleaseTarget("v1.2.3", root)
    assert.deepEqual(expectedReleaseAssets(main), [
      "SHA256SUMS.txt",
      "deepwork-codex-plugin-1.2.3.tgz",
      "ocmm-opencode-plugin-1.2.3.tgz",
    ])

    const lsp = parseReleaseTarget("ocmm-lsp-v4.5.6", root)
    const expected = [
      ...lspPlatformPackagesFixture().map((platform) => platform.binaryName),
      ...lspPlatformPackagesFixture().map((platform) => `${platform.packageName}-4.5.6.tgz`),
      "SHA256SUMS.txt",
    ].sort()
    assert.equal(expected.length, 17)
    assert.deepEqual(expectedReleaseAssets(lsp), expected)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("validateStagedReleaseAssets completes exact main and LSP fixtures", () => {
  for (const tag of ["v1.2.3", "ocmm-lsp-v4.5.6"] as const) {
    const root = makeReleaseRoot()
    try {
      const assetsDir = writeValidStagedAssets(root, tag)
      const receipt = validateStagedReleaseAssets(root, assetsDir, tag, FIXED_CHECKED_AT)
      const target = parseReleaseTarget(tag, root)
      const expectedAssets = expectedReleaseAssets(target)

      assert.equal(receipt.outcome, "COMPLETED")
      assert.equal(receipt.checkedAt, "2027-01-02T03:04:05.000Z")
      assert.equal(receipt.repository, "local")
      assert.equal(receipt.lane, target.lane)
      assert.equal(receipt.tag, tag)
      assert.equal(receipt.version, target.version)
      assert.equal(receipt.surfaces.releaseAssets.status, "PASS")
      assert.equal(receipt.surfaces.checksums.status, "PASS")
      assert.equal(receipt.assets.length, expectedAssets.length)
      assert.equal(statSync(join(assetsDir, "SHA256SUMS.txt")).size > 0, true)

      for (const name of expectedAssets.filter((candidate) => candidate !== "SHA256SUMS.txt")) {
        const asset = receipt.assets.find((candidate) => candidate.name === name)
        assert.equal(asset?.sha256, sha256(readFileSync(join(assetsDir, name))))
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test("validateStagedReleaseAssets rejects missing extra empty and non-regular assets", async (t) => {
  const mutations: ReadonlyArray<(assetsDir: string) => void> = [
    (assetsDir) => rmSync(join(assetsDir, "ocmm-opencode-plugin-1.2.3.tgz")),
    (assetsDir) => writeFileSync(join(assetsDir, "unexpected.tgz"), "extra"),
    (assetsDir) => writeFileSync(join(assetsDir, "ocmm-opencode-plugin-1.2.3.tgz"), ""),
    (assetsDir) => mkdirSync(join(assetsDir, "nested")),
  ]

  for (const mutate of mutations) {
    const root = makeReleaseRoot()
    try {
      const assetsDir = writeValidStagedAssets(root, "v1.2.3")
      mutate(assetsDir)
      const receipt = validateStaged(root, assetsDir, "v1.2.3")
      assert.equal(receipt.outcome, "FAILED")
      assert.equal(receipt.surfaces.releaseAssets.status, "FAILED")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  await t.test("rejects a symlink when the platform permits its creation", (subtest) => {
    const root = makeReleaseRoot()
    try {
      const assetsDir = writeValidStagedAssets(root, "v1.2.3")
      const payload = join(assetsDir, "ocmm-opencode-plugin-1.2.3.tgz")
      rmSync(payload)
      try {
        symlinkSync(join(assetsDir, "deepwork-codex-plugin-1.2.3.tgz"), payload, "file")
      } catch (error: unknown) {
        if (error instanceof Error && ("code" in error) && (error.code === "EPERM" || error.code === "EACCES" || error.code === "ENOTSUP")) {
          subtest.skip("symlink creation is unsupported without elevation")
          return
        }
        throw error
      }

      const receipt = validateStaged(root, assetsDir, "v1.2.3")
      assert.equal(receipt.outcome, "FAILED")
      assert.equal(receipt.surfaces.releaseAssets.status, "FAILED")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

test("validateStagedReleaseAssets rejects malformed incomplete duplicate and mismatched checksums", () => {
  const matchingDigest = sha256(Buffer.from("asset-0-deepwork-codex-plugin-1.2.3.tgz\n"))
  const mismatchedDigest = "0".repeat(64)
  const checksumBodies = [
    "not-a-checksum\n",
    `${matchingDigest}  deepwork-codex-plugin-1.2.3.tgz\n`,
    `${matchingDigest}  deepwork-codex-plugin-1.2.3.tgz\n${matchingDigest}  deepwork-codex-plugin-1.2.3.tgz\n`,
    `${matchingDigest}  nested/deepwork-codex-plugin-1.2.3.tgz\n${mismatchedDigest}  ocmm-opencode-plugin-1.2.3.tgz\n`,
    `${matchingDigest}  SHA256SUMS.txt\n${mismatchedDigest}  ocmm-opencode-plugin-1.2.3.tgz\n`,
    `${mismatchedDigest}  deepwork-codex-plugin-1.2.3.tgz\n${mismatchedDigest}  ocmm-opencode-plugin-1.2.3.tgz\n`,
    `${matchingDigest}  deepwork-codex-plugin-1.2.3.tgz\n${mismatchedDigest}  ocmm-opencode-plugin-1.2.3.tgz`,
    `${matchingDigest}  deepwork-codex-plugin-1.2.3.tgz\n${mismatchedDigest}  ocmm-opencode-plugin-1.2.3.tgz\n\n`,
  ]

  for (const body of checksumBodies) {
    const root = makeReleaseRoot()
    try {
      const assetsDir = writeValidStagedAssets(root, "v1.2.3")
      writeFileSync(join(assetsDir, "SHA256SUMS.txt"), body)
      const receipt = validateStaged(root, assetsDir, "v1.2.3")
      assert.equal(receipt.outcome, "FAILED")
      assert.equal(receipt.surfaces.checksums.status, "FAILED")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  const root = makeReleaseRoot()
  try {
    const assetsDir = writeValidStagedAssets(root, "v1.2.3")
    writeFileSync(join(assetsDir, "SHA256SUMS.txt"), Buffer.from([0xff, 0x0a]))
    const receipt = validateStaged(root, assetsDir, "v1.2.3")
    assert.equal(receipt.outcome, "FAILED")
    assert.equal(receipt.surfaces.checksums.status, "FAILED")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
