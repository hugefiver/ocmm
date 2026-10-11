import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { useIsolatedDshEnvironment } from "./dsh-test-environment.ts";

useIsolatedDshEnvironment();
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
  assert.equal(pkg.version, "0.2.0");
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
  assert.equal(pkg.scripts.build, "node scripts/materialize-frontend.mjs --check && tsc -p tsconfig.json && node scripts/build-client.mjs");
  assert.equal(pkg.scripts["build:client"], "node scripts/build-client.mjs");
  assert.equal(pkg.devDependencies.react, "^18.3.1");
  assert.equal(pkg.devDependencies["@types/react"], "^18.3.27");
  assert.equal(pkg.devDependencies.esbuild, "^0.25.12");
  assert.equal(Object.keys(pkg.dependencies).some((name) => /react|esbuild|playwright/iu.test(name)), false, "browser tooling is not a server runtime dependency");
  for (const packageSection of [pkg.peerDependencies, pkg.devDependencies]) {
    assert.equal(packageSection["@deepseek-ai/cordis"], "~4.0.4");
    for (const name of ["attachment", "brand", "invariants", "llm", "timeout", "subagent", "tools", "typert-protocol", "session", "session-persistence", "session-persistence-jsonl", "plan-mode", "compaction-basic", "command-compact", "compaction-tool-result-pruner", "tool-ask-user", "tool-todo"]) {
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

test("exported native plugin metadata displays DSMM Core in both languages without renaming the package", () => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  assert.equal(pkg.name, "@dsmm/dsmm");
  for (const language of ["en", "zh"]) {
    const resource = `locale/${language}.json`;
    assert.equal(pkg.exports[`./${resource}`], `./${resource}`);
    const metadata = JSON.parse(readFileSync(join(packageRoot, resource), "utf8"));
    assert.deepEqual(Object.keys(metadata), ["meta"]);
    assert.deepEqual(Object.keys(metadata.meta).sort(), ["description", "title"]);
    assert.equal(metadata.meta.title, "DSMM");
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
  for (const path of localDocs) {
    assert.ok(pkg.files.includes(path), `${path} is included in package files`);
    assert.equal(existsSync(join(packageRoot, path)), true, `${path} exists`);
  }
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

test("legacy preset skill entry retains a no-op Cordis contract; runtime mounts are Agent-scoped", async () => {
  const mod = await import("../lib/preset-skills.js");

  assert.equal(mod.name, "dsmm/preset-skills");
  assert.deepEqual(mod.inject, []);
  assert.equal(typeof mod.registerAgentSkills, "function");
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
