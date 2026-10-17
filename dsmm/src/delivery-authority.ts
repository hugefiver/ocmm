import { symbols } from "@deepseek-ai/cordis";
import type { Context, Fiber } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { HostConnectionHandle } from "@deepseek-ai/dsh-client-connection";
import type { SessionId } from "@deepseek-ai/dsh-session";
import { SubagentError } from "@deepseek-ai/dsh-subagent";
import { currentManagedCreation, exactRegistry } from "./agent-registry.js";
import type { ManagedCreation } from "./agent-registry.js";

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
  /** Exact Host-minted native proof; absent proof always requires managed admission. */
  isNativeEvidence?(evidence: E): boolean;
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
  prepared?: { expectedEpoch: string; expected: A; admission: A; controller: AbortController };
  detachResidency?: () => void;
}

interface ConnectionState {
  readonly owner: object;
  readonly browserPeer: HostConnectionHandle["browserPeer"];
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
  private readonly managed = new WeakMap<Agent, { operation: ManagedCreation; status: "pending" | "active" | "retired"; ready: Promise<void>; release(): void; admission?: A; owner?: object }>();
  private readonly liveManaged = new Set<Agent>();
  private readonly retiredAgents = new WeakSet<Agent>();
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
      for (const parent of this.liveManaged) this.revokeParent(parent, "host-disposed");
      for (const parent of this.parents.keys()) this.revokeParent(parent, "host-disposed");
      this.changed();
    });
    ctx.on("agent/disposed", ({ agent }) => this.revokeParent(agent, "registry-residency-disposed"), { global: true });
    ctx.on("agent/created", ({ agent, signal }) => {
      const retire = (): void => this.revokeParent(agent, "agent-lifecycle-ended");
      signal?.addEventListener("abort", retire, { once: true });
      if (signal?.aborted) retire();
      const operation = currentManagedCreation();
      if (operation === undefined || !operation.claimed || operation.childId !== agent.id
        || operation.registry !== exactRegistry(ctx.agents) || !ctx.agents.isOwnedBy(agent.id, operation.parent)) return;
      if (operation.child !== agent || operation.retired) unauthorized();
      if (signal?.aborted || operation.ownerSignal?.aborted) retire();
    }, { global: true, prepend: true });
    ctx.inject(["connection"], (connectionCtx) => {
      const connection = connectionCtx.get("connection") as HostConnectionHandle;
      const state: ConnectionState = { owner: original(connection), browserPeer: connection.browserPeer, controller: new AbortController() };
      const revoke = (): void => {
        state.controller.abort();
        if (this.connection === state) this.connection = undefined;
      };
      connection.browserPeer.signal.addEventListener("abort", revoke, { once: true });
      // Browser peer scope ancestry includes the exact providing Connection fiber.
      const detachPeer = scopeLifetime(connection.browserPeer.ctx, "dsmm.deliveryAuthority: revoke browser and Connection lifetime", revoke);
      scopeLifetime(connectionCtx, "dsmm.deliveryAuthority: release Connection observer", () => { revoke(); connection.browserPeer.signal.removeEventListener("abort", revoke); detachPeer(); }, () => {
        if (state.controller.signal.aborted || connection.browserPeer.signal.aborted) unauthorized();
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

  isManaged(parent: Agent, intent: "delivery" | "creation" = "delivery"): boolean {
    if (this.managed.has(parent)) return true;
    // An admitted native parent still needs current proof of its delivery target's identity.
    if (intent === "delivery" && this.parents.has(parent)) return true;
    if (intent === "creation" && parent.session.header.origin !== "subagent" && this.binding?.policy.classifyParent(parent) === "native") return false;
    if (this.managedIds.has(parent.id)) return true;
    // An absent binding is unknown authority, never proof of a native caller.
    const hostKind = this.hostClassifier?.(parent);
    if (hostKind === "dsmm") return true;
    const kind = this.binding?.policy.classifyParent(parent) ?? hostKind;
    return kind !== "native";
  }

  registerParent(parent: Agent, admission: A, owner: object): void {
    if (this.retiredAgents.has(parent) || this.binding?.owner !== owner || this.lifetime.signal.aborted
      || this.ctx.get("agents")?.get(parent.id) !== parent || admission.epoch.length === 0) unauthorized();
    const managed = this.managed.get(parent);
    if (managed === undefined && parent.session.header.origin === "subagent") unauthorized();
    if (managed?.status === "retired") unauthorized();
    if (managed?.status === "pending") {
      if (managed.admission !== undefined && (managed.admission !== admission || managed.owner !== owner)) unauthorized();
      managed.admission = admission; managed.owner = owner;
      return;
    }
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
    });
  }

  beginPending(operation: ManagedCreation, agent: Agent): void {
    if (operation.child !== undefined || operation.retired || this.managed.has(agent) || this.retiredAgents.has(agent)) unauthorized();
    operation.child = agent;
    let release!: () => void;
    const ready = new Promise<void>(done => { release = done; });
    this.managed.set(agent, { operation, status: "pending", ready, release });
    this.liveManaged.add(agent);
    this.managedIds.add(operation.parent.id);
    this.managedIds.add(agent.id);
    const retire = (): void => this.revokeParent(agent, "managed-owner-ended");
    operation.ownerSignal?.addEventListener("abort", retire, { once: true });
    scopeLifetime(agent.ctx, "dsmm.deliveryAuthority: pending residency", retire);
    if (operation.ownerSignal?.aborted || this.lifetime.signal.aborted) retire();
  }

  /** Receipt acceptance, not the caller's old operation signal, opens execution. */
  promote(operation: ManagedCreation): void {
    const child = operation.child, managed = child === undefined ? undefined : this.managed.get(child);
    if (child === undefined || managed?.operation !== operation) throw new SubagentError("Managed receipt has no exact prepared child", "UNAUTHORIZED");
    if (managed.status !== "pending" || operation.retired || operation.ownerSignal?.aborted) throw new SubagentError("Managed receipt residency ended before promotion", "UNAUTHORIZED");
    if (this.ctx.agents.get(child.id) !== child || !this.ctx.agents.isOwnedBy(child.id, operation.parent)
      || exactRegistry(this.ctx.agents) !== operation.registry) throw new SubagentError("Managed receipt registry or ownership changed", "UNAUTHORIZED");
    if (managed.admission === undefined || managed.owner !== operation.owner) throw new SubagentError("Managed receipt has no completed capture admission", "UNAUTHORIZED");
    managed.status = "active";
    try { this.registerParent(child, managed.admission, managed.owner); }
    catch (error) { this.revokeParent(child, "promotion-failed"); throw error; }
    managed.release();
  }

  assertSender(parent: Agent): void {
    if (this.retiredAgents.has(parent)) unauthorized();
    const state = this.managed.get(parent);
    if (state !== undefined && state.status !== "active") unauthorized();
  }

  async waitForPromotion(parent: Agent, signal?: AbortSignal): Promise<void> {
    if (this.retiredAgents.has(parent)) unauthorized();
    const state = this.managed.get(parent);
    if (state === undefined || state.status === "active") return;
    if (state.status === "retired" || signal === undefined) unauthorized();
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const abort = (): void => { signal.removeEventListener("abort", abort); reject(signal.reason); };
      signal.addEventListener("abort", abort, { once: true });
      void state.ready.then(() => { signal.removeEventListener("abort", abort); resolve(); });
    });
    signal.throwIfAborted();
    this.assertSender(parent);
  }

  retireOperation(operation: ManagedCreation, reason: string): void {
    operation.retired = true;
    if (operation.child !== undefined) this.revokeParent(operation.child, reason);
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
    if (!this.view().deliveryFenceReady) unauthorized();
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

  /** Validate the target and return whether its materialization requires DSMM capture. */
  assertDelivery(ticket: ParentAdmissionTicket<A>, childId: SessionId, evidence: E): boolean {
    this.assertTicket(ticket);
    this.binding!.policy.assertDelivery(ticket, childId, evidence);
    const managed = this.binding!.policy.isNativeEvidence?.(evidence) !== true;
    if (!managed && this.managedIds.has(childId)) unauthorized();
    this.assertTicket(ticket);
    return managed;
  }

  prepareParentAdmission(parent: Agent, expectedEpoch: string, nextAdmission: A): void {
    if (!this.view().deliveryFenceReady) unauthorized();
    const state = this.current(parent);
    if (state.admission.epoch !== expectedEpoch || nextAdmission.epoch.length === 0 || state.usedEpochs.has(nextAdmission.epoch)) unauthorized();
    state.prepared = { expectedEpoch, expected: state.admission, admission: nextAdmission, controller: new AbortController() };
  }

  /** Core configuration uses the same exact parent state without acquiring delivery capability. */
  assertCoreParentAdmission(parent: Agent, owner: object, expected: A): void {
    const state = this.current(parent);
    if (state.owner !== owner || state.admission !== expected || state.admission.epoch !== expected.epoch
      || parent.session.header.origin === "subagent" || !this.ctx.agents.roots().includes(parent)) unauthorized();
  }

  prepareCoreParentAdmission(parent: Agent, owner: object, expected: A, nextAdmission: A): void {
    this.assertCoreParentAdmission(parent, owner, expected);
    const state = this.current(parent);
    if (nextAdmission.epoch.length === 0 || state.usedEpochs.has(nextAdmission.epoch)) unauthorized();
    state.prepared = { expectedEpoch: expected.epoch, expected, admission: nextAdmission, controller: new AbortController() };
  }

  /** Trusted successful-commit callback: install MUST be synchronous and nonthrowing. */
  publishParentAdmission(parent: Agent, expectedEpoch: string, nextAdmission: A, install: () => void): void {
    const state = this.current(parent);
    const prepared = state.prepared;
    if (state.admission.epoch !== expectedEpoch || prepared?.expectedEpoch !== expectedEpoch || prepared.expected !== state.admission || prepared.admission !== nextAdmission) unauthorized();
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
      this.withdrawParent(parent, "publication-failed");
      throw error;
    } finally {
      state.publishing = false;
    }
  }

  revokeParent(parent: Agent, _reason: string): void {
    this.retiredAgents.add(parent);
    const managed = this.managed.get(parent);
    if (managed !== undefined) { managed.status = "retired"; managed.operation.retired = true; managed.release(); }
    this.liveManaged.delete(parent);
    for (const child of this.liveManaged) if (this.managed.get(child)!.operation.parent === parent) this.revokeParent(child, _reason);
    this.withdrawParent(parent, _reason);
  }

  /** Admission withdrawal invalidates tickets without terminating a living Agent. */
  withdrawParent(parent: Agent, reason: string): void {
    const managed = this.managed.get(parent);
    if (managed?.status === "pending") { this.revokeParent(parent, reason); return; }
    const state = this.parents.get(parent);
    if (state === undefined) return;
    this.parents.delete(parent);
    state.lifetime.abort();
    state.epoch.abort();
    state.prepared?.controller.abort();
    state.detachResidency?.();
  }

  revokeOwner(owner: object, reason: string): void {
    for (const parent of this.liveManaged) {
      const state = this.managed.get(parent)!;
      if (state.status === "pending" && state.operation.owner === owner) this.revokeParent(parent, reason);
    }
    for (const [parent, state] of this.parents) if (state.owner === owner) this.withdrawParent(parent, reason);
  }

  /** Only the native exact browser peer/Connection can authorize browser delivery. */
  acquireBrowserSignal(callerCtx: Context): AbortSignal {
    const invocation = callerCtx.invocation;
    const connection = callerCtx.get("connection") as HostConnectionHandle | undefined;
    const state = this.connection;
    if (invocation?.peer === undefined || connection === undefined || state === undefined
      || original(connection) !== state.owner || connection.browserPeer !== invocation.peer || state.browserPeer !== invocation.peer) unauthorized();
    state.controller.signal.throwIfAborted();
    return state.controller.signal;
  }

  private current(parent: Agent): ParentState<A> {
    this.assertSender(parent);
    const state = this.parents.get(parent);
    if (state === undefined || state.publishing || state.lifetime.signal.aborted || this.lifetime.signal.aborted
      || this.binding?.owner !== state.owner || this.ctx.get("agents")?.get(parent.id) !== parent) unauthorized();
    return state;
  }
}
