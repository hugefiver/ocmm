// Test-only process carrier: every external operation is closed to fixture data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { PUBLICATION_JOBS } from "../scripts/release-recovery-policy.mjs";

assert.equal(process.env.DSMM_RELEASE_CLI_TEST, "fixture-only");
const fixture = JSON.parse(readFileSync(process.env.DSMM_RELEASE_CLI_FIXTURE, "utf8"));
const { identity, root } = fixture;
if (process.env.DSMM_RELEASE_CLI_PUBLISH_RUNTIME === "fixture-only") Object.defineProperty(process.versions, "node", { value: "24.0.0" });
assert.ok(resolve(process.env.DSMM_RELEASE_CLI_FIXTURE).startsWith(`${resolve(root)}\\`) || resolve(process.env.DSMM_RELEASE_CLI_FIXTURE).startsWith(`${resolve(root)}/`));
const statePath = join(root, "state.json");
const state = () => JSON.parse(readFileSync(statePath, "utf8"));
const save = (value) => writeFileSync(statePath, JSON.stringify(value));
const bytes = (name) => Buffer.from(fixture.accepted[name], "base64");
const result = (stdout = "") => ({ status: 0, stdout, stderr: "" });
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
const nativeSpawnSync = childProcess.spawnSync;
function tarball() { return bytes(identity.filename); }
childProcess.spawnSync = (command, args) => {
  const name = basename(command).replace(/\.exe$/u, "");
  const current = state(); current.commands.push([name, ...args]); save(current);
  if (name === "git") {
    const input = args.slice(2);
    if (input[0] === "rev-parse") return result(`${identity.releaseSha}\n`);
    if (input[0] === "status") return result(current.dirty ?? "");
    if (input[0] === "cat-file" || input[0] === "merge-base") return result();
    if (input[0] === "show") return result(JSON.stringify({ name: identity.packageName, version: identity.version }));
    throw Error("fixture refuses any Git write or unknown Git read");
  }
  if (name === "pnpm") {
    if (args.length === 1 && args[0] === "--version") return result("11.9.0\n");
    if (args[0] === "--dir" && args[2] === "pack") {
      assert.equal(args[3], "--pack-destination");
      const current = state(); current.packs++; save(current);
      writeFileSync(join(args[4], identity.filename), tarball(), { flag: "wx" }); return result();
    }
    if (args[0] === "publish") {
      assert.equal(hash(readFileSync(args[1])), identity.sha256);
      assert.ok(args.includes("--provenance") && args.includes("--ignore-scripts") && args.includes("--config.fetch-retries=0"));
       const current = state(); current.publishes++; current.published = true; save(current);
       return current.publishExit ? nativeSpawnSync(process.execPath,
         ["-e", 'process.stdout.write("submitted before nonzero exit"); process.exitCode = Number(process.argv[1]);', String(current.publishExit)],
         { encoding: "utf8", timeout: 5_000, windowsHide: true }) : result();
    }
    throw Error("fixture refuses installation or unknown pnpm operation");
  }
  if (name === "node" && basename(args[0]) === "dsmm-registry-install-probe.mjs") {
    assert.equal(args[2], identity.version); assert.equal(args[4], identity.sha256);
    writeFileSync(args[6], JSON.stringify(fixture.installReceipt), { flag: "wx" }); return result();
  }
  throw Error("fixture refuses every other subprocess");
};
function github(route) {
  const run = { id: Number(identity.runId), run_attempt: Number(identity.runAttempt), workflow_id: 374825007,
    repository: { full_name: identity.repository }, head_repository: { full_name: identity.repository },
    status: "completed", conclusion: "success", head_sha: identity.controlSha, head_branch: identity.tag, event: "push", ...state().run };
  if (route === `actions/runs/${identity.runId}/attempts/${identity.runAttempt}`) return run;
  if (route === "actions/workflows/374825007") return { id: 374825007, path: identity.workflow.file };
  if (route === `compare/${identity.controlSha}...master`) return { status: "identical", merge_base_commit: { sha: identity.controlSha } };
  if (route === `actions/runs/${identity.runId}/attempts/${identity.runAttempt}/jobs?per_page=100`) {
    const jobs = PUBLICATION_JOBS.map((name, index) => ({ id: index + 1, name, run_id: Number(identity.runId), run_attempt: Number(identity.runAttempt), status: "completed", conclusion: name === "import-bootstrap" || name.includes("recovery") ? "skipped" : "success", ...state().jobs?.[name] }));
    return { total_count: jobs.length, jobs };
  }
  if (route === `actions/runs/${identity.runId}/artifacts?per_page=100`) {
    const artifacts = ["accepted"].map((kind, index) => ({ id: index + 1, name: `dsmm-${kind}-${identity.runId}-${identity.runAttempt}`, expired: false,
      digest: `sha256:${hash(Buffer.from(`fixture-zip-${index + 1}`))}`, size_in_bytes: Buffer.byteLength(`fixture-zip-${index + 1}`),
      workflow_run: { id: Number(identity.runId), head_sha: identity.controlSha, head_branch: identity.tag } }));
    return { total_count: artifacts.length, artifacts };
  }
  if (route === `git/ref/tags/${identity.tag}`) return { ref: `refs/tags/${identity.tag}`, object: { type: "commit", sha: identity.releaseSha } };
  if (route === `releases/tags/${identity.tag}`) return state().release;
  throw Error("unknown fixture GitHub read");
}
childProcess.execFileSync = (command, args) => {
  if (command === "git") {
    assert.equal(args[0], "-C");
    if (args.length === 4 && args[2] === "rev-parse" && args[3] === "HEAD") return `${state().checkoutSha ?? identity.controlSha}\n`;
    if (args[2] === "cat-file") return "";
    if (args[2] === "show") return JSON.stringify({ name: identity.packageName, version: identity.version });
    throw Error("fixture refuses unknown Git read or write");
  }
  if (command === "gh") {
    assert.equal(args[0], "api"); const route = args[1].replace(`repos/${identity.repository}/`, "");
    if (/^actions\/artifacts\/[12]\/zip$/u.test(route)) return Buffer.from(`fixture-zip-${route.split("/")[2]}`);
    return JSON.stringify(github(route));
  }
  if (["tar", "unzip"].includes(command)) {
    const archivePath = args.find((value) => value.endsWith(".zip"));
    const proof = readFileSync(archivePath, "utf8") === "fixture-zip-2";
    const files = proof ? { "dsmm-registry-verification.json": Buffer.from(JSON.stringify(state().verification)).toString("base64") } : fixture.accepted;
    if (args[0] === "-tf" || args[0] === "-Z1") return `${Object.keys(files).join("\n")}\n`;
    const directory = args.at(-1);
    for (const [name, contents] of Object.entries(files)) writeFileSync(join(directory, name), Buffer.from(contents, "base64"), { flag: "wx" });
    return "";
  }
  throw Error("fixture refuses every other executable");
};
syncBuiltinESMExports();
const registryMetadata = () => ({ name: identity.packageName, version: identity.version, dist: { shasum: identity.sha1, integrity: identity.integrity,
  tarball: `https://registry.npmjs.org/@dsmm/dsmm/-/dsmm-${identity.version}.tgz`, attestations: { url: `https://registry.npmjs.org/-/npm/v1/attestations/@dsmm%2fdsmm@${identity.version}`, provenance: { predicateType: "https://slsa.dev/provenance/v1" } } } });
const statement = { _type: "https://in-toto.io/Statement/v1", predicateType: "https://slsa.dev/provenance/v1", subject: [{ name: `pkg:npm/%40dsmm/dsmm@${identity.version}`, digest: { sha512: Buffer.from(identity.integrity.slice(7), "base64").toString("hex") } }],
  predicate: { buildDefinition: { buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1", externalParameters: { workflow: { ref: identity.ref, repository: `https://github.com/${identity.repository}`, path: identity.workflow.file } },
    resolvedDependencies: [{ uri: `git+https://github.com/${identity.repository}@${identity.ref}`, digest: { gitCommit: identity.releaseSha } }] }, runDetails: { builder: { id: "https://github.com/actions/runner/github-hosted" }, metadata: { invocationId: `https://github.com/${identity.repository}/actions/runs/${identity.runId}/attempts/${identity.runAttempt}` } } } };
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input), current = state();
  if (url.hostname === "registry.npmjs.org") {
    assert.ok(!current.forbidRegistry, "no post-publication registry read is permitted");
    if (!current.published) return new Response(null, { status: 404 });
    if (url.pathname.endsWith(".tgz")) return new Response(tarball());
    if (url.pathname.startsWith("/-/npm/v1/attestations/")) return Response.json({ attestations: [{ predicateType: statement.predicateType, bundle: { dsseEnvelope: { payloadType: "application/vnd.in-toto+json", signatures: [{ sig: "synthetic-test-signature" }], payload: Buffer.from(JSON.stringify(statement)).toString("base64") } } }] });
    return Response.json(registryMetadata());
  }
  if (url.hostname === "api.github.com") {
    const route = url.pathname.replace(`/repos/${identity.repository}/`, "");
    if (route.startsWith("git/ref/tags/")) return Response.json(github(route));
    if (route === "releases" && options.method === "POST") {
      const body = JSON.parse(options.body); current.release = { ...body, id: 44, assets: [], draft: true, prerelease: false }; save(current); return Response.json(current.release);
    }
    if (route === "releases") return Response.json(current.release ? [current.release] : []);
    if (route === "releases/44" && options.method === "PATCH") { current.release = { ...current.release, ...JSON.parse(options.body) }; save(current); return Response.json(current.release); }
    if (route === "releases/44") return Response.json(current.release);
    if (route.startsWith("releases/assets/")) {
      const asset = current.release.assets.find(({ id }) => String(id) === route.split("/").at(-1)); return new Response(Buffer.from(current.assets[asset.name], "base64"));
    }
  }
  if (url.hostname === "uploads.github.com") {
    assert.equal(options.method, "POST"); const name = url.searchParams.get("name"), buffer = Buffer.from(options.body);
    assert.ok(!current.assets[name]); current.assets[name] = buffer.toString("base64");
    const asset = { id: 100 + current.release.assets.length, name, size: buffer.length, state: "uploaded", digest: `sha256:${hash(buffer)}`,
      browser_download_url: `https://github.com/${identity.repository}/releases/download/${identity.tag}/${name}` };
    current.release.assets.push(asset); save(current); return Response.json(asset);
  }
  if (url.hostname === "github.com") {
    const name = decodeURIComponent(url.pathname.split("/").at(-1)); assert.ok(current.assets[name]); return new Response(Buffer.from(current.assets[name], "base64"));
  }
  throw Error("fixture forbids all real network access");
};
