import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { ProfileReadResult, ProfileSaveRequest, ProfileSelectRequest, ProfileSnapshot, SessionModeSelectRequest, SessionProfileSelectRequest, SessionProfileSnapshot } from "./profile-types.js";
import type { DshAgent } from "./dsh-types.js";
export interface ProfilesBackend {
    describe(): Promise<ProfileSnapshot>;
    read(id: string): Promise<ProfileReadResult>;
    save(request: ProfileSaveRequest): Promise<ProfileReadResult>;
    select(request: ProfileSelectRequest): Promise<ProfileSnapshot>;
    getSession(agent: DshAgent): Promise<SessionProfileSnapshot>;
    selectSession(request: SessionProfileSelectRequest, capturedAgent: DshAgent, signal?: AbortSignal, assertAuthority?: () => void): Promise<SessionProfileSnapshot>;
    selectMode?(request: SessionModeSelectRequest, capturedAgent: DshAgent, signal?: AbortSignal, assertAuthority?: () => void): Promise<SessionProfileSnapshot>;
}
/** Business service addressed only by native Typert Gateway invocations. */
export declare class DsmmProfilesHost extends TypertRemoteService {
    readonly backend: ProfilesBackend;
    private readonly lifetime;
    constructor(ctx: Context, backend: ProfilesBackend);
    private invoke;
    describe(): Promise<ProfileSnapshot>;
    read(id: string): Promise<ProfileReadResult>;
    save(request: ProfileSaveRequest): Promise<ProfileReadResult>;
    select(request: ProfileSelectRequest): Promise<ProfileSnapshot>;
    /** Native Connection's exact operator is authority, not a claimed Peer ID. */
    private invokeSession;
    describeSession(sessionId: string): Promise<SessionProfileSnapshot>;
    selectSession(sessionId: string, request: SessionProfileSelectRequest): Promise<SessionProfileSnapshot>;
    selectMode(sessionId: string, request: SessionModeSelectRequest): Promise<SessionProfileSnapshot>;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmProfiles: DsmmProfilesHost;
    }
}
/** The caller supplies the owned injection fiber; withdrawal stays native. */
export declare function registerProfilesRpc(ctx: Context, backend: ProfilesBackend): DsmmProfilesHost;
//# sourceMappingURL=profile-rpc.d.ts.map