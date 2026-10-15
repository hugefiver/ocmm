import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

test("effective pnpm configuration approves only the two pinned required dependency builds", () => {
  const config = JSON.parse(execFileSync(
    process.platform === "win32" ? "cmd.exe" : "pnpm",
    process.platform === "win32"
      ? ["/d", "/s", "/c", "pnpm config list --json"]
      : ["config", "list", "--json"],
    { cwd: new URL("../", import.meta.url), encoding: "utf8" },
  ));
  assert.equal(config.strictDepBuilds, true);
  for (const key of ["dangerouslyAllowAllBuilds", "onlyBuiltDependencies", "ignoredBuiltDependencies", "neverBuiltDependencies", "ignoreDepScripts"]) {
    assert.equal(config[key], undefined, `${key} must not override build approvals`);
  }

  const approvals = Object.entries(config.allowBuilds);
  for (const [dependency, allowed] of approvals) {
    assert.equal(typeof allowed, "boolean", `${dependency} must have an explicit build decision`);
  }
  assert.deepEqual(approvals.filter(([, allowed]) => allowed).map(([dependency]) => dependency).sort(), [
    "esbuild@0.25.12",
    "koffi@3.1.1",
  ]);
  assert.equal(config.allowBuilds["@google/genai@2.21.0"], false);
  assert.equal(config.allowBuilds["protobufjs@7.6.6"], false);
});
