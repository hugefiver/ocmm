import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, rmdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startProfileUiServer } from "./profile-ui-harness-server.mjs";

const PROFILE_ID = "browser-native";
const profileText = (reviewCap, label = "Browser native acceptance profile with a deliberately long display name to check narrow Settings layouts") => `${JSON.stringify({ version: 1, id: PROFILE_ID, label, settings: { defaultActive: true, workflow: { reviewCap } } }, null, 2)}\n`;

export function validatedNativeStorage(nativeStorage, env) {
  assert.ok(nativeStorage && typeof nativeStorage === "object" && !Array.isArray(nativeStorage), "baseline-proven nativeStorage must be passed by the Docker runner");
  assert.ok(typeof env.DSH_HOME === "string" && isAbsolute(env.DSH_HOME), "native storage requires the runner's isolated DSH_HOME");
  assert.ok(typeof nativeStorage.root === "string" && isAbsolute(nativeStorage.root), "passed native storage root must be absolute");
  assert.equal(resolve(nativeStorage.root), resolve(join(env.DSH_HOME, "sessions")), "native storage root differs from the proved fresh-profile session directory");
  assert.equal(nativeStorage.compression, "zstd", "native storage compression must preserve the proved zstd default");
  return { root: nativeStorage.root, compression: nativeStorage.compression };
}

export function nativeUiStartupPatch({ nativeStorage, env, auditConfig }) {
  const storage = validatedNativeStorage(nativeStorage, env);
  return [
    { id: "session-persistence-jsonl", name: "@deepseek-ai/dsh-session-persistence-jsonl", disabled: true },
    // The patch replaces the whole DSMM Config; retain the proved startup-only
    // storage configuration while adjusting this test's runtime baseline.
    { id: "dsmm", config: { sessionPersistence: storage, workflow: { reviewCap: 2 }, roles: { "dsmm-builder": false }, runtimeRecovery: { enabled: false } } },
    { id: "session-title-llm", disabled: true },
    { insert: [{ id: "dsmm-native-ui-acceptance", name: pathToFileURL(fileURLToPath(import.meta.url)).href, config: auditConfig }] },
  ];
}

export async function removeOwnedUiRoot(runRoot, token) {
  const [temporaryRoot, owned] = await Promise.all([realpath(tmpdir()), realpath(runRoot)]);
  assert.equal(dirname(owned), temporaryRoot, "UI cleanup root is not a direct temporary child");
  assert.match(basename(owned), /^dsmm-profile-ui-[A-Za-z0-9_-]+$/u);
  assert.equal(await readFile(join(owned, ".dsmm-ui-owner"), "utf8"), token, "UI cleanup ownership token changed");
  await rm(owned, { recursive: true, force: false });
}

/** Frozen installed-artifact, native-client component acceptance; not login E2E. */
export async function runAcceptance({ artifact, sha256, dshManifest, packageRoot, profilePackage, env, workspace, ownedRoot, nativeStorage }) {
  assert.ok(isAbsolute(packageRoot) && isAbsolute(dshManifest) && isAbsolute(profilePackage), "acceptance requires exact installed artifact and native manifests");
  packageRoot = await realpath(packageRoot);
  assert.equal(createHash("sha256").update(await readFile(artifact)).digest("hex"), sha256, "frozen artifact hash changed before UI acceptance");
  const installed = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  assert.equal(installed.name, "@dsmm/dsmm");
  assert.ok(installed.dsh?.client, "installed artifact has no native client declaration");
  const storage = validatedNativeStorage(nativeStorage, env);
  const runRoot = await mkdtemp(join(await realpath(tmpdir()), "dsmm-profile-ui-"));
  const token = randomUUID();
  await writeFile(join(runRoot, ".dsmm-ui-owner"), token, { flag: "wx" });
  const evidenceRoot = resolve(env.DSMM_UI_EVIDENCE_DIR ?? join(ownedRoot, "ui-qa"));
  await mkdir(evidenceRoot, { recursive: true });
  let report;
  try {
    const nativeRequire = createRequire(dshManifest);
    const yaml = nativeRequire("js-yaml");
    const patchPath = join(runRoot, "native-ui-acceptance.patch.yml");
    const nativeReceipt = join(runRoot, "native-ui-receipt.json");
    await writeFile(patchPath, yaml.dump(nativeUiStartupPatch({ nativeStorage: storage, env,
      auditConfig: { artifact, sha256, dshManifest, packageRoot, profilePackage, env, workspace, ownedRoot, runRoot, evidenceRoot, nativeReceipt, nativeStorage: storage } })));
    const child = spawn("dsh", ["--profile", basename(dirname(profilePackage)), "--patch", patchPath, "--no-open", "--host", "127.0.0.1", "--port", "0"], { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] });
    // Native startup output may contain a launch token. Keep it in memory only,
    // and never forward it to retained browser evidence or the caller.
    let diagnostic = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (bytes) => { diagnostic = `${diagnostic}${bytes.toString()}`.slice(-8000); });
    const timeout = setTimeout(() => child.kill("SIGTERM"), 180_000);
    let result;
    try { result = await new Promise((settle, reject) => { child.once("error", reject); child.once("exit", (code, signal) => settle({ code, signal })); }); }
    finally { clearTimeout(timeout); }
    try { report = JSON.parse(await readFile(nativeReceipt, "utf8")); }
    catch { report = { outcome: "FAILED", kind: "native-client-component-owned-carrier", artifactSha256: sha256, failure: "Native Host did not reach the appReady browser acceptance plugin.", nativeExit: result, diagnostic: diagnostic.replace(/([?&]token=)[^\s'"<>]+/gu, "$1[redacted]") }; }
    if (result.code !== 0) { report.outcome = "FAILED"; report.nativeExit = result; }
  } finally { await removeOwnedUiRoot(runRoot, token); }
  const receipt = join(evidenceRoot, "native-profile-ui-receipt.json");
  report.receipt = receipt;
  report.cleanup = { ...report.cleanup, ownedTemporaryRootRemoved: true, nativeHostExited: true };
  await writeFile(receipt, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export const name = "dsmm-native-ui-acceptance";
export const inject = ["appReady", "appExit", "agents", "llm", "dsmmProfileRuntime", "dsmmProfiles", "typertGateway", "connection", "sessionPersistence"];

/** Native Loader invokes this in the real frozen installed Host composition. */
export async function apply(ctx, config) {
  let disposed = false;
  let started = false;
  const onReady = ctx.get("appReady").onReady(() => {
    if (disposed || started) return;
    started = true;
    void runNativeBrowserAcceptance(ctx, config).then(async (report) => {
      await writeFile(config.nativeReceipt, `${JSON.stringify(report, null, 2)}\n`);
      ctx.get("appExit")(report.outcome === "COMPLETED" ? 0 : 1);
    }).catch(async (error) => {
      await writeFile(config.nativeReceipt, `${JSON.stringify({ outcome: "FAILED", postAppReady: true, failure: error.stack ?? String(error) }, null, 2)}\n`);
      ctx.get("appExit")(1);
    });
  });
  ctx.effect(() => () => { disposed = true; if (typeof onReady === "function") onReady(); });
}

async function runNativeBrowserAcceptance(ctx, { sha256, dshManifest, packageRoot, profilePackage, env, workspace, evidenceRoot, nativeStorage }) {
  const toolsManifest = env.DSMM_ACCEPTANCE_TOOLS_MANIFEST;
  assert.ok(toolsManifest && isAbsolute(toolsManifest), "Docker browser acceptance tools manifest is required; no host dependency fallback");
  const acceptanceRequire = createRequire(toolsManifest);
  const { chromium } = await import(pathToFileURL(acceptanceRequire.resolve("playwright")).href);
  const nativeRequire = createRequire(dshManifest);
  const nativeLoad = (specifier) => import(pathToFileURL(nativeRequire.resolve(specifier)).href);
  const [{ SessionId }, { LlmAdapter, ReasoningEffortId }] = await Promise.all([nativeLoad("@deepseek-ai/dsh-session"), nativeLoad("@deepseek-ai/dsh-llm")]);
  // These library exports have no runtime native peers. The actual full plugin
  // above was loaded only by DSH's native Loader, not eager Node resolution.
  const { createProfileRuntime } = await import(pathToFileURL(join(packageRoot, "lib", "profile-runtime.js")).href);
  const { resolveConfig } = await import(pathToFileURL(join(packageRoot, "lib", "settings.js")).href);
  const evidence = [];
  const report = { outcome: "FAILED", postAppReady: true, kind: "native-client-component-owned-carrier", artifactSha256: sha256, installedRoot: packageRoot,
    authentication: { realWebOrDesktopLogin: "NOT_EXERCISED", signedIn: false, copiedBrowserState: false, productionAuthenticationModified: false },
    performance: { lighthouse: "NOT_RUN_COMPONENT_ACCEPTANCE", scoreClaim: false }, checks: {}, evidence, nativeCalls: [] };
  const handles = [];
  const pending = new Map();
  let server;
  let browser;
  let browserContext;
  let peer;
  let runtime;
  let blockedLock;
  const gates = new Map();
  const activeGates = new Set();
  try {
    const storage = validatedNativeStorage(nativeStorage, env);
    const persistence = ctx.get("sessionPersistence");
    assert.equal(persistence.name, "dsmm-session-persistence", "native UI startup did not activate the approved DSMM-owned persistence class");
    assert.equal(persistence[Symbol.for("dsmm.sessionPersistence.ignorable.v1")], true, "native UI startup persistence lacks the approved DSMM ignorable-event capability");
    assert.equal(resolve(persistence.config.root), resolve(storage.root), "native UI startup changed the proved session storage root");
    assert.equal(persistence.config.compression, storage.compression, "native UI startup changed the proved session compression");
    report.nativeStorage = { ...storage, provider: persistence.name, ignorableEventCapability: true, passedByRunner: true, startupOnly: true, companionLoaderEntry: false };
    class LocalModelCatalog extends LlmAdapter {
      async resolveModel(provider, model) { return { provider, id: model, name: model, inputModalities: ["text"], reasoning: { efforts: ["off", "low", "high", "max"].map((id) => ({ id: ReasoningEffortId(id), name: id })), defaultEffort: ReasoningEffortId("high") } }; }
      async *stream() { throw new Error("UI component acceptance must not issue a model request"); }
    }
    ctx.get("llm").registerAdapter(["dsmm-ui-fixture"], new LocalModelCatalog());
    const profileDir = ctx.get("profileContext").dir;
    assert.equal(await realpath(profileDir), await realpath(dirname(profilePackage)), "Host profile directory differs from the installed native profile");
    runtime = ctx.get("dsmmProfileRuntime");
    const gateway = ctx.get("typertGateway");
    assert.ok(gateway && ctx.get("dsmmProfiles"), "native profile RPC service was not installed");
    assert.equal(ctx.get("dsmmProfiles").backend, runtime, "native RPC is not wired to the installed runtime manager");
    report.strictDescriptors = ["describe", "read", "save", "select"].map((method) => {
      const descriptor = ctx.get("typert").local.get(`dsmmProfiles/${method}`);
      assert.ok(descriptor, `native strict descriptor for ${method} was not registered`);
      assert.equal(descriptor.result.mode, "strict");
      assert.ok(descriptor.parameters.every(({ codec }) => codec?.mode === "strict"));
      return { endpoint: `dsmmProfiles/${method}`, resultMode: descriptor.result.mode, parameters: descriptor.parameters.map(({ name, codec }) => ({ name, mode: codec.mode })) };
    });
    peer = ctx.get("connection").operator;
    assert.ok(peer?.ctx, "native Connection did not supply its genuine operator Peer");
    let agentSequence = 0;
    const createRoot = async () => {
      const handle = await ctx.get("agents").create({ sessionId: SessionId(`dsmm-ui-root-${++agentSequence}`), meta: { cwd: workspace }, agentOptions: { provider: "dsmm-ui-fixture", model: "local-catalog", reasoningEffort: ReasoningEffortId("high") } });
      handles.push(handle); return handle.agent;
    };
    const existingBlank = await createRoot();
    assert.equal(runtime.getSettings(existingBlank).workflow.reviewCap, 2);
    assert.equal(existingBlank.session.snapshotEvents().some((event) => event.type === "message"), false);
    assert.equal(existingBlank.session.snapshotEvents().some((event) => event.type === "turn/start" || event.type === "request/header"), false);
    report.checks.existingBlankStartsAtBaseline = true;
    server = await startProfileUiServer({ nativeRequire, packageRoot, sha256 });
    report.nativeClient = server.bundleProof;
    const executablePath = env.DSMM_BROWSER_EXECUTABLE;
    assert.ok(executablePath && isAbsolute(executablePath), "explicit Docker browser executable is required");
    browser = await chromium.launch({ executablePath, headless: false, args: ["--disable-extensions", "--disable-sync", "--no-sandbox"] });
    browserContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US", serviceWorkers: "block" });
    assert.deepEqual(await browserContext.cookies(), [], "new context was not empty");
    await browserContext.tracing.start({ screenshots: true, snapshots: true, sources: false });
    const page = await browserContext.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") pageErrors.push(message.text()); });
    page.on("requestfailed", (request) => pageErrors.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.exposeBinding("__dsmmNativeBridge", async (source, input) => {
      assert.equal(source.page, page, "bridge called outside its owned page");
      assert.equal(new URL(source.frame.url()).origin, server.origin, "bridge caller origin is not run owned");
      const { operation, id, channel, endpoint, payload } = input;
      if (operation === "cancel") { const job = pending.get(id); job?.control.abort(); return { ok: true, value: null }; }
      if (operation === "next") {
        const job = pending.get(id); assert.ok(job?.iterator, "stream request lost its native iterator");
        try { return { ok: true, value: await job.iterator.next() }; } catch (error) { return { ok: false, error: gateway.wireStream.failure(error) }; }
      }
      assert.equal(channel, "/api");
      const control = new AbortController();
      pending.set(id, { control });
      if (operation === "open") {
        assert.equal(endpoint, "$events", "owned bridge may open only native generation events");
        try {
          const stream = await gateway.wireStream.open(endpoint, payload, { async *[Symbol.asyncIterator]() {} }, peer, control.signal);
          pending.set(id, { control, iterator: stream[Symbol.asyncIterator]() });
          return { ok: true, value: null };
        } catch (error) { pending.delete(id); return { ok: false, error: gateway.wireStream.failure(error) }; }
      }
      assert.equal(operation, "call");
      assert.match(endpoint, /^dsmmProfiles\/(describe|read|save|select)$/u);
      const [namespace, method] = endpoint.split("/");
      const record = { endpoint, strictGateway: true, nativePeer: peer.id, result: "pending" };
      report.nativeCalls.push(record);
      try {
        const gate = gates.get(method);
        if (gate) { gates.delete(method); activeGates.add(gate); gate.entered(); await gate.wait; activeGates.delete(gate); }
        const value = await gateway.invoke({ namespace, method, args: payload.args, peer, signal: control.signal });
        record.result = "accepted";
        return { ok: true, value };
      } catch (error) { const failure = gateway.wireStream.failure(error); record.result = failure.code; if (failure.details?.code) record.domainCode = failure.details.code; return { ok: false, error: failure }; }
      finally { pending.delete(id); }
    });
    const screenshot = async (name) => { const path = join(evidenceRoot, `${name}.png`); await page.screenshot({ path, fullPage: true }); evidence.push({ kind: "screenshot", path, width: page.viewportSize().width }); };
    const idle = () => page.waitForFunction(() => document.querySelector(".dsmm-profiles")?.getAttribute("aria-busy") === "false");
    const editor = page.getByLabel("Runtime configuration (JSONC)", { exact: true });
    const nameInput = page.getByLabel("Profile ID (name)", { exact: true });
    const action = (name) => page.getByRole("button", { name, exact: true });
    const assertText = async (locator, pattern) => assert.match(await locator.innerText(), pattern);
    const checkTextContrast = async (theme) => {
      const result = await page.evaluate(() => {
        const rgba = (value) => { const parts = value.match(/[\d.]+/g)?.map(Number) ?? []; return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]; };
        const blend = (foreground, background) => foreground.slice(0, 3).map((channel, index) => channel * foreground[3] + background[index] * (1 - foreground[3]));
        const luminance = (channels) => channels.map((channel) => channel / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
        return [...document.querySelectorAll(".dsmm-profiles :is(h2,p,label,textarea,button)")].filter((node) => node.getBoundingClientRect().width > 0 && !node.disabled && (node.textContent?.trim() || node.value)).map((node) => {
          const ancestors = []; for (let parent = node; parent; parent = parent.parentElement) ancestors.unshift(parent);
          let background = [255, 255, 255]; for (const parent of ancestors) background = blend(rgba(getComputedStyle(parent).backgroundColor), background);
          const foreground = blend(rgba(getComputedStyle(node).color), background);
          const values = [luminance(foreground), luminance(background)].sort((first, second) => first - second);
          return { text: (node.textContent ?? node.value).trim().slice(0, 100), ratio: (values[1] + 0.05) / (values[0] + 0.05) };
        });
      });
      assert.ok(result.length > 5 && result.every(({ ratio }) => ratio >= 4.5), `${theme} required text contrast failed: ${JSON.stringify(result.filter(({ ratio }) => ratio < 4.5))}`);
      report.textContrast ??= {};
      report.textContrast[theme] = { measuredElements: result.length, minimumRatio: Math.min(...result.map(({ ratio }) => ratio)) };
    };
    await page.goto(server.origin);
    await page.getByRole("heading", { name: "DSMM Profiles", exact: true }).waitFor();
    await idle();
    report.nativeClient.seed = await page.evaluate(() => window.__dsmmNativeSeedProof);
    assert.match(report.nativeClient.seed.reactVersion, /^18\./u);
    assert.deepEqual(report.nativeClient.seed.primitiveNames.sort(), ["Button", "Input"]);
    await assertText(page.locator(".dsmm-profiles"), /No saved profiles yet/u);
    await screenshot("empty-1280");
    await action("New profile").hover();
    await action("New profile").click();
    await nameInput.fill("Uppercase");
    await action("Save profile").click();
    await page.getByRole("alert").waitFor();
    assert.equal(await nameInput.getAttribute("aria-invalid"), "true");
    assert.equal(await nameInput.evaluate((node) => node === document.activeElement), true, "invalid profile ID was not focused");
    assert.equal(await nameInput.inputValue(), "Uppercase");
    report.checks.invalidIdRetainedAndFocused = true;
    await nameInput.fill(PROFILE_ID);
    await editor.fill(profileText(7));
    assert.equal(await action("Apply saved profile").isDisabled(), true);
    await action("Save profile").click(); await idle();
    await assertText(page.getByRole("status"), /Saved browser-native/u);
    const saved = await runtime.read(PROFILE_ID);
    assert.equal(saved.content, profileText(7));
    assert.equal((await runtime.describe()).selectedId, null, "saving alone changed selection");
    assert.equal(runtime.getSettings((await createRoot())).workflow.reviewCap, 2);
    report.checks.createSaveRealFileWithoutApply = true;
    await action("Apply saved profile").focus(); await page.keyboard.press("Enter"); await idle();
    await assertText(page.locator("[data-dsmm-selection]"), /browser-native/u);
    const selected = await runtime.describe();
    assert.equal(selected.appliedRevision, saved.revision);
    const selectedRoot = await createRoot();
    assert.equal(runtime.getSettings(selectedRoot).workflow.reviewCap, 7);
    assert.ok(Object.isFrozen(runtime.getSettings(selectedRoot)) && Object.isFrozen(runtime.getSettings(selectedRoot).workflow), "native session admission is not deeply immutable");
    assert.equal(runtime.getSettings(existingBlank).workflow.reviewCap, 2);
    report.checks.nativeNewRootAndExistingBlankIsolation = true;
    await editor.fill(profileText(9)); await action("Save profile").click(); await idle();
    const updated = await runtime.read(PROFILE_ID);
    assert.notEqual(updated.revision, selected.appliedRevision);
    assert.equal((await runtime.describe()).appliedRevision, selected.appliedRevision);
    assert.equal(runtime.getSettings(await createRoot()).workflow.reviewCap, 7);
    report.checks.changedDraftDoesNotMutatePinnedSelection = true;
    await page.reload(); await idle();
    await page.getByLabel("Profile to edit", { exact: true }).selectOption(PROFILE_ID); await idle();
    assert.equal(await editor.inputValue(), profileText(9));
    await assertText(page.locator("[data-dsmm-editor-state]"), /not applied/u);
    const restartedRuntime = await createProfileRuntime(ctx, resolveConfig({ workflow: { reviewCap: 2 } }));
    assert.equal(restartedRuntime.getSettings().workflow.reviewCap, 7, "cold reload failed to load immutable selected bytes");
    report.checks.browserReloadAndDiskSelectionPersistence = true;
    await editor.fill("{ broken JSONC"); await action("Save profile").click(); await idle();
    await assertText(page.getByRole("alert"), /refused validation|not valid/u);
    assert.equal(await editor.inputValue(), "{ broken JSONC");
    assert.equal(await editor.getAttribute("aria-invalid"), "true");
    assert.equal(await editor.evaluate((node) => node === document.activeElement), true);
    await screenshot("validation-1280");
    report.checks.invalidDraftRetainedAndFocused = true;
    await editor.fill(profileText(10));
    await runtime.save({ id: PROFILE_ID, content: profileText(8), expectedRevision: updated.revision });
    await action("Save profile").click(); await idle();
    await assertText(page.getByRole("alert"), /changed elsewhere/u);
    assert.equal(await editor.inputValue(), profileText(10));
    assert.equal((await runtime.describe()).appliedRevision, selected.appliedRevision);
    await screenshot("conflict-1280");
    report.checks.realFileCompareAndSwapConflictRetainsDraft = true;
    await action("Reload saved profile").click();
    await action("Cancel").waitFor();
    assert.equal(await action("Cancel").evaluate((node) => node === document.activeElement), true);
    await page.keyboard.press("Escape");
    assert.equal(await editor.inputValue(), profileText(10));
    await action("Reload saved profile").click(); await action("Discard changes").click(); await idle();
    await checkTextContrast("light");
    assert.equal(await editor.inputValue(), profileText(8));
    report.checks.dirtyDiscardCancelEscapeAndRead = true;
    let gateEntered; const entered = new Promise((settle) => { gateEntered = settle; });
    let releaseGate; const gateWait = new Promise((settle) => { releaseGate = settle; });
    gates.set("save", { entered: gateEntered, wait: gateWait, release: releaseGate });
    await editor.fill(profileText(5)); await action("Save profile").click(); await entered;
    assert.equal(await editor.isDisabled(), true);
    assert.equal(await action("New profile").isDisabled(), true);
    assert.equal(await action("Apply saved profile").isDisabled(), true);
    await screenshot("busy-1280");
    releaseGate(); await idle();
    assert.equal((await runtime.read(PROFILE_ID)).content, profileText(5));
    report.checks.busyDisablesCompetingCommits = true;
    // Cause a genuine file-backend refusal with an owned lock, never a canned RPC.
    const lockPath = join(profileDir, "dsmm-profiles", ".lock");
    await mkdir(lockPath);
    blockedLock = lockPath;
    try {
      await editor.fill(profileText(4)); await action("Save profile").click(); await idle();
      await assertText(page.getByRole("alert"), /could not commit/u);
      assert.equal(await editor.inputValue(), profileText(4));
      assert.equal((await readFile(join(profileDir, "dsmm-profiles", `${PROFILE_ID}.jsonc`), "utf8")), profileText(5));
      await screenshot("backend-error-1280");
    } finally { await rmdir(lockPath); blockedLock = undefined; }
    report.checks.realBackendErrorRetainsDraftAndFiles = true;
    await action("Reload saved profile").click(); await action("Discard changes").click(); await idle();
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth, section: document.querySelector(".dsmm-profiles").scrollWidth, sectionClient: document.querySelector(".dsmm-profiles").clientWidth }));
      assert.ok(geometry.document <= width && geometry.section <= geometry.sectionClient + 1, `horizontal overflow at ${width}: ${JSON.stringify(geometry)}`);
      await screenshot(`profiles-light-${width}`);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => document.body.setAttribute("data-ds-dark-theme", ""));
    await checkTextContrast("dark");
    assert.equal(await editor.isVisible(), true, "reduced-motion hid required editing content");
    await screenshot("profiles-dark-reduced-1280");
    await page.setViewportSize({ width: 375, height: 900 });
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "200% zoom caused horizontal overflow");
    await screenshot("profiles-dark-reduced-zoom200-375");
    await page.evaluate(() => { document.documentElement.style.zoom = ""; document.body.removeAttribute("data-ds-dark-theme"); });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await action("Reset to baseline").focus(); await page.keyboard.press("Space"); await idle();
    assert.equal((await runtime.describe()).selectedId, null);
    assert.equal(runtime.getSettings(await createRoot()).workflow.reviewCap, 2);
    assert.equal(runtime.getSettings(selectedRoot).workflow.reviewCap, 7);
    report.checks.keyboardResetNativeBaselineWithoutChangingExistingRoot = true;
    const profileSelect = page.getByLabel("Profile to edit", { exact: true });
    await profileSelect.focus();
    await page.keyboard.press("Home"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    await idle();
    assert.equal(await profileSelect.inputValue(), PROFILE_ID);
    const focusIndicator = await profileSelect.evaluate((node) => ({ outline: getComputedStyle(node).outlineStyle, width: getComputedStyle(node).outlineWidth, color: getComputedStyle(node).outlineColor }));
    assert.notEqual(focusIndicator.outline, "none", "keyboard select has no visible focus indicator");
    report.focusIndicator = focusIndicator;
    const keyboardOrder = [];
    await action("New profile").focus();
    for (let index = 0; index < 6; index += 1) { keyboardOrder.push(await page.evaluate(() => ({ tag: document.activeElement.tagName, name: document.activeElement.getAttribute("aria-label") ?? document.activeElement.textContent?.trim().slice(0, 80), outline: getComputedStyle(document.activeElement).outlineStyle }))); await page.keyboard.press(index === 5 ? "Shift+Tab" : "Tab"); }
    report.keyboardOrder = keyboardOrder;
    assert.ok(keyboardOrder.every(({ tag }) => ["BUTTON", "SELECT", "TEXTAREA", "INPUT"].includes(tag)), "keyboard focus left the interactive component unexpectedly");
    report.checks.pointerKeyboardReducedMotionZoomAndResponsive = true;
    assert.deepEqual(pageErrors, [], "browser raised an uncontained runtime or network error");
    assert.deepEqual(server.errors, [], "owned static server failed");
    assert.ok(report.nativeCalls.some(({ domainCode }) => domainCode === "validation") && report.nativeCalls.some(({ domainCode }) => domainCode === "conflict"));
    report.storageProof = { profileDir: join(profileDir, "dsmm-profiles"), savedRevision: saved.revision, appliedRevisionBeforeReset: selected.appliedRevision, latestRawRevision: (await runtime.read(PROFILE_ID)).revision, selectionAfterReset: await runtime.describe(), genuineNativeGateway: true, genuineOperatorPeer: true, cannedProfileRpc: false };
    report.outcome = "COMPLETED";
  } catch (error) { report.failure = error.stack ?? String(error); }
  finally {
    const cleanupErrors = [];
    const cleanup = async (label, operation) => { try { await operation(); } catch (error) { cleanupErrors.push({ label, message: error.message }); } };
    for (const gate of [...gates.values(), ...activeGates]) { gate.entered(); gate.release(); }
    for (const job of pending.values()) job.control.abort();
    if (blockedLock) await cleanup("owned backend lock", () => rmdir(blockedLock));
    if (browserContext) {
      const path = join(evidenceRoot, "native-profile-ui.trace.zip");
      await cleanup("browser trace", async () => { await browserContext.tracing.stop({ path }); evidence.push({ kind: "trace", path }); });
      await cleanup("browser context", () => browserContext.close());
    }
    if (browser) await cleanup("browser process", () => browser.close());
    if (server) await cleanup("owned static server", () => server.close());
    for (const handle of handles.reverse()) await cleanup("native Agent", () => handle.dispose());
    report.cleanup = { browserContextClosed: !cleanupErrors.some(({ label }) => label === "browser context"), nativeAgentsDisposed: !cleanupErrors.some(({ label }) => label === "native Agent"), nativeHostDisposal: "owned-by-appExit", errors: cleanupErrors };
    if (cleanupErrors.length > 0) report.outcome = "FAILED";
  }
  return report;
}
