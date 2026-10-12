import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { digest, removeStableUiRoot, stableMainStartupRow, stableNativeStorage, stableRuntimeStartupRows } from "./stable-native-acceptance.mjs";

export function stableUiStartupPatch({ env, nativeStorage, auditConfig }) {
  return [
    ...stableRuntimeStartupRows(),
    { id: "session-persistence-jsonl", name: "@deepseek-ai/dsh-session-persistence-jsonl", disabled: true },
    stableMainStartupRow({ defaultActive: true, presets: { materialize: false }, runtimeRecovery: { enabled: false },
      sessionPersistence: stableNativeStorage(nativeStorage, env), roles: { "dsmm-builder": false },
      subagents: { enableRunInBackground: true, backgroundMode: "continuable", maxDepth: 3 },
      roleRouting: { "dsmm-reviewer": { primary: { provider: "dsmm-stable021-fixture", model: "reviewer-original", reasoningEffort: "high" } } } }),
    { id: "session-title-llm", disabled: true },
    { insert: [{ id: "dsmm-stable021-browser-audit", name: new URL("./profile-ui-harness-stable021-native.mjs", import.meta.url).href, config: auditConfig }] },
  ];
}

/** Each run uses the Docker runner's freshly installed frozen tarball, never previous receipts. */
export async function runStable021Acceptance({ artifact, sha256, dshManifest, packageRoot, profilePackage, env, workspace, ownedRoot, nativeStorage }) {
  for (const path of [artifact, packageRoot, profilePackage, dshManifest, workspace, ownedRoot]) assert.ok(isAbsolute(path));
  packageRoot = await realpath(packageRoot);
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  assert.equal(manifest.name, "@dsmm/dsmm"); assert.equal(manifest.version, "0.2.1");
  assert.equal(packageRoot, await realpath(dirname(createRequire(profilePackage).resolve("@dsmm/dsmm/package.json"))));
  const offset = relative(await realpath(ownedRoot), packageRoot);
  assert.ok(offset !== "" && !offset.startsWith("..") && !isAbsolute(offset), "installed package must be inside this run's owned root");
  assert.equal(digest(await readFile(artifact)), sha256);
  const clientBefore = digest(await readFile(join(packageRoot, "lib", "client.js")));
  const runRoot = await mkdtemp(join(await realpath(tmpdir()), "dsmm-profile-ui-stable021-")), token = randomUUID();
  await writeFile(join(runRoot, ".dsmm-ui-owner"), token, { flag: "wx" });
  const evidenceRoot = env.DSMM_UI_EVIDENCE_DIR ?? join(ownedRoot, "ui-qa");
  await mkdir(evidenceRoot, { recursive: true });
  assert.ok((await lstat(evidenceRoot)).isDirectory() && !(await lstat(evidenceRoot)).isSymbolicLink());
  const receiptPath = join(runRoot, "browser-receipt.json"), patch = join(runRoot, "browser.patch.yml");
  let report = { outcome: "FAILED", kind: "native-client-stable-first-021", sourceContract: "0.2.1", packageVersion: manifest.version,
    artifactSha256: sha256, installedRoot: packageRoot, cleanup: { errors: [] } };
  let nativeExit;
  try {
    const auditConfig = { artifact, sha256, dshManifest, packageRoot, profilePackage, env, workspace, evidenceRoot, nativeReceipt: receiptPath, nativeStorage };
    await writeFile(patch, createRequire(dshManifest)("js-yaml").dump(stableUiStartupPatch({ env, nativeStorage, auditConfig })), { flag: "wx" });
    const child = spawn("dsh", ["--profile", basename(dirname(profilePackage)), "--patch", patch, "--no-open", "--host", "127.0.0.1", "--port", "0"], { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] });
    // Retain only error lines; native launch URLs and authentication material are excluded.
    const startupErrors = [];
    for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => {
      for (const line of bytes.toString().split(/\r?\n/u)) if (/error|failed|cannot|ERR_/iu.test(line)
        && !/token|credential|password|secret|authorization|https?:\/\//iu.test(line)) {
        if (startupErrors.length < 16) startupErrors.push(line.slice(0, 500));
      }
    });
    const timeout = setTimeout(() => child.kill("SIGTERM"), 180_000);
    let force;
    child.once("spawn", () => {
      force = setTimeout(() => child.kill("SIGKILL"), 190_000);
    });
    try { nativeExit = await new Promise((settle, reject) => { child.once("error", reject); child.once("close", (code, signal) => settle({ code, signal })); }); }
    finally { clearTimeout(timeout); clearTimeout(force); }
    try { report = JSON.parse(await readFile(receiptPath, "utf8")); }
    catch (error) { report.nativeStartupErrors = startupErrors; report.nativeExit = nativeExit; throw error; }
    report.nativeExit = nativeExit;
    assert.equal(nativeExit.code, 0, "native browser Host did not exit successfully"); assert.equal(nativeExit.signal, null);
    assert.equal(report.outcome, "COMPLETED");
  } catch (error) {
    report.outcome = "FAILED"; report.failure ??= error.message;
  } finally {
    report.cleanup ??= { errors: [] };
    report.cleanup.nativeHostExited = nativeExit !== undefined;
    try { await removeStableUiRoot(runRoot, token); report.cleanup.ownedTemporaryRootRemoved = true; }
    catch (error) { report.cleanup.errors.push(error.message); report.outcome = "FAILED"; }
    report.artifactSha256After = digest(await readFile(artifact));
    report.clientSha256After = digest(await readFile(join(packageRoot, "lib", "client.js")));
    if (report.artifactSha256After !== sha256 || report.clientSha256After !== clientBefore) {
      report.outcome = "FAILED"; report.cleanup.errors.push("frozen artifact or installed client bytes changed during native browser acceptance");
    }
    report.receipt = join(evidenceRoot, "native-profile-ui-receipt.json");
    await writeFile(report.receipt, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  }
  return report;
}
