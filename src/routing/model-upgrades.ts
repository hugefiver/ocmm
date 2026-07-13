import type { FallbackEntry, ModelRequirement } from "../shared/types.ts"
import { isRecord } from "../shared/logger.ts"

type Version = [number, number, number]

type CatalogCandidate = {
  provider: string
  model: string
  version: Version
  providerIndex: number
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

function compatibleEntry(
  requirement: ModelRequirement,
  providerID: string | undefined,
  predicate: (entry: FallbackEntry) => boolean,
): FallbackEntry | undefined {
  return requirement.fallbackChain.find(
    (entry) => predicate(entry) && (providerID === undefined || entry.providers.includes(providerID)),
  )
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

export function selectCatalogModel(
  target: Record<string, unknown>,
  agentName: string,
  requirement: ModelRequirement,
): string | undefined {
  const providers = isRecord(target.provider) ? target.provider : undefined
  if (!providers) return undefined

  const lane = GPT_LANE_BY_AGENT.get(agentName)
  const gptBaseline = compatibleEntry(requirement, undefined, (entry) => parseGptVersion(entry.model) !== null)
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

export function matchRequirementSuccessor(
  requirement: ModelRequirement,
  providerID: string | undefined,
  modelID: string,
): FallbackEntry | null {
  const gpt = parseGptLane(modelID)
  if (gpt && compareVersion(gpt.version, MIN_GPT_VERSION) >= 0) {
    const baseline = compatibleEntry(requirement, providerID, (entry) => {
      const version = parseGptVersion(entry.model)
      return version !== null && compareVersion(gpt.version, version) >= 0
    })
    if (baseline) return synthesizeSuccessor(baseline, providerID, modelID)
  }

  const glm = parseGlmSuccessor(modelID)
  if (glm && compareVersion(glm, MIN_GLM_VERSION) >= 0) {
    const baseline = compatibleEntry(
      requirement,
      providerID,
      (entry) => entry.model.toLowerCase() === "glm-5.1",
    )
    if (baseline) return synthesizeSuccessor(baseline, providerID, modelID)
  }

  return null
}
