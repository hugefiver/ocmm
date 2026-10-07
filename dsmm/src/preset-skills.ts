import Schema from "@deepseek-ai/schemastery";
import { getTraceable } from "@deepseek-ai/cordis";
import type { DshAgent, DshContext, DshSession, DshSessionEvent, DshSkillRegistry } from "./dsh-types.js";
import { DSMM_SKILL_NAMES, registerBundledSkills } from "./skills.js";
import type { DsmmSkillName } from "./skills.js";
import { nativeAgentContext, scopeParentOf } from "./native-scope.js";
import type { DsmmSettingsGetter } from "./settings.js";
import type { DeepworkModeController } from "./state.js";

export const name = "dsmm/preset-skills";
export const inject = [] as const;

export interface PresetSkillsConfig {
  skills?: DsmmSkillName[];
}

const SKILL_NAME_SCHEMA = Schema.union(DSMM_SKILL_NAMES.map((name) => Schema.const(name)));

export const Config: Schema<PresetSkillsConfig> = Schema.object({
  skills: Schema.array(SKILL_NAME_SCHEMA).default([...DSMM_SKILL_NAMES])
});

export function apply(ctx: DshContext, config: PresetSkillsConfig = {}): void {
  // Compatibility entry for generated presets: never publish session-private
  // skills from a standing composition. The root plugin owns Agent mounts.
}

export function registerAgentSkills(ctx: DshContext, controller: DeepworkModeController, getSettings: DsmmSettingsGetter): void {
  const mounted = new Map<DshAgent, { parent: object | undefined; registry: DshSkillRegistry; provider: ReturnType<typeof registerBundledSkills> }>();
  const remove = (agent: DshAgent): void => { mounted.get(agent)?.provider.dispose(); mounted.delete(agent); };
  const reconcile = (agent: DshAgent): void => {
    const agentCtx = nativeAgentContext(agent);
    const presets = ctx.get?.<{ serviceFor(agent: DshAgent, name: string): DshSkillRegistry | undefined }>("agentPresets");
    const raw = presets?.serviceFor(agent, "skills") ?? agentCtx.get("skills");
    const previous = mounted.get(agent), parent = scopeParentOf(agent);
    const settings = getSettings(agent);
    if (!controller.active(agent, settings.defaultActive)) { remove(agent); return; }
    if (raw === undefined) throw new Error("dsmm active skills require the native skill registry; no prompt-body fallback is available");
    if (previous?.parent === parent && previous?.registry === raw) { previous.provider.invalidate(); return; }
    remove(agent);
    const registry = getTraceable(agentCtx, raw);
    const provider = registerBundledSkills(agentCtx, registry, { agent, controller, getSettings });
    mounted.set(agent, { parent, registry: raw, provider });
  };
  const stopMode = controller.watch(reconcile);
  const created = ctx.on?.("agent/created", ({ agent }: { agent: DshAgent }) => reconcile(agent), { global: true });
  const selected = ctx.on?.("agent-preset/selected", (id: string) => {
    const agent = ctx.get?.<{ get(id: string): DshAgent | undefined }>("agents")?.get(id);
    if (agent !== undefined) { remove(agent); reconcile(agent); }
  }, { global: true });
  const disposed = ctx.on?.("agent/disposed", ({ agent }: { agent: DshAgent }) => remove(agent), { global: true });
  const modeEvent = ctx.on?.("session/event", (session: DshSession, event: DshSessionEvent) => {
    if (event.type !== "deepwork/mode") return;
    const agent = ctx.get?.<{ list(): DshAgent[] }>("agents")?.list().find((agent) => agent.session === session);
    if (agent !== undefined) reconcile(agent);
  }, { global: true });
  ctx.effect?.(() => () => {
    stopMode();
    for (const stop of [created, selected, disposed, modeEvent]) if (typeof stop === "function") stop();
    for (const agent of [...mounted.keys()]) remove(agent);
  });
  for (const agent of ctx.get?.<{ list(): DshAgent[] }>("agents")?.list() ?? []) reconcile(agent);
}

export default apply;
