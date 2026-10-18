import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HistoryContinuationController } from '../src/client/history-controller.ts';

const ok = value => ({ ok: true, value });
const status = (sessionId, execution = 'authorization-required') => ({ sessionId, readable: 'readable', execution, compatibleHost: true });
function preview(sessionId) {
  return { sessionId, intentId: '12345678-1234-4123-8123-123456789abc', cwd: 'synthetic-project', migrationRequired: false,
    candidate: { preset: { id: 'current', label: 'Current' }, profile: null, model: { provider: 'fixture', model: 'current-model' }, roles: [], restrictions: ['Current restrictions'], differences: [] },
    pending: { nextTurn: [], nextStep: [{ content: [{ type: 'text', text: '<untrusted input>' }] }] } };
}
function waitFor(controller, predicate) {
  if (predicate(controller.getSnapshot())) return Promise.resolve();
  return new Promise(resolve => { const unsubscribe = controller.subscribe(() => { if (predicate(controller.getSnapshot())) { unsubscribe(); resolve(); } }); });
}
const ready = controller => waitFor(controller, state => state.phase === 'ready');
function remote() {
  return { describe: async id => ok(status(id)), choices: async () => ok({ presets: [{ id: 'current', label: 'Current' }], profiles: [] }),
    preview: async id => ok(preview(id)), confirm: async id => ok({ sessionId: id, execution: 'active' }) };
}

test('client keeps native history separate, fences old-session responses, and refuses stale confirmation handlers', async () => {
  const controller = new HistoryContinuationController(), api = remote(), response = Promise.withResolvers();
  controller.bind(api, {}, 'first'); await ready(controller);
  assert.equal(controller.historyBrowsingAllowed, true);
  api.preview = () => response.promise;
  const pending = controller.preview(controller.getSnapshot(), 'current', null);
  const stale = controller.getSnapshot();
  controller.bind(api, {}, 'second'); await ready(controller);
  response.resolve(ok(preview('first'))); await pending;
  assert.equal(controller.getSnapshot().sessionId, 'second');
  assert.equal(controller.getSnapshot().preview, null);
  let confirms = 0; api.confirm = async () => { confirms++; throw new Error('must not run'); };
  await controller.confirm(stale, true, true);
  assert.equal(confirms, 0);
});

test('client sends only one explicit confirmation and treats a lost receipt as unknown until a native status read', async () => {
  const controller = new HistoryContinuationController(), api = remote(), response = Promise.withResolvers();
  let confirms = 0;
  api.confirm = () => { confirms++; return response.promise; };
  controller.bind(api, {}, 'session'); await ready(controller);
  await controller.preview(controller.getSnapshot(), 'current', null);
  const expected = controller.getSnapshot();
  await controller.confirm(expected, false, false);
  assert.equal(confirms, 0);
  const first = controller.confirm(expected, true, false), second = controller.confirm(expected, true, false);
  assert.equal(confirms, 1);
  response.reject(new Error('transport lost after commit')); await Promise.all([first, second]);
  assert.equal(controller.getSnapshot().phase, 'unknown');
  assert.equal(controller.getSnapshot().preview, null);
  await controller.confirm(controller.getSnapshot(), true, false);
  assert.equal(confirms, 1);
  api.describe = async id => ok(status(id, 'active'));
  await controller.refresh(controller.getSnapshot());
  assert.equal(controller.getSnapshot().status.execution, 'active');
  assert.equal(confirms, 1);
});

test('client prevents migration without consent and old-connection responses cannot enable the new connection', async () => {
  const controller = new HistoryContinuationController(), api = remote(), response = Promise.withResolvers();
  api.preview = async id => ok({ ...preview(id), migrationRequired: true });
  let confirms = 0; api.confirm = () => { confirms++; return response.promise; };
  controller.bind(api, {}, 'session'); await ready(controller);
  await controller.preview(controller.getSnapshot(), 'current', null);
  await controller.confirm(controller.getSnapshot(), true, false);
  assert.equal(confirms, 0);
  const flight = controller.confirm(controller.getSnapshot(), true, true);
  controller.bind(undefined, undefined, null);
  assert.equal(controller.historyBrowsingAllowed, false);
  response.resolve(ok({ sessionId: 'session', execution: 'active' })); await flight;
  assert.equal(controller.getSnapshot().phase, 'disconnected');
  assert.equal(controller.getSnapshot().status, null);
});

test('native scope replacement invalidates retained confirmations and synchronous withdrawal prevents dispatch', async () => {
  const controller = new HistoryContinuationController(), api = remote(), connection = {};
  let confirms = 0; api.confirm = async id => { confirms++; return ok({ sessionId: id, execution: 'active' }); };
  controller.bind(api, connection, 'session', {}); await ready(controller);
  await controller.preview(controller.getSnapshot(), 'current', null);
  const retained = controller.getSnapshot();
  controller.bind(api, connection, 'session', {}); await ready(controller);
  await controller.confirm(retained, true, false); assert.equal(confirms, 0);
  await controller.preview(controller.getSnapshot(), 'current', null);
  const stop = controller.subscribe(() => {
    if (controller.getSnapshot().phase === 'confirming') controller.bind(undefined, undefined, null);
  });
  await controller.confirm(controller.getSnapshot(), true, false); assert.equal(confirms, 0);
  stop(); controller.dispose(); controller.bind(api, connection, 'session');
  assert.equal(controller.getSnapshot().phase, 'disconnected');
});
