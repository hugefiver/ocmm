import { pathToFileURL } from "node:url"

import { lspVersion, projectRoot, readRootPackage } from "./lsp-package-manifest.ts"

function rootPackageVersion(root: string): string {
  const version = readRootPackage(root).version
  if (typeof version !== "string") throw new Error("Missing string version in root package.json")
  return version
}

function parsePositionalArg(argv: string[], index = 2): string | undefined {
  for (let i = index; i < argv.length; i++) {
    if (argv[i] !== "--") return argv[i]
  }
  return undefined
}

export function checkReleaseVersion(tag = process.env.RELEASE_TAG ?? parsePositionalArg(process.argv), root = projectRoot()): "ocmm" | "ocmm-lsp" {
  if (!tag) throw new Error("Missing release tag. Set RELEASE_TAG or pass the tag as the first argument.")

  if (tag.startsWith("ocmm-lsp-v")) {
    const expected = `ocmm-lsp-v${lspVersion(root)}`
    if (tag !== expected) throw new Error(`Release tag ${tag} does not match ocmm-lsp Cargo version tag ${expected}`)
    console.log("release-kind=ocmm-lsp")
    return "ocmm-lsp"
  }

  if (tag.startsWith("v")) {
    const expected = `v${rootPackageVersion(root)}`
    if (tag !== expected) throw new Error(`Release tag ${tag} does not match root package version tag ${expected}`)
    console.log("release-kind=ocmm")
    return "ocmm"
  }

  throw new Error(`Unsupported release tag ${tag}. Expected v<version> for ocmm or ocmm-lsp-v<version> for ocmm-lsp.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkReleaseVersion()
}
