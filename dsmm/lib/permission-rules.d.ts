import type { Agent } from "@deepseek-ai/dsh-agent";
import type { NativePermissionCapabilityView } from "./permission-native-rules.js";
import type { PermissionControlSettings, PermissionRuleAction, PermissionWebPolicy } from "./permission-settings.js";
export type PermissionRuleMatch = {
    readonly kind: "outside-read";
    readonly path: string;
    readonly scope: "exact" | "tree";
} | {
    readonly kind: "shell";
    readonly executable: string;
    readonly command: string;
    readonly workingDirectory: string;
} | {
    readonly kind: "webSearch" | "webFetch";
};
export interface PermissionRuleDraft {
    readonly id: string;
    readonly action: Exclude<PermissionRuleAction, "inherit">;
    readonly match: PermissionRuleMatch;
}
export type PermissionRuleSource = {
    readonly kind: "operator";
    readonly sessionId: string;
    readonly savedAt: number;
} | {
    readonly kind: "user-import";
    readonly label: string;
};
export interface PermissionRule extends PermissionRuleDraft {
    readonly source: PermissionRuleSource;
    readonly revision: number;
    readonly revoked: boolean;
}
export interface PermissionRuleSnapshot {
    readonly revision: string;
    readonly policy: PermissionControlSettings;
}
export interface PermissionRulesStatus {
    readonly savedRevision: string;
    readonly runtimeRevision: string;
    readonly state: "synced" | "updating" | "unsynced";
    readonly mounted: boolean;
    readonly restartRequired: boolean;
}
export interface PermissionRulesSaveRequest {
    readonly expectedRevision: string;
    readonly changes?: {
        readonly outsideReads?: PermissionRuleAction;
        readonly webSearch?: PermissionWebPolicy;
        readonly webFetch?: PermissionWebPolicy;
    };
    readonly upsert?: readonly PermissionRuleDraft[];
    readonly revoke?: readonly string[];
}
export interface PermissionRulesSaveAuthority {
    readonly root: Agent;
    readonly peer: object;
    readonly signal: AbortSignal;
    /** Backend calls this after awaits and immediately before its durable CAS. Includes readonly. */
    assertCurrent(): void;
}
/** One central backend only. Every permission-affecting save (including imports) uses sync. */
export interface PermissionRulesBackend {
    assertWritable(root: Agent): void;
    read(authority: PermissionRulesSaveAuthority): Promise<PermissionRuleSnapshot>;
    save(request: PermissionRulesSaveRequest, authority: PermissionRulesSaveAuthority): Promise<PermissionRulesSaveResult>;
}
export interface PermissionRulesSaveResult {
    readonly snapshot: PermissionRuleSnapshot;
    readonly runtime: PermissionRulesStatus;
    readonly capabilities?: NativePermissionCapabilityView;
}
export declare function permissionRuleRow(value: unknown, required: readonly string[], optional?: readonly string[]): Record<string, unknown>;
/** Persistent backend source identity, not a counter or a prescribed hash format. */
export declare function permissionRevision(value: unknown): string;
export declare function parsePermissionRules(value: unknown): readonly PermissionRule[];
export declare function parsePermissionRulesSave(value: unknown): PermissionRulesSaveRequest;
/** Backend derives provenance from its verified Host authority, never from a client rule. */
export declare function applyPermissionRulesSave(previous: PermissionRuleSnapshot, input: PermissionRulesSaveRequest, source: PermissionRuleSource): PermissionControlSettings;
export declare function operatorPermissionRulesSource(authority: PermissionRulesSaveAuthority): PermissionRuleSource;
/** Import paths explicitly re-stamp all records; imported operator claims are not ACKs. */
export declare function importPermissionRules(input: readonly PermissionRuleDraft[], label: string, revision: number): readonly PermissionRule[];
export interface PermissionRulesUpdate {
    readonly expectedRevision: string;
}
/** In-process protocol owned by A's single CAS backend. No file watcher or persistence. */
export declare class PermissionRulesRuntimeSync {
    private readonly revoke;
    private snapshot;
    private savedRevision;
    private state;
    private update?;
    private lifetime;
    private retired;
    private readonly mounted;
    private desiredEnabled;
    constructor(initial: PermissionRuleSnapshot, revoke: () => void);
    private validate;
    status(): PermissionRulesStatus;
    getPolicy(): PermissionRuleSnapshot;
    get signal(): AbortSignal;
    /** Source backends override this entry; consumers never reconcile storage themselves. */
    refresh(): Promise<PermissionRuleSnapshot>;
    invalidate(): void;
    private assertLive;
    begin(expectedRevision: string): PermissionRulesUpdate;
    private check;
    /** Called only after CAS succeeded. notify must acknowledge all runtime revocation consumers. */
    commit(update: PermissionRulesUpdate, saved: PermissionRuleSnapshot, notify: (snapshot: PermissionRuleSnapshot) => Promise<void>): Promise<PermissionRulesStatus>;
    /** CAS failure or failed notification: reread authoritative storage, never publish the rejected request. */
    recover(update: PermissionRulesUpdate | undefined, authoritative: PermissionRuleSnapshot, notify: (snapshot: PermissionRuleSnapshot) => Promise<void>): Promise<PermissionRulesStatus>;
    retire(): void;
}
export declare function intersectPermissionActions(actions: readonly PermissionRuleAction[]): PermissionRuleAction;
//# sourceMappingURL=permission-rules.d.ts.map