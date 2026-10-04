import type { AgentRequestFrame, DshContext, DshLlmCallConfig } from "./dsh-types.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmModelRoute, DsmmSettings } from "./settings.js";
export declare const DSMM_ROLE_POLICY_EVENT = "dsmm/role-policy";
export declare function rolePolicyIdentity(settings: DsmmSettings, role: DsmmRoleId | undefined): string | undefined;
/** Native custom events are model-hidden log facts, retained across surface compaction. */
export declare function establishRolePolicy(frame: AgentRequestFrame, settings: DsmmSettings, role: DsmmRoleId | undefined, ctx?: DshContext): Promise<string | undefined>;
export declare function recordAdmittedRecoveryRoute(frame: AgentRequestFrame, route: DsmmModelRoute): void;
export declare function takeAdmittedRecoveryRoute(frame: AgentRequestFrame): DsmmModelRoute | undefined;
export declare function effectiveRoleFallbackRoutes(settings: DsmmSettings, role: DsmmRoleId | undefined): readonly DsmmModelRoute[];
export declare function applyModelRoute(config: DshLlmCallConfig, route: DsmmModelRoute): DshLlmCallConfig;
export declare function sameModelRoute(left: Pick<DsmmModelRoute, "provider" | "model">, right: Pick<DsmmModelRoute, "provider" | "model">): boolean;
/** Accepted post-policy route changes are durable host/recovery ownership, not a new primary request. */
export declare function persistedRoleRoute(frame: Pick<AgentRequestFrame, "agent">, primary: DsmmModelRoute | undefined, fallbacks?: readonly DsmmModelRoute[], identity?: string): DsmmModelRoute | undefined;
//# sourceMappingURL=role-routing.d.ts.map