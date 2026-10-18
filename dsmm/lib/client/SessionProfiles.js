import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useState } from "react";
import { Button, IconBranchOutlineRegular, Menu } from "@deepseek-ai/dsh-client-ui-primitives";
import { sessionProfileLabels } from "./session-labels.js";
import { IssueDetails, ProfileWarnings, profileWarnings } from "./diagnostics.js";
import { RoleAvailability } from "./RoleAvailability.js";
import { parseSubagentRuntimeAdmissionView } from "../profile-remote.js";
import { isSafeDiagnosticField } from "../profile-diagnostics.js";
import { isConfigRevision } from "../config-revision.js";
import { sourceRelationship, writableSelectionVersion } from "./configuration-display.js";
const MENU_ISSUE_CODES = new Set(["validation", "conflict", "not-found", "lock-timeout", "unsafe-path", "io", "activation", "corrupt-selection", "limit", "busy", "maintenance", "disposed", "not-owned", "unavailable", "cancelled", "module-off", "runtime-unavailable", "new-session-required", "model-unconfigured", "model-choice-changed", "model-service-unavailable", "model-observation-unavailable", "model-selection-failed"]);
function capabilityReason(reason, t) {
    switch (reason) {
        case "busy": return t("headerBusy");
        case "maintenance": return t("headerMaintenanceRefused");
        case "module-off": return t("sessionModuleOff");
        case "runtime-unavailable": return t("headerUnavailableRefused");
        case "model-unconfigured": return t("headerNoProfileModel");
        case "model-service-unavailable": return t("headerModelUnconfirmed");
        case "new-session-required": return t("sessionNewRequired");
        default: return t("headerActionUnavailable");
    }
}
function menuIssue(issue) {
    const code = MENU_ISSUE_CODES.has(issue.code) ? issue.code : issue.kind === "transport" ? "transport" : "unavailable";
    const field = issue.field;
    // Only closed configuration grammar is displayable; never echo messages,
    // arbitrary wire fields, provider identifiers, credentials or file paths.
    return { code, ...(isSafeDiagnosticField(field) ? { field } : {}) };
}
export function SessionScope({ state, actions, t, compact = false }) {
    const prefix = useId();
    const session = state.session;
    const labels = session === null ? null : sessionProfileLabels(session, t);
    const selected = state.snapshot?.profiles.find((profile) => profile.id === state.sessionChoice);
    const disabled = state.busy !== null || state.pendingEditor !== null || state.sessionBusy !== null || state.dirty || state.invalidFields.length > 0;
    const current = () => { const live = actions.readProfileView(); return live.currentSessionId === state.currentSessionId && live.sessionViewEpoch === state.sessionViewEpoch && live.session === session; };
    const ready = session !== null && !state.sessionUnconfirmed && !session.refreshRequired && !session.selection.refreshRequired && writableSelectionVersion(session.selection.selectionRevision);
    const allowed = ready && session.canApplyOverlay === true && session.applyOverlayUnavailableReason !== "new-session-required";
    const modelAllowed = ready && session.canSelectModel === true && session.profileModel !== undefined;
    const status = state.sessionNotice === null ? "" : t(state.sessionNotice === "mode-on" ? "headerModeOn" : state.sessionNotice === "mode-off" ? "headerModeOff" : state.sessionNotice === "applied-with-model" ? "sessionAppliedWithModel" : state.sessionNotice === "applied" ? "sessionApplied" : "sessionResetDone");
    let binding = session?.subagentRuntime;
    try {
        if (binding !== undefined)
            binding = parseSubagentRuntimeAdmissionView(binding);
    }
    catch {
        binding = undefined;
    }
    return _jsxs("div", { className: "dsmm-session-scope", "aria-busy": state.sessionBusy !== null, "data-dsmm-session-scope": true, children: [!compact && _jsx("h3", { children: t("sessionScope") }), state.currentSessionId === null ? _jsx("p", { className: "dsmm-hint", children: t("sessionChooseWorkspace") }) : _jsxs(_Fragment, { children: [labels !== null && _jsx("p", { "data-dsmm-session-state": true, children: labels.admitted }), labels !== null && !compact && _jsx("p", { className: "dsmm-hint", "data-dsmm-session-future-default": true, children: labels.futureDefault }), session === null && _jsx("p", { className: "dsmm-hint", id: `${prefix}-overlay-reason`, children: t("sessionUnavailable") }), session?.warnings?.length ? _jsxs("div", { children: [_jsx("p", { children: t("admissionWarnings") }), _jsx(ProfileWarnings, { warnings: session.warnings, t: t })] }) : null, session !== null && !allowed && _jsx("p", { className: "dsmm-hint", id: `${prefix}-overlay-reason`, children: capabilityReason(session.applyOverlayUnavailableReason, t) }), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-choice`, children: t("sessionSelect") }), _jsxs("select", { id: `${prefix}-choice`, value: state.sessionChoice ?? "", disabled: disabled || !allowed, "aria-describedby": !allowed ? `${prefix}-overlay-reason` : undefined, onChange: (event) => { if (current())
                                    actions.chooseSessionProfile(event.currentTarget.value || null); }, children: [_jsx("option", { value: "", children: t("sessionBaseline") }), state.sessionChoice !== null && selected === undefined && _jsx("option", { value: state.sessionChoice, children: state.sessionChoice }), state.snapshot?.profiles.map((profile) => _jsxs("option", { value: profile.id, disabled: !isConfigRevision(profile.revision) || profile.error !== undefined, children: [profile.label?.trim() || profile.id, profileWarnings(profile.warnings).length ? ` — ${t("warningProfile")}` : ""] }, profile.id))] })] }), !compact && _jsxs(_Fragment, { children: [_jsx("p", { className: "dsmm-hint", children: t("sessionModelHint") }), _jsx(Button, { type: "button", variant: "outline", disabled: disabled || !modelAllowed, "aria-describedby": !modelAllowed ? `${prefix}-model-reason` : undefined, onClick: () => { if (current())
                                    void actions.useSessionProfileModel(); }, children: t("headerUseCurrentModel") }), !modelAllowed && _jsx("p", { className: "dsmm-hint", id: `${prefix}-model-reason`, children: capabilityReason(session?.selectModelUnavailableReason, t) }), session !== null && _jsxs("details", { children: [_jsx("summary", { children: t("technicalDetails") }), _jsxs("div", { className: "dsmm-availability", children: [_jsx("p", { children: binding === undefined ? t("bindingUnknown") : t("bindingState", { binding: binding.binding, ready: t(binding.deliveryFenceReady ? "enabled" : "disabled"), restart: t(binding.restartRequired ? "enabled" : "disabled") }) }), binding?.reason !== undefined && _jsx("p", { children: t("bindingReason", { reason: binding.reason }) })] }), session.roles !== undefined && _jsxs("details", { children: [_jsx("summary", { children: t("admittedRoles") }), session.roles.map(role => _jsxs("div", { className: "dsmm-availability", children: [_jsx("p", { children: role.id }), _jsx(RoleAvailability, { value: role, t: t })] }, role.id))] }), session.rolePolicy !== undefined && _jsx("p", { "data-dsmm-session-policy": true, children: t("roleState", { route: session.rolePolicy.route === undefined ? t("inheritRoute") : `${session.rolePolicy.route.provider}/${session.rolePolicy.route.model}${session.rolePolicy.route.reasoningEffort === undefined ? "" : ` (${session.rolePolicy.route.reasoningEffort})`}`, strategy: session.rolePolicy.strategy, retries: session.rolePolicy.retries, failures: session.rolePolicy.rateLimitFailures, switches: session.rolePolicy.switches, delay: session.rolePolicy.totalDelayMs }) })] })] }), state.dirty && _jsx("p", { className: "dsmm-hint", children: t("sessionDirty") }), (session?.refreshRequired || session?.selection.refreshRequired) && _jsx("p", { role: "status", children: t("sessionCommittedRefresh") }), state.sessionUnconfirmed && _jsx("p", { role: "status", children: t("sessionUnconfirmedRefresh") }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { type: "button", variant: "outline", disabled: disabled || !allowed || (state.sessionChoice !== null && !isConfigRevision(selected?.revision)), "aria-describedby": !allowed ? `${prefix}-overlay-reason` : undefined, onClick: () => { if (current())
                                    void actions.applySession(); }, children: t(state.sessionBusy === "apply" ? "sessionApplying" : "sessionApply") }), !compact && _jsx(Button, { type: "button", variant: "outline", disabled: disabled || !allowed, "aria-describedby": !allowed ? `${prefix}-overlay-reason` : undefined, onClick: () => { if (current())
                                    void actions.resetSession(); }, children: t(state.sessionBusy === "reset" ? "sessionResetting" : "sessionReset") }), _jsx(Button, { type: "button", variant: "outline", disabled: state.sessionBusy !== null || state.busy !== null || state.pendingEditor !== null, onClick: () => { if (current())
                                    void actions.refreshSession(); }, children: t("sessionRefresh") })] })] }), state.sessionIssue !== null && _jsx("p", { role: "alert", children: state.sessionIssue.source === "profile-model" ? t(state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed")
                    : state.sessionIssue.code === "conflict" ? t("sessionConflict")
                        : ["busy", "maintenance", "disposed", "not-owned"].includes(state.sessionIssue.code) ? t("sessionBusy", { reason: state.sessionIssue.code })
                            : t(state.sessionIssue.code === "validation" ? "validation" : "sessionUnavailable") }), state.sessionIssue !== null && _jsx(IssueDetails, { issue: state.sessionIssue, t: t }), _jsx("p", { className: "dsmm-status", role: "status", "aria-live": "polite", "aria-atomic": "true", children: state.sessionBusy === "read" ? t("reading") : status })] });
}
/** Root-scoped native menu; an explicitly scoped foreign occurrence still refuses. */
export function SessionProfiles(props) {
    const prefix = useId();
    const state = props.useProfiles((snapshot) => snapshot);
    const id = state.currentSessionId;
    const [openFor, setOpenFor] = useState(undefined);
    useEffect(() => { setOpenFor(undefined); }, [id]);
    if (props.sessionId !== undefined && props.sessionId !== id)
        return null;
    const { t } = props;
    const session = state.session;
    const admission = session?.admittedSelection;
    const unknownCaptured = session !== null && admission === undefined;
    const current = session === null ? "__dsmm_session_unavailable__" : unknownCaptured ? "__dsmm_captured_default__" : admission?.selectedId ?? "";
    const profiles = state.snapshot?.profiles ?? [];
    const currentSaved = profiles.find((profile) => profile.id === current);
    const committing = state.sessionBusy !== null;
    const unavailable = id === null || committing || state.busy !== null || state.sessionUnconfirmed || session === null || session.refreshRequired === true || session.selection.refreshRequired === true;
    const profileDisabled = unavailable || state.pendingEditor !== null || state.dirty || state.invalidFields.length > 0
        || session === null || !writableSelectionVersion(session.selection.selectionRevision);
    const disabled = profileDisabled || session?.canApplyOverlay !== true || session?.applyOverlayUnavailableReason === "new-session-required" || state.snapshot === null;
    let feedback = "";
    if (state.sessionUnconfirmed)
        feedback = t("sessionUnconfirmedRefresh");
    else if (session?.refreshRequired || session?.selection.refreshRequired)
        feedback = t("sessionCommittedRefresh");
    else if (state.sessionIssue !== null)
        feedback = t(state.sessionIssue.source === "profile-model" ? state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed"
            : state.sessionIssue.code === "conflict" ? "headerConflict" : state.sessionIssue.code === "activation" ? "headerActivationRefused"
                : state.sessionIssue.code === "maintenance" ? "headerMaintenanceRefused" : state.sessionIssue.code === "busy" ? "headerBusyRefused"
                    : state.sessionIssue.code === "cancelled" ? "headerCancelledRefused" : state.sessionIssue.code === "unavailable" || state.sessionIssue.kind === "assembly" ? "headerUnavailableRefused" : "headerSelectionRefused");
    else if (committing || state.busy !== null)
        feedback = t(state.sessionBusy === "apply" || state.sessionBusy === "reset" ? "headerApplying" : "headerLoading");
    else if (state.dirty || state.invalidFields.length > 0 || state.pendingEditor !== null)
        feedback = t("headerDraft");
    else if (id === null)
        feedback = t("sessionChooseWorkspace");
    else if (session === null || state.snapshot === null)
        feedback = t("headerUnavailable");
    else if (state.sessionNotice !== null)
        feedback = t(state.sessionNotice === "mode-on" ? "headerModeOn" : state.sessionNotice === "mode-off" ? "headerModeOff" : state.sessionNotice === "applied-with-model" ? "headerAppliedWithModel" : "headerApplied");
    const profileName = unknownCaptured ? t("headerCaptured") : admission !== undefined && sourceRelationship(admission, currentSaved?.revision) === "current" && currentSaved?.label?.trim() ? currentSaved.label : admission?.selectedId ?? t("sessionBaseline");
    const currentLabel = t("headerCurrentProfile", { profile: session === null ? t("headerUnavailable") : profileName });
    const entries = [{ type: "label", id: "@current", text: currentLabel }];
    for (const warning of profileWarnings(session?.warnings))
        entries.push({ type: "label", id: `@warning:${warning.code}`, text: t("warningMarker", { code: warning.code, field: warning.field }) });
    if ((id === null || session?.canApplyOverlay === true) && state.snapshot !== null)
        entries.push({ type: "label", id: "@future", text: t("sessionFutureDefault", { profile: state.snapshot.profiles.find((profile) => profile.id === state.snapshot.selectedId)?.label?.trim() || state.snapshot.selectedId || t("sessionBaseline") }) });
    if (feedback !== "" && (state.sessionNotice === null || state.sessionIssue !== null || state.sessionUnconfirmed || session?.refreshRequired || session?.selection.refreshRequired))
        entries.push({ type: "label", id: "@status", text: feedback });
    const mode = session?.deepwork;
    entries.push({ id: "@mode", label: t(mode === undefined ? "headerModeUnavailable" : mode.locked ? "headerModePreset" : mode.active ? "headerModeDisable" : "headerModeEnable"),
        disabled: unavailable || session?.canToggleMode !== true || mode === undefined || mode.locked });
    if (session !== null && session.canToggleMode !== true)
        entries.push({ type: "label", id: "@mode-reason", text: capabilityReason(session.toggleModeUnavailableReason, t) });
    const diagnostic = state.sessionIssue === null ? null : menuIssue(state.sessionIssue);
    const diagnosticText = diagnostic === null ? "" : t("headerIssueCode", { code: diagnostic.code }) + (diagnostic.field === undefined ? "" : ` ${t("headerIssueField", { field: diagnostic.field })}`);
    const retryHint = t(state.sessionUnconfirmed ? "sessionUnconfirmedRefresh" : diagnostic?.code === "maintenance" || diagnostic?.code === "busy" ? "headerWaitRetryHint" : "headerRetryHint");
    if (diagnostic !== null)
        entries.push({ type: "label", id: "@diagnostic", text: diagnosticText }, { type: "label", id: "@retry", text: retryHint });
    if (admission?.selectedId != null && currentSaved === undefined)
        entries.push({ id: admission.selectedId, label: `${admission.selectedId} — ${t("headerSavedUnavailable")}`, disabled: true });
    if (unknownCaptured)
        entries.push({ id: "__dsmm_captured_default__", label: t("headerCaptured"), disabled: true });
    entries.push({ type: "separator", id: "@keep-separator" }, { type: "label", id: "@keep-heading", text: t("headerCompactProfiles") }, { id: "", label: t("sessionBaseline"), disabled });
    if (session !== null && (session.canApplyOverlay !== true || session.applyOverlayUnavailableReason === "new-session-required"))
        entries.push({ type: "label", id: "@overlay-reason", text: capabilityReason(session.applyOverlayUnavailableReason, t) });
    for (const profile of profiles)
        entries.push({ id: profile.id, label: (profile.label?.trim() ? profile.label : profile.id) + (profile.error === undefined && isConfigRevision(profile.revision) ? "" : ` — ${t("headerSavedUnavailable")}`) + (profileWarnings(profile.warnings).length ? ` — ${t("warningProfile")}` : ""), disabled: disabled || !isConfigRevision(profile.revision) || profile.error !== undefined });
    entries.push({ type: "separator", id: "@model-separator" }, { id: "@use-model", label: t("headerUseCurrentModel"), disabled: profileDisabled || session?.canSelectModel !== true || session?.profileModel === undefined });
    if (session !== null && session.canSelectModel !== true)
        entries.push({ type: "label", id: "@model-reason", text: capabilityReason(session.selectModelUnavailableReason, t) });
    const open = openFor === id;
    return _jsxs("div", { className: "dsmm-header-profiles", "data-dsmm-header-profile": true, "aria-busy": committing, children: [_jsx(Menu, { open: open, autoFocus: true, portal: true, align: "start", className: "dsmm-profile-anchor", listClassName: "dsmm-profile-menu", items: entries, selectedId: current, footer: [{ id: "@refresh", label: t("headerCompactRefresh"), disabled: committing || state.busy !== null }], anchor: _jsx(Button, { type: "button", size: "sm", variant: "toolbar", className: "dsmm-profile-trigger", icon: _jsx(IconBranchOutlineRegular, {}), "aria-label": t("headerProfileLabel"), "aria-haspopup": "menu", "aria-expanded": open, "aria-describedby": `${prefix}-feedback`, onClick: () => setOpenFor(open ? undefined : id) }), onClose: () => setOpenFor(undefined), onSelect: (value) => {
                    const live = props.readProfileView();
                    if (live.currentSessionId !== id || live.sessionViewEpoch !== state.sessionViewEpoch || live.session !== session)
                        return;
                    if (value === "@refresh") {
                        if (committing || state.busy !== null)
                            return;
                        void (async () => { await props.refresh(); if (id !== null && props.readProfileView().currentSessionId === id && props.readProfileView().sessionViewEpoch === state.sessionViewEpoch)
                            await props.refreshSession(); })();
                    }
                    else {
                        const row = entries.find((entry) => entry.id === value && !("type" in entry));
                        if (row === undefined || !("disabled" in row) || row.disabled)
                            return;
                        if (value === "@mode") {
                            if (mode !== undefined)
                                void props.setDeepwork(!mode.active);
                        }
                        else if (value === "@use-model")
                            void props.useSessionProfileModel();
                        else {
                            props.chooseSessionProfile(value || null);
                            void props.applySession();
                        }
                    }
                    setOpenFor(undefined);
                } }), _jsxs("span", { className: "dsmm-profile-announcement", id: `${prefix}-feedback`, role: state.sessionIssue === null ? "status" : "alert", "aria-live": "polite", "aria-atomic": "true", children: [feedback || currentLabel, diagnostic === null ? "" : ` ${diagnosticText} ${retryHint}`] })] });
}
//# sourceMappingURL=SessionProfiles.js.map