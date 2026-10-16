import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { PROFILE_UI_HARNESS_FILES, parseArtifactOptions } from "./docker-smoke.mjs";

export function nativeGateArguments(controlRoot, { artifact, image, sha256, receipt, evidenceDir }) {
  const scripts = join(resolve(controlRoot), "dsmm", "scripts");
  return ["--artifact", artifact, "--image", image, "--expected-sha256", sha256, "--receipt", receipt, "--require-hook",
    "--acceptance-hook", join(scripts, "profile-ui-acceptance.mjs"),
    ...PROFILE_UI_HARNESS_FILES.flatMap(file => ["--hook-support", join(scripts, file)]), "--evidence-dir", evidenceDir];
}
export function runNativeGate(controlRoot, options, execute = spawnSync) {
  const args = nativeGateArguments(controlRoot, options);
  parseArtifactOptions(args);
  const result = execute(process.execPath, [join(resolve(controlRoot), "dsmm/scripts/docker-smoke.mjs"), ...args], { stdio: "inherit", shell: false });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, "complete native/browser acceptance failed");
}
export function parseNativeGateOptions(args) {
  const keys = ["control-root", "artifact", "image", "sha256", "receipt", "evidence-dir"];
  const { values } = parseArgs({ args, options: Object.fromEntries(keys.map(key => [key, { type: "string" }])) });
  for (const key of keys) assert.ok(typeof values[key] === "string" && values[key].length > 0, `missing ${key}`);
  return { controlRoot: values["control-root"], options: { ...values, evidenceDir: values["evidence-dir"] } };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { controlRoot, options } = parseNativeGateOptions(process.argv.slice(2));
  runNativeGate(controlRoot, options);
}
