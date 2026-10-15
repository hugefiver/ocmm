import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("cold-profile dormant compatibility and CAS use a fresh native Node host", t => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ["--test", fileURLToPath(new URL("./cold-profile-dormant.test.mjs", import.meta.url))], {
    env, encoding: "utf8", timeout: 300_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
  });
  t.diagnostic(child.stdout);
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr + child.stdout);
});
