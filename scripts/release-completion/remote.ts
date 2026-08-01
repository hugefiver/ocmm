import type {
  CheckReleaseCompletionOptions,
  ReleaseCompletionReceipt,
  ReleaseTarget,
  RunEvent,
  SurfaceName,
} from "./contracts.ts"
import {
  decodeDiscovery,
  decodeBoundRun,
  decodeJobs,
  ensureBoundTagUnchanged,
  githubHeaders,
  isRunEvent,
  peelTag,
  recordWorkflowStatus,
} from "./github-identity.ts"
import { observeReleaseProof, type ReleaseAssetState } from "./github-release.ts"
import { GITHUB_API_ORIGIN, isPositiveSafeInteger, isValidDate, requestJson, validRepository } from "./http.ts"
import {
  addFailure,
  addUnresolved,
  allSurfacesProven,
  finalizeReceipt,
  hasDefiniteFailure,
  makeReceipt,
  markRetryable,
  setLaneSkippedSurfaces,
  setSurface,
} from "./receipt.ts"
import { observePinnedLspRelease } from "./registries.ts"
import { parseReleaseTarget } from "./target.ts"

async function sleepUntilNextPoll(options: CheckReleaseCompletionOptions, deadlineAt: number): Promise<boolean> {
  const now = options.clock.now()
  if (!isValidDate(now)) return false
  const remaining = deadlineAt - now.getTime()
  if (remaining <= 0) return false
  await options.clock.sleep(Math.min(options.pollIntervalMs, remaining))
  return true
}

export async function checkReleaseCompletion(options: CheckReleaseCompletionOptions): Promise<ReleaseCompletionReceipt> {
  let target: ReleaseTarget
  try {
    target = parseReleaseTarget(options.tag, options.root)
  } catch {
    const receipt = makeReceipt({ repository: validRepository(options.repository) ? options.repository : undefined }, options.checkedAt)
    addFailure(receipt, "identity", "release_target_invalid", "remote release tag or local version source is invalid")
    return finalizeReceipt(receipt)
  }

  const receipt = makeReceipt({ target, repository: options.repository }, options.checkedAt)
  if (!validRepository(options.repository)) {
    addFailure(receipt, "identity", "repository_invalid", "repository must be an owner/name pair")
    return finalizeReceipt(receipt)
  }
  if (!isValidDate(options.checkedAt) || !isPositiveSafeInteger(options.deadlineMs) || !isPositiveSafeInteger(options.pollIntervalMs)) {
    addFailure(receipt, "identity", "remote_options_invalid", "remote deadline and polling options must be positive safe integers")
    return finalizeReceipt(receipt)
  }
  const deadlineAt = options.checkedAt.getTime() + options.deadlineMs
  if (!Number.isSafeInteger(deadlineAt)) {
    addFailure(receipt, "identity", "remote_options_invalid", "remote deadline is outside the supported range")
    return finalizeReceipt(receipt)
  }
  if (options.runId !== undefined && !isPositiveSafeInteger(options.runId)) {
    addFailure(receipt, "identity", "remote_options_invalid", "run ID must be a positive safe integer")
    return finalizeReceipt(receipt)
  }

  setLaneSkippedSurfaces(receipt, target)
  const apiRoot = `${GITHUB_API_ORIGIN}/repos/${options.repository}`
  const githubRequestHeaders = githubHeaders(options.githubToken)
  const retryableSurfaces = new Set<SurfaceName>()
  const releaseAssets: ReleaseAssetState = { current: null }
  let fixedRunId: number | null = options.runId ?? null
  let fixedAttempt: number | null = null
  let fixedEvent: RunEvent | null = null
  let boundIdentity = false

  const retryOrFinalize = async (surface: SurfaceName, code: string, detail: string): Promise<"retry" | "final"> => {
    if (receipt.headSha !== null) {
      const unchanged = await ensureBoundTagUnchanged(receipt, apiRoot, options, githubRequestHeaders)
      if (unchanged === "failed") return "final"
    }
    if (await sleepUntilNextPoll(options, deadlineAt)) return "retry"
    addUnresolved(receipt, surface, code, detail)
    return "final"
  }

  for (;;) {
    let identityBoundThisCycle = false
    if (receipt.headSha === null) {
      const peeled = await peelTag(apiRoot, target.tag, options.http, githubRequestHeaders, options.clock)
      if (peeled.kind === "retry") {
        if (await sleepUntilNextPoll(options, deadlineAt)) continue
        addUnresolved(receipt, "identity", "tag_unresolved", "release tag could not be proven before the deadline")
        return finalizeReceipt(receipt)
      }
      if (peeled.kind === "failed") {
        addFailure(receipt, "identity", peeled.code, "release tag cannot be peeled to a commit")
        return finalizeReceipt(receipt)
      }
      receipt.headSha = peeled.headSha
    }

    if (fixedRunId === null) {
      const discovery = await requestJson(options.http, {
        url: `${apiRoot}/actions/workflows/release.yml/runs?event=push&branch=${encodeURIComponent(target.tag)}&per_page=100`,
        headers: githubRequestHeaders,
      }, "github-api", options.clock)
      if (discovery.kind === "retry") {
        const next = await retryOrFinalize("identity", "run_discovery_unresolved", "workflow run could not be discovered before the deadline")
        if (next === "retry") continue
        return finalizeReceipt(receipt)
      }
      if (discovery.kind === "failed") {
        addFailure(receipt, "identity", "run_discovery_invalid", "workflow run discovery response is invalid")
        return finalizeReceipt(receipt)
      }
      const decoded = decodeDiscovery(discovery.value, target.tag, receipt.headSha)
      if (decoded.kind === "incomplete") {
        addUnresolved(receipt, "identity", "run_discovery_page_incomplete", "workflow run discovery page cannot prove uniqueness")
        return finalizeReceipt(receipt)
      }
      if (decoded.kind === "invalid") {
        addFailure(receipt, "identity", "run_discovery_invalid", "workflow run discovery response is invalid")
        return finalizeReceipt(receipt)
      }
      if (decoded.kind === "ambiguous") {
        addFailure(receipt, "identity", "run_discovery_ambiguous", "multiple workflow runs match the release tag")
        return finalizeReceipt(receipt)
      }
      if (decoded.run === null) {
        const next = await retryOrFinalize("identity", "run_discovery_not_found", "no matching workflow run was found before the deadline")
        if (next === "retry") continue
        return finalizeReceipt(receipt)
      }
      fixedRunId = decoded.run.id
      fixedAttempt = decoded.run.attempt
      fixedEvent = "push"
      receipt.runId = fixedRunId
      receipt.runAttempt = fixedAttempt
      receipt.runUrl = `https://github.com/${options.repository}/actions/runs/${fixedRunId}`
    }

    if (!boundIdentity) {
      receipt.runId = fixedRunId
      receipt.runUrl = `https://github.com/${options.repository}/actions/runs/${fixedRunId}`
      const fixed = await requestJson(options.http, {
        url: `${apiRoot}/actions/runs/${fixedRunId}`,
        headers: githubRequestHeaders,
      }, "github-api", options.clock)
      if (fixed.kind === "retry") {
        const next = await retryOrFinalize("workflow", "workflow_unresolved", "workflow run could not be proven before the deadline")
        if (next === "retry") continue
        return finalizeReceipt(receipt)
      }
      if (fixed.kind === "failed") {
        addFailure(receipt, "identity", "fixed_run_invalid", "fixed workflow run response is invalid")
        return finalizeReceipt(receipt)
      }
      const decoded = decodeBoundRun(fixed.value, target.tag, receipt.headSha, fixedRunId, fixedEvent, fixedAttempt)
      if (decoded.kind === "failed") {
        addFailure(receipt, "identity", decoded.code, decoded.detail)
        return finalizeReceipt(receipt)
      }
      const run = decoded.run
      if (fixedEvent === null && isRunEvent(run.event)) fixedEvent = run.event
      if (fixedAttempt === null) {
        fixedAttempt = run.attempt
        receipt.runAttempt = fixedAttempt
      }
      boundIdentity = true
      identityBoundThisCycle = true
      setSurface(receipt, "identity", "PASS", "release_identity_bound", "release tag, workflow run, and attempt are immutable")
      recordWorkflowStatus(receipt, run, retryableSurfaces)
    }

    const observePostWorkflow = async (): Promise<void> => {
      await observeReleaseProof(receipt, target, apiRoot, options, githubRequestHeaders, retryableSurfaces, releaseAssets)
      await observePinnedLspRelease(receipt, target, apiRoot, options, githubRequestHeaders, retryableSurfaces)
    }

    if (boundIdentity && !identityBoundThisCycle && receipt.surfaces.workflow.status === "UNRESOLVED") {
      const fixed = await requestJson(options.http, {
        url: `${apiRoot}/actions/runs/${fixedRunId}`,
        headers: githubRequestHeaders,
      }, "github-api", options.clock)
      if (fixed.kind === "retry") {
        markRetryable(receipt, retryableSurfaces, "workflow", "workflow_unresolved", "workflow run could not be proven before the deadline")
      } else if (fixed.kind === "failed") {
        addFailure(receipt, "identity", "fixed_run_invalid", "fixed workflow run response is invalid")
      } else {
        if (fixedRunId === null) {
          addFailure(receipt, "identity", "run_identity_mismatch", "fixed workflow run does not match the bound release identity")
        } else if (fixedAttempt === null) {
          addFailure(receipt, "identity", "run_attempt_changed", "fixed workflow run attempt changed after binding")
        } else {
          const decoded = decodeBoundRun(fixed.value, target.tag, receipt.headSha, fixedRunId, fixedEvent, fixedAttempt)
          if (decoded.kind === "failed") addFailure(receipt, "identity", decoded.code, decoded.detail)
          else recordWorkflowStatus(receipt, decoded.run, retryableSurfaces)
        }
      }
    }

    if (receipt.surfaces.workflow.status === "UNRESOLVED") {
      const next = await retryOrFinalize("workflow", "workflow_nonterminal", "workflow run did not reach a terminal state before the deadline")
      if (next === "retry") continue
      return finalizeReceipt(receipt)
    }

    if (receipt.surfaces.workflow.status === "FAILED") {
      await observePostWorkflow()
      return finalizeReceipt(receipt)
    }

    if (receipt.surfaces.jobs.status === "UNRESOLVED") {
      const jobs = await requestJson(options.http, {
        url: `${apiRoot}/actions/runs/${fixedRunId}/attempts/${fixedAttempt}/jobs?per_page=100`,
        headers: githubRequestHeaders,
      }, "github-api", options.clock)
      if (jobs.kind === "retry") {
        markRetryable(receipt, retryableSurfaces, "jobs", "jobs_unresolved", "workflow jobs could not be proven before the deadline")
      } else if (jobs.kind === "failed") {
        addFailure(receipt, "jobs", "jobs_response_invalid", "workflow jobs response is invalid")
      } else {
        const decodedJobs = decodeJobs(jobs.value, target)
        if (decodedJobs.kind === "failed") addFailure(receipt, "jobs", decodedJobs.code, "workflow jobs do not match the release lane contract")
        else {
          receipt.jobs = decodedJobs.jobs
          setSurface(receipt, "jobs", "PASS", "jobs_validated", "workflow jobs match the release lane contract")
          retryableSurfaces.delete("jobs")
        }
      }
    }

    if (receipt.surfaces.jobs.status === "UNRESOLVED") {
      const next = await retryOrFinalize("jobs", "jobs_unresolved", "workflow jobs could not be proven before the deadline")
      if (next === "retry") continue
      return finalizeReceipt(receipt)
    }

    await observePostWorkflow()
    if (hasDefiniteFailure(receipt)) return finalizeReceipt(receipt)
    if (allSurfacesProven(receipt)) {
      const finalTag = await ensureBoundTagUnchanged(receipt, apiRoot, options, githubRequestHeaders)
      if (finalTag === "same" || finalTag === "failed") return finalizeReceipt(receipt)
      if (await sleepUntilNextPoll(options, deadlineAt)) continue
      addUnresolved(receipt, "identity", "tag_unresolved", "release tag could not be re-proven before the deadline")
      return finalizeReceipt(receipt)
    }

    if (retryableSurfaces.size === 0) return finalizeReceipt(receipt)
    const unchanged = await ensureBoundTagUnchanged(receipt, apiRoot, options, githubRequestHeaders)
    if (unchanged === "failed") return finalizeReceipt(receipt)
    if (await sleepUntilNextPoll(options, deadlineAt)) continue
    return finalizeReceipt(receipt)
  }
}
