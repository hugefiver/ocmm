import { resolveSelectedAgentPreset, sessionEvents } from "./session-scope.js";
import { assertDsmmMetadataPersistence } from "./session-metadata.js";
import { createHash } from "node:crypto";
import { isDsmmRoleId } from "./roles.js";
export const DEEPWORK_MODE_EVENT = "deepwork/mode";
function activeFromEvent(event) {
    const data = event.data;
    return event.type === DEEPWORK_MODE_EVENT && typeof data === "object" && data !== null && "active" in data && typeof data.active === "boolean" ? data.active : undefined;
}
export function isDeepworkActive(events = [], defaultActive = false, selectedPreset) {
    let active = isDsmmRoleId(selectedPreset) || (selectedPreset !== "minimal" && defaultActive);
    for (const event of events)
        active = activeFromEvent(event) ?? active;
    return active;
}
export function hasOpenTurn(events = []) {
    let open = false;
    for (const event of events) {
        if (event.type === "turn/start")
            open = true;
        else if (event.type === "turn/end")
            open = false;
    }
    return open;
}
export class DeepworkModeController {
    ctx;
    moduleEnabled;
    listeners = new Set();
    constructor(ctx, moduleEnabled = () => true) {
        this.ctx = ctx;
        this.moduleEnabled = moduleEnabled;
    }
    watch(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    /** Profile commits have no native session event; notify their Agent mount. */
    changed(agent) { for (const listener of this.listeners)
        listener(agent); }
    active(agent, defaultActive) {
        return agent !== undefined && this.moduleEnabled(agent) && isDeepworkActive(sessionEvents(agent.session), defaultActive, resolveSelectedAgentPreset(agent.session));
    }
    describe(agent, defaultActive) {
        const events = sessionEvents(agent.session), preset = resolveSelectedAgentPreset(agent.session);
        const intents = events.map(activeFromEvent).filter((value) => value !== undefined);
        return { active: this.active(agent, defaultActive), explicit: intents.length > 0, locked: false,
            revision: createHash("sha256").update(JSON.stringify({ preset, defaultActive, intents,
                presetChanges: events.filter((event) => event.type === "agent-preset/selected").length })).digest("hex") };
    }
    intent(agent) {
        const events = sessionEvents(agent.session);
        for (let index = events.length - 1; index >= 0; index--) {
            const value = activeFromEvent(events[index]);
            if (value !== undefined)
                return value;
        }
        return undefined;
    }
    async select(agent, active, defaultActive = false) {
        if (active && !this.moduleEnabled(agent))
            throw new Error("Deepwork module is not admitted in this session; a mode intent cannot enable it");
        if (agent.status === "running" || hasOpenTurn(sessionEvents(agent.session)))
            throw new Error("Deepwork mode requires an idle session; no change was queued");
        const before = this.describe(agent, defaultActive);
        if (this.intent(agent) === active)
            return "unchanged";
        const write = async (signal) => {
            signal?.throwIfAborted();
            if (this.describe(agent, defaultActive).revision !== before.revision)
                throw new Error("Deepwork mode changed; refresh before retrying");
            await this.selectIdle(agent, active, defaultActive);
        };
        if (agent.runMaintenance === undefined)
            throw new Error("Deepwork mode requires native idle maintenance");
        await agent.runMaintenance(write);
        return "committed";
    }
    /** Called inside the existing native maintenance / admission CAS boundary. */
    async selectIdle(agent, active, _defaultActive) {
        if (active && !this.moduleEnabled(agent))
            throw new Error("Deepwork module is not admitted in this session; a mode intent cannot enable it");
        if (hasOpenTurn(sessionEvents(agent.session)))
            throw new Error("Deepwork mode requires an idle session");
        if (this.intent(agent) === active)
            return;
        assertDsmmMetadataPersistence(this.ctx);
        await agent.session.append(DEEPWORK_MODE_EVENT, { active });
        // Native session/event owns mode invalidation, including external appends.
    }
}
//# sourceMappingURL=state.js.map