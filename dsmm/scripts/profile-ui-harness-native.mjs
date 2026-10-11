import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join, posix, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { requiresNativePickerProof } from "./native-picker-proof.mjs";
import { startupProfileContract } from "./release-contract.mjs";

/** Historical receipts deliberately keep their original fourteen-check grammar.
 * 018 session-mode browser proof is separately version-gated by the frozen
 * native picker lane, not retrofitted into this native routing proof. */
export function requiresSessionProfileProof(version) {
  assert.match(version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u);
  const [major, minor, patch] = version.split(".").map(Number);
  return major > 0 || minor > 1 || (minor === 1 && patch >= 5);
}

export const UI_CHECKS_015 = Object.freeze([
  "nativeCatalogStructuredEditRoundTrip", "currentSessionNativeUiApply",
  "sessionSelectionIndependenceCasEpoch", "perRoleProfileStrategyIsolation",
  "startupFirstAvailableRouteLock", "startupRateLimitSameRouteFinite",
  "rateLimitThresholdOrderedRollover", "universalNoOutputRetryFence",
  "startupUnavailableNoReplayBoundary", "startupProfileLockContention",
  "sessionSidecarColdReopenStockHistory", "nativeManualModelSelectionWins",
]);
export function sessionProfileChecksForVersion(version, options = {}) {
  return startupProfileContract(version, options) === "central-read-lock-free-020"
    ? UI_CHECKS_015.map((check) => check === "startupProfileLockContention" ? "startupProfileReadLockFreeWriteExclusion" : check)
    : [...UI_CHECKS_015];
}

export const NATIVE_SCENARIOS_015 = Object.freeze([
  "startup-primary-lock", "startup-first-available", "startup-rate-limit",
  "rate-limit-rollover", "unavailable-first", "unavailable-partial", "unavailable-later",
  "startup-lock-partial-text", "startup-lock-partial-tool",
  "rate-limit-fallback-partial-text", "rate-limit-fallback-partial-tool",
  "profile-beta-reviewer", "profile-alpha-planner",
]);

export const proofDigest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const name = "dsmm-successor-startup-lock-audit";
export const inject = ["loader", "appExit"];

/** Independent native observer; never supplies or replaces the DSMM runtime. */
export function apply(ctx, config) {
  const contract = startupProfileContract(config.version, { sourceContract: config.sourceContract });
  if (contract === "central-read-lock-free-020" && config.scenario === "stable-selection") return observeReadLockFreeStartup(ctx, config);
  const startedAt = performance.now();
  let finished = false;
  let audit;
  let failedCandidate;
  let nativeRequestPreparations = 0;
  let nativeToolDispatches = 0;
  ctx.on("agent/request", (request, next) => { nativeRequestPreparations += 1; return next(); }, { global: true, prepend: true });
  ctx.on("tools/pre-execute", (request, next) => { nativeToolDispatches += 1; return next(); }, { global: true, prepend: true });
  const observe = (candidate = failedCandidate) => {
    if (finished) return audit;
    const entries = [...ctx.get("loader").entries()];
    const dsmm = entries.find((entry) => entry.options.id === "dsmm");
    const ancestry = [];
    const seen = new Set();
    let owned = false;
    for (let fiber = candidate; fiber && !seen.has(fiber) && ancestry.length < 32; fiber = fiber.parent?.fiber) {
      seen.add(fiber); ancestry.push({ uid: fiber.uid, name: fiber.name, state: fiber.state });
      if (fiber === dsmm?.fiber) { owned = true; break; }
    }
    if ((!owned || candidate?.state !== 3) && performance.now() - startedAt < 15_000) return;
    failedCandidate = candidate;
    finished = true;
    clearInterval(timer);
    audit = (async () => {
      assert.equal(owned, true, "failed native admission fiber is not owned by the actual DSMM Loader entry");
      assert.equal(candidate?.state, 3, "native DSMM profile admission did not visibly refuse contention");
      assert.equal(ctx.get("dsmmProfileRuntime"), undefined, "contended startup exposed a baseline runtime");
      const loaderEntries = entries.map((entry) => ({ id: entry.options.id, uid: entry.fiber?.uid ?? null, state: entry.fiber?.state ?? null }));
      const failedAdmission = { nativeOwnership: "public-parent-fiber-identity", loaderEntryId: "dsmm", loaderFiberUid: dsmm.fiber.uid,
        failedFiber: { uid: candidate.uid, name: candidate.name, state: candidate.state }, ancestry };
      const observedOperations = { nativeRequestPreparations, nativeToolDispatches };
      const registry = ctx.get("agentPresets");
      assert.ok(registry, "actual native root roster is unavailable");
      const roster = await registry.list();
      const rootRoster = roster.filter(({ id }) => id.startsWith("dsmm-")).map(({ id, broken }) => ({ id, broken }));
      const nativePresetIds = roster.map(({ id }) => id);
      assert.ok(nativePresetIds.includes("standard") && nativePresetIds.includes("minimal"), "native baseline roster did not settle");
      const rootRosterDisposition = rootRoster.length === 0 ? "not-registered" : "blocked-compositions";
      if (rootRosterDisposition === "blocked-compositions") {
        exactSet(rootRoster.map(({ id }) => id), ["dsmm-orchestrator", "dsmm-planner"], "blocked native roots");
        assert.ok(rootRoster.every(({ broken }) => typeof broken === "string"), "blocked root compositions were mislabeled ready");
      }
      let sourceFailure;
      if (contract === "central-read-lock-free-020") {
        assert.equal(config.scenario, "corrupt-selection");
        let failureCode;
        try { await candidate.await(); } catch (error) { failureCode = error.code; }
        assert.equal(failureCode, "corrupt-selection");
        sourceFailure = { contract, scenario: config.scenario, failureCode, artifactSha256: config.artifactSha256, installedRoot: config.packageRoot, packageVersion: config.version,
          processId: process.pid, loaderIdentity: { entryId: dsmm.id, optionsId: dsmm.options.id, name: dsmm.options.name, uid: dsmm.fiber.uid } };
      }
      await writeFile(config.receipt, `${JSON.stringify({ ...sourceFailure, phase: "before-native-loader", startupOutcome: "refused", elapsedMs: Math.ceil(performance.now() - startedAt), dsmmRuntimeReady: false, rootRoster, rootRosterDisposition, nativePresetIds, loaderEntries, failedAdmission, observedOperations }, null, 2)}\n`);
    })().catch(async (error) => { await writeFile(config.receipt, `${JSON.stringify(contract === "central-read-lock-free-020"
      ? { outcome: "FAILED", stage: "native-refusal", errorCode: error.code ?? "AUDIT_FAILED" } : { outcome: "FAILED", failure: error.message })}\n`); });
    return audit;
  };
  const timer = setInterval(() => { observe(); }, 25);
  // The official CLI fails loudly as soon as a plugin's startup rejects. Its
  // release awaits public fiber disposal, so drain the observer before exit.
  ctx.on("internal/status", (fiber) => { if (fiber.state === 3) observe(fiber); }, { global: true, prepend: true });
  ctx.effect(() => async () => { observe(); finished = true; clearInterval(timer); await audit; });
}

function observeReadLockFreeStartup(ctx, config) {
  const startedAt = performance.now();
  let started = false;
  let stage = "native-ready";
  let nativeRootObservation;
  const operations = { nativeRequestPreparations: 0, nativeToolDispatches: 0 };
  ctx.on("agent/request", (request, next) => { operations.nativeRequestPreparations += 1; return next(); }, { global: true, prepend: true });
  ctx.on("tools/pre-execute", (request, next) => { operations.nativeToolDispatches += 1; return next(); }, { global: true, prepend: true });
  ctx.get("appReady").onReady(() => {
    if (started) return;
    started = true;
    void audit().then(async (proof) => {
      await writeFile(config.receipt, `${JSON.stringify(proof, null, 2)}\n`, { flag: "wx" });
      ctx.get("appExit")(0);
    }).catch(async (error) => {
      await writeFile(config.receipt, `${JSON.stringify({ outcome: "FAILED", stage, errorCode: error.code ?? "AUDIT_FAILED", nativeRootObservation })}\n`, { flag: "wx" });
      ctx.get("appExit")(1);
    });
  });
  async function audit() {
    stage = "installed-package";
    const manifest = JSON.parse(await readFile(join(config.packageRoot, "package.json"), "utf8"));
    assert.equal(manifest.name, "@dsmm/dsmm"); assert.equal(manifest.version, config.version);
    const runtime = ctx.get("dsmmProfileRuntime");
    assert.ok(runtime && ctx.get("dsmmProfiles")?.backend === runtime);
    stage = "native-loader-identity";
    const entries = [...ctx.get("loader").entries()];
    const dsmmEntries = entries.filter(({ options }) => options.name === "@dsmm/dsmm");
    assert.equal(dsmmEntries.length, 1);
    const dsmm = dsmmEntries[0];
    assert.equal(dsmm.fiber.state, 2); assert.equal(runtime.options.startup.entryId, dsmm.id);
    assert.equal(dsmm.options.id, "dsmm");
    stage = "actual-store-identity";
    const store = runtime.store;
    assert.equal(store.origin, "central");
    for (const key of ["origin", "profileDir", "stateDir"]) assert.equal(store[key], config.storage[key]);
    assert.equal(runtime.options.startup.entryId, config.storage.entryId);
    const pointer = config.storage.pointerPath, lock = config.storage.lockPath;
    stage = "owned-regular-lock";
    const status = await lstat(lock);
    assert.ok(status.isFile() && !status.isSymbolicLink() && status.nlink === 1);
    const ownerBefore = await readFile(lock), pointerBefore = await readFile(pointer);
    stage = "cold-disk-selection";
    const selected = await store.loadSelection();
    assert.ok(selected.selectedId && selected.content && selected.document);
    assert.equal(selected.document.settings.workflow.reviewCap, 7);
    const documentPath = join(store.profileDir, `${selected.selectedId}.jsonc`);
    const revisionPath = join(store.profileDir, ".revisions", `${selected.appliedRevision}.jsonc`);
    const documentBefore = await readFile(documentPath), revisionBefore = await readFile(revisionPath);
    assert.equal(proofDigest(revisionBefore), selected.appliedRevision);
    assert.deepEqual(documentBefore, revisionBefore);
    const selection = { selectedId: selected.selectedId, appliedRevision: selected.appliedRevision, selectionRevision: selected.selectionRevision };
    for (const key of Object.keys(selection)) assert.equal(runtime.admission()[key], selection[key]);
    assert.equal(runtime.getSettings().workflow.reviewCap, 7);
    assert.equal(ctx.get("agents").list().length, 0);
    stage = "new-native-root";
    const nativeRequire = (await import("node:module")).createRequire(config.dshManifest);
    const { SessionId } = await import(pathToFileURL(nativeRequire.resolve("@deepseek-ai/dsh-session")).href);
    const handle = await ctx.get("agents").create({ sessionId: SessionId(`dsmm-startup-lock-${process.pid}`), meta: { cwd: config.workspace, agentPreset: "dsmm-orchestrator" } });
    let root;
    try {
      const agent = handle.agent, admission = runtime.admission(agent);
      nativeRootObservation = { nativeOrigin: agent.session.header.origin ?? null, preset: agent.session.header.agentPreset ?? null, scope: admission.scope,
        selectedId: admission.selectedId, appliedRevision: admission.appliedRevision, selectionRevision: admission.selectionRevision, reviewCap: runtime.getSettings(agent).workflow.reviewCap };
      for (const key of Object.keys(selection)) assert.equal(admission[key], selection[key]);
      assert.equal(agent.session.header.origin, undefined); assert.equal(agent.session.header.agentPreset, "dsmm-orchestrator");
      assert.equal(agent.session.header.parentSession, undefined);
      const nativeOwnerIds = ctx.get("agents").list().filter((candidate) => ctx.get("agents").isOwnedBy(agent.id, candidate)).map(({ id }) => id);
      assert.deepEqual(nativeOwnerIds, []);
      assert.equal(runtime.getSettings(agent).workflow.reviewCap, 7);
      const events = agent.session.snapshotEvents();
      assert.equal(events.some(({ type }) => ["turn/start", "request/header", "assistant/attempt", "assistant/message", "tool/call", "tool/result"].includes(type)), false);
      root = { sessionId: agent.id, nativeOrigin: agent.session.header.origin ?? null, nativeParentSession: agent.session.header.parentSession ?? null, nativeOwnerIds,
        preset: agent.session.header.agentPreset, scope: admission.scope,
        ...selection, admissionEpoch: admission.epoch, reviewCap: runtime.getSettings(agent).workflow.reviewCap, requestOrToolEvents: 0 };
    } finally { await handle.dispose(); }
    stage = "actual-document-write";
    let writeCode;
    const attemptedContent = `${selected.content}\n`;
    try { await runtime.save({ id: selected.selectedId, content: attemptedContent, expectedRevision: selected.appliedRevision }); }
    catch (error) { writeCode = error.code; }
    assert.equal(writeCode, "lock-timeout");
    stage = "unchanged-disk-bytes";
    const unchanged = async (path, before) => { const after = await readFile(path); assert.deepEqual(after, before); return { beforeSha256: proofDigest(before), afterSha256: proofDigest(after) }; };
    const bytes = { document: await unchanged(documentPath, documentBefore), revision: await unchanged(revisionPath, revisionBefore),
      pointer: await unchanged(pointer, pointerBefore), owner: await unchanged(lock, ownerBefore) };
    assert.deepEqual(operations, { nativeRequestPreparations: 0, nativeToolDispatches: 0 });
    return { contract: "central-read-lock-free-020", phase: "before-native-loader", scenario: "stable-selection", startupOutcome: "read-admitted-write-refused",
      artifactSha256: config.artifactSha256, installedRoot: config.packageRoot, packageVersion: manifest.version, elapsedMs: Math.ceil(performance.now() - startedAt),
      dsmmRuntimeReady: true, runtimeBackendIdentity: true, postAppReady: true, processId: process.pid, storage: config.storage, regularOwnedLock: true,
      loaderEntries: entries.map((entry) => ({ id: entry.options.id, name: entry.options.name, uid: entry.fiber?.uid ?? null, state: entry.fiber?.state ?? null })),
      loaderIdentity: { entryId: dsmm.id, optionsId: dsmm.options.id, name: dsmm.options.name, uid: dsmm.fiber.uid, startupEntryId: runtime.options.startup.entryId },
      selection, coldReviewCap: runtime.getSettings().workflow.reviewCap, root, rootDisposed: true,
      write: { operation: "runtime.save", code: writeCode, attemptedContentSha256: proofDigest(attemptedContent) }, bytes, observedOperations: operations };
  }
}
const digest = (value, label) => assert.match(value, /^[a-f0-9]{64}$/u, `${label} needs actual SHA256 evidence`);
const id = (value, label) => assert.ok(typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\x00-\x1f]/u.test(value), `${label} is invalid`);
const integer = (value, minimum, maximum, label) => assert.ok(Number.isSafeInteger(value) && value >= minimum && value <= maximum, `${label} is outside its finite bound`);
const exactSet = (actual, expected, label) => assert.deepEqual([...actual].sort(), [...expected].sort(), `${label} exact inventory differs`);
const route = (value) => {
  id(value?.provider, "provider"); id(value?.model, "model");
  if (value.reasoningEffort !== undefined) id(value.reasoningEffort, "exact effort");
  return { provider: value.provider, model: value.model, ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }) };
};
function acceptedHeaderAtAttemptStart(agent) {
  const events = agent.session.snapshotEvents();
  const durable = events.filter(({ type }) => type === "request/header").at(-1);
  assert.ok(durable, "native attempt has no accepted durable header");
  const current = route(agent.session.requestHeader()?.config);
  const durableHeader = route(durable.data.header.config);
  assert.deepEqual(current, durableHeader, "current native header differs from its durable snapshot");
  return { ...current, seq: durable.seq, observedThroughSeq: events.at(-1).seq, durableHeader };
}

function validateAttempt(scenario, attempt, index) {
  id(attempt.attemptId, "native attempt ID");
  assert.equal(attempt.sessionId, scenario.sessionId, "attempt belongs to another native session");
  integer(attempt.turn, 0, 1_000, "native turn"); integer(attempt.step, 0, 1_000, "native step");
  integer(attempt.settlementSeq, 0, 100_000, "durable settlement sequence");
  assert.ok(["assistant/attempt", "assistant/message"].includes(attempt.settlementType), "attempt has no native durable settlement");
  assert.equal(attempt.durableAttemptId, attempt.attemptId, "live/durable attempt correlation differs");
  digest(attempt.liveStreamSha256, "observed native stream");
  assert.equal(attempt.durableStreamSha256, attempt.liveStreamSha256, "native durable stream differs from the observed attempt");
  assert.equal(attempt.callIndex, index, "provider request order differs");
  assert.ok(Array.isArray(attempt.outputKinds), "native stream output inventory missing");
  assert.ok(attempt.outputKinds.every((kind) => ["block-start", "text-delta", "reasoning-delta", "tool-call-delta", "block-end"].includes(kind)), "unknown output evidence");
  assert.deepEqual(route(attempt), route(scenario.headers[index]), "actual provider call differs from accepted native header");
  const header = scenario.headers[index];
  assert.deepEqual(route(header), header.durableHeader, "observed native header differs from the referenced durable header");
  integer(header.seq, 0, 100_000, "durable native header sequence"); integer(header.observedThroughSeq, header.seq, 100_000, "live attempt-start log position");
  assert.ok(header.observedThroughSeq < attempt.settlementSeq, "attempt-start header observation followed its settlement");
  assert.ok(["completed", "RATE_LIMIT", "NO_ADAPTER"].includes(attempt.result), "native attempt settlement is missing");
}

function validateRefusedStartup(contention) {
  assert.equal(contention?.phase, "before-native-loader"); assert.equal(contention.pathBasename, ".lock");
  assert.deepEqual(contention.nativeExit, { code: 1, signal: null }, "official native startup failure exit was suppressed or replaced");
  assert.equal(contention.startupOutcome, "refused"); integer(contention.elapsedMs, 1, 30_000, "bounded startup lock wait");
  digest(contention.pointerBeforeSha256, "startup pointer before"); assert.equal(contention.pointerAfterSha256, contention.pointerBeforeSha256);
  digest(contention.ownerBeforeSha256, "lock ownership before"); assert.equal(contention.ownerAfterSha256, contention.ownerBeforeSha256);
  assert.equal(contention.dsmmRuntimeReady, false, "startup contention silently admitted baseline");
  assert.deepEqual(contention.observedOperations, { nativeRequestPreparations: 0, nativeToolDispatches: 0 }, "contended startup prepared native requests or dispatched tools");
  assert.ok(Array.isArray(contention.loaderEntries), "actual native Loader inventory missing");
  const loader = contention.loaderEntries.find(({ id }) => id === "dsmm");
  assert.equal(loader?.state, 2, "outer native DSMM Loader state was fabricated instead of observing child admission failure");
  integer(loader.uid, 1, 100_000, "actual DSMM Loader fiber UID");
  const failure = contention.failedAdmission;
  assert.equal(failure?.nativeOwnership, "public-parent-fiber-identity"); assert.equal(failure.loaderEntryId, "dsmm");
  assert.equal(failure.loaderFiberUid, loader.uid);
  integer(failure.failedFiber?.uid, 1, 100_000, "failed native profile-admission fiber UID");
  assert.equal(failure.failedFiber.name, "installProfiles"); assert.equal(failure.failedFiber.state, 3);
  assert.ok(Array.isArray(failure.ancestry) && failure.ancestry.length >= 2 && failure.ancestry.length <= 32, "public native admission ownership chain missing");
  assert.deepEqual(failure.ancestry[0], failure.failedFiber);
  assert.equal(new Set(failure.ancestry.map(({ uid }) => uid)).size, failure.ancestry.length, "native ownership ancestry repeats a fiber");
  for (const fiber of failure.ancestry) { integer(fiber.uid, 1, 100_000, "native ancestry fiber UID"); id(fiber.name, "native ancestry fiber name"); integer(fiber.state, 0, 5, "native ancestry state"); }
  assert.deepEqual(failure.ancestry.at(-1), { uid: loader.uid, name: "dsmm", state: loader.state }, "failed native fiber belongs to a foreign Loader entry");
  assert.ok(Array.isArray(contention.nativePresetIds) && contention.nativePresetIds.includes("standard") && contention.nativePresetIds.includes("minimal"), "actual settled native baseline roster is missing");
  assert.ok(Array.isArray(contention.rootRoster), "actual DSMM root roster is missing");
  exactSet(contention.rootRoster.map(({ id }) => id), contention.nativePresetIds.filter((id) => id.startsWith("dsmm-")), "observed native DSMM roster projection");
  if (contention.rootRosterDisposition === "not-registered") {
    assert.deepEqual(contention.rootRoster, [], "failed pre-registration Loader exposed a DSMM root");
  } else {
    assert.equal(contention.rootRosterDisposition, "blocked-compositions", "startup roster disposition missing");
    exactSet(contention.rootRoster.map(({ id }) => id), ["dsmm-orchestrator", "dsmm-planner"], "blocked native root inventory");
    assert.ok(contention.rootRoster.every(({ broken }) => typeof broken === "string" && broken.length > 0), "blocked DSMM roots were mislabeled ready");
  }
}

export function validateStartupProfileProof(proof, { version, sourceContract, artifactSha256, installedRoot, profileStorage, ownedHome }) {
  const contract = startupProfileContract(version, { sourceContract });
  if (contract === "historical-read-lock") {
    validateRefusedStartup(proof);
    return { contract };
  }
  assert.equal(proof?.contract, contract);
  assert.equal(proof.artifactSha256, artifactSha256); digest(artifactSha256, "trusted startup artifact");
  assert.equal(proof.installedRoot, installedRoot); assert.equal(proof.packageVersion, version);
  assert.equal(proof.phase, "before-native-loader"); assert.equal(proof.scenario, "stable-selection");
  assert.equal(proof.startupOutcome, "read-admitted-write-refused"); assert.deepEqual(proof.nativeExit, { code: 0, signal: null });
  integer(proof.elapsedMs, 1, 30_000, "bounded startup read/write proof"); integer(proof.processId, 1, 2 ** 31 - 1, "independent native process");
  integer(proof.parentProcessId, 1, 2 ** 31 - 1, "acceptance producer process"); assert.notEqual(proof.processId, proof.parentProcessId);
  for (const key of ["dsmmRuntimeReady", "runtimeBackendIdentity", "postAppReady", "regularOwnedLock", "rootDisposed"]) assert.equal(proof[key], true, key);
  assert.deepEqual(proof.observedOperations, { nativeRequestPreparations: 0, nativeToolDispatches: 0 });
  const storage = proof.storage;
  assert.equal(storage?.origin, "central"); assert.equal(storage.home, ownedHome);
  const paths = installedRoot?.startsWith("/") ? posix : win32;
  const inside = (path) => {
    id(path, "owned startup path"); assert.equal(paths.isAbsolute(path), true); assert.equal(paths.normalize(path), path);
    const within = paths.relative(ownedHome, path);
    assert.ok(within && within !== ".." && !within.startsWith(`..${paths.sep}`) && !paths.isAbsolute(within));
  };
  id(ownedHome, "owned startup home"); assert.equal(paths.isAbsolute(ownedHome), true);
  inside(installedRoot); inside(storage.hostProfileDir);
  assert.equal(storage.hostProfileDir, paths.dirname(paths.dirname(paths.dirname(installedRoot))));
  assert.equal(storage.profileDir, paths.join(ownedHome, "plugins", "dsmm", "profiles"));
  id(storage.entryId, "actual startup entry");
  const hostIdentity = paths === win32 ? storage.hostProfileDir.toLowerCase() : storage.hostProfileDir;
  assert.equal(storage.stateDir, paths.join(storage.profileDir, ".state", proofDigest(JSON.stringify([hostIdentity, storage.entryId]))));
  assert.equal(storage.pointerPath, paths.join(storage.stateDir, ".selection.json")); assert.equal(storage.lockPath, paths.join(storage.profileDir, ".lock"));
  for (const key of ["origin", "profileDir", "stateDir", "entryId", "pointerPath", "lockPath"]) assert.equal(storage[key], profileStorage?.[key], `startup storage ${key}`);
  const loaders = proof.loaderEntries?.filter(({ name }) => name === "@dsmm/dsmm");
  assert.equal(loaders?.length, 1); const loader = loaders[0];
  assert.equal(loader.id, "dsmm"); assert.equal(loader.state, 2); integer(loader.uid, 1, 100_000, "native Loader UID");
  assert.deepEqual(proof.loaderIdentity, { entryId: storage.entryId, optionsId: "dsmm", name: "@dsmm/dsmm", uid: loader.uid, startupEntryId: storage.entryId });
  const selection = proof.selection;
  assert.match(selection?.selectedId, /^startup-lock-[a-f0-9-]{36}$/u);
  digest(selection.appliedRevision, "cold immutable revision"); digest(selection.selectionRevision, "cold pointer revision");
  for (const key of ["document", "revision", "pointer", "owner"]) {
    digest(proof.bytes?.[key]?.beforeSha256, `startup ${key} before`);
    assert.equal(proof.bytes[key].afterSha256, proof.bytes[key].beforeSha256);
  }
  assert.equal(proof.bytes.document.beforeSha256, selection.appliedRevision); assert.equal(proof.bytes.revision.beforeSha256, selection.appliedRevision);
  assert.equal(proof.bytes.pointer.beforeSha256, selection.selectionRevision);
  assert.equal(proof.write?.operation, "runtime.save"); assert.equal(proof.write.code, "lock-timeout");
  digest(proof.write.attemptedContentSha256, "actual changed document write"); assert.notEqual(proof.write.attemptedContentSha256, selection.appliedRevision);
  assert.equal(proof.coldReviewCap, 7);
  const root = proof.root;
  id(root?.sessionId, "new native root"); digest(root.admissionEpoch, "new native root epoch");
  assert.equal(root.nativeOrigin, null); assert.equal(root.nativeParentSession, null); assert.deepEqual(root.nativeOwnerIds, []);
  assert.equal(root.preset, "dsmm-orchestrator"); assert.equal(root.scope, "global-default");
  assert.equal(root.reviewCap, 7); assert.equal(root.requestOrToolEvents, 0);
  for (const key of Object.keys(selection)) assert.equal(root[key], selection[key]);
  const corrupt = proof.corruptSelection;
  assert.equal(corrupt?.contract, contract); assert.equal(corrupt.scenario, "corrupt-selection"); assert.equal(corrupt.failureCode, "corrupt-selection");
  assert.equal(corrupt.artifactSha256, artifactSha256); assert.equal(corrupt.installedRoot, installedRoot); assert.equal(corrupt.packageVersion, version);
  validateRefusedStartup(corrupt);
  integer(corrupt.processId, 1, 2 ** 31 - 1, "independent corrupt-selection process");
  assert.notEqual(corrupt.processId, proof.processId); assert.notEqual(corrupt.processId, proof.parentProcessId);
  assert.deepEqual(corrupt.loaderIdentity, { entryId: storage.entryId, optionsId: "dsmm", name: "@dsmm/dsmm", uid: corrupt.failedAdmission.loaderFiberUid });
  assert.equal(corrupt.ownerBeforeSha256, proof.bytes.owner.beforeSha256);
  for (const key of ["document", "revision"]) {
    assert.equal(corrupt[`${key}BeforeSha256`], proof.bytes[key].beforeSha256);
    assert.equal(corrupt[`${key}AfterSha256`], corrupt[`${key}BeforeSha256`]);
  }
  assert.notEqual(corrupt.pointerBeforeSha256, proof.bytes.pointer.beforeSha256);
  assert.equal(proof.restoredPointerSha256, proof.bytes.pointer.beforeSha256);
  digest(proof.cleanup?.originalPointerSha256, "original pointer cleanup"); assert.equal(proof.cleanup.restoredOriginalPointerSha256, proof.cleanup.originalPointerSha256);
  for (const key of ["ownedLockRemoved", "ownedDocumentRemoved", "ownedRevisionRemoved"]) assert.equal(proof.cleanup[key], true, key);
  return { contract };
}

/** Check observed attempts, disk digests and native snapshots; check booleans are not proof. */
export function validateSessionProfileProof(proof, { artifactSha256, installedRoot, version, sourceContract, profileStorage, ownedHome }) {
  startupProfileContract(version, { sourceContract });
  const nativeOwnedRoot = requiresNativePickerProof(version);
  const schemaVersion = nativeOwnedRoot ? 2 : 1;
  assert.equal(proof?.schemaVersion, schemaVersion, "successor proof schema missing or differs from trusted version");
  assert.equal(proof.artifactSha256, artifactSha256, "successor proof artifact differs");
  assert.equal(proof.installedRoot, installedRoot, "successor proof imported checkout code");
  const editor = proof.editor;
  assert.equal(editor?.catalogEndpoint, "session/modelCatalog", "native catalog endpoint differs");
  integer(editor.catalogCalls, 2, 50, "initial and refresh native catalog reads");
  assert.ok(Array.isArray(editor.models) && editor.models.some((model) => model.provider === "dsmm-ui-fixture" && model.id === "local-catalog"), "actual native catalog fixture rows missing");
  assert.ok(editor.rawBefore.includes("// preserved acceptance comment"), "raw comment fixture missing");
  assert.ok(editor.rawAfter.includes("// preserved acceptance comment"), "structured editor lost unrelated comments");
  digest(editor.beforeSha256, "editor before"); digest(editor.afterSha256, "editor after");
  assert.equal(proofDigest(editor.rawBefore), editor.beforeSha256); assert.equal(proofDigest(editor.rawAfter), editor.afterSha256);
  assert.notEqual(editor.beforeSha256, editor.afterSha256, "structured controls never changed the actual saved draft");
  assert.deepEqual(editor.untouchedBefore, editor.untouchedAfter, "structured editor changed unrelated runtime settings");
  assert.deepEqual(editor.savedPolicy.primary, { provider: "dsmm-ui-fixture", model: "local-catalog", reasoningEffort: "max" });
  assert.deepEqual(editor.savedPolicy.fallbackRoutes.map((candidate) => candidate.model), ["fallback-second", "fallback-first"]);
  assert.equal(editor.savedPolicy.strategy, "rate-limit-fallback");
  assert.equal(editor.savedPolicy.rateLimit.maxRetries, 2); assert.equal(editor.savedPolicy.rateLimit.switchAfterRateLimits, 2);
  assert.deepEqual(editor.manualRoute, editor.nativeResolvedManualRoute, "unlisted manual route failed native preparation");
  assert.equal(editor.manualRoute.model, "custom-manual-unlisted");
  assert.equal(editor.manualBeforeRefresh, editor.manualAfterRefresh, "catalog refresh rewrote an unlisted manual draft");
  assert.equal(editor.invalidRaw, "{ broken successor JSONC"); assert.equal(editor.invalidRawAfterStructuredRefusal, editor.invalidRaw);
  assert.equal(editor.globalSelectionBefore, editor.globalSelectionAfter, "catalog/form edits changed global selection");
  const sessions = proof.sessions;
  digest(sessions?.globalPointerBefore, "global pointer before"); digest(sessions.globalPointerAfter, "global pointer after");
  assert.equal(sessions.globalPointerBefore, sessions.globalPointerAfter, "current-session selection mutated the global pointer");
  assert.equal(sessions.roots?.length, 2, "two independent live native roots required");
  assert.notEqual(sessions.roots[0].sessionId, sessions.roots[1].sessionId);
  assert.notEqual(sessions.roots[0].selectedId, sessions.roots[1].selectedId);
  for (const root of sessions.roots) {
    id(root.sessionId, "native root ID"); id(root.epochBefore, "old admission epoch"); id(root.epochAfter, "new admission epoch");
    assert.notEqual(root.epochBefore, root.epochAfter, "explicit selection did not create a fenced admission epoch");
    digest(root.appliedRevision, "session immutable revision"); digest(root.sidecarSha256, "session sidecar bytes");
    assert.equal(root.snapshot.sessionId, root.sessionId); assert.equal(root.snapshot.admissionEpoch, root.epochAfter);
    assert.equal(root.snapshot.selection.selectedId, root.selectedId); assert.equal(root.snapshot.selection.appliedRevision, root.appliedRevision);
    assert.equal(root.snapshot.scope, "session-override");
  }
  const root = sessions.roots[0];
  assert.equal(sessions.uiSelectedSessionId, root.sessionId, "UI applied to a guessed Session");
  assert.equal(sessions.uiAppliedEpoch, root.epochAfter, "UI snapshot differs from committed native admission");
  assert.notEqual(sessions.reappliedEpoch, root.epochAfter, "same-revision reapply must create a new epoch");
  exactSet(sessions.refusals.map(({ code }) => code), ["conflict", "busy", "maintenance", "not-owned"], "native session mutation refusals");
  for (const refusal of sessions.refusals) {
    digest(refusal.beforeSha256, "refused selection before"); assert.equal(refusal.afterSha256, refusal.beforeSha256, "refused mutation changed disk");
  }
  assert.equal(sessions.children?.length, 2, "old/new genuinely owned child admission evidence required");
  assert.equal(sessions.children[0].epoch, root.epochBefore); assert.equal(sessions.children[1].epoch, root.epochAfter);
  assert.ok(sessions.children.every((child) => typeof child.sessionId === "string" && child.nativeOwnedBy === root.sessionId));
  const cold = proof.cold;
  assert.equal(cold?.sessionId, root.sessionId); assert.equal(cold.selectedId, root.selectedId);
  assert.equal(cold.appliedRevision, root.appliedRevision); assert.equal(cold.sidecarSha256, sessions.reappliedSidecarSha256);
  assert.equal(cold.admissionEpoch, sessions.reappliedEpoch);
  assert.notEqual(cold.changedGlobalRevision, cold.appliedRevision, "cold restore never tested a different global default");
  integer(cold.stockEvents, 1, 100_000, "stock cold-read event count"); integer(cold.coreEvents, 1, cold.stockEvents, "stock core events");
  digest(cold.visibleBeforeSha256, "live native visible history"); assert.equal(cold.visibleAfterSha256, cold.visibleBeforeSha256);
  digest(cold.headersBeforeSha256, "live native request headers"); assert.equal(cold.headersAfterSha256, cold.headersBeforeSha256);
  validateStartupProfileProof(proof.startupLock, { artifactSha256, installedRoot, version, sourceContract, profileStorage, ownedHome });
  const scenarios = proof.routeScenarios;
  assert.ok(Array.isArray(scenarios)); exactSet(scenarios.map(({ name }) => name), NATIVE_SCENARIOS_015, "native route scenarios");
  const byName = new Map(scenarios.map((scenario) => [scenario.name, scenario]));
  assert.equal(new Set(scenarios.map(({ sessionId }) => sessionId)).size, scenarios.length, "native scenarios shared a session/counter owner");
  assert.equal(new Set(scenarios.map(({ admissionEpoch }) => admissionEpoch)).size, scenarios.length, "native scenarios shared an admission epoch");
  const expectedPolicy = { maxRetries: 2, initialDelayMs: 0, maxDelayMs: 0, maxTotalDelayMs: 0, switchAfterRateLimits: 2, maxSwitches: 2 };
  const expectedResults = {
    "startup-primary-lock": ["completed", "completed"], "startup-first-available": ["completed", "completed"],
    "startup-rate-limit": ["RATE_LIMIT", "RATE_LIMIT", "RATE_LIMIT"], "rate-limit-rollover": ["RATE_LIMIT", "RATE_LIMIT", "RATE_LIMIT", "RATE_LIMIT", "completed"],
    "unavailable-first": ["NO_ADAPTER", "completed"], "unavailable-partial": ["NO_ADAPTER"], "unavailable-later": ["completed", "NO_ADAPTER"],
    "startup-lock-partial-text": ["RATE_LIMIT"], "startup-lock-partial-tool": ["RATE_LIMIT"],
    "rate-limit-fallback-partial-text": ["RATE_LIMIT"], "rate-limit-fallback-partial-tool": ["RATE_LIMIT"],
    "profile-beta-reviewer": ["RATE_LIMIT", "RATE_LIMIT", "completed"], "profile-alpha-planner": ["RATE_LIMIT", "RATE_LIMIT", "completed"],
  };
  for (const scenario of scenarios) {
    if (nativeOwnedRoot) {
      assert.equal(scenario.roleScope, "child", "role strategy must execute a genuine native child");
      assert.equal(scenario.nativeOrigin, "subagent", "role strategy ran as a native root");
      assert.equal(scenario.nativeDescriptor?.mode, "one-shot", "native child descriptor is missing");
      const expectedRole = scenario.name === "profile-alpha-planner" ? "dsmm-planner" : "dsmm-reviewer";
      assert.equal(scenario.role, expectedRole, "native strategy child role differs");
      assert.equal(scenario.nativeDescriptor.provider, `dsmm-role-${expectedRole.slice("dsmm-".length)}`, "native child descriptor role differs");
    }
    id(scenario.sessionId, "scenario native session"); id(scenario.admissionEpoch, "scenario admission epoch");
    const expectedStrategy = scenario.name.startsWith("rate-limit") || scenario.name.startsWith("profile-") ? "rate-limit-fallback" : "startup-lock";
    assert.equal(scenario.strategy, expectedStrategy, "actual resolved scenario strategy differs");
    digest(scenario.profileRevision, "observed immutable scenario profile");
    assert.deepEqual(scenario.policy, expectedPolicy, "actual finite fixture retry policy differs");
    assert.equal(scenario.recoveryEnabled, true, "disabled baseline cannot prove successor recovery");
    assert.equal(scenario.nativeLoop, "followup/whenIdle", "scenario bypassed the native loop");
    assert.equal(scenario.downstreamAlwaysCalls, 0, "competing native always handler was invoked");
    assert.deepEqual(scenario.toolExecutions, [], "refused/retried native attempts executed tools");
    assert.equal(scenario.attempts.length, scenario.headers.length, "attempt/header counts differ");
    assert.ok(scenario.attempts.length > 0);
    assert.equal(new Set(scenario.attempts.map(({ attemptId }) => attemptId)).size, scenario.attempts.length, "duplicate native attempt evidence");
    scenario.attempts.forEach((attempt, index) => validateAttempt(scenario, attempt, index));
    assert.deepEqual(scenario.attempts.map(({ result }) => result), expectedResults[scenario.name], "actual native scenario outcomes differ");
    assert.equal(scenario.terminal, expectedResults[scenario.name].at(-1) === "completed" ? "completed" : "error", "native scenario terminal outcome differs");
    for (const [index, attempt] of scenario.attempts.entries()) {
      assert.equal(attempt.reasoningEffort, "max", "exact configured max was substituted");
      assert.equal(attempt.provider, "dsmm-strategy-fixture", "actual request escaped the owned deterministic provider");
      assert.equal(attempt.settlementType, attempt.result === "completed" ? "assistant/message" : "assistant/attempt", "native settlement type contradicts the attempt result");
      if (attempt.result === "completed") assert.ok(attempt.outputKinds.includes("text-delta") && attempt.outputKinds.includes("block-end"), "success has no accepted complete native output");
      if (attempt.result !== "completed" && index < scenario.attempts.length - 1) {
        assert.deepEqual(attempt.outputKinds, [], "automatic retry followed accepted provider output");
        assert.equal(scenario.attempts[index + 1].turn, attempt.turn, "retry synthesized a new native turn");
        assert.equal(scenario.attempts[index + 1].step, attempt.step, "retry replayed a new native step");
      }
    }
    integer(scenario.policy.maxRetries, 0, 10, "retry cap"); integer(scenario.policy.switchAfterRateLimits, 1, 10, "threshold");
    integer(scenario.policy.maxSwitches, 0, 10, "switch cap");
  }
  const models = (name) => byName.get(name).attempts.map(({ model }) => model);
  assert.deepEqual(models("startup-primary-lock"), ["primary-lock", "primary-lock"]);
  assert.deepEqual(models("startup-first-available"), ["available-fallback", "available-fallback"]);
  assert.deepEqual(models("startup-rate-limit"), ["same-rate", "same-rate", "same-rate"]);
  assert.equal(byName.get("startup-rate-limit").strategy, "startup-lock");
  assert.ok(byName.get("startup-rate-limit").attempts.every(({ result, outputKinds }) => result === "RATE_LIMIT" && outputKinds.length === 0));
  assert.equal(byName.get("startup-rate-limit").terminal, "error");
  assert.deepEqual(models("rate-limit-rollover"), ["threshold-primary", "threshold-primary", "threshold-first", "threshold-first", "threshold-second"]);
  assert.equal(byName.get("rate-limit-rollover").strategy, "rate-limit-fallback");
  assert.deepEqual(byName.get("rate-limit-rollover").attempts.map(({ result }) => result), ["RATE_LIMIT", "RATE_LIMIT", "RATE_LIMIT", "RATE_LIMIT", "completed"]);
  assert.deepEqual(models("unavailable-first"), ["unavailable-primary", "unavailable-fallback"]);
  assert.equal(byName.get("unavailable-first").attempts[0].result, "NO_ADAPTER");
  assert.deepEqual(byName.get("unavailable-first").attempts[0].outputKinds, []);
  assert.deepEqual(models("unavailable-partial"), ["unavailable-partial"]);
  assert.ok(byName.get("unavailable-partial").attempts[0].outputKinds.includes("text-delta"));
  assert.deepEqual(models("unavailable-later"), ["unavailable-later", "unavailable-later"]);
  for (const strategy of ["startup-lock", "rate-limit-fallback"]) for (const kind of ["text", "tool"]) {
    const scenario = byName.get(`${strategy}-partial-${kind}`);
    assert.equal(scenario.strategy, strategy); assert.equal(scenario.attempts.length, 1);
    assert.equal(scenario.attempts[0].result, "RATE_LIMIT"); assert.equal(scenario.terminal, "error");
    assert.ok(scenario.attempts[0].outputKinds.includes(kind === "text" ? "text-delta" : "tool-call-delta"), "partial native output was not actually observed");
  }
  assert.equal(byName.get("startup-primary-lock").role, "dsmm-reviewer");
  assert.equal(byName.get("profile-beta-reviewer").role, "dsmm-reviewer");
  assert.equal(byName.get("profile-beta-reviewer").strategy, "rate-limit-fallback");
  assert.notEqual(byName.get("profile-beta-reviewer").profileId, byName.get("startup-primary-lock").profileId);
  assert.notEqual(byName.get("profile-beta-reviewer").profileRevision, byName.get("startup-primary-lock").profileRevision);
  assert.equal(byName.get("profile-alpha-planner").role, "dsmm-planner");
  assert.equal(byName.get("profile-alpha-planner").strategy, "rate-limit-fallback");
  assert.equal(byName.get("profile-alpha-planner").profileId, byName.get("startup-primary-lock").profileId);
  assert.equal(byName.get("profile-alpha-planner").profileRevision, byName.get("startup-primary-lock").profileRevision, "same-profile role strategies were tested on different revisions");
  assert.deepEqual(models("profile-beta-reviewer"), ["profile-beta-reviewer", "profile-beta-reviewer", "beta-reviewer-fallback"]);
  assert.deepEqual(models("profile-alpha-planner"), ["profile-alpha-planner", "profile-alpha-planner", "alpha-planner-fallback"]);
  validateNativeModelSelectionProof(proof.nativeSelection, nativeOwnedRoot);
  return { schemaVersion, scenarios: scenarios.length, independentSessions: sessions.roots.length };
}

function validateNativeModelSelectionProof(selection, nativeOwnedRoot) {
  assert.equal(selection?.endpoint, "session/selectModel", "manual selection did not use the public native endpoint");
  assert.equal(selection.nativeLoop, "followup/whenIdle");
  assert.equal(selection.role, "dsmm-orchestrator"); assert.equal(selection.enabledDeepwork, true);
  assert.equal(selection.descriptor?.resultMode, "strict");
  assert.ok(selection.descriptor.parameters.some(({ name, mode }) => name === "request" && mode === "strict"));
  assert.ok(selection.descriptor.parameters.every(({ mode }) => mode === "strict"));
  id(selection.sessionId, "native selected session"); digest(selection.profileRevision, "native choice profile revision");
  assert.equal(selection.profileId, "native-manual-selection");
  const primary = { provider: "dsmm-selection-fixture", model: "role-default", reasoningEffort: "max" };
  const inherited = { provider: "dsmm-selection-fixture", model: "native-inherited", reasoningEffort: "high" };
  const low = { provider: "dsmm-selection-fixture", model: "native-chosen", reasoningEffort: "low" };
  const high = { ...low, reasoningEffort: "high" };
  assert.deepEqual(selection.configuredPrimary, primary);
  assert.equal(selection.choices?.length, 3, "native model/effort/same-value selections are missing");
  assert.deepEqual(selection.choices.map(({ kind }) => kind), ["model-and-effort", "effort-only", "same-value-reselection"]);
  selection.choices.forEach((choice, index) => {
    const expected = index === 0 ? low : high;
    assert.equal(choice.request.sessionId, selection.sessionId);
    assert.deepEqual(route(choice.request), expected); assert.deepEqual(choice.selected, expected); assert.deepEqual(choice.durableSelection, expected);
    integer(choice.eventSeq, 0, 100_000, "durable native user intent sequence");
    if (index > 0) assert.ok(choice.eventSeq > selection.choices[index - 1].eventSeq, "same-value native selection did not produce fresh intent");
  });
  const phases = [nativeOwnedRoot ? "native-default" : "profile-default", "native-model-choice", "subsequent-turn", "effort-only-choice", "profile-reapply", "same-value-reselection", "cold-resume"];
  assert.equal(selection.attempts?.length, phases.length, "actual selected-route requests are missing");
  assert.equal(selection.headers?.length, phases.length);
  assert.deepEqual(selection.attempts.map(({ phase }) => phase), phases);
  assert.deepEqual(selection.attempts.map(({ agentLifecycle }) => agentLifecycle), [...Array(6).fill("initial"), "cold-resumed"]);
  assert.equal(new Set(selection.attempts.map(({ agentLifecycle, attemptId }) => `${agentLifecycle}:${attemptId}`)).size, phases.length, "duplicate native attempt within one actual Agent lifecycle");
  selection.attempts.forEach((attempt, index) => {
    validateAttempt(selection, attempt, index);
    assert.deepEqual(route(attempt), index === 0 ? nativeOwnedRoot ? inherited : primary : index < 3 ? low : high, "native user route was overridden by the profile default");
    assert.equal(attempt.result, "completed"); assert.equal(attempt.terminal, "completed");
    assert.equal(attempt.settlementType, "assistant/message"); assert.deepEqual(attempt.toolExecutions, []);
    assert.ok(attempt.outputKinds.includes("text-delta") && attempt.outputKinds.includes("block-end"));
    integer(selection.headers[index].seq, 0, 100_000, "accepted native header sequence");
    assert.ok(selection.headers[index].seq < attempt.settlementSeq);
    if (index > 0) { assert.ok(selection.headers[index].seq >= selection.headers[index - 1].seq); assert.ok(attempt.turn > selection.attempts[index - 1].turn); }
  });
  for (const [choiceIndex, precedingIndex, followingIndex] of [[0, 0, 1], [1, 2, 3], [2, 4, 5]]) {
    const choice = selection.choices[choiceIndex];
    assert.ok(selection.attempts[precedingIndex].settlementSeq < choice.eventSeq && choice.eventSeq <= selection.headers[followingIndex].observedThroughSeq, "native selection did not precede the actual next attempt");
  }
  id(selection.epochBefore, "manual choice profile epoch before apply"); id(selection.epochAfter, "manual choice profile epoch after apply");
  assert.notEqual(selection.epochBefore, selection.epochAfter); assert.equal(selection.coldEpoch, selection.epochAfter);
  assert.equal(selection.coldAgentReplaced, true);
  assert.equal(selection.oldAgentDisposedBeforeResume, true);
  assert.equal(selection.nativeDefaultScope, "isolated-task-owned-home");
  assert.equal(selection.pickerUi, "NOT_EXERCISED", "owned native endpoint proof is not picker UI proof");
}

/** Native host services + the exact installed DSMM package, never source fixtures. */
export async function runNativeRouteScenarios(ctx, { nativeRequire, packageRoot, workspace, roleScope = "root" }) {
  assert.ok(roleScope === "root" || roleScope === "child", "native strategy scope must be explicit root or child");
  const load = (specifier) => import(pathToFileURL(nativeRequire.resolve(specifier)).href);
  const [{ LlmAdapter, LlmError, ReasoningEffortId, ToolCallId, createUserMessage, expandAssistantStream }, { SessionId }] = await Promise.all([
    load("@deepseek-ai/dsh-llm"), load("@deepseek-ai/dsh-session"),
  ]);
  // Historical release controllers retain their original root path. New
  // acceptance executes genuine auxiliary Session boundaries.
  const subagent = roleScope === "child" ? await load("@deepseek-ai/dsh-subagent") : undefined;
  const installedManifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  assert.equal(installedManifest.name, "@dsmm/dsmm");
  const runtime = ctx.get("dsmmProfileRuntime");
  const { resolveRoleRuntimePolicy } = await import(pathToFileURL(join(packageRoot, "lib", "settings.js")).href);
  const agents = ctx.get("agents");
  const scenarios = [];
  let active;
  const handles = [];
  class StrategyAdapter extends LlmAdapter {
    async resolveModel(provider, model) {
      return { provider, id: model, name: model, inputModalities: ["text"], reasoning: {
        efforts: ["off", "low", "high", "max"].map((effort) => ({ id: ReasoningEffortId(effort), name: effort })), defaultEffort: ReasoningEffortId("high"),
      } };
    }
    async *stream(options) {
      assert.ok(active, "native adapter was called outside its owned scenario");
      options.signal?.throwIfAborted();
      const frame = active.live.at(-1);
      assert.ok(frame?.attemptId, "native provider call has no live attempt start");
      active.calls.push({ attemptId: frame.attemptId, ...route(options) });
      const count = active.calls.length;
      const name = active.name;
      const partialText = name.endsWith("partial-text") || name === "unavailable-partial";
      const partialTool = name.endsWith("partial-tool");
      if (partialText) {
        yield { type: "block-start", index: 0, blockType: "text" };
        yield { type: "text-delta", index: 0, text: "accepted partial fixture text" };
      }
      if (partialTool) {
        yield { type: "block-start", index: 0, blockType: "tool-call" };
        yield { type: "tool-call-delta", index: 0, id: ToolCallId("incomplete-owned-call"), name: "read", argumentsDelta: '{"file_path":' };
      }
      if (partialText || partialTool || name === "startup-rate-limit" || (name === "rate-limit-rollover" && options.model !== "threshold-second")
        || (name.startsWith("profile-") && options.model === name)) {
        throw new LlmError("deterministic acceptance failure", name.startsWith("unavailable") ? "NO_ADAPTER" : "RATE_LIMIT", { status: name.startsWith("unavailable") ? 503 : 429 });
      }
      if ((name === "unavailable-first" && count === 1) || (name === "unavailable-later" && count === 2)) throw new LlmError("deterministic missing adapter", "NO_ADAPTER", { status: 503 });
      yield { type: "block-start", index: 0, blockType: "text" };
      yield { type: "text-delta", index: 0, text: "native strategy fixture complete" };
      yield { type: "block-end", index: 0, block: { type: "text", text: "native strategy fixture complete" } };
      yield { type: "finish", reason: { kind: "stop" } };
    }
  }
  ctx.get("llm").registerAdapter(["dsmm-strategy-fixture"], new StrategyAdapter());
  const disposeStream = ctx.on("agent/assistant-stream", ({ agent, frame }) => {
    if (active?.agent !== agent) return;
    if (frame.type === "start") active.live.push({ ...frame, acceptedHeader: acceptedHeaderAtAttemptStart(agent), outputKinds: [], chunks: [] });
    else {
      const live = active.live.find(({ attemptId }) => attemptId === frame.attemptId);
      assert.ok(live, "native stream emitted before attempt start");
      if (frame.type === "chunk") live.chunks.push({ time: frame.time, chunk: frame.chunk });
      if (frame.type === "chunk" && frame.chunk.type !== "finish") live.outputKinds.push(frame.chunk.type);
      if (frame.type === "chunk" && frame.chunk.type === "finish") live.finish = frame.chunk;
      if (frame.type === "end") live.end = frame;
    }
  }, { global: true });
  const disposeAlways = ctx.on("agent/request-error", async ({ agent, failure }, next) => {
    if (active?.agent !== agent || failure.code !== "RATE_LIMIT") return await next();
    active.downstreamAlwaysCalls += 1;
    // An actual native always-style retry owner; DSMM must not fall through.
    return { kind: "retry" };
  }, { global: true });
  const previous = await runtime.describe();
  try {
    for (const name of NATIVE_SCENARIOS_015) {
      const strategy = name.startsWith("rate-limit") || name.startsWith("profile-") ? "rate-limit-fallback" : "startup-lock";
      const role = name === "profile-alpha-planner" ? "dsmm-planner" : "dsmm-reviewer";
      const profileId = name === "profile-beta-reviewer" ? "native-policy-beta" : "native-policy-alpha";
      const model = ({ "startup-primary-lock": "primary-lock", "startup-first-available": "unresolvable-primary", "startup-rate-limit": "same-rate", "rate-limit-rollover": "threshold-primary", "unavailable-first": "unavailable-primary" })[name] ?? name;
      const fallbackModels = name === "startup-first-available" ? ["available-fallback"] : name === "rate-limit-rollover" ? ["threshold-first", "threshold-second"] : name === "unavailable-first" ? ["unavailable-fallback"]
        : name === "profile-beta-reviewer" ? ["beta-reviewer-fallback"] : name === "profile-alpha-planner" ? ["alpha-planner-fallback"] : ["must-not-hop"];
      const policy = { maxRetries: 2, initialDelayMs: 0, maxDelayMs: 0, maxTotalDelayMs: 0, switchAfterRateLimits: 2, maxSwitches: 2 };
      const primary = { provider: name === "startup-first-available" ? "dsmm-missing-native-adapter" : "dsmm-strategy-fixture", model, reasoningEffort: "max" };
      const settings = { defaultActive: true, runtimeRecovery: { enabled: true, idleContinuation: { enabled: false } }, roleRouting: {
        [role]: { primary, fallbackRoutes: fallbackModels.map((fallback) => ({ provider: "dsmm-strategy-fixture", model: fallback, reasoningEffort: "max" })), strategy, rateLimit: policy },
      } };
      if (name === "startup-primary-lock" || name === "profile-alpha-planner") settings.roleRouting = {
        "dsmm-reviewer": { primary: { provider: "dsmm-strategy-fixture", model: "primary-lock", reasoningEffort: "max" }, fallbackRoutes: [{ provider: "dsmm-strategy-fixture", model: "must-not-hop", reasoningEffort: "max" }], strategy: "startup-lock", rateLimit: policy },
        "dsmm-planner": { primary: { provider: "dsmm-strategy-fixture", model: "profile-alpha-planner", reasoningEffort: "max" }, fallbackRoutes: [{ provider: "dsmm-strategy-fixture", model: "alpha-planner-fallback", reasoningEffort: "max" }], strategy: "rate-limit-fallback", rateLimit: policy },
      };
      const existing = (await runtime.describe()).profiles.find(({ id }) => id === profileId);
      const saved = await runtime.save({ id: profileId, expectedRevision: existing?.revision ?? null, content: `${JSON.stringify({ version: 1, id: profileId, settings }, null, 2)}\n` });
      await runtime.select({ id: profileId, expectedRevision: saved.revision, expectedSelectionRevision: (await runtime.describe()).selectionRevision });
      const handle = await agents.create({ sessionId: SessionId(`dsmm-successor-${name}`), meta: { cwd: workspace, agentPreset: role, ...(roleScope === "child" ? { origin: "subagent" } : {}) },
        agentOptions: { provider: "dsmm-strategy-fixture", model: "native-inherited", reasoningEffort: ReasoningEffortId("low") } });
      handles.push(handle);
      const agent = handle.agent;
      if (roleScope === "child") {
        assert.equal(agent.session.header.origin, "subagent");
        agent.session.append("subagent/descriptor", subagent.snapshotSubagentDescriptor({ mode: "one-shot", provider: `dsmm-role-${role.slice("dsmm-".length)}` }));
      }
      active = { name, agent, calls: [], live: [], toolExecutions: [], downstreamAlwaysCalls: 0 };
      const turns = ["startup-primary-lock", "startup-first-available", "unavailable-later"].includes(name) ? 2 : 1;
      for (let turn = 0; turn < turns; turn += 1) {
        let timedOut = false;
        const watchdog = setTimeout(() => { timedOut = true; agent.cancel({ kind: "hook", reason: "Owned acceptance scenario exceeded its finite native loop budget" }); }, 5_000);
        try {
          agent.followup(createUserMessage({ content: [{ type: "text", text: "Complete the owned native strategy fixture" }], source: { kind: "user" } }));
          await agent.whenIdle();
          assert.equal(timedOut, false, "native policy loop exceeded its finite acceptance budget");
        } finally { clearTimeout(watchdog); }
      }
      const events = agent.session.snapshotEvents();
      const headers = active.live.map(({ acceptedHeader }) => acceptedHeader);
      const attempts = active.calls.map((call, callIndex) => {
        const live = active.live.find(({ attemptId }) => attemptId === call.attemptId);
        assert.equal(live.end?.outcome.kind, "committed", "native attempt did not settle durably");
        const event = events.find(({ seq }) => seq === live.end.outcome.seq);
        const expanded = expandAssistantStream(event.data.stream);
        assert.deepEqual(expanded, live.chunks, "live attempt chunks differ from its durably correlated settlement");
        const finish = live.finish;
        return { ...call, callIndex, sessionId: agent.id, turn: live.turn, step: live.step, outputKinds: live.outputKinds,
          settlementSeq: event.seq, settlementType: event.type, durableAttemptId: live.end.attemptId,
          liveStreamSha256: proofDigest(JSON.stringify(live.chunks)), durableStreamSha256: proofDigest(JSON.stringify(expanded)),
          result: finish.reason.kind === "error" ? finish.reason.failure.code : "completed" };
      });
      const actualPolicy = resolveRoleRuntimePolicy(runtime.getSettings(agent), role);
      scenarios.push({ name, profileId: runtime.admission(agent).selectedId, profileRevision: runtime.admission(agent).appliedRevision, role, strategy: actualPolicy.strategy, policy: actualPolicy.rateLimit, recoveryEnabled: runtime.getSettings(agent).runtimeRecovery.enabled,
        ...(roleScope === "child" ? { roleScope, nativeOrigin: agent.session.header.origin, nativeDescriptor: subagent.foldSubagentDescriptor(events.slice(agent.session.inheritedEventCount)) } : {}),
        sessionId: agent.id, admissionEpoch: runtime.admission(agent).epoch, nativeLoop: "followup/whenIdle", headers, attempts,
        downstreamAlwaysCalls: active.downstreamAlwaysCalls, toolExecutions: events.filter(({ type }) => type === "tool/call" || type === "tool/result").map(({ type, seq }) => ({ type, seq })),
        terminal: events.filter(({ type }) => type === "turn/end").at(-1).data.reason.kind });
      active = undefined;
    }
    return scenarios;
  } finally {
    active = undefined;
    for (const dispose of [disposeAlways, disposeStream]) if (typeof dispose === "function") dispose();
    for (const handle of handles.reverse()) await handle.dispose();
    await runtime.select({ id: previous.selectedId, ...(previous.selectedId === null ? {} : { expectedRevision: previous.profiles.find(({ id }) => id === previous.selectedId).revision }), expectedSelectionRevision: (await runtime.describe()).selectionRevision });
  }
}

/** Real authenticated native selection in an isolated owned Host, not editor RPC. */
export async function runNativeModelSelectionScenario(ctx, { nativeRequire, packageRoot, workspace, gateway, peer, nativeCalls }) {
  const installed = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  assert.equal(installed.name, "@dsmm/dsmm");
  const nativeOwnedRoot = requiresNativePickerProof(installed.version);
  const load = (specifier) => import(pathToFileURL(nativeRequire.resolve(specifier)).href);
  const [{ LlmAdapter, ReasoningEffortId, createUserMessage, expandAssistantStream }, { SessionId }] = await Promise.all([load("@deepseek-ai/dsh-llm"), load("@deepseek-ai/dsh-session")]);
  const runtime = ctx.get("dsmmProfileRuntime");
  const agents = ctx.get("agents");
  const descriptor = ctx.get("typert").local.get("session/selectModel");
  assert.equal(descriptor?.result.mode, "strict", "native model selection descriptor is not strict");
  assert.ok(descriptor.parameters.every(({ codec }) => codec?.mode === "strict"));
  const provider = "dsmm-selection-fixture";
  const configuredPrimary = { provider, model: "role-default", reasoningEffort: "max" };
  const manualLow = { provider, model: "native-chosen", reasoningEffort: "low" };
  const manualHigh = { ...manualLow, reasoningEffort: "high" };
  let active;
  const handles = [];
  const attempts = [];
  const headers = [];
  const choices = [];
  class SelectionAdapter extends LlmAdapter {
    async listModels(routeProvider) { return ["role-default", "native-chosen"].map((model) => ({ provider: routeProvider, id: model, name: model })); }
    async resolveModel(routeProvider, model) { return { provider: routeProvider, id: model, name: model, inputModalities: ["text"], reasoning: {
      efforts: ["low", "high", "max"].map((effort) => ({ id: ReasoningEffortId(effort), name: effort })), defaultEffort: ReasoningEffortId("high"),
    } }; }
    async *stream(options) {
      assert.ok(active?.live.at(-1)?.attemptId, "native selected provider call has no live attempt");
      active.calls.push({ attemptId: active.live.at(-1).attemptId, ...route(options) });
      yield { type: "block-start", index: 0, blockType: "text" };
      yield { type: "text-delta", index: 0, text: "native selected route complete" };
      yield { type: "block-end", index: 0, block: { type: "text", text: "native selected route complete" } };
      yield { type: "finish", reason: { kind: "stop" } };
    }
  }
  ctx.get("llm").registerAdapter([provider], new SelectionAdapter());
  const disposeStream = ctx.on("agent/assistant-stream", ({ agent, frame }) => {
    if (active?.agent !== agent) return;
    if (frame.type === "start") active.live.push({ ...frame, acceptedHeader: acceptedHeaderAtAttemptStart(agent), outputKinds: [], chunks: [] });
    else {
      const live = active.live.find(({ attemptId }) => attemptId === frame.attemptId);
      assert.ok(live, "selected native attempt frame has no start");
      if (frame.type === "chunk") { live.chunks.push({ time: frame.time, chunk: frame.chunk }); if (frame.chunk.type !== "finish") live.outputKinds.push(frame.chunk.type); else live.finish = frame.chunk; }
      if (frame.type === "end") live.end = frame;
    }
  }, { global: true });
  const previous = await runtime.describe();
  const invoke = async (namespace, method, args) => {
    const record = { endpoint: `${namespace}/${method}`, strictGateway: true, nativePeer: peer.id, result: "pending" };
    nativeCalls.push(record);
    try { const value = await gateway.invoke({ namespace, method, args, peer, signal: new AbortController().signal }); record.result = "accepted"; return value; }
    catch (error) { record.result = gateway.wireStream.failure(error).code; throw error; }
  };
  let agent;
  let initialAgent;
  const runTurn = async (phase) => {
    const firstSeq = agent.session.snapshotEvents().at(-1)?.seq ?? -1;
    active = { agent, live: [], calls: [] };
    let timedOut = false;
    const watchdog = setTimeout(() => { timedOut = true; agent.cancel({ kind: "hook", reason: "Owned native model selection exceeded its bounded request budget" }); }, 5_000);
    try {
      agent.followup(createUserMessage({ content: [{ type: "text", text: `Complete the owned ${phase} selection fixture` }], source: { kind: "user" } }));
      await agent.whenIdle();
      assert.equal(timedOut, false);
      assert.equal(active.calls.length, 1, "native user-choice fixture made an unexpected retry");
      const events = agent.session.snapshotEvents();
      const newEvents = events.filter(({ seq }) => seq > firstSeq);
      const live = active.live[0];
      headers.push(live.acceptedHeader);
      assert.equal(live.end?.outcome.kind, "committed");
      const settlement = events.find(({ seq }) => seq === live.end.outcome.seq);
      const expanded = expandAssistantStream(settlement.data.stream);
      assert.deepEqual(expanded, live.chunks);
      attempts.push({ ...active.calls[0], phase, agentLifecycle: agent === initialAgent ? "initial" : "cold-resumed", callIndex: attempts.length, sessionId: agent.id, turn: live.turn, step: live.step,
        outputKinds: live.outputKinds, settlementSeq: settlement.seq, settlementType: settlement.type, durableAttemptId: live.end.attemptId,
        liveStreamSha256: proofDigest(JSON.stringify(live.chunks)), durableStreamSha256: proofDigest(JSON.stringify(expanded)),
        result: live.finish.reason.kind === "stop" ? "completed" : live.finish.reason.kind,
        terminal: newEvents.filter(({ type }) => type === "turn/end").at(-1)?.data.reason.kind,
        toolExecutions: newEvents.filter(({ type }) => type === "tool/call" || type === "tool/result").map(({ type, seq }) => ({ type, seq })) });
    } finally { clearTimeout(watchdog); active = undefined; }
  };
  const choose = async (kind, selected) => {
    const request = { sessionId: agent.id, ...selected };
    const response = await invoke("session", "selectModel", { request });
    const event = agent.session.snapshotEvents().filter(({ type }) => type === "model/selection").at(-1);
    assert.ok(event, "native selection did not persist its typed intent");
    choices.push({ kind, request, selected: route(response.selected), eventSeq: event.seq, durableSelection: route(event.data) });
  };
  try {
    const profileId = "native-manual-selection";
    const existing = previous.profiles.find(({ id }) => id === profileId);
    const saved = await runtime.save({ id: profileId, expectedRevision: existing?.revision ?? null, content: `${JSON.stringify({ version: 1, id: profileId,
      settings: { defaultActive: true, roleRouting: { "dsmm-orchestrator": { primary: configuredPrimary, fallbackRoutes: [], strategy: "startup-lock" } } } }, null, 2)}\n` });
    await runtime.select({ id: profileId, expectedRevision: saved.revision, expectedSelectionRevision: (await runtime.describe()).selectionRevision });
    const handle = await agents.create({ sessionId: SessionId("dsmm-successor-native-selection"), meta: { cwd: workspace, agentPreset: "dsmm-orchestrator" },
      agentOptions: { provider, model: "native-inherited", reasoningEffort: ReasoningEffortId("high") } });
    handles.push(handle); agent = handle.agent; initialAgent = agent;
    const epochBefore = runtime.admission(agent).epoch;
    assert.equal(runtime.getSettings(agent).defaultActive, true);
    await runTurn(nativeOwnedRoot ? "native-default" : "profile-default");
    await choose("model-and-effort", manualLow);
    await runTurn("native-model-choice");
    await runTurn("subsequent-turn");
    await choose("effort-only", manualHigh);
    await runTurn("effort-only-choice");
    const snapshot = await invoke("dsmmProfiles", "describeSession", { sessionId: agent.id });
    const reapplied = await invoke("dsmmProfiles", "selectSession", { sessionId: agent.id, request: { sessionId: agent.id, id: saved.id,
      expectedRevision: saved.revision, expectedSelectionRevision: snapshot.selection.selectionRevision, expectedAdmissionEpoch: snapshot.admissionEpoch } });
    await runTurn("profile-reapply");
    await choose("same-value-reselection", manualHigh);
    await runTurn("same-value-reselection");
    await handle.dispose(); await ctx.get("sessionPersistence").flush();
    assert.notEqual(agents.get(agent.id), agent, "original native Agent remained registered after owned handle disposal");
    const coldSnapshot = await invoke("dsmmProfiles", "describeSession", { sessionId: agent.id });
    const resumed = agents.get(agent.id);
    assert.ok(resumed && resumed !== agent, "native user-choice fixture never cold-resumed");
    agent = resumed;
    await runTurn("cold-resume");
    return { endpoint: "session/selectModel", nativeLoop: "followup/whenIdle", sessionId: agent.id, role: "dsmm-orchestrator", enabledDeepwork: runtime.getSettings(agent).defaultActive,
      descriptor: { resultMode: descriptor.result.mode, parameters: descriptor.parameters.map(({ name, codec }) => ({ name, mode: codec.mode })) },
      profileId, profileRevision: saved.revision, configuredPrimary, choices, headers, attempts,
      epochBefore, epochAfter: reapplied.admissionEpoch, coldEpoch: coldSnapshot.admissionEpoch, coldAgentReplaced: true, oldAgentDisposedBeforeResume: true,
      pickerUi: "NOT_EXERCISED", nativeDefaultScope: "isolated-task-owned-home" };
  } finally {
    if (typeof disposeStream === "function") disposeStream();
    for (const handle of handles.reverse()) await handle.dispose();
    await runtime.select({ id: previous.selectedId, ...(previous.selectedId === null ? {} : { expectedRevision: previous.profiles.find(({ id }) => id === previous.selectedId).revision }), expectedSelectionRevision: (await runtime.describe()).selectionRevision });
  }
}
