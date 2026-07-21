export const LOGICAL_TIER_SUFFIXES = ["low", "high", "max"] as const
export const LOGICAL_TIER_ORDER = ["normal", ...LOGICAL_TIER_SUFFIXES] as const

export type LogicalTierSuffix = (typeof LOGICAL_TIER_SUFFIXES)[number]
export type LogicalTier = (typeof LOGICAL_TIER_ORDER)[number]

export function splitLogicalTierProfileName(name: string): {
  baseName: string
  logicalTier: LogicalTier
} {
  for (const tier of LOGICAL_TIER_SUFFIXES) {
    const suffix = `-${tier}`
    if (name.endsWith(suffix) && name.length > suffix.length) {
      return { baseName: name.slice(0, -suffix.length), logicalTier: tier }
    }
  }
  return { baseName: name, logicalTier: "normal" }
}

export function logicalTierProfileName(baseName: string, tier: LogicalTier): string {
  return tier === "normal" ? baseName : `${baseName}-${tier}`
}
