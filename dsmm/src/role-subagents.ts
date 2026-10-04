import * as nativeSubagentTool from "@deepseek-ai/dsh-tool-subagent";
import type { DshAgent, DshContext, DshToolExecution } from "./dsh-types.js";
import { DSMM_ROLES, roleSubagentConfig } from "./roles.js";
import { isDsmmRoleId } from "./roles.js";
import { resolveSelectedAgentPreset } from "./session-scope.js";
import type { DsmmSettingsGetter } from "./settings.js";
import type { DeepworkModeController } from "./state.js";

interface DshProfileContext {
  startedBundles: readonly string[];
}

interface NamedToolCatalog {
  get(name: string): unknown;
}

/** The DSH headless runner never mounts Agent presets; give it role-specific native tools. */
export function registerHeadlessRoleTools(ctx: DshContext, controller: DeepworkModeController, getSettings: DsmmSettingsGetter): void {
  const installed = new WeakSet<DshContext>();
  const onCreated = async ({ agent }: { agent: DshAgent & { ctx: DshContext } }): Promise<void> => {
    const profile = agent.ctx.get?.<DshProfileContext>("profileContext")
      ?? ctx.get?.<DshProfileContext>("profileContext")
      ?? (ctx.get === undefined ? (ctx as DshContext & { profileContext?: DshProfileContext }).profileContext : undefined);
    if (!profile?.startedBundles.includes("@deepseek-ai/dsh-headless")) return;
    if (agent.session.header?.origin === "subagent") return;
    const agentCtx = agent.ctx;
    if (installed.has(agentCtx)) return;
    if (agentCtx.plugin === undefined || agentCtx.tools?.guard === undefined) throw new Error("dsmm headless role tools require Agent-scoped Cordis plugin and tool guard services");

    installed.add(agentCtx);
    try {
      const settings = getSettings(agent);
      const roles = DSMM_ROLES.filter((role) => role.id !== "dsmm-orchestrator" && settings.roles[role.id]);
      const names = new Set(roles.map((role) => role.id.replace(/-/gu, "_")));
      const guard = agentCtx.tools.guard((execution: DshToolExecution) => {
        if (!names.has(execution.name)) return undefined;
        const current = getSettings(execution.agent);
        if (controller.active(execution.agent, current.defaultActive) || isDsmmRoleId(resolveSelectedAgentPreset(execution.agent?.session))) return undefined;
        return "DW role tools require an active Deepwork session or DW-selected preset";
      });
      agentCtx.effect?.(() => guard);

      const catalog = agentCtx.tools as typeof agentCtx.tools & NamedToolCatalog;
      const availableTools = catalog.get?.("read_image") === undefined ? [] : ["read_image"];
      for (const role of roles) {
        // Agent creation is awaited before first prompt assembly. Mounting here
        // sees the Agent-isolated systemPrompt/tools and avoids leaking tools to
        // its sibling sessions or the read-only child being delegated.
        // Model routing belongs to the parent's admitted profile, not the tool's
        // standing composition. The role provider validates it before spawning.
        await agentCtx.plugin(nativeSubagentTool, roleSubagentConfig(role, availableTools));
      }
      agentCtx.effect?.(() => () => installed.delete(agentCtx));
    } catch (error) {
      installed.delete(agentCtx);
      throw error;
    }
  };

  // Agent-created is emitted in the new Agent scope; DSMM's bundle scope is
  // a sibling, so a global listener is required to observe that publication.
  ctx.on?.("agent/created", onCreated, { global: true });
}
