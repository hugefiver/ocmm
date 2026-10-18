import { createRequire } from "node:module";
import { isDeepStrictEqual } from "node:util";
import { symbols } from "@deepseek-ai/cordis";
import { ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import { setSandboxMode } from "@deepseek-ai/dsh-sandbox-policy";
import { setApprovalPolicy } from "@deepseek-ai/dsh-user-approval";
import { HistoryRefusal } from "./history-controller.js";
import { DSMM_ROLES, isDsmmRoleId } from "./roles.js";
import { isRootRoleEnabled } from "./settings.js";
import { appendModeRecord } from "./session-metadata.js";
import { effectiveHistoryGitWriteGuard } from "./history-policy.js";
const require = createRequire(import.meta.url), sdk = createRequire(require.resolve("@deepseek-ai/dsh-agent-preset-registry"));
const { createScope, scopeParentOf } = sdk("@deepseek-ai/dsh-scope");
const original = (value) => Reflect.get(value, symbols.original) ?? value;
const services = ["llm", "tools", "systemPrompt", "skills", "sandboxPolicy", "approval"];
function requireCurrentLease(lease) {
    if (!("assertCurrent" in lease) || typeof lease.assertCurrent !== "function")
        throw new HistoryRefusal("unsupported-host");
}
/** Current deployment/profile and native composition only; history supplies content and restrictive ceilings. */
export class DsmmHistoryCandidates {
    ctx;
    profiles;
    deployment;
    admission;
    signal;
    modelGeneration = 0;
    constructor(ctx, profiles, deployment, admission) {
        this.ctx = ctx;
        this.profiles = profiles;
        this.deployment = deployment;
        this.admission = admission;
        this.signal = admission.lifetime.signal;
        ctx.on("llm/adapters-updated", () => { this.modelGeneration++; }, { global: true });
    }
    async checkCompatibility() {
        this.signal.throwIfAborted();
        const registry = this.ctx.agentPresets, preset = (await registry.list()).find(row => !row.broken);
        if (!preset)
            throw new HistoryRefusal("unavailable");
        const lease = await registry.acquireScope(preset.id);
        try {
            requireCurrentLease(lease);
            lease.assertCurrent();
            this.signal.throwIfAborted();
        }
        finally {
            await lease[Symbol.asyncDispose]();
        }
    }
    async choices(signal) {
        signal.throwIfAborted();
        this.signal.throwIfAborted();
        const desired = await this.deployment.readDesired(), rows = await this.ctx.agentPresets.list(), profiles = await this.profiles.describe();
        signal.throwIfAborted();
        this.signal.throwIfAborted();
        return { presets: rows.filter(row => !row.broken && (!row.id.startsWith("dsmm-") || isDsmmRoleId(row.id) && isRootRoleEnabled(desired.settings, row.id)))
                .map(row => ({ id: row.id, label: (row.name ?? row.id).slice(0, 120) })),
            profiles: profiles.profiles.filter(row => row.revision !== null && row.error === undefined).map(row => ({ id: row.id, label: (row.label ?? row.id).slice(0, 120) })) };
    }
    async prepare(request, inspection, signal) {
        signal.throwIfAborted();
        this.signal.throwIfAborted();
        if (inspection.meta.origin === "subagent")
            throw new HistoryRefusal("child-owner-required");
        const profile = await this.profiles.prepareHistory(request.profileId, this.signal), settings = profile.admission.settings;
        if (request.preset.startsWith("dsmm-") && (!isDsmmRoleId(request.preset) || !isRootRoleEnabled(settings, request.preset)))
            throw new HistoryRefusal("unavailable");
        const registry = this.ctx.agentPresets, metadata = await registry.resolve(request.preset);
        if (metadata.broken)
            throw new HistoryRefusal("unavailable");
        const lease = await registry.acquireScope(request.preset);
        try {
            requireCurrentLease(lease);
        }
        catch (error) {
            await lease[Symbol.asyncDispose]();
            throw error;
        }
        const scope = createScope(this.ctx, {}, { parent: lease.key });
        const dispose = async () => { try {
            await scope.dispose();
        }
        finally {
            await lease[Symbol.asyncDispose]();
        } };
        try {
            const get = (name) => registry.serviceFor({ ctx: scope.ctx }, name) ?? this.ctx.get(name);
            const captured = services.map(name => get(name));
            if (captured.some(value => value === undefined))
                throw new HistoryRefusal("unavailable");
            const llm = get("llm"), sandbox = get("sandboxPolicy"), approval = get("approval");
            const permissions = this.ctx.get("dsmmPermissionController");
            if (!permissions)
                throw new HistoryRefusal("unavailable");
            await permissions.rules.refresh();
            const rules = permissions.rules.getPolicy(), permissionSignal = permissions.rules.signal;
            const source = this.deployment.permissionSource();
            if (source.globalRevision !== profile.admission.deployment?.globalRevision || source.nativeRevision !== profile.admission.deployment?.nativeRevision)
                throw new HistoryRefusal("stale");
            const generation = this.modelGeneration;
            const active = settings.modules.deepwork.enabled && (isDsmmRoleId(request.preset) || request.preset !== "minimal" && settings.defaultActive);
            const role = isDsmmRoleId(request.preset) ? request.preset : active ? "dsmm-orchestrator" : undefined;
            const route = role === undefined ? undefined : settings.roleRouting[role]?.primary;
            const defaultModel = this.ctx.get?.("agentDefaultModel");
            if (!route && !defaultModel)
                throw new HistoryRefusal("unavailable");
            const model = route === undefined ? structuredClone(defaultModel.currentSelection()) : { provider: route.provider, model: route.model,
                ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }) };
            await llm.resolveCallConfig(model, signal);
            const oldSandbox = inspection.events.filter(event => event.type === "sandbox/mode").at(-1);
            const oldApproval = inspection.events.filter(event => event.type === "approval/policy").at(-1);
            const oldPreset = inspection.events.filter(event => event.type === "agent-preset/selected").at(-1)?.data.agentPreset ?? inspection.meta.agentPreset;
            const readOnlyHistory = oldSandbox?.data.mode === "read-only" || DSMM_ROLES.some(role => role.id === oldPreset && role.access === "read-only");
            const defaultMode = sandbox.defaultMode, defaultApproval = approval.config.policy ?? "ask";
            const mode = readOnlyHistory ? "read-only" : defaultMode;
            const approvalPolicy = oldApproval?.data.policy === "never" ? "never" : defaultApproval;
            const check = () => {
                this.signal.throwIfAborted();
                permissionSignal.throwIfAborted();
                try {
                    lease.assertCurrent();
                    profile.assertCurrent();
                }
                catch {
                    throw new HistoryRefusal("stale");
                }
                const current = this.ctx.get("dsmmPermissionController");
                const currentDefault = this.ctx.get?.("agentDefaultModel");
                if (!this.admission.isReady || original(this.ctx.agentPresets) !== original(registry) || this.modelGeneration !== generation
                    || current === undefined || original(current) !== original(permissions) || current.rules.signal !== permissionSignal
                    || current.rules.getPolicy().revision !== rules.revision || this.deployment.permissionSource().revision !== source.revision
                    || captured.some((value, index) => { const now = get(services[index]); return value === undefined || now === undefined || original(value) !== original(now); })
                    || route === undefined && (currentDefault === undefined || original(currentDefault) !== original(defaultModel) || !isDeepStrictEqual(currentDefault.currentSelection(), model))
                    || sandbox.defaultMode !== defaultMode || (approval.config.policy ?? "ask") !== defaultApproval)
                    throw new HistoryRefusal("stale");
            };
            check();
            signal.throwIfAborted();
            return { admission: profile.admission, model, signal: AbortSignal.any([this.signal, permissionSignal]),
                view: { preset: { id: request.preset, label: (metadata.name ?? metadata.id).slice(0, 120) }, profile: request.profileId === null ? null : { id: request.profileId, label: (profile.label ?? request.profileId).slice(0, 120) }, model,
                    roles: DSMM_ROLES.filter(role => active && settings.roles[role.id]).map(role => ({ id: role.id, label: role.name })),
                    restrictions: [`sandbox: ${mode}`, `approval: ${approvalPolicy}`, `Deepwork: ${active ? "on" : "off"}`, `DSMM Git-write guard: ${effectiveHistoryGitWriteGuard(settings, mode === "danger-full-access", active)}`],
                    differences: ["Current preset, saved configuration and current native permissions replace historical execution settings. Historical approval outcomes and temporary grants are not reused."] },
                assertCurrent: check,
                revalidate: async (currentSignal) => {
                    check();
                    await profile.revalidate(currentSignal);
                    await llm.resolveCallConfig(model, currentSignal);
                    check();
                    currentSignal.throwIfAborted();
                },
                install: async (agent, currentSignal) => {
                    check();
                    currentSignal.throwIfAborted();
                    if (scopeParentOf(agent) !== lease.key || registry.composedPreset(agent.ctx) !== request.preset
                        || captured.some((value, index) => { const actual = registry.serviceFor(agent, services[index]) ?? agent.ctx.get(services[index]); return value === undefined || actual === undefined || original(value) !== original(actual); }))
                        throw new HistoryRefusal("stale");
                    setSandboxMode(agent.session, mode);
                    check();
                    setApprovalPolicy(agent.session, approvalPolicy);
                    check();
                    appendModeRecord(agent.session, active);
                    check();
                    await this.admission.prepareHistory(agent, profile.admission, currentSignal);
                    check();
                    currentSignal.throwIfAborted();
                }, dispose };
        }
        catch (error) {
            await dispose();
            throw error;
        }
    }
}
//# sourceMappingURL=history-candidates.js.map