import type { FastModelsConfig } from "../config/schema.ts"
import type {
  EffectiveModelRoute,
  FallbackEntry,
  ModelRequirement,
  PrimarySource,
  RequirementSource,
} from "../shared/types.ts"
import { matchRequirementSuccessorWithIndex } from "./model-upgrades.ts"

type SelectedModelIdentity = {
  providerID: string
  modelID: string
}

function parseSelectedModelIdentity(selectedModel: string): SelectedModelIdentity | null {
  const separator = selectedModel.indexOf("/")
  if (separator <= 0 || separator === selectedModel.length - 1) return null
  const providerID = selectedModel.slice(0, separator)
  const modelID = selectedModel.slice(separator + 1)
  return providerID && modelID ? { providerID, modelID } : null
}

function cloneEntry(entry: FallbackEntry): FallbackEntry {
  return {
    ...entry,
    providers: [...entry.providers],
    ...(entry.thinking ? { thinking: { ...entry.thinking } } : {}),
  }
}

function cloneRequirement(requirement: ModelRequirement): ModelRequirement {
  return {
    ...requirement,
    fallbackChain: requirement.fallbackChain.map(cloneEntry),
    ...(requirement.requiresProvider !== undefined ? { requiresProvider: [...requirement.requiresProvider] } : {}),
  }
}

function entryIdentity(entry: FallbackEntry): string {
  return JSON.stringify([entry.providers, entry.model])
}

function stableDedupe(entries: readonly FallbackEntry[]): FallbackEntry[] {
  const identities = new Set<string>()
  const deduped: FallbackEntry[] = []
  for (const entry of entries) {
    const identity = entryIdentity(entry)
    if (identities.has(identity)) continue
    identities.add(identity)
    deduped.push(cloneEntry(entry))
  }
  return deduped
}

function entryMatchesBoundaryPrefix(entry: FallbackEntry, providerID: string, modelID: string): boolean {
  if (!entry.providers.includes(providerID) || !modelID.startsWith(entry.model)) return false
  const boundary = modelID[entry.model.length]
  return boundary === "-" || boundary === "_" || boundary === "."
}

function pinnedSelectedEntry(entry: FallbackEntry, providerID: string, modelID: string): FallbackEntry {
  return { ...cloneEntry(entry), providers: [providerID], model: modelID }
}

function mappedCandidate(value: string, selected: SelectedModelIdentity): string | null {
  return value !== "" && value !== selected.modelID ? value : null
}

export function parseFastModeValue(value: string | undefined): boolean {
  return value === "1" || value === "true"
}

export function materializeSelectedPrimary(
  requirement: ModelRequirement,
  selectedModel: string,
): ModelRequirement {
  const selected = parseSelectedModelIdentity(selectedModel)
  const cloned = cloneRequirement(requirement)
  if (!selected) return cloned

  let baselineIndex = -1
  let primary: FallbackEntry | undefined

  for (const [index, entry] of requirement.fallbackChain.entries()) {
    if (entry.providers.includes(selected.providerID) && entry.model === selected.modelID) {
      baselineIndex = index
      primary = pinnedSelectedEntry(entry, selected.providerID, selected.modelID)
      break
    }
  }

  if (!primary) {
    const successor = matchRequirementSuccessorWithIndex(
      requirement,
      selected.providerID,
      selected.modelID,
    )
    if (successor) {
      baselineIndex = successor.baselineIndex
      primary = pinnedSelectedEntry(successor.entry, selected.providerID, selected.modelID)
    }
  }

  if (!primary) {
    for (const [index, entry] of requirement.fallbackChain.entries()) {
      if (entryMatchesBoundaryPrefix(entry, selected.providerID, selected.modelID)) {
        baselineIndex = index
        primary = pinnedSelectedEntry(entry, selected.providerID, selected.modelID)
        break
      }
    }
  }

  if (!primary) {
    primary = {
      providers: [selected.providerID],
      model: selected.modelID,
      ...(requirement.variant !== undefined ? { variant: requirement.variant } : {}),
    }
  }

  const remainder = cloned.fallbackChain.filter((_, index) => index !== baselineIndex)
  return { ...cloned, fallbackChain: stableDedupe([primary, ...remainder]) }
}

export function selectFastCandidate(args: {
  selectedModel: string
  fastMode: boolean
  fastModels: FastModelsConfig
  catalogModels?: ReadonlySet<string>
}): string | null {
  if (!args.fastMode) return null
  const selected = parseSelectedModelIdentity(args.selectedModel)
  if (!selected || !args.fastModels.providers?.includes(selected.providerID)) return null

  const mappings = args.fastModels.mappings ?? {}
  if (Object.prototype.hasOwnProperty.call(mappings, args.selectedModel)) {
    return mappedCandidate(mappings[args.selectedModel]!, selected)
  }

  if (selected.modelID.endsWith("-fast")) return null
  const candidate = `${selected.modelID}-fast`
  return args.catalogModels?.has(candidate) ? candidate : null
}

export function buildEffectiveModelRoute(args: {
  selectedModel: string
  requirement: ModelRequirement
  requirementSource: RequirementSource
  primarySource: PrimarySource
  fastMode: boolean
  fastModels: FastModelsConfig
  catalogModels?: ReadonlySet<string>
}): EffectiveModelRoute {
  const requirement = materializeSelectedPrimary(args.requirement, args.selectedModel)
  const candidate = selectFastCandidate(args)
  const selected = parseSelectedModelIdentity(args.selectedModel)

  if (!candidate || !selected) {
    return {
      model: args.selectedModel,
      requirement,
      requirementSource: args.requirementSource,
      primarySource: args.primarySource,
    }
  }

  const original = requirement.fallbackChain[0]!
  const fast = { ...cloneEntry(original), providers: [selected.providerID], model: candidate }
  return {
    model: `${selected.providerID}/${candidate}`,
    requirement: {
      ...requirement,
      fallbackChain: stableDedupe([fast, ...requirement.fallbackChain]),
    },
    requirementSource: args.requirementSource,
    primarySource: args.primarySource,
  }
}
