import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDiagnosticWorkspace } from "./lsp-smoke-fixture.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const PROFILE = "dsmm-smoke";
const INLINE_CAP = 1024;
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

async function runOuterSmoke() {
  const imageTag = `dsmm-dsh-smoke:${String(process.pid)}-${randomUUID()}`;
  let imageOwned = false;

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
  } finally {
    if (imageOwned) {
      const remove = spawnSync("docker", ["image", "rm", imageTag], { stdio: "inherit" });
      requireSuccess(remove, `docker image rm ${imageTag}`);
    }
  }
}

async function runInnerSmoke() {
  let workspace;
  let home;
  let passed = false;

  try {
    workspace = mkdtempSync(join(tmpdir(), "dsmm-pack-smoke-"));
    home = mkdtempSync(join(tmpdir(), "dsmm-dsh-home-"));
    const env = { ...process.env, DSH_HOME: home };
    const profileInstallEnv = { ...env, PNPM_CONFIG_AUTO_INSTALL_PEERS: "true" };

    const pack = spawnSync("pnpm", ["--dir", root, "pack", "--pack-destination", workspace], {
      encoding: "utf8",
      env
    });
    requireSuccess(pack, "pnpm pack dsmm");
    const tarballs = readdirSync(workspace).filter((name) => /^dsmm-.+\.tgz$/u.test(name));
    if (tarballs.length !== 1) throw new Error(`pnpm pack produced ${String(tarballs.length)} dsmm tarballs, expected exactly one`);
    const tarball = join(workspace, tarballs[0]);
    assertInsideOwnedRoot(tarball, workspace, "packed dsmm tarball");

    const install = spawnSync("dsh", ["plugin", "--profile", "dsmm-smoke", "add", tarball], {
      env: profileInstallEnv,
      stdio: "inherit"
    });
    requireSuccess(install, "dsh plugin add packed dsmm");

    const profilePackage = join(home, "profiles", PROFILE, "package.json");
    if (!existsSync(profilePackage)) throw new Error(`dsh profile package manifest was not created: ${profilePackage}`);
    const profileRequire = createRequire(join(home, "profiles", "dsmm-smoke", "package.json"));
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

    const dsmm = await import(pathToFileURL(dsmmEntry).href);
    const presetSkills = await import(pathToFileURL(presetSkillsEntry).href);
    requireFunction(dsmm.default, "packed dsmm default export");
    requireFunction(presetSkills.default, "packed dsmm/preset-skills default export");
    if (!Array.isArray(dsmm.DSMM_SKILL_NAMES) || dsmm.DSMM_SKILL_NAMES.length !== 7) {
      throw new Error("packed dsmm did not export the seven canonical DSMM_SKILL_NAMES");
    }
    console.log("PACKAGED_DSMM_RESOLVED");

    const dump = spawnSync("dsh", ["--profile", PROFILE, "--dump-config"], { env, encoding: "utf8" });
    requireSuccess(dump, "dsh --dump-config for packed profile");
    if (!dump.stdout.includes("id: dsmm")) throw new Error("packed dsh profile did not register the dsmm patch row");

    const runtime = await loadRuntimePackages();
    await smokeCoreRuntime(runtime, dsmm, installedPackageRoot);
    await smokeHeaderGuard(runtime, dsmm, installedPackageRoot);
    await smokeLspPipeline(runtime, dsmm, env, home);
    passed = true;
  } finally {
    const cleanupErrors = [];
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
    if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, "failed to clean owned dsmm Docker smoke resources");
  }

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
  const assembleContextFor = requireFunction(agent.assembleContextFor, "@deepseek-ai/dsh-agent assembleContextFor export");
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
    assembleContextFor,
    AgentLoop,
    AgentPresets,
    Loader,
    Include
  };
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
