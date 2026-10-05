import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshAgent, DshSessionEvent, PreStepDecision, PreStepFrame } from "../lib/dsh-types.js";
import { DEEPWORK_MODE_EVENT, DeepworkModeController, hasOpenTurn, isDeepworkActive } from "../lib/state.js";

type PreStepListener = (frame: PreStepFrame, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>;

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

test("official minimal defaults off but explicit session intent wins across preset changes", async () => {
  const events: DshSessionEvent[] = [];
  const agent: DshAgent = { session: { header: { agentPreset: "minimal" }, events, append(type, data) { events.push({ type, data }); } } };
  const controller = new DeepworkModeController({});
  assert.equal(controller.active(agent, true), false);
  assert.equal(controller.describe(agent, true).explicit, false);
  assert.equal(await controller.select(agent, false, true), "committed", "same-default off must still record explicit intent");
  events.push({ type: "agent-preset/selected", data: { agentPreset: "standard" } });
  assert.equal(controller.active(agent, true), false);
  await controller.select(agent, true, false);
  events.push({ type: "agent-preset/selected", data: { agentPreset: "minimal" } });
  assert.equal(new DeepworkModeController({}).active(agent, false), true, "reopened minimal retains explicit on");
  assert.equal(isDeepworkActive([], true, "minimal"), false);
  assert.equal(isDeepworkActive([], true, "custom-minimal"), true, "custom IDs are not official minimal");
});

test("same-default on persists and strict idle append failure changes neither intent nor revision", async () => {
  const events: DshSessionEvent[] = [];
  let fail = false;
  const agent: DshAgent = { session: { events, append(type, data) { if (fail) throw new Error("disk failed"); events.push({ type, data }); } } };
  const controller = new DeepworkModeController({});
  await controller.selectIdle(agent, true, true);
  assert.equal(controller.active(agent, false), true, "profile defaults cannot erase an explicit same-default choice");
  const before = controller.describe(agent, false);
  fail = true;
  await assert.rejects(controller.selectIdle(agent, false, false));
  assert.deepEqual(controller.describe(agent, false), before);
  await assert.rejects(controller.select(agent, false, false));
  assert.deepEqual(controller.describe(agent, false), before);
});

test("mode revision fences pending and preset ABA intent without being invalidated by unrelated events", async () => {
  const events: DshSessionEvent[] = [{ type: "turn/start" }];
  const agent: DshAgent = { session: { events, header: { agentPreset: "standard" }, append(type, data) { events.push({ type, data }); } } };
  const controller = new DeepworkModeController({});
  const original = controller.describe(agent, false).revision;
  events.push({ type: "unrelated/event" });
  assert.equal(controller.describe(agent, false).revision, original);
  await controller.select(agent, true);
  assert.notEqual(controller.describe(agent, false).revision, original);
  const pending = controller.describe(agent, false).revision;
  events.push({ type: "agent-preset/selected", data: { agentPreset: "minimal" } }, { type: "agent-preset/selected", data: { agentPreset: "standard" } });
  assert.notEqual(controller.describe(agent, false).revision, pending);
  await assert.rejects(controller.selectIdle(agent, false, false));
  assert.equal(controller.active(agent, false), true, "refused idle mutation retains the earlier pending CLI intent");
});

test("overlapping failed idle command appends cannot resurrect either rejected intent", async () => {
  const controller = new DeepworkModeController({});
  const agent: DshAgent = { session: { events: [], append() { throw new Error("disk failed"); } } };
  const before = controller.describe(agent, false);
  const outcomes = await Promise.allSettled([controller.select(agent, true, false), controller.select(agent, false, false)]);
  assert.deepEqual(outcomes.map((outcome) => outcome.status), ["rejected", "rejected"]);
  assert.deepEqual(controller.describe(agent, false), before);
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
  let listener: PreStepListener | undefined;
  const controller = new DeepworkModeController({
    systemPrompt: { section() {} },
    on(event, fn) {
      assert.equal(event, "agent/pre-step");
      listener = fn as PreStepListener;
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
  let listener: PreStepListener | undefined;
  const warnings: unknown[][] = [];
  const controller = new DeepworkModeController({
    on(event, fn) {
      assert.equal(event, "agent/pre-step");
      listener = fn as PreStepListener;
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
