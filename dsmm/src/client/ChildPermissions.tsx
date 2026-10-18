import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { Context } from "@deepseek-ai/cordis";
import type { PropsLocale, PropsRenderSlots } from "@deepseek-ai/dsh-client-ui-slots";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type { ISessions, SessionBinding, SessionReference } from "@deepseek-ai/dsh-api-session-controller/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { UiSession } from "@deepseek-ai/dsh-client-ui-session/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type { RoleControlChildView } from "../role-control-types.js";
import type { ChildPermissionView } from "../permission-temporary-types.js";
import { temporaryPermissionClient } from "./temporary-permission-client.js";
import { TemporaryGrants } from "./TemporaryPermissions.js";
import { PERMISSIONS_NS } from "./permission-locales.js";

interface Owner { parentSessionId: string; child: RoleControlChildView }
interface Services { sessions: ISessions; uiSession: UiSession; connection: ConnectionHandle }
type Locale = PropsLocale<typeof PERMISSIONS_NS>;
type Composer = PropsRenderSlots<"conversation.composer">;
interface Active {
  readonly identity: object; readonly reference: SessionReference; readonly binding: SessionBinding;
  readonly remote: ReturnType<typeof temporaryPermissionClient>; readonly signal: AbortSignal;
}

function NativeChildApproval(props: Composer & Locale & { active: Active; uiSession: UiSession; current(): boolean }) {
  const { active, uiSession, SessionProvider } = props;
  const session = useSyncExternalStore(listener => active.binding.session.subscribe(listener), () => active.binding.session.getSnapshot());
  const statuses = useSyncExternalStore(listener => uiSession.sessionStatus.subscribe(listener), () => uiSession.sessionStatus.getSnapshot());
  if (!props.current()) return <p className="dsmm-hint">{props.t("childUnavailable")}</p>;
  return <SessionProvider session={active.reference}>{props.renderSlotChain("conversation.composer", {
    sessionId: active.binding.sessionId, session, pendingInteraction: statuses.get(active.binding.sessionId)?.pendingInteraction,
  }, { fallback: <p className="dsmm-hint">{props.t("childNoPending")}</p> })}</SessionProvider>;
}

/** Direct-child card action. Retention is Client-only; it never keeps the Host child alive. */
export function ChildPermissions(props: Owner & Services & Composer & Locale) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const generation = useSyncExternalStore(listener => props.connection.generation.subscribe(listener), () => props.connection.generation.getSnapshot());
  useSyncExternalStore(listener => props.sessions.list.subscribe(listener), () => props.sessions.list.getSnapshot());
  const identity = useMemo(() => ({}), [props.parentSessionId, props.child.id, props.sessions, props.uiSession, props.connection, generation]);
  const latest = useRef(identity); latest.current = identity;
  const [open, setOpen] = useState(false), [refresh, setRefresh] = useState(0), [active, setActive] = useState<Active>();
  const [view, setView] = useState<ChildPermissionView>(), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const current = () => !!active && active.identity === identity && latest.current === identity && !active.signal.aborted
    && props.connection.generation.getSnapshot() === generation && props.sessions.binding(active.binding.sessionId) === active.binding
    && active.binding.session.getSnapshot().openState === "open" && !active.binding.session.getSnapshot().removed;
  useEffect(() => {
    setActive(undefined); setView(undefined); setBusy(false); setError(false);
    if (!open || generation === undefined) return;
    const abort = new AbortController();
    const reference = props.sessions.retain({ parentSessionId: props.parentSessionId as SessionId,
      childSessionId: props.child.id as SessionId, mode: "continuable" }, { source: "dsmmChildPermissions", signal: abort.signal });
    const remote = temporaryPermissionClient(props.connection, abort.signal);
    void reference.ready.then(async binding => {
      if (abort.signal.aborted || latest.current !== identity) return;
      if (props.sessions.scopeOf(binding.ctx) !== props.child.id || props.sessions.binding(binding.sessionId) !== binding) throw new Error("Native child scope changed.");
      setActive({ identity, reference, binding, remote, signal: abort.signal });
      const value = await remote.child(props.parentSessionId, props.child.id);
      if (!abort.signal.aborted && latest.current === identity && props.sessions.binding(binding.sessionId) === binding) setView(value);
    }).catch(() => { if (!abort.signal.aborted && latest.current === identity) setError(true); });
    return () => { abort.abort(); reference.release(); };
  }, [identity, open, refresh]);
  useEffect(() => { if (open) heading.current?.focus(); }, [open]);
  if (props.child.mode !== "continuable" || props.child.parentSessionId !== props.parentSessionId) return null;
  const available = current() && !busy && view?.parentSessionId === props.parentSessionId && view.childSessionId === props.child.id;
  async function change(operation: "enableChild" | "revokeChild") {
    if (!available || !active) return;
    const captured = active; setBusy(true); setError(false);
    try {
      const value = await captured.remote[operation](props.parentSessionId, props.child.id);
      if (latest.current === identity && !captured.signal.aborted) setView(value);
    } catch { if (latest.current === identity && !captured.signal.aborted) { setView(undefined); setError(true); } }
    finally { if (latest.current === identity && !captured.signal.aborted) setBusy(false); }
  }
  return <div className="dsmm-child-permissions">
    <Button ref={trigger} type="button" variant="outline" aria-expanded={open} aria-controls={id} onClick={() => {
      if (open) { setOpen(false); trigger.current?.focus(); } else setOpen(true);
    }}>{props.t("childPermissions")}</Button>
    {open && <section id={id} className="dsmm-zone" aria-labelledby={`${id}-heading`} aria-busy={busy}>
      <h3 id={`${id}-heading`} ref={heading} tabIndex={-1}>{props.child.label ?? props.child.id}</h3>
      <p>{props.child.id}</p><p className="dsmm-hint">{props.t("childPermissionBoundary")}</p>
      {view && <><p>{props.t("childProject")}: {view.project}</p><p>{props.t("childRole")}: {view.role ?? props.t("unknown")}{view.readOnly ? ` · ${props.t("childReadOnly")}` : ""}</p>
        <p role="status" aria-live="polite">{props.t(view.state === "enabled" ? "childEnabled" : view.state === "disabled" ? "childDisabled" : "childUnavailable")}</p></>}
      {(!current() || !view) && !error && <p role="status">{props.t(generation === undefined ? "childUnavailable" : "reading")}</p>}
      {error && <p className="dsmm-issue" role="alert">{props.t("childUnconfirmed")}</p>}
      <div className="dsmm-actions">
        <Button type="button" variant="primary" disabled={!available || !view?.canEnable || view.state === "enabled"} onClick={() => void change("enableChild")}>{props.t("childEnable")}</Button>
        <Button type="button" variant="outline" disabled={!available || !view?.canRevoke} onClick={() => void change("revokeChild")}>{props.t("childRevoke")}</Button>
        <Button type="button" variant="outline" disabled={busy || generation === undefined} onClick={() => setRefresh(value => value + 1)}>{props.t("temporaryRefresh")}</Button>
      </div>
      {active?.identity === identity && current() && <>
        <NativeChildApproval {...props} active={active} current={current} />
        {view?.state === "enabled" && <TemporaryGrants sessionId={props.child.id} remote={active.remote} t={props.t} child />}
      </>}
    </section>}
  </div>;
}

export const CHILD_PERMISSION_SLOTS = { "conversation.dsmm-child-permissions": { kind: "list", scope: "root" } } as const;
export function registerChildPermissionEntry(ctx: Context): void {
  void ctx.inject(["sessions", "uiSession", "connection"], scope => {
    scope.slots.inject("conversation.dsmm-child-permissions", () => scope.slots.register({
      name: "conversation.dsmm-child-permissions", id: "dsmm-child-permissions", locale: PERMISSIONS_NS,
      children: { "conversation.composer": { kind: "chain", scope: "session" } },
      inject: () => ({ sessions: scope.sessions as unknown as ISessions, uiSession: scope.uiSession, connection: scope.connection as unknown as ConnectionHandle }),
    }, ChildPermissions));
  });
}
declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap { "conversation.dsmm-child-permissions": { kind: "list"; scope: "root"; owner: Owner } }
}
declare module "@deepseek-ai/dsh-api-session-controller/client" { interface SessionReferenceSourceMap { dsmmChildPermissions: unknown } }
