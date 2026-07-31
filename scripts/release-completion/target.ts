import { lspVersion, pinnedOcmmLspVersion, readRootPackage } from "../lsp-package-manifest.ts"
import { ocmmLspPlatformPackages } from "../../src/shared/ocmm-lsp-binary.ts"

import type { ReleaseTarget } from "./contracts.ts"
import { sortNames } from "./receipt.ts"

const STRICT_VERSION = "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)"
const MAIN_TAG = new RegExp(`^v(${STRICT_VERSION})$`)
const LSP_TAG = new RegExp(`^ocmm-lsp-v(${STRICT_VERSION})$`)
const STRICT_VERSION_VALUE = new RegExp(`^${STRICT_VERSION}$`)

export const CHECKSUM_NAME = "SHA256SUMS.txt"

function rootPackageVersion(root: string): string {
  const version = readRootPackage(root).version
  if (typeof version !== "string") throw new Error("Missing string version in root package.json")
  return version
}

function strictPinnedLspVersion(root: string): string {
  const version = pinnedOcmmLspVersion(root)
  if (!STRICT_VERSION_VALUE.test(version)) throw new Error("Invalid ocmm.lspVersion: expected strict version")
  return version
}

export function parseReleaseTarget(tag: string, root: string): ReleaseTarget {
  if (MAIN_TAG.test(tag)) {
    const version = tag.slice("v".length)
    const rootVersion = rootPackageVersion(root)
    if (version !== rootVersion) throw new Error(`Release tag ${tag} does not match root package version ${rootVersion}`)
    return { lane: "ocmm", tag, version, pinnedLspVersion: strictPinnedLspVersion(root) }
  }

  if (LSP_TAG.test(tag)) {
    const version = tag.slice("ocmm-lsp-v".length)
    const cargoVersion = lspVersion(root)
    if (version !== cargoVersion) throw new Error(`Release tag ${tag} does not match ocmm-lsp Cargo version ${cargoVersion}`)
    return { lane: "ocmm-lsp", tag, version, pinnedLspVersion: null }
  }

  throw new Error(`Invalid strict release tag: ${tag}`)
}

export function expectedReleaseAssets(target: ReleaseTarget): readonly string[] {
  if (target.lane === "ocmm") {
    return sortNames([
      CHECKSUM_NAME,
      `deepwork-codex-plugin-${target.version}.tgz`,
      `ocmm-opencode-plugin-${target.version}.tgz`,
    ])
  }

  return sortNames([
    ...ocmmLspPlatformPackages().map((platform) => platform.binaryName),
    ...ocmmLspPlatformPackages().map((platform) => `${platform.packageName}-${target.version}.tgz`),
    CHECKSUM_NAME,
  ])
}
