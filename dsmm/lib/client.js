window.__ModuleLoader__.load({ id: "@dsmm/dsmm", factory: (require) => { const module = { exports: {} }; const exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  NEW_PROFILE_CONTENT: () => NEW_PROFILE_CONTENT,
  NS: () => NS,
  ProfilesController: () => ProfilesController,
  ProfilesSection: () => ProfilesSection,
  SessionProfiles: () => SessionProfiles,
  TYPERT_REMOTE: () => TYPERT_REMOTE,
  apply: () => apply,
  editStructuredPath: () => editStructuredPath,
  en: () => en,
  inject: () => inject,
  moveFallback: () => moveFallback,
  structuredDocument: () => structuredDocument,
  zh: () => zh
});
module.exports = __toCommonJS(index_exports);

// src/routing-policy.ts
var DEFAULT_DSMM_RATE_LIMIT_POLICY = Object.freeze({
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 1e4,
  maxTotalDelayMs: 3e4,
  switchAfterRateLimits: 3,
  maxSwitches: 2
});
var DEFAULT_DSMM_RUNTIME_POLICY = Object.freeze({
  strategy: "startup-lock",
  rateLimit: DEFAULT_DSMM_RATE_LIMIT_POLICY
});
var DSMM_RATE_LIMIT_BOUNDS = Object.freeze({
  maxRetries: Object.freeze([0, 10]),
  initialDelayMs: Object.freeze([0, 3e4]),
  maxDelayMs: Object.freeze([0, 3e4]),
  maxTotalDelayMs: Object.freeze([0, 12e4]),
  switchAfterRateLimits: Object.freeze([1, 10]),
  maxSwitches: Object.freeze([0, 10])
});
function normalizeRoutingStrategy(value) {
  if (value !== "startup-lock" && value !== "rate-limit-fallback") {
    throw new TypeError("dsmm strategy must be startup-lock or rate-limit-fallback");
  }
  return value;
}
function normalizeRateLimitOverrides(value) {
  if (!isRecord(value)) throw new TypeError("dsmm rateLimit must be an object");
  const result = {};
  for (const [field, raw] of Object.entries(value)) {
    if (!Object.hasOwn(DSMM_RATE_LIMIT_BOUNDS, field)) throw new TypeError("dsmm rateLimit contains an unknown field");
    const [minimum, maximum] = DSMM_RATE_LIMIT_BOUNDS[field];
    if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < minimum || raw > maximum) {
      throw new TypeError(`dsmm rateLimit ${field} must be an integer from ${minimum} to ${maximum}`);
    }
    result[field] = raw;
  }
  return result;
}
function normalizeRateLimitPolicy(value = void 0, defaults = DEFAULT_DSMM_RATE_LIMIT_POLICY) {
  return { ...defaults, ...value === void 0 ? {} : normalizeRateLimitOverrides(value) };
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/profile-remote.ts
var errorCodes = /* @__PURE__ */ new Set(["validation", "conflict", "not-found", "lock-timeout", "unsafe-path", "io", "activation", "corrupt-selection", "limit", "busy", "maintenance", "disposed", "not-owned", "unavailable", "cancelled"]);
var idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
var revisionPattern = /^[a-f0-9]{64}$/u;
var rolePattern = /^dsmm-(?:orchestrator|planner|plan-critic|builder|reviewer|oracle|oracle-2nd|creative|code-search|doc-search|clarifier|media-reader|frontend|hard-reasoning|research|quick|coding|normal-task|complex|deep|documenting|cross-cutting)$/u;
function isProfileId(value) {
  return typeof value === "string" && idPattern.test(value) && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/iu.test(value);
}
function fail(field) {
  throw new TypeError(`Invalid Deepwork profile wire field: ${field}`);
}
function text(value, field, maximum = 1024) {
  if (typeof value !== "string" || value.length > maximum) fail(field);
  return value;
}
function id(value) {
  const result = text(value, "id", 64);
  if (!isProfileId(result)) fail("id");
  return result;
}
function revision(value) {
  const result = text(value, "revision", 64);
  if (!revisionPattern.test(result)) fail("revision");
  return result;
}
function selectionRevision(value) {
  return value === "absent" ? value : revision(value);
}
function isNativeSessionId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value) && new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(value)) === value;
}
function sessionId(value) {
  if (!isNativeSessionId(value)) fail("sessionId");
  return value;
}
function boolean(value, field) {
  if (typeof value !== "boolean") fail(field);
  return value;
}
function integer(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) fail(field);
  return value;
}
function routeText(value, field, maximum) {
  const result = text(value, field, maximum);
  if (result.trim() === "" || /[\u0000-\u001f\u007f]/u.test(result) || new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(result)) !== result) fail(field);
  return result;
}
function role(value) {
  if (typeof value !== "string" || !rolePattern.test(value)) fail("role");
  return value;
}
function object(value, required, optional2 = []) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("object");
  const result = value;
  if (Object.keys(result).some((key) => !required.includes(key) && !optional2.includes(key)) || required.some((key) => !Object.hasOwn(result, key))) fail("object keys");
  return result;
}
function optional(value, key, parse3) {
  return Object.hasOwn(value, key) ? { [key]: parse3(value[key]) } : {};
}
function errorInfo(value) {
  const item = object(value, ["code", "message"], ["field"]);
  const code = text(item.code, "code");
  if (!errorCodes.has(code)) fail("code");
  return { code, message: text(item.message, "message", 4096), ...optional(item, "field", (input) => text(input, "field", 256)) };
}
function readResult(value) {
  const item = object(value, ["id", "revision", "content"], ["label"]);
  return { id: id(item.id), revision: revision(item.revision), content: content(item.content), ...optional(item, "label", (input) => text(input, "label", 120)) };
}
function content(value) {
  const result = text(value, "content", 128 * 1024);
  if (new TextEncoder().encode(result).byteLength > 128 * 1024) fail("content");
  return result;
}
function snapshot(value) {
  const item = object(value, ["profiles", "selectedId", "appliedRevision", "selectionRevision"], ["selectionError", "roles", "editorDefaults", "origin", "readOnly", "writeRestriction"]);
  if (!Array.isArray(item.profiles) || item.profiles.length > 128) fail("profiles");
  return {
    profiles: item.profiles.map((input) => {
      const row = object(input, ["id", "revision"], ["label", "error"]);
      return { id: text(row.id, "id", 64), revision: row.revision === null ? null : revision(row.revision), ...optional(row, "label", (input2) => text(input2, "label", 120)), ...optional(row, "error", errorInfo) };
    }),
    selectedId: item.selectedId === null ? null : id(item.selectedId),
    appliedRevision: item.appliedRevision === null ? null : revision(item.appliedRevision),
    selectionRevision: item.selectionRevision === "unavailable" && Object.hasOwn(item, "selectionError") ? "unavailable" : selectionRevision(item.selectionRevision),
    ...optional(item, "selectionError", errorInfo),
    ...optional(item, "roles", (input) => {
      if (!Array.isArray(input) || input.length > 22) fail("roles");
      const result = input.map((value2) => {
        const row = object(value2, ["id", "label", "enabled"], ["runtimePolicy"]);
        return { id: role(row.id), label: text(row.label, "label", 120), enabled: boolean(row.enabled, "enabled"), ...optional(row, "runtimePolicy", (input2) => {
          const policy = object(input2, [], ["strategy", "rateLimit"]);
          return { ...optional(policy, "strategy", normalizeRoutingStrategy), ...optional(policy, "rateLimit", normalizeRateLimitOverrides) };
        }) };
      });
      if (new Set(result.map((row) => row.id)).size !== result.length) fail("roles");
      return result;
    }),
    ...optional(item, "editorDefaults", runtimePolicy),
    ...optional(item, "origin", (input) => {
      if (!["central", "legacy", "explicit"].includes(String(input))) fail("origin");
      return input;
    }),
    ...optional(item, "readOnly", (input) => boolean(input, "readOnly")),
    ...optional(item, "writeRestriction", (input) => text(input, "writeRestriction", 1024))
  };
}
function rateLimit(value) {
  const item = object(value, Object.keys(DSMM_RATE_LIMIT_BOUNDS));
  return normalizeRateLimitPolicy(item);
}
function runtimePolicy(value) {
  const item = object(value, ["strategy", "rateLimit"]);
  return { strategy: normalizeRoutingStrategy(item.strategy), rateLimit: rateLimit(item.rateLimit) };
}
function rolePolicy(value) {
  const item = object(value, ["strategy", "rateLimit", "retries", "rateLimitFailures", "switches", "totalDelayMs"], ["role", "route"]);
  return {
    ...runtimePolicy({ strategy: item.strategy, rateLimit: item.rateLimit }),
    retries: integer(item.retries, "retries", 10),
    rateLimitFailures: integer(item.rateLimitFailures, "rateLimitFailures"),
    switches: integer(item.switches, "switches", 10),
    totalDelayMs: integer(item.totalDelayMs, "totalDelayMs", 12e4),
    ...optional(item, "role", role),
    ...optional(item, "route", modelRoute)
  };
}
function modelRoute(value) {
  const route2 = object(value, ["provider", "model"], ["reasoningEffort"]);
  const provider = routeText(route2.provider, "provider", 128);
  const model = routeText(route2.model, "model", 512);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(provider) || model.includes("://")) fail("route");
  return { provider, model, ...optional(route2, "reasoningEffort", (input) => routeText(input, "reasoningEffort", 64)) };
}
function selectionState(value) {
  const item = object(value, ["selectedId", "appliedRevision", "selectionRevision"]);
  return { selectedId: item.selectedId === null ? null : id(item.selectedId), appliedRevision: item.appliedRevision === null ? null : revision(item.appliedRevision), selectionRevision: selectionRevision(item.selectionRevision) };
}
function sessionSnapshot(value) {
  const item = object(value, ["sessionId", "globalDefault", "selection", "scope", "admissionEpoch", "switchAllowed"], ["admittedSelection", "switchUnavailableReason", "rolePolicy", "profileModel", "deepwork", "modules"]);
  if (typeof item.scope !== "string" || !["global-default", "session-override", "deployment-baseline"].includes(item.scope)) fail("scope");
  return {
    sessionId: sessionId(item.sessionId),
    globalDefault: selectionState(item.globalDefault),
    selection: selectionState(item.selection),
    scope: item.scope,
    admissionEpoch: revision(item.admissionEpoch),
    switchAllowed: boolean(item.switchAllowed, "switchAllowed"),
    ...optional(item, "admittedSelection", selectionState),
    ...optional(item, "switchUnavailableReason", (input) => {
      if (typeof input !== "string" || !["busy", "maintenance", "disposed", "not-owned", "unavailable"].includes(input)) fail("switchUnavailableReason");
      return input;
    }),
    ...optional(item, "rolePolicy", rolePolicy),
    ...optional(item, "profileModel", modelRoute),
    ...optional(item, "modules", moduleStates),
    ...optional(item, "deepwork", (input) => {
      const mode = object(input, ["active", "explicit", "locked", "revision"]);
      return { active: boolean(mode.active, "active"), explicit: boolean(mode.explicit, "explicit"), locked: boolean(mode.locked, "locked"), revision: revision(mode.revision) };
    })
  };
}
function saveRequest(value) {
  const item = object(value, ["id", "content", "expectedRevision"]);
  return { id: id(item.id), content: content(item.content), expectedRevision: item.expectedRevision === null ? null : revision(item.expectedRevision) };
}
function selectRequest(value) {
  const item = object(value, ["id", "expectedSelectionRevision"], ["expectedRevision"]);
  const result = { id: item.id === null ? null : id(item.id), expectedSelectionRevision: selectionRevision(item.expectedSelectionRevision), ...optional(item, "expectedRevision", revision) };
  if (result.id !== null && result.expectedRevision === void 0) fail("expectedRevision");
  if (result.id === null && result.expectedRevision !== void 0) fail("expectedRevision");
  return result;
}
function sessionSelectRequest(value) {
  const item = object(value, ["sessionId", "id", "expectedSelectionRevision", "expectedAdmissionEpoch"], ["expectedRevision"]);
  const { sessionId: inputSessionId, expectedAdmissionEpoch, ...profileRequest } = item;
  return { ...selectRequest(profileRequest), sessionId: sessionId(inputSessionId), expectedAdmissionEpoch: revision(expectedAdmissionEpoch) };
}
function modeSelectRequest(value) {
  const item = object(value, ["sessionId", "active", "expectedModeRevision", "expectedAdmissionEpoch"]);
  return { sessionId: sessionId(item.sessionId), active: boolean(item.active, "active"), expectedModeRevision: revision(item.expectedModeRevision), expectedAdmissionEpoch: revision(item.expectedAdmissionEpoch) };
}
function codec(symbol, parse3) {
  return { mode: "strict", typeSymbol: `@dsmm/dsmm#${symbol}`, create: () => ({ parse: parse3 }) };
}
function descriptor(method, result, parameter) {
  return { id: `@dsmm/dsmm#dsmmProfiles/${method}`, service: "dsmmProfiles", namespace: "dsmmProfiles", method, invocation: { kind: "direct" }, parameters: parameter === void 0 ? [] : [{ name: parameter.name, wire: parameter.name, source: "json", codec: parameter.codec }], result };
}
function jsonData(value, depth = 0, active = /* @__PURE__ */ new Set()) {
  if (depth > 32) fail("JSON depth");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || value === null || active.has(value)) fail("JSON value");
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail("JSON object");
  active.add(value);
  const result = Array.isArray(value) ? value.map((child) => jsonData(child, depth + 1, active)) : Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (["__proto__", "prototype", "constructor"].includes(key)) fail("JSON key");
    return [key, jsonData(child, depth + 1, active)];
  }));
  active.delete(value);
  return result;
}
function globalSnapshot(value) {
  const row = object(value, ["config", "revision"]);
  object(row.config, [], Object.keys(row.config));
  return { config: jsonData(row.config), revision: selectionRevision(row.revision) };
}
function globalSaveRequest(value) {
  const row = object(value, ["expectedRevision", "edits"]);
  if (!Array.isArray(row.edits) || row.edits.length > 128) fail("edits");
  return { expectedRevision: selectionRevision(row.expectedRevision), edits: row.edits.map((value2) => {
    const edit = object(value2, ["op", "path"], ["value"]);
    if (!Array.isArray(edit.path) || edit.path.length < 1 || edit.path.length > 8) fail("field path");
    const path = edit.path.map((part) => {
      const key = text(part, "field", 128);
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/u.test(key) || ["constructor", "prototype", "__proto__"].includes(key)) fail("field");
      return key;
    });
    if (edit.op === "unset" && !Object.hasOwn(edit, "value")) return { op: "unset", path };
    if (edit.op !== "set" || !Object.hasOwn(edit, "value")) fail("edit");
    return { op: "set", path, value: jsonData(edit.value) };
  }) };
}
function configDescriptor(method, parameter) {
  return {
    id: `@dsmm/dsmm#dsmmConfig/${method}`,
    service: "dsmmConfig",
    namespace: "dsmmConfig",
    method,
    invocation: { kind: "direct" },
    parameters: parameter === void 0 ? [] : [{ name: "request", wire: "request", source: "json", codec: parameter }],
    result: codec("GlobalConfigSnapshot", globalSnapshot)
  };
}
function moduleStates(value) {
  if (!Array.isArray(value) || value.length !== 1) fail("modules");
  return value.map((value2) => {
    const row = object(value2, ["descriptor", "hostBundleEnabled", "desired", "startupMounted", "admitted", "nextRoot", "reason", "pending"]);
    const descriptor2 = object(row.descriptor, ["id", "label", "key"]);
    if (descriptor2.id !== "deepwork" || descriptor2.label !== "Deepwork" || descriptor2.key !== "modules.deepwork.enabled" || row.hostBundleEnabled !== "unknown") fail("module descriptor");
    const desired = object(row.desired, ["enabled", "source", "capture"]), next = object(row.nextRoot, ["admitted", "reason"]);
    if (!["defaults", "global"].includes(String(desired.source)) || !["current-global", "admission", "startup"].includes(String(desired.capture)) || ![null, "global-disabled", "restart-required"].includes(next.reason) || ![null, "global-disabled", "restart-required", "captured-off"].includes(row.reason)) fail("module state");
    return {
      descriptor: { id: "deepwork", label: "Deepwork", key: "modules.deepwork.enabled" },
      hostBundleEnabled: "unknown",
      desired: { enabled: boolean(desired.enabled, "desired.enabled"), source: desired.source, capture: desired.capture },
      startupMounted: boolean(row.startupMounted, "startupMounted"),
      admitted: row.admitted === null ? null : boolean(row.admitted, "admitted"),
      nextRoot: { admitted: boolean(next.admitted, "nextRoot.admitted"), reason: next.reason },
      reason: row.reason,
      pending: boolean(row.pending, "pending")
    };
  });
}
var TYPERT_REMOTE = {
  package: "@dsmm/dsmm",
  descriptors: [
    configDescriptor("describe"),
    configDescriptor("save", codec("GlobalConfigSaveRequest", globalSaveRequest)),
    { ...configDescriptor("describeModules"), result: codec("DsmmModuleStateArray", moduleStates) },
    {
      ...descriptor("selectMode", codec("SessionProfileSnapshot", sessionSnapshot)),
      parameters: [
        { name: "sessionId", wire: "sessionId", source: "json", codec: codec("NativeSessionId", sessionId) },
        { name: "request", wire: "request", source: "json", codec: codec("SessionModeSelectRequest", modeSelectRequest) }
      ]
    },
    descriptor("describe", codec("ProfileSnapshot", snapshot)),
    descriptor("read", codec("ProfileReadResult", readResult), { name: "id", codec: codec("ProfileId", id) }),
    descriptor("save", codec("ProfileReadResult", readResult), { name: "request", codec: codec("ProfileSaveRequest", saveRequest) }),
    descriptor("select", codec("ProfileSnapshot", snapshot), { name: "request", codec: codec("ProfileSelectRequest", selectRequest) }),
    {
      ...descriptor("describeSession", codec("SessionProfileSnapshot", sessionSnapshot)),
      parameters: [{ name: "sessionId", wire: "sessionId", source: "json", codec: codec("NativeSessionId", sessionId) }]
    },
    {
      ...descriptor("selectSession", codec("SessionProfileSnapshot", sessionSnapshot)),
      parameters: [
        { name: "sessionId", wire: "sessionId", source: "json", codec: codec("NativeSessionId", sessionId) },
        { name: "request", wire: "request", source: "json", codec: codec("SessionProfileSelectRequest", sessionSelectRequest) }
      ]
    }
  ]
};
var TYPERT_HOST = {
  package: "@dsmm/dsmm",
  face: "host",
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: TYPERT_REMOTE.descriptors
};

// ../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/scanner.js
function createScanner(text2, ignoreTrivia = false) {
  const len = text2.length;
  let pos = 0, value = "", tokenOffset = 0, token = 16, lineNumber = 0, lineStartOffset = 0, tokenLineStartOffset = 0, prevTokenLineStartOffset = 0, scanError = 0;
  function scanHexDigits(count, exact) {
    let digits = 0;
    let value2 = 0;
    while (digits < count || !exact) {
      let ch = text2.charCodeAt(pos);
      if (ch >= 48 && ch <= 57) {
        value2 = value2 * 16 + ch - 48;
      } else if (ch >= 65 && ch <= 70) {
        value2 = value2 * 16 + ch - 65 + 10;
      } else if (ch >= 97 && ch <= 102) {
        value2 = value2 * 16 + ch - 97 + 10;
      } else {
        break;
      }
      pos++;
      digits++;
    }
    if (digits < count) {
      value2 = -1;
    }
    return value2;
  }
  function setPosition(newPosition) {
    pos = newPosition;
    value = "";
    tokenOffset = 0;
    token = 16;
    scanError = 0;
  }
  function scanNumber() {
    let start = pos;
    if (text2.charCodeAt(pos) === 48) {
      pos++;
    } else {
      pos++;
      while (pos < text2.length && isDigit(text2.charCodeAt(pos))) {
        pos++;
      }
    }
    if (pos < text2.length && text2.charCodeAt(pos) === 46) {
      pos++;
      if (pos < text2.length && isDigit(text2.charCodeAt(pos))) {
        pos++;
        while (pos < text2.length && isDigit(text2.charCodeAt(pos))) {
          pos++;
        }
      } else {
        scanError = 3;
        return text2.substring(start, pos);
      }
    }
    let end = pos;
    if (pos < text2.length && (text2.charCodeAt(pos) === 69 || text2.charCodeAt(pos) === 101)) {
      pos++;
      if (pos < text2.length && text2.charCodeAt(pos) === 43 || text2.charCodeAt(pos) === 45) {
        pos++;
      }
      if (pos < text2.length && isDigit(text2.charCodeAt(pos))) {
        pos++;
        while (pos < text2.length && isDigit(text2.charCodeAt(pos))) {
          pos++;
        }
        end = pos;
      } else {
        scanError = 3;
      }
    }
    return text2.substring(start, end);
  }
  function scanString() {
    let result = "", start = pos;
    while (true) {
      if (pos >= len) {
        result += text2.substring(start, pos);
        scanError = 2;
        break;
      }
      const ch = text2.charCodeAt(pos);
      if (ch === 34) {
        result += text2.substring(start, pos);
        pos++;
        break;
      }
      if (ch === 92) {
        result += text2.substring(start, pos);
        pos++;
        if (pos >= len) {
          scanError = 2;
          break;
        }
        const ch2 = text2.charCodeAt(pos++);
        switch (ch2) {
          case 34:
            result += '"';
            break;
          case 92:
            result += "\\";
            break;
          case 47:
            result += "/";
            break;
          case 98:
            result += "\b";
            break;
          case 102:
            result += "\f";
            break;
          case 110:
            result += "\n";
            break;
          case 114:
            result += "\r";
            break;
          case 116:
            result += "	";
            break;
          case 117:
            const ch3 = scanHexDigits(4, true);
            if (ch3 >= 0) {
              result += String.fromCharCode(ch3);
            } else {
              scanError = 4;
            }
            break;
          default:
            scanError = 5;
        }
        start = pos;
        continue;
      }
      if (ch >= 0 && ch <= 31) {
        if (isLineBreak(ch)) {
          result += text2.substring(start, pos);
          scanError = 2;
          break;
        } else {
          scanError = 6;
        }
      }
      pos++;
    }
    return result;
  }
  function scanNext() {
    value = "";
    scanError = 0;
    tokenOffset = pos;
    lineStartOffset = lineNumber;
    prevTokenLineStartOffset = tokenLineStartOffset;
    if (pos >= len) {
      tokenOffset = len;
      return token = 17;
    }
    let code = text2.charCodeAt(pos);
    if (isWhiteSpace(code)) {
      do {
        pos++;
        value += String.fromCharCode(code);
        code = text2.charCodeAt(pos);
      } while (isWhiteSpace(code));
      return token = 15;
    }
    if (isLineBreak(code)) {
      pos++;
      value += String.fromCharCode(code);
      if (code === 13 && text2.charCodeAt(pos) === 10) {
        pos++;
        value += "\n";
      }
      lineNumber++;
      tokenLineStartOffset = pos;
      return token = 14;
    }
    switch (code) {
      // tokens: []{}:,
      case 123:
        pos++;
        return token = 1;
      case 125:
        pos++;
        return token = 2;
      case 91:
        pos++;
        return token = 3;
      case 93:
        pos++;
        return token = 4;
      case 58:
        pos++;
        return token = 6;
      case 44:
        pos++;
        return token = 5;
      // strings
      case 34:
        pos++;
        value = scanString();
        return token = 10;
      // comments
      case 47:
        const start = pos - 1;
        if (text2.charCodeAt(pos + 1) === 47) {
          pos += 2;
          while (pos < len) {
            if (isLineBreak(text2.charCodeAt(pos))) {
              break;
            }
            pos++;
          }
          value = text2.substring(start, pos);
          return token = 12;
        }
        if (text2.charCodeAt(pos + 1) === 42) {
          pos += 2;
          const safeLength = len - 1;
          let commentClosed = false;
          while (pos < safeLength) {
            const ch = text2.charCodeAt(pos);
            if (ch === 42 && text2.charCodeAt(pos + 1) === 47) {
              pos += 2;
              commentClosed = true;
              break;
            }
            pos++;
            if (isLineBreak(ch)) {
              if (ch === 13 && text2.charCodeAt(pos) === 10) {
                pos++;
              }
              lineNumber++;
              tokenLineStartOffset = pos;
            }
          }
          if (!commentClosed) {
            pos++;
            scanError = 1;
          }
          value = text2.substring(start, pos);
          return token = 13;
        }
        value += String.fromCharCode(code);
        pos++;
        return token = 16;
      // numbers
      case 45:
        value += String.fromCharCode(code);
        pos++;
        if (pos === len || !isDigit(text2.charCodeAt(pos))) {
          return token = 16;
        }
      // found a minus, followed by a number so
      // we fall through to proceed with scanning
      // numbers
      case 48:
      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
        value += scanNumber();
        return token = 11;
      // literals and unknown symbols
      default:
        while (pos < len && isUnknownContentCharacter(code)) {
          pos++;
          code = text2.charCodeAt(pos);
        }
        if (tokenOffset !== pos) {
          value = text2.substring(tokenOffset, pos);
          switch (value) {
            case "true":
              return token = 8;
            case "false":
              return token = 9;
            case "null":
              return token = 7;
          }
          return token = 16;
        }
        value += String.fromCharCode(code);
        pos++;
        return token = 16;
    }
  }
  function isUnknownContentCharacter(code) {
    if (isWhiteSpace(code) || isLineBreak(code)) {
      return false;
    }
    switch (code) {
      case 125:
      case 93:
      case 123:
      case 91:
      case 34:
      case 58:
      case 44:
      case 47:
        return false;
    }
    return true;
  }
  function scanNextNonTrivia() {
    let result;
    do {
      result = scanNext();
    } while (result >= 12 && result <= 15);
    return result;
  }
  return {
    setPosition,
    getPosition: () => pos,
    scan: ignoreTrivia ? scanNextNonTrivia : scanNext,
    getToken: () => token,
    getTokenValue: () => value,
    getTokenOffset: () => tokenOffset,
    getTokenLength: () => pos - tokenOffset,
    getTokenStartLine: () => lineStartOffset,
    getTokenStartCharacter: () => tokenOffset - prevTokenLineStartOffset,
    getTokenError: () => scanError
  };
}
function isWhiteSpace(ch) {
  return ch === 32 || ch === 9;
}
function isLineBreak(ch) {
  return ch === 10 || ch === 13;
}
function isDigit(ch) {
  return ch >= 48 && ch <= 57;
}
var CharacterCodes;
(function(CharacterCodes2) {
  CharacterCodes2[CharacterCodes2["lineFeed"] = 10] = "lineFeed";
  CharacterCodes2[CharacterCodes2["carriageReturn"] = 13] = "carriageReturn";
  CharacterCodes2[CharacterCodes2["space"] = 32] = "space";
  CharacterCodes2[CharacterCodes2["_0"] = 48] = "_0";
  CharacterCodes2[CharacterCodes2["_1"] = 49] = "_1";
  CharacterCodes2[CharacterCodes2["_2"] = 50] = "_2";
  CharacterCodes2[CharacterCodes2["_3"] = 51] = "_3";
  CharacterCodes2[CharacterCodes2["_4"] = 52] = "_4";
  CharacterCodes2[CharacterCodes2["_5"] = 53] = "_5";
  CharacterCodes2[CharacterCodes2["_6"] = 54] = "_6";
  CharacterCodes2[CharacterCodes2["_7"] = 55] = "_7";
  CharacterCodes2[CharacterCodes2["_8"] = 56] = "_8";
  CharacterCodes2[CharacterCodes2["_9"] = 57] = "_9";
  CharacterCodes2[CharacterCodes2["a"] = 97] = "a";
  CharacterCodes2[CharacterCodes2["b"] = 98] = "b";
  CharacterCodes2[CharacterCodes2["c"] = 99] = "c";
  CharacterCodes2[CharacterCodes2["d"] = 100] = "d";
  CharacterCodes2[CharacterCodes2["e"] = 101] = "e";
  CharacterCodes2[CharacterCodes2["f"] = 102] = "f";
  CharacterCodes2[CharacterCodes2["g"] = 103] = "g";
  CharacterCodes2[CharacterCodes2["h"] = 104] = "h";
  CharacterCodes2[CharacterCodes2["i"] = 105] = "i";
  CharacterCodes2[CharacterCodes2["j"] = 106] = "j";
  CharacterCodes2[CharacterCodes2["k"] = 107] = "k";
  CharacterCodes2[CharacterCodes2["l"] = 108] = "l";
  CharacterCodes2[CharacterCodes2["m"] = 109] = "m";
  CharacterCodes2[CharacterCodes2["n"] = 110] = "n";
  CharacterCodes2[CharacterCodes2["o"] = 111] = "o";
  CharacterCodes2[CharacterCodes2["p"] = 112] = "p";
  CharacterCodes2[CharacterCodes2["q"] = 113] = "q";
  CharacterCodes2[CharacterCodes2["r"] = 114] = "r";
  CharacterCodes2[CharacterCodes2["s"] = 115] = "s";
  CharacterCodes2[CharacterCodes2["t"] = 116] = "t";
  CharacterCodes2[CharacterCodes2["u"] = 117] = "u";
  CharacterCodes2[CharacterCodes2["v"] = 118] = "v";
  CharacterCodes2[CharacterCodes2["w"] = 119] = "w";
  CharacterCodes2[CharacterCodes2["x"] = 120] = "x";
  CharacterCodes2[CharacterCodes2["y"] = 121] = "y";
  CharacterCodes2[CharacterCodes2["z"] = 122] = "z";
  CharacterCodes2[CharacterCodes2["A"] = 65] = "A";
  CharacterCodes2[CharacterCodes2["B"] = 66] = "B";
  CharacterCodes2[CharacterCodes2["C"] = 67] = "C";
  CharacterCodes2[CharacterCodes2["D"] = 68] = "D";
  CharacterCodes2[CharacterCodes2["E"] = 69] = "E";
  CharacterCodes2[CharacterCodes2["F"] = 70] = "F";
  CharacterCodes2[CharacterCodes2["G"] = 71] = "G";
  CharacterCodes2[CharacterCodes2["H"] = 72] = "H";
  CharacterCodes2[CharacterCodes2["I"] = 73] = "I";
  CharacterCodes2[CharacterCodes2["J"] = 74] = "J";
  CharacterCodes2[CharacterCodes2["K"] = 75] = "K";
  CharacterCodes2[CharacterCodes2["L"] = 76] = "L";
  CharacterCodes2[CharacterCodes2["M"] = 77] = "M";
  CharacterCodes2[CharacterCodes2["N"] = 78] = "N";
  CharacterCodes2[CharacterCodes2["O"] = 79] = "O";
  CharacterCodes2[CharacterCodes2["P"] = 80] = "P";
  CharacterCodes2[CharacterCodes2["Q"] = 81] = "Q";
  CharacterCodes2[CharacterCodes2["R"] = 82] = "R";
  CharacterCodes2[CharacterCodes2["S"] = 83] = "S";
  CharacterCodes2[CharacterCodes2["T"] = 84] = "T";
  CharacterCodes2[CharacterCodes2["U"] = 85] = "U";
  CharacterCodes2[CharacterCodes2["V"] = 86] = "V";
  CharacterCodes2[CharacterCodes2["W"] = 87] = "W";
  CharacterCodes2[CharacterCodes2["X"] = 88] = "X";
  CharacterCodes2[CharacterCodes2["Y"] = 89] = "Y";
  CharacterCodes2[CharacterCodes2["Z"] = 90] = "Z";
  CharacterCodes2[CharacterCodes2["asterisk"] = 42] = "asterisk";
  CharacterCodes2[CharacterCodes2["backslash"] = 92] = "backslash";
  CharacterCodes2[CharacterCodes2["closeBrace"] = 125] = "closeBrace";
  CharacterCodes2[CharacterCodes2["closeBracket"] = 93] = "closeBracket";
  CharacterCodes2[CharacterCodes2["colon"] = 58] = "colon";
  CharacterCodes2[CharacterCodes2["comma"] = 44] = "comma";
  CharacterCodes2[CharacterCodes2["dot"] = 46] = "dot";
  CharacterCodes2[CharacterCodes2["doubleQuote"] = 34] = "doubleQuote";
  CharacterCodes2[CharacterCodes2["minus"] = 45] = "minus";
  CharacterCodes2[CharacterCodes2["openBrace"] = 123] = "openBrace";
  CharacterCodes2[CharacterCodes2["openBracket"] = 91] = "openBracket";
  CharacterCodes2[CharacterCodes2["plus"] = 43] = "plus";
  CharacterCodes2[CharacterCodes2["slash"] = 47] = "slash";
  CharacterCodes2[CharacterCodes2["formFeed"] = 12] = "formFeed";
  CharacterCodes2[CharacterCodes2["tab"] = 9] = "tab";
})(CharacterCodes || (CharacterCodes = {}));

// ../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/string-intern.js
var cachedSpaces = new Array(20).fill(0).map((_, index) => {
  return " ".repeat(index);
});
var maxCachedValues = 200;
var cachedBreakLinesWithSpaces = {
  " ": {
    "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\n" + " ".repeat(index);
    }),
    "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r" + " ".repeat(index);
    }),
    "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r\n" + " ".repeat(index);
    })
  },
  "	": {
    "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\n" + "	".repeat(index);
    }),
    "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r" + "	".repeat(index);
    }),
    "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r\n" + "	".repeat(index);
    })
  }
};
var supportedEols = ["\n", "\r", "\r\n"];

// ../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/format.js
function format(documentText, range, options) {
  let initialIndentLevel;
  let formatText;
  let formatTextStart;
  let rangeStart;
  let rangeEnd;
  if (range) {
    rangeStart = range.offset;
    rangeEnd = rangeStart + range.length;
    formatTextStart = rangeStart;
    while (formatTextStart > 0 && !isEOL(documentText, formatTextStart - 1)) {
      formatTextStart--;
    }
    let endOffset = rangeEnd;
    while (endOffset < documentText.length && !isEOL(documentText, endOffset)) {
      endOffset++;
    }
    formatText = documentText.substring(formatTextStart, endOffset);
    initialIndentLevel = computeIndentLevel(formatText, options);
  } else {
    formatText = documentText;
    initialIndentLevel = 0;
    formatTextStart = 0;
    rangeStart = 0;
    rangeEnd = documentText.length;
  }
  const eol = getEOL(options, documentText);
  const eolFastPathSupported = supportedEols.includes(eol);
  let numberLineBreaks = 0;
  let indentLevel = 0;
  let indentValue;
  if (options.insertSpaces) {
    indentValue = cachedSpaces[options.tabSize || 4] ?? repeat(cachedSpaces[1], options.tabSize || 4);
  } else {
    indentValue = "	";
  }
  const indentType = indentValue === "	" ? "	" : " ";
  let scanner = createScanner(formatText, false);
  let hasError = false;
  function newLinesAndIndent() {
    if (numberLineBreaks > 1) {
      return repeat(eol, numberLineBreaks) + repeat(indentValue, initialIndentLevel + indentLevel);
    }
    const amountOfSpaces = indentValue.length * (initialIndentLevel + indentLevel);
    if (!eolFastPathSupported || amountOfSpaces > cachedBreakLinesWithSpaces[indentType][eol].length) {
      return eol + repeat(indentValue, initialIndentLevel + indentLevel);
    }
    if (amountOfSpaces <= 0) {
      return eol;
    }
    return cachedBreakLinesWithSpaces[indentType][eol][amountOfSpaces];
  }
  function scanNext() {
    let token = scanner.scan();
    numberLineBreaks = 0;
    while (token === 15 || token === 14) {
      if (token === 14 && options.keepLines) {
        numberLineBreaks += 1;
      } else if (token === 14) {
        numberLineBreaks = 1;
      }
      token = scanner.scan();
    }
    hasError = token === 16 || scanner.getTokenError() !== 0;
    return token;
  }
  const editOperations = [];
  function addEdit(text2, startOffset, endOffset) {
    if (!hasError && (!range || startOffset < rangeEnd && endOffset > rangeStart) && documentText.substring(startOffset, endOffset) !== text2) {
      editOperations.push({ offset: startOffset, length: endOffset - startOffset, content: text2 });
    }
  }
  let firstToken = scanNext();
  if (options.keepLines && numberLineBreaks > 0) {
    addEdit(repeat(eol, numberLineBreaks), 0, 0);
  }
  if (firstToken !== 17) {
    let firstTokenStart = scanner.getTokenOffset() + formatTextStart;
    let initialIndent = indentValue.length * initialIndentLevel < 20 && options.insertSpaces ? cachedSpaces[indentValue.length * initialIndentLevel] : repeat(indentValue, initialIndentLevel);
    addEdit(initialIndent, formatTextStart, firstTokenStart);
  }
  while (firstToken !== 17) {
    let firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + formatTextStart;
    let secondToken = scanNext();
    let replaceContent = "";
    let needsLineBreak = false;
    while (numberLineBreaks === 0 && (secondToken === 12 || secondToken === 13)) {
      let commentTokenStart = scanner.getTokenOffset() + formatTextStart;
      addEdit(cachedSpaces[1], firstTokenEnd, commentTokenStart);
      firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + formatTextStart;
      needsLineBreak = secondToken === 12;
      replaceContent = needsLineBreak ? newLinesAndIndent() : "";
      secondToken = scanNext();
    }
    if (secondToken === 2) {
      if (firstToken !== 1) {
        indentLevel--;
      }
      ;
      if (options.keepLines && numberLineBreaks > 0 || !options.keepLines && firstToken !== 1) {
        replaceContent = newLinesAndIndent();
      } else if (options.keepLines) {
        replaceContent = cachedSpaces[1];
      }
    } else if (secondToken === 4) {
      if (firstToken !== 3) {
        indentLevel--;
      }
      ;
      if (options.keepLines && numberLineBreaks > 0 || !options.keepLines && firstToken !== 3) {
        replaceContent = newLinesAndIndent();
      } else if (options.keepLines) {
        replaceContent = cachedSpaces[1];
      }
    } else {
      switch (firstToken) {
        case 3:
        case 1:
          indentLevel++;
          if (options.keepLines && numberLineBreaks > 0 || !options.keepLines) {
            replaceContent = newLinesAndIndent();
          } else {
            replaceContent = cachedSpaces[1];
          }
          break;
        case 5:
          if (options.keepLines && numberLineBreaks > 0 || !options.keepLines) {
            replaceContent = newLinesAndIndent();
          } else {
            replaceContent = cachedSpaces[1];
          }
          break;
        case 12:
          replaceContent = newLinesAndIndent();
          break;
        case 13:
          if (numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else if (!needsLineBreak) {
            replaceContent = cachedSpaces[1];
          }
          break;
        case 6:
          if (options.keepLines && numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else if (!needsLineBreak) {
            replaceContent = cachedSpaces[1];
          }
          break;
        case 10:
          if (options.keepLines && numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else if (secondToken === 6 && !needsLineBreak) {
            replaceContent = "";
          }
          break;
        case 7:
        case 8:
        case 9:
        case 11:
        case 2:
        case 4:
          if (options.keepLines && numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else {
            if ((secondToken === 12 || secondToken === 13) && !needsLineBreak) {
              replaceContent = cachedSpaces[1];
            } else if (secondToken !== 5 && secondToken !== 17) {
              hasError = true;
            }
          }
          break;
        case 16:
          hasError = true;
          break;
      }
      if (numberLineBreaks > 0 && (secondToken === 12 || secondToken === 13)) {
        replaceContent = newLinesAndIndent();
      }
    }
    if (secondToken === 17) {
      if (options.keepLines && numberLineBreaks > 0) {
        replaceContent = newLinesAndIndent();
      } else {
        replaceContent = options.insertFinalNewline ? eol : "";
      }
    }
    const secondTokenStart = scanner.getTokenOffset() + formatTextStart;
    addEdit(replaceContent, firstTokenEnd, secondTokenStart);
    firstToken = secondToken;
  }
  return editOperations;
}
function repeat(s, count) {
  let result = "";
  for (let i = 0; i < count; i++) {
    result += s;
  }
  return result;
}
function computeIndentLevel(content2, options) {
  let i = 0;
  let nChars = 0;
  const tabSize = options.tabSize || 4;
  while (i < content2.length) {
    let ch = content2.charAt(i);
    if (ch === cachedSpaces[1]) {
      nChars++;
    } else if (ch === "	") {
      nChars += tabSize;
    } else {
      break;
    }
    i++;
  }
  return Math.floor(nChars / tabSize);
}
function getEOL(options, text2) {
  for (let i = 0; i < text2.length; i++) {
    const ch = text2.charAt(i);
    if (ch === "\r") {
      if (i + 1 < text2.length && text2.charAt(i + 1) === "\n") {
        return "\r\n";
      }
      return "\r";
    } else if (ch === "\n") {
      return "\n";
    }
  }
  return options && options.eol || "\n";
}
function isEOL(text2, offset) {
  return "\r\n".indexOf(text2.charAt(offset)) !== -1;
}

// ../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/parser.js
var ParseOptions;
(function(ParseOptions2) {
  ParseOptions2.DEFAULT = {
    allowTrailingComma: false
  };
})(ParseOptions || (ParseOptions = {}));
function parse(text2, errors = [], options = ParseOptions.DEFAULT) {
  let currentProperty = null;
  let currentParent = [];
  const previousParents = [];
  function onValue(value) {
    if (Array.isArray(currentParent)) {
      currentParent.push(value);
    } else if (currentProperty !== null) {
      currentParent[currentProperty] = value;
    }
  }
  const visitor = {
    onObjectBegin: () => {
      const object2 = {};
      onValue(object2);
      previousParents.push(currentParent);
      currentParent = object2;
      currentProperty = null;
    },
    onObjectProperty: (name) => {
      currentProperty = name;
    },
    onObjectEnd: () => {
      currentParent = previousParents.pop();
    },
    onArrayBegin: () => {
      const array = [];
      onValue(array);
      previousParents.push(currentParent);
      currentParent = array;
      currentProperty = null;
    },
    onArrayEnd: () => {
      currentParent = previousParents.pop();
    },
    onLiteralValue: onValue,
    onError: (error, offset, length) => {
      errors.push({ error, offset, length });
    }
  };
  visit(text2, visitor, options);
  return currentParent[0];
}
function parseTree(text2, errors = [], options = ParseOptions.DEFAULT) {
  let currentParent = { type: "array", offset: -1, length: -1, children: [], parent: void 0 };
  function ensurePropertyComplete(endOffset) {
    if (currentParent.type === "property") {
      currentParent.length = endOffset - currentParent.offset;
      currentParent = currentParent.parent;
    }
  }
  function onValue(valueNode) {
    currentParent.children.push(valueNode);
    return valueNode;
  }
  const visitor = {
    onObjectBegin: (offset) => {
      currentParent = onValue({ type: "object", offset, length: -1, parent: currentParent, children: [] });
    },
    onObjectProperty: (name, offset, length) => {
      currentParent = onValue({ type: "property", offset, length: -1, parent: currentParent, children: [] });
      currentParent.children.push({ type: "string", value: name, offset, length, parent: currentParent });
    },
    onObjectEnd: (offset, length) => {
      ensurePropertyComplete(offset + length);
      currentParent.length = offset + length - currentParent.offset;
      currentParent = currentParent.parent;
      ensurePropertyComplete(offset + length);
    },
    onArrayBegin: (offset, length) => {
      currentParent = onValue({ type: "array", offset, length: -1, parent: currentParent, children: [] });
    },
    onArrayEnd: (offset, length) => {
      currentParent.length = offset + length - currentParent.offset;
      currentParent = currentParent.parent;
      ensurePropertyComplete(offset + length);
    },
    onLiteralValue: (value, offset, length) => {
      onValue({ type: getNodeType(value), offset, length, parent: currentParent, value });
      ensurePropertyComplete(offset + length);
    },
    onSeparator: (sep, offset, length) => {
      if (currentParent.type === "property") {
        if (sep === ":") {
          currentParent.colonOffset = offset;
        } else if (sep === ",") {
          ensurePropertyComplete(offset);
        }
      }
    },
    onError: (error, offset, length) => {
      errors.push({ error, offset, length });
    }
  };
  visit(text2, visitor, options);
  const result = currentParent.children[0];
  if (result) {
    delete result.parent;
  }
  return result;
}
function findNodeAtLocation(root, path) {
  if (!root) {
    return void 0;
  }
  let node = root;
  for (let segment of path) {
    if (typeof segment === "string") {
      if (node.type !== "object" || !Array.isArray(node.children)) {
        return void 0;
      }
      let found = false;
      for (const propertyNode of node.children) {
        if (Array.isArray(propertyNode.children) && propertyNode.children[0].value === segment && propertyNode.children.length === 2) {
          node = propertyNode.children[1];
          found = true;
          break;
        }
      }
      if (!found) {
        return void 0;
      }
    } else {
      const index = segment;
      if (node.type !== "array" || index < 0 || !Array.isArray(node.children) || index >= node.children.length) {
        return void 0;
      }
      node = node.children[index];
    }
  }
  return node;
}
function visit(text2, visitor, options = ParseOptions.DEFAULT) {
  const _scanner = createScanner(text2, false);
  const _jsonPath = [];
  let suppressedCallbacks = 0;
  function toNoArgVisit(visitFunction) {
    return visitFunction ? () => suppressedCallbacks === 0 && visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter()) : () => true;
  }
  function toOneArgVisit(visitFunction) {
    return visitFunction ? (arg) => suppressedCallbacks === 0 && visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter()) : () => true;
  }
  function toOneArgVisitWithPath(visitFunction) {
    return visitFunction ? (arg) => suppressedCallbacks === 0 && visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter(), () => _jsonPath.slice()) : () => true;
  }
  function toBeginVisit(visitFunction) {
    return visitFunction ? () => {
      if (suppressedCallbacks > 0) {
        suppressedCallbacks++;
      } else {
        let cbReturn = visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter(), () => _jsonPath.slice());
        if (cbReturn === false) {
          suppressedCallbacks = 1;
        }
      }
    } : () => true;
  }
  function toEndVisit(visitFunction) {
    return visitFunction ? () => {
      if (suppressedCallbacks > 0) {
        suppressedCallbacks--;
      }
      if (suppressedCallbacks === 0) {
        visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter());
      }
    } : () => true;
  }
  const onObjectBegin = toBeginVisit(visitor.onObjectBegin), onObjectProperty = toOneArgVisitWithPath(visitor.onObjectProperty), onObjectEnd = toEndVisit(visitor.onObjectEnd), onArrayBegin = toBeginVisit(visitor.onArrayBegin), onArrayEnd = toEndVisit(visitor.onArrayEnd), onLiteralValue = toOneArgVisitWithPath(visitor.onLiteralValue), onSeparator = toOneArgVisit(visitor.onSeparator), onComment = toNoArgVisit(visitor.onComment), onError = toOneArgVisit(visitor.onError);
  const disallowComments = options && options.disallowComments;
  const allowTrailingComma = options && options.allowTrailingComma;
  function scanNext() {
    while (true) {
      const token = _scanner.scan();
      switch (_scanner.getTokenError()) {
        case 4:
          handleError(
            14
            /* ParseErrorCode.InvalidUnicode */
          );
          break;
        case 5:
          handleError(
            15
            /* ParseErrorCode.InvalidEscapeCharacter */
          );
          break;
        case 3:
          handleError(
            13
            /* ParseErrorCode.UnexpectedEndOfNumber */
          );
          break;
        case 1:
          if (!disallowComments) {
            handleError(
              11
              /* ParseErrorCode.UnexpectedEndOfComment */
            );
          }
          break;
        case 2:
          handleError(
            12
            /* ParseErrorCode.UnexpectedEndOfString */
          );
          break;
        case 6:
          handleError(
            16
            /* ParseErrorCode.InvalidCharacter */
          );
          break;
      }
      switch (token) {
        case 12:
        case 13:
          if (disallowComments) {
            handleError(
              10
              /* ParseErrorCode.InvalidCommentToken */
            );
          } else {
            onComment();
          }
          break;
        case 16:
          handleError(
            1
            /* ParseErrorCode.InvalidSymbol */
          );
          break;
        case 15:
        case 14:
          break;
        default:
          return token;
      }
    }
  }
  function handleError(error, skipUntilAfter = [], skipUntil = []) {
    onError(error);
    if (skipUntilAfter.length + skipUntil.length > 0) {
      let token = _scanner.getToken();
      while (token !== 17) {
        if (skipUntilAfter.indexOf(token) !== -1) {
          scanNext();
          break;
        } else if (skipUntil.indexOf(token) !== -1) {
          break;
        }
        token = scanNext();
      }
    }
  }
  function parseString(isValue) {
    const value = _scanner.getTokenValue();
    if (isValue) {
      onLiteralValue(value);
    } else {
      onObjectProperty(value);
      _jsonPath.push(value);
    }
    scanNext();
    return true;
  }
  function parseLiteral() {
    switch (_scanner.getToken()) {
      case 11:
        const tokenValue = _scanner.getTokenValue();
        let value = Number(tokenValue);
        if (isNaN(value)) {
          handleError(
            2
            /* ParseErrorCode.InvalidNumberFormat */
          );
          value = 0;
        }
        onLiteralValue(value);
        break;
      case 7:
        onLiteralValue(null);
        break;
      case 8:
        onLiteralValue(true);
        break;
      case 9:
        onLiteralValue(false);
        break;
      default:
        return false;
    }
    scanNext();
    return true;
  }
  function parseProperty() {
    if (_scanner.getToken() !== 10) {
      handleError(3, [], [
        2,
        5
        /* SyntaxKind.CommaToken */
      ]);
      return false;
    }
    parseString(false);
    if (_scanner.getToken() === 6) {
      onSeparator(":");
      scanNext();
      if (!parseValue()) {
        handleError(4, [], [
          2,
          5
          /* SyntaxKind.CommaToken */
        ]);
      }
    } else {
      handleError(5, [], [
        2,
        5
        /* SyntaxKind.CommaToken */
      ]);
    }
    _jsonPath.pop();
    return true;
  }
  function parseObject() {
    onObjectBegin();
    scanNext();
    let needsComma = false;
    while (_scanner.getToken() !== 2 && _scanner.getToken() !== 17) {
      if (_scanner.getToken() === 5) {
        if (!needsComma) {
          handleError(4, [], []);
        }
        onSeparator(",");
        scanNext();
        if (_scanner.getToken() === 2 && allowTrailingComma) {
          break;
        }
      } else if (needsComma) {
        handleError(6, [], []);
      }
      if (!parseProperty()) {
        handleError(4, [], [
          2,
          5
          /* SyntaxKind.CommaToken */
        ]);
      }
      needsComma = true;
    }
    onObjectEnd();
    if (_scanner.getToken() !== 2) {
      handleError(7, [
        2
        /* SyntaxKind.CloseBraceToken */
      ], []);
    } else {
      scanNext();
    }
    return true;
  }
  function parseArray() {
    onArrayBegin();
    scanNext();
    let isFirstElement = true;
    let needsComma = false;
    while (_scanner.getToken() !== 4 && _scanner.getToken() !== 17) {
      if (_scanner.getToken() === 5) {
        if (!needsComma) {
          handleError(4, [], []);
        }
        onSeparator(",");
        scanNext();
        if (_scanner.getToken() === 4 && allowTrailingComma) {
          break;
        }
      } else if (needsComma) {
        handleError(6, [], []);
      }
      if (isFirstElement) {
        _jsonPath.push(0);
        isFirstElement = false;
      } else {
        _jsonPath[_jsonPath.length - 1]++;
      }
      if (!parseValue()) {
        handleError(4, [], [
          4,
          5
          /* SyntaxKind.CommaToken */
        ]);
      }
      needsComma = true;
    }
    onArrayEnd();
    if (!isFirstElement) {
      _jsonPath.pop();
    }
    if (_scanner.getToken() !== 4) {
      handleError(8, [
        4
        /* SyntaxKind.CloseBracketToken */
      ], []);
    } else {
      scanNext();
    }
    return true;
  }
  function parseValue() {
    switch (_scanner.getToken()) {
      case 3:
        return parseArray();
      case 1:
        return parseObject();
      case 10:
        return parseString(true);
      default:
        return parseLiteral();
    }
  }
  scanNext();
  if (_scanner.getToken() === 17) {
    if (options.allowEmptyContent) {
      return true;
    }
    handleError(4, [], []);
    return false;
  }
  if (!parseValue()) {
    handleError(4, [], []);
    return false;
  }
  if (_scanner.getToken() !== 17) {
    handleError(9, [], []);
  }
  return true;
}
function getNodeType(value) {
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "string":
      return "string";
    case "object": {
      if (!value) {
        return "null";
      } else if (Array.isArray(value)) {
        return "array";
      }
      return "object";
    }
    default:
      return "null";
  }
}

// ../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/edit.js
function setProperty(text2, originalPath, value, options) {
  const path = originalPath.slice();
  const errors = [];
  const root = parseTree(text2, errors);
  let parent = void 0;
  let lastSegment = void 0;
  while (path.length > 0) {
    lastSegment = path.pop();
    parent = findNodeAtLocation(root, path);
    if (parent === void 0 && value !== void 0) {
      if (typeof lastSegment === "string") {
        value = { [lastSegment]: value };
      } else {
        value = [value];
      }
    } else {
      break;
    }
  }
  if (!parent) {
    if (value === void 0) {
      throw new Error("Can not delete in empty document");
    }
    return withFormatting(text2, { offset: root ? root.offset : 0, length: root ? root.length : 0, content: JSON.stringify(value) }, options);
  } else if (parent.type === "object" && typeof lastSegment === "string" && Array.isArray(parent.children)) {
    const existing = findNodeAtLocation(parent, [lastSegment]);
    if (existing !== void 0) {
      if (value === void 0) {
        if (!existing.parent) {
          throw new Error("Malformed AST");
        }
        const propertyIndex = parent.children.indexOf(existing.parent);
        let removeBegin;
        let removeEnd = existing.parent.offset + existing.parent.length;
        if (propertyIndex > 0) {
          let previous = parent.children[propertyIndex - 1];
          removeBegin = previous.offset + previous.length;
        } else {
          removeBegin = parent.offset + 1;
          if (parent.children.length > 1) {
            let next = parent.children[1];
            removeEnd = next.offset;
          }
        }
        return withFormatting(text2, { offset: removeBegin, length: removeEnd - removeBegin, content: "" }, options);
      } else {
        return withFormatting(text2, { offset: existing.offset, length: existing.length, content: JSON.stringify(value) }, options);
      }
    } else {
      if (value === void 0) {
        return [];
      }
      const newProperty = `${JSON.stringify(lastSegment)}: ${JSON.stringify(value)}`;
      const index = options.getInsertionIndex ? options.getInsertionIndex(parent.children.map((p) => p.children[0].value)) : parent.children.length;
      let edit;
      if (index > 0) {
        let previous = parent.children[index - 1];
        edit = { offset: previous.offset + previous.length, length: 0, content: "," + newProperty };
      } else if (parent.children.length === 0) {
        edit = { offset: parent.offset + 1, length: 0, content: newProperty };
      } else {
        edit = { offset: parent.offset + 1, length: 0, content: newProperty + "," };
      }
      return withFormatting(text2, edit, options);
    }
  } else if (parent.type === "array" && typeof lastSegment === "number" && Array.isArray(parent.children)) {
    const insertIndex = lastSegment;
    if (insertIndex === -1) {
      const newProperty = `${JSON.stringify(value)}`;
      let edit;
      if (parent.children.length === 0) {
        edit = { offset: parent.offset + 1, length: 0, content: newProperty };
      } else {
        const previous = parent.children[parent.children.length - 1];
        edit = { offset: previous.offset + previous.length, length: 0, content: "," + newProperty };
      }
      return withFormatting(text2, edit, options);
    } else if (value === void 0 && parent.children.length >= 0) {
      const removalIndex = lastSegment;
      const toRemove = parent.children[removalIndex];
      let edit;
      if (parent.children.length === 1) {
        edit = { offset: parent.offset + 1, length: parent.length - 2, content: "" };
      } else if (parent.children.length - 1 === removalIndex) {
        let previous = parent.children[removalIndex - 1];
        let offset = previous.offset + previous.length;
        let parentEndOffset = parent.offset + parent.length;
        edit = { offset, length: parentEndOffset - 2 - offset, content: "" };
      } else {
        edit = { offset: toRemove.offset, length: parent.children[removalIndex + 1].offset - toRemove.offset, content: "" };
      }
      return withFormatting(text2, edit, options);
    } else if (value !== void 0) {
      let edit;
      const newProperty = `${JSON.stringify(value)}`;
      if (!options.isArrayInsertion && parent.children.length > lastSegment) {
        const toModify = parent.children[lastSegment];
        edit = { offset: toModify.offset, length: toModify.length, content: newProperty };
      } else if (parent.children.length === 0 || lastSegment === 0) {
        edit = { offset: parent.offset + 1, length: 0, content: parent.children.length === 0 ? newProperty : newProperty + "," };
      } else {
        const index = lastSegment > parent.children.length ? parent.children.length : lastSegment;
        const previous = parent.children[index - 1];
        edit = { offset: previous.offset + previous.length, length: 0, content: "," + newProperty };
      }
      return withFormatting(text2, edit, options);
    } else {
      throw new Error(`Can not ${value === void 0 ? "remove" : options.isArrayInsertion ? "insert" : "modify"} Array index ${insertIndex} as length is not sufficient`);
    }
  } else {
    throw new Error(`Can not add ${typeof lastSegment !== "number" ? "index" : "property"} to parent of type ${parent.type}`);
  }
}
function withFormatting(text2, edit, options) {
  if (!options.formattingOptions) {
    return [edit];
  }
  let newText = applyEdit(text2, edit);
  let begin = edit.offset;
  let end = edit.offset + edit.content.length;
  if (edit.length === 0 || edit.content.length === 0) {
    while (begin > 0 && !isEOL(newText, begin - 1)) {
      begin--;
    }
    while (end < newText.length && !isEOL(newText, end)) {
      end++;
    }
  }
  const edits = format(newText, { offset: begin, length: end - begin }, { ...options.formattingOptions, keepLines: false });
  for (let i = edits.length - 1; i >= 0; i--) {
    const edit2 = edits[i];
    newText = applyEdit(newText, edit2);
    begin = Math.min(begin, edit2.offset);
    end = Math.max(end, edit2.offset + edit2.length);
    end += edit2.content.length - edit2.length;
  }
  const editLength = text2.length - (newText.length - end) - begin;
  return [{ offset: begin, length: editLength, content: newText.substring(begin, end) }];
}
function applyEdit(text2, edit) {
  return text2.substring(0, edit.offset) + edit.content + text2.substring(edit.offset + edit.length);
}

// ../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/main.js
var ScanError;
(function(ScanError2) {
  ScanError2[ScanError2["None"] = 0] = "None";
  ScanError2[ScanError2["UnexpectedEndOfComment"] = 1] = "UnexpectedEndOfComment";
  ScanError2[ScanError2["UnexpectedEndOfString"] = 2] = "UnexpectedEndOfString";
  ScanError2[ScanError2["UnexpectedEndOfNumber"] = 3] = "UnexpectedEndOfNumber";
  ScanError2[ScanError2["InvalidUnicode"] = 4] = "InvalidUnicode";
  ScanError2[ScanError2["InvalidEscapeCharacter"] = 5] = "InvalidEscapeCharacter";
  ScanError2[ScanError2["InvalidCharacter"] = 6] = "InvalidCharacter";
})(ScanError || (ScanError = {}));
var SyntaxKind;
(function(SyntaxKind2) {
  SyntaxKind2[SyntaxKind2["OpenBraceToken"] = 1] = "OpenBraceToken";
  SyntaxKind2[SyntaxKind2["CloseBraceToken"] = 2] = "CloseBraceToken";
  SyntaxKind2[SyntaxKind2["OpenBracketToken"] = 3] = "OpenBracketToken";
  SyntaxKind2[SyntaxKind2["CloseBracketToken"] = 4] = "CloseBracketToken";
  SyntaxKind2[SyntaxKind2["CommaToken"] = 5] = "CommaToken";
  SyntaxKind2[SyntaxKind2["ColonToken"] = 6] = "ColonToken";
  SyntaxKind2[SyntaxKind2["NullKeyword"] = 7] = "NullKeyword";
  SyntaxKind2[SyntaxKind2["TrueKeyword"] = 8] = "TrueKeyword";
  SyntaxKind2[SyntaxKind2["FalseKeyword"] = 9] = "FalseKeyword";
  SyntaxKind2[SyntaxKind2["StringLiteral"] = 10] = "StringLiteral";
  SyntaxKind2[SyntaxKind2["NumericLiteral"] = 11] = "NumericLiteral";
  SyntaxKind2[SyntaxKind2["LineCommentTrivia"] = 12] = "LineCommentTrivia";
  SyntaxKind2[SyntaxKind2["BlockCommentTrivia"] = 13] = "BlockCommentTrivia";
  SyntaxKind2[SyntaxKind2["LineBreakTrivia"] = 14] = "LineBreakTrivia";
  SyntaxKind2[SyntaxKind2["Trivia"] = 15] = "Trivia";
  SyntaxKind2[SyntaxKind2["Unknown"] = 16] = "Unknown";
  SyntaxKind2[SyntaxKind2["EOF"] = 17] = "EOF";
})(SyntaxKind || (SyntaxKind = {}));
var parse2 = parse;
var parseTree2 = parseTree;
var findNodeAtLocation2 = findNodeAtLocation;
var ParseErrorCode;
(function(ParseErrorCode2) {
  ParseErrorCode2[ParseErrorCode2["InvalidSymbol"] = 1] = "InvalidSymbol";
  ParseErrorCode2[ParseErrorCode2["InvalidNumberFormat"] = 2] = "InvalidNumberFormat";
  ParseErrorCode2[ParseErrorCode2["PropertyNameExpected"] = 3] = "PropertyNameExpected";
  ParseErrorCode2[ParseErrorCode2["ValueExpected"] = 4] = "ValueExpected";
  ParseErrorCode2[ParseErrorCode2["ColonExpected"] = 5] = "ColonExpected";
  ParseErrorCode2[ParseErrorCode2["CommaExpected"] = 6] = "CommaExpected";
  ParseErrorCode2[ParseErrorCode2["CloseBraceExpected"] = 7] = "CloseBraceExpected";
  ParseErrorCode2[ParseErrorCode2["CloseBracketExpected"] = 8] = "CloseBracketExpected";
  ParseErrorCode2[ParseErrorCode2["EndOfFileExpected"] = 9] = "EndOfFileExpected";
  ParseErrorCode2[ParseErrorCode2["InvalidCommentToken"] = 10] = "InvalidCommentToken";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfComment"] = 11] = "UnexpectedEndOfComment";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfString"] = 12] = "UnexpectedEndOfString";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfNumber"] = 13] = "UnexpectedEndOfNumber";
  ParseErrorCode2[ParseErrorCode2["InvalidUnicode"] = 14] = "InvalidUnicode";
  ParseErrorCode2[ParseErrorCode2["InvalidEscapeCharacter"] = 15] = "InvalidEscapeCharacter";
  ParseErrorCode2[ParseErrorCode2["InvalidCharacter"] = 16] = "InvalidCharacter";
})(ParseErrorCode || (ParseErrorCode = {}));
function modify(text2, path, value, options) {
  return setProperty(text2, path, value, options);
}
function applyEdits(text2, edits) {
  let sortedEdits = edits.slice(0).sort((a, b) => {
    const diff = a.offset - b.offset;
    if (diff === 0) {
      return a.length - b.length;
    }
    return diff;
  });
  let lastModifiedOffset = text2.length;
  for (let i = sortedEdits.length - 1; i >= 0; i--) {
    let e = sortedEdits[i];
    if (e.offset + e.length <= lastModifiedOffset) {
      text2 = applyEdit(text2, e);
    } else {
      throw new Error("Overlapping edit");
    }
    lastModifiedOffset = e.offset;
  }
  return text2;
}

// src/client/structured.ts
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function route(value) {
  return record(value) && typeof value.provider === "string" && typeof value.model === "string" && (value.reasoningEffort === void 0 || typeof value.reasoningEffort === "string") && Object.keys(value).every((key) => ["provider", "model", "reasoningEffort"].includes(key));
}
function validTree(node, depth = 0) {
  if (depth > 32) return false;
  if (node.type === "object") {
    const seen = /* @__PURE__ */ new Set();
    for (const property of node.children ?? []) {
      const key = property.children?.[0]?.value;
      if (typeof key !== "string" || seen.has(key) || ["__proto__", "prototype", "constructor"].includes(key)) return false;
      seen.add(key);
    }
  }
  return (node.children ?? []).every((child) => validTree(child, depth + 1));
}
function structuredDocument(content2) {
  const errors = [];
  const tree = parseTree2(content2, errors, { allowTrailingComma: true });
  if (errors.length !== 0 || tree === void 0 || !validTree(tree)) return null;
  const document2 = parse2(content2, errors, { allowTrailingComma: true });
  if (errors.length !== 0 || !record(document2) || document2.version !== 1 || typeof document2.id !== "string" || !record(document2.settings) || document2.label !== void 0 && typeof document2.label !== "string") return null;
  const settings = document2.settings;
  if (settings.defaultActive !== void 0 && typeof settings.defaultActive !== "boolean") return null;
  if (settings.roleRouting !== void 0 && !record(settings.roleRouting)) return null;
  if (settings.runtimePolicy !== void 0 && !record(settings.runtimePolicy)) return null;
  const runtimePolicy2 = settings.runtimePolicy ?? {};
  const policies = settings.roleRouting ?? {};
  try {
    if (Object.keys(runtimePolicy2).some((key) => key !== "strategy" && key !== "rateLimit")) return null;
    if (runtimePolicy2.strategy !== void 0) normalizeRoutingStrategy(runtimePolicy2.strategy);
    if (runtimePolicy2.rateLimit !== void 0) normalizeRateLimitOverrides(runtimePolicy2.rateLimit);
    for (const raw of Object.values(policies)) {
      if (!record(raw) || Object.keys(raw).some((key) => !["primary", "fallbackRoutes", "strategy", "rateLimit"].includes(key))) return null;
      if (raw.primary !== void 0 && !route(raw.primary)) return null;
      if (raw.fallbackRoutes !== void 0 && (!Array.isArray(raw.fallbackRoutes) || raw.fallbackRoutes.length > 32 || !raw.fallbackRoutes.every(route))) return null;
      if (raw.strategy !== void 0) normalizeRoutingStrategy(raw.strategy);
      if (raw.rateLimit !== void 0) normalizeRateLimitOverrides(raw.rateLimit);
    }
  } catch {
    return null;
  }
  return { label: document2.label, settings, roleRouting: policies, runtimePolicy: runtimePolicy2 };
}
function editStructuredPath(content2, path, value) {
  if (structuredDocument(content2) === null) return null;
  try {
    return applyEdits(content2, modify(content2, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
  } catch {
    return null;
  }
}
function moveFallback(content2, role2, from, to) {
  const document2 = structuredDocument(content2);
  const chain = document2?.roleRouting[role2]?.fallbackRoutes;
  if (chain === void 0 || from < 0 || from >= chain.length || to < 0 || to >= chain.length) return null;
  const low = Math.min(from, to), high = Math.max(from, to);
  const tree = parseTree2(content2);
  if (tree === void 0) return null;
  const nodes = chain.map((_, index) => findNodeAtLocation2(tree, ["settings", "roleRouting", role2, "fallbackRoutes", index]));
  if (nodes.some((node) => node === void 0)) return null;
  const order = nodes.map((node) => content2.slice(node.offset, node.offset + node.length));
  order.splice(to, 0, order.splice(from, 1)[0]);
  return applyEdits(content2, nodes.slice(low, high + 1).map((node, offset) => ({ offset: node.offset, length: node.length, content: order[low + offset] })));
}

// src/client/controller.ts
function modelSelectionWatermark(window) {
  let watermark = -1;
  for (const entry of window.entries) if (entry.type === "event" && entry.event.type === "model/selection") watermark = Math.max(watermark, Number(entry.event.seq));
  return watermark;
}
function modeIntentWatermark(window) {
  let watermark = -1;
  for (const entry of window.entries) if (entry.type === "event" && (entry.event.type === "deepwork/mode" || entry.event.type === "agent-preset/selected")) watermark = Math.max(watermark, Number(entry.event.seq));
  return watermark;
}
var NEW_EDITOR = "";
var NEW_PROFILE_CONTENT = '{\n  "version": 1,\n  "id": "new-profile",\n  "label": "New profile",\n  "settings": {\n    // Runtime overlay only. Omitted fields inherit the deployment baseline.\n    "defaultActive": true\n  }\n}\n';
function canReconcileSelection(snapshot2) {
  return snapshot2 !== null && (snapshot2.selectionRevision === "absent" || /^[a-f0-9]{64}$/u.test(snapshot2.selectionRevision)) && (snapshot2.selectionError === void 0 || snapshot2.selectionError.code === "conflict");
}
var ProfilesController = class {
  constructor(remote) {
    this.remote = remote;
  }
  current = {
    snapshot: null,
    editor: null,
    dirty: false,
    busy: null,
    issue: null,
    notice: null,
    pendingEditor: null,
    catalog: null,
    catalogBusy: false,
    catalogUnavailable: true,
    currentSessionId: null,
    session: null,
    sessionChoice: null,
    sessionBusy: null,
    sessionIssue: null,
    sessionNotice: null,
    invalidFields: [],
    editorEpoch: 0
  };
  accepted = null;
  listeners = /* @__PURE__ */ new Set();
  generation = 0;
  disposed = false;
  sessionGeneration = 0;
  catalogGeneration = 0;
  catalogRemote = null;
  modelSelectorGeneration = 0;
  modelSelector = null;
  modelSelectionSource = null;
  modelSelectionSessionId = null;
  modelSelectionGeneration = 0;
  stopModelSelection = null;
  modelEvents = null;
  modelEventsSessionId = null;
  modelEventsGeneration = 0;
  modelEventsWatermark = -1;
  modeEventsWatermark = -1;
  modeRefreshPending = false;
  stopModelEvents = null;
  modelInteraction = null;
  modelInteractionSessionId = null;
  modelInteractionGeneration = 0;
  stopModelInteraction = null;
  store = {
    getSnapshot: () => this.current,
    subscribe: (listener) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    }
  };
  actions = {
    refresh: () => this.refresh(),
    open: (id2) => this.open(id2),
    create: () => this.open(NEW_EDITOR),
    reload: () => this.reload(),
    editId: (id2) => this.editId(id2),
    editContent: (content2) => this.editContent(content2),
    save: () => this.save(),
    apply: () => this.apply(),
    reset: () => this.reset(),
    discardAndOpen: () => this.discardAndOpen(),
    cancelDiscard: () => this.publish({ pendingEditor: null }),
    editPath: (path, value) => this.editPath(path, value),
    moveFallback: (role2, from, to) => this.editFallbackOrder(role2, from, to),
    editRoute: (path, provider, model) => this.editRoute(path, provider, model),
    refreshCatalog: () => this.refreshCatalog(),
    refreshSession: () => this.refreshSession(),
    chooseSessionProfile: (id2) => {
      if (!this.disposed && this.current.sessionBusy === null && this.current.busy === null && !this.current.dirty) this.publish({ sessionChoice: id2, sessionNotice: null });
    },
    applySession: (options) => this.selectSession(false, options),
    resetSession: () => this.selectSession(true),
    setDeepwork: (active) => this.setDeepwork(active),
    useSessionProfileModel: () => this.selectSession(false, { useProfileModel: true }, true),
    setFieldInvalid: (field, invalid) => {
      if (this.disposed) return;
      const invalidFields = this.current.invalidFields.filter((candidate) => candidate !== field);
      if (invalid) invalidFields.push(field);
      if (invalidFields.join("\n") !== this.current.invalidFields.join("\n")) this.publish({ invalidFields, ...invalid ? { dirty: true } : {} });
    }
  };
  dispose() {
    this.disposed = true;
    this.generation += 1;
    this.sessionGeneration += 1;
    this.catalogGeneration += 1;
    this.modelSelectorGeneration += 1;
    this.modelSelectionGeneration += 1;
    this.stopModelSelection?.();
    this.stopModelEvents?.();
    this.stopModelInteraction?.();
    this.stopModelSelection = null;
    this.stopModelEvents = null;
    this.stopModelInteraction = null;
    this.modelSelectionSource = null;
    this.modelEvents = null;
    this.modelInteraction = null;
    this.catalogRemote = null;
    this.modelSelector = null;
    this.listeners.clear();
  }
  attachModelSelector(remote) {
    if (this.disposed) return;
    this.modelSelectorGeneration += 1;
    this.modelSelector = remote;
  }
  attachModelSelectionSource(sessionId2, source) {
    if (this.disposed || sessionId2 === this.modelSelectionSessionId && source === this.modelSelectionSource) return;
    this.modelSelectionGeneration += 1;
    this.stopModelSelection?.();
    this.modelSelectionSessionId = sessionId2;
    this.modelSelectionSource = source;
    this.stopModelSelection = source?.subscribe(() => {
      this.modelSelectionGeneration += 1;
    }) ?? null;
  }
  attachModelEventSource(sessionId2, source) {
    if (this.disposed || sessionId2 === this.modelEventsSessionId && source === this.modelEvents) return;
    this.modelEventsGeneration += 1;
    this.stopModelEvents?.();
    this.modelEventsSessionId = sessionId2;
    this.modelEvents = source;
    this.modelEventsWatermark = source === null ? -1 : modelSelectionWatermark(source.getSnapshot());
    this.modeEventsWatermark = source === null ? -1 : modeIntentWatermark(source.getSnapshot());
    this.stopModelEvents = source?.subscribe(() => {
      const window = source.getSnapshot(), change = window.change;
      if (change.kind === "settle-assistant") return;
      let watermark = change.kind === "replace" ? -1 : this.modelEventsWatermark;
      for (const entry of change.entries) if (entry.type === "event" && entry.event.type === "model/selection") watermark = Math.max(watermark, Number(entry.event.seq));
      if (watermark !== this.modelEventsWatermark) {
        this.modelEventsWatermark = watermark;
        this.modelEventsGeneration += 1;
      }
      let modeWatermark = change.kind === "replace" ? -1 : this.modeEventsWatermark;
      for (const entry of change.entries) if (entry.type === "event" && (entry.event.type === "deepwork/mode" || entry.event.type === "agent-preset/selected")) modeWatermark = Math.max(modeWatermark, Number(entry.event.seq));
      if (modeWatermark !== this.modeEventsWatermark) {
        this.modeEventsWatermark = modeWatermark;
        if (sessionId2 === this.current.currentSessionId) {
          this.modeRefreshPending = true;
          this.refreshObservedMode();
        }
      }
    }) ?? null;
  }
  attachModelInteractionSource(sessionId2, source) {
    if (this.disposed || sessionId2 === this.modelInteractionSessionId && source === this.modelInteraction) return;
    this.modelInteractionGeneration += 1;
    this.stopModelInteraction?.();
    this.modelInteractionSessionId = sessionId2;
    this.modelInteraction = source;
    this.stopModelInteraction = source?.subscribe(() => {
      if (source.getSnapshot().status === "selecting") this.modelInteractionGeneration += 1;
    }) ?? null;
  }
  attachCatalog(remote) {
    if (this.disposed) return;
    this.catalogGeneration += 1;
    this.catalogRemote = remote;
    this.publish({ catalogBusy: false, catalogUnavailable: remote === null });
    if (remote !== null) void this.refreshCatalog();
  }
  setSession(id2) {
    if (this.disposed || id2 === this.current.currentSessionId) return;
    this.sessionGeneration += 1;
    this.modeRefreshPending = false;
    if (id2 !== this.modelSelectionSessionId) this.attachModelSelectionSource(null, null);
    if (id2 !== this.modelEventsSessionId) this.attachModelEventSource(null, null);
    if (id2 !== this.modelInteractionSessionId) this.attachModelInteractionSource(null, null);
    this.publish({ currentSessionId: id2, session: null, sessionChoice: null, sessionBusy: null, sessionIssue: null, sessionNotice: null });
    if (id2 !== null) void this.refreshSession();
  }
  async refreshCatalog() {
    if (this.disposed || this.current.catalogBusy || this.catalogRemote === null) return;
    const remote = this.catalogRemote, generation = ++this.catalogGeneration;
    this.publish({ catalogBusy: true });
    try {
      const catalog = await this.unwrap(remote.modelCatalog());
      if (!this.disposed && generation === this.catalogGeneration) this.publish({ catalog, catalogUnavailable: false });
    } catch {
      if (!this.disposed && generation === this.catalogGeneration) this.publish({ catalogUnavailable: true });
    } finally {
      if (!this.disposed && generation === this.catalogGeneration) this.publish({ catalogBusy: false });
    }
  }
  refreshObservedMode() {
    if (!this.disposed && this.modeRefreshPending && this.current.sessionBusy === null) void this.refreshSession(true);
  }
  async refreshSession(preserveFeedback = false) {
    const id2 = this.current.currentSessionId;
    if (this.disposed || id2 === null || this.current.sessionBusy !== null) return;
    this.modeRefreshPending = false;
    const generation = ++this.sessionGeneration;
    const live = () => !this.disposed && generation === this.sessionGeneration && id2 === this.current.currentSessionId;
    this.publish({ sessionBusy: "read", ...preserveFeedback ? {} : { sessionIssue: null, sessionNotice: null } });
    try {
      const session = await this.unwrap(this.remote.describeSession(id2));
      if (session.sessionId !== id2) throw { kind: "assembly", code: "unavailable" };
      if (live()) this.publish({ session, sessionChoice: session.selection.selectedId });
    } catch (error) {
      if (live()) this.publish({ sessionIssue: this.issue(error) });
    } finally {
      if (live()) {
        this.publish({ sessionBusy: null });
        this.refreshObservedMode();
      }
    }
  }
  async setDeepwork(active) {
    const { currentSessionId: id2, session } = this.current;
    if (this.disposed || id2 === null || session?.deepwork === void 0 || session.deepwork.locked || !session.switchAllowed || this.current.sessionBusy !== null || this.current.busy !== null || this.remote.selectMode === void 0) return;
    const generation = ++this.sessionGeneration;
    const live = () => !this.disposed && generation === this.sessionGeneration && id2 === this.current.currentSessionId;
    this.publish({ sessionBusy: "mode", sessionIssue: null, sessionNotice: null });
    try {
      const accepted = await this.unwrap(this.remote.selectMode(id2, {
        sessionId: id2,
        active,
        expectedModeRevision: session.deepwork.revision,
        expectedAdmissionEpoch: session.admissionEpoch
      }));
      if (accepted.sessionId !== id2 || accepted.deepwork?.active !== active || !accepted.deepwork.explicit) throw { kind: "assembly", code: "unavailable" };
      if (live()) this.publish({ session: accepted, sessionNotice: active ? "mode-on" : "mode-off" });
    } catch (error) {
      if (live()) this.publish({ sessionIssue: this.issue(error) });
    } finally {
      if (live()) {
        this.publish({ sessionBusy: null });
        this.refreshObservedMode();
      }
    }
  }
  async selectSession(reset, options, modelOnly = false) {
    const { currentSessionId: id2, session, sessionChoice, snapshot: snapshot2 } = this.current;
    if (this.disposed || id2 === null || session === null || !session.switchAllowed || this.current.sessionBusy !== null || this.current.busy !== null || this.current.dirty || this.current.pendingEditor !== null) return;
    const selectedId = reset ? null : sessionChoice;
    const revision2 = snapshot2?.profiles.find((profile) => profile.id === selectedId)?.revision;
    if (!modelOnly && selectedId !== null && revision2 == null) return;
    const generation = ++this.sessionGeneration;
    const useProfileModel = !reset && options?.useProfileModel === true;
    const selector = this.modelSelector, selectorGeneration = this.modelSelectorGeneration;
    const modelSource = this.modelSelectionSource, modelGeneration = this.modelSelectionGeneration;
    const modelSnapshot = modelSource?.getSnapshot();
    const eventSource = this.modelEvents, eventGeneration = this.modelEventsGeneration;
    const eventWatermark = eventSource === null ? -1 : modelSelectionWatermark(eventSource.getSnapshot());
    const modeWatermark = eventSource === null ? -1 : modeIntentWatermark(eventSource.getSnapshot());
    const interaction = this.modelInteraction, interactionGeneration = this.modelInteractionGeneration;
    const pendingNativeChoice = interaction?.getSnapshot().status === "selecting";
    const live = () => !this.disposed && generation === this.sessionGeneration && id2 === this.current.currentSessionId;
    const selectorLive = () => live() && selector !== null && selector === this.modelSelector && selectorGeneration === this.modelSelectorGeneration;
    this.publish({ sessionBusy: reset ? "reset" : "apply", sessionIssue: null, sessionNotice: null });
    try {
      const accepted = await this.unwrap(modelOnly ? this.remote.describeSession(id2) : this.remote.selectSession(id2, {
        sessionId: id2,
        id: selectedId,
        ...selectedId === null ? {} : { expectedRevision: revision2 },
        expectedSelectionRevision: session.selection.selectionRevision,
        expectedAdmissionEpoch: session.admissionEpoch
      }));
      if (accepted.sessionId !== id2) throw { kind: "assembly", code: "unavailable" };
      if (modelOnly && (accepted.admissionEpoch !== session.admissionEpoch || accepted.deepwork?.revision !== session.deepwork?.revision || !accepted.switchAllowed)) throw { kind: "domain", code: "conflict" };
      if (!live()) return;
      this.publish({ session: accepted, sessionChoice: accepted.selection.selectedId, sessionNotice: useProfileModel ? null : reset ? "reset" : "applied" });
      if (!useProfileModel || !live()) return;
      if (accepted.profileModel === void 0) {
        this.publish({ sessionIssue: { kind: "assembly", code: "model-unconfigured", source: "profile-model" } });
        return;
      }
      if (!selectorLive()) {
        this.publish({ sessionIssue: { kind: "assembly", code: "model-service-unavailable", source: "profile-model" } });
        return;
      }
      if (modelSource === null || modelSnapshot === void 0 || this.modelSelectionSessionId !== id2 || modelSource !== this.modelSelectionSource || modelSource.getSnapshot() === void 0) {
        this.publish({ sessionIssue: { kind: "assembly", code: "model-observation-unavailable", source: "profile-model" } });
        return;
      }
      if (modelGeneration !== this.modelSelectionGeneration || !Object.is(modelSnapshot, modelSource.getSnapshot())) {
        this.publish({ sessionIssue: { kind: "assembly", code: "model-choice-changed", source: "profile-model" } });
        return;
      }
      if (eventSource === null || eventSource !== this.modelEvents || this.modelEventsSessionId !== id2 || interaction === null || interaction !== this.modelInteraction || this.modelInteractionSessionId !== id2) {
        this.publish({ sessionIssue: { kind: "assembly", code: "model-observation-unavailable", source: "profile-model" } });
        return;
      }
      if (eventGeneration !== this.modelEventsGeneration || eventWatermark !== modelSelectionWatermark(eventSource.getSnapshot()) || modelOnly && modeWatermark !== modeIntentWatermark(eventSource.getSnapshot()) || interactionGeneration !== this.modelInteractionGeneration || pendingNativeChoice || interaction.getSnapshot().status === "selecting") {
        this.publish({ sessionIssue: { kind: "assembly", code: "model-choice-changed", source: "profile-model" } });
        return;
      }
      try {
        await this.unwrap(selector.selectModel({ sessionId: id2, ...accepted.profileModel }));
        if (live()) this.publish(selectorLive() && modelSource === this.modelSelectionSource && this.modelSelectionSessionId === id2 ? { sessionNotice: "applied-with-model" } : { sessionIssue: { kind: "assembly", code: "model-service-unavailable", source: "profile-model" } });
      } catch {
        if (live()) this.publish({ sessionIssue: { kind: "assembly", code: selectorLive() ? "model-selection-failed" : "model-service-unavailable", source: "profile-model" } });
      }
    } catch (error) {
      if (live()) this.publish({ sessionIssue: this.issue(error) });
    } finally {
      if (live()) {
        this.publish({ sessionBusy: null });
        this.refreshObservedMode();
      }
    }
  }
  publish(patch) {
    if (this.disposed) return;
    this.current = { ...this.current, ...patch };
    for (const listener of this.listeners) listener();
  }
  accept(document2) {
    this.accepted = { ...document2 };
    this.publish({ editor: { ...document2 }, dirty: false, pendingEditor: null, invalidFields: [], editorEpoch: this.current.editorEpoch + 1 });
  }
  async unwrap(request, field) {
    const result = await request;
    if (result.ok) return result.value;
    if (result.error.code === "dsmm-profiles/refused") {
      throw { kind: "domain", ...result.error.details };
    }
    if (["gateway/input-invalid", "gateway/arguments-invalid"].includes(String(result.error.code))) {
      throw { kind: "domain", code: "validation", field, message: "The native Host rejected a request field. Check the profile ID and document size before retrying." };
    }
    throw { kind: "transport", code: result.error.code };
  }
  issue(error) {
    if (typeof error === "object" && error !== null && "kind" in error && (error.kind === "domain" || error.kind === "transport")) return error;
    return { kind: "assembly", code: "unavailable" };
  }
  async perform(busy, operation) {
    if (this.disposed || this.current.busy !== null || this.current.sessionBusy === "apply" || this.current.sessionBusy === "reset" || this.current.pendingEditor !== null) return;
    const generation = ++this.generation;
    const live = () => !this.disposed && generation === this.generation;
    this.publish({ busy, issue: null, notice: null });
    try {
      await operation(live);
    } catch (error) {
      if (live()) this.publish({ issue: this.issue(error) });
    } finally {
      if (live()) this.publish({ busy: null });
    }
  }
  async refresh() {
    await this.perform("refresh", async (live) => {
      const snapshot2 = await this.unwrap(this.remote.describe());
      if (live()) this.publish({ snapshot: snapshot2 });
    });
  }
  async open(id2) {
    if (this.disposed || this.current.busy !== null || this.current.pendingEditor !== null) return;
    if (id2 !== NEW_EDITOR && this.current.editor?.id === id2) return;
    if (this.current.dirty) {
      this.publish({ pendingEditor: id2 });
      return;
    }
    await this.loadEditor(id2);
  }
  async reload() {
    const editor = this.current.editor;
    if (editor === null || editor.revision === null || this.current.busy !== null || this.current.pendingEditor !== null) return;
    if (this.current.dirty) {
      this.publish({ pendingEditor: editor.id });
      return;
    }
    await this.loadEditor(editor.id);
  }
  async loadEditor(id2) {
    if (id2 === NEW_EDITOR) {
      this.accepted = null;
      this.publish({ editor: { id: "new-profile", content: NEW_PROFILE_CONTENT, revision: null }, dirty: true, issue: null, notice: null, pendingEditor: null, invalidFields: [], editorEpoch: this.current.editorEpoch + 1 });
      return;
    }
    await this.perform("read", async (live) => {
      const document2 = await this.unwrap(this.remote.read(id2), "id");
      if (live()) this.accept(document2);
    });
  }
  async discardAndOpen() {
    const wanted = this.current.pendingEditor;
    if (wanted === null || this.current.busy !== null) return;
    this.publish({ pendingEditor: null });
    const previous = this.current.editor;
    const accepted = this.accepted;
    await this.loadEditor(wanted);
    if (this.current.issue !== null && previous !== null) {
      this.accepted = accepted;
      this.publish({ editor: previous, dirty: true });
    }
  }
  editId(id2) {
    const editor = this.current.editor;
    if (editor === null || editor.revision !== null || this.current.busy !== null || this.current.pendingEditor !== null) return;
    const content2 = editStructuredPath(editor.content, ["id"], id2);
    if (content2 === null) {
      this.publish({ issue: { kind: "domain", code: "validation", field: "content" }, notice: null });
      return;
    }
    this.publish({ editor: { ...editor, id: id2, content: content2 }, dirty: true, issue: null, notice: null });
  }
  editContent(content2) {
    const editor = this.current.editor;
    if (editor === null || this.current.busy !== null || this.current.pendingEditor !== null) return;
    this.publish({ editor: { ...editor, content: content2 }, dirty: this.accepted === null || this.accepted.content !== content2 || this.accepted.id !== editor.id, issue: null, notice: null });
  }
  editPath(path, value) {
    const editor = this.current.editor;
    if (editor === null || this.current.busy !== null || this.current.pendingEditor !== null) return;
    const content2 = editStructuredPath(editor.content, path, value);
    if (content2 === null) {
      this.publish({ issue: { kind: "domain", code: "validation", field: "content" }, notice: null });
      return;
    }
    this.editContent(content2);
  }
  editRoute(path, provider, model) {
    const editor = this.current.editor;
    if (editor === null || this.current.busy !== null || this.current.pendingEditor !== null) return;
    let content2 = editor.content;
    for (const [key, value] of [["provider", provider], ["model", model], ["reasoningEffort", void 0]]) {
      content2 = editStructuredPath(content2, [...path, key], value);
      if (content2 === null) {
        this.publish({ issue: { kind: "domain", code: "validation", field: "content" }, notice: null });
        return;
      }
    }
    this.editContent(content2);
  }
  editFallbackOrder(role2, from, to) {
    const editor = this.current.editor;
    if (editor === null || this.current.busy !== null || this.current.pendingEditor !== null) return;
    const content2 = moveFallback(editor.content, role2, from, to);
    if (content2 !== null) this.editContent(content2);
  }
  async save() {
    const editor = this.current.editor;
    if (editor === null || !this.current.dirty || this.current.snapshot === null || this.current.busy !== null || this.current.pendingEditor !== null || this.current.invalidFields.length > 0) return;
    if (!isProfileId(editor.id)) {
      this.publish({ issue: { kind: "domain", code: "validation", field: "id" }, notice: null });
      return;
    }
    await this.perform("save", async (live) => {
      const document2 = await this.unwrap(this.remote.save({ id: editor.id, content: editor.content, expectedRevision: editor.revision }), "content");
      if (!live()) return;
      this.accept(document2);
      const old = this.current.snapshot;
      const profiles = old.profiles.filter((item) => item.id !== document2.id);
      profiles.push({ id: document2.id, revision: document2.revision, ...document2.label === void 0 ? {} : { label: document2.label } });
      profiles.sort((a, b) => a.id.localeCompare(b.id));
      this.publish({ snapshot: { ...old, profiles }, notice: { key: "saved", id: document2.id } });
    });
  }
  async apply() {
    const { editor, snapshot: snapshot2, dirty } = this.current;
    if (editor?.revision == null || !canReconcileSelection(snapshot2) || dirty) return;
    await this.perform("apply", async (live) => {
      const accepted = await this.unwrap(this.remote.select({ id: editor.id, expectedRevision: editor.revision, expectedSelectionRevision: snapshot2.selectionRevision }));
      if (live()) this.acceptSelection(accepted, { key: "applied", id: accepted.selectedId ?? void 0 });
    });
  }
  async reset() {
    const snapshot2 = this.current.snapshot;
    if (!canReconcileSelection(snapshot2)) return;
    await this.perform("reset", async (live) => {
      const accepted = await this.unwrap(this.remote.select({ id: null, expectedSelectionRevision: snapshot2.selectionRevision }));
      if (live()) this.acceptSelection(accepted, { key: "reset" });
    });
  }
  acceptSelection(snapshot2, notice) {
    this.publish({
      snapshot: snapshot2,
      notice: snapshot2.selectionError === void 0 ? notice : null,
      issue: snapshot2.selectionError === void 0 ? null : { kind: "domain", ...snapshot2.selectionError, source: "selection" }
    });
  }
};

// src/client/locales.ts
var NS = "settings.dsmm-profiles";
var en = {
  headerCompactProfiles: "Profiles · keep model",
  headerCompactRefresh: "Refresh",
  headerNoSession: "Select a session to make changes.",
  headerModeEnable: "Enable Deepwork",
  headerModeDisable: "Disable Deepwork",
  headerModePreset: "Deepwork · DW preset",
  headerModeUnavailable: "Deepwork unavailable",
  headerModeOn: "Deepwork enabled.",
  headerModeOff: "Deepwork disabled.",
  headerUseCurrentModel: "Use profile model",
  title: "Deepwork Profiles",
  description: "Save independent runtime configurations and choose which one new sessions use.",
  newSessions: "Global apply and reset affect future unscoped sessions only. Current-session actions below are separate. A cold resume retains an explicit saved session choice; otherwise it inherits the global default.",
  editorSelect: "Profile to edit",
  choose: "Choose a profile",
  newDraft: "New unsaved profile",
  new: "New profile",
  profileId: "Profile ID (name)",
  idHint: "Use 1–64 lowercase letters, digits, hyphens or underscores. The ID cannot be changed after saving. Add an optional display label in the JSONC document.",
  configuration: "Runtime configuration (JSONC)",
  configurationHint: "Document: version 1, matching id, optional label, and settings. Supported runtime settings: defaultActive, roleRouting, workflow, guards, runtimeRecovery, and both DeepSeek families’ calibration, default-effort and max-preset policies.",
  structuralHint: "Roles, skills, mode names, prompt order/content, preset installation, LSP, providers and accounts belong in native deployment configuration, not profiles. Routing may reference an existing provider; never paste credentials.",
  save: "Save profile",
  saving: "Saving profile…",
  apply: "Apply saved profile",
  applying: "Applying profile…",
  reset: "Reset to baseline",
  resetting: "Resetting to baseline…",
  refresh: "Refresh profiles",
  refreshing: "Refreshing profiles…",
  reload: "Reload saved profile",
  loading: "Loading profiles…",
  reading: "Reading profile…",
  empty: "No saved profiles yet. Create a profile to start; the deployment baseline remains applied.",
  baseline: "Applied to new sessions: deployment baseline.",
  appliedProfile: "Applied to new sessions: {id} (revision {revision}).",
  appliedInvalid: "The stored selection cannot be confirmed. Existing sessions remain unchanged. Resolve the Host diagnostic before applying or resetting a profile.",
  selectionConflict: "The stored selection changed outside this Host. This Host still uses the policy shown above for new sessions. Apply a saved profile or reset to baseline to reconcile it; restarting adopts the stored selection. Existing sessions stay unchanged.",
  dirty: "Unsaved changes. Save before applying; saving alone does not apply this profile.",
  savedNotApplied: "Saved profile; this revision is not applied to new sessions.",
  savedApplied: "This saved revision is applied to new sessions.",
  saved: "Saved {id}. The applied policy was not changed.",
  applied: "Applied {id} for new sessions. Existing sessions were not changed.",
  resetDone: "Reset to the deployment baseline for new sessions. Existing sessions were not changed.",
  discardPrompt: "Discard the unsaved draft before changing the editor?",
  discard: "Discard changes",
  cancel: "Cancel",
  conflict: "The saved file or selection changed elsewhere. Your draft and the prior selection were kept. Refresh profiles, then reload the saved profile or review your draft before retrying.",
  validation: "This profile is not valid. Correct the field below; your draft is unchanged.",
  io: "The Host could not commit this operation. Your draft and the prior selection were kept. Check profile storage access, refresh, then retry.",
  unavailable: "The native profile service is unavailable. Your draft is kept. Refresh after the Host reconnects or Deepwork is enabled.",
  transport: "The native connection could not confirm this operation. Your draft is kept. Refresh the Host state before retrying; do not assume a save or apply completed.",
  invalidProfile: "Unavailable profile: {id}",
  details: "Host diagnostic",
  retry: "Resolve the diagnostic, refresh profiles, then retry.",
  globalScope: "Global default for future sessions",
  sessionScope: "Current native session",
  sessionSelect: "Current-session profile",
  globalActionHint: "Apply saved profile below changes the global default for future unscoped sessions only. It does not apply to the current session.",
  headerProfile: "Profile",
  headerProfileLabel: "Current-session profile (header)",
  headerCaptured: "captured global default",
  headerSavedUnavailable: "saved profile unavailable",
  headerCurrentProfile: "Current profile: {profile}",
  headerRefresh: "Refresh profiles and current-session state",
  headerUseModelAction: "Use profile model: {profile}",
  headerLoading: "Loading profile…",
  headerApplying: "Applying profile…",
  headerApplied: "Profile applied.",
  headerBusy: "Session is busy.",
  headerUnavailable: "Profile unavailable.",
  headerDraft: "Save or discard the draft in Settings.",
  headerConflict: "The session profile or admission changed elsewhere. Refresh current-session state before retrying.",
  headerRefused: "Profile change unconfirmed. Check Settings.",
  headerKeepModelGroup: "Switch profile — keep current model",
  headerUseModelGroup: "Switch and use profile model",
  headerModelDefaultHint: "Normal switching preserves the current model. Explicit switch-and-use-model also saves the native model default, like the Models tab.",
  headerNoProfileModel: "Profile applied; no main model configured. Current model kept.",
  headerModelUnconfirmed: "Profile applied; model change unconfirmed. Check Models/Settings.",
  headerAppliedWithModel: "Profile and native model applied.",
  headerModelChoiceChanged: "Profile applied; newer native model choice kept.",
  headerActivationRefused: "Profile activation was refused. Check its configuration and native model catalog.",
  headerSelectionRefused: "The profile change could not be confirmed.",
  headerIssueCode: "Reason: {code}.",
  headerIssueField: "Configuration field: {field}.",
  headerRetryHint: "Refresh profiles and current-session state, resolve the indicated issue in Settings or native Models, then retry when the session is idle.",
  headerMaintenanceRefused: "Native maintenance owns this session. The previous profile is kept.",
  headerBusyRefused: "The session is busy. The previous profile is kept.",
  headerCancelledRefused: "The profile request was cancelled. Refresh current-session state before retrying; do not assume a change completed.",
  headerUnavailableRefused: "The native session or profile service is unavailable. Reconnect and refresh before retrying.",
  headerWaitRetryHint: "Wait for the native work or maintenance to finish, then Refresh and retry. No profile change is queued automatically.",
  noSession: "No native session is selected. Session Apply is disabled; global defaults and drafts remain editable.",
  sessionUnavailable: "The current session could not be confirmed. Refresh its state before retrying; the prior policy is kept.",
  sessionBusy: "Switching is unavailable: {reason}. The Host must reserve a truly idle ordinary session before applying.",
  sessionState: "Session {id}: {profile}; scope {scope}; admission epoch {epoch}.",
  sessionBaseline: "deployment baseline",
  sessionGlobalCaptured: "captured global default (no explicit session override)",
  sessionAdmittedProfile: "{id} (revision {revision})",
  sessionFutureDefault: "Global default for future unscoped sessions: {profile}. This does not change this session's admission.",
  sessionConflict: "The session selection or admission epoch changed elsewhere. The prior display and draft are kept. Refresh current-session state before applying again.",
  sessionApply: "Apply profile to current session",
  sessionApplying: "Applying current-session profile…",
  sessionReset: "Pin baseline for current session",
  sessionResetting: "Pinning current-session baseline…",
  sessionRefresh: "Refresh current-session state",
  sessionApplied: "Applied the saved revision to this session only. Global default and existing children were not changed.",
  sessionResetDone: "Pinned the deployment baseline for this session only. Global default was not changed.",
  sessionAppliedWithModel: "Applied this session profile and explicitly selected its native main model. Native model-default persistence follows the Models tab; the global profile default was not changed.",
  sessionDirty: "Save or explicitly discard the editor draft before applying a current-session choice.",
  roleState: "Admitted route {route}; strategy {strategy}; retries {retries}; rate-limit failures {failures}; switches {switches}; total delay {delay} ms.",
  catalogTitle: "Native model catalog",
  catalogHint: "Catalog listings are advisory, not network or account health checks. Unlisted/manual routes stay editable; refresh never changes the draft or native model default.",
  catalogUnavailable: "The native catalog is unavailable. Manual provider/model/effort fields and advanced JSONC remain available.",
  catalogRefresh: "Refresh model catalog",
  catalogRefreshing: "Refreshing model catalog…",
  catalogFailure: "Provider catalog unavailable: {name} ({id}).",
  profileLabel: "Profile display label",
  defaultActive: "Default Deepwork mode",
  activeHint: "This default does not erase an explicit saved session mode.",
  enabled: "Enabled",
  disabled: "Disabled",
  inherit: "Inherit deployment baseline",
  profileDefaults: "Profile runtime defaults",
  roleSelect: "Agent role to edit",
  rolesUnavailable: "Native role inventory unavailable — use advanced JSONC",
  roleEnabled: "Enabled in the native deployment",
  roleDisabled: "Disabled in the native deployment",
  strategy: "{name} strategy",
  inheritStrategy: "Inherit ({value})",
  startupLock: "startup-lock — keep the admitted route",
  rateFallback: "rate-limit-fallback — ordered rollover at threshold",
  strategyHint: "Both strategies use finite, positively no-output-safe RATE_LIMIT retries. Generic, auth and quota failures do not authorize a model switch. Blank numeric fields inherit; zero is an explicit value.",
  retryField: "{name} {field}",
  inheritNumber: "Inherit {value}",
  retryBounds: "Integer {min}–{max}; inherited value {value}.",
  unknownDefault: "unavailable",
  retryCount: "retry count",
  initialDelay: "initial delay (ms)",
  maxDelay: "maximum delay (ms)",
  totalWait: "total wait budget (ms)",
  switchThreshold: "rate-limit failures before switch",
  maxSwitches: "maximum switches",
  primaryMode: "{name} primary route",
  inheritRoute: "Inherit native/deployment route",
  configuredRoute: "Configure primary route",
  primaryName: "{name} primary",
  fallbackMode: "{name} fallback chain",
  inheritChain: "Inherit deployment fallback chain",
  configuredChain: "Explicit ordered fallback chain",
  emptyChain: "Explicitly empty chain: no configured fallback routes.",
  fallbackName: "{name} fallback {index}",
  addFallback: "Add fallback for {name}",
  removeFallback: "Remove {name}",
  moveUp: "Move up {name}",
  moveDown: "Move down {name}",
  routeProvider: "{name} provider",
  routeModel: "{name} model",
  routeEffort: "{name} exact effort",
  manualProvider: "{name} manual provider",
  manualModel: "{name} manual model",
  manualEffort: "{name} manual exact effort",
  manual: "Enter manual identifier",
  manualValue: "Manual / unlisted: {value}",
  unset: "not set",
  effortDefault: "Native default (omit exact effort)",
  effortChangeHint: "Changing a provider/model explicitly clears that route's exact effort. Catalog refresh preserves all configured values; choose an exact effort again if required.",
  advanced: "Advanced JSONC",
  rawInvalid: "Structured editing is unavailable for this invalid raw draft. Correct Advanced JSONC; no fields, comments or bytes have been normalized.",
  invalidNumber: "Correct this bounded integer before saving or changing roles. The invalid value has not replaced the saved draft policy."
};
var zh = {
  headerCompactProfiles: "配置档 · 保留模型",
  headerCompactRefresh: "刷新",
  headerNoSession: "选择会话后可更改。",
  headerModeEnable: "启用 Deepwork",
  headerModeDisable: "关闭 Deepwork",
  headerModePreset: "Deepwork · DW 预设",
  headerModeUnavailable: "Deepwork 不可用",
  headerModeOn: "Deepwork 已启用。",
  headerModeOff: "Deepwork 已关闭。",
  headerUseCurrentModel: "使用配置档模型",
  title: "Deepwork 配置档",
  description: "保存独立的运行时配置，并选择新会话使用的配置档。",
  newSessions: "全局应用和重置仅影响之后没有独立选择的新会话。下方当前会话操作相互独立。冷恢复保留明确保存的会话选择，否则继承全局默认值。",
  editorSelect: "要编辑的配置档",
  choose: "选择配置档",
  newDraft: "新的未保存配置档",
  new: "新建配置档",
  profileId: "配置档 ID（名称）",
  idHint: "使用 1–64 个小写字母、数字、连字符或下划线。保存后不能修改 ID。可在 JSONC 文档中添加可选的显示名称 label。",
  configuration: "运行时配置（JSONC）",
  configurationHint: "文档包含 version: 1、相同的 id、可选 label 和 settings。支持 defaultActive、roleRouting、workflow、guards、runtimeRecovery，以及两个 DeepSeek 系列的校准、默认推理强度和最高强度预设策略。",
  structuralHint: "角色、技能、模式名称、提示顺序或内容、预设安装、LSP、提供商和账户由原生部署配置管理，不属于配置档。路由可引用已有提供商；请勿粘贴凭证。",
  save: "保存配置档",
  saving: "正在保存配置档…",
  apply: "应用已保存配置档",
  applying: "正在应用配置档…",
  reset: "重置为基线",
  resetting: "正在重置为基线…",
  refresh: "刷新配置档",
  refreshing: "正在刷新配置档…",
  reload: "重新加载已保存配置档",
  loading: "正在加载配置档…",
  reading: "正在读取配置档…",
  empty: "尚无已保存的配置档。可新建配置档；当前仍应用部署基线。",
  baseline: "新会话使用：部署基线。",
  appliedProfile: "新会话使用：{id}（修订 {revision}）。",
  appliedInvalid: "无法确认保存的选择。已有会话未改变。请先解决 Host 诊断，再应用或重置配置档。",
  selectionConflict: "保存的选择已被此 Host 之外的操作修改。此 Host 的新会话仍使用上方策略。请应用已保存配置档或重置为基线以协调选择；重启将采用保存的选择。已有会话未改变。",
  dirty: "有未保存的更改。请先保存再应用；仅保存不会应用此配置档。",
  savedNotApplied: "已保存；此修订尚未应用到新会话。",
  savedApplied: "此已保存修订已应用到新会话。",
  saved: "已保存 {id}，未改变已应用的策略。",
  applied: "已为新会话应用 {id}，已有会话未改变。",
  resetDone: "已为新会话重置为部署基线，已有会话未改变。",
  discardPrompt: "切换编辑器之前，是否丢弃未保存的草稿？",
  discard: "丢弃更改",
  cancel: "取消",
  conflict: "已保存文件或选择已被其他操作修改。草稿和原选择已保留。请刷新配置档，然后重新加载已保存配置档或检查草稿后重试。",
  validation: "此配置档无效。请修正下方字段；草稿未改变。",
  io: "Host 无法提交此操作。草稿和原选择已保留。请检查配置档存储权限，刷新后重试。",
  unavailable: "原生配置档服务不可用。草稿已保留。Host 重新连接或启用 Deepwork 后请刷新。",
  transport: "原生连接无法确认此操作。草稿已保留。重试之前请刷新 Host 状态；不要假定保存或应用已完成。",
  invalidProfile: "不可用配置档：{id}",
  details: "Host 诊断",
  retry: "请解决诊断问题，刷新配置档后重试。",
  globalScope: "未来会话的全局默认值",
  sessionScope: "当前原生会话",
  sessionSelect: "当前会话配置档",
  globalActionHint: "下方应用已保存配置档仅改变未来没有独立选择的会话的全局默认值，不会应用到当前会话。",
  headerProfile: "配置档",
  headerProfileLabel: "当前会话配置档（会话栏）",
  headerCaptured: "已捕获的全局默认值",
  headerSavedUnavailable: "保存的配置档不可用",
  headerCurrentProfile: "当前配置档：{profile}",
  headerRefresh: "刷新配置档和当前会话状态",
  headerUseModelAction: "使用配置档模型：{profile}",
  headerLoading: "加载配置档…",
  headerApplying: "应用配置档…",
  headerApplied: "配置档已应用。",
  headerBusy: "会话忙碌。",
  headerUnavailable: "配置档不可用。",
  headerDraft: "请在设置中保存或丢弃草稿。",
  headerConflict: "会话配置档或准入代次已在其他位置改变，请刷新当前会话状态后重试。",
  headerRefused: "未确认配置档更改，请检查设置。",
  headerKeepModelGroup: "切换配置档 — 保留当前模型",
  headerUseModelGroup: "切换并使用配置档模型",
  headerModelDefaultHint: "普通切换保留当前模型。明确切换并使用模型还会像模型页一样保存原生模型默认值。",
  headerNoProfileModel: "配置档已应用，未配置主模型。当前模型已保留。",
  headerModelUnconfirmed: "配置档已应用，模型更改未确认。请检查模型或设置页。",
  headerAppliedWithModel: "配置档和原生模型已应用。",
  headerModelChoiceChanged: "配置档已应用，已保留更新的原生模型选择。",
  headerActivationRefused: "配置档启用被拒绝，请检查其配置和原生模型目录。",
  headerSelectionRefused: "无法确认配置档更改。",
  headerIssueCode: "原因：{code}。",
  headerIssueField: "配置字段：{field}。",
  headerRetryHint: "请刷新配置档和当前会话状态，在设置或原生模型页解决所示问题，然后在会话空闲时重试。",
  headerMaintenanceRefused: "原生维护正在占用此会话，原配置档已保留。",
  headerBusyRefused: "会话正在运行，原配置档已保留。",
  headerCancelledRefused: "配置档请求已取消，请刷新当前会话状态后重试，不要假定更改已完成。",
  headerUnavailableRefused: "原生会话或配置档服务不可用，请重新连接并刷新后重试。",
  headerWaitRetryHint: "请等待原生运行或维护结束，然后刷新并重试。不会自动排队应用配置档。",
  noSession: "未选择原生会话。会话应用已禁用；仍可编辑全局默认值和草稿。",
  sessionUnavailable: "无法确认当前会话。重试前请刷新状态；原策略已保留。",
  sessionBusy: "暂不可切换：{reason}。Host 必须先保留真正空闲的普通会话。",
  sessionState: "会话 {id}：{profile}；范围 {scope}；准入代次 {epoch}。",
  sessionBaseline: "部署基线",
  sessionGlobalCaptured: "已捕获的全局默认值（没有明确会话覆盖）",
  sessionAdmittedProfile: "{id}（修订 {revision}）",
  sessionFutureDefault: "未来没有独立选择的会话的全局默认值：{profile}。这不会改变当前会话的准入。",
  sessionConflict: "会话选择或准入代次已在其他位置改变。原显示和草稿已保留。再次应用前请刷新当前会话状态。",
  sessionApply: "应用配置档到当前会话",
  sessionApplying: "正在应用当前会话配置档…",
  sessionReset: "为当前会话固定基线",
  sessionResetting: "正在固定当前会话基线…",
  sessionRefresh: "刷新当前会话状态",
  sessionApplied: "已仅对此会话应用保存的修订。全局默认值和已有子会话未改变。",
  sessionResetDone: "已仅对此会话固定部署基线。全局默认值未改变。",
  sessionDirty: "应用当前会话选择之前，请保存或明确丢弃编辑器草稿。",
  sessionAppliedWithModel: "已应用此会话配置档，并明确选择其原生主模型。模型默认值像模型页一样保存；全局配置档默认值未改变。",
  roleState: "准入路由 {route}；策略 {strategy}；重试 {retries}；限流失败 {failures}；切换 {switches}；累计延迟 {delay} 毫秒。",
  catalogTitle: "原生模型目录",
  catalogHint: "目录仅供参考，不是网络或账户健康检查。未列出或手动路由仍可编辑；刷新不会改变草稿或原生模型默认值。",
  catalogUnavailable: "原生模型目录不可用。仍可使用手动提供商、模型、强度字段和高级 JSONC。",
  catalogRefresh: "刷新模型目录",
  catalogRefreshing: "正在刷新模型目录…",
  catalogFailure: "提供商目录不可用：{name}（{id}）。",
  profileLabel: "配置档显示名称",
  defaultActive: "默认 Deepwork 模式",
  activeHint: "此默认值不会抹除已明确保存的会话模式。",
  enabled: "启用",
  disabled: "禁用",
  inherit: "继承部署基线",
  profileDefaults: "配置档运行时默认值",
  roleSelect: "要编辑的 Agent 角色",
  rolesUnavailable: "原生角色列表不可用，请使用高级 JSONC",
  roleEnabled: "原生部署中已启用",
  roleDisabled: "原生部署中已禁用",
  strategy: "{name} 策略",
  inheritStrategy: "继承（{value}）",
  startupLock: "startup-lock — 保留准入路由",
  rateFallback: "rate-limit-fallback — 达到阈值后按顺序切换",
  strategyHint: "两种策略均使用有限且已证明无输出的 RATE_LIMIT 重试。普通、认证或配额失败不允许切换模型。数字留空表示继承，零是明确值。",
  retryField: "{name} {field}",
  inheritNumber: "继承 {value}",
  retryBounds: "整数 {min}–{max}；继承值 {value}。",
  unknownDefault: "不可用",
  retryCount: "重试次数",
  initialDelay: "初始延迟（毫秒）",
  maxDelay: "最大单次延迟（毫秒）",
  totalWait: "累计等待上限（毫秒）",
  switchThreshold: "切换前的限流失败次数",
  maxSwitches: "最大切换次数",
  primaryMode: "{name} 主路由",
  inheritRoute: "继承原生或部署路由",
  configuredRoute: "配置主路由",
  primaryName: "{name} 主路由",
  fallbackMode: "{name} 备用链",
  inheritChain: "继承部署备用链",
  configuredChain: "明确的有序备用链",
  emptyChain: "明确为空的备用链：没有已配置备用路由。",
  fallbackName: "{name} 备用 {index}",
  addFallback: "为 {name} 添加备用路由",
  removeFallback: "移除 {name}",
  moveUp: "上移 {name}",
  moveDown: "下移 {name}",
  routeProvider: "{name} 提供商",
  routeModel: "{name} 模型",
  routeEffort: "{name} 精确强度",
  manualProvider: "{name} 手动提供商",
  manualModel: "{name} 手动模型",
  manualEffort: "{name} 手动精确强度",
  manual: "输入手动标识",
  manualValue: "手动或未列出：{value}",
  unset: "未设置",
  effortDefault: "原生默认值（省略精确强度）",
  effortChangeHint: "明确更改提供商或模型会清除该路由的精确强度。刷新目录会保留所有配置值；需要时请重新选择精确强度。",
  advanced: "高级 JSONC",
  rawInvalid: "原始草稿无效，暂不可结构化编辑。请修正高级 JSONC；字段、注释和字节均未自动规范化。",
  invalidNumber: "保存或切换角色之前，请修正此有界整数。无效值尚未替换草稿中的策略。"
};
var RETRY_FIELD_LABEL_KEYS = {
  maxRetries: "retryCount",
  initialDelayMs: "initialDelay",
  maxDelayMs: "maxDelay",
  maxTotalDelayMs: "totalWait",
  switchAfterRateLimits: "switchThreshold",
  maxSwitches: "maxSwitches"
};

// src/client/ProfilesSection.tsx
var import_react3 = require("react");
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/StructuredEditor.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
var MANUAL = "__dsmm_manual__";
function RetryNumber({ id: id2, name, field, value, inherited, path, disabled, actions, t }) {
  const [draft, setDraft] = (0, import_react.useState)(value === void 0 ? "" : String(value));
  const [invalid, setInvalid] = (0, import_react.useState)(false);
  const [min, max] = DSMM_RATE_LIMIT_BOUNDS[field];
  const key = path.join(".");
  (0, import_react.useEffect)(() => {
    setDraft(value === void 0 ? "" : String(value));
    setInvalid(false);
  }, [value]);
  (0, import_react.useEffect)(() => {
    actions.setFieldInvalid(key, invalid);
    return () => actions.setFieldInvalid(key, false);
  }, [actions.setFieldInvalid, key, invalid]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: id2, children: t("retryField", { name, field: t(RETRY_FIELD_LABEL_KEYS[field]) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives.Input,
      {
        id: id2,
        "data-dsmm-policy-field": field,
        className: "dsmm-input",
        type: "number",
        inputMode: "numeric",
        min,
        max,
        step: 1,
        disabled,
        value: draft,
        placeholder: inherited === void 0 ? t("unknownDefault") : t("inheritNumber", { value: inherited }),
        "aria-invalid": invalid || void 0,
        "aria-describedby": `${id2}-hint${invalid ? ` ${id2}-invalid` : ""}`,
        onChange: (event) => {
          const input = event.currentTarget;
          setDraft(input.value);
          const valid = input.validity.valid && (input.value === "" || Number.isSafeInteger(input.valueAsNumber));
          setInvalid(!valid);
          actions.setFieldInvalid(key, !valid);
          if (valid) actions.editPath(path, input.value === "" ? void 0 : input.valueAsNumber);
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsmm-hint", id: `${id2}-hint`, children: t("retryBounds", { min, max, value: inherited ?? t("unknownDefault") }) }),
    invalid && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { id: `${id2}-invalid`, children: t("invalidNumber") })
  ] });
}
function RouteFields({ value, path, name, catalog, disabled, edit, editRoute, t }) {
  const prefix = (0, import_react.useId)();
  const providers = catalog?.groups ?? [];
  const group = providers.find((candidate) => candidate.id === value.provider);
  const model = group?.models.find((candidate) => candidate.id === value.model);
  const efforts = model?.reasoning?.efforts ?? [];
  const providerListed = group !== void 0;
  const modelListed = model !== void 0;
  const updateModel = (provider, modelId) => {
    editRoute(path, provider, modelId);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-route-fields", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `${prefix}-provider`, children: t("routeProvider", { name }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { id: `${prefix}-provider`, disabled, value: providerListed ? value.provider : MANUAL, onChange: (event) => updateModel(event.currentTarget.value === MANUAL ? "" : event.currentTarget.value, ""), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: MANUAL, children: providerListed ? t("manual") : t("manualValue", { value: value.provider || t("unset") }) }),
        providers.map((provider) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: provider.id, children: [
          provider.name,
          " (",
          provider.id,
          ")"
        ] }, provider.id))
      ] }),
      !providerListed && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Input, { "aria-label": t("manualProvider", { name }), className: "dsmm-input", value: value.provider, disabled, onChange: (event) => updateModel(event.currentTarget.value, value.model) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `${prefix}-model`, children: t("routeModel", { name }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { id: `${prefix}-model`, disabled, value: modelListed ? value.model : MANUAL, onChange: (event) => updateModel(value.provider, event.currentTarget.value === MANUAL ? "" : event.currentTarget.value), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: MANUAL, children: modelListed ? t("manual") : t("manualValue", { value: value.model || t("unset") }) }),
        group?.models.map((candidate) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: candidate.id, children: [
          candidate.name,
          " (",
          candidate.id,
          ")"
        ] }, candidate.id))
      ] }),
      !modelListed && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Input, { "aria-label": t("manualModel", { name }), className: "dsmm-input", value: value.model, disabled, onChange: (event) => updateModel(value.provider, event.currentTarget.value) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `${prefix}-effort`, children: t("routeEffort", { name }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { id: `${prefix}-effort`, disabled, value: value.reasoningEffort ?? "", onChange: (event) => edit([...path, "reasoningEffort"], event.currentTarget.value || void 0), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: t("effortDefault") }),
        value.reasoningEffort !== void 0 && !efforts.some((effort) => effort.id === value.reasoningEffort) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: value.reasoningEffort, children: t("manualValue", { value: value.reasoningEffort }) }),
        efforts.map((effort) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: effort.id, children: [
          effort.name,
          " (",
          effort.id,
          ")"
        ] }, effort.id))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Input, { "aria-label": t("manualEffort", { name }), className: "dsmm-input", value: value.reasoningEffort ?? "", disabled, placeholder: t("effortDefault"), onChange: (event) => edit([...path, "reasoningEffort"], event.currentTarget.value || void 0) })
    ] })
  ] });
}
function PolicyFields({ value, inherited, path, name, disabled, actions, t }) {
  const prefix = (0, import_react.useId)();
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-policy-fields", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `${prefix}-strategy`, children: t("strategy", { name }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { id: `${prefix}-strategy`, disabled, value: value.strategy ?? "", onChange: (event) => actions.editPath([...path, "strategy"], event.currentTarget.value || void 0), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: t("inheritStrategy", { value: inherited?.strategy ?? t("unknownDefault") }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "startup-lock", children: t("startupLock") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "rate-limit-fallback", children: t("rateFallback") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsmm-hint", children: t("strategyHint") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsmm-route-fields", children: Object.keys(DSMM_RATE_LIMIT_BOUNDS).map((field) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RetryNumber, { id: `${prefix}-${field}`, t, name, field, value: value.rateLimit?.[field], inherited: inherited?.rateLimit[field], path: [...path, "rateLimit", field], disabled, actions }, field)) })
  ] });
}
function StructuredEditor({ state, actions, disabled, t }) {
  const prefix = (0, import_react.useId)();
  const [selectedRole, setSelectedRole] = (0, import_react.useState)("dsmm-orchestrator");
  const document2 = state.editor === null ? null : structuredDocument(state.editor.content);
  if (document2 === null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsmm-hint", "data-dsmm-structured-invalid": true, children: t("rawInvalid") });
  const roles = state.snapshot?.roles ?? [];
  const role2 = roles.find((candidate) => candidate.id === selectedRole) ?? roles[0];
  const policy = role2 === void 0 ? void 0 : document2.roleRouting[role2.id] ?? {};
  const baseline = state.snapshot?.editorDefaults;
  let inherited;
  try {
    if (baseline !== void 0) {
      const profileDefaults = { strategy: document2.runtimePolicy.strategy ?? baseline.strategy, rateLimit: normalizeRateLimitPolicy(document2.runtimePolicy.rateLimit, baseline.rateLimit) };
      inherited = { strategy: role2?.runtimePolicy?.strategy ?? profileDefaults.strategy, rateLimit: normalizeRateLimitPolicy(role2?.runtimePolicy?.rateLimit, profileDefaults.rateLimit) };
    }
  } catch {
  }
  const rolePath = ["settings", "roleRouting", role2?.id ?? ""];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-structured", "data-dsmm-structured": true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `${prefix}-label`, children: t("profileLabel") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Input, { id: `${prefix}-label`, className: "dsmm-input", value: document2.label ?? "", disabled, onChange: (event) => actions.editPath(["label"], event.currentTarget.value || void 0) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `${prefix}-active`, children: t("defaultActive") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { id: `${prefix}-active`, disabled, value: document2.settings.defaultActive === void 0 ? "" : String(document2.settings.defaultActive), onChange: (event) => actions.editPath(["settings", "defaultActive"], event.currentTarget.value === "" ? void 0 : event.currentTarget.value === "true"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: t("inherit") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "true", children: t("enabled") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "false", children: t("disabled") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsmm-hint", children: t("activeHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", { children: t("profileDefaults") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PolicyFields, { t, value: document2.runtimePolicy, inherited: baseline, path: ["settings", "runtimePolicy"], name: t("profileDefaults"), disabled, actions })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `${prefix}-role`, children: t("roleSelect") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { id: `${prefix}-role`, disabled: disabled || roles.length === 0 || state.invalidFields.length > 0, value: role2?.id ?? "", onChange: (event) => setSelectedRole(event.currentTarget.value), children: [
        roles.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: t("rolesUnavailable") }),
        roles.map((candidate) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: candidate.id, children: [
          candidate.label,
          candidate.enabled ? "" : ` — ${t("roleDisabled")}`
        ] }, candidate.id))
      ] })
    ] }),
    role2 !== void 0 && policy !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { "data-dsmm-role": role2.id, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", { children: role2.label }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsmm-hint", children: t(role2.enabled ? "roleEnabled" : "roleDisabled") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PolicyFields, { t, value: policy, inherited, path: rolePath, name: role2.label, disabled, actions }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `${prefix}-primary-mode`, children: t("primaryMode", { name: role2.label }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { id: `${prefix}-primary-mode`, disabled, value: policy.primary === void 0 ? "inherit" : "explicit", onChange: (event) => actions.editPath([...rolePath, "primary"], event.currentTarget.value === "inherit" ? void 0 : { provider: "", model: "" }), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "inherit", children: t("inheritRoute") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "explicit", children: t("configuredRoute") })
        ] })
      ] }),
      policy.primary !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RouteFields, { t, value: policy.primary, path: [...rolePath, "primary"], name: t("primaryName", { name: role2.label }), catalog: state.catalog, disabled, edit: actions.editPath, editRoute: actions.editRoute }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsmm-hint", children: t("effortChangeHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `${prefix}-fallback-mode`, children: t("fallbackMode", { name: role2.label }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { id: `${prefix}-fallback-mode`, disabled, value: policy.fallbackRoutes === void 0 ? "inherit" : "explicit", onChange: (event) => actions.editPath([...rolePath, "fallbackRoutes"], event.currentTarget.value === "inherit" ? void 0 : []), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "inherit", children: t("inheritChain") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "explicit", children: t("configuredChain") })
        ] })
      ] }),
      policy.fallbackRoutes?.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsmm-hint", children: t("emptyChain") }),
      policy.fallbackRoutes?.map((candidate, index) => {
        const name = t("fallbackName", { name: role2.label, index: index + 1 });
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", { children: name }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RouteFields, { t, value: candidate, path: [...rolePath, "fallbackRoutes", index], name, catalog: state.catalog, disabled, edit: actions.editPath, editRoute: actions.editRoute }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled: disabled || index === 0, onClick: () => actions.moveFallback(role2.id, index, index - 1), children: t("moveUp", { name }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled: disabled || index === policy.fallbackRoutes.length - 1, onClick: () => actions.moveFallback(role2.id, index, index + 1), children: t("moveDown", { name }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled, onClick: () => actions.editPath([...rolePath, "fallbackRoutes", index], void 0), children: t("removeFallback", { name }) })
          ] })
        ] }, index);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled: disabled || (policy.fallbackRoutes?.length ?? 0) >= 32, onClick: () => {
        if (policy.fallbackRoutes === void 0) actions.editPath([...rolePath, "fallbackRoutes"], [{ provider: "", model: "" }]);
        else actions.editPath([...rolePath, "fallbackRoutes", policy.fallbackRoutes.length], { provider: "", model: "" });
      }, children: t("addFallback", { name: role2.label }) })
    ] })
  ] });
}

// src/client/SessionProfiles.tsx
var import_react2 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/session-labels.ts
function sessionProfileLabels(session, t) {
  const admitted = session.admittedSelection;
  const profile = admitted === void 0 && session.scope === "global-default" ? t("sessionGlobalCaptured") : (admitted ?? session.selection).selectedId === null ? t("sessionBaseline") : t("sessionAdmittedProfile", { id: (admitted ?? session.selection).selectedId, revision: (admitted ?? session.selection).appliedRevision?.slice(0, 12) ?? "—" });
  const future = session.globalDefault;
  return {
    admitted: t("sessionState", { id: session.sessionId, profile, scope: session.scope, epoch: session.admissionEpoch }),
    futureDefault: t("sessionFutureDefault", { profile: future.selectedId === null ? t("sessionBaseline") : t("sessionAdmittedProfile", { id: future.selectedId, revision: future.appliedRevision?.slice(0, 12) ?? "—" }) })
  };
}

// src/client/SessionProfiles.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var MENU_ISSUE_CODES = /* @__PURE__ */ new Set(["validation", "conflict", "not-found", "lock-timeout", "unsafe-path", "io", "activation", "corrupt-selection", "limit", "busy", "maintenance", "disposed", "not-owned", "unavailable", "cancelled", "model-unconfigured", "model-choice-changed", "model-service-unavailable", "model-observation-unavailable", "model-selection-failed"]);
var MENU_ROLE_FIELD = /^(?:settings\.roleRouting\.)?dsmm-(?:orchestrator|planner|plan-critic|builder|reviewer|oracle|oracle-2nd|creative|code-search|doc-search|clarifier|media-reader)(?:\.(?:primary|fallbackRoutes)(?:\[[0-7]\])?(?:\.(?:provider|model|reasoningEffort))?|\.strategy|\.rateLimit(?:\.(?:maxRetries|initialDelayMs|maxDelayMs|maxTotalDelayMs|switchAfterRateLimits|maxSwitches))?)?$/u;
var MENU_COMMON_FIELD = /^(?:version|id|label|content|sessionId|expectedRevision|expectedSelectionRevision|expectedAdmissionEpoch|settings(?:\.(?:defaultActive|roleRouting|workflow|guards|runtimeRecovery|runtimePolicy))?)$/u;
function menuIssue(issue) {
  const code = MENU_ISSUE_CODES.has(issue.code) ? issue.code : issue.kind === "transport" ? "transport" : "unavailable";
  const field = issue.field;
  return { code, ...typeof field === "string" && field.length <= 128 && (MENU_ROLE_FIELD.test(field) || MENU_COMMON_FIELD.test(field)) ? { field } : {} };
}
function SessionScope({ state, actions, t, compact = false }) {
  const prefix = (0, import_react2.useId)();
  const session = state.session;
  const labels = session === null ? null : sessionProfileLabels(session, t);
  const selected = state.snapshot?.profiles.find((profile) => profile.id === state.sessionChoice);
  const disabled = state.busy !== null || state.pendingEditor !== null || state.sessionBusy !== null || state.dirty;
  const allowed = session !== null && session.switchAllowed && /^[a-f0-9]{64}$|^absent$/u.test(session.selection.selectionRevision);
  const status = state.sessionNotice === null ? "" : t(state.sessionNotice === "mode-on" ? "headerModeOn" : state.sessionNotice === "mode-off" ? "headerModeOff" : state.sessionNotice === "applied-with-model" ? "sessionAppliedWithModel" : state.sessionNotice === "applied" ? "sessionApplied" : "sessionResetDone");
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsmm-session-scope", "aria-busy": state.sessionBusy !== null, "data-dsmm-session-scope": true, children: [
    !compact && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { children: t("sessionScope") }),
    state.currentSessionId === null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsmm-hint", children: t("noSession") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      labels !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { "data-dsmm-session-state": true, children: labels.admitted }),
      labels !== null && !compact && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsmm-hint", "data-dsmm-session-future-default": true, children: labels.futureDefault }),
      session !== null && !session.switchAllowed && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsmm-hint", children: t("sessionBusy", { reason: session.switchUnavailableReason ?? "unavailable" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: `${prefix}-choice`, children: t("sessionSelect") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { id: `${prefix}-choice`, value: state.sessionChoice ?? "", disabled: disabled || !allowed, onChange: (event) => actions.chooseSessionProfile(event.currentTarget.value || null), children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: t("sessionBaseline") }),
          state.sessionChoice !== null && selected === void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: state.sessionChoice, children: state.sessionChoice }),
          state.snapshot?.profiles.map((profile) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: profile.id, disabled: profile.revision === null || profile.error !== void 0, children: profile.label === void 0 ? profile.id : `${profile.label} (${profile.id})` }, profile.id))
        ] })
      ] }),
      state.dirty && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsmm-hint", children: t("sessionDirty") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { type: "button", variant: "outline", disabled: disabled || !allowed || state.sessionChoice !== null && selected?.revision == null, onClick: () => {
          void actions.applySession();
        }, children: t(state.sessionBusy === "apply" ? "sessionApplying" : "sessionApply") }),
        !compact && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { type: "button", variant: "outline", disabled: disabled || !allowed, onClick: () => {
          void actions.resetSession();
        }, children: t(state.sessionBusy === "reset" ? "sessionResetting" : "sessionReset") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { type: "button", variant: "outline", disabled: state.sessionBusy !== null || state.busy !== null || state.pendingEditor !== null, onClick: () => {
          void actions.refreshSession();
        }, children: t("sessionRefresh") })
      ] }),
      !compact && session?.rolePolicy !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { "data-dsmm-session-policy": true, children: t("roleState", { route: session.rolePolicy.route === void 0 ? t("inheritRoute") : `${session.rolePolicy.route.provider}/${session.rolePolicy.route.model}${session.rolePolicy.route.reasoningEffort === void 0 ? "" : ` (${session.rolePolicy.route.reasoningEffort})`}`, strategy: session.rolePolicy.strategy, retries: session.rolePolicy.retries, failures: session.rolePolicy.rateLimitFailures, switches: session.rolePolicy.switches, delay: session.rolePolicy.totalDelayMs }) })
    ] }),
    state.sessionIssue !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { role: "alert", children: state.sessionIssue.source === "profile-model" ? t(state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed") : state.sessionIssue.code === "conflict" ? t("sessionConflict") : ["busy", "maintenance", "disposed", "not-owned"].includes(state.sessionIssue.code) ? t("sessionBusy", { reason: state.sessionIssue.code }) : t(state.sessionIssue.code === "validation" ? "validation" : "sessionUnavailable") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", "aria-atomic": "true", children: state.sessionBusy === "read" ? t("reading") : status })
  ] });
}
function SessionProfiles(props) {
  const prefix = (0, import_react2.useId)();
  const state = props.useProfiles((snapshot2) => snapshot2);
  const id2 = state.currentSessionId;
  const [openFor, setOpenFor] = (0, import_react2.useState)(void 0);
  (0, import_react2.useEffect)(() => {
    setOpenFor(void 0);
  }, [id2]);
  if (props.sessionId !== void 0 && props.sessionId !== id2) return null;
  const { t } = props;
  const session = state.session;
  const admission = session?.admittedSelection ?? (session?.scope === "global-default" ? void 0 : session?.selection);
  const unknownCaptured = session !== null && admission === void 0;
  const current = session === null ? "__dsmm_session_unavailable__" : unknownCaptured ? "__dsmm_captured_default__" : admission?.selectedId ?? "";
  const profiles = state.snapshot?.profiles ?? [];
  const currentSaved = profiles.find((profile) => profile.id === current);
  const committing = state.sessionBusy !== null;
  const disabled = id2 === null || committing || state.busy !== null || state.pendingEditor !== null || state.dirty || state.invalidFields.length > 0 || session === null || !session.switchAllowed || state.snapshot === null;
  let feedback = "";
  if (state.sessionIssue !== null) feedback = t(state.sessionIssue.source === "profile-model" ? state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed" : state.sessionIssue.code === "conflict" ? "headerConflict" : state.sessionIssue.code === "activation" ? "headerActivationRefused" : state.sessionIssue.code === "maintenance" ? "headerMaintenanceRefused" : state.sessionIssue.code === "busy" ? "headerBusyRefused" : state.sessionIssue.code === "cancelled" ? "headerCancelledRefused" : state.sessionIssue.code === "unavailable" || state.sessionIssue.kind === "assembly" ? "headerUnavailableRefused" : "headerSelectionRefused");
  else if (committing || state.busy !== null) feedback = t(state.sessionBusy === "apply" || state.sessionBusy === "reset" ? "headerApplying" : "headerLoading");
  else if (state.dirty || state.invalidFields.length > 0 || state.pendingEditor !== null) feedback = t("headerDraft");
  else if (id2 === null) feedback = t("headerNoSession");
  else if (session === null || state.snapshot === null) feedback = t("headerUnavailable");
  else if (!session.switchAllowed) feedback = t("headerBusy");
  else if (state.sessionNotice !== null) feedback = t(state.sessionNotice === "mode-on" ? "headerModeOn" : state.sessionNotice === "mode-off" ? "headerModeOff" : state.sessionNotice === "applied-with-model" ? "headerAppliedWithModel" : "headerApplied");
  const profileName = unknownCaptured ? t("headerCaptured") : currentSaved?.label === void 0 ? admission?.selectedId ?? t("sessionBaseline") : `${currentSaved.label} (${currentSaved.id})`;
  const currentLabel = t("headerCurrentProfile", { profile: session === null ? t("headerUnavailable") : profileName });
  const entries = [{ type: "label", id: "@current", text: currentLabel }];
  if (id2 === null && state.snapshot !== null) entries.push({ type: "label", id: "@future", text: t("sessionFutureDefault", { profile: state.snapshot.profiles.find((profile) => profile.id === state.snapshot.selectedId)?.label ?? state.snapshot.selectedId ?? t("sessionBaseline") }) });
  if (feedback !== "" && (state.sessionNotice === null || state.sessionIssue !== null)) entries.push({ type: "label", id: "@status", text: feedback });
  const mode = session?.deepwork;
  entries.push({
    id: "@mode",
    label: t(mode === void 0 ? "headerModeUnavailable" : mode.locked ? "headerModePreset" : mode.active ? "headerModeDisable" : "headerModeEnable"),
    disabled: id2 === null || committing || state.busy !== null || session === null || !session.switchAllowed || mode === void 0 || mode.locked
  });
  const diagnostic = state.sessionIssue === null ? null : menuIssue(state.sessionIssue);
  const diagnosticText = diagnostic === null ? "" : t("headerIssueCode", { code: diagnostic.code }) + (diagnostic.field === void 0 ? "" : ` ${t("headerIssueField", { field: diagnostic.field })}`);
  const retryHint = t(diagnostic?.code === "maintenance" || diagnostic?.code === "busy" ? "headerWaitRetryHint" : "headerRetryHint");
  if (diagnostic !== null) entries.push({ type: "label", id: "@diagnostic", text: diagnosticText }, { type: "label", id: "@retry", text: retryHint });
  if (admission?.selectedId != null && currentSaved === void 0) entries.push({ id: admission.selectedId, label: `${admission.selectedId} — ${t("headerSavedUnavailable")}`, disabled: true });
  if (unknownCaptured) entries.push({ id: "__dsmm_captured_default__", label: t("headerCaptured"), disabled: true });
  entries.push({ type: "separator", id: "@keep-separator" }, { type: "label", id: "@keep-heading", text: t("headerCompactProfiles") }, { id: "", label: t("sessionBaseline"), disabled });
  for (const profile of profiles) entries.push({ id: profile.id, label: (profile.label ?? profile.id) + (profile.error === void 0 && profile.revision !== null ? "" : ` — ${t("headerSavedUnavailable")}`), disabled: disabled || profile.revision === null || profile.error !== void 0 });
  entries.push({ type: "separator", id: "@model-separator" }, { id: "@use-model", label: t("headerUseCurrentModel"), disabled: disabled || session?.profileModel === void 0 });
  const open = openFor === id2;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsmm-header-profiles", "data-dsmm-header-profile": true, "aria-busy": committing, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives2.Menu,
      {
        open,
        autoFocus: true,
        portal: true,
        align: "start",
        className: "dsmm-profile-anchor",
        listClassName: "dsmm-profile-menu",
        items: entries,
        selectedId: current,
        footer: [{ id: "@refresh", label: t("headerCompactRefresh"), disabled: committing || state.busy !== null }],
        anchor: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { type: "button", size: "sm", variant: "toolbar", className: "dsmm-profile-trigger", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconBranchOutlineRegular, {}), "aria-label": t("headerProfileLabel"), "aria-haspopup": "menu", "aria-expanded": open, "aria-describedby": `${prefix}-feedback`, onClick: () => setOpenFor(open ? void 0 : id2) }),
        onClose: () => setOpenFor(void 0),
        onSelect: (value) => {
          if (props.readProfileView().currentSessionId !== id2) return;
          if (value === "@refresh") {
            if (committing || state.busy !== null) return;
            void (async () => {
              await props.refresh();
              if (id2 !== null && props.readProfileView().currentSessionId === id2) await props.refreshSession();
            })();
          } else {
            const row = entries.find((entry) => entry.id === value && !("type" in entry));
            if (row === void 0 || !("disabled" in row) || row.disabled) return;
            if (value === "@mode") {
              if (mode !== void 0) void props.setDeepwork(!mode.active);
            } else if (value === "@use-model") void props.useSessionProfileModel();
            else {
              props.chooseSessionProfile(value || null);
              void props.applySession();
            }
          }
          setOpenFor(void 0);
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dsmm-profile-announcement", id: `${prefix}-feedback`, role: state.sessionIssue === null ? "status" : "alert", "aria-live": "polite", "aria-atomic": "true", children: [
      feedback || currentLabel,
      diagnostic === null ? "" : ` ${diagnosticText} ${retryHint}`
    ] })
  ] });
}

// src/client/ProfilesSection.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function issueKey(issue) {
  if (issue.source === "selection") return issue.code === "conflict" ? "selectionConflict" : "appliedInvalid";
  if (issue.kind === "assembly") return "unavailable";
  if (issue.kind === "transport") return "transport";
  return issue.code === "conflict" || issue.code === "validation" ? issue.code : "io";
}
function ProfilesSection(props) {
  const { t } = props;
  const state = props.useProfiles((snapshot3) => snapshot3);
  const prefix = (0, import_react3.useId)();
  const selectRef = (0, import_react3.useRef)(null);
  const inputRef = (0, import_react3.useRef)(null);
  const editorRef = (0, import_react3.useRef)(null);
  const cancelRef = (0, import_react3.useRef)(null);
  const hadConfirmation = (0, import_react3.useRef)(false);
  const disabled = state.busy !== null || state.pendingEditor !== null || state.sessionBusy === "apply" || state.sessionBusy === "reset";
  const snapshot2 = state.snapshot;
  const editor = state.editor;
  const reconcilable = canReconcileSelection(snapshot2);
  const selectionConflict = reconcilable && snapshot2?.selectionError?.code === "conflict";
  const invalid = state.issue?.kind === "domain" && state.issue.code === "validation";
  const idInvalid = invalid && state.issue?.field === "id";
  const rawInvalid = editor !== null && structuredDocument(editor.content) === null;
  (0, import_react3.useEffect)(() => {
    if (state.pendingEditor !== null) {
      cancelRef.current?.focus();
      hadConfirmation.current = true;
    } else if (hadConfirmation.current) {
      selectRef.current?.focus();
      hadConfirmation.current = false;
    }
  }, [state.pendingEditor]);
  (0, import_react3.useEffect)(() => {
    if (state.issue?.kind === "domain" && state.issue.code === "validation") {
      if (state.issue.field === "id") inputRef.current?.focus();
      else editorRef.current?.focus();
    }
  }, [state.issue]);
  const applied = editor?.revision !== null && editor?.id === snapshot2?.selectedId && editor?.revision === snapshot2?.appliedRevision;
  let selection = t("baseline");
  if (snapshot2?.selectionError !== void 0 && !selectionConflict) selection = t("appliedInvalid");
  else if (snapshot2?.selectedId !== null && snapshot2?.selectedId !== void 0) selection = t("appliedProfile", { id: snapshot2.selectedId, revision: snapshot2.appliedRevision?.slice(0, 12) ?? "—" });
  const notice = state.notice === null ? "" : t(state.notice.key === "reset" ? "resetDone" : state.notice.key, { id: state.notice.id });
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "dsmm-profiles", "aria-labelledby": `${prefix}-title`, "aria-busy": state.busy !== null, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { id: `${prefix}-title`, children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: t("description") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { id: `${prefix}-global`, children: t("globalScope") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-hint", children: t("newSessions") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { "data-dsmm-selection": true, children: selection }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled: disabled || snapshot2 === null, onClick: () => {
        void props.create();
      }, children: t("new") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled, onClick: () => {
        void props.refresh();
      }, children: t(state.busy === "refresh" ? "refreshing" : "refresh") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled: disabled || !reconcilable || snapshot2?.selectedId === null && !selectionConflict, onClick: () => {
        void props.reset();
      }, children: t(state.busy === "reset" ? "resetting" : "reset") })
    ] }),
    snapshot2 !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-select`, children: t("editorSelect") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { ref: selectRef, id: `${prefix}-select`, disabled, value: editor?.revision == null ? "" : editor.id, onChange: (event) => {
        if (event.currentTarget.value) void props.open(event.currentTarget.value);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: t(editor?.revision === null ? "newDraft" : "choose") }),
        snapshot2.profiles.map((profile, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: profile.id, children: [
          profile.label === void 0 ? profile.id : `${profile.label} (${profile.id})`,
          profile.error === void 0 ? "" : ` — ${t("invalidProfile", { id: profile.id })}`
        ] }, `${index}:${profile.id}`))
      ] }),
      snapshot2.profiles.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-hint", children: t("empty") })
    ] }),
    state.pendingEditor !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-confirm", role: "group", "aria-labelledby": `${prefix}-confirm`, onKeyDown: (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.cancelDiscard();
      }
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { id: `${prefix}-confirm`, children: t("discardPrompt") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", onClick: () => {
          void props.discardAndOpen();
        }, children: t("discard") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { ref: cancelRef, type: "button", variant: "primary", onClick: props.cancelDiscard, children: t("cancel") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SessionScope, { state, actions: props, t }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-catalog", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { children: t("catalogTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-hint", children: t("catalogHint") }),
      state.catalogUnavailable && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-hint", children: t("catalogUnavailable") }),
      state.catalog?.failures.map((failure) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-hint", children: t("catalogFailure", { name: failure.name, id: failure.id }) }, failure.id)),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled: state.catalogBusy, onClick: () => {
        void props.refreshCatalog();
      }, children: t(state.catalogBusy ? "catalogRefreshing" : "catalogRefresh") })
    ] }),
    editor !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-editor", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-id`, children: t("profileId") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Input, { ref: inputRef, id: `${prefix}-id`, className: "dsmm-input", value: editor.id, disabled: disabled || editor.revision !== null, "aria-invalid": idInvalid || void 0, "aria-describedby": `${prefix}-id-hint${idInvalid ? ` ${prefix}-issue` : ""}`, onChange: (event) => props.editId(event.currentTarget.value) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { id: `${prefix}-id-hint`, className: "dsmm-hint", children: t("idHint") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(StructuredEditor, { state, actions: props, disabled, t }, state.editorEpoch),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("details", { className: "dsmm-advanced", open: true, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("summary", { children: t("advanced") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-content`, children: t("configuration") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("textarea", { ref: editorRef, id: `${prefix}-content`, rows: 12, spellCheck: false, value: editor.content, disabled, "aria-invalid": rawInvalid || invalid && !idInvalid || void 0, "aria-describedby": `${prefix}-content-hint ${prefix}-structural-hint${invalid && !idInvalid ? ` ${prefix}-issue` : ""}`, onChange: (event) => props.editContent(event.currentTarget.value) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { id: `${prefix}-content-hint`, className: "dsmm-hint", children: t("configurationHint") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { id: `${prefix}-structural-hint`, className: "dsmm-hint", children: t("structuralHint") })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { "data-dsmm-editor-state": true, children: t(state.dirty ? "dirty" : applied ? "savedApplied" : "savedNotApplied") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { id: `${prefix}-global-action`, className: "dsmm-hint", children: t("globalActionHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "primary", disabled: disabled || !state.dirty || snapshot2 === null || state.invalidFields.length > 0, onClick: () => {
          void props.save();
        }, children: t(state.busy === "save" ? "saving" : "save") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", "aria-describedby": `${prefix}-global-action`, disabled: disabled || state.dirty || editor.revision === null || !reconcilable || applied && !selectionConflict, onClick: () => {
          void props.apply();
        }, children: t(state.busy === "apply" ? "applying" : "apply") }),
        editor.revision !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled, onClick: () => {
          void props.reload();
        }, children: t("reload") })
      ] })
    ] }),
    state.issue !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-issue", id: `${prefix}-issue`, role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: t(issueKey(state.issue)) }),
      state.issue.kind === "domain" && state.issue.message !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { children: [
        t("details"),
        ": ",
        state.issue.message
      ] })
    ] }),
    snapshot2?.selectionError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-issue", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { children: [
        t("details"),
        ": ",
        snapshot2.selectionError.message
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: t(selectionConflict ? "selectionConflict" : "retry") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", "aria-atomic": "true", children: state.busy === "refresh" && snapshot2 === null ? t("loading") : state.busy === "read" ? t("reading") : notice })
  ] });
}

// src/client/styles.ts
var PROFILE_STYLES = `
.dsmm-profiles{width:100%;max-width:760px;min-width:0;display:flex;flex-direction:column;gap:12px;font-family:var(--dsw-font-family);font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}
.dsmm-profiles h2{margin:0;font-size:18px;font-weight:600}
.dsmm-profiles h3,.dsmm-profiles legend{margin:0;font-size:14px;font-weight:500;line-height:22px}
.dsmm-profiles :is(label,legend,summary){min-width:0;max-width:100%;overflow-wrap:anywhere}
.dsmm-profiles :is(.dsmm-structured,.dsmm-session-scope,.dsmm-catalog,.dsmm-policy-fields){min-width:0;display:flex;flex-direction:column;gap:12px}
.dsmm-profiles fieldset{min-width:0;margin:0;padding:12px;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);display:flex;flex-direction:column;gap:12px}
.dsmm-profiles .dsmm-route-fields{display:flex;flex-wrap:wrap;gap:12px;min-width:0}
.dsmm-profiles .dsmm-route-fields>.dsmm-field{flex:1 1 240px;max-width:100%}
.dsmm-profiles .dsmm-route-fields select{width:100%}
.dsmm-profiles summary{cursor:pointer;color:var(--dsw-alias-label-primary);min-height:32px;line-height:32px}
.dsmm-profiles summary:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.dsmm-profiles .dsmm-advanced[open]>div{margin-top:8px}
.dsmm-header-profiles{display:inline-flex;align-items:center;min-width:0;font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary)}
.dsmm-header-profiles .dsmm-profile-trigger{width:28px;height:28px;min-height:28px;padding:6px;justify-content:center}
.dsmm-profile-trigger:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.dsmm-profile-menu{font-family:var(--dsw-font-family);font-size:14px;line-height:22px;max-width:calc(100vw - 24px);color:var(--dsw-alias-label-primary)}
.dsmm-profile-menu [role=presentation]{font:inherit;white-space:normal;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary)}
.dsmm-profile-menu [role=menuitem]{font:inherit}
.dsmm-profile-menu [role=menuitem]>span{white-space:normal;overflow-wrap:anywhere}
.dsmm-profile-announcement{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.dsmm-profiles p{margin:0;overflow-wrap:anywhere}
.dsmm-profiles .dsmm-hint{color:var(--dsw-alias-label-secondary)}
.dsmm-profiles .dsmm-field{min-width:0;display:flex;flex-direction:column;gap:6px}
.dsmm-profiles .dsmm-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.dsmm-profiles button{max-width:100%;white-space:normal;overflow-wrap:anywhere;min-height:36px;height:auto}
.dsmm-profiles .dsmm-input{width:100%;min-width:0;box-sizing:border-box;border-color:var(--dsw-alias-label-secondary)}
.dsmm-profiles .dsmm-input input{width:100%;min-width:0;font:inherit;color:inherit}
.dsmm-profiles select,.dsmm-profiles textarea{box-sizing:border-box;min-width:0;max-width:100%;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-md)}
.dsmm-profiles select{width:240px;height:32px;padding:0 10px;text-overflow:ellipsis}
.dsmm-profiles textarea{width:100%;padding:12px;font-family:var(--ds-font-family-code);resize:vertical;overflow:auto;white-space:pre;}
.dsmm-profiles select:hover:not(:disabled),.dsmm-profiles textarea:hover:not(:disabled){border-color:var(--dsw-alias-label-primary)}
.dsmm-profiles select:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.dsmm-profiles :is(select,textarea,button):focus-visible,.dsmm-profiles .dsmm-input:has(input:focus-visible){outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.dsmm-profiles :is(select,textarea):disabled{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform);cursor:not-allowed}
.dsmm-profiles .dsmm-editor,.dsmm-profiles .dsmm-confirm{min-width:0;display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform)}
.dsmm-profiles .dsmm-issue{padding:12px;border-left:4px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.dsmm-profiles .dsmm-issue p+p{margin-top:8px}
.dsmm-profiles .dsmm-status{min-height:22px}
@media(prefers-reduced-motion:reduce){.dsmm-profiles *{transition:none!important;animation:none!important}}
`;

// src/client/index.ts
var inject = ["slots", "locale", "remote"];
async function apply(ctx) {
  await ctx.remote.$mount(TYPERT_REMOTE);
  await ctx.inject(["remote.dsmmProfiles"], (profileCtx) => {
    const controller = new ProfilesController(profileCtx.remote.dsmmProfiles);
    profileCtx.effect(() => () => controller.dispose(), "dsmm: profile editor");
    profileCtx.effect(() => profileCtx.locale.register(NS, { en, zh }), "dsmm: profile locale");
    profileCtx.effect(() => {
      const style = document.createElement("style");
      style.dataset.dsmmProfiles = "";
      style.textContent = PROFILE_STYLES;
      document.head.append(style);
      return () => style.remove();
    }, "dsmm: profile styles");
    const t = profileCtx.locale.bind(NS);
    profileCtx.slots.inject("settings.section", () => profileCtx.slots.register({
      name: "settings.section",
      id: "dsmm-profiles",
      order: 30,
      label: () => t("title"),
      locale: NS,
      inject: () => ({ hooks: { profiles: controller.store }, ...controller.actions })
    }, ProfilesSection));
    profileCtx.slots.inject("conversation.header.leading", () => profileCtx.slots.register({
      name: "conversation.header.leading",
      priority: Number.MAX_SAFE_INTEGER,
      locale: NS,
      inject: () => ({ hooks: { profiles: controller.store }, readProfileView: controller.store.getSnapshot, ...controller.actions })
    }, SessionProfiles));
    void profileCtx.inject(["remote.session"], (catalogCtx) => {
      controller.attachCatalog(catalogCtx.remote.session);
      controller.attachModelSelector(catalogCtx.remote.session);
      catalogCtx.effect(() => () => {
        controller.attachModelSelector(null);
        controller.attachCatalog(null);
      }, "dsmm: native catalog/selector lifetime");
    });
    void profileCtx.inject(["uiSession", "sessions"], (sessionCtx) => {
      const source = sessionCtx.uiSession.adapter.current;
      const nativeSessions = sessionCtx.sessions;
      const update = () => {
        const binding = source.getSnapshot();
        controller.setSession(binding.key ?? null);
        controller.attachModelSelectionSource(binding.key ?? null, binding.key === void 0 ? null : binding.keyedHooks.projection?.("modelSelection") ?? null);
        controller.attachModelEventSource(binding.key ?? null, binding.key === void 0 ? null : nativeSessions.binding(binding.key)?.eventSource ?? null);
      };
      update();
      sessionCtx.effect(() => source.subscribe(update), "dsmm: current native session");
      sessionCtx.effect(() => () => {
        controller.attachModelSelectionSource(null, null);
        controller.attachModelEventSource(null, null);
        controller.attachModelInteractionSource(null, null);
        controller.setSession(null);
      }, "dsmm: native session withdrawal");
      void sessionCtx.inject(["modelDirectories", "remote.session"], (modelCtx) => {
        const updateInteraction = () => {
          const id2 = source.getSnapshot().key;
          if (id2 === void 0 || nativeSessions.binding(id2) === void 0) {
            controller.attachModelInteractionSource(null, null);
            return;
          }
          try {
            controller.attachModelInteractionSource(id2, modelCtx.modelDirectories.directoryFor(id2).store);
          } catch {
            controller.attachModelInteractionSource(null, null);
          }
        };
        updateInteraction();
        modelCtx.effect(() => source.subscribe(updateInteraction), "dsmm: native model interaction binding");
        modelCtx.effect(() => () => controller.attachModelInteractionSource(null, null), "dsmm: native model interaction withdrawal");
      });
    });
    void controller.refresh();
  });
}
return module.exports; } });
