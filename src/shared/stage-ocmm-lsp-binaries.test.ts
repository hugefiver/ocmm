import assert from "node:assert/strict"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { test } from "node:test"

import { stageOcmmLspBinaries, type ReplaceTarget } from "../../scripts/stage-ocmm-lsp-binaries.ts"

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "ocmm-stage-ocmm-lsp-"))
  try {
    run(dir)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
}

test("keeps an identical expected Windows target untouched", () => {
  withTempDir((dir) => {
    const source = join(dir, "source.exe")
    const outDir = join(dir, "bin")
    const target = join(outDir, "ocmm-lsp.exe")
    const sourceBytes = Buffer.from("fresh binary")
    writeFileSync(source, sourceBytes)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(target, sourceBytes)
    utimesSync(target, new Date("2000-01-01T00:00:00.000Z"), new Date("2000-01-01T00:00:00.000Z"))
    const mtimeBefore = statSync(target).mtimeMs
    let replacements = 0

    stageOcmmLspBinaries({
      source,
      outDir,
      names: ["ocmm-lsp.exe"],
      platform: "win32",
      replaceTarget() {
        replacements += 1
        throw new Error("identical target must not be replaced")
      },
    })

    assert.equal(replacements, 0)
    assert.deepEqual(readFileSync(target), sourceBytes)
    assert.equal(statSync(target).mtimeMs, mtimeBefore)
  })
})

test("replaces missing and different expected targets", () => {
  withTempDir((dir) => {
    const source = join(dir, "source.exe")
    const outDir = join(dir, "bin")
    const sourceBytes = Buffer.from("fresh binary")
    const missing = join(outDir, "ocmm-lsp-missing.exe")
    const different = join(outDir, "ocmm-lsp-different.exe")
    writeFileSync(source, sourceBytes)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(different, "stale binary")
    const replacements: string[] = []
    const replaceTarget: ReplaceTarget = (freshSource, target) => {
      replacements.push(basename(target))
      rmSync(target, { force: true })
      copyFileSync(freshSource, target)
    }

    stageOcmmLspBinaries({
      source,
      outDir,
      names: ["ocmm-lsp-missing.exe", "ocmm-lsp-different.exe"],
      platform: "win32",
      replaceTarget,
    })

    assert.deepEqual(replacements, ["ocmm-lsp-missing.exe", "ocmm-lsp-different.exe"])
    assert.deepEqual(readFileSync(missing), sourceBytes)
    assert.deepEqual(readFileSync(different), sourceBytes)
  })
})

test("removes unexpected ocmm-lsp entries without touching unrelated files", () => {
  withTempDir((dir) => {
    const source = join(dir, "source.exe")
    const outDir = join(dir, "bin")
    const stale = join(outDir, "ocmm-lsp-stale.exe")
    const unrelated = join(outDir, "unrelated.txt")
    writeFileSync(source, "fresh binary")
    mkdirSync(outDir, { recursive: true })
    writeFileSync(stale, "stale binary")
    writeFileSync(unrelated, "keep me")

    stageOcmmLspBinaries({
      source,
      outDir,
      names: ["ocmm-lsp.exe"],
      platform: "win32",
    })

    assert.equal(existsSync(stale), false)
    assert.equal(readFileSync(unrelated, "utf8"), "keep me")
  })
})

test("propagates injected replacement errors", () => {
  withTempDir((dir) => {
    const source = join(dir, "source.exe")
    const outDir = join(dir, "bin")
    const target = join(outDir, "ocmm-lsp.exe")
    writeFileSync(source, "fresh binary")
    mkdirSync(outDir, { recursive: true })
    writeFileSync(target, "stale binary")

    assert.throws(() => stageOcmmLspBinaries({
      source,
      outDir,
      names: ["ocmm-lsp.exe"],
      platform: "win32",
      replaceTarget() {
        throw new Error("sentinel replacement error")
      },
    }), { message: "sentinel replacement error" })
  })
})

test("copied non-Windows target is executable", () => {
  withTempDir((dir) => {
    const source = join(dir, "source")
    const outDir = join(dir, "bin")
    const target = join(outDir, "ocmm-lsp")
    writeFileSync(source, "fresh binary")

    stageOcmmLspBinaries({
      source,
      outDir,
      names: ["ocmm-lsp"],
      platform: "linux",
    })

    if (process.platform !== "win32") assert.notEqual(statSync(target).mode & 0o111, 0)
  })
})

test("target read failure enters injected replacement and propagates its sentinel", () => {
  withTempDir((dir) => {
    const source = join(dir, "source.exe")
    const outDir = join(dir, "bin")
    const target = join(outDir, "ocmm-lsp.exe")
    writeFileSync(source, "fresh binary")
    mkdirSync(target, { recursive: true })

    let replacements = 0
    assert.throws(() => stageOcmmLspBinaries({
      source,
      outDir,
      names: ["ocmm-lsp.exe"],
      platform: "win32",
      replaceTarget() {
        replacements += 1
        throw new Error("replacement sentinel")
      },
    }), { message: "replacement sentinel" })
    assert.equal(replacements, 1)

    assert.throws(() => stageOcmmLspBinaries({
      source,
      outDir,
      names: ["ocmm-lsp.exe"],
      platform: "win32",
    }))
  })
})

test("propagates chmod errors when injected replacement leaves a non-Windows target absent", () => {
  withTempDir((dir) => {
    const source = join(dir, "source")
    const outDir = join(dir, "bin")
    writeFileSync(source, "fresh binary")
    mkdirSync(outDir, { recursive: true })
    let replacements = 0

    assert.throws(
      () => stageOcmmLspBinaries({
        source,
        outDir,
        names: ["ocmm-lsp"],
        platform: "linux",
        replaceTarget() {
          replacements += 1
        },
      }),
      (error: unknown) => {
        assert.equal((error as NodeJS.ErrnoException).code, "ENOENT")
        return true
      },
    )

    assert.equal(replacements, 1)
  })
})
