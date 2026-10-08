import type { RemoteResult, TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry";
import type { ProfileErrorInfo, ProfileReadResult, ProfileSaveRequest, ProfileSelectRequest, ProfileSnapshot, SessionModeSelectRequest, SessionProfileSelectRequest, SessionProfileSnapshot } from "./profile-types.js";
import type { GlobalConfigSaveRequest, GlobalConfigSnapshot } from "./deployment-config.js";
import type { DsmmModuleState } from "./modules.js";
import type { DeploymentEditorSnapshot } from "./profile-types.js";
export interface DsmmConfigRemote {
    describe(): Promise<RemoteResult<GlobalConfigSnapshot>>;
    save(request: GlobalConfigSaveRequest): Promise<RemoteResult<GlobalConfigSnapshot>>;
    describeModules(): Promise<RemoteResult<DsmmModuleState[]>>;
    describeSettings(): Promise<RemoteResult<DeploymentEditorSnapshot>>;
}
export interface DsmmProfilesRemote {
    describe(): Promise<RemoteResult<ProfileSnapshot>>;
    read(id: string): Promise<RemoteResult<ProfileReadResult>>;
    save(request: ProfileSaveRequest): Promise<RemoteResult<ProfileReadResult>>;
    select(request: ProfileSelectRequest): Promise<RemoteResult<ProfileSnapshot>>;
    describeSession(sessionId: string): Promise<RemoteResult<SessionProfileSnapshot>>;
    selectSession(sessionId: string, request: SessionProfileSelectRequest): Promise<RemoteResult<SessionProfileSnapshot>>;
    selectMode?(sessionId: string, request: SessionModeSelectRequest): Promise<RemoteResult<SessionProfileSnapshot>>;
}
declare module "@deepseek-ai/dsh-typert-protocol/types" {
    interface TypertRemoteMap {
        "dsmmConfig/describe": () => Promise<RemoteResult<GlobalConfigSnapshot>>;
        "dsmmConfig/save": (request: GlobalConfigSaveRequest) => Promise<RemoteResult<GlobalConfigSnapshot>>;
        "dsmmConfig/describeModules": () => Promise<RemoteResult<DsmmModuleState[]>>;
        "dsmmConfig/describeSettings": DsmmConfigRemote["describeSettings"];
        "dsmmProfiles/describe": DsmmProfilesRemote["describe"];
        "dsmmProfiles/read": DsmmProfilesRemote["read"];
        "dsmmProfiles/save": DsmmProfilesRemote["save"];
        "dsmmProfiles/select": DsmmProfilesRemote["select"];
        "dsmmProfiles/describeSession": DsmmProfilesRemote["describeSession"];
        "dsmmProfiles/selectSession": DsmmProfilesRemote["selectSession"];
        "dsmmProfiles/selectMode": NonNullable<DsmmProfilesRemote["selectMode"]>;
    }
    interface TypertRemoteNamespaceMap {
        dsmmProfiles: DsmmProfilesRemote;
        dsmmConfig: DsmmConfigRemote;
    }
    interface RemoteErrorDetailsMap {
        "dsmm-profiles/refused": ProfileErrorInfo;
        "dsmm-profiles/peer-required": {};
    }
}
/** Shared wire grammar for native codec validation and local form feedback. */
export declare function isProfileId(value: unknown): value is string;
/** Opaque native identities are never interpreted as paths. */
export declare function isNativeSessionId(value: unknown): value is string;
/** Explicit strict Host contract; no SRC fallback or browser-supplied authority. */
export declare const TYPERT_REMOTE: TypertRemoteContribution;
export declare const TYPERT_HOST: TypertContribution;
export default TYPERT_REMOTE;
//# sourceMappingURL=profile-remote.d.ts.map