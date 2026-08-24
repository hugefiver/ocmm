import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshSkillRegistration } from "../lib/dsh-types.js";
import { DSMM_SKILL_NAMES as SETTINGS_SKILL_NAMES } from "../lib/settings.js";
import {
  DSMM_SKILL_NAMES,
  MVP_SKILL_NAMES,
  enabledSkillNames,
  loadBundledSkill,
  parseSkillMarkdown,
  registerBundledSkills,
  renderBundledSkillPrompt
} from "../lib/skills.js";
import { resolveConfig } from "../lib/settings.js";

test("DSMM skill names are stable and kebab-case", () => {
  assert.deepEqual(DSMM_SKILL_NAMES, [
    "brainstorming",
    "writing-plans",
    "requesting-code-review",
    "receiving-code-review",
    "subagent-driven-development",
    "dispatching-parallel-agents",
    "remove-ai-slops"
  ]);
});

test("MVP skill names remain as a compatibility alias", () => {
  assert.equal(MVP_SKILL_NAMES, DSMM_SKILL_NAMES);
  assert.equal(SETTINGS_SKILL_NAMES, DSMM_SKILL_NAMES);
});

test("parseSkillMarkdown extracts frontmatter and body", () => {
  assert.deepEqual(parseSkillMarkdown("---\nname: sample\ndescription: Sample skill\n---\n\n# Body\n"), {
    name: "sample",
    description: "Sample skill",
    content: "# Body\n"
  });
});

test("enabledSkillNames keeps canonical order and respects configured disablement", () => {
  const settings = resolveConfig({ skills: { "writing-plans": false, "remove-ai-slops": false } });

  assert.deepEqual(enabledSkillNames(settings), [
    "brainstorming",
    "requesting-code-review",
    "receiving-code-review",
    "subagent-driven-development",
    "dispatching-parallel-agents"
  ]);
});

test("loadBundledSkill preserves bundled registration metadata", () => {
  const loaded = loadBundledSkill("brainstorming");

  assert.equal(loaded.name, "brainstorming");
  assert.equal(loaded.source, "bundled");
  assert.equal(loaded.provider, "dsmm");
  assert.equal(loaded.resourceBase?.kind, "directory");
  assert.deepEqual(loaded.invocation, { modelInvocable: true, userInvocable: true });
  assert.match(loaded.content, /^# Brainstorming/mu);
  assert.doesNotMatch(loaded.content, /^---$/mu);
});

test("registerBundledSkills registers only the requested names in canonical order", () => {
  const registered: DshSkillRegistration[] = [];
  registerBundledSkills({ register(skill) { registered.push(skill); } }, ["remove-ai-slops", "brainstorming"]);

  assert.deepEqual(registered.map((skill) => skill.name), ["brainstorming", "remove-ai-slops"]);
  assert.ok(registered.every((skill) => skill.source === "bundled"));
  assert.ok(registered.every((skill) => skill.provider === "dsmm"));
  assert.ok(registered.every((skill) => skill.resourceBase?.kind === "directory"));
  assert.ok(registered.every((skill) => skill.invocation?.modelInvocable === true && skill.invocation.userInvocable === true));
});

test("renderBundledSkillPrompt emits requested skill bodies once without frontmatter", () => {
  const prompt = renderBundledSkillPrompt(["remove-ai-slops", "brainstorming", "brainstorming"]);

  assert.equal((prompt.match(/<dsmm-skill name="brainstorming">/gu) ?? []).length, 1);
  assert.equal((prompt.match(/<dsmm-skill name="remove-ai-slops">/gu) ?? []).length, 1);
  assert.match(prompt, /^<dsmm-skill name="brainstorming">\n# Brainstorming/mu);
  assert.match(prompt, /<dsmm-skill name="remove-ai-slops">\n# Remove AI Slops/mu);
  assert.doesNotMatch(prompt, /^---$/mu);
});
