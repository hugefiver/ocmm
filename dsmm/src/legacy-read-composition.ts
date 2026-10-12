import type { Agent } from "@deepseek-ai/dsh-agent";
import { symbols } from "@deepseek-ai/cordis";
import type { LegacyChildEvidence } from "./child-capture.js";
import { parseLegacyChildEvidence } from "./child-capture.js";
import { isLegacyReadHostOwner, LegacyReadUnavailable } from "./legacy-read-contracts.js";
import type { LegacyReadBindings, LegacyReadClosedSnapshot, LegacyReadCompositionLease, LegacyReadHostOwner } from "./legacy-read-contracts.js";

export interface LegacyReadComposition {
  readonly owner: LegacyReadHostOwner;
  view(): { state: "off" | "ready" | "closed" | "disposed"; generation: number; activeCalls: number; reason?: string };
  captureClosedComposition(): LegacyReadClosedSnapshot | undefined;
  publishGeneration(snapshot: LegacyReadClosedSnapshot, expectedGeneration: number): void;
  acquireLease(parent: Agent, child: Agent, evidence: LegacyChildEvidence, signal: AbortSignal): LegacyReadCompositionLease;
  closeForChange(reason: string): Promise<void>;
  closeForDispose(reason: string): Promise<void>;
}

function checkSnapshot(owner: LegacyReadHostOwner, snapshot: LegacyReadClosedSnapshot): void {
  if (snapshot?.owner !== owner || snapshot.coverage !== "host-owned-complete" || snapshot.mutation !== "owner-coordinated"
    || snapshot.fidelity !== "canonical-value-content-contexts" || !["never-ask", "coordinated-turn"].includes(snapshot.approval)
    || !snapshot.scopes?.length || !snapshot.bindings?.length || !Array.isArray(snapshot.policies)) throw new LegacyReadUnavailable("composition-unavailable");
  for (const scope of snapshot.scopes) {
    if (!scope.ctx || !scope.key || !Array.isArray(scope.ancestors)) throw new LegacyReadUnavailable("composition-unavailable");
  }
  for (const policy of snapshot.policies) {
    if (policy.semantics !== "audited-zero-or-once" || !policy.reference || !snapshot.scopes.some(scope => scope.ctx === policy.scope)
      || !Number.isSafeInteger(policy.order)) throw new LegacyReadUnavailable("composition-unavailable");
  }
  for (const binding of snapshot.bindings) {
    if (!binding.mount || !binding.config || !binding.parentProvider || !binding.childProvider || !binding.parentWorld || !binding.childWorld
      || !binding.parentFs || !binding.childFs || binding.definition?.name !== "read"
      || !binding.caps || [binding.caps.limit, binding.caps.maxBytes, binding.caps.maxLineLength, binding.caps.streamMinSize].some(cap => !Number.isSafeInteger(cap) || cap < 1)
      || !snapshot.scopes.some(scope => scope.key === binding.parent) || !snapshot.scopes.some(scope => scope.key === binding.child)) {
      throw new LegacyReadUnavailable("composition-unavailable");
    }
  }
}

export function createLegacyReadComposition(owner: LegacyReadHostOwner): LegacyReadComposition {
  if (!isLegacyReadHostOwner(owner)) throw new LegacyReadUnavailable("composition-unavailable");
  let state: "off" | "ready" | "closed" | "disposed" = "off";
  let generation = 0, reason: string | undefined, snapshot: LegacyReadClosedSnapshot | undefined;
  const lifetime = new AbortController();
  const active = new Set<LegacyReadCompositionLease>();
  const waiters = new Set<() => void>();
  let captures = new WeakSet<object>();
  const drain = () => active.size === 0 ? Promise.resolve() : new Promise<void>(resolve => waiters.add(resolve));
  const composition: LegacyReadComposition = {
    owner,
    view: () => ({ state, generation, activeCalls: active.size, ...(reason === undefined ? {} : { reason }) }),
    captureClosedComposition() {
      if (state === "ready" || state === "disposed" || active.size) throw new LegacyReadUnavailable("composition-unavailable");
      const captured = owner.captureClosedComposition();
      if (captured !== undefined) { checkSnapshot(owner, captured); captures.add(captured); }
      return captured;
    },
    publishGeneration(next, expected) {
      if (state === "ready" || state === "disposed" || active.size || generation !== expected || !captures.has(next)) throw new LegacyReadUnavailable("composition-unavailable");
      checkSnapshot(owner, next);
      // Copy attested inventory, retaining actual definition/service/policy identities.
      snapshot = Object.freeze({ ...next, scopes: Object.freeze(next.scopes.map(scope => Object.freeze({ ...scope, ancestors: Object.freeze([...scope.ancestors]) }))),
        policies: Object.freeze(next.policies.map(policy => Object.freeze({ ...policy }))), bindings: Object.freeze([...next.bindings]) });
      captures.delete(next);
      generation++; state = "ready"; reason = undefined;
    },
    acquireLease(parent, child, rawEvidence, signal) {
      if (state !== "ready" || snapshot === undefined) throw new LegacyReadUnavailable("composition-unavailable");
      signal.throwIfAborted();
      const evidence = parseLegacyChildEvidence(rawEvidence);
      if (parent === child || parent.id !== evidence.parentSessionId || child.id !== evidence.childSessionId
        || child.session.header.parentSession !== parent.id || parent.ctx.agents.get(parent.id) !== parent || child.ctx.agents.get(child.id) !== child
        || !child.ctx.agents.isOwnedBy(child.id, parent) || !evidence.toolFilter?.allow?.includes("read") || evidence.toolFilter.deny?.includes("read")) throw new LegacyReadUnavailable("evidence-unavailable");
      const acquiredGeneration = generation, acquiredSnapshot = snapshot;
      const ticket = owner.acquireParentTicket(parent);
      if (ticket.parent !== parent) throw new LegacyReadUnavailable("evidence-unavailable");
      owner.assertParentTicket(ticket);
      const original = owner.resolveChildAdmission(parent, child, rawEvidence, ticket);
      if (original.source !== "physical-old" || original.evidence !== rawEvidence || original.originalCapture !== undefined
        || !original.physicalRecords.length || !Object.isFrozen(original.admission)) throw new LegacyReadUnavailable("evidence-unavailable");
      const bindings = snapshot.bindings.find(binding => binding.parent === parent && binding.child === child);
      if (bindings === undefined) throw new LegacyReadUnavailable("provenance-unavailable");
      const merged = AbortSignal.any([signal, ticket.signal, original.childLifetime, lifetime.signal]);
      merged.throwIfAborted();
      if (state !== "ready" || generation !== acquiredGeneration || snapshot !== acquiredSnapshot) throw new LegacyReadUnavailable("composition-unavailable");
      let released = false;
      const lease = Object.freeze({ owner, generation, signal: merged, ticket, bindings, approval: snapshot.approval,
        assertActive() {
          if (released || !active.has(lease)) throw new LegacyReadUnavailable("lifetime-unavailable");
          merged.throwIfAborted(); owner.assertParentTicket(ticket);
        },
        release() {
          if (released) return;
          released = true; active.delete(lease);
          if (!active.size) { for (const resolve of waiters) resolve(); waiters.clear(); }
        },
      }) as LegacyReadCompositionLease;
      active.add(lease);
      return lease;
    },
    closeForChange(nextReason) {
      captures = new WeakSet<object>();
      if (state !== "disposed") { state = "closed"; reason = nextReason; }
      return drain();
    },
    closeForDispose(nextReason) {
      captures = new WeakSet<object>();
      if (state !== "disposed") {
        state = "disposed"; reason = nextReason;
        try { owner.revoke(nextReason); } finally { lifetime.abort(nextReason); }
      }
      return drain();
    },
  };
  return composition;
}

export function assertLegacyReadBindings(lease: LegacyReadCompositionLease, current: LegacyReadBindings): void {
  const expected = lease.bindings;
  const original = (value: object | undefined) => value === undefined ? undefined : Reflect.get(value, symbols.original) ?? value;
  if (current !== expected || current.parent.ctx.get("tools")?.get("read", current.parent) !== current.definition
    || original(current.child.ctx.get("fs")) !== original(current.childFs) || original(current.parent.ctx.get("fs")) !== original(current.parentFs)
    || current.parentProvider !== current.childProvider || current.parentWorld !== current.childWorld) throw new LegacyReadUnavailable("provenance-unavailable");
  lease.assertActive();
}
