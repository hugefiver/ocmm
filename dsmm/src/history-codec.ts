import { isNativeSessionId, isProfileId } from "./profile-remote.js";
import type { HistoryCandidateView, HistoryChoices, HistoryConfirmRequest, HistoryContinuationResult, HistoryFailure, HistoryFailureCode, HistoryJson, HistoryPreview, HistoryPreviewRequest, HistoryStatus } from "./history-types.js";

const codes: readonly HistoryFailureCode[] = ["validation", "not-owned", "not-found", "unsupported-host", "unsupported-backend", "unavailable", "busy", "stale", "cancelled", "authorization-required", "child-owner-required", "format-unavailable", "initialization-failed"];
function invalid(): never { throw new TypeError("Invalid history continuation request or response"); }
function object(input: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input)) || Object.getOwnPropertySymbols(input).length
    || Object.values(Object.getOwnPropertyDescriptors(input)).some(row => !Object.hasOwn(row, "value") || !row.enumerable)) invalid();
  const row = input as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(row, key)) || Object.keys(row).some(key => !required.includes(key) && !optional.includes(key))) invalid();
  return row;
}
function text(input: unknown, maximum = 4096): string { if (typeof input !== "string" || input.length > maximum) invalid(); return input; }
function bool(input: unknown): boolean { if (typeof input !== "boolean") invalid(); return input; }
function list<T>(input: unknown, parse: (value: unknown) => T): T[] { if (!Array.isArray(input)) invalid(); return input.map(value => parse(value)); }
function code(input: unknown): HistoryFailureCode { if (!codes.includes(input as HistoryFailureCode)) invalid(); return input as HistoryFailureCode; }
export function historySessionId(input: unknown): string { if (!isNativeSessionId(input)) invalid(); return input; }
function intentId(input: unknown): string { const id = text(input, 36); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id)) invalid(); return id; }
function profileId(input: unknown): string | null { if (input === null) return null; if (!isProfileId(input)) invalid(); return input; }
function presetId(input: unknown): string { return historySessionId(input); }
function choice(input: unknown) { const row = object(input, ["id", "label"]); return { id: text(row.id, 256), label: text(row.label, 120) }; }
export function historyJson(input: unknown, depth = 0, active = new Set<object>()): HistoryJson {
  if (depth > 32) invalid();
  if (input === null || typeof input === "boolean" || typeof input === "string") return input;
  if (typeof input === "number") { if (!Number.isFinite(input)) invalid(); return input; }
  if (!input || typeof input !== "object") invalid();
  if (active.has(input)) invalid();
  active.add(input);
  try {
    if (Array.isArray(input)) {
      if (Object.getOwnPropertySymbols(input).length || Object.entries(Object.getOwnPropertyDescriptors(input)).some(([key, property]) => key !== "length" && (!/^(0|[1-9][0-9]*)$/u.test(key) || !Object.hasOwn(property, "value") || !property.enumerable))) invalid();
      return input.map(value => historyJson(value, depth + 1, active));
    }
    const row = object(input, Object.keys(input));
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, historyJson(value, depth + 1, active)]));
  } finally { active.delete(input); }
}
export function parseHistoryFailure(input: unknown): HistoryFailure {
  const row = object(input, ["code", "storageEffects"]);
  if (row.storageEffects !== "none" && row.storageEffects !== "may-have-committed") invalid();
  return { code: code(row.code), storageEffects: row.storageEffects };
}
export function parseHistoryStatus(input: unknown): HistoryStatus {
  const row = object(input, ["sessionId", "readable", "execution", "compatibleHost"], ["reason"]);
  if (row.readable !== "readable" && row.readable !== "unavailable") invalid();
  if (!["authorization-required", "activating", "active", "unavailable"].includes(String(row.execution))) invalid();
  return { sessionId: historySessionId(row.sessionId), readable: row.readable, execution: row.execution as HistoryStatus["execution"], compatibleHost: bool(row.compatibleHost), ...(row.reason === undefined ? {} : { reason: code(row.reason) }) };
}
export function parseHistoryChoices(input: unknown): HistoryChoices {
  const row = object(input, ["presets", "profiles"]);
  return { presets: list(row.presets, value => { const result = choice(value); presetId(result.id); return result; }), profiles: list(row.profiles, value => { const result = choice(value); profileId(result.id); return result; }) };
}
export function parseHistoryPreviewRequest(input: unknown): HistoryPreviewRequest {
  const row = object(input, ["sessionId", "preset", "profileId"]);
  return { sessionId: historySessionId(row.sessionId), preset: presetId(row.preset), profileId: profileId(row.profileId) };
}
export function parseHistoryConfirmRequest(input: unknown): HistoryConfirmRequest {
  const row = object(input, ["sessionId", "intentId", "processPending", "acceptMigration"]);
  return { sessionId: historySessionId(row.sessionId), intentId: intentId(row.intentId), processPending: bool(row.processPending), acceptMigration: bool(row.acceptMigration) };
}
function candidate(input: unknown): HistoryCandidateView {
  const row = object(input, ["preset", "profile", "model", "roles", "restrictions", "differences"]);
  const model = object(row.model, ["provider", "model"], ["reasoningEffort"]);
  return { preset: choice(row.preset), profile: row.profile === null ? null : choice(row.profile),
    model: { provider: text(model.provider, 256), model: text(model.model, 256), ...(model.reasoningEffort === undefined ? {} : { reasoningEffort: text(model.reasoningEffort, 128) }) },
    roles: list(row.roles, choice), restrictions: list(row.restrictions, value => text(value)), differences: list(row.differences, value => text(value)) };
}
export function parseHistoryPreview(input: unknown): HistoryPreview {
  const row = object(input, ["sessionId", "intentId", "cwd", "candidate", "migrationRequired", "pending"]), pending = object(row.pending, ["nextTurn", "nextStep"]);
  return { sessionId: historySessionId(row.sessionId), intentId: intentId(row.intentId), cwd: text(row.cwd), candidate: candidate(row.candidate), migrationRequired: bool(row.migrationRequired), pending: { nextTurn: list(pending.nextTurn, historyJson), nextStep: list(pending.nextStep, historyJson) } };
}
export function parseHistoryResult(input: unknown): HistoryContinuationResult {
  const row = object(input, ["sessionId", "execution"]); if (row.execution !== "active") invalid();
  return { sessionId: historySessionId(row.sessionId), execution: "active" };
}
