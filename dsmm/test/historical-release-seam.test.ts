import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error Historical Root authority is exercised read-only through its public controller functions.
import * as historical from "../../scripts/dsmm-release.mjs";
// @ts-expect-error Historical synthetic fixture is never publication evidence.
import { successorReceiptFixture } from "../../src/dsmm015-release-fixtures.mjs";
// @ts-expect-error Shared source-only native validator.
import { validateSessionProfileProof } from "../scripts/profile-ui-harness-native.mjs";
// @ts-expect-error Shared source-only picker selectors.
import { nativePickerContract, frozenPickerArtifactOptions } from "../scripts/native-picker-harness.mjs";
// @ts-expect-error Shared source-only picker validator.
import { validateNativePickerProof } from "../scripts/native-picker-proof.mjs";

test("Root historical controller retains its original 015/016 routing proof through current shared helper imports", () => {
  const sha256 = "a".repeat(64), receipt = successorReceiptFixture(sha256);
  assert.equal(historical.validateDockerReceipt(receipt, { sha256, version: "0.1.5" }).uiCheckCount, 26);
  assert.deepEqual(historical.uiChecksForVersion("0.2.0"), [...historical.UI_CHECKS, ...historical.UI_CHECKS_015, ...historical.UI_CHECKS_016]);
  const proof = structuredClone(receipt.uiProfiles.successorProof);
  proof.schemaVersion = 2;
  for (const scenario of proof.routeScenarios) Object.assign(scenario, { roleScope: "child", nativeOrigin: "subagent", nativeDescriptor: { mode: "one-shot", provider: `dsmm-role-${scenario.role.slice(5)}` } });
  const inherited = { provider: "dsmm-selection-fixture", model: "native-inherited", reasoningEffort: "high" };
  Object.assign(proof.nativeSelection.attempts[0], inherited, { phase: "native-default" });
  Object.assign(proof.nativeSelection.headers[0], inherited, { durableHeader: inherited });
  assert.deepEqual(validateSessionProfileProof(proof, { artifactSha256: sha256, installedRoot: proof.installedRoot, version: "0.1.6" }), { schemaVersion: 2, scenarios: 13, independentSessions: 2 });
  assert.throws(() => validateSessionProfileProof(proof, { artifactSha256: sha256, installedRoot: proof.installedRoot, version: "0.1.5" }));
  proof.routeScenarios[0].roleScope = "root";
  assert.throws(() => validateSessionProfileProof(proof, { artifactSha256: sha256, installedRoot: proof.installedRoot, version: "0.1.6" }));
});

test("default shared picker consumers cannot adopt 020 from a version or receipt flag", () => {
  for (const [version, contract] of [["0.1.6", "native-select-016"], ["0.1.7", "native-menu-017"], ["0.1.8", "native-menu-mode-018"], ["0.1.9", "native-menu-mode-018"]]) assert.equal(nativePickerContract(version), contract);
  const input = { artifact: fileURLToPath(new URL("../../dsmm-dsmm-0.2.0.tgz", import.meta.url)), sha256: "a".repeat(64), packageVersion: "0.2.0" };
  assert.throws(() => nativePickerContract("0.2.0"));
  assert.throws(() => frozenPickerArtifactOptions(input));
  assert.throws(() => validateNativePickerProof({ sourceContract: "0.2.0", packageVersion: "0.2.0" }, { artifactSha256: input.sha256, packageVersion: "0.2.0" }));
  assert.equal(nativePickerContract("0.2.0", { sourceContract: "0.2.0" }), "native-menu-mode-020");
  assert.equal(frozenPickerArtifactOptions({ ...input, sourceContract: "0.2.0" }).sourceContract, "0.2.0");
  assert.throws(() => nativePickerContract("0.1.9", { sourceContract: "0.2.0" }));
  assert.throws(() => nativePickerContract("0.2.1", { sourceContract: "0.2.0" }));
});
