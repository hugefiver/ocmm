import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import * as RemoteClient from '@deepseek-ai/dsh-api-gateway/client';
import { TYPERT } from '@deepseek-ai/dsh-api-session-controller/typert';
import TYPERT_REMOTE from '@deepseek-ai/dsh-api-session-controller/remote';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { installConnection } from '@deepseek-ai/dsh-client-connection/client';
import { fixture, hostController, inspect } from './session-activation-fixture.mjs';

const require = createRequire(import.meta.url);
const sdk = dirname(require.resolve('@deepseek-ai/dsh-api-session-controller/package.json'));
const { ClientSessions } = await import(pathToFileURL(join(sdk, 'lib/types/client/sessions/service.js')));
const { createScope } = await import(pathToFileURL(join(sdk, 'lib/types/client/scope.js')));

export async function clientFixture(required = true, signal, compiled = false) {
  const f = await fixture(), client = new Context(), owner = new AbortController();
  let peer, pause;
  const calls = [];
  try {
    const controller = await hostController(f.ctx, required);
    controller.registerHistoryOpenGuard({ signal: owner.signal, assertCurrent() {} });
    f.ctx.typert.register(TYPERT);
    await f.ctx.plugin(TypertGatewayService, {}).await();
    f.ctx.effect(() => f.ctx.typertGateway.registerRemoteEvents(async function* (lifetime) {
      await new Promise(resolve => {
        if (lifetime.aborted) resolve();
        else lifetime.addEventListener('abort', resolve, { once: true });
      });
    }, { home: '/synthetic-history-client' }));
    peer = new Peer(f.ctx, { principal: { kind: 'owner' } });
    await client.plugin(TypertRegistry).await();
    installConnection(client, { interactions: 'answer', transport: { ownsHost: true, rpc: {
      async call(_channel, endpoint, payload, signal) {
        calls.push({ endpoint, payload });
        if (pause && endpoint === '$historyScoped/support') {
          const current = pause;
          current.reached.resolve();
          await current.proceed.promise;
        }
        return f.ctx.typertGateway.dispatchRpc(endpoint, payload, signal, peer);
      },
      async *open(_channel, endpoint, payload, signal, uplink) {
        calls.push({ endpoint, payload });
        yield* await f.ctx.typertGateway.wireStream.open(endpoint, payload,
          uplink ?? (async function* () {})(), peer, signal);
      },
    } } });
    const connection = client.get('connection');
    const connected = Promise.withResolvers();
    const cancelled = () => connected.reject(signal.reason);
    signal?.addEventListener('abort', cancelled, { once: true });
    const stopListening = connection.generation.subscribe(() => {
      if (connection.generation.getSnapshot()) connected.resolve();
    });
    await client.plugin(RemoteClient, { historyRequired: required }).await();
    try { await connected.promise; }
    finally { stopListening(); signal?.removeEventListener('abort', cancelled); }
    await client.remote.$mount(TYPERT_REMOTE);
    let sessions;
    if (compiled) {
      let nativeClient;
      vm.compileFunction(await readFile(join(sdk, 'lib/client.js'), 'utf8'), ['window'])({
        __ModuleLoader__: { load({ factory }) { nativeClient = factory(require); } },
      });
      nativeClient.apply(client);
      sessions = client.sessions;
    } else sessions = new ClientSessions(client, client.remote);
    sessions.handleSessionAdded({ sessionId: f.id, running: false, blank: false, updatedAt: 0 });
    return { ...f, client, owner, sessions, controller, calls, connection,
      pauseProbe() { pause = { reached: Promise.withResolvers(), proceed: Promise.withResolvers() }; return pause; },
      async close() { pause?.proceed.resolve(); owner.abort(); await client.fiber.dispose(); await peer.dispose(); await f.close(); } };
  } catch (error) {
    owner.abort(); await client.fiber.dispose(); await peer?.dispose(); await f.close(); throw error;
  }
}

test('required native retain rejects before creating scopes and accepts only exact prepared address leases', { timeout: 15000 }, async t => {
  const f = await clientFixture(true, t.signal);
  try {
    const initialCalls = f.calls.length;
    assert.equal(typeof f.sessions.prepareHistoryOpen, 'function');
    assert.throws(() => f.sessions.retain(f.id, { source: 'mainView' }));
    assert.throws(() => f.sessions.retainAgentScope(f.id));
    assert.throws(() => createScope(f.client, f.id));
    assert.equal(f.sessions.retainInfo(f.id).getSnapshot().referenceCount, 0);
    assert.equal(f.calls.length, initialCalls);
    const before = await inspect(f.ctx, f.id);
    const lease = await f.sessions.prepareHistoryOpen(f.id);
    assert.throws(() => f.sessions.retain(f.id, { source: 'mainView', history: { ...lease } }));
    assert.throws(() => f.sessions.retain({ parentSessionId: f.id, childSessionId: f.id, mode: 'delegated' },
      { source: 'sidebarChat', history: lease }));
    const reference = f.sessions.retain(f.id, { source: 'mainView', history: lease });
    await reference.ready;
    assert.equal(reference.binding.session.getSnapshot().openState, 'open');
    assert.ok(f.calls.some(call => call.payload?.endpoint === 'session/followReadOnly'));
    assert.ok(!f.calls.some(call => call.endpoint === 'session/follow' || call.payload?.endpoint === 'session/follow'));
    assert.deepEqual(await inspect(f.ctx, f.id), before);
    reference.release();
  } finally { await f.close(); }
});

test('a cancelled native preparation cannot reopen a replaced generation or cancel another waiter', { timeout: 15000 }, async t => {
  const f = await clientFixture(true, t.signal);
  try {
    const pause = f.pauseProbe(), cancelled = new AbortController();
    const first = f.sessions.prepareHistoryOpen(f.id, { signal: cancelled.signal });
    const rejected = assert.rejects(first);
    await pause.reached.promise;
    const second = f.sessions.prepareHistoryOpen(f.id);
    cancelled.abort();
    await rejected;
    pause.proceed.resolve();
    const lease = await second;
    f.connection.reconnect();
    assert.throws(() => f.sessions.retain(f.id, { source: 'mainView', history: lease }));
    assert.equal(f.sessions.retainInfo(f.id).getSnapshot().referenceCount, 0);
  } finally { await f.close(); }
});

test('native using waits before retention and read-only resync refreshes a changed Host guard', { timeout: 15000 }, async t => {
  const f = await clientFixture(true, t.signal);
  try {
    const pause = f.pauseProbe();
    const operation = f.sessions.using(f.id, { source: 'workspaceOperation' }, async reference => {
      assert.equal(f.sessions.retainInfo(f.id).getSnapshot().referenceCount, 1);
      const oldLease = await f.sessions.prepareHistoryOpen(f.id);
      const previous = f.controller.historyOpenSupport();
      const nextOwner = new AbortController();
      const release = f.controller.registerHistoryOpenGuard({ signal: nextOwner.signal, assertCurrent() {} });
      try {
        await reference.binding.session.resync();
        assert.throws(() => f.sessions.retain(f.id, { source: 'mainView', history: oldLease }));
        const openings = f.calls.filter(call => call.payload?.endpoint === 'session/followReadOnly');
        assert.ok(openings.length >= 2);
        assert.notEqual(openings.at(-1).payload.payload.args.request.history.guard, previous.guard);
        return 'completed';
      } finally { release(); nextOwner.abort(); }
    });
    await pause.reached.promise;
    assert.equal(f.sessions.retainInfo(f.id).getSnapshot().referenceCount, 0);
    pause.proceed.resolve();
    assert.equal(await operation, 'completed');
    assert.equal(f.sessions.retainInfo(f.id).getSnapshot().referenceCount, 0);
  } finally { await f.close(); }
});

test('non-required native retain remains synchronous and opens the original ordinary follow', { timeout: 15000 }, async t => {
  const f = await clientFixture(false, t.signal);
  try {
    const reference = f.sessions.retain(f.id, { source: 'mainView' });
    assert.equal(reference.sessionId, f.id);
    assert.equal(f.sessions.retainInfo(f.id).getSnapshot().referenceCount, 1);
    await reference.ready;
    assert.equal(reference.binding.session.getSnapshot().openState, 'open');
    assert.ok(f.calls.some(call => call.endpoint === 'session/follow'));
    assert.ok(!f.calls.some(call => call.endpoint === '$historyScoped/support'));
    reference.release();
  } finally { await f.close(); }
});

test('the loaded native Client bundle prepares connected refresh and binds the synchronous Agent resolver', { timeout: 15000 }, async t => {
  const f = await clientFixture(true, t.signal, true);
  try {
    const lease = await f.sessions.prepareHistoryOpen(f.id);
    assert.ok(f.client.typert.contexts.getClient('agent'));
    const reference = f.sessions.retain(f.id, { source: 'mainView', history: lease });
    await reference.ready;
    assert.equal(reference.binding.session.getSnapshot().openState, 'open');
    assert.equal(f.sessions.historyOpening.getSnapshot().phase, 'ready');
    assert.ok(f.calls.some(call => call.payload?.endpoint === 'session/control'));
    reference.release();
  } finally { await f.close(); }
});

test('a late support probe cannot restore a disconnected generation and a current connection can prepare again', { timeout: 15000 }, async t => {
  const f = await clientFixture(true, t.signal);
  try {
    const pause = f.pauseProbe();
    const obsolete = assert.rejects(f.sessions.prepareHistoryOpen(f.id));
    await pause.reached.promise;
    const previous = f.connection.generation.getSnapshot();
    const next = Promise.withResolvers();
    const unsubscribe = f.connection.generation.subscribe(() => {
      const current = f.connection.generation.getSnapshot();
      if (current !== undefined && current !== previous) next.resolve();
    });
    try {
      f.connection.reconnect();
      await obsolete;
      await next.promise;
    } finally { unsubscribe(); }
    const fresh = f.sessions.prepareHistoryOpen(f.id);
    pause.proceed.resolve();
    const reference = f.sessions.retain(f.id, { source: 'mainView', history: await fresh });
    await reference.ready;
    assert.equal(reference.binding.session.getSnapshot().openState, 'open');
    assert.equal(f.sessions.historyOpening.getSnapshot().phase, 'ready');
    reference.release();
  } finally { await f.close(); }
});

test('native using rejects a failed physical opening and releases its new reference', { timeout: 15000 }, async t => {
  const f = await clientFixture(true, t.signal);
  try {
    const missing = 'synthetic-unavailable-history';
    f.sessions.handleSessionAdded({ sessionId: missing, running: false, blank: false, updatedAt: 0 });
    let operations = 0;
    await assert.rejects(f.sessions.using(missing, { source: 'workspaceOperation' }, () => { operations++; }));
    assert.equal(operations, 0);
    assert.equal(f.sessions.retainInfo(missing).getSnapshot().referenceCount, 0);
    assert.equal(f.sessions.retainInfo(f.id).getSnapshot().referenceCount, 0);
  } finally { await f.close(); }
});
