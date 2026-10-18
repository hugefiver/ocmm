import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { dshPolicyForVersion } from "./release-contract.mjs";

export const SOURCE_SDK_INPUTS = Object.freeze([
  "tool-web", "plan-mode", "compaction-basic", "command-compact", "compaction-tool-result-pruner", "tool-ask-user", "tool-todo",
]);
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", shell: false, windowsHide: true, maxBuffer: 1024 * 1024 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, "native source SDK Docker operation failed");
  return result.stdout.trim();
}
export function validateSourceSdk(manifest, version) {
  assert.equal(lstatSync(manifest).isFile(), true);
  const metadata = JSON.parse(readFileSync(manifest, "utf8"));
  assert.equal(metadata.name, "@deepseek-ai/dsh"); assert.equal(metadata.version, dshPolicyForVersion(version).sdkVersion);
  const sdk = createRequire(manifest), root = realpathSync(dirname(manifest));
  for (const name of SOURCE_SDK_INPUTS) {
    const path = relative(root, realpathSync(sdk.resolve(`@deepseek-ai/dsh-${name}`)));
    assert.ok(path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path), "native source SDK input escaped the extracted closure");
  }
  return manifest;
}
export function extractRuntimeSdk({ image, destination, version }, execute = docker) {
  dshPolicyForVersion(version);
  assert.match(image, /^sha256:[a-f0-9]{64}$/u, "source SDK must use the exact locally built image ID");
  assert.equal(isAbsolute(destination), true);
  assert.equal(lstatSync(dirname(destination)).isDirectory(), true);
  assert.equal(existsSync(destination), false, "source SDK destination must be fresh task-owned storage");
  mkdirSync(destination, { mode: 0o700 });
  let container;
  let primary;
  let result;
  try {
    const created = execute(["create", "--pull=never", "--network", "none", image]);
    assert.match(created, /^[a-f0-9]{64}$/u, "source SDK extraction needs an exact created container ID");
    container = created;
    const manifest = join(destination, "dsh", "package.json");
    execute(["cp", `${container}:/usr/local/lib/node_modules/@deepseek-ai/dsh`, join(destination, "dsh")]);
    validateSourceSdk(manifest, version);
    result = { outcome: "READY", image, manifest, packageVersion: version, sourceOnly: true };
  } catch (error) { primary = error; }
  if (container !== undefined) {
    try { execute(["rm", container]); }
    catch (cleanup) { if (primary !== undefined) throw new AggregateError([primary, cleanup], "native source SDK extraction and container cleanup failed"); throw cleanup; }
  }
  if (primary !== undefined) throw primary;
  return result;
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { image: { type: "string" }, destination: { type: "string" }, version: { type: "string" } } });
  assert.ok(values.image && values.destination && values.version);
  const result = extractRuntimeSdk({ image: values.image, destination: resolve(values.destination), version: values.version });
  if (process.env.GITHUB_ENV !== undefined) appendFileSync(process.env.GITHUB_ENV, `DSMM_TEST_DSH_ENTRY=${result.manifest}\nDSMM_COLD_PROFILE_SDK_ANCHOR=${result.manifest}\n`);
  console.log(JSON.stringify(result));
}
