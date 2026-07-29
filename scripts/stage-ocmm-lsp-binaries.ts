import { chmodSync, copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"

export type StageOcmmLspBinariesOptions = {
  source: string
  outDir: string
  names: readonly string[]
  platform?: NodeJS.Platform
  replaceTarget?: (source: string, target: string) => void
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

export function stageOcmmLspBinaries(options: StageOcmmLspBinariesOptions): void {
  const expectedNames = new Set(options.names)
  const platform = options.platform ?? process.platform
  const replaceTarget = options.replaceTarget ?? ((source: string, target: string) => {
    rmSync(target, { force: true })
    copyFileSync(source, target)
  })

  mkdirSync(options.outDir, { recursive: true })
  for (const entry of readdirSync(options.outDir)) {
    if (entry.startsWith("ocmm-lsp") && !expectedNames.has(entry)) {
      rmSync(join(options.outDir, entry), { force: true })
    }
  }

  const sourceBytes = readFileSync(options.source)
  for (const name of expectedNames) {
    const target = join(options.outDir, name)
    let targetBytes: Buffer | undefined
    try {
      if (statSync(target).isFile()) targetBytes = readFileSync(target)
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    if (targetBytes?.equals(sourceBytes)) continue

    replaceTarget(options.source, target)
    if (platform !== "win32") chmodSync(target, 0o755)
  }
}
