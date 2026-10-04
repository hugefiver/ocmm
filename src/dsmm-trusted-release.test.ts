import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  BOOTSTRAP, POLICY, UI_CHECKS, assertPublishEnvironment, assertSanitizedReceipt,
  computeDigests, deterministicChecksums, downloadBootstrap, finalizeRelease,
  expectedAssetNames, prepareTransport, publishArguments, publishArtifact, registryVersion, remotePeelTag, stageDraftTransport, verifyRemoteReleaseTag,
  resolveReleaseContext, validateArtifactDirectory, validateArtifactIdentity,
  validateDockerReceipt, validateRegistryMetadata, validateRegistryProvenance,
  validateTarballBuffer, validateTransportAssets, verifyRegistryArtifact,
} from "../scripts/dsmm-release.mjs";

type Json = Record<string, any>;

import { archive, archiveFiles, contextInput, makeAcceptedFixture, makeInstallFixture, packageFiles } from "./dsmm-trusted-release-fixtures.mjs";

test("two modes bind workflow control independently from immutable bootstrap source", () => {
  const bootstrap = resolveReleaseContext(contextInput(true));
  assert.equal(bootstrap.releaseSha, BOOTSTRAP.releaseSha); assert.notEqual(bootstrap.controlSha, bootstrap.releaseSha);
  assert.equal(bootstrap.provenance, false); assert.equal(bootstrap.origin, "frozen-local-bootstrap");
  const future = resolveReleaseContext(contextInput()); assert.equal(future.controlSha, future.releaseSha); assert.equal(future.provenance, true);
});

for (const [key, value] of Object.entries({ repository: "attacker/ocmm", eventName: "pull_request", ref: "refs/heads/master", workflowRef: "hugefiver/ocmm/evil.yml@refs/tags/dsmm-scoped-v0.1.3", workflowSha: "b".repeat(40), eventSha: "b".repeat(40), peeledSha: "b".repeat(40), packageVersion: "0.1.4", sourceInDefaultHistory: false, sourceHasControls: false, runId: "1;echo injected", runAttempt: "0", defaultBranch: "other" })) {
  test(`future identity rejects ${key}`, () => assert.throws(() => resolveReleaseContext({ ...contextInput(), [key]: value })));
}
for (const ref of ["refs/tags/dsmm-scoped-v01.2.3", "refs/tags/dsmm-scoped-v1.2.3-beta.1", "refs/tags/dsmm-scoped-v1.2.3+build", "refs/tags/dsmm-scoped-v1.2.3;touch-x", "refs/tags/dsmm-scoped-v0.1.2", "refs/tags/dsmm-scoped-v1.2.3/extra"]) {
  test(`canonical tag policy rejects ${ref}`, () => assert.throws(() => resolveReleaseContext({ ...contextInput(), ref, workflowRef: `${POLICY.repository}/${POLICY.workflowFile}@${ref}` })));
}
for (const [key, value] of Object.entries({ ref: "refs/heads/untrusted", peeledSha: "b".repeat(40), controlInDefaultHistory: false, controlSha: BOOTSTRAP.releaseSha, packageVersion: "0.1.3" })) {
  test(`bootstrap identity rejects ${key}`, () => assert.throws(() => resolveReleaseContext({ ...contextInput(true), [key]: value })));
}

test("version-aware package validation never executes manifest or compiled code", () => {
  const files = packageFiles(); files.set("lib/index.js", Buffer.from("throw new Error('MUST_NOT_EXECUTE')"));
  const accepted = validateTarballBuffer(archiveFiles(files), { version: "0.1.3" });
  assert.equal(accepted.version, "0.1.3"); assert.ok(accepted.fileCount > 40);
  assert.throws(() => validateTarballBuffer(archiveFiles(files), { version: "0.1.4" }), /version/);
  assert.throws(() => validateTarballBuffer(archiveFiles(files), { version: "0.1.3", expectedDigests: { sha256: "0".repeat(64) } }), /sha256/);
});

for (const path of ["package/../outside", "/absolute", "package/C:/evil", "package/skills\\evil", "package/test/example.test.ts", "package/.npmrc", "package/skills/.env", "package/credentials.json", "package/skills/nested.tgz", "package/src/source.ts", "package/docs/superpowers/plan.md"]) {
  test(`tar policy rejects ${path}`, () => {
    const entries = [...packageFiles()].map(([name, bytes]) => ({ name: `package/${name}`, bytes }));
    entries.push({ name: path, bytes: Buffer.from("unsafe") });
    assert.throws(() => validateTarballBuffer(archive(entries), { version: "0.1.3" }));
  });
}
test("archive structural checks reject links, duplicates, extended metadata and appended payloads", () => {
  const entries = [...packageFiles()].map(([name, bytes]) => ({ name: `package/${name}`, bytes }));
  for (const type of ["1", "2", "3", "4", "x", "L"]) assert.throws(() => validateTarballBuffer(archive([...entries, { name: "package/skills/unsafe", bytes: Buffer.alloc(0), type, link: "../secret" }]), { version: "0.1.3" }));
  assert.throws(() => validateTarballBuffer(archive([...entries, entries[0]]), { version: "0.1.3" }), /duplicate/);
  const tar = gunzipSync(archive(entries)); tar[0] ^= 1;
  assert.throws(() => validateTarballBuffer(gzipSync(tar), { version: "0.1.3" }), /checksum/);
  assert.throws(() => validateTarballBuffer(gzipSync(Buffer.concat([gunzipSync(archive(entries)), Buffer.alloc(512, 1)])), { version: "0.1.3" }), /appended/);
});
test("manifest policy rejects missing surfaces, package export changes and lifecycle execution", () => {
  for (const change of [(files: Map<string, Buffer>) => files.delete("lib/profile-store.js"), (files: Map<string, Buffer>) => {
    const manifest = JSON.parse(files.get("package.json")!.toString()); manifest.exports["./client"] = "./src/client.ts"; files.set("package.json", Buffer.from(JSON.stringify(manifest)));
  }, (files: Map<string, Buffer>) => {
    const manifest = JSON.parse(files.get("package.json")!.toString()); manifest.scripts.prepare = "evil"; files.set("package.json", Buffer.from(JSON.stringify(manifest)));
  }]) { const files = packageFiles(); change(files); assert.throws(() => validateTarballBuffer(archiveFiles(files), { version: "0.1.3" })); }
});

test("completed Docker acceptance binds substantive exact artifact evidence", () => {
  const { receipt, identity } = makeAcceptedFixture(); const accepted = validateDockerReceipt(receipt, identity);
  assert.equal(accepted.uiCheckCount, 14); assert.equal(accepted.sourceUnitTests, "NOT_RUN"); assert.equal(accepted.realAuthentication, "NOT_EXERCISED");
});

const receiptMutations: [string, (r: Json) => void][] = [
  ["top-level only", (r) => { delete r.native; }], ["initial hash", (r) => { r.artifact.sha256 = "b".repeat(64); }],
  ["container-final hash", (r) => { r.artifact.sha256After = "b".repeat(64); }], ["host-final hash", (r) => { r.artifact.hostSha256After = "b".repeat(64); }],
  ["failed native web", (r) => { r.native.web.outcome = "FAILED"; }], ["failed native headless", (r) => { r.native.headless.outcome = "FAILED"; }],
  ["wrong installed version", (r) => { r.installedPackages[0].version = "0.1.2"; }], ["metadata retention", (r) => { r.native.web.persistence.sessions[0].visibleHistoryUnchanged = false; }],
  ["different persistence root", (r) => { r.native.web.persistence.config.root = "/not/baseline"; }],
  ["source test overclaim", (r) => { r.sourceUnitTests.outcome = "COMPLETED"; }], ["real auth overclaim", (r) => { r.uiProfiles.authentication.signedIn = true; }],
  ["extra UI check", (r) => { r.uiProfiles.checks.extra = true; }], ["native RPC missing", (r) => { r.uiProfiles.nativeCalls = []; }],
  ["session/control cleanup", (r) => { r.uiProfiles.nativeStreams[0].disposed = false; }], ["UI cleanup error", (r) => { r.uiProfiles.cleanup.errors = ["failure"]; }],
  ["session-history retention", (r) => { r.sessionHistory.retainedModelVisibleHistory = false; }], ["LSP not run", (r) => { r.lsp.outcome = "NOT_RUN"; }],
  ["sentinel mutation", (r) => { r.profileLifecycle.unrelatedSentinelsUnchanged = false; }], ["home cleanup", (r) => { r.temporaryHomesRemoved = false; }],
  ["image cleanup", (r) => { r.runtimeImage.cleanup = "FAILED"; }], ["contradicting failure", (r) => { r.cleanupFailures = ["failure"]; }],
  ...UI_CHECKS.map((key: string): [string, (r: Json) => void] => [`UI ${key}`, (r) => { r.uiProfiles.checks[key] = false; }]),
];
for (const [name, mutate] of receiptMutations) test(`receipt rejects ${name}`, () => { const fixture = makeAcceptedFixture(); mutate(fixture.receipt); assert.throws(() => validateDockerReceipt(fixture.receipt, fixture.identity)); });
test("receipt publication scan refuses credentials without redacting evidence", () => {
  for (const material of [{ token: "private" }, { apiKey: "private" }, { launchToken: "private" }, { note: "https://host/?launchToken=private" }, { note: "Bearer secretValue" }]) assert.throws(() => assertSanitizedReceipt(material));
  assert.doesNotThrow(() => assertSanitizedReceipt({ tokenCount: 100 }));
});

test("exact transport checksums bind both frozen inputs without modifying bytes", () => {
  const { identity, release, assets } = makeAcceptedFixture();
  const before = new Map([...assets].map(([name, value]) => [name, computeDigests(value).sha256]));
  assert.equal(validateTransportAssets(release, assets, identity).releaseId, "44");
  assert.deepEqual([...assets].map(([name, value]) => [name, computeDigests(value).sha256]), [...before]);
  assert.equal(deterministicChecksums(identity).toString().split("\n").filter(Boolean).length, 2);
  assert.throws(() => validateTransportAssets({ ...release, draft: false }, assets, identity), /draft/);
  assert.doesNotThrow(() => validateTransportAssets({ ...release, draft: false }, assets, identity, { requireDraft: false }));
});
test("missing/extra/partial/conflicting asset state fails closed", () => {
  const { identity, release, assets } = makeAcceptedFixture();
  for (const mutation of [(r: Json) => { r.assets.pop(); }, (r: Json) => { r.assets.push({ id: 999, name: "extra.txt", size: 1, state: "uploaded" }); }, (r: Json) => { r.assets[0].state = "starter"; }, (r: Json) => { r.tag_name = "dsmm-scoped-v0.1.4"; }, (r: Json) => { r.assets[0].digest = `sha256:${"0".repeat(64)}`; }]) {
    const altered = structuredClone(release); mutation(altered); assert.throws(() => validateTransportAssets(altered, assets, identity));
  }
  const changed = new Map(assets); changed.set(POLICY.checksumsFilename, Buffer.from(`${identity.sha256}  ${identity.filename}\n`));
  assert.throws(() => validateTransportAssets(release, changed, identity), /size|checksum|digest/);
});
test("standalone identities reject altered mode, source, workflow, run and provenance", () => {
  const { identity, context } = makeAcceptedFixture();
  for (const [key, value] of Object.entries({ controlSha: "b".repeat(40), workflow: { ...identity.workflow, ref: "wrong" }, provenance: false, eventName: "workflow_dispatch", ref: "refs/heads/master", eventSha: "b".repeat(40), receiptSha256: "bad", sourceChecks: "NOT_RUN" })) assert.throws(() => validateArtifactIdentity({ ...identity, [key]: value }));
  assert.throws(() => validateArtifactIdentity({ ...identity, runAttempt: "2" }, { context }), /runAttempt/);
  assert.throws(() => validateArtifactIdentity({ ...identity, mode: "bootstrap", origin: "frozen-local-bootstrap", provenance: false }));
});
test("freeze creates exact run artifact files non-overwriting and validates on download", () => {
  const { context, tarball, receiptBytes } = makeAcceptedFixture(); const root = mkdtempSync(join(tmpdir(), "dsmm-control-test-"));
  try {
    const tarballPath = join(root, "input.tgz"); const receiptPath = join(root, "input.json"); writeFileSync(tarballPath, tarball); writeFileSync(receiptPath, receiptBytes);
    assert.throws(() => prepareTransport(join(root, "failed"), context, { tarballPath, receiptPath }), /source-check/);
    const directory = join(root, "accepted"); const identity = prepareTransport(directory, context, { tarballPath, receiptPath, sourceChecks: "COMPLETED" });
    assert.deepEqual(validateArtifactDirectory(directory, context), identity);
    assert.throws(() => prepareTransport(directory, context, { tarballPath, receiptPath, sourceChecks: "COMPLETED" }), /initially empty/);
    writeFileSync(join(directory, "extra"), "untrusted"); assert.throws(() => validateArtifactDirectory(directory, context), /file set/);
    assert.equal(computeDigests(readFileSync(tarballPath)).sha256, identity.sha256);
  } finally { rmSync(root, { recursive: true, force: false }); }
});

const oidcEnvironment = () => ({ GITHUB_ACTIONS: "true", ACTIONS_ID_TOKEN_REQUEST_URL: "https://run.actions.githubusercontent.com/token", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "test-only", GITHUB_TOKEN: "read-repo-test-only" });
test("publication requires actual OIDC variables with no static/npm fallback", () => {
  assert.doesNotThrow(() => assertPublishEnvironment(oidcEnvironment()));
  assert.throws(() => assertPublishEnvironment({}), /GitHub Actions/);
  assert.throws(() => assertPublishEnvironment({ ...oidcEnvironment(), ACTIONS_ID_TOKEN_REQUEST_TOKEN: "" }), /OIDC/);
  for (const key of ["NPM_TOKEN", "NODE_AUTH_TOKEN", "npm_config_//registry.npmjs.org/:_authToken", "NPM_CONFIG_tokenHelper", "PNPM_TOKEN"]) assert.throws(() => assertPublishEnvironment({ ...oidcEnvironment(), [key]: "private" }), /static/);
  assert.throws(() => assertPublishEnvironment({ ...oidcEnvironment(), ACTIONS_ID_TOKEN_REQUEST_URL: "https://attacker.example/token" }), /endpoint/);
});
test("publication uses a validated existing tarball with explicit mode-correct provenance", () => {
  const { identity } = makeAcceptedFixture(); const args = publishArguments(identity, join(tmpdir(), identity.filename));
  assert.ok(args.includes("--provenance")); assert.ok(args.includes("--ignore-scripts")); assert.ok(args.includes("--no-git-checks")); assert.ok(!args.includes("--force"));
  assert.throws(() => publishArguments(identity, "/package-directory"), /filename/);
  const bootstrap: Json = { ...identity, ...resolveReleaseContext(contextInput(true)), ...BOOTSTRAP, receiptSize: 123,
    receiptFilename: POLICY.receiptFilename, dockerAcceptance: { outcome: "COMPLETED", origin: "imported-local-receipt" }, sourceChecks: "NOT_RUN_FROZEN_BOOTSTRAP" };
  assert.ok(publishArguments(bootstrap, join(tmpdir(), bootstrap.filename)).includes("--config.provenance=false"));
  assert.throws(() => publishArguments({ ...bootstrap, provenance: true }, join(tmpdir(), bootstrap.filename)), /provenance/);
});

async function withArtifactDirectory(callback: (fixture: ReturnType<typeof makeAcceptedFixture>, directory: string, root: string) => Promise<void>) {
  const fixture = makeAcceptedFixture(); const root = mkdtempSync(join(tmpdir(), "dsmm-control-publish-test-"));
  try {
    const tarballPath = join(root, "input.tgz"), receiptPath = join(root, "input.json");
    writeFileSync(tarballPath, fixture.tarball); writeFileSync(receiptPath, fixture.receiptBytes);
    const directory = join(root, "accepted");
    prepareTransport(directory, fixture.context, { tarballPath, receiptPath, sourceChecks: "COMPLETED" });
    await callback(fixture, directory, root);
  } finally { rmSync(root, { recursive: true, force: false }); }
}

test("keyless publisher isolates config/home, publishes once and preserves frozen bytes", async () => {
  await withArtifactDirectory(async ({ context, identity }, directory, root) => {
    const calls: string[][] = [];
    const result = await publishArtifact(directory, context, join(root, "publish"), { nodeVersion: "24.1.0", env: { ...oidcEnvironment(), HOME: "/not-read", npm_config_userconfig: "/not-read/.npmrc", PNPM_HOME: "/not-used" },
      fetcher: async () => new Response("", { status: 404 }),
      request: async () => ({ ref: `refs/tags/${identity.tag}`, object: { type: "commit", sha: identity.releaseSha } }),
      execute: (_command: string, args: string[], options: Json) => {
        calls.push(args);
        assert.ok(options.env.HOME.startsWith(root)); assert.equal(options.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, "test-only");
        assert.equal(options.env.PNPM_HOME, undefined); assert.equal(options.env.NODE_AUTH_TOKEN, undefined);
        assert.equal(readFileSync(options.env.npm_config_userconfig, "utf8").includes("_auth"), false);
        assert.ok(options.env.npm_config_userconfig.startsWith(root));
        assert.equal(readFileSync(options.env.npm_config_globalconfig, "utf8"), "");
        return args[0] === "--version" ? "11.9.0" : "sanitized-success";
      } });
    assert.equal(result.outcome, "SUBMITTED_NOT_VERIFIED"); assert.equal(calls.filter((args) => args[0] === "publish").length, 1);
    assert.ok(calls[1].includes("--config.fetch-retries=0"));
    assert.equal(computeDigests(readFileSync(join(directory, identity.filename))).sha256, identity.sha256);
  });
});
test("OIDC failure, version conflict, wrong pnpm or changed frozen bytes never trigger a publish retry", async () => {
  await withArtifactDirectory(async ({ context, identity }, directory, root) => {
    let publishCalls = 0;
    const runtime = { nodeVersion: "24.1.0", env: oidcEnvironment(), fetcher: async () => new Response("", { status: 404 }),
      request: async () => ({ ref: `refs/tags/${identity.tag}`, object: { type: "commit", sha: identity.releaseSha } }), execute: (_command: string, args: string[]) => {
      if (args[0] === "--version") return "11.9.0"; publishCalls++; throw new Error("OIDC exchange rejected");
    } };
    await assert.rejects(publishArtifact(directory, context, join(root, "oidc-failure"), runtime), /no retry/); assert.equal(publishCalls, 1);
    await assert.rejects(publishArtifact(directory, context, join(root, "conflict"), { ...runtime, fetcher: async () => Response.json({ version: identity.version }) }), /already exists/); assert.equal(publishCalls, 1);
    await assert.rejects(publishArtifact(directory, context, join(root, "wrong-pnpm"), { ...runtime, execute: () => "11.8.0" }), /pnpm/); assert.equal(publishCalls, 1);
    writeFileSync(join(directory, identity.filename), "changed-before-publication");
    await assert.rejects(publishArtifact(directory, context, join(root, "changed"), runtime), /artifact size|artifact sha256/); assert.equal(publishCalls, 1);
  });
});
test("future draft staging refuses even matching pre-existing and partial Releases without mutation", async () => {
  await withArtifactDirectory(async ({ context, release }, directory) => {
    let writes = 0;
    await assert.rejects(stageDraftTransport(directory, context, async (_path: string, options: Json = {}) => {
      if (options.method) writes++; return release;
    }, async () => { writes++; }), /already exists/);
    assert.equal(writes, 0);
  });
});
test("remote tags peel lightweight and nested annotated refs only in the fixed repository", async () => {
  const { identity } = makeAcceptedFixture(); const paths: string[] = [];
  const request = async (path: string) => {
    paths.push(path);
    if (path.includes("/git/ref/")) return { ref: `refs/tags/${identity.tag}`, object: { type: "tag", sha: "b".repeat(40) } };
    if (path.endsWith("b".repeat(40))) return { sha: "b".repeat(40), object: { type: "tag", sha: "c".repeat(40) } };
    return { sha: "c".repeat(40), object: { type: "commit", sha: identity.releaseSha } };
  };
  assert.equal(await remotePeelTag(identity.tag, request), identity.releaseSha);
  assert.equal((await verifyRemoteReleaseTag(identity, request)).releaseSha, identity.releaseSha);
  assert.ok(paths.every((path) => path.startsWith(`/repos/${POLICY.repository}/git/`)));
});
test("remote tag changes, deletions, cycles, object mismatch and non-commit targets fail closed", async () => {
  const { identity } = makeAcceptedFixture();
  for (const target of [{ type: "commit", sha: "b".repeat(40) }, { type: "tree", sha: identity.releaseSha }, { type: "blob", sha: identity.releaseSha }, { type: "commit", sha: "invalid" }]) {
    await assert.rejects(verifyRemoteReleaseTag(identity, async () => ({ ref: `refs/tags/${identity.tag}`, object: target })));
  }
  await assert.rejects(verifyRemoteReleaseTag(identity, async () => { throw Error("404 deleted tag"); }), /deleted/);
  await assert.rejects(remotePeelTag(identity.tag, async (path: string) => path.includes("/git/ref/")
    ? { ref: `refs/tags/${identity.tag}`, object: { type: "tag", sha: "b".repeat(40) } }
    : { sha: "b".repeat(40), object: { type: "tag", sha: "b".repeat(40) } }), /cycle/);
  await assert.rejects(remotePeelTag(identity.tag, async (path: string) => path.includes("/git/ref/")
    ? { ref: `refs/tags/${identity.tag}`, object: { type: "tag", sha: "b".repeat(40) } }
    : { sha: "c".repeat(40), object: { type: "commit", sha: identity.releaseSha } }), /identity/);
});
test("moved remote tag prevents registry upload and draft creation despite matching local identity", async () => {
  await withArtifactDirectory(async ({ context, identity }, directory, root) => {
    let published = 0, created = 0, uploaded = 0;
    const moved = { ref: `refs/tags/${identity.tag}`, object: { type: "commit", sha: "b".repeat(40) } };
    await assert.rejects(publishArtifact(directory, context, join(root, "publish"), { nodeVersion: "24.1.0", env: oidcEnvironment(),
      fetcher: async () => new Response("", { status: 404 }), request: async () => moved,
      execute: (_command: string, args: string[]) => { if (args[0] === "publish") published++; return "11.9.0"; } }), /remote immutable/);
    await assert.rejects(stageDraftTransport(directory, context, async (path: string, options: Json = {}) => {
      if (options.method === "POST") created++;
      return path.includes("/git/ref/") ? moved : null;
    }, async () => { uploaded++; }), /remote immutable/);
    assert.equal(published, 0); assert.equal(created, 0); assert.equal(uploaded, 0);
  });
});
test("tag changing after draft creation preserves partial draft and blocks every asset upload", async () => {
  await withArtifactDirectory(async ({ context, identity }, directory) => {
    let created = 0, uploaded = 0;
    await assert.rejects(stageDraftTransport(directory, context, async (path: string, options: Json = {}) => {
      if (options.method === "POST") { created++; return { id: 55 }; }
      if (path.includes("/git/ref/")) return { ref: `refs/tags/${identity.tag}`, object: { type: "commit", sha: created ? "b".repeat(40) : identity.releaseSha } };
      return null;
    }, async () => { uploaded++; }), /remote immutable/);
    assert.equal(created, 1); assert.equal(uploaded, 0);
  });
});

test("moved or deleted remote tag after asset and registry proof blocks public Release PATCH", async () => {
  await withArtifactDirectory(async (fixture, directory) => {
    const { context, identity, release, assets } = fixture;
    const verification = { outcome: "COMPLETED",
      identity: Object.fromEntries(["sha256", "receiptSha256", "runId", "runAttempt", "controlSha", "releaseSha"].map((name) => [name, identity[name]])),
      registry: { outcome: "COMPLETED", name: POLICY.packageName, version: identity.version, ...computeDigests(fixture.tarball) },
      freshInstall: makeInstallFixture(fixture) };
    for (const deleted of [false, true]) {
      let patches = 0, assetReads = 0, registryReads = 0, tagReads = 0;
      const request = async (path: string, options: Json = {}) => {
        if (options.method === "PATCH") { patches++; return { ...release, draft: false }; }
        if (path.includes("/git/ref/")) {
          tagReads++; assert.equal(assetReads, 3); assert.equal(registryReads, 1);
          if (deleted) throw new Error("remote tag was deleted");
          return { ref: `refs/tags/${identity.tag}`, object: { type: "commit", sha: "b".repeat(40) } };
        }
        if (options.binary) {
          const id = Number(path.split("/").at(-1)); const asset = release.assets.find((entry: Json) => entry.id === id);
          assert.ok(asset); assetReads++; return assets.get(asset.name);
        }
        return release;
      };
      await assert.rejects(finalizeRelease(directory, context, verification, request, { registryCheck: async (expected: Json) => {
        registryReads++; assert.equal(expected.sha256, computeDigests(fixture.tarball).sha256);
        validateTarballBuffer(fixture.tarball, { version: expected.version, expectedDigests: expected });
        return verification.registry;
      } }), deleted ? /deleted/ : /remote immutable/);
      assert.equal(tagReads, 1); assert.equal(patches, 0); assert.equal(assetReads, 3); assert.equal(registryReads, 1);
    }
  });
});
test("registry absence checks are read-only, conflict explicit, network failures closed", async () => {
  assert.equal(await registryVersion("0.1.3", async () => new Response("", { status: 404 })), null);
  assert.deepEqual(await registryVersion("0.1.3", async () => Response.json({ name: POLICY.packageName })), { name: POLICY.packageName });
  await assert.rejects(registryVersion("0.1.3", async () => new Response("", { status: 503 })), /forbidden/);
});

export function provenanceFixture(identity: Json): Json {
  const statement = { _type: "https://in-toto.io/Statement/v1", predicateType: "https://slsa.dev/provenance/v1",
    subject: [{ name: `pkg:npm/%40dsmm/dsmm@${identity.version}`, digest: { sha512: Buffer.from(identity.integrity.slice(7), "base64").toString("hex") } }],
    predicate: { buildDefinition: { buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
      externalParameters: { workflow: { ref: identity.ref, repository: `https://github.com/${POLICY.repository}`, path: POLICY.workflowFile } },
      resolvedDependencies: [{ uri: `git+https://github.com/${POLICY.repository}@${identity.ref}`, digest: { gitCommit: identity.releaseSha } }] },
      runDetails: { builder: { id: "https://github.com/actions/runner/github-hosted" }, metadata: { invocationId: `https://github.com/${POLICY.repository}/actions/runs/${identity.runId}/attempts/${identity.runAttempt}` } } } };
  return { attestations: [{ predicateType: statement.predicateType, bundle: { dsseEnvelope: { payloadType: "application/vnd.in-toto+json", payload: Buffer.from(JSON.stringify(statement)).toString("base64"), signatures: [{ sig: "fixture-signature-not-cryptographic-proof" }] } } }] };
}
test("registry metadata+bytes+provenance must all bind the exact future artifact", async () => {
  const { identity, tarball } = makeAcceptedFixture();
  const metadata = { name: POLICY.packageName, version: identity.version, dist: { shasum: identity.sha1, integrity: identity.integrity,
    tarball: `${POLICY.registry}@dsmm/dsmm/-/dsmm-${identity.version}.tgz`, attestations: { url: `${POLICY.registry}-/npm/v1/attestations/@dsmm%2fdsmm@${identity.version}`, provenance: { predicateType: "https://slsa.dev/provenance/v1" } } } };
  const fetcher = async (url: string) => url === metadata.dist.tarball ? new Response(tarball) : url === metadata.dist.attestations.url ? Response.json(provenanceFixture(identity)) : Response.json(metadata);
  const verified = await verifyRegistryArtifact(identity, fetcher); assert.equal(verified.sha256, identity.sha256); assert.equal(verified.provenance.independentSigstoreVerification, false);
  assert.throws(() => validateRegistryMetadata({ ...metadata, dist: { ...metadata.dist, shasum: "0".repeat(40) } }, identity), /SHA1/);
  await assert.rejects(verifyRegistryArtifact(identity, async (url: string) => url === metadata.dist.tarball ? new Response(Buffer.from("changed")) : Response.json(metadata)), /size|sha256/);
  await assert.rejects(verifyRegistryArtifact(identity, async (url: string) => url === metadata.dist.tarball ? new Response(tarball) : Response.json({ ...metadata, dist: { ...metadata.dist, attestations: undefined } })), /attestation/);
});
test("provenance binding fails on source/workflow/subject/run disagreement without claiming independent signature verification", () => {
  const { identity } = makeAcceptedFixture(); assert.equal(validateRegistryProvenance(provenanceFixture(identity), identity).sourceSha, identity.releaseSha);
  for (const field of ["subject", "workflow", "source", "run"]) {
    const evidence = provenanceFixture(identity); const envelope = evidence.attestations[0].bundle.dsseEnvelope; const statement = JSON.parse(Buffer.from(envelope.payload, "base64").toString());
    if (field === "subject") statement.subject[0].digest.sha512 = "0".repeat(128);
    if (field === "workflow") statement.predicate.buildDefinition.externalParameters.workflow.path = "evil.yml";
    if (field === "source") statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = "b".repeat(40);
    if (field === "run") statement.predicate.runDetails.metadata.invocationId += "-wrong";
    envelope.payload = Buffer.from(JSON.stringify(statement)).toString("base64"); assert.throws(() => validateRegistryProvenance(evidence, identity));
  }
});
test("bootstrap download fails before writes on wrong assets or failed receipt", async () => {
  const context = resolveReleaseContext(contextInput(true)); const root = mkdtempSync(join(tmpdir(), "dsmm-control-download-"));
  try {
    await assert.rejects(downloadBootstrap(join(root, "empty"), context, async () => ({ id: 1, tag_name: BOOTSTRAP.tag, draft: true, assets: [] })), /asset names/);
    assert.deepEqual(expectedAssetNames(BOOTSTRAP.version), [POLICY.checksumsFilename, POLICY.receiptFilename, BOOTSTRAP.filename]);
  } finally { rmSync(root, { recursive: true, force: false }); }
});
