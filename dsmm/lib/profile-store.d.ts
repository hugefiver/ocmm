import type { ProfileReadResult, ProfileSaveRequest, ProfileSelectRequest, ProfileSelectionState, ProfileSnapshot, SessionProfileSelectRequest } from "./profile-types.js";
import type { DsmmProfileDocument } from "./profiles.js";
export type SaveProfileRequest = ProfileSaveRequest;
export type SelectProfileRequest = ProfileSelectRequest;
export interface LoadedProfileSelection extends ProfileSelectionState {
    document: DsmmProfileDocument | null;
    content: string | null;
}
export interface LoadedSessionProfileSelection extends LoadedProfileSelection {
    sessionId: string;
    admissionEpoch: string | null;
}
export declare const MAX_SESSION_PROFILE_CHOICES = 1024;
export interface SessionProfileCommit<T> {
    /** Trusted native liveness/cancellation fence; invoked immediately before rename. */
    assertCurrent(): void;
    /** Synchronous publication after durable commit. Must not throw or await. */
    committed(selection: LoadedSessionProfileSelection, prepared: T): void;
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
    loadSessionSelection(sessionId: string): Promise<LoadedSessionProfileSelection>;
    selectSession<T>(request: SessionProfileSelectRequest, epoch: string, validateCandidate: (document: DsmmProfileDocument | null) => T | Promise<T>, commit: SessionProfileCommit<T>): Promise<{
        selection: LoadedSessionProfileSelection;
        prepared: T;
    }>;
    select<T = undefined>(request: ProfileSelectRequest, validateCandidate?: (document: DsmmProfileDocument | null) => T | Promise<T>): Promise<{
        selection: LoadedProfileSelection;
        prepared: T;
    }>;
    private readResult;
    private inventory;
    private draftName;
    private draft;
    private selection;
    private sessionSelection;
    private assertSelectionRevision;
    private publishRevision;
    private atomicReplace;
    private validateRoot;
    private locked;
}
export declare function validateSessionProfileId(id: unknown): asserts id is string;
//# sourceMappingURL=profile-store.d.ts.map