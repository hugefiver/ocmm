import { randomUUID } from "node:crypto";
import type { TemporaryPermissionDuration, TemporaryPermissionGrantView } from "./permission-temporary-types.js";

export interface TemporaryApprovalWinner {
  readonly requestId: string; readonly deliveryId?: string; readonly answerId?: string;
  readonly candidate: string; readonly source: "operator" | "temporary" | "unknown";
  readonly automatic: boolean; readonly permit?: string; readonly retention?: string;
}
export interface TemporaryApprovalReceipt {
  readonly requestId: string; readonly generation: string; readonly outcome: string;
  readonly auditSeq: number; readonly source: TemporaryApprovalWinner["source"];
  readonly winner?: TemporaryApprovalWinner;
}
export interface TemporaryApprovalDelivery {
  readonly requestId: string; readonly deliveryId: string; readonly peer: object;
  readonly request: object; readonly signal: AbortSignal;
}
export interface TemporaryApprovalRuntime {
  request(request: object, options: { opened(id: string): void }): Promise<string>;
  settlement(id: string): TemporaryApprovalReceipt | undefined;
  forgetSettlement(id: string): void;
}
export interface TemporaryApprovalGateway {
  approvalDelivery(peer: object, requestId: string, deliveryId: string): TemporaryApprovalDelivery | undefined;
  registerApprovalPermits(verify: (delivery: TemporaryApprovalDelivery, permit: string) => boolean): () => void;
}
/** Captured by the actual execution adapter. All object identities are Host-only. */
export interface TemporaryPermissionExecution {
  readonly token: unknown; readonly agent: object; readonly owner: object; readonly generation: string | number;
  readonly registration: object; readonly provider: object; readonly sessionId: string;
  readonly tool: string; readonly project: string; readonly target: string; readonly summary: string;
  readonly reusable: boolean; readonly signal: AbortSignal; readonly sessionSignal: AbortSignal;
  /** Host-owned resolved resource and explicit additional scopes; never accepted from RPC. */
  readonly resource?: object;
  readonly scopes?: readonly TemporaryPermissionScope[];
  /** Integrity must not invalidate a manual same-call approval merely for a config revision. */
  assertIntegrity(): void;
  /** Rechecks deny, policy, provider, effective env and owner for automatic use. */
  assertReusable(): void;
}
export interface TemporaryPermissionScope {
  readonly id: string; readonly summary: string;
  allows(execution: TemporaryPermissionExecution): boolean;
}
interface Grant {
  id: string; execution: TemporaryPermissionExecution; duration: Exclude<TemporaryPermissionDuration, "once">;
  deadline: number; active: boolean;
  scope?: TemporaryPermissionScope;
}
interface Binding {
  request: object; execution: TemporaryPermissionExecution; id: string;
  intents: Map<string, { delivery: TemporaryApprovalDelivery; duration: TemporaryPermissionDuration; scope?: TemporaryPermissionScope }>;
  permits: Set<string>; receipt?: TemporaryApprovalReceipt; consumed: boolean; closed: boolean;
}
interface Permit { binding: Binding; delivery: TemporaryApprovalDelivery; grant: Grant }
const durations = new Set<TemporaryPermissionDuration>(["once", "session", "15min", "1h"]);

/** One Host store; it holds grant authority, never pending UI questions or retry work. */
export class TemporaryPermissionGrants {
  private readonly grants = new Map<string, Grant>();
  private readonly pending = new Map<string, Binding>();
  private readonly permits = new Map<string, Permit>();
  private readonly unregister: () => void;
  private retired = false;
  constructor(private readonly approval: TemporaryApprovalRuntime, private readonly gateway: TemporaryApprovalGateway,
    private readonly now: () => number = () => performance.now()) {
    this.unregister = gateway.registerApprovalPermits((delivery, permit) => this.validatePermit(delivery, permit));
  }
  private integrity(execution: TemporaryPermissionExecution): void {
    if (this.retired || execution.signal.aborted) throw new Error("Temporary permission execution ended.");
    execution.assertIntegrity();
  }
  private active(grant: Grant, execution: TemporaryPermissionExecution): boolean {
    if (!grant.active || grant.deadline <= this.now() || grant.execution.sessionSignal.aborted) return false;
    const previous = grant.execution;
    return previous.agent === execution.agent && previous.owner === execution.owner && previous.generation === execution.generation
      && previous.registration === execution.registration && previous.provider === execution.provider
      && previous.sessionId === execution.sessionId && previous.tool === execution.tool && previous.project === execution.project
      && (grant.scope ? grant.scope.allows(execution) : previous.target === execution.target);
  }
  private delivery(peer: object, requestId: string, deliveryId: string): { binding: Binding; delivery: TemporaryApprovalDelivery } {
    const binding = this.pending.get(requestId), delivery = this.gateway.approvalDelivery(peer, requestId, deliveryId);
    if (!binding || binding.closed || binding.receipt !== undefined || !delivery || delivery.request !== binding.request || delivery.signal.aborted) throw new Error("Approval delivery is not current.");
    this.integrity(binding.execution); return { binding, delivery };
  }
  request(peer: object, requestId: string, deliveryId: string) {
    const { binding } = this.delivery(peer, requestId, deliveryId), exec = binding.execution;
    return Object.freeze({ requestId, deliveryId, sessionId: exec.sessionId, tool: exec.tool, summary: exec.summary, reusable: exec.reusable,
      ...(exec.scopes?.length ? { scopes: exec.scopes.map(({ id, summary }) => ({ id, summary })) } : {}) });
  }
  retain(peer: object, requestId: string, deliveryId: string, duration: TemporaryPermissionDuration, scopeId = "exact"): string {
    if (!durations.has(duration)) throw new TypeError("Invalid permission duration.");
    const { binding, delivery } = this.delivery(peer, requestId, deliveryId);
    const scope = scopeId === "exact" ? undefined : binding.execution.scopes?.find(scope => scope.id === scopeId);
    if (scopeId !== "exact" && !scope) throw new Error("Unsupported permission scope.");
    if (duration !== "once" && !binding.execution.reusable) throw new Error("This execution supports approval once only.");
    this.list(binding.execution.agent);
    if (duration !== "once" && this.grants.size >= 1024) throw new Error("Revoke an existing temporary approval before retaining another.");
    if (binding.intents.size >= 128) throw new Error("Too many approval intents for this pending request.");
    const retention = randomUUID(); binding.intents.set(retention, { delivery, duration, scope }); return retention;
  }
  permit(peer: object, requestId: string, deliveryId: string): string | null {
    const { binding, delivery } = this.delivery(peer, requestId, deliveryId), execution = binding.execution;
    if (!execution.reusable) return null;
    execution.assertReusable();
    for (const grant of this.grants.values()) {
      if (!this.active(grant, execution)) continue;
      for (const key of binding.permits) if (this.permits.get(key)?.delivery === delivery) return key;
      const permit = randomUUID(); this.permits.set(permit, { binding, delivery, grant }); binding.permits.add(permit); return permit;
    }
    return null;
  }
  private validatePermit(delivery: TemporaryApprovalDelivery, key: string): boolean {
    const permit = this.permits.get(key);
    if (!permit || permit.delivery !== delivery || permit.binding.closed || permit.binding.receipt !== undefined || permit.binding.request !== delivery.request) return false;
    try {
      this.integrity(permit.binding.execution); permit.binding.execution.assertReusable();
      return !delivery.signal.aborted && this.active(permit.grant, permit.binding.execution);
    } catch { return false; }
  }
  async approve(request: object, execution: TemporaryPermissionExecution): Promise<{ check(): void; consume(): void; finish(): void }> {
    this.integrity(execution);
    let binding: Binding | undefined;
    const finish = (): void => {
      if (!binding || binding.closed) return;
      binding.closed = true;
      for (const permit of binding.permits) this.permits.delete(permit);
      this.pending.delete(binding.id); this.approval.forgetSettlement(binding.id);
    };
    try {
      const outcome = await this.approval.request(request, { opened: id => {
        binding = { id, request, execution, intents: new Map(), permits: new Set(), consumed: false, closed: false };
        this.pending.set(id, binding);
      } });
      if (!binding) throw new Error("Compatible approval settlement runtime required.");
      this.integrity(execution);
      const receipt = this.approval.settlement(binding.id); binding.receipt = receipt;
      if (outcome !== "allowed-once") throw new Error("Native approval did not allow this execution.");
      if (!receipt) throw new Error("Native approval audit receipt unavailable.");
      const winner = receipt.winner;
      if (receipt.outcome !== outcome || receipt.requestId !== binding.id) throw new Error("Native approval receipt mismatch.");
      if (winner?.automatic) {
        if (receipt.source !== "temporary" || winner.source !== "temporary" || !winner.permit
          || !this.permits.has(winner.permit)) throw new Error("Automatic approval source is not continuous.");
      } else if (receipt.source === "operator" && winner?.source === "operator" && winner.deliveryId && winner.retention) {
        const intent = binding.intents.get(winner.retention);
        if (intent && intent.delivery.deliveryId === winner.deliveryId && intent.duration !== "once" && execution.reusable && !intent.delivery.signal.aborted) {
          try {
            execution.assertReusable();
            const id = randomUUID();
            this.grants.set(id, { id, execution, duration: intent.duration, scope: intent.scope, active: true,
              deadline: intent.duration === "session" ? Infinity : this.now() + (intent.duration === "15min" ? 900_000 : 3_600_000) });
          } catch { /* A failed retention check does not revoke a native manual same-call decision. */ }
        }
      }
      const checked = binding;
      const check = (): void => {
        this.integrity(execution);
        if (checked.closed) throw new Error("Approval execution ended.");
        if (!winner?.automatic) return;
        const permit = winner.permit && this.permits.get(winner.permit);
        if (!permit || permit.binding !== checked || permit.delivery.deliveryId !== winner.deliveryId
          || permit.delivery.signal.aborted || !this.active(permit.grant, execution)) throw new Error("Temporary permission expired or was revoked.");
        execution.assertReusable();
        if (checked.closed || this.retired || !this.active(permit.grant, execution)) throw new Error("Temporary permission expired or was revoked.");
      };
      check();
      return Object.freeze({ check, consume() { check(); if (checked.consumed) throw new Error("Approval execution already consumed."); checked.consumed = true; }, finish });
    } catch (error) { finish(); throw error; }
  }
  list(agent: object): readonly TemporaryPermissionGrantView[] {
    const result: TemporaryPermissionGrantView[] = [];
    for (const [id, grant] of this.grants) {
      if (!grant.active || grant.deadline <= this.now() || grant.execution.sessionSignal.aborted) { this.grants.delete(id); continue; }
      if (grant.execution.agent !== agent) continue;
      result.push(Object.freeze({ id, sessionId: grant.execution.sessionId, tool: grant.execution.tool, summary: grant.scope?.summary ?? grant.execution.summary,
        duration: grant.duration, ...(grant.deadline === Infinity ? {} : { remainingMs: Math.max(0, grant.deadline - this.now()) }) }));
    }
    return Object.freeze(result);
  }
  revoke(agent: object, id: string): readonly TemporaryPermissionGrantView[] {
    const grant = this.grants.get(id);
    if (grant && grant.execution.agent !== agent) throw new Error("Grant belongs to another live session.");
    if (grant) { grant.active = false; this.grants.delete(id); }
    return this.list(agent);
  }
  revokeAgent(agent: object): void {
    for (const [id, grant] of this.grants) if (grant.execution.agent === agent) { grant.active = false; this.grants.delete(id); }
  }
  dispose(): void { this.retired = true; for (const grant of this.grants.values()) grant.active = false; this.grants.clear(); this.permits.clear(); this.pending.clear(); this.unregister(); }
}
