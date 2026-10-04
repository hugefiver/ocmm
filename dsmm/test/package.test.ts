import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type {
  AgentRequestErrorFrame,
  AgentTurnStoppingFrame,
  DshEpochHeader,
  DshGoalChangeEventData,
  DshGoalSnapshot,
  DshLlmFailure,
  DshRequestErrorAction,
  DshRequestHeaderEventData,
  DshStepBoundaryEventData,
  DshTodoItem,
  DshTodoWriteEventData,
  DsmmStatusSnapshot,
  DsmmRecoveryRoute,
  DsmmModelRoute,
  DsmmRoleRoutingConfig,
  DsmmRuntimeRecoverySettings,
  DurableRecoveryWork,
  RecoveryFailureDecision
} from "../lib/index.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const publicRuntimeRecoveryTypes = null as unknown as [
  RecoveryFailureDecision,
  DurableRecoveryWork,
  DsmmRecoveryRoute,
  DsmmModelRoute,
  DsmmRoleRoutingConfig,
  DsmmRuntimeRecoverySettings,
  DshLlmFailure,
  DshEpochHeader,
  AgentRequestErrorFrame,
  DshRequestErrorAction,
  AgentTurnStoppingFrame,
  DshStepBoundaryEventData,
  DshRequestHeaderEventData,
  DshTodoItem,
  DshTodoWriteEventData,
  DshGoalSnapshot,
  DshGoalChangeEventData,
  DsmmStatusSnapshot
];
void publicRuntimeRecoveryTypes;

test("package manifest exposes dsh bundle metadata", () => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

  assert.equal(pkg.name, "@dsmm/dsmm");
  assert.equal(pkg.version, "0.1.4");
  assert.equal(Object.hasOwn(pkg, "private"), false);
  assert.equal(pkg.author, "Hugefiver");
  assert.equal(pkg.license, "LicenseRef-AAAPL");
  assert.equal(pkg.repository, "https://github.com/hugefiver/ocmm");
  assert.equal(pkg.homepage, "https://github.com/hugefiver/ocmm/tree/master/dsmm");
  assert.equal(pkg.bugs, "https://github.com/hugefiver/ocmm/issues");
  assert.deepEqual(pkg.keywords, ["deepseek-harness", "dsh", "dsh-plugin", "deepwork", "agentic-workflows", "cordis"]);
  assert.deepEqual(pkg.publishConfig, { registry: "https://registry.npmjs.org/", access: "public" });
  assert.equal(pkg.type, "module");
  assert.equal(pkg.main, "./lib/index.js");
  assert.equal(pkg.types, "./lib/index.d.ts");
  assert.deepEqual(pkg.exports, {
    ".": { types: "./lib/index.d.ts", default: "./lib/index.js" },
    "./preset-skills": { types: "./lib/preset-skills.d.ts", default: "./lib/preset-skills.js" },
    "./session-persistence": { types: "./lib/session-persistence.d.ts", default: "./lib/session-persistence.js" },
    "./client": { types: "./lib/client/index.d.ts", default: "./lib/client.js" },
    "./package.json": "./package.json",
    "./locale/en.json": "./locale/en.json",
    "./locale/zh.json": "./locale/zh.json"
  });
  assert.deepEqual(pkg.files, [
    "lib/**/*.js",
    "lib/**/*.d.ts",
    "scripts/repair-session-log.mjs",
    "scripts/session-repair-native-verifier.mjs",
    "locale/*.json",
    "agent-presets",
    "docs/agent-presets.md",
    "docs/compatibility.md",
    "docs/design.md",
    "docs/lsp.md",
    "docs/migration-from-ocmm.md",
    "docs/model-routing.md",
    "docs/profiles.md",
    "docs/releasing.md",
    "docs/research",
    "docs/roadmap.md",
    "docs/runtime-recovery.md",
    "docs/safety-guards.md",
    "docs/settings-status.md",
    "docs/skill-sync.md",
    "patches",
    "prompts",
    "skills",
    "cordis.patch.yml",
    "LICENSE",
    "README.md"
  ]);
  assert.equal(pkg.files.includes("lib"), false);
  assert.equal(pkg.files.some((path: string) => path.includes("implementation-plan")), false);
  assert.deepEqual(pkg.engines, { node: ">=22" });
  assert.deepEqual(pkg.dependencies, { "@deepseek-ai/schemastery": "~3.18.4", "jsonc-parser": "^3.3.1" });
  assert.equal(pkg.scripts["smoke:docker:build"], "docker build --build-arg DSH_PACKAGE=@deepseek-ai/dsh@0.2.0-rc.2 -f docker/Dockerfile.smoke -t dsmm-dsh-smoke:0.2 ..");
  assert.equal(pkg.scripts["check:release"], "node scripts/check-release-readiness.mjs");
  assert.equal(Object.hasOwn(pkg, "browser"), false);
  assert.equal(Object.hasOwn(pkg.exports, "./typert"), false, "Host registers its owned Typert contribution explicitly, without auto-loading a duplicate");
  assert.equal(pkg.scripts.build, "tsc -p tsconfig.json && node scripts/build-client.mjs");
  assert.equal(pkg.scripts["build:client"], "node scripts/build-client.mjs");
  assert.equal(pkg.devDependencies.react, "^18.3.1");
  assert.equal(pkg.devDependencies["@types/react"], "^18.3.27");
  assert.equal(pkg.devDependencies.esbuild, "^0.25.12");
  assert.equal(Object.keys(pkg.dependencies).some((name) => /react|esbuild|playwright/iu.test(name)), false, "browser tooling is not a server runtime dependency");
  for (const packageSection of [pkg.peerDependencies, pkg.devDependencies]) {
    assert.equal(packageSection["@deepseek-ai/cordis"], "~4.0.4");
    for (const name of ["attachment", "brand", "invariants", "llm", "timeout", "subagent", "typert-protocol", "session", "session-persistence", "session-persistence-jsonl"]) {
      assert.equal(packageSection[`@deepseek-ai/dsh-${name}`], "0.2.0-rc.2");
    }
  }
  for (const name of ["system-prompt", "agent", "agent-loop", "agent-preset-registry", "tools", "scope", "session", "session-projection", "subagent-spawn-in-process"]) {
    assert.equal(pkg.devDependencies[`@deepseek-ai/dsh-${name}`], "0.2.0-rc.2");
  }
  for (const name of ["typert-registry", "api-gateway", "client-connection", "client-ui-slots", "client-ui-renderer", "client-store", "client-locale", "client-ui-primitives", "client-ui-settings"]) {
    assert.equal(pkg.devDependencies[`@deepseek-ai/dsh-${name}`], "0.2.0-rc.2");
  }

  assert.deepEqual(pkg.dsh, { client: { platform: "web", inject: ["@deepseek-ai/dsh-api-gateway", "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-renderer"], external: [] }, bundle: { patch: "./cordis.patch.yml" } });
});

test("package includes only the exact operator repair entrypoints without exposing repair APIs", () => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const scripts = ["scripts/repair-session-log.mjs", "scripts/session-repair-native-verifier.mjs"];
  assert.deepEqual(pkg.files.filter((path: string) => path.startsWith("scripts")), scripts);
  assert.equal(Object.keys(pkg.exports).some((path) => /repair|operator/u.test(path)), false);
  for (const path of scripts) assert.equal(existsSync(join(packageRoot, path)), true, path);
});

test("exported native plugin metadata displays Deepwork in both languages without renaming the package", () => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  assert.equal(pkg.name, "@dsmm/dsmm");
  for (const language of ["en", "zh"]) {
    const resource = `locale/${language}.json`;
    assert.equal(pkg.exports[`./${resource}`], `./${resource}`);
    const metadata = JSON.parse(readFileSync(join(packageRoot, resource), "utf8"));
    assert.deepEqual(Object.keys(metadata), ["meta"]);
    assert.deepEqual(Object.keys(metadata.meta).sort(), ["description", "title"]);
    assert.equal(metadata.meta.title, "Deepwork");
    assert.equal(typeof metadata.meta.description, "string");
    assert.ok(metadata.meta.description.trim().length > 0);
  }
});

test("README local documentation links are shipped by the package", () => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
  const localDocs = [...new Set([...readme.matchAll(/\[[^\]]+\]\((docs\/[^)#]+)\)/gu)].map((match) => match[1]))];

  for (const required of ["docs/migration-from-ocmm.md", "docs/settings-status.md", "docs/agent-presets.md", "docs/compatibility.md", "docs/releasing.md", "docs/profiles.md"]) {
    assert.ok(localDocs.includes(required), `${required} is linked from README`);
  }
  assert.match(readme, /@deepseek-ai\/dsh@0\.2\.0-rc\.2/u);
  assert.match(readme, /seven scoped core workflow skills/iu);
  assert.match(readme, /twelve native roles/iu);
  assert.match(readme, /nine tools including atomic `format`/iu);
  assert.match(readme, /Headless task text is not a slash-command adapter/u);
  for (const path of localDocs) {
    assert.ok(pkg.files.includes(path), `${path} is included in package files`);
    assert.equal(existsSync(join(packageRoot, path)), true, `${path} exists`);
  }
});

test("settings-status documentation separates deployment configuration from runtime profiles", () => {
  const settingsStatus = readFileSync(join(packageRoot, "docs", "settings-status.md"), "utf8");

  for (const heading of ["Commands and inspection", "Workflow compatibility", "Other settings", "Snapshot boundaries"]) {
    assert.match(settingsStatus, new RegExp(`^## ${heading}$`, "mu"));
  }
  assert.match(settingsStatus, /\/dsmm-status\b/u);
  assert.match(settingsStatus, /\/dsmm-status json/u);
  assert.match(settingsStatus, /Usage: \/dsmm-status \[json\]/u);
  assert.match(settingsStatus, /defensive JSON snapshot with version 1/u);
  assert.match(settingsStatus, /Commands belong to the native command adapter/u);
  assert.match(settingsStatus, /restart-scoped/u);
  assert.match(settingsStatus, /Loader plugin entry.*deployment baseline/u);
  assert.match(settingsStatus, /removed `settings\.register\(\)` service/u);
  assert.match(settingsStatus, /\$DSH_HOME\/settings\.yaml/u);
  assert.match(settingsStatus, /runtime-only file overlays for newly admitted Agents/u);
  assert.match(settingsStatus, /Schema parsing preserves this distinction/u);
  assert.match(settingsStatus, /twelve role toggles default on/u);
  assert.match(settingsStatus, /does not perform capability\/network queries/u);

  for (const line of [
    "defaultActive: true",
    "policy: risk-based",
    "deepseekFlashCalibration: auto",
    "deepseekFlashDefaultReasoningEffort: high",
    "- dsmm-plan-critic",
    "- dsmm-reviewer",
    "runtimeRecovery:",
    "enabled: false",
    "lsp:"
  ]) {
    assert.ok(settingsStatus.includes(line), line);
  }
  assert.match(settingsStatus, /materialization remains off by default/u);
  assert.match(settingsStatus, /Save changes only the draft/u);
  assert.match(settingsStatus, /new Agents only/u);
  assert.match(settingsStatus, /including blank Agents.*retain.*snapshots/u);
  assert.match(settingsStatus, /cold-resumed sessions use the current selection/u);
  assert.match(settingsStatus, /`roles`, `skills`, `modeName`, `promptOrder`, `section`, `presets`, `lsp`/u);
});

test("model-routing documentation ships the exact calibration contract", () => {
  const modelRouting = readFileSync(join(packageRoot, "docs", "model-routing.md"), "utf8");

  assert.match(modelRouting, /deepwork mode or a selected DSMM preset is in scope/i);
  assert.match(modelRouting, /deepseek-official\/deepseek-v4-pro/u);
  assert.match(modelRouting, /deepseek-official\/deepseek-flash/u);
  assert.match(modelRouting, /deepseek-account\/deepseek-flash/u);
  assert.match(modelRouting, /DeepSeek-V41-Flash/u);
  for (const name of [
    "deepseekV4ProCalibration", "deepseekV4ProDefaultReasoningEffort", "deepseekV4ProMaxReasoningPresets",
    "deepseekFlashCalibration", "deepseekFlashDefaultReasoningEffort", "deepseekFlashMaxReasoningPresets"
  ]) assert.ok(modelRouting.includes(name), `${name} is documented`);
  assert.match(modelRouting.slice(modelRouting.indexOf("## Legacy exact-route calibration")), /DSMM does not change the user's default provider\/model/u);
  assert.match(modelRouting, /`auto` fills an omitted reasoning effort while preserving an explicit upstream effort/u);
  assert.match(modelRouting, /`strict` may replace an upstream effort only.*advertises a permitted value/u);
  assert.match(modelRouting, /max → high → valid default → unchanged/u);
  assert.match(modelRouting, /desired → valid default → unchanged/u);
  assert.match(modelRouting, /No effort is invented when the model has no reasoning metadata/u);
  assert.match(modelRouting, /role label alone.*(?:cannot|does not).*heterogeneity/i);
  assert.match(modelRouting, /Runtime recovery chooses any final route before calibration evaluates it/u);
  assert.match(modelRouting, /warning is sanitized.*no prompt, credentials, response body or request headers/is);
  assert.match(modelRouting, /actual persisted request header.*authoritative for the resolved effort/u);
});

test("runtime profile documentation distinguishes draft, revision, selection and live Agent authority", () => {
  const profiles = readFileSync(join(packageRoot, "docs", "profiles.md"), "utf8");
  assert.match(profiles, /native `profileContext\.dir` is the only storage authority/u);
  assert.match(profiles, /dsmm-profiles\/<id>\.jsonc/u);
  assert.match(profiles, /\.revisions\/<sha256>\.jsonc/u);
  assert.match(profiles, /\.selection\.json.*\{version: 1, id, revision\}/u);
  for (const field of ["defaultActive", "roleRouting", "workflow", "guards", "runtimeRecovery", "deepseekV4ProCalibration", "deepseekFlashCalibration"]) {
    assert.ok(profiles.includes(`\`${field}\``), `${field} runtime field is documented`);
  }
  const rejectedFields = profiles.slice(profiles.indexOf("Profiles reject deployment-only"), profiles.indexOf("Effective settings resolve"));
  for (const field of ["roles", "skills", "modeName", "promptOrder", "section", "presets", "lsp", "sessionPersistence"]) {
    assert.ok(rejectedFields.includes(`\`${field}\``), `${field} remains deployment-only`);
  }
  assert.match(profiles, /built-in DSMM defaults → deployment DSMM configuration → selected immutable runtime revision/u);
  assert.match(profiles, /Saving.*does not activate/iu);
  assert.match(profiles, /Only after the pointer commit succeeds may the current in-memory selection change/u);
  assert.match(profiles, /Every existing live Agent, including a blank one, retains/u);
  assert.match(profiles, /Native children inherit their parent's snapshot/u);
  assert.match(profiles, /cold-resumed sessions admit the currently selected immutable revision/u);
  assert.match(profiles, /no cross-restart historical per-session settings guarantee/u);
  assert.match(profiles, /No operation rewrites `cordis\.patch\.yml`/u);
  assert.match(profiles, /no model-visible profile-management tools.*anonymous endpoints or authentication bypasses/iu);
});

test("runtime-recovery documentation ships the supported recovery contract", () => {
  const runtimeRecovery = readFileSync(join(packageRoot, "docs", "runtime-recovery.md"), "utf8");

  assert.match(runtimeRecovery, /enabled:\s*false/u);
  assert.match(runtimeRecovery, /retryOnStatusCodes:\s*\[429, 500, 502, 503, 504\]/u);
  assert.match(runtimeRecovery, /retryOnCodes:\s*\[\]/u);
  assert.match(runtimeRecovery, /fallbackRoutes:\s*\[\]/u);
  assert.match(runtimeRecovery, /maxFallbackAttempts:\s*2/u);
  assert.match(runtimeRecovery, /maxContinuations:\s*3/u);
  assert.match(runtimeRecovery, /Continue the current task from the durable goal or unfinished todo list\. Do not repeat completed work\./u);
  assert.match(runtimeRecovery, /0\.\.10/u);
  assert.match(runtimeRecovery, /restart-scoped/i);
  assert.match(runtimeRecovery, /disabled.*(?:isolated|does not disable).*prompts.*skills.*guards.*LSP.*model routing/is);
  assert.match(runtimeRecovery, /host.*agent\/request-error.*decision.*wins by identity/is);
  assert.match(runtimeRecovery, /exact integer status.*lowercased exact code/is);
  assert.match(runtimeRecovery, /no message parsing/i);
  assert.match(runtimeRecovery, /failed provider.*latest request header/is);
  assert.match(runtimeRecovery, /attempted routes.*durable.*headers/is);
  assert.match(runtimeRecovery, /configured order/i);
  assert.match(runtimeRecovery, /one-shot.*agent,?\s*turn,?\s*step/is);
  assert.match(runtimeRecovery, /no timer.*provider call/is);
  assert.match(runtimeRecovery, /pending fallback route after native request selection/is);
  assert.match(runtimeRecovery, /named fallback effort.*preserved exactly.*omission clears stale.*reasoningEffort/is);
  assert.match(runtimeRecovery, /final route.*recognizes only exact V4 Pro or native V41 Flash route/is);
  assert.match(runtimeRecovery, /current-turn todo.*pending.*in_progress.*latest active goal/is);
  assert.match(runtimeRecovery, /cap.*live agent.*turn/is);
  assert.match(runtimeRecovery, /steering failure.*consumes.*attempt.*sanitized warn.*fail-open/is);
  assert.match(runtimeRecovery, /cold restart/i);
  assert.match(runtimeRecovery, /no continuation until.*user.*host.*resumes a turn/is);
  assert.match(runtimeRecovery, /continuable.*one-shot/i);
  assert.match(runtimeRecovery, /subagent\/end.*live(?:-| )only/is);
  assert.match(runtimeRecovery, /native durable descriptor and child control\/session surfaces/is);
  assert.match(runtimeRecovery, /Explicitly continue a known continuable child/is);
  assert.match(runtimeRecovery, /no fake.*llm\/retry/i);
  assert.match(runtimeRecovery, /no timers?/i);
  assert.match(runtimeRecovery, /no cross-process automatic retry/i);
  assert.match(runtimeRecovery, /no provider discovery/i);
  assert.match(runtimeRecovery, /no provider-message (?:parsing|classification)/i);
  assert.match(runtimeRecovery, /no automatic parent followup/i);
});

test("source entry exports a dsh plugin function and config schema", async () => {
  const mod = await import("../lib/index.js");
  assert.equal(mod.name, "dsmm");
  assert.deepEqual(mod.inject, ["profileContext"]);
  assert.equal(typeof mod.Config, "function");
  assert.equal(typeof mod.Config.toJSON, "function");
  assert.equal(typeof mod.apply, "function");
  assert.deepEqual(mod.default, { name: mod.name, inject: mod.inject, Config: mod.Config, apply: mod.apply });
  for (const name of [
    "classifyModelFamily",
    "desiredDeepseekEffort",
    "isDeepseekV4ProRoute",
    "registerModelRouting",
    "selectAdvertisedEffort",
    "resolveSelectedAgentPreset",
    "classifyRecoveryFailure",
    "foldAttemptedRecoveryRoutes",
    "foldDurableRecoveryWork",
    "selectFallbackRoute",
    "registerRuntimeRecovery"
  ]) {
    assert.equal(typeof mod[name as keyof typeof mod], "function", name);
  }
  assert.equal(mod.DSMM_STATUS_COMMAND, "dsmm-status");
  assert.equal(mod.DSMM_STATUS_VERSION, 1);
  assert.equal(typeof mod.createDsmmStatusSnapshot, "function");
  assert.equal(typeof mod.formatDsmmStatus, "function");
  assert.equal(typeof mod.registerDsmmStatusCommand, "function");
  assert.equal(existsSync(join(packageRoot, "lib", "status.js")), true);
  assert.equal(existsSync(join(packageRoot, "lib", "status.d.ts")), true);
});

test("preset-scoped skill plugin source entry exposes its Cordis contract", async () => {
  const mod = await import("../lib/preset-skills.js");

  assert.equal(mod.name, "dsmm/preset-skills");
  assert.deepEqual(mod.inject, ["skills"]);
  assert.equal(typeof mod.Config, "function");
  assert.equal(typeof mod.apply, "function");
  assert.equal(mod.default, mod.apply);
});

test("source includes the deepwork session event augmentation", () => {
  const declarations = readFileSync(join(packageRoot, "src", "dsh-events.ts"), "utf8");
  const entrypoint = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

  assert.match(declarations, /deepwork\/mode/);
  assert.match(entrypoint, /dsh-events\.js/);
});

test("source entry declares the public runtime-recovery type contract", () => {
  const entrypoint = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

  for (const name of [
    "RecoveryFailureDecision",
    "DurableRecoveryWork",
    "DsmmRecoveryRoute",
    "DsmmRuntimeRecoverySettings",
    "DshLlmFailure",
    "DshEpochHeader",
    "AgentRequestErrorFrame",
    "DshRequestErrorAction",
    "AgentTurnStoppingFrame",
    "DshStepBoundaryEventData",
    "DshRequestHeaderEventData",
    "DshTodoItem",
    "DshTodoWriteEventData",
    "DshGoalSnapshot",
    "DshGoalChangeEventData"
  ]) {
    assert.match(entrypoint, new RegExp(`export type \\{[^}]*\\b${name}\\b`, "u"), name);
  }
});

test("source and generated root entry declare the public status type contract", () => {
  const sourceEntrypoint = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");
  const generatedEntrypoint = readFileSync(join(packageRoot, "lib", "index.d.ts"), "utf8");
  const generatedStatusRuntime = readFileSync(join(packageRoot, "lib", "status.js"), "utf8");
  const generatedStatusDeclarations = readFileSync(join(packageRoot, "lib", "status.d.ts"), "utf8");

  assert.match(sourceEntrypoint, /export type \{ DsmmStatusSnapshot \} from "\.\/status\.js"/u);
  assert.match(generatedEntrypoint, /export \{ DSMM_STATUS_COMMAND, registerDsmmStatusCommand \} from "\.\/commands\.js"/u);
  assert.match(generatedEntrypoint, /export \{ DSMM_STATUS_VERSION, createDsmmStatusSnapshot, formatDsmmStatus \} from "\.\/status\.js"/u);
  assert.match(generatedEntrypoint, /export type \{ DsmmStatusSnapshot \} from "\.\/status\.js"/u);
  assert.match(generatedStatusRuntime, /export const DSMM_STATUS_VERSION = 1;/u);
  assert.match(generatedStatusDeclarations, /export declare const DSMM_STATUS_VERSION: 1;/u);
  assert.match(generatedStatusDeclarations, /export interface DsmmStatusSnapshot/u);
});

test("compiled package includes native client and profile runtime assets without deployment definitions", () => {
  for (const name of ["profiles", "profile-types", "profile-store", "profile-runtime", "profile-rpc", "profile-remote", "session-metadata", "session-persistence"]) {
    for (const extension of ["js", "d.ts"]) {
      assert.equal(existsSync(join(packageRoot, "lib", `${name}.${extension}`)), true, `${name}.${extension}`);
    }
  }
  assert.equal(existsSync(join(packageRoot, "lib", "client.js")), true);
  assert.equal(existsSync(join(packageRoot, "lib", "client", "index.d.ts")), true);
  const patch = readFileSync(join(packageRoot, "cordis.patch.yml"), "utf8");
  assert.doesNotMatch(patch, /^\s*(?:profiles|runtimeProfiles|selectedProfile|profileDefinitions):/mu);
  const remote = readFileSync(join(packageRoot, "lib", "profile-remote.js"), "utf8");
  assert.match(remote, /TYPERT_REMOTE/u);
  assert.match(remote, /TYPERT_HOST/u);
  assert.doesNotMatch(remote, /["']node:|profile-store\.js|settings\.js/u, "remote descriptor is browser-safe wire data, not Host configuration");
  const rpc = readFileSync(join(packageRoot, "lib", "profile-rpc.js"), "utf8");
  assert.match(rpc, /typert\.register\(TYPERT_HOST\)/u);
  assert.match(rpc, /invocation\.peer/u, "profile management requires a native authenticated invocation peer");
});
