import assert from "node:assert/strict";
import { test } from "node:test";
import { DSMM_ROLE_IDS as EXPORTED_ROLE_IDS } from "../lib/index.js";
import { DSMM_ROLES, DSMM_ROLE_IDS, isDsmmRoleId, renderAgentCordis, renderPresetMetadata } from "../lib/roles.js";
import { DSMM_SKILL_NAMES } from "../lib/skills.js";

const EXPECTED_ROLE_IDS = [
  "dsmm-orchestrator",
  "dsmm-planner",
  "dsmm-plan-critic",
  "dsmm-reviewer",
  "dsmm-code-search",
  "dsmm-doc-search",
  "dsmm-clarifier",
  "dsmm-media-reader"
] as const;

test("role ids are stable and exported from the package entrypoint", () => {
  assert.deepEqual(DSMM_ROLE_IDS, EXPECTED_ROLE_IDS);
  assert.deepEqual(EXPORTED_ROLE_IDS, EXPECTED_ROLE_IDS);
  assert.deepEqual(DSMM_ROLES.map((role) => role.id), EXPECTED_ROLE_IDS);
});

test("role ids are valid dsh preset ids", () => {
  for (const id of DSMM_ROLE_IDS) {
    assert.match(id, /^[a-z0-9][a-z0-9-]*$/u);
    assert.equal(isDsmmRoleId(id), true);
  }

  assert.equal(isDsmmRoleId("dsmm_orchestrator"), false);
  assert.equal(isDsmmRoleId(""), false);
  assert.equal(isDsmmRoleId(undefined), false);
});

test("preset metadata renders id, name, and description", () => {
  for (const role of DSMM_ROLES) {
    const metadata = renderPresetMetadata(role);

    assert.match(metadata, new RegExp(`^id: ${role.id}$`, "mu"));
    assert.match(metadata, new RegExp(`^name: '${role.name}'$`, "mu"));
    assert.match(metadata, /^description: '.+'$/mu);
    assert.equal(metadata.endsWith("\n"), true);
  }
});

test("agent cordis renders exactly one persona row and one preset-scoped skill row", () => {
  const expectedSkills = DSMM_SKILL_NAMES.map((skill) => `      - ${skill}`).join("\n");

  for (const role of DSMM_ROLES) {
    const cordis = renderAgentCordis(role);
    const personaMarkers = cordis.match(/name: '@deepseek-ai\/dsh-persona'/gu) ?? [];
    const presetSkillMarkers = cordis.match(/name: 'dsmm\/preset-skills'/gu) ?? [];

    assert.equal(personaMarkers.length, 1);
    assert.equal(presetSkillMarkers.length, 1);
    assert.match(cordis, /^- id: persona\n  name: '@deepseek-ai\/dsh-persona'\n  config:\n    text: \|-\n/mu);
    assert.ok(cordis.includes(`      ${role.persona.split("\n")[0]}`));
    assert.ok(cordis.includes(`- id: dsmm-preset-skills\n  name: 'dsmm/preset-skills'\n  config:\n    skills:\n${expectedSkills}\n`));
    assert.equal(cordis.endsWith("\n"), true);
  }
});

test("agent cordis renders an explicit empty preset skill list", () => {
  const role = DSMM_ROLES[0];
  assert.ok(role);
  const cordis = renderAgentCordis(role, []);

  assert.match(cordis, /  config:\n    skills: \[\]\n$/u);
  assert.doesNotMatch(cordis, /    skills:\n\n$/u);
  assert.ok(cordis.includes(`      ${role.persona.split("\n")[0]}`));
});

test("personas are role-scoped and avoid host-specific tool names", () => {
  for (const role of DSMM_ROLES) {
    assert.ok(role.persona.includes(role.id));
    assert.doesNotMatch(role.persona, /opencode|task tool/iu);
  }
});

test("orchestrator persona names dsh routing target preset ids", () => {
  const orchestrator = DSMM_ROLES.find((role) => role.id === "dsmm-orchestrator");
  assert.ok(orchestrator);

  for (const target of ["dsmm-planner", "dsmm-plan-critic", "dsmm-reviewer", "dsmm-code-search", "dsmm-doc-search", "dsmm-clarifier", "dsmm-media-reader"]) {
    assert.ok(orchestrator.persona.includes(target), `${target} missing from orchestrator persona`);
  }
});
