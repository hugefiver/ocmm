import assert from "node:assert/strict";
import { test } from "node:test";
import { Context, symbols } from "@deepseek-ai/cordis";
import { DsmmAgentRegistry } from "../src/agent-registry.ts";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import { SubagentError } from "@deepseek-ai/dsh-subagent";
import { pathToFileURL } from "node:url";
import { carrierPlugin, DsmmSubagentRuntime, gate } from "./delivery-runtime-fixture.ts";

interface StartupEntry {
  id: string;
  name: string;
  disabled?: boolean;
  inject?: string[];
  config?: object;
}
interface StartupLoader {
  builtins: Record<string, unknown>;
  root: { update(entries: StartupEntry[]): Promise<void> };
  resolve(id: string): { fiber?: Context["fiber"] };
}

test("actual Loader concurrent composition supplies the sole subagents before late policy, but waits for actual spawn/fork registration and policy publication", async () => {
  const ctx = new Context();
  const provided = gate(), policyEntered = gate(), publication = gate();
  const cancelled = new AbortController();
  let mounting: Promise<void> | undefined;
  try {
    await Promise.all([ctx.plugin(DsmmAgentRegistry).await(), ctx.plugin(SessionProjectionRegistry).await(), ctx.plugin(SystemPrompt, {}).await(), ctx.plugin(ToolRuntime, { mode: "native" }).await(), ctx.plugin(TypertRegistry).await()]);
    const access = await carrierPlugin("@deepseek-ai/dsh-api-remote-access");
    await ctx.plugin(access.default).await();
    const fs = await carrierPlugin("@deepseek-ai/dsh-fs-local"), directory = await carrierPlugin("@deepseek-ai/dsh-working-directory");
    await ctx.plugin(fs.default, { cwd: process.cwd() }).await();
    await ctx.plugin(directory.default, { defaultDirectory: process.cwd() }).await();
    assert.ok(ctx.get("workingDirectory"), "native workingDirectory must be registered");
    const loaderModule = await carrierPlugin("@deepseek-ai/cordis-plugin-loader");
    const entry = process.env.DSMM_TEST_DSH_ENTRY;
    const baseUrl = new URL(".", entry === undefined ? import.meta.url : pathToFileURL(entry)).href;
    await ctx.plugin(loaderModule.default, { baseUrl }).await();
    const loader = ctx.get("loader") as StartupLoader;
    let runtime!: InstanceType<typeof DsmmSubagentRuntime>;
    const owner = {};
    // The package export is parent-owned; this builtin mounts the real class through the public Loader.
    class StartupRuntime extends DsmmSubagentRuntime {
      constructor(scope: Context, config: ConstructorParameters<typeof DsmmSubagentRuntime>[1]) {
        super(scope, config);
        this.requireProviders(["spawn", "fork"]);
        runtime = this;
        provided.release();
      }
    }
    loader.builtins["c1-runtime"] = { default: StartupRuntime };
    loader.builtins["c1-late-policy"] = { inject: ["subagents"], async apply(scope: Context) {
      assert.equal(Reflect.get(scope.subagents, symbols.original) ?? scope.subagents, runtime);
      policyEntered.release();
      await publication.promise;
      runtime.authority.bindPolicy(scope, owner, {
        classifyParent: () => "dsmm",
        async resolveChildEvidence() { throw new SubagentError("no child admitted in startup-only fixture", "UNAUTHORIZED"); },
        assertDelivery() { throw new SubagentError("no child admitted in startup-only fixture", "UNAUTHORIZED"); }
      });
      runtime.authority.enablePolicy(owner);
      scope.provide("c1StartupPolicy", owner);
    } };
    mounting = loader.root.update([
      { id: "c1-policy", name: "cordis:c1-late-policy" },
      { id: "spawn", name: "@deepseek-ai/dsh-subagent-spawn-in-process", config: { providerName: "spawn" } },
      { id: "fork", name: "@deepseek-ai/dsh-subagent-fork-in-process", config: { providerName: "fork" } },
      { id: "model-controls", name: "@deepseek-ai/dsh-tool-subagent-control" },
      { id: "typert-gateway", name: "@deepseek-ai/dsh-api-gateway", inject: ["subagents", "c1StartupPolicy"], config: {} },
      { id: "subagent", name: "@deepseek-ai/dsh-subagent", disabled: true },
      { id: "c1-subagent", name: "cordis:c1-runtime", config: { maxDepth: 3, maxActiveSubagents: 8 } }
    ]);
    await provided.promise;
    await policyEntered.promise;
    const [spawn, fork] = await Promise.all([runtime.waitForProvider("spawn", cancelled.signal), runtime.waitForProvider("fork", cancelled.signal)]);
    assert.equal(spawn, runtime.getProvider("spawn"));
    assert.equal(fork, runtime.getProvider("fork"));
    assert.equal(loader.resolve("subagent").fiber, undefined);
    assert.equal(Reflect.get(ctx.subagents, symbols.original) ?? ctx.subagents, runtime);
    assert.equal(runtime.authority.view().deliveryFenceReady, false);
    assert.equal(ctx.get("typertGateway"), undefined);
    let ready = false;
    const admissionReady = runtime.waitUntilReady(cancelled.signal).then(() => { ready = true; });
    await Promise.resolve();
    assert.equal(ready, false);
    publication.release();
    await mounting;
    await admissionReady;
    await Promise.all([loader.resolve("typert-gateway").fiber?.await(), loader.resolve("model-controls").fiber?.await()]);
    assert.equal(runtime.authority.view().deliveryFenceReady, true);
    assert.ok(ctx.get("typertGateway"));
    assert.ok(ctx.typert.local.get("subagents/prompt"));
    assert.ok(ctx.tools.get("send_message"));
    assert.ok(ctx.tools.get("interrupt_agent"));
    assert.equal(Reflect.get(ctx.subagents, symbols.original) ?? ctx.subagents, runtime);
  } finally {
    publication.release(); cancelled.abort();
    await mounting?.catch(() => {});
    await ctx.fiber.dispose();
  }
});
