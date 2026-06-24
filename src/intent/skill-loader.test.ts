import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildSkillCommand, loadSharedSkills, loadV1SkillCommands, loadV1Skills, V1_SKILL_DIRS } from "./skill-loader.ts"

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

test("loadSharedSkills scans top-level skills and excludes v1", () => {
  const root = makeSkillsRoot()
  try {
    writeSkill(root, "git-master", "git-master", "Git tools")
    writeSkill(root, "debugging", "debugging", "Debug tools")
    writeFileSync(join(root, "v1", "brainstorming", "SKILL.md"), skillDoc("brainstorming", "v1"))

    const skills = loadSharedSkills({ rootDir: root })

    assert.deepEqual(skills.map((s) => s.name), ["debugging", "git-master"])
    assert.ok(skills.every((s) => !s.path.includes(`${join("v1", "")}`)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadSharedSkills applies enable and disable filters", () => {
  const root = makeSkillsRoot()
  try {
    writeSkill(root, "git-master", "git-master", "Git tools")
    writeSkill(root, "debugging", "debugging", "Debug tools")
    writeSkill(root, "frontend", "frontend", "Frontend tools")

    const skills = loadSharedSkills({
      rootDir: root,
      enable: ["debugging", "git-master"],
      disable: ["debugging"],
    })

    assert.deepEqual(skills.map((s) => s.name), ["git-master"])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("buildSkillCommand wraps a SKILL.md body as an OpenCode command template", () => {
  const root = makeSkillsRoot()
  try {
    writeSkill(root, "git-master", "git-master", "Git tools")
    const [skill] = loadSharedSkills({ rootDir: root })
    assert.ok(skill)

    const command = buildSkillCommand(skill, "test")

    assert.equal(command?.name, "git-master")
    assert.match(command?.description ?? "", /^\(test - Skill\) Git tools$/)
    assert.match(command?.template ?? "", /<skill-instruction>/)
    assert.match(command?.template ?? "", /Base directory for this skill:/)
    assert.match(command?.template ?? "", /# git-master/)
    assert.doesNotMatch(command?.template ?? "", /---\nname:/)
    assert.match(command?.template ?? "", /<user-request>\n\$ARGUMENTS\n<\/user-request>/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadV1SkillCommands wraps v1 skills and applies disable filters", () => {
  const root = makeSkillsRoot()
  try {
    for (const dir of V1_SKILL_DIRS) {
      writeSkill(join(root, "v1"), dir, dir, `${dir} skill`)
    }

    const commands = loadV1SkillCommands({ rootDir: root, disable: ["writing-plans"] })

    assert.ok(commands.some((command) => command.name === "brainstorming"))
    assert.equal(commands.some((command) => command.name === "writing-plans"), false)
    assert.ok(commands.every((command) => command.description.startsWith("(ocmm deepwork - Skill)")))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadSharedSkills scans additional sources recursively", () => {
  const root = makeSkillsRoot()
  const extra = mkdtempSync(join(tmpdir(), "ocmm-extra-skills-"))
  try {
    writeSkill(extra, join("nested", "ast-grep"), "ast-grep", "AST grep")

    const skills = loadSharedSkills({
      rootDir: root,
      sources: [{ path: extra, recursive: true, glob: "nested/*" }],
    })

    assert.deepEqual(skills.map((s) => s.name), ["ast-grep"])
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(extra, { recursive: true, force: true })
  }
})

function writeSkill(root: string, dir: string, name: string, description: string): void {
  const skillDir = join(root, dir)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, "SKILL.md"), skillDoc(name, description))
}

function skillDoc(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`
}
