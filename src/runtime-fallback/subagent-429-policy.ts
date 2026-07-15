import type { RuntimeFallbackConfig } from "../config/schema.ts"
import type { FallbackCandidateBlocker } from "./fallback-state.ts"
import type { Subagent429Scope, Subagent429Target } from "./subagent-429-controller.ts"

export const MAX_RECOVERY_HINT_MS = 600_000

export type ScopeInfo = { key: string; scope: Subagent429Scope }

export function scopeFor(target: Subagent429Target, config: RuntimeFallbackConfig): ScopeInfo {
  const scope = config.subagent429.providerScopes[target.providerID] ?? "model"
  return scope === "provider"
    ? { key: `provider:${target.providerID}`, scope }
    : { key: `model:${target.providerID}/${target.modelID}`, scope }
}

export function scheduleDelay(
  retriesUsed: number,
  recoveryDelayMs: number | undefined,
  random: () => number,
): number {
  if (recoveryDelayMs !== undefined) {
    return recoveryDelayMs > MAX_RECOVERY_HINT_MS ? 0 : Math.max(0, Math.floor(recoveryDelayMs))
  }
  const raw = Math.min(30_000, 1_000 * 2 ** retriesUsed)
  const value = random()
  const sample = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1 - Number.EPSILON) : 0
  return Math.floor(raw / 2 + sample * raw / 2)
}

export function recoveryDeadline(observedAt: number, recoveryDelayMs: number | undefined): number | undefined {
  return recoveryDelayMs !== undefined && Number.isFinite(recoveryDelayMs) && recoveryDelayMs > 0
    ? observedAt + recoveryDelayMs
    : undefined
}

export function blockedUntil(
  lastRecoveryDeadline: number | undefined,
  observedAt: number,
  cooldownSeconds: number,
): number {
  return lastRecoveryDeadline !== undefined && lastRecoveryDeadline > observedAt
    ? lastRecoveryDeadline
    : observedAt + cooldownSeconds * 1_000
}

export function candidateBlocker(
  blocked: ReadonlyMap<string, number>,
  config: RuntimeFallbackConfig,
  clock: () => number,
): FallbackCandidateBlocker {
  return (entry) => {
    const target: Subagent429Target = {
      providerID: entry.providers[0] ?? "",
      modelID: entry.model,
      entry,
    }
    return (blocked.get(scopeFor(target, config).key) ?? 0) > clock()
  }
}
