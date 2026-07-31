import { isRecord } from "../shared/logger.ts"
import type {
  ModelRequirement,
  PrimarySource,
  RequirementSource,
} from "../shared/types.ts"
import { materializeSelectedPrimary } from "./effective-route.ts"

export type CategoryAvailabilityStatus = "available" | "dead" | "unknown"

export type CategoryCandidateStatus = "available" | "dead" | "unknown"

export type CategoryCandidateReason =
  | "catalog-match"
  | "catalog-any-model"
  | "requires-model-mismatch"
  | "requires-provider-mismatch"
  | "provider-unobserved"
  | "model-unobserved"

export type CategoryCandidateDiagnostic = Readonly<{
  index: number
  model: string
  providers: readonly string[]
  status: CategoryCandidateStatus
  reasons: readonly CategoryCandidateReason[]
}>

export type CategoryAvailabilityDiagnostic = Readonly<{
  key: string
  name: string
  status: CategoryAvailabilityStatus
  reason:
    | "catalog-match"
    | "catalog-any-model"
    | "structural-conflict"
    | "no-candidates"
    | "catalog-incomplete"
  requirementSource: RequirementSource
  primarySource: PrimarySource
  selectedModel: string
  routePreserved: true
  candidates: readonly CategoryCandidateDiagnostic[]
}>

export type ResolveCategoryAvailabilityDiagnosticArgs = {
  name: string
  target: Record<string, unknown>
  requirement: ModelRequirement
  requirementSource: RequirementSource
  primarySource: PrimarySource
  selectedModel: string
}

type ObservedCatalog = ReadonlyMap<string, ReadonlySet<string> | null>

function observeCatalog(target: Record<string, unknown>): ObservedCatalog {
  const observed = new Map<string, ReadonlySet<string> | null>()
  if (!isRecord(target.provider)) return observed

  for (const providerID of Object.keys(target.provider).sort()) {
    const rawProvider = target.provider[providerID]
    if (!isRecord(rawProvider)) continue
    observed.set(
      providerID,
      isRecord(rawProvider.models)
        ? new Set(Object.keys(rawProvider.models).sort())
        : null,
    )
  }
  return observed
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function providersForCandidate(
  explicitProviders: readonly string[],
  requirement: ModelRequirement,
  catalog: ObservedCatalog,
): string[] {
  if (explicitProviders.length > 0) return dedupe(explicitProviders)
  if (requirement.requiresProvider !== undefined) return dedupe(requirement.requiresProvider)
  return [...catalog.keys()]
}

function unknownReasons(
  providers: readonly string[],
  model: string,
  catalog: ObservedCatalog,
): CategoryCandidateReason[] {
  if (providers.length === 0) return ["provider-unobserved"]

  let providerUnobserved = false
  let modelUnobserved = false
  for (const provider of providers) {
    if (!catalog.has(provider)) {
      providerUnobserved = true
      continue
    }
    const models = catalog.get(provider)
    if (models === null || models === undefined || !models.has(model)) modelUnobserved = true
  }
  return [
    ...(providerUnobserved ? ["provider-unobserved" as const] : []),
    ...(modelUnobserved ? ["model-unobserved" as const] : []),
  ]
}

function evaluateCandidate(
  index: number,
  entry: ModelRequirement["fallbackChain"][number],
  requirement: ModelRequirement,
  catalog: ObservedCatalog,
): CategoryCandidateDiagnostic {
  const providers = providersForCandidate(entry.providers, requirement, catalog)
  if (requirement.requiresModel !== undefined && entry.model !== requirement.requiresModel) {
    return {
      index,
      model: entry.model,
      providers,
      status: "dead",
      reasons: ["requires-model-mismatch"],
    }
  }

  const requiredProviders = requirement.requiresProvider
  const eligibleProviders = requiredProviders === undefined
    ? providers
    : providers.filter((provider) => requiredProviders.includes(provider))
  if (
    entry.providers.length > 0
    && requiredProviders !== undefined
    && eligibleProviders.length === 0
  ) {
    return {
      index,
      model: entry.model,
      providers,
      status: "dead",
      reasons: ["requires-provider-mismatch"],
    }
  }

  if (eligibleProviders.length === 0) {
    return {
      index,
      model: entry.model,
      providers,
      status: "unknown",
      reasons: ["provider-unobserved"],
    }
  }

  if (requirement.requiresModel === undefined && requirement.requiresAnyModel === true) {
    const anyObservedModel = eligibleProviders.some((provider) => {
      const models = catalog.get(provider)
      return models !== null && models !== undefined && models.size > 0
    })
    if (anyObservedModel) {
      return {
        index,
        model: entry.model,
        providers,
        status: "available",
        reasons: ["catalog-any-model"],
      }
    }
  } else {
    const exactMatch = eligibleProviders.some((provider) => catalog.get(provider)?.has(entry.model) === true)
    if (exactMatch) {
      return {
        index,
        model: entry.model,
        providers,
        status: "available",
        reasons: ["catalog-match"],
      }
    }
  }

  return {
    index,
    model: entry.model,
    providers,
    status: "unknown",
    reasons: unknownReasons(eligibleProviders, entry.model, catalog),
  }
}

export function resolveCategoryAvailabilityDiagnostic(
  args: ResolveCategoryAvailabilityDiagnosticArgs,
): CategoryAvailabilityDiagnostic {
  const catalog = observeCatalog(args.target)
  const materialized = args.requirement.fallbackChain.length === 0
    ? args.requirement
    : materializeSelectedPrimary(args.requirement, args.selectedModel)
  const candidates = materialized.fallbackChain.map((entry, index) =>
    evaluateCandidate(index, entry, materialized, catalog)
  )

  const firstAvailable = candidates.find((candidate) => candidate.status === "available")
  const status: CategoryAvailabilityStatus = firstAvailable
    ? "available"
    : candidates.length === 0 || candidates.every((candidate) => candidate.status === "dead")
      ? "dead"
      : "unknown"
  const reason: CategoryAvailabilityDiagnostic["reason"] = firstAvailable
    ? firstAvailable.reasons[0] === "catalog-any-model"
      ? "catalog-any-model"
      : "catalog-match"
    : candidates.length === 0
      ? "no-candidates"
      : status === "dead"
        ? "structural-conflict"
        : "catalog-incomplete"

  const fields = {
    name: args.name,
    status,
    reason,
    requirementSource: args.requirementSource,
    primarySource: args.primarySource,
    selectedModel: args.selectedModel,
    routePreserved: true as const,
    candidates,
  }
  return { key: JSON.stringify(fields), ...fields }
}
