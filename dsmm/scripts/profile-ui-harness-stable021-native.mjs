import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { startProfileUiServer } from "./profile-ui-harness-server.mjs";
import { COMPOSITION_ID, nativeClientPreflight } from "./profile-ui-harness-browser.mjs";
import { digest, inspectStableBootstrap, inspectStableExports, inspectStableProfileStorage, stableCompositionBundle, stableNativeProofIdentity, stableNativeStorage } from "./stable-native-acceptance.mjs";
import { isSource022, isSource030, stableUiChecksForVersion } from "./release-contract.mjs";
import { prepareNativeReadonly022 } from "./native-preset-smoke.mjs";

export const name = "dsmm-stable021-native-browser-acceptance";
export const inject = ["appReady", "appExit", "agents", "llm", "dsmmProfileRuntime", "dsmmRuntimeIntegration", "typertGateway", "connection", "loader", "sessionPersistence"];
const CALLS = new Set(["dsmmProfiles/describe", "dsmmProfiles/read", "dsmmProfiles/save", "dsmmProfiles/select", "dsmmProfiles/describeSession", "dsmmProfiles/selectSession",
  "dsmmConfig/describe", "dsmmConfig/save", "dsmmConfig/describeModules", "dsmmConfig/describeSettings", "dsmmPermissions/describeRules", "dsmmPermissions/saveRules",
  "dsmmChildren/describe", "dsmmChildren/descendants", "dsmmChildren/prompt", "dsmmChildren/background", "session/modelCatalog", "session/create", "session/list"]);
const STREAMS = new Set(["$events", "session/follow", "session/control"]);

/** An owned browser carrier forwards to the actual Gateway with its actual operator Peer. */
export function createStableNativeBridge({ gateway, peer, page, origin, report }) {
  const pending = new Map();
  return {
    async invoke(source, input) {
      assert.equal(source.page, page); assert.equal(new URL(source.frame.url()).origin, origin);
      const { operation, id, channel, endpoint, payload } = input;
      assert.ok(typeof id === "string" && id.length > 0 && id.length <= 256);
      if (operation === "cancel") {
        const job = pending.get(id); job?.control.abort(); if (job?.record) job.record.disposed = true;
        pending.delete(id); return { ok: true, value: null };
      }
      if (operation === "next") {
        const job = pending.get(id); assert.ok(job?.iterator);
        try {
          const value = await job.iterator.next();
           if (value.done) { job.record.ended = true; job.record.disposed = true; pending.delete(id); } else job.record.frames += 1;
          return { ok: true, value };
        } catch (error) { pending.delete(id); return { ok: false, error: gateway.wireStream.failure(error) }; }
      }
      assert.equal(channel, "/api"); assert.equal(pending.has(id), false);
      assert.ok(operation === "open" ? STREAMS.has(endpoint) : operation === "call" && CALLS.has(endpoint));
      const control = new AbortController(); pending.set(id, { control });
      if (operation === "open") {
        const record = { endpoint, nativePeer: peer.id, strictGateway: true, result: "pending", frames: 0 }; report.nativeStreams.push(record);
        try {
          const stream = await gateway.wireStream.open(endpoint, payload, { async *[Symbol.asyncIterator]() {} }, peer, control.signal);
          pending.set(id, { control, iterator: stream[Symbol.asyncIterator](), record }); record.result = "accepted";
          return { ok: true, value: null };
        } catch (error) { pending.delete(id); record.result = "refused"; return { ok: false, error: gateway.wireStream.failure(error) }; }
      }
      const [namespace, method] = endpoint.split("/");
      const record = { endpoint, args: payload.args, nativePeer: peer.id, strictGateway: true, result: "pending" }; report.nativeCalls.push(record);
      try {
        const value = await gateway.invoke({ namespace, method, args: payload.args, peer, signal: control.signal });
        record.result = "accepted";
        if (["dsmmChildren/prompt", "dsmmChildren/background"].includes(endpoint)) record.receipt = value;
        return { ok: true, value };
      } catch (error) { record.result = "refused"; record.error = gateway.wireStream.failure(error); return { ok: false, error: record.error }; }
      finally { pending.delete(id); }
    },
    close() { for (const job of pending.values()) { job.control.abort(); if (job.record) job.record.disposed = true; } pending.clear(); },
  };
}

export function apply(ctx, config) {
  let started = false, disposed = false, watchdog;
  const onReady = ctx.get("appReady").onReady(() => {
    if (started || disposed) return; started = true;
    watchdog = setTimeout(() => {
      void writeFile(config.nativeReceipt, `${JSON.stringify({ outcome: "FAILED", postAppReady: true, stage: "native-watchdog", failure: "Native browser acceptance deadline expired." })}\n`, { flag: "wx" })
        .then(() => ctx.get("appExit")(1), () => ctx.get("appExit")(1));
    }, 150_000);
    void runStableNativeBrowser(ctx, config).then(async report => {
      clearTimeout(watchdog);
      await writeFile(config.nativeReceipt, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
      ctx.get("appExit")(report.outcome === "COMPLETED" ? 0 : 1);
    }).catch(async error => {
      clearTimeout(watchdog);
      await writeFile(config.nativeReceipt, `${JSON.stringify({ outcome: "FAILED", postAppReady: true, failure: error.message })}\n`, { flag: "wx" });
      ctx.get("appExit")(1);
    });
  });
  ctx.effect(() => () => { disposed = true; clearTimeout(watchdog); if (typeof onReady === "function") onReady(); });
}

export async function runStableNativeBrowser(ctx, { artifact, sha256, sourceContract, dshManifest, packageRoot, profilePackage, env, workspace, evidenceRoot, nativeStorage }) {
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const proofIdentity = stableNativeProofIdentity(manifest, { sourceContract });
  const checks = stableUiChecksForVersion(proofIdentity.packageVersion);
  const current030 = isSource030(proofIdentity.packageVersion);
  const sdk = createRequire(dshManifest), load = id => import(pathToFileURL(sdk.resolve(id)).href);
  const [{ LlmAdapter, ReasoningEffortId, ToolCallId }, { SessionId }] = await Promise.all([load("@deepseek-ai/dsh-llm"), load("@deepseek-ai/dsh-session")]);
  assert.ok(isAbsolute(env.DSMM_ACCEPTANCE_TOOLS_MANIFEST) && isAbsolute(env.DSMM_BROWSER_EXECUTABLE));
  const { chromium } = createRequire(env.DSMM_ACCEPTANCE_TOOLS_MANIFEST)("playwright");
  const report = { outcome: "FAILED", ...proofIdentity, artifactSha256: sha256,
    installedRoot: packageRoot, postAppReady: true, stage: "native-bootstrap", checks: {}, viewport: { width: 1280, height: 900 }, screenshots: [],
    authentication: { realWebOrDesktopLogin: "NOT_EXERCISED", signedIn: false, copiedBrowserState: false, productionAuthenticationModified: false },
    model: { kind: "deterministic-test-only-adapter", externalModelCalls: false }, nativeCalls: [], nativeStreams: [], pageErrors: [], externalRequests: [],
    cleanup: { browserContextClosed: false, nativeAgentsDisposed: false, errors: [] } };
  const handles = [], modelCalls = [];
  let streamGate, releaseStream, pendingForeground;
  let browser, context, page, server, bridge, readonlyProof, readonlyListener;
  class LocalAdapter extends LlmAdapter {
    async listModels(provider) { return ["native-root", "reviewer-original"].map(id => ({ provider, id, name: id })); }
    async resolveModel(provider, model) { return { provider, id: model, name: model, inputModalities: ["text"], reasoning: {
      efforts: ["low", "high"].map(id => ({ id: ReasoningEffortId(id), name: id })), defaultEffort: ReasoningEffortId("high") } }; }
    async *stream(options) {
      options.signal?.throwIfAborted(); assert.equal(options.provider, "dsmm-stable021-fixture"); modelCalls.push(options);
      if (streamGate && options.model === "reviewer-original" && JSON.stringify(options.messages).includes("complete the owned foreground background fixture")) {
        const gate = streamGate; streamGate = undefined; gate.entered(); await gate.wait; options.signal?.throwIfAborted();
      }
      const text = `owned deterministic native result from ${options.model}`;
      yield { type: "block-start", index: 0, blockType: "text" }; yield { type: "text-delta", index: 0, text };
      yield { type: "block-end", index: 0, block: { type: "text", text } }; yield { type: "finish", reason: { kind: "stop" } };
    }
  }
  try {
    assert.equal(digest(await readFile(artifact)), sha256);
    report.bootstrap = inspectStableBootstrap(ctx, { version: proofIdentity.packageVersion });
    report.publicExports = await inspectStableExports(packageRoot, profilePackage, { sourceContract: proofIdentity.sourceContract });
    const runtime = ctx.get("dsmmProfileRuntime"), gateway = ctx.get("typertGateway"), peer = ctx.get("connection").browserPeer;
    assert.ok(peer?.ctx); assert.equal(ctx.get("dsmmProfiles").backend, runtime);
    assert.equal(ctx.get("profileContext").dir, dirname(profilePackage));
    const persistence = ctx.get("sessionPersistence"), storage = stableNativeStorage(nativeStorage, env);
    assert.equal(persistence.name, "dsmm-session-persistence"); assert.equal(persistence[Symbol.for("dsmm.sessionPersistence.ignorable.v1")], true);
    assert.equal(persistence.config.root, storage.root); assert.equal(persistence.config.compression, storage.compression);
    report.nativeStorage = { ...storage, provider: persistence.name, ignorableEventCapability: true, startupOnly: true, passedByRunner: true, companionLoaderEntry: false };
    const profileStorage = await inspectStableProfileStorage(runtime.store, { home: env.DSH_HOME, hostProfileDir: dirname(profilePackage), entryId: runtime.options.startup.entryId });
    report.storageProof = { ...profileStorage, genuineNativeGateway: true, genuineOperatorPeer: true, cannedProfileRpc: false };
    ctx.get("llm").registerAdapter(["dsmm-stable021-fixture"], new LocalAdapter());
    const createRoot = async () => {
      const handle = await ctx.get("agents").create({ sessionId: SessionId(randomUUID()), meta: { cwd: workspace, agentPreset: "standard" },
        agentOptions: { provider: "dsmm-stable021-fixture", model: "native-root", reasoningEffort: ReasoningEffortId("low") },
        setup: agentCtx => ctx.get("agentPresets").mount(agentCtx, "standard").then(() => undefined) });
      handles.push(handle); return handle.agent;
    };
    const invoke = (namespace, method, args, options = {}) => gateway.invoke({ namespace, method, args, peer: options.peer ?? peer, signal: options.signal ?? new AbortController().signal });
    const previous = await runtime.describe();
    if (previous.selectedId !== null) await runtime.select({ id: null, expectedSelectionRevision: previous.selectionRevision });
    const parent = await createRoot(), parentAdmission = runtime.admission(parent);
    let readonlyDenied, readonlyFailure;
    if (isSource022(proofIdentity.packageVersion) || isSource030(proofIdentity.packageVersion)) {
      readonlyProof = await prepareNativeReadonly022({ ctx, parent, workspace, label: "stable-ui", sdk, toolsFor: agent => agent.ctx.get("tools"), ToolCallId });
      report.readonlyExecution = readonlyProof.proof;
      readonlyListener = ctx.on("agent/request", async ({ agent }, next) => {
        if (readonlyDenied === undefined && agent.session.header.origin === "subagent" && ctx.get("agents").isOwnedBy(agent.id, parent)) {
          try {
            readonlyDenied = await readonlyProof.verify(agent, { captured: true });
            for (const name of ["dsmm_reviewer", "dsmm_builder"]) {
              assert.equal(agent.ctx.get("tools").get(name, agent), undefined);
              const result = await agent.ctx.get("tools").execute({ agent, name, arguments: { description: "Forbidden nested role request", prompt: "Reply complete" },
                callId: ToolCallId(randomUUID()), signal: new AbortController().signal });
              assert.equal(result.isError, true);
            }
          } catch (error) { readonlyFailure = error; throw error; }
        }
        return next();
      }, { global: true, prepend: true });
    }
    const started = await parent.ctx.tools.execute({ agent: parent, name: "dsmm_reviewer", arguments: { description: "Stable native captured reviewer", prompt: "inspect the owned acceptance fixture" },
      callId: ToolCallId(randomUUID()), signal: new AbortController().signal });
    assert.equal(started.isError, false, JSON.stringify(started)); assert.equal(started.value.kind, "continuable");
    const child = ctx.get("agents").get(started.value.subagentId); assert.ok(child);
    await child.whenIdle();
    if (readonlyFailure !== undefined) throw readonlyFailure;
    readonlyListener?.(); readonlyListener = undefined;
    assert.equal(ctx.get("agents").isOwnedBy(child.id, parent), true);
    const originalChildAdmission = runtime.admission(child), capturePath = join(profileStorage.stateDir, ".children", "v1", `${digest(child.id)}.json`);
    const captureBefore = await readFile(capturePath), captured = JSON.parse(captureBefore);
    assert.equal(captured.capture.originalAdmissionEpoch, originalChildAdmission.epoch);
    assert.equal(captured.capture.childSessionId, child.id); assert.equal(captured.capture.parentSessionId, parent.id);
    assert.equal(captured.revision, digest(JSON.stringify(captured.capture)));
    if (isSource030(proofIdentity.packageVersion)) assert.equal(captured.capture.version, 3);
    assert.equal(child.options.model, "reviewer-original");
    if (isSource022(proofIdentity.packageVersion) || isSource030(proofIdentity.packageVersion)) assert.deepEqual(readonlyDenied, ["write", "edit", "bash", "pwsh"]);
    else {
      readonlyDenied = [];
      for (const name of ["write", "edit", "bash", "pwsh"]) {
        assert.equal(child.ctx.tools.schemas(child).some(tool => tool.name === name), false);
        const denial = await child.ctx.tools.execute({ agent: child, name, arguments: {}, callId: ToolCallId(randomUUID()), signal: new AbortController().signal });
        assert.equal(denial.isError, true); readonlyDenied.push(name);
      }
    }
    report.native = { rootId: parent.id, childId: child.id, rootModel: parent.options.model, readonlyDenied, originalChildEpoch: originalChildAdmission.epoch, model: child.options.model,
      originalCaptureSha256: digest(captureBefore), directNativeOwnership: true };
    if (current030) {
      report.currentSurfaces = { childCapture: { version: captured.capture.version, pathVersion: "v1" } };
      report.checks.publicNativeCapturedChildV3 = true;
    } else report.checks.publicNativeCapturedChild = true;
    report.stage = "browser-boot";
    server = await startProfileUiServer({ nativeRequire: sdk, packageRoot, sha256, composition: stableCompositionBundle(COMPOSITION_ID, { current: current030 }) }); report.nativeClient = server.bundleProof;
    report.clientSha256 = digest(await readFile(report.nativeClient.dsmmClient));
    browser = await chromium.launch({ executablePath: env.DSMM_BROWSER_EXECUTABLE, headless: true, args: ["--disable-extensions", "--disable-sync", "--no-sandbox"] });
    context = await browser.newContext({ viewport: report.viewport, locale: "en-US", serviceWorkers: "block" });
    assert.deepEqual(await context.cookies(), []);
    await context.route("**/*", route => {
      if (new URL(route.request().url()).origin !== server.origin) { report.externalRequests.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    page = await context.newPage(); page.setDefaultTimeout(12_000);
    page.on("pageerror", error => report.pageErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") report.pageErrors.push(message.text()); });
    bridge = createStableNativeBridge({ gateway, peer, page, origin: server.origin, report });
    await page.exposeBinding("__dsmmNativeBridge", bridge.invoke);
    await page.goto(`${server.origin}/?root=${encodeURIComponent(parent.id)}`);
    try { await page.getByRole("heading", { name: "Deepwork Profiles", exact: true }).waitFor(); }
    catch (error) {
      report.preflight = await page.evaluate(nativeClientPreflight);
      report.activationFailures = report.preflight.entries.filter(entry => entry.startupError !== undefined);
      throw error;
    }
    await page.evaluate(() => window.__dsmmUiContext.root.get("connection").reconnect());
    await page.waitForFunction(() => document.querySelector(".dsmm-profiles")?.getAttribute("aria-busy") === "false");
    report.preflight = await page.evaluate(nativeClientPreflight); assert.deepEqual(report.preflight.missingServices, []);
    if (current030) {
      report.stage = "browser-deployment-page";
      const deployment = page.locator("[data-dsmm-page]");
      await deployment.waitFor();
      await deployment.getByRole("button", { name: "Run and modules", exact: true }).click();
      const globalLayer = deployment.locator('[data-dsmm-layer="global"]');
      const toggle = globalLayer.locator('input[type="checkbox"]').first();
      await toggle.waitFor(); await toggle.click();
      await deployment.getByRole("button", { name: "Save Global config", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-dsmm-layer="global"]')?.getAttribute("aria-busy") === "false");
      const configSave = report.nativeCalls.findLast(row => row.endpoint === "dsmmConfig/save");
      assert.equal(configSave?.result, "accepted");
      await assert.rejects(invoke("dsmmConfig", "save", configSave.args), error => gateway.wireStream.failure(error).details?.code === "conflict");
      report.currentSurfaces.deploymentPage = { slot: "plugins.bundle.config", entryKey: "@dsmm/dsmm", configCas: true };
      report.checks.browserDeploymentPageConfigCas = true;
      await deployment.getByRole("button", { name: "Close module", exact: true }).click();
    }
    report.stage = "browser-profile-edit-save";
    const profileId = `stable-ui-${randomUUID().slice(0, 8)}`;
    const section = page.locator(".dsmm-profiles").filter({ has: page.getByRole("heading", { name: "Deepwork Profiles", exact: true }) });
    const action = name => section.getByRole("button", { name, exact: true });
    await action("New profile").click(); await page.getByLabel("Profile ID (name)", { exact: true }).fill(profileId);
    await page.getByText("Advanced JSONC", { exact: true }).click();
    const content = JSON.stringify({ version: 1, id: profileId, label: "  ", settings: { locale: "en", workflow: { reviewCap: 7 } } }, null, 2);
    await page.getByLabel("Runtime configuration (JSONC)", { exact: true }).fill(content);
    await section.locator(".dsmm-warning summary").first().click(); await page.getByText("The label is blank.", { exact: false }).first().waitFor();
    assert.equal(await action("Set as future default").isDisabled(), true);
    await action("Save profile").click(); await section.getByText(`Saved ${profileId}. The applied policy was not changed.`, { exact: true }).waitFor();
    const saved = await runtime.read(profileId); assert.equal(saved.content, content); assert.equal(saved.warnings[0].code, "blank-label");
    assert.equal((await runtime.describe()).selectedId, null);
    report.storageProof.savedRevision = saved.revision; if (!current030) report.checks.browserEditSaveWarning = true;
    report.stage = "future-default-apply";
    await action("Set as future default").click();
    await section.getByText(`Applied ${profileId} for new sessions. Existing sessions were not changed.`, { exact: true }).waitFor();
    assert.equal((await runtime.describe()).appliedRevision, saved.revision); assert.equal(runtime.admission(parent), parentAdmission);
    const future = await createRoot(); assert.equal(runtime.getSettings(future).workflow.reviewCap, 7);
    const globalArgs = report.nativeCalls.findLast(row => row.endpoint === "dsmmProfiles/select").args;
    const pointerBefore = await readFile(profileStorage.pointerPath);
    await assert.rejects(invoke("dsmmProfiles", "select", globalArgs), error => gateway.wireStream.failure(error).details?.code === "conflict");
    assert.deepEqual(await readFile(profileStorage.pointerPath), pointerBefore);
    report.cas = { future: { code: "conflict", beforeSha256: digest(pointerBefore), afterSha256: digest(await readFile(profileStorage.pointerPath)) } };
    if (!current030) report.checks.browserFutureApplyAndStaleCas = true;
    await section.locator('[data-dsmm-zone="future-default"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(evidenceRoot, "profiles-1280.png") }); report.screenshots.push("profiles-1280.png");
    report.stage = "children-panel";
    await page.evaluate(async id => {
      const reference = window.__dsmmUiContext.root.get("sessions").retain(id, { source: "mainView" });
      window.__dsmmStableOwnedReference = reference; await reference.ready;
    }, parent.id);
    await page.waitForFunction(id => window.__dsmmUiContext.root.get("uiSession").adapter.current.getSnapshot().key === id, parent.id);
    if (current030) {
      report.stage = "browser-role-tool-view";
      const role = page.locator('[data-dsmm-role-tool="dsmm_role"]');
      await role.waitFor(); assert.equal(await role.getAttribute("data-identity"), "requested");
      assert.match(await role.innerText(), /DW builder/u);
      await role.getByRole("button", { name: /Requested Role:/u }).click();
      assert.match(await role.innerText(), /retain raw input/u);
      report.currentSurfaces.roleToolView = { slot: "tool.call.toolview", requestedIdentity: true, actualIdentityFromValidatedResult: false, rawArgsPreserved: true, rawOutputPreserved: false };
      report.checks.browserRoleToolRequestedIdentity = true;
      await page.evaluate(() => window.__dsmmRoleTool.start());
      await page.evaluate(() => window.__dsmmRoleTool.result({ role: "dsmm-reviewer", label: "030 actual identity", level: "high", routeSource: "primary", mode: "one-shot", route: { provider: "dsmm-stable021-fixture", model: "reviewer-original", reasoningEffort: "high" } }));
      await page.waitForFunction(() => document.querySelector('[data-dsmm-role-tool="dsmm_role"]')?.getAttribute("data-identity") === "actual");
      assert.match(await role.innerText(), /DW reviewer/u); assert.match(await role.innerText(), /030 complete raw output/u);
      report.currentSurfaces.roleToolView.actualIdentityFromValidatedResult = true;
      report.currentSurfaces.roleToolView.rawOutputPreserved = true;
      report.checks.browserRoleToolValidatedActualIdentity = true;
      report.stage = "browser-permissions";
      const deployment = page.locator("[data-dsmm-page]");
      await deployment.getByRole("button", { name: "Permissions and guards", exact: true }).click();
      const permissions = deployment.locator("[data-dsmm-permissions]");
      await permissions.waitFor(); await page.waitForFunction(() => document.querySelector("[data-dsmm-permissions]")?.getAttribute("aria-busy") === "false");
      const webSearch = permissions.getByRole("group", { name: "Web search", exact: true });
      await webSearch.getByRole("checkbox").click();
      await permissions.getByRole("button", { name: "Save Global rules", exact: true }).click();
      await page.waitForFunction(() => document.querySelector("[data-dsmm-permissions]")?.getAttribute("aria-busy") === "false");
      const permissionSave = report.nativeCalls.findLast(row => row.endpoint === "dsmmPermissions/saveRules");
      assert.equal(permissionSave?.result, "accepted");
      await assert.rejects(invoke("dsmmPermissions", "saveRules", permissionSave.args), error => gateway.wireStream.failure(error).details?.code === "stale");
      await assert.rejects(invoke("dsmmPermissions", "describeRules", { sessionId: child.id }), error => gateway.wireStream.failure(error).details?.code === "not-owned");
      report.currentSurfaces.permissions = { connectedRootOnly: true, describeRules: true, saveRulesCas: true, readonlyRefused: true };
      report.checks.browserPermissionsRulesCas = true;
      await deployment.getByRole("button", { name: "Close module", exact: true }).click();
    }
    report.stage = "children-panel";
    const panel = page.locator(".dsmm-children"); await panel.getByRole("heading", { name: "Deepwork children", exact: true }).waitFor();
    await panel.getByRole("button", { name: "Refresh", exact: true }).click();
    await panel.getByRole("region", { name: "Direct children", exact: true }).getByText("Stable native captured reviewer", { exact: true }).waitFor();
    const callsBefore = modelCalls.length, message = "browser captured stable-native follow-up";
    await panel.getByLabel("Message", { exact: true }).fill(message); await panel.getByRole("button", { name: "Send message", exact: true }).click();
    await panel.getByText("Inbox accepted message", { exact: false }).waitFor();
    const promptCall = report.nativeCalls.findLast(row => row.endpoint === "dsmmChildren/prompt");
    assert.equal(promptCall.result, "accepted"); assert.equal(typeof promptCall.receipt.messageId, "string");
    assert.equal(promptCall.args.request.childSessionId, child.id); assert.equal(promptCall.args.request.parentSessionId, parent.id);
    report.native.inboxReceipt = promptCall.receipt; if (!current030) report.checks.browserChildrenNativeInboxReceipt = true;
    await panel.screenshot({ path: join(evidenceRoot, "children-1280.png") }); report.screenshots.push("children-1280.png");
    const live = ctx.get("agents").get(child.id); if (live) await live.whenIdle();
    const delivered = modelCalls.slice(callsBefore).filter(call => call.model === "reviewer-original" && JSON.stringify(call.messages).includes(message));
    assert.ok(delivered.length >= 1, "actual native reviewer request did not consume the browser message");
    const current = await invoke("dsmmChildren", "describe", { sessionId: parent.id }), observed = current.children.find(row => row.id === child.id);
    assert.ok(observed); assert.equal(observed.evidence.originalAdmissionEpoch, originalChildAdmission.epoch);
    assert.equal(observed.routeComparison.liveRoute.route.model, "reviewer-original"); assert.deepEqual(await readFile(capturePath), captureBefore);
    report.native.messageObservation = { childId: observed.id, originalChildEpoch: observed.evidence.originalAdmissionEpoch, liveModel: observed.routeComparison.liveRoute.route.model,
      acceptedNativeReviewerRequestsWithMessage: delivered.length, captureAfterSha256: digest(await readFile(capturePath)) };
    if (!current030) report.checks.browserChildrenNativeMessage = true;
    report.stage = "current-session-apply";
    await page.getByLabel("Current-session profile", { exact: true }).selectOption(profileId);
    await action("Apply profile to current session").click();
    await section.getByText("Applied the saved revision to this session only. Global default and existing children were not changed.", { exact: true }).waitFor();
    const applied = await runtime.getSession(parent); assert.equal(applied.selection.selectedId, profileId); assert.notEqual(applied.admissionEpoch, parentAdmission.epoch);
    assert.equal(parent.options.model, "native-root"); assert.equal(runtime.admission(child), originalChildAdmission);
    const sessionArgs = report.nativeCalls.findLast(row => row.endpoint === "dsmmProfiles/selectSession").args;
    const sidecar = join(profileStorage.stateDir, ".sessions", `${digest(parent.id)}.json`), sidecarBefore = await readFile(sidecar);
    await assert.rejects(invoke("dsmmProfiles", "selectSession", sessionArgs), error => gateway.wireStream.failure(error).details?.code === "conflict");
    assert.equal(runtime.admission(parent).epoch, applied.admissionEpoch); assert.deepEqual(await readFile(sidecar), sidecarBefore);
    assert.deepEqual(await readFile(profileStorage.pointerPath), pointerBefore); assert.deepEqual(await readFile(capturePath), captureBefore);
    report.cas.current = { code: "conflict", epoch: applied.admissionEpoch, beforeSha256: digest(sidecarBefore), afterSha256: digest(await readFile(sidecar)) };
    if (!current030) report.checks.browserCurrentApplyAndStaleCas = true;
    report.stage = "browser-same-run-background";
    let enteredStream;
    const entered = new Promise(settle => { enteredStream = settle; });
    const wait = new Promise(settle => { releaseStream = settle; });
    streamGate = { entered: enteredStream, wait };
    const backgroundCallId = ToolCallId(randomUUID()), callsBeforeBackground = modelCalls.length;
    const childrenBefore = new Set((await invoke("dsmmChildren", "describe", { sessionId: parent.id })).children.map(row => row.id));
    const foregroundControl = new AbortController();
    pendingForeground = parent.ctx.tools.execute({ agent: parent, name: "dsmm_reviewer", arguments: {
      description: "Stable same-run native background", prompt: "complete the owned foreground background fixture", run_in_background: false,
    }, callId: backgroundCallId, signal: foregroundControl.signal });
    await entered;
    const running = (await invoke("dsmmChildren", "describe", { sessionId: parent.id })).runs.find(row => row.toolCallId === backgroundCallId);
    assert.equal(running?.state, "running"); assert.equal(running.background.enabled, true);
    const originalRunId = running.invocation.runId, backgroundChildId = running.invocation.childId;
    const backgroundChild = ctx.get("agents").get(backgroundChildId); assert.ok(backgroundChild);
    await panel.getByRole("button", { name: "Refresh", exact: true }).click();
    await panel.getByRole("button", { name: "Move this run to background", exact: true }).click();
    await panel.getByText("Transition receipt: background", { exact: false }).or(panel.getByRole("alert")).first().waitFor();
    assert.equal(report.nativeCalls.findLast(row => row.endpoint === "dsmmChildren/background")?.result, "accepted");
    const handed = await pendingForeground; assert.equal(handed.isError, false); assert.equal(handed.value.kind, "background");
    assert.equal(handed.value.runId, originalRunId);
    const backgroundCall = report.nativeCalls.findLast(row => row.endpoint === "dsmmChildren/background");
    assert.equal(backgroundCall.result, "accepted"); assert.equal(backgroundCall.receipt.runId, originalRunId);
    assert.equal(backgroundCall.receipt.jobId, handed.value.jobId);
    const repeated = await invoke("dsmmChildren", "background", backgroundCall.args);
    assert.equal(repeated.status, "already-background"); assert.equal(repeated.jobId, handed.value.jobId);
    foregroundControl.abort(); const sameChild = ctx.get("agents").get(backgroundChildId) === backgroundChild; assert.equal(sameChild, true);
    releaseStream();
    const jobs = ctx.get("jobs"), completed = await jobs.wait(handed.value.jobId, 5000, parent.id);
    assert.equal(completed.status, "completed"); assert.ok(JSON.stringify(jobs.read(handed.value.jobId, parent.id).result).includes("owned deterministic native result"));
    await parent.whenIdle(); assert.equal(parent.options.model, "native-root");
    const observedChildren = (await invoke("dsmmChildren", "describe", { sessionId: parent.id })).children.filter(row => !childrenBefore.has(row.id));
    assert.deepEqual(observedChildren.map(row => row.id), [backgroundChildId]);
    const backgroundRequests = modelCalls.slice(callsBeforeBackground).filter(call => call.model === backgroundChild.options.model && JSON.stringify(call.messages).includes("complete the owned foreground background fixture"));
    assert.equal(backgroundRequests.length, 1);
    report.background = { runId: originalRunId, childId: backgroundChildId, jobId: handed.value.jobId, status: completed.status,
      repeatedStatus: repeated.status, starts: observedChildren.length, requests: backgroundRequests.length,
      sameRun: handed.value.runId === originalRunId, sameChild,
      foregroundKind: handed.value.kind, resultObserved: true };
    report.stage = "native-authority-cutoff";
    await persistence.flush();
    const eventsDigest = async () => {
      const observation = await ctx.get("sessionQuery").observeSession(child.id, { signal: new AbortController().signal, projectionMode: "none" });
      try { return digest(JSON.stringify(observation.events)); } finally { observation[Symbol.dispose](); }
    };
    const eventsBefore = await eventsDigest(), safetyCalls = modelCalls.length;
    await assert.rejects(invoke("dsmmChildren", "prompt", promptCall.args, { peer: { id: peer.id, ctx: peer.ctx } }));
    await assert.rejects(invoke("dsmmChildren", "prompt", { ...promptCall.args, sessionId: future.id, request: { ...promptCall.args.request, requestId: randomUUID(), parentSessionId: future.id } }));
    const control = new AbortController();
    const cancelled = invoke("subagents", "prompt", { request: { ...promptCall.args.request, requestId: randomUUID(), content: [{ type: "text", text: "cancelled-before-native-inbox" }] } }, { signal: control.signal });
    control.abort(); await assert.rejects(cancelled, error => gateway.wireStream.failure(error).code === "gateway/cancelled");
    assert.equal(await eventsDigest(), eventsBefore); assert.equal(modelCalls.length, safetyCalls); assert.deepEqual(await readFile(capturePath), captureBefore);
    report.safety = { claimedOperatorPeerRefused: true, foreignParentRefused: true, beforeInboxCancellation: true,
      childEventsBeforeSha256: eventsBefore, childEventsAfterSha256: await eventsDigest(), nativeModelCallsBefore: safetyCalls, nativeModelCallsAfter: modelCalls.length };
    if (current030) report.checks.browserNativeDeliveryFence = true;
    assert.deepEqual(Object.keys(report.checks).sort(), [...checks].sort());
    for (const check of checks) assert.equal(report.checks[check], true);
    for (const endpoint of ["dsmmProfiles/save", "dsmmProfiles/select", "dsmmProfiles/selectSession", "dsmmChildren/prompt"]) assert.ok(report.nativeCalls.some(row => row.endpoint === endpoint && row.result === "accepted"));
    for (const endpoint of ["$events", "session/follow", "session/control"]) assert.ok(report.nativeStreams.some(row => row.endpoint === endpoint && row.result === "accepted" && row.frames > 0));
    assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.externalRequests, []); assert.deepEqual(server.errors, []);
    assert.equal(digest(await readFile(artifact)), sha256); assert.equal(digest(await readFile(report.nativeClient.dsmmClient)), report.clientSha256);
    report.stage = "complete"; report.outcome = "COMPLETED";
  } catch (error) { report.failure = error.message; }
  finally {
    readonlyListener?.(); readonlyProof?.close();
    releaseStream?.();
    if (pendingForeground) {
      try { await pendingForeground; } catch (error) { report.cleanup.errors.push(error.message); }
    }
    bridge?.close();
    const cleanup = async (operation) => { try { await operation(); return true; } catch (error) { report.cleanup.errors.push(error.message); return false; } };
    if (page) await cleanup(() => page.evaluate(() => { window.__dsmmStableOwnedReference?.release(); }));
    report.cleanup.browserContextClosed = context ? await cleanup(() => context.close()) : false;
    if (browser) await cleanup(() => browser.close()); if (server) await cleanup(() => server.close());
    let agentsDisposed = true;
    for (const handle of handles.reverse()) {
      const integration = ctx.get("dsmmRuntimeIntegration");
      if (!await cleanup(() => integration.revokeBeforeDispose(handle.agent, async () => {
        const subagents = ctx.get("subagents"), children = await subagents.listChildren(handle.agent.id);
        await subagents.drainChildren(handle.agent, children.filter(row => row.mode === "continuable").map(row => row.id)); await handle.dispose();
      }))) agentsDisposed = false;
    }
    report.cleanup.nativeAgentsDisposed = agentsDisposed && ctx.get("agents").list().length === 0;
    if (report.cleanup.errors.length || !report.cleanup.nativeAgentsDisposed || !report.cleanup.browserContextClosed) report.outcome = "FAILED";
    report.model.calls = modelCalls.map(({ provider, model, reasoningEffort }) => ({ provider, model, reasoningEffort }));
  }
  return report;
}
