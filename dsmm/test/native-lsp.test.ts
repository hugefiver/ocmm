import assert from "node:assert/strict";
import { test, mock } from "node:test";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import { nativeRoutingFixture } from "./native-routing-fixture.ts";
import { createDsmmStatusSnapshot } from "../lib/status.js";
import type { DsmmProfileRuntime } from "../lib/profile-runtime.js";
import type { DshAgent } from "../lib/dsh-types.js";
import type { DshContext } from "../lib/dsh-types.js";
import { DsmmDeploymentConfig } from "../lib/deployment-config.js";

for (const enabled of [false, true]) {
  test(`DSMM keeps its external LSP closed with retained enabled=${enabled} configuration`, async () => {
    const command = "dsmm-retained-lsp-executable";
    let lspSpawns = 0;
    const spawn = childProcess.spawn;
    const spy = mock.method(childProcess, "spawn", (...args: Parameters<typeof childProcess.spawn>) => {
      if (args[0] === command) lspSpawns++;
      return spawn(...args);
    });
    syncBuiltinESMExports();
    let hostCalls = 0;
    let f: Awaited<ReturnType<typeof nativeRoutingFixture>> | undefined;
    try {
      f = await nativeRoutingFixture({ defaultActive: true }, {
        fixtureTools: [{ name: "mcp__host_lsp__status", description: "Host-owned LSP status", parameters: {},
          output: { schema: { type: "string" }, render: () => [{ type: "text", text: "host LSP" }] },
          async execute() { hostCalls++; return "host LSP"; } }],
        async beforeDsmm(ctx) {
          const deployment = new DsmmDeploymentConfig(ctx as unknown as DshContext, {});
          await deployment.saveGlobal({ expectedRevision: "absent", edits: [{ op: "set", path: ["lsp"],
            value: { enabled, command, args: ["mcp"], failOnStartupError: true } }] }, () => {});
        }
      });
      const agent = await f.create();
      const state = f.ctx.get("dsmmLspState")!();
      assert.deepEqual(state, { state: "disabled", tools: [] });
      assert.equal(lspSpawns, 0);
      assert.equal(agent.ctx.get("tools")!.get("mcp__dsmm_lsp__status", agent), undefined);
      const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
      const settings = runtime.getSettings(agent as unknown as DshAgent);
      assert.equal(settings.lsp.enabled, enabled);
      const deployment = f.ctx.get("dsmmDeploymentConfig") as DsmmDeploymentConfig;
      assert.equal((await deployment.readGlobal()).config.lsp?.enabled, enabled);
      const status = createDsmmStatusSnapshot({ agent: agent as unknown as DshAgent, settings, modeActive: true,
        admission: runtime.admission(agent as unknown as DshAgent) });
      assert.equal(status.lspRuntime?.state, "disabled");
      const hostResult = await agent.ctx.get("tools")!.execute({ agent, name: "mcp__host_lsp__status", arguments: {},
        callId: ToolCallId("host-lsp"), signal: new AbortController().signal });
      assert.equal(hostResult.isError, false);
      assert.equal(hostCalls, 1);
    } finally {
      await f?.dispose();
      spy.mock.restore();
      syncBuiltinESMExports();
    }
  });
}
