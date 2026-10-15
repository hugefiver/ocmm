import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("all cold-profile migration cases run in an isolated native Node host", { timeout: 660_000 }, t => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  const child = spawnSync(process.execPath, [fileURLToPath(new URL("./cold-profile-genuine-helper.mjs", import.meta.url)), "test"], {
    env, encoding: "utf8", timeout: 630_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
  t.diagnostic(child.stdout);
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr + child.stdout);
});
