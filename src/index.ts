/**
 * ocmm — OpenCode Multi-Model Router plugin.
 *
 * Wires four hooks:
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
import { loadAllPrompts } from "./intent/prompt-loader.ts"
import { log } from "./shared/logger.ts"

export const PLUGIN_ID = "ocmm"

export type PluginInterface = {
  config?: (input: unknown, output: unknown) => Promise<void>
  "chat.params"?: (input: unknown, output: unknown) => Promise<void>
  "chat.message"?: (input: unknown, output: unknown) => Promise<void>
  "experimental.chat.system.transform"?: (input: unknown, output: unknown) => Promise<void>
  event?: (input: unknown) => Promise<void>
}

export type ServerInput = {
  /** OpenCode passes a `directory`/`cwd` so plugins can find project-local config. */
  directory?: string
  cwd?: string
}

export function createPlugin(input?: ServerInput): {
  pluginInterface: PluginInterface
  /** Useful for tests / introspection. */
  getConfig: () => OcmmConfig
  /** Reload from disk (useful in dev). */
  reload: () => OcmmConfig
} {
  const cwd = input?.directory ?? input?.cwd ?? process.cwd()
  let config: OcmmConfig
  let promptsLoaded = false

  function loadOrDefault(): OcmmConfig {
    try {
      const { config: c, sources } = loadConfig({ cwd })
      log.info(
        `config loaded: project=${sources.project ?? "<none>"}, user=${sources.user ?? "<none>"}`,
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
      loadAllPrompts(config.promptsRoot)
    } catch (err) {
      log.warn(`prompt load failed: ${(err as Error).message}`)
    }
    promptsLoaded = true
  }

  config = loadOrDefault()
  ensurePromptsLoaded()
  const getConfig = (): OcmmConfig => config

  const pluginInterface: PluginInterface = {
    config: createConfigHandler({ getConfig }),
    "chat.params": createChatParamsHandler({ getConfig }),
    "chat.message": createChatMessageHandler({ getConfig }),
    "experimental.chat.system.transform": createSystemTransformHandler(),
    event: createEventHandler(),
  }

  return {
    pluginInterface,
    getConfig,
    reload(): OcmmConfig {
      config = loadOrDefault()
      promptsLoaded = false
      ensurePromptsLoaded()
      return config
    },
  }
}

/**
 * The top-level plugin module OpenCode expects.
 *
 * `server(input, options)` must return a plain object whose keys are valid
 * OpenCode hook names. We also wire a `dispose()` for symmetry.
 */
const pluginModule = {
  id: PLUGIN_ID,
  server(input: ServerInput): PluginInterface {
    const { pluginInterface } = createPlugin(input)
    return pluginInterface
  },
}

export default pluginModule
