import { AsyncLocalStorage } from "node:async_hooks";
import { delegationDepthOf, foldSubagentDescriptor, SubagentError } from "@deepseek-ai/dsh-subagent";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { symbols } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import type { ToolRestriction, ToolRuntime, ToolDefinition, ToolExecution } from "@deepseek-ai/dsh-tools";
import type { DshAgent, DshContext, DshAgentsRegistry } from "./dsh-types.js";
import { DSMM_ROLE_IDS, DSMM_ROLES, allowedRoleChildren, isDsmmRoleId } from "./roles.js";
export { allowedRoleChildren } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmProfileAdmission, DsmmSettings, DsmmSettingsGetter } from "./settings.js";
import { copyJson, freezeSettings, isRootRoleEnabled } from "./settings.js";
import type { ChildAdmissionCompletion, ChildRoleAdmissionCandidate, ParentAdmissionTicket } from "./child-admission-contract.js";
import type { ChildAdmissionCapture, ChildAdmissionEvidence, PreparedChildAdmission } from "./child-capture.js";
import { admissionFromChildCapture, parseChildAdmissionCapture, parseLegacyChildEvidence } from "./child-capture.js";
import { createConservativeLegacyAdmission } from "./legacy-child-policy.js";
import type { LegacyCapabilityCollaborators } from "./legacy-child-policy.js";
export { createConservativeLegacyAdmission as conservativeLegacyAdmission } from "./legacy-child-policy.js";
import { bindRoleInvocation, currentRoleInvocation, resolveRoleInvocation } from "./role-invocation.js";
import type { ResolvedRoleInvocation } from "./role-invocation.js";
import { captureRoleRuntimePolicy, resolveRoleRuntimePolicy } from "./routing-policy.js";
import type { DeepworkModeController } from "./state.js";
import { childOwnedSessionEvents, resolveEffectiveDsmmRole, resolveSelectedAgentPreset } from "./session-scope.js";
import { resolvedModelParameterPolicy } from "./model-parameter-policy.js";
import { modelRouteFromCall, projectModelRouteParameters } from "./role-llm.js";
import { DsmmProfileError } from "./profiles.js";
import { scopeParentOf } from "./native-scope.js";

export interface DsmmRoleIdentity {
  readonly role?: DsmmRoleId;
  readonly child: boolean;
  readonly epoch: string;
  readonly parent?: DshAgent;
  readonly readOnly?: boolean;
  readonly toolFilter?: ToolRestriction;
}

const liveIdentities = new WeakMap<DshAgent, { identity: DsmmRoleIdentity; admission?: DsmmProfileAdmission; readEpoch(): string }>();
const toolIdentities = new WeakMap<DshAgent, { realm: object; definitions: Map<string, ToolDefinition> }>();
const controlledDefinitions = new WeakSet<ToolDefinition>();
export const READONLY_ROLE_DENIED_TOOLS = ["write", "edit", "bash", "pwsh"] as const;

interface ToolCall {
  active: boolean;
  readonly agent: Agent;
  readonly context: Context;
  readonly registry: object;
  readonly realm?: object;
  readonly scopeParent?: object;
  readonly parents: readonly Agent[];
  readonly parentSession: string | undefined;
  readonly name: string;
  readonly args: unknown;
  readonly callId: ToolExecution["callId"];
  readonly signal: AbortSignal;
  readonly definition?: ToolDefinition;
  readonly body?: ToolDefinition["execute"];
  readonly argumentsJson?: string;
  identity?: DsmmRoleIdentity;
  targets?: readonly DsmmRoleId[];
  target?: DsmmRoleId;
}

export function inheritToolFilter(parent?: ToolRestriction, requested?: ToolRestriction): ToolRestriction | undefined {
  if (parent === undefined && requested === undefined) return undefined;
  const allow = parent?.allow === undefined ? requested?.allow : requested?.allow === undefined ? parent.allow
    : parent.allow.filter((name) => requested.allow!.includes(name));
  const deny = [...new Set([...parent?.deny ?? [], ...requested?.deny ?? []])];
  return Object.freeze({ ...(allow === undefined ? {} : { allow: Object.freeze([...allow]) }),
    ...(parent?.deny === undefined && requested?.deny === undefined ? {} : { deny: Object.freeze(deny) }) });
}

export function resolveAdmittedDsmmRole(agent: DshAgent, settings: DsmmSettings, active: boolean): DsmmRoleId | undefined {
  if (!settings.modules.deepwork.enabled) return undefined;
  const identity = liveIdentities.get(agent)?.identity;
  return identity?.role === undefined ? resolveEffectiveDsmmRole(agent, settings, active)
    : identity.role !== undefined && settings.roles[identity.role] ? identity.role : undefined;
}

const readTools = new Set(["read", "glob", "grep", "read_image", "web_search", "web_fetch", "skill", "load_skill", "structured_output", "send_message", "interrupt_agent", "exit_plan_mode", "ask_user_question", "todo_write", "job_output", "job_list", "job_kill"]);
const readLsp = new Set(["status", "diagnostics", "goto_definition", "find_references", "find_symbol_related", "symbols", "prepare_rename"]);

export function roleToolName(role: DsmmRoleId): string { return role.replace(/-/gu, "_"); }

export function roleFromToolName(name: string): DsmmRoleId | undefined {
  return name === "explore" ? "dsmm-code-search" : DSMM_ROLES.find((row) => roleToolName(row.id) === name)?.id;
}

export function readonlyRoleTool(name: string, settings: DsmmSettings): boolean {
  return readTools.has(name) || name === `mcp__${settings.lsp.serverName}__${name.split("__").at(-1)}`
    && readLsp.has(name.split("__").at(-1)!);
}

interface DelegationIdentity { parent: DshAgent; role: DsmmRoleId; epoch: string; toolFilter?: ToolRestriction; maxDepth?: number; admittedChild?(agent: DshAgent): void }

export interface RoleAdmissionCollaborators {
  resolveOriginalEvidence(ticket: ParentAdmissionTicket, childId: string, signal: AbortSignal): Promise<ChildAdmissionEvidence>;
  nativeSubstrate: DsmmSettings;
  revokeParent(agent: DshAgent, reason: string): void;
  /** Shared C2b native-capability audit; this does not grant parent tool permissions. */
  classifyLegacyTool?: LegacyCapabilityCollaborators["classifyTool"];
}

/** Identity admission only: native services retain every run, inbox and retry lifecycle. */
export class DsmmRolePolicy {
  private readonly calls = new AsyncLocalStorage<DelegationIdentity>();
  private readonly executions = new AsyncLocalStorage<Readonly<ToolExecution>>();
  private readonly toolCalls = new WeakMap<object, ToolCall>();
  private readonly providers = new WeakSet<object>();
  private readonly continuableCreations = new Map<string, { parent: DshAgent; role: DsmmRoleId; epoch: string; invocation?: ResolvedRoleInvocation; detach(): void }>();
  private readonly preparedInvocations = new WeakMap<DshAgent, ResolvedRoleInvocation>();
  private readonly preparedCaptures = new WeakMap<DshAgent, ChildAdmissionCapture>();
  private collaborators?: RoleAdmissionCollaborators;

  constructor(private readonly ctx: DshContext, private readonly getSettings: DsmmSettingsGetter, private readonly mode: DeepworkModeController) {
    ctx.effect?.(() => () => { for (const pending of this.continuableCreations.values()) pending.detach(); this.continuableCreations.clear(); });
  }

  captureProvider(provider: object): void { this.providers.add(provider); }
  ownsProvider(provider: object): boolean { return this.providers.has(provider); }

  revokeResidency(agent: DshAgent): void { this.collaborators?.revokeParent(agent, "native-run-disposed"); }

  configureAdmission(collaborators: RoleAdmissionCollaborators): ChildAdmissionCompletion {
    this.collaborators = collaborators;
    return { prepare: (agent, parent, ticket, signal) => this.prepareChildAdmission(agent, parent, ticket, signal),
      validateRole: (agent, parent, candidate) => this.validatePreparedRole(agent, parent, candidate) };
  }

  validateRootRole(agent: DshAgent, admission: DsmmProfileAdmission): void {
    this.assertLive(agent);
    this.assertPlannerRootAdmission(agent, admission.settings);
    const selected = agent.ctx?.get?.<{ composedPreset(ctx: unknown): string | undefined }>("agentPresets")?.composedPreset(agent.ctx)
      ?? resolveSelectedAgentPreset(agent.session);
    const implicit = !selected?.startsWith("dsmm-") && admission.settings.modules.deepwork.enabled && this.mode.active(agent, admission.settings.defaultActive) ? "dsmm-orchestrator" : undefined;
    const role = selected?.startsWith("dsmm-") ? selected : implicit;
    if (role !== undefined && (!isDsmmRoleId(role) || !admission.settings.modules.deepwork.enabled || !admission.settings.roles[role]
      || role === "dsmm-planner" && !isRootRoleEnabled(admission.settings, role))) {
      throw new SubagentError("Standing DSMM root role is not admitted", "UNAUTHORIZED");
    }
  }

  recordContinuableCreation(childId: string, parent: DshAgent, role: DsmmRoleId, invocation: ResolvedRoleInvocation | undefined, expectedEpoch: string, signal: AbortSignal): void {
    signal.throwIfAborted();
    const admitted = this.assertDelegation(parent, role);
    if (admitted.epoch !== expectedEpoch) throw new SubagentError("Parent admission changed during continuable preflight", "UNAUTHORIZED");
    const abort = (): void => { this.continuableCreations.delete(childId); };
    signal.addEventListener("abort", abort, { once: true });
    this.continuableCreations.set(childId, { parent, role, epoch: admitted.epoch, invocation, detach: () => signal.removeEventListener("abort", abort) });
  }

  async prepareChildAdmission(agent: DshAgent, parent: DshAgent, ticket: ParentAdmissionTicket, signal: AbortSignal): Promise<PreparedChildAdmission> {
    signal.throwIfAborted(); ticket.signal.throwIfAborted();
    this.assertLive(agent); this.assertLive(parent);
    if (ticket.parent !== parent || this.getSettings.admission?.(parent) !== ticket.admission || ticket.parentEpoch !== ticket.admission.epoch) throw new SubagentError("Child preparation requires the exact parent admission ticket", "UNAUTHORIZED");
    const call = this.calls.getStore(), pending = this.continuableCreations.get(agent.id!);
    this.continuableCreations.delete(agent.id!);
    pending?.detach();
    const descriptor = foldSubagentDescriptor(childOwnedSessionEvents(agent.session) as Parameters<typeof foldSubagentDescriptor>[0]);
    let invocation = call?.parent === parent ? currentRoleInvocation(parent, call.role) : pending?.parent === parent ? pending.invocation : undefined;
    if (invocation === undefined && pending?.parent === parent) {
      if (pending.epoch !== ticket.parentEpoch || descriptor?.mode !== "continuable") throw new SubagentError("Fresh continuable identity or parent epoch changed", "UNAUTHORIZED");
      const explicit = descriptor.agentProvider === undefined && descriptor.agentModel === undefined && descriptor.agentReasoningEffort === undefined ? undefined
        : { provider: descriptor.agentProvider, model: descriptor.agentModel, reasoningEffort: descriptor.agentReasoningEffort };
      invocation = await resolveRoleInvocation(parent as unknown as Agent, pending.role, ticket.admission.settings, signal, {}, explicit);
      signal.throwIfAborted(); ticket.signal.throwIfAborted();
    }
    if (invocation === undefined) {
      if (this.collaborators === undefined) throw new SubagentError("Original child evidence resolver is unavailable", "UNAUTHORIZED");
      const evidence = await this.collaborators.resolveOriginalEvidence(ticket, agent.id!, signal);
      signal.throwIfAborted(); ticket.signal.throwIfAborted();
      return { evidence, admission: "mode" in evidence ? createConservativeLegacyAdmission(evidence, ticket.admission, this.collaborators.nativeSubstrate)
        : admissionFromChildCapture(evidence, this.collaborators.nativeSubstrate), creation: false };
    }
    if ((call?.parent === parent ? call.epoch : pending!.epoch) !== ticket.parentEpoch) throw new SubagentError("Child invocation parent epoch changed", "UNAUTHORIZED");
    const settings = ticket.admission.settings, parentIdentity = this.identity(parent);
    const filter = inheritToolFilter(parentIdentity.toolFilter, call?.toolFilter ?? (descriptor?.mode === "continuable" ? descriptor.toolFilter : undefined));
    const runtimePolicyCapture = copyJson({ modules: { deepwork: settings.modules.deepwork }, roleRouting: settings.roleRouting,
      runtimePolicy: settings.runtimePolicy, workflow: settings.workflow, guards: settings.guards, runtimeRecovery: settings.runtimeRecovery,
      defaultActive: settings.defaultActive, deepseekV4ProCalibration: settings.deepseekV4ProCalibration,
      deepseekV4ProDefaultReasoningEffort: settings.deepseekV4ProDefaultReasoningEffort, deepseekFlashCalibration: settings.deepseekFlashCalibration,
      deepseekFlashDefaultReasoningEffort: settings.deepseekFlashDefaultReasoningEffort, skills: settings.skills,
      subagents: { enableRunInBackground: settings.subagents.enableRunInBackground, backgroundMode: settings.subagents.backgroundMode } });
    if (invocation.routeSource === "level" || invocation.routeSource === "invocation-route") {
      const { reasoningEffort, ...route } = invocation.requestedPolicy?.primary ?? invocation.requestedRoute ?? invocation.initialRoute;
      runtimePolicyCapture.roleRouting[invocation.target] = { ...runtimePolicyCapture.roleRouting[invocation.target],
        primary: { ...route, ...(invocation.exactEffort && reasoningEffort !== undefined ? { reasoningEffort } : {}) },
        fallbackRoutes: (invocation.requestedPolicy ?? invocation.policy).fallbackRoutes.map(route => ({ ...route })) };
    }
    const capture = parseChildAdmissionCapture({ version: 2, childSessionId: agent.id, parentSessionId: parent.id, role: invocation.target,
      modelParameterPolicy: invocation.modelParameterPolicy ?? resolvedModelParameterPolicy(ticket.admission),
      profilePin: ticket.admission.profile, originalAdmissionEpoch: ticket.parentEpoch,
      invocation: { level: invocation.effectiveLevel, initialRoute: invocation.initialRoute, requestedRoute: invocation.requestedRoute ?? invocation.initialRoute,
        effortSource: invocation.effortSource ?? (invocation.routeSource === "inherited" ? "native" : "dsmm-config"), routeSource: invocation.routeSource }, runtimePolicyCapture,
      authorityCeiling: { roles: DSMM_ROLE_IDS.filter(id => settings.roles[id]), readOnly: this.readOnly(parentIdentity) || DSMM_ROLES.find(row => row.id === invocation.target)!.access === "read-only",
        ...(filter === undefined ? {} : { toolFilter: filter }), allowRouteOverride: settings.subagents.allowRouteOverride,
        maxDepth: settings.subagents.maxDepth ?? call?.maxDepth ?? (parent.ctx as Context).get("subagents")!.resolveMaxDepth() },
      ...(settings.locale === undefined ? {} : { locale: settings.locale }), toolTopology: settings.subagents.toolTopology });
    this.preparedInvocations.set(agent, invocation);
    this.preparedCaptures.set(agent, capture);
    return { evidence: capture, admission: admissionFromChildCapture(capture, this.collaborators?.nativeSubstrate ?? settings), creation: true };
  }

  /** Used at A's single awaited completion point; old original epochs remain valid facts. */
  validatePreparedRole(agent: DshAgent, parent: DshAgent, candidate: ChildRoleAdmissionCandidate): void {
    this.assertLive(agent); this.assertLive(parent);
    const evidence = "mode" in candidate.evidence ? parseLegacyChildEvidence(candidate.evidence) : parseChildAdmissionCapture(candidate.evidence);
    if (evidence.childSessionId !== agent.id || evidence.parentSessionId !== parent.id || (agent as unknown as Agent).session.header.parentSession !== parent.id || !this.agents().isOwnedBy(agent.id!, parent)) throw new SubagentError("Child evidence does not match exact native lineage", "UNAUTHORIZED");
    this.assertDelegation(parent, evidence.role);
    const descriptor = foldSubagentDescriptor(childOwnedSessionEvents(agent.session) as Parameters<typeof foldSubagentDescriptor>[0]);
    if (descriptor === undefined ? !candidate.creation || this.preparedInvocations.get(agent)?.target !== evidence.role
      : descriptor.provider !== `dsmm-role-${evidence.role.slice(5)}` || !candidate.creation && descriptor.mode !== "continuable") {
      throw new SubagentError("Native descriptor or trusted fresh invocation does not match the original role", "UNAUTHORIZED");
    }
    const original = candidate.admission;
    if (!original.settings.modules.deepwork.enabled || !original.settings.roles[evidence.role]) throw new SubagentError("Original child role/module is disabled", "UNAUTHORIZED");
    if (descriptor?.mode === "continuable") {
      const route = "mode" in evidence ? evidence.route : evidence.invocation.initialRoute;
      if (descriptor.agentProvider !== undefined && descriptor.agentProvider !== route.provider || descriptor.agentModel !== undefined && descriptor.agentModel !== route.model
        || descriptor.agentReasoningEffort !== undefined && descriptor.agentReasoningEffort !== route.reasoningEffort) throw new SubagentError("Original route does not match native descriptor provenance", "UNAUTHORIZED");
    }
    const prior = liveIdentities.get(agent);
    if (candidate.retained && prior !== undefined) {
      if (prior.identity.parent !== parent || prior.identity.role !== evidence.role || prior.identity.epoch !== original.epoch || prior.admission !== original) throw new SubagentError("Retained role identity or original admission reference cannot be replaced", "UNAUTHORIZED");
      return;
    }
    let invocation: ResolvedRoleInvocation;
    let filter: ToolRestriction | undefined;
    let readOnly: boolean;
    if ("mode" in evidence) {
      if (evidence.depth !== delegationDepthOf(agent as unknown as Agent)) throw new SubagentError("Legacy depth evidence does not match its physical native lineage", "UNAUTHORIZED");
      const safe = evidence.toolFilter?.allow?.filter(name => readonlyRoleTool(name, original.settings) && !["interrupt_agent", "job_kill"].includes(name)) ?? [];
      filter = inheritToolFilter({ allow: safe }, evidence.toolFilter); readOnly = true;
      invocation = freezeSettings({ target: evidence.role, effectiveLevel: "normal", routeSource: "inherited", initialRoute: evidence.route,
        candidates: [evidence.route], exactEffort: evidence.route.reasoningEffort !== undefined, modelParameterPolicy: resolvedModelParameterPolicy(original), effortSource: "native",
        policy: { ...resolveRoleRuntimePolicy(original.settings, evidence.role), primary: evidence.route, fallbackRoutes: [] } });
    } else {
      if (candidate.creation && JSON.stringify(this.preparedCaptures.get(agent)) !== JSON.stringify(evidence)) throw new SubagentError("Fresh capture does not match its trusted prepared invocation and ceiling", "UNAUTHORIZED");
      if (original.epoch !== evidence.originalAdmissionEpoch || candidate.creation && this.getSettings.admission?.(parent).epoch !== evidence.originalAdmissionEpoch) throw new SubagentError("Original capture or creation epoch does not match", "UNAUTHORIZED");
      const depth = delegationDepthOf(agent as unknown as Agent);
      if (depth > evidence.authorityCeiling.maxDepth) throw new SubagentError("Original child depth ceiling is exceeded", "UNAUTHORIZED");
      readOnly = evidence.authorityCeiling.readOnly;
      if (!readOnly && DSMM_ROLES.find(row => row.id === evidence.role)!.access === "read-only") throw new SubagentError("Original capture cannot weaken read-only role identity", "UNAUTHORIZED");
      filter = evidence.authorityCeiling.toolFilter;
      const nativeFilter = descriptor?.mode === "continuable" ? descriptor.toolFilter : undefined;
      if (nativeFilter !== undefined && JSON.stringify(inheritToolFilter(filter, nativeFilter)) !== JSON.stringify(filter)) throw new SubagentError("Original capture exceeds native descriptor tool restriction", "UNAUTHORIZED");
      const policy = resolveRoleRuntimePolicy(original.settings, evidence.role);
      const level = evidence.invocation.level === "normal" ? undefined : original.settings.roleRouting[evidence.role]?.levels?.[evidence.invocation.level];
      const modelParameterPolicy = resolvedModelParameterPolicy(original);
      const fallbacks = policy.fallbackRoutes.map(route => modelRouteFromCall(projectModelRouteParameters(route, "dsmm-config", modelParameterPolicy.mode !== "native-defaults")));
      invocation = freezeSettings({ target: evidence.role, effectiveLevel: evidence.invocation.level, routeSource: evidence.invocation.routeSource,
        initialRoute: evidence.invocation.initialRoute, candidates: [evidence.invocation.initialRoute, ...fallbacks], modelParameterPolicy,
        ...(evidence.version === 1 ? {} : { requestedRoute: evidence.invocation.requestedRoute, effortSource: evidence.invocation.effortSource, requestedPolicy: policy }),
        exactEffort: evidence.invocation.routeSource === "invocation-route" ? policy.primary?.reasoningEffort !== undefined
          : evidence.invocation.routeSource === "level" && level?.reasoningEffort !== undefined,
        policy: { ...policy, primary: evidence.invocation.initialRoute, fallbackRoutes: fallbacks } });
      const fresh = this.preparedInvocations.get(agent);
      if (candidate.creation && fresh !== undefined) invocation = fresh;
    }
    const identity = Object.freeze({ role: evidence.role, child: true, parent, epoch: original.epoch, readOnly,
      ...(filter === undefined ? {} : { toolFilter: inheritToolFilter(undefined, filter) }) });
    this.captureIdentity(agent, identity, original);
    bindRoleInvocation(agent, invocation, "mode" in evidence ? undefined : evidence);
    captureRoleRuntimePolicy(original.settings, evidence.role, invocation.policy);
    const call = this.calls.getStore();
    if (candidate.creation && call?.parent === parent && call.role === evidence.role) call.admittedChild?.(agent);
    this.preparedInvocations.delete(agent);
    this.preparedCaptures.delete(agent);
  }

  assertChildDelivery(ticket: ParentAdmissionTicket, childId: string, raw: ChildAdmissionEvidence): void {
    ticket.signal.throwIfAborted(); this.assertLive(ticket.parent);
    if (this.getSettings.admission?.(ticket.parent) !== ticket.admission || ticket.admission.epoch !== ticket.parentEpoch) throw new SubagentError("Delivery parent admission changed", "UNAUTHORIZED");
    const evidence = "mode" in raw ? parseLegacyChildEvidence(raw) : parseChildAdmissionCapture(raw);
    if (evidence.childSessionId !== childId || evidence.parentSessionId !== ticket.parent.id) throw new SubagentError("Delivery evidence is not this direct child", "UNAUTHORIZED");
    this.assertDelegation(ticket.parent, evidence.role);
    const depth = delegationDepthOf(ticket.parent as unknown as Agent) + 1;
    const maximum = ticket.admission.settings.subagents.maxDepth ?? (ticket.parent.ctx as unknown as Context).get("subagents")?.resolveMaxDepth();
    if (maximum !== undefined && depth > maximum || !("mode" in evidence) && depth > evidence.authorityCeiling.maxDepth) throw new SubagentError("Delivery exceeds the original or current delegation depth ceiling", "UNAUTHORIZED");
    if (!("mode" in evidence) && (!evidence.runtimePolicyCapture.modules.deepwork.enabled || !evidence.authorityCeiling.roles.includes(evidence.role))) throw new SubagentError("Original child role is not permitted", "UNAUTHORIZED");
  }

  private readOnly(identity: DsmmRoleIdentity): boolean { return identity.readOnly === true || DSMM_ROLES.find(row => row.id === identity.role)?.access === "read-only"; }

  private agents(): DshAgentsRegistry {
    const registry = this.ctx.get?.<DshAgentsRegistry>("agents");
    if (registry === undefined) throw new SubagentError("DSMM delegation requires native live Agent ownership", "UNAUTHORIZED");
    return registry;
  }

  assertLive(agent: DshAgent): void {
    if (agent.id === undefined || this.agents().get(agent.id) !== agent) throw new SubagentError("DSMM delegation requires the exact live Agent", "UNAUTHORIZED");
  }

  private isAdmittedChild(agent: DshAgent): boolean {
    const admitted = liveIdentities.get(agent), identity = admitted?.identity;
    return admitted?.admission !== undefined && identity?.child === true && identity.parent !== undefined
      && this.agents().get(identity.parent.id!) === identity.parent && this.agents().isOwnedBy(agent.id!, identity.parent);
  }

  private assertPlannerRootAdmission(agent: DshAgent, settings: DsmmSettings): void {
    if (settings.presets.plannerRootEnabled) return;
    const selected = resolveSelectedAgentPreset(agent.session);
    const composed = agent.ctx?.get?.<{ composedPreset(ctx: unknown): string | undefined }>("agentPresets")?.composedPreset(agent.ctx);
    if (selected !== "dsmm-planner" && composed !== "dsmm-planner") return;
    // Origin metadata alone cannot exempt a Root from this admission boundary.
    if (this.isAdmittedChild(agent)) return;
    throw new SubagentError("Standing DSMM root role is not admitted", "UNAUTHORIZED");
  }

  /** Core fence runs before native prompt/body assembly or provider execution. */
  assertModuleAdmission(agent: DshAgent): void {
    this.assertLive(agent);
    const settings = this.getSettings(agent);
    this.assertPlannerRootAdmission(agent, settings);
    const selected = agent.ctx?.get?.<{ composedPreset(ctx: unknown): string | undefined }>("agentPresets")?.composedPreset(agent.ctx)
      ?? resolveSelectedAgentPreset(agent.session);
    const descriptor = foldSubagentDescriptor(childOwnedSessionEvents(agent.session) as Parameters<typeof foldSubagentDescriptor>[0]);
    const provider = descriptor === undefined ? undefined : this.ctx.get?.<{ getProvider(name: string): object | undefined }>("subagents")?.getProvider(descriptor.provider);
    const providerRole = descriptor?.provider.startsWith("dsmm-role-") && (provider === undefined || this.providers.has(provider))
      ? `dsmm-${descriptor.provider.slice("dsmm-role-".length)}` : undefined;
    if (agent.session.header?.origin !== "subagent" && selected?.startsWith("dsmm-")
      && !isDsmmRoleId(selected)) throw new SubagentError("DSMM unknown standing root is not admitted", "UNAUTHORIZED");
    const implicit = agent.session.header?.origin !== "subagent" && settings.modules.deepwork.enabled && this.mode.active(agent, settings.defaultActive) ? "dsmm-orchestrator" : undefined;
    const role = providerRole ?? (isDsmmRoleId(selected) ? selected : implicit);
    if (role !== undefined && (!settings.modules.deepwork.enabled || !isDsmmRoleId(role) || !settings.roles[role])) {
      throw new SubagentError("Deepwork module or role is not admitted in this Agent; standing presets and child resume cannot enable it", "UNAUTHORIZED");
    }
    if (role === "dsmm-planner" && !isRootRoleEnabled(settings, role) && !this.isAdmittedChild(agent)) {
      throw new SubagentError("Standing DSMM root role is not admitted", "UNAUTHORIZED");
    }
  }

  identity(agent: DshAgent): DsmmRoleIdentity {
    this.assertLive(agent);
    const execution = this.executions.getStore(), call = execution === undefined ? undefined : this.toolCalls.get(execution);
    if (call?.active && call.agent === agent && call.identity !== undefined) return call.identity;
    const existing = liveIdentities.get(agent)?.identity;
    if (existing?.child) return existing;
    const parent = this.agents().list().find((row) => row !== agent && this.agents().isOwnedBy(agent.id!, row));
    if (parent !== undefined) {
      if (existing === undefined) throw new SubagentError("DSMM child role identity was not admitted", "UNAUTHORIZED");
      return existing;
    }
    const settings = this.getSettings(agent);
    this.assertPlannerRootAdmission(agent, settings);
    const selected = agent.ctx?.get?.<{ composedPreset(ctx: unknown): string | undefined }>("agentPresets")?.composedPreset(agent.ctx);
    const role = isDsmmRoleId(selected) ? selected : settings.modules.deepwork.enabled && agent.session.header?.origin !== "subagent" && this.mode.active(agent, settings.defaultActive) ? "dsmm-orchestrator" : undefined;
    if (role === "dsmm-planner" && !isRootRoleEnabled(settings, role)) {
      throw new SubagentError("Standing DSMM root role is not admitted", "UNAUTHORIZED");
    }
    return Object.freeze({ role, child: agent.session.header?.origin === "subagent", epoch: this.getSettings.admission?.(agent).epoch ?? "trusted-direct" });
  }

  targets(agent: DshAgent): readonly DsmmRoleId[] {
    const execution = this.executions.getStore(), call = execution === undefined ? undefined : this.toolCalls.get(execution);
    if (call?.active && call.agent === agent && call.targets !== undefined) return call.targets;
    const identity = this.identity(agent);
    const settings = this.getSettings(agent);
    if (!settings.modules.deepwork.enabled || identity.role === undefined || !settings.roles[identity.role]) return [];
    return allowedRoleChildren(identity.role, identity.child).filter((role) => settings.roles[role]
      && (!this.readOnly(identity) || DSMM_ROLES.find(row => row.id === role)!.access === "read-only")
      && (identity.toolFilter?.allow === undefined || identity.toolFilter.allow.includes(roleToolName(role)))
      && !identity.toolFilter?.deny?.includes(roleToolName(role)));
  }

  assertDelegation(parent: DshAgent, role: DsmmRoleId): DelegationIdentity {
    const execution = this.executions.getStore(), call = execution === undefined ? undefined : this.toolCalls.get(execution);
    if (call?.active && call.agent === parent && call.target === role && call.identity !== undefined) return { parent, role, epoch: call.identity.epoch };
    const identity = this.identity(parent);
    if (!this.targets(parent).includes(role)) throw new SubagentError(`DSMM ${identity.role ?? "unadmitted Agent"} cannot delegate ${role}`, "UNAUTHORIZED");
    return { parent, role, epoch: identity.epoch };
  }

  duringDelegation<T>(parent: DshAgent, role: DsmmRoleId, operation: () => T, toolFilter?: ToolRestriction, maxDepth?: number, admittedChild?: (agent: DshAgent) => void): T {
    const identity = this.assertDelegation(parent, role), outer = this.calls.getStore();
    const upstream = outer?.parent === parent && outer.role === role && outer.epoch === identity.epoch ? outer.admittedChild : undefined;
    const notify = admittedChild === undefined ? upstream : upstream === undefined ? admittedChild : (agent: DshAgent) => { upstream(agent); admittedChild(agent); };
    return this.calls.run({ ...identity, toolFilter, maxDepth, admittedChild: notify }, operation);
  }

  prepareContinuable(parent: DshAgent, role: DsmmRoleId, signal: AbortSignal): DelegationIdentity {
    signal.throwIfAborted();
    return this.assertDelegation(parent, role);
  }

  admit(agent: DshAgent): DsmmRoleIdentity {
    this.assertLive(agent);
    const agents = this.agents();
    const parent = agents.list().find((row) => row !== agent && agents.isOwnedBy(agent.id!, row));
    const existing = liveIdentities.get(agent);
    if (existing !== undefined) {
      // A retained child owns its original capture, not its parent's newer
      // mode/profile or a reinstall's replacement settings getter.
      if (parent === undefined || existing.identity.parent !== parent || existing.readEpoch() !== existing.identity.epoch) {
        throw new SubagentError("DSMM retained child admission no longer matches its exact owner or captured epoch", "UNAUTHORIZED");
      }
      this.assertLive(parent);
      return existing.identity;
    }
    if (parent === undefined) return this.identity(agent);
    const original = this.getSettings.admission?.(agent);
    if (original?.childCapture !== undefined) {
      this.validatePreparedRole(agent, parent, { evidence: original.childCapture, admission: original, creation: false, retained: false });
      return liveIdentities.get(agent)!.identity;
    }
    throw new SubagentError("DSMM child requires the completed original role/capture admission; generic spawn cannot bypass delegation policy", "UNAUTHORIZED");
  }

  private captureIdentity(agent: DshAgent, identity: DsmmRoleIdentity, admission?: DsmmProfileAdmission): DsmmRoleIdentity {
    liveIdentities.set(agent, { identity, admission, readEpoch: () => this.getSettings.admission?.(agent).epoch ?? "trusted-direct" });
    return identity;
  }

  captureTools(agent: DshAgent, tools: ToolRuntime, controlledNames: readonly string[] = [], reset = false): void {
    const realm = Reflect.get(tools, symbols.original) ?? tools;
    const previous = toolIdentities.get(agent);
    const definitions = previous === undefined || reset || previous.realm !== realm ? new Map<string, ToolDefinition>() : previous.definitions;
    for (const schema of tools.schemas(agent as Agent)) {
      if (previous === undefined || reset || previous.realm !== realm || controlledNames.includes(schema.name)) {
        const definition = tools.get(schema.name, agent as Agent)!;
        definitions.set(schema.name, definition);
        if (controlledNames.includes(schema.name)) controlledDefinitions.add(definition);
      }
    }
    toolIdentities.set(agent, { realm, definitions });
  }

  /** Existing exact role denials only; missing admission or capability proof is not a blacklist. */
  toolBlacklistDenial(agent: DshAgent, name: string, execution?: Readonly<ToolExecution>): string | undefined {
    return this.executions.exit(() => this.blacklistDenial(agent, name, execution));
  }

  private blacklistDenial(agent: DshAgent, name: string, execution?: Readonly<ToolExecution>): string | undefined {
    this.assertLive(agent);
    const captured = liveIdentities.get(agent)?.identity;
    if (captured?.toolFilter?.deny?.includes(name)) return "DSMM child native toolFilter does not permit this tool";
    if (captured?.readOnly === true && (READONLY_ROLE_DENIED_TOOLS as readonly string[]).includes(name)
      && this.isAdmittedChild(agent)) return "DSMM read-only role does not permit this tool";
    const definition = toolIdentities.get(agent)?.definitions.get(name);
    const native = agent.ctx as Context, tools = native.get("agentPresets")?.serviceFor(agent as Agent, "tools") ?? native.get("tools");
    if (definition === undefined || tools?.get(name, agent as Agent) !== definition) return undefined;
    let identity: DsmmRoleIdentity, settings: DsmmSettings;
    try { identity = this.identity(agent); settings = this.getSettings(agent); }
    catch (error) { if (error instanceof DsmmProfileError && !["disposed", "not-owned", "cancelled"].includes(error.code)
      || error instanceof SubagentError && error.code === "UNAUTHORIZED") return undefined; throw error; }
    if (identity.role === undefined) return undefined;
    if (!settings.modules.deepwork.enabled || !settings.roles[identity.role]) return "DSMM role is disabled in this Agent admission";
    const args = execution?.arguments as Record<string, unknown> | null | undefined;
    const target = roleFromToolName(name) ?? (name === "dsmm_role" ? args?.role : name === "dsmm_category" ? args?.category : undefined);
    if (isDsmmRoleId(target) && controlledDefinitions.has(definition)
      && (!settings.roles[target] || !allowedRoleChildren(identity.role, identity.child).includes(target))) return `DSMM delegation to ${target} is not permitted`;
    if (this.readOnly(identity) && (READONLY_ROLE_DENIED_TOOLS as readonly string[]).includes(name)) return "DSMM read-only role does not permit this tool";
    return undefined;
  }

  captureToolExecution(execution: Readonly<ToolExecution>, full: boolean): void {
    const agent = execution.agent;
    if (agent === undefined) return;
    this.assertLive(agent as unknown as DshAgent);
    const native = agent.ctx, agents = native.get("agents")!;
    const tools = native.get("agentPresets")?.serviceFor(agent, "tools") ?? native.get("tools");
    const definition = tools?.get(execution.name, agent);
    const owned = definition !== undefined && controlledDefinitions.has(definition);
    const call: ToolCall = { active: false, agent, context: native, registry: Reflect.get(agents, symbols.original) ?? agents,
      realm: tools === undefined ? undefined : Reflect.get(tools, symbols.original) ?? tools, scopeParent: scopeParentOf(agent),
      parents: agents.list().filter(parent => parent !== agent && agents.isOwnedBy(agent.id, parent)), parentSession: agent.session.header.parentSession,
      name: execution.name, args: execution.arguments, callId: execution.callId, signal: execution.signal,
      ...!owned ? {} : { definition, body: definition.execute, argumentsJson: JSON.stringify(execution.arguments) } };
    this.toolCalls.set(execution, call);
    if (!owned) return;
    this.executions.exit(() => {
      try {
        call.identity = this.identity(agent as unknown as DshAgent);
        call.targets = this.targets(agent as unknown as DshAgent);
        const args = execution.arguments as Record<string, unknown> | null;
        const target = roleFromToolName(execution.name) ?? (execution.name === "dsmm_role" ? args?.role : execution.name === "dsmm_category" ? args?.category : undefined);
        if (isDsmmRoleId(target)) call.target = target;
      } catch (error) { if (!full || !(error instanceof DsmmProfileError || error instanceof SubagentError)) throw error; }
    });
  }

  assertToolExecution(execution: Readonly<ToolExecution>): void {
    execution.signal.throwIfAborted();
    if (execution.agent === undefined) return;
    this.assertLive(execution.agent as unknown as DshAgent);
    const call = this.toolCalls.get(execution);
    if (call === undefined) return;
    call.signal.throwIfAborted();
    const agent = execution.agent, agents = agent.ctx.get("agents")!;
    const tools = agent.ctx.get("agentPresets")?.serviceFor(agent, "tools") ?? agent.ctx.get("tools");
    const parents = agents.list().filter(parent => parent !== agent && agents.isOwnedBy(agent.id, parent));
    if (agent !== call.agent || agent.ctx !== call.context || (Reflect.get(agents, symbols.original) ?? agents) !== call.registry
      || (tools === undefined ? undefined : Reflect.get(tools, symbols.original) ?? tools) !== call.realm || scopeParentOf(agent) !== call.scopeParent
      || agent.session.header.parentSession !== call.parentSession || parents.length !== call.parents.length || parents.some(parent => !call.parents.includes(parent))) throw new SubagentError("Native tool caller ownership changed", "UNAUTHORIZED");
    if (call.definition === undefined) return;
    const current = tools?.get(call.name, agent);
    if (execution.name !== call.name || execution.arguments !== call.args || execution.callId !== call.callId || JSON.stringify(execution.arguments) !== call.argumentsJson
      || call.definition.execute !== call.body || current !== undefined && current !== call.definition) throw new SubagentError("Owned tool registration or invocation changed", "UNAUTHORIZED");
  }

  beforeToolDecision<T>(operation: () => T): T { return this.executions.exit(operation); }

  async duringToolExecution<T>(execution: Readonly<ToolExecution>, operation: () => Promise<T>): Promise<T> {
    this.assertToolExecution(execution);
    const call = this.toolCalls.get(execution);
    if (call !== undefined) call.active = true;
    try { return await this.executions.run(execution, operation); }
    finally { if (call !== undefined) call.active = false; }
  }

  toolDenial(agent: DshAgent, name: string, tools?: ToolRuntime, execution?: Readonly<ToolExecution>): string | undefined {
    const scoped = this.executions.getStore();
    const active = execution ?? (scoped !== undefined && this.toolCalls.get(scoped)?.active ? scoped : undefined);
    if (active !== undefined && active.agent === agent && active.name === name) {
      this.assertToolExecution(active);
      return undefined;
    }
    if (tools === undefined) return this.toolBlacklistDenial(agent, name);
    return this.preToolDenial(agent, name, tools);
  }

  preToolDenial(agent: DshAgent, name: string, tools?: ToolRuntime, execution?: Readonly<ToolExecution>): string | undefined {
    return this.executions.exit(() => this.permissionDenial(agent, name, tools, execution));
  }

  private permissionDenial(agent: DshAgent, name: string, tools?: ToolRuntime, execution?: Readonly<ToolExecution>): string | undefined {
    const identity = this.identity(agent);
    const settings = this.getSettings(agent);
    const native = agent.ctx as Context, realm = tools ?? native.get("agentPresets")?.serviceFor(agent as Agent, "tools") ?? native.get("tools");
    const definition = realm?.get(name, agent as Agent);
    const owned = definition !== undefined && controlledDefinitions.has(definition);
    const controlled = owned && (name === "dsmm_role" || name === "dsmm_category");
    const target = owned ? roleFromToolName(name) : undefined;
    const readonly = identity.readOnly || DSMM_ROLES.find((row) => row.id === identity.role)?.access === "read-only";
    const checkedRealm = tools ?? (execution === undefined ? undefined : realm);
    if (checkedRealm !== undefined && (readonly || target !== undefined || controlled)) {
      const admitted = toolIdentities.get(agent);
      if (admitted === undefined || admitted.realm !== (Reflect.get(checkedRealm, symbols.original) ?? checkedRealm)
        || admitted.definitions.get(name) !== checkedRealm.get(name, agent as Agent)) return "DSMM tool definition was not admitted in this exact Agent realm";
    }
    if (target !== undefined) return DSMM_ROLES.find(row => row.id === target)!.kind !== "role" || settings.subagents.toolTopology !== "per-role" ? "DSMM obsolete per-target entry is not callable in this topology"
      : this.targets(agent).includes(target) ? undefined : `DSMM delegation to ${target} is not permitted`;
    if (controlled) {
      const kind = name === "dsmm_role" ? "role" : "category";
      if (name === "dsmm_role" && settings.subagents.toolTopology !== "parameterized" || !this.targets(agent).some(role => DSMM_ROLES.find(row => row.id === role)!.kind === kind)) return "DSMM merged delegation entry is not admitted";
      // Native merged-entry restrictions and the per-target ceiling both apply.
      if (identity.toolFilter?.allow !== undefined && !identity.toolFilter.allow.includes(name) || identity.toolFilter?.deny?.includes(name)) return "DSMM native filter does not permit this merged entry";
      const args = execution?.arguments as Record<string, unknown> | null | undefined;
      const target = kind === "role" ? args?.role : args?.category;
      if (isDsmmRoleId(target) && !this.targets(agent).includes(target)) return `DSMM delegation to ${target} is not permitted`;
      return undefined;
    }
    if (identity.toolFilter?.allow !== undefined && !identity.toolFilter.allow.includes(name) && name !== "structured_output"
      || identity.toolFilter?.deny?.includes(name)) return "DSMM child native toolFilter does not permit this tool";
    if (name === "send_message" && liveIdentities.get(agent)?.admission?.childEvidence?.mode === "legacy-conservative") {
      const realm = tools ?? (agent.ctx as Context).get("tools"), parent = identity.parent;
      const capability = realm === undefined ? undefined : this.collaborators?.classifyLegacyTool?.(name, realm, agent as Agent);
      if (parent === undefined || realm === undefined || capability?.kind !== "child-report" || realm.get(name, agent as Agent) !== capability.definition) return "DSMM legacy report requires its audited native capability";
      try {
        this.assertLive(parent);
        this.assertDelegation(parent, identity.role!);
        if (execution !== undefined) {
          capability.assertArguments(execution.arguments);
          const args = execution.arguments as { agent_id?: unknown } | null;
          if (args === null || typeof args !== "object" || args.agent_id !== parent.id) return "DSMM legacy report destination must be this exact direct parent";
        }
      } catch { return "DSMM legacy report arguments or current parent authority are not admitted"; }
    }
    if (readonly && !readonlyRoleTool(name, settings)) return "DSMM read-only role does not permit this tool";
    if (identity.role === undefined) return identity.child && settings.modules.deepwork.enabled && ["subagent", "spawn", "fork"].includes(name) ? "DSMM unadmitted children cannot delegate" : undefined;
    if (!settings.modules.deepwork.enabled || !settings.roles[identity.role]) return "DSMM role is disabled in this Agent admission";
    if (["subagent", "spawn", "fork"].includes(name)) return "Use the admitted DSMM role tools; generic delegation is not a role-policy bypass";
    return undefined;
  }

  installDrain(agent: DshAgent): void {
    const native = agent.ctx as Context | undefined;
    if (native === undefined) throw new Error("DSMM native role lifecycle requires an Agent context");
    native.effect(() => async () => {
      this.collaborators?.revokeParent?.(agent, "role-residency-disposed");
      const agents = this.agents();
      if (agents.get(agent.id!) !== agent) throw new Error("DSMM Agent was detached before continuable descendants drained");
      await native.get("subagents")?.drainContinuableDescendants([agent as Agent]);
      liveIdentities.delete(agent);
      toolIdentities.delete(agent);
    });
  }
}
