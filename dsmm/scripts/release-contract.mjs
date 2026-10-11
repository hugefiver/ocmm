import assert from "node:assert/strict";

// New contracts are explicit identities, not an open-ended SemVer override.
export const isSource020 = (version) => version === "0.2.0";
export function startupProfileContract(version, { sourceContract } = {}) {
  if (sourceContract === undefined) return "historical-read-lock";
  assert.equal(sourceContract, "0.2.0");
  assert.equal(version, sourceContract);
  return "central-read-lock-free-020";
}
export const nativePickerCheckForVersion = (version, options = {}) => startupProfileContract(version, options) === "central-read-lock-free-020"
  ? "nativePickerCompactHeaderAcceptance" : "nativePickerCompactProfileAcceptance";
export const pluginTitleForVersion = (version) => isSource020(version) ? "DSMM" : "Deepwork";
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
export const COMPILED_NAMES_020 = Object.freeze([
  "config-file-store", "deployment-config", "modules", "native-scope", "role-policy", "skills", "prompt-content",
  "roles", "role-subagents", "preset-registry", "preset-materializer", "mode", "state", "prompts", "commands",
  "client/deployment-controller", "client/DeploymentPage", "client/deployment-locales", "client/deployment-data", "client/plugins-contract",
]);
export const CORE_CHECKS_020 = Object.freeze([
  "coldOffCoreRpc", "nativeEntryForm", "globalAndProfileSaveIsolation", "noRemountOrSessionCreation",
  "desiredOnRestartRequired", "masterCannotBeBypassed", "strictOperatorAuthority",
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
export function validateCoreProof(proof, { sha256, version }) {
  assert.equal(isSource020(version), true);
  assert.equal(proof?.outcome, "COMPLETED");
  assert.equal(proof.artifactSha256, sha256); assert.equal(proof.packageVersion, version);
  assert.deepEqual(Object.keys(proof.checks ?? {}).sort(), [...CORE_CHECKS_020].sort());
  for (const key of CORE_CHECKS_020) assert.equal(proof.checks[key], true, key);
  assert.equal(proof.externalModelCalls, false); assert.equal(proof.productionAuthenticationModified, false);
  assert.equal(proof.postAppReady, true); assert.equal(proof.installedPackage, "@dsmm/dsmm");
  assert.match(proof.clientSha256, /^[a-f0-9]{64}$/u);
  return proof;
}
