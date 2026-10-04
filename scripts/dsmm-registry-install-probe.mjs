import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

export const PACKAGE_NAME = "@dsmm/dsmm";
export const DSH_VERSION = "0.2.0-rc.2";
export const PNPM_VERSION = "11.9.0";
export const REGISTRY = "https://registry.npmjs.org/";
const PNPM_INTEGRITY = "sha512-vWgtXQP+Ul73yf1ngMaITR51asTJyf4AxTh4KCQxDc+Q493E9Tg18G3669UIXkGFXgvLs7YN4qxburieUDbwOw==";
const DSH_INTEGRITY = "sha512-EAJ3gPNcVt/uv8X19PMm9NkVhWgT7xXNMk0UKCVm+IQ5rpSQOcsMUa0HWlnYYVybKMsccjcRB21vVVsaXQ6IdA==";
const ROOT_PREFIX = "dsmm-registry-probe-";
const MARKER = ".dsmm-registry-probe-owner";
const SHA256 = /^[a-f0-9]{64}$/u;
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
export const PUBLIC_EXPORTS = Object.freeze({
  ".": "lib/index.js",
  "./preset-skills": "lib/preset-skills.js",
  "./session-persistence": "lib/session-persistence.js",
  "./client": "lib/client.js",
  "./package.json": "package.json",
});
export const COMPILED_FILES = Object.freeze([
  "lib/profile-runtime.js", "lib/profile-store.js", "lib/profile-rpc.js", "lib/profile-remote.js",
  "lib/profile-types.js", "lib/profiles.js", "lib/client/index.js", "lib/client/controller.js", "lib/client/ProfilesSection.js",
]);
export const REQUIRED_CHECKS = Object.freeze([
  "registryIdentity", "registryBytes", "pinnedPackageManager", "pinnedNativeRuntime", "isolatedEnvironment",
  "exactNativeInstall", "profileOwnedResolution", "publicExports", "compiledProfileClient", "installedBytes",
  "nativeHeadlessComposition", "nativePluginList", "cleanup",
]);

class ProbeError extends Error {
  constructor(code, outcome = "FAILED") { super(code); this.code = code; this.outcome = outcome; }
}
function requireFact(value, code) { if (!value) throw new ProbeError(code); }
function digest(bytes, algorithm = "sha256", encoding = "hex") { return createHash(algorithm).update(bytes).digest(encoding); }
function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
function validVersion(version) {
  return typeof version === "string" && STABLE_VERSION.test(version)
    && version.split(".").every((part) => Number.isSafeInteger(Number(part)));
}

export function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    requireFact(["--version", "--sha256", "--receipt"].includes(key) && !(key in values), "INVALID_ARGUMENTS");
    requireFact(typeof argv[index + 1] === "string" && argv[index + 1].length > 0 && !argv[index + 1].startsWith("--"), "INVALID_ARGUMENTS");
    values[key] = argv[index + 1];
  }
  requireFact(exactKeys(values, ["--version", "--sha256", "--receipt"]), "INVALID_ARGUMENTS");
  requireFact(validVersion(values["--version"]), "INVALID_VERSION");
  requireFact(SHA256.test(values["--sha256"]), "INVALID_SHA256");
  requireFact(!/[\0\r\n]/u.test(values["--receipt"]), "INVALID_RECEIPT_PATH");
  return { version: values["--version"], sha256: values["--sha256"], receipt: resolve(values["--receipt"]) };
}

export function isInside(path, root) {
  const child = relative(resolve(root), resolve(path));
  return child.length > 0 && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

export function createOwnedRoot(parent = tmpdir()) {
  const parentPath = realpathSync(parent);
  const root = realpathSync(mkdtempSync(join(parentPath, ROOT_PREFIX)));
  const token = randomUUID();
  writeFileSync(join(root, MARKER), token, { flag: "wx", mode: 0o600 });
  return { root, parent: parentPath, token };
}

export function cleanupOwnedRoot(owner, remove = rmSync) {
  requireFact(owner && typeof owner.token === "string" && owner.token.length > 0, "CLEANUP_OWNERSHIP_INVALID");
  requireFact(isInside(owner.root, owner.parent) && dirname(owner.root) === owner.parent
    && basename(owner.root).startsWith(ROOT_PREFIX), "CLEANUP_TARGET_INVALID");
  requireFact(!lstatSync(owner.root).isSymbolicLink() && realpathSync(owner.root) === owner.root
    && realpathSync(owner.parent) === owner.parent, "CLEANUP_TARGET_CHANGED");
  const marker = join(owner.root, MARKER);
  requireFact(!lstatSync(marker).isSymbolicLink() && readFileSync(marker, "utf8") === owner.token, "CLEANUP_OWNERSHIP_INVALID");
  remove(owner.root, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 });
  requireFact(!existsSync(owner.root), "CLEANUP_ROOT_REMAINS");
}

export function createIsolatedEnvironment(root, source = process.env, node = process.execPath) {
  const home = join(root, "home");
  const nativeHome = join(root, "dsh-home");
  const env = {};
  // PATH is constructed rather than inherited: no global package-manager or checkout shims.
  for (const key of ["SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "COMSPEC", "PATHEXT", "LANG", "LC_ALL", "TZ"]) {
    if (typeof source[key] === "string") env[key] = source[key];
  }
  const systemPaths = process.platform === "win32"
    ? [join(source.SystemRoot ?? source.SYSTEMROOT ?? "C:\\Windows", "System32")]
    : ["/usr/bin", "/bin"];
  Object.assign(env, {
    PATH: [join(root, "bin"), dirname(node), ...systemPaths].join(delimiter),
    HOME: home, USERPROFILE: home, DSH_HOME: nativeHome,
    APPDATA: join(home, "appdata"), LOCALAPPDATA: join(home, "localappdata"),
    XDG_CONFIG_HOME: join(home, "xdg-config"), XDG_DATA_HOME: join(home, "xdg-data"),
    XDG_STATE_HOME: join(home, "xdg-state"), XDG_CACHE_HOME: join(home, "xdg-cache"),
    TEMP: join(root, "tmp"), TMP: join(root, "tmp"), TMPDIR: join(root, "tmp"),
    PNPM_HOME: join(root, "bin"), npm_config_userconfig: join(root, "npmrc"),
    npm_config_globalconfig: join(root, "global-npmrc"), npm_config_registry: REGISTRY,
    npm_config_store_dir: join(root, "pnpm-store"), npm_config_cache: join(root, "npm-cache"),
    npm_config_cache_dir: join(root, "pnpm-cache"), npm_config_state_dir: join(root, "pnpm-state"),
    npm_config_ignore_scripts: "true", npm_config_manage_package_manager_versions: "false",
    npm_config_update_notifier: "false", npm_config_verify_store_integrity: "true",
    DSH_TELEMETRY_MODE: "DISABLED", DSH_TELEMETRY_DISABLED: "1", CI: "true", NO_COLOR: "1",
  });
  return env;
}

function safeMemberPath(name) {
  requireFact(typeof name === "string" && name.startsWith("package/") && !/[\\\0-\x1f:]/u.test(name), "UNSAFE_ARCHIVE_PATH");
  const parts = name.replace(/\/$/u, "").split("/");
  requireFact(parts.every((part) => part !== "" && part !== "." && part !== ".."
    && !/[. ]$/u.test(part) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part)), "UNSAFE_ARCHIVE_PATH");
  return parts.slice(1).join("/");
}

function paxFields(bytes) {
  const result = {};
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset);
    const length = Number(bytes.subarray(offset, space).toString());
    requireFact(space > offset && Number.isSafeInteger(length) && length > space - offset + 2
      && offset + length <= bytes.length && bytes[offset + length - 1] === 10, "INVALID_ARCHIVE_PAX");
    const row = bytes.subarray(space + 1, offset + length - 1).toString("utf8");
    const equals = row.indexOf("=");
    requireFact(equals > 0, "INVALID_ARCHIVE_PAX");
    result[row.slice(0, equals)] = row.slice(equals + 1);
    offset += length;
  }
  requireFact(!("linkpath" in result), "UNSAFE_ARCHIVE_LINK");
  return result;
}

export function inspectTarball(bytes) {
  let tar;
  try { tar = gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 }); }
  catch { throw new ProbeError("INVALID_ARCHIVE_GZIP"); }
  const files = new Map();
  let pax = {};
  let end = false;
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) { end = true; break; }
    const string = (start, length) => header.subarray(start, start + length).toString("utf8").replace(/\0.*$/su, "");
    const number = (start, length) => {
      const value = string(start, length).trim();
      requireFact(/^[0-7]+$/u.test(value), "INVALID_ARCHIVE_NUMBER");
      return Number.parseInt(value, 8);
    };
    const checksum = header.reduce((sum, value, index) => sum + (index >= 148 && index < 156 ? 32 : value), 0);
    requireFact(number(148, 8) === checksum, "INVALID_ARCHIVE_CHECKSUM");
    const type = string(156, 1);
    const size = number(124, 12);
    requireFact(Number.isSafeInteger(size) && offset + 512 + size <= tar.length, "INVALID_ARCHIVE_SIZE");
    const content = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") { pax = paxFields(content); continue; }
    requireFact(type === "0" || type === "" || type === "5", "UNSAFE_ARCHIVE_TYPE");
    const prefix = string(345, 155);
    const path = safeMemberPath(pax.path ?? `${prefix ? `${prefix}/` : ""}${string(0, 100)}`);
    requireFact(!("size" in pax) || Number(pax.size) === size, "INVALID_ARCHIVE_SIZE");
    pax = {};
    if (type === "5") { requireFact(size === 0, "INVALID_ARCHIVE_DIRECTORY"); continue; }
    requireFact(path.length > 0 && !files.has(path), "DUPLICATE_ARCHIVE_MEMBER");
    files.set(path, { bytes: content, mode: number(100, 8) & 0o755 });
    requireFact(files.size <= 20_000, "ARCHIVE_MEMBER_LIMIT");
  }
  requireFact(end && files.has("package.json") && Object.keys(pax).length === 0, "INCOMPLETE_ARCHIVE");
  return files;
}

function manifestFrom(files) {
  try { return JSON.parse(files.get("package.json").bytes.toString("utf8")); }
  catch { throw new ProbeError("INVALID_PACKAGE_MANIFEST"); }
}

function extractTool(files, root) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  for (const [path, entry] of files) {
    const target = resolve(root, path);
    requireFact(isInside(target, root), "UNSAFE_ARCHIVE_PATH");
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, entry.bytes, { flag: "wx", mode: entry.mode || 0o644 });
  }
}

function expectedTarball(name, version) {
  return `${REGISTRY}${name}/-/${name.split("/").at(-1)}-${version}.tgz`;
}

async function publicBytes(url, fetcher, maxBytes = 40 * 1024 * 1024) {
  let response;
  try { response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(60_000), headers: { accept: "application/json, application/octet-stream" } }); }
  catch { throw new ProbeError("PUBLIC_REGISTRY_UNAVAILABLE", "UNRESOLVED"); }
  requireFact(response.ok, response.status === 404 ? "REGISTRY_VERSION_ABSENT" : "PUBLIC_REGISTRY_HTTP_FAILURE");
  const reader = response.body?.getReader();
  requireFact(reader, "PUBLIC_REGISTRY_EMPTY_BODY");
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      requireFact(length <= maxBytes, "PUBLIC_REGISTRY_SIZE_LIMIT");
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

async function registryPackage(name, version, fetcher, expectedSha256, pinnedIntegrity) {
  let metadata;
  try { metadata = JSON.parse((await publicBytes(`${REGISTRY}${encodeURIComponent(name)}/${version}`, fetcher, 2 * 1024 * 1024)).toString("utf8")); }
  catch (error) { if (error instanceof ProbeError) throw error; throw new ProbeError("INVALID_REGISTRY_METADATA"); }
  requireFact(metadata.name === name && metadata.version === version, "REGISTRY_IDENTITY_MISMATCH");
  const tarball = expectedTarball(name, version);
  const integrity = metadata.dist?.integrity;
  requireFact(metadata.dist?.tarball === tarball && /^[a-f0-9]{40}$/u.test(metadata.dist?.shasum ?? "")
    && typeof integrity === "string" && /^sha512-[A-Za-z0-9+/]{86}==$/u.test(integrity), "INVALID_REGISTRY_DIST");
  requireFact(!pinnedIntegrity || integrity === pinnedIntegrity, "PINNED_TOOL_INTEGRITY_MISMATCH");
  const bytes = await publicBytes(tarball, fetcher);
  const sha256 = digest(bytes);
  const sha1 = digest(bytes, "sha1");
  const sha512 = digest(bytes, "sha512", "base64");
  requireFact((!expectedSha256 || sha256 === expectedSha256) && sha1 === metadata.dist.shasum
    && `sha512-${sha512}` === integrity, "REGISTRY_DIGEST_MISMATCH");
  const files = inspectTarball(bytes);
  const manifest = manifestFrom(files);
  requireFact(manifest.name === name && manifest.version === version, "TARBALL_IDENTITY_MISMATCH");
  return { files, manifest, registry: { url: REGISTRY, tarball, integrity, sha1, sha256, sha512, size: bytes.length } };
}

export function lifecycleCommands(profile, version) {
  requireFact(/^dsmm-registry-[a-f0-9]{32}$/u.test(profile) && validVersion(version), "INVALID_NATIVE_IDENTITY");
  return [
    { operation: "initialize-headless", args: ["--profile", profile, "--from-default-profile", "headless", "--dump-config"] },
    { operation: "install-exact-registry", args: ["plugin", "--profile", profile, "add", `${PACKAGE_NAME}@${version}`, "--save-exact", "--ignore-scripts", `--registry=${REGISTRY}`] },
    { operation: "list-profile", args: ["plugin", "--profile", profile, "list", "--depth=0", "--json"] },
    { operation: "dump-composition", args: ["--profile", profile, "--dump-config"] },
  ];
}

export function verifyInstalledPackage(profilePackage, profileRoot, expected, version) {
  const profileRequire = createRequire(profilePackage);
  let packageRoot;
  try { packageRoot = realpathSync(dirname(profileRequire.resolve(`${PACKAGE_NAME}/package.json`))); }
  catch { throw new ProbeError("INSTALLED_PACKAGE_UNRESOLVED"); }
  requireFact(isInside(packageRoot, realpathSync(profileRoot)), "INSTALLED_PACKAGE_NOT_PROFILE_OWNED");
  const installed = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  requireFact(installed.name === PACKAGE_NAME && installed.version === version, "INSTALLED_PACKAGE_IDENTITY_MISMATCH");
  requireFact(exactKeys(installed.exports, Object.keys(PUBLIC_EXPORTS)), "INSTALLED_EXPORT_INVENTORY_MISMATCH");
  const verifyFile = (path, location) => {
    const resolved = realpathSync(location);
    requireFact(isInside(resolved, packageRoot) && relative(packageRoot, resolved).split(sep).join("/") === path,
      "INSTALLED_FILE_RESOLUTION_ESCAPE");
    requireFact(lstatSync(resolved).isFile() && expected.has(path), "INSTALLED_FILE_MISSING");
    const bytes = readFileSync(resolved);
    requireFact(bytes.equals(expected.get(path).bytes), "INSTALLED_FILE_BYTES_MISMATCH");
    return { path, sha256: digest(bytes) };
  };
  const exports = {};
  for (const [name, path] of Object.entries(PUBLIC_EXPORTS)) {
    const declaration = installed.exports[name];
    requireFact((typeof declaration === "string" ? declaration : declaration?.default ?? declaration?.import) === `./${path}`,
      "INSTALLED_EXPORT_TARGET_MISMATCH");
    exports[name] = verifyFile(path, profileRequire.resolve(name === "." ? PACKAGE_NAME : `${PACKAGE_NAME}${name.slice(1)}`));
  }
  const compiledFiles = {};
  for (const path of COMPILED_FILES) compiledFiles[path] = verifyFile(path, profileRequire.resolve(join(packageRoot, path)));
  return { name: installed.name, version: installed.version, exports, compiledFiles };
}

export function verifyNativePluginList(output, profileRoot, version) {
  let rows;
  try { rows = JSON.parse(output); }
  catch { throw new ProbeError("NATIVE_PLUGIN_LIST_INVALID_JSON"); }
  requireFact(Array.isArray(rows) && rows.length === 1 && typeof rows[0]?.path === "string"
    && realpathSync(rows[0].path) === realpathSync(profileRoot)
    && rows[0].dependencies?.[PACKAGE_NAME]?.version === version, "NATIVE_PLUGIN_LIST_UNPROVED");
  return true;
}

async function execute(command, args, options) {
  return await new Promise((resolveRun, rejectRun) => {
    let child;
    try { child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" }); }
    catch { rejectRun(new ProbeError("SUBPROCESS_START_FAILED")); return; }
    const output = { stdout: [], stderr: [] };
    let size = 0;
    let timedOut = false;
    let exceeded = false;
    const stop = () => {
      if (!child.pid) return;
      if (process.platform === "win32") {
        const system = options.env.SystemRoot ?? options.env.SYSTEMROOT ?? "C:\\Windows";
        const killer = spawn(join(system, "System32", "taskkill.exe"), ["/pid", String(child.pid), "/t", "/f"],
          { env: options.env, stdio: "ignore", windowsHide: true });
        killer.on("error", () => {});
      } else { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, options.timeoutMs ?? 300_000);
    for (const stream of ["stdout", "stderr"]) child[stream].on("data", (bytes) => {
      size += bytes.length;
      if (size > 8 * 1024 * 1024) { exceeded = true; stop(); }
      else output[stream].push(bytes);
    });
    child.on("error", () => { clearTimeout(timer); rejectRun(new ProbeError("SUBPROCESS_START_FAILED")); });
    child.on("close", (status) => {
      clearTimeout(timer);
      if (timedOut) { rejectRun(new ProbeError("SUBPROCESS_TIMEOUT", "UNRESOLVED")); return; }
      if (exceeded) { rejectRun(new ProbeError("SUBPROCESS_OUTPUT_LIMIT")); return; }
      resolveRun({ status, stdout: Buffer.concat(output.stdout).toString("utf8"), stderr: Buffer.concat(output.stderr).toString("utf8") });
    });
  });
}

function setUpEnvironment(root, env) {
  for (const key of ["HOME", "DSH_HOME", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "TEMP", "PNPM_HOME"]) {
    requireFact(isInside(env[key], root), "ISOLATION_DIRECTORY_ESCAPE");
    mkdirSync(env[key], { recursive: true, mode: 0o700 });
  }
  writeFileSync(env.npm_config_userconfig, "registry=https://registry.npmjs.org/\nignore-scripts=true\nmanage-package-manager-versions=false\nverify-store-integrity=true\n", { flag: "wx", mode: 0o600 });
  writeFileSync(env.npm_config_globalconfig, "", { flag: "wx", mode: 0o600 });
}

function pnpmShim(root, entry) {
  const bin = join(root, "bin");
  if (process.platform === "win32") {
    requireFact(!/["%\r\n]/u.test(process.execPath + entry), "UNSAFE_TOOL_SHIM_PATH");
    writeFileSync(join(bin, "pnpm.cmd"), `@"${process.execPath}" "${entry}" %*\r\n`, { flag: "wx" });
  } else {
    const shim = join(bin, "pnpm");
    const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
    writeFileSync(shim, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(entry)} "$@"\n`, { flag: "wx", mode: 0o700 });
    chmodSync(shim, 0o700);
  }
}

export async function runInstallProbe(options, runtime = {}) {
  requireFact(validVersion(options.version) && SHA256.test(options.sha256), "INVALID_INPUT");
  const owner = (runtime.createOwnedRoot ?? createOwnedRoot)();
  const receipt = {
    schemaVersion: 1, outcome: "FAILED", packageName: PACKAGE_NAME, version: options.version, sha256: options.sha256,
    startedAt: new Date().toISOString(), packageManager: { name: "pnpm", version: PNPM_VERSION },
    native: { version: DSH_VERSION, headless: false, profileList: false, dumpConfig: false, commands: [] },
    exports: {}, compiledFiles: {}, checks: Object.fromEntries(REQUIRED_CHECKS.map((key) => [key, false])),
    temporaryRootRemoved: false, cleanup: { outcome: "NOT_RUN" },
    nonClaims: { paidModelCall: false, realLogin: false, authenticatedDesktop: false, uiAcceptance: false },
  };
  let stage = "registry-package";
  try {
    requireFact(!options.receipt || !isInside(options.receipt, owner.root), "RECEIPT_INSIDE_TEMPORARY_ROOT");
    const fetcher = runtime.fetch ?? fetch;
    const run = runtime.execute ?? execute;
    const expected = await registryPackage(PACKAGE_NAME, options.version, fetcher, options.sha256);
    receipt.registry = expected.registry;
    receipt.checks.registryIdentity = true;
    receipt.checks.registryBytes = true;
    stage = "isolated-environment";
    const env = createIsolatedEnvironment(owner.root, runtime.environment ?? process.env);
    setUpEnvironment(owner.root, env);
    receipt.checks.isolatedEnvironment = true;
    const runChecked = async (command, args, cwd, timeoutMs = 300_000) => {
      const result = await run(command, args, { cwd, env, timeoutMs });
      requireFact(result.status === 0, "SUBPROCESS_NONZERO");
      return result;
    };
    stage = "pinned-package-manager";
    const tool = await registryPackage("pnpm", PNPM_VERSION, fetcher, undefined, PNPM_INTEGRITY);
    const toolRoot = join(owner.root, "pnpm-runtime");
    extractTool(tool.files, toolRoot);
    const pnpmEntry = join(toolRoot, "bin", "pnpm.cjs");
    pnpmShim(owner.root, pnpmEntry);
    requireFact((await runChecked(process.execPath, [pnpmEntry, "--version"], owner.root, 60_000)).stdout.trim() === PNPM_VERSION,
      "PACKAGE_MANAGER_VERSION_MISMATCH");
    receipt.packageManager.integrity = tool.registry.integrity;
    receipt.checks.pinnedPackageManager = true;
    stage = "pinned-native-runtime";
    const nativeExpected = await registryPackage("@deepseek-ai/dsh", DSH_VERSION, fetcher, undefined, DSH_INTEGRITY);
    const nativeRoot = join(owner.root, "native-runtime");
    mkdirSync(nativeRoot);
    writeFileSync(join(nativeRoot, "package.json"), JSON.stringify({ name: "dsmm-isolated-registry-probe", private: true,
      dependencies: { "@deepseek-ai/dsh": DSH_VERSION } }), { flag: "wx", mode: 0o600 });
    await runChecked(process.execPath, [pnpmEntry, "install", "--ignore-scripts", `--registry=${REGISTRY}`,
      `--store-dir=${join(owner.root, "pnpm-store")}`, "--config.manage-package-manager-versions=false"], nativeRoot);
    const nativeRequire = createRequire(join(nativeRoot, "package.json"));
    const nativePackage = realpathSync(nativeRequire.resolve("@deepseek-ai/dsh/package.json"));
    requireFact(isInside(nativePackage, nativeRoot), "NATIVE_RUNTIME_RESOLUTION_ESCAPE");
    const nativeManifest = JSON.parse(readFileSync(nativePackage, "utf8"));
    requireFact(nativeManifest.name === "@deepseek-ai/dsh" && nativeManifest.version === DSH_VERSION
      && nativeManifest.bin?.dsh === "lib/bin.js", "NATIVE_RUNTIME_IDENTITY_MISMATCH");
    const nativeBin = realpathSync(join(dirname(nativePackage), "lib", "bin.js"));
    requireFact(isInside(nativeBin, dirname(nativePackage))
      && readFileSync(nativeBin).equals(nativeExpected.files.get("lib/bin.js").bytes), "NATIVE_RUNTIME_BYTES_MISMATCH");
    receipt.native.integrity = nativeExpected.registry.integrity;
    receipt.native.binSha256 = digest(readFileSync(nativeBin));
    receipt.checks.pinnedNativeRuntime = true;
    const profile = `dsmm-registry-${randomUUID().replaceAll("-", "")}`;
    receipt.native.profile = profile;
    const profileRoot = join(env.DSH_HOME, "profiles", profile);
    const commands = lifecycleCommands(profile, options.version);
    for (const command of commands) {
      stage = command.operation;
      const result = await runChecked(process.execPath, [nativeBin, ...command.args], owner.root);
      receipt.native.commands.push({ ...command, status: result.status,
        stdoutSha256: digest(result.stdout), stderrSha256: digest(result.stderr) });
      if (command.operation === "initialize-headless") {
        requireFact(result.stdout.includes("@deepseek-ai/dsh-headless") && existsSync(join(profileRoot, "package.json")), "HEADLESS_INITIALIZATION_UNPROVED");
        receipt.native.headless = true;
      } else if (command.operation === "install-exact-registry") {
        const profileManifest = JSON.parse(readFileSync(join(profileRoot, "package.json"), "utf8"));
        requireFact(profileManifest.dependencies?.[PACKAGE_NAME] === options.version, "NATIVE_INSTALL_NOT_EXACT");
        receipt.checks.exactNativeInstall = true;
        stage = "verify-installed-package";
        const installed = verifyInstalledPackage(join(profileRoot, "package.json"), profileRoot, expected.files, options.version);
        receipt.exports = installed.exports;
        receipt.compiledFiles = installed.compiledFiles;
        for (const check of ["profileOwnedResolution", "publicExports", "compiledProfileClient", "installedBytes"]) receipt.checks[check] = true;
      } else if (command.operation === "list-profile") {
        verifyNativePluginList(result.stdout, profileRoot, options.version);
        receipt.native.profileList = true;
        receipt.checks.nativePluginList = true;
      } else {
        requireFact(result.stdout.includes("@deepseek-ai/dsh-headless") && /\bid:\s*dsmm(?:\s|$)/u.test(result.stdout)
          && /\bname:\s*['"]?@dsmm\/dsmm['"]?(?:\s|$)/u.test(result.stdout), "NATIVE_COMPOSITION_UNPROVED");
        receipt.native.dumpConfig = true;
        receipt.checks.nativeHeadlessComposition = true;
      }
    }
    receipt.outcome = "COMPLETED";
  } catch (error) {
    receipt.outcome = error instanceof ProbeError ? error.outcome : "FAILED";
    receipt.failure = { stage, code: error instanceof ProbeError ? error.code : "PROBE_OPERATION_FAILED" };
  } finally {
    try {
      (runtime.cleanupOwnedRoot ?? cleanupOwnedRoot)(owner);
      requireFact(!existsSync(owner.root), "CLEANUP_ROOT_REMAINS");
      receipt.temporaryRootRemoved = true;
      receipt.cleanup = { outcome: "COMPLETED" };
      receipt.checks.cleanup = true;
    } catch {
      receipt.outcome = "FAILED";
      receipt.cleanup = { outcome: "FAILED", code: "OWNED_ROOT_CLEANUP_FAILED" };
    }
    receipt.finishedAt = new Date().toISOString();
  }
  if (receipt.outcome === "COMPLETED") {
    try { validateInstallReceipt(receipt, options); }
    catch { receipt.outcome = "FAILED"; receipt.failure = { stage: "validate-install-receipt", code: "INSTALL_RECEIPT_INVALID" }; }
  }
  return receipt;
}

export function validateInstallReceipt(receipt, { version, sha256 }) {
  requireFact(validVersion(version) && SHA256.test(sha256), "INVALID_EXPECTED_IDENTITY");
  requireFact(receipt?.schemaVersion === 1 && receipt.outcome === "COMPLETED" && receipt.packageName === PACKAGE_NAME
    && receipt.version === version && receipt.sha256 === sha256, "INSTALL_RECEIPT_IDENTITY_MISMATCH");
  requireFact(receipt.registry?.url === REGISTRY && receipt.registry.tarball === expectedTarball(PACKAGE_NAME, version)
    && receipt.registry.sha256 === sha256 && /^[a-f0-9]{40}$/u.test(receipt.registry.sha1 ?? "")
    && /^sha512-[A-Za-z0-9+/]{86}==$/u.test(receipt.registry.integrity ?? "")
    && receipt.registry.integrity === `sha512-${receipt.registry.sha512}`
    && Number.isSafeInteger(receipt.registry.size) && receipt.registry.size > 0, "INSTALL_RECEIPT_REGISTRY_INVALID");
  requireFact(receipt.packageManager?.name === "pnpm" && receipt.packageManager.version === PNPM_VERSION
    && receipt.packageManager.integrity === PNPM_INTEGRITY, "INSTALL_RECEIPT_PACKAGE_MANAGER_INVALID");
  requireFact(receipt.native?.version === DSH_VERSION && receipt.native.integrity === DSH_INTEGRITY
    && SHA256.test(receipt.native.binSha256 ?? "") && receipt.native.headless === true && receipt.native.profileList === true
    && receipt.native.dumpConfig === true, "INSTALL_RECEIPT_NATIVE_INVALID");
  const commands = lifecycleCommands(receipt.native.profile, version);
  requireFact(Array.isArray(receipt.native.commands) && receipt.native.commands.length === commands.length
    && commands.every((command, index) => {
      const observed = receipt.native.commands[index];
      return observed.operation === command.operation && observed.status === 0
        && JSON.stringify(observed.args) === JSON.stringify(command.args)
        && SHA256.test(observed.stdoutSha256 ?? "") && SHA256.test(observed.stderrSha256 ?? "");
    }), "INSTALL_RECEIPT_COMMANDS_INVALID");
  requireFact(exactKeys(receipt.exports, Object.keys(PUBLIC_EXPORTS)) && Object.entries(PUBLIC_EXPORTS).every(([name, path]) =>
    receipt.exports[name]?.path === path && SHA256.test(receipt.exports[name]?.sha256 ?? "")), "INSTALL_RECEIPT_EXPORTS_INVALID");
  requireFact(exactKeys(receipt.compiledFiles, COMPILED_FILES) && COMPILED_FILES.every((path) =>
    receipt.compiledFiles[path]?.path === path && SHA256.test(receipt.compiledFiles[path]?.sha256 ?? "")), "INSTALL_RECEIPT_COMPILED_FILES_INVALID");
  requireFact(exactKeys(receipt.checks, REQUIRED_CHECKS) && REQUIRED_CHECKS.every((key) => receipt.checks[key] === true)
    && receipt.temporaryRootRemoved === true && receipt.cleanup?.outcome === "COMPLETED", "INSTALL_RECEIPT_CHECKS_INCOMPLETE");
  requireFact(exactKeys(receipt.nonClaims, ["paidModelCall", "realLogin", "authenticatedDesktop", "uiAcceptance"])
    && Object.values(receipt.nonClaims).every((value) => value === false), "INSTALL_RECEIPT_FALSE_CLAIM");
  requireFact(Number.isFinite(Date.parse(receipt.startedAt)) && Number.isFinite(Date.parse(receipt.finishedAt))
    && Date.parse(receipt.finishedAt) >= Date.parse(receipt.startedAt), "INSTALL_RECEIPT_TIMESTAMPS_INVALID");
  return receipt;
}

export async function main(argv = process.argv.slice(2), runtime = {}) {
  let descriptor;
  try {
    const options = parseArgs(argv);
    requireFact(realpathSync(dirname(options.receipt)) === dirname(options.receipt), "RECEIPT_PARENT_NOT_CANONICAL");
    descriptor = openSync(options.receipt, "wx", 0o600);
    requireFact(fstatSync(descriptor).isFile(), "RECEIPT_NOT_REGULAR_FILE");
    const receipt = await runInstallProbe(options, runtime);
    writeFileSync(descriptor, `${JSON.stringify(receipt, null, 2)}\n`);
    (runtime.writeStdout ?? ((value) => process.stdout.write(value)))(`${JSON.stringify({ outcome: receipt.outcome, version: receipt.version, sha256: receipt.sha256 })}\n`);
    return receipt.outcome === "COMPLETED" ? 0 : receipt.outcome === "UNRESOLVED" ? 2 : 1;
  } catch (error) {
    // No child output, environment values, private paths, or arbitrary exception text is retained.
    (runtime.writeStdout ?? ((value) => process.stdout.write(value)))(`${JSON.stringify({ outcome: "FAILED", code: error instanceof ProbeError ? error.code : "PROBE_SETUP_FAILED" })}\n`);
    return 1;
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
