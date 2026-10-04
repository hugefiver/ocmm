import type { DsmmProfilesRemote } from "../profile-remote.js";
import type { ProfileErrorInfo, ProfileReadResult, ProfileSnapshot } from "../profile-types.js";
export interface ProfileEditor {
    id: string;
    content: string;
    revision: string | null;
}
export interface ProfilesNotice {
    key: "saved" | "applied" | "reset";
    id?: string;
}
export interface ProfilesIssue {
    kind: "domain" | "transport" | "assembly";
    code: string;
    message?: string;
    field?: string;
    source?: "selection";
}
export interface ProfilesViewSnapshot {
    snapshot: ProfileSnapshot | null;
    editor: ProfileEditor | null;
    dirty: boolean;
    busy: "refresh" | "read" | "save" | "apply" | "reset" | null;
    issue: ProfilesIssue | null;
    notice: ProfilesNotice | null;
    pendingEditor: string | null;
}
export interface ProfilesActions {
    refresh(): Promise<void>;
    open(id: string): Promise<void>;
    create(): Promise<void>;
    reload(): Promise<void>;
    editId(id: string): void;
    editContent(content: string): void;
    save(): Promise<void>;
    apply(): Promise<void>;
    reset(): Promise<void>;
    discardAndOpen(): Promise<void>;
    cancelDiscard(): void;
}
export declare const NEW_PROFILE_CONTENT = "{\n  \"version\": 1,\n  \"id\": \"new-profile\",\n  \"label\": \"New profile\",\n  \"settings\": {\n    // Runtime overlay only. Omitted fields inherit the deployment baseline.\n    \"defaultActive\": true\n  }\n}\n";
/** A valid external CAS conflict is reconcilable; corruption is never reset implicitly. */
export declare function canReconcileSelection(snapshot: ProfileSnapshot | null): boolean;
/** Stable native Store seat, with no filesystem or transport authority. */
export declare class ProfilesController {
    private readonly remote;
    private current;
    private accepted;
    private listeners;
    private generation;
    private disposed;
    readonly store: {
        getSnapshot: () => ProfilesViewSnapshot;
        subscribe: (listener: () => void) => (() => void);
    };
    readonly actions: ProfilesActions;
    constructor(remote: DsmmProfilesRemote);
    dispose(): void;
    private publish;
    private accept;
    private unwrap;
    private issue;
    private perform;
    refresh(): Promise<void>;
    open(id: string): Promise<void>;
    reload(): Promise<void>;
    private loadEditor;
    discardAndOpen(): Promise<void>;
    private editId;
    private editContent;
    save(): Promise<void>;
    apply(): Promise<void>;
    reset(): Promise<void>;
    private acceptSelection;
}
export type { ProfileErrorInfo, ProfileReadResult };
//# sourceMappingURL=controller.d.ts.map