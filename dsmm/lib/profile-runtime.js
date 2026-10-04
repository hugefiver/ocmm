import { join } from "node:path";
import { ProfileStore } from "./profile-store.js";
import { DsmmProfileError, resolveProfileSettings } from "./profiles.js";
import { DSMM_ROLES, isRootRole } from "./roles.js";
function immutableSettings(settings) {
    const copy = structuredClone(settings);
    const freeze = (value) => {
        if (typeof value !== "object" || value === null || Object.isFrozen(value))
            return;
        for (const entry of Object.values(value))
            freeze(entry);
        Object.freeze(value);
    };
    freeze(copy);
    return copy;
}
/** Selection admits new roots only; live children inherit exact runtime ownership. */
export class DsmmProfileRuntime {
    ctx;
    store;
    options;
    getSettings = (agent) => agent === undefined ? this.current.settings : this.bind(agent).settings;
    current;
    baseline;
    bound = new WeakMap();
    selectionQueue = Promise.resolve();
    constructor(ctx, baseline, store, options = {}) {
        this.ctx = ctx;
        this.store = store;
        this.options = options;
        this.baseline = immutableSettings(baseline);
        this.current = { selectedId: null, appliedRevision: null, selectionRevision: "absent", settings: this.baseline };
    }
    async initialize() {
        const selection = await this.store.loadSelection();
        // Cold resumes are new runtime Agents: the pinned current selection is the
        // startup authority, not an assertion that a previous process still lives.
        this.current = this.prepare(selection.document, selection);
        this.ctx.on?.("agent/created", ({ agent }) => { this.bind(agent); }, { global: true, prepend: true });
        // Installation into an already-running host treats those Agents as admitted
        // now, while all later profile switches continue to preserve their snapshot.
        for (const agent of this.agents()?.list() ?? [])
            this.bind(agent);
    }
    admission(agent) {
        const { selectedId, appliedRevision, selectionRevision } = this.bind(agent);
        return { selectedId, appliedRevision, selectionRevision };
    }
    async describe() {
        const persisted = await this.store.describe();
        const current = this.current;
        const changedOutsideHost = persisted.selectedId !== current.selectedId
            || persisted.appliedRevision !== current.appliedRevision
            || persisted.selectionRevision !== current.selectionRevision;
        return {
            ...persisted,
            selectedId: current.selectedId,
            appliedRevision: current.appliedRevision,
            // Keep the disk revision for CAS, but never label its unvalidated policy
            // as admitted in this Host. Existing Agent snapshots remain untouched.
            ...(persisted.selectionError === undefined && changedOutsideHost ? {
                selectionError: {
                    code: "conflict",
                    message: "The persisted selection changed outside this Host. New Agents still use this Host's admitted current policy; reapply the desired profile or restart."
                }
            } : {})
        };
    }
    read(id) { return this.store.read(id); }
    save(request) { return this.store.save(request); }
    select(request) {
        const operation = this.selectionQueue.then(async () => {
            const result = await this.store.select(request, async (document) => {
                const prepared = immutableSettings(resolveProfileSettings(this.baseline, document?.settings ?? {}));
                await this.validate(prepared);
                return prepared;
            });
            // There is no await between successful durable commit and publication of
            // the complete settings value. Draft saves never reach this assignment.
            this.current = { ...result.selection, settings: result.prepared };
            return this.describe();
        });
        this.selectionQueue = operation.catch(() => undefined);
        return operation;
    }
    prepare(document, selection) {
        return { selectedId: selection.selectedId, appliedRevision: selection.appliedRevision, selectionRevision: selection.selectionRevision,
            settings: immutableSettings(resolveProfileSettings(this.baseline, document?.settings ?? {})) };
    }
    agents() { return this.ctx.get?.("agents"); }
    bind(agent) {
        const existing = this.bound.get(agent);
        if (existing !== undefined)
            return existing;
        const agents = this.agents();
        // The native factory enters the exact child/owner pair before announcing
        // creation. Durable lineage and inherited persona never establish ownership.
        const parent = agent.id === undefined ? undefined
            : agents?.list().find((candidate) => candidate !== agent && agents.isOwnedBy(agent.id, candidate));
        const admitted = parent === undefined ? this.current : this.bind(parent);
        this.bound.set(agent, admitted);
        return admitted;
    }
    async validate(settings) {
        if (this.options.validateCandidate !== undefined) {
            await this.options.validateCandidate(settings);
            return;
        }
        const registry = this.ctx.get?.("agentPresets");
        if (registry !== undefined) {
            for (const role of DSMM_ROLES.filter((role) => isRootRole(role) && settings.roles[role.id])) {
                try {
                    const preset = await registry.resolve(role.id);
                    if (preset.broken !== undefined)
                        throw new Error("unusable root preset");
                }
                catch {
                    throw new DsmmProfileError("activation", "An enabled DW root preset is unavailable. Resolve the native preset loading error before applying a profile.", role.id);
                }
            }
        }
        const routes = [];
        for (const [role, policy] of Object.entries(settings.roleRouting)) {
            if (!settings.roles[role])
                continue;
            if (policy.primary !== undefined)
                routes.push({ route: policy.primary, field: `settings.roleRouting.${role}.primary` });
            for (const [index, route] of (policy.fallbackRoutes ?? []).entries())
                routes.push({ route, field: `settings.roleRouting.${role}.fallbackRoutes.${index}` });
        }
        for (const [index, route] of settings.runtimeRecovery.fallbackRoutes.entries())
            routes.push({ route, field: `settings.runtimeRecovery.fallbackRoutes.${index}` });
        if (routes.length === 0)
            return;
        const llm = (this.agents()?.list() ?? []).map((agent) => agent.ctx?.get?.("llm")).find((service) => service?.resolveCallConfig !== undefined)
            ?? this.ctx.get?.("llm") ?? (this.ctx.get === undefined ? this.ctx.llm : undefined);
        if (llm?.resolveCallConfig === undefined) {
            throw new DsmmProfileError("activation", "Open a chat so its native model service can validate configured routes before applying this profile.");
        }
        for (const { route, field } of routes) {
            try {
                await llm.resolveCallConfig({ ...route });
            }
            catch {
                throw new DsmmProfileError("activation", "The configured provider, model or exact reasoning effort is unavailable in the native model catalog.", field);
            }
        }
    }
}
/** No guessed home fallback: native deployment context owns this directory. */
export async function createProfileRuntime(ctx, baseline) {
    const profile = ctx.get?.("profileContext");
    if (typeof profile?.dir !== "string" || profile.dir.trim() === "")
        throw new DsmmProfileError("activation", "Deepwork profiles require the native deployment profile directory.");
    const runtime = new DsmmProfileRuntime(ctx, baseline, new ProfileStore(join(profile.dir, "dsmm-profiles")));
    await runtime.initialize();
    return runtime;
}
//# sourceMappingURL=profile-runtime.js.map