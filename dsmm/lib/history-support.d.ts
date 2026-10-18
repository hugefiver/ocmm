import type { Context } from "@deepseek-ai/cordis";
/** Supply these native plugin configs before their constructors or configured restores run. */
export declare const DSMM_HISTORY_HOST_CONFIG: Readonly<{
    agentLoop: Readonly<{
        activationAdmissionRequired: true;
    }>;
    sessionController: Readonly<{
        activateOnFollow: false;
    }>;
}>;
/** Mount independently from the Core so failed configuration cannot reopen the Client gate. */
export declare function apply(ctx: Context): void;
/** A present patched loop becomes fail-closed before asynchronous DSMM configuration loading. */
export declare function requireHistoryAdmission(ctx: Context): void;
//# sourceMappingURL=history-support.d.ts.map