import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
const { captureSourceInputs, loadSourceInputs, refreshSourceInputs } = await import(new URL("../scripts/source-inputs.mjs", import.meta.url).href);
const { sourceOutputs, syncSourceAssets } = await import(new URL("../scripts/sync-source-assets.mjs", import.meta.url).href);

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "dsmm-input-test-"));
  cpSync(join(root, "source-inputs"), join(directory, "source-inputs"), { recursive: true });
  return directory;
}

async function withFixtureCleanup(directory: string, body: () => void | Promise<void>) {
  const ownedRoot = realpathSync(directory), owner = randomUUID();
  assert.equal(dirname(ownedRoot), realpathSync(tmpdir()));
  assert.equal(lstatSync(directory).isSymbolicLink(), false);
  const marker = join(ownedRoot, ".source-inputs-test-owner");
  writeFileSync(marker, owner, { flag: "wx" });
  let bodyFailed = false, bodyFailure: unknown;
  try {
    return await body();
  } catch (error) {
    bodyFailed = true;
    bodyFailure = error;
    throw error;
  } finally {
    try {
      assert.equal(realpathSync(directory), ownedRoot);
      assert.equal(lstatSync(directory).isSymbolicLink(), false);
      assert.equal(readFileSync(marker, "utf8"), owner);
      rmSync(ownedRoot, { recursive: true, maxRetries: 5, retryDelay: 100 });
    } catch (error) {
      if (bodyFailed) throw new AggregateError([bodyFailure, error], `Fixture body and cleanup failed: ${ownedRoot}`);
      throw error;
    }
  }
}

function git(directory: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd: directory, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.error?.stack ?? result.signal ?? ""}\n${result.stderr}`);
  return result.stdout.trim();
}

function inputRepository(directory: string) {
  cpSync(join(root, "source-inputs/root"), directory, { recursive: true });
  git(directory, "init", "--quiet");
  git(directory, "-c", "core.autocrlf=false", "add", "--all");
  git(directory, "-c", "user.name=DSMM source fixture", "-c", "user.email=dsmm-fixture@example.invalid", "commit", "--quiet", "-m", "test: capture Root input fixture", "-m", "Establish a raw input baseline for explicit snapshot refresh.");
}

function tree(directory: string): Map<string, Buffer | string> {
  const entries = new Map<string, Buffer | string>();
  const walk = (path: string, relative: string) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) entries.set(relative, `link:${readlinkSync(path)}`);
    else if (stat.isDirectory()) {
      entries.set(relative, "directory");
      for (const name of readdirSync(path).sort()) walk(join(path, name), `${relative}/${name}`);
    } else entries.set(relative, readFileSync(path));
  };
  walk(directory, "");
  return entries;
}

function unchanged(directory: string, before: Map<string, Buffer | string>) {
  const after = tree(directory);
  assert.deepEqual([...after.keys()], [...before.keys()], directory);
  for (const [path, bytes] of before) {
    const actual = after.get(path);
    if (Buffer.isBuffer(bytes)) assert.ok(Buffer.isBuffer(actual) && actual.equals(bytes), `changed bytes: ${directory}/${path}`);
    else assert.equal(actual, bytes, `${directory}/${path}`);
  }
}

function updateInput(directory: string, path: string, bytes: Buffer | undefined) {
  const manifestPath = join(directory, "source-inputs/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const row = manifest.files.find((row: { path: string }) => row.path === path);
  assert.ok(row);
  if (bytes === undefined) {
    manifest.files = manifest.files.filter((row: { path: string }) => row.path !== path);
    manifest.provenance.overlayPaths = manifest.provenance.overlayPaths.filter((entry: string) => entry !== path);
    rmSync(join(directory, "source-inputs/root", path));
  } else {
    writeFileSync(join(directory, "source-inputs/root", path), bytes);
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

test("missing/extra inputs, inventory gaps and resource links fail closed", async (t) => {
  for (const kind of ["missing", "extra", "extra-directory", "inventory-gap", "link"]) await t.test(kind, () => {
    const directory = fixture();
    try {
      const path = "src/hooks/config.ts", target = join(directory, "source-inputs/root", path);
      if (kind === "missing") rmSync(target);
      if (kind === "extra") writeFileSync(join(directory, "source-inputs/root/skills/debugging/extra.mjs"), "export default 1;\n");
      if (kind === "extra-directory") mkdirSync(join(directory, "source-inputs/root/skills/debugging/extra"));
      if (kind === "inventory-gap") updateInput(directory, path, undefined);
      if (kind === "link") {
        const folder = join(directory, "source-inputs/root/src/intent");
        rmSync(folder, { recursive: true });
        symlinkSync(join(root, "source-inputs/root/src/intent"), folder, process.platform === "win32" ? "junction" : "dir");
      }
      assert.throws(() => loadSourceInputs(join(directory, "source-inputs")), Error);
      assert.throws(() => syncSourceAssets({ root: directory, inputRoot: join(directory, "source-inputs") }), Error);
      assert.equal(existsSync(join(directory, "prompts/source")), false, "invalid input cannot prepare any output or fall back to Root");
    } finally { rmSync(directory, { recursive: true }); }
  });
});

test("input updates feed metadata generation and enforce adapter inputs and resource closure", () => {
  const directory = fixture();
  try {
    const inputRoot = join(directory, "source-inputs");
    const path = "skills/v1/brainstorming/SKILL.md";
    const original = readFileSync(join(inputRoot, "root", path), "utf8");
    const description = "A native metadata change captured as generator input.";
    updateInput(directory, path, Buffer.from(original.replace(/^description:.*$/mu, `description: ${JSON.stringify(description)}`)));
    const outputs = sourceOutputs({ inputRoot });
    assert.ok(outputs.get("src/skills.ts").toString("utf8").includes(JSON.stringify(description)));
    assert.ok(outputs.get("skills/brainstorming/SKILL.md").toString("utf8").includes(description));
    const policy = "src/hooks/config.ts";
    const policyBytes = readFileSync(join(inputRoot, "root", policy));
    updateInput(directory, policy, Buffer.from(policyBytes.toString("utf8").replace("The role prompt above is authoritative for this agent's scope, permissions, and output contract.", "Removed authority boundary.")));
    assert.throws(() => sourceOutputs({ inputRoot }), /source anchor drift/u);
    updateInput(directory, policy, policyBytes);
    updateInput(directory, "skills/debugging/references/tools/dap.md", undefined);
    assert.throws(() => sourceOutputs({ inputRoot }), /source resource closure drift/u, "prepared resources cannot mask a missing snapshot dependency");
  } finally { rmSync(directory, { recursive: true }); }
});

test("frontend recipe and resource closure use the source input index", () => {
  const directory = fixture();
  try {
    const inputRoot = join(directory, "source-inputs"), path = "skills/frontend/references/design/_INDEX.md";
    const original = readFileSync(join(inputRoot, "root", path), "utf8");
    const updated = original.replace("### Mood-based shortcuts", "| `source-only-brand.md` | Required input brand |\n\n### Mood-based shortcuts");
    assert.notEqual(updated, original);
    updateInput(directory, path, Buffer.from(updated));
    assert.throws(() => sourceOutputs({ inputRoot }), /missing frontend resource: references\/design\/source-only-brand\.md/u);
    updateInput(directory, path, undefined);
    assert.throws(() => sourceOutputs({ inputRoot }), /missing generated frontend index/u);
  } finally { rmSync(directory, { recursive: true }); }
});

test("prepared output check detects additional resources rather than hashing only known targets", () => {
  const directory = fixture();
  try {
    syncSourceAssets({ root: directory });
    const extra = "skills/debugging/references/scripts/injected.mjs";
    writeFileSync(join(directory, extra), "export default 1;\n");
    assert.ok(syncSourceAssets({ root: directory, check: true }).differences.includes(extra));
    assert.throws(() => syncSourceAssets({ root: directory }), /unexpected prepared source resources/u);
    assert.equal(readFileSync(join(directory, extra), "utf8"), "export default 1;\n");
  } finally { rmSync(directory, { recursive: true }); }
});

test("capture permits one consistent retake and refuses continuing Root drift", () => {
  const snapshot = loadSourceInputs();
  const later = { ...snapshot, files: new Map(snapshot.files) };
  later.files.set("prompts/shared/shell-safety.md", Buffer.from("changed capture input\n"));
  let reads = 0;
  const captured = captureSourceInputs(root, { readCapture: () => reads++ === 0 ? snapshot : later });
  assert.equal(reads, 3);
  assert.equal(captured.recaptured, true);
  assert.deepEqual(captured.files, later.files);
  reads = 0;
  assert.throws(() => captureSourceInputs(root, { readCapture: () => reads++ % 2 === 0 ? snapshot : later }), /changed during capture/u);
  assert.equal(reads, 3);
});

test("explicit refresh captures the provable Git baseline and raw uncommitted inputs before sealing", () => {
  const temporary = mkdtempSync(join(tmpdir(), "dsmm-source-refresh-"));
  const sourceRoot = join(temporary, "root"), inputRoot = join(temporary, "snapshot");
  return withFixtureCleanup(temporary, () => {
    cpSync(join(root, "source-inputs/root"), sourceRoot, { recursive: true });
    git(sourceRoot, "init", "--quiet");
    git(sourceRoot, "-c", "core.autocrlf=false", "add", "--all");
    git(sourceRoot, "-c", "user.name=DSMM source fixture", "-c", "user.email=dsmm-fixture@example.invalid", "commit", "--quiet", "-m", "test: capture Root input fixture", "-m", "Establish a raw input baseline for explicit snapshot refresh.");
    const baseline = git(sourceRoot, "rev-parse", "HEAD");
    const path = "prompts/shared/shell-safety.md", added = "skills/debugging/references/scripts/capture-overlay.mjs";
    writeFileSync(join(sourceRoot, path), Buffer.concat([readFileSync(join(sourceRoot, path)), Buffer.from("\nApproved raw input overlay.\n")]));
    writeFileSync(join(sourceRoot, added), "export default 1;\n");
    const result = refreshSourceInputs({ sourceRoot, root: inputRoot, validate: (inputs: unknown) => sourceOutputs({ inputs }) });
    assert.equal(result.provenance.rootBaselineCommit, baseline);
    assert.deepEqual(result.provenance.overlayPaths, [path, added]);
    const sealed = loadSourceInputs(inputRoot);
    assert.deepEqual(sealed.provenance, result.provenance);
    assert.deepEqual(sealed.files.get(path), readFileSync(join(sourceRoot, path)));
    assert.deepEqual(sealed.files.get(added), readFileSync(join(sourceRoot, added)));
    const manifest = readFileSync(join(inputRoot, "manifest.json"));
    const policy = "src/hooks/config.ts";
    writeFileSync(join(sourceRoot, policy), "Removed permission anchors.\n");
    assert.throws(() => refreshSourceInputs({ sourceRoot, root: inputRoot, validate: (inputs: unknown) => sourceOutputs({ inputs }) }), /source anchor drift/u);
    assert.deepEqual(readFileSync(join(inputRoot, "manifest.json")), manifest);
    assert.deepEqual(loadSourceInputs(inputRoot).files, sealed.files, "failed preflight leaves the sealed snapshot intact");
    writeFileSync(join(sourceRoot, policy), sealed.files.get(policy));
    rmSync(join(sourceRoot, added));
    const replaced = refreshSourceInputs({ sourceRoot, root: inputRoot, validate: (inputs: unknown) => sourceOutputs({ inputs }) });
    assert.ok(replaced.differences.includes(`root/${added}`));
    assert.equal(loadSourceInputs(inputRoot).files.has(added), false, "only a previously sealed input may be retired during successful publication");
  });
});

test("refresh rejects metadata links, malformed directories and unknown content before any snapshot or outside write", async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "dsmm-refresh-safety-")), sourceRoot = join(temporary, "inputs");
  return withFixtureCleanup(temporary, async () => {
    inputRepository(sourceRoot);
    const source = join(sourceRoot, "prompts/shared/shell-safety.md");
    writeFileSync(source, Buffer.concat([readFileSync(source), Buffer.from("\nApproved input change.\n")]));
    for (const kind of ["attributes-live", "attributes-dangling", "manifest-live", "manifest-dangling", "attributes-directory", "manifest-directory", "root-live", "root-dangling", "snapshot-live", "snapshot-dangling", "target-live", "target-dangling", "ancestor-link", "unknown-resource", "unknown-entry"]) await t.test(kind, () => {
      const directory = fixture(), outside = join(directory, "outside");
      let inputRoot = join(directory, "source-inputs");
      mkdirSync(outside);
      try {
        if (kind === "ancestor-link") {
          renameSync(inputRoot, join(outside, "source-inputs"));
          symlinkSync(outside, join(directory, "parent-link"), process.platform === "win32" ? "junction" : "dir");
          inputRoot = join(directory, "parent-link/source-inputs");
        } else if (kind.startsWith("snapshot")) {
          const external = join(outside, "snapshot");
          if (kind.endsWith("live")) cpSync(inputRoot, external, { recursive: true });
          rmSync(inputRoot, { recursive: true });
          symlinkSync(external, inputRoot, process.platform === "win32" ? "junction" : "dir");
        } else if (kind === "unknown-resource") writeFileSync(join(inputRoot, "root/skills/debugging/private.mjs"), "user-owned content\n");
        else if (kind === "unknown-entry") writeFileSync(join(inputRoot, "private.txt"), "user-owned content\n");
        else {
          const path = kind.startsWith("attributes") ? ".gitattributes" : kind.startsWith("manifest") ? "manifest.json" : kind.startsWith("target") ? "root/prompts/shared/shell-safety.md" : "root";
          const target = join(inputRoot, path);
          if (kind.endsWith("directory")) {
            rmSync(target); mkdirSync(target); writeFileSync(join(target, "private.txt"), "user-owned content\n");
          } else {
            const external = join(outside, "target");
            if (kind.endsWith("live")) cpSync(target, external, { recursive: path === "root" });
            rmSync(target, { recursive: path === "root" });
            symlinkSync(external, target, path === "root" ? process.platform === "win32" ? "junction" : "dir" : "file");
          }
        }
        const before = tree(inputRoot), outsideBefore = tree(outside), siblings = readdirSync(directory).sort();
        let failure;
        try { refreshSourceInputs({ sourceRoot, root: inputRoot }); } catch (error) { failure = error; }
        unchanged(outside, outsideBefore);
        unchanged(inputRoot, before);
        assert.ok(failure instanceof Error, "unsafe snapshot must be refused");
        assert.deepEqual(readdirSync(directory).sort(), siblings, "no staged resources may leak on failure");
      } finally { rmSync(directory, { recursive: true }); }
    });
  });
});

test("validated candidate publication failure rolls back the original snapshot without deleting unknown content", () => {
  const directory = fixture(), sourceRoot = join(directory, "inputs"), inputRoot = join(directory, "source-inputs");
  return withFixtureCleanup(directory, () => {
    inputRepository(sourceRoot);
    const source = join(sourceRoot, "prompts/shared/shell-safety.md");
    writeFileSync(source, Buffer.concat([readFileSync(source), Buffer.from("\nApproved input change.\n")]));
    const before = tree(inputRoot), siblings = readdirSync(directory).sort();
    assert.throws(() => refreshSourceInputs({ sourceRoot, root: inputRoot, rename(from: string, to: string) {
      if (to === inputRoot && from.endsWith("candidate")) throw Object.assign(new Error("candidate publication denied"), { code: "EACCES" });
      renameSync(from, to);
    } }), /candidate publication denied/u);
    unchanged(inputRoot, before);
    assert.deepEqual(readdirSync(directory).sort(), siblings);
    assert.throws(() => refreshSourceInputs({ sourceRoot, root: inputRoot, validate() { throw new Error("candidate validation denied"); } }), /candidate validation denied/u);
    unchanged(inputRoot, before);
    assert.deepEqual(readdirSync(directory).sort(), siblings);
  });
});
