import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

import { ocmmLspBinaryNames } from "../src/shared/ocmm-lsp-binary.ts"
import { stageOcmmLspBinaries } from "./stage-ocmm-lsp-binaries.ts"

const root = resolve(import.meta.dirname, "..")
const manifest = join(root, "crates", "ocmm-lsp", "Cargo.toml")
const cargo = process.env.CARGO ?? "cargo"

const result = spawnSync(cargo, ["build", "--release", "--manifest-path", manifest], {
  cwd: root,
  stdio: "inherit",
})

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

const exe = process.platform === "win32" ? "ocmm-lsp.exe" : "ocmm-lsp"
const source = join(root, "target", "release", exe)
const outDir = join(root, "dist", "bin")
stageOcmmLspBinaries({ source, outDir, names: ocmmLspBinaryNames() })
