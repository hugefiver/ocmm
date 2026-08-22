import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { BASE_DEEPWORK_PROMPT, DEEPSEEK_V4_PRO_OVERLAY, buildDeepworkPrompt, isDeepseekV4ProModel } from "../lib/prompts.js";
import { DEFAULT_DSMM_SETTINGS } from "../lib/settings.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("prompt assets exist and contain activation boundaries", () => {
  const deepwork = readFileSync(join(packageRoot, "prompts", "deepwork.md"), "utf8");
  const v4 = readFileSync(join(packageRoot, "prompts", "deepseek-v4-pro.md"), "utf8");

  assert.match(deepwork, /DEEPWORK MODE ENABLED!/);
  assert.match(deepwork, /\{\{modeName\}\}/);
  assert.match(deepwork, /opt-in boundary/i);
  assert.match(deepwork, /Intent routing/);
  assert.match(deepwork, /Workflow gates/);
  assert.match(deepwork, /Tool discipline/);
  assert.match(v4, /DeepSeek V4 Pro calibration/);
  assert.match(v4, /reasoning_effort/);
});

test("isDeepseekV4ProModel detects common model identifiers", () => {
  assert.equal(isDeepseekV4ProModel({ id: "deepseek-v4-pro" }), true);
  assert.equal(isDeepseekV4ProModel({ name: "DeepSeek V4 Pro" }), true);
  assert.equal(isDeepseekV4ProModel({ id: "deepseek_v4_pro" }), true);
  assert.equal(isDeepseekV4ProModel({ id: "deepseek-v4-flash" }), false);
  assert.equal(isDeepseekV4ProModel({ id: "gpt-5.6", name: "DeepSeek Chat" }), false);
  assert.equal(isDeepseekV4ProModel(), false);
});

test("buildDeepworkPrompt applies overlay only when enabled for DeepSeek V4 Pro", () => {
  const enabled = buildDeepworkPrompt(DEFAULT_DSMM_SETTINGS, { id: "deepseek-v4-pro" });
  const strict = buildDeepworkPrompt({ ...DEFAULT_DSMM_SETTINGS, deepseekV4ProCalibration: "strict" }, { id: "deepseek-v4-pro" });
  const disabled = buildDeepworkPrompt({ ...DEFAULT_DSMM_SETTINGS, deepseekV4ProCalibration: "off" }, { id: "deepseek-v4-pro" });
  const nonDeepseek = buildDeepworkPrompt(DEFAULT_DSMM_SETTINGS, { id: "gpt-5.6" });

  assert.match(enabled, /DeepSeek V4 Pro calibration/);
  assert.match(strict, /DeepSeek V4 Pro calibration/);
  assert.doesNotMatch(disabled, /DeepSeek V4 Pro calibration/);
  assert.doesNotMatch(nonDeepseek, /DeepSeek V4 Pro calibration/);
});

test("buildDeepworkPrompt accepts composition section override", () => {
  const prompt = buildDeepworkPrompt(DEFAULT_DSMM_SETTINGS, { id: "deepseek-v4-pro" }, "Custom dsmm section for {{modeName}}");

  assert.match(prompt, /Custom dsmm section for deepwork/);
  assert.doesNotMatch(prompt, /DEEPWORK MODE ENABLED/);
  assert.match(prompt, /DeepSeek V4 Pro calibration/);
});

test("buildDeepworkPrompt renders the configured mode name", () => {
  const prompt = buildDeepworkPrompt({ ...DEFAULT_DSMM_SETTINGS, modeName: "dw" });

  assert.match(prompt, /`dw` mode/);
  assert.doesNotMatch(prompt, /`deepwork` mode is active/);
});

test("exported prompt constants match asset intent", () => {
  assert.match(BASE_DEEPWORK_PROMPT, /DEEPWORK MODE ENABLED/);
  assert.match(BASE_DEEPWORK_PROMPT, /\{\{modeName\}\}/);
  assert.match(DEEPSEEK_V4_PRO_OVERLAY, /DeepSeek V4 Pro calibration/);
  assert.match(DEEPSEEK_V4_PRO_OVERLAY, /reasoning_effort/);
});
