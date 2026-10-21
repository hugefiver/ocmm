import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import type { Agent, AgentHandle } from "@deepseek-ai/dsh-agent";
import { AgentLoop } from "@deepseek-ai/dsh-agent-loop";
import { AgentPresetRegistry } from "@deepseek-ai/dsh-agent-preset-registry";
import { TypertGatewayService } from "@deepseek-ai/dsh-api-gateway";
import * as Connection from "@deepseek-ai/dsh-client-connection";
import { LlmRuntime } from "@deepseek-ai/dsh-llm";
import { SessionId, SessionStore } from "@deepseek-ai/dsh-session";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import DsmmPlugin from "../src/index.ts";
import { createCorePermissionAuthority } from "../src/core-permission-authority.ts";
import type { DshAgent } from "../src/dsh-types.ts";
import { PermissionRefusal } from "../src/permission-control.ts";
import { parsePermissionRulesResult } from "../src/permission-remote.ts";
import type { DsmmProfileRuntime } from "../src/profile-runtime.ts";
import { useIsolatedDshEnvironment } from "./dsh-test-environment.ts";
import { mountPermissionHostCore, permissionHostProfile } from "./permission-host-fixture.ts";

useIsolatedDshEnvironment();
const native = createRequire(createRequire(import.meta.url).resolve("@deepseek-ai/dsh-agent-preset-registry"));
const { Loader } = native("@deepseek-ai/cordis-plugin-loader");
const { CredentialProvider } = native("@deepseek-ai/dsh-credentials");
const { RemoteAccessService } = native("@deepseek-ai/dsh-api-remote-access");
const { ApprovalService } = native("@deepseek-ai/dsh-user-approval");
const { SandboxPolicyService, setSandboxMode } = native("@deepseek-ai/dsh-sandbox-policy");
class MemoryCredentials extends CredentialProvider {
  async modifyRecord(_key: string, modify: (value: unknown) => Promise<unknown>) { return modify(undefined); }
}

async function fixture() {
  const parent = await realpath(tmpdir()), directory = await mkdtemp(join(parent, "dsmm-permission-root-rpc-"));
  const home = join(directory, "home"); await mkdir(home);
  const ctx = new Context().extend({ baseUrl: new URL("../", import.meta.url).href }), handles: AgentHandle[] = [];
  try {
    ctx.provide("profileContext", { ...permissionHostProfile(directory, home,
      { defaultActive: false, lsp: { enabled: false }, presets: { root: join(directory, "presets") } }),
      baseUrl: new URL("../", import.meta.url).href });
    for (const [plugin, config] of [[AgentRegistry], [SessionStore], [SessionProjectionRegistry], [LlmRuntime],
      [SystemPrompt, {}], [ToolRuntime, { mode: "native" }], [AgentLoop, {}], [Loader, { baseUrl: new URL("../", import.meta.url).href }], [AgentPresetRegistry, { default: "standard" }],
      [RemoteAccessService], [MemoryCredentials], [Connection], [TypertRegistry], [TypertGatewayService, {}],
      [ApprovalService, { policy: "ask" }], [SandboxPolicyService, { defaultMode: "workspace-write" }]] as const) {
      await ctx.plugin(plugin as never, config as never).await();
    }
    ctx.provide("webServer", { host: "127.0.0.1" });
    for (const id of ["standard", "dsmm-planner", "dsmm-unknown"]) {
      await ctx.agentPresets.register({ id, name: id, description: "Permission root composition", plugins: [] });
    }
    const create = async (preset = "standard", historical = preset, parentAgent?: Agent) => {
      const handle = await ctx.agents.create({ sessionId: SessionId(randomUUID()),
        ...parentAgent === undefined ? {} : { parentAgent },
        meta: { cwd: directory, agentPreset: historical, ...parentAgent === undefined ? {} : { origin: "subagent" as const } },
        agentOptions: { provider: "unused-local", model: "unused-local" },
        async setup(scope) { await ctx.agentPresets.mount(scope, preset); } });
      handles.push(handle); setSandboxMode(handle.agent.session, "workspace-write"); return handle.agent;
    };
    const pre = await create("standard", "dsmm-planner"), readonly = await create("dsmm-planner", "standard"), unknown = await create("dsmm-unknown", "standard");
    const core = await mountPermissionHostCore(ctx, DsmmPlugin);
    const host = ctx.dsmmNativeAdmission, profiles = ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const lifetime = new AbortController(); core.ctx.effect(() => () => lifetime.abort());
    const authority = createCorePermissionAuthority(core.ctx, { getSettings: profiles.getSettings, rolePolicy: host.policy, signal: lifetime.signal });
    const invoke = async (root: Agent, method: string, request?: unknown) => parsePermissionRulesResult(await ctx.typertGateway.invoke({
      namespace: "dsmmPermissions", method, peer: ctx.connection.browserPeer,
      args: { sessionId: root.id, ...request === undefined ? {} : { request } } }));
    const describe = (root = pre) => invoke(root, "describeRules");
    const save = (root: Agent, expectedRevision: string) => invoke(root, "saveRules", { expectedRevision, changes: { outsideReads: "deny" } });
    const deployment = ctx.dsmmDeploymentConfig;
    return { ctx, core, host, profiles, pre, readonly, unknown, authority, create, describe, save, deployment,
      async dispose() { for (const handle of handles.reverse()) await handle.dispose(); await ctx.fiber.dispose();
        const exact = await realpath(directory); assert.equal(dirname(exact), parent); await rm(exact, { recursive: true }); } };
  } catch (error) {
    for (const handle of handles.reverse()) await handle.dispose(); await ctx.fiber.dispose();
    const exact = await realpath(directory); assert.equal(dirname(exact), parent); await rm(exact, { recursive: true }); throw error;
  }
}

test("pre-Core native root reads, saves and reads global rules without acquiring an admission; post-Core retains its capture", async () => {
  const f = await fixture();
  try {
    const assertNative = () => { assert.equal(f.host.owns(f.pre), false); assert.equal(f.profiles.hasAdmission(f.pre as DshAgent), false); };
    assertNative();
    assert.equal(f.ctx.agentPresets.composedPreset(f.pre.ctx), "standard");
    assert.equal(f.pre.session.header.agentPreset, "dsmm-planner");
    const before = await f.describe(); assertNative();
    const saved = await f.save(f.pre, before.snapshot.revision); assertNative();
    assert.notEqual(saved.snapshot.revision, before.snapshot.revision); assert.equal(saved.snapshot.policy.outsideReads, "deny");
    assert.deepEqual((await f.describe()).snapshot, saved.snapshot); assertNative();
    assert.equal((await f.deployment.readGlobal()).config.permissionControl?.outsideReads, "deny");
    const source = f.deployment.store.read();
    await assert.rejects(f.save(f.pre, before.snapshot.revision));
    assert.deepEqual(f.deployment.store.read(), source); assertNative();
    const post = await f.create();
    assert.equal(f.host.owns(post), true); assert.equal(f.profiles.hasAdmission(post as DshAgent), true);
    const admission = f.profiles.admission(post as DshAgent);
    const current = await f.describe(post), resaved = await f.save(post, current.snapshot.revision);
    assert.deepEqual((await f.describe(post)).snapshot, resaved.snapshot);
    assert.equal(f.profiles.admission(post as DshAgent), admission);
  } finally { await f.dispose(); }
});

test("unadmitted current DSMM compositions and native readonly sandbox cannot change global rules", async () => {
  const f = await fixture();
  try {
    const before = f.deployment.store.read(), revision = f.deployment.permissionSource().revision;
    for (const root of [f.readonly, f.unknown]) {
      assert.equal(f.host.owns(root), false); assert.equal(f.profiles.hasAdmission(root as DshAgent), false);
      assert.ok(f.ctx.agentPresets.composedPreset(root.ctx)?.startsWith("dsmm-"));
      assert.equal(root.session.header.agentPreset, "standard");
      assert.throws(() => f.authority.assertWritable(root), { code: "denied" });
      await assert.rejects(f.describe(root)); await assert.rejects(f.save(root, revision));
      assert.deepEqual(f.deployment.store.read(), before);
    }
    setSandboxMode(f.pre.session, "read-only");
    assert.throws(() => f.authority.assertWritable(f.pre), { code: "denied" });
    await assert.rejects(f.save(f.pre, revision)); assert.deepEqual(f.deployment.store.read(), before);
  } finally { await f.dispose(); }
});

test("root identity, realm and current Core owner remain mandatory for native RPC writes", async () => {
  const f = await fixture();
  try {
    const source = f.deployment.store.read(), revision = f.deployment.permissionSource().revision;
    const child = await f.create("standard", "standard", f.pre);
    await assert.rejects(f.save(child, revision));
    assert.throws(() => f.authority.assertWritable({ ...f.pre } as Agent), { code: "not-owned" });
    const rootContext = f.pre.ctx;
    const foreign = rootContext.isolate("agents");
    Reflect.set(f.pre, "ctx", foreign);
    try {
      assert.throws(() => f.authority.assertWritable(f.pre), { code: "not-owned" });
      await assert.rejects(f.save(f.pre, revision));
    } finally { Reflect.set(f.pre, "ctx", rootContext); }
    const wrongOwner = rootContext.isolate("dsmmCoreLlmOwner");
    wrongOwner.provide("dsmmCoreLlmOwner", { async admit() { return undefined; } });
    Reflect.set(f.pre, "ctx", wrongOwner);
    try {
      assert.throws(() => f.authority.assertWritable(f.pre), { code: "unavailable" });
      await assert.rejects(f.save(f.pre, revision));
    } finally { Reflect.set(f.pre, "ctx", rootContext); }
    assert.deepEqual(f.deployment.store.read(), source);
  } finally { await f.dispose(); }
});

test("captured roots retain readonly identity ceilings and a retired capture cannot become native", async t => {
  const f = await fixture();
  try {
    const root = await f.create(), revision = f.deployment.permissionSource().revision, source = f.deployment.store.read();
    const identity = f.host.policy.identity(root as DshAgent);
    for (const ceiling of [{ role: "dsmm-doc-search" as const }, { readOnly: true }]) {
      const mocked = t.mock.method(f.host.policy, "identity", () => ({ ...identity, ...ceiling }));
      try { assert.throws(() => f.authority.assertWritable(root), { code: "denied" }); await assert.rejects(f.save(root, revision)); }
      finally { mocked.mock.restore(); }
    }
    f.host.lifetime.abort();
    assert.equal(f.host.owns(root), true);
    assert.throws(() => f.host.assert(root));
    assert.throws(() => f.authority.assertWritable(root)); await assert.rejects(f.save(root, revision));
    assert.deepEqual(f.deployment.store.read(), source);
  } finally { await f.dispose(); }
});

test("profile-admitted roots without a host capture still enforce module, epoch, lineage and readonly ceilings", async t => {
  const f = await fixture();
  try {
    const root = await f.create(), source = f.deployment.store.read(), revision = f.deployment.permissionSource().revision;
    const identity = f.host.policy.identity(root as DshAgent);
    const owns = t.mock.method(f.host, "owns", () => false);
    try {
      assert.equal(f.profiles.hasAdmission(root as DshAgent), true);
      f.authority.assertWritable(root);
      const module = t.mock.method(f.host.policy, "assertModuleAdmission", () => { throw new PermissionRefusal("denied"); });
      try { assert.throws(() => f.authority.assertWritable(root), { code: "denied" }); await assert.rejects(f.save(root, revision)); }
      finally { module.mock.restore(); }
      for (const ceiling of [{ epoch: "stale-epoch" }, { child: true }, { parent: f.pre as DshAgent }, { readOnly: true }]) {
        const mocked = t.mock.method(f.host.policy, "identity", () => ({ ...identity, ...ceiling }));
        try { assert.throws(() => f.authority.assertWritable(root), PermissionRefusal); await assert.rejects(f.save(root, revision)); }
        finally { mocked.mock.restore(); }
      }
      const admission = f.profiles.admission(root as DshAgent);
      const originalAdmission = f.profiles.getSettings.admission;
      f.profiles.getSettings.admission = () => ({ ...admission });
      try { assert.throws(() => f.authority.assertWritable(root), { code: "stale" }); }
      finally { f.profiles.getSettings.admission = originalAdmission; }
      assert.deepEqual(f.deployment.store.read(), source);
    } finally { owns.mock.restore(); }
  } finally { await f.dispose(); }
});
