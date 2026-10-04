import { useEffect, useId, useRef } from "react";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ProfilesActions, ProfilesController, ProfilesIssue, ProfilesViewSnapshot } from "./controller.js";
import { canReconcileSelection } from "./controller.js";

export type ProfilesInjected = ProfilesActions & { hooks: { profiles: ProfilesController["store"] } };
export type ProfilesSectionProps = InjectFace<ProfilesInjected> & PropsLocale<"settings.dsmm-profiles">;

function issueKey(issue: ProfilesIssue): "unavailable" | "transport" | "conflict" | "validation" | "io" | "selectionConflict" | "appliedInvalid" {
  if (issue.source === "selection") return issue.code === "conflict" ? "selectionConflict" : "appliedInvalid";
  if (issue.kind === "assembly") return "unavailable";
  if (issue.kind === "transport") return "transport";
  return issue.code === "conflict" || issue.code === "validation" ? issue.code : "io";
}

/** One native settings.section; policy selection is never coupled to browsing. */
export function ProfilesSection(props: ProfilesSectionProps) {
  const { t } = props;
  const state: ProfilesViewSnapshot = props.useProfiles((snapshot: ProfilesViewSnapshot) => snapshot);
  const prefix = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const hadConfirmation = useRef(false);
  const disabled = state.busy !== null || state.pendingEditor !== null;
  const snapshot = state.snapshot;
  const editor = state.editor;
  const reconcilable = canReconcileSelection(snapshot);
  const selectionConflict = reconcilable && snapshot?.selectionError?.code === "conflict";
  const invalid = state.issue?.kind === "domain" && state.issue.code === "validation";
  const idInvalid = invalid && state.issue?.field === "id";
  useEffect(() => {
    if (state.pendingEditor !== null) { cancelRef.current?.focus(); hadConfirmation.current = true; }
    else if (hadConfirmation.current) { selectRef.current?.focus(); hadConfirmation.current = false; }
  }, [state.pendingEditor]);
  useEffect(() => {
    if (state.issue?.kind === "domain" && state.issue.code === "validation") {
      if (state.issue.field === "id") inputRef.current?.focus();
      else editorRef.current?.focus();
    }
  }, [state.issue]);
  const applied = editor?.revision !== null && editor?.id === snapshot?.selectedId && editor?.revision === snapshot?.appliedRevision;
  let selection = t("baseline");
  if (snapshot?.selectionError !== undefined && !selectionConflict) selection = t("appliedInvalid");
  else if (snapshot?.selectedId !== null && snapshot?.selectedId !== undefined) selection = t("appliedProfile", { id: snapshot.selectedId, revision: snapshot.appliedRevision?.slice(0, 12) ?? "—" });
  const notice = state.notice === null ? "" : t(state.notice.key === "reset" ? "resetDone" : state.notice.key, { id: state.notice.id });
  return <section className="dsmm-profiles" aria-labelledby={`${prefix}-title`} aria-busy={state.busy !== null}>
    <h2 id={`${prefix}-title`}>{t("title")}</h2>
    <p>{t("description")}</p>
    <p className="dsmm-hint">{t("newSessions")}</p>
    <p data-dsmm-selection>{selection}</p>
    <div className="dsmm-actions">
      <Button type="button" variant="outline" disabled={disabled || snapshot === null} onClick={() => { void props.create(); }}>{t("new")}</Button>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => { void props.refresh(); }}>{t(state.busy === "refresh" ? "refreshing" : "refresh")}</Button>
      <Button type="button" variant="outline" disabled={disabled || !reconcilable || (snapshot?.selectedId === null && !selectionConflict)} onClick={() => { void props.reset(); }}>{t(state.busy === "reset" ? "resetting" : "reset")}</Button>
    </div>
    {snapshot !== null && <div className="dsmm-field">
      <label htmlFor={`${prefix}-select`}>{t("editorSelect")}</label>
      <select ref={selectRef} id={`${prefix}-select`} disabled={disabled} value={editor?.revision == null ? "" : editor.id} onChange={(event) => { if (event.currentTarget.value) void props.open(event.currentTarget.value); }}>
        <option value="">{t(editor?.revision === null ? "newDraft" : "choose")}</option>
        {snapshot.profiles.map((profile, index) => <option key={`${index}:${profile.id}`} value={profile.id}>{profile.label === undefined ? profile.id : `${profile.label} (${profile.id})`}{profile.error === undefined ? "" : ` — ${t("invalidProfile", { id: profile.id })}`}</option>)}
      </select>
      {snapshot.profiles.length === 0 && <p className="dsmm-hint">{t("empty")}</p>}
    </div>}
    {state.pendingEditor !== null && <div className="dsmm-confirm" role="group" aria-labelledby={`${prefix}-confirm`} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); props.cancelDiscard(); } }}>
      <p id={`${prefix}-confirm`}>{t("discardPrompt")}</p>
      <div className="dsmm-actions"><Button type="button" variant="outline" onClick={() => { void props.discardAndOpen(); }}>{t("discard")}</Button><Button ref={cancelRef} type="button" variant="primary" onClick={props.cancelDiscard}>{t("cancel")}</Button></div>
    </div>}
    {editor !== null && <div className="dsmm-editor">
      <div className="dsmm-field">
        <label htmlFor={`${prefix}-id`}>{t("profileId")}</label>
        <Input ref={inputRef} id={`${prefix}-id`} className="dsmm-input" value={editor.id} disabled={disabled || editor.revision !== null} aria-invalid={idInvalid || undefined} aria-describedby={`${prefix}-id-hint${idInvalid ? ` ${prefix}-issue` : ""}`} onChange={(event) => props.editId(event.currentTarget.value)} />
        <p id={`${prefix}-id-hint`} className="dsmm-hint">{t("idHint")}</p>
      </div>
      <div className="dsmm-field">
        <label htmlFor={`${prefix}-content`}>{t("configuration")}</label>
        <textarea ref={editorRef} id={`${prefix}-content`} rows={12} spellCheck={false} value={editor.content} disabled={disabled} aria-invalid={(invalid && !idInvalid) || undefined} aria-describedby={`${prefix}-content-hint ${prefix}-structural-hint${invalid && !idInvalid ? ` ${prefix}-issue` : ""}`} onChange={(event) => props.editContent(event.currentTarget.value)} />
        <p id={`${prefix}-content-hint`} className="dsmm-hint">{t("configurationHint")}</p>
        <p id={`${prefix}-structural-hint`} className="dsmm-hint">{t("structuralHint")}</p>
      </div>
      <p data-dsmm-editor-state>{t(state.dirty ? "dirty" : applied ? "savedApplied" : "savedNotApplied")}</p>
      <div className="dsmm-actions">
        <Button type="button" variant="primary" disabled={disabled || !state.dirty || snapshot === null} onClick={() => { void props.save(); }}>{t(state.busy === "save" ? "saving" : "save")}</Button>
        <Button type="button" variant="outline" disabled={disabled || state.dirty || editor.revision === null || !reconcilable || (applied && !selectionConflict)} onClick={() => { void props.apply(); }}>{t(state.busy === "apply" ? "applying" : "apply")}</Button>
        {editor.revision !== null && <Button type="button" variant="outline" disabled={disabled} onClick={() => { void props.reload(); }}>{t("reload")}</Button>}
      </div>
    </div>}
    {state.issue !== null && <div className="dsmm-issue" id={`${prefix}-issue`} role="alert"><p>{t(issueKey(state.issue))}</p>{state.issue.kind === "domain" && state.issue.message !== undefined && <p>{t("details")}: {state.issue.message}</p>}</div>}
    {snapshot?.selectionError !== undefined && <div className="dsmm-issue"><p>{t("details")}: {snapshot.selectionError.message}</p><p>{t(selectionConflict ? "selectionConflict" : "retry")}</p></div>}
    <p className="dsmm-status" role="status" aria-live="polite" aria-atomic="true">{state.busy === "refresh" && snapshot === null ? t("loading") : state.busy === "read" ? t("reading") : notice}</p>
  </section>;
}
