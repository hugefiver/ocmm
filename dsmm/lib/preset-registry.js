import { Context as NativeContext, getTraceable } from "@deepseek-ai/cordis";
import { DSMM_ROLES, DSMM_ROLE_IDS, rolePluginRows } from "./roles.js";
import { enabledSkillNames } from "./skills.js";
import { allowedRoleChildren, readonlyRoleTool, roleFromToolName, READONLY_ROLE_DENIED_TOOLS } from "./role-policy.js";
import { nativeStandingFullAccess } from "./permission-native-access.js";
import { scopeParentOf } from "./native-scope.js";
/** Declare roles to DSH 0.2's native registry; directories are not discovery inputs. */
export function registerRolePresets(ctx, getSettings) {
    const install = async (readyCtx) => {
        const registry = readyCtx.get?.("agentPresets")
            ?? readyCtx.agentPresets;
        if (registry === undefined)
            throw new Error("dsmm requires the native DSH agentPresets registry");
        const settings = getSettings();
        const enabled = DSMM_ROLE_IDS.filter((id) => settings.modules.deepwork.enabled && settings.roles[id]);
        const active = DSMM_ROLES.filter((role) => enabled.includes(role.id));
        const disposers = [];
        try {
            for (const role of active) {
                disposers.push(await registry.register({
                    id: role.id,
                    name: role.name,
                    description: role.description,
                    order: role.order,
                    // Profiles do not replace standing native compositions. Child routes
                    // are admitted by the role provider from the parent's fixed snapshot.
                    plugins: rolePluginRows(role, enabledSkillNames(settings), enabled)
                }));
            }
            // A direct selection of a read-only preset must be restricted at the Agent
            // scope: preset-local fs registrations cannot be filtered within their own layer.
            // Blank Agents can switch presets without another agent/created event.
            const states = new WeakMap();
            const restrictedAgents = new Set();
            const denial = (agent, name) => {
                const role = registry.composedPreset(agent.ctx);
                if (!isReadonlyRole(role))
                    return undefined;
                const target = roleFromToolName(name);
                return target === undefined ? readonlyRoleTool(name, settings) ? undefined : "dsmm read-only role does not permit this tool"
                    : allowedRoleChildren(role).includes(target) && settings.roles[target] ? undefined : "dsmm read-only role does not permit this delegation";
            };
            const reconcile = (agent) => {
                const selected = registry.composedPreset(agent.ctx);
                const previous = states.get(agent);
                if (previous !== undefined && previous.role === selected && (previous.pending || !isReadonlyRole(selected) || previous.disposeRestriction !== undefined))
                    return;
                states.set(agent, { role: selected, pending: true });
                previous?.disposeRestriction?.();
                restrictedAgents.delete(agent);
                if (!isReadonlyRole(selected)) {
                    states.set(agent, { role: selected });
                    return;
                }
                const raw = registry.serviceFor?.(agent, "tools");
                // Cordis throws on an uninjected direct property read. Prefer the
                // selected preset's raw service and trace it into this Agent scope;
                // an unrelated Host tools service may coexist in another realm.
                const tools = raw !== undefined ? getTraceable(agent.ctx, raw)
                    : agent.ctx.get?.("tools")
                        ?? (agent.ctx.get === undefined ? agent.ctx.tools : undefined);
                try {
                    if (tools?.restrict === undefined)
                        throw new Error(`dsmm read-only role requires DSH tools restrict: ${selected}`);
                    restrictedAgents.add(agent);
                    // Only inherited tools are maskable; own-layer tools remain subject to runtime denial.
                    const inheritedScope = scopeParentOf(agent);
                    const disposeRestriction = tools.restrict({ deny: READONLY_ROLE_DENIED_TOOLS.filter(name => tools.get(name, inheritedScope) !== undefined) });
                    states.set(agent, { role: selected, disposeRestriction });
                }
                catch (error) {
                    states.set(agent, { role: selected });
                    restrictedAgents.delete(agent);
                    throw error;
                }
            };
            const agents = readyCtx.get?.("agents")
                ?? readyCtx.agents;
            if (agents === undefined)
                throw new Error("dsmm native preset restriction requires DSH Agent registry");
            const onPreExecute = readyCtx.on?.("tools/pre-execute", async (execution, next) => {
                const agent = execution.agent;
                if (agent === undefined || agents.get(agent.id) !== agent)
                    return next();
                const full = NativeContext.is(readyCtx) && nativeStandingFullAccess(readyCtx, agent);
                if (full && !READONLY_ROLE_DENIED_TOOLS.includes(execution.name))
                    return next();
                const reason = denial(agent, execution.name);
                return reason === undefined ? next() : { kind: "deny", reason };
            }, { global: true, prepend: true });
            const onCreated = readyCtx.on?.("agent/created", ({ agent }) => reconcile(agent), { global: true });
            const onToolChange = readyCtx.on?.("tools/change", () => {
                for (const agent of agents.list())
                    reconcile(agent);
            }, { global: true });
            const onSelection = readyCtx.on?.("agent-preset/selected", (sessionId) => {
                const agent = agents.get(sessionId);
                if (agent !== undefined)
                    reconcile(agent);
            }, { global: true });
            const onDisposed = readyCtx.on?.("agent/disposed", ({ agent }) => {
                states.get(agent)?.disposeRestriction?.();
                states.delete(agent);
                restrictedAgents.delete(agent);
            }, { global: true });
            readyCtx.effect?.(() => () => {
                if (typeof onCreated === "function")
                    onCreated();
                if (typeof onPreExecute === "function")
                    onPreExecute();
                if (typeof onToolChange === "function")
                    onToolChange();
                if (typeof onSelection === "function")
                    onSelection();
                if (typeof onDisposed === "function")
                    onDisposed();
                for (const agent of restrictedAgents) {
                    states.get(agent)?.disposeRestriction?.();
                }
                restrictedAgents.clear();
                for (const dispose of disposers.reverse())
                    void dispose();
            });
        }
        catch (error) {
            for (const dispose of disposers.reverse())
                await dispose();
            throw error;
        }
    };
    if (ctx.inject !== undefined) {
        if (ctx.get?.("agentPresets") !== undefined)
            return install(ctx);
        return Promise.resolve(ctx.inject(["agentPresets"], install)).then(() => undefined);
    }
    else if (ctx.get?.("agentPresets") !== undefined || ctx.agentPresets !== undefined) {
        void install(ctx).catch((error) => ctx.logger?.warn(`dsmm native preset registration failed: ${String(error)}`));
    }
}
function isReadonlyRole(id) {
    return DSMM_ROLES.some((role) => role.id === id && role.access === "read-only");
}
//# sourceMappingURL=preset-registry.js.map