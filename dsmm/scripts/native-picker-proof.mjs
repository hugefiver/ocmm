import assert from "node:assert/strict";
import { nativePickerContract, validateCompactHeaderGeometry, validateNativeMenuGeometry, validateNativePickerAfterStep } from "./native-picker-harness.mjs";

const sha256 = /^[a-f0-9]{64}$/u;
const provider = "dsmm-picker-fixture";
const target = { provider, model: "target", reasoningEffort: "high" };
const profile = { provider, model: "configured-default", reasoningEffort: "max" };
const route = ({ provider, model, reasoningEffort }) => ({ provider, model, reasoningEffort });
const basicPhases = ["direct-target-new", "direct-target-existing", "other-then-target-existing", "other-then-target-new"];
const racePhases = ["same-session-manual-choice-during-profile-cas", "same-pending-native-selection-dedup-during-profile-cas", "same-pending-native-choice-before-host-ack", "native-choice-pending-before-profile-cas"];
const responsivePhases = ["responsive-hover-focus", "responsive-pending-cas", "responsive-model-partial-failure", "responsive-no-profile-model"];
const compactPhases = ["keyboard-normal-profile-keeps-native-model", "explicit-profile-model-native-projection", "later-native-picker-choice-wins", ...racePhases,
  "native-running-profile-guard", "profile-accepted-native-model-unavailable", "profile-accepted-no-main-model", "native-main-view-withdrawal-during-profile-cas"];
const widths = [375, 768, 1280];
export const MENU_PHASES_017 = Object.freeze(["menu-sessionless-readonly", "menu-retained-blank", "menu-active", "menu-keyboard-dismiss-focus", "menu-loading-readonly", "menu-dirty-readonly", "menu-maintenance-refusal-refresh-explicit-retry", "menu-activation-refusal-safe-field"]);
export const MENU_APPEARANCES_017 = Object.freeze(["light", "dark", "reduced"]);

function menuHeader(snapshot, alert = false) {
  assert.equal(snapshot.compactHeader?.length, 1);
  const header = snapshot.compactHeader[0];
  assert.equal(header.selects, 0); assert.equal(header.buttons, 1);
  assert.equal(header.visibleText, ""); assert.equal(header.triggerText, "");
  assert.equal(header.triggerName, "Current-session profile (header)");
  assert.equal(header.iconCount, 1); assert.equal(header.triggerDisabled, false);
  assert.equal(header.announcementHidden, true);
  if (alert) assert.equal(header.announcementRole, "alert");
}
function nativeOwner(state) {
  assert.deepEqual(state?.profileSlot, { name: "conversation.header.leading", priority: Number.MAX_SAFE_INTEGER, rootScoped: true });
}
function openMenu(snapshot, readonly = false) {
  menuHeader(snapshot); nativeOwner(snapshot.publicNativeState);
  const menu = snapshot.menu;
  assert.equal(menu?.role, "menu"); assert.equal(menu.portaled, true);
  assert.ok(menu.labels.includes("Switch profile — keep current model"));
  assert.ok(menu.labels.includes("Switch and use profile model"));
  assert.ok(menu.items.length >= 7);
  assert.ok(menu.items.some(item => item.text === "Refresh profiles and current-session state"));
  const display = snapshot.nativeProfileDisplay;
  assert.ok(display, "independent native admission/profile display evidence is missing");
  const selected = menu.items.filter(item => item.checked === true);
  if (display.sessionId === null) {
    assert.equal(snapshot.publicNativeState.currentSessionId, undefined);
    assert.equal(display.admittedId, null); assert.equal(display.admissionEpoch, null);
    assert.equal(menu.labels[0], "Current profile: Profile unavailable.");
    assert.deepEqual(selected, []);
  } else {
    assert.equal(display.sessionId, snapshot.publicNativeState.currentSessionId);
    assert.match(display.admissionEpoch, sha256);
    assert.ok(["global-default", "session-override", "deployment-baseline"].includes(display.scope));
    const suffix = display.scope === "global-default" ? " — captured global default" : "";
    const name = display.admittedId === null ? "deployment baseline" : display.savedLabel === null ? display.admittedId : `${display.savedLabel} (${display.admittedId})`;
    assert.equal(menu.labels[0], `Current profile: ${name}${suffix}`, "rendered current profile does not match native admitted identity");
    assert.equal(selected.length, 1, "native menu must check exactly the admitted row");
    const selectedText = display.admittedId === null ? "deployment baseline" : display.savedAvailable ? display.savedLabel ?? display.admittedId : `${display.admittedId} — saved profile unavailable`;
    assert.equal(selected[0].text, `${selectedText}${suffix}`, "native checked row does not match admitted profile");
  }
  const diagnostics = menu.labels.filter(label => label.startsWith("Reason:"));
  const issue = snapshot.publicNativeState.controller?.sessionIssue;
  if (issue) {
    const codes = ["validation", "conflict", "not-found", "lock-timeout", "unsafe-path", "io", "activation", "corrupt-selection", "limit", "busy", "maintenance", "disposed", "not-owned", "unavailable", "cancelled", "model-unconfigured", "model-choice-changed", "model-service-unavailable", "model-observation-unavailable", "model-selection-failed", "transport"];
    assert.ok(codes.includes(issue.code), "menu diagnostics have an unknown code");
    const field = issue.field;
    assert.ok(field === undefined || typeof field === "string" && field.length <= 128 && /^(?:settings\.roleRouting\.dsmm-(?:orchestrator|planner|plan-critic|builder|reviewer|oracle|oracle-2nd|creative|code-search|doc-search|clarifier|media-reader)\.(?:primary|fallbackRoutes)(?:\[[0-7]\])?(?:\.(?:provider|model|reasoningEffort))?|version|id|label|content|sessionId|expectedRevision|expectedSelectionRevision|expectedAdmissionEpoch)$/u.test(field), "menu diagnostics have an unapproved field");
    assert.deepEqual(diagnostics, [`Reason: ${issue.code}.${field === undefined ? "" : ` Configuration field: ${field}.`}`]);
  } else assert.deepEqual(diagnostics, []);
  if (readonly) assert.ok(menu.items.filter(item => item.text !== "Refresh profiles and current-session state").every(item => item.disabled));
}

export function requiresNativePickerProof(version) {
  assert.match(version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u);
  const [major, minor, patch] = version.split(".").map(Number);
  assert.ok([major, minor, patch].every(Number.isSafeInteger));
  return major > 0 || minor > 1 || minor === 1 && patch >= 6;
}

function exactInventory(actual, expected) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), "native picker scenario inventory differs");
}
function rpcCalls(step, endpoint) {
  assert.ok(Array.isArray(step.nativeCalls), "native RPC observations are missing");
  return step.nativeCalls.filter(call => call.endpoint === endpoint);
}
function request(call, sessionId, result = "accepted") {
  assert.equal(call.operation, "call");
  assert.equal(call.strictGateway, true);
  assert.equal(call.nativeInvocationStarted, true);
  assert.equal(call.result, result);
  assert.ok(typeof call.nativePeer === "string" && call.nativePeer.length > 0);
  const value = call.payload?.args?.request;
  assert.equal(value?.sessionId, sessionId);
  return value;
}
function acceptedProfile(step, sessionId = step.sessionId, selectedId = "picker-b") {
  const calls = rpcCalls(step, "dsmmProfiles/selectSession");
  assert.equal(calls.length, 1);
  request(calls[0], sessionId);
  assert.equal(calls[0].accepted?.sessionId, sessionId);
  assert.equal(calls[0].accepted.selectedId, selectedId);
  assert.match(calls[0].accepted.admissionEpoch, sha256);
  return calls[0];
}
function modelCalls(step, count, sessionId = step.sessionId) {
  const calls = rpcCalls(step, "session/selectModel");
  assert.equal(calls.length, count, `${step.phase}: unwanted or missing native model dispatch`);
  for (const call of calls) request(call, sessionId);
  return calls;
}
function compactHeader(snapshot, value, alert = false) {
  assert.equal(snapshot.compactHeader?.length, 1);
  const header = snapshot.compactHeader[0];
  assert.equal(header.selects, 1); assert.equal(header.buttons, 0);
  assert.equal(header.value, value);
  if (alert) assert.ok(header.html.includes('role="alert"'), "partial/refused operation lost its visible alert");
}
function completedRequest(step, expected, sessionId = step.sessionId) {
  assert.ok(step.actualCalls?.length > 0, "actual provider requests are missing");
  for (const call of step.actualCalls) {
    assert.equal(call.sessionId, sessionId);
    assert.ok(typeof call.attemptId === "string" && call.attemptId.length > 0);
    assert.deepEqual(route(call), expected); assert.deepEqual(call.header, expected);
  }
  const after = step.afterRequest;
  assert.deepEqual(after.actualCurrentHeader, expected);
  assert.deepEqual(after.directory.current, expected);
  assert.deepEqual(after.modelProjection.lastUsed, expected);
  if (after.modelProjection.pending !== null) assert.deepEqual(after.modelProjection.pending, expected);
  assert.equal(after.displayedButtons?.length, 1);
  assert.ok(after.displayedButtons[0].aria.includes(expected.model === "target" ? "Target Model" : "Configured Default"));
  assert.ok(after.displayedButtons[0].aria.includes(expected.reasoningEffort));
}

/** Version-selected by the trusted release identity, never by a receipt flag. */
export function validateNativePickerProof(receipt, { artifactSha256, packageVersion }) {
  assert.equal(requiresNativePickerProof(packageVersion), true);
  const menu = nativePickerContract(packageVersion) === "native-menu-017";
  const checkHeader = (snapshot, value, alert = false) => {
    if (menu) { menuHeader(snapshot, alert); openMenu(snapshot); assert.equal(snapshot.nativeProfileDisplay.admittedId, value || null); assert.equal(snapshot.nativeProfileDisplay.admissionEpoch, snapshot.admission.epoch); }
    else compactHeader(snapshot, value, alert);
  };
  assert.match(artifactSha256, sha256);
  assert.equal(receipt?.artifactKind, "ci-frozen-artifact");
  assert.equal(receipt.proofScope, menu ? "frozen-artifact-native-picker-and-native-menu-017" : "frozen-artifact-native-picker-and-compact-profile");
  assert.equal(receipt.packageVersion, packageVersion);
  assert.equal(receipt.artifactSha256, artifactSha256);
  assert.equal(receipt.publicationClaimed, false);
  assert.equal(receipt.outcome, "COMPLETED"); assert.equal(receipt.ownedHomesRemoved, true);
  assert.equal(receipt.lanes?.length, 1);
  const lane = receipt.lanes[0];
  assert.equal(lane.lane, "present"); assert.equal(lane.dsmm, true);
  assert.equal(lane.artifactKind, "ci-frozen-artifact");
  assert.equal(lane.artifactSha256, artifactSha256);
  assert.equal(lane.outcome, "OBSERVED"); assert.deepEqual(lane.exit, { code: 0, signal: null });
  assert.deepEqual(lane.browserErrors, []); assert.deepEqual(lane.serverErrors, []);
  assert.deepEqual(lane.authentication, { signedIn: false, copiedBrowserState: false, productionAuthenticationModified: false });
  assert.deepEqual(lane.cleanup, { browserClosed: true, ownedContextClosed: true, hostDisposal: "appExit", serverClosed: true });
  assert.deepEqual(lane.compactShape, menu ? { nativeSelects: 0, iconButtons: 1, nativeMenu: true, nativeRootLeadingOwner: true } : { nativeSelects: 1, additionalButtons: 0, nativeRootAndHeaderOwners: true });
  const installed = lane.installedCandidate;
  assert.equal(installed?.name, "@dsmm/dsmm"); assert.equal(installed.version, packageVersion);
  assert.equal(installed.publicationClaimed, false);
  assert.match(installed.packageRoot, /^\/tmp\/dsmm-native-picker-[A-Za-z0-9_-]+\/present\/profiles\/picker-present\/node_modules\/@dsmm\/dsmm$/u);
  assert.match(installed.hostSha256, sha256); assert.match(installed.clientSha256, sha256);
  exactInventory(lane.steps.map(step => step.phase), basicPhases);
  for (const step of lane.steps) {
    validateNativePickerAfterStep(step);
    completedRequest(step, target);
    const expectedCount = step.phase.startsWith("direct-target") ? 0 : 2;
    assert.equal(step.modelRpcs.length, expectedCount);
    step.modelRpcs.forEach(call => request(call, step.sessionId));
    if (expectedCount > 0) assert.deepEqual(step.modelRpcs.map(call => call.payload.args.request.model), ["other", "target"]);
  }
  exactInventory(lane.compactSteps.map(step => `${step.phase}:${step.viewport ?? "-"}`), [
    ...compactPhases.map(phase => `${phase}:-`), ...responsivePhases.flatMap(phase => widths.map(width => `${phase}:${width}`)),
  ]);
  const phase = name => lane.compactSteps.find(step => step.phase === name);
  const normal = phase(compactPhases[0]);
  acceptedProfile(normal); modelCalls(normal, 0); completedRequest(normal, target);
  checkHeader(normal.afterRequest, "picker-b");
  const explicit = phase(compactPhases[1]);
  const cas = acceptedProfile(explicit);
  const selection = modelCalls(explicit, 1)[0];
  assert.ok(explicit.nativeCalls.indexOf(cas) < explicit.nativeCalls.indexOf(selection), "model dispatch preceded accepted profile CAS");
  assert.deepEqual(route(cas.accepted.profileModel), profile);
  assert.deepEqual(route(selection.payload.args.request), profile);
  assert.deepEqual(explicit.afterSelection.directory.current, profile);
  assert.deepEqual(explicit.afterSelection.modelProjection.pending ?? explicit.afterSelection.modelProjection.lastUsed, profile);
  completedRequest(explicit, profile); checkHeader(explicit.afterRequest, "picker-b");
  assert.equal(explicit.afterRequest.admission.epoch, cas.accepted.admissionEpoch);
  const manual = phase(compactPhases[2]);
  assert.equal(modelCalls(manual, 1)[0].payload.args.request.model, "target"); completedRequest(manual, target);
  for (const name of racePhases) {
    const step = phase(name), accepted = acceptedProfile(step);
    assert.equal(accepted.ownedCarrierHold, true);
    assert.equal(modelCalls(step, 1)[0].payload.args.request.model, "target");
    completedRequest(step, target); checkHeader(step.afterRequest, "picker-b", true);
    assert.equal(step.afterRequest.admission.epoch, accepted.accepted.admissionEpoch);
  }
  const dedup = phase(racePhases[1]);
  assert.deepEqual(dedup.before.modelProjection, dedup.afterSubmission.modelProjection);
  for (const snapshot of [dedup.before, dedup.afterSubmission]) {
    const seq = snapshot.borrowedClientSelectionEvents.at(-1).seq;
    assert.ok(Number.isSafeInteger(seq) && seq >= 0, "native selection sequence must be an integer");
  }
  assert.ok(dedup.afterSubmission.borrowedClientSelectionEvents.at(-1).seq > dedup.before.borrowedClientSelectionEvents.at(-1).seq);
  assert.equal(dedup.borrowedWindowOnly, true); assert.equal(dedup.newHistoryLease, false);
  const preAck = phase(racePhases[2]);
  assert.equal(preAck.preAck.directory.status, "selecting"); assert.equal(preAck.actualNativeRpcHeldBeforeAck, true);
  assert.equal(preAck.syntheticProjection, false);
  const prestart = phase(racePhases[3]);
  assert.equal(prestart.prestart.directory.status, "selecting"); assert.equal(prestart.beforeCasResponse.directory.status, "ready");
  const busy = phase("native-running-profile-guard");
  modelCalls(busy, 0);
  const refusal = rpcCalls(busy, "dsmmProfiles/selectSession");
  if (menu && busy.disabledWhileRunning === true) { assert.equal(refusal.length, 0); openMenu(busy.disabledMenu, true); }
  else { assert.equal(refusal.length, 1); request(refusal[0], busy.sessionId, "dsmm-profiles/refused"); }
  assert.equal(busy.after.admission.epoch, busy.before.admission.epoch);
  const unavailable = phase("profile-accepted-native-model-unavailable");
  const committed = acceptedProfile(unavailable);
  const failed = rpcCalls(unavailable, "session/selectModel"); assert.equal(failed.length, 1);
  assert.deepEqual(route(request(failed[0], unavailable.sessionId, "session/model-unavailable")), profile);
  assert.equal(unavailable.after.admission.epoch, committed.accepted.admissionEpoch);
  assert.deepEqual(unavailable.after.directory.current, target); checkHeader(unavailable.after, "picker-b", true);
  const noModel = phase("profile-accepted-no-main-model");
  assert.equal(acceptedProfile(noModel, noModel.sessionId, "picker-no-model").accepted.profileModel, undefined);
  modelCalls(noModel, 0); assert.deepEqual(noModel.after.directory.current, target);
  checkHeader(noModel.after, "picker-no-model", true);
  const withdrawn = phase("native-main-view-withdrawal-during-profile-cas");
  assert.notEqual(withdrawn.oldSessionId, withdrawn.currentSessionId);
  acceptedProfile(withdrawn, withdrawn.oldSessionId); modelCalls(withdrawn, 0, withdrawn.oldSessionId);
  assert.equal(withdrawn.blankPublicState.currentSessionId, withdrawn.currentSessionId);
  if (menu) { menuHeader(withdrawn.after); nativeOwner(withdrawn.blankPublicState); }
  else assert.deepEqual(withdrawn.after.compactHeader, []);
  assert.equal(withdrawn.after.admission.profileId, null);
  completedRequest(withdrawn, target, withdrawn.currentSessionId); checkHeader(withdrawn.afterRequest, "");
  for (const step of lane.compactSteps.filter(step => responsivePhases.includes(step.phase))) {
    assert.equal(step.geometry.viewportWidth, step.viewport);
    if (menu) {
      validateNativeMenuGeometry(step.geometry); openMenu({ compactHeader: step.header, menu: step.menu, publicNativeState: step.publicNativeState, nativeProfileDisplay: step.nativeProfileDisplay });
      if (step.phase === "responsive-pending-cas") {
        assert.equal(step.header[0].busy, "true");
        assert.ok(step.menu.items.every(item => item.disabled));
      }
      if (["responsive-model-partial-failure", "responsive-no-profile-model"].includes(step.phase)) assert.equal(step.header[0].announcementRole, "alert");
      continue;
    }
    const geometry = step.geometry;
    assert.ok([geometry.seat.left, geometry.seat.right, geometry.scrollWidth, geometry.clientWidth].every(Number.isFinite));
    assert.ok(geometry.clientWidth > 0 && geometry.elements.some(element => element.kind === "select"));
    for (const element of [geometry.root, ...geometry.elements]) {
      assert.ok([element.left, element.right, element.scrollWidth, element.clientWidth, element.outlineExtent].every(Number.isFinite));
      assert.ok(element.clientWidth >= 0 && element.scrollWidth >= 0 && element.outlineExtent >= 0);
      assert.equal(typeof element.focused, "boolean");
    }
    validateCompactHeaderGeometry(step.geometry);
    assert.equal(step.header?.length, 1);
    assert.equal(step.header[0].selects, 1); assert.equal(step.header[0].buttons, 0);
    if (step.phase === "responsive-pending-cas") { assert.equal(step.header[0].disabled, true); assert.equal(step.header[0].busy, "true"); }
    if (["responsive-model-partial-failure", "responsive-no-profile-model"].includes(step.phase)) assert.ok(step.header[0].html.includes('role="alert"'));
  }
  if (menu) {
    exactInventory(lane.menuSteps?.map(step => `${step.phase}:${step.viewport ?? "-"}:${step.appearance ?? "-"}`) ?? [], [
      ...MENU_PHASES_017.map(phase => `${phase}:-:-`), ...widths.flatMap(width => MENU_APPEARANCES_017.map(appearance => `menu-appearance:${width}:${appearance}`)),
    ]);
    for (const step of lane.menuSteps) {
      openMenu(step.snapshot, ["menu-sessionless-readonly", "menu-loading-readonly", "menu-dirty-readonly"].includes(step.phase));
      assert.match(step.screenshot, /^[a-z0-9-]+\.png$/u);
      if (step.phase === "menu-sessionless-readonly") {
        assert.equal(step.snapshot.publicNativeState.currentSessionId, undefined); modelCalls(step, 0); assert.equal(rpcCalls(step, "dsmmProfiles/selectSession").length, 0);
        assert.equal(step.providerRequests, 0); assert.ok(typeof step.archivedSessionId === "string" && step.archivedSessionId.length > 0);
        const archived = rpcCalls(step, "workspace/archiveSession"); assert.equal(archived.length, 1); request(archived[0], step.archivedSessionId);
      }
      if (step.phase === "menu-retained-blank") { assert.equal(step.providerRequests, 0); assert.ok(step.snapshot.publicNativeState.currentSessionId); }
      if (step.phase === "menu-keyboard-dismiss-focus") {
        assert.deepEqual(step.keyboard, { openedByEnter: true, arrowMoved: true, escapeClosed: true, escapeFocusReturned: true, outsideClosed: true, selectionFocusReturned: true });
      }
      if (step.phase === "menu-dirty-readonly") { assert.equal(step.snapshot.publicNativeState.controller.dirty, true); assert.equal(step.draftPreserved, true); modelCalls(step, 0); assert.equal(rpcCalls(step, "dsmmProfiles/selectSession").length, 0); }
      if (step.phase === "menu-loading-readonly") { assert.equal(step.snapshot.publicNativeState.controller.busy, "refresh"); assert.equal(step.actualReadHeld, true); modelCalls(step, 0); }
      if (step.phase === "menu-appearance") { assert.equal(step.geometry.viewportWidth, step.viewport); validateNativeMenuGeometry(step.geometry); assert.equal(step.appearanceObserved, step.appearance); }
      if (["menu-maintenance-refusal-refresh-explicit-retry", "menu-activation-refusal-safe-field"].includes(step.phase)) {
        const calls = rpcCalls(step, "dsmmProfiles/selectSession"); assert.ok(calls.length >= 1);
        request(calls[0], step.sessionId, "dsmm-profiles/refused");
        const code = step.phase.includes("maintenance") ? "maintenance" : "activation";
        assert.equal(calls[0].refused?.code, code);
        assert.equal(step.snapshot.publicNativeState.controller.sessionIssue?.code, code);
        assert.ok(step.snapshot.menu.text.includes(`Reason: ${code}.`));
        assert.ok(step.snapshot.menu.text.includes("Refresh"));
        assert.equal(step.refusedEpoch, step.beforeEpoch); assert.equal(step.refusedNativeModel, "target"); modelCalls(step, 0);
        assert.equal(step.refreshedWithoutApply, true);
        if (code === "maintenance") {
          assert.equal(calls.length, 2); request(calls[1], step.sessionId); assert.equal(step.explicitRetryAccepted, true);
        } else {
          assert.equal(calls.length, 1); assert.equal(calls[0].refused.field, "settings.roleRouting.dsmm-orchestrator.primary");
          assert.ok(step.snapshot.menu.text.includes(`Configuration field: ${calls[0].refused.field}.`));
        }
      }
    }
    return { outcome: "COMPLETED", basicScenarios: 4, compactScenarios: compactPhases.length, raceScenarios: 4, responsiveStates: 12, menuScenarios: MENU_PHASES_017.length, menuAppearances: 9 };
  }
  return { outcome: "COMPLETED", basicScenarios: 4, compactScenarios: compactPhases.length, raceScenarios: 4, responsiveStates: 12 };
}
