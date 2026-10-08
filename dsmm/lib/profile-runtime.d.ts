import type { DshAgent, DshContext } from "./dsh-types.js";
import type { LoadedProfileSelection, LoadedSessionProfileSelection, SessionProfileCommit } from "./profile-store.js";
import type { ProfileReadResult, ProfileSaveRequest, ProfileSelectRequest, ProfileSelectionState, ProfileSnapshot, SessionModeSelectRequest, SessionProfileSelectRequest, SessionProfileSnapshot } from "./profile-types.js";
import type { DsmmProfileDocument } from "./profiles.js";
import type { DsmmProfileAdmission, DsmmSettings, DsmmSettingsGetter } from "./settings.js";
import { DeepworkModeController } from "./state.js";
import type { DsmmDeploymentSnapshot } from "./settings.js";
import type { DeploymentAdmissionView } from "./profile-types.js";
export interface DsmmProfileRuntimeStore {
    readonly readOnly?: boolean;
    readonly origin?: "central" | "legacy" | "explicit";
    readonly writeRestriction?: string;
    loadSelection(): Promise<LoadedProfileSelection>;
    describe(): Promise<ProfileSnapshot>;
    read(id: string): Promise<ProfileReadResult>;
    save(request: ProfileSaveRequest): Promise<ProfileReadResult>;
    select<T>(request: ProfileSelectRequest, validateCandidate: (document: DsmmProfileDocument | null) => T | Promise<T>): Promise<{
        selection: ProfileSelectionState;
        prepared: T;
    }>;
    loadSessionSelection(sessionId: string): Promise<LoadedSessionProfileSelection>;
    selectSession<T>(request: SessionProfileSelectRequest, epoch: string, validateCandidate: (document: DsmmProfileDocument | null) => T | Promise<T>, commit: SessionProfileCommit<T>): Promise<{
        selection: LoadedSessionProfileSelection;
        prepared: T;
    }>;
}
export interface DsmmProfileRuntimeOptions {
    /** Trusted test/integration seam, never a wire-supplied path or callback. */
    validateCandidate?: (settings: DsmmSettings) => void | Promise<void>;
    modeController?: DeepworkModeController;
    /** Awaited once per new ordinary root; never used by children or idle switches. */
    readDesired?: () => Promise<DsmmDeploymentSnapshot>;
    startup?: DsmmDeploymentSnapshot;
    /** Frozen actual native startup substrate; omission is the trusted legacy seam. */
    subagentCapabilities?: {
        backgroundJobs: boolean;
        continuable: boolean;
    };
}
interface AdmittedProfile extends ProfileSelectionState, DsmmProfileAdmission {
    baseline: DsmmSettings;
}
/** Global defaults admit new roots; scoped idle switches replace one root's epoch. */
export declare class DsmmProfileRuntime {
    private readonly ctx;
    private readonly store;
    private readonly options;
    readonly getSettings: DsmmSettingsGetter;
    private current;
    private currentDocument;
    private readonly baseline;
    private readonly bound;
    private readonly admitting;
    private readonly disposedAgents;
    private readonly switching;
    private disposed;
    private selectionQueue;
    private readonly mode;
    constructor(ctx: DshContext, baseline: DsmmSettings, store: DsmmProfileRuntimeStore, options?: DsmmProfileRuntimeOptions);
    initialize(): Promise<void>;
    admission(agent?: DshAgent): AdmittedProfile;
    getSession(agent: DshAgent): Promise<SessionProfileSnapshot>;
    /** The fourth argument is trusted native caller authority, never wire data. */
    selectMode(request: SessionModeSelectRequest, agent: DshAgent, signal?: AbortSignal, assertAuthority?: () => void): Promise<SessionProfileSnapshot>;
    selectSession(request: SessionProfileSelectRequest, agent: DshAgent, signal?: AbortSignal, assertAuthority?: () => void): Promise<SessionProfileSnapshot>;
    describe(): Promise<ProfileSnapshot>;
    read(id: string): Promise<ProfileReadResult>;
    save(request: ProfileSaveRequest): Promise<ProfileReadResult>;
    getStartupSettings(): DsmmSettings;
    /** Preview uses the admission path but neither binds nor creates an Agent. */
    previewDeployment(desired: DsmmDeploymentSnapshot): DeploymentAdmissionView;
    describeDeployment(agent?: DshAgent): Promise<{
        startup: DsmmDeploymentSnapshot | null;
        desired: DsmmDeploymentSnapshot | null;
        admission: DsmmProfileAdmission;
    }>;
    select(request: ProfileSelectRequest): Promise<ProfileSnapshot>;
    private prepare;
    private profileAdmission;
    private declaredProfileModel;
    private agents;
    private bind;
    private owner;
    private assertRoot;
    private admit;
    private validate;
}
/** No guessed home fallback: native deployment context owns this directory. */
export declare function createProfileRuntime(ctx: DshContext, baseline: DsmmSettings, options?: DsmmProfileRuntimeOptions): Promise<DsmmProfileRuntime>;
export {};
//# sourceMappingURL=profile-runtime.d.ts.map