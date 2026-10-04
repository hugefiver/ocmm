import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { throwAfterCleanup } from "./docker-cleanup-errors.mjs";
import { createDiagnosticWorkspace } from "./lsp-smoke-fixture.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const PROFILE = "dsmm-v1-smoke";
const PACKAGE_NAME = "@dsmm/dsmm";
const DSH_VERSION = "0.2.0-rc.2";
const ARTIFACT_RECEIPT_PREFIX = "DSMM_FINAL_ARTIFACT_RECEIPT ";
const STOCK_PERSISTENCE_ID = "session-persistence-jsonl";
const STOCK_PERSISTENCE_MODULE = "@deepseek-ai/dsh-session-persistence-jsonl";
const requiredRolePlugins = [
  "dsh-agent-preset-registry", "dsh-tool-subagent", "dsh-tool-fs", "dsh-tool-fs-search",
  "dsh-tool-bash", "dsh-tool-pwsh", "dsh-tool-jobs", "dsh-skill-filesystem",
  "dsh-tool-skill", "dsh-persona", "dsh-agent-instructions"
];

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some((arg) => arg === "--artifact" || arg.startsWith("--artifact="))) await runArtifactSmoke();
  else if (process.env.DSMM_DOCKER_INNER === "1") await runInnerSmoke();
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

export function parseArtifactOptions(args) {
  const { values } = parseArgs({ args, options: {
    artifact: { type: "string" }, image: { type: "string" }, receipt: { type: "string" },
    "expected-sha256": { type: "string" }, "acceptance-hook": { type: "string" }, "hook-support": { type: "string", multiple: true }, "evidence-dir": { type: "string" },
    "require-hook": { type: "boolean", default: false }
  } });
  if (!values.artifact) throw new Error("--artifact must name the exact frozen .tgz to test");
  const artifact = resolve(values.artifact);
  if (!artifact.endsWith(".tgz") || !statSync(artifact).isFile()) throw new Error("--artifact must be an existing .tgz file");
  const sha256 = createHash("sha256").update(readFileSync(artifact)).digest("hex");
  if (values["expected-sha256"] !== undefined && values["expected-sha256"] !== sha256) throw new Error("frozen artifact SHA-256 did not match --expected-sha256");
  const hook = values["acceptance-hook"] === undefined ? undefined : resolve(values["acceptance-hook"]);
  if (hook !== undefined && (!hook.endsWith(".mjs") || !statSync(hook).isFile())) throw new Error("--acceptance-hook must name an existing .mjs module");
  if (values["require-hook"] && hook === undefined) throw new Error("full acceptance requires --acceptance-hook; native evidence alone does not prove UI/profiles");
  const hookSupport = (values["hook-support"] ?? []).map((file) => resolve(file));
  if (hookSupport.length && hook === undefined) throw new Error("--hook-support requires --acceptance-hook");
  const supportNames = new Set();
  for (const file of hookSupport) {
    if (!file.endsWith(".mjs") || !statSync(file).isFile() || basename(file) === "hook.mjs" || supportNames.has(basename(file))) {
      throw new Error("hook support must name distinct existing .mjs files without replacing hook.mjs");
    }
    supportNames.add(basename(file));
  }
  const evidenceDir = values["evidence-dir"] === undefined ? undefined : resolve(values["evidence-dir"]);
  if (evidenceDir !== undefined && (!statSync(evidenceDir).isDirectory() || readdirSync(evidenceDir).length !== 0)) {
    throw new Error("--evidence-dir must be an existing empty task-owned directory; no existing user data may enter the container");
  }
  if (evidenceDir !== undefined && hook === undefined) throw new Error("--evidence-dir is only used by --acceptance-hook");
  return { artifact, sha256, image: values.image, receipt: values.receipt === undefined ? undefined : resolve(values.receipt), hook, hookSupport, evidenceDir, requireHook: values["require-hook"] };
}

export function artifactDockerArguments(options, imageTag) {
  const args = ["run", "--rm", "--init", "--network", "bridge", "--shm-size", "256m", "--mount", `type=bind,source=${options.artifact},target=/dsmm-acceptance/package.tgz,readonly`];
  // Bind only explicit harness files and the chosen artifact, never a home,
  // profile, credentials directory, source checkout, or ancestor directory.
  for (const file of ["docker-smoke.mjs", "docker-cleanup-errors.mjs", "native-preset-smoke.mjs", "session-history-smoke.mjs", "lsp-mcp-smoke.mjs", "lsp-smoke-fixture.mjs"]) {
    args.push("--mount", `type=bind,source=${join(root, "scripts", file)},target=/dsmm-acceptance/scripts/${file},readonly`);
  }
  if (options.hook !== undefined) args.push("--mount", `type=bind,source=${options.hook},target=/dsmm-acceptance/hook.mjs,readonly`);
  for (const file of options.hookSupport ?? []) args.push("--mount", `type=bind,source=${file},target=/dsmm-acceptance/${basename(file)},readonly`);
  if (options.evidenceDir !== undefined) args.push("--mount", `type=bind,source=${options.evidenceDir},target=/dsmm-acceptance/ui-qa`, "--env", "DSMM_UI_EVIDENCE_DIR=/dsmm-acceptance/ui-qa");
  args.push(imageTag);
  if (options.hook !== undefined) args.push("xvfb-run", "-a", "--server-args=-screen 0 1440x1000x24");
  args.push("node", "/dsmm-acceptance/scripts/docker-smoke.mjs", "--artifact", "/dsmm-acceptance/package.tgz", "--expected-sha256", options.sha256);
  if (options.hook !== undefined) args.push("--acceptance-hook", "/dsmm-acceptance/hook.mjs");
  for (const file of options.hookSupport ?? []) args.push("--hook-support", `/dsmm-acceptance/${basename(file)}`);
  if (options.evidenceDir !== undefined) args.push("--evidence-dir", "/dsmm-acceptance/ui-qa");
  if (options.requireHook) args.push("--require-hook");
  return args;
}

export function parseContainerArtifactReceipt(output, expectedSha256) {
  const line = output.split(/\r?\n/u).findLast((item) => item.startsWith(ARTIFACT_RECEIPT_PREFIX));
  if (line === undefined) throw new Error("container did not produce a final-artifact receipt");
  const receipt = JSON.parse(line.slice(ARTIFACT_RECEIPT_PREFIX.length));
  if (receipt.artifact?.sha256 !== expectedSha256 || receipt.artifact?.sha256After !== expectedSha256) {
    throw new Error("container receipt did not bind the exact unchanged frozen artifact");
  }
  return receipt;
}

async function runArtifactSmoke() {
  const options = parseArtifactOptions(process.argv.slice(2));
  if (process.env.DSMM_DOCKER_INNER === "1") return await runInnerArtifactSmoke(options);
  const imageTag = options.image ?? `dsmm-final-artifact:${process.pid}-${randomUUID()}`;
  let imageOwned = false;
  let primaryError;
  const cleanupErrors = [];
  let receipt = { outcome: "FAILED", acceptanceScope: "native-final-artifact", artifact: { sha256: options.sha256 }, uiProfiles: { outcome: "NOT_RUN" } };
  try {
    if (options.image === undefined) {
      success(spawnSync("docker", ["build", "--build-arg", `DSH_PACKAGE=@deepseek-ai/dsh@${DSH_VERSION}`, "-f", "docker/Dockerfile.artifact", "-t", imageTag, ".."], { cwd: root, stdio: "inherit" }), "independent Docker runtime build");
      imageOwned = true;
    }
    const result = spawnSync("docker", artifactDockerArguments(options, imageTag), { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    receipt = parseContainerArtifactReceipt(result.stdout ?? "", options.sha256);
    receipt.artifact.hostSha256After = createHash("sha256").update(readFileSync(options.artifact)).digest("hex");
    if (receipt.artifact.hostSha256After !== options.sha256) throw new Error("host frozen artifact changed during Docker acceptance");
    success(result, "independent frozen-artifact acceptance");
    if (receipt.outcome !== "COMPLETED") throw new Error("container native-artifact acceptance did not complete");
  } catch (error) {
    primaryError = error;
    receipt.outcome = "FAILED";
    receipt.failure ??= error.message;
  } finally {
    if (imageOwned) {
      try { success(spawnSync("docker", ["image", "rm", imageTag], { stdio: "inherit" }), "owned artifact image cleanup"); }
      catch (error) { cleanupErrors.push(error); }
    }
    receipt.runtimeImage = { name: imageTag, ownership: imageOwned ? "owned" : "borrowed", cleanup: imageOwned ? (cleanupErrors.length ? "FAILED" : "COMPLETED") : "NOT_APPLICABLE" };
    if (cleanupErrors.length) { receipt.outcome = "FAILED"; receipt.cleanupFailures = cleanupErrors.map((error) => error.message); }
    if (options.receipt !== undefined) writeFileSync(options.receipt, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  throwAfterCleanup(primaryError, cleanupErrors, "failed to clean owned final-artifact Docker image");
}

export function freshArtifactEnvironment(home, ambient = process.env) {
  const env = Object.fromEntries(["PATH", "LANG", "LC_ALL", "TZ", "DISPLAY", "XAUTHORITY", "DSMM_ACCEPTANCE_TOOLS_MANIFEST", "DSMM_BROWSER_EXECUTABLE", "DSMM_UI_EVIDENCE_DIR"]
    .flatMap((key) => ambient[key] === undefined ? [] : [[key, ambient[key]]]));
  return { ...env, HOME: home, DSH_HOME: home, XDG_CONFIG_HOME: join(home, "xdg-config"), XDG_DATA_HOME: join(home, "xdg-data"),
    XDG_STATE_HOME: join(home, "xdg-state"), XDG_CACHE_HOME: join(home, "xdg-cache"),
    DSH_TELEMETRY_MODE: "DISABLED", DSH_TELEMETRY_DISABLED: "1", DSH_PERMISSION_MODE: "workspace-write" };
}

export function preservedNativeStorage(control, ownedHome) {
  const observed = control?.persistence;
  if (control?.outcome !== "COMPLETED" || observed?.backendName !== STOCK_PERSISTENCE_ID
    || observed.stockEntry?.id !== STOCK_PERSISTENCE_ID || observed.stockEntry?.name !== STOCK_PERSISTENCE_MODULE
    || observed.stockEntry?.disabled !== false || observed.config?.root !== join(ownedHome, "sessions")
    || observed.config?.compression !== "zstd") {
    throw new Error("native persistence control must capture the exact enabled stock backend and owned sessions root/compression");
  }
  return { root: observed.config.root, compression: observed.config.compression };
}

async function runInnerArtifactSmoke(options) {
  const owned = mkdtempSync(join(tmpdir(), "dsmm-final-artifact-"));
  const receipt = { outcome: "FAILED", acceptanceScope: "native-final-artifact", dshVersion: DSH_VERSION,
    artifact: { sha256: options.sha256 }, installedPackages: [], native: {},
    sourceUnitTests: { outcome: "NOT_RUN", reason: "source tests are distinct evidence, not frozen-artifact acceptance" },
    uiProfiles: { outcome: "NOT_RUN", reason: "requires the separately supplied compiled UI/profile acceptance hook" } };
  let primaryError;
  const cleanupErrors = [];
  try {
    const manifest = JSON.parse(success(spawnSync("tar", ["-xOf", options.artifact, "package/package.json"], { encoding: "utf8" }), "read frozen package manifest"));
    if (manifest.name !== PACKAGE_NAME || !/^\d+\.\d+\.\d+$/u.test(manifest.version)) throw new Error("frozen artifact is not a versioned @dsmm/dsmm package");
    receipt.artifact.package = { name: manifest.name, version: manifest.version };
    const dshRequire = pinnedDshRequire();
    const dshManifest = dshRequire.resolve("@deepseek-ai/dsh/package.json");
    const yaml = dshRequire("js-yaml");
    const installs = [];
    for (const template of ["web", "headless"]) {
      const home = join(owned, `${template}-home`);
      const workspace = join(owned, `${template}-workspace`);
      mkdirSync(home); mkdirSync(workspace);
      const env = freshArtifactEnvironment(home);
      const profile = `dsmm-artifact-${template}`;
      const profilePackage = join(home, "profiles", profile, "package.json");
      const siblingDir = join(home, "profiles", "unrelated-smoke");
      mkdirSync(siblingDir, { recursive: true });
      const sentinels = { globalPatch: join(home, "cordis.patch.yml"), siblingPackage: join(siblingDir, "package.json"), siblingPatch: join(siblingDir, "cordis.patch.yml") };
      writeFileSync(sentinels.globalPatch, "# artifact global sentinel\n[]\n");
      writeFileSync(sentinels.siblingPackage, JSON.stringify({ name: "unrelated-smoke", private: true, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"] } } }));
      writeFileSync(sentinels.siblingPatch, "# artifact sibling sentinel\n[]\n");
      const snapshots = Object.values(sentinels).map((file) => readFileSync(file));
      runDsh(env, ["--profile", profile, "--from-default-profile", template, "--dump-config"], `initialize fresh native ${template}`);
      assertInstalled(profilePackage, false);
      {
        const baselineOutput = join(owned, `${template}-native-only.json`);
        const baselinePatch = join(owned, `${template}-native-only.patch.yml`);
        const baselineRows = [{ insert: [{ id: "dsmm-final-native-audit", name: pathToFileURL(join(root, "scripts", "native-preset-smoke.mjs")).href,
          config: { receipt: baselineOutput, template, dshManifest, workspace, ownedHome: home, nativeOnly: true } }] }];
        if (template === "headless") baselineRows.push({ id: "headless-runner", disabled: true });
        writeFileSync(baselinePatch, yaml.dump(baselineRows));
        const baselineRun = spawnSync("dsh", ["--profile", profile, "--patch", baselinePatch,
          ...(template === "web" ? ["--no-open", "--host", "127.0.0.1", "--port", "0"] : ["deterministic native control"])],
          { cwd: workspace, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
        receipt.nativeBaseline ??= {};
        receipt.nativeBaseline[template] = existsSync(baselineOutput) ? JSON.parse(readFileSync(baselineOutput, "utf8"))
          : { outcome: "FAILED", stage: "native-only-control-startup", failure: baselineRun.error?.code ?? `EXIT_${baselineRun.status}` };
        if (baselineRun.status !== 0) receipt.nativeBaseline[template].outcome = "FAILED";
        assertSentinels(sentinels, snapshots);
      }
      const nativeStorage = preservedNativeStorage(receipt.nativeBaseline[template], home);
      runDsh(env, ["plugin", "--profile", profile, "add", options.artifact], `install frozen artifact in ${template}`);
      assertInstalled(profilePackage, true);
      assertListed(runDsh(env, ["plugin", "--profile", profile, "list"], `list ${template} artifact`), true);
      const profileRequire = createRequire(profilePackage);
      const packageRoot = dirname(profileRequire.resolve(`${PACKAGE_NAME}/package.json`));
      inside(packageRoot, home, "frozen installed package");
      const installed = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
      if (installed.name !== manifest.name || installed.version !== manifest.version) throw new Error(`installed ${template} package identity differs from frozen artifact`);
      for (const entry of [PACKAGE_NAME, `${PACKAGE_NAME}/preset-skills`]) {
        const location = profileRequire.resolve(entry);
        inside(location, packageRoot, "installed public export");
      }
      receipt.installedPackages.push({ template, name: installed.name, version: installed.version, publicExportsResolved: true });
      const output = join(owned, `${template}-native.json`);
      const patch = join(owned, `${template}-audit.patch.yml`);
      const route = { provider: "dsmm-acceptance-fixture", model: "deterministic-native", reasoningEffort: "high" };
      const roleRouting = Object.fromEntries(["dsmm-orchestrator", "dsmm-planner", "dsmm-reviewer"].map((role) => [role, { primary: route, fallbackRoutes: [] }]));
      const rows = [
        // Baseline asserted this exact id/name before the explicit startup
        // patch. The name is an identity assertion, never a backend rename.
        { id: STOCK_PERSISTENCE_ID, name: STOCK_PERSISTENCE_MODULE, disabled: true },
        { id: "dsmm", config: { sessionPersistence: { ...nativeStorage }, defaultActive: true, roles: { "dsmm-builder": false }, roleRouting, runtimeRecovery: { enabled: false } } },
        { id: "agent-default-model", config: route },
        { id: "session-title-llm", disabled: true },
        { insert: [{ id: "dsmm-final-native-audit", name: pathToFileURL(join(root, "scripts", "native-preset-smoke.mjs")).href,
          config: { receipt: output, template, dshManifest, packageRoot, workspace, ownedHome: home, nativeStorage } }] }
      ];
      // Headless intentionally has no selector/Host. Keep its real composition,
      // but let the audit own the bounded native task rather than racing its driver.
      if (template === "headless") rows.push({ id: "headless-runner", disabled: true });
      writeFileSync(patch, yaml.dump(rows));
      const args = ["--profile", profile, "--patch", patch, ...(template === "web" ? ["--no-open", "--host", "127.0.0.1", "--port", "0"] : ["deterministic native acceptance"] )];
      const result = spawnSync("dsh", args, { cwd: workspace, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
      if (existsSync(output)) receipt.native[template] = JSON.parse(readFileSync(output, "utf8"));
      else receipt.native[template] = { outcome: "FAILED", stage: "native-startup", failure: result.error?.code ?? `EXIT_${result.status}`, diagnostic: [result.stderr, result.stdout].filter(Boolean).join("\n").slice(-6000) };
      if (result.status !== 0) receipt.native[template].outcome = "FAILED";
      assertSentinels(sentinels, snapshots);
      installs.push({ env, profile, profilePackage, packageRoot, home, sentinels, snapshots, nativeStorage });
    }
    // Both native Host subprocesses have exited. The operator uses a fresh
    // ordinary SDK graph, never peer installation into either DSH profile.
    const operatorRoot = join(owned, "operator-runtime");
    const operatorHome = join(operatorRoot, "home");
    mkdirSync(operatorHome, { recursive: true });
    const operatorEnv = freshArtifactEnvironment(operatorHome);
    success(spawnSync("npm", ["install", "--prefix", operatorRoot, "--ignore-scripts", "--no-audit", "--no-fund",
      options.artifact, `@deepseek-ai/dsh-session-persistence-jsonl@${DSH_VERSION}`],
    { cwd: operatorRoot, env: operatorEnv, encoding: "utf8", timeout: 300_000, maxBuffer: 8 * 1024 * 1024 }), "install exact artifact and pinned standalone operator SDK");
    const operatorRequire = createRequire(join(operatorRoot, "package.json"));
    const operatorPackageRoot = dirname(operatorRequire.resolve(`${PACKAGE_NAME}/package.json`));
    inside(operatorPackageRoot, operatorRoot, "standalone operator artifact");
    const operatorManifest = JSON.parse(readFileSync(join(operatorPackageRoot, "package.json"), "utf8"));
    if (operatorManifest.name !== manifest.name || operatorManifest.version !== manifest.version) throw new Error("operator installed identity differs from the frozen artifact");
    for (const name of ["@deepseek-ai/dsh-session", "@deepseek-ai/dsh-session-persistence", STOCK_PERSISTENCE_MODULE]) {
      const peerManifestPath = operatorRequire.resolve(`${name}/package.json`);
      inside(peerManifestPath, operatorRoot, "standalone operator native SDK");
      const peer = JSON.parse(readFileSync(peerManifestPath, "utf8"));
      if (peer.name !== name || peer.version !== DSH_VERSION) throw new Error("standalone operator SDK is not the pinned native release");
    }
    const history = await import(pathToFileURL(join(root, "scripts", "session-history-smoke.mjs")).href);
    if (typeof history.runSessionHistorySmoke !== "function") throw new Error("operator harness must export runSessionHistorySmoke(inputs)");
    receipt.sessionHistory = await history.runSessionHistorySmoke({ artifact: options.artifact, sha256: options.sha256, dshManifest,
      expectedPackage: { name: manifest.name, version: manifest.version },
      ownedRoot: owned, operatorRoot, operatorPackageRoot, operatorRequire, nativeRequire: dshRequire, env: operatorEnv });
    if (receipt.sessionHistory?.outcome !== "COMPLETED") throw new Error("packed operator session-history acceptance did not complete");
    receipt.sessionHistory.installedPackage = { name: operatorManifest.name, version: operatorManifest.version };
    receipt.sessionHistory.hostsExitedBeforeOperator = true;
    receipt.sessionHistory.standalonePinnedSdk = true;
    // Native peers are supplied by the Host's runtime loader. The dependency-
    // free shipped LSP module can be inspected outside that loader; the full
    // public plugin import is proved by the actual native Host audit above.
    const installedLsp = await import(pathToFileURL(join(installs[0].packageRoot, "lib", "lsp.js")).href);
    await smokeLspPipeline(dshRequire, installedLsp, { ...installs[0].env, DSMM_LSP_PACKAGE_ROOT: installs[0].packageRoot }, installs[0].home, installs[0].profile);
    receipt.lsp = { outcome: "COMPLETED", directNativeDiagnosticsAndFormat: true, nativeDshMcpClient: true };
    if (options.hook !== undefined) {
      const hook = await import(pathToFileURL(options.hook).href);
      if (typeof hook.runAcceptance !== "function") throw new Error("acceptance hook must export runAcceptance(inputs)");
      receipt.uiProfiles = await hook.runAcceptance({ artifact: options.artifact, sha256: options.sha256, dshManifest, packageRoot: installs[0].packageRoot,
        profilePackage: installs[0].profilePackage, env: installs[0].env, workspace: join(owned, "web-workspace"), ownedRoot: owned,
        nativeStorage: { ...installs[0].nativeStorage } });
      if (receipt.uiProfiles?.outcome !== "COMPLETED") throw new Error("compiled UI/profile acceptance hook did not complete");
    }
    for (const install of installs) {
      runDsh(install.env, ["plugin", "--profile", install.profile, "remove", PACKAGE_NAME], `remove ${install.profile} artifact`);
      assertInstalled(install.profilePackage, false);
      assertListed(runDsh(install.env, ["plugin", "--profile", install.profile, "list"], "list after artifact remove"), false);
      runDsh(install.env, ["plugin", "--profile", install.profile, "add", options.artifact], `reinstall ${install.profile} artifact`);
      assertInstalled(install.profilePackage, true);
      assertSentinels(install.sentinels, install.snapshots);
    }
    receipt.profileLifecycle = { outcome: "COMPLETED", installRemoveReinstall: true, unrelatedSentinelsUnchanged: true };
    if (Object.values(receipt.native).some((item) => item.outcome !== "COMPLETED")) throw new Error("native final-artifact audit failed; see per-profile native evidence");
    receipt.outcome = "COMPLETED";
  } catch (error) {
    primaryError = error;
    receipt.failure = error.message;
  } finally {
    receipt.artifact.sha256After = createHash("sha256").update(readFileSync(options.artifact)).digest("hex");
    if (receipt.artifact.sha256After !== options.sha256) { receipt.outcome = "FAILED"; cleanupErrors.push(new Error("frozen artifact changed during acceptance")); }
    try { rmSync(owned, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
    catch (error) { cleanupErrors.push(error); }
    receipt.temporaryHomesRemoved = !existsSync(owned);
    if (cleanupErrors.length) receipt.outcome = "FAILED";
    console.log(`${ARTIFACT_RECEIPT_PREFIX}${JSON.stringify(receipt)}`);
  }
  throwAfterCleanup(primaryError, cleanupErrors, "failed to clean frozen-artifact acceptance homes");
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
  const dependency = manifest.dependencies?.[PACKAGE_NAME];
  const bundles = manifest.dsh?.profile?.bundles;
  if (!Array.isArray(bundles)) throw new Error("profile bundles must be an array");
  if ((typeof dependency === "string") !== expected || bundles.filter((item) => item === PACKAGE_NAME).length !== Number(expected)) {
    throw new Error(`profile dsmm install state was not ${String(expected)}`);
  }
}

function assertListed(output, expected) {
  const present = output.split(/\s+/u).some((item) => item === PACKAGE_NAME || item.startsWith(`${PACKAGE_NAME}@`));
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
    const tarballs = readdirSync(workspace).filter((name) => name.endsWith(".tgz"));
    const sourceVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
    if (tarballs.length !== 1 || tarballs[0] !== `dsmm-dsmm-${sourceVersion}.tgz`) throw new Error("pnpm pack did not produce exactly one scoped dsmm tarball matching the source manifest");
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

    runDsh(installEnv, ["plugin", "--profile", PROFILE, "remove", PACKAGE_NAME], "remove packed dsmm");
    assertInstalled(profilePackage, false);
    assertListed(runDsh(env, ["plugin", "--profile", PROFILE, "list"], "list after remove"), false);
    assertDump(env, false);
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
  const entry = profileRequire.resolve(PACKAGE_NAME);
  const skillsEntry = profileRequire.resolve(`${PACKAGE_NAME}/preset-skills`);
  const packageRoot = dirname(dirname(entry));
  inside(packageRoot, home, "installed dsmm package");
  if (resolve(packageRoot) === resolve(root) || basename(entry) !== "index.js" || basename(dirname(entry)) !== "lib" || dirname(dirname(skillsEntry)) !== packageRoot) {
    throw new Error("profile did not resolve the packed dsmm entry points");
  }
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const sourceVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  if (manifest.name !== PACKAGE_NAME || manifest.version !== sourceVersion || manifest.dsh?.bundle?.patch !== "./cordis.patch.yml" || !existsSync(join(packageRoot, manifest.dsh.bundle.patch))) {
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
  if (installed && (!dump.includes("defaultActive: false") || !/^\s*name: (?:'@dsmm\/dsmm'|"@dsmm\/dsmm")\s*$/mu.test(dump))) throw new Error("profile did not compose restart-scoped scoped DSMM settings");
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

async function smokeLspPipeline(dshRequire, dsmm, env, home, profile = PROFILE) {
  const direct = spawnSync(process.execPath, [join(root, "scripts", "lsp-mcp-smoke.mjs")], { env: { ...env, DSMM_LSP_COMMAND: "/usr/local/bin/ocmm-lsp" }, stdio: "inherit" });
  success(direct, "ocmm-lsp direct MCP diagnostics and format smoke");
  const lspPatch = join(home, "ocmm-lsp-mcp.cordis.patch.yml");
  writeFileSync(lspPatch, dsmm.renderLspMcpPatch({ enabled: true, command: "/usr/local/bin/ocmm-lsp" }));
  const dump = runDsh(env, ["--profile", profile, "--patch", lspPatch, "--dump-config"], "dsh MCP bridge patch dump");
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
