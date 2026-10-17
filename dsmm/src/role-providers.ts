import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import type { Agent, AgentOptions } from "@deepseek-ai/dsh-agent";
import { SubagentError } from "@deepseek-ai/dsh-subagent";
import type { DshAgent, DshContext } from "./dsh-types.js";
import { DSMM_ROLE_IDS, roleProviderName } from "./roles.js";
export { roleProviderName } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSettings, DsmmSettingsGetter } from "./settings.js";
import { currentRoleInvocation, invocationAgentOptions, resolveRoleInvocation } from "./role-invocation.js";
import { currentManagedCreation } from "./agent-registry.js";
import type { DsmmRolePolicy } from "./role-policy.js";

export interface DsmmSubagentRegistry {
  getProvider(name: string): SubagentProvider | undefined;
  registerProvider(provider: SubagentProvider): () => void;
  resolveMaxDepth?(configured?: number): number | undefined;
}

export function roleFromProviderName(provider: string): DsmmRoleId | undefined {
  return DSMM_ROLE_IDS.find((role) => role !== "dsmm-orchestrator" && roleProviderName(role) === provider);
}

const NO_CAPABILITIES = Object.freeze({ agentOptions: false, outputSchema: false, depthLimit: false, agentPreset: false });

function supportedSpawn(provider: SubagentProvider | undefined): provider is SubagentProvider {
  return provider !== undefined && provider.name === "spawn" && typeof provider.prepareContinuable === "function"
    && provider.inheritsParentContext === false && provider.agentRouteDefaults === undefined;
}

export async function roleAgentOptions(parent: Agent, role: DsmmRoleId, settings: DsmmSettings, signal: AbortSignal, explicit?: AgentOptions): Promise<AgentOptions | undefined> {
  const invocation = currentRoleInvocation(parent as unknown as DshAgent, role) ?? await resolveRoleInvocation(parent, role, settings, signal, {}, explicit);
  return invocationAgentOptions(invocation, explicit);
}

/** The native manager owns descriptors, capability admission and activations. */
export function registerRoleProviders(ctx: DshContext, getSettings: DsmmSettingsGetter, getDeploymentSettings: DsmmSettingsGetter = getSettings, policy?: DsmmRolePolicy): void {
  const installed = new WeakSet<DsmmSubagentRegistry>();
  const install = (readyCtx: DshContext): void => {
    const registry = readyCtx.get?.<DsmmSubagentRegistry>("subagents")
      ?? (readyCtx.get === undefined ? readyCtx.subagents : undefined);
    if (registry === undefined || installed.has(registry)) return;
    const disposers: Array<() => void> = [];
    installed.add(registry);
    try {
      const settings = getDeploymentSettings();
      if (!settings.modules.deepwork.enabled) return;
      for (const role of DSMM_ROLE_IDS) {
        if (role === "dsmm-orchestrator" || !settings.roles[role]) continue;
        let active = true;
        const dispose = registry.registerProvider({
          name: roleProviderName(role),
          get capabilities() { const spawn = registry.getProvider("spawn"); return supportedSpawn(spawn) ? spawn.capabilities : NO_CAPABILITIES; },
          inheritsParentContext: false,
          get prepareContinuable() {
            const spawn = registry.getProvider("spawn");
            return async (request: Parameters<NonNullable<SubagentProvider["prepareContinuable"]>>[0]) => {
              if (!supportedSpawn(spawn) || spawn.prepareContinuable === undefined) throw new SubagentError("DSMM requires a local spawn provider", "UNSUPPORTED_CAPABILITY");
              if (!active || registry.getProvider("spawn") !== spawn) throw new SubagentError("DSMM native continuable provider changed", "NO_PROVIDER");
              const admitted = getSettings(request.parent as unknown as DshAgent);
              if (!admitted.modules.deepwork.enabled || !admitted.roles[role]) throw new SubagentError("DSMM module or role is disabled", "UNAUTHORIZED");
              const operation = currentManagedCreation();
              if (operation?.kind !== "fresh" || operation.parent !== request.parent || operation.childId !== request.sessionId) throw new SubagentError("DSMM role requires its managed creation operation", "UNAUTHORIZED");
              if (operation.delegationMode === "continuable" && (!admitted.subagents.enableRunInBackground || admitted.subagents.backgroundMode !== "continuable")) throw new SubagentError("DSMM continuable delegation requires explicit admitted opt-in", "UNAUTHORIZED");
              const preparing = policy?.prepareContinuable(request.parent as unknown as DshAgent, role, request.signal);
              const invocation = currentRoleInvocation(request.parent as unknown as DshAgent, role);
              request.signal.throwIfAborted();
              if (!active || registry.getProvider("spawn") !== spawn) throw new SubagentError("DSMM continuable provider changed during preflight", "NO_PROVIDER");
              if (preparing !== undefined) policy!.recordContinuableCreation(request.sessionId, request.parent as unknown as DshAgent, role, invocation, preparing.epoch, request.signal);
              const prepared = await spawn.prepareContinuable!(request);
              if (prepared.seed !== undefined) throw new SubagentError("DSMM spawn cannot inherit parent history", "UNSUPPORTED_CAPABILITY");
              return prepared;
            };
          }
        });
        const provider = registry.getProvider(roleProviderName(role));
        if (provider !== undefined) policy?.captureProvider(provider);
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
