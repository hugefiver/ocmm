import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { en } from "../src/client/locales.ts";

const available = process.env.DSMM_TEST_DSH_ENTRY !== undefined && process.env.DSMM_TEST_PLAYWRIGHT_ENTRY !== undefined;

test("native Menu and cold blank continuation controls retain committed choice and explicit confirmation in a real browser", {
  skip: !available && "requires explicit DSH and Playwright anchors", timeout: 60_000,
}, async t => {
  const sdk = createRequire(await realpath(process.env.DSMM_TEST_DSH_ENTRY!));
  const { chromium } = createRequire(process.env.DSMM_TEST_PLAYWRIGHT_ENTRY!)("playwright");
  const { startProfileUiServer } = await import(new URL("../scripts/profile-ui-harness-server.mjs", import.meta.url).href);
  const { COMPOSITION_ID, nativeClientPreflight } = await import(new URL("../scripts/profile-ui-harness-browser.mjs", import.meta.url).href);
  const { stableCompositionBundle } = await import(new URL("../scripts/stable-native-acceptance.mjs", import.meta.url).href);
  const parent = await realpath(tmpdir()), owned = await realpath(await mkdtemp(join(parent, "dsmm-session-controls-ui-")));
  const { nativeBlankHistory } = await import(new URL("./client-history-native-fixture.mjs", import.meta.url).href);
  const nativeHistory = await nativeBlankHistory(), liveId = await nativeHistory.createBlank();
  let releaseConfirm!: () => void;
  const confirmGate = new Promise<void>(resolve => { releaseConfirm = resolve; });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined, server: Awaited<ReturnType<typeof startProfileUiServer>> | undefined;
  try {
    await mkdir(join(owned, "lib"));
    // Native React, Menu, Button, renderer and theme; synthetic profile replies.
    // History uses native persisted pending input and the real Host continuation service.
    // No fake composer, attachment store, workspace creation or prompt admission.
    const result = await build({ stdin: { sourcefile: "session-controls.tsx", resolveDir: fileURLToPath(new URL("../src/client/", import.meta.url)), loader: "tsx", contents: `
      import React,{useState,useSyncExternalStore} from 'react';
      import {SessionProfiles} from './SessionProfiles.tsx';
      import {ProfilesController} from './controller.ts';
      import {HistoryContinuationEntry} from './history-entry.tsx';
      import {HistoryContinuationController} from './history-controller.ts';
      import {PROFILE_STYLES} from './styles.ts';
      import {en,zh} from './locales.ts';
      const revision='a'.repeat(64), committed='b'.repeat(64), calls=[];
      const baseline={selectedId:null,appliedRevision:null,selectionRevision:'absent'};
      let selection=baseline;
      const session=()=>({sessionId:${JSON.stringify(liveId)},globalDefault:baseline,selection,admittedSelection:selection,scope:selection.selectedId===null?'global-default':'session-override',
        admissionEpoch:'fixture-epoch',switchAllowed:false,canApplyOverlay:true,canToggleMode:false,canSelectModel:false});
      const ok=value=>({ok:true,value});
      const profiles=new ProfilesController({describe:async()=>ok({profiles:[{id:'p',label:'QA session profile',revision}],...baseline}),
        read:async()=>ok({id:'p',revision,content:JSON.stringify({version:1,id:'p',label:'QA session profile',settings:{workflow:{reviewCap:2}}})}),
        describeSession:async()=>ok(session()),selectSession:async(id,request)=>{calls.push(request);selection={selectedId:request.id,appliedRevision:request.expectedRevision??null,selectionRevision:committed,...request.id===null?{}:{sourceRevision:request.expectedRevision}};return ok(session())},
        select:async()=>{throw Error('Future-default mutation is not part of this flow')},save:async()=>{throw Error('Document editing is not part of this flow')}});
      let nativeLocale, confirmations=0;
      const history=new HistoryContinuationController();
      const historyRemote=Object.fromEntries(['describe','choices','preview','confirm'].map(method=>[method,async(sessionId,request)=>{
        if(method==='confirm')confirmations++;return window.__historyBridge({method,args:{sessionId,request}})}]));
      window.__sessionControls={profiles,history,calls,get confirmations(){return confirmations},completeHistory:()=>window.__completeHistory()};
      function Surface(){const [locale,setLocale]=useState('en'),[historyId,setHistoryId]=useState(null);
        const copy=locale==='zh'?zh:en;
        const t=(key,args)=>copy[key].replace(/\\{([^}]+)\\}/g,(raw,name)=>args?.[name]??raw);
        const useProfiles=selector=>useSyncExternalStore(profiles.store.subscribe,()=>selector(profiles.store.getSnapshot()));
        return <><p>Component fixture: native cold/live sessions and Host continuation; synthetic profile replies; no native composer.</p>
          <button onClick={()=>{const next=locale==='en'?'zh':'en';setLocale(next);nativeLocale.setLocale(next)}}>EN / 中文</button>
          <button onClick={()=>profiles.setSession(${JSON.stringify(liveId)})}>Bind live blank</button>
          <button onClick={()=>{history.bind(historyRemote,{},${JSON.stringify(nativeHistory.id)});setHistoryId(${JSON.stringify(nativeHistory.id)})}}>Show cold blank</button>
          <button onClick={()=>{history.bind(historyRemote,{},${JSON.stringify(liveId)});setHistoryId(${JSON.stringify(liveId)})}}>Show live blank</button>
          <SessionProfiles {...profiles.actions} useProfiles={useProfiles} readProfileView={profiles.store.getSnapshot} t={t}/>
          {historyId&&<HistoryContinuationEntry controller={history} sessionId={historyId} locale={nativeLocale}/>}</>;
      }
      export const inject=['slots','locale'];export function apply(ctx){nativeLocale=ctx.locale;void profiles.refresh();
        ctx.effect(()=>()=>{profiles.dispose();history.dispose()});
        ctx.effect(()=>{const style=document.createElement('style');style.textContent=PROFILE_STYLES;document.head.append(style);return()=>style.remove()});
        ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'dsmm-profiles'},Surface));}
    ` }, bundle: true, write: false, platform: "browser", format: "cjs", target: "es2022", external: ["react", "react/jsx-runtime", "@deepseek-ai/dsh-client-ui-primitives"],
      banner: { js: 'window.__ModuleLoader__.load({id:"@dsmm/dsmm",factory:(require)=>{const module={exports:{}};const exports=module.exports;' }, footer: { js: "return module.exports;}});" } });
    await writeFile(join(owned, "lib", "client.js"), result.outputFiles![0]!.text);
    server = await startProfileUiServer({ nativeRequire: sdk, packageRoot: owned, sha256: "owned-session-controls-fixture", composition: stableCompositionBundle(COMPOSITION_ID) });
    browser = await chromium.launch({ executablePath: process.env.DSMM_TEST_BROWSER_EXECUTABLE ?? chromium.executablePath(), headless: true, args: ["--disable-extensions", "--disable-sync"] });
    const context = await browser.newContext({ viewport: { width: 375, height: 900 }, serviceWorkers: "block" });
    assert.deepEqual(await context.cookies(), []);
    await context.route("**/*", (route: { request(): { url(): string }; abort(): Promise<void>; continue(): Promise<void> }) => new URL(route.request().url()).origin === server!.origin ? route.continue() : route.abort());
    const page = await context.newPage(), errors: string[] = [];
    page.setDefaultTimeout(5000);
    page.on("pageerror", (error: Error) => errors.push(error.message));
    page.on("console", (message: { type(): string; text(): string }) => { if (message.type() === "error") t.diagnostic(message.text()); });
    await page.exposeBinding("__dsmmNativeBridge", () => ({ ok: false, error: { code: "gateway/unavailable", message: "Fixture has no execution Host", details: {} } }));
    await page.exposeBinding("__historyBridge", async (source: { page: unknown; frame: { url(): string } }, input: { method: string; args: Record<string, unknown> }) => {
      assert.equal(source.page, page); assert.equal(new URL(source.frame.url()).origin, server!.origin);
      if (input.method === "confirm") await confirmGate;
      return nativeHistory.invoke(`dsmmHistory/${input.method}`, input.args);
    });
    await page.exposeBinding("__completeHistory", () => releaseConfirm());
    await page.goto(server.origin);
    const trigger = page.locator("[data-dsmm-header-profile] button");
    await trigger.waitFor().catch(async (error: Error) => { throw new Error(`${error.message}; page errors=${JSON.stringify(errors)}; native=${JSON.stringify(await page.evaluate(nativeClientPreflight))}`); });
    await trigger.click();
    assert.equal(await page.getByRole("menuitem", { name: "QA session profile", exact: true }).isDisabled(), true);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Bind live blank", exact: true }).click();
    await page.waitForFunction(() => window.__sessionControls.profiles.store.getSnapshot().session !== null);
    await trigger.click(); await page.getByRole("menuitem", { name: "QA session profile", exact: true }).click();
    await page.waitForFunction(() => window.__sessionControls.profiles.store.getSnapshot().session?.admittedSelection?.selectedId === "p");
    await trigger.click();
    await page.getByText(en.headerCurrentProfile.replace("{profile}", "QA session profile"), { exact: true }).waitFor();
    assert.equal(await page.getByRole("menuitem", { name: "QA session profile", exact: true }).locator("svg").count(), 1);
    assert.equal(await page.getByRole("menuitem", { name: en.sessionBaseline, exact: true }).locator("svg").count(), 0);
    const evidence = process.env.DSMM_UI_EVIDENCE_DIR ?? owned;
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: join(evidence, `profile-menu-${width}.png`), fullPage: true });
    }
    await page.getByRole("menuitem", { name: en.sessionBaseline, exact: true }).click();
    await page.waitForFunction(() => window.__sessionControls.profiles.store.getSnapshot().session?.admittedSelection?.selectedId === null);
    await trigger.click();
    assert.equal(await page.getByRole("menuitem", { name: en.sessionBaseline, exact: true }).locator("svg").count(), 1);
    assert.equal(await page.getByRole("menuitem", { name: "QA session profile", exact: true }).locator("svg").count(), 0);
    await page.keyboard.press("Escape");
    assert.deepEqual(await page.evaluate(() => window.__sessionControls.calls.map(row => row.id)), ["p", null]);
    await page.getByRole("button", { name: "Show live blank", exact: true }).click();
    await page.waitForFunction(() => window.__sessionControls.history.getSnapshot().status?.execution === "active");
    assert.equal(await page.locator("[data-dsmm-history-continuation]").count(), 0);
    await page.getByRole("button", { name: "Show cold blank", exact: true }).click();
    const history = page.locator("[data-dsmm-history-continuation]");
    await history.getByLabel("Current agent preset", { exact: true }).selectOption("current");
    await history.getByRole("button", { name: "Review continuation", exact: true }).click();
    assert.ok((await history.getByRole("textbox", { name: "Next step", exact: true }).inputValue()).includes("pending historical input"));
    await page.getByRole("button", { name: "EN / 中文", exact: true }).click();
    await history.getByRole("heading", { name: "继续此会话", exact: true }).waitFor();
    await page.getByRole("button", { name: "EN / 中文", exact: true }).click();
    const confirm = history.getByRole("button", { name: "Continue this session", exact: true });
    await confirm.waitFor(); assert.equal(await confirm.isDisabled(), true);
    await history.getByRole("checkbox", { name: "Process the pending inputs shown above", exact: true }).check();
    await confirm.click(); assert.equal(await confirm.isDisabled(), true);
    assert.equal(await page.evaluate(() => window.__sessionControls.confirmations), 1);
    await page.screenshot({ path: join(evidence, "history-confirming.png"), fullPage: true });
    await page.evaluate(() => window.__sessionControls.completeHistory());
    await page.waitForFunction(() => window.__sessionControls.history.getSnapshot().status?.execution === "active");
    assert.equal(await history.count(), 0);
    assert.equal(await confirm.count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(server.errors, []);
    await context.close();
    t.diagnostic("Real native Menu/React/theme: sessionless disabled, live blank choice p→baseline with committed checkmark and 375/768/1280 reflow. Native cold persisted title/inbox reviewed through Host continuation; explicit consent, one confirm, active panel hidden, live EN/ZH. Profile replies and current policy/model provider are test-owned; no native composer or draft/attachment/prompt claim.");
  } finally {
    releaseConfirm();
    try { await browser?.close(); } finally { await server?.close(); await nativeHistory.close(); }
    if (await realpath(owned) !== owned || dirname(owned) !== parent || !basename(owned).startsWith("dsmm-session-controls-ui-")) throw new Error("Unexpected component fixture cleanup path");
    await rm(owned, { recursive: true, force: false });
  }
});

declare global {
  interface Window {
    __sessionControls: {
      profiles: import("../src/client/controller.js").ProfilesController;
      history: import("../src/client/history-controller.js").HistoryContinuationController;
      calls: Array<{ id: string | null }>;
      confirmations: number;
      completeHistory(): void;
    };
  }
}
