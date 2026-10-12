import { AsyncLocalStorage } from "node:async_hooks";
import { delegationDepthOf, foldSubagentDescriptor, SubagentError } from "@deepseek-ai/dsh-subagent";
import { symbols } from "@deepseek-ai/cordis";
import { DSMM_ROLE_IDS, DSMM_ROLES, allowedRoleChildren, isDsmmRoleId } from "./roles.js";
export { allowedRoleChildren } from "./roles.js";
import { copyJson, freezeSettings } from "./settings.js";
import { admissionFromChildCapture, parseChildAdmissionCapture, parseLegacyChildEvidence } from "./child-capture.js";
import { createConservativeLegacyAdmission } from "./legacy-child-policy.js";
export { createConservativeLegacyAdmission as conservativeLegacyAdmission } from "./legacy-child-policy.js";
import { bindRoleInvocation, currentRoleInvocation, resolveRoleInvocation } from "./role-invocation.js";
import { captureRoleRuntimePolicy, resolveRoleRuntimePolicy } from "./routing-policy.js";
import { childOwnedSessionEvents, resolveEffectiveDsmmRole, resolveSelectedAgentPreset } from "./session-scope.js";
const liveIdentities = new WeakMap();
const toolIdentities = new WeakMap();
export function inheritToolFilter(parent, requested) {
    if (parent === undefined && requested === undefined)
        return undefined;
    const allow = parent?.allow === undefined ? requested?.allow : requested?.allow === undefined ? parent.allow
        : parent.allow.filter((name) => requested.allow.includes(name));
    const deny = [...new Set([...parent?.deny ?? [], ...requested?.deny ?? []])];
    return Object.freeze({ ...(allow === undefined ? {} : { allow: Object.freeze([...allow]) }),
        ...(parent?.deny === undefined && requested?.deny === undefined ? {} : { deny: Object.freeze(deny) }) });
}
export function resolveAdmittedDsmmRole(agent, settings, active) {
    if (!settings.modules.deepwork.enabled)
        return undefined;
    const identity = liveIdentities.get(agent)?.identity;
    return identity?.role === undefined ? resolveEffectiveDsmmRole(agent, settings, active)
        : identity.role !== undefined && settings.roles[identity.role] ? identity.role : undefined;
}
const readTools = new Set(["read", "glob", "grep", "read_image", "web_search", "web_fetch", "skill", "load_skill", "structured_output", "send_message", "interrupt_agent", "exit_plan_mode", "ask_user_question", "todo_write", "job_output", "job_list", "job_kill"]);
const readLsp = new Set(["status", "diagnostics", "goto_definition", "find_references", "find_symbol_related", "symbols", "prepare_rename"]);
export function roleToolName(role) { return role.replace(/-/gu, "_"); }
export function roleFromToolName(name) {
    return name === "explore" ? "dsmm-code-search" : DSMM_ROLES.find((row) => roleToolName(row.id) === name)?.id;
}
export function readonlyRoleTool(name, settings) {
    return readTools.has(name) || name === `mcp__${settings.lsp.serverName}__${name.split("__").at(-1)}`
        && readLsp.has(name.split("__").at(-1));
}
/** Identity admission only: native services retain every run, inbox and retry lifecycle. */
export class DsmmRolePolicy {
    ctx;
    getSettings;
    mode;
    calls = new AsyncLocalStorage();
    providers = new WeakSet();
    continuableCreations = new Map();
    preparedInvocations = new WeakMap();
    preparedCaptures = new WeakMap();
    collaborators;
    constructor(ctx, getSettings, mode) {
        this.ctx = ctx;
        this.getSettings = getSettings;
        this.mode = mode;
        ctx.effect?.(() => () => { for (const pending of this.continuableCreations.values())
            pending.detach(); this.continuableCreations.clear(); });
    }
    captureProvider(provider) { this.providers.add(provider); }
    revokeResidency(agent) { this.collaborators?.revokeParent(agent, "native-run-disposed"); }
    configureAdmission(collaborators) {
        this.collaborators = collaborators;
        return { prepare: (agent, parent, ticket, signal) => this.prepareChildAdmission(agent, parent, ticket, signal),
            validateRole: (agent, parent, candidate) => this.validatePreparedRole(agent, parent, candidate) };
    }
    validateRootRole(agent, admission) {
        this.assertLive(agent);
        const selected = resolveSelectedAgentPreset(agent.session);
        const implicit = !selected?.startsWith("dsmm-") && admission.settings.modules.deepwork.enabled && this.mode.active(agent, admission.settings.defaultActive) ? "dsmm-orchestrator" : undefined;
        const role = selected?.startsWith("dsmm-") ? selected : implicit;
        if (role !== undefined && (!isDsmmRoleId(role) || !admission.settings.modules.deepwork.enabled || !admission.settings.roles[role])) {
            throw new SubagentError("Standing DSMM root role is not admitted", "UNAUTHORIZED");
        }
    }
    recordContinuableCreation(childId, parent, role, invocation, expectedEpoch, signal) {
        signal.throwIfAborted();
        const admitted = this.assertDelegation(parent, role);
        if (admitted.epoch !== expectedEpoch)
            throw new SubagentError("Parent admission changed during continuable preflight", "UNAUTHORIZED");
        const abort = () => { this.continuableCreations.delete(childId); };
        signal.addEventListener("abort", abort, { once: true });
        this.continuableCreations.set(childId, { parent, role, epoch: admitted.epoch, invocation, detach: () => signal.removeEventListener("abort", abort) });
    }
    async prepareChildAdmission(agent, parent, ticket, signal) {
        signal.throwIfAborted();
        ticket.signal.throwIfAborted();
        this.assertLive(agent);
        this.assertLive(parent);
        if (ticket.parent !== parent || this.getSettings.admission?.(parent) !== ticket.admission || ticket.parentEpoch !== ticket.admission.epoch)
            throw new SubagentError("Child preparation requires the exact parent admission ticket", "UNAUTHORIZED");
        const call = this.calls.getStore(), pending = this.continuableCreations.get(agent.id);
        this.continuableCreations.delete(agent.id);
        pending?.detach();
        const descriptor = foldSubagentDescriptor(childOwnedSessionEvents(agent.session));
        let invocation = call?.parent === parent ? currentRoleInvocation(parent, call.role) : pending?.parent === parent ? pending.invocation : undefined;
        if (invocation === undefined && pending?.parent === parent) {
            if (pending.epoch !== ticket.parentEpoch || descriptor?.mode !== "continuable")
                throw new SubagentError("Fresh continuable identity or parent epoch changed", "UNAUTHORIZED");
            const explicit = descriptor.agentProvider === undefined && descriptor.agentModel === undefined && descriptor.agentReasoningEffort === undefined ? undefined
                : { provider: descriptor.agentProvider, model: descriptor.agentModel, reasoningEffort: descriptor.agentReasoningEffort };
            invocation = await resolveRoleInvocation(parent, pending.role, ticket.admission.settings, signal, {}, explicit);
            signal.throwIfAborted();
            ticket.signal.throwIfAborted();
        }
        if (invocation === undefined) {
            if (this.collaborators === undefined)
                throw new SubagentError("Original child evidence resolver is unavailable", "UNAUTHORIZED");
            const evidence = await this.collaborators.resolveOriginalEvidence(ticket, agent.id, signal);
            signal.throwIfAborted();
            ticket.signal.throwIfAborted();
            return { evidence, admission: "mode" in evidence ? createConservativeLegacyAdmission(evidence, ticket.admission, this.collaborators.nativeSubstrate)
                    : admissionFromChildCapture(evidence, this.collaborators.nativeSubstrate), creation: false };
        }
        if ((call?.parent === parent ? call.epoch : pending.epoch) !== ticket.parentEpoch)
            throw new SubagentError("Child invocation parent epoch changed", "UNAUTHORIZED");
        const settings = ticket.admission.settings, parentIdentity = this.identity(parent);
        const filter = inheritToolFilter(parentIdentity.toolFilter, call?.toolFilter ?? (descriptor?.mode === "continuable" ? descriptor.toolFilter : undefined));
        const runtimePolicyCapture = copyJson({ modules: { deepwork: settings.modules.deepwork }, roleRouting: settings.roleRouting,
            runtimePolicy: settings.runtimePolicy, workflow: settings.workflow, guards: settings.guards, runtimeRecovery: settings.runtimeRecovery,
            defaultActive: settings.defaultActive, deepseekV4ProCalibration: settings.deepseekV4ProCalibration,
            deepseekV4ProDefaultReasoningEffort: settings.deepseekV4ProDefaultReasoningEffort, deepseekFlashCalibration: settings.deepseekFlashCalibration,
            deepseekFlashDefaultReasoningEffort: settings.deepseekFlashDefaultReasoningEffort, skills: settings.skills,
            subagents: { enableRunInBackground: settings.subagents.enableRunInBackground, backgroundMode: settings.subagents.backgroundMode } });
        if (invocation.routeSource === "level" || invocation.routeSource === "invocation-route") {
            const { reasoningEffort, ...route } = invocation.initialRoute;
            runtimePolicyCapture.roleRouting[invocation.target] = { ...runtimePolicyCapture.roleRouting[invocation.target],
                primary: { ...route, ...(invocation.exactEffort && reasoningEffort !== undefined ? { reasoningEffort } : {}) },
                fallbackRoutes: invocation.policy.fallbackRoutes.map(route => ({ ...route })) };
        }
        const capture = parseChildAdmissionCapture({ version: 1, childSessionId: agent.id, parentSessionId: parent.id, role: invocation.target,
            profilePin: ticket.admission.profile, originalAdmissionEpoch: ticket.parentEpoch,
            invocation: { level: invocation.effectiveLevel, initialRoute: invocation.initialRoute, routeSource: invocation.routeSource }, runtimePolicyCapture,
            authorityCeiling: { roles: DSMM_ROLE_IDS.filter(id => settings.roles[id]), readOnly: this.readOnly(parentIdentity) || DSMM_ROLES.find(row => row.id === invocation.target).access === "read-only",
                ...(filter === undefined ? {} : { toolFilter: filter }), allowRouteOverride: settings.subagents.allowRouteOverride,
                maxDepth: settings.subagents.maxDepth ?? call?.maxDepth ?? parent.ctx.get("subagents").resolveMaxDepth() },
            ...(settings.locale === undefined ? {} : { locale: settings.locale }), toolTopology: settings.subagents.toolTopology });
        this.preparedInvocations.set(agent, invocation);
        this.preparedCaptures.set(agent, capture);
        return { evidence: capture, admission: admissionFromChildCapture(capture, this.collaborators?.nativeSubstrate ?? settings), creation: true };
    }
    /** Used at A's single awaited completion point; old original epochs remain valid facts. */
    validatePreparedRole(agent, parent, candidate) {
        this.assertLive(agent);
        this.assertLive(parent);
        const evidence = "mode" in candidate.evidence ? parseLegacyChildEvidence(candidate.evidence) : parseChildAdmissionCapture(candidate.evidence);
        if (evidence.childSessionId !== agent.id || evidence.parentSessionId !== parent.id || agent.session.header.parentSession !== parent.id || !this.agents().isOwnedBy(agent.id, parent))
            throw new SubagentError("Child evidence does not match exact native lineage", "UNAUTHORIZED");
        this.assertDelegation(parent, evidence.role);
        const descriptor = foldSubagentDescriptor(childOwnedSessionEvents(agent.session));
        if (descriptor === undefined ? !candidate.creation || this.preparedInvocations.get(agent)?.target !== evidence.role
            : descriptor.provider !== `dsmm-role-${evidence.role.slice(5)}` || !candidate.creation && descriptor.mode !== "continuable") {
            throw new SubagentError("Native descriptor or trusted fresh invocation does not match the original role", "UNAUTHORIZED");
        }
        const original = candidate.admission;
        if (!original.settings.modules.deepwork.enabled || !original.settings.roles[evidence.role])
            throw new SubagentError("Original child role/module is disabled", "UNAUTHORIZED");
        if (descriptor?.mode === "continuable") {
            const route = "mode" in evidence ? evidence.route : evidence.invocation.initialRoute;
            if (descriptor.agentProvider !== undefined && descriptor.agentProvider !== route.provider || descriptor.agentModel !== undefined && descriptor.agentModel !== route.model
                || descriptor.agentReasoningEffort !== undefined && descriptor.agentReasoningEffort !== route.reasoningEffort)
                throw new SubagentError("Original route does not match native descriptor provenance", "UNAUTHORIZED");
        }
        const prior = liveIdentities.get(agent);
        if (candidate.retained && prior !== undefined) {
            if (prior.identity.parent !== parent || prior.identity.role !== evidence.role || prior.identity.epoch !== original.epoch || prior.admission !== original)
                throw new SubagentError("Retained role identity or original admission reference cannot be replaced", "UNAUTHORIZED");
            return;
        }
        let invocation;
        let filter;
        let readOnly;
        if ("mode" in evidence) {
            if (evidence.depth !== delegationDepthOf(agent))
                throw new SubagentError("Legacy depth evidence does not match its physical native lineage", "UNAUTHORIZED");
            const safe = evidence.toolFilter?.allow?.filter(name => readonlyRoleTool(name, original.settings) && !["interrupt_agent", "job_kill"].includes(name)) ?? [];
            filter = inheritToolFilter({ allow: safe }, evidence.toolFilter);
            readOnly = true;
            invocation = freezeSettings({ target: evidence.role, effectiveLevel: "normal", routeSource: "inherited", initialRoute: evidence.route,
                candidates: [evidence.route], exactEffort: evidence.route.reasoningEffort !== undefined, policy: { ...resolveRoleRuntimePolicy(original.settings, evidence.role), primary: evidence.route, fallbackRoutes: [] } });
        }
        else {
            if (candidate.creation && JSON.stringify(this.preparedCaptures.get(agent)) !== JSON.stringify(evidence))
                throw new SubagentError("Fresh capture does not match its trusted prepared invocation and ceiling", "UNAUTHORIZED");
            if (original.epoch !== evidence.originalAdmissionEpoch || candidate.creation && this.getSettings.admission?.(parent).epoch !== evidence.originalAdmissionEpoch)
                throw new SubagentError("Original capture or creation epoch does not match", "UNAUTHORIZED");
            const depth = delegationDepthOf(agent);
            if (depth > evidence.authorityCeiling.maxDepth)
                throw new SubagentError("Original child depth ceiling is exceeded", "UNAUTHORIZED");
            readOnly = evidence.authorityCeiling.readOnly;
            if (!readOnly && DSMM_ROLES.find(row => row.id === evidence.role).access === "read-only")
                throw new SubagentError("Original capture cannot weaken read-only role identity", "UNAUTHORIZED");
            filter = evidence.authorityCeiling.toolFilter;
            const nativeFilter = descriptor?.mode === "continuable" ? descriptor.toolFilter : undefined;
            if (nativeFilter !== undefined && JSON.stringify(inheritToolFilter(filter, nativeFilter)) !== JSON.stringify(filter))
                throw new SubagentError("Original capture exceeds native descriptor tool restriction", "UNAUTHORIZED");
            const policy = resolveRoleRuntimePolicy(original.settings, evidence.role);
            const level = evidence.invocation.level === "normal" ? undefined : original.settings.roleRouting[evidence.role]?.levels?.[evidence.invocation.level];
            const fallbacks = policy.fallbackRoutes;
            invocation = freezeSettings({ target: evidence.role, effectiveLevel: evidence.invocation.level, routeSource: evidence.invocation.routeSource,
                initialRoute: evidence.invocation.initialRoute, candidates: [evidence.invocation.initialRoute, ...fallbacks],
                exactEffort: evidence.invocation.routeSource === "invocation-route" ? policy.primary?.reasoningEffort !== undefined
                    : evidence.invocation.routeSource === "level" && level?.reasoningEffort !== undefined,
                policy: { ...policy, primary: evidence.invocation.initialRoute, fallbackRoutes: fallbacks } });
            const fresh = this.preparedInvocations.get(agent);
            if (candidate.creation && fresh !== undefined)
                invocation = fresh;
        }
        const identity = Object.freeze({ role: evidence.role, child: true, parent, epoch: original.epoch, readOnly,
            ...(filter === undefined ? {} : { toolFilter: inheritToolFilter(undefined, filter) }) });
        this.captureIdentity(agent, identity, original);
        bindRoleInvocation(agent, invocation, "mode" in evidence ? undefined : evidence);
        captureRoleRuntimePolicy(original.settings, evidence.role, invocation.policy);
        const call = this.calls.getStore();
        if (candidate.creation && call?.parent === parent && call.role === evidence.role)
            call.admittedChild?.(agent);
        this.preparedInvocations.delete(agent);
        this.preparedCaptures.delete(agent);
    }
    assertChildDelivery(ticket, childId, raw) {
        ticket.signal.throwIfAborted();
        this.assertLive(ticket.parent);
        if (this.getSettings.admission?.(ticket.parent) !== ticket.admission || ticket.admission.epoch !== ticket.parentEpoch)
            throw new SubagentError("Delivery parent admission changed", "UNAUTHORIZED");
        const evidence = "mode" in raw ? parseLegacyChildEvidence(raw) : parseChildAdmissionCapture(raw);
        if (evidence.childSessionId !== childId || evidence.parentSessionId !== ticket.parent.id)
            throw new SubagentError("Delivery evidence is not this direct child", "UNAUTHORIZED");
        this.assertDelegation(ticket.parent, evidence.role);
        const depth = delegationDepthOf(ticket.parent) + 1;
        const maximum = ticket.admission.settings.subagents.maxDepth ?? ticket.parent.ctx.get("subagents")?.resolveMaxDepth();
        if (maximum !== undefined && depth > maximum || !("mode" in evidence) && depth > evidence.authorityCeiling.maxDepth)
            throw new SubagentError("Delivery exceeds the original or current delegation depth ceiling", "UNAUTHORIZED");
        if (!("mode" in evidence) && (!evidence.runtimePolicyCapture.modules.deepwork.enabled || !evidence.authorityCeiling.roles.includes(evidence.role)))
            throw new SubagentError("Original child role is not permitted", "UNAUTHORIZED");
    }
    readOnly(identity) { return identity.readOnly === true || DSMM_ROLES.find(row => row.id === identity.role)?.access === "read-only"; }
    agents() {
        const registry = this.ctx.get?.("agents");
        if (registry === undefined)
            throw new SubagentError("DSMM delegation requires native live Agent ownership", "UNAUTHORIZED");
        return registry;
    }
    assertLive(agent) {
        if (agent.id === undefined || this.agents().get(agent.id) !== agent)
            throw new SubagentError("DSMM delegation requires the exact live Agent", "UNAUTHORIZED");
    }
    /** Core fence runs before native prompt/body assembly or provider execution. */
    assertModuleAdmission(agent) {
        this.assertLive(agent);
        const settings = this.getSettings(agent);
        const selected = agent.ctx?.get?.("agentPresets")?.composedPreset(agent.ctx)
            ?? resolveSelectedAgentPreset(agent.session);
        const descriptor = foldSubagentDescriptor(childOwnedSessionEvents(agent.session));
        const provider = descriptor === undefined ? undefined : this.ctx.get?.("subagents")?.getProvider(descriptor.provider);
        const providerRole = descriptor?.provider.startsWith("dsmm-role-") && (provider === undefined || this.providers.has(provider))
            ? `dsmm-${descriptor.provider.slice("dsmm-role-".length)}` : undefined;
        if (agent.session.header?.origin !== "subagent" && selected?.startsWith("dsmm-")
            && !isDsmmRoleId(selected))
            throw new SubagentError("DSMM unknown standing root is not admitted", "UNAUTHORIZED");
        const implicit = agent.session.header?.origin !== "subagent" && settings.modules.deepwork.enabled && this.mode.active(agent, settings.defaultActive) ? "dsmm-orchestrator" : undefined;
        const role = providerRole ?? (isDsmmRoleId(selected) ? selected : implicit);
        if (role !== undefined && (!settings.modules.deepwork.enabled || !isDsmmRoleId(role) || !settings.roles[role])) {
            throw new SubagentError("Deepwork module or role is not admitted in this Agent; standing presets and child resume cannot enable it", "UNAUTHORIZED");
        }
    }
    identity(agent) {
        this.assertLive(agent);
        const existing = liveIdentities.get(agent)?.identity;
        if (existing?.child)
            return existing;
        const parent = this.agents().list().find((row) => row !== agent && this.agents().isOwnedBy(agent.id, row));
        if (parent !== undefined) {
            if (existing === undefined)
                throw new SubagentError("DSMM child role identity was not admitted", "UNAUTHORIZED");
            return existing;
        }
        const settings = this.getSettings(agent);
        const selected = agent.ctx?.get?.("agentPresets")?.composedPreset(agent.ctx);
        const role = isDsmmRoleId(selected) ? selected : settings.modules.deepwork.enabled && agent.session.header?.origin !== "subagent" && this.mode.active(agent, settings.defaultActive) ? "dsmm-orchestrator" : undefined;
        return Object.freeze({ role, child: agent.session.header?.origin === "subagent", epoch: this.getSettings.admission?.(agent).epoch ?? "trusted-direct" });
    }
    targets(agent) {
        const identity = this.identity(agent);
        const settings = this.getSettings(agent);
        if (!settings.modules.deepwork.enabled || identity.role === undefined || !settings.roles[identity.role])
            return [];
        return allowedRoleChildren(identity.role, identity.child).filter((role) => settings.roles[role]
            && (!this.readOnly(identity) || DSMM_ROLES.find(row => row.id === role).access === "read-only")
            && (identity.toolFilter?.allow === undefined || identity.toolFilter.allow.includes(roleToolName(role)))
            && !identity.toolFilter?.deny?.includes(roleToolName(role)));
    }
    assertDelegation(parent, role) {
        const identity = this.identity(parent);
        if (!this.targets(parent).includes(role))
            throw new SubagentError(`DSMM ${identity.role ?? "unadmitted Agent"} cannot delegate ${role}`, "UNAUTHORIZED");
        return { parent, role, epoch: identity.epoch };
    }
    duringDelegation(parent, role, operation, toolFilter, maxDepth, admittedChild) {
        const identity = this.assertDelegation(parent, role), outer = this.calls.getStore();
        const upstream = outer?.parent === parent && outer.role === role && outer.epoch === identity.epoch ? outer.admittedChild : undefined;
        const notify = admittedChild === undefined ? upstream : upstream === undefined ? admittedChild : (agent) => { upstream(agent); admittedChild(agent); };
        return this.calls.run({ ...identity, toolFilter, maxDepth, admittedChild: notify }, operation);
    }
    prepareContinuable(parent, role, signal) {
        signal.throwIfAborted();
        return this.assertDelegation(parent, role);
    }
    admit(agent) {
        this.assertLive(agent);
        const agents = this.agents();
        const parent = agents.list().find((row) => row !== agent && agents.isOwnedBy(agent.id, row));
        const existing = liveIdentities.get(agent);
        if (existing !== undefined) {
            // A retained child owns its original capture, not its parent's newer
            // mode/profile or a reinstall's replacement settings getter.
            if (parent === undefined || existing.identity.parent !== parent || existing.readEpoch() !== existing.identity.epoch) {
                throw new SubagentError("DSMM retained child admission no longer matches its exact owner or captured epoch", "UNAUTHORIZED");
            }
            this.assertLive(parent);
            return existing.identity;
        }
        if (parent === undefined)
            return this.identity(agent);
        const original = this.getSettings.admission?.(agent);
        if (original?.childCapture !== undefined) {
            this.validatePreparedRole(agent, parent, { evidence: original.childCapture, admission: original, creation: false, retained: false });
            return liveIdentities.get(agent).identity;
        }
        throw new SubagentError("DSMM child requires the completed original role/capture admission; generic spawn cannot bypass delegation policy", "UNAUTHORIZED");
    }
    captureIdentity(agent, identity, admission) {
        liveIdentities.set(agent, { identity, admission, readEpoch: () => this.getSettings.admission?.(agent).epoch ?? "trusted-direct" });
        return identity;
    }
    captureTools(agent, tools, controlledNames = [], reset = false) {
        const realm = Reflect.get(tools, symbols.original) ?? tools;
        const previous = toolIdentities.get(agent);
        const definitions = previous === undefined || reset || previous.realm !== realm ? new Map() : previous.definitions;
        for (const schema of tools.schemas(agent)) {
            if (previous === undefined || reset || previous.realm !== realm || controlledNames.includes(schema.name))
                definitions.set(schema.name, tools.get(schema.name, agent));
        }
        toolIdentities.set(agent, { realm, definitions });
    }
    toolDenial(agent, name, tools, execution) {
        const identity = this.identity(agent);
        const settings = this.getSettings(agent);
        // With no DW role/module in this admission, same-named host tools are host-owned.
        const controlled = name === "dsmm_role" || name === "dsmm_category";
        const target = !settings.modules.deepwork.enabled && identity.role === undefined ? undefined : roleFromToolName(name);
        const readonly = identity.readOnly || DSMM_ROLES.find((row) => row.id === identity.role)?.access === "read-only";
        if (tools !== undefined && (readonly || target !== undefined || controlled)) {
            const admitted = toolIdentities.get(agent);
            if (admitted === undefined || admitted.realm !== (Reflect.get(tools, symbols.original) ?? tools)
                || admitted.definitions.get(name) !== tools.get(name, agent))
                return "DSMM tool definition was not admitted in this exact Agent realm";
        }
        if (target !== undefined)
            return DSMM_ROLES.find(row => row.id === target).kind !== "role" || settings.subagents.toolTopology !== "per-role" ? "DSMM obsolete per-target entry is not callable in this topology"
                : this.targets(agent).includes(target) ? undefined : `DSMM delegation to ${target} is not permitted`;
        if (controlled) {
            const kind = name === "dsmm_role" ? "role" : "category";
            if (name === "dsmm_role" && settings.subagents.toolTopology !== "parameterized" || !this.targets(agent).some(role => DSMM_ROLES.find(row => row.id === role).kind === kind))
                return "DSMM merged delegation entry is not admitted";
            // Native merged-entry restrictions and the per-target ceiling both apply.
            if (identity.toolFilter?.allow !== undefined && !identity.toolFilter.allow.includes(name) || identity.toolFilter?.deny?.includes(name))
                return "DSMM native filter does not permit this merged entry";
            return undefined;
        }
        if (identity.toolFilter?.allow !== undefined && !identity.toolFilter.allow.includes(name) && name !== "structured_output"
            || identity.toolFilter?.deny?.includes(name))
            return "DSMM child native toolFilter does not permit this tool";
        if (name === "send_message" && liveIdentities.get(agent)?.admission?.childEvidence?.mode === "legacy-conservative") {
            const realm = tools ?? agent.ctx.get("tools"), parent = identity.parent;
            const capability = realm === undefined ? undefined : this.collaborators?.classifyLegacyTool?.(name, realm, agent);
            if (parent === undefined || realm === undefined || capability?.kind !== "child-report" || realm.get(name, agent) !== capability.definition)
                return "DSMM legacy report requires its audited native capability";
            try {
                this.assertLive(parent);
                this.assertDelegation(parent, identity.role);
                if (execution !== undefined) {
                    capability.assertArguments(execution.arguments);
                    const args = execution.arguments;
                    if (args === null || typeof args !== "object" || args.agent_id !== parent.id)
                        return "DSMM legacy report destination must be this exact direct parent";
                }
            }
            catch {
                return "DSMM legacy report arguments or current parent authority are not admitted";
            }
        }
        if (readonly && !readonlyRoleTool(name, settings))
            return "DSMM read-only role does not permit this tool";
        if (identity.role === undefined)
            return identity.child && settings.modules.deepwork.enabled && ["subagent", "spawn", "fork"].includes(name) ? "DSMM unadmitted children cannot delegate" : undefined;
        if (!settings.modules.deepwork.enabled || !settings.roles[identity.role])
            return "DSMM role is disabled in this Agent admission";
        if (["subagent", "spawn", "fork"].includes(name))
            return "Use the admitted DSMM role tools; generic delegation is not a role-policy bypass";
        return undefined;
    }
    installDrain(agent) {
        const native = agent.ctx;
        if (native === undefined)
            throw new Error("DSMM native role lifecycle requires an Agent context");
        native.effect(() => async () => {
            this.collaborators?.revokeParent?.(agent, "role-residency-disposed");
            const agents = this.agents();
            if (agents.get(agent.id) !== agent)
                throw new Error("DSMM Agent was detached before continuable descendants drained");
            await native.get("subagents")?.drainContinuableDescendants([agent]);
            liveIdentities.delete(agent);
            toolIdentities.delete(agent);
        });
    }
}
//# sourceMappingURL=role-policy.js.map