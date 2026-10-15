import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
const { captureSourceInputs, loadSourceInputs, refreshSourceInputs } = await import(new URL("../scripts/source-inputs.mjs", import.meta.url).href);
const { sourceOutputs, syncSourceAssets } = await import(new URL("../scripts/sync-source-assets.mjs", import.meta.url).href);
const { frontendRecipe } = await import(new URL("../scripts/frontend-recipe.mjs", import.meta.url).href);

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptNames = ["source-inventory.mjs", "source-adaptations.mjs", "source-inputs.mjs", "source-input-resources.mjs", "sync-source-assets.mjs", "frontend-recipe.mjs", "materialize-frontend.mjs"];

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

function reseal(directory: string, path: string, bytes: Buffer | undefined) {
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
    row.bytes = bytes.length;
    row.sha256 = createHash("sha256").update(bytes).digest("hex");
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

test("cold Git checkout checks and regenerates every adapted byte from its committed DSMM snapshot", () => {
  const temporary = mkdtempSync(join(tmpdir(), "dsmm-cold-source-"));
  const seed = join(temporary, "seed"), directory = join(temporary, "checkout");
  return withFixtureCleanup(temporary, () => {
    cpSync(join(root, "source-inputs"), join(seed, "source-inputs"), { recursive: true });
    cpSync(join(root, ".gitattributes"), join(seed, ".gitattributes"));
    mkdirSync(join(seed, "scripts"));
    for (const name of scriptNames) cpSync(join(root, "scripts", name), join(seed, "scripts", name));
    const expected: Map<string, Buffer> = sourceOutputs();
    for (const artifact of expected.keys()) {
      mkdirSync(dirname(join(seed, artifact)), { recursive: true });
      cpSync(join(root, artifact), join(seed, artifact));
    }
    for (const row of frontendRecipe()) {
      mkdirSync(dirname(join(seed, "skills/frontend", row.target)), { recursive: true });
      cpSync(join(root, "skills/frontend", row.target), join(seed, "skills/frontend", row.target));
    }
    cpSync(join(root, "skills/frontend/.frontend-materialized.json"), join(seed, "skills/frontend/.frontend-materialized.json"));
    git(seed, "init", "--quiet");
    git(seed, "-c", "core.autocrlf=true", "add", "--all");
    git(seed, "-c", "user.name=DSMM source fixture", "-c", "user.email=dsmm-fixture@example.invalid", "commit", "--quiet", "-m", "test: seal DSMM source fixture", "-m", "Capture only the snapshot, adapter and prepared source assets for cold regeneration.");
    git(temporary, "clone", "--quiet", "--no-local", "-c", "core.autocrlf=true", "--", seed, directory);
    assert.deepEqual(loadSourceInputs(join(directory, "source-inputs")), loadSourceInputs());
    for (const [artifact, bytes] of expected) assert.deepEqual(readFileSync(join(directory, artifact)), bytes, artifact);
    assert.equal(existsSync(join(directory, "prompts/v1")), false);
    assert.equal(existsSync(join(directory, "src/hooks/config.ts")), false);
    // Only reuse the installed compiler; no Root inputs, product lib, bootstrap or network.
    mkdirSync(join(directory, "node_modules"));
    const installed = dirname(createRequire(import.meta.url).resolve("typescript/package.json"));
    symlinkSync(installed, join(directory, "node_modules/typescript"), process.platform === "win32" ? "junction" : "dir");
    let invocation = 0;
    const run = (...args: string[]) => {
      const started = performance.now();
      const result = spawnSync(process.execPath, [join(directory, "scripts/sync-source-assets.mjs"), ...args], { cwd: directory, encoding: "utf8", timeout: 30000 });
      const error = result.error as NodeJS.ErrnoException | undefined;
      return { ...result, diagnostic: JSON.stringify({ invocation: ++invocation, args, cwd: directory,
        elapsedMs: Math.round(performance.now() - started), status: result.status, signal: result.signal,
        error: error === undefined ? null : { name: error.name, message: error.message, code: error.code, errno: error.errno, syscall: error.syscall },
        stdoutBytes: Buffer.byteLength(result.stdout ?? ""), stderrBytes: Buffer.byteLength(result.stderr ?? ""),
        stdout: result.stdout?.slice(0, 2048), stderr: result.stderr?.slice(0, 4096) }) };
    };
    const incomplete = run("--check");
    assert.equal(incomplete.status, 1, incomplete.diagnostic);
    assert.match(incomplete.stderr, /frontend resource closure drift/u, incomplete.diagnostic);
    for (const row of frontendRecipe()) {
      mkdirSync(dirname(join(directory, "skills/frontend", row.target)), { recursive: true });
      cpSync(join(root, "skills/frontend", row.target), join(directory, "skills/frontend", row.target));
    }
    cpSync(join(root, "skills/frontend/.frontend-materialized.json"), join(directory, "skills/frontend/.frontend-materialized.json"));
    const checked = run("--check");
    assert.equal(checked.status, 0, checked.diagnostic);
    assert.deepEqual(JSON.parse(checked.stdout).differences, []);
    for (const [artifact, bytes] of expected) assert.deepEqual(readFileSync(join(directory, artifact)), bytes, artifact);
    const vendor = join(directory, "skills/frontend", frontendRecipe()[0].target);
    const originalVendor = readFileSync(vendor);
    writeFileSync(vendor, Buffer.concat([originalVendor, Buffer.from("\n")]));
    const vendorDrift = run("--check");
    assert.equal(vendorDrift.status, 1, vendorDrift.diagnostic);
    assert.match(vendorDrift.stderr, /frontend resource drift/u, vendorDrift.diagnostic);
    writeFileSync(vendor, originalVendor);
    for (const artifact of expected.keys()) if (artifact !== "src/skills.ts") rmSync(join(directory, artifact));
    const index = join(directory, "skills/frontend/references/design/_INDEX.md");
    assert.equal(existsSync(index), false);
    rmSync(vendor);
    const missingVendor = run();
    assert.equal(missingVendor.status, 1, missingVendor.diagnostic);
    assert.match(missingVendor.stderr, /missing frontend resource/u, missingVendor.diagnostic);
    assert.equal(existsSync(index), false, "incomplete vendor library cannot write any prepared target");
    writeFileSync(vendor, Buffer.concat([originalVendor, Buffer.from("\n")]));
    const coldVendorDrift = run();
    assert.equal(coldVendorDrift.status, 1, coldVendorDrift.diagnostic);
    assert.match(coldVendorDrift.stderr, /frontend resource drift/u, coldVendorDrift.diagnostic);
    assert.equal(existsSync(index), false);
    writeFileSync(vendor, originalVendor);
    const rebuilt = run();
    assert.equal(rebuilt.status, 0, rebuilt.diagnostic);
    for (const [artifact, bytes] of expected) assert.deepEqual(readFileSync(join(directory, artifact)), bytes, artifact);
    assert.deepEqual(loadSourceInputs(join(directory, "source-inputs")).provenance, loadSourceInputs().provenance);
    const repeated = run("--check");
    assert.equal(repeated.status, 0, repeated.diagnostic);
    assert.deepEqual(JSON.parse(repeated.stdout).differences, []);
    writeFileSync(index, "stale prepared index without recipe anchors\n");
    const staleIndex = run("--check");
    assert.equal(staleIndex.status, 1, staleIndex.diagnostic);
    assert.deepEqual(JSON.parse(staleIndex.stdout).differences, ["skills/frontend/references/design/_INDEX.md"]);
    const repaired = run();
    assert.equal(repaired.status, 0, repaired.diagnostic);
    assert.deepEqual(readFileSync(index), expected.get("skills/frontend/references/design/_INDEX.md"));
    const path = join(directory, "source-inputs/root/src/hooks/config.ts");
    writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.from("\n")]));
    const refused = run("--check");
    assert.equal(refused.status, 1, refused.diagnostic);
    assert.match(refused.stderr, /source input integrity drift/u, refused.diagnostic);
  });
});

test("cold Git checkouts preserve verbatim resource and license bytes under either newline policy", () => {
  const temporary = mkdtempSync(join(tmpdir(), "dsmm-resource-checkout-")), seed = join(temporary, "seed");
  return withFixtureCleanup(temporary, () => {
    const outputs: Map<string, Buffer> = sourceOutputs();
    const artifacts = ["skills/coding-agent-sessions/scripts/agent_sessions/pi_family.py",
      "skills/coding-agent-sessions/scripts/tests/test_pi_family_scanners.py", "skills/ast-grep/LICENSE"];
    for (const artifact of artifacts) {
      mkdirSync(dirname(join(seed, artifact)), { recursive: true });
      writeFileSync(join(seed, artifact), outputs.get(artifact)!);
    }
    cpSync(join(root, ".gitattributes"), join(seed, ".gitattributes"));
    git(seed, "init", "--quiet");
    git(seed, "-c", "core.autocrlf=true", "add", "--all");
    git(seed, "-c", "user.name=DSMM source fixture", "-c", "user.email=dsmm-fixture@example.invalid", "commit", "--quiet", "-m", "test: seal verbatim resources", "-m", "Preserve native resource and license bytes for cold delivery.");
    for (const autocrlf of ["false", "true"]) {
      const checkout = join(temporary, autocrlf);
      git(temporary, "clone", "--quiet", "--no-local", "-c", `core.autocrlf=${autocrlf}`, "--", seed, checkout);
      for (const artifact of artifacts) {
        const expected = outputs.get(artifact)!, actual = readFileSync(join(checkout, artifact));
        assert.ok(actual.equals(expected), `${artifact}: actual=${actual.length} expected=${expected.length}; core.autocrlf=${autocrlf}`);
      }
    }
  });
});

test("raw snapshot tamper, missing/extra inputs, inventory gaps and resource links fail closed", async (t) => {
  for (const kind of ["changed", "missing", "extra", "extra-directory", "inventory-gap", "link"]) await t.test(kind, () => {
    const directory = fixture();
    try {
      const path = "src/hooks/config.ts", target = join(directory, "source-inputs/root", path);
      if (kind === "changed") writeFileSync(target, "unapproved policy bytes\n");
      if (kind === "missing") rmSync(target);
      if (kind === "extra") writeFileSync(join(directory, "source-inputs/root/skills/debugging/extra.mjs"), "export default 1;\n");
      if (kind === "extra-directory") mkdirSync(join(directory, "source-inputs/root/skills/debugging/extra"));
      if (kind === "inventory-gap") reseal(directory, path, undefined);
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

test("resealed inputs still execute the adapter and enforce permission anchors and resource closure", () => {
  const directory = fixture();
  try {
    const inputRoot = join(directory, "source-inputs");
    const path = "skills/v1/brainstorming/SKILL.md";
    const original = readFileSync(join(inputRoot, "root", path), "utf8");
    const description = "A native metadata change captured as generator input.";
    reseal(directory, path, Buffer.from(original.replace(/^description:.*$/mu, `description: ${JSON.stringify(description)}`)));
    const outputs = sourceOutputs({ inputRoot });
    assert.notDeepEqual(outputs.get("src/skills.ts"), readFileSync(join(root, "src/skills.ts")));
    assert.ok(outputs.get("src/skills.ts").toString("utf8").includes(JSON.stringify(description)));
    assert.ok(outputs.get("skills/brainstorming/SKILL.md").toString("utf8").includes(description));
    const policy = "src/hooks/config.ts";
    const policyBytes = readFileSync(join(inputRoot, "root", policy));
    reseal(directory, policy, Buffer.from(policyBytes.toString("utf8").replace("The role prompt above is authoritative for this agent's scope, permissions, and output contract.", "Removed authority boundary.")));
    assert.throws(() => sourceOutputs({ inputRoot }), /source anchor drift/u);
    reseal(directory, policy, policyBytes);
    reseal(directory, "skills/debugging/references/tools/dap.md", undefined);
    assert.throws(() => sourceOutputs({ inputRoot }), /source resource closure drift/u, "prepared resources cannot mask a missing snapshot dependency");
  } finally { rmSync(directory, { recursive: true }); }
});

test("frontend recipe and resource closure follow the sealed input index, never a prepared index fallback", () => {
  const directory = fixture();
  try {
    const inputRoot = join(directory, "source-inputs"), path = "skills/frontend/references/design/_INDEX.md";
    const original = readFileSync(join(inputRoot, "root", path), "utf8");
    const updated = original.replace("### Mood-based shortcuts", "| `source-only-brand.md` | Required input brand |\n\n### Mood-based shortcuts");
    assert.notEqual(updated, original);
    reseal(directory, path, Buffer.from(updated));
    assert.throws(() => sourceOutputs({ inputRoot }), /missing frontend resource: references\/design\/source-only-brand\.md/u);
    reseal(directory, path, undefined);
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
