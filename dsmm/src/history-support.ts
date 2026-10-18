import type { Context } from "@deepseek-ai/cordis";

/** Supply these native plugin configs before their constructors or configured restores run. */
export const DSMM_HISTORY_HOST_CONFIG = Object.freeze({
  agentLoop: Object.freeze({ activationAdmissionRequired: true }),
  sessionController: Object.freeze({ activateOnFollow: false }),
});

/** A present patched loop becomes fail-closed before asynchronous DSMM configuration loading. */
export function requireHistoryAdmission(ctx: Context): void {
  ctx.inject(["agentLoop"], scope => {
    const loop = scope.agentLoop;
    if (typeof loop.requireActivationAdmission === "function") loop.requireActivationAdmission();
  });
}
