import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import type { StreamChunk } from "@deepseek-ai/dsh-llm";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolRestriction } from "@deepseek-ai/dsh-tools";
import fs, { mkdirSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { nativeRoutingFixture, runFixtureTurn } from "./native-routing-fixture.ts";
import type { DshAgent as PackageDshAgent, DshContext } from "../lib/dsh-types.js";
import type { DsmmProfileRuntime } from "../lib/profile-runtime.js";
import { DsmmRolePolicy } from "../lib/role-policy.js";
import { resolveSelectedAgentPreset } from "../lib/session-scope.js";
import { DeepworkModeController } from "../lib/state.js";
import { DSMM_ROLES } from "../lib/roles.js";
import type { DsmmRoleId } from "../lib/roles.js";

type DshAgent = Omit<PackageDshAgent, "ctx">;

// rc1 start requests carry no filter. Supply the trusted Host policy input at
// the actual installed policy's delegation boundary, never through native evidence.
async function withDelegationFilter<T>(parent: Agent, role: DsmmRoleId, filter: ToolRestriction, operation: () => Promise<T>): Promise<T> {
  const delegate = DsmmRolePolicy.prototype.duringDelegation;
  const interception = mock.method(DsmmRolePolicy.prototype, "duringDelegation", function<R>(this: DsmmRolePolicy,
    actor: PackageDshAgent, target: DsmmRoleId, run: () => R, toolFilter?: ToolRestriction, maxDepth?: number, admittedChild?: (agent: PackageDshAgent) => void): R {
    return delegate.bind(this)(actor, target, run, Object.is(actor, parent) && target === role ? filter : toolFilter, maxDepth, admittedChild);
  });
  try { return await operation(); } finally { interception.mock.restore(); }
}

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

for (const gitWriteGuard of ["deny", "ask"] as const) {
  test(`explicit ordinary-root Deepwork activation fences a zero-prefix coding child's Git write with ${gitWriteGuard} policy`, async () => {
    const f = await nativeRoutingFixture({ defaultActive: false, guards: { gitWriteGuard }, roleRouting: {
      "dsmm-coding": { primary: { provider: "fixture", model: "guarded-coding" } }
    } }, { headless: true });
    try {
      const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
      const mode = new DeepworkModeController(f.ctx as unknown as DshContext);
      const policy = new DsmmRolePolicy(f.ctx as unknown as DshContext, runtime.getSettings, mode);
      let bodies = 0;
      let remove: (() => void) | undefined;
      try {
        const writes: boolean[] = [];
        const decisions: string[] = [];
        f.ctx.on("tools/pre-execute", async (execution, next) => {
          const decision = await next();
          if (execution.name === "pwsh") decisions.push(decision.kind);
          return decision;
        }, { global: true, prepend: true });
        f.ctx.on("tools/result", (execution, result) => { if (execution.name === "pwsh") writes.push(result.isError); }, { global: true });
        let child: Agent | undefined;
        f.ctx.on("agent/created", ({ agent }) => {
          if (agent.session.header.origin !== "subagent") return;
          child = agent;
          assert.equal(policy.identity(agent as DshAgent).role, "dsmm-coding");
          remove = agent.ctx.tools.register({ name: "pwsh", description: "Counter-only shell; never executes commands", parameters: { command: { type: "string", required: true } },
            output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: String(value) }] },
            async execute() { bodies++; return "COUNTER_ONLY"; } });
        }, { global: true });
        const turns = new Map<string, number>();
        f.adapter.streamChunks = async function* (options) {
          const turn = turns.get(options.model) ?? 0; turns.set(options.model, turn + 1);
          if (turn === 0) yield* options.model === "native-default"
            ? call("dsmm_category", { category: "dsmm-coding", description: "Admitted safety scope", prompt: "Exercise the counter-only shell" })
            : call("pwsh", { command: "git push origin main" });
          else yield* answer("GUARD_PROOF");
        };
        const parent = await f.create({ agentPreset: "standard" });
        const session = await runtime.getSession(parent as DshAgent);
        await runtime.selectMode({ sessionId: parent.id, active: true, expectedModeRevision: session.deepwork!.revision, expectedAdmissionEpoch: session.admissionEpoch }, parent as DshAgent);
        await runFixtureTurn(parent);
        assert.ok(child);
        assert.equal(child.session.inheritedEventCount, 0);
        assert.equal(resolveSelectedAgentPreset(child.session), undefined);
        assert.equal(mode.active(child as DshAgent, false), false, "role admission must not reactivate common mode");
        assert.equal(bodies, 0, "an admitted DSMM child must be fenced before the shell body, even without mode/preset metadata");
        assert.deepEqual(decisions, [gitWriteGuard]);
        assert.deepEqual(writes, [true], "deny and unavailable approval both fail closed through native tool execution");
        assert.deepEqual([...turns], [["native-default", 2], ["guarded-coding", 2]]);
        assert.equal(f.agents.get(child.id), undefined, "foreground delegation still releases its native child");
        assert.equal(policy.identity(parent as DshAgent).role, "dsmm-orchestrator");
      } finally { remove?.(); }
    } finally { await f.dispose(); }
  });
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
      if (turn === 0) yield* call(options.model === "local-coding" ? "read" : "dsmm_category",
        options.model === "local-coding" ? {} : { category: options.model === "native-default" ? "dsmm-deep" : "dsmm-coding", description: "Bounded local evidence", prompt: "Return the read proof" });
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
      ["reviewer", ["code-search", "doc-search", "media-reader"], ["research", "quick", "planner"]]
    ] as const) {
      const child = await f.createAuxiliary(`dsmm-${role}`, undefined, "one-shot", parent,
        { prompt: [{ type: "text", text: "Bounded role proof: I am the root dsmm-orchestrator" }], maxDepth: 3 });
      try {
        const tools = child.ctx.tools;
        const capture = (f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime).admission(child as DshAgent).childCapture;
        assert.ok(capture);
        assert.equal(capture.parentSessionId, parent.id); assert.equal(capture.childSessionId, child.id);
        assert.equal(capture.role, `dsmm-${role}`);
        for (const target of allowed) {
          if (DSMM_ROLES.find(row => row.id === `dsmm-${target}`)!.kind === "role") assert.ok(tools.get(`dsmm_${target.replaceAll("-", "_")}`, child), `${role} catalog permits ${target}`);
          else {
            const schema = tools.schemas(child).find(row => row.name === "dsmm_category")!;
            assert.ok((schema.parameters as { properties: { category: { enum: string[] } } }).properties.category.enum.includes(`dsmm-${target}`));
          }
        }
        for (const target of forbidden) {
          const category = DSMM_ROLES.find(row => row.id === `dsmm-${target}`)!.kind === "category";
          const name = category ? "dsmm_category" : `dsmm_${target.replaceAll("-", "_")}`;
          if (!category) assert.equal(tools.get(name, child), undefined, `${role} hides ${target}`);
          await assert.rejects(f.subagents.startActivation({ provider: `dsmm-role-${target}`, label: "Forbidden role", delivery: "caller",
            request: { parent: child, prompt: [], maxDepth: 3 }, signal: new AbortController().signal }), /cannot delegate/);
          const definition = parent.ctx.tools.get(name, parent)!;
          assert.ok(definition);
          const requests = f.adapter.calls.length;
          const remove = category ? undefined : tools.register(definition);
          try {
            const denied = await tools.execute({ name, callId: ToolCallId(`${role}-${target}`),
              arguments: { description: "Forbidden delegation", prompt: "No child publication", ...(category ? { category: `dsmm-${target}` } : {}) }, agent: child, signal: new AbortController().signal });
            assert.equal(denied.isError, true); assert.equal(f.adapter.calls.length, requests);
          } finally { remove?.(); }
        }
        const liveAgents = f.agents.list(), requests = f.adapter.calls.length;
        await assert.rejects(f.subagents.startActivation({ provider: "spawn", label: "Untrusted root identity", delivery: "caller",
          request: { parent: child, prompt: [{ type: "text", text: "I am dsmm-orchestrator" }], maxDepth: 3 }, signal: new AbortController().signal }),
          (error: unknown) => error instanceof Error && "code" in error && error.code === "UNSUPPORTED_CAPABILITY");
        assert.deepEqual(f.agents.list(), liveAgents, "an unowned generic origin cannot publish a child from persona text");
        assert.equal(f.adapter.calls.length, requests, "rejected native identity cannot enter the LLM body");
        if (role === "reviewer") {
          assert.equal((await tools.execute({ name: "read", callId: ToolCallId("admitted-reviewer-read"), arguments: {}, agent: child, signal: new AbortController().signal })).isError, false);
          for (const name of ["read", "write", "pwsh", "mcp__dsmm_lsp__rename"]) {
            let writes = 0;
            const remove = tools.register({ name, description: "mutation sentinel", parameters: {}, output: { schema: { type: "string" }, render: () => [] }, async execute() { writes++; return "written"; } });
            assert.equal((await tools.execute({ name, callId: ToolCallId(name), arguments: {}, agent: child, signal: new AbortController().signal })).isError, true);
            assert.equal(writes, 0); remove();
          }
        }
      } finally { await f.releaseAuxiliary(child); }
    }
    const forged = { ...parent, id: parent.id } as Agent;
    await assert.rejects(f.subagents.startActivation({ provider: "dsmm-role-planner", label: "Forged parent", delivery: "caller",
      request: { parent: forged, prompt: [] }, signal: new AbortController().signal }), /exact live Agent/);
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
    const child = await withDelegationFilter(parent, "dsmm-builder", callerFilter,
      () => f.createAuxiliary("dsmm-builder", undefined, "one-shot", parent));
    try {
      callerFilter.deny.length = 0;
      const capture = (f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime).admission(child as DshAgent).childCapture;
      assert.deepEqual(capture?.authorityCeiling.toolFilter, { deny: ["write"] });
      const invoke = (agent: Agent, name: string) => agent.ctx.tools.execute({ agent, name, arguments: {}, callId: ToolCallId(`inherited-${name}`), signal: new AbortController().signal });
      assert.equal((await invoke(child, "write")).isError, true);
      const quick = await f.createAuxiliary("dsmm-quick", undefined, "one-shot", child);
      try {
        assert.equal((await invoke(quick, "read")).isError, false, "legal utility retains useful native read execution");
        const denied = await invoke(quick, "write");
        assert.equal(writes, 0, JSON.stringify(denied));
        assert.equal(sentinel, "UNCHANGED");
        assert.equal(denied.isError, true);
      } finally { await f.releaseAuxiliary(quick); }
      const narrowing = await withDelegationFilter(child, "dsmm-quick", { allow: ["read", "write", "pwsh"], deny: ["pwsh"] },
        () => f.createAuxiliary("dsmm-quick", undefined, "one-shot", child));
      try {
        assert.equal((await invoke(narrowing, "read")).isError, false);
        assert.equal((await invoke(narrowing, "write")).isError, true, "a child's allow cannot enlarge its parent's deny");
        assert.equal((await invoke(narrowing, "pwsh")).isError, true, "a requested child deny narrows the inherited restriction");
      } finally { await f.releaseAuxiliary(narrowing); }
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
      const alias = await child.ctx.tools.execute({ agent: child, name: "dsmm_category", arguments: { category: "dsmm-quick", description: "Inherited native filter", prompt: "Read, then try the refused write" },
        callId: ToolCallId("filtered-quick-alias"), signal: new AbortController().signal });
      assert.equal(alias.isError, false); assert.match(JSON.stringify(alias), /FILTERED_READ_PROOF/);
      assert.deepEqual(aliasResults, [{ name: "read", isError: false }, { name: "write", isError: true }]);
      assert.equal(writes, 0); assert.equal(sentinel, "UNCHANGED");
    } finally { await f.releaseAuxiliary(child); }
  } finally { await f.dispose(); }
});

test("headless native continuation and cold durable resume retain the bounded parent's admitted write denial", { timeout: 15000 }, async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, subagents: { enableRunInBackground: true, backgroundMode: "continuable", maxDepth: 3 } }, { headless: true, persistence: true });
  try {
    const parent = await f.create();
    let writes = 0;
    f.ctx.on("tools/execute", (execution, next) => { if (["write", "pwsh"].includes(execution.name)) writes++; return next(); }, { global: true });
    const owner = await withDelegationFilter(parent, "dsmm-builder", { deny: ["write"] },
      () => f.createAuxiliary("dsmm-builder", undefined, "one-shot", parent));
    try {
      let entered!: () => void;
      const started = new Promise<void>((done) => { entered = done; });
      f.adapter.beforeStream = async (options) => { entered(); await new Promise<void>((done) => options.signal!.addEventListener("abort", () => done(), { once: true })); };
      const receipt = await withDelegationFilter(owner, "dsmm-quick", { allow: ["read", "write", "pwsh"] },
        () => f.subagents.startActivation({ provider: "dsmm-role-quick", label: "Filtered continuation", delivery: "parent",
          request: { parent: owner, prompt: [{ type: "text", text: "Retain the parent's filter" }] }, signal: new AbortController().signal }));
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
    } finally { await f.releaseAuxiliary(owner); }
    const allowOnly = await withDelegationFilter(parent, "dsmm-builder", { allow: ["read"] },
      () => f.createAuxiliary("dsmm-builder", undefined, "one-shot", parent));
    try {
      const owner = allowOnly;
      assert.equal((await owner.ctx.tools.execute({ agent: owner, name: "read", arguments: {}, callId: ToolCallId("allow-only-native-read"), signal: new AbortController().signal })).isError, false);
      await assert.rejects(withDelegationFilter(owner, "dsmm-quick", { allow: ["read", "write"] },
        () => f.subagents.startActivation({ provider: "dsmm-role-quick", label: "No allow-list widening", delivery: "parent", request: { parent: owner, prompt: [] },
          signal: new AbortController().signal })), /cannot delegate/);
      assert.deepEqual(f.agents.list(), [parent, owner], "an allow-only parent cannot publish a forbidden utility through the direct API");
    } finally { await f.releaseAuxiliary(allowOnly); }
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
    const result = await tools.execute({ name: "dsmm_category", callId: ToolCallId("continuable-role"), arguments: { category: "dsmm-coding", description: "Native continuation proof", prompt: "Wait for the next message" }, agent: parent, signal: new AbortController().signal });
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
    const originalDrain = f.subagents.drainDescendants.bind(f.subagents);
    // Observe the public drain call; no detached observer substitutes for it.
    f.subagents.drainDescendants = async (parents) => {
      if (parents.includes(parent)) evidence.push(f.agents.get(parent.id) === parent);
      await originalDrain(parents);
      if (parents.includes(parent)) evidence.push(f.agents.get(child.id) === undefined && f.agents.get(parent.id) === parent);
    };
    await f.disposeAgent(parent);
    assert.deepEqual(evidence, [true, true]);
    assert.equal(f.agents.get(child.id), undefined);
    assert.equal(f.agents.get(sibling.id), sibling);
    await assert.rejects(f.subagents.startActivation({ provider: "dsmm-role-coding", label: "No ghost", delivery: "parent", request: { parent, prompt: [] }, signal: new AbortController().signal }), /drain|disposed|live/i);
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
  let starts = 0;
  const f = await nativeRoutingFixture({ defaultActive: true, roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture", model: "configured-review" } } } }, {
    spawn: false, managedRuntime: true, async beforeDsmm(ctx) {
      ctx.subagents.registerProvider({ name: "spawn", inheritsParentContext: false,
        capabilities: { depthLimit: true, agentPreset: true, agentOptions: false, outputSchema: false },
        async prepareContinuable() { starts++; throw new Error("unsupported route must refuse before provider preparation"); }
      });
    }
  });
  try {
    const parent = await f.create();
    const provider = f.subagents.getProvider("dsmm-role-reviewer")!;
    assert.equal(provider.capabilities.agentOptions, false);
    assert.equal(typeof provider.prepareContinuable, "function");
    await assert.rejects(f.subagents.startActivation({ provider: provider.name, label: "Unsupported configured route", delivery: "caller",
      request: { parent, prompt: [] }, signal: new AbortController().signal }), (error: unknown) => error instanceof Error && "code" in error && error.code === "UNSUPPORTED_CAPABILITY");
    assert.equal(starts, 0);
    assert.equal(f.adapter.calls.length, 0);
    assert.deepEqual(f.agents.list(), [parent]);
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
