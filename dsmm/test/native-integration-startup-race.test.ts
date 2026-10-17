import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Context } from "@deepseek-ai/cordis";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { DsmmAgentRegistry } from "../lib/agent-registry.js";
import DsmmPlugin from "../lib/index.js";
import RuntimePlugin, { integrateSubagentRuntime, runtimeAdmissionView } from "../lib/runtime-integration.js";
import { DsmmRolePolicy } from "../lib/role-policy.js";
import { resolveConfig } from "../lib/settings.js";
import { DeepworkModeController } from "../lib/state.js";
import type { DshContext } from "../lib/dsh-types.js";

const sdk = createRequire(process.env.DSMM_TEST_DSH_ENTRY ?? import.meta.url);

async function installHostFilesystem(ctx: Context, root: string): Promise<void> {
  const fsLocal = await import(pathToFileURL(sdk.resolve("@deepseek-ai/dsh-fs-local")).href);
  const directory = await import(pathToFileURL(sdk.resolve("@deepseek-ai/dsh-working-directory")).href);
  await ctx.plugin(fsLocal.default, { cwd: root }).await();
  await ctx.plugin(directory.default, { defaultDirectory: root }).await();
}

async function settles<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} remained pending after native lifecycle withdrawal`)), 1000);
    })]);
  } finally { clearTimeout(timer); }
}

for (const withdraw of ["runtime", "injection", "injection-during-create"] as const) test(`native integration rejects when ${withdraw} is disposed before its injection callback executes`, async () => {
  const root = await mkdtemp(join(tmpdir(), "dsmm-integration-callback-"));
  const ctx = new Context();
  try {
    await Promise.all([ctx.plugin(DsmmAgentRegistry).await(), ctx.plugin(SessionProjectionRegistry).await(), ctx.plugin(SystemPrompt, {}).await()]);
    await installHostFilesystem(ctx, root);
    const runtime = ctx.plugin(RuntimePlugin, {});
    await runtime.await();
    let injection: Context["fiber"] | undefined;
    let withdrawal: Promise<void> | undefined;
    ctx.on("internal/plugin", fiber => {
      if ("subagents" in fiber.inject && fiber.uid !== null) {
        injection = fiber;
        if (withdraw === "injection-during-create") withdrawal = fiber.dispose();
      }
    }, { global: true });
    const settings = resolveConfig({});
    const policy = new DsmmRolePolicy(ctx as unknown as DshContext, () => settings, new DeepworkModeController(ctx as unknown as DshContext));
    const integration = integrateSubagentRuntime(ctx, settings, policy, () => undefined);
    const refused = assert.rejects(settles(integration, "integration"), { code: "unavailable" });
    assert.ok(injection);
    await settles(withdrawal ?? (withdraw === "runtime" ? runtime : injection).dispose(), `${withdraw} disposal`);
    await refused;
    if (withdraw === "runtime") {
      await ctx.plugin(RuntimePlugin, {}).await();
      await assert.rejects(settles(injection.await(), "retired injection reactivation"), { code: "unavailable" });
      assert.equal(runtimeAdmissionView(ctx).deliveryFenceReady, false);
    }
    assert.equal(ctx.get("dsmmRuntimeIntegration"), undefined);
    assert.deepEqual(ctx.agents.list(), []);
  } finally {
    try { await settles(ctx.fiber.dispose(), "Host disposal"); }
    finally { await rm(root, { recursive: true, force: true }); }
  }
});

for (const withdraw of ["runtime", "entry"] as const) test(`real native DSMM entry startup and disposal settle when ${withdraw} is withdrawn before integration callback execution`, async () => {
  const root = await mkdtemp(join(tmpdir(), "dsmm-integration-startup-"));
  const ctx = new Context();
  try {
    await Promise.all([ctx.plugin(DsmmAgentRegistry).await(), ctx.plugin(SessionProjectionRegistry).await(), ctx.plugin(SystemPrompt, {}).await()]);
    await installHostFilesystem(ctx, root);
    ctx.provide("profileContext", { home: root, dir: root, startedBundles: ["@deepseek-ai/dsh-headless"] });
    const runtime = ctx.plugin(RuntimePlugin, {});
    await runtime.await();
    let withdrawal: Promise<void> | undefined;
    let owner: Context["fiber"] | undefined;
    const name = `dsmm-integration-race-${withdraw}`;
    ctx.on("internal/plugin", fiber => {
      if (fiber.runtime?.name === name) owner = fiber;
      if ("subagents" in fiber.inject && fiber.uid !== null) {
        assert.ok(owner);
        withdrawal = (withdraw === "runtime" ? runtime : owner).dispose();
      }
    }, { global: true });
    const entry = ctx.plugin({ name, inject: [...DsmmPlugin.inject], apply(scope: Context) {
      return DsmmPlugin.apply(scope as unknown as DshContext, { presets: { materialize: false, root: join(root, "agent-presets") }, lsp: { enabled: false } });
    } });
    await assert.rejects(settles(entry.await(), "entry startup"), error => error instanceof Error && "code" in error
      && (error.code === "unavailable" || error.code === "UNAUTHORIZED"));
    assert.ok(withdrawal);
    await settles(withdrawal, `${withdraw} withdrawal`);
    await settles(entry.dispose(), "entry disposal");
    assert.equal(entry.uid, null);
    assert.equal(ctx.get("dsmmProfileRuntime"), undefined);
    assert.equal(ctx.get("dsmmRuntimeIntegration"), undefined);
    assert.deepEqual(ctx.agents.list(), []);
  } finally {
    try { await settles(ctx.fiber.dispose(), "Host disposal"); }
    finally { await rm(root, { recursive: true, force: true }); }
  }
});
