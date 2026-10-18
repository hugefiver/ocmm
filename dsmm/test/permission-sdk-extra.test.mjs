import assert from 'node:assert/strict';
import test from 'node:test';
import { Context } from '@deepseek-ai/cordis';
import { WebRuntime } from '@deepseek-ai/dsh-web';
import { HttpFetchProvider } from '@deepseek-ai/dsh-web-fetch-http';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fixture, nativeUi } from './approval-settlement-sdk.test.mjs';
import * as ManagedWeb from '../src/permission-web.ts';
import { installTemporaryWebPermissions } from '../src/permission-temporary-web.ts';
import { TemporaryPermissionGrants } from '../src/permission-temporary-grants.ts';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import WorkingDirectory from '@deepseek-ai/dsh-working-directory';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import { SubagentRuntime } from '@deepseek-ai/dsh-subagent';
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval';
import { SessionQueryEngine } from '@deepseek-ai/dsh-session-query';
import { SessionController } from '@deepseek-ai/dsh-api-session-controller';
import { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy';
import { installConnection } from '@deepseek-ai/dsh-client-connection/client';
import * as ClientTypert from '@deepseek-ai/dsh-typert-registry/client';
import * as RemoteClient from '@deepseek-ai/dsh-api-gateway/client';
import * as ManagedFs from '../src/permission-fs.ts';
import { installTemporaryFilePermissions } from '../src/permission-temporary-files.ts';
import { ChildPermissionControl } from '../src/permission-child-control.ts';
import { registerTemporaryPermissionRpc } from '../src/permission-temporary-rpc.ts';
import { temporaryPermissionClient } from '../src/client/temporary-permission-client.ts';

const browserModules = new Map();
function browserModule(name) {
  if (browserModules.has(name)) return browserModules.get(name);
  const nativeRequire = createRequire(import.meta.resolve(name));
  let value;
  vm.runInNewContext(readFileSync(fileURLToPath(import.meta.resolve(name)), 'utf8'), {
    window: { __ModuleLoader__: { load({ factory }) { value = factory(dependency => {
      // This Node fixture executes native scope/store logic, never a DOM renderer.
      if (dependency === 'react-dom' || dependency === 'react-dom/client') return new Proxy({}, { get() { return () => { throw new Error('DOM rendering requires the separate browser QA fixture.'); }; } });
      try { return nativeRequire(dependency); } catch (error) { if (!dependency.endsWith('/client')) throw error; return browserModule(dependency); }
    }); } } }, Promise, AbortSignal, AbortController, Error, Symbol, console, setTimeout, clearTimeout, queueMicrotask,
  });
  browserModules.set(name, value); return value;
}

async function nativeChildTab(f, t) {
  const host = f.host, client = new Context(), abort = new AbortController();
  t.after(async () => { abort.abort(); await client.fiber.dispose(); });
  host.provide('fileUploads', { registerAgentResolver() { return () => {}; } });
  host.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'local-synthetic', model: 'local-synthetic' }) });
  host.provide('workspaceRegistry', { archivedSessionIds: [] });
  await host.plugin(SessionQueryEngine).await();
  await host.inject(SessionController.inject.filter(name => name !== 'attachments'), scope => { new SessionController(scope, { activateOnFollow: false }); }).await();
  const typert = client.plugin(ClientTypert.default ?? ClientTypert); await typert.await(); assert.equal(typert.state, 2);
  installConnection(client, { interactions: 'answer', transport: { ownsHost: true, rpc: {
    call(_channel, endpoint, payload, signal = abort.signal) { return host.typertGateway.dispatchRpc(endpoint, structuredClone(payload), signal, f.browserPeer); },
    async *open(_channel, endpoint, payload, signal) {
      const source = await host.typertGateway.wireStream.open(endpoint, structuredClone(payload), (async function* () {})(), f.browserPeer, signal);
      for await (const frame of source) yield structuredClone(frame);
    },
  } } });
  await client.plugin(RemoteClient).await();
  for (const name of ['@deepseek-ai/dsh-api-session-controller/remote', '@deepseek-ai/dsh-subagent/remote', '@deepseek-ai/dsh-commands/remote'])
    await client.remote.$mount((await import(name)).default);
  client.provide('fileUpload', {});
  const sessions = client.plugin(browserModule('@deepseek-ai/dsh-api-session-controller/client')); await sessions.await(); assert.equal(sessions.state, 2);
  const { SlotRegistry } = browserModule('@deepseek-ai/dsh-client-ui-renderer/client');
  new SlotRegistry(client);
  const { UiSession } = browserModule('@deepseek-ai/dsh-client-ui-session/client');
  new UiSession(client, client.sessions);
  client.provide('locale', { register() { return () => {}; } });
  const ui = client.plugin(await nativeUi()); await ui.await(); assert.equal(ui.state, 2);
  function pending(childId) {
    const current = () => client.uiSession.sessionStatus.getSnapshot().get(childId)?.pendingInteraction;
    if (current()) return Promise.resolve(current());
    return new Promise(resolve => { const off = client.uiSession.sessionStatus.subscribe(() => { const value = current(); if (value) { off(); resolve(value); } }); });
  }
  return { client, pending, async close() { abort.abort(); await client.fiber.dispose(); } };
}

async function childFixture(t) {
  const base = await realpath(tmpdir()), directory = await mkdtemp(join(base, 'dsmm-child-origin-'));
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  t.after(() => release.resolve());
  const f = await fixture(t, directory, async host => {
    for (const [plugin, config] of [[Jsonl, { root: join(directory, 'sessions'), compression: 'none' }], [LocalFileSystem, { cwd: directory }],
      [WorkingDirectory, { defaultDirectory: directory }], [SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: directory }], [SubagentRuntime, {}], [Spawn, {}]]) {
      const fiber = host.plugin(plugin, config); await fiber.await(); assert.equal(fiber.state, 2, plugin.name);
    }
    class Adapter extends LlmAdapter {
      async resolveModel(provider, model) { return { provider, id: model, name: model, inputModalities: ['text'] }; }
      async *stream() { yield { type: 'finish', reason: { kind: 'stop' } }; }
    }
    host.llm.registerAdapter(['local-synthetic'], new Adapter());
    host.on('agent/request', async (_request, next) => { entered.resolve(); await release.promise; return next(); }, { global: true });
  });
  t.after(async () => { assert.equal(dirname(await realpath(directory)), base); await rm(directory, { recursive: true }); });
  async function start(provider = 'spawn') {
    return f.host.subagents.startActivation({ provider, label: 'owned approval child', signal: new AbortController().signal, delivery: 'caller',
      request: { parent: f.agent, prompt: [{ type: 'text', text: 'local synthetic work' }], maxDepth: 1 } });
  }
  return { ...f, directory, start, entered: entered.promise, release: () => release.resolve() };
}

test('live child native retained scope answers its own pending through Gateway and final audit before file effects', { timeout: 15000 }, async t => {
  const f = await childFixture(t), tab = await nativeChildTab(f, t);
  const run = await f.start(); await f.entered;
  const child = f.host.agents.get(run.childId);
  const reference = tab.client.sessions.retain({ parentSessionId: f.agent.id, childSessionId: child.id, mode: 'continuable' }, { source: 'controllerOperation' });
  t.after(() => reference.release()); await reference.ready;
  assert.equal(tab.client.sessions.scopeOf(reference.binding.ctx), child.id);
  assert.notEqual(reference.binding.ctx, tab.client.sessions.scope(f.agent.id));
  assert.equal(tab.client.uiSession.bindingSource(reference).getSnapshot().props.sessionId, child.id);
  const file = join(f.directory, 'owned.txt'); await writeFile(file, 'owned child content');
  await f.host.plugin(ManagedFs, {}).await();
  f.host.on('tools/pre-execute', () => ({ kind: 'ask', reason: 'owned child read' }), { global: true });
  const receipts = []; f.host.approval.onSettlement(receipt => receipts.push(receipt));
  const grants = new TemporaryPermissionGrants(f.host.approval, f.host.typertGateway); t.after(() => grants.dispose());
  const children = new ChildPermissionControl(f.host, grants, { async refresh() {}, capture(parent, target) {
    function check() { assert.equal(parent, f.agent); assert.equal(target, child); assert.equal(f.host.agents.isOwnedBy(target.id, parent), true); }
    check(); return { check, role: 'native-fixture', readOnly: false };
  } });
  registerTemporaryPermissionRpc(f.host, grants, { children });
  const remote = temporaryPermissionClient(tab.client.connection, new AbortController().signal);
  assert.equal((await remote.child(f.agent.id, child.id)).state, 'disabled');
  assert.equal((await remote.enableChild(f.agent.id, child.id)).state, 'enabled');
  assert.equal(child.status, 'running'); assert.equal(f.host.approval.overrideOf(child.session), 'ask');
  const session = new AbortController();
  installTemporaryFilePermissions(f.host, { grants, capture(exec) { return { owner: f.host, generation: 1, sessionSignal: session.signal,
    assertIntegrity() { assert.equal(f.host.agents.get(child.id), child); assert.equal(exec.agent, child); }, assertProgramAllowed() {}, assertRetentionAllowed() { children.assertEnabled(child); } }; } });
  const invoke = () => f.host.tools.execute({ name: 'read', arguments: { file_path: file }, agent: child, callId: 'same-child-call', signal: new AbortController().signal });
  const first = invoke(), pending = await Promise.race([tab.pending(child.id), first.then(value => { throw new Error(JSON.stringify(value)); })]);
  assert.equal(pending.sessionId, child.id); assert.equal(tab.client.uiSession.sessionStatus.getSnapshot().get(f.agent.id)?.pendingInteraction, undefined);
  const retention = await remote.retain(child.id, { requestId: pending.requestId, deliveryId: pending.deliveryId }, 'session'); await pending.answer('allowed-once', { retention });
  assert.equal((await first).isError, false); assert.equal(receipts.at(-1).source, 'operator');
  assert.equal(grants.list(f.agent).length, 0); assert.equal(grants.list(child).length, 1);
  const second = invoke(), automatic = await tab.pending(child.id), permit = await remote.permit(child.id, { requestId: automatic.requestId, deliveryId: automatic.deliveryId });
  assert.ok(permit); await automatic.answer('allowed-once', { permit }); assert.equal((await second).isError, false);
  assert.equal(receipts.at(-1).source, 'temporary'); assert.equal(child.session.eventAt(receipts.at(-1).auditSeq).type, 'approval/decided');
  const manual = invoke(), mp = await tab.pending(child.id);
  assert.equal((await remote.revokeChild(f.agent.id, child.id)).state, 'disabled'); assert.equal(grants.list(child).length, 0);
  assert.equal(f.host.approval.overrideOf(child.session), 'never'); assert.equal(mp.answerable, true);
  await mp.answer('allowed-once'); assert.equal((await manual).isError, false); assert.equal(receipts.at(-1).source, 'operator');
  assert.equal((await invoke()).isError, true);
  assert.equal((await remote.enableChild(f.agent.id, child.id)).state, 'enabled');
  reference.release(); await tab.close(); f.release(); await run.result; await run.dispose();
});

test('live child revocation wins preparation races and natural retirement prevents late policy writes', { timeout: 15000 }, async t => {
  const f = await childFixture(t), tab = await nativeChildTab(f, t), run = await f.start(); await f.entered;
  const child = f.host.agents.get(run.childId), grants = new TemporaryPermissionGrants(f.host.approval, f.host.typertGateway);
  t.after(() => grants.dispose());
  let entered = Promise.withResolvers(), ready = Promise.withResolvers();
  const children = new ChildPermissionControl(f.host, grants, { async refresh() { entered.resolve(); await ready.promise; },
    capture(parent, target) { return { readOnly: false, check() { assert.equal(f.host.agents.isOwnedBy(target.id, parent), true); } }; } });
  const first = children.enable(f.agent, child, () => {}); await entered.promise;
  await children.revoke(f.agent, child, () => {}); ready.resolve(); await assert.rejects(first);
  assert.equal(f.host.approval.overrideOf(child.session), 'never');
  entered = Promise.withResolvers(); ready = Promise.withResolvers();
  const second = children.enable(f.agent, child, () => {}); await entered.promise;
  f.release(); await run.result; const seq = child.session.seq;
  ready.resolve(); await assert.rejects(second); assert.equal(child.session.seq, seq);
  assert.equal(f.host.subagents.creationApprovalOf(child), undefined);
  await run.dispose(); await tab.close();
});

test('fresh child origin is published after native acceptance and invalidates same-value replacement and disposal', { timeout: 15000 }, async t => {
  const f = await childFixture(t), observed = [];
  f.host.on('agent/created', ({ agent }) => { if (agent.session.header.parentSession) observed.push(f.host.subagents.creationApprovalOf(agent)); }, { global: true });
  const run = await f.start(); await f.entered;
  const child = f.host.agents.get(run.childId), proof = f.host.subagents.creationApprovalOf(child);
  assert.ok(child); assert.equal(child.status, 'running'); assert.deepEqual(observed, [undefined]);
  assert.ok(proof); proof.assertCurrent(f.agent, child); assert.equal(f.host.approval.overrideOf(child.session), 'never');
  assert.throws(() => proof.assertCurrent(child, f.agent));
  child.session.append('approval/policy', { policy: 'never', source: 'delegation' });
  assert.throws(() => proof.assertCurrent(f.agent, child));
  f.release(); await run.result; await run.dispose();
  assert.equal(f.host.subagents.creationApprovalOf(child), undefined); assert.throws(() => proof.assertCurrent(f.agent, child));
});

test('fresh child origin preserves parent never and rejects policy changes during native preparation', { timeout: 15000 }, async t => {
  const f = await childFixture(t);
  setApprovalPolicy(f.agent.session, 'never');
  const first = await f.start(); await f.entered;
  assert.equal(f.host.subagents.creationApprovalOf(f.host.agents.get(first.childId)), undefined);
  setApprovalPolicy(f.agent.session, 'ask');
  const native = f.host.subagents.getProvider('spawn'), preparing = Promise.withResolvers(), prepared = Promise.withResolvers();
  f.host.subagents.registerProvider({ name: 'owned-delayed', capabilities: native.capabilities, inheritsParentContext: false,
    async prepareContinuable(request) { preparing.resolve(); await prepared.promise; return native.prepareContinuable(request); } });
  const second = f.start('owned-delayed'); await preparing.promise;
  f.host.approval.config.policy = 'never'; prepared.resolve();
  const accepted = await second;
  assert.equal(f.host.subagents.creationApprovalOf(f.host.agents.get(accepted.childId)), undefined);
  f.host.approval.config.policy = 'ask'; f.release();
  await Promise.all([first.result, accepted.result]); await first.dispose(); await accepted.dispose();
});

test('prepared fetch preserves legacy selection and fences one-shot provider handoff', async t => {
  const ctx = new Context(), other = new Context(); t.after(async () => { await ctx.fiber.dispose(); await other.fiber.dispose(); });
  await ctx.plugin(WebRuntime, {}).await(); await other.plugin(WebRuntime, {}).await();
  let probes = 0, calls = 0;
  const provider = { id: 'owned', available() { probes++; return true; }, async fetch(request) { calls++; return request.url; } };
  let unregister = ctx.web.registerFetchProvider(provider);
  assert.equal(await ctx.web.fetch({ url: 'https://example.invalid/legacy' }), 'https://example.invalid/legacy'); assert.equal(probes, 1); assert.equal(calls, 1);
  const request = { url: 'https://example.invalid/prepared' }, prepared = ctx.web.prepareFetch(request);
  assert.equal(calls, 1); request.url = 'https://other.invalid/';
  assert.equal(await ctx.web.fetchPrepared(prepared, { beforeDispatch() { assert.equal(calls, 1); } }), 'https://example.invalid/prepared');
  assert.equal(calls, 2); await assert.rejects(ctx.web.fetchPrepared(prepared));
  await assert.rejects(ctx.web.fetchPrepared({ ...ctx.web.prepareFetch(request) }));
  const foreign = ctx.web.prepareFetch(request); await assert.rejects(other.web.fetchPrepared(foreign)); await assert.rejects(ctx.web.fetchPrepared(foreign));
  for (const beforeDispatch of [() => { throw new Error('owned veto'); }, async () => {}]) {
    const item = ctx.web.prepareFetch(request); await assert.rejects(ctx.web.fetchPrepared(item, { beforeDispatch })); await assert.rejects(ctx.web.fetchPrepared(item));
  }
  let inner;
  const reentry = ctx.web.prepareFetch(request);
  await ctx.web.fetchPrepared(reentry, { beforeDispatch() { inner = assert.rejects(ctx.web.fetchPrepared(reentry)); } }); await inner;
  assert.equal(calls, 3);
  const replaced = ctx.web.prepareFetch(request); unregister(); unregister = ctx.web.registerFetchProvider(provider);
  await assert.rejects(ctx.web.fetchPrepared(replaced));
  const changing = ctx.web.prepareFetch(request);
  await assert.rejects(ctx.web.fetchPrepared(changing, { beforeDispatch() { unregister(); unregister = ctx.web.registerFetchProvider(provider); } }));
  const abort = new AbortController(), cancelled = ctx.web.prepareFetch(request); abort.abort();
  await assert.rejects(ctx.web.fetchPrepared(cancelled, { signal: abort.signal }), { code: 'WEB_ABORTED' });
  assert.equal(calls, 3);
  unregister(); await assert.rejects(ctx.web.fetch(request), { code: 'WEB_PROVIDER_UNAVAILABLE' });
});

test('temporary handoff rejects revocation inside the final synchronous authority check', async t => {
  const f = await fixture(t), tab = await f.tab();
  const grants = new TemporaryPermissionGrants(f.host.approval, f.host.typertGateway); t.after(() => grants.dispose());
  const signal = new AbortController().signal;
  let withdraw = false;
  const execution = { token: {}, agent: f.agent, owner: f.host, generation: 1, registration: {}, provider: {}, sessionId: f.agent.id,
    tool: 'owned-handoff', project: 'owned', target: 'exact', summary: 'owned handoff', reusable: true, signal, sessionSignal: signal,
    assertIntegrity() {}, assertReusable() { if (withdraw) grants.revokeAgent(f.agent); } };
  const start = () => grants.approve({ agent: f.agent, toolName: execution.tool, callId: 'handoff', reason: 'owned', signal }, { ...execution, token: {} });
  const first = start(), p = await tab.next();
  const retention = grants.retain(tab.peer, p.requestId, p.deliveryId, 'session'); await p.answer('allowed-once', { retention });
  const once = await first; once.consume(); once.finish();
  const second = start(), automatic = await tab.next(), permit = grants.permit(tab.peer, automatic.requestId, automatic.deliveryId);
  assert.ok(permit); await automatic.answer('allowed-once', { permit }); const lease = await second;
  withdraw = true; assert.throws(() => lease.consume()); lease.finish();
});

test('native web origin grants dispatch the original HTTP provider and preserve redirects and late revocation', { timeout: 15000 }, async t => {
  const requests = [];
  const server = createServer((req, res) => { requests.push(req.url); if (req.url === '/cross') { res.writeHead(302, { location: 'http://elsewhere.invalid/' }); res.end(); }
    else if (req.url === '/redirect') { res.writeHead(302, { location: '/second' }); res.end(); }
    else { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('owned response'); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const f = await fixture(t), tab = await f.tab();
  await f.host.plugin(WebRuntime, {}).await();
  f.host.web.registerFetchProvider(new HttpFetchProvider({ maxResponseBytes: 1000, maxBodyChars: 1000, timeoutMs: 2000, maxRedirects: 3, userAgent: 'owned-fixture' }, async () => [{ address: '127.0.0.1', family: 4 }]));
  const tool = f.host.plugin(ManagedWeb, { fetch: true }); await tool.await(); assert.equal(tool.state, 2);
  let now = 0;
  const grants = new TemporaryPermissionGrants(f.host.approval, f.host.typertGateway, () => now); t.after(() => grants.dispose());
  f.host.on('tools/pre-execute', () => ({ kind: 'ask', reason: 'owned web request' }), { global: true });
  const session = new AbortController();
  installTemporaryWebPermissions(f.host, { grants, capture(exec) { return { owner: f.host, generation: 1, sessionSignal: session.signal,
    assertIntegrity() { assert.equal(f.host.agents.get(exec.agent.id), exec.agent); exec.signal.throwIfAborted(); }, assertProgramAllowed() {} }; } });
  const invoke = url => f.host.tools.execute({ name: 'web_fetch', arguments: { url }, agent: f.agent, callId: 'same-web-call', signal: new AbortController().signal });
  const pending = work => Promise.race([tab.next(), work.then(result => { throw new Error(`No native pending: ${JSON.stringify(result)}`); })]);
  const first = invoke(`${origin}/first`), p = await pending(first);
  assert.deepEqual(requests, []);
  const retention = grants.retain(tab.peer, p.requestId, p.deliveryId, '15min'); await p.answer('allowed-once', { retention });
  assert.equal((await first).isError, false); assert.deepEqual(requests, ['/first']);
  async function automatic(path) {
    const work = invoke(`${origin}${path}`), p = await pending(work), permit = grants.permit(tab.peer, p.requestId, p.deliveryId);
    assert.ok(permit); await p.answer('allowed-once', { permit }); return work;
  }
  assert.equal((await automatic('/redirect')).isError, false); assert.deepEqual(requests, ['/first', '/redirect', '/second']);
  assert.equal((await automatic('/cross')).isError, true); assert.deepEqual(requests, ['/first', '/redirect', '/second', '/cross']);
  const different = invoke(`http://localhost:${server.address().port}/`), dp = await pending(different);
  assert.equal(grants.permit(tab.peer, dp.requestId, dp.deliveryId), null); await dp.answer('rejected'); assert.equal((await different).isError, true);
  const stop = Promise.withResolvers(), release = Promise.withResolvers();
  const off = f.host.on('tools/execute', async (_exec, next) => { stop.resolve(); await release.promise; return next(); }, { global: true });
  const revoked = automatic('/revoked'); await stop.promise;
  grants.revoke(f.agent, grants.list(f.agent)[0].id); now = 900001; release.resolve(); assert.equal((await revoked).isError, true); off();
  assert.deepEqual(requests, ['/first', '/redirect', '/second', '/cross']);
});
