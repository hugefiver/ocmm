import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import type { Context as NativeContext } from "@deepseek-ai/cordis";
// @ts-expect-error JavaScript acceptance hooks deliberately have no declarations.
import { withNativeProfileResolution } from "../scripts/profile-ui-acceptance.mjs";

const dshManifest = process.env.DSMM_TEST_DSH_ENTRY;
const sdkOnly = { skip: dshManifest === undefined ? "not covered: requires explicit installed SDK anchor DSMM_TEST_DSH_ENTRY" : false };

async function fixture() {
  assert.ok(dshManifest && isAbsolute(dshManifest), "direct resolver tests require an explicit installed native SDK manifest");
  const nativeRequire = createRequire(dshManifest);
  const { Context } = nativeRequire("@deepseek-ai/cordis") as { Context: typeof NativeContext };
  const { PluginPackages } = nativeRequire("@deepseek-ai/dsh-app-boot");
  const { foldSubagentDescriptor } = nativeRequire("@deepseek-ai/dsh-subagent");
  const home = await realpath(await mkdtemp(join(tmpdir(), "dsmm-ui-resolution-")));
  const profileDir = join(home, "profiles", "owned");
  const packageDir = join(profileDir, "node_modules", "@dsmm", "resolution-fixture");
  await mkdir(packageDir, { recursive: true });
  const profilePackage = join(profileDir, "package.json");
  await writeFile(profilePackage, JSON.stringify({ private: true, dependencies: { "@dsmm/resolution-fixture": "1.0.0" }, dsh: { profile: { bundles: [] } } }));
  const packageManifest = join(packageDir, "package.json");
  await writeFile(packageManifest, JSON.stringify({ name: "@dsmm/resolution-fixture", version: "1.0.0", type: "module", peerDependencies: { "@deepseek-ai/dsh-subagent": "0.2.0-rc.2" } }));
  const modules: Record<string, string> = {};
  for (const name of ["before", "during", "after"]) {
    const path = join(packageDir, `${name}.mjs`);
    await writeFile(path, 'export { foldSubagentDescriptor } from "@deepseek-ai/dsh-subagent";\n');
    modules[name] = pathToFileURL(path).href;
  }
  const missing = join(packageDir, "missing.mjs");
  await writeFile(missing, 'import "dsmm-uninstalled-ordinary-dependency";\n');
  let context: NativeContext | undefined;
  let disposed = false;
  class OwnedContext extends Context {
    constructor() {
      super();
      context = this;
      this.effect(() => async () => { await setImmediate(); disposed = true; });
    }
  }
  const observedNativeRequire = (name: string) => name === "@deepseek-ai/cordis" ? { ...nativeRequire(name), Context: OwnedContext } : nativeRequire(name);
  return {
    nativeRequire, PluginPackages, foldSubagentDescriptor,
    options: { nativeRequire: observedNativeRequire, dshManifest, profilePackage, env: { DSH_HOME: home } },
    profileRequire: createRequire(packageManifest), modules, missing: pathToFileURL(missing).href,
    assertDisposed() { assert.equal(disposed, true); assert.ok(context); assert.equal(context.get("pluginPackages"), undefined); },
    async dispose() { await rm(home, { recursive: true, force: false }); },
  };
}

test("native profile resolution admits the real SDK peer only for the awaited owned phase", sdkOnly, async () => {
  const f = await fixture();
  const { nativeRequire, PluginPackages, foldSubagentDescriptor } = f;
  try {
    assert.throws(() => f.profileRequire.resolve("@deepseek-ai/dsh-subagent"), { code: "MODULE_NOT_FOUND" });
    await assert.rejects(import(f.modules.before), { code: "ERR_MODULE_NOT_FOUND" });
    const result = {};
    assert.equal(await withNativeProfileResolution(f.options, async (ctx: NativeContext) => {
      assert.ok(ctx.get("pluginPackages") instanceof PluginPackages);
      assert.equal((await import(f.modules.during)).foldSubagentDescriptor, foldSubagentDescriptor);
      await setImmediate();
      assert.equal(f.profileRequire.resolve("@deepseek-ai/dsh-subagent"), nativeRequire.resolve("@deepseek-ai/dsh-subagent"));
      return result;
    }), result);
    f.assertDisposed();
    assert.throws(() => f.profileRequire.resolve("@deepseek-ai/dsh-subagent"), { code: "MODULE_NOT_FOUND" });
    await assert.rejects(import(f.modules.after), { code: "ERR_MODULE_NOT_FOUND" });
  } finally { await f.dispose(); }
});

test("a refused parent phase preserves its error and awaits native resolver disposal", sdkOnly, async () => {
  const f = await fixture();
  const { PluginPackages, foldSubagentDescriptor } = f;
  try {
    const refused = Object.assign(new Error("owned phase refusal"), { code: "OWNED_PHASE_REFUSED" });
    await assert.rejects(withNativeProfileResolution(f.options, async (ctx: NativeContext) => {
      assert.ok(ctx.get("pluginPackages") instanceof PluginPackages);
      assert.equal((await import(f.modules.during)).foldSubagentDescriptor, foldSubagentDescriptor);
      await setImmediate();
      throw refused;
    }), (error) => error === refused);
    f.assertDisposed();
    await assert.rejects(import(f.modules.after), { code: "ERR_MODULE_NOT_FOUND" });
  } finally { await f.dispose(); }
});

test("native peer resolution does not supply missing ordinary dependencies or mask their codes", sdkOnly, async () => {
  const f = await fixture();
  try {
    await assert.rejects(withNativeProfileResolution(f.options, () => import(f.missing)), { code: "ERR_MODULE_NOT_FOUND" });
    f.assertDisposed();
    assert.throws(() => f.profileRequire.resolve("@deepseek-ai/dsh-subagent"), { code: "MODULE_NOT_FOUND" });
  } finally { await f.dispose(); }
});

test("a rejected native profile load disposes the owned Context without invoking the parent phase", sdkOnly, async () => {
  const f = await fixture();
  try {
    await writeFile(f.options.profilePackage, "{invalid-profile");
    let invoked = false;
    await assert.rejects(withNativeProfileResolution(f.options, () => { invoked = true; }), SyntaxError);
    assert.equal(invoked, false);
    f.assertDisposed();
    assert.throws(() => f.profileRequire.resolve("@deepseek-ai/dsh-subagent"), { code: "MODULE_NOT_FOUND" });
  } finally { await f.dispose(); }
});
