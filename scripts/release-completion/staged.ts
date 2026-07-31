import { createHash } from "node:crypto"
import { lstatSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import type { ReleaseCompletionReceipt, ReleaseTarget } from "./contracts.ts"
import { ChecksumContractError, checksumFailureDetail, parseChecksums } from "./checksums.ts"
import {
  addFailure,
  finalizeReceipt,
  makeReceipt,
  sameSortedNames,
  setStagedRemoteSurfaces,
  setSurface,
  sortNames,
} from "./receipt.ts"
import { CHECKSUM_NAME, expectedReleaseAssets, parseReleaseTarget } from "./target.ts"

export function validateStagedReleaseAssets(
  root: string,
  assetsDir: string,
  tag: string,
  checkedAt: Date,
): ReleaseCompletionReceipt {
  const preTargetReceipt = makeReceipt({}, checkedAt)
  let target: ReleaseTarget
  try {
    target = parseReleaseTarget(tag, root)
  } catch {
    setStagedRemoteSurfaces(preTargetReceipt)
    addFailure(preTargetReceipt, "identity", "release_target_invalid", "staged release tag or local version source is invalid")
    return finalizeReceipt(preTargetReceipt)
  }

  const receipt = makeReceipt({ target, repository: "local" }, checkedAt)
  setSurface(receipt, "identity", "PASS", "staged_target_validated", "staged release target matches local version sources")
  setStagedRemoteSurfaces(receipt)

  const expectedNames = expectedReleaseAssets(target)
  const expectedPayloads = expectedNames.filter((name) => name !== CHECKSUM_NAME)
  let actualNames: string[]
  try {
    actualNames = readdirSync(assetsDir)
  } catch {
    addFailure(receipt, "releaseAssets", "release_assets_unreadable", "staged assets directory cannot be read")
    return finalizeReceipt(receipt)
  }

  const sizes = new Map<string, number>()
  for (const name of actualNames) {
    let stats: ReturnType<typeof lstatSync>
    try {
      stats = lstatSync(join(assetsDir, name))
    } catch {
      addFailure(receipt, "releaseAssets", "release_asset_unreadable", "staged asset cannot be inspected")
      return finalizeReceipt(receipt)
    }
    if (!stats.isFile()) {
      addFailure(receipt, "releaseAssets", "release_asset_not_regular", "staged assets must be regular top-level files")
      return finalizeReceipt(receipt)
    }
    if (stats.size <= 0) {
      addFailure(receipt, "releaseAssets", "release_asset_empty", "staged assets must be non-empty")
      return finalizeReceipt(receipt)
    }
    sizes.set(name, stats.size)
  }

  if (!sameSortedNames(sortNames(actualNames), expectedNames)) {
    addFailure(receipt, "releaseAssets", "release_asset_set_mismatch", "staged asset names do not match the canonical inventory")
    return finalizeReceipt(receipt)
  }

  const payloadDigests = new Map<string, string>()
  for (const name of expectedPayloads) {
    try {
      payloadDigests.set(name, createHash("sha256").update(readFileSync(join(assetsDir, name))).digest("hex"))
    } catch {
      addFailure(receipt, "releaseAssets", "release_asset_read_failed", "staged payload cannot be read for hashing")
      return finalizeReceipt(receipt)
    }
  }

  receipt.assets = expectedNames.map((name) => ({
    name,
    size: sizes.get(name) ?? 0,
    downloadedSize: null,
    sha256: name === CHECKSUM_NAME ? null : payloadDigests.get(name) ?? null,
  }))
  setSurface(receipt, "releaseAssets", "PASS", "staged_assets_validated", "staged asset inventory is exact and non-empty")

  let checksums: ReturnType<typeof parseChecksums>
  try {
    checksums = parseChecksums(readFileSync(join(assetsDir, CHECKSUM_NAME)), expectedPayloads)
  } catch (error: unknown) {
    if (error instanceof ChecksumContractError) {
      addFailure(receipt, "checksums", error.code, checksumFailureDetail(error.code))
    } else {
      addFailure(receipt, "checksums", "checksum_read_failed", "staged checksum manifest cannot be read")
    }
    return finalizeReceipt(receipt)
  }

  for (const name of expectedPayloads) {
    if (checksums.get(name) !== payloadDigests.get(name)) {
      addFailure(receipt, "checksums", "checksum_digest_mismatch", "staged payload digest does not match its checksum row")
      return finalizeReceipt(receipt)
    }
  }

  setSurface(receipt, "checksums", "PASS", "staged_checksums_validated", "staged checksums cover and match every payload")
  return finalizeReceipt(receipt)
}
