import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { Context } from '@deepseek-ai/cordis';
import { AgentRegistry } from '@deepseek-ai/dsh-agent';
import { AgentLoop } from '@deepseek-ai/dsh-agent-loop';
import { SessionStore, SessionId } from '@deepseek-ai/dsh-session';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { LlmRuntime } from '@deepseek-ai/dsh-llm';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { ApprovalService, setApprovalPolicy } from '@deepseek-ai/dsh-user-approval';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import * as RemoteClient from '@deepseek-ai/dsh-api-gateway/client';
import * as Remotes from '@deepseek-ai/dsh-api-remotes';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { installConnection } from '@deepseek-ai/dsh-client-connection/client';
import { RemoteAccessService } from '@deepseek-ai/dsh-api-remote-access';
import { TemporaryPermissionGrants } from '../src/permission-temporary-grants.ts';
import { permissionApprovalAdapter } from '../src/permission-control.ts';
import { registerTemporaryPermissionRpc } from '../src/permission-temporary-rpc.ts';
import { temporaryPermissionClient, retainAndAnswer, answerWithTemporaryPermit } from '../src/client/temporary-permission-client.ts';
import { installPermissionExecArgv, effectiveArgvEnvironment } from '../src/permission-exec-argv.ts';
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local';
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess';
import { SandboxPolicyService, setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy';
import { mkdtemp, mkdir, writeFile, realpath, rm, symlink, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local';
import * as ManagedFs from '../src/permission-fs.ts';
import * as ManagedSearch from '../src/permission-fs-search.ts';
import { installTemporaryFilePermissions } from '../src/permission-temporary-files.ts';
import { installTemporaryPermissions } from '../src/permission-temporary-install.ts';
import { PermissionRulesRuntimeSync } from '../src/permission-rules.ts';
import { resolvePermissionControl } from '../src/permission-settings.ts';

const require = createRequire(import.meta.url);
const uiPath = join(dirname(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-client-ui-approval/package.json'))), 'lib/client.js');
let ui;
export async function nativeUi() {
  if (ui) return ui;
  vm.runInNewContext(await readFile(uiPath, 'utf8'), { window: { __ModuleLoader__: { load({ factory }) {
    ui = factory(name => name === '@deepseek-ai/dsh-client-ui-primitives' ? {} : require(name));
  } } }, Promise, AbortSignal, Error, Symbol });
  return ui;
}
export async function fixture(t, cwd = process.cwd(), beforeAgent) {
  const host = new Context(), handles = [], clients = [];
  for (const [plugin, config] of [[AgentRegistry], [SessionStore], [SessionProjectionRegistry], [LlmRuntime], [SystemPrompt, {}], [ToolRuntime, { mode: 'native' }], [ApprovalService, { policy: 'ask' }], [TypertRegistry], [RemoteAccessService], [TypertGatewayService, {}], [AgentLoop, {}]]) {
    const fiber = host.plugin(plugin, config); await fiber.await(); assert.equal(fiber.state, 2, plugin.name);
  }
  await host.plugin(Remotes).await();
  const browserPeer = new Peer(host, { principal: { kind: 'owner' } });
  host.provide('connection', { browserPeer, rpc: { intercept() { return async () => {}; } } });
  await beforeAgent?.(host);
  const handle = await host.agents.create({ sessionId: SessionId(crypto.randomUUID()), meta: { cwd }, agentOptions: { provider: 'local-synthetic', model: 'local-synthetic' } });
  handles.push(handle); const agent = handle.agent;
  agent.session.append('turn/start', { turn: 1 });
  t.after(async () => { for (const tab of clients) await tab.close(); await browserPeer.dispose(); for (const h of handles) await h.dispose(); await host.fiber.dispose(); });
  async function tab({ legacy = false, historyRequired = false } = {}) {
    const client = new Context(), abort = new AbortController(), ready = Promise.withResolvers(), pending = [], waiters = [];
    const peer = browserPeer;
    let transportError, observedFailure = false;
    const failed = Promise.withResolvers();
    client.provide('typert', { contexts: { getClient() { return { resolve(id) { return id === agent.id ? client : undefined; } }; } } });
    installConnection(client, {
      interactions: 'answer', transport: { ownsHost: true, rpc: {
        async call(_channel, endpoint, payload, signal = abort.signal) {
          if (legacy && endpoint === '$events/approval-capability') return { ok: false, error: { message: 'unsupported' } };
          const result = await host.typertGateway.dispatchRpc(endpoint, structuredClone(payload), signal, peer);
          if (endpoint === '$events/result' && !result.ok) { transportError = new Error(result.error.message); failed.resolve(transportError); }
          return result;
        },
        async *open(_channel, endpoint, payload, signal) {
          const source = await host.typertGateway.wireStream.open(endpoint, structuredClone(payload), (async function* () {})(), peer, signal);
          for await (const frame of source) yield structuredClone(frame);
        },
      } },
    });
    const offReady = client.connection.generation.subscribe(() => { if (client.connection.generation.getSnapshot()) ready.resolve(); });
    client.provide('sessions', { scopeOf() { return agent.id; } });
    client.provide('uiSession', { registerPendingInteraction() { return p => {
      const waiter = waiters.shift(); if (waiter) waiter(p); else pending.push(p); return () => {};
    }; } });
    client.provide('slots', { inject() {}, register() {} });
    client.provide('locale', { register() { return () => {}; } });
    await client.plugin(RemoteClient, { historyRequired }).await();
    const uiFiber = client.plugin(await nativeUi()); await uiFiber.await();
    await ready.promise; offReady();
    const value = { client, peer, pending, uiFiber, next() { return pending.length ? Promise.resolve(pending.shift()) : new Promise(resolve => waiters.push(resolve)); },
      async failure() { const error = await failed.promise; observedFailure = true; return error; },
      async close() { abort.abort(); await client.fiber.dispose(); if (transportError && !observedFailure) throw transportError; } };
    clients.push(value); return value;
  }
  function request(signal = new AbortController().signal) {
    let id;
    const req = { agent, toolName: 'owned-exec', callId: 'same-call', signal };
    const done = host.approval.request(req, { opened(value) { id = value; } });
    return { req, id, done, receipt() { return host.approval.settlement(id); } };
  }
  return { host, agent, tab, request, browserPeer };
}

test('native first-wins and Gateway actual delivery bind final audit receipt across tabs', { timeout: 15000 }, async t => {
  const f = await fixture(t), a = await f.tab(), b = await f.tab();
  const first = f.request(), second = f.request();
  assert.notEqual(first.id, second.id);
  const ap = await a.next(), bp = await b.next(), ap2 = await a.next(), bp2 = await b.next();
  assert.equal(ap.requestId, first.id); assert.equal(bp.requestId, first.id);
  assert.notEqual(ap.deliveryId, bp.deliveryId); assert.equal(ap2.requestId, second.id);
  await ap.answer('allowed-once'); await assert.rejects(ap.answer('rejected'));
  assert.equal(await first.done, 'allowed-once');
  const receipt = first.receipt();
  assert.equal(receipt.source, 'operator'); assert.equal(receipt.winner.deliveryId, ap.deliveryId);
  assert.equal(f.agent.session.eventAt(receipt.auditSeq).type, 'approval/decided');
  assert.equal(bp.answerable, false);
  await bp2.answer('rejected'); assert.equal(await second.done, 'rejected');
  assert.equal(ap2.answerable, false);
});

test('required Client keeps the native approval delivery pending until scope preparation succeeds', { timeout: 15000 }, async t => {
  const f = await fixture(t), a = await f.tab({ historyRequired: true });
  assert.equal(typeof a.client.remote.$registerHistoryPreparation, 'function');
  const reached = Promise.withResolvers(), proceed = Promise.withResolvers();
  let lookups = 0;
  const get = a.client.typert.contexts.getClient;
  a.client.typert.contexts.getClient = function (...args) {
    const adapter = get.apply(this, args);
    return { ...adapter, resolve(id) { lookups++; return adapter.resolve(id); } };
  };
  const remove = a.client.remote.$registerHistoryPreparation({ assertCurrent() {}, async prepare(signal) {
    reached.resolve(); await proceed.promise; signal.throwIfAborted();
    return { support: { protocol: 'dsmm-history-open-1', host: 'synthetic-host', guard: 'synthetic-guard' }, signal,
      assertCurrent() { signal.throwIfAborted(); } };
  } });
  const request = f.request();
  let settled = false;
  void request.done.then(() => { settled = true; });
  await reached.promise;
  assert.equal(lookups, 0); assert.equal(a.pending.length, 0);
  assert.equal(settled, false);
  proceed.resolve();
  const pending = await a.next();
  assert.equal(lookups, 1);
  await pending.answer('allowed-once');
  assert.equal(await request.done, 'allowed-once');
  assert.equal(request.receipt().winner.source, 'operator');
  remove();
  const unavailable = f.request();
  assert.equal(await unavailable.done, 'unavailable');
  assert.equal(lookups, 1); assert.equal(a.pending.length, 0);
});

test('required Client cancels native scope preparation without resolving an Agent or answering next', { timeout: 15000 }, async t => {
  const f = await fixture(t), a = await f.tab({ historyRequired: true });
  assert.equal(typeof a.client.remote.$registerHistoryPreparation, 'function');
  const reached = Promise.withResolvers();
  let lookups = 0;
  a.client.typert.contexts.getClient = () => ({ resolve() { lookups++; throw new Error('Unexpected scope lookup'); } });
  a.client.remote.$registerHistoryPreparation({ assertCurrent() {}, async prepare(signal) {
    reached.resolve();
    await new Promise((_, reject) => {
      signal.throwIfAborted(); signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  } });
  const abort = new AbortController(), request = f.request(abort.signal);
  await reached.promise;
  abort.abort();
  assert.equal(await request.done, 'cancelled');
  assert.equal(lookups, 0); assert.equal(a.pending.length, 0);
});

test('unknown Host layers break continuity without changing native outcomes; never and cancellation remain native', { timeout: 15000 }, async t => {
  const f = await fixture(t), a = await f.tab();
  const remove = f.host.on('approval/request', async (_req, next) => { await next(); return 'allowed-once'; }, { prepend: true, global: true });
  const r = f.request(), p = await a.next(); await p.answer('allowed-once');
  assert.equal(await r.done, 'allowed-once'); assert.equal(r.receipt().source, 'unknown');
  assert.equal(r.receipt().winner.source, 'operator'); remove();
  const alreadyPending = f.request(), stillAnswerable = await a.next();
  setApprovalPolicy(f.agent.session, 'never'); assert.equal(stillAnswerable.answerable, true);
  await stillAnswerable.answer('allowed-once'); assert.equal(await alreadyPending.done, 'allowed-once');
  const never = f.request(); assert.equal(await never.done, 'rejected'); assert.equal(never.receipt().winner, undefined);
  setApprovalPolicy(f.agent.session, 'ask'); const abort = new AbortController(), cancelled = f.request(abort.signal), pending = await a.next();
  abort.abort(); assert.equal(await cancelled.done, 'cancelled');
  await Promise.allSettled([pending.answer('allowed-once')]);
  assert.equal(cancelled.receipt().outcome, 'cancelled'); assert.equal(cancelled.receipt().winner, undefined);
});

test('permit validation occurs on the actual winner, not issuance; old peers remain unknown manual once', { timeout: 15000 }, async t => {
  const f = await fixture(t), a = await f.tab(), b = await f.tab();
  let live;
  f.host.typertGateway.registerApprovalPermits((delivery, permit) => delivery === live?.delivery && permit === live?.permit);
  const r = f.request(), ap = await a.next(), bp = await b.next();
  live = { delivery: f.host.typertGateway.approvalDelivery(a.peer, ap.requestId, ap.deliveryId), permit: crypto.randomUUID() };
  assert.ok(live.delivery); const foreign = new Peer(f.host, { principal: { kind: 'owner' } }); t.after(() => foreign.dispose());
  assert.equal(f.host.typertGateway.approvalDelivery(foreign, ap.requestId, ap.deliveryId), undefined);
  await bp.answer('allowed-once'); assert.equal(await r.done, 'allowed-once'); assert.equal(r.receipt().source, 'operator');
  const auto = f.request(), ap2 = await a.next(); await b.next();
  live = { delivery: f.host.typertGateway.approvalDelivery(a.peer, ap2.requestId, ap2.deliveryId), permit: crypto.randomUUID() };
  await ap2.answer('allowed-once', { permit: live.permit }); assert.equal(await auto.done, 'allowed-once');
  assert.equal(auto.receipt().source, 'temporary'); assert.equal(auto.receipt().winner.automatic, true);
  await assert.rejects(ap2.answer('allowed-once'));
  const legacy = await f.tab({ legacy: true }), old = f.request(); await a.next(); await b.next(); const oldp = await legacy.next();
  assert.equal(oldp.requestId, undefined); await assert.rejects(oldp.answer('allowed-once', { permit: live.permit }));
  await oldp.answer('allowed-once'); assert.equal(await old.done, 'allowed-once'); assert.equal(old.receipt().source, 'unknown');
  const invalid = f.request(), invalidPending = await a.next(); await b.next(); await legacy.next();
  await invalidPending.answer('allowed-once', { permit: 'not-issued-by-host' });
  assert.equal(await invalid.done, 'unavailable'); assert.equal(invalid.receipt().winner, undefined);
  assert.ok(await a.failure() instanceof Error);
});

function execution(f, target = 'owned-exact-argv') {
  const sessionSignal = new AbortController().signal;
  return { token: Symbol(), agent: f.agent, owner: f.host, generation: 1, registration: execution, provider: execution,
    sessionId: f.agent.id, tool: 'owned-exec', project: process.cwd(), target, summary: target, reusable: true,
    signal: new AbortController().signal, sessionSignal, assertIntegrity() {}, assertReusable() {} };
}
test('grants are created only by winning audited operator delivery; auto loses, TTL, revocation and source loss fence consumption', { timeout: 15000 }, async t => {
  const f = await fixture(t), a = await f.tab(), b = await f.tab();
  let now = 0, executions = 0;
  const grants = new TemporaryPermissionGrants(f.host.approval, f.host.typertGateway, () => now); t.after(() => grants.dispose());
  function call() { const exec = execution(f); const done = grants.approve({ agent: f.agent, toolName: exec.tool, callId: 'same-call', signal: exec.signal }, exec); return done; }
  const initial = call(), ap = await a.next(), bp = await b.next();
  grants.retain(a.peer, ap.requestId, ap.deliveryId, '15min');
  await bp.answer('allowed-once'); const once = await initial; once.consume(); executions++; once.finish();
  assert.equal(grants.list(f.agent).length, 0);
  const sameTab = call(), samePending = await a.next(); await b.next();
  const losingIntent = grants.retain(a.peer, samePending.requestId, samePending.deliveryId, 'session');
  await samePending.answer('allowed-once'); await assert.rejects(samePending.answer('allowed-once', { retention: losingIntent }));
  (await sameTab).finish(); assert.equal(grants.list(f.agent).length, 0);
  const retained = call(), rp = await a.next(); await b.next(); const retention = grants.retain(a.peer, rp.requestId, rp.deliveryId, '15min');
  await rp.answer('allowed-once', { retention }); const first = await retained; first.consume(); executions++; first.finish();
  assert.equal(grants.list(f.agent).length, 1);
  const automatic = call(), auto = await a.next(); await b.next();
  const permit = grants.permit(a.peer, auto.requestId, auto.deliveryId); assert.ok(permit);
  await auto.answer('allowed-once', { permit }); const held = await automatic;
  now = 900_000; assert.throws(() => held.consume()); held.finish(); assert.equal(executions, 2);
  const renew = call(), np = await a.next(); await b.next(); const renewal = grants.retain(a.peer, np.requestId, np.deliveryId, 'session');
  await np.answer('allowed-once', { retention: renewal }); (await renew).finish();
  const manualWins = call(), loser = await a.next(), manual = await b.next();
  const unused = grants.permit(a.peer, loser.requestId, loser.deliveryId); assert.ok(unused);
  await manual.answer('allowed-once'); const manualLease = await manualWins;
  for (const grant of grants.list(f.agent)) grants.revoke(f.agent, grant.id);
  manualLease.consume(); executions++; manualLease.finish(); assert.equal(executions, 3);
  const seed = call(), sp = await a.next(); await b.next(); const seedRetention = grants.retain(a.peer, sp.requestId, sp.deliveryId, 'session');
  await sp.answer('allowed-once', { retention: seedRetention }); (await seed).finish();
  const remove = f.host.on('approval/request', async (_req, next) => next(), { prepend: true, global: true });
  const lost = call(), lp = await a.next(); await b.next();
  const failed = assert.rejects(lost);
  await lp.answer('allowed-once', { permit: grants.permit(a.peer, lp.requestId, lp.deliveryId) }); await failed; remove();
  const revoke = call(), vp = await a.next(); await b.next();
  await vp.answer('allowed-once', { permit: grants.permit(a.peer, vp.requestId, vp.deliveryId) }); const revoked = await revoke;
  grants.revoke(f.agent, grants.list(f.agent)[0].id); assert.throws(() => revoked.consume()); revoked.finish();
});

test('Client unknown layers and multi-layer Host rewrites preserve outcome but cannot retain provenance; audit failure publishes no receipt', { timeout: 15000 }, async t => {
  const f = await fixture(t), a = await f.tab();
  // Re-register the native terminal after the untrusted listener so it remains downstream.
  await a.uiFiber.dispose();
  a.client.remote.$on('approval/request', async (_req, next) => { await next(); return 'allowed-once'; });
  await a.client.plugin(await nativeUi()).await();
  const r = f.request(), p = await a.next(); await p.answer('allowed-once');
  assert.equal(await r.done, 'allowed-once'); assert.equal(r.receipt().source, 'unknown');
  const outer = f.host.on('approval/request', async (_req, next) => { await next(); return 'allowed-once'; }, { prepend: true, global: true });
  const middle = f.host.on('approval/request', async (_req, next) => { await next(); return 'rejected'; }, { prepend: true, global: true });
  const rewritten = f.request(), rp = await a.next(); await rp.answer('allowed-once');
  assert.equal(await rewritten.done, 'rejected'); assert.equal(rewritten.receipt().source, 'unknown'); middle(); outer();
  const originalAppend = f.agent.session.append, auditFailure = new Error('owned audit failure');
  f.agent.session.append = function(type, data) { if (type === 'approval/decided') throw auditFailure; return originalAppend.call(this, type, data); };
  const failed = f.request(), rejected = assert.rejects(failed.done, error => error === auditFailure), fp = await a.next(); await fp.answer('allowed-once'); await rejected;
  assert.equal(failed.receipt(), undefined); f.agent.session.append = originalAppend;
});

test('audited DSMM passthrough and native terminal preserve source; unknown outcome recovery and repeated next do not', { timeout: 15000 }, async t => {
  const f = await fixture(t), a = await f.tab();
  const audited = f.host.on('approval/request', permissionApprovalAdapter(f.host, async (_req, next) => next()), { prepend: true, global: true });
  let tail = 0;
  const terminalTail = f.host.on('approval/request', async () => { tail++; return 'rejected'; }, { global: true });
  const native = f.request(), p = await a.next(); await p.answer('allowed-once');
  assert.equal(await native.done, 'allowed-once'); assert.equal(native.receipt().source, 'operator'); assert.equal(tail, 0); audited(); terminalTail();
  const middle = f.host.on('approval/request', async (_req, next) => { await next(); return 'rejected'; }, { prepend: true, global: true });
  const outer = f.host.on('approval/request', async (_req, next) => { await next(); return 'allowed-once'; }, { prepend: true, global: true });
  const rewritten = f.request(), rp = await a.next(); await rp.answer('allowed-once');
  assert.equal(await rewritten.done, 'allowed-once'); assert.equal(rewritten.receipt().source, 'unknown'); outer(); middle();
  const throws = f.host.on('approval/request', async (_req, next) => { await next(); throw new Error('owned post-next'); }, { prepend: true, global: true });
  const catches = f.host.on('approval/request', async (_req, next) => { try { return await next(); } catch { return 'allowed-once'; } }, { prepend: true, global: true });
  const recovered = f.request(), cp = await a.next(); await cp.answer('allowed-once');
  assert.equal(await recovered.done, 'allowed-once'); assert.equal(recovered.receipt().source, 'unknown'); catches(); throws();
  const twice = f.host.on('approval/request', async (_req, next) => { const result = await next(); await next(); return result; }, { prepend: true, global: true });
  const double = f.request(), dp = await a.next(); await dp.answer('allowed-once');
  assert.equal(await double.done, 'allowed-once'); assert.equal(double.receipt().source, 'unknown'); twice();
  const veto = f.host.on('approval/request', async (_req, next) => { await next(); return 'rejected'; }, { prepend: true, global: true });
  const denied = f.request(), vp = await a.next(); await vp.answer('allowed-once');
  assert.equal(await denied.done, 'rejected'); assert.equal(denied.receipt().source, 'unknown'); veto();
  let lateNext;
  const unawaited = f.host.on('approval/request', (_req, next) => { lateNext = next(); return 'allowed-once'; }, { prepend: true, global: true });
  const late = f.request(); assert.equal(await late.done, 'allowed-once'); const latePending = await a.next();
  await latePending.answer('allowed-once'); await lateNext;
  assert.equal(late.receipt().source, 'unknown'); assert.equal(late.receipt().winner, undefined); unawaited();
});

test('operator Client RPC retains, automatically answers the original pending, lists and synchronously revokes through Gateway', { timeout: 15000 }, async t => {
  const f = await fixture(t), a = await f.tab();
  const grants = new TemporaryPermissionGrants(f.host.approval, f.host.typertGateway); t.after(() => grants.dispose());
  registerTemporaryPermissionRpc(f.host, grants);
  const remote = temporaryPermissionClient(a.client.connection, new AbortController().signal);
  const call = () => { const exec = execution(f); return grants.approve({ agent: f.agent, toolName: exec.tool, callId: 'same-call', signal: exec.signal }, exec); };
  const first = call(), pending = await a.next();
  const view = await remote.request(f.agent.id, { requestId: pending.requestId, deliveryId: pending.deliveryId }); assert.equal(view.reusable, true);
  await retainAndAnswer(pending, remote, '1h', () => true); const lease = await first; lease.consume(); lease.finish();
  const list = await remote.describe(f.agent.id); assert.equal(list.length, 1); assert.equal(list[0].duration, '1h');
  const second = call(), next = await a.next(); await answerWithTemporaryPermit(next, remote, () => true); const auto = await second;
  assert.equal((await remote.revoke(f.agent.id, list[0].id)).length, 0); assert.throws(() => auto.consume()); auto.finish();
  const stranger = new Peer(f.host, { principal: { kind: 'owner' } }); t.after(() => stranger.dispose());
  await assert.rejects(f.host.typertGateway.invoke({ namespace: 'dsmmTemporaryPermissions', method: 'describe', args: { sessionId: f.agent.id }, peer: stranger }));
});

test('structured argv executes through native local provider and consumes exact temporary permission at final handoff', { timeout: 90000 }, async t => {
  const f = await fixture(t), tab = await f.tab();
  const parent = await realpath(process.env.DSMM_APPROVAL_SDK_DIR ?? tmpdir()), owned = await mkdtemp(join(parent, 'dsmm-argv-'));
  t.after(async () => { assert.equal(dirname(await realpath(owned)), parent); await rm(owned, { recursive: true }); });
  await mkdir(join(owned, 'cache')); await mkdir(join(owned, 'tmp'));
  await writeFile(join(owned, 'main.go'), 'package main\nimport("encoding/json";"os")\nfunc main(){cwd,_:=os.Getwd();json.NewEncoder(os.Stdout).Encode(map[string]interface{}{"args":os.Args[1:],"cwd":cwd,"value":os.Getenv("DSMM_ARGV_TEST"),"removed":os.Getenv("DSMM_ARGV_REMOVED")})}\n');
  const program = join(owned, process.platform === 'win32' ? 'owned.exe' : 'owned');
  execFileSync('go', ['build', '-o', program, join(owned, 'main.go')], { cwd: owned, env: { ...scrubbedParentEnv(),
    GOCACHE: join(owned, 'cache'), GOTMPDIR: join(owned, 'tmp'), GOPATH: owned, GOPROXY: 'off', GOTOOLCHAIN: 'local', GOENV: 'off', GOWORK: 'off' }, timeout: 60000 });
  await f.host.plugin(LocalSubprocessRuntime).await();
  await f.host.plugin(SandboxPolicyService, { mode: 'danger-full-access', workspaceRoot: owned }).await();
  const grants = new TemporaryPermissionGrants(f.host.approval, f.host.typertGateway); t.after(() => grants.dispose());
  const sessionLifetime = new AbortController(); let denied = false;
  const previousRemoved = process.env.DSMM_ARGV_REMOVED; process.env.DSMM_ARGV_REMOVED = 'must-not-inherit';
  t.after(() => { if (previousRemoved === undefined) delete process.env.DSMM_ARGV_REMOVED; else process.env.DSMM_ARGV_REMOVED = previousRemoved; });
  const dispose = installPermissionExecArgv(f.host, { grants, environment: { DSMM_ARGV_TEST: 'controlled', DSMM_ARGV_REMOVED: undefined },
    programKind: path => path === program ? 'native' : 'unknown', capture() { return { owner: f.host, generation: 1, sessionSignal: sessionLifetime.signal,
      assertIntegrity() {}, assertProgramAllowed() { if (denied) throw new Error('owned role deny'); } }; } });
  t.after(dispose);
  const invoke = (args = ['literal space', ';not-shell', '子命令']) => f.host.tools.execute({ name: 'dsmm_exec_argv', arguments: { executable: program, args, cwd: owned }, agent: f.agent, callId: 'same-call', signal: new AbortController().signal });
  const pendingFor = work => Promise.race([tab.next(), work.then(result => { throw new Error(`Tool completed without approval: ${JSON.stringify(result)}`); })]);
  const first = invoke(), p = await pendingFor(first); const retention = grants.retain(tab.peer, p.requestId, p.deliveryId, 'session'); await p.answer('allowed-once', { retention });
  const result = await first; assert.equal(result.isError, false, JSON.stringify(result));
  assert.deepEqual(JSON.parse(result.value.stdout), { args: ['literal space', ';not-shell', '子命令'], cwd: owned, value: 'controlled', removed: '' });
  assert.equal(grants.list(f.agent).length, 1);
  const second = invoke(), p2 = await pendingFor(second), permit = grants.permit(tab.peer, p2.requestId, p2.deliveryId); assert.ok(permit);
  await p2.answer('allowed-once', { permit }); assert.equal((await second).value.exitCode, 0);
  const changedArguments = invoke(['literal space', ';not-shell', '子命令', 'extra']), different = await pendingFor(changedArguments);
  assert.equal(grants.permit(tab.peer, different.requestId, different.deliveryId), null);
  await different.answer('rejected'); assert.equal((await changedArguments).isError, true);
  const changed = invoke(), p3 = await pendingFor(changed), autoPermit = grants.permit(tab.peer, p3.requestId, p3.deliveryId);
  const barrier = Promise.withResolvers(), release = Promise.withResolvers();
  const remove = f.host.on('tools/execute', async (_exec, next) => { barrier.resolve(); await release.promise; return next(); }, { global: true });
  await p3.answer('allowed-once', { permit: autoPermit }); await barrier.promise;
  const previousAmbient = process.env.DSMM_ARGV_NEW_AMBIENT; process.env.DSMM_ARGV_NEW_AMBIENT = 'new';
  try { release.resolve(); assert.equal((await changed).isError, true); } finally {
    if (previousAmbient === undefined) delete process.env.DSMM_ARGV_NEW_AMBIENT; else process.env.DSMM_ARGV_NEW_AMBIENT = previousAmbient;
    remove();
  }
  const manual = invoke(), manualPending = await pendingFor(manual); denied = true;
  await manualPending.answer('allowed-once'); assert.equal((await manual).value.exitCode, 0);
  assert.equal((await invoke()).isError, true); denied = false;
  setSandboxMode(f.agent.session, 'workspace-write');
  const confined = invoke(), cp = await pendingFor(confined); await cp.answer('allowed-once');
  assert.equal((await confined).isError, true);
});

test('composed argv refuses unresolved command and file denies before requesting native approval', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  await f.host.plugin(LocalSubprocessRuntime).await();
  await f.host.plugin(SandboxPolicyService, { mode: 'danger-full-access', workspaceRoot: process.cwd() }).await();
  const session = new AbortController(), owner = {};
  const rules = new PermissionRulesRuntimeSync({ revision: '0', policy: resolvePermissionControl() }, () => {});
  const installed = installTemporaryPermissions(f.host, {
    core: { authority: {
      current() { return { owner, permissionRevision: 1 }; },
      captureIntegrity() { return { signal: session.signal, assertCurrent() {} }; },
      assertCurrent() {},
    } },
    roles: { assertToolExecution() {}, toolDenial() {} },
    rules, argv: { programKind: () => 'unknown' },
  });
  t.after(() => { installed.dispose(); rules.retire(); session.abort(); });
  let approvals = 0;
  f.host.on('approval/request', () => { approvals++; return 'rejected'; }, { prepend: true, global: true });
  const executable = await realpath(process.execPath), cwd = await realpath(process.cwd());
  const invoke = () => f.host.tools.execute({ name: 'dsmm_exec_argv', arguments: { executable, args: ['--version'], cwd },
    agent: f.agent, callId: 'composed-argv', signal: new AbortController().signal });
  const rule = (match, revoked = false, action = 'deny') => ({ id: 'restriction', action, match, revoked, revision: 1,
    source: { kind: 'user-import', label: 'operator rules' } });
  let revision = 0;
  const policy = async input => {
    const update = rules.begin(String(revision));
    await rules.commit(update, { revision: String(++revision), policy: resolvePermissionControl(input) }, async () => {});
  };
  for (const restriction of [
    { outsideReads: 'deny' },
    { rules: [rule({ kind: 'outside-read', path: cwd, scope: 'tree' })] },
    { rules: [rule({ kind: 'shell', executable: 'operator-shell', command: 'restricted command', workingDirectory: cwd })] },
  ]) {
    await policy(restriction);
    const before = approvals;
    assert.equal((await invoke()).isError, true);
    assert.equal(approvals, before, 'an unresolved hard restriction must not become an answerable argv request');
  }
  for (const permitted of [
    {},
    { rules: [rule({ kind: 'outside-read', path: cwd, scope: 'tree' }, true)] },
    { rules: [rule({ kind: 'shell', executable: 'operator-shell', command: 'unrelated question', workingDirectory: cwd }, false, 'ask')] },
    { rules: [rule({ kind: 'webFetch' })] },
  ]) {
    await policy(permitted);
    const before = approvals;
    assert.equal((await invoke()).isError, true, 'the native operator still rejects this request');
    assert.equal(approvals, before + 1);
  }
});

test('effective argv environment uses overrides and tombstones and refuses ambiguous Windows inherited keys', () => {
  assert.equal(effectiveArgvEnvironment({ REMOVE: undefined, KEEP: 'override' }, { REMOVE: 'ambient', KEEP: 'ambient' }),
    effectiveArgvEnvironment({}, { KEEP: 'override' }));
  if (process.platform === 'win32') {
    assert.throws(() => effectiveArgvEnvironment({}, { Path: 'a', PATH: 'b' }));
    assert.equal(effectiveArgvEnvironment({ path: 'fixed' }, { Path: 'a', PATH: 'b' }), effectiveArgvEnvironment({}, { PATH: 'fixed' }));
  }
});

async function fileFixture(t) {
  const parent = await realpath(tmpdir()), owned = await mkdtemp(join(parent, 'dsmm-file-permissions-'));
  const workspace = join(owned, 'workspace'), outside = join(owned, 'outside');
  await mkdir(workspace); await mkdir(outside);
  const f = await fixture(t, workspace), tab = await f.tab();
  t.after(async () => { assert.equal(dirname(await realpath(owned)), parent); await rm(owned, { recursive: true }); });
  const { default: WorkingDirectory } = await import('@deepseek-ai/dsh-working-directory');
  for (const [plugin, config] of [[LocalFileSystem, { cwd: workspace }], [LocalSubprocessRuntime], [WorkingDirectory, { defaultDirectory: workspace }],
    [SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: workspace }], [ManagedFs, {}], [ManagedSearch, { sampleOverCapGlobResults: false }]]) {
    const fiber = f.host.plugin(plugin, config); await fiber.await(); assert.equal(fiber.state, 2, plugin.name);
  }
  let now = 0, denied = false;
  const grants = new TemporaryPermissionGrants(f.host.approval, f.host.typertGateway, () => now); t.after(() => grants.dispose());
  registerTemporaryPermissionRpc(f.host, grants);
  const remote = temporaryPermissionClient(tab.client.connection, new AbortController().signal);
  f.host.on('tools/pre-execute', async () => denied ? { kind: 'deny' } : { kind: 'ask', reason: 'owned file request' }, { global: true });
  const session = new AbortController();
  installTemporaryFilePermissions(f.host, { grants, capture(exec) {
    const agent = exec.agent;
    return { owner: f.host, generation: 1, sessionSignal: session.signal,
      assertIntegrity() { assert.equal(f.host.agents.get(agent.id), agent); exec.signal.throwIfAborted(); },
      assertProgramAllowed() { if (denied) throw new Error('owned deny'); } };
  } });
  const invoke = (name, args) => f.host.tools.execute({ name, arguments: args, agent: f.agent, callId: 'same-file-call', signal: new AbortController().signal });
  const pending = work => Promise.race([tab.next(), work.then(result => { throw new Error(`Tool finished without approval: ${JSON.stringify(result)}`); })]);
  async function manual(name, args, duration = 'session', scope = 'exact') {
    const work = invoke(name, args), p = await pending(work);
    await retainAndAnswer(p, remote, duration, () => true, scope);
    const result = await work; assert.equal(result.isError, false, JSON.stringify(result)); return result;
  }
  async function automatic(name, args) {
    const work = invoke(name, args), p = await pending(work);
    const permit = await remote.permit(f.agent.id, { requestId: p.requestId, deliveryId: p.deliveryId }); assert.ok(permit);
    await p.answer('allowed-once', { permit }); return work;
  }
  return { ...f, tab, workspace, outside, grants, remote, invoke, pending, manual, automatic,
    advance(ms) { now += ms; }, deny() { denied = true; } };
}

test('temporary files use actual native read/write/edit and exact/tree grants through native Client answers', { timeout: 20000 }, async t => {
  const f = await fileFixture(t), a = join(f.workspace, 'a.txt'), b = join(f.workspace, 'b.txt');
  await writeFile(a, 'needle first'); await writeFile(b, 'needle second');
  await f.manual('read', { file_path: a }, 'session', 'tree');
  assert.equal((await f.automatic('read', { file_path: b })).isError, false);
  const elsewhere = join(f.outside, 'other.txt'); await writeFile(elsewhere, 'outside');
  const work = f.invoke('read', { file_path: elsewhere }), p = await f.pending(work);
  assert.equal(f.grants.permit(f.tab.peer, p.requestId, p.deliveryId), null); await p.answer('rejected'); assert.equal((await work).isError, true);
  await f.manual('write', { file_path: a, content: 'needle written' });
  assert.equal((await f.automatic('write', { file_path: a, content: 'needle replaced' })).isError, false);
  assert.equal(await readFile(a, 'utf8'), 'needle replaced');
  await f.manual('edit', { file_path: a, old_string: 'replaced', new_string: 'edited' });
  assert.equal((await f.automatic('edit', { file_path: a, old_string: 'edited', new_string: 'again' })).isError, false);
  assert.equal(await readFile(a, 'utf8'), 'needle again');
  await f.manual('write', { file_path: b, content: 'tree write' }, 'session', 'tree');
  const created = join(f.workspace, 'created.txt');
  assert.equal((await f.automatic('write', { file_path: created, content: 'new child in approved tree' })).isError, false);
  assert.equal(await readFile(created, 'utf8'), 'new child in approved tree');
  assert.equal((await f.invoke('write', { file_path: elsewhere, content: 'must not write' })).isError, true);
  assert.equal(await readFile(elsewhere, 'utf8'), 'outside');
  setSandboxMode(f.agent.session, 'read-only');
  assert.equal((await f.invoke('write', { file_path: a, content: 'must not write' })).isError, true);
  assert.equal(await readFile(a, 'utf8'), 'needle again');
});

test('temporary files native glob/grep handoff and late revoke/TTL remain bounded', { timeout: 20000 }, async t => {
  const f = await fileFixture(t), a = join(f.workspace, 'a.txt'); await writeFile(a, 'needle');
  await f.manual('glob', { pattern: '*.txt', path: f.workspace }, '15min');
  assert.equal((await f.automatic('glob', { pattern: '**/*.txt', path: f.workspace })).isError, false);
  await f.manual('grep', { pattern: 'needle', path: f.workspace }, '15min');
  assert.equal((await f.automatic('grep', { pattern: 'needle', include: '*.txt', path: f.workspace })).isError, false);
  await f.manual('write', { file_path: a, content: 'stable' }, '15min');
  let stop = Promise.withResolvers(), release = Promise.withResolvers();
  const off = f.host.on('fs/write-intent', async (_target, _exec, next) => { stop.resolve(); await release.promise; return next(); }, { global: true });
  const writing = f.automatic('write', { file_path: a, content: 'revoked' }); await stop.promise;
  const grant = f.grants.list(f.agent).find(grant => grant.tool === 'write');
  await f.remote.revoke(f.agent.id, grant.id); release.resolve(); assert.equal((await writing).isError, true);
  assert.equal(await readFile(a, 'utf8'), 'stable'); off();
  await f.manual('write', { file_path: a, content: 'stable' }, '15min');
  stop = Promise.withResolvers(); release = Promise.withResolvers();
  const offExpiry = f.host.on('fs/write-intent', async (_target, _exec, next) => { stop.resolve(); await release.promise; return next(); }, { global: true });
  const expiring = f.automatic('write', { file_path: a, content: 'expired' }); await stop.promise;
  f.advance(900001); release.resolve(); assert.equal((await expiring).isError, true);
  assert.equal(await readFile(a, 'utf8'), 'stable'); offExpiry();
  f.deny(); assert.equal((await f.invoke('read', { file_path: a })).isError, true);
});

test('temporary files re-resolve junctions and reject file-directory changes after native answers', { timeout: 20000 }, async t => {
  const f = await fileFixture(t), inside = join(f.workspace, 'inside'), link = join(f.workspace, 'link');
  await mkdir(inside); await writeFile(join(inside, 'item.txt'), 'inside'); await writeFile(join(f.outside, 'item.txt'), 'outside');
  await symlink(inside, link, process.platform === 'win32' ? 'junction' : 'dir');
  const path = join(link, 'item.txt'); await f.manual('read', { file_path: path });
  let stop = Promise.withResolvers(), release = Promise.withResolvers();
  let off = f.host.on('tools/execute', async (_exec, next) => { stop.resolve(); await release.promise; return next(); }, { global: true });
  const swapped = f.automatic('read', { file_path: path }); await stop.promise;
  await unlink(link); await symlink(f.outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  release.resolve(); assert.equal((await swapped).isError, true); off();
  const regular = join(inside, 'item.txt');
  await f.manual('read', { file_path: regular });
  stop = Promise.withResolvers(); release = Promise.withResolvers();
  off = f.host.on('tools/execute', async (_exec, next) => { stop.resolve(); await release.promise; return next(); }, { global: true });
  const replaced = f.automatic('read', { file_path: regular }); await stop.promise;
  await unlink(regular); await mkdir(regular);
  release.resolve(); assert.equal((await replaced).isError, true); off();
});
