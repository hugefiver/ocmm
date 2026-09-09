import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

const repositoryRoot = process.cwd()
const generator = join(repositoryRoot, "scripts", "gen-schema.ts")
const committedSchema = join(repositoryRoot, "schema.json")

function generateSchema(cwd: string): string {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", generator], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  })
  assert.equal(result.error, undefined, `schema generator must start: ${result.error?.message ?? ""}`)
  assert.equal(result.status, 0, `schema generator failed:\n${result.stderr}`)
  return join(cwd, "schema.json")
}

function hasSameBytes(left: string, right: string): boolean {
  return readFileSync(left).equals(readFileSync(right))
}

test("generated schema exactly matches the committed schema", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-schema-freshness-"))
  try {
    assert.equal(hasSameBytes(generateSchema(cwd), committedSchema), true)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("byte comparator rejects a stale temporary schema copy", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-schema-stale-"))
  try {
    const staleSchema = join(cwd, "schema.json")
    copyFileSync(committedSchema, staleSchema)
    writeFileSync(staleSchema, `${readFileSync(staleSchema, "utf8")}\n// stale\n`)
    assert.equal(hasSameBytes(staleSchema, committedSchema), false)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
