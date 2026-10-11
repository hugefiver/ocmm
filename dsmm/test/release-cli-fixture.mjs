import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeDigests, deterministicChecksums } from "../scripts/dsmm-release.mjs";
import { createOwnedRoot, cleanupOwnedRoot, compiledFilesForVersion, validateLocaleResources } from "../scripts/dsmm-registry-install-probe.mjs";
import { makeInstallFixture, makeAcceptedFixture } from "../../src/dsmm-trusted-release-fixtures.mjs";

export function runCliControls({ tarball, receipt, identity, context, files }) {
  const owner = createOwnedRoot();
  try {
    const root = owner.root, fixturePath = join(root, "fixture.json"), eventPath = join(root, "event.json"), statePath = join(root, "state.json");
    const accepted = { [identity.filename]: tarball, [identity.receiptFilename]: Buffer.from(JSON.stringify(receipt)), "SHA256SUMS.txt": deterministicChecksums(identity),
      "identity.json": Buffer.from(JSON.stringify(identity)), "context.json": Buffer.from(JSON.stringify(context)) };
    const installReceipt = makeInstallFixture(makeAcceptedFixture());
    installReceipt.version = identity.version; installReceipt.sha256 = identity.sha256;
    Object.assign(installReceipt.registry, computeDigests(tarball), { tarball: `https://registry.npmjs.org/@dsmm/dsmm/-/dsmm-${identity.version}.tgz`, sha512: identity.integrity.slice(7) });
    installReceipt.native.commands[1].args[4] = `@dsmm/dsmm@${identity.version}`;
    const file = (path) => ({ path, sha256: computeDigests(files.get(path)).sha256 });
    installReceipt.exports = Object.fromEntries(Object.entries(installReceipt.exports).map(([name, entry]) => [name, file(entry.path)]));
    installReceipt.compiledFiles = Object.fromEntries(compiledFilesForVersion(identity.version).map((path) => [path, file(path)]));
    installReceipt.nativeMetadata.version = identity.version;
    installReceipt.nativeMetadata.locales = validateLocaleResources(new Map([...files].filter(([path]) => path.startsWith("locale/"))), identity.version);
    writeFileSync(fixturePath, JSON.stringify({ root, identity, context, installReceipt, accepted: Object.fromEntries(Object.entries(accepted).map(([name, contents]) => [name, contents.toString("base64")])) }), { flag: "wx" });
    writeFileSync(statePath, JSON.stringify({ packs: 0, publishes: 0, commands: [], assets: {}, published: false }), { flag: "wx" });
    writeFileSync(eventPath, JSON.stringify({ repository: { full_name: identity.repository, default_branch: "master" }, ref: identity.ref, after: identity.releaseSha, deleted: false }), { flag: "wx" });
    const env = { ...process.env, DSMM_RELEASE_CLI_TEST: "fixture-only", DSMM_RELEASE_CLI_FIXTURE: fixturePath, GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: identity.repository, GITHUB_EVENT_NAME: "push", GITHUB_REF: identity.ref, GITHUB_SHA: identity.releaseSha,
      GITHUB_WORKFLOW_REF: identity.workflow.ref, GITHUB_WORKFLOW_SHA: identity.controlSha, GITHUB_RUN_ID: identity.runId, GITHUB_RUN_ATTEMPT: identity.runAttempt,
      GITHUB_ACTIONS: "true", ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.actions.githubusercontent.com/fixture", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "test-only", GH_TOKEN: "test-only" };
    for (const key of Object.keys(env)) if (/NPM_TOKEN|NODE_AUTH_TOKEN|NPM_CONFIG_.*AUTH|SIGSTORE_ID_TOKEN/iu.test(key)) delete env[key];
    const run = (script, args, expectedExit = 0) => {
      const result = spawnSync(process.execPath, ["--import", new URL("./release-cli-carrier.mjs", import.meta.url).href, fileURLToPath(new URL(`../scripts/${script}`, import.meta.url)), ...args], { encoding: "utf8", env, timeout: 15_000, windowsHide: true });
      assert.equal(result.error, undefined); assert.equal(result.status, expectedExit, result.stderr || result.stdout);
      return result.stdout.trim() ? JSON.parse(result.stdout.trim()) : null;
    };
    const contextPath = join(root, "context.json"), packed = join(root, "packed"), transport = join(root, "accepted");
    assert.equal(run("dsmm-release.mjs", ["resolve", "--control-root", root, "--output", contextPath]).version, "0.2.0");
    const base = ["--control-root", root, "--context", contextPath];
    const guarded = { releaseSha: identity.releaseSha, controlSha: identity.controlSha, tag: identity.tag };
    const start = JSON.parse(readFileSync(statePath, "utf8"));
    assert.deepEqual(run("dsmm-release.mjs", ["assert-source", ...base]), guarded);
    const inspected = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(inspected.packs, 0); assert.equal(inspected.publishes, 0);
    assert.ok(inspected.commands.slice(start.commands.length).every(([name]) => name === "git"));
    writeFileSync(contextPath, JSON.stringify({ ...context, runAttempt: "999" }));
    run("dsmm-release.mjs", ["assert-source", ...base], 1);
    writeFileSync(contextPath, JSON.stringify(context));
    for (const dirty of [" M dsmm/docs/roadmap.md", "?? dsmm/extra.json", " M pnpm-lock.yaml"]) {
      const current = JSON.parse(readFileSync(statePath, "utf8")); current.dirty = dirty; writeFileSync(statePath, JSON.stringify(current));
      run("dsmm-release.mjs", ["assert-source", ...base], 1);
    }
    const locked = JSON.parse(readFileSync(statePath, "utf8")); locked.dirty = " M pnpm-lock.yaml"; writeFileSync(statePath, JSON.stringify(locked));
    run("dsmm-release.mjs", ["pack", ...base, "--output-dir", join(root, "locked-pack-refused")], 1);
    const refused = JSON.parse(readFileSync(statePath, "utf8")); assert.equal(refused.packs, 0); delete refused.dirty; writeFileSync(statePath, JSON.stringify(refused));
    assert.equal(run("dsmm-release.mjs", ["pack", ...base, "--output-dir", packed]).sha256, identity.sha256);
    assert.deepEqual(run("dsmm-release.mjs", ["assert-source", ...base]), guarded);
    const changed = JSON.parse(readFileSync(statePath, "utf8")); changed.dirty = " M dsmm/package.json"; writeFileSync(statePath, JSON.stringify(changed));
    run("dsmm-release.mjs", ["assert-source", ...base], 1);
    const restored = JSON.parse(readFileSync(statePath, "utf8")); delete restored.dirty; writeFileSync(statePath, JSON.stringify(restored));
    const receiptPath = join(root, "docker.json"); writeFileSync(receiptPath, accepted[identity.receiptFilename], { flag: "wx" });
    assert.equal(run("dsmm-release.mjs", ["freeze", ...base, "--tarball", join(packed, identity.filename), "--receipt", receiptPath, "--output-dir", transport, "--source-checks", "COMPLETED"]).sha256, identity.sha256);
    assert.equal(run("dsmm-release.mjs", ["validate", ...base, "--artifact-dir", transport]).runAttempt, identity.runAttempt);
    // The real environment guard remains exercised; no authentication fallback is injected into product code.
    const originalMajor = process.versions.node.split(".")[0];
    if (originalMajor !== "24") {
      // Publisher Node is pinned to 24; host mismatch must refuse before submission.
      run("dsmm-release.mjs", ["publish", ...base, "--artifact-dir", transport, "--work-dir", join(root, "publish-refused")], 1);
      const current = JSON.parse(readFileSync(statePath, "utf8")); assert.equal(current.publishes, 0);
      current.published = true; writeFileSync(statePath, JSON.stringify(current));
    } else assert.equal(run("dsmm-release.mjs", ["publish", ...base, "--artifact-dir", transport, "--work-dir", join(root, "publish")]).outcome, "SUBMITTED_NOT_VERIFIED");
    const verificationPath = join(root, "verification.json");
    const verification = run("check-dsmm-release-completion.mjs", ["verify", "--artifact-dir", transport, "--receipt", verificationPath]);
    assert.equal(verification.outcome, "COMPLETED");
    const current = JSON.parse(readFileSync(statePath, "utf8")); current.verification = verification; writeFileSync(statePath, JSON.stringify(current));
    assert.equal(run("dsmm-release.mjs", ["transport", ...base, "--artifact-dir", transport]).releaseId, "44");
    assert.equal(run("dsmm-release.mjs", ["finalize", ...base, "--artifact-dir", transport, "--verification", verificationPath]).outcome, "PUBLIC_NOT_TERMINALLY_VERIFIED");
    const terminal = run("check-dsmm-release-completion.mjs", ["terminal", "--run-id", identity.runId, "--run-attempt", identity.runAttempt, "--control-sha", identity.controlSha, "--receipt", join(root, "terminal.json")]);
    assert.equal(terminal.outcome, "COMPLETED");
    const finished = JSON.parse(readFileSync(statePath, "utf8")); assert.equal(finished.packs, 1);
    assert.equal(finished.publishes, originalMajor === "24" ? 1 : 0);
    assert.equal(terminal.artifact.sha256, identity.sha256); assert.equal(terminal.artifact.receiptSha256, identity.receiptSha256);
    return { outcome: "COMPLETED", scope: "fixture-only-cli", publisherRuntime: originalMajor === "24" ? "SUBMISSION_EXERCISED" : "PINNED_RUNTIME_REFUSAL_EXERCISED", stages: 8 };
  } finally { cleanupOwnedRoot(owner); }
}
