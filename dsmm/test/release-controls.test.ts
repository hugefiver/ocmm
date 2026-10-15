import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Source-only release controls are deliberately not published.
import * as controls from "../scripts/dsmm-release.mjs";
// @ts-expect-error Source-only registry probe is deliberately not published.
import * as probe from "../scripts/dsmm-registry-install-probe.mjs";
// @ts-expect-error Source-only completion checker is deliberately not published.
import * as completion from "../scripts/check-dsmm-release-completion.mjs";
// @ts-expect-error Source-only version contract is deliberately not published.
import { COMPILED_NAMES_020, COMPILED_NAMES_021, COMPILED_NAMES_022, COLD_PROFILE_SCRIPTS_022, PRESET_NAMES_020, SKILL_EXECUTABLES_020, STABLE_UI_CHECKS_021, STABLE_UI_CHECKS_022, CORE_CHECKS_020, isSource020, isSource021, isSource022, isReviewedSource, isStableNativeSource, roleToolsForVersion, sourceContractForVersion, skillExecutablesForVersion, stableUiKindForVersion, startupProfileContract } from "../scripts/release-contract.mjs";
// @ts-expect-error Historical acceptance is a distinct source-only grammar.
import { sessionProfileChecksForVersion, validateSessionProfileProof, validateStartupProfileProof } from "../scripts/profile-ui-harness-native.mjs";
// @ts-expect-error Historical acceptance is a distinct source-only producer.
import { runStartupLockContention } from "../scripts/profile-ui-acceptance.mjs";
// @ts-expect-error Historical acceptance is a distinct source-only grammar.
import { nativePickerContract } from "../scripts/native-picker-harness.mjs";
// @ts-expect-error Synthetic historical data is never native acceptance proof.
import { archiveFiles, contextInput, makeAcceptedFixture, makeInstallFixture, packageFiles, receiptFixture } from "../../src/dsmm-trusted-release-fixtures.mjs";

function artifactFixture(version = "0.2.0") {
  const files = packageFiles(version);
  if (isReviewedSource(version)) {
    const manifest = JSON.parse(files.get("package.json").toString("utf8"));
    manifest.exports = controls.manifestExportsForVersion(version);
    files.set("package.json", Buffer.from(JSON.stringify(manifest)));
    files.set("prompts/source/catalog.json", Buffer.from(JSON.stringify(PRESET_NAMES_020.map((row: { id: string }) => ({ ...row, mode: row.id === "dsmm-planner" ? "all" : ["dsmm-builder", "dsmm-orchestrator"].includes(row.id) ? "primary" : "subagent", enabledByDefault: row.id !== "dsmm-cross-cutting" })))));
    files.set("prompts/source/manifest.json", Buffer.from(JSON.stringify({ files: [] })));
    for (const language of ["en", "zh"]) files.set(`locale/${language}.json`, Buffer.from(JSON.stringify({ meta: { title: "DSMM", description: "Synthetic release metadata" } })));
    for (const path of probe.compiledFilesForVersion(version)) files.set(path, Buffer.from("synthetic compiled fixture\n"));
    for (const path of skillExecutablesForVersion(version)) files.set(path, Buffer.from("synthetic skill resource\n"));
    if (isSource022(version)) {
      for (const path of COLD_PROFILE_SCRIPTS_022) files.set(path, Buffer.from("synthetic cold migration resource\n"));
      for (const path of ["docs/native-permissions.md", "docs/deferred-native-approval-risk.md"]) files.set(path, Buffer.from("synthetic permission resource\n"));
    }
  }
  const tarball = archiveFiles(files), digests = controls.computeDigests(tarball), historical = makeAcceptedFixture();
  const input = contextInput();
  if (version === "0.2.2") Object.assign(input, { eventSha: "b".repeat(40), workflowSha: "b".repeat(40), controlSha: "b".repeat(40), peeledSha: "b".repeat(40), runId: "2222", runAttempt: "2" });
  const context = controls.resolveReleaseContext({ ...input, ref: `refs/tags/dsmm-scoped-v${version}`, packageVersion: version, workflowRef: `hugefiver/ocmm/.github/workflows/dsmm-release.yml@refs/tags/dsmm-scoped-v${version}` });
  const identity = controls.validateArtifactIdentity({ ...historical.identity, ...context, ...digests, filename: `dsmm-dsmm-${version}.tgz`, sourceChecks: "COMPLETED",
    ...(isStableNativeSource(version) ? { dockerAcceptance: { ...historical.identity.dockerAcceptance, sourceContract: version, uiCheckCount: controls.uiChecksForVersion(version).length } } : {}) });
  return { files, tarball, identity, context };
}
function installFixture(version = "0.2.0") {
  const f = artifactFixture(version), receipt = makeInstallFixture(makeAcceptedFixture());
  receipt.version = f.identity.version; receipt.sha256 = f.identity.sha256;
  Object.assign(receipt.registry, { ...controls.computeDigests(f.tarball), tarball: `https://registry.npmjs.org/@dsmm/dsmm/-/dsmm-${receipt.version}.tgz`, sha512: f.identity.integrity.slice(7) });
  receipt.native.commands = probe.lifecycleCommands(receipt.native.profile, receipt.version).map((command: object) => ({ ...command, status: 0, stdoutSha256: f.identity.sha256, stderrSha256: f.identity.sha256 }));
  const file = (path: string) => ({ path, sha256: controls.computeDigests(f.files.get(path)).sha256 });
  receipt.exports = Object.fromEntries(Object.entries(probe.publicExportsForVersion(receipt.version)).map(([name, path]) => [name, file(String(path))]));
  receipt.compiledFiles = Object.fromEntries(probe.compiledFilesForVersion(receipt.version).map((path: string) => [path, file(path)]));
  receipt.checks = Object.fromEntries(probe.requiredChecksForVersion(receipt.version).map((key: string) => [key, true]));
  receipt.nativeMetadata.version = receipt.version;
  receipt.nativeMetadata.locales = probe.validateLocaleResources(new Map([...f.files].filter(([path]) => String(path).startsWith("locale/"))), receipt.version);
  return { ...f, receipt };
}
test("local registry probe accepts exact 020 installed Core/role/client bytes and historical metadata without substituting contracts", () => {
  const f = installFixture();
  assert.equal(probe.validateInstallReceipt(f.receipt, f.identity), f.receipt);
  completion.validateInstalledFileHashes(f.receipt, f.files);
  const historical = makeInstallFixture(makeAcceptedFixture());
  assert.equal(probe.validateInstallReceipt(historical, { version: historical.version, sha256: historical.sha256 }), historical);
  assert.deepEqual(probe.compiledFilesForVersion("0.1.3"), Object.keys(historical.compiledFiles));
  for (const name of COMPILED_NAMES_020) assert.ok(f.receipt.compiledFiles[`lib/${name}.js`]);
  const oldTitle = structuredClone(f.receipt); oldTitle.nativeMetadata.locales.en.title = "Deepwork";
  assert.throws(() => probe.validateInstallReceipt(oldTitle, f.identity));
  const missingCore = structuredClone(f.receipt); delete missingCore.compiledFiles["lib/deployment-config.js"];
  assert.throws(() => probe.validateInstallReceipt(missingCore, f.identity));
  const alteredBytes = new Map(f.files); alteredBytes.set("lib/deployment-config.js", Buffer.from("changed"));
  assert.throws(() => completion.validateInstalledFileHashes(f.receipt, alteredBytes));
  const wrongLocale = new Map(f.files); wrongLocale.set("locale/zh.json", Buffer.from(JSON.stringify({ meta: { title: "Deepwork", description: "old" } })));
  assert.throws(() => controls.validateTarballBuffer(archiveFiles(wrongLocale), { version: "0.2.0" }));
});
test("reviewed source artifact and terminal authority bind fixed source/control/run/attempt and exact mode-specific jobs", () => {
  for (const version of ["0.2.0", "0.2.1", "0.2.2"]) {
    const { identity } = artifactFixture(version);
    const expected = { runId: identity.runId, runAttempt: identity.runAttempt, controlSha: identity.controlSha };
    const run = { id: Number(identity.runId), run_attempt: Number(identity.runAttempt), workflow_id: 123, repository: { full_name: "hugefiver/ocmm" }, head_repository: { full_name: "hugefiver/ocmm" }, status: "completed", conclusion: "success", head_sha: identity.controlSha, head_branch: identity.tag, event: "push" };
    const workflow = { id: 123, path: ".github/workflows/dsmm-release.yml" };
    const jobs = completion.REQUIRED_JOBS.map((name: string, index: number) => ({ id: index + 1, name, run_id: Number(identity.runId), run_attempt: Number(identity.runAttempt), status: "completed", conclusion: name === "import-bootstrap" ? "skipped" : "success" }));
    assert.equal(completion.validateRunEvidence(run, workflow, jobs, identity, expected).length, 5);
    for (const changedRun of [{ ...run, run_attempt: run.run_attempt + 1 }, { ...run, head_sha: "c".repeat(40) }, { ...run, conclusion: "failure" }, { ...run, status: "in_progress" }]) assert.throws(() => completion.validateRunEvidence(changedRun, workflow, jobs, identity, expected));
    assert.throws(() => completion.validateRunEvidence(run, workflow, jobs.slice(1), identity, expected));
    const wrongJob = structuredClone(jobs); wrongJob[0].conclusion = "success";
    assert.throws(() => completion.validateRunEvidence(run, workflow, wrongJob, identity, expected));
    assert.throws(() => controls.validateArtifactIdentity({ ...identity, releaseSha: "c".repeat(40) }));
    assert.throws(() => controls.resolveReleaseContext({ ...contextInput(), packageVersion: version }));
  }
});
test("OIDC-only exact-tarball publication rejects static auth and never enables repacking or registry retry", () => {
  const { identity } = artifactFixture();
  const env = { GITHUB_ACTIONS: "true", ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.actions.githubusercontent.com/oidc", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture" };
  assert.doesNotThrow(() => controls.assertPublishEnvironment(env));
  for (const key of ["NPM_TOKEN", "NODE_AUTH_TOKEN", "NPM_CONFIG_AUTH", "SIGSTORE_ID_TOKEN"]) assert.throws(() => controls.assertPublishEnvironment({ ...env, [key]: "forbidden" }));
  assert.throws(() => controls.assertPublishEnvironment({ ...env, ACTIONS_ID_TOKEN_REQUEST_URL: "https://foreign.example/oidc" }));
  assert.deepEqual(controls.publishArguments(identity, `/owned/${identity.filename}`), ["publish", `/owned/${identity.filename}`, "--access", "public", "--registry=https://registry.npmjs.org/", "--ignore-scripts", "--no-git-checks", "--config.fetch-retries=0", "--provenance"]);
  assert.throws(() => controls.publishArguments(identity, "/owned/repacked.tgz"));
});
test("visibility defaults preserve historical 019 special budget and keep reviewed sources bounded without publishing", async () => {
  for (const [version, expectedBudget] of [["0.1.9", 1_200_000], ["0.2.0", 120_000], ["0.2.1", 120_000], ["0.2.2", 120_000]] as const) {
    const { identity } = artifactFixture(version); let now = 0; let reads = 0;
    await assert.rejects(() => controls.verifyRegistryArtifact(identity, async () => { reads++; return new Response(null, { status: 404 }); }, { now: () => now, wait: async (ms: number) => { now += ms; } }));
    assert.equal(now, expectedBudget); assert.ok(reads > 0);
    await assert.rejects(() => controls.verifyRegistryArtifact(identity, async () => { throw Error("must not fetch"); }, { visibilityDeadlineMs: version === "0.1.9" ? 1_200_001 : 300_001 }));
  }
});

for (const version of ["0.2.1", "0.2.2"]) test(`${version} installs versioned public exports and complete runtime/client bytes without changing historical contracts`, () => {
  const f = installFixture(version);
  assert.equal(probe.validateInstallReceipt(f.receipt, f.identity), f.receipt);
  completion.validateInstalledFileHashes(f.receipt, f.files);
  assert.equal(Object.keys(f.receipt.exports).length, version === "0.2.2" ? 16 : 9);
  assert.equal(f.receipt.exports["./subagent-runtime"].path, "lib/runtime-integration.js");
  assert.equal(f.receipt.exports["./legacy-read-host"].path, "lib/legacy-read-host.js");
  assert.equal(Object.keys(probe.publicExportsForVersion("0.2.0")).length, 7);
  assert.equal(Object.keys(probe.publicExportsForVersion("0.1.3")).length, 7);
  for (const name of version === "0.2.2" ? COMPILED_NAMES_022 : COMPILED_NAMES_021) assert.ok(f.receipt.compiledFiles[`lib/${name}.d.ts`]);
  for (const path of ["lib/runtime-integration.js", "lib/runtime-integration.d.ts", "lib/legacy-read-host.js", "lib/client/ChildrenPanel.js", "lib/profile-diagnostics.js"]) {
    const missing = new Map(f.files); missing.delete(path);
    assert.throws(() => controls.validateTarballBuffer(archiveFiles(missing), { version }));
    const changed = new Map(f.files); changed.set(path, Buffer.from("changed public bytes"));
    assert.throws(() => completion.validateInstalledFileHashes(f.receipt, changed));
  }
  const wrongTarget = new Map(f.files), manifest = JSON.parse(String(wrongTarget.get("package.json")));
  manifest.exports["./subagent-runtime"].default = "./lib/subagent-runtime.js";
  wrongTarget.set("package.json", Buffer.from(JSON.stringify(manifest)));
  assert.throws(() => controls.validateTarballBuffer(archiveFiles(wrongTarget), { version }));
  const oldReceipt = structuredClone(f.receipt); delete oldReceipt.exports["./legacy-read-host"];
  assert.throws(() => probe.validateInstallReceipt(oldReceipt, f.identity));
  if (isSource022(version)) {
    for (const path of COLD_PROFILE_SCRIPTS_022) {
      const missing = new Map(f.files); missing.delete(path);
      assert.throws(() => controls.validateTarballBuffer(archiveFiles(missing), { version }));
      const empty = new Map(f.files); empty.set(path, Buffer.alloc(0));
      assert.throws(() => controls.validateTarballBuffer(archiveFiles(empty), { version }));
    }
    const unverified = structuredClone(f.receipt); delete unverified.checks.coldMigrationResources;
    assert.throws(() => probe.validateInstallReceipt(unverified, f.identity));
  }
});

test("022 tarballs require nonempty permission resources and preserve the exact versioned docs surface", () => {
  const version = "0.2.2", f = artifactFixture(version);
  const accepted = controls.validateTarballBuffer(f.tarball, { version });
  assert.equal(accepted.version, version);
  for (const path of ["docs/native-permissions.md", "docs/deferred-native-approval-risk.md"]) {
    assert.ok(accepted.files.get(path).length > 0);
    const missing = new Map(f.files); missing.delete(path);
    assert.throws(() => controls.validateTarballBuffer(archiveFiles(missing), { version }));
    const empty = new Map(f.files); empty.set(path, Buffer.alloc(0));
    assert.throws(() => controls.validateTarballBuffer(archiveFiles(empty), { version }));
  }
  const unexpected = new Map(f.files); unexpected.set("docs/additional-permissions.md", Buffer.from("unreviewed resource\n"));
  assert.throws(() => controls.validateTarballBuffer(archiveFiles(unexpected), { version }));
  for (const historicalVersion of ["0.1.3", "0.1.9", "0.2.0", "0.2.1"]) {
    const historical = artifactFixture(historicalVersion);
    assert.equal(controls.validateTarballBuffer(historical.tarball, { version: historicalVersion }).version, historicalVersion);
    for (const path of ["docs/native-permissions.md", "docs/deferred-native-approval-risk.md"]) {
      const extra = new Map(historical.files); extra.set(path, Buffer.from("permission resource\n"));
      assert.throws(() => controls.validateTarballBuffer(archiveFiles(extra), { version: historicalVersion }));
    }
  }
});

test("source and startup identities explicitly separate reviewed stable identities from 020 and historical default grammar", () => {
  assert.equal(isSource020("0.2.1"), false); assert.equal(isSource021("0.2.1"), true);
  assert.equal(startupProfileContract("0.2.0", { sourceContract: "0.2.0" }), "central-read-lock-free-020");
  assert.equal(startupProfileContract("0.2.1", { sourceContract: "0.2.1" }), "stable-native-first-021");
  assert.equal(startupProfileContract("0.2.1"), "historical-read-lock");
  assert.throws(() => startupProfileContract("0.2.1", { sourceContract: "0.2.0" }));
  assert.throws(() => startupProfileContract("0.2.0", { sourceContract: "0.2.1" }));
  assert.equal(isSource021("0.2.2"), false); assert.equal(isSource022("0.2.2"), true);
  assert.equal(sourceContractForVersion("0.2.2"), "0.2.2");
  assert.equal(startupProfileContract("0.2.2", { sourceContract: "0.2.2" }), "stable-native-first-022");
  assert.equal(startupProfileContract("0.2.2"), "historical-read-lock");
  assert.throws(() => startupProfileContract("0.2.2", { sourceContract: "0.2.1" }));
  assert.throws(() => startupProfileContract("0.2.1", { sourceContract: "0.2.2" }));
  assert.throws(() => startupProfileContract("0.2.3", { sourceContract: "0.2.3" }));
  assert.deepEqual(controls.uiChecksForVersion("0.2.1"), STABLE_UI_CHECKS_021);
  assert.deepEqual(controls.uiChecksForVersion("0.2.2"), STABLE_UI_CHECKS_022);
  assert.equal(controls.uiChecksForVersion("0.2.0").length, 27);
  const { identity } = artifactFixture("0.2.1");
  const historical = structuredClone(identity); delete historical.dockerAcceptance.sourceContract;
  assert.throws(() => controls.validateArtifactIdentity(historical));
});

function stableUiFixture(version = "0.2.1", sha256 = "a".repeat(64)) {
  const childId = "owned-child", rootId = "owned-root", epoch = "b".repeat(64);
  const nativeCalls = ["dsmmProfiles/describe", "dsmmProfiles/save", "dsmmProfiles/select", "dsmmProfiles/describeSession", "dsmmProfiles/selectSession",
    "dsmmChildren/describe", "dsmmChildren/descendants", "dsmmChildren/prompt", "dsmmChildren/background"].map(endpoint => ({ endpoint, strictGateway: true, nativePeer: "operator", result: "accepted" }));
  return { sha256, version, ui: {
    kind: stableUiKindForVersion(version), sourceContract: version, packageVersion: version, artifactSha256: sha256, artifactSha256After: sha256,
    clientSha256: sha256, clientSha256After: sha256, checks: Object.fromEntries(STABLE_UI_CHECKS_021.map((key: string) => [key, true])),
    pageErrors: [], externalRequests: [], viewport: { width: 1280, height: 900 }, nativeCalls,
    nativeStreams: ["$events", "session/follow", "session/control"].map(endpoint => ({ endpoint, strictGateway: true, nativePeer: "operator", result: "accepted", frames: 1, disposed: true })),
    bootstrap: { startedBundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@dsmm/dsmm"], stockSubagentDisabled: true,
      customRuntimeEntries: 1, mainEntries: 1, runtimeLoaded: true, mainLoaded: true, binding: "dsmm", deliveryFenceReady: true, restartRequired: false, experimentalLegacyRead: "unconfigured/unavailable",
      loader: [{ id: "include:dsmm", name: "@dsmm/dsmm", state: 2 }, { id: "include:dsmm-runtime", name: "@dsmm/dsmm/subagent-runtime", state: 2 }] },
    model: { kind: "deterministic-test-only-adapter", externalModelCalls: false, calls: [{ provider: "dsmm-stable021-fixture", model: "reviewer-original", reasoningEffort: "high" }] },
    cas: { future: { code: "conflict", beforeSha256: sha256, afterSha256: sha256 }, current: { code: "conflict", epoch, beforeSha256: sha256, afterSha256: sha256 } },
    native: { rootId, childId, rootModel: "native-root", originalChildEpoch: epoch, model: "reviewer-original", originalCaptureSha256: sha256, directNativeOwnership: true,
      readonlyDenied: ["write", "edit", "bash", "pwsh"], inboxReceipt: { messageId: "owned-message" },
      messageObservation: { childId, originalChildEpoch: epoch, liveModel: "reviewer-original", acceptedNativeReviewerRequestsWithMessage: 1, captureAfterSha256: sha256 } },
    background: { runId: "owned-run", childId: "background-child", jobId: "owned-job", status: "completed", repeatedStatus: "already-background",
      starts: 1, requests: 1, sameRun: true, sameChild: true, foregroundKind: "background", resultObserved: true },
    safety: { claimedOperatorPeerRefused: true, foreignParentRefused: true, beforeInboxCancellation: true,
      childEventsBeforeSha256: sha256, childEventsAfterSha256: sha256, nativeModelCallsBefore: 2, nativeModelCallsAfter: 2 },
  } };
}

for (const version of ["0.2.1", "0.2.2"]) test(`${version} stable proof requires immutable CAS, actual child delivery, same-run native background and cutoff evidence`, () => {
  const f = stableUiFixture(version);
  assert.equal(controls.validateStableUiProof(f.ui, f), f.ui);
  if (version === "0.2.1") assert.equal(controls.validateStableUiProof021(f.ui, f), f.ui);
  const changes = [
    (ui: any) => { delete ui.cas; },
    (ui: any) => { ui.cas.current.afterSha256 = "c".repeat(64); },
    (ui: any) => { ui.native.messageObservation.acceptedNativeReviewerRequestsWithMessage = 0; },
    (ui: any) => { ui.native.messageObservation.childId = "another-child"; },
    (ui: any) => { ui.native.messageObservation.liveModel = "wrong-model"; },
    (ui: any) => { ui.native.messageObservation.captureAfterSha256 = "c".repeat(64); },
    (ui: any) => { ui.native.directNativeOwnership = false; },
    (ui: any) => { ui.native.readonlyDenied = []; },
    (ui: any) => { delete ui.background; },
    (ui: any) => { ui.background.starts = 2; },
    (ui: any) => { ui.background.status = "running"; },
    (ui: any) => { ui.safety.nativeModelCallsAfter += 1; },
    (ui: any) => { ui.safety.childEventsAfterSha256 = "c".repeat(64); },
    (ui: any) => { ui.nativeStreams[1].disposed = false; },
    (ui: any) => { ui.artifactSha256After = "c".repeat(64); },
    (ui: any) => { ui.clientSha256After = "c".repeat(64); },
  ];
  for (const change of changes) {
    const ui = structuredClone(f.ui); change(ui);
    assert.throws(() => controls.validateStableUiProof(ui, f));
  }
});

function stableDockerFixture(version: string) {
  const artifact = artifactFixture(version), digest = artifact.identity.sha256;
  const receipt = receiptFixture(version, digest), stable = stableUiFixture(version, digest);
  for (const template of ["web", "headless"]) {
    const native = receipt.native[template];
    native.sourceContract = version; native.packageVersion = version; native.artifactSha256 = digest;
    native.bootstrap = structuredClone(stable.ui.bootstrap);
    native.bootstrap.startedBundles[1] = template === "web" ? "@deepseek-ai/dsh-web-app" : "@deepseek-ai/dsh-headless";
    native.branding = { pluginTitle: "DSMM", presetNames: PRESET_NAMES_020,
      rootPresetNames: template === "web" ? PRESET_NAMES_020.filter(({ id }: { id: string }) => ["dsmm-orchestrator", "dsmm-planner"].includes(id)) : [] };
    native.delegation = { roleTools: [...roleToolsForVersion(version)], disabledBuilderAbsent: true, disabledCrossCuttingAbsent: true };
  }
  Object.assign(receipt.uiProfiles, stable.ui);
  receipt.nativeCore = { outcome: "COMPLETED", artifactSha256: digest, packageVersion: version, sourceContract: version,
    bootstrap: { ...stable.ui.bootstrap, deliveryFenceReady: false, restartRequired: true }, installedPackage: "@dsmm/dsmm", postAppReady: true,
    externalModelCalls: false, productionAuthenticationModified: false, clientSha256: digest, checks: Object.fromEntries(CORE_CHECKS_020.map((key: string) => [key, true])) };
  return { ...artifact, receipt };
}

test("022 freeze validates fresh complete Docker proof and rejects prior identity, byte and substrate evidence", () => {
  const f = stableDockerFixture("0.2.2"), receiptBytes = Buffer.from(JSON.stringify(f.receipt));
  const identity = controls.createArtifactIdentity(f.context, f.tarball, receiptBytes, { sourceChecks: "COMPLETED" });
  assert.equal(identity.packageName, "@dsmm/dsmm"); assert.equal(identity.version, "0.2.2");
  assert.equal(identity.tag, "dsmm-scoped-v0.2.2"); assert.equal(identity.filename, "dsmm-dsmm-0.2.2.tgz");
  assert.equal(identity.sha256, controls.computeDigests(f.tarball).sha256);
  assert.equal(identity.receiptSha256, controls.computeDigests(receiptBytes).sha256);
  assert.equal(identity.dockerAcceptance.sourceContract, "0.2.2"); assert.equal(identity.dockerAcceptance.uiCheckCount, 6);
  for (const change of [
    (r: any) => { r.uiProfiles.sourceContract = "0.2.1"; },
    (r: any) => { r.uiProfiles.packageVersion = "0.2.1"; },
    (r: any) => { r.uiProfiles.kind = "native-client-stable-first-021"; },
    (r: any) => { r.uiProfiles.artifactSha256 = "c".repeat(64); },
    (r: any) => { r.nativeCore.sourceContract = "0.2.1"; },
    (r: any) => { r.nativeCore.packageVersion = "0.2.1"; },
    (r: any) => { r.nativeCore.artifactSha256 = "c".repeat(64); },
    (r: any) => { r.native.web.sourceContract = "0.2.1"; },
    (r: any) => { r.native.headless.packageVersion = "0.2.1"; },
    (r: any) => { r.native.headless.artifactSha256 = "c".repeat(64); },
    (r: any) => { r.uiProfiles.bootstrap.stockSubagentDisabled = false; },
    (r: any) => { r.native.web.bootstrap.deliveryFenceReady = false; },
    (r: any) => { r.native.headless.bootstrap.experimentalLegacyRead = "enabled"; },
    (r: any) => { r.nativeCore.bootstrap.customRuntimeEntries = 2; },
  ]) {
    const receipt = structuredClone(f.receipt); change(receipt);
    assert.throws(() => controls.createArtifactIdentity(f.context, f.tarball, Buffer.from(JSON.stringify(receipt)), { sourceChecks: "COMPLETED" }));
  }
  const old = stableDockerFixture("0.2.1");
  for (const template of ["web", "headless"]) { delete old.receipt.native[template].packageVersion; delete old.receipt.native[template].artifactSha256; }
  assert.equal(controls.validateDockerReceipt(old.receipt, old.identity).sourceContract, "0.2.1");
  assert.throws(() => controls.validateDockerReceipt(old.receipt, identity));
  assert.throws(() => controls.validateArtifactIdentity({ ...identity, dockerAcceptance: { ...identity.dockerAcceptance, sourceContract: "0.2.1" } }));
  for (const key of ["releaseSha", "controlSha", "runId", "runAttempt"] as const) {
    const changed = { ...identity, [key]: key.endsWith("Sha") ? "c".repeat(40) : String(Number(identity[key]) + 1) };
    assert.throws(() => controls.validateArtifactIdentity(changed, { context: f.context }));
  }
  const install = installFixture("0.2.2"), historicalInstall = installFixture("0.2.1");
  assert.throws(() => probe.validateInstallReceipt(historicalInstall.receipt, install.identity));
  const wrongHash = structuredClone(install.receipt); wrongHash.sha256 = "c".repeat(64);
  assert.throws(() => probe.validateInstallReceipt(wrongHash, install.identity));
});

test("only reviewed release versions select byte, export, registry and browser contracts", () => {
  for (const version of ["0.2.3", "0.3.0", "1.0.0", "0.1.10"]) {
    assert.equal(sourceContractForVersion(version), undefined);
    assert.throws(() => artifactFixture(version));
    assert.throws(() => controls.uiChecksForVersion(version));
    assert.throws(() => controls.manifestExportsForVersion(version));
    assert.throws(() => controls.validateTarballBuffer(Buffer.alloc(0), { version }));
    assert.throws(() => probe.publicExportsForVersion(version));
    assert.throws(() => probe.compiledFilesForVersion(version));
    assert.throws(() => probe.parseArgs(["--version", version, "--sha256", "a".repeat(64), "--receipt", "unused.json"]));
  }
});

test("022 registry verification binds provenance and fresh native install to the exact source/run/attempt", async () => {
  const f = installFixture("0.2.2"), identity = f.identity;
  const statement = {
    _type: "https://in-toto.io/Statement/v1", predicateType: "https://slsa.dev/provenance/v1",
    subject: [{ name: "pkg:npm/%40dsmm/dsmm@0.2.2", digest: { sha512: Buffer.from(identity.integrity.slice(7), "base64").toString("hex") } }],
    predicate: {
      buildDefinition: { buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
        externalParameters: { workflow: { ref: identity.ref, repository: "https://github.com/hugefiver/ocmm", path: ".github/workflows/dsmm-release.yml" } },
        resolvedDependencies: [{ uri: `git+https://github.com/hugefiver/ocmm@${identity.ref}`, digest: { gitCommit: identity.releaseSha } }] },
      runDetails: { builder: { id: "https://github.com/actions/runner/github-hosted" },
        metadata: { invocationId: `https://github.com/hugefiver/ocmm/actions/runs/${identity.runId}/attempts/${identity.runAttempt}` } },
    },
  };
  const attestation = (value: typeof statement) => ({ attestations: [{ predicateType: statement.predicateType,
    bundle: { dsseEnvelope: { payloadType: "application/vnd.in-toto+json", signatures: [{ sig: "synthetic-validator-fixture" }], payload: Buffer.from(JSON.stringify(value)).toString("base64") } } }] });
  assert.equal(controls.validateRegistryProvenance(attestation(statement), identity).sourceSha, identity.releaseSha);
  for (const change of [
    (p: typeof statement) => { p.subject[0].name = "pkg:npm/%40dsmm/dsmm@0.2.1"; },
    (p: typeof statement) => { p.subject[0].digest.sha512 = "c".repeat(128); },
    (p: typeof statement) => { p.predicate.buildDefinition.externalParameters.workflow.ref = "refs/tags/dsmm-scoped-v0.2.1"; },
    (p: typeof statement) => { p.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = "c".repeat(40); },
    (p: typeof statement) => { p.predicate.runDetails.metadata.invocationId = "https://github.com/hugefiver/ocmm/actions/runs/9999/attempts/1"; },
    (p: typeof statement) => { p.predicate.runDetails.metadata.invocationId = `https://github.com/hugefiver/ocmm/actions/runs/${identity.runId}/attempts/${Number(identity.runAttempt) + 1}`; },
  ]) {
    const changed = structuredClone(statement); change(changed);
    assert.throws(() => controls.validateRegistryProvenance(attestation(changed), identity));
  }
  const attestationUrl = "https://registry.npmjs.org/-/npm/v1/attestations/@dsmm%2fdsmm@0.2.2";
  const metadata = { name: "@dsmm/dsmm", version: "0.2.2", dist: { shasum: identity.sha1, integrity: identity.integrity, tarball: f.receipt.registry.tarball,
    attestations: { url: attestationUrl, provenance: { predicateType: statement.predicateType } } } };
  const fetcher = async (url: string) => {
    if (url === "https://registry.npmjs.org/@dsmm%2fdsmm/0.2.2") return Response.json(metadata);
    if (url === metadata.dist.tarball) return new Response(f.tarball);
    assert.equal(url, attestationUrl); return Response.json(attestation(statement));
  };
  const registry = await controls.verifyRegistryArtifact(identity, fetcher);
  const verified = await completion.verifyPublishedArtifact(identity, { registryCheck: async () => registry, installProbe: async () => f.receipt });
  assert.equal(verified.freshInstall.version, "0.2.2"); assert.equal(verified.registry.provenance.runId, identity.runId);
  const priorInstall = installFixture("0.2.1").receipt;
  await assert.rejects(completion.verifyPublishedArtifact(identity, { registryCheck: async () => registry, installProbe: async () => priorInstall }),
    (error: unknown) => { assert.deepEqual(completion.verificationFailureForError(error), { stage: "native-install", code: "INSTALL_PROOF_REJECTED" }); return true; });
});

test("stable sources refuse historical picker, session-profile and startup producers with explicit contracts", async () => {
  for (const version of ["0.2.1", "0.2.2"]) {
    const options = { version, sourceContract: version };
    assert.throws(() => nativePickerContract(version, options));
    assert.throws(() => sessionProfileChecksForVersion(version, options));
    assert.throws(() => validateStartupProfileProof({}, options));
    assert.throws(() => validateSessionProfileProof({}, options));
    await assert.rejects(runStartupLockContention(options));
  }
});

test("reviewed stable artifacts deliver the exact executable resources without widening historical package policy", () => {
  for (const version of ["0.2.1", "0.2.2"]) {
    const f = artifactFixture(version);
    assert.equal(controls.validateTarballBuffer(f.tarball, { version }).version, version);
    for (const path of SKILL_EXECUTABLES_020) assert.equal(controls.isForbiddenPackagePath(path, version), false);
    for (const path of ["skills/debugging/references/scripts/dap.test.mjs", "skills/coding-agent-sessions/scripts/agent_sessions/pi_family.py"]) {
      const missing = new Map(f.files); missing.delete(path);
      assert.throws(() => controls.validateTarballBuffer(archiveFiles(missing), { version }));
      assert.equal(controls.isForbiddenPackagePath(path, "0.1.9"), true);
      assert.equal(controls.isForbiddenPackagePath(path), true);
    }
    assert.equal(controls.isForbiddenPackagePath("skills/coding-agent-sessions/scripts/agent_sessions/injected.py", version), true);
  }
});
