import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SKILL_SOURCES, SOURCE_INPUT_FILES, excludedSourceResource } from "./source-inventory.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const SOURCE_INPUT_ROOT = join(packageRoot, "source-inputs");
const attributes = "root/** -text\n";
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gitBlob = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const roots = [...SOURCE_INPUT_FILES, ...Object.values(SKILL_SOURCES)];
const allowedInput = (path) => SOURCE_INPUT_FILES.includes(path)
  || Object.values(SKILL_SOURCES).some((source) => path.startsWith(`${source}/`) && !excludedSourceResource(source, path.slice(source.length + 1)));
const validInputPath = (path) => typeof path === "string" && !path.includes("\\")
  && !path.split("/").some((part) => part === ".." || part === "." || part === "") && allowedInput(path);

function regularPath(root, path, directory = false) {
  const base = resolve(root), target = resolve(base, path);
  if (target !== base && !target.startsWith(`${base}${sep}`)) throw new Error(`source input escapes root: ${path}`);
  for (let current = target; ; current = dirname(current)) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !(current === target && !directory ? stat.isFile() : stat.isDirectory())) throw new Error(`linked or non-regular source input: ${path}`);
    if (current === base) break;
  }
  return target;
}

function walk(root, directory, directories = []) {
  regularPath(root, directory, true);
  directories.push(directory);
  return readdirSync(join(root, directory)).sort().flatMap((name) => {
    const path = `${directory}/${name}`, target = join(root, path), stat = lstatSync(target);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`linked or non-regular source input: ${path}`);
    return stat.isDirectory() ? walk(root, path, directories) : [path];
  });
}

function rootInputPaths(root) {
  const files = [...SOURCE_INPUT_FILES];
  for (const source of Object.values(SKILL_SOURCES)) {
    regularPath(root, source, true);
    const resources = (directory, prefix = "") => readdirSync(directory).sort().flatMap((name) => {
      const path = `${prefix}${name}`;
      if (excludedSourceResource(source, path)) return [];
      const target = join(directory, name), stat = lstatSync(target);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`linked or non-regular source input: ${source}/${path}`);
      return stat.isDirectory() ? resources(target, `${path}/`) : [`${source}/${path}`];
    });
    files.push(...resources(join(root, source)));
  }
  return files.sort();
}

export function loadSourceInputs(root = SOURCE_INPUT_ROOT) {
  if (readFileSync(regularPath(root, ".gitattributes"), "utf8").replaceAll("\r\n", "\n") !== attributes) throw new Error("source snapshot requires raw-byte Git storage (root/** -text)");
  const manifest = JSON.parse(readFileSync(regularPath(root, "manifest.json"), "utf8"));
  if (manifest.format !== 1 || !/^[a-f0-9]{40}$/u.test(manifest.provenance?.rootBaselineCommit)
    || manifest.provenance.capture !== "root-worktree" || !Array.isArray(manifest.provenance.overlayPaths)
    || !Array.isArray(manifest.files)) throw new Error("invalid source input snapshot manifest/provenance");
  const files = new Map();
  for (const row of manifest.files) {
    if (!validInputPath(row.path) || files.has(row.path)
      || !/^[a-f0-9]{64}$/u.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 0) throw new Error(`invalid source input inventory entry: ${row.path}`);
    const bytes = readFileSync(regularPath(root, `root/${row.path}`));
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw new Error(`source input integrity drift: ${row.path}`);
    files.set(row.path, bytes);
  }
  const missing = [...SOURCE_INPUT_FILES, ...Object.values(SKILL_SOURCES).map((source) => `${source}/SKILL.md`)].filter((path) => !files.has(path));
  const directories = [], actual = walk(root, "root", directories).map((path) => path.slice("root/".length));
  const extra = actual.filter((path) => !files.has(path));
  for (const directory of directories) if (![...files.keys()].some((path) => `root/${path}`.startsWith(`${directory}/`))) extra.push(directory);
  if (missing.length || extra.length || readdirSync(root).sort().join(",") !== ".gitattributes,manifest.json,root") throw new Error(`source input closure drift: missing=${missing.join(",")} extra=${extra.join(",")}`);
  if (manifest.provenance.overlayPaths.some((path, index, paths) => !files.has(path) || paths.indexOf(path) !== index)) throw new Error("invalid source input overlay provenance");
  return { files, provenance: manifest.provenance };
}

function capture(root) {
  const baseline = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const paths = rootInputPaths(root);
  const files = new Map(paths.map((path) => [path, readFileSync(regularPath(root, path))]));
  const tree = execFileSync("git", ["ls-tree", "-r", "-z", baseline, "--", ...roots], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const baselineBlobs = new Map(tree.split("\0").filter(Boolean).map((row) => {
    const [entry, path] = row.split("\t");
    return [path, entry.split(" ")[2]];
  }));
  const overlayPaths = paths.filter((path) => gitBlob(files.get(path)) !== baselineBlobs.get(path));
  return { files, provenance: { rootBaselineCommit: baseline, capture: "root-worktree", overlayPaths } };
}

export function captureSourceInputs(root = dirname(packageRoot), { readCapture = capture } = {}) {
  let before = readCapture(root);
  for (let attempt = 0; attempt < 2; attempt++) {
    const after = readCapture(root);
    if (json(before.provenance) === json(after.provenance) && before.files.size === after.files.size
      && [...before.files].every(([path, bytes]) => after.files.get(path)?.equals(bytes))) return { ...after, recaptured: attempt !== 0 };
    before = after;
  }
  throw new Error("Root source inputs changed during capture and one consistency retake; snapshot was not refreshed");
}

function presentStat(path) {
  try { return lstatSync(path); }
  catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
}

function directoryAncestors(path) {
  for (let current = resolve(path); ; current = dirname(current)) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`linked or non-regular snapshot ancestor: ${current}`);
    if (current === dirname(current)) return;
  }
}

function existingSnapshot(root) {
  directoryAncestors(dirname(root));
  const stat = presentStat(root);
  if (stat === undefined) return undefined;
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`linked or non-regular source snapshot: ${root}`);
  const loaded = loadSourceInputs(root);
  return new Map([
    ...[...loaded.files].map(([path, bytes]) => [`root/${path}`, bytes]),
    [".gitattributes", readFileSync(regularPath(root, ".gitattributes"))],
    ["manifest.json", readFileSync(regularPath(root, "manifest.json"))]
  ]);
}

function requireUnchanged(root, before) {
  const current = existingSnapshot(root);
  if (current?.size !== before?.size || before !== undefined && [...before].some(([path, bytes]) => !current.get(path)?.equals(bytes))) {
    throw new Error(`source snapshot changed during refresh: ${root}`);
  }
}

export function refreshSourceInputs({ sourceRoot = dirname(packageRoot), root = SOURCE_INPUT_ROOT, validate, rename = renameSync } = {}) {
  root = resolve(root);
  const before = existingSnapshot(root);
  const snapshot = captureSourceInputs(sourceRoot);
  for (const path of snapshot.files.keys()) if (!validInputPath(path)) throw new Error(`invalid captured source input: ${path}`);
  const manifest = { format: 1, provenance: snapshot.provenance, files: [...snapshot.files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })) };
  const expected = new Map([...snapshot.files].map(([path, bytes]) => [`root/${path}`, bytes]));
  expected.set(".gitattributes", Buffer.from(attributes));
  expected.set("manifest.json", Buffer.from(json(manifest)));
  const differences = [...expected].filter(([path, bytes]) => !before?.get(path)?.equals(bytes)).map(([path]) => path);
  for (const path of before?.keys() ?? []) if (!expected.has(path)) differences.push(path);
  directoryAncestors(dirname(root));
  const stage = mkdtempSync(join(dirname(root), ".source-inputs-"));
  const candidate = join(stage, "candidate"), backup = join(stage, "previous");
  let movedOriginal = false, committed = false, retainStage = false, cleanupWarning;
  try {
    mkdirSync(candidate);
    for (const [path, bytes] of expected) {
      const target = join(candidate, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes, { flag: "wx" });
    }
    const prepared = loadSourceInputs(candidate);
    validate?.(prepared);
    requireUnchanged(root, before);
    if (differences.length) {
      if (before !== undefined) {
        rename(root, backup); movedOriginal = true;
        requireUnchanged(backup, before);
      }
      requireUnchanged(root, undefined);
      rename(candidate, root);
    }
    committed = true;
  } catch (error) {
    if (movedOriginal) {
      try { requireUnchanged(root, undefined); rename(backup, root); }
      catch (rollback) {
        retainStage = true;
        throw new AggregateError([error, rollback], `snapshot publication/rollback failed; original retained at ${backup}`);
      }
    }
    throw error;
  } finally {
    if (!retainStage) {
      try {
        directoryAncestors(stage);
        if (committed && movedOriginal) requireUnchanged(backup, before);
        rmSync(stage, { recursive: true });
      } catch (error) {
        if (!committed) throw error;
        cleanupWarning = `snapshot committed; task-owned staging cleanup failed at ${stage}: ${error.message}`;
      }
    }
  }
  return { inputs: snapshot.files.size, differences, provenance: snapshot.provenance, recaptured: snapshot.recaptured, ...(cleanupWarning === undefined ? {} : { cleanupWarning }) };
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--refresh") throw new Error("usage: node --experimental-strip-types scripts/source-inputs.mjs --refresh (explicit Root worktree capture)");
  const { sourceOutputs } = await import("./sync-source-assets.mjs");
  const result = refreshSourceInputs({ validate: (inputs) => sourceOutputs({ inputs }) });
  console.log(json(result).trim());
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
