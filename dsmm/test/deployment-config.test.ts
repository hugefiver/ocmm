import assert from "node:assert/strict";
import { test } from "node:test";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { Context } from "@deepseek-ai/cordis";
import { apply } from "../lib/index.js";
import { resolveDshHome } from "../lib/dsh-home.js";
import { DsmmDeploymentConfig, editGlobalConfig, parseGlobalConfig } from "../lib/deployment-config.js";
import { DSMM_CONFIG_SCHEMA, DSMM_NATIVE_CONFIG_SCHEMA, copyJson, resolveDeployment } from "../lib/settings.js";
import { nativeRoutingFixture } from "./native-routing-fixture.ts";
import type { DsmmProfileRuntime } from "../lib/profile-runtime.js";
import type { DshAgent } from "../lib/dsh-types.js";
import { DSMM_ROLE_IDS } from "../lib/roles.js";
import { SessionId } from "@deepseek-ai/dsh-session";
import { createDsmmStatusSnapshot } from "../lib/status.js";

test("public home peer resolves from the declared filesystem anchor and honors host > env > default", () => {
  const sdk = createRequire(createRequire(import.meta.url).resolve("@deepseek-ai/dsh-skill-filesystem"));
  assert.equal(sdk("@deepseek-ai/dsh-skill-filesystem/package.json").peerDependencies["@deepseek-ai/dsh-home-paths"], "0.2.0-rc.2");
  const official = sdk("@deepseek-ai/dsh-home-paths") as { resolveDshHome: typeof resolveDshHome };
  assert.equal(resolveDshHome("explicit", { DSH_HOME: "environment" }), resolve("explicit"));
  assert.equal(resolveDshHome(undefined, { DSH_HOME: "environment" }), resolve("environment"));
  assert.equal(resolveDshHome(undefined, {}), official.resolveDshHome(undefined, {}));
});

test("sparse transport, full merge, arrays and exact unset preserve layer semantics and reject unsafe input", () => {
  assert.deepEqual(DSMM_CONFIG_SCHEMA({}), {});
  const refs = DSMM_NATIVE_CONFIG_SCHEMA({}) as unknown as { defaultActive: { get(): unknown } };
  assert.equal(refs.defaultActive.get(), undefined);
  const base = { defaultActive: true, runtimeRecovery: { retryOnStatusCodes: [429, 503] }, guards: { questionLabelHelper: { enabled: false } } };
  const settings = resolveDeployment(base, { defaultActive: false, runtimeRecovery: { retryOnStatusCodes: [] }, guards: { questionLabelHelper: { maxLabelChars: 45 } } });
  assert.equal(settings.defaultActive, false);
  assert.equal(settings.guards.questionLabelHelper.enabled, false);
  assert.equal(settings.guards.questionLabelHelper.maxLabelChars, 45);
  assert.deepEqual(settings.runtimeRecovery.retryOnStatusCodes, []);
  assert.equal(resolveDeployment(base, {}).defaultActive, true);
  const partialRoute = resolveDeployment({ roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture", model: "base-model", reasoningEffort: "high" } } } },
    { roleRouting: { "dsmm-reviewer": { primary: { reasoningEffort: "low" } } } } as never);
  assert.deepEqual(partialRoute.roleRouting["dsmm-reviewer"]?.primary, { provider: "fixture", model: "base-model", reasoningEffort: "low" });
  assert.throws(() => resolveDeployment({}, { roleRouting: { "dsmm-reviewer": { primary: { reasoningEffort: "low" } } } } as never));
  assert.deepEqual(editGlobalConfig(base, [{ op: "unset", path: ["defaultActive"] }]), { runtimeRecovery: base.runtimeRecovery, guards: base.guards });
  for (const value of [{ unknown: true }, { toString: "unknown" }, { skills: { unknown: false } }, { lsp: { args: [undefined] } }, { runtimePolicy: null }, new Date(), { defaultActive: refs.defaultActive }, JSON.parse('{"__proto__":{}}')]) {
    assert.throws(() => resolveDeployment(value as never, {}));
  }
  const accessor = Object.defineProperty({}, "defaultActive", { enumerable: true, get() { throw new Error("must not invoke getter"); } });
  assert.throws(() => copyJson(accessor), /unsafe property/);
  assert.throws(() => editGlobalConfig({}, [{ op: "unset", path: ["unknown"] }]));
  assert.throws(() => parseGlobalConfig('{"defaultActive":true,"defaultActive":false}'));
});

test("two actual Loader entries inherit one global base; volatile pins/unset preserve fibers and old admissions", async () => {
  appendFileSync(join(tmpdir(), "dsmm-c0-journal.jsonl"), `${JSON.stringify({ probe: "two-loader-global-base", time: Date.now() })}\n`);
  const root = mkdtempSync(join(tmpdir(), "dsmm-c0-native-"));
  const marker = join(root, ".run-owner"), owner = `c0:${root}`;
  writeFileSync(marker, owner, { flag: "wx" });
  const home = join(root, "home"), profileA = join(root, "a"), profileB = join(root, "b");
  mkdirSync(profileA); mkdirSync(profileB);
  const hosts: Awaited<ReturnType<typeof nativeRoutingFixture>>[] = [];
  try {
    const roles = Object.fromEntries(DSMM_ROLE_IDS.filter((id) => id !== "dsmm-cross-cutting").map((id) => [id, false]));
    const a = await nativeRoutingFixture({ roles, roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture", model: "baseline-review", reasoningEffort: "high" } } } }, { nativePresets: true, spawn: false, home, profileDir: profileA }); hosts.push(a);
    const b = await nativeRoutingFixture({ roles, defaultActive: false }, { nativePresets: true, spawn: false, home, profileDir: profileB }); hosts.push(b);
    const manager = (f: typeof a) => f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const deployment = (f: typeof a) => f.ctx.get("dsmmDeploymentConfig") as DsmmDeploymentConfig;
    const ordinary = (f: typeof a) => f.create({ agentPreset: "standard" });
    assert.equal(existsSync(join(home, "plugins", "dsmm")), false, "missing reads must not create the central store");
    assert.equal(existsSync(join(profileA, "dsmm-profiles")), false);
    const old = await ordinary(a), oldAdmission = manager(a).admission(old as DshAgent);
    const patchA = JSON.stringify((await deployment(a).readDesired()).profile), patchB = JSON.stringify((await deployment(b).readDesired()).profile);
    const fiberA = a.dsmmFiber.uid, fiberB = b.dsmmFiber.uid;
    let disposed = 0; a.ctx.on("agent/disposed", () => { disposed++; });
    let release!: () => void; const hold = new Promise<void>((done) => { release = done; });
    const busy = old.runMaintenance(async () => hold);
    let saved;
    try {
      saved = await deployment(a).saveGlobal({ expectedRevision: "absent", edits: [{ op: "set", path: ["defaultActive"], value: true }] }, () => {});
      assert.equal(a.dsmmFiber.uid, fiberA); assert.equal(b.dsmmFiber.uid, fiberB); assert.equal(disposed, 0);
      assert.equal(manager(a).getSettings(old as DshAgent).defaultActive, false);
    } finally { release(); await busy; }
    assert.equal(JSON.stringify((await deployment(a).readDesired()).profile), patchA);
    assert.equal(JSON.stringify((await deployment(b).readDesired()).profile), patchB);
    const nextA = await ordinary(a), nextB = await ordinary(b);
    assert.equal(manager(a).getSettings(nextA as DshAgent).defaultActive, true, "omission inherits global");
    assert.equal(manager(b).getSettings(nextB as DshAgent).defaultActive, false, "explicit built-in default overrides global");
    await b.saveDeployment({ roles });
    assert.equal(b.dsmmFiber.uid, fiberB, "volatile-only unset must retain the actual fiber");
    const inheritedB = await ordinary(b);
    assert.equal(manager(b).getSettings(inheritedB as DshAgent).defaultActive, true);
    assert.equal(manager(b).getSettings(nextB as DshAgent).defaultActive, false);
    await b.saveDeployment({ roles: { ...roles, "dsmm-cross-cutting": true }, promptOrder: 123, modeName: "next-deepwork",
      presets: { root: join(root, "desired-presets") }, lsp: { enabled: true, command: "desired-lsp", args: ["desired-argument"] } });
    const constrained = await ordinary(b), constrainedAdmission = manager(b).admission(constrained as DshAgent);
    assert.equal(constrainedAdmission.settings.roles["dsmm-cross-cutting"], false, "desired cannot mount missing startup capability");
    assert.equal(constrainedAdmission.settings.promptOrder, 50);
    assert.ok(constrainedAdmission.restartRequired?.includes("roles.dsmm-cross-cutting"));
    assert.ok(constrainedAdmission.restartRequired?.includes("promptOrder"));
    assert.equal(constrainedAdmission.deployment?.sources["roles.dsmm-cross-cutting"], "profile", "desired provenance remains desired");
    assert.equal(constrainedAdmission.sources?.["roles.dsmm-cross-cutting"], "defaults", "the startup default false supplied the actual role constraint");
    assert.equal(constrainedAdmission.sources?.promptOrder, "defaults");
    assert.equal(constrainedAdmission.sources?.modeName, "defaults");
    assert.equal(constrainedAdmission.sources?.["lsp.enabled"], "defaults");
    assert.equal(constrainedAdmission.sources?.["lsp.command"], "defaults");
    assert.equal(constrainedAdmission.sources?.["presets.root"], "profile");
    assert.equal(constrainedAdmission.sourceCaptures?.fields["roles.dsmm-cross-cutting"], "startup");
    assert.equal(constrainedAdmission.sourceCaptures?.fields.promptOrder, "startup");
    assert.equal(constrainedAdmission.sourceCaptures?.startup?.globalRevision, manager(b).admission().deployment?.globalRevision);
    const status = createDsmmStatusSnapshot({ agent: constrained as DshAgent, settings: constrainedAdmission.settings, modeActive: false, admission: constrainedAdmission });
    assert.equal(status.deployment?.sources.promptOrder, "defaults");
    assert.equal(status.deployment?.sourceCaptures?.fields.promptOrder, "startup");
    assert.notEqual(status.deployment?.sourceCaptures?.fields, constrainedAdmission.sourceCaptures?.fields);
    assert.equal(manager(b).getStartupSettings().defaultActive, false);
    assert.equal(manager(a).getSettings().defaultActive, false, "no-argument getter is not raw latest desired");
    const child = await a.create({ origin: "subagent" }, undefined, { parentAgent: old });
    assert.equal(manager(a).admission(child as DshAgent), oldAdmission, "future child inherits the old complete deployment/epoch");
    const draft = await manager(a).save({ id: "runtime-overlay", expectedRevision: null, content: '{"version":1,"id":"runtime-overlay","settings":{"workflow":{"reviewCap":2},"roleRouting":{"dsmm-reviewer":{"primary":{"provider":"fixture","model":"overlay-review"}}}}}' });
    const before = await manager(a).getSession(old as DshAgent);
    await manager(a).selectSession({ sessionId: old.id, id: draft.id, expectedRevision: draft.revision,
      expectedSelectionRevision: before.selection.selectionRevision, expectedAdmissionEpoch: before.admissionEpoch }, old as DshAgent);
    assert.equal(manager(a).getSettings(old as DshAgent).defaultActive, false, "idle named switch must not absorb newer global");
    assert.equal(manager(a).admission(old as DshAgent).deployment?.globalRevision, oldAdmission.deployment?.globalRevision);
    const overlaid = manager(a).admission(old as DshAgent);
    assert.equal(Object.hasOwn(overlaid.settings.roleRouting["dsmm-reviewer"]!.primary!, "reasoningEffort"), false);
    assert.equal(Object.hasOwn(overlaid.sources!, "roleRouting.dsmm-reviewer.primary.reasoningEffort"), false, "complete primary replacement removes lower-only provenance");
    assert.equal(Object.hasOwn(overlaid.sourceCaptures!.fields, "roleRouting.dsmm-reviewer.primary.reasoningEffort"), false);
    assert.equal(overlaid.sources!["roleRouting.dsmm-reviewer.primary.provider"], "named-session");
    await assert.rejects(deployment(b).saveGlobal({ expectedRevision: "absent", edits: [] }, () => {}), { code: "conflict" });
    const configPath = join(home, "plugins", "dsmm", "config.json");
    writeFileSync(configPath, '{"unknown":true}');
    await assert.rejects(ordinary(a));
    const invalidStartupProfile = join(root, "invalid-startup-profile");
    mkdirSync(invalidStartupProfile);
    const invalidCtx = new Context();
    invalidCtx.provide("profileContext", { home, dir: invalidStartupProfile });
    try {
      await assert.rejects(apply(invalidCtx as never, { roles }) as Promise<void>, { code: "validation" });
      assert.equal(invalidCtx.get("dsmmProfileRuntime"), undefined, "startup validation precedes runtime mounting");
    } finally { await invalidCtx.fiber.dispose(); }
    assert.equal(existsSync(join(invalidStartupProfile, "dsmm-profiles")), false, "invalid startup cannot initialize a legacy/default library");
    await assert.rejects(deployment(a).saveGlobal({ expectedRevision: saved!.revision, edits: [] }, () => {}));
    assert.equal(readFileSync(configPath, "utf8"), '{"unknown":true}');
    assert.equal(manager(a).getSettings(nextA as DshAgent).defaultActive, true, "invalid desired never invalidates existing admission");
  } finally {
    for (const host of hosts.reverse()) await host.dispose();
    assert.equal(readFileSync(marker, "utf8"), owner); rmSync(root, { recursive: true, force: true });
  }
});

test("direct Cordis remount restores the same central selection and session pin after different fiber allocation", async () => {
  appendFileSync(join(tmpdir(), "dsmm-c0-journal.jsonl"), `${JSON.stringify({ probe: "stable-direct-namespace", time: Date.now() })}\n`);
  const root = mkdtempSync(join(tmpdir(), "dsmm-c0-direct-"));
  const owner = `c0-direct:${root}`, marker = join(root, ".run-owner");
  writeFileSync(marker, owner, { flag: "wx" });
  const home = join(root, "home"), profileDir = join(root, "profile"); mkdirSync(profileDir);
  let first: Awaited<ReturnType<typeof nativeRoutingFixture>> | undefined;
  let second: Awaited<ReturnType<typeof nativeRoutingFixture>> | undefined;
  try {
    first = await nativeRoutingFixture({}, { home, profileDir, spawn: false });
    const manager = (f: NonNullable<typeof first>) => f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const initial = manager(first);
    const defaultDraft = await initial.save({ id: "direct-default", expectedRevision: null, content: '{"version":1,"id":"direct-default","settings":{"workflow":{"reviewCap":1}}}' });
    const sessionDraft = await initial.save({ id: "direct-session", expectedRevision: null, content: '{"version":1,"id":"direct-session","settings":{"workflow":{"reviewCap":3}}}' });
    await initial.select({ id: defaultDraft.id, expectedRevision: defaultDraft.revision, expectedSelectionRevision: "absent" });
    const stableId = SessionId("direct-reopen-session");
    const agent = await first.create({}, undefined, { sessionId: stableId });
    const before = await initial.getSession(agent as DshAgent);
    const selected = await initial.selectSession({ sessionId: stableId, id: sessionDraft.id, expectedRevision: sessionDraft.revision,
      expectedSelectionRevision: before.selection.selectionRevision, expectedAdmissionEpoch: before.admissionEpoch }, agent as DshAgent);
    const captured = initial.admission(agent as DshAgent).deployment!, originalFiber = first.dsmmFiber.uid;
    await first.dispose(); first = undefined;
    second = await nativeRoutingFixture({}, { home, profileDir, spawn: false, async beforeDsmm(ctx) {
      await ctx.plugin({ name: "direct-allocation-shift", apply() {} }).await();
    } });
    assert.notEqual(second.dsmmFiber.uid, originalFiber);
    const reopened = manager(second);
    assert.equal(reopened.admission().deployment?.entryId, captured.entryId);
    assert.equal(reopened.admission().deployment?.hostProfileKey, captured.hostProfileKey);
    assert.equal((await reopened.describe()).appliedRevision, defaultDraft.revision);
    const resumed = await second.create({}, undefined, { sessionId: stableId });
    assert.equal(reopened.admission(resumed as DshAgent).profile?.revision, sessionDraft.revision);
    assert.equal(reopened.admission(resumed as DshAgent).epoch, selected.admissionEpoch);
    assert.equal(reopened.getSettings(resumed as DshAgent).workflow.reviewCap, 3);
  } finally {
    await second?.dispose(); await first?.dispose();
    assert.equal(readFileSync(marker, "utf8"), owner); rmSync(root, { recursive: true, force: true });
  }
});
