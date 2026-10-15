import type { PermissionControlSettings } from "../permission-settings.js";
import type { PermissionRuleDraft, PermissionRulesSaveRequest, PermissionRulesSaveResult } from "../permission-rules.js";
import type { PermissionInvoker, PermissionIssue } from "./permission-client.js";
export interface PermissionDraft {
    outsideReads: PermissionControlSettings["outsideReads"];
    webSearch: PermissionControlSettings["webSearch"];
    webFetch: PermissionControlSettings["webFetch"];
    upsert: readonly PermissionRuleDraft[];
    revoke: readonly string[];
    editor: PermissionRuleDraft | null;
}
export interface PermissionView {
    generation: number;
    sessionId: string | null;
    scope: "unknown" | "root" | "child";
    connected: boolean;
    reading: boolean;
    busy: "save" | null;
    rules: PermissionRulesSaveResult | null;
    base: PermissionRulesSaveResult["snapshot"] | null;
    draft: PermissionDraft | null;
    rulesIssue: PermissionIssue | null;
    dirty: boolean;
    notice: "saved" | null;
}
export declare function permissionChanges(view: PermissionView): PermissionRulesSaveRequest | null;
/** Borrowed native selection plus last-observed C state; never a Root or policy authority. */
export declare class PermissionController {
    private state;
    private listeners;
    private invoke;
    private connection;
    private owner;
    private request;
    private requestSequence;
    private timer?;
    private watchers;
    private disposed;
    readonly store: {
        getSnapshot: () => PermissionView;
        subscribe: (listener: () => void) => (() => void);
    };
    private publish;
    private cancel;
    private fence;
    bindConnection(invoke: PermissionInvoker | null, generation?: unknown): void;
    bindScope(sessionId: string | null, owner: object | null, scope: PermissionView["scope"]): void;
    watch(): () => void;
    dispose(): void;
    private live;
    private schedule;
    private issue;
    private synchronized;
    canSave(generation: number): boolean;
    refresh(generation: number, discard?: boolean): Promise<void>;
    edit(generation: number, patch: Partial<PermissionDraft>): void;
    stageRule(generation: number): void;
    stageRevoke(generation: number, id: string): void;
    private begin;
    save(generation: number): Promise<void>;
}
//# sourceMappingURL=permission-controller.d.ts.map