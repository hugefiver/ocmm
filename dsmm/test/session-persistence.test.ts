import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, unlink, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Context } from "@deepseek-ai/cordis";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import { Session, SessionId, SessionSeq, SessionStore } from "@deepseek-ai/dsh-session";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import {
  SessionAlreadyExistsError, SessionAlreadyOwnedError, SessionFormatUnsupportedError,
  SessionHandleClosedError, SessionReadOnlyError
} from "@deepseek-ai/dsh-session-persistence";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import "../lib/dsh-events.js";
import DsmmSessionPersistence, { DSMM_PERSISTENCE_COMPATIBILITY } from "../lib/session-persistence.js";
import { isDeepworkActive } from "../lib/state.js";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "dsmm-persistence-"));
  const root = join(directory, "logs");
  const ctx = new Context();
  const detachers: Array<() => void> = [];
  const storeFiber = ctx.plugin(SessionStore);
  const persistenceFiber = ctx.plugin(DsmmSessionPersistence, { root, compression: "none" });
  await Promise.all([storeFiber.await(), persistenceFiber.await()]);
  const persistence = ctx.sessionPersistence;
  return {
    directory, root, ctx, persistence, persistenceFiber,
    publish(session: Session) {
      detachers.push(ctx.sessions.enter(session));
      ctx.sessions.announce(session);
    },
    async dispose() {
      for (const detach of detachers.reverse()) detach();
      try { await ctx.fiber.dispose(); }
      finally { await rm(directory, { recursive: true, force: true }); }
    }
  };
}

test("DSMM mode metadata remains reopenable through the native JSONL reader", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsmm-persistence-"));
  const writerContext = new Context();
  const readerContext = new Context();
  try {
    await writerContext.plugin(DsmmSessionPersistence, { root, compression: "none" }).await();
    const session = Session.create(SessionId("dsmm-mode-reopen"));
    const live = session.append("deepwork/mode", { active: true });
    assert.ok(Object.isFrozen(live));
    assert.equal(live.ignorable, undefined);
    const writer = await writerContext.sessionPersistence.create(session.header);
    await writer.append([live]);
    await writer.flush();
    await writer.close();
    await readerContext.plugin(JsonlSessionPersistence, { root, compression: "none" }).await();
    const reader = await readerContext.sessionPersistence.open(session.id, "read");
    const stored = await reader.read();
    assert.equal(stored.events[0]?.ignorable, true);
    assert.equal(isDeepworkActive(stored.events), true);
    const restored = Session.fromRestore(session.id, stored.events, reader.header, reader.inheritedEventCount, stored.eventState);
    assert.deepEqual(restored.deriveMessages(), session.deriveMessages());
    await reader.close();
  } finally {
    await writerContext.fiber.dispose();
    await readerContext.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("actual SessionStore publications retain DSMM markers and native message history exactly once", async () => {
  const f = await fixture();
  const readerContext = new Context();
  try {
    const session = f.ctx.sessions.prepare(SessionId("dsmm-live-reopen"));
    const writer = await f.persistence.create(session.header);
    f.publish(session);
    const mode = session.append("deepwork/mode", { active: true });
    session.append("dsmm/role-policy", { version: 1, role: "dsmm-reviewer", policy: "a".repeat(64) });
    const message = createUserMessage({ content: [{ type: "text", text: "preserved history" }], source: { kind: "user" } });
    session.append("user/message", message, { surfaceOp: "append" });
    assert.equal(await f.ctx.sessions.flush(session), true);
    assert.equal(mode.ignorable, undefined);
    assert.ok(Object.isFrozen(mode));
    await writer.close();
    await readerContext.plugin(JsonlSessionPersistence, { root: f.root, compression: "none" }).await();
    const reader = await readerContext.sessionPersistence.open(session.id, "read");
    const result = await reader.read();
    assert.deepEqual(result.events.map((event) => event.seq), [0, 1, 2]);
    assert.deepEqual(result.events.map((event) => event.ignorable), [true, true, undefined]);
    assert.equal(result.events[1]?.data && (result.events[1].data as { role?: string }).role, "dsmm-reviewer");
    const restored = Session.fromRestore(session.id, result.events, reader.header, reader.inheritedEventCount, result.eventState);
    assert.equal(isDeepworkActive(result.events), true);
    assert.deepEqual(restored.deriveMessages(), session.deriveMessages());
    await reader.close();
  } finally {
    await readerContext.fiber.dispose();
    await f.dispose();
  }
});

test("direct and live appends share sequence order and coalesce matching route overlap", async () => {
  const f = await fixture();
  try {
    const session = f.ctx.sessions.prepare(SessionId("dsmm-mixed-routes"));
    const writer = await f.persistence.create(session.header);
    f.publish(session);
    const first = session.append("deepwork/mode", { active: true });
    const firstAppend = writer.append([first]);
    const second = session.append("dsmm/role-policy", { version: 1, role: "dsmm-builder", policy: null });
    const secondAppend = writer.append([second]);
    session.append("deepwork/mode", { active: false });
    await Promise.all([firstAppend, secondAppend]);
    await f.ctx.sessions.flush(session);
    const result = await writer.read();
    assert.deepEqual(result.events.map((event) => event.seq), [0, 1, 2]);
    assert.deepEqual(result.events.map((event) => event.type), ["deepwork/mode", "dsmm/role-policy", "deepwork/mode"]);
    await writer.close();
  } finally { await f.dispose(); }
});

test("a queued background timer cannot consume a later direct append's live overlap", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  let observeStart!: () => void;
  let releaseAppend!: () => void;
  let observeAutomaticDrain!: () => void;
  const started = new Promise<void>((resolve) => { observeStart = resolve; });
  const release = new Promise<void>((resolve) => { releaseAppend = resolve; });
  const automaticDrain = new Promise<void>((resolve) => { observeAutomaticDrain = resolve; });
  const persistedSequences: number[] = [];
  const originalCreate = JsonlSessionPersistence.prototype.create;
  t.mock.method(JsonlSessionPersistence.prototype, "create", async function(
    this: JsonlSessionPersistence, ...args: Parameters<typeof originalCreate>
  ) {
    const native = await originalCreate.apply(this, args);
    const originalAppend = native.append.bind(native);
    let held = false;
    t.mock.method(native, "append", async (...appendArgs: Parameters<typeof originalAppend>) => {
      if (!held && appendArgs[0][0]?.seq === 0) {
        held = true;
        observeStart();
        await release;
      }
      await originalAppend(...appendArgs);
      persistedSequences.push(...appendArgs[0].map((event) => event.seq));
      if (appendArgs[0].length === 0) observeAutomaticDrain();
    });
    return native;
  });
  const f = await fixture();
  const accepted: Promise<void>[] = [];
  try {
    const session = f.ctx.sessions.prepare(SessionId("dsmm-queued-timer-order"));
    const writer = await f.persistence.create(session.header);
    f.publish(session);
    const first = session.append("deepwork/mode", { active: true });
    accepted.push(writer.append([first]));
    await started;
    session.append("deepwork/mode", { active: false });
    t.mock.timers.tick(200); // Queue the earlier timer behind the held native append.

    // Both routes use real Session-produced immutable events. Frozen time makes
    // the detached candidate exactly match the later store publication.
    const candidate = Session.create(SessionId("dsmm-direct-candidate"));
    candidate.append("deepwork/mode", { active: true });
    candidate.append("deepwork/mode", { active: false });
    const data = { version: 1 as const, role: "dsmm-builder" as const, policy: null };
    const direct = candidate.append("dsmm/role-policy", data);
    accepted.push(writer.append([direct]));
    assert.deepEqual(session.append("dsmm/role-policy", data), direct);
    releaseAppend();
    await Promise.all(accepted);
    t.mock.timers.tick(200);
    await automaticDrain; // The bounded timer must rearm its later live overlap.
    assert.deepEqual(persistedSequences, [0, 1, 2]);
    await f.ctx.sessions.flush(session);
    assert.deepEqual((await writer.read()).events.map((event) => event.seq), [0, 1, 2]);
    await writer.close();
  } finally {
    releaseAppend();
    await Promise.allSettled(accepted);
    await f.dispose();
  }
});

test("a session checkpoint flushes only that writer, not unrelated live buffers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = await fixture();
  try {
    const sessions = ["checkpoint-a", "checkpoint-b"].map((id) => f.ctx.sessions.prepare(SessionId(id)));
    const writers = await Promise.all(sessions.map((session) => f.persistence.create(session.header)));
    for (const session of sessions) {
      f.publish(session);
      session.append("deepwork/mode", { active: true });
    }
    await f.ctx.sessions.flush(sessions[0]!);
    assert.equal((await writers[0]!.read()).events.length, 1);
    assert.equal((await writers[1]!.read()).events.length, 0);
    await f.persistence.flush();
    assert.equal((await writers[1]!.read()).events.length, 1);
    await Promise.all(writers.map((writer) => writer.close()));
  } finally { await f.dispose(); }
});

test("failed native live writes retain their batch, pause automatic retries, and retry at an explicit barrier", { timeout: 5000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = await fixture();
  try {
    const warnings: unknown[][] = [];
    let observeWarning!: () => void;
    const warned = new Promise<void>((resolve) => { observeWarning = resolve; });
    f.ctx.logger.exporter({ levels: { default: 3 }, export(message) {
      if (message.type === "warn") { warnings.push(message.args); observeWarning(); }
    } });
    const session = f.ctx.sessions.prepare(SessionId("dsmm-native-failure"));
    const writer = await f.persistence.create(session.header);
    f.publish(session);
    await writeFile(f.root, "fixture filesystem obstruction");
    session.append("deepwork/mode", { active: true });
    t.mock.timers.tick(200);
    await warned;
    session.append("dsmm/role-policy", { version: 1, role: "dsmm-reviewer", policy: "b".repeat(64) });
    t.mock.timers.tick(1000);
    await Promise.resolve();
    assert.equal(warnings.length, 1);
    assert.deepEqual(warnings[0], ["Deepwork session persistence failed", { sessionId: session.id, errorClass: "Error" }]);
    assert.doesNotMatch(JSON.stringify(warnings), /obstruction|bbbb|logs|ENOTDIR/);
    await assert.rejects(f.ctx.sessions.flush(session));
    await unlink(f.root);
    await mkdir(f.root);
    await f.ctx.sessions.flush(session);
    assert.deepEqual((await writer.read()).events.map((event) => event.seq), [0, 1]);
    await writer.close();
  } finally { await f.dispose(); }
});

test("provider disposal waits for accepted direct writes and buffered live records before native teardown", async () => {
  const f = await fixture();
  const readerContext = new Context();
  try {
    const session = f.ctx.sessions.prepare(SessionId("dsmm-dispose-inflight"));
    const writer = await f.persistence.create(session.header);
    const initial = session.append("deepwork/mode", { active: true });
    const appending = writer.append([initial]);
    f.publish(session);
    session.append("dsmm/role-policy", { version: 1, role: "dsmm-planner", policy: null });
    await Promise.all([appending, f.persistenceFiber.dispose()]);
    await assert.rejects(writer.read(), SessionHandleClosedError);
    await readerContext.plugin(JsonlSessionPersistence, { root: f.root, compression: "none" }).await();
    const reader = await readerContext.sessionPersistence.open(session.id, "write");
    assert.deepEqual((await reader.read()).events.map((event) => event.seq), [0, 1]);
    await reader.close();
  } finally {
    await readerContext.fiber.dispose();
    await f.dispose();
  }
});

test("native ownership, errors, cancellation, snapshots, and empty-session durability are preserved", async () => {
  const f = await fixture();
  try {
    const session = Session.create(SessionId("dsmm-public-contract"));
    const writer = await f.persistence.create(session.header);
    await assert.rejects(f.persistence.create(session.header), SessionAlreadyExistsError);
    await assert.rejects(f.persistence.open(session.id, "write"), SessionAlreadyOwnedError);
    const readOnly = await f.persistence.open(session.id, "read");
    await assert.rejects(readOnly.append([]), SessionReadOnlyError);
    await assert.rejects(readOnly.flush(), SessionReadOnlyError);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(writer.append([session.append("deepwork/mode", { active: true })], { signal: controller.signal }), { name: "AbortError" });
    assert.equal((await writer.read()).events.length, 0);
    await writer.flush();
    assert.equal((await f.persistence.list()).length, 1);
    assert.equal((await f.persistence.stat(session.id))?.header.id, session.id);
    const descriptor = Object.getOwnPropertyDescriptor(f.persistence, DSMM_PERSISTENCE_COMPATIBILITY);
    assert.deepEqual(descriptor, { value: true, writable: false, configurable: false, enumerable: false });
    await writer.close();
    await writer.close();
    const reopened = await f.persistence.open(session.id, "write");
    assert.equal((await reopened.read()).events.length, 0);
    await reopened.close();
    await readOnly.close();
    assert.equal((await readdir(f.root)).length, 1);
  } finally { await f.dispose(); }
});

test("unrelated unknown required vocabulary is not made ignorable and still refuses native reads", async () => {
  const f = await fixture();
  try {
    const session = Session.create(SessionId("dsmm-unknown-required"));
    const writer = await f.persistence.create(session.header);
    const unknown = { type: "future/required", seq: SessionSeq(0), time: 1, data: {} } as unknown as SessionEvent;
    await writer.append([unknown]);
    await writer.close();
    await assert.rejects(f.persistence.open(session.id, "read"), SessionFormatUnsupportedError);
  } finally { await f.dispose(); }
});

test("session disposal drains its real published events and releases native write ownership", async () => {
  const f = await fixture();
  try {
    const session = f.ctx.sessions.prepare(SessionId("dsmm-session-disposed"));
    const writer = await f.persistence.create(session.header);
    const detach = f.ctx.sessions.enter(session);
    f.ctx.sessions.announce(session);
    session.append("deepwork/mode", { active: true });
    detach();
    await writer.close();
    await assert.rejects(writer.append([]), SessionHandleClosedError);
    const reopened = await f.persistence.open(session.id, "write");
    assert.equal((await reopened.read()).events[0]?.ignorable, true);
    await reopened.close();
  } finally { await f.dispose(); }
});

test("shutdown includes a native handle whose create is still in flight", async () => {
  const f = await fixture();
  try {
    const session = Session.create(SessionId("dsmm-pending-create"));
    const creating = f.persistence.create(session.header);
    const disposing = f.persistenceFiber.dispose();
    const writer = await creating;
    await disposing;
    await assert.rejects(writer.read(), SessionHandleClosedError);
    const nativeContext = new Context();
    try {
      await nativeContext.plugin(JsonlSessionPersistence, { root: f.root, compression: "none" }).await();
      const reopened = await nativeContext.sessionPersistence.open(session.id, "write");
      assert.equal((await reopened.read()).events.length, 0);
      await reopened.close();
    } finally { await nativeContext.fiber.dispose(); }
  } finally { await f.dispose(); }
});

test("malformed direct DSMM metadata is refused before any native batch is stored", async () => {
  const f = await fixture();
  try {
    const session = Session.create(SessionId("dsmm-malformed-direct"));
    const writer = await f.persistence.create(session.header);
    const valid = session.append("deepwork/mode", { active: true });
    for (const extra of [{ surfaceOp: "append" }, { sourceEventSeqs: [] }, { unexpected: "hidden" }]) {
      const malformed = { ...valid, ...extra } as unknown as SessionEvent;
      await assert.rejects(writer.append([malformed]), /refusing to mark it ignorable/);
    }
    assert.equal((await writer.read()).events.length, 0);
    await writer.append([valid]);
    await writer.close();
  } finally { await f.dispose(); }
});
