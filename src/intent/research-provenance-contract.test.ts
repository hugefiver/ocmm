import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const WORKFLOWS = ["omo", "v1", "codex"] as const

function readResearchPrompt(workflow: (typeof WORKFLOWS)[number]): string {
  return readFileSync(join(process.cwd(), "prompts", workflow, "category", "research.md"), "utf8")
}

test("research category prompts preserve the minimal provenance contract across workflows", () => {
  for (const workflow of WORKFLOWS) {
    const prompt = readResearchPrompt(workflow)
    const label = `${workflow}/research`

    assert.match(prompt, /## Research provenance/i, `${label}: missing provenance section`)
    assert.match(prompt, /route.*retrieval.*publication date/i, `${label}: tool provenance fields`)
    assert.match(prompt, /archive.*snapshot.*timestamp.*not.*live/i, `${label}: archive and snapshot handling`)
    assert.match(prompt, /proxy.*mirror.*cache.*explicitly untrusted.*indirect evidence/i, `${label}: indirect evidence classification`)
    assert.match(prompt, /corroborat.*material claim.*independent route/i, `${label}: indirect-evidence corroboration`)
    assert.match(prompt, /tool.*no provenance.*state.*limitation.*do not invent/i, `${label}: unavailable provenance handling`)

    assert.doesNotMatch(prompt, /exhaustive research/i, `${label}: exhaustive-research expansion`)
    assert.doesNotMatch(prompt, /every claim.*second worker/i, `${label}: per-claim worker expansion`)
    assert.doesNotMatch(prompt, /citation graph/i, `${label}: citation-graph expansion`)
    assert.doesNotMatch(prompt, /persistent research assets/i, `${label}: persistent-assets expansion`)
  }
})
