import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const loader = new URL("./child-admission-source-loader.mjs", import.meta.url).href;
const fixture = fileURLToPath(new URL("./child-admission-process-fixture.mjs", import.meta.url));
interface Result { pid: number; shutdown: boolean; rows: Array<{ childId: string; mode?: string; readUseful?: boolean }>; bodies: { read: number; write: number; pwsh: number }; usefulTurns?: number }
function run(phase: string, root: string, artifact?: string): Result {
  const child = spawnSync(process.execPath, ["--import", loader, fixture, phase, root, ...artifact === undefined ? [] : [artifact]], { encoding: "utf8", timeout: 60000 });
  assert.equal(child.status, 0, child.stderr + child.stdout);
  const result = JSON.parse(child.stdout.trim().split("\n").at(-1)!) as Result;
  assert.equal(result.shutdown, true);
  return result;
}

function recordBytes(directory: string, prefix = ""): Map<string, Buffer> {
  const records = new Map<string, Buffer>();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name), relative = join(prefix, entry.name);
    if (entry.isDirectory()) for (const [name, bytes] of recordBytes(path, relative)) records.set(name, bytes);
    else if (entry.name.endsWith(".jsonl")) records.set(relative, readFileSync(path));
  }
  return records;
}

test("durable captured children recover in a new process with the same ID and original permissions after parent-only Apply", (t) => {
  const root = mkdtempSync(join(tmpdir(), "dsmm-c2b-captured-"));
  try {
    const producer = run("captured-create", root);
    const resumer = run("resume", root);
    assert.notEqual(producer.pid, resumer.pid);
    assert.deepEqual(resumer.rows.map(row => row.childId), producer.rows.map(row => row.childId));
    assert.ok(resumer.rows.every(row => row.mode === "captured"));
    assert.ok(resumer.rows.every(row => row.readUseful === true));
    assert.deepEqual(resumer.bodies, { read: 2, write: 1, pwsh: 0 });
    assert.ok(resumer.usefulTurns! >= 4);
    t.diagnostic(`producer=${producer.pid} closed; resumer=${resumer.pid}; same IDs=${resumer.rows.length}; bodies=${JSON.stringify(resumer.bodies)}; useful turns=${resumer.usefulTurns}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("published 0.2 children recover conservatively with useful same-ID continuation, no unleased read/write/shell bodies or migration", (t) => {
  const artifact = process.env.DSMM_TEST_LEGACY_ARTIFACT;
  assert.ok(artifact, "Provide the verified published 0.2 archive as an isolated fixture input");
  const root = mkdtempSync(join(tmpdir(), "dsmm-c2b-legacy-"));
  try {
    const producer = run("old-create", root, artifact);
    const originalRecords = recordBytes(join(root, "sessions"));
    assert.ok(originalRecords.size > 0);
    const resumer = run("resume", root);
    assert.notEqual(producer.pid, resumer.pid);
    assert.deepEqual(resumer.rows.map(row => row.childId), producer.rows.map(row => row.childId));
    assert.ok(resumer.rows.every(row => row.mode === "legacy-conservative"));
    assert.ok(resumer.rows.every(row => row.readUseful === false));
    assert.deepEqual(resumer.bodies, { read: 0, write: 0, pwsh: 0 });
    assert.ok(resumer.usefulTurns! >= 4);
    for (const [relative, bytes] of originalRecords) {
      assert.deepEqual(readFileSync(join(root, "sessions", relative)).subarray(0, bytes.length), bytes, "Original native physical bytes are immutable; continuation may append");
    }
    t.diagnostic(`published producer=${producer.pid} closed; new resumer=${resumer.pid}; same IDs=${resumer.rows.length}; bodies=${JSON.stringify(resumer.bodies)}; useful turns=${resumer.usefulTurns}; immutable native logs=${originalRecords.size}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
