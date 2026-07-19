import type { FallbackEntry, ModelRequirement } from "../shared/types.ts"
import { isRecord } from "../shared/logger.ts"
import { parseReviewAgentName } from "../review-agents/names.ts"

type Version = [number, number, number]

type CatalogCandidate = {
  provider: string
  model: string
  version: Version
  providerIndex: number
}

export type RequirementSuccessorMatch = {
  entry: FallbackEntry
  baselineIndex: number
}

const MIN_GPT_VERSION: Version = [5, 6, 0]
const MIN_GLM_VERSION: Version = [5, 2, 0]

const GPT_LANE_BY_AGENT = new Map<string, "sol" | "terra">([
  ["orchestrator", "sol"],
  ["builder", "sol"],
  ["reviewer", "sol"],
  ["planner", "sol"],
  ["clarifier", "sol"],
  ["plan-critic", "sol"],
  ["oracle", "terra"],
  ["hard-reasoning", "sol"],
  ["deep", "sol"],
  ["complex", "terra"],
  ["normal-task", "terra"],
])

/**
 * Resolve the GPT lane (Sol/Terra) for an agent name.
 *
 * Review agents (oracle/reviewer and their logical tiers/runtime aliases) are
 * classified by canonical slot identity, not the runtime suffix:
 *   - reviewer                 -> Sol
 *   - oracle (slot 1, any tier) -> Terra
 *   - oracle-2nd (slot 2)      -> Sol
 *   - later oracle slots       -> no invented lane (rely on explicit requirement)
 *
 * Logical tier suffixes (-low/-high/-max) never change the canonical slot's
 * lane. Non-review agent names fall back to the static map.
 */
function gptLaneForAgent(agentName: string): "sol" | "terra" | undefined {
  const review = parseReviewAgentName(agentName)
  if (review) {
    if (review.role === "reviewer") return "sol"
    if (review.canonicalSlot === "oracle") return "terra"
    if (review.canonicalSlot === "oracle-2nd") return "sol"
    return undefined
  }
  return GPT_LANE_BY_AGENT.get(agentName)
}

function compareVersion(a: Version, b: Version): number {
  for (let index = 0; index < a.length; index += 1) {
    const delta = a[index]! - b[index]!
    if (delta !== 0) return delta
  }
  return 0
}

function parseGptVersion(model: string): Version | null {
  const match = model.toLowerCase().match(/^gpt-(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:$|[-_.])/)
  if (!match) return null
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

function parseGptLane(model: string): { version: Version; lane: "sol" | "terra" } | null {
  const match = model.toLowerCase().match(/^gpt-(\d+)(?:\.(\d+))?(?:\.(\d+))?-(sol|terra)(?:$|[-_.])/)
  if (!match) return null
  return {
    version: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)],
    lane: match[4] as "sol" | "terra",
  }
}

function parseGlmSuccessor(model: string): Version | null {
  const match = model.toLowerCase().match(/^glm-(5)\.(\d+)(?:\.(\d+))?(?:$|[-_.])/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
}

function compatibleEntryWithIndex(
  requirement: ModelRequirement,
  providerID: string | undefined,
  predicate: (entry: FallbackEntry) => boolean,
): { entry: FallbackEntry; baselineIndex: number } | undefined {
  for (const [baselineIndex, entry] of requirement.fallbackChain.entries()) {
    if (predicate(entry) && (providerID === undefined || entry.providers.includes(providerID))) {
      return { entry, baselineIndex }
    }
  }
  return undefined
}

function compatibleEntry(
  requirement: ModelRequirement,
  providerID: string | undefined,
  predicate: (entry: FallbackEntry) => boolean,
): FallbackEntry | undefined {
  return compatibleEntryWithIndex(requirement, providerID, predicate)?.entry
}

function synthesizeSuccessor(
  baseline: FallbackEntry,
  providerID: string | undefined,
  modelID: string,
): FallbackEntry {
  return {
    ...baseline,
    ...(providerID === undefined ? {} : { providers: [providerID] }),
    model: modelID,
  }
}

function compareCatalogCandidates(a: CatalogCandidate, b: CatalogCandidate): number {
  const versionDelta = compareVersion(b.version, a.version)
  if (versionDelta !== 0) return versionDelta
  return a.providerIndex - b.providerIndex || a.model.localeCompare(b.model)
}

function catalogContainsExactModel(
  providers: Record<string, unknown>,
  entry: FallbackEntry,
): string | undefined {
  for (const provider of entry.providers) {
    const rawProvider = providers[provider]
    if (!isRecord(rawProvider) || !isRecord(rawProvider.models)) continue
    if (isRecord(rawProvider.models) && rawProvider.models[entry.model] !== undefined) {
      return `${provider}/${entry.model}`
    }
  }
  return undefined
}

export function selectCatalogModel(
  target: Record<string, unknown>,
  agentName: string,
  requirement: ModelRequirement,
): string | undefined {
  const providers = isRecord(target.provider) ? target.provider : undefined
  if (!providers) return undefined

  const review = parseReviewAgentName(agentName)
  const isCanonicalOracleFirstSlot = review?.canonicalSlot === "oracle"
  const lane = gptLaneForAgent(agentName)
  const gptBaseline = compatibleEntry(requirement, undefined, (entry) => parseGptVersion(entry.model) !== null)
  if (isCanonicalOracleFirstSlot) {
    for (const entry of requirement.fallbackChain) {
      if (parseGptVersion(entry.model) === null) continue
      if (parseGptLane(entry.model) !== null) continue
      const exact = catalogContainsExactModel(providers, entry)
      if (exact) return exact
    }
  }
  if (lane && gptBaseline) {
    const candidates: CatalogCandidate[] = []
    for (const [providerIndex, provider] of gptBaseline.providers.entries()) {
      const rawProvider = providers[provider]
      if (!isRecord(rawProvider) || !isRecord(rawProvider.models)) continue
      for (const model of Object.keys(rawProvider.models)) {
        const parsed = parseGptLane(model)
        if (!parsed || parsed.lane !== lane || compareVersion(parsed.version, MIN_GPT_VERSION) < 0) continue
        candidates.push({ provider, model, version: parsed.version, providerIndex })
      }
    }
    candidates.sort(compareCatalogCandidates)
    const best = candidates[0]
    if (best) return `${best.provider}/${best.model}`
  }

  const glmBaseline = compatibleEntry(
    requirement,
    undefined,
    (entry) => entry.model.toLowerCase() === "glm-5.1",
  )
  if (!glmBaseline) return undefined

  const candidates: CatalogCandidate[] = []
  for (const [providerIndex, provider] of glmBaseline.providers.entries()) {
    const rawProvider = providers[provider]
    if (!isRecord(rawProvider) || !isRecord(rawProvider.models)) continue
    for (const model of Object.keys(rawProvider.models)) {
      const version = parseGlmSuccessor(model)
      if (!version || compareVersion(version, MIN_GLM_VERSION) < 0) continue
      candidates.push({ provider, model, version, providerIndex })
    }
  }
  candidates.sort(compareCatalogCandidates)
  const best = candidates[0]
  return best ? `${best.provider}/${best.model}` : undefined
}

export function matchRequirementSuccessorWithIndex(
  requirement: ModelRequirement,
  providerID: string | undefined,
  modelID: string,
): RequirementSuccessorMatch | null {
  const gpt = parseGptLane(modelID)
  if (gpt && compareVersion(gpt.version, MIN_GPT_VERSION) >= 0) {
    const sameLaneBaseline = compatibleEntryWithIndex(requirement, providerID, (entry) => {
      const parsed = parseGptLane(entry.model)
      return parsed !== null && parsed.lane === gpt.lane && compareVersion(gpt.version, parsed.version) >= 0
    })
    const baseline = sameLaneBaseline ?? compatibleEntryWithIndex(requirement, providerID, (entry) => {
      const version = parseGptVersion(entry.model)
      return version !== null && compareVersion(gpt.version, version) >= 0
    })
    if (baseline) {
      return {
        entry: synthesizeSuccessor(baseline.entry, providerID, modelID),
        baselineIndex: baseline.baselineIndex,
      }
    }
  }

  const glm = parseGlmSuccessor(modelID)
  if (glm && compareVersion(glm, MIN_GLM_VERSION) >= 0) {
    const baseline = compatibleEntryWithIndex(
      requirement,
      providerID,
      (entry) => entry.model.toLowerCase() === "glm-5.1",
    )
    if (baseline) {
      return {
        entry: synthesizeSuccessor(baseline.entry, providerID, modelID),
        baselineIndex: baseline.baselineIndex,
      }
    }
  }

  return null
}

export function matchRequirementSuccessor(
  requirement: ModelRequirement,
  providerID: string | undefined,
  modelID: string,
): FallbackEntry | null {
  return matchRequirementSuccessorWithIndex(requirement, providerID, modelID)?.entry ?? null
}
