import assert from "node:assert/strict";
import { test } from "node:test";
import { annotateDsmmEvent, assertDsmmMetadataPersistence, DSMM_PERSISTENCE_COMPATIBILITY } from "../lib/session-metadata.js";
import { DeepworkModeController } from "../lib/state.js";
import { establishRolePolicy } from "../lib/role-routing.js";
import { resolveConfig } from "../lib/settings.js";
import type { AgentRequestFrame, DshContext } from "../lib/dsh-types.js";

test("DSMM metadata clones gain an ignorable envelope without changing immutable source events", () => {
  for (const [type, data] of [
    ["deepwork/mode", { active: false }],
    ["dsmm/role-policy", { version: 1, role: "dsmm-reviewer", policy: "a".repeat(64) }],
    ["dsmm/role-policy", { version: 1, role: "dsmm-reviewer", policy: null }]
  ] as const) {
    const source = Object.freeze({ type, seq: 9, time: 123, data: Object.freeze(data) });
    const marked = annotateDsmmEvent(source);
    assert.deepEqual(marked, { ...source, ignorable: true });
    assert.equal(Object.hasOwn(source, "ignorable"), false);
    assert.notEqual(marked, source);
    assert.equal(marked.data, source.data);
    assert.equal(annotateDsmmEvent(marked), marked);
  }
});

test("durable DSMM mode and policy refuse an incompatible persistence path before appending an unsafe event", async () => {
  let appended = 0;
  const ctx: DshContext = { get: () => ({}) as never };
  const agent = { session: { events: [{ type: "turn/start", data: { turn: 1 } }, { type: "step/start", data: { turn: 1, step: 1 } }], append() { appended += 1; } } };
  const mode = new DeepworkModeController(ctx);
  const blank = { ...agent, session: { ...agent.session, events: [] } };
  await assert.rejects(mode.select(blank, true), /no unsafe event was appended/u);
  await assert.rejects(establishRolePolicy({ agent, turn: 1, step: 1, signal: new AbortController().signal } as AgentRequestFrame,
    resolveConfig({ roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture", model: "test" } } } }), "dsmm-reviewer", ctx), /no unsafe event was appended/u);
  assert.equal(appended, 0);
  assert.doesNotThrow(() => assertDsmmMetadataPersistence(undefined));
  assert.doesNotThrow(() => assertDsmmMetadataPersistence({ get: () => undefined }));
  assert.doesNotThrow(() => assertDsmmMetadataPersistence({ get: () => ({ [DSMM_PERSISTENCE_COMPATIBILITY]: true }) as never }));
});

test("DSMM metadata annotation never marks unrelated required events or invalid owned records", () => {
  const unrelated = { type: "another-plugin/required", seq: 9, time: 123, data: {} };
  assert.equal(annotateDsmmEvent(unrelated), unrelated);
  for (const event of [
    { type: "deepwork/mode", data: { active: true, extra: "unsafe" } },
    { type: "deepwork/mode", data: { active: 1 } },
    { type: "deepwork/mode", data: null },
    { type: "deepwork/mode", data: { active: true }, ignorable: false },
    { type: "dsmm/role-policy", data: { version: 2, role: "dsmm-reviewer", policy: null } },
    { type: "dsmm/role-policy", data: { version: 1, role: "reviewer", policy: null } },
    { type: "dsmm/role-policy", data: { version: 1, role: "dsmm-reviewer", policy: "A".repeat(64) } },
    { type: "dsmm/role-policy", data: { version: 1, role: "dsmm-reviewer", policy: null, extra: 1 } }
  ]) assert.throws(() => annotateDsmmEvent(event), /invalid Deepwork session metadata/u);
  const valid = { type: "deepwork/mode", seq: 9, time: 123, data: { active: true } };
  for (const event of [
    { ...valid, surfaceOp: "append" },
    { ...valid, sourceEventSeqs: [1] },
    { ...valid, extra: "future semantics" },
    { ...valid, seq: -1 },
    { ...valid, seq: -0 },
    { ...valid, seq: 1.5 },
    { ...valid, time: Infinity }
  ]) assert.throws(() => annotateDsmmEvent(event), /invalid Deepwork session metadata/u);
});
