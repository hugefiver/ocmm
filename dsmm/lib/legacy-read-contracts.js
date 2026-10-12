import { HarnessError } from "@deepseek-ai/dsh-llm";
export class LegacyReadUnavailable extends HarnessError {
    code;
    constructor(code) {
        super(code, code);
        this.code = code;
        this.name = "LegacyReadUnavailable";
    }
}
const owners = new WeakSet();
const callLeases = new WeakSet();
/** Trusted startup code only. Neither factory is a JSON/RPC attestation endpoint. */
export function createLegacyReadHostOwner(callbacks) {
    const owner = Object.freeze({
        captureClosedComposition: callbacks.captureClosedComposition.bind(callbacks),
        acquireParentTicket: callbacks.acquireParentTicket.bind(callbacks),
        assertParentTicket: callbacks.assertParentTicket.bind(callbacks),
        resolveChildAdmission: callbacks.resolveChildAdmission.bind(callbacks),
        resolveReadBindings: callbacks.resolveReadBindings.bind(callbacks),
        acquireCallContext: callbacks.acquireCallContext.bind(callbacks),
        revoke: callbacks.revoke.bind(callbacks),
        reportAuditFault: callbacks.reportAuditFault.bind(callbacks),
    });
    owners.add(owner);
    return owner;
}
export function isLegacyReadHostOwner(owner) {
    return typeof owner === "object" && owner !== null && owners.has(owner);
}
export function createLegacyReadCallLease(callbacks) {
    const lease = Object.freeze({ approval: callbacks.approval, signal: callbacks.signal,
        assertAvailable: callbacks.assertAvailable.bind(callbacks), finish: callbacks.finish.bind(callbacks), release: callbacks.release.bind(callbacks) });
    callLeases.add(lease);
    return lease;
}
export function isLegacyReadCallLease(lease) {
    return typeof lease === "object" && lease !== null && callLeases.has(lease);
}
//# sourceMappingURL=legacy-read-contracts.js.map