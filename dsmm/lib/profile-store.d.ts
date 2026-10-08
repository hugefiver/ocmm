import type { Stats } from "node:fs";
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
interface ProfileFile {
    bytes: Buffer;
    content: string;
    revision: string;
}
type DirectoryIdentities = Map<string, Stats>;
export interface ProfileStoreMetadata {
    origin: "central" | "legacy" | "explicit";
    readOnly: boolean;
    writeRestriction?: string;
}
/** This directory is supplied by the Host, never by a remote method parameter. */
export declare class ProfileStore {
    readonly profileDir: string;
    readonly stateDir: string;
    private readonly timeoutMs;
    private readonly pollMs;
    private readonly rename;
    private rootIdentity?;
    readonly origin: ProfileStoreMetadata["origin"];
    private readonly hostProfile?;
    private readonly identities;
    constructor(profileDir: string, options?: ProfileStoreOptions);
    static fromCentral(home: string, canonicalHostProfile: string, actualEntryId: string, options?: ProfileStoreOptions): ProfileStore;
    static fromLegacy(legacyDir: string, options?: ProfileStoreOptions): ProfileStore;
    describe(): Promise<ProfileSnapshot & ProfileStoreMetadata>;
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
    private validateState;
    private metadata;
    get readOnly(): boolean;
    get writeRestriction(): string | undefined;
    private assertWritable;
    private readOperation;
    private locked;
}
declare function locked<T>(directory: string, lockName: string, validateRoot: (create: boolean) => void, timeoutMs: number, pollMs: number, operation: (assertLock: () => void) => T | Promise<T>): Promise<T>;
declare function atomicReplace(target: string, bytes: Buffer, beforeRename: (temporary: string) => void, assertAuthority: () => void, rename: (source: string, destination: string) => void, assertCurrent?: () => void): void;
declare function trustedHome(home: string): string;
/** @internal Shared only by the fixed config file adapter; not a wire-path storage API. */
export declare const profileStoreFilePrimitives: {
    trustedHome: typeof trustedHome;
    validateDirectories: typeof validateDirectories;
    status: typeof status;
    regularFile: typeof regularFile;
    digest: typeof digest;
    boundedOption: typeof boundedOption;
    locked: typeof locked;
    atomicReplace: typeof atomicReplace;
};
declare function boundedOption(value: number | undefined, fallback: number, minimum: number, maximum: number): number;
declare function digest(bytes: Buffer): string;
declare function status(path: string): Stats | undefined;
declare function validateDirectories(directory: string, create: boolean, allowMissing?: boolean, identities?: DirectoryIdentities): boolean;
declare function regularFile(path: string, maximum: number): ProfileFile;
export declare function validateSessionProfileId(id: unknown): asserts id is string;
export {};
//# sourceMappingURL=profile-store.d.ts.map