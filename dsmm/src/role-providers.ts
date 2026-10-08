import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import type { Agent, AgentOptions } from "@deepseek-ai/dsh-agent";
import { parentAgentOptionsForDelegation, SubagentError } from "@deepseek-ai/dsh-subagent";
import { ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import type { DshAgent, DshContext, DshLlmRuntime } from "./dsh-types.js";
import { DSMM_ROLE_IDS } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSettings, DsmmSettingsGetter } from "./settings.js";
import { resolveRoleRuntimePolicy } from "./routing-policy.js";
import { selectInitialModelRoute } from "./role-routing.js";
import type { DsmmRolePolicy } from "./role-policy.js";

export interface DsmmSubagentRegistry {
  getProvider(name: string): SubagentProvider | undefined;
  registerProvider(provider: SubagentProvider): () => void;
  resolveMaxDepth?(configured?: number): number | undefined;
}

export function roleProviderName(role: DsmmRoleId): string {
  return `dsmm-role-${role.slice("dsmm-".length)}`;
}

export function roleFromProviderName(provider: string): DsmmRoleId | undefined {
  return DSMM_ROLE_IDS.find((role) => role !== "dsmm-orchestrator" && roleProviderName(role) === provider);
}

const NO_CAPABILITIES = Object.freeze({ agentOptions: false, outputSchema: false, depthLimit: false, toolFilter: false, persona: false });

function supportedSpawn(provider: SubagentProvider | undefined): provider is SubagentProvider {
  return provider !== undefined && provider.name === "spawn" && typeof provider.start === "function"
    && provider.inheritsParentContext === false && provider.agentRouteDefaults === undefined;
}

export async function roleAgentOptions(parent: Agent, role: DsmmRoleId, settings: DsmmSettings, signal: AbortSignal, explicit?: AgentOptions): Promise<AgentOptions | undefined> {
  const primary = settings.roleRouting[role]?.primary;
  const options = primary === undefined ? explicit : { ...primary,
    reasoningEffort: primary.reasoningEffort === undefined ? undefined : ReasoningEffortId(primary.reasoningEffort), ...explicit };
  if (primary !== undefined && explicit?.reasoningEffort === undefined
    && (explicit?.provider !== undefined && explicit.provider !== primary.provider || explicit?.model !== undefined && explicit.model !== primary.model)) options!.reasoningEffort = undefined;
  const inherited = parentAgentOptionsForDelegation(parent);
  const provider = options?.provider ?? inherited.provider, model = options?.model ?? inherited.model;
  if (provider === undefined || model === undefined) throw new Error("dsmm role delegation requires an effective provider and model");
  const changed = provider !== inherited.provider || model !== inherited.model;
  const effort = options?.reasoningEffort ?? (primary === undefined && !changed ? inherited.reasoningEffort : undefined);
  const llm = parent.ctx.get("llm") as DshLlmRuntime | undefined;
  if (llm?.resolveCallConfig === undefined) throw new Error("dsmm role delegation requires the parent Agent native LLM service");
  const candidates = [{ provider, model, ...(effort === undefined ? {} : { reasoningEffort: effort }) },
    ...explicit?.provider !== undefined || explicit?.model !== undefined ? [] : resolveRoleRuntimePolicy(settings, role).fallbackRoutes.map((route) => ({ ...route,
      ...(explicit?.reasoningEffort === undefined ? {} : { reasoningEffort: explicit.reasoningEffort }) }))];
  const selected = await selectInitialModelRoute(llm, candidates, signal);
  signal.throwIfAborted();
  return primary === undefined && selected.provider === provider && selected.model === model ? explicit : { ...options, ...selected,
    reasoningEffort: selected.reasoningEffort === undefined ? undefined : ReasoningEffortId(selected.reasoningEffort) };
}

/** Only the native outer start owns descriptors, capability admission and returned runs. */
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
      for (const role of DSMM_ROLE_IDS) {
        if (role === "dsmm-orchestrator" || !settings.roles[role]) continue;
        let active = true;
        const dispose = registry.registerProvider({
          name: roleProviderName(role),
          get capabilities() { const spawn = registry.getProvider("spawn"); return supportedSpawn(spawn) ? spawn.capabilities : NO_CAPABILITIES; },
          inheritsParentContext: false,
          get prepareContinuable() {
            const spawn = registry.getProvider("spawn");
            if (!supportedSpawn(spawn) || spawn.prepareContinuable === undefined) return undefined;
            return async (request: Parameters<NonNullable<SubagentProvider["prepareContinuable"]>>[0]) => {
              if (!active || registry.getProvider("spawn") !== spawn) throw new SubagentError("DSMM native continuable provider changed", "NO_PROVIDER");
              const admitted = getSettings(request.parent as unknown as DshAgent);
              if (!admitted.roles[role]) throw new SubagentError("DSMM role is disabled", "UNAUTHORIZED");
              if (!admitted.subagents.enableRunInBackground || admitted.subagents.backgroundMode !== "continuable") throw new SubagentError("DSMM continuable delegation requires explicit admitted opt-in", "UNAUTHORIZED");
              policy?.prepareContinuable(request.parent as unknown as DshAgent, role, request.signal);
              return spawn.prepareContinuable!(request);
            };
          },
          async start(request) {
            if (!active) throw new Error("dsmm role provider is disposed");
            const spawn = registry.getProvider("spawn");
            if (!supportedSpawn(spawn)) throw new Error("dsmm role provider requires the supported native spawn capabilities");
            if (request.descriptor.mode !== "one-shot" || request.descriptor.provider !== roleProviderName(role)) throw new SubagentError("DSMM alias requires its exact native descriptor", "UNAUTHORIZED");
            const admission = policy?.assertDelegation(request.parent as unknown as DshAgent, role);
            for (const [key, value] of Object.entries({ agentOptions: request.agentOptions, outputSchema: request.outputSchema, depthLimit: request.maxDepth, toolFilter: request.toolFilter, persona: request.persona })) {
              if (value !== undefined && !spawn.capabilities[key as keyof typeof NO_CAPABILITIES]) throw new SubagentError(`DSMM spawn does not support ${key}`, "UNSUPPORTED_CAPABILITY");
            }
            const parentSettings = getSettings(request.parent as unknown as DshAgent);
            if (!parentSettings.roles[role]) throw new Error("dsmm role provider is disabled by deployment configuration");
            const agentOptions = await roleAgentOptions(request.parent, role, parentSettings, request.signal, request.agentOptions);
            request.signal.throwIfAborted();
            if (!active || registry.getProvider("spawn") !== spawn) throw new Error("dsmm role spawn provider changed during route validation; retry delegation");
            if (admission !== undefined && policy!.assertDelegation(request.parent as unknown as DshAgent, role).epoch !== admission.epoch) throw new SubagentError("DSMM parent admission changed during route preflight", "UNAUTHORIZED");
            // Preserve the native descriptor, authority filters and lifecycle;
            // this alias owns only profile-derived route defaults and preflight.
            const routed = agentOptions === request.agentOptions ? request : { ...request, agentOptions };
            const maxDepth = request.maxDepth ?? registry.resolveMaxDepth?.(parentSettings.subagents.maxDepth);
            if (maxDepth !== undefined && !spawn.capabilities.depthLimit) throw new SubagentError("DSMM spawn cannot enforce the native depth limit", "UNSUPPORTED_CAPABILITY");
            const resolved = maxDepth === undefined ? routed : { ...routed, maxDepth };
            if (resolved.agentOptions !== undefined && !spawn.capabilities.agentOptions) throw new SubagentError("DSMM spawn cannot accept the configured or selected child route", "UNSUPPORTED_CAPABILITY");
            return policy === undefined ? spawn.start(resolved)
              : policy.duringDelegation(request.parent as unknown as DshAgent, role, () => spawn.start(resolved), request.toolFilter);
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
