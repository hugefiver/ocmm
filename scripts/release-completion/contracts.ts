export type ReleaseLane = "ocmm" | "ocmm-lsp"

export interface ReleaseTarget {
  lane: ReleaseLane
  tag: string
  version: string
  pinnedLspVersion: string | null
}

export type CompletionOutcome = "COMPLETED" | "FAILED" | "UNRESOLVED"

export type SurfaceStatus = "PASS" | "FAILED" | "UNRESOLVED" | "SKIPPED"

export interface SurfaceReceipt {
  status: SurfaceStatus
  code: string
  detail: string
}

export interface ReleaseCompletionSurfaces {
  identity: SurfaceReceipt
  workflow: SurfaceReceipt
  jobs: SurfaceReceipt
  githubRelease: SurfaceReceipt
  releaseAssets: SurfaceReceipt
  checksums: SurfaceReceipt
  npm: SurfaceReceipt
  githubPackages: SurfaceReceipt
  pinnedLspRelease: SurfaceReceipt
}

export interface ReleaseCompletionReceipt {
  schemaVersion: 1
  outcome: CompletionOutcome
  checkedAt: string
  repository: string | null
  lane: ReleaseLane | null
  tag: string | null
  version: string | null
  headSha: string | null
  runId: number | null
  runAttempt: number | null
  runUrl: string | null
  prerelease: boolean | null
  surfaces: ReleaseCompletionSurfaces
  jobs: ReadonlyArray<{ name: string; conclusion: string }>
  assets: ReadonlyArray<{ name: string; size: number; downloadedSize: number | null; sha256: string | null }>
  packages: ReadonlyArray<{ registry: "npmjs" | "github"; name: string; version: string; status: SurfaceStatus }>
  errors: ReadonlyArray<{
    surface: keyof ReleaseCompletionReceipt["surfaces"]
    code: string
    message: string
    retryable: boolean
  }>
}

export interface HttpRequest {
  url: string
  headers: Readonly<Record<string, string>>
}

export interface HttpResponse {
  status: number
  headers: Readonly<Record<string, string>>
  body: Uint8Array
}

export type HttpClient = (request: HttpRequest) => Promise<HttpResponse>

export interface Clock {
  now(): Date
  sleep(ms: number): Promise<void>
}

export interface CheckReleaseCompletionOptions {
  root: string
  repository: string
  tag: string
  runId?: number
  deadlineMs: number
  pollIntervalMs: number
  githubToken?: string
  checkedAt: Date
  http: HttpClient
  clock: Clock
}

export type HttpService = "github-api" | "github-packages" | "npmjs" | "release-asset"
export type HttpDisposition = "success" | "retry" | "failed" | "github-packages-unresolved"
export type SurfaceName = keyof ReleaseCompletionReceipt["surfaces"]
export type RunEvent = "push" | "workflow_dispatch"
