import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

export const name = "dsmm-final-native-preset-acceptance";
export const inject = ["appReady", "appExit", "agents", "llm", "subagents"];

const ROOTS = ["dsmm-orchestrator", "dsmm-planner"];
const ROLE_TOOLS = ["dsmm_planner", "dsmm_plan_critic", "dsmm_reviewer", "dsmm_oracle", "dsmm_oracle_2nd",
  "dsmm_creative", "dsmm_code_search", "dsmm_doc_search", "dsmm_clarifier", "dsmm_media_reader"].sort();
const STOCK_PERSISTENCE_ID = "session-persistence-jsonl";
const STOCK_PERSISTENCE_MODULE = "@deepseek-ai/dsh-session-persistence-jsonl";
const METADATA_COMPATIBILITY = Symbol.for("dsmm.sessionPersistence.ignorable.v1");
const DSMM_METADATA_TYPES = new Set(["deepwork/mode", "dsmm/role-policy"]);

/** Validate exact stored bytes logically, without printing messages or event payloads. */
export function assertStoredEventPrefix(liveEvents, storedEvents) {
  assert.equal(storedEvents.length, liveEvents.length, "persistence retains every live event exactly once");
  assert.deepEqual(storedEvents.map((event) => event.seq), storedEvents.map((_event, index) => index), "stored seq is contiguous without duplicates");
  const expected = liveEvents.map((event) => DSMM_METADATA_TYPES.has(event.type) ? { ...event, ignorable: true } : event);
  assert.deepEqual(storedEvents, expected, "only audited DSMM metadata gains ignorable; all native bytes stay unchanged");
  const metadata = storedEvents.filter((event) => DSMM_METADATA_TYPES.has(event.type));
  assert.ok(metadata.every((event) => event.ignorable === true), "every actual DSMM marker is stock-reader ignorable");
  return { events: storedEvents.length, coreEvents: storedEvents.length - metadata.length,
    modeMarkers: metadata.filter((event) => event.type === "deepwork/mode").length,
    policyMarkers: metadata.filter((event) => event.type === "dsmm/role-policy").length,
    exactlyOnce: true, contiguousSeq: true, ignorable: true };
}

/** An ordinary native Host plugin; no vendor-internal imports or synthetic ready event. */
export async function apply(ctx, config) {
  const nativeRequire = createRequire(config.dshManifest);
  const load = async (specifier) => import(pathToFileURL(nativeRequire.resolve(specifier)).href);
  const [{ LlmAdapter, ReasoningEffortId, ToolCallId, createUserMessage }, { Session, SessionId }, { renderPrompt }, { Context, getTraceable }, { foldSubagentDescriptor }, { default: JsonlSessionPersistence }] = await Promise.all([
    load("@deepseek-ai/dsh-llm"), load("@deepseek-ai/dsh-session"), load("@deepseek-ai/dsh-system-prompt"),
    load("@deepseek-ai/cordis"), load("@deepseek-ai/dsh-subagent"), load(STOCK_PERSISTENCE_MODULE)
  ]);
  const calls = [];
  class AcceptanceAdapter extends LlmAdapter {
    async resolveModel(provider, model) {
      return { provider, id: model, name: model, inputModalities: ["text"], reasoning: {
        efforts: ["off", "low", "high", "max"].map((id) => ({ id: ReasoningEffortId(id), name: id })), defaultEffort: ReasoningEffortId("high")
      } };
    }
    async *stream(options) {
      options.signal?.throwIfAborted();
      calls.push({ provider: options.provider, model: options.model, reasoningEffort: options.reasoningEffort });
      yield { type: "block-start", index: 0, blockType: "text" };
      yield { type: "text-delta", index: 0, text: "native fixture complete" };
      yield { type: "block-end", index: 0, block: { type: "text", text: "native fixture complete" } };
      yield { type: "finish", reason: { kind: "stop" } };
    }
  }
  ctx.get("llm").registerAdapter(["dsmm-acceptance-fixture"], new AcceptanceAdapter());
  let disposed = false;
  let started = false;
  const onReady = ctx.get("appReady").onReady(() => {
    if (disposed || started) return;
    started = true;
    void audit().then((report) => {
      writeFileSync(config.receipt, `${JSON.stringify(report, null, 2)}\n`);
      ctx.get("appExit")(report.outcome === "COMPLETED" ? 0 : 1);
    }).catch((error) => {
      writeFileSync(config.receipt, `${JSON.stringify({ outcome: "FAILED", template: config.template, postAppReady: true, failure: error.message }, null, 2)}\n`);
      ctx.get("appExit")(1);
    });
  });
  ctx.effect(() => () => { disposed = true; if (typeof onReady === "function") onReady(); });

  async function audit() {
    const report = { outcome: "FAILED", template: config.template, postAppReady: true, presetRegistryPresent: false,
      model: { kind: "deterministic-test-only-adapter", externalModelCalls: false, calls }, uiAuthentication: "NOT_EXERCISED" };
    const handles = [];
    let childListener;
    try {
      report.persistence = inspectPersistence();
      const registry = ctx.get("agentPresets");
      report.presetRegistryPresent = registry !== undefined;
      if (config.template === "web") {
        assert.ok(registry, "native Web composition must expose its real Agent preset registry");
        const roster = await registry.list();
        const inventory = await registry.compositionInventory();
        report.presets = roster.map(({ id, name, broken }) => ({ id, name, ...(broken === undefined ? {} : { broken }) }));
        report.rootIds = roster.filter(({ id }) => id.startsWith("dsmm-")).map(({ id }) => id).sort();
        if (config.nativeOnly) {
          assert.equal(report.rootIds.length, 0, "native control must have no installed DSMM definitions");
          for (const id of ["standard", "minimal"]) assert.ok(roster.some((preset) => preset.id === id && preset.broken === undefined), `native control ${id} must activate`);
          report.checks = { noDsmmInstalled: true, standardAndMinimalHealthy: true };
          report.outcome = "COMPLETED";
          return report;
        }
        report.compositions = inventory.filter(({ id }) => id.startsWith("dsmm-")).map(({ id, broken, rows }) => ({ id, broken,
          rows: rows.map(({ entryId, moduleName, enabled, fiberState }) => ({ entryId, moduleName, enabled, fiberState })) }));
        const broken = roster.filter((preset) => preset.broken !== undefined);
        report.checks = { healthyNativeRoster: broken.length === 0, exactEnabledRoots: JSON.stringify(report.rootIds) === JSON.stringify([...ROOTS].sort()) };
        if (broken.length || !report.checks.exactEnabledRoots) {
          report.failure = broken.length ? "native preset activation audit rejected one or more compositions" : "auxiliary/disabled roles leaked into the native root selector";
          report.blankSelection = { outcome: "NOT_RUN", reason: "unusable native preset roster" };
          return report;
        }
      } else {
        // This shipped surface explicitly has no Web Host/preset selector.
        // Audit the real native headless services, not an invented selector.
        assert.equal(registry, undefined, "headless acceptance must preserve the shipped preset-free composition");
        report.checks = { shippedPresetFreeHeadless: true };
      }
      if (!config.nativeOnly) {
        const profile = ctx.get("profileContext");
        assert.ok(typeof profile?.dir === "string");
        const profileManifest = join(profile.dir, "package.json");
        const profileRequire = createRequire(profileManifest);
        const installed = await import(pathToFileURL(profileRequire.resolve("@dsmm/dsmm")).href);
        const { readPluginMeta } = await load("@deepseek-ai/dsh-app-boot");
        const meta = readPluginMeta("@dsmm/dsmm", pathToFileURL(profileManifest).href);
        assert.equal(meta?.error, undefined);
        assert.deepEqual(meta?.title, { en: "Deepwork", zh: "Deepwork" });
        const presetNames = installed.DSMM_ROLES.map(({ id, name }) => ({ id, name }));
        assert.equal(presetNames.length, 12);
        assert.ok(presetNames.every(({ name }) => name.startsWith("DW ")));
        const rootPresetNames = (report.presets ?? []).filter(({ id }) => id.startsWith("dsmm-")).map(({ id, name }) => ({ id, name }));
        for (const preset of rootPresetNames) assert.deepEqual(preset, presetNames.find(({ id }) => id === preset.id));
        report.branding = { pluginTitle: meta.title.en, presetNames, rootPresetNames };
      }
      const agents = ctx.get("agents");
      const parentHandle = await agents.create({ sessionId: SessionId(`dsmm-artifact-${config.template}-${config.nativeOnly ? "control" : "installed"}-blank`),
        meta: { cwd: config.workspace, ...(registry === undefined ? {} : { agentPreset: "standard" }) },
        agentOptions: { provider: "dsmm-acceptance-fixture", model: "deterministic-native", reasoningEffort: ReasoningEffortId("high") },
        ...(registry === undefined ? {} : { setup: (agentCtx) => registry.mount(agentCtx, "standard").then(() => undefined) }) });
      handles.push(parentHandle);
      const parent = parentHandle.agent;
      if (config.nativeOnly) {
        const run = await ctx.get("subagents").start("spawn", { parent,
          prompt: [{ type: "text", text: "Reply native fixture complete." }], persona: "Native control child persona",
          toolFilter: { allow: ["read", "glob", "grep"] },
          agentOptions: { provider: "dsmm-acceptance-fixture", model: "deterministic-native", reasoningEffort: ReasoningEffortId("high") }, signal: new AbortController().signal });
        try {
          assert.equal((await run.result).stopReason, "completed");
          assert.ok(run.localAgent);
          assert.match((await snapshot(run.localAgent)).prompt, /Native control child persona/u);
          report.nativeSpawn = { outcome: "COMPLETED", denied: await denyMutations(run.localAgent, undefined, "native-control-child") };
          report.model.calls = calls;
          report.outcome = "COMPLETED";
          return report;
        } finally { await run.dispose(); }
      }
      const commands = parent.ctx.get("commands");
      assert.ok(commands, "native metadata proof requires the actual DSMM deepwork command");
      for (const command of ["/deepwork off", "/deepwork"]) {
        const execution = await commands.execute(parent, command, [], new AbortController().signal);
        assert.equal(execution?.result?.kind, "success", "actual DSMM mode command commits its metadata without steering a model");
      }
      if (registry !== undefined) {
        await registry.select(parent, "dsmm-orchestrator");
        const orchestrator = await snapshot(parent, registry);
        assert.match(orchestrator.prompt, /You are DW Orchestrator \(role ID: dsmm-orchestrator\)/u);
        assert.deepEqual(orchestrator.roleTools, ROLE_TOOLS);
        assert.equal(orchestrator.tools.includes("write"), true);
        await registry.select(parent, "dsmm-planner");
        const planner = await snapshot(parent, registry);
        assert.match(planner.prompt, /You are DW Planner \(role ID: dsmm-planner\)/u);
        const plannerDenials = await denyMutations(parent, registry, "planner");
        await registry.select(parent, "dsmm-orchestrator");
        const restored = await snapshot(parent, registry);
        assert.equal(restored.tools.includes("write"), true, "blank root switch lifts planner restrictions");
        assert.deepEqual(restored.roleTools, ROLE_TOOLS);
        const restoredTools = toolsFor(parent, registry);
        const restoredWritePath = join(config.workspace, "restored-orchestrator-write.txt");
        const restoredWriteBytes = "restored orchestrator mutation capability\n";
        assert.equal(existsSync(restoredWritePath), false, "positive write uses only a new owned-workspace file");
        const written = await restoredTools.execute({ callId: ToolCallId("restored-orchestrator-write"), name: "write", agent: parent,
          arguments: { file_path: restoredWritePath, content: restoredWriteBytes }, signal: new AbortController().signal });
        assert.equal(written.isError, false, "restored native orchestrator can actually write a new workspace file");
        assert.equal(readFileSync(restoredWritePath, "utf8"), restoredWriteBytes);
        const readBack = await restoredTools.execute({ callId: ToolCallId("restored-orchestrator-read"), name: "read", agent: parent,
          arguments: { file_path: restoredWritePath }, signal: new AbortController().signal });
        assert.equal(readBack.isError, false, "restored native orchestrator can read back its committed bytes");
        assert.ok(readBack.content.some((block) => block.type === "text" && block.text.includes(restoredWriteBytes.trim())));
        report.blankSelection = { outcome: "COMPLETED", nativeSelect: true, first: "standard", sequence: ["dsmm-orchestrator", "dsmm-planner", "dsmm-orchestrator"],
          personaAndToolsChanged: true, plannerDenials, mutationRestored: true, nativeWriteAndRead: true, roleTools: orchestrator.roleTools };
      } else {
        const headless = await snapshot(parent);
        assert.deepEqual(headless.roleTools, ROLE_TOOLS);
        report.headlessTools = { outcome: "COMPLETED", roleTools: headless.roleTools, disabledBuilderAbsent: true };
      }
      const subagents = ctx.get("subagents");
      for (const tool of ROLE_TOOLS) assert.ok(subagents.getProvider(`dsmm-role-${tool.slice(5).replace(/_/gu, "-")}`), `enabled native provider ${tool}`);
      assert.equal(subagents.getProvider("dsmm-role-builder"), undefined);
      const children = [];
      const checkedChildren = new Set();
      childListener = ctx.on("agent/request", async ({ agent }, next) => {
        if (agent.session.header.origin !== "subagent" || !agents.isOwnedBy(agent.id, parent)) return await next();
        const descriptor = foldSubagentDescriptor(agent.session.snapshotEvents());
        if (descriptor?.provider !== "dsmm-role-reviewer" || checkedChildren.has(agent.id)) return await next();
        checkedChildren.add(agent.id);
        const child = await snapshot(agent, registry);
        assert.match(child.prompt, /You are DW Reviewer \(role ID: dsmm-reviewer\)/u);
        children.push({ agent, provider: descriptor.provider, persona: true, tools: child.tools,
          denied: await denyMutations(agent, registry, "reviewer-child") });
        return await next();
      }, { global: true, prepend: true });
      // Exercise the packaged standing tool itself, so persona/filter/alias
      // configuration is consumed by native ToolRuntime and native spawn.
      const tools = toolsFor(parent, registry);
      const delegated = await tools.execute({ callId: ToolCallId("artifact-native-reviewer"), name: "dsmm_reviewer",
        agent: parent, arguments: { description: "Inspect local acceptance fixture", prompt: "Reply native fixture complete. Do not call any tool." }, signal: new AbortController().signal });
      if (delegated.isError) report.delegationFailure = delegated.content.filter((block) => block.type === "text").map((block) => block.text).join("\n").slice(0, 2000);
      assert.equal(delegated.isError, false, "native packaged dsmm_reviewer tool must complete");
      assert.equal(children.length, 1, "the packaged role tool must actually create one native read-only child");
      assert.ok(calls.length > 0, "the native child loop must reach the local model adapter");
      assert.ok(calls.every(({ provider, model }) => provider === "dsmm-acceptance-fixture" && model === "deterministic-native"));
      const child = children[0];
      const headers = child.agent.session.snapshotEvents().filter((event) => event.type === "request/header").map((event) => ({
        provider: event.data.header.config.provider, model: event.data.header.config.model, reasoningEffort: event.data.header.config.reasoningEffort
      }));
      assert.ok(headers.length > 0);
      assert.ok(headers.every((header) => header.provider === "dsmm-acceptance-fixture" && header.model === "deterministic-native" && header.reasoningEffort === "high"));
      report.readonlyChild = { outcome: "COMPLETED", provider: child.provider, nativeRoleTool: "dsmm_reviewer", nativeSpawn: true,
        persona: child.persona, tools: child.tools, denied: child.denied, requestHeaders: headers };
      parent.followup(createUserMessage({ content: [{ type: "text", text: "Reply native fixture complete." }], source: { kind: "user" } }));
      await parent.whenIdle();
      assert.ok(parent.session.snapshotEvents().some((event) => event.type === "turn/end" && event.data.reason.kind === "completed"));
      report.persistence.sessions = await verifyPersistedSessions([parent.session, child.agent.session]);
      report.persistence.nativeColdReopen = true;
      report.persistence.historyAndNativePolicyUnchanged = true;
      report.model.calls = calls;
      report.outcome = "COMPLETED";
    } catch (error) {
      report.failure = error.message;
    } finally {
      if (typeof childListener === "function") childListener();
      for (const handle of handles.reverse()) await handle.dispose();
    }
    return report;
  }

  function inspectPersistence() {
    const persistence = ctx.get("sessionPersistence");
    assert.ok(persistence, "native Host persistence must exist; no ephemeral fallback is accepted");
    assert.ok(typeof config.ownedHome === "string" && isAbsolute(config.ownedHome), "persistence capture needs the explicit owned home");
    const observed = { root: persistence.config?.root, compression: persistence.config?.compression ?? "zstd" };
    assert.equal(observed.root, join(config.ownedHome, "sessions"), "capture only the run-owned native sessions root");
    assert.equal(observed.compression, "zstd", "preserve the shipped effective native compression");
    const loader = ctx.get("loader");
    assert.ok(loader?.entries, "native Host Loader inventory is required");
    const entries = [...loader.entries()];
    const stock = entries.filter((entry) => entry.options.id === STOCK_PERSISTENCE_ID);
    assert.equal(stock.length, 1, "exactly one stock persistence declaration must remain identifiable");
    assert.equal(stock[0].options.name, STOCK_PERSISTENCE_MODULE, "stock persistence package identity is not renamed");
    const result = { backendName: persistence.name, config: observed,
      stockEntry: { id: stock[0].options.id, name: stock[0].options.name, disabled: stock[0].disabled }, capturedFromNativeHost: true };
    if (config.nativeOnly) {
      assert.equal(persistence.name, STOCK_PERSISTENCE_ID);
      assert.equal(stock[0].disabled, false);
      return result;
    }
    assert.deepEqual(observed, config.nativeStorage, "DSMM backend config exactly preserves the effective native control");
    assert.equal(persistence.name, "dsmm-session-persistence");
    assert.equal(persistence[METADATA_COMPATIBILITY], true, "native Host requires the DSMM ignorable-metadata capability");
    assert.equal(stock[0].disabled, true, "exact stock backend is disabled only in this explicit startup patch");
    const dsmmEntries = entries.filter((entry) => entry.options.name === "@dsmm/dsmm");
    assert.equal(dsmmEntries.length, 1, "one DSMM Loader entry owns its internal storage companion");
    for (const name of ["@dsmm/dsmm/session-persistence", "@dsmm/dsmm/client"]) {
      assert.equal(entries.filter((entry) => entry.options.name === name).length, 0, "no second companion/client Loader entry is allowed");
    }
    return { ...result, metadataCompatible: true, singleHostProvider: true, dsmmLoaderEntries: 1,
      standaloneCompanionEntries: 0, standaloneClientEntries: 0, startupOnly: true };
  }

  async function verifyPersistedSessions(sessions) {
    const persistence = ctx.get("sessionPersistence");
    await persistence.flush();
    const summaries = [];
    const readerCtx = new Context();
    try {
      const readerFiber = readerCtx.plugin(JsonlSessionPersistence, { ...config.nativeStorage });
      await readerFiber.await();
      const nativeReader = readerCtx.get("sessionPersistence");
      assert.equal(nativeReader.name, STOCK_PERSISTENCE_ID);
      assert.equal(readerCtx.get("dsmmProfileRuntime"), undefined, "cold reader has no DSMM plugin/runtime");
      for (const [index, session] of sessions.entries()) {
        const liveEvents = session.snapshotEvents();
        const liveHandle = await persistence.open(session.id, "read");
        try { assertStoredEventPrefix(liveEvents, (await liveHandle.read()).events); }
        finally { await liveHandle.close(); }
        const reader = await nativeReader.open(session.id, "read");
        try {
          const stored = await reader.read();
          const summary = assertStoredEventPrefix(liveEvents, stored.events);
          assert.ok(summary.policyMarkers > 0, "root and delegated child retain their real DSMM role policy");
          if (index === 0) assert.ok(summary.modeMarkers >= 2, "root retains actual off/on DSMM mode commands");
          const restored = Session.fromRestore(session.id, stored.events, reader.header, reader.inheritedEventCount, stored.eventState);
          assert.deepEqual(restored.deriveMessages(), session.deriveMessages(), "stock native core restores identical visible message history");
          assert.deepEqual(restored.requestHeader(), session.requestHeader(), "stock native core preserves the admitted native routing policy");
          summaries.push({ role: index === 0 ? "root" : "readonly-child", ...summary, stockColdReopen: true,
            visibleHistoryUnchanged: true, nativeRequestHeaderUnchanged: true });
        } finally { await reader.close(); }
      }
      return summaries;
    } finally { await readerCtx.fiber.dispose(); }
  }

  function toolsFor(agent, registry) {
    const service = registry?.serviceFor(agent, "tools");
    const tools = service === undefined ? agent.ctx.get("tools") : getTraceable(agent.ctx, service);
    assert.ok(tools, "native Agent must expose its own scoped tools");
    return tools;
  }

  async function snapshot(agent, registry) {
    const raw = registry?.serviceFor(agent, "systemPrompt");
    const prompt = raw === undefined ? agent.ctx.get("systemPrompt") : getTraceable(agent.ctx, raw);
    assert.ok(prompt, "native Agent must expose its own scoped prompt");
    const assembly = await prompt.assemble({ agent, scope: agent });
    const tools = toolsFor(agent, registry).schemas(agent).map(({ name }) => name).sort();
    return { prompt: renderPrompt(assembly), tools, roleTools: tools.filter((tool) => tool.startsWith("dsmm_")) };
  }

  async function denyMutations(agent, registry, label) {
    const tools = toolsFor(agent, registry);
    const subject = join(config.workspace, `${label}-sentinel.txt`);
    const writeTarget = join(config.workspace, `${label}-write-must-not-exist.txt`);
    const shellTarget = join(config.workspace, `${label}-shell-must-not-exist.txt`);
    writeFileSync(subject, "unchanged native sentinel\n");
    const read = await tools.execute({ callId: ToolCallId(`${label}-read`), name: "read", agent,
      arguments: { file_path: subject }, signal: new AbortController().signal });
    assert.equal(read.isError, false, "read-only Agent can perform a real native filesystem read");
    const requests = [
      ["write", { file_path: writeTarget, content: "unexpected native write" }],
      ["edit", { file_path: subject, old_string: "unchanged", new_string: "changed" }],
      ["bash", { command: `printf unexpected > '${shellTarget}'`, description: "Create forbidden acceptance sentinel" }],
      ["pwsh", { command: "Write-Output unexpected", description: "Probe forbidden PowerShell execution" }],
      ["dsmm_reviewer", { description: "Forbidden nested role request", prompt: "Reply complete" }],
      ["dsmm_builder", { description: "Forbidden disabled role request", prompt: "Reply complete" }]
    ];
    const denied = [];
    for (const [name, args] of requests) {
      assert.equal(tools.get(name, agent), undefined, `${label} cannot resolve ${name}`);
      const result = await tools.execute({ callId: ToolCallId(`${label}-deny-${name}`), name, agent, arguments: args, signal: new AbortController().signal });
      assert.equal(result.isError, true, `${label} native execution denied ${name}`);
      denied.push(name);
    }
    assert.equal(readFileSync(subject, "utf8"), "unchanged native sentinel\n");
    assert.equal(existsSync(writeTarget), false);
    assert.equal(existsSync(shellTarget), false);
    return denied;
  }
}
