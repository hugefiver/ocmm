import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, extname, isAbsolute, join, relative } from "node:path"

import { defaultConfig } from "../config/schema.ts"
import { loadConfig, stripJsoncCommentsAndTrailingCommas } from "../config/load.ts"
import { createConfigHandler } from "../hooks/config.ts"
import { createChatMessageHandler, createSessionIntentStore, createSystemTransformHandler } from "../hooks/chat-message.ts"
import { buildSkillCommand, loadSharedSkills, loadV1SkillBriefs } from "../intent/skill-loader.ts"
import { isRecord } from "../shared/logger.ts"
import {
  getAgentPrompt,
  getCategoryPrompt,
  getDeepworkPrompt,
} from "../intent/prompt-loader.ts"
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
  loadAdapterConfig,
  normalizeCopiedSkillText,
  normalizeSkillForCodex,
  renderPlanningLogicalTierProfiles,
  stageCodexRuntime,
} from "./plugin-generator.ts"

function extractOriginalDeepworkPrompt(instructions: string): string {
  const marker = "Original Deepwork prompt:\n"
  const start = instructions.indexOf(marker)
  assert.notEqual(start, -1, "generated instructions are missing the original Deepwork prompt")
  const promptStart = start + marker.length
  const end = instructions.indexOf("\n\n## Subagent Dispatch Compatibility", promptStart)
  assert.notEqual(end, -1, "generated instructions are missing the prompt boundary")
  return instructions.slice(promptStart, end)
}

function extractTaggedPolicy(instructions: string, tag: string): string {
  const openingTag = `<${tag}>`
  const closingTag = `</${tag}>`
  const openingIndex = instructions.indexOf(openingTag)
  assert.notEqual(openingIndex, -1, `generated instructions are missing <${tag}>`)
  assert.equal(
    instructions.indexOf(openingTag, openingIndex + openingTag.length),
    -1,
    `generated instructions contain more than one <${tag}>`,
  )
  const closingIndex = instructions.indexOf(closingTag, openingIndex + openingTag.length)
  assert.notEqual(closingIndex, -1, `generated instructions are missing </${tag}>`)
  assert.equal(
    instructions.indexOf(closingTag, closingIndex + closingTag.length),
    -1,
    `generated instructions contain more than one </${tag}>`,
  )
  return instructions.slice(openingIndex + openingTag.length, closingIndex)
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

function normalizeLf(text: string): string {
  return text.replace(/\r\n?/g, "\n")
}

function parseGeneratedAgentToml(toml: string, label: string): Record<string, unknown> {
  const parsed: Record<string, unknown> = {}
  for (const [index, rawLine] of toml.split(/\r?\n/).entries()) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/)
    assert.ok(assignment, `${label}:${index + 1} is not a flat TOML assignment`)
    const [, key, encodedValue] = assignment
    assert.equal(Object.hasOwn(parsed, key!), false, `${label} contains duplicate key ${key}`)
    try {
      parsed[key!] = JSON.parse(encodedValue!) as unknown
    } catch (error) {
      assert.fail(`${label}:${index + 1} contains an invalid TOML basic value: ${(error as Error).message}`)
    }
  }

  assert.deepEqual(
    Object.keys(parsed).sort(),
    ["description", "developer_instructions", "model", "model_reasoning_effort", "name", "nickname_candidates"].sort(),
    `${label} fields`,
  )
  assert.equal(typeof parsed.name, "string", `${label} name must be a string`)
  assert.equal(typeof parsed.description, "string", `${label} description must be a string`)
  assert.equal(typeof parsed.model, "string", `${label} model must be a string`)
  assert.equal(typeof parsed.model_reasoning_effort, "string", `${label} model_reasoning_effort must be a string`)
  assert.equal(typeof parsed.developer_instructions, "string", `${label} developer_instructions must be a string`)
  assert.equal(Array.isArray(parsed.nickname_candidates), true, `${label} nickname_candidates must be an array`)
  assert.equal(
    (parsed.nickname_candidates as unknown[]).every((candidate) => typeof candidate === "string"),
    true,
    `${label} nickname_candidates must contain only strings`,
  )
  return parsed
}

function parseGeneratedDeveloperInstructions(toml: string, label: string): string {
  return parseGeneratedAgentToml(toml, label).developer_instructions as string
}

function listRelativeFiles(root: string): string[] {
  function visit(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = join(directory, entry.name)
      return entry.isDirectory()
        ? visit(absolute)
        : [relative(root, absolute).replaceAll("\\", "/")]
    })
  }

  return visit(root).sort()
}

const RUNTIME_FILTER_MARKERS = [
  ".gitignore",
  "pyrightconfig.json",
  "scripts/tests/",
  "*.py[cod]",
] as const
const SKILL_TEXT_EXTENSIONS = new Set([".json", ".md", ".mjs", ".ps1", ".py", ".sh", ".txt", ".yaml", ".yml"])
const SKILL_TEXT_FILENAMES = new Set([".gitignore", ".npmignore", "LICENSE", "SOURCE"])

const CODING_AGENT_SESSIONS_RUNTIME_FILES = [
  "SKILL.md",
  "LICENSE-UPSTREAM.md",
  "NOTICE.md",
  "agents/openai.yaml",
  "references/all-platforms.md",
  "references/claude.md",
  "references/codex.md",
  "references/opencode.md",
  "references/senpi.md",
  "scripts/find-agent-sessions.py",
  "scripts/agent_sessions/__init__.py",
  "scripts/agent_sessions/aside_scanner.py",
  "scripts/agent_sessions/claude.py",
  "scripts/agent_sessions/cli.py",
  "scripts/agent_sessions/codex.py",
  "scripts/agent_sessions/file_scanners.py",
  "scripts/agent_sessions/jsonio.py",
  "scripts/agent_sessions/kiro_scanner.py",
  "scripts/agent_sessions/opencode.py",
  "scripts/agent_sessions/pi_family.py",
  "scripts/agent_sessions/scanners.py",
  "scripts/agent_sessions/sqlite_optional_scanners.py",
  "scripts/agent_sessions/sqlite_scanners.py",
  "scripts/agent_sessions/timeparse.py",
  "scripts/agent_sessions/transcript.py",
  "scripts/agent_sessions/types.py",
].sort()

function writeFixtureFile(root: string, file: string, contents: string | Buffer): void {
  const path = join(root, ...file.split("/"))
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

function makePromptFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codex-prompt-fixture-"))
  const inventory = {
    deepwork: ["default", "gpt", "glm", "gemini", "codex", "planner", "claude-opus-5", "kimi", "gemini-4", "swe-2"],
    agents: ["orchestrator", "reviewer", "planner", "clarifier", "plan-critic"],
    category: ["frontend", "creative", "hard-reasoning", "research", "quick", "coding", "normal-task", "complex", "deep", "documenting", "cross-cutting"],
  }
  for (const workflow of ["v1", "codex"]) {
    for (const [area, names] of Object.entries(inventory)) {
      for (const name of names) {
        writeFixtureFile(root, `${workflow}/${area}/${name}.md`, `[fixture:${workflow}:${area}:${name}]`)
      }
    }
  }
  writeFixtureFile(root, "shared/shell-safety.md", "[fixture:shared:shell-safety]")
  writeFixtureFile(root, "skills/v1/brainstorming/SKILL.md", "---\nname: brainstorming\ndescription: Fixture\n---\n[fixture:brainstorming]\n")
  writeFixtureFile(root, "skills/v1/brainstorming/brief.md", "[fixture:brief] `brainstorming`")
  return root
}

function writeRuntimeFilterFixture(
  root: string,
  name: string,
  npmignore?: readonly string[],
): string {
  const skillDir = join(root, name)
  writeFixtureFile(skillDir, "SKILL.md", `---\nname: ${name}\ndescription: Runtime filtering fixture\n---\n# ${name}\n`)
  if (npmignore) writeFixtureFile(skillDir, ".npmignore", `${npmignore.join("\n")}\n`)
  for (const [file, contents] of [
    [".gitignore", "source-gitignore\n"],
    ["pyrightconfig.json", "{\"typeCheckingMode\":\"strict\"}\n"],
    ["keep.txt", "runtime-keep\n"],
    ["scripts/runtime.py", "runtime = True\n"],
    ["scripts/tests/test_dev.py", "test = True\n"],
    ["nested/__pycache__/module.pyc", "bytecode\n"],
    [".mypy_cache/cache.json", "mypy\n"],
    [".pytest_cache/cache.json", "pytest\n"],
    [".ruff_cache/cache.json", "ruff\n"],
    ["compiled.pyc", "pyc\n"],
    ["compiled.pyo", "pyo\n"],
    ["compiled.pyd", "pyd\n"],
  ] as const) {
    writeFixtureFile(skillDir, file, contents)
  }
  return skillDir
}

async function generateFixtureSkill(sourceRoot: string, outputRoot: string, name: string): Promise<string> {
  const result = await generateCodexPlugin({
    projectRoot: process.cwd(),
    pluginRoot: join(outputRoot, "plugins", "deepwork"),
    marketplacePath: join(outputRoot, ".agents", "plugins", "marketplace.json"),
    projectAgentsRoot: false,
    config: {
      ...defaultConfig(),
      workflow: "codex",
      skills: { ...defaultConfig().skills, sources: [sourceRoot], enable: [name] },
    },
    packageVersion: "9.9.9",
  })
  return join(result.pluginRoot, "skills", name)
}

function expectedCopiedSkillBytes(file: string, source: Buffer): Buffer {
  const filename = basename(file)
  if (!SKILL_TEXT_FILENAMES.has(filename) && !SKILL_TEXT_EXTENSIONS.has(extname(filename).toLowerCase())) {
    return source
  }
  return Buffer.from(source.toString("utf8").replace(/\r\n?/g, "\n"))
}

function assertFullSkillCopyExceptRouter(label: string, sourceRoot: string, generatedRoot: string): void {
  const sourceFiles = listRelativeFiles(sourceRoot)
  assert.deepEqual(listRelativeFiles(generatedRoot), sourceFiles, `${label} inventory`)
  for (const file of sourceFiles) {
    const source = readFileSync(join(sourceRoot, file))
    const generated = readFileSync(join(generatedRoot, file))
    if (file === "SKILL.md") {
      assert.ok(generated.toString("utf8").startsWith(expectedCopiedSkillBytes(file, source).toString("utf8").trimEnd()), `${label} router body`)
    } else {
      assert.deepEqual(generated, expectedCopiedSkillBytes(file, source), `${label}/${file} generated copy`)
    }
  }
}

function assertGeneratedSharedSkillTree(
  label: string,
  sourceRoot: string,
  temporaryRoot: string,
  trackedRoot: string,
  requiredFile: string,
): void {
  const sourceFiles = listRelativeFiles(sourceRoot)
  const temporaryFiles = listRelativeFiles(temporaryRoot)
  const trackedFiles = listRelativeFiles(trackedRoot)

  assert.ok(sourceFiles.includes(requiredFile), `${label} source is missing ${requiredFile}`)
  assert.deepEqual(temporaryFiles, sourceFiles, `temporary ${label} skill inventory differs from source`)
  assert.deepEqual(trackedFiles, sourceFiles, `tracked ${label} skill inventory is stale`)

  for (const file of sourceFiles) {
    for (const [kind, root] of [["temporary", temporaryRoot], ["tracked", trackedRoot]] as const) {
      const delivered = readFileSync(join(root, file))
      assert.equal(lstatSync(join(root, file)).isFile(), true, `${kind} ${label}/${file} resource is not a regular file`)
      if (/\.(?:mjs|js|ts|py|ps1|sh|bin)$/i.test(file)) {
        const source = readFileSync(join(sourceRoot, file))
        assert.deepEqual(delivered, expectedCopiedSkillBytes(file, source), `${kind} ${label}/${file} executable resource`)
      }
    }
  }
}

test("Codex manifest declares deepwork plugin resources", () => {
  const manifest = createPluginManifest("1.2.3")

  assert.equal(manifest.name, CODEX_PLUGIN_NAME)
  assert.equal(manifest.version, "1.2.3")
  assert.equal(manifest.skills, "./skills/")
  assert.equal(manifest.mcpServers, "./.mcp.json")
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

test("Codex MCP manifest preserves explicit local cwd", () => {
  const cfg = {
    ...defaultConfig(),
    disabledMcps: ["websearch", "lsp"],
    mcp: {
      ...defaultConfig().mcp,
      servers: {
        local: {
          type: "local" as const,
          command: ["node", "server.js"],
          cwd: "tools/mcp-server",
          enabled: true,
        },
      },
    },
  }

  const manifest = createCodexMcpManifest(cfg, process.cwd())
  const local = manifest.mcpServers.local as Record<string, unknown>

  assert.equal(local.command, "node")
  assert.deepEqual(local.args, ["server.js"])
  assert.equal(local.cwd, "tools/mcp-server")
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
        lsp: { type: "local" as const, command: "custom-lsp", args: ["mcp"], cwd: "tools/custom-lsp", enabled: true },
      },
    },
  }

  const manifest = createCodexMcpManifest(cfg, process.cwd())
  const lsp = manifest.mcpServers.lsp as Record<string, unknown>

  assert.equal(lsp.command, "custom-lsp")
  assert.deepEqual(lsp.args, ["mcp"])
  assert.equal(lsp.cwd, "tools/custom-lsp")
})

test("Codex agents are generated from Deepwork prompts and Codex-compatible fallback models", async (t) => {
  const promptsRoot = makePromptFixture()
  t.after(() => rmSync(promptsRoot, { recursive: true, force: true }))
  const agents = await buildCodexAgents({
    config: { ...defaultConfig(), workflow: "codex", promptsRoot },
    cwd: process.cwd(),
    skillsRoot: join(promptsRoot, "skills"),
  })

  const orchestrator = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-orchestrator`)
  const builder = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-builder`)
  const planner = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-planner`)
  const deep = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-deep`)
  const documenting = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-documenting`)
  const oracle = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-oracle`)
  const oracle2nd = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-oracle-2nd`)
  const oracleHigh = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-oracle-high`)
  const reviewer = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-reviewer`)
  const creative = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-creative`)
  const shellSafety = readFileSync(join(promptsRoot, "shared", "shell-safety.md"), "utf8").trim()

  for (const agent of agents) {
    assert.equal(countOccurrences(agent.developerInstructions, shellSafety), 1, agent.name)
  }

  assert.ok(orchestrator)
  assert.equal(orchestrator.model, "gpt-6-astra")
  assert.equal(orchestrator.reasoningEffort, "high")
  assert.ok(orchestrator.developerInstructions.length > 0)
  assert.ok(builder)
  assert.equal(builder.model, "gpt-6-astra")
  assert.ok(planner)
  assert.equal(planner.reasoningEffort, "xhigh")
  assert.ok(deep)
  assert.equal(deep.reasoningEffort, "xhigh")
  assert.ok(documenting)
  assert.equal(documenting.model, "gpt-6.1-sol")
  assert.ok(oracle)
  assert.equal(oracle.sourceName, "oracle")
  assert.equal(oracle.reasoningEffort, "xhigh")
  assert.ok(oracle2nd)
  assert.equal(oracle2nd.sourceName, "oracle-2nd")
  assert.equal(oracle2nd.reasoningEffort, "xhigh")
  assert.equal(oracleHigh, undefined)
  assert.ok(reviewer)
  assert.equal(reviewer.sourceName, "reviewer")
  assert.equal(reviewer.reasoningEffort, "xhigh")
  assert.notEqual(oracle.model, undefined)
  assert.ok(creative)

  const coding = agents.find((agent) => agent.sourceName === "coding")
  const quick = agents.find((agent) => agent.sourceName === "quick")
  const planCritic = agents.find((agent) => agent.sourceName === "plan-critic")

  assert.ok(coding)
  assert.ok(quick)
  assert.ok(planCritic)
  assert.doesNotMatch(orchestrator.developerInstructions, /ocmm-delegation-contract/)
})

test("Codex source registration preserves task permissions and explicit override precedence", async () => {
  const config = { ...defaultConfig(), workflow: "codex" as const }
  const cwd = process.cwd()
  const skillsRoot = join(cwd, "skills")
  const agents = await buildCodexAgents({ config, cwd, skillsRoot })
  const source: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => config, cwd, skillsRoot })(source, undefined)

  const readOnlyTargets = {
    "code-search": "allow",
    explore: "allow",
    "doc-search": "allow",
    research: "allow",
    "media-reader": "allow",
  } as const
  const expectedTaskPermissions = {
    quick: "deny",
    planner: { "*": "deny", ...readOnlyTargets },
    deep: {
      "*": "deny",
      quick: "allow",
      ...readOnlyTargets,
      coding: "allow",
      frontend: "allow",
      "hard-reasoning": "allow",
      creative: "allow",
      documenting: "allow",
    },
    orchestrator: "allow",
  } as const

  for (const [name, expected] of Object.entries(expectedTaskPermissions)) {
    const profile = agents.find((agent) => agent.sourceName === name)
    assert.ok(profile, name)
    const registered = source.agent[name]
    assert.ok(isRecord(registered) && isRecord(registered.permission), name)
    const permission = registered.permission.task
    if (typeof expected === "string") {
      assert.equal(permission, expected, name)
    } else {
      assert.ok(isRecord(permission), name)
      assert.deepEqual(Object.entries(permission), Object.entries(expected), `${name} task rule precedence`)
    }
  }

  const configured = {
    ...config,
    agents: {
      orchestrator: { tools: { task: true }, permission: { task: "deny" as const } },
      planner: { tools: { task: false }, permission: { task: "allow" as const } },
    },
  }
  const hostTaskRules = { "*": "allow", coding: "deny" } as const
  const overridden: { agent: Record<string, unknown> } = {
    agent: {
      orchestrator: { permission: { task: "allow" } },
      planner: { permission: { task: "deny" } },
      quick: { permission: { task: "allow" } },
      deep: { permission: { task: hostTaskRules } },
    },
  }
  await createConfigHandler({ getConfig: () => configured, cwd, skillsRoot })(overridden, undefined)
  for (const [name, expected] of Object.entries({ orchestrator: "deny", planner: "allow", quick: "allow" })) {
    const registered = overridden.agent[name]
    assert.ok(isRecord(registered) && isRecord(registered.permission), name)
    assert.equal(registered.permission.task, expected, `${name} explicit scalar override`)
  }
  const deep = overridden.agent.deep
  assert.ok(isRecord(deep) && isRecord(deep.permission) && isRecord(deep.permission.task))
  assert.deepEqual(Object.entries(deep.permission.task), Object.entries(hostTaskRules), "host deny rule follows wildcard allow")
})

test("Codex agent composition shares one synthetic GPT layer across generations, planning tiers, and categories", async (t) => {
  const promptsRoot = makePromptFixture()
  t.after(() => rmSync(promptsRoot, { recursive: true, force: true }))
  for (const workflow of ["v1", "codex"] as const) {
    for (const model of [
      "openai/gpt-5.5", "openai/gpt-5.6-sol", "openai/gpt-6-sol", "apai/gpt-6.1-sol", "openai/gpt-6-astra",
      "apai/gpt-6-luna", "providers/openai/gpt-6-sol-fast", "amazon-bedrock/openai.gpt-6-astra-fast",
      "openai/gpt-7-preview", "openai/codex-mini-latest",
    ]) {
      const agents = await buildCodexAgents({
        config: {
          ...defaultConfig(),
          workflow,
          promptsRoot,
          agents: {
            orchestrator: { model },
            planner: { model, variants: { high: "high" as const } },
            "plan-critic": { model, variants: { low: "low" as const } },
          },
          categories: { coding: { model }, deep: { model }, "cross-cutting": { model } },
        },
        cwd: process.cwd(),
        skillsRoot: join(promptsRoot, "skills"),
      })
      const gpt = getDeepworkPrompt("gpt").trim()
      const plannerBase = getDeepworkPrompt("planner").trim()
      const adapter = getDeepworkPrompt("codex").trim()
      assert.ok(gpt && plannerBase && adapter)
      for (const sourceName of ["orchestrator", "planner", "planner-high", "plan-critic", "plan-critic-low", "coding", "deep", "cross-cutting"]) {
        const agent = agents.find((candidate) => candidate.sourceName === sourceName)
        assert.ok(agent, `${workflow}/${model}/${sourceName}`)
        const assembled = extractOriginalDeepworkPrompt(agent.developerInstructions)
        const roleName = sourceName === "planner-high" ? "planner" : sourceName === "plan-critic-low" ? "plan-critic" : sourceName
        const role = (getAgentPrompt(roleName) || getCategoryPrompt(roleName)).trim()
        assert.ok(role)
        assert.ok(assembled.indexOf(role) < assembled.indexOf(gpt), `${workflow}/${model}/${sourceName}: role first`)
        assert.equal(countOccurrences(assembled, gpt), 1, `${workflow}/${model}/${sourceName}: exact source once`)
        if (sourceName.startsWith("planner")) {
          assert.equal(countOccurrences(assembled, plannerBase), 1, `${workflow}/${sourceName}: planner base`)
          assert.ok(assembled.indexOf(plannerBase) < assembled.indexOf(gpt))
        }
        if (workflow === "codex") {
          assert.equal(countOccurrences(assembled, adapter), 1, `${sourceName}: unguarded adapter base`)
          for (const variant of ["kimi", "gemini-4", "swe-2"] as const) {
            assert.equal(countOccurrences(assembled, getDeepworkPrompt(variant).trim()), 1, `${sourceName}: ${variant} carry-ahead`)
          }
        }
      }
    }
  }
})

test("Codex non-GPT model selections retain synthetic role, planner, adapter, and one GPT carry-ahead", async (t) => {
  const promptsRoot = makePromptFixture()
  t.after(() => rmSync(promptsRoot, { recursive: true, force: true }))
  for (const model of ["github-copilot/claude-sonnet-4-6", "github-copilot/gemini-3.1-pro", "github-copilot/gemini-4-argon", "github-copilot/glm-5.2", "github-copilot/kimi-k3.1", "github-copilot/swe-2-high"]) {
    const agents = await buildCodexAgents({
      config: {
        ...defaultConfig(),
        workflow: "codex",
        promptsRoot,
        agents: { orchestrator: { model }, planner: { model } },
        categories: { coding: { model }, "cross-cutting": { model } },
      },
      cwd: process.cwd(),
      skillsRoot: join(promptsRoot, "skills"),
    })
    const gpt = getDeepworkPrompt("gpt").trim()
    const adapter = getDeepworkPrompt("codex").trim()
    for (const name of ["orchestrator", "planner", "coding", "cross-cutting"]) {
      const agent = agents.find(({ sourceName }) => sourceName === name)
      assert.ok(agent, `${model}/${name}`)
      assert.equal(agent.model, model.slice(model.indexOf("/") + 1), `${model}/${name}: explicit non-GPT model`)
      const prompt = extractOriginalDeepworkPrompt(agent.developerInstructions)
      assert.equal(countOccurrences(prompt, gpt), 1, `${model}/${name}`)
      assert.equal(countOccurrences(prompt, adapter), 1, `${model}/${name}: adapter not gated`)
      assert.ok(prompt.indexOf(adapter) < prompt.indexOf(gpt), `${name}: guard is confined to GPT calibration`)
      if (name === "planner") {
        assert.equal(countOccurrences(prompt, getDeepworkPrompt("planner").trim()), 1)
      }
    }
  }
})

test("runtime and Codex consume the same default brief while explicit commands retrieve the full skill", async (t) => {
  const promptsRoot = makePromptFixture()
  t.after(() => rmSync(promptsRoot, { recursive: true, force: true }))
  const skillsRoot = join(promptsRoot, "skills")
  const config = { ...defaultConfig(), workflow: "v1" as const, promptsRoot }
  const store = createSessionIntentStore()
  const message = createChatMessageHandler({
    getConfig: () => config,
    getV1SkillBriefs: () => loadV1SkillBriefs(skillsRoot),
    skillsRoot,
    store,
  })
  const transform = createSystemTransformHandler({ getConfig: () => config, store })
  await message({ sessionID: "brief" }, { parts: [{ type: "text", text: "hello" }] })
  const system = { system: ["[fixture:system]"] }
  await transform({ sessionID: "brief" }, system)
  assert.equal(countOccurrences(system.system.join("\n"), "[fixture:brief]"), 1)
  assert.equal(countOccurrences(system.system.join("\n"), "[fixture:brainstorming]"), 0)

  const agents = await buildCodexAgents({
    config: { ...config, workflow: "codex" }, cwd: process.cwd(), skillsRoot,
  })
  for (const agent of agents) {
    assert.equal(countOccurrences(agent.developerInstructions, "[fixture:brief] `deepwork-brainstorming`"), 1)
    assert.equal(countOccurrences(agent.developerInstructions, "[fixture:brainstorming]"), 0)
  }

  await message({ sessionID: "brief" }, { parts: [{ type: "text", text: "/brainstorming investigate the boundary" }] })
  const explicit = { system: ["[fixture:system]"] }
  await transform({ sessionID: "brief" }, explicit)
  assert.equal(countOccurrences(explicit.system.join("\n"), "[fixture:brief]"), 1)
  assert.equal(countOccurrences(explicit.system.join("\n"), "[fixture:brainstorming]"), 1)
})

test("Codex agents carry synthetic Kimi, Gemini 4, and SWE-2 calibrations once without replacing planner role", async (t) => {
  const promptsRoot = makePromptFixture()
  t.after(() => rmSync(promptsRoot, { recursive: true, force: true }))
  const agents = await buildCodexAgents({
    config: { ...defaultConfig(), workflow: "codex", promptsRoot },
    cwd: process.cwd(),
    skillsRoot: join(promptsRoot, "skills"),
  })
  const kimi = getDeepworkPrompt("kimi").trim()
  const gemini4 = getDeepworkPrompt("gemini-4").trim()
  const swe2 = getDeepworkPrompt("swe-2").trim()

  for (const agent of agents) {
    const prompt = extractOriginalDeepworkPrompt(agent.developerInstructions)
    assert.equal(countOccurrences(prompt, getDeepworkPrompt("gpt").trim()), 1, `${agent.sourceName}: generic GPT carry-ahead`)
    assert.equal(countOccurrences(prompt, kimi), 1, `${agent.sourceName}: Kimi calibration`)
    assert.equal(countOccurrences(prompt, gemini4), 1, `${agent.sourceName}: Gemini 4 calibration`)
    assert.equal(countOccurrences(prompt, swe2), 1, `${agent.sourceName}: SWE-2 calibration`)
  }

  const planner = agents.find((agent) => agent.sourceName === "planner")
  assert.ok(planner)
  const plannerPrompt = extractOriginalDeepworkPrompt(planner.developerInstructions)
  assert.equal(countOccurrences(plannerPrompt, getAgentPrompt("planner").trim()), 1)
  assert.equal(countOccurrences(plannerPrompt, getDeepworkPrompt("planner").trim()), 1)
})

test("Codex subscription defaults cover every always-on role without activating opt-in roles", async () => {
  const agents = await buildCodexAgents({
    config: { ...defaultConfig(), workflow: "codex" },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })
  const expected = {
    orchestrator: ["gpt-6-astra", "high"],
    planner: ["gpt-6-astra", "xhigh"],
    builder: ["gpt-6-astra", "xhigh"],
    reviewer: ["gpt-6-astra", "xhigh"],
    clarifier: ["gpt-5.6-sol", "xhigh"],
    "plan-critic": ["gpt-6-astra", "xhigh"],
    oracle: ["gpt-6.1-sol", "xhigh"],
    "oracle-2nd": ["gpt-5.6-sol", "xhigh"],
    "doc-search": ["gpt-6-luna", "high"],
    explore: ["gpt-6-luna", "medium"],
    "code-search": ["gpt-6-luna", "medium"],
    "media-reader": ["gpt-6-luna", "high"],
    "hard-reasoning": ["gpt-6-astra", "max"],
    deep: ["gpt-6-astra", "xhigh"],
    complex: ["gpt-6.1-sol", "xhigh"],
    creative: ["gpt-6-astra", "high"],
    frontend: ["gpt-6-astra", "xhigh"],
    research: ["gpt-6.1-sol", "xhigh"],
    quick: ["gpt-6.1-sol", "medium"],
    coding: ["gpt-6.1-sol", "xhigh"],
    "normal-task": ["gpt-6.1-sol", "xhigh"],
    documenting: ["gpt-6.1-sol", "high"],
  }
  assert.deepEqual(
    Object.fromEntries(agents.map((agent) => [agent.sourceName, [agent.model, agent.reasoningEffort]])),
    expected,
  )
})

test("Codex explicit model chains and Sol and Luna low effort are preserved", async () => {
  const agents = await buildCodexAgents({
    config: {
      ...defaultConfig(),
      workflow: "codex",
      agents: {
        orchestrator: { models: ["openai/gpt-5.4", "openai/gpt-6.1-sol"], variant: "xhigh" },
        builder: { model: "openai/gpt-5.6-sol", variant: "max" },
        clarifier: { model: "openai/gpt-5.6-terra", variant: "medium" },
        "doc-search": { model: "openai/gpt-5.4-mini", variant: "low" },
        "code-search": { model: "apai/gpt-6-luna", variant: "medium" },
        planner: { model: "apai/gpt-6.2-astra", variant: "max" },
        oracle: { model: "apai/gpt-6.1-sol", variants: { low: "low" as const, max: "max" as const } },
        reviewer: { model: "apai/gpt-6.1-sol", variant: "medium" },
        "plan-critic": { model: "apai/gpt-6.1-sol", variants: { low: "low" as const } },
      },
      categories: {
        quick: { model: "apai/gpt-6.1-sol", variant: "low" },
        documenting: { model: "apai/gpt-6.1-sol", variant: "medium" },
        coding: { model: "openai/gpt-5.5", variant: "xhigh" },
        "normal-task": { requirement: { fallbackChain: [
          { providers: ["apai"], model: "gpt-6.1-sol", reasoningEffort: "minimal" },
        ] } },
      },
    },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })
  const bySource = new Map(agents.map((agent) => [agent.sourceName, agent]))
  for (const [role, model, effort] of [
    ["orchestrator", "gpt-5.4", "xhigh"],
    ["builder", "gpt-5.6-sol", "max"],
    ["clarifier", "gpt-5.6-terra", "high"],
    ["doc-search", "gpt-5.4-mini", "low"],
    ["code-search", "gpt-6-luna", "medium"],
    ["planner", "gpt-6.2-astra", "max"],
    ["oracle-low", "gpt-6.1-sol", "xhigh"],
    ["oracle-max", "gpt-6.1-sol", "max"],
    ["reviewer", "gpt-6.1-sol", "xhigh"],
    ["plan-critic-low", "gpt-6.1-sol", "xhigh"],
    ["quick", "gpt-6.1-sol", "low"],
    ["documenting", "gpt-6.1-sol", "medium"],
    ["coding", "gpt-5.5", "xhigh"],
    ["normal-task", "gpt-6.1-sol", "low"],
  ]) {
    assert.deepEqual([bySource.get(role!)?.model, bySource.get(role!)?.reasoningEffort], [model, effort], role)
  }
  assert.deepEqual(bySource.get("orchestrator")?.preferredChain, ["openai/gpt-5.4", "openai/gpt-6.1-sol"])
})

test("Codex project configuration loads without user profiles and generates configured role models", { concurrency: false }, async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-project-"))
  const codexHome = mkdtempSync(join(tmpdir(), "ocmm-codex-oa-home-"))
  const previous = {
    CODEX_HOME: process.env.CODEX_HOME,
    OCMM_PROFILE: process.env.OCMM_PROFILE,
    OCMM_NO_PROFILE: process.env.OCMM_NO_PROFILE,
  }
  const source = {
    agents: {
      orchestrator: ["apai/gpt-6.1-sol", "high"],
      planner: ["apai/gpt-6-astra", "high"],
      reviewer: ["apai/gpt-6-astra", "high"],
      clarifier: ["apai/gpt-6.1-sol", "high"],
      "plan-critic": ["apai/gpt-6-astra", "high"],
      oracle: ["apai/gpt-6.1-sol", "xhigh"],
      "oracle-2nd": ["apai/gpt-6.1-sol", "high"],
      "doc-search": ["apai/gpt-6-luna", "high"],
      explore: ["apai/gpt-6-luna", "medium"],
      "code-search": ["apai/gpt-6-luna", "medium"],
      "media-reader": ["apai/gpt-6-luna", "high"],
    },
    categories: {
      "hard-reasoning": ["apai/gpt-6-astra", "max"],
      deep: ["apai/gpt-6-astra", "high"],
      complex: ["apai/gpt-6.1-sol", "xhigh"],
      creative: ["apai/gpt-6-astra", "high"],
      frontend: ["apai/gpt-6-astra", "xhigh"],
      research: ["apai/gpt-6.1-sol", "high"],
      quick: ["apai/gpt-6-luna", "medium"],
      coding: ["apai/gpt-6.1-sol", "xhigh"],
      "normal-task": ["apai/gpt-6.1-sol", "high"],
      documenting: ["apai/gpt-6.1-sol", "medium"],
    },
  } as const
  const expectedGenerated = {
    orchestrator: ["gpt-6.1-sol", "high"],
    planner: ["gpt-6-astra", "high"],
    reviewer: ["gpt-6-astra", "xhigh"],
    clarifier: ["gpt-6.1-sol", "high"],
    "plan-critic": ["gpt-6-astra", "xhigh"],
    oracle: ["gpt-6.1-sol", "xhigh"],
    "oracle-2nd": ["gpt-6.1-sol", "xhigh"],
    "doc-search": ["gpt-6-luna", "high"],
    explore: ["gpt-6-luna", "medium"],
    "code-search": ["gpt-6-luna", "medium"],
    "media-reader": ["gpt-6-luna", "high"],
    "hard-reasoning": ["gpt-6-astra", "max"],
    deep: ["gpt-6-astra", "high"],
    complex: ["gpt-6.1-sol", "xhigh"],
    creative: ["gpt-6-astra", "high"],
    frontend: ["gpt-6-astra", "xhigh"],
    research: ["gpt-6.1-sol", "high"],
    quick: ["gpt-6-luna", "medium"],
    coding: ["gpt-6.1-sol", "xhigh"],
    "normal-task": ["gpt-6.1-sol", "high"],
    documenting: ["gpt-6.1-sol", "medium"],
  }
  try {
    process.env.CODEX_HOME = codexHome
    process.env.OCMM_PROFILE = "oa"
    process.env.OCMM_NO_PROFILE = "1"

    const configPath = join(projectRoot, ".codex", "ocmm.jsonc")
    mkdirSync(join(projectRoot, ".codex"))
    writeFileSync(configPath, JSON.stringify(Object.fromEntries(
      Object.entries(source).map(([group, entries]) => [group, Object.fromEntries(
        Object.entries(entries).map(([name, [model, variant]]) => [name, { model, variant }]),
      )]),
    )))

    const loaded = loadConfig({ cwd: projectRoot, host: "codex", includeUser: false })
    assert.deepEqual(loaded.sources, { project: configPath })
    assert.equal(loaded.activeProfile, undefined)
    assert.deepEqual(Object.keys(loaded.config.agents ?? {}).sort(), Object.keys(source.agents).sort())
    assert.deepEqual(Object.keys(loaded.config.categories ?? {}).sort(), Object.keys(source.categories).sort())
    assert.deepEqual(loaded.config.agents?.orchestrator, { model: "apai/gpt-6.1-sol", variant: "high" })

    writeFileSync(join(codexHome, "ocmm.jsonc"), JSON.stringify({ agents: { orchestrator: { model: "apai/gpt-5.6-luna", variant: "max" } } }))
    const withoutUserBase = loadConfig({ cwd: projectRoot, host: "codex", includeUser: false })
    assert.deepEqual(withoutUserBase.sources, { project: configPath })
    assert.equal(withoutUserBase.config.agents?.orchestrator?.model, "apai/gpt-6.1-sol")

    const profileDir = join(codexHome, "ocmm-profiles")
    mkdirSync(profileDir)
    writeFileSync(join(profileDir, "oa.jsonc"), JSON.stringify({ agents: { orchestrator: { model: "apai/gpt-5.5", variant: "xhigh" } } }))
    delete process.env.OCMM_NO_PROFILE
    const leaked = loadConfig({ cwd: projectRoot, host: "codex", includeUser: false })
    assert.equal(leaked.sources.user, undefined)
    assert.equal(leaked.activeProfile, "oa")
    assert.equal(leaked.config.agents?.orchestrator?.model, "apai/gpt-5.5")

    process.env.OCMM_NO_PROFILE = "1"
    const isolated = loadConfig({ cwd: projectRoot, host: "codex", includeUser: false })
    assert.deepEqual(isolated.sources, { project: configPath })
    assert.equal(isolated.activeProfile, undefined)
    assert.equal(isolated.config.agents?.orchestrator?.model, "apai/gpt-6.1-sol")
    const adapter = loadAdapterConfig(projectRoot)
    assert.equal(adapter.host, "codex")
    assert.equal(adapter.config.workflow, "codex")
    assert.equal(adapter.config.agents?.orchestrator?.model, "apai/gpt-6.1-sol")
    const agents = await buildCodexAgents({ config: adapter.config, cwd: projectRoot, skillsRoot: join(projectRoot, "skills") })
    assert.deepEqual(
      Object.fromEntries(agents.map(({ sourceName, model, reasoningEffort }) => [sourceName, [model, reasoningEffort]])),
      expectedGenerated,
    )
    assert.deepEqual(agents.map(({ name }) => name).sort(), Object.keys(expectedGenerated).map((name) => `dw-${name}`).sort())
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(codexHome, { recursive: true, force: true })
    rmSync(projectRoot, { recursive: true, force: true })
  }
})

test("Codex generated synthetic Opus 5 layer is orchestrator-only", async (t) => {
  const promptsRoot = makePromptFixture()
  t.after(() => rmSync(promptsRoot, { recursive: true, force: true }))
  const config = { ...defaultConfig(), workflow: "codex" as const, promptsRoot }
  const agents = await buildCodexAgents({
    config,
    cwd: process.cwd(),
    skillsRoot: join(promptsRoot, "skills"),
  })
  const bySource = new Map(agents.map((agent) => [agent.sourceName, agent]))
  const orchestrator = bySource.get("orchestrator")
  const planner = bySource.get("planner")
  const opusPrompt = getDeepworkPrompt("claude-opus-5").trim()
  const gptPrompt = getDeepworkPrompt("gpt").trim()

  assert.ok(orchestrator)
  assert.ok(planner)
  assert.equal(orchestrator.model, "gpt-6-astra")
  assert.equal(planner.model, "gpt-6-astra")
  assert.equal(orchestrator.preferredChain[0], "anthropic/claude-opus-5")
  assert.equal(planner.preferredChain[0], "anthropic/claude-opus-5")

  for (const agent of agents) {
    const expectedOpusCount = agent.sourceName === "orchestrator" ? 1 : 0
    const instructions = normalizeLf(agent.developerInstructions)
    assert.equal(countOccurrences(instructions, opusPrompt), expectedOpusCount, agent.sourceName)
    assert.equal(countOccurrences(instructions, gptPrompt), 1, `${agent.sourceName}: generic GPT carriage`)
  }

  const explicitlyConfigured = await buildCodexAgents({
    config: {
      ...config,
      agents: {
        orchestrator: { model: "openai/gpt-5.5" },
        planner: { model: "openai/gpt-5.5" },
      },
    },
    cwd: process.cwd(),
    skillsRoot: join(promptsRoot, "skills"),
  })
  const explicitBySource = new Map(explicitlyConfigured.map((agent) => [agent.sourceName, agent]))
  assert.equal(explicitBySource.get("orchestrator")?.model, "gpt-5.5")
  assert.equal(explicitBySource.get("planner")?.model, "gpt-5.5")

  const root = mkdtempSync(join(tmpdir(), "ocmm-codex-opus5-carriage-"))
  const previousCodexHome = process.env.CODEX_HOME
  const previousNoProfile = process.env.OCMM_NO_PROFILE
  try {
    const codexHome = join(root, "codex-home")
    mkdirSync(codexHome)
    process.env.CODEX_HOME = codexHome
    process.env.OCMM_NO_PROFILE = "1"
    const result = await generateCodexPlugin({
      projectRoot: promptsRoot,
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, CODEX_PROJECT_AGENTS_DIR),
      config,
      packageVersion: "9.9.9",
    })
    const generatedAgentsRoot = join(result.pluginRoot, "agents")
    const temporaryOrchestrator = readFileSync(join(generatedAgentsRoot, "dw-orchestrator.toml"), "utf8")
    const temporaryInstructions = parseGeneratedDeveloperInstructions(temporaryOrchestrator, "temporary dw-orchestrator")

    assert.equal(countOccurrences(temporaryInstructions, opusPrompt), 1)
    for (const file of readdirSync(generatedAgentsRoot).filter((name) => name.endsWith(".toml"))) {
      if (file === "dw-orchestrator.toml") continue
      const instructions = parseGeneratedDeveloperInstructions(readFileSync(join(generatedAgentsRoot, file), "utf8"), file)
      assert.equal(countOccurrences(instructions, opusPrompt), 0, file)
      assert.equal(countOccurrences(instructions, gptPrompt), 1, `${file}: generic GPT carriage`)
    }

  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = previousCodexHome
    if (previousNoProfile === undefined) delete process.env.OCMM_NO_PROFILE
    else process.env.OCMM_NO_PROFILE = previousNoProfile
    rmSync(root, { recursive: true, force: true })
  }
})

test("Codex agents inherit compression and review-session policies by managed identity", async () => {
  const agents = await buildCodexAgents({
    config: {
      ...defaultConfig(),
      workflow: "codex",
      agents: { reviewer: { variants: { high: "high" as const } } },
    },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })
  const agent = (sourceName: string) => {
    const found = agents.find((candidate) => candidate.sourceName === sourceName)
    assert.ok(found, `missing ${sourceName} agent`)
    return found
  }
  const compressionTag = "ocmm-subagent-compression-policy"
  const reviewSessionTag = "ocmm-review-session-efficiency-policy"
  const orchestrator = agent("orchestrator")
  const builder = agent("builder")
  const planner = agent("planner")
  const reviewer = agent("reviewer")
  const reviewerHigh = agent("reviewer-high")
  const planCritic = agent("plan-critic")
  const coding = agent("coding")
  const codeSearch = agent("code-search")
  const explore = agent("explore")
  const creative = agent("creative")
  const oracle = agent("oracle")
  const oracle2nd = agent("oracle-2nd")

  assert.doesNotMatch(orchestrator.developerInstructions, new RegExp(`<${compressionTag}>`))
  const reviewSessionPolicy = extractTaggedPolicy(orchestrator.developerInstructions, reviewSessionTag)
  assert.ok(reviewSessionPolicy.trim().length > 0)
  for (const candidate of [builder, planner, reviewer, planCritic, coding]) {
    assert.doesNotMatch(candidate.developerInstructions, new RegExp(`<${reviewSessionTag}>`), candidate.sourceName)
  }
  assert.doesNotMatch(builder.developerInstructions, new RegExp(`<${compressionTag}>`))

  const commonCompressionPolicy = extractTaggedPolicy(codeSearch.developerInstructions, compressionTag)
  for (const candidate of [explore, planner, creative]) {
    assert.ok(extractTaggedPolicy(candidate.developerInstructions, compressionTag).trim().length > 0, candidate.sourceName)
  }
  assert.ok(commonCompressionPolicy.trim().length > 0)

  for (const candidate of [reviewer, reviewerHigh, oracle, oracle2nd]) {
    const policy = extractTaggedPolicy(candidate.developerInstructions, compressionTag)
    assert.ok(policy.trim().length > 0, candidate.sourceName)
  }
})

test("Codex emits only configured logical tiers and later Oracle slots", async () => {
  const config = {
    ...defaultConfig(),
    workflow: "codex" as const,
    agents: {
      oracle: { variants: { high: "max" as const } },
      "oracle-3rd": { model: "openai/gpt-5.6-sol", variants: { max: "max" as const } },
      reviewer: { variants: { low: "low" as const } },
    },
  }
  const agents = await buildCodexAgents({
    config,
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })
  const names = agents.map((agent) => agent.name)
  for (const name of ["dw-oracle-high", "dw-oracle-3rd", "dw-oracle-3rd-max", "dw-reviewer-low"]) {
    assert.ok(names.includes(name), name)
  }
  assert.equal(names.includes("dw-oracle-low"), false)
  assert.equal(names.includes("dw-reviewer-2nd"), false)
})

test("Codex review floors use parsed identities and preserve GPT-5.6 native max", async () => {
  const config = {
    ...defaultConfig(),
    workflow: "codex" as const,
    agents: {
      oracle: { model: "openai/gpt-5.6-terra", variants: { low: "low" as const, max: "max" as const } },
      "oracle-2nd": { model: "openai/gpt-5.5", variants: { low: "minimal" as const } },
      reviewer: { model: "openai/gpt-5.6-sol", variants: { max: "max" as const } },
    },
  }
  const agents = await buildCodexAgents({ config, cwd: process.cwd(), skillsRoot: join(process.cwd(), "skills") })
  const effort = new Map(agents.map((agent) => [agent.sourceName, agent.reasoningEffort]))
  assert.equal(effort.get("oracle-low"), "xhigh")
  assert.equal(effort.get("oracle-max"), "max")
  assert.equal(effort.get("oracle-2nd-low"), "xhigh")
  assert.equal(effort.get("reviewer-max"), "max")
})

test("Codex emits only configured planning tiers with canonical prompt layers and critic floors", async (t) => {
  const promptsRoot = makePromptFixture()
  t.after(() => rmSync(promptsRoot, { recursive: true, force: true }))
  const agents = await buildCodexAgents({
    config: {
      ...defaultConfig(),
      workflow: "codex",
      promptsRoot,
      agents: {
        planner: { variants: { high: { model: "openai/gpt-5.6-sol", variant: "max" as const } } },
        "plan-critic": {
          variants: {
            low: { model: "openai/gpt-5.5", variant: "low" as const },
            max: { model: "openai/gpt-5.6-sol", variant: "max" as const },
          },
        },
      },
    },
    cwd: process.cwd(),
    skillsRoot: join(promptsRoot, "skills"),
  })
  const bySource = new Map(agents.map((agent) => [agent.sourceName, agent]))

  assert.equal(bySource.has("planner-high"), true)
  assert.equal(bySource.has("planner-low"), false)
  assert.equal(bySource.has("planner-max"), false)
  assert.equal(bySource.has("plan-critic-low"), true)
  assert.equal(bySource.has("plan-critic-high"), false)
  assert.equal(bySource.has("plan-critic-max"), true)
  assert.equal(bySource.get("planner-high")!.name, "dw-planner-high")
  assert.equal(bySource.get("planner-high")!.model, "gpt-5.6-sol")
  assert.equal(bySource.get("planner-high")!.reasoningEffort, "max")
  assert.equal(bySource.get("plan-critic-low")!.model, "gpt-5.5")
  assert.equal(bySource.get("plan-critic-low")!.reasoningEffort, "xhigh")
  assert.equal(bySource.get("plan-critic-max")!.model, "gpt-5.6-sol")
  assert.equal(bySource.get("plan-critic-max")!.reasoningEffort, "max")
  assert.equal(
    extractOriginalDeepworkPrompt(bySource.get("planner-high")!.developerInstructions),
    extractOriginalDeepworkPrompt(bySource.get("planner")!.developerInstructions),
  )
  for (const sourceName of ["plan-critic-low", "plan-critic-max"] as const) {
    assert.equal(
      extractOriginalDeepworkPrompt(bySource.get(sourceName)!.developerInstructions),
      extractOriginalDeepworkPrompt(bySource.get("plan-critic")!.developerInstructions),
      sourceName,
    )
  }
  assert.deepEqual(
    [...renderPlanningLogicalTierProfiles(agents).matchAll(/`(dw-[^`]+)`/g)].map((match) => match[1]),
    ["dw-planner", "dw-planner-high", "dw-plan-critic", "dw-plan-critic-low", "dw-plan-critic-max"],
  )
})

test("Codex planning inventory omits a disabled planning role", async () => {
  const agents = await buildCodexAgents({
    config: {
      ...defaultConfig(),
      workflow: "codex",
      disabledAgents: ["planner"],
    },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })

  assert.deepEqual(
    [...renderPlanningLogicalTierProfiles(agents).matchAll(/`(dw-[^`]+)`/g)].map((match) => match[1]),
    ["dw-plan-critic"],
  )
})

test("Codex planning inventory reports when both planning roles are disabled", async () => {
  const agents = await buildCodexAgents({
    config: {
      ...defaultConfig(),
      workflow: "codex",
      disabledAgents: ["planner", "plan-critic"],
    },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })

  assert.deepEqual([...renderPlanningLogicalTierProfiles(agents).matchAll(/`(dw-[^`]+)`/g)], [])
})

test("Codex floors non-GPT plan critics without flooring planners", async (t) => {
  const promptsRoot = makePromptFixture()
  t.after(() => rmSync(promptsRoot, { recursive: true, force: true }))
  const config = {
    ...defaultConfig(),
    workflow: "codex" as const,
    promptsRoot,
    agents: {
      planner: {
        variants: {
          low: { model: "github-copilot/claude-sonnet-4-6", variant: "low" as const },
        },
      },
      "plan-critic": {
        variants: {
          low: { model: "github-copilot/claude-sonnet-4-6", variant: "low" as const },
        },
      },
      oracle: {
        variants: {
          low: { model: "github-copilot/claude-sonnet-4-6", variant: "low" as const },
        },
      },
      reviewer: {
        variants: {
          low: { model: "github-copilot/claude-sonnet-4-6", variant: "low" as const },
        },
      },
    },
  }
  const agents = await buildCodexAgents({
    config,
    cwd: process.cwd(),
    skillsRoot: join(promptsRoot, "skills"),
  })
  const bySource = new Map(agents.map((agent) => [agent.sourceName, agent]))
  assert.equal(bySource.get("planner-low")?.model, "claude-sonnet-4-6")
  assert.equal(bySource.get("planner-low")?.reasoningEffort, "high")
  assert.equal(bySource.get("plan-critic-low")?.model, "claude-sonnet-4-6")
  assert.equal(bySource.get("plan-critic-low")?.reasoningEffort, "xhigh")
  assert.equal(bySource.get("oracle-low")?.reasoningEffort, "high")
  assert.equal(bySource.get("reviewer-low")?.reasoningEffort, "high")

  const root = mkdtempSync(join(tmpdir(), "codex-non-gpt-planning-floor-"))
  try {
    const result = await generateCodexPlugin({
      projectRoot: promptsRoot,
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: false,
      config,
      packageVersion: "9.9.9",
    })
    const plannerLow = readFileSync(join(result.pluginRoot, "agents", "dw-planner-low.toml"), "utf8")
    const criticLow = readFileSync(join(result.pluginRoot, "agents", "dw-plan-critic-low.toml"), "utf8")
    const oracleLow = readFileSync(join(result.pluginRoot, "agents", "dw-oracle-low.toml"), "utf8")
    const reviewerLow = readFileSync(join(result.pluginRoot, "agents", "dw-reviewer-low.toml"), "utf8")
    assert.match(plannerLow, /^model_reasoning_effort = "high"$/m)
    assert.match(criticLow, /^model_reasoning_effort = "xhigh"$/m)
    assert.match(oracleLow, /^model_reasoning_effort = "high"$/m)
    assert.match(reviewerLow, /^model_reasoning_effort = "high"$/m)
    for (const [name, toml] of [["planner-low", plannerLow], ["plan-critic-low", criticLow], ["oracle-low", oracleLow], ["reviewer-low", reviewerLow]] as const) {
      const instructions = parseGeneratedDeveloperInstructions(toml, name)
      assert.equal(countOccurrences(instructions, getDeepworkPrompt("gpt").trim()), 1, `${name}: guarded GPT source survives TOML rendering`)
      assert.equal(countOccurrences(instructions, getDeepworkPrompt("codex").trim()), 1, `${name}: adapter survives non-GPT selection`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("temporary Codex generation writes configured planning tiers to plugin and project copies", async (t) => {
  const promptsRoot = makePromptFixture()
  t.after(() => rmSync(promptsRoot, { recursive: true, force: true }))
  const root = mkdtempSync(join(tmpdir(), "codex-planning-tiers-"))
  try {
    const result = await generateCodexPlugin({
      projectRoot: promptsRoot,
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, CODEX_PROJECT_AGENTS_DIR),
      config: {
        ...defaultConfig(),
        workflow: "codex",
        promptsRoot,
        agents: {
          planner: { variants: { high: { model: "openai/gpt-5.6-sol", variant: "max" as const } } },
          "plan-critic": {
            variants: {
              low: { model: "openai/gpt-5.5", variant: "low" as const },
              max: { model: "openai/gpt-5.6-sol", variant: "max" as const },
            },
          },
        },
      },
      packageVersion: "9.9.9",
    })
    const pluginAgents = join(result.pluginRoot, "agents")
    const projectAgents = result.projectAgentsRoot
    assert.ok(projectAgents)

    for (const sourceName of ["planner-high", "plan-critic-low", "plan-critic-max"] as const) {
      const filename = `${CODEX_AGENT_PREFIX}-${sourceName}.toml`
      const pluginCopy = readFileSync(join(pluginAgents, filename), "utf8")
      const projectCopy: string = readFileSync(join(projectAgents, filename), "utf8")
      assert.equal(projectCopy, pluginCopy, `${sourceName} project/plugin copies`)
      const instructions = parseGeneratedDeveloperInstructions(pluginCopy, sourceName)
      assert.equal(countOccurrences(instructions, getDeepworkPrompt("gpt").trim()), 1, `${sourceName}: generic GPT source rendered once`)
    }
    for (const sourceName of ["planner-low", "planner-max", "plan-critic-high"] as const) {
      const filename = `${CODEX_AGENT_PREFIX}-${sourceName}.toml`
      assert.equal(existsSync(join(pluginAgents, filename)), false, `${sourceName} plugin copy`)
      assert.equal(existsSync(join(projectAgents, filename)), false, `${sourceName} project copy`)
    }

    const plannerHigh = readFileSync(join(pluginAgents, "dw-planner-high.toml"), "utf8")
    const criticLow = readFileSync(join(pluginAgents, "dw-plan-critic-low.toml"), "utf8")
    const criticMax = readFileSync(join(pluginAgents, "dw-plan-critic-max.toml"), "utf8")
    assert.match(plannerHigh, /^model = "gpt-5\.6-sol"$/m)
    assert.match(plannerHigh, /^model_reasoning_effort = "max"$/m)
    assert.match(criticLow, /^model = "gpt-5\.5"$/m)
    assert.match(criticLow, /^model_reasoning_effort = "xhigh"$/m)
    assert.match(criticMax, /^model = "gpt-5\.6-sol"$/m)
    assert.match(criticMax, /^model_reasoning_effort = "max"$/m)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("Codex first-slot logical-high profile generates only from agents.oracle.variants.high", async () => {
  const agents = await buildCodexAgents({
    config: {
      ...defaultConfig(),
      workflow: "codex",
      agents: { oracle: { model: "openai/gpt-5.6-sol", variants: { high: "max" as const } } },
    },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })
  const oracleHigh = agents.find((agent) => agent.sourceName === "oracle-high")
  assert.ok(oracleHigh)
  assert.equal(oracleHigh.name, `${CODEX_AGENT_PREFIX}-oracle-high`)
  assert.equal(oracleHigh.reasoningEffort, "max")
})

test("Codex generation resolves arbitrary multi-hop reviewer and oracle-2nd aliases", async (t) => {
  const promptsRoot = makePromptFixture()
  t.after(() => rmSync(promptsRoot, { recursive: true, force: true }))
  const agents = await buildCodexAgents({
    config: {
      ...defaultConfig(),
      workflow: "codex",
      promptsRoot,
      agents: {
        reviewer: { alias: "review-policy-a" },
        "review-policy-a": { alias: "review-policy-b" },
        "review-policy-b": { alias: "review-model" },
        "review-model": { model: "openai/gpt-5.6-sol", variant: "minimal" as const },
        "oracle-2nd": { description: "inherits the effective reviewer model", alias: "review-policy-b" },
      },
    },
    cwd: process.cwd(),
    skillsRoot: join(promptsRoot, "skills"),
  })

  for (const role of ["reviewer", "oracle-2nd"]) {
    const agent = agents.find((candidate) => candidate.sourceName === role)
    assert.equal(agent?.model, "gpt-5.6-sol")
    assert.equal(agent?.reasoningEffort, "xhigh")
    assert.ok(agent)
    assert.equal(countOccurrences(extractOriginalDeepworkPrompt(agent.developerInstructions), getDeepworkPrompt("gpt").trim()), 1, `${role}: alias calibration`)
  }
})

test("release CLI delivers defaults independently of project configuration and MCP files", (t) => {
  const root = makePromptFixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  cpSync(join(root, "codex"), join(root, "prompts", "codex"), { recursive: true })
  cpSync(join(root, "shared"), join(root, "prompts", "shared"), { recursive: true })
  writeFixtureFile(root, "package.json", JSON.stringify({ version: "9.9.9" }))
  const script = join(process.cwd(), "scripts", "gen-codex-plugin.ts")
  const env = {
    ...process.env,
    CODEX_HOME: join(root, "home"),
    XDG_CONFIG_HOME: join(root, "xdg-config"),
    OCMM_PROFILE: "release-fixture",
    OCMM_NO_PROFILE: "",
  }
  const generate = () => execFileSync(process.execPath, ["--experimental-strip-types", script, "--release"], { cwd: root, env })
  const profiles = () => Object.fromEntries(readdirSync(join(root, CODEX_PROJECT_AGENTS_DIR)).map((file) => {
    const agent = parseGeneratedAgentToml(readFileSync(join(root, CODEX_PROJECT_AGENTS_DIR, file), "utf8"), file)
    return [agent.name, [agent.model, agent.model_reasoning_effort]]
  }))
  const manifest = () => JSON.parse(readFileSync(join(root, CODEX_PLUGIN_DIR, ".mcp.json"), "utf8"))

  generate()
  const defaults = profiles()
  const defaultMcps = manifest()
  assert.deepEqual(defaults["dw-orchestrator"], ["gpt-6-astra", "high"])
  assert.deepEqual(defaults["dw-planner"], ["gpt-6-astra", "xhigh"])
  assert.deepEqual(defaultMcps.mcpServers.lsp, { command: "node", args: ["./dist/cli/ocmm-lsp.js", "mcp"], cwd: "." })

  const custom = {
    agents: { orchestrator: { model: "openai/gpt-6.1-sol", variant: "medium" } },
    disabledAgents: ["builder"],
    mcp: { servers: { privateConfig: { type: "remote", url: "https://config.invalid/mcp" } } },
    promptsRoot: join(root, "custom-prompts"),
  }
  writeFixtureFile(root, ".codex/ocmm.jsonc", JSON.stringify(custom))
  writeFixtureFile(root, ".opencode/ocmm.jsonc", JSON.stringify(custom))
  writeFixtureFile(root, "home/ocmm-profiles/release-fixture.jsonc", JSON.stringify(custom))
  writeFixtureFile(root, "xdg-config/opencode/ocmm-profiles/release-fixture.jsonc", JSON.stringify(custom))
  writeFixtureFile(root, ".mcp.json", JSON.stringify({ mcp: {
    lsp: { type: "local", command: ["synthetic-private-lsp"] },
    privateProject: { type: "remote", url: "https://project.invalid/mcp" },
  } }))

  generate()
  assert.deepEqual(profiles(), defaults)
  assert.deepEqual(manifest(), defaultMcps)
})

test("custom CLI keeps Codex then OpenCode precedence and explicit adapter config wins", (t) => {
  const root = makePromptFixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  cpSync(join(root, "codex"), join(root, "prompts", "codex"), { recursive: true })
  writeFixtureFile(root, "package.json", JSON.stringify({ version: "9.9.9" }))
  writeFixtureFile(root, ".codex/ocmm.jsonc", JSON.stringify({
    agents: { orchestrator: { model: "openai/gpt-6.1-sol", variant: "medium" } },
    disabledMcps: ["websearch"],
    mcp: { servers: { docs: { type: "remote", url: "https://config.invalid/mcp" } } },
  }))
  writeFixtureFile(root, ".opencode/ocmm.jsonc", JSON.stringify({ agents: { orchestrator: { model: "openai/gpt-6-luna", variant: "high" } } }))
  writeFixtureFile(root, ".mcp.json", JSON.stringify({ mcp: {
    lsp: { type: "local", command: ["synthetic-custom-lsp"] },
    docs: { type: "remote", url: "https://project.invalid/mcp" },
    websearch: { type: "remote", url: "https://disabled.invalid/mcp" },
  } }))
  const script = join(process.cwd(), "scripts", "gen-codex-plugin.ts")
  const env = { ...process.env, CODEX_HOME: join(root, "home"), XDG_CONFIG_HOME: join(root, "xdg-config"), OCMM_NO_PROFILE: "1" }
  const generate = () => execFileSync(process.execPath, ["--experimental-strip-types", script], { cwd: root, env })
  const orchestrator = () => parseGeneratedAgentToml(readFileSync(join(root, CODEX_PROJECT_AGENTS_DIR, "dw-orchestrator.toml"), "utf8"), "orchestrator")

  const explicit = { ...defaultConfig(), workflow: "codex" as const, agents: { orchestrator: { model: "openai/gpt-5.6-sol" } } }
  assert.deepEqual(loadAdapterConfig(root, explicit), { config: explicit, host: "provided" })
  generate()
  assert.deepEqual([orchestrator().model, orchestrator().model_reasoning_effort], ["gpt-6.1-sol", "medium"])
  const mcp = JSON.parse(readFileSync(join(root, CODEX_PLUGIN_DIR, ".mcp.json"), "utf8"))
  assert.equal(mcp.mcpServers.lsp.command, "synthetic-custom-lsp")
  assert.equal(mcp.mcpServers.docs.url, "https://config.invalid/mcp")
  assert.equal(mcp.mcpServers.websearch, undefined)

  rmSync(join(root, ".codex", "ocmm.jsonc"))
  generate()
  assert.deepEqual([orchestrator().model, orchestrator().model_reasoning_effort], ["gpt-6-luna", "high"])
})

test("generateCodexPlugin writes a self-contained bundle", async () => {
  const root = mkdtempSync(join(tmpdir(), "deepwork-codex-plugin-"))
  try {
    const config = {
      ...defaultConfig(),
      workflow: "codex" as const,
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
    const builder = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-builder.toml`), "utf8")
    const oracle = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-oracle.toml`), "utf8")
    const oracle2nd = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-oracle-2nd.toml`), "utf8")
    const reviewer = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-reviewer.toml`), "utf8")
    const creative = readFileSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-creative.toml`), "utf8")
    const workflowSkill = readFileSync(join(result.pluginRoot, "skills", CODEX_WORKFLOW_SKILL_NAME, "SKILL.md"), "utf8")
    const deepworkSkill = readFileSync(join(result.pluginRoot, "skills", "deepwork-writing-plans", "SKILL.md"), "utf8")
    const frontendSkill = readFileSync(join(result.pluginRoot, "skills", "frontend", "SKILL.md"), "utf8")
    const mcpManifest = readFileSync(join(result.pluginRoot, ".mcp.json"), "utf8")
    const mcp = JSON.parse(mcpManifest) as { mcpServers: Record<string, { args?: string[] }> }
    const lspEntrypoint = mcp.mcpServers.lsp?.args?.[0] ?? ""

    assert.equal(manifest.version, "9.9.9")
    assert.equal(runtimePackage.type, "module")
    assert.equal(marketplace.name, CODEX_MARKETPLACE_NAME)
    assert.match(mcpManifest, /"lsp"/)
    assert.match(mcpManifest, /ocmm-lsp\.js/)
    assert.equal(isAbsolute(lspEntrypoint), false)
    parseGeneratedAgentToml(orchestrator, "generated orchestrator TOML")
    assert.ok(frontendSkill.length > 0, "frontend skill resource is delivered")
    assert.match(orchestrator, /^name = "dw-orchestrator"$/m)
    assert.doesNotMatch(orchestrator, /<ocmm-subagent-compression-policy>/)
    assert.ok(extractTaggedPolicy(orchestrator, "ocmm-review-session-efficiency-policy").trim().length > 0)
    assert.doesNotMatch(builder, /<ocmm-(?:subagent-compression-policy|review-session-efficiency-policy)>/)
    assert.ok(extractTaggedPolicy(reviewer, "ocmm-subagent-compression-policy").trim().length > 0)
    assert.match(oracle, /^name = "dw-oracle"$/m)
    assert.match(oracle, /^model_reasoning_effort = "xhigh"$/m)
    assert.match(oracle2nd, /^name = "dw-oracle-2nd"$/m)
    assert.match(oracle2nd, /^model_reasoning_effort = "xhigh"$/m)
    assert.match(reviewer, /^name = "dw-reviewer"$/m)
    assert.match(reviewer, /^model_reasoning_effort = "xhigh"$/m)
    assert.match(creative, /^name = "dw-creative"$/m)
    assert.match(workflowSkill, /^---\nname: deepwork$/m)
    assert.equal(existsSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-oracle-high.toml`)), false)
    assert.match(deepworkSkill, /^---\nname: deepwork-writing-plans$/m)

    assert.equal(result.agentCount > 10, true)
    assert.equal(result.skillCount >= 6, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("Codex runtime filtering activates only for a complete .npmignore marker signature", async () => {
  const sourceRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-runtime-filter-source-"))
  const outputRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-runtime-filter-output-"))
  try {
    const completeName = "runtime-filter-complete"
    writeRuntimeFilterFixture(sourceRoot, completeName, [
      "# comments and whitespace must not affect signature detection",
      "",
      " .gitignore \r",
      "./pyrightconfig.json ",
      ".\\scripts\\tests\\",
      " *.py[cod]",
    ])
    const completeGenerated = await generateFixtureSkill(sourceRoot, outputRoot, completeName)
    assert.deepEqual(
      listRelativeFiles(completeGenerated),
      ["SKILL.md", "keep.txt", "scripts/runtime.py"],
      "complete signature keeps only runtime files",
    )

    for (const missingMarker of RUNTIME_FILTER_MARKERS) {
      const name = `runtime-filter-without-${RUNTIME_FILTER_MARKERS.indexOf(missingMarker)}`
      const source = writeRuntimeFilterFixture(
        sourceRoot,
        name,
        RUNTIME_FILTER_MARKERS.filter((marker) => marker !== missingMarker),
      )
      const generated = await generateFixtureSkill(sourceRoot, outputRoot, name)
      assertFullSkillCopyExceptRouter(`missing ${missingMarker}`, source, generated)
      assert.deepEqual(
        readFileSync(join(generated, ".npmignore")),
        readFileSync(join(source, ".npmignore")),
        `missing ${missingMarker} preserves .npmignore`,
      )
    }

    const unmarkedName = "runtime-filter-unmarked"
    const unmarkedSource = writeRuntimeFilterFixture(sourceRoot, unmarkedName)
    const unmarkedGenerated = await generateFixtureSkill(sourceRoot, outputRoot, unmarkedName)
    assertFullSkillCopyExceptRouter("unmarked skill", unmarkedSource, unmarkedGenerated)
    assert.equal(existsSync(join(unmarkedGenerated, ".npmignore")), false, "unmarked skill has no generated .npmignore")
  } finally {
    rmSync(sourceRoot, { recursive: true, force: true })
    rmSync(outputRoot, { recursive: true, force: true })
  }
})

test("Codex skill copying writes text with LF and preserves binary bytes", async () => {
  const sourceRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-lf-source-"))
  const outputRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-lf-output-"))
  try {
    const name = "line-ending-fixture"
    const skillRoot = join(sourceRoot, name)
    writeFixtureFile(skillRoot, "SKILL.md", `---\r\nname: ${name}\r\ndescription: CRLF fixture\r\n---\r\n# Fixture\r\n`)
    writeFixtureFile(skillRoot, "references/guide.md", "first\r\nsecond\r\n")
    const binary = Buffer.from([0x00, 0x0d, 0x0a, 0xff])
    writeFixtureFile(skillRoot, "assets/sample.bin", binary)

    const generated = await generateFixtureSkill(sourceRoot, outputRoot, name)

    assert.doesNotMatch(readFileSync(join(generated, "SKILL.md"), "utf8"), /\r/)
    assert.doesNotMatch(readFileSync(join(generated, "references", "guide.md"), "utf8"), /\r/)
    assert.deepEqual(readFileSync(join(generated, "assets", "sample.bin")), binary)
  } finally {
    rmSync(sourceRoot, { recursive: true, force: true })
    rmSync(outputRoot, { recursive: true, force: true })
  }
})

test("Codex skill normalization does not follow directory links", async () => {
  const sourceRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-link-source-"))
  const outputRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-link-output-"))
  const externalRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-link-external-"))
  try {
    const name = "linked-skill-fixture"
    const skillRoot = join(sourceRoot, name)
    writeFixtureFile(skillRoot, "SKILL.md", `---\nname: ${name}\ndescription: Link fixture\n---\n# Fixture\n`)
    const sentinel = Buffer.from("external\r\nsentinel\r\n")
    writeFixtureFile(externalRoot, "sentinel.md", sentinel)
    const sourceLink = join(skillRoot, "linked-external")
    symlinkSync(externalRoot, sourceLink, process.platform === "win32" ? "junction" : "dir")
    assert.equal(lstatSync(sourceLink).isSymbolicLink(), true)

    const generated = await generateFixtureSkill(sourceRoot, outputRoot, name)
    const generatedLink = join(generated, "linked-external")

    assert.deepEqual(readFileSync(join(externalRoot, "sentinel.md")), sentinel)
    assert.equal(existsSync(generatedLink), false, "child directory link must not enter the generated bundle")
    symlinkSync(externalRoot, generatedLink, process.platform === "win32" ? "junction" : "dir")
    assert.equal(lstatSync(generatedLink).isSymbolicLink(), true)
    normalizeCopiedSkillText(generated)
    assert.equal(listRelativeFiles(generated).includes("linked-external/sentinel.md"), false)
    assert.deepEqual(readFileSync(join(generatedLink, "sentinel.md")), sentinel)
  } finally {
    rmSync(sourceRoot, { recursive: true, force: true })
    rmSync(outputRoot, { recursive: true, force: true })
    rmSync(externalRoot, { recursive: true, force: true })
  }
})

test("Codex generation rejects a linked skill source root without touching its target", async () => {
  const sourceParent = mkdtempSync(join(tmpdir(), "ocmm-codex-root-link-source-"))
  const outputRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-root-link-output-"))
  const externalRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-root-link-external-"))
  try {
    const name = "linked-root-skill"
    const externalSkill = join(externalRoot, "actual-skill")
    writeFixtureFile(externalSkill, "SKILL.md", `---\nname: ${name}\ndescription: Linked root\n---\n# External\n`)
    const sentinel = Buffer.from("outside\r\nunchanged\r\n")
    writeFixtureFile(externalSkill, "sentinel.md", sentinel)
    const linkedRoot = join(sourceParent, name)
    symlinkSync(externalSkill, linkedRoot, process.platform === "win32" ? "junction" : "dir")
    assert.equal(lstatSync(linkedRoot).isSymbolicLink(), true)

    await assert.rejects(
      generateFixtureSkill(linkedRoot, outputRoot, name),
    )
    assert.deepEqual(readFileSync(join(externalSkill, "sentinel.md")), sentinel)
    assert.equal(existsSync(join(outputRoot, "plugins", "deepwork", "skills", name)), false)
  } finally {
    rmSync(sourceParent, { recursive: true, force: true })
    rmSync(outputRoot, { recursive: true, force: true })
    rmSync(externalRoot, { recursive: true, force: true })
  }
})

test("Codex generation rejects or excludes a linked SKILL.md without touching its target", async () => {
  const sourceRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-skill-link-source-"))
  const outputRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-skill-link-output-"))
  const externalRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-skill-link-external-"))
  try {
    const name = "linked-document-skill"
    const skillRoot = join(sourceRoot, name)
    mkdirSync(skillRoot, { recursive: true })
    const sentinel = Buffer.from(`---\r\nname: ${name}\r\ndescription: External document\r\n---\r\n# External\r\n`)
    const externalSkill = join(externalRoot, "SKILL.md")
    writeFileSync(externalSkill, sentinel)
    const linkedSkill = join(skillRoot, "SKILL.md")
    let fileSymlinkCreated = false
    try {
      symlinkSync(externalSkill, linkedSkill, "file")
      fileSymlinkCreated = true
    } catch (error) {
      if (process.platform !== "win32" || !["EPERM", "EACCES", "UNKNOWN"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        throw error
      }
      symlinkSync(externalRoot, linkedSkill, "junction")
    }
    assert.equal(lstatSync(linkedSkill).isSymbolicLink(), true)
    assert.throws(
      () => normalizeSkillForCodex(skillRoot),
    )

    if (fileSymlinkCreated) {
      await assert.rejects(
        generateFixtureSkill(sourceRoot, outputRoot, name),
      )
    } else {
      await generateFixtureSkill(sourceRoot, outputRoot, name)
    }
    assert.deepEqual(readFileSync(externalSkill), sentinel)
    assert.equal(existsSync(join(outputRoot, "plugins", "deepwork", "skills", name, "SKILL.md")), false)
  } finally {
    rmSync(sourceRoot, { recursive: true, force: true })
    rmSync(outputRoot, { recursive: true, force: true })
    rmSync(externalRoot, { recursive: true, force: true })
  }
})

test("Codex generated coding-agent-sessions runtime tree delivers filtered resources and executable bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codex-coding-agent-sessions-"))
  try {
    const result = await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: false,
      config: { ...defaultConfig(), workflow: "codex" },
      packageVersion: "9.9.9",
    })
    const sourceRoot = join(process.cwd(), "skills", "coding-agent-sessions")
    const temporaryRoot = join(result.pluginRoot, "skills", "coding-agent-sessions")
    const trackedRoot = join(process.cwd(), CODEX_PLUGIN_DIR, "skills", "coding-agent-sessions")

    for (const [label, skillRoot] of [
      ["temporary", temporaryRoot],
      ["tracked", trackedRoot],
    ] as const) {
      assert.deepEqual(listRelativeFiles(skillRoot), CODING_AGENT_SESSIONS_RUNTIME_FILES, `${label} coding-agent-sessions inventory`)
      for (const file of CODING_AGENT_SESSIONS_RUNTIME_FILES) {
        assert.equal(lstatSync(join(skillRoot, file)).isFile(), true, `${label}/${file} resource is not a regular file`)
      }
    }

    for (const file of CODING_AGENT_SESSIONS_RUNTIME_FILES) {
      const source = readFileSync(join(sourceRoot, file))
      const temporary = readFileSync(join(temporaryRoot, file))
      const tracked = readFileSync(join(trackedRoot, file))
      if (!file.endsWith(".py")) continue
      const expected = expectedCopiedSkillBytes(file, source)
      assert.deepEqual(temporary, expected, `${file} temporary generated copy`)
      assert.deepEqual(tracked, expected, `${file} tracked generated copy`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("Codex generated debugging, frontend, ast-grep, and publish skill trees deliver resources and executable bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "deepwork-codex-shared-skills-"))
  try {
    const result = await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, CODEX_PROJECT_AGENTS_DIR),
      config: { ...defaultConfig(), workflow: "codex" },
      packageVersion: "9.9.9",
    })

    for (const [name, requiredFile] of [
      ["ast-grep", "tests/smoke.ps1"],
      ["debugging", "references/scripts/dap.mjs"],
      ["frontend", "references/design/interaction-skill.md"],
      ["publish", "SKILL.md"],
    ] as const) {
      assertGeneratedSharedSkillTree(
        name,
        join(process.cwd(), "skills", name),
        join(result.pluginRoot, "skills", name),
        join(process.cwd(), CODEX_PLUGIN_DIR, "skills", name),
        requiredFile,
      )
    }

  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("generated Codex bundle delivers configured agent fields and discoverable skills", async () => {
  const root = mkdtempSync(join(tmpdir(), "deepwork-codex-runtime-contract-"))
  try {
    const config = { ...defaultConfig(), workflow: "codex" as const }
    const result = await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, CODEX_PROJECT_AGENTS_DIR),
      config,
      packageVersion: "9.9.9",
    })

    const agents = await buildCodexAgents({ config, cwd: process.cwd(), skillsRoot: join(process.cwd(), "skills") })

    const projectAgentsRoot = result.projectAgentsRoot
    assert.ok(projectAgentsRoot)
    const bundledAgentsRoot = join(result.pluginRoot, "agents")
    const agentFiles = readdirSync(bundledAgentsRoot).filter((name) => name.endsWith(".toml")).sort()
    assert.equal(agentFiles.length, result.agentCount)
    assert.deepEqual(agentFiles, agents.map((agent) => `${agent.name}.toml`).sort())
    assert.deepEqual(readdirSync(projectAgentsRoot).filter((name) => name.endsWith(".toml")).sort(), agentFiles)
    for (const agent of agents) {
      for (const directory of [bundledAgentsRoot, projectAgentsRoot]) {
        const parsed = parseGeneratedAgentToml(readFileSync(join(directory, `${agent.name}.toml`), "utf8"), agent.name)
        assert.equal(parsed.name, agent.name)
        assert.equal(parsed.model, agent.model)
        assert.equal(parsed.model_reasoning_effort, agent.reasoningEffort)
        assert.deepEqual(parsed.nickname_candidates, [agent.name, agent.sourceName])
        assert.ok((parsed.developer_instructions as string).length > 0)
      }
    }

    const skillsRoot = join(result.pluginRoot, "skills")
    const reportFidelity = readFileSync(join(skillsRoot, "deepwork-report-fidelity", "SKILL.md"), "utf8")
    assert.equal(reportFidelity.match(/^name:\s*(.+)$/m)?.[1], "deepwork-report-fidelity")
    assert.ok(reportFidelity.slice(reportFidelity.indexOf("\n---", 3) + 4).trim().length > 0)
    const normalizedSkillNames = readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    assert.equal(normalizedSkillNames.length, result.skillCount)
    for (const name of normalizedSkillNames) {
      const skill = readFileSync(join(skillsRoot, name, "SKILL.md"), "utf8")
      assert.equal(skill.match(/^name:\s*(.+)$/m)?.[1], name, `${name} discoverable skill identity`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

for (const field of ["skills.disable", "disabledSkills"] as const) {
  for (const name of ["report-fidelity", "deepwork-report-fidelity"] as const) {
    test(`report-fidelity delivery respects ${field} using ${name}`, async () => {
      const root = mkdtempSync(join(tmpdir(), "ocmm-codex-disabled-report-"))
      try {
        const config = { ...defaultConfig(), workflow: "codex" as const }
        config.skills.enable = ["report-fidelity"]
        if (field === "skills.disable") config.skills.disable = [name]
        else config.disabledSkills = [name]
        const result = await generateCodexPlugin({
          projectRoot: process.cwd(),
          pluginRoot: join(root, "plugins", "deepwork"),
          marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
          projectAgentsRoot: false,
          config,
          packageVersion: "9.9.9",
        })
        const skillsRoot = join(result.pluginRoot, "skills")
        assert.equal(existsSync(join(skillsRoot, "deepwork-report-fidelity")), false)
        assert.equal(existsSync(join(skillsRoot, "deepwork", "SKILL.md")), true)
        assert.equal(readdirSync(skillsRoot).length, result.skillCount)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  }
}

test("Codex generator packages avoid-ai-slop with its license and gates the shared agent brief with skill selection", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codex-avoid-ai-slop-"))
  const promptsRoot = makePromptFixture()
  const marker = "[fixture:avoid-ai-slop-brief]"
  try {
    writeFixtureFile(promptsRoot, "shared/avoid-ai-slop.md", marker)
    for (const filter of ["enabled", "skills.disable", "disabledSkills", "allow-list"] as const) {
      const config = { ...defaultConfig(), workflow: "codex" as const, promptsRoot }
      config.skills.enable = filter === "allow-list" ? ["publish"] : ["avoid-ai-slop", "publish"]
      if (filter === "skills.disable") config.skills.disable = ["avoid-ai-slop"]
      if (filter === "disabledSkills") config.disabledSkills = ["avoid-ai-slop"]
      const outputRoot = join(root, filter)
      const result = await generateCodexPlugin({
        projectRoot: process.cwd(),
        pluginRoot: join(outputRoot, "plugins", "deepwork"),
        marketplacePath: join(outputRoot, ".agents", "plugins", "marketplace.json"),
        projectAgentsRoot: false,
        includeProjectMcp: false,
        config,
        packageVersion: "9.9.9",
      })
      assert.equal(result.projectAgentsRoot, undefined)
      assert.equal(existsSync(join(outputRoot, CODEX_PROJECT_AGENTS_DIR)), false)
      const skillsRoot = join(result.pluginRoot, "skills")
      const skill = loadSharedSkills({ rootDir: skillsRoot }).find((item) => item.name === "avoid-ai-slop")
      assert.equal(Boolean(skill), filter === "enabled", `${filter}: discoverable bundled skill`)
      assert.equal(existsSync(join(skillsRoot, "publish", "SKILL.md")), true, `${filter}: sibling remains enabled`)
      if (skill) {
        const command = buildSkillCommand(skill)
        assert.ok(command?.template.trim())
        assert.equal(command.name, "avoid-ai-slop")
        const license = join(skill.path, "LICENSE")
        assert.equal(lstatSync(license).isFile(), true)
        assert.ok(readFileSync(license, "utf8").trim().length > 0)
      }
      const files = readdirSync(join(result.pluginRoot, "agents")).filter((name) => name.endsWith(".toml"))
      assert.equal(files.length, result.agentCount)
      for (const file of files) {
        const instructions = parseGeneratedDeveloperInstructions(readFileSync(join(result.pluginRoot, "agents", file), "utf8"), file)
        assert.equal(countOccurrences(instructions, marker), filter === "enabled" ? 1 : 0, `${filter}/${file}`)
        assert.equal(countOccurrences(instructions, "<ocmm-avoid-ai-slop>"), filter === "enabled" ? 1 : 0, `${filter}/${file}: terminal boundary`)
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(promptsRoot, { recursive: true, force: true })
  }
})

test("Codex normalization preserves synthetic payloads, rewrites skill identity, and sanitizes agent metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codex-normalization-"))
  try {
    writeFixtureFile(root, "SKILL.md", "<!-- fixture source header -->\n---\nname: fixture-source\ndescription: Fixture\n---\n# Fixture payload\n\n`fixture-value`\n")
    writeFixtureFile(root, "agents/openai.yaml", "interface:\n  display_name: Fixture\nsearch_terms:\n  - fixture-search\npolicy:\n  allow_implicit_invocation: true\n")

    normalizeSkillForCodex(root, "fixture-target")

    const normalized = readFileSync(join(root, "SKILL.md"), "utf8")
    assert.ok(normalized.startsWith("---\nname: fixture-target\ndescription: Fixture\n---\n# Fixture payload\n\n`fixture-value`\n"))
    assert.equal(readFileSync(join(root, "agents", "openai.yaml"), "utf8"), "interface:\n  display_name: Fixture\npolicy:\n  allow_implicit_invocation: true\n")
    normalizeSkillForCodex(root, "fixture-target")
    assert.equal(readFileSync(join(root, "SKILL.md"), "utf8"), normalized, "normalization is idempotent")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
