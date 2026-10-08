import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import type { StreamChunk } from "@deepseek-ai/dsh-llm";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { SessionId } from "@deepseek-ai/dsh-session";
import fs, { mkdirSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { nativeRoutingFixture, runFixtureTurn } from "./native-routing-fixture.ts";

function* call(name: string, args: unknown): Generator<StreamChunk> {
  const id = ToolCallId(`call-${name}`), argumentsText = JSON.stringify(args);
  yield { type: "block-start", index: 0, blockType: "tool-call" };
  yield { type: "tool-call-delta", index: 0, id, name, argumentsDelta: argumentsText };
  yield { type: "block-end", index: 0, block: { type: "tool-call", id, name, arguments: argumentsText } };
  yield { type: "finish", reason: { kind: "tool-calls" } };
}

function* answer(text: string): Generator<StreamChunk> {
  yield { type: "block-start", index: 0, blockType: "text" };
  yield { type: "text-delta", index: 0, text };
  yield { type: "block-end", index: 0, block: { type: "text", text } };
  yield { type: "finish", reason: { kind: "stop" } };
}

test("mock LLM drives root → deep → coding → read and returns the child's useful result through native tools", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, subagents: { maxDepth: 3 }, roleRouting: {
    "dsmm-deep": { primary: { provider: "fixture", model: "local-deep" } },
    "dsmm-coding": { primary: { provider: "fixture", model: "local-coding" } }
  } }, { headless: true });
  try {
    const reads: Array<{ model?: string; isError: boolean; value: unknown }> = [];
    f.ctx.on("tools/result", (execution, result) => {
      if (execution.name === "read") reads.push({ model: execution.agent?.options.model, isError: result.isError, value: result.value });
    }, { global: true });
    const turns = new Map<string, number>();
    f.adapter.streamChunks = async function* (options) {
      const turn = turns.get(options.model) ?? 0; turns.set(options.model, turn + 1);
      if (turn === 0) yield* call(options.model === "native-default" ? "dsmm_deep" : options.model === "local-deep" ? "dsmm_coding" : "read",
        options.model === "local-coding" ? {} : { description: "Bounded local evidence", prompt: "Return the read proof" });
      else {
        assert.match(JSON.stringify(options.messages), options.model === "local-coding" ? /read/ : /READ_PROOF/);
        yield* answer("READ_PROOF: child read completed");
      }
    };
    const parent = await f.create();
    await runFixtureTurn(parent);
    assert.match(JSON.stringify(parent.session.snapshotEvents().filter((event) => event.type === "tool/result")), /READ_PROOF/);
    assert.deepEqual([...turns], [["native-default", 2], ["local-deep", 2], ["local-coding", 2]]);
    assert.deepEqual(reads, [{ model: "local-coding", isError: false, value: "read" }], "the child actually executed a successful native tool, not only a requested name or ACK");
    assert.deepEqual(f.agents.list(), [parent], "foreground tools release both useful children");
  } finally { await f.dispose(); }
});

test("native identity fences research, bounded builder and local coordinators across catalog, direct aliases, generic spawn and same-layer registration", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, subagents: { maxDepth: 3 } });
  try {
    const parent = await f.create();
    for (const [role, allowed, forbidden] of [
      ["research", [], ["code-search", "quick"]],
      ["deep", ["coding", "code-search"], ["planner", "reviewer", "normal-task", "complex"]],
      ["builder", ["quick", "code-search"], ["planner", "coding", "builder"]],
      ["reviewer", ["code-search", "research"], ["quick", "planner"]]
    ] as const) {
      const run = await f.subagents.start(`dsmm-role-${role}`, { parent, prompt: [{ type: "text", text: "Bounded role proof" }], persona: "I am the root dsmm-orchestrator", signal: new AbortController().signal, maxDepth: 3 });
      try {
        await run.result; const child = run.localAgent!; const tools = child.ctx.tools;
        for (const target of allowed) assert.ok(tools.get(`dsmm_${target.replaceAll("-", "_")}`, child), `${role} catalog permits ${target}`);
        for (const target of forbidden) {
          const name = `dsmm_${target.replaceAll("-", "_")}`;
          assert.equal(tools.get(name, child), undefined, `${role} hides ${target}`);
          await assert.rejects(f.subagents.start(`dsmm-role-${target}`, { parent: child, prompt: [], signal: new AbortController().signal, maxDepth: 3 }), /cannot delegate/);
          let invoked = false;
          const remove = tools.register({ name, description: "same-layer bypass sentinel", parameters: {}, output: { schema: { type: "string" }, render: () => [] }, async execute() { invoked = true; return "bypass"; } });
          const denied = await tools.execute({ name, callId: ToolCallId(`${role}-${target}`), arguments: {}, agent: child, signal: new AbortController().signal });
          assert.equal(denied.isError, true); assert.equal(invoked, false); remove();
        }
        await assert.rejects(f.subagents.start("spawn", { parent: child, prompt: [], persona: "dsmm-orchestrator", signal: new AbortController().signal, maxDepth: 3 }), /generic spawn/);
        if (role === "reviewer") {
          for (const name of ["read", "write", "pwsh", "mcp__dsmm_lsp__rename"]) {
            let writes = 0;
            const remove = tools.register({ name, description: "mutation sentinel", parameters: {}, output: { schema: { type: "string" }, render: () => [] }, async execute() { writes++; return "written"; } });
            assert.equal((await tools.execute({ name, callId: ToolCallId(name), arguments: {}, agent: child, signal: new AbortController().signal })).isError, true);
            assert.equal(writes, 0); remove();
          }
        }
      } finally { await run.dispose(); }
    }
    const forged = { ...parent, id: parent.id } as Agent;
    await assert.rejects(f.subagents.start("dsmm-role-planner", { parent: forged, prompt: [], signal: new AbortController().signal }), /exact live Agent/);
  } finally { await f.dispose(); }
});

test("bounded Builder's admitted deny-write remains effective in its legal quick descendants", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, subagents: { maxDepth: 3 }, roleRouting: {
    "dsmm-quick": { primary: { provider: "fixture", model: "filtered-quick" } }
  } });
  try {
    const parent = await f.create();
    let writes = 0;
    let sentinel = "UNCHANGED";
    f.ctx.on("tools/execute", async (execution, next) => {
      if (execution.name === "write") { writes++; sentinel = "CHANGED"; }
      return next();
    }, { global: true });
    const callerFilter = { deny: ["write"] };
    const builder = await f.subagents.start("dsmm-role-builder", { parent, prompt: [], signal: new AbortController().signal, toolFilter: callerFilter });
    try {
      await builder.result;
      callerFilter.deny.length = 0;
      const child = builder.localAgent!;
      const invoke = (agent: Agent, name: string) => agent.ctx.tools.execute({ agent, name, arguments: {}, callId: ToolCallId(`inherited-${name}`), signal: new AbortController().signal });
      assert.equal((await invoke(child, "write")).isError, true);
      const quick = await f.subagents.start("dsmm-role-quick", { parent: child, prompt: [], signal: new AbortController().signal });
      try {
        await quick.result;
        assert.equal((await invoke(quick.localAgent!, "read")).isError, false, "legal utility retains useful native read execution");
        const denied = await invoke(quick.localAgent!, "write");
        assert.equal(writes, 0, JSON.stringify(denied));
        assert.equal(sentinel, "UNCHANGED");
        assert.equal(denied.isError, true);
      } finally { await quick.dispose(); }
      const narrowing = await f.subagents.start("dsmm-role-quick", { parent: child, prompt: [], signal: new AbortController().signal,
        toolFilter: { allow: ["read", "write", "pwsh"], deny: ["pwsh"] } });
      try {
        await narrowing.result;
        assert.equal((await invoke(narrowing.localAgent!, "read")).isError, false);
        assert.equal((await invoke(narrowing.localAgent!, "write")).isError, true, "a child's allow cannot enlarge its parent's deny");
        assert.equal((await invoke(narrowing.localAgent!, "pwsh")).isError, true, "a requested child deny narrows the inherited restriction");
      } finally { await narrowing.dispose(); }
      const aliasResults: Array<{ name: string; isError: boolean }> = [];
      f.ctx.on("tools/result", (execution, result) => {
        if (execution.agent?.options.model === "filtered-quick") aliasResults.push({ name: execution.name, isError: result.isError });
      }, { global: true });
      let turn = 0;
      f.adapter.streamChunks = async function* () {
        if (turn++ === 0) yield* call("read", {});
        else if (turn === 2) yield* call("write", {});
        else yield* answer("FILTERED_READ_PROOF");
      };
      const alias = await child.ctx.tools.execute({ agent: child, name: "dsmm_quick", arguments: { description: "Inherited native filter", prompt: "Read, then try the refused write" },
        callId: ToolCallId("filtered-quick-alias"), signal: new AbortController().signal });
      assert.equal(alias.isError, false); assert.match(JSON.stringify(alias), /FILTERED_READ_PROOF/);
      assert.deepEqual(aliasResults, [{ name: "read", isError: false }, { name: "write", isError: true }]);
      assert.equal(writes, 0); assert.equal(sentinel, "UNCHANGED");
    } finally { await builder.dispose(); }
  } finally { await f.dispose(); }
});

test("headless native continuation and cold durable resume retain the bounded parent's admitted write denial", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, subagents: { enableRunInBackground: true, backgroundMode: "continuable", maxDepth: 3 } }, { headless: true, persistence: true });
  try {
    const parent = await f.create();
    let writes = 0;
    f.ctx.on("tools/execute", (execution, next) => { if (["write", "pwsh"].includes(execution.name)) writes++; return next(); }, { global: true });
    const builder = await f.subagents.start("dsmm-role-builder", { parent, prompt: [], signal: new AbortController().signal, toolFilter: { deny: ["write"] } });
    try {
      await builder.result;
      const owner = builder.localAgent!;
      let entered!: () => void;
      const started = new Promise<void>((done) => { entered = done; });
      f.adapter.beforeStream = async (options) => { entered(); await new Promise<void>((done) => options.signal!.addEventListener("abort", () => done(), { once: true })); };
      const receipt = await f.subagents.startContinuable({ provider: "dsmm-role-quick", label: "Filtered continuation", request: { parent: owner, prompt: [{ type: "text", text: "Retain the parent's filter" }],
        toolFilter: { allow: ["read", "write", "pwsh"] } }, signal: new AbortController().signal });
      await started;
      const child = f.agents.get(receipt.childId)!;
      const invoke = (agent: Agent, name: string) => agent.ctx.tools.execute({ agent, name, arguments: {}, callId: ToolCallId(`continuable-${name}`), signal: new AbortController().signal });
      assert.equal((await invoke(child, "read")).isError, false);
      assert.equal((await invoke(child, "write")).isError, true);
      assert.equal((await invoke(child, "glob")).isError, true, "the child's requested allow narrows otherwise legal tools");
      f.subagents.interrupt(child.id, { kind: "ancestor", agent: owner });
      await child.whenIdle();
      f.adapter.beforeStream = undefined;
      let turn = 0;
      f.adapter.streamChunks = async function* () {
        if (turn++ === 0) yield* call("write", {});
        else if (turn === 2) yield* call("glob", {});
        else yield* answer("FILTERED_CONTINUATION_PROOF");
      };
      let released!: () => void;
      const disposed = new Promise<void>((done) => { released = done; });
      f.ctx.on("agent/disposed", ({ agent }) => { if (agent === child) released(); }, { global: true });
      await f.subagents.sendMessage(owner, child.id, [{ type: "text", text: "Continue with the inherited denial" }], { signal: new AbortController().signal });
      await child.whenIdle(); await disposed;
      assert.match(JSON.stringify(child.session.snapshotEvents()), /FILTERED_CONTINUATION_PROOF/);
      turn = 0;
      await f.subagents.sendMessage(owner, child.id, [{ type: "text", text: "Cold resume without enlarging permissions" }], { signal: new AbortController().signal });
      const resumed = f.agents.get(child.id)!;
      assert.ok(resumed); assert.notEqual(resumed, child); assert.equal(resumed.id, child.id);
      await resumed.whenIdle();
      assert.match(JSON.stringify(resumed.session.snapshotEvents()), /FILTERED_CONTINUATION_PROOF/);
      assert.equal(writes, 0);
    } finally { await builder.dispose(); }
    const allowOnly = await f.subagents.start("dsmm-role-builder", { parent, prompt: [], signal: new AbortController().signal, toolFilter: { allow: ["read"] } });
    try {
      await allowOnly.result;
      const owner = allowOnly.localAgent!;
      assert.equal((await owner.ctx.tools.execute({ agent: owner, name: "read", arguments: {}, callId: ToolCallId("allow-only-native-read"), signal: new AbortController().signal })).isError, false);
      await assert.rejects(f.subagents.startContinuable({ provider: "dsmm-role-quick", label: "No allow-list widening", request: { parent: owner, prompt: [], toolFilter: { allow: ["read", "write"] } },
        signal: new AbortController().signal }), /cannot delegate/);
      assert.deepEqual(f.agents.list(), [parent, owner], "an allow-only parent cannot publish a forbidden utility through the direct API");
    } finally { await allowOnly.dispose(); }
  } finally { await f.dispose(); }
});

test("opt-in native continuable role accepts a second message on the same child, isolates interrupt authority, and drains before exact parent detach", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, subagents: { enableRunInBackground: true, backgroundMode: "continuable", maxDepth: 3 } }, { persistence: true });
  try {
    const parent = await f.create(), sibling = await f.create();
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    f.adapter.beforeStream = async (options) => {
      entered();
      await new Promise<void>((resolve) => options.signal!.addEventListener("abort", () => resolve(), { once: true }));
    };
    const tools = parent.ctx.tools;
    const result = await tools.execute({ name: "dsmm_coding", callId: ToolCallId("continuable-role"), arguments: { description: "Native continuation proof", prompt: "Wait for the next message" }, agent: parent, signal: new AbortController().signal });
    assert.equal(result.isError, false);
    const { subagentId } = result.value as { subagentId: string };
    const child = f.agents.get(subagentId as Agent["id"]);
    assert.ok(child); assert.equal(f.agents.isOwnedBy(child.id, parent), true);
    await started;
    const delivered = await f.subagents.sendMessage(parent, child.id, [{ type: "text", text: "SAME_CHILD_MESSAGE" }], { signal: new AbortController().signal });
    assert.ok(delivered);
    assert.equal(f.agents.get(child.id), child);
    assert.throws(() => f.subagents.interrupt(child.id, { kind: "ancestor", agent: sibling }), /descendant/);
    f.subagents.interrupt(child.id, { kind: "ancestor", agent: parent });
    await child.whenIdle();
    const evidence: boolean[] = [];
    const originalDrain = f.subagents.drainContinuableDescendants.bind(f.subagents);
    // Observe the public drain call; no detached observer substitutes for it.
    f.subagents.drainContinuableDescendants = async (parents) => {
      if (parents.includes(parent)) evidence.push(f.agents.get(parent.id) === parent);
      await originalDrain(parents);
      if (parents.includes(parent)) evidence.push(f.agents.get(child.id) === undefined && f.agents.get(parent.id) === parent);
    };
    await f.disposeAgent(parent);
    assert.deepEqual(evidence, [true, true]);
    assert.equal(f.agents.get(child.id), undefined);
    assert.equal(f.agents.get(sibling.id), sibling);
    await assert.rejects(f.subagents.startContinuable({ provider: "dsmm-role-coding", label: "No ghost", request: { parent, prompt: [] }, signal: new AbortController().signal }), /drain|disposed|live/i);
  } finally { await f.dispose(); }
});

test("host-denied plan edits must not read or disclose the target outside the native read boundary", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true });
  try {
    const directory = join(f.profileDir, "docs", "superpowers", "plans");
    mkdirSync(directory, { recursive: true });
    const path = join(directory, "host-denied.md");
    writeFileSync(path, "- [private-checklist] HOST_READ_DENIED_SENTINEL\nreplace me\n");
    const parent = await f.create({ cwd: f.profileDir });
    const before = fs.readFileSync(path, "utf8");
    let reads = 0, dispatches = 0;
    const readFile = fs.readFileSync;
    const spy = mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => {
      if (args[0] === path) reads++;
      return readFile(...args);
    });
    syncBuiltinESMExports();
    f.ctx.on("tools/execute", async (exec, next) => { if (exec.name === "edit" || exec.name === "read") dispatches++; return next(); });
    let hostDecisions = 0;
    f.ctx.on("tools/pre-execute", async (exec, next) => {
      if (exec.name === "read" || exec.name === "edit") { hostDecisions++; return { kind: "deny", reason: "HOST_FILE_POLICY_DENIED" }; }
      return next();
    });
    try {
      const result = await parent.ctx.tools.execute({ name: "edit", callId: ToolCallId("host-denied-plan-edit"), arguments: { file_path: path, old_string: "replace me", new_string: "replacement" }, agent: parent, signal: new AbortController().signal });
      assert.equal(result.isError, true);
      assert.match(JSON.stringify(result), /unsupported-full-preview/);
      assert.doesNotMatch(JSON.stringify(result), /HOST_READ_DENIED_SENTINEL/, "format helpers must not turn a denied target into a Node.js filesystem read oracle");
      assert.equal(reads, 0);
      assert.equal(dispatches, 0);
      assert.equal(hostDecisions, 0, "the unsupported protected edit refuses before requesting downstream work");
    } finally { spy.mock.restore(); syncBuiltinESMExports(); }
    assert.equal(fs.readFileSync(path, "utf8"), before);
  } finally { await f.dispose(); }
});

test("alias capability checks also reject route options contributed by its admitted configuration", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture", model: "configured-review" } } } }, { spawn: false });
  try {
    const parent = await f.create();
    let starts = 0;
    const remove = f.subagents.registerProvider({ name: "spawn", inheritsParentContext: false,
      capabilities: { depthLimit: true, toolFilter: true, persona: true, agentOptions: false, outputSchema: false },
      async start() {
        starts++;
        return { id: SessionId("must-not-start"), localAgent: undefined, result: Promise.resolve({ stopReason: "completed" as const, output: [] }), async dispose() {} };
      }
    });
    try {
      const provider = f.subagents.getProvider("dsmm-role-reviewer")!;
      assert.equal(provider.capabilities.agentOptions, false);
      assert.equal(provider.prepareContinuable, undefined);
      await assert.rejects(f.subagents.start(provider.name, { parent, prompt: [], signal: new AbortController().signal }), (error: unknown) => error instanceof Error && "code" in error && error.code === "UNSUPPORTED_CAPABILITY");
      assert.equal(starts, 0);
      assert.deepEqual(f.agents.list(), [parent]);
    } finally { remove(); }
  } finally { await f.dispose(); }
});

test("native complete plan writes preserve host refusal, observation/CAS, malformed-content rejection and ordinary edit semantics", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true }, { nativeFs: true });
  try {
    const parent = await f.create({ cwd: f.profileDir });
    const path = join(f.profileDir, "docs", "superpowers", "plans", "complete.md");
    mkdirSync(join(f.profileDir, "docs", "superpowers", "plans"), { recursive: true });
    const run = (name: string, args: unknown) => parent.ctx.tools.execute({ name, arguments: args, callId: ToolCallId(`native-plan-${name}`), agent: parent, signal: new AbortController().signal });
    const content = "# Complete native plan\n\n- [ ] Verify implementation\n";
    assert.equal((await run("write", { file_path: path, content })).isError, false);
    assert.equal(fs.readFileSync(path, "utf8"), content);
    assert.equal((await run("write", { file_path: path, content: "- [private-checklist] supplied malformed plan\n" })).isError, true);
    assert.equal(fs.readFileSync(path, "utf8"), content);
    let denyWrite = true;
    f.ctx.on("tools/pre-execute", async (exec, next) => exec.name === "write" && denyWrite ? { kind: "deny", reason: "NATIVE_STRONGER_WRITE_DENY" } : next());
    assert.match(JSON.stringify(await run("write", { file_path: path, content: "# Approved shape\n- [ ] still denied\n" })), /NATIVE_STRONGER_WRITE_DENY/);
    assert.equal(fs.readFileSync(path, "utf8"), content);
    denyWrite = false;
    writeFileSync(path, "# External change\n- [ ] external\n");
    const stale = await run("write", { file_path: path, content });
    assert.equal(stale.isError, true); assert.match(JSON.stringify(stale), /stale|changed|version/i);
    assert.equal(fs.readFileSync(path, "utf8"), "# External change\n- [ ] external\n");
    const ordinary = join(f.profileDir, "ordinary.txt");
    writeFileSync(ordinary, "old old\n");
    assert.equal((await run("edit", { file_path: ordinary, old_string: "old", new_string: "new" })).isError, true, "unobserved native edit cannot gain a read pin from DSMM");
    assert.equal((await run("read", { file_path: ordinary })).isError, false);
    assert.equal((await run("edit", { file_path: ordinary, old_string: "old", new_string: "new" })).isError, true, "native unique-match refusal remains");
    assert.equal((await run("edit", { file_path: ordinary, old_string: "old", new_string: "new", replace_all: true })).isError, false);
    assert.equal(fs.readFileSync(ordinary, "utf8"), "new new\n");
  } finally { await f.dispose(); }
});
