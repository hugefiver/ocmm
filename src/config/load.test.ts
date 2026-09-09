import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  deepMerge,
  loadConfig,
  loadProfileDescriptorsFromDir,
  loadProfileEntriesFromDir,
  loadProfilesFromDir,
  stripJsoncCommentsAndTrailingCommas,
} from "./load.ts"
import { defaultConfig } from "./schema.ts"

const UNSAFE_CONFIG_KEYS = ["__proto__", "constructor", "prototype"] as const

function collectUnsafeOwnKeyPaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectUnsafeOwnKeyPaths(item, `${path}[${index}]`))
  }
  if (typeof value !== "object" || value === null) return []

  const record = value as Record<string, unknown>
  const paths: string[] = []
  for (const [key, nested] of Object.entries(record)) {
    const nestedPath = `${path}.${key}`
    if ((UNSAFE_CONFIG_KEYS as readonly string[]).includes(key)) paths.push(nestedPath)
    paths.push(...collectUnsafeOwnKeyPaths(nested, nestedPath))
  }
  return paths
}

function assertSafeConfigTree(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) assertSafeConfigTree(item, `${path}[${index}]`)
    return
  }
  if (typeof value !== "object" || value === null) return

  assert.equal(Object.getPrototypeOf(value), Object.prototype, `${path} must have the ordinary object prototype`)
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    assert.equal(
      (UNSAFE_CONFIG_KEYS as readonly string[]).includes(key),
      false,
      `${path}.${key} must be removed`,
    )
    assertSafeConfigTree(nested, `${path}.${key}`)
  }
}

const MALICIOUS_MERGE_SCENARIOS: readonly {
  name: string
  base: unknown
  override: unknown
  expected: unknown
}[] = [
  {
    name: "the base layer when override is undefined",
    base: JSON.parse(
      '{"__proto__":{"polluted":"base-root"},"constructor":{"polluted":"base-root"},"prototype":{"polluted":"base-root"},"safe":{"kept":"base"},"array":[1,{"safe":true}],"scalar":7,"nullable":null}',
    ),
    override: undefined,
    expected: {
      safe: { kept: "base" },
      array: [1, { safe: true }],
      scalar: 7,
      nullable: null,
    },
  },
  {
    name: "the override layer",
    base: JSON.parse('{"safe":{"base":true},"ordinary":[1],"scalar":"base"}'),
    override: JSON.parse(
      '{"__proto__":{"polluted":"override-root"},"constructor":{"polluted":"override-root"},"prototype":{"polluted":"override-root"},"safe":{"override":true},"ordinary":[2],"scalar":"override","nullable":null}',
    ),
    expected: {
      safe: { base: true, override: true },
      ordinary: [2],
      scalar: "override",
      nullable: null,
    },
  },
  {
    name: "multiple nested object depths",
    base: JSON.parse(
      '{"nested":{"__proto__":{"polluted":"base-nested"},"safeBase":true,"deeper":{"constructor":{"polluted":"base-deep"},"safe":"base"}}}',
    ),
    override: JSON.parse(
      '{"nested":{"prototype":{"polluted":"override-nested"},"safeOverride":true,"deeper":{"__proto__":{"polluted":"override-deep"},"constructor":{"polluted":"override-deep"},"safe":"override"}}}',
    ),
    expected: {
      nested: {
        safeBase: true,
        safeOverride: true,
        deeper: { safe: "override" },
      },
    },
  },
  {
    name: "objects inside a replacement array",
    base: JSON.parse(
      '{"other":[{"safe":"base","__proto__":{"polluted":"base-array"},"constructor":{"polluted":"base-array"},"prototype":{"polluted":"base-array"}}]}',
    ),
    override: JSON.parse(
      '{"other":[{"safe":"override","__proto__":{"polluted":"override-array"}},{"nested":{"constructor":{"polluted":"array-nested"},"prototype":{"polluted":"array-nested"},"safe":true}},null,3]}',
    ),
    expected: {
      other: [
        { safe: "override" },
        { nested: { safe: true } },
        null,
        3,
      ],
    },
  },
]

for (const scenario of MALICIOUS_MERGE_SCENARIOS) {
  test(`deepMerge removes dangerous own keys from ${scenario.name}`, () => {
    const unsafeInputPaths = [
      ...collectUnsafeOwnKeyPaths(scenario.base),
      ...collectUnsafeOwnKeyPaths(scenario.override),
    ]
    for (const key of UNSAFE_CONFIG_KEYS) {
      assert.ok(
        unsafeInputPaths.some((path) => path.endsWith(`.${key}`)),
        `${scenario.name} fixture must contain an own ${key} key`,
      )
    }
    const baseBefore = structuredClone(scenario.base)
    const overrideBefore = structuredClone(scenario.override)

    const merged = deepMerge(scenario.base, scenario.override)

    assert.equal(Reflect.get(Object.prototype, "polluted"), undefined)
    assertSafeConfigTree(merged)
    assert.deepEqual(merged, scenario.expected)
    assert.deepEqual(scenario.base, baseBefore)
    assert.deepEqual(scenario.override, overrideBefore)
  })
}

test("deepMerge preserves ordinary, accumulating, and profile-overlay array policies", () => {
  const base = JSON.parse('{"other":[1,2],"disabledHooks":["base","shared"]}')
  const override = JSON.parse('{"other":[3],"disabledHooks":["shared","override"]}')

  assert.deepEqual(deepMerge(base, override), {
    other: [3],
    disabledHooks: ["base", "shared", "override"],
  })
  assert.deepEqual(deepMerge(base, override, undefined, { profileOverlay: true }), {
    other: [3],
    disabledHooks: ["shared", "override"],
  })
})

test("loadConfig removes dangerous keys parsed from project JSONC including array elements", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-prototype-hardening-"))
  const saved = new Map<string, string | undefined>()
  for (const key of ["OCMM_PROFILE", "OCMM_NO_PROFILE", "OCMM_FAST"]) {
    saved.set(key, process.env[key])
    delete process.env[key]
  }

  try {
    mkdirSync(join(cwd, ".opencode"), { recursive: true })
    writeFileSync(join(cwd, ".opencode", "ocmm.jsonc"), `{
      // Keep this as JSONC so the real parser and loader boundary are exercised.
      "fastModels": {
        "rules": [{
          "match": { "provider": "prototype-hardening" },
          "options": {
            "__proto__": { "polluted": "top" },
            "constructor": { "polluted": "top" },
            "prototype": { "polluted": "top" },
            "safe": {
              "kept": true,
              "__proto__": { "polluted": "nested" },
              "nested": {
                "constructor": { "polluted": "nested" },
                "prototype": { "polluted": "nested" },
                "value": "ok",
              },
            },
            "items": [{
              "__proto__": { "polluted": "array" },
              "constructor": { "polluted": "array" },
              "prototype": { "polluted": "array" },
              "kept": "array",
            }, null],
          },
        }],
      },
    }`)

    const loaded = loadConfig({ cwd, includeUser: false })
    const options = loaded.config.fastModels.rules[0]?.options

    assert.ok(options)
    assert.equal(Reflect.get(Object.prototype, "polluted"), undefined)
    assertSafeConfigTree(options)
    assert.deepEqual(options, {
      safe: { kept: true, nested: { value: "ok" } },
      items: [{ kept: "array" }, null],
    })
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("generic OpenCode loading preserves qualified aliases without materializing or validating targets", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-qualified-generic-"))
  const saved = new Map<string, string | undefined>()
  for (const key of ["OCMM_PROFILE", "OCMM_NO_PROFILE", "OCMM_FAST", "OPENCODE_CONFIG_CONTENT"]) {
    saved.set(key, process.env[key])
    delete process.env[key]
  }
  try {
    mkdirSync(join(cwd, ".opencode"), { recursive: true })
    writeFileSync(join(cwd, ".opencode", "ocmm.jsonc"), JSON.stringify({
      agents: {
        valid: { alias: "precision:reviewer" },
        missing: { alias: "missing:reviewer" },
        malformed: { alias: "precision:" },
        "oracle-3rd": { alias: "precision:reviewer" },
        "oracle-4th": { alias: "precision:" },
      },
    }))

    const loaded = loadConfig({ cwd, host: "opencode", includeUser: false })
    assert.equal(loaded.config.agents?.valid?.alias, "precision:reviewer")
    assert.equal(loaded.config.agents?.valid?.requirement, undefined)
    assert.equal(loaded.config.agents?.missing?.alias, "missing:reviewer")
    assert.equal(loaded.config.agents?.missing?.requirement, undefined)
    assert.equal(loaded.config.agents?.malformed?.alias, "precision:")
    assert.equal(loaded.config.agents?.malformed?.requirement, undefined)
    assert.equal(loaded.config.agents?.["oracle-3rd"]?.alias, "precision:reviewer")
    assert.equal(loaded.config.agents?.["oracle-3rd"]?.requirement, undefined)
    assert.equal(loaded.config.agents?.["oracle-4th"]?.alias, "precision:")
    assert.equal(loaded.config.agents?.["oracle-4th"]?.requirement, undefined)
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("stripJsoncCommentsAndTrailingCommas keeps strings intact", () => {
  const src = `{
  // a comment
  "url": "https://example.com",
  "regex": "// not a comment",
  "trailing": [1, 2, 3,], /* block */
}`
  const out = stripJsoncCommentsAndTrailingCommas(src)
  const parsed = JSON.parse(out) as Record<string, unknown>
  assert.equal(parsed.url, "https://example.com")
  assert.equal(parsed.regex, "// not a comment")
  assert.deepEqual(parsed.trailing, [1, 2, 3])
})

test("deepMerge: scalars and objects override; key-aware arrays union", () => {
  const a = {
    debug: false,
    intent: { enabled: true, skipAgents: ["a"] },
    fallbackModels: ["openai/gpt-5", "openai/gpt-4"],
    disabledAgents: ["code-search"],
    disabledHooks: ["hook-a"],
    disabledTools: ["tool-a"],
    disabledSkills: ["skill-a"],
    disabledCommands: ["command-a"],
    disabledMcps: ["mcp-a"],
    other: [1, 2],
  }
  const b = {
    debug: true,
    intent: { skipAgents: ["b"] },
    fallbackModels: ["openai/gpt-5.5"],
    disabledAgents: ["code-search", "doc-search"],
    disabledHooks: ["hook-b"],
    disabledTools: ["tool-a", "tool-b"],
    disabledSkills: ["skill-b"],
    disabledCommands: ["command-b"],
    disabledMcps: ["mcp-b"],
    other: [3],
  }
  const merged = deepMerge(a, b) as typeof a
  assert.equal(merged.debug, true)
  assert.equal(merged.intent.enabled, true)
  assert.deepEqual(merged.intent.skipAgents, ["b"]) // generic arrays override
  // unioned-arrays
  assert.deepEqual(merged.fallbackModels.sort(), [
    "openai/gpt-4",
    "openai/gpt-5",
    "openai/gpt-5.5",
  ])
  assert.deepEqual(merged.disabledAgents.sort(), ["code-search", "doc-search"])
  assert.deepEqual(merged.disabledHooks.sort(), ["hook-a", "hook-b"])
  assert.deepEqual(merged.disabledTools.sort(), ["tool-a", "tool-b"])
  assert.deepEqual(merged.disabledSkills.sort(), ["skill-a", "skill-b"])
  assert.deepEqual(merged.disabledCommands.sort(), ["command-a", "command-b"])
  assert.deepEqual(merged.disabledMcps.sort(), ["mcp-a", "mcp-b"])
  assert.deepEqual(merged.other, [3])
})

test("loadConfig replaces canonical agent models arrays across ordinary layers", () => {
  withUserAndProjectConfigs(
    {
      agents: {
        orchestrator: {
          models: [
            { model: "openai/BASE", reasoning: "high", temperature: 0.2 },
            "anthropic/BASE-FALLBACK",
          ],
        },
      },
    },
    {
      agents: {
        orchestrator: {
          models: [{ model: "zhipu/PROJECT", top_p: 0.8, max_tokens: 2048 }],
        },
      },
    },
    (config) => {
      assert.deepEqual(config.agents?.orchestrator?.models, [
        { model: "zhipu/PROJECT", top_p: 0.8, max_tokens: 2048 },
      ])
    },
  )
})

test("workflow field defaults to v1", () => {
  const cfg = defaultConfig()
  assert.equal(cfg.workflow, "v1")
})

test("default config includes subagent.maxDepth === 3", () => {
  const cfg = defaultConfig()
  assert.equal(cfg.subagent.maxDepth, 3)
})

test("deepMerge: workflow scalar replaces (project wins)", () => {
  const user = { workflow: "v1" as const }
  const project = { workflow: "codex" as const }
  const merged = deepMerge(user, project) as { workflow: string }
  assert.equal(merged.workflow, "codex")
})

test("project config cannot extend mcp envAllowlist", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-load-xdg-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-load-project-"))
  const previousXdg = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    mkdirSync(join(xdg, "opencode"), { recursive: true })
    mkdirSync(join(cwd, ".opencode"), { recursive: true })
    writeFileSync(join(xdg, "opencode", "ocmm.jsonc"), JSON.stringify({ mcp: { envAllowlist: ["USER_KEY"] } }))
    writeFileSync(join(cwd, ".opencode", "ocmm.jsonc"), JSON.stringify({ mcp: { envAllowlist: ["PROJECT_KEY"] } }))

    const { config } = loadConfig({ cwd })
    assert.deepEqual(config.mcp.envAllowlist, ["USER_KEY"])
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdg
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("default user config path uses ~/.config/opencode instead of APPDATA", () => {
  const fakeHome = mkdtempSync(join(tmpdir(), "ocmm-load-home-"))
  const fakeAppData = mkdtempSync(join(tmpdir(), "ocmm-load-appdata-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-load-cwd-"))
  const previousXdg = process.env.XDG_CONFIG_HOME
  const previousHome = process.env.HOME
  const previousUserProfile = process.env.USERPROFILE
  const previousAppData = process.env.APPDATA
  try {
    delete process.env.XDG_CONFIG_HOME
    process.env.HOME = fakeHome
    process.env.USERPROFILE = fakeHome
    process.env.APPDATA = fakeAppData

    mkdirSync(join(fakeHome, ".config", "opencode"), { recursive: true })
    mkdirSync(join(fakeAppData, "opencode"), { recursive: true })
    writeFileSync(join(fakeHome, ".config", "opencode", "ocmm.jsonc"), JSON.stringify({ debug: true }))
    writeFileSync(join(fakeAppData, "opencode", "ocmm.jsonc"), JSON.stringify({ workflow: "v1" }))

    const loaded = loadConfig({ cwd })
    assert.equal(loaded.sources.user, join(fakeHome, ".config", "opencode", "ocmm.jsonc"))
    assert.equal(loaded.config.debug, true)
    assert.equal(loaded.config.workflow, "v1")
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdg
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousUserProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = previousUserProfile
    if (previousAppData === undefined) delete process.env.APPDATA
    else process.env.APPDATA = previousAppData
    rmSync(fakeHome, { recursive: true, force: true })
    rmSync(fakeAppData, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("codex host reads CODEX_HOME and project .codex config without changing opencode defaults", () => {
  const codexHome = mkdtempSync(join(tmpdir(), "ocmm-load-codex-home-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-load-codex-project-"))
  const previousCodexHome = process.env.CODEX_HOME
  try {
    process.env.CODEX_HOME = codexHome

    mkdirSync(codexHome, { recursive: true })
    mkdirSync(join(cwd, ".codex"), { recursive: true })
    mkdirSync(join(cwd, ".opencode"), { recursive: true })
    writeFileSync(join(codexHome, "ocmm.jsonc"), JSON.stringify({ workflow: "v1" }))
    writeFileSync(join(cwd, ".codex", "ocmm.jsonc"), JSON.stringify({ debug: true }))
    writeFileSync(join(cwd, ".opencode", "ocmm.jsonc"), JSON.stringify({ workflow: "codex", debug: false }))

    const loaded = loadConfig({ cwd, host: "codex" })
    assert.equal(loaded.sources.user, join(codexHome, "ocmm.jsonc"))
    assert.equal(loaded.sources.project, join(cwd, ".codex", "ocmm.jsonc"))
    assert.equal(loaded.config.workflow, "v1")
    assert.equal(loaded.config.debug, true)

    const opencodeLoaded = loadConfig({ cwd, includeUser: false })
    assert.equal(opencodeLoaded.sources.project, join(cwd, ".opencode", "ocmm.jsonc"))
    assert.equal(opencodeLoaded.config.workflow, "codex")
    assert.equal(opencodeLoaded.config.debug, false)
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = previousCodexHome
    rmSync(codexHome, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("includeUser=false ignores user config while keeping project config", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-load-no-user-xdg-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-load-no-user-project-"))
  const previousXdg = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    mkdirSync(join(xdg, "opencode"), { recursive: true })
    mkdirSync(join(cwd, ".opencode"), { recursive: true })
    writeFileSync(join(xdg, "opencode", "ocmm.jsonc"), JSON.stringify({ workflow: "v1", debug: false }))
    writeFileSync(join(cwd, ".opencode", "ocmm.jsonc"), JSON.stringify({ debug: true }))

    const loaded = loadConfig({ cwd, includeUser: false })
    assert.equal(loaded.sources.user, undefined)
    assert.equal(loaded.sources.project, join(cwd, ".opencode", "ocmm.jsonc"))
    assert.equal(loaded.config.workflow, "v1")
    assert.equal(loaded.config.debug, true)
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdg
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
})

function withProjectConfig(value: unknown, run: (config: ReturnType<typeof loadConfig>["config"]) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-tolerant-config-"))
  try {
    mkdirSync(join(cwd, ".opencode"), { recursive: true })
    writeFileSync(join(cwd, ".opencode", "ocmm.jsonc"), JSON.stringify(value))
    run(loadConfig({ cwd, includeUser: false }).config)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
}

function withUserAndProjectConfigs(
  user: unknown,
  project: unknown,
  run: (config: ReturnType<typeof loadConfig>["config"]) => void,
): void {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-tolerant-user-xdg-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-tolerant-user-project-"))
  const previousXdg = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    mkdirSync(join(xdg, "opencode"), { recursive: true })
    mkdirSync(join(cwd, ".opencode"), { recursive: true })
    writeFileSync(join(xdg, "opencode", "ocmm.jsonc"), JSON.stringify(user))
    writeFileSync(join(cwd, ".opencode", "ocmm.jsonc"), JSON.stringify(project))
    run(loadConfig({ cwd }).config)
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdg
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
}

test("loadConfig restores a default for an invalid top-level field and preserves siblings", () => {
  withProjectConfig({ workflow: "unsupported", debug: true }, (config) => {
    assert.equal(config.workflow, "v1")
    assert.equal(config.debug, true)
  })
})

test("loadConfig restores nested defaults after dropping invalid fields", () => {
  withProjectConfig({ mcp: { enabled: false, websearch: { provider: "unsupported" } } }, (config) => {
    assert.equal(config.mcp.enabled, false)
    assert.equal(config.mcp.websearch.provider, "exa")
  })
})

test("loadConfig drops only invalid record entries with unrecoverable required fields", () => {
  withProjectConfig({
    mcp: {
      servers: {
        valid: { type: "local", command: "echo" },
        invalidValue: "not-an-object",
        missingCommand: { type: "local" },
      },
    },
  }, (config) => {
    assert.equal(config.mcp.servers.valid?.type, "local")
    assert.equal(config.mcp.servers.invalidValue, undefined)
    assert.equal(config.mcp.servers.missingCommand, undefined)
  })
})

test("loadConfig drops invalid array elements and preserves valid values", () => {
  withProjectConfig({
    runtimeFallback: {
      enabled: false,
      retryOnStatusCodes: [418, "invalid", 503],
    },
  }, (config) => {
    assert.equal(config.runtimeFallback.enabled, false)
    assert.deepEqual(config.runtimeFallback.retryOnStatusCodes, [418, 503])
  })
})

test("loadConfig treats an invalid project override as absent while preserving project siblings", () => {
  withUserAndProjectConfigs(
    { workflow: "codex", debug: true },
    { workflow: "unsupported", debug: false },
    (config) => {
      assert.equal(config.workflow, "codex")
      assert.equal(config.debug, false)
    },
  )
})

test("loadConfig treats an invalid active profile override as absent while preserving profile siblings", () => {
  withProjectConfig({
    mcp: { enabled: false, websearch: { provider: "tavily" } },
    profiles: {
      selected: {
        mcp: { enabled: true, websearch: { provider: "unsupported" } },
      },
    },
    activeProfile: "selected",
  }, (config) => {
    assert.equal(config.mcp.websearch.provider, "tavily")
    assert.equal(config.mcp.enabled, true)
  })
})

test("loadConfig restores a lower-priority agent field after dropping an invalid override", () => {
  withUserAndProjectConfigs(
    { agents: { orchestrator: { model: "x", temperature: 0.5 } } },
    { agents: { orchestrator: { description: "project", temperature: 3 } } },
    (config) => {
      assert.equal(config.agents?.orchestrator?.model, "x")
      assert.equal(config.agents?.orchestrator?.temperature, 0.5)
      assert.equal(config.agents?.orchestrator?.description, "project")
    },
  )
})

test("loadConfig restores lower canonical models after pruning an invalid project override", () => {
  withUserAndProjectConfigs(
    { agents: { orchestrator: { models: ["openai/LOWER", "anthropic/LOWER-FALLBACK"] } } },
    { agents: { orchestrator: { description: "project", models: [] } } },
    (config) => {
      assert.deepEqual(config.agents?.orchestrator?.models, ["openai/LOWER", "anthropic/LOWER-FALLBACK"])
      assert.equal(config.agents?.orchestrator?.description, "project")
    },
  )
})

test("loadConfig prunes unrecoverable canonical models while preserving legacy siblings", () => {
  withProjectConfig({
    agents: {
      orchestrator: {
        models: [],
        model: "openai/LEGACY",
        fallbackModels: ["anthropic/LEGACY-FALLBACK"],
      },
    },
  }, (config) => {
    const entry = config.agents?.orchestrator
    assert.equal(entry?.models, undefined)
    assert.equal(entry?.model, "openai/LEGACY")
    assert.deepEqual(entry?.fallbackModels, ["anthropic/LEGACY-FALLBACK"])
  })
})

test("loadConfig restores profile selection and inline profile provenance", () => {
  withUserAndProjectConfigs(
    {
      debug: false,
      profiles: { selected: { debug: true } },
      activeProfile: "selected",
    },
    {
      profiles: "invalid",
      activeProfile: 42,
    },
    (config) => {
      assert.equal(config.debug, true)
    },
  )

  for (const project of [42, [], ["invalid-root"]]) {
    withUserAndProjectConfigs(
      {
        workflow: "codex",
        debug: true,
        profiles: { selected: { locale: "zh-CN" } },
        activeProfile: "selected",
      },
      project,
      (config) => {
        assert.equal(config.workflow, "codex")
        assert.equal(config.debug, true)
        assert.equal(config.locale, "zh-CN")
      },
    )
  }

  withUserAndProjectConfigs(
    {
      debug: false,
      profiles: { selected: { mcp: { websearch: { provider: "tavily" } } } },
      activeProfile: "selected",
    },
    {
      profiles: { selected: { mcp: { websearch: { provider: "bad" } }, debug: true } },
    },
    (config) => {
      assert.equal(config.mcp.websearch.provider, "tavily")
      assert.equal(config.debug, true)
      assert.equal(config.profiles.selected?.mcp?.websearch?.provider, "tavily")
      assert.equal(config.profiles.selected?.debug, true)
    },
  )

  withUserAndProjectConfigs(
    {
      profiles: { selected: { mcp: { websearch: { provider: "tavily" } } } },
      activeProfile: "selected",
    },
    { profiles: { selected: "invalid" } },
    (config) => {
      assert.equal(config.mcp.websearch.provider, "tavily")
      assert.equal(config.profiles.selected?.mcp?.websearch?.provider, "tavily")
    },
  )
})

// --- loadProfilesFromDir tests ---

test("loadProfilesFromDir returns {} for missing dir", () => {
  const result = loadProfilesFromDir(join("/nonexistent", "path", "x"))
  assert.deepEqual(result, {})
})

test("loadProfilesFromDir returns {} for empty dir", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ocmm-empty-"))
  const result = loadProfilesFromDir(tmp)
  assert.deepEqual(result, {})
})

test("loadProfilesFromDir loads .jsonc files by basename", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ocmm-profiles-"))
  writeFileSync(
    join(tmp, "co.jsonc"),
    `// comment\n{ "agents": { "orchestrator": { "model": "gpt-5" } } }`,
  )
  writeFileSync(
    join(tmp, "oa.jsonc"),
    `{ "agents": { "reviewer": { "model": "claude" } } }`,
  )
  const result = loadProfilesFromDir(tmp)
  assert.deepEqual(Object.keys(result).sort(), ["co", "oa"])
  assert.deepEqual((result.co as Record<string, unknown>).agents, {
    orchestrator: { model: "gpt-5" },
  })
})

test("loadProfilesFromDir prefers .jsonc over .json for same basename", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ocmm-dup-"))
  writeFileSync(join(tmp, "co.json"), `{ "src": "json" }`)
  writeFileSync(join(tmp, "co.jsonc"), `{ "src": "jsonc" }`)
  const result = loadProfilesFromDir(tmp)
  assert.equal((result.co as Record<string, unknown>).src, "jsonc")
})

test("loadProfilesFromDir skips unparseable files with warn", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ocmm-bad-"))
  writeFileSync(join(tmp, "good.jsonc"), `{ "a": 1 }`)
  writeFileSync(join(tmp, "bad.jsonc"), `{ this is broken`)
  const result = loadProfilesFromDir(tmp)
  assert.deepEqual(Object.keys(result), ["good"])
})

test("loadProfilesFromDir strips nested profiles/activeProfile keys defensively", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ocmm-leak-"))
  writeFileSync(
    join(tmp, "sneaky.jsonc"),
    `{ "agents": {}, "profiles": { "nested": {} }, "activeProfile": "nested" }`,
  )
  const result = loadProfilesFromDir(tmp)
  const sneaky = result.sneaky as Record<string, unknown>
  assert.ok(!("profiles" in sneaky))
  assert.ok(!("activeProfile" in sneaky))
  assert.ok("agents" in sneaky)
})

// --- loadConfig directory profile integration tests ---

test("loadConfig reads BOM-prefixed base, project, and profile JSONC", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-bom-base-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-bom-project-"))
  const userConfigDir = join(xdg, "opencode")
  const projectConfigDir = join(cwd, ".opencode")
  const projectProfileDir = join(projectConfigDir, "ocmm-profiles")
  mkdirSync(userConfigDir, { recursive: true })
  mkdirSync(projectProfileDir, { recursive: true })
  writeFileSync(
    join(userConfigDir, "ocmm.jsonc"),
    `\uFEFF${JSON.stringify({ locale: "en-US", activeProfile: "focused" })}`,
  )
  writeFileSync(
    join(projectConfigDir, "ocmm.jsonc"),
    `\uFEFF${JSON.stringify({ debug: true })}`,
  )
  writeFileSync(
    join(projectProfileDir, "focused.jsonc"),
    `\uFEFF${JSON.stringify({ agents: { orchestrator: { model: "BOM-PROFILE" } } })}`,
  )
  const previousXdg = process.env.XDG_CONFIG_HOME
  const previousProfile = process.env.OCMM_PROFILE
  const previousNoProfile = process.env.OCMM_NO_PROFILE
  process.env.XDG_CONFIG_HOME = xdg
  delete process.env.OCMM_PROFILE
  delete process.env.OCMM_NO_PROFILE
  try {
    const { config, activeProfile } = loadConfig({ cwd })
    assert.equal(activeProfile, "focused")
    assert.equal(config.locale, "en-US")
    assert.equal(config.debug, true)
    assert.equal(config.agents?.orchestrator?.model, "BOM-PROFILE")
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdg
    if (previousProfile === undefined) delete process.env.OCMM_PROFILE
    else process.env.OCMM_PROFILE = previousProfile
    if (previousNoProfile === undefined) delete process.env.OCMM_NO_PROFILE
    else process.env.OCMM_NO_PROFILE = previousNoProfile
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("loadConfig applies a directory profile, shadowing inline same-name", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-int-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-int-cwd-"))
  const ocDir = join(xdg, "opencode")
  const profDir = join(ocDir, "ocmm-profiles")
  mkdirSync(profDir, { recursive: true })
  // Base config: inline profile "co" with model A, activeProfile=co
  writeFileSync(
    join(ocDir, "ocmm.jsonc"),
    JSON.stringify({
      agents: { orchestrator: { model: "hoo/glm" } },
      profiles: {
        co: { agents: { orchestrator: { model: "INLINE-MODEL" } } },
      },
      activeProfile: "co",
    }),
  )
  // Directory profile "co" with model DIR-MODEL (shadows inline)
  writeFileSync(
    join(profDir, "co.jsonc"),
    JSON.stringify({ agents: { orchestrator: { model: "DIR-MODEL" } } }),
  )
  const prevXdg = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    const { config, activeProfile } = loadConfig({ cwd })
    assert.equal(activeProfile, "co")
    assert.equal(
      (config.agents!.orchestrator as Record<string, unknown>).model,
      "DIR-MODEL",
    )
  } finally {
    if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prevXdg
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("loadConfig uses inline profile when no directory file exists", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-inline-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-inline-cwd-"))
  const ocDir = join(xdg, "opencode")
  mkdirSync(ocDir, { recursive: true })
  writeFileSync(
    join(ocDir, "ocmm.jsonc"),
    JSON.stringify({
      agents: { orchestrator: { model: "hoo/glm" } },
      profiles: {
        oa: { agents: { orchestrator: { model: "INLINE-OA" } } },
      },
      activeProfile: "oa",
    }),
  )
  const prevXdg = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    const { config, activeProfile } = loadConfig({ cwd })
    assert.equal(activeProfile, "oa")
    assert.equal(
      (config.agents!.orchestrator as Record<string, unknown>).model,
      "INLINE-OA",
    )
  } finally {
    if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prevXdg
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("loadConfig: OCMM_PROFILE selects a directory profile", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-env-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-env-cwd-"))
  const ocDir = join(xdg, "opencode")
  const profDir = join(ocDir, "ocmm-profiles")
  mkdirSync(profDir, { recursive: true })
  writeFileSync(
    join(ocDir, "ocmm.jsonc"),
    JSON.stringify({ agents: { orchestrator: { model: "hoo/glm" } } }),
  )
  writeFileSync(
    join(profDir, "env.jsonc"),
    JSON.stringify({ agents: { orchestrator: { model: "ENV-MODEL" } } }),
  )
  const prevXdg = process.env.XDG_CONFIG_HOME
  const prevEnv = process.env.OCMM_PROFILE
  process.env.XDG_CONFIG_HOME = xdg
  process.env.OCMM_PROFILE = "env"
  try {
    const { config, activeProfile } = loadConfig({ cwd })
    assert.equal(activeProfile, "env")
    assert.equal(
      (config.agents!.orchestrator as Record<string, unknown>).model,
      "ENV-MODEL",
    )
  } finally {
    if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prevXdg
    if (prevEnv === undefined) delete process.env.OCMM_PROFILE
    else process.env.OCMM_PROFILE = prevEnv
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("loadConfig: project profiles dir shadows user profiles dir", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-user-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-proj-"))
  const userOc = join(xdg, "opencode")
  const userProf = join(userOc, "ocmm-profiles")
  const projProf = join(cwd, ".opencode", "ocmm-profiles")
  mkdirSync(userProf, { recursive: true })
  mkdirSync(projProf, { recursive: true })
  writeFileSync(
    join(userOc, "ocmm.jsonc"),
    JSON.stringify({ agents: { orchestrator: { model: "hoo/glm" } }, activeProfile: "p" }),
  )
  writeFileSync(
    join(userProf, "p.jsonc"),
    JSON.stringify({ agents: { orchestrator: { model: "USER" } } }),
  )
  writeFileSync(
    join(projProf, "p.jsonc"),
    JSON.stringify({ agents: { orchestrator: { model: "PROJ" } } }),
  )
  const prevXdg = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    const { config, activeProfile } = loadConfig({ cwd })
    assert.equal(activeProfile, "p")
    assert.equal(
      (config.agents!.orchestrator as Record<string, unknown>).model,
      "PROJ",
    )
  } finally {
    if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prevXdg
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("loadConfig silently ignores missing directory profile", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-miss-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-miss-cwd-"))
  const ocDir = join(xdg, "opencode")
  mkdirSync(ocDir, { recursive: true })
  writeFileSync(
    join(ocDir, "ocmm.jsonc"),
    JSON.stringify({
      agents: { orchestrator: { model: "hoo/glm" } },
      activeProfile: "nonexistent",
    }),
  )
  const prevXdg = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    const { config, activeProfile } = loadConfig({ cwd })
    assert.equal(activeProfile, "nonexistent")
    // base config unchanged
    assert.equal(
      (config.agents!.orchestrator as Record<string, unknown>).model,
      "hoo/glm",
    )
  } finally {
    if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prevXdg
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("loadProfileEntriesFromDir retains the winning profile source path", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-profile-source-"))
  try {
    writeFileSync(join(root, "focused.json"), JSON.stringify({ debug: false }))
    writeFileSync(join(root, "focused.jsonc"), JSON.stringify({ debug: true }))
    const loaded = loadProfileEntriesFromDir(root)
    assert.equal(loaded.focused?.source, join(root, "focused.jsonc"))
    assert.deepEqual(loaded.focused?.value, { debug: true })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadProfileDescriptorsFromDir keeps preferred invalid jsonc descriptor without falling through", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-profile-descriptor-prefer-"))
  try {
    writeFileSync(join(root, "precision.json"), JSON.stringify({ debug: true }))
    writeFileSync(join(root, "precision.jsonc"), `{ this is not valid jsonc`)

    const loaded = loadProfileDescriptorsFromDir(root, "project-directory")
    const precision = loaded.get("precision")

    assert.ok(precision)
    assert.equal(precision.name, "precision")
    assert.equal(precision.source, "project-directory")
    assert.equal(precision.path, join(root, "precision.jsonc"))
    assert.equal(precision.error?.kind, "parse")
    assert.equal(precision.value, undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadProfileDescriptorsFromDir records structural shape errors and sanitizes ordinary invalid fields", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-profile-descriptor-shape-"))
  try {
    writeFileSync(join(root, "array.jsonc"), JSON.stringify(["not", "object"]))
    const invalidProfile = { agents: { "reviewer-high": { model: "openai/gpt-5.5" } } }
    writeFileSync(join(root, "invalid-agent.jsonc"), JSON.stringify(invalidProfile))

    const loaded = loadProfileDescriptorsFromDir(root, "user-directory")
    const arrayDescriptor = loaded.get("array")
    const invalidAgentDescriptor = loaded.get("invalid-agent")

    assert.ok(arrayDescriptor)
    assert.equal(arrayDescriptor.source, "user-directory")
    assert.equal(arrayDescriptor.path, join(root, "array.jsonc"))
    assert.equal(arrayDescriptor.error?.kind, "shape")
    assert.deepEqual(arrayDescriptor.value, ["not", "object"])

    assert.ok(invalidAgentDescriptor)
    assert.equal(invalidAgentDescriptor.source, "user-directory")
    assert.equal(invalidAgentDescriptor.path, join(root, "invalid-agent.jsonc"))
    assert.equal(invalidAgentDescriptor.error, undefined)
    assert.deepEqual((invalidAgentDescriptor.value as { agents?: unknown }).agents, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadProfileDescriptorsFromDir does not inject defaults for omitted profile fields", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-profile-descriptor-defaults-"))
  try {
    writeFileSync(join(root, "selected.jsonc"), `\uFEFF${JSON.stringify({ debug: true })}`)

    const descriptor = loadProfileDescriptorsFromDir(root, "user-directory").get("selected")
    const value = descriptor?.value as Record<string, unknown> | undefined

    assert.ok(value)
    assert.equal(value.debug, true)
    assert.equal(Object.hasOwn(value, "disabledHooks"), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadConfig tolerates logical-tier violations without discarding valid siblings", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-review-validation-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-review-validation-cwd-"))
  const configDir = join(xdg, "opencode")
  mkdirSync(configDir, { recursive: true })
  const previousXdg = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    const scenarios = [
      {
        agents: { "reviewer-high": { model: "openai/gpt-5.6-sol" } },
        verify: (config: ReturnType<typeof loadConfig>["config"]) => {
          assert.equal(config.agents?.["reviewer-high"], undefined)
        },
      },
      {
        agents: { oracle: { model: "openai/gpt-5.6-terra", variants: { high: {} } } },
        verify: (config: ReturnType<typeof loadConfig>["config"]) => {
          assert.equal(config.agents?.oracle?.model, "openai/gpt-5.6-terra")
          assert.equal(config.agents?.oracle?.variants?.high, undefined)
        },
      },
      {
        agents: { planner: { model: "openai/gpt-5.6-sol", variants: { high: "max" } } },
        verify: (config: ReturnType<typeof loadConfig>["config"]) => {
          assert.equal(config.agents?.planner?.model, "openai/gpt-5.6-sol")
          assert.equal(config.agents?.planner?.variants?.high, "max")
        },
      },
      {
        agents: { "oracle-3rd": { description: "missing normal requirement" } },
        verify: (config: ReturnType<typeof loadConfig>["config"]) => {
          assert.equal(config.agents?.["oracle-3rd"], undefined)
        },
      },
    ]

    for (const scenario of scenarios) {
      writeFileSync(join(configDir, "ocmm.jsonc"), JSON.stringify({
        workflow: "codex",
        agents: {
          orchestrator: { model: "openai/gpt-5.6-sol" },
          ...scenario.agents,
        },
      }))
      const config = loadConfig({ cwd }).config
      assert.equal(config.workflow, "codex", JSON.stringify(scenario.agents))
      assert.equal(config.agents?.orchestrator?.model, "openai/gpt-5.6-sol")
      scenario.verify(config)
    }

    writeFileSync(join(configDir, "ocmm.jsonc"), JSON.stringify({
      workflow: "codex",
      agents: { orchestrator: { model: "openai/gpt-5.6-terra", temperature: 3 } },
    }))
    const tolerant = loadConfig({ cwd }).config
    assert.equal(tolerant.workflow, "codex")
    assert.equal(tolerant.agents?.orchestrator?.model, "openai/gpt-5.6-terra")
    assert.equal(tolerant.agents?.orchestrator?.temperature, undefined)
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdg
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
})
