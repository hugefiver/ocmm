import type { ProfileReadResult, ProfileSaveRequest, ProfileSelectRequest, ProfileSelectionState, ProfileSnapshot } from "./profile-types.js";
import type { DsmmProfileDocument } from "./profiles.js";
export type SaveProfileRequest = ProfileSaveRequest;
export type SelectProfileRequest = ProfileSelectRequest;
export interface LoadedProfileSelection extends ProfileSelectionState {
    document: DsmmProfileDocument | null;
    content: string | null;
}
export interface ProfileStoreOptions {
    lockTimeoutMs?: number;
    lockPollMs?: number;
    /** Narrow test seam for a failed atomic replacement; never delete the old target. */
    rename?: (source: string, destination: string) => void;
}
/** This directory is supplied by the Host, never by a remote method parameter. */
export declare class ProfileStore {
    readonly profileDir: string;
    private readonly timeoutMs;
    private readonly pollMs;
    private readonly rename;
    private rootIdentity?;
    constructor(profileDir: string, options?: ProfileStoreOptions);
    describe(): Promise<ProfileSnapshot>;
    read(id: string): Promise<ProfileReadResult>;
    save(request: ProfileSaveRequest): Promise<ProfileReadResult>;
    loadSelection(): Promise<LoadedProfileSelection>;
    select<T = undefined>(request: ProfileSelectRequest, validateCandidate?: (document: DsmmProfileDocument | null) => T | Promise<T>): Promise<{
        selection: LoadedProfileSelection;
        prepared: T;
    }>;
    private readResult;
    private inventory;
    private draftName;
    private draft;
    private selection;
    private assertSelectionRevision;
    private publishRevision;
    private atomicReplace;
    private validateRoot;
    private locked;
}
//# sourceMappingURL=profile-store.d.ts.map