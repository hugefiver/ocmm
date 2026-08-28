import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { throwAfterCleanup } from "./docker-cleanup-errors.mjs";
import { createDiagnosticWorkspace } from "./lsp-smoke-fixture.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const PROFILE = "dsmm-v1-smoke";
const INLINE_CAP = 1024;
const RUNTIME_RECOVERY_CONTINUATION_PROMPT = "Continue the DSMM v0.7 smoke from the durable todo list.";
let pinnedDshRequire;

if (process.env.DSMM_DOCKER_INNER !== "1") {
  await runOuterSmoke();
} else {
  await runInnerSmoke();
}

function requireSuccess(result, description) {
  if (result.error !== undefined) throw result.error;
  if (result.status === 0) return;
  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  throw new Error(`${description} failed with status ${String(result.status)}${stderr === "" ? "" : `: ${stderr}`}`);
}

function requireFunction(value, description) {
  if (typeof value !== "function") throw new Error(`${description} is missing or is not a function`);
  return value;
}

function requireMethod(value, method, description) {
  if (typeof value?.[method] !== "function") throw new Error(`${description} did not expose ${method}()`);
}

function textContent(result) {
  return (result?.content ?? [])
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function assertNoDsmmModelSkills(skills, dsmmNames, description) {
  const visible = new Set(skills.map((skill) => skill.name));
  const leaked = dsmmNames.filter((name) => visible.has(name));
  if (leaked.length > 0) throw new Error(`${description} leaked DSMM model skills: ${leaked.join(", ")}`);
}

function assertInsideOwnedRoot(path, ownedRoot, description) {
  const offset = relative(resolve(ownedRoot), resolve(path));
  if (offset === "" || (!offset.startsWith("..") && !isAbsolute(offset))) return;
  throw new Error(`${description} escaped owned root ${ownedRoot}: ${path}`);
}

function parseProfileManifest(profilePackage) {
  if (!existsSync(profilePackage)) throw new Error(`dsh profile package manifest was not created: ${profilePackage}`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(profilePackage, "utf8"));
  } catch (error) {
    throw new Error(`dsh profile package manifest was not valid JSON: ${profilePackage}`, { cause: error });
  }
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error(`dsh profile package manifest was not an object: ${profilePackage}`);
  }
  return manifest;
}

function profileBundles(manifest, profilePackage) {
  const bundles = manifest.dsh?.profile?.bundles;
  if (!Array.isArray(bundles)) throw new Error(`dsh profile bundles were not an array: ${profilePackage}`);
  return bundles;
}

function assertProfileManifestInstalled(profilePackage) {
  const manifest = parseProfileManifest(profilePackage);
  const dsmmDependencyCount = Object.keys(manifest.dependencies ?? {}).filter((packageName) => packageName === "dsmm").length;
  if (dsmmDependencyCount !== 1 || typeof manifest.dependencies?.dsmm !== "string" || manifest.dependencies.dsmm.length === 0) {
    throw new Error(`dsh profile did not install dependencies.dsmm: ${profilePackage}`);
  }
  const dsmmBundleCount = profileBundles(manifest, profilePackage).filter((bundle) => bundle === "dsmm").length;
  if (dsmmBundleCount !== 1) throw new Error(`dsh profile contained ${String(dsmmBundleCount)} dsmm bundle entries, expected exactly one`);
}

function assertProfileManifestRemoved(profilePackage) {
  const manifest = parseProfileManifest(profilePackage);
  const dsmmDependencyCount = Object.keys(manifest.dependencies ?? {}).filter((packageName) => packageName === "dsmm").length;
  if (dsmmDependencyCount !== 0 || manifest.dependencies?.dsmm !== undefined) throw new Error(`dsh profile retained dependencies.dsmm after removal: ${profilePackage}`);
  const bundles = manifest.dsh?.profile?.bundles ?? [];
  if (!Array.isArray(bundles)) throw new Error(`dsh profile bundles were not an array after removal: ${profilePackage}`);
  const dsmmBundleCount = bundles.filter((bundle) => bundle === "dsmm").length;
  if (dsmmBundleCount !== 0) throw new Error(`dsh profile retained ${String(dsmmBundleCount)} dsmm bundle entries after removal`);
}

function profileListHasStandaloneDsmmPackage(output) {
  return output.split(/\s+/u).some((token) => token === "dsmm" || token.startsWith("dsmm@"));
}

function assertProfilePluginList(output, expectedDsmm, description) {
  const actualDsmm = profileListHasStandaloneDsmmPackage(output);
  if (actualDsmm !== expectedDsmm) throw new Error(`${description} standalone dsmm package presence was ${String(actualDsmm)}, expected ${String(expectedDsmm)}`);
}

function assertInstalledDsmmPackage(installedPackageRoot) {
  const installedManifest = JSON.parse(readFileSync(join(installedPackageRoot, "package.json"), "utf8"));
  if (installedManifest.version !== "1.0.0") throw new Error(`installed dsmm package version was ${String(installedManifest.version)}, expected 1.0.0`);
  if (installedManifest.dsh?.bundle?.patch !== "./cordis.patch.yml") {
    throw new Error(`installed dsmm dsh.bundle.patch was ${String(installedManifest.dsh?.bundle?.patch)}, expected ./cordis.patch.yml`);
  }
  if (!existsSync(join(installedPackageRoot, installedManifest.dsh.bundle.patch))) {
    throw new Error("installed dsmm bundle patch was not shipped");
  }
}

function resolveProfileDsmm(profilePackage, home) {
  const profileRequire = createRequire(profilePackage);
  const dsmmEntry = profileRequire.resolve("dsmm");
  const presetSkillsEntry = profileRequire.resolve("dsmm/preset-skills");
  if (basename(dsmmEntry) !== "index.js" || basename(dirname(dsmmEntry)) !== "lib") {
    throw new Error(`profile dsmm entry was not .../lib/index.js: ${dsmmEntry}`);
  }
  const installedPackageRoot = dirname(dirname(dsmmEntry));
  if (resolve(installedPackageRoot) === resolve(root)) throw new Error("profile resolved the local source tree instead of packed dsmm");
  assertInsideOwnedRoot(installedPackageRoot, home, "installed dsmm package");
  if (dirname(dirname(presetSkillsEntry)) !== installedPackageRoot) {
    throw new Error(`dsmm/preset-skills resolved outside installed dsmm: ${presetSkillsEntry}`);
  }
  return { dsmmEntry, presetSkillsEntry, installedPackageRoot };
}

function parseReleaseReadinessReceipt(output) {
  const lines = output.split(/\r?\n/u).filter((line) => line.trim() !== "");
  if (lines.length !== 1) throw new Error(`release readiness checker returned ${String(lines.length)} receipt lines, expected exactly one`);
  let receipt;
  try {
    receipt = JSON.parse(lines[0]);
  } catch (error) {
    throw new Error("release readiness checker returned invalid JSON", { cause: error });
  }
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) {
    throw new Error("release readiness checker returned a non-object receipt");
  }
  return receipt;
}

function assertSentinelBuffersIdentical({ globalPatch, siblingPackage, siblingPatch }, { globalPatchSnapshot, siblingPackageSnapshot, siblingPatchSnapshot }) {
  if (!globalPatchSnapshot.equals(readFileSync(globalPatch))) throw new Error("top-level cordis.patch.yml changed during profile lifecycle");
  if (!siblingPackageSnapshot.equals(readFileSync(siblingPackage))) throw new Error("sibling profile package.json changed during profile lifecycle");
  if (!siblingPatchSnapshot.equals(readFileSync(siblingPatch))) throw new Error("sibling profile cordis.patch.yml changed during profile lifecycle");
}

async function runOuterSmoke() {
  const imageTag = `dsmm-dsh-smoke:${String(process.pid)}-${randomUUID()}`;
  let imageOwned = false;
  let primaryError;
  const cleanupErrors = [];

  try {
    const build = spawnSync("docker", [
      "build",
      "--build-arg",
      "DSH_PACKAGE=@deepseek-ai/dsh@0.1.1-rc.2",
      "-f",
      "docker/Dockerfile.smoke",
      "-t",
      imageTag,
      ".."
    ], { cwd: root, stdio: "inherit" });
    requireSuccess(build, "docker build");
    imageOwned = true;

    const run = spawnSync("docker", ["run", "--rm", imageTag], { stdio: "inherit" });
    requireSuccess(run, "docker run");
  } catch (error) {
    primaryError = error;
  } finally {
    if (imageOwned) {
      try {
        const remove = spawnSync("docker", ["image", "rm", imageTag], { stdio: "inherit" });
        requireSuccess(remove, `docker image rm ${imageTag}`);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }
  throwAfterCleanup(primaryError, cleanupErrors, "failed to clean owned dsmm Docker image");
}

async function runInnerSmoke() {
  let workspace;
  let home;
  let passed = false;
  let primaryError;
  const cleanupErrors = [];

  try {
    workspace = mkdtempSync(join(tmpdir(), "dsmm-pack-smoke-"));
    home = mkdtempSync(join(tmpdir(), "dsmm-dsh-home-"));
    const env = { ...process.env, DSH_HOME: home };
    const profileInstallEnv = { ...env, PNPM_CONFIG_AUTO_INSTALL_PEERS: "true" };
    const globalPatch = join(home, "cordis.patch.yml");
    const siblingDir = join(home, "profiles", "unrelated-smoke");
    const siblingPackage = join(siblingDir, "package.json");
    const siblingPatch = join(siblingDir, "cordis.patch.yml");
    mkdirSync(siblingDir, { recursive: true });
    writeFileSync(globalPatch, "# top-level smoke sentinel\n[]\n", "utf8");
    writeFileSync(siblingPackage, `${JSON.stringify({
      name: "unrelated-smoke",
      version: "0.0.0",
      private: true,
      dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"] } }
    }, null, 2)}\n`, "utf8");
    writeFileSync(siblingPatch, "# sibling smoke sentinel\n[]\n", "utf8");
    const globalPatchSnapshot = readFileSync(globalPatch);
    const siblingPackageSnapshot = readFileSync(siblingPackage);
    const siblingPatchSnapshot = readFileSync(siblingPatch);

    const pack = spawnSync("pnpm", ["--dir", root, "pack", "--pack-destination", workspace], {
      encoding: "utf8",
      env
    });
    requireSuccess(pack, "pnpm pack dsmm");
    const tarballs = readdirSync(workspace).filter((name) => /^dsmm-.+\.tgz$/u.test(name));
    if (tarballs.length !== 1) throw new Error(`pnpm pack produced ${String(tarballs.length)} dsmm tarballs, expected exactly one`);
    const tarball = join(workspace, tarballs[0]);
    assertInsideOwnedRoot(tarball, workspace, "packed dsmm tarball");

    const install = spawnSync("dsh", ["plugin", "--profile", PROFILE, "add", tarball], {
      env: profileInstallEnv,
      stdio: "inherit"
    });
    requireSuccess(install, "dsh plugin add packed dsmm");

    const profilePackage = join(home, "profiles", PROFILE, "package.json");
    const firstList = spawnSync("dsh", ["plugin", "--profile", PROFILE, "list"], { env, encoding: "utf8" });
    requireSuccess(firstList, "dsh plugin list after packed dsmm install");
    assertProfilePluginList(firstList.stdout, true, "dsh plugin list after packed dsmm install");
    assertProfileManifestInstalled(profilePackage);
    const { dsmmEntry, presetSkillsEntry, installedPackageRoot } = resolveProfileDsmm(profilePackage, home);
    assertInstalledDsmmPackage(installedPackageRoot);

    const dsmm = await import(pathToFileURL(dsmmEntry).href);
    const presetSkills = await import(pathToFileURL(presetSkillsEntry).href);
    requireFunction(dsmm.default, "packed dsmm default export");
    requireFunction(presetSkills.default, "packed dsmm/preset-skills default export");
    if (!Array.isArray(dsmm.DSMM_SKILL_NAMES) || dsmm.DSMM_SKILL_NAMES.length !== 7) {
      throw new Error("packed dsmm did not export the seven canonical DSMM_SKILL_NAMES");
    }
    console.log("PACKAGED_DSMM_RESOLVED");

    const firstDump = spawnSync("dsh", ["--profile", PROFILE, "--dump-config"], { env, encoding: "utf8" });
    requireSuccess(firstDump, "dsh --dump-config for packed profile");
    if (!firstDump.stdout.includes("id: dsmm")) throw new Error("packed dsh profile did not register the dsmm patch row");

    const runtime = await loadRuntimePackages();
    await smokeModelRouting(runtime, dsmm, installedPackageRoot);
    await smokeRuntimeRecovery(runtime, dsmm, installedPackageRoot);
    await smokeStatusCommand(runtime, dsmm, installedPackageRoot);
    await smokeCoreRuntime(runtime, dsmm, installedPackageRoot);
    await smokeHeaderGuard(runtime, dsmm, installedPackageRoot);
    await smokeLspPipeline(runtime, dsmm, env, home);

    const readiness = spawnSync(process.execPath, [join(root, "scripts", "check-release-readiness.mjs"), "--package-root", root], {
      encoding: "utf8",
      env
    });
    requireSuccess(readiness, "source release readiness checker");
    const receipt = parseReleaseReadinessReceipt(readiness.stdout);
    if (receipt.outcome !== "ready" || receipt.forbiddenSurfaceCount !== 0) {
      throw new Error(`source release readiness receipt was not ready with zero forbidden surfaces: ${JSON.stringify(receipt)}`);
    }
    console.log("DSMM_V1_RELEASE_CHECK_OK");
    console.log("DSMM_V1_PROFILE_INSTALL_OK");

    const remove = spawnSync("dsh", ["plugin", "--profile", PROFILE, "remove", "dsmm"], {
      env: profileInstallEnv,
      stdio: "inherit"
    });
    requireSuccess(remove, "dsh plugin remove packed dsmm");
    const removedList = spawnSync("dsh", ["plugin", "--profile", PROFILE, "list"], { env, encoding: "utf8" });
    requireSuccess(removedList, "dsh plugin list after packed dsmm removal");
    assertProfilePluginList(removedList.stdout, false, "dsh plugin list after packed dsmm removal");
    assertProfileManifestRemoved(profilePackage);
    assertSentinelBuffersIdentical({ globalPatch, siblingPackage, siblingPatch }, { globalPatchSnapshot, siblingPackageSnapshot, siblingPatchSnapshot });
    console.log("DSMM_V1_PROFILE_REMOVE_OK");

    const reinstall = spawnSync("dsh", ["plugin", "--profile", PROFILE, "add", tarball], {
      env: profileInstallEnv,
      stdio: "inherit"
    });
    requireSuccess(reinstall, "dsh plugin reinstall packed dsmm");
    const secondList = spawnSync("dsh", ["plugin", "--profile", PROFILE, "list"], { env, encoding: "utf8" });
    requireSuccess(secondList, "dsh plugin list after packed dsmm reinstall");
    assertProfilePluginList(secondList.stdout, true, "dsh plugin list after packed dsmm reinstall");
    assertProfileManifestInstalled(profilePackage);
    const reinstalled = resolveProfileDsmm(profilePackage, home);
    assertInstalledDsmmPackage(reinstalled.installedPackageRoot);
    const secondDump = spawnSync("dsh", ["--profile", PROFILE, "--dump-config"], { env, encoding: "utf8" });
    requireSuccess(secondDump, "dsh --dump-config after packed dsmm reinstall");
    if (!secondDump.stdout.includes("id: dsmm")) throw new Error("reinstalled dsh profile did not register the dsmm patch row");
    assertSentinelBuffersIdentical({ globalPatch, siblingPackage, siblingPatch }, { globalPatchSnapshot, siblingPackageSnapshot, siblingPatchSnapshot });
    console.log("DSMM_V1_GLOBAL_CONFIG_UNCHANGED");
    passed = true;
  } catch (error) {
    primaryError = error;
  } finally {
    if (home !== undefined) {
      try {
        rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (workspace !== undefined) {
      try {
        rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }

  throwAfterCleanup(primaryError, cleanupErrors, "failed to clean owned dsmm Docker smoke resources");
  if (passed) console.log("DSMM_PACKAGED_RUNTIME_SMOKE_OK");
}

function requireFromPinnedDsh() {
  if (pinnedDshRequire !== undefined) return pinnedDshRequire;
  const npmRoot = spawnSync("npm", ["root", "-g"], { encoding: "utf8" });
  requireSuccess(npmRoot, "npm root -g");
  const dshPackageJson = join(npmRoot.stdout.trim(), "@deepseek-ai", "dsh", "package.json");
  if (!existsSync(dshPackageJson)) throw new Error(`pinned DSH package manifest is missing: ${dshPackageJson}`);
  const manifest = JSON.parse(readFileSync(dshPackageJson, "utf8"));
  if (manifest.name !== "@deepseek-ai/dsh" || manifest.version !== "0.1.1-rc.2") {
    throw new Error(`expected @deepseek-ai/dsh 0.1.1-rc.2, found ${String(manifest.name)} ${String(manifest.version)}`);
  }
  pinnedDshRequire = createRequire(dshPackageJson);
  return pinnedDshRequire;
}

async function importDshPackage(packageName) {
  const resolver = requireFromPinnedDsh();
  let resolved;
  try {
    resolved = resolver.resolve(packageName);
  } catch (error) {
    throw new Error(`pinned DSH 0.1.1-rc.2 could not resolve ${packageName}`, { cause: error });
  }
  try {
    return await import(pathToFileURL(resolved).href);
  } catch (error) {
    throw new Error(`pinned DSH 0.1.1-rc.2 could not import ${packageName} from ${resolved}`, { cause: error });
  }
}

async function loadRuntimePackages() {
  const cordis = await importDshPackage("@deepseek-ai/cordis");
  const settings = await importDshPackage("@deepseek-ai/dsh-settings");
  const llm = await importDshPackage("@deepseek-ai/dsh-llm");
  const session = await importDshPackage("@deepseek-ai/dsh-session");
  const systemPrompt = await importDshPackage("@deepseek-ai/dsh-system-prompt");
  const skill = await importDshPackage("@deepseek-ai/dsh-skill");
  const tools = await importDshPackage("@deepseek-ai/dsh-tools");
  const commands = await importDshPackage("@deepseek-ai/dsh-commands");
  const agent = await importDshPackage("@deepseek-ai/dsh-agent");
  const agentLoop = await importDshPackage("@deepseek-ai/dsh-agent-loop");
  const agentPresets = await importDshPackage("@deepseek-ai/dsh-agent-presets");
  const loader = await importDshPackage("@deepseek-ai/cordis-plugin-loader");
  const include = await importDshPackage("@deepseek-ai/cordis-plugin-include");

  const Context = requireFunction(cordis.Context, "@deepseek-ai/cordis Context export");
  const SettingsProvider = requireFunction(settings.SettingsProvider, "@deepseek-ai/dsh-settings SettingsProvider export");
  const LLM = requireFunction(llm.default, "@deepseek-ai/dsh-llm default LLM plugin export");
  const CallId = requireFunction(llm.CallId, "@deepseek-ai/dsh-llm CallId export");
  const SessionStore = requireFunction(session.default, "@deepseek-ai/dsh-session default SessionStore export");
  const SessionId = requireFunction(session.SessionId, "@deepseek-ai/dsh-session SessionId export");
  const SystemPrompt = requireFunction(systemPrompt.default, "@deepseek-ai/dsh-system-prompt default SystemPrompt export");
  const renderPrompt = requireFunction(systemPrompt.renderPrompt, "@deepseek-ai/dsh-system-prompt renderPrompt export");
  const SkillRegistry = requireFunction(skill.default, "@deepseek-ai/dsh-skill default SkillRegistry export");
  const isModelInvocable = requireFunction(skill.isModelInvocable, "@deepseek-ai/dsh-skill isModelInvocable export");
  const ToolRuntime = requireFunction(tools.default, "@deepseek-ai/dsh-tools default ToolRuntime export");
  const defineTool = requireFunction(tools.defineTool, "@deepseek-ai/dsh-tools defineTool export");
  const CommandRuntime = requireFunction(commands.default, "@deepseek-ai/dsh-commands default CommandRuntime export");
  const AgentRegistry = requireFunction(agent.default, "@deepseek-ai/dsh-agent default AgentRegistry export");
  const agentEvents = requireFunction(agent.agentEvents, "@deepseek-ai/dsh-agent agentEvents export");
  const assembleContextFor = requireFunction(agent.assembleContextFor, "@deepseek-ai/dsh-agent assembleContextFor export");
  const LlmAdapter = requireFunction(llm.LlmAdapter, "@deepseek-ai/dsh-llm LlmAdapter export");
  const ReasoningEffortId = requireFunction(llm.ReasoningEffortId, "@deepseek-ai/dsh-llm ReasoningEffortId export");
  const AgentLoop = requireFunction(agentLoop.default, "@deepseek-ai/dsh-agent-loop default AgentLoop export");
  const AgentPresets = requireFunction(agentPresets.default, "@deepseek-ai/dsh-agent-presets default AgentPresets export");
  const Loader = requireFunction(loader.default, "@deepseek-ai/cordis-plugin-loader default Loader export");
  const Include = requireFunction(include.default, "@deepseek-ai/cordis-plugin-include default Include export");

  return {
    Context,
    SettingsProvider,
    LLM,
    CallId,
    SessionStore,
    SessionId,
    SystemPrompt,
    renderPrompt,
    SkillRegistry,
    isModelInvocable,
    ToolRuntime,
    defineTool,
    CommandRuntime,
    AgentRegistry,
    agentEvents,
    assembleContextFor,
    LlmAdapter,
    ReasoningEffortId,
    AgentLoop,
    AgentPresets,
    Loader,
    Include
  };
}

async function smokeModelRouting(runtime, dsmm, installedPackageRoot) {
  const ctx = new runtime.Context();
  const resolverCalls = [];
  let streamCalls = 0;
  let adapterRegistration;
  let agentHandle;
  let child;
  let childActive = false;

  class FakeAdapter extends runtime.LlmAdapter {
    async resolveModel(provider, model, signal) {
      resolverCalls.push({ provider, model, signal });
      const effort = (id, name) => ({ id: runtime.ReasoningEffortId(id), name });
      return {
        provider,
        id: model,
        name: "DeepSeek V4 Pro smoke model",
        reasoning: {
          efforts: [effort("off", "Off"), effort("high", "High"), effort("max", "Max")],
          defaultEffort: runtime.ReasoningEffortId("high")
        }
      };
    }

    async *stream() {
      streamCalls += 1;
      throw new Error("fake DeepSeek adapter stream must not be called by the routing smoke");
    }
  }

  try {
    ctx.baseUrl = `${pathToFileURL(installedPackageRoot).href}/`;
    await mountCoreServices(ctx, runtime, dsmm, {
      deepseekV4ProCalibration: "auto",
      deepseekV4ProDefaultReasoningEffort: "high"
    });

    const fake = new FakeAdapter();
    adapterRegistration = ctx.llm.registerAdapter(["deepseek-official"], fake);
    agentHandle = await ctx.agents.create({
      sessionId: runtime.SessionId("dsmm-smoke-model-routing"),
      meta: { cwd: installedPackageRoot },
      agentOptions: { provider: "deepseek-official", model: "deepseek-v4-pro" }
    });
    const agent = agentHandle.agent;
    if (agent.options.provider !== "deepseek-official" || agent.options.model !== "deepseek-v4-pro") {
      throw new Error(`model-routing smoke agent options changed: ${JSON.stringify(agent.options)}`);
    }

    const activationSignal = new AbortController().signal;
    const activation = await ctx.commands.execute(agent, "/deepwork", [], activationSignal);
    if (activation?.result?.kind !== "success" || !activation.result.text?.includes("Entering deepwork mode.")) {
      throw new Error(`model-routing deepwork activation failed: ${JSON.stringify(activation)}`);
    }

    let requestHits = 0;
    child = ctx.inject(["llm"], (readyCtx) => {
      readyCtx.on("agent/request", async (frame, next) => {
        if (frame.agent !== agent) throw new Error("agentEvents did not inject the exact routing smoke agent");
        requestHits += 1;
        return next();
      });
    });
    await child;
    childActive = true;
    if (child.state !== 2) throw new Error(`model-routing injection child was not active: ${String(child.state)}`);

    const dispatch = runtime.agentEvents(ctx, agent);
    const signal = new AbortController().signal;
    const downstream = {
      provider: "deepseek-official",
      model: "deepseek-v4-pro",
      temperature: 0.2,
      maxTokens: 321,
      stop: ["<END>"]
    };
    const result = await dispatch.waterfall("agent/request", { turn: 1, step: 1, signal }, async () => downstream);
    if (result.reasoningEffort !== "high") throw new Error(`expected high reasoning effort, received ${String(result.reasoningEffort)}`);
    if (result.provider !== downstream.provider) throw new Error("model-routing waterfall changed downstream provider");
    if (result.model !== downstream.model) throw new Error("model-routing waterfall changed downstream model");
    if (result.temperature !== downstream.temperature) throw new Error("model-routing waterfall changed downstream temperature");
    if (result.maxTokens !== downstream.maxTokens) throw new Error("model-routing waterfall changed downstream maxTokens");
    if (result.stop !== downstream.stop) throw new Error("model-routing waterfall changed downstream stop identity");
    if (resolverCalls.length !== 1) throw new Error(`first eligible request resolved ${String(resolverCalls.length)} times instead of once`);
    const [resolverCall] = resolverCalls;
    if (resolverCall.provider !== "deepseek-official") throw new Error(`resolver provider changed: ${String(resolverCall.provider)}`);
    if (resolverCall.model !== "deepseek-v4-pro") throw new Error(`resolver model changed: ${String(resolverCall.model)}`);
    if (resolverCall.signal !== signal) throw new Error("resolver did not receive the exact request signal");
    if (requestHits !== 1) throw new Error(`active injection child observed ${String(requestHits)} requests instead of 1`);

    await child.restart();
    if (child.state !== 2) throw new Error(`restarted model-routing injection child was not active: ${String(child.state)}`);
    const restartedResult = await dispatch.waterfall("agent/request", { turn: 1, step: 1, signal }, async () => downstream);
    if (restartedResult.reasoningEffort !== "high") throw new Error("restarted child request missed high reasoning effort");
    if (resolverCalls.length !== 2) throw new Error(`second eligible request changed resolver count to ${String(resolverCalls.length)}`);
    if (requestHits !== 2) throw new Error(`restarted injection child duplicated or missed a listener: ${String(requestHits)}`);

    await child.dispose();
    childActive = false;
    if (child.uid !== null) throw new Error(`model-routing injection child was not disposed terminally: ${String(child.uid)}`);
    const disposedResult = await dispatch.waterfall("agent/request", { turn: 1, step: 1, signal }, async () => downstream);
    if (disposedResult.reasoningEffort !== "high") throw new Error("disposed child request missed high reasoning effort");
    if (resolverCalls.length !== 3) throw new Error(`third eligible request changed resolver count to ${String(resolverCalls.length)}`);
    if (requestHits !== 2) throw new Error(`disposed injection child observed another request: ${String(requestHits)}`);
    for (const call of resolverCalls) {
      if (call.provider !== "deepseek-official" || call.model !== "deepseek-v4-pro" || call.signal !== signal) {
        throw new Error("an eligible request did not preserve the exact resolver route and signal");
      }
    }
    if (streamCalls !== 0) throw new Error(`fake DeepSeek adapter stream was entered ${String(streamCalls)} times`);
    console.log("MODEL_ROUTING_WATERFALL_OK");
  } finally {
    try {
      if (agentHandle !== undefined) await agentHandle.dispose();
    } finally {
      try {
        if (adapterRegistration !== undefined) adapterRegistration();
      } finally {
        try {
          if (childActive) await child.dispose();
        } finally {
          if (typeof ctx.fiber?.dispose !== "function") throw new Error("@deepseek-ai/cordis Context did not expose fiber.dispose()");
          await ctx.fiber.dispose();
        }
      }
    }
  }
}

function createStructuralRecoveryAgent(events, initialHeader) {
  let currentHeader = initialHeader;
  let appendCalls = 0;
  const steered = [];
  const session = {
    events,
    requestHeader() {
      return currentHeader;
    },
    append() {
      appendCalls += 1;
    }
  };
  const agent = {
    session,
    async steer(message) {
      steered.push(message);
    }
  };

  return {
    agent,
    events,
    steered,
    get appendCalls() {
      return appendCalls;
    },
    setHeader(header) {
      currentHeader = header;
    }
  };
}

async function smokeRuntimeRecovery(runtime, dsmm, installedPackageRoot) {
  const ctx = new runtime.Context();
  const resolverCalls = [];
  let streamCalls = 0;
  let adapterRegistration;

  class FakeAdapter extends runtime.LlmAdapter {
    async resolveModel(provider, model, signal) {
      resolverCalls.push({ provider, model, signal });
      const effort = (id, name) => ({ id: runtime.ReasoningEffortId(id), name });
      return {
        provider,
        id: model,
        name: "DeepSeek V4 Pro recovery smoke model",
        reasoning: {
          efforts: [effort("off", "Off"), effort("high", "High"), effort("max", "Max")],
          defaultEffort: runtime.ReasoningEffortId("high")
        }
      };
    }

    async *stream() {
      streamCalls += 1;
      throw new Error("fake DeepSeek adapter stream must not be called by the recovery smoke");
    }
  }

  try {
    ctx.baseUrl = `${pathToFileURL(installedPackageRoot).href}/`;
    await mountCoreServices(ctx, runtime, dsmm, {
      deepseekV4ProCalibration: "auto",
      deepseekV4ProDefaultReasoningEffort: "high",
      runtimeRecovery: {
        enabled: true,
        retryOnStatusCodes: [429],
        retryOnCodes: [],
        fallbackRoutes: [{ provider: "deepseek-official", model: "deepseek-v4-pro" }],
        maxFallbackAttempts: 2,
        idleContinuation: {
          enabled: true,
          maxContinuations: 1,
          prompt: RUNTIME_RECOVERY_CONTINUATION_PROMPT
        }
      }
    });

    const fake = new FakeAdapter();
    adapterRegistration = ctx.llm.registerAdapter(["deepseek-official"], fake);
    const signal = new AbortController().signal;
    const unknown = { preserved: "unknown route field" };
    const nested = { preserved: true };
    const primaryConfig = {
      provider: "primary",
      model: "primary-model",
      reasoningEffort: "low",
      unknown,
      nested
    };
    const recovery = createStructuralRecoveryAgent([
      { type: "deepwork/mode", data: { active: true } },
      { type: "step/start", data: { turn: 7, step: 2 } },
      { type: "request/header", data: { reason: "initial", header: { config: primaryConfig } } }
    ], { config: primaryConfig });
    const errorPayload = {
      turn: 7,
      step: 2,
      provider: "primary",
      failure: {
        status: 429,
        code: "rate_limit",
        message: "sensitive smoke provider body",
        providerRetryAfterMs: 60_000
      },
      retryPolicy: { owner: "host" },
      signal
    };
    const hostRetry = Object.freeze({ kind: "retry" });
    const hostRetryResult = await runtime.agentEvents(ctx, recovery.agent).waterfall("agent/request-error", errorPayload, async () => hostRetry);
    if (hostRetryResult !== hostRetry) throw new Error("host retry did not win by exact identity");
    const hostRetryDownstream = { ...primaryConfig };
    const hostRetryRequest = await runtime.agentEvents(ctx, recovery.agent).waterfall("agent/request", { turn: 7, step: 2, signal }, async () => hostRetryDownstream);
    if (hostRetryRequest !== hostRetryDownstream) throw new Error("host retry unexpectedly left a pending DSMM fallback route");

    let retryAfterTimerCalls = 0;
    const originalSetTimeout = globalThis.setTimeout;
    let fallbackRetry;
    globalThis.setTimeout = (...args) => {
      retryAfterTimerCalls += 1;
      return originalSetTimeout(...args);
    };
    try {
      fallbackRetry = await runtime.agentEvents(ctx, recovery.agent).waterfall("agent/request-error", errorPayload, async () => undefined);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
    if (fallbackRetry?.kind !== "retry") throw new Error(`host-declined retry did not schedule fallback: ${JSON.stringify(fallbackRetry)}`);
    if (retryAfterTimerCalls !== 0) throw new Error(`providerRetryAfterMs scheduled ${String(retryAfterTimerCalls)} timers`);
    const fallbackDownstream = { ...primaryConfig, unknown, nested };
    const fallbackResult = await runtime.agentEvents(ctx, recovery.agent).waterfall("agent/request", { turn: 7, step: 2, signal }, async () => fallbackDownstream);
    if (fallbackResult.provider !== "deepseek-official" || fallbackResult.model !== "deepseek-v4-pro") {
      throw new Error(`fallback route was not applied: ${JSON.stringify(fallbackResult)}`);
    }
    if (fallbackResult.reasoningEffort !== "high") throw new Error(`fallback did not receive calibrated high reasoning effort: ${String(fallbackResult.reasoningEffort)}`);
    if (fallbackResult.reasoningEffort === primaryConfig.reasoningEffort) throw new Error("fallback retained the primary reasoning effort");
    if (fallbackResult.unknown !== fallbackDownstream.unknown || fallbackResult.nested !== fallbackDownstream.nested) {
      throw new Error("fallback changed unknown or nested downstream field identity");
    }
    if (resolverCalls.length !== 1 || resolverCalls[0].provider !== "deepseek-official" || resolverCalls[0].model !== "deepseek-v4-pro" || resolverCalls[0].signal !== signal) {
      throw new Error(`resolver did not see only the final fallback route: ${JSON.stringify(resolverCalls)}`);
    }
    recovery.events.push(
      { type: "request/header", data: { reason: "change", header: { config: fallbackResult } } },
      { type: "step/end", data: { turn: 7, step: 2 } }
    );
    recovery.setHeader({ config: fallbackResult });
    const attemptedRoutes = dsmm.foldAttemptedRecoveryRoutes(recovery.events, 7, 2);
    const expectedRoutes = [
      { provider: "primary", model: "primary-model" },
      { provider: "deepseek-official", model: "deepseek-v4-pro" }
    ];
    if (JSON.stringify(attemptedRoutes) !== JSON.stringify(expectedRoutes)) {
      throw new Error(`durable recovery routes did not match: ${JSON.stringify(attemptedRoutes)}`);
    }
    if (recovery.appendCalls !== 0) throw new Error(`recovery smoke appended ${String(recovery.appendCalls)} synthetic durable events`);
    if (recovery.events.some((event) => event.type === "llm/retry")) throw new Error("recovery smoke created a forbidden durable llm/retry event");
    if (streamCalls !== 0) throw new Error(`fake DeepSeek adapter stream was entered ${String(streamCalls)} times`);
    console.log("RUNTIME_RECOVERY_FALLBACK_OK");

    const continuation = createStructuralRecoveryAgent([
      { type: "deepwork/mode", data: { active: true } },
      { type: "turn/start", data: { turn: 8 } },
      { type: "todo/write", data: { todos: [{ content: "Ship v0.7", status: "in_progress" }] } }
    ]);
    await runtime.agentEvents(ctx, continuation.agent).serial("agent/turn-stopping", { turn: 8, signal });
    await runtime.agentEvents(ctx, continuation.agent).serial("agent/turn-stopping", { turn: 8, signal });
    if (continuation.steered.length !== 1) throw new Error(`continuation cap expected one steer, received ${String(continuation.steered.length)}`);
    const continuationText = JSON.stringify(continuation.steered[0]);
    if (!continuationText.includes(RUNTIME_RECOVERY_CONTINUATION_PROMPT)) throw new Error("continuation did not contain the configured prompt");
    for (const forbiddenIdentifier of ["childSessionID", "sessionID", "task_id"]) {
      if (continuationText.includes(forbiddenIdentifier)) throw new Error(`continuation contained synthetic ${forbiddenIdentifier}`);
    }
    const completed = createStructuralRecoveryAgent([
      { type: "deepwork/mode", data: { active: true } },
      { type: "turn/start", data: { turn: 8 } },
      { type: "todo/write", data: { todos: [{ content: "Ship v0.7", status: "completed" }] } }
    ]);
    await runtime.agentEvents(ctx, completed.agent).serial("agent/turn-stopping", { turn: 8, signal });
    if (completed.steered.length !== 0) throw new Error(`completed todo steered ${String(completed.steered.length)} continuations`);
    if (continuation.appendCalls !== 0 || completed.appendCalls !== 0) throw new Error("continuation smoke appended synthetic durable events");
    console.log("RUNTIME_RECOVERY_CONTINUATION_OK");
  } finally {
    try {
      if (adapterRegistration !== undefined) adapterRegistration();
    } finally {
      if (typeof ctx.fiber?.dispose !== "function") throw new Error("@deepseek-ai/cordis Context did not expose fiber.dispose()");
      await ctx.fiber.dispose();
    }
  }
}

async function smokeStatusCommand(runtime, dsmm, installedPackageRoot) {
  const ctx = new runtime.Context();
  let adapterRegistration;
  let agentHandle;
  let resolveModelCalls = 0;
  let streamCalls = 0;
  const statusConfig = {
    deepseekV4ProCalibration: "auto",
    deepseekV4ProDefaultReasoningEffort: "high",
    deepseekV4ProMaxReasoningPresets: ["dsmm-reviewer"],
    runtimeRecovery: {
      enabled: true,
      retryOnStatusCodes: [429],
      retryOnCodes: [],
      fallbackRoutes: [
        { provider: "fallback-a", model: "model-a" },
        { provider: "fallback-b", model: "model-b" }
      ],
      maxFallbackAttempts: 2,
      idleContinuation: {
        enabled: false,
        maxContinuations: 3,
        prompt: RUNTIME_RECOVERY_CONTINUATION_PROMPT
      }
    }
  };

  class StatusAdapter extends runtime.LlmAdapter {
    async resolveModel(provider, model) {
      resolveModelCalls += 1;
      throw new Error(`status smoke attempted provider resolution for ${provider}/${model}`);
    }

    async *stream() {
      streamCalls += 1;
      throw new Error("status smoke adapter stream must not be called");
    }
  }

  try {
    ctx.baseUrl = `${pathToFileURL(installedPackageRoot).href}/`;
    await mountCoreServices(ctx, runtime, dsmm, statusConfig);

    const statusAdapter = new StatusAdapter();
    adapterRegistration = ctx.llm.registerAdapter(["deepseek-official"], statusAdapter);
    agentHandle = await ctx.agents.create({
      sessionId: runtime.SessionId("dsmm-smoke-status"),
      meta: { cwd: installedPackageRoot, agentPreset: "dsmm-reviewer" },
      agentOptions: { provider: "deepseek-official", model: "deepseek-v4-pro" }
    });
    const agent = agentHandle.agent;
    if (agent.options.provider !== "deepseek-official" || agent.options.model !== "deepseek-v4-pro") {
      throw new Error(`status smoke agent options changed: ${JSON.stringify(agent.options)}`);
    }

    const originalEventPrefix = Buffer.from(JSON.stringify(agent.session.events), "utf8");
    const originalEventCount = agent.session.events.length;
    const signal = new AbortController().signal;
    const human = await ctx.commands.execute(agent, "/dsmm-status", [], signal);
    if (human?.result?.kind !== "success") throw new Error(`human status command failed: ${JSON.stringify(human)}`);
    const humanLines = human.result.text?.split("\n") ?? [];
    for (const expectedLine of [
      "Mode: inactive (deepwork)",
      "Scope: dsmm-reviewer preset",
      "Route: deepseek-official/deepseek-v4-pro [deepseek]",
      "Reasoning: auto; policy=max; current=provider default; action=fill-missing",
      "Runtime recovery: enabled; applies=yes; fallbacks=2; max attempts=2",
      "Idle continuation: disabled; max=3"
    ]) {
      if (!humanLines.includes(expectedLine)) throw new Error(`human status did not contain exact line: ${expectedLine}`);
    }

    const json = await ctx.commands.execute(agent, "/dsmm-status json", [], signal);
    if (json?.result?.kind !== "success") throw new Error(`JSON status command failed: ${JSON.stringify(json)}`);
    let jsonSnapshot;
    try {
      jsonSnapshot = JSON.parse(json.result.text);
    } catch (error) {
      throw new Error("JSON status command did not return valid JSON", { cause: error });
    }
    const expectedSnapshot = dsmm.createDsmmStatusSnapshot({
      agent,
      settings: dsmm.resolveConfig(statusConfig),
      modeActive: false
    });
    if (!isDeepStrictEqual(jsonSnapshot, expectedSnapshot)) {
      throw new Error(`JSON status snapshot did not deep-equal the packed DSMM snapshot: ${JSON.stringify(jsonSnapshot)}`);
    }

    const appendedPrefix = Buffer.from(JSON.stringify(agent.session.events.slice(0, originalEventCount)), "utf8");
    if (!originalEventPrefix.equals(appendedPrefix)) throw new Error("status commands changed their original session-event prefix");
    const expectedCommandEvents = ["command/run", "command/done", "command/run", "command/done"];
    const appendedEvents = agent.session.events.slice(originalEventCount);
    const appendedEventTypes = appendedEvents.map((event) => event.type);
    if (!isDeepStrictEqual(appendedEventTypes, expectedCommandEvents)) {
      throw new Error(`status commands appended unexpected lifecycle events: ${JSON.stringify(appendedEventTypes)}`);
    }
    const modelVisibleEvents = appendedEventTypes.filter((type) => type.startsWith("dsmm/") || type.startsWith("model/") || type.startsWith("request/"));
    if (modelVisibleEvents.length > 0) {
      throw new Error(`status commands appended DSMM/model-visible/request events: ${modelVisibleEvents.join(", ")}`);
    }
    if (resolveModelCalls !== 0) throw new Error(`status smoke resolved ${String(resolveModelCalls)} provider models`);
    if (streamCalls !== 0) throw new Error(`status smoke entered provider stream ${String(streamCalls)} times`);
    console.log("DSMM_STATUS_COMMAND_OK");
  } finally {
    try {
      if (agentHandle !== undefined) await agentHandle.dispose();
    } finally {
      try {
        if (adapterRegistration !== undefined) adapterRegistration();
      } finally {
        if (typeof ctx.fiber?.dispose !== "function") throw new Error("@deepseek-ai/cordis Context did not expose fiber.dispose()");
        await ctx.fiber.dispose();
      }
    }
  }
}

async function mountCoreServices(ctx, runtime, dsmm, dsmmConfig = {}) {
  const { SettingsProvider } = runtime;
  class MemorySettings extends SettingsProvider {
    doc = {};

    get writable() {
      return true;
    }

    load() {
      return Promise.resolve(structuredClone(this.doc));
    }

    persist(namespace, section) {
      this.doc[namespace] = structuredClone(section);
      return Promise.resolve();
    }
  }

  await ctx.plugin(MemorySettings);
  await ctx.plugin(runtime.LLM);
  await ctx.plugin(runtime.SessionStore);
  await ctx.plugin(runtime.SystemPrompt, { persona: "" });
  await ctx.plugin(runtime.SkillRegistry);
  await ctx.plugin(runtime.ToolRuntime);
  await ctx.plugin(runtime.CommandRuntime);
  await ctx.plugin(runtime.AgentRegistry);
  await ctx.plugin(runtime.AgentLoop, { agents: [] });
  await ctx.plugin(dsmm.default, dsmmConfig);
  await Promise.all([...ctx.registry.values()].flatMap((plugin) => [...plugin.fibers]).map((fiber) => fiber.await()));

  requireMethod(ctx, "plugin", "Cordis Context");
  requireMethod(ctx.commands, "execute", "@deepseek-ai/dsh-commands ctx.commands");
  requireMethod(ctx.skills, "list", "@deepseek-ai/dsh-skill ctx.skills");
  requireMethod(ctx.systemPrompt, "assemble", "@deepseek-ai/dsh-system-prompt ctx.systemPrompt");
  requireMethod(ctx.tools, "execute", "@deepseek-ai/dsh-tools ctx.tools");
  requireMethod(ctx.agents, "create", "@deepseek-ai/dsh-agent ctx.agents");
}

function harmlessBashTool(defineTool) {
  return defineTool({
    name: "bash",
    description: "DSMM smoke tool that never executes its command",
    parameters: { command: { type: "string", required: true } },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }]
    },
    async execute(args) {
      return args.command === "read-only" ? "x".repeat(20_000) : "harmless smoke result";
    }
  });
}

async function modelSkillsFor(ctx, runtime, agent) {
  return (await ctx.skills.list({ scope: agent, cwd: agent.session.header.cwd }))
    .filter(runtime.isModelInvocable);
}

async function renderedPromptFor(ctx, runtime, agent) {
  return runtime.renderPrompt(await ctx.systemPrompt.assemble(runtime.assembleContextFor(agent)));
}

async function smokeCoreRuntime(runtime, dsmm, installedPackageRoot) {
  const ctx = new runtime.Context();
  try {
    ctx.baseUrl = `${pathToFileURL(installedPackageRoot).href}/`;
    await mountCoreServices(ctx, runtime, dsmm, {
      guards: { toolOutputTruncation: { enabled: true, maxInlineBytes: INLINE_CAP } }
    });

    const ordinaryHandle = await ctx.agents.create({
      sessionId: runtime.SessionId("dsmm-smoke-ordinary"),
      meta: { cwd: installedPackageRoot }
    });
    const ordinary = ordinaryHandle.agent;
    const ordinaryPrompt = await renderedPromptFor(ctx, runtime, ordinary);
    if (ordinaryPrompt.includes("<dsmm-deepwork-mode>") || ordinaryPrompt.includes("<dsmm-skill")) {
      throw new Error("ordinary agent received DSMM prompt content");
    }
    assertNoDsmmModelSkills(await modelSkillsFor(ctx, runtime, ordinary), dsmm.DSMM_SKILL_NAMES, "ordinary agent");
    console.log("ORDINARY_ISOLATED");

    const signal = new AbortController().signal;
    const command = await ctx.commands.execute(ordinary, "/deepwork inspect repo", [], signal);
    if (command?.result?.kind !== "success" || !command.result.text?.includes("Entering deepwork mode.")) {
      throw new Error(`deepwork command failed: ${JSON.stringify(command)}`);
    }
    const deepworkPrompt = await renderedPromptFor(ctx, runtime, ordinary);
    for (const name of dsmm.DSMM_SKILL_NAMES) {
      const opening = `<dsmm-skill name="${name}">`;
      if (countOccurrences(deepworkPrompt, opening) !== 1) {
        throw new Error(`deepwork prompt did not contain exactly one canonical body for ${name}`);
      }
    }
    assertNoDsmmModelSkills(await modelSkillsFor(ctx, runtime, ordinary), dsmm.DSMM_SKILL_NAMES, "generic deepwork agent");
    console.log("DEEPWORK_BODIES_ONCE");

    ctx.tools.register(harmlessBashTool(runtime.defineTool));
    let downstreamCalled = false;
    ctx.on("tools/pre-execute", async (exec, next) => {
      if (exec.name === "bash" && exec.arguments?.command === "git commit -m smoke") {
        downstreamCalled = true;
        return { kind: "deny", reason: "downstream smoke policy" };
      }
      return next();
    });

    const denied = await ctx.tools.execute({
      signal,
      callId: runtime.CallId("dsmm-downstream-deny"),
      agent: ordinary,
      name: "bash",
      arguments: { command: "git commit -m smoke" }
    });
    if (!downstreamCalled || denied.isError !== true || !JSON.stringify(denied).includes("downstream smoke policy")) {
      throw new Error(`downstream deny did not win: ${JSON.stringify(denied)}`);
    }
    console.log("DOWNSTREAM_DENY_WINS");

    const truncated = await ctx.tools.execute({
      signal,
      callId: runtime.CallId("dsmm-post-truncate"),
      agent: ordinary,
      name: "bash",
      arguments: { command: "read-only" }
    });
    const truncatedText = textContent(truncated);
    if (truncated.isError !== false || !truncatedText.includes("[dsmm safety] truncated") || Buffer.byteLength(truncatedText, "utf8") > INLINE_CAP) {
      throw new Error(`post-execute truncation failed: ${JSON.stringify(truncated)}`);
    }
    console.log("POST_EXECUTE_TRUNCATED");

    await ctx.plugin(runtime.Loader);
    if (typeof ctx.loader?.builtins !== "object" || ctx.loader.builtins === null) {
      throw new Error("@deepseek-ai/cordis-plugin-loader did not expose ctx.loader.builtins");
    }
    ctx.loader.builtins.include = runtime.Include;
    await ctx.plugin(runtime.AgentPresets, {
      default: "dsmm-reviewer",
      roots: [{ path: join(installedPackageRoot, "agent-presets"), trust: "user" }],
      includeUserRoot: false
    });
    requireMethod(ctx.agentPresets, "mount", "@deepseek-ai/dsh-agent-presets ctx.agentPresets");

    const presetHandle = await ctx.agents.create({
      sessionId: runtime.SessionId("dsmm-smoke-reviewer"),
      meta: { cwd: installedPackageRoot, agentPreset: "dsmm-reviewer" },
      setup: async (agentCtx) => void await ctx.agentPresets.mount(agentCtx, "dsmm-reviewer")
    });
    const presetAgent = presetHandle.agent;
    if (presetAgent.session.header.agentPreset !== "dsmm-reviewer") {
      throw new Error(`preset agent header mismatch: ${String(presetAgent.session.header.agentPreset)}`);
    }
    const scopedSkills = await modelSkillsFor(ctx, runtime, presetAgent);
    const scopedNames = new Set(scopedSkills.map((skill) => skill.name));
    const missingSkills = dsmm.DSMM_SKILL_NAMES.filter((name) => !scopedNames.has(name));
    if (missingSkills.length > 0) throw new Error(`reviewer preset missed scoped DSMM skills: ${missingSkills.join(", ")}`);
    const presetPrompt = await renderedPromptFor(ctx, runtime, presetAgent);
    for (const name of dsmm.DSMM_SKILL_NAMES) {
      if (countOccurrences(presetPrompt, `<dsmm-skill name="${name}">`) > 1) {
        throw new Error(`reviewer preset duplicated prompt body for ${name}`);
      }
    }
    console.log("PRESET_SCOPED_SKILLS");
  } finally {
    if (typeof ctx.fiber?.dispose !== "function") throw new Error("@deepseek-ai/cordis Context did not expose fiber.dispose()");
    await ctx.fiber.dispose();
  }
}

async function smokeHeaderGuard(runtime, dsmm, installedPackageRoot) {
  const ctx = new runtime.Context();
  try {
    await mountCoreServices(ctx, runtime, dsmm, { guards: { gitWriteGuard: "deny" } });
    ctx.tools.register(harmlessBashTool(runtime.defineTool));
    const handle = await ctx.agents.create({
      sessionId: runtime.SessionId("dsmm-smoke-header-guard"),
      meta: { cwd: installedPackageRoot, agentPreset: "dsmm-reviewer" }
    });
    const agent = handle.agent;
    if (agent.session.header.agentPreset !== "dsmm-reviewer") throw new Error("header-only preset metadata was not retained");
    if (agent.session.events.some((event) => event.type === "agent-preset/selected")) {
      throw new Error("header-only guard agent unexpectedly carried a preset selection event");
    }

    const denied = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: runtime.CallId("dsmm-header-deny"),
      agent,
      name: "bash",
      arguments: { command: "git commit -m smoke" }
    });
    if (denied.isError !== true || !JSON.stringify(denied).includes("[dsmm safety] git write command is disabled")) {
      throw new Error(`header-only DSMM guard did not deny git write: ${JSON.stringify(denied)}`);
    }
    console.log("HEADER_GUARD_ACTIVE");
  } finally {
    if (typeof ctx.fiber?.dispose !== "function") throw new Error("@deepseek-ai/cordis Context did not expose fiber.dispose()");
    await ctx.fiber.dispose();
  }
}

async function smokeLspPipeline(runtime, dsmm, env, home) {
  const direct = spawnSync(process.execPath, [join(root, "scripts", "lsp-mcp-smoke.mjs")], {
    env: { ...env, DSMM_LSP_COMMAND: "/usr/local/bin/ocmm-lsp" },
    stdio: "inherit"
  });
  requireSuccess(direct, "ocmm-lsp direct MCP diagnostics smoke");

  const lspPatch = join(home, "ocmm-lsp-mcp.cordis.patch.yml");
  writeFileSync(lspPatch, dsmm.renderLspMcpPatch({ enabled: true, command: "/usr/local/bin/ocmm-lsp" }), "utf8");
  const dump = spawnSync("dsh", ["--profile", "web", "--patch", lspPatch, "--dump-config"], { env, encoding: "utf8" });
  requireSuccess(dump, "dsh --dump-config with dsmm LSP MCP patch");
  if (!dump.stdout.includes("@deepseek-ai/dsh-mcp-client") || !dump.stdout.includes("serverName: dsmm_lsp")) {
    throw new Error("dumped dsh LSP config missed the MCP client or dsmm_lsp server");
  }

  await smokeDshMcpClient(runtime, dsmm);
  console.log("LSP_DIAGNOSTIC_OK");
}

async function smokeDshMcpClient(runtime, dsmm) {
  const mcpClient = await importDshPackage("@deepseek-ai/dsh-mcp-client");
  requireFunction(mcpClient.apply, "@deepseek-ai/dsh-mcp-client apply export");

  const fixture = createDiagnosticWorkspace("dsmm-dsh-mcp-smoke-");
  const ctx = new runtime.Context();
  try {
    await ctx.plugin(runtime.SystemPrompt, { persona: "" });
    await ctx.plugin(runtime.ToolRuntime);
    await ctx.plugin(mcpClient, dsmm.toDshMcpClientConfig({
      enabled: true,
      command: "/usr/local/bin/ocmm-lsp",
      env: fixture.env
    }));

    requireMethod(ctx.tools, "schemas", "@deepseek-ai/dsh-tools ctx.tools");
    requireMethod(ctx.tools, "execute", "@deepseek-ai/dsh-tools ctx.tools");
    const publicDiagnostics = dsmm.publicLspToolName("diagnostics");
    if (publicDiagnostics !== "mcp__dsmm_lsp__diagnostics") throw new Error(`unexpected public diagnostics name: ${publicDiagnostics}`);
    if (!ctx.tools.schemas().some((schema) => schema.name === publicDiagnostics)) {
      throw new Error(`${publicDiagnostics} was not exposed by the dsh MCP client`);
    }

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: runtime.CallId("dsmm-lsp-smoke-1"),
      name: publicDiagnostics,
      arguments: { filePath: fixture.subject, severity: "all" }
    });
    const text = textContent(result);
    if (result.isError !== false || !text.includes("dsmm smoke diagnostic")) {
      throw new Error(`${publicDiagnostics} response missed the smoke diagnostic: ${JSON.stringify(result)}`);
    }
  } finally {
    try {
      if (typeof ctx.fiber?.dispose !== "function") throw new Error("@deepseek-ai/cordis Context did not expose fiber.dispose()");
      await ctx.fiber.dispose();
    } finally {
      fixture.cleanup();
    }
  }
}
