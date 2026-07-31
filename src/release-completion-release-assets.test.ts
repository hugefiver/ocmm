import assert from "node:assert/strict"
import { rmSync } from "node:fs"
import { test } from "node:test"

import { checkReleaseCompletion } from "../scripts/check-release-completion.ts"
import {
  combineRoutes,
  createHttpFixture,
  FakeClock,
  HEAD_SHA,
  lightweightTagRoutes,
  lspJobs,
  LSP_TAG,
  mainJobs,
  MAIN_TAG,
  makeReleaseRoot,
  makeRemoteReleaseFixture,
  receiptSurfaceKeys,
  releaseAssetUrl,
  releaseUrl,
  replaceRemoteReleaseAssetBytes,
  remoteOptions,
  sha256,
  successfulWorkflowRoutes,
  tagRefUrl,
  type RemoteReleaseFixture,
} from "./release-completion-test-support.test.ts"

test("checkReleaseCompletion verifies exact main Release bytes and checksums", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const remote = makeRemoteReleaseFixture(root, MAIN_TAG)
    const fixture = createHttpFixture(combineRoutes(
      lightweightTagRoutes(MAIN_TAG, HEAD_SHA, 3),
      successfulWorkflowRoutes(MAIN_TAG, 42, 3, mainJobs),
      remote.routes,
    ))

    const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http))

    assert.deepEqual(receipt.assets.map((asset) => asset.name), remote.names)
    assert.equal(receipt.assets.length, 3)
    assert.equal(receipt.prerelease, true)
    assert.equal(receipt.surfaces.githubRelease.status, "PASS")
    assert.equal(receipt.surfaces.releaseAssets.status, "PASS")
    assert.equal(receipt.surfaces.checksums.status, "PASS")
    for (const asset of receipt.assets) {
      assert.equal(asset.size > 0, true)
      assert.equal(asset.downloadedSize !== null && asset.downloadedSize > 0, true)
      assert.equal(asset.sha256, asset.name === "SHA256SUMS.txt" ? null : sha256(remote.bytes.get(asset.name) ?? new Uint8Array()))
    }
    assert.equal(receipt.assets.filter((asset) => asset.sha256 !== null).length, 2)
    assert.equal(remote.release.draft, false)
    assert.deepEqual(Object.keys(receipt.surfaces), receiptSurfaceKeys)
    const releaseRequestIndex = fixture.requests.findIndex((request) => request.url === releaseUrl(MAIN_TAG))
    assert.equal(releaseRequestIndex > 0, true)
    const releaseRequest = fixture.requests[releaseRequestIndex]
    assert.equal(releaseRequest?.headers.Accept, "application/vnd.github+json")
    assert.equal(releaseRequest?.headers["X-GitHub-Api-Version"], "2022-11-28")
    assert.equal(releaseRequest?.headers["User-Agent"], "ocmm-release-completion")
    assert.equal(fixture.requests.slice(0, releaseRequestIndex).filter((request) => request.url === tagRefUrl(MAIN_TAG)).length, 1)
    assert.deepEqual(
      fixture.requests
        .filter((request) => remote.names.some((name) => request.url === releaseAssetUrl(name)))
        .map((request) => remote.names.find((name) => request.url === releaseAssetUrl(name))),
      ["SHA256SUMS.txt", ...remote.payloads],
    )
    const serialized = JSON.stringify(receipt)
    assert.equal(serialized.includes("downloads.example.invalid"), false)
    assert.equal(serialized.includes("remote-release-"), false)
    assert.equal(serialized.includes("release-response-secret"), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion verifies all seventeen LSP Release assets", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const remote = makeRemoteReleaseFixture(root, LSP_TAG)
    const fixture = createHttpFixture(combineRoutes(
      lightweightTagRoutes(LSP_TAG, HEAD_SHA, 3),
      successfulWorkflowRoutes(LSP_TAG, 77, 2, lspJobs),
      remote.routes,
    ))

    const receipt = await checkReleaseCompletion(remoteOptions(root, LSP_TAG, clock, fixture.http))

    assert.equal(remote.names.length, 17)
    assert.deepEqual(receipt.assets.map((asset) => asset.name), remote.names)
    assert.equal(receipt.assets.length, 17)
    assert.equal(receipt.assets.filter((asset) => asset.sha256 !== null).length, 16)
    assert.equal(receipt.surfaces.githubRelease.status, "PASS")
    assert.equal(receipt.surfaces.releaseAssets.status, "PASS")
    assert.equal(receipt.surfaces.checksums.status, "PASS")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion reports exact Release failure surfaces and codes", async () => {
  const failures: ReadonlyArray<{
    mutate: (fixture: RemoteReleaseFixture) => void
    surface: "githubRelease" | "releaseAssets" | "checksums"
    code: string
  }> = [
    {
      mutate: (fixture) => { fixture.release.tag_name = "v9.9.9" },
      surface: "githubRelease",
      code: "release_tag_mismatch",
    },
    {
      mutate: (fixture) => { fixture.release.draft = true },
      surface: "githubRelease",
      code: "release_is_draft",
    },
    {
      mutate: (fixture) => {
        fixture.release.assets = fixture.release.assets.filter((asset) => asset.name !== fixture.payloads[0])
      },
      surface: "releaseAssets",
      code: "release_asset_set_mismatch",
    },
    {
      mutate: (fixture) => {
        const name = "unexpected.tgz"
        fixture.release.assets.push({ name, size: 1, browser_download_url: releaseAssetUrl(name) })
        fixture.routes[releaseAssetUrl(name)] = [{ status: 200, bytes: Buffer.from("x") }]
      },
      surface: "releaseAssets",
      code: "release_asset_set_mismatch",
    },
    {
      mutate: (fixture) => {
        const duplicate = fixture.release.assets.find((asset) => asset.name === fixture.payloads[0])
        assert.ok(duplicate)
        fixture.release.assets.push({ ...duplicate })
      },
      surface: "releaseAssets",
      code: "release_asset_duplicate",
    },
    {
      mutate: (fixture) => {
        const asset = fixture.release.assets.find((candidate) => candidate.name === fixture.payloads[0])
        assert.ok(asset)
        asset.size = 0
      },
      surface: "releaseAssets",
      code: "release_asset_empty",
    },
    {
      mutate: (fixture) => {
        const asset = fixture.release.assets.find((candidate) => candidate.name === fixture.payloads[0])
        assert.ok(asset)
        asset.size += 1
      },
      surface: "releaseAssets",
      code: "release_asset_size_mismatch",
    },
    {
      mutate: (fixture) => replaceRemoteReleaseAssetBytes(fixture, "SHA256SUMS.txt", Buffer.from("not-a-checksum\n")),
      surface: "checksums",
      code: "checksum_format_invalid",
    },
    {
      mutate: (fixture) => {
        const payload = fixture.payloads[0]
        assert.ok(payload)
        replaceRemoteReleaseAssetBytes(fixture, "SHA256SUMS.txt", Buffer.from(`${sha256(fixture.bytes.get(payload) ?? new Uint8Array())}  ${payload}\n`))
      },
      surface: "checksums",
      code: "checksum_coverage_mismatch",
    },
    {
      mutate: (fixture) => {
        const payload = fixture.payloads[0]
        assert.ok(payload)
        const source = fixture.bytes.get(payload)
        assert.ok(source)
        fixture.routes[releaseAssetUrl(payload)] = [{ status: 200, bytes: Buffer.alloc(source.byteLength, 0x78) }]
      },
      surface: "checksums",
      code: "checksum_digest_mismatch",
    },
  ]

  for (const failure of failures) {
    const root = makeReleaseRoot()
    try {
      const clock = new FakeClock()
      const remote = makeRemoteReleaseFixture(root, MAIN_TAG)
      failure.mutate(remote)
      const fixture = createHttpFixture(combineRoutes(
        lightweightTagRoutes(MAIN_TAG, HEAD_SHA, 3),
        successfulWorkflowRoutes(MAIN_TAG, 42, 3, mainJobs),
        remote.routes,
      ))

      const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http))

      assert.equal(receipt.outcome, "FAILED")
      assert.equal(receipt.surfaces[failure.surface].status, "FAILED")
      assert.equal(receipt.surfaces[failure.surface].code, failure.code)
      assert.deepEqual(Object.keys(receipt.surfaces), receiptSurfaceKeys)
      const serialized = JSON.stringify(receipt)
      assert.equal(serialized.includes("downloads.example.invalid"), false)
      assert.equal(serialized.includes("remote-release-"), false)
      assert.equal(serialized.includes("release-response-secret"), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})
