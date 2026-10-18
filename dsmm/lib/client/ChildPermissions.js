import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { temporaryPermissionClient } from "./temporary-permission-client.js";
import { TemporaryGrants } from "./TemporaryPermissions.js";
import { PERMISSIONS_NS } from "./permission-locales.js";
function NativeChildApproval(props) {
    const { active, uiSession, SessionProvider } = props;
    const session = useSyncExternalStore(listener => active.binding.session.subscribe(listener), () => active.binding.session.getSnapshot());
    const statuses = useSyncExternalStore(listener => uiSession.sessionStatus.subscribe(listener), () => uiSession.sessionStatus.getSnapshot());
    if (!props.current())
        return _jsx("p", { className: "dsmm-hint", children: props.t("childUnavailable") });
    return _jsx(SessionProvider, { session: active.reference, children: props.renderSlotChain("conversation.composer", {
            sessionId: active.binding.sessionId, session, pendingInteraction: statuses.get(active.binding.sessionId)?.pendingInteraction,
        }, { fallback: _jsx("p", { className: "dsmm-hint", children: props.t("childNoPending") }) }) });
}
/** Direct-child card action. Retention is Client-only; it never keeps the Host child alive. */
export function ChildPermissions(props) {
    const id = useId(), trigger = useRef(null), heading = useRef(null);
    const generation = useSyncExternalStore(listener => props.connection.generation.subscribe(listener), () => props.connection.generation.getSnapshot());
    useSyncExternalStore(listener => props.sessions.list.subscribe(listener), () => props.sessions.list.getSnapshot());
    const identity = useMemo(() => ({}), [props.parentSessionId, props.child.id, props.sessions, props.uiSession, props.connection, generation]);
    const latest = useRef(identity);
    latest.current = identity;
    const [open, setOpen] = useState(false), [refresh, setRefresh] = useState(0), [active, setActive] = useState();
    const [view, setView] = useState(), [busy, setBusy] = useState(false), [error, setError] = useState(false);
    const current = () => !!active && active.identity === identity && latest.current === identity && !active.signal.aborted
        && props.connection.generation.getSnapshot() === generation && props.sessions.binding(active.binding.sessionId) === active.binding
        && active.binding.session.getSnapshot().openState === "open" && !active.binding.session.getSnapshot().removed;
    useEffect(() => {
        setActive(undefined);
        setView(undefined);
        setBusy(false);
        setError(false);
        if (!open || generation === undefined)
            return;
        const abort = new AbortController();
        const reference = props.sessions.retain({ parentSessionId: props.parentSessionId,
            childSessionId: props.child.id, mode: "continuable" }, { source: "dsmmChildPermissions", signal: abort.signal });
        const remote = temporaryPermissionClient(props.connection, abort.signal);
        void reference.ready.then(async (binding) => {
            if (abort.signal.aborted || latest.current !== identity)
                return;
            if (props.sessions.scopeOf(binding.ctx) !== props.child.id || props.sessions.binding(binding.sessionId) !== binding)
                throw new Error("Native child scope changed.");
            setActive({ identity, reference, binding, remote, signal: abort.signal });
            const value = await remote.child(props.parentSessionId, props.child.id);
            if (!abort.signal.aborted && latest.current === identity && props.sessions.binding(binding.sessionId) === binding)
                setView(value);
        }).catch(() => { if (!abort.signal.aborted && latest.current === identity)
            setError(true); });
        return () => { abort.abort(); reference.release(); };
    }, [identity, open, refresh]);
    useEffect(() => { if (open)
        heading.current?.focus(); }, [open]);
    if (props.child.mode !== "continuable" || props.child.parentSessionId !== props.parentSessionId)
        return null;
    const available = current() && !busy && view?.parentSessionId === props.parentSessionId && view.childSessionId === props.child.id;
    async function change(operation) {
        if (!available || !active)
            return;
        const captured = active;
        setBusy(true);
        setError(false);
        try {
            const value = await captured.remote[operation](props.parentSessionId, props.child.id);
            if (latest.current === identity && !captured.signal.aborted)
                setView(value);
        }
        catch {
            if (latest.current === identity && !captured.signal.aborted) {
                setView(undefined);
                setError(true);
            }
        }
        finally {
            if (latest.current === identity && !captured.signal.aborted)
                setBusy(false);
        }
    }
    return _jsxs("div", { className: "dsmm-child-permissions", children: [_jsx(Button, { ref: trigger, type: "button", variant: "outline", "aria-expanded": open, "aria-controls": id, onClick: () => {
                    if (open) {
                        setOpen(false);
                        trigger.current?.focus();
                    }
                    else
                        setOpen(true);
                }, children: props.t("childPermissions") }), open && _jsxs("section", { id: id, className: "dsmm-zone", "aria-labelledby": `${id}-heading`, "aria-busy": busy, children: [_jsx("h3", { id: `${id}-heading`, ref: heading, tabIndex: -1, children: props.child.label ?? props.child.id }), _jsx("p", { children: props.child.id }), _jsx("p", { className: "dsmm-hint", children: props.t("childPermissionBoundary") }), view && _jsxs(_Fragment, { children: [_jsxs("p", { children: [props.t("childProject"), ": ", view.project] }), _jsxs("p", { children: [props.t("childRole"), ": ", view.role ?? props.t("unknown"), view.readOnly ? ` · ${props.t("childReadOnly")}` : ""] }), _jsx("p", { role: "status", "aria-live": "polite", children: props.t(view.state === "enabled" ? "childEnabled" : view.state === "disabled" ? "childDisabled" : "childUnavailable") })] }), (!current() || !view) && !error && _jsx("p", { role: "status", children: props.t(generation === undefined ? "childUnavailable" : "reading") }), error && _jsx("p", { className: "dsmm-issue", role: "alert", children: props.t("childUnconfirmed") }), _jsxs("div", { className: "dsmm-actions", children: [_jsx(Button, { type: "button", variant: "primary", disabled: !available || !view?.canEnable || view.state === "enabled", onClick: () => void change("enableChild"), children: props.t("childEnable") }), _jsx(Button, { type: "button", variant: "outline", disabled: !available || !view?.canRevoke, onClick: () => void change("revokeChild"), children: props.t("childRevoke") }), _jsx(Button, { type: "button", variant: "outline", disabled: busy || generation === undefined, onClick: () => setRefresh(value => value + 1), children: props.t("temporaryRefresh") })] }), active?.identity === identity && current() && _jsxs(_Fragment, { children: [_jsx(NativeChildApproval, { ...props, active: active, current: current }), view?.state === "enabled" && _jsx(TemporaryGrants, { sessionId: props.child.id, remote: active.remote, t: props.t, child: true })] })] })] });
}
export const CHILD_PERMISSION_SLOTS = { "conversation.dsmm-child-permissions": { kind: "list", scope: "root" } };
export function registerChildPermissionEntry(ctx) {
    void ctx.inject(["sessions", "uiSession", "connection"], scope => {
        scope.slots.inject("conversation.dsmm-child-permissions", () => scope.slots.register({
            name: "conversation.dsmm-child-permissions", id: "dsmm-child-permissions", locale: PERMISSIONS_NS,
            children: { "conversation.composer": { kind: "chain", scope: "session" } },
            inject: () => ({ sessions: scope.sessions, uiSession: scope.uiSession, connection: scope.connection }),
        }, ChildPermissions));
    });
}
//# sourceMappingURL=ChildPermissions.js.map