import { ocmmLspPlatformPackages } from "../../src/shared/ocmm-lsp-binary.ts"

import type {
  CheckReleaseCompletionOptions,
  Clock,
  HttpClient,
  HttpResponse,
  ReleaseCompletionReceipt,
  ReleaseTarget,
  RunEvent,
  SurfaceName,
  SurfaceStatus,
} from "./contracts.ts"
import {
  asObject,
  classifyHttp,
  decodeJson,
  GITHUB_PACKAGES_REGISTRY,
  HttpContractError,
  NPMJS_REGISTRY,
  normalizeResponseHeaders,
  registryMetadataUrl,
  requestJson,
  stringField,
} from "./http.ts"
import { addFailure, addUnresolved, markRetryable, setDispatchGithubPackagesSkipped, setSurface } from "./receipt.ts"

type PackageObservation = "pass" | "retry" | "failed" | "permission-unproven"

function packageHeaders(githubToken: string | undefined, githubPackages: boolean): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "ocmm-release-completion",
  }
  if (githubPackages && githubToken !== undefined && githubToken.length > 0) {
    headers.Authorization = `Bearer ${githubToken}`
  }
  return headers
}

function setPackageStatus(
  receipt: ReleaseCompletionReceipt,
  registry: "npmjs" | "github",
  name: string,
  version: string,
  status: SurfaceStatus,
): void {
  receipt.packages = [
    ...receipt.packages.filter((candidate) => candidate.registry !== registry || candidate.name !== name || candidate.version !== version),
    { registry, name, version, status },
  ]
}

function decodeRegistryManifest(value: unknown, packageName: string, version: string): "pass" | "retry" | "failed" {
  const body = asObject(value)
  if (body === null) return "failed"
  const versions = asObject(body.versions)
  if (versions === null) return "failed"
  if (!Object.hasOwn(versions, version)) return "retry"
  const manifest = asObject(versions[version])
  if (manifest === null) return "failed"
  return stringField(manifest, "name") === packageName && stringField(manifest, "version") === version
    ? "pass"
    : "failed"
}

async function observeRegistryPackage(
  http: HttpClient,
  clock: Clock,
  registry: string,
  packageName: string,
  version: string,
  githubToken: string | undefined,
  githubPackages: boolean,
): Promise<PackageObservation> {
  let response: HttpResponse
  try {
    response = await http({
      url: registryMetadataUrl(registry, packageName),
      headers: packageHeaders(githubToken, githubPackages),
    })
  } catch (error: unknown) {
    return error instanceof HttpContractError ? "failed" : "retry"
  }

  let headers: Readonly<Record<string, string>>
  try {
    headers = normalizeResponseHeaders(Object.entries(response.headers))
  } catch {
    return "failed"
  }

  const disposition = classifyHttp(
    { status: response.status, headers },
    { service: githubPackages ? "github-packages" : "npmjs", now: clock.now() },
  )
  if (disposition === "retry") return "retry"
  if (disposition === "github-packages-unresolved") return "permission-unproven"
  if (disposition !== "success") return "failed"

  try {
    return decodeRegistryManifest(decodeJson(response.body), packageName, version)
  } catch {
    return "failed"
  }
}

export async function observeNpmProof(
  receipt: ReleaseCompletionReceipt,
  target: ReleaseTarget,
  options: CheckReleaseCompletionOptions,
  retryableSurfaces: Set<SurfaceName>,
): Promise<void> {
  if (receipt.surfaces.npm.status !== "UNRESOLVED") return
  const packageNames = target.lane === "ocmm"
    ? ["ocmm"]
    : ocmmLspPlatformPackages().map((platform) => platform.packageName)
  let failed = false
  let retrying = false
  for (const name of packageNames) {
    const existing = receipt.packages.find((candidate) => candidate.registry === "npmjs" && candidate.name === name && candidate.version === target.version)
    if (existing?.status === "PASS" || existing?.status === "FAILED") {
      failed ||= existing.status === "FAILED"
      continue
    }
    const result = await observeRegistryPackage(options.http, options.clock, NPMJS_REGISTRY, name, target.version, undefined, false)
    if (result === "pass") {
      setPackageStatus(receipt, "npmjs", name, target.version, "PASS")
      continue
    }
    if (result === "retry") {
      setPackageStatus(receipt, "npmjs", name, target.version, "UNRESOLVED")
      retrying = true
      continue
    }
    setPackageStatus(receipt, "npmjs", name, target.version, "FAILED")
    failed = true
  }
  if (failed) {
    addFailure(receipt, "npm", "registry_manifest_mismatch", "registry package metadata does not prove the exact package version")
  } else if (retrying) {
    markRetryable(receipt, retryableSurfaces, "npm", "registry_propagating", "registry package version is not yet proven")
  } else {
    setSurface(receipt, "npm", "PASS", "npm_packages_validated", "all required npm package versions are exact")
    retryableSurfaces.delete("npm")
  }
}

export async function observeGithubPackagesProof(
  receipt: ReleaseCompletionReceipt,
  target: ReleaseTarget,
  event: RunEvent,
  options: CheckReleaseCompletionOptions,
  retryableSurfaces: Set<SurfaceName>,
): Promise<void> {
  if (target.lane !== "ocmm" || receipt.surfaces.githubPackages.status !== "UNRESOLVED") return
  if (event === "workflow_dispatch") {
    setDispatchGithubPackagesSkipped(receipt)
    return
  }
  const owner = options.repository.split("/")[0]?.toLowerCase()
  if (owner === undefined) {
    addFailure(receipt, "githubPackages", "github_packages_repository_invalid", "GitHub Packages package name cannot be constructed")
    return
  }
  const name = `@${owner}/ocmm`
  if (options.githubToken === undefined || options.githubToken.length === 0) {
    setPackageStatus(receipt, "github", name, target.version, "UNRESOLVED")
    addUnresolved(receipt, "githubPackages", "github_packages_permission_unproven", "GitHub Packages read permission is not proven")
    return
  }
  const result = await observeRegistryPackage(
    options.http,
    options.clock,
    GITHUB_PACKAGES_REGISTRY,
    name,
    target.version,
    options.githubToken,
    true,
  )
  if (result === "pass") {
    setPackageStatus(receipt, "github", name, target.version, "PASS")
    setSurface(receipt, "githubPackages", "PASS", "github_packages_validated", "GitHub Packages metadata proves the exact package version")
    retryableSurfaces.delete("githubPackages")
    return
  }
  if (result === "retry") {
    setPackageStatus(receipt, "github", name, target.version, "UNRESOLVED")
    markRetryable(receipt, retryableSurfaces, "githubPackages", "github_packages_propagating", "GitHub Packages version is not yet proven")
    return
  }
  if (result === "permission-unproven") {
    setPackageStatus(receipt, "github", name, target.version, "UNRESOLVED")
    addUnresolved(receipt, "githubPackages", "github_packages_permission_unproven", "GitHub Packages read permission is not proven")
    return
  }
  setPackageStatus(receipt, "github", name, target.version, "FAILED")
  addFailure(receipt, "githubPackages", "github_packages_response_invalid", "GitHub Packages response is invalid")
}

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
