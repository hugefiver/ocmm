import type { DshAgent, DshContext, DshSession, DshSessionEvent, PreStepDecision, PreStepFrame } from "./dsh-types.js";

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

export function isDeepworkActive(events: readonly DshSessionEvent[] = [], defaultActive = false): boolean {
  let active = defaultActive;
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

  constructor(ctx: DshContext) {
    ctx.on?.("agent/pre-step", async (frame: PreStepFrame, next: () => Promise<PreStepDecision>) => {
      const decision = await next();
      const intent = this.pending.get(frame.agent.session);
      if (decision.kind === "reject" || frame.signal.aborted || intent === undefined) return decision;

      await this.commit(frame.agent.session, intent.active);
      return decision;
    });
  }

  active(agent: DshAgent | undefined, defaultActive: boolean): boolean {
    if (agent === undefined) return false;
    return this.pending.get(agent.session)?.active ?? isDeepworkActive(agent.session.events, defaultActive);
  }

  async select(agent: DshAgent, active: boolean, defaultActive = false): Promise<DeepworkSelectionOutcome> {
    const current = this.active(agent, defaultActive);
    if (current === active && !this.pending.has(agent.session)) return "unchanged";

    this.pending.set(agent.session, { active });
    if (hasOpenTurn(agent.session.events)) return "pending";

    await this.commit(agent.session, active);
    return "committed";
  }

  private async commit(session: DshSession, active: boolean): Promise<void> {
    await session.append(DEEPWORK_MODE_EVENT, { active });
    this.pending.delete(session);
  }
}
