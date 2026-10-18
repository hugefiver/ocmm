import { randomUUID } from "node:crypto";
const durations = new Set(["once", "session", "15min", "1h"]);
/** One Host store; it holds grant authority, never pending UI questions or retry work. */
export class TemporaryPermissionGrants {
    approval;
    gateway;
    now;
    grants = new Map();
    pending = new Map();
    permits = new Map();
    unregister;
    retired = false;
    constructor(approval, gateway, now = () => performance.now()) {
        this.approval = approval;
        this.gateway = gateway;
        this.now = now;
        this.unregister = gateway.registerApprovalPermits((delivery, permit) => this.validatePermit(delivery, permit));
    }
    integrity(execution) {
        if (this.retired || execution.signal.aborted)
            throw new Error("Temporary permission execution ended.");
        execution.assertIntegrity();
    }
    active(grant, execution) {
        if (!grant.active || grant.deadline <= this.now() || grant.execution.sessionSignal.aborted)
            return false;
        const previous = grant.execution;
        return previous.agent === execution.agent && previous.owner === execution.owner && previous.generation === execution.generation
            && previous.registration === execution.registration && previous.provider === execution.provider
            && previous.sessionId === execution.sessionId && previous.tool === execution.tool && previous.project === execution.project
            && (grant.scope ? grant.scope.allows(execution) : previous.target === execution.target);
    }
    delivery(peer, requestId, deliveryId) {
        const binding = this.pending.get(requestId), delivery = this.gateway.approvalDelivery(peer, requestId, deliveryId);
        if (!binding || binding.closed || binding.receipt !== undefined || !delivery || delivery.request !== binding.request || delivery.signal.aborted)
            throw new Error("Approval delivery is not current.");
        this.integrity(binding.execution);
        return { binding, delivery };
    }
    request(peer, requestId, deliveryId) {
        const { binding } = this.delivery(peer, requestId, deliveryId), exec = binding.execution;
        return Object.freeze({ requestId, deliveryId, sessionId: exec.sessionId, tool: exec.tool, summary: exec.summary, reusable: exec.reusable,
            ...(exec.scopes?.length ? { scopes: exec.scopes.map(({ id, summary }) => ({ id, summary })) } : {}) });
    }
    retain(peer, requestId, deliveryId, duration, scopeId = "exact") {
        if (!durations.has(duration))
            throw new TypeError("Invalid permission duration.");
        const { binding, delivery } = this.delivery(peer, requestId, deliveryId);
        const scope = scopeId === "exact" ? undefined : binding.execution.scopes?.find(scope => scope.id === scopeId);
        if (scopeId !== "exact" && !scope)
            throw new Error("Unsupported permission scope.");
        if (duration !== "once" && !binding.execution.reusable)
            throw new Error("This execution supports approval once only.");
        this.list(binding.execution.agent);
        if (duration !== "once" && this.grants.size >= 1024)
            throw new Error("Revoke an existing temporary approval before retaining another.");
        if (binding.intents.size >= 128)
            throw new Error("Too many approval intents for this pending request.");
        const retention = randomUUID();
        binding.intents.set(retention, { delivery, duration, scope });
        return retention;
    }
    permit(peer, requestId, deliveryId) {
        const { binding, delivery } = this.delivery(peer, requestId, deliveryId), execution = binding.execution;
        if (!execution.reusable)
            return null;
        execution.assertReusable();
        for (const grant of this.grants.values()) {
            if (!this.active(grant, execution))
                continue;
            for (const key of binding.permits)
                if (this.permits.get(key)?.delivery === delivery)
                    return key;
            const permit = randomUUID();
            this.permits.set(permit, { binding, delivery, grant });
            binding.permits.add(permit);
            return permit;
        }
        return null;
    }
    validatePermit(delivery, key) {
        const permit = this.permits.get(key);
        if (!permit || permit.delivery !== delivery || permit.binding.closed || permit.binding.receipt !== undefined || permit.binding.request !== delivery.request)
            return false;
        try {
            this.integrity(permit.binding.execution);
            permit.binding.execution.assertReusable();
            return !delivery.signal.aborted && this.active(permit.grant, permit.binding.execution);
        }
        catch {
            return false;
        }
    }
    async approve(request, execution) {
        this.integrity(execution);
        let binding;
        const finish = () => {
            if (!binding || binding.closed)
                return;
            binding.closed = true;
            for (const permit of binding.permits)
                this.permits.delete(permit);
            this.pending.delete(binding.id);
            this.approval.forgetSettlement(binding.id);
        };
        try {
            const outcome = await this.approval.request(request, { opened: id => {
                    binding = { id, request, execution, intents: new Map(), permits: new Set(), consumed: false, closed: false };
                    this.pending.set(id, binding);
                } });
            if (!binding)
                throw new Error("Compatible approval settlement runtime required.");
            this.integrity(execution);
            const receipt = this.approval.settlement(binding.id);
            binding.receipt = receipt;
            if (outcome !== "allowed-once")
                throw new Error("Native approval did not allow this execution.");
            if (!receipt)
                throw new Error("Native approval audit receipt unavailable.");
            const winner = receipt.winner;
            if (receipt.outcome !== outcome || receipt.requestId !== binding.id)
                throw new Error("Native approval receipt mismatch.");
            if (winner?.automatic) {
                if (receipt.source !== "temporary" || winner.source !== "temporary" || !winner.permit
                    || !this.permits.has(winner.permit))
                    throw new Error("Automatic approval source is not continuous.");
            }
            else if (receipt.source === "operator" && winner?.source === "operator" && winner.deliveryId && winner.retention) {
                const intent = binding.intents.get(winner.retention);
                if (intent && intent.delivery.deliveryId === winner.deliveryId && intent.duration !== "once" && execution.reusable && !intent.delivery.signal.aborted) {
                    try {
                        execution.assertReusable();
                        const id = randomUUID();
                        this.grants.set(id, { id, execution, duration: intent.duration, scope: intent.scope, active: true,
                            deadline: intent.duration === "session" ? Infinity : this.now() + (intent.duration === "15min" ? 900_000 : 3_600_000) });
                    }
                    catch { /* A failed retention check does not revoke a native manual same-call decision. */ }
                }
            }
            const checked = binding;
            const check = () => {
                this.integrity(execution);
                if (checked.closed)
                    throw new Error("Approval execution ended.");
                if (!winner?.automatic)
                    return;
                const permit = winner.permit && this.permits.get(winner.permit);
                if (!permit || permit.binding !== checked || permit.delivery.deliveryId !== winner.deliveryId
                    || permit.delivery.signal.aborted || !this.active(permit.grant, execution))
                    throw new Error("Temporary permission expired or was revoked.");
                execution.assertReusable();
                if (checked.closed || this.retired || !this.active(permit.grant, execution))
                    throw new Error("Temporary permission expired or was revoked.");
            };
            check();
            return Object.freeze({ check, consume() { check(); if (checked.consumed)
                    throw new Error("Approval execution already consumed."); checked.consumed = true; }, finish });
        }
        catch (error) {
            finish();
            throw error;
        }
    }
    list(agent) {
        const result = [];
        for (const [id, grant] of this.grants) {
            if (!grant.active || grant.deadline <= this.now() || grant.execution.sessionSignal.aborted) {
                this.grants.delete(id);
                continue;
            }
            if (grant.execution.agent !== agent)
                continue;
            result.push(Object.freeze({ id, sessionId: grant.execution.sessionId, tool: grant.execution.tool, summary: grant.scope?.summary ?? grant.execution.summary,
                duration: grant.duration, ...(grant.deadline === Infinity ? {} : { remainingMs: Math.max(0, grant.deadline - this.now()) }) }));
        }
        return Object.freeze(result);
    }
    revoke(agent, id) {
        const grant = this.grants.get(id);
        if (grant && grant.execution.agent !== agent)
            throw new Error("Grant belongs to another live session.");
        if (grant) {
            grant.active = false;
            this.grants.delete(id);
        }
        return this.list(agent);
    }
    revokeAgent(agent) {
        for (const [id, grant] of this.grants)
            if (grant.execution.agent === agent) {
                grant.active = false;
                this.grants.delete(id);
            }
    }
    dispose() { this.retired = true; for (const grant of this.grants.values())
        grant.active = false; this.grants.clear(); this.permits.clear(); this.pending.clear(); this.unregister(); }
}
//# sourceMappingURL=permission-temporary-grants.js.map