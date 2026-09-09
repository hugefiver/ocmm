import assert from "node:assert/strict"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, extname, join, relative } from "node:path"
import { test } from "node:test"

import {
  CODEX_MARKETPLACE_FILE,
  CODEX_PLUGIN_DIR,
  CODEX_PROJECT_AGENTS_DIR,
  generateCodexPlugin,
} from "./plugin-generator.ts"

const repositoryRoot = process.cwd()
const excludedPluginPaths = new Set(["dist"])
const generatedTextExtensions = new Set([".json", ".md", ".mjs", ".ps1", ".py", ".sh", ".toml", ".txt", ".yaml", ".yml"])
const generatedTextFilenames = new Set([".gitignore", ".npmignore", "LICENSE", "SOURCE"])

function listFiles(root: string, excludedTopLevel = new Set<string>()): string[] {
  assert.equal(existsSync(root), true, `generated root is missing: ${root}`)

  function visit(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = join(directory, entry.name)
      const relativePath = relative(root, absolute).replaceAll("\\", "/")
      if (excludedTopLevel.has(relativePath.split("/", 1)[0]!)) return []
      return entry.isDirectory() ? visit(absolute) : [relativePath]
    })
  }

  return visit(root).sort()
}

function generatedFiles(root: string): string[] {
  const marketplace = join(root, CODEX_MARKETPLACE_FILE)
  assert.equal(existsSync(marketplace), true, `generated marketplace is missing: ${marketplace}`)
  assert.equal(statSync(marketplace).isFile(), true, `generated marketplace is not a file: ${marketplace}`)

  return [
    CODEX_MARKETPLACE_FILE,
    ...listFiles(join(root, CODEX_PROJECT_AGENTS_DIR))
      .map((file) => `${CODEX_PROJECT_AGENTS_DIR}/${file}`),
    ...listFiles(join(root, CODEX_PLUGIN_DIR), excludedPluginPaths)
      .map((file) => `${CODEX_PLUGIN_DIR}/${file}`),
  ].sort()
}

function compareGeneratedOutputs(freshRoot: string, trackedRoot: string): string[] {
  const freshFiles = generatedFiles(freshRoot)
  const trackedFiles = generatedFiles(trackedRoot)
  const freshSet = new Set(freshFiles)
  const trackedSet = new Set(trackedFiles)
  const problems: string[] = []

  for (const file of freshFiles) {
    if (!trackedSet.has(file)) {
      problems.push(`missing tracked file: ${file}`)
      continue
    }
    if (!readFileSync(join(freshRoot, file)).equals(readFileSync(join(trackedRoot, file)))) {
      problems.push(`stale tracked file: ${file}`)
    }
  }
  for (const file of trackedFiles) {
    if (!freshSet.has(file)) problems.push(`unexpected tracked file: ${file}`)
  }

  return problems
}

function filesContainingCarriageReturns(root: string): string[] {
  return generatedFiles(root).filter((file) => {
    const filename = basename(file)
    const isText = generatedTextFilenames.has(filename) || generatedTextExtensions.has(extname(filename).toLowerCase())
    return isText && readFileSync(join(root, file)).includes(0x0d)
  })
}

function copyComparableGeneratedOutputs(sourceRoot: string, targetRoot: string): void {
  for (const file of generatedFiles(sourceRoot)) {
    const target = join(targetRoot, file)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(sourceRoot, file), target)
  }
}

test("tracked Codex artifacts exactly match a fresh CLI-equivalent generation", async () => {
  const runRoot = mkdtempSync(join(tmpdir(), "ocmm-codex-freshness-"))
  try {
    const result = await generateCodexPlugin({
      projectRoot: repositoryRoot,
      marketplacePath: join(runRoot, CODEX_MARKETPLACE_FILE),
      projectAgentsRoot: join(runRoot, CODEX_PROJECT_AGENTS_DIR),
      pluginRoot: join(runRoot, CODEX_PLUGIN_DIR),
    })

    assert.notEqual(result.configHost, "provided", "freshness generation must use the CLI adapter config loader")
    assert.deepEqual(filesContainingCarriageReturns(runRoot), [], "fresh generation must use LF for text artifacts")
    assert.deepEqual(filesContainingCarriageReturns(repositoryRoot), [], "tracked text artifacts must use LF")
    assert.deepEqual(compareGeneratedOutputs(runRoot, repositoryRoot), [])

    const staleRoot = join(runRoot, "stale-copy")
    copyComparableGeneratedOutputs(repositoryRoot, staleRoot)
    const staleReadme = join(staleRoot, CODEX_PLUGIN_DIR, "README.md")
    writeFileSync(staleReadme, `${readFileSync(staleReadme, "utf8")}stale\n`, "utf8")
    assert.deepEqual(
      compareGeneratedOutputs(runRoot, staleRoot),
      [`stale tracked file: ${CODEX_PLUGIN_DIR}/README.md`],
    )
  } finally {
    rmSync(runRoot, { recursive: true, force: true })
  }
})
