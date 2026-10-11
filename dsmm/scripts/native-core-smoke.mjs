import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CORE_CHECKS_020, validateCoreProof } from "./release-contract.mjs";

export const name = "dsmm-native-core-020-acceptance";
export const inject = ["appReady", "appExit", "agents", "loader", "typertGateway", "connection", "settings"];
export function apply(ctx, config) {
  let started = false;
  let stage = "native-core-ready";
  ctx.get("appReady").onReady(() => {
    if (started) return;
    started = true;
    void audit().then((receipt) => {
      writeFileSync(config.receipt, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
      ctx.get("appExit")(0);
    }).catch((error) => {
      const errorCode = ["ERR_ASSERTION", "ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND", "ENOENT", "EACCES", "EPERM", "EEXIST", "ETIMEDOUT"].includes(error?.code) ? error.code : "UNCLASSIFIED_ERROR";
      const errorName = ["AssertionError", "TypeError", "RangeError", "SyntaxError", "Error"].includes(error?.name) ? error.name : "UnknownError";
      writeFileSync(config.receipt, `${JSON.stringify({ outcome: "FAILED", stage, errorCode, errorName })}\n`, { flag: "wx" });
      ctx.get("appExit")(1);
    });
  });
  async function audit() {
    stage = "native-core-services";
    const gateway = ctx.get("typertGateway"), peer = ctx.get("connection").operator;
    assert.ok(peer?.ctx); assert.equal(ctx.get("webServer").host, "127.0.0.1"); assert.equal(ctx.get("settings").writable, true);
    const invoke = (method, args = {}, invokingPeer = peer) => gateway.invoke({ namespace: "dsmmConfig", method, args, peer: invokingPeer, signal: new AbortController().signal });
    for (const method of ["describe", "describeSettings", "describeModules", "save"]) {
      stage = `native-core-codec-${method}`;
      const descriptor = ctx.get("typert").local.get(`dsmmConfig/${method}`);
      assert.equal(descriptor?.result.mode, "strict"); assert.ok(descriptor.parameters.every(({ codec }) => codec.mode === "strict"));
    }
    stage = "native-core-package-identity";
    const manifest = JSON.parse(readFileSync(join(config.packageRoot, "package.json"), "utf8"));
    assert.equal(manifest.name, "@dsmm/dsmm"); assert.equal(manifest.version, "0.2.0");
    stage = "native-core-describe-startup";
    const before = await invoke("describeSettings"), global = await invoke("describe");
    assert.equal(before.startup.modules.deepwork.enabled, false); assert.equal(before.desired.modules.deepwork.enabled, false);
    assert.equal(before.modules[0].startupMounted, false);
    stage = "native-core-loader-and-profile";
    const entry = [...ctx.get("loader").entries()].find(({ options }) => options.name === "@dsmm/dsmm");
    assert.ok(entry?.fiber); const fiber = entry.fiber;
    stage = "native-core-loader-namespace";
    assert.equal(before.namespace, entry.options.id);
    assert.equal(before.entryId, entry.id);
    stage = "native-core-loader-and-profile";
    const form = ctx.get("settings").describe().find(({ ns }) => ns === before.namespace);
    assert.ok(form && Number.isSafeInteger(form.revision));
    assert.equal(ctx.get("agents").list().length, 0);
    assert.equal((await ctx.get("agentPresets").list()).some(({ id }) => id.startsWith("dsmm-")), false);
    const patchPath = ctx.get("settings").documentPath, patchBefore = readFileSync(patchPath);
    stage = "native-core-foreign-peer";
    await assert.rejects(() => invoke("describe", {}, { id: "foreign-acceptance-peer" }));
    stage = "native-core-global-save";
    const saved = await invoke("save", { request: { expectedRevision: global.revision, edits: [{ op: "set", path: ["modules", "deepwork", "enabled"], value: true }] } });
    assert.equal(saved.config.modules.deepwork.enabled, true);
    assert.deepEqual(readFileSync(patchPath), patchBefore);
    stage = "native-core-restart-ceiling";
    const desired = await invoke("describeSettings");
    assert.equal(desired.modules[0].nextRoot.reason, "restart-required"); assert.equal(desired.modules[0].nextRoot.admitted, false);
    assert.equal(desired.modules[0].startupMounted, false); assert.equal(desired.modules[0].pending, true);
    const globalBytes = readFileSync(join(config.home, "plugins", "dsmm", "config.json"));
    stage = "native-core-profile-mutate";
    await ctx.get("settings").mutate(form.ns, [{ op: "set", path: ["defaultActive"], value: true }], form.revision);
    assert.deepEqual(readFileSync(join(config.home, "plugins", "dsmm", "config.json")), globalBytes);
    assert.notDeepEqual(readFileSync(patchPath), patchBefore);
    assert.equal(entry.fiber, fiber); assert.equal(ctx.get("agents").list().length, 0);
    stage = "native-core-agent-create";
    const nativeRequire = createRequire(config.dshManifest);
    const { SessionId } = await import(pathToFileURL(nativeRequire.resolve("@deepseek-ai/dsh-session")).href);
    const handle = await ctx.get("agents").create({ sessionId: SessionId("dsmm-core-cold-off-020"), meta: { cwd: config.workspace } });
    try {
      stage = "native-core-agent-ceiling";
      const runtime = ctx.get("dsmmProfileRuntime");
      assert.equal(runtime.getSettings(handle.agent).modules.deepwork.enabled, false);
      assert.equal(runtime.getSettings(handle.agent).defaultActive, true);
      assert.equal(ctx.get("tools").schemas(handle.agent).some(({ name }) => name.startsWith("dsmm_")), false);
      await assert.rejects(() => ctx.get("agentPresets").select(handle.agent, "dsmm-orchestrator"));
    } finally {
      try { await handle.dispose(); }
      catch (error) { stage = "native-core-agent-dispose"; throw error; }
    }
    stage = "native-core-proof";
    const proof = { outcome: "COMPLETED", artifactSha256: config.sha256, packageVersion: manifest.version,
      installedPackage: manifest.name, postAppReady: true, externalModelCalls: false, productionAuthenticationModified: false,
      clientSha256: createHash("sha256").update(readFileSync(join(config.packageRoot, "lib", "client.js"))).digest("hex"),
      checks: Object.fromEntries(CORE_CHECKS_020.map((key) => [key, true])) };
    return validateCoreProof(proof, { sha256: config.sha256, version: manifest.version });
  }
}
