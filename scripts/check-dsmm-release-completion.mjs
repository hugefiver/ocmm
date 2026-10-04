import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  computeDigests, expectedAssetNames, readArtifactIdentity, validateArtifactIdentity, validateDockerReceipt,
  validateTarballBuffer, validateTransportAssets, verifyRegistryArtifact,
} from "./dsmm-release.mjs";
import { cleanupOwnedRoot, createOwnedRoot, requiresDeepworkMetadata, validateInstallReceipt, validateLocaleResources } from "./dsmm-registry-install-probe.mjs";

export const REQUIRED_JOBS = ["import-bootstrap", "prepare", "publish", "verify", "github-release"];
const REPOSITORY = "hugefiver/ocmm";
const WORKFLOW = ".github/workflows/dsmm-release.yml";
const scriptRoot = fileURLToPath(new URL(".", import.meta.url));

export class EvidenceMismatch extends Error {}

function requireCondition(condition, message) {
  if (!condition) throw new EvidenceMismatch(message);
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
  const freshInstall = await installProbe(identity);
  const receipt = {
    schemaVersion: 1,
    outcome: "COMPLETED",
    identity: Object.fromEntries(["sha256", "receiptSha256", "runId", "runAttempt", "controlSha", "releaseSha"].map(key => [key, identity[key]])),
    registry,
    freshInstall,
    nonclaims: { authenticatedDesktop: "NOT_EXERCISED", paidModel: "NOT_EXERCISED" },
  };
  return validateVerificationReceipt(receipt, identity);
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

function github(path) {
  return JSON.parse(execFileSync("gh", ["api", `repos/${REPOSITORY}/${path}`], { encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }));
}

export async function peelRemoteTag(tag, request = github) {
  let object = request(`git/ref/tags/${encodeURIComponent(tag)}`).object;
  for (let depth = 0; object?.type === "tag" && depth < 8; depth++) object = request(`git/tags/${object.sha}`).object;
  requireCondition(object?.type === "commit" && /^[a-f0-9]{40}$/u.test(object.sha), "release tag does not peel to a commit");
  return object.sha;
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

function defaultDownloadArtifact(artifact, output, expected) {
  requireCondition(Number.isSafeInteger(artifact.id) && artifact.id > 0, "invalid Actions artifact ID");
  requireCondition(artifact.workflow_run?.id === Number(expected.runId), "wrong Actions artifact run");
  const archive = execFileSync("gh", ["api", `repos/${REPOSITORY}/actions/artifacts/${artifact.id}/zip`], { timeout: 120_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  requireCondition(artifact.digest === `sha256:${computeDigests(archive).sha256}`, "Actions artifact archive digest differs");
  const archivePath = `${output}.zip`;
  writeFileSync(archivePath, archive, { flag: "wx" });
  const windows = process.platform === "win32";
  const members = execFileSync(windows ? "tar" : "unzip", windows ? ["-tf", archivePath] : ["-Z1", archivePath], { encoding: "utf8", timeout: 30_000, windowsHide: true }).trim().split(/\r?\n/u);
  if (artifact.name === `dsmm-registry-verification-${expected.runId}-${expected.runAttempt}`) requireCondition(JSON.stringify(members) === JSON.stringify(["dsmm-registry-verification.json"]), "unsafe verification archive membership");
  else {
    requireCondition([`dsmm-accepted-${expected.runId}-${expected.runAttempt}`, `dsmm-bootstrap-${expected.runId}-${expected.runAttempt}`].includes(artifact.name), "unexpected accepted/import artifact identity");
    const fixed = ["context.json", "identity.json", "docker-receipt-native-session-control.json", "SHA256SUMS.txt"];
    requireCondition(members.length === 5 && fixed.every(name => members.includes(name)) && members.filter(name => /^dsmm-dsmm-(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.tgz$/u.test(name)).length === 1, "unsafe accepted archive membership");
  }
  execFileSync(windows ? "tar" : "unzip", windows ? ["-xf", archivePath, "-C", output] : ["-q", archivePath, "-d", output], { stdio: "pipe", timeout: 30_000, windowsHide: true });
}

export function parseCompletionArguments(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    "artifact-dir": { type: "string" }, "run-id": { type: "string" }, "run-attempt": { type: "string" },
    "control-sha": { type: "string" }, receipt: { type: "string" },
  } });
  requireCondition(positionals.length === 1 && ["verify", "terminal"].includes(positionals[0]), "choose verify or terminal mode");
  requireCondition(typeof values.receipt === "string" && values.receipt.length > 0, "--receipt is required");
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
    } else receipt = await checkTerminalCompletion({ runId: options["run-id"], runAttempt: options["run-attempt"], controlSha: options["control-sha"] });
  } catch (error) {
    // Failed state preserves all tags, assets and registry identities.
    receipt = { schemaVersion: 1, outcome: error instanceof EvidenceMismatch ? "FAILED" : "UNRESOLVED", reason: "required release evidence could not be established; immutable surfaces were not changed" };
  }
  if (options) writeFileSync(resolve(options.receipt), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  return receipt.outcome === "COMPLETED" ? 0 : receipt.outcome === "FAILED" ? 1 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
