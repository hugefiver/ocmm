import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Standalone release controller has no TypeScript declarations.
import { POLICY, computeDigests, registryVerificationFailure, verifyRegistryArtifact } from "../scripts/dsmm-release.mjs";
// @ts-expect-error Standalone terminal controller has no TypeScript declarations.
import { EvidenceMismatch, verificationFailureForError, verifyPublishedArtifact } from "../scripts/check-dsmm-release-completion.mjs";
// @ts-expect-error Historical fixture builder remains unchanged.
import { archiveFiles, makeAcceptedFixture, packageFiles } from "./dsmm-trusted-release-fixtures.mjs";

/** Synthetic registry fixtures exercise verification, never publication proof. */
function fixture(version = "0.1.9") {
  const base = makeAcceptedFixture().identity, tarball = archiveFiles(packageFiles(version));
  const tag = `dsmm-scoped-v${version}`, ref = `refs/tags/${tag}`;
  const identity = { ...base, ...computeDigests(tarball), version, tag, ref, filename: `dsmm-dsmm-${version}.tgz`,
    workflow: { ...base.workflow, ref: `${POLICY.repository}/${POLICY.workflowFile}@${ref}` } };
  const metadata = { name: POLICY.packageName, version, dist: { shasum: identity.sha1, integrity: identity.integrity,
    tarball: `${POLICY.registry}@dsmm/dsmm/-/dsmm-${version}.tgz`, attestations: { url: `${POLICY.registry}-/npm/v1/attestations/@dsmm%2fdsmm@${version}`, provenance: { predicateType: "https://slsa.dev/provenance/v1" } } } };
  const statement = { _type: "https://in-toto.io/Statement/v1", predicateType: "https://slsa.dev/provenance/v1",
    subject: [{ name: `pkg:npm/%40dsmm/dsmm@${version}`, digest: { sha512: Buffer.from(identity.integrity.slice(7), "base64").toString("hex") } }],
    predicate: { buildDefinition: { buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
      externalParameters: { workflow: { ref, repository: `https://github.com/${POLICY.repository}`, path: POLICY.workflowFile } },
      resolvedDependencies: [{ uri: `git+https://github.com/${POLICY.repository}@${ref}`, digest: { gitCommit: identity.releaseSha } }] },
      runDetails: { builder: { id: "https://github.com/actions/runner/github-hosted" }, metadata: { invocationId: `https://github.com/${POLICY.repository}/actions/runs/${identity.runId}/attempts/${identity.runAttempt}` } } } };
  const provenance = { attestations: [{ predicateType: statement.predicateType, bundle: { dsseEnvelope: { payloadType: "application/vnd.in-toto+json", payload: Buffer.from(JSON.stringify(statement)).toString("base64"), signatures: [{ sig: "synthetic-not-cryptographic-proof" }] } } }] };
  const fetcher = async (url: string) => url === metadata.dist.tarball ? new Response(tarball) : url === metadata.dist.attestations.url ? Response.json(provenance) : Response.json(metadata);
  return { identity, metadata, tarball, fetcher };
}

test("0.1.9 accepts genuine-bound registry evidence first visible after ten minutes", async () => {
  const f = fixture(); let clock = 0, metadataCalls = 0;
  const verified = await verifyRegistryArtifact(f.identity, async (url: string, options: any) => {
    assert.equal(options.redirect, "error");
    if (url === `${POLICY.registry}@dsmm%2fdsmm/0.1.9`) {
      metadataCalls++;
      if (clock < 600_000) return new Response("", { status: 404 });
    }
    return f.fetcher(url);
  }, { now: () => clock, wait: async (ms: number) => { assert.ok(ms > 0 && ms <= 2000); clock += ms; } });
  assert.equal(clock, 600_000); assert.equal(metadataCalls, 301);
  assert.equal(verified.outcome, "COMPLETED"); assert.equal(verified.sha256, f.identity.sha256);
  assert.equal(verified.provenance.sourceSha, f.identity.releaseSha);
});

test("0.1.9 shares the twenty-minute cap across metadata, tarball and provenance visibility", async () => {
  const f = fixture(); let clock = 0, provenanceCalls = 0;
  await assert.rejects(verifyRegistryArtifact(f.identity, async (url: string) => {
    if (url === f.metadata.dist.attestations.url) { provenanceCalls++; return new Response("", { status: 404 }); }
    if (url === f.metadata.dist.tarball ? clock < 900_000 : clock < 600_000) return new Response("", { status: 404 });
    return f.fetcher(url);
  }, { now: () => clock, wait: async (ms: number) => { clock += ms; } }), (error: any) => {
    assert.deepEqual(registryVerificationFailure(error), { stage: "registry-provenance", code: "VISIBILITY_DEADLINE", httpStatus: 404 }); return true;
  });
  assert.equal(clock, 1_200_000); assert.equal(provenanceCalls, 150);
});

test("0.1.9 rejects above-cap budgets and never automatically expands later versions", async () => {
  for (const version of ["0.1.10", "0.1.20", "0.2.0"]) {
    const future = fixture(version); let clock = 0, calls = 0;
    await assert.rejects(verifyRegistryArtifact(future.identity, async () => { calls++; return new Response("", { status: 404 }); },
      { now: () => clock, wait: async (ms: number) => { clock += ms; } }), /absent/);
    assert.equal(clock, 120_000); assert.equal(calls, 61);
  }
  for (const [version, cap] of [["0.1.9", 1_200_000], ["0.1.8", 300_000], ["0.1.10", 300_000], ["0.1.20", 300_000], ["0.2.0", 300_000]] as const) {
    await assert.rejects(verifyRegistryArtifact(fixture(version).identity, async () => assert.fail("invalid budget cannot fetch"), { visibilityDeadlineMs: cap + 1 }), /deadline/);
  }
});

test("0.1.9 keeps non-404, bytes, provenance and native install failures closed and sanitized", async () => {
  for (const scenario of ["http", "bytes", "provenance"] as const) {
    const f = fixture(); let calls = 0;
    await assert.rejects(verifyRegistryArtifact(f.identity, async (url: string) => {
      if (url === f.metadata.dist.tarball) {
        calls++;
        if (scenario === "http") return new Response("private material", { status: 503 });
        if (scenario === "bytes") return new Response("different archive");
      }
      if (url === f.metadata.dist.attestations.url && scenario === "provenance") return Response.json({ token: "private material" });
      return f.fetcher(url);
    }, { wait: async () => assert.fail("only 404 can wait") }), (error: any) => {
      const failure = verificationFailureForError(error);
      assert.deepEqual(failure, { stage: scenario === "provenance" ? "registry-provenance" : "registry-tarball",
        code: scenario === "http" ? "HTTP_FAILURE" : "EVIDENCE_REJECTED", ...(scenario === "http" ? { httpStatus: 503 } : {}) });
      assert.doesNotMatch(JSON.stringify(failure), /private|token|https/); return true;
    });
    assert.equal(calls, 1);
  }
  const f = fixture();
  const registry = await verifyRegistryArtifact(f.identity, f.fetcher);
  await assert.rejects(verifyPublishedArtifact(f.identity, { registryCheck: async () => registry, installProbe: async () => { throw new EvidenceMismatch("private material"); } }), (error: any) => {
    assert.ok(error instanceof EvidenceMismatch);
    assert.deepEqual(verificationFailureForError(error), { stage: "native-install", code: "INSTALL_PROOF_REJECTED" });
    assert.doesNotMatch(error.message, /private/); return true;
  });
});

test("only the DSMM verify job has forty-five minutes for bounded visibility plus fresh native install", () => {
  const workflow = readFileSync(new URL("../.github/workflows/dsmm-release.yml", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  assert.deepEqual([...workflow.matchAll(/timeout-minutes: (\d+)/gu)].map(match => Number(match[1])), [15, 90, 15, 45, 15]);
  assert.match(workflow.split("  verify:\n")[1].split("  github-release:\n")[0], /timeout-minutes: 45/u);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN|--clobber|npm publish/u);
});
