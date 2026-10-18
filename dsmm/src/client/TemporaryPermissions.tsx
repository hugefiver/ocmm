import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type { TemporaryPermissionDuration, TemporaryPermissionGrantView, TemporaryPermissionRemote, TemporaryPermissionRequestView } from "../permission-temporary-types.js";
import { answerWithTemporaryPermit, pendingDelivery, retainAndAnswer, temporaryPermissionClient } from "./temporary-permission-client.js";
import { PERMISSIONS_NS } from "./permission-locales.js";
import type { TemporaryPendingApproval } from "./temporary-permission-client.js";
type Locale = PropsLocale<"settings.dsmm-permissions">;
const durations: readonly TemporaryPermissionDuration[] = ["once", "session", "15min", "1h"];
/** Parent mounts after native approval UI and registers the existing permission dictionaries. */
export function registerTemporaryPermissionSlots(ctx: Context, connection: ConnectionHandle): void {
  const lifetime = new AbortController(); ctx.effect(() => () => lifetime.abort());
  ctx.slots.inject("conversation.composer", () => ctx.slots.register({
    name: "conversation.approval.permissions", priority: 0, locale: PERMISSIONS_NS,
  }, function PermissionSlot(props) {
    const remote = useMemo(() => temporaryPermissionClient(connection, lifetime.signal), [props.pending]);
    const child = props.useSession(snapshot => snapshot.subagent !== undefined);
    return <TemporaryApproval key={props.pending.key} pending={props.pending} remote={remote} t={props.t} child={child} />;
  }));
}

/** Render beside the native prompt, never replace its approve/reject/cancel controls. */
export function TemporaryApproval({ pending, remote, t, child = false }: Locale & { pending: TemporaryPendingApproval; remote: TemporaryPermissionRemote; child?: boolean }) {
  const id = useId(), [view, setView] = useState<TemporaryPermissionRequestView>(), [duration, setDuration] = useState<TemporaryPermissionDuration>("once");
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const [scope, setScope] = useState("exact");
  const identity = useRef({ pending, remote, active: true });
  if (identity.current.pending !== pending || identity.current.remote !== remote) identity.current = { pending, remote, active: true };
  const captured = identity.current, isCurrent = () => captured.active && identity.current === captured;
  useEffect(() => {
    let current = true; setView(undefined); setDuration("once"); setScope("exact"); setError(false); setBusy(false);
    const delivery = pendingDelivery(pending);
    if (delivery) void remote.request(pending.sessionId, delivery).then(async value => {
      if (!current) return;
      setView(value);
      if (value.reusable) await answerWithTemporaryPermit(pending, remote, () => current);
    }).catch(() => { if (current) setError(true); });
    captured.active = true;
    return () => { current = false; captured.active = false; };
  }, [pending, remote]);
  if (!pendingDelivery(pending)) return null;
  return <section className="dsmm-structured" aria-label={t("temporaryTitle")} aria-busy={busy}>
    {view && <><p>{view.summary}</p><div className="dsmm-field"><label htmlFor={id}>{t("temporaryDuration")}</label>
      <select id={id} value={duration} disabled={busy || !pending.answerable} onChange={event => {
        const value = durations.find(value => value === event.currentTarget.value); if (value) setDuration(value);
      }}>{durations.filter(value => view.reusable || value === "once").map(value => <option key={value} value={value}>{t(child && value === "session" ? "temporaryChildSession" : `temporary:${value}`)}</option>)}</select></div>
      {!!view.scopes?.length && duration !== "once" && <div className="dsmm-field"><label htmlFor={`${id}-scope`}>{t("pathScope")}</label>
        <select id={`${id}-scope`} value={scope} disabled={busy || !pending.answerable} onChange={event => setScope(event.currentTarget.value)}>
          <option value="exact">{view.summary}</option>{view.scopes.map(choice => <option key={choice.id} value={choice.id}>{choice.summary}</option>)}
        </select></div>}
      <Button variant="primary" disabled={busy || !pending.answerable} onClick={() => {
        setBusy(true); setError(false);
        void retainAndAnswer(pending, remote, duration, isCurrent, scope).catch(() => { if (isCurrent()) setError(true); }).finally(() => { if (isCurrent()) setBusy(false); });
      }}>{t("temporaryApprove")}</Button></>}
    <p className="dsmm-hint">{t("temporaryBoundary")}</p>
    {view?.tool === "web_fetch" && <p className="dsmm-hint">{t("temporaryWebBoundary")}</p>}
    {error && <p className="dsmm-issue" role="alert">{t("temporaryUnavailable")}</p>}
  </section>;
}
export function TemporaryGrants({ sessionId, remote, t, child = false }: Locale & { sessionId: string; remote: TemporaryPermissionRemote; child?: boolean }) {
  const [grants, setGrants] = useState<readonly TemporaryPermissionGrantView[]>(), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const identity = useRef({ sessionId, remote, active: true });
  if (identity.current.sessionId !== sessionId || identity.current.remote !== remote) identity.current = { sessionId, remote, active: true };
  const captured = identity.current, current = () => captured.active && identity.current === captured;
  const accept = (value: readonly TemporaryPermissionGrantView[]) => { if (current()) setGrants(value); };
  const fail = () => { if (current()) setError(true); };
  const finish = () => { if (current()) setBusy(false); };
  useEffect(() => { let current = true; setGrants(undefined); setError(false);
    void remote.describe(sessionId).then(value => { if (current) setGrants(value); }).catch(() => { if (current) setError(true); });
    captured.active = true;
    return () => { current = false; captured.active = false; };
  }, [sessionId, remote]);
  return <section className="dsmm-zone" aria-label={t("temporaryTitle")} aria-busy={busy}><h3>{t("temporaryTitle")}</h3>
    {grants?.length === 0 && <p>{t("temporaryEmpty")}</p>}
    {grants?.map(grant => <fieldset key={grant.id}><legend>{grant.tool}</legend><p>{grant.summary}</p><p>{t(child && grant.duration === "session" ? "temporaryChildSession" : `temporary:${grant.duration}`)}</p>
      {grant.tool === "web_fetch" && <p className="dsmm-hint">{t("temporaryWebBoundary")}</p>}
      <Button variant="outline" disabled={busy} onClick={() => { setBusy(true); setError(false);
        void remote.revoke(sessionId, grant.id).then(accept).catch(fail).finally(finish);
      }}>{t("temporaryRevoke")}</Button></fieldset>)}
    <Button variant="outline" disabled={busy} onClick={() => { setBusy(true); setError(false);
      void remote.describe(sessionId).then(accept).catch(fail).finally(finish);
    }}>{t("temporaryRefresh")}</Button>
    {error && <p className="dsmm-issue" role="alert">{t("temporaryUnavailable")}</p>}
    <p className="dsmm-hint">{t("temporaryBoundary")}</p></section>;
}
