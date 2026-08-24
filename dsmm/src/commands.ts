import { createUserMessage } from "@deepseek-ai/dsh-llm";
import type { DshCommandInvocation, DshCommandResult, DshCommandsRegistry, DshContext } from "./dsh-types.js";
import type { DsmmSettings } from "./settings.js";
import type { DeepworkModeController } from "./state.js";

export interface DeepworkCommandInput {
  action: "on" | "off";
  message: string;
}

export function parseDeepworkCommandInput(rawInput: string): DeepworkCommandInput {
  const message = rawInput.trim();
  return message === "off" ? { action: "off", message: "" } : { action: "on", message };
}

async function handleDeepworkCommand(
  controller: DeepworkModeController,
  getSettings: () => DsmmSettings,
  invocation: DshCommandInvocation
): Promise<DshCommandResult> {
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

export function registerDeepworkCommand(
  readyCtx: DshContext,
  controller: DeepworkModeController,
  getSettings: () => DsmmSettings
): void {
  const commands = readyCtx.get?.<DshCommandsRegistry>("commands") ?? readyCtx.commands;
  commands?.register({
    name: getSettings().modeName,
    description: "Enter or leave dsmm deepwork mode",
    input: { hint: "[off|message]" },
    handler: (invocation) => handleDeepworkCommand(controller, getSettings, invocation)
  });
}
