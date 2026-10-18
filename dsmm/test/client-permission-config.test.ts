import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import type { ConfigForm, ConfigForms } from "@deepseek-ai/dsh-client-ui-settings/client";
import { build } from "esbuild";
import { cloneElement, createElement, isValidElement } from "react";
import type { ReactElement } from "react";
import type { DeploymentController as Controller } from "../src/client/deployment-controller.ts";
import type { Field as DeploymentField } from "../src/client/DeploymentFields.js";
import type { NativeRuntimeState as RuntimeState } from "../src/client/DeploymentPage.js";
import type { PermissionsPanelProps } from "../src/client/PermissionsPanel.js";
import type { DsmmConfigRemote } from "../src/profile-remote.ts";
import type { DeploymentEditorSnapshot } from "../src/profile-types.ts";
import { PermissionController } from "../src/client/permission-controller.ts";
import { DeploymentWorkspace } from "../src/client/deployment-workspace.ts";
import { PermissionClientError } from "../src/client/permission-client.ts";
import type { PermissionInvoker, PermissionValue } from "../src/client/permission-client.ts";
import { deploymentEn } from "../src/client/deployment-locales.ts";
import { scopeSchema } from "../src/client/deployment-data.ts";
import { permissionEn } from "../src/client/permission-locales.ts";
import { installDeploymentPermissionRules } from "../src/deployment-permission-rules.ts";
import { PermissionRefusal } from "../src/permission-errors.ts";
import { deploymentEditorSchema, resolveConfig } from "../src/settings.ts";
import { runtimeAdmissionView } from "../src/runtime-integration.ts";
import { DEFAULT_PERMISSION_CONTROL } from "../src/permission-settings.ts";
import { nativeConfigRun } from "./permission-deployment-fixture.ts";
import { useIsolatedDshEnvironment } from "./dsh-test-environment.ts";

useIsolatedDshEnvironment();
const sourceRoot = fileURLToPath(new URL("..", import.meta.url));
const bundle = await build({ absWorkingDir: sourceRoot, stdin: { resolveDir: sourceRoot, contents: `
  export { Field } from './src/client/DeploymentFields.tsx';
  export { NativeRuntimeState } from './src/client/DeploymentPage.tsx';
  export { DeploymentController } from './src/client/deployment-controller.ts';
  export { PermissionsPanel } from './src/client/PermissionsPanel.tsx';
  export { emptyNativeEntry } from './src/client/NativeCommandEntries.tsx';
` }, bundle: true, write: false, format: "cjs", platform: "node", target: "es2022", external: ["react", "react/jsx-runtime", "@deepseek-ai/dsh-client-ui-primitives", "jsonc-parser"] });
const require = createRequire(import.meta.url), module = { exports: {} as {
  Field: typeof DeploymentField; NativeRuntimeState: typeof RuntimeState; DeploymentController: typeof Controller;
  PermissionsPanel(props: PermissionsPanelProps): unknown;
  emptyNativeEntry(): import("../src/permission-settings.ts").NativeCommandEntry;
} };
// Production component handlers with native durable forms; this seam is not rendered browser QA.
runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)((id: string) => {
  if (id === "react") return { ...require(id), useEffect() {}, useMemo: (fn: () => unknown) => fn(), useId: () => "permission-fixture", useState: (value: unknown) => [value, () => {}], useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get() };
  if (id === "@deepseek-ai/dsh-client-ui-primitives") return { Button: (props: Record<string, unknown>) => createElement("button", props), Input: (props: Record<string, unknown>) => createElement("input", props) };
  return require(id);
}, module, module.exports);
const { Field, NativeRuntimeState, DeploymentController, PermissionsPanel, emptyNativeEntry } = module.exports;
type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return isValidElement<Record<string, unknown>>(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
function render(tree: unknown): unknown {
  if (Array.isArray(tree)) return tree.map(render);
  if (!isValidElement<Record<string, unknown>>(tree)) return tree;
  if (typeof tree.type === "function") return render((tree.type as (props: unknown) => unknown)(tree.props));
  return cloneElement(tree, { children: render(tree.props.children) });
}
function text(tree: unknown): string {
  return Array.isArray(tree) ? tree.map(text).join("") : isValidElement<Record<string, unknown>>(tree) ? text(tree.props.children) : typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
}
function event(node: Node, value: string) { assert.equal(node.props.disabled, false); (node.props.onChange as (event: unknown) => void)({ currentTarget: { value } }); }
function click(node: Node) { assert.equal(node.props.disabled, false); (node.props.onClick as () => void)(); }
function field(tree: unknown, path: string): Node {
  const group = nodes(tree).find(node => node.props["data-field"] === path);
  assert.ok(group, path); return nodes(group).find(node => node.type === "select")!;
}
function details(tree: unknown, path: string): Node {
  const group = nodes(tree).find(node => node.props["data-field"] === path);
  assert.ok(group, path); return group;
}
async function fixture() {
  const run = nativeConfigRun(), profile = await run.createProfile("permission-ui");
  const backend = installDeploymentPermissionRules(profile.ctx, { deployment: profile.deployment, assertWritable() {}, revoke() {}, async notify() {} });
  const root = await profile.create(), lifetime = new AbortController();
  const authority = { root, peer: {}, signal: lifetime.signal, assertCurrent() { lifetime.signal.throwIfAborted(); assert.equal(profile.ctx.agents.get(root.id), root); } };
  const startup = resolveConfig(), writes: unknown[] = [], mutations: unknown[] = [];
  const describe = async (): Promise<DeploymentEditorSnapshot> => {
    const value = await profile.deployment.readDesired();
    return { entryId: value.entryId, namespace: value.nativeNamespace ?? null, hostProfileKey: value.hostProfileKey,
      global: value.global as Record<string, unknown>, globalRevision: value.globalRevision, profile: { ...value.profile }, nativeRevision: value.nativeRevision,
      nativeFormRevision: value.nativeFormRevision ?? null, nativeForm: { base: value.nativeForm?.base ?? null, user: value.nativeForm?.user ?? null },
      desired: { ...value.settings }, sources: value.sources, defaults: { ...resolveConfig() }, startup: { ...startup }, schema: deploymentEditorSchema(), nativeSchema: deploymentEditorSchema(true), subagentRuntime: runtimeAdmissionView(profile.ctx), nextRoot: null, modules: [] };
  };
  const remote: DsmmConfigRemote = { describe: async () => ({ ok: true, value: await profile.deployment.readGlobal() }), describeSettings: async () => ({ ok: true, value: await describe() }), describeModules: async () => ({ ok: true, value: [] }),
    save: async request => { writes.push(request); return { ok: true, value: await profile.deployment.saveGlobal(request, () => {}) }; } };
  const global = new DeploymentController(remote, "global"), native = new DeploymentController(remote, "profile", profile.descriptor().ns);
  const attach = async (writable = true, mutate?: ConfigForm<Record<string, unknown>>["mutate"]) => {
    const value = await describe();
    native.attachForm({ state: { status: "ready", writable, revision: value.nativeFormRevision!, value: value.profile, base: value.nativeForm!.base, user: value.nativeForm!.user },
      mutate: mutate ?? (async (edits, revision) => { mutations.push({ edits, revision }); await profile.settings.mutate(profile.descriptor().ns, [...edits], revision!); await attach(); return true; }) });
  };
  await attach(); await global.refresh(); await native.refresh();
  const deploymentCopy: Readonly<Record<string, string>> = deploymentEn;
  const page = (controller: Controller, key = "permissionControl") => render(createElement(Field, { schema: scopeSchema(controller.getSnapshot().snapshot!, controller.layer).fields![key], path: [key], controller, t: key => deploymentCopy[key] ?? key }));
  return { run, profile, backend, root, authority, global, native, remote, writes, mutations, attach, page,
    async cleanup() { lifetime.abort(); global.dispose(); native.dispose(); await run.dispose(); } };
}

test("permission config form edits, saves, rereads and Unsets both durable layers without broadening exact matches", async () => {
  const f = await fixture();
  const rules = [{ id: "web-deny", action: "deny", match: { kind: "webFetch" }, source: { kind: "user-import", label: "fixture" }, revision: 0, revoked: false }];
  const entriesPath = "permissionControl.nativeCommands.entries";
  try {
    for (const c of [f.global, f.native]) {
      if (c === f.native) { await f.attach(); await c.refresh(true); }
      for (const [path, value] of [["enabled", "false"], ["outsideReads", '"ask"'], ["webSearch.enabled", "false"], ["webSearch.rule", '"ask"'], ["webFetch.enabled", "false"], ["webFetch.rule", '"deny"'], ["nativeCommands.enabled", "true"]]) event(field(f.page(c), `permissionControl.${path}`), value);
      const entries = () => details(f.page(c), entriesPath);
      if (c === f.native) {
        // Clear inherited rows explicitly before constructing this layer's replacement.
        const remove = nodes(entries()).find(node => node.type === "button" && text(node).replace(/\s+/gu, " ").trim() === `${permissionEn.removeEntry} 1`);
        assert.ok(remove); click(remove);
      }
      click(nodes(entries()).find(node => node.type === "button" && text(node) === permissionEn.addEntry)!);
      const input = (key: string) => nodes(entries()).find(node => node.type === "input" && String(node.props.id).endsWith(`-${key}`))!;
      event(input("id"), "exact-go-test"); event(input("executable"), "go"); event(input("subcommand"), "test"); event(input("workingDirectory"), f.run.root);
      event(nodes(entries()).find(node => node.type === "select" && String(node.props.id).endsWith("-tool"))!, "pwsh");
      event(nodes(entries()).find(node => node.type === "textarea")!, '["./pkg","-count=1"]');
      event(nodes(details(f.page(c), "permissionControl.rules")).find(node => node.type === "textarea")!, JSON.stringify(rules));
      await c.save(); assert.deepEqual({ layer: c.layer, saved: c.getSnapshot().saved, issue: c.getSnapshot().issue }, { layer: c.layer, saved: true, issue: null });
      const stored = c === f.global ? (await f.profile.deployment.readGlobal()).config : f.profile.persistedConfig();
      assert.deepEqual(stored.permissionControl?.nativeCommands, { enabled: true, entries: [{ id: "exact-go-test", mode: "ask", sandboxMode: "workspace-write", match: { tool: "pwsh", executable: "go", subcommand: "test", args: ["./pkg", "-count=1"], workingDirectory: f.run.root } }] });
      assert.equal(stored.permissionControl?.rules?.[0].source.kind, "user-import");
      assert.equal(f.backend.runtime.status().mounted, true); assert.equal(f.backend.runtime.status().restartRequired, true);
      assert.equal(f.backend.runtime.status().state, "synced");
      await c.refresh(true); assert.deepEqual(c.getSnapshot().draft.permissionControl, stored.permissionControl);
      if (c === f.native) {
        assert.equal(f.writes.length, 1); assert.equal(f.mutations.length, 1);
        assert.equal((f.mutations[0] as { revision: number }).revision, 0);
      }
    }
    // Native Unset restores Global, including the command array, not default-filled pins.
    for (const c of [f.native, f.global]) {
      for (const path of ["enabled", "outsideReads", "webSearch.enabled", "webSearch.rule", "webFetch.enabled", "webFetch.rule", "nativeCommands.enabled"]) event(field(f.page(c), `permissionControl.${path}`), "inherit");
      for (const path of ["permissionControl.rules", entriesPath]) click(nodes(details(f.page(c), path)).find(node => node.type === "button" && node.props["data-dsmm-unset"] === path)!);
      await c.save(); assert.equal(c.getSnapshot().saved, true); await c.refresh(true);
      const desired = await f.profile.deployment.readDesired();
      if (c === f.native) assert.deepEqual(desired.settings.permissionControl, resolveConfig({ permissionControl: (await f.profile.deployment.readGlobal()).config.permissionControl }).permissionControl);
      else assert.deepEqual(desired.settings.permissionControl, DEFAULT_PERMISSION_CONTROL);
      f.profile.assertLive();
    }
  } finally { await f.cleanup(); }
});

test("exact command invalid drafts lock Save; correcting optional subcommand and args preserves exact bytes", async () => {
  const f = await fixture();
  try {
    const c = f.global, entry = emptyNativeEntry();
    assert.equal(entry.mode, "ask"); assert.equal(entry.sandboxMode, "workspace-write");
    const path = "permissionControl.nativeCommands.entries", group = () => details(f.page(c), path);
    click(nodes(group()).find(node => node.type === "button" && text(node) === permissionEn.addEntry)!);
    await c.save(); assert.equal(f.writes.length, 0);
    const input = (key: string) => nodes(group()).find(node => node.type === "input" && String(node.props.id).endsWith(`-${key}`))!;
    event(input("id"), "exact"); event(input("executable"), "go"); event(input("workingDirectory"), f.run.root);
    event(input("subcommand"), "test"); event(input("subcommand"), "");
    event(nodes(group()).find(node => node.type === "textarea")!, '["./two words", "--flag=value"]');
    event(nodes(group()).find(node => node.type === "textarea")!, '["unterminated"');
    await c.save(); assert.equal(f.writes.length, 0);
    event(nodes(group()).find(node => node.type === "textarea")!, '["./two words", "--flag=value"]');
    await c.save(); assert.equal(c.getSnapshot().saved, true);
    assert.deepEqual((await f.profile.deployment.readGlobal()).config.permissionControl?.nativeCommands?.entries?.[0].match,
      { tool: "bash", executable: "go", args: ["./two words", "--flag=value"], workingDirectory: f.run.root });
  } finally { await f.cleanup(); }
});

test("profile dynamic override refuses Root rules Save without a Global fallback, and native Unset restores inheritance", async () => {
  const f = await fixture(), c = new PermissionController();
  try {
    event(field(f.page(f.native), "permissionControl.outsideReads"), '"deny"'); await f.native.save();
    const invoke: PermissionInvoker = async (method, args) => {
      try { return (method === "describeRules" ? { snapshot: await f.backend.read(f.authority), runtime: f.backend.runtime.status() } : await f.backend.save(args[1]!, f.authority)) as PermissionValue<typeof method>; }
      catch (error) { throw new PermissionClientError(error instanceof PermissionRefusal ? error.code : "unavailable"); }
    };
    c.bindConnection(invoke, {}); c.bindScope(f.root.id, f.root, "root");
    let generation = c.store.getSnapshot().generation; await c.refresh(generation);
    c.edit(generation, { outsideReads: "ask" }); await c.save(generation);
    assert.equal(c.store.getSnapshot().rulesIssue, "unavailable"); assert.equal(c.store.getSnapshot().dirty, true);
    assert.equal(c.canEdit(generation), false); assert.equal(f.writes.length, 0);
    assert.deepEqual((await f.profile.deployment.readGlobal()).config, {});
    event(field(f.page(f.native), "permissionControl.outsideReads"), "inherit"); await f.native.save();
    await c.refresh(generation, true); assert.equal(c.store.getSnapshot().draft?.outsideReads, "inherit");
    c.edit(generation, { outsideReads: "ask" }); await c.save(generation); assert.equal(c.store.getSnapshot().notice, "saved");
    c.bindConnection(null); generation = c.store.getSnapshot().generation;
    c.edit(generation, { outsideReads: "deny" }); assert.equal(c.store.getSnapshot().draft?.outsideReads, "ask");
    const permissionCopy: Readonly<Record<string, string>> = permissionEn;
    const tree = render(PermissionsPanel({ controller: c, t: key => permissionCopy[key] ?? key }));
    assert.ok(nodes(tree).filter(node => node.type === "select").every(node => node.props.disabled === true));
    const child = await f.profile.create(f.root); c.bindScope(child.id, child, "child");
    assert.equal(c.canEdit(c.store.getSnapshot().generation), false);
  } finally { c.dispose(); await f.cleanup(); }
});

test("native empty policy groups can be explicitly Unset through the form to restore Root Global-rule ownership", async () => {
  const f = await fixture();
  try {
    await f.profile.settings.mutate(f.profile.descriptor().ns, [{ op: "set", path: ["permissionControl", "webFetch"], value: {} }], f.profile.descriptor().revision);
    await f.attach(); await f.native.refresh(true);
    const before = await f.backend.read(f.authority);
    await assert.rejects(f.backend.save({ expectedRevision: before.revision, changes: { outsideReads: "ask" } }, f.authority), error => error instanceof PermissionRefusal && error.code === "unavailable");
    const unset = nodes(details(f.page(f.native), "permissionControl.webFetch")).find(node => node.props["data-dsmm-unset"] === "permissionControl.webFetch");
    assert.ok(unset); click(unset); await f.native.save(); assert.equal(f.native.getSnapshot().saved, true); assert.equal(f.writes.length, 0);
    const inherited = await f.backend.read(f.authority);
    const saved = await f.backend.save({ expectedRevision: inherited.revision, changes: { outsideReads: "ask" } }, f.authority);
    assert.equal(saved.snapshot.policy.outsideReads, "ask"); assert.equal(saved.runtime.state, "synced");
  } finally { await f.cleanup(); }
});

test("native readonly and detached forms retain visible config but cannot edit or call mutate", async () => {
  const f = await fixture();
  try {
    await f.attach(false);
    const tree = f.page(f.native);
    assert.equal(field(tree, "permissionControl.outsideReads").props.disabled, true);
    f.native.edit(["permissionControl", "outsideReads"], "deny"); await f.native.save();
    assert.equal(f.mutations.length, 0); assert.equal(f.writes.length, 0);
    f.native.attachForm(null); assert.equal(f.native.canWriteProfile(), false);
  } finally { await f.cleanup(); }
});

test("module and scope transitions retain invalid raw drafts and save only the selected native transaction", async () => {
  const f = await fixture(), workspace = new DeploymentWorkspace(f.global);
  try {
    const readForm = async () => {
      const result = await f.remote.describeSettings(); assert.equal(result.ok, true); if (!result.ok) throw new Error("Fixture unavailable"); const v = result.value;
      return { status: "ready" as const, writable: true, revision: v.nativeFormRevision!, value: v.profile, base: v.nativeForm!.base, user: v.nativeForm!.user };
    };
    let formState = await readForm(); const listeners = new Set<() => void>();
    const form = { getSnapshot: () => formState, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      async mutate(edits: Parameters<ConfigForm<Record<string, unknown>>["mutate"]>[0], revision?: number) {
        await f.profile.settings.mutate(f.profile.descriptor().ns, [...edits], revision!); formState = await readForm(); for (const listener of listeners) listener(); return true;
      } };
    workspace.bindForms({ get(namespace: string) { assert.equal(namespace, f.profile.descriptor().ns); return form; } } as unknown as ConfigForms);
    const native = workspace.controller("profile")!;
    for (let round = 0; round < 100 && (native.getSnapshot().busy || native.getSnapshot().snapshot === null); round++) await setImmediate();
    assert.equal(native.canWriteProfile(), true);
    workspace.request({ scope: "global", module: "permissions" });
    event(nodes(details(f.page(f.global), "permissionControl.rules")).find(node => node.type === "textarea")!, "{unfinished");
    workspace.request({ scope: "global", module: null }); assert.notEqual(workspace.getSnapshot().pending, null); workspace.continueEditing();
    workspace.request({ scope: "global", module: null }); workspace.keepAndNavigate();
    workspace.request({ scope: "global", module: "workflow" }); assert.equal(workspace.getSnapshot().pending, null);
    const numeric = nodes(f.page(f.global, "workflow")).find(node => node.props["data-field"] === "workflow.reviewCap")!;
    event(nodes(numeric).find(node => node.type === "input")!, "not-a-number");
    const raw = structuredClone(f.global.getSnapshot().raw);
    workspace.request({ scope: "profile", module: "permissions" }); workspace.keepAndNavigate();
    for (let round = 0; round < 100 && native.getSnapshot().busy; round++) await setImmediate();
    event(field(f.page(native), "permissionControl.outsideReads"), '"deny"'); await workspace.save();
    assert.equal(native.getSnapshot().saved, true); assert.equal((await f.profile.deployment.readDesired()).profile.permissionControl?.outsideReads, "deny");
    assert.equal(f.writes.length, 0); assert.deepEqual(f.global.getSnapshot().raw, raw); assert.equal(f.global.canSave(), false);
    workspace.request({ scope: "global", module: "permissions" });
    for (let round = 0; round < 100 && f.global.getSnapshot().busy; round++) await setImmediate();
    assert.deepEqual(f.global.getSnapshot().raw, raw);
    assert.equal(nodes(details(f.page(f.global), "permissionControl.rules")).find(node => node.type === "textarea")!.props.value, "{unfinished");
    await workspace.save(); assert.equal(f.writes.length, 0);
    workspace.request({ scope: "global", module: null }); await workspace.discardAndNavigate();
    assert.equal(workspace.getSnapshot().module, null); assert.deepEqual(f.global.getSnapshot().raw, {}); assert.equal(f.global.getSnapshot().dirty, false);
    assert.equal((await f.profile.deployment.readDesired()).profile.permissionControl?.outsideReads, "deny");
  } finally { workspace.dispose(); await f.cleanup(); }
});

test("accepted Global mutation requiring refresh stays saved and never replays an unavailable version", async () => {
  const f = await fixture();
  try {
    const save = f.remote.save;
    f.remote.save = async request => { const accepted = await save(request); assert.equal(accepted.ok, true); if (!accepted.ok) return accepted; return { ok: true, value: { ...accepted.value, revision: "unavailable", refreshRequired: true } }; };
    f.global.edit(["defaultActive"], true); await f.global.save();
    assert.deepEqual({ saved: f.global.getSnapshot().saved, dirty: f.global.getSnapshot().dirty, refreshRequired: f.global.getSnapshot().refreshRequired, issue: f.global.getSnapshot().issue }, { saved: true, dirty: false, refreshRequired: true, issue: null });
    f.global.edit(["defaultActive"], false); await f.global.save(); assert.equal(f.writes.length, 1);
    assert.equal((await f.profile.deployment.readGlobal()).config.defaultActive, true);
    assert.notEqual((f.writes[0] as { expectedRevision: string }).expectedRevision, "unavailable");
    await f.global.refresh(); assert.equal(f.global.getSnapshot().refreshRequired, false); assert.equal(f.global.canEdit(), true);
  } finally { await f.cleanup(); }
});

test("unconfirmed native form result retains the draft and prevents replay until authoritative reread", async () => {
  const f = await fixture(); let mutations = 0;
  try {
    await f.attach(true, async (edits, revision) => {
      mutations++; await f.profile.settings.mutate(f.profile.descriptor().ns, [...edits], revision!); return false;
    });
    f.native.edit(["defaultActive"], true); await f.native.save();
    assert.equal((await f.profile.deployment.readDesired()).profile.defaultActive, true);
    assert.equal(f.native.getSnapshot().issue, "unconfirmed"); assert.equal(f.native.getSnapshot().dirty, true); assert.equal(f.native.getSnapshot().saved, false);
    assert.equal(f.native.canSave(), false); await f.native.save(); assert.equal(mutations, 1); assert.equal(f.writes.length, 0);
    await f.native.refresh(); assert.equal(f.native.getSnapshot().dirty, true); assert.equal(f.native.canSave(), false);
    await f.attach(); await f.native.refresh(true); assert.equal(f.native.getSnapshot().dirty, false); assert.equal(f.native.canEdit(), true); assert.equal(mutations, 1);
  } finally { await f.cleanup(); }
});

test("native runtime projection preserves execution readiness and unknown observations", () => {
  const copy: Readonly<Record<string, string>> = deploymentEn;
  const t = (key: string) => copy[key] ?? key;
  const paragraphs = (value: Parameters<typeof NativeRuntimeState>[0]["value"]) => nodes(render(createElement(NativeRuntimeState, { value, t }))).filter(node => node.type === "p").map(node => text(node).replace(/\s+/gu, " ").trim());
  const observed = paragraphs({ binding: "stock", deliveryFenceReady: true, restartRequired: false });
  assert.ok(observed.includes(`${t("nativeRuntimeBinding")}: ${t("nativeRuntimeStock")}`));
  assert.ok(observed.includes(`${t("nativeRuntimeFence")}: ${t("on")} · ${t("nativeRuntimeRestart")}: ${t("off")}`));
  const unknown = paragraphs(undefined);
  assert.ok(unknown.includes(`${t("nativeRuntimeBinding")}: ${t("unknown")}`));
  assert.ok(unknown.includes(`${t("nativeRuntimeFence")}: ${t("unknown")} · ${t("nativeRuntimeRestart")}: ${t("unknown")}`));
});
