import type {
  CheckReleaseCompletionOptions,
  ReleaseCompletionReceipt,
  ReleaseTarget,
  SurfaceName,
} from "./contracts.ts"
import {
  asObject,
  requestJson,
  stringField,
} from "./http.ts"
import { addFailure, markRetryable, setSurface } from "./receipt.ts"

export async function observePinnedLspRelease(
  receipt: ReleaseCompletionReceipt,
  target: ReleaseTarget,
  apiRoot: string,
  options: CheckReleaseCompletionOptions,
  githubRequestHeaders: Readonly<Record<string, string>>,
  retryableSurfaces: Set<SurfaceName>,
): Promise<void> {
  if (target.lane !== "ocmm" || receipt.surfaces.pinnedLspRelease.status !== "UNRESOLVED" || target.pinnedLspVersion === null) return
  const tag = `ocmm-lsp-v${target.pinnedLspVersion}`
  const result = await requestJson(options.http, {
    url: `${apiRoot}/releases/tags/${encodeURIComponent(tag)}`,
    headers: githubRequestHeaders,
  }, "github-api", options.clock)
  if (result.kind === "retry") {
    markRetryable(receipt, retryableSurfaces, "pinnedLspRelease", "pinned_lsp_release_unresolved", "pinned LSP Release could not be proven before the deadline")
    return
  }
  if (result.kind === "failed") {
    addFailure(receipt, "pinnedLspRelease", "pinned_lsp_release_response_invalid", "pinned LSP Release response is invalid")
    return
  }
  const release = asObject(result.value)
  if (release === null || stringField(release, "tag_name") !== tag || typeof release.draft !== "boolean") {
    addFailure(receipt, "pinnedLspRelease", "pinned_lsp_release_response_invalid", "pinned LSP Release response is invalid")
    return
  }
  if (release.draft) {
    addFailure(receipt, "pinnedLspRelease", "pinned_lsp_release_is_draft", "pinned LSP Release must not be a draft")
    return
  }
  setSurface(receipt, "pinnedLspRelease", "PASS", "pinned_lsp_release_validated", "pinned LSP Release tag exists and is non-draft")
  retryableSurfaces.delete("pinnedLspRelease")
}
