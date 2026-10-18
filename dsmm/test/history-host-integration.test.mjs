import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SandboxPolicyService, setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy';
import { ApprovalService, setApprovalPolicy } from '@deepseek-ai/dsh-user-approval';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { RemoteAccessService } from '@deepseek-ai/dsh-api-remote-access';
import * as NativeConnection from '@deepseek-ai/dsh-client-connection';
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol';
import { nativeRoutingFixture } from './native-routing-fixture.ts';
import { hostController, inspect } from './session-activation-fixture.mjs';
import { ProfileStore } from '../src/profile-store.ts';

const require = createRequire(import.meta.url), sdk = createRequire(require.resolve('@deepseek-ai/dsh-client-connection/package.json'));
const { CredentialProvider } = sdk('@deepseek-ai/dsh-credentials');
class MemoryCredentials extends CredentialProvider {
  records = new Map();
  async modifyRecord(key, update) { const value = await update(this.records.get(key)); if (value !== undefined) this.records.set(key, value); return value; }
}
const coldId = SessionId('owned-history-root');
const refused = code => error => remoteErrorOf(error)?.code === 'dsmm-history/refused' && remoteErrorOf(error).details.code === code;
async function fixture(t, { historicalReadOnly = false } = {}) {
  let seedAgent;
  const f = await nativeRoutingFixture({ defaultActive: true, permissionControl: { enabled: false } }, {
    nativePresets: true, nativePermissionSettings: true, managedRuntime: true, spawn: false, persistence: true, fixtureShells: false,
    async beforeDsmm(ctx, create) {
      t.after(async () => { await ctx.fiber.dispose(); });
      await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write' }).await();
      await ctx.plugin(ApprovalService, { policy: 'ask' }).await();
      await ctx.plugin(RemoteAccessService).await();
      await hostController(ctx, false);
      await ctx.plugin(TypertGatewayService, {}).await();
      await ctx.plugin(MemoryCredentials).await();
      await ctx.plugin(NativeConnection).await();
      ctx.provide('webServer', { host: '127.0.0.1' });
      const seed = await create({ agentPreset: 'standard' });
      seedAgent = seed;
      setSandboxMode(seed.session, 'danger-full-access'); setApprovalPolicy(seed.session, 'ask');
      if (historicalReadOnly) {
        seed.session.append('agent-preset/selected', { agentPreset: 'dsmm-reviewer' });
        setApprovalPolicy(seed.session, 'never');
      }
      seed.session.append('session/title', { title: 'Preserved historical title', messageSeqs: [], source: { kind: 'user' } });
      seed.inject(createUserMessage({ content: [{ type: 'text', text: 'Confirmed stored input' }], source: { kind: 'user' } }));
      await ctx.sessionPersistence.flush();
      const old = await inspect(ctx, seed.id);
      const cold = await ctx.sessionPersistence.create({ ...old.header, id: coldId, agentPreset: 'unavailable-historical-preset' });
      try { await cold.append(old.events); } finally { await cold.close(); }
      await ctx.sessionPersistence.flush();
    },
  });
  try {
    assert.ok(f.ctx.get('dsmmHistory'), 'Core must register history RPC against its native dependencies');
    const profiles = f.ctx.dsmmProfileRuntime;
    const content = model => JSON.stringify({ version: 1, id: 'history-current', label: 'Current saved configuration', settings: { roleRouting: { 'dsmm-orchestrator': { primary: { provider: 'fixture', model } } } } });
    const saved = await profiles.save({ id: 'history-current', expectedRevision: null, content: content('history-current-model') });
    const store = ProfileStore.fromCentral(f.home, f.profileDir, f.ctx.dsmmDeploymentConfig.entryId);
    const oldEpoch = 'a'.repeat(64);
    await store.selectSession({ sessionId: coldId, id: null, expectedSelectionRevision: 'absent', expectedAdmissionEpoch: oldEpoch }, oldEpoch, () => undefined,
      { assertCurrent() {}, prepare() {}, committed() {} });
    const invoke = (method, args = {}) => f.ctx.typertGateway.invoke({ namespace: 'dsmmHistory', method, args, peer: f.ctx.connection.browserPeer });
    let writes = 0; const open = f.ctx.sessionPersistence.open;
    f.ctx.sessionPersistence.open = function (...args) { if (args[1] === 'write') writes++; return open.apply(this, args); };
    return { ...f, saved, content, oldEpoch, invoke, seedAgent, get writes() { return writes; },
      preview: () => invoke('preview', { sessionId: coldId, request: { sessionId: coldId, preset: 'standard', profileId: 'history-current' } }),
      confirm: view => invoke('confirm', { sessionId: coldId, request: { sessionId: coldId, intentId: view.intentId, processPending: true, acceptMigration: false } }),
    };
  } catch (error) { await f.dispose(); throw error; }
}

test('real DSMM candidate installs fresh admission and current native policy before the first resumed request', { timeout: 20000 }, async t => {
  const f = await fixture(t);
  const abort = new AbortController();
  try {
    const before = await inspect(f.ctx, coldId);
    await assert.rejects(f.ctx.agents.resume({ resumeSessionId: coldId }));
    assert.equal(f.writes, 0);
    const stream = f.ctx.sessionController.follow({ address: { kind: 'session', sessionId: coldId } }, abort.signal);
    const snapshot = await stream.next();
    assert.equal(snapshot.value.type, 'snapshot');
    assert.ok(snapshot.value.records.some(row => row.type === 'session/title' || row.event?.type === 'session/title'));
    const next = stream.next(); await Promise.resolve();
    assert.equal((await f.invoke('describe', { sessionId: coldId })).execution, 'authorization-required');
    const view = await f.preview();
    assert.equal(view.candidate.model.model, 'history-current-model');
    assert.equal(f.writes, 0); assert.deepEqual(await inspect(f.ctx, coldId), before);
    f.adapter.beforeStream = async () => {
      const agent = f.ctx.agents.get(coldId), admitted = f.ctx.dsmmNativeAdmission.assert(agent);
      assert.notEqual(admitted.epoch, f.oldEpoch);
      assert.equal(admitted.profile.id, 'history-current');
      assert.equal(f.ctx.sandboxPolicy.resolve({ session: agent.session }).mode, 'workspace-write');
      assert.equal(f.ctx.approval.overrideOf(agent.session), 'ask');
    };
    await f.confirm(view);
    assert.equal((await next).done, false); abort.abort(); await stream.return();
    const live = f.ctx.agents.get(coldId); await live.whenIdle();
    assert.equal(f.adapter.calls.length, 1);
    assert.equal(f.adapter.calls[0].model, 'history-current-model');
    assert.equal(f.adapter.calls[0].messages.flatMap(row => row.content).filter(block => block.text === 'Confirmed stored input').length, 1);
    assert.equal((await f.ctx.dsmmProfileRuntime.getSession(live)).canApplyOverlay, false);
    await assert.rejects(f.confirm(view), refused('authorization-required'));
  } finally { abort.abort(); await f.dispose(); }
});

test('current preset selection preserves historical read-only role and native never ceilings', { timeout: 20000 }, async t => {
  const f = await fixture(t, { historicalReadOnly: true });
  try {
    const view = await f.preview(); await f.confirm(view);
    const agent = f.ctx.agents.get(coldId); await agent.whenIdle();
    assert.equal(f.ctx.agentPresets.composedPreset(agent.ctx), 'standard');
    assert.equal(f.ctx.sandboxPolicy.resolve({ session: agent.session }).mode, 'read-only');
    assert.equal(f.ctx.approval.overrideOf(agent.session), 'never');
    assert.equal(f.adapter.calls.length, 1);
  } finally { await f.dispose(); }
});

test('real saved profile and current permission-source changes stale a confirmation before a writer opens', { timeout: 20000 }, async t => {
  const f = await fixture(t);
  try {
    const view = await f.preview(), before = await inspect(f.ctx, coldId);
    await f.ctx.dsmmProfileRuntime.save({ id: 'history-current', expectedRevision: f.saved.revision, content: f.content('updated-model') });
    await assert.rejects(f.confirm(view)); assert.equal(f.writes, 0);
    const next = await f.preview();
    const deployment = f.ctx.dsmmDeploymentConfig, global = await deployment.readGlobal();
    await deployment.saveGlobal({ expectedRevision: global.revision, edits: [{ op: 'set', path: ['guards', 'gitWriteGuard'], value: 'deny' }] }, () => {});
    await assert.rejects(f.confirm(next)); assert.equal(f.writes, 0);
    assert.deepEqual(await inspect(f.ctx, coldId), before);
  } finally { await f.dispose(); }
});

test('real Core revoke after publication refuses ordinary claims and preserves the original pending inbox', { timeout: 20000 }, async t => {
  const f = await fixture(t), entered = Promise.withResolvers(), gate = Promise.withResolvers();
  let held;
  const removed = [];
  f.ctx.on('api-session/removed', id => removed.push(id));
  const detach = f.ctx.on('agent/created', async ({ agent }) => { if (agent.id === coldId) { held = agent; entered.resolve(); await gate.promise; } });
  try {
    const before = await inspect(f.ctx, coldId), view = await f.preview();
    const activation = f.confirm(view), rejected = assert.rejects(activation);
    await entered.promise;
    const events = held.session.snapshotEvents();
    assert.ok((await f.ctx.sessionController.resolveAgent(coldId)).error);
    assert.deepEqual(held.session.snapshotEvents(), events);
    const revoked = f.dsmmFiber.dispose(); gate.resolve();
    await rejected; await revoked;
    assert.equal(f.ctx.agents.get(coldId), undefined);
    assert.deepEqual((await inspect(f.ctx, coldId)).events.filter(event => event.type.startsWith('agent/inbox/')), before.events.filter(event => event.type.startsWith('agent/inbox/')));
    assert.equal(held.inbox.nextStep.length, 1); assert.equal(f.adapter.calls.length, 0);
    assert.deepEqual(removed, []);
    assert.ok((await f.ctx.sessionController.list({}, new AbortController().signal)).items.some(row => row.sessionId === coldId));
  } finally { gate.resolve(); detach(); await f.dispose(); }
});

test('a changed durable inbox invalidates the exact confirmed history prefix without changing its new contents', { timeout: 20000 }, async t => {
  const f = await fixture(t);
  try {
    const view = await f.preview(), before = await inspect(f.ctx, coldId);
    f.seedAgent.inject(createUserMessage({ content: [{ type: 'text', text: 'New input needs another confirmation' }], source: { kind: 'user' } }));
    await f.ctx.sessionPersistence.flush();
    const insertion = (await inspect(f.ctx, f.seedAgent.id)).events.at(-1);
    assert.equal(insertion.type, 'agent/inbox/spliced');
    const writer = await f.ctx.sessionPersistence.open(coldId, 'write');
    try { await writer.append([{ ...insertion, seq: before.events.at(-1).seq + 1 }]); } finally { await writer.close(); }
    const changed = await inspect(f.ctx, coldId);
    await assert.rejects(f.confirm(view), error => refused('stale')(error) && remoteErrorOf(error).details.storageEffects === 'none');
    assert.deepEqual(await inspect(f.ctx, coldId), changed);
    assert.equal(f.ctx.agents.get(coldId), undefined); assert.equal(f.adapter.calls.length, 0);
  } finally { await f.dispose(); }
});

test('retiring the selected preset while created is paused invalidates continuation before driver release', { timeout: 20000 }, async t => {
  const f = await fixture(t), entered = Promise.withResolvers(), gate = Promise.withResolvers();
  const unregister = await f.ctx.agentPresets.register({ id: 'history-ephemeral', name: 'Current ephemeral preset', description: 'Isolated current configuration', plugins: [] });
  const detach = f.ctx.on('agent/created', async ({ agent }) => { if (agent.id === coldId) { entered.resolve(); await gate.promise; } });
  try {
    const view = await f.invoke('preview', { sessionId: coldId, request: { sessionId: coldId, preset: 'history-ephemeral', profileId: 'history-current' } });
    const before = await inspect(f.ctx, coldId);
    const rejected = assert.rejects(f.confirm(view), error => refused('stale')(error) && remoteErrorOf(error).details.storageEffects === 'may-have-committed');
    await entered.promise; await unregister(); gate.resolve(); await rejected;
    assert.equal(f.adapter.calls.length, 0);
    assert.equal(f.ctx.agents.get(coldId), undefined);
    assert.deepEqual((await inspect(f.ctx, coldId)).events.filter(event => event.type.startsWith('agent/inbox/')), before.events.filter(event => event.type.startsWith('agent/inbox/')));
  } finally { gate.resolve(); detach(); await unregister(); await f.dispose(); }
});

test('native preset leases synchronously reject withdrawal, replacement and own disposal while retaining old revisions', { timeout: 20000 }, async t => {
  const f = await fixture(t), registry = f.ctx.agentPresets;
  let unregister, replacement, lease, next;
  try {
    unregister = await registry.register({ id: 'lease-contract', name: 'Lease contract', description: 'Isolated lease', plugins: [] });
    lease = await registry.acquireScope('lease-contract');
    const key = lease.key;
    assert.equal(lease.assertCurrent(), undefined);
    const retiring = unregister();
    assert.throws(() => lease.assertCurrent());
    assert.equal(lease.key, key);
    await retiring;
    replacement = await registry.register({ id: 'lease-contract', name: 'Replacement', description: 'New generation', plugins: [] });
    next = await registry.acquireScope('lease-contract');
    assert.notEqual(next.key, key); assert.equal(next.assertCurrent(), undefined);
    assert.throws(() => lease.assertCurrent());
    const disposing = next[Symbol.asyncDispose]();
    assert.throws(() => next.assertCurrent()); await disposing;
    await next[Symbol.asyncDispose]();
  } finally {
    await lease?.[Symbol.asyncDispose](); await next?.[Symbol.asyncDispose]();
    await unregister?.(); await replacement?.(); await f.dispose();
  }
});

test('missing native preset lease capability reports unsupported before preview or a writer', { timeout: 20000 }, async t => {
  const f = await fixture(t), registry = f.ctx.agentPresets, acquire = registry.acquireScope;
  registry.acquireScope = async function (...args) {
    const lease = await acquire.apply(this, args);
    return { key: lease.key, [Symbol.asyncDispose]: () => lease[Symbol.asyncDispose]() };
  };
  try {
    const before = await inspect(f.ctx, coldId), status = await f.invoke('describe', { sessionId: coldId });
    assert.equal(status.compatibleHost, false); assert.equal(status.reason, 'unsupported-host');
    await assert.rejects(f.preview(), refused('unsupported-host'));
    assert.equal(f.writes, 0); assert.deepEqual(await inspect(f.ctx, coldId), before);
  } finally { registry.acquireScope = acquire; await f.dispose(); }
});
