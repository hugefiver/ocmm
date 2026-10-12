import type { DsmmChildrenRemote } from "../role-control-remote.js";
import type { BackgroundTransitionResult, ChildSessionSnapshot, RoleControlAvailability, RoleControlDescendantsSnapshot, RoleControlErrorInfo, SubagentInterruptReceipt, SubagentPromptReceipt, SubagentPromptRequest } from "../role-control-types.js";
export interface ChildrenIssue extends Partial<RoleControlErrorInfo> {
    kind: "domain" | "transport" | "protocol" | "local";
    code: RoleControlErrorInfo["code"];
    unknown?: boolean;
}
export type ChildImage = Extract<SubagentPromptRequest["content"][number], {
    type: "image";
}>;
export interface ChildDraft {
    text: string;
    delivery: "queue" | "steer";
    images: readonly ChildImage[];
    imageBusy: boolean;
    uncertain: boolean;
}
export type ChildOutcome = {
    kind: "background";
    receipt: BackgroundTransitionResult;
} | {
    kind: "prompt";
    receipt: SubagentPromptReceipt;
} | {
    kind: "interrupt";
    receipt: SubagentInterruptReceipt;
};
export interface ChildrenSnapshot {
    sessionId: string | null;
    generation: number;
    snapshot: ChildSessionSnapshot | null;
    descendants: RoleControlDescendantsSnapshot | null;
    fresh: boolean;
    reading: boolean;
    issue: ChildrenIssue | null;
    descendantIssue: ChildrenIssue | null;
    drafts: ReadonlyMap<string, ChildDraft>;
    pending: ReadonlyMap<string, "background" | "prompt" | "interrupt">;
    issues: ReadonlyMap<string, ChildrenIssue>;
    outcomes: ReadonlyMap<string, ChildOutcome>;
}
export interface ChildrenActions {
    refresh(generation: number): Promise<void>;
    background(generation: number, toolCallId: string, runId: string): Promise<void>;
    prompt(generation: number, childId: string): Promise<void>;
    interrupt(generation: number, childId: string): Promise<void>;
    editText(generation: number, childId: string, text: string): void;
    setDelivery(generation: number, childId: string, delivery: "queue" | "steer"): void;
    addImages(generation: number, childId: string, files: readonly File[]): Promise<void>;
    removeImage(generation: number, childId: string, image: ChildImage): void;
    acknowledgeUnknown(generation: number, childId: string): void;
}
export declare const EMPTY_CHILD_DRAFT: ChildDraft;
export declare const childActionKey: (childId: string) => string;
export declare const runActionKey: (toolCallId: string, runId: string) => string;
export declare function enabled(availability: RoleControlAvailability | undefined): boolean;
/** Client presentation/draft state only. Host owns all run, inbox and admission authority. */
export declare class ChildrenController {
    private readonly remote;
    private current;
    private owner;
    private connection;
    private connectionGeneration;
    private observedAdmission;
    private disposed;
    private listeners;
    readonly store: {
        getSnapshot: () => ChildrenSnapshot;
        subscribe: (listener: () => void) => (() => void);
    };
    readonly actions: ChildrenActions;
    constructor(remote: DsmmChildrenRemote);
    dispose(): void;
    bindConnection(connection: object | null, generation?: unknown): void;
    bindScope(sessionId: string | null, owner: object | null): void;
    observeAdmission(sessionId: string, epoch: string): void;
    private publish;
    private fence;
    private live;
    private available;
    private draft;
    private child;
    private editDraft;
    private publishDraft;
    private issue;
    private unwrap;
    refresh(generation: number): Promise<void>;
    private begin;
    private finish;
    private refuse;
    private accepted;
    background(generation: number, toolCallId: string, runId: string): Promise<void>;
    private canControl;
    prompt(generation: number, id: string): Promise<void>;
    interrupt(generation: number, id: string): Promise<void>;
    addImages(generation: number, id: string, files: readonly File[]): Promise<void>;
}
//# sourceMappingURL=children-controller.d.ts.map