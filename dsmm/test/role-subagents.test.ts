import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshContext, DshToolExecution } from "../lib/dsh-types.js";
import { registerHeadlessRoleTools } from "../lib/role-subagents.js";
import { DSMM_ROLE_IDS } from "../lib/roles.js";
import { DEFAULT_DSMM_SETTINGS } from "../lib/settings.js";
import { DeepworkModeController } from "../lib/state.js";

function execution(name: string, active: boolean): DshToolExecution {
  return {
    name,
    arguments: {},
    agent: { session: { events: active ? [{ type: "deepwork/mode", data: { active: true } }] : [], append() {} } }
  };
}

test("custom headless profile installs role tools in Agent scope before assembly", async () => {
  let created: ((payload: unknown) => unknown) | undefined;
  const registrations: Array<{ plugin: unknown; config: Record<string, unknown> }> = [];
  let guard: ((execution: Readonly<DshToolExecution>) => string | undefined) | undefined;
  registerHeadlessRoleTools({
    on(event, candidate, options) {
      assert.equal(event, "agent/created");
      assert.deepEqual(options, { global: true });
      created = candidate as (payload: unknown) => unknown;
    }
  }, new DeepworkModeController({}), () => DEFAULT_DSMM_SETTINGS);
  assert.ok(created);
  const agentCtx: DshContext = {
    get: () => ({ startedBundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless", "@dsmm/dsmm"] }) as never,
    tools: {
      get(name) { return name === "read_image" ? { name } : undefined; },
      guard(candidate) { guard = candidate; return () => {}; }
    },
    plugin(plugin, config) { registrations.push({ plugin, config: config as Record<string, unknown> }); return Promise.resolve(undefined); }
  };
  await created({ agent: { ctx: agentCtx, session: { header: { origin: "headless" }, events: [], append() {} } } });

  assert.equal(registrations.length, DSMM_ROLE_IDS.filter((id) => id !== "dsmm-orchestrator" && DEFAULT_DSMM_SETTINGS.roles[id]).length);
  assert.equal(registrations.some(({ config }) => config.toolName === "dsmm_cross_cutting"), false);
  const reviewer = registrations.find(({ config }) => config.toolName === "dsmm_reviewer");
  assert.deepEqual(reviewer?.config.toolFilter, { allow: ["read", "glob", "grep"] });
  assert.equal(reviewer?.config.modelSelectionSettings, false);
  const media = registrations.find(({ config }) => config.toolName === "dsmm_media_reader");
  assert.deepEqual(media?.config.toolFilter, { allow: ["read", "glob", "grep", "web_search", "web_fetch", "read_image"] });
  assert.equal(registrations.find(({ config }) => config.toolName === "dsmm_builder")?.config.toolFilter, undefined);
  assert.ok(guard);
  assert.match(guard(execution("dsmm_reviewer", false)) ?? "", /active Deepwork/u);
  assert.equal(guard(execution("dsmm_reviewer", true)), undefined);
  assert.equal(guard(execution("read", false)), undefined);
});

test("Web agents and in-process children do not receive headless role tools", async () => {
  let created: ((payload: unknown) => unknown) | undefined;
  registerHeadlessRoleTools({ on(_event, candidate) { created = candidate as (payload: unknown) => unknown; } }, new DeepworkModeController({}), () => DEFAULT_DSMM_SETTINGS);
  assert.ok(created);
  let mounts = 0;
  const agentCtx: DshContext = {
    get: () => ({ startedBundles: ["@deepseek-ai/dsh-headless"] }) as never,
    plugin() { mounts++; return Promise.resolve(undefined); },
    tools: { guard() { return () => {}; } }
  };
  await created({ agent: { ctx: agentCtx, session: { header: { origin: "subagent" }, append() {} } } });
  await created({ agent: { ctx: { ...agentCtx, get: () => ({ startedBundles: ["@deepseek-ai/dsh-web-app"] }) as never }, session: { append() {} } } });
  assert.equal(mounts, 0);
});
