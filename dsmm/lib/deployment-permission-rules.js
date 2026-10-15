import { PermissionRefusal, permissionOriginal } from "./permission-control.js";
import { applyPermissionRulesSave, importPermissionRules, operatorPermissionRulesSource, parsePermissionRules, parsePermissionRulesSave, PermissionRulesRuntimeSync } from "./permission-rules.js";
import { copyJson, validateSparseConfig } from "./settings.js";
import { parseHostNativeCommands } from "./permission-native-command.js";
const entries = new WeakMap();
const claimed = new WeakSet();
const homes = new Map();
function imported(config, label, global) {
    if (config.permissionControl?.rules === undefined)
        return config;
    const rules = parsePermissionRules(config.permissionControl.rules).map(rule => ({
        ...importPermissionRules([{ id: rule.id, action: rule.action, match: rule.match }], label, rule.revision)[0], revoked: rule.revoked
    }));
    return validateSparseConfig({ ...config, permissionControl: { ...config.permissionControl, rules } }, global);
}
/** Source checks complement in-process generation revocation; a serialized token is never authority. */
class SourceBoundRulesRuntime extends PermissionRulesRuntimeSync {
    source;
    refreshSource;
    projection;
    constructor(initial, revoke, source, refreshSource) {
        super(initial, revoke);
        this.source = source;
        this.refreshSource = refreshSource;
    }
    async refresh() { await this.refreshSource(); return this.getPolicy(); }
    status() {
        const current = super.status();
        let source;
        try {
            source = this.source();
        }
        catch {
            if (current.state === "synced")
                this.invalidate();
            return Object.freeze({ ...super.status(), state: "unsynced" });
        }
        if (current.state === "synced" && current.savedRevision !== source.revision)
            this.invalidate();
        return Object.freeze({ ...super.status(), savedRevision: source.revision, restartRequired: source.policy.enabled !== current.mounted });
    }
    getPolicy() {
        const policy = super.getPolicy();
        try {
            if (this.source().revision !== policy.revision)
                throw new PermissionRefusal("stale");
        }
        catch (error) {
            this.invalidate();
            throw error;
        }
        if (this.projection?.snapshot !== policy)
            this.projection = { snapshot: policy,
                value: Object.freeze({ revision: policy.revision, policy: Object.freeze({ ...policy.policy, enabled: super.status().mounted }) }) };
        return this.projection.value;
    }
}
/** Canonical Rules RPC writes the global layer; native overrides remain independently owned. */
export class DeploymentPermissionRules {
    ctx;
    options;
    runtime;
    initial;
    lifetime = new AbortController();
    operatorWrites = new WeakMap();
    nativeFiber;
    registry;
    busy = false;
    refreshing;
    constructor(ctx, options) {
        this.ctx = ctx;
        this.options = options;
        this.nativeFiber = options.deployment.nativeEntry?.fiber;
        this.registry = permissionOriginal(ctx.agents);
        this.initial = this.snapshot();
        this.runtime = new SourceBoundRulesRuntime(this.initial, options.revoke, () => this.snapshot(), () => this.refresh());
        const deployment = options.deployment, entry = deployment.nativeEntry;
        if (entry !== undefined) {
            if (entry.fiber?.ctx.root !== ctx.root)
                throw new PermissionRefusal("not-owned");
            if (entries.has(entry))
                throw new PermissionRefusal("unavailable");
        }
        const homeKey = process.platform === "win32" ? deployment.home.toLowerCase() : deployment.home;
        const family = homes.get(homeKey) ?? new Set();
        if ([...family].some(owner => owner.busy || owner.runtime.status().state === "updating"))
            throw new PermissionRefusal("unavailable");
        const remove = deployment.coordinateWrites({ global: async (request, config, assertAuthority, write) => {
                const operator = this.operatorWrites.get(request);
                const rulesInput = request.edits.some(edit => edit.path[0] === "permissionControl" && (edit.path.length === 1 || edit.path[1] === "rules"));
                const candidate = operator !== undefined || !rulesInput ? config : imported(config, "global-settings", true);
                return this.transaction([...family], async () => { assertAuthority(); return write(candidate); });
            } });
        if (entry !== undefined) {
            entries.set(entry, this);
            claimed.add(entry);
        }
        family.add(this);
        homes.set(homeKey, family);
        ctx.effect(() => () => {
            this.lifetime.abort();
            remove();
            family.delete(this);
            if (family.size === 0)
                homes.delete(homeKey);
            if (entry !== undefined)
                entries.delete(entry);
            this.runtime.retire();
        });
    }
    snapshot() {
        this.lifetime.signal.throwIfAborted();
        if (this.options.deployment.nativeEntry?.fiber !== this.nativeFiber)
            throw new PermissionRefusal("unavailable");
        const source = this.options.deployment.permissionSource();
        return Object.freeze({ revision: source.revision, policy: source.policy });
    }
    assertWritable(root) {
        this.lifetime.signal.throwIfAborted();
        const registry = this.ctx.agents;
        if (permissionOriginal(registry) !== this.registry || registry.get(root.id) !== root || root.session.id !== root.id || root.session.header.origin === "subagent"
            || !registry.roots().includes(root) || registry.list().some(owner => owner !== root && registry.isOwnedBy(root.id, owner)))
            throw new PermissionRefusal("not-owned");
        this.options.assertWritable(root);
    }
    check(authority) {
        authority.signal.throwIfAborted();
        authority.assertCurrent();
        this.assertWritable(authority.root);
    }
    async read(authority) {
        this.check(authority);
        await this.refresh();
        this.check(authority);
        const snapshot = this.snapshot();
        if (this.runtime.status().state === "synced" && this.runtime.status().savedRevision !== snapshot.revision)
            this.runtime.invalidate();
        this.check(authority);
        return snapshot;
    }
    async save(request, authority) {
        this.check(authority);
        request = parsePermissionRulesSave(request);
        const source = this.options.deployment.permissionSource();
        if (request.expectedRevision !== source.revision)
            throw new PermissionRefusal("stale");
        if (Object.keys(source.profile.permissionControl ?? {}).some(key => key !== "enabled")) {
            const error = new PermissionRefusal("unavailable");
            error.message = "Native profile overrides the global permission policy; edit or unset that native override first.";
            throw error;
        }
        const proposed = applyPermissionRulesSave({ revision: source.revision, policy: source.policy }, request, operatorPermissionRulesSource(authority));
        const edits = Object.entries(request.changes ?? {}).map(([key, value]) => ({ op: "set", path: ["permissionControl", key], value }));
        if (request.upsert !== undefined || request.revoke !== undefined)
            edits.push({ op: "set", path: ["permissionControl", "rules"], value: proposed.rules });
        const write = { expectedRevision: source.globalRevision, edits };
        this.operatorWrites.set(write, authority);
        try {
            await this.options.deployment.saveGlobal(write, () => {
                this.check(authority);
                const current = this.options.deployment.permissionSource();
                if (current.revision !== source.revision)
                    throw new PermissionRefusal("stale");
            });
            this.check(authority);
            return { snapshot: this.snapshot(), runtime: this.runtime.status() };
        }
        finally {
            this.operatorWrites.delete(write);
        }
    }
    notify = async (snapshot) => {
        this.lifetime.signal.throwIfAborted();
        await this.options.notify(snapshot);
        this.lifetime.signal.throwIfAborted();
        if (this.snapshot().revision !== snapshot.revision)
            throw new PermissionRefusal("stale");
    };
    /** Host recovery re-reads storage and never revives a former signal or grant. */
    async reconcile() {
        if (this.busy)
            throw new PermissionRefusal("stale");
        if (this.runtime.status().state === "synced")
            this.runtime.invalidate();
        await this.runtime.recover(undefined, this.snapshot(), this.notify);
    }
    /** Next actual consumption observes disk/native edits without requiring a UI save. */
    async refresh() {
        this.lifetime.signal.throwIfAborted();
        if (this.refreshing !== undefined)
            return this.refreshing;
        if (this.runtime.status().state === "synced")
            return;
        if (this.busy)
            throw new PermissionRefusal("unavailable");
        const refreshing = this.reconcile();
        this.refreshing = refreshing;
        try {
            await refreshing;
            this.lifetime.signal.throwIfAborted();
        }
        finally {
            if (this.refreshing === refreshing)
                this.refreshing = undefined;
        }
    }
    async synchronize(updates, recovery) {
        let rows;
        try {
            rows = [...updates].map(([owner, update]) => ({ owner, update, snapshot: owner.snapshot() }));
        }
        catch (error) {
            for (const owner of updates.keys())
                owner.runtime.invalidate();
            throw error;
        }
        const acknowledged = Promise.all(rows.map(row => row.owner.notify(row.snapshot))).then(() => {
            for (const row of rows)
                if (row.owner.snapshot().revision !== row.snapshot.revision)
                    throw new PermissionRefusal("stale");
        });
        const settled = await Promise.allSettled([acknowledged, ...rows.map(({ owner, update, snapshot }) => recovery
                ? owner.runtime.recover(update, snapshot, () => acknowledged) : owner.runtime.commit(update, snapshot, () => acknowledged))]);
        const failures = [...new Set(settled.flatMap(result => result.status === "rejected" ? [result.reason] : []))];
        if (failures.length)
            throw new AggregateError(failures, "Permission configuration is not synchronized.");
    }
    async transaction(participants, write) {
        for (const participant of participants) {
            if (participant.busy)
                throw new PermissionRefusal("stale");
            if (participant.runtime.status().state !== "synced" || participant.runtime.status().savedRevision !== participant.snapshot().revision)
                await participant.reconcile();
        }
        const updates = new Map();
        const locked = new Set();
        try {
            let result;
            try {
                for (const participant of participants) {
                    if (participant.busy)
                        throw new PermissionRefusal("stale");
                    participant.busy = true;
                    locked.add(participant);
                    updates.set(participant, participant.runtime.begin(participant.snapshot().revision));
                }
                result = await write();
            }
            catch (error) {
                try {
                    await this.synchronize(updates, true);
                }
                catch (recovery) {
                    throw new AggregateError([error, recovery], "Permission write and authoritative recovery failed.");
                }
                throw error;
            }
            await this.synchronize(updates, false);
            return result;
        }
        finally {
            for (const participant of locked)
                participant.busy = false;
        }
    }
    async editNative(editor, entry, change) {
        await this.transaction([this], () => editor.edit(entry, (current, inherited) => {
            const next = validateSparseConfig(change(current, inherited));
            if (next.permissionControl?.nativeCommands !== undefined)
                parseHostNativeCommands(next.permissionControl.nativeCommands);
            if (JSON.stringify(next.permissionControl?.rules) === JSON.stringify(current.permissionControl && typeof current.permissionControl === "object" ? Reflect.get(current.permissionControl, "rules") : undefined))
                return copyJson(next);
            return copyJson(imported(next, "native-profile-settings", false));
        }));
    }
}
/** Install in the owned Core fiber with the public `agents` service injected. */
export function installDeploymentPermissionRules(ctx, options) {
    return new DeploymentPermissionRules(ctx, options);
}
/** Scoped to the ordinary SettingsForms owner; never replaces a global instance or registry. */
export function permissionConfigEditorFacade(editor) {
    const methods = new Map();
    return new Proxy(editor, { get(target, key) {
            if (key !== "edit") {
                const value = Reflect.get(target, key, target);
                if (typeof value !== "function")
                    return value;
                const previous = methods.get(key);
                if (previous?.original === value)
                    return previous.bound;
                const bound = value.bind(target);
                methods.set(key, { original: value, bound });
                return bound;
            }
            return (entry, change) => {
                const backend = entries.get(entry);
                if (backend !== undefined)
                    return backend.editNative(target, entry, change);
                if (claimed.has(entry))
                    return Promise.reject(new PermissionRefusal("unavailable"));
                return target.edit(entry, change);
            };
        } });
}
//# sourceMappingURL=deployment-permission-rules.js.map