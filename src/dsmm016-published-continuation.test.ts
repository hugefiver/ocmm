import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { archiveFiles, contextInput, makeInstallFixture, packageFiles } from "./dsmm-trusted-release-fixtures.mjs";
import { successorReceiptFixture } from "./dsmm015-release-fixtures.mjs";
import { UI_CHECKS_016, computeDigests, createArtifactIdentity, deterministicChecksums, finalizeRelease, resolveReleaseContext, stageDraftTransport, validateTarballBuffer } from "../scripts/dsmm-release.mjs";
import { cleanupOwnedRoot, createOwnedRoot } from "../scripts/dsmm-registry-install-probe.mjs";
import { parseContinuationArguments, runPublishedContinuation } from "../scripts/dsmm-release-continuation.mjs";
import {
  CONTINUATION_WORKFLOW, PUBLISHED_ORIGIN, checkTerminalPublishedContinuation, loadContinuationRun, loadPublishedOrigin,
  parseCompletionArguments, resolvePublishedOriginPolicy, selectContinuationArtifact, validateArtifactArchive, validateArtifactMembers,
  validateContinuationContext, validateContinuationJobs, validateContinuationVerification, validatePublishedOriginIdentity,
  validatePublishedOriginRun, validateRunEvidence, verifyPublishedArtifact,
} from "../scripts/check-dsmm-release-completion.mjs";

const version = "0.1.6";
const workflowFile = ".github/workflows/dsmm-published-continuation-016.yml";
const exactJobs = [["prepare", 111670469274, "success"], ["import-bootstrap", 111670470818, "skipped"],
  ["publish", 111672006891, "success"], ["verify", 111672113877, "failure"], ["github-release", 111672832675, "skipped"]];
const workflowYaml = () => readFileSync(new URL(`../${workflowFile}`, import.meta.url), "utf8");

// Synthetic validator fixtures only; never native acceptance or publication evidence.
function pickerFixture(artifactSha256: string) {
  const epoch = "b".repeat(64), sessionId = "session-owned-picker";
  const target = { provider: "dsmm-picker-fixture", model: "target", reasoningEffort: "high" };
  const profile = { ...target, model: "configured-default", reasoningEffort: "max" };
  const header = (value = "picker-b", disabled = false) => ({ selects: 1, buttons: 0, value, disabled,
    busy: disabled ? "true" : "false", html: '<span role="alert">Synthetic validator fixture</span>' });
  const snapshot = (selected = target, value = "picker-b") => ({ actualCurrentHeader: selected, directory: { current: selected },
    modelProjection: { lastUsed: selected, pending: null }, displayedButtons: [{ aria: `Select model, current ${selected.model === "target" ? "Target Model" : "Configured Default"}, reasoning effort ${selected.reasoningEffort}` }],
    compactHeader: [header(value)], admission: { epoch, profileId: value || null } });
  const rpc = (endpoint: string, id = sessionId, result = "accepted", model = profile) => ({ endpoint, operation: "call", strictGateway: true,
    nativeInvocationStarted: true, nativePeer: "owned-peer", result, payload: { args: { request: { sessionId: id, ...model } } },
    accepted: { sessionId: id, selectedId: "picker-b", admissionEpoch: epoch, profileModel: profile }, ownedCarrierHold: true });
  const actualCall = (selected = target, id = sessionId) => ({ sessionId: id, attemptId: `${id}:1`, ...selected, header: selected });
  const step = (phase: string, nativeCalls: ReturnType<typeof rpc>[], selected = target) => ({ phase, sessionId, nativeCalls,
    actualCalls: [actualCall(selected)], afterRequest: snapshot(selected) });
  const compactSteps: Record<string, unknown>[] = [step("keyboard-normal-profile-keeps-native-model", [rpc("dsmmProfiles/selectSession")]),
    { ...step("explicit-profile-model-native-projection", [rpc("dsmmProfiles/selectSession"), rpc("session/selectModel")], profile), afterSelection: snapshot(profile) },
    step("later-native-picker-choice-wins", [rpc("session/selectModel", sessionId, "accepted", target)])];
  for (const phase of ["same-session-manual-choice-during-profile-cas", "same-pending-native-selection-dedup-during-profile-cas", "same-pending-native-choice-before-host-ack", "native-choice-pending-before-profile-cas"])
    compactSteps.push({ ...step(phase, [rpc("dsmmProfiles/selectSession"), rpc("session/selectModel", sessionId, "accepted", target)]),
      before: { modelProjection: { pending: target }, borrowedClientSelectionEvents: [{ seq: 1 }] },
      afterSubmission: { modelProjection: { pending: target }, borrowedClientSelectionEvents: [{ seq: 2 }] }, borrowedWindowOnly: true,
      newHistoryLease: false, preAck: { directory: { status: "selecting" } }, actualNativeRpcHeldBeforeAck: true, syntheticProjection: false,
      prestart: { directory: { status: "selecting" } }, beforeCasResponse: { directory: { status: "ready" } } });
  compactSteps.push({ ...step("native-running-profile-guard", [rpc("dsmmProfiles/selectSession", sessionId, "dsmm-profiles/refused")]), before: snapshot(), after: snapshot() },
    { ...step("profile-accepted-native-model-unavailable", [rpc("dsmmProfiles/selectSession"), rpc("session/selectModel", sessionId, "session/model-unavailable")]), after: snapshot() },
    { phase: "profile-accepted-no-main-model", sessionId, nativeCalls: [{ ...rpc("dsmmProfiles/selectSession"),
      accepted: { sessionId, selectedId: "picker-no-model", admissionEpoch: epoch } }], after: snapshot(target, "picker-no-model") },
    { phase: "native-main-view-withdrawal-during-profile-cas", oldSessionId: sessionId, currentSessionId: "session-new",
      nativeCalls: [rpc("dsmmProfiles/selectSession")], blankPublicState: { currentSessionId: "session-new" },
      after: { ...snapshot(target, ""), compactHeader: [] }, actualCalls: [actualCall(target, "session-new")], afterRequest: snapshot(target, "") });
  for (const phase of ["responsive-hover-focus", "responsive-pending-cas", "responsive-model-partial-failure", "responsive-no-profile-model"])
    for (const viewport of [375, 768, 1280]) compactSteps.push({ phase, viewport, header: [header("picker-b", phase === "responsive-pending-cas")],
      geometry: { viewportWidth: viewport, focus: true, selectHeight: 32, scrollWidth: 180, clientWidth: 180, seat: { left: 0, right: viewport },
        root: { kind: "root", left: 20, right: 200, clientWidth: 180, scrollWidth: 180, focused: false, outlineExtent: 0 },
        elements: [{ kind: "select", left: 70, right: 190, clientWidth: 120, scrollWidth: 120, focused: true, outlineExtent: 4 }] } });
  return { artifactKind: "ci-frozen-artifact", artifactSha256, packageVersion: version, publicationClaimed: false,
    proofScope: "frozen-artifact-native-picker-and-compact-profile", outcome: "COMPLETED", ownedHomesRemoved: true, lanes: [{
      lane: "present", dsmm: true, artifactKind: "ci-frozen-artifact", artifactSha256, outcome: "OBSERVED", exit: { code: 0, signal: null },
      browserErrors: [], serverErrors: [], authentication: { signedIn: false, copiedBrowserState: false, productionAuthenticationModified: false },
      cleanup: { browserClosed: true, ownedContextClosed: true, hostDisposal: "appExit", serverClosed: true },
      compactShape: { nativeSelects: 1, additionalButtons: 0, nativeRootAndHeaderOwners: true }, installedCandidate: { name: "@dsmm/dsmm",
        version, publicationClaimed: false, packageRoot: "/tmp/dsmm-native-picker-owned/present/profiles/picker-present/node_modules/@dsmm/dsmm",
        hostSha256: artifactSha256, clientSha256: artifactSha256 },
      steps: ["direct-target-new", "direct-target-existing", "other-then-target-existing", "other-then-target-new"].map(phase => ({ ...step(phase, []),
        modelRpcs: phase.startsWith("direct-target") ? [] : [rpc("session/selectModel", sessionId, "accepted", { ...target, model: "other" }), rpc("session/selectModel", sessionId, "accepted", target)] })), compactSteps }] };
}

function receipt016Fixture(digest: string) {
  const receipt = successorReceiptFixture(digest);
  receipt.artifact.package.version = version;
  for (const installed of receipt.installedPackages) installed.version = version;
  receipt.sessionHistory.packageVersion = version; receipt.sessionHistory.installedPackage.version = version;
  Object.assign(receipt.uiProfiles.checks, Object.fromEntries(UI_CHECKS_016.map(check => [check, true])));
  const proof = receipt.uiProfiles.successorProof;
  proof.schemaVersion = 2;
  for (const route of proof.routeScenarios) Object.assign(route, { roleScope: "child", nativeOrigin: "subagent",
    nativeDescriptor: { mode: "one-shot", provider: `dsmm-role-${route.role.slice("dsmm-".length)}` } });
  const inherited = { provider: "dsmm-selection-fixture", model: "native-inherited", reasoningEffort: "high" };
  Object.assign(proof.nativeSelection.attempts[0], inherited, { phase: "native-default" });
  Object.assign(proof.nativeSelection.headers[0], inherited, { durableHeader: inherited });
  receipt.uiProfiles.nativePickerProof = pickerFixture(digest);
  return receipt;
}

function scenario() {
  const fixed = resolvePublishedOriginPolicy(version).origin;
  const context = resolveReleaseContext({ ...contextInput(), packageVersion: fixed.version, ref: `refs/tags/${fixed.tag}`,
    eventSha: fixed.releaseSha, controlSha: fixed.controlSha, workflowSha: fixed.controlSha, peeledSha: fixed.releaseSha,
    workflowRef: `hugefiver/ocmm/.github/workflows/dsmm-release.yml@refs/tags/${fixed.tag}`, runId: fixed.runId, runAttempt: fixed.runAttempt });
  const tarball = archiveFiles(packageFiles(version));
  const receiptBytes = Buffer.from(JSON.stringify(receipt016Fixture(computeDigests(tarball).sha256)));
  const identity = createArtifactIdentity(context, tarball, receiptBytes, { sourceChecks: "COMPLETED" });
  const assets = new Map([[identity.filename, tarball], [identity.receiptFilename, receiptBytes], ["SHA256SUMS.txt", deterministicChecksums(identity)]]);
  const files = validateTarballBuffer(tarball, { version }).files;
  const originRun = { id: Number(fixed.runId), run_attempt: 1, workflow_id: fixed.workflowId, event: "push", head_branch: fixed.tag,
    head_sha: fixed.controlSha, repository: { full_name: fixed.repository }, head_repository: { full_name: fixed.repository }, status: "completed", conclusion: "failure" };
  const originWorkflow = { id: fixed.workflowId, path: ".github/workflows/dsmm-release.yml" };
  const originJobs = exactJobs.map(([name, id, conclusion]) => ({ name, id, conclusion, run_id: Number(fixed.runId), run_attempt: 1, status: "completed" }));
  const originArtifact = { id: fixed.artifactId, name: fixed.artifactName, expired: false, digest: fixed.archiveDigest,
    size_in_bytes: fixed.artifactSize, workflow_run: { id: Number(fixed.runId), head_sha: fixed.controlSha, head_branch: fixed.tag } };
  const origin = { context, identity, files, run: originRun, workflow: originWorkflow,
    jobs: validatePublishedOriginRun(originRun, originWorkflow, originJobs, version), artifact: originArtifact };
  const continuation = { schemaVersion: 1, repository: fixed.repository, defaultBranch: "master", eventName: "workflow_dispatch",
    ref: "refs/heads/master", inputs: {}, eventSha: "b".repeat(40), controlSha: "b".repeat(40), runId: "5678", runAttempt: "2",
    workflow: { file: workflowFile, sha: "b".repeat(40), ref: `hugefiver/ocmm/${workflowFile}@refs/heads/master` },
    controlInDefaultHistory: true, controlsPresent: true, runtime: { platform: "linux", nodeMajor: 24 } };
  const expected = { runId: continuation.runId, runAttempt: continuation.runAttempt, controlSha: continuation.controlSha };
  const run = { ...originRun, id: 5678, run_attempt: 2, workflow_id: 900, event: "workflow_dispatch", head_branch: "master",
    head_sha: continuation.controlSha, conclusion: "success" as string | null };
  const jobs = ["verify", "github-release"].map((name, index) => ({ id: index + 50, name, run_id: 5678, run_attempt: 2,
    status: "completed", conclusion: "success" as string | null, labels: ["ubuntu-latest"] }));
  const artifact = { id: 88, name: "dsmm-registry-verification-5678-2", expired: false, digest: `sha256:${"e".repeat(64)}`,
    size_in_bytes: 100, workflow_run: { id: 5678, head_sha: continuation.controlSha, head_branch: "master" } };
  const registry = { outcome: "COMPLETED", name: "@dsmm/dsmm", version, registry: "https://registry.npmjs.org/",
    sha256: identity.sha256, sha1: identity.sha1, integrity: identity.integrity, size: identity.size,
    provenance: { outcome: "COMPLETED", source: "npm-registry-served-validated-attestation-over-https", predicateType: "https://slsa.dev/provenance/v1",
      sourceSha: fixed.releaseSha, workflowFile: originWorkflow.path, runId: fixed.runId, runAttempt: fixed.runAttempt, independentSigstoreVerification: false } };
  const installed = makeInstallFixture({ identity, tarball });
  const release = { id: 44, tag_name: identity.tag, draft: false, prerelease: false,
    assets: [...assets].map(([name, bytes], index) => ({ id: 100 + index, name, size: bytes.length, state: "uploaded", digest: `sha256:${computeDigests(bytes).sha256}` })) };
  return { fixed, context, identity, files, originRun, originWorkflow, originJobs, originArtifact, origin, continuation, expected, run, jobs, artifact, registry, installed, assets, release };
}

function requests(f: ReturnType<typeof scenario>, yaml = workflowYaml()) {
  const seen: string[] = [];
  const request = (path: string): any => {
    seen.push(path);
    if (path === `actions/runs/${f.fixed.runId}/attempts/1`) return f.originRun;
    if (path === `actions/workflows/${f.fixed.workflowId}`) return f.originWorkflow;
    if (path === `actions/runs/${f.fixed.runId}/attempts/1/jobs?per_page=100`) return { total_count: f.originJobs.length, jobs: f.originJobs };
    if (path === `actions/runs/${f.fixed.runId}/artifacts?per_page=100`) return { total_count: 1, artifacts: [f.originArtifact] };
    if (path === "actions/runs/5678/attempts/2") return f.run;
    if (path === "actions/workflows/900") return { id: 900, path: workflowFile };
    if (path === "actions/runs/5678/attempts/2/jobs?per_page=100") return { total_count: f.jobs.length, jobs: f.jobs };
    if (path === "actions/runs/5678/artifacts?per_page=100") return { total_count: 1, artifacts: [f.artifact] };
    if (path.startsWith("compare/")) return { status: "identical", merge_base_commit: { sha: f.continuation.controlSha } };
    if (path.startsWith("contents/")) {
      const file = path.slice("contents/".length).split("?")[0];
      return { type: "file", path: file, encoding: "base64", content: Buffer.from(file === workflowFile ? yaml : "trusted source").toString("base64") };
    }
    if (path.startsWith("git/ref/")) return { object: { type: "commit", sha: f.fixed.releaseSha } };
    if (path === `releases/tags/${f.fixed.tag}`) return f.release;
    throw new Error(`unexpected request: ${path}`);
  };
  return { request, seen };
}

function verificationFor(f: ReturnType<typeof scenario>) {
  return verifyPublishedArtifact(f.identity, { registryCheck: async () => f.registry, installProbe: async () => f.installed });
}

async function envelopeFor(f: ReturnType<typeof scenario>) {
  return { schemaVersion: 2, mode: "published-continuation", outcome: "COMPLETED", continuation: f.continuation,
    originAcceptedArtifact: { id: f.fixed.artifactId, archiveDigest: f.fixed.archiveDigest, runId: f.fixed.runId, runAttempt: "1" },
    verification: await verificationFor(f) };
}

test("016 immutable allowlist is explicit and leaves historical default constants intact", () => {
  const policy = resolvePublishedOriginPolicy(version);
  assert.equal(resolvePublishedOriginPolicy().origin, PUBLISHED_ORIGIN);
  assert.equal(resolvePublishedOriginPolicy().workflow, CONTINUATION_WORKFLOW);
  assert.equal(policy.workflow, workflowFile);
  assert.deepEqual(policy.origin, { repository: "hugefiver/ocmm", version, tag: "dsmm-scoped-v0.1.6",
    controlSha: "d2e499b3a61ef76033d417efbec3402a4739a8fe", releaseSha: "d2e499b3a61ef76033d417efbec3402a4739a8fe",
    workflowId: 374825007, runId: "37281521750", runAttempt: "1", artifactId: 11332299033,
    artifactName: "dsmm-accepted-37281521750-1", artifactSize: 359262,
    archiveDigest: "sha256:3fedc92c35a88f0a75fdfc6ac8ef9a37ef138d902e5698f90ac969f66f6f4eb9",
    filename: "dsmm-dsmm-0.1.6.tgz", sha256: "b7b36fc69e892fb22b06a2428d360181d33bd95526ee2bc403c04b6307ed6c35" });
  assert.deepEqual(policy.jobs.map(({ name, id, conclusion }) => [name, id, conclusion]), exactJobs);
  assert.ok(Object.isFrozen(policy) && Object.isFrozen(policy.origin) && Object.isFrozen(policy.jobs) && policy.jobs.every(Object.isFrozen));
  for (const selector of ["0.1.5", "016", "__proto__", null, { ...policy.origin, sha256: "a".repeat(64) }])
    assert.throws(() => resolvePublishedOriginPolicy(selector));
});

test("016 fixed origin validates original failed five-job history and rejects every altered identity", () => {
  const f = scenario();
  assert.equal(validatePublishedOriginRun(f.originRun, f.originWorkflow, f.originJobs, version).length, 5);
  assert.throws(() => validatePublishedOriginRun(f.originRun, f.originWorkflow, f.originJobs));
  assert.throws(() => validateRunEvidence(f.originRun, f.originWorkflow, f.originJobs, f.identity, f.fixed), /successfully terminated/);
  for (const mutate of [
    (copy: typeof f) => { copy.originRun.conclusion = "success"; }, (copy: typeof f) => { copy.originRun.run_attempt = 2; },
    (copy: typeof f) => { copy.originRun.head_sha = PUBLISHED_ORIGIN.controlSha; }, (copy: typeof f) => { copy.originRun.head_branch = PUBLISHED_ORIGIN.tag; },
    (copy: typeof f) => { copy.originWorkflow.path = workflowFile; }, (copy: typeof f) => { copy.originWorkflow.id++; },
    (copy: typeof f) => { copy.originJobs.pop(); }, (copy: typeof f) => { copy.originJobs[2].id = 99; },
    (copy: typeof f) => { copy.originJobs[3].conclusion = "success"; }, (copy: typeof f) => { copy.originJobs[4].run_attempt = 2; },
  ]) { const copy = structuredClone(f); mutate(copy); assert.throws(() => validatePublishedOriginRun(copy.originRun, copy.originWorkflow, copy.originJobs, version)); }
  const pinned = { ...f.identity, sha256: f.fixed.sha256 };
  assert.equal(validatePublishedOriginIdentity(pinned, version), pinned);
  assert.throws(() => validatePublishedOriginIdentity(pinned));
  for (const patch of [{ version: "0.1.4" }, { tag: PUBLISHED_ORIGIN.tag }, { sha256: PUBLISHED_ORIGIN.sha256 },
    { filename: PUBLISHED_ORIGIN.filename }, { runId: PUBLISHED_ORIGIN.runId }, { runAttempt: "2" }, { provenance: false },
    { controlSha: PUBLISHED_ORIGIN.controlSha }, { releaseSha: PUBLISHED_ORIGIN.releaseSha }])
    assert.throws(() => validatePublishedOriginIdentity({ ...pinned, ...patch }, version));
});

test("016 archive binding includes exact name ID size digest source and safe membership", () => {
  const f = scenario();
  assert.equal(selectContinuationArtifact([f.originArtifact], f.fixed, { accepted: true, originVersion: version }).id, f.fixed.artifactId);
  assert.throws(() => selectContinuationArtifact([f.originArtifact], f.fixed, { accepted: true }));
  for (const patch of [{ id: PUBLISHED_ORIGIN.artifactId }, { name: PUBLISHED_ORIGIN.artifactName }, { size_in_bytes: 359261 },
    { digest: PUBLISHED_ORIGIN.archiveDigest }, { expired: true }, { workflow_run: { ...f.originArtifact.workflow_run, head_sha: PUBLISHED_ORIGIN.controlSha } },
    { workflow_run: { ...f.originArtifact.workflow_run, head_branch: PUBLISHED_ORIGIN.tag } }])
    assert.throws(() => selectContinuationArtifact([{ ...f.originArtifact, ...patch }], f.fixed, { accepted: true, originVersion: version }));
  assert.throws(() => selectContinuationArtifact([f.originArtifact, f.originArtifact], f.fixed, { accepted: true, originVersion: version }));
  assert.throws(() => selectContinuationArtifact([f.originArtifact], { ...f.fixed, runAttempt: "2" }, { accepted: true, originVersion: version }));
  const members = ["context.json", "identity.json", f.fixed.filename, "docker-receipt-native-session-control.json", "SHA256SUMS.txt"];
  validateArtifactMembers(members, f.originArtifact, f.fixed);
  assert.throws(() => validateArtifactMembers([...members, "extra"], f.originArtifact, f.fixed));
  assert.throws(() => validateArtifactMembers([...members.slice(0, 4), "../SHA256SUMS.txt"], f.originArtifact, f.fixed));
  const bytes = Buffer.from("original archive"), artifact = { ...f.originArtifact, digest: `sha256:${computeDigests(bytes).sha256}`, size_in_bytes: bytes.length };
  validateArtifactArchive(bytes, artifact);
  assert.throws(() => validateArtifactArchive(Buffer.from("changed archive"), artifact));
  assert.throws(() => validateArtifactArchive(bytes, { ...artifact, size_in_bytes: bytes.length + 1 }));
});

test("016 origin loader fixes attempt before download and refuses substitute tarball Docker or checksum bytes", async () => {
  for (const alteration of ["synthetic", "tarball", "docker", "checksum"] as const) {
    const f = scenario(), api = requests(f), owner = createOwnedRoot();
    const directory = join(owner.root, "accepted"); mkdirSync(directory);
    try {
      await assert.rejects(() => loadPublishedOrigin(directory, { originVersion: version, request: api.request, downloadArtifact: (_artifact, output, expected) => {
        assert.equal(expected, f.fixed);
        for (const [name, bytes] of f.assets) writeFileSync(join(output, name), bytes);
        writeFileSync(join(output, "context.json"), JSON.stringify(f.context)); writeFileSync(join(output, "identity.json"), JSON.stringify(f.identity));
        if (alteration !== "synthetic") writeFileSync(join(output, alteration === "tarball" ? f.identity.filename
          : alteration === "docker" ? f.identity.receiptFilename : "SHA256SUMS.txt"), "changed bytes");
      } }));
      assert.ok(api.seen.includes(`actions/runs/${f.fixed.runId}/attempts/1`));
      assert.ok(!api.seen.includes(`actions/runs/${f.fixed.runId}`));
    } finally { cleanupOwnedRoot(owner); }
  }
  let requestsMade = 0;
  await assert.rejects(() => loadPublishedOrigin("unused", { originVersion: "0.1.5", request: () => { requestsMade++; } }));
  assert.equal(requestsMade, 0);
});

test("016 actual continuation requires its dedicated no-input workflow and literal selector", () => {
  const f = scenario(), api = requests(f);
  assert.equal(loadContinuationRun(f.continuation, { request: api.request, originVersion: version }).jobs.length, 2);
  assert.throws(() => loadContinuationRun(f.continuation, { request: api.request }));
  const oldContext = { ...f.continuation, workflow: { ...f.continuation.workflow, file: CONTINUATION_WORKFLOW,
    ref: `hugefiver/ocmm/${CONTINUATION_WORKFLOW}@refs/heads/master` } };
  assert.throws(() => validateContinuationContext(oldContext, oldContext, version));
  for (const patch of [{ inputs: { version } }, { ref: "refs/tags/unsafe" }, { controlSha: f.fixed.controlSha },
    { controlInDefaultHistory: false }, { controlsPresent: false }, { eventSha: "c".repeat(40) },
    { runtime: { platform: "win32", nodeMajor: 24 } }, { runtime: { platform: "linux", nodeMajor: 22 } }])
    assert.throws(() => validateContinuationContext({ ...f.continuation, ...patch }, f.expected, version));
  const yaml = workflowYaml();
  for (const changed of [yaml.replace("  workflow_dispatch:", "  workflow_dispatch:\n    inputs:\n      version:\n        type: string"),
    yaml.replaceAll("--origin-version 0.1.6", "--origin-version 0.1.4"), yaml.replaceAll(" --origin-version 0.1.6", ""),
    yaml.replace("actions: read", "id-token: write")])
    assert.throws(() => loadContinuationRun(f.continuation, { request: requests(f, changed).request, originVersion: version }));
  for (const mutate of [(jobs: typeof f.jobs) => jobs.push({ ...jobs[0], name: "extra" }),
    (jobs: typeof f.jobs) => { jobs[0].conclusion = "failure"; }, (jobs: typeof f.jobs) => { jobs[1].run_attempt = 1; }]) {
    const jobs = structuredClone(f.jobs); mutate(jobs); assert.throws(() => validateContinuationJobs(jobs, f.continuation));
  }
  for (const route of ["actions/workflows/900", "compare/"]) assert.throws(() => loadContinuationRun(f.continuation, { originVersion: version,
    request: path => path.startsWith(route) ? route.startsWith("compare") ? { status: "diverged" } : { id: 900, path: CONTINUATION_WORKFLOW } : api.request(path) }));
  for (const patch of [{ head_branch: "other" }, { head_sha: "c".repeat(40) }, { run_attempt: 1 }, { conclusion: "failure" }]) {
    const copy = scenario(); Object.assign(copy.run, patch);
    assert.throws(() => loadContinuationRun(copy.continuation, { request: requests(copy).request, originVersion: version }));
  }
});

test("016 proof wraps original provenance and cannot mix archive context native bytes or origins", async () => {
  const f = scenario(), envelope = await envelopeFor(f);
  validateContinuationVerification(envelope, f.origin, f.expected, version);
  assert.throws(() => validateContinuationVerification(envelope, f.origin, f.expected));
  for (const mutate of [
    (copy: typeof envelope) => { copy.originAcceptedArtifact.id = PUBLISHED_ORIGIN.artifactId; },
    (copy: typeof envelope) => { copy.originAcceptedArtifact.archiveDigest = PUBLISHED_ORIGIN.archiveDigest; },
    (copy: typeof envelope) => { copy.originAcceptedArtifact.runAttempt = "2"; },
    (copy: typeof envelope) => { copy.continuation.runAttempt = "1"; },
    (copy: typeof envelope) => { copy.verification.registry.provenance.runId = PUBLISHED_ORIGIN.runId; },
    (copy: typeof envelope) => { copy.verification.registry.provenance.runAttempt = "2"; },
    (copy: typeof envelope) => { copy.verification.registry.provenance.sourceSha = PUBLISHED_ORIGIN.releaseSha; },
    (copy: typeof envelope) => { copy.verification.identity.runId = "5678"; },
    (copy: typeof envelope) => { copy.verification.freshInstall.cleanup.outcome = "FAILED"; },
    (copy: typeof envelope) => { copy.verification.freshInstall.compiledFiles["lib/profile-runtime.js"].sha256 = "c".repeat(64); },
    (copy: typeof envelope) => { copy.verification.freshInstall.nativeMetadata.locales.en.description = "altered metadata"; },
  ]) { const copy = structuredClone(envelope); mutate(copy); assert.throws(() => validateContinuationVerification(copy, f.origin, f.expected, version)); }
  assert.throws(() => validateContinuationVerification(envelope, { ...f.origin, identity: { ...f.identity, version: "0.1.4" } }, f.expected, version));
});

test("016 two-run terminal proves failed origin and successful actual proof without republishing", async () => {
  const f = scenario(), api = requests(f), envelope = await envelopeFor(f);
  let registryChecks = 0;
  // Synthetic archives cannot reproduce the already-published SHA256; only this loader seam is replaced.
  const dependencies = { originVersion: version, request: api.request, originLoader: async (_directory, options) => {
    assert.equal(options.originVersion, version); return f.origin;
  }, downloadArtifact: (_artifact, output) => writeFileSync(join(output, "dsmm-registry-verification.json"), JSON.stringify(envelope)),
  fetchAsset: async asset => f.assets.get(asset.name), publishedCheck: (identity, options) => verifyPublishedArtifact(identity, {
    ...options, registryCheck: async () => { registryChecks++; return f.registry; } }) };
  const receipt = await checkTerminalPublishedContinuation(f.expected, dependencies);
  assert.equal(receipt.outcome, "COMPLETED"); assert.equal(receipt.schemaVersion, 2);
  assert.equal(receipt.originWorkflow.runId, f.fixed.runId); assert.equal(receipt.originWorkflow.conclusion, "failure");
  assert.equal(receipt.originWorkflow.jobs.find(job => job.name === "verify").conclusion, "failure");
  assert.equal(receipt.continuationWorkflow.file, workflowFile); assert.equal(receipt.continuationWorkflow.runAttempt, "2");
  assert.equal(receipt.publication.registry.provenance.runId, f.fixed.runId); assert.equal(receipt.verificationProof.id, 88);
  assert.equal(receipt.originAcceptedArtifact.id, f.fixed.artifactId); assert.equal(receipt.githubRelease.assetIds.length, 3); assert.equal(registryChecks, 1);
  await assert.rejects(() => checkTerminalPublishedContinuation({ ...f.expected, runAttempt: "1" }, dependencies));
  await assert.rejects(() => checkTerminalPublishedContinuation(f.expected, { ...dependencies, originVersion: "0.1.4" }));
  await assert.rejects(() => checkTerminalPublishedContinuation(f.expected, { ...dependencies, request: path => path.startsWith("git/ref/")
    ? { object: { type: "commit", sha: PUBLISHED_ORIGIN.releaseSha } } : api.request(path) }));
  for (const patch of [{ draft: true }, { tag_name: PUBLISHED_ORIGIN.tag }, { assets: f.release.assets.slice(1) }])
    await assert.rejects(() => checkTerminalPublishedContinuation(f.expected, { ...dependencies,
      request: path => path.startsWith("releases/tags/") ? { ...f.release, ...patch } : api.request(path) }));
  await assert.rejects(() => checkTerminalPublishedContinuation(f.expected, { ...dependencies,
    fetchAsset: async asset => asset.name === "SHA256SUMS.txt" ? Buffer.from("changed checksum") : f.assets.get(asset.name) }));
});

for (const change of ["unchanged", "existing-public", "partial-draft", "replacement-release", "replacement-asset", "late-swap", "unapproved-mutation"] as const) {
  test(`016 create-only finalizer preserves original IDs for ${change}`, async () => {
    const f = scenario(), envelope = await envelopeFor(f);
    f.run.status = "in_progress"; f.run.conclusion = null; f.jobs[1].status = "in_progress"; f.jobs[1].conclusion = null;
    const current = { ...structuredClone(f.release), draft: true };
    const staged = { releaseId: "44", assets: current.assets.map(({ id, name }) => ({ id: String(id), name })) };
    if (change === "replacement-release") current.id = 45;
    if (change === "replacement-asset") current.assets[0].id = 999;
    let patches = 0, writes = 0, releaseReads = 0;
    const releaseRequest = async (path, options = {}) => {
      if (options.method === "PATCH") { patches++; return { ...current, draft: false }; }
      if (options.method && options.method !== "GET") { writes++; throw Error("unexpected mutation"); }
      if (path === "/repos/hugefiver/ocmm/releases?per_page=100&page=1") return [current];
      if (path === `/repos/hugefiver/ocmm/releases/${current.id}`) {
        if (change === "late-swap" && ++releaseReads === 2) current.assets[0].id = 999;
        return current;
      }
      const asset = current.assets.find(candidate => path === `/repos/hugefiver/ocmm/releases/assets/${candidate.id}`);
      if (asset) return f.assets.get(asset.name);
      if (path === `/repos/hugefiver/ocmm/git/ref/tags/${f.identity.tag}`)
        return { ref: `refs/tags/${f.identity.tag}`, object: { type: "commit", sha: f.identity.releaseSha } };
      throw Error(`unexpected finalizer request ${path}`);
    };
    const existing = change === "existing-public" ? f.release : change === "partial-draft" ? { ...current, assets: [] } : null;
    const dependencies = { originVersion: version, request: requests(f).request, proofArtifactId: "88", releaseRequest,
      findExistingRelease: async () => existing,
      originLoader: async directory => {
        for (const [name, bytes] of f.assets) writeFileSync(join(directory, name), bytes);
        writeFileSync(join(directory, "context.json"), JSON.stringify(f.context)); writeFileSync(join(directory, "identity.json"), JSON.stringify(f.identity));
        return f.origin;
      }, downloadArtifact: (_artifact, output) => writeFileSync(join(output, "dsmm-registry-verification.json"), JSON.stringify(envelope)),
      stageTransport: async () => { writes++; return staged; },
      finalize: (directory, context, verification, request) => change === "unapproved-mutation"
        ? request("/repos/hugefiver/ocmm/releases/44", { method: "DELETE" })
        : finalizeRelease(directory, context, verification, request, { registryCheck: async () => f.registry }) };
    if (change === "unchanged") {
      const result = await runPublishedContinuation("finalize", f.continuation, dependencies);
      assert.equal(result.releaseId, "44"); assert.equal(patches, 1); assert.equal(writes, 1);
    } else {
      await assert.rejects(() => runPublishedContinuation("finalize", f.continuation, dependencies)); assert.equal(patches, 0);
      if (existing) {
        assert.equal(writes, 0);
        await assert.rejects(() => runPublishedContinuation("finalize", f.continuation, { ...dependencies,
          findExistingRelease: async () => null, stageTransport: (directory, context) => stageDraftTransport(directory, context, async (path, options = {}) => {
            if (options.method && options.method !== "GET") { writes++; throw Error("mutation forbidden"); }
            if (path === `/repos/hugefiver/ocmm/releases/tags/${f.identity.tag}`) return existing.draft ? null : existing;
            if (path === "/repos/hugefiver/ocmm/releases?per_page=100&page=1") return [existing];
            throw Error(`unexpected discovery ${path}`);
          }) }));
        assert.equal(writes, 0);
      }
    }
  });
}

test("016 controller never mutates with unknown origin or wrong proof artifact", async () => {
  const f = scenario(), envelope = await envelopeFor(f);
  f.run.status = "in_progress"; f.run.conclusion = null; f.jobs[1].status = "in_progress"; f.jobs[1].conclusion = null;
  let calls = 0;
  const dependencies = { originVersion: version, request: requests(f).request, originLoader: async () => f.origin,
    proofArtifactId: "89", downloadArtifact: (_artifact, output) => writeFileSync(join(output, "dsmm-registry-verification.json"), JSON.stringify(envelope)),
    findExistingRelease: async () => { calls++; return null; }, stageTransport: async () => { calls++; throw Error("mutation forbidden"); } };
  await assert.rejects(() => runPublishedContinuation("finalize", f.continuation, dependencies)); assert.equal(calls, 0);
  await assert.rejects(() => runPublishedContinuation("verify", f.continuation, { ...dependencies, originVersion: "0.1.5", request: () => { calls++; } }));
  assert.equal(calls, 0);
  const fresh = await runPublishedContinuation("verify", f.continuation, { ...dependencies, publishedCheck: () => verificationFor(f) });
  assert.equal(fresh.originAcceptedArtifact.id, f.fixed.artifactId); assert.equal(fresh.verification.identity.runId, f.fixed.runId); assert.equal(calls, 0);
});

test("016 no-input workflow and CLI select only continuation with unchanged default argument shapes", () => {
  const yaml = workflowYaml();
  assert.deepEqual([...yaml.matchAll(/^  ([a-z-]+):\r?$/gmu)].filter(match => ["verify", "github-release"].includes(match[1])).map(match => match[1]), ["verify", "github-release"]);
  assert.equal((yaml.match(/--origin-version 0\.1\.6/gu) ?? []).length, 2);
  assert.equal((yaml.match(/contents: write/gu) ?? []).length, 1); assert.equal((yaml.match(/actions: read/gu) ?? []).length, 3);
  assert.equal((yaml.match(/persist-credentials: false/gu) ?? []).length, 2); assert.equal((yaml.match(/fetch-depth: 0/gu) ?? []).length, 2);
  assert.match(yaml, /group: dsmm-npm-publication\r?\n  cancel-in-progress: false/u);
  assert.match(yaml, /ref: \$\{\{ github\.workflow_sha \}\}/u); assert.match(yaml, /PNPM_VERSION: "11\.9\.0"/u);
  assert.doesNotMatch(yaml, /id-token:|inputs:|push:|pull_request:|NPM_TOKEN|NODE_AUTH_TOKEN|--clobber|npm publish|pnpm publish|pnpm.*pack|pnpm.*build|pnpm.*install|git tag|import-bootstrap|dsmm-release\.mjs/u);
  assert.deepEqual(parseContinuationArguments(["verify", "--control-root", "control", "--receipt", "new.json"]),
    { stage: "verify", "control-root": "control", receipt: "new.json" });
  assert.equal(parseContinuationArguments(["verify", "--control-root", "control", "--receipt", "new.json", "--origin-version", version])["origin-version"], version);
  const terminal = ["--run-id", "5678", "--run-attempt", "2", "--control-sha", "b".repeat(40), "--receipt", "new.json"];
  assert.equal(parseCompletionArguments(["terminal-continuation", ...terminal, "--origin-version", version])["origin-version"], version);
  assert.equal(Object.hasOwn(parseCompletionArguments(["terminal-continuation", ...terminal]), "origin-version"), false);
  for (const mode of ["verify", "terminal"]) assert.throws(() => parseCompletionArguments([mode, ...terminal, "--artifact-dir", "fixture", "--origin-version", version]));
  assert.throws(() => parseCompletionArguments(["terminal-continuation", ...terminal, "--origin-version", "0.1.5"]));
  assert.throws(() => parseContinuationArguments(["verify", "--control-root", "control", "--receipt", "new.json", "--origin-version", "0.1.5"]));
});
