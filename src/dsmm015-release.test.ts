import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Release controller is an independently executed JS surface.
import { UI_CHECKS, UI_CHECKS_015, uiChecksForVersion, validateDockerReceipt, verifyRegistryArtifact, resolveReleaseContext, createArtifactIdentity, computeDigests, POLICY } from "../scripts/dsmm-release.mjs";
// @ts-expect-error Mutation-only JS fixture.
import { successorReceiptFixture } from "./dsmm015-release-fixtures.mjs";
// @ts-expect-error Historical fixtures stay unchanged.
import { receiptFixture, contextInput, archiveFiles, packageFiles } from "./dsmm-trusted-release-fixtures.mjs";
// @ts-expect-error Versioned registry verifier is a standalone JS control.
import { COMPILED_FILES, COMPILED_FILES_015, compiledFilesForVersion, validateInstallReceipt } from "../scripts/dsmm-registry-install-probe.mjs";
// @ts-expect-error Same historical fixture builder; its default lane is unchanged.
import { makeInstallFixture } from "./dsmm-trusted-release-fixtures.mjs";
type Json = Record<string, any>;
const identity = { version: "0.1.5", sha256: "a".repeat(64) };

test("0.1.5 successor checks are exact and version gated without changing historical receipts", () => {
  assert.equal(UI_CHECKS.length, 14);
  assert.deepEqual(uiChecksForVersion("0.1.4"), UI_CHECKS);
  assert.deepEqual(uiChecksForVersion("0.1.5"), [...UI_CHECKS, ...UI_CHECKS_015]);
  assert.deepEqual(uiChecksForVersion("0.2.0"), [...UI_CHECKS, ...UI_CHECKS_015]);
  assert.equal(validateDockerReceipt(receiptFixture("0.1.4", identity.sha256), { ...identity, version: "0.1.4" }).uiCheckCount, 14);
  assert.equal(validateDockerReceipt(successorReceiptFixture(), identity).uiCheckCount, 26);
  assert.throws(() => validateDockerReceipt(receiptFixture("0.1.5", identity.sha256), identity), /exact UI check set/);
});

for (const key of UI_CHECKS_015) test(`successor checker refuses missing or false ${key}`, () => {
  for (const absent of [false, true]) {
    const receipt = successorReceiptFixture();
    if (absent) delete receipt.uiProfiles.checks[key]; else receipt.uiProfiles.checks[key] = false;
    assert.throws(() => validateDockerReceipt(receipt, identity));
  }
});

for (const section of ["editor", "sessions", "cold", "startupLock", "routeScenarios", "nativeSelection"]) test(`successor booleans cannot replace missing structured ${section}`, () => {
  const receipt = successorReceiptFixture(); delete receipt.uiProfiles.successorProof[section];
  assert.throws(() => validateDockerReceipt(receipt, identity));
});

const mutations: [string, (proof: Json) => void][] = [
  ["wrong package", (p) => { p.artifactSha256 = "b".repeat(64); }],
  ["checkout implementation", (p) => { p.installedRoot = "/checkout/dsmm"; }],
  ["canned catalog", (p) => { p.editor.models = []; }],
  ["discarded comment", (p) => { p.editor.rawAfter = "{}"; }],
  ["unordered fallback", (p) => { p.editor.savedPolicy.fallbackRoutes.reverse(); }],
  ["invalid raw rewritten", (p) => { p.editor.invalidRawAfterStructuredRefusal = "{}"; }],
  ["global pointer mutated", (p) => { p.sessions.globalPointerAfter = "b".repeat(64); }],
  ["same session twice", (p) => { p.sessions.roots[1].sessionId = p.sessions.roots[0].sessionId; }],
  ["missing CAS refusal", (p) => { p.sessions.refusals.shift(); }],
  ["refused write committed", (p) => { p.sessions.refusals[0].afterSha256 = "0".repeat(64); }],
  ["same epoch reapply", (p) => { p.sessions.reappliedEpoch = p.sessions.roots[0].epochAfter; }],
  ["child recursively changed", (p) => { p.sessions.children[0].epoch = p.sessions.roots[0].epochAfter; }],
  ["cold followed global", (p) => { p.cold.appliedRevision = p.cold.changedGlobalRevision; }],
  ["cold lost history", (p) => { p.cold.visibleAfterSha256 = "0".repeat(64); }],
  ["stock reader never opened", (p) => { p.cold.stockEvents = 0; }],
  ["browser save lock only", (p) => { p.startupLock.phase = "browser-save"; }],
  ["stolen startup lock", (p) => { p.startupLock.ownerAfterSha256 = "0".repeat(64); }],
  ["silent startup baseline", (p) => { p.startupLock.dsmmRuntimeReady = true; }],
  ["official failed startup relabeled exit zero", (p) => { p.startupLock.nativeExit.code = 0; }],
  ["contended startup prepared provider work", (p) => { p.startupLock.observedOperations.nativeRequestPreparations = 1; }],
  ["missing Loader failure", (p) => { p.startupLock.loaderEntries = []; }],
  ["missing native failed admission", (p) => { delete p.startupLock.failedAdmission; }],
  ["foreign failed native admission ancestry", (p) => { p.startupLock.failedAdmission.ancestry[1].uid = 999; }],
  ["failed native admission not actually failed", (p) => { p.startupLock.failedAdmission.failedFiber.state = 2; p.startupLock.failedAdmission.ancestry[0].state = 2; }],
  ["unrelated native failed fiber", (p) => { p.startupLock.failedAdmission.failedFiber.name = "other-plugin"; p.startupLock.failedAdmission.ancestry[0].name = "other-plugin"; }],
  ["fabricated outer native DSMM failure", (p) => { p.startupLock.loaderEntries[0].state = 3; p.startupLock.failedAdmission.ancestry[1].state = 3; }],
  ["false healthy roster", (p) => { p.startupLock.rootRoster[0].broken = undefined; }],
  ["vacuous startup roster", (p) => { p.startupLock.rootRoster = []; }],
  ["primary success replaced by terminal rate limits", (p) => { const scenario = p.routeScenarios.find(({ name }: Json) => name === "startup-primary-lock"); scenario.terminal = "error"; scenario.attempts.forEach((attempt: Json) => { attempt.result = "RATE_LIMIT"; attempt.outputKinds = []; attempt.settlementType = "assistant/attempt"; }); }],
  ["partial output retried at threshold", (p) => { p.routeScenarios.find(({ name }: Json) => name === "rate-limit-rollover").attempts[0].outputKinds = ["text-delta"]; }],
  ["inexact effort substituted everywhere", (p) => { p.routeScenarios.forEach((scenario: Json) => { scenario.headers.forEach((header: Json) => { header.reasoningEffort = "low"; }); scenario.attempts.forEach((attempt: Json) => { attempt.reasoningEffort = "low"; }); }); }],
  ["wrong first-available strategy", (p) => { p.routeScenarios.find(({ name }: Json) => name === "startup-first-available").strategy = "rate-limit-fallback"; }],
  ["unavailable after success silently accepted", (p) => { p.routeScenarios.find(({ name }: Json) => name === "unavailable-later").terminal = "completed"; }],
  ["manual choice replaced by profile primary", (p) => { Object.assign(p.nativeSelection.attempts[1], p.nativeSelection.configuredPrimary); Object.assign(p.nativeSelection.headers[1], p.nativeSelection.configuredPrimary); }],
  ["manual effort silently substituted", (p) => { p.nativeSelection.attempts[3].reasoningEffort = "max"; p.nativeSelection.headers[3].reasoningEffort = "max"; }],
  ["manual route lost on subsequent turn", (p) => { Object.assign(p.nativeSelection.attempts[2], p.nativeSelection.configuredPrimary); Object.assign(p.nativeSelection.headers[2], p.nativeSelection.configuredPrimary); }],
  ["manual route lost on profile reapply", (p) => { Object.assign(p.nativeSelection.attempts[4], p.nativeSelection.configuredPrimary); Object.assign(p.nativeSelection.headers[4], p.nativeSelection.configuredPrimary); }],
  ["manual route lost on cold resume", (p) => { Object.assign(p.nativeSelection.attempts[6], p.nativeSelection.configuredPrimary); Object.assign(p.nativeSelection.headers[6], p.nativeSelection.configuredPrimary); }],
  ["manual endpoint acknowledgement without durable intent", (p) => { p.nativeSelection.choices[0].durableSelection = p.nativeSelection.configuredPrimary; }],
  ["same-value choice has no fresh sequence", (p) => { p.nativeSelection.choices[2].eventSeq = p.nativeSelection.choices[1].eventSeq; }],
  ["manual choice has no actual provider requests", (p) => { p.nativeSelection.attempts = []; }],
  ["manual choice has uncorrelated stream", (p) => { p.nativeSelection.attempts[1].durableStreamSha256 = "0".repeat(64); }],
  ["manual choice differs from durable header reference", (p) => { p.nativeSelection.headers[1].durableHeader = p.nativeSelection.configuredPrimary; }],
  ["manual choice occurred after attempt started", (p) => { p.nativeSelection.headers[1].observedThroughSeq = p.nativeSelection.choices[0].eventSeq - 1; }],
  ["duplicate native attempt within one lifecycle", (p) => { p.nativeSelection.attempts[2].attemptId = p.nativeSelection.attempts[1].attemptId; p.nativeSelection.attempts[2].durableAttemptId = p.nativeSelection.attempts[1].attemptId; }],
  ["cold attempt pretends original Agent lifecycle", (p) => { p.nativeSelection.attempts[6].agentLifecycle = "initial"; }],
  ["old native Agent not disposed for cold proof", (p) => { p.nativeSelection.oldAgentDisposedBeforeResume = false; }],
  ["manual choice pretends picker UI proof", (p) => { p.nativeSelection.pickerUi = "COMPLETED"; }],
];
for (const [label, mutate] of mutations) test(`successor structured proof fails closed: ${label}`, () => {
  const receipt = successorReceiptFixture(); mutate(receipt.uiProfiles.successorProof);
  assert.throws(() => validateDockerReceipt(receipt, identity));
});

test("successor proof accepts genuinely unchanged durable header reuse across turns and same-value choices", () => {
  const receipt = successorReceiptFixture();
  const selection = receipt.uiProfiles.successorProof.nativeSelection;
  selection.headers[2].seq = selection.headers[1].seq;
  for (const index of [4, 5, 6]) selection.headers[index].seq = selection.headers[3].seq;
  assert.doesNotThrow(() => validateDockerReceipt(receipt, identity));
});

for (const scenarioName of successorReceiptFixture().uiProfiles.successorProof.routeScenarios.map(({ name }: Json) => name)) {
  for (const [label, mutate] of [
    ["missing", (p: Json) => { p.routeScenarios = p.routeScenarios.filter(({ name }: Json) => name !== scenarioName); }],
    ["no real attempt", (p: Json) => { p.routeScenarios.find(({ name }: Json) => name === scenarioName).attempts = []; }],
    ["uncorrelated", (p: Json) => { p.routeScenarios.find(({ name }: Json) => name === scenarioName).attempts[0].durableAttemptId = "another-native-attempt"; }],
    ["stream mismatch", (p: Json) => { p.routeScenarios.find(({ name }: Json) => name === scenarioName).attempts[0].durableStreamSha256 = "0".repeat(64); }],
    ["competing retry owner", (p: Json) => { p.routeScenarios.find(({ name }: Json) => name === scenarioName).downstreamAlwaysCalls = 1; }],
    ["replayed tool", (p: Json) => { p.routeScenarios.find(({ name }: Json) => name === scenarioName).toolExecutions = ["read"]; }],
  ] as [string, (p: Json) => void][]) test(`native ${scenarioName} refuses ${label} proof`, () => {
    const receipt = successorReceiptFixture(); mutate(receipt.uiProfiles.successorProof);
    assert.throws(() => validateDockerReceipt(receipt, identity));
  });
}

function registryFixture(version: string) {
  const input = contextInput(); input.ref = `refs/tags/dsmm-scoped-v${version}`; input.packageVersion = version; input.workflowRef = `${POLICY.repository}/${POLICY.workflowFile}@${input.ref}`;
  const context = resolveReleaseContext(input); const tarball = archiveFiles(packageFiles(version)); const digests = computeDigests(tarball);
  const receipt = version === "0.1.5" ? successorReceiptFixture(digests.sha256) : receiptFixture(version, digests.sha256);
  const artifact = createArtifactIdentity(context, tarball, Buffer.from(JSON.stringify(receipt)), { sourceChecks: "COMPLETED" });
  const metadata = { name: POLICY.packageName, version, dist: { shasum: artifact.sha1, integrity: artifact.integrity, tarball: `${POLICY.registry}@dsmm/dsmm/-/dsmm-${version}.tgz`, attestations: { url: `${POLICY.registry}-/npm/v1/attestations/@dsmm%2fdsmm@${version}`, provenance: { predicateType: "https://slsa.dev/provenance/v1" } } } };
  return { artifact, metadata, tarball };
}

test("installed successor bytes cover every policy/session/client module while historical proof keeps its exact nine files", () => {
  assert.equal(COMPILED_FILES.length, 9);
  assert.deepEqual(compiledFilesForVersion("0.1.4"), COMPILED_FILES);
  assert.deepEqual(compiledFilesForVersion("0.1.5"), COMPILED_FILES_015);
  assert.equal(new Set(COMPILED_FILES_015).size, COMPILED_FILES_015.length);
  const fixture = registryFixture("0.1.5");
  const receipt = makeInstallFixture({ identity: fixture.artifact, tarball: fixture.tarball });
  assert.doesNotThrow(() => validateInstallReceipt(receipt, fixture.artifact));
  for (const path of COMPILED_FILES_015) {
    const changed = structuredClone(receipt); delete changed.compiledFiles[path];
    assert.throws(() => validateInstallReceipt(changed, fixture.artifact), /COMPILED_FILES/);
  }
});

test("successor registry verification polls only exact-version 404 reads, within a finite budget", async () => {
  const { artifact } = registryFixture("0.1.5");
  let calls = 0, clock = 0;
  await assert.rejects(verifyRegistryArtifact(artifact, async (url: string, options: Json) => {
    assert.equal(url, `${POLICY.registry}@dsmm%2fdsmm/0.1.5`); assert.equal(options.method, undefined);
    calls++; return new Response("", { status: 404 });
  }, { visibilityDeadlineMs: 6, visibilityPollMs: 2, now: () => clock, wait: async (ms: number) => { clock += ms; } }), /absent/);
  assert.equal(calls, 4); assert.equal(clock, 6);
});

test("historical 0.1.4 verification remains a single read and cannot enter successor visibility polling", async () => {
  const { artifact } = registryFixture("0.1.4"); let calls = 0;
  await assert.rejects(verifyRegistryArtifact(artifact, async () => { calls++; return new Response("", { status: 404 }); }, { wait: async () => { assert.fail("historical verification must not wait"); } }), /absent/);
  assert.equal(calls, 1);
});

test("visibility poll stops immediately on metadata collision and non-404 HTTP errors", async () => {
  const { artifact, metadata } = registryFixture("0.1.5");
  for (const response of [Response.json({ ...metadata, version: "0.1.6" }), new Response("", { status: 503 })]) {
    let calls = 0;
    await assert.rejects(verifyRegistryArtifact(artifact, async () => { calls++; return response; }, { wait: async () => { assert.fail("non-404 must never wait"); } }));
    assert.equal(calls, 1);
  }
});
