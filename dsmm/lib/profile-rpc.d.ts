import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { ProfileReadResult, ProfileSaveRequest, ProfileSelectRequest, ProfileSnapshot } from "./profile-types.js";
export interface ProfilesBackend {
    describe(): Promise<ProfileSnapshot>;
    read(id: string): Promise<ProfileReadResult>;
    save(request: ProfileSaveRequest): Promise<ProfileReadResult>;
    select(request: ProfileSelectRequest): Promise<ProfileSnapshot>;
}
/** Business service addressed only by native Typert Gateway invocations. */
export declare class DsmmProfilesHost extends TypertRemoteService {
    readonly backend: ProfilesBackend;
    constructor(ctx: Context, backend: ProfilesBackend);
    private invoke;
    describe(): Promise<ProfileSnapshot>;
    read(id: string): Promise<ProfileReadResult>;
    save(request: ProfileSaveRequest): Promise<ProfileReadResult>;
    select(request: ProfileSelectRequest): Promise<ProfileSnapshot>;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmProfiles: DsmmProfilesHost;
    }
}
/** The caller supplies the owned injection fiber; withdrawal stays native. */
export declare function registerProfilesRpc(ctx: Context, backend: ProfilesBackend): DsmmProfilesHost;
//# sourceMappingURL=profile-rpc.d.ts.map