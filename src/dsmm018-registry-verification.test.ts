import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Standalone release controller has no TypeScript declarations.
import * as release from "../scripts/dsmm-release.mjs";
// @ts-expect-error Historical fixture builder remains unchanged.
import { archiveFiles, contextInput, packageFiles, receiptFixture } from "./dsmm-trusted-release-fixtures.mjs";
// @ts-expect-error Standalone terminal controller has no TypeScript declarations.
import { EvidenceMismatch, verificationFailureForError, verifyPublishedArtifact } from "../scripts/check-dsmm-release-completion.mjs";

const { POLICY, computeDigests, createArtifactIdentity, resolveReleaseContext, verifyRegistryArtifact } = release;
const { registryVerificationFailure } = release;

function fixture(version = "0.1.8") {
  // Only the package/source identity is synthetic; no synthetic acceptance is published.
  const input = contextInput();
  input.packageVersion = "0.1.4";
  input.ref = "refs/tags/dsmm-scoped-v0.1.4";
  input.workflowRef = `${POLICY.repository}/${POLICY.workflowFile}@${input.ref}`;
  const original = archiveFiles(packageFiles("0.1.4"));
  const base = createArtifactIdentity(resolveReleaseContext(input), original,
    Buffer.from(JSON.stringify(receiptFixture("0.1.4", computeDigests(original).sha256))), { sourceChecks: "COMPLETED" });
  const tarball = archiveFiles(packageFiles(version));
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
  const provenance = { attestations: [{ predicateType: statement.predicateType, bundle: { dsseEnvelope: { payloadType: "application/vnd.in-toto+json", payload: Buffer.from(JSON.stringify(statement)).toString("base64"), signatures: [{ sig: "fixture-not-cryptographic-proof" }] } } }] };
  const fetcher = async (url: string) => url === metadata.dist.tarball ? new Response(tarball) : url === metadata.dist.attestations.url ? Response.json(provenance) : Response.json(metadata);
  return { identity, metadata, tarball, fetcher };
}

test("0.1.8 waits for exact tarball and provenance 404 visibility without weakening either proof", async () => {
  const f = fixture(), counts = new Map<string, number>();
  let clock = 0;
  const result = await verifyRegistryArtifact(f.identity, async (url: string, options: any) => {
    assert.equal(options.redirect, "error");
    const count = (counts.get(url) ?? 0) + 1; counts.set(url, count);
    if (url !== `${POLICY.registry}@dsmm%2fdsmm/0.1.8` && count === 1) return new Response("", { status: 404 });
    return f.fetcher(url);
  }, { visibilityDeadlineMs: 6, visibilityPollMs: 2, now: () => clock, wait: async (ms: number) => { clock += ms; } });
  assert.equal(result.outcome, "COMPLETED"); assert.equal(result.sha256, f.identity.sha256);
  assert.equal(result.provenance.outcome, "COMPLETED"); assert.equal(clock, 4);
});

test("0.1.8 shares one finite deadline across metadata, tarball and provenance reads", async () => {
  const f = fixture(), counts = new Map<string, number>(); let clock = 0;
  await assert.rejects(verifyRegistryArtifact(f.identity, async (url: string) => {
    const count = (counts.get(url) ?? 0) + 1; counts.set(url, count);
    if (url === f.metadata.dist.attestations.url || count === 1) return new Response("", { status: 404 });
    return f.fetcher(url);
  }, { visibilityDeadlineMs: 6, visibilityPollMs: 2, now: () => clock, wait: async (ms: number) => { clock += ms; } }), (error: any) => {
    assert.deepEqual(registryVerificationFailure(error), { stage: "registry-provenance", code: "VISIBILITY_DEADLINE", httpStatus: 404 });
    return true;
  });
  assert.equal(clock, 6); assert.equal(counts.get(f.metadata.dist.tarball), 2);
});

test("historical 0.1.7 tarball 404 remains single-shot", async () => {
  const f = fixture("0.1.7"); let calls = 0;
  await assert.rejects(verifyRegistryArtifact(f.identity, async (url: string) => {
    if (url === f.metadata.dist.tarball) { calls++; return new Response("", { status: 404 }); }
    return f.fetcher(url);
  }, { wait: async () => assert.fail("historical blob must not wait") }), /HTTP 404/);
  assert.equal(calls, 1);
});

test("0.1.8 rejects non-404, corrupt bytes and arbitrary errors with finite sanitized diagnostics", async () => {
  for (const scenario of ["http", "bytes", "network", "provenance"] as const) {
    const f = fixture(); let blobCalls = 0;
    await assert.rejects(verifyRegistryArtifact(f.identity, async (url: string) => {
      if (url === f.metadata.dist.tarball) {
        blobCalls++;
        if (scenario === "http") return new Response("secret-token", { status: 503 });
        if (scenario === "bytes") return new Response("wrong bytes");
        if (scenario === "network") throw Error("Bearer secret-token https://private/path");
      }
      if (url === f.metadata.dist.attestations.url && scenario === "provenance") return Response.json({ token: "secret-token" });
      return f.fetcher(url);
    }, { wait: async () => assert.fail("non-404 never waits") }), (error: any) => {
      const failure = registryVerificationFailure(error);
      assert.equal(failure.stage, scenario === "provenance" ? "registry-provenance" : "registry-tarball");
      assert.equal(failure.code, scenario === "http" ? "HTTP_FAILURE" : scenario === "network" ? "FETCH_FAILED" : "EVIDENCE_REJECTED");
      assert.doesNotMatch(JSON.stringify(failure), /secret|Bearer|private|https/); return true;
    });
    assert.equal(blobCalls, 1);
  }
  assert.equal(registryVerificationFailure(Error("secret-token")), null);
});

test("0.1.8 native install failure keeps FAILED classification with sanitized stage, historical errors stay unchanged", async () => {
  for (const version of ["0.1.7", "0.1.8"]) {
    const f = fixture(version), original = new EvidenceMismatch("Bearer secret-token private-path");
    const registry = await verifyRegistryArtifact(f.identity, f.fetcher);
    await assert.rejects(verifyPublishedArtifact(f.identity, { registryCheck: async () => registry, installProbe: async () => { throw original; } }), (error: any) => {
      assert.ok(error instanceof EvidenceMismatch);
      if (version === "0.1.8") {
        assert.deepEqual(verificationFailureForError(error), { stage: "native-install", code: "INSTALL_PROOF_REJECTED" });
        assert.doesNotMatch(error.message, /secret|private/);
      } else { assert.equal(error, original); assert.equal(verificationFailureForError(error), null); }
      return true;
    });
  }
  assert.equal(verificationFailureForError({ failure: { stage: "registry-tarball", code: "FETCH_FAILED" }, message: "Bearer secret" }), null);
});
