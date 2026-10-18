/** Contribution-owned memory only. Navigation never saves, applies, or rebases drafts. */
export class DeploymentWorkspace {
    core;
    permissions;
    state = { scope: "global", module: null, pending: null, native: null, revision: 0 };
    listeners = new Set();
    forms = null;
    profiles = new Map();
    stopForm;
    stopNative;
    stopCore;
    stopPermissions;
    identity = null;
    globalVersion;
    sourceBlocked = false;
    attachCurrentForm;
    constructor(core, permissions) {
        this.core = core;
        this.permissions = permissions;
        this.stopCore = core.subscribe(() => { this.sync(); this.changed(); });
        this.stopPermissions = permissions?.store.subscribe(() => this.changed());
        this.sync();
    }
    getSnapshot = () => this.state;
    subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
    changed(patch = {}) { this.state = { ...this.state, ...patch, revision: this.state.revision + 1 }; for (const listener of this.listeners)
        listener(); }
    bindForms(forms) { if (this.forms === forms)
        return; this.forms = forms; this.identity = null; this.sync(); this.changed(); }
    sync() {
        const snapshot = this.core.getSnapshot().snapshot;
        const issue = this.core.getSnapshot().issue, blocked = issue === "unavailable" || issue === "not-owned" || issue === "transport", restored = this.sourceBlocked && !blocked;
        this.sourceBlocked = blocked;
        const key = snapshot?.namespace == null ? null : JSON.stringify([snapshot.hostProfileKey, snapshot.entryId, snapshot.namespace]);
        const changedGlobal = snapshot?.globalRevision !== this.globalVersion;
        this.globalVersion = snapshot?.globalRevision;
        if (key === this.identity) {
            if (blocked)
                this.state.native?.attachForm(null);
            else if (restored)
                this.attachCurrentForm?.();
            if (!blocked && changedGlobal && this.state.native !== null && !this.state.native.getSnapshot().busy)
                void this.state.native.refresh();
            return;
        }
        this.identity = key;
        this.stopForm?.();
        this.stopNative?.();
        this.attachCurrentForm = undefined;
        let native = null;
        if (key !== null && snapshot !== null) {
            native = this.profiles.get(key) ?? this.core.forProfile(snapshot.namespace);
            this.profiles.set(key, native);
            this.stopNative = native.subscribe(() => this.changed());
            if (this.forms !== null) {
                const form = this.forms.get(snapshot.namespace);
                const attach = () => { native.attachForm(this.sourceBlocked ? null : { state: form.getSnapshot(), mutate: (ops, revision) => form.mutate(ops, revision) }); this.changed(); if (!this.sourceBlocked && !native.getSnapshot().busy)
                    void native.refresh(); };
                this.attachCurrentForm = attach;
                this.stopForm = form.subscribe(attach);
                attach();
            }
            else
                native.attachForm(null);
            if (native.getSnapshot().snapshot === null)
                void native.refresh();
        }
        this.changed({ native });
    }
    controller(scope = this.state.scope) { return scope === "global" ? this.core : this.state.native; }
    hasPending() { return this.controller()?.getSnapshot().dirty === true || this.state.module === "permissions" && this.permissions?.store.getSnapshot().dirty === true; }
    request(destination) {
        const switched = destination.scope !== this.state.scope;
        const leaving = switched || this.state.module !== null && destination.module !== this.state.module;
        if (leaving && this.hasPending())
            this.changed({ pending: destination });
        else {
            this.changed({ ...destination, pending: null });
            if (switched)
                void this.controller()?.refresh();
        }
    }
    continueEditing() { this.changed({ pending: null }); }
    keepAndNavigate() { const target = this.state.pending; if (target !== null) {
        const switched = target.scope !== this.state.scope;
        this.changed({ ...target, pending: null });
        if (switched)
            void this.controller()?.refresh();
    } }
    async discardAndNavigate() {
        const destination = this.state.pending;
        if (destination === null)
            return;
        const controller = this.controller();
        if (controller?.getSnapshot().dirty) {
            await controller.refresh(true);
            if (controller.getSnapshot().dirty || controller.getSnapshot().issue !== null)
                return;
        }
        if (this.state.module === "permissions" && this.permissions?.store.getSnapshot().dirty) {
            await this.permissions.refresh(this.permissions.store.getSnapshot().generation, true);
            if (this.permissions.store.getSnapshot().dirty)
                return;
        }
        if (this.state.pending === destination)
            this.changed({ ...destination, pending: null });
    }
    async save() { const controller = this.controller(); if (controller === null)
        return; await controller.save(); if (controller !== this.core && controller.getSnapshot().saved)
        await this.core.refresh(); }
    dispose() { this.stopCore(); this.stopForm?.(); this.stopNative?.(); this.stopPermissions?.(); for (const controller of this.profiles.values())
        controller.dispose(); this.listeners.clear(); }
}
const workspaces = new WeakMap();
export function deploymentWorkspace(core, permissions) {
    let workspace = workspaces.get(core);
    if (workspace === undefined) {
        workspace = new DeploymentWorkspace(core, permissions);
        workspaces.set(core, workspace);
    }
    return workspace;
}
//# sourceMappingURL=deployment-workspace.js.map