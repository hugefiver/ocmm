import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const compatibilityPath = join(packageRoot, "docs", "compatibility.md");
const migrationPath = join(packageRoot, "docs", "migration-from-ocmm.md");
const releasePath = join(packageRoot, "docs", "releasing.md");
const readmePath = join(packageRoot, "README.md");
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
  "lib/index.js", "lib/index.d.ts", "lib/preset-skills.js", "lib/preset-skills.d.ts",
  "docs/agent-presets.md", "docs/compatibility.md", "docs/design.md", "docs/lsp.md",
  "docs/migration-from-ocmm.md", "docs/model-routing.md", "docs/releasing.md",
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

function compiledOutputPaths(root: string): string[] {
  return readdirSync(join(root, "src"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .sort((left, right) => compareBytewise(left.name, right.name))
    .flatMap((entry) => {
      const base = entry.name.slice(0, -3);
      return [`lib/${base}.js`, `lib/${base}.d.ts`];
    });
}

function requiredTreeFiles(root: string, tree: string, current = join(root, tree)): string[] {
  const paths: string[] = [];
  const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) => compareBytewise(left.name, right.name));
  for (const entry of entries) {
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
  const fixtureRoot = mkdtempSync(join(tmpdir(), releaseFixturePrefix));
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

const expectedCompatibility = [
  ["Node.js", ">=22"],
  ["DSH", "0.2.0-rc.2"],
  ["Cordis", "~4.0.4"],
  ["DSH component peers", "0.2.0-rc.2"],
  ["Linux container", "Node 22 Bookworm"],
  ["Windows", "Node >=22"],
  ["macOS", "Node >=22"],
  ["Web", "host command/status"],
  ["Headless", "profile config and --dump-config"],
  ["TUI", "DSH 0.2.0-rc.2"],
  ["LSP/MCP", "external ocmm-lsp mcp"],
  ["Runtime recovery", "process-local"],
  ["DeepSeek V4 Pro calibration", "deepseek-official/deepseek-v4-pro"],
  ["DeepSeek V41 Flash calibration", "native DeepSeek providers/deepseek-flash"]
];

const expectedMigrationStates = new Map([
  ["Deepwork gates", "equivalent core intent"],
  ["Seven workflow skills", "equivalent core intent"],
  ["Twelve role presets", "redesigned for DSH"],
  ["Model routing and DeepSeek calibration", "redesigned for DSH"],
  ["Safety guards", "redesigned for DSH"],
  ["LSP/MCP", "optional/manual"],
  ["Runtime fallback", "redesigned for DSH"],
  ["Idle continuation", "redesigned for DSH"],
  ["Subagent interruption recovery", "redesigned for DSH"],
  ["Settings/status", "redesigned for DSH"],
  ["Prompt/cache hooks", "unavailable"],
  ["OpenCode commands/hooks", "unavailable"],
  ["Model categories and Oracle tiers", "optional/manual"],
  ["Codex marketplace", "unavailable"],
  ["Release surfaces", "redesigned for DSH"]
]);

const migrationStates = ["equivalent core intent", "redesigned for DSH", "optional/manual", "unavailable"];

const expectedMigrationRolePresets = [
  "dsmm-orchestrator",
  "dsmm-planner",
  "dsmm-plan-critic",
  "dsmm-reviewer",
  "dsmm-code-search",
  "dsmm-doc-search",
  "dsmm-clarifier",
  "dsmm-media-reader",
  "dsmm-builder",
  "dsmm-oracle",
  "dsmm-oracle-2nd",
  "dsmm-creative"
];

function normalizeCell(cell: string): string {
  const trimmed = cell.trim();
  return trimmed.startsWith("`") && trimmed.endsWith("`") ? trimmed.slice(1, -1).trim() : trimmed;
}

function parseMarkdownTable(markdown: string, marker: string, label: string): string[][] {
  const markerStart = markdown.indexOf(marker);
  assert.notEqual(markerStart, -1, `${label} heading exists`);

  const sectionLines = markdown.slice(markerStart + marker.length).split(/\r?\n/u);
  const tableStart = sectionLines.findIndex((line) => /^\s*\|.*\|\s*$/u.test(line));
  assert.notEqual(tableStart, -1, `${label} contains a Markdown table`);

  const tableLines: string[] = [];
  for (const line of sectionLines.slice(tableStart)) {
    if (!/^\s*\|.*\|\s*$/u.test(line)) break;
    tableLines.push(line);
  }
  assert.ok(tableLines.length >= 2, `${label} has a header and separator`);
  assert.match(tableLines[1], /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/u, `${label} has a Markdown separator`);

  return tableLines.slice(2).map((line) => line.slice(line.indexOf("|") + 1, line.lastIndexOf("|")).split("|").map(normalizeCell));
}

function parseOrderedList(markdown: string, marker: string, label: string): string[] {
  const markerStart = markdown.indexOf(marker);
  assert.notEqual(markerStart, -1, `${label} heading exists`);

  const sectionLines = markdown.slice(markerStart + marker.length).split(/\r?\n/u);
  const listStart = sectionLines.findIndex((line) => /^\s*\d+\.\s+\S/u.test(line));
  assert.notEqual(listStart, -1, `${label} contains an ordered list`);

  const items: string[] = [];
  for (const line of sectionLines.slice(listStart)) {
    const match = /^\s*(\d+)\.\s+(.+?)\s*$/u.exec(line);
    if (match === null) break;
    assert.equal(Number(match[1]), items.length + 1, `${label} numbering is consecutive`);
    items.push(match[2]);
  }
  return items;
}

function roadmapSection(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  assert.notEqual(start, -1, `${heading} heading exists`);

  const afterHeading = markdown.slice(start + heading.length);
  const nextHeading = afterHeading.search(/^## /mu);
  return nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading);
}

test("compatibility matrix has the fixed rc.2 release contract", () => {
  const compatibility = readFileSync(compatibilityPath, "utf8");
  const rows = parseMarkdownTable(compatibility, "## Compatibility matrix", "compatibility matrix");

  assert.deepEqual(rows.map(([surface, boundary]) => [surface, boundary]), expectedCompatibility);
  assert.equal(rows.length, 14);
  assert.ok(rows.every((row) => row.length === 3 && row[2] !== ""), "each surface states an evidence level");
  assert.equal(rows.find(([surface]) => surface === "DSH")?.[2], "verified");
  assert.equal(rows.find(([surface]) => surface === "TUI")?.[2], "unavailable");
  assert.equal(rows.find(([surface]) => surface === "macOS")?.[2], "supported by contract");
  assert.deepEqual(
    [...new Set(rows.map((row) => row[2]))].sort(),
    ["optional", "supported by contract", "unavailable", "verified"]
  );
});

test("compatibility authority is pinned to the reviewed rc.2 release", () => {
  const compatibility = readFileSync(compatibilityPath, "utf8");

  assert.deepEqual(
    [...compatibility.matchAll(/^(?:#|##) .+$/gmu)].map((match) => match[0]),
    [
      "# DSMM v1.0 Compatibility",
      "## Compatibility authority",
      "## Compatibility matrix",
      "## Command and runtime boundaries",
      "## Evidence limits"
    ]
  );
  assert.ok(compatibility.includes("@deepseek-ai/dsh@0.2.0-rc.2"));
  assert.ok(compatibility.includes("0.2.1-alpha.1"));
  assert.ok(compatibility.includes("Installation ranges are not proof of compatibility with future releases."));

  for (const peerPackage of [
    "@deepseek-ai/dsh-attachment",
    "@deepseek-ai/dsh-brand",
    "@deepseek-ai/dsh-invariants",
    "@deepseek-ai/dsh-llm",
    "@deepseek-ai/dsh-timeout"
  ]) {
    assert.ok(compatibility.includes(peerPackage), `${peerPackage} is named as a peer installation contract`);
  }
});

test("compatibility document fixes command, headless, platform, and provider boundaries", () => {
  const compatibility = readFileSync(compatibilityPath, "utf8");

  assert.ok(compatibility.includes("`/deepwork` and `/dsmm-status` are host-adapter commands, not headless task-text commands."));
  assert.ok(compatibility.includes("Web exposes host command/status but has no custom panel."));
  assert.ok(compatibility.includes("Headless uses profile `cordis.patch.yml` plus `--dump-config`; real task execution requires a separately configured provider and uses `dsmm.defaultActive: true`."));
  assert.ok(compatibility.includes("Old `$DSH_HOME/settings.yaml` namespaces must be migrated explicitly; DSMM does not mutate that file."));
  assert.ok(compatibility.includes("Windows, Linux, Web, and macOS evidence are not interchangeable."));
  assert.ok(compatibility.includes("LSP/MCP and runtime recovery are disabled by default."));
  assert.ok(compatibility.includes("V4 Pro calibration remains limited to the exact `deepseek-official/deepseek-v4-pro` route."));
  assert.ok(compatibility.includes("`deepseek-official/deepseek-flash` and `deepseek-account/deepseek-flash`"));
});

test("migration guide fixes the non-parity feature and cutover contracts", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const opening = "DSMM is a DSH-native Cordis bundle, not an OpenCode compatibility layer; .opencode/ocmm.jsonc cannot be copied into DSH.";

  assert.ok(migration.startsWith(`# Migrating from ocmm to DSMM v1.0\n\n${opening}`));
  assert.deepEqual(
    [...migration.matchAll(/^(?:#|##) .+$/gmu)].map((match) => match[0]),
    [
      "# Migrating from ocmm to DSMM v1.0",
      "## Hard boundary",
      "## Feature mapping",
      "## Migration sequence",
      "## Coexistence and cutover"
    ]
  );
  assert.ok(migration.includes("updated, unpublished working tree targeting DSH 0.2.0-rc.2"));

  const rows = parseMarkdownTable(migration, "## Feature mapping", "feature mapping");
  assert.equal(rows.length, 15);
  assert.ok(rows.every((row) => row.length === 3 && row[1] !== ""), "feature mapping rows have three populated cells");
  assert.deepEqual(rows.map((row) => [row[0], row[2]]), [...expectedMigrationStates]);
  assert.equal(new Set(rows.map((row) => row[0])).size, expectedMigrationStates.size, "feature mapping areas are unique");
  assert.deepEqual([...new Set(rows.map((row) => row[2]))].sort(), [...migrationStates].sort());

  for (const skill of [
    "brainstorming",
    "writing-plans",
    "subagent-driven-development",
    "requesting-code-review",
    "receiving-code-review",
    "dispatching-parallel-agents",
    "remove-ai-slops"
  ]) {
    assert.ok(migration.includes(`\`${skill}\``), `${skill} is named in the migration guide`);
  }
  const roleSetMatch = /^The role set includes (?<roles>.+?)\. File existence is not callable evidence/mu.exec(migration);
  if (roleSetMatch === null) {
    assert.fail("migration guide has a role-set statement");
  }
  const roleSet = roleSetMatch.groups?.roles;
  if (roleSet === undefined) {
    assert.fail("migration guide role-set statement captures its roles");
  }
  const documentedRolePresets = [...roleSet.matchAll(/`([^`]+)`/gu)].map((match) => match[1]);
  assert.deepEqual(documentedRolePresets, expectedMigrationRolePresets);
  assert.ok(migration.includes("Reviewer is primary-lane self-review; Oracle is an external-model cross-check only when the actual user-selected route differs."));
  assert.ok(migration.includes("Native durable child/session control and explicit continuation; no guessed task IDs"));
  assert.ok(migration.includes("Headless configuration uses profile files and `--dump-config`; command-capable hosts execute `/deepwork` and `/dsmm-status` through the command adapter"));

  const sequence = parseOrderedList(migration, "## Migration sequence", "migration sequence");
  assert.equal(sequence.length, 8);
  assert.match(sequence[0], /isolated `DSH_HOME`.*profile/iu);
  assert.match(sequence[1], /packed reviewed DSMM artifact/iu);
  assert.match(sequence[2], /provider\/model.*credentials/iu);
  assert.match(sequence[3], /`id: dsmm`.*restart.*settings\.yaml/iu);
  assert.match(sequence[4], /`workflow\.policy: risk-based`/u);
  assert.match(sequence[5], /native roles.*role-specific tools/iu);
  assert.match(sequence[6], /optional LSP\/MCP/iu);
  assert.match(sequence[7], /real specified model.*read\/write\/tool-result/iu);
});

test("release guide fixes the preflight, publication, verification, and rollback contract", () => {
  const release = readFileSync(releasePath, "utf8");

  assert.deepEqual(
    [...release.matchAll(/^(?:#|##) .+$/gmu)].map((match) => match[0]),
    [
      "# DSMM 0.1.0 Release and Rollback",
      "## Preflight",
      "## Authorized publication",
      "## Post-publication verification",
      "## Rollback"
    ]
  );

  for (const phrase of [
    "dsmm-v0.1.0",
    "explicit authorization",
    "npm Trusted Publishing",
    "no DSMM lane",
    "never overwrite an npm version",
    "never move, delete, or recreate an immutable tag",
    "a successful local checker or Docker smoke is not proof of publication",
    "dsh plugin --profile <name> remove dsmm",
    "add an exact known-good version",
    "restart the profile process"
  ]) {
    assert.ok(release.includes(phrase), `release guide includes ${phrase}`);
  }

  const preflight = release.slice(release.indexOf("## Preflight"), release.indexOf("## Authorized publication"));
  for (const command of [
    "git rev-parse HEAD",
    "git status --short",
    'npm view dsmm name version --registry "https://registry.npmjs.org/"',
    "pnpm --filter dsmm build",
    'pnpm --dir ".\\dsmm" exec tsc -p ".\\tsconfig.test.json" --noEmit',
    "pnpm --filter dsmm check:release",
    'npm pack ".\\dsmm" --dry-run --json',
    "pnpm --filter dsmm smoke:docker",
    "pnpm run typecheck",
    "pnpm test",
    "pnpm run build"
  ]) {
    assert.ok(preflight.includes(command), `preflight includes ${command}`);
  }
  assert.match(preflight, /exact checkout.*status/i);
  assert.match(preflight, /npm-name ownership.*recheck/i);
  assert.match(preflight, /registry lookup.*current evidence.*cannot reserve name/is);
  assert.match(preflight, /DSH 0\.2\.0-rc\.2/u);
  assert.match(preflight, /license parity/i);
  assert.match(preflight, /DSMM test.*build.*checker.*pack.*Docker/is);
  assert.match(preflight, /root.*typecheck.*test.*build/is);
  assert.match(preflight, /artifact review/i);

  const postPublication = release.slice(release.indexOf("## Post-publication verification"), release.indexOf("## Rollback"));
  for (const phrase of [
    "fresh isolated `DSH_HOME`",
    "registry install",
    "plugin list",
    "--dump-config",
    "new profile process",
    "available host adapter status",
    "package integrity"
  ]) {
    assert.ok(postPublication.includes(phrase), `post-publication verification includes ${phrase}`);
  }
});

test("README fixes the pending publication and stable packed-runtime boundaries", () => {
  const readme = readFileSync(readmePath, "utf8");
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

  assert.match(readme, /^## Install and configure$/mu);
  assert.match(readme, /^## Verification$/mu);
  for (const phrase of [
    "@deepseek-ai/dsh@0.2.0-rc.2",
    "local readiness checks alone do not represent a published release",
    "dsh plugin --profile <profile> add <absolute-path-to-dsmm-0.1.0.tgz>",
    "dsh --profile <profile> --dump-config",
    "Headless task text is not a slash-command adapter",
    "pnpm --filter dsmm smoke:docker",
    "real read/write/model round-trip",
    "separately authorized publication"
  ]) {
    assert.ok(readme.includes(phrase), `README includes ${phrase}`);
  }
  assert.ok(readme.includes("(docs/compatibility.md)"));
  assert.ok(readme.includes("(docs/migration-from-ocmm.md)"));
  assert.ok(readme.includes("(docs/releasing.md)"));
  assert.match(profile, /^dsmm-v1-smoke$/u);
});

test("v1.0 roadmap distinguishes the initial 0.1.0 release from future stability", () => {
  const roadmap = readFileSync(join(packageRoot, "docs", "roadmap.md"), "utf8");
  const v1Section = roadmapSection(roadmap, "## v1.0 — Stable dsmm release");
  const status = "Status: initial package release selected as dsmm 0.1.0; the v1.0 stable milestone remains future work.";

  assert.equal(v1Section.split(status).length - 1, 1, "v1.0 roadmap contains the exact release-ready status once");
  assert.doesNotMatch(v1Section, /\b(?:released|published|available on npm|(?:tag|tagged)\s+(?:has\s+been\s+)?created|created\s+(?:a\s+)?tag)\b/iu);
});

test("release readiness checker accepts the real 0.1.0 package without creating a tarball", () => {
  const tgzBefore = listTgzPaths(packageRoot);
  const expectedCount = expectedRequiredSurfaceCount(packageRoot);
  const { receipt, status } = runReleaseChecker(packageRoot);

  assertReceiptKeys(receipt);
  assert.equal(status, 0);
  assert.equal(receipt.name, "dsmm");
  assert.equal(receipt.version, "0.1.0");
  assert.ok(receipt.fileCount > 0);
  assert.ok(receipt.packedSize > 0);
  assert.ok(receipt.unpackedSize > 0);
  assert.equal(receipt.requiredSurfaceCount, expectedCount);
  assert.equal(receipt.forbiddenSurfaceCount, 0);
  assert.equal(receipt.outcome, "ready");
  assert.deepEqual(receipt.errors, []);
  assert.deepEqual(listTgzPaths(packageRoot), tgzBefore);
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
    assert.deepEqual(receipt.errors, ["manifest.dsh.bundle.patch must equal ./cordis.patch.yml"]);
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
