import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after } from "node:test";
import type { Agent, AgentHandle } from "@deepseek-ai/dsh-agent";
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from "@deepseek-ai/dsh-llm";
import type { SubagentRun } from "@deepseek-ai/dsh-subagent";
import type { SessionId as NativeSessionId } from "@deepseek-ai/dsh-session";
import type { RoleRunBackgroundRequest, RoleRunHolder, RoleRunInvocation, RoleRunStart } from "../src/role-runs.ts";

const sdk = createRequire(process.env.DSMM_TEST_DSH_ENTRY ?? import.meta.url);
const sourceJs = new Map(["delivery-authority", "role-runs"].map((name) => [
  new URL(`../src/${name}.js`, import.meta.url).href, new URL(`../src/${name}.ts`, import.meta.url).href,
]));
let resolvingSdk = false;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (!resolvingSdk && specifier.startsWith("@deepseek-ai/") && process.env.DSMM_TEST_DSH_ENTRY !== undefined) {
    resolvingSdk = true;
    try { return { url: pathToFileURL(sdk.resolve(specifier)).href, shortCircuit: true }; }
    finally { resolvingSdk = false; }
  }
  if (context.parentURL !== undefined) {
    const source = sourceJs.get(new URL(specifier, context.parentURL).href);
    if (source !== undefined) return { url: source, shortCircuit: true };
  }
  return next(specifier, context);
} });
after(() => hooks.deregister());

const { Context } = await import("@deepseek-ai/cordis");
const { AgentRegistry } = await import("@deepseek-ai/dsh-agent");
const { AgentLoop } = await import("@deepseek-ai/dsh-agent-loop");
const { LlmAdapter, LlmRuntime, ToolCallId } = await import("@deepseek-ai/dsh-llm");
const { SessionId, SessionStore } = await import("@deepseek-ai/dsh-session");
const { SessionProjectionRegistry } = await import("@deepseek-ai/dsh-session-projection");
const { SystemPrompt } = await import("@deepseek-ai/dsh-system-prompt");
const { ToolRuntime } = await import("@deepseek-ai/dsh-tools");
const Spawn = await import("@deepseek-ai/dsh-subagent-spawn-in-process");
const Jobs = await import(pathToFileURL(sdk.resolve("@deepseek-ai/dsh-jobs-local")).href);
const JobTools = await import("@deepseek-ai/dsh-tool-jobs");
const Query = await import(pathToFileURL(sdk.resolve("@deepseek-ai/dsh-session-query")).href);
export const { SubagentError } = await import("@deepseek-ai/dsh-subagent");
export const { RoleRunRegistry } = await import("../src/role-runs.ts");
const { DsmmSubagentRuntime } = await import("../src/subagent-runtime.ts");

export function gate<T = void>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { release = resolve; });
  return { promise, release };
}

async function untilReleased(promise: Promise<void>, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (signal === undefined) return promise;
  await new Promise<void>((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(() => { cleanup(); resolve(); }, (error) => { cleanup(); reject(error); });
  });
}

class RunAdapter extends LlmAdapter {
  readonly entered = gate();
  readonly output = gate();
  readonly calls: GenerateOptions[] = [];
  failure?: Error;
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return { provider, id: model, name: model, inputModalities: ["text"] };
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls.push(options);
    this.entered.release();
    await untilReleased(this.output.promise, options.signal);
    if (this.failure !== undefined) throw this.failure;
    for (const [index, block] of [{ type: "reasoning" as const, text: "native reasoning block" }, { type: "text" as const, text: "useful native run output" }].entries()) {
      yield { type: "block-start", index, blockType: block.type };
      yield { type: "block-end", index, block };
    }
    yield { type: "finish", reason: { kind: "stop" } };
  }
}

class ExactQuery extends Query.SessionQueryEngine {
  async searchSessions(): Promise<never> { throw new Error("run fixture does not provide full-text search"); }
  async searchEvents(): Promise<never> { throw new Error("run fixture does not provide full-text search"); }
}

export interface Admission { readonly epoch: string; readonly permitted: boolean }
export interface ChildEvidence { readonly parent: Agent; readonly childId: NativeSessionId }
export interface RunCapture { readonly originalAdmission: Admission; readonly role: string }
export interface RunProjection { readonly description: string }

export async function roleRunFixture(options: { jobs?: boolean; controller?: boolean; permitted?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "dsmm-c2a-role-run-"));
  const ctx = new Context();
  const handles: AgentHandle[] = [];
  const runs: SubagentRun[] = [];
  const owner = {};
  const managed = new Set<Agent>();
  const admissions = new Map<Agent, Admission>();
  const counters = { starts: 0, resultReads: 0, disposals: 0, children: 0 };
  const revoked: Array<{ agent: Agent; reason: string }> = [];
  let disposeFault: Error | undefined;
  let beforeAuthorization: ((identity: RoleRunInvocation<RunCapture, RunProjection>) => void) | undefined;
  let allowed = options.permitted !== false;
  try {
    await Promise.all([
      ctx.plugin(AgentRegistry).await(), ctx.plugin(SessionStore).await(), ctx.plugin(SessionProjectionRegistry).await(),
      ctx.plugin(LlmRuntime).await(), ctx.plugin(SystemPrompt, {}).await(), ctx.plugin(ToolRuntime, { mode: "native" }).await(),
    ]);
    await ctx.plugin(ExactQuery).await();
    let runtime!: InstanceType<typeof DsmmSubagentRuntime<Admission, ChildEvidence>>;
    await ctx.plugin({ name: "c2a-native-subagents", apply(scope: InstanceType<typeof Context>) {
      runtime = new DsmmSubagentRuntime<Admission, ChildEvidence>(scope, { maxDepth: { get: () => 3 }, maxActiveSubagents: { get: () => 8 } },
        (agent) => managed.has(agent) ? "dsmm" : "native");
    } }).await();
    await ctx.plugin(AgentLoop, {}).await();
    await ctx.plugin(Spawn, { providerName: "spawn" }).await();
    if (options.jobs !== false) await ctx.plugin(Jobs.default, {}).await();
    if (options.jobs !== false && options.controller !== false) await ctx.plugin(JobTools, { completionDelivery: "quiet" }).await();
    runtime.authority.bindPolicy(ctx, owner, {
      classifyParent: (agent) => managed.has(agent) ? "dsmm" : "native",
      async resolveChildEvidence(ticket, childId, signal) {
        const catalog = await runtime.listChildren(ticket.parent.id, signal);
        if (!catalog.some((entry) => entry.id === childId)) throw new SubagentError("unknown native child", "UNAUTHORIZED");
        return { parent: ticket.parent, childId };
      },
      assertDelivery(ticket, childId, evidence) {
        if (evidence.parent !== ticket.parent || evidence.childId !== childId || !ticket.admission.permitted) {
          throw new SubagentError("foreign native child", "UNAUTHORIZED");
        }
      },
    });
    runtime.authority.enablePolicy(owner);
    const adapter = new RunAdapter();
    ctx.llm.registerAdapter(["fixture"], adapter);
    const teardown = {
      revokeParent(agent: Agent, reason: string) { revoked.push({ agent, reason }); runtime.authority.revokeParent(agent, reason); },
      async disposeRun(run: SubagentRun) {
        counters.disposals++;
        if (run.localAgent !== undefined) {
          assert.throws(() => runtime.authority.acquireParentTicket(run.localAgent!), (error: unknown) => error instanceof SubagentError && error.code === "UNAUTHORIZED");
        }
        await run.dispose();
        if (disposeFault !== undefined) throw disposeFault;
      },
    };
    const registry = new RoleRunRegistry<RunCapture, RunProjection>(ctx, {
      currentEpoch(parent, currentOwner) {
        if (owner !== currentOwner) throw new SubagentError("foreign run owner", "UNAUTHORIZED");
        const ticket = runtime.authority.acquireParentTicket(parent);
        assert.equal(ticket.owner, owner);
        return ticket.parentEpoch;
      },
      canBackground(parent, identity, epoch) {
        assert.equal(identity.parent, parent);
        assert.equal(identity.owner, owner);
        beforeAuthorization?.(identity);
        return allowed && admissions.get(parent)?.epoch === epoch;
      },
      teardown,
    });
    ctx.on("agent/created", ({ agent }) => {
      const parentId = agent.session.header.parentSession;
      if (parentId === undefined) return;
      counters.children++;
      managed.add(agent);
      const admission = admissions.get(ctx.agents.get(parentId)!)!;
      admissions.set(agent, admission);
      runtime.authority.registerParent(agent, admission, owner);
    }, { global: true });
    const create = async () => {
      const handle = await ctx.agents.create({ sessionId: SessionId(randomUUID()), meta: { cwd: root }, agentOptions: { provider: "fixture", model: "native" } });
      handles.push(handle);
      managed.add(handle.agent);
      const admission = Object.freeze({ epoch: randomUUID(), permitted: true });
      admissions.set(handle.agent, admission);
      runtime.authority.registerParent(handle.agent, admission, owner);
      return handle.agent;
    };
    const parent = await create();
    const start = (overrides: Partial<RoleRunStart<RunCapture, RunProjection>> = {}) => {
      const caller = new AbortController();
      const selected = overrides.parent ?? parent;
      const capture = Object.freeze({ originalAdmission: admissions.get(selected)!, role: "dsmm-coding" });
      const projection = Object.freeze({ description: "same native run" });
      const request: RoleRunStart<RunCapture, RunProjection> = { parent: selected, owner, sessionId: selected.id,
        toolCallId: ToolCallId(randomUUID()), admissionEpoch: admissions.get(selected)!.epoch, capture, projection,
        label: projection.description, callerAbort: caller.signal, jobs: ctx.get("jobs"),
        async start(signal) {
          counters.starts++;
          const run = await runtime.start("spawn", { parent: selected, prompt: [{ type: "text", text: "return a useful result" }], signal, maxDepth: 3 });
          runs.push(run);
          const result = run.result;
          Object.defineProperty(run, "result", { get() { counters.resultReads++; return result; } });
          return run;
        }, ...overrides };
      return { holder: registry.start(request), caller, request };
    };
    const address = (holder: RoleRunHolder<RunCapture, RunProjection>): RoleRunBackgroundRequest => {
      const identity = holder.invocation;
      assert.ok(identity);
      return { parent: identity.parent, owner, sessionId: identity.sessionId, toolCallId: identity.toolCallId,
        runId: identity.runId, expectedAdmissionEpoch: admissions.get(identity.parent)!.epoch };
    };
    const publish = (agent = parent) => {
      const previous = admissions.get(agent)!;
      const next = Object.freeze({ epoch: randomUUID(), permitted: true });
      runtime.authority.prepareParentAdmission(agent, previous.epoch, next);
      runtime.authority.publishParentAdmission(agent, previous.epoch, next, () => admissions.set(agent, next));
      return next;
    };
    return { root, ctx, runtime, registry, parent, owner, adapter, admissions, counters, runs, revoked, create, start, address, publish,
      setAllowed(value: boolean) { allowed = value; },
      setBeforeAuthorization(fn: typeof beforeAuthorization) { beforeAuthorization = fn; },
      setDisposeFault(error: Error | undefined) { disposeFault = error; },
      async disposeParent(agent = parent) {
        teardown.revokeParent(agent, "trusted-parent-dispose");
        await registry.drainParent(agent, owner, "trusted-parent-dispose");
        const handle = handles.find((handle) => handle.agent === agent)!;
        await handle.dispose();
      },
      async dispose() {
        disposeFault = undefined;
        registry.close("fixture-disposed");
        await registry.drain();
        const agents = ctx.get("agents");
        if (agents !== undefined) await runtime.drainContinuableDescendants(handles.map((handle) => handle.agent).filter((agent) => agents.get(agent.id) === agent));
        for (const handle of [...handles].reverse()) { teardown.revokeParent(handle.agent, "fixture-disposed"); await handle.dispose(); }
        await ctx.fiber.dispose();
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); throw error; }
}
