import type { RemoteResult, TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry";
import type { ProfileErrorInfo, ProfileReadResult, ProfileSaveRequest, ProfileSelectRequest, ProfileSnapshot } from "./profile-types.js";
export interface DsmmProfilesRemote {
    describe(): Promise<RemoteResult<ProfileSnapshot>>;
    read(id: string): Promise<RemoteResult<ProfileReadResult>>;
    save(request: ProfileSaveRequest): Promise<RemoteResult<ProfileReadResult>>;
    select(request: ProfileSelectRequest): Promise<RemoteResult<ProfileSnapshot>>;
}
declare module "@deepseek-ai/dsh-typert-protocol/types" {
    interface TypertRemoteMap {
        "dsmmProfiles/describe": DsmmProfilesRemote["describe"];
        "dsmmProfiles/read": DsmmProfilesRemote["read"];
        "dsmmProfiles/save": DsmmProfilesRemote["save"];
        "dsmmProfiles/select": DsmmProfilesRemote["select"];
    }
    interface TypertRemoteNamespaceMap {
        dsmmProfiles: DsmmProfilesRemote;
    }
    interface RemoteErrorDetailsMap {
        "dsmm-profiles/refused": ProfileErrorInfo;
        "dsmm-profiles/peer-required": {};
    }
}
/** Shared wire grammar for native codec validation and local form feedback. */
export declare function isProfileId(value: unknown): value is string;
/** Explicit strict Host contract; no SRC fallback or browser-supplied authority. */
export declare const TYPERT_REMOTE: TypertRemoteContribution;
export declare const TYPERT_HOST: TypertContribution;
export default TYPERT_REMOTE;
//# sourceMappingURL=profile-remote.d.ts.map