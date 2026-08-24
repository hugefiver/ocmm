import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("Docker smoke assets are documented and isolated", () => {
  const dockerfile = join(packageRoot, "docker", "Dockerfile.smoke");
  const script = join(packageRoot, "scripts", "docker-smoke.mjs");
  const localPlan = join(packageRoot, "docs", "implementation-plan-v0.1.md");
  const agentPresetDocs = join(packageRoot, "docs", "agent-presets.md");
  const examplePatch = join(packageRoot, "patches", "agent-presets-root.example.cordis.patch.yml");
  const lspDocs = join(packageRoot, "docs", "lsp.md");
  const lspExamplePatch = join(packageRoot, "patches", "ocmm-lsp-mcp.example.cordis.patch.yml");
  const lspFixture = join(packageRoot, "scripts", "lsp-smoke-fixture.mjs");
  const lspSmoke = join(packageRoot, "scripts", "lsp-mcp-smoke.mjs");
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
  const dockerfileText = readFileSync(dockerfile, "utf8");
  const scriptText = readFileSync(script, "utf8");
  const lspFixtureText = readFileSync(lspFixture, "utf8");
  const lspSmokeText = readFileSync(lspSmoke, "utf8");
  const docsText = readFileSync(agentPresetDocs, "utf8");
  const patchText = readFileSync(examplePatch, "utf8");
  const lspPatchText = readFileSync(lspExamplePatch, "utf8");

  assert.equal(existsSync(dockerfile), true);
  assert.equal(existsSync(script), true);
  assert.equal(existsSync(localPlan), true);
  assert.equal(existsSync(agentPresetDocs), true);
  assert.equal(existsSync(examplePatch), true);
  assert.equal(existsSync(lspDocs), true);
  assert.equal(existsSync(lspExamplePatch), true);
  assert.equal(existsSync(lspFixture), true);
  assert.equal(existsSync(lspSmoke), true);
  assert.ok(pkg.files.includes("agent-presets"));
  assert.ok(pkg.files.includes("patches"));
  assert.match(dockerfileText, /FROM node:22-bookworm-slim/);
  assert.match(dockerfileText, /FROM rust:.* AS lsp-builder/);
  assert.match(dockerfileText, /cargo build --release -p ocmm-lsp/);
  assert.match(dockerfileText, /COPY --from=lsp-builder .*\/ocmm-lsp \/usr\/local\/bin\/ocmm-lsp/);
  assert.match(dockerfileText, /ARG DSH_PACKAGE=@deepseek-ai\/dsh@0\.1\.1-rc\.2/);
  assert.doesNotMatch(dockerfileText, /@deepseek-ai\/dsh@latest/);
  assert.match(dockerfileText, /COPY dsmm \.\/dsmm/);
  assert.doesNotMatch(dockerfileText, /^ENV npm_config_auto_install_peers=/mu);
  assert.match(dockerfileText, /corepack enable/);
  assert.match(dockerfileText, /autoInstallPeers: false/);
  assert.match(dockerfileText, /pnpm run build/);
  assert.match(dockerfileText, /npm install -g \$\{DSH_PACKAGE\}/);
  assert.doesNotMatch(dockerfileText, /ENV DSH_HOME=/);
  assert.doesNotMatch(dockerfileText, /ENV DSMM_MANAGED_PRESETS_ROOT=/);
  assert.match(dockerfileText, /ENV DSMM_DOCKER_INNER=1/);
  assert.match(dockerfileText, /CMD \["node", "dsmm\/scripts\/docker-smoke\.mjs"\]/);
  assert.match(scriptText, /fileURLToPath\(new URL\("\.\.", import\.meta\.url\)\)/);
  assert.match(scriptText, /DSMM_DOCKER_INNER/);
  assert.match(scriptText, /spawnSync\("docker"/);
  assert.match(scriptText, /DSH_PACKAGE=@deepseek-ai\/dsh@0\.1\.1-rc\.2/);
  assert.doesNotMatch(scriptText, /@deepseek-ai\/dsh@latest/);
  assert.match(scriptText, /randomUUID\(\)/);
  assert.match(scriptText, /"image", "rm", imageTag/);
  assert.doesNotMatch(scriptText, /dsmm-dsh-smoke:0\.1/);
  assert.match(scriptText, /spawnSync\("pnpm", \["--dir", root, "pack", "--pack-destination", workspace\],/);
  assert.match(scriptText, /\^dsmm-\.\+\\\.tgz\$/);
  assert.match(scriptText, /"plugin", "--profile", "dsmm-smoke", "add", tarball/);
  assert.match(scriptText, /PNPM_CONFIG_AUTO_INSTALL_PEERS: "true"/);
  assert.match(scriptText, /createRequire\(join\(home, "profiles", "dsmm-smoke", "package\.json"\)\)/);
  assert.match(scriptText, /resolve\("dsmm"\)/);
  assert.match(scriptText, /resolve\("dsmm\/preset-skills"\)/);
  assert.match(scriptText, /basename\(dsmmEntry\) !== "index\.js"/);
  assert.match(scriptText, /basename\(dirname\(dsmmEntry\)\) !== "lib"/);
  assert.match(scriptText, /dirname\(dirname\(dsmmEntry\)\)/);
  assert.doesNotMatch(scriptText, /join\(root, "lib", "(?:index|skills)\.js"\)/);

  for (const packageName of [
    "@deepseek-ai/dsh-settings",
    "@deepseek-ai/dsh-commands",
    "@deepseek-ai/dsh-session",
    "@deepseek-ai/dsh-system-prompt",
    "@deepseek-ai/dsh-skill",
    "@deepseek-ai/dsh-tools",
    "@deepseek-ai/dsh-agent-presets"
  ]) {
    assert.ok(scriptText.includes(`importDshPackage("${packageName}")`), `missing packaged runtime import for ${packageName}`);
  }

  for (const symbol of [
    "SettingsProvider",
    "SessionStore",
    "SessionId",
    "SystemPrompt",
    "renderPrompt",
    "SkillRegistry",
    "isModelInvocable",
    "ToolRuntime",
    "defineTool",
    "CommandRuntime",
    "AgentRegistry",
    "AgentLoop",
    "AgentPresets",
    "assembleContextFor",
    "CallId"
  ]) {
    assert.match(scriptText, new RegExp(`\\b${symbol}\\b`, "u"));
  }

  for (const marker of [
    "PACKAGED_DSMM_RESOLVED",
    "ORDINARY_ISOLATED",
    "DEEPWORK_BODIES_ONCE",
    "PRESET_SCOPED_SKILLS",
    "HEADER_GUARD_ACTIVE",
    "DOWNSTREAM_DENY_WINS",
    "POST_EXECUTE_TRUNCATED",
    "LSP_DIAGNOSTIC_OK",
    "DSMM_PACKAGED_RUNTIME_SMOKE_OK"
  ]) {
    assert.match(scriptText, new RegExp(`console\\.log\\("${marker}"\\)`, "u"));
    assert.equal(scriptText.split(`console.log("${marker}")`).length - 1, 1, `${marker} must print exactly once`);
  }

  const innerBranch = scriptText.indexOf('if (process.env.DSMM_DOCKER_INNER !== "1")');
  assert.notEqual(innerBranch, -1);
  assert.equal(scriptText.slice(0, innerBranch).includes("mkdtempSync("), false);
  const pinnedRequireDeclaration = scriptText.indexOf("let pinnedDshRequire;");
  assert.notEqual(pinnedRequireDeclaration, -1);
  assert.ok(pinnedRequireDeclaration < innerBranch, "pinned DSH resolver state must initialize before top-level smoke execution");
  assert.match(scriptText, /class MemorySettings extends SettingsProvider/);
  assert.match(scriptText, /doc = \{\};/);
  assert.match(scriptText, /get writable\(\) \{\s*return true;/s);
  assert.match(scriptText, /load\(\) \{\s*return Promise\.resolve\(structuredClone\(this\.doc\)\);/s);
  assert.match(scriptText, /persist\(namespace, section\) \{\s*this\.doc\[namespace\] = structuredClone\(section\);/s);

  const coreMounts = [
    "ctx.plugin(MemorySettings)",
    "ctx.plugin(runtime.LLM)",
    "ctx.plugin(runtime.SessionStore)",
    "ctx.plugin(runtime.SystemPrompt",
    "ctx.plugin(runtime.SkillRegistry)",
    "ctx.plugin(runtime.ToolRuntime)",
    "ctx.plugin(runtime.CommandRuntime)",
    "ctx.plugin(runtime.AgentRegistry)",
    "ctx.plugin(runtime.AgentLoop",
    "ctx.plugin(dsmm.default"
  ];
  let priorMount = -1;
  for (const mount of coreMounts) {
    const location = scriptText.indexOf(mount);
    assert.ok(location > priorMount, `${mount} is absent or out of order`);
    priorMount = location;
  }
  const settleNestedFibers = scriptText.indexOf("ctx.registry.values()", priorMount);
  const createOrdinaryAgent = scriptText.indexOf("ctx.agents.create(", settleNestedFibers);
  assert.ok(settleNestedFibers > priorMount, "nested plugin fibers must settle after mounting dsmm");
  assert.ok(createOrdinaryAgent > settleNestedFibers, "runtime agents must be created only after nested plugin fibers settle");
  assert.match(scriptText.slice(settleNestedFibers, createOrdinaryAgent), /fiber\.await\(\)/);

  assert.match(scriptText, /ctx\.agents\.create\(/);
  assert.match(scriptText, /ctx\.systemPrompt\.assemble\(/);
  assert.match(scriptText, /ctx\.skills\.list\(\{ scope: agent, cwd: agent\.session\.header\.cwd \}\)/);
  assert.match(scriptText, /ctx\.plugin\(runtime\.Loader\)/);
  assert.match(scriptText, /ctx\.loader\.builtins\.include = runtime\.Include/);
  assert.match(scriptText, /ctx\.plugin\(runtime\.AgentPresets/);
  assert.match(scriptText, /ctx\.agentPresets\.mount\(agentCtx, "dsmm-reviewer"\)/);
  assert.match(scriptText, /ctx\.commands\.execute\([^)]*"\/deepwork inspect repo"/s);
  assert.match(scriptText, /ctx\.tools\.execute\(/);
  assert.match(scriptText, /"tools\/pre-execute"/);
  assert.match(scriptText, /downstream smoke policy/);
  assert.match(scriptText, /git commit -m smoke/);
  assert.match(scriptText, /"x"\.repeat\(20_000\)/);
  assert.match(scriptText, /\[dsmm safety\] truncated/);
  assert.match(scriptText, /agentPreset: "dsmm-reviewer"/);
  assert.match(scriptText, /gitWriteGuard: "deny"/);
  assert.match(scriptText, /finally/);
  assert.match(scriptText, /ctx\.fiber\.dispose\(\)/);
  assert.match(scriptText, /fixture\.cleanup\(\)/);
  assert.match(scriptText, /rmSync\(home, \{ recursive: true, force: true/);
  assert.match(scriptText, /rmSync\(workspace, \{ recursive: true, force: true/);
  assert.match(scriptText, /throw new AggregateError\(cleanupErrors/);
  assert.match(scriptText, /lsp-mcp-smoke\.mjs/);
  assert.match(scriptText, /@deepseek-ai\/dsh-mcp-client/);
  assert.match(scriptText, /await ctx\.plugin\(mcpClient,/);
  assert.doesNotMatch(scriptText, /mcpClient\.default/);
  assert.match(scriptText, /mcp__dsmm_lsp__diagnostics/);
  assert.match(lspSmokeText, /tools\/list/);
  assert.match(lspSmokeText, /diagnostics/);
  assert.match(lspSmokeText, /tools\/call/);
  assert.match(lspFixtureText, /textDocument\/publishDiagnostics/);
  assert.match(readme, /pnpm --filter dsmm smoke:docker/);
  assert.match(readme, /docs\/agent-presets\.md/);
  assert.match(readme, /docs\/lsp\.md/);
  assert.match(docsText, /materialization is disabled by default/i);
  assert.match(docsText, /replace(?:s)? the whole `agent-presets` config/i);
  assert.match(docsText, /default: standard/);
  assert.match(patchText, /Example only/);
  assert.match(patchText, /default: standard/);
  assert.match(patchText, /includeUserRoot: true/);
  assert.match(lspPatchText, /@deepseek-ai\/dsh-mcp-client/);
});
