import { existsSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export type OcmmLspLinuxLibc = "gnu" | "musl" | "unknown"

export interface OcmmLspPlatformPackage {
  packageName: string
  platform: NodeJS.Platform
  arch: NodeJS.Architecture
  linuxLibc?: Exclude<OcmmLspLinuxLibc, "unknown">
  target: string
  binaryName: string
  os: readonly NodeJS.Platform[]
  cpu: readonly NodeJS.Architecture[]
  libc?: readonly string[]
}

const OCMM_LSP_PLATFORM_PACKAGES: readonly OcmmLspPlatformPackage[] = [
  {
    packageName: "ocmm-lsp-linux-x64-gnu",
    platform: "linux",
    arch: "x64",
    linuxLibc: "gnu",
    target: "x86_64-unknown-linux-gnu",
    binaryName: "ocmm-lsp-x86_64-unknown-linux-gnu",
    os: ["linux"],
    cpu: ["x64"],
    libc: ["glibc"],
  },
  {
    packageName: "ocmm-lsp-linux-arm64-gnu",
    platform: "linux",
    arch: "arm64",
    linuxLibc: "gnu",
    target: "aarch64-unknown-linux-gnu",
    binaryName: "ocmm-lsp-aarch64-unknown-linux-gnu",
    os: ["linux"],
    cpu: ["arm64"],
    libc: ["glibc"],
  },
  {
    packageName: "ocmm-lsp-linux-x64-musl",
    platform: "linux",
    arch: "x64",
    linuxLibc: "musl",
    target: "x86_64-unknown-linux-musl",
    binaryName: "ocmm-lsp-x86_64-unknown-linux-musl",
    os: ["linux"],
    cpu: ["x64"],
    libc: ["musl"],
  },
  {
    packageName: "ocmm-lsp-linux-arm64-musl",
    platform: "linux",
    arch: "arm64",
    linuxLibc: "musl",
    target: "aarch64-unknown-linux-musl",
    binaryName: "ocmm-lsp-aarch64-unknown-linux-musl",
    os: ["linux"],
    cpu: ["arm64"],
    libc: ["musl"],
  },
  {
    packageName: "ocmm-lsp-darwin-x64",
    platform: "darwin",
    arch: "x64",
    target: "x86_64-apple-darwin",
    binaryName: "ocmm-lsp-x86_64-apple-darwin",
    os: ["darwin"],
    cpu: ["x64"],
  },
  {
    packageName: "ocmm-lsp-darwin-arm64",
    platform: "darwin",
    arch: "arm64",
    target: "aarch64-apple-darwin",
    binaryName: "ocmm-lsp-aarch64-apple-darwin",
    os: ["darwin"],
    cpu: ["arm64"],
  },
  {
    packageName: "ocmm-lsp-windows-x64",
    platform: "win32",
    arch: "x64",
    target: "x86_64-pc-windows-msvc",
    binaryName: "ocmm-lsp-x86_64-pc-windows-msvc.exe",
    os: ["win32"],
    cpu: ["x64"],
  },
  {
    packageName: "ocmm-lsp-windows-arm64",
    platform: "win32",
    arch: "arm64",
    target: "aarch64-pc-windows-msvc",
    binaryName: "ocmm-lsp-aarch64-pc-windows-msvc.exe",
    os: ["win32"],
    cpu: ["arm64"],
  },
] as const

function clonePlatformPackage(platformPackage: OcmmLspPlatformPackage): OcmmLspPlatformPackage {
  return {
    ...platformPackage,
    os: [...platformPackage.os],
    cpu: [...platformPackage.cpu],
    ...(platformPackage.libc ? { libc: [...platformPackage.libc] } : {}),
  }
}

export function ocmmLspPlatformPackages(): OcmmLspPlatformPackage[] {
  return OCMM_LSP_PLATFORM_PACKAGES.map(clonePlatformPackage)
}

export function detectLinuxLibc(platform = process.platform): OcmmLspLinuxLibc {
  if (platform !== "linux") return "unknown"
  const report = typeof process.report?.getReport === "function" ? process.report.getReport() as Record<string, unknown> : undefined
  const header = report?.header
  if (
    header &&
    typeof header === "object" &&
    "glibcVersionRuntime" in header &&
    typeof header.glibcVersionRuntime === "string"
  ) {
    return "gnu"
  }
  return "musl"
}

export function ocmmLspReleaseTarget(
  platform = process.platform,
  arch = process.arch,
  linuxLibc = detectLinuxLibc(platform),
): string | undefined {
  return ocmmLspPlatformPackage(platform, arch, linuxLibc)?.target
}

export function ocmmLspPlatformPackage(
  platform = process.platform,
  arch = process.arch,
  linuxLibc = detectLinuxLibc(platform),
): OcmmLspPlatformPackage | undefined {
  const platformPackage = OCMM_LSP_PLATFORM_PACKAGES.find((candidate) => {
    if (candidate.platform !== platform || candidate.arch !== arch) return false
    return candidate.platform !== "linux" || candidate.linuxLibc === linuxLibc
  })
  return platformPackage ? clonePlatformPackage(platformPackage) : undefined
}

export function ocmmLspPackageName(
  platform = process.platform,
  arch = process.arch,
  linuxLibc = detectLinuxLibc(platform),
): string | undefined {
  return ocmmLspPlatformPackage(platform, arch, linuxLibc)?.packageName
}

export function ocmmLspExecutableExtension(platform = process.platform): string {
  return platform === "win32" ? ".exe" : ""
}

export function ocmmLspBinaryNames(
  platform = process.platform,
  arch = process.arch,
  linuxLibc = detectLinuxLibc(platform),
): string[] {
  const ext = ocmmLspExecutableExtension(platform)
  const target = ocmmLspReleaseTarget(platform, arch, linuxLibc)
  return target ? [`ocmm-lsp-${target}${ext}`, `ocmm-lsp${ext}`] : [`ocmm-lsp${ext}`]
}

function defaultPackageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  let previous = ""
  while (dir !== previous) {
    if (existsSync(join(dir, "package.json"))) return dir
    previous = dir
    dir = dirname(dir)
  }
  return dirname(fileURLToPath(import.meta.url))
}

export function ocmmLspPackageBinaryCandidates(packageRoot = defaultPackageRoot()): string[] {
  const platformPackage = ocmmLspPlatformPackage()
  if (!platformPackage) return []

  const candidates: string[] = []
  const seen = new Set<string>()
  const addCandidate = (path: string): void => {
    if (seen.has(path)) return
    seen.add(path)
    candidates.push(path)
  }
  const platformPackageBinPath = (nodeModulesDir: string): string => {
    return join(nodeModulesDir, platformPackage.packageName, "bin", platformPackage.binaryName)
  }

  addCandidate(join(packageRoot, "node_modules", platformPackage.packageName, "bin", platformPackage.binaryName))

  let dir = packageRoot
  let previous = ""
  while (dir !== previous) {
    const parent = dirname(dir)
    if (basename(parent) === "node_modules") addCandidate(platformPackageBinPath(parent))
    previous = dir
    dir = parent
  }

  dir = dirname(packageRoot)
  previous = ""
  while (dir !== previous) {
    if (basename(dir) !== "node_modules") addCandidate(platformPackageBinPath(join(dir, "node_modules")))
    previous = dir
    dir = dirname(dir)
  }

  return candidates
}

export function unsupportedOcmmLspPlatformMessage(
  platform = process.platform,
  arch = process.arch,
  linuxLibc = detectLinuxLibc(platform),
): string | undefined {
  if (ocmmLspReleaseTarget(platform, arch, linuxLibc)) return undefined
  if (platform === "linux") return `No bundled ocmm-lsp binary is published for ${platform}-${arch}-${linuxLibc}; build from source with pnpm run build:lsp.`
  return `No bundled ocmm-lsp binary is published for ${platform}-${arch}; build from source with pnpm run build:lsp.`
}
