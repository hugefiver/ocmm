import { writeFileSync } from "node:fs";

export const name = "dsmm-live-smoke-probe";

// Keep only test-owned metadata, never messages, reasoning, or credentials.
export function apply(ctx, config) {
  const profile = ctx.get("profileContext");
  const receipt = { requests: [], headers: [], assemblies: [], tools: [], errors: [], profile: { name: profile?.name, bundles: profile?.startedBundles } };
  const save = () => writeFileSync(config.receipt, JSON.stringify(receipt));
  ctx.on("system-prompt/assemble", async (assembly, context, next) => {
    const final = await next();
    receipt.assemblies.push({
      agent: context.agent?.id,
      dsmm: final.sections.some((section) => section.name === "dsmm:deepwork" && section.text.includes("DEEPWORK MODE ENABLED")),
      flash: final.sections.some((section) => section.text.includes("dsmm-deepseek-flash-calibration")),
      reviewer: final.sections.some((section) => section.text.includes("You are dsmm-reviewer")),
      roleTools: final.tools.filter((tool) => tool.name.startsWith("dsmm_")).map((tool) => tool.name),
      tools: final.tools.map((tool) => tool.name)
    });
    save();
    return final;
  }, { prepend: true });
  ctx.on("agent/request", async (frame, next) => {
    const call = await next();
    const llm = frame.agent.ctx?.get?.("llm") ?? ctx.get("llm");
    const modelInfo = await llm?.resolveModelInfo(call.provider, call.model, frame.signal);
    receipt.requests.push({ agent: frame.agent.id, turn: frame.turn, step: frame.step, provider: call.provider, model: call.model, effort: call.reasoningEffort, advertisedEfforts: modelInfo?.reasoning?.efforts.map((effort) => effort.id) });
    save();
    if (config.probeOnly) {
      receipt.probeStoppedBeforeModel = true;
      save();
      throw new Error("DSMM_SCHEMA_PROBE_COMPLETE");
    }
    return call;
  }, { prepend: true });
  ctx.on("tools/post-execute", async (execution, result, next) => {
    const decision = await next();
    receipt.tools.push({ name: execution.name, error: result.isError, decision: decision.kind });
    save();
    return decision;
  }, { prepend: true });
  ctx.on("agent/error", (frame) => {
    receipt.errors.push({ code: frame.error?.code, status: frame.error?.failure?.status });
    save();
  });
  ctx.on("session/event", (session, event) => {
    if (event.type !== "request/header") return;
    const call = event.data.header.config;
    receipt.headers.push({ agent: session.id, provider: call.provider, model: call.model, effort: call.reasoningEffort });
    save();
  });
  save();
}
