import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { findPackageJSON } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  DESKTOP_COMMIT, DESKTOP_SOURCE_BLOBS, TUI_PACKAGE, assertContainedLinks, assertDesktopSource,
  coldProfileInputs, copyFixtureTree, isolatedApplicationEnvironment, runApplicationNode, setTreeWritable, validateColdProfileSdk,
} from "./cold-profile-genuine-helper.mjs";

/** Explicit network preparation, confined to a fresh caller-selected task directory. */
export async function prepareColdProfileGenuineSeed({ destination, installAnchor }) {
  installAnchor = await validateColdProfileSdk(installAnchor);
  assert.ok(typeof destination === "string" && isAbsolute(destination), "Seed destination must be an explicit absolute task-owned path");
  const parent = await realpath(dirname(destination));
  destination = join(parent, basename(destination));
  const temporaryParents = [await realpath(tmpdir())];
  if (process.env.RUNNER_TEMP) temporaryParents.push(await realpath(process.env.RUNNER_TEMP));
  assert.ok(temporaryParents.some(root => {
    const path = relative(root, destination);
    return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
  }), "Preparation may write only within task-owned temporary storage");
  await mkdir(destination, { mode: 0o700 });
  const provisionRoot = join(destination, "provision");
  await mkdir(provisionRoot);
  const env = await isolatedApplicationEnvironment(provisionRoot);
  runApplicationNode([
    join(dirname(installAnchor), "lib", "bin.js"), "plugin", "--profile", "dsh-tui", "add", `${TUI_PACKAGE}@0.13.0`, "--ignore-scripts",
  ], { root: provisionRoot, env }, 240_000);
  const profile = join(env.DSH_HOME, "profiles", "dsh-tui");
  await assertContainedLinks(profile);
  await copyFixtureTree(profile, join(destination, "tui-profile"));
  const sourceManifest = fileURLToPath(new URL("../package.json", import.meta.url));
  const dsmm = JSON.parse(await readFile(sourceManifest, "utf8"));
  const dependencies = {};
  const dsmmDependencies = {};
  const sourceRoot = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
  for (const [name, spec] of Object.entries(dsmm.dependencies)) {
    const selectedManifest = findPackageJSON(name, pathToFileURL(sourceManifest));
    assert.ok(selectedManifest, `Install the frozen source dependency ${name} before seed preparation`);
    const selected = relative(sourceRoot, await realpath(selectedManifest));
    assert.ok(selected !== ".." && !selected.startsWith(`..${sep}`) && !isAbsolute(selected), "DSMM seed dependencies must come from the frozen project dependency closure");
    const metadata = JSON.parse(await readFile(selectedManifest, "utf8"));
    assert.equal(metadata.name, name);
    dependencies[name] = metadata.version;
    dsmmDependencies[name] = { spec, version: metadata.version };
  }
  const dependencyProject = join(provisionRoot, "dsmm-dependencies");
  await mkdir(dependencyProject);
  await writeFile(join(dependencyProject, "package.json"), JSON.stringify({ private: true, dependencies }));
  await writeFile(join(dependencyProject, "pnpm-workspace.yaml"), "packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\n");
  const installed = spawnSync(process.platform === "win32" ? "pnpm.exe" : "pnpm", ["install", "--ignore-scripts"], {
    cwd: dependencyProject, env, encoding: "utf8", timeout: 240_000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(installed.error);
  assert.equal(installed.status, 0, installed.stderr + installed.stdout);
  await assertContainedLinks(dependencyProject);
  await copyFixtureTree(dependencyProject, join(destination, "dsmm-dependencies"));
  for (const path of Object.keys(DESKTOP_SOURCE_BLOBS)) {
    const url = `https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/${DESKTOP_COMMIT}/apps/desktop/${path}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "error" });
    assert.equal(response.status, 200, url);
    const bytes = Buffer.from(await response.arrayBuffer());
    assertDesktopSource(path, bytes);
    const output = join(destination, "desktop", path);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, bytes);
  }
  const desktop = JSON.parse(await readFile(join(destination, "desktop", "package.json"), "utf8"));
  assert.equal(desktop.version, "0.2.1-alpha.1");
  await writeFile(join(destination, "seed.json"), JSON.stringify({
    schemaVersion: 2, sdkVersion: "0.2.0-rc.2", platform: { os: process.platform, arch: process.arch }, dsmmDependencies,
    tui: { name: TUI_PACKAGE, version: "0.13.0" },
    desktop: { repository: "deepseek-ai/deepseek-harness", commit: DESKTOP_COMMIT, version: desktop.version },
  }, null, 2) + "\n");
  await coldProfileInputs({ DSMM_COLD_PROFILE_SDK_ANCHOR: installAnchor, DSMM_COLD_PROFILE_GENUINE_SEED: destination });
  assert.equal(dirname(await realpath(provisionRoot)), destination);
  await rm(provisionRoot, { recursive: true, force: true });
  await setTreeWritable(destination, false);
  return { installAnchor, seedRoot: destination };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { destination: { type: "string" } } });
  console.log(JSON.stringify(await prepareColdProfileGenuineSeed({ destination: values.destination, installAnchor: process.env.DSMM_COLD_PROFILE_SDK_ANCHOR })));
}
