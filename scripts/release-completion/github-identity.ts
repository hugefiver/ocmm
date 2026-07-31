import type {
  CheckReleaseCompletionOptions,
  Clock,
  HttpClient,
  ReleaseCompletionReceipt,
  ReleaseTarget,
  RunEvent,
  SurfaceName,
} from "./contracts.ts"
import {
  asObject,
  isNonNegativeSafeInteger,
  isPositiveSafeInteger,
  normalizedSha,
  objectField,
  requestJson,
  stringField,
} from "./http.ts"
import { addFailure, markRetryable, setSurface } from "./receipt.ts"

export type PeelResult =
  | { kind: "success"; headSha: string }
  | { kind: "retry" }
  | { kind: "failed"; code: string }

export type DecodedRun = {
  id: number
  attempt: number
  event: string
  path: string
  headBranch: string
  headSha: string
  status: string
  conclusion: unknown
}

export type DecodedJobs =
  | { kind: "success"; jobs: Array<{ name: string; conclusion: string }> }
  | { kind: "failed"; code: "jobs_page_incomplete" | "jobs_contract_invalid" }

export function githubHeaders(githubToken: string | undefined): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ocmm-release-completion",
  }
  if (githubToken !== undefined && githubToken.length > 0) headers.Authorization = `Bearer ${githubToken}`
  return headers
}

function decodeTagObject(value: unknown): { type: string; sha: string } | null {
  const body = asObject(value)
  if (body === null) return null
  const object = objectField(body, "object")
  if (object === null) return null
  const type = stringField(object, "type")
  const sha = normalizedSha(object.sha)
  return type === null || sha === null ? null : { type, sha }
}

export async function peelTag(
  apiRoot: string,
  tag: string,
  http: HttpClient,
  headers: Readonly<Record<string, string>>,
  clock: Clock,
): Promise<PeelResult> {
  let result = await requestJson(http, {
    url: `${apiRoot}/git/ref/tags/${encodeURIComponent(tag)}`,
    headers,
  }, "github-api", clock)
  if (result.kind !== "success") return result.kind === "retry" ? result : { kind: "failed", code: "tag_ref_invalid" }

  let current = decodeTagObject(result.value)
  if (current === null) return { kind: "failed", code: "tag_ref_invalid" }
  const visited = new Set<string>()

  for (;;) {
    if (current.type === "commit") return { kind: "success", headSha: current.sha }
    if (current.type !== "tag" || visited.has(current.sha)) return { kind: "failed", code: "tag_peel_invalid" }
    visited.add(current.sha)
    result = await requestJson(http, {
      url: `${apiRoot}/git/tags/${current.sha}`,
      headers,
    }, "github-api", clock)
    if (result.kind !== "success") return result.kind === "retry" ? result : { kind: "failed", code: "tag_peel_invalid" }
    current = decodeTagObject(result.value)
    if (current === null) return { kind: "failed", code: "tag_peel_invalid" }
  }
}

export function decodeRun(value: unknown): DecodedRun | null {
  const body = asObject(value)
  if (body === null) return null
  const id = body.id
  const attempt = body.run_attempt
  const event = stringField(body, "event")
  const path = stringField(body, "path")
  const headBranch = stringField(body, "head_branch")
  const headSha = normalizedSha(body.head_sha)
  const status = stringField(body, "status")
  if (!isPositiveSafeInteger(id) || !isPositiveSafeInteger(attempt) || event === null || path === null || headBranch === null || headSha === null || status === null) {
    return null
  }
  return { id, attempt, event, path, headBranch, headSha, status, conclusion: body.conclusion }
}

export function isRunEvent(value: string): value is RunEvent {
  return value === "push" || value === "workflow_dispatch"
}

export function hasMatchingRunIdentity(
  run: DecodedRun,
  tag: string,
  headSha: string,
  runId: number,
  expectedEvent: RunEvent | null,
): boolean {
  return run.id === runId
    && run.path === ".github/workflows/release.yml"
    && run.headBranch === tag
    && run.headSha === headSha
    && isRunEvent(run.event)
    && (expectedEvent === null || run.event === expectedEvent)
}

export type BoundRunResult =
  | { kind: "success"; run: DecodedRun }
  | { kind: "failed"; code: "run_identity_mismatch" | "run_attempt_changed"; detail: string }

export function decodeBoundRun(
  value: unknown,
  tag: string,
  headSha: string,
  runId: number,
  expectedEvent: RunEvent | null,
  expectedAttempt: number | null,
): BoundRunResult {
  const run = decodeRun(value)
  if (run === null || !hasMatchingRunIdentity(run, tag, headSha, runId, expectedEvent)) {
    return {
      kind: "failed",
      code: "run_identity_mismatch",
      detail: "fixed workflow run does not match the bound release identity",
    }
  }
  if (expectedAttempt !== null && run.attempt !== expectedAttempt) {
    return {
      kind: "failed",
      code: "run_attempt_changed",
      detail: "fixed workflow run attempt changed after binding",
    }
  }
  return { kind: "success", run }
}

export function recordWorkflowStatus(
  receipt: ReleaseCompletionReceipt,
  run: DecodedRun,
  retryableSurfaces: Set<SurfaceName>,
): void {
  if (run.status !== "completed") {
    markRetryable(receipt, retryableSurfaces, "workflow", "workflow_nonterminal", "workflow run did not reach a terminal state before the deadline")
  } else if (run.conclusion !== "success") {
    addFailure(receipt, "workflow", "workflow_not_success", "workflow run reached a non-success terminal conclusion")
  } else {
    setSurface(receipt, "workflow", "PASS", "workflow_succeeded", "workflow run completed successfully")
    retryableSurfaces.delete("workflow")
  }
}

export function decodeDiscovery(value: unknown, tag: string, headSha: string):
  | { kind: "success"; run: DecodedRun | null }
  | { kind: "ambiguous" }
  | { kind: "incomplete" }
  | { kind: "invalid" } {
  const body = asObject(value)
  if (body === null || !isNonNegativeSafeInteger(body.total_count) || !Array.isArray(body.workflow_runs)) return { kind: "invalid" }
  if (body.total_count !== body.workflow_runs.length || body.total_count > 100) return { kind: "incomplete" }

  const matches: DecodedRun[] = []
  for (const candidate of body.workflow_runs) {
    const run = decodeRun(candidate)
    if (run === null) return { kind: "invalid" }
    if (run.event === "push" && run.headBranch === tag && run.headSha === headSha) matches.push(run)
  }
  if (matches.length > 1) return { kind: "ambiguous" }
  return { kind: "success", run: matches[0] ?? null }
}

export function decodeJobs(value: unknown, target: ReleaseTarget): DecodedJobs {
  const body = asObject(value)
  if (body === null || !isNonNegativeSafeInteger(body.total_count) || !Array.isArray(body.jobs)) {
    return { kind: "failed", code: "jobs_contract_invalid" }
  }
  if (body.total_count !== body.jobs.length || body.total_count > 100) {
    return { kind: "failed", code: "jobs_page_incomplete" }
  }

  const jobs: Array<{ name: string; conclusion: string }> = []
  const names = new Set<string>()
  for (const candidate of body.jobs) {
    const job = asObject(candidate)
    if (job === null) return { kind: "failed", code: "jobs_contract_invalid" }
    const name = stringField(job, "name")
    const conclusion = stringField(job, "conclusion")
    if (name === null || name.length === 0 || conclusion === null || names.has(name)) {
      return { kind: "failed", code: "jobs_contract_invalid" }
    }
    names.add(name)
    jobs.push({ name, conclusion })
  }

  const expected = target.lane === "ocmm"
    ? new Map<string, string>([
      ["Verify (ocmm)", "success"],
      ["Download pinned ocmm-lsp binaries", "success"],
      ["Package and publish ocmm", "success"],
      ["Package and publish ocmm-lsp packages", "skipped"],
      ["GitHub Release", "success"],
    ])
    : new Map<string, string>([
      ["Verify (ocmm-lsp)", "success"],
      ...["linux-x64-gnu", "linux-arm64-gnu", "linux-x64-musl", "linux-arm64-musl", "win32-x64", "win32-arm64", "darwin-x64", "darwin-arm64"].map((platform) => [`Native ocmm-lsp (${platform})`, "success"] as const),
      ["Package and publish ocmm-lsp packages", "success"],
      ["Download pinned ocmm-lsp binaries", "skipped"],
      ["Package and publish ocmm", "skipped"],
      ["GitHub Release", "success"],
    ])

  for (const [name, conclusion] of expected) {
    const actual = jobs.find((job) => job.name === name)
    if (actual === undefined || actual.conclusion !== conclusion) return { kind: "failed", code: "jobs_contract_invalid" }
  }
  for (const job of jobs) {
    if (expected.has(job.name)) continue
    if (target.lane === "ocmm" && job.name.startsWith("Native ocmm-lsp (") && job.conclusion === "skipped") continue
    return { kind: "failed", code: "jobs_contract_invalid" }
  }
  return { kind: "success", jobs }
}

export async function ensureBoundTagUnchanged(
  receipt: ReleaseCompletionReceipt,
  apiRoot: string,
  options: CheckReleaseCompletionOptions,
  headers: Readonly<Record<string, string>>,
): Promise<"same" | "retry" | "failed"> {
  const headSha = receipt.headSha
  if (headSha === null) return "failed"
  const peeled = await peelTag(apiRoot, options.tag, options.http, headers, options.clock)
  if (peeled.kind === "retry") return "retry"
  if (peeled.kind === "failed") {
    addFailure(receipt, "identity", peeled.code, "release tag cannot be re-resolved")
    return "failed"
  }
  if (peeled.headSha !== headSha) {
    addFailure(receipt, "identity", "tag_head_changed", "release tag head changed after binding")
    return "failed"
  }
  return "same"
}
