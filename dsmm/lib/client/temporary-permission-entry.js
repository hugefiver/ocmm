import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { registerTemporaryPermissionSlots } from "./TemporaryPermissions.js";
import { temporaryPermissionClient } from "./temporary-permission-client.js";
/** Approval slots belong to the connection generation; the drawer also borrows its exact current scope. */
export function registerTemporaryPermissionEntry(ctx, permissions) {
    const store = createSnapshotStore(undefined);
    void ctx.inject(["connection"], connectionCtx => {
        const connection = connectionCtx.connection;
        let generation = connection.generation.getSnapshot(), lifetime;
        let owner;
        let scopeLifetime, scopeKey = "";
        const bindScope = () => {
            const state = permissions.store.getSnapshot();
            const key = JSON.stringify([state.generation, state.sessionId, state.scope, state.connected]);
            if (key === scopeKey)
                return;
            scopeKey = key;
            scopeLifetime?.abort();
            scopeLifetime = undefined;
            store.set(undefined);
            if (!lifetime || lifetime.signal.aborted || !state.connected || state.sessionId === null || state.scope === "unknown")
                return;
            scopeLifetime = new AbortController();
            store.set(temporaryPermissionClient(connection, AbortSignal.any([lifetime.signal, scopeLifetime.signal])));
        };
        const update = () => {
            const next = connection.generation.getSnapshot();
            if (lifetime && generation === next)
                return;
            generation = next;
            lifetime?.abort();
            lifetime = undefined;
            scopeLifetime?.abort();
            scopeKey = "";
            void owner?.dispose();
            owner = undefined;
            store.set(undefined);
            if (next !== undefined) {
                const current = lifetime = new AbortController();
                owner = connectionCtx.plugin({ name: "dsmm-temporary-permission-generation", apply(ownerCtx) {
                        ownerCtx.effect(() => () => current.abort());
                        if (current.signal.aborted || connection.generation.getSnapshot() !== next)
                            return;
                        registerTemporaryPermissionSlots(ownerCtx, connection);
                    } });
            }
            bindScope();
        };
        update();
        connectionCtx.effect(() => connection.generation.subscribe(update));
        connectionCtx.effect(() => permissions.store.subscribe(bindScope));
        connectionCtx.effect(() => () => { lifetime?.abort(); scopeLifetime?.abort(); store.set(undefined); }, "dsmm: temporary permission connection lifetime");
    });
    return store;
}
//# sourceMappingURL=temporary-permission-entry.js.map