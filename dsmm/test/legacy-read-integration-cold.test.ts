import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const directory = fileURLToPath(new URL(".", import.meta.url));
const cases = [
  ["cold-read", "cold same-owner managed consumer guards inherited read before holder-ready and executes the real proxy once"],
  ["delivery-config", "cold evidence/delivery callbacks preserve actual A role Apply before the managed native inbox"],
  ["disposal-audit", "cold disposal revokes the parent immediately and drains the real audit before native teardown"],
  ["no-hot-replacement", "an enabled actual C1 authority rejects late Core adapter replacement"],
  ["automatic-retirement", "cold actual child retirement revokes its proxy and re-enrolls the same ID with a fresh closed generation"],
  ["off", "omitted trusted cold startup preserves Core legacy unavailable"],
  ["unknown", "a cold consumer cannot certify an unknown chain from ordinary startup configuration"],
] as const;
for (const [scenario, title] of cases) test(title, { timeout: 30_000 }, () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--import", "./child-admission-source-loader.mjs",
    "./legacy-read-integration-cold-fixture.mjs", scenario], { cwd: directory, encoding: "utf8", timeout: 25_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout.trim().split("\n").at(-1)!).shutdown, true);
});
