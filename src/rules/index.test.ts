import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { findAgentsMdUp, findRuleFiles, parseRuleMarkdown, shouldApplyRule } from "./index.ts"

function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), "ocmm-rules-"))
}

function write(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, content)
}

test("parseRuleMarkdown extracts supported frontmatter fields", () => {
  const parsed = parseRuleMarkdown(`---
description: TypeScript rules
globs:
  - "**/*.ts"
paths: ["src/**/*.tsx"]
applyTo:
  - README.md
alwaysApply: true
---
Use strict types.
`)

  assert.deepEqual(parsed.metadata, {
    description: "TypeScript rules",
    globs: ["**/*.ts"],
    paths: ["src/**/*.tsx"],
    applyTo: ["README.md"],
    alwaysApply: true,
  })
  assert.equal(parsed.content, "Use strict types.\n")
})

test("findRuleFiles discovers project and global rules in deterministic order", () => {
  const project = makeTempRoot()
  const home = makeTempRoot()
  try {
    const file = join(project, "src", "feature", "app.ts")
    write(file, "console.log('x')\n")
    write(join(project, ".omo", "rules", "base.md"), "---\nglobs: [\"**/*.ts\"]\n---\nbase\n")
    write(join(project, "src", ".cursor", "rules", "local.mdc"), "---\nalwaysApply: true\n---\nlocal\n")
    write(join(project, ".github", "instructions", "ts.instructions.md"), "---\nglobs: [\"**/*.ts\"]\n---\ngh\n")
    write(join(project, ".github", "instructions", "skip.md"), "skip\n")
    write(join(home, ".opencode", "rules", "global.md"), "---\nglobs: [\"**/*.ts\"]\n---\nglobal\n")

    const rules = findRuleFiles({ projectRoot: project, homeDir: home, filePath: file })
    assert.deepEqual(rules.map((rule) => rule.relativePath), [
      "src/.cursor/rules/local.mdc",
      ".omo/rules/base.md",
      ".github/instructions/ts.instructions.md",
      "~/.opencode/rules/global.md",
    ])
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

test("shouldApplyRule handles positive, negative, basename, and alwaysApply rules", () => {
  const project = makeTempRoot()
  try {
    const file = join(project, "src", "app.ts")
    assert.deepEqual(
      shouldApplyRule({ globs: ["**/*.ts"] }, file, project),
      { applies: true, reason: "glob: **/*.ts" },
    )
    assert.deepEqual(
      shouldApplyRule({ globs: ["**/*.ts", "!src/app.ts"] }, file, project),
      { applies: false, reason: "excluded: !src/app.ts" },
    )
    assert.deepEqual(shouldApplyRule({ globs: ["app.ts"] }, file, project), {
      applies: true,
      reason: "glob: app.ts",
    })
    assert.deepEqual(shouldApplyRule({ alwaysApply: true }, file, project), {
      applies: true,
      reason: "alwaysApply",
    })
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

test("findAgentsMdUp returns root-most directory context and skips project root by default", () => {
  const project = makeTempRoot()
  try {
    write(join(project, "AGENTS.md"), "root\n")
    write(join(project, "src", "AGENTS.md"), "src\n")
    write(join(project, "src", "feature", "AGENTS.md"), "feature\n")
    write(join(project, "src", "feature", "app.ts"), "x\n")

    const found = findAgentsMdUp({
      rootDir: project,
      startDir: join(project, "src", "feature", "app.ts"),
    })
    assert.deepEqual(found, [
      join(project, "src", "AGENTS.md"),
      join(project, "src", "feature", "AGENTS.md"),
    ])
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})
