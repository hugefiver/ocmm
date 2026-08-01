import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, relative } from "node:path"

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
  renderPlanningLogicalTierProfiles,
  stageCodexRuntime,
} from "./plugin-generator.ts"

function extractDelegationContract(instructions: string): string {
  const match = instructions.match(/<ocmm-delegation-contract>([\s\S]*?)<\/ocmm-delegation-contract>/)
  assert.ok(match, "generated instructions are missing the delegation contract")
  return match[1]!
}

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

const REMOVED_GPT56_SECTION_HEADINGS = [
  "## Shell Adaptation",
  "## Discovery Before Planning",
  "## Planner Trigger",
  "## Answer-When-Answerable",
  "## Scope",
  "## Workflow-role composition",
] as const

function extractGpt56Calibration(instructions: string): string {
  const marker = "# GPT-5.6 EXECUTION CALIBRATION"
  const start = instructions.indexOf(marker)
  assert.notEqual(start, -1, "generated instructions are missing the GPT-5.6 calibration")
  const end = instructions.indexOf("</deepwork-mode>", start)
  assert.notEqual(end, -1, "generated GPT-5.6 calibration is missing its closing wrapper")
  return instructions.slice(start, end)
}

function assertCompactGpt56Calibration(instructions: string, label: string): void {
  const calibration = extractGpt56Calibration(instructions)
  assert.match(calibration, /concrete requested outcome.*observable completion condition/is, `${label} outcome`)
  assert.match(calibration, /suitable timeout.*completion signal/is, `${label} waiting`)
  assert.match(calibration, /After two unchanged checks.*increase the wait|After two unchanged checks.*completion signal/is, `${label} backoff`)
  assert.match(calibration, /Rerun validation only when relevant inputs changed after the last green result/i, `${label} revalidation`)
  assert.match(calibration, /Lead with the outcome.*evidence.*residual risk.*unverified/is, `${label} reporting priority`)
  for (const heading of REMOVED_GPT56_SECTION_HEADINGS) assert.equal(calibration.includes(heading), false, `${label} duplicates ${heading}`)
  assert.doesNotMatch(calibration, /\[product\]|\[evidence\]/i, `${label} duplicates review-label doctrine`)
}

const CLAUDE_OPUS5_MARKER = "# CLAUDE OPUS 5 EXECUTION CALIBRATION"
const GPT56_MARKER = "# GPT-5.6 EXECUTION CALIBRATION"

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

const LEGACY_CODEX_GENERIC_CONTRACTS = [
  /TASK, ROLE, DELIVERABLE, SCOPE, VERIFY, REQUIRED SKILLS, CONTEXT, and CONSTRAINTS/,
  /`TASK`, `ROLE`, `DELIVERABLE`, `SCOPE`, `VERIFY`, `REQUIRED SKILLS`, `CONTEXT`, and `CONSTRAINTS`/,
  /`TASK:`.*imperative, bounded assignment/,
  /`DELIVERABLE:`.*concrete expected output/,
  /`VERIFY:`.*test, evidence, or observable result/,
] as const

function parseGeneratedDeveloperInstructions(toml: string, label: string): string {
  const match = toml.match(/^developer_instructions = (".*")$/m)
  assert.ok(match, `${label} is missing developer_instructions`)
  const parsed = JSON.parse(match[1]!) as unknown
  assert.equal(typeof parsed, "string", `${label} developer_instructions must decode to a string`)
  return parsed as string
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

function assertCanonicalCodexDispatchContract(contract: string, label: string): void {
  assert.match(contract, /current callable dispatch-tool schema is the only authority/i, `${label} schema authority`)
  assert.match(contract, /Only call `create_goal`.*user, system, or developer.*explicitly requests/is, `${label} create_goal gate`)
  assert.match(
    contract,
    /1\. \*\*Exact profile\*\*[\s\S]*2\. \*\*Direct composition\*\*[\s\S]*3\. \*\*V1\/V2 generic or flat dispatch\*\*[\s\S]*4\. \*\*Local execution\*\*/,
    `${label} route order`,
  )
  assert.match(
    contract,
    /2\. \*\*Direct composition\*\* — use only when the current callable schema exposes every model field required by the role, the schema-exact `reasoning` or `reasoning_effort` field when the role requires reasoning, the role's full system\/developer instructions, and all required skills/,
    `${label} direct-composition completeness`,
  )
  assert.match(
    contract,
    /Report this route as composition, not exact-profile selection/,
    `${label} direct-composition reporting`,
  )

  const v1Default = contract.match(/multi_agent_v1\.spawn_agent\(agent_type="dw-plan-critic", message="Review the saved implementation plan and return one current-revision verdict\."\)/)
  assert.ok(v1Default, `${label} is missing the default V1 exact-profile call`)
  assert.doesNotMatch(v1Default[0], /model|reasoning|fork_context|fork_turns/, `${label} default V1 call must omit optional fields`)
  assert.doesNotMatch(
    contract,
    /multi_agent_v1\.spawn_agent\([^)]*(?:model|reasoning|fork_context|fork_turns)/,
    `${label} contains a V1 example with unproven optional fields`,
  )
  assert.match(contract, /V1 may send `model` only when the current callable schema exposes `model`/, `${label} V1 model gate`)
  assert.match(
    contract,
    /V1 may send exactly the schema-named `reasoning` or `reasoning_effort` field only when that exact field is exposed/,
    `${label} V1 reasoning gate`,
  )
  assert.match(contract, /If either field is hidden, omit it; never send both reasoning spellings/, `${label} V1 hidden optional fields`)
  assert.match(contract, /V1 may add `fork_context` only when the callable V1 schema exposes it/is, `${label} V1 fork gate`)

  assert.match(
    contract,
    /V2-style flat dispatch uses `spawn_agent` to create, `wait_agent` to await, `followup_task` to continue, and `interrupt_agent` to stop/,
    `${label} V2 flat tool mapping`,
  )
  assert.match(
    contract,
    /Use each flat tool only when it is present in the current callable schema and pass only parameters exposed by that tool's schema/,
    `${label} V2 callable-schema gate`,
  )
  assert.match(contract, /V2-style flat tools never receive `fork_context`/, `${label} V2 fork prohibition`)
  assert.doesNotMatch(contract, /multi_agent_v2\.(?:spawn_agent|wait_agent|followup_task|interrupt_agent)/, `${label} stable V2 namespace claim`)
  assert.doesNotMatch(
    contract,
    /(?<!multi_agent_v1\.)(?:multi_agent_v2\.)?(?:spawn_agent|wait_agent|followup_task|interrupt_agent)\([^)]*(?:agent_type|model|reasoning|fork_context|fork_turns)/,
    `${label} contains a V2-flat example with invented parameters`,
  )
  assert.match(contract, /Never synthesize a namespace, copy parameters between tools, or add hidden parameters/, `${label} V2 hidden-parameter prohibition`)
  assert.match(contract, /Only when the callable schema exposes `fork_turns` may the agent use `fork_turns: none`/is, `${label} fork_turns gate`)
  assert.match(contract, /If `fork_turns` is hidden, omit it/, `${label} hidden fork_turns`)
  assert.doesNotMatch(contract, /spawn_agent\([^)]*fork_turns/, `${label} unconditional fork_turns call`)

  for (const field of ["GOAL", "STOP WHEN", "EVIDENCE"]) {
    assert.match(contract, new RegExp("`" + field + ":`"), `${label} generic envelope is missing ${field}`)
  }
  for (const legacy of LEGACY_CODEX_GENERIC_CONTRACTS) {
    assert.doesNotMatch(contract, legacy, `${label} retains ${legacy}`)
  }
  assert.match(contract, /`task_name`.*not a profile selector/is, `${label} task_name disclaimer`)
  assert.match(contract, /does not load a profile, select a model, attach a skill, or enable a missing feature/, `${label} generic disclaimer`)
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

function writeFixtureFile(root: string, file: string, contents: string): void {
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

function assertFullSkillCopyExceptRouter(label: string, sourceRoot: string, generatedRoot: string): void {
  const sourceFiles = listRelativeFiles(sourceRoot)
  assert.deepEqual(listRelativeFiles(generatedRoot), sourceFiles, `${label} inventory`)
  for (const file of sourceFiles) {
    const source = readFileSync(join(sourceRoot, file))
    const generated = readFileSync(join(generatedRoot, file))
    if (file === "SKILL.md") {
      assert.ok(generated.toString("utf8").startsWith(source.toString("utf8").trimEnd()), `${label} router body`)
    } else {
      assert.deepEqual(generated, source, `${label}/${file} byte copy`)
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
      const sourceText = source.toString("utf8")
      const temporaryText = temporary.toString("utf8")
      const normalizedSourceBody = sourceText
        .replace(/^(?:\s*<!--[\s\S]*?-->\s*)+(?=---\s*\r?\n)/, "")
        .trimEnd()
      assert.ok(temporaryText.startsWith(normalizedSourceBody), `${label} router does not preserve the normalized source body`)
      routerSuffix = temporaryText.slice(normalizedSourceBody.length)
      assert.match(routerSuffix, /^\r?\n\r?\n## Codex Compatibility/, `${label} router suffix`)
      assertCanonicalCodexDispatchContract(
        extractCallableDispatchContract(temporaryText, `${label} generated router`),
        `${label} generated router`,
      )
    } else {
      assert.deepEqual(temporary, source, `${label}/${file} is not a byte-for-byte source copy`)
    }
  }

  return routerSuffix
}

function assertGeneratedV1SkillTree(name: string, temporaryPluginRoot: string): void {
  const label = `deepwork-${name}`
  const sourceRoot = join(process.cwd(), "skills", "v1", name)
  const temporaryRoot = join(temporaryPluginRoot, "skills", label)
  const trackedRoot = join(process.cwd(), CODEX_PLUGIN_DIR, "skills", label)
  const sourceFiles = listRelativeFiles(sourceRoot)
  const temporaryFiles = listRelativeFiles(temporaryRoot)
  const trackedFiles = listRelativeFiles(trackedRoot)

  assert.deepEqual(temporaryFiles, sourceFiles, `temporary ${label} skill inventory differs from source`)
  assert.deepEqual(trackedFiles, sourceFiles, `tracked ${label} skill inventory is stale`)

  for (const file of sourceFiles) {
    const source = readFileSync(join(sourceRoot, file))
    const temporary = readFileSync(join(temporaryRoot, file))
    const tracked = readFileSync(join(trackedRoot, file))

    assert.deepEqual(tracked, temporary, `tracked ${label}/${file} differs from fresh generation`)
    if (file !== "SKILL.md") {
      assert.deepEqual(temporary, source, `${label}/${file} is not a byte-for-byte source copy`)
      continue
    }

    const normalizedSource = source
      .toString("utf8")
      .replace(/^name:\s*.+$/m, `name: ${label}`)
      .trimEnd()
    const temporaryText = temporary.toString("utf8")
    assert.ok(temporaryText.startsWith(normalizedSource), `${label} router does not preserve normalized source content`)
    const suffix = temporaryText.slice(normalizedSource.length)
    assert.match(suffix, /^\r?\n\r?\n## Codex Compatibility/, `${label} router suffix`)
    assertCanonicalCodexDispatchContract(
      extractCallableDispatchContract(temporaryText, `${label} generated router`),
      `${label} generated router`,
    )
  }
}

function extractReviewArtifactIdentityModule(text: string, label: string): string {
  const marker = "<!-- ocmm-review-artifact-identity-js -->"
  assert.equal(countOccurrences(text, marker), 1, `${label} must contain exactly one identity JS marker`)
  const following = text.slice(text.indexOf(marker) + marker.length)
  const fence = /^\r?\n```js\r?\n([\s\S]*?)\r?\n```(?:\r?\n|$)/.exec(following)
  assert.ok(fence, `${label} is missing an adjacent identity JS fence`)
  return fence[1]!
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
  const oracle2nd = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-oracle-2nd`)
  const oracleHigh = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-oracle-high`)
  const oracleSecondAlias = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-oracle-second`)
  const reviewer = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-reviewer`)
  const creative = agents.find((agent) => agent.name === `${CODEX_AGENT_PREFIX}-creative`)

  for (const agent of agents) {
    assert.equal(countOccurrences(agent.developerInstructions, "# Shell Command Safety"), 1, agent.name)
    assert.match(agent.developerInstructions, /do not use `\$home` or any case variant/i, agent.name)
    assert.match(agent.developerInstructions, /explicitly assigned and non-empty/i, agent.name)
  }

  assert.ok(orchestrator)
  const orchestratorContract = extractCallableDispatchContract(
    orchestrator.developerInstructions,
    "in-memory orchestrator",
  )
  assertCanonicalCodexDispatchContract(orchestratorContract, "in-memory orchestrator")
  for (const legacy of LEGACY_CODEX_GENERIC_CONTRACTS) {
    assert.doesNotMatch(orchestrator.developerInstructions, legacy, `in-memory orchestrator retains ${legacy}`)
  }
  assert.equal(orchestrator.model, "gpt-5.6-sol")
  assert.equal(orchestrator.reasoningEffort, "high")
  assert.match(orchestrator.developerInstructions, /Agent Role: orchestrator|DEEPWORK MODE ENABLED/)
  assert.match(orchestrator.developerInstructions, /Codex tool compatibility/)
  assert.match(orchestrator.developerInstructions, /GPT-5\.6 EXECUTION CALIBRATION/)
  assertCompactGpt56Calibration(orchestrator.developerInstructions, "in-memory orchestrator")
  assert.match(
    orchestrator.developerInstructions,
    /Codex profiles may carry this layer ahead of runtime model selection; models outside the GPT-5\.6 family ignore it/,
  )
  assert.ok(builder)
  assert.equal(builder.model, "gpt-5.6-sol")
  assert.ok(planner)
  assert.equal(planner.reasoningEffort, "max")
  assert.ok(deep)
  assert.equal(deep.reasoningEffort, "max")
  assert.ok(documenting)
  assert.equal(documenting.model, "gpt-5.5")
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
    /Compatibility routing never relaxes role delegation permission, target allowlists, or workflow ownership/,
  )
})

test("OpenCode native background guidance stays out of Codex orchestrators", async () => {
  const heading = "## Native OpenCode Background Subagents"
  const envKey = "OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS"
  for (const workflow of ["v1", "omo"] as const) {
    const source = readFileSync(
      join(process.cwd(), "prompts", workflow, "agents", "orchestrator.md"),
      "utf8",
    )
    assert.match(source, /currently callable `task` schema exposes `background`/i, workflow)
    assert.equal(countOccurrences(source, heading), 1, workflow)
  }

  const assertCodexIsolated = (text: string, label: string): void => {
    assert.doesNotMatch(text, new RegExp(envKey), `${label}: environment key`)
    assert.equal(text.includes(heading), false, `${label}: OpenCode heading`)
    assert.doesNotMatch(text, /use `background: true` only when the currently callable `task` schema/i, `${label}: native field contract`)
  }

  const codexSource = readFileSync(
    join(process.cwd(), "prompts", "codex", "agents", "orchestrator.md"),
    "utf8",
  )
  assertCodexIsolated(codexSource, "Codex source orchestrator")

  const agents = await buildCodexAgents({
    config: { ...defaultConfig(), workflow: "codex" },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })
  const inMemory = agents.find((agent) => agent.sourceName === "orchestrator")
  assert.ok(inMemory)
  assertCodexIsolated(inMemory.developerInstructions, "in-memory Codex orchestrator")

  const root = mkdtempSync(join(tmpdir(), "ocmm-codex-background-isolation-"))
  try {
    const result = await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, CODEX_PROJECT_AGENTS_DIR),
      config: { ...defaultConfig(), workflow: "codex" },
      packageVersion: "9.9.9",
    })
    for (const [label, file] of [
      ["temporary plugin", join(result.pluginRoot, "agents", "dw-orchestrator.toml")],
      ["temporary project", join(root, CODEX_PROJECT_AGENTS_DIR, "dw-orchestrator.toml")],
      ["tracked plugin", join(process.cwd(), CODEX_PLUGIN_DIR, "agents", "dw-orchestrator.toml")],
      ["tracked project", join(process.cwd(), CODEX_PROJECT_AGENTS_DIR, "dw-orchestrator.toml")],
    ] as const) {
      const instructions = parseGeneratedDeveloperInstructions(readFileSync(file, "utf8"), label)
      assertCodexIsolated(instructions, label)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    assert.equal(existsSync(root), false, "temporary Codex generation must be removed")
  }
})

test("Codex generated Opus 5 carriage is orchestrator-only and tracked bundle is fresh", async () => {
  const config = { ...defaultConfig(), workflow: "codex" as const }
  const agents = await buildCodexAgents({
    config,
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })
  const bySource = new Map(agents.map((agent) => [agent.sourceName, agent]))
  const orchestrator = bySource.get("orchestrator")
  const planner = bySource.get("planner")

  assert.ok(orchestrator)
  assert.ok(planner)
  assert.equal(orchestrator.model, "gpt-5.6-sol")
  assert.equal(planner.model, "gpt-5.6-sol")
  assert.equal(orchestrator.preferredChain[0], "anthropic/claude-opus-5")
  assert.equal(planner.preferredChain[0], "anthropic/claude-opus-5")
  assert.equal(countOccurrences(orchestrator.developerInstructions, CLAUDE_OPUS5_MARKER), 1)
  assert.match(
    orchestrator.developerInstructions,
    /Apply it only when.*`claude-opus-5`.*every other runtime model.*ignore/is,
  )

  for (const agent of agents) {
    const expectedOpusMarkerCount = agent.sourceName === "orchestrator" ? 1 : 0
    assert.equal(countOccurrences(agent.developerInstructions, CLAUDE_OPUS5_MARKER), expectedOpusMarkerCount, agent.sourceName)
    assert.equal(countOccurrences(agent.developerInstructions, GPT56_MARKER), 1, `${agent.sourceName}: GPT-5.6 carriage`)
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
  try {
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

    assert.equal(countOccurrences(temporaryInstructions, CLAUDE_OPUS5_MARKER), 1)
    assert.match(
      temporaryInstructions,
      /Apply it only when.*`claude-opus-5`.*every other runtime model.*ignore/is,
    )
    for (const file of readdirSync(generatedAgentsRoot).filter((name) => name.endsWith(".toml"))) {
      if (file === "dw-orchestrator.toml") continue
      const instructions = parseGeneratedDeveloperInstructions(readFileSync(join(generatedAgentsRoot, file), "utf8"), file)
      assert.equal(countOccurrences(instructions, CLAUDE_OPUS5_MARKER), 0, file)
      assert.equal(countOccurrences(instructions, GPT56_MARKER), 1, `${file}: GPT-5.6 carriage`)
    }

    const generatedAgentFiles = readdirSync(generatedAgentsRoot)
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
          readFileSync(join(generatedAgentsRoot, file), "utf8"),
          `${label} ${file} is stale`,
        )
      }
    }
    assert.equal(
      readFileSync(join(process.cwd(), CODEX_PLUGIN_DIR, "skills", CODEX_WORKFLOW_SKILL_NAME, "SKILL.md"), "utf8"),
      readFileSync(join(result.pluginRoot, "skills", CODEX_WORKFLOW_SKILL_NAME, "SKILL.md"), "utf8"),
      "tracked deepwork workflow skill is stale",
    )
  } finally {
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
  assert.match(reviewSessionPolicy, /same.*(?:reviewer|plan-critic).*task_id.*(?:corrections?|rechecks?)/is)
  for (const candidate of [builder, planner, reviewer, planCritic, coding]) {
    assert.doesNotMatch(candidate.developerInstructions, new RegExp(`<${reviewSessionTag}>`), candidate.sourceName)
  }
  assert.doesNotMatch(builder.developerInstructions, new RegExp(`<${compressionTag}>`))

  const commonCompressionPolicy = extractTaggedPolicy(codeSearch.developerInstructions, compressionTag)
  for (const candidate of [explore, planner, creative]) {
    assert.equal(extractTaggedPolicy(candidate.developerInstructions, compressionTag), commonCompressionPolicy, candidate.sourceName)
  }
  assert.match(commonCompressionPolicy, /trustworthy.*capacity.*do not proactively/is)
  assert.doesNotMatch(commonCompressionPolicy, /reviewer/i)

  for (const candidate of [reviewer, reviewerHigh, oracle, oracle2nd]) {
    const policy = extractTaggedPolicy(candidate.developerInstructions, compressionTag)
    assert.match(policy, /completed.*large.*exploration.*(?:>|more than)\s*100k/is, candidate.sourceName)
    assert.match(policy, /common paths.*independently available/is, candidate.sourceName)
    assert.match(policy, /do not prohibit.*follow-up/is, candidate.sourceName)
    assert.match(policy, /(?:~|about)\s*130k/is, candidate.sourceName)
  }
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
  assert.match(bySource.get("planner-high")!.developerInstructions, /Agent Role: planner/)
  assert.match(bySource.get("plan-critic-low")!.developerInstructions, /Agent Role: plan-critic/)
  assert.match(bySource.get("plan-critic-max")!.developerInstructions, /Agent Role: plan-critic/)
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
    const workflowSkill = readFileSync(join(result.pluginRoot, "skills", CODEX_WORKFLOW_SKILL_NAME, "SKILL.md"), "utf8")
    const planningInventory = workflowSkill.match(
      /### Planning logical-tier profiles in this bundle\s+(- `planner`[^\n]*\n- `plan-critic`[^\n]*)/,
    )?.[1] ?? ""
    assert.match(plannerHigh, /Agent Role: planner/)
    assert.match(plannerHigh, /^model = "gpt-5\.6-sol"$/m)
    assert.match(plannerHigh, /^model_reasoning_effort = "max"$/m)
    assert.match(criticLow, /Agent Role: plan-critic/)
    assert.match(criticLow, /^model = "gpt-5\.5"$/m)
    assert.match(criticLow, /^model_reasoning_effort = "xhigh"$/m)
    assert.match(criticMax, /Agent Role: plan-critic/)
    assert.match(criticMax, /^model = "gpt-5\.6-sol"$/m)
    assert.match(criticMax, /^model_reasoning_effort = "max"$/m)
    assert.equal(
      planningInventory.trim(),
      "- `planner`: `dw-planner`, `dw-planner-high`\n" +
        "- `plan-critic`: `dw-plan-critic`, `dw-plan-critic-low`, `dw-plan-critic-max`",
    )
    assert.doesNotMatch(planningInventory, /dw-planner-(?:low|max)|dw-plan-critic-high/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("generated workflow describes ordered priority and logical tiers without supplemental semantics", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-ordered-review-"))
  try {
    await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, ".codex", "agents"),
      config: { ...defaultConfig(), workflow: "codex" },
      packageVersion: "9.9.9",
    })
    const skill = readFileSync(join(root, "plugins", "deepwork", "skills", "deepwork", "SKILL.md"), "utf8")
    assert.match(skill, /Oracle priority.*oracle.*oracle-2nd/is)
    assert.match(skill, /logical tier.*low.*normal.*high.*max/is)
    assert.match(skill, /configuring multiple.*does not.*fan-out/is)
    assert.match(skill, /runtime-safety.*max.*high.*normal/is)
    assert.doesNotMatch(skill, /supplemental high-intensity|stronger Oracle|triple-review/i)
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
      assertCanonicalCodexDispatchContract(contract, label)
    }
    for (const [label, surface] of [
      ["generated workflow skill", workflowSkill],
      ["generated orchestrator TOML", generatedAgentInstructions],
      ["normalized writing-plans skill", deepworkSkill],
      ["normalized frontend skill", frontendSkill],
    ] as const) {
      for (const legacy of LEGACY_CODEX_GENERIC_CONTRACTS) {
        assert.doesNotMatch(surface, legacy, `${label} retains ${legacy}`)
      }
    }
    assert.match(orchestrator, /^name = "dw-orchestrator"$/m)
    assert.match(orchestrator, /Subagent Dispatch Compatibility \(HARD-GATE\)/)
    assert.match(orchestrator, /select only from the user's current available catalog/)
    assert.match(orchestrator, /Implementation review semantics:/)
    assert.match(orchestrator, /For GPT\/Codex review routes \(plan-critic and parsed review names\), enforce at least xhigh/)
    assert.doesNotMatch(orchestrator, /<ocmm-subagent-compression-policy>/)
    assert.match(
      extractTaggedPolicy(orchestrator, "ocmm-review-session-efficiency-policy"),
      /files changed since (?:the )?previous pass/i,
    )
    assert.doesNotMatch(builder, /<ocmm-(?:subagent-compression-policy|review-session-efficiency-policy)>/)
    assert.match(
      extractTaggedPolicy(coding, "ocmm-subagent-compression-policy"),
      /smallest closed range/i,
    )
    assert.match(
      extractTaggedPolicy(reviewer, "ocmm-subagent-compression-policy"),
      /about ten additional model turns/i,
    )
    assert.match(oracle, /^name = "dw-oracle"$/m)
    assert.match(oracle, /^model_reasoning_effort = "xhigh"$/m)
    assert.match(oracle, /external-model cross-check for implementation acceptance/i)
    assert.match(oracle2nd, /^name = "dw-oracle-2nd"$/m)
    assert.match(oracle2nd, /^model_reasoning_effort = "xhigh"$/m)
    assert.match(oracle2nd, /external Oracle model for additional independent implementation evidence/i)
    assert.match(reviewer, /^name = "dw-reviewer"$/m)
    assert.match(reviewer, /^model_reasoning_effort = "xhigh"$/m)
    assert.match(reviewer, /primary-lane self-reviewer for implementation acceptance/i)
    assert.match(creative, /^name = "dw-creative"$/m)
    assert.match(workflowSkill, /^---\nname: deepwork$/m)
    assert.match(workflowSkill, /agent_type="dw-plan-critic"/)
    assert.match(workflowSkill, /\[@dw-oracle\]\(subagent:\/\/dw-oracle\)/)
    assert.match(workflowSkill, /\[@dw-oracle-2nd\]\(subagent:\/\/dw-oracle-2nd\)/)
    assert.equal(existsSync(join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-oracle-high.toml`)), false)
    assert.match(workflowSkill, /through later configured slots only when explicit additional independent evidence is needed/)
    assert.match(orchestrator, /GPT-5\.6 EXECUTION CALIBRATION/)
    assertCompactGpt56Calibration(orchestrator, "generated orchestrator TOML")
    assert.match(
      orchestrator,
      /Codex profiles may carry this layer ahead of runtime model selection; models outside the GPT-5\.6 family ignore it/,
    )
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
    assert.match(workflowSkill, /Reviewer and Oracle routes use an `xhigh`-equivalent minimum/)
    assert.match(workflowSkill, /GPT-5\.6 supports native `max`/)
    assert.match(workflowSkill, /Planning logical-tier profiles in this bundle/i)
    assert.match(workflowSkill, /current callable dispatch-tool schema.*availability/is)
    assert.match(workflowSkill, /small or clear.*unsuffixed.*normal/is)
    assert.match(workflowSkill, /complex.*high.*normal/is)
    assert.match(workflowSkill, /high-risk.*max.*high.*normal/is)
    assert.match(workflowSkill, /low.*only.*explicit.*cost.*latency/is)
    assert.match(workflowSkill, /plan-critic-low.*lower-cost.*model.*xhigh-equivalent.*floor/is)
    assert.match(workflowSkill, /Oracle priority.*dw-oracle.*dw-oracle-2nd/is)
    assert.match(workflowSkill, /logical tier.*low.*normal.*high.*max/is)
    assert.match(workflowSkill, /configuring multiple.*does not.*fan-out/is)
    assert.match(workflowSkill, /runtime-safety.*max.*high.*normal/is)
    assert.doesNotMatch(workflowSkill, /supplemental high-intensity|stronger Oracle|triple-review/i)
    const planCriticPolicyLines = workflowSkill
      .split(/\r?\n/)
      .filter((line) => line.includes(`${CODEX_AGENT_PREFIX}-plan-critic`))
    assert.ok(planCriticPolicyLines.some((line) => /xhigh minimum/i.test(line)))
    assert.match(workflowSkill, /Ordered Oracle review/)
    assert.match(workflowSkill, /Reviewer is primary-model or primary-lane self-review/)
    assert.match(workflowSkill, /Oracle profiles are external-model implementation cross-checks/)
    assert.match(workflowSkill, /only for software implementation acceptance or focused code-quality verification after an implementation diff exists/)
    assert.match(workflowSkill, /never research, ideation, architecture design, root-cause debugging, general-answer validation, or routine confidence/)
    assert.match(workflowSkill, /Additional Oracle passes select later configured slots in order only when additional independent evidence is explicitly needed/)
    assert.match(workflowSkill, /Complex cross-module final acceptance selects the first available Oracle plus Reviewer/)
    assert.match(workflowSkill, /simple final acceptance selects the first available Oracle normal profile/i)
    assert.match(workflowSkill, /Reviewer has logical tier variants only and has no ordinal profiles/)
    assert.doesNotMatch(workflowSkill, new RegExp(`Latest available ${"Terra-lane"} model`))
    assert.doesNotMatch(workflowSkill, /never downgrade or leave the Terra lane merely to force diversity/)
    assert.equal(workflowSkill.includes(`${"Previous"}-${"gen"} ${"flagship"}`), false)
    assert.equal(workflowSkill.includes(`should use a **different ${"generation"}**`), false)
    assert.match(workflowSkill, /Review dispatch guardrail/)
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
      assert.match(source, /do not review implementation plans|never review plans/i)
      assert.match(source, /xhigh(?:`)?-equivalent|`xhigh` minimum/i)
      assert.match(source, /native `max`/)
      assert.match(source, /GPT-5\.6/i)
    }

    assert.equal(result.agentCount > 10, true)
    assert.equal(result.skillCount >= 6, true)

    assert.match(planner, /ocmm-delegation-contract/)
    assert.match(planner, /`quick` is forbidden/)
    assert.match(planner, /Return the completed plan to the orchestrator/)
    assert.match(coding, /Allowed utility targets: `quick`, `code-search`, `explore`, `doc-search`, `research`, `media-reader`/)
    assert.match(quick, /Do not dispatch any subagent/)
    assert.match(deep, /Allowed specialist targets: `coding`, `frontend`, `hard-reasoning`, `creative`, `documenting`/)
    assert.match(
      planner,
      /Compatibility routing never relaxes role delegation permission, target allowlists, or workflow ownership/,
    )
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
        .replace(/^(?:\s*<!--[\s\S]*?-->\s*)+(?=---\s*\r?\n)/, "")
        .trimEnd()
      assert.ok(generatedSkill.startsWith(sourceSkill), `${label} source SKILL.md body`)
      assert.equal(countOccurrences(generatedSkill, "## Codex Compatibility"), 1, `${label} compatibility suffix count`)
      assert.equal(countOccurrences(generatedSkill, "### Callable Dispatch Contract"), 1, `${label} dispatch suffix count`)
      assertCanonicalCodexDispatchContract(
        extractCallableDispatchContract(generatedSkill, `${label} coding-agent-sessions SKILL.md`),
        `${label} coding-agent-sessions SKILL.md`,
      )
    }

    for (const file of CODING_AGENT_SESSIONS_RUNTIME_FILES) {
      const source = readFileSync(join(sourceRoot, file))
      const temporary = readFileSync(join(temporaryRoot, file))
      const tracked = readFileSync(join(trackedRoot, file))
      if (file === "SKILL.md") continue
      assert.deepEqual(temporary, source, `${file} temporary raw-byte copy`)
      assert.deepEqual(tracked, source, `${file} tracked raw-byte copy`)
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
      ["debugging", "references/methodology/03-flaky-triage.md"],
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

test("Codex generated review identity contract mirrors source, temporary, tracked, and orchestrator surfaces", async () => {
  const root = mkdtempSync(join(tmpdir(), "deepwork-codex-review-identity-"))
  try {
    const result = await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, CODEX_PROJECT_AGENTS_DIR),
      config: { ...defaultConfig(), workflow: "codex" },
      packageVersion: "9.9.9",
    })

    for (const name of ["requesting-code-review", "subagent-driven-development"] as const) {
      assertGeneratedV1SkillTree(name, result.pluginRoot)
    }

    const sourceRequestingSkill = readFileSync(
      join(process.cwd(), "skills", "v1", "requesting-code-review", "SKILL.md"),
      "utf8",
    )
    const temporaryRequestingSkill = readFileSync(
      join(result.pluginRoot, "skills", "deepwork-requesting-code-review", "SKILL.md"),
      "utf8",
    )
    const trackedRequestingSkill = readFileSync(
      join(process.cwd(), CODEX_PLUGIN_DIR, "skills", "deepwork-requesting-code-review", "SKILL.md"),
      "utf8",
    )
    const canonicalIdentityModule = extractReviewArtifactIdentityModule(sourceRequestingSkill, "source requesting-code-review skill")
    for (const [label, skill] of [
      ["temporary requesting-code-review skill", temporaryRequestingSkill],
      ["tracked requesting-code-review skill", trackedRequestingSkill],
    ] as const) {
      assert.equal(extractReviewArtifactIdentityModule(skill, label), canonicalIdentityModule, `${label} canonical identity module`)
      assert.match(skill, /## Codex Compatibility/, `${label} compatibility heading`)
      assertCanonicalCodexDispatchContract(extractCallableDispatchContract(skill, label), label)
    }

    const sourceReviewerTemplate = readFileSync(
      join(process.cwd(), "skills", "v1", "requesting-code-review", "code-reviewer.md"),
    )
    const temporaryReviewerTemplate = readFileSync(
      join(result.pluginRoot, "skills", "deepwork-requesting-code-review", "code-reviewer.md"),
    )
    const trackedReviewerTemplate = readFileSync(
      join(process.cwd(), CODEX_PLUGIN_DIR, "skills", "deepwork-requesting-code-review", "code-reviewer.md"),
    )
    assert.deepEqual(temporaryReviewerTemplate, sourceReviewerTemplate, "temporary reviewer template is not a byte-for-byte source copy")
    assert.deepEqual(trackedReviewerTemplate, sourceReviewerTemplate, "tracked reviewer template is not a byte-for-byte source copy")

    const sourceSubagentSkill = readFileSync(
      join(process.cwd(), "skills", "v1", "subagent-driven-development", "SKILL.md"),
      "utf8",
    )
    const temporarySubagentSkill = readFileSync(
      join(result.pluginRoot, "skills", "deepwork-subagent-driven-development", "SKILL.md"),
      "utf8",
    )
    const trackedSubagentSkill = readFileSync(
      join(process.cwd(), CODEX_PLUGIN_DIR, "skills", "deepwork-subagent-driven-development", "SKILL.md"),
      "utf8",
    )
    for (const [marker, sources] of [
      [
        "<!-- ocmm-review-artifact-identity-js -->",
        [sourceRequestingSkill, temporaryRequestingSkill, trackedRequestingSkill],
      ],
      [
        "<!-- ocmm-review-artifact-identity-bash -->",
        [sourceRequestingSkill, temporaryRequestingSkill, trackedRequestingSkill],
      ],
      [
        "<!-- ocmm-review-artifact-identity-powershell -->",
        [sourceRequestingSkill, temporaryRequestingSkill, trackedRequestingSkill],
      ],
      [
        "<!-- ocmm-review-artifact-identity-packet -->",
        [sourceRequestingSkill, temporaryRequestingSkill, trackedRequestingSkill],
      ],
      [
        "<!-- ocmm-review-artifact-reviewer-template -->",
        [sourceReviewerTemplate.toString("utf8"), temporaryReviewerTemplate.toString("utf8"), trackedReviewerTemplate.toString("utf8")],
      ],
      [
        "<!-- ocmm-review-artifact-final-acceptance -->",
        [sourceSubagentSkill, temporarySubagentSkill, trackedSubagentSkill],
      ],
    ] as const) {
      for (const source of sources) assert.equal(countOccurrences(source, marker), 1, `${marker} occurrence count`)
    }

    const mandate = "Final implementation acceptance must load and follow the applicable identity-bound requesting-code-review skill. The orchestrator owns artifact-identity recomputation, one common packet for selected lanes, stale-verdict rejection, and completion only when every required receipt has the same current identity."
    const sourceOrchestrator = readFileSync(join(process.cwd(), "prompts", "codex", "agents", "orchestrator.md"), "utf8")
    const temporaryPluginOrchestrator = readFileSync(join(result.pluginRoot, "agents", "dw-orchestrator.toml"), "utf8")
    const temporaryProjectAgentsRoot = result.projectAgentsRoot
    assert.ok(temporaryProjectAgentsRoot)
    const temporaryProjectOrchestrator = readFileSync(join(temporaryProjectAgentsRoot, "dw-orchestrator.toml"), "utf8")
    const trackedPluginOrchestrator = readFileSync(join(process.cwd(), CODEX_PLUGIN_DIR, "agents", "dw-orchestrator.toml"), "utf8")
    const trackedProjectOrchestrator = readFileSync(join(process.cwd(), CODEX_PROJECT_AGENTS_DIR, "dw-orchestrator.toml"), "utf8")
    assert.equal(temporaryProjectOrchestrator, temporaryPluginOrchestrator, "temporary project/plugin orchestrator copies differ")
    assert.equal(trackedPluginOrchestrator, temporaryPluginOrchestrator, "tracked plugin orchestrator is stale")
    assert.equal(trackedProjectOrchestrator, temporaryPluginOrchestrator, "tracked project orchestrator is stale")

    const temporaryBuilder = readFileSync(join(result.pluginRoot, "agents", "dw-builder.toml"), "utf8")
    assert.equal(countOccurrences(parseGeneratedDeveloperInstructions(temporaryBuilder, "temporary dw-builder"), mandate), 0)
    for (const [label, instructions] of [
      ["source orchestrator prompt", sourceOrchestrator],
      ["temporary plugin orchestrator", parseGeneratedDeveloperInstructions(temporaryPluginOrchestrator, "temporary plugin dw-orchestrator")],
      ["temporary project orchestrator", parseGeneratedDeveloperInstructions(temporaryProjectOrchestrator, "temporary project dw-orchestrator")],
      ["tracked plugin orchestrator", parseGeneratedDeveloperInstructions(trackedPluginOrchestrator, "tracked plugin dw-orchestrator")],
      ["tracked project orchestrator", parseGeneratedDeveloperInstructions(trackedProjectOrchestrator, "tracked project dw-orchestrator")],
    ] as const) {
      assert.equal(countOccurrences(instructions, mandate), 1, `${label} identity mandate count`)
      assert.doesNotMatch(instructions, /record\("ocmm-review-artifact-v1"/, `${label} must not duplicate the canonical algorithm`)
    }
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
    assertCanonicalCodexDispatchContract(canonical, "workflow skill")

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
      for (const legacy of LEGACY_CODEX_GENERIC_CONTRACTS) {
        assert.doesNotMatch(instructions, legacy, `${file} retains ${legacy}`)
      }
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
      for (const legacy of LEGACY_CODEX_GENERIC_CONTRACTS) {
        assert.doesNotMatch(skill, legacy, `${name} retains ${legacy}`)
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
