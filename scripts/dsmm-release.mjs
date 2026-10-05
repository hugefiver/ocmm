import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { gunzipSync } from "node:zlib";
import { DW_PRESET_NAMES, LOCALE_EXPORTS, LOCALE_FILES, compiledFilesForVersion, requiresDeepworkMetadata, validateInstallReceipt, validateLocaleResources } from "./dsmm-registry-install-probe.mjs";
import { UI_CHECKS_015, requiresSessionProfileProof, validateSessionProfileProof } from "../dsmm/scripts/profile-ui-harness-native.mjs";

export const POLICY = Object.freeze({
  repository: "hugefiver/ocmm", packageName: "@dsmm/dsmm", defaultBranch: "master",
  workflowFile: ".github/workflows/dsmm-release.yml", registry: "https://registry.npmjs.org/",
  pnpmVersion: "11.9.0", nodeMajor: 24, dshVersion: "0.2.0-rc.2",
  receiptFilename: "docker-receipt-native-session-control.json", checksumsFilename: "SHA256SUMS.txt",
});
export const BOOTSTRAP = Object.freeze({
  version: "0.1.2", tag: "dsmm-scoped-v0.1.2", releaseSha: "6f82a2e5dc366c7bcf13efe67da4fd0c326d0b8a",
  filename: "dsmm-dsmm-0.1.2.tgz", size: 245837,
  sha256: "d3f270edb32c76766c805996f7a30993b45ba938263ff9c73d74f99040190bc7",
  sha1: "78c681c93c045f2ec733c550e6bded576f116e10",
  integrity: "sha512-NwZeld4+Z7ya3YzPtiC9iJlrMar18kQjosgA1oWjOYpEcvpkn7hmJS8JyWZA74YBlilvXM1JVpvSzgDC+pMFFQ==",
  receiptSha256: "e0fb329bf21f7b32ac06ffdbe93c32dadcfd2bf9f078089eceb97e421f0e8f3c",
});
export const BOOTSTRAP_TRANSPORT = Object.freeze({
  repository: POLICY.repository, releaseId: "403185800",
  assetIds: Object.freeze([
    Object.freeze({ name: POLICY.checksumsFilename, id: "610552442" }),
    Object.freeze({ name: POLICY.receiptFilename, id: "610552439" }),
    Object.freeze({ name: BOOTSTRAP.filename, id: "610552438" }),
  ]),
});

const stableVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const sha = /^[a-f0-9]{40}$/u;
const sha256 = /^[a-f0-9]{64}$/u;
const positiveId = /^[1-9]\d*$/u;
const byteOrder = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const invariant = (condition, message) => { if (!condition) throw new Error(message); };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const equal = (actual, expected, label) => invariant(isDeepStrictEqual(actual, expected), `${label} mismatch`);
const complete = (value, label) => equal(value?.outcome, "COMPLETED", label);
const truth = (value, fields, label) => { for (const field of fields) equal(value?.[field], true, `${label}.${field}`); };

export function computeDigests(buffer) {
  invariant(Buffer.isBuffer(buffer), "artifact must be a Buffer");
  return { size: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex"),
    sha1: createHash("sha1").update(buffer).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(buffer).digest("base64")}` };
}

export function resolveReleaseContext(input) {
  equal(input.repository, POLICY.repository, "repository");
  equal(input.defaultBranch ?? POLICY.defaultBranch, POLICY.defaultBranch, "default branch");
  for (const key of ["eventSha", "workflowSha", "controlSha", "peeledSha"]) invariant(sha.test(input[key]), `invalid ${key}`);
  for (const key of ["runId", "runAttempt"]) invariant(positiveId.test(String(input[key])), `invalid ${key}`);
  equal(input.controlSha, input.workflowSha, "control/workflow SHA");
  const mode = input.eventName === "workflow_dispatch" ? "bootstrap" : input.eventName === "push" ? "future" : null;
  invariant(mode, "only workflow_dispatch bootstrap or tag push is permitted");
  let tag, version;
  if (mode === "bootstrap") {
    equal(input.ref, "refs/heads/master", "bootstrap ref");
    equal(input.eventSha, input.controlSha, "bootstrap event/control SHA");
    equal(input.peeledSha, BOOTSTRAP.releaseSha, "bootstrap release SHA");
    invariant(input.controlSha !== BOOTSTRAP.releaseSha, "bootstrap requires new trusted control tooling");
    equal(input.controlInDefaultHistory, true, "trusted control ancestry");
    tag = BOOTSTRAP.tag; version = BOOTSTRAP.version;
  } else {
    invariant(typeof input.ref === "string" && input.ref.startsWith("refs/tags/dsmm-scoped-v"), "invalid future tag ref");
    tag = input.ref.slice("refs/tags/".length); version = tag.slice("dsmm-scoped-v".length);
    invariant(stableVersion.test(version), "only stable canonical SemVer tags are permitted");
    invariant(tag !== BOOTSTRAP.tag, "frozen bootstrap tag cannot enter the future lane");
    equal(input.eventSha, input.peeledSha, "future event/release SHA");
    equal(input.controlSha, input.peeledSha, "future control/release SHA");
    equal(input.sourceInDefaultHistory, true, "trusted source ancestry");
    equal(input.sourceHasControls, true, "source trusted controls");
  }
  equal(input.workflowRef, `${POLICY.repository}/${POLICY.workflowFile}@${input.ref}`, "workflow identity");
  equal(input.packageVersion, version, "source package version");
  return { schemaVersion: 1, repository: POLICY.repository, packageName: POLICY.packageName, mode,
    version, tag, releaseSha: input.peeledSha, controlSha: input.controlSha,
    workflow: { file: POLICY.workflowFile, ref: input.workflowRef, sha: input.workflowSha },
    eventName: input.eventName, eventSha: input.eventSha, ref: input.ref,
    runId: String(input.runId), runAttempt: String(input.runAttempt),
    bootstrapTransport: mode === "bootstrap" ? BOOTSTRAP_TRANSPORT : null,
    bootstrapImport: mode === "bootstrap" ? { job: "import-bootstrap", artifactName: `dsmm-bootstrap-${input.runId}-${input.runAttempt}`,
      runId: String(input.runId), runAttempt: String(input.runAttempt) } : null,
    origin: mode === "bootstrap" ? "frozen-local-bootstrap" : "ci-built",
    provenance: mode === "future", sourceChecks: mode === "bootstrap" ? "NOT_RUN_FROZEN_BOOTSTRAP" : "REQUIRED_BEFORE_FREEZE" };
}

export const UI_CHECKS = Object.freeze([
  "existingBlankStartsAtBaseline", "invalidIdRetainedAndFocused", "createSaveRealFileWithoutApply",
  "nativeNewRootAndExistingBlankIsolation", "changedDraftDoesNotMutatePinnedSelection",
  "browserReloadAndDiskSelectionPersistence", "invalidDraftRetainedAndFocused",
  "realFileCompareAndSwapConflictRetainsDraft", "dirtyDiscardCancelEscapeAndRead", "busyDisablesCompetingCommits",
  "realBackendErrorRetainsDraftAndFiles", "keyboardResetNativeBaselineWithoutChangingExistingRoot",
  "pointerKeyboardReducedMotionZoomAndResponsive", "realNativeSessionScopeAndControlObserver",
]);

export { UI_CHECKS_015, requiresSessionProfileProof };
export const uiChecksForVersion = (version) => requiresSessionProfileProof(version) ? [...UI_CHECKS, ...UI_CHECKS_015] : [...UI_CHECKS];

export function assertSanitizedReceipt(receipt) {
  const inspect = (value) => {
    if (Array.isArray(value)) { value.forEach(inspect); return; }
    if (object(value)) {
      for (const [key, item] of Object.entries(value)) {
        invariant(!/^(?:api[-_]?key|password|secret|token|access[-_]?token|refresh[-_]?token|launch[-_]?token|authorization|cookies?|credentials)$/iu.test(key), "receipt contains a credential field; do not redact frozen evidence in place");
        inspect(item);
      }
    } else if (typeof value === "string") {
      invariant(!/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|\bBearer\s+[A-Za-z0-9._~-]+|[?&](?:token|launchToken|apiKey|access_token)=|\bnpm_[A-Za-z0-9]{20,})/iu.test(value), "receipt contains credential-like material");
    }
  };
  inspect(receipt);
}

export function validateDockerReceipt(receipt, identity) {
  invariant(object(receipt) && object(identity), "receipt and identity must be objects");
  assertSanitizedReceipt(receipt);
  invariant(sha256.test(identity.sha256) && stableVersion.test(identity.version), "invalid receipt identity");
  complete(receipt, "Docker receipt");
  equal(receipt.acceptanceScope, "native-final-artifact", "acceptance scope");
  equal(receipt.dshVersion, POLICY.dshVersion, "native DSH version");
  equal(receipt.artifact?.package, { name: POLICY.packageName, version: identity.version }, "Docker package");
  for (const key of ["sha256", "sha256After", "hostSha256After"]) equal(receipt.artifact?.[key], identity.sha256, `artifact.${key}`);
  invariant(Array.isArray(receipt.installedPackages) && receipt.installedPackages.length === 2, "both exact native package installations required");
  equal(receipt.installedPackages.map((entry) => entry.template).sort(byteOrder), ["headless", "web"], "installed templates");
  for (const entry of receipt.installedPackages) {
    equal(entry.name, POLICY.packageName, "installed package name"); equal(entry.version, identity.version, "installed package version");
    equal(entry.publicExportsResolved, true, "native public exports");
  }
  for (const template of ["web", "headless"]) {
    const native = receipt.native?.[template]; const baseline = receipt.nativeBaseline?.[template];
    complete(native, `native.${template}`); complete(baseline, `baseline.${template}`);
    equal(native.template, template, "native template"); truth(native, ["postAppReady"], `native.${template}`);
    equal(native.presetRegistryPresent, template === "web", "native preset registry");
    truth(baseline, ["postAppReady"], `baseline.${template}`);
    equal(native.model?.kind, "deterministic-test-only-adapter", "native model adapter");
    equal(native.model?.externalModelCalls, false, "external model calls");
    equal(native.uiAuthentication, "NOT_EXERCISED", "native authentication nonclaim");
    if (requiresDeepworkMetadata(identity.version)) {
      equal(native.branding?.pluginTitle, "Deepwork", "native plugin title");
      invariant(Array.isArray(native.branding?.presetNames), "native preset display evidence missing");
      equal([...native.branding.presetNames].sort((left, right) => byteOrder(left.id, right.id)),
        [...DW_PRESET_NAMES].sort((left, right) => byteOrder(left.id, right.id)), "all twelve DW preset names");
      const rootIds = template === "web" ? ["dsmm-orchestrator", "dsmm-planner"] : [];
      if (template === "web") equal([...(native.rootIds ?? [])].sort(byteOrder), [...rootIds].sort(byteOrder), "native branded root IDs");
      invariant(Array.isArray(native.branding?.rootPresetNames), "actual native root display evidence missing");
      equal([...native.branding.rootPresetNames].sort((left, right) => byteOrder(left.id, right.id)),
        DW_PRESET_NAMES.filter((preset) => rootIds.includes(preset.id)).sort((left, right) => byteOrder(left.id, right.id)), "actual native root DW names");
    }
    const persistence = native.persistence;
    equal(persistence?.backendName, "dsmm-session-persistence", "native persistence provider");
    equal(persistence?.stockEntry?.disabled, true, "stock persistence disabled");
    equal(persistence?.dsmmLoaderEntries, 1, "single DSMM loader");
    equal(persistence?.standaloneCompanionEntries, 0, "companion loader absent");
    equal(persistence?.standaloneClientEntries, 0, "standalone client absent");
    truth(persistence, ["capturedFromNativeHost", "metadataCompatible", "singleHostProvider", "startupOnly", "nativeColdReopen", "historyAndNativePolicyUnchanged"], "persistence");
    invariant(typeof persistence.config?.root === "string" && persistence.config.root.length > 0, "native persistence root missing");
    equal(persistence.config, baseline.persistence?.config, "native/baseline persistence configuration");
    equal(persistence.config.compression, "zstd", "native persistence compression");
    equal(baseline.persistence?.backendName, "session-persistence-jsonl", "stock baseline provider");
    equal(baseline.persistence?.stockEntry?.disabled, false, "stock baseline enabled");
    equal(baseline.persistence?.capturedFromNativeHost, true, "baseline captured from native host");
    invariant(Array.isArray(persistence.sessions) && persistence.sessions.length === 2, "both native session roles required");
    equal(persistence.sessions.map((entry) => entry.role).sort(byteOrder), ["readonly-child", "root"], "native session roles");
    for (const session of persistence.sessions) {
      truth(session, ["exactlyOnce", "contiguousSeq", "ignorable", "stockColdReopen", "visibleHistoryUnchanged", "nativeRequestHeaderUnchanged"], "native persisted session");
      invariant(Number.isInteger(session.events) && session.events > 0 && Number.isInteger(session.coreEvents) && session.coreEvents > 0, "native session event evidence missing");
    }
    complete(native.readonlyChild, "native readonly child");
    truth(native.readonlyChild, ["nativeSpawn", "persona"], "native readonly child");
    equal(native.readonlyChild.denied, ["write", "edit", "bash", "pwsh", "dsmm_reviewer", "dsmm_builder"], "readonly child policy");
  }
  truth(receipt.native.web.checks, ["healthyNativeRoster", "exactEnabledRoots"], "native web checks");
  complete(receipt.native.web.blankSelection, "native blank selection");
  truth(receipt.native.web.blankSelection, ["nativeSelect", "personaAndToolsChanged", "mutationRestored", "nativeWriteAndRead"], "native blank selection");
  complete(receipt.native.headless.headlessTools, "native headless tools");
  truth(receipt.native.headless.headlessTools, ["disabledBuilderAbsent"], "native headless tools");
  truth(receipt.native.headless.checks, ["shippedPresetFreeHeadless"], "native headless checks");
  equal(receipt.sourceUnitTests?.outcome, "NOT_RUN", "artifact runner source-test nonclaim");
  const ui = receipt.uiProfiles;
  complete(ui, "UI/profile acceptance"); truth(ui, ["postAppReady"], "UI/profile acceptance");
  equal(ui.kind, "native-client-component-owned-carrier", "UI native carrier");
  equal(ui.artifactSha256, identity.sha256, "UI artifact digest");
  const requiredUiChecks = uiChecksForVersion(identity.version);
  equal(Object.keys(ui.checks ?? {}).sort(byteOrder), requiredUiChecks.sort(byteOrder), "exact UI check set");
  truth(ui.checks, requiredUiChecks, "UI check");
  equal(ui.authentication?.realWebOrDesktopLogin, "NOT_EXERCISED", "UI authentication nonclaim");
  for (const key of ["signedIn", "copiedBrowserState", "productionAuthenticationModified"]) equal(ui.authentication?.[key], false, `authentication.${key}`);
  equal(ui.nativeClient?.rewrittenProductionBundles, false, "native bundles unmodified");
  invariant(typeof ui.installedRoot === "string" && /^\/tmp\/[^\x00-\x1f]+\/node_modules\/@dsmm\/dsmm$/u.test(ui.installedRoot)
    && ui.installedRoot.split("/").every((part) => part !== "." && part !== ".."), "UI must resolve the installed artifact, not checkout code");
  equal(ui.nativeClient?.dsmmClient, `${ui.installedRoot}/lib/client.js`, "installed native client");
  truth(ui.storageProof, ["genuineNativeGateway", "genuineOperatorPeer"], "native UI storage proof");
  equal(ui.storageProof?.cannedProfileRpc, false, "no canned profile RPC");
  truth(ui.nativeStorage, ["ignorableEventCapability", "passedByRunner", "startupOnly"], "native UI storage");
  equal(ui.nativeStorage?.companionLoaderEntry, false, "no companion UI loader");
  equal(ui.nativeStorage?.root, receipt.native.web.persistence.config.root, "UI/native storage root");
  equal(ui.nativeStorage?.compression, "zstd", "UI storage compression");
  equal(ui.nativeStorage?.provider, "dsmm-session-persistence", "UI storage provider");
  invariant(Array.isArray(ui.nativeCalls) && ["describe", "read", "save", "select"].every((method) => ui.nativeCalls.some((call) => call.endpoint === `dsmmProfiles/${method}` && call.strictGateway === true && call.result === "accepted")), "all native profile RPC methods required");
  invariant(Array.isArray(ui.nativeStreams) && ui.nativeStreams.some((stream) => stream.endpoint === "session/control" && stream.strictGateway === true && stream.result === "accepted" && stream.disposed === true && stream.frames > 0), "disposed native session/control stream required");
  truth(ui.cleanup, ["browserContextClosed", "nativeAgentsDisposed", "ownedTemporaryRootRemoved", "nativeHostExited"], "UI cleanup");
  equal(ui.cleanup?.errors, [], "UI cleanup errors");
  if (requiresSessionProfileProof(identity.version)) {
    invariant(["describeSession", "selectSession"].every((method) => ui.nativeCalls.some((call) => call.endpoint === `dsmmProfiles/${method}` && call.strictGateway === true && call.result === "accepted")), "successor scoped native RPC methods required");
    invariant(ui.nativeCalls.some((call) => call.endpoint === "session/modelCatalog" && call.strictGateway === true && call.result === "accepted"), "actual native parameterless catalog RPC required");
    invariant(ui.nativeCalls.some((call) => call.endpoint === "session/selectModel" && call.strictGateway === true && call.result === "accepted"), "actual native user model-selection RPC required");
    validateSessionProfileProof(ui.successorProof, { artifactSha256: identity.sha256, installedRoot: ui.installedRoot });
  }
  const history = receipt.sessionHistory;
  complete(history, "session history"); equal(history.artifactSha256, identity.sha256, "session-history digest");
  equal(history.packageVersion, identity.version, "session-history version"); equal(history.nativeVersion, POLICY.dshVersion, "session-history native version");
  truth(history, ["syntheticOnly", "originalRefused", "dryRunUnchanged", "originalBackupByteIdentical", "repairedNativeReadAndRestore", "retainedModelVisibleHistory", "nativeWriterExclusionBothDirections", "hostsExitedBeforeOperator", "standalonePinnedSdk"], "session history");
  equal(history.installedPackage, { name: POLICY.packageName, version: identity.version }, "session-history installed package");
  equal(history.exactMetadataEvents, 2, "session-history metadata evidence");
  complete(receipt.lsp, "LSP"); truth(receipt.lsp, ["directNativeDiagnosticsAndFormat", "nativeDshMcpClient"], "LSP");
  complete(receipt.profileLifecycle, "profile lifecycle"); truth(receipt.profileLifecycle, ["installRemoveReinstall", "unrelatedSentinelsUnchanged"], "profile lifecycle");
  equal(receipt.temporaryHomesRemoved, true, "temporary home cleanup");
  invariant(!Object.hasOwn(receipt, "failure") && !Object.hasOwn(receipt, "error") && (!Object.hasOwn(receipt, "cleanupFailures") || isDeepStrictEqual(receipt.cleanupFailures, [])), "Docker failure/cleanup evidence contradicts completion");
  invariant(receipt.runtimeImage?.ownership === "owned" || receipt.runtimeImage?.ownership === "borrowed", "runtime image ownership missing");
  equal(receipt.runtimeImage.cleanup, receipt.runtimeImage.ownership === "owned" ? "COMPLETED" : "NOT_APPLICABLE", "Docker image cleanup");
  return { outcome: "COMPLETED", acceptanceScope: receipt.acceptanceScope, uiCheckCount: requiredUiChecks.length,
    sourceUnitTests: "NOT_RUN", realAuthentication: "NOT_EXERCISED" };
}

const PUBLIC_EXPORTS = Object.freeze({
  ".": { types: "./lib/index.d.ts", default: "./lib/index.js" },
  "./preset-skills": { types: "./lib/preset-skills.d.ts", default: "./lib/preset-skills.js" },
  "./session-persistence": { types: "./lib/session-persistence.d.ts", default: "./lib/session-persistence.js" },
  "./client": { types: "./lib/client/index.d.ts", default: "./lib/client.js" }, "./package.json": "./package.json",
});
export function manifestExportsForVersion(version) {
  return requiresDeepworkMetadata(version) ? { ...PUBLIC_EXPORTS, ...Object.fromEntries(Object.entries(LOCALE_EXPORTS).map(([name, path]) => [name, `./${path}`])) } : { ...PUBLIC_EXPORTS };
}
const operatorScripts = ["scripts/repair-session-log.mjs", "scripts/session-repair-native-verifier.mjs"];
const requiredFiles = ["LICENSE", "README.md", "package.json", "cordis.patch.yml", ...operatorScripts,
  "lib/index.js", "lib/index.d.ts", "lib/preset-skills.js", "lib/preset-skills.d.ts", "lib/client.js", "lib/client/index.js", "lib/client/index.d.ts",
  ...["profiles", "profile-types", "profile-store", "profile-runtime", "profile-rpc", "profile-remote", "session-metadata", "session-persistence"].flatMap((name) => [`lib/${name}.js`, `lib/${name}.d.ts`]),
  ...["agent-presets", "compatibility", "design", "lsp", "migration-from-ocmm", "model-routing", "profiles", "releasing", "roadmap", "runtime-recovery", "safety-guards", "settings-status", "skill-sync"].map((name) => `docs/${name}.md`)];

function safeArchivePath(value) {
  invariant(typeof value === "string" && value.startsWith("package/") && !/[\\\x00-\x1f\x7f:]/u.test(value), "unsafe archive path");
  const path = value.replace(/\/$/u, "");
  invariant(path.split("/").every((part) => part !== "" && part !== "." && part !== ".." && !/[. ]$/u.test(part)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part)), "archive traversal or ambiguous cross-platform path");
  return path.slice("package/".length);
}

export function isForbiddenPackagePath(path) {
  const segments = path.toLowerCase().split("/"); const name = segments.at(-1);
  const forbiddenScript = segments.includes("scripts") && !operatorScripts.includes(path) && path !== "skills/debugging/references/scripts/dap.mjs";
  return segments.some((part) => ["src", "test", "tests", "build", "tmp", "temp", "test-home", "test-homes", "node_modules", ".git", ".github", ".codex", "superpowers", "output_test"].includes(part))
    || forbiddenScript || /\.(?:test|spec)\.[^/]+$/iu.test(path) || /\.(?:map|tgz|tar|gz|zip|pem|key|p12|pfx)$/iu.test(name)
    || /^docs\/implementation-plan-[^/]+\.md$/u.test(path) || name === ".npmrc" || name === ".env" || name.startsWith(".env.") || /^(?:credentials|secrets)/u.test(name);
}

export function validateTarballBuffer(buffer, { version, expectedDigests } = {}) {
  invariant(stableVersion.test(version), "invalid expected artifact version");
  const digests = computeDigests(buffer);
  if (expectedDigests) for (const field of ["size", "sha256", "sha1", "integrity"]) if (expectedDigests[field] !== undefined) equal(digests[field], expectedDigests[field], `artifact ${field}`);
  invariant(buffer.length > 0 && buffer.length <= 16 * 1024 * 1024, "invalid compressed artifact size");
  const tar = gunzipSync(buffer, { maxOutputLength: 32 * 1024 * 1024 });
  invariant(tar.length % 512 === 0, "truncated tar archive");
  const files = new Map(); const paths = new Set(); let offset = 0; let terminated = false;
  const textField = (header, start, length) => {
    const field = header.subarray(start, start + length); const end = field.indexOf(0);
    invariant(end < 0 || field.subarray(end).every((byte) => byte === 0), "malformed tar text field");
    const raw = field.subarray(0, end < 0 ? field.length : end); const decoded = raw.toString("utf8");
    invariant(Buffer.from(decoded, "utf8").equals(raw), "invalid UTF-8 tar field"); return decoded;
  };
  const octal = (header, start, length) => {
    const value = header.subarray(start, start + length).toString("ascii").replace(/\0.*$/u, "").trim();
    invariant(/^[0-7]+$/u.test(value), "unsupported or invalid tar numeric field");
    const number = parseInt(value, 8); invariant(Number.isSafeInteger(number), "invalid tar size"); return number;
  };
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      invariant(offset + 1024 <= tar.length && tar.subarray(offset).every((byte) => byte === 0), "tar lacks complete terminator or has appended payload");
      terminated = true; break;
    }
    invariant(paths.size < 5000, "too many archive entries");
    const storedChecksum = octal(header, 148, 8);
    const checksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    equal(checksum, storedChecksum, "tar header checksum");
    const name = textField(header, 0, 100); const prefix = textField(header, 345, 155);
    const entry = safeArchivePath(prefix ? `${prefix}/${name}` : name);
    const canonicalEntry = entry.toLowerCase().normalize("NFC");
    invariant(!paths.has(canonicalEntry), "duplicate or ambiguous archive entry"); paths.add(canonicalEntry);
    const type = header[156]; invariant(type === 0 || type === 48 || type === 53, "archive links, devices and extended metadata are forbidden");
    invariant(textField(header, 157, 100) === "", "archive link target forbidden");
    const size = octal(header, 124, 12); invariant(type !== 53 || size === 0, "invalid archive directory payload");
    invariant((octal(header, 100, 8) & ~0o777) === 0, "privileged archive file mode forbidden");
    invariant(![...files.keys()].some((path) => path.startsWith(`${entry}/`) || entry.startsWith(`${path}/`)), "archive file/directory collision");
    const end = offset + 512 + size; invariant(end <= tar.length, "truncated archive entry");
    invariant(!isForbiddenPackagePath(entry), `forbidden package surface: ${entry}`);
    if (type !== 53) files.set(entry, tar.subarray(offset + 512, end));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  invariant(terminated, "tar archive has no terminator");
  for (const file of requiredFiles) invariant(files.has(file) && files.get(file).length > 0, `missing required package surface: ${file}`);
  if (requiresSessionProfileProof(version)) for (const file of compiledFilesForVersion(version)) {
    invariant(files.has(file) && files.get(file).length > 0, `missing required successor compiled surface: ${file}`);
  }
  for (const tree of ["agent-presets", "docs/research", "patches", "prompts", "skills"]) invariant([...files.keys()].some((path) => path.startsWith(`${tree}/`)), `missing package tree: ${tree}`);
  for (const path of files.keys()) invariant(requiredFiles.includes(path) || /^lib\/.+\.(?:js|d\.ts)$/u.test(path) || /^(?:agent-presets|docs\/research|patches|prompts|skills)\/.+/u.test(path)
    || (requiresDeepworkMetadata(version) && LOCALE_FILES.includes(path)), `unexpected package surface: ${path}`);
  validateLocaleResources(new Map([...files].filter(([path]) => path.startsWith("locale/"))), version);
  const manifest = JSON.parse(files.get("package.json").toString("utf8"));
  invariant(object(manifest), "package manifest must be an object");
  equal(manifest.name, POLICY.packageName, "package name"); equal(manifest.version, version, "package version");
  invariant(!Object.hasOwn(manifest, "private"), "private manifest field forbidden");
  equal(manifest.type, "module", "module type"); equal(manifest.main, "./lib/index.js", "main export"); equal(manifest.types, "./lib/index.d.ts", "types export");
  equal(manifest.exports, manifestExportsForVersion(version), "public exports");
  equal(manifest.publishConfig, { registry: POLICY.registry, access: "public" }, "publish configuration");
  equal(manifest.engines, { node: ">=22" }, "Node engine contract");
  invariant(object(manifest.peerDependencies) && Object.entries(manifest.peerDependencies).filter(([name]) => name.startsWith("@deepseek-ai/dsh-")).every(([, range]) => range === POLICY.dshVersion), "native DSH peers must remain exactly pinned");
  for (const name of ["@deepseek-ai/dsh-typert-protocol", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-session-persistence", "@deepseek-ai/dsh-agent-preset-registry"]) equal(manifest.peerDependencies[name], POLICY.dshVersion, `peer ${name}`);
  for (const name of ["prepublish", "prepublishOnly", "publish", "postpublish", "prepack", "postpack", "prepare", "preinstall", "install", "postinstall"]) invariant(!Object.hasOwn(manifest.scripts ?? {}, name), `package lifecycle ${name} forbidden`);
  const client = files.get("lib/client.js").toString("utf8");
  invariant(!/(?:["']node:|[A-Za-z]:[\\/](?:Users|home)[\\/]|\/Users\/|\/home\/|react-grab|react-scan|react-doctor|localhost:\d+|127\.0\.0\.1:\d+)/iu.test(client), "client bundle leaks host or development code");
  return { ...digests, name: manifest.name, version: manifest.version, fileCount: files.size, manifest, files };
}

export function expectedAssetNames(version) {
  invariant(stableVersion.test(version), "invalid asset version");
  return [`dsmm-dsmm-${version}.tgz`, POLICY.receiptFilename, POLICY.checksumsFilename].sort(byteOrder);
}

export function deterministicChecksums(identity) {
  invariant(sha256.test(identity.sha256) && sha256.test(identity.receiptSha256), "invalid checksum identities");
  const records = [[identity.filename, identity.sha256], [POLICY.receiptFilename, identity.receiptSha256]].sort(([a], [b]) => byteOrder(a, b));
  equal(identity.filename, `dsmm-dsmm-${identity.version}.tgz`, "checksum artifact filename");
  return Buffer.from(records.map(([filename, digest]) => `${digest}  ${filename}\n`).join(""));
}

export function validateArtifactIdentity(identity, { context } = {}) {
  invariant(object(identity), "artifact identity must be an object");
  equal(identity.schemaVersion, 1, "identity schema"); equal(identity.repository, POLICY.repository, "identity repository");
  equal(identity.packageName, POLICY.packageName, "identity package");
  invariant(stableVersion.test(identity.version), "invalid identity version");
  equal(identity.tag, `dsmm-scoped-v${identity.version}`, "identity tag"); equal(identity.filename, `dsmm-dsmm-${identity.version}.tgz`, "identity filename");
  invariant(sha.test(identity.releaseSha) && sha.test(identity.controlSha), "invalid identity commit");
  invariant(positiveId.test(identity.runId) && positiveId.test(identity.runAttempt), "invalid identity run/attempt");
  invariant(sha256.test(identity.sha256) && sha256.test(identity.receiptSha256) && /^[a-f0-9]{40}$/u.test(identity.sha1) && /^sha512-[A-Za-z0-9+/]{86}==$/u.test(identity.integrity), "invalid artifact digest record");
  invariant(Number.isSafeInteger(identity.size) && identity.size > 0, "invalid artifact size");
  invariant(Number.isSafeInteger(identity.receiptSize) && identity.receiptSize > 0, "invalid receipt size");
  equal(identity.receiptFilename, POLICY.receiptFilename, "receipt filename");
  equal(identity.workflow?.file, POLICY.workflowFile, "identity workflow file");
  equal(identity.workflow?.sha, identity.controlSha, "identity workflow SHA");
  invariant(identity.mode === "bootstrap" || identity.mode === "future", "invalid identity mode");
  equal(identity.origin, identity.mode === "bootstrap" ? "frozen-local-bootstrap" : "ci-built", "artifact origin");
  equal(identity.provenance, identity.mode === "future", "artifact provenance policy");
  equal(identity.eventName, identity.mode === "bootstrap" ? "workflow_dispatch" : "push", "identity event");
  equal(identity.ref, identity.mode === "bootstrap" ? "refs/heads/master" : `refs/tags/${identity.tag}`, "identity ref");
  equal(identity.eventSha, identity.mode === "bootstrap" ? identity.controlSha : identity.releaseSha, "identity event SHA");
  equal(identity.workflow.ref, `${POLICY.repository}/${POLICY.workflowFile}@${identity.ref}`, "identity workflow ref");
  if (identity.mode === "future") equal(identity.controlSha, identity.releaseSha, "future source/control identity");
  equal(identity.dockerAcceptance?.outcome, "COMPLETED", "artifact Docker acceptance");
  equal(identity.dockerAcceptance?.origin, identity.mode === "bootstrap" ? "imported-local-receipt" : "fresh-ci-artifact", "Docker evidence origin");
  equal(identity.sourceChecks, identity.mode === "bootstrap" ? "NOT_RUN_FROZEN_BOOTSTRAP" : "COMPLETED", "source-check policy");
  if (identity.mode === "bootstrap") {
    invariant(identity.controlSha !== BOOTSTRAP.releaseSha, "bootstrap identity requires distinct new trusted controls");
    for (const key of ["version", "tag", "releaseSha", "filename", "size", "sha256", "sha1", "integrity", "receiptSha256"]) equal(identity[key], BOOTSTRAP[key], `frozen bootstrap ${key}`);
    equal(identity.bootstrapTransport, BOOTSTRAP_TRANSPORT, "original bootstrap transport identity");
    equal(identity.bootstrapImport, { job: "import-bootstrap", artifactName: `dsmm-bootstrap-${identity.runId}-${identity.runAttempt}`,
      runId: identity.runId, runAttempt: identity.runAttempt }, "run-bound bootstrap import");
  } else {
    equal(identity.bootstrapTransport, null, "future transport is not the frozen bootstrap");
    equal(identity.bootstrapImport, null, "future bootstrap import is not applicable");
  }
  if (context) for (const key of ["repository", "packageName", "mode", "version", "tag", "releaseSha", "controlSha", "workflow", "eventName", "eventSha", "ref", "runId", "runAttempt", "origin", "provenance", "bootstrapTransport", "bootstrapImport"]) equal(identity[key], context[key], `run-bound ${key}`);
  return identity;
}

export function createArtifactIdentity(context, tarballBuffer, receiptBuffer, { sourceChecks } = {}) {
  const artifact = validateTarballBuffer(tarballBuffer, { version: context.version, expectedDigests: context.mode === "bootstrap" ? BOOTSTRAP : undefined });
  const receiptSha256 = computeDigests(receiptBuffer).sha256;
  if (context.mode === "bootstrap") equal(receiptSha256, BOOTSTRAP.receiptSha256, "frozen Docker receipt digest");
  const acceptance = validateDockerReceipt(JSON.parse(receiptBuffer.toString("utf8")), { version: context.version, sha256: artifact.sha256 });
  const identity = { ...context, filename: `dsmm-dsmm-${context.version}.tgz`, size: artifact.size, sha256: artifact.sha256,
    sha1: artifact.sha1, integrity: artifact.integrity, receiptFilename: POLICY.receiptFilename, receiptSha256,
    receiptSize: receiptBuffer.length, sourceChecks: context.mode === "bootstrap" ? "NOT_RUN_FROZEN_BOOTSTRAP" : sourceChecks,
    dockerAcceptance: { ...acceptance, origin: context.mode === "bootstrap" ? "imported-local-receipt" : "fresh-ci-artifact" } };
  return validateArtifactIdentity(identity, { context });
}

export function readArtifactIdentity(path) { return validateArtifactIdentity(JSON.parse(readFileSync(path, "utf8"))); }

export function validateBootstrapTransport(release) {
  equal(String(release?.id), BOOTSTRAP_TRANSPORT.releaseId, "original bootstrap Release ID");
  equal(release?.tag_name, BOOTSTRAP.tag, "original bootstrap Release tag");
  invariant(Array.isArray(release.assets), "original bootstrap assets missing");
  equal(release.assets.map(({ name, id }) => ({ name, id: String(id) })).sort((left, right) => byteOrder(left.name, right.name)),
    BOOTSTRAP_TRANSPORT.assetIds, "original bootstrap asset name/ID map");
  return release;
}

export function validateTransportAssets(release, assets, identity, { requireDraft = true } = {}) {
  validateArtifactIdentity(identity);
  if (identity.mode === "bootstrap") validateBootstrapTransport(release);
  invariant(object(release) && positiveId.test(String(release.id)), "invalid release identity");
  if (release.url !== undefined) equal(release.url, `https://api.github.com/repos/${POLICY.repository}/releases/${release.id}`, "Release repository API identity");
  if (release.html_url !== undefined) {
    const canonicalUrl = `https://github.com/${POLICY.repository}/releases/tag/${identity.tag}`;
    const draftPrefix = `https://github.com/${POLICY.repository}/releases/tag/untagged-`;
    invariant(release.html_url === canonicalUrl || (release.draft === true && typeof release.html_url === "string"
      && release.html_url.startsWith(draftPrefix) && /^[A-Za-z0-9_-]+$/u.test(release.html_url.slice(draftPrefix.length))), "Release repository public identity mismatch");
  }
  equal(release.tag_name, identity.tag, "Release tag"); equal(release.draft, requireDraft, "Release public/draft state");
  equal(release.prerelease, false, "Release prerelease state");
  invariant(Array.isArray(release.assets), "Release assets missing");
  equal(release.assets.map((asset) => asset.name).sort(byteOrder), expectedAssetNames(identity.version), "exact Release asset set");
  invariant(assets instanceof Map, "downloaded assets must be a Map");
  equal([...assets.keys()].sort(byteOrder), expectedAssetNames(identity.version), "exact downloaded asset set");
  const ids = new Set();
  for (const asset of release.assets) {
    invariant(positiveId.test(String(asset.id)) && !ids.has(asset.id), "invalid or duplicate asset ID"); ids.add(asset.id);
    invariant(asset.state === "uploaded", "asset upload incomplete");
    if (asset.url !== undefined) equal(asset.url, `https://api.github.com/repos/${POLICY.repository}/releases/assets/${asset.id}`, "asset repository identity");
    equal(asset.size, assets.get(asset.name).length, "asset metadata size");
    if (asset.digest != null) equal(asset.digest, `sha256:${computeDigests(assets.get(asset.name)).sha256}`, "GitHub asset digest");
  }
  validateTarballBuffer(assets.get(identity.filename), { version: identity.version, expectedDigests: identity });
  const receiptBuffer = assets.get(POLICY.receiptFilename);
  equal(computeDigests(receiptBuffer).sha256, identity.receiptSha256, "transport receipt digest");
  equal(receiptBuffer.length, identity.receiptSize, "transport receipt size");
  validateDockerReceipt(JSON.parse(receiptBuffer.toString("utf8")), identity);
  equal(assets.get(POLICY.checksumsFilename), deterministicChecksums(identity), "deterministic checksum bytes");
  return { releaseId: String(release.id), assets: release.assets.map(({ id, name }) => ({ id: String(id), name })) };
}

function exclusivelyWrite(path, buffer) { writeFileSync(path, buffer, { flag: "wx" }); }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`); }
function emptyOwnedDirectory(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
  invariant(lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink() && readdirSync(path).length === 0, "output directory must be initially empty and not a symlink");
}

export function prepareTransport(directory, context, { tarballPath, receiptPath, sourceChecks } = {}) {
  const tarballBuffer = readFileSync(tarballPath); const receiptBuffer = readFileSync(receiptPath);
  const identity = createArtifactIdentity(context, tarballBuffer, receiptBuffer, { sourceChecks });
  emptyOwnedDirectory(directory);
  exclusivelyWrite(join(directory, identity.filename), tarballBuffer);
  exclusivelyWrite(join(directory, POLICY.receiptFilename), receiptBuffer);
  exclusivelyWrite(join(directory, POLICY.checksumsFilename), deterministicChecksums(identity));
  exclusivelyWrite(join(directory, "identity.json"), jsonBytes(identity));
  exclusivelyWrite(join(directory, "context.json"), jsonBytes(context));
  return identity;
}

export function validateArtifactDirectory(directory, context) {
  equal(readdirSync(directory).sort(byteOrder), [...expectedAssetNames(context.version), "identity.json", "context.json"].sort(byteOrder), "exact accepted artifact file set");
  for (const name of readdirSync(directory)) invariant(lstatSync(join(directory, name)).isFile() && !lstatSync(join(directory, name)).isSymbolicLink(), "artifact files must not be links");
  equal(JSON.parse(readFileSync(join(directory, "context.json"), "utf8")), context, "downloaded run context");
  const identity = validateArtifactIdentity(readArtifactIdentity(join(directory, "identity.json")), { context });
  const assets = new Map(expectedAssetNames(context.version).map((name) => [name, readFileSync(join(directory, name))]));
  validateTarballBuffer(assets.get(identity.filename), { version: identity.version, expectedDigests: identity });
  equal(computeDigests(assets.get(POLICY.receiptFilename)).sha256, identity.receiptSha256, "accepted receipt digest");
  equal(assets.get(POLICY.receiptFilename).length, identity.receiptSize, "accepted receipt size");
  validateDockerReceipt(JSON.parse(assets.get(POLICY.receiptFilename).toString("utf8")), identity);
  equal(assets.get(POLICY.checksumsFilename), deterministicChecksums(identity), "accepted checksum bytes");
  return identity;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: false, windowsHide: true, maxBuffer: 4 * 1024 * 1024, ...options });
  invariant(!result.error && result.status === 0, `${basename(command)} command failed; immutable state is preserved`);
  return result.stdout.trim();
}
function git(root, args) { return run("git", ["-C", root, ...args]); }
function hasGitPath(root, commit, path) { return spawnSync("git", ["-C", root, "cat-file", "-e", `${commit}:${path}`], { shell: false, windowsHide: true, stdio: "ignore" }).status === 0; }
function isAncestor(root, commit) { return spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", commit, "refs/remotes/origin/master"], { shell: false, windowsHide: true, stdio: "ignore" }).status === 0; }

export function resolveContextFromEnvironment(controlRoot, env = process.env) {
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  equal(event.repository?.full_name, POLICY.repository, "event repository");
  equal(event.repository?.default_branch, POLICY.defaultBranch, "event default branch");
  if (env.GITHUB_EVENT_NAME === "workflow_dispatch") equal(event.inputs ?? {}, {}, "bootstrap exposes no caller-controlled inputs");
  const tag = env.GITHUB_EVENT_NAME === "workflow_dispatch" ? BOOTSTRAP.tag : String(env.GITHUB_REF).slice("refs/tags/".length);
  invariant(/^dsmm-scoped-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(tag), "unsafe tag");
  const peeledSha = git(controlRoot, ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
  const controlSha = git(controlRoot, ["rev-parse", "HEAD"]);
  if (env.GITHUB_EVENT_NAME === "push") {
    equal(event.ref, env.GITHUB_REF, "push event ref");
    invariant(sha.test(event.after), "invalid push event object");
    equal(git(controlRoot, ["rev-parse", "--verify", `${event.after}^{commit}`]), peeledSha, "push event peeled object");
    equal(event.deleted, false, "deleted tag forbidden");
  }
  invariant(hasGitPath(controlRoot, controlSha, POLICY.workflowFile) && hasGitPath(controlRoot, controlSha, "scripts/dsmm-release.mjs"), "checkout is missing trusted controls");
  const manifest = JSON.parse(git(controlRoot, ["show", `${peeledSha}:dsmm/package.json`]));
  equal(manifest.name, POLICY.packageName, "source package name");
  return resolveReleaseContext({ repository: env.GITHUB_REPOSITORY, defaultBranch: event.repository.default_branch,
    eventName: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF, eventSha: env.GITHUB_SHA,
    workflowRef: env.GITHUB_WORKFLOW_REF, workflowSha: env.GITHUB_WORKFLOW_SHA, controlSha, peeledSha,
    runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, packageVersion: manifest.version,
    controlInDefaultHistory: isAncestor(controlRoot, controlSha), sourceInDefaultHistory: isAncestor(controlRoot, peeledSha),
    sourceHasControls: hasGitPath(controlRoot, peeledSha, POLICY.workflowFile) && hasGitPath(controlRoot, peeledSha, "scripts/dsmm-release.mjs") });
}

async function responseBuffer(response, maxBytes = 16 * 1024 * 1024) {
  const length = response.headers.get("content-length");
  invariant(length === null || Number(length) <= maxBytes, "download exceeds permitted size");
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; invariant(size <= maxBytes, "download exceeds permitted size"); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}

export async function githubRequest(path, { method = "GET", body, binary = false, allow404 = false, token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN } = {}) {
  const pagination = typeof path === "string" && /^\/repos\/hugefiver\/ocmm\/releases\?per_page=100&page=(?:[1-9]|1[0-9]|20)$/u.test(path);
  invariant(typeof path === "string" && path.startsWith(`/repos/${POLICY.repository}/`)
    && (!/[?#\s]/u.test(path) || (pagination && method === "GET" && body === undefined && !binary && !allow404)), "untrusted GitHub API path");
  if (pagination) invariant(typeof token === "string" && token.length > 0, "authenticated GitHub Release list is required to inspect drafts");
  const headers = { Accept: binary ? "application/octet-stream" : "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`https://api.github.com${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  if (response.status === 404 && allow404) return null;
  invariant(response.ok, `GitHub ${method} failed (HTTP ${response.status}); no repair or overwrite attempted`);
  return binary ? responseBuffer(response) : response.json();
}

export async function findReleaseByTag(tag, request = githubRequest) {
  invariant(typeof tag === "string" && /^dsmm-scoped-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(tag), "unsafe Release lookup tag");
  // The tag endpoint can return 404 for a draft visible to the authenticated list/ID endpoints.
  // Scan the complete bounded list before treating a tag as absent or choosing an exact ID.
  const seen = new Set(); let match = null; let completeList = false;
  for (let page = 1; page <= 20; page++) {
    const releases = await request(`/repos/${POLICY.repository}/releases?per_page=100&page=${page}`);
    invariant(Array.isArray(releases) && releases.length <= 100, "invalid GitHub Release page");
    for (const release of releases) {
      invariant(object(release) && positiveId.test(String(release.id)) && typeof release.tag_name === "string"
        && typeof release.draft === "boolean" && typeof release.prerelease === "boolean", "invalid GitHub Release list identity");
      const id = String(release.id); invariant(!seen.has(id), "duplicate/conflicting Release IDs in paginated lookup"); seen.add(id);
      if (release.tag_name === tag) { invariant(match === null, "ambiguous Releases for exact tag"); match = release; }
    }
    if (releases.length < 100) { completeList = true; break; }
  }
  invariant(completeList, "GitHub Release list incomplete at bounded pagination limit");
  if (match === null) return null;
  const release = await request(`/repos/${POLICY.repository}/releases/${match.id}`);
  equal(String(release?.id), String(match.id), "re-fetched Release ID"); equal(release?.tag_name, tag, "re-fetched Release tag");
  equal(release?.draft, match.draft, "re-fetched Release draft state"); equal(release?.prerelease, match.prerelease, "re-fetched Release prerelease state");
  if (release.url !== undefined) equal(release.url, `https://api.github.com/repos/${POLICY.repository}/releases/${match.id}`, "re-fetched Release repository");
  return release;
}

export async function remotePeelTag(tag, request = githubRequest) {
  invariant(typeof tag === "string" && /^dsmm-scoped-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(tag), "unsafe remote tag");
  const ref = await request(`/repos/${POLICY.repository}/git/ref/tags/${tag}`);
  equal(ref?.ref, `refs/tags/${tag}`, "remote tag ref");
  invariant(object(ref.object) && sha.test(ref.object.sha), "remote tag object ID missing");
  let current = ref.object; const visited = new Set(); let depth = 0;
  while (current.type === "tag") {
    invariant(depth < 8 && !visited.has(current.sha), "remote annotated tag depth/cycle rejected");
    invariant(sha.test(current.sha), "invalid remote annotated tag ID"); visited.add(current.sha); depth++;
    const annotated = await request(`/repos/${POLICY.repository}/git/tags/${current.sha}`);
    equal(annotated?.sha, current.sha, "remote annotated tag identity");
    invariant(object(annotated.object) && sha.test(annotated.object.sha), "remote annotated tag target missing");
    current = annotated.object;
  }
  equal(current.type, "commit", "remote tag must peel to a commit");
  invariant(sha.test(current.sha), "invalid remote release commit");
  return current.sha;
}

export async function verifyRemoteReleaseTag(identity, request = githubRequest) {
  equal(identity.repository, POLICY.repository, "remote release repository");
  equal(identity.tag, `dsmm-scoped-v${identity.version}`, "remote release tag identity");
  invariant(sha.test(identity.releaseSha), "invalid remote expected commit");
  equal(await remotePeelTag(identity.tag, request), identity.releaseSha, "remote immutable release commit");
  return { repository: POLICY.repository, tag: identity.tag, releaseSha: identity.releaseSha };
}

export async function downloadReleaseAssets(release, version, request = githubRequest) {
  equal(release.assets?.map((asset) => asset.name).sort(byteOrder), expectedAssetNames(version), "exact GitHub asset names");
  const assets = new Map();
  for (const asset of release.assets) {
    invariant(positiveId.test(String(asset.id)) && asset.state === "uploaded", "invalid GitHub asset identity");
    const buffer = await request(`/repos/${POLICY.repository}/releases/assets/${asset.id}`, { binary: true });
    equal(buffer.length, asset.size, "GitHub downloaded size"); assets.set(asset.name, buffer);
  }
  return assets;
}

export async function downloadBootstrap(directory, context, request = githubRequest) {
  equal(context.mode, "bootstrap", "bootstrap mode");
  const release = await findReleaseByTag(BOOTSTRAP.tag, request);
  invariant(release, "frozen bootstrap draft transport is absent");
  validateBootstrapTransport(release);
  equal(release.tag_name, BOOTSTRAP.tag, "bootstrap draft tag"); equal(release.draft, true, "bootstrap must use a draft transport");
  const assets = await downloadReleaseAssets(release, context.version, request);
  const identity = createArtifactIdentity(context, assets.get(BOOTSTRAP.filename), assets.get(POLICY.receiptFilename));
  validateTransportAssets(release, assets, identity);
  emptyOwnedDirectory(directory);
  for (const [name, buffer] of assets) exclusivelyWrite(join(directory, name), buffer);
  exclusivelyWrite(join(directory, "identity.json"), jsonBytes(identity)); exclusivelyWrite(join(directory, "context.json"), jsonBytes(context));
  return identity;
}

export function validateRegistryMetadata(metadata, identity) {
  equal(metadata?.name, POLICY.packageName, "registry name"); equal(metadata?.version, identity.version, "registry version");
  equal(metadata?.dist?.shasum, identity.sha1, "registry SHA1"); equal(metadata?.dist?.integrity, identity.integrity, "registry SHA512 integrity");
  equal(metadata?.dist?.tarball, `${POLICY.registry}@dsmm/dsmm/-/dsmm-${identity.version}.tgz`, "registry tarball URL");
  return metadata;
}

export function validateRegistryProvenance(attestations, identity) {
  invariant(identity.mode === "future", "bootstrap must not claim CI build provenance");
  invariant(Array.isArray(attestations?.attestations), "npm attestations response missing");
  const candidates = attestations.attestations.filter((entry) => entry.predicateType === "https://slsa.dev/provenance/v1");
  invariant(candidates.length === 1, "one supported genuine CI provenance statement required");
  const envelope = candidates[0].bundle?.dsseEnvelope;
  equal(envelope?.payloadType, "application/vnd.in-toto+json", "provenance envelope type");
  invariant(Array.isArray(envelope.signatures) && envelope.signatures.length > 0 && envelope.signatures.every((entry) => typeof entry.sig === "string" && entry.sig.length > 0), "provenance envelope signatures missing");
  invariant(typeof envelope.payload === "string" && envelope.payload.length <= 2 * 1024 * 1024 && /^[A-Za-z0-9+/]+={0,2}$/u.test(envelope.payload), "invalid provenance payload");
  const statement = JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8"));
  equal(statement._type, "https://in-toto.io/Statement/v1", "provenance statement type");
  equal(statement.predicateType, "https://slsa.dev/provenance/v1", "provenance predicate type");
  invariant(Array.isArray(statement.subject) && statement.subject.length === 1, "provenance exact package subject required");
  equal(statement.subject[0].name, `pkg:npm/%40dsmm/dsmm@${identity.version}`, "provenance package subject");
  equal(statement.subject[0].digest?.sha512, Buffer.from(identity.integrity.slice("sha512-".length), "base64").toString("hex"), "provenance subject digest");
  const definition = statement.predicate?.buildDefinition;
  equal(definition?.buildType, "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1", "provenance build type");
  equal(definition?.externalParameters?.workflow, { ref: identity.ref, repository: `https://github.com/${POLICY.repository}`, path: POLICY.workflowFile }, "provenance workflow/source ref");
  invariant(Array.isArray(definition.resolvedDependencies) && definition.resolvedDependencies.some((dependency) => dependency.uri === `git+https://github.com/${POLICY.repository}@${identity.ref}` && dependency.digest?.gitCommit === identity.releaseSha), "provenance tagged source commit missing");
  const runDetails = statement.predicate?.runDetails;
  equal(runDetails?.builder?.id, "https://github.com/actions/runner/github-hosted", "provenance hosted builder");
  equal(runDetails?.metadata?.invocationId, `https://github.com/${POLICY.repository}/actions/runs/${identity.runId}/attempts/${identity.runAttempt}`, "provenance run/attempt");
  equal(identity.controlSha, identity.releaseSha, "provenance control/source SHA");
  return { outcome: "COMPLETED", source: "npm-registry-served-validated-attestation-over-https", predicateType: statement.predicateType,
    sourceSha: identity.releaseSha, workflowFile: POLICY.workflowFile, runId: identity.runId, runAttempt: identity.runAttempt,
    independentSigstoreVerification: false };
}

export async function registryVersion(version, fetcher = fetch) {
  invariant(stableVersion.test(version), "invalid registry version");
  const response = await fetcher(`${POLICY.registry}@dsmm%2fdsmm/${version}`, { signal: AbortSignal.timeout(60000), redirect: "error" });
  if (response.status === 404) return null;
  invariant(response.ok, `registry identity check failed (HTTP ${response.status}); publication forbidden`);
  return JSON.parse((await responseBuffer(response, 2 * 1024 * 1024)).toString("utf8"));
}

export async function verifyRegistryArtifact(identity, fetcher = fetch, { visibilityDeadlineMs = 120_000, visibilityPollMs = 2_000, now = Date.now, wait = (ms) => new Promise((settle) => setTimeout(settle, ms)) } = {}) {
  validateArtifactIdentity(identity);
  // This is an after-publication read path only. Absence checks used by the
  // publisher stay single-shot and can never admit a collision or republish.
  const poll404 = identity.mode === "future" && requiresSessionProfileProof(identity.version);
  invariant(Number.isSafeInteger(visibilityDeadlineMs) && visibilityDeadlineMs >= 0 && visibilityDeadlineMs <= 300_000, "invalid registry visibility deadline");
  invariant(Number.isSafeInteger(visibilityPollMs) && visibilityPollMs > 0 && visibilityPollMs <= 10_000, "invalid registry visibility poll");
  const deadline = now() + visibilityDeadlineMs;
  let metadata;
  do {
    metadata = await registryVersion(identity.version, fetcher);
    if (metadata !== null || !poll404 || now() >= deadline) break;
    await wait(Math.min(visibilityPollMs, deadline - now()));
  } while (now() <= deadline);
  invariant(metadata !== null, "exact registry version is absent"); validateRegistryMetadata(metadata, identity);
  const response = await fetcher(metadata.dist.tarball, { signal: AbortSignal.timeout(60000), redirect: "error" });
  invariant(response.ok, `registry tarball download failed (HTTP ${response.status})`);
  const bytes = await responseBuffer(response);
  const artifact = validateTarballBuffer(bytes, { version: identity.version, expectedDigests: identity });
  let provenance;
  if (identity.mode === "bootstrap") {
    invariant(metadata.dist.attestations?.provenance == null, "frozen local bootstrap must not have CI-built provenance");
    provenance = { outcome: "NOT_CLAIMED_FROZEN_LOCAL_BOOTSTRAP", enabled: false, independentSigstoreVerification: false };
  } else {
    const expectedUrl = `${POLICY.registry}-/npm/v1/attestations/@dsmm%2fdsmm@${identity.version}`;
    equal(metadata.dist.attestations?.url, expectedUrl, "npm attestation URL");
    equal(metadata.dist.attestations?.provenance?.predicateType, "https://slsa.dev/provenance/v1", "npm provenance type");
    const attestationResponse = await fetcher(expectedUrl, { signal: AbortSignal.timeout(60000), redirect: "error" });
    invariant(attestationResponse.ok, "npm provenance unavailable");
    const attestationBytes = await responseBuffer(attestationResponse, 2 * 1024 * 1024);
    provenance = validateRegistryProvenance(JSON.parse(attestationBytes.toString("utf8")), identity);
  }
  return { outcome: "COMPLETED", registry: POLICY.registry, name: POLICY.packageName, version: identity.version,
    size: artifact.size, sha256: artifact.sha256, sha1: artifact.sha1, integrity: artifact.integrity,
    metadata: { name: metadata.name, version: metadata.version, dist: metadata.dist }, provenance, tarball: bytes };
}

export function assertPublishEnvironment(env) {
  equal(env.GITHUB_ACTIONS, "true", "GitHub Actions OIDC environment");
  invariant(env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, "OIDC request variables are required; no static fallback permitted");
  const oidcUrl = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  invariant(oidcUrl.protocol === "https:" && /(?:^|\.)actions\.githubusercontent\.com$/u.test(oidcUrl.hostname), "invalid GitHub OIDC endpoint");
  for (const [key, value] of Object.entries(env)) {
    if (!value || key === "ACTIONS_ID_TOKEN_REQUEST_TOKEN" || key === "GH_TOKEN" || key === "GITHUB_TOKEN") continue;
    invariant(!/(?:NODE_AUTH_TOKEN|NPM_TOKEN|PNPM_TOKEN|NPM_ID_TOKEN|SIGSTORE_ID_TOKEN|NPM_(?:USERNAME|PASSWORD|OTP)|NPM_CONFIG_.*(?:AUTH|TOKEN|PASSWORD|CERT|KEY))/iu.test(key), "static npm authentication/configuration is forbidden");
  }
}

export function publishArguments(identity, tarballPath) {
  validateArtifactIdentity(identity);
  equal(basename(tarballPath), identity.filename, "publish tarball filename");
  return ["publish", tarballPath, "--access", "public", `--registry=${POLICY.registry}`, "--ignore-scripts", "--no-git-checks",
    "--config.fetch-retries=0", identity.mode === "bootstrap" ? "--config.provenance=false" : "--provenance"];
}

export async function publishArtifact(directory, context, workDirectory, { env = process.env, fetcher = fetch, execute = run, nodeVersion = process.versions.node, request = githubRequest } = {}) {
  const identity = validateArtifactDirectory(directory, context);
  assertPublishEnvironment(env);
  equal(Number(nodeVersion.split(".")[0]), POLICY.nodeMajor, "publishing Node runtime");
  // Version conflicts are never implicit authorization to retry or repair a publication.
  invariant(await registryVersion(identity.version, fetcher) === null, "registry version already exists; stop for explicit same-identity continuation authority");
  emptyOwnedDirectory(workDirectory);
  // Corepack activation lives in the original HOME, which publication must not inherit.
  exclusivelyWrite(join(workDirectory, "package.json"), jsonBytes({ packageManager: `pnpm@${POLICY.pnpmVersion}` }));
  const artifactPath = join(workDirectory, identity.filename);
  exclusivelyWrite(artifactPath, readFileSync(join(directory, identity.filename)));
  const configPath = join(workDirectory, "publish.npmrc");
  exclusivelyWrite(configPath, Buffer.from(`registry=${POLICY.registry}\naccess=public\nignore-scripts=true\nfetch-retries=0\nprovenance=${identity.provenance}\n`));
  const publishEnv = Object.fromEntries(Object.entries(env).filter(([key]) => !/^(?:npm_config_|PNPM_|COREPACK_)/iu.test(key)));
  const isolatedHome = join(workDirectory, "home"); mkdirSync(isolatedHome);
  Object.assign(publishEnv, { HOME: isolatedHome, USERPROFILE: isolatedHome, XDG_CONFIG_HOME: join(isolatedHome, "config"),
    XDG_DATA_HOME: join(isolatedHome, "data"), XDG_CACHE_HOME: join(isolatedHome, "cache"), XDG_STATE_HOME: join(isolatedHome, "state"),
    NPM_CONFIG_USERCONFIG: configPath, NPM_CONFIG_GLOBALCONFIG: join(workDirectory, "empty-global.npmrc"),
    npm_config_userconfig: configPath, npm_config_globalconfig: join(workDirectory, "empty-global.npmrc"), CI: "true" });
  exclusivelyWrite(join(workDirectory, "empty-global.npmrc"), Buffer.alloc(0));
  equal(execute("pnpm", ["--version"], { cwd: workDirectory, env: publishEnv }), POLICY.pnpmVersion, "publishing pnpm runtime");
  equal(computeDigests(readFileSync(artifactPath)).sha256, identity.sha256, "pre-publish bytes");
  await verifyRemoteReleaseTag(identity, request);
  invariant(await registryVersion(identity.version, fetcher) === null, "registry version appeared before upload; no publication attempted");
  let failure;
  try { execute("pnpm", publishArguments(identity, artifactPath), { cwd: workDirectory, env: publishEnv, timeout: 600000 }); } catch (error) { failure = error; }
  equal(computeDigests(readFileSync(artifactPath)).sha256, identity.sha256, "post-publish bytes");
  equal(computeDigests(readFileSync(join(directory, identity.filename))).sha256, identity.sha256, "accepted artifact remains frozen");
  if (failure) throw new Error("publish failed or ambiguous; no retry attempted; inspect public state read-only before separately authorized continuation");
  return { outcome: "SUBMITTED_NOT_VERIFIED", sha256: identity.sha256, provenance: identity.provenance, authentication: "OIDC_ONLY", retries: 0 };
}

function releaseNotes(identity) {
  return `@dsmm/dsmm ${identity.version}\n\nPackage source: ${identity.releaseSha}\nTrusted workflow control: ${identity.controlSha}\nArtifact SHA256: ${identity.sha256}\nDocker acceptance receipt SHA256: ${identity.receiptSha256}\n\n${identity.mode === "bootstrap" ? "Frozen local bootstrap: imported prior native final-artifact Docker acceptance; no source rebuild, repack or fresh CI Docker claim. OIDC-authenticated exact-byte publication with build provenance explicitly disabled." : "Built and packed once from the tagged source in CI; fresh independent native final-artifact Docker acceptance; OIDC-authenticated exact-byte publication with genuine CI provenance."}\nReal authentication and Desktop integration were not exercised.\n`;
}

export async function uploadReleaseAsset(releaseId, name, bytes, { fetcher = fetch, token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN } = {}) {
  invariant(positiveId.test(String(releaseId)) && typeof name === "string" && /^(?:dsmm-dsmm-(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.tgz|docker-receipt-native-session-control\.json|SHA256SUMS\.txt)$/u.test(name), "unsafe upload identity");
  invariant(typeof token === "string" && token.length > 0, "GitHub Release upload token unavailable");
  const response = await fetcher(`https://uploads.github.com/repos/${POLICY.repository}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream", "X-GitHub-Api-Version": "2022-11-28" },
    body: bytes, signal: AbortSignal.timeout(60000), redirect: "error" });
  invariant(response.ok, `draft asset upload failed (HTTP ${response.status}); partial state preserved, no overwrite/retry`);
  return response.json();
}

export async function stageDraftTransport(directory, context, request = githubRequest, upload = uploadReleaseAsset) {
  const identity = validateArtifactDirectory(directory, context);
  const existing = await findReleaseByTag(identity.tag, request);
  if (context.mode === "bootstrap") {
    invariant(existing, "frozen bootstrap draft transport is absent");
    return validateTransportAssets(existing, await downloadReleaseAssets(existing, identity.version, request), identity);
  }
  invariant(existing === null, "Release already exists; no overwrite or implicit partial-state continuation permitted");
  await verifyRemoteReleaseTag(identity, request);
  const release = await request(`/repos/${POLICY.repository}/releases`, { method: "POST", body: { tag_name: identity.tag, target_commitish: identity.releaseSha, name: `@dsmm/dsmm ${identity.version}`, body: releaseNotes(identity), draft: true, prerelease: false } });
  invariant(positiveId.test(String(release.id)), "invalid created draft Release identity");
  // Upload routes are constructed from the returned ID, never from caller/Release URLs.
  for (const name of expectedAssetNames(identity.version)) {
    await verifyRemoteReleaseTag(identity, request);
    await upload(release.id, name, readFileSync(join(directory, name)));
  }
  const staged = await request(`/repos/${POLICY.repository}/releases/${release.id}`);
  equal(String(staged?.id), String(release.id), "staged Release ID");
  return validateTransportAssets(staged, await downloadReleaseAssets(staged, identity.version, request), identity);
}

export function validateFinalizationEvidence(evidence, identity) {
  complete(evidence, "registry/install verification");
  for (const field of ["sha256", "receiptSha256", "runId", "runAttempt", "controlSha", "releaseSha"]) equal(evidence.identity?.[field], identity[field], `verification ${field}`);
  complete(evidence.registry, "registry verification");
  for (const field of ["size", "sha256", "sha1", "integrity"]) equal(evidence.registry[field], identity[field], `verified registry ${field}`);
  equal(evidence.registry.name, POLICY.packageName, "verified registry package"); equal(evidence.registry.version, identity.version, "verified registry version");
  validateInstallReceipt(evidence.freshInstall, { version: identity.version, sha256: identity.sha256 });
  for (const field of ["size", "sha1", "integrity"]) equal(evidence.freshInstall.registry[field], identity[field], `installed registry ${field}`);
  return evidence;
}

export async function finalizeRelease(directory, context, verification, request = githubRequest, { registryCheck = verifyRegistryArtifact } = {}) {
  const identity = validateArtifactDirectory(directory, context);
  validateFinalizationEvidence(verification, identity);
  // Recheck registry bytes at the public-Release boundary, not only prior job status.
  await registryCheck(identity);
  const release = await findReleaseByTag(identity.tag, request);
  invariant(release, "accepted draft transport is absent before finalization");
  validateTransportAssets(release, await downloadReleaseAssets(release, identity.version, request), identity);
  await verifyRemoteReleaseTag(identity, request);
  const result = await request(`/repos/${POLICY.repository}/releases/${release.id}`, { method: "PATCH", body: { draft: false, body: releaseNotes(identity) } });
  validateTransportAssets(result, await downloadReleaseAssets(result, identity.version, request), identity, { requireDraft: false });
  return { outcome: "PUBLIC_NOT_TERMINALLY_VERIFIED", releaseId: String(result.id), tag: identity.tag, sha256: identity.sha256 };
}

function parseCli(args) {
  const command = args.shift(); invariant(["resolve", "bootstrap", "freeze", "validate", "publish", "transport", "finalize"].includes(command), "unknown trusted-release stage");
  const options = {};
  while (args.length) {
    const key = args.shift(); const value = args.shift();
    invariant(/^--[a-z-]+$/u.test(key ?? "") && value && !value.startsWith("--") && !Object.hasOwn(options, key.slice(2)), "invalid or duplicate CLI option");
    options[key.slice(2)] = value;
  }
  const allowed = { resolve: ["control-root", "output"], bootstrap: ["control-root", "context", "output-dir"],
    freeze: ["control-root", "context", "tarball", "receipt", "output-dir", "source-checks"],
    validate: ["control-root", "context", "artifact-dir"], publish: ["control-root", "context", "artifact-dir", "work-dir"],
    transport: ["control-root", "context", "artifact-dir"], finalize: ["control-root", "context", "artifact-dir", "verification"] };
  for (const key of Object.keys(options)) invariant(allowed[command].includes(key), `unrecognized ${command} option`);
  for (const key of allowed[command].filter((key) => key !== "source-checks")) invariant(options[key], `missing --${key}`);
  return { command, options };
}

export async function main(args = process.argv.slice(2)) {
  const { command, options } = parseCli([...args]);
  const context = resolveContextFromEnvironment(resolve(options["control-root"]));
  if (command === "resolve") { exclusivelyWrite(resolve(options.output), jsonBytes(context)); return context; }
  equal(JSON.parse(readFileSync(resolve(options.context), "utf8")), context, "current event/control context");
  const directory = options["artifact-dir"] && resolve(options["artifact-dir"]);
  if (command === "bootstrap") return downloadBootstrap(resolve(options["output-dir"]), context);
  if (command === "freeze") return prepareTransport(resolve(options["output-dir"]), context, { tarballPath: resolve(options.tarball), receiptPath: resolve(options.receipt), sourceChecks: options["source-checks"] });
  if (command === "validate") return validateArtifactDirectory(directory, context);
  if (command === "publish") return publishArtifact(directory, context, resolve(options["work-dir"]));
  if (command === "transport") return stageDraftTransport(directory, context);
  return finalizeRelease(directory, context, JSON.parse(readFileSync(resolve(options.verification), "utf8")));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`DSMM trusted release stopped: ${error.message}\n`); process.exitCode = 1;
  });
}
