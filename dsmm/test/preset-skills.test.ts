import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshSkillRegistration } from "../lib/dsh-types.js";
import { Config, apply, inject, name } from "../lib/preset-skills.js";
import { DSMM_SKILL_NAMES } from "../lib/skills.js";

test("preset-skills config defaults to the canonical skill list and rejects unknown names", () => {
  assert.deepEqual(Config({}), { skills: [...DSMM_SKILL_NAMES] });
  assert.throws(() => Config({ skills: ["not-a-dsmm-skill"] as never[] }));
});

test("preset-skills apply registers exactly configured model- and user-invocable skills", () => {
  const registered: DshSkillRegistration[] = [];

  apply({ skills: { register(skill) { registered.push(skill); } } }, {
    skills: ["brainstorming", "remove-ai-slops"]
  });

  assert.equal(name, "dsmm/preset-skills");
  assert.deepEqual(inject, ["skills"]);
  assert.deepEqual(registered.map((skill) => skill.name), ["brainstorming", "remove-ai-slops", "debugging"]);
  assert.ok(registered.every((skill) => skill.invocation?.modelInvocable === true && skill.invocation.userInvocable === true));
});

test("preset-skills apply preserves an explicit empty skill list", () => {
  const registered: DshSkillRegistration[] = [];

  apply({ skills: { register(skill) { registered.push(skill); } } }, { skills: [] });

  assert.deepEqual(registered.map((skill) => skill.name), ["debugging"]);
});

test("preset-skills waits for its scoped skills service", () => {
  const registered: DshSkillRegistration[] = [];

  apply({
    inject(dependencies, installer) {
      assert.deepEqual(dependencies, ["skills"]);
      installer({ skills: { register(skill) { registered.push(skill); } } });
    }
  }, { skills: ["writing-plans"] });

  assert.deepEqual(registered.map((skill) => skill.name), ["writing-plans", "debugging"]);
});
