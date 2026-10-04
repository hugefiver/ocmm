import type { InvocationDescriptor, RemoteResult, TypertCodec, TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry";
import type { ProfileErrorInfo, ProfileReadResult, ProfileSaveRequest, ProfileSelectRequest, ProfileSnapshot } from "./profile-types.js";

export interface DsmmProfilesRemote {
  describe(): Promise<RemoteResult<ProfileSnapshot>>;
  read(id: string): Promise<RemoteResult<ProfileReadResult>>;
  save(request: ProfileSaveRequest): Promise<RemoteResult<ProfileReadResult>>;
  select(request: ProfileSelectRequest): Promise<RemoteResult<ProfileSnapshot>>;
}

declare module "@deepseek-ai/dsh-typert-protocol/types" {
  interface TypertRemoteMap {
    "dsmmProfiles/describe": DsmmProfilesRemote["describe"];
    "dsmmProfiles/read": DsmmProfilesRemote["read"];
    "dsmmProfiles/save": DsmmProfilesRemote["save"];
    "dsmmProfiles/select": DsmmProfilesRemote["select"];
  }
  interface TypertRemoteNamespaceMap { dsmmProfiles: DsmmProfilesRemote }
  interface RemoteErrorDetailsMap {
    "dsmm-profiles/refused": ProfileErrorInfo;
    "dsmm-profiles/peer-required": {};
  }
}

const errorCodes = new Set(["validation", "conflict", "not-found", "lock-timeout", "unsafe-path", "io", "activation", "corrupt-selection", "limit"]);
const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const revisionPattern = /^[a-f0-9]{64}$/u;

/** Shared wire grammar for native codec validation and local form feedback. */
export function isProfileId(value: unknown): value is string {
  return typeof value === "string" && idPattern.test(value)
    && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/iu.test(value);
}

function fail(field: string): never { throw new TypeError(`Invalid DSMM profile wire field: ${field}`); }
function text(value: unknown, field: string, maximum = 1024): string {
  if (typeof value !== "string" || value.length > maximum) fail(field);
  return value;
}
function id(value: unknown): string {
  const result = text(value, "id", 64);
  if (!isProfileId(result)) fail("id");
  return result;
}
function revision(value: unknown): string {
  const result = text(value, "revision", 64);
  if (!revisionPattern.test(result)) fail("revision");
  return result;
}
function selectionRevision(value: unknown): string { return value === "absent" ? value : revision(value); }
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("object");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !required.includes(key) && !optional.includes(key))
    || required.some((key) => !Object.hasOwn(result, key))) fail("object keys");
  return result;
}
function optional<T>(value: Record<string, unknown>, key: string, parse: (input: unknown) => T): Record<string, T> {
  return Object.hasOwn(value, key) ? { [key]: parse(value[key]) } : {};
}
function errorInfo(value: unknown): ProfileErrorInfo {
  const item = object(value, ["code", "message"], ["field"]);
  const code = text(item.code, "code");
  if (!errorCodes.has(code)) fail("code");
  return { code: code as ProfileErrorInfo["code"], message: text(item.message, "message", 4096), ...optional(item, "field", (input) => text(input, "field", 256)) };
}
function readResult(value: unknown): ProfileReadResult {
  const item = object(value, ["id", "revision", "content"], ["label"]);
  return { id: id(item.id), revision: revision(item.revision), content: content(item.content), ...optional(item, "label", (input) => text(input, "label", 120)) };
}
function content(value: unknown): string {
  const result = text(value, "content", 128 * 1024);
  if (new TextEncoder().encode(result).byteLength > 128 * 1024) fail("content");
  return result;
}
function snapshot(value: unknown): ProfileSnapshot {
  const item = object(value, ["profiles", "selectedId", "appliedRevision", "selectionRevision"], ["selectionError"]);
  if (!Array.isArray(item.profiles) || item.profiles.length > 128) fail("profiles");
  return {
    profiles: item.profiles.map((input) => {
      const row = object(input, ["id", "revision"], ["label", "error"]);
      return { id: text(row.id, "id", 64), revision: row.revision === null ? null : revision(row.revision), ...optional(row, "label", (input) => text(input, "label", 120)), ...optional(row, "error", errorInfo) };
    }),
    selectedId: item.selectedId === null ? null : id(item.selectedId),
    appliedRevision: item.appliedRevision === null ? null : revision(item.appliedRevision),
    selectionRevision: item.selectionRevision === "unavailable" && Object.hasOwn(item, "selectionError") ? "unavailable" : selectionRevision(item.selectionRevision),
    ...optional(item, "selectionError", errorInfo),
  };
}
function saveRequest(value: unknown): ProfileSaveRequest {
  const item = object(value, ["id", "content", "expectedRevision"]);
  return { id: id(item.id), content: content(item.content), expectedRevision: item.expectedRevision === null ? null : revision(item.expectedRevision) };
}
function selectRequest(value: unknown): ProfileSelectRequest {
  const item = object(value, ["id", "expectedSelectionRevision"], ["expectedRevision"]);
  const result: ProfileSelectRequest = { id: item.id === null ? null : id(item.id), expectedSelectionRevision: selectionRevision(item.expectedSelectionRevision), ...optional(item, "expectedRevision", revision) };
  if (result.id !== null && result.expectedRevision === undefined) fail("expectedRevision");
  if (result.id === null && result.expectedRevision !== undefined) fail("expectedRevision");
  return result;
}
function codec(symbol: string, parse: (value: unknown) => unknown): TypertCodec {
  return { mode: "strict", typeSymbol: `@dsmm/dsmm#${symbol}`, create: () => ({ parse }) };
}
function descriptor(method: string, result: TypertCodec, parameter?: { name: string; codec: TypertCodec }): InvocationDescriptor {
  return { id: `@dsmm/dsmm#dsmmProfiles/${method}`, service: "dsmmProfiles", namespace: "dsmmProfiles", method, invocation: { kind: "direct" }, parameters: parameter === undefined ? [] : [{ name: parameter.name, wire: parameter.name, source: "json", codec: parameter.codec }], result };
}

/** Explicit strict Host contract; no SRC fallback or browser-supplied authority. */
export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: "@dsmm/dsmm",
  descriptors: [
    descriptor("describe", codec("ProfileSnapshot", snapshot)),
    descriptor("read", codec("ProfileReadResult", readResult), { name: "id", codec: codec("ProfileId", id) }),
    descriptor("save", codec("ProfileReadResult", readResult), { name: "request", codec: codec("ProfileSaveRequest", saveRequest) }),
    descriptor("select", codec("ProfileSnapshot", snapshot), { name: "request", codec: codec("ProfileSelectRequest", selectRequest) }),
  ],
};

export const TYPERT_HOST: TypertContribution = {
  package: "@dsmm/dsmm", face: "host", schemas: [],
  model: { services: [], events: [], objects: [] }, invocations: TYPERT_REMOTE.descriptors,
};

export default TYPERT_REMOTE;
