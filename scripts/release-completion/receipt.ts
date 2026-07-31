import type {
  ReleaseCompletionReceipt,
  ReleaseTarget,
  SurfaceName,
  SurfaceReceipt,
  SurfaceStatus,
} from "./contracts.ts"

export const SURFACE_KEYS = [
  "identity",
  "workflow",
  "jobs",
  "githubRelease",
  "releaseAssets",
  "checksums",
  "npm",
  "githubPackages",
  "pinnedLspRelease",
] as const

export function sortNames(values: readonly string[]): string[] {
  return [...values].sort(compareOrdinal)
}

export function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function sameSortedNames(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index])
}

export function unresolvedSurface(): SurfaceReceipt {
  return {
    status: "UNRESOLVED",
    code: "not_checked",
    detail: "surface has not been checked",
  }
}

export function stagedSkippedSurface(): SurfaceReceipt {
  return {
    status: "SKIPPED",
    code: "staged_mode_not_applicable",
    detail: "remote verification is not applicable in staged mode",
  }
}

export function setSurface(
  receipt: ReleaseCompletionReceipt,
  surface: SurfaceName,
  status: SurfaceStatus,
  code: string,
  detail: string,
): void {
  receipt.surfaces[surface] = { status, code, detail }
}

export function addFailure(
  receipt: ReleaseCompletionReceipt,
  surface: SurfaceName,
  code: string,
  message: string,
): void {
  setSurface(receipt, surface, "FAILED", code, message)
  receipt.errors = [...receipt.errors, { surface, code, message, retryable: false }]
}

export function addUnresolved(receipt: ReleaseCompletionReceipt, surface: SurfaceName, code: string, detail: string): void {
  setSurface(receipt, surface, "UNRESOLVED", code, detail)
}

export function setStagedRemoteSurfaces(receipt: ReleaseCompletionReceipt): void {
  for (const surface of ["workflow", "jobs", "githubRelease", "npm", "githubPackages", "pinnedLspRelease"] as const) {
    receipt.surfaces[surface] = stagedSkippedSurface()
  }
}

export function makeReceipt(identity: { target?: ReleaseTarget; repository?: string }, checkedAt: Date): ReleaseCompletionReceipt {
  if (!(checkedAt instanceof Date) || !Number.isFinite(checkedAt.getTime())) {
    throw new Error("checkedAt must be a valid Date")
  }
  const target = identity.target
  return {
    schemaVersion: 1,
    outcome: "UNRESOLVED",
    checkedAt: checkedAt.toISOString(),
    repository: identity.repository ?? null,
    lane: target?.lane ?? null,
    tag: target?.tag ?? null,
    version: target?.version ?? null,
    headSha: null,
    runId: null,
    runAttempt: null,
    runUrl: null,
    prerelease: null,
    surfaces: {
      identity: unresolvedSurface(),
      workflow: unresolvedSurface(),
      jobs: unresolvedSurface(),
      githubRelease: unresolvedSurface(),
      releaseAssets: unresolvedSurface(),
      checksums: unresolvedSurface(),
      npm: unresolvedSurface(),
      githubPackages: unresolvedSurface(),
      pinnedLspRelease: unresolvedSurface(),
    },
    jobs: [],
    assets: [],
    packages: [],
    errors: [],
  }
}

function deduplicateSorted<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
  equal: (left: T, right: T) => boolean,
): T[] {
  const sorted = [...values].sort(compare)
  const deduplicated: T[] = []
  for (const value of sorted) {
    const previous = deduplicated[deduplicated.length - 1]
    if (previous === undefined || !equal(previous, value)) deduplicated.push(value)
  }
  return deduplicated
}

export function finalizeReceipt(receipt: ReleaseCompletionReceipt): ReleaseCompletionReceipt {
  receipt.jobs = deduplicateSorted(
    receipt.jobs,
    (left, right) => compareOrdinal(left.name, right.name) || compareOrdinal(left.conclusion, right.conclusion),
    (left, right) => left.name === right.name && left.conclusion === right.conclusion,
  )
  receipt.assets = deduplicateSorted(
    receipt.assets,
    (left, right) => compareOrdinal(left.name, right.name) || left.size - right.size || (left.downloadedSize ?? -1) - (right.downloadedSize ?? -1) || compareOrdinal(left.sha256 ?? "", right.sha256 ?? ""),
    (left, right) => left.name === right.name && left.size === right.size && left.downloadedSize === right.downloadedSize && left.sha256 === right.sha256,
  )
  receipt.packages = deduplicateSorted(
    receipt.packages,
    (left, right) => {
      const registryOrder = (left.registry === "npmjs" ? 0 : 1) - (right.registry === "npmjs" ? 0 : 1)
      return registryOrder || compareOrdinal(left.name, right.name) || compareOrdinal(left.version, right.version) || compareOrdinal(left.status, right.status)
    },
    (left, right) => left.registry === right.registry && left.name === right.name && left.version === right.version && left.status === right.status,
  )
  receipt.errors = deduplicateSorted(
    receipt.errors,
    (left, right) => {
      const surfaceOrder = SURFACE_KEYS.indexOf(left.surface) - SURFACE_KEYS.indexOf(right.surface)
      return surfaceOrder || compareOrdinal(left.code, right.code) || compareOrdinal(left.message, right.message) || Number(left.retryable) - Number(right.retryable)
    },
    (left, right) => left.surface === right.surface && left.code === right.code && left.message === right.message && left.retryable === right.retryable,
  )

  const statuses = Object.values(receipt.surfaces).map((surface) => surface.status)
  if (statuses.includes("FAILED")) receipt.outcome = "FAILED"
  else if (statuses.includes("UNRESOLVED")) receipt.outcome = "UNRESOLVED"
  else if (receipt.repository === null || receipt.lane === null || receipt.tag === null || receipt.version === null) receipt.outcome = "FAILED"
  else receipt.outcome = "COMPLETED"
  return receipt
}

export function markRetryable(
  receipt: ReleaseCompletionReceipt,
  retryableSurfaces: Set<SurfaceName>,
  surface: SurfaceName,
  code: string,
  detail: string,
): void {
  if (receipt.surfaces[surface].status !== "FAILED" && receipt.surfaces[surface].status !== "PASS") {
    addUnresolved(receipt, surface, code, detail)
    retryableSurfaces.add(surface)
  }
}

export function allSurfacesProven(receipt: ReleaseCompletionReceipt): boolean {
  return SURFACE_KEYS.every((surface) => {
    const status = receipt.surfaces[surface].status
    return status === "PASS" || status === "SKIPPED"
  })
}

export function hasDefiniteFailure(receipt: ReleaseCompletionReceipt): boolean {
  return SURFACE_KEYS.some((surface) => receipt.surfaces[surface].status === "FAILED")
}

export function setLaneSkippedSurfaces(receipt: ReleaseCompletionReceipt, target: ReleaseTarget): void {
  if (target.lane === "ocmm-lsp") {
    setSurface(receipt, "githubPackages", "SKIPPED", "github_packages_not_applicable", "GitHub Packages proof is not applicable to the LSP lane")
    setSurface(receipt, "pinnedLspRelease", "SKIPPED", "pinned_lsp_release_not_applicable", "pinned LSP Release proof is not applicable to the LSP lane")
  }
}

export function setDispatchGithubPackagesSkipped(receipt: ReleaseCompletionReceipt): void {
  setSurface(
    receipt,
    "githubPackages",
    "SKIPPED",
    "github_packages_dispatch_not_provable",
    "GitHub Packages publication cannot be proven from a workflow_dispatch run",
  )
}
