import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  computeDigests, expectedAssetNames, readArtifactIdentity, validateArtifactIdentity, validateDockerReceipt,
  validateTarballBuffer, validateTransportAssets, verifyRegistryArtifact, validateArtifactDirectory, registryVerificationFailure,
} from "./dsmm-release.mjs";
import { cleanupOwnedRoot, createOwnedRoot, requiresDeepworkMetadata, validateInstallReceipt, validateLocaleResources } from "./dsmm-registry-install-probe.mjs";

export const REQUIRED_JOBS = ["import-bootstrap", "prepare", "publish", "verify", "github-release"];
const REPOSITORY = "hugefiver/ocmm";
const WORKFLOW = ".github/workflows/dsmm-release.yml";
export const CONTINUATION_WORKFLOW = ".github/workflows/dsmm-published-continuation.yml";
export const PUBLISHED_ORIGIN = Object.freeze({
  repository: REPOSITORY, version: "0.1.4", tag: "dsmm-scoped-v0.1.4",
  controlSha: "d133475c8f297f81ab20782d6b469e02eadefa2a", releaseSha: "d133475c8f297f81ab20782d6b469e02eadefa2a",
  workflowId: 374825007, runId: "37240470628", runAttempt: "1",
  artifactId: 11317741434, artifactName: "dsmm-accepted-37240470628-1", artifactSize: 257969,
  archiveDigest: "sha256:80ea8dc079a3196cdd159a212ba1f8e73ad94be90a5720a6290ba52af868b627",
  filename: "dsmm-dsmm-0.1.4.tgz", sha256: "3747bedef856278c30f3869081fed82f42fb15cd7178d464f6fdb30009fe2b61",
});
const ORIGIN_JOBS = Object.freeze([
  ["import-bootstrap", 111548000843, "skipped"], ["prepare", 111548000008, "success"],
  ["publish", 111548674992, "success"], ["verify", 111548723962, "failure"], ["github-release", 111548765501, "skipped"],
].map(([name, id, conclusion]) => Object.freeze({ name, id, conclusion })));
const PUBLISHED_ORIGIN_016 = Object.freeze({
  repository: REPOSITORY, version: "0.1.6", tag: "dsmm-scoped-v0.1.6",
  controlSha: "d2e499b3a61ef76033d417efbec3402a4739a8fe", releaseSha: "d2e499b3a61ef76033d417efbec3402a4739a8fe",
  workflowId: 374825007, runId: "37281521750", runAttempt: "1",
  artifactId: 11332299033, artifactName: "dsmm-accepted-37281521750-1", artifactSize: 359262,
  archiveDigest: "sha256:3fedc92c35a88f0a75fdfc6ac8ef9a37ef138d902e5698f90ac969f66f6f4eb9",
  filename: "dsmm-dsmm-0.1.6.tgz", sha256: "b7b36fc69e892fb22b06a2428d360181d33bd95526ee2bc403c04b6307ed6c35",
});
const ORIGIN_POLICIES = Object.freeze({
  "0.1.4": Object.freeze({ origin: PUBLISHED_ORIGIN, jobs: ORIGIN_JOBS, workflow: CONTINUATION_WORKFLOW }),
  "0.1.6": Object.freeze({ origin: PUBLISHED_ORIGIN_016, workflow: ".github/workflows/dsmm-published-continuation-016.yml",
    jobs: Object.freeze([
      ["prepare", 111670469274, "success"], ["import-bootstrap", 111670470818, "skipped"],
      ["publish", 111672006891, "success"], ["verify", 111672113877, "failure"], ["github-release", 111672832675, "skipped"],
    ].map(([name, id, conclusion]) => Object.freeze({ name, id, conclusion }))) }),
});
const scriptRoot = fileURLToPath(new URL(".", import.meta.url));

export class EvidenceMismatch extends Error {}

class NativeInstallEvidenceMismatch extends EvidenceMismatch {}

export function verificationFailureForError(error) {
  return error instanceof NativeInstallEvidenceMismatch
    ? { stage: "native-install", code: "INSTALL_PROOF_REJECTED" }
    : registryVerificationFailure(error);
}

function requireCondition(condition, message) {
  if (!condition) throw new EvidenceMismatch(message);
}

export function resolvePublishedOriginPolicy(originVersion = "0.1.4") {
  requireCondition(typeof originVersion === "string" && Object.hasOwn(ORIGIN_POLICIES, originVersion), "unknown published origin version");
  return ORIGIN_POLICIES[originVersion];
}

export function validateRunEvidence(run, workflow, jobs, identity, expected) {
  validateArtifactIdentity(identity);
  requireCondition(String(run.id) === String(expected.runId), "workflow run ID differs");
  requireCondition(String(run.run_attempt) === String(expected.runAttempt), "workflow run attempt differs");
  requireCondition(identity.runId === String(expected.runId) && identity.runAttempt === String(expected.runAttempt), "artifact is from another run/attempt");
  requireCondition(identity.controlSha === expected.controlSha, "artifact control commit differs");
  requireCondition(run.repository?.full_name === REPOSITORY && run.head_repository?.full_name === REPOSITORY, "wrong workflow repository");
  requireCondition(workflow.path === WORKFLOW && workflow.id === run.workflow_id, "wrong workflow file/ID");
  requireCondition(run.status === "completed" && run.conclusion === "success", "workflow has not successfully terminated");
  requireCondition(run.head_sha === identity.controlSha, "workflow control commit differs");
  const bootstrap = identity.origin === "frozen-local-bootstrap";
  requireCondition(run.event === (bootstrap ? "workflow_dispatch" : "push"), "workflow event differs");
  requireCondition(identity.eventName === run.event, "artifact event identity differs");
  requireCondition(identity.ref === (bootstrap ? "refs/heads/master" : `refs/tags/${identity.tag}`), "artifact release ref differs");
  requireCondition(identity.workflow.ref === `${REPOSITORY}/${WORKFLOW}@${identity.ref}`, "artifact workflow ref differs");
  requireCondition(!bootstrap || run.head_branch === "master", "bootstrap was not dispatched from master");
  requireCondition(jobs.length === REQUIRED_JOBS.length, "unexpected workflow job set");
  requireCondition(new Set(jobs.map(job => job.name)).size === jobs.length, "duplicate workflow jobs");
  for (const name of REQUIRED_JOBS) {
    const job = jobs.find(candidate => candidate.name === name);
    const expectedConclusion = name === "import-bootstrap" && !bootstrap ? "skipped" : "success";
    requireCondition(job?.status === "completed" && job.conclusion === expectedConclusion, `required job ${name} has the wrong mode-specific conclusion`);
    requireCondition(String(job.run_id) === String(expected.runId) && String(job.run_attempt) === String(expected.runAttempt), `job ${name} is from another run/attempt`);
  }
  return jobs.map(({ id, name, status, conclusion, run_attempt }) => ({ id, name, status, conclusion, runAttempt: run_attempt,
    applicability: name === "import-bootstrap" && !bootstrap ? "NOT_APPLICABLE" : "REQUIRED" }));
}

export function validateVerificationReceipt(receipt, identity) {
  requireCondition(receipt?.outcome === "COMPLETED", "registry verification did not complete");
  for (const key of ["sha256", "receiptSha256", "runId", "runAttempt", "controlSha", "releaseSha"]) {
    requireCondition(receipt.identity?.[key] === identity[key], `registry verification identity differs: ${key}`);
  }
  requireCondition(receipt.registry?.outcome === "COMPLETED", "registry byte verification missing");
  const registry = receipt.registry;
  requireCondition(registry.name === "@dsmm/dsmm" && registry.version === identity.version && registry.registry === "https://registry.npmjs.org/", "registry package identity differs");
  requireCondition(registry.sha256 === identity.sha256 && registry.sha1 === identity.sha1 && registry.integrity === identity.integrity && registry.size === identity.size, "registry artifact differs");
  validateInstallReceipt(receipt.freshInstall, { version: identity.version, sha256: identity.sha256 });
  requireCondition(receipt.freshInstall.registry.size === identity.size && receipt.freshInstall.registry.sha1 === identity.sha1 && receipt.freshInstall.registry.integrity === identity.integrity, "fresh install registry identity differs");
  return receipt;
}

export function validateBootstrapImportArtifact(artifact, identity, acceptedFiles, importedFiles) {
  validateArtifactIdentity(identity);
  requireCondition(identity.mode === "bootstrap", "bootstrap import is not applicable to future releases");
  requireCondition(artifact.name === identity.bootstrapImport.artifactName && artifact.expired === false
    && artifact.workflow_run?.id === Number(identity.runId), "bootstrap import artifact is from another run/attempt");
  requireCondition(Number.isSafeInteger(artifact.id) && artifact.id > 0 && /^sha256:[a-f0-9]{64}$/u.test(artifact.digest ?? ""), "bootstrap import artifact ID/digest is invalid");
  if (artifact.workflow_run.head_sha !== undefined) requireCondition(artifact.workflow_run.head_sha === identity.controlSha, "bootstrap import control SHA differs");
  const names = ["context.json", "identity.json", identity.filename, identity.receiptFilename, "SHA256SUMS.txt"].sort();
  requireCondition(acceptedFiles instanceof Map && importedFiles instanceof Map
    && JSON.stringify([...acceptedFiles.keys()].sort()) === JSON.stringify(names)
    && JSON.stringify([...importedFiles.keys()].sort()) === JSON.stringify(names), "bootstrap import artifact file set differs");
  for (const name of names) requireCondition(Buffer.isBuffer(importedFiles.get(name)) && importedFiles.get(name).equals(acceptedFiles.get(name)), "accepted artifact differs from exact run/attempt bootstrap import");
  return { outcome: "COMPLETED", ...identity.bootstrapImport, artifactId: artifact.id, archiveDigest: artifact.digest, transport: identity.bootstrapTransport };
}

export async function verifyPublishedArtifact(identity, { registryCheck = verifyRegistryArtifact, installProbe = runInstallProbe } = {}) {
  validateArtifactIdentity(identity);
  const { tarball: _tarball, ...registry } = await registryCheck(identity);
  let freshInstall;
  try { freshInstall = await installProbe(identity); }
  catch (error) {
    if (identity.version !== "0.1.8") throw error;
    throw new NativeInstallEvidenceMismatch("fresh native registry installation failed");
  }
  const receipt = {
    schemaVersion: 1,
    outcome: "COMPLETED",
    identity: Object.fromEntries(["sha256", "receiptSha256", "runId", "runAttempt", "controlSha", "releaseSha"].map(key => [key, identity[key]])),
    registry,
    freshInstall,
    nonclaims: { authenticatedDesktop: "NOT_EXERCISED", paidModel: "NOT_EXERCISED" },
  };
  try { return validateVerificationReceipt(receipt, identity); }
  catch (error) {
    if (identity.version !== "0.1.8") throw error;
    throw new NativeInstallEvidenceMismatch("fresh native registry installation failed");
  }
}

export function runInstallProbe(identity) {
  const owner = createOwnedRoot();
  const owned = owner.root;
  try {
    const receiptPath = join(owned, "fresh-install.json");
    const result = spawnSync(process.execPath, [join(scriptRoot, "dsmm-registry-install-probe.mjs"), "--version", identity.version, "--sha256", identity.sha256, "--receipt", receiptPath], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 900_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
    });
    // Raw carrier/package-manager output is not retained in release receipts.
    requireCondition(!result.error && result.status === 0, "fresh native registry installation failed");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    validateInstallReceipt(receipt, { version: identity.version, sha256: identity.sha256 });
    return receipt;
  } finally {
    cleanupOwnedRoot(owner);
  }
}

export function github(path) {
  return JSON.parse(execFileSync("gh", ["api", `repos/${REPOSITORY}/${path}`], { encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }));
}

export async function peelRemoteTag(tag, request = github) {
  let object = request(`git/ref/tags/${encodeURIComponent(tag)}`).object;
  for (let depth = 0; object?.type === "tag" && depth < 8; depth++) object = request(`git/tags/${object.sha}`).object;
  requireCondition(object?.type === "commit" && /^[a-f0-9]{40}$/u.test(object.sha), "release tag does not peel to a commit");
  return object.sha;
}

export function validatePublishedOriginRun(run, workflow, jobs, originVersion = "0.1.4") {
  const { origin, jobs: originJobs } = resolvePublishedOriginPolicy(originVersion);
  requireCondition(String(run.id) === origin.runId && String(run.run_attempt) === origin.runAttempt, "original workflow run/attempt differs");
  requireCondition(run.repository?.full_name === REPOSITORY && run.head_repository?.full_name === REPOSITORY, "original workflow repository differs");
  requireCondition(workflow.id === origin.workflowId && run.workflow_id === origin.workflowId && workflow.path === WORKFLOW, "original workflow file/ID differs");
  requireCondition(run.status === "completed" && run.conclusion === "failure" && run.event === "push"
    && run.head_sha === origin.controlSha && run.head_branch === origin.tag, "original failed publication history differs");
  requireCondition(jobs.length === originJobs.length && new Set(jobs.map(job => job.name)).size === jobs.length, "original job inventory differs");
  for (const required of originJobs) {
    const job = jobs.find(candidate => candidate.name === required.name);
    requireCondition(job?.id === required.id && job.status === "completed" && job.conclusion === required.conclusion
      && String(job.run_id) === origin.runId && String(job.run_attempt) === origin.runAttempt, `original ${required.name} history differs`);
  }
  return jobs.map(({ id, name, status, conclusion, run_attempt }) => ({ id, name, status, conclusion, runAttempt: run_attempt }));
}

export function validatePublishedOriginIdentity(identity, originVersion = "0.1.4") {
  const { origin } = resolvePublishedOriginPolicy(originVersion);
  validateArtifactIdentity(identity);
  for (const field of ["repository", "version", "tag", "controlSha", "releaseSha", "runId", "runAttempt", "filename", "sha256"])
    requireCondition(identity[field] === origin[field], `fixed published origin differs: ${field}`);
  requireCondition(identity.mode === "future" && identity.origin === "ci-built" && identity.provenance === true
    && identity.sourceChecks === "COMPLETED" && identity.bootstrapImport === null, "published origin is not the original CI-built artifact");
  return identity;
}

function completeInventory(response, key) {
  requireCondition(Array.isArray(response?.[key]) && response.total_count === response[key].length, `incomplete ${key} inventory`);
  return response[key];
}

export function selectContinuationArtifact(artifacts, expected, { artifactId, accepted = false, originVersion = "0.1.4" } = {}) {
  const { origin } = resolvePublishedOriginPolicy(originVersion);
  if (accepted) for (const field of ["runId", "runAttempt", "controlSha"])
    requireCondition(expected[field] === origin[field], `fixed original artifact request differs: ${field}`);
  const name = accepted ? origin.artifactName : `dsmm-registry-verification-${expected.runId}-${expected.runAttempt}`;
  const matches = artifacts.filter(artifact => artifact.name === name);
  requireCondition(matches.length === 1, "exact continuation/origin artifact is missing or ambiguous");
  const artifact = matches[0];
  requireCondition(Number.isSafeInteger(artifact.id) && artifact.id > 0 && (artifactId === undefined || String(artifact.id) === String(artifactId))
    && artifact.expired === false && /^sha256:[a-f0-9]{64}$/u.test(artifact.digest ?? ""), "artifact ID/digest/expiry differs");
  requireCondition(artifact.workflow_run?.id === Number(expected.runId) && artifact.workflow_run.head_sha === expected.controlSha
    && artifact.workflow_run.head_branch === (accepted ? origin.tag : "master"), "artifact source run/control differs");
  requireCondition(Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 16 * 1024 * 1024, "artifact size is invalid");
  if (accepted) requireCondition(artifact.id === origin.artifactId && artifact.digest === origin.archiveDigest
    && artifact.size_in_bytes === origin.artifactSize, "fixed original artifact identity differs");
  return artifact;
}

export async function loadPublishedOrigin(directory, { request = github, downloadArtifact = defaultDownloadArtifact, originVersion = "0.1.4" } = {}) {
  const { origin: expected } = resolvePublishedOriginPolicy(originVersion);
  // Never consult the mutable latest-attempt endpoint for historical publication evidence.
  const run = request(`actions/runs/${expected.runId}/attempts/${expected.runAttempt}`);
  const workflow = request(`actions/workflows/${expected.workflowId}`);
  const jobs = validatePublishedOriginRun(run, workflow,
    completeInventory(request(`actions/runs/${expected.runId}/attempts/${expected.runAttempt}/jobs?per_page=100`), "jobs"), originVersion);
  const artifacts = completeInventory(request(`actions/runs/${expected.runId}/artifacts?per_page=100`), "artifacts");
  requireCondition(!artifacts.some(artifact => artifact.name === `dsmm-bootstrap-${expected.runId}-${expected.runAttempt}`), "original future release unexpectedly imported bootstrap");
  const artifact = selectContinuationArtifact(artifacts, expected, { accepted: true, originVersion });
  requireCondition(await peelRemoteTag(expected.tag, request) === expected.releaseSha, "immutable published tag changed");
  await downloadArtifact(artifact, directory, expected);
  requireCondition(readdirSync(directory).every(name => lstatSync(join(directory, name)).isFile()
    && !lstatSync(join(directory, name)).isSymbolicLink()), "original artifact contains links or directories");
  const context = JSON.parse(readFileSync(join(directory, "context.json"), "utf8"));
  const identity = validatePublishedOriginIdentity(validateArtifactDirectory(directory, context), originVersion);
  const { files } = validateTarballBuffer(readFileSync(join(directory, identity.filename)), { version: identity.version, expectedDigests: identity });
  return { run, workflow, jobs, artifact, context, identity, files };
}

export function validateContinuationContext(context, expected = context, originVersion = "0.1.4") {
  const { origin, workflow } = resolvePublishedOriginPolicy(originVersion);
  requireCondition(context?.schemaVersion === 1 && context.repository === REPOSITORY && context.defaultBranch === "master", "continuation repository/default branch differs");
  requireCondition(context.eventName === "workflow_dispatch" && context.ref === "refs/heads/master"
    && context.inputs && typeof context.inputs === "object" && !Array.isArray(context.inputs) && Object.keys(context.inputs).length === 0, "continuation dispatch/ref/inputs differs");
  requireCondition(/^[a-f0-9]{40}$/u.test(context.controlSha ?? "") && context.controlSha !== origin.controlSha
    && context.eventSha === context.controlSha && context.workflow?.sha === context.controlSha, "continuation checkout/event/workflow SHA differs");
  requireCondition(context.workflow.file === workflow
    && context.workflow.ref === `${REPOSITORY}/${workflow}@refs/heads/master`, "continuation workflow ref differs");
  requireCondition(/^[1-9][0-9]*$/u.test(context.runId ?? "") && /^[1-9][0-9]*$/u.test(context.runAttempt ?? "")
    && context.runId !== origin.runId, "continuation run/attempt invalid");
  requireCondition(context.controlInDefaultHistory === true && context.controlsPresent === true, "continuation control is not in trusted default history");
  requireCondition(context.runtime?.platform === "linux" && context.runtime.nodeMajor === 24, "continuation requires Linux/Node 24 native verification");
  for (const field of ["runId", "runAttempt", "controlSha"]) requireCondition(context[field] === expected[field], `continuation proof ${field} differs`);
  return context;
}

export function validateContinuationJobs(jobs, context, { terminal = true } = {}) {
  requireCondition(jobs.length === 2 && new Set(jobs.map(job => job.name)).size === 2 && new Set(jobs.map(job => job.id)).size === 2, "continuation must have exactly two distinct jobs");
  for (const name of ["verify", "github-release"]) {
    const job = jobs.find(candidate => candidate.name === name);
    requireCondition(Number.isSafeInteger(job?.id) && job.id > 0 && String(job.run_id) === context.runId
      && String(job.run_attempt) === context.runAttempt, `continuation ${name} job identity differs`);
    if (terminal || name === "verify") requireCondition(job.status === "completed" && job.conclusion === "success", `continuation ${name} did not succeed`);
    else requireCondition(job.status === "in_progress" && job.conclusion === null, "continuation finalizer is not the actual running job");
    requireCondition(job.labels?.includes("ubuntu-latest"), `continuation ${name} is not the Linux CI job`);
  }
  return jobs.map(({ id, name, status, conclusion, run_attempt }) => ({ id, name, status, conclusion, runAttempt: run_attempt }));
}

export function loadContinuationRun(context, { request = github, stage = "terminal", originVersion = "0.1.4" } = {}) {
  const policy = resolvePublishedOriginPolicy(originVersion);
  validateContinuationContext(context, context, originVersion);
  const run = request(`actions/runs/${context.runId}/attempts/${context.runAttempt}`);
  requireCondition(String(run.id) === context.runId && String(run.run_attempt) === context.runAttempt
    && run.repository?.full_name === REPOSITORY && run.head_repository?.full_name === REPOSITORY, "continuation actual run/repository differs");
  requireCondition(run.event === "workflow_dispatch" && run.head_branch === "master" && run.head_sha === context.controlSha, "continuation actual dispatch/control differs");
  if (stage === "terminal") {
    if (run.status !== "completed") throw new Error("continuation workflow is still running");
    requireCondition(run.conclusion === "success", "continuation workflow did not succeed");
  } else requireCondition(run.status === "in_progress" && run.conclusion === null, "continuation workflow is not genuinely running");
  const workflow = request(`actions/workflows/${run.workflow_id}`);
  requireCondition(Number.isSafeInteger(workflow.id) && workflow.id > 0 && workflow.id === run.workflow_id && workflow.path === policy.workflow, "continuation workflow file/ID differs");
  const comparison = request(`compare/${context.controlSha}...master`);
  requireCondition(["ahead", "identical"].includes(comparison.status) && comparison.merge_base_commit?.sha === context.controlSha, "continuation control left default-branch history");
  for (const path of [policy.workflow, "scripts/dsmm-release-continuation.mjs", "scripts/check-dsmm-release-completion.mjs", "scripts/dsmm-release.mjs", "scripts/dsmm-registry-install-probe.mjs"]) {
    const source = request(`contents/${path}?ref=${context.controlSha}`);
    requireCondition(source.type === "file" && source.path === path && source.encoding === "base64" && typeof source.content === "string", "trusted continuation controls are missing");
    if (path === policy.workflow) {
      const yaml = Buffer.from(source.content, "base64").toString("utf8");
      const events = yaml.match(/^on:\r?\n([\s\S]*?)(?=^[^\s#])/mu)?.[1];
      requireCondition(events?.trim() === "workflow_dispatch:", "continuation workflow is not no-input dispatch-only");
      requireCondition(!/id-token:|NPM_TOKEN|NODE_AUTH_TOKEN|--clobber|npm publish|pnpm publish/u.test(yaml), "continuation workflow contains publishing permissions/actions");
      if (originVersion === "0.1.6") {
        const commands = [...yaml.matchAll(/^        run: node control\/scripts\/dsmm-release-continuation\.mjs (verify|finalize) ([^\r\n]*)$/gmu)];
        requireCondition(commands.length === 2 && new Set(commands.map(match => match[1])).size === 2
          && commands.every(match => {
            const selectors = [...match[2].matchAll(/--origin-version(?:\s+|=)([^\s]+)/gu)];
            return selectors.length === 1 && selectors[0][1] === originVersion;
          }), "continuation workflow origin selector differs");
        requireCondition(!/\b(?:npm|pnpm)\s+(?:install|build|pack)|git\s+tag/u.test(yaml), "continuation workflow contains source installation/build/pack or tag mutation");
      }
    }
  }
  let jobs = [];
  if (stage !== "verify") jobs = validateContinuationJobs(completeInventory(request(`actions/runs/${context.runId}/attempts/${context.runAttempt}/jobs?per_page=100`), "jobs"), context, { terminal: stage === "terminal" });
  return { run, workflow, jobs };
}

export function validateContinuationVerification(envelope, origin, expected, originVersion = "0.1.4") {
  const { origin: fixed } = resolvePublishedOriginPolicy(originVersion);
  requireCondition(envelope?.schemaVersion === 2 && envelope.mode === "published-continuation" && envelope.outcome === "COMPLETED", "continuation envelope schema/mode/outcome differs");
  validateContinuationContext(envelope.continuation, expected, originVersion);
  for (const field of ["repository", "version", "tag", "controlSha", "releaseSha", "runId", "runAttempt", "filename"])
    requireCondition(origin.identity[field] === fixed[field], `continuation selected origin differs: ${field}`);
  requireCondition(envelope.originAcceptedArtifact?.id === fixed.artifactId
    && envelope.originAcceptedArtifact.archiveDigest === fixed.archiveDigest
    && envelope.originAcceptedArtifact.runId === fixed.runId && envelope.originAcceptedArtifact.runAttempt === fixed.runAttempt, "continuation origin archive binding differs");
  requireCondition(envelope.verification?.schemaVersion === 1, "continuation must wrap the original raw verification schema");
  const verification = validateVerificationReceipt(envelope.verification, origin.identity);
  const provenance = verification.registry.provenance;
  requireCondition(provenance?.outcome === "COMPLETED" && provenance.source === "npm-registry-served-validated-attestation-over-https"
    && provenance.predicateType === "https://slsa.dev/provenance/v1" && provenance.workflowFile === WORKFLOW
    && provenance.sourceSha === fixed.releaseSha && provenance.runId === fixed.runId
    && provenance.runAttempt === fixed.runAttempt && provenance.independentSigstoreVerification === false, "continuation changed original npm provenance");
  validateInstalledFileHashes(verification.freshInstall, origin.files);
  return verification;
}

export async function loadContinuationProof(directory, origin, context, { request = github, downloadArtifact = defaultDownloadArtifact, artifactId, originVersion = "0.1.4" } = {}) {
  resolvePublishedOriginPolicy(originVersion);
  const artifacts = completeInventory(request(`actions/runs/${context.runId}/artifacts?per_page=100`), "artifacts");
  const artifact = selectContinuationArtifact(artifacts, context, { artifactId, originVersion });
  await downloadArtifact(artifact, directory, context);
  const path = join(directory, "dsmm-registry-verification.json");
  requireCondition(JSON.stringify(readdirSync(directory)) === JSON.stringify(["dsmm-registry-verification.json"])
    && lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), "continuation verification file set/links differs");
  const envelope = JSON.parse(readFileSync(path, "utf8"));
  const verification = validateContinuationVerification(envelope, origin, context, originVersion);
  return { artifact, envelope, verification };
}

export async function checkTerminalPublishedContinuation(expected, { request = github, downloadArtifact = defaultDownloadArtifact,
  publishedCheck = verifyPublishedArtifact, fetchAsset = defaultFetchAsset, originLoader = loadPublishedOrigin, originVersion = "0.1.4" } = {}) {
  const { origin: fixed, workflow } = resolvePublishedOriginPolicy(originVersion);
  const owner = createOwnedRoot();
  try {
    const acceptedDirectory = join(owner.root, "accepted"); mkdirSync(acceptedDirectory);
    const origin = await originLoader(acceptedDirectory, { request, downloadArtifact, originVersion });
    const proofDirectory = join(owner.root, "verification"); mkdirSync(proofDirectory);
    const { artifact: proofArtifact, envelope, verification } = await loadContinuationProof(proofDirectory, origin, expected, { request, downloadArtifact, originVersion });
    const continuation = loadContinuationRun(envelope.continuation, { request, originVersion });
    requireCondition(await peelRemoteTag(fixed.tag, request) === fixed.releaseSha, "immutable published tag changed");
    const release = request(`releases/tags/${fixed.tag}`);
    requireCondition(release.draft === false && release.prerelease === false, "continued Release is not public stable");
    requireCondition(JSON.stringify(release.assets?.map(asset => asset.name).sort()) === JSON.stringify(expectedAssetNames(origin.identity.version).sort()), "continued Release asset set differs");
    const assets = new Map();
    for (const asset of release.assets) assets.set(asset.name, await fetchAsset(asset, origin.identity));
    validateTransportAssets(release, assets, origin.identity, { requireDraft: false });
    const publication = await publishedCheck(origin.identity, { installProbe: async () => verification.freshInstall });
    validateContinuationVerification({ ...envelope, verification: publication }, origin, expected, originVersion);
    return {
      schemaVersion: 2, mode: "published-continuation", outcome: "COMPLETED", repository: REPOSITORY,
      originWorkflow: { file: WORKFLOW, id: origin.workflow.id, runId: fixed.runId, runAttempt: fixed.runAttempt,
        controlSha: fixed.controlSha, status: origin.run.status, conclusion: origin.run.conclusion, jobs: origin.jobs },
      continuationWorkflow: { file: workflow, id: continuation.workflow.id, ...expected,
        status: continuation.run.status, conclusion: continuation.run.conclusion, jobs: continuation.jobs },
      originAcceptedArtifact: { id: origin.artifact.id, archiveDigest: origin.artifact.digest },
      verificationProof: { id: proofArtifact.id, archiveDigest: proofArtifact.digest, runId: expected.runId, runAttempt: expected.runAttempt },
      artifact: origin.identity, publication,
      githubRelease: { id: release.id, tag: release.tag_name, draft: false, assetIds: release.assets.map(({ id, name }) => ({ id, name })) },
      freshInstallEvidence: { origin: "CI continuation verify job, Linux/Node 24", artifactId: proofArtifact.id, runId: expected.runId, runAttempt: expected.runAttempt },
      nonclaims: { ...publication.nonclaims, originalWorkflowSuccess: "NOT_CLAIMED_ORIGINAL_FAILURE_PRESERVED", terminalHostNativeInstall: "NOT_RUN_REDUNDANT_TO_BOUND_CI_PROOF" },
    };
  } finally { cleanupOwnedRoot(owner); }
}

export async function checkTerminalCompletion(expected, { request = github, downloadArtifact = defaultDownloadArtifact, publishedCheck = verifyPublishedArtifact, fetchAsset = defaultFetchAsset } = {}) {
  const run = request(`actions/runs/${expected.runId}`);
  if (run.status !== "completed") throw new Error("workflow is still running");
  const workflow = request(`actions/workflows/${run.workflow_id}`);
  const jobsResponse = request(`actions/runs/${expected.runId}/attempts/${expected.runAttempt}/jobs?per_page=100`);
  requireCondition(jobsResponse.total_count === jobsResponse.jobs?.length, "incomplete workflow job inventory");
  const artifactsResponse = request(`actions/runs/${expected.runId}/artifacts?per_page=100`);
  requireCondition(artifactsResponse.total_count === artifactsResponse.artifacts?.length, "incomplete workflow artifact inventory");
  const findArtifact = (name) => {
    const candidates = artifactsResponse.artifacts.filter(artifact => artifact.name === name && artifact.expired === false);
    requireCondition(candidates.length === 1, "exact run artifact is missing or ambiguous");
    requireCondition(candidates[0].workflow_run?.id === Number(expected.runId), "artifact belongs to another workflow run");
    requireCondition(Number.isSafeInteger(candidates[0].id) && candidates[0].id > 0 && /^sha256:[a-f0-9]{64}$/u.test(candidates[0].digest ?? ""), "run artifact ID or archive digest is invalid");
    return candidates[0];
  };
  const acceptedArtifact = findArtifact(`dsmm-accepted-${expected.runId}-${expected.runAttempt}`);
  const proofArtifact = findArtifact(`dsmm-registry-verification-${expected.runId}-${expected.runAttempt}`);
  const owner = createOwnedRoot();
  const owned = join(owner.root, "accepted");
  mkdirSync(owned);
  try {
    await downloadArtifact(acceptedArtifact, owned, expected);
    requireCondition(readdirSync(owned).every(name => lstatSync(join(owned, name)).isFile()), "accepted artifact contains links or directories");
    const identity = readArtifactIdentity(join(owned, "identity.json"));
    const jobs = validateRunEvidence(run, workflow, jobsResponse.jobs, identity, expected);
    requireCondition(await peelRemoteTag(identity.tag, request) === identity.releaseSha, "immutable release tag changed");
    const expectedFiles = ["context.json", "identity.json", identity.filename, identity.receiptFilename, "SHA256SUMS.txt"].sort();
    requireCondition(JSON.stringify(readdirSync(owned).sort()) === JSON.stringify(expectedFiles), "accepted artifact has missing or extra files");
    let bootstrapImportEvidence = { outcome: "NOT_APPLICABLE", job: "import-bootstrap" };
    if (identity.mode === "bootstrap") {
      const importedArtifact = findArtifact(identity.bootstrapImport.artifactName);
      const importedDirectory = join(owner.root, "bootstrap-import"); mkdirSync(importedDirectory);
      await downloadArtifact(importedArtifact, importedDirectory, expected);
      requireCondition(JSON.stringify(readdirSync(importedDirectory).sort()) === JSON.stringify(expectedFiles), "bootstrap import artifact file set differs");
      const importedFiles = new Map(), acceptedFiles = new Map();
      for (const name of expectedFiles) {
        const file = join(importedDirectory, name);
        requireCondition(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink(), "bootstrap import contains links or directories");
        importedFiles.set(name, readFileSync(file)); acceptedFiles.set(name, readFileSync(join(owned, name)));
      }
      bootstrapImportEvidence = validateBootstrapImportArtifact(importedArtifact, identity, acceptedFiles, importedFiles);
    } else {
      requireCondition(!artifactsResponse.artifacts.some(artifact => artifact.name === `dsmm-bootstrap-${expected.runId}-${expected.runAttempt}`), "future release has an unexpected bootstrap import artifact");
    }
    const accepted = validateTarballBuffer(readFileSync(join(owned, identity.filename)), { version: identity.version, expectedDigests: identity });
    const dockerBytes = readFileSync(join(owned, identity.receiptFilename));
    requireCondition(computeDigests(dockerBytes).sha256 === identity.receiptSha256, "accepted Docker receipt bytes differ");
    validateDockerReceipt(JSON.parse(dockerBytes.toString("utf8")), identity);
    const release = request(`releases/tags/${encodeURIComponent(identity.tag)}`);
    requireCondition(release.draft === false && release.prerelease === false, "GitHub Release is not public stable");
    requireCondition(JSON.stringify(release.assets.map(asset => asset.name).sort()) === JSON.stringify(expectedAssetNames(identity.version).sort()), "public Release asset set differs");
    const assets = new Map();
    for (const asset of release.assets) assets.set(asset.name, await fetchAsset(asset, identity));
    validateTransportAssets(release, assets, identity, { requireDraft: false, allowExisting: true });
    const proofDirectory = join(owner.root, "verification");
    mkdirSync(proofDirectory);
    await downloadArtifact(proofArtifact, proofDirectory, expected);
    requireCondition(JSON.stringify(readdirSync(proofDirectory)) === JSON.stringify(["dsmm-registry-verification.json"]), "verification artifact file set differs");
    requireCondition(lstatSync(join(proofDirectory, "dsmm-registry-verification.json")).isFile(), "verification artifact must not be a link");
    const recorded = JSON.parse(readFileSync(join(proofDirectory, "dsmm-registry-verification.json"), "utf8"));
    validateVerificationReceipt(recorded, identity);
    validateInstalledFileHashes(recorded.freshInstall, accepted.files);
    const publication = await publishedCheck(identity, {
      installProbe: async () => recorded.freshInstall,
    });
    validateVerificationReceipt(publication, identity);
    return {
      schemaVersion: 1, outcome: "COMPLETED", repository: REPOSITORY,
      workflow: { file: WORKFLOW, id: workflow.id, controlSha: identity.controlSha, runId: expected.runId, runAttempt: expected.runAttempt, jobs },
      artifact: identity, githubRelease: { id: release.id, tag: release.tag_name, draft: false, assetIds: release.assets.map(({ id, name }) => ({ id, name })) },
      publication,
      bootstrapImportEvidence,
      freshInstallEvidence: { origin: "CI verify job, Linux/Node 24", artifactId: proofArtifact.id, runId: expected.runId, runAttempt: expected.runAttempt },
      nonclaims: { ...publication.nonclaims, terminalHostNativeInstall: "NOT_RUN_REDUNDANT_TO_BOUND_CI_PROOF" },
    };
  } finally {
    cleanupOwnedRoot(owner);
  }
}

export function validateInstalledFileHashes(receipt, files) {
  for (const entry of [...Object.values(receipt.exports), ...Object.values(receipt.compiledFiles)]) {
    const bytes = files.get(entry.path);
    requireCondition(Buffer.isBuffer(bytes) && computeDigests(bytes).sha256 === entry.sha256, "native installed export/profile/client bytes differ from the verified archive");
  }
  if (requiresDeepworkMetadata(receipt.version)) {
    const resources = validateLocaleResources(new Map([...files].filter(([path]) => path.startsWith("locale/"))), receipt.version);
    for (const language of ["en", "zh"]) {
      const observed = receipt.nativeMetadata.locales[language], expected = resources[language];
      requireCondition(["path", "sha256", "title", "description"].every((field) => observed[field] === expected[field]), "native metadata reader evidence differs from verified locale resource bytes");
    }
  }
}

async function defaultFetchAsset(asset, identity) {
  const expected = `https://github.com/${REPOSITORY}/releases/download/${identity.tag}/${asset.name}`;
  requireCondition(asset.browser_download_url === expected, "release asset URL differs from fixed repository identity");
  requireCondition(Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= 16 * 1024 * 1024, "release asset size is invalid");
  const response = await fetch(expected, { signal: AbortSignal.timeout(60_000) });
  requireCondition(response.ok, "release asset download failed");
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    requireCondition(length <= asset.size, "release download exceeded its declared size");
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  requireCondition(buffer.length === asset.size && buffer.length <= 16 * 1024 * 1024, "release asset size differs");
  return buffer;
}

export function validateArtifactMembers(members, artifact, expected) {
  if (artifact.name === `dsmm-registry-verification-${expected.runId}-${expected.runAttempt}`) requireCondition(JSON.stringify(members) === JSON.stringify(["dsmm-registry-verification.json"]), "unsafe verification archive membership");
  else {
    requireCondition([`dsmm-accepted-${expected.runId}-${expected.runAttempt}`, `dsmm-bootstrap-${expected.runId}-${expected.runAttempt}`].includes(artifact.name), "unexpected accepted/import artifact identity");
    const fixed = ["context.json", "identity.json", "docker-receipt-native-session-control.json", "SHA256SUMS.txt"];
    requireCondition(members.length === 5 && fixed.every(name => members.includes(name)) && members.filter(name => /^dsmm-dsmm-(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.tgz$/u.test(name)).length === 1, "unsafe accepted archive membership");
  }
}

export function defaultDownloadArtifact(artifact, output, expected) {
  requireCondition(Number.isSafeInteger(artifact.id) && artifact.id > 0, "invalid Actions artifact ID");
  requireCondition(artifact.workflow_run?.id === Number(expected.runId), "wrong Actions artifact run");
  const archive = execFileSync("gh", ["api", `repos/${REPOSITORY}/actions/artifacts/${artifact.id}/zip`], { timeout: 120_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  validateArtifactArchive(archive, artifact);
  const archivePath = `${output}.zip`;
  writeFileSync(archivePath, archive, { flag: "wx" });
  const windows = process.platform === "win32";
  const members = execFileSync(windows ? "tar" : "unzip", windows ? ["-tf", archivePath] : ["-Z1", archivePath], { encoding: "utf8", timeout: 30_000, windowsHide: true }).trim().split(/\r?\n/u);
  validateArtifactMembers(members, artifact, expected);
  execFileSync(windows ? "tar" : "unzip", windows ? ["-xf", archivePath, "-C", output] : ["-q", archivePath, "-d", output], { stdio: "pipe", timeout: 30_000, windowsHide: true });
}

export function validateArtifactArchive(archive, artifact) {
  requireCondition(artifact.digest === `sha256:${computeDigests(archive).sha256}`, "Actions artifact archive digest differs");
  if (artifact.size_in_bytes !== undefined) requireCondition(archive.length === artifact.size_in_bytes, "Actions artifact archive size differs");
}

export function parseCompletionArguments(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    "artifact-dir": { type: "string" }, "run-id": { type: "string" }, "run-attempt": { type: "string" },
    "control-sha": { type: "string" }, receipt: { type: "string" },
    "origin-version": { type: "string" },
  } });
  requireCondition(positionals.length === 1 && ["verify", "terminal", "terminal-continuation"].includes(positionals[0]), "choose verify, terminal or terminal-continuation mode");
  requireCondition(typeof values.receipt === "string" && values.receipt.length > 0, "--receipt is required");
  if (values["origin-version"] !== undefined) {
    requireCondition(positionals[0] === "terminal-continuation", "--origin-version is only valid for terminal-continuation");
    resolvePublishedOriginPolicy(values["origin-version"]);
  }
  if (positionals[0] === "verify") requireCondition(Boolean(values["artifact-dir"]), "--artifact-dir is required");
  else {
    for (const key of ["run-id", "run-attempt"]) requireCondition(/^[1-9][0-9]*$/u.test(values[key] ?? ""), `invalid --${key}`);
    requireCondition(/^[a-f0-9]{40}$/u.test(values["control-sha"] ?? ""), "invalid --control-sha");
  }
  return { mode: positionals[0], ...values };
}

export async function main(args = process.argv.slice(2)) {
  let options;
  let receipt;
  try {
    options = parseCompletionArguments(args);
    if (options.mode === "verify") {
      const identity = readArtifactIdentity(join(resolve(options["artifact-dir"]), "identity.json"));
      receipt = await verifyPublishedArtifact(identity);
    } else {
      const expected = { runId: options["run-id"], runAttempt: options["run-attempt"], controlSha: options["control-sha"] };
      receipt = options.mode === "terminal-continuation"
        ? await checkTerminalPublishedContinuation(expected, { originVersion: options["origin-version"] })
        : await checkTerminalCompletion(expected);
    }
  } catch (error) {
    // Failed state preserves all tags, assets and registry identities.
    receipt = { schemaVersion: options?.mode === "terminal-continuation" ? 2 : 1,
      ...(options?.mode === "terminal-continuation" ? { mode: "published-continuation" } : {}),
      outcome: error instanceof EvidenceMismatch ? "FAILED" : "UNRESOLVED", reason: "required release evidence could not be established; immutable surfaces were not changed",
      ...(verificationFailureForError(error) ? { failure: verificationFailureForError(error) } : {}) };
  }
  if (options) writeFileSync(resolve(options.receipt), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  return receipt.outcome === "COMPLETED" ? 0 : receipt.outcome === "FAILED" ? 1 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
