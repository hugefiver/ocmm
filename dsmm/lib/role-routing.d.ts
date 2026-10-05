import type { AgentRequestFrame, DshAgent, DshContext, DshLlmCallConfig, DshLlmRuntime } from "./dsh-types.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmModelRoute, DsmmSettings } from "./settings.js";
import type { DsmmRoleRuntimeState } from "./profile-types.js";
export declare const DSMM_ROLE_POLICY_EVENT = "dsmm/role-policy";
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
export declare function latestNativeModelSelection(agent: DshAgent): NativeModelSelectionIntent | undefined;
export declare function sameExactModelRoute(left: Pick<DsmmModelRoute, "provider" | "model" | "reasoningEffort">, right: DsmmModelRoute): boolean;
/** Consumed user intent stays explicit on cold resume and profile re-admission. */
export declare function nativeModelSelectionWasAccepted(agent: DshAgent, intent: NativeModelSelectionIntent): boolean;
/** Only native, machine-routable absence authorizes initial candidate admission. */
export declare function isUnavailableRouteFailure(error: unknown, nativeRequestFailure?: boolean): boolean;
export declare function orderedModelRoutes(candidates: readonly DsmmModelRoute[]): DsmmModelRoute[];
/** Exact metadata preparation, never a completion or advisory catalog health check. */
export declare function selectInitialModelRoute(llm: DshLlmRuntime, candidates: readonly DsmmModelRoute[], signal?: AbortSignal): Promise<DsmmModelRoute>;
export declare function roleRouteLock(agent: DshAgent, identity: string): RoleRouteLock | undefined;
export declare function pinRoleRoute(agent: DshAgent, identity: string, route: DsmmModelRoute, candidates: readonly DsmmModelRoute[]): RoleRouteLock;
export declare function clearRoleRouteLock(agent: DshAgent): void;
export declare function roleRouteRuntimeState(agent: DshAgent, settings: DsmmSettings, role: DsmmRoleId | undefined, epoch?: string): DsmmRoleRuntimeState;
export declare function rolePolicyIdentity(settings: DsmmSettings, role: DsmmRoleId | undefined, epoch?: string): string | undefined;
/** Durable profile choice is not permission to retain a former process's route lock. */
export declare function liveRolePolicyIdentity(agent: DshAgent, settings: DsmmSettings, role: DsmmRoleId | undefined, epoch?: string): string | undefined;
/** Native custom events are model-hidden log facts, retained across surface compaction. */
export declare function establishRolePolicy(frame: AgentRequestFrame, settings: DsmmSettings, role: DsmmRoleId | undefined, ctx?: DshContext, epoch?: string): Promise<string | undefined>;
export declare function recordAdmittedRecoveryRoute(frame: AgentRequestFrame, route: DsmmModelRoute): void;
export declare function takeAdmittedRecoveryRoute(frame: AgentRequestFrame): DsmmModelRoute | undefined;
export declare function effectiveRoleFallbackRoutes(settings: DsmmSettings, role: DsmmRoleId | undefined): readonly DsmmModelRoute[];
export declare function applyModelRoute(config: DshLlmCallConfig, route: DsmmModelRoute): DshLlmCallConfig;
export declare function sameModelRoute(left: Pick<DsmmModelRoute, "provider" | "model">, right: Pick<DsmmModelRoute, "provider" | "model">): boolean;
/** Accepted post-policy route changes are durable host/recovery ownership, not a new primary request. */
export declare function persistedRoleRoute(frame: Pick<AgentRequestFrame, "agent">, primary: DsmmModelRoute | undefined, fallbacks?: readonly DsmmModelRoute[], identity?: string): DsmmModelRoute | undefined;
//# sourceMappingURL=role-routing.d.ts.map