#!/usr/bin/env node

import { accessSync, constants, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

import {
  ocmmLspBinaryNames,
  ocmmLspPackageBinaryCandidates,
  ocmmLspPackageName,
  unsupportedOcmmLspPlatformMessage,
} from "../shared/ocmm-lsp-binary.ts"

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
}

function binaryPaths(): string[] {
  const root = packageRoot()
  return [
    ...ocmmLspPackageBinaryCandidates(root),
    ...ocmmLspBinaryNames().map((name) => join(root, "dist", "bin", name)),
  ]
}

function canExecute(path: string): boolean {
  if (!existsSync(path)) return false
  if (process.platform === "win32") return true
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

const candidates = binaryPaths()
const bin = candidates.find(canExecute)
if (!bin) {
  const unsupported = unsupportedOcmmLspPlatformMessage()
  const expectedPackage = ocmmLspPackageName() ?? "<unsupported platform>"
  console.error([
    "ocmm-lsp binary not found.",
    `Expected optional npm package: ${expectedPackage}`,
    "Reinstall ocmm without --omit=optional so npm can install the platform package.",
    "For a source checkout, run pnpm run build:lsp.",
    ...(unsupported ? [unsupported] : []),
    "Checked candidate paths:",
    ...candidates.map((candidate) => `  ${candidate}`),
  ].join("\n"))
  process.exit(1)
}

const child = spawn(bin, process.argv.slice(2), {
  stdio: "inherit",
  windowsHide: true,
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
