import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, extname, isAbsolute, join, relative } from "node:path"

import { defaultConfig } from "../config/schema.ts"
import { loadConfig, stripJsoncCommentsAndTrailingCommas } from "../config/load.ts"
import { createConfigHandler } from "../hooks/config.ts"
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

function extractCallableDispatchContract(text: string, label: string): string {
  const marker = "### Callable Dispatch Contract"
  const start = text.indexOf(marker)
  assert.notEqual(start, -1, `${label} is missing ${marker}`)
  const possibleEnds = [
    text.indexOf("\n## ", start + marker.length),
    text.indexOf("\n### Generated profile references", start + marker.length),
    text.indexOf("\nOrdered Oracle review semantics:", start + marker.length),
    text.indexOf("\nImplementation review semantics:", start + marker.length),
  ].filter((index) => index !== -1)
  const end = possibleEnds.length > 0 ? Math.min(...possibleEnds) : text.length
  return text.slice(start, end).trimEnd()
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
): string {
  const sourceFiles = listRelativeFiles(sourceRoot)
  const temporaryFiles = listRelativeFiles(temporaryRoot)
  const trackedFiles = listRelativeFiles(trackedRoot)

  assert.ok(sourceFiles.includes(requiredFile), `${label} source is missing ${requiredFile}`)
  assert.deepEqual(temporaryFiles, sourceFiles, `temporary ${label} skill inventory differs from source`)
  assert.deepEqual(trackedFiles, sourceFiles, `tracked ${label} skill inventory is stale`)

  let routerSuffix = ""
  for (const file of sourceFiles) {
    const source = readFileSync(join(sourceRoot, file))
    const temporary = readFileSync(join(temporaryRoot, file))
    const tracked = readFileSync(join(trackedRoot, file))

    assert.deepEqual(tracked, temporary, `tracked ${label}/${file} differs from fresh generation`)
    if (file === "SKILL.md") {
      const sourceText = expectedCopiedSkillBytes(file, source).toString("utf8")
      const temporaryText = temporary.toString("utf8")
      const normalizedSourceBody = sourceText
        .replace(/^(?:\s*<!--[\s\S]*?-->\s*)+(?=---\s*\r?\n)/, "")
        .trimEnd()
      assert.ok(temporaryText.startsWith(normalizedSourceBody), `${label} router does not preserve the normalized source body`)
      routerSuffix = temporaryText.slice(normalizedSourceBody.length)
      assert.match(routerSuffix, /^\r?\n\r?\n## Codex Compatibility/, `${label} router suffix`)
      extractCallableDispatchContract(temporaryText, `${label} generated router`)
    } else {
      assert.deepEqual(temporary, expectedCopiedSkillBytes(file, source), `${label}/${file} generated copy`)
    }
  }

  return routerSuffix
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
  const oracle2nd = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-oracle-2nd`)
  const oracleHigh = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-oracle-high`)
  const oracleSecondAlias = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-oracle-second`)
  const reviewer = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-reviewer`)
  const creative = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-creative`)
  const shellSafety = readFileSync(join(process.cwd(), "prompts", "shared", "shell-safety.md"), "utf8").trim()

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
  assert.equal(documenting.model, "gpt-5.6-terra")
  assert.ok(oracle)
  assert.equal(oracle.sourceName, "oracle")
  assert.equal(oracle.reasoningEffort, "xhigh")
  assert.ok(oracle2nd)
  assert.equal(oracle2nd.sourceName, "oracle-2nd")
  assert.equal(oracle2nd.reasoningEffort, "xhigh")
  assert.equal(oracleHigh, undefined)
  assert.equal(oracleSecondAlias, undefined)
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
})

test("Codex dispatch rules preserve source role delegation permissions", async () => {
  const config = { ...defaultConfig(), workflow: "codex" as const }
  const cwd = process.cwd()
  const skillsRoot = join(cwd, "skills")
  const agents = await buildCodexAgents({ config, cwd, skillsRoot })
  const source: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => config, cwd, skillsRoot })(source, undefined)

  // Codex carries permissions in instructions, not a native permission field.
  // Compare target sets to the registered policy; predicates cover only the
  // deny/allow and precedence semantics needed to prevent adapter escalation.
  for (const name of ["quick", "planner", "deep", "orchestrator"]) {
    const profile = agents.find((agent) => agent.sourceName === name)
    assert.ok(profile, name)
    const registered = source.agent[name]
    assert.ok(isRecord(registered) && isRecord(registered.permission), name)
    const permission = registered.permission.task
    const instructions = profile.developerInstructions
    const dispatch = extractCallableDispatchContract(instructions, name)
    assert.match(dispatch, /\b(?:never|does not)\s+(?:relax|override|expand)\w*\s+role delegation permission/i, name)
    assert.match(dispatch, /delegation is not permitted[^\n]*(?:preserve|respect)[^\n]*role contract/i, name)

    if (name === "orchestrator") {
      assert.equal(permission, "allow")
      assert.ok(!instructions.includes("<ocmm-delegation-contract>"))
      assert.match(dispatch, /\buse\b[^\n]*\bpermitted route\b/i)
      assert.ok(dispatch.includes("`agent_type`"))
      assert.ok(dispatch.includes("`spawn_agent`"))
      continue
    }

    const contract = extractTaggedPolicy(instructions, "ocmm-delegation-contract")
    assert.equal(contract, extractTaggedPolicy(String(registered.prompt), "ocmm-delegation-contract"), name)
    assert.match(contract, /\boverrides\b[^\n]*\bbroader delegation\b/i, name)
    const allowedTargets = [...contract.matchAll(/Allowed [^\n:]*targets:\s*([^\n]+)/gi)]
      .flatMap((line) => [...line[1]!.matchAll(/`([^`]+)`/g)].map((target) => target[1]!))
      .sort()

    if (name === "quick") {
      assert.equal(permission, "deny")
      assert.deepEqual(allowedTargets, [])
      assert.match(contract, /\b(?:do not|never|must not)\s+(?:dispatch|spawn)\s+any subagent/i)
      continue
    }

    assert.ok(isRecord(permission), name)
    assert.equal(permission["*"], "deny", name)
    const sourceTargets = Object.entries(permission)
      .filter(([target, action]) => target !== "*" && action === "allow")
      .map(([target]) => target)
      .sort()
    assert.deepEqual(allowedTargets, sourceTargets, name)
    if (name === "planner") {
      for (const target of ["quick", "coding", "deep", "builder", "frontend", "documenting"]) {
        assert.equal(allowedTargets.includes(target), false, `planner must not delegate implementation to ${target}`)
      }
      assert.ok(allowedTargets.includes("code-search"))
    } else {
      assert.ok(allowedTargets.includes("quick"))
      assert.ok(allowedTargets.includes("coding"))
    }
  }
})

test("Codex agent composition reuses the guarded GPT-5.6 layer for GPT-6 Sol without losing roles or tools", async () => {
  for (const workflow of ["v1", "codex"] as const) {
    const agents = await buildCodexAgents({
      config: {
        ...defaultConfig(),
        workflow,
        agents: { orchestrator: { model: "openai/gpt-6-sol" } },
        categories: { coding: { model: "openai/gpt-6-sol" } },
      },
      cwd: process.cwd(),
      skillsRoot: join(process.cwd(), "skills"),
    })
    const orchestrator = agents.find((agent) => agent.sourceName === "orchestrator")
    const coding = agents.find((agent) => agent.sourceName === "coding")
    assert.ok(orchestrator, `${workflow} orchestrator`)
    assert.ok(coding, `${workflow} coding`)
    assert.equal(orchestrator.model, "gpt-6-sol", `${workflow} orchestrator model`)
    assert.equal(coding.model, "gpt-6-sol", `${workflow} coding model`)
    assert.equal(agents.some((agent) => /gpt-6-sol/i.test(agent.name)), false, `${workflow}: no separate Sol profile`)
    assert.equal(existsSync(join(process.cwd(), "prompts", workflow, "deepwork", "gpt-6-sol.md")), false, `${workflow}: no Sol variant source`)

    const orchestratorPrompt = extractOriginalDeepworkPrompt(orchestrator.developerInstructions)
    const codingPrompt = extractOriginalDeepworkPrompt(coding.developerInstructions)
    const orchestratorRole = getAgentPrompt("orchestrator").trim()
    const codingRole = getCategoryPrompt("coding").trim()
    const calibrations = [
      getDeepworkPrompt("default"),
      getDeepworkPrompt("gpt"),
      getDeepworkPrompt("gpt-5.6"),
      getDeepworkPrompt("gpt-6-astra"),
      getDeepworkPrompt("claude-opus-5"),
      getDeepworkPrompt("kimi-k27"),
      getDeepworkPrompt("swe-2"),
    ].map((prompt) => prompt.trim()).filter(Boolean)

    assert.equal(orchestratorPrompt.includes(orchestratorRole), true, `${workflow} orchestrator role composition`)
    assert.equal(codingPrompt.includes(codingRole), true, `${workflow} coding role composition`)
    assert.ok(orchestratorPrompt.indexOf(orchestratorRole) < orchestratorPrompt.indexOf("# GPT-5.6 EXECUTION CALIBRATION"), `${workflow} orchestrator role first`)
    assert.ok(codingPrompt.indexOf(codingRole) < codingPrompt.indexOf("# GPT-5.6 EXECUTION CALIBRATION"), `${workflow} coding role first`)
    assert.equal(countOccurrences(orchestratorPrompt, "# GPT-5.6 EXECUTION CALIBRATION"), 1, `${workflow} orchestrator shared layer once`)
    assert.equal(countOccurrences(codingPrompt, "# GPT-5.6 EXECUTION CALIBRATION"), 1, `${workflow} coding shared layer once`)
    assert.match(orchestrator.developerInstructions, /Codex tool compatibility:/, `${workflow} orchestrator tool contract`)
    assert.match(coding.developerInstructions, /Codex tool compatibility:/, `${workflow} coding tool contract`)
    assert.match(orchestrator.developerInstructions, /## Subagent Dispatch Compatibility/, `${workflow} orchestrator dispatch contract`)
    assert.match(coding.developerInstructions, /## Subagent Dispatch Compatibility/, `${workflow} coding dispatch contract`)
    assert.equal(calibrations.some((prompt) => orchestratorPrompt.includes(prompt)), true, `${workflow} orchestrator calibration`)
    assert.equal(calibrations.some((prompt) => codingPrompt.includes(prompt)), true, `${workflow} coding calibration`)

    const specialization = getDeepworkPrompt("gpt-5.6").trim()
    assert.ok(orchestratorPrompt.includes(specialization), `${workflow} orchestrator uses existing layer`)
    assert.ok(codingPrompt.includes(specialization), `${workflow} coding uses existing layer`)
    assert.match(specialization, /apply only to GPT-5\.6 and GPT-6 Sol/i, `${workflow} dual-model guard in calibration`)
    assert.match(specialization, /GPT-6 Astra, Luna, and other GPT-6 models ignore (?:it|this layer)/, `${workflow} guard excludes other GPT-6`)
    assert.match(specialization, /Both support native `max`/, `${workflow} native max`)

    if (workflow === "codex") {
      for (const calibration of [
        getDeepworkPrompt("gpt-5.6"),
        getDeepworkPrompt("gpt-6-astra"),
        getDeepworkPrompt("kimi-k27"),
        getDeepworkPrompt("swe-2"),
      ]) {
        assert.equal(orchestratorPrompt.includes(calibration.trim()), true, `codex orchestrator carries ${calibration.length}-byte calibration`)
        assert.equal(codingPrompt.includes(calibration.trim()), true, `codex coding carries ${calibration.length}-byte calibration`)
      }
    }
  }
})

test("Codex agent composition continues to select GPT-5.6 Sol without a separate variant", async () => {
  for (const workflow of ["v1", "codex"] as const) {
    const agents = await buildCodexAgents({
      config: {
        ...defaultConfig(),
        workflow,
        agents: { orchestrator: { model: "openai/gpt-5.6-sol" } },
        categories: { coding: { model: "openai/gpt-5.6-sol" } },
      },
      cwd: process.cwd(),
      skillsRoot: join(process.cwd(), "skills"),
    })
    for (const name of ["orchestrator", "coding"]) {
      const agent = agents.find(({ sourceName }) => sourceName === name)
      assert.ok(agent, `${workflow}/${name}`)
      assert.equal(agent.model, "gpt-5.6-sol", `${workflow}/${name}`)
      const prompt = extractOriginalDeepworkPrompt(agent.developerInstructions)
      assert.equal(countOccurrences(prompt, getDeepworkPrompt("gpt-5.6").trim()), 1, `${workflow}/${name}`)
    }
  }
})

test("Codex agents carry guarded Kimi and SWE-2 calibrations once without replacing planner role", async () => {
  const agents = await buildCodexAgents({
    config: { ...defaultConfig(), workflow: "codex" },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })
  const kimi = getDeepworkPrompt("kimi-k27").trim()
  const swe2 = getDeepworkPrompt("swe-2").trim()

  for (const agent of agents) {
    const prompt = extractOriginalDeepworkPrompt(agent.developerInstructions)
    assert.equal(countOccurrences(prompt, kimi), 1, `${agent.sourceName}: Kimi calibration`)
    assert.equal(countOccurrences(prompt, swe2), 1, `${agent.sourceName}: SWE-2 calibration`)
    assert.match(kimi, /every other runtime model must ignore it/)
    assert.match(swe2, /every other runtime model must ignore it/)
  }

  const planner = agents.find((agent) => agent.sourceName === "planner")
  assert.ok(planner)
  const plannerPrompt = extractOriginalDeepworkPrompt(planner.developerInstructions)
  assert.match(plannerPrompt, /Agent Role: planner/)
  assert.match(plannerPrompt, /# Deepwork Planner Injection/)
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
    oracle: ["gpt-5.6-terra", "xhigh"],
    "oracle-2nd": ["gpt-5.6-sol", "xhigh"],
    "doc-search": ["gpt-5.6-luna", "high"],
    explore: ["gpt-5.6-luna", "high"],
    "code-search": ["gpt-5.6-luna", "high"],
    "media-reader": ["gpt-5.6-luna", "high"],
    "hard-reasoning": ["gpt-6-astra", "max"],
    deep: ["gpt-6-astra", "xhigh"],
    complex: ["gpt-5.6-sol", "xhigh"],
    creative: ["gpt-6-astra", "high"],
    frontend: ["gpt-6-astra", "xhigh"],
    research: ["gpt-5.6-terra", "xhigh"],
    quick: ["gpt-5.6-terra", "high"],
    coding: ["gpt-5.6-terra", "xhigh"],
    "normal-task": ["gpt-5.6-terra", "xhigh"],
    documenting: ["gpt-5.6-terra", "high"],
  }
  assert.deepEqual(
    Object.fromEntries(agents.map((agent) => [agent.sourceName, [agent.model, agent.reasoningEffort]])),
    expected,
  )
})

test("Codex project OA snapshot loads without user profiles and produces the exact 22-role matrix", { concurrency: false }, async () => {
  const projectRoot = process.cwd()
  const codexHome = mkdtempSync(join(tmpdir(), "ocmm-codex-oa-home-"))
  const previous = {
    CODEX_HOME: process.env.CODEX_HOME,
    OCMM_PROFILE: process.env.OCMM_PROFILE,
    OCMM_NO_PROFILE: process.env.OCMM_NO_PROFILE,
  }
  const source = {
    agents: {
      orchestrator: ["apai/gpt-6-sol", "high"],
      planner: ["apai/gpt-6-astra", "high"],
      reviewer: ["apai/gpt-6-astra", "high"],
      clarifier: ["apai/gpt-6-sol", "high"],
      "plan-critic": ["apai/gpt-6-astra", "high"],
      oracle: ["apai/gpt-5.6-terra", "xhigh"],
      "oracle-2nd": ["apai/gpt-6-sol", "high"],
      "doc-search": ["apai/gpt-6-luna", "high"],
      explore: ["apai/gpt-6-luna", "medium"],
      "code-search": ["apai/gpt-6-luna", "medium"],
      "media-reader": ["apai/gpt-6-luna", "high"],
    },
    categories: {
      "hard-reasoning": ["apai/gpt-6-astra", "max"],
      deep: ["apai/gpt-6-astra", "high"],
      complex: ["apai/gpt-6-sol", "xhigh"],
      creative: ["apai/gpt-6-astra", "high"],
      frontend: ["apai/gpt-6-astra", "xhigh"],
      research: ["apai/gpt-6-sol", "high"],
      quick: ["apai/gpt-6-luna", "medium"],
      coding: ["apai/gpt-6-sol", "xhigh"],
      "normal-task": ["apai/gpt-6-sol", "high"],
      documenting: ["apai/gpt-6-sol", "medium"],
    },
  } as const
  const expectedGenerated = {
    orchestrator: ["gpt-6-sol", "high"],
    planner: ["gpt-6-astra", "high"],
    builder: ["gpt-6-astra", "xhigh"],
    reviewer: ["gpt-6-astra", "xhigh"],
    clarifier: ["gpt-6-sol", "high"],
    "plan-critic": ["gpt-6-astra", "xhigh"],
    oracle: ["gpt-5.6-terra", "xhigh"],
    "oracle-2nd": ["gpt-6-sol", "xhigh"],
    "doc-search": ["gpt-6-luna", "high"],
    explore: ["gpt-6-luna", "high"],
    "code-search": ["gpt-6-luna", "high"],
    "media-reader": ["gpt-6-luna", "high"],
    "hard-reasoning": ["gpt-6-astra", "max"],
    deep: ["gpt-6-astra", "high"],
    complex: ["gpt-6-sol", "xhigh"],
    creative: ["gpt-6-astra", "high"],
    frontend: ["gpt-6-astra", "xhigh"],
    research: ["gpt-6-sol", "high"],
    quick: ["gpt-6-luna", "high"],
    coding: ["gpt-6-sol", "xhigh"],
    "normal-task": ["gpt-6-sol", "high"],
    documenting: ["gpt-6-sol", "high"],
  }
  try {
    process.env.CODEX_HOME = codexHome
    process.env.OCMM_PROFILE = "oa"
    process.env.OCMM_NO_PROFILE = "1"

    const configPath = join(projectRoot, ".codex", "ocmm.jsonc")
    const raw = JSON.parse(stripJsoncCommentsAndTrailingCommas(readFileSync(configPath, "utf8"))) as Record<string, unknown>
    assert.deepEqual(Object.keys(raw).sort(), ["agents", "categories"])
    for (const group of ["agents", "categories"] as const) {
      const entries = raw[group] as Record<string, Record<string, unknown>>
      assert.deepEqual(Object.keys(entries).sort(), Object.keys(source[group]).sort(), `${group} keys`)
      for (const [name, entry] of Object.entries(entries)) {
        assert.deepEqual(Object.keys(entry).sort(), ["model", "variant"], `${group}.${name} keys`)
        assert.deepEqual([entry.model, entry.variant], source[group][name as keyof typeof source[typeof group]], `${group}.${name} source`)
      }
    }

    const loaded = loadConfig({ cwd: projectRoot, host: "codex", includeUser: false })
    assert.deepEqual(loaded.sources, { project: configPath })
    assert.equal(loaded.activeProfile, undefined)
    assert.deepEqual(Object.keys(loaded.config.agents ?? {}).sort(), Object.keys(source.agents).sort())
    assert.deepEqual(Object.keys(loaded.config.categories ?? {}).sort(), Object.keys(source.categories).sort())
    assert.deepEqual(loaded.config.agents?.orchestrator, { model: "apai/gpt-6-sol", variant: "high" })

    writeFileSync(join(codexHome, "ocmm.jsonc"), JSON.stringify({ agents: { orchestrator: { model: "apai/gpt-5.6-luna", variant: "max" } } }))
    const withoutUserBase = loadConfig({ cwd: projectRoot, host: "codex", includeUser: false })
    assert.deepEqual(withoutUserBase.sources, { project: configPath })
    assert.equal(withoutUserBase.config.agents?.orchestrator?.model, "apai/gpt-6-sol")

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
    assert.equal(isolated.config.agents?.orchestrator?.model, "apai/gpt-6-sol")
    const adapter = loadAdapterConfig(projectRoot)
    assert.equal(adapter.host, "codex")
    assert.equal(adapter.config.workflow, "codex")
    assert.equal(adapter.config.agents?.orchestrator?.model, "apai/gpt-6-sol")
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
  }
})

test("Codex generated Opus 5 carriage is orchestrator-only and tracked bundle is fresh", { concurrency: false }, async () => {
  const config = { ...defaultConfig(), workflow: "codex" as const }
  const agents = await buildCodexAgents({
    config,
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })
  const bySource = new Map(agents.map((agent) => [agent.sourceName, agent]))
  const orchestrator = bySource.get("orchestrator")
  const planner = bySource.get("planner")
  const opusPrompt = normalizeLf(readFileSync(join(process.cwd(), "prompts", "codex", "deepwork", "claude-opus-5.md"), "utf8")).trim()
  const gpt56Prompt = normalizeLf(readFileSync(join(process.cwd(), "prompts", "codex", "deepwork", "gpt-5.6.md"), "utf8")).trim()

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
    assert.equal(countOccurrences(instructions, gpt56Prompt), 1, `${agent.sourceName}: GPT-5.6 carriage`)
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
    skillsRoot: join(process.cwd(), "skills"),
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
      projectRoot: process.cwd(),
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
      assert.equal(countOccurrences(instructions, gpt56Prompt), 1, `${file}: GPT-5.6 carriage`)
    }

    const fresh = await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "cli-equivalent", "plugins", "deepwork"),
      marketplacePath: join(root, "cli-equivalent", ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, "cli-equivalent", CODEX_PROJECT_AGENTS_DIR),
      packageVersion: "9.9.9",
    })
    assert.equal(fresh.configHost, "codex")
    const freshAgentsRoot = join(fresh.pluginRoot, "agents")
    const generatedAgentFiles = readdirSync(freshAgentsRoot)
      .filter((name) => name.endsWith(".toml"))
      .sort()
    for (const [label, trackedAgentsRoot] of [
      ["tracked plugin bundle", join(process.cwd(), CODEX_PLUGIN_DIR, "agents")],
      ["tracked project agents", join(process.cwd(), CODEX_PROJECT_AGENTS_DIR)],
    ] as const) {
      const trackedAgentFiles = readdirSync(trackedAgentsRoot)
        .filter((name) => name.endsWith(".toml"))
        .sort()
      assert.deepEqual(trackedAgentFiles, generatedAgentFiles, `${label} agent inventory is stale`)
      for (const file of generatedAgentFiles) {
        assert.equal(
          readFileSync(join(trackedAgentsRoot, file), "utf8"),
          readFileSync(join(freshAgentsRoot, file), "utf8"),
          `${label} ${file} is stale`,
        )
      }
    }
    assert.equal(
      readFileSync(join(process.cwd(), CODEX_PLUGIN_DIR, "skills", CODEX_WORKFLOW_SKILL_NAME, "SKILL.md"), "utf8"),
      readFileSync(join(fresh.pluginRoot, "skills", CODEX_WORKFLOW_SKILL_NAME, "SKILL.md"), "utf8"),
      "tracked deepwork workflow skill is stale",
    )
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
    assert.equal(extractTaggedPolicy(candidate.developerInstructions, compressionTag), commonCompressionPolicy, candidate.sourceName)
  }
  assert.ok(commonCompressionPolicy.trim().length > 0)

  let reviewerCompressionPolicy: string | undefined
  for (const candidate of [reviewer, reviewerHigh, oracle, oracle2nd]) {
    const policy = extractTaggedPolicy(candidate.developerInstructions, compressionTag)
    reviewerCompressionPolicy ??= policy
    assert.equal(policy, reviewerCompressionPolicy, candidate.sourceName)
  }
  assert.notEqual(reviewerCompressionPolicy, commonCompressionPolicy)
})

test("Codex emits canonical default review slots without legacy or alias duplicates", async () => {
  const agents = await buildCodexAgents({
    config: { ...defaultConfig(), workflow: "codex" },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })
  const names = new Set(agents.map((agent) => agent.name))
  assert.equal(names.has("dw-oracle"), true)
  assert.equal(names.has("dw-oracle-2nd"), true)
  assert.equal(names.has("dw-reviewer"), true)
  assert.equal(names.has("dw-oracle-high"), false)
  assert.equal(names.has("dw-oracle-second"), false)
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

test("Codex emits only configured planning tiers with canonical prompts and critic floors", async () => {
  const agents = await buildCodexAgents({
    config: {
      ...defaultConfig(),
      workflow: "codex",
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
    skillsRoot: join(process.cwd(), "skills"),
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
  assert.equal(
    renderPlanningLogicalTierProfiles(agents),
    "- `planner`: `dw-planner`, `dw-planner-high`\n" +
      "- `plan-critic`: `dw-plan-critic`, `dw-plan-critic-low`, `dw-plan-critic-max`",
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

  assert.equal(
    renderPlanningLogicalTierProfiles(agents),
    "- `plan-critic`: `dw-plan-critic`",
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

  assert.equal(
    renderPlanningLogicalTierProfiles(agents),
    "- No planning logical-tier profiles are generated in this bundle.",
  )
})

test("Codex floors non-GPT plan critics without flooring planners", async () => {
  const config = {
    ...defaultConfig(),
    workflow: "codex" as const,
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
    skillsRoot: join(process.cwd(), "skills"),
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
      projectRoot: process.cwd(),
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
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("temporary Codex generation writes configured planning tiers to plugin and project copies", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-planning-tiers-"))
  try {
    const result = await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, CODEX_PROJECT_AGENTS_DIR),
      config: {
        ...defaultConfig(),
        workflow: "codex",
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

test("Codex generation resolves arbitrary multi-hop reviewer and oracle-2nd aliases", async () => {
  const agents = await buildCodexAgents({
    config: {
      ...defaultConfig(),
      workflow: "codex",
      agents: {
        reviewer: { alias: "review-policy-a" },
        "review-policy-a": { alias: "review-policy-b" },
        "review-policy-b": { alias: "review-model" },
        "review-model": { model: "openai/gpt-5.6-sol", variant: "minimal" as const },
        "oracle-2nd": { description: "inherits the effective reviewer model", alias: "review-policy-b" },
      },
    },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })

  for (const role of ["reviewer", "oracle-2nd"]) {
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
    const generatedAgentInstructions = parseGeneratedDeveloperInstructions(orchestrator, "generated orchestrator TOML")
    const agentContract = extractCallableDispatchContract(generatedAgentInstructions, "generated orchestrator TOML")
    const workflowContract = extractCallableDispatchContract(workflowSkill, "generated workflow skill")
    const normalizedWritingPlanContract = extractCallableDispatchContract(deepworkSkill, "normalized writing-plans skill")
    const normalizedFrontendContract = extractCallableDispatchContract(frontendSkill, "normalized frontend skill")

    for (const [label, contract] of [
      ["generated workflow skill", workflowContract],
      ["generated orchestrator TOML", agentContract],
      ["normalized writing-plans skill", normalizedWritingPlanContract],
      ["normalized frontend skill", normalizedFrontendContract],
    ] as const) {
      assert.equal(contract, workflowContract, `${label} compatibility drift`)
    }
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
    assert.match(workflowSkill, /Complex business or behavior implementation defaults to orchestrator-owned `dw-planner` → `dw-plan-critic` → implementation/)
    assert.match(workflowSkill, /non-blocking suggestions do not delay it/)
    assert.doesNotMatch(workflowSkill, /provides advisory plan review/)
    assert.match(generatedAgentInstructions, /does not waive the planner → plan-critic stages/)
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
      /Codex skill source must be a real directory, not a symbolic link or junction/,
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
      /Codex skill document must be a real regular file, not a symbolic link or junction/,
    )

    if (fileSymlinkCreated) {
      await assert.rejects(
        generateFixtureSkill(sourceRoot, outputRoot, name),
        /Codex skill document is missing/,
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

test("Codex generated coding-agent-sessions runtime tree has the exact filtered inventory and source bytes", async () => {
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
      const generatedSkill = readFileSync(join(skillRoot, "SKILL.md"), "utf8")
      const notice = readFileSync(join(skillRoot, "NOTICE.md"), "utf8")
      assert.match(
        notice,
        /Upstream attribution: Copyright \(c\) Yeongyu Kim and contributors\./,
        `${label} coding-agent-sessions upstream attribution`,
      )
      assert.match(
        notice,
        /The Sustainable Use License 1\.0 is reproduced in\s+\[LICENSE-UPSTREAM\.md\]\(LICENSE-UPSTREAM\.md\)\./,
        `${label} coding-agent-sessions license notice`,
      )
      assert.doesNotMatch(notice, /The upstream copyright holder and Sustainable Use License 1\.0 are stated in/)
      const sourceSkill = readFileSync(join(sourceRoot, "SKILL.md"), "utf8")
        .replace(/\r\n?/g, "\n")
        .replace(/^(?:\s*<!--[\s\S]*?-->\s*)+(?=---\s*\r?\n)/, "")
        .trimEnd()
      assert.ok(generatedSkill.startsWith(sourceSkill), `${label} source SKILL.md body`)
      assert.equal(countOccurrences(generatedSkill, "## Codex Compatibility"), 1, `${label} compatibility suffix count`)
      assert.equal(countOccurrences(generatedSkill, "### Callable Dispatch Contract"), 1, `${label} dispatch suffix count`)
      extractCallableDispatchContract(generatedSkill, `${label} coding-agent-sessions SKILL.md`)
    }

    for (const file of CODING_AGENT_SESSIONS_RUNTIME_FILES) {
      const source = readFileSync(join(sourceRoot, file))
      const temporary = readFileSync(join(temporaryRoot, file))
      const tracked = readFileSync(join(trackedRoot, file))
      if (file === "SKILL.md") continue
      const expected = expectedCopiedSkillBytes(file, source)
      assert.deepEqual(temporary, expected, `${file} temporary generated copy`)
      assert.deepEqual(tracked, expected, `${file} tracked generated copy`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("Codex generated debugging, frontend, ast-grep, and publish skill trees mirror source inventory and bytes", async () => {
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

    const suffixes = new Map<string, string>()
    for (const [name, requiredFile] of [
      ["ast-grep", "tests/smoke.ps1"],
      ["debugging", "references/scripts/dap.mjs"],
      ["frontend", "references/design/interaction-skill.md"],
      ["publish", "SKILL.md"],
    ] as const) {
      suffixes.set(
        name,
        assertGeneratedSharedSkillTree(
          name,
          join(process.cwd(), "skills", name),
          join(result.pluginRoot, "skills", name),
          join(process.cwd(), CODEX_PLUGIN_DIR, "skills", name),
          requiredFile,
        ),
      )
    }

    assert.equal(
      suffixes.get("debugging"),
      suffixes.get("publish"),
      "normalized shared-skill routers must carry the same canonical compatibility suffix",
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("generated Codex bundle shares one callable-schema contract across workflow, agents, and normalized skills", async () => {
  const root = mkdtempSync(join(tmpdir(), "deepwork-codex-runtime-contract-"))
  try {
    const result = await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, CODEX_PROJECT_AGENTS_DIR),
      config: { ...defaultConfig(), workflow: "codex" },
      packageVersion: "9.9.9",
    })

    const workflowSkill = readFileSync(
      join(result.pluginRoot, "skills", CODEX_WORKFLOW_SKILL_NAME, "SKILL.md"),
      "utf8",
    )
    const canonical = extractCallableDispatchContract(workflowSkill, "workflow skill")

    const projectAgentsRoot = result.projectAgentsRoot
    assert.ok(projectAgentsRoot)
    const bundledAgentsRoot = join(result.pluginRoot, "agents")
    const agentFiles = readdirSync(bundledAgentsRoot).filter((name) => name.endsWith(".toml")).sort()
    assert.equal(agentFiles.length, result.agentCount)
    for (const file of agentFiles) {
      const bundled = readFileSync(join(bundledAgentsRoot, file), "utf8")
      const project: string = readFileSync(join(projectAgentsRoot, file), "utf8")
      assert.equal(project, bundled, `${file} project/plugin copies differ`)
      const instructions = parseGeneratedDeveloperInstructions(bundled, file)
      const contract = extractCallableDispatchContract(instructions, file)
      assert.equal(contract, canonical, `${file} dispatch contract differs from workflow skill`)
    }

    const skillsRoot = join(result.pluginRoot, "skills")
    const normalizedSkillNames = readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== CODEX_WORKFLOW_SKILL_NAME)
      .map((entry) => entry.name)
      .sort()
    assert.equal(normalizedSkillNames.length, result.skillCount - 1)
    for (const name of normalizedSkillNames) {
      const skill = readFileSync(join(skillsRoot, name, "SKILL.md"), "utf8")
      assert.match(skill, /## Codex Compatibility/, `${name} compatibility heading`)
      const contract = extractCallableDispatchContract(skill, `${name} normalized skill`)
      assert.equal(contract, canonical, `${name} dispatch contract differs from workflow skill`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
