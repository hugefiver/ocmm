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
  ["Windows Desktop", "installed official `0.2.0-rc.2` carrier/host"],
  ["macOS", "Node >=22"],
  ["Native Settings", "additive Deepwork Profiles client and authenticated RPC"],
  ["Headless", "deployment config and native role tools"],
  ["TUI", "DSH 0.2.0-rc.2"],
  ["LSP/MCP", "external ocmm-lsp mcp"],
  ["Runtime recovery", "process-local"],
  ["Per-role model/effort/fallback policy", "native request, subagent and descriptor seams"],
  ["Runtime profiles", "independent drafts, immutable revisions, global pointer and scoped CAS sidecars"],
  ["Durable DSMM metadata", "deployment-only `sessionPersistence` on main DSMM entry"],
  ["DeepSeek V4 Pro calibration", "deepseek-official/deepseek-v4-pro"],
  ["DeepSeek V41 Flash calibration", "native DeepSeek providers/deepseek-flash"]
];

const expectedMigrationStates = new Map([
  ["Deepwork gates", "equivalent core intent"],
  ["Seven workflow skills", "equivalent core intent"],
  ["Twelve role presets", "redesigned for DSH"],
  ["Per-role model/effort and DeepSeek calibration", "redesigned for DSH"],
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
  assert.equal(rows.length, 17);
  assert.ok(rows.every((row) => row.length === 3 && row[2] !== ""), "each surface states an evidence level");
  assert.match(rows.find(([surface]) => surface === "DSH")?.[2] ?? "", /pinned authority.*acceptance required/u);
  assert.equal(rows.find(([surface]) => surface === "TUI")?.[2], "existing official 0.1.6 CLI/TUI installation verified; new 0.1.9 menu proof is Web/Desktop only");
  assert.equal(rows.find(([surface]) => surface === "macOS")?.[2], "supported by contract");
  assert.match(rows.find(([surface]) => surface === "Native Settings")?.[2] ?? "", /actual Desktop.*separate proofs/u);
  assert.match(rows.find(([surface]) => surface === "Runtime profiles")?.[2] ?? "", /global new-Agent.*idle session epochs.*cold sidecar retention/u);
  assert.match(rows.find(([surface]) => surface === "Durable DSMM metadata")?.[2] ?? "", /explicit startup integration.*acceptance pending/u);
});

test("compatibility authority is pinned to the reviewed rc.2 release", () => {
  const compatibility = readFileSync(compatibilityPath, "utf8");

  assert.match(compatibility, /^# Deepwork 0\.1\.9 Compatibility/mu);
  for (const heading of ["Compatibility authority", "Compatibility matrix", "Command and runtime boundaries", "Evidence limits"]) {
    assert.match(compatibility, new RegExp(`^## ${heading}$`, "mu"));
  }
  assert.ok(compatibility.includes("@deepseek-ai/dsh@0.2.0-rc.2"));
  assert.ok(compatibility.includes("0.2.1-alpha.1"));
  assert.ok(compatibility.includes("Installation ranges are not proof of compatibility with future releases."));

  for (const peerPackage of [
    "@deepseek-ai/dsh-subagent"
  ]) {
    assert.ok(compatibility.includes(peerPackage), `${peerPackage} is named as a peer installation contract`);
  }
});

test("compatibility document fixes command, headless, platform, and provider boundaries", () => {
  const compatibility = readFileSync(compatibilityPath, "utf8");

  assert.ok(compatibility.includes("`/deepwork` and `/dsmm-status` are host-adapter commands, not headless task-text commands."));
  assert.match(compatibility, /native client provides Settings → Deepwork Profiles/u);
  assert.match(compatibility, /no model-visible profile-management tools or anonymous file endpoints/u);
  assert.ok(compatibility.includes("Headless uses profile `cordis.patch.yml` plus `--dump-config`; real task execution requires a separately configured provider and uses `dsmm.defaultActive: true`."));
  assert.ok(compatibility.includes("Old `$DSH_HOME/settings.yaml` namespaces must be migrated explicitly; DSMM does not mutate that file."));
  assert.ok(compatibility.includes("Windows, Linux, Web, and macOS evidence are not interchangeable."));
  assert.ok(compatibility.includes("LSP/MCP and runtime recovery are disabled by default."));
  assert.ok(compatibility.includes("V4 Pro calibration remains limited to the exact `deepseek-official/deepseek-v4-pro` route."));
  assert.ok(compatibility.includes("`deepseek-official/deepseek-flash` and `deepseek-account/deepseek-flash`"));
  assert.match(compatibility, /including a blank Agent.*retains.*admitted settings.*global default/u);
  assert.match(compatibility, /Sidecar cold resume retains the exact pinned revision\/baseline/u);
  assert.match(compatibility, /Sessions without a sidecar keep the old global-current behavior/u);
  assert.match(compatibility, /auxiliary roles can fail native cold resume/u);
  assert.match(compatibility, /third phase/u);
});

test("migration guide fixes the non-parity feature and cutover contracts", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const opening = "DSMM is a DSH-native Cordis bundle, not an OpenCode compatibility layer; .opencode/ocmm.jsonc cannot be copied into DSH.";

  assert.ok(migration.startsWith(`# Migrating from ocmm to DSMM 0.1.1\n\n${opening}`));
  assert.deepEqual(
    [...migration.matchAll(/^(?:#|##) .+$/gmu)].map((match) => match[0]),
    [
      "# Migrating from ocmm to DSMM 0.1.1",
      "## Hard boundary",
      "## Feature mapping",
      "## Migration sequence",
      "## Coexistence and cutover",
      "## Successor 0.1.5 migration note"
    ]
  );
  assert.ok(migration.includes("0.1.1 routing surface targeting DSH 0.2.0-rc.2"));
  assert.match(migration, /mapping above is the historical 0\.1\.1 contract/u);
  assert.match(migration, /explicit idle current-session apply commits only that root's sidecar and admission epoch/u);
  assert.match(migration, /omitted strategy now means `startup-lock`/u);
  assert.match(migration, /native user's explicit provider\/model\/exact effort remains authoritative/u);

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

  assert.match(release, /^# Deepwork 0\.1\.9 Release and Rollback$/mu);
  const phases = ["## Phase 1: frozen artifact and independent Docker gate", "## Phase 2: authorized immutable publication", "## Phase 3: official installed-carrier Desktop rollout"];
  const phaseOffsets = phases.map((phase) => release.indexOf(phase));
  assert.ok(phaseOffsets.every((offset) => offset >= 0));
  assert.ok(phaseOffsets[0] < phaseOffsets[1] && phaseOffsets[1] < phaseOffsets[2], "Docker, publication and Desktop rollout are ordered gates");

  for (const phrase of [
    "dsmm-scoped-v0.1.9",
    "explicit authorization",
    "npm Trusted Publisher registration",
    ".github/workflows/dsmm-release.yml",
    "scripts/check-dsmm-release-completion.mjs",
    "never overwrite an npm version",
    "never move, delete, or recreate an immutable tag",
    "that exact tarball with native pnpm",
    "OIDC and genuine provenance enabled",
    "dist.integrity",
    "SHA256SUMS.txt",
    "fully quit"
  ]) {
    assert.ok(release.includes(phrase), `release guide includes ${phrase}`);
  }

  const preflight = release.slice(release.indexOf("## Preflight"), phaseOffsets[0]);
  for (const command of [
    "git rev-parse HEAD",
    "git status --short",
    "pnpm --dir dsmm build",
    "pnpm --dir dsmm typecheck:test",
    "pnpm --dir dsmm check:release",
    'npm pack ".\\dsmm" --dry-run --json',
    "pnpm --dir dsmm smoke:docker",
    "pnpm run typecheck",
    "pnpm test",
    "pnpm run build"
  ]) {
    assert.ok(preflight.includes(command), `preflight includes ${command}`);
  }
  assert.match(preflight, /exact source selected for review/i);
  assert.match(preflight, /Recheck scoped npm authority/i);
  assert.match(preflight, /registry lookup cannot reserve ownership/i);
  assert.match(preflight, /DSH 0\.2\.0-rc\.2/u);
  assert.match(preflight, /license parity/i);
  assert.match(preflight, /root.*typecheck.*test.*build/is);
  assert.match(preflight, /Inspect the preview for client\/profile assets/i);
  assert.match(preflight, /npm pack --dry-run --json.*metadata diagnostic/u);
  assert.match(preflight, /not release packaging/u);
  assert.match(preflight, /Use pnpm.*pack\/publish/u);
  assert.match(preflight, /readPluginMeta.*installed resources/u);

  const dockerGate = release.slice(phaseOffsets[0], phaseOffsets[1]);
  assert.match(dockerGate, /explicit artifact path and expected SHA256/u);
  assert.match(dockerGate, /fail closed.*missing\/mismatched/u);
  assert.match(dockerGate, /must not build, repack/u);
  assert.match(dockerGate, /packedSha256/u);
  assert.match(dockerGate, /same packaged compiled Deepwork Profiles UI.*native client\/slots/iu);
  assert.match(dockerGate, /immutable-revision\/pointer bytes/u);
  assert.match(dockerGate, /existing even-blank Agent retention/u);
  assert.match(dockerGate, /Do not mount or copy Desktop\/global configuration.*credentials/u);
  assert.match(dockerGate, /Node 24 \/ pnpm 11\.9\.0/u);
  assert.match(dockerGate, /one new actual tarball/u);
  assert.match(dockerGate, /Native metadata reader yields Deepwork from both packaged locales/u);
  const postPublication = release.slice(release.indexOf("### Publication identity verification"), phaseOffsets[2]);
  for (const phrase of [
    "fresh isolated `DSH_HOME`",
    "registry installation",
    "plugin --profile dsmm-0.1.9-verify list",
    "--dump-config",
    "installed registry package",
    "scripts/check-dsmm-release-completion.mjs",
    "bootstrapImport: null",
    "COMPLETED"
  ]) {
    assert.ok(postPublication.includes(phrase), `post-publication verification includes ${phrase}`);
  }
  const desktopGate = release.slice(phaseOffsets[2], release.indexOf("## Rollback"));
  assert.match(postPublication, /import-bootstrap.*skipped \/ NOT_APPLICABLE/u);
  assert.match(postPublication, /Workflow success alone is insufficient/u);
  assert.match(desktopGate, /Only after terminal 0\.1\.9 completion/u);
  assert.match(desktopGate, /may \*\*not\*\* boot\/dump the reserved Desktop profile/u);
  assert.match(desktopGate, /actual Deepwork Profiles UI create\/edit\/save\/apply\/reset/u);
  const rollback = release.slice(release.indexOf("## Rollback"));
  assert.match(rollback, /official carrier.*remove `@dsmm\/dsmm`/u);
  assert.match(rollback, /add an exact known immutable version/u);
  assert.match(rollback, /Keep runtime drafts\/revisions and unrelated settings/u);
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
    "0.1.9 publication and Desktop acceptance remain pending",
    "dsh plugin --profile <profile> add <absolute-path-to-dsmm-dsmm-0.1.9.tgz>",
    "dsh --profile <profile> --dump-config",
    "Headless task text is not a slash-command adapter",
    "pnpm --dir dsmm smoke:docker",
    "real read/write/model round-trip",
    "publishes through OIDC with genuine provenance"
  ]) {
    assert.ok(readme.includes(phrase), `README includes ${phrase}`);
  }
  assert.ok(readme.includes("(docs/compatibility.md)"));
  assert.ok(readme.includes("(docs/migration-from-ocmm.md)"));
  assert.ok(readme.includes("(docs/releasing.md)"));
  assert.match(profile, /^dsmm-v1-smoke$/u);
});

test("0.1.9 guides preserve completed release history and native root model authority", () => {
  const readme = readFileSync(readmePath, "utf8");
  const release = readFileSync(releasePath, "utf8");
  for (const document of [readme, release]) {
    assert.match(document, /completed 0\.1\.5 publication/u);
    assert.match(document, /completed 0\.1\.6 publication\/continuation/u);
    assert.match(document, /0\.1\.2.*untouched and unpublished/u);
    assert.match(document, /37235817488/u);
    assert.match(document, /0\.1\.4.*continuation/u);
    assert.doesNotMatch(document, /0\.1\.5 publication and Desktop acceptance remain pending/u);
    assert.doesNotMatch(document, /0\.1\.6 publication and Desktop acceptance remain pending/u);
    assert.doesNotMatch(document, /completed 0\.1\.9 publication/u);
    assert.ok(document.includes("Use profile model"));
    assert.doesNotMatch(document, /Switch and use profile model/u);
    assert.match(document, /normal.*switching keeps the current model/iu);
    assert.match(document, /native.*default.*Models tab/iu);
    assert.match(document, /newer native choice/u);
  }
  assert.match(readme, /Ordinary roots keep their native initial model and exact effort/u);
  assert.match(readme, /profile reapply and cold resume/u);
  assert.match(release, /Ordinary roots remain native-owned/u);
  assert.match(release, /before any explicit model-selection event/u);
  assert.match(release, /genuinely owned delegated children/u);
  assert.match(release, /fourteen UI checks and nine installed compiled-file checks remain unchanged/u);
  assert.match(release, /New proof requirements are version-gated/u);
  assert.match(release, /failed `installProfiles` child through its public parent-fiber ownership/u);
});

test("0.1.9 menu guidance preserves immutable 0.1.6 continuation and completed TUI scope", () => {
  const readme = readFileSync(readmePath, "utf8");
  const release = readFileSync(releasePath, "utf8");
  const compatibility = readFileSync(compatibilityPath, "utf8");
  for (const document of [readme, release, compatibility]) {
    assert.match(document, /one icon-only native profile menu/iu);
    assert.match(document, /sessionless, blank and active/u);
    assert.match(document, /successful profile CAS/u);
    assert.match(document, /allowlisted codes\/fields/u);
    assert.match(document, /refresh\/retry guidance/u);
    assert.match(document, /not unfinished rollout work/u);
  }
  assert.match(readme, /existing official CLI\/TUI `@dsmm\/dsmm@0\.1\.6` installation is already verified and enabled/u);
  assert.ok(readme.includes("dsh plugin --profile dsh-tui add @dsmm/dsmm@0.1.9 --save-exact"));
  assert.match(release, /historical 0\.1\.6 SELECT and 0\.1\.7 native-menu grammars remain unchanged/u);
  assert.match(release, /compact-menu\/mode proof is version-gated to reviewed 0\.1\.8 and 0\.1\.9 only, never applied retroactively/u);
  assert.match(release, /Later versions require their own explicitly reviewed proof contract and fail closed until reviewed/u);
  assert.match(release, /zero header SELECTs/u);
  assert.match(release, /Historical audit reference only/u);
  assert.match(release, /Do not dispatch it again/u);
  assert.match(release, /not permission for the new 0\.1\.9 rollout/u);
  for (const identity of [
    "dsmm-scoped-v0.1.6", "37281521750/1", "d2e499b3a61ef76033d417efbec3402a4739a8fe",
    "11332299033", "359262", "3fedc92c35a88f0a75fdfc6ac8ef9a37ef138d902e5698f90ac969f66f6f4eb9",
    "b7b36fc69e892fb22b06a2428d360181d33bd95526ee2bc403c04b6307ed6c35",
    ".github/workflows/dsmm-published-continuation-016.yml", "--origin-version 0.1.6"
  ]) assert.ok(release.includes(identity), `historical 0.1.6 identity remains ${identity}`);
  assert.match(compatibility, /Ordinary roots preserve their native initial and explicit provider\/model\/exact effort rather than profile-primary resolution/u);
});

test("0.1.9 documentation requires explicit durable mode and a single admitted-profile model action", () => {
  for (const path of [readmePath, releasePath, compatibilityPath, join(packageRoot, "docs", "profiles.md"), join(packageRoot, "docs", "settings-status.md"), join(packageRoot, "DESIGN.md")]) {
    const document = readFileSync(path, "utf8");
    assert.match(document, /Deepwork.*toggle/iu, path);
    assert.match(document, /official minimal[^.\n]*defaults? off|defaults? off[^.\n]*official minimal/iu, path);
    assert.match(document, /saved explicit `deepwork\/mode`/u, path);
    assert.match(document, /same-default.*(?:persist|intent)/iu, path);
    assert.match(document, /profile changes and reopen|profile changes and fresh-process reopen/iu, path);
    if (path === compatibilityPath || path === join(packageRoot, "docs", "settings-status.md")) {
      assert.match(document, /DW (?:presets|roles).*not locked|DW roles are no longer locked/iu, path);
      assert.match(document, /explicit off.*(?:retains|does not remove)/iu, path);
    } else {
      // Other historical release/UI documents are outside stage A ownership.
      assert.match(document, /standing DW presets.*locked enabled/iu, path);
    }
    assert.match(document, /one profile list/iu, path);
    assert.match(document, /`@use-model`/u, path);
    assert.match(document, /Use profile model/u, path);
    assert.match(document, /(?:admitted immutable profile|admitted profile model)/u, path);
    assert.match(document, /without reapplying|does not reapply/iu, path);
    assert.match(document, /(?:live announcements only|successes only|announces successful outcomes)/iu, path);
    assert.match(document, /(?:short sanitized|errors are short sanitized)/iu, path);
    assert.doesNotMatch(document, /Switch and use profile model|both selection groups|separately labelled opt-in group/u, path);
  }
});

test("0.1.7 npm and Desktop facts never replace failed terminal authority or authorize in-place repair", () => {
  for (const path of [readmePath, releasePath, compatibilityPath]) {
    const document = readFileSync(path, "utf8");
    assert.match(document, /0\.1\.7 is (?:already )?npm published/iu, path);
    assert.match(document, /Desktop.*installed|installed in Desktop/iu, path);
    assert.ok(document.includes("dsmm-scoped-v0.1.7"), path);
    assert.ok(document.includes("1ca0bf6e89916d17ddc663e1e06f6c15256cf453"), path);
    assert.ok(document.includes("37312038470/1"), path);
    assert.match(document, /failed verification|failed terminal verification/iu, path);
    assert.match(document, /GitHub (?:job )?was skipped|GitHub job was skipped/iu, path);
    assert.ok(document.includes("`UNRESOLVED`/`FAILED`"), path);
    assert.match(document, /not a completed GitHub Release/u, path);
    assert.match(document, /(?:Desktop.*waits|installation waits|upgrade waits)/iu, path);
  }
});

test("0.1.8 genuine publication preserves failed terminal history and does not become successor proof", () => {
  for (const path of [readmePath, releasePath, compatibilityPath]) {
    const document = readFileSync(path, "utf8");
    assert.match(document, /0\.1\.8 is genuinely npm published, but not a completed GitHub Release/u, path);
    for (const identity of ["dsmm-scoped-v0.1.8", "569eb8398cd6082d2c59679a0adc0198aeeb883e", "803117222bff06af977752a3a421f4975bc3a511a61e7914960219132e31e301", "37350981167/1", "2026-10-05T18:01:24.500Z", "17:52:09"]) {
      assert.ok(document.includes(identity), `${path} preserves ${identity}`);
    }
    assert.match(document, /terminal `FAILED`, with GitHub skipped/u, path);
    assert.match(document, /old shared 300-second visibility budget expired/u, path);
    assert.match(document, /no old-tag mutation, republishing, rerun, receipt adoption or in-place repair is authorized/u, path);
    assert.match(document, /Desktop remains on 0\.1\.7 and CLI\/TUI on 0\.1\.6, unchanged/u, path);
    assert.match(document, /same plugin behavior as 0\.1\.8/u, path);
    assert.match(document, /rollout still waits for its own terminal `COMPLETED`/u, path);
  }
});

test("0.1.9 verification visibility is bounded and never becomes publish retry authority", () => {
  const release = readFileSync(releasePath, "utf8");
  assert.match(release, /one shared 20-minute \(1,200-second \/ `1200000` ms\) visibility deadline/u);
  assert.match(release, /`verify` job bounded to 45 minutes/u);
  assert.match(release, /shared across all three read surfaces, never reset for each stage/u);
  assert.match(release, /Only HTTP 404 reads may wait/u);
  assert.match(release, /never retries publishing or weakens publisher absence checks/u);
  assert.match(release, /finite stage\/code\/HTTP-status diagnostics/u);
  assert.match(release, /original 0\.1\.7 CI cause remains unproven/u);
});

test("v1.0 roadmap distinguishes the initial 0.1.0 release from future stability", () => {
  const roadmap = readFileSync(join(packageRoot, "docs", "roadmap.md"), "utf8");
  const v1Section = roadmapSection(roadmap, "## v1.0 — Stable dsmm release");
  const status = "Status: the initial scoped package is `@dsmm/dsmm@0.1.0`; `0.1.1` adds native per-role model/effort policies and ordered role fallbacks. The v1.0 stable milestone remains future work and does not imply all OpenCode hooks or client surfaces are compatible.";

  assert.equal(v1Section.split(status).length - 1, 1, "v1.0 roadmap contains the exact release-ready status once");
  assert.doesNotMatch(v1Section, /\b(?:released|published|available on npm|(?:tag|tagged)\s+(?:has\s+been\s+)?created|created\s+(?:a\s+)?tag)\b/iu);
});

test("release readiness checker accepts the real 0.1.9 package without creating a tarball", () => {
  const tgzBefore = listTgzPaths(packageRoot);
  const expectedCount = expectedRequiredSurfaceCount(packageRoot);
  const { receipt, status } = runReleaseChecker(packageRoot);

  assertReceiptKeys(receipt);
  assert.equal(status, 0);
  assert.equal(receipt.name, "@dsmm/dsmm");
  assert.equal(receipt.version, "0.1.9");
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
      assert.deepEqual(receipt.errors, ["manifest.version must equal 0.1.9"]);
    } finally { removeReleaseFixture(fixtureRoot); }
  }
});

test("release readiness checker requires both native Deepwork metadata resources", () => {
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

test("release readiness checker rejects malformed or noncanonical Deepwork metadata", () => {
  const cases = [
    ["invalid JSON", "{not-json}"],
    ["missing metadata", "{}"],
    ["wrong title", JSON.stringify({ meta: { title: "DSMM", description: "Workflow bundle" } })],
    ["empty description", JSON.stringify({ meta: { title: "Deepwork", description: "  \n" } })],
    ["non-string description", JSON.stringify({ meta: { title: "Deepwork", description: 3 } })],
    ["unexpected metadata field", JSON.stringify({ meta: { title: "Deepwork", description: "Workflow bundle", extra: true } })],
    ["unexpected root field", JSON.stringify({ meta: { title: "Deepwork", description: "Workflow bundle" }, extra: true })]
  ];
  for (const path of ["locale/en.json", "locale/zh.json"]) {
    const fixtureRoot = createReleaseFixture();
    try {
      for (const [label, contents] of cases) {
        writeFixtureFile(fixtureRoot, path, contents);
        const { receipt, status } = runReleaseChecker(fixtureRoot);
        assert.equal(status, 1, `${path}: ${label}`);
        assert.deepEqual(receipt.errors, [`plugin metadata resource must contain exactly Deepwork title and nonempty description: ${path}`]);
      }
    } finally { removeReleaseFixture(fixtureRoot); }
  }
});

test("release readiness checker rejects extra locale assets without broadening file policy", () => {
  const fixtureRoot = createReleaseFixture();
  try {
    const extra = "locale/fr.json";
    writeFixtureFile(fixtureRoot, extra, JSON.stringify({ meta: { title: "Deepwork", description: "Workflow bundle" } }));
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
    "patches/secrets.json"
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

test("release readiness checker pins native session and persistence contracts in peer and dev dependencies", () => {
  for (const section of ["peerDependencies", "devDependencies"]) {
    for (const name of ["@deepseek-ai/dsh-session", "@deepseek-ai/dsh-session-persistence", "@deepseek-ai/dsh-session-persistence-jsonl"]) {
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

test("release readiness checker rejects an absent or foreign selectMode remote descriptor", () => {
  const installed = readFileSync(join(packageRoot, "lib", "client.js"), "utf8");
  assert.ok(installed.includes('descriptor("selectMode",'), "compiled mode descriptor exists");
  for (const replacement of ['descriptor("describeSession",', 'descriptor("foreignMode",']) {
    const fixtureRoot = createReleaseFixture();
    try {
      writeFixtureFile(fixtureRoot, "lib/client.js", installed.replace('descriptor("selectMode",', replacement));
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
