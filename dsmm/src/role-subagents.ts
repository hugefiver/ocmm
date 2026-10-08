import { getTraceable, symbols } from "@deepseek-ai/cordis";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { ToolRuntime, ToolDefinition, ToolExecutionResult } from "@deepseek-ai/dsh-tools";
import { settleRun, SubagentError } from "@deepseek-ai/dsh-subagent";
import type { SubagentRun, SubagentStartRequest } from "@deepseek-ai/dsh-subagent";
import type { DshAgent, DshContext } from "./dsh-types.js";
import { DSMM_ROLES } from "./roles.js";
import type { DsmmRoleDefinition } from "./roles.js";
import { DsmmRolePolicy, roleToolName } from "./role-policy.js";
import { roleProviderName, roleAgentOptions } from "./role-providers.js";
import { agentForScope, nativeAgentContext, scopeParentOf } from "./native-scope.js";
import type { DsmmSettingsGetter } from "./settings.js";
import type { DeepworkModeController } from "./state.js";

const hostControls = ["send_message", "interrupt_agent", "exit_plan_mode", "ask_user_question", "todo_write", "job_output", "job_list", "job_kill"];
// Agent-owned policy realms survive a bundle reinstall; do not register another
// identity prompt/tools layer on the same retained live Agent.
const admittedRealms = new WeakSet<DshAgent>();

/** Keep native controls on the frozen startup substrate, not desired-save reconciliation. */
export async function registerNativeSubagentControls(ctx: Context): Promise<void> {
  const tools = ctx.get("tools");
  if (tools === undefined || ctx.get("subagents") === undefined) return;
  if (tools.get("send_message") !== undefined && tools.get("interrupt_agent") !== undefined) return;
  const anchor = (ctx.get("profileContext") as { installAnchor?: string } | undefined)?.installAnchor;
  if (anchor === undefined) return;
  try {
    const plugin = await import(pathToFileURL(createRequire(anchor).resolve("@deepseek-ai/dsh-tool-subagent-control")).href);
    await ctx.plugin(plugin).await();
  } catch { ctx.logger.warn("DSMM native subagent controls unavailable; continuable control requires the installed host substrate"); }
}

async function foreground(run: SubagentRun) {
  const [execution] = await Promise.allSettled([run.result.then((result) => {
    if (result.stopReason !== "completed") {
      const partial = result.output.filter((block) => block.type === "text").map((block) => block.text).join("");
      throw new SubagentError(`subagent ${result.stopReason}${result.diagnostic === undefined ? "" : `: ${result.diagnostic}`}${partial === "" ? "" : `\nPartial output: ${partial}`}`, result.stopReason.toUpperCase());
    }
    // Native results are borrowed readonly JSON; the tool runtime owns lossless
    // materialization, so do not duplicate blocks to erase readonly typing.
    return { kind: "foreground" as const, runId: run.id, output: result.output as unknown as Extract<ToolExecutionResult, { isError: false }>["value"] };
  })]);
  const [disposal] = await Promise.allSettled([run.dispose()]);
  if (execution.status === "rejected") {
    if (disposal.status === "rejected") throw new AggregateError([execution.reason, disposal.reason], "DSMM subagent result and disposal failed");
    throw execution.reason;
  }
  if (disposal.status === "rejected") throw disposal.reason;
  return execution.value;
}

function registerRoleTool(agent: DshAgent, agentCtx: Context, tools: ToolRuntime, role: DsmmRoleDefinition, getSettings: DsmmSettingsGetter, policy: DsmmRolePolicy): () => void {
  const settings = getSettings(agent);
  const subagents = agentCtx.get("subagents");
  if (subagents === undefined) throw new Error("DSMM role tools require native subagents");
  const background = settings.subagents.enableRunInBackground;
  const continuable = settings.subagents.backgroundMode === "continuable";
  return tools.register(defineTool({
    name: roleToolName(role.id), description: `Delegate a bounded ${role.name} task through the native runtime. ${background ? continuable ? "Background continuable is opt-in here; returns a durable child id for native send_message/interrupt_agent. Set run_in_background false to wait." : "Waits by default; explicit background work is owned by native jobs." : "Waits for the child's useful result. Background execution is disabled."}`,
    parameters: { description: { type: "string", required: true }, prompt: { type: "string", required: true },
      ...(background ? { run_in_background: { type: "boolean" as const } } : {}) },
    output: { schema: { type: "json" }, render(_args, value) {
      const result = value as { kind: string; subagentId?: string; jobId?: string; output?: Array<{ type: string; text?: string }> };
      return [{ type: "text", text: result.kind === "continuable" ? `started subagent ${result.subagentId}` : result.kind === "background" ? `started background subagent job ${result.jobId}` : result.output?.filter((block) => block.type === "text").map((block) => block.text).join("") ?? "" }];
    } },
    async execute(args, exec): Promise<Extract<ToolExecutionResult, { isError: false }>["value"]> {
      const fields = background ? ["description", "prompt", "run_in_background"] : ["description", "prompt"];
      if (Object.keys(exec.arguments as Record<string, unknown>).some((key) => !fields.includes(key))) throw new SubagentError("DSMM delegation parameter is unsupported by this admitted tool", "UNSUPPORTED_CAPABILITY");
      const parent = exec.agent;
      if (parent === undefined) throw new SubagentError("DSMM delegation requires a calling Agent", "UNAUTHORIZED");
      const admitted = policy.assertDelegation(parent as unknown as DshAgent, role.id);
      const current = getSettings(parent as unknown as DshAgent);
      const provider = subagents.getProvider(roleProviderName(role.id));
      if (provider === undefined) throw new SubagentError("DSMM role provider is unavailable", "NO_PROVIDER");
      const request: Omit<SubagentStartRequest, "signal"> = { parent, label: args.description, prompt: [{ type: "text", text: args.prompt }],
        persona: role.persona, maxDepth: subagents.resolveMaxDepth(current.subagents.maxDepth) };
      const assertCurrent = (): void => {
        if (policy.assertDelegation(parent as unknown as DshAgent, role.id).epoch !== admitted.epoch) throw new SubagentError("DSMM parent admission changed before delegation", "UNAUTHORIZED");
      };
      exec.signal.throwIfAborted();
      if (background && (args.run_in_background ?? continuable)) {
        if (continuable) {
          if (provider.prepareContinuable === undefined) throw new SubagentError("DSMM provider has no prepareContinuable capability", "UNSUPPORTED_CAPABILITY");
          const agentOptions = await roleAgentOptions(parent, role.id, current, exec.signal);
          assertCurrent();
          const child = await policy.duringDelegation(parent as unknown as DshAgent, role.id, () => subagents.startContinuable({ provider: provider.name, label: args.description,
            request: { ...request, ...(agentOptions === undefined ? {} : { agentOptions }) }, signal: exec.signal }), request.toolFilter);
          return { kind: "continuable", subagentId: child.childId };
        }
        const jobs = agentCtx.get("jobs");
        if (jobs === undefined) throw new SubagentError("DSMM background jobs require the native jobs registry/controller", "UNSUPPORTED_CAPABILITY");
        return { kind: "background", jobId: jobs.start({ kind: "subagent", owner: parent.id, label: args.description, run() {
          const cancel = new AbortController();
          const started = Promise.resolve().then(() => { assertCurrent(); return subagents.start(provider.name, { ...request, signal: cancel.signal }); });
          return { cancel(reason) { cancel.abort(reason); }, done: started.then(settleRun, (error) => ({ status: cancel.signal.aborted ? "killed" as const : "failed" as const, detail: String(error) })) };
        } }) };
      }
      assertCurrent();
      return foreground(await subagents.start(provider.name, { ...request, signal: exec.signal }));
    }
  }));
}

/** Published name retained; all native/headless Agents consume one admitted policy. */
export async function registerHeadlessRoleTools(ctx: DshContext, controller: DeepworkModeController, getSettings: DsmmSettingsGetter, policy = new DsmmRolePolicy(ctx, getSettings, controller)): Promise<void> {
  type State = { tools?: ToolRuntime; parentScope?: object; owned: Array<() => void>; restriction?: () => void; guard?: () => void; signature?: string; hostDefinitions: Array<ToolDefinition | undefined> };
  const states = new WeakMap<DshAgent, State>();
  const reconcile = async (agent: DshAgent): Promise<void> => {
    const state = states.get(agent);
    if (state === undefined) return;
    const agentCtx = nativeAgentContext(agent);
    const raw = agentCtx.get("agentPresets")?.serviceFor({ ctx: agentCtx }, "tools");
    const tools = raw === undefined ? agentCtx.get("tools") : getTraceable(agentCtx, raw) as ToolRuntime;
    if (tools === undefined) throw new Error("DSMM role tools require native guard/restrict services");
    const settings = getSettings(agent), identity = policy.identity(agent), targets = policy.targets(agent);
    const subagents = agentCtx.get("subagents");
    const host = ctx.get?.<ToolRuntime>("tools");
    const names = [...hostControls, ...host?.schemas().map((row) => row.name).filter((name) => name.startsWith(`mcp__${settings.lsp.serverName}__`)) ?? []];
    const definitions = names.map((name) => host?.get(name));
    const signature = JSON.stringify([identity.role, targets, settings.subagents, targets.map((role) => [settings.roleRouting[role], subagents?.getProvider(roleProviderName(role))?.capabilities])]);
    const sameRealm = state.tools !== undefined && (Reflect.get(state.tools, symbols.original) ?? state.tools) === (Reflect.get(tools, symbols.original) ?? tools);
    const parentScope = scopeParentOf(agent);
    const sameParent = state.parentScope === parentScope;
    if (sameRealm && sameParent && signature === state.signature && definitions.length === state.hostDefinitions.length && definitions.every((definition, i) => definition === state.hostDefinitions[i])) return;
    for (const dispose of state.owned.splice(0)) dispose();
    state.restriction?.(); state.guard?.();
    state.tools = tools;
    // rc.2 has no public filter for own-layer registrations. A native monotonic
    // guard fences their invocation and exact definition identity instead.
    state.guard = tools.guard((execution) => execution.agent === agent ? policy.toolDenial(agent, execution.name, tools) : undefined);
    const forbidden = tools.schemas(agent).map((tool) => tool.name).filter((name) => name !== "run_code" && policy.toolDenial(agent, name) !== undefined
      && tools.get(name, parentScope) === tools.get(name, agent));
    if (forbidden.length > 0) state.restriction = tools.restrict({ deny: forbidden });
    else state.restriction = undefined;
    for (const definition of definitions) {
      if (definition !== undefined && tools.get(definition.name, agent) === undefined && policy.toolDenial(agent, definition.name) === undefined) state.owned.push(tools.register(definition));
    }
    for (const role of DSMM_ROLES.filter((row) => targets.includes(row.id))) {
      if (subagents?.getProvider(roleProviderName(role.id))?.capabilities.depthLimit === true) state.owned.push(registerRoleTool(agent, agentCtx, tools, role, getSettings, policy));
    }
    policy.captureTools(agent, tools, [...targets.map(roleToolName), ...names], !sameRealm || !sameParent);
    state.signature = signature;
    state.hostDefinitions = definitions;
    state.parentScope = parentScope;
  };
  const onCreated = async ({ agent }: { agent: DshAgent }): Promise<void> => {
    if (states.has(agent) || admittedRealms.has(agent)) return;
    if (!getSettings(agent).modules.deepwork.enabled) return;
    const agentCtx = nativeAgentContext(agent);
    policy.admit(agent);
    states.set(agent, { owned: [], hostDefinitions: [] });
    policy.installDrain(agent);
    agentCtx.get("systemPrompt")!.section({ name: "dsmm:delegation-identity", order: 49, text() {
      const identity = policy.identity(agent);
      return identity.role === undefined ? "" : `Native admitted role: ${identity.role}; ${identity.child ? "bounded child, not stage-owner" : "root"}. Permitted child roles: ${policy.targets(agent).join(", ") || "none"}. Native same-layer registrations may remain displayed but forbidden calls are denied. Role/host permissions remain in force when common is off. Read-only plans are complete Markdown for native review and authorized coordinator persistence, never planner writes.`;
    } });
    agentCtx.effect(() => () => {
      const state = states.get(agent);
      state?.restriction?.(); state?.guard?.();
      for (const dispose of state?.owned ?? []) dispose();
      states.delete(agent);
    });
    await reconcile(agent);
    admittedRealms.add(agent);
    agentCtx.effect(() => () => admittedRealms.delete(agent));
  };
  ctx.on?.("agent/created", onCreated, { global: true });
  ctx.on?.("system-prompt/assemble", async (_assembly, options: { scope?: object }, next: () => Promise<unknown>) => {
    const agent = agentForScope(ctx, options.scope);
    if (agent !== undefined) await reconcile(agent);
    return next();
  }, { prepend: true, global: true });
  for (const agent of ctx.get?.<{ list(): DshAgent[] }>("agents")?.list() ?? []) await onCreated({ agent });
}
