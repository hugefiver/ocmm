import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { HistoryContinuations, historyFailure } from '../src/history-controller.ts';
import { fixture, hostController } from './session-activation-fixture.mjs';

const require = createRequire(import.meta.url);
const nativeRoot = dirname(require.resolve('@deepseek-ai/dsh-api-session-controller'));
const { SessionHistoryController } = await import(pathToFileURL(join(nativeRoot, 'types/history.js')).href);
const { Session } = await import(pathToFileURL(join(nativeRoot, 'types/client/sessions/session.js')).href);

/** Native persisted events, Host projections and Client Session; only current policy/model providers are test-owned. */
export async function nativeBlankHistory() {
  const f = await fixture(), opened = [], handles = [], lifetime = new AbortController(), bindings = new WeakMap();
  try {
    await hostController(f.ctx);
    f.ctx.provide('agentPresets', { async resolve(id) { assert.equal(id, 'current'); return { id }; }, async mount() {} });
    const admission = { epoch: 'native-client-fixture', settings: Object.freeze({}) };
    const nativeAdmission = { lifetime, isReady: true, get: agent => bindings.get(agent), assert(agent) { const value = bindings.get(agent); assert.ok(value); return value; } };
    const model = { provider: 'fixture', model: 'current-model' };
    class Adapter extends LlmAdapter {
      async resolveModel(provider, id) { return { provider, id, name: id, inputModalities: ['text'] }; }
      async *stream() { yield { type: 'finish', reason: { kind: 'stop' } }; }
    }
    f.ctx.llm.registerAdapter(['fixture'], new Adapter());
    const candidates = { signal: lifetime.signal, async choices() { return { presets: [{ id: 'current', label: 'Current' }], profiles: [] }; },
      async prepare(request) { return { admission, signal: lifetime.signal, model,
        view: { preset: { id: request.preset, label: 'Current' }, profile: null, model, roles: [], restrictions: ['Current fixture policy'], differences: [] },
        assertCurrent() {}, async revalidate() {}, async install() {}, dispose() {} }; } };
    const history = new HistoryContinuations(f.ctx, candidates, nativeAdmission);
    f.ctx.on('agent/created', frame => {
      bindings.set(frame.agent, frame.source === 'resume' ? history.admissionForCreated(frame.agent) : admission);
    });
    const reader = new SessionHistoryController(f.ctx, () => { throw new Error('Read-only fixture must not promote on follow'); }, false);
    const operator = { peer: {}, connection: {}, peerSignal: lifetime.signal, signal: lifetime.signal,
      assertCurrent() { lifetime.signal.throwIfAborted(); }, assertOwner() { lifetime.signal.throwIfAborted(); }, assertVisible() {} };
    return {
      id: f.id,
      async open(id, $stream) {
        const session = new Session(id, { $stream, session: {
          follow: (request, signal) => reader.follow(request, signal),
          page: async (request, signal) => ({ ok: true, value: await reader.page(request, signal) }),
        } });
        opened.push(session); await session.open();
        assert.equal(session.getSnapshot().openState, 'open');
        return session;
      },
      async createBlank() {
        const handle = await f.ctx.agents.create({ sessionId: SessionId('native-live-blank'), meta: { cwd: f.root, agentPreset: 'current' } });
        handles.push(handle); return handle.agent.id;
      },
      async invoke(endpoint, args) {
        try {
          const method = endpoint.split('/')[1];
          const value = method === 'describe' ? await history.describe(args.sessionId, operator)
            : method === 'choices' ? await history.choices(operator)
            : method === 'preview' ? await history.preview(args.request, operator)
            : method === 'confirm' ? await history.confirm(args.request, operator) : assert.fail('Unexpected history operation');
          return { ok: true, value };
        } catch (error) { return { ok: false, error: { code: 'dsmm-history/refused', message: 'Native fixture refused continuation', details: historyFailure(error) } }; }
      },
      async close() {
        for (const session of opened) session.dispose();
        lifetime.abort();
        for (const handle of handles) await handle.dispose();
        await f.close();
      },
    };
  } catch (error) { await f.close(); throw error; }
}
