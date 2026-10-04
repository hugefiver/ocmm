import assert from "node:assert/strict";
import { test } from "node:test";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type {} from "@deepseek-ai/dsh-agent-preset-registry";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import { Session, SessionId } from "@deepseek-ai/dsh-session";
import { bindScopeParent, createScope, scopeOf, scopeParentOf, scopeTarget } from "@deepseek-ai/dsh-scope";
import { SystemPrompt, renderPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import "../lib/dsh-events.js";
import type { DshAgent, DshContext } from "../lib/dsh-types.js";
import { registerSafetyGuards } from "../lib/guards.js";
import { registerDeepworkPrompt } from "../lib/mode.js";
import { resolveSelectedAgentPreset, sessionEvents } from "../lib/session-scope.js";
import { registerSettings, resolveConfig } from "../lib/settings.js";
import { DeepworkModeController } from "../lib/state.js";

test("native Session and isolated SystemPrompt fold mode changes without a Host prompt service", async () => {
  const ctx = new Context();
  const adapterContext = ctx as unknown as DshContext;
  const controller = new DeepworkModeController(adapterContext);
  const getSettings = registerSettings(adapterContext, {}, {
    install(readyCtx, settings) {
      registerDeepworkPrompt(readyCtx, controller, settings, { section: "Native {{literal}} section" });
    }
  });
  const isolated = ctx.isolate("systemPrompt");
  const fiber = isolated.plugin(SystemPrompt, {});
  assert.ok(fiber);
  try {
    await fiber.await();
    assert.equal(ctx.get("systemPrompt"), undefined);
    const prompt = isolated.get("systemPrompt");
    assert.ok(prompt);
    const session = Session.create(SessionId("dsmm-native-contract-active"));
    const other = Session.create(SessionId("dsmm-native-contract-off"));
    // Driverless agent handles: the session, prompt service and event bus are real.
    const agent = { session, options: {}, ctx: isolated } as unknown as Agent;
    const otherAgent = { session: other, options: {}, ctx: isolated } as unknown as Agent;
    const adapterAgent = agent as unknown as DshAgent;
    await ctx.serial(scopeTarget(agent, agent), "agent/created", { agent, source: "startup" });
    await ctx.serial(scopeTarget(otherAgent, otherAgent), "agent/created", { agent: otherAgent, source: "startup" });
    prompt.section({ name: "contract:after-dsmm", order: 51, text: "AFTER_DSMM" });
    assert.equal("events" in session, false);
    assert.equal(getSettings().workflow.policy, "risk-based");
    assert.doesNotMatch(renderPrompt(await prompt.assemble({ agent, scope: agent })), /Native/);
    await controller.select(adapterAgent, true);
    assert.equal(sessionEvents(adapterAgent.session).at(-1)?.type, "deepwork/mode");
    const active = renderPrompt(await prompt.assemble({ agent, scope: agent }));
    assert.match(active, /Native \{\{literal\}\} section/);
    assert.equal(active.split("Native {{literal}} section").length - 1, 1);
    assert.ok(active.indexOf("Native {{literal}} section") < active.indexOf("AFTER_DSMM"));
    assert.doesNotMatch(renderPrompt(await prompt.assemble({ agent: otherAgent, scope: otherAgent })), /Native/);
    await controller.select(adapterAgent, false);
    assert.doesNotMatch(renderPrompt(await prompt.assemble({ agent, scope: agent })), /Native/);
    session.append("agent-preset/selected", { agentPreset: "dsmm-reviewer" });
    assert.equal(resolveSelectedAgentPreset(adapterAgent.session), "dsmm-reviewer");
    assert.match(renderPrompt(await prompt.assemble({ agent, scope: agent })), /Native/);
    assert.doesNotMatch(renderPrompt(await prompt.assemble()), /Native/);
  } finally {
    await ctx.fiber.dispose();
  }
});

test("native ToolRuntime enforces Git denial and keeps canonical values while truncating text", async () => {
  const ctx = new Context();
  const promptFiber = ctx.plugin(SystemPrompt, {});
  const toolsFiber = ctx.plugin(ToolRuntime, { mode: "native" });
  assert.ok(promptFiber);
  assert.ok(toolsFiber);
  try {
    await promptFiber.await();
    await toolsFiber.await();
    const tools = ctx.get("tools");
    assert.ok(tools);
    const settings = resolveConfig({ guards: {
      scope: "always", gitWriteGuard: "deny", toolOutputTruncation: { maxInlineBytes: 90 }
    } });
    registerSafetyGuards(ctx as unknown as DshContext, new DeepworkModeController({}), () => settings);
    let calls = 0;
    const value = "x".repeat(300);
    tools.register({
      name: "bash", description: "Contract fixture; never runs a shell",
      parameters: { command: { type: "string", required: true } },
      output: { schema: { type: "string" }, render: (_args, result) => [{ type: "text", text: String(result) }] },
      async execute() { calls += 1; return value; }
    });
    const signal = new AbortController().signal;
    const denied = await tools.execute({ callId: ToolCallId("git-denied"), name: "bash", arguments: { command: "git commit -m blocked" }, signal });
    assert.equal(denied.isError, true);
    assert.equal(calls, 0);
    const accepted = await tools.execute({ callId: ToolCallId("git-read"), name: "bash", arguments: { command: "git status" }, signal });
    assert.equal(accepted.isError, false);
    assert.equal(accepted.value, value);
    assert.equal(calls, 1);
    const rendered = accepted.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("");
    assert.match(rendered, /\[dsmm safety\] truncated/);
    assert.ok(Buffer.byteLength(rendered, "utf8") <= 90);
  } finally {
    await ctx.fiber.dispose();
  }
});

test("blank Agent selection follows a rebound native prompt realm without another created event", async () => {
  const ctx = new Context();
  const agentsFiber = ctx.plugin(AgentRegistry);
  assert.ok(agentsFiber);
  const standardKey = {};
  const reviewerKey = {};
  const standardScope = createScope(ctx.isolate("systemPrompt"), standardKey);
  const reviewerScope = createScope(ctx.isolate("systemPrompt"), reviewerKey);
  const standardFiber = standardScope.ctx.plugin(SystemPrompt, {});
  const reviewerFiber = reviewerScope.ctx.plugin(SystemPrompt, {});
  assert.ok(standardFiber);
  assert.ok(reviewerFiber);
  try {
    await Promise.all([agentsFiber.await(), standardFiber.await(), reviewerFiber.await()]);
    const standard = standardScope.ctx.get("systemPrompt");
    const reviewer = reviewerScope.ctx.get("systemPrompt");
    const agents = ctx.get("agents");
    assert.ok(standard && reviewer && agents);
    const services = new Map([[standardKey, standard], [reviewerKey, reviewer]]);
    // Mount-discovery seam only: all scopes, rebinding, sessions and services are native.
    ctx.provide("agentPresets", {
      serviceFor(agent: Agent, name: string) {
        const key = scopeOf(agent.ctx);
        return name === "systemPrompt" && key !== undefined ? services.get(scopeParentOf(key)!) : undefined;
      }
    });
    const adapterContext = ctx as unknown as DshContext;
    const controller = new DeepworkModeController(adapterContext);
    registerDeepworkPrompt(adapterContext, controller, () => resolveConfig(), { section: "SELECTED_NATIVE_PROMPT" });
    const initial = Session.create(SessionId("dsmm-native-preset-selection"));
    const session = Session.create(initial.id, [], { ...initial.header, agentPreset: "standard" });
    const fixture = { id: session.id, session, options: {}, ctx: undefined as unknown as Context };
    const agent = fixture as unknown as Agent;
    fixture.ctx = createScope(ctx, agent).ctx;
    const binding = bindScopeParent(agent, standardKey);
    await agents.register(agent);
    const render = async (): Promise<string> => {
      const prompt = services.get(scopeParentOf(agent)!);
      assert.ok(prompt);
      return renderPrompt(await prompt.assemble({ agent, scope: agent }));
    };
    const select = (preset: "standard" | "dsmm-reviewer"): void => {
      binding.rebind(preset === "standard" ? standardKey : reviewerKey);
      session.append("agent-preset/selected", { agentPreset: preset });
      ctx.emit("agent-preset/selected", session.id, preset);
    };
    assert.doesNotMatch(await render(), /SELECTED_NATIVE_PROMPT/);
    select("dsmm-reviewer");
    assert.equal(session.header.agentPreset, "standard");
    assert.match(await render(), /SELECTED_NATIVE_PROMPT/);
    select("standard");
    assert.doesNotMatch(await render(), /SELECTED_NATIVE_PROMPT/);
    select("dsmm-reviewer");
    select("dsmm-reviewer");
    assert.equal((await render()).split("SELECTED_NATIVE_PROMPT").length - 1, 1);
    select("standard");
    await controller.select(agent as unknown as DshAgent, true);
    assert.match(await render(), /SELECTED_NATIVE_PROMPT/);
  } finally {
    await ctx.fiber.dispose();
  }
});
