import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import { parentAgentOptionsForDelegation } from "@deepseek-ai/dsh-subagent";
import { ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import type { DshAgent, DshContext, DshLlmRuntime } from "./dsh-types.js";
import { DSMM_ROLE_IDS } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSettingsGetter } from "./settings.js";
import { resolveRoleRuntimePolicy } from "./routing-policy.js";
import { selectInitialModelRoute } from "./role-routing.js";

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
export function registerRoleProviders(ctx: DshContext, getSettings: DsmmSettingsGetter, getDeploymentSettings: DsmmSettingsGetter = getSettings): void {
  const installed = new WeakSet<DsmmSubagentRegistry>();
  const install = (readyCtx: DshContext): void => {
    const registry = readyCtx.get?.<DsmmSubagentRegistry>("subagents")
      ?? (readyCtx.get === undefined ? readyCtx.subagents : undefined);
    if (registry === undefined || installed.has(registry)) return;
    const disposers: Array<() => void> = [];
    installed.add(registry);
    try {
      const settings = getDeploymentSettings();
      for (const role of DSMM_ROLE_IDS) {
        if (role === "dsmm-orchestrator" || !settings.roles[role]) continue;
        let active = true;
        const dispose = registry.registerProvider({
          name: roleProviderName(role), capabilities: SPAWN_CAPABILITIES, inheritsParentContext: false,
          async start(request) {
            if (!active) throw new Error("dsmm role provider is disposed");
            const spawn = registry.getProvider("spawn");
            if (!supportedSpawn(spawn)) throw new Error("dsmm role provider requires the supported native spawn capabilities");
            const parentSettings = getSettings(request.parent as unknown as DshAgent);
            if (!parentSettings.roles[role]) throw new Error("dsmm role provider is disabled by deployment configuration");
            const primary = parentSettings.roleRouting[role]?.primary;
            const agentOptions = primary === undefined ? request.agentOptions : {
              ...primary,
              reasoningEffort: primary.reasoningEffort === undefined ? undefined : ReasoningEffortId(primary.reasoningEffort),
              ...request.agentOptions
            };
            if (primary !== undefined && request.agentOptions?.reasoningEffort === undefined
              && ((request.agentOptions?.provider !== undefined && request.agentOptions.provider !== primary.provider)
                || (request.agentOptions?.model !== undefined && request.agentOptions.model !== primary.model))) {
              agentOptions!.reasoningEffort = undefined;
            }
            const parentOptions = parentAgentOptionsForDelegation(request.parent);
            const provider = agentOptions?.provider ?? parentOptions.provider;
            const model = agentOptions?.model ?? parentOptions.model;
            if (provider === undefined || model === undefined) throw new Error("dsmm role delegation requires an effective provider and model");
            const routeChanged = provider !== parentOptions.provider || model !== parentOptions.model;
            const reasoningEffort = agentOptions?.reasoningEffort
              ?? (primary === undefined && !routeChanged ? parentOptions.reasoningEffort : undefined);
            const llm = request.parent.ctx.get("llm") as DshLlmRuntime | undefined;
            if (llm?.resolveCallConfig === undefined) throw new Error("dsmm role delegation requires the parent Agent native LLM service");
            const explicitRoute = request.agentOptions?.provider !== undefined || request.agentOptions?.model !== undefined;
            const candidates = [{ provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) },
              ...explicitRoute ? [] : resolveRoleRuntimePolicy(parentSettings, role).fallbackRoutes.map((route) => ({ ...route,
                ...(request.agentOptions?.reasoningEffort === undefined ? {} : { reasoningEffort: request.agentOptions.reasoningEffort }) }))];
            const selected = await selectInitialModelRoute(llm, candidates, request.signal);
            request.signal.throwIfAborted();
            if (!active || registry.getProvider("spawn") !== spawn) throw new Error("dsmm role spawn provider changed during route validation; retry delegation");
            // Preserve the native descriptor, authority filters and lifecycle;
            // this alias owns only profile-derived route defaults and preflight.
            const changed = selected.provider !== provider || selected.model !== model;
            return spawn.start(primary === undefined && !changed ? request : { ...request, agentOptions: {
              ...agentOptions, ...selected,
              reasoningEffort: selected.reasoningEffort === undefined ? undefined : ReasoningEffortId(selected.reasoningEffort)
            } });
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
