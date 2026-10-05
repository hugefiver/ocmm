import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { nativeRoutingFixture } from "./native-routing-fixture.ts";
// @ts-expect-error Test-only native acceptance harness, deliberately not published.
import { runNativeRouteScenarios, NATIVE_SCENARIOS_015 } from "../scripts/profile-ui-harness-native.mjs";

test("successor acceptance observes actual package-compiled native loop routes and correlated durable streams", async () => {
  const fixture = await nativeRoutingFixture({ defaultActive: true });
  try {
    const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
    const scenarios = await runNativeRouteScenarios(fixture.ctx, { nativeRequire: createRequire(`${packageRoot}/package.json`), packageRoot, workspace: fixture.profileDir });
    assert.deepEqual(scenarios.map(({ name }: { name: string }) => name), NATIVE_SCENARIOS_015);
    const byName = new Map<string, any>(scenarios.map((scenario: any) => [scenario.name, scenario]));
    const models = (name: string) => byName.get(name).attempts.map(({ model }: { model: string }) => model);
    assert.deepEqual(models("startup-primary-lock"), ["primary-lock", "primary-lock"]);
    assert.deepEqual(models("startup-first-available"), ["available-fallback", "available-fallback"]);
    assert.deepEqual(models("startup-rate-limit"), ["same-rate", "same-rate", "same-rate"]);
    assert.deepEqual(models("rate-limit-rollover"), ["threshold-primary", "threshold-primary", "threshold-first", "threshold-first", "threshold-second"]);
    assert.deepEqual(models("unavailable-first"), ["unavailable-primary", "unavailable-fallback"]);
    assert.deepEqual(models("unavailable-partial"), ["unavailable-partial"]);
    assert.deepEqual(models("unavailable-later"), ["unavailable-later", "unavailable-later"]);
    for (const scenario of scenarios) {
      assert.equal(scenario.downstreamAlwaysCalls, 0, scenario.name);
      assert.deepEqual(scenario.toolExecutions, [], scenario.name);
      assert.ok(scenario.attempts.length > 0, scenario.name);
      for (const attempt of scenario.attempts) {
        assert.equal(attempt.attemptId, attempt.durableAttemptId, scenario.name);
        assert.equal(attempt.liveStreamSha256, attempt.durableStreamSha256, scenario.name);
        assert.ok(Number.isInteger(attempt.settlementSeq), scenario.name);
      }
    }
    for (const strategy of ["startup-lock", "rate-limit-fallback"]) for (const kind of ["text", "tool"]) {
      const scenario = byName.get(`${strategy}-partial-${kind}`);
      assert.equal(scenario.attempts.length, 1);
      assert.equal(scenario.attempts[0].result, "RATE_LIMIT");
      assert.equal(scenario.terminal, "error");
      assert.ok(scenario.attempts[0].outputKinds.includes(kind === "text" ? "text-delta" : "tool-call-delta"));
    }
  } finally { await fixture.dispose(); }
});
