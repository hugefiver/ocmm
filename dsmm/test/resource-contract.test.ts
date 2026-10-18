import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Source-only release validator is deliberately not published.
import { computeDigests, isForbiddenPackagePath, manifestExportsForVersion, validateTarballBuffer } from "../scripts/dsmm-release.mjs";
// @ts-expect-error Source-only release inventory is deliberately not published.
import { COMPILED_NAMES_020, COMPILED_NAMES_021, COMPILED_NAMES_022, COMPILED_NAMES_030, COLD_PROFILE_SCRIPTS_022, PRESET_NAMES_020, PRESET_NAMES_021, PRESET_NAMES_022, PRESET_NAMES_030, SKILL_EXECUTABLES_020, SKILL_EXECUTABLES_021, SKILL_EXECUTABLES_022, SKILL_EXECUTABLES_030, dshPolicyForVersion, skillExecutablesForVersion } from "../scripts/release-contract.mjs";
// @ts-expect-error In-memory archives are safety fixtures, never packaged or published artifacts.
import { archiveFiles, packageFiles } from "../../src/dsmm-trusted-release-fixtures.mjs";

const source = JSON.parse(readFileSync(new URL("../prompts/source/manifest.json", import.meta.url), "utf8"));
const packageManifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const resources: string[] = source.files.map((record: { artifact: string }) => record.artifact)
  .filter((path: string) => path.startsWith("skills/") && /\.(?:py|pyw|sh|ps1|psm1|mjs|cjs|js|bat|cmd)$/iu.test(path));
const publicModuleNames031 = [...new Set(Object.values(packageManifest.exports).flatMap((entry) => {
  if (typeof entry !== "object" || entry === null || !("default" in entry) || typeof entry.default !== "string") return [];
  return entry.default.startsWith("./lib/") && entry.default.endsWith(".js") ? [entry.default.slice("./lib/".length, -".js".length)] : [];
}))];
const contracts = [
  { version: "0.2.0", compiled: COMPILED_NAMES_020, presets: PRESET_NAMES_020, resources: SKILL_EXECUTABLES_020 },
  { version: "0.2.1", compiled: COMPILED_NAMES_021, presets: PRESET_NAMES_021, resources: SKILL_EXECUTABLES_021 },
  { version: "0.2.2", compiled: COMPILED_NAMES_022, presets: PRESET_NAMES_022, resources: SKILL_EXECUTABLES_022 },
  { version: "0.3.0", compiled: COMPILED_NAMES_030, presets: PRESET_NAMES_030, resources: SKILL_EXECUTABLES_030 },
  { version: "0.3.1", compiled: publicModuleNames031, presets: PRESET_NAMES_030, resources: skillExecutablesForVersion("0.3.1") },
];
type ResourceContract = typeof contracts[number];
const currentVersion: string = packageManifest.version;
function fixture(contract: ResourceContract) {
  const files: Map<string, Buffer> = packageFiles(contract.version === "0.3.1" ? "0.3.0" : contract.version);
  const manifest = contract.version === "0.3.1" ? structuredClone(packageManifest) : JSON.parse(files.get("package.json")!.toString("utf8"));
  manifest.version = contract.version;
  if (contract.version !== "0.3.1") manifest.exports = manifestExportsForVersion(contract.version);
  const dshPolicy = dshPolicyForVersion(contract.version);
  manifest.engines = dshPolicy.engines;
  for (const dependencies of [manifest.peerDependencies, manifest.devDependencies]) for (const name of Object.keys(dependencies ?? {})) {
    if (name.startsWith("@deepseek-ai/dsh-")) dependencies[name] = dependencies === manifest.peerDependencies ? dshPolicy.peerVersion : dshPolicy.sdkVersion;
  }
  files.set("package.json", Buffer.from(JSON.stringify(manifest)));
  files.set("prompts/source/manifest.json", Buffer.from(JSON.stringify(source)));
  files.set("prompts/source/catalog.json", Buffer.from(JSON.stringify(contract.presets.map((row: { id: string }) => ({ ...row,
    mode: row.id === "dsmm-planner" ? "all" : ["dsmm-builder", "dsmm-orchestrator"].includes(row.id) ? "primary" : "subagent", enabledByDefault: row.id !== "dsmm-cross-cutting" })))));
  for (const language of ["en", "zh"]) files.set(`locale/${language}.json`, Buffer.from(JSON.stringify({ meta: { title: "DSMM", description: "Synthetic release metadata" } })));
  for (const name of contract.compiled) for (const extension of ["js", "d.ts"]) files.set(`lib/${name}.${extension}`, Buffer.from("synthetic compiled fixture\n"));
  for (const path of contract.resources) files.set(path, readFileSync(new URL(`../${path}`, import.meta.url)));
  if (contract.version === "0.2.2") for (const path of COLD_PROFILE_SCRIPTS_022) files.set(path, Buffer.from("synthetic historical operator resource\n"));
  if (["0.2.2", "0.3.0"].includes(contract.version)) for (const path of ["docs/native-permissions.md", "docs/deferred-native-approval-risk.md"]) files.set(path, readFileSync(new URL(`../${path}`, import.meta.url)));
  return files;
}
const validate = (files: Map<string, Buffer>, version: string) => validateTarballBuffer(archiveFiles(files), { version });
function historicalFixture(version: string): Map<string, Buffer> {
  const files = packageFiles(version), manifest = JSON.parse(files.get("package.json")!.toString("utf8"));
  manifest.engines = { node: ">=22" };
  for (const dependencies of [manifest.peerDependencies, manifest.devDependencies]) for (const name of Object.keys(dependencies ?? {})) {
    if (name.startsWith("@deepseek-ai/dsh-")) dependencies[name] = "0.2.0-rc.2";
  }
  files.set("package.json", Buffer.from(JSON.stringify(manifest)));
  return files;
}

test("current source delivers exactly its explicitly versioned executable skill resource inventory", () => {
  const contract = contracts.find((contract) => contract.version === currentVersion);
  assert.ok(contract, `unreviewed resource version: ${currentVersion}`);
  assert.deepEqual([...contract.resources].sort(), [...resources].sort());
});

test("0.3.0 uses its delivered tree set without a synthetic research document", () => {
  const current = fixture(contracts.find((contract) => contract.version === "0.3.0")!);
  current.delete("docs/research/reference.md");
  assert.equal(validate(current, "0.3.0").version, "0.3.0");
  current.set("docs/research/reference.md", Buffer.from("retired research fixture\n"));
  assert.throws(() => validate(current, "0.3.0"), /unexpected package surface/u);
  assert.equal(validate(historicalFixture("0.1.9"), "0.1.9").version, "0.1.9");
});

for (const contract of contracts) {
  test(`${contract.version} delivers every complete executable skill resource including native resource-base self-tests`, () => {
    const accepted = validate(fixture(contract), contract.version);
    for (const path of contract.resources) {
      assert.equal(isForbiddenPackagePath(path, contract.version), false, path);
      assert.deepEqual(accepted.files.get(path), readFileSync(new URL(`../${path}`, import.meta.url)), path);
    }
  });

  test(`${contract.version} refuses every missing or empty required executable skill resource`, () => {
    const original = fixture(contract);
    for (const path of contract.resources) for (const missing of [true, false]) {
      const changed = new Map(original);
      if (missing) changed.delete(path); else changed.set(path, Buffer.alloc(0));
      assert.throws(() => validate(changed, contract.version), Error, path);
    }
  });

  test(`${contract.version} rejects injected same-class scripts even when a packed inventory claims them`, () => {
    for (const path of ["skills/ast-grep/scripts/extra.py", "skills/ast-grep/tests/extra.sh", "skills/ast-grep/install-extra.ps1",
      "skills/coding-agent-sessions/scripts/agent_sessions/extra.py", "skills/coding-agent-sessions/scripts/tests/extra.py",
      "skills/frontend/references/extra.py", "skills/debugging/references/extra.mjs"]) {
      const changed = fixture(contract); changed.set(path, Buffer.from("injected executable\n"));
      changed.set("prompts/source/manifest.json", Buffer.from(JSON.stringify({ ...source, files: [...source.files, { source: path, artifact: path }] })));
      assert.equal(isForbiddenPackagePath(path, contract.version), true);
      assert.throws(() => validate(changed, contract.version), Error, path);
    }
  });
}

test("historical and default release consumers retain their original resource prohibition", () => {
  for (const version of [undefined, "0.1.3", "0.1.5", "0.1.9", "0.2.3", "1.0.0"]) {
    for (const path of resources.filter((path) => path.includes("/scripts/") || path.includes("/tests/"))) {
      assert.equal(isForbiddenPackagePath(path, version), path !== "skills/debugging/references/scripts/dap.mjs", `${version}: ${path}`);
    }
  }
  assert.equal(validateTarballBuffer(archiveFiles(historicalFixture("0.1.3")), { version: "0.1.3" }).version, "0.1.3");
});

const suppliedArtifact = process.env.DSMM_RELEASE_TEST_ARTIFACT;
if (suppliedArtifact) test("an explicitly supplied existing tarball retains its bytes and passes current resource validation", () => {
  const before = readFileSync(suppliedArtifact), digest = computeDigests(before);
  assert.ok(contracts.some((contract) => contract.version === currentVersion), `unreviewed resource version: ${currentVersion}`);
  const accepted = validateTarballBuffer(before, { version: currentVersion, expectedDigests: digest });
  for (const path of resources) assert.ok(accepted.files.get(path)?.length > 0);
  const missing = new Map<string, Buffer>(accepted.files); missing.delete("skills/ast-grep/tests/smoke.sh");
  assert.throws(() => validate(missing, currentVersion), Error);
  const injected = new Map<string, Buffer>(accepted.files); injected.set("skills/coding-agent-sessions/scripts/agent_sessions/extra.py", Buffer.from("injected executable\n"));
  assert.throws(() => validate(injected, currentVersion), Error);
  assert.deepEqual(readFileSync(suppliedArtifact), before);
});
