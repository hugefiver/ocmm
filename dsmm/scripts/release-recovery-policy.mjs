import assert from "node:assert/strict";

export const RELEASE_TOPOLOGY = "split-recovery-022-v1";
export const HISTORICAL_TOPOLOGY = "historical-five-v1";
export const PUBLICATION_TOPOLOGY = "split-publication-v1";
export const RECOVERY_022 = Object.freeze({
  selector: "unpublished-0.2.2", repository: "hugefiver/ocmm", packageName: "@dsmm/dsmm",
  version: "0.2.2", tag: "dsmm-scoped-v0.2.2", releaseSha: "dff1ac8ffd58316455256ef1c64c19d6e73e1293",
  workflowId: 374825007, runId: "38822000490", runAttempt: "1",
});
export const SPLIT_RELEASE_JOBS = Object.freeze([
  "import-bootstrap", "prepare", "publish", "prepare-recovery-022", "publish-recovery-022", "verify", "github-release",
]);
export const PUBLICATION_JOBS = Object.freeze([
  "import-bootstrap", "prepare", "publish", "prepare-recovery-022", "publish-recovery-022", "github-release",
]);

export function isSplitTopology(topology) {
  return topology === RELEASE_TOPOLOGY || topology === PUBLICATION_TOPOLOGY;
}

export function dispatchSelector(inputs = {}) {
  assert.ok(inputs !== null && typeof inputs === "object" && !Array.isArray(inputs), "invalid dispatch inputs");
  assert.ok(Object.keys(inputs).every(key => key === "recovery"), "unknown dispatch input");
  assert.ok(inputs.recovery === undefined || inputs.recovery === "" || inputs.recovery === RECOVERY_022.selector, "unknown recovery selector");
  return inputs.recovery || null;
}

export function validateRecoveryBinding(value) {
  for (const key of ["repository", "packageName", "version", "tag", "releaseSha"]) assert.equal(value[key], RECOVERY_022[key], `recovery ${key}`);
  assert.equal(value.mode, "recovery-022");
  assert.equal(value.recoveryPolicy, RECOVERY_022.selector);
  assert.ok(isSplitTopology(value.releaseTopology), "invalid recovery topology");
  assert.equal(value.eventName, "workflow_dispatch");
  assert.equal(value.ref, "refs/heads/master");
  assert.match(value.controlSha, /^[a-f0-9]{40}$/u);
  assert.notEqual(value.controlSha, RECOVERY_022.releaseSha);
  assert.equal(value.eventSha, value.controlSha);
  assert.deepEqual(value.workflow, { file: ".github/workflows/dsmm-release.yml",
    ref: "hugefiver/ocmm/.github/workflows/dsmm-release.yml@refs/heads/master", sha: value.controlSha });
  assert.match(value.runId, /^[1-9]\d*$/u); assert.match(value.runAttempt, /^[1-9]\d*$/u);
  assert.notEqual(value.runId, RECOVERY_022.runId);
  return value;
}

export function selectAcceptedArtifact(mode, normalId, recoveryId) {
  assert.ok(["bootstrap", "future", "recovery-022"].includes(mode), "invalid release mode");
  const selected = mode === "recovery-022" ? recoveryId : normalId;
  const other = mode === "recovery-022" ? normalId : recoveryId;
  assert.ok(other === "" || other === undefined, "both prepare outputs are present");
  assert.match(selected ?? "", /^[1-9]\d*$/u, "accepted artifact ID is missing or invalid");
  return selected;
}
