import assert from "node:assert/strict";
import { test } from "node:test";
import * as Persona from "@deepseek-ai/dsh-persona";
import { DSMM_ROLES } from "../src/roles.ts";
import { nativeRoutingFixture, runFixtureTurn } from "./native-routing-fixture.ts";

const reviewerIdentity = DSMM_ROLES.find(role => role.id === "dsmm-reviewer")!.persona.split(/\r?\n/u)[0];
const orchestratorIdentity = DSMM_ROLES.find(role => role.id === "dsmm-orchestrator")!.persona.split(/\r?\n/u)[0];

for (const nativePersona of [false, true]) {
  test(`admitted reviewer has its own request identity with inherited persona ${nativePersona}`, { timeout: 15000 }, async () => {
    const f = await nativeRoutingFixture({ defaultActive: true });
    try {
      const parent = await f.create({ agentPreset: "dsmm-orchestrator" });
      if (nativePersona) await parent.ctx.plugin(Persona, { prefix: DSMM_ROLES.find(role => role.id === "dsmm-orchestrator")!.persona }).await();
      await runFixtureTurn(parent);
      const parentRequest = f.adapter.calls.at(-1);
      assert.ok(parentRequest);
      const child = await f.createAuxiliary("dsmm-reviewer", undefined, "one-shot", parent);
      const before = f.adapter.calls.length;
      await runFixtureTurn(child);
      assert.equal(f.adapter.calls.length, before + 1);
      const request = f.adapter.calls.at(-1)!;
      const system = JSON.stringify(request.messages.filter(message => message.role === "system"));
      assert.ok(system.includes(reviewerIdentity), "the actual model request must identify the admitted reviewer");
      assert.equal(system.includes(orchestratorIdentity), false, "a child must not inherit its parent's role identity");
      await runFixtureTurn(parent);
      const nextParentSystem = JSON.stringify(f.adapter.calls.at(-1)!.messages.filter(message => message.role === "system"));
      assert.equal(nextParentSystem.includes(reviewerIdentity), false);
      assert.equal(nextParentSystem.includes(orchestratorIdentity), JSON.stringify(parentRequest.messages).includes(orchestratorIdentity));
    } finally { await f.dispose(); }
  });
}
