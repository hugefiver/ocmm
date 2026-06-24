export type OcmmLspLinuxLibc = "gnu" | "musl" | "unknown"

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
  if (platform === "win32" && arch === "x64") return "x86_64-pc-windows-msvc"
  if (platform === "win32" && arch === "arm64") return "aarch64-pc-windows-msvc"
  if (platform === "darwin" && arch === "x64") return "x86_64-apple-darwin"
  if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin"
  if (platform === "linux" && arch === "x64" && linuxLibc === "gnu") return "x86_64-unknown-linux-gnu"
  if (platform === "linux" && arch === "arm64" && linuxLibc === "gnu") return "aarch64-unknown-linux-gnu"
  return undefined
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

export function unsupportedOcmmLspPlatformMessage(
  platform = process.platform,
  arch = process.arch,
  linuxLibc = detectLinuxLibc(platform),
): string | undefined {
  if (ocmmLspReleaseTarget(platform, arch, linuxLibc)) return undefined
  if (platform === "linux" && linuxLibc !== "gnu") {
    return `No bundled ocmm-lsp binary is published for ${platform}-${arch}-${linuxLibc}; build from source with pnpm run build:lsp.`
  }
  return `No bundled ocmm-lsp binary is published for ${platform}-${arch}; build from source with pnpm run build:lsp.`
}
