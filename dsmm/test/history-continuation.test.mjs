import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { RemoteAccessService } from '@deepseek-ai/dsh-api-remote-access';
import * as NativeConnection from '@deepseek-ai/dsh-client-connection';
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol';
import { registerHistoryContinuationRpc } from '../src/history-rpc.ts';
import { HistoryRefusal } from '../src/history-controller.ts';
import { fixture, hostController, inspect } from './session-activation-fixture.mjs';

const require = createRequire(import.meta.url);
const native = createRequire(require.resolve('@deepseek-ai/dsh-client-connection/package.json'));
const { CredentialProvider } = native('@deepseek-ai/dsh-credentials');
class MemoryCredentials extends CredentialProvider {
  records = new Map();
  async modifyRecord(key, modify) { const value = await modify(this.records.get(key)); if (value !== undefined) this.records.set(key, value); return value; }
}

async function historyFixture() {
  const f = await fixture();
  try {
    await f.ctx.plugin(RemoteAccessService).await();
    await hostController(f.ctx);
    await f.ctx.plugin(TypertGatewayService, {}).await();
    await f.ctx.plugin(MemoryCredentials).await();
    const connection = f.ctx.plugin(NativeConnection); await connection.await();
    f.ctx.provide('webServer', { host: '127.0.0.1' });
    f.ctx.provide('settings', { writable: true });
    f.ctx.provide('agentPresets', { async resolve(id) { assert.equal(id, 'current-root'); return { id }; }, async mount() {} });
    const controls = { revision: 0, disposed: 0, installed: new WeakSet(), calls: [], beforeRevalidate: undefined };
    const bindings = new WeakMap(), lifetime = new AbortController();
    const admission = { lifetime, isReady: true, get: agent => bindings.get(agent), assert(agent) { const value = bindings.get(agent); if (!value) throw new HistoryRefusal('authorization-required'); return value; } };
    class Adapter extends LlmAdapter {
      async resolveModel(provider, model) { return { provider, id: model, name: model, inputModalities: ['text'] }; }
      async *stream(options) {
        const agent = f.ctx.agents.get(f.id);
        assert.equal(controls.installed.has(agent), true);
        assert.ok(admission.get(agent));
        controls.calls.push(options);
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'text-delta', index: 0, text: 'continued under current configuration' };
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'continued under current configuration' } };
        yield { type: 'finish', reason: { kind: 'stop' } };
      }
    }
    f.ctx.llm.registerAdapter(['fixture'], new Adapter());
    const candidates = {
      signal: new AbortController().signal,
      async choices() { return { presets: [{ id: 'current-root', label: 'Current root' }], profiles: [{ id: 'saved', label: 'Saved current profile' }] }; },
      async prepare(request) {
        const revision = controls.revision, current = Object.freeze({ epoch: `new-${revision}`, settings: Object.freeze({}) });
        const check = () => { if (revision !== controls.revision) throw new HistoryRefusal('stale'); };
        return { admission: current, signal: new AbortController().signal,
          model: { provider: 'fixture', model: 'current-model' },
          view: { preset: { id: request.preset, label: 'Current root' }, profile: request.profileId === null ? null : { id: request.profileId, label: 'Saved current profile' },
            model: { provider: 'fixture', model: 'current-model' }, roles: [{ id: 'current-root', label: 'Current root' }], restrictions: ['Current policy'], differences: ['Historical approvals are not reused'] },
          assertCurrent: check,
          async revalidate(signal) { await controls.beforeRevalidate?.(); signal.throwIfAborted(); check(); },
          async install(agent, signal) { signal.throwIfAborted(); check(); controls.installed.add(agent); },
          dispose() { controls.disposed++; },
        };
      },
    };
    registerHistoryContinuationRpc(f.ctx, candidates, admission);
    // NativeAdmission's history-only integration seam, without modifying its blank transaction implementation.
    f.ctx.on('agent/created', frame => { if (frame.source === 'resume') { const candidate = f.ctx.dsmmHistoryContinuation.admissionForCreated(frame.agent); assert.ok(candidate); bindings.set(frame.agent, candidate); } });
    let writes = 0;
    const open = f.ctx.sessionPersistence.open;
    f.ctx.sessionPersistence.open = function (...args) { if (args[1] === 'write') writes++; return open.apply(this, args); };
    const invoke = (method, args = {}, options = {}) => f.ctx.typertGateway.invoke({ namespace: 'dsmmHistory', method, args, peer: options.peer ?? f.ctx.connection.browserPeer, signal: options.signal });
    return { ...f, invoke, controls, admission, connection, get writes() { return writes; },
      preview: (signal) => invoke('preview', { sessionId: f.id, request: { sessionId: f.id, preset: 'current-root', profileId: null } }, { signal }),
      confirm: (preview, options = {}) => invoke('confirm', { sessionId: f.id, request: { sessionId: f.id, intentId: preview.intentId, processPending: true, acceptMigration: false, ...options.request } }, options),
    };
  } catch (error) { await f.close(); throw error; }
}
const refused = code => error => remoteErrorOf(error)?.code === 'dsmm-history/refused' && remoteErrorOf(error).details.code === code;

test('native Host RPC previews read-only and explicitly wakes confirmed inbox once with current composition', async () => {
  const f = await historyFixture();
  try {
    assert.equal((await f.invoke('describe', { sessionId: f.id })).execution, 'authorization-required');
    const before = await inspect(f.ctx, f.id), abortPreview = new AbortController();
    const preview = await f.preview(abortPreview.signal);
    assert.equal(preview.pending.nextStep.length, 1);
    assert.equal(f.writes, 0);
    assert.deepEqual(await inspect(f.ctx, f.id), before);
    abortPreview.abort(); // Completing a preview request does not revoke the peer's confirmation lifetime.
    await assert.rejects(f.confirm(preview, { request: { processPending: false } }), refused('authorization-required'));
    assert.equal(f.writes, 0);
    const result = await f.confirm(preview);
    assert.deepEqual(result, { sessionId: f.id, execution: 'active' });
    await f.ctx.agents.get(f.id).whenIdle();
    assert.equal(f.controls.calls.length, 1);
    assert.equal(f.controls.calls[0].model, 'current-model');
    assert.equal(f.controls.calls[0].messages.flatMap(message => message.content ?? []).filter(block => block.text === 'pending historical input').length, 1);
    assert.equal((await f.invoke('describe', { sessionId: f.id })).execution, 'active');
    await assert.rejects(f.confirm(preview), refused('authorization-required'));
    assert.equal(f.writes, 1);
    assert.equal(f.controls.disposed, 1);
  } finally { await f.close(); }
});

test('native Host rejects token-only authority, changed current configuration, and cold requests without an intent', async () => {
  const f = await historyFixture();
  try {
    const before = await inspect(f.ctx, f.id), preview = await f.preview();
    const impostor = new NativeConnection.Peer(f.ctx, { principal: { kind: 'owner' } });
    await assert.rejects(f.confirm(preview, { peer: impostor }), refused('not-owned'));
    await assert.rejects(f.confirm(preview, { request: { owner: true } }));
    assert.equal(f.writes, 0);
    f.controls.revision++;
    await assert.rejects(f.confirm(preview), refused('stale'));
    await assert.rejects(f.ctx.agents.resume({ resumeSessionId: f.id }), error => error.code === 'authorization-required');
    assert.equal(f.writes, 0);
    assert.deepEqual(await inspect(f.ctx, f.id), before);
  } finally { await f.close(); }
});

test('a changed native prefix is rejected under the writer lease without appending activation entries', async () => {
  const f = await historyFixture();
  try {
    const preview = await f.preview(), old = await inspect(f.ctx, f.id);
    const title = old.events.find(event => event.type === 'session/title');
    const writer = await f.ctx.sessionPersistence.open(f.id, 'write');
    try { await writer.append([{ ...title, seq: old.events.at(-1).seq + 1, data: { ...title.data, title: 'New native title' } }]); }
    finally { await writer.close(); }
    const changed = await inspect(f.ctx, f.id);
    await assert.rejects(f.confirm(preview), refused('stale'));
    assert.deepEqual(await inspect(f.ctx, f.id), changed);
    assert.equal(f.controls.calls.length, 0);
  } finally { await f.close(); }
});

test('disconnect during current-candidate revalidation cancels before writer acquisition', async () => {
  const f = await historyFixture();
  try {
    const preview = await f.preview(), before = await inspect(f.ctx, f.id);
    const entered = Promise.withResolvers(), release = Promise.withResolvers();
    f.controls.beforeRevalidate = async () => { entered.resolve(); await release.promise; };
    const continuation = f.confirm(preview);
    const outcome = assert.rejects(continuation);
    await entered.promise;
    await f.connection.dispose();
    release.resolve(); await outcome;
    assert.equal(f.writes, 0);
    assert.deepEqual(await inspect(f.ctx, f.id), before);
    assert.equal(f.controls.disposed, 1);
  } finally { await f.close(); }
});

test('an unguarded replacement loop is not a compatible continuation backend', async () => {
  const f = await historyFixture();
  try {
    await f.loop.dispose();
    f.ctx.provide('agentLoop', { requireActivationAdmission() {}, registerActivationGuard() { return () => {}; }, activationState() {} });
    const status = await f.invoke('describe', { sessionId: f.id });
    assert.equal(status.compatibleHost, false);
    assert.equal(status.reason, 'unsupported-host');
    await assert.rejects(f.preview(), refused('unsupported-host'));
    assert.equal(f.writes, 0);
  } finally { await f.close(); }
});

test('created pause rejects ordinary requests and late revocation preserves pending after final native disposal', async () => {
  const f = await historyFixture();
  try {
    const before = await inspect(f.ctx, f.id), preview = await f.preview();
    const entered = Promise.withResolvers(), release = Promise.withResolvers();
    f.ctx.on('agent/created', async frame => { if (frame.source === 'resume') { entered.resolve(); await release.promise; } });
    const continuation = f.confirm(preview);
    await entered.promise;
    assert.ok((await f.ctx.sessionController.resolveAgent(f.id)).error);
    assert.equal((await f.invoke('describe', { sessionId: f.id })).execution, 'activating');
    f.controls.revision++;
    release.resolve();
    await assert.rejects(continuation, error => refused('stale')(error) && remoteErrorOf(error).details.storageEffects === 'may-have-committed');
    assert.equal(f.ctx.agents.get(f.id), undefined);
    assert.deepEqual((await inspect(f.ctx, f.id)).events.filter(event => event.type.startsWith('agent/inbox/')), before.events.filter(event => event.type.startsWith('agent/inbox/')));
    assert.equal(f.controls.calls.length, 0);
  } finally { await f.close(); }
});
