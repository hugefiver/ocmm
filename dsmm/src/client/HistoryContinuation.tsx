import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { HistoryContinuationController } from "./history-controller.js";
import type { HistoryPreview } from "../history-types.js";
import { historyLocales } from "./history-locales.js";

/** Additive continuation controls; this component never opens, replaces, or clears native history. */
export function HistoryContinuation({ controller, locale = "en" }: { controller: HistoryContinuationController; locale?: "en" | "zh" }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const t = historyLocales[locale], id = useId();
  const [preset, setPreset] = useState(""), [profile, setProfile] = useState("");
  const proposal = state.preview;
  const [consent, setConsent] = useState<{ proposal: HistoryPreview | null; pending: boolean; migration: boolean }>({ proposal: null, pending: false, migration: false });
  const pending = consent.proposal === proposal && consent.pending, migration = consent.proposal === proposal && consent.migration;
  useEffect(() => { setPreset(""); setProfile(""); }, [state.sessionId, controller]);
  const busy = ["loading", "previewing", "confirming"].includes(state.phase);
  const selectable = state.phase === "ready" && state.status?.execution === "authorization-required" && state.status.compatibleHost && state.choices !== null;
  const selectedMatches = proposal?.candidate.preset.id === preset && (proposal?.candidate.profile?.id ?? "") === profile;
  const reason = state.issue?.code ?? (state.status?.compatibleHost === false ? "unsupported-host" : state.status?.reason);
  const notice = state.phase === "disconnected" ? t.disconnected : state.phase === "loading" ? t.loading : state.phase === "previewing" ? t.preparing
    : state.phase === "confirming" || state.status?.execution === "activating" ? t.confirming : state.phase === "unknown" ? t.unknown : state.status?.execution === "active" ? t.active : t.browsing;
  return <section className="dsmm-profiles" aria-labelledby={`${id}-heading`} aria-busy={busy} data-dsmm-history-continuation>
    <div className="dsmm-session-scope">
      <h3 id={`${id}-heading`}>{t.title}</h3>
      <p role="status">{notice}</p>
      {reason && <p role="alert">{t.reasons[reason]}</p>}
      {state.issue?.storageEffects === "may-have-committed" && <p>{t.effects}</p>}
      {selectable && <>
        <div className="dsmm-field"><label htmlFor={`${id}-preset`}>{t.preset}</label><select id={`${id}-preset`} value={preset} onChange={event => setPreset(event.currentTarget.value)}>
          <option value="">{t.choose}</option>{state.choices!.presets.map(row => <option key={row.id} value={row.id}>{row.label || row.id}</option>)}
        </select></div>
        <div className="dsmm-field"><label htmlFor={`${id}-profile`}>{t.profile}</label><select id={`${id}-profile`} value={profile} onChange={event => setProfile(event.currentTarget.value)}>
          <option value="">{t.baseline}</option>{state.choices!.profiles.map(row => <option key={row.id} value={row.id}>{row.label || row.id}</option>)}
        </select></div>
        <div className="dsmm-actions"><Button type="button" variant="outline" disabled={!preset || !state.choices!.presets.some(row => row.id === preset)} onClick={() => { void controller.preview(state, preset, profile || null); }}>{t.preview}</Button></div>
      </>}
      {proposal && selectedMatches && <div className="dsmm-session-scope" aria-labelledby={`${id}-proposal`}>
        <h4 id={`${id}-proposal`}>{t.candidate}</h4>
        <p>{proposal.candidate.preset.label || proposal.candidate.preset.id} · {proposal.candidate.profile?.label || proposal.candidate.profile?.id || t.baseline}</p>
        <p>{t.project}: {proposal.cwd}</p>
        <p>{t.model}: {proposal.candidate.model.provider}/{proposal.candidate.model.model}{proposal.candidate.model.reasoningEffort ? ` (${proposal.candidate.model.reasoningEffort})` : ""}</p>
        <p>{t.roles}: {proposal.candidate.roles.map(row => row.label || row.id).join(", ")}</p>
        <div><h4>{t.permissions}</h4><ul>{proposal.candidate.restrictions.map((text, index) => <li key={index}>{text}</li>)}</ul></div>
        {proposal.candidate.differences.length > 0 && <div><h4>{t.differences}</h4><ul>{proposal.candidate.differences.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
        <div className="dsmm-field"><h4>{t.pending}</h4><p id={`${id}-pending-hint`}>{t.pendingWarning}</p>
          {proposal.pending.nextTurn.length === 0 && proposal.pending.nextStep.length === 0 ? <p>{t.noPending}</p> : <>
            <label htmlFor={`${id}-next-turn`}>{t.nextTurn}</label><textarea id={`${id}-next-turn`} rows={5} readOnly value={JSON.stringify(proposal.pending.nextTurn, null, 2)} />
            <label htmlFor={`${id}-next-step`}>{t.nextStep}</label><textarea id={`${id}-next-step`} rows={5} readOnly value={JSON.stringify(proposal.pending.nextStep, null, 2)} />
          </>}
          <label><input type="checkbox" checked={pending} disabled={busy} aria-describedby={`${id}-pending-hint`} onChange={event => setConsent({ proposal, pending: event.currentTarget.checked, migration })} /> {t.consent}</label>
          {proposal.migrationRequired && <label><input type="checkbox" checked={migration} disabled={busy} onChange={event => setConsent({ proposal, pending, migration: event.currentTarget.checked })} /> {t.migration}</label>}
        </div>
        <div className="dsmm-actions"><Button type="button" disabled={busy || state.phase !== "ready" || !pending || proposal.migrationRequired && !migration} onClick={() => { void controller.confirm(state, pending, migration); }}>{t.confirm}</Button></div>
      </div>}
      <div className="dsmm-actions"><Button type="button" variant="outline" disabled={busy || state.phase === "disconnected"} onClick={() => { void controller.refresh(state); }}>{t.refresh}</Button></div>
    </div>
  </section>;
}
