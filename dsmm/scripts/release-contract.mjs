import assert from "node:assert/strict";

// New contracts are explicit identities, not an open-ended SemVer override.
export const isSource020 = (version) => version === "0.2.0";
export const isSource021 = (version) => version === "0.2.1";
export const isReviewedSource = (version) => isSource020(version) || isSource021(version);
export const sourceContractForVersion = (version) => isReviewedSource(version) ? version : undefined;
export function startupProfileContract(version, { sourceContract } = {}) {
  if (sourceContract === undefined) return "historical-read-lock";
  assert.equal(isReviewedSource(sourceContract), true, "unreviewed source contract");
  assert.equal(version, sourceContract);
  return isSource021(version) ? "stable-native-first-021" : "central-read-lock-free-020";
}
export function nativePickerCheckForVersion(version, options = {}) {
  const contract = startupProfileContract(version, options);
  assert.notEqual(contract, "stable-native-first-021", "021 uses the stable native browser proof, not historical picker grammar");
  return contract === "central-read-lock-free-020" ? "nativePickerCompactHeaderAcceptance" : "nativePickerCompactProfileAcceptance";
}
export const pluginTitleForVersion = (version) => isReviewedSource(version) ? "DSMM" : "Deepwork";
export const PRESET_NAMES_020 = Object.freeze([
  ["orchestrator", "Orchestrator"], ["planner", "Planner"], ["plan-critic", "Plan Critic"], ["builder", "Builder"],
  ["reviewer", "Reviewer"], ["oracle", "Oracle"], ["oracle-2nd", "Oracle 2nd"], ["creative", "Creative"],
  ["code-search", "Code Search"], ["doc-search", "Doc Search"], ["clarifier", "Clarifier"], ["media-reader", "Media Reader"],
  ["frontend", "Frontend"], ["hard-reasoning", "Hard Reasoning"], ["research", "Research"], ["quick", "Quick"],
  ["coding", "Coding"], ["normal-task", "Normal Task"], ["complex", "Complex"], ["deep", "Deep"],
  ["documenting", "Documenting"], ["cross-cutting", "Cross Cutting"],
].map(([id, name]) => Object.freeze({ id: `dsmm-${id}`, name: `DW ${name}` })));
export const ROLE_TOOLS_020 = Object.freeze(PRESET_NAMES_020.filter(({ id }) => !["dsmm-orchestrator", "dsmm-builder", "dsmm-cross-cutting"].includes(id))
  .map(({ id }) => id.replaceAll("-", "_")).sort());
export const PRESET_NAMES_021 = Object.freeze([...PRESET_NAMES_020]);
export const ROLE_TOOLS_021 = Object.freeze([...ROLE_TOOLS_020]);
export const presetNamesForVersion = (version) => isSource021(version) ? PRESET_NAMES_021 : PRESET_NAMES_020;
export const roleToolsForVersion = (version) => isSource021(version) ? ROLE_TOOLS_021 : ROLE_TOOLS_020;
export const COMPILED_NAMES_020 = Object.freeze([
  "config-file-store", "deployment-config", "modules", "native-scope", "role-policy", "skills", "prompt-content",
  "roles", "role-subagents", "preset-registry", "preset-materializer", "mode", "state", "prompts", "commands",
  "client/deployment-controller", "client/DeploymentPage", "client/deployment-locales", "client/deployment-data", "client/plugins-contract",
]);
export const CORE_CHECKS_020 = Object.freeze([
  "coldOffCoreRpc", "nativeEntryForm", "globalAndProfileSaveIsolation", "noRemountOrSessionCreation",
  "desiredOnRestartRequired", "masterCannotBeBypassed", "strictOperatorAuthority",
]);
export const COMPILED_NAMES_021 = Object.freeze([
  ...COMPILED_NAMES_020,
  "profile-locale", "profile-diagnostics", "role-invocation", "role-runs", "role-control-types", "role-control-rpc", "role-control-remote",
  "child-admission", "child-admission-contract", "child-capture", "child-evidence", "native-child-evidence", "delivery-authority",
  "subagent-runtime", "runtime-integration", "legacy-read-host", "legacy-read-contracts", "legacy-read-composition", "legacy-read-integration", "legacy-read-proxy", "legacy-child-policy",
  "client/RoleAvailability", "client/diagnostics", "client/ChildrenPanel", "client/children-controller", "client/children-locales",
]);
export const PUBLIC_RUNTIME_EXPORTS_021 = Object.freeze({
  "./subagent-runtime": "lib/runtime-integration.js",
  "./legacy-read-host": "lib/legacy-read-host.js",
});
export const STABLE_UI_CHECKS_021 = Object.freeze([
  "publicNativeCapturedChild", "browserEditSaveWarning", "browserFutureApplyAndStaleCas", "browserCurrentApplyAndStaleCas",
  "browserChildrenNativeInboxReceipt", "browserChildrenNativeMessage",
]);
export const SKILL_EXECUTABLES_020 = Object.freeze([
  "skills/debugging/references/scripts/dap.mjs", "skills/debugging/references/scripts/dap.test.mjs", "skills/debugging/references/scripts/fixture-adapter.mjs",
  "skills/frontend/scripts/perfection/lighthouse-audit.py", ...["core", "design_system", "search"].map((name) => `skills/frontend/references/ui-ux-db/scripts/${name}.py`),
  "skills/ast-grep/install.ps1", "skills/ast-grep/install.sh", "skills/ast-grep/scripts/ast_grep_helper.py",
  ...["smoke.ps1", "smoke.sh", "test_resolver.py"].map((name) => `skills/ast-grep/tests/${name}`),
  "skills/coding-agent-sessions/scripts/find-agent-sessions.py",
  ...["__init__", "aside_scanner", "claude", "cli", "codex", "file_scanners", "jsonio", "kiro_scanner", "opencode", "pi_family", "scanners",
    "sqlite_optional_scanners", "sqlite_scanners", "timeparse", "transcript", "types"].map((name) => `skills/coding-agent-sessions/scripts/agent_sessions/${name}.py`),
  ...["test_agent_sessions", "test_aside_scanner", "test_cli_contract", "test_extended_scanners", "test_optional_sqlite_scanners", "test_pi_family_scanners"]
    .map((name) => `skills/coding-agent-sessions/scripts/tests/${name}.py`),
]);
export function validateStableBootstrap(proof, { template = "web", requireDeliveryFence = true } = {}) {
  assert.deepEqual(proof?.startedBundles, ["@deepseek-ai/dsh-base", template === "web" ? "@deepseek-ai/dsh-web-app" : "@deepseek-ai/dsh-headless", "@dsmm/dsmm"]);
  for (const key of ["stockSubagentDisabled", "runtimeLoaded", "mainLoaded"]) assert.equal(proof[key], true, key);
  assert.equal(proof.customRuntimeEntries, 1); assert.equal(proof.mainEntries, 1); assert.equal(proof.binding, "dsmm");
  assert.equal(proof.loader?.length, 2);
  assert.deepEqual(proof.loader.map(entry => entry.name).sort(), ["@dsmm/dsmm", "@dsmm/dsmm/subagent-runtime"]);
  assert.equal(new Set(proof.loader.map(entry => entry.id)).size, 2);
  for (const entry of proof.loader) { assert.ok(typeof entry.id === "string" && entry.id.length > 0); assert.equal(entry.state, 2); }
  assert.equal(proof.experimentalLegacyRead, "unconfigured/unavailable");
  if (requireDeliveryFence) { assert.equal(proof.deliveryFenceReady, true); assert.equal(proof.restartRequired, false); }
  return proof;
}
export function validateCoreProof(proof, { sha256, version }) {
  assert.equal(isReviewedSource(version), true);
  if (isSource021(version)) {
    assert.equal(proof?.sourceContract, "0.2.1");
    validateStableBootstrap(proof.bootstrap, { requireDeliveryFence: false });
  }
  assert.equal(proof?.outcome, "COMPLETED");
  assert.equal(proof.artifactSha256, sha256); assert.equal(proof.packageVersion, version);
  assert.deepEqual(Object.keys(proof.checks ?? {}).sort(), [...CORE_CHECKS_020].sort());
  for (const key of CORE_CHECKS_020) assert.equal(proof.checks[key], true, key);
  assert.equal(proof.externalModelCalls, false); assert.equal(proof.productionAuthenticationModified, false);
  assert.equal(proof.postAppReady, true); assert.equal(proof.installedPackage, "@dsmm/dsmm");
  assert.match(proof.clientSha256, /^[a-f0-9]{64}$/u);
  return proof;
}
