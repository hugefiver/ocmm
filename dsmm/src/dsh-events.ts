// Optional dsh host type augmentation. Keep this module emitted so consumers
// that import dsmm also receive the session-event key when dsh types are present.
import type { DsmmRoleId } from "./roles.js";

export interface DsmmRolePolicyEventData {
  version: 1;
  role: DsmmRoleId;
  policy: string | null;
}

// @ts-ignore Optional peer types may be absent when developing dsmm standalone.
declare module "@deepseek-ai/dsh-session/types" {
  interface SessionEventMap {
    "deepwork/mode": { active: boolean };
    "dsmm/role-policy": DsmmRolePolicyEventData;
  }
}

export interface DeepworkSessionEventMap {
  "deepwork/mode": { active: boolean };
  "dsmm/role-policy": DsmmRolePolicyEventData;
}
