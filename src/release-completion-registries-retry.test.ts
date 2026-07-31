import assert from "node:assert/strict"
import { rmSync } from "node:fs"
import { test } from "node:test"

import { checkReleaseCompletion } from "../scripts/check-release-completion.ts"
import {
  createHttpFixture,
  FakeClock,
  fixedRunUrl,
  fullLspRoutes,
  fullMainRoutes,
  GITHUB_API_ORIGIN,
  GITHUB_PACKAGES_REGISTRY,
  GITHUB_TOKEN,
  HEAD_SHA,
  jsonResponse,
  lspPlatformPackagesFixture,
  MAIN_TAG,
  makeReleaseRoot,
  LSP_TAG,
  pinnedLspReleaseUrl,
  registryManifest,
  registryMetadataUrl,
  NPMJS_REGISTRY,
  remoteOptions,
  remoteOptionsWithToken,
  receiptSurfaceKeys,
  tagRefUrl,
  workflowRun,
} from "./release-completion-test-support.test.ts"

test("checkReleaseCompletion completes every required main push surface", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const fixture = createHttpFixture(fullMainRoutes(root))
    const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http))

    assert.equal(receipt.outcome, "COMPLETED")
    for (const surface of receiptSurfaceKeys) assert.equal(receipt.surfaces[surface].status, "PASS")
    assert.deepEqual(receipt.packages, [
      { registry: "npmjs", name: "ocmm", version: "1.2.3", status: "PASS" },
      { registry: "github", name: "@octo/ocmm", version: "1.2.3", status: "PASS" },
    ])
    assert.equal(JSON.stringify(receipt).includes(GITHUB_TOKEN), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion completes eight LSP npm packages and skips main-only surfaces", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const fixture = createHttpFixture(fullLspRoutes(root))
    const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, LSP_TAG, clock, fixture.http))

    assert.equal(receipt.outcome, "COMPLETED")
    assert.equal(receipt.surfaces.npm.status, "PASS")
    assert.equal(receipt.surfaces.githubPackages.status, "SKIPPED")
    assert.equal(receipt.surfaces.pinnedLspRelease.status, "SKIPPED")
    assert.deepEqual(receipt.packages, lspPlatformPackagesFixture().map((platform) => ({
      registry: "npmjs" as const,
      name: platform.packageName,
      version: "4.5.6",
      status: "PASS" as const,
    })).sort((left, right) => left.name.localeCompare(right.name)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion skips GitHub Packages for a bound main workflow_dispatch run", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const fixture = createHttpFixture(fullMainRoutes(root, "workflow_dispatch"))
    const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http, 42))

    assert.equal(receipt.outcome, "COMPLETED")
    assert.equal(receipt.surfaces.npm.status, "PASS")
    assert.equal(receipt.surfaces.pinnedLspRelease.status, "PASS")
    assert.equal(receipt.surfaces.githubPackages.status, "SKIPPED")
    assert.equal(fixture.requests.some((request) => request.url.startsWith(GITHUB_PACKAGES_REGISTRY)), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion fails a registry manifest name or version mismatch", async () => {
  for (const manifest of [
    registryManifest("other", "1.2.3"),
    { versions: { "1.2.3": { name: "ocmm", version: "9.9.9" } } },
  ] as const) {
    const root = makeReleaseRoot()
    try {
      const clock = new FakeClock()
      const routes = fullMainRoutes(root)
      routes[registryMetadataUrl(NPMJS_REGISTRY, "ocmm")] = [jsonResponse(200, manifest)]
      const fixture = createHttpFixture(routes)
      const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http))
      assert.equal(receipt.outcome, "FAILED")
      assert.equal(receipt.surfaces.npm.status, "FAILED")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test("checkReleaseCompletion fails a draft pinned LSP Release", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const routes = fullMainRoutes(root)
    routes[pinnedLspReleaseUrl()] = [jsonResponse(200, { tag_name: "ocmm-lsp-v4.5.6", draft: true, assets: [] })]
    const fixture = createHttpFixture(routes)
    const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http))
    assert.equal(receipt.outcome, "FAILED")
    assert.equal(receipt.surfaces.pinnedLspRelease.status, "FAILED")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion retries 404 429 5xx and network errors then completes", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const routes = fullMainRoutes(root)
    routes[registryMetadataUrl(NPMJS_REGISTRY, "ocmm")] = [
      jsonResponse(404, {}),
      jsonResponse(429, {}),
      jsonResponse(500, {}),
      { error: new Error("network-secret-sentinel") },
      jsonResponse(200, registryManifest("ocmm", "1.2.3")),
    ]
    const fixture = createHttpFixture(routes)
    const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http))
    assert.equal(receipt.outcome, "COMPLETED")
    assert.deepEqual(clock.sleeps, [10, 10, 10, 10])
    assert.equal(JSON.stringify(receipt).includes("network-secret-sentinel"), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion returns UNRESOLVED when retryable propagation reaches the deadline", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const routes = fullMainRoutes(root)
    routes[tagRefUrl(MAIN_TAG)] = Array.from({ length: 8 }, () => jsonResponse(200, { object: { type: "commit", sha: HEAD_SHA } }))
    routes[registryMetadataUrl(NPMJS_REGISTRY, "ocmm")] = Array.from({ length: 4 }, () => jsonResponse(404, {}))
    const fixture = createHttpFixture(routes)
    const receipt = await checkReleaseCompletion({
      ...remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http),
      deadlineMs: 25,
      pollIntervalMs: 10,
    })
    assert.equal(receipt.outcome, "UNRESOLVED")
    assert.equal(receipt.surfaces.npm.status, "UNRESOLVED")
    assert.deepEqual(clock.sleeps, [10, 10, 5])
    assert.equal(clock.now().getTime(), Date.parse("2027-01-15T08:00:00.000Z") + 25)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion fails a permanent 400 without sleeping", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const routes = fullMainRoutes(root)
    routes[registryMetadataUrl(NPMJS_REGISTRY, "ocmm")] = [jsonResponse(400, {})]
    const fixture = createHttpFixture(routes)
    const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http))
    assert.equal(receipt.outcome, "FAILED")
    assert.deepEqual(clock.sleeps, [])
    assert.equal(fixture.requests.filter((request) => request.url === registryMetadataUrl(NPMJS_REGISTRY, "ocmm")).length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion records independent publication surfaces after workflow failure", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const routes = fullMainRoutes(root)
    routes[fixedRunUrl(42)] = [jsonResponse(200, workflowRun(MAIN_TAG, HEAD_SHA, 42, 3, "completed", "failure"))]
    const fixture = createHttpFixture(routes)
    const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http))
    assert.equal(receipt.outcome, "FAILED")
    assert.equal(receipt.surfaces.workflow.code, "workflow_not_success")
    for (const surface of ["githubRelease", "releaseAssets", "checksums", "npm", "githubPackages", "pinnedLspRelease"] as const) {
      assert.equal(receipt.surfaces[surface].status, "PASS")
    }
    assert.equal(receipt.surfaces.jobs.status, "UNRESOLVED")
    assert.deepEqual(clock.sleeps, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion returns UNRESOLVED when GitHub Packages token is missing", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const fixture = createHttpFixture(fullMainRoutes(root))
    const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http))
    assert.equal(receipt.outcome, "UNRESOLVED")
    assert.equal(receipt.surfaces.githubPackages.code, "github_packages_token_missing")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion returns UNRESOLVED when GitHub Packages permission is unproven", async () => {
  for (const status of [401, 403] as const) {
    const root = makeReleaseRoot()
    try {
      const clock = new FakeClock()
      const routes = fullMainRoutes(root)
      routes[registryMetadataUrl(GITHUB_PACKAGES_REGISTRY, "@octo/ocmm")] = [jsonResponse(status, { message: "permission-body-sentinel" })]
      const fixture = createHttpFixture(routes)
      const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http))
      assert.equal(receipt.outcome, "UNRESOLVED")
      assert.equal(receipt.surfaces.githubPackages.code, "github_packages_permission_unproven")
      assert.deepEqual(clock.sleeps, [])
      assert.equal(JSON.stringify(receipt).includes("permission-body-sentinel"), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test("checkReleaseCompletion retries a 200 registry response without the exact version", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const routes = fullMainRoutes(root)
    routes[registryMetadataUrl(NPMJS_REGISTRY, "ocmm")] = [
      jsonResponse(200, { versions: {}, "dist-tags": { latest: "1.2.3" } }),
      jsonResponse(200, registryManifest("ocmm", "1.2.3")),
    ]
    const fixture = createHttpFixture(routes)
    const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http))
    assert.equal(receipt.outcome, "COMPLETED")
    assert.deepEqual(clock.sleeps, [10])
    assert.equal(fixture.requests.filter((request) => request.url === registryMetadataUrl(NPMJS_REGISTRY, "ocmm")).length, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion fails unexpected HTTP statuses without retry", async () => {
  for (const status of [204, 302] as const) {
    const root = makeReleaseRoot()
    try {
      const clock = new FakeClock()
      const routes = fullMainRoutes(root)
      routes[registryMetadataUrl(NPMJS_REGISTRY, "ocmm")] = [jsonResponse(status, {})]
      const fixture = createHttpFixture(routes)
      const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http))
      assert.equal(receipt.outcome, "FAILED")
      assert.deepEqual(clock.sleeps, [])
      assert.equal(fixture.requests.filter((request) => request.url === registryMetadataUrl(NPMJS_REGISTRY, "ocmm")).length, 1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test("checkReleaseCompletion scopes Authorization to GitHub API and Packages origins", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const fixture = createHttpFixture(fullMainRoutes(root))
    const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http))
    assert.equal(receipt.outcome, "COMPLETED")
    for (const request of fixture.requests) {
      const origin = new URL(request.url).origin
      if (origin === GITHUB_API_ORIGIN || origin === GITHUB_PACKAGES_REGISTRY) {
        assert.equal(request.headers.Authorization, `Bearer ${GITHUB_TOKEN}`)
      } else {
        assert.equal(request.headers.Authorization, undefined)
      }
    }
    assert.equal(JSON.stringify(receipt).includes(GITHUB_TOKEN), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion retries header-proven GitHub rate-limit 403 responses", async () => {
  const headerCases = [
    { "retry-after": "1" },
    { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.parse("2027-01-15T08:00:00.000Z") / 1000) + 60) },
  ] as const
  for (const headers of headerCases) {
    const root = makeReleaseRoot()
    try {
      const clock = new FakeClock()
      const routes = fullMainRoutes(root)
      routes[pinnedLspReleaseUrl()] = [
        jsonResponse(403, { message: "rate-limit-body-sentinel" }, headers),
        jsonResponse(200, { tag_name: "ocmm-lsp-v4.5.6", draft: false, assets: [] }),
      ]
      const fixture = createHttpFixture(routes)
      const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http))
      assert.equal(receipt.outcome, "COMPLETED")
      assert.deepEqual(clock.sleeps, [10])
      assert.equal(JSON.stringify(receipt).includes("rate-limit-body-sentinel"), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test("checkReleaseCompletion fails a GitHub permission 403 without credible rate-limit headers", async () => {
  const malformedHeaders: ReadonlyArray<Readonly<Record<string, string>>> = [
    {},
    { "x-ratelimit-remaining": "0" },
    { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1" },
    { "retry-after": "not-a-number" },
    { "retry-after": "+1" },
    { "retry-after": "1, 2" },
  ]
  for (const headers of malformedHeaders) {
    const root = makeReleaseRoot()
    try {
      const clock = new FakeClock()
      const routes = fullMainRoutes(root)
      routes[pinnedLspReleaseUrl()] = [jsonResponse(403, {
        message: "body-only-rate-limit-sentinel",
        response_secret: "response-secret-sentinel",
      }, { ...headers, "x-test-secret": "header-secret-sentinel" })]
      const fixture = createHttpFixture(routes)
      const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http))
      assert.equal(receipt.outcome, "FAILED")
      assert.equal(receipt.surfaces.pinnedLspRelease.status, "FAILED")
      assert.deepEqual(clock.sleeps, [])
      assert.equal(fixture.requests.filter((request) => request.url === pinnedLspReleaseUrl()).length, 1)
      const serialized = JSON.stringify(receipt)
      for (const sentinel of ["body-only-rate-limit-sentinel", "response-secret-sentinel", "header-secret-sentinel", GITHUB_TOKEN]) {
        assert.equal(serialized.includes(sentinel), false)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})
