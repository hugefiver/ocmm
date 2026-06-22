/**
 * ocmm — OpenCode Multi-Model Router plugin.
 *
 * Wires OpenCode hooks/tools:
 *   - `config`        : register/auto-route agents to preferred models
 *   - `chat.params`   : variant -> reasoning effort / thinking / temperature
 *   - `chat.message`  : intent-keyword detection -> mode prompt injection
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
import { createHashlineReadEnhancer } from "./hooks/hashline-read-enhancer.ts"
import { loadAllPrompts } from "./intent/prompt-loader.ts"
import { loadV1Skills } from "./intent/skill-loader.ts"
import { createHashlineEditTool, type HashlineToolDefinition } from "./tools/hashline-edit.ts"
import { log } from "./shared/logger.ts"
import type { OcmmClient } from "./runtime-fallback/dispatcher.ts"

export const PLUGIN_ID = "ocmm"

export type PluginInterface = {
  config?: (input: unknown, output: unknown) => Promise<void>
  "chat.params"?: (input: unknown, output: unknown) => Promise<void>
  "chat.message"?: (input: unknown, output: unknown) => Promise<void>
  "experimental.chat.system.transform"?: (input: unknown, output: unknown) => Promise<void>
  "tool.execute.after"?: (input: unknown, output: unknown) => Promise<void>
  tool?: Record<string, HashlineToolDefinition>
  event?: (input: unknown) => Promise<void>
}

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

  const pluginInterface: PluginInterface = {
    config: createConfigHandler({ getConfig }),
    "chat.params": createChatParamsHandler({ getConfig }),
    "chat.message": createChatMessageHandler({
      getConfig,
      ...(v1SkillsCache !== null ? { getV1Skills: () => v1SkillsCache! } : {}),
    }),
    "experimental.chat.system.transform": createSystemTransformHandler(),
    "tool.execute.after": createHashlineReadEnhancer({ getConfig }),
    event: createEventHandler({
      getConfig,
      ...(input?.client !== undefined ? { client: input.client } : {}),
      directory: cwd,
    }),
  }

  if (config.hashline.enabled) {
    pluginInterface.tool = { edit: createHashlineEditTool() }
  }

  return {
    pluginInterface,
    getConfig,
    reload(): OcmmConfig {
      config = loadOrDefault()
      promptsLoaded = false
      v1SkillsCache = null
      ensurePromptsLoaded()
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
