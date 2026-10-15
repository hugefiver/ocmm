import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findNodeAtLocation, parseTree } from "jsonc-parser";

export class ColdProfileMigrationError extends Error {
  constructor(code) {
    super(`Cold-profile migration refused: ${code}`);
    this.name = "ColdProfileMigrationError";
    this.code = code;
  }
}

export const refuse = code => { throw new ColdProfileMigrationError(code); };
export const digest = bytes => createHash("sha256").update(bytes).digest("hex");

/** Writes never follow a profile, Home, or output directory symlink/junction. */
export function plainPath(filename, { missing = false } = {}) {
  if (!isAbsolute(filename)) refuse("ABSOLUTE_PATH_REQUIRED");
  let cursor = resolve(filename);
  while (cursor !== parse(cursor).root) {
    try {
      if (lstatSync(cursor).isSymbolicLink()) refuse("LINKED_SOURCE_OR_TARGET");
    } catch (error) {
      if (error.code !== "ENOENT" || !missing) throw error;
    }
    cursor = dirname(cursor);
  }
  return resolve(filename);
}

/** One necessary source readset, held in memory; source contents are never receipts. */
export class SourceReadset {
  files = new Map();
  capabilities = new Map();
  record(entry) {
    const previous = this.files.get(entry.filename);
    if (previous && JSON.stringify(previous) !== JSON.stringify(entry)) refuse("SOURCE_CONFLICT");
    this.files.set(entry.filename, entry);
  }
  read(filename, { optional = false, packageSource = false } = {}) {
    filename = resolve(filename);
    if (!packageSource) plainPath(filename, { missing: optional });
    let bytes = null;
    let canonical = null;
    try {
      canonical = realpathSync(filename);
      if (!lstatSync(canonical).isFile()) refuse("SOURCE_NOT_FILE");
      bytes = readFileSync(filename);
    } catch (error) {
      if (error.code !== "ENOENT" || !optional) throw error;
    }
    this.record({ kind: "source", filename, canonical, hash: bytes === null ? null : digest(bytes) });
    return bytes?.toString("utf8") ?? null;
  }
  package(filename, { packageSource = true } = {}) {
    filename = resolve(filename);
    if (!packageSource) plainPath(filename);
    const canonical = realpathSync(filename);
    const manifest = jsonDocument(readFileSync(filename, "utf8")).value;
    this.record({ kind: "package", filename, canonical, hash: packageIdentity(manifest) });
    return manifest;
  }
  module(filename, { packageSource = false } = {}) {
    filename = resolve(filename);
    if (!packageSource) plainPath(filename);
    const canonical = realpathSync(filename);
    if (!lstatSync(canonical).isFile()) refuse("UNRESOLVED_ENTRY_MODULE");
    this.record({ kind: "module", filename, canonical });
  }
  dormantCapability(options, baseURL, specifier) {
    const request = { installAnchor: options.installAnchor, profileDir: options.profileDir, home: options.home, baseURL, specifier };
    const selected = freshCapability(request);
    if (!selected.resolved) return false;
    const key = JSON.stringify(request);
    const previous = this.capabilities.get(key);
    if (previous && JSON.stringify(previous.selected) !== JSON.stringify(selected)) refuse("SOURCE_CONFLICT");
    this.capabilities.set(key, { request, selected });
    return true;
  }
  assertCurrent() {
    for (const entry of this.files.values()) {
      let canonical = null;
      let hash = null;
      try {
        canonical = realpathSync(entry.filename);
        if (!lstatSync(canonical).isFile()) refuse("SOURCE_CONFLICT");
        if (entry.kind === "source") hash = digest(readFileSync(entry.filename));
        else if (entry.kind === "package") hash = packageIdentity(jsonDocument(readFileSync(entry.filename, "utf8")).value);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (canonical !== entry.canonical || (entry.kind !== "module" && hash !== entry.hash)) refuse("SOURCE_CONFLICT");
    }
    for (const { request, selected } of this.capabilities.values()) {
      if (JSON.stringify(freshCapability(request)) !== JSON.stringify(selected)) refuse("SOURCE_CONFLICT");
    }
  }
  revision(context) {
    const files = [...this.files.values()].sort((a, b) => a.filename.localeCompare(b.filename));
    const capabilities = [...this.capabilities.values()].sort((a, b) => JSON.stringify(a.request).localeCompare(JSON.stringify(b.request)));
    return digest(JSON.stringify({ context, files, ...(capabilities.length ? { capabilities } : {}) }));
  }
}

const capabilitySpecifiers = new Set([
  "@deepseek-ai/dsh-ptc-runtime-node/package.json",
  "@deepseek-ai/dsh-agent-preset-registry/package.json",
]);

/** A new process discards Node's manifest/path caches and the SDK's ResolutionRouter caches. */
function freshCapability(request) {
  if (!capabilitySpecifiers.has(request.specifier)) refuse("DORMANT_RESOLUTION_UNAVAILABLE");
  // Preloaded hooks can change native routing or execute user code in the probe.
  if (process.env.NODE_OPTIONS?.trim() || process.execArgv.some(arg => /^(?:--(?:import|require|loader|experimental-loader)(?:=|$)|-r)/.test(arg))) refuse("DORMANT_RESOLUTION_UNAVAILABLE");
  const flags = [];
  for (let i = 0; i < process.execArgv.length; i++) {
    const arg = process.execArgv[i];
    if (/^(?:--conditions=|--preserve-symlinks$|--preserve-symlinks-main$|--no-addons$|--no-experimental-require-module$)/.test(arg)) flags.push(arg);
    else if (arg === "--conditions" || arg === "-C") flags.push(arg, process.execArgv[++i]);
  }
  const child = spawnSync(process.execPath, [...flags, fileURLToPath(import.meta.url), "--dsmm-dormant-resolution"], {
    input: JSON.stringify(request), encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "" }, windowsHide: true,
  });
  if (child.error || child.status !== 0) refuse("DORMANT_RESOLUTION_UNAVAILABLE");
  let selected;
  try { selected = JSON.parse(child.stdout); } catch { refuse("DORMANT_RESOLUTION_UNAVAILABLE"); }
  if (typeof selected?.resolved !== "boolean") refuse("DORMANT_RESOLUTION_UNAVAILABLE");
  return selected;
}

/** Uses the SDK's actual CJS interception, without mounting entries or importing capability code. */
async function resolveCapability(request) {
  if (!capabilitySpecifiers.has(request.specifier)) refuse("DORMANT_RESOLUTION_UNAVAILABLE");
  const native = createRequire(request.installAnchor);
  const bootPath = native.resolve("@deepseek-ai/dsh-app-boot");
  const boot = await import(pathToFileURL(bootPath).href);
  if (boot.getDshRuntimeVersion() !== "0.2.0-rc.2") refuse("UNSUPPORTED_SDK");
  const { Context } = await import(pathToFileURL(createRequire(bootPath).resolve("@deepseek-ai/cordis")).href);
  const profile = boot.loadProfileDirectory("dsmm-cold-profile", request.profileDir, request.installAnchor);
  if (profile.skippedBundles.length) refuse("SKIPPED_BUNDLE");
  const resolution = await boot.createRuntimeResolution({ installAnchor: request.installAnchor, profile, home: request.home });
  const ctx = new Context();
  try {
    await ctx.plugin(boot.PluginPackages, { resolution });
    if (!ctx.get("pluginPackages")?.interception) refuse("DORMANT_RESOLUTION_UNAVAILABLE");
    const require = createRequire(request.baseURL);
    let target;
    try { target = require.resolve(request.specifier); } catch { return { resolved: false }; }
    const name = request.specifier.slice(0, -"/package.json".length);
    const manifests = new Set([
      target,
      ...(require.resolve.paths(name) ?? []).map(searchPath => join(searchPath, name, "package.json")),
      ...resolution.entries.filter(entry => entry.name === name).map(entry => join(entry.packageDir, "package.json")),
    ]);
    const packages = [...manifests].sort().map(filename => {
      try {
        const canonical = realpathSync(filename);
        const hash = packageIdentity(jsonDocument(readFileSync(filename, "utf8")).value);
        return { filename, canonical, hash };
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
        return { filename, canonical: null, hash: null };
      }
    });
    const canonical = realpathSync(target);
    if (!lstatSync(canonical).isFile()) refuse("DORMANT_RESOLUTION_UNAVAILABLE");
    return { resolved: true, target, canonical, packages };
  } finally {
    await ctx.fiber.dispose();
  }
}

function packageIdentity(manifest) {
  const fields = ["name", "version", "type", "main", "exports", "imports", "dependencies", "peerDependencies", "optionalDependencies"];
  const identity = Object.fromEntries(fields.filter(field => Object.hasOwn(manifest, field)).map(field => [field, manifest[field]]));
  if (manifest.dsh?.bundle !== undefined) identity.bundle = manifest.dsh.bundle;
  return digest(JSON.stringify(identity));
}

/** SDK manifests are strict JSON; duplicate properties are refused rather than erased. */
export function jsonDocument(text) {
  const errors = [];
  const tree = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  if (!tree || errors.length) refuse("INVALID_MANIFEST");
  const visit = node => {
    if (node.type === "object") {
      const names = new Set();
      for (const property of node.children ?? []) {
        const key = property.children[0].value;
        if (names.has(key)) refuse("DUPLICATE_MANIFEST_KEY");
        names.add(key);
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return { tree, value: JSON.parse(text) };
}

export function bundleToken(text, slot) {
  const { tree } = jsonDocument(text);
  const node = findNodeAtLocation(tree, ["dsh", "profile", "bundles", slot]);
  if (node?.type !== "string") refuse("INVALID_BUNDLE_SLOT");
  return { offset: node.offset, length: node.length, literal: text.slice(node.offset, node.offset + node.length) };
}

export function replaceBundleToken(text, slot, name) {
  const token = bundleToken(text, slot);
  return text.slice(0, token.offset) + JSON.stringify(name) + text.slice(token.offset + token.length);
}

export async function loadColdProfileSdk(installAnchor) {
  if (!isAbsolute(installAnchor)) refuse("ABSOLUTE_PATH_REQUIRED");
  const require = createRequire(installAnchor);
  const bootPath = require.resolve("@deepseek-ai/dsh-app-boot");
  const includePath = require.resolve("@deepseek-ai/cordis-plugin-include");
  const yamlPath = require.resolve("js-yaml");
  const atomicPath = require.resolve("@deepseek-ai/dsh-atomic-write");
  const exportsPath = createRequire(bootPath).resolve("resolve.exports");
  const [boot, include, yaml, atomic, packageExports] = await Promise.all(
    [bootPath, includePath, yamlPath, atomicPath, exportsPath].map(filename => import(pathToFileURL(filename).href)),
  );
  if (boot.getDshRuntimeVersion() !== "0.2.0-rc.2") refuse("UNSUPPORTED_SDK");
  return { boot, include, yaml, atomic, packageExports, modulePaths: [bootPath, includePath, yamlPath, atomicPath, exportsPath] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === "--dsmm-dormant-resolution") {
  try {
    process.stdout.write(JSON.stringify(await resolveCapability(JSON.parse(readFileSync(0, "utf8")))));
  } catch {
    process.exitCode = 1;
  }
}
