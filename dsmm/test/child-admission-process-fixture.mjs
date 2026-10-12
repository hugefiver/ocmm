import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { childFixture, accepted } from "./child-admission-native-fixture.mjs";
import { parseChildAdmissionEvidenceView } from "../src/child-evidence.ts";
import { projectChildAdmissionEvidence } from "../src/child-admission.ts";

const [phase, root, artifact] = process.argv.slice(2);
assert.ok(root);
await mkdir(root, { recursive: true });
let oldPackage;
if (phase === "old-create") {
  const bytes = await readFile(artifact);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "8aa093408b7831defdbe780e73a82c05ee75a270aada3e5700d1f1f6cf815a4c");
  const extracted = join(root, "published");
  await mkdir(extracted);
  const extraction = spawnSync("tar", ["-xf", artifact, "-C", extracted], { encoding: "utf8" });
  assert.equal(extraction.status, 0, extraction.stderr);
  oldPackage = await import(pathToFileURL(join(extracted, "package", "lib", "index.js")));
}
const f = await childFixture(root, { oldPackage });
const rows = [];
try {
  if (phase === "old-create" || phase === "captured-create") {
    for (const role of ["reviewer", "coding"]) {
      const parent = await f.create(`owned-${role}`);
      await f.applyOriginal(parent, role);
      const start = await f.start(parent, role, role === "reviewer" ? { allow: ["read"] } : null);
      const child = f.ctx.agents.get(start.childId);
      await child.whenIdle();
      assert.equal((await f.execute(child, "read")).isError, false);
      const push = await f.execute(child, "pwsh", { command: "git push origin task-counter-only" });
      assert.equal(push.isError, true); assert.equal(f.bodies.pwsh, 0);
      const capture = phase === "captured-create" ? await f.runtime.childCaptureStore.readChildAdmission(child.id, parent.id) : null;
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
      if (row.originalEpoch === undefined) assert.equal(evidence.mode, "legacy-conservative");
      else { assert.equal(evidence.originalAdmissionEpoch, row.originalEpoch); assert.deepEqual(evidence.profilePin, row.originalProfile); }
      await f.native.sendMessage(parent, row.childId, [{ type: "text", text: "same ID next useful turn" }], { signal: new AbortController().signal });
      let child = f.ctx.agents.get(row.childId);
      assert.ok(child); assert.equal(child.id, row.childId);
      await child.whenIdle();
      const originalPrefix = child.session.ownEvents().slice(0, row.ownEvents.length);
      assert.deepEqual(originalPrefix, row.ownEvents, "Native continuation only appends; old records are not rewritten");
      const read = await f.execute(child, "read");
      if (row.role === "reviewer" || row.originalEpoch !== undefined) { assert.equal(read.isError, false); assert.equal(read.value, "useful permitted read"); }
      for (const name of ["write", "pwsh"]) {
        const result = await f.execute(child, name, name === "pwsh" ? { command: "git push origin task-counter-only" } : {});
        if (row.originalEpoch === undefined || name === "pwsh" || row.role === "reviewer") assert.equal(result.isError, true);
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
        if (row.originalEpoch !== undefined) assert.equal(f.runtime.admission(parent).settings.locale, "en");
      }
      if (row.originalEpoch !== undefined) {
        assert.equal(admitted.epoch, row.originalEpoch);
        assert.equal(admitted.settings.guards.gitWriteGuard, "deny");
        assert.equal(admitted.settings.locale, "ja");
        assert.equal(projection.originalAdmissionEpoch, row.originalEpoch);
      } else {
        const view = parseChildAdmissionEvidenceView(admitted.childEvidence);
        assert.equal(view.mode, "legacy-conservative"); assert.equal(view.parentAdmissionEpoch, parentEpoch);
        assert.equal(Object.hasOwn(view, "originalAdmissionEpoch"), false);
        assert.ok(view.limitations.some(item => item.field === "max-tokens" && item.effect === "native-default"));
        assert.ok(view.provenFields.includes("max-tokens"), "The actual historical request budget is observable but not restored");
        assert.ok(view.limitations.some(item => item.field === "output-schema" && item.effect === "capability-denied"));
        assert.equal(admitted.profile, null);
        assert.equal(admitted.settings.guards.gitWriteGuard, "deny");
        assert.equal(await f.runtime.childCaptureStore.readChildAdmission(child.id, parent.id), null);
      }
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
    if (saved.every(row => row.originalEpoch === undefined)) assert.equal(f.bodies.write, 0);
  } else throw new Error("Unknown process fixture phase");
} finally { await f.dispose(); }
// A terminated producer is required before the parent launches this resumer.
console.log(JSON.stringify({ phase, pid: process.pid, shutdown: true, rows: rows.map(({ ownEvents, ...row }) => row), bodies: f.bodies,
  ...(phase === "resume" ? { usefulTurns: f.adapter.calls.length } : {}) }));
