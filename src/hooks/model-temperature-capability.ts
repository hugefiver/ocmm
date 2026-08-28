import {
  extractModelName,
  isClaudeOpus5Model,
  isClaudeOpus47OrLaterModel,
  isCodexModel,
} from "../intent/model-family.ts"
import { splitReasoningSuffix } from "../shared/reasoning.ts"

export type ModelTemperatureCapability = {
  providerID: string
  modelID: string
  supportsTemperature?: boolean
}

const BUNDLED_TEMPERATURE_CAPABILITIES: ReadonlyMap<string, boolean> = new Map()

function normalizeTemperatureLookupModel(modelID: string): string {
  return splitReasoningSuffix(modelID, { providerContext: true }).model
}

function modelDoesNotSupportTemperatureHeuristically(modelID: string): boolean {
  const name = extractModelName(modelID).toLowerCase()
  return isCodexModel(modelID)
    || isCodexModel(name)
    || /^gpt-5(?:$|[-_.])/.test(name)
    || /^o\d(?:$|[-_.])/.test(name)
    || isClaudeOpus5Model(modelID)
    || isClaudeOpus47OrLaterModel(modelID)
}

export function supportsModelTemperature(input: ModelTemperatureCapability): boolean {
  if (typeof input.supportsTemperature === "boolean") return input.supportsTemperature

  const providerID = input.providerID.trim().toLowerCase()
  const modelID = normalizeTemperatureLookupModel(input.modelID)
  const bundled = BUNDLED_TEMPERATURE_CAPABILITIES.get(`${providerID}/${modelID}`)
  if (bundled !== undefined) return bundled
  return !modelDoesNotSupportTemperatureHeuristically(modelID)
}
