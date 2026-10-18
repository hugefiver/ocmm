import { TEMPORARY_PERMISSION_REMOTE, parseTemporaryGrants, parseTemporaryRequest, parseChildPermission } from "../permission-temporary-remote.js";
export function temporaryPermissionClient(connection, signal) {
    const generation = connection.generation.getSnapshot();
    const check = () => { signal.throwIfAborted(); if (connection.generation.getSnapshot() !== generation)
        throw new Error("Connection generation changed."); };
    async function call(method, args) {
        check();
        const result = await connection.rpc.call("/api", `dsmmTemporaryPermissions/${method}`, { args }, signal);
        check();
        if (!result.ok)
            throw new Error("Temporary permission service unavailable; use the native once-only prompt.");
        const descriptor = TEMPORARY_PERMISSION_REMOTE.descriptors.find(value => value.method === method);
        if (descriptor.result.mode !== "strict")
            throw new Error("Invalid permission protocol.");
        return descriptor.result.create().parse(result.value);
    }
    return {
        async describe(sessionId) { return parseTemporaryGrants(await call("describe", { sessionId })); },
        async request(sessionId, delivery) { return parseTemporaryRequest(await call("request", { sessionId, delivery })); },
        async retain(sessionId, delivery, duration, scope = "exact") { return String(await call("retain", { sessionId, delivery, duration, scope })); },
        async permit(sessionId, delivery) { const value = await call("permit", { sessionId, delivery }); return value === null ? null : String(value); },
        async revoke(sessionId, grantId) { return parseTemporaryGrants(await call("revoke", { sessionId, grantId })); },
        async child(sessionId, childSessionId) { return parseChildPermission(await call("child", { sessionId, childSessionId })); },
        async enableChild(sessionId, childSessionId) { return parseChildPermission(await call("enableChild", { sessionId, childSessionId })); },
        async revokeChild(sessionId, childSessionId) { return parseChildPermission(await call("revokeChild", { sessionId, childSessionId })); },
    };
}
export function pendingDelivery(pending) {
    return pending.requestId && pending.deliveryId ? { requestId: pending.requestId, deliveryId: pending.deliveryId } : undefined;
}
export async function retainAndAnswer(pending, remote, duration, current, scope = "exact") {
    if (!current() || !pending.answerable)
        return;
    const delivery = pendingDelivery(pending);
    let retention;
    if (duration !== "once") {
        if (!delivery)
            throw new Error("Scoped approval unsupported.");
        retention = await remote.retain(pending.sessionId, delivery, duration, scope);
    }
    if (current() && pending.answerable)
        await pending.answer("allowed-once", retention === undefined ? undefined : { retention });
}
export async function answerWithTemporaryPermit(pending, remote, current) {
    const delivery = pendingDelivery(pending);
    if (!delivery || !current() || !pending.answerable)
        return;
    const permit = await remote.permit(pending.sessionId, delivery);
    if (permit && current() && pending.answerable)
        await pending.answer("allowed-once", { permit });
}
//# sourceMappingURL=temporary-permission-client.js.map