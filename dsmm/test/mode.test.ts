import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshSystemPromptSection } from "../lib/dsh-types.js";
import { apply } from "../lib/index.js";
import { registerDeepworkPrompt } from "../lib/mode.js";
import { DEFAULT_DSMM_SETTINGS, resolveConfig } from "../lib/settings.js";
import { DSMM_SKILL_NAMES } from "../lib/skills.js";
import { DEEPWORK_MODE_EVENT, DeepworkModeController } from "../lib/state.js";

test("registerDeepworkPrompt contributes text when deepwork is active or a DSMM preset is selected", () => {
  const sections: DshSystemPromptSection[] = [];
  const ctx = { systemPrompt: { section: (section: DshSystemPromptSection) => sections.push(section) } };
  const controller = new DeepworkModeController(ctx);

  registerDeepworkPrompt(ctx, controller, () => DEFAULT_DSMM_SETTINGS);

  assert.equal(sections[0]?.name, "dsmm:deepwork");
  assert.equal(sections[0]?.order, 50);
  const inactive = sections[0]?.text({ agent: { session: { events: [], append() {} } } }) ?? "";
  assert.equal(inactive, "");
  assert.doesNotMatch(inactive, /<dsmm-skill name="/u);
  assert.match(sections[0]?.text({
    agent: {
      options: { provider: "deepseek-official", model: "deepseek-v4-pro" },
      session: { events: [{ type: DEEPWORK_MODE_EVENT, data: { active: true } }], append() {} }
    }
  }) ?? "", /DeepSeek V4 Pro calibration/);

  const inactiveReviewer = sections[0]?.text({
    agent: {
      options: { provider: "deepseek-official", model: "deepseek-v4-pro" },
      session: { events: [{ type: "agent-preset/selected", data: { agentPreset: "dsmm-reviewer" } }], append() {} }
    }
  }) ?? "";
  assert.match(inactiveReviewer, /DEEPWORK MODE ENABLED!/u);
  assert.match(inactiveReviewer, /DeepSeek V4 Pro calibration/u);
  assert.match(inactiveReviewer, /effectiveDesiredReasoningEffort: max/u);
  assert.doesNotMatch(inactiveReviewer, /<dsmm-skill name=/u);
  const inactiveNonDsmm = sections[0]?.text({
    agent: {
      options: { provider: "deepseek-official", model: "deepseek-v4-pro" },
      session: { events: [{ type: "agent-preset/selected", data: { agentPreset: "standard" } }], append() {} }
    }
  }) ?? "";
  assert.equal(inactiveNonDsmm, "");
});

test("registerDeepworkPrompt builds a route only from string provider and model options", () => {
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

  assert.doesNotMatch(prompt, /DeepSeek V4 Pro calibration/);
});

test("generic active deepwork emits each enabled skill body exactly once", () => {
  const sections: DshSystemPromptSection[] = [];
  const ctx = { systemPrompt: { section: (section: DshSystemPromptSection) => sections.push(section) } };
  const controller = new DeepworkModeController(ctx);
  const settings = resolveConfig({ skills: { "remove-ai-slops": false } });
  const sentinels = {
    brainstorming: "Use this skill in dsmm deepwork mode before implementing new behavior.",
    "writing-plans": "Write a plan before multi-step implementation in dsmm deepwork mode.",
    "requesting-code-review": "Before declaring dsmm implementation complete, collect the current diff, tests, diagnostics, and user-visible verification evidence. Ask the selected reviewer to check the implementation against the requested behavior and reject stale or conditional verdicts.",
    "receiving-code-review": "Treat review feedback as claims to verify, not commands to obey blindly.",
    "subagent-driven-development": "Use this skill after an approved implementation plan exists.",
    "dispatching-parallel-agents": "Use this skill only when parallel work is genuinely independent.",
    "remove-ai-slops": "Use this skill when asked to clean AI-generated or low-quality patterns from existing code."
  } as const;

  registerDeepworkPrompt(ctx, controller, () => settings);
  const prompt = sections[0]?.text({
    agent: { session: { events: [{ type: DEEPWORK_MODE_EVENT, data: { active: true } }], append() {} } }
  }) ?? "";

  for (const skill of DSMM_SKILL_NAMES.filter((name) => name !== "remove-ai-slops")) {
    assert.equal((prompt.match(new RegExp(`<dsmm-skill name="${skill}">`, "gu")) ?? []).length, 1, `${skill} opening tag`);
    assert.equal((prompt.match(new RegExp(`</dsmm-skill>`, "gu")) ?? []).length, 6);
    assert.match(prompt, new RegExp(sentinels[skill].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.doesNotMatch(prompt, /<dsmm-skill name="remove-ai-slops">/u);
  assert.doesNotMatch(prompt, new RegExp(sentinels["remove-ai-slops"].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
});

test("active dsmm role preset omits skill bodies using newest valid selection", () => {
  const sections: DshSystemPromptSection[] = [];
  const ctx = { systemPrompt: { section: (section: DshSystemPromptSection) => sections.push(section) } };
  const controller = new DeepworkModeController(ctx);

  registerDeepworkPrompt(ctx, controller, () => DEFAULT_DSMM_SETTINGS);
  const prompt = sections[0]?.text({
    agent: {
      session: {
        header: { agentPreset: "standard" },
        events: [
          { type: DEEPWORK_MODE_EVENT, data: { active: true } },
          { type: "agent-preset/selected", data: { agentPreset: "standard" } },
          { type: "agent-preset/selected", data: { agentPreset: "dsmm-reviewer" } },
          { type: "agent-preset/selected", data: { agentPreset: 3 } }
        ],
        append() {}
      }
    }
  }) ?? "";

  assert.match(prompt, /DEEPWORK MODE ENABLED!/u);
  assert.doesNotMatch(prompt, /<dsmm-skill name="/u);
});

test("apply registers the deepwork prompt section on a direct settings-ready context", () => {
  const sections: DshSystemPromptSection[] = [];

  apply({
    settings: { register<T>() { return { get: () => ({ ...DEFAULT_DSMM_SETTINGS, promptOrder: 77 }) as T }; } },
    systemPrompt: { section(section) { sections.push(section); } }
  });

  assert.deepEqual(sections.map((section) => ({ name: section.name, order: section.order })), [{ name: "dsmm:deepwork", order: 77 }]);
});

test("apply does not register bundled skills with the root registry", () => {
  const registered: unknown[] = [];

  apply({
    skills: { register(skill) { registered.push(skill); } },
    systemPrompt: { section() {} }
  });

  assert.deepEqual(registered, []);
});
