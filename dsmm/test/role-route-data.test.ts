import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { modelRouteFromCall, modelRouteFromHeader, modelRouteToCall, projectModelRouteParameters, withRouteEffort } from "../src/role-llm.ts";
import { applyModelRoute, orderedModelRoutes, rolePolicyIdentity } from "../src/role-routing.ts";
import { resolveConfig, resolveDeployment, validateSparseConfig, validateDeploymentPath, DSMM_NATIVE_CONFIG_SCHEMA } from "../src/settings.ts";
import { resolveProfileSettings, parseProfileDocument } from "../src/profiles.ts";
import { configuredModelParameterPolicy } from "../src/model-parameter-policy.ts";
import type { ModelRouteJson } from "../src/route-json.ts";

const primary: ModelRouteJson = { provider: "apai", model: "gpt-6.1-sol", reasoningEffort: "medium", temperature: 0, stop: [],
  customParameters: { flag: false, zero: 0, missing: null, items: [[], {}, { value: null }] }, primary_only: false };

test("Core parameter policy defaults on and follows sparse deployment and named overlays independently of Deepwork", () => {
  const global = { modules: { deepwork: { enabled: false } }, modelParameters: { passthrough: false } };
  assert.equal(configuredModelParameterPolicy(resolveConfig({ modules: global.modules })).mode, "passthrough");
  const baseline = resolveDeployment(global, {});
  assert.equal(configuredModelParameterPolicy(baseline).mode, "native-defaults");
  assert.equal(resolveDeployment(global, { modelParameters: { passthrough: true } }).modelParameters.passthrough, true);
  const named = parseProfileDocument(JSON.stringify({ version: 1, id: "parameters", settings: { modelParameters: { passthrough: true } } }));
  const effective = resolveProfileSettings(baseline, named.settings);
  assert.equal(effective.modules.deepwork.enabled, false);
  assert.equal(effective.modelParameters.passthrough, true);
  assert.equal(baseline.modelParameters.passthrough, false);
  validateDeploymentPath(["modelParameters", "passthrough"]);
  const native = DSMM_NATIVE_CONFIG_SCHEMA({ modelParameters: { passthrough: false } }).modelParameters as unknown as { get(): unknown };
  assert.deepEqual(native.get(), { passthrough: false });
  for (const modelParameters of [null, false, { passthrough: null }, { passthrough: "false" }, { enabled: true }]) {
    assert.throws(() => validateSparseConfig({ modelParameters }));
    assert.throws(() => parseProfileDocument(JSON.stringify({ version: 1, id: "invalid", settings: { modelParameters } })));
  }
});

test("parameter projection defaults to lossless passthrough and never changes requested JSON", () => {
  const saved = structuredClone(primary);
  const call = projectModelRouteParameters(primary, "dsmm-config");
  assert.deepEqual(modelRouteFromCall(call), primary);
  assert.notEqual(call.customParameters?.customParameters, primary.customParameters);
  assert.deepEqual(primary, saved);
});

test("off projection excludes opaque fields and both configured effort aliases but keeps native SDK parameters", () => {
  const { reasoningEffort: _effort, ...base } = primary;
  for (const effort of [{ reasoningEffort: "medium" }, { reasoning_effort: "medium" }]) {
    const requested = { ...base, ...effort, maxTokens: 128, stop: ["END"] };
    const saved = structuredClone(requested);
    const call = projectModelRouteParameters(requested, "dsmm-config", false);
    assert.deepEqual(call, { provider: primary.provider, model: primary.model, temperature: 0, maxTokens: 128, stop: ["END"] });
    assert.notEqual(call.stop, requested.stop);
    assert.deepEqual(requested, saved);
  }
  assert.deepEqual(projectModelRouteParameters({ provider: primary.provider, model: primary.model, max_tokens: 128 }, "dsmm-config", false),
    { provider: primary.provider, model: primary.model });
});

test("off projection preserves independently native effort and leaves omitted effort for the adapter", () => {
  const native = { provider: "native-provider", model: "native-model", reasoningEffort: "low", maxTokens: 64 };
  assert.deepEqual(projectModelRouteParameters(native, "native", false), native);
  const omitted = { provider: native.provider, model: native.model };
  assert.deepEqual(projectModelRouteParameters(omitted, "native", false), omitted);
  assert.throws(() => projectModelRouteParameters({ ...primary, reasoning_effort: "high" }, "dsmm-config", false));
  assert.throws(() => projectModelRouteParameters({ ...primary, headers: {} }, "dsmm-config", false));
});

test("native call envelopes round-trip original route names and detached JSON presence", () => {
  const call = modelRouteToCall(primary);
  assert.deepEqual(modelRouteFromCall(call), primary);
  assert.deepEqual(call.customParameters?.customParameters, primary.customParameters);
  assert.notEqual(call.customParameters?.customParameters, primary.customParameters);
  assert.deepEqual(call.customParameters?.stop, []);
  for (const value of [false, 0, null, [], {}]) {
    const route = { provider: primary.provider, model: primary.model, customParameters: value };
    assert.deepEqual(modelRouteFromCall(modelRouteToCall(route)), route);
  }
});

test("fallback replacement retains only its own full parameters without mutating the primary", () => {
  const call = modelRouteToCall(primary);
  const original = structuredClone(call);
  const fallback = { provider: "apai", model: "gpt-5.6-terra", reasoningEffort: "high", fallback_only: null };
  assert.deepEqual(modelRouteFromCall(applyModelRoute(call, fallback)), fallback);
  assert.deepEqual(call, original);
  const reordered = { primary_only: false, customParameters: primary.customParameters, stop: [], temperature: 0,
    reasoningEffort: "medium", model: primary.model, provider: primary.provider };
  assert.deepEqual(orderedModelRoutes([primary, reordered, { ...primary, primary_only: true }]), [primary, { ...primary, primary_only: true }]);
});

test("effort-only overrides replace either effort spelling without rewriting captured input", () => {
  for (const original of [primary, { provider: primary.provider, model: primary.model, reasoning_effort: "medium", data: [false, null] }]) {
    const snapshot = structuredClone(original);
    const next = withRouteEffort(original, "provider-specific");
    assert.equal(next.reasoningEffort, "provider-specific");
    assert.equal(Object.hasOwn(next, "reasoning_effort"), false);
    assert.deepEqual(modelRouteFromCall(modelRouteToCall(next)), next);
    assert.deepEqual(original, snapshot);
  }
});

test("header route extraction excludes only declared adapter defaults and rejects envelope collisions", () => {
  const config = { ...modelRouteToCall(primary), maxTokens: 128 };
  const extracted = modelRouteFromHeader({ config, adapterDefaults: { maxTokens: true, reasoningEffort: true } });
  const { reasoningEffort: _effort, ...explicit } = primary;
  assert.deepEqual(extracted, explicit);
  assert.deepEqual(modelRouteFromHeader({ config, adapterDefaults: { maxTokens: false, reasoningEffort: false } }), { ...primary, maxTokens: 128 });
  assert.throws(() => modelRouteFromCall({ provider: primary.provider, model: primary.model, customParameters: { provider: "foreign" } }));
  assert.throws(() => modelRouteToCall({ ...primary, reasoning_effort: "high" }));
});

test("three-field persisted policy identity retains its legacy endpoint-deduplicated encoding", () => {
  const route = { provider: "apai", model: "gpt-6.1-sol", reasoningEffort: "medium" };
  const fallback = { provider: "apai", model: "gpt-5.6-terra", reasoningEffort: "high" };
  const rateLimit = { maxRetries: 2, initialDelayMs: 0, maxDelayMs: 10, maxTotalDelayMs: 20, switchAfterRateLimits: 1, maxSwitches: 1 };
  const settings = resolveConfig({ roleRouting: { "dsmm-reviewer": { primary: route,
    fallbackRoutes: [{ ...route, reasoningEffort: "high" }, fallback, { ...fallback, reasoningEffort: "max" }], strategy: "rate-limit-fallback", rateLimit } } });
  const encoded = JSON.stringify({ version: 2, role: "dsmm-reviewer", epoch: "original-admission", primary: route,
    fallbackSource: "role", fallbackRoutes: [fallback], strategy: "rate-limit-fallback", rateLimit });
  assert.equal(rolePolicyIdentity(settings, "dsmm-reviewer", "original-admission"), createHash("sha256").update(encoded).digest("hex"));
});

test("extended policy identity is key-order independent and binds parameter-only changes", () => {
  const identity = (parameters: { a: null; b: boolean }) => rolePolicyIdentity(resolveConfig({ roleRouting: {
    "dsmm-reviewer": { primary: { ...primary, parameters }, fallbackRoutes: [] },
  } }), "dsmm-reviewer", "original-admission");
  assert.equal(identity({ a: null, b: false }), identity({ b: false, a: null }));
  assert.notEqual(identity({ a: null, b: false }), identity({ a: null, b: true }));
});
