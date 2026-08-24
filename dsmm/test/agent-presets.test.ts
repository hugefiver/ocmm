import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { DSMM_ROLES, renderAgentCordis, renderPresetMetadata } from "../lib/roles.js";
import { DSMM_SKILL_NAMES } from "../lib/skills.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("static agent presets exist for every enabled role", () => {
  for (const role of DSMM_ROLES) {
    if (!role.enabledByDefault) continue;

    const presetDirectory = join(packageRoot, "agent-presets", role.id);

    assert.equal(existsSync(presetDirectory), true, `${role.id} preset directory exists`);
    assert.equal(existsSync(join(presetDirectory, "agent.cordis.yml")), true, `${role.id} agent.cordis.yml exists`);
    assert.equal(existsSync(join(presetDirectory, "preset.yml")), true, `${role.id} preset.yml exists`);
  }
});

test("static agent preset files exactly match role render helpers", () => {
  for (const role of DSMM_ROLES) {
    const presetDirectory = join(packageRoot, "agent-presets", role.id);

    assert.equal(readFileSync(join(presetDirectory, "agent.cordis.yml"), "utf8"), renderAgentCordis(role));
    assert.equal(readFileSync(join(presetDirectory, "preset.yml"), "utf8"), renderPresetMetadata(role));
  }
});

test("static agent cordis files contain exactly the persona and preset-skills rows", () => {
  const expectedSkills = DSMM_SKILL_NAMES.map((skill) => `      - ${skill}`).join("\n");

  for (const role of DSMM_ROLES) {
    const agentCordis = readFileSync(join(packageRoot, "agent-presets", role.id, "agent.cordis.yml"), "utf8");

    assert.match(agentCordis, /^- id: persona\r?\n/mu, `${role.id} starts with a top-level list item`);
    assert.equal((agentCordis.match(/^\s*- id:/gmu) ?? []).length, 2, `${role.id} has two service rows`);
    assert.equal((agentCordis.match(/name: '@deepseek-ai\/dsh-persona'/gu) ?? []).length, 1, `${role.id} has one persona row`);
    assert.equal((agentCordis.match(/name: 'dsmm\/preset-skills'/gu) ?? []).length, 1, `${role.id} has one preset skill row`);
    assert.ok(agentCordis.includes(`- id: dsmm-preset-skills\n  name: 'dsmm/preset-skills'\n  config:\n    skills:\n${expectedSkills}\n`));
  }
});
