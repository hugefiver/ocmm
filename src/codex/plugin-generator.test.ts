import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { isAbsolute, join } from "node:path"

import { defaultConfig } from "../config/schema.ts"
import {
  buildCodexAgents,
  CODEX_AGENT_PREFIX,
  CODEX_MARKETPLACE_NAME,
  CODEX_PLUGIN_DIR,
  CODEX_PLUGIN_NAME,
  CODEX_PROJECT_AGENTS_DIR,
  CODEX_WORKFLOW_SKILL_NAME,
  createCodexMcpManifest,
  createMarketplaceManifest,
  createPluginManifest,
  createPluginRuntimePackage,
  generateCodexPlugin,
  stageCodexRuntime,
} from "./plugin-generator.ts"

function extractDelegationContract(instructions: string): string {
  const match = instructions.match(/<ocmm-delegation-contract>([\s\S]*?)<\/ocmm-delegation-contract>/)
  assert.ok(match, "generated instructions are missing the delegation contract")
  return match[1]!
}

test("Codex manifest declares deepwork plugin resources", () => {
  const manifest = createPluginManifest("1.2.3")

  assert.equal(manifest.name, CODEX_PLUGIN_NAME)
  assert.equal(manifest.version, "1.2.3")
  assert.equal(manifest.skills, "./skills/")
  assert.equal(manifest.mcpServers, "./.mcp.json")
  assert.equal((manifest.interface as Record<string, unknown>).displayName, "Deepwork")
  assert.match(String(manifest.description), /deepwork/)
})

test("Codex plugin runtime package enables ESM wrappers", () => {
  const manifest = createPluginRuntimePackage("1.2.3")

  assert.equal(manifest.name, "deepwork-codex-plugin-runtime")
  assert.equal(manifest.version, "1.2.3")
  assert.equal(manifest.private, true)
  assert.equal(manifest.type, "module")
})

test("Codex marketplace points at the local plugins/deepwork bundle", () => {
  const marketplace = createMarketplaceManifest()

  assert.equal(marketplace.name, CODEX_MARKETPLACE_NAME)
  const plugins = marketplace.plugins as Array<Record<string, unknown>>
  assert.equal(plugins[0]?.name, CODEX_PLUGIN_NAME)
  assert.deepEqual(plugins[0]?.source, { source: "local", path: "./plugins/deepwork" })
})

test("Codex MCP manifest uses Codex server shape", () => {
  const cfg = {
    ...defaultConfig(),
    disabledMcps: ["websearch", "lsp"],
    mcp: {
      ...defaultConfig().mcp,
      servers: {
        docs: { type: "remote" as const, url: "https://docs.example/mcp", enabled: true },
        local: { type: "local" as const, command: ["node", "server.js"], enabled: true },
      },
    },
  }

  const manifest = createCodexMcpManifest(cfg, process.cwd())

  assert.equal((manifest.mcpServers.docs as Record<string, unknown>).url, "https://docs.example/mcp")
  assert.equal((manifest.mcpServers.local as Record<string, unknown>).command, "node")
  assert.deepEqual((manifest.mcpServers.local as Record<string, unknown>).args, ["server.js"])
  assert.equal(manifest.mcpServers.websearch, undefined)
})

test("Codex MCP manifest publishes plugin-local ocmm-lsp by default", () => {
  const manifest = createCodexMcpManifest(
    defaultConfig(),
    process.cwd(),
    join(process.cwd(), CODEX_PLUGIN_DIR),
  )
  const lsp = manifest.mcpServers.lsp as Record<string, unknown>

  assert.equal(lsp.command, "node")
  assert.deepEqual(lsp.args, ["./dist/cli/ocmm-lsp.js", "mcp"])
  assert.equal(lsp.cwd, ".")

  const serialized = JSON.stringify(lsp)
  assert.doesNotMatch(serialized, /\.\.[\\/]\.\./)
  assert.doesNotMatch(serialized, /target[\\/]release/)
  assert.doesNotMatch(serialized, /crates[\\/]ocmm-lsp/)
  assert.equal(serialized.includes(process.cwd()), false)
})

test("stageCodexRuntime copies the LSP wrapper runtime into the plugin", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codex-runtime-root-"))
  const pluginRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-runtime-plugin-"))
  try {
    mkdirSync(join(root, "dist", "cli"), { recursive: true })
    mkdirSync(join(root, "dist", "shared"), { recursive: true })
    mkdirSync(join(root, "dist", "bin"), { recursive: true })
    writeFileSync(join(root, "dist", "cli", "ocmm-lsp.js"), "import '../shared/ocmm-lsp-binary.js'\n")
    writeFileSync(join(root, "dist", "shared", "ocmm-lsp-binary.js"), "export {}\n")
    writeFileSync(join(root, "dist", "bin", "ocmm-lsp-test"), "binary\n")

    stageCodexRuntime(root, pluginRoot)

    assert.equal(existsSync(join(pluginRoot, "dist", "cli", "ocmm-lsp.js")), true)
    assert.equal(existsSync(join(pluginRoot, "dist", "shared", "ocmm-lsp-binary.js")), true)
    assert.equal(existsSync(join(pluginRoot, "dist", "bin", "ocmm-lsp-test")), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(pluginRoot, { recursive: true, force: true })
  }
})

test("Codex MCP manifest preserves explicit lsp overrides", () => {
  const cfg = {
    ...defaultConfig(),
    mcp: {
      ...defaultConfig().mcp,
      servers: {
        lsp: { type: "local" as const, command: "custom-lsp", args: ["mcp"], enabled: true },
      },
    },
  }

  const manifest = createCodexMcpManifest(cfg, process.cwd())
  const lsp = manifest.mcpServers.lsp as Record<string, unknown>

  assert.equal(lsp.command, "custom-lsp")
  assert.deepEqual(lsp.args, ["mcp"])
})

test("Codex agents are generated from Deepwork prompts and Codex-compatible fallback models", async () => {
  const agents = await buildCodexAgents({
    config: { ...defaultConfig(), workflow: "codex" },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })

  const orchestrator = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-orchestrator`)
  const builder = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-builder`)
  const planner = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-planner`)
  const deep = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-deep`)
  const documenting = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-documenting`)
  const oracle = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-oracle`)
  const oracleHigh = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-oracle-high`)
  const reviewer = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-reviewer`)
  const creative = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-creative`)

  assert.ok(orchestrator)
  assert.equal(orchestrator.model, "gpt-5.5")
  assert.equal(orchestrator.reasoningEffort, "high")
  assert.match(orchestrator.developerInstructions, /Agent Role: orchestrator|DEEPWORK MODE ENABLED/)
  assert.match(orchestrator.developerInstructions, /Codex tool compatibility/)
  assert.match(orchestrator.developerInstructions, /GPT-5\.6 EXECUTION CALIBRATION/)
  assert.match(orchestrator.developerInstructions, /Apply this layer only when the selected model identifies as part of the GPT-5\.6 family/)
  assert.ok(builder)
  assert.equal(builder.model, "gpt-5.5")
  assert.ok(planner)
  assert.equal(planner.reasoningEffort, "xhigh")
  assert.ok(deep)
  assert.equal(deep.reasoningEffort, "xhigh")
  assert.ok(documenting)
  assert.equal(documenting.model, "gpt-5.5")
  assert.ok(oracle)
  assert.equal(oracle.sourceName, "oracle")
  assert.equal(oracle.reasoningEffort, "xhigh")
  assert.ok(oracleHigh)
  assert.equal(oracleHigh.sourceName, "oracle-high")
  assert.equal(oracleHigh.reasoningEffort, "xhigh")
  assert.ok(reviewer)
  assert.equal(reviewer.sourceName, "reviewer")
  assert.equal(reviewer.reasoningEffort, "xhigh")
  // oracle is now an independent builtin with its own dedicated fallback chain,
  // distinct from reviewer (gpt-first chain). With default config both resolve to a
  // Codex-compatible model, but they must not be identical objects.
  assert.notEqual(oracle.model, undefined)
  assert.ok(creative)

  const coding = agents.find((agent) => agent.sourceName === "coding")
  const quick = agents.find((agent) => agent.sourceName === "quick")
  const planCritic = agents.find((agent) => agent.sourceName === "plan-critic")

  assert.ok(coding)
  assert.ok(quick)
  assert.ok(planCritic)
  assert.doesNotMatch(orchestrator.developerInstructions, /ocmm-delegation-contract/)
  assert.match(extractDelegationContract(quick.developerInstructions), /Do not dispatch any subagent/)
  assert.match(
    extractDelegationContract(coding.developerInstructions),
    /Allowed utility targets: `quick`, `code-search`, `explore`, `doc-search`, `research`, `media-reader`\./,
  )
  assert.match(extractDelegationContract(planner.developerInstructions), /`quick` is forbidden/)
  assert.match(extractDelegationContract(planCritic.developerInstructions), /plan-critic.*orchestrator-owned/i)
  assert.match(
    deep.developerInstructions,
    /Allowed specialist targets: `coding`, `frontend`, `hard-reasoning`, `creative`, `documenting`\./,
  )
  assert.match(
    planner.developerInstructions,
    /Compatibility routing applies only after the effective delegation contract permits delegation/,
  )
})

test("custom GPT review and plan-review profiles never generate below xhigh and preserve max", async () => {
  const scenarios = [
    {
      reviewer: { model: "openai/gpt-5.6-sol" },
      oracle: { description: "inherits reviewer without an effort override" },
      "oracle-high": { description: "inherits reviewer without an effort override", model: "openai/gpt-5.6-sol", variant: "minimal" as const },
      "plan-critic": { model: "openai/gpt-5.6-sol", variant: "minimal" as const },
    },
    {
      reviewer: { model: "openai/gpt-5.6-sol", variant: "minimal" as const },
      oracle: {
        requirement: {
          fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-terra", reasoningEffort: "low" }],
        },
      },
      "oracle-high": {
        requirement: {
          fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-terra", reasoningEffort: "low" }],
        },
      },
      "plan-critic": {
        requirement: {
          fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol", reasoningEffort: "low" }],
        },
      },
    },
    {
      reviewer: { model: "openai/gpt-5.6-sol", variant: "xhigh" as const },
      oracle: { model: "openai/gpt-5.6-terra", variant: "xhigh" as const },
      "oracle-high": { model: "openai/gpt-5.6-terra", variant: "xhigh" as const },
      "plan-critic": { model: "openai/gpt-5.6-sol", variant: "xhigh" as const },
    },
    {
      reviewer: { model: "openai/gpt-5.6-sol", variant: "max" as const },
      oracle: {
        requirement: {
          fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-terra", reasoningEffort: "max" }],
        },
      },
      "oracle-high": {
        requirement: {
          fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-terra", reasoningEffort: "max" }],
        },
      },
      "plan-critic": { model: "openai/gpt-5.6-sol", variant: "max" as const },
    },
  ]

  for (const agentsConfig of scenarios) {
    const agents = await buildCodexAgents({
      config: { ...defaultConfig(), workflow: "codex", agents: agentsConfig },
      cwd: process.cwd(),
      skillsRoot: join(process.cwd(), "skills"),
    })
    for (const role of ["reviewer", "oracle", "oracle-high", "plan-critic"]) {
      const effort = agents.find((agent) => agent.sourceName === role)?.reasoningEffort
      const roleConfig = agentsConfig[role as keyof typeof agentsConfig]
      const hasExplicitMax = roleConfig && (
        "requirement" in roleConfig
          ? roleConfig.requirement?.fallbackChain?.[0]?.reasoningEffort === "max"
          : "variant" in roleConfig && roleConfig.variant === "max"
      )
      if (hasExplicitMax) {
        assert.equal(effort, "max", `${role} must preserve explicit max for GPT/Codex`)
      } else {
        assert.equal(effort, "xhigh", `${role} must retain the GPT/Codex xhigh floor`)
      }
    }
  }
})

test("Codex generation resolves arbitrary multi-hop reviewer and oracle aliases", async () => {
  const agents = await buildCodexAgents({
    config: {
      ...defaultConfig(),
      workflow: "codex",
      agents: {
        reviewer: { alias: "review-policy-a" },
        "review-policy-a": { alias: "review-policy-b" },
        "review-policy-b": { alias: "review-model" },
        "review-model": { model: "openai/gpt-5.6-sol", variant: "minimal" as const },
        oracle: { description: "inherits the effective reviewer model" },
        "oracle-high": { description: "inherits the effective reviewer model", alias: "review-policy-b" },
      },
    },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })

  for (const role of ["reviewer", "oracle", "oracle-high"]) {
    const agent = agents.find((candidate) => candidate.sourceName === role)
    assert.equal(agent?.model, "gpt-5.6-sol")
    assert.equal(agent?.reasoningEffort, "xhigh")
  }
})

test("generateCodexPlugin writes a self-contained bundle", async () => {
  const root = mkdtempSync(join(tmpdir(), "deepwork-codex-plugin-"))
  try {
    const config = {
      ...defaultConfig(),
      agents: { orchestrator: { model: "openai/gpt-5.6-sol" } },
    }
    const result = await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "plugins", "ocmm"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, CODEX_PROJECT_AGENTS_DIR),
      config,
      packageVersion: "9.9.9",
    })

    const manifest = JSON.parse(readFileSync(join(result.pluginRoot, ".codex-plugin", "plugin.json"), "utf8")) as Record<string, unknown>
    const runtimePackage = JSON.parse(readFileSync(join(result.pluginRoot, "package.json"), "utf8")) as Record<string, unknown>
    const marketplace = JSON.parse(readFileSync(result.marketplacePath, "utf8")) as Record<string, unknown>
    const orchestrator = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-orchestrator.toml`), "utf8")
    const oracle = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-oracle.toml`), "utf8")
    const oracleHigh = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-oracle-high.toml`), "utf8")
    const reviewer = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-reviewer.toml`), "utf8")
    const creative = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-creative.toml`), "utf8")
    const planner = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-planner.toml`), "utf8")
    const coding = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-coding.toml`), "utf8")
    const quick = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-quick.toml`), "utf8")
    const deep = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-deep.toml`), "utf8")
    const projectPlanCritic = readFileSync(join(root, CODEX_PROJECT_AGENTS_DIR, `${CODEX_AGENT_PREFIX}-plan-critic.toml`), "utf8")
    const workflowSkill = readFileSync(join(result.pluginRoot, "skills", CODEX_WORKFLOW_SKILL_NAME, "SKILL.md"), "utf8")
    const deepworkSkill = readFileSync(join(result.pluginRoot, "skills", "deepwork-writing-plans", "SKILL.md"), "utf8")
    const frontendSkill = readFileSync(join(result.pluginRoot, "skills", "frontend", "SKILL.md"), "utf8")
    const frontendDesignReadme = readFileSync(join(result.pluginRoot, "skills", "frontend", "references", "design", "README.md"), "utf8")
    const frontendArchitecture = readFileSync(join(result.pluginRoot, "skills", "frontend", "references", "design", "design-system-architecture.md"), "utf8")
    const debuggingSkill = readFileSync(join(result.pluginRoot, "skills", "debugging", "SKILL.md"), "utf8")
    const gitAgentMetadata = readFileSync(join(result.pluginRoot, "skills", "git-master", "agents", "openai.yaml"), "utf8")
    const mcpManifest = readFileSync(join(result.pluginRoot, ".mcp.json"), "utf8")
    const mcp = JSON.parse(mcpManifest) as { mcpServers: Record<string, { args?: string[] }> }
    const lspEntrypoint = mcp.mcpServers.lsp?.args?.[0] ?? ""

    assert.equal(manifest.version, "9.9.9")
    assert.equal(runtimePackage.type, "module")
    assert.equal(marketplace.name, CODEX_MARKETPLACE_NAME)
    assert.match(mcpManifest, /"lsp"/)
    assert.match(mcpManifest, /ocmm-lsp\.js/)
    assert.equal(isAbsolute(lspEntrypoint), false)
    assert.match(orchestrator, /^name = "dw-orchestrator"$/m)
    assert.match(orchestrator, /Subagent Dispatch Compatibility \(HARD-GATE\)/)
    assert.match(orchestrator, /TASK, ROLE, DELIVERABLE, SCOPE, VERIFY, REQUIRED SKILLS, CONTEXT, and CONSTRAINTS/)
    assert.match(orchestrator, /MultiAgent V1\/V2 names and examples elsewhere are lower-priority compatibility examples/)
    assert.match(orchestrator, /select only from the user's current available catalog/)
    assert.match(orchestrator, /primary reasoning lane for flagship and external-review work/)
    assert.match(orchestrator, /prefer a configured heterogeneous or otherwise non-identical capable model before a supplemental same-lane fallback/)
    assert.match(oracle, /^name = "dw-oracle"$/m)
    assert.match(oracle, /^model_reasoning_effort = "xhigh"$/m)
    assert.match(oracleHigh, /^name = "dw-oracle-high"$/m)
    assert.match(oracleHigh, /^model_reasoning_effort = "xhigh"$/m)
    assert.match(reviewer, /^name = "dw-reviewer"$/m)
    assert.match(reviewer, /^model_reasoning_effort = "xhigh"$/m)
    assert.match(creative, /^name = "dw-creative"$/m)
    assert.match(workflowSkill, /^---\nname: deepwork$/m)
    assert.match(workflowSkill, /agent_type="dw-plan-critic"/)
    assert.match(workflowSkill, /\[@dw-oracle\]\(subagent:\/\/dw-oracle\)/)
    assert.match(workflowSkill, /\[@dw-oracle-high\]\(subagent:\/\/dw-oracle-high\)/)
    assert.match(workflowSkill, /explicitly configured by user\/profile/)
    assert.match(workflowSkill, /available in the current catalog\/dispatch surface/)
    assert.match(workflowSkill, /not disabled/)
    assert.match(workflowSkill, /Do not pass `dw-\*\.toml` files as `items`, `skill` attachments, or prompt context/)
    assert.match(workflowSkill, /current callable dispatch-tool schema is the only availability signal/)
    assert.match(workflowSkill, /Exact profile/)
    assert.match(workflowSkill, /schema or its documentation explicitly guarantees/)
    assert.match(workflowSkill, /Direct composition/)
    assert.match(workflowSkill, /system or developer instructions plus skills/)
    assert.match(workflowSkill, /generated developer-instruction content \(not its TOML wrapper\)/)
    assert.match(workflowSkill, /Generic or flat dispatch/)
    assert.match(workflowSkill, /MultiAgentV2 flat tools/)
    assert.match(workflowSkill, /`spawn_agent`/)
    assert.match(workflowSkill, /`wait_agent`/)
    assert.match(workflowSkill, /`followup_task`/)
    assert.match(workflowSkill, /`interrupt_agent`/)
    assert.match(workflowSkill, /`fork_turns`/)
    assert.match(workflowSkill, /`REQUIRED SKILLS:` <workflow skill and task-relevant skills>/)
    assert.match(workflowSkill, /self-contained envelope in `message`/)
    assert.match(workflowSkill, /`TASK:` <imperative, bounded assignment>/)
    assert.match(workflowSkill, /`DELIVERABLE:` <concrete expected output>/)
    assert.match(workflowSkill, /`VERIFY:` <test, evidence, or observable result>/)
    assert.match(workflowSkill, /still a valid generic\/flat dispatch route/)
    assert.match(workflowSkill, /no callable native subagent-dispatch route is available/)
    assert.match(workflowSkill, /child inherits its native\/default model while the role and skills are carried in `message`/)
    assert.match(workflowSkill, /a `task_name` does not select a profile/)
    assert.match(workflowSkill, /generic or flat subagent does not load the generated profile/)
    assert.match(orchestrator, /GPT-5\.6 EXECUTION CALIBRATION/)
    assert.match(orchestrator, /two independent waves add no useful evidence/)
    assert.match(orchestrator, /Apply this layer only when the selected model identifies as part of the GPT-5\.6 family/)
    assert.match(workflowSkill, /Generated Agents/)
    assert.match(workflowSkill, /\| dw-oracle \|/)
    assert.match(workflowSkill, /\| dw-creative \|/)
    assert.match(workflowSkill, /Runtime Model Selection/)
    assert.match(workflowSkill, /Runtime model upgrades \(only when directly selectable\)/)
    assert.match(workflowSkill, /Generated profile defaults are installation metadata, not mandatory choices/)
    assert.doesNotMatch(workflowSkill, /\| dw-builder \| gpt-/)
    assert.doesNotMatch(workflowSkill, /\| dw-oracle \| gpt-/)
    assert.match(workflowSkill, /user's currently available model catalog and explicit local configuration/)
    assert.match(workflowSkill, /Best available primary reasoning model in the user's catalog/)
    assert.match(workflowSkill, /Reviewer, oracle, and oracle-high routes use an `xhigh`-equivalent minimum/)
    assert.match(workflowSkill, /GPT-5\.6 supports native `max`/)
    assert.match(workflowSkill, /default complex\/large review set is `?dw-oracle`? \+ `?dw-reviewer`?/i)
    assert.match(workflowSkill, /Add `?dw-oracle-high`? only when it is explicitly configured by user\/profile/)
    assert.match(workflowSkill, /Built-in, default, or generated-profile existence alone must not force three-review dispatch/)
    const planCriticPolicyLines = workflowSkill
      .split(/\r?\n/)
      .filter((line) => line.includes(`${CODEX_AGENT_PREFIX}-plan-critic`))
    assert.ok(planCriticPolicyLines.some((line) => /xhigh minimum/i.test(line)))
    assert.match(workflowSkill, /Independent review rule/)
    assert.match(workflowSkill, /Prefer oracle diversity from a configured heterogeneous or otherwise non-identical capable model/)
    assert.match(workflowSkill, /default complex\/large review set is `?dw-oracle`? \+ `?dw-reviewer`?/i)
    assert.doesNotMatch(workflowSkill, new RegExp(`Latest available ${"Terra-lane"} model`))
    assert.doesNotMatch(workflowSkill, /never downgrade or leave the Terra lane merely to force diversity/)
    assert.equal(workflowSkill.includes(`${"Previous"}-${"gen"} ${"flagship"}`), false)
    assert.equal(workflowSkill.includes(`should use a **different ${"generation"}**`), false)
    assert.match(workflowSkill, /Independent review rule/)
    assert.match(workflowSkill, /Tier assignments/)
    assert.match(workflowSkill, /this plugin bundle's `agents\/` directory/)
    assert.doesNotMatch(workflowSkill, /plugins\/ocmm\/agents/)
    assert.match(deepworkSkill, /^---\nname: deepwork-writing-plans$/m)
    assert.match(deepworkSkill, /current plan-critic receipt/)
    assert.match(projectPlanCritic, /Receipt Contract/)
    assert.match(projectPlanCritic, /any later plan edit requires a fresh round/)
    assert.match(frontendSkill, /Research Log/)
    assert.match(frontendDesignReadme, /Primitive Showcase Gate/)
    assert.match(frontendArchitecture, /Accessibility Constraints & Accepted Debt/)
    assert.match(frontendArchitecture, /States\*\*: default, hover, active, focus, disabled, loading, empty, error/)
    assert.match(frontendDesignReadme, /nine-section structure/i)
    assert.match(frontendArchitecture, /nine sections/i)
    for (const generatedFrontendSource of [frontendDesignReadme, frontendArchitecture]) {
      assert.match(generatedFrontendSource, /Planned Showcase Primitives/)
      assert.match(generatedFrontendSource, /pre-implementation verification checklist/i)
      assert.match(generatedFrontendSource, /not reusable component documentation/i)
      assert.match(generatedFrontendSource, /implemented reusable patterns used 2\+ times/i)
    }
    assert.doesNotMatch(frontendDesignReadme, /must use lazyweb|lazyweb is required/i)
    assert.doesNotMatch(frontendArchitecture, /must use designpowers|designpowers is required/i)
    assert.match(debuggingSkill, /Codex Compatibility/)
    assert.doesNotMatch(gitAgentMetadata, /search_terms/)

    const requestingReviewSkill = readFileSync(join(process.cwd(), "skills", "v1", "requesting-code-review", "SKILL.md"), "utf8")
    const v1Maintenance = readFileSync(join(process.cwd(), "docs", "v1-maintenance.md"), "utf8")
    const requestingReviewSourceRow = v1Maintenance
      .split(/\r?\n/)
      .find((line) => line.startsWith("| requesting-code-review |")) ?? ""
    for (const source of [requestingReviewSkill, requestingReviewSourceRow]) {
      assert.match(source, /optional independent consultation for a high-risk implementation plan/)
      assert.match(source, /`xhigh` minimum/)
      assert.match(source, /local `max`/)
      assert.match(source, /GPT-5\.6 supports native `max`/)
    }

    assert.equal(result.agentCount > 10, true)
    assert.equal(result.skillCount >= 6, true)

    assert.match(planner, /ocmm-delegation-contract/)
    assert.match(planner, /`quick` is forbidden/)
    assert.match(planner, /Return the completed plan to the orchestrator/)
    assert.match(coding, /Allowed utility targets: `quick`, `code-search`, `explore`, `doc-search`, `research`, `media-reader`/)
    assert.match(quick, /Do not dispatch any subagent/)
    assert.match(deep, /Allowed specialist targets: `coding`, `frontend`, `hard-reasoning`, `creative`, `documenting`/)
    assert.match(planner, /Compatibility routing applies only after the effective delegation contract permits delegation/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
