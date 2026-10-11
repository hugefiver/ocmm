import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Source-only release controls are deliberately not published.
import * as controls from "../scripts/dsmm-release.mjs";
// @ts-expect-error Source-only registry probe is deliberately not published.
import * as probe from "../scripts/dsmm-registry-install-probe.mjs";
// @ts-expect-error Source-only completion checker is deliberately not published.
import * as completion from "../scripts/check-dsmm-release-completion.mjs";
// @ts-expect-error Source-only version contract is deliberately not published.
import { COMPILED_NAMES_020, PRESET_NAMES_020, SKILL_EXECUTABLES_020 } from "../scripts/release-contract.mjs";
// @ts-expect-error Synthetic historical data is never native acceptance proof.
import { archiveFiles, contextInput, makeAcceptedFixture, makeInstallFixture, packageFiles } from "../../src/dsmm-trusted-release-fixtures.mjs";

function artifactFixture(version = "0.2.0") {
  const files = packageFiles(version);
  if (version === "0.2.0") {
    files.set("prompts/source/catalog.json", Buffer.from(JSON.stringify(PRESET_NAMES_020.map((row: { id: string }) => ({ ...row, mode: row.id === "dsmm-planner" ? "all" : ["dsmm-builder", "dsmm-orchestrator"].includes(row.id) ? "primary" : "subagent", enabledByDefault: row.id !== "dsmm-cross-cutting" })))));
    files.set("prompts/source/manifest.json", Buffer.from(JSON.stringify({ files: [] })));
    for (const language of ["en", "zh"]) files.set(`locale/${language}.json`, Buffer.from(JSON.stringify({ meta: { title: "DSMM", description: "Synthetic release metadata" } })));
    for (const name of COMPILED_NAMES_020) for (const extension of ["js", "d.ts"]) files.set(`lib/${name}.${extension}`, Buffer.from("synthetic compiled fixture\n"));
    for (const path of SKILL_EXECUTABLES_020) files.set(path, Buffer.from("synthetic skill resource\n"));
  }
  const tarball = archiveFiles(files), digests = controls.computeDigests(tarball), historical = makeAcceptedFixture();
  const context = controls.resolveReleaseContext({ ...contextInput(), ref: `refs/tags/dsmm-scoped-v${version}`, packageVersion: version, workflowRef: `hugefiver/ocmm/.github/workflows/dsmm-release.yml@refs/tags/dsmm-scoped-v${version}` });
  const identity = controls.validateArtifactIdentity({ ...historical.identity, ...context, ...digests, filename: `dsmm-dsmm-${version}.tgz`, sourceChecks: "COMPLETED" });
  return { files, tarball, identity, context };
}
function installFixture() {
  const f = artifactFixture(), receipt = makeInstallFixture(makeAcceptedFixture());
  receipt.version = f.identity.version; receipt.sha256 = f.identity.sha256;
  Object.assign(receipt.registry, { ...controls.computeDigests(f.tarball), tarball: `https://registry.npmjs.org/@dsmm/dsmm/-/dsmm-${receipt.version}.tgz`, sha512: f.identity.integrity.slice(7) });
  receipt.native.commands = probe.lifecycleCommands(receipt.native.profile, receipt.version).map((command: object) => ({ ...command, status: 0, stdoutSha256: f.identity.sha256, stderrSha256: f.identity.sha256 }));
  const file = (path: string) => ({ path, sha256: controls.computeDigests(f.files.get(path)).sha256 });
  receipt.exports = Object.fromEntries(Object.entries(probe.publicExportsForVersion(receipt.version)).map(([name, path]) => [name, file(String(path))]));
  receipt.compiledFiles = Object.fromEntries(probe.compiledFilesForVersion(receipt.version).map((path: string) => [path, file(path)]));
  receipt.nativeMetadata.version = receipt.version;
  receipt.nativeMetadata.locales = probe.validateLocaleResources(new Map([...f.files].filter(([path]) => String(path).startsWith("locale/"))), receipt.version);
  return { ...f, receipt };
}
test("local registry probe accepts exact 020 installed Core/role/client bytes and historical metadata without substituting contracts", () => {
  const f = installFixture();
  assert.equal(probe.validateInstallReceipt(f.receipt, f.identity), f.receipt);
  completion.validateInstalledFileHashes(f.receipt, f.files);
  const historical = makeInstallFixture(makeAcceptedFixture());
  assert.equal(probe.validateInstallReceipt(historical, { version: historical.version, sha256: historical.sha256 }), historical);
  assert.deepEqual(probe.compiledFilesForVersion("0.1.3"), Object.keys(historical.compiledFiles));
  for (const name of COMPILED_NAMES_020) assert.ok(f.receipt.compiledFiles[`lib/${name}.js`]);
  const oldTitle = structuredClone(f.receipt); oldTitle.nativeMetadata.locales.en.title = "Deepwork";
  assert.throws(() => probe.validateInstallReceipt(oldTitle, f.identity));
  const missingCore = structuredClone(f.receipt); delete missingCore.compiledFiles["lib/deployment-config.js"];
  assert.throws(() => probe.validateInstallReceipt(missingCore, f.identity));
  const alteredBytes = new Map(f.files); alteredBytes.set("lib/deployment-config.js", Buffer.from("changed"));
  assert.throws(() => completion.validateInstalledFileHashes(f.receipt, alteredBytes));
  const wrongLocale = new Map(f.files); wrongLocale.set("locale/zh.json", Buffer.from(JSON.stringify({ meta: { title: "Deepwork", description: "old" } })));
  assert.throws(() => controls.validateTarballBuffer(archiveFiles(wrongLocale), { version: "0.2.0" }));
});
test("020 artifact and terminal authority bind fixed source/control/run/attempt and exact mode-specific jobs", () => {
  const { identity } = artifactFixture();
  const expected = { runId: identity.runId, runAttempt: identity.runAttempt, controlSha: identity.controlSha };
  const run = { id: Number(identity.runId), run_attempt: 1, workflow_id: 123, repository: { full_name: "hugefiver/ocmm" }, head_repository: { full_name: "hugefiver/ocmm" }, status: "completed", conclusion: "success", head_sha: identity.controlSha, head_branch: identity.tag, event: "push" };
  const workflow = { id: 123, path: ".github/workflows/dsmm-release.yml" };
  const jobs = completion.REQUIRED_JOBS.map((name: string, index: number) => ({ id: index + 1, name, run_id: Number(identity.runId), run_attempt: 1, status: "completed", conclusion: name === "import-bootstrap" ? "skipped" : "success" }));
  assert.equal(completion.validateRunEvidence(run, workflow, jobs, identity, expected).length, 5);
  for (const changedRun of [{ ...run, run_attempt: 2 }, { ...run, head_sha: "b".repeat(40) }, { ...run, conclusion: "failure" }, { ...run, status: "in_progress" }]) assert.throws(() => completion.validateRunEvidence(changedRun, workflow, jobs, identity, expected));
  assert.throws(() => completion.validateRunEvidence(run, workflow, jobs.slice(1), identity, expected));
  const wrongJob = structuredClone(jobs); wrongJob[0].conclusion = "success";
  assert.throws(() => completion.validateRunEvidence(run, workflow, wrongJob, identity, expected));
  assert.throws(() => controls.validateArtifactIdentity({ ...identity, releaseSha: "b".repeat(40) }));
  assert.throws(() => controls.resolveReleaseContext({ ...contextInput(), packageVersion: "0.2.0" }));
});
test("OIDC-only exact-tarball publication rejects static auth and never enables repacking or registry retry", () => {
  const { identity } = artifactFixture();
  const env = { GITHUB_ACTIONS: "true", ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.actions.githubusercontent.com/oidc", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture" };
  assert.doesNotThrow(() => controls.assertPublishEnvironment(env));
  for (const key of ["NPM_TOKEN", "NODE_AUTH_TOKEN", "NPM_CONFIG_AUTH", "SIGSTORE_ID_TOKEN"]) assert.throws(() => controls.assertPublishEnvironment({ ...env, [key]: "forbidden" }));
  assert.throws(() => controls.assertPublishEnvironment({ ...env, ACTIONS_ID_TOKEN_REQUEST_URL: "https://foreign.example/oidc" }));
  assert.deepEqual(controls.publishArguments(identity, `/owned/${identity.filename}`), ["publish", `/owned/${identity.filename}`, "--access", "public", "--registry=https://registry.npmjs.org/", "--ignore-scripts", "--no-git-checks", "--config.fetch-retries=0", "--provenance"]);
  assert.throws(() => controls.publishArguments(identity, "/owned/repacked.tgz"));
});
test("visibility defaults preserve historical 019 special budget and keep 020 bounded without publishing", async () => {
  for (const [version, expectedBudget] of [["0.1.9", 1_200_000], ["0.2.0", 120_000]] as const) {
    const { identity } = artifactFixture(version); let now = 0; let reads = 0;
    await assert.rejects(() => controls.verifyRegistryArtifact(identity, async () => { reads++; return new Response(null, { status: 404 }); }, { now: () => now, wait: async (ms: number) => { now += ms; } }));
    assert.equal(now, expectedBudget); assert.ok(reads > 0);
    await assert.rejects(() => controls.verifyRegistryArtifact(identity, async () => { throw Error("must not fetch"); }, { visibilityDeadlineMs: version === "0.1.9" ? 1_200_001 : 300_001 }));
  }
});
