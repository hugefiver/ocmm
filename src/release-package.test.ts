import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { normalizeOcmmPackage } from "../scripts/normalize-ocmm-package.ts"

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

test("normalizeOcmmPackage stages the deepwork Codex bundle and omits npm binaries", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-release-package-"))
  try {
    writeJson(join(root, "package.json"), {
      name: "ocmm",
      version: "9.9.9",
      type: "module",
      optionalDependencies: {},
      ocmm: { lspVersion: "1.2.3" },
      devEngines: { packageManager: { name: "pnpm" } },
    })
    mkdirSync(join(root, ".agents", "plugins"), { recursive: true })
    writeJson(join(root, ".agents", "plugins", "marketplace.json"), { name: "deepwork-local", plugins: [] })
    mkdirSync(join(root, ".codex", "agents"), { recursive: true })
    writeFileSync(join(root, ".codex", "agents", "dw-plan-critic.toml"), "name = \"dw-plan-critic\"\n")
    mkdirSync(join(root, "dist", "bin"), { recursive: true })
    writeFileSync(join(root, "dist", "index.js"), "export {}\n")
    writeFileSync(join(root, "dist", "bin", "ocmm-lsp-test"), "binary\n")
    mkdirSync(join(root, "plugins", "deepwork", ".codex-plugin"), { recursive: true })
    mkdirSync(join(root, "plugins", "deepwork", "dist", "bin"), { recursive: true })
    writeJson(join(root, "plugins", "deepwork", ".codex-plugin", "plugin.json"), {
      name: "deepwork",
      version: "9.9.9",
    })
    writeJson(join(root, "plugins", "deepwork", "package.json"), {
      name: "deepwork-codex-plugin-runtime",
      version: "9.9.9",
      type: "module",
    })
    writeFileSync(join(root, "plugins", "deepwork", "dist", "bin", "ocmm-lsp-test"), "binary\n")

    const result = normalizeOcmmPackage({ root, outputRoot: "out" })

    assert.equal(existsSync(join(result.githubPackageDir, "dist", "bin", "ocmm-lsp-test")), true)
    assert.equal(existsSync(join(result.githubPackageDir, ".codex", "agents", "dw-plan-critic.toml")), true)
    assert.equal(existsSync(join(result.codexPackageDir, "plugins", "deepwork", "dist", "bin", "ocmm-lsp-test")), true)
    assert.equal(existsSync(join(result.codexPackageDir, ".codex", "agents", "dw-plan-critic.toml")), true)
    assert.equal(existsSync(join(result.codexPackageDir, "plugins", "ocmm")), false)
    assert.equal(existsSync(join(result.npmPackageDir, "dist", "bin")), false)
    assert.equal(existsSync(join(result.npmPackageDir, "plugins", "deepwork", "dist", "bin")), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
