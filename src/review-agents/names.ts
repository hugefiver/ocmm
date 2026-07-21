import {
  logicalTierProfileName,
  splitLogicalTierProfileName,
  type LogicalTier,
} from "../logical-tiers/names.ts"

export const ORACLE_SLOT_NAMES = [
  "oracle",
  "oracle-2nd",
  "oracle-3rd",
  "oracle-4th",
  "oracle-5th",
  "oracle-6th",
  "oracle-7th",
  "oracle-8th",
  "oracle-9th",
] as const

export type OracleSlotName = (typeof ORACLE_SLOT_NAMES)[number]
export type OracleOrdinal = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type ReviewAgentRole = "oracle" | "reviewer"
export type ReviewLogicalTier = LogicalTier

export type ReviewAgentIdentity = {
  role: ReviewAgentRole
  ordinal: OracleOrdinal
  logicalTier: ReviewLogicalTier
  canonicalSlot: OracleSlotName | "reviewer"
  canonicalName: string
}

const ORACLE_ORDINALS = new Map<OracleSlotName, OracleOrdinal>(
  ORACLE_SLOT_NAMES.map((slot, index) => [slot, (index + 1) as OracleOrdinal]),
)

export function parseReviewAgentName(name: string): ReviewAgentIdentity | null {
  const runtimeCanonical = name === "oracle-second" ? "oracle-2nd" : name
  const { baseName: slot, logicalTier } = splitLogicalTierProfileName(runtimeCanonical)
  if (slot === "reviewer") {
    return {
      role: "reviewer",
      ordinal: 1,
      logicalTier,
      canonicalSlot: "reviewer",
      canonicalName: logicalTierProfileName("reviewer", logicalTier),
    }
  }
  const ordinal = ORACLE_ORDINALS.get(slot as OracleSlotName)
  if (ordinal === undefined) return null
  const canonicalSlot = slot as OracleSlotName
  return {
    role: "oracle",
    ordinal,
    logicalTier,
    canonicalSlot,
    canonicalName: logicalTierProfileName(canonicalSlot, logicalTier),
  }
}

export function canonicalizeReviewAgentName(name: string): string | null {
  return parseReviewAgentName(name)?.canonicalName ?? null
}

export function isReviewAgentName(name: string): boolean {
  return parseReviewAgentName(name) !== null
}

export function isReservedReviewAgentName(name: string): boolean {
  return name === "oracle" || name.startsWith("oracle-") || name === "reviewer" || name.startsWith("reviewer-")
}
