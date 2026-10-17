import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { mkdir, mkdtemp, realpath, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { Context } from "@deepseek-ai/cordis";
import type { Service } from "@deepseek-ai/cordis";
import * as NativeConnection from "@deepseek-ai/dsh-client-connection";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import { TypertGatewayService } from "@deepseek-ai/dsh-api-gateway";
import { remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import { DsmmConfigHost } from "../lib/profile-rpc.js";
import type { DshAgent } from "../lib/dsh-types.js";

const available = process.env.DSMM_TEST_DSH_ENTRY !== undefined && process.env.DSMM_TEST_PLAYWRIGHT_ENTRY !== undefined;

// Same production page/controllers, native React/primitives/theme and durable native
// SettingsForms backend. The owned binding is a test carrier, not browser login E2E.
test("Core deployment controls save sparse desired values through native Gateway and SettingsForms", { skip: !available && "requires explicit DSH and Playwright anchors (DSMM_TEST_DSH_ENTRY and DSMM_TEST_PLAYWRIGHT_ENTRY)", timeout: 60_000 }, async t => {
  const fixtureUrl = new URL("./native-config-fixture.ts", import.meta.url);
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL === fixtureUrl.href && specifier.startsWith("../src/")) return { url: new URL(specifier.replace("../src/", "../lib/").replace(/\.ts$/u, ".js"), fixtureUrl).href, shortCircuit: true };
    return next(specifier, context);
  } });
  let nativeConfigRun: typeof import("./native-config-fixture.ts")["nativeConfigRun"];
  try { ({ nativeConfigRun } = await import(fixtureUrl.href)); } finally { hooks.deregister(); }
  const sdk = createRequire(await realpath(process.env.DSMM_TEST_DSH_ENTRY!));
  const { chromium } = createRequire(process.env.DSMM_TEST_PLAYWRIGHT_ENTRY!)("playwright");
  const { startProfileUiServer } = await import(new URL("../scripts/profile-ui-harness-server.mjs", import.meta.url).href);
  const { COMPOSITION_ID } = await import(new URL("../scripts/profile-ui-harness-browser.mjs", import.meta.url).href);
  const { stableCompositionBundle } = await import(new URL("../scripts/stable-native-acceptance.mjs", import.meta.url).href);
  const temporaryParent = await realpath(tmpdir());
  const owned = await realpath(await mkdtemp(join(temporaryParent, "dsmm-core-ui-")));
  const packageRoot = join(owned, "package"), sourceRoot = fileURLToPath(new URL("../src/client/", import.meta.url));
  const run = nativeConfigRun(), host = new Context();
  let releaseSave!: () => void;
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
  let server: Awaited<ReturnType<typeof startProfileUiServer>> | undefined, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const profile = await run.createProfile("core-ui", { roles: { "dsmm-orchestrator": true }, roleRouting: { "dsmm-reviewer": {
      primary: { provider: "fixture", model: "not-in-catalog", reasoningEffort: "future-exact", temperature: 0.3, opaque: { keep: [1, null, "raw"] } },
    } } });
    const root = await profile.create() as unknown as DshAgent, original = profile.runtime.admission(root);
    const connectionSdk = createRequire(sdk.resolve("@deepseek-ai/dsh-client-connection/package.json"));
    const { CredentialProvider } = connectionSdk("@deepseek-ai/dsh-credentials") as { CredentialProvider: new (ctx: Context) => Service };
    class MemoryCredentials extends CredentialProvider {
      private records = new Map<string, unknown>();
      async modifyRecord(key: string, modify: (current: unknown) => Promise<unknown>) {
        const next = await modify(this.records.get(key)); if (next !== undefined) this.records.set(key, next); return this.records.get(key);
      }
    }
    const { RemoteAccessService } = sdk("@deepseek-ai/dsh-api-remote-access");
    await host.plugin(RemoteAccessService).await();
    await host.plugin(TypertRegistry).await(); await host.plugin(TypertGatewayService, {}).await();
    await host.plugin(MemoryCredentials).await(); await host.plugin(NativeConnection).await();
    host.provide("webServer", { host: "127.0.0.1" }); host.provide("settings", { writable: true });
    await host.plugin({ name: "core-ui-config-rpc", inject: ["typert", "connection"], apply(ctx: Context) {
      new DsmmConfigHost(ctx, profile.deployment, profile.runtime.getSettings(), () => profile.runtime);
    } }).await();
    const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
    let holdSave = true;
    const invoke = async (method: string, args: Record<string, unknown>) => {
      calls.push({ method, args });
      if (method === "save" && holdSave) { holdSave = false; await saveGate; }
      try { return { ok: true, value: await host.typertGateway.invoke({ namespace: "dsmmConfig", method, args, peer: host.connection.browserPeer }) }; }
      catch (error) { const failure = remoteErrorOf(error); if (failure === undefined) throw error; return { ok: false, error: { code: failure.code, message: failure.message, details: failure.details } }; }
    };
    await mkdir(join(packageRoot, "lib"), { recursive: true });
    const result = await build({ stdin: { sourcefile: "core-ui-surface.tsx", resolveDir: sourceRoot, loader: "tsx", contents: `
      import React,{useEffect,useState} from 'react';
      import {DeploymentPage} from './DeploymentPage.tsx';
      import {DeploymentController} from './deployment-controller.ts';
      import {deploymentEn,deploymentZh} from './deployment-locales.ts';
      import {PROFILE_STYLES} from './styles.ts';
      const remote=Object.fromEntries(['describe','describeSettings','describeModules','save'].map(method=>[method,(request)=>window.__deploymentBridge({method,args:method==='save'?{request}:{}})]));
      const core=new DeploymentController(remote,'global');
      let formState={status:'loading'},listeners=new Set();
      const shared={getSnapshot:()=>formState,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},mutate:async(ops,revision)=>{
        const result=await window.__deploymentBridge({method:'nativeSave',args:{ops,revision}});
        if(!result.ok)return false;await refreshForm();return true;
      }};
      const forms={get:()=>shared};
      async function refreshForm(){const result=await remote.describeSettings();if(result.ok){const s=result.value;
        formState={status:'ready',writable:true,revision:s.nativeFormRevision,value:s.profile,base:s.nativeForm.base,user:s.nativeForm.user};
        listeners.forEach(listener=>listener());}}
      function Surface(){const [locale,setLocale]=useState('en');useEffect(()=>{void refreshForm()},[]);
        const copy=locale==='zh'?deploymentZh:deploymentEn;
        return <><button onClick={()=>setLocale(locale==='en'?'zh':'en')}>EN / 中文</button><DeploymentPage view="page" core={core} remote={remote} forms={forms} profilePage t={key=>copy[key]}/></>;
      }
      export const inject=['slots'];
      export function apply(ctx){ctx.effect(()=>{const style=document.createElement('style');style.textContent=PROFILE_STYLES;document.head.append(style);return()=>style.remove()});
        ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'dsmm-profiles'},Surface));}
    ` }, bundle: true, write: false, platform: "browser", format: "cjs", target: "es2022", external: ["react", "react/jsx-runtime", "@deepseek-ai/dsh-client-ui-primitives"],
      banner: { js: 'window.__ModuleLoader__.load({id:"@dsmm/dsmm",factory:(require)=>{const module={exports:{}};const exports=module.exports;' }, footer: { js: "return module.exports;}});" } });
    await writeFile(join(packageRoot, "lib", "client.js"), result.outputFiles![0]!.text);
    server = await startProfileUiServer({ nativeRequire: sdk, packageRoot, sha256: "owned-core-source-fixture", composition: stableCompositionBundle(COMPOSITION_ID) });
    browser = await chromium.launch({ executablePath: chromium.executablePath(), headless: true, args: ["--disable-extensions", "--disable-sync"] });
    const context = await browser.newContext({ viewport: { width: 768, height: 900 }, serviceWorkers: "block" });
    assert.deepEqual(await context.cookies(), []);
    await context.tracing.start({ screenshots: true, snapshots: true });
    await context.route("**/*", (route: { request(): { url(): string }; abort(): Promise<void>; continue(): Promise<void> }) => new URL(route.request().url()).origin === server!.origin ? route.continue() : route.abort());
    const page = await context.newPage(), errors: string[] = [];
    page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.exposeBinding("__dsmmNativeBridge", () => ({ ok: false, error: { code: "gateway/unavailable", message: "Unavailable", details: {} } }));
    await page.exposeBinding("__deploymentBridge", async (source: { page: unknown; frame: { url(): string } }, input: { method: string; args: Record<string, unknown> }) => {
      assert.equal(source.page, page); assert.equal(new URL(source.frame.url()).origin, server!.origin);
      if (input.method !== "nativeSave") return invoke(input.method, input.args);
      await profile.settings.mutate(profile.descriptor().ns, input.args.ops as Parameters<typeof profile.settings.mutate>[1], input.args.revision as number);
      return { ok: true };
    });
    await page.goto(server.origin);
    const global = page.locator('[data-dsmm-layer="global"]'), native = page.locator('[data-dsmm-layer="profile"]');
    await global.locator("summary").first().click();
    await global.getByText("Core", { exact: true }).click();
    await global.locator("summary").filter({ hasText: "Model parameters" }).click();
    const globalField = global.getByRole("combobox", { name: /modelParameters.passthrough/u });
    await globalField.waitFor(); assert.equal(await globalField.inputValue(), "inherit");
    assert.equal(await globalField.locator('option[value="inherit"]').textContent(), "Inherit · On");
    await globalField.selectOption("false");
    await global.getByRole("button", { name: "Save Global config", exact: true }).click();
    assert.equal(await globalField.isDisabled(), true);
    assert.equal(await global.getByRole("button", { name: "Saving…", exact: true }).isDisabled(), true);
    releaseSave();
    await page.waitForFunction(() => document.querySelector('[data-dsmm-layer="global"] [role="status"]')?.textContent === "Saved");
    assert.deepEqual((await profile.deployment.readGlobal()).config, { modelParameters: { passthrough: false } });
    assert.deepEqual(calls.find(call => call.method === "save")?.args, { request: { expectedRevision: "absent", edits: [{ op: "set", path: ["modelParameters"], value: { passthrough: false } }] } });
    assert.deepEqual(JSON.parse(await readFile(join(run.home, "plugins", "dsmm", "config.json"), "utf8")), { modelParameters: { passthrough: false } });
    assert.equal(profile.runtime.admission(root), original);

    await native.locator("summary").first().click(); await native.getByText("Core", { exact: true }).click();
    await native.locator("summary").filter({ hasText: "Model parameters" }).click();
    const nativeField = native.getByRole("combobox", { name: /modelParameters.passthrough/u });
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLSelectElement>('[data-dsmm-layer="profile"] select')].some(select => !select.disabled));
    assert.equal(await nativeField.locator('option[value="inherit"]').textContent(), "Inherit · Off");
    await nativeField.selectOption("true"); await native.getByRole("button", { name: "Save profile overrides", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-dsmm-layer="profile"] [role="status"]')?.textContent === "Saved");
    assert.equal(profile.persistedConfig().modelParameters?.passthrough, true);
    const routes = profile.persistedConfig().roleRouting;
    assert.deepEqual(routes?.["dsmm-reviewer"]?.primary, { provider: "fixture", model: "not-in-catalog", reasoningEffort: "future-exact", temperature: 0.3, opaque: { keep: [1, null, "raw"] } });
    await nativeField.selectOption("inherit"); await native.getByRole("button", { name: "Save profile overrides", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-dsmm-layer="profile"] [role="status"]')?.textContent === "Saved");
    assert.equal(profile.persistedConfig().modelParameters?.passthrough, undefined);
    assert.equal((await profile.deployment.readDesired()).settings.modelParameters.passthrough, false);
    assert.deepEqual(profile.persistedConfig().roleRouting, routes);

    await native.locator("summary").filter({ hasText: "Existing-provider routes" }).click();
    const raw = native.getByRole("textbox", { name: /Existing-provider routes/u });
    const edited = { "dsmm-reviewer": { primary: { provider: "fixture", model: "not-in-catalog", reasoning_effort: "raw-future-exact", temperature: 0.4, maxTokens: 123, stop: ["END"], opaque: { keep: [1, null, "edited-while-off"] } } } };
    await raw.fill(JSON.stringify(edited, null, 2));
    await native.getByRole("button", { name: "Save profile overrides", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-dsmm-layer="profile"] [role="status"]')?.textContent === "Saved");
    assert.deepEqual(profile.persistedConfig().roleRouting, edited);
    assert.equal((await profile.deployment.readDesired()).settings.modelParameters.passthrough, false);

    await global.locator("summary").filter({ hasText: "Permission-control module" }).click();
    const globalPermission = global.getByRole("combobox", { name: /permissionControl.enabled/u });
    await globalPermission.selectOption("false"); await global.getByRole("button", { name: "Save Global config", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-dsmm-layer="global"] [role="status"]')?.textContent === "Saved");
    assert.equal((await profile.deployment.readGlobal()).config.permissionControl?.enabled, false);
    assert.equal((await profile.deployment.readGlobal()).config.modelParameters?.passthrough, false);
    await native.locator("summary").filter({ hasText: "Permission-control module" }).click();
    const nativePermission = native.getByRole("combobox", { name: /permissionControl.enabled/u });
    await nativePermission.selectOption("true"); await native.getByRole("button", { name: "Save profile overrides", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-dsmm-layer="profile"] [role="status"]')?.textContent === "Saved");
    assert.equal(profile.persistedConfig().permissionControl?.enabled, true);
    await nativePermission.selectOption("inherit"); await native.getByRole("button", { name: "Save profile overrides", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-dsmm-layer="profile"] [role="status"]')?.textContent === "Saved");
    assert.equal(profile.persistedConfig().permissionControl?.enabled, undefined);
    assert.equal((await profile.deployment.readDesired()).settings.permissionControl.enabled, false);
    assert.deepEqual(profile.persistedConfig().roleRouting, edited);

    assert.equal(profile.runtime.admission(root), original);
    profile.assertLive();

    const inspector = page.locator('[data-dsmm-page] > details').last();
    await inspector.locator("summary").first().click();
    const parameterState = inspector.locator("dl").filter({ hasText: "modelParameters.passthrough" });
    assert.equal(await parameterState.count(), 1);
    const states = await parameterState.locator("dd").allTextContents();
    assert.ok(states[1].includes("Off")); assert.ok(states[2].includes("On")); assert.ok(states[4].includes("Unknown"));
    await inspector.locator("summary").first().click();

    await globalField.focus(); await globalField.press("Shift+Tab"); await page.keyboard.press("Tab");
    assert.equal(await globalField.evaluate((element: HTMLSelectElement) => element.matches(":focus-visible") && parseFloat(getComputedStyle(element).outlineWidth) >= 2), true);
    await globalField.press("ArrowUp"); assert.equal(await globalField.inputValue(), "true");
    await globalField.press("ArrowDown"); assert.equal(await globalField.inputValue(), "false");
    const evidence = process.env.DSMM_UI_EVIDENCE_DIR ?? owned;
    for (const locale of ["en", "zh"]) {
      if (locale === "zh") await page.getByRole("button", { name: "EN / 中文", exact: true }).click();
      for (const dark of [false, true]) {
        await page.evaluate((value: boolean) => { document.body.toggleAttribute("data-ds-dark-theme", value); }, dark);
        await globalField.focus(); await globalField.press("Shift+Tab"); await page.keyboard.press("Tab");
        const contrast = await globalField.evaluate((element: HTMLSelectElement) => {
          const rgb = (value: string) => value.match(/[\d.]+/gu)!.map(Number);
          let ancestor: Element | null = element.parentElement, background: number[] | undefined;
          while (ancestor !== null) {
            const color = rgb(getComputedStyle(ancestor).backgroundColor);
            if (color.length === 3 || color[3] === 1) { background = color; break; }
            ancestor = ancestor.parentElement;
          }
          if (background === undefined) throw new Error("No opaque rendered surface for contrast measurement");
          const luminance = (color: number[]) => color.slice(0, 3).map(channel => { const s = channel / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
          const ratio = (foreground: string, surface: number[]) => { const a = luminance(rgb(foreground)), b = luminance(surface); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
          const hint = document.getElementById(element.getAttribute("aria-describedby")!)!, control = getComputedStyle(element);
          return { hint: ratio(getComputedStyle(hint).color, background), text: ratio(control.color, rgb(control.backgroundColor)), boundary: ratio(control.borderTopColor, background), focus: ratio(control.outlineColor, background), fontSize: getComputedStyle(hint).fontSize };
        });
        assert.ok(contrast.hint >= 4.5 && contrast.text >= 4.5 && contrast.boundary >= 3 && contrast.focus >= 3, JSON.stringify(contrast));
        t.diagnostic(`${locale}/${dark ? "dark" : "light"} rendered contrast: ${JSON.stringify(contrast)}`);
        for (const width of [375, 768, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${locale}/${dark}/${width} reflow`);
          const screenshot = join(evidence, `${locale}-${dark ? "dark" : "light"}-${width}.png`);
          await page.screenshot({ path: screenshot, fullPage: true });
        }
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.setViewportSize({ width: 375, height: 900 });
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: join(evidence, "zh-dark-375-reduced-zoom200.png"), fullPage: true });
    await page.evaluate(() => { document.documentElement.style.zoom = ""; });
    await page.getByRole("button", { name: "EN / 中文", exact: true }).click();
    await globalField.selectOption("true");
    const baseline = await profile.deployment.readGlobal();
    await profile.deployment.saveGlobal({ expectedRevision: baseline.revision, edits: [{ op: "set", path: ["workflow", "reviewCap"], value: 2 }] }, () => {});
    const savesBefore = calls.filter(call => call.method === "save").length;
    await global.getByRole("button", { name: "Save Global config", exact: true }).click();
    await global.getByRole("alert").waitFor(); assert.equal(await globalField.inputValue(), "true");
    assert.equal(calls.filter(call => call.method === "save").length, savesBefore);
    await global.getByRole("button", { name: "Discard and reload", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-dsmm-layer="global"]')?.getAttribute("aria-busy") === "false");
    assert.equal(await globalField.inputValue(), "false");
    await context.tracing.stop({ path: join(evidence, "core-ui-trace.zip") });
    await context.close(); assert.deepEqual(errors, []); assert.deepEqual(server.errors, []);
    t.diagnostic(`Native gateway Global Save + durable native SettingsForms On/inherit/raw JSON Save; old admission retained; busy, keyboard focus/select, conflict/discard and reduced-motion covered. EN/ZH light/dark at 375/768/1280 without horizontal overflow. Screenshots/trace: ${process.env.DSMM_UI_EVIDENCE_DIR ?? "temporary (removed at cleanup)"}; no Lighthouse audit performed.`);
  } finally {
    releaseSave();
    await browser?.close(); await server?.close(); await host.fiber.dispose(); await run.dispose();
    if (await realpath(owned) !== owned || dirname(owned) !== temporaryParent || !basename(owned).startsWith("dsmm-core-ui-")) throw new Error("Unexpected Core UI cleanup path");
    await rm(owned, { recursive: true, force: false });
  }
});
