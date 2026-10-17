import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { SessionId } from "@deepseek-ai/dsh-session";
import { SubagentError } from "@deepseek-ai/dsh-subagent";
import type { ChildAdmissionCompletion, DsmmChildAdmissionAuthority, LegacyChildEvidenceReader, ParentAdmissionTicket } from "./child-admission-contract.js";
import type { ChildAdmissionEvidence, ChildAdmissionEvidenceView, ChildEvidenceField } from "./child-capture.js";
import { parseChildAdmissionCapture, parseChildAdmissionEvidenceView, parseLegacyChildEvidence } from "./child-capture.js";
import type { DeliveryPolicyBinding, DsmmDeliveryAuthority, ParentAdmissionTicket as NativeTicket } from "./delivery-authority.js";
import type { DshAgent } from "./dsh-types.js";
import { NativeChildEvidenceReader, assertNativeChildCapture } from "./native-child-evidence.js";
import type { NativeChildHistory } from "./native-child-evidence.js";
import type { DsmmProfileAdmission, DsmmSettings } from "./settings.js";

export interface ChildAdmissionCollaborators {
  /** A owns resident/durable capture lookup and corruption-vs-absence decisions. */
  resolveOriginalChildEvidence(ticket: ParentAdmissionTicket, childId: string, signal: AbortSignal, readLegacy: LegacyChildEvidenceReader): Promise<ChildAdmissionEvidence>;
  /** B owns fresh invocation capture, role identity and target ceiling validation. */
  childAdmission: ChildAdmissionCompletion;
  assertDelivery(ticket: ParentAdmissionTicket, childId: string, evidence: ChildAdmissionEvidence): void;
  classifyParent(parent: Agent): "dsmm" | "native";
}
export interface ChildAdmissionBindingOptions {
  readonly ctx: Context;
  readonly owner: object;
  readonly deliveryAuthority: DsmmDeliveryAuthority<DsmmProfileAdmission, ChildAdmissionEvidence>;
  readonly collaborators: ChildAdmissionCollaborators;
  readonly nativeSubstrate: DsmmSettings;
  /** The exact public Host query service, borrowed in the same scope as the native catalog. */
  readonly nativeHistory: NativeChildHistory;
}

function unauthorized(): never { throw new SubagentError("Child admission requires an issued ticket and exact native Agent owner", "UNAUTHORIZED"); }

/** Connects A's structural contract to C1's opaque ticket provenance without manufacturing Agents. */
export function createChildAdmissionBinding(options: ChildAdmissionBindingOptions) {
  const { ctx, owner, deliveryAuthority: delivery, collaborators } = options;
  const nativeTickets = new WeakMap<ParentAdmissionTicket, NativeTicket<DsmmProfileAdmission>>();
  const profileTickets = new WeakMap<NativeTicket<DsmmProfileAdmission>, ParentAdmissionTicket>();
  const registeredParents = new WeakMap<DshAgent, Agent>();
  const exact = (parent: DshAgent): Agent => {
    if (parent.id === undefined) unauthorized();
    const actual = ctx.agents.get(SessionId(parent.id));
    if (actual === undefined || actual !== parent) unauthorized();
    return actual;
  };
  const assertNative = (ticket: NativeTicket<DsmmProfileAdmission>): void => {
    delivery.assertTicket(ticket);
    if (ticket.owner !== owner || exact(ticket.parent as unknown as DshAgent) !== ticket.parent) unauthorized();
  };
  const profileTicket = (ticket: NativeTicket<DsmmProfileAdmission>): ParentAdmissionTicket => {
    assertNative(ticket);
    let borrowed = profileTickets.get(ticket);
    if (borrowed === undefined) {
      borrowed = Object.freeze({ parent: ticket.parent as unknown as DshAgent, owner: ticket.owner, admission: ticket.admission,
        parentEpoch: ticket.parentEpoch, signal: ticket.signal });
      profileTickets.set(ticket, borrowed); nativeTickets.set(borrowed, ticket);
    }
    return borrowed;
  };
  const nativeTicket = (ticket: ParentAdmissionTicket): NativeTicket<DsmmProfileAdmission> => {
    const actual = nativeTickets.get(ticket);
    if (actual === undefined) unauthorized();
    assertNative(actual);
    return actual;
  };
  const reader = new NativeChildEvidenceReader(ctx, assertNative, options.nativeHistory);
  const readLegacy: LegacyChildEvidenceReader = () => { throw new SubagentError("Child admission without a current capture or trusted fresh invocation is unsupported; no evidence is synthesized", "UNSUPPORTED_CAPABILITY"); };
  const resolve = async (ticket: NativeTicket<DsmmProfileAdmission>, id: string, callerSignal: AbortSignal): Promise<ChildAdmissionEvidence> => {
    assertNative(ticket);
    const signal = AbortSignal.any([ticket.signal, callerSignal]);
    signal.throwIfAborted();
    const evidence = await collaborators.resolveOriginalChildEvidence(profileTicket(ticket), id, signal, readLegacy);
    signal.throwIfAborted(); assertNative(ticket);
    if ("mode" in evidence || evidence.version !== 3) throw new SubagentError("Only current child capture V3 is supported", "UNSUPPORTED_CAPABILITY");
    const parsed = parseChildAdmissionCapture(evidence);
    const facts = await reader.read(ticket, id, signal);
    signal.throwIfAborted(); assertNative(ticket);
    assertNativeChildCapture(parsed, facts);
    return evidence;
  };
  const authority: DsmmChildAdmissionAuthority = {
    view: () => delivery.view(),
    registerParent: (parent, admission, requestedOwner) => {
      if (requestedOwner !== owner) unauthorized();
      const actual = exact(parent);
      delivery.registerParent(actual, admission, owner);
      registeredParents.set(parent, actual);
    },
    acquireParentTicket: parent => profileTicket(delivery.acquireParentTicket(exact(parent))),
    resolveChildEvidence: async (ticket, id, signal) => resolve(nativeTicket(ticket), id, signal),
    prepareParentAdmission: (parent, epoch, next) => delivery.prepareParentAdmission(exact(parent), epoch, next),
    assertCoreParentAdmission: (parent, requestedOwner, expected) => {
      if (requestedOwner !== owner) unauthorized();
      delivery.assertCoreParentAdmission(exact(parent), owner, expected);
    },
    prepareCoreParentAdmission: (parent, requestedOwner, expected, next) => {
      if (requestedOwner !== owner) unauthorized();
      delivery.prepareCoreParentAdmission(exact(parent), owner, expected, next);
    },
    publishParentAdmission: (parent, epoch, next, install) => delivery.publishParentAdmission(exact(parent), epoch, next, install),
    // Revocation may run during registry removal: use the exact object, never look up a replacement by ID.
    revokeParent: (parent, reason) => {
      const actual = registeredParents.get(parent);
      if (actual !== undefined) { delivery.withdrawParent(actual, reason); registeredParents.delete(parent); }
    },
  };
  const policy: DeliveryPolicyBinding<DsmmProfileAdmission, ChildAdmissionEvidence> = {
    classifyParent: collaborators.classifyParent,
    resolveChildEvidence: resolve,
    assertDelivery(ticket, id, evidence) { assertNative(ticket); collaborators.assertDelivery(profileTicket(ticket), id, evidence); assertNative(ticket); },
  };
  const childAdmission: ChildAdmissionCompletion = {
    async prepare(agent, parent, ticket, signal) {
      const issued = nativeTicket(ticket);
      if (exact(parent) !== issued.parent || ctx.agents.get(SessionId(agent.id!)) !== agent || !ctx.agents.isOwnedBy(SessionId(agent.id!), issued.parent)) unauthorized();
      const merged = AbortSignal.any([signal, issued.signal]);
      merged.throwIfAborted();
      const prepared = await collaborators.childAdmission.prepare(agent, parent, ticket, merged);
      merged.throwIfAborted(); assertNative(issued);
      if ("mode" in prepared.evidence || prepared.evidence.version !== 3) throw new SubagentError("Only current child capture V3 is supported", "UNSUPPORTED_CAPABILITY");
      return prepared;
    },
    validateRole(agent, parent, candidate) {
      if ("mode" in candidate.evidence || candidate.evidence.version !== 3) throw new SubagentError("Only current child capture V3 is supported", "UNSUPPORTED_CAPABILITY");
      collaborators.childAdmission.validateRole(agent, parent, candidate);
    },
  };
  return { authority, policy, childAdmission, readLegacy,
    resolveOriginalEvidence: (ticket: ParentAdmissionTicket, id: string, signal: AbortSignal) => resolve(nativeTicket(ticket), id, signal),
    bind(scope: Context): () => void { return delivery.bindPolicy(scope, owner, policy); },
    onAdmissionGuardsInstalled(): void { delivery.enablePolicy(owner); },
    /** Holder owner calls this before native disposal/drain; no replacement residency is revoked. */
    async revokeBeforeDispose(parent: DshAgent, dispose: () => void | Promise<void>): Promise<void> {
      delivery.revokeParent(parent as unknown as Agent, "holder-disposed");
      await dispose();
    },
  };
}

/** DTO consumers supply the CURRENT direct-parent epoch; original epochs are not an authorization equality test. */
export function projectChildAdmissionEvidence(evidence: ChildAdmissionEvidence, parentAdmissionEpoch: string, parentDenied: readonly ChildEvidenceField[] = []): ChildAdmissionEvidenceView {
  let view: ChildAdmissionEvidenceView;
  if ("mode" in evidence) {
    const legacy = parseLegacyChildEvidence(evidence);
    view = parseChildAdmissionEvidenceView({ mode: "legacy-conservative", parentAdmissionEpoch, provenFields: legacy.provenFields, limitations: legacy.limitations });
  } else {
    const capture = parseChildAdmissionCapture(evidence);
    const provenFields: ChildEvidenceField[] = ["lineage", "role", "route", "profile-pin", "admission-epoch", "invocation-level", "runtime-policy", "modules", "roles",
      "read-only", "route-override", "max-depth", "locale", "tool-topology", "guards", "git-write", "shell", "delegation"];
    if (capture.authorityCeiling.toolFilter !== undefined) provenFields.push("tool-filter");
    view = parseChildAdmissionEvidenceView({ mode: "captured", parentAdmissionEpoch, originalAdmissionEpoch: capture.originalAdmissionEpoch, provenFields,
      limitations: [{ field: "active-intent", code: "missing-evidence", effect: "display-only" }, { field: "max-tokens", code: "not-persisted", effect: "native-default" },
        { field: "output-schema", code: "unverified", effect: "capability-denied" }] });
  }
  const limitations = new Map(view.limitations.map(item => [item.field, item]));
  for (const field of parentDenied) limitations.set(field, { field, code: "parent-denied", effect: "capability-denied" });
  return parseChildAdmissionEvidenceView({ ...view, limitations: [...limitations.values()] });
}
