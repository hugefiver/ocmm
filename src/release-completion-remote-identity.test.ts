import assert from "node:assert/strict"
import { rmSync } from "node:fs"
import { test } from "node:test"

import { checkReleaseCompletion } from "../scripts/check-release-completion.ts"
import {
  annotatedTagRoutes,
  combineRoutes,
  createHttpFixture,
  discoveryUrl,
  FakeClock,
  fixedRunUrl,
  HEAD_SHA,
  jsonResponse,
  jobsUrl,
  lightweightTagRoutes,
  lspJobs,
  LSP_TAG,
  mainJobs,
  MAIN_TAG,
  makeReleaseRoot,
  makeRemoteReleaseFixture,
  MOVED_HEAD_SHA,
  pinnedLspReleaseUrl,
  remoteOptions,
  tagRefUrl,
  workflowRun,
} from "./release-completion-test-support.test.ts"

test("checkReleaseCompletion peels an annotated tag and binds one main push run once", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const remote = makeRemoteReleaseFixture(root, MAIN_TAG)
    const fixture = createHttpFixture(combineRoutes(
      annotatedTagRoutes(MAIN_TAG, HEAD_SHA, 3),
      {
        [discoveryUrl(MAIN_TAG)]: [jsonResponse(200, {
          total_count: 1,
          workflow_runs: [workflowRun(MAIN_TAG, HEAD_SHA, 42, 3)],
        })],
        [fixedRunUrl(42)]: [jsonResponse(200, workflowRun(MAIN_TAG, HEAD_SHA, 42, 3))],
        [jobsUrl(42, 3)]: [jsonResponse(200, { total_count: mainJobs.length, jobs: mainJobs })],
      },
      remote.routes,
      {
        [pinnedLspReleaseUrl()]: [jsonResponse(200, { tag_name: "ocmm-lsp-v4.5.6", draft: false, assets: [] })],
      },
    ))

    const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http))

    assert.equal(receipt.checkedAt, "2027-01-15T08:00:00.000Z")
    assert.equal(receipt.outcome, "COMPLETED")
    assert.equal(receipt.headSha, HEAD_SHA)
    assert.equal(receipt.runId, 42)
    assert.equal(receipt.runAttempt, 3)
    assert.equal(receipt.runUrl, "https://github.com/octo/ocmm/actions/runs/42")
    assert.equal(receipt.surfaces.identity.status, "PASS")
    assert.equal(receipt.surfaces.workflow.status, "PASS")
    assert.equal(receipt.surfaces.jobs.status, "PASS")
    assert.equal(receipt.surfaces.githubRelease.status, "PASS")
    assert.deepEqual(receipt.jobs, [...mainJobs].sort((left, right) => left.name.localeCompare(right.name)))
    assert.equal(fixture.requests.filter((request) => request.url === discoveryUrl(MAIN_TAG)).length, 1)
    assert.equal(fixture.requests.filter((request) => request.url === tagRefUrl(MAIN_TAG)).length, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion accepts a lightweight LSP tag and all eight native jobs", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const remote = makeRemoteReleaseFixture(root, LSP_TAG)
    const fixture = createHttpFixture(combineRoutes(
      lightweightTagRoutes(LSP_TAG, HEAD_SHA, 3),
      {
        [discoveryUrl(LSP_TAG)]: [jsonResponse(200, {
          total_count: 1,
          workflow_runs: [workflowRun(LSP_TAG, HEAD_SHA, 77, 2)],
        })],
        [fixedRunUrl(77)]: [jsonResponse(200, workflowRun(LSP_TAG, HEAD_SHA, 77, 2))],
        [jobsUrl(77, 2)]: [jsonResponse(200, { total_count: lspJobs.length, jobs: lspJobs })],
      },
      remote.routes,
    ))

    const receipt = await checkReleaseCompletion(remoteOptions(root, LSP_TAG, clock, fixture.http))

    assert.equal(receipt.outcome, "COMPLETED")
    assert.equal(receipt.surfaces.identity.status, "PASS")
    assert.equal(receipt.surfaces.workflow.status, "PASS")
    assert.equal(receipt.surfaces.jobs.status, "PASS")
    assert.equal(receipt.jobs.length, 13)
    assert.deepEqual(
      receipt.jobs.map((job) => job.name),
      [...lspJobs].map((job) => job.name).sort((left, right) => left.localeCompare(right)),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion retries run discovery and a nonterminal fixed run without rebinding", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const remote = makeRemoteReleaseFixture(root, MAIN_TAG)
    const fixture = createHttpFixture(combineRoutes(
      lightweightTagRoutes(MAIN_TAG, HEAD_SHA, 5),
      {
        [discoveryUrl(MAIN_TAG)]: [
          jsonResponse(200, { total_count: 0, workflow_runs: [] }),
          jsonResponse(200, { total_count: 1, workflow_runs: [workflowRun(MAIN_TAG, HEAD_SHA, 42, 3)] }),
        ],
        [fixedRunUrl(42)]: [
          jsonResponse(200, workflowRun(MAIN_TAG, HEAD_SHA, 42, 3, "in_progress", null)),
          jsonResponse(200, workflowRun(MAIN_TAG, HEAD_SHA, 42, 3)),
        ],
        [jobsUrl(42, 3)]: [jsonResponse(200, { total_count: mainJobs.length, jobs: mainJobs })],
      },
      remote.routes,
      {
        [pinnedLspReleaseUrl()]: [jsonResponse(200, { tag_name: "ocmm-lsp-v4.5.6", draft: false, assets: [] })],
      },
    ))

    const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http))

    assert.equal(receipt.surfaces.identity.status, "PASS")
    assert.equal(receipt.surfaces.workflow.status, "PASS")
    assert.equal(receipt.runId, 42)
    assert.equal(receipt.runAttempt, 3)
    assert.deepEqual(clock.sleeps, [10, 10])
    assert.equal(fixture.requests.filter((request) => request.url === discoveryUrl(MAIN_TAG)).length, 2)
    assert.equal(fixture.requests.filter((request) => request.url === fixedRunUrl(42)).length, 2)
    assert.equal(fixture.requests.filter((request) => request.url === jobsUrl(42, 3)).length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion fails when a tag moves after binding without rebinding", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const fixture = createHttpFixture({
      [tagRefUrl(MAIN_TAG)]: [
        jsonResponse(200, { object: { type: "commit", sha: HEAD_SHA } }),
        jsonResponse(200, { object: { type: "commit", sha: MOVED_HEAD_SHA } }),
      ],
      [discoveryUrl(MAIN_TAG)]: [jsonResponse(200, {
        total_count: 1,
        workflow_runs: [workflowRun(MAIN_TAG, HEAD_SHA, 42, 3)],
      })],
      [fixedRunUrl(42)]: [jsonResponse(200, workflowRun(MAIN_TAG, HEAD_SHA, 42, 3, "in_progress", null))],
    })

    const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http))

    assert.equal(receipt.outcome, "FAILED")
    assert.equal(receipt.surfaces.identity.code, "tag_head_changed")
    assert.equal(receipt.headSha, HEAD_SHA)
    assert.equal(receipt.runId, 42)
    assert.equal(receipt.runAttempt, 3)
    assert.equal(fixture.requests.filter((request) => request.url === discoveryUrl(MAIN_TAG)).length, 1)
    assert.equal(fixture.requests.filter((request) => request.url === fixedRunUrl(42)).length, 1)
    assert.equal(receipt.surfaces.jobs.status, "UNRESOLVED")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion fails tag head path branch event and fixed run identity mismatches", async () => {
  const mutations: ReadonlyArray<Record<string, unknown>> = [
    { id: 99 },
    { head_sha: MOVED_HEAD_SHA },
    { path: ".github/workflows/other.yml" },
    { head_branch: "other-tag" },
    { event: "schedule" },
  ]

  for (const mutation of mutations) {
    const root = makeReleaseRoot()
    try {
      const clock = new FakeClock()
      const fixture = createHttpFixture(combineRoutes(
        lightweightTagRoutes(MAIN_TAG, HEAD_SHA, 1),
        {
          [fixedRunUrl(42)]: [jsonResponse(200, { ...workflowRun(MAIN_TAG, HEAD_SHA, 42, 3), ...mutation })],
        },
      ))

      const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http, 42))

      assert.equal(receipt.outcome, "FAILED")
      assert.equal(receipt.surfaces.identity.code, "run_identity_mismatch")
      assert.equal(receipt.runId, 42)
      assert.equal(receipt.surfaces.workflow.status, "UNRESOLVED")
      assert.equal(fixture.requests.filter((request) => request.url === discoveryUrl(MAIN_TAG)).length, 0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test("checkReleaseCompletion binds event identity for auto-discovered and explicit runs", async () => {
  await (async () => {
    const root = makeReleaseRoot()
    try {
      const clock = new FakeClock()
      const fixture = createHttpFixture(combineRoutes(
        lightweightTagRoutes(MAIN_TAG, HEAD_SHA, 1),
        {
          [discoveryUrl(MAIN_TAG)]: [jsonResponse(200, {
            total_count: 1,
            workflow_runs: [workflowRun(MAIN_TAG, HEAD_SHA, 42, 3)],
          })],
          [fixedRunUrl(42)]: [jsonResponse(200, {
            ...workflowRun(MAIN_TAG, HEAD_SHA, 42, 3),
            event: "workflow_dispatch",
          })],
        },
      ))

      const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http))

      assert.equal(receipt.outcome, "FAILED")
      assert.equal(receipt.surfaces.identity.code, "run_identity_mismatch")
      assert.equal(fixture.requests.some((request) => request.url.includes("/attempts/")), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })()

  await (async () => {
    const root = makeReleaseRoot()
    try {
      const clock = new FakeClock()
      const fixture = createHttpFixture(combineRoutes(
        lightweightTagRoutes(MAIN_TAG, HEAD_SHA, 2),
        {
          [fixedRunUrl(42)]: [
            jsonResponse(200, {
              ...workflowRun(MAIN_TAG, HEAD_SHA, 42, 3, "in_progress", null),
              event: "workflow_dispatch",
            }),
            jsonResponse(200, workflowRun(MAIN_TAG, HEAD_SHA, 42, 3)),
          ],
        },
      ))

      const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http, 42))

      assert.equal(receipt.outcome, "FAILED")
      assert.equal(receipt.surfaces.identity.code, "run_identity_mismatch")
      assert.equal(receipt.runId, 42)
      assert.equal(receipt.runAttempt, 3)
      assert.equal(fixture.requests.some((request) => request.url.includes("/attempts/")), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })()

  await (async () => {
    const root = makeReleaseRoot()
    try {
      const clock = new FakeClock()
      const remote = makeRemoteReleaseFixture(root, MAIN_TAG)
      const fixedRun = {
        ...workflowRun(MAIN_TAG, HEAD_SHA, 42, 3),
        event: "workflow_dispatch",
      }
      const fixture = createHttpFixture(combineRoutes(
        lightweightTagRoutes(MAIN_TAG, HEAD_SHA, 3),
        {
          [fixedRunUrl(42)]: [jsonResponse(200, fixedRun)],
          [jobsUrl(42, 3)]: [jsonResponse(200, { total_count: mainJobs.length, jobs: mainJobs })],
        },
        remote.routes,
      ))

      const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http, 42))

      assert.equal(receipt.outcome, "UNRESOLVED")
      assert.equal(receipt.surfaces.identity.status, "PASS")
      assert.equal(receipt.surfaces.workflow.status, "PASS")
      assert.equal(receipt.surfaces.jobs.status, "PASS")
      assert.equal(fixture.requests.filter((request) => request.url === discoveryUrl(MAIN_TAG)).length, 0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })()
})

test("checkReleaseCompletion fails ambiguous run discovery", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const fixture = createHttpFixture(combineRoutes(
      lightweightTagRoutes(MAIN_TAG, HEAD_SHA, 1),
      {
        [discoveryUrl(MAIN_TAG)]: [jsonResponse(200, {
          total_count: 2,
          workflow_runs: [workflowRun(MAIN_TAG, HEAD_SHA, 42, 3), workflowRun(MAIN_TAG, HEAD_SHA, 43, 1)],
        })],
      },
    ))

    const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http))

    assert.equal(receipt.outcome, "FAILED")
    assert.equal(receipt.surfaces.identity.code, "run_discovery_ambiguous")
    assert.equal(receipt.runId, null)
    assert.equal(receipt.surfaces.workflow.status, "UNRESOLVED")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion leaves incomplete run discovery UNRESOLVED", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const fixture = createHttpFixture(combineRoutes(
      lightweightTagRoutes(MAIN_TAG, HEAD_SHA, 1),
      {
        [discoveryUrl(MAIN_TAG)]: [jsonResponse(200, {
          total_count: 2,
          workflow_runs: [workflowRun(MAIN_TAG, HEAD_SHA, 42, 3)],
        })],
      },
    ))

    const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http))

    assert.equal(receipt.outcome, "UNRESOLVED")
    assert.equal(receipt.surfaces.identity.code, "run_discovery_page_incomplete")
    assert.equal(receipt.runId, null)
    assert.deepEqual(clock.sleeps, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion fails a changed run attempt without changing job graphs", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const fixture = createHttpFixture(combineRoutes(
      lightweightTagRoutes(MAIN_TAG, HEAD_SHA, 1),
      {
        [discoveryUrl(MAIN_TAG)]: [jsonResponse(200, {
          total_count: 1,
          workflow_runs: [workflowRun(MAIN_TAG, HEAD_SHA, 42, 3)],
        })],
        [fixedRunUrl(42)]: [jsonResponse(200, workflowRun(MAIN_TAG, HEAD_SHA, 42, 4))],
      },
    ))

    const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http))

    assert.equal(receipt.outcome, "FAILED")
    assert.equal(receipt.surfaces.identity.code, "run_attempt_changed")
    assert.equal(receipt.runAttempt, 3)
    assert.deepEqual(receipt.jobs, [])
    assert.equal(fixture.requests.some((request) => request.url.includes("/attempts/")), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion fails terminal workflow failure after recording partial identity", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const fixture = createHttpFixture(combineRoutes(
      lightweightTagRoutes(MAIN_TAG, HEAD_SHA, 1),
      {
        [discoveryUrl(MAIN_TAG)]: [jsonResponse(200, {
          total_count: 1,
          workflow_runs: [workflowRun(MAIN_TAG, HEAD_SHA, 42, 3)],
        })],
        [fixedRunUrl(42)]: [jsonResponse(200, workflowRun(MAIN_TAG, HEAD_SHA, 42, 3, "completed", "failure"))],
      },
    ))

    const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http))

    assert.equal(receipt.outcome, "FAILED")
    assert.equal(receipt.surfaces.identity.status, "PASS")
    assert.equal(receipt.surfaces.workflow.code, "workflow_not_success")
    assert.equal(receipt.runId, 42)
    assert.equal(receipt.runAttempt, 3)
    assert.equal(receipt.surfaces.jobs.status, "UNRESOLVED")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checkReleaseCompletion rejects missing duplicate unexpected and wrong-conclusion main jobs", async () => {
  const jobSets: ReadonlyArray<ReadonlyArray<{ name: string; conclusion: string }>> = [
    mainJobs.filter((job) => job.name !== "Verify (ocmm)"),
    [...mainJobs, { name: "Verify (ocmm)", conclusion: "success" }],
    [...mainJobs, { name: "Unexpected job", conclusion: "success" }],
    mainJobs.map((job) => job.name === "Verify (ocmm)" ? { ...job, conclusion: "failure" } : job),
  ]

  for (const jobs of jobSets) {
    const root = makeReleaseRoot()
    try {
      const clock = new FakeClock()
      const fixture = createHttpFixture(combineRoutes(
        lightweightTagRoutes(MAIN_TAG, HEAD_SHA, 1),
        {
          [discoveryUrl(MAIN_TAG)]: [jsonResponse(200, {
            total_count: 1,
            workflow_runs: [workflowRun(MAIN_TAG, HEAD_SHA, 42, 3)],
          })],
          [fixedRunUrl(42)]: [jsonResponse(200, workflowRun(MAIN_TAG, HEAD_SHA, 42, 3))],
          [jobsUrl(42, 3)]: [jsonResponse(200, { total_count: jobs.length, jobs })],
        },
      ))

      const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http))

      assert.equal(receipt.outcome, "FAILED")
      assert.equal(receipt.surfaces.jobs.code, "jobs_contract_invalid")
      assert.equal(receipt.surfaces.githubRelease.status, "UNRESOLVED")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test("checkReleaseCompletion rejects missing or failed LSP matrix jobs and active main jobs", async () => {
  const jobSets: ReadonlyArray<ReadonlyArray<{ name: string; conclusion: string }>> = [
    lspJobs.filter((job) => job.name !== "Native ocmm-lsp (darwin-arm64)"),
    lspJobs.map((job) => job.name === "Native ocmm-lsp (darwin-arm64)" ? { ...job, conclusion: "failure" } : job),
    lspJobs.map((job) => job.name === "Package and publish ocmm" ? { ...job, conclusion: "in_progress" } : job),
  ]

  for (const jobs of jobSets) {
    const root = makeReleaseRoot()
    try {
      const clock = new FakeClock()
      const fixture = createHttpFixture(combineRoutes(
        lightweightTagRoutes(LSP_TAG, HEAD_SHA, 1),
        {
          [discoveryUrl(LSP_TAG)]: [jsonResponse(200, {
            total_count: 1,
            workflow_runs: [workflowRun(LSP_TAG, HEAD_SHA, 77, 2)],
          })],
          [fixedRunUrl(77)]: [jsonResponse(200, workflowRun(LSP_TAG, HEAD_SHA, 77, 2))],
          [jobsUrl(77, 2)]: [jsonResponse(200, { total_count: jobs.length, jobs })],
        },
      ))

      const receipt = await checkReleaseCompletion(remoteOptions(root, LSP_TAG, clock, fixture.http))

      assert.equal(receipt.outcome, "FAILED")
      assert.equal(receipt.surfaces.jobs.code, "jobs_contract_invalid")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test("checkReleaseCompletion rejects an incomplete jobs page", async () => {
  const root = makeReleaseRoot()
  try {
    const clock = new FakeClock()
    const fixture = createHttpFixture(combineRoutes(
      lightweightTagRoutes(MAIN_TAG, HEAD_SHA, 1),
      {
        [discoveryUrl(MAIN_TAG)]: [jsonResponse(200, {
          total_count: 1,
          workflow_runs: [workflowRun(MAIN_TAG, HEAD_SHA, 42, 3)],
        })],
        [fixedRunUrl(42)]: [jsonResponse(200, workflowRun(MAIN_TAG, HEAD_SHA, 42, 3))],
        [jobsUrl(42, 3)]: [jsonResponse(200, { total_count: mainJobs.length + 1, jobs: mainJobs })],
      },
    ))

    const receipt = await checkReleaseCompletion(remoteOptions(root, MAIN_TAG, clock, fixture.http))

    assert.equal(receipt.outcome, "FAILED")
    assert.equal(receipt.surfaces.jobs.code, "jobs_page_incomplete")
    assert.equal(receipt.surfaces.githubRelease.status, "UNRESOLVED")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
