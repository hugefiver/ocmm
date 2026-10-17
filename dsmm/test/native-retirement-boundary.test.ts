import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { AgentHandle } from "@deepseek-ai/dsh-agent";
import { SessionId } from "@deepseek-ai/dsh-session";
import type { DshAgent } from "../src/dsh-types.ts";
import { deliveryFixture, gate } from "./delivery-runtime-fixture.ts";
import { nativeRoutingFixture } from "./native-routing-fixture.ts";

test("a completed root creation keeps residency when its creation-only caller cancels", async () => {
  const f = await deliveryFixture({ connection: false });
  const caller = new AbortController();
  let handle: AgentHandle | undefined;
  try {
    handle = await f.ctx.agents.create({ sessionId: SessionId(randomUUID()), meta: { cwd: f.root },
      agentOptions: { provider: "fixture", model: "native" }, signal: caller.signal });
    const admission = { epoch: randomUUID(), permitted: true };
    f.runtime.authority.registerParent(handle.agent, admission, f.owner);
    const ticket = f.runtime.authority.acquireParentTicket(handle.agent);
    caller.abort();
    assert.equal(ticket.signal.aborted, false);
    assert.doesNotThrow(() => f.runtime.authority.assertSender(handle!.agent));
    f.runtime.authority.withdrawParent(handle.agent, "policy-withdrawn");
    assert.doesNotThrow(() => f.runtime.authority.registerParent(handle!.agent, admission, f.owner));
  } finally { await handle?.dispose(); await f.dispose(); }
});

test("native root disposal permanently rejects exact residency re-enrollment before registry removal", async () => {
  const f = await deliveryFixture({ connection: false });
  let disposal: Promise<void> | undefined;
  try {
    const parent = await f.create();
    const ticket = f.runtime.authority.acquireParentTicket(parent);
    disposal = f.beginAgentDisposal(parent);
    assert.equal(ticket.signal.aborted, true);
    assert.equal(f.ctx.agents.get(parent.id), parent);
    assert.throws(() => f.runtime.authority.registerParent(parent, ticket.admission, ticket.owner), { code: "UNAUTHORIZED" });
    assert.throws(() => f.runtime.authority.assertSender(parent), { code: "UNAUTHORIZED" });
    await disposal;
  } finally { await disposal; await f.dispose(); }
});

for (const surface of ["bridge", "integration", "host"] as const) {
  for (const withdrawn of [false, true]) {
    test(`${surface} teardown retires exact child before cleanup with admission ${withdrawn ? "withdrawn" : "active"}`, { timeout: 15000 }, async () => {
      const f = await nativeRoutingFixture({ defaultActive: true });
      const release = gate();
      let disposal: Promise<void> | undefined;
      try {
        const child = await f.createAuxiliary("dsmm-reviewer");
        const integration = f.ctx.get("dsmmRuntimeIntegration");
        assert.ok(integration);
        const parent = f.ctx.agents.get(child.session.header.parentSession!);
        assert.ok(parent);
        const authority = integration.runtime.authority;
        const ticket = authority.acquireParentTicket(child);
        assert.doesNotThrow(() => authority.assertSender(child));
        if (withdrawn) integration.bridge.authority.revokeParent(child as unknown as DshAgent, "policy-withdrawn");
        const cleanup = () => release.promise;
        disposal = surface === "bridge"
          ? integration.bridge.revokeBeforeDispose(child as unknown as DshAgent, cleanup)
          : surface === "integration" ? integration.revokeBeforeDispose(child, cleanup) : integration.dispose(cleanup);
        assert.equal(ticket.signal.aborted, true);
        assert.equal(f.ctx.agents.get(child.id), child);
        assert.throws(() => authority.assertSender(child), { code: "UNAUTHORIZED" });
        assert.throws(() => authority.registerParent(child, ticket.admission, ticket.owner), { code: "UNAUTHORIZED" });
        await assert.rejects(integration.runtime.sendMessage(child, parent.id, [{ type: "text", text: "must not report during teardown" }],
          { signal: new AbortController().signal }), { code: "UNAUTHORIZED" });
        release.release();
        await disposal;
      } finally { release.release(); await disposal; await f.dispose(); }
    });
  }
}
