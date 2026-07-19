import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createPlugin } from "./index.ts"

const PLUGIN_ENV_KEYS = ["OCMM_PROFILE", "OCMM_NO_PROFILE", "OCMM_FAST", "OPENCODE_CONFIG_CONTENT"] as const
type PluginEnvKey = (typeof PLUGIN_ENV_KEYS)[number]

async function withPluginEnv<T>(
  overrides: Partial<Record<PluginEnvKey, string | undefined>>,
  run: () => T | Promise<T>,
): Promise<T> {
  const previous = new Map<PluginEnvKey, string | undefined>()
  for (const key of PLUGIN_ENV_KEYS) {
    previous.set(key, process.env[key])
    delete process.env[key]
  }
  for (const key of PLUGIN_ENV_KEYS) {
    const value = overrides[key]
    if (value !== undefined) process.env[key] = value
  }
  try {
    return await run()
  } finally {
    for (const key of PLUGIN_ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

async function withIsolatedConfig<T>(
  projectConfig: unknown | null,
  run: (cwd: string) => T | Promise<T>,
  env: Partial<Record<PluginEnvKey, string | undefined>> = {},
): Promise<T> {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-index-xdg-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-index-project-"))
  const previousXdg = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    if (projectConfig !== null) {
      mkdirSync(join(cwd, ".opencode"), { recursive: true })
      writeFileSync(join(cwd, ".opencode", "ocmm.jsonc"), JSON.stringify(projectConfig, null, 2))
    }
    return await withPluginEnv(env, () => run(cwd))
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdg
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
}

async function publishPluginConfig(
  pluginInterface: ReturnType<typeof createPlugin>["pluginInterface"],
  target: Record<string, unknown>,
): Promise<void> {
  assert.ok(pluginInterface.config)
  await pluginInterface.config(target, undefined)
}

test("plugin omits hashline edit tool and exposes skill_mcp by default", async () => {
  await withIsolatedConfig(null, (cwd) => {
    const { pluginInterface } = createPlugin({ directory: cwd })
    assert.equal(pluginInterface.tool?.edit, undefined)
    assert.equal(typeof pluginInterface.tool?.skill_mcp.execute, "function")
    assert.equal(typeof pluginInterface["tool.execute.before"], "function")
    assert.equal(typeof pluginInterface["tool.execute.after"], "function")
    assert.equal(typeof pluginInterface["tool.definition"], "function")
  })
})

test("plugin exposes hashline edit tool when hashline is enabled", async () => {
  await withIsolatedConfig({ hashline: { enabled: true } }, (cwd) => {
    const { pluginInterface } = createPlugin({ directory: cwd })
    assert.equal(typeof pluginInterface["tool.execute.after"], "function")
    assert.equal(typeof pluginInterface.tool?.edit.execute, "function")
  })
})

test("plugin exposes skill_mcp tool when MCP servers are configured", async () => {
  await withIsolatedConfig(
    { mcp: { servers: { docs: { type: "remote", url: "https://docs.example/mcp" } } } },
    async (cwd) => {
      const { pluginInterface } = createPlugin({ directory: cwd })
      assert.equal(typeof pluginInterface.tool?.skill_mcp.execute, "function")

      const result = await pluginInterface.tool!.skill_mcp.execute(
        { mcp_name: "docs", tool_name: "search", arguments: { q: "zod" } },
        {},
      )
      assert.match(result, /"mcp": "docs"/)
      assert.match(result, /transport is not active/)
    },
  )
})

test("reload refreshes config-dependent tool map", async () => {
  await withIsolatedConfig(null, (cwd) => {
    const configPath = join(cwd, ".opencode", "ocmm.jsonc")
    mkdirSync(join(cwd, ".opencode"), { recursive: true })
    writeFileSync(configPath, JSON.stringify({ hashline: { enabled: true } }))

    const { pluginInterface, reload } = createPlugin({ directory: cwd })
    assert.equal(typeof pluginInterface.tool?.edit.execute, "function")

    writeFileSync(configPath, JSON.stringify({ mcp: { servers: { docs: { type: "remote", url: "https://docs.example/mcp" } } } }))
    reload()
    assert.equal(pluginInterface.tool?.edit, undefined)
    assert.equal(typeof pluginInterface.tool?.skill_mcp.execute, "function")

    writeFileSync(configPath, JSON.stringify({}))
    reload()
    assert.equal(pluginInterface.tool?.edit, undefined)
    assert.equal(typeof pluginInterface.tool?.skill_mcp.execute, "function")
  })
})

test("plugin uses the OpenCode facade on initial load and reload, sharing its published fast route", async () => {
  const initialConfig = {
    fastModels: { providers: ["openai"], mappings: {} },
    agents: { "alias-worker": { alias: "precision:reviewer" } },
    profiles: {
      precision: {
        agents: {
          reviewer: {
            model: "openai/gpt-5.4-mini",
            fallbackModels: ["openai/gpt-5.4-mini-next"],
            variant: "low",
          },
        },
      },
    },
  }
  await withIsolatedConfig(initialConfig, async (cwd) => {
    const calls: Array<{ body: Record<string, unknown> }> = []
    const client = {
      session: {
        async abort() {
          return undefined
        },
        async messages() {
          return { messages: [{ role: "user", parts: [{ type: "text", text: "retry" }] }] }
        },
        async prompt(args: { body: Record<string, unknown> }) {
          calls.push({ body: args.body })
          return undefined
        },
      },
    }
    const { pluginInterface, reload } = createPlugin({ directory: cwd, client })
    const initialTarget: Record<string, unknown> = {
      agent: {},
      provider: { openai: { models: { "gpt-5.4-mini-fast": {} } } },
    }
    await publishPluginConfig(pluginInterface, initialTarget)
    assert.equal(
      (initialTarget.agent as Record<string, { model?: string }>)["alias-worker"]?.model,
      "openai/gpt-5.4-mini-fast",
    )

    const chatOutput = { options: {} as Record<string, unknown> }
    await pluginInterface["chat.params"]?.(
      {
        sessionID: "shared-route",
        agent: { name: "alias-worker" },
        model: { providerID: "openai", modelID: "gpt-5.4-mini-fast" },
        provider: { id: "openai" },
        message: {},
      },
      chatOutput,
    )
    assert.equal(chatOutput.options.reasoningEffort, "low")

    await pluginInterface.event?.({
      type: "session.error",
      properties: { sessionID: "shared-route", error: { status: 503 }, agent: "alias-worker" },
    })
    assert.equal(calls[0]?.body.modelID, "gpt-5.4-mini")

    writeFileSync(join(cwd, ".opencode", "ocmm.jsonc"), JSON.stringify({
      ...initialConfig,
      profiles: {
        precision: {
          agents: {
            reviewer: {
              model: "openai/gpt-5.4-mini-v2",
              fallbackModels: ["openai/gpt-5.4-mini-v2-next"],
              variant: "low",
            },
          },
        },
      },
    }))
    reload()

    const retainedOutput = { options: {} as Record<string, unknown> }
    await pluginInterface["chat.params"]?.(
      {
        sessionID: "retained-route",
        agent: { name: "alias-worker" },
        model: { providerID: "openai", modelID: "gpt-5.4-mini-fast" },
        provider: { id: "openai" },
        message: {},
      },
      retainedOutput,
    )
    assert.equal(retainedOutput.options.reasoningEffort, "low")

    const reloadedTarget: Record<string, unknown> = {
      agent: {},
      provider: { openai: { models: { "gpt-5.4-mini-v2-fast": {} } } },
    }
    await publishPluginConfig(pluginInterface, reloadedTarget)
    assert.equal(
      (reloadedTarget.agent as Record<string, { model?: string }>)["alias-worker"]?.model,
      "openai/gpt-5.4-mini-v2-fast",
    )
    const replacementOutput = { options: {} as Record<string, unknown> }
    await pluginInterface["chat.params"]?.(
      {
        sessionID: "replacement-route",
        agent: { name: "alias-worker" },
        model: { providerID: "openai", modelID: "gpt-5.4-mini-v2-fast" },
        provider: { id: "openai" },
        message: {},
      },
      replacementOutput,
    )
    assert.equal(replacementOutput.options.reasoningEffort, "low")
  }, { OCMM_FAST: "1" })
})

test("plugin fast activation accepts only exact true values through the config hook", async () => {
  const config = {
    fastModels: { providers: ["openai"], mappings: {} },
    agents: { "fast-worker": { model: "openai/gpt-5.4-mini" } },
  }
  const cases: Array<{ value?: string; expected: string }> = [
    { value: "1", expected: "openai/gpt-5.4-mini-fast" },
    { value: "true", expected: "openai/gpt-5.4-mini-fast" },
    { value: "TRUE", expected: "openai/gpt-5.4-mini" },
    { value: "True", expected: "openai/gpt-5.4-mini" },
    { value: " yes ", expected: "openai/gpt-5.4-mini" },
    { value: "0", expected: "openai/gpt-5.4-mini" },
    { value: "", expected: "openai/gpt-5.4-mini" },
    { expected: "openai/gpt-5.4-mini" },
  ]

  for (const { value, expected } of cases) {
    await withIsolatedConfig(config, async (cwd) => {
      const { pluginInterface } = createPlugin({ directory: cwd })
      const target: Record<string, unknown> = {
        agent: {},
        provider: { openai: { models: { "gpt-5.4-mini-fast": {} } } },
      }
      await publishPluginConfig(pluginInterface, target)
      assert.equal(
        (target.agent as Record<string, { model?: string }>)["fast-worker"]?.model,
        expected,
        value ?? "absent",
      )
    }, { OCMM_FAST: value })
  }
})

test("plugin captures fast activation until reload", async () => {
  const config = {
    fastModels: { providers: ["openai"], mappings: {} },
    agents: { "fast-worker": { model: "openai/gpt-5.4-mini" } },
  }
  await withIsolatedConfig(config, async (cwd) => {
    const { pluginInterface, reload } = createPlugin({ directory: cwd })
    process.env.OCMM_FAST = "0"

    const beforeReload: Record<string, unknown> = {
      agent: {},
      provider: { openai: { models: { "gpt-5.4-mini-fast": {} } } },
    }
    await publishPluginConfig(pluginInterface, beforeReload)
    assert.equal(
      (beforeReload.agent as Record<string, { model?: string }>)["fast-worker"]?.model,
      "openai/gpt-5.4-mini-fast",
    )

    reload()
    const afterReload: Record<string, unknown> = {
      agent: {},
      provider: { openai: { models: { "gpt-5.4-mini-fast": {} } } },
    }
    await publishPluginConfig(pluginInterface, afterReload)
    assert.equal(
      (afterReload.agent as Record<string, { model?: string }>)["fast-worker"]?.model,
      "openai/gpt-5.4-mini",
    )
  }, { OCMM_FAST: "1" })
})

test("plugin tool after hook composes hashline and rules injectors", async () => {
  await withIsolatedConfig({ hashline: { enabled: true }, rules: { enabled: true } }, async (cwd) => {
    const file = join(cwd, "src", "app.ts")
    mkdirSync(join(cwd, "src"), { recursive: true })
    writeFileSync(file, "export const app = true\n")
    writeFileSync(join(cwd, "src", "AGENTS.md"), "Use src context.\n")
    mkdirSync(join(cwd, ".omo", "rules"), { recursive: true })
    writeFileSync(
      join(cwd, ".omo", "rules", "typescript.md"),
      "---\nglobs: [\"**/*.ts\"]\n---\nUse strict types.\n",
    )

    const { pluginInterface } = createPlugin({ directory: cwd })
    const output = { output: "1: export const app = true", metadata: { filePath: file } }
    await pluginInterface["tool.execute.after"]?.({ tool: "read", args: { filePath: file } }, output)

    assert.match(output.output, /^1#[A-Z]{2}\|export const app = true/)
    assert.match(output.output, /\[Rule: \.omo\/rules\/typescript\.md\]/)
    assert.match(output.output, /\[Directory Context: /)
  })
})

test("plugin before and definition hooks expose permission guards", async () => {
  await withIsolatedConfig(null, async (cwd) => {
    const file = join(cwd, "existing.txt")
    writeFileSync(file, "old")
    const { pluginInterface } = createPlugin({ directory: cwd })

    await assert.rejects(
      pluginInterface["tool.execute.before"]?.(
        { tool: "write", sessionID: "s1", args: { filePath: file, content: "new" } },
        {},
      ),
      /File already exists/,
    )

    const definitionOutput = { description: "old" }
    await pluginInterface["tool.definition"]?.({ toolID: "todowrite" }, definitionOutput)
    assert.match(definitionOutput.description, /WHERE, HOW, WHY/)
  })
})

test("plugin tracks subagent depth and blocks task dispatches beyond maxDepth", async () => {
  await withIsolatedConfig(null, async (cwd) => {
    const { pluginInterface } = createPlugin({ directory: cwd })

    await pluginInterface["chat.params"]?.(
      {
        sessionID: "main",
        agent: { name: "orchestrator" },
        model: { providerID: "openai", modelID: "gpt-5.6-sol" },
        provider: { id: "openai" },
        message: {},
      },
      { options: {} },
    )

    // A parentless creation is initially untrusted. The mapped primary's first
    // task dispatch establishes depth 0 before child lineage is observed.
    await pluginInterface.event?.({ type: "session.created", properties: { sessionID: "main" } })
    await pluginInterface["tool.execute.before"]?.(
      { tool: "task", sessionID: "main", args: { description: "x", subagent_type: "coding", prompt: "y" } },
      {},
    )

    // Fire child session.created events to build depth: main -> d1 -> d2 -> d3.
    await pluginInterface.event?.({ type: "session.created", properties: { sessionID: "d1", parentID: "main" } })
    await pluginInterface.event?.({ type: "session.created", properties: { sessionID: "d2", parentID: "d1" } })
    await pluginInterface.event?.({ type: "session.created", properties: { sessionID: "d3", parentID: "d2" } })

    // depth 3 == default maxDepth 3 -> blocked.
    await assert.rejects(
      pluginInterface["tool.execute.before"]?.(
        { tool: "task", sessionID: "d3", args: { description: "x", subagent_type: "coding", prompt: "y" } },
        {},
      ),
      /subagent nesting depth limit reached.*current depth: 3/,
    )

    // depth 2 still allowed
    await pluginInterface["tool.execute.before"]?.(
      { tool: "task", sessionID: "d2", args: { description: "x", subagent_type: "coding", prompt: "y" } },
      {},
    )
  })
})

test("task after-hook appends recovery notice without prompting any session", async () => {
  await withIsolatedConfig(null, async (cwd) => {
    let promptCalls = 0
    const client = {
      session: {
        async abort() {
          return undefined
        },
        async messages() {
          return { messages: [] }
        },
        async prompt() {
          promptCalls += 1
          return undefined
        },
      },
    }

    const { pluginInterface } = createPlugin({ directory: cwd, client })
    await pluginInterface.event?.({
      event: {
        type: "session.created",
        properties: { sessionID: "child", parentID: "parent" },
      },
    })
    await pluginInterface.event?.({
      event: {
        type: "message.part.updated",
        properties: {
          sessionID: "parent",
          part: {
            id: "part",
            type: "tool",
            tool: "task",
            state: {
              status: "error",
              error: "Tool execution aborted",
              input: { task_id: "tsk_resume_1", subagent_type: "code-search" },
              metadata: { sessionId: "child", interrupted: true },
            },
          },
        },
      },
    })

    const output = { output: "Tool execution aborted", metadata: { sessionId: "child" } }
    await pluginInterface["tool.execute.after"]?.(
      { tool: "task", sessionID: "parent", callID: "part", args: { task_id: "tsk_resume_1" } },
      output,
    )
    assert.match(output.output, /resumable task identifier "tsk_resume_1"/)
    assert.equal(promptCalls, 0)
  })
})
