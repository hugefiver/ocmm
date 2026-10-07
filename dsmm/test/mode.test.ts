import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshAgent, DshContext, DshSystemPromptSection } from "../lib/dsh-types.js";
import { apply } from "../lib/index.js";
import { registerDeepworkPrompt } from "../lib/mode.js";
import { DEFAULT_DSMM_SETTINGS, resolveConfig } from "../lib/settings.js";
import { DeepworkModeController } from "../lib/state.js";

function fixture(settings = DEFAULT_DSMM_SETTINGS) {
  const sections: DshSystemPromptSection[] = [], agents: DshAgent[] = [];
  const services = { systemPrompt: { section(section: DshSystemPromptSection) { sections.push(section); return () => {}; } },
    agents: { list: () => agents } };
  const ctx: DshContext = { get(name) { return Reflect.get(services, name); } };
  registerDeepworkPrompt(ctx, new DeepworkModeController(ctx), () => settings);
  return { sections, render(agent?: DshAgent) { if (agent !== undefined && !agents.includes(agent)) agents.push(agent); return sections[0].text({ scope: agent }); } };
}
const session = (active?: boolean, preset?: string): DshAgent["session"] => ({
  header: { agentPreset: preset }, events: active === undefined ? [] : [{ type: "deepwork/mode", data: { active } }], append() {}
});

test("native scope is required; ordinary on and role default on contribute common but explicit off wins", () => {
  const f = fixture();
  assert.equal(f.sections[0].name, "dsmm:deepwork"); assert.equal(f.sections[0].order, 50);
  assert.equal(f.render(), ""); assert.equal(f.render({ session: session() }), "");
  assert.match(f.render({ session: session(true), options: { provider: "deepseek-official", model: "deepseek-v4-pro" } }), /DeepSeek V4 Pro calibration/);
  const role = f.render({ session: session(undefined, "dsmm-reviewer"), options: { provider: "deepseek-official", model: "deepseek-v4-pro" } });
  assert.match(role, /DEEPWORK MODE ENABLED!/); assert.match(role, /effectiveDesiredReasoningEffort: max/);
  assert.equal(f.render({ session: session(false, "dsmm-reviewer") }), "");
  assert.equal(f.render({ session: session(undefined, "standard") }), "");
});

test("calibration follows committed header; malformed headers never fall back to stale options", () => {
  const f = fixture();
  const render = (header: unknown, options = { provider: "deepseek-official", model: "deepseek-v4-pro" }) => f.render({ options,
    session: { ...session(true), requestHeader: () => header as ReturnType<NonNullable<DshAgent["session"]["requestHeader"]>> } });
  assert.match(render({ config: { provider: "deepseek-official", model: "deepseek-flash" } }), /<dsmm-deepseek-flash-calibration>/);
  assert.doesNotMatch(render({ config: { provider: "openai", model: "gpt-5.6" } }), /<dsmm-deepseek-(?:flash|v4-pro)-calibration>/);
  for (const malformed of [{}, { config: {} }, { config: { provider: 42, model: "deepseek-flash" } }]) {
    assert.doesNotMatch(render(malformed), /<dsmm-deepseek-(?:flash|v4-pro)-calibration>/);
  }
  assert.match(render(undefined), /<dsmm-deepseek-v4-pro-calibration>/);
  assert.doesNotMatch(f.render({ session: session(true), options: { model: "deepseek-v4-pro" } }), /DeepSeek V4 Pro calibration/);
});

test("ordinary and role active common never contain any bundled body", () => {
  const f = fixture(resolveConfig({ skills: { "remove-ai-slops": false } }));
  for (const preset of ["standard", "dsmm-reviewer"]) {
    const prompt = f.render({ session: session(true, preset) });
    assert.match(prompt, /DEEPWORK MODE ENABLED!/);
    assert.doesNotMatch(prompt, /<dsmm-skill|# Brainstorming|# Writing Plans|# Requesting Code Review|# Receiving Code Review|# Subagent-Driven Development|# Dispatching Parallel Agents|# Remove AI Slops|# Debugging/);
  }
});

test("newest valid selection is authoritative without changing explicit intent", () => {
  const f = fixture();
  const agent: DshAgent = { session: { ...session(), events: [
    { type: "agent-preset/selected", data: { agentPreset: "standard" } },
    { type: "agent-preset/selected", data: { agentPreset: "dsmm-reviewer" } },
    { type: "agent-preset/selected", data: { agentPreset: 3 } }
  ] } };
  assert.match(f.render(agent), /DEEPWORK MODE ENABLED!/);
  agent.session.events = [...agent.session.events!, { type: "deepwork/mode", data: { active: false } }];
  assert.equal(f.render(agent), "");
});

test("apply consumes Loader Config immediately, never a fake settings.register service", () => {
  const sections: DshSystemPromptSection[] = [];
  apply({ systemPrompt: { section(section) { sections.push(section); return () => {}; } } }, { promptOrder: 77 });
  assert.deepEqual(sections.map(({ name, order }) => ({ name, order })), [{ name: "dsmm:deepwork", order: 77 }]);
});
