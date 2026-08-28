import { createUserMessage } from "@deepseek-ai/dsh-llm";
import type { DshCommandInvocation, DshCommandResult, DshCommandsRegistry, DshContext } from "./dsh-types.js";
import { DSMM_STATUS_COMMAND } from "./settings.js";
import type { DsmmSettings } from "./settings.js";
import type { DeepworkModeController } from "./state.js";
import { createDsmmStatusSnapshot, formatDsmmStatus } from "./status.js";

export { DSMM_STATUS_COMMAND };

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

function handleDsmmStatusCommand(
  controller: DeepworkModeController,
  getSettings: () => DsmmSettings,
  invocation: DshCommandInvocation
): DshCommandResult {
  const input = invocation.rawInput.trim();
  if (input !== "" && input !== "json") return { kind: "error", text: "Usage: /dsmm-status [json]" };

  const settings = getSettings();
  const snapshot = createDsmmStatusSnapshot({
    agent: invocation.agent,
    settings,
    modeActive: controller.active(invocation.agent, settings.defaultActive)
  });
  return {
    kind: "success",
    text: input === "json" ? JSON.stringify(snapshot, null, 2) : formatDsmmStatus(snapshot)
  };
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

export function registerDsmmStatusCommand(
  readyCtx: DshContext,
  controller: DeepworkModeController,
  getSettings: () => DsmmSettings
): void {
  const commands = readyCtx.get?.<DshCommandsRegistry>("commands") ?? readyCtx.commands;
  commands?.register({
    name: DSMM_STATUS_COMMAND,
    description: "Show DSMM status",
    input: { hint: "[json]" },
    handler: (invocation) => handleDsmmStatusCommand(controller, getSettings, invocation)
  });
}
