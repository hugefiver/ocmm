import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"

import { buildSkillCommand, loadSharedSkills, loadV1SkillCommands, loadV1SkillBriefs, V1_COMMAND_SKILLS, V1_SKILL_DIRS } from "./skill-loader.ts"

function makeSkillsRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ocmm-skills-"))
  for (const dir of V1_SKILL_DIRS) {
    mkdirSync(join(root, "v1", dir), { recursive: true })
  }
  return root
}

test("default briefs and explicit full skill commands use separate resources", () => {
  const root = makeSkillsRoot()
  try {
    for (const dir of V1_COMMAND_SKILLS) {
      writeFileSync(join(root, "v1", dir, "SKILL.md"), `# Skill ${dir}`)
    }
    writeFileSync(join(root, "v1", "brainstorming", "brief.md"), "[fixture:brief]")
    assert.equal(loadV1SkillBriefs(root), "[fixture:brief]")
    const command = loadV1SkillCommands({ rootDir: root }).find(({ name }) => name === "brainstorming")
    assert.ok(command?.template.includes("# Skill brainstorming"))
    writeFileSync(join(root, "v1", "brainstorming", "brief.md"), "[fixture:updated-brief]")
    assert.equal(loadV1SkillBriefs(root), "[fixture:updated-brief]")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("V1_COMMAND_SKILLS contains all 6 v1 skills", () => {
  assert.equal(V1_COMMAND_SKILLS.length, 6)
  assert.ok(V1_COMMAND_SKILLS.includes("brainstorming"))
  assert.ok(V1_COMMAND_SKILLS.includes("writing-plans"))
  assert.ok(V1_COMMAND_SKILLS.includes("dispatching-parallel-agents"))
})

test("missing briefs do not fall back to full skill documents", () => {
  const root = makeSkillsRoot()
  try {
    writeFileSync(join(root, "v1", "brainstorming", "SKILL.md"), "only one skill")
    assert.equal(loadV1SkillBriefs(root), "")
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

test("shared publish skill is discovered outside v1 injection and commands", () => {
  const skills = loadSharedSkills()
  const publish = skills.find((skill) => skill.name === "publish")

  assert.ok(publish, "shared publish skill must be discovered")
  assert.equal(relative(join(process.cwd(), "skills", "v1"), publish.path).startsWith(".."), true)

  assert.equal((V1_COMMAND_SKILLS as readonly string[]).includes("publish"), false)
})

test("shared report-fidelity is discoverable, loadable, and respects skill filters", () => {
  const [skill] = loadSharedSkills({ enable: ["report-fidelity"] })
  assert.ok(skill)
  assert.equal(skill.name, "report-fidelity")
  assert.ok(skill.description.length > 0)
  const command = buildSkillCommand(skill)
  assert.ok(command)
  assert.equal(command?.name, skill.name)
  assert.ok(command.template.length > 0)
  assert.equal(loadSharedSkills({ enable: ["report-fidelity"], disable: ["report-fidelity"] }).length, 0)
})

test("shared coding-agent-sessions skill is discovered and remains outside v1 injection", () => {
  const skills = loadSharedSkills()
  const skill = skills.find((item) => item.name === "coding-agent-sessions")

  assert.ok(skill, "shared coding-agent-sessions skill must be discovered")
  assert.equal(skill.path, join(process.cwd(), "skills", "coding-agent-sessions"))
  assert.equal(relative(join(process.cwd(), "skills", "v1"), skill.path).startsWith(".."), true)
  assert.equal((V1_COMMAND_SKILLS as readonly string[]).includes(skill.name), false)

  const command = buildSkillCommand(skill)
  assert.equal(command?.name, "coding-agent-sessions")
  assert.match(command?.description ?? "", /^\(ocmm - Skill\)/)
  assert.match(command?.template ?? "", /<skill-instruction>/)
})

test("shared coding-agent-sessions skill follows configured allow-list and disable filters", () => {
  const allowed = loadSharedSkills({ enable: ["coding-agent-sessions"] })
  const disabled = loadSharedSkills({ disable: ["coding-agent-sessions"] })

  assert.deepEqual(allowed.map((skill) => skill.name), ["coding-agent-sessions"])
  assert.equal(disabled.some((skill) => skill.name === "coding-agent-sessions"), false)
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
