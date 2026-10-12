import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import { createLegacyReadIntegration } from "../src/legacy-read-integration.ts";
import { SessionId } from "@deepseek-ai/dsh-session";
import { DsmmSubagentRuntime } from "../src/subagent-runtime.ts";
import { fixture, gate } from "./legacy-read-integration-fixture.mjs";

const scenario = process.argv[2];
const producer = await fixture({ oldOnly: true });
await producer.dispose();
let consumer;
try {
  let windowChecks = 0;
  const options = { root: producer.root, parentId: producer.parentId, childId: producer.childId, coldCore: true,
    off: scenario === "off", unknown: scenario === "unknown",
    nativeResidency: scenario === "delivery-config",
    async beforeColdAttachment({ agent, parent, integration, runtime, authority, native, bodies }) {
      windowChecks++;
      assert.equal(authority, native.authority); assert.ok(native instanceof DsmmSubagentRuntime);
      assert.equal(runtime.admission(agent).childEvidence.mode, "legacy-conservative");
      assert.ok(Object.isFrozen(runtime.admission(agent))); assert.ok(Object.isFrozen(integration.core));
      const beforeReads = bodies.read;
      const inheritedAttempt = await agent.ctx.tools.execute({ agent, name: "read", arguments: { file_path: "useful.txt" },
        callId: ToolCallId(randomUUID()), signal: new AbortController().signal });
      assert.equal(inheritedAttempt.isError, true); assert.equal(bodies.read, beforeReads);
      assert.equal(integration.view().activeCalls, 0); assert.equal(agent.session.header.parentSession, parent.id);
    } };
  if (scenario === "off" || scenario === "unknown") {
    await assert.rejects(fixture(options), { code: "composition-unavailable" });
    assert.equal(windowChecks, scenario === "off" ? 0 : 1);
  } else {
    consumer = await fixture(options);
    const f = consumer, core = f.integration.core;
    assert.ok(core); assert.equal(f.authority, f.native.authority); assert.equal(f.child.id, producer.childId);
    assert.equal(windowChecks, 1); assert.equal(f.integration.view().state, "ready");
    assert.equal(await f.runtime.childCaptureStore.readChildAdmission(f.child.id, f.parent.id), null);
    if (scenario === "cold-read") {
      const result = await f.execute(); assert.equal(result.isError, false); assert.equal(result.value.lines[0].text, "useful once");
      const audit = await f.settle(); assert.equal(f.bodies.read, 1); assert.equal(audit.length, 1);
      assert.equal(audit[0].child, producer.childId); assert.ok(audit[0].parentCallId);
    } else if (scenario === "delivery-config") {
      await f.native.sendMessage(f.parent, f.child.id, [{ type: "text", text: "actual managed delivery" }], { signal: new AbortController().signal });
      await f.child.whenIdle();
      const admission = f.runtime.admission(f.child), oldGeneration = f.integration.view().generation;
      const before = f.child.session.ownEvents().filter(event => event.type === "user/message").length;
      await core.changeConfiguration("actual A parent role Apply", async () => { await f.apply({ roles: { "dsmm-reviewer": false } }); });
      assert.ok(f.integration.view().generation > oldGeneration);
      await assert.rejects(f.native.sendMessage(f.parent, f.child.id, [{ type: "text", text: "must not enter inbox" }], { signal: new AbortController().signal }));
      assert.equal(f.child.session.ownEvents().filter(event => event.type === "user/message").length, before);
      assert.equal((await f.execute()).isError, true); assert.equal(f.bodies.read, 0);
      assert.equal(f.runtime.admission(f.child), admission);
    } else if (scenario === "disposal-audit") {
      const entered = gate(), finish = gate(); let nativeDisposal = false;
      f.setBeforeFinish(async () => { entered.release(); await finish.promise; });
      const accepted = await f.execute(); await entered.promise; assert.equal(accepted.isError, false);
      const closing = core.revokeBeforeDispose(f.parent, async () => {
        nativeDisposal = true;
        await f.native.drainContinuableDescendants([f.parent]); await f.childHandle.dispose(); await f.parentHandle.dispose();
      });
      try {
        assert.throws(() => f.authority.acquireParentTicket(f.parent));
        assert.equal(nativeDisposal, false); assert.equal((await f.execute()).isError, true);
        assert.equal(f.bodies.read, 1); assert.equal(accepted.isError, false);
      } finally { finish.release(); await closing; }
      assert.equal(nativeDisposal, true); assert.equal(f.ctx.agents.get(f.child.id), undefined);
      assert.equal(f.integration.view().activeCalls, 0); assert.equal((await f.settle()).length, 1);
    } else if (scenario === "no-hot-replacement") {
      assert.throws(() => createLegacyReadIntegration(f.integrationOptions), { code: "lifetime-unavailable" });
      assert.equal((await f.execute()).isError, false); assert.equal(f.bodies.read, 1); assert.equal((await f.settle()).length, 1);
    } else if (scenario === "automatic-retirement") {
      const original = f.child, oldGeneration = f.integration.view().generation;
      assert.equal((await f.execute()).isError, false); assert.equal((await f.settle()).length, 1);
      await f.childHandle.dispose(); await f.integration.whenChildRetired(original);
      assert.equal(f.ctx.agents.get(original.id), undefined); assert.equal(f.integration.view().activeCalls, 0);
      assert.equal(f.integration.classifyLegacyTool("read", original.ctx.tools, original), undefined);
      const replacement = await f.ctx.agents.resume({ resumeSessionId: SessionId(original.id), parentAgent: f.parent,
        agentOptions: { provider: "fixture", model: "reviewer-original" } });
      try {
        assert.notEqual(replacement.agent, original); assert.equal(replacement.agent.id, producer.childId);
        assert.equal(f.integration.view().state, "ready"); assert.ok(f.integration.view().generation > oldGeneration);
        const result = await replacement.agent.ctx.tools.execute({ agent: replacement.agent, name: "read",
          arguments: { file_path: "useful.txt", offset: 2, limit: 1 }, callId: ToolCallId(randomUUID()), signal: new AbortController().signal });
        assert.equal(result.isError, false); assert.equal(result.value.lines[0].text, "useful once"); assert.equal(f.bodies.read, 2);
        assert.equal((await f.settle()).length, 2);
        assert.equal(await f.runtime.childCaptureStore.readChildAdmission(replacement.agent.id, f.parent.id), null);
      } finally { await replacement.dispose(); await f.integration.whenChildRetired(replacement.agent); }
    } else throw new Error("Unknown cold consumer scenario");
    assert.equal(f.bodies.write, 0); assert.equal(f.bodies.shell, 0);
  }
  console.log(JSON.stringify({ scenario, shutdown: true }));
} finally {
  if (consumer) await consumer.dispose();
  await rm(producer.root, { recursive: true, force: true });
}
