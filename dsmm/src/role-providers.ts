import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import type { DshContext } from "./dsh-types.js";
import { DSMM_ROLE_IDS } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSettings } from "./settings.js";

export interface DsmmSubagentRegistry {
  getProvider(name: string): SubagentProvider | undefined;
  registerProvider(provider: SubagentProvider): () => void;
}

export function roleProviderName(role: DsmmRoleId): string {
  return `dsmm-role-${role.slice("dsmm-".length)}`;
}

export function roleFromProviderName(provider: string): DsmmRoleId | undefined {
  return DSMM_ROLE_IDS.find((role) => role !== "dsmm-orchestrator" && roleProviderName(role) === provider);
}

const SPAWN_CAPABILITIES = Object.freeze({ agentOptions: true, outputSchema: true, depthLimit: true, toolFilter: true, persona: true });

function supportedSpawn(provider: SubagentProvider | undefined): provider is SubagentProvider {
  return provider !== undefined && provider.name === "spawn" && typeof provider.start === "function"
    && provider.inheritsParentContext === false && provider.agentRouteDefaults === undefined
    && Object.keys(SPAWN_CAPABILITIES).every((key) => provider.capabilities?.[key as keyof typeof SPAWN_CAPABILITIES] === true);
}

/** Only the native outer start owns descriptors, capability admission and returned runs. */
export function registerRoleProviders(ctx: DshContext, getSettings: () => DsmmSettings): void {
  const installed = new WeakSet<DsmmSubagentRegistry>();
  const install = (readyCtx: DshContext): void => {
    const registry = readyCtx.get?.<DsmmSubagentRegistry>("subagents")
      ?? (readyCtx.get === undefined ? readyCtx.subagents : undefined);
    if (registry === undefined || installed.has(registry)) return;
    const disposers: Array<() => void> = [];
    installed.add(registry);
    try {
      const settings = getSettings();
      for (const role of DSMM_ROLE_IDS) {
        if (role === "dsmm-orchestrator" || !settings.roles[role]) continue;
        let active = true;
        const dispose = registry.registerProvider({
          name: roleProviderName(role), capabilities: SPAWN_CAPABILITIES, inheritsParentContext: false,
          start(request) {
            if (!active) return Promise.reject(new Error("dsmm role provider is disposed"));
            const spawn = registry.getProvider("spawn");
            if (!supportedSpawn(spawn)) return Promise.reject(new Error("dsmm role provider requires the supported native spawn capabilities"));
            return spawn.start(request);
          }
        });
        disposers.push(() => { active = false; dispose(); });
      }
      readyCtx.effect?.(() => () => {
        for (const dispose of disposers.reverse()) dispose();
        installed.delete(registry);
      });
    } catch (error) {
      for (const dispose of disposers.reverse()) dispose();
      installed.delete(registry);
      throw error;
    }
  };
  if (ctx.inject !== undefined) ctx.inject(["subagents"], install);
  else install(ctx);
}
