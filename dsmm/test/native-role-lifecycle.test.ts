import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import type { StreamChunk } from "@deepseek-ai/dsh-llm";
import { nativeFixturePlugin, nativeRoutingFixture, runFixtureTurn } from "./native-routing-fixture.ts";

function* call(name: string, args: unknown): Generator<StreamChunk> {
  const id = ToolCallId(`native-${name}`), text = JSON.stringify(args);
  yield { type: "block-start", index: 0, blockType: "tool-call" };
  yield { type: "tool-call-delta", index: 0, id, name, argumentsDelta: text };
  yield { type: "block-end", index: 0, block: { type: "tool-call", id, name, arguments: text } };
  yield { type: "finish", reason: { kind: "tool-calls" } };
}
function* answer(text: string): Generator<StreamChunk> {
  yield { type: "block-start", index: 0, blockType: "text" };
  yield { type: "text-delta", index: 0, text };
  yield { type: "block-end", index: 0, block: { type: "text", text } };
  yield { type: "finish", reason: { kind: "stop" } };
}

async function presetHostServices(ctx: import("@deepseek-ai/cordis").Context): Promise<void> {
  const denied = async (): Promise<never> => { throw new Error("fixture forbids web/shell/subprocess operations"); };
  const web = await nativeFixturePlugin("@deepseek-ai/dsh-web", "@deepseek-ai/dsh-tool-web");
  await ctx.plugin(web.default, {}).await();
  ctx.provide("subprocess", { spawn: denied });
  ctx.provide("shell", { execute: denied });
  ctx.provide("shellEnv", { resolve: denied });
}

test("real native root Builder owns formal planning; native plan review returns complete Markdown without upgrading planner file permissions", async () => {
  const reviews: string[] = [];
  const plan = "# Native complete plan\n\n- [ ] Implement bounded change\n- [ ] Verify result\n";
  let planner: import("@deepseek-ai/dsh-agent").Agent | undefined;
  const f = await nativeRoutingFixture({ subagents: { maxDepth: 3 }, roleRouting: { "dsmm-planner": { primary: { provider: "fixture", model: "formal-planner" } } } }, {
    nativePresets: true, nativeFs: true, nativeJobs: true,
    async beforeDsmm(ctx) {
      await presetHostServices(ctx);
      const module = await nativeFixturePlugin("@deepseek-ai/dsh-plan-mode");
      await ctx.plugin(module.default, { section: "Return the complete Markdown plan for native review; role permissions do not change." }).await();
      ctx.provide("userQuestions", { async ask(request: { questions: Array<{ id: string; detail?: string }> }) {
        reviews.push(request.questions[0].detail!);
        return { answers: [{ id: request.questions[0].id, selected: ["Approve"] }] };
      } });
      ctx.on("agent/created", ({ agent }) => {
        if (agent.options.model === "formal-planner") { planner = agent; ctx.get("planMode")!.set(agent, true); }
      }, { global: true });
    }
  });
  try {
    const directory = join(f.profileDir, "docs", "superpowers", "plans"); mkdirSync(directory, { recursive: true });
    const path = join(directory, "formal.md");
    const attempts = new Map<string, number>();
    f.adapter.streamChunks = async function* (options) {
      const step = attempts.get(options.model) ?? 0; attempts.set(options.model, step + 1);
      if (options.model === "formal-planner") {
        if (step === 0) yield* call("exit_plan_mode", { plan });
        else if (step === 1) yield* call("write", { file_path: path, content: plan });
        else yield* answer(plan);
      } else if (step === 0) yield* call("dsmm_planner", { description: "Formal native planning", prompt: "Return a complete native-reviewed Markdown plan" });
      else if (step === 1) yield* call("write", { file_path: path, content: plan });
      else yield* answer("Native coordinator persisted the reviewed plan");
    };
    const root = await f.create({ agentPreset: "dsmm-builder", cwd: f.profileDir });
    assert.equal(f.ctx.get("agentPresets")!.composedPreset(root.ctx), "dsmm-builder");
    await runFixtureTurn(root);
    assert.deepEqual(reviews, [plan]);
    assert.ok(planner);
    const results = planner.session.snapshotEvents().filter((event) => event.type === "tool/result");
    assert.match(JSON.stringify(results), /Plan approved/);
    assert.match(JSON.stringify(results), /write.*(?:UNKNOWN_TOOL|not permit)|(?:UNKNOWN_TOOL|not permit).*write/s);
    assert.equal(readFileSync(path, "utf8"), plan);
    assert.deepEqual(f.agents.list(), [root]);
  } finally { await f.dispose(); }
});

test("native blank preset rebind refreshes actual tool realm while planner remains read-only and permitted utilities remain callable", async () => {
  const f = await nativeRoutingFixture({ subagents: { maxDepth: 3 } }, { nativePresets: true, nativeFs: true, nativeJobs: true, beforeDsmm: presetHostServices });
  try {
    const root = await f.create({ agentPreset: "dsmm-builder", cwd: f.profileDir });
    const presets = f.ctx.get("agentPresets")!;
    await presets.select(root, "dsmm-planner");
    await f.ctx.get("systemPrompt")!.assemble({ scope: root });
    const tools = presets.serviceFor(root, "tools") ?? root.ctx.get("tools")!;
    assert.ok(tools.get("dsmm_code_search", root));
    const denied = await tools.execute({ agent: root, name: "write", callId: ToolCallId("rebound-planner-write"), arguments: { file_path: join(f.profileDir, "sentinel"), content: "not allowed" }, signal: new AbortController().signal });
    assert.equal(denied.isError, true);
    const utility = await tools.execute({ agent: root, name: "dsmm_code_search", callId: ToolCallId("rebound-planner-utility"), arguments: { description: "Read-only utility proof", prompt: "Return a useful local result" }, signal: new AbortController().signal });
    assert.equal(utility.isError, false); assert.match(JSON.stringify(utility), /fixture complete/);
    const illegal = await tools.execute({ agent: root, name: "dsmm_quick", callId: ToolCallId("rebound-planner-quick"), arguments: { description: "Forbidden quick", prompt: "No write permission" }, signal: new AbortController().signal });
    assert.equal(illegal.isError, true);
  } finally { await f.dispose(); }
});

test("native one-shot background jobs deliver useful output, enforce owner cancellation and release owned children", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, subagents: { enableRunInBackground: true, maxDepth: 3 } }, { nativeJobs: true });
  try {
    const parent = await f.create(), foreign = await f.create();
    const tools = parent.ctx.get("tools")!, jobs = f.ctx.get("jobs")!;
    const start = () => tools.execute({ agent: parent, name: "dsmm_coding", callId: ToolCallId("native-background"), arguments: { description: "Owned native background", prompt: "Return useful background result", run_in_background: true }, signal: new AbortController().signal });
    const first = await start(); assert.equal(first.isError, false);
    const id = (first.value as { jobId: string }).jobId as Parameters<typeof jobs.get>[0];
    assert.equal((await jobs.wait(id, 5000, parent.id)).status, "completed");
    const output = jobs.read(id, parent.id); assert.match(output.result ?? "", /fixture complete/);
    assert.throws(() => jobs.read(id, foreign.id), /another|foreign|own/i);
    let entered!: () => void;
    const started = new Promise<void>((done) => { entered = done; });
    f.adapter.beforeStream = async (options) => { entered(); await new Promise<void>((done) => options.signal!.addEventListener("abort", () => done(), { once: true })); };
    const second = await start(); assert.equal(second.isError, false); await started;
    const secondId = (second.value as { jobId: string }).jobId as Parameters<typeof jobs.get>[0];
    assert.throws(() => jobs.kill(secondId, foreign.id), /another|foreign|own/i);
    jobs.kill(secondId, parent.id, "explicit native cancellation");
    assert.equal((await jobs.wait(secondId, 5000, parent.id)).status, "killed");
    assert.deepEqual(f.agents.list(), [parent, foreign]);
  } finally { await f.dispose(); }
});

test("native default depth and unknown filters refuse before publication; foreground failure and abort retain typed terminal outcomes", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, roleRouting: { "dsmm-coding": { primary: { provider: "fixture", model: "typed-error" } } } });
  try {
    const parent = await f.create();
    f.adapter.streamChunks = async function* () { yield* call("structured_output", { ok: true }); };
    const structured = await f.subagents.start("dsmm-role-coding", { parent, prompt: [], signal: new AbortController().signal, toolFilter: { allow: ["read"] },
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } });
    try { const result = await structured.result; assert.equal(result.stopReason, "completed"); assert.deepEqual(result.structured, { ok: true }); }
    finally { await structured.dispose(); f.adapter.streamChunks = undefined; }
    await assert.rejects(f.subagents.start("dsmm-role-reviewer", { parent, prompt: [], signal: new AbortController().signal, toolFilter: { allow: ["unknown-native-tool-filter"] } }), /unknown|not.*registered/i);
    assert.deepEqual(f.agents.list(), [parent]);
    const deep = await f.subagents.start("dsmm-role-deep", { parent, prompt: [], signal: new AbortController().signal });
    try {
      await deep.result;
      const child = deep.localAgent!;
      const overDepth = await child.ctx.get("tools")!.execute({ agent: child, name: "dsmm_coding", callId: ToolCallId("native-depth-default"), arguments: { description: "Legitimate but too deep", prompt: "Native default 1 applies" }, signal: new AbortController().signal });
      assert.equal(overDepth.isError, true); assert.match(JSON.stringify(overDepth), /depth/i);
      assert.equal(f.agents.list().length, 2);
    } finally { await deep.dispose(); }
    f.adapter.failModels.add("typed-error");
    const fail = await parent.ctx.get("tools")!.execute({ agent: parent, name: "dsmm_coding", callId: ToolCallId("typed-child-failure"), arguments: { description: "Typed failure proof", prompt: "Fail inside mock model" }, signal: new AbortController().signal });
    assert.equal(fail.isError, true); assert.match(JSON.stringify(fail), /ERROR|subagent error/);
    f.adapter.failModels.clear();
    let entered!: () => void;
    const started = new Promise<void>((done) => { entered = done; });
    f.adapter.beforeStream = async (options) => { entered(); await new Promise<void>((done) => options.signal!.addEventListener("abort", () => done(), { once: true })); };
    const abort = new AbortController();
    const pending = parent.ctx.get("tools")!.execute({ agent: parent, name: "dsmm_coding", callId: ToolCallId("typed-child-abort"), arguments: { description: "Owned abort proof", prompt: "Wait for abort" }, signal: abort.signal });
    await started; abort.abort();
    const cancelled = await pending; assert.equal(cancelled.isError, true); assert.match(JSON.stringify(cancelled), /ABORTED|abort|cancel/i);
    assert.deepEqual(f.agents.list(), [parent]);
  } finally { await f.dispose(); }
});

test("native continuable capacity is per-parent and builtin controls continue useful output on the same interrupted child", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, subagents: { enableRunInBackground: true, backgroundMode: "continuable", maxDepth: 3 } }, { persistence: true, nativeSubagents: { maxActiveSubagents: 1 } });
  try {
    const parent = await f.create(), other = await f.create();
    let entered!: () => void;
    const started = new Promise<void>((done) => { entered = done; });
    f.adapter.beforeStream = async (options) => { entered(); await new Promise<void>((done) => options.signal!.addEventListener("abort", () => done(), { once: true })); };
    const invoke = (agent: typeof parent, name: string, args: unknown) => agent.ctx.get("tools")!.execute({ agent, name, arguments: args, callId: ToolCallId(name), signal: new AbortController().signal });
    const first = await invoke(parent, "dsmm_coding", { description: "Durable child proof", prompt: "Wait for continuation" });
    assert.equal(first.isError, false);
    const id = (first.value as { subagentId: string }).subagentId as typeof parent.id;
    const child = f.agents.get(id)!; await started;
    const overflow = await invoke(parent, "dsmm_coding", { description: "Capacity refusal", prompt: "Must not publish" });
    assert.equal(overflow.isError, true); assert.match(JSON.stringify(overflow), /capacity|maxActive|limit|active.*subagent/i);
    const independent = await invoke(other, "dsmm_coding", { description: "Independent parent pool", prompt: "No cross-parent starvation" });
    assert.equal(independent.isError, false);
    const sent = await invoke(parent, "send_message", { agent_id: id, message: "SAME_CHILD_CONTINUATION_INPUT" }); assert.equal(sent.isError, false);
    const foreignInterrupt = await invoke(other, "interrupt_agent", { agent_id: id }); assert.equal(foreignInterrupt.isError, true);
    assert.equal((await invoke(parent, "interrupt_agent", { agent_id: id })).isError, false);
    await child.whenIdle();
    f.adapter.beforeStream = undefined;
    f.adapter.streamChunks = async function* () { yield* answer("CONTINUED_USEFUL_OUTPUT"); };
    let released!: () => void;
    const disposed = new Promise<void>((done) => { released = done; });
    f.ctx.on("agent/disposed", ({ agent }) => { if (agent === child) released(); }, { global: true });
    assert.equal((await invoke(parent, "send_message", { agent_id: id, message: "Wake the retained conversation" })).isError, false);
    assert.equal(f.agents.get(id), child, "the durable id still selects the exact retained Agent, not a replacement task");
    await child.whenIdle();
    const events = child.session.snapshotEvents();
    assert.match(JSON.stringify(events), /SAME_CHILD_CONTINUATION_INPUT/);
    assert.match(JSON.stringify(events.filter((event) => event.type === "assistant/message")), /CONTINUED_USEFUL_OUTPUT/);
    await disposed;
    const cold = await invoke(parent, "send_message", { agent_id: id, message: "Cold-resume the same durable child" });
    assert.equal(cold.isError, false, JSON.stringify(cold));
    const resumed = f.agents.get(id);
    assert.ok(resumed); assert.notEqual(resumed, child); assert.equal(resumed.id, child.id);
    await resumed.whenIdle();
    assert.match(JSON.stringify(resumed.session.snapshotEvents()), /Cold-resume the same durable child/);
    await f.disposeAgent(other);
    assert.equal(f.agents.list().some((agent) => agent !== parent && f.agents.isOwnedBy(agent.id, other)), false);
  } finally { await f.dispose(); }
});
