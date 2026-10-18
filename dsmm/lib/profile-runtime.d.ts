import type { DshAgent, DshContext } from "./dsh-types.js";
import type { LoadedProfileSelection, LoadedSessionProfileSelection, ProfileCommit, SessionProfileCommit } from "./profile-store.js";
import type { ProfileReadResult, ProfileSaveRequest, ProfileSelectRequest, ProfileSelectionState, ProfileSnapshot, SessionModeSelectRequest, SessionProfileSelectRequest, SessionProfileSnapshot, DeploymentAdmissionView, SubagentRuntimeAdmissionView } from "./profile-types.js";
import type { DsmmProfileDocument } from "./profiles.js";
import type { DsmmProfileAdmission, DsmmSettings, DsmmSettingsGetter, DsmmDeploymentSnapshot } from "./settings.js";
import { DeepworkModeController } from "./state.js";
import type { DsmmMountedPermissionGetter } from "./modules.js";
export interface DsmmProfileRuntimeStore {
    readonly profileDir?: string;
    readonly readOnly?: boolean;
    readonly origin?: "central" | "legacy" | "explicit";
    readonly writeRestriction?: string;
    loadSelection(): Promise<LoadedProfileSelection>;
    describe(): Promise<ProfileSnapshot>;
    read(id: string): Promise<ProfileReadResult>;
    save(request: ProfileSaveRequest, assertCurrent?: () => void): Promise<ProfileReadResult>;
    select<T>(request: ProfileSelectRequest, validate: (document: DsmmProfileDocument | null) => T | Promise<T>, commit?: ProfileCommit<T>, assertCurrent?: () => void): Promise<{
        selection: ProfileSelectionState;
        prepared: T;
    }>;
    loadSessionSelection(id: string): Promise<LoadedSessionProfileSelection>;
    selectSession<T>(request: SessionProfileSelectRequest, epoch: string, validate: (document: DsmmProfileDocument | null) => T | Promise<T>, commit: SessionProfileCommit<T>): Promise<{
        selection: LoadedSessionProfileSelection;
        prepared: T;
    }>;
}
export interface DsmmProfileRuntimeOptions {
    runtimeView?: () => SubagentRuntimeAdmissionView;
    validateCandidate?: (settings: DsmmSettings) => void | Promise<void>;
    modeController?: DeepworkModeController;
    readDesired?: () => Promise<DsmmDeploymentSnapshot>;
    startup?: DsmmDeploymentSnapshot;
    getMountedPermission?: DsmmMountedPermissionGetter;
}
export type DsmmSessionActionUnavailableReason = import("./profile-types.js").SessionActionUnavailableReason;
export type DsmmSessionProfileSnapshot = SessionProfileSnapshot;
interface AdmittedProfile extends ProfileSelectionState, DsmmProfileAdmission {
    baseline: DsmmSettings;
}
export interface PreparedHistoryProfile {
    readonly admission: DsmmProfileAdmission;
    readonly label?: string;
    assertCurrent(): undefined;
    revalidate(signal: AbortSignal): Promise<void>;
}
/** Configuration transactions and immutable snapshots; native admission owns Agent binding. */
export declare class DsmmProfileRuntime {
    private readonly ctx;
    private readonly store;
    private readonly options;
    readonly getSettings: DsmmSettingsGetter;
    private readonly baseline;
    private current;
    private document;
    private readonly bound;
    private readonly observations;
    private readonly historyAdmissions;
    private disposed;
    private queue;
    private readonly mode;
    constructor(ctx: DshContext, baseline: DsmmSettings, store: DsmmProfileRuntimeStore, options?: DsmmProfileRuntimeOptions);
    initialize(): Promise<void>;
    private assertCurrent;
    admission(agent?: DshAgent): AdmittedProfile;
    hasAdmission(agent: DshAgent): boolean;
    /** Called only by the awaited native creation owner after all Agent-scoped installation. */
    publish(agent: DshAgent, admission: DsmmProfileAdmission): void;
    release(agent: DshAgent): void;
    /** Prepare an explicit current choice; historical selection files and epochs are not read. */
    prepareHistory(profileId: string | null, signal: AbortSignal): Promise<PreparedHistoryProfile>;
    prepareRoot(agent: DshAgent, signal: AbortSignal): Promise<AdmittedProfile>;
    getSession(agent: DshAgent): Promise<DsmmSessionProfileSnapshot>;
    private sessionSnapshot;
    selectMode(request: SessionModeSelectRequest, agent: DshAgent, signal?: AbortSignal, authority?: () => void): Promise<DsmmSessionProfileSnapshot>;
    selectSession(request: SessionProfileSelectRequest, agent: DshAgent, signal?: AbortSignal, authority?: () => void): Promise<SessionProfileSnapshot>;
    private assertRoot;
    describe(): Promise<ProfileSnapshot>;
    read(id: string): Promise<ProfileReadResult>;
    save(request: ProfileSaveRequest, authority?: () => void): Promise<ProfileReadResult>;
    getStartupSettings(): DsmmSettings;
    previewDeployment(desired: DsmmDeploymentSnapshot): DeploymentAdmissionView;
    describeDeployment(agent?: DshAgent): Promise<{
        startup: DsmmDeploymentSnapshot | null;
        desired: DsmmDeploymentSnapshot | null;
        admission: AdmittedProfile | null;
    }>;
    select(request: ProfileSelectRequest, authority?: () => void): Promise<ProfileSnapshot>;
    private prepare;
    private profileAdmission;
    private roleAvailability;
    private editorRoles;
    private sessionActions;
    private validate;
    private observedSelection;
    private runtimeView;
}
export declare function createProfileRuntime(ctx: DshContext, baseline: DsmmSettings, options?: DsmmProfileRuntimeOptions): Promise<DsmmProfileRuntime>;
export {};
//# sourceMappingURL=profile-runtime.d.ts.map