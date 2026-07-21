import {
  logicalTierProfileName,
  splitLogicalTierProfileName,
  type LogicalTier,
} from "../logical-tiers/names.ts"

export const PLANNING_AGENT_NAMES = ["planner", "plan-critic"] as const

export type PlanningAgentRole = (typeof PLANNING_AGENT_NAMES)[number]

export type PlanningAgentIdentity = {
  role: PlanningAgentRole
  logicalTier: LogicalTier
  canonicalName: string
}

export function parsePlanningAgentName(name: string): PlanningAgentIdentity | null {
  const { baseName, logicalTier } = splitLogicalTierProfileName(name)
  if (!PLANNING_AGENT_NAMES.includes(baseName as PlanningAgentRole)) return null
  const role = baseName as PlanningAgentRole
  return {
    role,
    logicalTier,
    canonicalName: logicalTierProfileName(role, logicalTier),
  }
}

export function isPlanningAgentName(name: string): boolean {
  return parsePlanningAgentName(name) !== null
}

export function isReservedPlanningAgentName(name: string): boolean {
  return PLANNING_AGENT_NAMES.some((role) => name === role || name.startsWith(`${role}-`))
}
