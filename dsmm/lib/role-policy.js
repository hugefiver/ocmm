import { AsyncLocalStorage } from "node:async_hooks";
import { foldSubagentDescriptor, SubagentError } from "@deepseek-ai/dsh-subagent";
import { symbols } from "@deepseek-ai/cordis";
import { DSMM_ROLES, isDsmmRoleId } from "./roles.js";
import { childOwnedSessionEvents, resolveEffectiveDsmmRole, resolveSelectedAgentPreset } from "./session-scope.js";
const liveIdentities = new WeakMap();
const toolIdentities = new WeakMap();
function inheritToolFilter(parent, requested) {
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
export function allowedRoleChildren(role, child = false) {
    const definition = DSMM_ROLES.find((row) => row.id === role);
    return child && role === "dsmm-builder" ? definition.childBuilderAllowedChildren ?? [] : definition.allowedChildren;
}
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
    constructor(ctx, getSettings, mode) {
        this.ctx = ctx;
        this.getSettings = getSettings;
        this.mode = mode;
    }
    captureProvider(provider) { this.providers.add(provider); }
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
        const role = providerRole ?? (isDsmmRoleId(selected) ? selected : undefined);
        if (role !== undefined && (!settings.modules.deepwork.enabled || !isDsmmRoleId(role))) {
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
        const role = isDsmmRoleId(selected) ? selected : settings.modules.deepwork.enabled && agent.session.header?.origin !== "subagent" && settings.roles["dsmm-orchestrator"] && this.mode.active(agent, settings.defaultActive) ? "dsmm-orchestrator" : undefined;
        return Object.freeze({ role, child: agent.session.header?.origin === "subagent", epoch: this.getSettings.admission?.(agent).epoch ?? "trusted-direct" });
    }
    targets(agent) {
        const identity = this.identity(agent);
        const settings = this.getSettings(agent);
        if (!settings.modules.deepwork.enabled || identity.role === undefined || !settings.roles[identity.role])
            return [];
        return allowedRoleChildren(identity.role, identity.child).filter((role) => settings.roles[role]
            && (identity.toolFilter?.allow === undefined || identity.toolFilter.allow.includes(roleToolName(role)))
            && !identity.toolFilter?.deny?.includes(roleToolName(role)));
    }
    assertDelegation(parent, role) {
        const identity = this.identity(parent);
        if (!this.targets(parent).includes(role))
            throw new SubagentError(`DSMM ${identity.role ?? "unadmitted Agent"} cannot delegate ${role}`, "UNAUTHORIZED");
        return { parent, role, epoch: identity.epoch };
    }
    duringDelegation(parent, role, operation, toolFilter) {
        return this.calls.run({ ...this.assertDelegation(parent, role), toolFilter }, operation);
    }
    prepareContinuable(parent, role, signal) {
        signal.throwIfAborted();
        this.assertDelegation(parent, role);
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
        const parentIdentity = this.identity(parent);
        if (parentIdentity.role === undefined) {
            if (this.getSettings.admission?.(agent).epoch !== this.getSettings.admission?.(parent).epoch)
                throw new SubagentError("DSMM child must inherit its exact parent's admission", "UNAUTHORIZED");
            const identity = Object.freeze({ child: true, parent, epoch: parentIdentity.epoch,
                ...(parentIdentity.readOnly === undefined ? {} : { readOnly: parentIdentity.readOnly }),
                ...(parentIdentity.toolFilter === undefined ? {} : { toolFilter: parentIdentity.toolFilter }) });
            return this.captureIdentity(agent, identity);
        }
        const invocation = this.calls.getStore();
        if (invocation === undefined || invocation.parent !== parent) {
            // A native cold resume already has a descriptor, but only the actual live
            // owner and its captured policy can authorize the new residency.
            const own = agent.session.snapshotEvents().slice(agent.session.inheritedEventCount ?? 0);
            const descriptor = foldSubagentDescriptor(own);
            const candidate = descriptor?.mode === "continuable" ? `dsmm-${descriptor.provider.slice("dsmm-role-".length)}` : undefined;
            if (!descriptor?.provider.startsWith("dsmm-role-") || !isDsmmRoleId(candidate))
                throw new SubagentError("DSMM children require an admitted role provider; generic spawn cannot bypass delegation policy", "UNAUTHORIZED");
            return this.bindChild(agent, parent, candidate, descriptor.mode === "continuable" ? descriptor.toolFilter : undefined);
        }
        if (this.getSettings.admission?.(parent).epoch !== undefined && this.getSettings.admission(parent).epoch !== invocation.epoch)
            throw new SubagentError("DSMM parent admission changed during delegation", "UNAUTHORIZED");
        return this.bindChild(agent, parent, invocation.role, invocation.toolFilter);
    }
    bindChild(agent, parent, role, toolFilter) {
        const admitted = this.assertDelegation(parent, role);
        if (this.getSettings.admission?.(agent).epoch !== this.getSettings.admission?.(parent).epoch)
            throw new SubagentError("DSMM child must inherit its exact parent's admission", "UNAUTHORIZED");
        const parentIdentity = this.identity(parent);
        const inheritedFilter = inheritToolFilter(parentIdentity.toolFilter, toolFilter);
        const identity = Object.freeze({ role, child: true, parent, epoch: admitted.epoch,
            readOnly: parentIdentity.readOnly === true || DSMM_ROLES.find((row) => row.id === parentIdentity.role)?.access === "read-only"
                || DSMM_ROLES.find((row) => row.id === role)?.access === "read-only",
            ...(inheritedFilter === undefined ? {} : { toolFilter: inheritedFilter }) });
        return this.captureIdentity(agent, identity);
    }
    captureIdentity(agent, identity) {
        liveIdentities.set(agent, { identity, readEpoch: () => this.getSettings.admission?.(agent).epoch ?? "trusted-direct" });
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
    toolDenial(agent, name, tools) {
        const identity = this.identity(agent);
        const settings = this.getSettings(agent);
        // With no DW role/module in this admission, same-named host tools are host-owned.
        const target = !settings.modules.deepwork.enabled && identity.role === undefined ? undefined : roleFromToolName(name);
        const readonly = identity.readOnly || DSMM_ROLES.find((row) => row.id === identity.role)?.access === "read-only";
        if (tools !== undefined && (readonly || target !== undefined)) {
            const admitted = toolIdentities.get(agent);
            if (admitted === undefined || admitted.realm !== (Reflect.get(tools, symbols.original) ?? tools)
                || admitted.definitions.get(name) !== tools.get(name, agent))
                return "DSMM tool definition was not admitted in this exact Agent realm";
        }
        if (target !== undefined)
            return this.targets(agent).includes(target) ? undefined : `DSMM delegation to ${target} is not permitted`;
        if (identity.toolFilter?.allow !== undefined && !identity.toolFilter.allow.includes(name) && name !== "structured_output"
            || identity.toolFilter?.deny?.includes(name))
            return "DSMM child native toolFilter does not permit this tool";
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