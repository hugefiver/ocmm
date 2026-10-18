import type { DshAgent } from "./dsh-types.js";
import type { DsmmRoleId } from "./roles.js";
/** The caller supplies the policy-admitted identity; only its Agent layer is changed. */
export declare function registerRoleHarnessIdentity(agent: DshAgent, role: DsmmRoleId): () => void;
//# sourceMappingURL=role-identity.d.ts.map