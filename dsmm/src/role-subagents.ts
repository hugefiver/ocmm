import { getTraceable, symbols } from "@deepseek-ai/cordis";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { ToolRuntime, ToolDefinition, ToolExecutionResult } from "@deepseek-ai/dsh-tools";
import { SubagentError } from "@deepseek-ai/dsh-subagent";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import type { SubagentStartRequest } from "@deepseek-ai/dsh-subagent";
import type { DshAgent, DshContext } from "./dsh-types.js";
import { DSMM_ROLES } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import { isDsmmRoleId } from "./roles.js";
import { DsmmRolePolicy, roleToolName } from "./role-policy.js";
import { roleProviderName } from "./role-providers.js";
import { capturedOriginalRoleInvocation, duringRoleInvocation, invocationAgentOptions, invocationView, resolveRoleInvocation } from "./role-invocation.js";
import { childOwnedSessionEvents } from "./session-scope.js";
import { agentForScope, nativeAgentContext, scopeParentOf } from "./native-scope.js";
import type { DsmmSettings, DsmmSettingsGetter, DsmmInvocationOptions, DsmmProfileAdmission, DsmmModelRoute } from "./settings.js";
import type { DeepworkModeController } from "./state.js";
import { roleRouteRuntimeState } from "./role-routing.js";
import type { DsmmInvocationView } from "./profile-types.js";
import type { ResolvedRoleInvocation } from "./role-invocation.js";
import type { RoleRunRegistry } from "./role-runs.js";

const hostControls = ["send_message", "interrupt_agent", "exit_plan_mode", "ask_user_question", "todo_write", "job_output", "job_list", "job_kill"];
// Agent-owned policy realms survive a bundle reinstall; do not register another
// identity prompt/tools layer on the same retained live Agent.
const admittedRealms = new WeakSet<DshAgent>();
const callableDefinitions = new WeakMap<ToolDefinition, { entry: DsmmCallableEntry; providers: ReadonlyMap<DsmmRoleId, object | undefined> }>();

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

/** C's same-run holder/live projection can read the actual lock without reapplying defaults. */
export function roleInvocationView(invocation: ResolvedRoleInvocation, label: string, mode: DsmmInvocationView["mode"], getSettings: DsmmSettingsGetter,
  child?: DshAgent, ids: Pick<DsmmInvocationView, "runId" | "childId" | "jobId"> = {}) {
  return roleInvocationObservation(invocation, label, mode, getSettings, child, ids).view;
}

/** Initial preflight/lock is not an observed SDK request; keep E's distinction truthful. */
export function roleInvocationObservation(invocation: ResolvedRoleInvocation, label: string, mode: DsmmInvocationView["mode"], getSettings: DsmmSettingsGetter,
  child?: DshAgent, ids: Pick<DsmmInvocationView, "runId" | "childId" | "jobId"> = {}): { view: DsmmInvocationView; routeKind: "initial" | "actual" } {
  const view = invocationView(invocation, label, mode, ids);
  if (child === undefined) return { view, routeKind: "initial" };
  const actual = latestOwnRoleRoute(child);
  if (actual.status === "known") return { view: { ...view, route: actual.route }, routeKind: "actual" };
  const route = roleRouteRuntimeState(child, getSettings(child), invocation.target, getSettings.admission?.(child).epoch).route;
  return { view: route === undefined ? view : { ...view, route: { ...route } }, routeKind: "initial" };
}

export type DsmmInitialRoleRoute =
  | { readonly status: "known"; readonly source: "invocation-capture"; readonly route: Readonly<DsmmModelRoute> }
  | { readonly status: "unknown"; readonly reason: "missing-invocation-capture" };
export type DsmmLiveRoleRoute =
  | { readonly status: "known"; readonly source: "own-native-request-header"; readonly route: Readonly<DsmmModelRoute> }
  | { readonly status: "unknown"; readonly reason: "no-own-request-header" | "invalid-own-request-header" };
export interface DsmmRoleRouteComparison {
  readonly childId: string;
  readonly initialRoute: DsmmInitialRoleRoute;
  readonly liveRoute: DsmmLiveRoleRoute;
}

function latestOwnRoleRoute(child: DshAgent): DsmmLiveRoleRoute {
  const own = childOwnedSessionEvents(child.session);
  for (let index = own.length - 1; index >= 0; index--) {
    const event = own[index];
    if (event.type !== "request/header") continue;
    const config = (event.data as { header?: { config?: Partial<DsmmModelRoute> } } | undefined)?.header?.config;
    if (typeof config?.provider !== "string" || typeof config.model !== "string"
      || config.reasoningEffort !== undefined && typeof config.reasoningEffort !== "string") {
      return { status: "unknown", reason: "invalid-own-request-header" };
    }
    return { status: "known", source: "own-native-request-header", route: Object.freeze({ provider: config.provider, model: config.model,
      ...(config.reasoningEffort === undefined ? {} : { reasoningEffort: config.reasoningEffort }) }) };
  }
  return { status: "unknown", reason: "no-own-request-header" };
}

/** Both observations belong to this exact native Agent; no parent/settings/route-lock fallback. */
export function roleRouteComparison(child: Agent): DsmmRoleRouteComparison {
  const agent = child as unknown as DshAgent;
  const invocation = capturedOriginalRoleInvocation(agent);
  return { childId: child.id, initialRoute: invocation === undefined ? { status: "unknown", reason: "missing-invocation-capture" }
    : { status: "known", source: "invocation-capture", route: Object.freeze({ ...invocation.initialRoute }) }, liveRoute: latestOwnRoleRoute(agent) };
}

export interface DsmmRoleRunCapture {
  readonly invocation: ResolvedRoleInvocation;
  readonly admission: DsmmProfileAdmission;
}
/** Created on the parent's stable Host scope, never per profile entry or tool call. */
export interface DsmmRoleRunsBinding {
  readonly registry: RoleRunRegistry<DsmmRoleRunCapture, DsmmInvocationView>;
  readonly owner: object;
}

export interface DsmmCallableEntry { name: string; kind: "role" | "category"; targets: readonly DsmmRoleId[]; targetParameter?: "role" | "category" }
/** Shared by runtime registration and the prompt assembler; empty groups have no callable entry. */
export function callableRoleInventory(settings: DsmmSettings, targets: readonly DsmmRoleId[]): readonly DsmmCallableEntry[] {
  const admitted = targets.filter(id => id !== "dsmm-orchestrator" && settings.roles[id]);
  const roleTargets = admitted.filter(id => DSMM_ROLES.find(row => row.id === id)?.kind === "role");
  const categories = admitted.filter(id => DSMM_ROLES.find(row => row.id === id)?.kind === "category");
  return [
    ...settings.subagents.toolTopology === "per-role" ? roleTargets.map(id => ({ name: roleToolName(id), kind: "role" as const, targets: [id] }))
      : roleTargets.length === 0 ? [] : [{ name: "dsmm_role", kind: "role" as const, targets: roleTargets, targetParameter: "role" as const }],
    ...categories.length === 0 ? [] : [{ name: "dsmm_category", kind: "category" as const, targets: categories, targetParameter: "category" as const }]
  ];
}

/** Exact currently exposed definitions, suitable for E's runtime guidance and safe capability views. */
export function admittedCallableRoleInventory(agent: DshAgent, settings: DsmmSettings, policy: DsmmRolePolicy, tools: ToolRuntime): readonly DsmmCallableEntry[] {
  const allowed = new Set(policy.targets(agent)), providers = nativeAgentContext(agent).get("subagents");
  return tools.schemas(agent as unknown as Agent).flatMap(schema => {
    const definition = tools.get(schema.name, agent as unknown as Agent), registered = definition === undefined ? undefined : callableDefinitions.get(definition);
    if (registered === undefined || policy.toolDenial(agent, schema.name, tools) !== undefined) return [];
    const targets = registered.entry.targets.filter(target => allowed.has(target) && settings.roles[target]
      && providers?.getProvider(roleProviderName(target)) === registered.providers.get(target)
      && providers?.getProvider(roleProviderName(target))?.capabilities.depthLimit === true);
    return targets.length === 0 ? [] : [{ ...registered.entry, targets }];
  });
}

function registerRoleTool(agent: DshAgent, agentCtx: Context, tools: ToolRuntime, entry: DsmmCallableEntry, getSettings: DsmmSettingsGetter, policy: DsmmRolePolicy, roleRuns?: DsmmRoleRunsBinding): () => void {
  const settings = getSettings(agent);
  const subagents = agentCtx.get("subagents");
  if (subagents === undefined) throw new Error("DSMM role tools require native subagents");
  const background = settings.subagents.enableRunInBackground;
  const continuable = settings.subagents.backgroundMode === "continuable";
  const admittedProviders = new Map(entry.targets.map(target => [target, subagents.getProvider(roleProviderName(target))]));
  const definition = defineTool({
    name: entry.name, description: `Delegate a bounded ${entry.kind} task through the native runtime. ${background ? continuable ? "Background continuable is opt-in here; returns a durable child id for native send_message/interrupt_agent. Set run_in_background false to wait." : "Waits by default; explicit background work is owned by native jobs." : "Waits for the child's useful result. Background execution is disabled."}`,
    parameters: { description: { type: "string", required: true }, prompt: { type: "string", required: true },
      ...(entry.targetParameter === undefined ? {} : { [entry.targetParameter]: { type: "string" as const, enum: entry.targets, required: true as const } }),
      level: { type: "string", enum: ["normal", "low", "high", "max"] },
      ...(settings.subagents.allowRouteOverride ? { route: { oneOf: [
        { type: "object" as const, additionalProperties: false, properties: { reasoningEffort: { type: "string" as const, required: true as const } } },
        { type: "object" as const, additionalProperties: false, properties: { provider: { type: "string" as const, required: true as const }, model: { type: "string" as const, required: true as const }, reasoningEffort: { type: "string" as const } } }
      ] as const } } : {}),
      ...(background ? { run_in_background: { type: "boolean" as const } } : {}) },
    output: { schema: { type: "json" }, render(_args, value) {
      const result = value as unknown as { kind: string; subagentId?: string; jobId?: string; invocation?: { role: string; level: string; route?: { provider: string; model: string; reasoningEffort?: string } }; output?: ContentBlock[] };
      const invocation = result.invocation;
      const route = invocation?.route;
      const metadata = invocation === undefined ? "" : `${invocation.role} level=${invocation.level}${route === undefined ? "" : ` route=${route.provider}/${route.model}${route.reasoningEffort === undefined ? "" : ` effort=${route.reasoningEffort}`}`}`;
      return result.kind === "foreground" ? [{ type: "text", text: metadata }, ...result.output ?? []]
        : [{ type: "text", text: `${metadata}\n${result.kind === "continuable" ? `started subagent ${result.subagentId}` : `started background subagent job ${result.jobId}`}` }];
    }, presentationMeta(_args, value) { return typeof value === "object" && value !== null && !Array.isArray(value) ? value.invocation ?? null : null; } },
    async execute(args, exec): Promise<Extract<ToolExecutionResult, { isError: false }>["value"]> {
      const fields = ["description", "prompt", "level", ...entry.targetParameter === undefined ? [] : [entry.targetParameter],
        ...settings.subagents.allowRouteOverride ? ["route"] : [], ...background ? ["run_in_background"] : []];
      if (Object.keys(exec.arguments as Record<string, unknown>).some((key) => !fields.includes(key))) throw new SubagentError("DSMM delegation parameter is unsupported by this admitted tool", "UNSUPPORTED_CAPABILITY");
      const parent = exec.agent;
      if (parent === undefined) throw new SubagentError("DSMM delegation requires a calling Agent", "UNAUTHORIZED");
      if (parent !== (agent as unknown as Agent) || tools.get(entry.name, parent) === undefined || policy.toolDenial(agent, entry.name, tools) !== undefined) throw new SubagentError("DSMM tool is not the exact admitted caller definition", "UNAUTHORIZED");
      const target = entry.targetParameter === undefined ? entry.targets[0] : (exec.arguments as Record<string, unknown>)[entry.targetParameter];
      if (!isDsmmRoleId(target) || !entry.targets.includes(target) || DSMM_ROLES.find(row => row.id === target)!.kind !== entry.kind) throw new SubagentError("DSMM target is unknown, cross-kind or not admitted", "UNAUTHORIZED");
      const role = DSMM_ROLES.find(row => row.id === target)!;
      const admitted = policy.assertDelegation(parent as unknown as DshAgent, role.id);
      const current = getSettings(parent as unknown as DshAgent);
      const provider = subagents.getProvider(roleProviderName(role.id));
      if (provider === undefined || provider !== admittedProviders.get(role.id)) throw new SubagentError("DSMM exact admitted role provider is unavailable", "NO_PROVIDER");
      const invocation = await resolveRoleInvocation(parent, role.id, current, exec.signal, { ...(args.level === undefined ? {} : { level: args.level }), ...(args.route === undefined ? {} : { route: args.route }) } as DsmmInvocationOptions);
      const capturedProvider = provider;
      const request: Omit<SubagentStartRequest, "signal"> = { parent, label: args.description, prompt: [{ type: "text", text: args.prompt }],
        persona: role.persona, agentOptions: invocationAgentOptions(invocation), maxDepth: subagents.resolveMaxDepth(current.subagents.maxDepth) };
      const assertCurrent = (): void => {
        if (policy.assertDelegation(parent as unknown as DshAgent, role.id).epoch !== admitted.epoch) throw new SubagentError("DSMM parent admission changed before delegation", "UNAUTHORIZED");
        if (subagents.getProvider(roleProviderName(role.id)) !== capturedProvider) throw new SubagentError("DSMM exact provider changed before delegation", "NO_PROVIDER");
      };
      exec.signal.throwIfAborted();
      const requestedBackground = background && (args.run_in_background ?? continuable);
      if (requestedBackground && continuable) {
        if (provider.prepareContinuable === undefined) throw new SubagentError("DSMM provider has no prepareContinuable capability", "UNSUPPORTED_CAPABILITY");
        assertCurrent();
        const child = await duringRoleInvocation(agent, invocation, () => policy.duringDelegation(parent as unknown as DshAgent, role.id, () => subagents.startContinuable({ provider: provider.name, label: args.description,
          request, signal: exec.signal }), request.toolFilter, request.maxDepth));
        return { kind: "continuable", subagentId: child.childId, invocation: { ...invocationView(invocation, args.description, "continuable", { childId: child.childId }) } };
      }
      assertCurrent();
      if (roleRuns === undefined) throw new SubagentError("DSMM one-shot delegation requires the stable Host role-run registry", "UNSUPPORTED_CAPABILITY");
      const admission = getSettings.admission?.(agent);
      if (admission === undefined || admission.epoch !== admitted.epoch) throw new SubagentError("DSMM one-shot capture requires the exact original parent admission", "UNAUTHORIZED");
      const jobs = agentCtx.get("jobs");
      if (requestedBackground && jobs === undefined) throw new SubagentError("DSMM background jobs require the native jobs registry/controller", "UNSUPPORTED_CAPABILITY");
      let child: DshAgent | undefined;
      const projection: DsmmInvocationView = { ...invocationView(invocation, args.description, "one-shot"), get route() {
        return roleInvocationView(invocation, args.description, "one-shot", getSettings, child).route;
      } };
      const holder = roleRuns.registry.start({ parent, owner: roleRuns.owner, sessionId: parent.id, toolCallId: exec.callId,
        admissionEpoch: admitted.epoch, capture: Object.freeze({ invocation, admission }), projection, label: args.description, callerAbort: exec.signal, jobs,
        async start(signal) {
          assertCurrent();
          const run = await duringRoleInvocation(agent, invocation, () => policy.duringDelegation(agent, role.id,
            () => subagents.start(provider.name, { ...request, signal }), request.toolFilter, request.maxDepth, agent => { child = agent; }));
          projection.runId = run.id;
          child ??= run.localAgent as unknown as DshAgent | undefined;
          if (child?.id !== undefined) projection.childId = child.id;
          return run;
        } });
      if (requestedBackground) {
        try {
          const identity = await holder.ready;
          const transition = holder.background({ parent, owner: roleRuns.owner, sessionId: parent.id, toolCallId: exec.callId,
            runId: identity.runId, expectedAdmissionEpoch: admitted.epoch });
          if (transition.status === "starting") throw new SubagentError("DSMM ready run is not transferable", "UNAUTHORIZED");
        } catch (error) {
          holder.cancel(error);
          const [drain] = await Promise.allSettled([holder.drained]);
          if (drain.status === "rejected" && drain.reason !== error) throw new AggregateError([error, drain.reason], "DSMM background handoff was refused and its owned run drain rejected");
          throw error;
        }
      }
      const held = await holder.foreground;
      if (held.kind === "background") projection.jobId = held.jobId;
      const { route, ...metadata } = projection;
      const view = { ...metadata, ...(route === undefined ? {} : { route: { ...route } }) };
      return held.kind === "foreground" ? { kind: held.kind, runId: held.runId, output: held.output as unknown as Extract<ToolExecutionResult, { isError: false }>["value"], invocation: view }
        : { kind: held.kind, runId: held.invocation.runId, jobId: held.jobId, invocation: view };
    }
  });
  callableDefinitions.set(definition, { entry: Object.freeze({ ...entry, targets: Object.freeze([...entry.targets]) }), providers: admittedProviders });
  const dispose = tools.register(definition);
  return () => { callableDefinitions.delete(definition); dispose(); };
}

/** Published name retained; all native/headless Agents consume one admitted policy. */
export async function registerHeadlessRoleTools(ctx: DshContext, controller: DeepworkModeController, getSettings: DsmmSettingsGetter, policy = new DsmmRolePolicy(ctx, getSettings, controller), roleRuns?: DsmmRoleRunsBinding): Promise<void> {
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
    state.guard = tools.guard((execution) => execution.agent === agent ? policy.toolDenial(agent, execution.name, tools, execution) : undefined);
    const forbidden = tools.schemas(agent).map((tool) => tool.name).filter((name) => name !== "run_code" && policy.toolDenial(agent, name) !== undefined
      && tools.get(name, parentScope) === tools.get(name, agent));
    if (forbidden.length > 0) state.restriction = tools.restrict({ deny: forbidden });
    else state.restriction = undefined;
    for (const definition of definitions) {
      if (definition !== undefined && tools.get(definition.name, agent) === undefined && policy.toolDenial(agent, definition.name) === undefined) state.owned.push(tools.register(definition));
    }
    const inventory = callableRoleInventory(settings, targets.filter(role => subagents?.getProvider(roleProviderName(role))?.capabilities.depthLimit === true));
    for (const entry of inventory) state.owned.push(registerRoleTool(agent, agentCtx, tools, entry, getSettings, policy, roleRuns));
    policy.captureTools(agent, tools, [...inventory.map(entry => entry.name), ...names], !sameRealm || !sameParent);
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
      const tools = states.get(agent)?.tools;
      const inventory = tools === undefined ? [] : admittedCallableRoleInventory(agent, getSettings(agent), policy, tools);
      return identity.role === undefined ? "" : `Native admitted role: ${identity.role}; ${identity.child ? "bounded child, not stage-owner" : "root"}. Admitted callable delegation: ${inventory.map(entry => `${entry.name}${entry.targetParameter === undefined ? "" : ` (${entry.targetParameter}: ${entry.targets.join(", ")})`}`).join("; ") || "none"}. level defaults to normal; low/high/max require this target's configured level. route is only available with admitted deployment opt-in. Role/host permissions remain in force when common is off. Read-only plans are complete Markdown for native review and authorized coordinator persistence, never planner writes.`;
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
