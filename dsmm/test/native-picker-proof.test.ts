import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Source-only release verifier is deliberately not published.
import { MENU_PHASES_017, MENU_APPEARANCES_017, requiresNativePickerProof, validateNativePickerProof } from "../scripts/native-picker-proof.mjs";

const artifactSha256 = "a".repeat(64), epoch = "b".repeat(64);
const target = { provider: "dsmm-picker-fixture", model: "target", reasoningEffort: "high" };
const profile = { ...target, model: "configured-default", reasoningEffort: "max" };
const sessionId = "session-owned-picker";
function header(value = "picker-b", disabled = false) {
  return { selects: 1, buttons: 0, value, disabled, busy: disabled ? "true" : "false", html: '<span role="alert">Synthetic validator fixture</span>' };
}
function snapshot(selected = target, value = "picker-b") {
  return { actualCurrentHeader: selected, directory: { current: selected }, modelProjection: { lastUsed: selected, pending: null },
    displayedButtons: [{ aria: `Select model, current ${selected.model === "target" ? "Target Model" : "Configured Default"}, reasoning effort ${selected.reasoningEffort}` }],
    compactHeader: [header(value)], admission: { epoch, profileId: value || null } };
}
function rpc(endpoint: string, id = sessionId, result = "accepted", model = profile) {
  return { endpoint, operation: "call", strictGateway: true, nativeInvocationStarted: true, nativePeer: "owned-peer",
    result, payload: { args: { request: { sessionId: id, ...model } } },
    accepted: { sessionId: id, selectedId: "picker-b", admissionEpoch: epoch, profileModel: profile }, ownedCarrierHold: true };
}
function actualCall(selected = target, id = sessionId) { return { sessionId: id, attemptId: `${id}:1`, ...selected, header: selected }; }
function fixture() {
  const step = (phase: string, nativeCalls: ReturnType<typeof rpc>[], selected = target) => ({
    phase, sessionId, nativeCalls, actualCalls: [actualCall(selected)], afterRequest: snapshot(selected),
  });
  const compactSteps: Record<string, unknown>[] = [
    step("keyboard-normal-profile-keeps-native-model", [rpc("dsmmProfiles/selectSession")]),
    { ...step("explicit-profile-model-native-projection", [rpc("dsmmProfiles/selectSession"), rpc("session/selectModel")], profile), afterSelection: snapshot(profile) },
    step("later-native-picker-choice-wins", [rpc("session/selectModel", sessionId, "accepted", target)]),
  ];
  const races = ["same-session-manual-choice-during-profile-cas", "same-pending-native-selection-dedup-during-profile-cas", "same-pending-native-choice-before-host-ack", "native-choice-pending-before-profile-cas"];
  for (const phase of races) compactSteps.push({ ...step(phase, [rpc("dsmmProfiles/selectSession"), rpc("session/selectModel", sessionId, "accepted", target)]),
    before: { modelProjection: { pending: target }, borrowedClientSelectionEvents: [{ seq: 1 }] },
    afterSubmission: { modelProjection: { pending: target }, borrowedClientSelectionEvents: [{ seq: 2 }] },
    borrowedWindowOnly: true, newHistoryLease: false, preAck: { directory: { status: "selecting" } }, actualNativeRpcHeldBeforeAck: true, syntheticProjection: false,
    prestart: { directory: { status: "selecting" } }, beforeCasResponse: { directory: { status: "ready" } } });
  compactSteps.push({ ...step("native-running-profile-guard", [rpc("dsmmProfiles/selectSession", sessionId, "dsmm-profiles/refused")]), before: snapshot(), after: snapshot() });
  compactSteps.push({ ...step("profile-accepted-native-model-unavailable", [rpc("dsmmProfiles/selectSession"), rpc("session/selectModel", sessionId, "session/model-unavailable")]), after: snapshot() });
  const noModel = rpc("dsmmProfiles/selectSession");
  const withoutModel = { ...noModel, accepted: { sessionId, selectedId: "picker-no-model", admissionEpoch: epoch } };
  compactSteps.push({ phase: "profile-accepted-no-main-model", sessionId, nativeCalls: [withoutModel], after: snapshot(target, "picker-no-model") });
  const blank = { ...snapshot(target, ""), compactHeader: [] };
  compactSteps.push({ phase: "native-main-view-withdrawal-during-profile-cas", oldSessionId: sessionId, currentSessionId: "session-new",
    nativeCalls: [rpc("dsmmProfiles/selectSession")], blankPublicState: { currentSessionId: "session-new" }, after: blank,
    actualCalls: [actualCall(target, "session-new")], afterRequest: snapshot(target, "") });
  for (const phase of ["responsive-hover-focus", "responsive-pending-cas", "responsive-model-partial-failure", "responsive-no-profile-model"]) {
    for (const viewport of [375, 768, 1280]) compactSteps.push({ phase, viewport, header: [header("picker-b", phase === "responsive-pending-cas")],
      geometry: { viewportWidth: viewport, focus: true, selectHeight: 32, scrollWidth: 180, clientWidth: 180, seat: { left: 0, right: viewport },
        root: { kind: "root", left: 20, right: 200, clientWidth: 180, scrollWidth: 180, focused: false, outlineExtent: 0 },
        elements: [{ kind: "select", left: 70, right: 190, clientWidth: 120, scrollWidth: 120, focused: true, outlineExtent: 4 }] } });
  }
  return { artifactKind: "ci-frozen-artifact", artifactSha256, packageVersion: "0.1.6", publicationClaimed: false,
    proofScope: "frozen-artifact-native-picker-and-compact-profile", outcome: "COMPLETED", ownedHomesRemoved: true, lanes: [{
      lane: "present", dsmm: true, artifactKind: "ci-frozen-artifact", artifactSha256, outcome: "OBSERVED", exit: { code: 0, signal: null },
      browserErrors: [], serverErrors: [], authentication: { signedIn: false, copiedBrowserState: false, productionAuthenticationModified: false },
      cleanup: { browserClosed: true, ownedContextClosed: true, hostDisposal: "appExit", serverClosed: true },
      compactShape: { nativeSelects: 1, additionalButtons: 0, nativeRootAndHeaderOwners: true },
      installedCandidate: { name: "@dsmm/dsmm", version: "0.1.6", publicationClaimed: false,
        packageRoot: "/tmp/dsmm-native-picker-owned/present/profiles/picker-present/node_modules/@dsmm/dsmm", hostSha256: artifactSha256, clientSha256: artifactSha256 },
      steps: ["direct-target-new", "direct-target-existing", "other-then-target-existing", "other-then-target-new"].map(phase => ({
        ...step(phase, []), modelRpcs: phase.startsWith("direct-target") ? [] : [rpc("session/selectModel", sessionId, "accepted", { ...target, model: "other" }), rpc("session/selectModel", sessionId, "accepted", target)],
      })), compactSteps,
    }] };
}
function replace(root: object, path: (string | number)[], value: unknown) {
  let owner: unknown = root;
  for (const key of path.slice(0, -1)) { assert.ok(owner !== null && typeof owner === "object"); owner = Reflect.get(owner, key); }
  assert.ok(owner !== null && typeof owner === "object"); Reflect.set(owner, path.at(-1)!, value);
}
function index(receipt: ReturnType<typeof fixture>, name: string) { return receipt.lanes[0].compactSteps.findIndex(step => step.phase === name); }
const validate = (receipt: ReturnType<typeof fixture>) => validateNativePickerProof(receipt, { artifactSha256, packageVersion: "0.1.6" });

test("only trusted 0.1.6 and later identities require the frozen native picker gate", () => {
  for (const version of ["0.1.1", "0.1.4", "0.1.5"]) assert.equal(requiresNativePickerProof(version), false);
  for (const version of ["0.1.6", "0.1.7", "0.2.0", "1.0.0"]) assert.equal(requiresNativePickerProof(version), true);
  for (const version of ["0.1.06", "0.1.6-beta", "0.1.6\n", "9007199254740992.0.0"]) assert.throws(() => requiresNativePickerProof(version));
});
test("the synthetic complete picker contract has native requests, profile RPCs, races and 12 true viewport checks", () => {
  assert.deepEqual(validate(fixture()), { outcome: "COMPLETED", basicScenarios: 4, compactScenarios: 11, raceScenarios: 4, responsiveStates: 12 });
});
test("completion labels cannot replace identity, installation, cleanup or scenario evidence", () => {
  for (const [path, value] of [
    [["artifactSha256"], "c".repeat(64)], [["packageVersion"], "0.1.5"], [["artifactKind"], "local-current-source"],
    [["lanes", 0, "installedCandidate", "version"], "0.1.5"], [["ownedHomesRemoved"], false],
    [["lanes", 0, "cleanup", "browserClosed"], false], [["lanes", 0, "steps"], []], [["lanes", 0, "compactSteps"], []],
  ] as [(string | number)[], unknown][]) { const receipt = fixture(); replace(receipt, path, value); assert.throws(() => validate(receipt)); }
});
test("implicit routing, stale front-end state and a missing explicit native model RPC are rejected", () => {
  for (const kind of ["actual-route", "front-end", "model-rpc", "race-dispatch", "same-item-workaround"]) {
    const receipt = fixture(), normal = index(receipt, "keyboard-normal-profile-keeps-native-model"), explicit = index(receipt, "explicit-profile-model-native-projection");
    if (kind === "actual-route") replace(receipt, ["lanes", 0, "compactSteps", normal, "actualCalls", 0, "model"], "configured-default");
    if (kind === "front-end") replace(receipt, ["lanes", 0, "compactSteps", explicit, "afterRequest", "directory", "current"], target);
    if (kind === "model-rpc") replace(receipt, ["lanes", 0, "compactSteps", explicit, "nativeCalls"], [rpc("dsmmProfiles/selectSession")]);
    if (kind === "race-dispatch") replace(receipt, ["lanes", 0, "compactSteps", index(receipt, "same-session-manual-choice-during-profile-cas"), "nativeCalls"], [rpc("dsmmProfiles/selectSession"), rpc("session/selectModel")]);
    if (kind === "same-item-workaround") replace(receipt, ["lanes", 0, "steps", 0, "modelRpcs"], [rpc("session/selectModel")]);
    assert.throws(() => validate(receipt), kind);
  }
});
test("same-value sequence and native selecting-phase race evidence cannot be replaced by ready-state flags", () => {
  for (const [name, path, value] of [
    ["same-pending-native-selection-dedup-during-profile-cas", ["afterSubmission", "borrowedClientSelectionEvents", 0, "seq"], 1],
    ["same-pending-native-choice-before-host-ack", ["preAck", "directory", "status"], "ready"],
    ["native-choice-pending-before-profile-cas", ["prestart", "directory", "status"], "ready"],
  ] as [string, (string | number)[], unknown][]) {
    const receipt = fixture(); replace(receipt, ["lanes", 0, "compactSteps", index(receipt, name), ...path], value); assert.throws(() => validate(receipt));
  }
});
test("clipped viewport geometry and late native dispatch after view withdrawal refuse publication", () => {
  const clipped = fixture(), geometry = index(clipped, "responsive-hover-focus");
  replace(clipped, ["lanes", 0, "compactSteps", geometry, "geometry", "root", "right"], 475);
  assert.throws(() => validate(clipped));
  const late = fixture(), view = index(late, "native-main-view-withdrawal-during-profile-cas");
  replace(late, ["lanes", 0, "compactSteps", view, "nativeCalls"], [rpc("dsmmProfiles/selectSession"), rpc("session/selectModel")]);
  assert.throws(() => validate(late));
});

test("numeric geometry and model-selection sequences are not accepted through JSON coercion", () => {
  const stringSequence = fixture(), dedup = index(stringSequence, "same-pending-native-selection-dedup-during-profile-cas");
  replace(stringSequence, ["lanes", 0, "compactSteps", dedup, "afterSubmission", "borrowedClientSelectionEvents", 0, "seq"], "2");
  assert.throws(() => validate(stringSequence));
  const nullGeometry = fixture(), geometry = index(nullGeometry, "responsive-hover-focus");
  replace(nullGeometry, ["lanes", 0, "compactSteps", geometry, "geometry", "root", "right"], null);
  assert.throws(() => validate(nullGeometry));
});

function iconHeader() {
  return { selects: 0, buttons: 1, visibleText: "", triggerText: "", triggerName: "Current-session profile (header)", iconCount: 1,
    triggerDisabled: false, busy: "false", expanded: "true", announcementHidden: true, announcementRole: "alert" };
}
function menuSnapshot(readonly = false, admittedId: string | null = "picker-b") {
  const savedLabel = admittedId === "picker-b" ? "Picker profile B" : admittedId === "picker-no-model" ? "Profile without main model" : null;
  const suffix = admittedId === null ? " — captured global default" : "";
  const currentName = admittedId === null ? "deployment baseline" : `${savedLabel} (${admittedId})`;
  return { compactHeader: [iconHeader()], publicNativeState: { currentSessionId: sessionId,
    profileSlot: { name: "conversation.header.leading", priority: Number.MAX_SAFE_INTEGER, rootScoped: true }, controller: { dirty: false, busy: null } },
    nativeProfileDisplay: { sessionId, admittedId, admissionEpoch: epoch, scope: admittedId === null ? "global-default" : "session-override", savedAvailable: admittedId !== null, savedLabel },
    menu: { role: "menu", portaled: true, text: "Native profile menu", labels: [`Current profile: ${currentName}${suffix}`, "Switch profile — keep current model", "Switch and use profile model"],
      items: ["deployment baseline", "Picker profile B", "Profile without main model", "deployment baseline", "Use profile model: Picker profile B", "Use profile model: Profile without main model", "Refresh profiles and current-session state"].map((text, index) => ({ text: index === 0 ? `${text}${suffix}` : text,
        checked: index === (admittedId === null ? 0 : admittedId === "picker-b" ? 1 : 2), disabled: readonly && text !== "Refresh profiles and current-session state" })) } };
}
function menuGeometry(viewportWidth = 375) {
  const shape = (kind: string, left: number, right: number, top: number, bottom: number, focused = false) => ({ kind, left, right, top, bottom,
    clientWidth: right - left, scrollWidth: right - left, focused, outlineExtent: focused ? 4 : 0, fontSize: 14, lineHeight: 22 });
  return { viewportWidth, viewportHeight: 900, triggerHeight: 28, focus: true, portaled: true, seat: { left: 0, right: viewportWidth },
    trigger: shape("icon-trigger", 30, 58, 20, 48, true), menu: shape("native-menu", 20, 350, 60, 760),
    labels: [shape("label", 30, 340, 70, 92), shape("label", 30, 340, 120, 142), shape("label", 30, 340, 220, 242)] };
}
function fixture017() {
  const receipt = fixture();
  replace(receipt, ["packageVersion"], "0.1.7"); replace(receipt, ["proofScope"], "frozen-artifact-native-picker-and-native-menu-017");
  replace(receipt, ["lanes", 0, "installedCandidate", "version"], "0.1.7");
  replace(receipt, ["lanes", 0, "compactShape"], { nativeSelects: 0, iconButtons: 1, nativeMenu: true, nativeRootLeadingOwner: true });
  const convert = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Object.hasOwn(value, "compactHeader")) {
      const admission = Reflect.get(value, "admission");
      const admittedId = admission?.profileId ?? null;
      const observed = menuSnapshot(false, admittedId);
      Object.assign(value, observed);
    }
    for (const child of Object.values(value)) convert(child);
  };
  convert(receipt);
  for (const step of receipt.lanes[0].compactSteps) {
    if (String(step.phase).startsWith("responsive-")) {
      const observed = menuSnapshot();
      if (step.phase === "responsive-pending-cas") { observed.compactHeader[0].busy = "true"; for (const item of observed.menu.items) item.disabled = true; }
      Object.assign(step, { header: observed.compactHeader, menu: observed.menu, publicNativeState: observed.publicNativeState, nativeProfileDisplay: observed.nativeProfileDisplay, geometry: menuGeometry(Number(step.viewport)) });
    }
    if (step.phase === "native-main-view-withdrawal-during-profile-cas") step.blankPublicState = { currentSessionId: "session-new", profileSlot: menuSnapshot().publicNativeState.profileSlot };
  }
  const menuSteps = MENU_PHASES_017.map((phase: string) => {
    const observed = menuSnapshot(["menu-sessionless-readonly", "menu-loading-readonly", "menu-dirty-readonly"].includes(phase));
    const nativeCalls = [];
    if (phase === "menu-sessionless-readonly") {
      Reflect.deleteProperty(observed.publicNativeState, "currentSessionId");
      Object.assign(observed.nativeProfileDisplay, { sessionId: null, admittedId: null, admissionEpoch: null, scope: null, savedAvailable: false, savedLabel: null });
      observed.menu.labels[0] = "Current profile: Profile unavailable.";
      for (const item of observed.menu.items) item.checked = false;
      nativeCalls.push(rpc("workspace/archiveSession", "owned-initial-blank"));
    }
    if (phase === "menu-loading-readonly") Reflect.set(observed.publicNativeState.controller, "busy", "refresh");
    if (phase === "menu-dirty-readonly") observed.publicNativeState.controller.dirty = true;
    if (phase.includes("refusal")) {
      const code = phase.includes("maintenance") ? "maintenance" : "activation";
      const field = code === "activation" ? "settings.roleRouting.dsmm-orchestrator.primary" : undefined;
      observed.menu.text = `Reason: ${code}. ${field ? `Configuration field: ${field}.` : ""} Refresh and retry.`;
      observed.menu.labels.push(`Reason: ${code}.${field ? ` Configuration field: ${field}.` : ""}`);
      Reflect.set(observed.publicNativeState.controller, "sessionIssue", { code, ...(field ? { field } : {}) });
      const refused = rpc("dsmmProfiles/selectSession", sessionId, "dsmm-profiles/refused");
      Reflect.set(refused, "refused", { code, ...(field ? { field } : {}) }); nativeCalls.push(refused);
      if (code === "maintenance") nativeCalls.push(rpc("dsmmProfiles/selectSession"));
    }
    return { phase, snapshot: observed, screenshot: `${phase}.png`, nativeCalls, sessionId, archivedSessionId: "owned-initial-blank", providerRequests: 0, actualReadHeld: true, draftPreserved: true,
      keyboard: { openedByEnter: true, arrowMoved: true, escapeClosed: true, escapeFocusReturned: true, outsideClosed: true, selectionFocusReturned: true },
      beforeEpoch: epoch, refusedEpoch: epoch, refusedNativeModel: "target", refreshedWithoutApply: true, explicitRetryAccepted: true };
  });
  Reflect.set(receipt.lanes[0], "menuSteps", [...menuSteps, ...[375, 768, 1280].flatMap(viewport => MENU_APPEARANCES_017.map((appearance: string) => ({ phase: "menu-appearance", viewport, appearance, appearanceObserved: appearance, geometry: menuGeometry(viewport), snapshot: menuSnapshot(), screenshot: `menu-appearance-${viewport}-${appearance}.png` })))]);
  return receipt;
}
const validate017 = (receipt: ReturnType<typeof fixture017>) => validateNativePickerProof(receipt, { artifactSha256, packageVersion: "0.1.7" });

test("trusted 017 native menu contract retains all legacy native-model safeguards and adds a closed real-menu inventory", () => {
  assert.deepEqual(validate017(fixture017()), { outcome: "COMPLETED", basicScenarios: 4, compactScenarios: 11, raceScenarios: 4, responsiveStates: 12, menuScenarios: 8, menuAppearances: 9 });
  assert.throws(() => validate017(fixture()), "016 cannot be relabelled into a menu proof");
  const relabelled = fixture(); replace(relabelled, ["packageVersion"], "0.1.7"); replace(relabelled, ["lanes", 0, "installedCandidate", "version"], "0.1.7");
  assert.throws(() => validate017(relabelled));
  assert.throws(() => validateNativePickerProof(fixture017(), { artifactSha256, packageVersion: "0.1.8" }), "future versions cannot bypass review by inheriting receipt flags");
});
test("017 rejects SELECT/header-text/old-seat/missing-menu/wrong-identity and incomplete appearance evidence", () => {
  for (const [path, value] of [
    [["artifactSha256"], "c".repeat(64)], [["packageVersion"], "0.1.6"], [["lanes", 0, "menuSteps"], []],
    [["lanes", 0, "menuSteps", 0, "snapshot", "compactHeader", 0, "selects"], 1],
    [["lanes", 0, "menuSteps", 0, "snapshot", "compactHeader", 0, "visibleText"], "Profile"],
    [["lanes", 0, "menuSteps", 0, "snapshot", "publicNativeState", "profileSlot", "name"], "conversation.session.header.utilities"],
    [["lanes", 0, "menuSteps", 0, "snapshot", "menu", "portaled"], false],
    [["lanes", 0, "menuSteps", 3, "keyboard", "escapeFocusReturned"], false],
    [["lanes", 0, "menuSteps", 8, "geometry", "menu", "right"], 475],
    [["lanes", 0, "menuSteps", 8, "appearanceObserved"], "dark"],
    [["lanes", 0, "menuSteps", 6, "snapshot", "menu", "labels", 3], "Reason: maintenance. C:/private/provider/secret"],
    [["lanes", 0, "menuSteps", 7, "snapshot", "publicNativeState", "controller", "sessionIssue", "field"], "credential.apiKey"],
    [["lanes", 0, "menuSteps", 6, "refreshedWithoutApply"], false],
    [["lanes", 0, "menuSteps", 6, "refusedEpoch"], "c".repeat(64)],
    [["lanes", 0, "menuSteps", 7, "nativeCalls", 0, "refused", "code"], "conflict"],
    [["lanes", 0, "menuSteps", 1, "snapshot", "menu", "labels", 0], "Current profile: wrong-session-profile"],
    [["lanes", 0, "menuSteps", 1, "snapshot", "menu", "items", 1, "checked"], false],
    [["lanes", 0, "menuSteps", 1, "snapshot", "nativeProfileDisplay", "admittedId"], "wrong-profile"],
  ] as [(string | number)[], unknown][]) { const receipt = fixture017(); replace(receipt, path, value); assert.throws(() => validate017(receipt)); }
});
