import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
// @ts-expect-error Source-only recovery policy.
import { RECOVERY_022 as fixed, PUBLICATION_TOPOLOGY, PUBLICATION_JOBS, dispatchSelector, selectAcceptedArtifact } from "../scripts/release-recovery-policy.mjs";
// @ts-expect-error Source-only release control.
import { BOOTSTRAP, resolveReleaseContext, githubRequest } from "../scripts/dsmm-release.mjs";
// @ts-expect-error Source-only recovery admission.
import { assertRecoveryAdmission, validateRecoveryOrigin } from "../scripts/release-recovery-022.mjs";
// @ts-expect-error Source-only source guard.
import { assertPackSource, PACK_INPUTS } from "../scripts/release-source.mjs";
// @ts-expect-error Workflow executable gate seam.
import { nativeGateArguments, parseNativeGateOptions, runNativeGate } from "../scripts/release-native-gate.mjs";
// @ts-expect-error Original complete acceptance argument parser.
import { parseArtifactOptions } from "../scripts/docker-smoke.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
function contextInput() {
  return { repository: fixed.repository, packageVersion: fixed.version, defaultBranch: "master", inputs: { recovery: fixed.selector },
    eventName: "workflow_dispatch", ref: "refs/heads/master", eventSha: "a".repeat(40), controlSha: "a".repeat(40), workflowSha: "a".repeat(40),
    workflowRef: `${fixed.repository}/.github/workflows/dsmm-release.yml@refs/heads/master`, peeledSha: fixed.releaseSha,
    runId: "900001", runAttempt: "1", controlInDefaultHistory: true };
}
function context() { return resolveReleaseContext(contextInput()); }
function origin() {
  const run = { id: Number(fixed.runId), run_attempt: 1, repository: { full_name: fixed.repository }, head_repository: { full_name: fixed.repository },
    workflow_id: fixed.workflowId, status: "completed", conclusion: "failure", event: "push", head_sha: fixed.releaseSha, head_branch: fixed.tag };
  const workflow = { id: fixed.workflowId, path: ".github/workflows/dsmm-release.yml" };
  const jobs = ["import-bootstrap", "prepare", "publish", "verify", "github-release"].map((name, index) => ({ id: index + 1, name,
    run_id: Number(fixed.runId), run_attempt: 1, status: "completed", conclusion: name === "prepare" ? "failure" : "skipped" }));
  return { run, attempt: structuredClone(run), workflow, jobs, artifacts: [] as any[] };
}
function requestFixture(f = origin()) {
  const calls: string[] = [];
  return { calls, request: async (path: string, options: any = {}) => {
    calls.push(path); assert.equal(options.method, undefined, "admission must only GET");
    if (path === `/repos/${fixed.repository}`) return { full_name: fixed.repository, default_branch: "master" };
    if (path.includes("/compare/")) return { status: "ahead", merge_base_commit: { sha: context().controlSha } };
    if (path.endsWith(`/actions/runs/${fixed.runId}`)) return f.run;
    if (path.endsWith(`/actions/runs/${fixed.runId}/attempts/1`)) return f.attempt;
    if (path.endsWith(`/actions/workflows/${fixed.workflowId}`)) return f.workflow;
    if (path.includes("/jobs?")) return { total_count: f.jobs.length, jobs: f.jobs };
    if (path.includes("/artifacts?")) return { total_count: f.artifacts.length, artifacts: f.artifacts };
    if (path.includes("/git/ref/")) return { ref: `refs/tags/${fixed.tag}`, object: { type: "commit", sha: fixed.releaseSha } };
    if (path.includes("/releases?")) return [];
    throw Error(`unexpected read ${path}`);
  } };
}
const absent = async () => new Response(null, { status: 404 });

test("fixed recovery resolution separates product source, control and stable cross-job identity", () => {
  const c = context(); assert.equal(c.mode, "recovery-022"); assert.equal(c.releaseSha, fixed.releaseSha);
  assert.equal(c.provenance, true); assert.equal(c.releaseTopology, PUBLICATION_TOPOLOGY);
  assert.notEqual(c.controlSha, c.releaseSha); assert.equal(c.workflow.sha, c.eventSha);
  assert.ok(!Object.keys(c).some(key => /root|path|absence|directory/iu.test(key)));
  for (const change of [{ peeledSha: "b".repeat(40) }, { controlSha: fixed.releaseSha, workflowSha: fixed.releaseSha, eventSha: fixed.releaseSha },
    { eventSha: "b".repeat(40) }, { workflowSha: "b".repeat(40) }, { ref: "refs/heads/other" }, { eventName: "push" },
    { packageVersion: "0.2.1" }, { controlInDefaultHistory: false }, { runId: fixed.runId }, { inputs: { recovery: "other" } }, { inputs: { extra: "" } }]) {
    assert.throws(() => resolveReleaseContext({ ...contextInput(), ...change }));
  }
  for (const inputs of [undefined, {}, { recovery: "" }]) {
    assert.equal(dispatchSelector(inputs), null);
    const bootstrap = resolveReleaseContext({ ...contextInput(), inputs, peeledSha: BOOTSTRAP.releaseSha, packageVersion: BOOTSTRAP.version });
    assert.equal(bootstrap.mode, "bootstrap"); assert.equal(bootstrap.provenance, false); assert.equal(bootstrap.releaseTopology, PUBLICATION_TOPOLOGY);
  }
  for (const inputs of [null, [], { recovery: true }, { recovery: "unpublished-0.2.1" }, { source: fixed.releaseSha }]) assert.throws(() => dispatchSelector(inputs));
});

test("admission verifies original latest attempt, terminal jobs, remote tag and complete absence without writes", async () => {
  const f = requestFixture(); let registryReads = 0;
  assert.equal((await assertRecoveryAdmission(context(), { request: f.request, fetcher: async () => { registryReads++; return absent(); } })).outcome, "ADMITTED_NOT_PUBLISHED");
  assert.equal(registryReads, 1);
  assert.equal(f.calls.filter(path => path.endsWith(`/actions/runs/${fixed.runId}`)).length, 2);
  for (const change of [
    (f: any) => { f.run.run_attempt = 2; }, (f: any) => { f.attempt.run_attempt = 2; },
    (f: any) => { f.jobs[2].conclusion = "success"; }, (f: any) => { f.jobs[0].conclusion = "success"; },
    (f: any) => { f.jobs[1].status = "in_progress"; }, (f: any) => { f.run.head_sha = context().controlSha; },
    (f: any) => { f.jobs[2].run_attempt = 2; }, (f: any) => { f.jobs.pop(); },
    (f: any) => { f.artifacts.push({ id: 99, name: `dsmm-accepted-${fixed.runId}-1`, expired: true }); },
  ]) {
    const state = origin(); change(state);
    assert.throws(() => validateRecoveryOrigin(state.run, state.attempt, state.workflow, state.jobs, state.artifacts));
    await assert.rejects(assertRecoveryAdmission(context(), { request: requestFixture(state).request, fetcher: absent }));
  }
});

test("recovery admission never interprets an existing version, hidden draft, incomplete pagination or transport failure as absent", async () => {
  const base = requestFixture().request;
  for (const fetcher of [async () => Response.json({ version: fixed.version }), async () => new Response(null, { status: 503 }), async () => { throw Error("offline"); }]) {
    await assert.rejects(assertRecoveryAdmission(context(), { request: base, fetcher }));
  }
  for (const scenario of ["draft", "public", "incomplete-jobs", "incomplete-artifacts", "release-error", "tag", "ancestry", "attempt-race"]) {
    let reads = 0;
    await assert.rejects(assertRecoveryAdmission(context(), { fetcher: absent, request: async (path: string) => {
      if (scenario === "attempt-race" && path.endsWith(`/actions/runs/${fixed.runId}`) && ++reads === 2) return { ...origin().run, run_attempt: 2 };
      if (scenario === "ancestry" && path.includes("/compare/")) return { status: "diverged" };
      if (scenario === "tag" && path.includes("/git/ref/")) return { ref: `refs/tags/${fixed.tag}`, object: { type: "commit", sha: context().controlSha } };
      if (scenario === "incomplete-jobs" && path.includes("/jobs?")) return { total_count: 6, jobs: origin().jobs };
      if (scenario === "incomplete-artifacts" && path.includes("/artifacts?")) return { total_count: 1, artifacts: [] };
      if (["draft", "public"].includes(scenario) && path.includes("/releases")) return path.includes("?")
        ? [{ id: 42, tag_name: fixed.tag, draft: scenario === "draft", prerelease: false }]
        : { id: 42, tag_name: fixed.tag, draft: scenario === "draft", prerelease: false };
      if (scenario === "release-error" && path.includes("/releases?")) throw Error("no draft permission");
      return base(path);
    } }));
  }
});

test("recovery GET pagination is limited to fixed origin endpoints and draft reads require authentication", async () => {
  const original = globalThis.fetch; const calls: any[] = [];
  try {
    globalThis.fetch = async (url, options) => { calls.push([url, options]); return Response.json({}); };
    await githubRequest(`/repos/${fixed.repository}/actions/runs/${fixed.runId}/attempts/1/jobs?per_page=100&page=2`, { token: "fixture" });
    assert.equal(calls[0][1].method, "GET");
    for (const path of [`/repos/${fixed.repository}/actions/runs/123/artifacts?per_page=100&page=1`,
      `/repos/${fixed.repository}/actions/runs/${fixed.runId}/artifacts?per_page=100&page=21`]) await assert.rejects(githubRequest(path));
    await assert.rejects(githubRequest(`/repos/${fixed.repository}/releases?per_page=100&page=1`, { token: "" }));
    assert.equal(calls.length, 1);
  } finally { globalThis.fetch = original; }
});

test("source-root guard uses independent real paths, source version/tag/clean inputs and control-only required files", () => {
  const owned = mkdtempSync(join(tmpdir(), "dsmm-recovery-source-"));
  try {
    const control = join(owned, "control"), source = join(owned, "source"); mkdirSync(control); mkdirSync(source);
    const calls: any[] = [];
    const execute = (path: string, args: string[]) => {
      calls.push([path, args]);
      if (args[0] === "rev-parse") return path === control ? context().controlSha : fixed.releaseSha;
      if (args[0] === "show") return JSON.stringify({ name: fixed.packageName, version: fixed.version });
      return "";
    };
    assert.equal(assertPackSource(control, context(), execute, { sourceRoot: source }).releaseSha, fixed.releaseSha);
    assert.ok(calls.filter(([, args]) => args[0] === "cat-file").every(([path]) => path === control));
    assert.deepEqual(calls.find(([path, args]) => path === source && args[0] === "status")[1].slice(4), PACK_INPUTS);
    for (const change of ["source-head", "source-tag", "control-head", "dirty-source", "dirty-control", "version", "missing-control"]) {
      assert.throws(() => assertPackSource(control, context(), (path: string, args: string[]) => {
        if (change === "source-head" && path === source && args[0] === "rev-parse" && args[1] === "HEAD") return context().controlSha;
        if (change === "source-tag" && path === source && args[1] === "--verify") return context().controlSha;
        if (change === "control-head" && path === control && args[0] === "rev-parse") return fixed.releaseSha;
        if (change === "dirty-source" && path === source && args[0] === "status") return " M dsmm/package.json";
        if (change === "dirty-control" && path === control && args[0] === "status") return " M dsmm/scripts/dsmm-release.mjs";
        if (change === "version" && args[0] === "show") return JSON.stringify({ name: fixed.packageName, version: "0.2.1" });
        if (change === "missing-control" && args[0] === "cat-file") throw Error("missing control");
        return execute(path, args);
      }, { sourceRoot: source }));
    }
    assert.throws(() => assertPackSource(source, context(), execute, { sourceRoot: control }));
    assert.throws(() => assertPackSource(control, context(), execute, { sourceRoot: control }));
    assert.throws(() => assertPackSource(control, context(), execute));
    const nested = join(control, "nested"); mkdirSync(nested);
    assert.throws(() => assertPackSource(control, context(), execute, { sourceRoot: nested }));
    const relocated = join(owned, "different-source-path"); mkdirSync(relocated);
    assert.doesNotThrow(() => assertPackSource(control, context(), (path: string, args: string[]) => execute(path === relocated ? source : path, args), { sourceRoot: relocated }));
  } finally { rmSync(owned, { recursive: true }); }
});

function workflow() {
  const sdk = createRequire(process.env.DSMM_TEST_DSH_ENTRY ?? import.meta.url);
  const yaml = createRequire(sdk.resolve("@deepseek-ai/dsh-agent-preset-registry"))("js-yaml");
  return yaml.load(readFileSync(join(root, ".github/workflows/dsmm-release.yml"), "utf8"));
}
function condition(job: any, facts: any, results: Record<string, string>, cancelled = false) {
  const needs = Array.isArray(job.needs) ? job.needs : job.needs ? [job.needs] : [];
  let expression = String(job.if).replace(/^\$\{\{\s*|\s*\}\}$/gu, "");
  if (!expression.includes("cancelled()") && needs.some((name: string) => results[name] !== "success")) return false;
  expression = expression.replace(/needs\.([a-z0-9-]+)\.result/gu, (_all: string, name: string) => { assert.ok(needs.includes(name), "needs must be direct"); return JSON.stringify(results[name]); })
    .replace(/github\.(event_name|ref)|inputs\.recovery/gu, (field: string) => JSON.stringify(facts[field] ?? ""))
    .replace(/cancelled\(\)/gu, String(cancelled));
  assert.match(expression.replace(/"[^"]*"|'[^']*'|true|false/gu, ""), /^[\s=!&|()]*$/u);
  return Function(`"use strict";return (${expression});`)();
}

test("workflow gates tolerate only the selected skipped pair, use direct needs, and keep permissions statically isolated", () => {
  const w = workflow(), j = w.jobs;
  assert.deepEqual(Object.keys(j).sort(), [...PUBLICATION_JOBS].sort());
  const facts = { "github.event_name": "workflow_dispatch", "github.ref": "refs/heads/master", "inputs.recovery": fixed.selector };
  const recoveryResults = { "import-bootstrap": "skipped", prepare: "skipped", publish: "skipped", "prepare-recovery-022": "success", "publish-recovery-022": "success" };
  const normalResults = { ...recoveryResults, prepare: "success", publish: "success", "prepare-recovery-022": "skipped", "publish-recovery-022": "skipped" };
  assert.equal(condition(j["import-bootstrap"], facts, {}), false);
  assert.equal(condition(j.prepare, facts, recoveryResults), false);
  assert.equal(condition(j["prepare-recovery-022"], facts, {}), true);
  assert.equal(condition(j["prepare-recovery-022"], { ...facts, "github.ref": "refs/heads/other" }, {}), false);
  const ordinaryFacts = { ...facts, "inputs.recovery": "" };
  assert.equal(condition(j["import-bootstrap"], ordinaryFacts, {}), true);
  assert.equal(condition(j.prepare, ordinaryFacts, { ...normalResults, "import-bootstrap": "success" }), true);
  assert.equal(condition(j.prepare, { ...ordinaryFacts, "github.event_name": "push", "github.ref": `refs/tags/${fixed.tag}` }, normalResults), true);
  assert.equal(condition(j["prepare-recovery-022"], ordinaryFacts, {}), false);
  for (const name of ["github-release"]) {
    assert.equal(condition(j[name], facts, recoveryResults), true);
    assert.equal(condition(j[name], { ...facts, "inputs.recovery": "" }, normalResults), true);
    assert.equal(condition(j[name], facts, normalResults), false);
    assert.equal(condition(j[name], facts, recoveryResults, true), false);
    for (const dependency of j[name].needs) for (const result of ["failure", "cancelled"]) {
      assert.equal(condition(j[name], facts, { ...recoveryResults, [dependency]: result }), false);
    }
  }
  for (const name of ["prepare", "publish"]) assert.equal(j[name].permissions.contents, "read");
  for (const name of ["prepare-recovery-022", "publish-recovery-022"]) assert.equal(j[name].permissions.contents, "write");
  for (const [name, job] of Object.entries<any>(j)) assert.equal(job.permissions?.["id-token"], ["publish", "publish-recovery-022"].includes(name) ? "write" : undefined);
  for (const step of j["import-bootstrap"].steps) {
    if (!step.run) continue;
    for (const line of step.run.trim().split("\n")) {
      const command = line.trim().split(/\s+/u);
      assert.equal(command[0], "node"); assert.equal(command[1], "control/dsmm/scripts/dsmm-release.mjs");
      assert.ok(["resolve", "bootstrap"].includes(command[2]), "bootstrap importer cannot build or publish");
    }
  }
  for (const job of Object.values<any>(j)) for (const step of job.steps) {
    for (const key of Object.keys(step.env ?? {})) assert.ok(!/^(?:NPM_TOKEN|NODE_AUTH_TOKEN|PNPM_TOKEN|NPM_CONFIG_.*(?:AUTH|TOKEN))$/iu.test(key), "workflow must not inject static npm credentials");
    for (const line of String(step.run ?? "").split("\n")) {
      const command = line.trim().split(/\s+/u);
      assert.ok(!(command[0] === "npm" && command[1] === "publish"), "publication must use the guarded OIDC controller");
      assert.ok(!command.includes("--clobber"), "assets cannot be overwritten");
    }
  }
  for (const name of ["publish", "publish-recovery-022", "github-release"]) {
    const steps = j[name].steps, selected = steps.findIndex((step: any) => step.id === "selected");
    const download = steps.findIndex((step: any) => step.uses?.startsWith("actions/download-artifact@"));
    assert.ok(selected >= 0 && selected < download);
    assert.equal(steps[download].with["artifact-ids"], "${{ steps.selected.outputs.artifact-id }}");
    for (const value of Object.values<string>(steps[selected].env)) {
      const dependency = value.match(/needs\.([a-z0-9-]+)\.outputs/u)?.[1];
      assert.ok([j[name].needs].flat().includes(dependency));
    }
  }
  for (const mode of ["bootstrap", "future", "recovery-022"]) {
    assert.equal(selectAcceptedArtifact(mode, mode === "recovery-022" ? "" : "42", mode === "recovery-022" ? "43" : ""), mode === "recovery-022" ? "43" : "42");
    for (const ids of [["", ""], ["42", "43"], mode === "recovery-022" ? ["42", ""] : ["", "43"]]) assert.throws(() => selectAcceptedArtifact(mode, ...ids));
  }
});

test("recovery workflow builds, verifies and packs original source, with distinct pinned control and source checkouts", () => {
  const releaseWorkflow = workflow(), job = releaseWorkflow.jobs["prepare-recovery-022"];
  const checkouts = job.steps.filter((step: any) => step.uses?.startsWith("actions/checkout@"));
  assert.deepEqual(checkouts.map((step: any) => [step.with.path, step.with.ref]), [["control", "${{ github.workflow_sha }}"], ["source", fixed.releaseSha]]);
  let packs = 0, sourceChecks = 0;
  for (const step of job.steps) for (const line of String(step.run ?? "").split("\n")) {
    const command = line.trim().split(/\s+/u);
    if ((command[0] === "pnpm" && command[1] !== "--version") || command[0] === "docker" && command[1] === "build"
      || command[0] === "node" && /^dsmm\/(?:scripts|test)\//u.test(command[1] ?? "")) {
      assert.equal(step["working-directory"], "source", `product execution must use original source: ${command.join(" ")}`);
      if (command[0] === "pnpm") sourceChecks++;
    }
    if (command[1] === "control/dsmm/scripts/dsmm-release.mjs" && command[2] === "pack") {
      packs++; assert.equal(command[command.indexOf("--source-root") + 1], "source");
    }
  }
  assert.equal(packs, 1); assert.ok(sourceChecks > 0);
});

test("actual workflow native gate command supplies every read-only UI support module including native presets", () => {
  const owned = mkdtempSync(join(tmpdir(), "dsmm-recovery-hook-"));
  try {
    const artifact = join(owned, "frozen.tgz"), evidence = join(owned, "evidence"); writeFileSync(artifact, "fixture"); mkdirSync(evidence);
    for (const name of ["prepare", "prepare-recovery-022"]) {
      const command = workflow().jobs[name].steps.map((s: any) => s.run ?? "").flatMap((run: string) => run.split("\n")).find((line: string) => line.includes("/release-native-gate.mjs "));
      assert.ok(command, "workflow must exercise executable native gate seam");
      const env: any = { DSMM_FROZEN_TARBALL: artifact, DSMM_RUNTIME_IMAGE: `sha256:${"a".repeat(64)}`, DSMM_FROZEN_SHA256: "", RUNNER_TEMP: owned };
      const tokens = command.match(/"[^"]*"|\S+/gu).map((token: string) => token.replace(/^"|"$/gu, "").replace(/\$([A-Z_]+)/gu, (_: string, key: string) => env[key]));
      tokens[tokens.indexOf("--control-root") + 1] = root;
      tokens[tokens.indexOf("--evidence-dir") + 1] = evidence;
      const args = tokens.slice(2); args[args.indexOf("--sha256") + 1] = createRequire(import.meta.url)("node:crypto").createHash("sha256").update("fixture").digest("hex");
      const parsed = parseNativeGateOptions(args); let calls = 0;
      runNativeGate(parsed.controlRoot, parsed.options, (_exe: string, argv: string[]) => {
        calls++; const gate = parseArtifactOptions(argv.slice(1));
        assert.ok(gate.hookSupport.some((file: string) => basename(file) === "native-preset-smoke.mjs"));
        assert.equal(gate.requireHook, true); return { status: 0 };
      });
      assert.equal(calls, 1);
      const withoutPresets = nativeGateArguments(root, parsed.options), index = withoutPresets.findIndex((arg: string) => basename(arg) === "native-preset-smoke.mjs");
      withoutPresets.splice(index - 1, 2); assert.throws(() => parseArtifactOptions(withoutPresets));
    }
  } finally { rmSync(owned, { recursive: true }); }
});
