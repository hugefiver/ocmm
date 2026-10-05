import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import type { DsmmProfilesRemote } from "../profile-remote.js";
import type { ProfileErrorInfo, ProfileReadResult, ProfileSnapshot } from "../profile-types.js";
import type { SessionProfileSnapshot } from "../profile-types.js";
import type { ModelCatalog } from "@deepseek-ai/dsh-api-session-controller";
import type { JsonPath } from "./structured.js";
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
    catalog: ModelCatalog | null;
    catalogBusy: boolean;
    catalogUnavailable: boolean;
    currentSessionId: string | null;
    session: SessionProfileSnapshot | null;
    sessionChoice: string | null;
    sessionBusy: "read" | "apply" | "reset" | null;
    sessionIssue: ProfilesIssue | null;
    sessionNotice: "applied" | "reset" | null;
    invalidFields: string[];
    editorEpoch: number;
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
    editPath(path: JsonPath, value: unknown): void;
    editRoute(path: JsonPath, provider: string, model: string): void;
    moveFallback(role: string, from: number, to: number): void;
    refreshCatalog(): Promise<void>;
    refreshSession(): Promise<void>;
    chooseSessionProfile(id: string | null): void;
    applySession(): Promise<void>;
    resetSession(): Promise<void>;
    setFieldInvalid(field: string, invalid: boolean): void;
}
export interface ModelCatalogRemote {
    modelCatalog(): Promise<RemoteResult<ModelCatalog>>;
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
    private sessionGeneration;
    private catalogGeneration;
    private catalogRemote;
    readonly store: {
        getSnapshot: () => ProfilesViewSnapshot;
        subscribe: (listener: () => void) => (() => void);
    };
    readonly actions: ProfilesActions;
    constructor(remote: DsmmProfilesRemote);
    dispose(): void;
    attachCatalog(remote: ModelCatalogRemote | null): void;
    setSession(id: string | null): void;
    refreshCatalog(): Promise<void>;
    refreshSession(): Promise<void>;
    private selectSession;
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
    private editPath;
    private editRoute;
    private editFallbackOrder;
    save(): Promise<void>;
    apply(): Promise<void>;
    reset(): Promise<void>;
    private acceptSelection;
}
export type { ProfileErrorInfo, ProfileReadResult };
//# sourceMappingURL=controller.d.ts.map