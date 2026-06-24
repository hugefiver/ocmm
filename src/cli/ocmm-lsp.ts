#!/usr/bin/env node

import { accessSync, constants, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

import { ocmmLspBinaryNames, unsupportedOcmmLspPlatformMessage } from "../shared/ocmm-lsp-binary.ts"

function binaryPaths(): string[] {
  const binDir = join(dirname(fileURLToPath(import.meta.url)), "..", "bin")
  return ocmmLspBinaryNames().map((name) => join(binDir, name))
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
  console.error([
    "ocmm-lsp binary not found.",
    "Run pnpm run build:lsp or install a package with bundled GitHub Release binaries.",
    ...(unsupported ? [unsupported] : []),
    "Checked:",
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
