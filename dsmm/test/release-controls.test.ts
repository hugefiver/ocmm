import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Source-only release controls are deliberately not published.
import * as controls from "../scripts/dsmm-release.mjs";
// @ts-expect-error Source-only registry probe is deliberately not published.
import * as probe from "../scripts/dsmm-registry-install-probe.mjs";
// @ts-expect-error Source-only completion checker is deliberately not published.
import * as completion from "../scripts/check-dsmm-release-completion.mjs";
// @ts-expect-error Source-only version contract is deliberately not published.
import { COMPILED_NAMES_020, COMPILED_NAMES_021, PRESET_NAMES_020, SKILL_EXECUTABLES_020, STABLE_UI_CHECKS_021, CORE_CHECKS_020, isSource020, isSource021, startupProfileContract } from "../scripts/release-contract.mjs";
// @ts-expect-error Synthetic historical data is never native acceptance proof.
import { archiveFiles, contextInput, makeAcceptedFixture, makeInstallFixture, packageFiles, receiptFixture } from "../../src/dsmm-trusted-release-fixtures.mjs";

function artifactFixture(version = "0.2.0") {
  const files = packageFiles(version);
  if (version === "0.2.0" || version === "0.2.1") {
    const manifest = JSON.parse(files.get("package.json").toString("utf8"));
    manifest.exports = controls.manifestExportsForVersion(version);
    files.set("package.json", Buffer.from(JSON.stringify(manifest)));
    files.set("prompts/source/catalog.json", Buffer.from(JSON.stringify(PRESET_NAMES_020.map((row: { id: string }) => ({ ...row, mode: row.id === "dsmm-planner" ? "all" : ["dsmm-builder", "dsmm-orchestrator"].includes(row.id) ? "primary" : "subagent", enabledByDefault: row.id !== "dsmm-cross-cutting" })))));
    files.set("prompts/source/manifest.json", Buffer.from(JSON.stringify({ files: [] })));
    for (const language of ["en", "zh"]) files.set(`locale/${language}.json`, Buffer.from(JSON.stringify({ meta: { title: "DSMM", description: "Synthetic release metadata" } })));
    for (const path of probe.compiledFilesForVersion(version)) files.set(path, Buffer.from("synthetic compiled fixture\n"));
    for (const path of SKILL_EXECUTABLES_020) files.set(path, Buffer.from("synthetic skill resource\n"));
  }
  const tarball = archiveFiles(files), digests = controls.computeDigests(tarball), historical = makeAcceptedFixture();
  const context = controls.resolveReleaseContext({ ...contextInput(), ref: `refs/tags/dsmm-scoped-v${version}`, packageVersion: version, workflowRef: `hugefiver/ocmm/.github/workflows/dsmm-release.yml@refs/tags/dsmm-scoped-v${version}` });
  const identity = controls.validateArtifactIdentity({ ...historical.identity, ...context, ...digests, filename: `dsmm-dsmm-${version}.tgz`, sourceChecks: "COMPLETED",
    ...(version === "0.2.1" ? { dockerAcceptance: { ...historical.identity.dockerAcceptance, sourceContract: "0.2.1", uiCheckCount: STABLE_UI_CHECKS_021.length } } : {}) });
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
  for (const version of ["0.2.0", "0.2.1"]) {
    const { identity } = artifactFixture(version);
    const expected = { runId: identity.runId, runAttempt: identity.runAttempt, controlSha: identity.controlSha };
    const run = { id: Number(identity.runId), run_attempt: 1, workflow_id: 123, repository: { full_name: "hugefiver/ocmm" }, head_repository: { full_name: "hugefiver/ocmm" }, status: "completed", conclusion: "success", head_sha: identity.controlSha, head_branch: identity.tag, event: "push" };
    const workflow = { id: 123, path: ".github/workflows/dsmm-release.yml" };
    const jobs = completion.REQUIRED_JOBS.map((name: string, index: number) => ({ id: index + 1, name, run_id: Number(identity.runId), run_attempt: 1, status: "completed", conclusion: name === "import-bootstrap" ? "skipped" : "success" }));
    assert.equal(completion.validateRunEvidence(run, workflow, jobs, identity, expected).length, 5);
    for (const changedRun of [{ ...run, run_attempt: 2 }, { ...run, head_sha: "b".repeat(40) }, { ...run, conclusion: "failure" }, { ...run, status: "in_progress" }]) assert.throws(() => completion.validateRunEvidence(changedRun, workflow, jobs, identity, expected));
    assert.throws(() => completion.validateRunEvidence(run, workflow, jobs.slice(1), identity, expected));
    const wrongJob = structuredClone(jobs); wrongJob[0].conclusion = "success";
    assert.throws(() => completion.validateRunEvidence(run, workflow, wrongJob, identity, expected));
    assert.throws(() => controls.validateArtifactIdentity({ ...identity, releaseSha: "b".repeat(40) }));
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
test("visibility defaults preserve historical 019 special budget and keep 020 bounded without publishing", async () => {
  for (const [version, expectedBudget] of [["0.1.9", 1_200_000], ["0.2.0", 120_000], ["0.2.1", 120_000]] as const) {
    const { identity } = artifactFixture(version); let now = 0; let reads = 0;
    await assert.rejects(() => controls.verifyRegistryArtifact(identity, async () => { reads++; return new Response(null, { status: 404 }); }, { now: () => now, wait: async (ms: number) => { now += ms; } }));
    assert.equal(now, expectedBudget); assert.ok(reads > 0);
    await assert.rejects(() => controls.verifyRegistryArtifact(identity, async () => { throw Error("must not fetch"); }, { visibilityDeadlineMs: version === "0.1.9" ? 1_200_001 : 300_001 }));
  }
});

test("021 installs nine distinct exports and complete stable runtime/client bytes without changing historical export contracts", () => {
  const f = installFixture("0.2.1");
  assert.equal(probe.validateInstallReceipt(f.receipt, f.identity), f.receipt);
  completion.validateInstalledFileHashes(f.receipt, f.files);
  assert.equal(Object.keys(f.receipt.exports).length, 9);
  assert.equal(f.receipt.exports["./subagent-runtime"].path, "lib/runtime-integration.js");
  assert.equal(f.receipt.exports["./legacy-read-host"].path, "lib/legacy-read-host.js");
  assert.equal(Object.keys(probe.publicExportsForVersion("0.2.0")).length, 7);
  assert.equal(Object.keys(probe.publicExportsForVersion("0.1.3")).length, 7);
  for (const name of COMPILED_NAMES_021) assert.ok(f.receipt.compiledFiles[`lib/${name}.d.ts`]);
  for (const path of ["lib/runtime-integration.js", "lib/runtime-integration.d.ts", "lib/legacy-read-host.js", "lib/client/ChildrenPanel.js", "lib/profile-diagnostics.js"]) {
    const missing = new Map(f.files); missing.delete(path);
    assert.throws(() => controls.validateTarballBuffer(archiveFiles(missing), { version: "0.2.1" }));
    const changed = new Map(f.files); changed.set(path, Buffer.from("changed public bytes"));
    assert.throws(() => completion.validateInstalledFileHashes(f.receipt, changed));
  }
  const wrongTarget = new Map(f.files), manifest = JSON.parse(String(wrongTarget.get("package.json")));
  manifest.exports["./subagent-runtime"].default = "./lib/subagent-runtime.js";
  wrongTarget.set("package.json", Buffer.from(JSON.stringify(manifest)));
  assert.throws(() => controls.validateTarballBuffer(archiveFiles(wrongTarget), { version: "0.2.1" }));
  const oldReceipt = structuredClone(f.receipt); delete oldReceipt.exports["./legacy-read-host"];
  assert.throws(() => probe.validateInstallReceipt(oldReceipt, f.identity));
});

test("source and startup identities explicitly separate 021 from 020 and historical default grammar", () => {
  assert.equal(isSource020("0.2.1"), false); assert.equal(isSource021("0.2.1"), true);
  assert.equal(startupProfileContract("0.2.0", { sourceContract: "0.2.0" }), "central-read-lock-free-020");
  assert.equal(startupProfileContract("0.2.1", { sourceContract: "0.2.1" }), "stable-native-first-021");
  assert.equal(startupProfileContract("0.2.1"), "historical-read-lock");
  assert.throws(() => startupProfileContract("0.2.1", { sourceContract: "0.2.0" }));
  assert.throws(() => startupProfileContract("0.2.0", { sourceContract: "0.2.1" }));
  assert.throws(() => startupProfileContract("0.2.2", { sourceContract: "0.2.2" }));
  assert.deepEqual(controls.uiChecksForVersion("0.2.1"), STABLE_UI_CHECKS_021);
  assert.equal(controls.uiChecksForVersion("0.2.0").length, 27);
  const { identity } = artifactFixture("0.2.1");
  const historical = structuredClone(identity); delete historical.dockerAcceptance.sourceContract;
  assert.throws(() => controls.validateArtifactIdentity(historical));
});

function stableUiFixture() {
  const sha256 = "a".repeat(64), childId = "owned-child", rootId = "owned-root", epoch = "b".repeat(64);
  const nativeCalls = ["dsmmProfiles/describe", "dsmmProfiles/save", "dsmmProfiles/select", "dsmmProfiles/describeSession", "dsmmProfiles/selectSession",
    "dsmmChildren/describe", "dsmmChildren/descendants", "dsmmChildren/prompt", "dsmmChildren/background"].map(endpoint => ({ endpoint, strictGateway: true, nativePeer: "operator", result: "accepted" }));
  return { sha256, version: "0.2.1", ui: {
    sourceContract: "0.2.1", packageVersion: "0.2.1", artifactSha256: sha256, artifactSha256After: sha256,
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

test("021 stable proof requires immutable CAS, actual child delivery, same-run native background and cutoff evidence", () => {
  const f = stableUiFixture();
  assert.equal(controls.validateStableUiProof021(f.ui, f), f.ui);
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
    assert.throws(() => controls.validateStableUiProof021(ui, f));
  }
});
