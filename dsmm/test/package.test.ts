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
  DsmmRuntimeRecoverySettings,
  DurableRecoveryWork,
  RecoveryFailureDecision
} from "../lib/index.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const publicRuntimeRecoveryTypes = null as unknown as [
  RecoveryFailureDecision,
  DurableRecoveryWork,
  DsmmRecoveryRoute,
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

  assert.equal(pkg.name, "dsmm");
  assert.equal(pkg.version, "1.0.0");
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
    "./package.json": "./package.json"
  });
  assert.deepEqual(pkg.files, [
    "lib/**/*.js",
    "lib/**/*.d.ts",
    "agent-presets",
    "docs/agent-presets.md",
    "docs/compatibility.md",
    "docs/design.md",
    "docs/lsp.md",
    "docs/migration-from-ocmm.md",
    "docs/model-routing.md",
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
  assert.deepEqual(pkg.dependencies, { "@deepseek-ai/schemastery": "^3.18.1" });
  assert.equal(pkg.scripts["smoke:docker:build"], "docker build --build-arg DSH_PACKAGE=@deepseek-ai/dsh@0.1.1-rc.2 -f docker/Dockerfile.smoke -t dsmm-dsh-smoke:0.1 ..");
  assert.equal(pkg.scripts["check:release"], "node scripts/check-release-readiness.mjs");
  assert.equal(Object.hasOwn(pkg, "browser"), false);
  assert.equal(Object.keys(pkg.exports).some((key) => key.includes("client")), false);
  assert.equal(Object.keys(pkg.scripts).some((key) => key.includes("client")), false);

  for (const packageSection of [pkg.dependencies, pkg.peerDependencies, pkg.devDependencies]) {
    assert.equal(Object.keys(packageSection).some((name) => /react/i.test(name)), false);
  }
  for (const packageSection of [pkg.peerDependencies, pkg.devDependencies]) {
    assert.equal(packageSection["@deepseek-ai/cordis"], "^4.0.1");
    for (const name of ["attachment", "brand", "invariants", "llm", "timeout"]) {
      assert.equal(packageSection[`@deepseek-ai/dsh-${name}`], "^0.1.1-rc.2");
    }
  }

  assert.deepEqual(pkg.dsh, { bundle: { patch: "./cordis.patch.yml" } });
});

test("README local documentation links are shipped by the package", () => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
  const localDocs = [...new Set([...readme.matchAll(/\[[^\]]+\]\((docs\/[^)#]+)\)/gu)].map((match) => match[1]))];

  assert.deepEqual(localDocs, ["docs/agent-presets.md", "docs/safety-guards.md", "docs/lsp.md", "docs/model-routing.md", "docs/runtime-recovery.md", "docs/settings-status.md"]);
  const releaseDocs = ["docs/compatibility.md", "docs/migration-from-ocmm.md", "docs/releasing.md"];
  assert.ok(readme.indexOf("[compatibility]: docs/compatibility.md") > readme.indexOf("(docs/settings-status.md)"));
  assert.ok(readme.indexOf("[migration]: docs/migration-from-ocmm.md") > readme.indexOf("[compatibility]: docs/compatibility.md"));
  assert.ok(readme.indexOf("[releasing]: docs/releasing.md") > readme.indexOf("[migration]: docs/migration-from-ocmm.md"));
  assert.match(readme, /^## v0\.8 settings and status$/mu);
  assert.match(readme, /\/dsmm-status\r?\n\/dsmm-status json/u);
  assert.match(readme, /existing dsh Web command UI/i);
  assert.match(readme, /Headless profiles remain file-configured/i);
  assert.match(readme, /future TUI/i);
  for (const path of [...localDocs, ...releaseDocs]) {
    assert.ok(pkg.files.includes(path), `${path} is included in package files`);
    assert.equal(existsSync(join(packageRoot, path)), true, `${path} exists`);
  }
});

test("settings-status documentation ships the v0.8 status and settings contract", () => {
  const settingsStatus = readFileSync(join(packageRoot, "docs", "settings-status.md"), "utf8");

  assert.deepEqual(
    [...settingsStatus.matchAll(/^## (.+)$/gmu)].map((match) => match[1]),
    ["Command", "Snapshot contract", "Web loopback", "Headless settings", "Future TUI", "Boundaries"]
  );
  assert.match(settingsStatus, /\/dsmm-status\b/u);
  assert.match(settingsStatus, /\/dsmm-status json/u);
  assert.match(settingsStatus, /empty input.*human/i);
  assert.match(settingsStatus, /lowercase `json`.*versioned JSON/is);
  assert.match(settingsStatus, /Usage: \/dsmm-status \[json\]/u);
  assert.match(settingsStatus, /mode.*scope.*route.*calibration.*runtime recovery.*idle continuation/is);
  assert.match(settingsStatus, /prompt|error/is);
  assert.match(settingsStatus, /version.*1/is);
  assert.match(settingsStatus, /policyEffort.*desired.*not.*adapter/is);
  assert.match(settingsStatus, /defensive copy/i);
  assert.match(settingsStatus, /existing host command UI/i);
  assert.match(settingsStatus, /settings\.describe.*independent/i);
  assert.match(settingsStatus, /no custom.*card.*panel.*client bundle/is);
  assert.match(settingsStatus, /\$DSH_HOME\/settings\.yaml/u);
  assert.match(settingsStatus, /profile files/i);
  assert.match(settingsStatus, /dump-config/i);
  assert.match(settingsStatus, /pinned headless.*no interactive command adapter/is);
  assert.match(settingsStatus, /rc\.2.*no official TUI.*private bridge/is);
  assert.match(settingsStatus, /no provider.*capability.*network lookup/is);
  assert.match(settingsStatus, /no process-local.*pending.*count exposure/is);
  assert.match(settingsStatus, /settings writes.*file.*DSH-owned/is);

  for (const line of [
    "modeName: deepwork",
    "defaultActive: false",
    "promptOrder: 50",
    "deepseekV4ProCalibration: auto",
    "deepseekV4ProDefaultReasoningEffort: high",
    "- dsmm-plan-critic",
    "- dsmm-reviewer",
    "brainstorming: true",
    "writing-plans: true",
    "requesting-code-review: true",
    "receiving-code-review: true",
    "subagent-driven-development: true",
    "dispatching-parallel-agents: true",
    "remove-ai-slops: true",
    "dsmm-orchestrator: true",
    "dsmm-planner: true",
    "dsmm-plan-critic: true",
    "dsmm-reviewer: true",
    "dsmm-code-search: true",
    "dsmm-doc-search: true",
    "dsmm-clarifier: true",
    "dsmm-media-reader: true",
    "materialize: false",
    "strictGates: true",
    "reviewCap: 5",
    "finalReviewPolicy: simple-oracle-complex-reviewer",
    "scope: deepwork-or-dsmm-agent",
    "shellCommandSafety: true",
    "gitWriteGuard: ask",
    "maxInlineBytes: 12000",
    "planFormatValidation: true",
    "maxLabelChars: 30",
    "todoDisciplineHelper: true",
    "retryOnStatusCodes: [429, 500, 502, 503, 504]",
    "retryOnCodes: []",
    "fallbackRoutes: []",
    "maxFallbackAttempts: 2",
    "maxContinuations: 3",
    "Continue the current task from the durable goal or unfinished todo list. Do not repeat completed work.",
    "serverName: dsmm_lsp",
    "command: ocmm-lsp",
    "args: [mcp]",
    "cwd: \"\"",
    "env: {}",
    "toolCallTimeoutMs: 60000",
    "failOnStartupError: true"
  ]) {
    assert.ok(settingsStatus.includes(line), line);
  }
  assert.match(settingsStatus, /presets\.root.*omitted when unset/i);
  assert.match(settingsStatus, /restart-scoped/i);
});

test("model-routing documentation ships the exact calibration contract", () => {
  const modelRouting = readFileSync(join(packageRoot, "docs", "model-routing.md"), "utf8");

  assert.match(modelRouting, /active deepwork mode or a selected DSMM preset/i);
  assert.match(modelRouting, /deepseek-official\/deepseek-v4-pro/u);
  assert.match(modelRouting, /deepseekV4ProCalibration: auto/u);
  assert.match(modelRouting, /deepseekV4ProDefaultReasoningEffort: high/u);
  assert.match(modelRouting, /deepseekV4ProMaxReasoningPresets: dsmm-plan-critic, dsmm-reviewer/u);
  assert.match(modelRouting, /auto.*preserv(?:e|es) explicit.*strict.*override/is);
  assert.match(modelRouting, /max → high → valid defaultEffort → unchanged/u);
  assert.match(modelRouting, /exact desired → valid defaultEffort → unchanged/u);
  assert.match(modelRouting, /one sanitized warning.*downstream config unchanged/is);
  assert.match(modelRouting, /no provider\/model switch.*text heuristic.*retry\/recovery/is);
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
  assert.match(runtimeRecovery, /downstream.*prepend.*model routing/is);
  assert.match(runtimeRecovery, /removes? stale.*reasoningEffort/is);
  assert.match(runtimeRecovery, /final exact official V4 Pro route/i);
  assert.match(runtimeRecovery, /current-turn todo.*pending.*in_progress.*latest active goal/is);
  assert.match(runtimeRecovery, /cap.*live agent.*turn/is);
  assert.match(runtimeRecovery, /steering failure.*consumes.*attempt.*sanitized warn.*fail-open/is);
  assert.match(runtimeRecovery, /cold restart/i);
  assert.match(runtimeRecovery, /no continuation until.*user.*host.*resumes a turn/is);
  assert.match(runtimeRecovery, /continuable.*one-shot/i);
  assert.match(runtimeRecovery, /subagent\/end.*live(?:-| )only/is);
  assert.match(runtimeRecovery, /parent.*subagent\/descriptor.*child.*durable.*turn\/end/is);
  assert.match(runtimeRecovery, /explicitly continue.*known child session/is);
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
  assert.deepEqual(mod.inject, ["systemPrompt"]);
  assert.equal(typeof mod.Config, "function");
  assert.equal(typeof mod.Config.toJSON, "function");
  assert.equal(typeof mod.apply, "function");
  assert.equal(mod.default, mod.apply);
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

test("package surface excludes browser and client artifacts", () => {
  assert.equal(existsSync(join(packageRoot, "DESIGN.md")), false);
  assert.equal(existsSync(join(dirname(packageRoot), "DESIGN.md")), false);
  assert.equal(existsSync(join(packageRoot, "client")), false);
  assert.equal(existsSync(join(packageRoot, "browser")), false);
});
