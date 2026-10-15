import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { downloadPublishedLegacyArtifact } from "./published-legacy-artifact-fixture.mjs";

const [phase, root] = process.argv.slice(2);
if (phase === "download-artifact") {
  console.log(JSON.stringify(await downloadPublishedLegacyArtifact(root)));
} else if (phase === "resume") {
  const { fixture } = await import("./legacy-read-integration-fixture.mjs");
  const records = JSON.parse(await readFile(join(root, "children.json"), "utf8")), rows = [];
  for (const record of records) {
    const f = await fixture({ root, parentId: record.parentId, childId: record.childId, coldCore: true });
    try {
      assert.equal(f.child.id, record.childId);
      assert.equal(await f.runtime.childCaptureStore.readChildAdmission(f.child.id, f.parent.id), null);
      const original = f.child.session.ownEvents().slice(0, record.ownEvents.length);
      assert.deepEqual(original, record.ownEvents);
      const admission = f.runtime.admission(f.child);
      assert.equal(admission.childEvidence.mode, "legacy-conservative");
      assert.equal(f.runtime.admission(f.parent).settings.guards.gitWriteGuard, record.role === "coding" ? "off" : "deny");
      if (record.role === "reviewer") {
        assert.ok(f.integration.core); assert.equal(f.authority, f.native.authority); assert.equal(f.integration.view().state, "ready");
        const result = await f.execute({ file_path: "permitted-read.txt", limit: 1 });
        assert.equal(result.isError, false); assert.equal(result.value.lines[0].text, "useful permitted read"); assert.equal(f.bodies.read, 1);
        const audit = await f.settle(); assert.equal(audit.length, 1); assert.equal(audit[0].child, record.childId);
      } else {
        // No complete original allow ceiling: current parent's new Git-off does not prove the old read/shell capability.
        await assert.rejects(f.attach(), { code: "evidence-unavailable" });
        assert.equal((await f.execute({ file_path: "permitted-read.txt" })).isError, true);
      }
      for (const name of ["integration_write", "integration_shell", "integration_delegate"]) assert.equal((await f.execute({}, undefined, name)).isError, true);
      assert.equal(f.bodies.write, 0); assert.equal(f.bodies.shell, 0);
      assert.equal(f.runtime.admission(f.child), admission);
      assert.equal(await f.runtime.childCaptureStore.readChildAdmission(f.child.id, f.parent.id), null);
      rows.push({ childId: f.child.id, role: record.role, bodies: f.bodies, mode: admission.childEvidence.mode });
    } finally { await f.dispose(); }
  }
  console.log(JSON.stringify({ pid: process.pid, rows, shutdown: true }));
} else throw new Error("Unknown published integration fixture phase");
