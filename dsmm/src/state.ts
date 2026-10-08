import type { DshAgent, DshContext, DshSessionEvent } from "./dsh-types.js";
import { resolveSelectedAgentPreset, sessionEvents } from "./session-scope.js";
import { assertDsmmMetadataPersistence } from "./session-metadata.js";
import { createHash } from "node:crypto";
import { isDsmmRoleId } from "./roles.js";
import type { SessionDeepworkState } from "./profile-types.js";

export const DEEPWORK_MODE_EVENT = "deepwork/mode";
export type DeepworkSelectionOutcome = "committed" | "unchanged";

function activeFromEvent(event: DshSessionEvent): boolean | undefined {
  const data = event.data;
  return event.type === DEEPWORK_MODE_EVENT && typeof data === "object" && data !== null && "active" in data && typeof data.active === "boolean" ? data.active : undefined;
}

export function isDeepworkActive(events: readonly DshSessionEvent[] = [], defaultActive = false, selectedPreset?: string): boolean {
  let active = isDsmmRoleId(selectedPreset) || (selectedPreset !== "minimal" && defaultActive);
  for (const event of events) active = activeFromEvent(event) ?? active;
  return active;
}

export function hasOpenTurn(events: readonly DshSessionEvent[] = []): boolean {
  let open = false;
  for (const event of events) {
    if (event.type === "turn/start") open = true;
    else if (event.type === "turn/end") open = false;
  }
  return open;
}

export class DeepworkModeController {
  private readonly listeners = new Set<(agent: DshAgent) => void>();
  constructor(private readonly ctx: DshContext, private readonly moduleEnabled: (agent: DshAgent) => boolean = () => true) {}

  watch(listener: (agent: DshAgent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Profile commits have no native session event; notify their Agent mount. */
  changed(agent: DshAgent): void { for (const listener of this.listeners) listener(agent); }

  active(agent: DshAgent | undefined, defaultActive: boolean): boolean {
    return agent !== undefined && this.moduleEnabled(agent) && isDeepworkActive(sessionEvents(agent.session), defaultActive, resolveSelectedAgentPreset(agent.session));
  }

  describe(agent: DshAgent, defaultActive: boolean): SessionDeepworkState {
    const events = sessionEvents(agent.session), preset = resolveSelectedAgentPreset(agent.session);
    const intents = events.map(activeFromEvent).filter((value) => value !== undefined);
    return { active: this.active(agent, defaultActive), explicit: intents.length > 0, locked: false,
      revision: createHash("sha256").update(JSON.stringify({ preset, defaultActive, intents,
        presetChanges: events.filter((event) => event.type === "agent-preset/selected").length })).digest("hex") };
  }

  private intent(agent: DshAgent): boolean | undefined {
    const events = sessionEvents(agent.session);
    for (let index = events.length - 1; index >= 0; index--) {
      const value = activeFromEvent(events[index]);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  async select(agent: DshAgent, active: boolean, defaultActive = false): Promise<DeepworkSelectionOutcome> {
    if (active && !this.moduleEnabled(agent)) throw new Error("Deepwork module is not admitted in this session; a mode intent cannot enable it");
    if (agent.status === "running" || hasOpenTurn(sessionEvents(agent.session))) throw new Error("Deepwork mode requires an idle session; no change was queued");
    const before = this.describe(agent, defaultActive);
    if (this.intent(agent) === active) return "unchanged";
    const write = async (signal?: AbortSignal): Promise<void> => {
      signal?.throwIfAborted();
      if (this.describe(agent, defaultActive).revision !== before.revision) throw new Error("Deepwork mode changed; refresh before retrying");
      await this.selectIdle(agent, active, defaultActive);
    };
    if (agent.runMaintenance === undefined) throw new Error("Deepwork mode requires native idle maintenance");
    await agent.runMaintenance(write);
    return "committed";
  }

  /** Called inside the existing native maintenance / admission CAS boundary. */
  async selectIdle(agent: DshAgent, active: boolean, _defaultActive: boolean): Promise<void> {
    if (active && !this.moduleEnabled(agent)) throw new Error("Deepwork module is not admitted in this session; a mode intent cannot enable it");
    if (hasOpenTurn(sessionEvents(agent.session))) throw new Error("Deepwork mode requires an idle session");
    if (this.intent(agent) === active) return;
    assertDsmmMetadataPersistence(this.ctx);
    await agent.session.append(DEEPWORK_MODE_EVENT, { active });
    // Native session/event owns mode invalidation, including external appends.
  }
}
