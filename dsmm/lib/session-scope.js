export function sessionEvents(session) {
    return session?.snapshotEvents?.() ?? session?.events ?? [];
}
export function resolveSelectedAgentPreset(session) {
    const events = sessionEvents(session);
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event?.type !== "agent-preset/selected")
            continue;
        const data = event.data;
        if (typeof data === "object" && data !== null && "agentPreset" in data && typeof data.agentPreset === "string") {
            return data.agentPreset;
        }
    }
    return typeof session?.header?.agentPreset === "string" ? session.header.agentPreset : undefined;
}
//# sourceMappingURL=session-scope.js.map