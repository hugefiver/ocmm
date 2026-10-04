import type { DshAgent, DshContext } from "./dsh-types.js";
import type { LoadedProfileSelection } from "./profile-store.js";
import type { ProfileReadResult, ProfileSaveRequest, ProfileSelectRequest, ProfileSelectionState, ProfileSnapshot } from "./profile-types.js";
import type { DsmmProfileDocument } from "./profiles.js";
import type { DsmmSettings, DsmmSettingsGetter } from "./settings.js";
export interface DsmmProfileRuntimeStore {
    loadSelection(): Promise<LoadedProfileSelection>;
    describe(): Promise<ProfileSnapshot>;
    read(id: string): Promise<ProfileReadResult>;
    save(request: ProfileSaveRequest): Promise<ProfileReadResult>;
    select<T>(request: ProfileSelectRequest, validateCandidate: (document: DsmmProfileDocument | null) => T | Promise<T>): Promise<{
        selection: ProfileSelectionState;
        prepared: T;
    }>;
}
export interface DsmmProfileRuntimeOptions {
    /** Trusted test/integration seam, never a wire-supplied path or callback. */
    validateCandidate?: (settings: DsmmSettings) => void | Promise<void>;
}
/** Selection admits new roots only; live children inherit exact runtime ownership. */
export declare class DsmmProfileRuntime {
    private readonly ctx;
    private readonly store;
    private readonly options;
    readonly getSettings: DsmmSettingsGetter;
    private current;
    private readonly baseline;
    private readonly bound;
    private selectionQueue;
    constructor(ctx: DshContext, baseline: DsmmSettings, store: DsmmProfileRuntimeStore, options?: DsmmProfileRuntimeOptions);
    initialize(): Promise<void>;
    admission(agent: DshAgent): ProfileSelectionState;
    describe(): Promise<ProfileSnapshot>;
    read(id: string): Promise<ProfileReadResult>;
    save(request: ProfileSaveRequest): Promise<ProfileReadResult>;
    select(request: ProfileSelectRequest): Promise<ProfileSnapshot>;
    private prepare;
    private agents;
    private bind;
    private validate;
}
/** No guessed home fallback: native deployment context owns this directory. */
export declare function createProfileRuntime(ctx: DshContext, baseline: DsmmSettings): Promise<DsmmProfileRuntime>;
//# sourceMappingURL=profile-runtime.d.ts.map