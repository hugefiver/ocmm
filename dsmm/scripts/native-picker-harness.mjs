import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { startNativePickerServer } from "./native-picker-browser.mjs";
import { nativeClientPreflight } from "./profile-ui-harness-browser.mjs";

export const PICKER_ARTIFACT_SHA256 = "c42d2e3f799e677258e1624a752fc0928286747e292c26b908524218b8751c9f";
export const PICKER_ARTIFACT_URL = "https://registry.npmjs.org/@dsmm/dsmm/-/dsmm-0.1.5.tgz";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const route = (value) => ({ provider: value.provider, model: value.model, ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }) });
const provider = "dsmm-picker-fixture";
const targetRoute = Object.freeze({ provider, model: "target", reasoningEffort: "high" });
const profileRoute = Object.freeze({ provider, model: "configured-default", reasoningEffort: "max" });
const ownedProfileIds = new Set(["picker-b", "picker-no-model"]);

/** Local AFTER candidates never borrow the immutable registry BEFORE identity. */
export function pickerArtifactOptions(args) {
  if (args.length === 0) return { kind: "published-before", url: PICKER_ARTIFACT_URL, sha256: PICKER_ARTIFACT_SHA256, lanes: ["absent", "present"], receiptName: "picker-ab-receipt.json" };
  const fields = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    assert.ok(["--source-artifact", "--source-sha256", "--source-identity"].includes(key) && !fields.has(key) && typeof value === "string" && value.length > 0 && !/[\u0000-\u001f]/u.test(value), "source-after options must be unique complete named pairs");
    fields.set(key, value);
  }
  assert.equal(fields.size, 3, "source-after needs artifact, SHA256 and source identity together");
  assert.match(fields.get("--source-sha256"), /^[a-f0-9]{64}$/u);
  assert.notEqual(fields.get("--source-sha256"), PICKER_ARTIFACT_SHA256, "published BEFORE bytes cannot be called source AFTER");
  return { kind: "local-current-source", artifact: fields.get("--source-artifact"), sha256: fields.get("--source-sha256"), sourceIdentity: fields.get("--source-identity"), lanes: ["present"], receiptName: "picker-after-receipt.json" };
}

/** CI can only install its explicitly frozen bytes, never the registry BEFORE. */
export function frozenPickerArtifactOptions({ artifact, sha256, packageVersion }) {
  assert.ok(typeof artifact === "string" && isAbsolute(artifact), "frozen picker requires an explicit absolute artifact path");
  assert.match(sha256, /^[a-f0-9]{64}$/u, "frozen picker requires an explicit artifact SHA256");
  assert.match(packageVersion, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u, "frozen picker requires a trusted stable package version");
  const [major, minor, patch] = packageVersion.split(".").map(Number);
  assert.ok(major > 0 || minor > 1 || (minor === 1 && patch >= 6), "frozen picker is a 0.1.6-or-later acceptance gate");
  return { kind: "ci-frozen-artifact", artifact, sha256, packageVersion, lanes: ["present"], receiptName: "picker-frozen-receipt.json" };
}

export function validateNativePickerAfterStep(step) {
  assert.ok(step.actualCalls.length > 0, "source-after has no actual provider request");
  for (const call of step.actualCalls) {
    assert.deepEqual(route(call), targetRoute, `${step.phase}: actual provider must preserve native Target/high`);
    assert.deepEqual(call.header, targetRoute, `${step.phase}: accepted native header must preserve Target/high`);
  }
  assert.deepEqual(step.afterRequest.actualCurrentHeader, targetRoute);
  assert.deepEqual(step.afterRequest.directory.current, targetRoute, "native picker must converge before AFTER screenshot");
  if (step.phase.startsWith("direct-target")) assert.equal(step.modelRpcs.length, 0, "native same-row selection must not need a workaround RPC");
}

export function validateCompactHeaderGeometry(geometry) {
  if (geometry.focusRequired !== false) assert.equal(geometry.focus, true);
  assert.equal(geometry.selectHeight, 32);
  assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1, "compact contribution overflowed its own box");
  const left = Math.max(0, geometry.seat.left), right = Math.min(geometry.viewportWidth, geometry.seat.right);
  for (const element of [geometry.root, ...geometry.elements]) {
    const margin = element.focused ? element.outlineExtent : 0;
    assert.ok(element.left - margin >= left - 1 && element.right + margin <= right + 1,
      `${element.kind} clipped outside native header seat/viewport: [${element.left - margin},${element.right + margin}] vs [${left},${right}]`);
    assert.ok(element.scrollWidth <= element.clientWidth + 1, `${element.kind} clipped its own contents`);
  }
}

/** Public read-only native/registered-business faces; never inspect controller fields. */
export function nativePickerPublicState(scope = window) {
  const root = scope.__dsmmUiContext?.root;
  const binding = root?.get("uiSession")?.adapter.current.getSnapshot();
  const id = binding?.key;
  const nativeBinding = id === undefined ? undefined : root?.get("sessions")?.binding(id);
  const projection = binding?.keyedHooks?.projection?.("modelSelection");
  let directory, directoryFailure;
  try { directory = id === undefined ? undefined : root?.get("modelDirectories")?.directoryFor(id).store.getSnapshot(); }
  catch (error) { directoryFailure = String(error); }
  const entry = root?.get("slots")?.entries("conversation.session.header.utilities").find((entry) => entry.options.id === "dsmm-session-profiles");
  const controller = entry?.inject?.(id)?.hooks?.profiles?.getSnapshot();
  const header = scope.document.querySelector("[data-dsmm-header-profile]");
  const ancestors = [];
  for (let element = header; element && ancestors.length < 8; element = element.parentElement) {
    const rect = element.getBoundingClientRect(), style = scope.getComputedStyle(element);
    ancestors.push({ tag: element.tagName, className: element.className, x: rect.x, right: rect.right, width: rect.width, height: rect.height, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      display: style.display, flex: style.flex, flexShrink: style.flexShrink, flexWrap: style.flexWrap, minWidth: style.minWidth, maxWidth: style.maxWidth, overflowX: style.overflowX });
  }
  return { currentSessionId: id, keyedHookNames: Object.keys(binding?.keyedHooks ?? {}), bindingPresent: nativeBinding !== undefined,
    eventSourcePresent: nativeBinding?.eventSource !== undefined, modelEventSequences: nativeBinding?.eventSource.getSnapshot().entries.flatMap((entry) => entry.type === "event" && entry.event.type === "model/selection" ? [entry.event.seq] : []) ?? [],
    projectionFactoryPresent: typeof binding?.keyedHooks?.projection === "function", projectionSourcePresent: projection !== undefined, projectionSnapshotPresent: projection?.getSnapshot() !== undefined,
    projectionSnapshot: projection?.getSnapshot(), directoryPresent: directory !== undefined, directoryStatus: directory?.status, directoryPending: directory?.pending, directoryFailure,
    selectorPresent: typeof root?.get("remote.session")?.selectModel === "function",
    controller: controller === undefined ? null : { currentSessionId: controller.currentSessionId, sessionIssue: controller.sessionIssue, sessionBusy: controller.sessionBusy, sessionNotice: controller.sessionNotice, sessionChoice: controller.sessionChoice },
    headerAncestors: ancestors, viewportWidth: scope.innerWidth };
}

function ownedGate() {
  let release;
  return { started: false, promise: new Promise((resolve) => { release = resolve; }), release: () => release() };
}
export function decodeNativePickerArgs(payload) {
  assert.ok(payload && typeof payload === "object" && !Array.isArray(payload) && Object.keys(payload).length === 1 && Object.hasOwn(payload, "args") && payload.args && typeof payload.args === "object" && !Array.isArray(payload.args), "native Remote wire envelope must have exactly one args object");
  return payload.args;
}
export const name = "dsmm-native-picker-owned-diagnostic";
export const inject = ["appReady", "appExit", "llm", "agents", "connection", "typertGateway", "agentDefaultModel"];

export function apply(ctx, config) {
  let started = false;
  ctx.get("appReady").onReady(() => {
    if (started) return;
    started = true;
    void runPickerLane(ctx, config).then(async (receipt) => {
      await writeFile(config.receipt, `${JSON.stringify(receipt, null, 2)}\n`);
      ctx.get("appExit")(receipt.outcome === "OBSERVED" ? 0 : 1);
    }).catch(async (error) => {
      await writeFile(config.receipt, `${JSON.stringify({ outcome: "BOUNDARY", lane: config.lane, failure: error.stack ?? String(error) }, null, 2)}\n`);
      ctx.get("appExit")(1);
    });
  });
}

async function until(predicate, label, budget = 15_000) {
  const deadline = Date.now() + budget;
  while (Date.now() < deadline) { if (predicate()) return; await delay(20); }
  throw new Error(`Owned picker diagnostic timed out: ${label}`);
}

export async function runPickerLane(ctx, config) {
  const currentCandidate = config.artifactKind === "local-current-source" || config.artifactKind === "ci-frozen-artifact";
  const nativeRequire = createRequire(config.dshManifest);
  const load = (id) => import(pathToFileURL(nativeRequire.resolve(id)).href);
  const { LlmAdapter, ReasoningEffortId } = await load("@deepseek-ai/dsh-llm");
  const calls = [];
  const nativeCalls = [];
  const pending = new Map();
  const heldGates = [];
  const gate = () => { const value = ownedGate(); heldGates.push(value); return value; };
  let lastStart;
  let profileGate, providerGate, modelGate, refuseModelAfterCommit = false, modelRefused = false;
  const report = { outcome: "BOUNDARY", lane: config.lane, artifactSha256: config.sha256, artifactKind: config.artifactKind, sourceIdentity: config.sourceIdentity, dsmm: config.lane === "present", nativeCalls, providerCalls: calls, steps: [], compactSteps: [],
    authentication: { signedIn: false, copiedBrowserState: false, productionAuthenticationModified: false }, cleanup: {} };
  class PickerAdapter extends LlmAdapter {
    async listModels(routeProvider) { return [["target", "Target Model"], ["other", "Other Model"], ["configured-default", "Configured Default"]].map(([id, name]) => ({ provider: routeProvider, id, name, inputModalities: ["text"], reasoning: { efforts: ["low", "high", "max"].map((id) => ({ id: ReasoningEffortId(id), name: id })), defaultEffort: ReasoningEffortId("high") } })); }
    async resolveModel(routeProvider, model) {
      if (modelRefused && model === profileRoute.model) throw new Error("Owned fixture model became unavailable after profile CAS");
      return { ...(await this.listModels(routeProvider)).find(({ id }) => id === model), provider: routeProvider, id: model, name: model, inputModalities: ["text"] };
    }
    async *stream(options) {
      assert.ok(lastStart, "provider call has no actual native attempt start");
      calls.push({ ...lastStart, ...route(options) });
      if (providerGate) { const gate = providerGate; providerGate = undefined; gate.started = true; await gate.promise; }
      yield { type: "block-start", index: 0, blockType: "text" };
      yield { type: "text-delta", index: 0, text: "Owned native picker fixture completed" };
      yield { type: "block-end", index: 0, block: { type: "text", text: "Owned native picker fixture completed" } };
      yield { type: "finish", reason: { kind: "stop" } };
    }
  }
  ctx.get("llm").registerAdapter([provider], new PickerAdapter());
  const offStart = ctx.on("agent/assistant-stream", ({ agent, frame }) => { if (frame.type === "start") lastStart = { sessionId: agent.id, attemptId: frame.attemptId, turn: frame.turn, step: frame.step, header: route(agent.session.requestHeader().config) }; }, { global: true });
  await ctx.get("agentDefaultModel").saveSelection({ provider, model: "target", reasoningEffort: ReasoningEffortId("high") });
  const gateway = ctx.get("typertGateway");
  const peer = ctx.get("connection").operator;
  assert.ok(peer?.ctx, "owned native Host has no genuine operator Peer");
  const workspaceResult = await gateway.invoke({ namespace: "workspace", method: "create", args: { request: { path: config.workspace } }, peer, signal: new AbortController().signal });
  const workspaceId = workspaceResult.workspace.workspaceId;
  assert.equal(typeof workspaceId, "string");
  if (currentCandidate) {
    const installedManifest = JSON.parse(await readFile(join(config.packageRoot, "package.json"), "utf8"));
    assert.equal(installedManifest.name, "@dsmm/dsmm");
    if (config.artifactKind === "ci-frozen-artifact") assert.equal(installedManifest.version, config.packageVersion, "frozen picker installed a different package version");
    report.installedCandidate = { packageRoot: config.packageRoot, name: installedManifest.name, version: installedManifest.version,
      hostSha256: hash(await readFile(join(config.packageRoot, "lib", "index.js"))), clientSha256: hash(await readFile(join(config.packageRoot, "lib", "client.js"))), publicationClaimed: false };
    report.seededProfiles = [];
    for (const id of ownedProfileIds) {
      const content = `${JSON.stringify({ version: 1, id, label: id === "picker-b" ? "Picker profile B" : "Profile without main model", settings: id === "picker-b" ? {
        defaultActive: true, roleRouting: { "dsmm-orchestrator": { primary: profileRoute, fallbackRoutes: [], strategy: "startup-lock" } },
      } : { defaultActive: false } }, null, 2)}\n`;
      const saved = await gateway.invoke({ namespace: "dsmmProfiles", method: "save", args: { request: { id, content, expectedRevision: null } }, peer, signal: new AbortController().signal });
      report.seededProfiles.push({ id: saved.id, revision: saved.revision, contentSha256: hash(Buffer.from(saved.content)) });
    }
  }
  let server, browser, context, page;
  const browserErrors = [];
  try {
    server = await startNativePickerServer({ nativeRequire, packageRoot: config.packageRoot, revision: config.sha256, dsmm: report.dsmm, observerTrace: config.observerDiagnostic === true });
    report.nativePackages = server.nativePackages;
    const { chromium } = createRequire(config.toolsManifest)("playwright");
    browser = await chromium.launch({ executablePath: config.browserExecutable, headless: false, args: ["--disable-extensions", "--disable-sync", "--no-sandbox"] });
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US", serviceWorkers: "block" });
    assert.deepEqual(await context.cookies(), []);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    page = await context.newPage();
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.exposeBinding("__dsmmNativeBridge", async (source, input) => {
      assert.equal(source.page, page); assert.equal(new URL(source.frame.url()).origin, server.origin);
      const { operation, id, channel, endpoint, payload } = input;
      if (operation === "cancel") { pending.get(id)?.control.abort(); return { ok: true, value: null }; }
      if (operation === "next") {
        const job = pending.get(id); assert.ok(job?.iterator);
        try { return { ok: true, value: await job.iterator.next() }; }
        catch (error) { return { ok: false, error: gateway.wireStream.failure(error) }; }
      }
      assert.equal(channel, "/api");
      assert.ok(endpoint === "$events" || /^(?:session|workspace|settings|commands|directoryPicker|dsmmProfiles)\//u.test(endpoint), `unexpected native picker namespace ${endpoint}`);
      const scopedProfileSelection = currentCandidate && endpoint === "dsmmProfiles/selectSession";
      assert.ok(scopedProfileSelection || !/^(?:settings|directoryPicker|dsmmProfiles)\/(?:save|set|select|update|delete|remove|write|pick)/u.test(endpoint), "picker may not change deployment/account/global profile/directory settings");
      const control = new AbortController();
      const record = { endpoint, operation, strictGateway: true, nativePeer: peer.id, result: "pending", nativeInvocationStarted: false, ...(["session/selectModel", "dsmmProfiles/selectSession"].includes(endpoint) ? { payload } : {}) };
      nativeCalls.push(record); pending.set(id, { control });
      try {
        if (operation === "open") {
          const stream = await gateway.wireStream.open(endpoint, payload, { async *[Symbol.asyncIterator]() {} }, peer, control.signal);
          pending.set(id, { control, iterator: stream[Symbol.asyncIterator]() }); record.result = "accepted";
          return { ok: true, value: null };
        }
        const [namespace, method] = endpoint.split("/");
        const args = decodeNativePickerArgs(payload);
        if (scopedProfileSelection) {
          assert.ok(args.request?.id === null || ownedProfileIds.has(args.request?.id), "only declared owned fixture profiles may be selected");
          if (profileGate) { const gate = profileGate; profileGate = undefined; gate.started = true; record.ownedCarrierHold = true; await gate.promise; control.signal.throwIfAborted(); }
        }
        if (endpoint === "session/selectModel" && modelGate) { const gate = modelGate; modelGate = undefined; gate.started = true; record.ownedNativeSelectorPreAckHold = true; await gate.promise; control.signal.throwIfAborted(); }
        record.nativeInvocationStarted = true;
        const value = await gateway.invoke({ namespace, method, args, peer, signal: control.signal }); record.result = "accepted";
        if (scopedProfileSelection) {
          record.accepted = { sessionId: value.sessionId, selectedId: value.selection.selectedId, admissionEpoch: value.admissionEpoch, profileModel: value.profileModel };
          if (refuseModelAfterCommit) { refuseModelAfterCommit = false; modelRefused = true; record.ownedFixtureModelWithdrawnAfterCommit = true; }
        }
        return { ok: true, value };
      } catch (error) { const failure = gateway.wireStream.failure(error); record.result = failure.code; record.failure = failure.message; record.cancelled = control.signal.aborted; return { ok: false, error: failure }; }
    });
    await page.goto(server.origin);
    await page.waitForFunction(() => window.__dsmmUiContext?.root.get("modelDirectories") && window.__dsmmUiContext.root.get("uiWorkspace") && window.__dsmmUiContext.root.get("conversation"), { timeout: 30_000 });
    report.preflight = await page.evaluate(nativeClientPreflight);
    const snapshot = async (sessionId) => {
      const agent = ctx.get("agents").get(sessionId);
      const projections = ctx.get("sessionProjections");
      const runtime = ctx.get("dsmmProfileRuntime");
      const admission = agent && runtime ? runtime.admission(agent) : undefined;
      const catalog = await gateway.invoke({ namespace: "session", method: "modelCatalog", args: {}, peer, signal: new AbortController().signal });
      return { displayedButtons: await page.getByRole("button").evaluateAll((buttons) => buttons.map((button) => ({ text: button.textContent?.trim(), aria: button.getAttribute("aria-label") })).filter(({ text, aria }) => /Target Model|Other Model|Configured Default|model/i.test(`${text} ${aria}`))),
        directory: await page.evaluate((id) => window.__dsmmUiContext.root.get("modelDirectories").directoryFor(id).store.getSnapshot(), sessionId),
        catalogDefault: catalog.default, modelProjection: agent && projections ? projections.stateOf(agent.session, "modelSelection") : null,
        admission: admission ? { epoch: admission.epoch, profileId: admission.selectedId, profileRevision: admission.appliedRevision, primary: runtime.getSettings(agent).roleRouting["dsmm-orchestrator"]?.primary } : null,
        nativeSelections: agent?.session.snapshotEvents().filter(({ type }) => type === "model/selection").map(({ seq, data }) => ({ seq, ...data })) ?? [],
        nativeHeaders: agent?.session.snapshotEvents().filter(({ type }) => type === "request/header").map(({ seq, data }) => ({ seq, config: { provider: data.header.config.provider, model: data.header.config.model, reasoningEffort: data.header.config.reasoningEffort } })) ?? [],
        actualCurrentHeader: agent?.session.requestHeader() ? route(agent.session.requestHeader().config) : null,
        publicNativeState: await page.evaluate(nativePickerPublicState),
        borrowedClientSelectionEvents: await page.evaluate((id) => {
          const binding = window.__dsmmUiContext.root.get("sessions").binding(id);
          return binding?.eventSource.getSnapshot().entries.flatMap((entry) => entry.type === "event" && entry.event.type === "model/selection" ? [{ seq: entry.event.seq, data: entry.event.data }] : []) ?? [];
        }, sessionId),
        compactHeader: await page.locator("[data-dsmm-header-profile]").evaluateAll((headers) => headers.map((header) => ({ text: header.textContent?.trim(), html: header.outerHTML, selects: header.querySelectorAll("select").length, buttons: header.querySelectorAll("button").length, busy: header.getAttribute("aria-busy"), value: header.querySelector("select")?.value, disabled: header.querySelector("select")?.disabled }))) };
    };
    const newSession = async () => {
      const id = await page.evaluate(async (cwd) => {
        const root = window.__dsmmUiContext.root;
        const sessionId = await root.get("sessions").create({ workspaceId: cwd });
        if (typeof sessionId !== "string") throw new Error(`native ClientSessions.create returned no SessionId: ${JSON.stringify(sessionId)}`);
        root.get("uiWorkspace").openSession(sessionId);
        return sessionId;
      }, workspaceId);
      await page.getByRole("button", { name: /Target Model/ }).first().waitFor({ timeout: 20_000 });
      await page.screenshot({ path: join(config.evidenceRoot, `${config.lane}-${report.steps.length}-new-session.png`), fullPage: true });
      return id;
    };
    const choose = async (label) => {
      const trigger = page.locator("button[aria-haspopup='menu']").filter({ hasText: /Target Model|Other Model|Configured Default/ }).first();
      await trigger.click();
      const menu = page.getByRole("menu");
      await menu.waitFor();
      await menu.getByRole("menuitem").filter({ hasText: /Model/ }).first().click();
      const item = page.getByRole("menuitemradio", { name: label, exact: true });
      await item.click();
      await item.waitFor({ state: "hidden" });
      await page.waitForFunction(() => !window.__dsmmUiContext.root.get("modelDirectories").directoryFor(window.__dsmmUiContext.root.get("uiSession").adapter.current.getSnapshot().key).store.getSnapshot().pending);
    };
    const converged = async (sessionId, expected) => {
      await page.waitForFunction(({ id, expected }) => {
        const current = window.__dsmmUiContext.root.get("modelDirectories").directoryFor(id).store.getSnapshot();
        return current.pending === null && current.current.provider === expected.provider && current.current.model === expected.model && current.current.reasoningEffort === expected.reasoningEffort;
      }, { id: sessionId, expected });
      const label = expected.model === "target" ? "Target Model" : expected.model === "other" ? "Other Model" : "Configured Default";
      await page.getByRole("button", { name: new RegExp(`current ${label}, reasoning effort ${expected.reasoningEffort}`, "u") }).waitFor();
    };
    const submit = async (sessionId, phase) => {
      const beforeCalls = calls.length;
      const textbox = page.locator("[contenteditable='true'][role='textbox']").first();
      await textbox.fill(`Owned native picker ${phase}`);
      await textbox.press("Enter");
      await until(() => calls.length > beforeCalls, `${phase} provider request`);
      await ctx.get("agents").get(sessionId).whenIdle();
      await converged(sessionId, route(calls.at(-1)));
      await page.screenshot({ path: join(config.evidenceRoot, `${config.lane}-${phase}.png`), fullPage: true });
      return calls.slice(beforeCalls);
    };
    let sessionId = await newSession();
    for (const phase of ["direct-target-new", "direct-target-existing", "other-then-target-existing"]) {
      const before = await snapshot(sessionId);
      const beforeCount = nativeCalls.filter(({ endpoint }) => endpoint === "session/selectModel").length;
      if (phase.startsWith("other-then")) await choose("Other Model");
      await choose("Target Model");
      const afterClick = await snapshot(sessionId);
      const modelRpcs = nativeCalls.filter(({ endpoint }) => endpoint === "session/selectModel").slice(beforeCount);
      const actualCalls = await submit(sessionId, phase);
      const step = { phase, sessionId, before, afterClick, afterRequest: await snapshot(sessionId), modelRpcs, actualCalls };
      if (currentCandidate) validateNativePickerAfterStep(step);
      report.steps.push(step);
    }
    sessionId = await newSession();
    const before = await snapshot(sessionId);
    const beforeCount = nativeCalls.filter(({ endpoint }) => endpoint === "session/selectModel").length;
    await choose("Other Model"); await choose("Target Model");
    const afterClick = await snapshot(sessionId);
    const actualCalls = await submit(sessionId, "other-then-target-new");
    const step = { phase: "other-then-target-new", sessionId, before, afterClick, afterRequest: await snapshot(sessionId), modelRpcs: nativeCalls.filter(({ endpoint }) => endpoint === "session/selectModel").slice(beforeCount), actualCalls };
    if (currentCandidate) validateNativePickerAfterStep(step);
    report.steps.push(step);
    if (currentCandidate) {
      const header = page.locator("[data-dsmm-header-profile]");
      const select = header.getByRole("combobox", { name: "Current-session profile (header)", exact: true });
      const settledHeader = async () => {
        await select.waitFor();
        await page.waitForFunction(() => document.querySelector("[data-dsmm-header-profile]")?.getAttribute("aria-busy") === "false");
      };
      await settledHeader();
      assert.equal(await header.count(), 1); assert.equal(await header.locator("select").count(), 1); assert.equal(await header.getByRole("button").count(), 0);
      report.compactShape = { nativeSelects: 1, additionalButtons: 0, nativeRootAndHeaderOwners: true };
      const normalBefore = await snapshot(sessionId);
      let rpcStart = nativeCalls.length;
      await select.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelector("[data-dsmm-header-profile] select")?.value === "picker-b");
      await settledHeader();
      let after = await snapshot(sessionId);
      assert.equal(after.admission.profileId, "picker-b"); assert.deepEqual(after.admission.primary, profileRoute);
      assert.deepEqual(after.actualCurrentHeader, normalBefore.actualCurrentHeader); assert.deepEqual(after.directory.current, targetRoute);
      assert.equal(nativeCalls.slice(rpcStart).filter(({ endpoint }) => endpoint === "session/selectModel").length, 0);
      const normalCalls = await submit(sessionId, "normal-profile-keeps-target");
      for (const call of normalCalls) { assert.deepEqual(route(call), targetRoute); assert.deepEqual(call.header, targetRoute); }
      report.compactSteps.push({ phase: "keyboard-normal-profile-keeps-native-model", sessionId, before: normalBefore, after, afterRequest: await snapshot(sessionId), nativeCalls: nativeCalls.slice(rpcStart), actualCalls: normalCalls });

      const compactBreakpoints = async (phase) => { for (const width of [375, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await select.hover(); if (!await select.isDisabled()) await select.focus();
        await page.evaluate(async () => {
          let previous, stable = 0;
          const deadline = performance.now() + 5_000;
          while (performance.now() < deadline) {
            await new Promise(requestAnimationFrame);
            const element = document.querySelector("[data-dsmm-header-profile]");
            const rect = element.getBoundingClientRect(), owner = element.closest("header").getBoundingClientRect();
            const signature = `${rect.x}/${rect.right}/${rect.height}/${owner.x}/${owner.right}`;
            stable = signature === previous ? stable + 1 : 0; previous = signature;
            if (stable >= 3) return;
          }
          throw new Error("Native header geometry did not settle before screenshot");
        });
        const geometry = await header.evaluate((element) => {
          const select = element.querySelector("select"), rect = element.getBoundingClientRect();
          const style = getComputedStyle(select), owner = element.closest("header").getBoundingClientRect();
          const shape = (node, kind) => {
            const bounds = node.getBoundingClientRect(), style = getComputedStyle(node);
            return { kind, left: bounds.left, right: bounds.right, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, focused: document.activeElement === node,
              outlineExtent: style.outlineStyle === "none" ? 0 : parseFloat(style.outlineWidth) + Math.max(0, parseFloat(style.outlineOffset)) };
          };
          return { width: rect.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, selectHeight: select.getBoundingClientRect().height,
            focus: document.activeElement === select, focusRequired: !select.disabled, disabled: select.disabled, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth,
            documentScrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, seat: { left: owner.left, right: owner.right }, root: shape(element, "profile-root"),
            elements: [...element.querySelectorAll("label,select,span")].map((node) => shape(node, node.tagName.toLowerCase())) };
        });
        // Diagnostic-only c preserves the old geometry as evidence. Fresh full
        // AFTER runs must clear actual seat bounds, not self-scroll alone.
        if (!config.observerDiagnostic) validateCompactHeaderGeometry(geometry);
        await page.screenshot({ path: join(config.evidenceRoot, `after-compact-${width}-${phase}.png`), fullPage: true });
        const viewportSnapshot = await snapshot(sessionId);
        report.compactSteps.push({ phase: `responsive-${phase}`, viewport: width, geometry, header: viewportSnapshot.compactHeader, publicNativeState: viewportSnapshot.publicNativeState });
      } };
      const explicitBefore = await snapshot(sessionId); rpcStart = nativeCalls.length;
      await select.selectOption("@model:picker-b"); await settledHeader();
      if (config.observerDiagnostic) {
        report.observerAttachmentTrace = await page.evaluate(() => window.__dsmmObserverAttachmentTrace);
        report.explicitDiagnostic = { publicNativeState: await page.evaluate(nativePickerPublicState), actualCalls: nativeCalls.slice(rpcStart) };
        throw new Error(`Observer-only diagnostic stopped at original explicit-model outcome: ${report.explicitDiagnostic.publicNativeState.controller?.sessionIssue?.code ?? "no-refusal"}; not complete source AFTER acceptance`);
      }
      const explicitRpcs = nativeCalls.slice(rpcStart).filter(({ endpoint }) => endpoint === "session/selectModel");
      assert.equal(explicitRpcs.length, 1, `explicit Profile model dispatched no native selection: ${(await page.evaluate(nativePickerPublicState)).controller?.sessionIssue?.code ?? "unknown"}`);
      assert.equal(explicitRpcs[0].result, "accepted");
      await converged(sessionId, profileRoute);
      after = await snapshot(sessionId);
      assert.deepEqual(decodeNativePickerArgs(explicitRpcs[0].payload).request, { sessionId, ...profileRoute });
      const explicitCalls = await submit(sessionId, "explicit-profile-model");
      assert.ok(explicitCalls.length > 0); for (const call of explicitCalls) { assert.deepEqual(route(call), profileRoute); assert.deepEqual(call.header, profileRoute); }
      assert.deepEqual((await snapshot(sessionId)).actualCurrentHeader, profileRoute);
      report.compactSteps.push({ phase: "explicit-profile-model-native-projection", sessionId, before: explicitBefore, afterSelection: after, afterRequest: await snapshot(sessionId), nativeCalls: nativeCalls.slice(rpcStart), actualCalls: explicitCalls });

      rpcStart = nativeCalls.length; await choose("Target Model"); await converged(sessionId, targetRoute);
      const manualCalls = await submit(sessionId, "manual-native-choice-after-profile");
      for (const call of manualCalls) { assert.deepEqual(route(call), targetRoute); assert.deepEqual(call.header, targetRoute); }
      report.compactSteps.push({ phase: "later-native-picker-choice-wins", sessionId, afterRequest: await snapshot(sessionId), nativeCalls: nativeCalls.slice(rpcStart), actualCalls: manualCalls });
      await compactBreakpoints("hover-focus");
      await page.setViewportSize({ width: 1280, height: 900 });

      // The hold delays a real native invocation only; neither service nor
      // result is replaced. The actual picker remains operable meanwhile.
      await select.selectOption("@model:picker-b"); await settledHeader(); await converged(sessionId, profileRoute);
      const casGate = gate(); profileGate = casGate; rpcStart = nativeCalls.length;
      await select.selectOption("@model:picker-b"); await until(() => casGate.started, "held actual profile CAS");
      assert.equal(await select.isDisabled(), true);
      await page.screenshot({ path: join(config.evidenceRoot, "after-compact-pending-cas.png"), fullPage: true });
      const pendingHeader = await snapshot(sessionId);
      await compactBreakpoints("pending-cas");
      await choose("Target Model"); await converged(sessionId, targetRoute); casGate.release(); await settledHeader();
      after = await snapshot(sessionId);
      const raceRpcs = nativeCalls.slice(rpcStart).filter(({ endpoint }) => endpoint === "session/selectModel");
      assert.equal(raceRpcs.length, 1, "delayed profile stage overwrote a later genuine native picker choice");
      assert.equal(decodeNativePickerArgs(raceRpcs[0].payload).request.model, "target");
      assert.equal(after.admission.profileId, "picker-b"); assert.deepEqual(after.directory.current, targetRoute);
      const raceCalls = await submit(sessionId, "manual-choice-during-profile-cas");
      for (const call of raceCalls) { assert.deepEqual(route(call), targetRoute); assert.deepEqual(call.header, targetRoute); }
      report.compactSteps.push({ phase: "same-session-manual-choice-during-profile-cas", sessionId, pendingHeader, after, afterRequest: await snapshot(sessionId), nativeCalls: nativeCalls.slice(rpcStart), actualCalls: raceCalls });

      const sharedNativeSubmission = async () => {
        const result = await page.evaluate(async ({ id, selection }) => {
          // This is the audited public native submission used by /model. It
          // deliberately submits even when the radio-row optimization skips.
          const directory = window.__dsmmUiContext.root.get("modelDirectories").directoryFor(id);
          return await directory.select(selection);
        }, { id: sessionId, selection: targetRoute });
        assert.equal(result.ok, true, "public native /model-shared submission was refused");
        await converged(sessionId, targetRoute);
        const seq = ctx.get("agents").get(sessionId).session.snapshotEvents().filter(({ type }) => type === "model/selection").at(-1).seq;
        await page.waitForFunction(({ id, seq }) => window.__dsmmUiContext.root.get("sessions").binding(id)?.eventSource.getSnapshot().entries.some((entry) => entry.type === "event" && entry.event.type === "model/selection" && entry.event.seq === seq), { id: sessionId, seq });
        return { entryPoint: "public ModelDirectory.select, exact native /model contribution submission", result, seq };
      };
      const pendingNativeSubmission = await sharedNativeSubmission();
      const samePendingGate = gate(); profileGate = samePendingGate; rpcStart = nativeCalls.length;
      await select.selectOption("@model:picker-b"); await until(() => samePendingGate.started, "held profile CAS before same-pending native submission");
      const samePendingBefore = await snapshot(sessionId);
      const repeatedNativeSubmission = await sharedNativeSubmission();
      const samePendingAfter = await snapshot(sessionId);
      assert.ok(repeatedNativeSubmission.seq > pendingNativeSubmission.seq, "same-pending submission produced no genuine native selection event");
      assert.deepEqual(samePendingAfter.modelProjection, samePendingBefore.modelProjection, "fixture did not reach the native same-pending projection-dedup case");
      samePendingGate.release(); await settledHeader();
      const samePendingRpcs = nativeCalls.slice(rpcStart).filter(({ endpoint }) => endpoint === "session/selectModel");
      assert.equal(samePendingRpcs.length, 1, "same-pending event watermark failed to fence delayed profile-model dispatch");
      assert.equal(decodeNativePickerArgs(samePendingRpcs[0].payload).request.model, "target");
      assert.match(await header.innerText(), /newer native model choice kept/iu);
      const samePendingCalls = await submit(sessionId, "same-pending-native-choice-during-profile-cas");
      for (const call of samePendingCalls) { assert.deepEqual(route(call), targetRoute); assert.deepEqual(call.header, targetRoute); }
      report.compactSteps.push({ phase: "same-pending-native-selection-dedup-during-profile-cas", sessionId, pendingNativeSubmission, repeatedNativeSubmission, before: samePendingBefore, afterSubmission: samePendingAfter,
        afterRequest: await snapshot(sessionId), nativeCalls: nativeCalls.slice(rpcStart), actualCalls: samePendingCalls, borrowedWindowOnly: true, newHistoryLease: false });

      await sharedNativeSubmission();
      const lagCasGate = gate(); profileGate = lagCasGate; rpcStart = nativeCalls.length;
      await select.selectOption("@model:picker-b"); await until(() => lagCasGate.started, "held profile CAS before native pre-ack choice");
      const lagNativeGate = gate(); modelGate = lagNativeGate;
      await page.evaluate(({ id, selection }) => {
        const directory = window.__dsmmUiContext.root.get("modelDirectories").directoryFor(id);
        window.__dsmmOwnedLateNativeSelect = directory.select(selection);
      }, { id: sessionId, selection: targetRoute });
      await until(() => lagNativeGate.started, "real native same-value selector RPC held before Host acknowledgement");
      const preAck = await snapshot(sessionId);
      assert.equal(preAck.directory.status, "selecting"); assert.deepEqual(preAck.directory.pending, targetRoute);
      lagCasGate.release(); await settledHeader();
      const preAckRpcs = nativeCalls.slice(rpcStart).filter(({ endpoint }) => endpoint === "session/selectModel");
      assert.equal(preAckRpcs.length, 1, "profile dispatched over the later native pre-ack selection");
      assert.equal(preAckRpcs[0].result, "pending");
      assert.match(await header.innerText(), /newer native model choice kept/iu);
      await page.screenshot({ path: join(config.evidenceRoot, "after-compact-native-choice-preack.png"), fullPage: true });
      lagNativeGate.release();
      const lagResult = await page.evaluate(async () => { const result = await window.__dsmmOwnedLateNativeSelect; delete window.__dsmmOwnedLateNativeSelect; return result; });
      assert.equal(lagResult.ok, true); await converged(sessionId, targetRoute);
      const lagCalls = await submit(sessionId, "same-pending-native-choice-preack");
      for (const call of lagCalls) { assert.deepEqual(route(call), targetRoute); assert.deepEqual(call.header, targetRoute); }
      report.compactSteps.push({ phase: "same-pending-native-choice-before-host-ack", sessionId, preAck, afterRequest: await snapshot(sessionId), nativeCalls: nativeCalls.slice(rpcStart), actualCalls: lagCalls,
        entryPoint: "public ModelDirectory.select, actual native /model shared submission", actualNativeRpcHeldBeforeAck: true, syntheticProjection: false });

      await sharedNativeSubmission();
      rpcStart = nativeCalls.length;
      const prestartNativeGate = gate(); modelGate = prestartNativeGate;
      await page.evaluate(({ id, selection }) => { window.__dsmmOwnedLateNativeSelect = window.__dsmmUiContext.root.get("modelDirectories").directoryFor(id).select(selection); }, { id: sessionId, selection: targetRoute });
      await until(() => prestartNativeGate.started, "native choice already pending before profile CAS");
      const prestart = await snapshot(sessionId); assert.equal(prestart.directory.status, "selecting");
      const prestartCasGate = gate(); profileGate = prestartCasGate;
      await select.selectOption("@model:picker-b"); await until(() => prestartCasGate.started, "profile CAS captures already-pending native choice");
      prestartNativeGate.release();
      const prestartResult = await page.evaluate(async () => { const result = await window.__dsmmOwnedLateNativeSelect; delete window.__dsmmOwnedLateNativeSelect; return result; });
      assert.equal(prestartResult.ok, true); await converged(sessionId, targetRoute);
      const beforeCasResponse = await snapshot(sessionId); assert.equal(beforeCasResponse.directory.status, "ready");
      prestartCasGate.release(); await settledHeader();
      const prestartRpcs = nativeCalls.slice(rpcStart).filter(({ endpoint }) => endpoint === "session/selectModel");
      assert.equal(prestartRpcs.length, 1, "profile overrode the native choice that was pending when CAS began");
      assert.equal(decodeNativePickerArgs(prestartRpcs[0].payload).request.model, "target");
      assert.match(await header.innerText(), /newer native model choice kept/iu);
      const prestartCalls = await submit(sessionId, "native-choice-pending-before-profile-cas");
      for (const call of prestartCalls) { assert.deepEqual(route(call), targetRoute); assert.deepEqual(call.header, targetRoute); }
      report.compactSteps.push({ phase: "native-choice-pending-before-profile-cas", sessionId, prestart, beforeCasResponse, afterRequest: await snapshot(sessionId), nativeCalls: nativeCalls.slice(rpcStart), actualCalls: prestartCalls });

      const runGate = gate(); providerGate = runGate; rpcStart = nativeCalls.length;
      const busyRequest = submit(sessionId, "native-running-profile-refusal");
      await until(() => runGate.started, "owned real provider request is running");
      const busyHeader = await snapshot(sessionId);
      const disabledWhileRunning = await select.isDisabled();
      if (!disabledWhileRunning) {
        await select.selectOption("picker-no-model"); await settledHeader();
        assert.equal(ctx.get("dsmmProfileRuntime").admission(ctx.get("agents").get(sessionId)).selectedId, "picker-b", "busy native root accepted profile mutation");
        assert.ok(nativeCalls.slice(rpcStart).some(({ endpoint, result }) => endpoint === "dsmmProfiles/selectSession" && result === "dsmm-profiles/refused"));
      }
      await page.screenshot({ path: join(config.evidenceRoot, "after-compact-native-running.png"), fullPage: true });
      runGate.release(); await busyRequest;
      report.compactSteps.push({ phase: "native-running-profile-guard", sessionId, disabledWhileRunning, before: busyHeader, after: await snapshot(sessionId), nativeCalls: nativeCalls.slice(rpcStart) });

      rpcStart = nativeCalls.length; refuseModelAfterCommit = true;
      await select.selectOption("@model:picker-b"); await settledHeader();
      after = await snapshot(sessionId);
      assert.equal(after.admission.profileId, "picker-b"); assert.deepEqual(after.directory.current, targetRoute);
      const failedSelection = nativeCalls.slice(rpcStart).filter(({ endpoint }) => endpoint === "session/selectModel");
      assert.equal(failedSelection.length, 1); assert.notEqual(failedSelection[0].result, "accepted");
      assert.match(await header.innerText(), /Profile applied.*model change unconfirmed/iu);
      await page.screenshot({ path: join(config.evidenceRoot, "after-compact-model-partial-failure.png"), fullPage: true });
      report.compactSteps.push({ phase: "profile-accepted-native-model-unavailable", sessionId, after, nativeCalls: nativeCalls.slice(rpcStart), fixture: "actual adapter becomes unavailable after accepted profile CAS; native selector is not replaced" });
      await compactBreakpoints("model-partial-failure");
      modelRefused = false;

      rpcStart = nativeCalls.length; await select.selectOption("@model:picker-no-model"); await settledHeader();
      after = await snapshot(sessionId);
      assert.equal(after.admission.profileId, "picker-no-model"); assert.deepEqual(after.directory.current, targetRoute);
      assert.equal(nativeCalls.slice(rpcStart).filter(({ endpoint }) => endpoint === "session/selectModel").length, 0);
      assert.match(await header.innerText(), /Profile applied.*no main model/iu);
      await page.screenshot({ path: join(config.evidenceRoot, "after-compact-no-profile-model.png"), fullPage: true });
      report.compactSteps.push({ phase: "profile-accepted-no-main-model", sessionId, after, nativeCalls: nativeCalls.slice(rpcStart) });
      await compactBreakpoints("no-profile-model");

      await select.selectOption("picker-b"); await settledHeader();
      const viewGate = gate(); profileGate = viewGate; rpcStart = nativeCalls.length;
      await select.selectOption("@model:picker-b"); await until(() => viewGate.started, "held actual profile CAS before view change");
      const oldSessionId = sessionId, beforeViewWithdrawal = await snapshot(sessionId);
      sessionId = await newSession();
      // Native blank Sessions show Welcome, not the Conversation header. The
      // old seat must disappear before a first real request opens the new one.
      await header.waitFor({ state: "hidden" });
      const blankPublicState = await page.evaluate(nativePickerPublicState);
      assert.equal(blankPublicState.currentSessionId, sessionId); assert.equal(blankPublicState.controller.currentSessionId, sessionId);
      viewGate.release(); await until(() => nativeCalls.slice(rpcStart).some(({ endpoint, result }) => endpoint === "dsmmProfiles/selectSession" && result !== "pending"), "old-session native CAS settles after view withdrawal");
      const oldCas = nativeCalls.slice(rpcStart).find(({ endpoint }) => endpoint === "dsmmProfiles/selectSession");
      if (oldCas.result !== "accepted") {
        assert.equal(oldCas.cancelled, true, "view withdrawal produced an unexplained native CAS refusal");
        assert.equal(ctx.get("dsmmProfileRuntime").admission(ctx.get("agents").get(oldSessionId)).epoch, beforeViewWithdrawal.admission.epoch, "cancelled old-view operation changed its admission");
      } else assert.equal(ctx.get("dsmmProfileRuntime").admission(ctx.get("agents").get(oldSessionId)).epoch, oldCas.accepted.admissionEpoch);
      await page.waitForFunction(() => window.__dsmmUiContext.root.get("uiSession").adapter.current.getSnapshot().key !== undefined);
      assert.equal(nativeCalls.slice(rpcStart).filter(({ endpoint }) => endpoint === "session/selectModel").length, 0, "stale view dispatched a profile model");
      assert.equal(ctx.get("dsmmProfileRuntime").admission(ctx.get("agents").get(oldSessionId)).selectedId, "picker-b");
      after = await snapshot(sessionId); assert.equal(after.admission.profileId, null); assert.deepEqual(after.directory.current, targetRoute);
      const newViewCalls = await submit(sessionId, "native-view-withdrawal-new-first-request");
      for (const call of newViewCalls) { assert.deepEqual(route(call), targetRoute); assert.deepEqual(call.header, targetRoute); }
      await settledHeader(); assert.equal(await header.locator("select").count(), 1); assert.equal(await header.getByRole("button").count(), 0);
      await page.screenshot({ path: join(config.evidenceRoot, "after-compact-view-withdrawal.png"), fullPage: true });
      report.compactSteps.push({ phase: "native-main-view-withdrawal-during-profile-cas", oldSessionId, currentSessionId: sessionId, beforeViewWithdrawal, blankPublicState, after, afterRequest: await snapshot(sessionId), nativeCalls: nativeCalls.slice(rpcStart), actualCalls: newViewCalls,
        boundary: "public native openSession withdraws old mainView; new blank Welcome has no header until its first real user request; no service/cache/DOM replacement" });
      report.limitations = ["Owned anonymous browser/native carrier, not authenticated Desktop/Web login E2E", "No Lighthouse or render-performance audit", "Settings dirty-draft/source-provider disposal branches remain covered by focused source tests, not claimed by this native picker run"];
    }
    report.outcome = "OBSERVED";
  } catch (error) {
    report.failure = error.stack ?? String(error);
    if (page) {
      report.preflight = await page.evaluate(nativeClientPreflight).catch((failure) => ({ failure: String(failure) }));
      report.uiSessionSnapshot = await page.evaluate(() => {
        const binding = window.__dsmmUiContext?.root.get("uiSession")?.adapter.current.getSnapshot();
        return { key: binding?.key, session: binding?.hooks?.session?.getSnapshot?.() };
      }).catch((failure) => ({ failure: String(failure) }));
      report.publicNativeState = await page.evaluate(nativePickerPublicState).catch((failure) => ({ failure: String(failure) }));
      report.visibleUi = (await page.locator("body").innerText()).slice(0, 5000);
      await page.screenshot({ path: join(config.evidenceRoot, `${config.lane}-boundary.png`), fullPage: true });
    }
  } finally {
    for (const held of heldGates) held.release();
    if (typeof offStart === "function") offStart();
    for (const job of pending.values()) job.control.abort();
    if (context) { await context.tracing.stop({ path: join(config.evidenceRoot, `${config.lane}-trace.zip`) }); await context.close(); }
    if (browser) await browser.close();
    if (server) await server.close();
    report.browserErrors = browserErrors; report.serverErrors = server?.errors ?? [];
    if (browserErrors.length > 0 || report.serverErrors.length > 0) { report.outcome = "BOUNDARY"; report.failure ??= "Owned native browser/server errors require investigation"; }
    report.cleanup = { browserClosed: true, ownedContextClosed: true, hostDisposal: "appExit", serverClosed: true };
  }
  return report;
}

export async function runFrozenNativePickerAcceptance({ artifact, sha256, packageVersion, dshManifest, toolsManifest, browserExecutable, evidenceRoot, env }) {
  const candidate = frozenPickerArtifactOptions({ artifact, sha256, packageVersion });
  for (const [label, path] of Object.entries({ dshManifest, toolsManifest, browserExecutable, evidenceRoot })) {
    assert.ok(typeof path === "string" && isAbsolute(path), `frozen picker needs explicit absolute ${label}`);
  }
  const report = await runOwnedPickerAcceptance(candidate, { dshManifest, toolsManifest, browserExecutable, evidenceRoot, env, observerDiagnostic: false });
  assert.equal(report.outcome, "COMPLETED", `frozen picker acceptance failed: ${report.failure ?? report.lanes.find((lane) => lane.failure)?.failure ?? "native Host/browser boundary"}`);
  return report;
}

async function runOwnedPickerAcceptance(candidate, { dshManifest, toolsManifest, browserExecutable, evidenceRoot, env: parentEnv, observerDiagnostic }) {
  await mkdir(evidenceRoot, { recursive: true });
  const owned = await mkdtemp(join(await realpath(tmpdir()), "dsmm-native-picker-"));
  const token = randomUUID();
  await writeFile(join(owned, ".owner"), token, { flag: "wx" });
  const nativeRequire = createRequire(dshManifest);
  const artifact = join(owned, candidate.kind === "published-before" ? "dsmm-0.1.5.tgz" : "dsmm-source.tgz");
  const workspace = join(owned, "workspace");
  await mkdir(workspace);
  const report = { artifactKind: candidate.kind, artifactSha256: candidate.sha256,
    ...(candidate.kind === "ci-frozen-artifact" ? { packageVersion: candidate.packageVersion, publicationClaimed: false, proofScope: "frozen-artifact-native-picker-and-compact-profile" }
      : candidate.sourceIdentity ? { sourceIdentity: candidate.sourceIdentity, publicationClaimed: false, proofScope: observerDiagnostic ? "observer-attachment-diagnostic-only" : "current-source-native-picker-and-compact-profile", immutableBeforeSha256: PICKER_ARTIFACT_SHA256 }
      : { artifactUrl: candidate.url }), lanes: [] };
  try {
    let bytes;
    if (candidate.kind === "published-before") {
      const response = await fetch(candidate.url, { signal: AbortSignal.timeout(30_000) }); assert.equal(response.status, 200);
      bytes = Buffer.from(await response.arrayBuffer());
    } else bytes = await readFile(await realpath(candidate.artifact));
    assert.equal(hash(bytes), candidate.sha256, "explicit artifact identity changed before owned install");
    await writeFile(artifact, bytes, { flag: "wx" });
    for (const lane of candidate.lanes) {
      const home = join(owned, lane); await mkdir(home);
      const env = { PATH: parentEnv.PATH, LANG: parentEnv.LANG, LC_ALL: parentEnv.LC_ALL, TZ: parentEnv.TZ, DISPLAY: parentEnv.DISPLAY, XAUTHORITY: parentEnv.XAUTHORITY, HOME: home, DSH_HOME: home,
        XDG_CONFIG_HOME: join(home, "config"), XDG_DATA_HOME: join(home, "data"), XDG_STATE_HOME: join(home, "state"), XDG_CACHE_HOME: join(home, "cache"), DSH_TELEMETRY_MODE: "DISABLED", DSH_TELEMETRY_DISABLED: "1" };
      const profile = `picker-${lane}`;
      const command = (args) => { const result = spawnSync("dsh", args, { env, cwd: workspace, encoding: "utf8", timeout: 45_000 }); assert.equal(result.status, 0, result.stderr); };
      command(["--profile", profile, "--from-default-profile", "web", "--dump-config"]);
      if (lane === "present") command(["plugin", "--profile", profile, "add", artifact]);
      const receipt = join(evidenceRoot, `${lane}-receipt.json`);
      const packageRoot = join(home, "profiles", profile, "node_modules", "@dsmm", "dsmm");
      if (candidate.kind === "ci-frozen-artifact") {
        const installed = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
        assert.equal(installed.name, "@dsmm/dsmm");
        assert.equal(installed.version, candidate.packageVersion, "fresh picker profile installed the wrong frozen version");
      }
      const patch = join(owned, `${lane}.patch.yml`);
      const rows = [{ id: "session-title-llm", disabled: true }];
      if (lane === "present") rows.push({ id: "session-persistence-jsonl", disabled: true }, { id: "dsmm", config: {
        sessionPersistence: { root: join(home, "sessions"), compression: "zstd" }, defaultActive: true, roles: { "dsmm-builder": false },
        roleRouting: { "dsmm-orchestrator": { primary: { provider, model: "configured-default", reasoningEffort: "max" }, fallbackRoutes: [], strategy: "startup-lock" } },
      } });
      rows.push({ insert: [{ id: "dsmm-native-picker-owned-diagnostic", name: pathToFileURL(fileURLToPath(import.meta.url)).href, config: {
        lane, receipt, packageRoot, sha256: candidate.sha256, artifactKind: candidate.kind, observerDiagnostic,
        ...(candidate.packageVersion ? { packageVersion: candidate.packageVersion } : {}), ...(candidate.sourceIdentity ? { sourceIdentity: candidate.sourceIdentity } : {}), workspace, evidenceRoot,
        dshManifest: nativeRequire.resolve("@deepseek-ai/dsh/package.json"), toolsManifest, browserExecutable,
      } }] });
      await writeFile(patch, nativeRequire("js-yaml").dump(rows));
      const child = spawn("dsh", ["--profile", profile, "--patch", patch, "--no-open", "--host", "127.0.0.1", "--port", "0"], { env, cwd: workspace, stdio: ["ignore", "pipe", "pipe"] });
      let diagnostic = "";
      for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => { diagnostic = `${diagnostic}${data.toString()}`.slice(-8000); });
      const watchdog = setTimeout(() => child.kill("SIGTERM"), 240_000);
      let exit;
      try { exit = await new Promise((settle, reject) => { child.once("error", reject); child.once("exit", (code, signal) => settle({ code, signal })); }); }
      finally { clearTimeout(watchdog); }
      const laneReport = await readFile(receipt, "utf8").then(JSON.parse, () => ({ outcome: "BOUNDARY", failure: "native Host did not write picker receipt", diagnostic: diagnostic.replace(/([?&]token=)[^\s'"<>]+/gu, "$1[redacted]") }));
      report.lanes.push({ lane, exit, ...laneReport });
    }
  } catch (error) {
    report.failure = error.stack ?? String(error);
    throw error;
  } finally {
    assert.equal(dirname(await realpath(owned)), await realpath(tmpdir()));
    assert.match(basename(owned), /^dsmm-native-picker-[A-Za-z0-9_-]+$/u);
    assert.equal(await readFile(join(owned, ".owner"), "utf8"), token);
    await rm(owned, { recursive: true, force: false });
    report.ownedHomesRemoved = true;
    if (candidate.kind !== "published-before") report.outcome = !report.failure && report.lanes.length === 1 && report.lanes.every((lane) => lane.outcome === "OBSERVED" && lane.exit.code === 0 && lane.exit.signal === null && lane.browserErrors.length === 0 && lane.serverErrors.length === 0) ? "COMPLETED" : "BOUNDARY";
    await writeFile(join(evidenceRoot, observerDiagnostic ? "picker-observer-receipt.json" : candidate.receiptName), `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

async function runInner() {
  const candidate = pickerArtifactOptions(process.argv.slice(3));
  const report = await runOwnedPickerAcceptance(candidate, {
    dshManifest: "/usr/local/lib/node_modules/@deepseek-ai/dsh/package.json", toolsManifest: "/opt/dsmm-acceptance-tools/package.json",
    browserExecutable: "/usr/bin/chromium", evidenceRoot: "/dsmm-picker-evidence", env: process.env,
    observerDiagnostic: process.env.DSMM_PICKER_OBSERVER_DIAGNOSTIC === "1",
  });
  await new Promise((settle, reject) => process.stdout.write(`${JSON.stringify({ lanes: report.lanes.map(({ lane, outcome, failure }) => ({ lane, outcome, failure })), ownedHomesRemoved: true })}\n`, (error) => error ? reject(error) : settle()));
  if (candidate.kind === "local-current-source" && report.outcome !== "COMPLETED") process.exitCode = 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url) && process.argv[2] === "--inner") await runInner();
