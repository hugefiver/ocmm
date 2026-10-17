import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { childFixture, accepted } from "./child-admission-native-fixture.mjs";
import { projectChildAdmissionEvidence } from "../src/child-admission.ts";

const [phase, root] = process.argv.slice(2);
assert.ok(root);
await mkdir(root, { recursive: true });
const f = await childFixture(root);
const rows = [];
try {
  if (phase === "captured-create") {
    for (const role of ["reviewer", "coding"]) {
      const parent = await f.create(`owned-${role}`);
      await f.applyOriginal(parent, role);
      const start = await f.start(parent, role, role === "reviewer" ? { allow: ["read"] } : null);
      const child = f.ctx.agents.get(start.childId);
      await child.whenIdle();
      assert.equal((await f.execute(child, "read")).isError, false);
      const push = await f.execute(child, "pwsh", { command: "git push origin task-counter-only" });
      assert.equal(push.isError, true); assert.equal(f.bodies.pwsh, 0);
      const capture = await f.runtime.childCaptureStore.readChildAdmission(child.id, parent.id);
      await f.ctx.sessions.flush(child.session);
      const readHandle = await f.ctx.sessionPersistence.open(child.id, "read");
      let ownEvents;
      try { ownEvents = (await readHandle.read()).events.slice(readHandle.inheritedEventCount); }
      finally { await readHandle.close(); }
      rows.push({ parentId: parent.id, childId: child.id, role, originalEpoch: capture?.originalAdmissionEpoch,
        originalProfile: capture?.profilePin, ownEvents });
      if (role === "coding") await f.applyOff(parent);
      assert.equal(f.runtime.admission(parent).settings.guards.gitWriteGuard, role === "coding" ? "off" : "deny");
    }
    await writeFile(join(root, "children.json"), JSON.stringify(rows));
  } else if (phase === "resume") {
    const saved = JSON.parse(await readFile(join(root, "children.json"), "utf8"));
    for (const row of saved) {
      const parent = await f.resume(row.parentId);
      const previous = f.ctx.agents.get(row.childId);
      assert.equal(previous, undefined);
      const ticket = f.bridge.authority.acquireParentTicket(parent);
      const evidence = await f.bridge.authority.resolveChildEvidence(ticket, row.childId, new AbortController().signal);
      assert.equal(evidence.originalAdmissionEpoch, row.originalEpoch); assert.deepEqual(evidence.profilePin, row.originalProfile);
      await f.native.sendMessage(parent, row.childId, [{ type: "text", text: "same ID next useful turn" }], { signal: new AbortController().signal });
      let child = f.ctx.agents.get(row.childId);
      assert.ok(child); assert.equal(child.id, row.childId);
      await child.whenIdle();
      const originalPrefix = child.session.ownEvents().slice(0, row.ownEvents.length);
      assert.deepEqual(originalPrefix, row.ownEvents, "Native continuation only appends; old records are not rewritten");
      const read = await f.execute(child, "read");
      assert.equal(read.isError, false); assert.equal(read.value, "useful permitted read");
      for (const name of ["write", "pwsh"]) {
        const result = await f.execute(child, name, name === "pwsh" ? { command: "git push origin task-counter-only" } : {});
        if (name === "pwsh" || row.role === "reviewer") assert.equal(result.isError, true);
        else { assert.equal(result.isError, false); assert.equal(result.value, "counter-only body"); }
      }
      assert.equal(f.bodies.pwsh, 0);
      const parentEpoch = f.runtime.admission(parent).epoch;
      const admitted = f.runtime.admission(child);
      const projection = projectChildAdmissionEvidence(evidence, parentEpoch);
      assert.equal(projection.parentAdmissionEpoch, parentEpoch);
      if (row.role === "coding") {
        assert.equal(f.runtime.admission(parent).settings.guards.gitWriteGuard, "off", "The new parent really has the expanded setting");
        assert.equal(f.runtime.admission(parent).settings.roleRouting["dsmm-coding"].primary.model, "coding-parent-new");
        assert.equal(f.runtime.admission(parent).settings.locale, "en");
      }
      assert.equal(admitted.epoch, row.originalEpoch);
      assert.equal(admitted.settings.guards.gitWriteGuard, "deny");
      assert.equal(admitted.settings.locale, "ja");
      assert.equal(projection.originalAdmissionEpoch, row.originalEpoch);
      assert.equal(child.options.maxTokens, undefined);
      const receipt = await f.prompt(parent, row.childId, "native browser protocol continuation");
      child = f.ctx.agents.get(row.childId);
      assert.ok(accepted(child).some(entry => entry.id === receipt.messageId));
      await child.whenIdle();
      const events = child.session.ownEvents();
      assert.equal(events.findLast(event => event.type === "turn/end").data.reason.kind, "completed");
      assert.ok(events.findLast(event => event.type === "assistant/message").data.message.content.some(block => block.type === "text" && block.text === "useful same-ID native continuation"));
      const last = f.adapter.calls.at(-1);
      assert.equal(last.model, `${row.role}-original`);
      assert.equal(last.reasoningEffort, "high");
      rows.push({ parentId: parent.id, childId: child.id, role: row.role, parentEpoch, mode: evidence.mode ?? "captured",
        readUseful: !read.isError, originalEpoch: row.originalEpoch, maxTokensDefault: child.options.maxTokens === undefined });
    }
  } else throw new Error("Unknown process fixture phase");
} finally { await f.dispose(); }
// A terminated producer is required before the parent launches this resumer.
console.log(JSON.stringify({ phase, pid: process.pid, shutdown: true, rows: rows.map(({ ownEvents, ...row }) => row), bodies: f.bodies,
  ...(phase === "resume" ? { usefulTurns: f.adapter.calls.length } : {}) }));
