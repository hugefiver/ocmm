import type { Agent, ModelSelection } from "@deepseek-ai/dsh-agent";
import type { SessionInspection } from "@deepseek-ai/dsh-session-persistence";
import type { DsmmProfileAdmission } from "./settings.js";
import type { HistoryCandidateView, HistoryChoices, HistoryPreviewRequest } from "./history-types.js";

/** A current profile/preset/policy preparation, never reconstructed from old epochs or approvals. */
export interface HistoryCandidate {
  readonly admission: DsmmProfileAdmission;
  readonly view: HistoryCandidateView;
  readonly model: ModelSelection;
  readonly signal: AbortSignal;
  /** Re-read current configuration and availability without touching the historical log. */
  revalidate(signal: AbortSignal): Promise<void>;
  /** Synchronous revision/owner/policy fence, including across native created notifications. */
  assertCurrent(): undefined;
  /** Install current native restrictions in the unpublished Agent; registrations belong to that Agent. */
  install(agent: Agent, signal: AbortSignal): Promise<void>;
  /** Release preparation resources, not successfully installed Agent policy. */
  dispose(): void | Promise<void>;
}
export interface HistoryCandidates {
  readonly signal: AbortSignal;
  checkCompatibility?(): Promise<void>;
  choices(signal: AbortSignal): Promise<HistoryChoices>;
  prepare(request: HistoryPreviewRequest, inspection: SessionInspection, signal: AbortSignal): Promise<HistoryCandidate>;
}
/** Existing NativeAdmission surface; the bridge adds no second admission owner. */
export interface HistoryNativeAdmission {
  readonly lifetime: AbortController;
  readonly isReady: boolean;
  get(agent: Agent): DsmmProfileAdmission | undefined;
  assert(agent: Agent): DsmmProfileAdmission;
}
/** Host-created identity. None of these fields is accepted from the wire. */
export interface HistoryOperator {
  readonly peer: object;
  readonly connection: object;
  readonly peerSignal: AbortSignal;
  readonly signal: AbortSignal;
  assertCurrent(): void;
  /** Does not retain a completed preview RPC's cancellation signal. */
  assertOwner(): void;
  assertVisible(sessionId: string): void;
}
