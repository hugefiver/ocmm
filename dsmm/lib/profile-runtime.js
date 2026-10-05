import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { ProfileStore, validateSessionProfileId } from "./profile-store.js";
import { DsmmProfileError, resolveProfileSettings } from "./profiles.js";
import { DSMM_ROLES, isRootRole } from "./roles.js";
import { roleRouteRuntimeState, selectInitialModelRoute } from "./role-routing.js";
import { resolveEffectiveDsmmRole, sessionEvents } from "./session-scope.js";
import { DeepworkModeController, hasOpenTurn } from "./state.js";
import { resolveRoleRuntimePolicy } from "./settings.js";
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
/** Global defaults admit new roots; scoped idle switches replace one root's epoch. */
export class DsmmProfileRuntime {
    ctx;
    store;
    options;
    getSettings = (agent) => agent === undefined ? this.current.settings : this.bind(agent).settings;
    current;
    baseline;
    bound = new WeakMap();
    admitting = new WeakSet();
    disposedAgents = new WeakSet();
    switching = new WeakSet();
    disposed = false;
    selectionQueue = Promise.resolve();
    mode;
    constructor(ctx, baseline, store, options = {}) {
        this.ctx = ctx;
        this.store = store;
        this.options = options;
        this.baseline = immutableSettings(baseline);
        this.mode = options.modeController ?? new DeepworkModeController({ get: (name) => ctx.get?.(name) });
        this.current = this.prepare(null, { selectedId: null, appliedRevision: null, selectionRevision: "absent" });
        this.getSettings.admission = (agent) => this.admission(agent);
    }
    async initialize() {
        const selection = await this.store.loadSelection();
        this.current = this.prepare(selection.document, selection);
        this.ctx.on?.("agent/created", async ({ agent, signal }) => {
            // Factory initialization already owns native maintenance: never whenIdle
            // or reserve maintenance from inside this serial creation listener.
            await this.admit(agent, signal);
        }, { global: true, prepend: true });
        this.ctx.on?.("agent/disposed", ({ agent }) => { this.disposedAgents.add(agent); }, { global: true });
        this.ctx.effect?.(() => () => { this.disposed = true; });
        // Installation into an already-running host treats those Agents as admitted
        // now, while all later profile switches continue to preserve their snapshot.
        for (const agent of this.agents()?.list() ?? [])
            await this.admit(agent);
    }
    admission(agent) { return agent === undefined ? this.current : this.bind(agent); }
    async getSession(agent) {
        this.assertRoot(agent);
        const admitted = this.bind(agent);
        const disk = await this.store.loadSessionSelection(agent.id);
        this.assertRoot(agent);
        if (this.bind(agent) !== admitted)
            throw new DsmmProfileError("conflict", "The session admission changed while reading. Refresh before selecting again.");
        if ((disk.admissionEpoch === null && admitted.scope !== "global-default") || (disk.admissionEpoch !== null && (disk.admissionEpoch !== admitted.epoch || disk.selectedId !== admitted.selectedId || disk.appliedRevision !== admitted.appliedRevision))) {
            throw new DsmmProfileError("conflict", "The session choice changed outside this Host. Its admitted policy was retained; refresh or resume explicitly.");
        }
        const reason = this.switching.has(agent) ? "maintenance" : agent.status === "running" ? "busy" : agent.runMaintenance === undefined ? "unavailable" : undefined;
        const role = resolveEffectiveDsmmRole(agent, admitted.settings, this.mode.active(agent, admitted.settings.defaultActive));
        const profileModel = this.declaredProfileModel(admitted.settings, role);
        return { sessionId: agent.id, globalDefault: selectionState(this.current), selection: selectionState(disk), admittedSelection: selectionState(admitted), scope: admitted.scope,
            rolePolicy: roleRouteRuntimeState(agent, admitted.settings, role, admitted.epoch), deepwork: this.mode.describe(agent, admitted.settings.defaultActive),
            ...(profileModel === undefined ? {} : { profileModel }),
            admissionEpoch: admitted.epoch, switchAllowed: reason === undefined, ...(reason === undefined ? {} : { switchUnavailableReason: reason }) };
    }
    /** The fourth argument is trusted native caller authority, never wire data. */
    async selectMode(request, agent, signal, assertAuthority) {
        this.assertRoot(agent);
        if (request.sessionId !== agent.id)
            throw new DsmmProfileError("not-owned", "The native session does not match the captured Agent.");
        const admitted = this.bind(agent);
        const assertCurrent = (maintenanceSignal) => {
            this.assertRoot(agent);
            if (signal?.aborted || maintenanceSignal?.aborted)
                throw new DsmmProfileError("cancelled", "The Deepwork change was cancelled.");
            const mode = this.mode.describe(agent, admitted.settings.defaultActive);
            if (this.bind(agent) !== admitted || admitted.epoch !== request.expectedAdmissionEpoch || mode.revision !== request.expectedModeRevision) {
                throw new DsmmProfileError("conflict", "The session profile, preset or mode changed. Refresh before retrying.");
            }
            if (mode.locked)
                throw new DsmmProfileError("validation", "A DW preset owns its Deepwork composition.");
            assertAuthority?.();
        };
        assertCurrent();
        if (agent.status === "running")
            throw new DsmmProfileError("busy", "Wait for the session to become idle.");
        if (agent.runMaintenance === undefined)
            throw new DsmmProfileError("unavailable", "Native idle maintenance is unavailable.");
        // Read before the write, so a later read failure cannot misreport a commit.
        const before = await this.getSession(agent);
        assertCurrent();
        try {
            return await agent.runMaintenance(async (maintenanceSignal) => {
                this.switching.add(agent);
                try {
                    assertCurrent(maintenanceSignal);
                    if (hasOpenTurn(sessionEvents(agent.session)))
                        throw new DsmmProfileError("busy", "A session turn is still open.");
                    try {
                        await this.mode.selectIdle(agent, request.active, admitted.settings.defaultActive);
                    }
                    catch {
                        throw new DsmmProfileError("io", "The session mode could not be saved. Refresh before retrying.");
                    }
                    const role = resolveEffectiveDsmmRole(agent, admitted.settings, this.mode.active(agent, admitted.settings.defaultActive));
                    const profileModel = this.declaredProfileModel(admitted.settings, role);
                    const { profileModel: _previousModel, rolePolicy: _previousPolicy, ...snapshot } = before;
                    return { ...snapshot, deepwork: this.mode.describe(agent, admitted.settings.defaultActive),
                        rolePolicy: roleRouteRuntimeState(agent, admitted.settings, role, admitted.epoch), ...(profileModel === undefined ? {} : { profileModel }) };
                }
                finally {
                    this.switching.delete(agent);
                }
            });
        }
        catch (error) {
            if (error instanceof DsmmProfileError)
                throw error;
            throw new DsmmProfileError("maintenance", "The native session refused the Deepwork change. Refresh before retrying.");
        }
    }
    selectSession(request, agent, signal, assertAuthority) {
        this.assertRoot(agent);
        if (request.sessionId !== agent.id)
            throw new DsmmProfileError("not-owned", "The native session does not match the captured Agent.");
        const admitted = this.bind(agent);
        const assertCurrent = (maintenanceSignal) => {
            this.assertRoot(agent);
            if (signal?.aborted || maintenanceSignal?.aborted)
                throw new DsmmProfileError("cancelled", "Session profile selection was cancelled; the previous admission was retained.");
            if (this.bind(agent) !== admitted || admitted.epoch !== request.expectedAdmissionEpoch)
                throw new DsmmProfileError("conflict", "The session admission changed. Refresh before selecting again.");
            assertAuthority?.();
        };
        assertCurrent();
        if (agent.status === "running")
            throw new DsmmProfileError("busy", "The session is running. Wait for its current activity before selecting a profile.");
        if (agent.runMaintenance === undefined)
            throw new DsmmProfileError("unavailable", "Native idle maintenance is unavailable; no session selection was committed.");
        let operation;
        try {
            operation = agent.runMaintenance(async (maintenanceSignal) => {
                this.switching.add(agent);
                try {
                    assertCurrent(maintenanceSignal);
                    const epoch = newEpoch();
                    let profileModel;
                    const result = await this.store.selectSession(request, epoch, async (document) => {
                        const prepared = immutableSettings(resolveProfileSettings(this.baseline, document?.settings ?? {}));
                        await this.validate(prepared, agent, maintenanceSignal);
                        const role = resolveEffectiveDsmmRole(agent, prepared, this.mode.active(agent, prepared.defaultActive));
                        profileModel = this.declaredProfileModel(prepared, role);
                        assertCurrent(maintenanceSignal);
                        return prepared;
                    }, {
                        assertCurrent: () => assertCurrent(maintenanceSignal),
                        committed: (selection, settings) => {
                            this.bound.set(agent, this.profileAdmission(selection, settings, epoch, request.id === null ? "deployment-baseline" : "session-override"));
                        }
                    });
                    // A committed selection remains a successful transaction even if a
                    // queued wake or disposal wins immediately when maintenance releases.
                    return { sessionId: request.sessionId, globalDefault: selectionState(this.current), selection: selectionState(result.selection), admittedSelection: selectionState(result.selection),
                        deepwork: this.mode.describe(agent, result.prepared.defaultActive),
                        ...(profileModel === undefined ? {} : { profileModel }),
                        scope: request.id === null ? "deployment-baseline" : "session-override", admissionEpoch: epoch, switchAllowed: true };
                }
                finally {
                    this.switching.delete(agent);
                }
            });
        }
        catch (error) {
            if (error instanceof DsmmProfileError)
                throw error;
            throw new DsmmProfileError("maintenance", "Another activity owns the session's idle maintenance phase. No selection was queued or committed.");
        }
        return operation;
    }
    async describe() {
        const persisted = await this.store.describe();
        const current = this.current;
        const changedOutsideHost = persisted.selectedId !== current.selectedId
            || persisted.appliedRevision !== current.appliedRevision
            || persisted.selectionRevision !== current.selectionRevision;
        return {
            ...persisted,
            roles: DSMM_ROLES.map((role) => {
                const configured = this.baseline.roleRouting[role.id];
                const runtimePolicy = { ...(configured?.strategy === undefined ? {} : { strategy: configured.strategy }),
                    ...(configured?.rateLimit === undefined ? {} : { rateLimit: structuredClone(configured.rateLimit) }) };
                return { id: role.id, label: role.name, enabled: this.baseline.roles[role.id],
                    ...(Object.keys(runtimePolicy).length === 0 ? {} : { runtimePolicy }) };
            }),
            editorDefaults: structuredClone(this.baseline.runtimePolicy),
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
            this.current = this.profileAdmission(result.selection, result.prepared, newEpoch(), "global-default");
            return this.describe();
        });
        this.selectionQueue = operation.catch(() => undefined);
        return operation;
    }
    prepare(document, selection, epoch = newEpoch(), scope = "global-default") {
        return this.profileAdmission(selection, immutableSettings(resolveProfileSettings(this.baseline, document?.settings ?? {})), epoch, scope);
    }
    profileAdmission(selection, settings, epoch, scope) {
        return Object.freeze({ ...selectionState(selection), settings, epoch, scope, profile: selection.selectedId === null || selection.appliedRevision === null ? null : Object.freeze({ id: selection.selectedId, revision: selection.appliedRevision }) });
    }
    declaredProfileModel(settings, role) {
        const primary = role === undefined ? undefined : settings.roleRouting[role]?.primary;
        return primary === undefined ? undefined : { provider: primary.provider, model: primary.model,
            ...(primary.reasoningEffort === undefined ? {} : { reasoningEffort: primary.reasoningEffort }) };
    }
    agents() { return this.ctx.get?.("agents"); }
    bind(agent) {
        const existing = this.bound.get(agent);
        if (existing !== undefined)
            return existing;
        if (this.admitting.has(agent))
            throw new DsmmProfileError("activation", "The session's profile admission has not completed.");
        if (agent.id !== undefined && this.agents()?.get !== undefined) {
            // Native enter() precedes serial created admission. An early RPC or
            // extension (including unpublished setup) cannot make a native root skip
            // its persisted sidecar by eagerly creating a default binding.
            throw new DsmmProfileError("activation", "The native session has not completed its awaited profile admission.");
        }
        // The native factory enters the exact child/owner pair before announcing
        // creation. Durable lineage and inherited persona never establish ownership.
        const parent = this.owner(agent);
        const admitted = parent === undefined ? this.current : this.bind(parent);
        this.bound.set(agent, admitted);
        return admitted;
    }
    owner(agent) {
        const agents = this.agents();
        return agent.id === undefined ? undefined : agents?.list().find((candidate) => candidate !== agent && agents.isOwnedBy(agent.id, candidate));
    }
    assertRoot(agent) {
        if (this.disposed || this.disposedAgents.has(agent))
            throw new DsmmProfileError("disposed", "The session or profile service was disposed; no selection was committed.");
        validateSessionProfileId(agent.id);
        const agents = this.agents();
        if (agents?.get === undefined)
            throw new DsmmProfileError("unavailable", "Native live Agent lookup is unavailable; no session selection was committed.");
        if (agents.get(agent.id) !== agent || this.owner(agent) !== undefined || agent.session.header?.origin === "subagent") {
            throw new DsmmProfileError("not-owned", "Session profile selection requires the exact live ordinary root Agent.");
        }
    }
    async admit(agent, signal) {
        if (this.bound.has(agent))
            return;
        const parent = this.owner(agent);
        if (parent !== undefined) {
            this.bound.set(agent, this.bind(parent));
            return;
        }
        if (agent.id === undefined) {
            this.bind(agent);
            return;
        }
        this.admitting.add(agent);
        try {
            signal?.throwIfAborted();
            const selection = await this.store.loadSessionSelection(agent.id);
            signal?.throwIfAborted();
            if (this.disposed || this.disposedAgents.has(agent))
                throw new DsmmProfileError("disposed", "The session was disposed during profile admission.");
            const registry = this.agents();
            if (registry?.get !== undefined && registry.get(agent.id) !== agent)
                throw new DsmmProfileError("not-owned", "The live session changed during profile admission.");
            this.bound.set(agent, selection.admissionEpoch === null ? this.current : this.prepare(selection.document, selection, selection.admissionEpoch, selection.selectedId === null ? "deployment-baseline" : "session-override"));
        }
        finally {
            this.admitting.delete(agent);
        }
    }
    async validate(settings, agent, signal) {
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
        const nativeAgent = agent ?? (this.agents()?.list() ?? []).find((candidate) => candidate.ctx?.get?.("llm")?.resolveCallConfig !== undefined);
        const inherited = nativeAgent?.options;
        const inheritedRoute = inherited?.provider === undefined || inherited.model === undefined ? undefined
            : { provider: inherited.provider, model: inherited.model, ...(inherited.reasoningEffort === undefined ? {} : { reasoningEffort: inherited.reasoningEffort }) };
        const chains = [];
        for (const role of DSMM_ROLES) {
            if (!settings.roles[role.id])
                continue;
            const policy = resolveRoleRuntimePolicy(settings, role.id);
            // No explicit primary inherits native routing. Dormant fallbacks alone
            // cannot make a usable inherited route fail profile Apply. If that exact
            // route is unavailable here, native request preflight remains authority.
            if (policy.primary === undefined && inheritedRoute === undefined)
                continue;
            const routes = [policy.primary ?? inheritedRoute, ...policy.fallbackRoutes];
            if (routes.length > 0)
                chains.push({ routes, field: `settings.roleRouting.${role.id}.${policy.primary === undefined ? "fallbackRoutes" : "primary"}` });
        }
        if (chains.length === 0)
            return;
        const llm = nativeAgent?.ctx?.get?.("llm")
            ?? this.ctx.get?.("llm") ?? (this.ctx.get === undefined ? this.ctx.llm : undefined);
        if (llm?.resolveCallConfig === undefined) {
            throw new DsmmProfileError("activation", "Open a chat so its native model service can validate configured routes before applying this profile.");
        }
        for (const { routes, field } of chains) {
            try {
                await selectInitialModelRoute(llm, routes, signal);
            }
            catch {
                throw new DsmmProfileError("activation", "The configured provider, model or exact reasoning effort is unavailable in the native model catalog.", field);
            }
        }
    }
}
function newEpoch() { return createHash("sha256").update(randomUUID()).digest("hex"); }
function selectionState(selection) {
    return { selectedId: selection.selectedId, appliedRevision: selection.appliedRevision, selectionRevision: selection.selectionRevision };
}
/** No guessed home fallback: native deployment context owns this directory. */
export async function createProfileRuntime(ctx, baseline, options = {}) {
    const profile = ctx.get?.("profileContext");
    if (typeof profile?.dir !== "string" || profile.dir.trim() === "")
        throw new DsmmProfileError("activation", "Deepwork profiles require the native deployment profile directory.");
    const runtime = new DsmmProfileRuntime(ctx, baseline, new ProfileStore(join(profile.dir, "dsmm-profiles")), options);
    await runtime.initialize();
    return runtime;
}
//# sourceMappingURL=profile-runtime.js.map