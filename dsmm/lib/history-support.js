/** Supply these native plugin configs before their constructors or configured restores run. */
export const DSMM_HISTORY_HOST_CONFIG = Object.freeze({
    agentLoop: Object.freeze({ activationAdmissionRequired: true }),
    sessionController: Object.freeze({ activateOnFollow: false }),
});
/** Mount independently from the Core so failed configuration cannot reopen the Client gate. */
export function apply(ctx) {
    requireHistoryAdmission(ctx);
    ctx.events.on("webserver/index-inject", (rows) => {
        rows.push({ kind: "global", name: "__DSMM_HISTORY_REQUIRED__", value: true });
    });
}
/** A present patched loop becomes fail-closed before asynchronous DSMM configuration loading. */
export function requireHistoryAdmission(ctx) {
    ctx.inject(["agentLoop"], scope => {
        const loop = scope.agentLoop;
        if (typeof loop.requireActivationAdmission === "function")
            loop.requireActivationAdmission();
    });
}
//# sourceMappingURL=history-support.js.map