import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { requiresNativePickerProof } from "./native-picker-proof.mjs";

/** Historical receipts deliberately keep their original fourteen-check grammar. */
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

/** Loaded independently of the blocked DSMM fiber; never supplies its service. */
export function apply(ctx, config) {
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
      await writeFile(config.receipt, `${JSON.stringify({ phase: "before-native-loader", startupOutcome: "refused", elapsedMs: Math.ceil(performance.now() - startedAt), dsmmRuntimeReady: false, rootRoster, rootRosterDisposition, nativePresetIds, loaderEntries, failedAdmission, observedOperations }, null, 2)}\n`);
    })().catch(async (error) => { await writeFile(config.receipt, `${JSON.stringify({ outcome: "FAILED", failure: error.message })}\n`); });
    return audit;
  };
  const timer = setInterval(() => { observe(); }, 25);
  // The official CLI fails loudly as soon as a plugin's startup rejects. Its
  // release awaits public fiber disposal, so drain the observer before exit.
  ctx.on("internal/status", (fiber) => { if (fiber.state === 3) observe(fiber); }, { global: true, prepend: true });
  ctx.effect(() => async () => { observe(); finished = true; clearInterval(timer); await audit; });
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

/** Check observed attempts, disk digests and native snapshots; check booleans are not proof. */
export function validateSessionProfileProof(proof, { artifactSha256, installedRoot, version }) {
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
  const contention = proof.startupLock;
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
