import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import { ocmmLspPlatformPackages, type OcmmLspPlatformPackage } from "../src/shared/ocmm-lsp-binary.ts"

export interface SyncLspPackageOptions {
  root?: string
  lspVersion?: string
  updatePinnedVersion?: boolean
}

export interface OcmmPackageMetadata {
  lspVersion?: string
  [key: string]: unknown
}

export interface PlatformPackageJson {
  name: string
  version: string
  description: string
  license: "LicenseRef-AAAPL"
  os: readonly NodeJS.Platform[]
  cpu: readonly NodeJS.Architecture[]
  libc?: readonly string[]
  files: readonly string[]
}

export function projectRoot(root = resolve(import.meta.dirname, "..")): string {
  return resolve(root)
}

export function readCargoPackageVersion(cargoTomlPath: string): string {
  const text = readFileSync(cargoTomlPath, "utf8")
  const packageSection = text.match(/^\[package\]\r?\n([\s\S]*?)(?:\r?\n\[|$)/)
  const version = packageSection?.[1]?.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1]
  if (!version) throw new Error(`Unable to read package version from ${cargoTomlPath}`)
  return version
}

export function lspVersion(root = projectRoot()): string {
  return readCargoPackageVersion(join(root, "crates", "ocmm-lsp", "Cargo.toml"))
}

export function readRootPackage(root = projectRoot()): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>
}

export function pinnedOcmmLspVersion(root = projectRoot()): string {
  const rootPackage = readRootPackage(root)
  const ocmm = rootPackage.ocmm
  if (!ocmm || typeof ocmm !== "object" || Array.isArray(ocmm)) {
    throw new Error(`Missing ocmm.lspVersion in ${join(root, "package.json")}`)
  }

  const metadata = ocmm as OcmmPackageMetadata
  if (typeof metadata.lspVersion !== "string") {
    throw new Error(`Missing ocmm.lspVersion in ${join(root, "package.json")}`)
  }

  return metadata.lspVersion
}

export function platformPackageJson(version: string, platformPackage: OcmmLspPlatformPackage): PlatformPackageJson {
  return {
    name: platformPackage.packageName,
    version,
    description: `Native ocmm-lsp binary package for ${platformPackage.target}.`,
    license: "LicenseRef-AAAPL",
    os: [...platformPackage.os],
    cpu: [...platformPackage.cpu],
    ...(platformPackage.libc ? { libc: [...platformPackage.libc] } : {}),
    files: ["bin"],
  }
}

export function exactLspOptionalDependencies(version: string): Record<string, string> {
  const optionalDependencies: Record<string, string> = {}
  for (const platformPackage of ocmmLspPlatformPackages()) {
    optionalDependencies[platformPackage.packageName] = version
  }
  return optionalDependencies
}

export function stagePlatformBinary(root: string, packageName: string, sourceBinary: string): string {
  const platformPackage = ocmmLspPlatformPackages().find((candidate) => candidate.packageName === packageName)
  if (!platformPackage) throw new Error(`Unknown ocmm-lsp platform package: ${packageName}`)
  if (!existsSync(sourceBinary)) throw new Error(`Missing source binary for ${packageName}: ${sourceBinary}`)

  const binDir = join(projectRoot(root), "packages", packageName, "bin")
  rmSync(binDir, { recursive: true, force: true })
  mkdirSync(binDir, { recursive: true })

  const target = join(binDir, platformPackage.binaryName)
  copyFileSync(sourceBinary, target)
  if (!platformPackage.binaryName.endsWith(".exe")) chmodSync(target, 0o755)
  return target
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function readOcmmPackageMetadata(rootPackage: Record<string, unknown>): OcmmPackageMetadata {
  const ocmm = rootPackage.ocmm
  return ocmm && typeof ocmm === "object" && !Array.isArray(ocmm) ? ocmm as OcmmPackageMetadata : {}
}

export function syncLspPackageManifests(options: SyncLspPackageOptions = {}): void {
  const root = projectRoot(options.root)
  const version = options.lspVersion ?? lspVersion(root)
  const platformPackages = ocmmLspPlatformPackages()

  for (const platformPackage of platformPackages) {
    writeJson(
      join(root, "packages", platformPackage.packageName, "package.json"),
      platformPackageJson(version, platformPackage),
    )
  }

  const rootPackage = readRootPackage(root)
  const optionalDependencies: Record<string, string> = {}
  for (const platformPackage of platformPackages) optionalDependencies[platformPackage.packageName] = "workspace:*"
  rootPackage.optionalDependencies = optionalDependencies

  const ocmm = readOcmmPackageMetadata(rootPackage)
  rootPackage.ocmm = {
    ...ocmm,
    lspVersion: options.updatePinnedVersion === true || typeof ocmm.lspVersion !== "string"
      ? version
      : ocmm.lspVersion,
  }

  writeJson(join(root, "package.json"), rootPackage)
}
