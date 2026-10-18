import { parseHistoryChoices, parseHistoryFailure, parseHistoryPreview, parseHistoryResult, parseHistoryStatus } from "../history-codec.js";
function initial(sessionId = null) { return { sessionId, phase: sessionId === null ? "disconnected" : "loading", status: null, choices: null, preview: null, issue: null }; }
function value(result, parse) { if (result.ok)
    return parse(result.value); throw result.error; }
function failure(error, confirming = false) {
    if (error && typeof error === "object" && Reflect.get(error, "code") === "dsmm-history/refused") {
        try {
            return parseHistoryFailure(Reflect.get(error, "details"));
        }
        catch { /* Unknown wire errors cannot authorize a retry. */ }
    }
    return { code: "unavailable", storageEffects: confirming ? "may-have-committed" : "none" };
}
/** Connection/session generation fences for continuation only; native history and composer stay authoritative. */
export class HistoryContinuationController {
    scope;
    state = initial();
    request;
    disposed = false;
    listeners = new Set();
    getSnapshot = () => this.state;
    subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
    publish(next) { this.state = next; for (const listener of this.listeners)
        listener(); }
    bind(remote, connection, sessionId, owner) {
        if (this.disposed)
            return;
        if (this.scope?.remote === remote && this.scope?.connection === connection && this.scope?.sessionId === sessionId && this.scope?.owner === owner)
            return;
        if (!this.scope && (!remote || !connection || !sessionId) && this.state.sessionId === sessionId && this.state.phase === "disconnected")
            return;
        this.scope = remote && connection && sessionId ? { remote, connection, sessionId, owner } : undefined;
        const scope = this.scope;
        this.request = undefined;
        this.publish({ ...initial(sessionId), phase: this.scope ? "loading" : "disconnected" });
        if (scope && this.scope === scope)
            void this.refresh(this.state);
    }
    /** Observed compatibility only, never a pre-follow navigation or write-admission guard. */
    get historyBrowsingAllowed() { return this.state.status?.compatibleHost === true; }
    dispose() { this.scope = undefined; this.request = undefined; this.disposed = true; this.listeners.clear(); }
    async refresh(expected) {
        const scope = this.scope;
        if (!scope || this.state !== expected || this.state.phase === "confirming")
            return;
        const request = this.request = {};
        this.publish({ ...this.state, phase: "loading", preview: null, issue: null });
        if (this.scope !== scope || this.request !== request)
            return;
        try {
            const status = value(await scope.remote.describe(scope.sessionId), parseHistoryStatus);
            if (this.scope !== scope || this.request !== request)
                return;
            if (status.sessionId !== scope.sessionId)
                throw new TypeError("Mismatched history response");
            const choices = status.execution === "authorization-required" ? value(await scope.remote.choices(), parseHistoryChoices) : null;
            if (this.scope !== scope || this.request !== request)
                return;
            this.publish({ sessionId: scope.sessionId, phase: "ready", status, choices, preview: null, issue: null });
        }
        catch (error) {
            if (this.scope === scope && this.request === request)
                this.publish({ ...this.state, phase: "ready", issue: failure(error), preview: null });
        }
    }
    async preview(expected, preset, profileId) {
        const scope = this.scope;
        if (!scope || this.state !== expected || expected.phase !== "ready" || expected.status?.execution !== "authorization-required" || !expected.status.compatibleHost)
            return;
        const request = this.request = {};
        this.publish({ ...this.state, phase: "previewing", preview: null, issue: null });
        if (this.scope !== scope || this.request !== request)
            return;
        try {
            const preview = value(await scope.remote.preview(scope.sessionId, { sessionId: scope.sessionId, preset, profileId }), parseHistoryPreview);
            if (this.scope !== scope || this.request !== request)
                return;
            if (preview.sessionId !== scope.sessionId || preview.candidate.preset.id !== preset || (preview.candidate.profile?.id ?? null) !== profileId)
                throw new TypeError("Mismatched continuation proposal");
            this.publish({ ...this.state, phase: "ready", preview });
        }
        catch (error) {
            if (this.scope === scope && this.request === request)
                this.publish({ ...this.state, phase: "ready", issue: failure(error), preview: null });
        }
    }
    async confirm(expected, processPending, acceptMigration) {
        const scope = this.scope, preview = expected.preview;
        if (!scope || this.state !== expected || expected.phase !== "ready" || !preview || !processPending || preview.migrationRequired && !acceptMigration)
            return;
        const request = this.request = {};
        this.publish({ ...this.state, phase: "confirming", issue: null });
        if (this.scope !== scope || this.request !== request)
            return;
        try {
            const receipt = value(await scope.remote.confirm(scope.sessionId, { sessionId: scope.sessionId, intentId: preview.intentId, processPending, acceptMigration }), parseHistoryResult);
            if (this.scope !== scope || this.request !== request)
                return;
            if (receipt.sessionId !== scope.sessionId)
                throw new TypeError("Mismatched continuation receipt");
            this.publish({ ...this.state, phase: "ready", preview: null, status: { sessionId: scope.sessionId, readable: "readable", compatibleHost: true, execution: "active" } });
        }
        catch (error) {
            if (this.scope !== scope || this.request !== request)
                return;
            const issue = failure(error, true);
            this.publish({ ...this.state, phase: issue.storageEffects === "may-have-committed" ? "unknown" : "ready", preview: null, issue });
        }
    }
}
//# sourceMappingURL=history-controller.js.map