import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import * as RemoteClient from '@deepseek-ai/dsh-api-gateway/client';
import { RemoteStream } from '@deepseek-ai/dsh-api-gateway/client';
import { TYPERT } from '@deepseek-ai/dsh-api-session-controller/typert';
import TYPERT_REMOTE from '@deepseek-ai/dsh-api-session-controller/remote';
import * as HostConnection from '@deepseek-ai/dsh-client-connection';
import { installConnection } from '@deepseek-ai/dsh-client-connection/client';
import { fixture, hostController, inspect } from './session-activation-fixture.mjs';

const require = createRequire(import.meta.url);
const web = createRequire(require.resolve('@deepseek-ai/dsh-web-app/package.json'));
const connectionSdk = createRequire(require.resolve('@deepseek-ai/dsh-client-connection/package.json'));
const WebSocket = connectionSdk('ws');
const { WebServer } = await import(pathToFileURL(web.resolve('@deepseek-ai/dsh-host-webserver')));
const sessionRoot = dirname(require.resolve('@deepseek-ai/dsh-api-session-controller/package.json'));
const { ClientSessions } = await import(pathToFileURL(join(sessionRoot, 'lib/types/client/sessions/service.js')));
const { SessionEventStream } = await import(pathToFileURL(join(sessionRoot, 'lib/types/client/transport.js')));

function untilAbort(signal) {
  return new Promise(resolve => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', resolve, { once: true });
  });
}

async function waitFor(promise, signal) {
  signal.throwIfAborted();
  let cancel;
  const cancelled = new Promise((_, reject) => { cancel = () => reject(signal.reason); });
  signal.addEventListener('abort', cancel, { once: true });
  try { return await Promise.race([promise, cancelled]); }
  finally { signal.removeEventListener('abort', cancel); }
}

function generationReady(connection, signal, previous) {
  return new Promise((resolve, reject) => {
    let unsubscribe;
    const finish = (error, value) => {
      unsubscribe?.();
      signal.removeEventListener('abort', aborted);
      if (error) reject(error); else resolve(value);
    };
    const inspect = () => {
      const current = connection.generation.getSnapshot();
      if (current && current !== previous) finish(undefined, current);
    };
    const aborted = () => finish(signal.reason);
    unsubscribe = connection.generation.subscribe(inspect);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted(); else inspect();
  });
}

async function physicalHost(signal) {
  const f = await fixture(), owner = new AbortController(), records = new Map();
  try {
    f.ctx.provide('credentials', { async modifyRecord(key, mutate) {
      const replacement = await mutate(records.get(key));
      if (replacement !== undefined) records.set(key, replacement);
      return records.get(key);
    } });
    await f.ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 }).await();
    await f.ctx.plugin(HostConnection).await();
    const controller = await hostController(f.ctx, true);
    let releaseGuard = controller.registerHistoryOpenGuard({ signal: owner.signal, assertCurrent() {} });
    f.ctx.typert.register(TYPERT);
    await f.ctx.plugin(TypertGatewayService, {}).await();
    f.ctx.effect(() => f.ctx.typertGateway.registerRemoteEvents(async function* (lifetime) {
      await untilAbort(lifetime);
    }, { home: f.root }));
    const server = f.ctx.get('webServer'), connection = f.ctx.get('connection');
    server.registerFallback((request, response) => {
      if (connection.authorizeIndex(request, response)) response.end('synthetic carrier');
    });
    const base = `${server.getOrigin()}/`;
    const authorization = await fetch(connection.authenticatedUrl(base), { redirect: 'manual', signal });
    assert.equal(authorization.status, 303);
    const cookie = authorization.headers.getSetCookie()[0]?.split(';', 1)[0];
    assert.ok(cookie);
    const openings = [];
    let lookups = 0;
    const gateway = f.ctx.get('typertGateway'), lookup = gateway.resolveReceiverContext, open = gateway.openWireStream;
    gateway.resolveReceiverContext = function (...args) { lookups++; return lookup.apply(this, args); };
    gateway.openWireStream = function (endpoint, payload, ...args) {
      openings.push({ endpoint, payload });
      return open.call(this, endpoint, payload, ...args);
    };
    return { ...f, controller, base, cookie, openings, lookups: () => lookups,
      rotateGuard() { releaseGuard(); releaseGuard = controller.registerHistoryOpenGuard({ signal: owner.signal, assertCurrent() {} }); },
      async close() { owner.abort(); await f.close(); records.clear(); } };
  } catch (error) { owner.abort(); await f.close(); throw error; }
}

async function physicalClient(initialHost, signal, { holdUpgrade, answering = false } = {}) {
  const ctx = new Context(), sockets = [];
  let active = initialHost, loop, pauseCall;
  try {
    await ctx.plugin(TypertRegistry).await();
    installConnection(ctx, { interactions: answering ? 'answer' : 'none', transport: {
      streamBaseUrl: initialHost.base,
      async fetch(input, init) {
        const endpoint = JSON.parse(init.body).method;
        if (pauseCall && endpoint === '$historyScoped/call') {
          pauseCall.reached.resolve();
          await waitFor(pauseCall.proceed.promise, init.signal ?? signal);
        }
        const headers = new Headers(init.headers);
        headers.set('cookie', active.cookie);
        headers.set('origin', new URL(active.base).origin);
        return fetch(new URL(input, active.base), { ...init, headers });
      },
      createWebSocket(url) {
        const address = new URL(url); address.host = new URL(active.base).host;
        const socket = new WebSocket(address, {
          headers: { cookie: active.cookie, origin: new URL(active.base).origin },
          ...(holdUpgrade ? { finishRequest(request) {
            holdUpgrade.reached.resolve();
            void holdUpgrade.proceed.promise.then(() => { if (!request.destroyed) request.end(); });
          } } : {}),
        });
        sockets.push(socket);
        return socket;
      },
    } });
    const connection = ctx.get('connection');
    if (!answering) {
      // Isolate socket retry from the separately owned Connection generation.
      connection.registerGenerationSource(async (lifetime, ready) => {
        ready({ home: initialHost.root }); await untilAbort(lifetime);
      });
      loop = connection.start({});
    }
    await ctx.plugin(RemoteClient, { historyRequired: true }).await();
    await generationReady(connection, signal);
    await ctx.remote.$mount(TYPERT_REMOTE);
    const sessions = new ClientSessions(ctx, ctx.remote);
    return { ctx, sessions, connection, sockets,
      selectHost(host) { active = host; },
      pauseCall() { pauseCall = { reached: Promise.withResolvers(), proceed: Promise.withResolvers() }; return pauseCall; },
      async close() { pauseCall?.proceed.resolve(); holdUpgrade?.proceed.resolve(); loop?.stop(); await ctx.fiber.dispose(); } };
  } catch (error) { holdUpgrade?.proceed.resolve(); loop?.stop(); await ctx.fiber.dispose(); throw error; }
}

test('a physical socket wait cannot dispatch an obsolete history guard to the receiving Host', { timeout: 15000 }, async t => {
  const host = await physicalHost(t.signal), hold = { reached: Promise.withResolvers(), proceed: Promise.withResolvers() };
  let client;
  const caller = new AbortController();
  try {
    client = await physicalClient(host, t.signal, { holdUpgrade: hold });
    const before = await inspect(host.ctx, host.id), generation = client.connection.generation.getSnapshot();
    await waitFor(hold.reached.promise, t.signal);
    await client.sessions.prepareHistoryConnection();
    const history = await client.ctx.remote.$historySupport(caller.signal);
    const waiting = Promise.withResolvers(), streams = client.ctx.remote.streams, wait = streams.waitForSocket;
    streams.waitForSocket = function (...args) { waiting.resolve(); return wait.apply(this, args); };
    const source = client.ctx.remote.session.followReadOnly({ address: { kind: 'session', sessionId: host.id }, history }, caller.signal)[Symbol.asyncIterator]();
    const rejected = assert.rejects(source.next());
    await waitFor(waiting.promise, t.signal);
    assert.equal(client.sockets[0].readyState, WebSocket.CONNECTING);
    const lookups = host.lookups();
    host.rotateGuard();
    hold.proceed.resolve();
    await rejected;
    assert.equal(host.lookups(), lookups);
    assert.equal(client.connection.generation.getSnapshot(), generation);
    const refreshed = await client.ctx.remote.$historySupport(caller.signal);
    const current = client.ctx.remote.session.followReadOnly({ address: { kind: 'session', sessionId: host.id }, history: refreshed }, caller.signal)[Symbol.asyncIterator]();
    assert.equal((await current.next()).value.type, 'snapshot');
    caller.abort(); await current.return();
    assert.deepEqual(await inspect(host.ctx, host.id), before);
    assert.equal(host.ctx.agents.get(host.id), undefined);
  } finally { caller.abort(); hold.proceed.resolve(); await client?.close(); await host.close(); }
});

test('native Session follow prepares a fresh guard on same-generation physical socket retry', { timeout: 15000 }, async t => {
  const host = await physicalHost(t.signal);
  let client, stream;
  try {
    client = await physicalClient(host, t.signal);
    const before = await inspect(host.ctx, host.id), generation = client.connection.generation.getSnapshot();
    const replaced = Promise.withResolvers(), failed = Promise.withResolvers();
    let publications = 0, retries = 0;
    const remote = { session: client.ctx.remote.session, $stream: options => new RemoteStream(client.connection, options) };
    stream = new SessionEventStream(remote, { kind: 'session', sessionId: host.id }, {
      history: client.sessions.history,
      publish(change) { if (change.type === 'replace' && ++publications === 2) replaced.resolve(); },
      failed(error) { failed.resolve(error); },
      carrierFailed() { retries++; host.rotateGuard(); client.ctx.remote.streams.reconnect(); },
    });
    await stream.open({});
    const first = host.openings.find(opening => opening.payload?.endpoint === 'session/followReadOnly');
    client.sockets[0].terminate();
    const outcome = await waitFor(Promise.race([replaced.promise.then(() => 'replaced'), failed.promise]), t.signal);
    assert.equal(outcome, 'replaced');
    assert.equal(retries, 1);
    assert.equal(client.connection.generation.getSnapshot(), generation);
    const openings = host.openings.filter(opening => opening.payload?.endpoint === 'session/followReadOnly');
    assert.equal(openings.length, 2);
    assert.notEqual(openings[1].payload.history.guard, first.payload.history.guard);
    assert.equal(openings[1].payload.history.guard, openings[1].payload.payload.args.request.history.guard);
    assert.ok(!host.openings.some(opening => opening.endpoint === 'session/follow' || opening.payload?.endpoint === 'session/follow'));
    assert.deepEqual(await inspect(host.ctx, host.id), before);
    assert.equal(host.ctx.agents.get(host.id), undefined);
  } finally { await stream?.dispose(); await client?.close(); await host.close(); }
});

test('physical HTTP Host replacement refuses an already prepared envelope before receiver lookup', { timeout: 15000 }, async t => {
  const first = await physicalHost(t.signal);
  let second, client;
  try {
    second = await physicalHost(t.signal);
    client = await physicalClient(first, t.signal, { answering: true });
    await client.sessions.prepareHistoryConnection();
    const oldLease = await client.sessions.prepareHistoryOpen(first.id);
    const paused = client.pauseCall();
    const inflight = client.ctx.remote.session.historyOpenSupport();
    await waitFor(paused.reached.promise, t.signal);
    const lookups = second.lookups();
    client.selectHost(second); paused.proceed.resolve();
    assert.equal((await inflight).ok, false);
    assert.equal(second.lookups(), lookups);
    const previous = client.connection.generation.getSnapshot();
    const ready = generationReady(client.connection, t.signal, previous);
    client.connection.reconnect();
    await ready;
    assert.throws(() => client.sessions.retain(first.id, { source: 'mainView', history: oldLease }));
    await client.sessions.prepareHistoryConnection();
    assert.deepEqual((await client.ctx.remote.session.historyOpenSupport()).value, second.controller.historyOpenSupport());
    assert.equal(first.ctx.agents.get(first.id), undefined);
    assert.equal(second.ctx.agents.get(second.id), undefined);
  } finally { await client?.close(); await second?.close(); await first.close(); }
});
