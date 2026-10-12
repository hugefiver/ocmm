import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

function nativeRecords(directory: string, prefix = ""): Map<string, Buffer> {
  const rows = new Map<string, Buffer>();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name), relative = join(prefix, entry.name);
    if (entry.isDirectory()) for (const [key, bytes] of nativeRecords(path, relative)) rows.set(key, bytes);
    else if (entry.name.endsWith(".jsonl")) rows.set(relative, readFileSync(path));
  }
  return rows;
}
test("published 0.2 captureless same-ID reviewer uses the production leased adapter and actual native FS in a second process", t => {
  const artifact = process.env.DSMM_TEST_LEGACY_ARTIFACT;
  assert.ok(artifact, "Provide the verified published 0.2 artifact as an isolated readonly fixture input");
  const root = mkdtempSync(join(tmpdir(), "dsmm-legacy-integration-published-"));
  const run = (file: string, ...args: string[]) => {
    const result = spawnSync(process.execPath, ["--import", new URL("./child-admission-source-loader.mjs", import.meta.url).href,
      fileURLToPath(new URL(file, import.meta.url)), ...args], { encoding: "utf8", timeout: 60000 });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    return JSON.parse(result.stdout.trim().split("\n").at(-1)!);
  };
  try {
    const producer = run("./child-admission-process-fixture.mjs", "old-create", root, artifact);
    const records = nativeRecords(join(root, "sessions"));
    const resumer = run("./legacy-read-integration-published-fixture.mjs", "resume", root);
    assert.notEqual(producer.pid, resumer.pid); assert.equal(producer.shutdown, true); assert.equal(resumer.shutdown, true);
    assert.deepEqual(resumer.rows.map((row: { childId: string }) => row.childId), producer.rows.map((row: { childId: string }) => row.childId));
    assert.deepEqual(resumer.rows[0].bodies, { read: 1, write: 0, shell: 0 });
    for (const [relative, bytes] of records) assert.deepEqual(readFileSync(join(root, "sessions", relative)).subarray(0, bytes.length), bytes);
    t.diagnostic(`published producer=${producer.pid}; new resumer=${resumer.pid}; same IDs=${resumer.rows.length}; reviewer actual native read=1; original native records preserved`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
