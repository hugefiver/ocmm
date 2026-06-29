/**
 * ocmm — OpenCode Multi-Model Router plugin.
 *
 * Wires OpenCode hooks/tools:
 *   - `config`        : register/auto-route agents to preferred models
 *   - `chat.params`   : variant -> reasoning effort / thinking / temperature
 *   - `chat.message`  : v1 skill queue + noninteractive slash-command expansion
 *   - `event`         : session lifecycle bookkeeping
 *
 * The plugin module follows OpenCode's PluginModule contract:
 *   default export = { id, server }
 * where `server(input, options)` returns an object whose keys are hook names.
 */

import { defaultConfig, type OcmmConfig } from "./config/schema.ts"
import { loadConfig } from "./config/load.ts"
import { createConfigHandler } from "./hooks/config.ts"
import { createChatParamsHandler } from "./hooks/chat-params.ts"
import { createChatMessageHandler, createSystemTransformHandler } from "./hooks/chat-message.ts"
import { createEventHandler } from "./hooks/event.ts"
import { createDirectoryAgentsInjector } from "./hooks/directory-agents-injector.ts"
import { createHashlineReadEnhancer } from "./hooks/hashline-read-enhancer.ts"
import { createRulesInjector } from "./hooks/rules-injector.ts"
import { loadAllPrompts } from "./intent/prompt-loader.ts"
import { loadV1Skills } from "./intent/skill-loader.ts"
import { createConfiguredMcpManager, resolveMcpServers } from "./mcp/index.ts"
import { createPermissionGuards } from "./permissions/index.ts"
import { createHashlineEditTool, type HashlineToolDefinition } from "./tools/hashline-edit.ts"
import { createSkillMcpTool, type SkillMcpToolDefinition } from "./tools/skill-mcp.ts"
import { log } from "./shared/logger.ts"
import type { OcmmClient } from "./runtime-fallback/dispatcher.ts"
import { createIdleContinuationState } from "./runtime-fallback/idle-state.ts"
import { createCommandExecuteHandler } from "./hooks/command-execute.ts"

export const PLUGIN_ID = "ocmm"

export type PluginInterface = {
  config?: (input: unknown, output: unknown) => Promise<void>
  "chat.params"?: (input: unknown, output: unknown) => Promise<void>
  "chat.message"?: (input: unknown, output: unknown) => Promise<void>
  "experimental.chat.system.transform"?: (input: unknown, output: unknown) => Promise<void>
  "tool.execute.before"?: (input: unknown, output: unknown) => Promise<void>
  "tool.execute.after"?: (input: unknown, output: unknown) => Promise<void>
  "tool.definition"?: (input: unknown, output: unknown) => Promise<void>
  tool?: Record<string, PluginToolDefinition>
  event?: (input: unknown) => Promise<void>
  "command.execute.before"?: (
    input: { command: string; arguments?: string; sessionID: string },
    output: { parts: Array<{ type: string; text?: string }> },
  ) => Promise<void>
}

type PluginToolDefinition = HashlineToolDefinition | SkillMcpToolDefinition

export type ServerInput = {
  directory?: string
  cwd?: string
  client?: OcmmClient
}

export function createPlugin(input?: ServerInput): {
  pluginInterface: PluginInterface
  getConfig: () => OcmmConfig
  reload: () => OcmmConfig
} {
  const cwd = input?.directory ?? input?.cwd ?? process.cwd()
  const idleState = createIdleContinuationState()
  let config: OcmmConfig
  let promptsLoaded = false
  let v1SkillsCache: string | null = null

  function loadOrDefault(): OcmmConfig {
    try {
      const { config: c, sources, activeProfile } = loadConfig({ cwd })
      log.info(
        `config loaded: project=${sources.project ?? "<none>"}, user=${sources.user ?? "<none>"}${
          activeProfile ? `, profile=${activeProfile}` : ""
        }`,
      )
      return c
    } catch (err) {
      log.warn(`config load threw: ${(err as Error).message}; using defaults`)
      return defaultConfig()
    }
  }

  function ensurePromptsLoaded(): void {
    if (promptsLoaded) return
    try {
      loadAllPrompts(config.promptsRoot, config.workflow)
    } catch (err) {
      log.warn(`prompt load failed: ${(err as Error).message}`)
    }
    if (config.workflow === "v1") {
      try {
        v1SkillsCache = loadV1Skills()
        log.info(`v1 skills loaded: ${v1SkillsCache.length} chars`)
      } catch (err) {
        log.warn(`v1 skill load failed: ${(err as Error).message}`)
        v1SkillsCache = ""
      }
    }
    promptsLoaded = true
  }

  config = loadOrDefault()
  ensurePromptsLoaded()
  const getConfig = (): OcmmConfig => config
  const syncIdleEnabled = (): void => {
    idleState.globalEnabled = getConfig().idleContinuation?.enabled ?? false
  }
  syncIdleEnabled()
  const agentsSessionCache = new Map<string, Set<string>>()
  const sessionAgentMap = new Map<string, string>()
  const permissionGuards = createPermissionGuards({
    getConfig,
    projectRoot: cwd,
    agentsSessionCache,
    sessionAgentMap,
  })
  const toolAfterHandlers = [
    createHashlineReadEnhancer({ getConfig }),
    createRulesInjector({ getConfig, projectRoot: cwd }),
    createDirectoryAgentsInjector({ getConfig, projectRoot: cwd, sessionCache: agentsSessionCache }),
    permissionGuards.after,
  ]

  // Composed event handler — calls both the runtime-fallback handler (model
  // fallback + idle continuation) and the permission-guards handler (per-session
  // cache cleanup) so session.deleted/compacted clears all shared caches.
  const fallbackEventHandler = createEventHandler({
    getConfig,
    ...(input?.client !== undefined ? { client: input.client } : {}),
    directory: cwd,
    idleState,
  })
  const composedEvent = async (raw: unknown) => {
    await fallbackEventHandler(raw)
    await permissionGuards.event?.(raw)
  }

  const pluginInterface: PluginInterface = {
    config: createConfigHandler({ getConfig, cwd }),
    "chat.params": createChatParamsHandler({ getConfig, sessionAgentMap }),
    "chat.message": createChatMessageHandler({
      getConfig,
      ...(v1SkillsCache !== null ? { getV1Skills: () => v1SkillsCache! } : {}),
    }),
    "experimental.chat.system.transform": createSystemTransformHandler({ getConfig }),
    "tool.execute.before": permissionGuards.before,
    "tool.execute.after": async (hookInput, hookOutput) => {
      for (const handler of toolAfterHandlers) await handler(hookInput, hookOutput)
    },
    "tool.definition": permissionGuards.definition,
    event: composedEvent,
    "command.execute.before": createCommandExecuteHandler({ idleState }),
  }

  function refreshTools(): void {
    const tools: Record<string, PluginToolDefinition> = {}
    if (config.hashline.enabled) tools.edit = createHashlineEditTool()

    const mcpServers = resolveMcpServers(config.mcp, { disabledMcps: config.disabledMcps, cwd })
    if (Object.keys(mcpServers).length > 0) {
      tools.skill_mcp = createSkillMcpTool(createConfiguredMcpManager(mcpServers))
    }

    if (Object.keys(tools).length > 0) pluginInterface.tool = tools
    else delete pluginInterface.tool
  }

  refreshTools()

  return {
    pluginInterface,
    getConfig,
    reload(): OcmmConfig {
      config = loadOrDefault()
      promptsLoaded = false
      v1SkillsCache = null
      ensurePromptsLoaded()
      syncIdleEnabled()
      refreshTools()
      return config
    },
  }
}

const pluginModule = {
  id: PLUGIN_ID,
  server(input: ServerInput): PluginInterface {
    const { pluginInterface } = createPlugin(input)
    return pluginInterface
  },
}

export default pluginModule
