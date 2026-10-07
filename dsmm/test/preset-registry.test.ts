import assert from "node:assert/strict";
import { test } from "node:test";
import { registerRolePresets } from "../lib/preset-registry.js";
import { DSMM_ROLES, DSMM_ROLE_IDS, isRootRole } from "../lib/roles.js";
import { DEFAULT_DSMM_SETTINGS, resolveConfig } from "../lib/settings.js";
import type { DshContext } from "../lib/dsh-types.js";

test("native DSH registration declares enabled root roles and keeps auxiliary child tools", async () => {
  const definitions: Array<{ id: string; name: string; plugins: Array<{ name: string; config?: Record<string, unknown> }> }> = [];
  const registry = {
    async register(definition: typeof definitions[number]) {
      definitions.push(definition);
      return async () => {};
    },
    composedPreset() { return undefined; }
  };
  let installer: ((ctx: DshContext) => unknown) | undefined;
  const root: DshContext = {
    inject(dependencies, callback) {
      assert.deepEqual(dependencies, ["agentPresets"]);
      installer = callback;
    }
  };
  registerRolePresets(root, () => DEFAULT_DSMM_SETTINGS);
  assert.ok(installer);
  await installer({ get: (name) => (name === "agentPresets" ? registry : name === "agents" ? { list: () => [], get: () => undefined } : { guard: () => () => {} }) as never, on() {} });

  assert.deepEqual(definitions.map((item) => item.id), ["dsmm-orchestrator", "dsmm-planner", "dsmm-builder"]);
  assert.deepEqual(definitions.map((item) => item.name), ["DW Orchestrator", "DW Planner", "DW Builder"]);
  assert.equal(definitions.some((item) => DSMM_ROLES.some((role) => role.id === item.id && !isRootRole(role))), false);
  const orchestrator = definitions[0];
  assert.ok(orchestrator);
  const enabledChildren = DSMM_ROLE_IDS.filter((id) => id !== "dsmm-orchestrator" && DEFAULT_DSMM_SETTINGS.roles[id]);
  assert.equal(orchestrator.plugins.filter((item) => item.name === "@deepseek-ai/dsh-tool-subagent").length, enabledChildren.length);
  assert.deepEqual(orchestrator.plugins.filter((item) => item.name === "@deepseek-ai/dsh-tool-subagent").map((item) => item.config?.toolName), enabledChildren.map((id) => id.replace(/-/gu, "_")));
  const planTool = orchestrator.plugins.find((item) => item.config?.toolName === "dsmm_plan_critic");
  assert.deepEqual(planTool?.config?.toolFilter, { allow: ["read", "glob", "grep"] });
  assert.equal(orchestrator.plugins.some((item) => item.name === "@deepseek-ai/dsh-tool-fs"), true);
  assert.equal("roots" in orchestrator, false);
});

test("disabled roles have neither native preset declarations nor callable child tools", async () => {
  const definitions: Array<{ id: string; plugins: Array<{ config?: Record<string, unknown> }> }> = [];
  let installer: ((ctx: DshContext) => unknown) | undefined;
  registerRolePresets({ inject(_deps, callback) { installer = callback; } }, () => ({
    ...DEFAULT_DSMM_SETTINGS,
    roles: { ...DEFAULT_DSMM_SETTINGS.roles, "dsmm-builder": false, "dsmm-oracle": false }
  }));
  assert.ok(installer);
  await installer({
    get: (name) => (name === "agentPresets" ? {
      async register(definition: typeof definitions[number]) { definitions.push(definition); return async () => {}; },
      composedPreset() { return undefined; }
    } : name === "agents" ? { list: () => [], get: () => undefined } : { guard: () => () => {} }) as never,
    on() {}
  });
  assert.equal(definitions.some((item) => item.id === "dsmm-builder" || item.id === "dsmm-oracle"), false);
  assert.deepEqual(definitions.map((item) => item.id), ["dsmm-orchestrator", "dsmm-planner"]);
  const orchestrator = definitions.find((item) => item.id === "dsmm-orchestrator");
  assert.ok(orchestrator);
  assert.equal(orchestrator.plugins.some((item) => item.config?.toolName === "dsmm_builder" || item.config?.toolName === "dsmm_oracle"), false);
});

test("enabled auxiliary roles alone do not create native root presets", async () => {
  const definitions: unknown[] = [];
  let installer: ((ctx: DshContext) => unknown) | undefined;
  registerRolePresets({ inject(_deps, callback) { installer = callback; } }, () => resolveConfig({
    roles: { "dsmm-orchestrator": false, "dsmm-planner": false, "dsmm-builder": false }
  }));
  assert.ok(installer);
  await installer({
    get: (name) => (name === "agentPresets" ? {
      async register(definition: unknown) { definitions.push(definition); return async () => {}; },
      composedPreset() { return undefined; }
    } : name === "agents" ? { list: () => [], get: () => undefined } : undefined) as never,
    on() {}
  });
  assert.deepEqual(definitions, []);
});

test("read-only restriction follows native blank preset switches without sticking to a write role", async () => {
  const events = new Map<string, (...args: any[]) => unknown>();
  let installer: ((ctx: DshContext) => unknown) | undefined;
  let selected: string = "dsmm-builder";
  const registry = {
    async register() { return async () => {}; },
    composedPreset() { return selected; }
  };
  const filters: unknown[] = [];
  let active = 0;
  let guard: ((execution: { name: string; agent?: unknown }) => string | undefined) | undefined;
  const agent = { ctx: { tools: {
    restrict(filter: unknown) { filters.push(filter); active++; return () => { active--; }; },
    guard(callback: (execution: { name: string; agent?: unknown }) => string | undefined) { guard = callback; return () => {}; }
  } } };
  registerRolePresets({ inject(_deps, callback) { installer = callback; } }, () => DEFAULT_DSMM_SETTINGS);
  assert.ok(installer);
  await installer({
    get: (name) => (name === "agentPresets" ? registry : name === "agents" ? { list: () => [agent], get: () => agent } : undefined) as never,
    on(event, callback, options) {
      assert.deepEqual(options, { global: true });
      events.set(event, callback);
    }
  });
  assert.deepEqual([...events.keys()].sort(), ["agent-preset/selected", "agent/created", "agent/disposed", "tools/change"]);
  events.get("agent/created")?.({ agent });
  assert.equal(active, 0);
  selected = "dsmm-plan-critic";
  events.get("tools/change")?.();
  assert.deepEqual(filters, [{ deny: ["write", "edit"] }]);
  assert.equal(active, 1);
  assert.ok(guard);
  assert.match(guard({ name: "write", agent }) ?? "", /read-only role/u);
  assert.match(guard({ name: "dsmm_builder", agent }) ?? "", /read-only role/u);
  assert.equal(guard({ name: "read", agent }), undefined);
  events.get("agent-preset/selected")?.("session-id");
  assert.equal(active, 1, "duplicate signals cannot stack restrictions");
  selected = "dsmm-builder";
  events.get("tools/change")?.();
  assert.equal(active, 0, "returning to builder lifts the prior read-only mask");
  assert.equal(guard({ name: "write", agent }), undefined);
  selected = "dsmm-reviewer";
  agent.ctx = {} as typeof agent.ctx;
  assert.throws(() => events.get("tools/change")?.(), /requires DSH tools guard\/restrict/u);
  assert.match(guard({ name: "write", agent }) ?? "", /read-only role/u);
  events.get("agent/disposed")?.({ agent });
});

test("native preset child inventory is profile-invariant and retains deployment disablement", async () => {
  const primary = { provider: "fixture", model: "review-primary", reasoningEffort: "max" };
  const settings = resolveConfig({ roles: { "dsmm-builder": false }, roleRouting: {
    "dsmm-reviewer": { primary }, "dsmm-builder": { primary: { provider: "fixture", model: "disabled-policy" } }
  } });
  const definitions: Array<{ id: string; plugins: Array<{ config?: Record<string, unknown> }> }> = [];
  let install: ((ctx: DshContext) => unknown) | undefined;
  registerRolePresets({ inject(_deps, callback) { install = callback; } }, () => settings);
  assert.ok(install);
  await install({ get: (name) => (name === "agentPresets" ? {
    async register(definition: typeof definitions[number]) { definitions.push(definition); return async () => {}; },
    composedPreset() { return undefined; }
  } : name === "agents" ? { list: () => [] } : undefined) as never, on() {} });
  assert.equal(definitions.some((definition) => definition.id === "dsmm-builder"), false);
  const orchestrator = definitions.find((definition) => definition.id === "dsmm-orchestrator")!;
  const tool = orchestrator.plugins.find((row) => row.config?.toolName === "dsmm_reviewer")!.config!;
  assert.equal(Object.hasOwn(tool, "agentOptions"), false, "the provider admits the bound parent profile route before spawn");
  assert.equal(tool.provider, "dsmm-role-reviewer");
  assert.equal(tool.modelSelectionSettings, false);
  assert.deepEqual(tool.toolFilter, { allow: ["read", "glob", "grep"] });
  assert.equal(orchestrator.plugins.some((row) => row.config?.toolName === "dsmm_builder"), false);
  assert.equal(Object.hasOwn(orchestrator.plugins.find((row) => row.config?.toolName === "dsmm_oracle")!.config!, "agentOptions"), false);
});
