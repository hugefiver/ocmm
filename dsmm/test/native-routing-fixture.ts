import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry, installModelSelection } from "@deepseek-ai/dsh-agent";
import type { Agent, AgentHandle, CreateAgentOptions, ModelSelectionRef } from "@deepseek-ai/dsh-agent";
import { AgentLoop } from "@deepseek-ai/dsh-agent-loop";
import { LlmAdapter, LlmError, LlmRuntime, ReasoningEffortId, createUserMessage } from "@deepseek-ai/dsh-llm";
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from "@deepseek-ai/dsh-llm";
import { SessionId, SessionStore } from "@deepseek-ai/dsh-session";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import * as nativeSpawn from "@deepseek-ai/dsh-subagent-spawn-in-process";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { apply } from "../lib/index.js";
import type { DsmmPluginConfig } from "../lib/index.js";
import type { DshContext } from "../lib/dsh-types.js";

/** All requests terminate inside this adapter; no credentials, network or shell. */
export class RoutingFixtureAdapter extends LlmAdapter {
  readonly calls: GenerateOptions[] = [];
  readonly failModels = new Set<string>();
  readonly rateLimitModels = new Set<string>();
  readonly unsupportedMaxModels = new Set<string>();
  readonly unavailableModels = new Set<string>();
  beforeStream?: (options: GenerateOptions) => Promise<void>;
  streamChunks?: (options: GenerateOptions) => AsyncIterable<StreamChunk>;

  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    if (this.unavailableModels.has(model)) throw new LlmError("deterministic native exact model absence", "UNKNOWN_MODEL");
    const efforts = this.unsupportedMaxModels.has(model) ? ["high"] : ["off", "low", "high", "max"];
    return {
      provider, id: model, name: model,
      inputModalities: ["text"],
      reasoning: { efforts: efforts.map((id) => ({ id: ReasoningEffortId(id), name: id })), defaultEffort: ReasoningEffortId("high") }
    };
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls.push(options);
    await this.beforeStream?.(options);
    options.signal?.throwIfAborted();
    if (this.streamChunks !== undefined) { yield* this.streamChunks(options); return; }
    if (this.rateLimitModels.has(options.model)) throw new LlmError("deterministic local rate limit", "RATE_LIMIT", { status: 429 });
    if (this.failModels.has(options.model)) throw new LlmError("deterministic local transient fixture", "FIXTURE_TRANSIENT", { status: 503 });
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text: "fixture complete" };
    yield { type: "block-end", index: 0, block: { type: "text", text: "fixture complete" } };
    yield { type: "finish", reason: { kind: "stop" } };
  }
}

let fixtureSequence = 0;

export async function nativeRoutingFixture(config: DsmmPluginConfig = {}, options: { headless?: boolean; spawn?: boolean; profileDir?: string } = {}) {
  const ctx = new Context();
  const profileDir = options.profileDir ?? mkdtempSync(join(tmpdir(), "dsmm-native-routing-"));
  const adapter = new RoutingFixtureAdapter();
  const fibers = [
    ctx.plugin(AgentRegistry), ctx.plugin(SessionStore), ctx.plugin(SessionProjectionRegistry),
    ctx.plugin(LlmRuntime), ctx.plugin(SystemPrompt, {}), ctx.plugin(ToolRuntime, { mode: "native" }),
    ctx.plugin(SubagentRuntime, {})
  ];
  await Promise.all(fibers.map((fiber) => fiber.await()));
  const llm = ctx.get("llm");
  const tools = ctx.get("tools");
  assert.ok(llm && tools);
  llm.registerAdapter(["fixture", "deepseek-official"], adapter);
  for (const name of ["read", "glob", "grep", "write", "edit", "bash", "pwsh", "shell"]) {
    tools.register({
      name, description: `Local native routing fixture ${name}; never touches disk`, parameters: {},
      output: { schema: { type: "string" }, render: () => [{ type: "text", text: name }] },
      async execute() { return name; }
    });
  }
  ctx.provide("profileContext", { dir: profileDir, startedBundles: options.headless ? ["@deepseek-ai/dsh-headless"] : [] });
  const loopFiber = ctx.plugin(AgentLoop, {});
  await loopFiber.await();
  const spawnFiber = options.spawn === false ? undefined : ctx.plugin(nativeSpawn, { providerName: "spawn" });
  await spawnFiber?.await();
  const dsmmFiber = ctx.plugin({
    name: "dsmm-native-routing-fixture",
    apply(ready: Context) { return apply(ready as unknown as DshContext, config); }
  });
  await dsmmFiber.await();
  const agents = ctx.get("agents");
  const subagents = ctx.get("subagents");
  assert.ok(agents && subagents);
  const handles: AgentHandle[] = [];
  return {
    ctx, adapter, agents, subagents, dsmmFiber, spawnFiber, tools, profileDir,
    async create(meta: CreateAgentOptions["meta"] = {}, selection?: ModelSelectionRef, extra: Partial<CreateAgentOptions> = {}): Promise<Agent> {
      const handle = await agents.create({
        sessionId: SessionId(`dsmm-routing-fixture-${++fixtureSequence}`),
        meta, agentOptions: { provider: "fixture", model: "native-default", reasoningEffort: ReasoningEffortId("low") },
        ...extra,
        ...(selection ? { setup(agentCtx) { installModelSelection(agentCtx, selection); } } : {})
      });
      handles.push(handle);
      return handle.agent;
    },
    async dispose() {
      for (const handle of [...handles].reverse()) await handle.dispose();
      await ctx.fiber.dispose();
      if (options.profileDir === undefined) rmSync(profileDir, { recursive: true, force: true });
    }
  };
}

export async function runFixtureTurn(agent: Agent): Promise<void> {
  agent.followup(createUserMessage({ content: [{ type: "text", text: "Complete this local fixture" }], source: { kind: "user" } }));
  await agent.whenIdle();
}

export function headerRoutes(agent: Agent): Array<{ provider: string; model: string; reasoningEffort?: string }> {
  return agent.session.snapshotEvents().flatMap((event) => event.type === "request/header" ? [{
    provider: event.data.header.config.provider, model: event.data.header.config.model,
    ...(event.data.header.config.reasoningEffort === undefined ? {} : { reasoningEffort: event.data.header.config.reasoningEffort })
  }] : []);
}
