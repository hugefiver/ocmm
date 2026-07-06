import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import {
  exactLspOptionalDependencies,
  pinnedOcmmLspVersion,
  projectRoot,
  writeJson,
  type OcmmPackageMetadata,
} from "./lsp-package-manifest.ts"

const PACKAGE_ROOT_ENTRIES = [
  ".agents",
  "dist",
  "plugins",
  "prompts",
  "skills",
  "README.md",
  "LICENSE",
  "LICENSE.zh.md",
  "LICENSE.bilingual.md",
  "package.json",
] as const

const CODEX_GITHUB_ENTRIES = [
  ".agents",
  "plugins",
  "dist",
  "README.md",
  "LICENSE",
  "LICENSE.zh.md",
  "LICENSE.bilingual.md",
  "package.json",
] as const

export interface NormalizeOcmmPackageOptions {
  root?: string
  outputRoot?: string
}

export interface NormalizedOcmmPackageResult {
  npmPackageDir: string
  githubPackageDir: string
  codexPackageDir: string
  lspVersion: string
}

function resetDir(path: string): void {
  rmSync(path, { recursive: true, force: true })
  mkdirSync(path, { recursive: true })
}

function hasExcludedPathSegment(path: string, sourceRoot: string): boolean {
  const pathFromRoot = relative(sourceRoot, path)
  if (!pathFromRoot) return false
  return pathFromRoot.split(/[\\/]+/).some((segment) => segment === "node_modules" || segment === "target")
}

function isDescendant(path: string, ancestor: string): boolean {
  const resolvedPath = resolve(path)
  const resolvedAncestor = resolve(ancestor)
  const rel = relative(resolvedAncestor, resolvedPath)
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)
}

function copyEntries(sourceRoot: string, targetRoot: string, entries: readonly string[], excludedRoots: readonly string[] = []): void {
  for (const entry of entries) {
    const source = join(sourceRoot, entry)
    if (!existsSync(source)) continue
    copyNode(source, join(targetRoot, entry), sourceRoot, excludedRoots)
  }
}

function copyNode(source: string, target: string, sourceRoot: string, excludedRoots: readonly string[]): void {
  if (excludedRoots.some((excludedRoot) => isDescendant(source, excludedRoot) || resolve(source) === resolve(excludedRoot))) {
    return
  }

  if (hasExcludedPathSegment(source, sourceRoot)) {
    return
  }

  const stats = statSync(source)
  if (stats.isDirectory()) {
    mkdirSync(target, { recursive: true })
    for (const child of readdirSync(source)) {
      copyNode(join(source, child), join(target, child), sourceRoot, excludedRoots)
    }
  } else if (stats.isFile() || stats.isSymbolicLink()) {
    mkdirSync(resolve(target, ".."), { recursive: true })
    cpSync(source, target, { force: true })
  }
}

function readPackageJson(packageRoot: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as Record<string, unknown>
}

function normalizePackageMetadata(packageRoot: string, lspVersion: string): void {
  const packageJson = readPackageJson(packageRoot)
  const ocmm = packageJson.ocmm
  const metadata: OcmmPackageMetadata = ocmm && typeof ocmm === "object" && !Array.isArray(ocmm)
    ? ocmm as OcmmPackageMetadata
    : {}

  packageJson.optionalDependencies = exactLspOptionalDependencies(lspVersion)
  packageJson.ocmm = { ...metadata, lspVersion }
  delete packageJson.devEngines
  writeJson(join(packageRoot, "package.json"), packageJson)
}

function requireDirectory(path: string, message: string): void {
  if (!existsSync(path)) throw new Error(message)
}

export function normalizeOcmmPackage(options: NormalizeOcmmPackageOptions = {}): NormalizedOcmmPackageResult {
  const root = projectRoot(options.root)
  const outputRoot = options.outputRoot ? resolve(root, options.outputRoot) : join(root, "dist", "package")
  const npmPackageDir = join(outputRoot, "ocmm-npm")
  const githubPackageDir = join(outputRoot, "ocmm-github")
  const codexPackageDir = join(outputRoot, "codex-github")
  const lspVersion = pinnedOcmmLspVersion(root)

  resetDir(npmPackageDir)
  resetDir(githubPackageDir)
  resetDir(codexPackageDir)

  const excludedSourceRoots = [
    join(root, "node_modules"),
    join(root, "target"),
    outputRoot,
  ]

  copyEntries(root, npmPackageDir, PACKAGE_ROOT_ENTRIES, excludedSourceRoots)
  copyEntries(root, githubPackageDir, PACKAGE_ROOT_ENTRIES, excludedSourceRoots)

  normalizePackageMetadata(npmPackageDir, lspVersion)
  normalizePackageMetadata(githubPackageDir, lspVersion)

  rmSync(join(npmPackageDir, "dist", "bin"), { recursive: true, force: true })
  rmSync(join(npmPackageDir, "plugins", "ocmm", "dist", "bin"), { recursive: true, force: true })

  requireDirectory(
    join(githubPackageDir, "dist", "bin"),
    `GitHub package staging requires ${join(githubPackageDir, "dist", "bin")}`,
  )

  copyEntries(githubPackageDir, codexPackageDir, CODEX_GITHUB_ENTRIES)
  normalizePackageMetadata(codexPackageDir, lspVersion)
  requireDirectory(
    join(codexPackageDir, "plugins", "ocmm", "dist", "bin"),
    `Codex package staging requires ${join(codexPackageDir, "plugins", "ocmm", "dist", "bin")}`,
  )

  console.log(`npm-package-dir=${npmPackageDir}`)
  console.log(`github-package-dir=${githubPackageDir}`)
  console.log(`codex-package-dir=${codexPackageDir}`)
  console.log(`lsp-version=${lspVersion}`)

  return { npmPackageDir, githubPackageDir, codexPackageDir, lspVersion }
}

function parsePositionalArg(argv: string[], index = 2): string | undefined {
  for (let i = index; i < argv.length; i++) {
    if (argv[i] !== "--") return argv[i]
  }
  return undefined
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  normalizeOcmmPackage({ outputRoot: parsePositionalArg(process.argv) })
}
