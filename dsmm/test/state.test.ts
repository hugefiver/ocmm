import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshAgent, DshSessionEvent } from "../lib/dsh-types.js";
import { DEEPWORK_MODE_EVENT, DeepworkModeController, hasOpenTurn, isDeepworkActive } from "../lib/state.js";

test("activation folds last valid intent, role default on, minimal default off", () => {
  assert.equal(isDeepworkActive([], false), false); assert.equal(isDeepworkActive([], true), true);
  assert.equal(isDeepworkActive([], true, "minimal"), false); assert.equal(isDeepworkActive([], true, "custom-minimal"), true);
  assert.equal(isDeepworkActive([], false, "dsmm-reviewer"), true);
  assert.equal(isDeepworkActive([{ type: DEEPWORK_MODE_EVENT, data: { active: false } }], true, "dsmm-reviewer"), false);
  assert.equal(isDeepworkActive([{ type: DEEPWORK_MODE_EVENT, data: { active: true } }, { type: "other/event", data: { active: false } }, { type: DEEPWORK_MODE_EVENT, data: { active: false } }], true), false);
});

function fixture(preset = "minimal") {
  const events: DshSessionEvent[] = [];
  const agent: DshAgent = {
    session: { header: { agentPreset: preset }, events, append(type, data) { events.push({ type, data }); } },
    async runMaintenance(task) { return task(new AbortController().signal); }
  };
  return { events, agent, controller: new DeepworkModeController({}) };
}

test("same-default explicit choices persist across preset/profile changes and reopen", async () => {
  const { agent, events, controller } = fixture();
  assert.equal(controller.active(agent, true), false);
  assert.equal(await controller.select(agent, false, true), "committed");
  events.push({ type: "agent-preset/selected", data: { agentPreset: "dsmm-reviewer" } });
  assert.equal(controller.active(agent, true), false); assert.equal(controller.describe(agent, true).locked, false);
  await controller.select(agent, true, false);
  events.push({ type: "agent-preset/selected", data: { agentPreset: "minimal" } });
  assert.equal(new DeepworkModeController({}).active(agent, false), true);
  assert.equal(await controller.select(agent, true), "unchanged");
  const disabled = new DeepworkModeController({}, () => false);
  const beforeOff = disabled.describe(agent, false);
  assert.equal(beforeOff.active, false);
  await assert.rejects(disabled.select(agent, true), /not admitted/u);
  assert.equal(await disabled.select(agent, false), "committed", "off must replace persisted on intent even when effective activity is already off");
  assert.notEqual(disabled.describe(agent, false).revision, beforeOff.revision);
  assert.equal(new DeepworkModeController({}).active(agent, true), false, "independent available controller observes saved off intent");
  assert.equal(await disabled.select(agent, false), "unchanged");
});

test("busy mode requests are rejected, not staged into current prompt or future pre-step", async () => {
  const { agent, events, controller } = fixture("standard");
  events.push({ type: "turn/start" });
  const before = controller.describe(agent, false);
  await assert.rejects(controller.select(agent, true), /idle/);
  await assert.rejects(controller.selectIdle(agent, true, false), /idle/);
  assert.deepEqual(controller.describe(agent, false), before);
  events.push({ type: "turn/end" });
  assert.equal(controller.active(agent, false), false);
  await controller.select(agent, true); assert.equal(controller.active(agent, false), true);
});

test("failed writes change neither intent nor revision and do not notify providers", async () => {
  const { agent, controller } = fixture(); let changes = 0;
  controller.watch(() => { changes++; });
  agent.session.append = () => { throw new Error("disk failed"); };
  const before = controller.describe(agent, false);
  const outcomes = await Promise.allSettled([controller.select(agent, true), controller.select(agent, false)]);
  assert.deepEqual(outcomes.map((value) => value.status), ["rejected", "rejected"]);
  await assert.rejects(controller.selectIdle(agent, true, false));
  assert.deepEqual(controller.describe(agent, false), before); assert.equal(changes, 0);
});

test("revision fences preset ABA but ignores unrelated events; native maintenance is mandatory", async () => {
  const { agent, events, controller } = fixture("standard");
  const before = controller.describe(agent, false).revision;
  events.push({ type: "unrelated/event" }); assert.equal(controller.describe(agent, false).revision, before);
  events.push({ type: "agent-preset/selected", data: { agentPreset: "minimal" } }, { type: "agent-preset/selected", data: { agentPreset: "standard" } });
  assert.notEqual(controller.describe(agent, false).revision, before);
  agent.runMaintenance = undefined;
  await assert.rejects(controller.select(agent, true), /maintenance/);
  let reserved = 0;
  agent.runMaintenance = async (task) => { reserved++; return task(new AbortController().signal); };
  await controller.select(agent, true); assert.equal(reserved, 1);
});

test("turn fold handles successive turns and missing history", () => {
  assert.equal(hasOpenTurn(), false); assert.equal(hasOpenTurn([{ type: "turn/start" }]), true);
  assert.equal(hasOpenTurn([{ type: "turn/start" }, { type: "turn/end" }]), false);
  assert.equal(hasOpenTurn([{ type: "turn/start" }, { type: "turn/end" }, { type: "turn/start" }]), true);
});
