import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { ocmmLspPlatformPackages } from "../src/shared/ocmm-lsp-binary.ts"
import { lspVersion, platformPackageJson, projectRoot, stagePlatformBinary, writeJson } from "./lsp-package-manifest.ts"

export interface StageLspPackagesOptions {
  root?: string
  artifactDir?: string
}

export interface StagedLspPackage {
  packageName: string
  targetPath: string
}

export function stageLspPackages(options: StageLspPackagesOptions = {}): StagedLspPackage[] {
  const root = projectRoot(options.root)
  const artifactDir = options.artifactDir ? resolve(root, options.artifactDir) : join(root, "dist", "bin")
  const version = lspVersion(root)
  const staged: StagedLspPackage[] = []

  for (const platformPackage of ocmmLspPlatformPackages()) {
    writeJson(
      join(root, "packages", platformPackage.packageName, "package.json"),
      platformPackageJson(version, platformPackage),
    )

    const targetPath = stagePlatformBinary(
      root,
      platformPackage.packageName,
      join(artifactDir, platformPackage.binaryName),
    )
    console.log(`staged ${platformPackage.packageName}: ${targetPath}`)
    staged.push({ packageName: platformPackage.packageName, targetPath })
  }

  return staged
}

function parsePositionalArg(argv: string[], index = 2): string | undefined {
  for (let i = index; i < argv.length; i++) {
    if (argv[i] !== "--") return argv[i]
  }
  return undefined
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  stageLspPackages({ artifactDir: parsePositionalArg(process.argv) })
}
