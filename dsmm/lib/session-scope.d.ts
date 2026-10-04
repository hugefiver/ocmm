import type { DshAgent, DshSession, DshSessionEvent } from "./dsh-types.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSettings } from "./settings.js";
export declare function sessionEvents(session: DshSession | undefined): readonly DshSessionEvent[];
export declare function resolveSelectedAgentPreset(session: DshSession | undefined): string | undefined;
export declare function childOwnedSessionEvents(session: DshSession): readonly DshSessionEvent[];
/** Parent preset/persona inheritance is deliberately not delegated role authority. */
export declare function resolveEffectiveDsmmRole(agent: DshAgent, settings: DsmmSettings, modeActive: boolean): DsmmRoleId | undefined;
//# sourceMappingURL=session-scope.d.ts.map