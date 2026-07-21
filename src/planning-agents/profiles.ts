import type { AgentEntry } from "../config/schema.ts"
import { BUILTIN_AGENT_INDEX } from "../data/agents.ts"
import {
  materializeLogicalTierProfiles,
  resolveLogicalTierBase,
  type MaterializedLogicalTierProfile,
} from "../logical-tiers/materialize.ts"
import { LOGICAL_TIER_ORDER } from "../logical-tiers/names.ts"
import {
  PLANNING_AGENT_NAMES,
  parsePlanningAgentName,
  type PlanningAgentIdentity,
  type PlanningAgentRole,
} from "./names.ts"

export type PlanningAgentPolicy = {
  promptSource: PlanningAgentRole
  mode: "all" | "subagent"
  permissionClass: "planner" | "read-only"
  includeLocalePrefix: boolean
  reviewEffortFloor: boolean
}

export const PLANNING_AGENT_POLICIES: Record<PlanningAgentRole, PlanningAgentPolicy> = {
  planner: {
    promptSource: "planner",
    mode: "all",
    permissionClass: "planner",
    includeLocalePrefix: true,
    reviewEffortFloor: false,
  },
  "plan-critic": {
    promptSource: "plan-critic",
    mode: "subagent",
    permissionClass: "read-only",
    includeLocalePrefix: false,
    reviewEffortFloor: true,
  },
}

export type ExpandedPlanningAgent = MaterializedLogicalTierProfile & {
  identity: PlanningAgentIdentity
  policy: PlanningAgentPolicy
}

export type PlanningAgentExpansionInput = {
  agents?: Record<string, AgentEntry>
  disabledAgents?: readonly string[]
}

export function isExpandedPlanningAgentDisabled(
  name: string,
  input: PlanningAgentExpansionInput,
): boolean {
  const identity = parsePlanningAgentName(name)
  if (!identity) return false
  const disabled = new Set(input.disabledAgents ?? [])
  if (disabled.has(identity.role) || disabled.has(identity.canonicalName)) return true
  return input.agents?.[identity.role]?.disabled === true
}

export function expandPlanningAgents(input: PlanningAgentExpansionInput = {}): ExpandedPlanningAgent[] {
  const output: ExpandedPlanningAgent[] = []
  for (const role of PLANNING_AGENT_NAMES) {
    const base = resolveLogicalTierBase({
      baseName: role,
      agents: input.agents,
      builtin: BUILTIN_AGENT_INDEX.get(role),
    })
    if (!base) continue

    const profiles = materializeLogicalTierProfiles({
      baseName: role,
      base,
      variants: input.agents?.[role]?.variants,
      isDisabled: (name) => isExpandedPlanningAgentDisabled(name, input),
    })
    for (const profile of profiles) {
      const identity = parsePlanningAgentName(profile.name)
      if (!identity) continue
      output.push({
        ...profile,
        name: identity.canonicalName,
        identity,
        policy: structuredClone(PLANNING_AGENT_POLICIES[role]),
      })
    }
  }

  output.sort((left, right) => {
    const roleOrder = PLANNING_AGENT_NAMES.indexOf(left.identity.role)
      - PLANNING_AGENT_NAMES.indexOf(right.identity.role)
    if (roleOrder !== 0) return roleOrder
    return LOGICAL_TIER_ORDER.indexOf(left.identity.logicalTier)
      - LOGICAL_TIER_ORDER.indexOf(right.identity.logicalTier)
  })
  return output
}

export function expandedPlanningAgentMap(
  input: PlanningAgentExpansionInput = {},
): ReadonlyMap<string, ExpandedPlanningAgent> {
  return new Map(expandPlanningAgents(input).map((profile) => [profile.name, profile]))
}
