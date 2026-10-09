import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { COMPILED_FILES, compiledFilesForVersion, DW_PRESET_NAMES, LOCALE_FILES, lifecycleCommands, publicExportsForVersion, requiredChecksForVersion, requiresDeepworkMetadata, validateLocaleResources } from "../scripts/dsmm-registry-install-probe.mjs";
import { BOOTSTRAP, POLICY, UI_CHECKS, computeDigests, createArtifactIdentity, deterministicChecksums, manifestExportsForVersion, resolveReleaseContext, validateTarballBuffer } from "../scripts/dsmm-release.mjs";

export function contextInput(bootstrap = false) {
  const commit = "a".repeat(40);
  const ref = bootstrap ? "refs/heads/master" : "refs/tags/dsmm-scoped-v0.1.3";
  return { repository: POLICY.repository, defaultBranch: "master", eventName: bootstrap ? "workflow_dispatch" : "push",
    ref, eventSha: commit, workflowRef: `${POLICY.repository}/${POLICY.workflowFile}@${ref}`, workflowSha: commit,
    controlSha: commit, peeledSha: bootstrap ? BOOTSTRAP.releaseSha : commit,
    runId: "1234", runAttempt: "1", packageVersion: bootstrap ? BOOTSTRAP.version : "0.1.3",
    sourceInDefaultHistory: true, controlInDefaultHistory: true, sourceHasControls: true };
}

export function receiptFixture(version, digest) {
  const makeNative = (template) => ({ outcome: "COMPLETED", template, postAppReady: true,
    presetRegistryPresent: template === "web", model: { kind: "deterministic-test-only-adapter", externalModelCalls: false }, uiAuthentication: "NOT_EXERCISED",
    persistence: { backendName: "dsmm-session-persistence", config: { root: `/tmp/fixture/${template}/sessions`, compression: "zstd" },
      stockEntry: { disabled: true }, dsmmLoaderEntries: 1, standaloneCompanionEntries: 0, standaloneClientEntries: 0,
      capturedFromNativeHost: true, metadataCompatible: true, singleHostProvider: true, startupOnly: true,
      nativeColdReopen: true, historyAndNativePolicyUnchanged: true,
      sessions: ["root", "readonly-child"].map((role) => ({ role, events: 20, coreEvents: 16,
        exactlyOnce: true, contiguousSeq: true, ignorable: true, stockColdReopen: true,
        visibleHistoryUnchanged: true, nativeRequestHeaderUnchanged: true })) },
    readonlyChild: { outcome: "COMPLETED", nativeSpawn: true, persona: true, denied: ["write", "edit", "bash", "pwsh", "dsmm_reviewer", "dsmm_builder"] },
    checks: template === "web" ? { healthyNativeRoster: true, exactEnabledRoots: true } : { shippedPresetFreeHeadless: true },
    blankSelection: { outcome: "COMPLETED", nativeSelect: true, personaAndToolsChanged: true, mutationRestored: true, nativeWriteAndRead: true },
    headlessTools: { outcome: "COMPLETED", disabledBuilderAbsent: true },
    ...(requiresDeepworkMetadata(version) ? { rootIds: template === "web" ? ["dsmm-orchestrator", "dsmm-planner"] : undefined,
      branding: { pluginTitle: "Deepwork", presetNames: DW_PRESET_NAMES.map((entry) => ({ ...entry })),
        rootPresetNames: template === "web" ? DW_PRESET_NAMES.filter(({ id }) => ["dsmm-orchestrator", "dsmm-planner"].includes(id)).map((entry) => ({ ...entry })) : [] } } : {}),
  });
  return { outcome: "COMPLETED", acceptanceScope: "native-final-artifact", dshVersion: POLICY.dshVersion,
    artifact: { package: { name: POLICY.packageName, version }, sha256: digest, sha256After: digest, hostSha256After: digest },
    installedPackages: ["web", "headless"].map((template) => ({ template, name: POLICY.packageName, version, publicExportsResolved: true })),
    native: Object.fromEntries(["web", "headless"].map((template) => [template, makeNative(template)])),
    nativeBaseline: Object.fromEntries(["web", "headless"].map((template) => [template, { outcome: "COMPLETED", postAppReady: true,
      persistence: { backendName: "session-persistence-jsonl", config: { root: `/tmp/fixture/${template}/sessions`, compression: "zstd" }, stockEntry: { disabled: false }, capturedFromNativeHost: true } }])),
    sourceUnitTests: { outcome: "NOT_RUN" },
    uiProfiles: { outcome: "COMPLETED", postAppReady: true, kind: "native-client-component-owned-carrier", artifactSha256: digest,
      installedRoot: "/tmp/fixture/web/node_modules/@dsmm/dsmm",
      checks: Object.fromEntries(UI_CHECKS.map((key) => [key, true])),
      authentication: { realWebOrDesktopLogin: "NOT_EXERCISED", signedIn: false, copiedBrowserState: false, productionAuthenticationModified: false },
      nativeClient: { rewrittenProductionBundles: false, dsmmClient: "/tmp/fixture/web/node_modules/@dsmm/dsmm/lib/client.js" }, storageProof: { genuineNativeGateway: true, genuineOperatorPeer: true, cannedProfileRpc: false },
      nativeStorage: { ignorableEventCapability: true, passedByRunner: true, startupOnly: true, companionLoaderEntry: false,
        root: "/tmp/fixture/web/sessions", compression: "zstd", provider: "dsmm-session-persistence" },
      nativeCalls: ["describe", "read", "save", "select"].map((method) => ({ endpoint: `dsmmProfiles/${method}`, strictGateway: true, result: "accepted" })),
      nativeStreams: [{ endpoint: "session/control", strictGateway: true, result: "accepted", disposed: true, frames: 3 }],
      cleanup: { browserContextClosed: true, nativeAgentsDisposed: true, ownedTemporaryRootRemoved: true, nativeHostExited: true, errors: [] } },
    sessionHistory: { outcome: "COMPLETED", artifactSha256: digest, packageVersion: version, nativeVersion: POLICY.dshVersion,
      syntheticOnly: true, originalRefused: true, dryRunUnchanged: true, originalBackupByteIdentical: true,
      repairedNativeReadAndRestore: true, retainedModelVisibleHistory: true, nativeWriterExclusionBothDirections: true,
      hostsExitedBeforeOperator: true, standalonePinnedSdk: true, exactMetadataEvents: 2, installedPackage: { name: POLICY.packageName, version } },
    lsp: { outcome: "COMPLETED", directNativeDiagnosticsAndFormat: true, nativeDshMcpClient: true },
    profileLifecycle: { outcome: "COMPLETED", installRemoveReinstall: true, unrelatedSentinelsUnchanged: true },
    temporaryHomesRemoved: true, runtimeImage: { ownership: "owned", cleanup: "COMPLETED" } };
}

export function archive(entries) {
  const parts = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512); const field = (start, length, value) => { assert.ok(Buffer.byteLength(value) < length); header.write(value, start, length, "utf8"); };
    field(0, 100, entry.name); field(100, 8, "0000644"); field(108, 8, "0000000"); field(116, 8, "0000000");
    field(124, 12, entry.bytes.length.toString(8).padStart(11, "0")); field(136, 12, "00000000000");
    header.fill(32, 148, 156); header[156] = (entry.type ?? "0").charCodeAt(0);
    if (entry.link) field(157, 100, entry.link);
    field(257, 6, "ustar"); header.write("00", 263);
    const sum = header.reduce((a, b) => a + b, 0); header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
    parts.push(header, entry.bytes, Buffer.alloc((512 - entry.bytes.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}

// Synthetic historical release data, independent of current branding and never publication proof.
const FROZEN_HISTORICAL_LOCALE_RESOURCES = {
  "locale/en.json": { meta: { title: "Deepwork", description: "Deepwork bundle for DeepSeek Harness." } },
  "locale/zh.json": { meta: { title: "Deepwork", description: "DeepSeek Harness 的 Deepwork 工作流。" } },
};

export function packageFiles(version = "0.1.3") {
  const manifest = JSON.parse(readFileSync(new URL("../dsmm/package.json", import.meta.url), "utf8")); manifest.version = version;
  manifest.exports = manifestExportsForVersion(version);
  if (!requiresDeepworkMetadata(version)) manifest.files = manifest.files.filter((path) => path !== "locale/*.json");
  const names = ["LICENSE", "README.md", "cordis.patch.yml", "scripts/repair-session-log.mjs", "scripts/session-repair-native-verifier.mjs",
    "lib/index.js", "lib/index.d.ts", "lib/preset-skills.js", "lib/preset-skills.d.ts", "lib/client.js", "lib/client/index.js", "lib/client/index.d.ts",
    ...["profiles", "profile-types", "profile-store", "profile-runtime", "profile-rpc", "profile-remote", "session-metadata", "session-persistence"].flatMap((name) => [`lib/${name}.js`, `lib/${name}.d.ts`]),
    ...["agent-presets", "compatibility", "design", "lsp", "migration-from-ocmm", "model-routing", "profiles", "releasing", "roadmap", "runtime-recovery", "safety-guards", "settings-status", "skill-sync"].map((name) => `docs/${name}.md`),
    "agent-presets/default.yml", "docs/research/reference.md", "patches/baseline.yml", "prompts/root.md", "skills/example/SKILL.md"];
  return new Map([["package.json", Buffer.from(JSON.stringify(manifest))], ...[...new Set([...names, ...compiledFilesForVersion(version)])].map((name) => [name, Buffer.from("fixture\n")]),
    ...(requiresDeepworkMetadata(version) ? LOCALE_FILES.map((path) => [path, Buffer.from(JSON.stringify(FROZEN_HISTORICAL_LOCALE_RESOURCES[path]))]) : [])]);
}

export function archiveFiles(files) { return archive([...files].map(([name, bytes]) => ({ name: `package/${name}`, bytes }))); }

export function makeAcceptedFixture() {
  const context = resolveReleaseContext(contextInput()); const tarball = archiveFiles(packageFiles());
  const receipt = receiptFixture(context.version, computeDigests(tarball).sha256); const receiptBytes = Buffer.from(JSON.stringify(receipt));
  const identity = createArtifactIdentity(context, tarball, receiptBytes, { sourceChecks: "COMPLETED" });
  const assets = new Map([[identity.filename, tarball], [POLICY.receiptFilename, receiptBytes], [POLICY.checksumsFilename, deterministicChecksums(identity)]]);
  const release = { id: 44, tag_name: identity.tag, draft: true, prerelease: false,
    assets: [...assets].map(([name, bytes], index) => ({ id: index + 100, name, state: "uploaded", size: bytes.length, digest: `sha256:${computeDigests(bytes).sha256}` })) };
  return { context, tarball, receipt, receiptBytes, identity, assets, release };
}

export function makeInstallFixture({ identity, tarball }) {
  const hash = "a".repeat(64), profile = `dsmm-registry-${"a".repeat(32)}`;
  const { files } = validateTarballBuffer(tarball, { version: identity.version, expectedDigests: identity });
  const fileIdentity = (path) => ({ path, sha256: computeDigests(files.get(path)).sha256 });
  const publicExports = publicExportsForVersion(identity.version);
  return {
    schemaVersion: 1, outcome: "COMPLETED", packageName: POLICY.packageName, version: identity.version, sha256: identity.sha256,
    registry: { url: POLICY.registry, tarball: `${POLICY.registry}@dsmm/dsmm/-/dsmm-${identity.version}.tgz`,
      integrity: identity.integrity, sha1: identity.sha1, sha256: identity.sha256,
      sha512: identity.integrity.slice("sha512-".length), size: identity.size },
    packageManager: { name: "pnpm", version: POLICY.pnpmVersion, integrity: "sha512-vWgtXQP+Ul73yf1ngMaITR51asTJyf4AxTh4KCQxDc+Q493E9Tg18G3669UIXkGFXgvLs7YN4qxburieUDbwOw==" },
    native: { version: POLICY.dshVersion, integrity: "sha512-EAJ3gPNcVt/uv8X19PMm9NkVhWgT7xXNMk0UKCVm+IQ5rpSQOcsMUa0HWlnYYVybKMsccjcRB21vVVsaXQ6IdA==",
      binSha256: hash, headless: true, profileList: true, dumpConfig: true, profile,
      commands: lifecycleCommands(profile, identity.version).map((command) => ({ ...command, status: 0, stdoutSha256: hash, stderrSha256: hash })) },
    exports: Object.fromEntries(Object.entries(publicExports).map(([name, path]) => [name, fileIdentity(path)])),
    compiledFiles: Object.fromEntries(compiledFilesForVersion(identity.version).map((path) => [path, fileIdentity(path)])),
    checks: Object.fromEntries(requiredChecksForVersion(identity.version).map((name) => [name, true])), temporaryRootRemoved: true, cleanup: { outcome: "COMPLETED" },
    ...(requiresDeepworkMetadata(identity.version) ? { nativeMetadata: { reader: "@deepseek-ai/dsh-app-boot/readPluginMeta", readerVersion: POLICY.dshVersion,
      readerSha256: hash, packageName: POLICY.packageName, version: identity.version, source: "profile-owned-installed-package",
      locales: validateLocaleResources(new Map([...files].filter(([path]) => path.startsWith("locale/"))), identity.version),
      execution: { status: 0, stdoutSha256: hash, stderrSha256: hash } } } : {}),
    nonClaims: { paidModelCall: false, realLogin: false, authenticatedDesktop: false, uiAcceptance: false },
    startedAt: "2026-10-05T00:00:00.000Z", finishedAt: "2026-10-05T00:01:00.000Z",
  };
}
