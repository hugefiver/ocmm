import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Standalone release controller has no TypeScript declarations.
import { POLICY, computeDigests, createArtifactIdentity, resolveReleaseContext, verifyRegistryArtifact } from "../scripts/dsmm-release.mjs";
// @ts-expect-error Historical fixture builder remains unchanged.
import { archiveFiles, contextInput, packageFiles, receiptFixture } from "./dsmm-trusted-release-fixtures.mjs";

/** Synthetic identity for absent-registry polling only; never release proof. */
function pollingIdentity(version: string) {
  const input = contextInput();
  input.packageVersion = "0.1.4";
  input.ref = "refs/tags/dsmm-scoped-v0.1.4";
  input.workflowRef = `${POLICY.repository}/${POLICY.workflowFile}@${input.ref}`;
  const tarball = archiveFiles(packageFiles("0.1.4"));
  const identity = createArtifactIdentity(resolveReleaseContext(input), tarball,
    Buffer.from(JSON.stringify(receiptFixture("0.1.4", computeDigests(tarball).sha256))), { sourceChecks: "COMPLETED" });
  const tag = `dsmm-scoped-v${version}`, ref = `refs/tags/${tag}`;
  return { ...identity, version, tag, ref, filename: `dsmm-dsmm-${version}.tgz`,
    workflow: { ...identity.workflow, ref: `${POLICY.repository}/${POLICY.workflowFile}@${ref}` } };
}

test("0.1.7 gets a finite 300-second registry visibility budget without changing historical defaults", async () => {
  for (const [version, expectedMs, expectedCalls] of [["0.1.4", 0, 1], ["0.1.5", 120_000, 61], ["0.1.6", 120_000, 61], ["0.1.7", 300_000, 151], ["0.1.8", 120_000, 61]] as const) {
    let clock = 0, calls = 0;
    await assert.rejects(verifyRegistryArtifact(pollingIdentity(version), async (url: string) => {
      assert.equal(url, `${POLICY.registry}@dsmm%2fdsmm/${version}`);
      calls++; return new Response("", { status: 404 });
    }, { now: () => clock, wait: async (ms: number) => { assert.ok(ms > 0 && ms <= 2000); clock += ms; } }), /absent/);
    assert.equal(clock, expectedMs, version); assert.equal(calls, expectedCalls, version);
  }
});

test("0.1.7 preserves explicit smaller budgets and refuses a deadline above the existing ceiling", async () => {
  let clock = 0, calls = 0;
  const fetch404 = async () => { calls++; return new Response("", { status: 404 }); };
  await assert.rejects(verifyRegistryArtifact(pollingIdentity("0.1.7"), fetch404,
    { visibilityDeadlineMs: 6, visibilityPollMs: 2, now: () => clock, wait: async (ms: number) => { clock += ms; } }), /absent/);
  assert.equal(clock, 6); assert.equal(calls, 4);
  await assert.rejects(verifyRegistryArtifact(pollingIdentity("0.1.7"), async () => { assert.fail("invalid budget cannot fetch"); },
    { visibilityDeadlineMs: 300_001 }), /deadline/);
});

test("0.1.7 non-404 metadata failures never enter the extended visibility wait", async () => {
  let calls = 0;
  await assert.rejects(verifyRegistryArtifact(pollingIdentity("0.1.7"), async () => {
    calls++; return new Response("", { status: 503 });
  }, { wait: async () => { assert.fail("non-404 must not wait"); } }), /HTTP 503/);
  assert.equal(calls, 1);
});
