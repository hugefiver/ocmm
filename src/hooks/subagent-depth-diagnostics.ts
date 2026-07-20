import type { OcmmConfig } from "../config/schema.ts"
import { isRecord, log } from "../shared/logger.ts"

const SUBAGENT_DEPTH_GUARD_NAMES = new Set([
  "subagent-depth-guard",
  "subagentDepthGuard",
])

export type SubagentDepthDiagnostic = {
  key: string
  level: "info" | "warn"
  message: string
}

export type SubagentDepthDiagnosticLogger = {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
}

function observedHostDepth(hostConfig: unknown): number | undefined {
  if (!isRecord(hostConfig) || !Object.hasOwn(hostConfig, "subagent_depth")) return undefined
  const value = hostConfig.subagent_depth
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    return undefined
  }
  return value
}

function depthGuardEnabled(config: OcmmConfig): boolean {
  return !config.disabledHooks.some((name) => SUBAGENT_DEPTH_GUARD_NAMES.has(name))
}

export function resolveSubagentDepthDiagnostic(
  hostConfig: unknown,
  config: OcmmConfig,
): SubagentDepthDiagnostic | null {
  const hostDepth = observedHostDepth(hostConfig)
  if (hostDepth === undefined) return null

  if (!depthGuardEnabled(config)) {
    return {
      key: `host:${hostDepth}|ocmm:disabled`,
      level: "info",
      message: `subagent depth compatibility: OpenCode subagent_depth=${hostDepth}, ocmm subagent-depth-guard=disabled, effective=${hostDepth} (host only; task dispatches only)`,
    }
  }

  const ocmmDepth = config.subagent.maxDepth
  const effective = Math.min(hostDepth, ocmmDepth)
  const relation = hostDepth === ocmmDepth
    ? "limits agree"
    : hostDepth < ocmmDepth
      ? "host is stricter"
      : "ocmm is stricter"

  return {
    key: `host:${hostDepth}|ocmm:${ocmmDepth}`,
    level: hostDepth === ocmmDepth ? "info" : "warn",
    message: `subagent depth compatibility: OpenCode subagent_depth=${hostDepth}, ocmm subagent.maxDepth=${ocmmDepth}, effective=${effective} (${relation}; task dispatches only)`,
  }
}

export function createSubagentDepthDiagnosticReporter(
  logger: SubagentDepthDiagnosticLogger = log,
): (hostConfig: unknown, config: OcmmConfig) => void {
  const emitted = new Set<string>()

  return (hostConfig, config) => {
    const diagnostic = resolveSubagentDepthDiagnostic(hostConfig, config)
    if (!diagnostic || emitted.has(diagnostic.key)) return
    emitted.add(diagnostic.key)
    logger[diagnostic.level](diagnostic.message)
  }
}
