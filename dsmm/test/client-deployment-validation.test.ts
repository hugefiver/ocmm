import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runInThisContext } from "node:vm";
import { build } from "esbuild";
import { isValidElement } from "react";
import type { ReactElement } from "react";
import type { DeploymentController as Controller } from "../src/client/deployment-controller.js";
import type { DeploymentPageProps } from "../src/client/DeploymentPage.js";
import type { DsmmConfigRemote } from "../src/profile-remote.js";
import type { DeploymentEditorSnapshot } from "../src/profile-types.js";
import { deploymentEditorSchema, mergeConfigLayers, resolveConfig, resolveDeployment, validateSparseConfig } from "../lib/settings.js";

// Compile the client under test in memory; never overwrite the shared lib build.
const root = fileURLToPath(new URL("..", import.meta.url));
const compiled = await build({
  absWorkingDir: root,
  stdin: { resolveDir: root, contents: 'export { DeploymentController } from "./src/client/deployment-controller.ts"; export { DeploymentPage } from "./src/client/DeploymentPage.tsx";' },
  bundle: true, write: false, platform: "node", format: "cjs", target: "es2022",
  external: ["react", "react/jsx-runtime", "@deepseek-ai/dsh-client-ui-primitives", "jsonc-parser"],
});
const require = createRequire(import.meta.url);
const module = { exports: {} as { DeploymentController: typeof Controller; DeploymentPage(props: DeploymentPageProps): unknown } };
runInThisContext(`(function(require, module, exports) { ${compiled.outputFiles[0].text}\n})`)((id: string) => {
  if (id === "react") return { ...require(id), useEffect() {}, useId: () => "advanced-validation", useState: (value: unknown) => [value, () => {}], useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get() };
  if (id === "@deepseek-ai/dsh-client-ui-primitives") return { Button() {}, Input() {} };
  return require(id);
}, module, module.exports);
const { DeploymentController, DeploymentPage } = module.exports;

function fixture(global: Record<string, unknown>, profile: Record<string, unknown>, base: Record<string, unknown> = profile) {
  const defaults = resolveConfig() as unknown as Record<string, unknown>;
  const snapshot: DeploymentEditorSnapshot = {
    entryId: "include:dsmm", namespace: "dsmm", hostProfileKey: "own-profile", global: structuredClone(global), globalRevision: "g0",
    profile: structuredClone(profile), nativeRevision: "n0", nativeFormRevision: 0, nativeForm: { base, user: {} },
    desired: resolveDeployment(validateSparseConfig(global, true), validateSparseConfig(profile)) as unknown as Record<string, unknown>, sources: {}, startup: defaults, defaults, schema: deploymentEditorSchema(), nextRoot: null, modules: [],
  };
  const writes: Parameters<DsmmConfigRemote["save"]>[0][] = [];
  const remote: DsmmConfigRemote = {
    describe: async () => ({ ok: true, value: { config: snapshot.global, revision: snapshot.globalRevision } }),
    describeModules: async () => ({ ok: true, value: [] }),
    describeSettings: async () => ({ ok: true, value: structuredClone(snapshot) }),
    save: async request => { writes.push(request); return { ok: true, value: { config: snapshot.global, revision: "g1" } }; },
  };
  return { snapshot, writes, controller: new DeploymentController(remote, "global"), remote };
}

function elements(tree: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...elements(tree.props.children)];
}
function renderComponent(node: ReactElement<Record<string, unknown>>): unknown {
  assert.equal(typeof node.type, "function");
  return (node.type as (props: unknown) => unknown)(node.props);
}
function advancedInput(controller: Controller, remote: DsmmConfigRemote) {
  const props: DeploymentPageProps = { core: controller, remote, view: "page", t: key => key };
  const layer = elements(DeploymentPage(props)).find(node => typeof node.type === "function" && node.type.name === "Layer")!;
  const field = elements(renderComponent(layer)).find(node => typeof node.type === "function" && node.type.name === "Field" && (node.props.path as string[])[0] === "roleRouting")!;
  const advanced = renderComponent(field) as ReactElement<Record<string, unknown>>;
  const input = elements(renderComponent(advanced)).find(node => node.type === "textarea")!;
  return (value: string) => (input.props.onChange as (event: unknown) => void)({ currentTarget: { value } });
}

test("Global save accepts either sparse primary member completed by the unchanged native profile", async () => {
  for (const [globalPrimary, nativePrimary] of [[{ provider: "fixture" }, { model: "review" }], [{ model: "review" }, { provider: "fixture" }]] as const) {
    const f = fixture({ roleRouting: { "dsmm-reviewer": { primary: globalPrimary } } }, { roleRouting: { "dsmm-reviewer": { primary: nativePrimary } } });
    try {
      await f.controller.refresh(); f.controller.edit(["defaultActive"], !f.snapshot.defaults.defaultActive); await f.controller.save();
      assert.equal(f.controller.getSnapshot().issue, null);
      assert.equal(f.controller.getSnapshot().dirty, false);
      assert.equal(f.controller.getSnapshot().saved, true);
      assert.deepEqual(f.writes, [{ expectedRevision: "g0", edits: [{ op: "set", path: ["defaultActive"], value: !f.snapshot.defaults.defaultActive }] }]);
      assert.deepEqual(f.controller.getSnapshot().draft, { roleRouting: { "dsmm-reviewer": { primary: globalPrimary } }, defaultActive: !f.snapshot.defaults.defaultActive });
    } finally { f.controller.dispose(); }
  }
});

test("Global advanced fields validate their sparse input against the complete native candidate without pinning inherited routes", async () => {
  for (const [globalPrimary, nativePrimary, changed] of [[{ provider: "fixture" }, { model: "review" }, { provider: "changed-provider" }], [{ model: "review" }, { provider: "fixture" }, { model: "changed-model" }]] as const) {
    const f = fixture({ roleRouting: { "dsmm-reviewer": { primary: globalPrimary } } }, { roleRouting: { "dsmm-reviewer": { primary: nativePrimary } } });
    try {
      await f.controller.refresh(); advancedInput(f.controller, f.remote)(JSON.stringify({ "dsmm-reviewer": { primary: changed } })); await f.controller.save();
      assert.equal(f.controller.getSnapshot().issue, null);
      assert.equal(f.controller.getSnapshot().saved, true);
      const key = Object.keys(changed)[0];
      assert.deepEqual(f.writes, [{ expectedRevision: "g0", edits: [{ op: "set", path: ["roleRouting", "dsmm-reviewer", "primary", key], value: Object.values(changed)[0] }] }]);
      assert.deepEqual(f.controller.getSnapshot().draft, { roleRouting: { "dsmm-reviewer": { primary: changed } } });
    } finally { f.controller.dispose(); }
  }
});

test("Global validation uses the effective native profile even without an owned native form", async () => {
  const f = fixture({ roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture" } } } }, { roleRouting: { "dsmm-reviewer": { primary: { model: "review" } } } });
  f.snapshot.nativeForm = null; f.snapshot.nativeFormRevision = null;
  try {
    await f.controller.refresh(); f.controller.edit(["defaultActive"], false); await f.controller.save();
    assert.equal(f.controller.getSnapshot().saved, true); assert.equal(f.writes.length, 1);
  } finally { f.controller.dispose(); }
});

test("Sparse primary edits still require a complete effective route before saving", async () => {
  for (const advanced of [false, true]) {
    const f = fixture({}, {});
    try {
      await f.controller.refresh();
      const routing = { "dsmm-reviewer": { primary: { provider: "fixture" } } };
      if (advanced) advancedInput(f.controller, f.remote)(JSON.stringify(routing)); else f.controller.edit(["roleRouting"], routing);
      await f.controller.save(); assert.equal(f.writes.length, 0); assert.equal(f.controller.getSnapshot().dirty, true);
      if (advanced) assert.deepEqual(f.controller.getSnapshot().draft, {}); else assert.equal(f.controller.getSnapshot().issue, "validation");
    } finally { f.controller.dispose(); }
  }
});

test("Global advanced inheritance removes only the explicit layer without materializing native or default values", async () => {
  const f = fixture({ roleRouting: { "dsmm-reviewer": { primary: { provider: "global" } } } }, { roleRouting: { "dsmm-reviewer": { primary: { provider: "native", model: "review" } } } });
  try {
    await f.controller.refresh(); advancedInput(f.controller, f.remote)(""); await f.controller.save();
    assert.equal(f.controller.getSnapshot().saved, true); assert.deepEqual(f.controller.getSnapshot().draft, {});
    assert.deepEqual(f.writes, [{ expectedRevision: "g0", edits: [{ op: "unset", path: ["roleRouting"] }] }]);
  } finally { f.controller.dispose(); }
});

test("Native precedence cannot conceal malformed sparse editor grammar", async () => {
  const native = { roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture", model: "review" } } } };
  for (const primary of [{ provider: "  " }, { model: 42 }, { unexpected: "route" }]) {
    for (const advanced of [false, true]) {
      const f = fixture({}, native);
      try {
        await f.controller.refresh();
        const routing = { "dsmm-reviewer": { primary } };
        if (advanced) advancedInput(f.controller, f.remote)(JSON.stringify(routing)); else f.controller.edit(["roleRouting"], routing);
        await f.controller.save(); assert.equal(f.writes.length, 0); assert.equal(f.controller.getSnapshot().dirty, true);
        if (advanced) assert.deepEqual(f.controller.getSnapshot().draft, {}); else assert.equal(f.controller.getSnapshot().issue, "validation");
      } finally { f.controller.dispose(); }
    }
  }
});

test("Global advanced validation applies native routes after the draft and keeps fallback arrays complete", async () => {
  const f = fixture({}, { roleRouting: { "dsmm-reviewer": { primary: { provider: "native", model: "review" } } } });
  try {
    await f.controller.refresh();
    advancedInput(f.controller, f.remote)('{"dsmm-reviewer":{"primary":{"model":"global-only"}}}');
    await f.controller.save(); assert.equal(f.controller.getSnapshot().saved, true);
    assert.deepEqual(f.writes[0].edits, [{ op: "set", path: ["roleRouting"], value: { "dsmm-reviewer": { primary: { model: "global-only" } } } }]);
    advancedInput(f.controller, f.remote)('{"dsmm-reviewer":{"fallbackRoutes":[{"model":"incomplete"}]}}');
    await f.controller.save(); assert.equal(f.writes.length, 1); assert.equal(f.controller.getSnapshot().dirty, true);
  } finally { f.controller.dispose(); }
});

test("Profile advanced fields inherit global and native base members but persist only the user layer", async () => {
  const global = { roleRouting: { "dsmm-reviewer": { primary: { provider: "global", model: "global-model" } } } };
  const base = { roleRouting: { "dsmm-reviewer": { primary: { provider: "native-base" } } } };
  const user = { roleRouting: { "dsmm-reviewer": { primary: { model: "user-model" } } } };
  const f = fixture(global, mergeConfigLayers(validateSparseConfig(base), validateSparseConfig(user)) as Record<string, unknown>, base);
  f.snapshot.nativeForm = { base, user };
  const c = new DeploymentController(f.remote, "profile", "dsmm"), mutations: unknown[] = [];
  c.attachForm({ state: { status: "ready", mode: "host", writable: true, revision: 0, value: {}, base, user }, mutate: async (ops, revision) => { assert.equal(revision, 0); mutations.push(ops); return true; } });
  try {
    await c.refresh(); advancedInput(c, f.remote)('{"dsmm-reviewer":{"primary":{"model":"changed"}}}'); await c.save();
    assert.equal(c.getSnapshot().saved, true);
    assert.deepEqual(mutations, [[{ op: "set", path: ["roleRouting", "dsmm-reviewer", "primary", "model"], value: "changed" }]]);
    assert.deepEqual(c.getSnapshot().draft, { roleRouting: { "dsmm-reviewer": { primary: { model: "changed" } } } });
    assert.equal(f.writes.length, 0);
  } finally { c.dispose(); f.controller.dispose(); }
});
