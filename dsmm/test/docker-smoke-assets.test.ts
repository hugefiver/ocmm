import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("packed history receives exact package identity from the frozen artifact rather than its installed manifest", () => {
  const source = readFileSync(join(packageRoot, "scripts", "docker-smoke.mjs"), "utf8");
  assert.match(source, /history\.runSessionHistorySmoke\(\{[\s\S]*?expectedPackage: \{ name: manifest\.name, version: manifest\.version \}/u);
  assert.doesNotMatch(source, /expectedPackage: \{ name: operatorManifest\.name/u);
});

test("Docker cleanup preserves the primary failure and all cleanup failures", async () => {
  const { throwAfterCleanup } = await import(pathToFileURL(join(packageRoot, "scripts", "docker-cleanup-errors.mjs")).href);
  assert.doesNotThrow(() => throwAfterCleanup(undefined, [], "cleanup failed"));
  const primary = new Error("primary");
  const cleanup = new Error("cleanup");
  assert.throws(() => throwAfterCleanup(primary, [], "cleanup failed"), (error) => error === primary);
  assert.throws(() => throwAfterCleanup(undefined, [cleanup], "cleanup failed"), (error) => error instanceof AggregateError && error.errors[0] === cleanup);
  assert.throws(() => throwAfterCleanup(primary, [cleanup], "cleanup failed"), (error) =>
    error instanceof AggregateError && error.cause === primary && error.errors[0] === primary && error.errors[1] === cleanup);
});

test("Docker builds pinned latest DSH and an actual native ocmm-lsp binary", () => {
  const dockerfile = readFileSync(join(packageRoot, "docker", "Dockerfile.smoke"), "utf8");
  const dockerignore = readFileSync(join(packageRoot, "docker", "Dockerfile.smoke.dockerignore"), "utf8");
  const smoke = readFileSync(join(packageRoot, "scripts", "docker-smoke.mjs"), "utf8");
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  assert.match(dockerfile, /^FROM rust:.* AS lsp-builder$/mu);
  assert.match(dockerfile, /cargo build --release -p ocmm-lsp/u);
  assert.match(dockerfile, /COPY --from=lsp-builder .*\/ocmm-lsp \/usr\/local\/bin\/ocmm-lsp/u);
  assert.match(dockerfile, /^FROM node:22-bookworm-slim$/mu);
  assert.match(dockerfile, /ARG DSH_PACKAGE=@deepseek-ai\/dsh@0\.2\.0-rc\.2/u);
  assert.match(dockerfile, /npm install -g \$\{DSH_PACKAGE\}/u);
  assert.match(dockerfile, /COPY dsmm \.\/dsmm/u);
  assert.match(dockerfile, /^COPY LICENSE \.\/LICENSE$/mu);
  assert.match(dockerfile, /corepack enable/u);
  assert.match(dockerfile, /corepack prepare pnpm@12\.8\.1 --activate/u);
  assert.doesNotMatch(dockerfile, /pnpm@11\.9\.0/u);
  assert.match(dockerfile, /autoInstallPeers: true/u);
  assert.match(dockerfile, /ENV DSMM_DOCKER_INNER=1/u);
  assert.match(dockerfile, /CMD \["node", "dsmm\/scripts\/docker-smoke\.mjs"\]/u);
  assert.match(dockerignore, /^\*$/mu);
  assert.match(dockerignore, /^!crates\/ocmm-lsp\/\*\*$/mu);
  assert.match(dockerignore, /^!dsmm\/\*\*$/mu);
  assert.match(dockerignore, /^dsmm\/node_modules\/\*\*$/mu);
  assert.equal(pkg.scripts["smoke:docker:build"].includes("@deepseek-ai/dsh@0.2.0-rc.2"), true);
  assert.doesNotMatch(smoke + dockerfile, /@deepseek-ai\/dsh@latest|DSH_PACKAGE=@deepseek-ai\/dsh@0\.1\.1-rc\.2/u);
});

test("packed profile lifecycle remains isolated, reversible, and release-checked", () => {
  const smoke = readFileSync(join(packageRoot, "scripts", "docker-smoke.mjs"), "utf8");
  assert.match(smoke, /const PACKAGE_NAME = "@dsmm\/dsmm"/u);
  assert.match(smoke, /manifest\.name !== PACKAGE_NAME/u);
  const ordered = [
    '"pack", "--pack-destination", workspace',
    '"plugin", "--profile", PROFILE, "add", tarball',
    '"plugin", "--profile", PROFILE, "list"',
    '"plugin", "--profile", PROFILE, "remove", PACKAGE_NAME',
    '"plugin", "--profile", PROFILE, "add", tarball'
  ];
  let offset = 0;
  for (const step of ordered) {
    const next = smoke.indexOf(step, offset);
    assert.ok(next >= offset, `missing packed lifecycle step: ${step}`);
    offset = next + step.length;
  }
  assert.match(smoke, /const PROFILE = "dsmm-v1-smoke"/u);
  assert.match(smoke, /"--from-default-profile", "headless", "--dump-config"/u);
  assert.match(smoke, /assertInstalled\(profilePackage, false\)/u);
  assert.match(smoke, /stdio: \["ignore", "pipe", "pipe"\]/u);
  assert.match(smoke, /args\.includes\("remove"\) \? 90_000 : 300_000/u);
  assert.match(smoke, /result\.error\?\.code === "ETIMEDOUT"/u);
  assert.match(smoke, /assertInstalled\(profilePackage, true\)/u);
  assert.match(smoke, /assertInstalled\(profilePackage, false\)/u);
  assert.equal(smoke.split("assertDump(env, true)").length - 1, 2);
  assert.equal(smoke.split("assertDump(env, false)").length - 1, 2);
  assert.match(smoke, /assertPackedExports\(profilePackage, home\)/u);
  assert.match(smoke, /profileRequire\.resolve\(PACKAGE_NAME\)/u);
  assert.match(smoke, /profileRequire\.resolve\(`\$\{PACKAGE_NAME\}\/preset-skills`\)/u);
  assert.match(smoke, /profileRequire\.resolve\(`@deepseek-ai\/\$\{name\}`\)/u);
  assert.match(smoke, /join\(root, "scripts", "check-release-readiness\.mjs"\)/u);
  assert.match(smoke, /receipt\.outcome !== "ready" \|\| receipt\.forbiddenSurfaceCount !== 0/u);
  assert.match(smoke, /const globalPatch = join\(home, "cordis\.patch\.yml"\)/u);
  assert.match(smoke, /const siblingPackage = join\(siblingDir, "package\.json"\)/u);
  assert.match(smoke, /const siblingPatch = join\(siblingDir, "cordis\.patch\.yml"\)/u);
  const legacyLifecycle = smoke.slice(smoke.indexOf("async function runInnerSmoke()"), smoke.indexOf("function pinnedDshRequire()"));
  assert.equal(legacyLifecycle.split("assertSentinels(sentinels, snapshots)").length - 1, 3);
  assert.match(smoke, /DSMM_PACKAGED_RUNTIME_SMOKE_OK/u);
  assert.match(smoke, /rmSync\(dir, \{ recursive: true, force: true, maxRetries: 5/u);
  assert.match(smoke, /throwAfterCleanup\(primaryError, cleanupErrors/u);
  assert.match(smoke, /randomUUID\(\)/u);
  assert.deepEqual([...smoke.matchAll(/spawnSync\("docker", \["image", "rm", ([^\]]+)\]/gu)].map((match) => match[1]), ["imageTag", "imageTag"]);
  assert.doesNotMatch(smoke, /spawnSync\("docker", \["(?:stop|kill|image", "prune)"/u);
});

test("frozen artifact transport binds exact read-only files without mounting a source checkout or user home", async () => {
  const { artifactDockerArguments, parseArtifactOptions } = await import(pathToFileURL(join(packageRoot, "scripts", "docker-smoke.mjs")).href);
  const options = { artifact: "/owned/final-package.tgz", sha256: "a".repeat(64), hook: "/owned/final-ui-hook.mjs", requireHook: true };
  const args = artifactDockerArguments(options, "owned-native-runtime:fixture");
  assert.deepEqual(args.slice(0, 3), ["run", "--rm", "--init"], "Xvfb must not run as signal-special Docker PID 1");
  const mounts = args.flatMap((arg: string, index: number) => arg === "--mount" ? [args[index + 1]] : []);
  assert.equal(mounts.length, 8);
  assert.equal(mounts[0], "type=bind,source=/owned/final-package.tgz,target=/dsmm-acceptance/package.tgz,readonly");
  assert.ok(mounts.every((mount: string) => mount.endsWith(",readonly")));
  assert.ok(mounts.every((mount: string) => /source=.+\.(?:mjs|tgz),target=/u.test(mount)));
  assert.ok(args.includes("/dsmm-acceptance/scripts/docker-smoke.mjs"));
  assert.ok(args.includes("--expected-sha256"));
  assert.ok(args.includes("--require-hook"));
  assert.ok(mounts.some((mount: string) => mount.endsWith("target=/dsmm-acceptance/scripts/session-history-smoke.mjs,readonly")));
  const evidenceArgs = artifactDockerArguments({ ...options, evidenceDir: "/owned/empty-ui-evidence" }, "owned-native-runtime:fixture");
  assert.ok(evidenceArgs.includes("type=bind,source=/owned/empty-ui-evidence,target=/dsmm-acceptance/ui-qa"));
  assert.ok(evidenceArgs.includes("DSMM_UI_EVIDENCE_DIR=/dsmm-acceptance/ui-qa"));
  assert.ok(evidenceArgs.includes("xvfb-run"));
  assert.equal(evidenceArgs.filter((arg: string) => arg === "--init").length, 1);
  const supportArgs = artifactDockerArguments({ ...options, hookSupport: ["/owned/profile-ui-harness-server.mjs", "/owned/profile-ui-harness-browser.mjs"] }, "owned-native-runtime:fixture");
  assert.ok(supportArgs.includes("type=bind,source=/owned/profile-ui-harness-server.mjs,target=/dsmm-acceptance/profile-ui-harness-server.mjs,readonly"));
  assert.ok(supportArgs.includes("type=bind,source=/owned/profile-ui-harness-browser.mjs,target=/dsmm-acceptance/profile-ui-harness-browser.mjs,readonly"));
  assert.equal(supportArgs.filter((arg: string) => arg === "--hook-support").length, 2);
  assert.throws(() => parseArtifactOptions([]), /exact frozen/u);
  assert.throws(() => parseArtifactOptions(["--artifact", join(packageRoot, "package.json")]), /existing \.tgz/u);
  const dockerfile = readFileSync(join(packageRoot, "docker", "Dockerfile.artifact"), "utf8");
  const dockerignore = readFileSync(join(packageRoot, "docker", "Dockerfile.artifact.dockerignore"), "utf8");
  assert.match(dockerfile, /ARG DSH_PACKAGE=@deepseek-ai\/dsh@0\.2\.0-rc\.2/u);
  assert.doesNotMatch(dockerfile, /COPY dsmm|pnpm run build|pnpm .*pack/u);
  assert.doesNotMatch(dockerignore, /!dsmm|!output_test|!.*home/u);
});

test("final-artifact receipt fails closed when frozen container bytes are absent or changed", async () => {
  const { parseContainerArtifactReceipt } = await import(pathToFileURL(join(packageRoot, "scripts", "docker-smoke.mjs")).href);
  const sha256 = "b".repeat(64);
  const report = { outcome: "COMPLETED", artifact: { sha256, sha256After: sha256 } };
  assert.deepEqual(parseContainerArtifactReceipt(`native logs\nDSMM_FINAL_ARTIFACT_RECEIPT ${JSON.stringify(report)}\n`, sha256), report);
  assert.throws(() => parseContainerArtifactReceipt("no receipt", sha256), /did not produce/u);
  assert.throws(() => parseContainerArtifactReceipt(`DSMM_FINAL_ARTIFACT_RECEIPT ${JSON.stringify({ ...report, artifact: { sha256, sha256After: "c".repeat(64) } })}`, sha256), /unchanged frozen artifact/u);
  assert.throws(() => parseContainerArtifactReceipt(`DSMM_FINAL_ARTIFACT_RECEIPT ${JSON.stringify(report)}`, "d".repeat(64)), /unchanged frozen artifact/u);
});

test("artifact runtime environment preserves native peer policy and excludes all inherited account state", async () => {
  const { freshArtifactEnvironment } = await import(pathToFileURL(join(packageRoot, "scripts", "docker-smoke.mjs")).href);
  const env = freshArtifactEnvironment("/owned/empty-home", { PATH: "/native/bin", HOME: "/original-home", DSH_HOME: "/original-dsh",
    PNPM_CONFIG_AUTO_INSTALL_PEERS: "true", FAKE_SECRET: "must not pass", DISPLAY: ":77", DSMM_BROWSER_EXECUTABLE: "/usr/bin/chromium" });
  assert.equal(env.PATH, "/native/bin");
  assert.equal(env.HOME, "/owned/empty-home");
  assert.equal(env.DSH_HOME, "/owned/empty-home");
  assert.equal(env.XDG_CONFIG_HOME, join("/owned/empty-home", "xdg-config"));
  assert.equal(env.PNPM_CONFIG_AUTO_INSTALL_PEERS, undefined, "native autoInstallPeers:false must not be overridden");
  assert.equal(env.FAKE_SECRET, undefined);
  assert.equal(env.DISPLAY, ":77");
  assert.equal(env.DSMM_BROWSER_EXECUTABLE, "/usr/bin/chromium");
});

test("startup storage handoff preserves only captured native owned-root configuration and fails closed", async () => {
  const { preservedNativeStorage } = await import(pathToFileURL(join(packageRoot, "scripts", "docker-smoke.mjs")).href);
  const ownedHome = join("/owned", "fresh-home");
  const config = { root: join(ownedHome, "sessions"), compression: "zstd" };
  const control = { outcome: "COMPLETED", persistence: { backendName: "session-persistence-jsonl", config,
    stockEntry: { id: "session-persistence-jsonl", name: "@deepseek-ai/dsh-session-persistence-jsonl", disabled: false } } };
  const preserved = preservedNativeStorage(control, ownedHome);
  assert.deepEqual(preserved, config);
  assert.notEqual(preserved, config, "only a detached root/compression copy enters DSMM startup config");
  for (const changed of [undefined, { ...control, outcome: "FAILED" },
    { ...control, persistence: { ...control.persistence, backendName: "other-backend" } },
    { ...control, persistence: { ...control.persistence, config: { ...config, root: join("/outside", "sessions") } } },
    { ...control, persistence: { ...control.persistence, config: { ...config, compression: "none" } } },
    { ...control, persistence: { ...control.persistence, stockEntry: { ...control.persistence.stockEntry, name: "other-package" } } },
    { ...control, persistence: { ...control.persistence, stockEntry: { ...control.persistence.stockEntry, disabled: true } } }
  ]) assert.throws(() => preservedNativeStorage(changed, ownedHome), /exact enabled stock backend/u);
});

test("persisted native event proof requires exact contiguous history and only audited DSMM ignorable markers", async () => {
  const { assertStoredEventPrefix } = await import(pathToFileURL(join(packageRoot, "scripts", "native-preset-smoke.mjs")).href);
  const live = [
    { seq: 0, time: 1, type: "deepwork/mode", data: { active: true } },
    { seq: 1, time: 2, type: "dsmm/role-policy", data: { version: 1, role: "dsmm-reviewer", policy: "a".repeat(64) } },
    { seq: 2, time: 3, type: "user/message", data: { fixture: "known core event" } }
  ];
  const stored = live.map((event, index) => index < 2 ? { ...event, ignorable: true } : event);
  assert.deepEqual(assertStoredEventPrefix(live, stored), { events: 3, coreEvents: 1, modeMarkers: 1, policyMarkers: 1,
    exactlyOnce: true, contiguousSeq: true, ignorable: true });
  assert.throws(() => assertStoredEventPrefix(live, stored.slice(1)), /exactly once/u);
  assert.throws(() => assertStoredEventPrefix(live, [{ ...stored[0], seq: 1 }, ...stored.slice(1)]), /contiguous/u);
  assert.throws(() => assertStoredEventPrefix(live, live), /audited DSMM metadata/u);
  assert.throws(() => assertStoredEventPrefix(live, [...stored.slice(0, 2), { ...stored[2], ignorable: true }]), /native bytes stay unchanged/u);
  assert.throws(() => assertStoredEventPrefix(live, [...stored.slice(0, 2), { ...stored[2], data: { fixture: "changed core event" } }]), /native bytes stay unchanged/u);
});

test("native final-artifact gate uses settled public native APIs, real role tools, and separates missing UI proof", () => {
  const smoke = readFileSync(join(packageRoot, "scripts", "docker-smoke.mjs"), "utf8");
  const native = readFileSync(join(packageRoot, "scripts", "native-preset-smoke.mjs"), "utf8");
  assert.match(native, /get\("appReady"\)\.onReady/u);
  assert.match(native, /registry\.list\(\)/u);
  assert.match(native, /registry\.compositionInventory\(\)/u);
  assert.match(native, /registry\.select\(parent, "dsmm-orchestrator"\)/u);
  assert.match(native, /registry\.select\(parent, "dsmm-planner"\)/u);
  assert.match(native, /name: "write", agent: parent/u);
  assert.match(native, /name: "read", agent: parent/u);
  assert.match(native, /nativeWriteAndRead: true/u);
  assert.match(native, /readFileSync\(restoredWritePath, "utf8"\), restoredWriteBytes/u);
  assert.match(native, /name: "dsmm_reviewer"/u);
  assert.match(native, /tools\.execute\(/u);
  assert.match(native, /tools\.get\(name, agent\), undefined/u);
  assert.match(native, /class AcceptanceAdapter extends LlmAdapter/u);
  assert.match(native, /persistence\[METADATA_COMPATIBILITY\], true/u);
  assert.match(native, /stock\[0\]\.options\.name, STOCK_PERSISTENCE_MODULE/u);
  assert.match(native, /stock\[0\]\.disabled, true/u);
  assert.match(native, /no second companion\/client Loader entry/u);
  assert.match(native, /await persistence\.flush\(\)/u);
  assert.match(native, /readerCtx\.plugin\(JsonlSessionPersistence/u);
  assert.match(native, /Session\.fromRestore\(/u);
  assert.match(native, /restored\.deriveMessages\(\), session\.deriveMessages\(\)/u);
  assert.match(native, /restored\.requestHeader\(\), session\.requestHeader\(\)/u);
  assert.match(native, /commands\.execute\(parent, command/u);
  assert.match(smoke, /preservedNativeStorage\(receipt\.nativeBaseline\[template\], home\)/u);
  assert.match(smoke, /id: STOCK_PERSISTENCE_ID, name: STOCK_PERSISTENCE_MODULE, disabled: true/u);
  assert.match(smoke, /sessionPersistence: \{ \.\.\.nativeStorage \}/u);
  assert.match(smoke, /nativeStorage: \{ \.\.\.installs\[0\]\.nativeStorage \}/u);
  assert.doesNotMatch(native, /\/lib\/.*(?:import|\.href)|ctx\.provide\("agentPresets"|\.emit\("app.ready"|\.credentials/u);
  assert.match(smoke, /sourceUnitTests: \{ outcome: "NOT_RUN"/u);
  assert.match(smoke, /uiProfiles: \{ outcome: "NOT_RUN"/u);
  assert.match(smoke, /typeof hook\.runAcceptance !== "function"/u);
  const frozen = smoke.slice(smoke.indexOf("async function runInnerArtifactSmoke"), smoke.indexOf("function inside("));
  assert.doesNotMatch(frozen, /"pack"|--test|check-release-readiness/u);
  assert.match(frozen, /\["web", "headless"\]/u);
  const nativeExitBoundary = frozen.indexOf("installs.push({");
  const operatorInstallBoundary = frozen.indexOf("const operatorRoot = join(owned, \"operator-runtime\")");
  const uiBoundary = frozen.indexOf("if (options.hook !== undefined)");
  assert.ok(nativeExitBoundary >= 0 && operatorInstallBoundary > nativeExitBoundary && uiBoundary > operatorInstallBoundary,
    "operator repair executes only after native Hosts exit and before any UI Host starts");
  assert.match(frozen, /"npm", \["install", "--prefix", operatorRoot, "--ignore-scripts"/u);
  assert.match(frozen, /options\.artifact, `@deepseek-ai\/dsh-session-persistence-jsonl@\$\{DSH_VERSION\}`/u);
  assert.match(frozen, /operatorPackageRoot, operatorRequire/u);
  assert.match(frozen, /receipt\.sessionHistory\?\.outcome !== "COMPLETED"/u);
  assert.doesNotMatch(frozen, /PNPM_CONFIG_AUTO_INSTALL_PEERS|@dsmm\/dsmm\/session-persistence/u);
});

test("latest runtime smoke covers each behavior domain and refuses headless preset-discovery inference", () => {
  const smoke = readFileSync(join(packageRoot, "scripts", "docker-smoke.mjs"), "utf8");
  for (const domain of [
    "MODEL_ROUTING", "RUNTIME_RECOVERY", "STATUS_COMMAND", "CORE_PROMPT_SKILLS", "SAFETY_GUARDS", "NATIVE_ROLE_COMPOSITION", "NATIVE_HOST_CONTRACT", "ROLE_SUBAGENTS", "NATIVE_PRESET_SECURITY"
  ]) assert.ok(smoke.includes(`"${domain}"`), `${domain} is part of the Docker runtime gate`);
  for (const file of [
    "native-model-routing.test.ts", "runtime-recovery.test.ts", "status.test.ts", "mode.test.ts", "skills.test.ts",
    "prompts.test.ts", "guards.test.ts", "preset-registry.test.ts", "roles.test.ts", "native-runtime-contract.test.ts", "role-subagents.test.ts", "native-preset-security.test.ts"
  ]) assert.ok(smoke.includes(file), `${file} runs in the pinned container`);
  assert.match(smoke, /DSMM_LSP_DIAGNOSTIC_FORMAT_OK/u);
  assert.match(smoke, /lsp-mcp-smoke\.mjs/u);
  assert.match(smoke, /mcp__|publicLspToolName\("diagnostics"\)/u);
  assert.match(smoke, /publicLspToolName\("format"\)/u);
  assert.match(smoke, /ctx\.tools\.execute\(/u);
  assert.match(smoke, /readFileSync\(fixture\.subject, "utf8"\)/u);
  assert.doesNotMatch(smoke, /dsh-agent-presets|roots:|includeUserRoot:|headless.*composedPreset/iu);
  assert.doesNotMatch(smoke, /(?:OPENAI|ANTHROPIC|DEEPSEEK|GOOGLE)_API_KEY|NPM_TOKEN|Authorization:\s*Bearer|\bsk-[A-Za-z0-9]/u);
  for (const asset of ["lsp-mcp-smoke.mjs", "lsp-smoke-fixture.mjs", "check-release-readiness.mjs", "docker-cleanup-errors.mjs"]) {
    assert.equal(existsSync(join(packageRoot, "scripts", asset)), true);
  }
});
