import assert from "node:assert/strict";
import { test, mock } from "node:test";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { resolve, join, toNamespacedPath } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import { nativeRoutingFixture } from "./native-routing-fixture.ts";
import { createDsmmStatusSnapshot } from "../lib/status.js";
import type { DsmmProfileRuntime } from "../lib/profile-runtime.js";
import type { DshAgent } from "../lib/dsh-types.js";
import type { DshContext } from "../lib/dsh-types.js";
import { DsmmDeploymentConfig } from "../lib/deployment-config.js";

test("opt-in startup mounts the actual installed LSP through native MCP, forwards status/cancel and disposes its owned process and tool generation", async (t) => {
  const command = resolve("..", "dist", "bin", process.platform === "win32" ? "ocmm-lsp.exe" : "ocmm-lsp");
  const spawned: childProcess.ChildProcess[] = [];
  const wireCalls: Array<{ name: string; filePath: string; line: number; character: number }> = [];
  const pipeSpies: Array<() => void> = [];
  const spawn = childProcess.spawn;
  const spy = mock.method(childProcess, "spawn", (...args: Parameters<typeof childProcess.spawn>) => {
    const child = spawn(...args);
    if (args[0] === command) {
      spawned.push(child);
      if (child.stdin !== null) {
        const write = child.stdin.write;
        const pipeSpy = mock.method(child.stdin, "write", function (...chunks: Parameters<typeof write>) {
          for (const line of String(chunks[0]).split("\n")) {
            if (line.trim() === "") continue;
            const packet = JSON.parse(line);
            if (packet.method === "tools/call" && packet.params.name === "find_symbol_related") wireCalls.push({ name: packet.params.name, ...packet.params.arguments });
          }
          return write.apply(child.stdin!, chunks);
        });
        pipeSpies.push(() => pipeSpy.mock.restore());
      }
    }
    return child;
  });
  syncBuiltinESMExports();
  let f: Awaited<ReturnType<typeof nativeRoutingFixture>> | undefined;
  try {
    f = await nativeRoutingFixture({ defaultActive: true }, { nativeFs: true, async beforeDsmm(ctx) {
      const directory = (ctx.get("profileContext") as { dir: string }).dir;
      mkdirSync(join(directory, "go-cache"));
      writeFileSync(join(directory, "go.mod"), "module dsmm.native/fixture\n\ngo 1.20\n");
      writeFileSync(join(directory, "fixture.go"), 'package main\nfunc greet() string { return "hello" }\nfunc main() { _ = greet() }\n');
      const deployment = new DsmmDeploymentConfig(ctx as unknown as DshContext, {});
      await deployment.saveGlobal({ expectedRevision: "absent", edits: [{ op: "set", path: ["lsp"], value: { enabled: true, command, args: ["mcp"], cwd: directory, toolCallTimeoutMs: 60_000,
        env: { GOTOOLCHAIN: "local", GOPROXY: "off", GOSUMDB: "off", GOENV: "off", GOPATH: join(directory, "gopath"), GOMODCACHE: join(directory, "go-mod-cache"), GOCACHE: join(directory, "go-cache"),
          OCMM_LSP_USER_CONFIG: join(directory, "absent-user-lsp.json"), OCMM_LSP_PROJECT_CONFIG: join(directory, "absent-project-lsp.json") } } }] }, () => {});
    } });
    const spawnCounts = [spawned.length];
    const agent = await f.create();
    spawnCounts.push(spawned.length);
    const run = (name: string, signal = new AbortController().signal) => agent.ctx.get("tools")!.execute({ agent, name, arguments: {}, callId: ToolCallId(name), signal });
    for (const raw of ["status", "diagnostics", "goto_definition", "find_references", "find_symbol_related", "symbols", "prepare_rename", "rename", "format"]) {
      assert.ok(agent.ctx.get("tools")!.get(`mcp__dsmm_lsp__${raw}`, agent), `actual native MCP exposes ${raw}`);
    }
    const result = await run("mcp__dsmm_lsp__status");
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.ok(result.value, "actual server returned a status value, not a local ACK");
    const filePath = join(f.profileDir, "fixture.go");
    const fs = f.ctx.get("fs")!;
    const normalTarget = await fs.resolve(filePath, { cwd: f.profileDir });
    const extendedPath = toNamespacedPath(filePath);
    const extendedTarget = await fs.resolve(extendedPath, { cwd: f.profileDir });
    assert.equal(normalTarget.targetKey, extendedTarget.targetKey, "public operands resolve to the same opaque authorized target; never parse its key");
    assert.equal((await agent.ctx.get("tools")!.execute({ agent, name: "read", arguments: { file_path: filePath }, callId: ToolCallId("authorized-path-read"), signal: new AbortController().signal })).isError, false);
    const related = await agent.ctx.get("tools")!.execute({ agent, name: "mcp__dsmm_lsp__find_symbol_related", arguments: { filePath, line: 2, character: 5 }, callId: ToolCallId("cold-related-symbol"), signal: new AbortController().signal });
    t.diagnostic(JSON.stringify({ phase: "cold-owned-cache", result: related }));
    assert.deepEqual(wireCalls.map((packet) => packet.filePath), [filePath], "exact public filesystem operand reaches the final MCP wire unchanged");
    t.diagnostic(JSON.stringify({ finalMcpCalls: wireCalls }));
    spawnCounts.push(spawned.length);
    const cancel = new AbortController(); cancel.abort();
    assert.equal((await run("mcp__dsmm_lsp__status", cancel.signal)).isError, true);
    spawnCounts.push(spawned.length);
    const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const settings = runtime.getSettings(agent as unknown as DshAgent);
    const status = createDsmmStatusSnapshot({ agent: agent as unknown as DshAgent, settings, modeActive: true, admission: runtime.admission(agent as unknown as DshAgent) });
    assert.equal(status.lspRuntime?.state, "ready");
    assert.doesNotMatch(JSON.stringify(status), new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(spawned.length > 0);
    // rc.2 Client auto version negotiation may close an initial stdio probe and
    // reconnect with the negotiated protocol. Only one established server stays
    // live; Agent admission/tool calls must not remount it.
    assert.equal(spawned.filter((child) => child.exitCode === null && child.signalCode === null).length, 1);
    assert.ok(spawnCounts.every((count) => count === spawnCounts[0]), "admission/status/cancellation do not remount startup MCP");
    const deployment = f.ctx.get("dsmmDeploymentConfig") as DsmmDeploymentConfig;
    const global = await deployment.readGlobal();
    await deployment.saveGlobal({ expectedRevision: global.revision, edits: [{ op: "set", path: ["lsp", "enabled"], value: false }] }, () => {});
    const next = await f.create();
    assert.equal(runtime.getSettings(next as unknown as DshAgent).lsp.enabled, true);
    assert.ok(runtime.admission(next as unknown as DshAgent).restartRequired?.includes("lsp"));
    assert.equal(spawned.length, spawnCounts[0], "desired off/new admission never remounts or stops the frozen startup process");
    const reviewer = await f.subagents.start("dsmm-role-reviewer", { parent: agent, prompt: [], signal: new AbortController().signal });
    try {
      await reviewer.result;
      const child = reviewer.localAgent!;
      assert.equal((await child.ctx.get("tools")!.execute({ agent: child, name: "mcp__dsmm_lsp__status", arguments: {}, callId: ToolCallId("readonly-native-lsp"), signal: new AbortController().signal })).isError, false);
      assert.equal((await child.ctx.get("tools")!.execute({ agent: child, name: "mcp__dsmm_lsp__rename", arguments: {}, callId: ToolCallId("readonly-native-lsp-rename"), signal: new AbortController().signal })).isError, true);
    } finally { await reviewer.dispose(); }
    const exits = spawned.map((child) => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise<void>((done) => child.once("exit", () => done())));
    await f.dsmmFiber.dispose();
    await Promise.all(exits);
    assert.equal(f.tools.get("mcp__dsmm_lsp__status", agent), undefined);
    assert.equal(related.isError, false, JSON.stringify(related));
    assert.match(JSON.stringify(related), /definition: ok \(1 items\)/, "the cold native query returns the actual function definition");
    assert.match(JSON.stringify(related), /references: ok \(2 items\)/, "the cold native query returns declaration and use, not error-path text or a catalog ACK");
  } finally {
    await f?.dispose();
    for (const restore of pipeSpies) restore();
    spy.mock.restore(); syncBuiltinESMExports();
  }
});

test("disabled and unavailable LSP report actual startup state without fake successful tools", async () => {
  for (const lsp of [{ enabled: false }, { enabled: true, command: "dsmm-nonexistent-owned-probe-executable", failOnStartupError: false }]) {
    const f = await nativeRoutingFixture({ defaultActive: true, lsp });
    try {
      const agent = await f.create();
      const state = f.ctx.get("dsmmLspState")!();
      assert.equal(state.state, lsp.enabled ? "unavailable" : "disabled");
      assert.equal(agent.ctx.get("tools")!.get("mcp__dsmm_lsp__status", agent), undefined);
      assert.equal((await agent.ctx.get("tools")!.execute({ agent, name: "mcp__dsmm_lsp__status", callId: ToolCallId("unavailable-lsp"), arguments: {}, signal: new AbortController().signal })).isError, true);
    } finally { await f.dispose(); }
  }
});
