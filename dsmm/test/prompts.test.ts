import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { BASE_DEEPWORK_PROMPT, DEEPSEEK_FLASH_OVERLAY, DEEPSEEK_V4_PRO_OVERLAY, buildDeepworkPrompt } from "../lib/prompts.js";
import { DEFAULT_DSMM_SETTINGS } from "../lib/settings.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("prompt assets exist and contain activation boundaries", () => {
  const deepwork = readFileSync(join(packageRoot, "prompts", "deepwork.md"), "utf8");
  const v4 = readFileSync(join(packageRoot, "prompts", "deepseek-v4-pro.md"), "utf8");
  const flash = readFileSync(join(packageRoot, "prompts", "deepseek-flash.md"), "utf8");

  assert.match(deepwork, /DEEPWORK MODE ENABLED!/);
  assert.match(deepwork, /\{\{modeName\}\}/);
  assert.match(deepwork, /opt-in boundary/i);
  assert.match(deepwork, /Intent routing/);
  assert.match(deepwork, /Workflow gates/);
  assert.match(deepwork, /Tool discipline/);
  assert.match(deepwork, /\[dsmm safety\]/);
  assert.match(deepwork, /brainstorming/);
  assert.match(deepwork, /writing-plans/);
  assert.match(deepwork, /subagent-driven-development/);
  assert.match(deepwork, /dispatching-parallel-agents/);
  assert.match(deepwork, /requesting-code-review/);
  assert.match(deepwork, /receiving-code-review/);
  assert.match(deepwork, /remove-ai-slops/);
  assert.match(deepwork, /workflow\.policy=risk-based/);
  assert.match(deepwork, /planner → plan-critic → implementation/);
  assert.match(deepwork, /does not authorize a commit/);
  assert.equal(deepwork.trimEnd(), BASE_DEEPWORK_PROMPT);
  assert.match(v4, /DeepSeek V4 Pro calibration/);
  assert.match(v4, /agent\/request/);
  assert.equal(flash.trimEnd(), DEEPSEEK_FLASH_OVERLAY);
  assert.match(flash, /deepseek-account\/deepseek-flash/);
});

test("buildDeepworkPrompt applies calibration only to the exact official route", () => {
  const route = { provider: "DEEPSEEK-OFFICIAL", model: "DeepSeek-V4-Pro" };
  const enabled = buildDeepworkPrompt(DEFAULT_DSMM_SETTINGS, { route });
  const strict = buildDeepworkPrompt({ ...DEFAULT_DSMM_SETTINGS, deepseekV4ProCalibration: "strict" }, { route });
  const disabled = buildDeepworkPrompt({ ...DEFAULT_DSMM_SETTINGS, deepseekV4ProCalibration: "off" }, { route });

  assert.match(enabled, /DeepSeek V4 Pro calibration/);
  assert.match(strict, /DeepSeek V4 Pro calibration/);
  assert.doesNotMatch(disabled, /DeepSeek V4 Pro calibration/);
  for (const nonOfficialRoute of [
    { provider: "deepseek", model: "deepseek-v4-pro" },
    { provider: "openrouter", model: "deepseek-v4-pro" },
    { provider: "deepseek-official", model: "deepseek-v4" },
    { provider: "deepseek-official", model: "deepseek-v4-pro-preview" },
    { provider: "openai", model: "gpt-5.6-deepseek-v4-pro" }
  ]) {
    assert.doesNotMatch(buildDeepworkPrompt(DEFAULT_DSMM_SETTINGS, { route: nonOfficialRoute }), /DeepSeek V4 Pro calibration/);
  }
});

test("buildDeepworkPrompt explains exact calibrated policy without changing runtime ownership", () => {
  const route = { provider: "deepseek-official", model: "deepseek-v4-pro" };
  const reviewer = buildDeepworkPrompt(DEFAULT_DSMM_SETTINGS, { route, selectedPreset: "dsmm-reviewer" });
  const ordinary = buildDeepworkPrompt(DEFAULT_DSMM_SETTINGS, { route });

  assert.match(reviewer, /<dsmm-deepseek-v4-pro-policy>\ncalibrationMode: auto\ndefaultReasoningEffort: high\nmaxReasoningPresets: dsmm-plan-critic, dsmm-reviewer\neffectiveDesiredReasoningEffort: max\n<\/dsmm-deepseek-v4-pro-policy>/u);
  assert.match(ordinary, /effectiveDesiredReasoningEffort: high/u);
});

test("buildDeepworkPrompt accepts composition section override", () => {
  const prompt = buildDeepworkPrompt(DEFAULT_DSMM_SETTINGS, {
    route: { provider: "deepseek-official", model: "deepseek-v4-pro" },
    overrideSection: "Custom dsmm section for {{modeName}}"
  });

  assert.match(prompt, /Custom dsmm section for deepwork/);
  assert.doesNotMatch(prompt, /DEEPWORK MODE ENABLED/);
  assert.match(prompt, /DeepSeek V4 Pro calibration/);
  assert.match(prompt, /policy: risk-based/);
});

test("buildDeepworkPrompt renders the configured mode name", () => {
  const prompt = buildDeepworkPrompt({ ...DEFAULT_DSMM_SETTINGS, modeName: "dw" });

  assert.match(prompt, /`dw` mode/);
  assert.doesNotMatch(prompt, /`deepwork` mode is active/);
});

test("buildDeepworkPrompt renders effective workflow policy values", () => {
  const prompt = buildDeepworkPrompt({
    ...DEFAULT_DSMM_SETTINGS,
    workflow: {
      policy: "legacy",
      strictGates: false,
      reviewCap: 2,
      finalReviewPolicy: "reviewer-only"
    }
  });

  assert.match(prompt, /strictGates: false/);
  assert.match(prompt, /reviewCap: 2/);
  assert.match(prompt, /finalReviewPolicy: reviewer-only/);
});

test("buildDeepworkPrompt has no skill-body injection seam", () => {
  const prompt = buildDeepworkPrompt(DEFAULT_DSMM_SETTINGS);
  assert.match(prompt, /<\/dsmm-workflow-policy>$/u);
  assert.doesNotMatch(prompt, /<dsmm-skill|# Brainstorming/u);
});

test("exported prompt constants match asset intent", () => {
  assert.match(BASE_DEEPWORK_PROMPT, /DEEPWORK MODE ENABLED/);
  assert.match(BASE_DEEPWORK_PROMPT, /\{\{modeName\}\}/);
  assert.match(BASE_DEEPWORK_PROMPT, /brainstorming/);
  assert.match(BASE_DEEPWORK_PROMPT, /writing-plans/);
  assert.match(BASE_DEEPWORK_PROMPT, /subagent-driven-development/);
  assert.match(BASE_DEEPWORK_PROMPT, /dispatching-parallel-agents/);
  assert.match(BASE_DEEPWORK_PROMPT, /requesting-code-review/);
  assert.match(BASE_DEEPWORK_PROMPT, /receiving-code-review/);
  assert.match(BASE_DEEPWORK_PROMPT, /remove-ai-slops/);
  assert.match(BASE_DEEPWORK_PROMPT, /\[dsmm safety\]/);
  assert.match(BASE_DEEPWORK_PROMPT, /workflow\.policy=risk-based/);
  assert.match(buildDeepworkPrompt(DEFAULT_DSMM_SETTINGS), /policy: risk-based/);
  assert.doesNotMatch(buildDeepworkPrompt(DEFAULT_DSMM_SETTINGS), /reviewCap: 5/);
  assert.match(DEEPSEEK_V4_PRO_OVERLAY, /DeepSeek V4 Pro calibration/);
  assert.match(DEEPSEEK_V4_PRO_OVERLAY, /agent\/request/);
});

test("Flash overlay accepts only verified exact providers and preserves legacy policy when explicit", () => {
  for (const provider of ["deepseek-official", "deepseek-account"]) {
    assert.match(buildDeepworkPrompt(DEFAULT_DSMM_SETTINGS, { route: { provider, model: "deepseek-flash" } }), /DeepSeek-V41-Flash/u);
  }
  assert.doesNotMatch(buildDeepworkPrompt(DEFAULT_DSMM_SETTINGS, { route: { provider: "openrouter", model: "deepseek-flash" } }), /DeepSeek-V41-Flash/u);
  const legacy = buildDeepworkPrompt({ ...DEFAULT_DSMM_SETTINGS, workflow: { ...DEFAULT_DSMM_SETTINGS.workflow, policy: "legacy" } });
  assert.match(legacy, /strictGates: true/);
  assert.match(legacy, /reviewCap: 5/);
});
