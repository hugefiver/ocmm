import type { OcmmConfig } from "../config/schema.ts"
import { hookDisabled } from "../permissions/index.ts"
import { isRecord, log } from "../shared/logger.ts"

const TRUNCATION_MARKER = "[ocmm cache mitigation: older tool output truncated"

export type HistoryCacheMitigationStats = {
  truncated: number
  omittedChars: number
}

export function createHistoryCacheMitigationHandler(args: {
  getConfig: () => OcmmConfig
}): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput, rawOutput) => {
    const config = args.getConfig()
    const options = config.historyCacheMitigation
    if (!options.enabled) return
    if (hookDisabled(config, "history-cache-mitigation", "historyCacheMitigation")) return
    if (!isRecord(rawOutput) || !Array.isArray(rawOutput.messages)) return

    const modelID = currentModelID(rawInput)
    if (!modelID || !matchesAnyModel(modelID, options.models)) return

    const stats = truncateHistoricalToolOutputs(rawOutput.messages, {
      maxToolOutputChars: options.maxToolOutputChars,
      preserveRecentToolResults: options.preserveRecentToolResults,
    })
    if (stats.truncated > 0) {
      log.info(
        `history-cache-mitigation: truncated ${stats.truncated} older tool outputs, omitted ${stats.omittedChars} chars`,
      )
    }
  }
}

export function truncateHistoricalToolOutputs(
  messages: unknown[],
  options: { maxToolOutputChars: number; preserveRecentToolResults: number },
): HistoryCacheMitigationStats {
  const toolParts: Array<{ state: Record<string, unknown>; output: string }> = []
  for (const message of messages) {
    if (!isRecord(message) || !Array.isArray(message.parts)) continue
    for (const part of message.parts) {
      if (!isRecord(part) || part.type !== "tool") continue
      const state = part.state
      if (!isRecord(state) || state.status !== "completed") continue
      if (typeof state.output !== "string") continue
      toolParts.push({ state, output: state.output })
    }
  }

  const preserveStart = Math.max(0, toolParts.length - options.preserveRecentToolResults)
  let truncated = 0
  let omittedChars = 0
  for (let i = 0; i < preserveStart; i++) {
    const item = toolParts[i]!
    if (item.output.length <= options.maxToolOutputChars) continue
    if (item.output.includes(TRUNCATION_MARKER)) continue

    const omitted = item.output.length - options.maxToolOutputChars
    item.state.output = `${item.output.slice(0, options.maxToolOutputChars)}\n\n${TRUNCATION_MARKER}; omitted ${omitted} chars. Re-run the tool or read the source again if exact old output is needed.]`
    truncated++
    omittedChars += omitted
  }
  return { truncated, omittedChars }
}

function currentModelID(input: unknown): string | null {
  if (!isRecord(input)) return null
  const direct = stringField(input, "modelID")
  if (direct) return direct

  const model = input.model
  if (isRecord(model)) {
    const nested = stringField(model, "modelID") ?? stringField(model, "id")
    if (nested) return nested
  }

  const properties = input.properties
  if (isRecord(properties)) {
    const propertyDirect = stringField(properties, "modelID")
    if (propertyDirect) return propertyDirect
    const propertyModel = properties.model
    if (isRecord(propertyModel)) {
      const nested = stringField(propertyModel, "modelID") ?? stringField(propertyModel, "id")
      if (nested) return nested
    }
  }

  return null
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === "string" && value.trim() ? value : null
}

function matchesAnyModel(modelID: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globPattern(pattern).test(modelID))
}

function globPattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")
  return new RegExp(`^${escaped}$`, "i")
}
