import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useId } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { sessionProfileLabels } from "./session-labels.js";
export function SessionScope({ state, actions, t, compact = false }) {
    const prefix = useId();
    const session = state.session;
    const labels = session === null ? null : sessionProfileLabels(session, t);
    const selected = state.snapshot?.profiles.find((profile) => profile.id === state.sessionChoice);
    const disabled = state.busy !== null || state.pendingEditor !== null || state.sessionBusy !== null || state.dirty;
    const allowed = session !== null && session.switchAllowed && /^[a-f0-9]{64}$|^absent$/u.test(session.selection.selectionRevision);
    const status = state.sessionNotice === null ? "" : t(state.sessionNotice === "applied-with-model" ? "sessionAppliedWithModel" : state.sessionNotice === "applied" ? "sessionApplied" : "sessionResetDone");
    return _jsxs("div", { className: "dsmm-session-scope", "aria-busy": state.sessionBusy !== null, "data-dsmm-session-scope": true, children: [!compact && _jsx("h3", { children: t("sessionScope") }), state.currentSessionId === null ? _jsx("p", { className: "dsmm-hint", children: t("noSession") }) : _jsxs(_Fragment, { children: [labels !== null && _jsx("p", { "data-dsmm-session-state": true, children: labels.admitted }), labels !== null && !compact && _jsx("p", { className: "dsmm-hint", "data-dsmm-session-future-default": true, children: labels.futureDefault }), session !== null && !session.switchAllowed && _jsx("p", { className: "dsmm-hint", children: t("sessionBusy", { reason: session.switchUnavailableReason ?? "unavailable" }) }), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-choice`, children: t("sessionSelect") }), _jsxs("select", { id: `${prefix}-choice`, value: state.sessionChoice ?? "", disabled: disabled || !allowed, onChange: (event) => actions.chooseSessionProfile(event.currentTarget.value || null), children: [_jsx("option", { value: "", children: t("sessionBaseline") }), state.sessionChoice !== null && selected === undefined && _jsx("option", { value: state.sessionChoice, children: state.sessionChoice }), state.snapshot?.profiles.map((profile) => _jsx("option", { value: profile.id, disabled: profile.revision === null || profile.error !== undefined, children: profile.label === undefined ? profile.id : `${profile.label} (${profile.id})` }, profile.id))] })] }), state.dirty && _jsx("p", { className: "dsmm-hint", children: t("sessionDirty") }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { type: "button", variant: "outline", disabled: disabled || !allowed || (state.sessionChoice !== null && selected?.revision == null), onClick: () => { void actions.applySession(); }, children: t(state.sessionBusy === "apply" ? "sessionApplying" : "sessionApply") }), !compact && _jsx(Button, { type: "button", variant: "outline", disabled: disabled || !allowed, onClick: () => { void actions.resetSession(); }, children: t(state.sessionBusy === "reset" ? "sessionResetting" : "sessionReset") }), _jsx(Button, { type: "button", variant: "outline", disabled: state.sessionBusy !== null || state.busy !== null || state.pendingEditor !== null, onClick: () => { void actions.refreshSession(); }, children: t("sessionRefresh") })] }), !compact && session?.rolePolicy !== undefined && _jsx("p", { "data-dsmm-session-policy": true, children: t("roleState", { route: session.rolePolicy.route === undefined ? t("inheritRoute") : `${session.rolePolicy.route.provider}/${session.rolePolicy.route.model}${session.rolePolicy.route.reasoningEffort === undefined ? "" : ` (${session.rolePolicy.route.reasoningEffort})`}`, strategy: session.rolePolicy.strategy, retries: session.rolePolicy.retries, failures: session.rolePolicy.rateLimitFailures, switches: session.rolePolicy.switches, delay: session.rolePolicy.totalDelayMs }) })] }), state.sessionIssue !== null && _jsx("p", { role: "alert", children: state.sessionIssue.source === "profile-model" ? t(state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed")
                    : state.sessionIssue.code === "conflict" ? t("sessionConflict")
                        : ["busy", "maintenance", "disposed", "not-owned"].includes(state.sessionIssue.code) ? t("sessionBusy", { reason: state.sessionIssue.code })
                            : t(state.sessionIssue.code === "validation" ? "validation" : "sessionUnavailable") }), _jsx("p", { className: "dsmm-status", role: "status", "aria-live": "polite", "aria-atomic": "true", children: state.sessionBusy === "read" ? t("reading") : status })] });
}
/** Additive native header contribution; never operates on a different view seat. */
export function SessionProfiles(props) {
    const prefix = useId();
    const state = props.useProfiles((snapshot) => snapshot);
    if (props.sessionId !== state.currentSessionId)
        return null;
    const { t } = props;
    const session = state.session;
    const admission = session?.admittedSelection ?? (session?.scope === "global-default" ? undefined : session?.selection);
    const unknownCaptured = session !== null && admission === undefined;
    const current = session === null ? "__dsmm_session_unavailable__" : unknownCaptured ? "__dsmm_captured_default__" : admission?.selectedId ?? "";
    const profiles = state.snapshot?.profiles ?? [];
    const currentSaved = profiles.find((profile) => profile.id === current);
    const committing = state.sessionBusy !== null;
    const disabled = committing || state.busy !== null || state.pendingEditor !== null || state.dirty || state.invalidFields.length > 0
        || session === null || !session.switchAllowed || state.snapshot === null;
    let feedback = "";
    if (state.sessionIssue !== null)
        feedback = t(state.sessionIssue.source === "profile-model" ? state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed" : state.sessionIssue.code === "conflict" ? "headerConflict" : "headerRefused");
    else if (committing)
        feedback = t(state.sessionBusy === "read" ? "headerLoading" : "headerApplying");
    else if (state.dirty || state.invalidFields.length > 0 || state.pendingEditor !== null)
        feedback = t("headerDraft");
    else if (session === null || state.snapshot === null)
        feedback = t("headerUnavailable");
    else if (!session.switchAllowed)
        feedback = t("headerBusy");
    else if (state.sessionNotice !== null)
        feedback = t(state.sessionNotice === "applied-with-model" ? "headerAppliedWithModel" : "headerApplied");
    const capturedSuffix = session?.scope === "global-default" && !unknownCaptured ? ` — ${t("headerCaptured")}` : "";
    return _jsxs("div", { className: "dsmm-profiles dsmm-header-profiles", "data-dsmm-header-profile": true, "aria-busy": committing, children: [_jsx("label", { htmlFor: `${prefix}-profile`, children: t("headerProfile") }), _jsxs("select", { id: `${prefix}-profile`, "aria-label": t("headerProfileLabel"), title: t("headerModelDefaultHint"), "aria-describedby": feedback === "" ? undefined : `${prefix}-feedback`, value: current, disabled: disabled, onChange: (event) => {
                    const value = event.currentTarget.value;
                    const useProfileModel = value.startsWith("@model:");
                    props.chooseSessionProfile((useProfileModel ? value.slice("@model:".length) : value) || null);
                    void props.applySession(useProfileModel ? { useProfileModel: true } : undefined);
                }, children: [session === null && _jsx("option", { value: "__dsmm_session_unavailable__", disabled: true, children: t("headerUnavailable") }), unknownCaptured && _jsx("option", { value: "__dsmm_captured_default__", disabled: true, children: t("headerCaptured") }), admission?.selectedId != null && currentSaved === undefined && _jsxs("option", { value: admission.selectedId, disabled: true, children: [admission.selectedId, " \u2014 ", t("headerSavedUnavailable"), capturedSuffix] }), _jsxs("optgroup", { label: t("headerKeepModelGroup"), children: [_jsxs("option", { value: "", children: [t("sessionBaseline"), current === "" ? capturedSuffix : ""] }), profiles.map((profile) => _jsxs("option", { value: profile.id, disabled: profile.revision === null || profile.error !== undefined, children: [profile.label ?? profile.id, profile.id === current ? capturedSuffix : "", profile.error === undefined && profile.revision !== null ? "" : ` — ${t("headerSavedUnavailable")}`] }, profile.id))] }), _jsxs("optgroup", { label: t("headerUseModelGroup"), children: [_jsx("option", { value: "@model:", children: t("sessionBaseline") }), profiles.map((profile) => _jsxs("option", { value: `@model:${profile.id}`, disabled: profile.revision === null || profile.error !== undefined, children: [profile.label ?? profile.id, profile.error === undefined && profile.revision !== null ? "" : ` — ${t("headerSavedUnavailable")}`] }, profile.id))] })] }), feedback !== "" && _jsx("span", { id: `${prefix}-feedback`, role: state.sessionIssue === null ? "status" : "alert", "aria-live": "polite", children: feedback })] });
}
//# sourceMappingURL=SessionProfiles.js.map