import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { answerWithTemporaryPermit, pendingDelivery, retainAndAnswer, temporaryPermissionClient } from "./temporary-permission-client.js";
import { PERMISSIONS_NS } from "./permission-locales.js";
const durations = ["once", "session", "15min", "1h"];
/** Parent mounts after native approval UI and registers the existing permission dictionaries. */
export function registerTemporaryPermissionSlots(ctx, connection) {
    const lifetime = new AbortController();
    ctx.effect(() => () => lifetime.abort());
    ctx.slots.inject("conversation.composer", () => ctx.slots.register({
        name: "conversation.approval.permissions", priority: 0, locale: PERMISSIONS_NS,
    }, function PermissionSlot(props) {
        const remote = useMemo(() => temporaryPermissionClient(connection, lifetime.signal), [props.pending]);
        const child = props.useSession(snapshot => snapshot.subagent !== undefined);
        return _jsx(TemporaryApproval, { pending: props.pending, remote: remote, t: props.t, child: child }, props.pending.key);
    }));
}
/** Render beside the native prompt, never replace its approve/reject/cancel controls. */
export function TemporaryApproval({ pending, remote, t, child = false }) {
    const id = useId(), [view, setView] = useState(), [duration, setDuration] = useState("once");
    const [busy, setBusy] = useState(false), [error, setError] = useState(false);
    const [scope, setScope] = useState("exact");
    const identity = useRef({ pending, remote, active: true });
    if (identity.current.pending !== pending || identity.current.remote !== remote)
        identity.current = { pending, remote, active: true };
    const captured = identity.current, isCurrent = () => captured.active && identity.current === captured;
    useEffect(() => {
        let current = true;
        setView(undefined);
        setDuration("once");
        setScope("exact");
        setError(false);
        setBusy(false);
        const delivery = pendingDelivery(pending);
        if (delivery)
            void remote.request(pending.sessionId, delivery).then(async (value) => {
                if (!current)
                    return;
                setView(value);
                if (value.reusable)
                    await answerWithTemporaryPermit(pending, remote, () => current);
            }).catch(() => { if (current)
                setError(true); });
        captured.active = true;
        return () => { current = false; captured.active = false; };
    }, [pending, remote]);
    if (!pendingDelivery(pending))
        return null;
    return _jsxs("section", { className: "dsmm-structured", "aria-label": t("temporaryTitle"), "aria-busy": busy, children: [view && _jsxs(_Fragment, { children: [_jsx("p", { children: view.summary }), _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: id, children: t("temporaryDuration") }), _jsx("select", { id: id, value: duration, disabled: busy || !pending.answerable, onChange: event => {
                                    const value = durations.find(value => value === event.currentTarget.value);
                                    if (value)
                                        setDuration(value);
                                }, children: durations.filter(value => view.reusable || value === "once").map(value => _jsx("option", { value: value, children: t(child && value === "session" ? "temporaryChildSession" : `temporary:${value}`) }, value)) })] }), !!view.scopes?.length && duration !== "once" && _jsxs("div", { className: "dsmm-field", children: [_jsx("label", { htmlFor: `${id}-scope`, children: t("pathScope") }), _jsxs("select", { id: `${id}-scope`, value: scope, disabled: busy || !pending.answerable, onChange: event => setScope(event.currentTarget.value), children: [_jsx("option", { value: "exact", children: view.summary }), view.scopes.map(choice => _jsx("option", { value: choice.id, children: choice.summary }, choice.id))] })] }), _jsx(Button, { variant: "primary", disabled: busy || !pending.answerable, onClick: () => {
                            setBusy(true);
                            setError(false);
                            void retainAndAnswer(pending, remote, duration, isCurrent, scope).catch(() => { if (isCurrent())
                                setError(true); }).finally(() => { if (isCurrent())
                                setBusy(false); });
                        }, children: t("temporaryApprove") })] }), _jsx("p", { className: "dsmm-hint", children: t("temporaryBoundary") }), view?.tool === "web_fetch" && _jsx("p", { className: "dsmm-hint", children: t("temporaryWebBoundary") }), error && _jsx("p", { className: "dsmm-issue", role: "alert", children: t("temporaryUnavailable") })] });
}
export function TemporaryGrants({ sessionId, remote, t, child = false }) {
    const [grants, setGrants] = useState(), [busy, setBusy] = useState(false), [error, setError] = useState(false);
    const identity = useRef({ sessionId, remote, active: true });
    if (identity.current.sessionId !== sessionId || identity.current.remote !== remote)
        identity.current = { sessionId, remote, active: true };
    const captured = identity.current, current = () => captured.active && identity.current === captured;
    const accept = (value) => { if (current())
        setGrants(value); };
    const fail = () => { if (current())
        setError(true); };
    const finish = () => { if (current())
        setBusy(false); };
    useEffect(() => {
        let current = true;
        setGrants(undefined);
        setError(false);
        void remote.describe(sessionId).then(value => { if (current)
            setGrants(value); }).catch(() => { if (current)
            setError(true); });
        captured.active = true;
        return () => { current = false; captured.active = false; };
    }, [sessionId, remote]);
    return _jsxs("section", { className: "dsmm-zone", "aria-label": t("temporaryTitle"), "aria-busy": busy, children: [_jsx("h3", { children: t("temporaryTitle") }), grants?.length === 0 && _jsx("p", { children: t("temporaryEmpty") }), grants?.map(grant => _jsxs("fieldset", { children: [_jsx("legend", { children: grant.tool }), _jsx("p", { children: grant.summary }), _jsx("p", { children: t(child && grant.duration === "session" ? "temporaryChildSession" : `temporary:${grant.duration}`) }), grant.tool === "web_fetch" && _jsx("p", { className: "dsmm-hint", children: t("temporaryWebBoundary") }), _jsx(Button, { variant: "outline", disabled: busy, onClick: () => {
                            setBusy(true);
                            setError(false);
                            void remote.revoke(sessionId, grant.id).then(accept).catch(fail).finally(finish);
                        }, children: t("temporaryRevoke") })] }, grant.id)), _jsx(Button, { variant: "outline", disabled: busy, onClick: () => {
                    setBusy(true);
                    setError(false);
                    void remote.describe(sessionId).then(accept).catch(fail).finally(finish);
                }, children: t("temporaryRefresh") }), error && _jsx("p", { className: "dsmm-issue", role: "alert", children: t("temporaryUnavailable") }), _jsx("p", { className: "dsmm-hint", children: t("temporaryBoundary") })] });
}
//# sourceMappingURL=TemporaryPermissions.js.map