import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { loadV1Skills, V1_SKILL_DIRS } from "./skill-loader.ts"

function makeSkillsRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ocmm-skills-"))
  for (const dir of V1_SKILL_DIRS) {
    mkdirSync(join(root, "v1", dir), { recursive: true })
  }
  return root
}

test("loadV1Skills concatenates all 5 SKILL.md files", () => {
  const root = makeSkillsRoot()
  try {
    let i = 0
    for (const dir of V1_SKILL_DIRS) {
      writeFileSync(join(root, "v1", dir, "SKILL.md"), `# Skill ${i++}`)
    }
    const skills = loadV1Skills(root)
    assert.ok(skills.includes("# Skill 0"))
    assert.ok(skills.includes("# Skill 4"))
    assert.ok(skills.includes("---"), "skills should be separated by ---")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadV1Skills tolerates missing skill files", () => {
  const root = makeSkillsRoot()
  try {
    writeFileSync(join(root, "v1", "brainstorming", "SKILL.md"), "only one skill")
    const skills = loadV1Skills(root)
    assert.ok(skills.includes("only one skill"))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
