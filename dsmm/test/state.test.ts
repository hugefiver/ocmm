import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshAgent, PreStepDecision, PreStepFrame } from "../lib/dsh-types.js";
import { DEEPWORK_MODE_EVENT, DeepworkModeController, hasOpenTurn, isDeepworkActive } from "../lib/state.js";

test("isDeepworkActive folds the last deepwork mode event", () => {
  assert.equal(isDeepworkActive([], false), false);
  assert.equal(isDeepworkActive([], true), true);
  assert.equal(isDeepworkActive([
    { type: DEEPWORK_MODE_EVENT, data: { active: true } },
    { type: "other/event", data: { active: false } },
    { type: DEEPWORK_MODE_EVENT, data: { active: false } }
  ], true), false);
});

test("isDeepworkActive uses defaultActive until an explicit mode event appears", () => {
  assert.equal(isDeepworkActive([{ type: "other/event", data: { active: false } }], true), true);
  assert.equal(isDeepworkActive([{ type: DEEPWORK_MODE_EVENT, data: { active: true } }], false), true);
});

test("hasOpenTurn tracks turn/start and turn/end", () => {
  assert.equal(hasOpenTurn(), false);
  assert.equal(hasOpenTurn([{ type: "turn/start" }]), true);
  assert.equal(hasOpenTurn([{ type: "turn/start" }, { type: "turn/end" }]), false);
  assert.equal(hasOpenTurn([{ type: "turn/start" }, { type: "turn/end" }, { type: "turn/start" }]), true);
});

test("DeepworkModeController commits immediately outside an open turn", async () => {
  const appended: unknown[] = [];
  const controller = new DeepworkModeController({ systemPrompt: { section() {} } });
  const outcome = await controller.select({
    session: { events: [], append: (type, payload) => appended.push({ type, payload }) }
  }, true);

  assert.equal(outcome, "committed");
  assert.deepEqual(appended, [{ type: DEEPWORK_MODE_EVENT, payload: { active: true } }]);
});

test("DeepworkModeController defers selection during an open turn and commits at pre-step", async () => {
  let listener: ((frame: PreStepFrame, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>) | undefined;
  const controller = new DeepworkModeController({
    systemPrompt: { section() {} },
    on(event, fn) {
      assert.equal(event, "agent/pre-step");
      listener = fn;
    }
  });
  const appended: unknown[] = [];
  const agent: DshAgent = {
    session: { events: [{ type: "turn/start" }], append: (type, payload) => appended.push({ type, payload }) }
  };

  assert.equal(await controller.select(agent, true), "pending");
  assert.equal(controller.active(agent, false), true);
  assert.ok(listener);
  await listener({ agent, signal: new AbortController().signal }, async () => ({ kind: "accept", messages: [] }));

  assert.deepEqual(appended, [{ type: DEEPWORK_MODE_EVENT, payload: { active: true } }]);
});

test("DeepworkModeController can turn off a default-active mode", async () => {
  const appended: unknown[] = [];
  const controller = new DeepworkModeController({});
  const agent: DshAgent = {
    session: { events: [], append: (type, payload) => appended.push({ type, payload }) }
  };

  assert.equal(controller.active(agent, true), true);
  const outcome = await controller.select(agent, false, true);

  assert.equal(outcome, "committed");
  assert.deepEqual(appended, [{ type: DEEPWORK_MODE_EVENT, payload: { active: false } }]);
});
