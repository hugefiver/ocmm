import type { DshContext } from "./dsh-types.js";
import { getTraceable } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import { DSMM_ROLES, DSMM_ROLE_IDS, rolePluginRows } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import { enabledSkillNames } from "./skills.js";
import type { DsmmSettings } from "./settings.js";

interface NativePresetRegistry {
  register(definition: {
    id: string;
    name: string;
    description: string;
    order: number;
    plugins: ReturnType<typeof rolePluginRows>;
  }): Promise<() => Promise<void>>;
  composedPreset(ctx: unknown): string | undefined;
  serviceFor?(agent: NativeAgent, name: "tools"): NativeScopedTools | undefined;
}

interface NativeScopedTools {
  restrict(filter: { deny: string[] }): () => void;
  guard(callback: (execution: { name: string; agent?: NativeAgent }) => string | undefined): () => void;
}

interface NativeAgent {
  ctx: { tools?: NativeScopedTools; get?<T>(name: string): T | undefined };
}

interface NativeAgentRegistry {
  list(): NativeAgent[];
  get(id: string): NativeAgent | undefined;
}

/** Declare roles to DSH 0.2's native registry; directories are not discovery inputs. */
export function registerRolePresets(ctx: DshContext, getSettings: () => DsmmSettings): void {
  const install = async (readyCtx: DshContext): Promise<void> => {
    const registry = readyCtx.get?.<NativePresetRegistry>("agentPresets")
      ?? (readyCtx as DshContext & { agentPresets?: NativePresetRegistry }).agentPresets;
    if (registry === undefined) throw new Error("dsmm requires the native DSH agentPresets registry");
    const settings = getSettings();
    const enabled = DSMM_ROLE_IDS.filter((id) => settings.roles[id]);
    const active = DSMM_ROLES.filter((role) => enabled.includes(role.id));
    const disposers: Array<() => Promise<void>> = [];
    try {
      for (const role of active) {
        disposers.push(await registry.register({
          id: role.id,
          name: role.name,
          description: role.description,
          order: role.order,
          plugins: rolePluginRows(role, enabledSkillNames(settings), enabled, settings.roleRouting)
        }));
      }

      // A direct selection of a read-only preset must be restricted at the Agent
      // scope: preset-local fs registrations cannot be filtered within their own layer.
      // Blank Agents can switch presets without another agent/created event.
      const states = new WeakMap<NativeAgent, { role: string | undefined; disposeRestriction?: () => void; disposeGuard?: () => void; pending?: boolean }>();
      const restrictedAgents = new Set<NativeAgent>();
      const reconcile = (agent: NativeAgent): void => {
        const selected = registry.composedPreset(agent.ctx);
        const previous = states.get(agent);
        if (previous !== undefined && previous.role === selected && (previous.pending || !isReadonlyRole(selected) || previous.disposeRestriction !== undefined)) return;
        states.set(agent, { role: selected, pending: true });
        previous?.disposeRestriction?.();
        previous?.disposeGuard?.();
        restrictedAgents.delete(agent);
        if (!isReadonlyRole(selected)) {
          states.set(agent, { role: selected });
          return;
        }
        const raw = registry.serviceFor?.(agent, "tools");
        // Cordis throws on an uninjected direct property read. Prefer the
        // selected preset's raw service and trace it into this Agent scope;
        // an unrelated Host tools service may coexist in another realm.
        const tools = raw !== undefined ? getTraceable(agent.ctx as Context, raw)
          : agent.ctx.get?.<NativeScopedTools>("tools")
            ?? (agent.ctx.get === undefined ? agent.ctx.tools : undefined);
        try {
          if (tools?.restrict === undefined || tools.guard === undefined) throw new Error(`dsmm read-only role requires DSH tools guard/restrict: ${selected}`);
          const disposeGuard = tools.guard((execution) => {
            if (execution.agent !== agent || !isReadonlyRole(registry.composedPreset(agent.ctx))) return undefined;
            return ["write", "edit", "bash", "pwsh"].includes(execution.name) || execution.name.startsWith("dsmm_")
              ? "dsmm read-only role does not permit mutation or delegation" : undefined;
          });
          states.set(agent, { role: selected, disposeGuard, pending: true });
          restrictedAgents.add(agent);
          const disposeRestriction = tools.restrict({ deny: ["write", "edit"] });
          states.set(agent, { role: selected, disposeGuard, disposeRestriction });
        } catch (error) {
          if (states.get(agent)?.disposeGuard === undefined) states.delete(agent);
          else states.set(agent, { role: selected, disposeGuard: states.get(agent)?.disposeGuard });
          throw error;
        }
      };
      const onCreated = readyCtx.on?.("agent/created", ({ agent }: { agent: NativeAgent }) => reconcile(agent), { global: true });
      const agents = readyCtx.get?.<NativeAgentRegistry>("agents")
        ?? (readyCtx as DshContext & { agents?: NativeAgentRegistry }).agents;
      if (agents === undefined) throw new Error("dsmm native preset restriction requires DSH Agent registry");
      const onToolChange = readyCtx.on?.("tools/change", () => {
        for (const agent of agents.list()) reconcile(agent);
      }, { global: true });
      const onSelection = readyCtx.on?.("agent-preset/selected", (sessionId: string) => {
        const agent = agents.get(sessionId);
        if (agent !== undefined) reconcile(agent);
      }, { global: true });
      const onDisposed = readyCtx.on?.("agent/disposed", ({ agent }: { agent: NativeAgent }) => {
        states.get(agent)?.disposeRestriction?.();
        states.get(agent)?.disposeGuard?.();
        states.delete(agent);
        restrictedAgents.delete(agent);
      }, { global: true });

      readyCtx.effect?.(() => () => {
        if (typeof onCreated === "function") onCreated();
        if (typeof onToolChange === "function") onToolChange();
        if (typeof onSelection === "function") onSelection();
        if (typeof onDisposed === "function") onDisposed();
        for (const agent of restrictedAgents) {
          states.get(agent)?.disposeRestriction?.();
          states.get(agent)?.disposeGuard?.();
        }
        restrictedAgents.clear();
        for (const dispose of disposers.reverse()) void dispose();
      });
    } catch (error) {
      for (const dispose of disposers.reverse()) await dispose();
      throw error;
    }
  };

  if (ctx.inject !== undefined) {
    ctx.inject(["agentPresets"], install);
  } else if (ctx.get?.("agentPresets") !== undefined || (ctx as DshContext & { agentPresets?: NativePresetRegistry }).agentPresets !== undefined) {
    void install(ctx).catch((error: unknown) => ctx.logger?.warn(`dsmm native preset registration failed: ${String(error)}`));
  }
}

function isReadonlyRole(id: string | undefined): id is DsmmRoleId {
  return DSMM_ROLES.some((role) => role.id === id && role.access === "read-only");
}
