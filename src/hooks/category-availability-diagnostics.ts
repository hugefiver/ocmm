import {
  resolveCategoryAvailabilityDiagnostic,
  type CategoryAvailabilityDiagnostic,
  type ResolveCategoryAvailabilityDiagnosticArgs,
} from "../routing/category-availability.ts"
import { log } from "../shared/logger.ts"

export type CategoryAvailabilityDiagnosticLogger = {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
}

function formatCandidate(
  candidate: CategoryAvailabilityDiagnostic["candidates"][number],
): string {
  return `#${candidate.index}(model=${JSON.stringify(candidate.model)},providers=${JSON.stringify(candidate.providers)},status=${candidate.status},reasons=${JSON.stringify(candidate.reasons)})`
}

function formatDiagnostic(diagnostic: CategoryAvailabilityDiagnostic): string {
  return [
    `category availability: name=${JSON.stringify(diagnostic.name)}`,
    `status=${diagnostic.status}`,
    `reason=${diagnostic.reason}`,
    `requirementSource=${diagnostic.requirementSource}`,
    `primarySource=${diagnostic.primarySource}`,
    `selectedModel=${JSON.stringify(diagnostic.selectedModel)}`,
    "routePreserved=true",
    `candidates=[${diagnostic.candidates.map(formatCandidate).join(";")}]`,
  ].join(" ")
}

export function createCategoryAvailabilityDiagnosticReporter(
  logger: CategoryAvailabilityDiagnosticLogger = log,
): (args: ResolveCategoryAvailabilityDiagnosticArgs) => void {
  const emitted = new Set<string>()

  return (args) => {
    try {
      const diagnostic = resolveCategoryAvailabilityDiagnostic(args)
      if (emitted.has(diagnostic.key)) return
      emitted.add(diagnostic.key)
      const level = diagnostic.status === "dead" ? "warn" : "info"
      logger[level](formatDiagnostic(diagnostic))
    } catch {
      // Diagnostics are observational and may never interrupt route registration.
    }
  }
}
