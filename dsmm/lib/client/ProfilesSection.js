import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useRef } from "react";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import { canReconcileSelection } from "./controller.js";
import { StructuredEditor } from "./StructuredEditor.js";
import { SessionScope } from "./SessionProfiles.js";
import { structuredDocument } from "./structured.js";
import { draftWarnings, IssueDetails, ProfileWarnings } from "./diagnostics.js";
function issueKey(issue) {
    if (issue.source === "selection")
        return issue.code === "conflict" ? "selectionConflict" : "appliedInvalid";
    if (issue.kind === "assembly")
        return "unavailable";
    if (issue.kind === "transport")
        return "transport";
    return issue.code === "conflict" || issue.code === "validation" ? issue.code : "io";
}
/** One native settings.section; policy selection is never coupled to browsing. */
export function ProfilesSection(props) {
    const { t } = props;
    const state = props.useProfiles((snapshot) => snapshot);
    const prefix = useId();
    const selectRef = useRef(null);
    const inputRef = useRef(null);
    const editorRef = useRef(null);
    const advancedRef = useRef(null);
    const handledValidation = useRef(0);
    const cancelRef = useRef(null);
    const hadConfirmation = useRef(false);
    const disabled = state.busy !== null || state.pendingEditor !== null || state.sessionBusy === "apply" || state.sessionBusy === "reset";
    const snapshot = state.snapshot;
    const editor = state.editor;
    const readOnly = snapshot?.readOnly === true;
    const editorDisabled = disabled || readOnly;
    const reconcilable = canReconcileSelection(snapshot);
    const selectionConflict = reconcilable && snapshot?.selectionError?.code === "conflict";
    const invalid = state.issue?.kind === "domain" && state.issue.code === "validation";
    const idInvalid = invalid && state.issue?.field === "id" && state.issue.location === undefined && editor?.revision === null && !editorDisabled;
    const rawInvalid = editor !== null && structuredDocument(editor.content) === null;
    useEffect(() => {
        if (state.pendingEditor !== null) {
            cancelRef.current?.focus();
            hadConfirmation.current = true;
        }
        else if (hadConfirmation.current) {
            selectRef.current?.focus();
            hadConfirmation.current = false;
        }
    }, [state.pendingEditor]);
    useEffect(() => {
        if (state.busy === null && state.validationEpoch > handledValidation.current && state.issue?.kind === "domain" && state.issue.code === "validation") {
            handledValidation.current = state.validationEpoch;
            if (state.issue.location === undefined && state.issue.field === "id" && inputRef.current !== null
                && !inputRef.current.disabled && !inputRef.current.readOnly)
                inputRef.current.focus();
            else {
                if (advancedRef.current !== null)
                    advancedRef.current.open = true;
                const input = editorRef.current;
                if (input !== null) {
                    input.focus();
                    const location = state.issue.location;
                    if (location !== undefined && location.offset + location.length <= input.value.length)
                        input.setSelectionRange(location.offset, location.offset + location.length);
                }
            }
        }
    }, [state.issue, state.busy, state.validationEpoch]);
    const applied = editor?.revision != null && editor.id === snapshot?.selectedId && editor.revision === snapshot?.appliedRevision;
    let selection = t(snapshot === null ? "unavailable" : "baseline");
    if (snapshot?.selectionError !== undefined && !selectionConflict)
        selection = t("appliedInvalid");
    else if (snapshot?.selectedId !== null && snapshot?.selectedId !== undefined)
        selection = t("appliedProfile", { id: snapshot.selectedId, revision: snapshot.appliedRevision ?? "—" });
    const notice = state.notice === null ? "" : t(state.notice.key === "reset" ? "resetDone" : state.notice.key, { id: state.notice.id });
    const warnings = editor === null ? [] : draftWarnings(editor.content);
    return _jsxs("section", { className: "dsmm-profiles", "aria-labelledby": `${prefix}-title`, "aria-busy": state.busy !== null, children: [_jsx("h2", { id: `${prefix}-title`, children: t("title") }), _jsx("p", { children: t("description") }), snapshot?.origin !== undefined && _jsx("p", { className: "dsmm-hint", children: t(snapshot.origin === "legacy" ? "legacyOrigin" : snapshot.origin === "central" ? "centralOrigin" : "explicitOrigin") }), readOnly && _jsx("p", { role: "status", className: "dsmm-hint", children: t("readOnlyOrigin") }), _jsxs("section", { className: "dsmm-zone", "aria-labelledby": `${prefix}-browse`, "data-dsmm-zone": "browse", children: [_jsx("h3", { id: `${prefix}-browse`, children: t("browseZone") }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { type: "button", variant: "outline", disabled: editorDisabled || snapshot === null, onClick: () => { void props.create(); }, children: t("new") }), _jsx(Button, { type: "button", variant: "outline", disabled: disabled, onClick: () => { void props.refresh(); }, children: t(state.busy === "refresh" ? "refreshing" : "refresh") })] }), snapshot !== null && _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-select`, children: t("editorSelect") }), _jsxs("select", { ref: selectRef, id: `${prefix}-select`, disabled: disabled, value: editor?.revision == null ? "" : editor.id, onChange: (event) => { if (event.currentTarget.value)
                                    void props.open(event.currentTarget.value); }, children: [_jsx("option", { value: "", children: t(editor?.revision === null ? "newDraft" : "choose") }), snapshot.profiles.map((profile, index) => _jsxs("option", { value: profile.id, children: [profile.label?.trim() ? `${profile.label} (${profile.id})` : profile.id, profile.error === undefined ? "" : ` — ${t("invalidProfile", { id: profile.id })}`, profile.warnings?.length ? ` — ${t("warningProfile")}` : ""] }, `${index}:${profile.id}`))] }), snapshot.profiles.length === 0 && _jsx("p", { className: "dsmm-hint", children: t("empty") })] }), snapshot !== null && snapshot.profiles.length > 0 && _jsx("ul", { className: "dsmm-profile-list", "aria-label": t("savedInventory"), children: snapshot.profiles.map((profile, index) => _jsxs("li", { children: [_jsx("p", { children: profile.label?.trim() ? `${profile.label} (${profile.id})` : profile.id }), _jsx("p", { className: "dsmm-hint", children: t("savedRevision", { revision: profile.revision ?? "—" }) }), _jsx(ProfileWarnings, { warnings: profile.warnings, t: t }), profile.error !== undefined && _jsx(IssueDetails, { issue: profile.error, t: t })] }, `${index}:${profile.id}`)) }), state.pendingEditor !== null && _jsxs("div", { className: "dsmm-confirm", role: "group", "aria-labelledby": `${prefix}-confirm`, onKeyDown: (event) => { if (event.key === "Escape") {
                            event.preventDefault();
                            props.cancelDiscard();
                        } }, children: [_jsx("p", { id: `${prefix}-confirm`, children: t("discardPrompt") }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => { void props.discardAndOpen(); }, children: t("discard") }), _jsx(Button, { ref: cancelRef, type: "button", variant: "primary", onClick: props.cancelDiscard, children: t("cancel") })] })] })] }), _jsxs("section", { className: "dsmm-zone", "aria-labelledby": `${prefix}-edit`, "data-dsmm-zone": "edit", children: [_jsx("h3", { id: `${prefix}-edit`, children: t("editZone") }), editor === null && _jsx("p", { className: "dsmm-hint", children: t("noEditor") }), editor !== null && _jsxs("div", { className: "dsmm-editor", children: [_jsx("p", { "data-dsmm-editor-state": true, children: t(state.dirty ? "dirty" : applied ? "savedApplied" : "savedNotApplied") }), _jsx("p", { className: "dsmm-hint", children: t("savedRevision", { revision: editor.revision ?? "—" }) }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { type: "button", variant: "primary", disabled: editorDisabled || !state.dirty || snapshot === null || state.invalidFields.length > 0, onClick: () => { void props.save(); }, children: t(state.busy === "save" ? "saving" : "save") }), editor.revision !== null && _jsx(Button, { type: "button", variant: "outline", disabled: disabled, onClick: () => { void props.reload(); }, children: t("reload") })] }), warnings.length > 0 && _jsxs("div", { children: [_jsx("p", { children: t("draftWarnings") }), _jsx(ProfileWarnings, { warnings: warnings, t: t })] }), editor.warnings?.length ? _jsxs("div", { children: [_jsx("p", { children: t("savedWarnings") }), _jsx(ProfileWarnings, { warnings: editor.warnings, t: t })] }) : null, _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-id`, children: t("profileId") }), _jsx(Input, { ref: inputRef, id: `${prefix}-id`, className: "dsmm-input", value: editor.id, disabled: editorDisabled || editor.revision !== null, "aria-invalid": idInvalid || undefined, "aria-describedby": `${prefix}-id-hint${idInvalid ? ` ${prefix}-issue` : ""}`, onChange: (event) => props.editId(event.currentTarget.value) }), _jsx("p", { id: `${prefix}-id-hint`, className: "dsmm-hint", children: t("idHint") })] }), _jsxs("div", { className: "dsmm-catalog", children: [_jsx("h3", { children: t("catalogTitle") }), _jsx("p", { className: "dsmm-hint", children: t("catalogHint") }), state.catalogUnavailable && _jsx("p", { className: "dsmm-hint", children: t("catalogUnavailable") }), state.catalog?.failures.map((failure) => _jsx("p", { className: "dsmm-hint", children: t("catalogFailure", { name: failure.name, id: failure.id }) }, failure.id)), _jsx(Button, { type: "button", variant: "outline", disabled: state.catalogBusy, onClick: () => { void props.refreshCatalog(); }, children: t(state.catalogBusy ? "catalogRefreshing" : "catalogRefresh") })] }), _jsx(StructuredEditor, { state: state, actions: props, disabled: editorDisabled, t: t }, state.editorEpoch), _jsxs("details", { ref: advancedRef, className: "dsmm-advanced", children: [_jsx("summary", { children: t("advanced") }), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-content`, children: t("configuration") }), _jsx("textarea", { ref: editorRef, id: `${prefix}-content`, rows: 12, spellCheck: false, value: editor.content, readOnly: readOnly, disabled: disabled, "aria-invalid": rawInvalid || (invalid && !idInvalid) || undefined, "aria-describedby": `${prefix}-content-hint ${prefix}-structural-hint${invalid && !idInvalid ? ` ${prefix}-issue` : ""}`, onChange: (event) => props.editContent(event.currentTarget.value) }), _jsx("p", { id: `${prefix}-content-hint`, className: "dsmm-hint", children: t("configurationHint") }), _jsx("p", { id: `${prefix}-structural-hint`, className: "dsmm-hint", children: t("structuralHint") })] })] }, state.editorEpoch)] }), state.issue !== null && _jsxs("div", { className: "dsmm-issue", id: `${prefix}-issue`, role: "alert", children: [_jsx("p", { children: t(issueKey(state.issue)) }), _jsx(IssueDetails, { issue: state.issue, t: t })] })] }), _jsxs("section", { className: "dsmm-zone", "aria-labelledby": `${prefix}-global`, "data-dsmm-zone": "future-default", children: [_jsx("h3", { id: `${prefix}-global`, children: t("globalScope") }), _jsx("p", { className: "dsmm-hint", children: t("newSessions") }), _jsx("p", { "data-dsmm-selection": true, children: selection }), _jsx("p", { className: "dsmm-hint", children: t("futurePin", { revision: snapshot?.selectionRevision ?? "—" }) }), snapshot?.selectedWarnings?.length ? _jsxs("div", { children: [_jsx("p", { children: t("futureWarnings") }), _jsx(ProfileWarnings, { warnings: snapshot.selectedWarnings, t: t })] }) : null, _jsx("p", { className: "dsmm-hint", children: t("savedOnlyHint") }), _jsx("p", { id: `${prefix}-global-action`, className: "dsmm-hint", children: t("globalActionHint") }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { type: "button", variant: "primary", "aria-describedby": `${prefix}-global-action`, disabled: editorDisabled || state.dirty || editor?.revision == null || !reconcilable || (applied && !selectionConflict), onClick: () => { void props.apply(); }, children: t(state.busy === "apply" ? "applying" : "apply") }), _jsx(Button, { type: "button", variant: "outline", disabled: editorDisabled || !reconcilable || (snapshot?.selectedId === null && !selectionConflict), onClick: () => { void props.reset(); }, children: t(state.busy === "reset" ? "resetting" : "reset") })] }), snapshot?.selectionError !== undefined && _jsxs("div", { className: "dsmm-issue", children: [_jsx("p", { children: t(selectionConflict ? "selectionConflict" : "retry") }), _jsx(IssueDetails, { issue: snapshot.selectionError, t: t })] })] }), _jsx("section", { className: "dsmm-zone", "aria-label": t("sessionScope"), "data-dsmm-zone": "current-session", children: _jsx(SessionScope, { state: state, actions: props, t: t }) }), _jsx("p", { className: "dsmm-status", role: "status", "aria-live": "polite", "aria-atomic": "true", children: state.busy === "refresh" && snapshot === null ? t("loading") : state.busy === "read" ? t("reading") : notice })] });
}
//# sourceMappingURL=ProfilesSection.js.map