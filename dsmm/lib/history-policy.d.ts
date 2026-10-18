import type { DsmmGitWritePolicy, DsmmSettings } from "./settings.js";
/** The DSMM Git guard for the candidate's effective mode, not a grant from other policy layers. */
export declare function effectiveHistoryGitWriteGuard(settings: DsmmSettings, nativeFullAccess: boolean, deepworkActive: boolean): DsmmGitWritePolicy;
//# sourceMappingURL=history-policy.d.ts.map