import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { AgentLoop } from '@deepseek-ai/dsh-agent-loop';
import { LlmAdapter, createAssistantMessage, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { SessionController } from '@deepseek-ai/dsh-api-session-controller';
import { SubagentRuntime } from '@deepseek-ai/dsh-subagent';
import WorkingDirectory from '@deepseek-ai/dsh-working-directory';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import { fixture, inspect, hostController } from './session-activation-fixture.mjs';

const require = createRequire(import.meta.url);
const { SessionHistoryController } = await import(pathToFileURL(join(dirname(require.resolve('@deepseek-ai/dsh-api-session-controller')), 'types/history.js')).href);
const { ApiSessionAgentController } = await import(pathToFileURL(join(dirname(require.resolve('@deepseek-ai/dsh-api-session-controller')), 'types/agent.js')).href);

function controllerContext(ctx) {
  return { typert: { lookups: { configure() {} }, contexts: { configureHost() {} } }, agents: ctx.agents,
    sessions: ctx.sessions, sessionQuery: ctx.sessionQuery, sessionProjections: ctx.sessionProjections,
    agentDefaultModel: { currentSelection: () => ({ provider: 'fixture', model: 'current-model' }) }, get: ctx.get.bind(ctx) };
}

test('required admission denies cold resume before opening a writer; optional deployment resumes', async () => {
  for (const required of [true, false]) {
    const f = await fixture(required);
    try {
      const before = await inspect(f.ctx, f.id);
      let writes = 0;
      const open = f.ctx.sessionPersistence.open;
      f.ctx.sessionPersistence.open = function (...args) { if (args[1] === 'write') writes++; return open.apply(this, args); };
      if (required) {
        await assert.rejects(f.ctx.agents.resume({ resumeSessionId: f.id }), error => error.category === 'authorization-required');
        assert.equal(writes, 0);
        assert.deepEqual(await inspect(f.ctx, f.id), before);
      } else {
        const resumed = await f.ctx.agents.resume({ resumeSessionId: f.id });
        assert.equal(writes, 1);
        await resumed.dispose();
      }
    } finally { await f.close(); }
  }
});

test('all guards veto and revoked providers cannot publish; final failed disposal preserves inbox', async () => {
  const f = await fixture();
  try {
    const before = await inspect(f.ctx, f.id);
    let writes = 0;
    const open = f.ctx.sessionPersistence.open;
    f.ctx.sessionPersistence.open = function (...args) { if (args[1] === 'write') writes++; return open.apply(this, args); };
    const first = f.ctx.agentLoop.registerActivationGuard(() => ({ assertCurrent() {}, validateLoaded() {}, validatePublish() {}, dispose() {} }));
    const veto = f.ctx.agentLoop.registerActivationGuard(() => { throw new Error('veto'); });
    await assert.rejects(f.ctx.agents.resume({ resumeSessionId: f.id }), /veto/);
    assert.equal(writes, 0);
    veto();
    const entered = Promise.withResolvers(), release = Promise.withResolvers();
    const remove = f.ctx.on('agent/created', async frame => { if (frame.source === 'resume') { entered.resolve(frame.agent); await release.promise; } });
    const pending = f.ctx.agents.resume({ resumeSessionId: f.id });
    const agent = await entered.promise;
    const controller = new ApiSessionAgentController(controllerContext(f.ctx));
    const ordinary = await controller.resolveAgent(f.id);
    assert.ok(ordinary.error);
    first();
    release.resolve();
    await assert.rejects(pending, error => error.category === 'stale');
    assert.equal(f.ctx.agents.get(f.id), undefined);
    const after = await inspect(f.ctx, f.id);
    assert.deepEqual(after.events.filter(event => event.type.startsWith('agent/inbox/')), before.events.filter(event => event.type.startsWith('agent/inbox/')));
    assert.equal(agent.inbox.nextStep.length, 1);
    remove();
  } finally { await f.close(); }
});

test('browse follows later durable and assistant frames without promotion; default true remains compatible', async () => {
  assert.equal(SessionController.Config({}).activateOnFollow, true);
  for (const activateOnFollow of [false, true]) {
    const f = await fixture(false);
    const abort = new AbortController();
    let retained = 0, writes = 0;
    const promotions = [];
    try {
      const open = f.ctx.sessionPersistence.open;
      f.ctx.sessionPersistence.open = function (...args) { if (args[1] === 'write') writes++; return open.apply(this, args); };
      const history = new SessionHistoryController(f.ctx, observation => {
        retained++;
        promotions.push(f.ctx.agents.resume({ resumeSessionId: f.id }).finally(() => observation[Symbol.dispose]()));
      }, activateOnFollow);
      const stream = history.follow({ address: { kind: 'session', sessionId: f.id }, assistantStream: true }, abort.signal);
      const first = await stream.next();
      assert.equal(first.value.type, 'snapshot');
      assert.ok(first.value.records.some(row => row.type === 'session/title' || row.event?.type === 'session/title'));
      const page = await history.page({ address: { kind: 'session', sessionId: f.id }, throughSeq: first.value.cursor }, abort.signal);
      assert.ok(page.records.length > 0);
      const next = stream.next();
      // The generator runs its promotion decision synchronously after snapshot delivery.
      await Promise.resolve();
      assert.equal(retained, activateOnFollow ? 1 : 0);
      assert.equal(writes, 0);
      const resumed = activateOnFollow ? await promotions[0] : await f.ctx.agents.resume({ resumeSessionId: f.id });
      const event = await next;
      assert.equal(event.done, false);
      assert.equal(writes, 1);
      // Drain only the constructor suffix; then observe a later durable event on this same follower.
      const expected = resumed.agent.session.seq;
      const durable = stream.next();
      resumed.agent.session.append('session/title', { title: 'Current title', messageSeqs: [], source: { kind: 'user' } });
      const frame = await durable;
      assert.equal(frame.value.seq ?? frame.value.event?.seq, expected);
      const assistant = stream.next();
      f.ctx.emit('agent/assistant-stream', { agent: resumed.agent, frame: { type: 'start', revision: 1, attemptId: 'isolated-attempt', turn: 1, step: 1 } });
      assert.equal((await assistant).value.type, 'assistant-stream');
      abort.abort();
      assert.equal((await stream.next()).done, true);
      await resumed.dispose();
    } finally { abort.abort(); await f.close(); }
  }
});

test('JSONL locked admission checks current and migrating logical histories before grant or migration publication', async () => {
  const f = await fixture();
  try {
    const seed = await f.ctx.agents.create({ sessionId: SessionId('transcript-seed'), meta: { cwd: f.root, agentPreset: 'retired-0.2-preset' } });
    const history = seed.agent.session;
    history.append('session/title', { title: 'Historical title', messageSeqs: [], source: { kind: 'user' } });
    seed.agent.inject(createUserMessage({ content: [{ type: 'text', text: 'pending historical input' }], source: { kind: 'user' } }));
    const call = { type: 'tool-call', id: 'historical-tool-call', name: 'retired_tool', arguments: '{"path":"old-file"}' };
    const transcript = [
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'step/start', data: { turn: 1, step: 1 } },
      { type: 'user/message', data: createUserMessage({ content: [{ type: 'text', text: 'Historical request' }], source: { kind: 'user' } }) },
      { type: 'assistant/message', data: { turn: 1, step: 1, message: createAssistantMessage({ content: [call], source: { provider: 'retired-provider', model: 'retired-model' } }), stream: [] } },
      { type: 'tool/call', data: { turn: 1, step: 1, callId: call.id, name: call.name, arguments: call.arguments } },
      { type: 'tool/result', data: { turn: 1, step: 1, message: createToolResultMessage({ callId: call.id, content: [{ type: 'text', text: 'Historical failed result' }], isError: true }), error: { name: 'HistoricalFailure', code: 'FAILED', reason: 'Historical failure detail' }, meta: { details: 'Historical tool detail' } } },
      { type: 'step/end', data: { turn: 1, step: 1 } },
      { type: 'step/start', data: { turn: 1, step: 2 } },
      { type: 'assistant/message', data: { turn: 1, step: 2, message: createAssistantMessage({ content: [{ type: 'text', text: 'Interrupted historical prefix' }], source: { provider: 'retired-provider', model: 'retired-model' } }), stream: [], interrupted: true } },
    ];
    for (const event of transcript) {
      if (['user/message', 'assistant/message', 'tool/result'].includes(event.type)) history.append(event.type, event.data, { surfaceOp: 'append' });
      else history.append(event.type, event.data);
    }
    await f.ctx.sessionPersistence.flush();
    const seeded = await inspect(f.ctx, seed.agent.id);
    await seed.dispose();
    f.id = SessionId('current-vocabulary');
    const cold = await f.ctx.sessionPersistence.create({ ...seeded.header, id: f.id });
    try { await cold.append(seeded.events); } finally { await cold.close(); }
    await f.ctx.sessionPersistence.flush();
    const current = await inspect(f.ctx, f.id);
    const path = f.ctx.sessionPersistence.locate(current.header).path;
    const rows = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    const historicalId = SessionId('historical-v3');
    const historicalPath = f.ctx.sessionPersistence.locate({ ...current.header, id: historicalId }).path;
    await mkdir(dirname(historicalPath), { recursive: true });
    const legacy = structuredClone(rows);
    legacy[0].id = historicalId; legacy[0].version = 3;
    for (const row of legacy) if (row.type === 'agent/inbox/spliced') for (const message of row.data.inserted) message.source = { kind: 'plugin', plugin: 'agent-message' };
    for (const row of legacy) if (row.type === 'user/message') row.data.source = { kind: 'plugin', plugin: 'agent-message' };
    for (const row of legacy) if (row.type === 'tool/result') {
      const message = row.data.message;
      row.data.message = { id: message.id, role: 'user', source: message.source,
        content: [{ type: 'tool-result', toolCallId: message.toolCallId, content: message.content, isError: message.isError }] };
    }
    const sourcePath = historicalPath.replace('session.v4.', 'session.v3.');
    await writeFile(sourcePath, legacy.map(row => JSON.stringify(row)).join('\n') + '\n');
    const bytes = await readFile(sourcePath);
    const logical = await inspect(f.ctx, historicalId);
    assert.equal(logical.events.length, current.events.length);
    assert.equal(logical.events.find(event => event.type === 'agent/inbox/spliced').data.inserted[0].source.kind, 'agent-message');
    assert.equal(logical.events.find(event => event.type === 'user/message').data.source.kind, 'agent-message');
    const controller = await hostController(f.ctx), browse = new AbortController();
    const stream = controller.follow({ address: { kind: 'session', sessionId: historicalId } }, browse.signal);
    const snapshot = (await stream.next()).value;
    assert.equal(logical.events.find(event => event.type === 'tool/result').data.meta.details, 'Historical tool detail');
    assert.ok(snapshot.records.some(row => row.event?.type === 'tool/result' && row.event.data.message.isError && row.event.data.message.content.some(block => block.text === 'Historical failed result')));
    assert.ok(snapshot.records.some(row => row.event?.type === 'assistant/message' && row.event.data.interrupted));
    const page = await controller.page({ address: { kind: 'session', sessionId: historicalId }, throughSeq: snapshot.cursor }, browse.signal);
    assert.ok(page.records.some(row => row.event?.type === 'user/message' && row.event.data.content[0].text === 'Historical request'));
    browse.abort(); await stream.return();
    await assert.rejects(access(historicalPath));
    for (const id of [f.id, historicalId]) {
      let checked = false;
      const revoke = f.ctx.agentLoop.registerActivationGuard(() => ({
        assertCurrent() {}, validatePublish() {}, dispose() {},
        validateLoaded(inspection) {
          checked = true;
          assert.equal(Object.isFrozen(inspection.events), true);
          assert.equal(inspection.migrationRequired, id === historicalId);
          assert.equal(inspection.sourceVersion, id === historicalId ? 3 : 4);
          throw new Error('stale confirmed prefix');
        },
      }));
      await assert.rejects(f.ctx.agents.resume({ resumeSessionId: id }), /stale confirmed prefix/);
      assert.equal(checked, true);
      revoke();
    }
    assert.deepEqual(await readFile(sourcePath), bytes);
    await assert.rejects(access(historicalPath));
    assert.deepEqual(await inspect(f.ctx, f.id), current);
    const admit = f.ctx.agentLoop.registerActivationGuard(() => ({ assertCurrent() {}, validatePublish() {}, dispose() {}, validateLoaded(inspection) { assert.equal(inspection.migrationRequired, true); assert.deepEqual(inspection.events, logical.events); } }));
    const migrated = await f.ctx.agents.resume({ resumeSessionId: historicalId });
    await access(historicalPath);
    assert.deepEqual(await readFile(sourcePath), bytes);
    assert.deepEqual((await inspect(f.ctx, historicalId)).events.slice(0, logical.events.length), logical.events);
    await migrated.dispose(); admit();
  } finally { await f.close(); }
});

test('stale prefixes, competing writers and unsupported backends cannot acquire execution', async () => {
  const f = await fixture();
  try {
    const before = await inspect(f.ctx, f.id);
    const authorize = () => ({ assertCurrent() {}, validatePublish() {}, dispose() {}, validateLoaded(inspection) { assert.deepEqual(inspection.events, before.events); } });
    const revoke = f.ctx.agentLoop.registerActivationGuard(authorize);
    const writer = await f.ctx.sessionPersistence.open(f.id, 'write');
    await assert.rejects(f.ctx.agents.resume({ resumeSessionId: f.id }), { name: 'SessionAlreadyOwnedError' });
    await writer.close();
    const capability = f.ctx.sessionPersistence.writeAdmission;
    f.ctx.sessionPersistence.writeAdmission = undefined;
    await assert.rejects(f.ctx.agents.resume({ resumeSessionId: f.id }), error => error.category === 'unsupported-backend');
    f.ctx.sessionPersistence.writeAdmission = capability;
    const second = await f.ctx.sessionPersistence.open(f.id, 'write');
    await second.append([{ seq: before.events.length, time: Date.now(), type: 'session/title', data: { title: 'Changed after confirmation', messageSeqs: [], source: { kind: 'user' } } }]);
    await second.close();
    const changed = await inspect(f.ctx, f.id);
    await assert.rejects(f.ctx.agents.resume({ resumeSessionId: f.id }), { code: 'ERR_ASSERTION' });
    assert.deepEqual(await inspect(f.ctx, f.id), changed);
    revoke();
  } finally { await f.close(); }
});

test('cancelled preparation and asynchronous validation fail closed before writer admission', async () => {
  const f = await fixture();
  try {
    let writes = 0;
    const open = f.ctx.sessionPersistence.open;
    f.ctx.sessionPersistence.open = function (...args) { if (args[1] === 'write') writes++; return open.apply(this, args); };
    const invalid = f.ctx.agentLoop.registerActivationGuard(() => ({ async assertCurrent() { throw new Error('async veto'); }, validateLoaded() {}, validatePublish() {}, dispose() {} }));
    await assert.rejects(f.ctx.agents.resume({ resumeSessionId: f.id }), error => error.category === 'authorization-required');
    invalid();
    const abort = new AbortController();
    const cancelled = f.ctx.agentLoop.registerActivationGuard(async () => { abort.abort(); return { assertCurrent() {}, validateLoaded() {}, validatePublish() {}, dispose() {} }; });
    await assert.rejects(f.ctx.agents.resume({ resumeSessionId: f.id, signal: abort.signal }), error => error.category === 'cancelled');
    cancelled();
    assert.equal(writes, 0);
  } finally { await f.close(); }
});

test('configured restore and direct-child resumes use the required gate before writer open', async () => {
  const f = await fixture();
  try {
    let writes = 0;
    const open = f.ctx.sessionPersistence.open;
    f.ctx.sessionPersistence.open = function (...args) { if (args[1] === 'write') writes++; return open.apply(this, args); };
    const parent = await f.ctx.agents.create({ sessionId: SessionId('live-parent'), meta: { cwd: f.root } });
    await assert.rejects(f.ctx.agents.resume({ resumeSessionId: f.id, parentAgent: parent.agent }), error => error.category === 'authorization-required');
    await parent.dispose();
    await f.loop.dispose();
    for (const configured of [{ id: 'restore', sessionId: f.id }, { id: 'deferred', resumeSessionId: f.id }]) {
      const failed = Promise.withResolvers();
      const remove = f.ctx.on('agent-loop/config-start-failed', frame => failed.resolve(frame.error));
      const loop = f.ctx.plugin(AgentLoop, { agents: [configured], activationAdmissionRequired: true });
      await loop.await();
      assert.equal((await failed.promise).category, 'authorization-required');
      assert.equal(writes, 0);
      remove();
      await loop.dispose();
    }
  } finally { await f.close(); }
});

test('explicit activation uses only current preset and exact authorization; setup precedes real driver execution', async () => {
  const f = await fixture();
  try {
    const controller = await hostController(f.ctx);
    let mounted = false, permitted = false, exactOptions;
    const resolved = [], calls = [];
    f.ctx.provide('agentPresets', {
      async resolve(id) { resolved.push(id); assert.equal(id, 'current-root'); return { id }; },
      async mount(_ctx, id) { assert.equal(id, 'current-root'); mounted = true; },
    });
    class Adapter extends LlmAdapter {
      async resolveModel(provider, model) { return { provider, id: model, name: model, inputModalities: ['text'] }; }
      async *stream(options) {
        assert.equal(mounted && permitted, true);
        calls.push(options);
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'text-delta', index: 0, text: 'continued' };
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'continued' } };
        yield { type: 'finish', reason: { kind: 'stop' } };
      }
    }
    f.ctx.llm.registerAdapter(['fixture'], new Adapter());
    const revoke = f.ctx.agentLoop.registerActivationGuard(request => {
      assert.equal(request.options, exactOptions);
      return { assertCurrent() {}, validateLoaded() {}, validatePublish() { assert.equal(permitted, true); }, dispose() {} };
    });
    const request = {
      sessionId: f.id, agentPreset: 'current-root', signal: new AbortController().signal,
      modelSelection: { provider: 'fixture', model: 'current-model' },
      authorize(options) { exactOptions = options; },
      setup() { assert.equal(mounted, true); permitted = true; },
    };
    const pending = controller.activateSession(request);
    assert.equal(controller.activateSession(request), pending);
    await assert.rejects(controller.activateSession({ ...request }));
    assert.ok((await controller.resolveAgent(f.id)).error);
    const resumed = await pending;
    assert.deepEqual(resolved, ['current-root']);
    resumed.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'continue now' }], source: { kind: 'user' } }));
    await resumed.agent.whenIdle();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, 'current-model');
    assert.equal(calls[0].messages.flatMap(message => message.content ?? []).filter(block => block.text === 'pending historical input').length, 1);
    revoke();
    await resumed.dispose();
  } finally { await f.close(); }
});

test('runtime Controller retains persisted catalog and full follow after late publication failure', async () => {
  const f = await fixture();
  const abort = new AbortController();
  try {
    const controller = await hostController(f.ctx);
    const removed = [], added = [];
    f.ctx.on('api-session/removed', id => removed.push(id));
    f.ctx.on('api-session/added', row => added.push(row));
    const stream = controller.follow({ address: { kind: 'session', sessionId: f.id } }, abort.signal);
    assert.equal((await stream.next()).value.type, 'snapshot');
    const next = stream.next();
    const permission = f.ctx.agentLoop.registerActivationGuard(() => ({ assertCurrent() {}, validateLoaded() {}, validatePublish() {}, dispose() {} }));
    const reject = f.ctx.on('agent/created', frame => { if (frame.source === 'resume') throw new Error('late publication failure'); });
    await assert.rejects(f.ctx.agents.resume({ resumeSessionId: f.id }), /late publication failure/);
    assert.equal((await next).done, false);
    assert.deepEqual(removed, []);
    assert.ok(added.some(row => row.sessionId === f.id && row.agentAvailable === false));
    assert.ok((await controller.list({}, abort.signal)).items.some(row => row.sessionId === f.id));
    assert.equal((await inspect(f.ctx, f.id)).events.filter(event => event.type === 'agent/inbox/spliced').at(-1).data.inserted.length, 1);
    reject(); permission(); abort.abort(); await stream.return();
  } finally { abort.abort(); await f.close(); }
});

test('native child history retains descriptor lineage and rejects root-address bypass without activation', async () => {
  const f = await fixture();
  const abort = new AbortController();
  try {
    await f.ctx.plugin(LocalFileSystem, { cwd: f.root }).await();
    await f.ctx.plugin(WorkingDirectory, { defaultDirectory: f.root }).await();
    await f.ctx.plugin(SubagentRuntime, {}).await();
    assert.ok(f.ctx.get('subagents'));
    const controller = await hostController(f.ctx);
    const root = await inspect(f.ctx, f.id), childId = SessionId('historical-child');
    const child = await f.ctx.sessionPersistence.create({ ...root.header, id: childId, origin: 'subagent', parentSession: f.id, delegationDepth: 1 });
    await child.append([...root.events, { seq: root.events.length, time: Date.now(), type: 'subagent/descriptor', data: { version: 3, provider: 'retired-provider', mode: 'continuable', label: 'Known historical child' } }]);
    await child.close();
    let writes = 0;
    const open = f.ctx.sessionPersistence.open;
    f.ctx.sessionPersistence.open = function (...args) { if (args[1] === 'write') writes++; return open.apply(this, args); };
    const address = { kind: 'subagent', parentSessionId: f.id, childSessionId: childId, mode: 'continuable' };
    const stream = controller.follow({ address }, abort.signal);
    const first = await stream.next();
    assert.equal(first.value.type, 'snapshot');
    assert.equal(first.value.header.parentSession, f.id);
    assert.ok(first.value.records.some(row => row.event?.type === 'subagent/descriptor'));
    assert.ok((await controller.page({ address, throughSeq: first.value.cursor }, abort.signal)).records.length > 0);
    await assert.rejects(controller.follow({ address: { ...address, parentSessionId: 'other-parent' } }, abort.signal).next());
    await assert.rejects(controller.follow({ address: { kind: 'session', sessionId: childId } }, abort.signal).next());
    const waiting = stream.next(); await Promise.resolve(); abort.abort(); await waiting;
    assert.equal(writes, 0);
    assert.equal(f.ctx.agents.get(childId), undefined);
  } finally { abort.abort(); await f.close(); }
});
