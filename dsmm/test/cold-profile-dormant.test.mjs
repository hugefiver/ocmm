import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  applyColdProfileMigration, loadColdProfileSdk, planColdProfileMigration,
  prepareColdProfileMigration, planColdProfileRecovery, recoverColdProfileMigration,
} from "../scripts/migrate-cold-profile.mjs";
import { inspectColdComposition } from "../scripts/cold-profile-composition.mjs";
import { SourceReadset } from "../scripts/cold-profile-sources.mjs";

const anchor = process.env.DSMM_COLD_PROFILE_SDK_ANCHOR;
const declarations = [
  ["dsh-tui-code-runtime", "@deepseek-ai/dsh-code-runtime-worker-thread", "@deepseek-ai/dsh-ptc-runtime-node", "code-runtime"],
  ["dsh-tui-agent-presets", "@deepseek-ai/dsh-agent-presets", "@deepseek-ai/dsh-agent-preset-registry", "agent-presets"],
];
const expression = ([, name, capability, official]) => `(() => {
  const require = process.getBuiltinModule('node:module').createRequire(ctx.baseUrl)
  try { require.resolve('${capability}/package.json'); return true } catch {}
  return [...ctx.loader.entries()].some(entry => entry.options.id === '${official}' && entry.options.name === '${name}' && !entry.disabled)
})()`;
const dormantRow = declaration => ({ id: declaration[0], name: declaration[1], disabled: { __jsExpr: expression(declaration) }, config: { __jsExpr: "globalThis.__dsmmDormantExecuted = true" } });

async function fixture(t, rows = declarations.map(dormantRow)) {
  assert.ok(anchor, "Set DSMM_COLD_PROFILE_SDK_ANCHOR to the fixed rc.2 SDK package.json");
  const root = await mkdtemp(join(tmpdir(), "dsmm-dormant-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const profileDir = join(home, "profiles", "dsh-tui");
  await mkdir(profileDir, { recursive: true });
  const sdk = await loadColdProfileSdk(anchor);
  sdk.boot.initProfile(profileDir, ["@deepseek-ai/dsh-base"]);
  const packageDir = join(profileDir, "node_modules", "@dsmm", "dsmm");
  await mkdir(packageDir, { recursive: true });
  await writeFile(join(packageDir, "package.json"), JSON.stringify({
    name: "@dsmm/dsmm", version: "0.2.2", type: "module",
    exports: Object.fromEntries(["llm-runtime", "managed-settings", "permission-bash", "permission-pwsh", "permission-fs", "permission-fs-search", "permission-web"].map(name => [`./${name}`, "./index.mjs"])),
  }));
  await writeFile(join(packageDir, "index.mjs"), "throw new Error('cold migration must not import plugins');\n");
  const patchPath = join(profileDir, "cordis.patch.yml");
  const writeRows = rows => writeFile(patchPath, sdk.yaml.dump([{ insert: rows }], { schema: sdk.include.entryListSchema, noRefs: true, lineWidth: -1 }));
  await writeRows(rows);
  const manifestPath = join(profileDir, "package.json");
  const original = await readFile(manifestPath, "utf8");
  const options = { target: "dsh-tui", profileDir, home, installAnchor: anchor, sourceRoots: [profileDir, home], overlays: [], migrateShell: true, migrateSubagent: false, migrateSessionPersistence: false };
  return { root, options, sdk, rows, writeRows, patchPath, manifestPath, original };
}

test("both genuine early-capability dormant declarations migrate without evaluating configuration or changing expression bytes", async t => {
  const f = await fixture(t);
  const native = createRequire(`${pathToFileURL(f.options.profileDir).href}/`);
  for (const declaration of declarations) assert.throws(() => native.resolve(`${declaration[2]}/package.json`), { code: "MODULE_NOT_FOUND" });
  const beforePatch = await readFile(f.patchPath, "utf8");
  const planned = await planColdProfileMigration(f.options);
  const applied = await applyColdProfileMigration({ ...f.options, expectedRevision: planned.revision, sourceWriteExclusion: true });
  assert.equal(applied.status, "applied");
  assert.equal(await readFile(f.patchPath, "utf8"), beforePatch);
  assert.equal(globalThis.__dsmmDormantExecuted, undefined);
  const inspection = await inspectColdComposition(f.options, f.sdk, { receipt: JSON.parse(await readFile(join(f.options.profileDir, "node_modules", applied.projectionName, ".dsmm-cold-profile.json"), "utf8")) });
  for (const row of f.rows) assert.deepEqual(inspection.rows.find(entry => entry.id === row.id), row);
  assert.equal((await planColdProfileMigration(f.options)).status, "already-applied");
  const recoveryOptions = { ...f.options, projectionName: applied.projectionName };
  const recovery = await planColdProfileRecovery(recoveryOptions);
  await recoverColdProfileMigration({ ...recoveryOptions, expectedRevision: recovery.revision, sourceWriteExclusion: true });
  assert.equal(await readFile(f.manifestPath, "utf8"), f.original);
});

test("native newly constructed Entry inherits loader.ctx before its tree context is patched", async t => {
  assert.ok(anchor, "Set DSMM_COLD_PROFILE_SDK_ANCHOR to the fixed rc.2 SDK package.json");
  const native = createRequire(anchor);
  const { Context } = await import(pathToFileURL(native.resolve("@deepseek-ai/cordis")).href);
  const { Loader, Entry } = await import(pathToFileURL(native.resolve("@deepseek-ai/cordis-plugin-loader")).href);
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  const loaderBase = new URL("./native-root/", pathToFileURL(anchor)).href;
  const nestedBase = new URL("./nested/", loaderBase).href;
  ctx.baseUrl = loaderBase;
  await ctx.plugin(Loader);
  const loader = ctx.get("loader");
  const entry = new Entry(loader);
  entry.parent = { ctx: ctx.extend({ baseUrl: nestedBase }) };
  entry.options = { disabled: true };
  assert.equal(entry.ctx.baseUrl, loaderBase);
  assert.notEqual(entry.ctx.baseUrl, entry.parent.ctx.baseUrl);
  assert.equal(entry.disabled, true);
});

async function localCapability(f, declaration = declarations[0], { directory, exports = { "./package.json": "./package.json" } } = {}) {
  const packageDir = directory ?? join(f.options.profileDir, "node_modules", declaration[2]);
  await mkdir(packageDir, { recursive: true });
  const manifestPath = join(packageDir, "package.json");
  const manifest = { name: declaration[2], version: "0.2.0-rc.2", exports: { ".": "./index.mjs", "./*": "./index.mjs", ...exports } };
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(join(packageDir, "index.mjs"), "throw new Error('capability resolution must not execute a package');\n");
  return { packageDir, manifestPath, manifest };
}

for (const mutation of ["deletion", "identity", "exports", "redirect", "nearer-shadow"]) {
  test(`fresh dormant CAS rejects ${mutation} after preparation and leaves the profile reference unchanged`, async t => {
    const f = await fixture(t, [dormantRow(declarations[0])]);
    let capability;
    if (mutation === "redirect") {
      capability = await localCapability(f, declarations[0], { directory: join(f.root, "capability-one") });
      const link = join(f.options.profileDir, "node_modules", declarations[0][2]);
      await mkdir(dirname(link), { recursive: true });
      await symlink(capability.packageDir, link, "junction");
    } else if (mutation !== "nearer-shadow") capability = await localCapability(f);
    const readset = new SourceReadset();
    assert.equal(readset.dormantCapability(f.options, `${pathToFileURL(f.options.profileDir).href}/`, `${declarations[0][2]}/package.json`), true);
    const planned = await planColdProfileMigration(f.options);
    const prepared = await prepareColdProfileMigration({ ...f.options, expectedRevision: planned.revision });
    if (mutation === "deletion") await rm(capability.manifestPath);
    if (mutation === "identity") await writeFile(capability.manifestPath, JSON.stringify({ ...capability.manifest, version: "0.2.0-rc.3" }));
    if (mutation === "exports") await writeFile(capability.manifestPath, JSON.stringify({ ...capability.manifest, exports: { ...capability.manifest.exports, "./package.json": { require: "./package.json", default: "./package.json" } } }));
    if (mutation === "redirect") {
      const next = await localCapability(f, declarations[0], { directory: join(f.root, "capability-two") });
      const link = join(f.options.profileDir, "node_modules", declarations[0][2]);
      await rm(link);
      await symlink(next.packageDir, link, "junction");
      assert.equal(existsSync(capability.manifestPath), true);
    }
    if (mutation === "nearer-shadow") await localCapability(f);
    assert.throws(() => readset.assertCurrent(), { code: "SOURCE_CONFLICT" });
    await assert.rejects(applyColdProfileMigration({ ...f.options, expectedRevision: planned.revision, projectionName: prepared.projectionName, sourceWriteExclusion: true }), error => ["SOURCE_CONFLICT", "UNRESOLVED_ENTRY_MODULE"].includes(error.code));
    assert.equal(await readFile(f.manifestPath, "utf8"), f.original);
    assert.equal(await readFile(f.patchPath, "utf8"), f.sdk.yaml.dump([{ insert: f.rows }], { schema: f.sdk.include.entryListSchema, noRefs: true, lineWidth: -1 }));
  });
}

test("CJS capability conditions and exports are checked by actual SDK interception without executing the target", async t => {
  const f = await fixture(t, [dormantRow(declarations[0])]);
  const capability = await localCapability(f, declarations[0], { exports: { "./package.json": { import: "./missing.json", require: "./package.json" } } });
  const planned = await planColdProfileMigration(f.options);
  assert.equal(planned.status, "planned");
  await writeFile(capability.manifestPath, JSON.stringify({ ...capability.manifest, exports: { ...capability.manifest.exports, "./package.json": { import: "./package.json" } } }));
  await assert.rejects(planColdProfileMigration(f.options), { code: "UNRESOLVED_ENTRY_MODULE" });
  assert.equal(await readFile(f.manifestPath, "utf8"), f.original);
});

test("unknown disabled JavaScript never runs and cannot exempt an unresolved module; loadable unknown expressions remain supported", async t => {
  const f = await fixture(t, []);
  const sentinel = join(f.root, "expression-side-effect");
  const effect = `process.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'executed')`;
  const row = dormantRow(declarations[0]);
  for (const disabled of [
    true,
    { __jsExpr: "true" },
    { __jsExpr: `(${effect}, true)` },
    { __jsExpr: row.disabled.__jsExpr.replace("try {", `${effect}\n  try {`) },
    { __jsExpr: row.disabled.__jsExpr.replace("return true", "return false") },
    { __jsExpr: row.disabled.__jsExpr.replace("'@deepseek-ai/dsh-ptc-runtime-node/package.json'", "ctx.capability") },
  ]) {
    await f.writeRows([{ ...row, disabled }]);
    await assert.rejects(planColdProfileMigration(f.options), { code: "UNRESOLVED_ENTRY_MODULE" });
    assert.equal(existsSync(sentinel), false);
  }
  await f.writeRows([{ id: "unknown-loadable", name: "@dsmm/dsmm/permission-web", disabled: { __jsExpr: effect }, config: { __jsExpr: effect } }]);
  assert.equal((await planColdProfileMigration(f.options)).status, "planned");
  assert.equal(existsSync(sentinel), false);
  assert.equal(await readFile(f.manifestPath, "utf8"), f.original);
});

test("dormant entries retain duplicate-ID, metadata, group, selector, replacement and LLM realm validation", async t => {
  const f = await fixture(t, []);
  const row = dormantRow(declarations[0]);
  for (const [rows, code] of [
    [[row, row], "DUPLICATE_ENTRY_ID"],
    [[{ ...row, inject: 17 }], "UNSUPPORTED_SCOPE_METADATA"],
    [[{ ...row, group: true }], "UNSUPPORTED_GROUP_CARRIER"],
    [[{ ...row, inject: ["llm"], isolate: { llm: "other-realm" } }], "LLM_REALM_MISMATCH"],
    [[{ ...row, group: false, intercept: { llm: true } }], "UNSUPPORTED_LLM_TOPOLOGY"],
    [[{ ...row, id: "other-compatibility-entry" }], "UNRESOLVED_ENTRY_MODULE"],
  ]) {
    await f.writeRows(rows);
    await assert.rejects(planColdProfileMigration(f.options), { code });
  }
  await f.writeRows([row]);
  await writeFile(f.patchPath, (await readFile(f.patchPath, "utf8")) + "- id: llm\n  name: '@deepseek-ai/dsh-llm'\n  config: {retained: true}\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "SELECTOR_SEMANTICS_CHANGED" });
  await f.writeRows([row]);
  const manifestPath = join(f.options.profileDir, "node_modules", "@dsmm", "dsmm", "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete manifest.exports["./permission-fs"];
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(planColdProfileMigration(f.options), { code: "UNRESOLVED_ENTRY_MODULE" });
  assert.equal(await readFile(f.manifestPath, "utf8"), f.original);
});

test("include and group traversal bases cannot supply an unproven disabled-evaluation context", async t => {
  const f = await fixture(t, []);
  const row = dormantRow(declarations[0]);
  await f.writeRows([{ id: "nested-group", name: "cordis:group", group: true, config: [row] }]);
  await assert.rejects(planColdProfileMigration(f.options), { code: "UNRESOLVED_ENTRY_MODULE" });
  await writeFile(join(f.options.profileDir, "children.yml"), f.sdk.yaml.dump([row], { schema: f.sdk.include.entryListSchema }));
  await f.writeRows([{ id: "nested-include", name: "cordis:include", config: { path: "./children.yml" } }]);
  await assert.rejects(planColdProfileMigration(f.options), { code: "UNRESOLVED_ENTRY_MODULE" });
  assert.equal(await readFile(f.manifestPath, "utf8"), f.original);
});
