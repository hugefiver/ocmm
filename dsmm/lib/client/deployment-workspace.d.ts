import type { ConfigForms } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { DeploymentController } from "./deployment-controller.js";
import type { PermissionController } from "./permission-controller.js";
import type { ConfigModule } from "./deployment-modules.js";
export type ConfigScope = "global" | "profile";
interface Destination {
    scope: ConfigScope;
    module: ConfigModule | null;
}
interface WorkspaceView extends Destination {
    pending: Destination | null;
    native: DeploymentController | null;
    revision: number;
}
/** Contribution-owned memory only. Navigation never saves, applies, or rebases drafts. */
export declare class DeploymentWorkspace {
    readonly core: DeploymentController;
    readonly permissions?: PermissionController | undefined;
    private state;
    private listeners;
    private forms;
    private profiles;
    private stopForm?;
    private stopNative?;
    private stopCore;
    private stopPermissions?;
    private identity;
    private globalVersion?;
    private sourceBlocked;
    private attachCurrentForm?;
    constructor(core: DeploymentController, permissions?: PermissionController | undefined);
    readonly getSnapshot: () => WorkspaceView;
    readonly subscribe: (listener: () => void) => (() => void);
    private changed;
    bindForms(forms: ConfigForms | null): void;
    private sync;
    controller(scope?: ConfigScope): DeploymentController | null;
    hasPending(): boolean;
    request(destination: Destination): void;
    continueEditing(): void;
    keepAndNavigate(): void;
    discardAndNavigate(): Promise<void>;
    save(): Promise<void>;
    dispose(): void;
}
export declare function deploymentWorkspace(core: DeploymentController, permissions?: PermissionController): DeploymentWorkspace;
export {};
//# sourceMappingURL=deployment-workspace.d.ts.map