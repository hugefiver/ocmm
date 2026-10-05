import { useEffect, useId, useState } from "react";
import { Button, IconBranchOutlineRegular, Menu } from "@deepseek-ai/dsh-client-ui-primitives";
import type { MenuEntry } from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ProfilesActions, ProfilesController, ProfilesIssue, ProfilesViewSnapshot } from "./controller.js";
import { sessionProfileLabels } from "./session-labels.js";

type Injected = ProfilesActions & { hooks: { profiles: ProfilesController["store"] }; readProfileView: ProfilesController["store"]["getSnapshot"] };
export type SessionProfilesProps = InjectFace<Injected> & PropsLocale<"settings.dsmm-profiles"> & { sessionId?: string };

const MENU_ISSUE_CODES = new Set(["validation", "conflict", "not-found", "lock-timeout", "unsafe-path", "io", "activation", "corrupt-selection", "limit", "busy", "maintenance", "disposed", "not-owned", "unavailable", "cancelled", "model-unconfigured", "model-choice-changed", "model-service-unavailable", "model-observation-unavailable", "model-selection-failed"]);
const MENU_ROLE_FIELD = /^(?:settings\.roleRouting\.)?dsmm-(?:orchestrator|planner|plan-critic|builder|reviewer|oracle|oracle-2nd|creative|code-search|doc-search|clarifier|media-reader)(?:\.(?:primary|fallbackRoutes)(?:\[[0-7]\])?(?:\.(?:provider|model|reasoningEffort))?|\.strategy|\.rateLimit(?:\.(?:maxRetries|initialDelayMs|maxDelayMs|maxTotalDelayMs|switchAfterRateLimits|maxSwitches))?)?$/u;
const MENU_COMMON_FIELD = /^(?:version|id|label|content|sessionId|expectedRevision|expectedSelectionRevision|expectedAdmissionEpoch|settings(?:\.(?:defaultActive|roleRouting|workflow|guards|runtimeRecovery|runtimePolicy))?)$/u;
function menuIssue(issue: ProfilesIssue): { code: string; field?: string } {
  const code = MENU_ISSUE_CODES.has(issue.code) ? issue.code : issue.kind === "transport" ? "transport" : "unavailable";
  const field = issue.field;
  // Only closed configuration grammar is displayable; never echo messages,
  // arbitrary wire fields, provider identifiers, credentials or file paths.
  return { code, ...(typeof field === "string" && field.length <= 128 && (MENU_ROLE_FIELD.test(field) || MENU_COMMON_FIELD.test(field)) ? { field } : {}) };
}

export function SessionScope({ state, actions, t, compact = false }: PropsLocale<"settings.dsmm-profiles"> & {
  state: ProfilesViewSnapshot; actions: ProfilesActions; compact?: boolean;
}) {
  const prefix = useId();
  const session = state.session;
  const labels = session === null ? null : sessionProfileLabels(session, t);
  const selected = state.snapshot?.profiles.find((profile) => profile.id === state.sessionChoice);
  const disabled = state.busy !== null || state.pendingEditor !== null || state.sessionBusy !== null || state.dirty;
  const allowed = session !== null && session.switchAllowed && /^[a-f0-9]{64}$|^absent$/u.test(session.selection.selectionRevision);
  const status = state.sessionNotice === null ? "" : t(state.sessionNotice === "mode-on" ? "headerModeOn" : state.sessionNotice === "mode-off" ? "headerModeOff" : state.sessionNotice === "applied-with-model" ? "sessionAppliedWithModel" : state.sessionNotice === "applied" ? "sessionApplied" : "sessionResetDone");
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

/** Root-scoped native menu; an explicitly scoped foreign occurrence still refuses. */
export function SessionProfiles(props: SessionProfilesProps) {
  const prefix = useId();
  const state = props.useProfiles((snapshot: ProfilesViewSnapshot) => snapshot);
  const id = state.currentSessionId;
  const [openFor, setOpenFor] = useState<string | null | undefined>(undefined);
  useEffect(() => { setOpenFor(undefined); }, [id]);
  if (props.sessionId !== undefined && props.sessionId !== id) return null;
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
  if (state.sessionIssue !== null) feedback = t(state.sessionIssue.source === "profile-model" ? state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed"
    : state.sessionIssue.code === "conflict" ? "headerConflict" : state.sessionIssue.code === "activation" ? "headerActivationRefused"
    : state.sessionIssue.code === "maintenance" ? "headerMaintenanceRefused" : state.sessionIssue.code === "busy" ? "headerBusyRefused"
    : state.sessionIssue.code === "cancelled" ? "headerCancelledRefused" : state.sessionIssue.code === "unavailable" || state.sessionIssue.kind === "assembly" ? "headerUnavailableRefused" : "headerSelectionRefused");
  else if (committing || state.busy !== null) feedback = t(state.sessionBusy === "apply" || state.sessionBusy === "reset" ? "headerApplying" : "headerLoading");
  else if (state.dirty || state.invalidFields.length > 0 || state.pendingEditor !== null) feedback = t("headerDraft");
  else if (id === null) feedback = t("headerNoSession");
  else if (session === null || state.snapshot === null) feedback = t("headerUnavailable");
  else if (!session.switchAllowed) feedback = t("headerBusy");
  else if (state.sessionNotice !== null) feedback = t(state.sessionNotice === "mode-on" ? "headerModeOn" : state.sessionNotice === "mode-off" ? "headerModeOff" : state.sessionNotice === "applied-with-model" ? "headerAppliedWithModel" : "headerApplied");
  const profileName = unknownCaptured ? t("headerCaptured") : currentSaved?.label === undefined ? admission?.selectedId ?? t("sessionBaseline") : `${currentSaved.label} (${currentSaved.id})`;
  const currentLabel = t("headerCurrentProfile", { profile: session === null ? t("headerUnavailable") : profileName });
  const entries: MenuEntry[] = [{ type: "label", id: "@current", text: currentLabel }];
  if (id === null && state.snapshot !== null) entries.push({ type: "label", id: "@future", text: t("sessionFutureDefault", { profile: state.snapshot.profiles.find((profile) => profile.id === state.snapshot!.selectedId)?.label ?? state.snapshot.selectedId ?? t("sessionBaseline") }) });
  if (feedback !== "" && (state.sessionNotice === null || state.sessionIssue !== null)) entries.push({ type: "label", id: "@status", text: feedback });
  const mode = session?.deepwork;
  entries.push({ id: "@mode", label: t(mode === undefined ? "headerModeUnavailable" : mode.locked ? "headerModePreset" : mode.active ? "headerModeDisable" : "headerModeEnable"),
    disabled: id === null || committing || state.busy !== null || session === null || !session.switchAllowed || mode === undefined || mode.locked });
  const diagnostic = state.sessionIssue === null ? null : menuIssue(state.sessionIssue);
  const diagnosticText = diagnostic === null ? "" : t("headerIssueCode", { code: diagnostic.code }) + (diagnostic.field === undefined ? "" : ` ${t("headerIssueField", { field: diagnostic.field })}`);
  const retryHint = t(diagnostic?.code === "maintenance" || diagnostic?.code === "busy" ? "headerWaitRetryHint" : "headerRetryHint");
  if (diagnostic !== null) entries.push({ type: "label", id: "@diagnostic", text: diagnosticText }, { type: "label", id: "@retry", text: retryHint });
  if (admission?.selectedId != null && currentSaved === undefined) entries.push({ id: admission.selectedId, label: `${admission.selectedId} — ${t("headerSavedUnavailable")}`, disabled: true });
  if (unknownCaptured) entries.push({ id: "__dsmm_captured_default__", label: t("headerCaptured"), disabled: true });
  entries.push({ type: "separator", id: "@keep-separator" }, { type: "label", id: "@keep-heading", text: t("headerCompactProfiles") }, { id: "", label: t("sessionBaseline"), disabled });
  for (const profile of profiles) entries.push({ id: profile.id, label: (profile.label ?? profile.id) + (profile.error === undefined && profile.revision !== null ? "" : ` — ${t("headerSavedUnavailable")}`), disabled: disabled || profile.revision === null || profile.error !== undefined });
  entries.push({ type: "separator", id: "@model-separator" }, { id: "@use-model", label: t("headerUseCurrentModel"), disabled: disabled || session?.profileModel === undefined });
  const open = openFor === id;
  return <div className="dsmm-header-profiles" data-dsmm-header-profile aria-busy={committing}>
    <Menu open={open} autoFocus portal align="start" className="dsmm-profile-anchor" listClassName="dsmm-profile-menu" items={entries} selectedId={current}
      footer={[{ id: "@refresh", label: t("headerCompactRefresh"), disabled: committing || state.busy !== null }]}
      anchor={<Button type="button" size="sm" variant="toolbar" className="dsmm-profile-trigger" icon={<IconBranchOutlineRegular />} aria-label={t("headerProfileLabel")} aria-haspopup="menu" aria-expanded={open} aria-describedby={`${prefix}-feedback`} onClick={() => setOpenFor(open ? undefined : id)} />}
      onClose={() => setOpenFor(undefined)} onSelect={(value) => {
        if (props.readProfileView().currentSessionId !== id) return;
        if (value === "@refresh") {
          if (committing || state.busy !== null) return;
          void (async () => { await props.refresh(); if (id !== null && props.readProfileView().currentSessionId === id) await props.refreshSession(); })();
        } else {
          const row = entries.find((entry) => entry.id === value && !("type" in entry));
          if (row === undefined || !("disabled" in row) || row.disabled) return;
          if (value === "@mode") { if (mode !== undefined) void props.setDeepwork(!mode.active); }
          else if (value === "@use-model") void props.useSessionProfileModel();
          else { props.chooseSessionProfile(value || null); void props.applySession(); }
        }
        setOpenFor(undefined);
      }} />
    <span className="dsmm-profile-announcement" id={`${prefix}-feedback`} role={state.sessionIssue === null ? "status" : "alert"} aria-live="polite" aria-atomic="true">{feedback || currentLabel}{diagnostic === null ? "" : ` ${diagnosticText} ${retryHint}`}</span>
  </div>;
}
