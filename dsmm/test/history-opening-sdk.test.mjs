import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { SessionController } from '@deepseek-ai/dsh-api-session-controller';
import { TYPERT } from '@deepseek-ai/dsh-api-session-controller/typert';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import * as RemoteClient from '@deepseek-ai/dsh-api-gateway/client';
import TYPERT_REMOTE from '@deepseek-ai/dsh-api-session-controller/remote';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { installConnection } from '@deepseek-ai/dsh-client-connection/client';
import { fixture, hostController, inspect } from './session-activation-fixture.mjs';

test('protected history refuses missing, retired and foreign Host guards before persistence access', async () => {
  const f = await fixture();
  try {
    const controller = await hostController(f.ctx, true);
    const address = { kind: 'session', sessionId: f.id };
    let reads = 0;
    const observe = f.ctx.sessionQuery.observeSession;
    f.ctx.sessionQuery.observeSession = function (...args) { reads++; return observe.apply(this, args); };
    assert.equal(typeof controller.registerHistoryOpenGuard, 'function');
    assert.throws(() => controller.historyOpenSupport());
    await assert.rejects(controller.followReadOnly({ address,
      history: { protocol: 'dsmm-history-open-1', host: 'unknown', guard: 'missing' } }, new AbortController().signal).next());
    assert.equal(reads, 0);
    const owner = new AbortController();
    let current = true;
    const release = controller.registerHistoryOpenGuard({ signal: owner.signal,
      assertCurrent() { if (!current) throw new Error('retired owner'); } });
    const support = controller.historyOpenSupport();
    const signal = new AbortController().signal;
    const before = await inspect(f.ctx, f.id);
    await assert.rejects(controller.followReadOnly({ address, history: { ...support, host: 'foreign' } }, signal).next());
    assert.equal(reads, 0);
    current = false;
    assert.throws(() => controller.historyOpenSupport());
    await assert.rejects(controller.followReadOnly({ address, history: support }, signal).next());
    assert.equal(reads, 0);
    current = true;
    release();
    const replacement = controller.registerHistoryOpenGuard({ signal: owner.signal, assertCurrent() {} });
    assert.notEqual(controller.historyOpenSupport().guard, support.guard);
    await assert.rejects(controller.followReadOnly({ address, history: support }, signal).next());
    assert.equal(reads, 0);
    owner.abort();
    assert.throws(() => controller.historyOpenSupport());
    replacement();
    assert.deepEqual(await inspect(f.ctx, f.id), before);
  } finally { await f.close(); }
});

test('native Gateway validates protected history codecs and preserves addressed resource denial', async () => {
  const f = await fixture();
  const owner = new AbortController(), caller = new AbortController();
  const decisions = [];
  let peer, deniedPeer;
  try {
    f.ctx.provide('remoteAccess', { allows: () => true, decide(request) { decisions.push(request); return { kind: 'deny', reason: 'resource-invalid' }; } });
    const controller = await hostController(f.ctx, true);
    f.ctx.typert.register(TYPERT);
    await f.ctx.plugin(TypertGatewayService, {}).await();
    peer = new Peer(f.ctx, { principal: { kind: 'owner' } });
    deniedPeer = new Peer(f.ctx, { principal: { kind: 'synthetic-restricted' } });
    const invoke = (method, args = {}) => f.ctx.typertGateway.invoke({ namespace: 'session', method, args, peer, signal: caller.signal });
    await assert.rejects(invoke('historyOpenSupport'));
    controller.registerHistoryOpenGuard({ signal: owner.signal, assertCurrent() {} });
    const support = await invoke('historyOpenSupport');
    assert.deepEqual(support, controller.historyOpenSupport());
    const request = { address: { kind: 'session', sessionId: f.id }, history: support };
    const open = (input, selectedPeer = peer) => f.ctx.typertGateway.stream({ namespace: 'session', method: 'followReadOnly',
      args: { request: input }, peer: selectedPeer, signal: caller.signal });
    await assert.rejects(open({ ...request, history: { ...support, protocol: 'unknown' } }));
    await assert.rejects(open({ address: request.address }));
    await assert.rejects(open(request, deniedPeer));
    assert.equal(decisions.length, 1);
    assert.deepEqual(decisions[0].resources, [{ kind: 'session', id: f.id }]);
    const stream = (await open(request))[Symbol.asyncIterator]();
    assert.equal((await stream.next()).value.type, 'snapshot');
    caller.abort();
    await stream.return();
  } finally { owner.abort(); caller.abort(); await deniedPeer?.dispose(); await peer?.dispose(); await f.close(); }
});

test('protected follow stays read-only for later frames under the ordinary promotion default', async () => {
  assert.equal(SessionController.Config({}).activateOnFollow, true);
  const f = await fixture(false);
  const caller = new AbortController(), owner = new AbortController();
  try {
    const controller = await hostController(f.ctx, true);
    let writes = 0, promotions = 0;
    const open = f.ctx.sessionPersistence.open;
    f.ctx.sessionPersistence.open = function (...args) { if (args[1] === 'write') writes++; return open.apply(this, args); };
    const resume = f.ctx.agents.resume;
    f.ctx.agents.resume = function (...args) { promotions++; return resume.apply(this, args); };
    controller.registerHistoryOpenGuard({ signal: owner.signal, assertCurrent() {} });
    const support = controller.historyOpenSupport();
    const stream = controller.followReadOnly({ address: { kind: 'session', sessionId: f.id },
      assistantStream: true, history: support }, caller.signal);
    const first = await stream.next();
    assert.equal(first.value.type, 'snapshot');
    assert.ok(first.value.records.length > 0);
    const pending = stream.next();
    await Promise.resolve();
    assert.equal(writes, 0); assert.equal(promotions, 0);
    const resumed = await f.ctx.agents.resume({ resumeSessionId: f.id });
    try {
      assert.equal((await pending).done, false);
      const durable = stream.next();
      resumed.agent.session.append('session/title', { title: 'Current title', messageSeqs: [], source: { kind: 'user' } });
      assert.equal((await durable).value.type, 'event');
      const assistant = stream.next();
      f.ctx.emit('agent/assistant-stream', { agent: resumed.agent, frame: { type: 'start', revision: 1,
        attemptId: 'protected-history-fixture', turn: 1, step: 1 } });
      assert.equal((await assistant).value.type, 'assistant-stream');
      assert.equal(promotions, 1); assert.equal(writes, 1);
      const waiting = stream.next();
      owner.abort();
      await assert.rejects(waiting);
      assert.equal(promotions, 1); assert.equal(writes, 1);
    } finally { await resumed.dispose(); }
  } finally { caller.abort(); owner.abort(); await f.close(); }
});

test('protected Gateway receipt rejects stale envelopes before receiver lookup and keeps native access checks', async () => {
  const f = await fixture();
  const owner = new AbortController(), caller = new AbortController();
  let peer, deniedPeer;
  try {
    const decisions = [];
    f.ctx.provide('remoteAccess', { allows: () => true, decide(request) { decisions.push(request); return { kind: 'deny', reason: 'resource-invalid' }; } });
    const controller = await hostController(f.ctx, true);
    f.ctx.typert.register(TYPERT);
    await f.ctx.plugin(TypertGatewayService, {}).await();
    peer = new Peer(f.ctx, { principal: { kind: 'owner' } });
    deniedPeer = new Peer(f.ctx, { principal: { kind: 'synthetic-restricted' } });
    const gateway = f.ctx.typertGateway;
    assert.equal(typeof gateway.registerHistoryDispatchGuard, 'function');
    const probe = () => gateway.dispatchRpc('$historyScoped/support', { args: {} }, caller.signal, peer);
    assert.equal((await probe()).ok, false);
    const release = controller.registerHistoryOpenGuard({ signal: owner.signal, assertCurrent() {} });
    const support = (await probe()).value;
    assert.deepEqual(support, controller.historyOpenSupport());
    const envelope = { history: support, endpoint: 'session/historyOpenSupport', payload: { args: {} } };
    let lookups = 0;
    const resolve = gateway.resolveReceiverContext;
    gateway.resolveReceiverContext = function (...args) { lookups++; return resolve.apply(this, args); };
    const call = value => gateway.dispatchRpc('$historyScoped/call', structuredClone(value), caller.signal, peer);
    assert.equal((await call({ ...envelope, history: { ...support, host: 'foreign' } })).ok, false);
    for (const endpoint of ['$historyScoped/call', '$events/result', '$events/stream', 'session/extra/path']) {
      assert.equal((await call({ ...envelope, endpoint })).ok, false);
    }
    assert.equal((await call({ ...envelope, extra: true })).ok, false);
    assert.equal(lookups, 0);
    assert.deepEqual((await call(envelope)).value, support);
    assert.equal(lookups, 1);
    const address = { kind: 'session', sessionId: f.id };
    const follow = { history: support, endpoint: 'session/followReadOnly', payload: { args: { request: { address, history: support } } } };
    const open = (value, selectedPeer = peer) => gateway.wireStream.open('$historyScoped/stream', structuredClone(value),
      (async function* () {})(), selectedPeer, caller.signal);
    await assert.rejects(open(follow, deniedPeer));
    assert.equal(decisions.length, 1);
    assert.deepEqual(decisions[0].resources, [{ kind: 'session', id: f.id }]);
    const stream = (await open(follow))[Symbol.asyncIterator]();
    assert.equal((await stream.next()).value.type, 'snapshot');
    const waiting = stream.next();
    release();
    await assert.rejects(waiting);
    controller.registerHistoryOpenGuard({ signal: owner.signal, assertCurrent() {} });
    const before = lookups;
    assert.equal((await call(envelope)).ok, false);
    await assert.rejects(open(follow));
    assert.equal(lookups, before);
    assert.notEqual((await probe()).value.guard, support.guard);
  } finally { owner.abort(); caller.abort(); await deniedPeer?.dispose(); await peer?.dispose(); await f.close(); }
});

test('protected Gateway rechecks readiness after asynchronous native receiver preparation', { timeout: 15000 }, async () => {
  const f = await fixture();
  const owner = new AbortController(), caller = new AbortController();
  let peer;
  try {
    const controller = await hostController(f.ctx, true);
    f.ctx.typert.register(TYPERT);
    await f.ctx.plugin(TypertGatewayService, {}).await();
    peer = new Peer(f.ctx, { principal: { kind: 'owner' } });
    controller.registerHistoryOpenGuard({ signal: owner.signal, assertCurrent() {} });
    const history = controller.historyOpenSupport();
    const gateway = f.ctx.typertGateway;
    const reached = Promise.withResolvers(), proceed = Promise.withResolvers();
    const resolve = gateway.resolveReceiverContext;
    gateway.resolveReceiverContext = async function (...args) {
      reached.resolve(); await proceed.promise; return resolve.apply(this, args);
    };
    let calls = 0;
    const original = controller.historyOpenSupport;
    controller.historyOpenSupport = function () { calls++; return original.call(this); };
    const done = gateway.dispatchRpc('$historyScoped/call', { history, endpoint: 'session/historyOpenSupport', payload: { args: {} } }, caller.signal, peer);
    await reached.promise;
    owner.abort(); proceed.resolve();
    assert.equal((await done).ok, false);
    assert.equal(calls, 0);
  } finally { owner.abort(); caller.abort(); await peer?.dispose(); await f.close(); }
});

test('required native Client envelopes reach the actual Host and retain full read-only streams', { timeout: 15000 }, async () => {
  const f = await fixture(), replacement = await fixture();
  const client = new Context(), caller = new AbortController(), owner = new AbortController();
  const peers = [];
  try {
    async function host(value) {
      const controller = await hostController(value.ctx, true);
      value.ctx.typert.register(TYPERT);
      await value.ctx.plugin(TypertGatewayService, {}).await();
      controller.registerHistoryOpenGuard({ signal: owner.signal, assertCurrent() {} });
      const peer = new Peer(value.ctx, { principal: { kind: 'owner' } });
      peers.push(peer);
      return { controller, peer, gateway: value.ctx.typertGateway };
    }
    const original = await host(f), next = await host(replacement);
    let receiving = original, pause;
    const endpoints = [];
    await client.plugin(TypertRegistry).await();
    installConnection(client, { interactions: 'none', transport: { ownsHost: true, rpc: {
      async call(_channel, endpoint, payload, signal) {
        endpoints.push(endpoint);
        if (pause && endpoint === '$historyScoped/call') {
          pause.reached.resolve(); await pause.proceed.promise;
        }
        return receiving.gateway.dispatchRpc(endpoint, structuredClone(payload), signal, receiving.peer);
      },
      async *open(_channel, endpoint, payload, signal, uplink) {
        endpoints.push(endpoint);
        const source = await receiving.gateway.wireStream.open(endpoint, structuredClone(payload),
          uplink ?? (async function* () {})(), receiving.peer, signal);
        yield* source;
      },
    } } });
    await client.plugin(RemoteClient, { historyRequired: true }).await();
    await client.remote.$mount(TYPERT_REMOTE);
    assert.throws(() => client.remote.session.historyOpenSupport());
    assert.deepEqual(endpoints, []);
    let support = await client.remote.$historySupport(caller.signal);
    client.remote.$registerHistoryPreparation({ assertCurrent() { caller.signal.throwIfAborted(); }, async prepare(signal) {
      return { support, signal, assertCurrent() { signal.throwIfAborted(); } };
    } });
    assert.deepEqual((await client.remote.session.historyOpenSupport()).value, support);
    let resolutions = 0;
    const resolve = next.gateway.resolveReceiverContext;
    next.gateway.resolveReceiverContext = function (...args) { resolutions++; return resolve.apply(this, args); };
    pause = { reached: Promise.withResolvers(), proceed: Promise.withResolvers() };
    const inflight = client.remote.session.historyOpenSupport();
    await pause.reached.promise;
    receiving = next;
    pause.proceed.resolve();
    assert.equal((await inflight).ok, false);
    assert.equal(resolutions, 0);
    pause = undefined;
    support = await client.remote.$historySupport(caller.signal);
    const request = { address: { kind: 'session', sessionId: replacement.id }, history: support };
    const handle = client.remote.session.followReadOnly(request, caller.signal);
    request.address.sessionId = 'caller-mutated-after-opening';
    const stream = handle[Symbol.asyncIterator]();
    assert.equal((await stream.next()).value.type, 'snapshot');
    const waiting = stream.next();
    owner.abort();
    await assert.rejects(waiting);
    assert.ok(endpoints.includes('$historyScoped/call'));
    assert.ok(endpoints.includes('$historyScoped/stream'));
    assert.ok(endpoints.every(endpoint => ['$historyScoped/support', '$historyScoped/call', '$historyScoped/stream'].includes(endpoint)));
    await handle.dispose();
  } finally {
    caller.abort(); owner.abort(); await client.fiber.dispose();
    for (const peer of peers) await peer.dispose();
    await replacement.close(); await f.close();
  }
});

test('browser Gateway factory closes required dispatch before a provider exists and cannot downgrade bootstrap', async () => {
  const require = createRequire(import.meta.url);
  const bundle = join(dirname(require.resolve('@deepseek-ai/dsh-api-gateway/package.json')), 'lib/client.browser.js');
  let browserClient;
  vm.runInNewContext(await readFile(bundle, 'utf8'), { __DSMM_HISTORY_REQUIRED__: true,
    window: { __ModuleLoader__: { load({ factory }) { browserClient = factory(require); } } },
    AbortController, AbortSignal, structuredClone, crypto: globalThis.crypto });
  const client = new Context();
  try {
    await client.plugin(TypertRegistry).await();
    let requests = 0;
    installConnection(client, { interactions: 'none', transport: { ownsHost: true, rpc: {
      async call() { requests++; throw new Error('Unexpected ordinary dispatch'); },
      async *open() { requests++; throw new Error('Unexpected ordinary stream'); },
    } } });
    await client.plugin(browserClient, { historyRequired: false }).await();
    assert.equal(client.remote.$historyRequired, true);
    assert.throws(() => client.remote.$assertHistoryScope());
    assert.equal(requests, 0);
  } finally { await client.fiber.dispose(); }
});
