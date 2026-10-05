import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useState } from "react";
import { Button, IconBranchOutlineRegular, Menu } from "@deepseek-ai/dsh-client-ui-primitives";
import { sessionProfileLabels } from "./session-labels.js";
const MENU_ISSUE_CODES = new Set(["validation", "conflict", "not-found", "lock-timeout", "unsafe-path", "io", "activation", "corrupt-selection", "limit", "busy", "maintenance", "disposed", "not-owned", "unavailable", "cancelled", "model-unconfigured", "model-choice-changed", "model-service-unavailable", "model-observation-unavailable", "model-selection-failed"]);
const MENU_ROLE_FIELD = /^(?:settings\.roleRouting\.)?dsmm-(?:orchestrator|planner|plan-critic|builder|reviewer|oracle|oracle-2nd|creative|code-search|doc-search|clarifier|media-reader)(?:\.(?:primary|fallbackRoutes)(?:\[[0-7]\])?(?:\.(?:provider|model|reasoningEffort))?|\.strategy|\.rateLimit(?:\.(?:maxRetries|initialDelayMs|maxDelayMs|maxTotalDelayMs|switchAfterRateLimits|maxSwitches))?)?$/u;
const MENU_COMMON_FIELD = /^(?:version|id|label|content|sessionId|expectedRevision|expectedSelectionRevision|expectedAdmissionEpoch|settings(?:\.(?:defaultActive|roleRouting|workflow|guards|runtimeRecovery|runtimePolicy))?)$/u;
function menuIssue(issue) {
    const code = MENU_ISSUE_CODES.has(issue.code) ? issue.code : issue.kind === "transport" ? "transport" : "unavailable";
    const field = issue.field;
    // Only closed configuration grammar is displayable; never echo messages,
    // arbitrary wire fields, provider identifiers, credentials or file paths.
    return { code, ...(typeof field === "string" && field.length <= 128 && (MENU_ROLE_FIELD.test(field) || MENU_COMMON_FIELD.test(field)) ? { field } : {}) };
}
export function SessionScope({ state, actions, t, compact = false }) {
    const prefix = useId();
    const session = state.session;
    const labels = session === null ? null : sessionProfileLabels(session, t);
    const selected = state.snapshot?.profiles.find((profile) => profile.id === state.sessionChoice);
    const disabled = state.busy !== null || state.pendingEditor !== null || state.sessionBusy !== null || state.dirty;
    const allowed = session !== null && session.switchAllowed && /^[a-f0-9]{64}$|^absent$/u.test(session.selection.selectionRevision);
    const status = state.sessionNotice === null ? "" : t(state.sessionNotice === "mode-on" ? "headerModeOn" : state.sessionNotice === "mode-off" ? "headerModeOff" : state.sessionNotice === "applied-with-model" ? "sessionAppliedWithModel" : state.sessionNotice === "applied" ? "sessionApplied" : "sessionResetDone");
    return _jsxs("div", { className: "dsmm-session-scope", "aria-busy": state.sessionBusy !== null, "data-dsmm-session-scope": true, children: [!compact && _jsx("h3", { children: t("sessionScope") }), state.currentSessionId === null ? _jsx("p", { className: "dsmm-hint", children: t("noSession") }) : _jsxs(_Fragment, { children: [labels !== null && _jsx("p", { "data-dsmm-session-state": true, children: labels.admitted }), labels !== null && !compact && _jsx("p", { className: "dsmm-hint", "data-dsmm-session-future-default": true, children: labels.futureDefault }), session !== null && !session.switchAllowed && _jsx("p", { className: "dsmm-hint", children: t("sessionBusy", { reason: session.switchUnavailableReason ?? "unavailable" }) }), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-choice`, children: t("sessionSelect") }), _jsxs("select", { id: `${prefix}-choice`, value: state.sessionChoice ?? "", disabled: disabled || !allowed, onChange: (event) => actions.chooseSessionProfile(event.currentTarget.value || null), children: [_jsx("option", { value: "", children: t("sessionBaseline") }), state.sessionChoice !== null && selected === undefined && _jsx("option", { value: state.sessionChoice, children: state.sessionChoice }), state.snapshot?.profiles.map((profile) => _jsx("option", { value: profile.id, disabled: profile.revision === null || profile.error !== undefined, children: profile.label === undefined ? profile.id : `${profile.label} (${profile.id})` }, profile.id))] })] }), state.dirty && _jsx("p", { className: "dsmm-hint", children: t("sessionDirty") }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { type: "button", variant: "outline", disabled: disabled || !allowed || (state.sessionChoice !== null && selected?.revision == null), onClick: () => { void actions.applySession(); }, children: t(state.sessionBusy === "apply" ? "sessionApplying" : "sessionApply") }), !compact && _jsx(Button, { type: "button", variant: "outline", disabled: disabled || !allowed, onClick: () => { void actions.resetSession(); }, children: t(state.sessionBusy === "reset" ? "sessionResetting" : "sessionReset") }), _jsx(Button, { type: "button", variant: "outline", disabled: state.sessionBusy !== null || state.busy !== null || state.pendingEditor !== null, onClick: () => { void actions.refreshSession(); }, children: t("sessionRefresh") })] }), !compact && session?.rolePolicy !== undefined && _jsx("p", { "data-dsmm-session-policy": true, children: t("roleState", { route: session.rolePolicy.route === undefined ? t("inheritRoute") : `${session.rolePolicy.route.provider}/${session.rolePolicy.route.model}${session.rolePolicy.route.reasoningEffort === undefined ? "" : ` (${session.rolePolicy.route.reasoningEffort})`}`, strategy: session.rolePolicy.strategy, retries: session.rolePolicy.retries, failures: session.rolePolicy.rateLimitFailures, switches: session.rolePolicy.switches, delay: session.rolePolicy.totalDelayMs }) })] }), state.sessionIssue !== null && _jsx("p", { role: "alert", children: state.sessionIssue.source === "profile-model" ? t(state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed")
                    : state.sessionIssue.code === "conflict" ? t("sessionConflict")
                        : ["busy", "maintenance", "disposed", "not-owned"].includes(state.sessionIssue.code) ? t("sessionBusy", { reason: state.sessionIssue.code })
                            : t(state.sessionIssue.code === "validation" ? "validation" : "sessionUnavailable") }), _jsx("p", { className: "dsmm-status", role: "status", "aria-live": "polite", "aria-atomic": "true", children: state.sessionBusy === "read" ? t("reading") : status })] });
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
    const admission = session?.admittedSelection ?? (session?.scope === "global-default" ? undefined : session?.selection);
    const unknownCaptured = session !== null && admission === undefined;
    const current = session === null ? "__dsmm_session_unavailable__" : unknownCaptured ? "__dsmm_captured_default__" : admission?.selectedId ?? "";
    const profiles = state.snapshot?.profiles ?? [];
    const currentSaved = profiles.find((profile) => profile.id === current);
    const committing = state.sessionBusy !== null;
    const disabled = id === null || committing || state.busy !== null || state.pendingEditor !== null || state.dirty || state.invalidFields.length > 0
        || session === null || !session.switchAllowed || state.snapshot === null;
    let feedback = "";
    if (state.sessionIssue !== null)
        feedback = t(state.sessionIssue.source === "profile-model" ? state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed"
            : state.sessionIssue.code === "conflict" ? "headerConflict" : state.sessionIssue.code === "activation" ? "headerActivationRefused"
                : state.sessionIssue.code === "maintenance" ? "headerMaintenanceRefused" : state.sessionIssue.code === "busy" ? "headerBusyRefused"
                    : state.sessionIssue.code === "cancelled" ? "headerCancelledRefused" : state.sessionIssue.code === "unavailable" || state.sessionIssue.kind === "assembly" ? "headerUnavailableRefused" : "headerSelectionRefused");
    else if (committing || state.busy !== null)
        feedback = t(state.sessionBusy === "apply" || state.sessionBusy === "reset" ? "headerApplying" : "headerLoading");
    else if (state.dirty || state.invalidFields.length > 0 || state.pendingEditor !== null)
        feedback = t("headerDraft");
    else if (id === null)
        feedback = t("headerNoSession");
    else if (session === null || state.snapshot === null)
        feedback = t("headerUnavailable");
    else if (!session.switchAllowed)
        feedback = t("headerBusy");
    else if (state.sessionNotice !== null)
        feedback = t(state.sessionNotice === "mode-on" ? "headerModeOn" : state.sessionNotice === "mode-off" ? "headerModeOff" : state.sessionNotice === "applied-with-model" ? "headerAppliedWithModel" : "headerApplied");
    const profileName = unknownCaptured ? t("headerCaptured") : currentSaved?.label === undefined ? admission?.selectedId ?? t("sessionBaseline") : `${currentSaved.label} (${currentSaved.id})`;
    const currentLabel = t("headerCurrentProfile", { profile: session === null ? t("headerUnavailable") : profileName });
    const entries = [{ type: "label", id: "@current", text: currentLabel }];
    if (id === null && state.snapshot !== null)
        entries.push({ type: "label", id: "@future", text: t("sessionFutureDefault", { profile: state.snapshot.profiles.find((profile) => profile.id === state.snapshot.selectedId)?.label ?? state.snapshot.selectedId ?? t("sessionBaseline") }) });
    if (feedback !== "" && (state.sessionNotice === null || state.sessionIssue !== null))
        entries.push({ type: "label", id: "@status", text: feedback });
    const mode = session?.deepwork;
    entries.push({ id: "@mode", label: t(mode === undefined ? "headerModeUnavailable" : mode.locked ? "headerModePreset" : mode.active ? "headerModeDisable" : "headerModeEnable"),
        disabled: id === null || committing || state.busy !== null || session === null || !session.switchAllowed || mode === undefined || mode.locked });
    const diagnostic = state.sessionIssue === null ? null : menuIssue(state.sessionIssue);
    const diagnosticText = diagnostic === null ? "" : t("headerIssueCode", { code: diagnostic.code }) + (diagnostic.field === undefined ? "" : ` ${t("headerIssueField", { field: diagnostic.field })}`);
    const retryHint = t(diagnostic?.code === "maintenance" || diagnostic?.code === "busy" ? "headerWaitRetryHint" : "headerRetryHint");
    if (diagnostic !== null)
        entries.push({ type: "label", id: "@diagnostic", text: diagnosticText }, { type: "label", id: "@retry", text: retryHint });
    if (admission?.selectedId != null && currentSaved === undefined)
        entries.push({ id: admission.selectedId, label: `${admission.selectedId} — ${t("headerSavedUnavailable")}`, disabled: true });
    if (unknownCaptured)
        entries.push({ id: "__dsmm_captured_default__", label: t("headerCaptured"), disabled: true });
    entries.push({ type: "separator", id: "@keep-separator" }, { type: "label", id: "@keep-heading", text: t("headerCompactProfiles") }, { id: "", label: t("sessionBaseline"), disabled });
    for (const profile of profiles)
        entries.push({ id: profile.id, label: (profile.label ?? profile.id) + (profile.error === undefined && profile.revision !== null ? "" : ` — ${t("headerSavedUnavailable")}`), disabled: disabled || profile.revision === null || profile.error !== undefined });
    entries.push({ type: "separator", id: "@model-separator" }, { id: "@use-model", label: t("headerUseCurrentModel"), disabled: disabled || session?.profileModel === undefined });
    const open = openFor === id;
    return _jsxs("div", { className: "dsmm-header-profiles", "data-dsmm-header-profile": true, "aria-busy": committing, children: [_jsx(Menu, { open: open, autoFocus: true, portal: true, align: "start", className: "dsmm-profile-anchor", listClassName: "dsmm-profile-menu", items: entries, selectedId: current, footer: [{ id: "@refresh", label: t("headerCompactRefresh"), disabled: committing || state.busy !== null }], anchor: _jsx(Button, { type: "button", size: "sm", variant: "toolbar", className: "dsmm-profile-trigger", icon: _jsx(IconBranchOutlineRegular, {}), "aria-label": t("headerProfileLabel"), "aria-haspopup": "menu", "aria-expanded": open, "aria-describedby": `${prefix}-feedback`, onClick: () => setOpenFor(open ? undefined : id) }), onClose: () => setOpenFor(undefined), onSelect: (value) => {
                    if (props.readProfileView().currentSessionId !== id)
                        return;
                    if (value === "@refresh") {
                        if (committing || state.busy !== null)
                            return;
                        void (async () => { await props.refresh(); if (id !== null && props.readProfileView().currentSessionId === id)
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