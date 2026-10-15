import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, Script } from "node:vm";
import { build } from "esbuild";
import { remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import { deferred, permissionFixture } from "./permission-fixture.ts";
import { PermissionController, permissionChanges } from "../src/client/permission-controller.ts";
import { PermissionClientError } from "../src/client/permission-client.ts";
import type { PermissionInvoker, PermissionValue } from "../src/client/permission-client.ts";
import { DsmmDeploymentConfig } from "../src/deployment-config.ts";
import { installDeploymentPermissionRules } from "../src/deployment-permission-rules.ts";
import type { DeploymentPermissionRules } from "../src/deployment-permission-rules.ts";
import type { PermissionRuleSnapshot } from "../src/permission-rules.ts";
import type { DshContext } from "../src/dsh-types.ts";
import { parsePermissionRulesResult } from "../src/permission-remote.ts";
import { resolvePermissionControl } from "../src/permission-settings.ts";
import { useIsolatedDshEnvironment } from "./dsh-test-environment.ts";
useIsolatedDshEnvironment();
async function fixture() {
  const temporary = await realpath(tmpdir()), owned = await realpath(await mkdtemp(join(temporary, "dsmm-permission-client-")));
  let backend!: DeploymentPermissionRules, writable = true, notify = async (_snapshot: PermissionRuleSnapshot): Promise<void> => {};
  const f = await permissionFixture(2000, { rules(permissions, ctx) {
    ctx.provide("profileContext", { home: owned, dir: owned }); ctx.provide("settings", { writable: true }); ctx.provide("webServer", { host: "127.0.0.1" });
    backend = installDeploymentPermissionRules(ctx, { deployment: new DsmmDeploymentConfig(ctx as unknown as DshContext, {}), assertWritable(root) { assert.equal(ctx.agents.get(root.id), root); if (!writable) throw new Error("Owned readonly"); }, revoke: () => permissions.revokePolicy(), notify: value => notify(value) });
    return { backend, runtime: backend.runtime };
  } });
  const calls: Array<{ method: string; args: readonly unknown[] }> = [];
  const invoke: PermissionInvoker = async (method, args, signal) => {
    calls.push({ method, args });
    try { return await f.invoke(method, { sessionId: args[0], ...args.length > 1 ? { request: args[1] } : {} }, undefined, signal) as PermissionValue<typeof method>; }
    catch (error) { const failure = remoteErrorOf(error); throw new PermissionClientError(failure?.code === "dsmm-permissions/refused" ? failure.details.code as PermissionClientError["code"] : "unavailable"); }
  };
  const controller = new PermissionController(); controller.bindConnection(invoke, {}); controller.bindScope(f.root.id, f.root, "root");
  const refresh = (discard = false) => controller.refresh(controller.store.getSnapshot().generation, discard); await refresh();
  return { ...f, backend, controller, calls, refresh, readonly(value: boolean) { writable = !value; }, notify(value: typeof notify) { notify = value; },
    async cleanup() { controller.dispose(); await f.dispose(); assert.equal(await realpath(owned), owned); assert.equal(dirname(owned), temporary); assert.ok(basename(owned).startsWith("dsmm-permission-client-")); await rm(owned, { recursive: true, force: false }); } };
}
test("rules editor persists explicit changes through strict Root RPC and keeps draft/source CAS", async () => {
  const f = await fixture(), c = f.controller;
  try {
    const view = c.store.getSnapshot(); c.edit(view.generation, { outsideReads: "ask", editor: { id: "native-web", action: "deny", match: { kind: "webFetch" } } }); c.stageRule(view.generation);
    const request = permissionChanges(c.store.getSnapshot()); assert.ok(request); assert.equal(c.canSave(view.generation), true);
    await c.save(view.generation);
    const saved = c.store.getSnapshot(); assert.equal(saved.dirty, false); assert.equal(saved.notice, "saved"); assert.equal(saved.rules!.snapshot.policy.outsideReads, "ask");
    assert.equal(saved.rules!.snapshot.policy.rules[0].source.kind, "operator"); assert.deepEqual(f.calls.find(value => value.method === "saveRules")!.args, [f.root.id, request]);
    const result = parsePermissionRulesResult(saved.rules); assert.deepEqual(result.snapshot.policy.nativeCommands, { enabled: false, entries: [] });
    c.edit(view.generation, { outsideReads: "deny" });
    await f.backend.save({ expectedRevision: saved.base!.revision, changes: { outsideReads: "allow" } }, { root: f.root, peer: {}, signal: f.lifetime.signal, assertCurrent() {} });
    await f.refresh(); assert.equal(c.store.getSnapshot().rulesIssue, "stale"); assert.equal(c.store.getSnapshot().draft!.outsideReads, "deny");
    await f.refresh(true); assert.equal(c.store.getSnapshot().draft!.outsideReads, "allow"); assert.equal(c.store.getSnapshot().dirty, false);
  } finally { await f.cleanup(); }
});
test("child, disconnected, readonly and failed notification preserve drafts without saving under stale authority", async () => {
  const f = await fixture(), c = f.controller;
  try {
    const generation = c.store.getSnapshot().generation; c.edit(generation, { outsideReads: "deny" });
    c.bindConnection(null); assert.equal(c.canSave(c.store.getSnapshot().generation), false); assert.equal(c.store.getSnapshot().draft!.outsideReads, "deny");
    const child = await f.create(f.root); c.bindScope(child.id, child, "child"); assert.equal(c.canSave(c.store.getSnapshot().generation), false);
  } finally { await f.cleanup(); }
  const second = await fixture(), controller = second.controller;
  try {
    const generation = controller.store.getSnapshot().generation; controller.edit(generation, { outsideReads: "ask" }); second.readonly(true);
    await controller.save(generation); assert.equal(controller.store.getSnapshot().dirty, true); assert.equal(controller.store.getSnapshot().draft!.outsideReads, "ask");
    second.readonly(false); await second.refresh(); second.notify(async () => { throw new Error("Owned notification failure"); });
    await controller.save(generation); assert.equal(controller.store.getSnapshot().dirty, true); assert.equal(second.backend.runtime.status().state, "unsynced");
  } finally { await second.cleanup(); }
});
test("late read from a replaced connection cannot publish its policy or rebase a draft", async () => {
  const c = new PermissionController(), owner = {}, held = deferred<never>();
  c.bindConnection(async () => held.promise); c.bindScope("owned-root", owner, "root");
  const before = c.store.getSnapshot().generation, pending = c.refresh(before);
  c.bindConnection(null); held.reject(new PermissionClientError("cancelled")); await pending;
  assert.equal(c.store.getSnapshot().rules, null); assert.equal(c.store.getSnapshot().reading, false); assert.equal(c.canSave(before), false); c.dispose();
});
test("strict client result decoding preserves valid Windows and POSIX Host cwd without browser-side normalization", async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/permission-remote.ts", import.meta.url))], bundle: true, platform: "browser", format: "iife", globalName: "PermissionWire", write: false });
  const browser = createContext({ raw: "" }); new Script(bundle.outputFiles[0].text).runInContext(browser);
  const decode = new Script("PermissionWire.parsePermissionRulesResult(JSON.parse(raw))");
  const result = (workingDirectory: unknown) => ({ snapshot: { revision: "owned-source", policy: { ...resolvePermissionControl(),
    nativeCommands: { enabled: true, entries: [{ id: "host-command", mode: "ask", sandboxMode: "workspace-write",
      match: { tool: "pwsh", executable: "go", subcommand: "test", args: ["."], workingDirectory } }] } } },
    runtime: { savedRevision: "owned-source", runtimeRevision: "owned-source", state: "synced", mounted: true, restartRequired: false } });
  for (const cwd of ["/owned/workspace", "C:\\owned\\workspace", "\\\\server\\share\\workspace"]) {
    browser.raw = JSON.stringify(result(cwd));
    assert.equal(decode.runInContext(browser).snapshot.policy.nativeCommands.entries[0].match.workingDirectory, cwd);
  }
  for (const cwd of [null, {}, "relative", "C:relative", "\\workspace", "\\\\server", "C:/bad\0cwd"]) {
    browser.raw = JSON.stringify(result(cwd)); assert.throws(() => decode.runInContext(browser));
  }
});
