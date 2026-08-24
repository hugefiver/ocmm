import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshAgent, DshSessionEvent, PreStepDecision, PreStepFrame } from "../lib/dsh-types.js";
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

test("DeepworkModeController retries a failed boundary append without changing the accepted decision", async () => {
  let listener: ((frame: PreStepFrame, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>) | undefined;
  const warnings: unknown[][] = [];
  const controller = new DeepworkModeController({
    on(event, fn) {
      assert.equal(event, "agent/pre-step");
      listener = fn;
    },
    logger: { warn(...args) { warnings.push(args); } }
  });
  const events: DshSessionEvent[] = [{ type: "turn/start" }];
  const cause = new Error("append failed");
  let failAppend = true;
  let appendAttempts = 0;
  let successfulAppends = 0;
  const agent: DshAgent = {
    session: {
      events,
      async append(type, payload) {
        appendAttempts += 1;
        if (failAppend) {
          failAppend = false;
          throw cause;
        }
        successfulAppends += 1;
        events.push({ type, data: payload });
      }
    }
  };
  const accepted: PreStepDecision = { kind: "accept", messages: [] };

  assert.equal(await controller.select(agent, true), "pending");
  assert.ok(listener);
  assert.equal(await listener({ agent, signal: new AbortController().signal }, async () => accepted), accepted);
  assert.equal(appendAttempts, 1);
  assert.equal(successfulAppends, 0);
  assert.deepEqual(warnings, [["dsmm failed to append deepwork mode event; pending intent will retry", cause]]);
  assert.equal(controller.active(agent, false), true);

  assert.equal(await listener({ agent, signal: new AbortController().signal }, async () => accepted), accepted);
  assert.equal(appendAttempts, 2);
  assert.equal(successfulAppends, 1);
  assert.equal(events.filter((event) => event.type === DEEPWORK_MODE_EVENT).length, 1);
  assert.equal(await controller.select(agent, true), "unchanged");
  assert.equal(controller.active(agent, false), true);
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
