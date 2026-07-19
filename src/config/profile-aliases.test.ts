import assert from "node:assert/strict"
import { test } from "node:test"

import {
  materializeQualifiedAgentAliases,
  parseQualifiedAgentAlias,
} from "./profile-aliases.ts"
import { OcmmConfigSchema, type AgentEntry, type OcmmConfig } from "./schema.ts"
import type { ProfileDescriptorMap } from "./profile-types.ts"

function configWithAgents(agents: Record<string, AgentEntry>): OcmmConfig {
  const parsed = OcmmConfigSchema.safeParse({ agents })
  assert.equal(parsed.success, true)
  return parsed.data
}

function profiles(entries: Record<string, unknown>): ProfileDescriptorMap {
  return new Map(Object.entries(entries).map(([name, value]) => [
    name,
    { name, source: "inline" as const, value },
  ]))
}

test("parseQualifiedAgentAlias splits only its first colon", () => {
  assert.deepEqual(parseQualifiedAgentAlias("precision:review:strict"), {
    profile: "precision",
    agent: "review:strict",
  })
  assert.equal(parseQualifiedAgentAlias("reviewer"), null)

  for (const alias of [
    ":reviewer",
    "precision:",
    "precision :reviewer",
    "\tprecision:reviewer",
    "bad!:reviewer",
    "foo.bar:reviewer",
  ]) {
    assert.throws(() => parseQualifiedAgentAlias(alias), /invalid-qualified-alias/i)
  }
})

test("materializes target requirements from only the requested profile view", () => {
  const config = configWithAgents({
    source: {
      alias: "precision:reviewer",
      description: "source description",
      permission: { bash: "ask" },
      temperature: 0.3,
    },
  })
  const result = materializeQualifiedAgentAliases({
    config: {
      ...config,
      agents: {
        ...config.agents,
        // Simulates an already-applied active profile. It must not become part
        // of the qualified precision target view.
        reviewer: { model: "openai/ACTIVE" },
      },
    },
    baseAgents: config.agents ?? {},
    profiles: profiles({
      precision: {
        agents: {
          reviewer: { alias: "policy" },
          policy: { model: "openai/PROFILE" },
        },
      },
    }),
  })

  const source = result.agents?.source
  assert.equal(source?.alias, "precision:reviewer")
  assert.equal(source?.description, "source description")
  assert.deepEqual(source?.permission, { bash: "ask" })
  assert.equal(source?.temperature, 0.3)
  assert.equal(source?.requirement?.fallbackChain[0]?.model, "PROFILE")
})

test("qualified resolution follows target-scope aliases across distinct profile scopes", () => {
  const config = configWithAgents({ source: { alias: "first:same" } })
  const result = materializeQualifiedAgentAliases({
    config,
    baseAgents: config.agents ?? {},
    profiles: profiles({
      first: { agents: { same: { alias: "second:same" } } },
      second: { agents: { same: { model: "SECOND" } } },
    }),
  })

  assert.equal(result.agents?.source?.requirement?.fallbackChain[0]?.model, "SECOND")
})

test("qualified resolution reports complete scoped paths for real cycles", () => {
  const config = configWithAgents({ source: { alias: "first:same" } })
  assert.throws(
    () => materializeQualifiedAgentAliases({
      config,
      baseAgents: config.agents ?? {},
      profiles: profiles({
        first: { agents: { same: { alias: "second:same" } } },
        second: { agents: { same: { alias: "first:same" } } },
      }),
    }),
    /active:source -> profile:first:same -> profile:second:same -> profile:first:same/i,
  )
})

test("materialization deep-clones a complete target requirement without leaking target controls", () => {
  const targetRequirement = {
    fallbackChain: [{
      providers: ["openai", "fallback"],
      model: "gpt-5.6",
      variant: "max" as const,
      reasoningEffort: "max",
      temperature: 0.1,
      topP: 0.8,
      maxTokens: 8_000,
      thinking: { type: "enabled" as const, budgetTokens: 4_096 },
    }],
    variant: "high" as const,
    requiresModel: "gpt-5.6",
    requiresAnyModel: true,
    requiresProvider: ["openai", "fallback"],
  }
  const target = {
    requirement: targetRequirement,
    description: "target description",
    disabled: true,
    tools: { bash: false },
    permission: { edit: "deny" as const },
    skills: ["target-skill"],
    promptAppend: "target prompt",
    reasoningEffort: "minimal" as const,
    temperature: 1,
    topP: 0.1,
    maxTokens: 100,
  }
  const config = configWithAgents({
    source: {
      alias: "precision:reviewer",
      description: "source description",
      disabled: false,
      tools: { bash: true },
      permission: { edit: "ask" },
      skills: ["source-skill"],
      promptAppend: "source prompt",
      reasoningEffort: "high",
      temperature: 0.4,
      topP: 0.7,
      maxTokens: 200,
    },
  })
  const result = materializeQualifiedAgentAliases({
    config,
    baseAgents: config.agents ?? {},
    profiles: profiles({ precision: { agents: { reviewer: target } } }),
  })

  const source = result.agents?.source
  assert.deepEqual(source?.requirement, targetRequirement)
  assert.equal(source?.description, "source description")
  assert.equal(source?.disabled, false)
  assert.deepEqual(source?.tools, { bash: true })
  assert.deepEqual(source?.permission, { edit: "ask" })
  assert.deepEqual(source?.skills, ["source-skill"])
  assert.equal(source?.promptAppend, "source prompt")
  assert.equal(source?.reasoningEffort, "high")
  assert.equal(source?.temperature, 0.4)
  assert.equal(source?.topP, 0.7)
  assert.equal(source?.maxTokens, 200)

  const requirement = source?.requirement!
  requirement.fallbackChain[0]!.providers.push("mutated")
  requirement.fallbackChain[0]!.thinking!.budgetTokens = 1
  requirement.requiresProvider!.push("mutated")
  assert.deepEqual(targetRequirement.fallbackChain[0]!.providers, ["openai", "fallback"])
  assert.equal(targetRequirement.fallbackChain[0]!.thinking.budgetTokens, 4_096)
  assert.deepEqual(targetRequirement.requiresProvider, ["openai", "fallback"])
})

test("source direct requirements and shorthand models override a qualified alias", () => {
  const config = configWithAgents({
    modelSource: { alias: "precision:reviewer", model: "SOURCE" },
    fallbackSource: {
      alias: "precision:reviewer",
      fallbackModels: [{ providers: ["source"], model: "FALLBACK" }],
    },
    requirementSource: {
      alias: "precision:reviewer",
      requirement: { fallbackChain: [{ providers: ["source"], model: "REQUIREMENT" }] },
    },
  })
  const result = materializeQualifiedAgentAliases({
    config,
    baseAgents: config.agents ?? {},
    profiles: profiles({ precision: { agents: { reviewer: { model: "TARGET" } } } }),
  })

  assert.equal(result.agents?.modelSource?.requirement, undefined)
  assert.equal(result.agents?.modelSource?.model, "SOURCE")
  assert.equal(result.agents?.fallbackSource?.requirement, undefined)
  assert.equal(result.agents?.fallbackSource?.fallbackModels?.[0] instanceof Object, true)
  assert.equal(result.agents?.requirementSource?.requirement?.fallbackChain[0]?.model, "REQUIREMENT")
})

test("referenced invalid profiles, targets, and requirement-less aliases fail materialization", () => {
  const cases: Array<{ name: string; alias: string; profileEntries: Record<string, unknown>; error: RegExp }> = [
    { name: "missing profile", alias: "missing:reviewer", profileEntries: {}, error: /profile "missing" not found/i },
    { name: "missing target", alias: "precision:reviewer", profileEntries: { precision: { agents: {} } }, error: /target .*reviewer.*not found/i },
    { name: "no requirement", alias: "precision:reviewer", profileEntries: { precision: { agents: { reviewer: { description: "only" } } } }, error: /has no requirement/i },
  ]
  for (const scenario of cases) {
    const config = configWithAgents({ source: { alias: scenario.alias } })
    assert.throws(
      () => materializeQualifiedAgentAliases({
        config,
        baseAgents: config.agents ?? {},
        profiles: profiles(scenario.profileEntries),
      }),
      scenario.error,
      scenario.name,
    )
  }

  const invalidConfig = configWithAgents({ source: { alias: "precision:reviewer" } })
  assert.throws(
    () => materializeQualifiedAgentAliases({
      config: invalidConfig,
      baseAgents: invalidConfig.agents ?? {},
      profiles: new Map([[
        "precision",
        { name: "precision", source: "project-directory", error: { kind: "parse", message: "broken profile" } },
      ]]),
    }),
    /profile "precision".*broken profile/i,
  )
})

test("qualified materialization failures include the complete scoped path", () => {
  const assertFailurePath = (
    profilesMap: ProfileDescriptorMap,
    expectedPath: RegExp,
  ): void => {
    const config = configWithAgents({ source: { alias: "precision:reviewer" } })
    assert.throws(
      () => materializeQualifiedAgentAliases({
        config,
        baseAgents: config.agents ?? {},
        profiles: profilesMap,
      }),
      expectedPath,
    )
  }

  assertFailurePath(
    new Map(),
    /profile "precision" not found.*active:source -> profile:precision:reviewer/is,
  )
  assertFailurePath(
    new Map([[
      "precision",
      {
        name: "precision",
        source: "project-directory" as const,
        error: { kind: "parse" as const, message: "broken profile" },
      },
    ]]),
    /broken profile.*active:source -> profile:precision:reviewer/is,
  )
  assertFailurePath(
    profiles({ precision: { agents: {} } }),
    /not found.*active:source -> profile:precision:reviewer/is,
  )
  assertFailurePath(
    profiles({ precision: { agents: { reviewer: { description: "only" } } } }),
    /has no requirement.*active:source -> profile:precision:reviewer/is,
  )

  const transitive = configWithAgents({ source: { alias: "first:bridge" } })
  assert.throws(
    () => materializeQualifiedAgentAliases({
      config: transitive,
      baseAgents: transitive.agents ?? {},
      profiles: profiles({ first: { agents: { bridge: { alias: "missing:reviewer" } } } }),
    }),
    /profile "missing" not found.*active:source -> profile:first:bridge -> profile:missing:reviewer/is,
  )
})
