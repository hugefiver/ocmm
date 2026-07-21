import type { AgentEntry } from "../config/schema.ts"
import { BUILTIN_AGENT_INDEX } from "../data/agents.ts"
import {
  materializeLogicalTierProfiles,
  resolveLogicalTierBase,
  type AgentProfileRegistrationOverrides,
  type MaterializedLogicalTierProfile,
} from "../logical-tiers/materialize.ts"
import { LOGICAL_TIER_ORDER } from "../logical-tiers/names.ts"
import {
  ORACLE_SLOT_NAMES,
  canonicalizeReviewAgentName,
  parseReviewAgentName,
  type OracleSlotName,
  type ReviewAgentIdentity,
} from "./names.ts"

export type ReviewAgentRegistrationOverrides = AgentProfileRegistrationOverrides

export type ExpandedReviewAgent = MaterializedLogicalTierProfile & {
  identity: ReviewAgentIdentity
  sourceSlot: OracleSlotName | "reviewer"
  promptSource: "reviewer"
}

export type ReviewAgentExpansionInput = {
  agents?: Record<string, AgentEntry>
  disabledAgents?: readonly string[]
}

function disabledNames(input: ReviewAgentExpansionInput): Set<string> {
  return new Set((input.disabledAgents ?? []).map((name) => canonicalizeReviewAgentName(name) ?? name))
}

export function isExpandedReviewAgentDisabled(name: string, input: ReviewAgentExpansionInput): boolean {
  const identity = parseReviewAgentName(name)
  if (!identity) return false
  const disabled = disabledNames(input)
  if (disabled.has(identity.canonicalName) || disabled.has(identity.canonicalSlot)) return true
  const normalEntry = input.agents?.[identity.canonicalSlot]
  return normalEntry?.disabled === true
}

export function expandReviewAgents(input: ReviewAgentExpansionInput = {}): ExpandedReviewAgent[] {
  const output: ExpandedReviewAgent[] = []
  const normalSlots: Array<OracleSlotName | "reviewer"> = [...ORACLE_SLOT_NAMES, "reviewer"]
  for (const slot of normalSlots) {
    const base = resolveLogicalTierBase({
      baseName: slot,
      agents: input.agents,
      builtin: BUILTIN_AGENT_INDEX.get(slot),
    })
    if (!base) continue
    const configured = input.agents?.[slot]
    const profiles = materializeLogicalTierProfiles({
      baseName: slot,
      base,
      variants: configured?.variants,
      isDisabled: (name) => isExpandedReviewAgentDisabled(name, input),
    })
    for (const profile of profiles) {
      const identity = parseReviewAgentName(profile.name)
      if (!identity) continue
      output.push({
        ...profile,
        name: identity.canonicalName,
        identity,
        sourceSlot: slot,
        promptSource: "reviewer",
      })
    }
  }
  output.sort((left, right) => {
    if (left.identity.role !== right.identity.role) return left.identity.role === "oracle" ? -1 : 1
    if (left.identity.ordinal !== right.identity.ordinal) return left.identity.ordinal - right.identity.ordinal
    return LOGICAL_TIER_ORDER.indexOf(left.identity.logicalTier)
      - LOGICAL_TIER_ORDER.indexOf(right.identity.logicalTier)
  })
  return output
}

export function expandedReviewAgentMap(input: ReviewAgentExpansionInput = {}): ReadonlyMap<string, ExpandedReviewAgent> {
  return new Map(expandReviewAgents(input).map((profile) => [profile.name, profile]))
}
