import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  applyColdProfileMigration, coldProfileMigrationCli, loadColdProfileSdk,
  planColdProfileMigration, planColdProfileRecovery, prepareColdProfileMigration, recoverColdProfileMigration,
} from "../scripts/migrate-cold-profile.mjs";
import { replaceBundleToken } from "../scripts/cold-profile-sources.mjs";
import { coldProfileInputs, genuineApplicationFixture, isolatedApplicationEnvironment } from "./cold-profile-genuine-helper.mjs";

const { installAnchor, seedRoot } = await coldProfileInputs();
const fixtureTest = test;

const compositionTemplates = { "dsh-tui": "headless", desktop: "web" };

async function fixture(t, target = "desktop", patch = "[]\n", {
  migrateShell = true, migrateSubagent = false, migrateSessionPersistence = false,
  profileName = target, templateName = compositionTemplates[target],
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "dsmm-cold-profile-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const profileDir = join(home, "profiles", profileName);
  await mkdir(profileDir, { recursive: true });
  const sdk = await loadColdProfileSdk(installAnchor);
  const template = sdk.boot.PROFILE_TEMPLATES[templateName];
  assert.ok(template, "The requested public SDK template must be available");
  sdk.boot.initProfile(profileDir, template.bundles);
  const initializedManifest = JSON.parse(await readFile(join(profileDir, "package.json"), "utf8"));
  const thirdPartyDir = join(profileDir, "node_modules", "fixture-third-party");
  await mkdir(thirdPartyDir, { recursive: true });
  await writeFile(join(thirdPartyDir, "package.json"), JSON.stringify({
    name: "fixture-third-party", version: "1.0.0", type: "module", exports: "./index.mjs",
    dsh: { bundle: { patch: "./cordis.patch.yml" } },
  }));
  await writeFile(join(thirdPartyDir, "index.mjs"), "export function apply() {}\n");
  await writeFile(join(thirdPartyDir, "cordis.patch.yml"), "- insert:\n    - id: third-party\n      name: fixture-third-party\n      config:\n        retained: true\n");
  const dsmmDir = join(profileDir, "node_modules", "@dsmm", "dsmm");
  await mkdir(dsmmDir, { recursive: true });
  await writeFile(join(dsmmDir, "package.json"), JSON.stringify({
    name: "@dsmm/dsmm", version: "0.2.2", type: "module",
    exports: { "./llm-runtime": "./llm.mjs", "./managed-settings": "./settings.mjs", "./subagent-runtime": "./subagent.mjs", "./session-persistence": "./persistence.mjs", "./permission-bash": "./shell.mjs", "./permission-pwsh": "./shell.mjs", "./permission-fs": "./fs.mjs", "./permission-fs-search": "./search.mjs", "./permission-web": "./web.mjs" },
  }));
  await writeFile(join(dsmmDir, "llm.mjs"), "export default class FixtureModule {}\n");
  await writeFile(join(dsmmDir, "settings.mjs"), "export function apply() {}\n");
  await writeFile(join(dsmmDir, "shell.mjs"), "export function apply() {}\n");
  for (const name of ["fs", "search", "web"]) await writeFile(join(dsmmDir, `${name}.mjs`), `export function apply() { return ${JSON.stringify(name)}; }\n`);
  await writeFile(join(dsmmDir, "subagent.mjs"), "export default class FixtureSubagentModule {}\n");
  await writeFile(join(dsmmDir, "persistence.mjs"), "export default class FixturePersistenceModule {}\n");
  const bundles = [...initializedManifest.dsh.profile.bundles, "fixture-third-party"];
  const manifestText = `{\n  "name" : "owned-fixture",\n  "private": true,\n  "description": "unrelated formatting survives",\n  "dependencies" : {"fixture-third-party":"1.0.0","@dsmm/dsmm":"0.2.2"},\n  "dsh" : {"profile" : {"bundles" : ${JSON.stringify(bundles)}}},\n  "unrelated" : {"tokenRef":"env:FAKE_FIXTURE_ONLY"}\n}\n`;
  await writeFile(join(profileDir, "package.json"), manifestText);
  await writeFile(join(profileDir, "cordis.patch.yml"), patch);
  await writeFile(join(home, "cordis.patch.yml"), "- id: third-party\n  config:\n    retained: home-layer\n");
  const options = { target, profileDir, home, installAnchor, migrateShell, migrateSubagent, migrateSessionPersistence };
  const env = await isolatedApplicationEnvironment(root);
  env.DSH_HOME = home;
  return { root, env, options, manifestText, sdk, templateName, initializedManifest };
}

function entries(f, includeHome = true) {
  const p = f.sdk.boot.loadProfileDirectory("test", f.options.profileDir, installAnchor);
  assert.deepEqual(p.skippedBundles, []);
  return f.sdk.boot.composeEntries([
    ...p.layers.map(layer => layer.patches), p.patches,
    ...(includeHome ? [f.sdk.boot.loadOptionalPatches("test", join(f.options.home, "cordis.patch.yml")) ?? []] : []),
  ]);
}

async function apply(f) {
  const planned = await planColdProfileMigration(f.options);
  return applyColdProfileMigration({ ...f.options, expectedRevision: planned.revision, sourceWriteExclusion: true });
}

for (const target of ["dsh-tui", "desktop"]) fixtureTest(`public SDK ${compositionTemplates[target]} template in ${target} scope: base projection preserves coherent realms and sources (composition only)`, async t => {
  const patch = "# user expressions and config are retained in this source\n- id: llm\n  disabled: !!js \"!ctx.get('fixtureReady')\"\n  inject: [fixture-dependency]\n  intercept: {fixture: true}\n  isolate: {llm: fixture-realm, retained-isolation: true}\n  config: {reference: 'env:FAKE_FIXTURE_ONLY'}\n- id: agent-loop\n  isolate: {llm: fixture-realm, retained-loop-isolation: loop-realm}\n  config: {agents: [{id: retained-agent, model: retained-model}]}\n- id: llm-pi-ai\n  isolate: {llm: fixture-realm, retained-provider-isolation: true}\n- id: llm-deepseek\n  isolate: {llm: fixture-realm}\n- id: llm-deepseek-account\n  isolate: {llm: fixture-realm}\n";
  const f = await fixture(t, target, patch);
  assert.deepEqual(f.initializedManifest.dsh.profile.bundles, f.sdk.boot.PROFILE_TEMPLATES[f.templateName].bundles);
  const before = entries(f);
  const applied = await apply(f);
  const after = entries(f);
  const expected = structuredClone(before);
  for (const row of expected) {
    if (row.id === "llm") row.name = "@dsmm/dsmm/llm-runtime";
    if (row.id === "settings") row.name = "@dsmm/dsmm/managed-settings";
    if (row.id === "tool-bash") row.name = "@dsmm/dsmm/permission-bash";
    if (row.id === "tool-pwsh") row.name = "@dsmm/dsmm/permission-pwsh";
    if (row.id === "tool-fs") row.name = "@dsmm/dsmm/permission-fs";
    if (row.id === "tool-fs-search") row.name = "@dsmm/dsmm/permission-fs-search";
    if (row.id === "tool-web") row.name = "@dsmm/dsmm/permission-web";
  }
  assert.deepEqual(after, expected);
  assert.equal(after.find(row => row.id === "llm").disabled.__jsExpr, "!ctx.get('fixtureReady')");
  assert.equal(after.find(row => row.id === "third-party").config.retained, "home-layer");
  assert.equal(after.find(row => row.id === "subagent").name, "@deepseek-ai/dsh-subagent");
  assert.equal(after.find(row => row.id === "session-persistence-jsonl").name, "@deepseek-ai/dsh-session-persistence-jsonl");
  assert.equal(await readFile(join(f.options.profileDir, "cordis.patch.yml"), "utf8"), patch);
  assert.equal(await readFile(join(f.options.profileDir, "package.json"), "utf8"), replaceBundleToken(f.manifestText, 0, applied.projectionName));
  const projection = await readFile(join(f.options.profileDir, "node_modules", applied.projectionName, "cordis.patch.yml"), "utf8");
  const projectedEntries = f.sdk.yaml.load(projection, { schema: f.sdk.include.entryListSchema }).flatMap(patch => patch.insert ?? []);
  assert.equal(projectedEntries.length > 90, true);
  assert.equal(projectedEntries.find(row => row.id === "llm").config, undefined);
  const next = await planColdProfileMigration(f.options);
  assert.equal(next.status, "already-applied");
  assert.equal((await applyColdProfileMigration({ ...f.options, expectedRevision: next.revision, sourceWriteExclusion: true })).projectionName, applied.projectionName);
});

for (const target of ["dsh-tui", "desktop"]) fixtureTest(`genuine ${target} application-owned initialization, migration and independent cold consumption`, async t => {
  const f = await genuineApplicationFixture(t, target, installAnchor, seedRoot);
  t.diagnostic(JSON.stringify(f.provenance));
  assert.deepEqual(f.initializedManifest.dsh.profile.bundles, ["@deepseek-ai/dsh-base", target === "desktop" ? "@deepseek-ai/dsh-web-app" : "@deepseek-harness-tui/dsh-tui"]);
  const before = f.coldEntries();
  assert.ok(before.some(row => row.id === (target === "desktop" ? "webserver" : "dsh-tui")), "The real application's front door must be composed");
  const applied = await apply(f);
  const after = f.coldEntries();
  const replacements = new Map([
    ["llm", "llm-runtime"], ["settings", "managed-settings"], ["subagent", "subagent-runtime"],
    ["session-persistence-jsonl", "session-persistence"], ["tool-bash", "permission-bash"],
    ["tool-pwsh", "permission-pwsh"], ["tool-fs", "permission-fs"],
    ["tool-fs-search", "permission-fs-search"], ["tool-web", "permission-web"],
  ]);
  assert.deepEqual(after, before.map(row => replacements.has(row.id) ? { ...row, name: `@dsmm/dsmm/${replacements.get(row.id)}` } : row));
  if (target === "dsh-tui") {
    const health = f.nativeHealth();
    assert.deepEqual(health.enabledUnhealthy, []);
    assert.deepEqual(health.legacyImportAttempts, []);
    assert.deepEqual(health.networkAttempts, []);
    assert.equal(health.dormant.length, 2);
    t.diagnostic(JSON.stringify(health));
  }
  assert.equal((await planColdProfileMigration(f.options)).status, "already-applied");
  const recoveryOptions = { ...f.options, projectionName: applied.projectionName };
  const recovery = await planColdProfileRecovery(recoveryOptions);
  await recoverColdProfileMigration({ ...recoveryOptions, expectedRevision: recovery.revision, sourceWriteExclusion: true });
  assert.deepEqual(f.coldEntries(), before);
});

fixtureTest("genuine seed consumption is offline and creates independent writable profiles", async t => {
  const first = await genuineApplicationFixture(t, "dsh-tui", installAnchor, seedRoot);
  const second = await genuineApplicationFixture(t, "dsh-tui", installAnchor, seedRoot);
  const patchPath = profile => join(profile, "node_modules", "@deepseek-harness-tui", "dsh-tui", "cordis.patch.yml");
  const original = await readFile(patchPath(second.options.profileDir), "utf8");
  await writeFile(patchPath(first.options.profileDir), "[]\n");
  await writeFile(join(first.options.profileDir, "cordis.patch.yml"), "- id: agent-loop\n  disabled: true\n");
  assert.equal(await readFile(patchPath(second.options.profileDir), "utf8"), original);
  assert.equal(await readFile(patchPath(join(seedRoot, "tui-profile")), "utf8"), original);
  assert.equal(first.coldEntries().find(row => row.id === "agent-loop").disabled, true);
  assert.notEqual(second.coldEntries().find(row => row.id === "agent-loop").disabled, true);
});

fixtureTest("genuine fixtures refuse missing or mismatched explicit SDK and seed inputs", async t => {
  await assert.rejects(coldProfileInputs({}));
  await assert.rejects(coldProfileInputs({ DSMM_COLD_PROFILE_SDK_ANCHOR: installAnchor }));
  const root = await mkdtemp(join(tmpdir(), "dsmm-wrong-genuine-seed-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh", version: "0.1.0" }));
  await assert.rejects(coldProfileInputs({ DSMM_COLD_PROFILE_SDK_ANCHOR: join(root, "package.json"), DSMM_COLD_PROFILE_GENUINE_SEED: seedRoot }));
  await writeFile(join(root, "seed.json"), JSON.stringify({ schemaVersion: 1, sdkVersion: "0.1.0" }));
  await assert.rejects(coldProfileInputs({ DSMM_COLD_PROFILE_SDK_ANCHOR: installAnchor, DSMM_COLD_PROFILE_GENUINE_SEED: root }));
});

fixtureTest("mismatched or unprovable LLM/official Loop/PiAI realms refuse publication even with disabled expressions", async t => {
  const f = await fixture(t, "desktop", "- id: llm\n  disabled: !!js \"!ctx.get('unknownReady')\"\n  isolate: {llm: fixture-realm}\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "LLM_REALM_MISMATCH" });
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "- id: llm-pi-ai\n  disabled: true\n  isolate: {llm: other-realm}\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "LLM_REALM_MISMATCH" });
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "- id: agent-loop\n  isolate: {llm: true}\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "LLM_REALM_MISMATCH" });
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "- id: agent-loop\n  isolate: {llm: !!js \"ctx.get('dynamicRealm')\"}\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "UNSUPPORTED_LLM_TOPOLOGY" });
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "- id: agent-loop\n  intercept: {llm: {unknown: true}}\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "UNSUPPORTED_LLM_TOPOLOGY" });
  assert.equal(await readFile(join(f.options.profileDir, "package.json"), "utf8"), f.manifestText);
});

fixtureTest("managed SettingsForms preserves its native declaration and requires its published entry before publication", async t => {
  const f = await fixture(t, "desktop", "- id: settings\n  disabled: !!js \"!ctx.get('profileContext')\"\n  inject: [configEditor, loader]\n  isolate: {unrelated: preserved-settings-realm}\n  intercept: {unrelated: true}\n  config: {retained: true}\n");
  const original = entries(f).find(row => row.id === "settings");
  const manifestPath = join(f.options.profileDir, "node_modules", "@dsmm", "dsmm", "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const target = manifest.exports["./managed-settings"];
  delete manifest.exports["./managed-settings"];
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(planColdProfileMigration(f.options));
  assert.equal(await readFile(join(f.options.profileDir, "package.json"), "utf8"), f.manifestText);
  manifest.exports["./managed-settings"] = target;
  await writeFile(manifestPath, JSON.stringify(manifest));
  await apply(f);
  assert.deepEqual(entries(f).find(row => row.id === "settings"), { ...original, name: "@dsmm/dsmm/managed-settings" });
});

fixtureTest("base native tools retain metadata and expression config while resolving their public replacements", async t => {
  const patch = "- id: tool-fs\n  disabled: !!js \"!ctx.get('readReady')\"\n  inject: [fs, tools]\n  isolate: {fs: retained-fs}\n  intercept: {unrelated: true}\n  config: {readLimit: 17}\n- id: tool-fs-search\n  config: {sampleOverCapGlobResults: false, maxResults: 23}\n- id: tool-web\n  config: {fetch: true, search: !!js \"ctx.get('webReady')\"}\n";
  const f = await fixture(t, "dsh-tui", patch);
  const before = entries(f);
  const planned = await planColdProfileMigration(f.options);
  assert.equal(planned.nativeToolSelection.status, "projected");
  assert.deepEqual(planned.nativeToolSelection.unprojected, []);
  for (const [id, module] of [["tool-fs", "fs"], ["tool-fs-search", "fs-search"], ["tool-web", "web"]]) {
    assert.ok(planned.changes.some(change => change.id === id && change.replacement === `@dsmm/dsmm/permission-${module}`));
  }
  await apply(f);
  const after = entries(f);
  for (const [id, module] of [["tool-fs", "fs"], ["tool-fs-search", "fs-search"], ["tool-web", "web"]]) {
    assert.deepEqual(after.find(row => row.id === id), { ...before.find(row => row.id === id), name: `@dsmm/dsmm/permission-${module}` });
  }
  assert.equal(await readFile(join(f.options.profileDir, "cordis.patch.yml"), "utf8"), patch);
});

fixtureTest("native tool replacement refuses a lost name selector and each unavailable public adapter", async t => {
  const f = await fixture(t, "dsh-tui", "- id: tool-fs\n  name: '@deepseek-ai/dsh-tool-fs'\n  config: {readLimit: 17}\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "SELECTOR_SEMANTICS_CHANGED" });
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "[]\n");
  const packagePath = join(f.options.profileDir, "node_modules", "@dsmm", "dsmm", "package.json");
  const original = await readFile(packagePath, "utf8");
  for (const module of ["fs", "fs-search", "web"]) {
    const manifest = JSON.parse(original);
    delete manifest.exports[`./permission-${module}`];
    await writeFile(packagePath, JSON.stringify(manifest));
    await assert.rejects(planColdProfileMigration(f.options), { code: "UNRESOLVED_ENTRY_MODULE" });
  }
  assert.equal(await readFile(join(f.options.profileDir, "package.json"), "utf8"), f.manifestText);
});

fixtureTest("Web preset and formal plugin slots remain explicit partial selections without changing their source semantics", async t => {
  const patch = "- insert:\n    - id: direct-web\n      name: '@deepseek-ai/dsh-tool-web'\n      disabled: !!js \"!ctx.get('directReady')\"\n      inject: [web]\n      isolate: {unrelated: direct-realm}\n      config: {fetch: true, search: false}\n    - id: formal-preset\n      name: '@deepseek-ai/dsh-agent-preset'\n      config:\n        id: formal\n        name: Formal\n        plugins:\n          - id: formal-web\n            name: '@deepseek-ai/dsh-tool-web'\n            disabled: !!js \"!ctx.get('formalReady')\"\n            inject: [web]\n            isolate: {unrelated: formal-realm}\n            config: {fetch: true}\n- id: direct-web\n  name: '@deepseek-ai/dsh-tool-web'\n  config: {fetch: false, search: true}\n";
  const f = await fixture(t, "desktop", patch);
  const before = entries(f);
  const planned = await planColdProfileMigration(f.options);
  assert.equal(planned.nativeToolSelection.status, "partial");
  for (const id of ["direct-web", "formal-web", "tool-fs", "tool-fs-search"]) {
    assert.ok(planned.nativeToolSelection.unprojected.some(slot => slot.id === id), id);
  }
  const applied = await apply(f);
  assert.equal(applied.nativeToolSelection.status, "partial");
  const after = entries(f);
  for (const id of ["direct-web", "formal-preset", "preset-standard"]) assert.deepEqual(after.find(row => row.id === id), before.find(row => row.id === id));
  assert.equal((await planColdProfileMigration(f.options)).nativeToolSelection.status, "partial");
  assert.equal(await readFile(join(f.options.profileDir, "cordis.patch.yml"), "utf8"), patch);
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "- id: preset-standard\n  config: {id: standard, plugins: !!js \"ctx.get('dynamicPlugins')\"}\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "UNSUPPORTED_PRESET_PLUGINS" });
});

fixtureTest("alternative effective Loop declarations and extra include-scoped official Loops refuse publication", async t => {
  const f = await fixture(t, "desktop", "- insert:\n    - id: another-loop\n      name: '@deepseek-ai/dsh-agent-loop'\n      disabled: !!js \"!ctx.get('maybeEnabled')\"\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "ALTERNATE_AGENT_LOOP" });
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "- insert:\n    - id: agent-loop\n      name: fixture-third-party\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "DUPLICATE_ENTRY_ID" });
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "- insert:\n    - id: child-loop\n      name: cordis:include\n      config: {path: ./loops.yml}\n");
  await writeFile(join(f.options.profileDir, "loops.yml"), "- id: agent-loop\n  name: fixture-third-party\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "ALTERNATE_AGENT_LOOP" });
  await writeFile(join(f.options.profileDir, "loops.yml"), "- id: agent-loop\n  name: '@deepseek-ai/dsh-agent-loop'\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "OFFICIAL_AGENT_LOOP_REQUIRED" });
});

fixtureTest("group/include context inheritance cannot give an explicit LLM consumer a mismatched realm", async t => {
  const f = await fixture(t, "desktop", "- insert:\n    - id: consumer-group\n      name: cordis:group\n      group: true\n      isolate: {llm: true}\n      config:\n        - id: nested-consumer\n          name: fixture-third-party\n          inject: [llm]\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "LLM_REALM_MISMATCH" });
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "- insert:\n    - id: consumer-include\n      name: cordis:include\n      isolate: {llm: other-realm}\n      config: {path: ./consumer.yml}\n");
  await writeFile(join(f.options.profileDir, "consumer.yml"), "- id: explicit-consumer\n  name: fixture-third-party\n  inject: {llm: {required: true}}\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "LLM_REALM_MISMATCH" });
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "- insert:\n    - id: consumer-include\n      name: cordis:include\n      isolate: {unrelated: retained-realm}\n      config: {path: ./consumer.yml}\n");
  await apply(f);
  assert.deepEqual(entries(f).find(row => row.id === "consumer-include").isolate, { unrelated: "retained-realm" });
});

fixtureTest("CAS follows current package exports and module resolution, not module implementation bytes", async t => {
  const f = await fixture(t);
  const first = await planColdProfileMigration(f.options);
  const packageDir = join(f.options.profileDir, "node_modules", "@dsmm", "dsmm");
  await writeFile(join(packageDir, "llm.mjs"), "export default class UpdatedFixtureModule {}\n");
  assert.equal((await planColdProfileMigration(f.options)).revision, first.revision);
  await writeFile(join(packageDir, "selected-llm.mjs"), "export default class SelectedFixtureModule {}\n");
  const packagePath = join(packageDir, "package.json");
  const manifest = JSON.parse(await readFile(packagePath, "utf8"));
  manifest.exports["./llm-runtime"] = "./selected-llm.mjs";
  await writeFile(packagePath, JSON.stringify(manifest));
  await assert.rejects(applyColdProfileMigration({ ...f.options, expectedRevision: first.revision, sourceWriteExclusion: true }), { code: "SOURCE_CONFLICT" });
  await apply(f);
});

fixtureTest("shell migration can be explicitly excluded without altering native shell declarations", async t => {
  const f = await fixture(t, "dsh-tui", "[]\n", { migrateShell: false });
  await apply(f);
  const rows = entries(f);
  assert.equal(rows.find(row => row.id === "tool-bash").name, "@deepseek-ai/dsh-tool-bash");
  assert.equal(rows.find(row => row.id === "tool-pwsh").name, "@deepseek-ai/dsh-tool-pwsh");
});

fixtureTest("explicit subagent migration preserves original entry metadata, Loop/provider, idempotence, and recovery", async t => {
  const patch = "- id: subagent\n  disabled: !!js \"!ctx.get('dwReady')\"\n  config: {retained: subagent-config}\n  inject: [fixture-dependency]\n  intercept: {fixture: true}\n  isolate: {subagent: fixture-realm}\n";
  const f = await fixture(t, "desktop", patch, { migrateSubagent: true });
  const before = entries(f);
  const plan = await planColdProfileMigration(f.options);
  assert.deepEqual(plan.changes.find(change => change.id === "subagent"), {
    id: "subagent", original: "@deepseek-ai/dsh-subagent", replacement: "@dsmm/dsmm/subagent-runtime",
  });
  const args = ["--target", f.options.target, "--profile-dir", f.options.profileDir, "--home", f.options.home, "--install-anchor", installAnchor, "--migrate-subagent"];
  const applied = await coldProfileMigrationCli(["apply", ...args, "--expected-revision", plan.revision, "--source-write-exclusion"]);
  const after = entries(f);
  assert.deepEqual(after.find(row => row.id === "subagent"), {
    ...before.find(row => row.id === "subagent"), name: "@dsmm/dsmm/subagent-runtime",
  });
  for (const id of ["agent-loop", "llm-pi-ai"]) assert.deepEqual(after.find(row => row.id === id), before.find(row => row.id === id));
  assert.equal(await readFile(join(f.options.profileDir, "cordis.patch.yml"), "utf8"), patch);
  const current = await planColdProfileMigration(f.options);
  assert.equal((await applyColdProfileMigration({ ...f.options, expectedRevision: current.revision, sourceWriteExclusion: true })).projectionName, applied.projectionName);
  const recoveryOptions = { ...f.options, projectionName: applied.projectionName };
  const recovery = await planColdProfileRecovery(recoveryOptions);
  await recoverColdProfileMigration({ ...recoveryOptions, expectedRevision: recovery.revision, sourceWriteExclusion: true });
  assert.deepEqual(entries(f), before);
});

fixtureTest("subagent replacement is explicitly opted in and retains selector/export validation", async t => {
  const f = await fixture(t, "dsh-tui", "- id: subagent\n  name: '@deepseek-ai/dsh-subagent'\n  disabled: true\n");
  assert.equal((await planColdProfileMigration(f.options)).changes.some(change => change.id === "subagent"), false);
  await assert.rejects(planColdProfileMigration({ ...f.options, migrateSubagent: true }), { code: "SELECTOR_SEMANTICS_CHANGED" });
  await assert.rejects(planColdProfileMigration({ ...f.options, migrateSubagent: "true" }), { code: "INVALID_SUBAGENT_OPTION" });
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "[]\n");
  const packagePath = join(f.options.profileDir, "node_modules", "@dsmm", "dsmm", "package.json");
  const manifest = JSON.parse(await readFile(packagePath, "utf8"));
  delete manifest.exports["./subagent-runtime"];
  await writeFile(packagePath, JSON.stringify(manifest));
  await assert.rejects(planColdProfileMigration({ ...f.options, migrateSubagent: true }), { code: "UNRESOLVED_ENTRY_MODULE" });
  assert.equal(await readFile(join(f.options.profileDir, "package.json"), "utf8"), f.manifestText);
});

fixtureTest("explicit session persistence replacement preserves Config expressions, metadata, and existing session data", async t => {
  const patch = "- id: session-persistence-jsonl\n  config:\n    root: !!js \"dshHomePath('sessions')\"\n    compression: !!js \"process.env.FIXTURE_COMPRESSION || 'zstd'\"\n  disabled: !!js \"!ctx.get('persistenceReady')\"\n  inject: [fixture-dependency]\n  intercept: {fixture: true}\n  isolate: {sessionPersistence: fixture-realm}\n";
  const f = await fixture(t, "desktop", patch, { migrateSessionPersistence: true, migrateSubagent: true });
  const sessions = join(f.options.home, "sessions");
  await mkdir(sessions);
  const sessionPath = join(sessions, "fixture.jsonl");
  const sessionData = '{"fixture":"existing-session","messages":[]}\n';
  await writeFile(sessionPath, sessionData);
  const before = entries(f);
  const plan = await planColdProfileMigration(f.options);
  assert.deepEqual(plan.changes.find(change => change.id === "session-persistence-jsonl"), {
    id: "session-persistence-jsonl", original: "@deepseek-ai/dsh-session-persistence-jsonl", replacement: "@dsmm/dsmm/session-persistence",
  });
  const args = ["--target", f.options.target, "--profile-dir", f.options.profileDir, "--home", f.options.home, "--install-anchor", installAnchor, "--migrate-subagent", "--migrate-session-persistence"];
  const applied = await coldProfileMigrationCli(["apply", ...args, "--expected-revision", plan.revision, "--source-write-exclusion"]);
  const after = entries(f);
  assert.deepEqual(after.find(row => row.id === "session-persistence-jsonl"), {
    ...before.find(row => row.id === "session-persistence-jsonl"), name: "@dsmm/dsmm/session-persistence",
  });
  for (const id of ["agent-loop", "llm-pi-ai"]) assert.deepEqual(after.find(row => row.id === id), before.find(row => row.id === id));
  assert.equal(await readFile(join(f.options.profileDir, "cordis.patch.yml"), "utf8"), patch);
  assert.equal(await readFile(sessionPath, "utf8"), sessionData);
  const current = await planColdProfileMigration(f.options);
  assert.equal((await applyColdProfileMigration({ ...f.options, expectedRevision: current.revision, sourceWriteExclusion: true })).projectionName, applied.projectionName);
  const recoveryOptions = { ...f.options, projectionName: applied.projectionName };
  const recovery = await planColdProfileRecovery(recoveryOptions);
  await recoverColdProfileMigration({ ...recoveryOptions, expectedRevision: recovery.revision, sourceWriteExclusion: true });
  assert.deepEqual(entries(f), before);
  assert.equal(await readFile(sessionPath, "utf8"), sessionData);
});

fixtureTest("session persistence replacement is opt-in and refuses lost selectors or missing exports", async t => {
  const f = await fixture(t, "dsh-tui", "- id: session-persistence-jsonl\n  name: '@deepseek-ai/dsh-session-persistence-jsonl'\n  disabled: true\n");
  assert.equal((await planColdProfileMigration(f.options)).changes.some(change => change.id === "session-persistence-jsonl"), false);
  await assert.rejects(planColdProfileMigration({ ...f.options, migrateSessionPersistence: true }), { code: "SELECTOR_SEMANTICS_CHANGED" });
  await assert.rejects(planColdProfileMigration({ ...f.options, migrateSessionPersistence: "true" }), { code: "INVALID_SESSION_PERSISTENCE_OPTION" });
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "[]\n");
  const packagePath = join(f.options.profileDir, "node_modules", "@dsmm", "dsmm", "package.json");
  const manifest = JSON.parse(await readFile(packagePath, "utf8"));
  delete manifest.exports["./session-persistence"];
  await writeFile(packagePath, JSON.stringify(manifest));
  await assert.rejects(planColdProfileMigration({ ...f.options, migrateSessionPersistence: true }), { code: "UNRESOLVED_ENTRY_MODULE" });
  assert.equal(await readFile(join(f.options.profileDir, "package.json"), "utf8"), f.manifestText);
});

fixtureTest("old name selectors refuse publication instead of discarding matching config", async t => {
  const f = await fixture(t, "desktop", "- id: llm\n  name: '@deepseek-ai/dsh-llm'\n  disabled: true\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "SELECTOR_SEMANTICS_CHANGED" });
  assert.equal(await readFile(join(f.options.profileDir, "package.json"), "utf8"), f.manifestText);
});

fixtureTest("name remains an assertion: a nonmatching selector never replaces the original owner", async t => {
  const f = await fixture(t, "desktop", "- id: llm\n  name: fixture-not-the-owner\n  disabled: true\n");
  assert.equal(entries(f).find(row => row.id === "llm").name, "@deepseek-ai/dsh-llm");
  await apply(f);
  assert.equal(entries(f).find(row => row.id === "llm").name, "@dsmm/dsmm/llm-runtime");
  assert.equal(entries(f).find(row => row.id === "llm").disabled, undefined);
});

fixtureTest("shared Home revision and optional layer creation participate in CAS without writes to siblings", async t => {
  const f = await fixture(t);
  const sibling = join(f.options.home, "profiles", "other");
  await mkdir(sibling);
  await writeFile(join(sibling, "package.json"), "{\"ownedBy\":\"other\"}\n");
  const plan = await planColdProfileMigration(f.options);
  await writeFile(join(f.options.home, "cordis.patch.yml"), "- id: third-party\n  config: {changed: concurrent}\n");
  await assert.rejects(applyColdProfileMigration({ ...f.options, expectedRevision: plan.revision, sourceWriteExclusion: true }), { code: "SOURCE_CONFLICT" });
  assert.equal(await readFile(join(f.options.profileDir, "package.json"), "utf8"), f.manifestText);
  assert.equal(await readFile(join(sibling, "package.json"), "utf8"), '{"ownedBy":"other"}\n');
  const current = await planColdProfileMigration(f.options);
  await writeFile(join(f.options.profileDir, "compatibility.json"), "{}\n");
  await assert.rejects(applyColdProfileMigration({ ...f.options, expectedRevision: current.revision, sourceWriteExclusion: true }), { code: "SOURCE_CONFLICT" });
});

fixtureTest("relative modules and include-local patches preserve source bases and are checked for concurrent edits", async t => {
  const f = await fixture(t, "desktop", "- insert:\n    - id: include-fixture\n      name: cordis:include\n      config:\n        path: ./nested/entries.yml\n        patches:\n          - id: included\n            name: ./plugin.mjs\n            disabled: !!js \"!ctx.get('ready')\"\n");
  const nested = join(f.options.profileDir, "nested");
  await mkdir(nested);
  await writeFile(join(nested, "plugin.mjs"), "export function apply() {}\n");
  await writeFile(join(nested, "entries.yml"), "- id: included\n  name: ./plugin.mjs\n  config: {retained: included}\n");
  const first = await planColdProfileMigration(f.options);
  await writeFile(join(nested, "plugin.mjs"), "export function apply() { return null; }\n");
  assert.equal((await planColdProfileMigration(f.options)).revision, first.revision);
  await writeFile(join(nested, "entries.yml"), "- id: included\n  name: ./plugin.mjs\n  config: {retained: concurrent-config}\n");
  await assert.rejects(applyColdProfileMigration({ ...f.options, expectedRevision: first.revision, sourceWriteExclusion: true }), { code: "SOURCE_CONFLICT" });
  await apply(f);
  assert.equal(entries(f).find(row => row.id === "include-fixture").config.path, "./nested/entries.yml");
});

fixtureTest("alternate LLM owners in an include, duplicate IDs, and unknown tree carriers are refused", async t => {
  const f = await fixture(t, "desktop", "- insert:\n    - id: include-fixture\n      name: cordis:include\n      config: {path: ./included.yml}\n");
  await writeFile(join(f.options.profileDir, "included.yml"), "- id: alternative\n  name: '@deepseek-ai/dsh-llm'\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "ALTERNATE_LLM_OWNER" });
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "- insert:\n    - id: llm\n      name: '@deepseek-ai/dsh-llm'\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "ALTERNATE_ENTRY_OWNER" });
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "- insert:\n    - id: unknown-tree\n      name: fixture-third-party\n      group: true\n      config: []\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "UNSUPPORTED_GROUP_CARRIER" });
});

fixtureTest("recovery is an exact, CAS-protected reference rollback and detects user edits", async t => {
  const f = await fixture(t);
  const applied = await apply(f);
  const input = { ...f.options, projectionName: applied.projectionName };
  const recovery = await planColdProfileRecovery(input);
  await recoverColdProfileMigration({ ...input, expectedRevision: recovery.revision, sourceWriteExclusion: true });
  assert.equal(await readFile(join(f.options.profileDir, "package.json"), "utf8"), f.manifestText);
  const repeated = await planColdProfileRecovery(input);
  assert.equal(repeated.status, "unreferenced");
  assert.equal((await recoverColdProfileMigration({ ...input, expectedRevision: repeated.revision, sourceWriteExclusion: true })).status, "recovered");
  const again = await apply(f);
  await writeFile(join(f.options.profileDir, "package.json"), (await readFile(join(f.options.profileDir, "package.json"), "utf8")).replace("owned-fixture", "concurrent-user-change"));
  await assert.rejects(planColdProfileRecovery({ ...f.options, projectionName: again.projectionName }), { code: "RECOVERY_CONFLICT" });
});

fixtureTest("interrupted preparation remains unreferenced and resumes with an exact source revision", async t => {
  const f = await fixture(t);
  const plan = await planColdProfileMigration(f.options);
  const prepared = await prepareColdProfileMigration({ ...f.options, expectedRevision: plan.revision });
  assert.equal(prepared.status, "prepared");
  assert.equal(await readFile(join(f.options.profileDir, "package.json"), "utf8"), f.manifestText);
  assert.equal(entries(f).find(row => row.id === "llm").name, "@deepseek-ai/dsh-llm");
  const recovery = await planColdProfileRecovery({ ...f.options, projectionName: prepared.projectionName });
  assert.equal(recovery.status, "unreferenced");
  const applied = await applyColdProfileMigration({ ...f.options, projectionName: prepared.projectionName, expectedRevision: plan.revision, sourceWriteExclusion: true });
  assert.equal(applied.projectionName, prepared.projectionName);
  assert.equal(entries(f).find(row => row.id === "llm").name, "@dsmm/dsmm/llm-runtime");
});

fixtureTest("a prepared projection cannot publish after a supported source edit; applied updates require fresh validation", async t => {
  const f = await fixture(t);
  const plan = await planColdProfileMigration(f.options);
  const prepared = await prepareColdProfileMigration({ ...f.options, expectedRevision: plan.revision });
  await writeFile(join(f.options.home, "cordis.patch.yml"), "- id: third-party\n  config: {retained: next-revision}\n");
  const next = await planColdProfileMigration(f.options);
  await assert.rejects(applyColdProfileMigration({ ...f.options, projectionName: prepared.projectionName, expectedRevision: next.revision, sourceWriteExclusion: true }), { code: "SOURCE_CONFLICT" });
  assert.equal(await readFile(join(f.options.profileDir, "package.json"), "utf8"), f.manifestText);
  await apply(f);
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "- id: llm\n  disabled: !!js \"!ctx.get('nextRevision')\"\n");
  const update = await planColdProfileMigration(f.options);
  assert.equal(update.status, "already-applied");
  await applyColdProfileMigration({ ...f.options, expectedRevision: update.revision, sourceWriteExclusion: true });
  assert.equal(entries(f).find(row => row.id === "llm").disabled.__jsExpr, "!ctx.get('nextRevision')");
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "- insert:\n    - id: later-stock\n      name: '@deepseek-ai/dsh-llm'\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "ALTERNATE_LLM_OWNER" });
});

fixtureTest("missing replacement exports and dynamic includes fail before the reference is switched", async t => {
  const f = await fixture(t);
  const packagePath = join(f.options.profileDir, "node_modules", "@dsmm", "dsmm", "package.json");
  const packageText = await readFile(packagePath, "utf8");
  await writeFile(packagePath, JSON.stringify({ name: "@dsmm/dsmm", version: "0.2.2", type: "module", exports: {} }));
  await assert.rejects(planColdProfileMigration(f.options), { code: "UNRESOLVED_ENTRY_MODULE" });
  await writeFile(packagePath, packageText);
  await writeFile(join(f.options.profileDir, "cordis.patch.yml"), "- insert:\n    - id: dynamic-include\n      name: cordis:include\n      config: {path: !!js \"ctx.get('unknown')\"}\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "UNSUPPORTED_INCLUDE" });
  assert.equal(await readFile(join(f.options.profileDir, "package.json"), "utf8"), f.manifestText);
});

fixtureTest("modified owned projection content stops both idempotent apply and recovery", async t => {
  const f = await fixture(t);
  const applied = await apply(f);
  await writeFile(join(f.options.profileDir, "node_modules", applied.projectionName, "cordis.patch.yml"), "[]\n");
  await assert.rejects(planColdProfileMigration(f.options), { code: "OWNED_OUTPUT_CONFLICT" });
  await assert.rejects(planColdProfileRecovery({ ...f.options, projectionName: applied.projectionName }), { code: "OWNED_OUTPUT_CONFLICT" });
});

fixtureTest("symlinked profile sources fail before any publication", async t => {
  const f = await fixture(t);
  const linked = join(f.root, "linked-profile");
  await symlink(f.options.profileDir, linked, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(planColdProfileMigration({ ...f.options, profileDir: linked }), { code: "LINKED_SOURCE_OR_TARGET" });
});

fixtureTest("CLI requires explicit scope, expected revision, and cold-source write exclusion", async t => {
  const f = await fixture(t);
  const args = ["--target", f.options.target, "--profile-dir", f.options.profileDir, "--home", f.options.home, "--install-anchor", installAnchor];
  const plan = await coldProfileMigrationCli(["plan", ...args]);
  await assert.rejects(coldProfileMigrationCli(["apply", ...args, "--expected-revision", plan.revision]), { code: "COLD_SOURCE_WRITE_EXCLUSION_REQUIRED" });
  await assert.rejects(coldProfileMigrationCli(["apply", ...args, "--source-write-exclusion"]), { code: "EXPECTED_REVISION_REQUIRED" });
  assert.equal((await coldProfileMigrationCli(["apply", ...args, "--expected-revision", plan.revision, "--source-write-exclusion"])).status, "applied");
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/migrate-cold-profile.mjs", import.meta.url)), "plan", ...args], { cwd: f.root, env: f.env, encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "already-applied");
});

fixtureTest("original installed dsh CLI consumes the migrated reference and retains third-party effective configuration", async t => {
  const f = await fixture(t, "desktop", "[]\n", { profileName: "fixture-cli", migrateSubagent: true, migrateSessionPersistence: true });
  await apply(f);
  const result = spawnSync(process.execPath, [join(dirname(installAnchor), "lib", "bin.js"), "--profile", "fixture-cli", "--dump-config"], {
    cwd: f.root, env: f.env, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const rows = f.sdk.yaml.load(result.stdout, { schema: f.sdk.include.entryListSchema });
  assert.equal(rows.find(row => row.id === "llm").name, "@dsmm/dsmm/llm-runtime");
  assert.equal(rows.find(row => row.id === "subagent").name, "@dsmm/dsmm/subagent-runtime");
  const persistence = rows.find(row => row.id === "session-persistence-jsonl");
  assert.equal(persistence.name, "@dsmm/dsmm/session-persistence");
  assert.equal(persistence.config.root.__jsExpr, "dshHomePath('sessions')");
  assert.equal(rows.find(row => row.id === "third-party").config.retained, "home-layer");
  assert.equal(rows.find(row => row.id === "tool-pwsh").name, "@dsmm/dsmm/permission-pwsh");
  assert.equal(rows.find(row => row.id === "tool-fs").name, "@dsmm/dsmm/permission-fs");
  assert.equal(rows.find(row => row.id === "tool-fs-search").name, "@dsmm/dsmm/permission-fs-search");
  assert.equal(rows.find(row => row.id === "tool-web").name, "@dsmm/dsmm/permission-web");
});
