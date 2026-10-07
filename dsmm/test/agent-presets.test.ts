import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { DSMM_ROLES, renderAgentCordis, renderPresetMetadata } from "../lib/roles.js";

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

test("static agent cordis files mirror native preset plugin inventory", () => {
  for (const role of DSMM_ROLES) {
    const agentCordis = readFileSync(join(packageRoot, "agent-presets", role.id, "agent.cordis.yml"), "utf8");

    assert.match(agentCordis, /^- id: persona\r?\n/mu, `${role.id} starts with a top-level list item`);
    assert.ok((agentCordis.match(/^\s*- id:/gmu) ?? []).length >= 7, `${role.id} has working tool rows`);
    assert.equal((agentCordis.match(/name: '@deepseek-ai\/dsh-persona'/gu) ?? []).length, 1, `${role.id} has one persona row`);
    assert.doesNotMatch(agentCordis, /@dsmm\/dsmm\/preset-skills/u);
    assert.equal((agentCordis.match(/name: '@deepseek-ai\/dsh-tool-skill'/gu) ?? []).length, 1);
    assert.equal(agentCordis.includes("name: '@deepseek-ai/dsh-tool-subagent'"), role.id === "dsmm-orchestrator" || role.id === "dsmm-builder");
  }
});

test("optional native default patch does not configure removed directory discovery", () => {
  const patch = readFileSync(join(packageRoot, "patches", "agent-presets-root.example.cordis.patch.yml"), "utf8");
  assert.match(patch, /^- id: agent-presets\r?\n  config:\r?\n    default: dsmm-orchestrator\r?\n?$/mu);
  assert.doesNotMatch(patch, /roots:|includeUserRoot:|trust:|path:/u);
  assert.match(patch, /inspection templates, not discovery inputs/u);
  assert.match(patch, /does not apply this patch or change the deployment default/u);
});
