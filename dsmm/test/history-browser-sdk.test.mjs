import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { TYPERT } from '@deepseek-ai/dsh-api-session-controller/typert';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { SessionId } from '@deepseek-ai/dsh-session';
import { SubagentRuntime } from '@deepseek-ai/dsh-subagent';
import WorkingDirectory from '@deepseek-ai/dsh-working-directory';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import * as Bootstrap from '@dsmm/dsmm/history-support';
import { fixture, hostController, inspect } from './session-activation-fixture.mjs';
import { startProfileUiServer } from '../scripts/profile-ui-harness-server.mjs';
import { COMPOSITION_ID, nativeClientPreflight } from '../scripts/profile-ui-harness-browser.mjs';

const require = createRequire(import.meta.url);
const web = createRequire(require.resolve('@deepseek-ai/dsh-web-app/package.json'));
const { WebServer } = await import(pathToFileURL(web.resolve('@deepseek-ai/dsh-host-webserver')));

test('an empty browser opens native required root and child history and renders a failed replacement without dropping the old view', {
  skip: !process.env.DSMM_TEST_PLAYWRIGHT_ENTRY && 'requires an explicit installed Playwright anchor', timeout: 60000,
}, async t => {
  const { chromium } = createRequire(process.env.DSMM_TEST_PLAYWRIGHT_ENTRY)('playwright');
  const parent = await realpath(tmpdir());
  const owned = await realpath(await mkdtemp(join(parent, 'dsmm-history-browser-')));
  const f = await fixture(), owner = new AbortController(), requests = new Map(), calls = [];
  let browser, server, peer;
  try {
    const controller = await hostController(f.ctx, true);
    controller.registerHistoryOpenGuard({ signal: owner.signal, assertCurrent() {} });
    await f.ctx.plugin(LocalFileSystem, { cwd: f.root }).await();
    await f.ctx.plugin(WorkingDirectory, { defaultDirectory: f.root }).await();
    await f.ctx.plugin(SubagentRuntime, {}).await();
    const root = await inspect(f.ctx, f.id), childId = SessionId('browser-history-child');
    const child = await f.ctx.sessionPersistence.create({ ...root.header, id: childId, origin: 'subagent', parentSession: f.id, delegationDepth: 1 });
    await child.append([...root.events, { seq: root.events.length, time: Date.now(), type: 'subagent/descriptor', data: { version: 3, provider: 'retired-provider', mode: 'continuable', label: 'Historical browser child' } }]);
    await child.close();
    const childBefore = await inspect(f.ctx, childId);
    f.ctx.typert.register(TYPERT);
    await f.ctx.plugin(TypertGatewayService, {}).await();
    f.ctx.effect(() => f.ctx.typertGateway.registerRemoteEvents(async function* (signal) {
      await new Promise(resolve => { if (signal.aborted) resolve(); else signal.addEventListener('abort', resolve, { once: true }); });
    }, { home: f.root }));
    await f.ctx.plugin(Bootstrap).await();
    await f.ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 }).await();
    peer = new Peer(f.ctx, { principal: { kind: 'owner' } });
    const libraries = ['@deepseek-ai/dsh-client-ui-workspace', '@deepseek-ai/dsh-client-ui-subagent'];
    await mkdir(join(owned, 'lib'));
    await writeFile(join(owned, 'lib', 'client.js'), `window.__ModuleLoader__.load({id:'@dsmm/dsmm',factory(require){
      const React=require('react'),{createSnapshotStore}=require('@deepseek-ai/dsh-client-store');
      const Workspace=require('@deepseek-ai/dsh-client-ui-workspace'),Child=require('@deepseek-ai/dsh-client-ui-subagent');
      const {Button}=require('@deepseek-ai/dsh-client-ui-primitives');
      return {inject:['sessions','slots','remote','remoteAccess','locale','resources'],async apply(ctx){
        await ctx.plugin(Workspace).await();await ctx.plugin(Child).await();
        await ctx.inject(['uiWorkspace'],ctx=>{
        let childStream,childLifetime;
        const childState=createSnapshotStore('closed');
        const ui=ctx.uiWorkspace,address={parentSessionId:${JSON.stringify(f.id)},childSessionId:${JSON.stringify(childId)},mode:'continuable'};
        window.__historyUi={ctx,ui,address,childState,requiredAtInit:ctx.sessions.historyRequired,
          async openChild(){childLifetime?.abort();childLifetime=new AbortController();childStream=ctx.resources.current.open('dsh-resource://subagentchat/session/'+address.childSessionId+'?parent='+encodeURIComponent(address.parentSessionId)+'&mode=continuable',{signal:childLifetime.signal});
            const result=await childStream.next();if(!result.value?.ok)throw Error('Native child resource did not open');await result.value.value.reference.ready;childState.set('open')},
          async closeChild(){childLifetime?.abort();await childStream?.return();childState.set('closed')}};
        ctx.effect(()=>()=>{childLifetime?.abort();void childStream?.return()});
        function Surface(){const selected=React.useSyncExternalStore(ui.selection.subscribe,ui.selection.getSnapshot);
          const list=React.useSyncExternalStore(ctx.sessions.list.subscribe,ctx.sessions.list.getSnapshot);
          const child=React.useSyncExternalStore(childState.subscribe,childState.getSnapshot);
          const [draft,setDraft]=React.useState('owned browser draft');
          return React.createElement('section',{},React.createElement('p',{},'Native navigation, Client and child resource; test-owned layout and draft field, not a Desktop shell.'),
            React.createElement(Button,{onClick:()=>ui.openSession(${JSON.stringify(f.id)})},'Open root history'),
            React.createElement(Button,{onClick:()=>window.__historyUi.openChild()},'Open child resource'),
            React.createElement(Button,{onClick:()=>ui.openSession(address)},'Open child main'),
            React.createElement(Button,{onClick:()=>window.__historyUi.closeChild()},'Close child resource'),
            React.createElement(Button,{onClick:()=>ui.openSession('browser-missing-history')},'Open missing history'),
            React.createElement('output',{'aria-label':'Selected history'},selected.sessionId??'none'),
            React.createElement('output',{'aria-label':'History title'},list.byId[selected.sessionId]?.displayTitle??''),
            React.createElement('output',{'aria-label':'Child resource'},child),
            React.createElement('textarea',{'aria-label':'Owned draft',value:draft,onChange:event=>setDraft(event.target.value)}));}
        ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'dsmm-profiles'},Surface));
        }).await();
      }};
    }});`);
    const composition = `window.__ModuleLoader__.load({id:${JSON.stringify(COMPOSITION_ID)},factory(require){
      const React=require('react'),{createSnapshotStore}=require('@deepseek-ai/dsh-client-store'),{installConnection}=require('@deepseek-ai/dsh-client-connection/client'),{LocaleRuntime}=require('@deepseek-ai/dsh-client-locale/client');
      return {inject:['slots'],apply(ctx){installConnection(ctx,{interactions:'answer',transport:{rpc:window.__dsmmOwnedCarrier,ownsHost:true}});
        const locale=new LocaleRuntime(ctx,undefined,{languages:['en'],preference:'en'});ctx.provide('locale',locale);ctx.slots.installLocale(locale);
        let navigation;
        ctx.provide('layout',{beginNavigation(){navigation?.abort();navigation=new AbortController();return navigation.signal},selectPanel(){}});
        ctx.provide('workspaces',{list:createSnapshotStore({phase:'pending',items:[],archivedSessionIds:[],pinnedSessionIds:[]})});
        ctx.provide('shortcuts',{catalog:createSnapshotStore([]),register(){return()=>{}}});
        ctx.provide('resources',{current:undefined,register(value){this.current=value;return()=>{this.current=undefined}}});
        ctx.provide('sidebarRightTabs',{register(){return()=>{}}});
        ctx.provide('sidebarRight',{openResource(){throw Error('The fixture uses the native child resource directly')}});
        ctx.slots.register({name:'root',children:{'settings.section':{kind:'list',scope:'root'},'shell.overlay':{kind:'list',scope:'root'}}},
          ({renderSlot})=>React.createElement('main',{},renderSlot('settings.section',{}, {only:'dsmm-profiles'}),renderSlot('shell.overlay',{})));
        window.__dsmmUiContext=ctx;}};
    }});`;
    server = await startProfileUiServer({ nativeRequire: web, packageRoot: owned, sha256: 'history-browser-fixture', composition, libraries,
      renderIndex: html => f.ctx.get('webServer').renderIndex(html) });
    browser = await chromium.launch({ executablePath: process.env.DSMM_TEST_BROWSER_EXECUTABLE ?? chromium.executablePath(), headless: true, args: ['--disable-extensions', '--disable-sync'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    assert.deepEqual(await context.cookies(), []);
    await context.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') t.diagnostic(message.text()); });
    await page.exposeBinding('__dsmmNativeBridge', async (source, input) => {
      assert.equal(source.page, page);
      assert.equal(new URL(source.frame.url()).origin, server.origin);
      if (input.operation === 'cancel') { requests.get(input.id)?.lifetime.abort(); return { ok: true }; }
      if (input.operation === 'next') {
        try { return { ok: true, value: await requests.get(input.id).stream.next() }; }
        catch (error) { return { ok: false, error: { code: 'fixture/cancelled', message: error.message, details: {} } }; }
      }
      const lifetime = new AbortController();
      requests.set(input.id, { lifetime });
      calls.push({ endpoint: input.endpoint, payload: input.payload });
      try {
        if (input.operation === 'call') return await f.ctx.typertGateway.dispatchRpc(input.endpoint, input.payload, lifetime.signal, peer);
        if (input.operation === 'open') {
          const stream = await f.ctx.typertGateway.wireStream.open(input.endpoint, input.payload, (async function* () {})(), peer, lifetime.signal);
          requests.get(input.id).stream = stream;
          return { ok: true };
        }
        throw new Error('Unknown owned carrier operation');
      } catch (error) { return { ok: false, error: { code: 'fixture/unavailable', message: error.message, details: {} } }; }
      finally { if (input.operation === 'call') requests.delete(input.id); }
    });
    await page.goto(server.origin);
    await page.getByRole('button', { name: 'Open root history', exact: true }).waitFor().catch(async error => {
      throw new Error(`${error.message}; page=${JSON.stringify(errors)}; native=${JSON.stringify(await page.evaluate(nativeClientPreflight))}`);
    });
    assert.equal(await page.evaluate(() => window.__historyUi.requiredAtInit), true);
    await page.getByRole('button', { name: 'Open root history', exact: true }).click();
    await page.waitForFunction(id => window.__historyUi.ui.selection.getSnapshot().sessionId === id, f.id).catch(async error => {
      throw new Error(`${error.message}; body=${await page.locator('body').innerText()}; errors=${JSON.stringify(errors)}; state=${JSON.stringify(await page.evaluate(() => ({ history: window.__historyUi.ctx.sessions.historyOpening.getSnapshot(), selection: window.__historyUi.ui.selection.getSnapshot() })))}; calls=${JSON.stringify(calls)}`);
    });
    assert.equal(await page.getByLabel('Selected history').textContent(), f.id);
    assert.deepEqual(await page.evaluate(id => window.__historyUi.ctx.sessions.binding(id).eventSource.getSnapshot().entries.map(entry => entry.event), f.id), root.events);
    await page.getByLabel('Owned draft').fill('preserve this owned draft');
    await page.getByRole('button', { name: 'Open child resource', exact: true }).click();
    await page.waitForFunction(() => window.__historyUi.childState.getSnapshot() === 'open');
    await page.getByRole('button', { name: 'Open child main', exact: true }).click();
    await page.waitForFunction(id => window.__historyUi.ui.selection.getSnapshot().sessionId === id, childId);
    assert.equal(await page.evaluate(id => window.__historyUi.ctx.sessions.retainInfo(id).getSnapshot().referenceCount, childId), 2);
    await page.getByRole('button', { name: 'Close child resource', exact: true }).click();
    await page.waitForFunction(id => window.__historyUi.ctx.sessions.retainInfo(id).getSnapshot().referenceCount === 1, childId);
    const titleBeforeFailure = await page.getByLabel('History title').textContent();
    await page.evaluate(() => window.__historyUi.ctx.sessions.handleSessionAdded({ sessionId: 'browser-missing-history', running: false, blank: false, updatedAt: 0 }));
    await page.getByRole('button', { name: 'Open missing history', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => window.__historyUi.ctx.sessions.retainInfo('browser-missing-history').getSnapshot().referenceCount), 0);
    assert.equal(await page.getByLabel('Selected history').textContent(), childId);
    assert.equal(await page.getByLabel('History title').textContent(), titleBeforeFailure);
    assert.equal(await page.getByLabel('Owned draft').inputValue(), 'preserve this owned draft');
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: join(owned, `history-${width}.png`), fullPage: true });
    }
    assert.ok(calls.some(call => call.endpoint === '$historyScoped/stream' && call.payload.endpoint === 'session/followReadOnly' && call.payload.payload.args.request.address.childSessionId === childId));
    assert.equal(calls.some(call => call.endpoint === 'session/follow' || call.payload?.endpoint === 'session/follow'), false);
    assert.equal(f.ctx.agents.get(f.id), undefined);
    assert.equal(f.ctx.agents.get(childId), undefined);
    assert.deepEqual(await inspect(f.ctx, f.id), root);
    assert.deepEqual(await inspect(f.ctx, childId), childBefore);
    assert.deepEqual(errors, []);
    assert.deepEqual(server.errors, []);
    await context.close();
    t.diagnostic('Real empty Chromium: native bootstrap/ModuleLoader/Renderer, required Client, workspace navigation, child resource and failure Toast. Test-owned layout, controls and draft; logical binding carrier, not Desktop IPC or WebSocket retry coverage.');
  } finally {
    owner.abort();
    for (const request of requests.values()) request.lifetime.abort();
    await browser?.close();
    await server?.close();
    await Promise.allSettled([...requests.values()].map(request => request.stream?.return()));
    await peer?.dispose();
    await f.close();
    if (await realpath(owned) !== owned || dirname(owned) !== parent || !basename(owned).startsWith('dsmm-history-browser-')) throw new Error('Unexpected owned browser cleanup path');
    await rm(owned, { recursive: true });
  }
});
