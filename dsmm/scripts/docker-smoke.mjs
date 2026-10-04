import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { throwAfterCleanup } from "./docker-cleanup-errors.mjs";
import { createDiagnosticWorkspace } from "./lsp-smoke-fixture.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const PROFILE = "dsmm-v1-smoke";
const DSH_VERSION = "0.2.0-rc.2";
const requiredRolePlugins = [
  "dsh-agent-preset-registry", "dsh-tool-subagent", "dsh-tool-fs", "dsh-tool-fs-search",
  "dsh-tool-bash", "dsh-tool-pwsh", "dsh-tool-jobs", "dsh-skill-filesystem",
  "dsh-tool-skill", "dsh-persona", "dsh-agent-instructions"
];

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.DSMM_DOCKER_INNER === "1") await runInnerSmoke();
  else await runOuterSmoke();
}

function success(result, description) {
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    const output = [result.stderr, result.stdout].filter((value) => typeof value === "string" && value.trim() !== "").join("\n");
    const excerpt = output.length > 6000 ? `${output.slice(0, 2000)}\n[...truncated...]\n${output.slice(-4000)}` : output;
    throw new Error(`${description} failed: exit ${String(result.status)} ${excerpt}`);
  }
  return result.stdout ?? "";
}

function inside(path, ownedRoot, description) {
  const offset = relative(resolve(ownedRoot), resolve(path));
  if (offset === "" || (!offset.startsWith("..") && !isAbsolute(offset))) return;
  throw new Error(`${description} escaped its owned root: ${path}`);
}

function profileManifest(profilePackage) {
  if (!existsSync(profilePackage)) throw new Error(`missing profile manifest: ${profilePackage}`);
  return JSON.parse(readFileSync(profilePackage, "utf8"));
}

function assertInstalled(profilePackage, expected) {
  const manifest = profileManifest(profilePackage);
  const dependency = manifest.dependencies?.dsmm;
  const bundles = manifest.dsh?.profile?.bundles;
  if (!Array.isArray(bundles)) throw new Error("profile bundles must be an array");
  if ((typeof dependency === "string") !== expected || bundles.filter((item) => item === "dsmm").length !== Number(expected)) {
    throw new Error(`profile dsmm install state was not ${String(expected)}`);
  }
}

function assertListed(output, expected) {
  const present = output.split(/\s+/u).some((item) => item === "dsmm" || item.startsWith("dsmm@"));
  if (present !== expected) throw new Error(`dsh plugin list presence was ${String(present)}, expected ${String(expected)}`);
}

function assertSentinels({ globalPatch, siblingPackage, siblingPatch }, snapshots) {
  for (const [path, bytes] of [[globalPatch, snapshots[0]], [siblingPackage, snapshots[1]], [siblingPatch, snapshots[2]]]) {
    if (!bytes.equals(readFileSync(path))) throw new Error(`profile lifecycle modified unrelated config: ${path}`);
  }
}

function runDsh(env, args, description) {
  // DSH's CLI passes its own stdin through to pnpm. A smoke check has no
  // interactive input; keeping a pipe open can leave pnpm alive after "Done".
  const timeout = args.includes("remove") ? 90_000 : 300_000;
  const result = spawnSync("dsh", args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
    windowsHide: true
  });
  if (result.error?.code === "ETIMEDOUT") throw new Error(`${description} exceeded ${String(timeout)}ms after DSH/pnpm output: ${(result.stdout ?? "").slice(-1000)}`);
  return success(result, description);
}

async function runOuterSmoke() {
  const imageTag = `dsmm-dsh-smoke:${String(process.pid)}-${randomUUID()}`;
  let imageOwned = false;
  let primaryError;
  const cleanupErrors = [];
  try {
    success(spawnSync("docker", ["build", "--build-arg", "DSH_PACKAGE=@deepseek-ai/dsh@0.2.0-rc.2", "-f", "docker/Dockerfile.smoke", "-t", imageTag, ".."], { cwd: root, stdio: "inherit" }), "docker build");
    imageOwned = true;
    success(spawnSync("docker", ["run", "--rm", imageTag], { stdio: "inherit" }), "docker run");
  } catch (error) {
    primaryError = error;
  } finally {
    if (imageOwned) {
      try { success(spawnSync("docker", ["image", "rm", imageTag], { stdio: "inherit" }), "docker image cleanup"); }
      catch (error) { cleanupErrors.push(error); }
    }
  }
  throwAfterCleanup(primaryError, cleanupErrors, "failed to clean owned dsmm Docker image");
}

async function runInnerSmoke() {
  let workspace;
  let home;
  let primaryError;
  const cleanupErrors = [];
  try {
    workspace = mkdtempSync(join(tmpdir(), "dsmm-pack-smoke-"));
    home = mkdtempSync(join(tmpdir(), "dsmm-dsh-home-"));
    const env = { ...process.env, DSH_HOME: home, DSH_TELEMETRY_MODE: "DISABLED", DSH_TELEMETRY_DISABLED: "1" };
    const installEnv = { ...env, PNPM_CONFIG_AUTO_INSTALL_PEERS: "true" };
    const globalPatch = join(home, "cordis.patch.yml");
    const siblingDir = join(home, "profiles", "unrelated-smoke");
    const siblingPackage = join(siblingDir, "package.json");
    const siblingPatch = join(siblingDir, "cordis.patch.yml");
    mkdirSync(siblingDir, { recursive: true });
    writeFileSync(globalPatch, "# top-level smoke sentinel\n[]\n");
    writeFileSync(siblingPackage, `${JSON.stringify({ name: "unrelated-smoke", version: "0.0.0", private: true, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"] } } }, null, 2)}\n`);
    writeFileSync(siblingPatch, "# sibling smoke sentinel\n[]\n");
    const snapshots = [globalPatch, siblingPackage, siblingPatch].map((path) => readFileSync(path));
    const sentinels = { globalPatch, siblingPackage, siblingPatch };
    const profilePackage = join(home, "profiles", PROFILE, "package.json");
    runDsh(env, ["--profile", PROFILE, "--from-default-profile", "headless", "--dump-config"], "initialize headless profile");
    assertInstalled(profilePackage, false);
    assertDump(env, false);
    assertSentinels(sentinels, snapshots);

    const dshRequire = pinnedDshRequire();
    success(spawnSync("pnpm", ["--dir", root, "pack", "--pack-destination", workspace], { env, encoding: "utf8" }), "pnpm pack dsmm");
    const tarballs = readdirSync(workspace).filter((name) => /^dsmm-.+\.tgz$/u.test(name));
    if (tarballs.length !== 1) throw new Error("pnpm pack did not produce exactly one dsmm tarball");
    const tarball = join(workspace, tarballs[0]);
    inside(tarball, workspace, "dsmm tarball");

    runDsh(installEnv, ["plugin", "--profile", PROFILE, "add", tarball], "install packed dsmm");
    assertInstalled(profilePackage, true);
    assertListed(runDsh(env, ["plugin", "--profile", PROFILE, "list"], "list installed dsmm"), true);
    const installedRoot = await assertPackedExports(profilePackage, home);
    assertDump(env, true);
    console.log("DSMM_V1_PROFILE_INSTALL_OK");

    await smokeRuntimeDomains(installedRoot, dshRequire, env, home);
    const receipt = JSON.parse(success(spawnSync(process.execPath, [join(root, "scripts", "check-release-readiness.mjs"), "--package-root", root], { env, encoding: "utf8" }), "release readiness"));
    if (receipt.outcome !== "ready" || receipt.forbiddenSurfaceCount !== 0) throw new Error(`release readiness failed: ${JSON.stringify(receipt)}`);
    console.log("DSMM_V1_RELEASE_CHECK_OK");

    runDsh(installEnv, ["plugin", "--profile", PROFILE, "remove", "dsmm"], "remove packed dsmm");
    assertInstalled(profilePackage, false);
    assertListed(runDsh(env, ["plugin", "--profile", PROFILE, "list"], "list after remove"), false);
    assertSentinels(sentinels, snapshots);
    console.log("DSMM_V1_PROFILE_REMOVE_OK");

    runDsh(installEnv, ["plugin", "--profile", PROFILE, "add", tarball], "reinstall packed dsmm");
    assertInstalled(profilePackage, true);
    assertListed(runDsh(env, ["plugin", "--profile", PROFILE, "list"], "list after reinstall"), true);
    await assertPackedExports(profilePackage, home);
    assertDump(env, true);
    assertSentinels(sentinels, snapshots);
    console.log("DSMM_V1_GLOBAL_CONFIG_UNCHANGED");
  } catch (error) {
    primaryError = error;
  } finally {
    for (const dir of [home, workspace]) {
      if (dir === undefined) continue;
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
      catch (error) { cleanupErrors.push(error); }
    }
  }
  throwAfterCleanup(primaryError, cleanupErrors, "failed to clean owned dsmm Docker smoke resources");
  console.log("DSMM_PACKAGED_RUNTIME_SMOKE_OK");
}

function pinnedDshRequire() {
  const npmRoot = success(spawnSync("npm", ["root", "-g"], { encoding: "utf8" }), "npm root -g").trim();
  const packagePath = join(npmRoot, "@deepseek-ai", "dsh", "package.json");
  const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
  if (manifest.name !== "@deepseek-ai/dsh" || manifest.version !== DSH_VERSION) throw new Error(`pinned DSH identity mismatch: ${manifest.name}@${manifest.version}`);
  return createRequire(packagePath);
}

async function importDsh(dshRequire, name) {
  return import(pathToFileURL(dshRequire.resolve(name)).href);
}

async function assertPackedExports(profilePackage, home) {
  const profileRequire = createRequire(profilePackage);
  const entry = profileRequire.resolve("dsmm");
  const skillsEntry = profileRequire.resolve("dsmm/preset-skills");
  const packageRoot = dirname(dirname(entry));
  inside(packageRoot, home, "installed dsmm package");
  if (resolve(packageRoot) === resolve(root) || basename(entry) !== "index.js" || basename(dirname(entry)) !== "lib" || dirname(dirname(skillsEntry)) !== packageRoot) {
    throw new Error("profile did not resolve the packed dsmm entry points");
  }
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  if (manifest.version !== "0.1.0" || manifest.dsh?.bundle?.patch !== "./cordis.patch.yml" || !existsSync(join(packageRoot, manifest.dsh.bundle.patch))) {
    throw new Error("installed dsmm manifest or patch does not match packed bundle");
  }
  for (const name of requiredRolePlugins) profileRequire.resolve(`@deepseek-ai/${name}`);
  const dsmm = await import(pathToFileURL(entry).href);
  const presetSkills = await import(pathToFileURL(skillsEntry).href);
  if (typeof dsmm.default !== "function" || typeof presetSkills.default !== "function" || dsmm.DSMM_SKILL_NAMES?.length !== 7 || dsmm.DSMM_ROLE_IDS?.length !== 12 || dsmm.DSMM_LSP_TOOL_NAMES?.length !== 9) {
    throw new Error("packed dsmm exports missed canonical skills, roles, or LSP tools");
  }
  console.log("PACKAGED_DSMM_RESOLVED");
  return packageRoot;
}

function assertDump(env, installed) {
  const dump = runDsh(env, ["--profile", PROFILE, "--dump-config"], "dsh profile dump-config");
  if (dump.includes("id: dsmm") !== installed) throw new Error("profile dump disagreed with dsmm bundle state");
  if (installed && (!dump.includes("defaultActive: false") || !dump.includes("name: dsmm"))) throw new Error("profile did not compose restart-scoped DSMM settings");
}

async function smokeRuntimeDomains(installedRoot, dshRequire, env, home) {
  // Run each domain against the current source build in the same container as
  // the *separately verified* installed package. These tests assert actual DSH
  // 0.2 contracts; the profile dump above proves the packed bundle is loaded.
  const domains = [
    ["MODEL_ROUTING", ["native-model-routing.test.ts", "model-routing.test.ts"]],
    ["RUNTIME_RECOVERY", ["runtime-recovery.test.ts", "recovery-policy.test.ts"]],
    ["STATUS_COMMAND", ["status.test.ts"]],
    ["CORE_PROMPT_SKILLS", ["mode.test.ts", "skills.test.ts", "prompts.test.ts"]],
    ["SAFETY_GUARDS", ["guards.test.ts"]],
    ["NATIVE_ROLE_COMPOSITION", ["preset-registry.test.ts", "roles.test.ts"]],
    ["NATIVE_HOST_CONTRACT", ["native-runtime-contract.test.ts"]],
    ["ROLE_SUBAGENTS", ["role-subagents.test.ts"]],
    ["NATIVE_PRESET_SECURITY", ["native-preset-security.test.ts"]]
  ];
  for (const [domain, files] of domains) {
    success(spawnSync(process.execPath, ["--test", "--experimental-strip-types", ...files.map((file) => join(root, "test", file))], { env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }), `${domain} DSH runtime contract tests`);
    console.log(`DSMM_${domain}_OK`);
  }
  const dsmm = await import(pathToFileURL(join(installedRoot, "lib", "index.js")).href);
  await smokeLspPipeline(dshRequire, dsmm, env, home);
}

async function smokeLspPipeline(dshRequire, dsmm, env, home) {
  const direct = spawnSync(process.execPath, [join(root, "scripts", "lsp-mcp-smoke.mjs")], { env: { ...env, DSMM_LSP_COMMAND: "/usr/local/bin/ocmm-lsp" }, stdio: "inherit" });
  success(direct, "ocmm-lsp direct MCP diagnostics and format smoke");
  const lspPatch = join(home, "ocmm-lsp-mcp.cordis.patch.yml");
  writeFileSync(lspPatch, dsmm.renderLspMcpPatch({ enabled: true, command: "/usr/local/bin/ocmm-lsp" }));
  const dump = runDsh(env, ["--profile", PROFILE, "--patch", lspPatch, "--dump-config"], "dsh MCP bridge patch dump");
  if (!dump.includes("@deepseek-ai/dsh-mcp-client") || !dump.includes("serverName: dsmm_lsp")) throw new Error("DSH profile did not compose the opt-in LSP bridge");
  await smokeDshMcpClient(dshRequire, dsmm);
  console.log("DSMM_LSP_DIAGNOSTIC_FORMAT_OK");
}

export async function smokeDshMcpClient(dshRequire, dsmm, command = "/usr/local/bin/ocmm-lsp") {
  const [{ Context }, { default: SystemPrompt }, { default: ToolRuntime }, { ToolCallId }, mcpClient] = await Promise.all([
    importDsh(dshRequire, "@deepseek-ai/cordis"),
    importDsh(dshRequire, "@deepseek-ai/dsh-system-prompt"),
    importDsh(dshRequire, "@deepseek-ai/dsh-tools"),
    importDsh(dshRequire, "@deepseek-ai/dsh-llm"),
    importDsh(dshRequire, "@deepseek-ai/dsh-mcp-client")
  ]);
  const fixture = createDiagnosticWorkspace("dsmm-dsh-mcp-smoke-");
  const ctx = new Context();
  try {
    await ctx.plugin(SystemPrompt, { persona: "" });
    await ctx.plugin(ToolRuntime);
    await ctx.plugin(mcpClient, dsmm.toDshMcpClientConfig({ enabled: true, command, env: fixture.env }));
    const diagnostics = dsmm.publicLspToolName("diagnostics");
    const format = dsmm.publicLspToolName("format");
    for (const name of [diagnostics, format]) {
      if (!ctx.tools.schemas().some((schema) => schema.name === name)) throw new Error(`DSH MCP client did not expose ${name}`);
    }
    const signal = new AbortController().signal;
    const result = await ctx.tools.execute({ signal, callId: ToolCallId("dsmm-mcp-diagnostics"), name: diagnostics, arguments: { filePath: fixture.subject, severity: "all" } });
    if (result.isError || !JSON.stringify(result).includes("dsmm smoke diagnostic")) throw new Error("DSH MCP diagnostics request failed");
    const formatted = await ctx.tools.execute({ signal, callId: ToolCallId("dsmm-mcp-format"), name: format, arguments: { filePath: fixture.subject } });
    if (formatted.isError || readFileSync(fixture.subject, "utf8") !== 'const value: number = "wrong";\n') throw new Error("DSH MCP format did not commit source edit");
  } finally {
    try { await ctx.fiber.dispose(); }
    finally { fixture.cleanup(); }
  }
}
