import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("Docker cleanup errors preserve primary failure identity", async () => {
  const helper = join(packageRoot, "scripts", "docker-cleanup-errors.mjs");
  const helperModule = await import(pathToFileURL(helper).href);
  assert.deepEqual(Object.keys(helperModule), ["throwAfterCleanup"]);
  const { throwAfterCleanup } = helperModule;
  assert.equal(typeof throwAfterCleanup, "function");

  assert.doesNotThrow(() => throwAfterCleanup(undefined, [], "cleanup failed"));

  const primaryOnly = new Error("primary only");
  assert.throws(
    () => throwAfterCleanup(primaryOnly, [], "cleanup failed"),
    (error) => error === primaryOnly
  );

  const firstCleanupError = new Error("first cleanup");
  const secondCleanupError = new Error("second cleanup");
  let cleanupOnly;
  try {
    throwAfterCleanup(undefined, [firstCleanupError, secondCleanupError], "cleanup failed");
  } catch (error) {
    cleanupOnly = error;
  }
  assert.ok(cleanupOnly instanceof AggregateError);
  assert.equal(cleanupOnly.message, "cleanup failed");
  assert.equal(cleanupOnly.errors[0], firstCleanupError);
  assert.equal(cleanupOnly.errors[1], secondCleanupError);
  assert.equal(cleanupOnly.cause, undefined);

  const primaryAndCleanup = new Error("primary and cleanup");
  let combined;
  try {
    throwAfterCleanup(primaryAndCleanup, [firstCleanupError, secondCleanupError], "cleanup failed");
  } catch (error) {
    combined = error;
  }
  assert.ok(combined instanceof AggregateError);
  assert.equal(combined.message, "cleanup failed");
  assert.equal(combined.errors[0], primaryAndCleanup);
  assert.equal(combined.errors[1], firstCleanupError);
  assert.equal(combined.errors[2], secondCleanupError);
  assert.equal(combined.cause, primaryAndCleanup);
});

test("Docker smoke assets are documented and isolated", () => {
  const dockerfile = join(packageRoot, "docker", "Dockerfile.smoke");
  const script = join(packageRoot, "scripts", "docker-smoke.mjs");
  const cleanupErrors = join(packageRoot, "scripts", "docker-cleanup-errors.mjs");
  const localPlan = join(packageRoot, "docs", "implementation-plan-v0.1.md");
  const agentPresetDocs = join(packageRoot, "docs", "agent-presets.md");
  const examplePatch = join(packageRoot, "patches", "agent-presets-root.example.cordis.patch.yml");
  const lspDocs = join(packageRoot, "docs", "lsp.md");
  const lspExamplePatch = join(packageRoot, "patches", "ocmm-lsp-mcp.example.cordis.patch.yml");
  const lspFixture = join(packageRoot, "scripts", "lsp-smoke-fixture.mjs");
  const lspSmoke = join(packageRoot, "scripts", "lsp-mcp-smoke.mjs");
  const releaseChecker = join(packageRoot, "scripts", "check-release-readiness.mjs");
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
  const dockerfileText = readFileSync(dockerfile, "utf8");
  const scriptText = readFileSync(script, "utf8");
  const lspFixtureText = readFileSync(lspFixture, "utf8");
  const lspSmokeText = readFileSync(lspSmoke, "utf8");
  const releaseCheckerText = readFileSync(releaseChecker, "utf8");
  const docsText = readFileSync(agentPresetDocs, "utf8");
  const patchText = readFileSync(examplePatch, "utf8");
  const lspPatchText = readFileSync(lspExamplePatch, "utf8");

  assert.equal(existsSync(dockerfile), true);
  assert.equal(existsSync(script), true);
  assert.equal(existsSync(cleanupErrors), true, "Docker cleanup helper must exist");
  assert.equal(existsSync(localPlan), true);
  assert.equal(existsSync(agentPresetDocs), true);
  assert.equal(existsSync(examplePatch), true);
  assert.equal(existsSync(lspDocs), true);
  assert.equal(existsSync(lspExamplePatch), true);
  assert.equal(existsSync(lspFixture), true);
  assert.equal(existsSync(lspSmoke), true);
  assert.equal(existsSync(releaseChecker), true);
  assert.ok(pkg.files.includes("agent-presets"));
  assert.ok(pkg.files.includes("patches"));
  assert.match(dockerfileText, /FROM node:22-bookworm-slim/);
  assert.match(dockerfileText, /FROM rust:.* AS lsp-builder/);
  assert.match(dockerfileText, /cargo build --release -p ocmm-lsp/);
  assert.match(dockerfileText, /COPY --from=lsp-builder .*\/ocmm-lsp \/usr\/local\/bin\/ocmm-lsp/);
  assert.match(dockerfileText, /ARG DSH_PACKAGE=@deepseek-ai\/dsh@0\.1\.1-rc\.2/);
  assert.doesNotMatch(dockerfileText, /@deepseek-ai\/dsh@latest/);
  assert.match(dockerfileText, /COPY dsmm \.\/dsmm/);
  assert.match(dockerfileText, /^COPY LICENSE \.\/LICENSE$/mu);
  assert.doesNotMatch(dockerfileText, /^ENV npm_config_auto_install_peers=/mu);
  assert.match(dockerfileText, /corepack enable/);
  assert.match(dockerfileText, /autoInstallPeers: false/);
  assert.match(dockerfileText, /pnpm run build/);
  assert.match(dockerfileText, /npm install -g \$\{DSH_PACKAGE\}/);
  assert.doesNotMatch(dockerfileText, /ENV DSH_HOME=/);
  assert.doesNotMatch(dockerfileText, /ENV DSMM_MANAGED_PRESETS_ROOT=/);
  assert.match(dockerfileText, /ENV DSMM_DOCKER_INNER=1/);
  assert.match(dockerfileText, /CMD \["node", "dsmm\/scripts\/docker-smoke\.mjs"\]/);
  assert.match(scriptText, /fileURLToPath\(new URL\("\.\.", import\.meta\.url\)\)/);
  assert.match(scriptText, /DSMM_DOCKER_INNER/);
  assert.match(scriptText, /spawnSync\("docker"/);
  assert.match(scriptText, /DSH_PACKAGE=@deepseek-ai\/dsh@0\.1\.1-rc\.2/);
  assert.doesNotMatch(scriptText, /@deepseek-ai\/dsh@latest/);
  assert.match(scriptText, /randomUUID\(\)/);
  assert.match(scriptText, /import \{ throwAfterCleanup \} from "\.\/docker-cleanup-errors\.mjs";/);
  assert.equal(scriptText.split("throwAfterCleanup(primaryError, cleanupErrors,").length - 1, 2);
  assert.match(scriptText, /"image", "rm", imageTag/);
  assert.doesNotMatch(scriptText, /dsmm-dsh-smoke:0\.1/);
  assert.match(scriptText, /spawnSync\("pnpm", \["--dir", root, "pack", "--pack-destination", workspace\],/);
  assert.match(scriptText, /join\(root, "scripts", "check-release-readiness\.mjs"\), "--package-root", root/);
  assert.match(releaseCheckerText, /const repositoryLicensePath = resolve\(scriptDirectory, "\.\.", "\.\.", "LICENSE"\);/);
  assert.match(scriptText, /\^dsmm-\.\+\\\.tgz\$/);
  assert.match(scriptText, /const PROFILE = "dsmm-v1-smoke";/);
  assert.match(scriptText, /"plugin", "--profile", PROFILE, "add", tarball/);
  assert.match(scriptText, /PNPM_CONFIG_AUTO_INSTALL_PEERS: "true"/);
  assert.match(scriptText, /const globalPatch = join\(home, "cordis\.patch\.yml"\);/);
  assert.match(scriptText, /const siblingDir = join\(home, "profiles", "unrelated-smoke"\);/);
  assert.match(scriptText, /const siblingPackage = join\(siblingDir, "package\.json"\);/);
  assert.match(scriptText, /const siblingPatch = join\(siblingDir, "cordis\.patch\.yml"\);/);
  assert.match(scriptText, /mkdirSync\(siblingDir, \{ recursive: true \}\);/);
  assert.match(scriptText, /writeFileSync\(globalPatch, "#[^\n]*\\n\[\]\\n", "utf8"\);/);
  assert.match(scriptText, /writeFileSync\(siblingPatch, "#[^\n]*\\n\[\]\\n", "utf8"\);/);
  assert.match(scriptText, /name: "unrelated-smoke",\s*version: "0\.0\.0",\s*private: true,\s*dsh: \{ profile: \{ bundles: \["@deepseek-ai\/dsh-base"\] \} \}/s);
  assert.match(scriptText, /const globalPatchSnapshot = readFileSync\(globalPatch\);/);
  assert.match(scriptText, /const siblingPackageSnapshot = readFileSync\(siblingPackage\);/);
  assert.match(scriptText, /const siblingPatchSnapshot = readFileSync\(siblingPatch\);/);
  assert.match(scriptText, /function parseProfileManifest\(profilePackage\)/);
  assert.match(scriptText, /JSON\.parse\(readFileSync\(profilePackage, "utf8"\)\)/);
  assert.match(scriptText, /manifest\.dependencies\?\.dsmm/);
  assert.match(scriptText, /Object\.keys\(manifest\.dependencies \?\? \{\}\)\.filter\(\(packageName\) => packageName === "dsmm"\)\.length/);
  assert.match(scriptText, /manifest\.dsh\?\.profile\?\.bundles/);
  assert.match(scriptText, /bundle === "dsmm"/);
  assert.match(scriptText, /function profileListHasStandaloneDsmmPackage\(output\)/);
  assert.match(scriptText, /token === "dsmm" \|\| token\.startsWith\("dsmm@"\)/);
  assert.match(scriptText, /function assertSentinelBuffersIdentical\(/);
  assert.match(scriptText, /globalPatchSnapshot\.equals\(readFileSync\(globalPatch\)\)/);
  assert.match(scriptText, /siblingPackageSnapshot\.equals\(readFileSync\(siblingPackage\)\)/);
  assert.match(scriptText, /siblingPatchSnapshot\.equals\(readFileSync\(siblingPatch\)\)/);
  assert.match(scriptText, /createRequire\(profilePackage\)/);
  assert.match(scriptText, /if \(resolve\(installedPackageRoot\) === resolve\(root\)\)/);
  assert.match(scriptText, /assertInsideOwnedRoot\(installedPackageRoot, home, "installed dsmm package"\)/);
  assert.match(scriptText, /if \(lines\.length !== 1\)/);
  assert.match(scriptText, /receipt = JSON\.parse\(lines\[0\]\)/);
  assert.match(scriptText, /resolve\("dsmm"\)/);
  assert.match(scriptText, /resolve\("dsmm\/preset-skills"\)/);
  assert.match(scriptText, /basename\(dsmmEntry\) !== "index\.js"/);
  assert.match(scriptText, /basename\(dirname\(dsmmEntry\)\) !== "lib"/);
  assert.match(scriptText, /dirname\(dirname\(dsmmEntry\)\)/);
  assert.doesNotMatch(scriptText, /join\(root, "lib", "(?:index|skills)\.js"\)/);

  for (const packageName of [
    "@deepseek-ai/dsh-agent",
    "@deepseek-ai/dsh-llm",
    "@deepseek-ai/dsh-settings",
    "@deepseek-ai/dsh-commands",
    "@deepseek-ai/dsh-session",
    "@deepseek-ai/dsh-system-prompt",
    "@deepseek-ai/dsh-skill",
    "@deepseek-ai/dsh-tools",
    "@deepseek-ai/dsh-agent-presets"
  ]) {
    assert.ok(scriptText.includes(`importDshPackage("${packageName}")`), `missing packaged runtime import for ${packageName}`);
  }

  for (const symbol of [
    "agentEvents",
    "LlmAdapter",
    "ReasoningEffortId",
    "SettingsProvider",
    "SessionStore",
    "SessionId",
    "SystemPrompt",
    "renderPrompt",
    "SkillRegistry",
    "isModelInvocable",
    "ToolRuntime",
    "defineTool",
    "CommandRuntime",
    "AgentRegistry",
    "AgentLoop",
    "AgentPresets",
    "assembleContextFor",
    "CallId"
  ]) {
    assert.match(scriptText, new RegExp(`\\b${symbol}\\b`, "u"));
  }

  const expectedMarkers = [
    "PACKAGED_DSMM_RESOLVED",
    "MODEL_ROUTING_WATERFALL_OK",
    "RUNTIME_RECOVERY_FALLBACK_OK",
    "RUNTIME_RECOVERY_CONTINUATION_OK",
    "DSMM_STATUS_COMMAND_OK",
    "ORDINARY_ISOLATED",
    "DEEPWORK_BODIES_ONCE",
    "DOWNSTREAM_DENY_WINS",
    "POST_EXECUTE_TRUNCATED",
    "PRESET_SCOPED_SKILLS",
    "HEADER_GUARD_ACTIVE",
    "LSP_DIAGNOSTIC_OK",
    "DSMM_V1_RELEASE_CHECK_OK",
    "DSMM_V1_PROFILE_INSTALL_OK",
    "DSMM_V1_PROFILE_REMOVE_OK",
    "DSMM_V1_GLOBAL_CONFIG_UNCHANGED",
    "DSMM_PACKAGED_RUNTIME_SMOKE_OK"
  ];
  assert.equal(expectedMarkers.at(-1), "DSMM_PACKAGED_RUNTIME_SMOKE_OK");
  assert.equal(expectedMarkers.length, 17);
  assert.ok(expectedMarkers.indexOf("MODEL_ROUTING_WATERFALL_OK") < expectedMarkers.indexOf("DSMM_PACKAGED_RUNTIME_SMOKE_OK"));
  for (const marker of expectedMarkers) {
    assert.match(scriptText, new RegExp(`console\\.log\\("${marker}"\\)`, "u"));
    assert.equal(scriptText.split(`console.log("${marker}")`).length - 1, 1, `${marker} must print exactly once`);
  }
  assert.deepEqual(expectedMarkers, [
    "PACKAGED_DSMM_RESOLVED",
    "MODEL_ROUTING_WATERFALL_OK",
    "RUNTIME_RECOVERY_FALLBACK_OK",
    "RUNTIME_RECOVERY_CONTINUATION_OK",
    "DSMM_STATUS_COMMAND_OK",
    "ORDINARY_ISOLATED",
    "DEEPWORK_BODIES_ONCE",
    "DOWNSTREAM_DENY_WINS",
    "POST_EXECUTE_TRUNCATED",
    "PRESET_SCOPED_SKILLS",
    "HEADER_GUARD_ACTIVE",
    "LSP_DIAGNOSTIC_OK",
    "DSMM_V1_RELEASE_CHECK_OK",
    "DSMM_V1_PROFILE_INSTALL_OK",
    "DSMM_V1_PROFILE_REMOVE_OK",
    "DSMM_V1_GLOBAL_CONFIG_UNCHANGED",
    "DSMM_PACKAGED_RUNTIME_SMOKE_OK"
  ]);
  const innerSmoke = scriptText.slice(scriptText.indexOf("async function runInnerSmoke()"), scriptText.indexOf("function requireFromPinnedDsh()"));
  const outerSmoke = scriptText.slice(scriptText.indexOf("async function runOuterSmoke()"), scriptText.indexOf("async function runInnerSmoke()"));
  assert.match(outerSmoke, /let primaryError;/);
  assert.match(outerSmoke, /const cleanupErrors = \[\];/);
  assert.match(outerSmoke, /catch \(error\) \{\s*primaryError = error;\s*\}/s);
  assert.match(outerSmoke, /"image", "rm", imageTag/);
  assert.match(outerSmoke, /cleanupErrors\.push\(error\);/);
  assert.match(outerSmoke, /throwAfterCleanup\(primaryError, cleanupErrors, "failed to clean owned dsmm Docker image"\);/);
  assert.equal((outerSmoke.match(/spawnSync\("docker"/gu) ?? []).length, 3, "outer smoke may only build, run, and remove its owned image");
  assert.match(innerSmoke, /let primaryError;/);
  assert.match(innerSmoke, /const cleanupErrors = \[\];/);
  assert.match(innerSmoke, /catch \(error\) \{\s*primaryError = error;\s*\}/s);
  assert.match(innerSmoke, /throwAfterCleanup\(primaryError, cleanupErrors, "failed to clean owned dsmm Docker smoke resources"\);/);
  assert.ok(innerSmoke.indexOf("rmSync(home") < innerSmoke.indexOf("rmSync(workspace"), "home cleanup must precede workspace cleanup");
  assert.equal((innerSmoke.match(/cleanupErrors\.push\(error\);/gu) ?? []).length, 2, "both owned directory cleanup failures must be retained");
  const addCalls = [...innerSmoke.matchAll(/"plugin", "--profile", PROFILE, "add", tarball/gu)];
  const listCalls = [...innerSmoke.matchAll(/"plugin", "--profile", PROFILE, "list"/gu)];
  const dumpCalls = [...innerSmoke.matchAll(/"--profile", PROFILE, "--dump-config"/gu)];
  assert.equal(addCalls.length, 2, "the same packed tarball must be added twice");
  assert.equal(listCalls.length, 3, "plugin list must cover install, remove, and reinstall");
  assert.equal(dumpCalls.length, 2, "dump config must cover install and reinstall");
  assert.match(innerSmoke, /"plugin", "--profile", PROFILE, "remove", "dsmm"/);
  assert.match(innerSmoke, /assertProfileManifestInstalled\(profilePackage\)/);
  assert.match(innerSmoke, /assertProfileManifestRemoved\(profilePackage\)/);
  assert.equal(innerSmoke.split("resolveProfileDsmm(profilePackage, home)").length - 1, 2, "initial and reinstalled dsmm must both resolve from the run-owned profile");
  assert.match(scriptText, /const installedManifest = JSON\.parse\(readFileSync\(join\(installedPackageRoot, "package\.json"\), "utf8"\)\);/);
  assert.match(scriptText, /installedManifest\.version !== "1\.0\.0"/);
  assert.match(scriptText, /installedManifest\.dsh\?\.bundle\?\.patch !== "\.\/cordis\.patch\.yml"/);
  assert.match(scriptText, /existsSync\(join\(installedPackageRoot, installedManifest\.dsh\.bundle\.patch\)\)/);
  assert.match(innerSmoke, /join\(root, "scripts", "check-release-readiness\.mjs"\), "--package-root", root/);
  assert.match(innerSmoke, /parseReleaseReadinessReceipt\(readiness\.stdout\)/);
  assert.match(innerSmoke, /receipt\.outcome !== "ready" \|\| receipt\.forbiddenSurfaceCount !== 0/);
  const sentinelCall = "assertSentinelBuffersIdentical({ globalPatch, siblingPackage, siblingPatch }, { globalPatchSnapshot, siblingPackageSnapshot, siblingPatchSnapshot });";
  const sentinelLocations = [];
  for (let location = innerSmoke.indexOf(sentinelCall); location !== -1; location = innerSmoke.indexOf(sentinelCall, location + sentinelCall.length)) {
    sentinelLocations.push(location);
  }
  assert.equal(sentinelLocations.length, 2, "sentinel isolation must be proven after removal and again after reinstall");
  assert.ok(sentinelLocations[0] > innerSmoke.indexOf("assertProfileManifestRemoved(profilePackage);"));
  assert.ok(sentinelLocations[0] < innerSmoke.indexOf('console.log("DSMM_V1_PROFILE_REMOVE_OK")'));
  assert.ok(sentinelLocations[1] > innerSmoke.indexOf('if (!secondDump.stdout.includes("id: dsmm"))'));
  assert.ok(sentinelLocations[1] < innerSmoke.indexOf('console.log("DSMM_V1_GLOBAL_CONFIG_UNCHANGED")'));
  const removalWindow = innerSmoke.slice(innerSmoke.indexOf('"remove", "dsmm"'), innerSmoke.indexOf('"add", tarball', innerSmoke.indexOf('"remove", "dsmm"')));
  assert.doesNotMatch(removalWindow, /\.resolve\("dsmm"\)/, "removal must not require dsmm to become unresolvable from DSH shared fallback");
  const smokeCalls = [
    "await smokeModelRouting(runtime, dsmm, installedPackageRoot);",
    "await smokeRuntimeRecovery(runtime, dsmm, installedPackageRoot);",
    "await smokeStatusCommand(runtime, dsmm, installedPackageRoot);",
    "await smokeCoreRuntime(runtime, dsmm, installedPackageRoot);",
    "await smokeHeaderGuard(runtime, dsmm, installedPackageRoot);",
    "await smokeLspPipeline(runtime, dsmm, env, home);",
    'if (passed) console.log("DSMM_PACKAGED_RUNTIME_SMOKE_OK");'
  ];
  let priorSmokeCall = -1;
  for (const call of smokeCalls) {
    const location = innerSmoke.indexOf(call);
    assert.ok(location > priorSmokeCall, `${call} is absent or out of smoke order`);
    priorSmokeCall = location;
  }
  assert.ok(innerSmoke.indexOf('console.log("DSMM_V1_RELEASE_CHECK_OK")') > innerSmoke.indexOf("await smokeLspPipeline(runtime, dsmm, env, home);"));
  assert.ok(innerSmoke.indexOf('console.log("DSMM_V1_PROFILE_INSTALL_OK")') > innerSmoke.indexOf('console.log("DSMM_V1_RELEASE_CHECK_OK")'));
  assert.ok(innerSmoke.indexOf('console.log("DSMM_V1_PROFILE_REMOVE_OK")') > innerSmoke.indexOf('console.log("DSMM_V1_PROFILE_INSTALL_OK")'));
  assert.ok(innerSmoke.indexOf('console.log("DSMM_V1_GLOBAL_CONFIG_UNCHANGED")') > innerSmoke.indexOf('console.log("DSMM_V1_PROFILE_REMOVE_OK")'));

  assert.match(scriptText, /const agentEvents = requireFunction\(agent\.agentEvents, "@deepseek-ai\/dsh-agent agentEvents export"\)/);
  assert.match(scriptText, /const LlmAdapter = requireFunction\(llm\.LlmAdapter, "@deepseek-ai\/dsh-llm LlmAdapter export"\)/);
  assert.match(scriptText, /const ReasoningEffortId = requireFunction\(llm\.ReasoningEffortId, "@deepseek-ai\/dsh-llm ReasoningEffortId export"\)/);
  assert.match(scriptText, /class FakeAdapter extends runtime\.LlmAdapter/);
  assert.match(scriptText, /ctx\.llm\.registerAdapter\(\["deepseek-official"\], fake\)/);
  assert.match(scriptText, /ctx\.commands\.execute\(agent, "\/deepwork", \[\], activationSignal\)/);
  assert.match(scriptText, /runtime\.agentEvents\(ctx, agent\)/);
  assert.match(scriptText, /\.waterfall\("agent\/request", \{ turn: 1, step: 1, signal \}, async \(\) => downstream\)/);
  assert.match(scriptText, /provider: "deepseek-official",\s*model: "deepseek-v4-pro",\s*temperature: 0\.2,\s*maxTokens: 321,\s*stop: \["<END>"\]/s);
  assert.match(scriptText, /resolverCall\.provider !== "deepseek-official"/);
  assert.match(scriptText, /resolverCall\.model !== "deepseek-v4-pro"/);
  assert.match(scriptText, /resolverCall\.signal !== signal/);
  for (const field of ["provider", "model", "temperature", "maxTokens", "stop"]) {
    assert.match(scriptText, new RegExp(`result\\.${field} !== downstream\\.${field}`, "u"), `missing downstream ${field} preservation assertion`);
  }
  assert.match(scriptText, /result\.reasoningEffort !== "high"/);
  assert.match(scriptText, /streamCalls !== 0/);
  assert.match(scriptText, /ctx\.inject\(\["llm"\],/);
  assert.match(scriptText, /requestHits !== 1/);
  assert.match(scriptText, /await child\.restart\(\)/);
  assert.match(scriptText, /requestHits !== 2/);
  assert.match(scriptText, /await child\.dispose\(\)/);
  assert.match(scriptText, /child\.uid !== null/);
  assert.doesNotMatch(scriptText, /DSMM_TASK7_DEBUG/);
  assert.match(scriptText, /requestHits !== 2[^\n]*disposed/s);
  const childRestart = scriptText.indexOf("await child.restart()");
  const childDispose = scriptText.indexOf("await child.dispose()", childRestart);
  assert.ok(childRestart !== -1 && childDispose > childRestart, "child must restart only while active and then dispose terminally");
  assert.equal(scriptText.slice(childDispose).includes("child.restart()"), false, "disposed injection child must never restart");

  assert.match(scriptText, /async function smokeRuntimeRecovery\(runtime, dsmm, installedPackageRoot\)/);
  assert.match(scriptText, /runtimeRecovery: \{\s*enabled: true,\s*retryOnStatusCodes: \[429\],\s*retryOnCodes: \[\],\s*fallbackRoutes: \[\{ provider: "deepseek-official", model: "deepseek-v4-pro" \}\],\s*maxFallbackAttempts: 2,\s*idleContinuation: \{\s*enabled: true,\s*maxContinuations: 1,\s*prompt: RUNTIME_RECOVERY_CONTINUATION_PROMPT/s);
  assert.match(scriptText, /deepseekV4ProCalibration: "auto",\s*deepseekV4ProDefaultReasoningEffort: "high"/s);
  assert.match(scriptText, /function createStructuralRecoveryAgent\(events, initialHeader\)/);
  assert.match(scriptText, /requestHeader\(\) \{\s*return currentHeader;/s);
  assert.match(scriptText, /append\(\) \{\s*appendCalls \+= 1;/s);
  assert.match(scriptText, /async steer\(message\) \{\s*steered\.push\(message\);/s);
  assert.match(scriptText, /const recovery = createStructuralRecoveryAgent\(\[\s*\{ type: "deepwork\/mode", data: \{ active: true \} \},\s*\{ type: "step\/start", data: \{ turn: 7, step: 2 \} \}/s);
  assert.match(scriptText, /recovery\.appendCalls !== 0/);
  assert.match(scriptText, /const errorPayload = \{\s*turn: 7,\s*step: 2,\s*provider: "primary",\s*failure: \{\s*status: 429,\s*code: "rate_limit",\s*message: "sensitive smoke provider body",\s*providerRetryAfterMs: 60_000\s*\},\s*retryPolicy: \{ owner: "host" \},\s*signal\s*\}/s);
  assert.doesNotMatch(scriptText.slice(scriptText.indexOf("const errorPayload ="), scriptText.indexOf("const hostRetry =")), /agent:/);
  assert.match(scriptText, /Object\.freeze\(\{ kind: "retry" \}\)/);
  assert.match(scriptText, /runtime\.agentEvents\(ctx, recovery\.agent\)\.waterfall\("agent\/request-error", errorPayload, async \(\) => hostRetry\)/);
  assert.match(scriptText, /hostRetryResult !== hostRetry/);
  assert.match(scriptText, /runtime\.agentEvents\(ctx, recovery\.agent\)\.waterfall\("agent\/request-error", errorPayload, async \(\) => undefined\)/);
  assert.match(scriptText, /fallbackRetry\?\.kind !== "retry"/);
  assert.match(scriptText, /runtime\.agentEvents\(ctx, recovery\.agent\)\.waterfall\("agent\/request", \{ turn: 7, step: 2, signal \}, async \(\) => fallbackDownstream\)/);
  assert.match(scriptText, /fallbackResult\.provider !== "deepseek-official"/);
  assert.match(scriptText, /fallbackResult\.model !== "deepseek-v4-pro"/);
  assert.match(scriptText, /fallbackResult\.reasoningEffort !== "high"/);
  assert.match(scriptText, /fallbackResult\.unknown !== fallbackDownstream\.unknown/);
  assert.match(scriptText, /fallbackResult\.nested !== fallbackDownstream\.nested/);
  assert.match(scriptText, /fallbackResult\.reasoningEffort === primaryConfig\.reasoningEffort/);
  assert.match(scriptText, /resolverCalls\.length !== 1/);
  assert.match(scriptText, /resolverCalls\[0\]\.provider !== "deepseek-official"/);
  assert.match(scriptText, /resolverCalls\[0\]\.model !== "deepseek-v4-pro"/);
  assert.match(scriptText, /type: "step\/start", data: \{ turn: 7, step: 2 \}/);
  assert.match(scriptText, /type: "request\/header", data: \{ reason: "initial", header: \{ config: primaryConfig \} \}/);
  assert.match(scriptText, /type: "request\/header", data: \{ reason: "change", header: \{ config: fallbackResult \} \}/);
  assert.match(scriptText, /type: "step\/end", data: \{ turn: 7, step: 2 \}/);
  assert.match(scriptText, /dsmm\.foldAttemptedRecoveryRoutes\(recovery\.events, 7, 2\)/);
  assert.match(scriptText, /provider: "primary", model: "primary-model"/);
  assert.match(scriptText, /provider: "deepseek-official", model: "deepseek-v4-pro"/);
  assert.match(scriptText, /recovery\.events\.some\(\(event\) => event\.type === "llm\/retry"\)/);
  assert.match(scriptText, /retryAfterTimerCalls !== 0/);
  assert.match(scriptText, /streamCalls !== 0/);
  assert.match(scriptText, /type: "deepwork\/mode", data: \{ active: true \}/);
  assert.match(scriptText, /type: "turn\/start", data: \{ turn: 8 \}/);
  assert.match(scriptText, /content: "Ship v0\.7", status: "in_progress"/);
  assert.match(scriptText, /runtime\.agentEvents\(ctx, continuation\.agent\)\.serial\("agent\/turn-stopping", \{ turn: 8, signal \}\)/);
  assert.match(scriptText, /continuation\.steered\.length !== 1/);
  assert.match(scriptText, /completed\.steered\.length !== 0/);
  assert.match(scriptText, /RUNTIME_RECOVERY_CONTINUATION_PROMPT/);
  assert.match(scriptText, /childSessionID|task_id|sessionID/);

  assert.match(scriptText, /async function smokeStatusCommand\(runtime, dsmm, installedPackageRoot\)/);
  assert.match(scriptText, /const statusConfig = \{\s*deepseekV4ProCalibration: "auto",\s*deepseekV4ProDefaultReasoningEffort: "high",\s*deepseekV4ProMaxReasoningPresets: \["dsmm-reviewer"\],\s*runtimeRecovery: \{\s*enabled: true,\s*retryOnStatusCodes: \[429\],\s*retryOnCodes: \[\],\s*fallbackRoutes: \[\s*\{ provider: "fallback-a", model: "model-a" \},\s*\{ provider: "fallback-b", model: "model-b" \}\s*\],\s*maxFallbackAttempts: 2,\s*idleContinuation: \{\s*enabled: false,\s*maxContinuations: 3,\s*prompt: RUNTIME_RECOVERY_CONTINUATION_PROMPT/s);
  assert.match(scriptText, /class StatusAdapter extends runtime\.LlmAdapter/);
  assert.match(scriptText, /resolveModelCalls \+= 1/);
  assert.match(scriptText, /streamCalls \+= 1/);
  assert.match(scriptText, /ctx\.llm\.registerAdapter\(\["deepseek-official"\], statusAdapter\)/);
  assert.match(scriptText, /meta: \{ cwd: installedPackageRoot, agentPreset: "dsmm-reviewer" \},\s*agentOptions: \{ provider: "deepseek-official", model: "deepseek-v4-pro" \}/s);
  assert.match(scriptText, /ctx\.commands\.execute\(agent, "\/dsmm-status", \[\], signal\)/);
  assert.match(scriptText, /ctx\.commands\.execute\(agent, "\/dsmm-status json", \[\], signal\)/);
  assert.match(scriptText, /human\?\.result\?\.kind !== "success"/);
  assert.match(scriptText, /json\?\.result\?\.kind !== "success"/);
  for (const expectedLine of [
    "Mode: inactive (deepwork)",
    "Scope: dsmm-reviewer preset",
    "Route: deepseek-official/deepseek-v4-pro [deepseek]",
    "Reasoning: auto; policy=max; current=provider default; action=fill-missing",
    "Runtime recovery: enabled; applies=yes; fallbacks=2; max attempts=2",
    "Idle continuation: disabled; max=3"
  ]) {
    assert.ok(scriptText.includes(JSON.stringify(expectedLine)), `missing exact status line ${expectedLine}`);
  }
  assert.match(scriptText, /dsmm\.createDsmmStatusSnapshot\(\{\s*agent,\s*settings: dsmm\.resolveConfig\(statusConfig\),\s*modeActive: false\s*\}\)/s);
  assert.match(scriptText, /isDeepStrictEqual\(jsonSnapshot, expectedSnapshot\)/);
  assert.match(scriptText, /const originalEventPrefix = Buffer\.from\(JSON\.stringify\(agent\.session\.events\), "utf8"\)/);
  assert.match(scriptText, /const originalEventCount = agent\.session\.events\.length/);
  assert.match(scriptText, /originalEventPrefix\.equals\(appendedPrefix\)/);
  assert.match(scriptText, /const expectedCommandEvents = \["command\/run", "command\/done", "command\/run", "command\/done"\]/);
  assert.match(scriptText, /resolveModelCalls !== 0/);
  assert.match(scriptText, /streamCalls !== 0/);
  assert.match(scriptText, /console\.log\("DSMM_STATUS_COMMAND_OK"\)/);

  assert.doesNotMatch(scriptText, /spawnSync\("docker", \["(?:stop|kill)"\]/);
  assert.doesNotMatch(scriptText, /spawnSync\("docker", \["container", "(?:stop|kill|prune)"\]/);
  assert.doesNotMatch(scriptText, /spawnSync\("docker", \["image", "prune"\]/);
  const imageRemovalTargets = [...scriptText.matchAll(/spawnSync\("docker", \["image", "rm", ([^\]]+)\]/gu)]
    .map((match) => match[1].trim());
  assert.deepEqual(imageRemovalTargets, ["imageTag"], "only the unique run-owned image tag may be removed");
  assert.doesNotMatch(scriptText, /(?:OPENAI|ANTHROPIC|DEEPSEEK|GOOGLE|GEMINI|OPENROUTER|COHERE)_API_KEY|AWS_SECRET_ACCESS_KEY|NPM_TOKEN|Authorization:\s*Bearer|sk-[A-Za-z0-9]/);

  const innerBranch = scriptText.indexOf('if (process.env.DSMM_DOCKER_INNER !== "1")');
  assert.notEqual(innerBranch, -1);
  assert.equal(scriptText.slice(0, innerBranch).includes("mkdtempSync("), false);
  const pinnedRequireDeclaration = scriptText.indexOf("let pinnedDshRequire;");
  assert.notEqual(pinnedRequireDeclaration, -1);
  assert.ok(pinnedRequireDeclaration < innerBranch, "pinned DSH resolver state must initialize before top-level smoke execution");
  assert.match(scriptText, /class MemorySettings extends SettingsProvider/);
  assert.match(scriptText, /doc = \{\};/);
  assert.match(scriptText, /get writable\(\) \{\s*return true;/s);
  assert.match(scriptText, /load\(\) \{\s*return Promise\.resolve\(structuredClone\(this\.doc\)\);/s);
  assert.match(scriptText, /persist\(namespace, section\) \{\s*this\.doc\[namespace\] = structuredClone\(section\);/s);

  const coreMounts = [
    "ctx.plugin(MemorySettings)",
    "ctx.plugin(runtime.LLM)",
    "ctx.plugin(runtime.SessionStore)",
    "ctx.plugin(runtime.SystemPrompt",
    "ctx.plugin(runtime.SkillRegistry)",
    "ctx.plugin(runtime.ToolRuntime)",
    "ctx.plugin(runtime.CommandRuntime)",
    "ctx.plugin(runtime.AgentRegistry)",
    "ctx.plugin(runtime.AgentLoop",
    "ctx.plugin(dsmm.default"
  ];
  let priorMount = -1;
  for (const mount of coreMounts) {
    const location = scriptText.indexOf(mount);
    assert.ok(location > priorMount, `${mount} is absent or out of order`);
    priorMount = location;
  }
  const settleNestedFibers = scriptText.indexOf("ctx.registry.values()", priorMount);
  const createOrdinaryAgent = scriptText.indexOf("ctx.agents.create(", settleNestedFibers);
  assert.ok(settleNestedFibers > priorMount, "nested plugin fibers must settle after mounting dsmm");
  assert.ok(createOrdinaryAgent > settleNestedFibers, "runtime agents must be created only after nested plugin fibers settle");
  assert.match(scriptText.slice(settleNestedFibers, createOrdinaryAgent), /fiber\.await\(\)/);

  assert.match(scriptText, /ctx\.agents\.create\(/);
  assert.match(scriptText, /ctx\.systemPrompt\.assemble\(/);
  assert.match(scriptText, /ctx\.skills\.list\(\{ scope: agent, cwd: agent\.session\.header\.cwd \}\)/);
  assert.match(scriptText, /ctx\.plugin\(runtime\.Loader\)/);
  assert.match(scriptText, /ctx\.loader\.builtins\.include = runtime\.Include/);
  assert.match(scriptText, /ctx\.plugin\(runtime\.AgentPresets/);
  assert.match(scriptText, /ctx\.agentPresets\.mount\(agentCtx, "dsmm-reviewer"\)/);
  assert.match(scriptText, /ctx\.commands\.execute\([^)]*"\/deepwork inspect repo"/s);
  assert.match(scriptText, /ctx\.tools\.execute\(/);
  assert.match(scriptText, /"tools\/pre-execute"/);
  assert.match(scriptText, /downstream smoke policy/);
  assert.match(scriptText, /git commit -m smoke/);
  assert.match(scriptText, /"x"\.repeat\(20_000\)/);
  assert.match(scriptText, /\[dsmm safety\] truncated/);
  assert.match(scriptText, /agentPreset: "dsmm-reviewer"/);
  assert.match(scriptText, /gitWriteGuard: "deny"/);
  assert.match(scriptText, /finally/);
  assert.match(scriptText, /ctx\.fiber\.dispose\(\)/);
  assert.match(scriptText, /fixture\.cleanup\(\)/);
  assert.match(scriptText, /rmSync\(home, \{ recursive: true, force: true/);
  assert.match(scriptText, /rmSync\(workspace, \{ recursive: true, force: true/);
  assert.doesNotMatch(scriptText, /throw new AggregateError\(cleanupErrors/);
  assert.match(scriptText, /lsp-mcp-smoke\.mjs/);
  assert.match(scriptText, /@deepseek-ai\/dsh-mcp-client/);
  assert.match(scriptText, /await ctx\.plugin\(mcpClient,/);
  assert.doesNotMatch(scriptText, /mcpClient\.default/);
  assert.match(scriptText, /mcp__dsmm_lsp__diagnostics/);
  assert.match(lspSmokeText, /tools\/list/);
  assert.match(lspSmokeText, /diagnostics/);
  assert.match(lspSmokeText, /tools\/call/);
  assert.match(lspFixtureText, /textDocument\/publishDiagnostics/);
  assert.match(readme, /pnpm --filter dsmm smoke:docker/);
  assert.match(readme, /docs\/agent-presets\.md/);
  assert.match(readme, /docs\/lsp\.md/);
  assert.match(docsText, /materialization is disabled by default/i);
  assert.match(docsText, /replace(?:s)? the whole `agent-presets` config/i);
  assert.match(docsText, /default: standard/);
  assert.match(patchText, /Example only/);
  assert.match(patchText, /default: standard/);
  assert.match(patchText, /includeUserRoot: true/);
  assert.match(lspPatchText, /@deepseek-ai\/dsh-mcp-client/);
});
