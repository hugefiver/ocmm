import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const skills = ["brainstorming", "writing-plans", "requesting-code-review", "receiving-code-review"];

test("MVP skill files exist with required frontmatter", () => {
  for (const skill of skills) {
    const file = join(packageRoot, "skills", skill, "SKILL.md");
    assert.equal(existsSync(file), true, `${skill} skill file exists`);
    const text = readFileSync(file, "utf8");
    assert.match(text, /^---\r?\nname: /, `${skill} has frontmatter name`);
    assert.match(text, /description: /, `${skill} has frontmatter description`);
  }
});

test("cordis patch registers only the dsmm bundle row", () => {
  const patch = readFileSync(join(packageRoot, "cordis.patch.yml"), "utf8");

  assert.match(patch, /id: dsmm/);
  assert.match(patch, /name: ['"]?dsmm['"]?/);
  assert.doesNotMatch(patch, /dsh-skill-filesystem/);
  assert.equal((patch.match(/^\s*- id:/gm) ?? []).length, 1);
});
