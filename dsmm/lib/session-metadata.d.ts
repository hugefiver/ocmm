import type { DshSession } from "./dsh-types.js";
import type { DsmmRolePolicyEventData } from "./dsh-events.js";
declare module "@deepseek-ai/dsh-session/types" {
    interface PluginRecordMap {
        "plugin:dsmm/mode": {
            active: boolean;
        };
        "plugin:dsmm/role-policy": DsmmRolePolicyEventData;
    }
}
/** Model-hidden observations use the official ignorable record boundary, never authorization. */
export declare function appendModeRecord(session: DshSession, active: boolean): void;
export declare function appendRolePolicyRecord(session: DshSession, data: DsmmRolePolicyEventData): void;
//# sourceMappingURL=session-metadata.d.ts.map