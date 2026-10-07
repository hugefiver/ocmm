import Schema from "@deepseek-ai/schemastery";
import { getTraceable } from "@deepseek-ai/cordis";
import { DSMM_SKILL_NAMES, registerBundledSkills } from "./skills.js";
import { nativeAgentContext, scopeParentOf } from "./native-scope.js";
export const name = "dsmm/preset-skills";
export const inject = [];
const SKILL_NAME_SCHEMA = Schema.union(DSMM_SKILL_NAMES.map((name) => Schema.const(name)));
export const Config = Schema.object({
    skills: Schema.array(SKILL_NAME_SCHEMA).default([...DSMM_SKILL_NAMES])
});
export function apply(ctx, config = {}) {
    // Retain the published 0.1.9 Cordis entry shape for older callers. Current
    // generated presets do not consume it; this hook registers no skills.
    // The main entry calls registerAgentSkills below for real Agent mounts.
}
export function registerAgentSkills(ctx, controller, getSettings) {
    const mounted = new Map();
    const remove = (agent) => { mounted.get(agent)?.provider.dispose(); mounted.delete(agent); };
    const reconcile = (agent) => {
        const agentCtx = nativeAgentContext(agent);
        const presets = ctx.get?.("agentPresets");
        const raw = presets?.serviceFor(agent, "skills") ?? agentCtx.get("skills");
        const previous = mounted.get(agent), parent = scopeParentOf(agent);
        const settings = getSettings(agent);
        if (!controller.active(agent, settings.defaultActive)) {
            remove(agent);
            return;
        }
        if (raw === undefined)
            throw new Error("dsmm active skills require the native skill registry; no prompt-body fallback is available");
        if (previous?.parent === parent && previous?.registry === raw) {
            previous.provider.invalidate();
            return;
        }
        remove(agent);
        const registry = getTraceable(agentCtx, raw);
        const provider = registerBundledSkills(agentCtx, registry, { agent, controller, getSettings });
        mounted.set(agent, { parent, registry: raw, provider });
    };
    const stopMode = controller.watch(reconcile);
    const created = ctx.on?.("agent/created", ({ agent }) => reconcile(agent), { global: true });
    const selected = ctx.on?.("agent-preset/selected", (id) => {
        const agent = ctx.get?.("agents")?.get(id);
        if (agent !== undefined) {
            remove(agent);
            reconcile(agent);
        }
    }, { global: true });
    const disposed = ctx.on?.("agent/disposed", ({ agent }) => remove(agent), { global: true });
    const modeEvent = ctx.on?.("session/event", (session, event) => {
        if (event.type !== "deepwork/mode")
            return;
        const agent = ctx.get?.("agents")?.list().find((agent) => agent.session === session);
        if (agent !== undefined)
            reconcile(agent);
    }, { global: true });
    ctx.effect?.(() => () => {
        stopMode();
        for (const stop of [created, selected, disposed, modeEvent])
            if (typeof stop === "function")
                stop();
        for (const agent of [...mounted.keys()])
            remove(agent);
    });
    for (const agent of ctx.get?.("agents")?.list() ?? [])
        reconcile(agent);
}
export default apply;
//# sourceMappingURL=preset-skills.js.map