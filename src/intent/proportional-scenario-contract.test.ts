import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

const TARGET_PROMPTS = [
  "prompts/omo/deepwork/default.md",
  "prompts/omo/deepwork/gpt.md",
  "prompts/v1/deepwork/default.md",
] as const

test("target deepwork prompts keep proportional scenario and TDD guidance", () => {
  for (const relativePath of TARGET_PROMPTS) {
    const prompt = readFileSync(join(process.cwd(), relativePath), "utf8")

    assert.match(prompt, /one or two targeted scenarios/i, `${relativePath}: small single-surface work`)
    assert.match(prompt, /at least three scenarios/i, `${relativePath}: high-risk work`)
    assert.match(prompt, /happy path/i, `${relativePath}: happy path`)
    assert.match(prompt, /edge.*adjacent.*only when.*risk/i, `${relativePath}: risk-gated edge and adjacent checks`)
    assert.match(prompt, /real deterministic test seam/i, `${relativePath}: deterministic seam`)
    assert.match(prompt, /test-first/i, `${relativePath}: test-first at a seam`)
    assert.match(prompt, /strongest real-surface verification/i, `${relativePath}: no-seam verification`)
    assert.match(prompt, /not a prose pin/i, `${relativePath}: no prose pinning`)
    assert.match(prompt, /characterization.*only.*behavior regression.*hidden/i, `${relativePath}: characterization boundary`)

    assert.doesNotMatch(prompt, /3\+ realistic scenarios/i, `${relativePath}: obsolete unconditional scenario count`)
    assert.doesNotMatch(prompt, /TDD \(MANDATORY on every production change\)/i, `${relativePath}: obsolete universal TDD heading`)
    assert.doesNotMatch(prompt, /Every behavior change.*RED→GREEN→SURFACE/is, `${relativePath}: obsolete universal TDD rule`)
    assert.doesNotMatch(prompt, /production code without a failing test preceding it|Writing code before its failing test/i, `${relativePath}: obsolete universal test-first rule`)
  }
})
