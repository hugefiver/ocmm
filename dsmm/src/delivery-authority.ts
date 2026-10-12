import { symbols } from "@deepseek-ai/cordis";
import type { Context, Fiber } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { HostConnectionHandle } from "@deepseek-ai/dsh-client-connection";
import type { SessionId } from "@deepseek-ai/dsh-session";
import { SubagentError } from "@deepseek-ai/dsh-subagent";

/** A borrowed immutable admission, never reconstructed from current settings. */
export interface DeliveryAdmission { readonly epoch: string }
export type DeliveryParentClassifier = (parent: Agent) => "dsmm" | "native";

export interface ParentAdmissionTicket<A extends DeliveryAdmission = DeliveryAdmission> {
  readonly parent: Agent;
  readonly owner: object;
  readonly admission: A;
  readonly parentEpoch: string;
  readonly signal: AbortSignal;
}

/** Host-only collaborators supply the original capture/evidence and role policy. */
export interface DeliveryPolicyBinding<A extends DeliveryAdmission, E> {
  /** Inspect trusted DSMM origin/role facts; missing registration is not proof of native identity. */
  classifyParent: DeliveryParentClassifier;
  resolveChildEvidence(ticket: ParentAdmissionTicket<A>, childId: SessionId, signal: AbortSignal): Promise<E>;
  /** Check direct target identity, original ceiling AND current parent authorization. */
  assertDelivery(ticket: ParentAdmissionTicket<A>, childId: SessionId, evidence: E): void;
}

export interface DeliveryFenceView {
  readonly binding: "dsmm";
  readonly deliveryFenceReady: boolean;
  readonly restartRequired: false;
  readonly reason?: "authority-not-ready";
}

interface ParentState<A extends DeliveryAdmission> {
  readonly parent: Agent;
  readonly owner: object;
  admission: A;
  epoch: AbortController;
  readonly lifetime: AbortController;
  readonly usedEpochs: Set<string>;
  publishing: boolean;
  prepared?: { expectedEpoch: string; admission: A; controller: AbortController };
  detachResidency?: () => void;
}

interface ConnectionState {
  readonly owner: object;
  readonly operator: HostConnectionHandle["operator"];
  readonly controller: AbortController;
}

function original(value: object): object {
  return Reflect.get(value, symbols.original) ?? value;
}

function unauthorized(): never {
  throw new SubagentError("DSMM delivery requires current exact direct-parent authority.", "UNAUTHORIZED");
}

/** Public plugin/status dispatch precedes async cleanup, including ancestor Host teardown. */
export function scopeLifetime(scope: Context, label: string, revoke: () => void, install: () => void = () => {}): () => void {
  // Cordis's public ambient const enum has no JavaScript export for source-only Node loading.
  const unloading: Fiber["state"] = 5, disposed: Fiber["state"] = 4;
  return scope.effect(() => {
    // Context.fiber can be a facade; its public readonly ctx identifies the exact owner.
    const owners = new Map<Context, Fiber>();
    for (let fiber = scope.fiber; !owners.has(fiber.ctx); fiber = fiber.parent.fiber) owners.set(fiber.ctx, fiber);
    let retired = false;
    let detachPlugin = () => {}, detachStatus = () => {};
    const retire = (): void => { retired = true; revoke(); };
    const cleanup = (): void => { detachPlugin(); detachStatus(); retire(); };
    try {
      detachPlugin = scope.on("internal/plugin", (fiber) => {
        if (owners.has(fiber.ctx) && fiber.uid === null) retire();
      }, { global: true, prepend: true });
      detachStatus = scope.on("internal/status", (fiber) => {
        if (owners.has(fiber.ctx) && (fiber.state === unloading || fiber.state === disposed)) retire();
      }, { global: true, prepend: true });
      if ([...owners.values()].some((fiber) => fiber.uid === null || fiber.state === unloading || fiber.state === disposed)) unauthorized();
      install();
      if (retired) unauthorized();
      return cleanup;
    } catch (error) {
      cleanup();
      throw error;
    }
  }, label);
}

/** Stable Host lifetime; profile entry disposal must not replace this object. */
export class DsmmDeliveryAuthority<A extends DeliveryAdmission = DeliveryAdmission, E = unknown> {
  private readonly ctx: Context;
  private readonly lifetime = new AbortController();
  private readonly parents = new Map<Agent, ParentState<A>>();
  private readonly tickets = new WeakMap<ParentAdmissionTicket<A>, ParentState<A>>();
  private readonly managedIds = new Set<SessionId>();
  private binding?: { owner: object; policy: DeliveryPolicyBinding<A, E>; enabled: boolean };
  private connection?: ConnectionState;
  private readonly providersReady: () => boolean;
  private readonly changed: () => void;
  private readonly hostClassifier?: DeliveryParentClassifier;

  constructor(ctx: Context, providersReady: () => boolean = () => true, changed: () => void = () => {}, hostClassifier?: DeliveryParentClassifier) {
    this.ctx = ctx;
    this.providersReady = providersReady;
    this.changed = changed;
    this.hostClassifier = hostClassifier;
    scopeLifetime(ctx, "dsmm.deliveryAuthority: revoke Host tickets", () => {
      this.lifetime.abort();
      for (const parent of this.parents.keys()) this.revokeParent(parent, "host-disposed");
      this.changed();
    });
    ctx.on("agent/disposed", ({ agent }) => this.revokeParent(agent, "registry-residency-disposed"), { global: true });
    ctx.inject(["connection"], (connectionCtx) => {
      const connection = connectionCtx.get("connection") as HostConnectionHandle;
      const state: ConnectionState = { owner: original(connection), operator: connection.operator, controller: new AbortController() };
      const revoke = (): void => {
        state.controller.abort();
        if (this.connection === state) this.connection = undefined;
      };
      // Native operator scope ancestry includes the exact providing Connection fiber.
      const detachOperator = scopeLifetime(connection.operator.ctx, "dsmm.deliveryAuthority: revoke operator and Connection lifetime", revoke);
      scopeLifetime(connectionCtx, "dsmm.deliveryAuthority: release Connection observer", () => { revoke(); detachOperator(); }, () => {
        if (state.controller.signal.aborted) unauthorized();
        this.connection = state;
      });
    });
  }

  view(): DeliveryFenceView {
    const ready = !this.lifetime.signal.aborted && this.binding?.enabled === true && this.providersReady();
    return { binding: "dsmm", deliveryFenceReady: ready, restartRequired: false,
      ...(ready ? {} : { reason: "authority-not-ready" as const }) };
  }

  /** Bind once per entry scope; teardown revokes its pending tickets synchronously. */
  bindPolicy(scope: Context, owner: object, policy: DeliveryPolicyBinding<A, E>): () => void {
    if (this.lifetime.signal.aborted || this.binding !== undefined) unauthorized();
    const binding = { owner, policy, enabled: false };
    return scopeLifetime(scope, "dsmm.deliveryAuthority: release policy owner", () => {
      if (this.binding !== binding) return;
      this.binding = undefined;
      this.revokeOwner(owner, "policy-owner-disposed");
      this.changed();
    }, () => {
      this.binding = binding;
      this.changed();
    });
  }

  /** Called after A/B admission/capture guards are installed, not at service mount. */
  enablePolicy(owner: object): void {
    if (this.binding?.owner !== owner || this.lifetime.signal.aborted) unauthorized();
    this.binding.enabled = true;
    this.changed();
  }

  isManaged(parent: Agent): boolean {
    if (this.managedIds.has(parent.id)) return true;
    // An absent binding is unknown authority, never proof of a native caller.
    const hostKind = this.hostClassifier?.(parent);
    if (hostKind === "dsmm") return true;
    const kind = this.binding?.policy.classifyParent(parent) ?? hostKind;
    return kind !== "native";
  }

  registerParent(parent: Agent, admission: A, owner: object): void {
    if (this.binding?.owner !== owner || this.lifetime.signal.aborted
      || this.ctx.get("agents")?.get(parent.id) !== parent || admission.epoch.length === 0) unauthorized();
    const existing = this.parents.get(parent);
    if (existing !== undefined) {
      if (existing.owner !== owner || existing.admission !== admission || existing.publishing) unauthorized();
      return;
    }
    // Durable IDs may be reused on cold resume; the former exact Agent cannot retain authority.
    for (const [previous, state] of this.parents) {
      if (previous.id === parent.id) this.revokeParent(state.parent, "residency-replaced");
    }
    const state: ParentState<A> = { parent, owner, admission, epoch: new AbortController(), lifetime: new AbortController(),
      publishing: false, usedEpochs: new Set([admission.epoch]) };
    state.detachResidency = scopeLifetime(parent.ctx, "dsmm.deliveryAuthority: revoke exact Agent residency", () => {
      if (this.parents.get(parent) === state) this.revokeParent(parent, "residency-disposed");
    }, () => {
      this.parents.set(parent, state);
      this.managedIds.add(parent.id);
    });
  }

  acquireParentTicket(parent: Agent): ParentAdmissionTicket<A> {
    if (!this.view().deliveryFenceReady) unauthorized();
    const state = this.current(parent);
    const ticket = Object.freeze({ parent, owner: state.owner, admission: state.admission, parentEpoch: state.admission.epoch,
      signal: AbortSignal.any([state.epoch.signal, state.lifetime.signal, this.lifetime.signal]) });
    this.tickets.set(ticket, state);
    return ticket;
  }

  assertTicket(ticket: ParentAdmissionTicket<A>): void {
    ticket.signal.throwIfAborted();
    const state = this.current(ticket.parent);
    if (this.tickets.get(ticket) !== state || state.owner !== ticket.owner || state.admission !== ticket.admission
      || state.admission.epoch !== ticket.parentEpoch) unauthorized();
  }

  async resolveChildEvidence(ticket: ParentAdmissionTicket<A>, childId: SessionId, signal: AbortSignal): Promise<E> {
    signal.throwIfAborted();
    this.assertTicket(ticket);
    const policy = this.binding!.policy;
    const evidence = await policy.resolveChildEvidence(ticket, childId, signal);
    signal.throwIfAborted();
    this.assertTicket(ticket);
    return evidence;
  }

  assertDelivery(ticket: ParentAdmissionTicket<A>, childId: SessionId, evidence: E): void {
    this.assertTicket(ticket);
    this.binding!.policy.assertDelivery(ticket, childId, evidence);
    this.assertTicket(ticket);
  }

  prepareParentAdmission(parent: Agent, expectedEpoch: string, nextAdmission: A): void {
    if (!this.view().deliveryFenceReady) unauthorized();
    const state = this.current(parent);
    if (state.admission.epoch !== expectedEpoch || nextAdmission.epoch.length === 0 || state.usedEpochs.has(nextAdmission.epoch)) unauthorized();
    state.prepared = { expectedEpoch, admission: nextAdmission, controller: new AbortController() };
  }

  /** Trusted successful-commit callback: install MUST be synchronous and nonthrowing. */
  publishParentAdmission(parent: Agent, expectedEpoch: string, nextAdmission: A, install: () => void): void {
    const state = this.current(parent);
    const prepared = state.prepared;
    if (state.admission.epoch !== expectedEpoch || prepared?.expectedEpoch !== expectedEpoch || prepared.admission !== nextAdmission) unauthorized();
    const previous = state.epoch;
    state.publishing = true;
    try {
      install();
      state.admission = nextAdmission;
      state.epoch = prepared.controller;
      state.usedEpochs.add(nextAdmission.epoch);
      state.prepared = undefined;
      previous.abort();
    } catch (error) {
      this.revokeParent(parent, "publication-failed");
      throw error;
    } finally {
      state.publishing = false;
    }
  }

  revokeParent(parent: Agent, _reason: string): void {
    const state = this.parents.get(parent);
    if (state === undefined) return;
    this.parents.delete(parent);
    state.lifetime.abort();
    state.epoch.abort();
    state.prepared?.controller.abort();
    state.detachResidency?.();
  }

  revokeOwner(owner: object, reason: string): void {
    for (const [parent, state] of this.parents) if (state.owner === owner) this.revokeParent(parent, reason);
  }

  /** Only the native exact operator/Connection can authorize browser delivery. */
  acquireBrowserSignal(callerCtx: Context): AbortSignal {
    const invocation = callerCtx.invocation;
    const connection = callerCtx.get("connection") as HostConnectionHandle | undefined;
    const state = this.connection;
    if (invocation?.peer === undefined || connection === undefined || state === undefined
      || original(connection) !== state.owner || connection.operator !== invocation.peer || state.operator !== invocation.peer) unauthorized();
    state.controller.signal.throwIfAborted();
    return state.controller.signal;
  }

  private current(parent: Agent): ParentState<A> {
    const state = this.parents.get(parent);
    if (state === undefined || state.publishing || state.lifetime.signal.aborted || this.lifetime.signal.aborted
      || this.binding?.owner !== state.owner || this.ctx.get("agents")?.get(parent.id) !== parent) unauthorized();
    return state;
  }
}
