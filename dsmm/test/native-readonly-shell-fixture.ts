import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { getTraceable, symbols } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import type { ToolExecutionResult } from "@deepseek-ai/dsh-tools";
import type { DshAgent, DshContext } from "../lib/dsh-types.js";
import type { DsmmProfileRuntime } from "../lib/profile-runtime.js";
import type { DsmmPluginConfig } from "../src/settings.ts";
import * as ManagedBash from "../lib/permission-bash.js";
import * as ManagedPwsh from "../lib/permission-pwsh.js";
import DsmmPlugin from "../lib/index.js";
import { PermissionRefusal } from "../lib/permission-control.js";
import { scopeParentOf } from "../lib/native-scope.js";
import { nativeFixturePlugin, nativeRoutingFixture, runFixtureTurn } from "./native-routing-fixture.ts";

const sandbox = await nativeFixturePlugin("@deepseek-ai/dsh-sandbox-policy");
const approval = await nativeFixturePlugin("@deepseek-ai/dsh-user-approval");

async function shellFixture(managed: boolean, config: DsmmPluginConfig = {}, nativePresets = true, ownShells = false) {
  const f = await nativeRoutingFixture({ defaultActive: true, guards: { scope: "off" },
    presets: { plannerRootEnabled: true }, ...config }, {
    nativePresets, nativeFs: true, nativeJobs: true, fixtureShells: false, persistence: true,
    async beforeDsmm(ctx) {
      const noWeb = async (): Promise<never> => { throw new Error("No external web requests in readonly shell regression"); };
      ctx.provide("web", { search: noWeb, fetch: noWeb });
      await ctx.plugin(sandbox.SandboxPolicyService, { mode: "danger-full-access" }).await();
      await ctx.plugin(approval.ApprovalService, { policy: "never" }).await();
      for (const name of ["subprocess-local", "sandbox-local", "shell-env"]) {
        const plugin = await nativeFixturePlugin(`@deepseek-ai/dsh-${name}`);
        await ctx.plugin(plugin.default ?? plugin, {}).await();
      }
      const bash = await ctx.get("subprocess")!.resolveExecutable("bash");
      if (process.platform === "win32" && /[\\/](?:system32|windowsapps)[\\/]bash\.exe$/iu.test(realpathSync(bash))) {
        throw new Error("The readonly shell regression requires native Bash, not a user WSL launcher");
      }
      const executor = await nativeFixturePlugin("@deepseek-ai/dsh-bash-sandbox");
      await ctx.plugin(executor.SandboxBashExecutor, { timeoutMs: 10000, maxTimeoutMs: 10000, maxOutputBytes: 4096, graceMs: 200 }).await();
    }
  });
  let starts = 0, approvals = 0;
  const subprocess = f.ctx.get("subprocess")!;
  const spawn = subprocess.spawn;
  let spawnCwd: string | undefined;
  // Observe the actual SDK process boundary without changing shell definitions or arguments.
  subprocess.spawn = function (...args: Parameters<typeof spawn>) { starts++; spawnCwd = (args[0] as { cwd?: string }).cwd; return Reflect.apply(spawn, this, args); };
  f.ctx.on("approval/request", (_request, next) => { approvals++; return next(); }, { global: true, prepend: true });
  try {
    let pwshScope: typeof f.ctx, pwshPlugin: typeof ManagedPwsh, pwshFiber: typeof f.ctx.fiber;
    const mountShells = async (agent?: Agent) => {
      const base = agent === undefined ? f.ctx : agent.ctx.isolate("tools");
      if (agent !== undefined) base.provide("tools", f.ctx.get("agentPresets")!.serviceFor(agent, "tools") ?? agent.ctx.get("tools")!);
      for (const kind of ["bash", "pwsh"] as const) {
        const scope = kind === "bash" ? base : base.isolate("shell");
        if (kind === "pwsh") {
          const executor = await nativeFixturePlugin("@deepseek-ai/dsh-pwsh-sandbox");
          await scope.plugin(executor.SandboxPwshExecutor,
            { cwd: f.profileDir, timeoutMs: 10000, maxTimeoutMs: 10000, maxOutputBytes: 4096, graceMs: 200 }).await();
        }
        const plugin = managed ? kind === "bash" ? ManagedBash : ManagedPwsh : await nativeFixturePlugin(`@deepseek-ai/dsh-tool-${kind}`);
        const fiber = scope.plugin(plugin, {});
        await fiber.await();
        if (kind === "pwsh") { pwshScope = scope; pwshPlugin = plugin; pwshFiber = fiber; }
      }
    };
    if (!ownShells) await mountShells();
    for (const id of nativePresets ? ["dsmm-orchestrator", "dsmm-builder", "dsmm-planner"] : []) {
      const preset = await f.ctx.get("agentPresets")!.resolve(id);
      assert.equal(preset.broken, undefined, JSON.stringify(preset));
    }
    const subject = join(f.profileDir, "readonly-sentinel.txt"), original = "unchanged readonly sentinel\n";
    writeFileSync(subject, original, { flag: "wx" });
    const requests = [
      { name: "write", args: { file_path: join(f.profileDir, "write-marker"), content: "write control\n" }, content: "write control\n" },
      { name: "edit", args: { file_path: subject, old_string: "unchanged", new_string: "changed" }, content: "changed readonly sentinel\n" },
      { name: "bash", args: { command: "pwd -P; printf 'bash control\\n' > 'bash-marker'", description: "Task-owned shell control", workdir: f.profileDir }, content: "bash control\n" },
      { name: "pwsh", args: { command: `[IO.File]::WriteAllText('${join(f.profileDir, "pwsh-marker")}', 'pwsh control')`, description: "Task-owned shell control", workdir: f.profileDir }, content: "pwsh control" }
    ];
    const paths = [join(f.profileDir, "write-marker"), subject, join(f.profileDir, "bash-marker"), join(f.profileDir, "pwsh-marker")];
    const toolsFor = (agent: Agent) => {
      const raw = f.ctx.get("agentPresets")?.serviceFor(agent, "tools");
      return raw === undefined ? agent.ctx.get("tools")! : getTraceable(agent.ctx, raw);
    };
    const execute = (agent: Agent, name: string, args: unknown) => toolsFor(agent).execute({ agent, name, arguments: args,
      callId: ToolCallId(randomUUID()), signal: new AbortController().signal });
    const full = (agent: Agent) => {
      sandbox.setSandboxMode(agent.session, "danger-full-access"); approval.setApprovalPolicy(agent.session, "never");
      assert.equal(agent.ctx.get("sandboxPolicy")!.resolve({ session: agent.session }).mode, "danger-full-access");
      assert.equal(agent.ctx.get("approval")!.overrideOf(agent.session), "never");
      assert.equal(f.agents.get(agent.id) === agent, true, "the exact fixture Agent must remain live");
    };
    const noApprovals = (agent: Agent) => {
      assert.equal(approvals, 0);
      assert.equal(agent.session.snapshotEvents().some(event => event.type === "approval/asked" || event.type === "approval/decided"), false);
    };
    const noEffects = () => { assert.equal(readFileSync(subject, "utf8"), original); for (const path of paths.filter(path => path !== subject)) assert.equal(existsSync(path), false, path); };
    const read = async (agent: Agent) => {
      const result = await execute(agent, "read", { file_path: subject });
      assert.equal(result.isError, false, JSON.stringify(result));
      assert.ok(result.content.some(block => block.type === "text" && block.text.includes(original.trim())));
    };
    const control = async (agent: Agent, requireManaged = managed) => {
      full(agent); await read(agent);
      assert.equal((await execute(agent, "read", { file_path: paths[0] })).isError, true);
      if (requireManaged) {
        assert.deepEqual(f.ctx.get("dsmmPermissionController")!.coverage(agent).map(row => row.name).sort(), ["bash", "pwsh"]);
        if (!ownShells) for (const name of ["bash", "pwsh"]) assert.equal(toolsFor(agent).get(name, agent), f.tools.get(name, agent));
      }
      const before = starts;
      for (const [index, request] of requests.entries()) {
        const result = await execute(agent, request.name, request.args);
        assert.equal(result.isError, false, JSON.stringify(result));
        if (request.name === "bash" || request.name === "pwsh") {
          const evidence = JSON.stringify({ name: request.name, args: request.args, spawnCwd, result });
          assert.equal((result as { value?: { exitCode?: number } }).value?.exitCode, 0, evidence);
          assert.equal(realpathSync(spawnCwd!), realpathSync(f.profileDir), evidence);
          assert.equal(existsSync(paths[index]), true, evidence);
        }
        assert.equal(readFileSync(paths[index], "utf8"), request.content);
        if (paths[index] === subject) writeFileSync(subject, original); else unlinkSync(paths[index]);
      }
      assert.equal(starts - before, 2); noApprovals(agent); noEffects();
    };
    const denied = async (agent: Agent, missingPwsh = false) => {
      full(agent); await read(agent); const before = starts;
      assert.equal((await execute(agent, "read", { file_path: paths[0] })).isError, true);
      if (managed) for (const name of missingPwsh ? ["bash"] : ["bash", "pwsh"]) {
        assert.ok(f.ctx.get("dsmmPermissionController")!.coverage(ownShells ? agent : undefined).some(row => row.name === name));
        if (!ownShells) assert.equal(toolsFor(agent).get(name, agent), f.tools.get(name, agent), "the tested selected tool must be the managed registration");
      }
      const results = [];
      for (const request of requests) results.push({ tool: request.name, result: await execute(agent, request.name, request.args) });
      // Report both real effects and original ToolRuntime results on a boundary failure.
      assert.deepEqual(results.map(row => [row.tool, row.result.isError]), requests.map(row => [row.name, true]), JSON.stringify({ results, starts: starts - before, effects: paths.map(path => existsSync(path) ? readFileSync(path, "utf8") : null) }));
      assert.equal(starts, before, "readonly tools must not start a shell"); noEffects(); noApprovals(agent);
    };
    return { ...f, requests, execute, control, denied, full, read, noEffects, noApprovals, toolsFor, mountShells, starts: () => starts,
      async unmountPwsh() { await pwshFiber.dispose(); },
      async mountPwsh() { pwshFiber = pwshScope.plugin(pwshPlugin, {}); await pwshFiber.await(); },
      dispose: async () => { subprocess.spawn = spawn; await f.dispose(); } };
  } catch (error) { subprocess.spawn = spawn; await f.dispose(); throw error; }
}

for (const managed of [false, true]) {
  test(`native readonly own-layer-only ${managed ? "managed" : "raw"} bash/pwsh composes without masking local tools and preserves runtime denial`, async t => {
    const f = await shellFixture(managed, { defaultActive: false, guards: { scope: "off" } }, true, true);
    try {
      const presets = f.ctx.get("agentPresets")!;
      const root = await f.create({ agentPreset: "standard" }, undefined, { async setup(_ctx, agent) { await f.mountShells(agent); } });
      await f.control(root);
      const shells = ["bash", "pwsh"].map(name => f.toolsFor(root).get(name, root));
      await presets.select(root, "dsmm-planner");
      assert.equal(presets.composedPreset(root.ctx), "dsmm-planner");
      for (const name of ["bash", "pwsh"]) {
        assert.ok(f.toolsFor(root).get(name, root), "own-layer shell stays visible");
        assert.equal(f.toolsFor(root).get(name, scopeParentOf(root)), undefined, "no same-name inherited shell");
      }
      await f.ctx.serial("tools/change");
      await f.denied(root);
      await presets.select(root, "standard");
      assert.equal(presets.composedPreset(root.ctx), "standard");
      assert.deepEqual(["bash", "pwsh"].map(name => f.toolsFor(root).get(name, root)), shells);
      await f.control(root);
      t.diagnostic("own-layer-only real shell: ordinary sameargs starts=2; readonly selection/reconcile succeeds, four mutations denied, starts=0; read and switchback succeed; approvals=0");
    } finally { await f.dispose(); }
  });

  test(`native Full Access readonly child blocks real ${managed ? "managed" : "raw"} bash/pwsh before execution, direct and AgentLoop`, async t => {
    const f = await shellFixture(managed);
    try {
      const parent = await f.create({ agentPreset: "standard" }); await f.control(parent);
      const child = await f.createAuxiliary("dsmm-reviewer", undefined, "one-shot", parent);
      const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
      assert.equal(runtime.admission(child as unknown as DshAgent).childCapture?.authorityCeiling.readOnly, true);
      assert.equal(f.agents.isOwnedBy(child.id, parent), true);
      assert.equal(f.toolsFor(child).get("read", child), f.toolsFor(parent).get("read", parent));
      await f.denied(child);
      const results: Array<{ name: string; result: ToolExecutionResult }> = [];
      f.ctx.on("tools/result", (exec, result) => { if (exec.agent === child) results.push({ name: exec.name, result }); }, { global: true });
      let step = 0;
      const loopRequests = [{ name: "read", args: { file_path: join(f.profileDir, "readonly-sentinel.txt") } }, ...f.requests];
      f.adapter.streamChunks = async function* () {
        const request = loopRequests[step++];
        if (request === undefined) {
          yield { type: "block-start", index: 0, blockType: "text" };
          yield { type: "block-end", index: 0, block: { type: "text", text: "complete" } };
          yield { type: "finish", reason: { kind: "stop" } }; return;
        }
        const id = ToolCallId(randomUUID()), args = JSON.stringify(request.args);
        yield { type: "block-start", index: 0, blockType: "tool-call" };
        yield { type: "tool-call-delta", index: 0, id, name: request.name, argumentsDelta: args };
        yield { type: "block-end", index: 0, block: { type: "tool-call", id, name: request.name, arguments: args } };
        yield { type: "finish", reason: { kind: "tool-calls" } };
      };
      const before = f.starts(), calls = f.adapter.calls.length; await runFixtureTurn(child);
      assert.equal(f.adapter.calls.length - calls, 6);
      assert.deepEqual(results.map(row => [row.name, row.result.isError]), [["read", false], ...f.requests.map(row => [row.name, true])]);
      assert.ok(results[0].result.content.some(block => block.type === "text" && block.text.includes("unchanged readonly sentinel")));
      assert.equal(f.starts(), before); f.noEffects(); f.noApprovals(child);
      t.diagnostic("parent real shell starts=2; child direct+6-turn AgentLoop starts=0; read succeeds, four mutations denied per path; approvals=0");
    } finally { await f.dispose(); }
  });

  test(`native Full Access readonly Root/DW-off/scope-off rejects ${managed ? "managed" : "raw"} shell; ordinary switchback and unknown-policy controls execute`, async t => {
    const f = await shellFixture(managed, { defaultActive: false, guards: { scope: "off" } });
    try {
      const presets = f.ctx.get("agentPresets")!;
      const root = await f.create({ agentPreset: "standard" });
      await f.control(root);
      await presets.select(root, "dsmm-planner");
      assert.equal(presets.composedPreset(root.ctx), "dsmm-planner");
      assert.equal(f.agents.get(root.id), root);
      await f.denied(root);
      await presets.select(root, "standard");
      assert.equal(presets.composedPreset(root.ctx), "standard");
      await f.control(root);
      const ordinary = await f.create({ agentPreset: "standard" }); await f.control(ordinary);
      const rules = f.ctx.get("dsmmPermissionController")!.rules, refresh = rules.refresh;
      try {
        for (const error of [new PermissionRefusal("unavailable"), ...["EIO", "EACCES"].map(code => Object.assign(new Error("Owned policy read failure"), { code }))]) {
          let reads = 0;
          rules.refresh = async () => { reads++; throw error; };
          const unknownPolicyOrdinary = await f.create({ agentPreset: "standard" });
          await f.control(unknownPolicyOrdinary);
          if (managed) assert.ok(reads > 0, "the managed path must exercise the unavailable policy reader");
        }
      } finally { rules.refresh = refresh; }
      for (const name of ["bash", "pwsh"]) {
        const result = await f.execute(ordinary, name, { command: "exit 23", description: "Preserve native nonzero shell outcome", workdir: f.profileDir });
        assert.equal((result as { value?: { exitCode?: number } }).value?.exitCode, 23, JSON.stringify(result));
      }
      f.noEffects(); f.noApprovals(ordinary);
      const late = await f.create({ agentPreset: "standard" }); await f.control(late);
      await f.unmountPwsh();
      await presets.select(late, "dsmm-planner");
      assert.equal(presets.composedPreset(late.ctx), "dsmm-planner");
      await f.denied(late, true);
      await f.mountPwsh();
      await f.denied(late);
      const selectedTools = presets.serviceFor(late, "tools") ?? late.ctx.get("tools")!;
      const plannerTools = Reflect.get(selectedTools, symbols.original) ?? selectedTools;
      await presets.select(late, "standard");
      await f.control(late);
      const restrict = plannerTools.restrict, failure = new Error("Owned readonly restriction installation failure");
      try {
        plannerTools.restrict = () => { throw failure; };
        await presets.select(late, "dsmm-planner");
        assert.equal(presets.composedPreset(late.ctx), "dsmm-planner");
        await assert.rejects(f.ctx.serial("tools/change"), error => error === failure);
        await f.denied(late);
        await presets.select(late, "standard");
      } finally { plannerTools.restrict = restrict; }
      await f.control(late);
      t.diagnostic("same Root ordinary→Planner→ordinary; optional pwsh absent/late and throwing schema restriction retain four-tool runtime denial, read and native switchback");
    } finally { await f.dispose(); }
  });

  test(`retained, reinstalled and cold-reopened reviewer keeps real ${managed ? "managed" : "raw"} shell denial from its original readonly ceiling`, async t => {
    const config: DsmmPluginConfig = { defaultActive: true, guards: { scope: "off" }, presets: { plannerRootEnabled: true },
      subagents: { enableRunInBackground: true, backgroundMode: "continuable" } };
    const f = await shellFixture(managed, config, false);
    let reinstall: ReturnType<typeof f.ctx.plugin> | undefined;
    try {
      const parent = await f.create({ agentPreset: "standard" }); await f.control(parent);
      let child = await f.createAuxiliary("dsmm-reviewer", undefined, "continuable", parent);
      // The native pre-step hold keeps this exact Agent resident until drain/resume.
      f.full(child);
      const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
      const captured = runtime.admission(child as unknown as DshAgent);
      assert.equal(captured.childCapture?.authorityCeiling.readOnly, true);
      assert.equal(captured.childCapture.authorityCeiling.toolFilter, undefined);
      await f.denied(child);
      const mode = await runtime.getSession(parent as unknown as DshAgent);
      await runtime.selectMode({ sessionId: parent.id, active: false, expectedModeRevision: mode.deepwork!.revision,
        expectedAdmissionEpoch: mode.admissionEpoch }, parent as unknown as DshAgent);
      const overlay = await runtime.save({ id: "readonly-parent-overlay", expectedRevision: null,
        content: '{"version":1,"id":"readonly-parent-overlay","settings":{"workflow":{"reviewCap":2},"guards":{"scope":"off"}}}' });
      const session = await runtime.getSession(parent as unknown as DshAgent);
      await runtime.selectSession({ sessionId: parent.id, id: overlay.id, expectedRevision: overlay.revision,
        expectedSelectionRevision: session.selection.selectionRevision, expectedAdmissionEpoch: session.admissionEpoch }, parent as unknown as DshAgent);
      assert.notEqual(runtime.admission(parent as unknown as DshAgent).epoch, captured.epoch);
      assert.equal(runtime.admission(child as unknown as DshAgent), captured);
      await f.denied(child);
      const active = await runtime.getSession(parent as unknown as DshAgent);
      await runtime.selectMode({ sessionId: parent.id, active: true, expectedModeRevision: active.deepwork!.revision,
        expectedAdmissionEpoch: active.admissionEpoch }, parent as unknown as DshAgent);
      await f.dsmmFiber.dispose();
      reinstall = f.ctx.plugin({ name: "readonly-shell-reinstall", inject: [...DsmmPlugin.inject], apply(ctx) {
        return DsmmPlugin.apply(ctx as unknown as DshContext, { ...config, presets: { ...config.presets, root: join(f.profileDir, "agent-presets") } });
      } });
      await reinstall.await();
      const replacement = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
      await f.subagents.sendMessage(parent, child.id, [{ type: "text", text: "Retain original readonly capture" }], { signal: new AbortController().signal });
      assert.equal(f.agents.get(child.id) === child, true, "retained child must be the same exact live Agent");
      assert.deepEqual(replacement.admission(child as unknown as DshAgent).childCapture, captured.childCapture);
      await f.denied(child);
      const original = child;
      child = await f.resumeAuxiliary(child);
      assert.notEqual(child, original); assert.equal(child.id, original.id);
      assert.deepEqual(replacement.admission(child as unknown as DshAgent).childCapture, captured.childCapture);
      assert.equal(replacement.admission(child as unknown as DshAgent).epoch, captured.epoch);
      await f.denied(child);
      t.diagnostic("original readOnly=true ceiling survives parent mode/profile, reinstall and native session resume; real shell starts=0 at every child boundary");
    } finally { await f.dispose(); await reinstall?.dispose(); }
  });
}
