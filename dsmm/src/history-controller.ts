import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Service, symbols } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent, ModelSelection, ResumeAgentOptions } from "@deepseek-ai/dsh-agent";
import type { SessionActivationRequest, SessionActivationAdmission } from "@deepseek-ai/dsh-agent-loop";
import type { ApiSessionActivationRequest } from "@deepseek-ai/dsh-api-session-controller";
import { SessionId } from "@deepseek-ai/dsh-session";
import type { SessionInspection, SessionPersistence } from "@deepseek-ai/dsh-session-persistence";
import type { DsmmProfileAdmission } from "./settings.js";
import { scopeLifetime } from "./lifetime.js";
import { historyJson, historySessionId, parseHistoryChoices, parseHistoryConfirmRequest, parseHistoryPreview, parseHistoryPreviewRequest } from "./history-codec.js";
import type { HistoryCandidate, HistoryCandidates, HistoryNativeAdmission, HistoryOperator } from "./history-contract.js";
import type { HistoryCandidateView, HistoryChoices, HistoryConfirmRequest, HistoryContinuationResult, HistoryFailure, HistoryFailureCode, HistoryPreview, HistoryPreviewRequest, HistoryStatus } from "./history-types.js";

export class HistoryRefusal extends Error {
  constructor(readonly code: HistoryFailureCode, readonly storageEffects: HistoryFailure["storageEffects"] = "none") { super(`History continuation refused: ${code}`); }
}
function original(value: object): object { return Reflect.get(value, symbols.original) ?? value; }
interface Intent {
  readonly id: string;
  readonly request: HistoryPreviewRequest;
  readonly operator: HistoryOperator;
  readonly inspection: SessionInspection;
  readonly persistence: SessionPersistence;
  readonly persistenceIdentity: SessionPersistence["identity"];
  readonly controller: Context["sessionController"];
  readonly candidate: HistoryCandidate;
  readonly view: HistoryCandidateView;
  readonly model: ModelSelection;
  readonly migrationRequired: boolean;
  readonly signal: AbortSignal;
  readonly abort: AbortController;
  readonly detach: () => void;
  options?: ResumeAgentOptions;
  nativeOwner?: object;
  agent?: Agent;
  operation?: Promise<HistoryContinuationResult>;
  effects: HistoryFailure["storageEffects"];
}

/** Host-only one-operation intents around the native history and activation APIs. */
export class HistoryContinuations extends Service {
  readonly lifetime = new AbortController();
  private readonly intents = new Map<string, Intent>();
  private readonly prepared = new WeakMap<Agent, Intent>();
  private guardedLoop: object | undefined;
  private readonly cleanups = new Set<Promise<void>>();
  constructor(ctx: Context, private readonly candidates: HistoryCandidates, private readonly admission: HistoryNativeAdmission) {
    super(ctx, "dsmmHistoryContinuation");
    ctx.effect(() => async () => { await Promise.all(this.cleanups); }, "dsmm: release history preparations");
    const loop = ctx.get("agentLoop");
    if (typeof loop?.requireActivationAdmission === "function" && typeof loop.registerActivationGuard === "function") {
      loop.requireActivationAdmission();
      ctx.effect(() => {
        const remove = loop.registerActivationGuard(request => this.authorize(request));
        this.guardedLoop = original(loop);
        return () => { this.guardedLoop = undefined; remove(); };
      }, "dsmm: history activation admission");
    }
    const controller = ctx.get("sessionController");
    if (typeof controller?.registerHistoryOpenGuard === "function") {
      const owner = original(controller);
      ctx.effect(() => controller.registerHistoryOpenGuard({
        signal: AbortSignal.any([this.lifetime.signal, admission.lifetime.signal, candidates.signal]),
        assertCurrent: () => {
          this.ready();
          if (original(this.ctx.sessionController) !== owner) throw new HistoryRefusal("unsupported-host");
        },
      }), "dsmm: history opening readiness");
    }
    scopeLifetime(ctx, "dsmm: revoke history intents", () => {
      this.lifetime.abort();
      for (const intent of this.intents.values()) {
        try { this.release(intent); } catch (error) { ctx.logger.error(error); }
      }
    });
  }
  private compatibility(): HistoryFailureCode | undefined {
    const loop = this.ctx.get("agentLoop"), controller = this.ctx.get("sessionController");
    if (typeof loop?.registerActivationGuard !== "function" || this.guardedLoop === undefined || original(loop) !== original(this.guardedLoop) || typeof loop.activationState !== "function"
      || typeof controller?.activateSession !== "function" || controller.activateOnFollow !== false) return "unsupported-host";
    if (this.ctx.get("sessionPersistence")?.writeAdmission?.lockedInspection !== 1) return "unsupported-backend";
    if (!this.admission.isReady || this.admission.lifetime.signal.aborted || this.candidates.signal.aborted || this.lifetime.signal.aborted) return "unavailable";
    return undefined;
  }
  private visible(id: string, operator: HistoryOperator): void {
    operator.assertCurrent();
    operator.assertVisible(id);
  }
  private ready(): void { const reason = this.compatibility(); if (reason) throw new HistoryRefusal(reason); }
  private async compatible(): Promise<HistoryFailureCode | undefined> {
    const reason = this.compatibility();
    if (reason) return reason;
    try { await this.candidates.checkCompatibility?.(); return this.compatibility(); }
    catch (error) { return historyFailure(error).code; }
  }
  async describe(input: string, operator: HistoryOperator): Promise<HistoryStatus> {
    const sessionId = historySessionId(input);
    this.visible(sessionId, operator);
    const reason = await this.compatible();
    let child = false;
    try {
      const observation = await this.ctx.sessionQuery.observeSession(SessionId(sessionId), { signal: operator.signal, projectionMode: "none" });
      try { child = observation.header.origin === "subagent"; }
      finally { observation[Symbol.dispose](); }
    } catch {
      this.visible(sessionId, operator);
      return { sessionId, readable: "unavailable", execution: "unavailable", compatibleHost: reason !== "unsupported-host", reason: reason ?? "format-unavailable" };
    }
    this.visible(sessionId, operator);
    if (reason || child) return { sessionId, readable: "readable", execution: "unavailable", compatibleHost: reason !== "unsupported-host", reason: reason ?? "child-owner-required" };
    const state = this.ctx.agentLoop.activationState(SessionId(sessionId));
    const live = this.ctx.agents.get(SessionId(sessionId));
    return { sessionId, readable: "readable", compatibleHost: true,
      execution: state?.phase === "initializing" || [...this.intents.values()].some(intent => intent.request.sessionId === sessionId && intent.operation !== undefined) ? "activating"
        : live && this.admission.get(live) ? "active" : live ? "unavailable" : "authorization-required", ...(live && !this.admission.get(live) ? { reason: "unavailable" as const } : {}) };
  }
  async choices(operator: HistoryOperator): Promise<HistoryChoices> {
    operator.assertCurrent(); this.ready();
    await this.candidates.checkCompatibility?.(); operator.assertCurrent(); this.ready();
    const result = await this.candidates.choices(operator.signal);
    operator.assertCurrent(); this.ready(); return parseHistoryChoices(result);
  }
  async preview(input: HistoryPreviewRequest, operator: HistoryOperator): Promise<HistoryPreview> {
    const request = parseHistoryPreviewRequest(input), sessionId = SessionId(request.sessionId);
    this.visible(sessionId, operator); this.ready();
    await this.candidates.checkCompatibility?.(); this.visible(sessionId, operator); this.ready();
    if (this.ctx.agents.get(sessionId) || this.ctx.agentLoop.activationState(sessionId)) throw new HistoryRefusal("busy");
    const persistence = this.ctx.sessionPersistence, controller = this.ctx.sessionController;
    const stat = await persistence.stat(sessionId, { signal: operator.signal });
    this.visible(sessionId, operator); this.ready();
    if (!stat) throw new HistoryRefusal("not-found");
    const observation = await this.ctx.sessionQuery.observeSession(sessionId, { signal: operator.signal, projectionMode: "all" });
    let inspection: SessionInspection, pending: HistoryPreview["pending"];
    try {
      if (observation.source !== "prepared") throw new HistoryRefusal("busy");
      if (observation.header.origin === "subagent") throw new HistoryRefusal("child-owner-required");
      if (!observation.header.cwd) throw new HistoryRefusal("unavailable");
      const inbox = observation.projections?.values.inbox;
      if (!inbox) throw new HistoryRefusal("unsupported-host");
      inspection = structuredClone({ meta: observation.header, inheritedEventCount: observation.inheritedEventCount, events: [...observation.events] });
      pending = { nextTurn: inbox["next-turn"].map(value => historyJson(value)), nextStep: inbox["next-step"].map(value => historyJson(value)) };
    } finally { observation[Symbol.dispose](); }
    this.visible(sessionId, operator); this.ready();
    const candidate = await this.candidates.prepare(Object.freeze(request), structuredClone(inspection), operator.signal);
    let intent: Intent | undefined;
    try {
      this.visible(sessionId, operator); this.ready(); candidate.assertCurrent();
      if (candidate.view.preset.id !== request.preset || (candidate.view.profile?.id ?? null) !== request.profileId
        || !isDeepStrictEqual(candidate.view.model, candidate.model)) throw new HistoryRefusal("stale");
      for (const previous of this.intents.values()) if (previous.operator.peer === operator.peer && previous.request.sessionId === sessionId) {
        if (previous.operation) throw new HistoryRefusal("busy");
        this.release(previous);
      }
      const abort = new AbortController();
      const signal = AbortSignal.any([abort.signal, operator.peerSignal, this.lifetime.signal, this.admission.lifetime.signal, this.candidates.signal, candidate.signal]);
      const expired = () => { if (intent && !intent.operation) this.release(intent); };
      intent = { id: randomUUID(), request, operator, inspection, persistence, persistenceIdentity: persistence.identity, controller, candidate, view: structuredClone(candidate.view), model: structuredClone(candidate.model), migrationRequired: stat.formatStatus === "migration-required", signal, abort,
        detach: () => signal.removeEventListener("abort", expired), effects: "none" };
      this.intents.set(intent.id, intent); signal.addEventListener("abort", expired, { once: true }); this.check(intent);
      return parseHistoryPreview({ sessionId, intentId: intent.id, cwd: inspection.meta.cwd, candidate: intent.view, migrationRequired: intent.migrationRequired, pending });
    } catch (error) { if (intent) this.release(intent); else await candidate.dispose(); throw error; }
  }
  private check(intent: Intent): void {
    if (intent.signal.aborted) throw new HistoryRefusal("cancelled", intent.effects);
    intent.operator.assertOwner(); this.ready();
    if (this.intents.get(intent.id) !== intent || original(this.ctx.sessionPersistence) !== original(intent.persistence) || this.ctx.sessionPersistence.identity !== intent.persistenceIdentity
      || original(this.ctx.sessionController) !== original(intent.controller)) throw new HistoryRefusal("stale", intent.effects);
    intent.operator.assertVisible(intent.request.sessionId);
    if (!isDeepStrictEqual(intent.candidate.view, intent.view) || !isDeepStrictEqual(intent.candidate.model, intent.model)) throw new HistoryRefusal("stale", intent.effects);
    intent.candidate.assertCurrent();
  }
  /** Called only by NativeAdmission.created for the exact unpublished continuation candidate. */
  admissionForCreated(agent: Agent): DsmmProfileAdmission | undefined {
    const intent = this.prepared.get(agent);
    if (!intent) return undefined;
    this.check(intent);
    if (intent.agent !== agent || agent.id !== intent.request.sessionId || agent.session.header.origin === "subagent") throw new HistoryRefusal("not-owned", intent.effects);
    return intent.candidate.admission;
  }
  private authorize(request: SessionActivationRequest): SessionActivationAdmission {
    const intent = [...this.intents.values()].find(row => row.options === request.options);
    if (!intent || request.parentAgent || !request.processPending || request.sessionId !== intent.request.sessionId || request.setup !== intent.options?.setup
      || original(request.persistence) !== original(intent.persistence) || request.persistence.identity !== intent.persistenceIdentity || original(request.owner.fiber) !== intent.nativeOwner) throw new HistoryRefusal("authorization-required");
    const check = (): undefined => { request.signal.throwIfAborted(); this.check(intent); };
    check();
    return {
      assertCurrent: check,
      validateLoaded: loaded => {
        check();
        if (!isDeepStrictEqual({ meta: loaded.meta, inheritedEventCount: loaded.inheritedEventCount, events: loaded.events }, intent.inspection)
          || loaded.migrationRequired !== intent.migrationRequired) throw new HistoryRefusal("stale");
        intent.effects = "may-have-committed";
      },
      validatePublish: agent => {
        check();
        if (this.prepared.get(agent) !== intent || intent.agent !== agent) throw new HistoryRefusal("not-owned", intent.effects);
        if (this.ctx.agents.get(agent.id) === agent && this.admission.assert(agent) !== intent.candidate.admission) throw new HistoryRefusal("stale", intent.effects);
      },
      dispose() {},
    };
  }
  confirm(input: HistoryConfirmRequest, operator: HistoryOperator): Promise<HistoryContinuationResult> {
    const request = parseHistoryConfirmRequest(input), intent = this.intents.get(request.intentId);
    this.visible(request.sessionId, operator); this.ready();
    if (!intent || intent.request.sessionId !== request.sessionId || intent.operator.peer !== operator.peer || intent.operator.connection !== operator.connection) throw new HistoryRefusal("authorization-required");
    try { this.check(intent); } catch (error) { if (!intent.operation) this.release(intent); throw error; }
    if (!request.processPending || intent.migrationRequired && !request.acceptMigration) throw new HistoryRefusal("authorization-required");
    if (intent.operation) return intent.operation;
    const signal = AbortSignal.any([operator.signal, intent.signal]);
    const operation = (async (): Promise<HistoryContinuationResult> => {
      let committed = false;
      try {
        await intent.candidate.revalidate(signal); operator.assertCurrent(); this.check(intent);
        const activation: ApiSessionActivationRequest = {
          sessionId: SessionId(request.sessionId), agentPreset: intent.request.preset, modelSelection: intent.model,
          agentOptions: { provider: intent.model.provider, model: intent.model.model }, signal, processPending: true,
          authorize: (options, owner) => { operator.assertCurrent(); this.check(intent); intent.options = options; intent.nativeOwner = original(owner.fiber); },
          setup: async (_ctx, agent) => {
            operator.assertCurrent(); this.check(intent); intent.agent = agent; this.prepared.set(agent, intent);
            await intent.candidate.install(agent, signal); operator.assertCurrent(); this.check(intent);
          },
        };
        await intent.controller.activateSession(activation);
        committed = true;
        return { sessionId: request.sessionId, execution: "active" };
      } catch (error) { throw new HistoryRefusal(historyFailure(error).code, intent.effects); }
      finally { this.release(intent, !committed); }
    })();
    intent.operation = operation;
    return operation;
  }
  private release(intent: Intent, abort = true): void {
    if (this.intents.get(intent.id) !== intent) return;
    this.intents.delete(intent.id); intent.detach();
    if (abort) intent.abort.abort();
    if (intent.agent) this.prepared.delete(intent.agent);
    const result = intent.candidate.dispose();
    if (result) {
      const cleanup = Promise.resolve(result); this.cleanups.add(cleanup);
      void cleanup.then(() => this.cleanups.delete(cleanup), error => { this.ctx.logger.error(error); this.cleanups.delete(cleanup); });
    }
  }
}
declare module "@deepseek-ai/cordis" { interface Context { dsmmHistoryContinuation: HistoryContinuations } }
export function historyFailure(error: unknown): HistoryFailure {
  if (error instanceof HistoryRefusal) return { code: error.code, storageEffects: error.storageEffects };
  if (error instanceof TypeError) return { code: "validation", storageEffects: "none" };
  const category: unknown = error && typeof error === "object" ? Reflect.get(error, "category") : undefined;
  const code: HistoryFailureCode = category === "initializing" ? "busy" : category === "stale" || category === "cancelled" || category === "unsupported-backend" || category === "authorization-required" ? category
    : error instanceof Error && error.name === "SessionAlreadyOwnedError" ? "busy" : error instanceof Error && error.name === "AbortError" ? "cancelled" : "initialization-failed";
  return { code, storageEffects: "none" };
}
