import type { DsmmRoleId } from "./roles.js";
export interface DsmmRolePolicyEventData {
    version: 1;
    role: DsmmRoleId;
    policy: string | null;
}
declare module "@deepseek-ai/dsh-session/types" {
    interface SessionEventMap {
        "deepwork/mode": {
            active: boolean;
        };
        "dsmm/role-policy": DsmmRolePolicyEventData;
    }
}
export interface DeepworkSessionEventMap {
    "deepwork/mode": {
        active: boolean;
    };
    "dsmm/role-policy": DsmmRolePolicyEventData;
}
//# sourceMappingURL=dsh-events.d.ts.map