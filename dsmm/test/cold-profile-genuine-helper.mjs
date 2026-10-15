import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { loadColdProfileSdk } from "../scripts/migrate-cold-profile.mjs";
import { installColdProfileNetworkGuard } from "./cold-profile-network-guard.mjs";

export const DESKTOP_COMMIT = "5badb15009ae1756c3afe0ae0cef1faafc290ccc";
export const TUI_PACKAGE = "@deepseek-harness-tui/dsh-tui";
export const DESKTOP_SOURCE_BLOBS = Object.freeze({
  "package.json": "cd0def79479622c6b79db33e5b8020584c1c9033",
  "src/project-manager.ts": "270d87d6b25c90acc68ea3cbd3e31d3231ab9872",
  "src/core-package-set.ts": "0c148e223f84864850e88ef9a241efbb5947aa19",
  "src/runtime-tree.ts": "dd7941d8e8e0e66d382c7ceb060e618bc62ca6d2",
  "src/release.ts": "88050120e535af25f98830c6d8fd170dbf570510",
  "src/host-protocol.ts": "dc0556fb520adb24e75ad93b5be38d7913b5ef11",
});
const helperPath = fileURLToPath(import.meta.url);

export async function isolatedApplicationEnvironment(root) {
  const env = {};
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  const folders = {
    HOME: "user", USERPROFILE: "user", APPDATA: "appdata", LOCALAPPDATA: "localappdata",
    DSH_HOME: "dsh", DSH_AGENTS_HOME: "agents", XDG_CONFIG_HOME: "config",
    XDG_DATA_HOME: "data", XDG_STATE_HOME: "state", XDG_CACHE_HOME: "cache",
    TEMP: "tmp", TMP: "tmp", TMPDIR: "tmp", PNPM_HOME: "pnpm", COREPACK_HOME: "corepack",
    npm_config_cache: "npm-cache", npm_config_store_dir: "pnpm-store",
    npm_config_state_dir: "pnpm-state", npm_config_config_dir: "pnpm-config",
  };
  for (const [key, folder] of Object.entries(folders)) {
    env[key] = join(root, folder);
    await mkdir(env[key], { recursive: true });
  }
  for (const key of ["npm_config_userconfig", "npm_config_globalconfig"]) {
    env[key] = join(root, `${key}.npmrc`);
    await writeFile(env[key], "");
  }
  if (process.env.RUNNER_TEMP && process.env.COREPACK_HOME) {
    const path = relative(resolve(process.env.RUNNER_TEMP), resolve(process.env.COREPACK_HOME));
    if (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)) env.COREPACK_HOME = process.env.COREPACK_HOME;
  }
  return { ...env, DSH_TELEMETRY_DISABLED: "1", DSH_TELEMETRY_MODE: "DISABLED", CI: "1", NO_COLOR: "1" };
}

export function runApplicationNode(args, { root, env, requireQuiet = false }, timeout = 30_000) {
  const result = spawnSync(process.execPath, args, {
    cwd: root, env, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  if (requireQuiet) assert.equal(result.stderr.trim(), "", "Native cold startup must not emit import or activation diagnostics");
  return result.stdout;
}

export async function validateColdProfileSdk(anchor) {
  assert.ok(typeof anchor === "string" && isAbsolute(anchor), "DSMM_COLD_PROFILE_SDK_ANCHOR must explicitly name an absolute fixed SDK package.json");
  const manifest = JSON.parse(await readFile(anchor, "utf8"));
  assert.equal(manifest.name, "@deepseek-ai/dsh");
  assert.equal(manifest.version, "0.2.0-rc.2", "The cold-profile SDK must be the pinned rc.2 cohort");
  await loadColdProfileSdk(anchor);
  return resolve(anchor);
}

export function assertDesktopSource(path, bytes) {
  const hash = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  assert.equal(hash, DESKTOP_SOURCE_BLOBS[path], `Desktop source must belong to ${DESKTOP_COMMIT}: ${path}`);
}

export async function coldProfileInputs(env = process.env) {
  const installAnchor = await validateColdProfileSdk(env.DSMM_COLD_PROFILE_SDK_ANCHOR);
  assert.ok(typeof env.DSMM_COLD_PROFILE_GENUINE_SEED === "string" && isAbsolute(env.DSMM_COLD_PROFILE_GENUINE_SEED), "DSMM_COLD_PROFILE_GENUINE_SEED must explicitly name a prepared seed directory");
  const seedRoot = await realpath(env.DSMM_COLD_PROFILE_GENUINE_SEED);
  const seed = JSON.parse(await readFile(join(seedRoot, "seed.json"), "utf8"));
  assert.equal(seed.schemaVersion, 2, "Reprepare a version-2 seed with the DSMM public dependency closure");
  assert.equal(seed.sdkVersion, "0.2.0-rc.2");
  assert.deepEqual(seed.platform, { os: process.platform, arch: process.arch }, "The installed TUI closure must match this runtime platform");
  assert.deepEqual(seed.tui, { name: TUI_PACKAGE, version: "0.13.0" });
  assert.deepEqual(seed.desktop, { repository: "deepseek-ai/deepseek-harness", commit: DESKTOP_COMMIT, version: "0.2.1-alpha.1" });
  const tui = JSON.parse(await readFile(join(seedRoot, "tui-profile", "node_modules", TUI_PACKAGE, "package.json"), "utf8"));
  assert.equal(tui.name, TUI_PACKAGE); assert.equal(tui.version, "0.13.0");
  assert.equal(join(tui.dsh.bundle.patch), "cordis.patch.yml");
  const profile = JSON.parse(await readFile(join(seedRoot, "tui-profile", "package.json"), "utf8"));
  assert.deepEqual(profile.dsh.profile.bundles, ["@deepseek-ai/dsh-base", TUI_PACKAGE]);
  await assertContainedLinks(join(seedRoot, "tui-profile"));
  const dsmm = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(seed.dsmmDependencies).sort(), Object.keys(dsmm.dependencies).sort());
  for (const [name, spec] of Object.entries(dsmm.dependencies)) {
    const selected = seed.dsmmDependencies[name];
    assert.equal(selected.spec, spec, `Seed must supply DSMM's current public dependency ${name}`);
    const installed = JSON.parse(await readFile(join(seedRoot, "dsmm-dependencies", "node_modules", name, "package.json"), "utf8"));
    assert.equal(installed.name, name);
    assert.equal(installed.version, selected.version);
  }
  await assertContainedLinks(join(seedRoot, "dsmm-dependencies"));
  for (const path of Object.keys(DESKTOP_SOURCE_BLOBS)) assertDesktopSource(path, await readFile(join(seedRoot, "desktop", path)));
  return { installAnchor, seedRoot, seed };
}

/** Seed consumers receive physical writable copies, never a shared node_modules link. */
export async function copyFixtureTree(source, destination) {
  await cp(source, destination, { recursive: true, dereference: true, errorOnExist: true, force: false });
  await setTreeWritable(destination, true);
}

export async function setTreeWritable(path, writable) {
  const info = await lstat(path);
  assert.equal(info.isSymbolicLink(), false, "A seed or copied fixture must not redirect writes through a link");
  const mode = info.isDirectory() || (info.mode & 0o111) !== 0 ? (writable ? 0o755 : 0o555) : (writable ? 0o644 : 0o444);
  if (writable) await chmod(path, mode);
  if (info.isDirectory()) for (const name of await readdir(path)) await setTreeWritable(join(path, name), writable);
  if (!writable) await chmod(path, mode);
}

export async function assertContainedLinks(path, root = path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) {
    const selected = relative(await realpath(root), await realpath(path));
    assert.ok(selected !== ".." && !selected.startsWith(`..${sep}`) && !isAbsolute(selected), "Installed application closure escaped task-owned profile");
  } else if (info.isDirectory()) for (const name of await readdir(path)) await assertContainedLinks(join(path, name), root);
}

/** Each invocation owns its home, profile, dependency copies and cleanup. Consumption is offline. */
export async function genuineApplicationFixture(t, target, installAnchor, seedRoot = process.env.DSMM_COLD_PROFILE_GENUINE_SEED) {
  const inputs = await coldProfileInputs({ DSMM_COLD_PROFILE_SDK_ANCHOR: installAnchor, DSMM_COLD_PROFILE_GENUINE_SEED: seedRoot });
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(join(parent, "dsmm-genuine-cold-"));
  t.after(async () => {
    assert.equal(dirname(await realpath(root)), parent);
    await rm(root, { recursive: true, force: true });
  });
  const env = await isolatedApplicationEnvironment(root);
  const home = env.DSH_HOME;
  const profileDir = join(home, "profiles", target);
  const f = { root, env, options: { target, profileDir, home, installAnchor: inputs.installAnchor, migrateShell: true, migrateSubagent: true, migrateSessionPersistence: true } };
  if (target === "desktop") {
    const sourceDir = join(root, "desktop-source");
    await mkdir(sourceDir);
    for (const path of Object.keys(DESKTOP_SOURCE_BLOBS).filter(path => path.endsWith(".ts"))) {
      const source = await readFile(join(inputs.seedRoot, "desktop", path), "utf8");
      const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext } });
      await writeFile(join(sourceDir, path.slice(4)), compiled.outputText);
    }
    runApplicationNode([helperPath, "desktop-init", inputs.installAnchor, profileDir, sourceDir], f);
    f.provenance = { ...inputs.seed.desktop, initializer: "apps/desktop/src/project-manager.ts#createPluginProfile", sdkVersion: inputs.seed.sdkVersion };
  } else {
    await mkdir(dirname(profileDir), { recursive: true });
    await copyFixtureTree(join(inputs.seedRoot, "tui-profile"), profileDir);
    f.provenance = { ...inputs.seed.tui, initializer: "bin/dsh-tui.js#bootstrapProfile (dsh plugin add)", sdkVersion: inputs.seed.sdkVersion };
  }
  f.sdk = await loadColdProfileSdk(inputs.installAnchor);
  f.initializedManifest = JSON.parse(await readFile(join(profileDir, "package.json"), "utf8"));
  const packageDir = join(profileDir, "node_modules", "@dsmm", "dsmm");
  await mkdir(packageDir, { recursive: true });
  for (const name of ["package.json", "lib", "locale", "cordis.patch.yml", "agent-presets", "prompts", "skills"]) {
    await cp(fileURLToPath(new URL(`../${name}`, import.meta.url)), join(packageDir, name), { recursive: true, dereference: true });
  }
  await copyFixtureTree(join(inputs.seedRoot, "dsmm-dependencies", "node_modules"), join(packageDir, "node_modules"));
  f.coldEntries = () => JSON.parse(runApplicationNode([helperPath, "dump", inputs.installAnchor, profileDir], f));
  f.nativeHealth = () => JSON.parse(runApplicationNode([
    "--expose-internals", fileURLToPath(new URL("./cold-profile-native-health.mjs", import.meta.url)), inputs.installAnchor, profileDir,
  ], { ...f, requireQuiet: true }, 60_000));
  return f;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === helperPath) {
  const [mode, anchor, profileDir, sourceDir] = process.argv.slice(2);
  if (mode === "test") {
    const { installAnchor, seedRoot } = await coldProfileInputs();
    const parent = await realpath(tmpdir());
    const root = await mkdtemp(join(parent, "dsmm-genuine-suite-"));
    try {
      const env = await isolatedApplicationEnvironment(root);
      env.DSMM_COLD_PROFILE_SDK_ANCHOR = installAnchor;
      env.DSMM_COLD_PROFILE_GENUINE_SEED = seedRoot;
      process.stdout.write(runApplicationNode([
        "--test", `--test-name-pattern=${anchor ?? ".*"}`, fileURLToPath(new URL("./cold-profile-migration.test.mjs", import.meta.url)),
      ], { root, env }, 600_000));
    } finally {
      assert.equal(dirname(await realpath(root)), parent);
      await rm(root, { recursive: true, force: true });
    }
  } else {
    const guard = installColdProfileNetworkGuard();
    await validateColdProfileSdk(anchor);
    if (mode === "desktop-init") {
      const native = createRequire(anchor);
      const bootPath = native.resolve("@deepseek-ai/dsh-app-boot");
      const semverPath = createRequire(bootPath).resolve("semver");
      registerHooks({ resolve(specifier, context, next) {
        if (specifier === "@deepseek-ai/dsh-app-boot") return { url: pathToFileURL(bootPath).href, shortCircuit: true };
        if (specifier === "semver") return { url: pathToFileURL(semverPath).href, shortCircuit: true };
        return next(specifier, context);
      } });
      const application = await import(pathToFileURL(join(sourceDir, "project-manager.ts")).href);
      application.createPluginProfile(profileDir);
    } else if (mode === "dump") {
      const sdk = await loadColdProfileSdk(anchor);
      const profile = sdk.boot.loadProfileDirectory("dsmm-genuine-cold", profileDir, anchor);
      assert.deepEqual(profile.skippedBundles, []);
      process.stdout.write(JSON.stringify(sdk.boot.composeEntries([
        ...profile.layers.map(layer => layer.patches), profile.patches,
        sdk.boot.loadOptionalPatches("dsmm-genuine-cold", join(process.env.DSH_HOME, "cordis.patch.yml")) ?? [],
      ])));
    } else throw new Error(`Unknown genuine fixture operation: ${mode}`);
    assert.deepEqual(guard.attempts, []);
  }
}
