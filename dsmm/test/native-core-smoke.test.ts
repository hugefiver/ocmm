import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
// @ts-expect-error Owned acceptance harnesses are not published library modules.
import { apply } from "../scripts/native-core-smoke.mjs";

async function auditIdentity(namespace: string, entryId: string) {
  const owned = mkdtempSync(join(tmpdir(), "dsmm-native-core-test-"));
  const receiptPath = join(owned, "receipt.json");
  const overlays = [{ id: "dsmm", name: "@dsmm/dsmm", config: {} }, { id: "other", config: { keep: true } }];
  let settingsLookups = 0;
  try {
    const exit = new Promise<number>((resolve) => {
      const services = new Map<string, unknown>([
        ["appReady", { onReady(callback: () => void) { callback(); } }],
        ["appExit", resolve],
        ["connection", { browserPeer: { ctx: {} }, createPeer() { return { ctx: {}, async dispose() {} }; } }],
        ["webServer", { host: "127.0.0.1" }],
        ["typert", { local: { get() { return { result: { mode: "strict" }, parameters: [] }; } } }],
        ["typertGateway", { async invoke({ method }: { method: string }) {
          if (method === "describeSettings") return { namespace, entryId,
            startup: { modules: { deepwork: { enabled: false } } }, desired: { modules: { deepwork: { enabled: false } } },
            modules: [{ startupMounted: false }] };
          assert.equal(method, "describe"); return { revision: "global-fixture" };
        } }],
        ["loader", { entries() { return [
          { id: "include:agent", options: { id: "agent", name: "@deepseek-ai/dsh-agent" }, disabled: true },
          { id: "include:subagent", options: { id: "subagent", name: "@deepseek-ai/dsh-subagent" }, disabled: true },
          { id: "include:dsmm-registry", options: { id: "dsmm-agent-registry", name: "@dsmm/dsmm/agent-registry" }, fiber: { state: 2 } },
          { id: "include:dsmm-runtime", options: { id: "dsmm-runtime", name: "@dsmm/dsmm/subagent-runtime" }, fiber: { state: 2 } },
          { id: "include:dsmm", options: { id: "dsmm", name: "@dsmm/dsmm" }, fiber: { state: 2 } }
        ]; } }],
        ["agents", { list() { return []; } }],
        ["subagents", {}],
        ["profileContext", { startedBundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@dsmm/dsmm"], overlays }],
        ["dsmmProfileRuntime", { getSettings: { subagentRuntime() { return { binding: "dsmm", deliveryFenceReady: false, restartRequired: false }; } } }],
        ["dsmmRuntimeIntegration", undefined],
        ["settings", { writable: true, describe() {
          settingsLookups++;
          throw Object.assign(new Error("owned Settings boundary fault"), { code: "EACCES" });
        } }],
      ]);
      apply({ get(name: string) { assert.ok(services.has(name)); return services.get(name); } },
        { receipt: receiptPath, packageRoot: fileURLToPath(new URL("../", import.meta.url)) });
    });
    const exitStatus = await exit;
    return { exitStatus, receipt: JSON.parse(readFileSync(receiptPath, "utf8")), settingsLookups, overlays };
  } finally { rmSync(owned, { recursive: true, force: false }); }
}

test("native Core releases its empty DSMM startup config overlay before native Settings lookup", async () => {
  const result = await auditIdentity("dsmm", "include:dsmm");
  assert.equal(result.exitStatus, 1);
  assert.equal(result.settingsLookups, 1);
  assert.equal(Object.hasOwn(result.overlays[0], "config"), false);
  assert.deepEqual(result.overlays[1], { id: "other", config: { keep: true } });
  assert.deepEqual(result.receipt, { outcome: "FAILED", stage: "native-core-loader-and-profile", errorCode: "EACCES", errorName: "Error" });
});

test("native Core rejects a namespace that does not match the live loader local ID", async () => {
  const result = await auditIdentity("include:dsmm", "include:dsmm");
  assert.equal(result.exitStatus, 1);
  assert.equal(result.settingsLookups, 0);
  assert.deepEqual(result.receipt, { outcome: "FAILED", stage: "native-core-loader-namespace", errorCode: "ERR_ASSERTION", errorName: "AssertionError" });
});

test("native Core rejects an entry ID that does not match the live loader qualified ID", async () => {
  const result = await auditIdentity("dsmm", "dsmm");
  assert.equal(result.exitStatus, 1);
  assert.equal(result.settingsLookups, 0);
  assert.deepEqual(result.receipt, { outcome: "FAILED", stage: "native-core-loader-namespace", errorCode: "ERR_ASSERTION", errorName: "AssertionError" });
});
