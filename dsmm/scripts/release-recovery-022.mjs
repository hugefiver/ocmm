import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { findReleaseByTag, githubRequest, registryVersion, remotePeelTag, resolveContextFromEnvironment } from "./dsmm-release.mjs";
import { RECOVERY_022, validateRecoveryBinding } from "./release-recovery-policy.mjs";

const prefix = `/repos/${RECOVERY_022.repository}`;
export function validateRecoveryOrigin(run, attempt, workflow, jobs, artifacts) {
  for (const current of [run, attempt]) {
    assert.equal(String(current.id), RECOVERY_022.runId); assert.equal(String(current.run_attempt), RECOVERY_022.runAttempt, "original run has another attempt");
    assert.equal(current.repository?.full_name, RECOVERY_022.repository); assert.equal(current.head_repository?.full_name, RECOVERY_022.repository);
    assert.equal(current.workflow_id, RECOVERY_022.workflowId); assert.equal(current.status, "completed"); assert.equal(current.conclusion, "failure");
    assert.equal(current.event, "push"); assert.equal(current.head_sha, RECOVERY_022.releaseSha); assert.equal(current.head_branch, RECOVERY_022.tag);
  }
  assert.equal(workflow.id, RECOVERY_022.workflowId); assert.equal(workflow.path, ".github/workflows/dsmm-release.yml");
  const conclusions = { "import-bootstrap": "skipped", prepare: "failure", publish: "skipped", verify: "skipped", "github-release": "skipped" };
  assert.equal(jobs.length, 5); assert.equal(new Set(jobs.map(job => job.name)).size, 5);
  assert.equal(new Set(jobs.map(job => job.id)).size, 5);
  for (const [name, conclusion] of Object.entries(conclusions)) {
    const job = jobs.find(candidate => candidate.name === name);
    assert.ok(Number.isSafeInteger(job?.id) && job.id > 0);
    assert.equal(job.status, "completed"); assert.equal(job.conclusion, conclusion);
    assert.equal(String(job.run_id), RECOVERY_022.runId); assert.equal(String(job.run_attempt), RECOVERY_022.runAttempt);
  }
  assert.ok(!artifacts.some(artifact => typeof artifact.name !== "string" || artifact.name.startsWith("dsmm-accepted-")), "original run has an accepted artifact");
}

async function inventory(request, path, key) {
  const items = [], ids = new Set(); let total;
  for (let page = 1; page <= 20; page++) {
    const response = await request(`${prefix}/${path}?per_page=100&page=${page}`);
    assert.ok(Number.isSafeInteger(response.total_count) && response.total_count >= 0 && Array.isArray(response[key]) && response[key].length <= 100, "invalid recovery inventory");
    if (total === undefined) total = response.total_count;
    assert.equal(response.total_count, total, "changing recovery inventory");
    for (const item of response[key]) {
      assert.ok(Number.isSafeInteger(item.id) && item.id > 0 && !ids.has(item.id), "duplicate/invalid recovery inventory ID");
      ids.add(item.id); items.push(item);
    }
    assert.ok(items.length <= total);
    if (response[key].length < 100) { assert.equal(items.length, total, "incomplete recovery pagination"); return items; }
  }
  throw Error("incomplete bounded recovery pagination");
}

// Admission is read-only and single-shot. It is never used after publication.
export async function assertRecoveryAdmission(context, { request = githubRequest, fetcher = fetch } = {}) {
  validateRecoveryBinding(context);
  const repository = await request(prefix);
  assert.equal(repository.full_name, RECOVERY_022.repository); assert.equal(repository.default_branch, "master");
  const comparison = await request(`${prefix}/compare/${context.controlSha}...master`);
  assert.ok(["ahead", "identical"].includes(comparison.status) && comparison.merge_base_commit?.sha === context.controlSha, "control left master history");
  const runPath = `actions/runs/${RECOVERY_022.runId}`;
  const run = await request(`${prefix}/${runPath}`), attempt = await request(`${prefix}/${runPath}/attempts/1`);
  const workflow = await request(`${prefix}/actions/workflows/${RECOVERY_022.workflowId}`);
  const jobs = await inventory(request, `${runPath}/attempts/1/jobs`, "jobs");
  const artifacts = await inventory(request, `${runPath}/artifacts`, "artifacts");
  validateRecoveryOrigin(run, attempt, workflow, jobs, artifacts);
  assert.equal(await remotePeelTag(RECOVERY_022.tag, request), RECOVERY_022.releaseSha, "immutable recovery tag changed");
  assert.equal(await registryVersion(RECOVERY_022.version, fetcher), null, "recovery package is already published");
  assert.equal(await findReleaseByTag(RECOVERY_022.tag, request), null, "recovery Release already exists (including draft)");
  // Recheck the mutable latest-attempt endpoint after the paginated reads.
  validateRecoveryOrigin(await request(`${prefix}/${runPath}`), attempt, workflow, jobs, artifacts);
  return { outcome: "ADMITTED_NOT_PUBLISHED", recoveryPolicy: RECOVERY_022.selector };
}

export async function main(args = process.argv.slice(2)) {
  assert.equal(args.length, 3); assert.equal(args[0], "admit"); assert.equal(args[1], "--control-root");
  return assertRecoveryAdmission(resolveContextFromEnvironment(resolve(args[2])));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => { process.stderr.write(`DSMM recovery stopped: ${error.message}\n`); process.exitCode = 1; });
}
