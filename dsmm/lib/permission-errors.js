export class PermissionRefusal extends Error {
    code;
    constructor(code) {
        super("The Host refused the permission operation.");
        this.code = code;
    }
}
/** A policy lifetime may end while the native answerer is still waiting. */
export async function permissionOutcome(answer, signal, cancelled) {
    if (signal.aborted)
        return cancelled;
    let abort;
    const ended = new Promise(resolve => { abort = () => resolve(cancelled); signal.addEventListener("abort", abort, { once: true }); });
    try {
        return await Promise.race([Promise.resolve().then(answer), ended]);
    }
    finally {
        signal.removeEventListener("abort", abort);
    }
}
//# sourceMappingURL=permission-errors.js.map