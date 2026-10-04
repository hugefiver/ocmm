import { foldSubagentDescriptor } from "@deepseek-ai/dsh-subagent";
import type { DshAgent, DshSession, DshSessionEvent } from "./dsh-types.js";
import { isDsmmRoleId } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import { roleFromProviderName } from "./role-providers.js";
import type { DsmmSettings } from "./settings.js";

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

export function childOwnedSessionEvents(session: DshSession): readonly DshSessionEvent[] {
  const inherited = session.inheritedEventCount ?? 0;
  if (!Number.isSafeInteger(inherited) || inherited < 0) throw new TypeError("dsmm cannot classify an invalid inherited event boundary");
  return sessionEvents(session).slice(inherited);
}

/** Parent preset/persona inheritance is deliberately not delegated role authority. */
export function resolveEffectiveDsmmRole(agent: DshAgent, settings: DsmmSettings, modeActive: boolean): DsmmRoleId | undefined {
  let role: DsmmRoleId | undefined;
  if (agent.session.header?.origin === "subagent") {
    const own = childOwnedSessionEvents(agent.session);
    const descriptor = foldSubagentDescriptor(own as Parameters<typeof foldSubagentDescriptor>[0]);
    role = descriptor?.mode === "one-shot" ? roleFromProviderName(descriptor.provider) : undefined;
  } else {
    const preset = resolveSelectedAgentPreset(agent.session);
    role = isDsmmRoleId(preset) ? preset : modeActive ? "dsmm-orchestrator" : undefined;
  }
  return role !== undefined && settings.roles[role] ? role : undefined;
}
