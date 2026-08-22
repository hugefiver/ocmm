import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshSkillRegistration } from "../lib/dsh-types.js";
import { DEFAULT_DSMM_SETTINGS } from "../lib/settings.js";
import { MVP_SKILL_NAMES, parseSkillMarkdown, registerBundledSkills } from "../lib/skills.js";

test("MVP skill names are stable and kebab-case", () => {
  assert.deepEqual(MVP_SKILL_NAMES, ["brainstorming", "writing-plans", "requesting-code-review", "receiving-code-review"]);
});

test("parseSkillMarkdown extracts frontmatter and body", () => {
  assert.deepEqual(parseSkillMarkdown("---\nname: sample\ndescription: Sample skill\n---\n\n# Body\n"), {
    name: "sample",
    description: "Sample skill",
    content: "# Body\n"
  });
});

test("registerBundledSkills registers four runtime skills by default", () => {
  const registered: DshSkillRegistration[] = [];
  registerBundledSkills({ skills: { register(skill) { registered.push(skill); } } }, () => DEFAULT_DSMM_SETTINGS);

  assert.equal(registered.length, 4);
  assert.deepEqual(registered.map((skill) => skill.name), [...MVP_SKILL_NAMES]);
  assert.deepEqual(registered.map((skill) => skill.source), ["bundled", "bundled", "bundled", "bundled"]);
  assert.deepEqual(registered.map((skill) => skill.provider), ["dsmm", "dsmm", "dsmm", "dsmm"]);
  assert.ok(registered.every((skill) => skill.resourceBase?.kind === "directory"));
  assert.ok(registered.every((skill) => skill.invocation?.modelInvocable === true && skill.invocation.userInvocable === true));
});

test("registerBundledSkills honors skill settings", () => {
  const registered: DshSkillRegistration[] = [];
  registerBundledSkills(
    { skills: { register(skill) { registered.push(skill); } } },
    () => ({ ...DEFAULT_DSMM_SETTINGS, skills: { ...DEFAULT_DSMM_SETTINGS.skills, "writing-plans": false } })
  );

  assert.deepEqual(registered.map((skill) => skill.name), ["brainstorming", "requesting-code-review", "receiving-code-review"]);
});

test("registerBundledSkills can wait for an injected skills service", () => {
  const registered: DshSkillRegistration[] = [];
  registerBundledSkills({
    inject(dependencies, installer) {
      if (dependencies[0] !== "skills") return;
      installer({ skills: { register(skill) { registered.push(skill); } } });
    }
  }, () => DEFAULT_DSMM_SETTINGS);

  assert.equal(registered.length, 4);
});

test("registerBundledSkills does not read missing Cordis services directly", () => {
  const ctx = new Proxy({} as Parameters<typeof registerBundledSkills>[0], {
    get(_target, property) {
      if (property === "skills") throw new Error("skills was read directly");
      return undefined;
    },
    has() {
      return false;
    }
  });

  assert.doesNotThrow(() => registerBundledSkills(ctx, () => DEFAULT_DSMM_SETTINGS));
});
