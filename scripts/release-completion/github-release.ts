import { createHash } from "node:crypto"

import { ChecksumContractError, checksumFailureDetail, parseChecksums } from "./checksums.ts"
import type {
  CheckReleaseCompletionOptions,
  ReleaseCompletionReceipt,
  ReleaseTarget,
  SurfaceName,
} from "./contracts.ts"
import { asObject, isPositiveSafeInteger, requestBytes, requestJson, stringField } from "./http.ts"
import { addFailure, markRetryable, sameSortedNames, setSurface, sortNames } from "./receipt.ts"
import { CHECKSUM_NAME, expectedReleaseAssets } from "./target.ts"

type DecodedReleaseMetadata = {
  tagName: string
  draft: boolean
  prerelease: boolean
  assets: unknown[]
}

export type DecodedReleaseAsset = {
  name: string
  size: number
  downloadUrl: string
}

type DecodedReleaseAssets =
  | { kind: "success"; assets: Map<string, DecodedReleaseAsset> }
  | { kind: "failed"; code: "release_asset_duplicate" | "release_asset_set_mismatch" | "release_asset_empty" | "release_asset_invalid" }

export interface ReleaseAssetState {
  current: Map<string, DecodedReleaseAsset> | null
}

function decodeReleaseMetadata(value: unknown): DecodedReleaseMetadata | null {
  const body = asObject(value)
  if (body === null) return null
  const tagName = stringField(body, "tag_name")
  const draft = body.draft
  const prerelease = body.prerelease
  if (tagName === null || typeof draft !== "boolean" || typeof prerelease !== "boolean" || !Array.isArray(body.assets)) {
    return null
  }
  return { tagName, draft, prerelease, assets: [...body.assets] }
}

function decodeReleaseAssets(value: readonly unknown[], expectedNames: readonly string[]): DecodedReleaseAssets {
  const assets = new Map<string, DecodedReleaseAsset>()
  for (const candidate of value) {
    const asset = asObject(candidate)
    if (asset === null) return { kind: "failed", code: "release_asset_invalid" }

    const name = stringField(asset, "name")
    if (name === null || name.length === 0) return { kind: "failed", code: "release_asset_invalid" }
    if (assets.has(name)) return { kind: "failed", code: "release_asset_duplicate" }

    const size = asset.size
    if (size === 0) return { kind: "failed", code: "release_asset_empty" }
    if (!isPositiveSafeInteger(size)) return { kind: "failed", code: "release_asset_invalid" }

    const rawDownloadUrl = stringField(asset, "browser_download_url")
    if (rawDownloadUrl === null) return { kind: "failed", code: "release_asset_invalid" }
    let parsedUrl: URL
    try {
      parsedUrl = new URL(rawDownloadUrl)
    } catch {
      return { kind: "failed", code: "release_asset_invalid" }
    }
    if (parsedUrl.protocol !== "https:") return { kind: "failed", code: "release_asset_invalid" }
    assets.set(name, { name, size, downloadUrl: rawDownloadUrl })
  }

  if (!sameSortedNames(sortNames([...assets.keys()]), expectedNames)) {
    return { kind: "failed", code: "release_asset_set_mismatch" }
  }
  return { kind: "success", assets }
}

export async function observeReleaseProof(
  receipt: ReleaseCompletionReceipt,
  target: ReleaseTarget,
  apiRoot: string,
  options: CheckReleaseCompletionOptions,
  githubRequestHeaders: Readonly<Record<string, string>>,
  retryableSurfaces: Set<SurfaceName>,
  releaseAssets: ReleaseAssetState,
): Promise<void> {
  if (receipt.surfaces.githubRelease.status === "UNRESOLVED") {
    const result = await requestJson(options.http, {
      url: `${apiRoot}/releases/tags/${encodeURIComponent(target.tag)}`,
      headers: githubRequestHeaders,
    }, "github-api", options.clock)
    if (result.kind === "retry") {
      markRetryable(receipt, retryableSurfaces, "githubRelease", "github_release_unresolved", "GitHub Release could not be proven before the deadline")
      return
    }
    if (result.kind === "failed") {
      addFailure(receipt, "githubRelease", "github_release_response_invalid", "GitHub Release response is invalid")
      return
    }
    const release = decodeReleaseMetadata(result.value)
    if (release === null) {
      addFailure(receipt, "githubRelease", "github_release_response_invalid", "GitHub Release response is invalid")
      return
    }
    receipt.prerelease = release.prerelease
    if (release.tagName !== target.tag) {
      addFailure(receipt, "githubRelease", "release_tag_mismatch", "GitHub Release tag does not match the bound release tag")
      return
    }
    if (release.draft) {
      addFailure(receipt, "githubRelease", "release_is_draft", "GitHub Release must not be a draft")
      return
    }
    const decodedAssets = decodeReleaseAssets(release.assets, expectedReleaseAssets(target))
    if (decodedAssets.kind === "failed") {
      addFailure(receipt, "releaseAssets", decodedAssets.code, "GitHub Release assets violate the release asset contract")
      return
    }
    releaseAssets.current = decodedAssets.assets
    setSurface(receipt, "githubRelease", "PASS", "github_release_validated", "GitHub Release metadata matches the bound tag and is non-draft")
    retryableSurfaces.delete("githubRelease")
  }

  if (receipt.surfaces.githubRelease.status !== "PASS" || releaseAssets.current === null) return
  if (receipt.surfaces.releaseAssets.status !== "UNRESOLVED" && receipt.surfaces.checksums.status !== "UNRESOLVED") return

  const expectedNames = expectedReleaseAssets(target)
  const expectedPayloads = expectedNames.filter((name) => name !== CHECKSUM_NAME)
  const checksumAsset = releaseAssets.current.get(CHECKSUM_NAME)
  if (checksumAsset === undefined) {
    addFailure(receipt, "releaseAssets", "release_asset_set_mismatch", "GitHub Release assets violate the release asset contract")
    return
  }
  const checksumDownload = await requestBytes(options.http, { url: checksumAsset.downloadUrl, headers: {} }, "release-asset", options.clock)
  if (checksumDownload.kind === "retry") {
    markRetryable(receipt, retryableSurfaces, "releaseAssets", "release_assets_unresolved", "GitHub Release assets could not be proven before the deadline")
    return
  }
  if (checksumDownload.kind === "failed") {
    addFailure(receipt, "releaseAssets", "release_asset_response_invalid", "GitHub Release asset response is invalid")
    return
  }
  if (checksumDownload.bytes.byteLength !== checksumAsset.size) {
    addFailure(receipt, "releaseAssets", "release_asset_size_mismatch", "GitHub Release asset size does not match downloaded bytes")
    return
  }

  let checksums: ReturnType<typeof parseChecksums>
  try {
    checksums = parseChecksums(checksumDownload.bytes, expectedPayloads)
  } catch (error: unknown) {
    if (error instanceof ChecksumContractError) addFailure(receipt, "checksums", error.code, checksumFailureDetail(error.code))
    else addFailure(receipt, "checksums", "checksum_read_failed", "GitHub Release checksum manifest cannot be read")
    return
  }

  const downloadedSizes = new Map<string, number>([[CHECKSUM_NAME, checksumDownload.bytes.byteLength]])
  const payloadDigests = new Map<string, string>()
  for (const name of expectedPayloads) {
    const asset = releaseAssets.current.get(name)
    if (asset === undefined) {
      addFailure(receipt, "releaseAssets", "release_asset_set_mismatch", "GitHub Release assets violate the release asset contract")
      return
    }
    const download = await requestBytes(options.http, { url: asset.downloadUrl, headers: {} }, "release-asset", options.clock)
    if (download.kind === "retry") {
      markRetryable(receipt, retryableSurfaces, "releaseAssets", "release_assets_unresolved", "GitHub Release assets could not be proven before the deadline")
      return
    }
    if (download.kind === "failed") {
      addFailure(receipt, "releaseAssets", "release_asset_response_invalid", "GitHub Release asset response is invalid")
      return
    }
    if (download.bytes.byteLength !== asset.size) {
      addFailure(receipt, "releaseAssets", "release_asset_size_mismatch", "GitHub Release asset size does not match downloaded bytes")
      return
    }
    const digest = createHash("sha256").update(download.bytes).digest("hex")
    if (checksums.get(name) !== digest) {
      addFailure(receipt, "checksums", "checksum_digest_mismatch", "GitHub Release asset digest does not match its checksum row")
      return
    }
    downloadedSizes.set(name, download.bytes.byteLength)
    payloadDigests.set(name, digest)
  }

  receipt.assets = expectedNames.map((name) => {
    const asset = releaseAssets.current?.get(name)
    return {
      name,
      size: asset?.size ?? 0,
      downloadedSize: downloadedSizes.get(name) ?? null,
      sha256: name === CHECKSUM_NAME ? null : payloadDigests.get(name) ?? null,
    }
  })
  setSurface(receipt, "releaseAssets", "PASS", "release_assets_validated", "GitHub Release assets are exact and match downloaded byte sizes")
  setSurface(receipt, "checksums", "PASS", "release_checksums_validated", "GitHub Release checksums cover and match every payload")
  retryableSurfaces.delete("releaseAssets")
  retryableSurfaces.delete("checksums")
}
