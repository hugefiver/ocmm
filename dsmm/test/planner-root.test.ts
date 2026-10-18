import assert from "node:assert/strict";
import { test } from "node:test";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import { parseGlobalConfig } from "../src/deployment-config.ts";
import { DSMM_CONFIG_SCHEMA, deploymentEditorSchema, resolveConfig, resolveDeployment } from "../src/settings.ts";
import { validateProfileOverlay } from "../src/profiles.ts";
import { nativeRoutingFixture } from "./native-routing-fixture.ts";

test("Planner root eligibility is deployment-only, defaults off and retains workflow role enablement", () => {
  const off = resolveConfig(DSMM_CONFIG_SCHEMA({}));
  assert.equal(off.presets.plannerRootEnabled, false);
  assert.equal(off.roles["dsmm-planner"], true);
  const global = parseGlobalConfig('{"presets":{"plannerRootEnabled":true}}');
  assert.equal(resolveDeployment(global, {}).presets.plannerRootEnabled, true);
  assert.equal(resolveDeployment(global, { presets: { plannerRootEnabled: false } }).presets.plannerRootEnabled, false);
  assert.equal(deploymentEditorSchema().fields?.presets.fields?.plannerRootEnabled.type, "boolean");
  for (const value of [null, "true", 1]) {
    assert.throws(() => parseGlobalConfig(JSON.stringify({ presets: { plannerRootEnabled: value } })), { code: "validation", field: "presets.plannerRootEnabled" });
    const malformed = { presets: { plannerRootEnabled: false } };
    Reflect.set(malformed.presets, "plannerRootEnabled", value);
    assert.throws(() => resolveConfig(malformed));
  }
  assert.throws(() => validateProfileOverlay({ presets: { plannerRootEnabled: true } }));
});

test("discoverable Planner supports child execution but root and blank-root execution require explicit eligibility", async () => {
  const f = await nativeRoutingFixture({}, { nativePresets: true });
  try {
    const presets = f.ctx.agentPresets;
    assert.ok((await presets.remoteExportList()).presets.some(row => row.id === "dsmm-planner"));
    await assert.rejects(f.create({ agentPreset: "dsmm-planner" }));
    assert.equal(f.adapter.calls.length, 0);
    const root = await f.create({ agentPreset: "dsmm-builder" });
    const result = await root.ctx.tools.execute({ agent: root, name: "dsmm_planner", callId: ToolCallId("workflow-planner"),
      arguments: { description: "Bounded native plan", prompt: "Return the useful local plan" }, signal: new AbortController().signal });
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.match(JSON.stringify(result), /fixture complete/);
    const blank = await f.create();
    await presets.select(blank, "dsmm-planner");
    const denied = await blank.ctx.tools.execute({ agent: blank, name: "write", callId: ToolCallId("blank-planner-write"),
      arguments: { file_path: "not-written", content: "denied" }, signal: new AbortController().signal });
    assert.equal(denied.isError, true);
    assert.equal(f.adapter.calls.length, 1);
  } finally { await f.dispose(); }
});

test("eligible Planner root still denies write and writable-role delegation", async () => {
  const f = await nativeRoutingFixture({ presets: { plannerRootEnabled: true } }, { nativePresets: true });
  try {
    const root = await f.create({ agentPreset: "dsmm-planner" });
    for (const [name, args] of [["write", { file_path: "not-written", content: "denied" }], ["dsmm_category", { category: "dsmm-coding", description: "Forbidden Coding", prompt: "must not run" }]] as const) {
      const result = await root.ctx.tools.execute({ agent: root, name, callId: ToolCallId(name), arguments: args, signal: new AbortController().signal });
      assert.equal(result.isError, true);
    }
    assert.equal(f.adapter.calls.length, 0);
  } finally { await f.dispose(); }
});
