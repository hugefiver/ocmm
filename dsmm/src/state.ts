import type { DshAgent, DshContext, DshSession, DshSessionEvent, PreStepDecision, PreStepFrame } from "./dsh-types.js";
import { resolveSelectedAgentPreset, sessionEvents } from "./session-scope.js";
import { assertDsmmMetadataPersistence } from "./session-metadata.js";
import { createHash } from "node:crypto";
import { isDsmmRoleId } from "./roles.js";
import type { SessionDeepworkState } from "./profile-types.js";

export const DEEPWORK_MODE_EVENT = "deepwork/mode";

type PendingIntent = { active: boolean };

export type DeepworkSelectionOutcome = "committed" | "pending" | "unchanged";

function activeFromEvent(event: DshSessionEvent): boolean | undefined {
  if (event.type !== DEEPWORK_MODE_EVENT) return undefined;

  const data = event.data;
  return typeof data === "object" && data !== null && "active" in data && typeof data.active === "boolean"
    ? data.active
    : undefined;
}

export function isDeepworkActive(events: readonly DshSessionEvent[] = [], defaultActive = false, selectedPreset?: string): boolean {
  let active = selectedPreset === "minimal" ? false : defaultActive;
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
  private readonly pending = new WeakMap<DshSession, PendingIntent>();

  constructor(private readonly ctx: DshContext) {
    ctx.on?.("agent/pre-step", async (frame: PreStepFrame, next: () => Promise<PreStepDecision>) => {
      const decision = await next();
      const intent = this.pending.get(frame.agent.session);
      if (decision.kind === "reject" || frame.signal.aborted || intent === undefined) return decision;

      try {
        await this.commit(frame.agent.session, intent.active);
      } catch (cause) {
        ctx.logger?.warn("dsmm failed to append deepwork mode event; pending intent will retry", cause);
      }
      return decision;
    });
  }

  active(agent: DshAgent | undefined, defaultActive: boolean): boolean {
    if (agent === undefined) return false;
    return this.pending.get(agent.session)?.active ?? isDeepworkActive(sessionEvents(agent.session), defaultActive, resolveSelectedAgentPreset(agent.session));
  }

  describe(agent: DshAgent, defaultActive: boolean): SessionDeepworkState {
    const events = sessionEvents(agent.session);
    const preset = resolveSelectedAgentPreset(agent.session);
    const intents = events.map(activeFromEvent).filter((value) => value !== undefined);
    const pending = this.pending.get(agent.session);
    const locked = isDsmmRoleId(preset);
    return { active: locked || this.active(agent, defaultActive), explicit: intents.length > 0 || pending !== undefined, locked,
      revision: createHash("sha256").update(JSON.stringify({ preset, defaultActive, intents,
        presetChanges: events.filter((event) => event.type === "agent-preset/selected").length, pending: pending?.active })).digest("hex") };
  }

  async select(agent: DshAgent, active: boolean, defaultActive = false): Promise<DeepworkSelectionOutcome> {
    const current = this.active(agent, defaultActive);
    const explicit = sessionEvents(agent.session).some((event) => activeFromEvent(event) !== undefined);
    if (current === active && explicit && !this.pending.has(agent.session)) return "unchanged";

    if (hasOpenTurn(sessionEvents(agent.session))) {
      this.pending.set(agent.session, { active });
      return "pending";
    }
    await this.commit(agent.session, active);
    return "committed";
  }

  /** Native idle maintenance owns this write; never stage an uncommitted UI intent. */
  async selectIdle(agent: DshAgent, active: boolean, defaultActive: boolean): Promise<void> {
    if (hasOpenTurn(sessionEvents(agent.session))) throw new Error("Deepwork mode requires an idle session");
    const mode = this.describe(agent, defaultActive);
    if (mode.explicit && mode.active === active && !this.pending.has(agent.session)) return;
    await this.commit(agent.session, active);
  }

  private async commit(session: DshSession, active: boolean): Promise<void> {
    const pending = this.pending.get(session);
    assertDsmmMetadataPersistence(this.ctx);
    await session.append(DEEPWORK_MODE_EVENT, { active });
    if (this.pending.get(session) === pending) this.pending.delete(session);
  }
}
