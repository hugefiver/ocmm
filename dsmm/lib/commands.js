import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { DSMM_STATUS_COMMAND } from "./settings.js";
import { createDsmmStatusSnapshot, formatDsmmStatus } from "./status.js";
export { DSMM_STATUS_COMMAND };
export function parseDeepworkCommandInput(rawInput) {
    const message = rawInput.trim();
    return message === "off" ? { action: "off", message: "" } : { action: "on", message };
}
async function handleDeepworkCommand(controller, getSettings, invocation) {
    const parsed = parseDeepworkCommandInput(invocation.rawInput);
    if (parsed.action === "on" && !getSettings(invocation.agent).modules.deepwork.enabled)
        return { kind: "error", text: "Deepwork module is not admitted in this session; mode cannot enable it." };
    await controller.select(invocation.agent, parsed.action === "on", getSettings(invocation.agent).defaultActive);
    if (parsed.action === "on" && parsed.message !== "") {
        await invocation.agent.steer?.(createUserMessage({
            content: [{ type: "text", text: parsed.message }],
            source: { kind: "user" }
        }));
    }
    return parsed.action === "on"
        ? { kind: "success", text: "Entering deepwork mode." }
        : { kind: "success", text: "Leaving deepwork mode." };
}
function handleDsmmStatusCommand(controller, getSettings, invocation) {
    const input = invocation.rawInput.trim();
    if (input !== "" && input !== "json")
        return { kind: "error", text: "Usage: /dsmm-status [json]" };
    const settings = getSettings(invocation.agent);
    const snapshot = createDsmmStatusSnapshot({
        agent: invocation.agent,
        settings,
        admission: getSettings.admission?.(invocation.agent),
        modules: getSettings.moduleStates?.(invocation.agent),
        modeActive: controller.active(invocation.agent, settings.defaultActive)
    });
    return {
        kind: "success",
        text: input === "json" ? JSON.stringify(snapshot, null, 2) : formatDsmmStatus(snapshot)
    };
}
export function registerDeepworkCommand(readyCtx, controller, getSettings) {
    const commands = readyCtx.get?.("commands") ?? readyCtx.commands;
    commands?.register({
        name: getSettings().modeName,
        description: "Enter or leave Deepwork mode",
        input: { hint: "[off|message]" },
        handler: (invocation) => handleDeepworkCommand(controller, getSettings, invocation)
    });
}
export function registerDsmmStatusCommand(readyCtx, controller, getSettings) {
    const commands = readyCtx.get?.("commands") ?? readyCtx.commands;
    commands?.register({
        name: DSMM_STATUS_COMMAND,
        description: "Show Deepwork status",
        input: { hint: "[json]" },
        handler: (invocation) => handleDsmmStatusCommand(controller, getSettings, invocation)
    });
}
//# sourceMappingURL=commands.js.map