import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentRequestFrame, DshContext, DshLlmCallConfig, DshLlmRuntime } from "../lib/dsh-types.js";
import { registerModelRouting } from "../lib/model-routing.js";
import { resolveConfig } from "../lib/settings.js";
import { DeepworkModeController } from "../lib/state.js";

test("auxiliary Host routing installs without an injectable LLM and resolves the requesting Agent's realm", async () => {
  let request: ((frame: AgentRequestFrame, next: () => Promise<DshLlmCallConfig>) => Promise<DshLlmCallConfig>) | undefined;
  let queried = 0;
  const root: DshContext = {
    get() { return undefined; },
    inject() { assert.fail("Host injection cannot see the Agent-realm LLM"); },
    on(event, listener) { if (event === "agent/request") request = listener as typeof request; }
  };
  const llm: DshLlmRuntime = {
    async resolveModelInfo(provider, model) {
      queried++;
      return { provider, id: model, name: "DeepSeek-V41-Flash", reasoning: { efforts: ["off", "low", "high", "max"].map((id) => ({ id, name: id })), defaultEffort: "high" } };
    }
  };
  const frame = {
    agent: { ctx: { get<T>(name: string) { return (name === "llm" ? llm : undefined) as T | undefined; } }, session: { header: { origin: "subagent" }, snapshotEvents() { return []; }, append() {} } },
    turn: 1, step: 1, signal: new AbortController().signal
  } satisfies AgentRequestFrame & { agent: { ctx: unknown } };
  registerModelRouting(root, new DeepworkModeController(root), () => resolveConfig({ defaultActive: true, deepseekFlashDefaultReasoningEffort: "low" }));
  assert.ok(request);
  const call = { provider: "deepseek-account", model: "deepseek-flash", maxTokens: 4096 };
  assert.deepEqual(await request(frame, async () => call), { ...call, reasoningEffort: "low" });
  assert.equal(queried, 1);
  assert.equal((await request(frame, async () => ({ ...call, reasoningEffort: "off" }))).reasoningEffort, "off");
  assert.equal(queried, 1, "auto preserves explicit upstream effort without a capability lookup");
});
