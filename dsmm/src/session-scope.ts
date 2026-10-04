import type { DshSession, DshSessionEvent } from "./dsh-types.js";

export function sessionEvents(session: DshSession | undefined): readonly DshSessionEvent[] {
  return session?.snapshotEvents?.() ?? session?.events ?? [];
}

export function resolveSelectedAgentPreset(session: DshSession | undefined): string | undefined {
  const events = sessionEvents(session);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== "agent-preset/selected") continue;
    const data = event.data;
    if (typeof data === "object" && data !== null && "agentPreset" in data && typeof data.agentPreset === "string") {
      return data.agentPreset;
    }
  }

  return typeof session?.header?.agentPreset === "string" ? session.header.agentPreset : undefined;
}
