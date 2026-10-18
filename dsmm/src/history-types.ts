/** History content remains on the native list/page/follow and presentation surfaces. */
export type HistoryExecution = "authorization-required" | "activating" | "active" | "unavailable";
export type HistoryFailureCode = "validation" | "not-owned" | "not-found" | "unsupported-host" | "unsupported-backend" | "unavailable" | "busy" | "stale" | "cancelled" | "authorization-required" | "child-owner-required" | "format-unavailable" | "initialization-failed";
export interface HistoryFailure {
  code: HistoryFailureCode;
  storageEffects: "none" | "may-have-committed";
}
export interface HistoryStatus {
  sessionId: string;
  readable: "readable" | "unavailable";
  execution: HistoryExecution;
  compatibleHost: boolean;
  reason?: HistoryFailureCode;
}
export interface HistoryChoice { id: string; label: string }
export interface HistoryChoices { presets: HistoryChoice[]; profiles: HistoryChoice[] }
export interface HistoryPreviewRequest {
  sessionId: string;
  preset: string;
  /** null selects the deployment baseline, not a historical session selection. */
  profileId: string | null;
}
export interface HistoryConfirmRequest {
  sessionId: string;
  intentId: string;
  processPending: boolean;
  acceptMigration: boolean;
}
export type HistoryJson = null | boolean | number | string | HistoryJson[] | { [key: string]: HistoryJson };
export interface HistoryCandidateView {
  preset: HistoryChoice;
  profile: HistoryChoice | null;
  model: { provider: string; model: string; reasoningEffort?: string };
  roles: HistoryChoice[];
  /** Current, effective restrictions from the trusted policy provider. */
  restrictions: string[];
  differences: string[];
}
export interface HistoryPreview {
  sessionId: string;
  intentId: string;
  cwd: string;
  candidate: HistoryCandidateView;
  migrationRequired: boolean;
  /** Native inbox projection, displayed as untrusted input and never replayed by DSMM. */
  pending: { nextTurn: HistoryJson[]; nextStep: HistoryJson[] };
}
export interface HistoryContinuationResult {
  sessionId: string;
  execution: "active";
}
