import assert from "node:assert/strict";
import { test } from "node:test";

// Runtime-loaded checkout helper: it is intentionally excluded from the package.
const migration = await import(new URL("../scripts/migrate-opencode-models.mjs", import.meta.url).href);

function sourceFixture() {
  const model = (image = false) => ({
    limit: { context: 123456, output: 4096 },
    ...(image ? { modalities: { input: ["text", "image"] } } : {}),
    options: { thinking: { type: "adaptive" }, effort: "high" },
    variants: { high: { effort: "high" }, max: { effort: "max" }, low: { disabled: true, effort: "low" } }
  });
  return {
    opencode: { provider: {
      hoo: { npm: "@ai-sdk/anthropic", options: { baseURL: "https://fixture.invalid/gateway/v1", apiKey: "{env:FIXTURE_HOO_KEY}" }, models: { "glm-primary": model(), "flash-backup": model(true), "unused-malformed": { options: { thinking: { type: "unsupported" } } } } },
      apai: { npm: "@ai-sdk/openai", options: { baseURL: "https://fixture.invalid/responses/v1", apiKey: "{env:FIXTURE_APAI_KEY}" }, models: { "gpt-fixture": { options: { reasoningEffort: "high" }, variants: { high: { reasoningEffort: "high" }, max: { reasoningEffort: "xhigh" } } } } }
    } },
    ocmm: { agents: {
      orchestrator: { model: "hoo/glm-primary", variant: "high", fallbackModels: [{ model: "flash-backup", providers: ["hoo"], variant: "high" }] },
      reviewer: { model: "hoo/glm-primary", variant: "max", fallbackModels: [{ model: "flash-backup", providers: ["hoo"], variant: "max" }] },
      explore: { model: "hoo/flash-backup", variant: "high", fallbackModels: [] },
      builder: { disabled: true },
      "media-reader": { model: "hoo/doubao-seed-2.1-turbo", fallbackModels: [] }
    } },
    env: { FIXTURE_HOO_KEY: "synthetic-hoo-key", FIXTURE_APAI_KEY: "synthetic-apai-key" }
  };
}

function resolvedCandidate() {
  const source = sourceFixture();
  return migration.buildMigrationCandidate(source.opencode, source.ocmm, { env: source.env, modelEvidence: {
    "hoo/doubao-seed-2.1-turbo": { input: ["text", "image"], imageAccepted: true, contextWindow: 23456, maxTokens: 512 }
  } });
}

test("synthetic migration preserves effective Anthropic path and Responses origin while exact high/max stays distinct", () => {
  const source = sourceFixture();
  const hoo = migration.convertProviderConfig("hoo", source.opencode.provider.hoo, { env: source.env, modelIds: ["glm-primary", "flash-backup"] });
  const apai = migration.convertProviderConfig("apai", source.opencode.provider.apai, { env: source.env });
  assert.equal(hoo.api, "anthropic-messages");
  assert.equal(hoo.baseURL, "https://fixture.invalid/gateway");
  assert.deepEqual(new URL(`${hoo.baseURL}/v1/messages`), new URL(`${source.opencode.provider.hoo.options.baseURL}/messages`));
  assert.deepEqual(hoo.compat, { forceAdaptiveThinking: true });
  assert.deepEqual(hoo.models[0].reasoningEfforts, { high: "high", max: "max" });
  assert.deepEqual(hoo.models[0].input, ["text"], "omitted source modalities do not become invented image support");
  assert.deepEqual(hoo.models[1].input, ["text", "image"]);
  assert.equal(apai.api, "openai-responses");
  assert.equal(apai.baseURL, source.opencode.provider.apai.options.baseURL);
  assert.deepEqual(apai.models[0].reasoningEfforts, { high: "high", max: "xhigh" });
});

test("synthetic source explore maps only canonical code-search and explicit disabled builder remains disabled", () => {
  const source = sourceFixture();
  const converted = migration.convertRoleRouting(source.ocmm);
  assert.deepEqual(converted.roleRouting["dsmm-code-search"], { primary: { provider: "hoo", model: "flash-backup", reasoningEffort: "high" }, fallbackRoutes: [] });
  assert.equal(converted.roles["dsmm-builder"], false);
  assert.equal(Object.hasOwn(converted.roleRouting, "dsmm-explore"), false);
  assert.equal(Object.hasOwn(converted.roleRouting, "dsmm-oracle-2nd"), false, "unconfigured roles gain no fabricated policy");
  assert.deepEqual(converted.roleRouting["dsmm-reviewer"].fallbackRoutes, [{ provider: "hoo", model: "flash-backup", reasoningEffort: "max" }]);
});

test("synthetic migration refuses missing media capability and accepts only exact-ID image evidence", () => {
  const source = sourceFixture();
  const unresolved = migration.buildMigrationCandidate(source.opencode, source.ocmm, { env: source.env, modelEvidence: { "hoo/doubao-seed-2.0-turbo": { input: ["text", "image"], imageAccepted: true } } });
  assert.deepEqual(unresolved.unresolved, [{ role: "dsmm-media-reader", provider: "hoo", model: "doubao-seed-2.1-turbo", reason: "MODEL_CAPABILITY_EVIDENCE_REQUIRED" }]);
  assert.throws(() => migration.mergeMigrationPatch([], unresolved), /MIGRATION_UNRESOLVED/);
  const resolved = resolvedCandidate();
  assert.deepEqual(resolved.unresolved, []);
  assert.deepEqual(resolved.providers.hoo.models.find((entry: { id: string }) => entry.id === "doubao-seed-2.1-turbo"), { id: "doubao-seed-2.1-turbo", input: ["text", "image"], contextWindow: 23456, maxTokens: 512 });
  assert.deepEqual(resolved.omittedModels.hoo, ["unused-malformed"]);
  const summary = JSON.stringify(migration.migrationSummary(resolved));
  for (const privateValue of ["synthetic-hoo-key", "synthetic-apai-key", "fixture.invalid"]) assert.equal(summary.includes(privateValue), false);
});

test("synthetic migration patch merges only task-scoped rows without mutating UI, account and caller inputs", () => {
  const original = [
    { id: "native-account", config: { provider: "deepseek-account", loginPreference: "preserve" } },
    { id: "ui", config: { theme: "original", fontSize: 15 } },
    { id: "dsmm", config: { modeName: "custom-work", guards: { gitWriteGuard: "deny" }, roles: { "dsmm-creative": false }, workflow: { reviewCap: 4 } } },
    { id: "llm-pi-ai", config: { providers: { other: { api: "existing", untouched: true } } } }
  ];
  const before = structuredClone(original);
  const candidate = resolvedCandidate();
  const patch = migration.mergeMigrationPatch(original, candidate);
  assert.deepEqual(original, before);
  assert.deepEqual(patch.slice(0, 2), before.slice(0, 2));
  assert.notEqual(patch[0], original[0]);
  assert.deepEqual(patch[2].config.guards, { gitWriteGuard: "deny" });
  assert.equal(patch[2].config.modeName, "custom-work");
  assert.equal(patch[2].config.roles["dsmm-creative"], false);
  assert.equal(patch[2].config.roles["dsmm-builder"], false);
  assert.deepEqual(patch[2].config.runtimeRecovery, { enabled: true, retryOnCodes: ["RATE_LIMIT", "SERVER", "TIMEOUT", "TRANSPORT"], fallbackRoutes: [], idleContinuation: { enabled: false } });
  for (const excluded of ["AUTH", "QUOTA", "INVALID_REQUEST"]) assert.equal(patch[2].config.runtimeRecovery.retryOnCodes.includes(excluded), false);
  assert.equal(patch[2].config.workflow.reviewCap, 4);
  assert.deepEqual(patch[3].config.providers.other, before[3].config.providers?.other);
  assert.notEqual(patch[3].config.providers.hoo, candidate.providers.hoo);
});

test("synthetic migration errors expose codes only and reject ambiguous or unsupported source routes", () => {
  const source = sourceFixture();
  for (const operation of [
    () => migration.normalizeGatewayBaseURL("hoo", "https://synthetic-hoo-key@fixture.invalid/v1"),
    () => migration.convertProviderConfig("hoo", { ...source.opencode.provider.hoo, npm: "@ai-sdk/openai" }, { env: source.env }),
    () => migration.convertRoleRouting({ agents: { "code-search": { model: "hoo/glm-primary", variant: "max" }, explore: { model: "hoo/flash-backup", variant: "high" } } }),
    () => migration.convertRoleRouting({ agents: { reviewer: { model: "hoo/glm-primary", variant: "high", reasoningEffort: "max" } } })
  ]) assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /^[A-Z_]+$/);
    assert.equal(error.message.includes("synthetic-hoo-key"), false);
    assert.equal(error.message.includes("fixture.invalid"), false);
    return true;
  });
});

test("credential-reference migration preflights all synthetic refs before writes and never overwrites a differing value", async () => {
  const values = new Map([["DSMM_APAI_API_KEY", "different-existing-value"]]);
  const writes: string[] = [];
  const credentials = {
    async describe(ref: string) { return { configured: values.has(ref), writable: true }; },
    async resolve(ref: string) { return values.has(ref) ? { value: values.get(ref) } : undefined; },
    async set(ref: string, value: string) { writes.push(ref); values.set(ref, value); }
  };
  const secrets = { DSMM_HOO_API_KEY: "synthetic-hoo-key", DSMM_APAI_API_KEY: "synthetic-apai-key" };
  await assert.rejects(migration.applyCredentialRefs(credentials, (name: string) => name, secrets), /EXISTING_CREDENTIAL_DIFFERS/);
  assert.deepEqual(writes, []);
  values.set("DSMM_APAI_API_KEY", secrets.DSMM_APAI_API_KEY);
  assert.deepEqual(await migration.applyCredentialRefs(credentials, (name: string) => name, secrets), { created: ["DSMM_HOO_API_KEY"], reused: ["DSMM_APAI_API_KEY"] });
  assert.deepEqual(writes, ["DSMM_HOO_API_KEY"]);
});
