import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const smokePath = join(packageRoot, "scripts", "docker-smoke.mjs");
const checkerPath = join(packageRoot, "scripts", "check-release-readiness.mjs");
const releaseFixturePrefix = "dsmm-release-readiness-test-";
const releaseFixtureParent = resolve(tmpdir());
const licenseMismatchError = "package LICENSE must be byte-identical to repository LICENSE";

interface ReleaseReceipt {
  name: string | null;
  version: string | null;
  fileCount: number;
  packedSize: number;
  unpackedSize: number;
  requiredSurfaceCount: number;
  forbiddenSurfaceCount: number;
  outcome: "ready" | "failed";
  errors: string[];
}

const requiredExact = [
  "LICENSE", "README.md", "package.json", "cordis.patch.yml",
  "scripts/repair-session-log.mjs", "scripts/session-repair-native-verifier.mjs",
  "locale/en.json", "locale/zh.json",
  "lib/index.js", "lib/index.d.ts", "lib/preset-skills.js", "lib/preset-skills.d.ts",
  "lib/client.js", "lib/client/index.js", "lib/client/index.d.ts",
  ...["profiles", "profile-types", "profile-store", "profile-runtime", "profile-rpc", "profile-remote"].flatMap((name) => [`lib/${name}.js`, `lib/${name}.d.ts`]),
  ...["session-metadata", "session-persistence"].flatMap((name) => [`lib/${name}.js`, `lib/${name}.d.ts`]),
  "docs/agent-presets.md", "docs/compatibility.md", "docs/design.md", "docs/lsp.md",
  "docs/migration-from-ocmm.md", "docs/model-routing.md", "docs/profiles.md", "docs/releasing.md",
  "docs/roadmap.md", "docs/runtime-recovery.md", "docs/safety-guards.md",
  "docs/settings-status.md", "docs/skill-sync.md"
];

const requiredTrees = ["agent-presets", "docs/research", "patches", "prompts", "skills"];

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function normalizePackagePath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function compiledOutputPaths(root: string, current = join(root, "src")): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => compareBytewise(left.name, right.name))) {
    const entryPath = join(current, entry.name);
    if (entry.isDirectory()) paths.push(...compiledOutputPaths(root, entryPath));
    else if (entry.isFile() && /\.tsx?$/u.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      const base = normalizePackagePath(join(root, "src"), entryPath).replace(/\.tsx?$/u, "");
      paths.push(`lib/${base}.js`, `lib/${base}.d.ts`);
    }
  }
  return paths;
}

function requiredTreeFiles(root: string, tree: string, current = join(root, tree)): string[] {
  const paths: string[] = [];
  const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) => compareBytewise(left.name, right.name));
  for (const entry of entries) {
    if ([".gitignore", ".npmignore"].includes(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    const entryPath = join(current, entry.name);
    if (entry.isFile()) {
      paths.push(normalizePackagePath(root, entryPath));
    } else if (entry.isDirectory()) {
      paths.push(...requiredTreeFiles(root, tree, entryPath));
    }
  }
  return paths;
}

function expectedRequiredSurfaceCount(root: string): number {
  return new Set([...requiredExact, ...compiledOutputPaths(root), ...requiredTrees.flatMap((tree) => requiredTreeFiles(root, tree))]).size;
}

function listTgzPaths(root: string, current = root): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const entryPath = join(current, entry.name);
    if (entry.isDirectory()) {
      paths.push(...listTgzPaths(root, entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".tgz")) {
      paths.push(relative(root, entryPath).split(sep).join("/"));
    }
  }
  return paths.sort();
}

function runReleaseCheckerArguments(args: string[]): { receipt: ReleaseReceipt; status: number | null } {
  const result = spawnSync(process.execPath, [checkerPath, ...args], { encoding: "utf8" });
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^.+\n$/u, "checker writes exactly one newline-terminated JSON line");
  const lines = result.stdout.trimEnd().split(/\r?\n/u);
  assert.equal(lines.length, 1, "checker writes exactly one JSON line");

  return { receipt: JSON.parse(lines[0]) as ReleaseReceipt, status: result.status };
}

function runReleaseChecker(root: string): { receipt: ReleaseReceipt; status: number | null } {
  return runReleaseCheckerArguments(["--package-root", root]);
}

function createReleaseFixture(): string {
  appendFileSync(join(tmpdir(), "dsmm-c0-journal.jsonl"), `${JSON.stringify({ probe: "release-readiness-fixture", prefix: releaseFixturePrefix, time: Date.now() })}\n`);
  const fixtureRoot = mkdtempSync(join(tmpdir(), releaseFixturePrefix));
  writeFileSync(join(fixtureRoot, ".run-owner"), `release-readiness:${basename(fixtureRoot)}`, { flag: "wx" });
  cpSync(packageRoot, fixtureRoot, {
    recursive: true,
    filter: (source) => !relative(packageRoot, source).split(sep).includes("node_modules")
  });
  return fixtureRoot;
}

function removeReleaseFixture(fixtureRoot: string): void {
  const resolvedFixture = resolve(fixtureRoot);
  assert.equal(dirname(resolvedFixture), releaseFixtureParent, "fixture is a direct child of the OS temporary directory");
  assert.ok(basename(resolvedFixture).startsWith(releaseFixturePrefix), "fixture has the expected prefix");
  assert.equal(readFileSync(join(resolvedFixture, ".run-owner"), "utf8"), `release-readiness:${basename(resolvedFixture)}`);
  rmSync(resolvedFixture, { recursive: true, force: false });
}

function updateFixtureManifest(fixtureRoot: string, update: (manifest: Record<string, unknown>) => void): void {
  const manifestPath = join(fixtureRoot, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  update(manifest);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function writeFixtureFile(fixtureRoot: string, path: string, contents: string): void {
  const target = join(fixtureRoot, ...path.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function assertReceiptKeys(receipt: ReleaseReceipt): void {
  assert.deepEqual(Object.keys(receipt), [
    "name",
    "version",
    "fileCount",
    "packedSize",
    "unpackedSize",
    "requiredSurfaceCount",
    "forbiddenSurfaceCount",
    "outcome",
    "errors"
  ]);
}

test("Docker smoke uses the dedicated native smoke profile", () => {
  const smoke = readFileSync(smokePath, "utf8");
  const profileMatch = /^const PROFILE = "(?<profile>[^"]+)";$/mu.exec(smoke);

  if (profileMatch === null) {
    assert.fail("docker smoke defines its profile constant");
  }
  const profile = profileMatch.groups?.profile;
  if (profile === undefined) {
    assert.fail("docker smoke profile regex captures its profile");
  }
  assert.equal(profile, "dsmm-v1-smoke");

  assert.match(profile, /^dsmm-v1-smoke$/u);
});

test("release readiness checker accepts the real 0.2.0 package without creating a tarball", () => {
  const tgzBefore = listTgzPaths(packageRoot);
  const expectedCount = expectedRequiredSurfaceCount(packageRoot);
  const { receipt, status } = runReleaseChecker(packageRoot);

  assertReceiptKeys(receipt);
  assert.equal(status, 0);
  assert.equal(receipt.name, "@dsmm/dsmm");
  assert.equal(receipt.version, "0.2.0");
  assert.ok(receipt.fileCount > 0);
  assert.ok(receipt.packedSize > 0);
  assert.ok(receipt.unpackedSize > 0);
  assert.equal(receipt.requiredSurfaceCount, expectedCount);
  assert.equal(receipt.forbiddenSurfaceCount, 0);
  assert.equal(receipt.outcome, "ready");
  assert.deepEqual(receipt.errors, []);
  assert.deepEqual(listTgzPaths(packageRoot), tgzBefore);
});

test("release readiness checker rejects the superseded unscoped package identity", () => {
  const fixtureRoot = createReleaseFixture();
  const tgzBefore = listTgzPaths(fixtureRoot);
  try {
    updateFixtureManifest(fixtureRoot, (manifest) => { manifest.name = "dsmm"; });
    const { receipt, status } = runReleaseChecker(fixtureRoot);

    assertReceiptKeys(receipt);
    assert.equal(status, 1);
    assert.equal(receipt.outcome, "failed");
    assert.equal(receipt.fileCount, 0);
    assert.deepEqual(receipt.errors, ["manifest.name must equal @dsmm/dsmm"]);
    assert.deepEqual(listTgzPaths(fixtureRoot), tgzBefore);
  } finally {
    removeReleaseFixture(fixtureRoot);
  }
});

test("release readiness checker rejects a stale or manifest-selected release version", () => {
  for (const version of ["0.1.2", "0.1.3", "0.1.4", "0.1.5", "0.1.6", "0.1.7", "0.1.8", "0.1.10"]) {
    const fixtureRoot = createReleaseFixture();
    try {
      updateFixtureManifest(fixtureRoot, (manifest) => { manifest.version = version; });
      const { receipt, status } = runReleaseChecker(fixtureRoot);
      assert.equal(status, 1, version);
      assert.equal(receipt.fileCount, 0);
      assert.deepEqual(receipt.errors, ["manifest.version must equal 0.2.0"]);
    } finally { removeReleaseFixture(fixtureRoot); }
  }
});

test("release readiness checker requires both native DSMM metadata resources", () => {
  for (const path of ["locale/en.json", "locale/zh.json"]) {
    const fixtureRoot = createReleaseFixture();
    try {
      rmSync(join(fixtureRoot, ...path.split("/")));
      const { receipt, status } = runReleaseChecker(fixtureRoot);
      assert.equal(status, 1, path);
      assert.deepEqual(receipt.errors, [`missing required package surface: ${path}`]);
    } finally { removeReleaseFixture(fixtureRoot); }
  }
});

test("release readiness checker rejects malformed or noncanonical DSMM metadata", () => {
  const cases = [
    ["invalid JSON", "{not-json}"],
    ["missing metadata", "{}"],
    ["wrong title", JSON.stringify({ meta: { title: "Deepwork", description: "Workflow bundle" } })],
    ["empty description", JSON.stringify({ meta: { title: "DSMM", description: "  \n" } })],
    ["non-string description", JSON.stringify({ meta: { title: "DSMM", description: 3 } })],
    ["unexpected metadata field", JSON.stringify({ meta: { title: "DSMM", description: "Workflow bundle", extra: true } })],
    ["unexpected root field", JSON.stringify({ meta: { title: "DSMM", description: "Workflow bundle" }, extra: true })]
  ];
  for (const path of ["locale/en.json", "locale/zh.json"]) {
    const fixtureRoot = createReleaseFixture();
    try {
      for (const [label, contents] of cases) {
        writeFixtureFile(fixtureRoot, path, contents);
        const { receipt, status } = runReleaseChecker(fixtureRoot);
        assert.equal(status, 1, `${path}: ${label}`);
        assert.deepEqual(receipt.errors, [`plugin metadata resource must contain exactly DSMM title and nonempty description: ${path}`]);
      }
    } finally { removeReleaseFixture(fixtureRoot); }
  }
});

test("release readiness checker rejects extra locale assets without broadening file policy", () => {
  const fixtureRoot = createReleaseFixture();
  try {
    const extra = "locale/fr.json";
    writeFixtureFile(fixtureRoot, extra, JSON.stringify({ meta: { title: "DSMM", description: "Workflow bundle" } }));
    const { receipt, status } = runReleaseChecker(fixtureRoot);
    assert.equal(status, 1);
    assert.equal(receipt.forbiddenSurfaceCount, 1);
    assert.deepEqual(receipt.errors, [`forbidden package surface: ${extra}`]);
  } finally { removeReleaseFixture(fixtureRoot); }
});

test("release readiness checker pins exact locale resource exports", () => {
  for (const mutate of [
    (exports: Record<string, unknown>) => { delete exports["./locale/en.json"]; },
    (exports: Record<string, unknown>) => { exports["./locale/zh.json"] = "./locale/en.json"; },
    (exports: Record<string, unknown>) => { exports["./locale/en.json"] = "./src/client/locales.ts"; },
    (exports: Record<string, unknown>) => { exports["./locale/fr.json"] = "./locale/fr.json"; }
  ]) {
    const fixtureRoot = createReleaseFixture();
    try {
      updateFixtureManifest(fixtureRoot, (manifest) => mutate(manifest.exports as Record<string, unknown>));
      const { receipt, status } = runReleaseChecker(fixtureRoot);
      assert.equal(status, 1);
      assert.equal(receipt.fileCount, 0);
      assert.deepEqual(receipt.errors, ["manifest.exports must exactly equal the seven public exports"]);
    } finally { removeReleaseFixture(fixtureRoot); }
  }
});

test("release readiness checker requires native client and each profile runtime surface", () => {
  for (const path of ["lib/client.js", "lib/client/index.d.ts", "lib/profile-store.js", "lib/profile-runtime.d.ts", "lib/profile-rpc.js", "lib/profile-remote.d.ts", "docs/profiles.md"]) {
    const fixtureRoot = createReleaseFixture();
    try {
      rmSync(join(fixtureRoot, ...path.split("/")));
      const { receipt, status } = runReleaseChecker(fixtureRoot);
      assert.equal(status, 1, path);
      assert.equal(receipt.outcome, "failed", path);
      assert.ok(receipt.errors.includes(`missing required package surface: ${path}`), path);
    } finally { removeReleaseFixture(fixtureRoot); }
  }
});

test("release readiness checker recursively requires nested TSX runtime and declaration outputs", () => {
  const fixtureRoot = createReleaseFixture();
  try {
    writeFixtureFile(fixtureRoot, "src/client/nested/Fixture.tsx", "export const Fixture = () => null;\n");
    const { receipt, status } = runReleaseChecker(fixtureRoot);
    assert.equal(status, 1);
    assert.ok(receipt.errors.includes("missing required package surface: lib/client/nested/Fixture.js"));
    assert.ok(receipt.errors.includes("missing required package surface: lib/client/nested/Fixture.d.ts"));
  } finally { removeReleaseFixture(fixtureRoot); }
});

test("release readiness checker requires every history compatibility companion asset", () => {
  for (const module of ["session-metadata", "session-persistence"]) {
    for (const extension of ["js", "d.ts"]) {
      const path = `lib/${module}.${extension}`;
      const fixtureRoot = createReleaseFixture();
      try {
        rmSync(join(fixtureRoot, ...path.split("/")));
        const { receipt, status } = runReleaseChecker(fixtureRoot);
        assert.equal(status, 1, path);
        assert.ok(receipt.errors.includes(`missing required package surface: ${path}`), path);
      } finally { removeReleaseFixture(fixtureRoot); }
    }
  }
});

test("release readiness checker requires both exact operator repair scripts", () => {
  for (const path of ["scripts/repair-session-log.mjs", "scripts/session-repair-native-verifier.mjs"]) {
    const fixtureRoot = createReleaseFixture();
    try {
      rmSync(join(fixtureRoot, ...path.split("/")));
      const { receipt, status } = runReleaseChecker(fixtureRoot);
      assert.equal(status, 1, path);
      assert.deepEqual(receipt.errors, [`missing required package surface: ${path}`]);
    } finally { removeReleaseFixture(fixtureRoot); }
  }
});

test("release readiness checker rejects broad or extra implementation script manifest entries", () => {
  for (const extra of ["scripts", "scripts/*.mjs", "scripts/build-client.mjs", "scripts/nested/repair-session-log.mjs"]) {
    const fixtureRoot = createReleaseFixture();
    try {
      updateFixtureManifest(fixtureRoot, (manifest) => { (manifest.files as string[]).push(extra); });
      const { receipt, status } = runReleaseChecker(fixtureRoot);
      assert.equal(status, 1, extra);
      assert.equal(receipt.fileCount, 0);
      assert.deepEqual(receipt.errors, ["manifest.files must exactly equal the release files policy"]);
    } finally { removeReleaseFixture(fixtureRoot); }
  }
});

test("release readiness checker rejects nested script, build, test, temporary and secret leakage", () => {
  const paths = [
    "lib/scripts/extra.js",
    "patches/scripts/repair-session-log.mjs",
    "patches/nested/scripts/session-repair-native-verifier.mjs",
    "patches/build/leak.js",
    "patches/test/operator.mjs",
    "patches/temp/operator.mjs",
    "patches/secrets.json",
    "skills/debugging/references/scripts/not-source.mjs",
    "skills/debugging/references/scripts/secrets.json"
  ];
  const fixtureRoot = createReleaseFixture();
  try {
    for (const path of paths) writeFixtureFile(fixtureRoot, path, "fixture\n");
    const { receipt, status } = runReleaseChecker(fixtureRoot);
    assert.equal(status, 1);
    assert.equal(receipt.forbiddenSurfaceCount, paths.length);
    assert.deepEqual(receipt.errors, paths.map((path) => `forbidden package surface: ${path}`).sort(compareBytewise));
  } finally { removeReleaseFixture(fixtureRoot); }
});

test("release readiness checker preserves the exact history companion export and rejects added exports", () => {
  for (const mutate of [
    (exports: Record<string, unknown>) => { delete exports["./session-persistence"]; },
    (exports: Record<string, unknown>) => { exports["./session-persistence"] = "./lib/session-metadata.js"; },
    (exports: Record<string, unknown>) => { exports["./session-metadata"] = "./lib/session-metadata.js"; }
  ]) {
    const fixtureRoot = createReleaseFixture();
    try {
      updateFixtureManifest(fixtureRoot, (manifest) => mutate(manifest.exports as Record<string, unknown>));
      const { receipt, status } = runReleaseChecker(fixtureRoot);
      assert.equal(status, 1);
      assert.equal(receipt.fileCount, 0);
      assert.deepEqual(receipt.errors, ["manifest.exports must exactly equal the seven public exports"]);
    } finally { removeReleaseFixture(fixtureRoot); }
  }
});

test("release readiness checker pins native tools, session and persistence contracts in peer and dev dependencies", () => {
  for (const section of ["peerDependencies", "devDependencies"]) {
    for (const name of ["@deepseek-ai/dsh-tools", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-session-persistence", "@deepseek-ai/dsh-session-persistence-jsonl", "@deepseek-ai/dsh-plan-mode", "@deepseek-ai/dsh-compaction-basic", "@deepseek-ai/dsh-command-compact", "@deepseek-ai/dsh-compaction-tool-result-pruner", "@deepseek-ai/dsh-tool-ask-user", "@deepseek-ai/dsh-tool-todo"]) {
      const fixtureRoot = createReleaseFixture();
      try {
        updateFixtureManifest(fixtureRoot, (manifest) => { (manifest[section] as Record<string, string>)[name] = "^0.2.0-rc.2"; });
        const { receipt, status } = runReleaseChecker(fixtureRoot);
        assert.equal(status, 1, `${section}.${name}`);
        assert.equal(receipt.fileCount, 0);
        assert.deepEqual(receipt.errors, [`manifest.${section} must preserve release ranges`]);
      } finally { removeReleaseFixture(fixtureRoot); }
    }
  }
});

test("release readiness checker rejects a dev-only dsh-tools runtime dependency before pack", () => {
  const fixtureRoot = createReleaseFixture();
  try {
    updateFixtureManifest(fixtureRoot, (manifest) => {
      assert.equal((manifest.devDependencies as Record<string, string>)["@deepseek-ai/dsh-tools"], "0.2.0-rc.2");
      delete (manifest.peerDependencies as Record<string, string>)["@deepseek-ai/dsh-tools"];
    });
    const { receipt, status } = runReleaseChecker(fixtureRoot);
    assert.equal(status, 1);
    assert.equal(receipt.outcome, "failed");
    assert.equal(receipt.fileCount, 0);
    assert.deepEqual(receipt.errors, ["manifest.peerDependencies must preserve release ranges"]);
  } finally { removeReleaseFixture(fixtureRoot); }
});

test("release readiness checker rejects missing client metadata and duplicate Typert auto-loading", () => {
  for (const mutate of [
    (manifest: Record<string, unknown>) => { delete (manifest.dsh as Record<string, unknown>).client; },
    (manifest: Record<string, unknown>) => { (manifest.exports as Record<string, unknown>)["./typert"] = "./lib/profile-remote.js"; }
  ]) {
    const fixtureRoot = createReleaseFixture();
    try {
      updateFixtureManifest(fixtureRoot, mutate);
      const { receipt, status } = runReleaseChecker(fixtureRoot);
      assert.equal(status, 1);
      assert.equal(receipt.fileCount, 0, "unsafe loader metadata is rejected before pack");
      assert.ok(receipt.errors.some((error) => error.startsWith("manifest.dsh ") || error.startsWith("manifest.exports ")));
    } finally { removeReleaseFixture(fixtureRoot); }
  }
});

test("release readiness checker rejects invalid, eager and Host-leaking client bundles", () => {
  const lazy = (id: string, body: string) => `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => { ${body} } });\n`;
  const cases = [
    ["wrong native id", lazy("dsmm", "return {apply(){}, inject: []};")],
    ["absent plugin exports", lazy("@dsmm/dsmm", "return {}; ")],
    ["eager browser code", "require('react');\n"],
    ["Node runtime import", lazy("@dsmm/dsmm", "require('node:fs'); return {apply(){}, inject: []};")],
    ["user path", lazy("@dsmm/dsmm", "const path = 'C:/Users/someone/checkout'; return {apply(){}, inject: []};")],
    ["browser development tool", lazy("@dsmm/dsmm", "const name = 'react-grab'; return {apply(){}, inject: []};")]
  ];
  for (const [label, source] of cases) {
    const fixtureRoot = createReleaseFixture();
    try {
      writeFixtureFile(fixtureRoot, "lib/client.js", source);
      const { receipt, status } = runReleaseChecker(fixtureRoot);
      assert.equal(status, 1, label);
      assert.ok(receipt.errors.some((error) => error.startsWith("native client bundle must ")), label);
    } finally { removeReleaseFixture(fixtureRoot); }
  }
});

test("release readiness checker rejects absent or foreign mode and module remote descriptors", () => {
  const installed = readFileSync(join(packageRoot, "lib", "client.js"), "utf8");
  for (const [marker, replacement] of [
    ['descriptor("selectMode",', 'descriptor("describeSession",'],
    ['descriptor("selectMode",', 'descriptor("foreignMode",'],
    ['configDescriptor("describeModules")', 'configDescriptor("describe")'],
    ['configDescriptor("describeModules")', 'configDescriptor("foreignModules")']
  ]) {
    assert.ok(installed.includes(marker), "compiled descriptor exists");
    const fixtureRoot = createReleaseFixture();
    try {
      writeFixtureFile(fixtureRoot, "lib/client.js", installed.replace(marker, replacement));
      const { receipt, status } = runReleaseChecker(fixtureRoot);
      assert.equal(status, 1);
      assert.ok(receipt.errors.includes("native client bundle must lazily register @dsmm/dsmm with apply and inject exports"));
    } finally { removeReleaseFixture(fixtureRoot); }
  }
});

test("release readiness checker rejects embedded runtime profile deployment definitions", () => {
  const fixtureRoot = createReleaseFixture();
  try {
    writeFileSync(join(fixtureRoot, "cordis.patch.yml"), `${readFileSync(join(fixtureRoot, "cordis.patch.yml"), "utf8")}\n  profiles:\n    embedded: {}\n`);
    const { receipt, status } = runReleaseChecker(fixtureRoot);
    assert.equal(status, 1);
    assert.ok(receipt.errors.includes("cordis.patch.yml must not embed runtime profile definitions or selection"));
  } finally { removeReleaseFixture(fixtureRoot); }
});

test("release readiness checker fails closed when a fixture omits LICENSE", () => {
  const fixtureRoot = createReleaseFixture();
  const tgzBefore = listTgzPaths(fixtureRoot);
  try {
    rmSync(join(fixtureRoot, "LICENSE"));
    const { receipt, status } = runReleaseChecker(fixtureRoot);

    assertReceiptKeys(receipt);
    assert.equal(status, 1);
    assert.equal(receipt.outcome, "failed");
    assert.deepEqual(receipt.errors, [licenseMismatchError]);
    assert.deepEqual(listTgzPaths(fixtureRoot), tgzBefore);
  } finally {
    removeReleaseFixture(fixtureRoot);
  }
});

test("release readiness checker fails closed when a fixture LICENSE differs at the same length", () => {
  const fixtureRoot = createReleaseFixture();
  const tgzBefore = listTgzPaths(fixtureRoot);
  try {
    const licensePath = join(fixtureRoot, "LICENSE");
    const divergent = Buffer.from(readFileSync(licensePath));
    divergent[0] ^= 1;
    writeFileSync(licensePath, divergent);
    const { receipt, status } = runReleaseChecker(fixtureRoot);

    assertReceiptKeys(receipt);
    assert.equal(status, 1);
    assert.equal(receipt.outcome, "failed");
    assert.deepEqual(receipt.errors, [licenseMismatchError]);
    assert.deepEqual(listTgzPaths(fixtureRoot), tgzBefore);
  } finally {
    removeReleaseFixture(fixtureRoot);
  }
});

test("release readiness checker fails closed when dsh bundle metadata is wrong", () => {
  const fixtureRoot = createReleaseFixture();
  const tgzBefore = listTgzPaths(fixtureRoot);
  try {
    updateFixtureManifest(fixtureRoot, (manifest) => {
      (manifest.dsh as { bundle: { patch: string } }).bundle.patch = "./wrong.patch.yml";
    });
    const { receipt, status } = runReleaseChecker(fixtureRoot);

    assertReceiptKeys(receipt);
    assert.equal(status, 1);
    assert.equal(receipt.outcome, "failed");
    assert.deepEqual(receipt.errors, ["manifest.dsh must equal the native web client and bundle policy"]);
    assert.deepEqual(listTgzPaths(fixtureRoot), tgzBefore);
  } finally {
    removeReleaseFixture(fixtureRoot);
  }
});

test("release readiness checker rejects broad files manifests before npm pack", () => {
  const fixtureRoot = createReleaseFixture();
  try {
    updateFixtureManifest(fixtureRoot, (manifest) => {
      manifest.files = ["**/*"];
    });
    const tgzBefore = listTgzPaths(fixtureRoot);
    const { receipt, status } = runReleaseChecker(fixtureRoot);

    assertReceiptKeys(receipt);
    assert.equal(status, 1);
    assert.equal(receipt.name, null);
    assert.equal(receipt.version, null);
    assert.equal(receipt.fileCount, 0);
    assert.equal(receipt.packedSize, 0);
    assert.equal(receipt.unpackedSize, 0);
    assert.equal(receipt.requiredSurfaceCount, 0);
    assert.equal(receipt.forbiddenSurfaceCount, 0);
    assert.equal(receipt.outcome, "failed");
    assert.deepEqual(receipt.errors, ["manifest.files must exactly equal the release files policy"]);
    assert.deepEqual(listTgzPaths(fixtureRoot), tgzBefore);
  } finally {
    removeReleaseFixture(fixtureRoot);
  }
});

test("release readiness checker rejects an extra lifecycle fixture before npm pack", () => {
  const fixtureRoot = createReleaseFixture();
  const markerPath = join(fixtureRoot, ".release-readiness-lifecycle-marker");
  const tgzBefore = listTgzPaths(fixtureRoot);
  try {
    updateFixtureManifest(fixtureRoot, (manifest) => {
      (manifest.scripts as Record<string, string>).prepack = "node -e \"require('node:fs').writeFileSync('.release-readiness-lifecycle-marker', 'ran')\"";
    });
    const { receipt, status } = runReleaseChecker(fixtureRoot);

    assertReceiptKeys(receipt);
    assert.equal(existsSync(markerPath), false, "extra lifecycle scripts cannot run before manifest validation");
    assert.equal(status, 1);
    assert.equal(receipt.name, null);
    assert.equal(receipt.version, null);
    assert.equal(receipt.fileCount, 0);
    assert.equal(receipt.packedSize, 0);
    assert.equal(receipt.unpackedSize, 0);
    assert.equal(receipt.requiredSurfaceCount, 0);
    assert.equal(receipt.forbiddenSurfaceCount, 0);
    assert.equal(receipt.outcome, "failed");
    assert.deepEqual(receipt.errors, ["manifest.scripts must exactly equal the release script policy"]);
    assert.deepEqual(listTgzPaths(fixtureRoot), tgzBefore);

    const checkerSource = readFileSync(checkerPath, "utf8");
    assert.match(checkerSource, /npm\.cmd pack %DSMM_RELEASE_PACKAGE_ROOT% --dry-run --json --ignore-scripts/u);
    assert.match(checkerSource, /\["pack", packageRoot, "--dry-run", "--json", "--ignore-scripts"\]/u);
  } finally {
    removeReleaseFixture(fixtureRoot);
  }
});

test("release readiness checker rejects removed or changed build scripts before npm pack", () => {
  const cases: Array<[string, (scripts: Record<string, string>) => void]> = [
    ["removed build", (scripts) => { delete scripts.build; }],
    ["changed build", (scripts) => { scripts.build = "tsc -p unexpected.json"; }]
  ];

  for (const [name, updateScripts] of cases) {
    const fixtureRoot = createReleaseFixture();
    const tgzBefore = listTgzPaths(fixtureRoot);
    try {
      updateFixtureManifest(fixtureRoot, (manifest) => {
        updateScripts(manifest.scripts as Record<string, string>);
      });
      const { receipt, status } = runReleaseChecker(fixtureRoot);

      assertReceiptKeys(receipt);
      assert.equal(status, 1, name);
      assert.equal(receipt.name, null, name);
      assert.equal(receipt.version, null, name);
      assert.equal(receipt.fileCount, 0, name);
      assert.equal(receipt.packedSize, 0, name);
      assert.equal(receipt.unpackedSize, 0, name);
      assert.equal(receipt.requiredSurfaceCount, 0, name);
      assert.equal(receipt.forbiddenSurfaceCount, 0, name);
      assert.equal(receipt.outcome, "failed", name);
      assert.deepEqual(receipt.errors, ["manifest.scripts must exactly equal the release script policy"], name);
      assert.deepEqual(listTgzPaths(fixtureRoot), tgzBefore, name);
    } finally {
      removeReleaseFixture(fixtureRoot);
    }
  }
});

test("release readiness checker rejects invalid manifests before lifecycle scripts run", () => {
  const fixtureRoot = createReleaseFixture();
  const markerPath = join(fixtureRoot, ".release-readiness-lifecycle-marker");
  try {
    updateFixtureManifest(fixtureRoot, (manifest) => {
      (manifest.scripts as Record<string, string>).prepack = "node -e \"require('node:fs').writeFileSync('.release-readiness-lifecycle-marker', 'ran')\"";
      manifest.author = "not-Hugefiver";
    });
    const { receipt, status } = runReleaseChecker(fixtureRoot);

    assertReceiptKeys(receipt);
    assert.equal(existsSync(markerPath), false, "invalid manifests cannot run lifecycle scripts");
    assert.equal(status, 1);
    assert.equal(receipt.name, null);
    assert.equal(receipt.version, null);
    assert.equal(receipt.fileCount, 0);
    assert.equal(receipt.packedSize, 0);
    assert.equal(receipt.unpackedSize, 0);
    assert.equal(receipt.requiredSurfaceCount, 0);
    assert.equal(receipt.forbiddenSurfaceCount, 0);
    assert.equal(receipt.outcome, "failed");
    assert.deepEqual(receipt.errors, [
      "manifest.author must equal Hugefiver",
      "manifest.scripts must exactly equal the release script policy"
    ]);
    const checkerSource = readFileSync(checkerPath, "utf8");
    assert.match(checkerSource, /npm\.cmd pack %DSMM_RELEASE_PACKAGE_ROOT% --dry-run --json --ignore-scripts/u);
    assert.match(checkerSource, /\["pack", packageRoot, "--dry-run", "--json", "--ignore-scripts"\]/u);
  } finally {
    removeReleaseFixture(fixtureRoot);
  }
});

test("release readiness checker rejects nested case-insensitive source and test segments", () => {
  const fixtureRoot = createReleaseFixture();
  const forbiddenPaths = ["skills/nested/src/leak.md", "prompts/TEST/leak.md", "patches/nested/TeStS/leak.md"];
  try {
    for (const path of forbiddenPaths) {
      writeFixtureFile(fixtureRoot, path, "fixture\n");
    }
    const tgzBefore = listTgzPaths(fixtureRoot);
    const { receipt, status } = runReleaseChecker(fixtureRoot);

    assertReceiptKeys(receipt);
    assert.equal(status, 1);
    assert.equal(receipt.outcome, "failed");
    assert.equal(receipt.forbiddenSurfaceCount, forbiddenPaths.length);
    for (const path of forbiddenPaths) {
      assert.ok(receipt.errors.includes(`forbidden package surface: ${path}`), path);
    }
    assert.deepEqual(listTgzPaths(fixtureRoot), tgzBefore);
  } finally {
    removeReleaseFixture(fixtureRoot);
  }
});

test("release readiness checker rejects unknown, repeated, and valueless arguments", () => {
  for (const args of [["--unknown"], ["--package-root", packageRoot, "--package-root", packageRoot], ["--package-root"]]) {
    const { receipt, status } = runReleaseCheckerArguments(args);

    assertReceiptKeys(receipt);
    assert.equal(status, 1);
    assert.equal(receipt.name, null);
    assert.equal(receipt.version, null);
    assert.equal(receipt.fileCount, 0);
    assert.equal(receipt.packedSize, 0);
    assert.equal(receipt.unpackedSize, 0);
    assert.equal(receipt.requiredSurfaceCount, 0);
    assert.equal(receipt.forbiddenSurfaceCount, 0);
    assert.equal(receipt.outcome, "failed");
    assert.deepEqual(receipt.errors, ["invalid command-line arguments"]);
  }
});
