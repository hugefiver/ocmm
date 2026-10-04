import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { expectedAssetNames, finalizeRelease, findReleaseByTag, githubRequest, stageDraftTransport } from "./dsmm-release.mjs";
import { cleanupOwnedRoot, createOwnedRoot } from "./dsmm-registry-install-probe.mjs";
import {
  CONTINUATION_WORKFLOW, EvidenceMismatch, PUBLISHED_ORIGIN, github, loadContinuationProof,
  loadContinuationRun, loadPublishedOrigin, validateContinuationContext, validateContinuationVerification,
  verifyPublishedArtifact,
} from "./check-dsmm-release-completion.mjs";

export function resolveContinuationFromEnvironment(controlRoot, stage, env = process.env) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_JOB !== (stage === "verify" ? "verify" : "github-release"))
    throw new EvidenceMismatch("continuation must execute in its genuine Actions job");
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  const git = (args) => execFileSync("git", ["-C", controlRoot, ...args], { encoding: "utf8", timeout: 30_000, windowsHide: true }).trim();
  const checkGit = (args) => spawnSync("git", ["-C", controlRoot, ...args], { stdio: "ignore", timeout: 30_000, windowsHide: true }).status === 0;
  const controlSha = git(["rev-parse", "HEAD"]);
  return validateContinuationContext({
    schemaVersion: 1, repository: event.repository?.full_name, defaultBranch: event.repository?.default_branch,
    eventName: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF, inputs: event.inputs ?? {}, eventSha: env.GITHUB_SHA,
    controlSha, workflow: { file: CONTINUATION_WORKFLOW, ref: env.GITHUB_WORKFLOW_REF, sha: env.GITHUB_WORKFLOW_SHA },
    runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
    controlInDefaultHistory: checkGit(["merge-base", "--is-ancestor", controlSha, "refs/remotes/origin/master"]),
    controlsPresent: [CONTINUATION_WORKFLOW, "scripts/dsmm-release-continuation.mjs", "scripts/check-dsmm-release-completion.mjs",
      "scripts/dsmm-release.mjs", "scripts/dsmm-registry-install-probe.mjs"].every(path => checkGit(["cat-file", "-e", `${controlSha}:${path}`])),
    runtime: { platform: process.platform, nodeMajor: Number(process.versions.node.split(".")[0]) },
  });
}

export async function runPublishedContinuation(stage, context, {
  request = github, downloadArtifact, originLoader = loadPublishedOrigin, publishedCheck = verifyPublishedArtifact,
  stageTransport = stageDraftTransport, finalize = finalizeRelease, findExistingRelease = findReleaseByTag,
  releaseRequest = githubRequest, proofArtifactId,
} = {}) {
  if (!["verify", "finalize"].includes(stage)) throw new EvidenceMismatch("unknown continuation stage");
  validateContinuationContext(context);
  loadContinuationRun(context, { request, stage });
  const owner = createOwnedRoot();
  try {
    const acceptedDirectory = join(owner.root, "accepted"); mkdirSync(acceptedDirectory);
    const origin = await originLoader(acceptedDirectory, { request, downloadArtifact });
    if (stage === "verify") {
      const verification = await publishedCheck(origin.identity);
      const envelope = {
        schemaVersion: 2, mode: "published-continuation", outcome: "COMPLETED", continuation: context,
        originAcceptedArtifact: { id: PUBLISHED_ORIGIN.artifactId, archiveDigest: PUBLISHED_ORIGIN.archiveDigest,
          runId: PUBLISHED_ORIGIN.runId, runAttempt: PUBLISHED_ORIGIN.runAttempt },
        verification,
      };
      validateContinuationVerification(envelope, origin, context);
      return envelope;
    }
    if (!/^[1-9][0-9]*$/u.test(String(proofArtifactId ?? ""))) throw new EvidenceMismatch("exact verify artifact ID is required");
    const proofDirectory = join(owner.root, "verification"); mkdirSync(proofDirectory);
    const { verification } = await loadContinuationProof(proofDirectory, origin, context, { request, downloadArtifact, artifactId: proofArtifactId });
    const existing = await findExistingRelease(origin.identity.tag);
    if (existing) throw new EvidenceMismatch(`Release already exists; preserved without mutation: ${JSON.stringify({ id: existing.id,
      draft: existing.draft, assets: existing.assets?.map(({ id, name }) => ({ id, name })) })}`);
    // The existing staging API requires complete authenticated draft discovery and absence.
    // It creates the missing Release once; neither this controller nor a retry adopts partial state.
    const staged = await stageTransport(acceptedDirectory, origin.context);
    const createdPath = `/repos/${PUBLISHED_ORIGIN.repository}/releases/${staged.releaseId}`;
    const assetMap = (assets) => JSON.stringify(assets?.map(({ id, name }) => ({ id: String(id), name })).sort((left, right) => left.name.localeCompare(right.name)));
    if (!/^[1-9][0-9]*$/u.test(String(staged.releaseId)) || !Array.isArray(staged.assets)
      || JSON.stringify(staged.assets.map(({ name }) => name).sort()) !== JSON.stringify(expectedAssetNames(origin.identity.version))
      || new Set(staged.assets.map(({ id }) => String(id))).size !== 3 || staged.assets.some(({ id }) => !/^[1-9][0-9]*$/u.test(String(id))))
      throw new EvidenceMismatch("newly created Release/asset identity is invalid");
    const createdAssets = assetMap(staged.assets);
    const requireCreated = (release) => {
      if (String(release?.id) !== String(staged.releaseId) || release.tag_name !== origin.identity.tag || assetMap(release.assets) !== createdAssets)
        throw new EvidenceMismatch("newly created Release/asset identity changed before finalization");
    };
    const boundFinalizerRequest = async (path, options = {}) => {
      const prefix = `/repos/${PUBLISHED_ORIGIN.repository}/`;
      const method = options.method ?? "GET";
      if (!path.startsWith(prefix) || (method !== "GET" && (method !== "PATCH" || path !== createdPath || options.body?.draft !== false)))
        throw new EvidenceMismatch("finalizer mutation is not the newly created Release public PATCH");
      if (new RegExp(`^${prefix}releases/[0-9]+$`, "u").test(path) && path !== createdPath)
        throw new EvidenceMismatch("finalizer selected another Release identity");
      if (path.startsWith(`${prefix}releases/assets/`) && !staged.assets.some(({ id }) => path === `${prefix}releases/assets/${id}`))
        throw new EvidenceMismatch("finalizer selected another asset identity");
      if (method === "PATCH") {
        const current = await releaseRequest(createdPath); requireCreated(current);
        if (current.draft !== true || current.prerelease !== false) throw new EvidenceMismatch("newly created draft changed before public PATCH");
      }
      const result = await releaseRequest(path, options);
      if (path === createdPath) requireCreated(result);
      else if (path.startsWith(`${prefix}releases?`) && Array.isArray(result))
        for (const release of result.filter(candidate => candidate.tag_name === origin.identity.tag)) requireCreated(release);
      return result;
    };
    const finalized = await finalize(acceptedDirectory, origin.context, verification, boundFinalizerRequest);
    if (String(finalized.releaseId) !== String(staged.releaseId)) throw new EvidenceMismatch("finalization changed the newly created Release identity");
    return { ...finalized, mode: "published-continuation", continuation: context };
  } finally { cleanupOwnedRoot(owner); }
}

export function parseContinuationArguments(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    "control-root": { type: "string" }, receipt: { type: "string" }, "proof-artifact-id": { type: "string" },
  } });
  if (positionals.length !== 1 || !["verify", "finalize"].includes(positionals[0]) || !values["control-root"])
    throw new EvidenceMismatch("choose verify/finalize and an explicit trusted control checkout");
  if (positionals[0] === "verify" ? !values.receipt || values["proof-artifact-id"] !== undefined
    : values.receipt !== undefined || !/^[1-9][0-9]*$/u.test(values["proof-artifact-id"] ?? ""))
    throw new EvidenceMismatch("invalid continuation stage arguments");
  return { stage: positionals[0], ...values };
}

export async function main(args = process.argv.slice(2)) {
  const options = parseContinuationArguments(args);
  const context = resolveContinuationFromEnvironment(resolve(options["control-root"]), options.stage);
  const result = await runPublishedContinuation(options.stage, context, { proofArtifactId: options["proof-artifact-id"] });
  if (options.receipt) writeFileSync(resolve(options.receipt), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
