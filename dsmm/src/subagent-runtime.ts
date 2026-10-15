import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ContentBlock, MessageId } from "@deepseek-ai/dsh-llm";
import type { SessionId } from "@deepseek-ai/dsh-session";
import { SubagentError, SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { SubagentPromptReceipt, SubagentPromptRequest, SubagentProvider, SubagentSendMessageOptions } from "@deepseek-ai/dsh-subagent";
import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";
import { TYPERT as NATIVE_SUBAGENT_HOST } from "@deepseek-ai/dsh-subagent/typert";
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry";
import { DsmmDeliveryAuthority, scopeLifetime } from "./delivery-authority.js";
import type { DeliveryAdmission, DeliveryParentClassifier } from "./delivery-authority.js";

export { DsmmDeliveryAuthority } from "./delivery-authority.js";
export type { DeliveryAdmission, DeliveryFenceView, DeliveryParentClassifier, DeliveryPolicyBinding, ParentAdmissionTicket } from "./delivery-authority.js";

// rc.2 declares this native code on its re-export barrel, rather than the map's defining module.
declare module "@deepseek-ai/dsh-typert-protocol/types" {
  interface RemoteErrorDetailsMap {
    "subagent/unauthorized": { readonly childSessionId: SessionId };
  }
}

interface ReadyWaiter { check(): void }
type ContinuableStart = SubagentRuntime["startContinuable"];
type ContinuablePreflight = (spec: Parameters<ContinuableStart>[0], start: ContinuableStart) => ReturnType<ContinuableStart>;

/** Explicit startup replacement for the stock row, in the SAME Host service scope. */
export class DsmmSubagentRuntime<A extends DeliveryAdmission = DeliveryAdmission, E = unknown> extends SubagentRuntime {
  readonly authority: DsmmDeliveryAuthority<A, E>;
  private readonly waiters = new Set<ReadyWaiter>();
  private readonly lifetime = new AbortController();
  private requiredProviders: readonly string[] = ["spawn"];
  private continuablePreflight?: ContinuablePreflight;

  constructor(ctx: Context, config: ConstructorParameters<typeof SubagentRuntime>[1], hostClassifier?: DeliveryParentClassifier) {
    if (ctx.get("subagents") !== undefined) {
      throw new SubagentError("Explicit DSMM startup composition must exclude the stock subagents row; restart with one provider.", "DUPLICATE_PROVIDER");
    }
    super(ctx, config);
    this.authority = new DsmmDeliveryAuthority<A, E>(ctx, () => this.substrateReady(), () => this.wakeWaiters(), hostClassifier);
    ctx.inject(["typert"], (remoteCtx) => {
      if (remoteCtx.typert.getPackage("@deepseek-ai/dsh-subagent", "host") === undefined) {
        remoteCtx.typert.register(NATIVE_SUBAGENT_HOST as TypertContribution);
      }
      this.wakeWaiters();
    });
    ctx.on("subagent/provider-added", () => this.wakeWaiters());
    ctx.on("subagent/provider-removed", () => this.wakeWaiters());
    scopeLifetime(ctx, "dsmm.subagents: close registration barriers", () => { this.lifetime.abort(); this.wakeWaiters(); });
  }

  /** Host composition may select spawn/fork names before enabling the policy. */
  requireProviders(names: readonly string[]): void {
    if (this.authority.view().deliveryFenceReady || names.length === 0 || names.some((name) => name.length === 0)) {
      throw new SubagentError("Provider readiness must be configured before DSMM admission becomes ready.", "UNAUTHORIZED");
    }
    this.requiredProviders = [...new Set(names)];
    this.wakeWaiters();
  }

  override registerProvider(provider: SubagentProvider): () => void {
    const dispose = super.registerProvider(provider);
    this.wakeWaiters();
    return dispose;
  }

  /** Host entry route preparation before native normalization loses caller option provenance. */
  configureContinuablePreflight(preflight: ContinuablePreflight, signal: AbortSignal): void {
    signal.throwIfAborted();
    if (this.continuablePreflight !== undefined) throw new SubagentError("Continuable routing already has a Host owner", "UNAUTHORIZED");
    this.continuablePreflight = preflight;
    signal.addEventListener("abort", () => { if (this.continuablePreflight === preflight) this.continuablePreflight = undefined; }, { once: true });
  }

  override startContinuable(spec: Parameters<ContinuableStart>[0]): ReturnType<ContinuableStart> {
    const start: ContinuableStart = request => super.startContinuable(request);
    return this.continuablePreflight === undefined ? start(spec) : this.continuablePreflight(spec, start);
  }

  /** Fulfillment proves this exact registry contains the provider, not just a mounted plugin. */
  waitForProvider(name: string, signal?: AbortSignal): Promise<SubagentProvider> {
    return this.waitFor(() => this.getProvider(name), signal);
  }

  /** Policy explicitly enabled AND every required provider actually registered. */
  waitUntilReady(signal?: AbortSignal): Promise<void> {
    return this.waitFor(() => this.authority.view().deliveryFenceReady ? true : undefined, signal).then(() => {});
  }

  override async sendMessage(sender: Agent, targetId: SessionId, content: ContentBlock[], options: SubagentSendMessageOptions): Promise<MessageId> {
    // The SDK alone validates exact residency and adjacency on child -> parent.
    if (sender.session.header.parentSession === targetId || !this.authority.isManaged(sender)) {
      return super.sendMessage(sender, targetId, content, options);
    }
    const ticket = this.authority.acquireParentTicket(sender);
    const signal = AbortSignal.any([options.signal, ticket.signal]);
    const evidence = await this.authority.resolveChildEvidence(ticket, targetId, signal);
    this.authority.assertDelivery(ticket, targetId, evidence);
    signal.throwIfAborted();
    return super.sendMessage(sender, targetId, content, { ...options, signal });
  }

  override async prompt(request: SubagentPromptRequest, callerSignal: AbortSignal): Promise<SubagentPromptReceipt> {
    const parent = this.ctx.get("agents")?.get(request.parentSessionId);
    if (parent === undefined || !this.authority.isManaged(parent)) return super.prompt(request, callerSignal);
    let signal = callerSignal;
    try {
      const ticket = this.authority.acquireParentTicket(parent);
      signal = AbortSignal.any([callerSignal, ticket.signal, this.authority.acquireBrowserSignal(this.ctx)]);
      const evidence = await this.authority.resolveChildEvidence(ticket, request.childSessionId, signal);
      this.authority.assertDelivery(ticket, request.childSessionId, evidence);
      signal.throwIfAborted();
    } catch (error) {
      // Match the native public prompt error boundary, without relabeling success.
      if (signal.aborted) throw new RemoteError("gateway/cancelled", "Subagent prompt was cancelled.", {}, { cause: error });
      if (error instanceof SubagentError && error.code === "UNAUTHORIZED") {
        throw new RemoteError("subagent/unauthorized", "Subagent delivery was not authorized.", { childSessionId: request.childSessionId }, { cause: error });
      }
      throw new RemoteError("gateway/internal", "Subagent prompt failed.", {}, { cause: error });
    }
    return super.prompt(request, signal);
  }

  private wakeWaiters(): void {
    for (const waiter of this.waiters) waiter.check();
  }

  private substrateReady(): boolean {
    const typert = this.ctx.get("typert");
    return this.requiredProviders.every((name) => this.getProvider(name) !== undefined)
      && (typert === undefined || typert.local.get("subagents/prompt") !== undefined);
  }

  private waitFor<T>(read: () => T | undefined, callerSignal?: AbortSignal): Promise<T> {
    const signal = callerSignal === undefined ? this.lifetime.signal : AbortSignal.any([callerSignal, this.lifetime.signal]);
    return new Promise<T>((resolve, reject) => {
      const cleanup = (): void => { this.waiters.delete(waiter); signal.removeEventListener("abort", check); };
      const check = (): void => {
        if (signal.aborted) { cleanup(); reject(signal.reason); return; }
        const value = read();
        if (value !== undefined) { cleanup(); resolve(value); }
      };
      const waiter: ReadyWaiter = { check };
      this.waiters.add(waiter);
      signal.addEventListener("abort", check, { once: true });
      check();
    });
  }
}

export default DsmmSubagentRuntime;
