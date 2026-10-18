import { jsx as _jsx } from "react/jsx-runtime";
import { useSyncExternalStore } from "react";
import { HistoryContinuation } from "./HistoryContinuation.js";
import { HistoryContinuationController } from "./history-controller.js";
import { historyLocales } from "./history-locales.js";
export function HistoryContinuationEntry({ controller, locale, sessionId }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const language = useSyncExternalStore(listener => locale.subscribe(listener), () => locale.getSnapshot());
    if (state.sessionId !== sessionId || state.status?.execution === "active" || state.phase === "loading" && state.status === null && state.issue === null)
        return null;
    return _jsx(HistoryContinuation, { controller: controller, locale: language.active === "zh" ? "zh" : "en" });
}
/** Read-only native binding observer; Host admission owns all history activation. */
export function registerHistoryContinuation(ctx) {
    void ctx.inject(["remote.dsmmHistory"], historyCtx => {
        const controller = new HistoryContinuationController(), remote = historyCtx.remote.dsmmHistory;
        let disposed = false;
        let connection, selected;
        let blocks;
        let held;
        let watched, stopBlock;
        const release = () => {
            const owned = held;
            held = undefined;
            if (owned && blocks?.storeFor(owned.id) === owned.store && owned.store.getSnapshot() === owned.block)
                blocks.set(owned.id, undefined);
        };
        const syncBlock = () => {
            const state = controller.getSnapshot(), id = state.sessionId;
            if (disposed || id === null || state.status?.execution === "active") {
                stopBlock?.();
                stopBlock = undefined;
                watched = undefined;
                release();
                return;
            }
            if (held && held.id !== id)
                release();
            const text = historyLocales[historyCtx.locale.getLocale().active === "zh" ? "zh" : "en"];
            const reason = state.phase === "disconnected" ? text.disconnected : state.phase === "unknown" ? text.unknown
                : state.phase === "confirming" || state.status?.execution === "activating" ? text.confirming : text.reasons[state.issue?.code ?? (state.status?.compatibleHost === false ? "unsupported-host" : state.status?.reason) ?? "authorization-required"];
            const store = blocks?.storeFor(id);
            if (watched !== store) {
                stopBlock?.();
                watched = store;
                stopBlock = store?.subscribe(syncBlock);
            }
            if (held && (held.store !== store || held.store.getSnapshot() !== held.block))
                held = undefined;
            if (held && (held.id !== id || held.block.reason !== reason))
                release();
            if (!blocks || !store || held)
                return;
            if (store.getSnapshot() !== undefined)
                return;
            const block = { reason };
            held = { id, store, block };
            blocks.set(id, block);
        };
        const update = () => {
            if (disposed)
                return;
            const state = selected?.session.getSnapshot();
            const id = selected && state?.sessionId === selected.sessionId && !state.removed ? selected.sessionId : null;
            controller.bind(remote, connection?.generation.getSnapshot(), id, selected);
            syncBlock();
        };
        historyCtx.effect(() => controller.subscribe(syncBlock));
        historyCtx.effect(() => historyCtx.locale.subscribe(syncBlock));
        historyCtx.effect(() => () => { disposed = true; stopBlock?.(); release(); controller.dispose(); }, "dsmm: history continuation owner");
        historyCtx.slots.inject("conversation.input.dock", () => historyCtx.slots.register({
            name: "conversation.input.dock", id: "dsmm-history-continuation", order: 10, inject: () => ({ controller, locale: historyCtx.locale }),
        }, HistoryContinuationEntry));
        void historyCtx.inject(["conversation"], conversationCtx => {
            blocks = conversationCtx.conversation.blocks;
            syncBlock();
            conversationCtx.effect(() => () => { stopBlock?.(); stopBlock = undefined; watched = undefined; release(); blocks = undefined; }, "dsmm: history composer lifetime");
        });
        void historyCtx.inject(["connection"], connectionCtx => {
            connection = connectionCtx.connection;
            update();
            connectionCtx.effect(() => connection.generation.subscribe(update));
            connectionCtx.effect(() => () => { connection = undefined; update(); }, "dsmm: history connection lifetime");
        });
        void historyCtx.inject(["uiSession", "sessions"], sessionCtx => {
            const source = sessionCtx.uiSession.adapter.current, sessions = sessionCtx.sessions;
            let stop;
            const observe = () => {
                const id = source.getSnapshot().key;
                const candidate = id === undefined ? undefined : sessions.binding(id);
                const binding = candidate?.sessionId === id ? candidate : undefined;
                if (binding !== selected) {
                    stop?.();
                    selected = binding;
                    stop = binding?.session.subscribe(update);
                }
                update();
            };
            observe();
            sessionCtx.effect(() => source.subscribe(observe));
            sessionCtx.effect(() => sessions.list.subscribe(observe));
            sessionCtx.effect(() => () => { stop?.(); selected = undefined; update(); }, "dsmm: history native scope lifetime");
        });
    });
}
//# sourceMappingURL=history-entry.js.map