import { createHash, randomUUID } from "node:crypto";
import { LlmError } from "@deepseek-ai/dsh-llm";
import type { AgentRequestFrame, DshAgent, DshContext, DshLlmCallConfig, DshLlmRuntime, DshSessionEvent } from "./dsh-types.js";
import { assertDsmmMetadataPersistence } from "./session-metadata.js";
import { isDsmmRoleId } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import { isCurrentRecoveryStep } from "./recovery-policy.js";
import { childOwnedSessionEvents, sessionEvents } from "./session-scope.js";
import { resolveRoleRuntimePolicy } from "./routing-policy.js";
import type { DsmmModelRoute, DsmmSettings } from "./settings.js";
import type { DsmmRoleRuntimeState } from "./profile-types.js";

const admittedRecoveryRoutes = new WeakMap<AgentRequestFrame, DsmmModelRoute>();
const routeLocks = new WeakMap<DshAgent, RoleRouteLock>();
const agentEntries = new WeakMap<DshAgent, string>();
export const DSMM_ROLE_POLICY_EVENT = "dsmm/role-policy";

export interface RoleRouteLock {
  identity: string;
  route: DsmmModelRoute;
  candidates: readonly DsmmModelRoute[];
  generation: number;
  attempts: number;
  startupSettled: boolean;
  retries: number;
  rateLimits: number;
  switches: number;
  totalDelayMs: number;
  manualSelectionSeq?: number;
}

export interface NativeModelSelectionIntent {
  seq: number;
  route: DsmmModelRoute;
}

/** Native user selection is authority; inherited headers/default configs are not. */
export function latestNativeModelSelection(agent: DshAgent): NativeModelSelectionIntent | undefined {
  let selected: NativeModelSelectionIntent | undefined;
  for (const event of policyEvents({ agent })) {
    if (event.type !== "model/selection" || !("seq" in event) || !Number.isSafeInteger(event.seq)
      || typeof event.seq !== "number" || event.seq < 0 || !isRecord(event.data)) continue;
    const { provider, model, reasoningEffort } = event.data;
    if (typeof provider !== "string" || provider.trim() === "" || typeof model !== "string" || model.trim() === ""
      || (reasoningEffort !== undefined && (typeof reasoningEffort !== "string" || reasoningEffort.trim() === ""))) continue;
    selected = { seq: event.seq, route: { provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) } };
  }
  return selected;
}

export function sameExactModelRoute(left: Pick<DsmmModelRoute, "provider" | "model" | "reasoningEffort">, right: DsmmModelRoute): boolean {
  return sameModelRoute(left, right) && left.reasoningEffort === right.reasoningEffort;
}

/** Consumed user intent stays explicit on cold resume and profile re-admission. */
export function nativeModelSelectionWasAccepted(agent: DshAgent, intent: NativeModelSelectionIntent): boolean {
  return policyEvents({ agent }).some((event) => event.type === "request/header" && "seq" in event
    && typeof event.seq === "number" && event.seq > intent.seq && isRecord(event.data)
    && isRecord(event.data.header) && isRecord(event.data.header.config)
    && sameExactModelRoute(event.data.header.config as unknown as DsmmModelRoute, intent.route));
}

/** Only native, machine-routable absence authorizes initial candidate admission. */
export function isUnavailableRouteFailure(error: unknown, nativeRequestFailure = false): boolean {
  return isRecord(error) && (error.status === undefined || error.status === 503)
    && (error.code === "NO_ADAPTER" || (error.code === "UNKNOWN_MODEL" && (nativeRequestFailure || error instanceof LlmError)));
}

export function orderedModelRoutes(candidates: readonly DsmmModelRoute[]): DsmmModelRoute[] {
  const routes: DsmmModelRoute[] = [];
  for (const route of candidates) if (!routes.some((previous) => sameModelRoute(previous, route))) routes.push(canonicalRoute(route));
  return routes;
}

/** Exact metadata preparation, never a completion or advisory catalog health check. */
export async function selectInitialModelRoute(llm: DshLlmRuntime, candidates: readonly DsmmModelRoute[], signal?: AbortSignal): Promise<DsmmModelRoute> {
  if (llm.resolveCallConfig === undefined) throw new Error("dsmm route admission requires the Agent native LLM service");
  let unavailable: unknown;
  for (const route of orderedModelRoutes(candidates)) {
    signal?.throwIfAborted();
    try {
      await llm.resolveCallConfig({ ...route }, signal);
      signal?.throwIfAborted();
      return { ...route };
    } catch (error) {
      signal?.throwIfAborted();
      if (!isUnavailableRouteFailure(error)) throw error;
      unavailable = error;
    }
  }
  throw unavailable ?? new Error("dsmm route admission has no configured candidate");
}

export function roleRouteLock(agent: DshAgent, identity: string): RoleRouteLock | undefined {
  const lock = routeLocks.get(agent);
  return lock?.identity === identity ? lock : undefined;
}

export function pinRoleRoute(agent: DshAgent, identity: string, route: DsmmModelRoute, candidates: readonly DsmmModelRoute[]): RoleRouteLock {
  const lock: RoleRouteLock = { identity, route: canonicalRoute(route), candidates: orderedModelRoutes(candidates), generation: 0,
    attempts: 0, startupSettled: false, retries: 0, rateLimits: 0, switches: 0, totalDelayMs: 0 };
  routeLocks.set(agent, lock);
  return lock;
}

export function clearRoleRouteLock(agent: DshAgent): void { routeLocks.delete(agent); }

export function roleRouteRuntimeState(agent: DshAgent, settings: DsmmSettings, role: DsmmRoleId | undefined, epoch?: string): DsmmRoleRuntimeState {
  const resolved = resolveRoleRuntimePolicy(settings, role);
  const identity = liveRolePolicyIdentity(agent, settings, role, epoch);
  const lock = identity === undefined ? undefined : roleRouteLock(agent, identity);
  return { ...(role === undefined ? {} : { role }), strategy: agent.session.header?.origin === "subagent" ? resolved.strategy : "startup-lock", rateLimit: { ...resolved.rateLimit },
    ...(lock === undefined ? {} : { route: { ...lock.route } }), retries: lock?.retries ?? 0,
    rateLimitFailures: lock?.rateLimits ?? 0, switches: lock?.switches ?? 0, totalDelayMs: lock?.totalDelayMs ?? 0 };
}

export function rolePolicyIdentity(settings: DsmmSettings, role: DsmmRoleId | undefined, epoch?: string): string | undefined {
  if (role === undefined) return undefined;
  const policy = settings.roleRouting[role];
  const resolved = resolveRoleRuntimePolicy(settings, role);
  return createHash("sha256").update(JSON.stringify({
    version: 2, role, epoch: epoch ?? null, primary: policy?.primary === undefined ? null : canonicalRoute(policy.primary),
    fallbackSource: resolved.fallbackSource, fallbackRoutes: resolved.fallbackRoutes.map(canonicalRoute),
    strategy: resolved.strategy, rateLimit: resolved.rateLimit
  })).digest("hex");
}

/** Durable profile choice is not permission to retain a former process's route lock. */
export function liveRolePolicyIdentity(agent: DshAgent, settings: DsmmSettings, role: DsmmRoleId | undefined, epoch?: string): string | undefined {
  let entry = agentEntries.get(agent);
  if (entry === undefined) { entry = randomUUID(); agentEntries.set(agent, entry); }
  return rolePolicyIdentity(settings, role, `${epoch ?? "unscoped"}:${entry}`);
}

function canonicalRoute(route: DsmmModelRoute): DsmmModelRoute {
  return { provider: route.provider, model: route.model, ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }) };
}

function policyEvents(frame: Pick<AgentRequestFrame, "agent">): readonly DshSessionEvent[] {
  const session = frame.agent.session;
  return session.header?.origin === "subagent" ? childOwnedSessionEvents(session) : sessionEvents(session);
}

function isPresetBoundary(frame: Pick<AgentRequestFrame, "agent">, event: DshSessionEvent): boolean {
  return frame.agent.session.header?.origin !== "subagent" && event.type === "agent-preset/selected"
    && isRecord(event.data) && typeof event.data.agentPreset === "string";
}

function readPolicyMarker(event: DshSessionEvent): { role: DsmmRoleId; policy: string | null } | undefined {
  if (event.type !== DSMM_ROLE_POLICY_EVENT) return undefined;
  const data = event.data;
  if (!isRecord(data) || data.version !== 1) return undefined;
  if (Object.keys(data).length !== 3 || !isDsmmRoleId(data.role)
    || (data.policy !== null && (typeof data.policy !== "string" || !/^[a-f0-9]{64}$/u.test(data.policy)))) {
    throw new TypeError("dsmm role-policy marker is malformed");
  }
  return { role: data.role, policy: data.policy };
}

/** Native custom events are model-hidden log facts, retained across surface compaction. */
export async function establishRolePolicy(frame: AgentRequestFrame, settings: DsmmSettings, role: DsmmRoleId | undefined, ctx?: DshContext, epoch?: string): Promise<string | undefined> {
  const identity = liveRolePolicyIdentity(frame.agent, settings, role, epoch);
  const declared = role !== undefined && (Object.keys(settings.roleRouting[role] ?? {}).length > 0 || settings.runtimeRecovery.fallbackRoutes.length > 0);
  if (frame.signal.aborted) return identity;
  let latest: ReturnType<typeof readPolicyMarker>;
  const events = policyEvents(frame);
  for (const event of events) {
    if (isPresetBoundary(frame, event)) latest = undefined;
    else if (event.type === DSMM_ROLE_POLICY_EVENT) latest = readPolicyMarker(event);
  }
  if (frame.signal.aborted || !isCurrentRecoveryStep(events, frame.turn, frame.step)) return identity;
  if (identity === undefined || role === undefined || !declared) {
    if (latest !== undefined && latest.policy !== null) {
      assertDsmmMetadataPersistence(ctx ?? frame.agent.ctx);
      await frame.agent.session.append(DSMM_ROLE_POLICY_EVENT, { version: 1, role: latest.role, policy: null });
    }
    return identity;
  }
  if (latest?.role !== role || latest.policy !== identity) {
    assertDsmmMetadataPersistence(ctx ?? frame.agent.ctx);
    await frame.agent.session.append(DSMM_ROLE_POLICY_EVENT, { version: 1, role, policy: identity });
  }
  return identity;
}

export function recordAdmittedRecoveryRoute(frame: AgentRequestFrame, route: DsmmModelRoute): void {
  admittedRecoveryRoutes.set(frame, { ...route });
}

export function takeAdmittedRecoveryRoute(frame: AgentRequestFrame): DsmmModelRoute | undefined {
  const route = admittedRecoveryRoutes.get(frame);
  admittedRecoveryRoutes.delete(frame);
  return route;
}

export function effectiveRoleFallbackRoutes(settings: DsmmSettings, role: DsmmRoleId | undefined): readonly DsmmModelRoute[] {
  return resolveRoleRuntimePolicy(settings, role).fallbackRoutes;
}

export function applyModelRoute(config: DshLlmCallConfig, route: DsmmModelRoute): DshLlmCallConfig {
  const { reasoningEffort: _inheritedEffort, ...preserved } = config;
  return { ...preserved, ...route };
}

export function sameModelRoute(left: Pick<DsmmModelRoute, "provider" | "model">, right: Pick<DsmmModelRoute, "provider" | "model">): boolean {
  return left.provider === right.provider && left.model === right.model;
}

/** Accepted post-policy route changes are durable host/recovery ownership, not a new primary request. */
export function persistedRoleRoute(frame: Pick<AgentRequestFrame, "agent">, primary: DsmmModelRoute | undefined, fallbacks: readonly DsmmModelRoute[] = [], identity?: string): DsmmModelRoute | undefined {
  const events = policyEvents(frame);
  let matchingPolicy = false;
  let selected: DsmmModelRoute | undefined;
  for (const event of events) {
    if (isPresetBoundary(frame, event) || event.type === DSMM_ROLE_POLICY_EVENT) {
      matchingPolicy = event.type === DSMM_ROLE_POLICY_EVENT && identity !== undefined && readPolicyMarker(event)?.policy === identity;
      selected = undefined;
      continue;
    }
    if (!matchingPolicy) continue;
    if (event.type !== "request/header" || !isRecord(event.data)
      || !["initial", "resume", "change", "series"].includes(String(event.data.reason)) || !("header" in event.data)) continue;
    const header = event.data.header;
    if (!isRecord(header) || !isRecord(header.config)) continue;
    const config = header.config as DshLlmCallConfig;
    if (typeof config?.provider !== "string" || config.provider.trim() === ""
      || typeof config.model !== "string" || config.model.trim() === "") continue;
    selected = {
      provider: config.provider, model: config.model,
      ...(typeof config.reasoningEffort === "string" && !adapterDefaultEffort(header) ? { reasoningEffort: config.reasoningEffort } : {})
    };
  }
  // A configured fallback remains exact after its adapter/default header is
  // persisted. A later non-chain durable host route remains host-owned instead.
  return selected === undefined ? undefined : [primary, ...fallbacks].find((route) => route !== undefined && sameModelRoute(route, selected)) ?? selected;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function adapterDefaultEffort(header: object): boolean {
  if (!("adapterDefaults" in header) || typeof header.adapterDefaults !== "object" || header.adapterDefaults === null) return false;
  return "reasoningEffort" in header.adapterDefaults && header.adapterDefaults.reasoningEffort === true;
}
