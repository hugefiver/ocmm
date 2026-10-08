import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import { setImmediate } from "node:timers/promises";
import { isValidElement } from "react";
import type { ReactElement } from "react";
import type { Context } from "@deepseek-ai/cordis";
import type { ConnectionGenerationState } from "@deepseek-ai/dsh-client-connection/client";
import type { DsmmConfigRemote } from "../lib/profile-remote.js";
import type { DeploymentAdmissionView, DeploymentEditorSnapshot, SessionProfileSnapshot } from "../lib/profile-types.js";
import type { DeploymentPageProps } from "../lib/client/DeploymentPage.js";
import { deploymentEn } from "../lib/client/deployment-locales.js";
import { deploymentEditorSchema, resolveConfig } from "../lib/settings.js";
import { DeploymentController } from "../lib/client/deployment-controller.js";
import { editLayer, layerDiff, parseAdvanced, validateEditorValue } from "../lib/client/deployment-data.js";

function fixture() {
  const defaults = resolveConfig() as unknown as Record<string, unknown>;
  let snapshot: DeploymentEditorSnapshot = {
    entryId: "include:dsmm", namespace: "dsmm", hostProfileKey: "own-profile",
    global: { workflow: { reviewCap: 3 }, modules: { deepwork: { enabled: false } } }, globalRevision: "g0",
    profile: {}, nativeRevision: "n0", nativeFormRevision: 0, nativeForm: { base: {}, user: {} },
    desired: defaults, sources: {}, startup: defaults, defaults, schema: deploymentEditorSchema(), nextRoot: null, modules: [],
  };
  const writes: unknown[] = [];
  let intercept: (() => Promise<void>) | undefined;
  const remote: DsmmConfigRemote = {
    describe: async () => ({ ok: true, value: { config: snapshot.global, revision: snapshot.globalRevision } }),
    describeModules: async () => ({ ok: true, value: [] }),
    describeSettings: async () => { await intercept?.(); return { ok: true, value: structuredClone(snapshot) }; },
    save: async request => {
      assert.equal(request.expectedRevision, snapshot.globalRevision);
      writes.push(request);
      let global = snapshot.global;
      for (const edit of request.edits) global = editLayer(global, edit.path, edit.op === "set" ? edit.value : undefined);
      snapshot = { ...snapshot, global, globalRevision: "g1" };
      return { ok: true, value: { config: global, revision: "g1" } };
    },
  };
  return { remote, writes, get: () => snapshot, change: (patch: Partial<DeploymentEditorSnapshot>) => { snapshot = { ...snapshot, ...patch }; }, intercept: (callback: () => Promise<void>) => { intercept = callback; } };
}

async function compiledNativePage(remote: DsmmConfigRemote) {
  const require = createRequire(import.meta.url);
  let factory!: (require: (id: string) => unknown) => { apply(ctx: Context): Promise<void> };
  const realm = createContext({ window: { __ModuleLoader__: { load(row: { factory: typeof factory }) { factory = row.factory; } } }, TextEncoder, TextDecoder, structuredClone });
  runInContext(await readFile(new URL("../lib/client.js", import.meta.url), "utf8"), realm);
  const module = factory(id => {
    if (id === "react") return { ...require(id), useEffect() {}, useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get() };
    if (id === "@deepseek-ai/dsh-client-ui-primitives") return { Button() {}, Input() {} };
    assert.equal(id, "react/jsx-runtime"); return require(id);
  });
  let component!: (props: DeploymentPageProps) => unknown, core!: DeploymentController;
  const copy: Readonly<Record<string, string>> = deploymentEn;
  const t: DeploymentPageProps["t"] = key => copy[key] ?? key;
  // A JSX tree seam, not a browser/authentication substitute. Capture the real
  // production slot component and controller; no header or session DOM is forged.
  const context = {
    remote: { $mount() {}, dsmmConfig: remote }, effect() {}, locale: { bind: () => t },
    inject(names: string[], callback: (ctx: unknown) => unknown) { if (names.includes("remote.dsmmConfig")) return callback(this); },
    slots: { inject(_name: string, callback: () => unknown) { callback(); }, register(options: { inject(): { core: DeploymentController } }, view: typeof component) { component = view; core = options.inject().core; } },
  };
  await module.apply(context as unknown as Context);
  for (let round = 0; round < 100 && core.getSnapshot().busy; round++) await setImmediate();
  assert.ok(core.getSnapshot().snapshot, "the real editor read must settle before testing its JSX state");
  const inspector = () => {
    const tree = component({ core, remote, view: "page", t });
    const node = elements(tree).find(node => typeof node.type === "function" && node.type.name === "StateInspector")!;
    assert.ok(node); return (node.type as (props: unknown) => unknown)(node.props);
  };
  return { core, inspector };
}
function elements(tree: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...elements(tree.props.children)];
}
function text(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  return isValidElement<Record<string, unknown>>(tree) ? text(tree.props.children) : typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
}

test("compiled native inspector distinguishes known admission-unavailable and includes sorted named-only next/session fields", async () => {
  const f = fixture(), page = await compiledNativePage(f.remote);
  const session: SessionProfileSnapshot = { sessionId: "known-native-root", admissionEpoch: "epoch-new", scope: "session-override", switchAllowed: true,
    globalDefault: { selectedId: null, appliedRevision: null, selectionRevision: "absent" }, selection: { selectedId: "overlay", appliedRevision: "named-revision", selectionRevision: "named-selection" } };
  try {
    page.core.setSession(session);
    const unavailable = text(page.inspector());
    const configuration: DeploymentAdmissionView = { settings: { defaultActive: false, roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture", model: "overlay-only" } } } },
      sources: { defaultActive: "defaults", "roleRouting.dsmm-reviewer.primary.provider": "named-session", "roleRouting.dsmm-reviewer.primary.model": "named-session" }, captures: { defaultActive: "deployment", "roleRouting.dsmm-reviewer.primary.model": "named-session" }, restartRequired: [], named: { id: "overlay", revision: "named-revision" } };
    f.change({ nextRoot: configuration }); await page.core.refresh(); page.core.setSession({ ...session, configuration });
    const tree = page.inspector(), nodes = elements(tree), rows = nodes.filter(node => node.type === "dl");
    const keys = rows.map(row => text(elements(row).find(node => node.type === "dt")));
    const model = rows.find(row => text(row).includes("roleRouting.dsmm-reviewer.primary.model"));
    assert.ok(model, "named-only field is absent in desired routing but present in admitted/next-root state");
    assert.match(text(model), /overlay-only/u); assert.match(text(model), /Named\/session/u); assert.match(text(model), /Absent/u);
    assert.match(text(model).replace(/\s+/gu, " "), /Startup mounted \/ captured : Absent · Absent \/ Absent/u);
    assert.match(text(tree), /Deployment capture/u);
    assert.deepEqual(keys, [...keys].sort());
    assert.doesNotMatch(unavailable, /No active session/u, "a known root cannot be relabeled sessionless when an older Host omits the projection");
    assert.match(unavailable, /known-native-root|epoch-new/u);
    page.core.setSession(null); assert.match(text(page.inspector()), /No active session/u);
  } finally { page.core.dispose(); }
});

test("Global native editor preserves sparse untouched fields, bytes CAS and saved feedback after field validation settles", async () => {
  const f = fixture(), controller = new DeploymentController(f.remote, "global");
  await controller.refresh(); controller.edit(["workflow", "reviewCap"], 4); await controller.save();
  assert.deepEqual(f.writes, [{ expectedRevision: "g0", edits: [{ op: "set", path: ["workflow", "reviewCap"], value: 4 }] }]);
  assert.deepEqual(f.get().global.modules, { deepwork: { enabled: false } });
  assert.equal(controller.getSnapshot().saved, true);
  controller.setInvalid("workflow.reviewCap", false);
  assert.equal(controller.getSnapshot().saved, true, "a mounted valid field must not erase successful live feedback"); controller.dispose();
});

test("Global conflict and refresh keep the dirty CAS baseline until an explicit discard", async () => {
  const f = fixture(), c = new DeploymentController(f.remote, "global"); await c.refresh(); c.edit(["workflow", "reviewCap"], 4);
  f.change({ globalRevision: "external", global: { workflow: { reviewCap: 2 }, defaultActive: true } });
  await c.save(); await c.refresh();
  assert.equal(c.getSnapshot().issue, "conflict"); assert.equal(c.getSnapshot().dirty, true); assert.equal(c.getSnapshot().snapshot?.globalRevision, "g0");
  assert.deepEqual(c.getSnapshot().draft.workflow, { reviewCap: 4 }); assert.equal(f.writes.length, 0);
  await c.refresh(true); assert.equal(c.getSnapshot().snapshot?.globalRevision, "external"); assert.equal(c.getSnapshot().dirty, false); c.dispose();
});

test("invalid advanced/schema fields refuse writes while preserving the draft", async () => {
  const f = fixture(), c = new DeploymentController(f.remote, "global"); await c.refresh();
  c.setInvalid("roleRouting", true); await c.save(); assert.equal(f.writes.length, 0); assert.equal(c.getSnapshot().dirty, true);
  c.setInvalid("roleRouting", false); c.edit(["unknown"], true); await c.save(); assert.equal(c.getSnapshot().issue, "validation"); assert.equal(c.getSnapshot().draft.unknown, true);
  for (const input of ['{"x":1,"x":2}', '{"x":{"y":1,"y":2}}', '{"x":1,}', '//comment\n{}']) assert.throws(() => parseAdvanced(input));
  assert.deepEqual(parseAdvanced('{"primary":{"provider":"existing","model":"manual"}}'), { primary: { provider: "existing", model: "manual" } });
  assert.equal(validateEditorValue({ modules: { deepwork: { enabled: true } } }, f.get().schema), true);
  assert.equal(validateEditorValue({ roleRouting: { unknownRole: {} } }, f.get().schema, true), false, "projected native controls reject unknown role IDs before any RPC");
  for (const maxRetries of [-1, 1.5, 11]) assert.equal(validateEditorValue({ runtimePolicy: { rateLimit: { maxRetries } } }, f.get().schema, true), false, "native rate-limit controls share the resolver's bounded integer grammar");
  const route = { provider: "fixture", model: "owned" };
  assert.equal(validateEditorValue({ roleRouting: { "dsmm-reviewer": { primary: { ...route, model: "  " } } } }, f.get().schema, true), false);
  assert.equal(validateEditorValue({ roleRouting: { "dsmm-reviewer": { fallbackRoutes: Array.from({ length: 33 }, () => route) } } }, f.get().schema, true), false);
  assert.equal(validateEditorValue({ modules: { arbitrary: {} } }, f.get().schema), false); c.dispose();
});

test("profile native form requires exact namespace, revision, explicit metadata and writable Host mode", async () => {
  const f = fixture(); f.change({ nativeForm: { base: { defaultActive: true }, user: { defaultActive: false } }, profile: { defaultActive: false } });
  const c = new DeploymentController(f.remote, "profile", "dsmm"); let mutations = 0;
  const state = { status: "ready" as const, mode: "host" as const, writable: true, revision: 0, value: { defaultActive: false }, base: { defaultActive: true }, user: { defaultActive: false } };
  const mutate = async (ops: unknown, revision?: number) => { assert.equal(revision, 0); assert.deepEqual(ops, [{ op: "unset", path: ["defaultActive"] }]); mutations++; return true; };
  c.attachForm({ state, mutate }); await c.refresh(); assert.deepEqual(c.getSnapshot().draft, { defaultActive: false }, "never schema-filled form.value"); assert.equal(c.canWriteProfile(), true);
  c.attachForm({ state: { ...state, writable: false }, mutate }); c.edit(["defaultActive"], undefined); await c.save(); assert.equal(mutations, 0);
  c.attachForm({ state, mutate }); c.edit(["defaultActive"], undefined); await c.save(); assert.equal(mutations, 1); assert.equal(f.writes.length, 0);
  const foreign = new DeploymentController(f.remote, "profile", "other-row"); foreign.attachForm({ state, mutate }); await foreign.refresh(); assert.equal(foreign.canWriteProfile(), false); foreign.dispose(); c.dispose();
  assert.deepEqual(layerDiff({ workflow: { reviewCap: 3, strictGates: false } }, { workflow: { strictGates: false } }), [{ op: "unset", path: ["workflow", "reviewCap"] }]);
});

test("entry replacement and disposal between validation and send cannot write a previous identity", async () => {
  for (const reason of ["entry", "dispose"] as const) {
    const f = fixture(), c = new DeploymentController(f.remote, "global"); await c.refresh(); c.edit(["defaultActive"], true);
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); f.intercept(() => gate); const pending = c.save();
    if (reason === "entry") f.change({ entryId: "include:other", hostProfileKey: "other-profile" }); else c.dispose();
    release(); await pending; assert.equal(f.writes.length, 0); assert.equal(c.getSnapshot().dirty, true); c.dispose();
  }
});

test("profile editor preserves startup-only input and sparse native primary inheritance instead of pinning merged routes", async () => {
  const f = fixture();
  const user = { roleRouting: { "dsmm-reviewer": { primary: { model: "override" } } }, sessionPersistence: { root: "/owned/existing-native-log", compression: "none" } };
  f.change({ global: { roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture", model: "native-default" } } } }, nativeForm: { base: {}, user } });
  const c = new DeploymentController(f.remote, "profile", "dsmm");let mutations = 0;
  c.attachForm({ state: { status: "ready", mode: "host", writable: true, revision: 0, value: {}, base: {}, user }, mutate: async (ops, revision) => {
    assert.equal(revision, 0);assert.deepEqual(ops, [{ op: "set", path: ["roleRouting", "dsmm-reviewer", "primary", "model"], value: "changed" }]);mutations++;return true;
  } });
  await c.refresh();c.edit(["roleRouting", "dsmm-reviewer", "primary", "model"], "changed");await c.save();
  assert.equal(mutations, 1);assert.equal(f.writes.length, 0);
  assert.deepEqual(c.getSnapshot().draft.sessionPersistence, user.sessionPersistence);
  assert.deepEqual(c.getSnapshot().draft.roleRouting, { "dsmm-reviewer": { primary: { model: "changed" } } });c.dispose();
});

test("connection replacement preserves dirty edits and fences the old generation before outbound saves", async () => {
  const f = fixture(), c = new DeploymentController(f.remote, "global"); const listeners = new Set<() => void>();
  let current: ReturnType<ConnectionGenerationState["getSnapshot"]>;
  const source: ConnectionGenerationState = { getSnapshot: () => current, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  c.bindConnection(source); await c.refresh(); assert.equal(c.getSnapshot().issue, "transport");
  current = { id: 1 } as unknown as NonNullable<typeof current>; for (const listener of listeners) listener(); await c.refresh(true);
  c.edit(["defaultActive"], true); current = undefined; for (const listener of listeners) listener(); await c.save();
  assert.equal(f.writes.length, 0); assert.equal(c.getSnapshot().dirty, true); assert.equal(c.getSnapshot().issue, "transport");
  current = { id: 2 } as unknown as NonNullable<typeof current>; for (const listener of listeners) listener(); await c.refresh(); await c.save();
  assert.equal(c.getSnapshot().issue, "conflict"); assert.equal(f.writes.length, 0); c.dispose(); assert.equal(listeners.size, 0);
});
