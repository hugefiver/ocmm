import { AsyncLocalStorage } from "node:async_hooks";
import { symbols } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import type { Agent, AgentHandle, CreateAgentOptions, ResumeAgentOptions } from "@deepseek-ai/dsh-agent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import { SubagentError } from "@deepseek-ai/dsh-subagent";
import { scopeLifetime } from "./delivery-authority.js";

export interface ManagedCreation {
  readonly registry: AgentRegistry;
  readonly parent: Agent;
  readonly childId: SessionId;
  readonly kind: "fresh" | "cold";
  readonly delegationMode?: "one-shot" | "continuable";
  readonly owner: object;
  readonly ownerSignal?: AbortSignal;
  entered(agent: Agent): void;
  claimed: boolean;
  child?: Agent;
  retired: boolean;
}

const creations = new AsyncLocalStorage<ManagedCreation>();
const holders = new AsyncLocalStorage<AbortSignal>();
const cancellations = new WeakSet<object>();
export function managedCancellation(reason: unknown): SubagentError {
  const error = new SubagentError("Managed activation owner cancelled", "ABORTED", { cause: reason });
  cancellations.add(error);
  return error;
}
export function isManagedCancellation(error: unknown): boolean { return typeof error === "object" && error !== null && cancellations.has(error); }
export const exactRegistry = (registry: AgentRegistry): AgentRegistry => Reflect.get(registry, symbols.original) ?? registry;
export function duringManagedCreation<T>(operation: ManagedCreation, run: () => T): T { return creations.run(operation, run); }
export function currentManagedCreation(): ManagedCreation | undefined { return creations.getStore(); }
export function duringActivationOwnership<T>(signal: AbortSignal, run: () => T): T { return holders.run(signal, run); }
export function activationOwnerSignal(): AbortSignal | undefined { return holders.getStore(); }

/** Startup-only agents provider. Factory, traced caller, ownership and handles stay native. */
export class DsmmAgentRegistry extends AgentRegistry {
  readonly managedLifetime = new AbortController();

  constructor(ctx: Context) {
    if (ctx.get("agents") !== undefined) throw new SubagentError("DSMM agents requires one startup provider; restart to change it.", "DUPLICATE_PROVIDER");
    super(ctx);
    scopeLifetime(ctx, "dsmm.agents: retire managed residency", () => this.managedLifetime.abort());
  }

  override create(options: CreateAgentOptions): Promise<AgentHandle> {
    return this.creation("fresh", options.sessionId, options.parentAgent, options.signal,
      signal => super.create(signal === options.signal ? options : { ...options, signal }));
  }

  override resume(options: ResumeAgentOptions): Promise<AgentHandle> {
    return this.creation("cold", options.resumeSessionId, options.parentAgent, options.signal,
      signal => super.resume(signal === options.signal ? options : { ...options, signal }));
  }

  override enter(agent: Agent, owner: Agent | undefined): () => void {
    const detach = super.enter(agent, owner);
    const operation = creations.getStore();
    if (operation?.claimed && operation.registry === exactRegistry(this) && operation.parent === owner && operation.childId === agent.id) {
      try { operation.entered(agent); }
      catch (error) { detach(); throw error; }
    }
    return detach;
  }

  private async creation(kind: ManagedCreation["kind"], id: SessionId, parent: Agent | undefined,
    source: AbortSignal | undefined, run: (signal: AbortSignal | undefined) => Promise<AgentHandle>): Promise<AgentHandle> {
    const operation = creations.getStore();
    if (operation !== undefined && operation.registry === exactRegistry(this) && operation.parent === parent
      && operation.childId === id && operation.kind === kind) {
      if (operation.claimed || operation.retired || this.managedLifetime.signal.aborted || source === undefined) {
        throw new SubagentError("Managed creation requires its exact unused operation", "UNAUTHORIZED");
      }
      operation.claimed = true;
    }
    if (source === undefined) return run(source);
    // Creation-only cancellation must not end an accepted root or native child residency.
    const relay = new AbortController();
    const abort = (): void => relay.abort(source.reason);
    source.addEventListener("abort", abort, { once: true });
    if (source.aborted) abort();
    try { return await run(relay.signal); }
    finally { source.removeEventListener("abort", abort); }
  }
}

export default DsmmAgentRegistry;
