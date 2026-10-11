import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startupProfileFixture as fixture } from "./startup-profile-fixture.ts";
import { createProfileRuntime } from "../lib/profile-runtime.js";
import { ProfileStore } from "../lib/profile-store.js";
import { MAX_PROFILE_BYTES } from "../lib/profiles.js";
import { resolveConfig } from "../lib/settings.js";
// @ts-expect-error Source-only acceptance validator.
import { sessionProfileChecksForVersion, UI_CHECKS_015, validateSessionProfileProof, validateStartupProfileProof } from "../scripts/profile-ui-harness-native.mjs";
// @ts-expect-error Source-only release selectors.
import { CORE_CHECKS_020, nativePickerCheckForVersion, PRESET_NAMES_020, ROLE_TOOLS_020, startupProfileContract } from "../scripts/release-contract.mjs";
// @ts-expect-error Source-only controller.
import { uiChecksForVersion, UI_CHECKS, validateDockerReceipt } from "../scripts/dsmm-release.mjs";
// @ts-expect-error Source-only startup producer.
import { runStartupLockContention } from "../scripts/profile-ui-acceptance.mjs";
// @ts-expect-error Synthetic historical proof is only validator input, never release evidence.
import { successorReceiptFixture } from "../../src/dsmm015-release-fixtures.mjs";

function routingProof(startupLock: any, artifactSha256: string, installedRoot: string) {
  const proof = successorReceiptFixture(artifactSha256).uiProfiles.successorProof;
  proof.schemaVersion = 2; proof.installedRoot = installedRoot; proof.startupLock = startupLock;
  for (const scenario of proof.routeScenarios) Object.assign(scenario, { roleScope: "child", nativeOrigin: "subagent", nativeDescriptor: { mode: "one-shot", provider: `dsmm-role-${scenario.role.slice(5)}` } });
  const inherited = { provider: "dsmm-selection-fixture", model: "native-inherited", reasoningEffort: "high" };
  Object.assign(proof.nativeSelection.attempts[0], inherited, { phase: "native-default" });
  Object.assign(proof.nativeSelection.headers[0], inherited, { durableHeader: inherited });
  return proof;
}

test("explicit exact 020 source contract selects cold read/write proof and producer/controller check inventory", () => {
  const f = fixture();
  assert.deepEqual(validateStartupProfileProof(f.proof, f.options), { contract: "central-read-lock-free-020" });
  assert.deepEqual(validateSessionProfileProof(routingProof(f.proof, f.options.artifactSha256, f.options.installedRoot), f.options), { schemaVersion: 2, scenarios: 13, independentSessions: 2 });
  assert.deepEqual(uiChecksForVersion("0.2.0"), [...UI_CHECKS, ...sessionProfileChecksForVersion("0.2.0", { sourceContract: "0.2.0" }), nativePickerCheckForVersion("0.2.0", { sourceContract: "0.2.0" })]);
  assert.ok(uiChecksForVersion("0.2.0").includes("startupProfileReadLockFreeWriteExclusion"));
  assert.ok(uiChecksForVersion("0.2.0").includes("nativePickerCompactHeaderAcceptance"));
  for (const version of ["0.1.5", "0.1.6", "0.1.8", "0.2.0", "0.2.1"]) {
    assert.equal(startupProfileContract(version), "historical-read-lock");
    assert.deepEqual(sessionProfileChecksForVersion(version), UI_CHECKS_015);
    assert.equal(nativePickerCheckForVersion(version), "nativePickerCompactProfileAcceptance");
    const historical = successorReceiptFixture().uiProfiles.successorProof.startupLock;
    validateStartupProfileProof(historical, { ...f.options, version, sourceContract: undefined });
    assert.throws(() => validateStartupProfileProof(f.proof, { ...f.options, version, sourceContract: undefined }));
  }
  for (const version of ["0.1.9", "0.2.1", "1.0.0"]) assert.throws(() => validateStartupProfileProof(f.proof, { ...f.options, version }));
  for (const sourceContract of [null, "", "0.2.1", true]) assert.throws(() => validateStartupProfileProof(f.proof, { ...f.options, sourceContract }));
  assert.throws(() => validateStartupProfileProof(successorReceiptFixture().uiProfiles.successorProof.startupLock, f.options));
});

test("local 020 release caller explicitly selects source grammar rather than accepting a historical startup proof", async () => {
  const f = fixture(), receipt = successorReceiptFixture(f.options.artifactSha256);
  receipt.artifact.package.version = "0.2.0";
  for (const installed of receipt.installedPackages) installed.version = "0.2.0";
  for (const template of ["web", "headless"]) {
    const native = receipt.native[template];
    native.branding = { pluginTitle: "DSMM", presetNames: PRESET_NAMES_020, rootPresetNames: template === "web" ? PRESET_NAMES_020.filter(({ id }: { id: string }) => ["dsmm-orchestrator", "dsmm-planner"].includes(id)) : [] };
    native.delegation = { roleTools: ROLE_TOOLS_020, disabledBuilderAbsent: true, disabledCrossCuttingAbsent: true };
  }
  receipt.nativeCore = { outcome: "COMPLETED", artifactSha256: f.options.artifactSha256, packageVersion: "0.2.0", installedPackage: "@dsmm/dsmm", postAppReady: true,
    externalModelCalls: false, productionAuthenticationModified: false, clientSha256: "a".repeat(64), checks: Object.fromEntries(CORE_CHECKS_020.map((key: string) => [key, true])) };
  const ui = receipt.uiProfiles;
  ui.installedRoot = f.options.installedRoot; ui.nativeClient.dsmmClient = `${ui.installedRoot}/lib/client.js`;
  ui.nativeStorage.root = `${f.options.ownedHome}/sessions`;
  receipt.native.web.persistence.config.root = ui.nativeStorage.root; receipt.nativeBaseline.web.persistence.config.root = ui.nativeStorage.root;
  Object.assign(ui.storageProof, f.options.profileStorage);
  ui.checks = Object.fromEntries(uiChecksForVersion("0.2.0").map((key: string) => [key, true]));
  ui.successorProof = routingProof(ui.successorProof.startupLock, f.options.artifactSha256, ui.installedRoot);
  validateSessionProfileProof(ui.successorProof, { ...f.options, sourceContract: undefined });
  assert.throws(() => validateDockerReceipt(receipt, { sha256: f.options.artifactSha256, version: "0.2.0" }), { code: "ERR_ASSERTION", actual: undefined, expected: "central-read-lock-free-020" });
  for (const version of ["0.1.9", "0.2.1"]) await assert.rejects(runStartupLockContention({ version, sourceContract: "0.2.0" }), { code: "ERR_ASSERTION" });
});

test("020 startup validator rejects missing or contradictory native, byte, ownership and fail-closed evidence", () => {
  const { proof, options } = fixture();
  const mutations: ((p: any) => void)[] = [
    p => { p.artifactSha256 = "0".repeat(64); }, p => { p.installedRoot = "/tmp/foreign/node_modules/@dsmm/dsmm"; }, p => { p.packageVersion = "0.2.1"; },
    p => { p.contract = "historical-read-lock"; }, p => { p.nativeExit.code = 1; }, p => { p.nativeExit.signal = "SIGTERM"; },
    p => { p.processId = p.parentProcessId; }, p => { delete p.parentProcessId; }, p => { p.storage.origin = "legacy"; },
    p => { p.storage.home = "/tmp/foreign"; }, p => { p.storage.entryId = "foreign"; }, p => { p.storage.hostProfileDir += "/.."; },
    p => { p.storage.profileDir = "/tmp/foreign/profiles"; }, p => { p.storage.stateDir += "/foreign"; }, p => { p.storage.lockPath += "/foreign"; },
    p => { p.loaderEntries[0].state = 3; }, p => { p.loaderEntries[0].name = "foreign"; }, p => { p.loaderEntries.push(p.loaderEntries[0]); },
    p => { p.loaderIdentity.startupEntryId = "foreign"; }, p => { p.loaderIdentity.uid += 1; }, p => { p.selection.selectedId = null; },
    p => { p.selection.appliedRevision = "0".repeat(64); }, p => { p.coldReviewCap = 2; }, p => { p.root.reviewCap = 2; },
    p => { p.root.nativeOrigin = "subagent"; }, p => { p.root.scope = "session-override"; }, p => { p.root.selectedId = "foreign"; },
    p => { p.root.nativeParentSession = "foreign"; }, p => { p.root.nativeOwnerIds = ["foreign"]; },
    p => { p.root.requestOrToolEvents = 1; }, p => { p.observedOperations.nativeRequestPreparations = 1; }, p => { p.observedOperations.nativeToolDispatches = 1; },
    p => { p.write.code = "unavailable"; }, p => { p.write.operation = "canned-refusal"; }, p => { p.write.attemptedContentSha256 = p.selection.appliedRevision; },
    p => { delete p.corruptSelection; }, p => { p.corruptSelection.failureCode = "lock-timeout"; }, p => { p.corruptSelection.dsmmRuntimeReady = true; },
    p => { p.corruptSelection.installedRoot += "/foreign"; }, p => { p.corruptSelection.artifactSha256 = "0".repeat(64); },
    p => { p.corruptSelection.processId = p.processId; }, p => { p.corruptSelection.loaderIdentity.entryId = "foreign"; },
    p => { delete p.corruptSelection.documentBeforeSha256; }, p => { p.corruptSelection.documentAfterSha256 = "0".repeat(64); },
    p => { delete p.corruptSelection.revisionBeforeSha256; }, p => { p.corruptSelection.revisionAfterSha256 = "0".repeat(64); },
    p => { delete p.cleanup; }, p => { p.cleanup.restoredOriginalPointerSha256 = "0".repeat(64); },
    p => { p.cleanup.ownedLockRemoved = false; }, p => { p.cleanup.ownedDocumentRemoved = false; }, p => { p.cleanup.ownedRevisionRemoved = false; },
    p => { p.corruptSelection.failedAdmission.ancestry.at(-1).uid += 1; }, p => { p.corruptSelection.rootRoster[0].broken = undefined; },
    p => { p.corruptSelection.observedOperations.nativeToolDispatches = 1; }, p => { p.restoredPointerSha256 = "0".repeat(64); },
  ];
  for (const key of ["dsmmRuntimeReady", "runtimeBackendIdentity", "postAppReady", "regularOwnedLock", "rootDisposed"]) {
    mutations.push(p => { p[key] = false; }, p => { delete p[key]; });
  }
  for (const key of ["document", "revision", "pointer", "owner"]) mutations.push(p => { delete p.bytes[key]; }, p => { p.bytes[key].afterSha256 = "0".repeat(64); });
  for (const mutate of mutations) { const changed = structuredClone(proof); mutate(changed); assert.throws(() => validateStartupProfileProof(changed, options)); }
  assert.throws(() => validateStartupProfileProof(proof, { ...options, ownedHome: "/tmp/foreign" }));
  assert.throws(() => validateStartupProfileProof(proof, { ...options, profileStorage: undefined }));
});

test("actual cold central runtime rejects corrupt and unstable disk selection before publishing admission listeners", async (t) => {
  const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "dsmm-startup-selection-")));
  const originalRead = fs.readSync;
  try {
    const host = join(home, "profiles", "owned"); fs.mkdirSync(host, { recursive: true });
    const store = ProfileStore.fromCentral(home, host, "trusted-direct");
    const saved = await store.save({ id: "cold", content: '{"version":1,"id":"cold","settings":{"workflow":{"reviewCap":7}}}\n', expectedRevision: null });
    await store.select({ id: saved.id, expectedRevision: saved.revision, expectedSelectionRevision: "absent" });
    const pointer = join(store.stateDir, ".selection.json"), before = fs.readFileSync(pointer);
    let installedListeners = 0;
    const ctx = { get: ((name: string) => name === "profileContext" ? { dir: host, home } : undefined) as any, on() { installedListeners += 1; } };
    fs.writeFileSync(pointer, "{ broken cold selection");
    await assert.rejects(createProfileRuntime(ctx, resolveConfig()), { code: "corrupt-selection" });
    assert.equal(installedListeners, 0);
    fs.writeFileSync(pointer, before);
    let changed = false;
    const external = '{"version":1,"id":null,"revision":null}\n';
    t.mock.method(fs, "readSync", (fd: number, buffer: Buffer, offset: number, length: number, position: number) => {
      const count = originalRead(fd, buffer, offset, length, position);
      if (!changed && buffer.length === MAX_PROFILE_BYTES + 1) { changed = true; fs.writeFileSync(pointer, external); }
      return count;
    });
    syncBuiltinESMExports();
    await assert.rejects(createProfileRuntime(ctx, resolveConfig()), { code: "conflict" });
    assert.equal(changed, true); assert.equal(installedListeners, 0);
    assert.equal(fs.readFileSync(pointer, "utf8"), external);
    assert.equal(fs.readFileSync(join(store.profileDir, ".revisions", `${saved.revision}.jsonc`), "utf8"), saved.content);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); fs.rmSync(home, { recursive: true, force: false }); }
});
