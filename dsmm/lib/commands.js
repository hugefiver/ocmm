import { createUserMessage } from "@deepseek-ai/dsh-llm";
export function parseDeepworkCommandInput(rawInput) {
    const message = rawInput.trim();
    return message === "off" ? { action: "off", message: "" } : { action: "on", message };
}
async function handleDeepworkCommand(controller, getSettings, invocation) {
    const parsed = parseDeepworkCommandInput(invocation.rawInput);
    await controller.select(invocation.agent, parsed.action === "on", getSettings().defaultActive);
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
export function registerDeepworkCommand(readyCtx, controller, getSettings) {
    const commands = readyCtx.get?.("commands") ?? readyCtx.commands;
    commands?.register({
        name: getSettings().modeName,
        description: "Enter or leave dsmm deepwork mode",
        input: { hint: "[off|message]" },
        handler: (invocation) => handleDeepworkCommand(controller, getSettings, invocation)
    });
}
//# sourceMappingURL=commands.js.map