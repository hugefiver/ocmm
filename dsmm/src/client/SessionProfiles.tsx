import { useId } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ProfilesActions, ProfilesController, ProfilesViewSnapshot } from "./controller.js";
import { sessionProfileLabels } from "./session-labels.js";

type Injected = ProfilesActions & { hooks: { profiles: ProfilesController["store"] } };
export type SessionProfilesProps = InjectFace<Injected> & PropsLocale<"settings.dsmm-profiles"> & { sessionId?: string };

export function SessionScope({ state, actions, t, compact = false }: PropsLocale<"settings.dsmm-profiles"> & {
  state: ProfilesViewSnapshot; actions: ProfilesActions; compact?: boolean;
}) {
  const prefix = useId();
  const session = state.session;
  const labels = session === null ? null : sessionProfileLabels(session, t);
  const selected = state.snapshot?.profiles.find((profile) => profile.id === state.sessionChoice);
  const disabled = state.busy !== null || state.pendingEditor !== null || state.sessionBusy !== null || state.dirty;
  const allowed = session !== null && session.switchAllowed && /^[a-f0-9]{64}$|^absent$/u.test(session.selection.selectionRevision);
  const status = state.sessionNotice === null ? "" : t(state.sessionNotice === "applied-with-model" ? "sessionAppliedWithModel" : state.sessionNotice === "applied" ? "sessionApplied" : "sessionResetDone");
  return <div className="dsmm-session-scope" aria-busy={state.sessionBusy !== null} data-dsmm-session-scope>
    {!compact && <h3>{t("sessionScope")}</h3>}
    {state.currentSessionId === null ? <p className="dsmm-hint">{t("noSession")}</p> : <>
      {labels !== null && <p data-dsmm-session-state>{labels.admitted}</p>}
      {labels !== null && !compact && <p className="dsmm-hint" data-dsmm-session-future-default>{labels.futureDefault}</p>}
      {session !== null && !session.switchAllowed && <p className="dsmm-hint">{t("sessionBusy", { reason: session.switchUnavailableReason ?? "unavailable" })}</p>}
      <div className="dsmm-field"><label htmlFor={`${prefix}-choice`}>{t("sessionSelect")}</label>
        <select id={`${prefix}-choice`} value={state.sessionChoice ?? ""} disabled={disabled || !allowed} onChange={(event) => actions.chooseSessionProfile(event.currentTarget.value || null)}>
          <option value="">{t("sessionBaseline")}</option>
          {state.sessionChoice !== null && selected === undefined && <option value={state.sessionChoice}>{state.sessionChoice}</option>}
          {state.snapshot?.profiles.map((profile) => <option key={profile.id} value={profile.id} disabled={profile.revision === null || profile.error !== undefined}>{profile.label === undefined ? profile.id : `${profile.label} (${profile.id})`}</option>)}
        </select>
      </div>
      {state.dirty && <p className="dsmm-hint">{t("sessionDirty")}</p>}
      <div className="dsmm-actions"><Button type="button" variant="outline" disabled={disabled || !allowed || (state.sessionChoice !== null && selected?.revision == null)} onClick={() => { void actions.applySession(); }}>{t(state.sessionBusy === "apply" ? "sessionApplying" : "sessionApply")}</Button>
        {!compact && <Button type="button" variant="outline" disabled={disabled || !allowed} onClick={() => { void actions.resetSession(); }}>{t(state.sessionBusy === "reset" ? "sessionResetting" : "sessionReset")}</Button>}
        <Button type="button" variant="outline" disabled={state.sessionBusy !== null || state.busy !== null || state.pendingEditor !== null} onClick={() => { void actions.refreshSession(); }}>{t("sessionRefresh")}</Button>
      </div>
      {!compact && session?.rolePolicy !== undefined && <p data-dsmm-session-policy>{t("roleState", { route: session.rolePolicy.route === undefined ? t("inheritRoute") : `${session.rolePolicy.route.provider}/${session.rolePolicy.route.model}${session.rolePolicy.route.reasoningEffort === undefined ? "" : ` (${session.rolePolicy.route.reasoningEffort})`}`, strategy: session.rolePolicy.strategy, retries: session.rolePolicy.retries, failures: session.rolePolicy.rateLimitFailures, switches: session.rolePolicy.switches, delay: session.rolePolicy.totalDelayMs })}</p>}
    </>}
    {state.sessionIssue !== null && <p role="alert">{state.sessionIssue.source === "profile-model" ? t(state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed")
      : state.sessionIssue.code === "conflict" ? t("sessionConflict")
      : ["busy", "maintenance", "disposed", "not-owned"].includes(state.sessionIssue.code) ? t("sessionBusy", { reason: state.sessionIssue.code })
      : t(state.sessionIssue.code === "validation" ? "validation" : "sessionUnavailable")}</p>}
    <p className="dsmm-status" role="status" aria-live="polite" aria-atomic="true">{state.sessionBusy === "read" ? t("reading") : status}</p>
  </div>;
}

/** Additive native header contribution; never operates on a different view seat. */
export function SessionProfiles(props: SessionProfilesProps) {
  const prefix = useId();
  const state = props.useProfiles((snapshot: ProfilesViewSnapshot) => snapshot);
  if (props.sessionId !== state.currentSessionId) return null;
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
  if (state.sessionIssue !== null) feedback = t(state.sessionIssue.source === "profile-model" ? state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed" : state.sessionIssue.code === "conflict" ? "headerConflict" : "headerRefused");
  else if (committing) feedback = t(state.sessionBusy === "read" ? "headerLoading" : "headerApplying");
  else if (state.dirty || state.invalidFields.length > 0 || state.pendingEditor !== null) feedback = t("headerDraft");
  else if (session === null || state.snapshot === null) feedback = t("headerUnavailable");
  else if (!session.switchAllowed) feedback = t("headerBusy");
  else if (state.sessionNotice !== null) feedback = t(state.sessionNotice === "applied-with-model" ? "headerAppliedWithModel" : "headerApplied");
  const capturedSuffix = session?.scope === "global-default" && !unknownCaptured ? ` — ${t("headerCaptured")}` : "";
  return <div className="dsmm-profiles dsmm-header-profiles" data-dsmm-header-profile aria-busy={committing}>
    <label htmlFor={`${prefix}-profile`}>{t("headerProfile")}</label>
    <select id={`${prefix}-profile`} aria-label={t("headerProfileLabel")} title={t("headerModelDefaultHint")} aria-describedby={feedback === "" ? undefined : `${prefix}-feedback`} value={current} disabled={disabled} onChange={(event) => {
      const value = event.currentTarget.value;
      const useProfileModel = value.startsWith("@model:");
      props.chooseSessionProfile((useProfileModel ? value.slice("@model:".length) : value) || null);
      void props.applySession(useProfileModel ? { useProfileModel: true } : undefined);
    }}>
      {session === null && <option value="__dsmm_session_unavailable__" disabled>{t("headerUnavailable")}</option>}
      {unknownCaptured && <option value="__dsmm_captured_default__" disabled>{t("headerCaptured")}</option>}
      {admission?.selectedId != null && currentSaved === undefined && <option value={admission.selectedId} disabled>{admission.selectedId} — {t("headerSavedUnavailable")}{capturedSuffix}</option>}
      <optgroup label={t("headerKeepModelGroup")}>
        <option value="">{t("sessionBaseline")}{current === "" ? capturedSuffix : ""}</option>
        {profiles.map((profile) => <option key={profile.id} value={profile.id} disabled={profile.revision === null || profile.error !== undefined}>{profile.label ?? profile.id}{profile.id === current ? capturedSuffix : ""}{profile.error === undefined && profile.revision !== null ? "" : ` — ${t("headerSavedUnavailable")}`}</option>)}
      </optgroup>
      <optgroup label={t("headerUseModelGroup")}>
        <option value="@model:">{t("sessionBaseline")}</option>
        {profiles.map((profile) => <option key={profile.id} value={`@model:${profile.id}`} disabled={profile.revision === null || profile.error !== undefined}>{profile.label ?? profile.id}{profile.error === undefined && profile.revision !== null ? "" : ` — ${t("headerSavedUnavailable")}`}</option>)}
      </optgroup>
    </select>
    {feedback !== "" && <span id={`${prefix}-feedback`} role={state.sessionIssue === null ? "status" : "alert"} aria-live="polite">{feedback}</span>}
  </div>;
}
