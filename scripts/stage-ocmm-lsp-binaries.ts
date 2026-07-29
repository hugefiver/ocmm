import { chmodSync, copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"

export type ReplaceTarget = (source: string, target: string) => void

export type StageOcmmLspBinariesOptions = {
  source: string
  outDir: string
  names: readonly string[]
  platform?: NodeJS.Platform
  replaceTarget?: ReplaceTarget
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
    // Missing or unreadable targets require replacement; replacement and mode errors propagate.
    try {
      targetBytes = readFileSync(target)
    } catch {
      targetBytes = undefined
    }
    if (targetBytes?.equals(sourceBytes)) continue

    replaceTarget(options.source, target)
    if (platform !== "win32") chmodSync(target, 0o755)
  }
}
