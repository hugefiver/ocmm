import { spawn, spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  runtime: { type: "string" }, package: { type: "string" }, credentials: { type: "string" },
  provider: { type: "string", default: "deepseek-official" }, receipt: { type: "string" },
  timeout: { type: "string", default: "240000" }, effort: { type: "string", default: "high" }, delegate: { type: "boolean", default: false }, "probe-only": { type: "boolean", default: false }
} });
const expectedVersion = "0.2.0-rc.2";
const provider = values.provider;
if (!["deepseek-official", "deepseek-account"].includes(provider)) throw new Error("Only the two native DeepSeek routes are accepted");
if (!["off", "low", "high"].includes(values.effort)) throw new Error("effort must be off, low, or high");
if (!values.runtime || !values.package) throw new Error("Usage: node live-dsh-smoke.mjs --runtime <installed-prefix> --package <packed-dsmm.tgz> [--provider deepseek-account --credentials <existing-file>] [--receipt <file>]");
const runtime = resolve(values.runtime);
const requireRuntime = createRequire(join(runtime, "package.json"));
const dshManifest = requireRuntime.resolve("@deepseek-ai/dsh/package.json");
if (JSON.parse(readFileSync(dshManifest, "utf8")).version !== expectedVersion) throw new Error("The live smoke requires the pinned latest DSH version");
const cli = join(dirname(dshManifest), "lib", "bin.js");
const artifact = resolve(values.package);
const timeout = Number(values.timeout);
if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 600000) throw new Error("timeout must be 1000..600000 milliseconds");
const owned = mkdtempSync(join(tmpdir(), "dsmm-flash-live-"));
const home = join(owned, "home");
const workspace = join(owned, "workspace");
mkdirSync(home);
mkdirSync(workspace);
const profile = "dsmm-flash-live";
const evidencePath = join(owned, "probe.json");
const probe = fileURLToPath(new URL("./live-dsh-probe.mjs", import.meta.url));
const env = { ...process.env, DSH_HOME: home, DSH_TELEMETRY_MODE: "DISABLED", DSH_TELEMETRY_DISABLED: "1", DSH_PERMISSION_MODE: "workspace-write" };
let credentialHash;
let report = { outcome: "FAILED", dshVersion: expectedVersion, provider, model: "deepseek-flash", catalogName: "DeepSeek-V41-Flash", packedSha256: createHash("sha256").update(readFileSync(artifact)).digest("hex") };

async function run(args, stage, acceptNonzero = false) {
  return await new Promise((fulfill, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
    const chunks = [];
    let timedOut = false;
    let bytes = 0;
    let stopped = false;
    const stop = () => {
      if (stopped || child.pid === undefined) return;
      stopped = true;
      if (process.platform === "win32") spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes <= 16 * 1024 * 1024) chunks.push(chunk);
      else stop();
    });
    // DSH streams private reasoning to stderr. Drain it without recording it.
    child.stderr.on("data", () => {});
    child.once("error", (error) => { clearTimeout(timer); reject(new Error(`${stage}: ${error.code ?? "SPAWN_FAILED"}`)); });
    child.once("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf8");
      if (timedOut || (code !== 0 && !acceptNonzero)) reject(new Error(`${stage}: ${timedOut ? "TIMEOUT" : `EXIT_${code}`}`));
      else fulfill(output);
    });
  });
}

try {
  if (!values["probe-only"] && values.credentials) {
    if (provider !== "deepseek-account") throw new Error("A stored credential file is only used for the account route");
    const original = readFileSync(resolve(values.credentials));
    credentialHash = createHash("sha256").update(original).digest("hex");
    const yaml = requireRuntime("yaml");
    let source;
    try { source = yaml.parse(original.toString("utf8")); }
    catch { throw new Error("The stored credential document could not be parsed"); }
    const records = Object.fromEntries(["deepseek-account-platform/default", "deepseek-account-platform/device"]
      .filter((key) => source.records?.[key] !== undefined).map((key) => [key, source.records[key]]));
    if (records["deepseek-account-platform/default"] === undefined) throw new Error("No native DeepSeek account grant was found");
    writeFileSync(join(home, ".credentials.yaml"), yaml.stringify({ version: 1, refs: {}, records }), { mode: 0o600 });
  } else if (!values["probe-only"] && (provider === "deepseek-account" || !env.DEEPSEEK_API_KEY)) throw new Error("The selected real provider requires credentials; no other model is substituted");

  await run(["--profile", profile, "--from-default-profile", "headless", "--dump-config"], "initialize");
  await run(["plugin", "--profile", profile, "add", artifact], "install-packed-dsmm");
  const profileRequire = createRequire(join(home, "profiles", profile, "package.json"));
  const installedManifest = JSON.parse(readFileSync(profileRequire.resolve("@dsmm/dsmm/package.json"), "utf8"));
  if (installedManifest.name !== "@dsmm/dsmm" || installedManifest.version !== "0.1.1") throw new Error("Installed scoped package identity mismatch");
  profileRequire.resolve("@dsmm/dsmm/preset-skills");
  report.package = { name: installedManifest.name, version: installedManifest.version };
  const patch = join(owned, "live.patch.yml");
  const yaml = requireRuntime("js-yaml");
  writeFileSync(patch, yaml.dump([
    { id: "dsmm", config: { defaultActive: true, workflow: { policy: "risk-based" }, deepseekFlashDefaultReasoningEffort: values.effort, runtimeRecovery: { enabled: false } } },
    { id: "agent-default-model", config: { provider, model: "deepseek-flash" } },
    { id: provider === "deepseek-account" ? "llm-deepseek-account" : "llm-deepseek", config: { maxTokens: 4096, retryPolicy: { mode: "normal", maxRetries: 0 } } },
    { insert: [{ id: "dsmm-live-probe", name: pathToFileURL(probe).href, config: { receipt: evidencePath, probeOnly: values["probe-only"] } }] }
  ]));
  const common = ["--profile", profile, "--patch", patch];
  const dump = await run([...common, "--dump-config"], "dump-config");
  if (!dump.includes("id: dsmm") || !dump.includes("defaultActive: true")) throw new Error("The packed DSMM bundle was not composed");
  const nonce = randomUUID();
  writeFileSync(join(workspace, "input.json"), JSON.stringify({ nonce, left: 19, right: 23 }));
  const prompt = values.delegate
    ? "This is an explicitly authorized, small bounded role integration smoke. First use your read tool to read input.json. Then call dsmm_reviewer exactly once and ask that read-only child to use read to inspect input.json and report its nonce and sum of left and right; do not ask it to write files or spawn more agents. After the child's real response, use your write tool to create result.json containing only JSON with the original nonce and computed sum. Finally reply DSMM_FLASH_OK. Use only read, dsmm_reviewer, and write. Do not use shell, network, goal or other delegation tools and do not modify other files. The active native model must remain DeepSeek Flash for both parent and child. No additional approval or design document is required."
    : "This is an explicitly authorized, small bounded integration smoke. Use the read tool to read input.json in the current directory, add its left and right numbers, and use the write tool to create result.json containing only JSON with its original nonce and the computed sum. Finally reply DSMM_FLASH_OK. Do not use shell, network, goal, or delegation tools. Do not modify other files. No additional approval, design document, or review is needed for this bounded task.";
  const output = await run([...common, "--json", prompt], "real-model-tool-roundtrip", values["probe-only"]);
  const events = output.split(/\r?\n/u).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  const final = events.findLast((event) => event.type === "final");
  const resultPath = join(workspace, "result.json");
  const result = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, "utf8")) : undefined;
  const probeReceipt = JSON.parse(readFileSync(evidencePath, "utf8"));
  if (values["probe-only"]) {
    const checks = {
      stoppedBeforeModel: probeReceipt.probeStoppedBeforeModel === true,
      dsmmPrompt: probeReceipt.assemblies.some((assembly) => assembly.dsmm),
      roleSchema: probeReceipt.assemblies.some((assembly) => assembly.roleTools.includes("dsmm_reviewer")),
      noToolExecution: probeReceipt.tools.length === 0
    };
    report = { ...report, kind: "schema-only-no-model-call", checks, roleTools: probeReceipt.assemblies[0]?.roleTools, outcome: Object.values(checks).every(Boolean) ? "COMPLETED" : "FAILED" };
  } else {
  const checks = {
    answer: final?.text?.includes("DSMM_FLASH_OK") === true,
    fixture: result?.nonce === nonce && result?.sum === 42,
    dsmmPrompt: probeReceipt.assemblies.some((assembly) => assembly.dsmm),
    flashCalibration: probeReceipt.assemblies.some((assembly) => assembly.flash),
    exactRoute: probeReceipt.requests.length > 0 && probeReceipt.requests.every((request) => request.provider === provider && request.model === "deepseek-flash"),
    reasoning: probeReceipt.headers.length > 0 && probeReceipt.headers.every((header) => header.effort === values.effort) && probeReceipt.requests.every((request) => request.advertisedEfforts?.includes(values.effort)),
    read: probeReceipt.tools.some((tool) => tool.name === "read" && !tool.error),
    write: probeReceipt.tools.some((tool) => tool.name === "write" && !tool.error),
    toolReply: probeReceipt.requests.length >= 2,
    errors: probeReceipt.errors.length === 0
  };
  const usage = events.filter((event) => event.type === "status" && event.phase === "step_end" && event.usage).reduce((sum, event) => ({ inputTokens: sum.inputTokens + event.usage.inputTokens, outputTokens: sum.outputTokens + event.usage.outputTokens }), { inputTokens: 0, outputTokens: 0 });
  checks.usage = usage.inputTokens > 0 && usage.outputTokens > 0;
  const agents = new Set(probeReceipt.requests.map((request) => request.agent));
  if (values.delegate) {
    const rootAgent = probeReceipt.requests[0]?.agent;
    const children = probeReceipt.assemblies.filter((assembly) => assembly.agent && assembly.agent !== rootAgent);
    checks.delegate = agents.size >= 2 && probeReceipt.tools.some((tool) => tool.name === "dsmm_reviewer" && !tool.error);
    checks.readonlyChild = children.length > 0 && children.every((assembly) => assembly.tools.includes("read") && assembly.tools.every((tool) => ["read", "glob", "grep"].includes(tool)));
    checks.childPersona = children.some((assembly) => assembly.reviewer);
    report.childTools = [...new Set(children.flatMap((assembly) => assembly.tools))].sort();
  }
  report = { ...report, checks, agentCount: agents.size, profile: probeReceipt.profile, roleTools: probeReceipt.assemblies[0]?.roleTools, usage, headers: probeReceipt.headers.map(({ agent, ...header }) => header), requests: probeReceipt.requests.map(({ agent, ...request }) => request), tools: probeReceipt.tools, outcome: Object.values(checks).every(Boolean) ? "COMPLETED" : "FAILED" };
  }
} catch (error) {
  report = { ...report, failure: error.message };
  if (existsSync(evidencePath)) {
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    report.requests = evidence.requests.map(({ agent, ...request }) => request);
    report.errors = evidence.errors;
  }
} finally {
  if (credentialHash !== undefined) report.originalCredentialsUnchanged = createHash("sha256").update(readFileSync(resolve(values.credentials))).digest("hex") === credentialHash;
  // owned is minted by mkdtemp, never supplied by the caller.
  rmSync(owned, { recursive: true, force: true });
  report.temporaryHomeRemoved = !existsSync(owned);
}
if (values.receipt) writeFileSync(resolve(values.receipt), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report)}\n`);
if (report.outcome !== "COMPLETED" || report.originalCredentialsUnchanged === false) process.exitCode = 1;
