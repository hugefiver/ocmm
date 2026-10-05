import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useRef } from "react";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import { canReconcileSelection } from "./controller.js";
import { StructuredEditor } from "./StructuredEditor.js";
import { SessionScope } from "./SessionProfiles.js";
import { structuredDocument } from "./structured.js";
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
    const cancelRef = useRef(null);
    const hadConfirmation = useRef(false);
    const disabled = state.busy !== null || state.pendingEditor !== null || state.sessionBusy === "apply" || state.sessionBusy === "reset";
    const snapshot = state.snapshot;
    const editor = state.editor;
    const reconcilable = canReconcileSelection(snapshot);
    const selectionConflict = reconcilable && snapshot?.selectionError?.code === "conflict";
    const invalid = state.issue?.kind === "domain" && state.issue.code === "validation";
    const idInvalid = invalid && state.issue?.field === "id";
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
        if (state.issue?.kind === "domain" && state.issue.code === "validation") {
            if (state.issue.field === "id")
                inputRef.current?.focus();
            else
                editorRef.current?.focus();
        }
    }, [state.issue]);
    const applied = editor?.revision !== null && editor?.id === snapshot?.selectedId && editor?.revision === snapshot?.appliedRevision;
    let selection = t("baseline");
    if (snapshot?.selectionError !== undefined && !selectionConflict)
        selection = t("appliedInvalid");
    else if (snapshot?.selectedId !== null && snapshot?.selectedId !== undefined)
        selection = t("appliedProfile", { id: snapshot.selectedId, revision: snapshot.appliedRevision?.slice(0, 12) ?? "—" });
    const notice = state.notice === null ? "" : t(state.notice.key === "reset" ? "resetDone" : state.notice.key, { id: state.notice.id });
    return _jsxs("section", { className: "dsmm-profiles", "aria-labelledby": `${prefix}-title`, "aria-busy": state.busy !== null, children: [_jsx("h2", { id: `${prefix}-title`, children: t("title") }), _jsx("p", { children: t("description") }), _jsx("h3", { id: `${prefix}-global`, children: t("globalScope") }), _jsx("p", { className: "dsmm-hint", children: t("newSessions") }), _jsx("p", { "data-dsmm-selection": true, children: selection }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { type: "button", variant: "outline", disabled: disabled || snapshot === null, onClick: () => { void props.create(); }, children: t("new") }), _jsx(Button, { type: "button", variant: "outline", disabled: disabled, onClick: () => { void props.refresh(); }, children: t(state.busy === "refresh" ? "refreshing" : "refresh") }), _jsx(Button, { type: "button", variant: "outline", disabled: disabled || !reconcilable || (snapshot?.selectedId === null && !selectionConflict), onClick: () => { void props.reset(); }, children: t(state.busy === "reset" ? "resetting" : "reset") })] }), snapshot !== null && _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-select`, children: t("editorSelect") }), _jsxs("select", { ref: selectRef, id: `${prefix}-select`, disabled: disabled, value: editor?.revision == null ? "" : editor.id, onChange: (event) => { if (event.currentTarget.value)
                            void props.open(event.currentTarget.value); }, children: [_jsx("option", { value: "", children: t(editor?.revision === null ? "newDraft" : "choose") }), snapshot.profiles.map((profile, index) => _jsxs("option", { value: profile.id, children: [profile.label === undefined ? profile.id : `${profile.label} (${profile.id})`, profile.error === undefined ? "" : ` — ${t("invalidProfile", { id: profile.id })}`] }, `${index}:${profile.id}`))] }), snapshot.profiles.length === 0 && _jsx("p", { className: "dsmm-hint", children: t("empty") })] }), state.pendingEditor !== null && _jsxs("div", { className: "dsmm-confirm", role: "group", "aria-labelledby": `${prefix}-confirm`, onKeyDown: (event) => { if (event.key === "Escape") {
                    event.preventDefault();
                    props.cancelDiscard();
                } }, children: [_jsx("p", { id: `${prefix}-confirm`, children: t("discardPrompt") }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => { void props.discardAndOpen(); }, children: t("discard") }), _jsx(Button, { ref: cancelRef, type: "button", variant: "primary", onClick: props.cancelDiscard, children: t("cancel") })] })] }), _jsx(SessionScope, { state: state, actions: props, t: t }), _jsxs("div", { className: "dsmm-catalog", children: [_jsx("h3", { children: t("catalogTitle") }), _jsx("p", { className: "dsmm-hint", children: t("catalogHint") }), state.catalogUnavailable && _jsx("p", { className: "dsmm-hint", children: t("catalogUnavailable") }), state.catalog?.failures.map((failure) => _jsx("p", { className: "dsmm-hint", children: t("catalogFailure", { name: failure.name, id: failure.id }) }, failure.id)), _jsx(Button, { type: "button", variant: "outline", disabled: state.catalogBusy, onClick: () => { void props.refreshCatalog(); }, children: t(state.catalogBusy ? "catalogRefreshing" : "catalogRefresh") })] }), editor !== null && _jsxs("div", { className: "dsmm-editor", children: [_jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-id`, children: t("profileId") }), _jsx(Input, { ref: inputRef, id: `${prefix}-id`, className: "dsmm-input", value: editor.id, disabled: disabled || editor.revision !== null, "aria-invalid": idInvalid || undefined, "aria-describedby": `${prefix}-id-hint${idInvalid ? ` ${prefix}-issue` : ""}`, onChange: (event) => props.editId(event.currentTarget.value) }), _jsx("p", { id: `${prefix}-id-hint`, className: "dsmm-hint", children: t("idHint") })] }), _jsx(StructuredEditor, { state: state, actions: props, disabled: disabled, t: t }, state.editorEpoch), _jsxs("details", { className: "dsmm-advanced", open: true, children: [_jsx("summary", { children: t("advanced") }), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${prefix}-content`, children: t("configuration") }), _jsx("textarea", { ref: editorRef, id: `${prefix}-content`, rows: 12, spellCheck: false, value: editor.content, disabled: disabled, "aria-invalid": rawInvalid || (invalid && !idInvalid) || undefined, "aria-describedby": `${prefix}-content-hint ${prefix}-structural-hint${invalid && !idInvalid ? ` ${prefix}-issue` : ""}`, onChange: (event) => props.editContent(event.currentTarget.value) }), _jsx("p", { id: `${prefix}-content-hint`, className: "dsmm-hint", children: t("configurationHint") }), _jsx("p", { id: `${prefix}-structural-hint`, className: "dsmm-hint", children: t("structuralHint") })] })] }), _jsx("p", { "data-dsmm-editor-state": true, children: t(state.dirty ? "dirty" : applied ? "savedApplied" : "savedNotApplied") }), _jsx("p", { id: `${prefix}-global-action`, className: "dsmm-hint", children: t("globalActionHint") }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { type: "button", variant: "primary", disabled: disabled || !state.dirty || snapshot === null || state.invalidFields.length > 0, onClick: () => { void props.save(); }, children: t(state.busy === "save" ? "saving" : "save") }), _jsx(Button, { type: "button", variant: "outline", "aria-describedby": `${prefix}-global-action`, disabled: disabled || state.dirty || editor.revision === null || !reconcilable || (applied && !selectionConflict), onClick: () => { void props.apply(); }, children: t(state.busy === "apply" ? "applying" : "apply") }), editor.revision !== null && _jsx(Button, { type: "button", variant: "outline", disabled: disabled, onClick: () => { void props.reload(); }, children: t("reload") })] })] }), state.issue !== null && _jsxs("div", { className: "dsmm-issue", id: `${prefix}-issue`, role: "alert", children: [_jsx("p", { children: t(issueKey(state.issue)) }), state.issue.kind === "domain" && state.issue.message !== undefined && _jsxs("p", { children: [t("details"), ": ", state.issue.message] })] }), snapshot?.selectionError !== undefined && _jsxs("div", { className: "dsmm-issue", children: [_jsxs("p", { children: [t("details"), ": ", snapshot.selectionError.message] }), _jsx("p", { children: t(selectionConflict ? "selectionConflict" : "retry") })] }), _jsx("p", { className: "dsmm-status", role: "status", "aria-live": "polite", "aria-atomic": "true", children: state.busy === "refresh" && snapshot === null ? t("loading") : state.busy === "read" ? t("reading") : notice })] });
}
//# sourceMappingURL=ProfilesSection.js.map