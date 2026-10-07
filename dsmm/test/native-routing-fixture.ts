import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry, installModelSelection } from "@deepseek-ai/dsh-agent";
import type { Agent, AgentHandle, CreateAgentOptions, ModelSelectionRef } from "@deepseek-ai/dsh-agent";
import { AgentLoop } from "@deepseek-ai/dsh-agent-loop";
import { LlmAdapter, LlmError, LlmRuntime, ReasoningEffortId, createUserMessage } from "@deepseek-ai/dsh-llm";
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from "@deepseek-ai/dsh-llm";
import { SessionId, SessionStore } from "@deepseek-ai/dsh-session";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import { SubagentRuntime, foldSubagentDescriptor, snapshotSubagentDescriptor } from "@deepseek-ai/dsh-subagent";
import * as nativeSpawn from "@deepseek-ai/dsh-subagent-spawn-in-process";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { AgentPresetRegistry } from "@deepseek-ai/dsh-agent-preset-registry";
import DsmmPlugin from "../lib/index.js";
import { apply } from "../lib/index.js";
import type { DsmmPluginConfig } from "../lib/index.js";
import type { DshContext } from "../lib/dsh-types.js";
import type { DsmmRoleId } from "../lib/roles.js";

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
const require = createRequire(import.meta.url);
const skillSdk = createRequire(require.resolve("@deepseek-ai/dsh-skill-filesystem"));
const { SkillRegistry } = skillSdk("@deepseek-ai/dsh-skill");
const presetSdk = createRequire(require.resolve("@deepseek-ai/dsh-agent-preset-registry"));
const { Loader }: { Loader: new (ctx: Context, config?: { baseUrl?: string }) => Context["loader"] } = presetSdk("@deepseek-ai/cordis-plugin-loader");

export async function nativeRoutingFixture(config: DsmmPluginConfig = {}, options: { headless?: boolean; spawn?: boolean; profileDir?: string; nativePresets?: boolean; isolatedPrompt?: boolean } = {}) {
  const host = new Context();
  const ctx = (options.isolatedPrompt ? host.isolate("systemPrompt") : host).extend({ baseUrl: new URL("../", import.meta.url).href });
  // Filesystem ownership is per Host even when a test deliberately shares profiles.
  const fixtureDir = mkdtempSync(join(tmpdir(), "dsmm-native-routing-"));
  const owner = `native-routing-fixture:${randomUUID()}`;
  const marker = join(fixtureDir, ".run-owner");
  writeFileSync(marker, owner, { flag: "wx" });
  const profileDir = options.profileDir ?? fixtureDir;
  const withPresetRoot = (input: DsmmPluginConfig): DsmmPluginConfig => ({ ...input,
    presets: { ...input.presets, root: input.presets?.root ?? join(fixtureDir, "agent-presets") }
  });
  config = withPresetRoot(config);
  const removeOwnedFixture = (): void => {
    if (!existsSync(fixtureDir)) return;
    assert.equal(lstatSync(fixtureDir).isSymbolicLink(), false, "fixture root must not be linked");
    assert.equal(readFileSync(marker, "utf8"), owner, "fixture root owner changed");
    rmSync(fixtureDir, { recursive: true, force: true });
  };
  try {
    const adapter = new RoutingFixtureAdapter();
    const fibers = [
      ctx.plugin(AgentRegistry), ctx.plugin(SessionStore), ctx.plugin(SessionProjectionRegistry),
      ctx.plugin(LlmRuntime), ctx.plugin(SystemPrompt, {}), ctx.plugin(ToolRuntime, { mode: "native" }),
      ctx.plugin(SubagentRuntime, {}), ctx.plugin(SkillRegistry, {})
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
    ctx.provide("profileContext", { dir: profileDir, baseUrl: new URL("../", import.meta.url).href, startedBundles: options.headless ? ["@deepseek-ai/dsh-headless"] : [] });
    let loader: Context["loader"] | undefined;
    if (options.nativePresets) {
      const loaderFiber = ctx.plugin(Loader, { baseUrl: new URL("../", import.meta.url).href });
      await loaderFiber.await();
      loader = ctx.get("loader")!;
      loader.builtins["parity-presets"] = { default: AgentPresetRegistry };
      loader.builtins["parity-persona"] = require("@deepseek-ai/dsh-persona");
      loader.builtins["parity-dsmm"] = { default: DsmmPlugin };
      await loader.create({ name: "cordis:parity-presets", config: { default: "standard" } });
      await loader.await();
      const presets = ctx.get("agentPresets")!;
      await presets.register({ id: "standard", name: "Ordinary", description: "Native parity fixture", plugins: [] });
      await presets.register({ id: "dsmm-planner", name: "DW Planner", description: "Native persona/restriction fixture", plugins: [{ name: "cordis:parity-persona", config: { prefix: "ROLE_PERSONA_SENTINEL" } }] });
    }
    const loopFiber = ctx.plugin(AgentLoop, {});
    await loopFiber.await();
    const spawnFiber = options.spawn === false ? undefined : ctx.plugin(nativeSpawn, { providerName: "spawn" });
    await spawnFiber?.await();
    const dsmmEntryId = loader === undefined ? undefined : await loader.create({ name: "cordis:parity-dsmm", config });
    await loader?.await();
    const dsmmFiber = dsmmEntryId === undefined ? ctx.plugin({
      name: "dsmm-native-routing-fixture",
      apply(ready: Context) { return apply(ready as unknown as DshContext, config); }
    }) : loader!.resolve(dsmmEntryId).fiber!;
    await dsmmFiber.await();
    const agents = ctx.get("agents");
    const subagents = ctx.get("subagents");
    assert.ok(agents && subagents);
    const handles: AgentHandle[] = [];
    return {
      ctx, host, adapter, agents, subagents, dsmmFiber, spawnFiber, tools, profileDir, dsmmEntryId,
      async reloadDeployment(next: DsmmPluginConfig): Promise<void> {
        assert.ok(loader && dsmmEntryId);
        await loader.update(dsmmEntryId, { config: withPresetRoot(next) }); await loader.await();
      },
      deploymentConfig(): unknown { return loader?.resolve(dsmmEntryId!).fiber?.config; },
      async create(meta: CreateAgentOptions["meta"] = {}, selection?: ModelSelectionRef, extra: Partial<CreateAgentOptions> = {}): Promise<Agent> {
        const handle = await agents.create({
          sessionId: SessionId(`dsmm-routing-fixture-${++fixtureSequence}`),
          meta, agentOptions: { provider: "fixture", model: "native-default", reasoningEffort: ReasoningEffortId("low") },
          ...extra,
          ...(options.nativePresets || selection ? { async setup(agentCtx: Context, agent: Agent) {
            if (options.nativePresets) await ctx.get("agentPresets")!.mount(agentCtx, meta?.agentPreset);
            if (selection) installModelSelection(agentCtx, selection);
            return extra.setup?.(agentCtx, agent);
          } } : {})
        });
        handles.push(handle);
        return handle.agent;
      },
      /** Genuine unowned auxiliary Sessions; this grants no live-parent ownership. */
      async createAuxiliary(role: DsmmRoleId = "dsmm-reviewer", selection?: ModelSelectionRef, extra: Partial<CreateAgentOptions> = {}): Promise<Agent> {
        const agent = await this.create({ origin: "subagent", agentPreset: role }, selection, extra);
        if (foldSubagentDescriptor(agent.session.snapshotEvents().slice(agent.session.inheritedEventCount)) === undefined) {
          agent.session.append("subagent/descriptor", snapshotSubagentDescriptor({ mode: "one-shot", provider: `dsmm-role-${role.slice("dsmm-".length)}` }));
        }
        return agent;
      },
      async dispose() {
        for (const handle of [...handles].reverse()) await handle.dispose();
        await ctx.fiber.dispose();
        removeOwnedFixture();
      }
    };
  } catch (error) {
    await ctx.fiber.dispose();
    removeOwnedFixture();
    throw error;
  }
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
