import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshCommandInvocation, DshCommandsRegistry, DshContext } from "../lib/dsh-types.js";
import { parseDeepworkCommandInput, registerDeepworkCommand } from "../lib/commands.js";
import { DEFAULT_DSMM_SETTINGS } from "../lib/settings.js";
import { DEEPWORK_MODE_EVENT, DeepworkModeController } from "../lib/state.js";

type RegisteredCommand = Parameters<DshCommandsRegistry["register"]>[0];

function captureCommand(settings = DEFAULT_DSMM_SETTINGS): RegisteredCommand {
  let command: RegisteredCommand | undefined;
  const controller = new DeepworkModeController({});
  const ctx: DshContext = {
    commands: { register(value) { command = value; } }
  };

  registerDeepworkCommand(ctx, controller, () => settings);
  assert.ok(command);
  return command;
}

test("parseDeepworkCommandInput handles off and message forms", () => {
  assert.deepEqual(parseDeepworkCommandInput(""), { action: "on", message: "" });
  assert.deepEqual(parseDeepworkCommandInput(" off"), { action: "off", message: "" });
  assert.deepEqual(parseDeepworkCommandInput(" build the feature"), { action: "on", message: "build the feature" });
});

test("registerDeepworkCommand is optional when commands service is absent", () => {
  const controller = new DeepworkModeController({});
  assert.doesNotThrow(() => registerDeepworkCommand({}, controller, () => DEFAULT_DSMM_SETTINGS));
});

test("registerDeepworkCommand resolves the optional commands service without an inject declaration", () => {
  let command: RegisteredCommand | undefined;
  const controller = new DeepworkModeController({});
  const ctx = new Proxy({
    get(name: string) {
      if (name !== "commands") return undefined;
      return { register(value: RegisteredCommand) { command = value; } };
    }
  }, {
    get(target, property, receiver) {
      if (property === "commands") throw new Error("commands was read directly without inject");
      return Reflect.get(target, property, receiver);
    }
  }) as unknown as DshContext;

  assert.doesNotThrow(() => registerDeepworkCommand(ctx, controller, () => DEFAULT_DSMM_SETTINGS));
  assert.equal(command?.name, "deepwork");
});

test("registered command name follows settings.modeName", () => {
  const command = captureCommand({ ...DEFAULT_DSMM_SETTINGS, modeName: "dw" });

  assert.equal(command.name, "dw");
  assert.equal(command.input?.hint, "[off|message]");
});

test("registered command turns mode on and steers non-empty input", async () => {
  const command = captureCommand();
  const appended: unknown[] = [];
  const steered: unknown[] = [];
  const result = await command.handler({
    rawInput: " inspect repo",
    agent: {
      session: { events: [], append: (type, payload) => appended.push({ type, payload }) },
      steer: (message) => steered.push(message)
    }
  } satisfies DshCommandInvocation);

  assert.deepEqual(appended, [{ type: DEEPWORK_MODE_EVENT, payload: { active: true } }]);
  assert.equal(steered.length, 1);
  assert.deepEqual(steered[0], {
    id: (steered[0] as { id: unknown }).id,
    role: "user",
    content: [{ type: "text", text: "inspect repo" }],
    source: { kind: "user" }
  });
  assert.deepEqual(result, { kind: "success", text: "Entering deepwork mode." });
});

test("registered command turns mode off without steering", async () => {
  const command = captureCommand();
  const appended: unknown[] = [];
  const steered: unknown[] = [];
  const result = await command.handler({
    rawInput: " off",
    agent: {
      session: { events: [], append: (type, payload) => appended.push({ type, payload }) },
      steer: (message) => steered.push(message)
    }
  } satisfies DshCommandInvocation);

  assert.deepEqual(appended, []);
  assert.equal(steered.length, 0);
  assert.deepEqual(result, { kind: "success", text: "Leaving deepwork mode." });
});

test("registered command can turn off a default-active mode", async () => {
  const command = captureCommand({ ...DEFAULT_DSMM_SETTINGS, defaultActive: true });
  const appended: unknown[] = [];
  const result = await command.handler({
    rawInput: " off",
    agent: { session: { events: [], append: (type, payload) => appended.push({ type, payload }) } }
  } satisfies DshCommandInvocation);

  assert.deepEqual(appended, [{ type: DEEPWORK_MODE_EVENT, payload: { active: false } }]);
  assert.deepEqual(result, { kind: "success", text: "Leaving deepwork mode." });
});
