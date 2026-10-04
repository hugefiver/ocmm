import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { DSMM_SKILL_NAMES } from "../lib/skills.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("bundled skill files exist with matching frontmatter", () => {
  for (const skill of DSMM_SKILL_NAMES) {
    const file = join(packageRoot, "skills", skill, "SKILL.md");
    assert.equal(existsSync(file), true, `${skill} skill file exists`);
    const text = readFileSync(file, "utf8");
    assert.match(text, new RegExp(`^---\\r?\\nname: ${skill}\\r?$`, "mu"), `${skill} frontmatter name matches directory`);
    assert.match(text, /description: /, `${skill} has frontmatter description`);
  }
});

test("cordis patch registers only the dsmm bundle row", () => {
  const patch = readFileSync(join(packageRoot, "cordis.patch.yml"), "utf8");

  assert.match(patch, /id: dsmm/);
  assert.match(patch, /name: ['"]@dsmm\/dsmm['"]/);
  assert.doesNotMatch(patch, /name: ['"]?dsmm['"]?(?:\r?\n|$)/);
  assert.doesNotMatch(patch, /dsh-skill-filesystem/);
  assert.equal((patch.match(/^\s*- id:/gm) ?? []).length, 1);
});
