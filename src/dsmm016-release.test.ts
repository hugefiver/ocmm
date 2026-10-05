import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Standalone acceptance controllers deliberately have no declarations.
import { validateSessionProfileProof } from "../dsmm/scripts/profile-ui-harness-native.mjs";
// @ts-expect-error Release controller is an independently executed JS surface.
import { UI_CHECKS_016, validateDockerReceipt } from "../scripts/dsmm-release.mjs";
// @ts-expect-error Historical synthetic fixture is cloned, never rewritten.
import { successorReceiptFixture } from "./dsmm015-release-fixtures.mjs";

type Json = Record<string, any>;
const version = "0.1.6";
const artifactSha256 = "a".repeat(64);

/** Checker-only fixture, not acceptance or publication evidence. */
function ownedRootReceiptFixture(): Json {
  const receipt = successorReceiptFixture(artifactSha256);
  receipt.artifact.package.version = version;
  for (const installed of receipt.installedPackages) installed.version = version;
  receipt.sessionHistory.packageVersion = version;
  receipt.sessionHistory.installedPackage.version = version;
  Object.assign(receipt.uiProfiles.checks, Object.fromEntries(UI_CHECKS_016.map((check: string) => [check, true])));
  const proof = receipt.uiProfiles.successorProof;
  proof.schemaVersion = 2;
  for (const scenario of proof.routeScenarios) {
    scenario.roleScope = "child";
    scenario.nativeOrigin = "subagent";
    scenario.nativeDescriptor = { mode: "one-shot", provider: `dsmm-role-${scenario.role.slice("dsmm-".length)}` };
  }
  const inherited = { provider: "dsmm-selection-fixture", model: "native-inherited", reasoningEffort: "high" };
  Object.assign(proof.nativeSelection.attempts[0], inherited, { phase: "native-default" });
  Object.assign(proof.nativeSelection.headers[0], inherited, { durableHeader: inherited });
  return receipt;
}

const validate = (proof: Json, trustedVersion = version) => validateSessionProfileProof(proof, { artifactSha256, installedRoot: proof.installedRoot, version: trustedVersion });

test("0.1.6 keeps all route/stream and seven selection checks under trusted schema 2", () => {
  const proof = ownedRootReceiptFixture().uiProfiles.successorProof;
  assert.deepEqual(validate(proof), { schemaVersion: 2, scenarios: 13, independentSessions: 2 });
  assert.throws(() => validate(proof, "0.1.5"), /schema/u);
  const historical = successorReceiptFixture().uiProfiles.successorProof;
  assert.doesNotThrow(() => validate(historical, "0.1.5"));
  historical.packageVersion = version;
  assert.throws(() => validate(historical), /schema/u);
});

test("0.1.6 strategy proof refuses roots or a mismatched public child descriptor", () => {
  for (const mutation of [{ roleScope: "root" }, { nativeOrigin: "root" }, { nativeDescriptor: { mode: "one-shot", provider: "dsmm-role-builder" } }]) {
    const proof = ownedRootReceiptFixture().uiProfiles.successorProof;
    Object.assign(proof.routeScenarios[0], mutation);
    assert.throws(() => validate(proof));
  }
});

test("0.1.6 first actual native request cannot be overwritten by configured profile primary", () => {
  const proof = ownedRootReceiptFixture().uiProfiles.successorProof;
  Object.assign(proof.nativeSelection.attempts[0], proof.nativeSelection.configuredPrimary);
  Object.assign(proof.nativeSelection.headers[0], proof.nativeSelection.configuredPrimary, { durableHeader: proof.nativeSelection.configuredPrimary });
  assert.throws(() => validate(proof), /overridden/u);
});

test("0.1.6 full receipt cannot substitute its 27th boolean for native picker evidence", () => {
  const receipt = ownedRootReceiptFixture();
  assert.throws(() => validateDockerReceipt(receipt, { version, sha256: artifactSha256 }), /picker|frozen/iu);
});
