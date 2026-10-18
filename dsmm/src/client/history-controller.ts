import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import type { DsmmHistoryRemote } from "../history-remote.js";
import { parseHistoryChoices, parseHistoryFailure, parseHistoryPreview, parseHistoryResult, parseHistoryStatus } from "../history-codec.js";
import type { HistoryChoices, HistoryFailure, HistoryPreview, HistoryStatus } from "../history-types.js";

export interface HistoryClientSnapshot {
  sessionId: string | null;
  phase: "disconnected" | "loading" | "ready" | "previewing" | "confirming" | "unknown";
  status: HistoryStatus | null;
  choices: HistoryChoices | null;
  preview: HistoryPreview | null;
  issue: HistoryFailure | null;
}
interface Scope { remote: DsmmHistoryRemote; connection: object; sessionId: string; owner?: object }
function initial(sessionId: string | null = null): HistoryClientSnapshot { return { sessionId, phase: sessionId === null ? "disconnected" : "loading", status: null, choices: null, preview: null, issue: null }; }
function value<T>(result: RemoteResult<T>, parse: (input: unknown) => T): T { if (result.ok) return parse(result.value); throw result.error; }
function failure(error: unknown, confirming = false): HistoryFailure {
  if (error && typeof error === "object" && Reflect.get(error, "code") === "dsmm-history/refused") {
    try { return parseHistoryFailure(Reflect.get(error, "details")); } catch { /* Unknown wire errors cannot authorize a retry. */ }
  }
  return { code: "unavailable", storageEffects: confirming ? "may-have-committed" : "none" };
}
/** Connection/session generation fences for continuation only; native history and composer stay authoritative. */
export class HistoryContinuationController {
  private scope: Scope | undefined;
  private state = initial();
  private request: object | undefined;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  readonly getSnapshot = (): HistoryClientSnapshot => this.state;
  readonly subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(next: HistoryClientSnapshot): void { this.state = next; for (const listener of this.listeners) listener(); }
  bind(remote: DsmmHistoryRemote | undefined, connection: object | undefined, sessionId: string | null, owner?: object): void {
    if (this.disposed) return;
    if (this.scope?.remote === remote && this.scope?.connection === connection && this.scope?.sessionId === sessionId && this.scope?.owner === owner) return;
    if (!this.scope && (!remote || !connection || !sessionId) && this.state.sessionId === sessionId && this.state.phase === "disconnected") return;
    this.scope = remote && connection && sessionId ? { remote, connection, sessionId, owner } : undefined;
    const scope = this.scope;
    this.request = undefined;
    this.publish({ ...initial(sessionId), phase: this.scope ? "loading" : "disconnected" });
    if (scope && this.scope === scope) void this.refresh(this.state);
  }
  /** Observed compatibility only, never a pre-follow navigation or write-admission guard. */
  get historyBrowsingAllowed(): boolean { return this.state.status?.compatibleHost === true; }
  dispose(): void { this.scope = undefined; this.request = undefined; this.disposed = true; this.listeners.clear(); }
  async refresh(expected: HistoryClientSnapshot): Promise<void> {
    const scope = this.scope;
    if (!scope || this.state !== expected || this.state.phase === "confirming") return;
    const request = this.request = {};
    this.publish({ ...this.state, phase: "loading", preview: null, issue: null });
    if (this.scope !== scope || this.request !== request) return;
    try {
      const status = value(await scope.remote.describe(scope.sessionId), parseHistoryStatus);
      if (this.scope !== scope || this.request !== request) return;
      if (status.sessionId !== scope.sessionId) throw new TypeError("Mismatched history response");
      const choices = status.execution === "authorization-required" ? value(await scope.remote.choices(), parseHistoryChoices) : null;
      if (this.scope !== scope || this.request !== request) return;
      this.publish({ sessionId: scope.sessionId, phase: "ready", status, choices, preview: null, issue: null });
    } catch (error) { if (this.scope === scope && this.request === request) this.publish({ ...this.state, phase: "ready", issue: failure(error), preview: null }); }
  }
  async preview(expected: HistoryClientSnapshot, preset: string, profileId: string | null): Promise<void> {
    const scope = this.scope;
    if (!scope || this.state !== expected || expected.phase !== "ready" || expected.status?.execution !== "authorization-required" || !expected.status.compatibleHost) return;
    const request = this.request = {};
    this.publish({ ...this.state, phase: "previewing", preview: null, issue: null });
    if (this.scope !== scope || this.request !== request) return;
    try {
      const preview = value(await scope.remote.preview(scope.sessionId, { sessionId: scope.sessionId, preset, profileId }), parseHistoryPreview);
      if (this.scope !== scope || this.request !== request) return;
      if (preview.sessionId !== scope.sessionId || preview.candidate.preset.id !== preset || (preview.candidate.profile?.id ?? null) !== profileId) throw new TypeError("Mismatched continuation proposal");
      this.publish({ ...this.state, phase: "ready", preview });
    } catch (error) { if (this.scope === scope && this.request === request) this.publish({ ...this.state, phase: "ready", issue: failure(error), preview: null }); }
  }
  async confirm(expected: HistoryClientSnapshot, processPending: boolean, acceptMigration: boolean): Promise<void> {
    const scope = this.scope, preview = expected.preview;
    if (!scope || this.state !== expected || expected.phase !== "ready" || !preview || !processPending || preview.migrationRequired && !acceptMigration) return;
    const request = this.request = {};
    this.publish({ ...this.state, phase: "confirming", issue: null });
    if (this.scope !== scope || this.request !== request) return;
    try {
      const receipt = value(await scope.remote.confirm(scope.sessionId, { sessionId: scope.sessionId, intentId: preview.intentId, processPending, acceptMigration }), parseHistoryResult);
      if (this.scope !== scope || this.request !== request) return;
      if (receipt.sessionId !== scope.sessionId) throw new TypeError("Mismatched continuation receipt");
      this.publish({ ...this.state, phase: "ready", preview: null, status: { sessionId: scope.sessionId, readable: "readable", compatibleHost: true, execution: "active" } });
    } catch (error) {
      if (this.scope !== scope || this.request !== request) return;
      const issue = failure(error, true);
      this.publish({ ...this.state, phase: issue.storageEffects === "may-have-committed" ? "unknown" : "ready", preview: null, issue });
    }
  }
}
