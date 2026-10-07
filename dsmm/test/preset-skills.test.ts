import assert from "node:assert/strict";
import { test } from "node:test";
import { Config, apply, inject, name } from "../lib/preset-skills.js";
import { DSMM_SKILL_NAMES } from "../lib/skills.js";

test("legacy preset-skills entry retains its schema but cannot leak skills from a shared composition", () => {
  assert.deepEqual(Config({}), { skills: [...DSMM_SKILL_NAMES] });
  assert.throws(() => Config({ skills: ["not-a-dsmm-skill"] as never[] }));
  assert.equal(name, "dsmm/preset-skills"); assert.deepEqual(inject, []);
  for (const config of [{}, { skills: [] }, { skills: ["brainstorming"] as const }]) {
    apply({ inject() { throw new Error("must not acquire a standing skills registry"); } }, { skills: config.skills === undefined ? undefined : [...config.skills] });
  }
});
