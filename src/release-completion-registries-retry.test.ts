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
  MAIN_TAG,
  makeReleaseRoot,
  LSP_TAG,
  pinnedLspReleaseUrl,
  NPMJS_REGISTRY,
  remoteOptionsWithToken,
  workflowRun,
} from "./release-completion-test-support.test.ts"

test("checkReleaseCompletion completes main releases without registry checks", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const fixture = createHttpFixture(fullMainRoutes(root))
    const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http))

    assert.equal(receipt.outcome, "COMPLETED")
    for (const surface of ["identity", "workflow", "jobs", "githubRelease", "releaseAssets", "checksums", "pinnedLspRelease"] as const) {
      assert.equal(receipt.surfaces[surface].status, "PASS")
    }
    assert.deepEqual(receipt.surfaces.npm, {
      status: "SKIPPED",
      code: "npm_completion_check_disabled",
      detail: "npm registry completion checks are disabled",
    })
    assert.deepEqual(receipt.surfaces.githubPackages, {
      status: "SKIPPED",
      code: "github_packages_completion_check_disabled",
      detail: "GitHub Packages completion checks are disabled",
    })
    assert.deepEqual(receipt.packages, [])
    assert.equal(fixture.requests.some((request) => request.url.startsWith(NPMJS_REGISTRY)), false)
    assert.equal(fixture.requests.some((request) => request.url.startsWith(GITHUB_PACKAGES_REGISTRY)), false)
    assert.equal(JSON.stringify(receipt).includes(GITHUB_TOKEN), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion completes LSP releases without registry checks", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const fixture = createHttpFixture(fullLspRoutes(root))
    const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, LSP_TAG, clock, fixture.http))

    assert.equal(receipt.outcome, "COMPLETED")
    assert.equal(receipt.surfaces.npm.code, "npm_completion_check_disabled")
    assert.equal(receipt.surfaces.npm.status, "SKIPPED")
    assert.equal(receipt.surfaces.githubPackages.status, "SKIPPED")
    assert.equal(receipt.surfaces.pinnedLspRelease.status, "SKIPPED")
    assert.deepEqual(receipt.packages, [])
    assert.equal(fixture.requests.some((request) => request.url.startsWith(NPMJS_REGISTRY)), false)
    assert.equal(fixture.requests.some((request) => request.url.startsWith(GITHUB_PACKAGES_REGISTRY)), false)
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
    assert.equal(receipt.surfaces.npm.status, "SKIPPED")
    assert.equal(receipt.surfaces.pinnedLspRelease.status, "PASS")
    assert.equal(receipt.surfaces.githubPackages.status, "SKIPPED")
    assert.equal(receipt.surfaces.githubPackages.code, "github_packages_completion_check_disabled")
    assert.equal(fixture.requests.some((request) => request.url.startsWith(NPMJS_REGISTRY)), false)
    assert.equal(fixture.requests.some((request) => request.url.startsWith(GITHUB_PACKAGES_REGISTRY)), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
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
    for (const surface of ["githubRelease", "releaseAssets", "checksums", "pinnedLspRelease"] as const) {
      assert.equal(receipt.surfaces[surface].status, "PASS")
    }
    assert.equal(receipt.surfaces.npm.status, "SKIPPED")
    assert.equal(receipt.surfaces.githubPackages.status, "SKIPPED")
    assert.equal(receipt.surfaces.jobs.status, "UNRESOLVED")
    assert.deepEqual(clock.sleeps, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion sends Authorization only to GitHub API", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const fixture = createHttpFixture(fullMainRoutes(root))
    const receipt = await checkReleaseCompletion(remoteOptionsWithToken(root, MAIN_TAG, clock, fixture.http))
    assert.equal(receipt.outcome, "COMPLETED")
    for (const request of fixture.requests) {
      const origin = new URL(request.url).origin
      if (origin === GITHUB_API_ORIGIN) {
        assert.equal(request.headers.Authorization, `Bearer ${GITHUB_TOKEN}`)
      } else {
        assert.equal(request.headers.Authorization, undefined)
      }
    }
    assert.equal(fixture.requests.some((request) => request.url.startsWith(NPMJS_REGISTRY)), false)
    assert.equal(fixture.requests.some((request) => request.url.startsWith(GITHUB_PACKAGES_REGISTRY)), false)
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
