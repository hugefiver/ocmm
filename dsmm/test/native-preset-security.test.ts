import assert from "node:assert/strict";
import { test } from "node:test";
import { Context, getTraceable, symbols } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import type { Agent } from "@deepseek-ai/dsh-agent";
import * as AgentInstructions from "@deepseek-ai/dsh-agent-instructions";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import * as Persona from "@deepseek-ai/dsh-persona";
import { Session, SessionId } from "@deepseek-ai/dsh-session";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import { bindScopeParent, createScope, scopeOf, scopeParentOf, scopeTarget } from "@deepseek-ai/dsh-scope";
import { SystemPrompt, renderPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { DshAgent, DshContext } from "../src/dsh-types.js";
import { registerRolePresets } from "../src/preset-registry.js";
import { DSMM_ROLES, rolePluginRows } from "../src/roles.js";
import { buildRoleIdentity } from "../src/prompt-content.js";
import { registerRoleHarnessIdentity } from "../src/role-identity.js";
import { resolveConfig } from "../src/settings.ts";

test("native role persona and instruction compositions accept required Config fields and activate", async () => {
  const ctx = new Context();
  const promptFiber = ctx.plugin(SystemPrompt, {});
  const projectionsFiber = ctx.plugin(SessionProjectionRegistry);
  try {
    await Promise.all([promptFiber.await(), projectionsFiber.await()]);
    const ordinaryKey = {};
    const ordinary = createScope(ctx, ordinaryKey);
    await ordinary.ctx.plugin(Persona, { prefix: "Ordinary native persona" }).await();
    const nativePrompt = renderPrompt(await ctx.systemPrompt.assemble({ scope: ordinaryKey }));
    ctx.systemPrompt.section({ name: "fixture:tool-guidance", order: 1000, text: "Native tool guidance" });
    for (const role of DSMM_ROLES) {
      const key = { ctx: undefined as unknown as Context };
      const scope = createScope(ctx, key);
      key.ctx = scope.ctx;
      const rows = rolePluginRows(role);
      const persona = rows.find((row) => row.id === "persona");
      const instructions = rows.find((row) => row.id === "agent-instructions");
      assert.ok(persona && instructions);
      // Native Cordis validates each real plugin's Config before activation.
      // Mount the emitted values unchanged so the old text/missing-maxBytes
      // composition fails here exactly as it does in the eager preset audit.
      const personaFiber = scope.ctx.plugin(Persona, persona.config as unknown as Persona.Config);
      const instructionsFiber = scope.ctx.plugin(AgentInstructions, instructions.config as unknown as AgentInstructions.Config);
      const activation = await Promise.allSettled([personaFiber.await(), instructionsFiber.await()]);
      const failures = activation.flatMap((result) => result.status === "rejected" ? [String(result.reason)] : []);
      assert.deepEqual(failures, [], `${role.id} native composition failed Config validation or activation`);
      scope.ctx.get("systemPrompt")!.section({ name: "fixture:workspace-instructions", order: 50, text: "Native workspace instructions" });
      const disposeIdentity = registerRoleHarnessIdentity(key as unknown as DshAgent, role.id);
      const prompt = await ctx.systemPrompt.assemble({ scope: key });
      assert.equal(prompt.sections[0]?.name, "harness:identity");
      assert.equal(prompt.sections[0]?.text, buildRoleIdentity(role));
      assert.ok(renderPrompt(prompt).startsWith(buildRoleIdentity(role)));
      assert.equal(prompt.sections.find((section) => section.name === Persona.PERSONA_PREFIX_SECTION)?.text, role.persona);
      assert.ok(renderPrompt(prompt).includes("Native workspace instructions"));
      assert.ok(renderPrompt(prompt).includes("Native tool guidance"));
      assert.equal(renderPrompt(await ctx.systemPrompt.assemble({ scope: ordinaryKey })), `${nativePrompt}\n\nNative tool guidance`);
      disposeIdentity();
      const restored = await ctx.systemPrompt.assemble({ scope: key });
      assert.equal(restored.sections[0]?.text, (await ctx.systemPrompt.assemble()).sections[0]?.text);
    }
  } finally {
    await ctx.fiber.dispose();
  }
});

for (const readOnlyRole of ["dsmm-planner", "dsmm-reviewer"] as const) {
  test(`native ${readOnlyRole} composition applies and lifts Agent-scoped read-only restrictions`, () => verifyReadonlyPresetSwitch(readOnlyRole));
}

async function verifyReadonlyPresetSwitch(readOnlyRole: "dsmm-planner" | "dsmm-reviewer"): Promise<void> {
  const ctx = new Context();
  const promptFiber = ctx.plugin(SystemPrompt, {});
  const agentsFiber = ctx.plugin(AgentRegistry);
  const hostToolsFiber = ctx.plugin(ToolRuntime, { mode: "native" });
  const builderKey = {};
  const reviewerKey = {};
  const builderScope = createScope(ctx.isolate("tools"), builderKey);
  const reviewerScope = createScope(ctx.isolate("tools"), reviewerKey);
  const builderFiber = builderScope.ctx.plugin(ToolRuntime, { mode: "native" });
  const reviewerFiber = reviewerScope.ctx.plugin(ToolRuntime, { mode: "native" });
  try {
    await Promise.all([promptFiber.await(), agentsFiber.await(), hostToolsFiber.await(), builderFiber.await(), reviewerFiber.await()]);
    const agents = ctx.get("agents");
    const hostTools = ctx.get("tools");
    const builderTools = builderScope.ctx.get("tools");
    const reviewerTools = reviewerScope.ctx.get("tools");
    assert.ok(agents && hostTools && builderTools && reviewerTools);
    const tool = (name: string) => ({
      name, description: `Native ${name} fixture`,
      parameters: {},
      output: { schema: { type: "string" as const }, render: () => [{ type: "text" as const, text: name }] },
      async execute() { return name; }
    });
    for (const name of ["read", "write", "edit", "dsmm_builder"]) builderTools.register(tool(name));
    for (const name of ["read", "write", "edit", "bash", "pwsh", "dsmm_builder", "dsmm_reviewer"]) reviewerTools.register(tool(name));
    hostTools.register(tool("write"));
    const rawBuilderTools = (builderTools as unknown as Record<symbol, typeof builderTools>)[symbols.original];
    const rawReviewerTools = (reviewerTools as unknown as Record<symbol, typeof reviewerTools>)[symbols.original];
    assert.ok(rawBuilderTools && rawReviewerTools);
    const services = new Map([[builderKey, rawBuilderTools], [reviewerKey, rawReviewerTools]]);
    const ids = new Map([[builderKey, "dsmm-builder"], [reviewerKey, readOnlyRole]]);
    let registered = 0;
    const settings = resolveConfig({ presets: { plannerRootEnabled: readOnlyRole === "dsmm-planner" } });
    const expectedRegistrations = DSMM_ROLES.filter(role => settings.roles[role.id]).length;
    let resolveReady: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
    ctx.provide("agentPresets", {
      async register() {
        registered++;
        if (registered === expectedRegistrations) resolveReady?.();
        return async () => {};
      },
      composedPreset(target: Context) {
        const key = scopeOf(target);
        return key === undefined ? undefined : ids.get(scopeParentOf(key)!);
      },
      serviceFor(agent: Agent, name: string) {
        const key = scopeOf(agent.ctx);
        return name === "tools" && key !== undefined ? services.get(scopeParentOf(key)!) : undefined;
      }
    });
    registerRolePresets(ctx as unknown as DshContext, () => settings);
    await ready;
    await Promise.resolve();

    const initial = Session.create(SessionId("dsmm-native-preset-security"));
    const session = Session.create(initial.id, [], { ...initial.header, agentPreset: "dsmm-builder" });
    const fixture = { id: session.id, session, options: {}, ctx: undefined as unknown as Context };
    const agent = fixture as unknown as Agent;
    fixture.ctx = createScope(ctx, agent).ctx;
    const binding = bindScopeParent(agent, builderKey);
    await agents.register(agent);
    await ctx.serial(scopeTarget(agent, agent), "agent/created", { agent, source: "startup" });

    assert.ok(builderTools.get("write", agent));
    assert.ok(builderTools.get("dsmm_builder", agent));
    binding.rebind(reviewerKey);
    ctx.emit("tools/change");
    session.append("agent-preset/selected", { agentPreset: readOnlyRole });
    ctx.emit("agent-preset/selected", session.id, readOnlyRole);
    assert.equal(reviewerTools.get("write", agent), undefined);
    assert.equal(reviewerTools.get("edit", agent), undefined);
    assert.ok(reviewerTools.get("read", agent));
    assert.ok(hostTools.get("write", agent), "Host tools coexist, but the selected preset realm is the restriction target");
    const denied = await reviewerTools.execute({ callId: ToolCallId("readonly-write"), agent, name: "write", arguments: {}, signal: new AbortController().signal });
    assert.equal(denied.isError, true);
    for (const name of ["edit", "bash", "pwsh", "dsmm_builder", "dsmm_reviewer"]) {
      const readonlyDenied: { isError: boolean } = await reviewerTools.execute({ callId: ToolCallId(`readonly-${name}`), agent, name, arguments: {}, signal: new AbortController().signal });
      assert.equal(readonlyDenied.isError, true, `${name} is denied on a directly selected read-only native preset`);
    }

    // The raw preset service is not Agent-bound; the public Cordis trace must
    // bind it before restrict(), otherwise the same-scope write survives.
    assert.equal(getTraceable(agent.ctx, rawReviewerTools).get("write", agent), undefined);
    binding.rebind(builderKey);
    ctx.emit("tools/change");
    session.append("agent-preset/selected", { agentPreset: "dsmm-builder" });
    ctx.emit("agent-preset/selected", session.id, "dsmm-builder");
    assert.ok(builderTools.get("write", agent));
    assert.ok(builderTools.get("dsmm_builder", agent));
  } finally {
    await ctx.fiber.dispose();
  }
}
