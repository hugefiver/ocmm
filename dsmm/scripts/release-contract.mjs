import assert from "node:assert/strict";

// New contracts are explicit identities, not an open-ended SemVer override.
export const isSource020 = (version) => version === "0.2.0";
export const isSource021 = (version) => version === "0.2.1";
export const isSource022 = (version) => version === "0.2.2";
export const isSource030 = (version) => version === "0.3.0";
export const isSource031 = (version) => version === "0.3.1";
export const isStableNativeSource = (version) => isSource021(version) || isSource022(version) || isSource030(version);
export const isBuildOnlyRelease = (version) => isSource030(version) || isSource031(version);
export const isReviewedSource = (version) => isSource020(version) || isStableNativeSource(version) || isSource031(version);
export const isReviewedReleaseVersion = (version) => ["0.1.1", "0.1.2", "0.1.3", "0.1.4", "0.1.5", "0.1.6", "0.1.7", "0.1.8", "0.1.9"].includes(version) || isReviewedSource(version);
export function assertReviewedReleaseVersion(version) {
  assert.equal(isReviewedReleaseVersion(version), true, "unreviewed release version");
  return version;
}
export const sourceContractForVersion = (version) => isReviewedSource(version) ? version : undefined;
const DSH_RC2_POLICY = Object.freeze({
  runtimeVersion: "0.2.0-rc.2",
  sdkVersion: "0.2.0-rc.2",
  peerVersion: "0.2.0-rc.2",
  integrity: "sha512-EAJ3gPNcVt/uv8X19PMm9NkVhWgT7xXNMk0UKCVm+IQ5rpSQOcsMUa0HWlnYYVybKMsccjcRB21vVVsaXQ6IdA==",
  engines: Object.freeze({ node: ">=22" }),
});
const DSH_RC1_030_POLICY = Object.freeze({
  runtimeVersion: "0.2.1-rc.1",
  sdkVersion: "0.2.1-rc.1",
  peerVersion: "0.2.1-rc.1",
  integrity: "sha512-ce+4rnRuhkheK8++2EGm0CjHKVfF7IjUk4DO/NydRS8inAM8A0GFGQmX3cWKM4OzzbT+diIMyOiDuA1wYAZioA==",
  engines: Object.freeze({ node: ">=22", dsh: ">=0.2.1-rc.1 <0.3.0-0" }),
  sourceCommit: "1600d8a1e140dcde43a1a0941940a0480712c011",
});
export const OFFICIAL_RUNTIME_PACKAGES_031 = Object.freeze({
  registry: "@deepseek-ai/dsh-agent",
  runtime: "@deepseek-ai/dsh-subagent",
  jsonl: "@deepseek-ai/dsh-session-persistence-jsonl",
});
const DSH_RC2_031_POLICY = Object.freeze({
  runtimeVersion: "0.2.1-rc.2",
  sdkVersion: "0.2.1-rc.2",
  peerVersion: "0.2.1-rc.2",
  integrity: "sha512-tvY+yhfKRifthbqPe/OK0AYxM5ZkvqfYq/jMYgJcEUxiRRL1Vwra3Ti5TB6AXgSWQdiPHYh/Vp6SJa9yHwMNuw==",
  engines: Object.freeze({ node: ">=22", dsh: "0.2.1-rc.2" }),
  officialRuntime: OFFICIAL_RUNTIME_PACKAGES_031,
});
export function dshPolicyForVersion(version) {
  assertReviewedReleaseVersion(version);
  return isSource031(version) ? DSH_RC2_031_POLICY : isSource030(version) ? DSH_RC1_030_POLICY : DSH_RC2_POLICY;
}
export function startupProfileContract(version, { sourceContract } = {}) {
  if (sourceContract === undefined) return "historical-read-lock";
  assert.equal(isReviewedSource(sourceContract), true, "unreviewed source contract");
  assert.equal(version, sourceContract);
  if (isSource031(version)) return "stable-native-first-031";
  if (isSource030(version)) return "stable-native-first-030";
  if (isSource022(version)) return "stable-native-first-022";
  return isSource021(version) ? "stable-native-first-021" : "central-read-lock-free-020";
}
export function stableUiKindForVersion(version) {
  assert.equal(isStableNativeSource(version), true, "unreviewed stable native version");
  return isSource030(version) ? "native-client-stable-first-030" : isSource022(version) ? "native-client-stable-first-022" : "native-client-stable-first-021";
}
export function nativePickerCheckForVersion(version, options = {}) {
  assertReviewedReleaseVersion(version);
  const contract = startupProfileContract(version, options);
  assert.ok(!contract.startsWith("stable-native-first-"), "stable native sources require their own browser proof, not historical picker grammar");
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
export const PRESET_NAMES_022 = Object.freeze([...PRESET_NAMES_021]);
export const ROLE_TOOLS_022 = Object.freeze(["dsmm_category", "dsmm_clarifier", "dsmm_code_search", "dsmm_doc_search", "dsmm_media_reader",
  "dsmm_oracle", "dsmm_oracle_2nd", "dsmm_plan_critic", "dsmm_planner", "dsmm_reviewer"].sort());
export const PRESET_NAMES_030 = Object.freeze([...PRESET_NAMES_022]);
export const ROLE_TOOLS_030 = Object.freeze([...ROLE_TOOLS_022]);
export const presetNamesForVersion = (version) => isSource030(version) || isSource031(version) ? PRESET_NAMES_030 : isSource022(version) ? PRESET_NAMES_022 : isSource021(version) ? PRESET_NAMES_021 : PRESET_NAMES_020;
export const roleToolsForVersion = (version) => isSource030(version) || isSource031(version) ? ROLE_TOOLS_030 : isSource022(version) ? ROLE_TOOLS_022 : isSource021(version) ? ROLE_TOOLS_021 : ROLE_TOOLS_020;
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
export const COMPILED_NAMES_022 = Object.freeze([
  ...COMPILED_NAMES_021, "llm-runtime", "managed-settings", "permission-bash", "permission-pwsh", "permission-native-command",
  "permission-fs", "permission-fs-search", "permission-web"
]);
const RETIRED_COMPATIBILITY_MODULES_030 = new Set(["legacy-read-host", "legacy-read-contracts", "legacy-read-composition", "legacy-read-integration", "legacy-read-proxy", "legacy-child-policy"]);
export const COMPILED_NAMES_030 = Object.freeze([...new Set([
  ...COMPILED_NAMES_022, "agent-registry",
  "child-admission", "child-admission-contract", "child-capture", "child-evidence", "commands", "config-file-store", "config-revision",
  "core-permission-authority", "core-permissions", "delivery-authority", "deployment-config", "deployment-permission-rules", "dsh-events", "dsh-home", "dsh-types",
  "guards", "host-llm", "host-llm-startup", "index", "legacy-child-policy", "legacy-read-composition", "legacy-read-contracts", "legacy-read-host",
  "legacy-read-integration", "legacy-read-proxy", "live-pi-ai-owner", "llm-runtime", "lsp", "managed-settings", "mode", "model-family",
  "model-parameter-policy", "model-routing", "modules", "native-child-evidence", "native-pi-ai-wire", "native-scope", "permission-bash",
  "permission-control", "permission-controller", "permission-errors", "permission-fs", "permission-fs-search", "permission-native-access",
  "permission-native-command", "permission-native-rules", "permission-pwsh", "permission-remote", "permission-rpc", "permission-rules",
  "permission-settings", "permission-shell", "permission-web", "plan-validation", "preset-materializer", "preset-registry", "preset-skills",
  "profile-diagnostics", "profile-locale", "profile-remote", "profile-rpc", "profile-runtime", "profile-store", "profile-types", "profiles",
  "prompt-content", "prompts", "recovery-policy", "role-control-remote", "role-control-rpc", "role-control-types", "role-identity", "role-invocation",
  "role-llm", "role-llm-runtime", "role-policy", "role-providers", "role-routing", "role-runs", "role-subagents", "roles", "route-json",
  "routing-policy", "runtime-composition", "runtime-integration", "runtime-recovery", "session-metadata", "session-persistence", "session-scope",
  "settings", "shell-command", "skills", "state", "status", "subagent-runtime",
  "client/ChildrenPanel", "client/children-controller", "client/children-locales", "client/configuration-display", "client/controller",
  "client/DeploymentFields", "client/DeploymentPage", "client/deployment-controller", "client/deployment-data", "client/deployment-locales",
  "client/deployment-modules", "client/deployment-workspace", "client/diagnostics", "client/EditableChoice", "client/index", "client/locales",
  "client/NativeCommandEntries", "client/permission-client", "client/permission-controller", "client/permission-locales", "client/PermissionsPanel",
  "client/plugins-contract", "client/ProfilesSection", "client/RoleAvailability", "client/RoleToolView", "client/RoleToolView-data",
  "client/RoleToolView-locales", "client/SessionProfiles", "client/session-labels", "client/StructuredEditor", "client/structured", "client/styles",
])].filter(name => !RETIRED_COMPATIBILITY_MODULES_030.has(name)));
export const PUBLIC_RUNTIME_EXPORTS_022 = Object.freeze({
  ...PUBLIC_RUNTIME_EXPORTS_021,
  "./llm-runtime": "lib/llm-runtime.js",
  "./managed-settings": "lib/managed-settings.js",
  "./permission-bash": "lib/permission-bash.js",
  "./permission-pwsh": "lib/permission-pwsh.js",
  "./permission-fs": "lib/permission-fs.js",
  "./permission-fs-search": "lib/permission-fs-search.js",
  "./permission-web": "lib/permission-web.js"
});
export const PUBLIC_RUNTIME_EXPORTS_030 = Object.freeze({
  ...Object.fromEntries(Object.entries(PUBLIC_RUNTIME_EXPORTS_022).filter(([name]) => name !== "./legacy-read-host")),
  "./agent-registry": "lib/agent-registry.js",
});
export const REQUIRED_PUBLIC_EXPORTS_031 = Object.freeze({
  ".": Object.freeze({ types: "./lib/index.d.ts", default: "./lib/index.js" }),
  "./client": Object.freeze({ types: "./lib/client/index.d.ts", default: "./lib/client.js" }),
  "./package.json": "./package.json",
  "./locale/en.json": "./locale/en.json",
  "./locale/zh.json": "./locale/zh.json",
});
const RETIRED_OWNER_EXPORTS_031 = new Set(["./agent-registry", "./subagent-runtime", "./session-persistence", "./legacy-read-host"]);
function safePublicTarget(target) {
  return typeof target === "string" && /^\.\/[a-z0-9][a-z0-9._/-]*$/u.test(target)
    && target.slice(2).split("/").every((part) => part !== "" && part !== "." && part !== "..");
}
export function validatePublicExports031(exports, hasFile = () => true) {
  assert.ok(exports && typeof exports === "object" && !Array.isArray(exports), "031 public exports must be an object");
  assert.equal(typeof hasFile, "function", "031 export resolver is required");
  for (const [name, declaration] of Object.entries(REQUIRED_PUBLIC_EXPORTS_031)) assert.deepEqual(exports[name], declaration, `031 required public export ${name}`);
  const resolved = {};
  for (const [name, declaration] of Object.entries(exports)) {
    assert.ok(name === "." || /^\.\/[a-z0-9][a-z0-9._/-]*$/u.test(name), `invalid 031 public export name: ${name}`);
    assert.equal(RETIRED_OWNER_EXPORTS_031.has(name), false, `retired custom owner export is forbidden: ${name}`);
    if (typeof declaration === "string") {
      assert.equal(declaration, name, `031 public resource export must resolve to itself: ${name}`);
      assert.ok(declaration === "./package.json" || declaration.endsWith(".json"), `031 public resource export must be JSON: ${name}`);
      assert.ok(safePublicTarget(declaration) && hasFile(declaration.slice(2)), `031 public resource is not delivered: ${name}`);
      resolved[name] = declaration.slice(2);
      continue;
    }
    assert.ok(declaration && typeof declaration === "object" && !Array.isArray(declaration), `031 public module export must be an object: ${name}`);
    assert.deepEqual(Object.keys(declaration).sort(), ["default", "types"], `031 public module export conditions: ${name}`);
    assert.ok(safePublicTarget(declaration.default) && /^\.\/lib\/.+\.js$/u.test(declaration.default), `031 public JavaScript target is invalid: ${name}`);
    assert.ok(safePublicTarget(declaration.types) && /^\.\/lib\/.+\.d\.ts$/u.test(declaration.types), `031 public declaration target is invalid: ${name}`);
    assert.ok(hasFile(declaration.default.slice(2)) && hasFile(declaration.types.slice(2)), `031 public module is not delivered: ${name}`);
    resolved[name] = declaration.default.slice(2);
  }
  return Object.freeze(resolved);
}
export const COLD_PROFILE_SCRIPTS_022 = Object.freeze([
  "scripts/migrate-cold-profile.mjs", "scripts/cold-profile-composition.mjs", "scripts/cold-profile-sources.mjs"
]);
export const STABLE_UI_CHECKS_022 = Object.freeze([...STABLE_UI_CHECKS_021]);
export const STABLE_UI_CHECKS_030 = Object.freeze([
  "publicNativeCapturedChildV3", "browserDeploymentPageConfigCas", "browserPermissionsRulesCas",
  "browserRoleToolRequestedIdentity", "browserRoleToolValidatedActualIdentity", "browserNativeDeliveryFence",
]);
export function stableUiChecksForVersion(version) {
  assert.equal(isStableNativeSource(version), true, "unreviewed stable native version");
  return isSource030(version) ? STABLE_UI_CHECKS_030 : isSource022(version) ? STABLE_UI_CHECKS_022 : STABLE_UI_CHECKS_021;
}
export function publicRuntimeExportsForVersion(version) {
  assert.equal(isStableNativeSource(version), true, "unreviewed stable native version");
  return isSource030(version) ? PUBLIC_RUNTIME_EXPORTS_030 : isSource022(version) ? PUBLIC_RUNTIME_EXPORTS_022 : PUBLIC_RUNTIME_EXPORTS_021;
}
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
export const SKILL_EXECUTABLES_021 = Object.freeze([...SKILL_EXECUTABLES_020]);
export const SKILL_EXECUTABLES_022 = Object.freeze([...SKILL_EXECUTABLES_021]);
export const SKILL_EXECUTABLES_030 = Object.freeze([...SKILL_EXECUTABLES_022]);
export function skillExecutablesForVersion(version) {
  assert.equal(isReviewedSource(version), true, "unreviewed source resource version");
  return isSource030(version) || isSource031(version) ? SKILL_EXECUTABLES_030 : isSource022(version) ? SKILL_EXECUTABLES_022 : isSource021(version) ? SKILL_EXECUTABLES_021 : SKILL_EXECUTABLES_020;
}
export function validateStableBootstrap(proof, { template = "web", requireDeliveryFence = true, version } = {}) {
  assert.deepEqual(proof?.startedBundles, ["@deepseek-ai/dsh-base", template === "web" ? "@deepseek-ai/dsh-web-app" : "@deepseek-ai/dsh-headless", "@dsmm/dsmm"]);
  for (const key of ["stockSubagentDisabled", "runtimeLoaded", "mainLoaded"]) assert.equal(proof[key], true, key);
  assert.equal(proof.customRuntimeEntries, 1); assert.equal(proof.mainEntries, 1); assert.equal(proof.binding, "dsmm");
  const version030 = isSource030(version);
  if (version030) {
    for (const key of ["stockAgentDisabled", "registryLoaded"]) assert.equal(proof[key], true, key);
    assert.equal(proof.registryEntries, 1); assert.equal(proof.agentsService, "DsmmAgentRegistry");
    assert.equal(proof.subagentsService, "DsmmSubagentRuntime");
  }
  const expectedNames = version030
    ? ["@dsmm/dsmm", "@dsmm/dsmm/agent-registry", "@dsmm/dsmm/subagent-runtime"]
    : ["@dsmm/dsmm", "@dsmm/dsmm/subagent-runtime"];
  assert.equal(proof.loader?.length, expectedNames.length);
  assert.deepEqual(proof.loader.map(entry => entry.name).sort(), expectedNames);
  assert.equal(new Set(proof.loader.map(entry => entry.id)).size, expectedNames.length);
  for (const entry of proof.loader) { assert.ok(typeof entry.id === "string" && entry.id.length > 0); assert.equal(entry.state, 2); }
  if (version030) assert.equal(proof.legacyCompatibility, "not-composed");
  else assert.equal(proof.experimentalLegacyRead, "unconfigured/unavailable");
  if (isSource030(version)) {
    assert.equal(proof.runtimeMode, "auto");
    assert.equal(proof.autoRuntimeEntries, 1);
    assert.equal(proof.manualRuntimeEntries, 0);
    assert.equal(proof.loader.find(entry => entry.name === "@dsmm/dsmm/subagent-runtime")?.id, "dsmm-auto-subagent-runtime");
    assert.equal(proof.loader.some(entry => entry.id === "dsmm-subagent-runtime"), false);
  }
  if (requireDeliveryFence) { assert.equal(proof.deliveryFenceReady, true); assert.equal(proof.restartRequired, false); }
  return proof;
}
export function validateCoreProof(proof, { sha256, version }) {
  assert.equal(isReviewedSource(version), true);
  if (isStableNativeSource(version)) {
    assert.equal(proof?.sourceContract, version);
    validateStableBootstrap(proof.bootstrap, { requireDeliveryFence: false, version });
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
