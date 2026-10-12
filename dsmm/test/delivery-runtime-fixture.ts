import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after } from "node:test";
import { Context, symbols } from "@deepseek-ai/cordis";
import type { Service } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import type { Agent, AgentHandle } from "@deepseek-ai/dsh-agent";
import { AgentLoop } from "@deepseek-ai/dsh-agent-loop";
import { LlmAdapter, LlmRuntime } from "@deepseek-ai/dsh-llm";
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from "@deepseek-ai/dsh-llm";
import { SessionId, SessionStore } from "@deepseek-ai/dsh-session";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import { SubagentError } from "@deepseek-ai/dsh-subagent";
import type { SubagentPromptRequest, SubagentPromptRequestId } from "@deepseek-ai/dsh-subagent";
import * as Spawn from "@deepseek-ai/dsh-subagent-spawn-in-process";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import * as SubagentTools from "@deepseek-ai/dsh-tool-subagent";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import { TypertGatewayService } from "@deepseek-ai/dsh-api-gateway";
import * as Connection from "@deepseek-ai/dsh-client-connection";
import type { ParentAdmissionTicket } from "../src/delivery-authority.ts";

// Resolve only these two task-owned source modules; shared lib/ is never generated.
const authorityJs = new URL("../src/delivery-authority.js", import.meta.url).href;
const authorityTs = new URL("../src/delivery-authority.ts", import.meta.url).href;
const carrierUrls = new Set<string>();
const sharedPeers = new Set(["@deepseek-ai/cordis", "@deepseek-ai/dsh-tools", "@deepseek-ai/dsh-subagent/internal", "@deepseek-ai/dsh-attachment"]);
const hook = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL !== undefined && new URL(specifier, context.parentURL).href === authorityJs) {
    return { url: authorityTs, shortCircuit: true };
  }
  if (context.parentURL !== undefined && carrierUrls.has(context.parentURL) && sharedPeers.has(specifier)) {
    return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true };
  }
  return next(specifier, context);
} });
after(() => hook.deregister());
export const { DsmmSubagentRuntime } = await import("../src/subagent-runtime.ts");

const require = createRequire(import.meta.url);
export async function carrierPlugin(name: string) {
  const sdk = createRequire(process.env.DSMM_TEST_DSH_ENTRY ?? import.meta.url);
  const url = pathToFileURL(sdk.resolve(name)).href;
  carrierUrls.add(url);
  return import(url);
}
export async function nativePng(): Promise<string> {
  const sdk = createRequire(process.env.DSMM_TEST_DSH_ENTRY ?? import.meta.url);
  const backend = createRequire(sdk.resolve("@deepseek-ai/dsh-attachment-local"));
  const sharp = backend("sharp") as (options: { create: { width: number; height: number; channels: number; background: string } }) => { png(): { toBuffer(): Promise<Buffer> } };
  return (await sharp({ create: { width: 1, height: 1, channels: 4, background: "black" } }).png().toBuffer()).toString("base64");
}
const connectionRequire = createRequire(require.resolve("@deepseek-ai/dsh-client-connection"));
const { CredentialProvider } = connectionRequire("@deepseek-ai/dsh-credentials") as { CredentialProvider: new (ctx: Context) => Service };
class MemoryCredentials extends CredentialProvider {
  private readonly records = new Map<string, unknown>();
  async modifyRecord(key: string, modify: (current: unknown) => Promise<unknown>): Promise<unknown> {
    const next = await modify(this.records.get(key));
    if (next !== undefined) this.records.set(key, next);
    return this.records.get(key);
  }
}

const queryRequire = createRequire(require.resolve("@deepseek-ai/dsh-subagent-spawn-in-process"));
const Query = await import(pathToFileURL(queryRequire.resolve("@deepseek-ai/dsh-session-query")).href);
// Exact observation/replay is the SDK implementation. Full-text search is not used by delivery.
class ExactQuery extends Query.SessionQueryEngine {
  async searchSessions(): Promise<never> { throw new Error("delivery fixture does not offer full-text search"); }
  async searchEvents(): Promise<never> { throw new Error("delivery fixture does not offer full-text search"); }
}

export function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

export class DeliveryAdapter extends LlmAdapter {
  beforeStream?: (options: GenerateOptions) => Promise<void>;
  beforeResolve?: (provider: string, model: string) => Promise<void>;
  readonly calls: GenerateOptions[] = [];
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    await this.beforeResolve?.(provider, model);
    return { provider, id: model, name: model, inputModalities: ["text", "image"] };
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls.push(options);
    await this.beforeStream?.(options);
    options.signal?.throwIfAborted();
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text: "useful native delivery output" };
    yield { type: "block-end", index: 0, block: { type: "text", text: "useful native delivery output" } };
    yield { type: "finish", reason: { kind: "stop" } };
  }
}

export interface FixtureAdmission { readonly epoch: string; readonly permitted: boolean }
export interface FixtureEvidence { readonly childId: SessionId; readonly parentId: SessionId; readonly original: FixtureAdmission }

export async function deliveryFixture(options: { bind?: boolean; spawn?: boolean; connection?: boolean; nativeControls?: boolean; images?: boolean; nativeClassification?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "dsmm-c1-delivery-"));
  const ctx = new Context();
  const handles: AgentHandle[] = [];
  const managed = new Set<Agent>();
  try {
    await Promise.all([
      ctx.plugin(AgentRegistry).await(), ctx.plugin(SessionStore).await(), ctx.plugin(SessionProjectionRegistry).await(),
      ctx.plugin(LlmRuntime).await(), ctx.plugin(SystemPrompt, {}).await(), ctx.plugin(ToolRuntime, { mode: "native" }).await(),
      ctx.plugin(JsonlSessionPersistence, { root: join(root, "sessions"), compression: "none" }).await(),
      ctx.plugin(TypertRegistry).await(), ctx.plugin(TypertGatewayService, {}).await(),
    ]);
    await ctx.plugin(ExactQuery).await();
    let runtime!: InstanceType<typeof DsmmSubagentRuntime<FixtureAdmission, FixtureEvidence>>;
    const runtimeFiber = ctx.plugin({ name: "c1-explicit-subagents", apply(scope: Context) {
      runtime = new DsmmSubagentRuntime<FixtureAdmission, FixtureEvidence>(scope,
        { maxDepth: { get: () => 3 }, maxActiveSubagents: { get: () => 8 } },
        options.nativeClassification ? (parent) => managed.has(parent) ? "dsmm" : "native" : undefined);
    } });
    await runtimeFiber.await();
    await ctx.plugin(AgentLoop, {}).await();
    const spawnFiber = options.spawn === false ? undefined : ctx.plugin(Spawn, { providerName: "spawn" });
    await spawnFiber?.await();
    await ctx.plugin(SubagentTools, { provider: "spawn", maxDepth: 3 }).await();
    if (options.nativeControls) await ctx.plugin(await carrierPlugin("@deepseek-ai/dsh-tool-subagent-control")).await();
    if (options.images) {
      const attachment = await carrierPlugin("@deepseek-ai/dsh-attachment-local");
      await ctx.plugin(attachment.default, { dshHome: join(root, "home") }).await();
    }
    const adapter = new DeliveryAdapter();
    ctx.llm.registerAdapter(["fixture"], adapter);
    await ctx.plugin(MemoryCredentials).await();
    let connectionFiber = options.connection === false ? undefined : ctx.plugin(Connection, {});
    await connectionFiber?.await();
    // Await only the public dependency fiber used for Connection lifetime tracking.
    for (const registration of ctx.registry.values()) for (const fiber of registration.fibers) {
      if ("connection" in fiber.inject) await fiber.await();
    }
    const owner = {};
    const admissions = new Map<Agent, FixtureAdmission>();
    const evidence = new Map<SessionId, FixtureEvidence>();
    let beforeEvidence: ((ticket: ParentAdmissionTicket<FixtureAdmission>, id: SessionId, signal: AbortSignal) => Promise<void>) | undefined;
    let bindingScope!: Context;
    const bindingFiber = ctx.plugin({ name: "c1-policy", apply(scope: Context) { bindingScope = scope; } });
    await bindingFiber.await();
    const bind = () => runtime.authority.bindPolicy(bindingScope, owner, {
      classifyParent: (parent) => managed.has(parent) ? "dsmm" : "native",
      async resolveChildEvidence(ticket, id, signal) {
        await beforeEvidence?.(ticket, id, signal);
        signal.throwIfAborted();
        const found = evidence.get(id);
        if (found === undefined) throw new SubagentError("unknown fixture target", "UNAUTHORIZED");
        return found;
      },
      assertDelivery(ticket, id, found) {
        if (found.childId !== id || found.parentId !== ticket.parent.id || !ticket.admission.permitted || !found.original.permitted) {
          throw new SubagentError("fixture target policy refused", "UNAUTHORIZED");
        }
      }
    });
    if (options.bind !== false) { bind(); runtime.authority.enablePolicy(owner); }
    ctx.on("agent/created", ({ agent }) => {
      const parentId = agent.session.header.parentSession;
      if (parentId === undefined) return;
      const parent = ctx.agents.get(parentId)!;
      if (!managed.has(parent)) return;
      const original = evidence.get(agent.id)?.original ?? admissions.get(parent)!;
      evidence.set(agent.id, { childId: agent.id, parentId, original });
      managed.add(agent);
      admissions.set(agent, original);
      runtime.authority.registerParent(agent, original, owner);
    }, { global: true });
    const create = async (isManaged = true, admission: FixtureAdmission = { epoch: randomUUID(), permitted: true }) => {
      const handle = await ctx.agents.create({ sessionId: SessionId(randomUUID()), meta: { cwd: root }, agentOptions: { provider: "fixture", model: "native" } });
      handles.push(handle);
      if (isManaged) {
        managed.add(handle.agent); admissions.set(handle.agent, admission);
        runtime.authority.registerParent(handle.agent, admission, owner);
      }
      return handle.agent;
    };
    const start = (parent: Agent) => runtime.startContinuable({ provider: "spawn", label: "native child", signal: new AbortController().signal,
      request: { parent, maxDepth: 3, prompt: [{ type: "text", text: "initial native input" }] } });
    const request = (parent: Agent, childId: SessionId, text: string, delivery: "queue" | "steer" = "queue"): SubagentPromptRequest => ({
      requestId: randomUUID() as SubagentPromptRequestId, parentSessionId: parent.id, childSessionId: childId, mode: "continuable", delivery, content: [{ type: "text", text }]
    });
    const prompt = (request: SubagentPromptRequest, signal?: AbortSignal) => ctx.typertGateway.invoke({ namespace: "subagents", method: "prompt", args: { request }, ...(signal === undefined ? {} : { signal }) });
    const publish = (parent: Agent, permitted = true, install: () => void = () => {}) => {
      const previous = admissions.get(parent)!;
      const next = Object.freeze({ epoch: randomUUID(), permitted });
      runtime.authority.prepareParentAdmission(parent, previous.epoch, next);
      runtime.authority.publishParentAdmission(parent, previous.epoch, next, () => { admissions.set(parent, next); install(); });
      return next;
    };
    return { root, ctx, runtime, runtimeFiber, spawnFiber, bindingFiber, bindingScope, owner, adapter, admissions, evidence, managed,
      create, start, request, prompt, publish, bind,
      setBeforeEvidence(fn: typeof beforeEvidence) { beforeEvidence = fn; },
      async replaceConnection() {
        await connectionFiber?.dispose();
        connectionFiber = ctx.plugin(Connection, {});
        await connectionFiber.await();
        for (const registration of ctx.registry.values()) for (const fiber of registration.fibers) {
          if ("connection" in fiber.inject) await fiber.await();
        }
      },
      connectionOwner() { return (Reflect.get(ctx.connection, symbols.original) ?? ctx.connection) as Connection.HostConnectionService; },
      beginConnectionDisposal() { assert.ok(connectionFiber); return connectionFiber.dispose(); },
      connectionScope() { assert.ok(connectionFiber); return connectionFiber.ctx; },
      beginAgentDisposal(agent: Agent) { const handle = handles.find((handle) => handle.agent === agent); assert.ok(handle); return handle.dispose(); },
      async disposeAgent(agent: Agent) { const handle = handles.find((handle) => handle.agent === agent); assert.ok(handle); await handle.dispose(); },
      async dispose() {
        // Drain owned native Activations while their projection/session services are still live.
        await runtime.drainContinuableDescendants(handles.map((handle) => handle.agent).filter((agent) => ctx.agents.get(agent.id) === agent));
        assert.ok(ctx.agents.list().every((agent) => handles.some((handle) => handle.agent === agent)));
        for (const handle of [...handles].reverse()) await handle.dispose();
        await ctx.fiber.dispose();
        await rm(root, { recursive: true, force: true });
      }
    };
  } catch (error) { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); throw error; }
}

export function accepted(agent: Agent) {
  return agent.session.snapshotEvents().flatMap((event) => event.type === "agent/inbox/spliced" ? event.data.inserted : []);
}
