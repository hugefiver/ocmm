import type { ConfigFormSnapshot, ConfigForm } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { ConnectionGenerationState } from "@deepseek-ai/dsh-client-connection/client";
import type { DsmmConfigRemote } from "../profile-remote.js";
import type { DeploymentEditorSnapshot, SessionProfileSnapshot } from "../profile-types.js";
export type DeploymentIssue = "unavailable" | "not-owned" | "conflict" | "validation" | "transport" | "unconfirmed";
export interface DeploymentView {
    snapshot: DeploymentEditorSnapshot | null;
    draft: Record<string, unknown>;
    dirty: boolean;
    busy: boolean;
    issue: DeploymentIssue | null;
    saved: boolean;
    session: SessionProfileSnapshot | null;
    raw: Readonly<Record<string, {
        text: string;
        invalid: boolean;
    }>>;
    invalidFields: readonly string[];
    refreshRequired: boolean;
}
export interface NativePageForm {
    state: ConfigFormSnapshot<Record<string, unknown>>;
    mutate: ConfigForm<Record<string, unknown>>["mutate"];
}
/** Drafts and CAS baselines, never a second configuration authority. */
export declare class DeploymentController {
    private readonly remote;
    readonly layer: "global" | "profile";
    readonly rowNamespace: string | null;
    private state;
    private listeners;
    private generation;
    private disposed;
    private baseline;
    private form;
    private invalid;
    private connection;
    private connectionBaseline;
    private stopConnection;
    private children;
    constructor(remote: DsmmConfigRemote, layer: "global" | "profile", rowNamespace?: string | null);
    readonly getSnapshot: () => DeploymentView;
    readonly subscribe: (listener: () => void) => (() => void);
    dispose(): void;
    bindConnection(source: ConnectionGenerationState): void;
    forProfile(namespace: string): DeploymentController;
    private currentConnection;
    setSession(session: SessionProfileSnapshot | null): void;
    private publish;
    attachForm(form: NativePageForm | null): void;
    setInvalid(path: string, invalid: boolean): void;
    setRaw(path: string, text: string, invalid: boolean): void;
    clearRaw(prefix: string): void;
    canEdit(): boolean;
    canSave(): boolean;
    pendingPaths(): readonly string[];
    canWriteProfile(snapshot?: DeploymentEditorSnapshot | null): boolean;
    edit(path: readonly string[], value: unknown): void;
    refresh(discard?: boolean): Promise<void>;
    save(): Promise<void>;
}
//# sourceMappingURL=deployment-controller.d.ts.map