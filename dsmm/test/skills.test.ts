import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DSMM_SKILL_NAMES as SETTINGS_SKILL_NAMES, resolveConfig } from "../lib/settings.js";
import { DSMM_SKILL_NAMES, DSMM_ON_DEMAND_SKILL_NAMES, MVP_SKILL_NAMES, enabledSkillNames,
  bundledSkillMetadata, parseSkillMarkdown, readBundledSkill } from "../lib/skills.js";

test("canonical seven-core inventory and legacy alias remain stable; debugging is lazy too", () => {
  assert.deepEqual(DSMM_SKILL_NAMES, ["brainstorming", "writing-plans", "requesting-code-review", "receiving-code-review", "subagent-driven-development", "dispatching-parallel-agents", "remove-ai-slops"]);
  assert.equal(MVP_SKILL_NAMES, DSMM_SKILL_NAMES); assert.equal(SETTINGS_SKILL_NAMES, DSMM_SKILL_NAMES);
  assert.deepEqual(DSMM_ON_DEMAND_SKILL_NAMES, ["debugging"]);
});

test("parseSkillMarkdown extracts frontmatter and body and rejects invalid entries", () => {
  assert.deepEqual(parseSkillMarkdown("---\nname: sample\ndescription: Sample skill\n---\n\n# Body\n"), { name: "sample", description: "Sample skill", content: "# Body\n" });
  assert.throws(() => parseSkillMarkdown("# No frontmatter"));
  assert.throws(() => parseSkillMarkdown("---\nname: sample\n---\nbody"));
});

test("enabledSkillNames preserves canonical order and deployment disablement", () => {
  assert.deepEqual(enabledSkillNames(resolveConfig({ skills: { "writing-plans": false, "remove-ai-slops": false } })), ["brainstorming", "requesting-code-review", "receiving-code-review", "subagent-driven-development", "dispatching-parallel-agents"]);
});

test("metadata inventory agrees with packaged frontmatter without carrying bodies", async () => {
  for (const name of [...DSMM_SKILL_NAMES, ...DSMM_ON_DEMAND_SKILL_NAMES]) {
    const meta = bundledSkillMetadata(name);
    assert.equal(meta.resourceBase?.kind, "directory");
    if (meta.resourceBase?.kind !== "directory") throw new Error("bundled skill needs a directory base");
    const parsed = parseSkillMarkdown(readFileSync(join(meta.resourceBase.path, "SKILL.md"), "utf8"));
    const loaded = await readBundledSkill(name, new AbortController().signal);
    assert.equal("content" in meta, false); assert.equal(meta.provider, "dsmm"); assert.equal(meta.source, "bundled");
    assert.deepEqual(meta.invocation, { modelInvocable: true, userInvocable: true });
    assert.equal(meta.name, parsed.name); assert.equal(meta.description, parsed.description);
    assert.deepEqual(loaded, { ...meta, content: parsed.content });
    assert.doesNotMatch(loaded.content, /^---$/mu);
  }
  const debugging = await readBundledSkill("debugging", new AbortController().signal);
  assert.match(debugging.content, /references\/scripts\/dap\.mjs/);
  assert.equal(debugging.resourceBase?.kind, "directory");
  if (debugging.resourceBase?.kind === "directory") assert.match(readFileSync(join(debugging.resourceBase.path, "references/scripts/dap.mjs"), "utf8"), /node/);
  const aborted = AbortSignal.abort();
  await assert.rejects(readBundledSkill("brainstorming", aborted));
});
