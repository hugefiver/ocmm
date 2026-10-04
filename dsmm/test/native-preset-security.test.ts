import assert from "node:assert/strict";
import { test } from "node:test";
import { Context, getTraceable, symbols } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import { Session, SessionId } from "@deepseek-ai/dsh-session";
import { bindScopeParent, createScope, scopeOf, scopeParentOf, scopeTarget } from "@deepseek-ai/dsh-scope";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { DshContext } from "../lib/dsh-types.js";
import { registerRolePresets } from "../lib/preset-registry.js";
import { resolveConfig } from "../lib/settings.js";

test("native blank preset switch applies and lifts Agent-scoped read-only restrictions", async () => {
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
    for (const name of ["read", "write", "edit"]) reviewerTools.register(tool(name));
    hostTools.register(tool("write"));
    const rawBuilderTools = (builderTools as unknown as Record<symbol, typeof builderTools>)[symbols.original];
    const rawReviewerTools = (reviewerTools as unknown as Record<symbol, typeof reviewerTools>)[symbols.original];
    assert.ok(rawBuilderTools && rawReviewerTools);
    const services = new Map([[builderKey, rawBuilderTools], [reviewerKey, rawReviewerTools]]);
    const ids = new Map([[builderKey, "dsmm-builder"], [reviewerKey, "dsmm-reviewer"]]);
    let registered = 0;
    let resolveReady: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
    ctx.provide("agentPresets", {
      async register() {
        registered++;
        if (registered === 12) resolveReady?.();
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
    registerRolePresets(ctx as unknown as DshContext, () => resolveConfig());
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
    session.append("agent-preset/selected", { agentPreset: "dsmm-reviewer" });
    ctx.emit("agent-preset/selected", session.id, "dsmm-reviewer");
    assert.equal(reviewerTools.get("write", agent), undefined);
    assert.equal(reviewerTools.get("edit", agent), undefined);
    assert.ok(reviewerTools.get("read", agent));
    assert.ok(hostTools.get("write", agent), "Host tools coexist, but the selected preset realm is the restriction target");
    const denied = await reviewerTools.execute({ callId: ToolCallId("readonly-write"), agent, name: "write", arguments: {}, signal: new AbortController().signal });
    assert.equal(denied.isError, true);

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
});
