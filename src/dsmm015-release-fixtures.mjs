import { UI_CHECKS_015, NATIVE_SCENARIOS_015, proofDigest } from "../dsmm/scripts/profile-ui-harness-native.mjs";
import { receiptFixture } from "./dsmm-trusted-release-fixtures.mjs";

/** Synthetic receipt solely for checker mutation tests, never native acceptance. */
export function successorReceiptFixture(digest = "a".repeat(64)) {
  const receipt = receiptFixture("0.1.5", digest);
  const ui = receipt.uiProfiles;
  Object.assign(ui.checks, Object.fromEntries(UI_CHECKS_015.map((key) => [key, true])));
  ui.nativeCalls.push(...["describeSession", "selectSession"].map((method) => ({ endpoint: `dsmmProfiles/${method}`, strictGateway: true, result: "accepted" })), ...["modelCatalog", "selectModel"].map((method) => ({ endpoint: `session/${method}`, strictGateway: true, result: "accepted" })));
  const rawBefore = '{\n// preserved acceptance comment\n"settings":{"workflow":{"reviewCap":6}}\n}\n';
  const savedPolicy = { primary: { provider: "dsmm-ui-fixture", model: "local-catalog", reasoningEffort: "max" },
    fallbackRoutes: ["fallback-second", "fallback-first"].map((model) => ({ provider: "dsmm-ui-fixture", model })), strategy: "rate-limit-fallback", rateLimit: { maxRetries: 2, switchAfterRateLimits: 2 } };
  const rawAfter = rawBefore.replace('"settings":{', `"settings":{"roleRouting":{"dsmm-reviewer":${JSON.stringify(savedPolicy)}},`);
  const roots = ["structured-native", "session-independent"].map((selectedId, index) => ({ sessionId: `native-fixture-root-${index}`, selectedId,
    appliedRevision: String(index + 1).repeat(64), epochBefore: `native-old-epoch-${index}`, epochAfter: `native-new-epoch-${index}`, sidecarSha256: String(index + 3).repeat(64),
    snapshot: { sessionId: `native-fixture-root-${index}`, admissionEpoch: `native-new-epoch-${index}`, scope: "session-override", selection: { selectedId, appliedRevision: String(index + 1).repeat(64) } } }));
  const routeScenarios = NATIVE_SCENARIOS_015.map((name) => {
    const strategy = name.startsWith("rate-limit") || name.startsWith("profile-") ? "rate-limit-fallback" : "startup-lock";
    const modelList = ({ "startup-primary-lock": ["primary-lock", "primary-lock"], "startup-first-available": ["available-fallback", "available-fallback"],
      "startup-rate-limit": ["same-rate", "same-rate", "same-rate"], "rate-limit-rollover": ["threshold-primary", "threshold-primary", "threshold-first", "threshold-first", "threshold-second"],
      "unavailable-first": ["unavailable-primary", "unavailable-fallback"], "unavailable-partial": ["unavailable-partial"], "unavailable-later": ["unavailable-later", "unavailable-later"],
      "profile-beta-reviewer": ["profile-beta-reviewer", "profile-beta-reviewer", "beta-reviewer-fallback"], "profile-alpha-planner": ["profile-alpha-planner", "profile-alpha-planner", "alpha-planner-fallback"] })[name] ?? [name];
    const headers = modelList.map((model, index) => {
      const header = { provider: "dsmm-strategy-fixture", model, reasoningEffort: "max" };
      return { ...header, seq: 10 + index * 5, observedThroughSeq: 11 + index * 5, durableHeader: header };
    });
    const attempts = headers.map((header, index) => {
      const failed = name.includes("partial") || name === "startup-rate-limit" || (name === "rate-limit-rollover" && index < 4) || (name === "unavailable-first" && index === 0) || (name === "unavailable-later" && index === 1) || (name.startsWith("profile-") && index < 2);
      const result = failed ? name.startsWith("unavailable") ? "NO_ADAPTER" : "RATE_LIMIT" : "completed";
      const outputKinds = name.includes("partial") ? [name.endsWith("tool") ? "tool-call-delta" : "text-delta"] : failed ? [] : ["block-start", "text-delta", "block-end"];
      return { provider: header.provider, model: header.model, reasoningEffort: header.reasoningEffort, attemptId: `native-${name}:${index}`, durableAttemptId: `native-${name}:${index}`, sessionId: `native-${name}`, callIndex: index, turn: 0, step: 0,
        settlementSeq: 13 + index * 5, settlementType: failed ? "assistant/attempt" : "assistant/message", outputKinds, result,
        liveStreamSha256: "b".repeat(64), durableStreamSha256: "b".repeat(64) };
    });
    return { name, sessionId: `native-${name}`, admissionEpoch: `epoch-${name}`, profileRevision: (name === "profile-beta-reviewer" ? "e" : "c").repeat(64), profileId: name === "profile-beta-reviewer" ? "native-policy-beta" : "native-policy-alpha",
      role: name === "profile-alpha-planner" ? "dsmm-planner" : "dsmm-reviewer", strategy,
      policy: { maxRetries: 2, initialDelayMs: 0, maxDelayMs: 0, maxTotalDelayMs: 0, switchAfterRateLimits: 2, maxSwitches: 2 }, recoveryEnabled: true, nativeLoop: "followup/whenIdle", downstreamAlwaysCalls: 0, toolExecutions: [], headers, attempts,
      terminal: attempts.at(-1).result === "completed" ? "completed" : "error" };
  });
  const configuredPrimary = { provider: "dsmm-selection-fixture", model: "role-default", reasoningEffort: "max" };
  const selectedLow = { provider: "dsmm-selection-fixture", model: "native-chosen", reasoningEffort: "low" };
  const selectedHigh = { ...selectedLow, reasoningEffort: "high" };
  const selectionPhases = ["profile-default", "native-model-choice", "subsequent-turn", "effort-only-choice", "profile-reapply", "same-value-reselection", "cold-resume"];
  const selectionHeaders = selectionPhases.map((_, index) => {
    const header = index === 0 ? configuredPrimary : index < 3 ? selectedLow : selectedHigh;
    return { ...header, seq: (index + 1) * 10, observedThroughSeq: (index + 1) * 10 + 1, durableHeader: header };
  });
  const nativeSelection = { endpoint: "session/selectModel", nativeLoop: "followup/whenIdle", sessionId: "native-user-choice", role: "dsmm-orchestrator", enabledDeepwork: true,
    descriptor: { resultMode: "strict", parameters: [{ name: "request", mode: "strict" }] }, profileId: "native-manual-selection", profileRevision: "a".repeat(64), configuredPrimary,
    choices: ["model-and-effort", "effort-only", "same-value-reselection"].map((kind, index) => ({ kind, request: { sessionId: "native-user-choice", ...(index === 0 ? selectedLow : selectedHigh) }, selected: index === 0 ? selectedLow : selectedHigh,
      durableSelection: index === 0 ? selectedLow : selectedHigh, eventSeq: [15, 35, 55][index] })), headers: selectionHeaders,
    attempts: selectionHeaders.map(({ seq, observedThroughSeq, durableHeader, ...header }, index) => ({ ...header, phase: selectionPhases[index], agentLifecycle: index < 6 ? "initial" : "cold-resumed", attemptId: `native-user-choice:${index < 6 ? index + 1 : 1}`, durableAttemptId: `native-user-choice:${index < 6 ? index + 1 : 1}`, sessionId: "native-user-choice", callIndex: index, turn: index + 1, step: 1,
      settlementSeq: seq + 3, settlementType: "assistant/message", outputKinds: ["block-start", "text-delta", "block-end"], result: "completed", terminal: "completed", toolExecutions: [], liveStreamSha256: "b".repeat(64), durableStreamSha256: "b".repeat(64) })),
    epochBefore: "manual-before", epochAfter: "manual-after", coldEpoch: "manual-after", coldAgentReplaced: true, oldAgentDisposedBeforeResume: true, pickerUi: "NOT_EXERCISED", nativeDefaultScope: "isolated-task-owned-home" };
  ui.successorProof = { schemaVersion: 1, artifactSha256: digest, installedRoot: ui.installedRoot, nativeSelection,
    editor: { catalogEndpoint: "session/modelCatalog", catalogCalls: 2, models: [{ provider: "dsmm-ui-fixture", id: "local-catalog" }],
      rawBefore, rawAfter, beforeSha256: proofDigest(rawBefore), afterSha256: proofDigest(rawAfter), savedPolicy,
      untouchedBefore: { workflow: { reviewCap: 6 } }, untouchedAfter: { workflow: { reviewCap: 6 } }, invalidRaw: "{ broken successor JSONC", invalidRawAfterStructuredRefusal: "{ broken successor JSONC", globalSelectionBefore: "absent", globalSelectionAfter: "absent",
      manualRoute: { provider: "dsmm-ui-fixture", model: "custom-manual-unlisted", reasoningEffort: "low" }, nativeResolvedManualRoute: { provider: "dsmm-ui-fixture", model: "custom-manual-unlisted", reasoningEffort: "low" }, manualBeforeRefresh: "manual-draft", manualAfterRefresh: "manual-draft" },
    sessions: { globalPointerBefore: "c".repeat(64), globalPointerAfter: "c".repeat(64), roots, uiSelectedSessionId: roots[0].sessionId, uiAppliedEpoch: roots[0].epochAfter,
      reappliedEpoch: "native-reapplied-epoch", reappliedSidecarSha256: "d".repeat(64), refusals: ["conflict", "busy", "maintenance", "not-owned"].map((code) => ({ code, beforeSha256: "e".repeat(64), afterSha256: "e".repeat(64) })),
      children: [{ sessionId: "native-old-child", epoch: roots[0].epochBefore, nativeOwnedBy: roots[0].sessionId }, { sessionId: "native-new-child", epoch: roots[0].epochAfter, nativeOwnedBy: roots[0].sessionId }] },
    cold: { sessionId: roots[0].sessionId, selectedId: roots[0].selectedId, appliedRevision: roots[0].appliedRevision, admissionEpoch: "native-reapplied-epoch", sidecarSha256: "d".repeat(64), changedGlobalRevision: "f".repeat(64), stockEvents: 20, coreEvents: 16,
      visibleBeforeSha256: "f".repeat(64), visibleAfterSha256: "f".repeat(64), headersBeforeSha256: "e".repeat(64), headersAfterSha256: "e".repeat(64) },
    startupLock: { phase: "before-native-loader", pathBasename: ".lock", startupOutcome: "refused", nativeExit: { code: 1, signal: null }, elapsedMs: 2050, pointerBeforeSha256: "c".repeat(64), pointerAfterSha256: "c".repeat(64), ownerBeforeSha256: "d".repeat(64), ownerAfterSha256: "d".repeat(64), dsmmRuntimeReady: false, observedOperations: { nativeRequestPreparations: 0, nativeToolDispatches: 0 },
      loaderEntries: [{ id: "dsmm", uid: 188, state: 2 }], failedAdmission: { nativeOwnership: "public-parent-fiber-identity", loaderEntryId: "dsmm", loaderFiberUid: 188, failedFiber: { uid: 208, name: "installProfiles", state: 3 }, ancestry: [{ uid: 208, name: "installProfiles", state: 3 }, { uid: 188, name: "dsmm", state: 2 }] }, rootRosterDisposition: "blocked-compositions", nativePresetIds: ["standard", "minimal", "dsmm-orchestrator", "dsmm-planner"],
      rootRoster: [{ id: "dsmm-orchestrator", broken: "startup lock refusal" }, { id: "dsmm-planner", broken: "startup lock refusal" }] }, routeScenarios };
  return receipt;
}
