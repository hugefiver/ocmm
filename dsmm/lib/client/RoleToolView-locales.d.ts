export declare const ROLE_TOOL_NS = "conversation.dsmm-role-tool";
export declare const roleToolEn: {
    readonly call: "Call";
    readonly unknownTarget: "DSMM agent · target pending";
    readonly requested: "Requested";
    readonly actual: "Actual";
    readonly role: "Role";
    readonly category: "Category";
    readonly unknown: "Unknown";
    readonly preparing: "Preparing";
    readonly running: "Running";
    readonly result: "Tool returned · child completion not inferred";
    readonly background: "Started / handed off · child completion not confirmed";
    readonly error: "Tool error";
    readonly stopped: "Interrupted";
    readonly args: "Original arguments";
    readonly preparingArgs: "Arguments received so far";
    readonly output: "Complete result content";
    readonly failure: "Error details";
    readonly metadata: "Invocation metadata";
    readonly inspect: "Inspect tool call";
    readonly copy: "Copy";
    readonly copied: "Copied";
    readonly emptyArgs: "Arguments not available yet";
    readonly unavailable: "Actual identity unavailable; requested identity only";
    readonly level: "Level";
    readonly route: "Reported route";
    readonly routeSource: "Route source";
};
export declare const roleToolZh: Record<keyof typeof roleToolEn, string>;
declare module "@deepseek-ai/dsh-client-ui-slots" {
    interface LocaleNamespaceMap {
        "conversation.dsmm-role-tool": keyof typeof roleToolEn;
    }
}
//# sourceMappingURL=RoleToolView-locales.d.ts.map