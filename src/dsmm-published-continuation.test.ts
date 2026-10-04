import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { archiveFiles, contextInput, makeInstallFixture, packageFiles, receiptFixture } from "./dsmm-trusted-release-fixtures.mjs";
import { computeDigests, createArtifactIdentity, deterministicChecksums, finalizeRelease, resolveReleaseContext, stageDraftTransport, validateTarballBuffer } from "../scripts/dsmm-release.mjs";
import { cleanupOwnedRoot, createOwnedRoot } from "../scripts/dsmm-registry-install-probe.mjs";
import { parseContinuationArguments, runPublishedContinuation } from "../scripts/dsmm-release-continuation.mjs";
import {
  CONTINUATION_WORKFLOW, PUBLISHED_ORIGIN, checkTerminalPublishedContinuation,
} from "../scripts/check-dsmm-release-completion.mjs";
import {
  loadPublishedOrigin, loadContinuationRun, parseCompletionArguments, selectContinuationArtifact, validateArtifactArchive,
  validateArtifactMembers, validateContinuationContext, validateContinuationJobs, validateContinuationVerification,
  validatePublishedOriginIdentity, validatePublishedOriginRun, validateRunEvidence, validateVerificationReceipt, verifyPublishedArtifact,
} from "../scripts/check-dsmm-release-completion.mjs";

const yaml = readFileSync(new URL("../.github/workflows/dsmm-published-continuation.yml", import.meta.url), "utf8");

function scenario() {
  const fixed = PUBLISHED_ORIGIN;
  const context = resolveReleaseContext({ ...contextInput(), packageVersion: fixed.version, ref: `refs/tags/${fixed.tag}`,
    eventSha: fixed.releaseSha, controlSha: fixed.controlSha, workflowSha: fixed.controlSha, peeledSha: fixed.releaseSha,
    workflowRef: `hugefiver/ocmm/.github/workflows/dsmm-release.yml@refs/tags/${fixed.tag}`, runId: fixed.runId, runAttempt: fixed.runAttempt });
  const tarball = archiveFiles(packageFiles(fixed.version));
  const receiptBytes = Buffer.from(JSON.stringify(receiptFixture(fixed.version, computeDigests(tarball).sha256)));
  const identity = createArtifactIdentity(context, tarball, receiptBytes, { sourceChecks: "COMPLETED" });
  const assets = new Map([[identity.filename, tarball], [identity.receiptFilename, receiptBytes], ["SHA256SUMS.txt", deterministicChecksums(identity)]]);
  const files = validateTarballBuffer(tarball, { version: identity.version }).files;
  const originRun = { id: Number(fixed.runId), run_attempt: 1, workflow_id: fixed.workflowId, event: "push", head_branch: fixed.tag,
    head_sha: fixed.controlSha, repository: { full_name: fixed.repository }, head_repository: { full_name: fixed.repository }, status: "completed", conclusion: "failure" };
  const originWorkflow = { id: fixed.workflowId, path: ".github/workflows/dsmm-release.yml" };
  const originJobs = [["import-bootstrap", 111548000843, "skipped"], ["prepare", 111548000008, "success"],
    ["publish", 111548674992, "success"], ["verify", 111548723962, "failure"], ["github-release", 111548765501, "skipped"]].map(([name, id, conclusion]) => ({
    name, id, conclusion, run_id: Number(fixed.runId), run_attempt: 1, status: "completed",
  }));
  const originArtifact = { id: fixed.artifactId, name: fixed.artifactName, expired: false, digest: fixed.archiveDigest,
    size_in_bytes: fixed.artifactSize, workflow_run: { id: Number(fixed.runId), head_sha: fixed.controlSha, head_branch: fixed.tag } };
  const origin = { context, identity, files, run: originRun, workflow: originWorkflow,
    jobs: validatePublishedOriginRun(originRun, originWorkflow, originJobs), artifact: originArtifact };
  const continuation = { schemaVersion: 1, repository: fixed.repository, defaultBranch: "master", eventName: "workflow_dispatch",
    ref: "refs/heads/master", inputs: {}, eventSha: "b".repeat(40), controlSha: "b".repeat(40), runId: "5678", runAttempt: "2",
    workflow: { file: CONTINUATION_WORKFLOW, sha: "b".repeat(40), ref: `hugefiver/ocmm/${CONTINUATION_WORKFLOW}@refs/heads/master` },
    controlInDefaultHistory: true, controlsPresent: true, runtime: { platform: "linux", nodeMajor: 24 } };
  const expected = { runId: continuation.runId, runAttempt: continuation.runAttempt, controlSha: continuation.controlSha };
  const run = { ...originRun, id: 5678, run_attempt: 2, workflow_id: 900, event: "workflow_dispatch", head_branch: "master",
    head_sha: continuation.controlSha, conclusion: "success" as string | null };
  const jobs = ["verify", "github-release"].map((name, index) => ({ id: index + 50, name, run_id: 5678, run_attempt: 2,
    status: "completed", conclusion: "success" as string | null, labels: ["ubuntu-latest"] }));
  const artifact = { id: 88, name: "dsmm-registry-verification-5678-2", expired: false, digest: `sha256:${"e".repeat(64)}`,
    size_in_bytes: 100, workflow_run: { id: 5678, head_sha: continuation.controlSha, head_branch: "master" } };
  const registry = { outcome: "COMPLETED", name: "@dsmm/dsmm", version: identity.version, registry: "https://registry.npmjs.org/",
    sha256: identity.sha256, sha1: identity.sha1, integrity: identity.integrity, size: identity.size,
    provenance: { outcome: "COMPLETED", source: "npm-registry-served-validated-attestation-over-https", predicateType: "https://slsa.dev/provenance/v1",
      sourceSha: fixed.releaseSha, workflowFile: originWorkflow.path, runId: fixed.runId, runAttempt: fixed.runAttempt, independentSigstoreVerification: false } };
  const installed = makeInstallFixture({ identity, tarball });
  const release = { id: 44, tag_name: identity.tag, draft: false, prerelease: false,
    assets: [...assets].map(([name, bytes], index) => ({ id: 100 + index, name, size: bytes.length, state: "uploaded", digest: `sha256:${computeDigests(bytes).sha256}` })) };
  return { context, identity, files, originRun, originWorkflow, originJobs, originArtifact, origin, continuation, expected, run, jobs, artifact, registry, installed, assets, release };
}

function requests(f: ReturnType<typeof scenario>) {
  const seen: string[] = [];
  let comparison = { status: "identical", merge_base_commit: { sha: f.continuation.controlSha } };
  const request = (path: string): any => {
    seen.push(path);
    if (path === `actions/runs/${PUBLISHED_ORIGIN.runId}/attempts/1`) return f.originRun;
    if (path === `actions/workflows/${PUBLISHED_ORIGIN.workflowId}`) return f.originWorkflow;
    if (path === `actions/runs/${PUBLISHED_ORIGIN.runId}/attempts/1/jobs?per_page=100`) return { total_count: f.originJobs.length, jobs: f.originJobs };
    if (path === `actions/runs/${PUBLISHED_ORIGIN.runId}/artifacts?per_page=100`) return { total_count: 1, artifacts: [f.originArtifact] };
    if (path === "actions/runs/5678/attempts/2") return f.run;
    if (path === "actions/workflows/900") return { id: 900, path: CONTINUATION_WORKFLOW };
    if (path === "actions/runs/5678/attempts/2/jobs?per_page=100") return { total_count: f.jobs.length, jobs: f.jobs };
    if (path === "actions/runs/5678/artifacts?per_page=100") return { total_count: 1, artifacts: [f.artifact] };
    if (path.startsWith("compare/")) return comparison;
    if (path.startsWith("contents/")) {
      const file = path.slice("contents/".length).split("?")[0];
      return { type: "file", path: file, encoding: "base64", content: Buffer.from(file === CONTINUATION_WORKFLOW ? yaml : "trusted source").toString("base64") };
    }
    if (path.startsWith("git/ref/")) return { object: { type: "commit", sha: PUBLISHED_ORIGIN.releaseSha } };
    if (path === `releases/tags/${PUBLISHED_ORIGIN.tag}`) return f.release;
    throw new Error(`unexpected request: ${path}`);
  };
  return { request, seen, setComparison: (next: typeof comparison) => { comparison = next; } };
}

function verificationFor(f: ReturnType<typeof scenario>) {
  return verifyPublishedArtifact(f.identity, { registryCheck: async () => f.registry, installProbe: async () => f.installed });
}

async function envelopeFor(f: ReturnType<typeof scenario>) {
  return { schemaVersion: 2, mode: "published-continuation", outcome: "COMPLETED", continuation: f.continuation,
    originAcceptedArtifact: { id: PUBLISHED_ORIGIN.artifactId, archiveDigest: PUBLISHED_ORIGIN.archiveDigest, runId: PUBLISHED_ORIGIN.runId, runAttempt: "1" },
    verification: await verificationFor(f) };
}

test("published origin requires the immutable failed attempt and all exact original jobs", () => {
  const f = scenario();
  assert.equal(validatePublishedOriginRun(f.originRun, f.originWorkflow, f.originJobs).length, 5);
  assert.throws(() => validateRunEvidence(f.originRun, f.originWorkflow, f.originJobs, f.identity, PUBLISHED_ORIGIN), /successfully terminated/);
  for (const mutate of [
    (copy: typeof f) => { copy.originRun.conclusion = "success"; }, (copy: typeof f) => { copy.originRun.run_attempt = 2; },
    (copy: typeof f) => { copy.originRun.head_sha = "c".repeat(40); }, (copy: typeof f) => { copy.originRun.head_branch = "master"; },
    (copy: typeof f) => { copy.originRun.repository.full_name = "other/repo"; }, (copy: typeof f) => { copy.originWorkflow.id++; },
    (copy: typeof f) => { copy.originJobs.pop(); }, (copy: typeof f) => { copy.originJobs[2].id = 99; },
    (copy: typeof f) => { copy.originJobs[3].conclusion = "success"; }, (copy: typeof f) => { copy.originJobs[4].run_attempt = 2; },
  ]) { const copy = structuredClone(f); mutate(copy); assert.throws(() => validatePublishedOriginRun(copy.originRun, copy.originWorkflow, copy.originJobs)); }
  const pinned = { ...f.identity, sha256: PUBLISHED_ORIGIN.sha256 };
  assert.equal(validatePublishedOriginIdentity(pinned), pinned);
  for (const patch of [{ version: "0.1.3" }, { tag: "dsmm-scoped-v0.1.3" }, { sha256: "d".repeat(64) },
    { runId: "123" }, { provenance: false }, { controlSha: "c".repeat(40) }]) assert.throws(() => validatePublishedOriginIdentity({ ...pinned, ...patch }));
});

test("artifact identity, archive bytes and the existing membership guards reject unsafe or ambiguous transport", () => {
  const f = scenario();
  assert.equal(selectContinuationArtifact([f.originArtifact], PUBLISHED_ORIGIN, { accepted: true }).id, PUBLISHED_ORIGIN.artifactId);
  assert.equal(selectContinuationArtifact([f.artifact], f.expected, { artifactId: "88" }).id, 88);
  assert.throws(() => selectContinuationArtifact([f.artifact, f.artifact], f.expected), /ambiguous/);
  for (const patch of [{ expired: true }, { id: 0 }, { digest: "bad" }, { size_in_bytes: 0 },
    { workflow_run: { id: 5678, head_sha: "c".repeat(40), head_branch: "master" } }])
    assert.throws(() => selectContinuationArtifact([{ ...f.artifact, ...patch }], f.expected));
  for (const patch of [{ id: 99 }, { digest: `sha256:${"d".repeat(64)}` }, { size_in_bytes: 100 }, { name: "dsmm-accepted-37240470628-2" }])
    assert.throws(() => selectContinuationArtifact([{ ...f.originArtifact, ...patch }], PUBLISHED_ORIGIN, { accepted: true }));
  assert.throws(() => selectContinuationArtifact([f.artifact], f.expected, { artifactId: "89" }));
  const bytes = Buffer.from("exact archive bytes"), metadata = { digest: `sha256:${computeDigests(bytes).sha256}`, size_in_bytes: bytes.length };
  validateArtifactArchive(bytes, metadata);
  assert.throws(() => validateArtifactArchive(Buffer.from("changed"), metadata));
  assert.throws(() => validateArtifactArchive(bytes, { ...metadata, size_in_bytes: 1 }));
  const acceptedNames = ["context.json", "identity.json", PUBLISHED_ORIGIN.filename, "docker-receipt-native-session-control.json", "SHA256SUMS.txt"];
  validateArtifactMembers(acceptedNames, f.originArtifact, PUBLISHED_ORIGIN);
  validateArtifactMembers(["dsmm-registry-verification.json"], f.artifact, f.expected);
  for (const members of [["../dsmm-registry-verification.json"], ["dsmm-registry-verification.json", "extra"], ["dsmm-registry-verification.json", "dsmm-registry-verification.json"]])
    assert.throws(() => validateArtifactMembers(members, f.artifact, f.expected));
  assert.throws(() => validateArtifactMembers([...acceptedNames.slice(0, 4), "../SHA256SUMS.txt"], f.originArtifact, PUBLISHED_ORIGIN));
});

test("original loading uses fixed-attempt APIs and rejects synthetic package bytes instead of changing frozen policy", async () => {
  const f = scenario(), api = requests(f), owner = createOwnedRoot();
  const directory = join(owner.root, "accepted"); mkdirSync(directory);
  try {
    await assert.rejects(() => loadPublishedOrigin(directory, { request: api.request, downloadArtifact: (_artifact, output) => {
      for (const [name, bytes] of f.assets) writeFileSync(join(output, name), bytes);
      writeFileSync(join(output, "context.json"), JSON.stringify(f.context));
      writeFileSync(join(output, "identity.json"), JSON.stringify(f.identity));
    } }), /fixed published origin differs: sha256/);
    assert.ok(api.seen.includes(`actions/runs/${PUBLISHED_ORIGIN.runId}/attempts/1`));
    assert.ok(!api.seen.includes(`actions/runs/${PUBLISHED_ORIGIN.runId}`));
  } finally { cleanupOwnedRoot(owner); }
});

test("genuine continuation context and two successful CI jobs cannot be caller-selected or flattened into origin", () => {
  const f = scenario(), api = requests(f);
  assert.equal(loadContinuationRun(f.continuation, { request: api.request }).jobs.length, 2);
  for (const changed of [yaml.replace("  workflow_dispatch:", "  workflow_dispatch:\n    inputs:\n      version:\n        type: string"),
    yaml.replace("  workflow_dispatch:", "  workflow_dispatch:\n  workflow_call:"), yaml.replace("actions: read", "id-token: write")]) {
    assert.throws(() => loadContinuationRun(f.continuation, { request: path => path.startsWith(`contents/${CONTINUATION_WORKFLOW}?`)
      ? { type: "file", path: CONTINUATION_WORKFLOW, encoding: "base64", content: Buffer.from(changed).toString("base64") } : api.request(path) }));
  }
  for (const patch of [{ eventName: "push" }, { ref: "refs/tags/unsafe" }, { inputs: { version: "0.1.4" } },
    { controlsPresent: false }, { controlInDefaultHistory: false }, { controlSha: PUBLISHED_ORIGIN.controlSha },
    { eventSha: "c".repeat(40) }, { runtime: { platform: "win32", nodeMajor: 24 } }, { runtime: { platform: "linux", nodeMajor: 22 } }])
    assert.throws(() => validateContinuationContext({ ...f.continuation, ...patch }));
  assert.throws(() => validateContinuationContext(f.continuation, { ...f.expected, runAttempt: "1" }));
  api.setComparison({ status: "diverged", merge_base_commit: { sha: "c".repeat(40) } });
  assert.throws(() => loadContinuationRun(f.continuation, { request: api.request }), /history/);
  for (const mutate of [(jobs: typeof f.jobs) => jobs.pop(), (jobs: typeof f.jobs) => jobs.push({ ...jobs[0], name: "extra" }),
    (jobs: typeof f.jobs) => { jobs[1].name = "verify"; }, (jobs: typeof f.jobs) => { jobs[1].id = jobs[0].id; },
    (jobs: typeof f.jobs) => { jobs[0].conclusion = "failure"; }, (jobs: typeof f.jobs) => { jobs[1].run_attempt = 1; },
    (jobs: typeof f.jobs) => { jobs[0].labels = ["windows-latest"]; }]) {
    const jobs = structuredClone(f.jobs); mutate(jobs); assert.throws(() => validateContinuationJobs(jobs, f.continuation));
  }
  for (const patch of [{ head_sha: "c".repeat(40) }, { head_branch: "unsafe" }, { event: "push" }, { run_attempt: 1 }, { conclusion: "failure" }]) {
    const other = scenario(); Object.assign(other.run, patch); assert.throws(() => loadContinuationRun(other.continuation, { request: requests(other).request }));
  }
});

test("continuation wrapper preserves original provenance and binds every installed export and locale byte", async () => {
  const f = scenario(), envelope = await envelopeFor(f);
  validateContinuationVerification(envelope, f.origin, f.expected);
  assert.throws(() => validateVerificationReceipt(envelope, f.identity));
  for (const mutate of [
    (copy: typeof envelope) => { copy.mode = "terminal"; }, (copy: typeof envelope) => { copy.originAcceptedArtifact.id++; },
    (copy: typeof envelope) => { copy.originAcceptedArtifact.archiveDigest = `sha256:${"d".repeat(64)}`; },
    (copy: typeof envelope) => { copy.verification.identity.runId = "5678"; },
    (copy: typeof envelope) => { copy.verification.registry.provenance.runId = "5678"; },
    (copy: typeof envelope) => { copy.verification.freshInstall.cleanup.outcome = "FAILED"; },
    (copy: typeof envelope) => { copy.verification.freshInstall.compiledFiles["lib/profile-runtime.js"].sha256 = "b".repeat(64); },
    (copy: typeof envelope) => { copy.verification.freshInstall.nativeMetadata.locales.en.description = "wrong metadata"; },
    (copy: typeof envelope) => { copy.verification.freshInstall.nativeMetadata.locales.zh.title = "DSMM"; },
    (copy: typeof envelope) => { copy.verification.freshInstall.nativeMetadata.locales.en.sha256 = "b".repeat(64); },
  ]) { const copy = structuredClone(envelope); mutate(copy); assert.throws(() => validateContinuationVerification(copy, f.origin, f.expected)); }
});

test("two-run terminal traverses public surfaces without rewriting failed origin history", async () => {
  const f = scenario(), api = requests(f), envelope = await envelopeFor(f);
  let registryChecks = 0;
  // Only the archive-loader boundary is synthetic; frozen policy is exercised above.
  // No fixture can reproduce the SHA256 of the actual previously published package.
  const dependencies = {
    request: api.request, originLoader: async () => f.origin,
    downloadArtifact: (_artifact, output) => writeFileSync(join(output, "dsmm-registry-verification.json"), JSON.stringify(envelope)),
    fetchAsset: async asset => f.assets.get(asset.name),
    publishedCheck: (identity, options) => verifyPublishedArtifact(identity, { ...options, registryCheck: async () => { registryChecks++; return f.registry; } }),
  };
  const receipt = await checkTerminalPublishedContinuation(f.expected, dependencies);
  assert.equal(receipt.schemaVersion, 2); assert.equal(receipt.mode, "published-continuation"); assert.equal(receipt.outcome, "COMPLETED");
  assert.equal(receipt.originWorkflow.conclusion, "failure"); assert.equal(receipt.originWorkflow.jobs.find(job => job.name === "verify").conclusion, "failure");
  assert.equal(receipt.continuationWorkflow.conclusion, "success"); assert.equal(receipt.continuationWorkflow.runAttempt, "2");
  assert.equal(receipt.artifact.releaseSha, PUBLISHED_ORIGIN.releaseSha); assert.equal(receipt.publication.identity.runId, PUBLISHED_ORIGIN.runId);
  assert.equal(receipt.publication.registry.provenance.runId, PUBLISHED_ORIGIN.runId); assert.equal(receipt.verificationProof.id, 88);
  assert.equal(receipt.originAcceptedArtifact.id, PUBLISHED_ORIGIN.artifactId); assert.equal(receipt.githubRelease.assetIds.length, 3);
  assert.equal(registryChecks, 1);
  await assert.rejects(() => checkTerminalPublishedContinuation({ ...f.expected, runAttempt: "1" }, dependencies));
  await assert.rejects(() => checkTerminalPublishedContinuation(f.expected, { ...dependencies, request: path => path.startsWith("git/ref/")
    ? { object: { type: "commit", sha: "c".repeat(40) } } : api.request(path) }), /tag changed/);
  for (const mutate of [(release: typeof f.release) => { release.draft = true; }, (release: typeof f.release) => { release.assets.pop(); },
    (release: typeof f.release) => { release.assets[0].id = 0; }]) {
    const copy = structuredClone(f.release); mutate(copy);
    await assert.rejects(() => checkTerminalPublishedContinuation(f.expected, { ...dependencies,
      request: path => path.startsWith("releases/tags/") ? copy : api.request(path) }));
  }
  await assert.rejects(() => checkTerminalPublishedContinuation(f.expected, { ...dependencies,
    fetchAsset: async asset => asset.name === "SHA256SUMS.txt" ? Buffer.from("changed checksum") : f.assets.get(asset.name) }));
  await assert.rejects(() => checkTerminalPublishedContinuation(f.expected, { ...dependencies,
    publishedCheck: (identity, options) => verifyPublishedArtifact(identity, { ...options, registryCheck: async () => ({ ...f.registry, sha256: "c".repeat(64) }) }) }));
});

test("controller never mutates before valid original/actual-run/native proof and never adopts existing or partial drafts", async () => {
  const f = scenario(), envelope = await envelopeFor(f);
  f.run.status = "in_progress"; f.run.conclusion = null;
  f.jobs[1].status = "in_progress"; f.jobs[1].conclusion = null;
  const api = requests(f);
  let mutations = 0;
  const dependencies = { request: api.request, originLoader: async () => f.origin, proofArtifactId: "88",
    findExistingRelease: async () => null,
    downloadArtifact: (_artifact, output) => writeFileSync(join(output, "dsmm-registry-verification.json"), JSON.stringify(envelope)),
    stageTransport: async () => { mutations++; return { releaseId: "44", assets: f.release.assets.map(({ id, name }) => ({ id: String(id), name })) }; },
    finalize: async () => { mutations++; return { releaseId: "44", outcome: "PUBLIC_NOT_TERMINALLY_VERIFIED" }; } };
  const fresh = await runPublishedContinuation("verify", f.continuation, { ...dependencies,
    publishedCheck: () => verificationFor(f) });
  assert.equal(fresh.verification.identity.runId, PUBLISHED_ORIGIN.runId);
  assert.equal(fresh.continuation.runId, "5678"); assert.equal(mutations, 0);
  await assert.rejects(() => runPublishedContinuation("verify", f.continuation, { ...dependencies,
    publishedCheck: async () => { throw Error("native verification failed"); } })); assert.equal(mutations, 0);
  await assert.rejects(() => runPublishedContinuation("finalize", f.continuation, { ...dependencies, originLoader: async () => { throw Error("origin failed"); } }));
  assert.equal(mutations, 0);
  envelope.verification.freshInstall.temporaryRootRemoved = false;
  await assert.rejects(() => runPublishedContinuation("finalize", f.continuation, dependencies)); assert.equal(mutations, 0);
  envelope.verification.freshInstall.temporaryRootRemoved = true;
  await assert.rejects(() => runPublishedContinuation("finalize", f.continuation, { ...dependencies, proofArtifactId: "89" })); assert.equal(mutations, 0);
  await assert.rejects(() => runPublishedContinuation("finalize", f.continuation, { ...dependencies,
    findExistingRelease: async () => ({ id: 77, draft: true, assets: [{ id: 99, name: "partial" }] }) }), /"id":77.*"id":99/);
  assert.equal(mutations, 0);
  const result = await runPublishedContinuation("finalize", f.continuation, dependencies);
  assert.equal(result.outcome, "PUBLIC_NOT_TERMINALLY_VERIFIED"); assert.equal(mutations, 2);
  for (const existing of [{ ...f.release, draft: true, assets: [] }, f.release]) {
    let writes = 0;
    const releaseRequest = async (path, options) => {
      if (options?.method) { writes++; throw Error("mutation forbidden"); }
      if (path === `/repos/hugefiver/ocmm/releases/tags/${f.identity.tag}`) {
        if (existing.draft) return null;
        return existing;
      }
      if (path === "/repos/hugefiver/ocmm/releases?per_page=100&page=1") return [existing];
      if (path === "/repos/hugefiver/ocmm/releases/44") return existing;
      throw Error(`unexpected release route ${path}`);
    };
    await assert.rejects(() => runPublishedContinuation("finalize", f.continuation, { ...dependencies,
      originLoader: async directory => {
        for (const [name, bytes] of f.assets) writeFileSync(join(directory, name), bytes);
        writeFileSync(join(directory, "context.json"), JSON.stringify(f.context)); writeFileSync(join(directory, "identity.json"), JSON.stringify(f.identity));
        return f.origin;
      }, stageTransport: (directory, context) => stageDraftTransport(directory, context, releaseRequest) }), /Release already exists/);
    assert.equal(writes, 0);
  }
});

for (const change of ["unchanged", "replacement-release", "replacement-asset", "replacement-asset-before-patch", "unapproved-mutation"] as const) {
  test(`created draft finalization binds ${change} to original IDs before public PATCH`, async () => {
    const f = scenario(), envelope = await envelopeFor(f);
    f.run.status = "in_progress"; f.run.conclusion = null;
    f.jobs[1].status = "in_progress"; f.jobs[1].conclusion = null;
    const current = { ...structuredClone(f.release), draft: true };
    const staged = { releaseId: String(current.id), assets: current.assets.map(({ id, name }) => ({ id: String(id), name })) };
    if (change === "replacement-release") current.id = 45;
    if (change === "replacement-asset") current.assets[0].id = 999;
    let patches = 0, releaseReads = 0, unapprovedMutations = 0;
    const releaseRequest = async (path, options = {}) => {
      if (options.method === "PATCH") { patches++; return { ...current, draft: false }; }
      if (options.method && options.method !== "GET") { unapprovedMutations++; throw Error("unapproved mutation reached backend"); }
      if (path === "/repos/hugefiver/ocmm/releases?per_page=100&page=1") return [current];
      if (path === `/repos/hugefiver/ocmm/releases/${current.id}`) {
        releaseReads++;
        if (change === "replacement-asset-before-patch" && releaseReads === 2) current.assets[0].id = 999;
        return current;
      }
      const asset = current.assets.find(candidate => path === `/repos/hugefiver/ocmm/releases/assets/${candidate.id}`);
      if (asset) return f.assets.get(asset.name);
      if (path === `/repos/hugefiver/ocmm/git/ref/tags/${f.identity.tag}`)
        return { ref: `refs/tags/${f.identity.tag}`, object: { type: "commit", sha: f.identity.releaseSha } };
      throw Error(`unexpected finalizer request ${path}`);
    };
    const invoke = () => runPublishedContinuation("finalize", f.continuation, {
      request: requests(f).request, proofArtifactId: "88", findExistingRelease: async () => null, releaseRequest,
      originLoader: async directory => {
        for (const [name, bytes] of f.assets) writeFileSync(join(directory, name), bytes);
        writeFileSync(join(directory, "context.json"), JSON.stringify(f.context)); writeFileSync(join(directory, "identity.json"), JSON.stringify(f.identity));
        return f.origin;
      },
      downloadArtifact: (_artifact, output) => writeFileSync(join(output, "dsmm-registry-verification.json"), JSON.stringify(envelope)),
      stageTransport: async () => staged,
      finalize: (directory, context, verification, request = releaseRequest) => change === "unapproved-mutation"
        ? request("/repos/hugefiver/ocmm/releases/44", { method: "DELETE" })
        : finalizeRelease(directory, context, verification, request, { registryCheck: async () => f.registry }),
    });
    if (change === "unchanged") {
      const result = await invoke();
      assert.equal(result.releaseId, "44"); assert.equal(patches, 1);
    } else {
      await assert.rejects(invoke);
      assert.equal(patches, 0, "replacement Release/assets must not receive a public finalization PATCH");
    }
    assert.equal(unapprovedMutations, 0);
  });
}

test("dispatch-only YAML and CLIs exclude publisher/pack/build/retag and preserve strict normal terminal", () => {
  assert.deepEqual([...yaml.matchAll(/^  ([a-z-]+):\r?$/gmu)].filter(match => ["verify", "github-release"].includes(match[1])).map(match => match[1]), ["verify", "github-release"]);
  assert.equal((yaml.match(/contents: write/gu) ?? []).length, 1);
  assert.equal((yaml.match(/actions: read/gu) ?? []).length, 3);
  assert.equal((yaml.match(/persist-credentials: false/gu) ?? []).length, 2);
  assert.equal((yaml.match(/fetch-depth: 0/gu) ?? []).length, 2);
  assert.match(yaml, /group: dsmm-npm-publication\r?\n  cancel-in-progress: false/u);
  assert.match(yaml, /needs: verify/u); assert.match(yaml, /needs\.verify\.result == 'success'/u);
  assert.match(yaml, /DSMM_PROOF_ARTIFACT_ID: \$\{\{ needs\.verify\.outputs\.artifact-id \}\}/u);
  assert.doesNotMatch(yaml, /id-token:|inputs:|push:|pull_request:|NPM_TOKEN|NODE_AUTH_TOKEN|--clobber|npm publish|pnpm publish|pnpm.*pack|pnpm.*build|pnpm.*install|git tag|import-bootstrap|dsmm-release\.mjs/u);
  assert.equal((yaml.match(/uses: actions\/upload-artifact@/gu) ?? []).length, 1);
  assert.equal(parseContinuationArguments(["verify", "--control-root", "control", "--receipt", "new.json"]).stage, "verify");
  assert.equal(parseCompletionArguments(["terminal-continuation", "--run-id", "5678", "--run-attempt", "2", "--control-sha", "b".repeat(40), "--receipt", "new.json"]).mode, "terminal-continuation");
  for (const args of [["publish", "--control-root", "control"], ["verify", "--control-root", "control"],
    ["finalize", "--control-root", "control", "--proof-artifact-id", "bad"], ["finalize", "--control-root", "control", "--proof-artifact-id", "88", "--receipt", "new.json"]])
    assert.throws(() => parseContinuationArguments(args));
});
