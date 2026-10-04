import assert from "node:assert/strict";
import { test } from "node:test";
import { DSMM_ROLE_IDS as EXPORTED_ROLE_IDS } from "../lib/index.js";
import { DSMM_ROLES, DSMM_ROLE_IDS, isDsmmRoleId, renderAgentCordis, renderPresetMetadata } from "../lib/roles.js";
import { DSMM_SKILL_NAMES } from "../lib/skills.js";

const EXPECTED_ROLE_IDS = [
  "dsmm-orchestrator",
  "dsmm-planner",
  "dsmm-plan-critic",
  "dsmm-builder",
  "dsmm-reviewer",
  "dsmm-oracle",
  "dsmm-oracle-2nd",
  "dsmm-creative",
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

test("agent cordis renders one persona, actual capability rows, and bundled skills", () => {
  const expectedSkills = DSMM_SKILL_NAMES.map((skill) => `      - '${skill}'`).join("\n");

  for (const role of DSMM_ROLES) {
    const cordis = renderAgentCordis(role);
    const personaMarkers = cordis.match(/name: '@deepseek-ai\/dsh-persona'/gu) ?? [];
    const presetSkillMarkers = cordis.match(/name: '@dsmm\/dsmm\/preset-skills'/gu) ?? [];

    assert.equal(personaMarkers.length, 1);
    assert.equal(presetSkillMarkers.length, 1);
    assert.match(cordis, /^- id: persona\n  name: '@deepseek-ai\/dsh-persona'\n  config:\n    text: /mu);
    assert.ok(cordis.includes(role.id));
    assert.ok(cordis.includes(`- id: dsmm-preset-skills\n  name: '@dsmm/dsmm/preset-skills'\n  config:\n    skills:\n${expectedSkills}\n`));
    assert.match(cordis, /name: '@deepseek-ai\/dsh-tool-fs-search'/u);
    assert.match(cordis, /name: '@deepseek-ai\/dsh-tool-fs'/u);
    assert.equal(cordis.includes("name: '@deepseek-ai/dsh-tool-pwsh'"), role.access !== "read-only");
    assert.equal(cordis.endsWith("\n"), true);
  }
});

test("agent cordis renders an explicit empty core skill list", () => {
  const role = DSMM_ROLES[0];
  assert.ok(role);
  const cordis = renderAgentCordis(role, []);

  assert.match(cordis, /- id: dsmm-preset-skills\n  name: '@dsmm\/dsmm\/preset-skills'\n  config:\n    skills: \[\]\n/u);
  assert.doesNotMatch(cordis, /    skills:\n\n$/u);
  assert.ok(cordis.includes(role.id));
});

test("personas are role-scoped and avoid host-specific tool names", () => {
  for (const role of DSMM_ROLES) {
    assert.ok(role.persona.includes(role.id));
    assert.doesNotMatch(role.persona, /opencode|task tool/iu);
  }
});

test("orchestrator names DSH role tools and does not claim model heterogeneity by label", () => {
  const orchestrator = DSMM_ROLES.find((role) => role.id === "dsmm-orchestrator");
  assert.ok(orchestrator);

  for (const target of EXPECTED_ROLE_IDS.filter((id) => id !== "dsmm-orchestrator")) {
    assert.ok(orchestrator.persona.includes(target), `${target} missing from orchestrator persona`);
  }
  assert.match(orchestrator.persona, /different model was explicitly selected/u);
});

test("read-only child role tools have a native allow filter and enabled roles limit tools", () => {
  const orchestrator = DSMM_ROLES[0];
  assert.ok(orchestrator);
  const cordis = renderAgentCordis(orchestrator, DSMM_SKILL_NAMES, ["dsmm-orchestrator", "dsmm-planner"]);
  assert.match(cordis, /toolName: 'dsmm_planner'/u);
  assert.match(cordis, /toolFilter:\n      allow:\n        - 'read'\n        - 'glob'\n        - 'grep'/u);
  assert.equal((cordis.match(/modelSelectionSettings: false/gu) ?? []).length, 1);
  assert.doesNotMatch(cordis, /toolName: 'dsmm_builder'/u);
});

test("all standing role tools keep registrations in the parent scope so child allow filters remain effective", () => {
  for (const role of DSMM_ROLES.filter((item) => item.id === "dsmm-orchestrator" || item.id === "dsmm-builder")) {
    const cordis = renderAgentCordis(role);
    const roleToolCount = (cordis.match(/name: '@deepseek-ai\/dsh-tool-subagent'/gu) ?? []).length;
    assert.equal((cordis.match(/modelSelectionSettings: false/gu) ?? []).length, roleToolCount);
    assert.doesNotMatch(cordis, /modelSelectionSettings: true/u);
  }
});
