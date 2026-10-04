import assert from "node:assert/strict";
import { test } from "node:test";
import { BOOTSTRAP, computeDigests, resolveReleaseContext, validateTarballBuffer } from "../scripts/dsmm-release.mjs";
import { makeAcceptedFixture } from "./dsmm-trusted-release-fixtures.mjs";
import {
  COMPILED_FILES, PUBLIC_EXPORTS, REQUIRED_CHECKS, lifecycleCommands,
} from "../scripts/dsmm-registry-install-probe.mjs";
import {
  checkTerminalCompletion, parseCompletionArguments, validateRunEvidence,
  validateVerificationReceipt, verifyPublishedArtifact,
} from "../scripts/check-dsmm-release-completion.mjs";

function fixture() {
  const controlSha = "b".repeat(40);
  const context = resolveReleaseContext({
    repository: "hugefiver/ocmm", eventName: "workflow_dispatch", ref: "refs/heads/master",
    eventSha: controlSha, workflowSha: controlSha, controlSha, peeledSha: BOOTSTRAP.releaseSha,
    workflowRef: "hugefiver/ocmm/.github/workflows/dsmm-release.yml@refs/heads/master",
    runId: "123", runAttempt: "1", packageVersion: "0.1.2", controlInDefaultHistory: true,
  });
  const identity = {
    ...context, ...BOOTSTRAP, receiptSize: 42363, receiptFilename: "docker-receipt-native-session-control.json",
    dockerAcceptance: { outcome: "COMPLETED", origin: "imported-local-receipt" },
  };
  const run = {
    id: 123, run_attempt: 1, workflow_id: 456, repository: { full_name: "hugefiver/ocmm" },
    head_repository: { full_name: "hugefiver/ocmm" }, status: "completed", conclusion: "success",
    head_sha: controlSha, head_branch: "master", event: "workflow_dispatch",
  };
  const workflow = { id: 456, path: ".github/workflows/dsmm-release.yml" };
  const jobs = ["prepare", "publish", "verify", "github-release"].map((name, index) => ({
    id: index + 1, name, run_id: 123, run_attempt: 1, status: "completed", conclusion: "success",
  }));
  const expected = { runId: "123", runAttempt: "1", controlSha };
  return { identity, run, workflow, jobs, expected };
}

function installFixture(identity: ReturnType<typeof fixture>["identity"]) {
  const hash = "a".repeat(64);
  const profile = `dsmm-registry-${"a".repeat(32)}`;
  return {
    schemaVersion: 1, outcome: "COMPLETED", packageName: "@dsmm/dsmm", version: identity.version, sha256: identity.sha256,
    registry: {
      url: "https://registry.npmjs.org/", tarball: `https://registry.npmjs.org/@dsmm/dsmm/-/dsmm-${identity.version}.tgz`,
      integrity: identity.integrity, sha1: identity.sha1, sha256: identity.sha256,
      sha512: identity.integrity.slice("sha512-".length), size: identity.size,
    },
    packageManager: { name: "pnpm", version: "11.9.0", integrity: "sha512-vWgtXQP+Ul73yf1ngMaITR51asTJyf4AxTh4KCQxDc+Q493E9Tg18G3669UIXkGFXgvLs7YN4qxburieUDbwOw==" },
    native: {
      version: "0.2.0-rc.2", integrity: "sha512-EAJ3gPNcVt/uv8X19PMm9NkVhWgT7xXNMk0UKCVm+IQ5rpSQOcsMUa0HWlnYYVybKMsccjcRB21vVVsaXQ6IdA==",
      binSha256: hash, headless: true, profileList: true, dumpConfig: true, profile,
      commands: lifecycleCommands(profile, identity.version).map(command => ({ ...command, status: 0, stdoutSha256: hash, stderrSha256: hash })),
    },
    exports: Object.fromEntries(Object.entries(PUBLIC_EXPORTS).map(([key, path]) => [key, { path, sha256: hash }])),
    compiledFiles: Object.fromEntries(COMPILED_FILES.map(path => [path, { path, sha256: hash }])),
    checks: Object.fromEntries(REQUIRED_CHECKS.map(key => [key, true])), temporaryRootRemoved: true, cleanup: { outcome: "COMPLETED" },
    nonClaims: { paidModelCall: false, realLogin: false, authenticatedDesktop: false, uiAcceptance: false },
    startedAt: "2026-10-05T00:00:00.000Z", finishedAt: "2026-10-05T00:01:00.000Z",
  };
}

test("DSMM completion requires exact four successful jobs bound to the fixed attempt", () => {
  const f = fixture();
  assert.equal(validateRunEvidence(f.run, f.workflow, f.jobs, f.identity, f.expected).length, 4);
  for (const mutate of [
    (copy: typeof f) => { copy.jobs.pop(); },
    (copy: typeof f) => { copy.jobs.push({ ...copy.jobs[0], name: "extra" }); },
    (copy: typeof f) => { copy.jobs[2].conclusion = "skipped"; },
    (copy: typeof f) => { copy.jobs[2].run_attempt = 2; },
    (copy: typeof f) => { copy.jobs[2].name = "publish"; },
    (copy: typeof f) => { copy.run.run_attempt = 2; },
    (copy: typeof f) => { copy.run.head_sha = "a".repeat(40); },
    (copy: typeof f) => { copy.run.head_branch = "unsafe"; },
    (copy: typeof f) => { copy.run.repository.full_name = "other/ocmm"; },
    (copy: typeof f) => { copy.workflow.path = ".github/workflows/release.yml"; },
    (copy: typeof f) => { copy.identity.workflow.ref = "hugefiver/ocmm/.github/workflows/dsmm-release.yml@refs/heads/unsafe"; },
    (copy: typeof f) => { copy.run.status = "in_progress"; },
  ]) {
    const copy = structuredClone(f);
    mutate(copy);
    assert.throws(() => validateRunEvidence(copy.run, copy.workflow, copy.jobs, copy.identity, copy.expected));
  }
});

test("DSMM verification binds downloaded bytes and genuine install contract, not top-level green labels", async () => {
  const { identity } = fixture();
  const registry = { outcome: "COMPLETED", name: "@dsmm/dsmm", version: identity.version, registry: "https://registry.npmjs.org/", size: identity.size, sha256: identity.sha256, sha1: identity.sha1, integrity: identity.integrity, tarball: Buffer.from("not retained") };
  const receipt = await verifyPublishedArtifact(identity, { registryCheck: async () => registry, installProbe: async () => installFixture(identity) });
  assert.equal(receipt.outcome, "COMPLETED");
  assert.equal("tarball" in receipt.registry, false);
  assert.equal(validateVerificationReceipt(receipt, identity), receipt);
  for (const mutate of [
    (copy: typeof receipt) => { copy.identity.runAttempt = "2"; },
    (copy: typeof receipt) => { copy.registry.sha256 = "b".repeat(64); },
    (copy: typeof receipt) => { copy.registry.version = "0.1.1"; },
    (copy: typeof receipt) => { copy.freshInstall.version = "0.1.1"; },
    (copy: typeof receipt) => { copy.freshInstall.temporaryRootRemoved = false; },
    (copy: typeof receipt) => { copy.freshInstall.checks.publicExports = false; },
    (copy: typeof receipt) => { delete copy.freshInstall.compiledFiles["lib/profile-runtime.js"]; },
    (copy: typeof receipt) => { copy.freshInstall.registry.sha1 = "a".repeat(40); },
  ]) {
    const copy = structuredClone(receipt);
    mutate(copy);
    assert.throws(() => validateVerificationReceipt(copy, identity));
  }
  await assert.rejects(() => verifyPublishedArtifact(identity, { registryCheck: async () => { throw new Error("unavailable"); }, installProbe: async () => installFixture(identity) }));
});

test("terminal checker cannot complete from unfinished workflow or ambiguous artifact metadata", async () => {
  const f = fixture();
  await assert.rejects(() => checkTerminalCompletion(f.expected, { request: () => ({ ...f.run, status: "in_progress" }) }), /still running/u);
  const request = (path: string) => {
    if (path === "actions/runs/123") return f.run;
    if (path === "actions/workflows/456") return f.workflow;
    if (path.includes("/jobs?")) return { total_count: 4, jobs: f.jobs };
    return { total_count: 2, artifacts: [1, 2].map(id => ({ id, name: "dsmm-accepted-123-1", expired: false, workflow_run: { id: 123 } })) };
  };
  let downloaded = false;
  await assert.rejects(() => checkTerminalCompletion(f.expected, { request, downloadArtifact: () => { downloaded = true; } }), /ambiguous/u);
  assert.equal(downloaded, false);
});

test("terminal completion traverses exact public surfaces and binds CI native proof file hashes", async () => {
  const { writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  async function scenario(change?: "missing-proof" | "wrong-attempt" | "wrong-file-hash") {
    const accepted = makeAcceptedFixture();
    const { identity } = accepted;
    const f = fixture();
    const expected = { runId: identity.runId, runAttempt: identity.runAttempt, controlSha: identity.controlSha };
    const run = { ...f.run, id: Number(identity.runId), event: "push", head_sha: identity.controlSha, head_branch: identity.tag };
    const jobs = f.jobs.map(job => ({ ...job, run_id: Number(identity.runId), run_attempt: Number(identity.runAttempt) }));
    const registry = { outcome: "COMPLETED", name: "@dsmm/dsmm", version: identity.version, registry: "https://registry.npmjs.org/", size: identity.size, sha256: identity.sha256, sha1: identity.sha1, integrity: identity.integrity };
    const installed = installFixture(identity);
    const files = validateTarballBuffer(accepted.tarball, { version: identity.version }).files;
    for (const entry of [...Object.values(installed.exports), ...Object.values(installed.compiledFiles)]) entry.sha256 = computeDigests(files.get(entry.path)).sha256;
    const verification = await verifyPublishedArtifact(identity, { registryCheck: async () => registry, installProbe: async () => installed });
    if (change === "wrong-attempt") verification.identity.runAttempt = "2";
    if (change === "wrong-file-hash") verification.freshInstall.compiledFiles["lib/profile-runtime.js"].sha256 = "b".repeat(64);
    const artifacts = [
      { id: 7, name: `dsmm-accepted-${identity.runId}-${identity.runAttempt}`, expired: false, workflow_run: { id: Number(identity.runId) } },
      { id: 8, name: `dsmm-registry-verification-${identity.runId}-${identity.runAttempt}`, expired: false, workflow_run: { id: Number(identity.runId) } },
    ];
    if (change === "missing-proof") artifacts.pop();
    const request = (path: string) => {
      if (path === `actions/runs/${identity.runId}`) return run;
      if (path.startsWith("actions/workflows/")) return f.workflow;
      if (path.includes("/jobs?")) return { total_count: jobs.length, jobs };
      if (path.includes("/artifacts?")) return { total_count: artifacts.length, artifacts };
      if (path.startsWith("git/ref/")) return { object: { type: "commit", sha: identity.releaseSha } };
      return { ...accepted.release, draft: false };
    };
    let registryRechecks = 0;
    const result = await checkTerminalCompletion(expected, {
      request,
      downloadArtifact: (artifact, output) => {
        if (artifact.id === 8) writeFileSync(join(output, "dsmm-registry-verification.json"), JSON.stringify(verification), { flag: "wx" });
        else {
          for (const [name, bytes] of accepted.assets) writeFileSync(join(output, name), bytes, { flag: "wx" });
          writeFileSync(join(output, "identity.json"), JSON.stringify(identity), { flag: "wx" });
          writeFileSync(join(output, "context.json"), JSON.stringify(accepted.context), { flag: "wx" });
        }
      },
      fetchAsset: async asset => accepted.assets.get(asset.name),
      publishedCheck: (checked, runtime) => verifyPublishedArtifact(checked, { ...runtime, registryCheck: async () => { registryRechecks++; return registry; } }),
    });
    assert.equal(registryRechecks, 1);
    return result;
  }
  const result = await scenario();
  assert.equal(result.outcome, "COMPLETED");
  assert.equal(result.freshInstallEvidence.origin, "CI verify job, Linux/Node 24");
  assert.equal(result.freshInstallEvidence.artifactId, 8);
  assert.equal(result.nonclaims.terminalHostNativeInstall, "NOT_RUN_REDUNDANT_TO_BOUND_CI_PROOF");
  for (const change of ["missing-proof", "wrong-attempt", "wrong-file-hash"] as const) await assert.rejects(() => scenario(change));
});

test("completion CLI rejects unbound identities and arbitrary modes", () => {
  assert.equal(parseCompletionArguments(["terminal", "--run-id", "123", "--run-attempt", "1", "--control-sha", "a".repeat(40), "--receipt", "proof.json"]).mode, "terminal");
  for (const args of [
    ["terminal", "--run-id", "123", "--receipt", "proof.json"],
    ["terminal", "--run-id", "123;anything", "--run-attempt", "1", "--control-sha", "a".repeat(40), "--receipt", "proof.json"],
    ["verify", "--receipt", "proof.json"], ["publish", "--receipt", "proof.json"],
  ]) assert.throws(() => parseCompletionArguments(args));
});

test("DSMM YAML keeps pnpm, isolated permissions and complete frozen Docker gate", async () => {
  const { readFileSync } = await import("node:fs");
  const yaml = readFileSync(new URL("../.github/workflows/dsmm-release.yml", import.meta.url), "utf8");
  assert.equal((yaml.match(/id-token: write/gu) ?? []).length, 1);
  assert.equal((yaml.match(/contents: write/gu) ?? []).length, 1);
  assert.equal((yaml.match(/persist-credentials: false/gu) ?? []).length, 4);
  assert.match(yaml, /cancel-in-progress: false/u);
  assert.match(yaml, /pnpm install --frozen-lockfile/u);
  assert.match(yaml, /pnpm --dir control\/dsmm pack/u);
  assert.match(yaml, /--expected-sha256 "\$DSMM_FROZEN_SHA256"/u);
  for (const required of ["--require-hook", "--acceptance-hook", "profile-ui-harness-server.mjs", "profile-ui-harness-browser.mjs"]) assert.ok(yaml.includes(required));
  assert.doesNotMatch(yaml, /NPM_TOKEN|NODE_AUTH_TOKEN|--clobber|npm publish/u);
  assert.equal((yaml.match(/artifact-ids: \$\{\{ needs\.prepare\.outputs\.artifact-id \}\}/gu) ?? []).length, 3);
});
