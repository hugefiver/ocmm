import assert from "node:assert/strict";
import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { ReasoningEffortId, ToolCallId } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import type { ResolvedSubagentStartRequest, SubagentProvider } from "@deepseek-ai/dsh-subagent";
import { renderPrompt } from "@deepseek-ai/dsh-system-prompt";
import { registerDsmmStatusCommand } from "../lib/commands.js";
import type { DshAgent, DshCommandsRegistry, DshContext } from "../lib/dsh-types.js";
import { createProfileRuntime, DsmmProfileRuntime } from "../lib/profile-runtime.js";
import { ProfileStore } from "../lib/profile-store.js";
import { resolveConfig } from "../lib/settings.js";
import type { DsmmPluginConfig } from "../lib/settings.js";
import { DeepworkModeController } from "../lib/state.js";
import { headerRoutes, nativeRoutingFixture, runFixtureTurn } from "./native-routing-fixture.ts";

function profile(id: string, settings: DsmmPluginConfig): string {
  return JSON.stringify({ version: 1, id, settings });
}

function mockAgent(id: string): DshAgent {
  return { id, session: { events: [], append() {} } };
}

test("two Hosts sharing a profile store report external selection conflicts without silently admitting disk settings", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "dsmm-profile-runtime-"));
  const storeDir = join(rootDir, "dsmm-profiles");
  const hostA = new DsmmProfileRuntime({}, resolveConfig(), new ProfileStore(storeDir));
  try {
    await hostA.initialize();
    const a = await hostA.save({ id: "a", content: profile("a", { defaultActive: true }), expectedRevision: null });
    await hostA.select({ id: "a", expectedRevision: a.revision, expectedSelectionRevision: "absent" });
    const existingA = mockAgent("existing-a-root");
    const admittedA = hostA.getSettings(existingA);
    const hostB = new DsmmProfileRuntime({}, resolveConfig(), new ProfileStore(storeDir));
    await hostB.initialize();
    const b = await hostB.save({ id: "b", content: profile("b", { defaultActive: false }), expectedRevision: null });
    const selectedB = await hostB.select({ id: "b", expectedRevision: b.revision, expectedSelectionRevision: (await hostB.describe()).selectionRevision });
    const conflict = await hostA.describe();
    assert.equal(conflict.selectedId, "a", "Host A must not claim the externally selected B policy is admitted here");
    assert.equal(conflict.appliedRevision, a.revision);
    assert.equal(conflict.selectionRevision, selectedB.selectionRevision, "the actual persisted revision remains available for safe reconciliation");
    assert.equal(conflict.selectionError?.code, "conflict");
    assert.match(conflict.selectionError?.message ?? "", /outside this Host.*reapply.*restart/iu);
    const whileConflicted = mockAgent("new-a-root-during-conflict");
    assert.equal(hostA.getSettings(whileConflicted), admittedA);
    assert.equal(hostA.getSettings().defaultActive, true);
    const reconciled = await hostA.select({ id: "b", expectedRevision: b.revision, expectedSelectionRevision: conflict.selectionRevision });
    assert.equal(reconciled.selectedId, "b");
    assert.equal(reconciled.selectionError, undefined);
    assert.equal(hostA.getSettings(mockAgent("new-b-root")).defaultActive, false);
    assert.equal(hostA.getSettings(existingA), admittedA);
    assert.equal(hostA.getSettings(whileConflicted), admittedA);
  } finally { rmSync(rootDir, { recursive: true, force: true }); }
});

test("selection reports a post-commit external pointer change as a Host conflict and can reconcile without queue deadlock", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "dsmm-profile-runtime-"));
  const storeDir = join(rootDir, "dsmm-profiles");
  class SelectionRaceStore extends ProfileStore {
    beforeDescribe?: () => Promise<void>;
    override async describe() {
      const before = this.beforeDescribe;
      this.beforeDescribe = undefined;
      await before?.();
      return super.describe();
    }
  }
  const storeA = new SelectionRaceStore(storeDir);
  const hostA = new DsmmProfileRuntime({}, resolveConfig(), storeA);
  const hostB = new DsmmProfileRuntime({}, resolveConfig(), new ProfileStore(storeDir));
  try {
    await hostA.initialize(); await hostB.initialize();
    const a = await hostA.save({ id: "a", content: profile("a", { defaultActive: true }), expectedRevision: null });
    const b = await hostB.save({ id: "b", content: profile("b", { defaultActive: false }), expectedRevision: null });
    storeA.beforeDescribe = async () => {
      const disk = await new ProfileStore(storeDir).describe();
      await hostB.select({ id: "b", expectedRevision: b.revision, expectedSelectionRevision: disk.selectionRevision });
    };
    const selected = await hostA.select({ id: "a", expectedRevision: a.revision, expectedSelectionRevision: "absent" });
    assert.equal(selected.selectedId, "a", "the response identifies the Host-admitted policy, not the later external pointer");
    assert.equal(selected.appliedRevision, a.revision);
    assert.equal(selected.selectionError?.code, "conflict", "a post-commit race cannot be reported as an unqualified successful selection");
    assert.equal(selected.selectionRevision, (await hostB.describe()).selectionRevision);
    const oldA = mockAgent("post-commit-a-root");
    assert.equal(hostA.getSettings(oldA).defaultActive, true);
    const reconciled = await hostA.select({ id: "b", expectedRevision: b.revision, expectedSelectionRevision: selected.selectionRevision });
    assert.equal(reconciled.selectedId, "b");
    assert.equal(reconciled.selectionError, undefined);
    assert.equal(hostA.getSettings(mockAgent("post-reconcile-b-root")).defaultActive, false);
    assert.equal(hostA.getSettings(oldA).defaultActive, true);
  } finally { rmSync(rootDir, { recursive: true, force: true }); }
});

test("profile admission is immutable for existing and blank roots, and trusted children inherit the parent revision", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "dsmm-profile-runtime-"));
  const store = new ProfileStore(join(rootDir, "dsmm-profiles"));
  const agents: DshAgent[] = [];
  const owners = new Map<string, DshAgent>();
  let created: ((payload: { agent: DshAgent }) => unknown) | undefined;
  const ctx: DshContext = {
    get(name) { return (name === "agents" ? { list: () => agents, isOwnedBy: (id: string, owner: DshAgent) => owners.get(id) === owner } : undefined) as never; },
    on(event, listener) { if (event === "agent/created") created = listener as typeof created; }
  };
  const runtime = new DsmmProfileRuntime(ctx, resolveConfig({ roles: { "dsmm-builder": false } }), store, { validateCandidate() {} });
  try {
    await runtime.initialize();
    const a = await runtime.save({ id: "a", content: profile("a", { defaultActive: true, guards: { gitWriteGuard: "deny" } }), expectedRevision: null });
    await runtime.select({ id: "a", expectedRevision: a.revision, expectedSelectionRevision: "absent" });
    const root = mockAgent("a-root");
    const blank = mockAgent("a-blank");
    agents.push(root, blank);
    await created!({ agent: root }); await created!({ agent: blank });
    const admitted = runtime.getSettings(root);
    assert.equal(Object.isFrozen(admitted), true);
    assert.equal(Object.isFrozen(admitted.guards.toolOutputTruncation), true);
    const b = await runtime.save({ id: "b", content: profile("b", { defaultActive: false, guards: { gitWriteGuard: "off" } }), expectedRevision: null });
    assert.equal(runtime.getSettings().defaultActive, true, "saving is draft-only");
    await runtime.select({ id: "b", expectedRevision: b.revision, expectedSelectionRevision: (await runtime.describe()).selectionRevision });
    const child = mockAgent("a-child");
    agents.push(child); owners.set(child.id!, root);
    await created!({ agent: child });
    const newest = mockAgent("b-root"); agents.push(newest); await created!({ agent: newest });
    assert.equal(runtime.getSettings(root), admitted);
    assert.equal(runtime.getSettings(blank), admitted, "blank preset selection cannot change admitted runtime settings");
    assert.equal(runtime.getSettings(child), admitted);
    assert.equal(runtime.admission(child).appliedRevision, a.revision);
    assert.equal(runtime.getSettings(newest).defaultActive, false);
    assert.equal(runtime.getSettings(newest).roles["dsmm-builder"], false);
    const edited = await runtime.save({ id: "b", content: profile("b", { defaultActive: true }), expectedRevision: b.revision });
    assert.notEqual(edited.revision, b.revision);
    assert.equal(runtime.getSettings(newest).defaultActive, false, "active draft edits never mutate a pinned snapshot");
    const cold = new DsmmProfileRuntime({}, resolveConfig({ roles: { "dsmm-builder": false } }), store);
    await cold.initialize();
    assert.equal(cold.getSettings(mockAgent("cold-resume")).defaultActive, false, "restart follows immutable applied bytes, not the edited draft");
    assert.equal(cold.admission(mockAgent("another-resume")).appliedRevision, b.revision);
  } finally { rmSync(rootDir, { recursive: true, force: true }); }
});

test("semantic activation and atomic selection-pointer failures leave the runtime and durable selection unchanged", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "dsmm-profile-runtime-"));
  let failPointer = false;
  let rejectCandidate = false;
  const store = new ProfileStore(join(rootDir, "dsmm-profiles"), {
    rename(source, destination) {
      if (failPointer && basename(destination) === ".selection.json") throw new Error("private-io-fixture");
      renameSync(source, destination);
    }
  });
  const runtime = new DsmmProfileRuntime({}, resolveConfig(), store, { validateCandidate() { if (rejectCandidate) throw new Error("rejected semantic candidate"); } });
  try {
    await runtime.initialize();
    const a = await runtime.save({ id: "a", content: profile("a", { defaultActive: true }), expectedRevision: null });
    await runtime.select({ id: "a", expectedRevision: a.revision, expectedSelectionRevision: "absent" });
    const before = await store.loadSelection();
    const settings = runtime.getSettings();
    const b = await runtime.save({ id: "b", content: profile("b", { defaultActive: false }), expectedRevision: null });
    const select = () => runtime.select({ id: "b", expectedRevision: b.revision, expectedSelectionRevision: before.selectionRevision });
    rejectCandidate = true;
    await assert.rejects(select());
    assert.equal(runtime.getSettings(), settings);
    assert.deepEqual(await store.loadSelection(), before);
    rejectCandidate = false; failPointer = true;
    await assert.rejects(select());
    assert.equal(runtime.getSettings(), settings);
    assert.deepEqual(await store.loadSelection(), before);
    failPointer = false;
    await select();
    assert.equal(runtime.getSettings().defaultActive, false, "a failed operation does not poison later selections");
  } finally { rmSync(rootDir, { recursive: true, force: true }); }
});

test("native profile installation requires profileContext.dir and never invents a home location", async () => {
  await assert.rejects(createProfileRuntime({ get: () => undefined }, resolveConfig()), { code: "activation" });
  await assert.rejects(createProfileRuntime({ get: () => ({ startedBundles: [] }) as never }, resolveConfig()), { code: "activation" });
});

test("native global A-to-B switching retains A child routes, startup-locked failures, guards and immutable cold admission", async () => {
  const profileDir = mkdtempSync(join(tmpdir(), "dsmm-profile-runtime-"));
  let fixture = await nativeRoutingFixture({ roles: { "dsmm-builder": false } }, { headless: true, profileDir });
  try {
    const runtime = (fixture.ctx as unknown as DshContext).get!<DsmmProfileRuntime>("dsmmProfileRuntime");
    assert.ok(runtime);
    await fixture.create(); // Genuine Agent-local LLM admission for UI activation.
    const route = (model: string) => ({ provider: "fixture", model, reasoningEffort: "high" });
    const a = await runtime.save({ id: "a", expectedRevision: null, content: profile("a", {
      defaultActive: true, workflow: { policy: "legacy", reviewCap: 2 }, guards: { scope: "always", gitWriteGuard: "deny" }, runtimeRecovery: { enabled: true },
      roleRouting: { "dsmm-orchestrator": { primary: route("root-a"), fallbackRoutes: [route("backup-a")] }, "dsmm-reviewer": { primary: route("review-a") } }
    }) });
    await runtime.select({ id: "a", expectedRevision: a.revision, expectedSelectionRevision: "absent" });
    const parent = await fixture.create({ agentPreset: "dsmm-orchestrator" });
    const blank = await fixture.create({ agentPreset: "standard" });
    const b = await runtime.save({ id: "b", expectedRevision: null, content: profile("b", {
      defaultActive: true, workflow: { policy: "legacy", reviewCap: 4 }, guards: { scope: "always", gitWriteGuard: "off" }, runtimeRecovery: { enabled: true },
      roleRouting: { "dsmm-orchestrator": { primary: route("root-b"), fallbackRoutes: [route("backup-b")] }, "dsmm-reviewer": { primary: route("review-b") }, "dsmm-builder": { primary: route("disabled-builder") } }
    }) });
    fixture.adapter.failModels.add("native-default");
    let switched = false;
    fixture.adapter.beforeStream = async (call) => {
      if (call.model === "native-default" && !switched) {
        switched = true;
        await runtime.select({ id: "b", expectedRevision: b.revision, expectedSelectionRevision: (await runtime.describe()).selectionRevision });
      }
    };
    await runFixtureTurn(parent);
    assert.equal(switched, true);
    assert.deepEqual(headerRoutes(parent).map((value) => value.model), ["native-default"], "ordinary-root failures retain the native model rather than imply profile routing");
    assert.equal(runtime.admission(parent as unknown as DshAgent).appliedRevision, a.revision);
    const child = await fixture.subagents.start("dsmm-role-reviewer", {
      parent, prompt: [{ type: "text", text: "Complete local profile inheritance fixture" }],
      toolFilter: { allow: ["read", "glob", "grep"] }, persona: "spoofed dsmm-orchestrator", signal: new AbortController().signal
    });
    let persistedChild: ReturnType<typeof parent.session.snapshotEvents>;
    try {
      assert.equal((await child.result).stopReason, "completed");
      assert.ok(child.localAgent);
      assert.equal(headerRoutes(child.localAgent).at(-1)?.model, "review-a");
      assert.equal(runtime.admission(child.localAgent as unknown as DshAgent).appliedRevision, a.revision);
      persistedChild = JSON.parse(JSON.stringify(child.localAgent.session.snapshotEvents()));
      const denied = await child.localAgent.ctx.get("tools")!.execute({ callId: ToolCallId("profile-child-deny"), name: "write", arguments: {}, agent: child.localAgent, signal: new AbortController().signal });
      assert.equal(denied.isError, true);
    } finally { await child.dispose(); }
    const newRoot = await fixture.create({ agentPreset: "dsmm-orchestrator" });
    await runFixtureTurn(newRoot);
    assert.equal(headerRoutes(newRoot).at(-1)?.model, "native-default");
    assert.equal(runtime.getSettings(newRoot as unknown as DshAgent).roles["dsmm-builder"], false);
    assert.equal(fixture.subagents.getProvider("dsmm-role-builder"), undefined);
    blank.session.append("agent-preset/selected", { agentPreset: "dsmm-orchestrator" });
    fixture.ctx.emit("agent-preset/selected", blank.id, "dsmm-orchestrator");
    await runFixtureTurn(blank);
    assert.equal(headerRoutes(blank).at(-1)?.model, "native-default", "changing the native preset does not apply the profile's declared model");
    const executeGit = (agent: typeof parent) => agent.ctx.get("tools")!.execute({ callId: ToolCallId(`profile-guard-${agent.id}`), name: "bash", arguments: { command: "git commit -m never-executed-by-fixture" }, agent, signal: new AbortController().signal });
    assert.equal((await executeGit(parent)).isError, true);
    assert.equal((await executeGit(newRoot)).isError, false);
    assert.match(renderPrompt(await parent.ctx.get("systemPrompt")!.assemble({ agent: parent, scope: parent })), /reviewCap: 2/u);
    assert.match(renderPrompt(await newRoot.ctx.get("systemPrompt")!.assemble({ agent: newRoot, scope: newRoot })), /reviewCap: 4/u);
    let status: Parameters<DshCommandsRegistry["register"]>[0] | undefined;
    registerDsmmStatusCommand({ commands: { register(command) { status = command; } } }, new DeepworkModeController({}), runtime.getSettings);
    const statusA = await status!.handler({ agent: parent as unknown as DshAgent, rawInput: "json" });
    const statusB = await status!.handler({ agent: newRoot as unknown as DshAgent, rawInput: "json" });
    assert.equal(JSON.parse(statusA.text!).effectiveSettings.workflow.reviewCap, 2);
    assert.equal(JSON.parse(statusB.text!).effectiveSettings.workflow.reviewCap, 4);
    const persisted = JSON.parse(JSON.stringify(parent.session.snapshotEvents()));
    await fixture.dispose();
    fixture = await nativeRoutingFixture({ roles: { "dsmm-builder": false } }, { headless: true, profileDir });
    const cold = (fixture.ctx as unknown as DshContext).get!<DsmmProfileRuntime>("dsmmProfileRuntime")!;
    const restored = await fixture.create({ agentPreset: "dsmm-orchestrator" }, undefined, { seed: persisted });
    await runFixtureTurn(restored);
    assert.equal(headerRoutes(restored).at(-1)?.model, "native-default", "cold profile admission still leaves the ordinary root model native-owned");
    assert.equal(cold.admission(restored as unknown as DshAgent).appliedRevision, b.revision);
    const restoredChild = await fixture.create({ origin: "subagent", agentPreset: "dsmm-orchestrator" }, undefined, { seed: persistedChild });
    await runFixtureTurn(restoredChild);
    assert.equal(headerRoutes(restoredChild).at(-1)?.model, "review-b", "the cold unowned role child has no live alias preflight and resolves the currently selected B primary");
    assert.equal(cold.admission(restoredChild as unknown as DshAgent).appliedRevision, b.revision);
  } finally { await fixture.dispose(); rmSync(profileDir, { recursive: true, force: true }); }
});

test("native profile activation rejects unsupported exact effort and missing Agent LLM before changing the pointer", async () => {
  const fixture = await nativeRoutingFixture();
  try {
    const runtime = (fixture.ctx as unknown as DshContext).get!<DsmmProfileRuntime>("dsmmProfileRuntime")!;
    const bad = await runtime.save({ id: "bad", expectedRevision: null, content: profile("bad", { roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture", model: "no-max", reasoningEffort: "max" } } } }) });
    // This fixture has a real Host LLM; remove it from the validation seam to
    // model the native preset-only Host, where LLM services exist only in Agents.
    const rootDir = mkdtempSync(join(tmpdir(), "dsmm-profile-runtime-"));
    try {
      const noAgent = new DsmmProfileRuntime({ get: () => undefined }, resolveConfig(), new ProfileStore(join(rootDir, "dsmm-profiles")));
      await noAgent.initialize();
      const draft = await noAgent.save({ id: "bad", expectedRevision: null, content: bad.content });
      await assert.rejects(noAgent.select({ id: "bad", expectedRevision: draft.revision, expectedSelectionRevision: "absent" }), { code: "activation" });
      assert.equal((await noAgent.describe()).selectedId, null);
    } finally { rmSync(rootDir, { recursive: true, force: true }); }
    await fixture.create();
    fixture.adapter.unsupportedMaxModels.add("no-max");
    await assert.rejects(runtime.select({ id: "bad", expectedRevision: bad.revision, expectedSelectionRevision: "absent" }), { code: "activation", field: "settings.roleRouting.dsmm-reviewer.primary" });
    assert.equal((await runtime.describe()).selectedId, null);
    assert.equal(runtime.getSettings().roleRouting["dsmm-reviewer"], undefined);
  } finally { await fixture.dispose(); }
});

test("native role alias preflights exact parent-profile route before child creation and preserves explicit request priority", async () => {
  const fixture = await nativeRoutingFixture({ defaultActive: true, roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture", model: "review-preflight", reasoningEffort: "max" } } } });
  try {
    const parent = await fixture.create();
    fixture.adapter.unsupportedMaxModels.add("review-preflight");
    const count = fixture.agents.list().length;
    await assert.rejects(fixture.subagents.start("dsmm-role-reviewer", { parent, prompt: [{ type: "text", text: "bounded local preflight" }], signal: new AbortController().signal }), /reasoning effort/u);
    assert.equal(fixture.agents.list().length, count, "unsupported effort rejects before native child allocation");
    assert.equal(fixture.adapter.calls.length, 0);
    await fixture.spawnFiber!.dispose();
    let accepted: ResolvedSubagentStartRequest | undefined;
    const provider: SubagentProvider = {
      name: "spawn", inheritsParentContext: false,
      capabilities: { agentOptions: true, outputSchema: true, depthLimit: true, toolFilter: true, persona: true },
      async start(request) {
        accepted = request;
        return { id: SessionId("profile-forwarding-fixture"), localAgent: undefined, result: Promise.resolve({ output: [], stopReason: "completed" }), async dispose() {} };
      }
    };
    const remove = fixture.subagents.registerProvider(provider);
    try {
      const signal = new AbortController().signal;
      const filter = { allow: ["read"] };
      const outputSchema = { type: "object" as const, properties: {} };
      const run = await fixture.subagents.start("dsmm-role-reviewer", { parent, prompt: [{ type: "text", text: "forward exact native authority" }], signal, agentOptions: { provider: "fixture", model: "explicit-route", reasoningEffort: ReasoningEffortId("low"), maxTokens: 30 }, toolFilter: filter, persona: "native persona", outputSchema, maxDepth: 2 });
      assert.ok(accepted);
      assert.deepEqual(accepted.agentOptions, { provider: "fixture", model: "explicit-route", reasoningEffort: "low", maxTokens: 30 });
      assert.equal(accepted.parent, parent);
      assert.equal(accepted.signal, signal);
      assert.deepEqual(accepted.toolFilter, filter);
      assert.equal(accepted.persona, "native persona");
      assert.deepEqual(accepted.outputSchema, outputSchema);
      assert.equal(accepted.maxDepth, 2);
      assert.equal(accepted.descriptor.provider, "dsmm-role-reviewer");
      await run.dispose();
    } finally { remove(); }
  } finally { await fixture.dispose(); }
});
