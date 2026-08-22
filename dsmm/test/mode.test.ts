import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshSystemPromptSection } from "../lib/dsh-types.js";
import { apply } from "../lib/index.js";
import { registerDeepworkPrompt } from "../lib/mode.js";
import { DEFAULT_DSMM_SETTINGS } from "../lib/settings.js";
import { DEEPWORK_MODE_EVENT, DeepworkModeController } from "../lib/state.js";

test("registerDeepworkPrompt contributes text only when deepwork is active", () => {
  const sections: DshSystemPromptSection[] = [];
  const ctx = { systemPrompt: { section: (section: DshSystemPromptSection) => sections.push(section) } };
  const controller = new DeepworkModeController(ctx);

  registerDeepworkPrompt(ctx, controller, () => DEFAULT_DSMM_SETTINGS);

  assert.equal(sections[0]?.name, "dsmm:deepwork");
  assert.equal(sections[0]?.order, 50);
  assert.equal(sections[0]?.text({ agent: { session: { events: [], append() {} } } }), "");
  assert.match(sections[0]?.text({
    agent: {
      options: { provider: "deepseek-official", model: "deepseek-v4-pro" },
      session: { events: [{ type: DEEPWORK_MODE_EVENT, data: { active: true } }], append() {} }
    }
  }) ?? "", /DeepSeek V4 Pro calibration/);
});

test("registerDeepworkPrompt reads model identity from agent options", () => {
  const sections: DshSystemPromptSection[] = [];
  const ctx = { systemPrompt: { section: (section: DshSystemPromptSection) => sections.push(section) } };
  const controller = new DeepworkModeController(ctx);

  registerDeepworkPrompt(ctx, controller, () => DEFAULT_DSMM_SETTINGS);

  const prompt = sections[0]?.text({
    agent: {
      options: { model: "deepseek-v4-pro" },
      session: { events: [{ type: DEEPWORK_MODE_EVENT, data: { active: true } }], append() {} }
    }
  }) ?? "";

  assert.match(prompt, /DeepSeek V4 Pro calibration/);
});

test("apply registers the deepwork prompt section", () => {
  const sectionNames: string[] = [];

  apply({
    settings: { register<T>() { return { get: () => DEFAULT_DSMM_SETTINGS as T }; } },
    systemPrompt: { section(section) { sectionNames.push(section.name); } }
  });

  assert.deepEqual(sectionNames, ["dsmm:deepwork"]);
});
