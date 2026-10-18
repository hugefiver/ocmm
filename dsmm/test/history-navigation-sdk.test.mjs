import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Context } from '@deepseek-ai/cordis';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { SessionId } from '@deepseek-ai/dsh-session';
import { SubagentRuntime } from '@deepseek-ai/dsh-subagent';
import WorkingDirectory from '@deepseek-ai/dsh-working-directory';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import { clientFixture } from './history-client-sdk.test.mjs';
import { inspect } from './session-activation-fixture.mjs';

const require = createRequire(import.meta.url);
const web = createRequire(require.resolve('@deepseek-ai/dsh-web-app/package.json'));
const sdk = process.env.DSMM_HISTORY_WORKSPACE_SDK_DIR ?? dirname(web.resolve('@deepseek-ai/dsh-client-ui-workspace/package.json'));
const turn = () => new Promise(resolve => setImmediate(resolve));

async function mount(ctx, sessions) {
  let plugin;
  vm.compileFunction(await readFile(join(sdk, 'lib/client.js'), 'utf8'), ['window'])({
    // Navigation-only harness; no primitive or conversation rendering is exercised.
    __ModuleLoader__: { load({ factory }) { plugin = factory(id => id === '@deepseek-ai/dsh-client-ui-primitives' ? {} : web(id)); } },
  });
  let navigation;
  ctx.provide('layout', {
    beginNavigation() { navigation?.abort(); navigation = new AbortController(); return navigation.signal; },
    selectPanel() {},
  });
  ctx.provide('workspaces', { list: createSnapshotStore({ phase: 'pending', items: [{ workspaceId: 'workspace', path: '/synthetic', sessionIds: [] }], archivedSessionIds: [], pinnedSessionIds: [] }) });
  if (!ctx.get('sessions')) ctx.provide('sessions', sessions);
  if (!ctx.get('remote')) ctx.provide('remote', { directoryPicker: {} });
  ctx.provide('locale', { register() { return () => {}; }, bind() { return key => key; } });
  ctx.provide('slots', { provideRoot() {}, inject() {}, registerFactory() { return () => {}; }, entries() { return []; } });
  ctx.provide('shortcuts', { register() { return () => {}; } });
  plugin.apply(ctx);
  return ctx.get('uiWorkspace');
}

async function childProvider(ctx) {
  const available = Promise.withResolvers();
  ctx.provide('resources', { register(provider) { available.resolve(provider); return () => {}; } });
  ctx.provide('sidebarRightTabs', { register() { return () => {}; } });
  const root = process.env.DSMM_HISTORY_SUBAGENT_UI_SDK_DIR ?? dirname(web.resolve('@deepseek-ai/dsh-client-ui-subagent/package.json'));
  let plugin;
  vm.compileFunction(await readFile(join(root, 'lib/client.js'), 'utf8'), ['window'])({
    __ModuleLoader__: { load({ factory }) {
      plugin = factory(id => id === '@deepseek-ai/dsh-client-ui-primitives' || id === 'react-dom' ? {} : web(id));
    } },
  });
  plugin.apply(ctx);
  return available.promise;
}

function controlled(required = true) {
  const preparations = new Map(), references = [], calls = [];
  const binding = { draft: 'owned draft', title: 'owned title' };
  const sessions = {
    historyRequired: required,
    list: createSnapshotStore({ phase: 'pending', ids: [], byId: {} }),
    async prepareHistoryConnection({ signal }) { signal.throwIfAborted(); calls.push('connection'); },
    async prepareHistoryOpen(target, { signal }) {
      const pending = Promise.withResolvers();
      preparations.set(typeof target === 'string' ? target : target.childSessionId ?? target.sessionId, pending);
      await pending.promise;
      signal.throwIfAborted();
      return Object.freeze({});
    },
    retain(target, options) {
      const ready = Promise.withResolvers();
      const reference = { sessionId: typeof target === 'string' ? target : target.childSessionId ?? target.sessionId, binding, ready: ready.promise,
        release() { this.released = true; }, released: false, complete: ready, options };
      references.push(reference);
      return reference;
    },
    binding() { return binding; },
    subagentAddress() { return undefined; },
    async create() { calls.push('create'); return 'new'; },
    async fork() { calls.push('fork'); return 'fork'; },
  };
  return { sessions, preparations, references, calls, binding };
}

test('required native main navigation waits for preparation and ready, preserving the old view on failure', { timeout: 15000 }, async () => {
  const ctx = new Context(), f = controlled();
  try {
    const ui = await mount(ctx, f.sessions);
    const previous = f.sessions.retain('old', { source: 'mainView' });
    previous.complete.resolve();
    ui.mainReference = previous;
    ui.selection.set({ sessionId: 'old' });
    const navigation = ui.replaceMain('new', new AbortController().signal, 'reveal');
    assert.equal(f.references.length, 1);
    f.preparations.get('new').resolve();
    await turn();
    assert.equal(f.references.length, 2);
    assert.equal(previous.released, false);
    assert.equal(ui.selection.getSnapshot().sessionId, 'old');
    f.references[1].complete.reject(new Error('synthetic opening failure'));
    await assert.rejects(navigation);
    assert.equal(f.references[1].released, true);
    assert.equal(previous.released, false);
    assert.equal(ui.mainReference, previous);
    assert.deepEqual(f.binding, { draft: 'owned draft', title: 'owned title' });
  } finally { await ctx.fiber.dispose(); }
});

test('required native public navigation cancels an earlier target and commits only a ready replacement', { timeout: 15000 }, async () => {
  const ctx = new Context(), f = controlled();
  try {
    const ui = await mount(ctx, f.sessions);
    assert.equal(ui.openSession('A'), undefined);
    assert.equal(ui.openSession('B'), undefined);
    f.preparations.get('A').resolve();
    f.preparations.get('B').resolve();
    await turn();
    assert.deepEqual(f.references.map(reference => reference.sessionId), ['B']);
    assert.equal(ui.selection.getSnapshot().sessionId, undefined);
    f.references[0].complete.resolve();
    await turn();
    assert.equal(ui.selection.getSnapshot().sessionId, 'B');
    assert.equal(f.references[0].released, false);
    ui.openSession('C');
    f.preparations.get('C').resolve();
    await turn();
    ui.openSession('D');
    await turn();
    assert.equal(f.references[1].released, true);
    assert.equal(f.references[0].released, false);
    assert.equal(ui.selection.getSnapshot().sessionId, 'B');
    f.preparations.get('D').resolve();
    await turn();
    f.references[2].complete.resolve();
    await turn();
    assert.equal(f.references[0].released, true);
    assert.equal(ui.selection.getSnapshot().sessionId, 'D');
  } finally { await ctx.fiber.dispose(); }
});

test('native workspace main navigation composes with the real required Session Client and readonly Host', { timeout: 15000 }, async t => {
  const f = await clientFixture(true, t.signal, true);
  try {
    const ui = await mount(f.client, f.sessions);
    const selected = Promise.withResolvers();
    const stop = ui.selection.subscribe(() => {
      if (ui.selection.getSnapshot().sessionId === f.id) selected.resolve();
    });
    try {
      assert.equal(ui.openSession(f.id), undefined);
      await selected.promise;
      assert.equal(f.sessions.retainInfo(f.id).getSnapshot().referenceCount, 1);
      assert.ok(f.calls.some(call => call.endpoint === '$historyScoped/stream' && call.payload.endpoint === 'session/followReadOnly'));
      assert.equal(f.calls.some(call => call.endpoint === 'session/follow'), false);
    } finally { stop(); }
  } finally { await f.close(); }
});

test('native nonrequired main navigation keeps synchronous selection timing', { timeout: 15000 }, async () => {
  const ctx = new Context(), f = controlled(false);
  try {
    const ui = await mount(ctx, f.sessions);
    assert.equal(ui.openSession('legacy'), undefined);
    assert.equal(ui.selection.getSnapshot().sessionId, 'legacy');
    assert.equal(f.preparations.size, 0);
  } finally { await ctx.fiber.dispose(); }
});

test('required native child resource waits for its full address preparation and cancels without retaining', { timeout: 15000 }, async () => {
  const ctx = new Context(), f = controlled(), lifetime = new AbortController();
  let stream;
  try {
    await mount(ctx, f.sessions);
    const provider = await childProvider(ctx);
    stream = provider.open('dsh-resource://subagentchat/session/child?parent=parent&mode=continuable', { signal: lifetime.signal });
    const opening = stream.next();
    await turn();
    assert.equal(f.references.length, 0);
    lifetime.abort();
    f.preparations.get('child').resolve();
    assert.equal((await opening).done, true);
    assert.equal(f.references.length, 0);
  } finally { lifetime.abort(); await stream?.return(); await ctx.fiber.dispose(); }
});

test('native child resource and main view open complete persisted child history through the required Client', { timeout: 15000 }, async t => {
  const f = await clientFixture(true, t.signal, true), lifetime = new AbortController();
  let stream;
  try {
    await f.ctx.plugin(LocalFileSystem, { cwd: f.root }).await();
    await f.ctx.plugin(WorkingDirectory, { defaultDirectory: f.root }).await();
    await f.ctx.plugin(SubagentRuntime, {}).await();
    const root = await inspect(f.ctx, f.id), id = SessionId('navigation-child');
    const child = await f.ctx.sessionPersistence.create({ ...root.header, id, origin: 'subagent', parentSession: f.id, delegationDepth: 1 });
    await child.append([...root.events, { seq: root.events.length, time: Date.now(), type: 'subagent/descriptor', data: { version: 3, provider: 'retired-provider', mode: 'continuable', label: 'Historical child' } }]);
    await child.close();
    const before = await inspect(f.ctx, id);
    const ui = await mount(f.client, f.sessions);
    const provider = await childProvider(f.client);
    stream = provider.open(`dsh-resource://subagentchat/session/${id}?parent=${encodeURIComponent(f.id)}&mode=continuable`, { signal: lifetime.signal });
    const opened = await stream.next();
    assert.equal(opened.value.ok, true);
    assert.deepEqual(opened.value.value.address, { parentSessionId: f.id, childSessionId: id, mode: 'continuable' });
    const reference = opened.value.value.reference;
    await reference.ready;
    assert.equal(reference.sessionId, id);
    assert.equal(reference.binding.session.getSnapshot().openState, 'open');
    await ui.replaceMain(opened.value.value.address, lifetime.signal, 'reveal');
    assert.equal(ui.selection.getSnapshot().sessionId, id);
    assert.deepEqual(ui.selection.getSnapshot().subagentAddress, opened.value.value.address);
    assert.ok(f.calls.some(call => call.payload?.endpoint === 'session/followReadOnly' && call.payload.payload.args.request.address.childSessionId === id));
    assert.equal(f.ctx.agents.get(id), undefined);
    assert.deepEqual(await inspect(f.ctx, id), before);
    lifetime.abort();
    await stream.return();
    assert.equal(f.sessions.retainInfo(id).getSnapshot().referenceCount, 1);
    ui.clearMain();
    assert.equal(f.sessions.retainInfo(id).getSnapshot().referenceCount, 0);
  } finally { lifetime.abort(); await stream?.return(); await f.close(); }
});

test('required native workspace creation, restoration and fork refuse before mutation when preflight fails', { timeout: 15000 }, async () => {
  const ctx = new Context(), f = controlled();
  try {
    f.sessions.prepareHistoryConnection = async () => { throw new Error('synthetic unavailable Host'); };
    const ui = await mount(ctx, f.sessions);
    await assert.rejects(ui.openWorkspace('workspace'));
    await assert.rejects(ui.restoreSelection(ctx.get('workspaces').list.getSnapshot(), f.sessions.list.getSnapshot()));
    await assert.rejects(ui.forkSession('old'));
    assert.equal(f.calls.length, 0);
    assert.equal(f.references.length, 0);
    assert.equal(f.preparations.size, 0);
  } finally { await ctx.fiber.dispose(); }
});
