import type { InvocationDescriptor, TypertCodec, TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry";
import type { ChildPermissionView, TemporaryPermissionDelivery, TemporaryPermissionDuration, TemporaryPermissionGrantView, TemporaryPermissionRequestView } from "./permission-temporary-types.js";
function row(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw new TypeError("Invalid temporary permission DTO.");
  return value as Record<string, unknown>;
}
export function parseTemporaryId(value: unknown): string {
  if (typeof value !== "string" || !value.length || value.length > 512 || /[\u0000-\u001f]/u.test(value)) throw new TypeError("Invalid temporary permission identity.");
  return value;
}
export function parseTemporaryDuration(value: unknown): TemporaryPermissionDuration {
  if (value !== "once" && value !== "session" && value !== "15min" && value !== "1h") throw new TypeError("Invalid duration.");
  return value;
}
export function parseTemporaryDelivery(value: unknown): TemporaryPermissionDelivery {
  const input = row(value, ["requestId", "deliveryId"]);
  return { requestId: parseTemporaryId(input.requestId), deliveryId: parseTemporaryId(input.deliveryId) };
}
function summary(value: unknown): string {
  if (typeof value !== "string" || value.length > 65_536) throw new TypeError("Invalid summary."); return value;
}
export function parseTemporaryGrants(value: unknown): readonly TemporaryPermissionGrantView[] {
  if (!Array.isArray(value) || value.length > 1024) throw new TypeError("Invalid grants.");
  return value.map(item => {
    const input = row(item, ["id", "sessionId", "tool", "summary", "duration"], ["remainingMs"]), duration = parseTemporaryDuration(input.duration);
    if (duration === "once" || input.remainingMs !== undefined && (typeof input.remainingMs !== "number" || !Number.isFinite(input.remainingMs) || input.remainingMs < 0)) throw new TypeError("Invalid grant lifetime.");
    return { id: parseTemporaryId(input.id), sessionId: parseTemporaryId(input.sessionId), tool: parseTemporaryId(input.tool), summary: summary(input.summary), duration,
      ...(typeof input.remainingMs === "number" ? { remainingMs: input.remainingMs } : {}) };
  });
}
export function parseTemporaryRequest(value: unknown): TemporaryPermissionRequestView {
  const input = row(value, ["requestId", "deliveryId", "sessionId", "tool", "summary", "reusable"], ["scopes"]);
  if (typeof input.reusable !== "boolean") throw new TypeError("Invalid request capability.");
  let scopes: { id: string; summary: string }[] | undefined;
  if (input.scopes !== undefined) {
    if (!Array.isArray(input.scopes) || input.scopes.length > 4) throw new TypeError("Invalid scopes.");
    scopes = input.scopes.map(value => { const scope = row(value, ["id", "summary"]); return { id: parseTemporaryId(scope.id), summary: summary(scope.summary) }; });
  }
  return { requestId: parseTemporaryId(input.requestId), deliveryId: parseTemporaryId(input.deliveryId), sessionId: parseTemporaryId(input.sessionId),
    tool: parseTemporaryId(input.tool), summary: summary(input.summary), reusable: input.reusable, ...(scopes ? { scopes } : {}) };
}
const codec = (name: string, parse: (value: unknown) => unknown): TypertCodec => ({ mode: "strict", typeSymbol: `@dsmm/dsmm#Temporary${name}`, create: () => ({ parse }) });
export function parseChildPermission(value: unknown): ChildPermissionView {
  const input = row(value, ["parentSessionId", "childSessionId", "project", "state", "canEnable", "canRevoke"], ["role", "readOnly"]);
  const state = input.state;
  if (state !== "disabled" && state !== "enabled" && state !== "unavailable" || typeof input.canEnable !== "boolean" || typeof input.canRevoke !== "boolean"
    || input.readOnly !== undefined && typeof input.readOnly !== "boolean") throw new TypeError("Invalid child permission state.");
  return { parentSessionId: parseTemporaryId(input.parentSessionId), childSessionId: parseTemporaryId(input.childSessionId), project: summary(input.project),
    state, canEnable: input.canEnable, canRevoke: input.canRevoke,
    ...(input.role === undefined ? {} : { role: parseTemporaryId(input.role) }), ...(typeof input.readOnly === "boolean" ? { readOnly: input.readOnly } : {}) };
}
const id = codec("Id", parseTemporaryId), delivery = codec("Delivery", parseTemporaryDelivery);
const grants = codec("Grants", parseTemporaryGrants), request = codec("Request", parseTemporaryRequest);
function descriptor(method: string, fields: readonly [string, TypertCodec][], result: TypertCodec): InvocationDescriptor {
  return { id: `@dsmm/dsmm-temporary-permissions#dsmmTemporaryPermissions/${method}`, service: "dsmmTemporaryPermissions", namespace: "dsmmTemporaryPermissions", method,
    invocation: { kind: "direct" }, parameters: [["sessionId", id] as const, ...fields].map(([name, codec]) => ({ name, wire: name, source: "json" as const, codec })), result };
}
export const TEMPORARY_PERMISSION_REMOTE: TypertRemoteContribution = { package: "@dsmm/dsmm-temporary-permissions", descriptors: [
  descriptor("describe", [], grants), descriptor("request", [["delivery", delivery]], request),
   descriptor("retain", [["delivery", delivery], ["duration", codec("Duration", parseTemporaryDuration)], ["scope", codec("Scope", value => value === undefined ? "exact" : parseTemporaryId(value))]], id),
  descriptor("permit", [["delivery", delivery]], codec("Permit", value => value === null ? null : parseTemporaryId(value))),
  descriptor("revoke", [["grantId", id]], grants),
  ...["child", "enableChild", "revokeChild"].map(method => descriptor(method, [["childSessionId", id]], codec("Child", parseChildPermission))),
] };
export const TEMPORARY_PERMISSION_HOST: TypertContribution = { package: TEMPORARY_PERMISSION_REMOTE.package, face: "host", schemas: [], model: { services: [], events: [], objects: [] }, invocations: TEMPORARY_PERMISSION_REMOTE.descriptors };
declare module "@deepseek-ai/dsh-typert-protocol/types" { interface RemoteErrorDetailsMap { "dsmm-temporary-permissions/refused": { code: string } } }
