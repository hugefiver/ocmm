import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const loader = new URL("./child-admission-source-loader.mjs", import.meta.url).href;
const fixture = fileURLToPath(new URL("./child-admission-guards-fixture.mjs", import.meta.url));
for (const [phase, requirement] of [
  ["identity", "issued ticket provenance, exact direct-parent registry identity and establishing descriptor source"],
  ["observed-revocation", "merged evidence observation cancellation and model/Gateway delivery use actual original capture plus current parent authority"],
  ["owner-teardown", "controlled owner teardown synchronously revokes all exact root tickets before native drain waits and accepts no pending delivery"],
  ["cold-materialization", "revocation during native cold materialization accepts no message and permits a fresh same-ID invocation"],
  ["delegating-child", "delegating children register their original admission and cold resume preserves direct grandchild adjacency/depth"],
  ["capture-integrity", "corrupt or missing-version capture and missing retained durable capture never downgrade to legacy"],
  ["unsupported-admission", "old captures, captureless children and compatibility startup fail closed without rewriting native logs or captures"],
] as const) {
  test(requirement, () => {
    const root = mkdtempSync(join(tmpdir(), "dsmm-c2b-native-"));
    try {
      const result = spawnSync(process.execPath, ["--import", loader, fixture, phase, root], { encoding: "utf8", timeout: 60000 });
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.equal(JSON.parse(result.stdout.trim().split("\n").at(-1)!).shutdown, true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
