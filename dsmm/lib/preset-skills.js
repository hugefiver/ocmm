import { getTraceable } from "@deepseek-ai/cordis";
import { registerBundledSkills } from "./skills.js";
import { nativeAgentContext, scopeParentOf } from "./native-scope.js";
const bindings = new WeakMap();
/** Admission owns installation; mode changes only invalidate this Agent's lazy provider. */
export function registerAgentSkills(ctx, controller, getSettings, agent, lifetime) {
    const refresh = bindings.get(agent);
    if (refresh) {
        refresh();
        return;
    }
    let mounted;
    const remove = () => { mounted?.provider.dispose(); mounted = undefined; };
    const reconcile = () => {
        const agentCtx = nativeAgentContext(agent), settings = getSettings(agent);
        if (!settings.modules.deepwork.enabled || !controller.active(agent, settings.defaultActive)) {
            remove();
            return;
        }
        const presets = ctx.get?.("agentPresets");
        const raw = presets?.serviceFor(agent, "skills") ?? agentCtx.get("skills"), parent = scopeParentOf(agent);
        if (raw === undefined)
            throw new Error("Active skills require the native skill registry");
        if (mounted?.parent === parent && mounted?.registry === raw) {
            mounted.provider.invalidate();
            return;
        }
        remove();
        mounted = { parent, registry: raw, provider: registerBundledSkills(agentCtx, getTraceable(agentCtx, raw), { agent, controller, getSettings }) };
    };
    const stopMode = controller.watch(changed => { if (changed === agent)
        reconcile(); });
    bindings.set(agent, reconcile);
    const dispose = () => { stopMode(); remove(); bindings.delete(agent); lifetime.removeEventListener("abort", dispose); };
    lifetime.addEventListener("abort", dispose, { once: true });
    ctx.effect?.(() => dispose);
    reconcile();
}
//# sourceMappingURL=preset-skills.js.map