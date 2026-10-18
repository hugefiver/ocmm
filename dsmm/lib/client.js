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
var __copyProps = (to, from2, except, desc) => {
  if (from2 && typeof from2 === "object" || typeof from2 === "function") {
    for (let key of __getOwnPropNames(from2))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from2[key], enumerable: !(desc = __getOwnPropDesc(from2, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  ChildrenController: () => ChildrenController,
  ChildrenPanel: () => ChildrenPanel,
  NEW_PROFILE_CONTENT: () => NEW_PROFILE_CONTENT,
  NS: () => NS,
  ProfilesController: () => ProfilesController,
  ProfilesSection: () => ProfilesSection,
  ROLE_CONTROL_REMOTE: () => ROLE_CONTROL_REMOTE,
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

// src/route-json.ts
var MAX_ROUTE_BYTES = 128 * 1024;
var hostFields = new Set([
  "provider",
  "model",
  "messages",
  "tools",
  "toolHistory",
  "system",
  "input",
  "agent",
  "agentId",
  "role",
  "roleId",
  "session",
  "sessionId",
  "signal",
  "permission",
  "permissions",
  "auth",
  "authorization",
  "apiKey",
  "apiKeyEnv",
  "credentials",
  "headers",
  "endpoint",
  "apiEndpoint",
  "baseURL",
  "url",
  "fetch",
  "onPayload",
  "callbacks",
  "stream",
  "stream_options",
  "tool_choice",
  "parallel_tool_calls",
  "functions",
  "function_call",
  "timeout",
  "timeoutMs",
  "transport",
  "transformHeaders",
  "onResponse",
  "context",
  "systemPromptUpdate",
  "toolUpdate",
  "adapterDefaults",
  "readOnly",
  "toolFilter",
  "authorityCeiling",
  "guards",
  "roleRouting",
  "runtimePolicy",
  "runtimePolicyCapture",
  "subagents",
  "allowRouteOverride",
  "maxDepth",
  "toolTopology",
  "profilePin",
  "originalAdmissionEpoch",
  "admissionEpoch",
  "childSessionId",
  "parentSessionId"
].map(parameterKey));
var aliases = [
  ["reasoningEffort", "reasoning_effort"],
  ["maxTokens", "max_tokens", "max_completion_tokens", "max_output_tokens"]
];
function parameterKey(key) {
  return key.toLowerCase().replace(/[-_]/gu, "");
}
function fail() {
  throw new TypeError("Model routes must contain bounded plain JSON and valid route fields");
}
var routeFields = /* @__PURE__ */ new Set(["provider", "model", "temperature", "stop", ...aliases.flat()]);
function validateModelRouteFieldName(key) {
  if (["__proto__", "prototype", "constructor"].includes(key)) fail();
  if (routeFields.has(key)) return;
  if (hostFields.has(parameterKey(key)) || [...routeFields].some((field) => parameterKey(field) === parameterKey(key))) fail();
}
function copyRouteJson(input) {
  const active = /* @__PURE__ */ new Set();
  const copy = (value, depth2) => {
    if (depth2 > 32) fail();
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (new TextDecoder("utf-8", { ignoreBOM: true }).decode(new TextEncoder().encode(value)) !== value) fail();
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) return value;
    if (typeof value !== "object" || value === null || active.has(value)) fail();
    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail();
    if (Object.getOwnPropertySymbols(value).length) fail();
    active.add(value);
    const result2 = Array.isArray(value) ? [] : {};
    for (const [key, descriptor4] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (Array.isArray(value) && key === "length") continue;
      if (new TextDecoder("utf-8", { ignoreBOM: true }).decode(new TextEncoder().encode(key)) !== key || ["__proto__", "prototype", "constructor"].includes(key) || !Object.hasOwn(descriptor4, "value") || !descriptor4.enumerable) fail();
      if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/u.test(key)) fail();
      Reflect.set(result2, key, copy(descriptor4.value, depth2 + 1));
    }
    if (Array.isArray(value) && Object.keys(result2).length !== value.length) fail();
    active.delete(value);
    return result2;
  };
  const result = copy(input, 0);
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_ROUTE_BYTES) fail();
  return result;
}
function boundedText(value, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail();
}
function normalizeModelRouteJson(input, sparse = false, allowIdentityWhitespace = false) {
  const route3 = copyRouteJson(input);
  if (route3 === null || typeof route3 !== "object" || Array.isArray(route3)) fail();
  const row = route3;
  if (!sparse && (!Object.hasOwn(row, "provider") || !Object.hasOwn(row, "model"))) fail();
  for (const key of Object.keys(row)) {
    validateModelRouteFieldName(key);
    const value = row[key];
    if (key === "provider") {
      boundedText(value, 128);
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(allowIdentityWhitespace ? value.trim() : value)) fail();
    } else if (key === "model") {
      boundedText(value, 512);
      if (value.includes("://")) fail();
    } else if (key === "reasoningEffort" || key === "reasoning_effort") {
      boundedText(value, 64);
    } else if (key === "temperature") {
      if (typeof value !== "number") fail();
    } else if (aliases[1].includes(key)) {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) fail();
    } else if (key === "stop") {
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) fail();
    }
  }
  for (const group of aliases) if (group.filter((key) => Object.hasOwn(row, key)).length > 1) fail();
  return row;
}

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

// src/modules.ts
var DSMM_MODULE_DESCRIPTORS = Object.freeze([
  Object.freeze({ id: "deepwork", label: "Deepwork", key: "modules.deepwork.enabled" }),
  Object.freeze({ id: "permission-control", label: "Permission control", key: "permissionControl.enabled" })
]);

// src/model-parameter-policy.ts
var passthrough = Object.freeze({ mode: "passthrough" });
var nativeDefaults = Object.freeze({ mode: "native-defaults" });
var legacy = Object.freeze({ mode: "legacy-native-v1" });
function parseModelParameterPolicy(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("mode" in value)) throw new TypeError("Invalid model parameter policy");
  switch (value.mode) {
    case "passthrough":
      return passthrough;
    case "native-defaults":
      return nativeDefaults;
    case "legacy-native-v1":
      return legacy;
    default:
      throw new TypeError("Invalid model parameter policy");
  }
}

// src/profile-types.ts
var DSMM_ROUTE_SOURCES = ["inherited", "primary", "level", "invocation-route"];

// ../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/scanner.js
function createScanner(text5, ignoreTrivia = false) {
  const len = text5.length;
  let pos = 0, value = "", tokenOffset = 0, token = 16, lineNumber = 0, lineStartOffset = 0, tokenLineStartOffset = 0, prevTokenLineStartOffset = 0, scanError = 0;
  function scanHexDigits(count, exact) {
    let digits = 0;
    let value2 = 0;
    while (digits < count || !exact) {
      let ch = text5.charCodeAt(pos);
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
    if (text5.charCodeAt(pos) === 48) {
      pos++;
    } else {
      pos++;
      while (pos < text5.length && isDigit(text5.charCodeAt(pos))) {
        pos++;
      }
    }
    if (pos < text5.length && text5.charCodeAt(pos) === 46) {
      pos++;
      if (pos < text5.length && isDigit(text5.charCodeAt(pos))) {
        pos++;
        while (pos < text5.length && isDigit(text5.charCodeAt(pos))) {
          pos++;
        }
      } else {
        scanError = 3;
        return text5.substring(start, pos);
      }
    }
    let end = pos;
    if (pos < text5.length && (text5.charCodeAt(pos) === 69 || text5.charCodeAt(pos) === 101)) {
      pos++;
      if (pos < text5.length && text5.charCodeAt(pos) === 43 || text5.charCodeAt(pos) === 45) {
        pos++;
      }
      if (pos < text5.length && isDigit(text5.charCodeAt(pos))) {
        pos++;
        while (pos < text5.length && isDigit(text5.charCodeAt(pos))) {
          pos++;
        }
        end = pos;
      } else {
        scanError = 3;
      }
    }
    return text5.substring(start, end);
  }
  function scanString() {
    let result = "", start = pos;
    while (true) {
      if (pos >= len) {
        result += text5.substring(start, pos);
        scanError = 2;
        break;
      }
      const ch = text5.charCodeAt(pos);
      if (ch === 34) {
        result += text5.substring(start, pos);
        pos++;
        break;
      }
      if (ch === 92) {
        result += text5.substring(start, pos);
        pos++;
        if (pos >= len) {
          scanError = 2;
          break;
        }
        const ch2 = text5.charCodeAt(pos++);
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
          result += text5.substring(start, pos);
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
    let code = text5.charCodeAt(pos);
    if (isWhiteSpace(code)) {
      do {
        pos++;
        value += String.fromCharCode(code);
        code = text5.charCodeAt(pos);
      } while (isWhiteSpace(code));
      return token = 15;
    }
    if (isLineBreak(code)) {
      pos++;
      value += String.fromCharCode(code);
      if (code === 13 && text5.charCodeAt(pos) === 10) {
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
        if (text5.charCodeAt(pos + 1) === 47) {
          pos += 2;
          while (pos < len) {
            if (isLineBreak(text5.charCodeAt(pos))) {
              break;
            }
            pos++;
          }
          value = text5.substring(start, pos);
          return token = 12;
        }
        if (text5.charCodeAt(pos + 1) === 42) {
          pos += 2;
          const safeLength = len - 1;
          let commentClosed = false;
          while (pos < safeLength) {
            const ch = text5.charCodeAt(pos);
            if (ch === 42 && text5.charCodeAt(pos + 1) === 47) {
              pos += 2;
              commentClosed = true;
              break;
            }
            pos++;
            if (isLineBreak(ch)) {
              if (ch === 13 && text5.charCodeAt(pos) === 10) {
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
          value = text5.substring(start, pos);
          return token = 13;
        }
        value += String.fromCharCode(code);
        pos++;
        return token = 16;
      // numbers
      case 45:
        value += String.fromCharCode(code);
        pos++;
        if (pos === len || !isDigit(text5.charCodeAt(pos))) {
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
          code = text5.charCodeAt(pos);
        }
        if (tokenOffset !== pos) {
          value = text5.substring(tokenOffset, pos);
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
  function addEdit(text5, startOffset, endOffset) {
    if (!hasError && (!range || startOffset < rangeEnd && endOffset > rangeStart) && documentText.substring(startOffset, endOffset) !== text5) {
      editOperations.push({ offset: startOffset, length: endOffset - startOffset, content: text5 });
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
function getEOL(options, text5) {
  for (let i = 0; i < text5.length; i++) {
    const ch = text5.charAt(i);
    if (ch === "\r") {
      if (i + 1 < text5.length && text5.charAt(i + 1) === "\n") {
        return "\r\n";
      }
      return "\r";
    } else if (ch === "\n") {
      return "\n";
    }
  }
  return options && options.eol || "\n";
}
function isEOL(text5, offset) {
  return "\r\n".indexOf(text5.charAt(offset)) !== -1;
}

// ../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/parser.js
var ParseOptions;
(function(ParseOptions2) {
  ParseOptions2.DEFAULT = {
    allowTrailingComma: false
  };
})(ParseOptions || (ParseOptions = {}));
function parse(text5, errors = [], options = ParseOptions.DEFAULT) {
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
      const object3 = {};
      onValue(object3);
      previousParents.push(currentParent);
      currentParent = object3;
      currentProperty = null;
    },
    onObjectProperty: (name) => {
      currentProperty = name;
    },
    onObjectEnd: () => {
      currentParent = previousParents.pop();
    },
    onArrayBegin: () => {
      const array2 = [];
      onValue(array2);
      previousParents.push(currentParent);
      currentParent = array2;
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
  visit(text5, visitor, options);
  return currentParent[0];
}
function parseTree(text5, errors = [], options = ParseOptions.DEFAULT) {
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
  visit(text5, visitor, options);
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
function visit(text5, visitor, options = ParseOptions.DEFAULT) {
  const _scanner = createScanner(text5, false);
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
function setProperty(text5, originalPath, value, options) {
  const path = originalPath.slice();
  const errors = [];
  const root = parseTree(text5, errors);
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
    return withFormatting(text5, { offset: root ? root.offset : 0, length: root ? root.length : 0, content: JSON.stringify(value) }, options);
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
        return withFormatting(text5, { offset: removeBegin, length: removeEnd - removeBegin, content: "" }, options);
      } else {
        return withFormatting(text5, { offset: existing.offset, length: existing.length, content: JSON.stringify(value) }, options);
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
      return withFormatting(text5, edit, options);
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
      return withFormatting(text5, edit, options);
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
      return withFormatting(text5, edit, options);
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
      return withFormatting(text5, edit, options);
    } else {
      throw new Error(`Can not ${value === void 0 ? "remove" : options.isArrayInsertion ? "insert" : "modify"} Array index ${insertIndex} as length is not sufficient`);
    }
  } else {
    throw new Error(`Can not add ${typeof lastSegment !== "number" ? "index" : "property"} to parent of type ${parent.type}`);
  }
}
function withFormatting(text5, edit, options) {
  if (!options.formattingOptions) {
    return [edit];
  }
  let newText = applyEdit(text5, edit);
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
  const editLength = text5.length - (newText.length - end) - begin;
  return [{ offset: begin, length: editLength, content: newText.substring(begin, end) }];
}
function applyEdit(text5, edit) {
  return text5.substring(0, edit.offset) + edit.content + text5.substring(edit.offset + edit.length);
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
function modify(text5, path, value, options) {
  return setProperty(text5, path, value, options);
}
function applyEdits(text5, edits) {
  let sortedEdits = edits.slice(0).sort((a, b) => {
    const diff = a.offset - b.offset;
    if (diff === 0) {
      return a.length - b.length;
    }
    return diff;
  });
  let lastModifiedOffset = text5.length;
  for (let i = sortedEdits.length - 1; i >= 0; i--) {
    let e = sortedEdits[i];
    if (e.offset + e.length <= lastModifiedOffset) {
      text5 = applyEdit(text5, e);
    } else {
      throw new Error("Overlapping edit");
    }
    lastModifiedOffset = e.offset;
  }
  return text5;
}

// ../node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.6/node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object3, filter) {
  return Object.fromEntries(Object.entries(object3).filter(([key, value]) => filter(key, value)));
}
function mapValues(object3, transform) {
  return Object.fromEntries(Object.entries(object3).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
var write = Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
  if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
  } finally {
    ancestors.delete(value);
  }
}
function createVolatile(value) {
  let current = snapshot(value);
  return Object.freeze({
    get: () => current,
    [write]: (value2) => {
      current = value2;
    }
  });
}
function isVolatile(value) {
  return typeof value === "object" && value !== null && write in value;
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor4 = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor4) descriptor4.value = Reflect.apply(clone, null, [descriptor4.value, refs]);
    Reflect.defineProperty(result, key, descriptor4);
  }
  return result;
}
function deepEqual(a, b, strict) {
  const ancestors = /* @__PURE__ */ new Set();
  function compare(a2, b2) {
    if (a2 === b2) return true;
    if (isVolatile(a2) || isVolatile(b2)) return isVolatile(a2) && isVolatile(b2);
    if (!strict && isNullable(a2) && isNullable(b2)) return true;
    if (typeof a2 !== typeof b2 || typeof a2 !== "object" || !a2 || !b2) return false;
    if (ancestors.has(a2)) return false;
    function check(test, then) {
      return test(a2) ? test(b2) ? then(a2, b2) : false : test(b2) ? false : void 0;
    }
    ancestors.add(a2);
    try {
      return check(Array.isArray, (a3, b3) => {
        if (a3.length !== b3.length) return false;
        for (let index = 0; index < a3.length; index++) if (!compare(a3[index], b3[index])) return false;
        return true;
      }) ?? check(is("Date"), (a3, b3) => a3.valueOf() === b3.valueOf()) ?? check(is("URL"), (a3, b3) => a3.href === b3.href) ?? check(is("RegExp"), (a3, b3) => a3.source === b3.source && a3.flags === b3.flags) ?? check(isArrayBufferLike, (a3, b3) => {
        if (a3.byteLength !== b3.byteLength) return false;
        const viewA = new Uint8Array(a3);
        const viewB = new Uint8Array(b3);
        for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
        return true;
      }) ?? ((!strict || [a2, b2].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
        ...a2,
        ...b2
      }).every((key) => compare(a2[key], b2[key])));
    } finally {
      ancestors.delete(a2);
    }
  }
  return compare(a, b);
}
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format2(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format2;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// ../node_modules/.pnpm/@deepseek-ai+schemastery@3.18.5/node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = Symbol.for("schemastery");
var kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError];
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (isVolatile(value)) value = value.get();
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.volatile = function volatile() {
  if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
  return this.extra("volatile", true);
};
var resolvers = {};
var checkedVolatile = Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
  const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
  if (states.has(blocked)) return;
  states.add(blocked);
  seen.set(schema, states);
  if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
  const nested = blocked || !!schema.meta?.volatile;
  if (schema.dict) for (const [key, child2] of Object.entries(schema.dict)) validateVolatileSchema(child2, [...path, key], nested, seen);
  if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
  if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
  if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve2) {
  resolvers[type] = resolve2;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (!options[checkedVolatile]) {
    validateVolatileSchema(schema, options.path);
    options = {
      ...options,
      [checkedVolatile]: true
    };
  }
  if (schema.meta?.volatile) {
    const inner = Schema(schema);
    inner.meta = {
      ...schema.meta,
      volatile: false
    };
    const [value, adapted] = Schema.resolve(data, inner, options, strict);
    try {
      return [createVolatile(value), adapted];
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : String(error), options);
    }
  }
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
    validateVolatileSchema(schema.inner, options.path, true);
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer3 = str.slice(0, index);
  if (frac.length <= digits) return +(integer3 + frac.padEnd(digits, "0"));
  return +(integer3 + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name, keys, format2) {
  formatters[name] = format2;
  Object.assign(Schema, { [name](...args) {
    const schema = new Schema({ type: name });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name === "object" || name === "dict") schema.meta.default = {};
    else if (name === "array" || name === "tuple") schema.meta.default = [];
    else if (name === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format2 }) => format2()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// src/permission-errors.ts
var PermissionRefusal = class extends Error {
  constructor(code) {
    super("The Host refused the permission operation.");
    this.code = code;
  }
};

// src/permission-rules.ts
function invalid() {
  throw new PermissionRefusal("validation");
}
function permissionRuleRow(value, required, optional2 = []) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string" || !required.includes(key) && !optional2.includes(key)) || required.some((key) => !Object.hasOwn(fields, key)) || Object.values(fields).some((field) => !Object.hasOwn(field, "value") || !field.enumerable)) invalid();
  return value;
}
function text(value, max = 32768) {
  if (typeof value !== "string" || value.length === 0 || value.length > max || value.includes("\0")) invalid();
  return value;
}
function permissionRevision(value) {
  return text(value, 4096);
}
function integer(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
function ruleAction(value, inherit = false) {
  if (typeof value !== "string" || !(inherit ? ["inherit", "allow", "ask", "deny"] : ["allow", "ask", "deny"]).includes(value)) invalid();
  return value;
}
function draft(value, persisted = false) {
  const input = permissionRuleRow(value, ["id", "action", "match", ...persisted ? ["source", "revision", "revoked"] : []]);
  const kind = permissionRuleRow(input.match, ["kind"], ["path", "scope", "executable", "command", "workingDirectory"]).kind;
  let match;
  if (kind === "outside-read") {
    const row = permissionRuleRow(input.match, ["kind", "path", "scope"]);
    if (row.scope !== "exact" && row.scope !== "tree") invalid();
    match = { kind, path: text(row.path), scope: row.scope };
  } else if (kind === "shell") {
    const row = permissionRuleRow(input.match, ["kind", "executable", "command", "workingDirectory"]);
    match = { kind, executable: text(row.executable), command: text(row.command), workingDirectory: text(row.workingDirectory) };
  } else if (kind === "webSearch" || kind === "webFetch") {
    permissionRuleRow(input.match, ["kind"]);
    match = { kind };
  } else invalid();
  return Object.freeze({ id: text(input.id, 256), action: ruleAction(input.action), match: Object.freeze(match) });
}
function parsePermissionRules(value) {
  if (!Array.isArray(value) || value.length > 1024) invalid();
  const ids = /* @__PURE__ */ new Set();
  return Object.freeze(value.map((item) => {
    const parsed = draft(item, true), row = item;
    if (ids.has(parsed.id) || typeof row.revoked !== "boolean") invalid();
    ids.add(parsed.id);
    const sourceRow = permissionRuleRow(row.source, ["kind"], ["sessionId", "savedAt", "label"]);
    let source;
    if (sourceRow.kind === "operator") {
      permissionRuleRow(row.source, ["kind", "sessionId", "savedAt"]);
      source = { kind: "operator", sessionId: text(sourceRow.sessionId, 256), savedAt: integer(sourceRow.savedAt) };
    } else if (sourceRow.kind === "user-import") {
      permissionRuleRow(row.source, ["kind", "label"]);
      source = { kind: "user-import", label: text(sourceRow.label, 512) };
    } else invalid();
    return Object.freeze({ ...parsed, source: Object.freeze(source), revision: integer(row.revision), revoked: row.revoked });
  }));
}
function parsePermissionRulesSave(value) {
  const row = permissionRuleRow(value, ["expectedRevision"], ["changes", "upsert", "revoke"]);
  let changes;
  if (row.changes !== void 0) {
    const input = permissionRuleRow(row.changes, [], ["outsideReads", "webSearch", "webFetch"]);
    const web2 = (value2) => {
      const row2 = permissionRuleRow(value2, ["enabled", "rule"]);
      if (typeof row2.enabled !== "boolean") invalid();
      return Object.freeze({ enabled: row2.enabled, rule: ruleAction(row2.rule, true) });
    };
    changes = Object.freeze({
      ...input.outsideReads === void 0 ? {} : { outsideReads: ruleAction(input.outsideReads, true) },
      ...input.webSearch === void 0 ? {} : { webSearch: web2(input.webSearch) },
      ...input.webFetch === void 0 ? {} : { webFetch: web2(input.webFetch) }
    });
  }
  if (row.upsert !== void 0 && (!Array.isArray(row.upsert) || row.upsert.length > 1024) || row.revoke !== void 0 && (!Array.isArray(row.revoke) || row.revoke.length > 1024)) invalid();
  const upsert = row.upsert?.map((item) => draft(item)), revoke = row.revoke?.map((item) => text(item, 256));
  const ids = [...upsert?.map((item) => item.id) ?? [], ...revoke ?? []];
  if (ids.length !== new Set(ids).size || ids.length === 0 && (changes === void 0 || Object.keys(changes).length === 0)) invalid();
  return Object.freeze({
    expectedRevision: permissionRevision(row.expectedRevision),
    ...changes === void 0 ? {} : { changes },
    ...upsert === void 0 ? {} : { upsert: Object.freeze(upsert) },
    ...revoke === void 0 ? {} : { revoke: Object.freeze(revoke) }
  });
}

// src/permission-settings.ts
function parseNativeCommands(input = {}) {
  const row = permissionRuleRow(input, [], ["enabled", "entries"]);
  if (row.enabled !== void 0 && typeof row.enabled !== "boolean" || row.entries !== void 0 && (!Array.isArray(row.entries) || row.entries.length > 1024)) throw new PermissionRefusal("validation");
  const text5 = (value) => {
    if (typeof value !== "string" || value.trim().length === 0 || value.length > 32768 || value.includes("\0")) throw new PermissionRefusal("validation");
    return value;
  };
  const ids = /* @__PURE__ */ new Set();
  const entries = (row.entries ?? []).map((value) => {
    const entry = permissionRuleRow(value, ["id", "mode", "match", "sandboxMode"]), match = permissionRuleRow(entry.match, ["tool", "executable", "args", "workingDirectory"], ["subcommand"]);
    const id2 = text5(entry.id), cwd = text5(match.workingDirectory);
    if (ids.has(id2) || !["ask", "allow"].includes(entry.mode) || !["bash", "pwsh"].includes(match.tool) || !["workspace-write", "danger-full-access"].includes(entry.sandboxMode) || !/^(?:\/|[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$))/iu.test(cwd) || !Array.isArray(match.args)) throw new PermissionRefusal("validation");
    ids.add(id2);
    return Object.freeze({ id: id2, mode: entry.mode, sandboxMode: entry.sandboxMode, match: Object.freeze({
      tool: match.tool,
      executable: text5(match.executable),
      ...match.subcommand === void 0 ? {} : { subcommand: text5(match.subcommand) },
      args: Object.freeze(match.args.map(text5)),
      workingDirectory: cwd
    }) });
  });
  return Object.freeze({ enabled: row.enabled ?? false, entries: Object.freeze(entries) });
}
var nativeCommands = Schema.object({ enabled: Schema.boolean().default(false), entries: Schema.array(Schema.object({
  id: Schema.string().required(),
  mode: Schema.union(["ask", "allow"]).required(),
  match: Schema.object({
    tool: Schema.union(["bash", "pwsh"]).required(),
    executable: Schema.string().required(),
    subcommand: Schema.string(),
    args: Schema.array(Schema.string()).required(),
    workingDirectory: Schema.string().required()
  }).required(),
  sandboxMode: Schema.union(["workspace-write", "danger-full-access"]).required()
})).default([]) });
var webDefault = Object.freeze({ enabled: true, rule: "inherit" });
var DEFAULT_PERMISSION_CONTROL = Object.freeze({ enabled: true, outsideReads: "inherit", webSearch: webDefault, webFetch: webDefault, rules: Object.freeze([]), nativeCommands: parseNativeCommands() });
var action = () => Schema.union(["inherit", "allow", "ask", "deny"]).default("inherit");
var web = () => Schema.object({ enabled: Schema.boolean().default(true), rule: action() }).default({});
var permissionControlSchema = Schema.transform(Schema.object({
  enabled: Schema.boolean().default(true),
  outsideReads: action(),
  webSearch: web(),
  webFetch: web(),
  nativeCommands,
  rules: Schema.array(Schema.any()).default([])
}), (input) => Object.freeze({ ...input, webSearch: Object.freeze(input.webSearch), webFetch: Object.freeze(input.webFetch), rules: parsePermissionRules(input.rules), nativeCommands: parseNativeCommands(input.nativeCommands) }), true);
function resolvePermissionControl(input = {}) {
  permissionRuleRow(input, [], ["enabled", "outsideReads", "webSearch", "webFetch", "rules", "nativeCommands"]);
  if (Object.hasOwn(input, "nativeCommands")) parseNativeCommands(input.nativeCommands);
  for (const web2 of [input.webSearch, input.webFetch]) if (web2 !== void 0) permissionRuleRow(web2, [], ["enabled", "rule"]);
  const parsed = permissionControlSchema(input);
  return Object.freeze({ ...parsed, webSearch: Object.freeze(parsed.webSearch), webFetch: Object.freeze(parsed.webFetch), rules: parsePermissionRules(parsed.rules) });
}

// src/profile-diagnostics.ts
var PROFILE_DIAGNOSTIC_REASONS = {
  "invalid-jsonc": "Use one valid document with supported JSON syntax.",
  "duplicate-field": "Remove the duplicate field.",
  "unsafe-field": "Unsafe object fields are not supported.",
  "unknown-field": "This field is not supported; installation and private configuration belong in native deployment configuration.",
  "deprecated-field": "This retired field is not supported; configure explicit role levels instead.",
  "invalid-type": "Use the declared field type and bounded value.",
  "unsupported-value": "Use one of the explicitly supported values.",
  "invalid-route": "Use a complete provider/model route or a nonempty reasoning-effort override.",
  "required-role": "This role is required by the selected Deepwork policy.",
  "deployment-ceiling": "A named profile cannot enable capabilities outside its captured deployment ceiling.",
  "blank-label": "The label is blank; the profile ID is used for display."
};
function schemaFieldShape(schema) {
  if (schema.type === "transform") return schemaFieldShape(schema.inner);
  if (schema.type === "object") return Object.fromEntries(Object.entries(schema.dict ?? {}).map(([key, child2]) => [key, schemaFieldShape(child2)]));
  if (schema.type === "array") return [schemaFieldShape(schema.inner)];
  return null;
}
var roleId = /^dsmm-(?:orchestrator|planner|plan-critic|builder|reviewer|oracle|oracle-2nd|creative|code-search|doc-search|clarifier|media-reader|frontend|hard-reasoning|research|quick|coding|normal-task|complex|deep|documenting|cross-cutting)$/u;
var skillId = /^(?:brainstorming|writing-plans|requesting-code-review|receiving-code-review|subagent-driven-development|dispatching-parallel-agents|remove-ai-slops|debugging|frontend|git-master|ast-grep|coding-agent-sessions|init-deep|using-git-worktrees)$/u;
var route = { provider: null, model: null, reasoningEffort: null };
var rateLimit = Object.fromEntries(Object.keys(DSMM_RATE_LIMIT_BOUNDS).map((key) => [key, null]));
var roleRouting = { primary: route, fallbackRoutes: [route], strategy: null, rateLimit, levels: { low: route, high: route, max: route } };
var configFields = {
  permissionControl: schemaFieldShape(permissionControlSchema),
  modelParameters: { passthrough: null },
  locale: null,
  modeName: null,
  section: null,
  defaultActive: null,
  promptOrder: null,
  deepseekV4ProCalibration: null,
  deepseekV4ProDefaultReasoningEffort: null,
  deepseekFlashCalibration: null,
  deepseekFlashDefaultReasoningEffort: null,
  deepseekV4ProMaxReasoningPresets: null,
  deepseekFlashMaxReasoningPresets: null,
  modules: { deepwork: { enabled: null } },
  skills: "skills",
  roles: "roles",
  roleRouting: "role-routing",
  runtimePolicy: { strategy: null, rateLimit },
  presets: { materialize: null, plannerRootEnabled: null, root: null },
  subagents: { toolTopology: null, allowRouteOverride: null, enableRunInBackground: null, backgroundMode: null, maxDepth: null },
  workflow: { policy: null, strictGates: null, reviewCap: null, finalReviewPolicy: null },
  guards: { scope: null, shellCommandSafety: null, gitWriteGuard: null, toolOutputTruncation: { enabled: null, maxInlineBytes: null }, planFormatValidation: null, questionLabelHelper: { enabled: null, maxLabelChars: null }, todoDisciplineHelper: null },
  runtimeRecovery: { enabled: null, retryOnStatusCodes: [null], retryOnCodes: [null], fallbackRoutes: [route], maxFallbackAttempts: null, idleContinuation: { enabled: null, maxContinuations: null, prompt: null } },
  lsp: { enabled: null, serverName: null, command: null, args: [null], cwd: null, env: {}, toolCallTimeoutMs: null, failOnStartupError: null }
};
var documentFields = { version: null, id: null, label: null, settings: configFields };
var rootFields = { ...configFields, ...documentFields, document: documentFields, content: null, expectedRevision: null, expectedSelectionRevision: null, expectedAdmissionEpoch: null, expectedModeRevision: null, sessionId: null, route };
function childShape(shape, key) {
  if (typeof key === "number") return Number.isSafeInteger(key) && key >= 0 && key <= 999999 && Array.isArray(shape) ? shape[0] : void 0;
  if (shape === rootFields && roleId.test(key)) return null;
  if (shape === "roles") return roleId.test(key) ? null : void 0;
  if (shape === "role-routing") return roleId.test(key) ? roleRouting : void 0;
  if (shape === "skills") return skillId.test(key) ? null : void 0;
  return shape !== null && typeof shape === "object" && !Array.isArray(shape) && Object.hasOwn(shape, key) ? shape[key] : void 0;
}
function fieldParts(field) {
  return field.replace(/\[([0-9]+)\]/gu, ".$1").split(".").map((part) => /^\d+$/u.test(part) ? Number(part) : part);
}
function safeDiagnosticField(parts) {
  let result = "";
  let shape = rootFields;
  for (const part of parts.slice(0, 16)) {
    const declared = childShape(shape, part);
    const key = declared !== void 0 ? part : "[unknown]";
    const next = typeof key === "number" ? `[${key}]` : `${result === "" ? "" : "."}${key}`;
    if (result.length + next.length > 256) break;
    result += next;
    shape = declared;
  }
  return result || "document";
}
function isSafeDiagnosticField(value) {
  return typeof value === "string" && value.length <= 256 && /^(?:[a-zA-Z][a-zA-Z0-9_-]{0,63}|\[unknown\])(?:\.(?:[a-zA-Z][a-zA-Z0-9_-]{0,63}|\[unknown\])|\[(?:0|[1-9][0-9]{0,5})\])*$/u.test(value) && safeDiagnosticField(fieldParts(value)) === value;
}
function diagnostic(code, field, location) {
  const reason = code === "unsupported-value" && (field === "locale" || field === "settings.locale") ? "Supported locales: en, zh-Hans, zh-Hant, ja, ko, de, fr, es, pt-BR, ru." : PROFILE_DIAGNOSTIC_REASONS[code];
  return { severity: code === "blank-label" ? "warning" : "error", code, field: safeDiagnosticField(fieldParts(field)), reason, ...location === void 0 ? {} : { location } };
}
function diagnosticLocation(content2, offset, length) {
  const before = content2.slice(0, offset).split(/\r\n|\r|\n/u);
  return { offset, length, line: before.length, column: before.at(-1).length + 1 };
}
function fieldLocation(content2, tree, field, sourcePath) {
  const path = sourcePath !== void 0 ? [...sourcePath] : field === "document" || field === "content" ? [] : fieldParts(field);
  let node = findNodeAtLocation2(tree, path);
  while (node === void 0 && path.length) {
    path.pop();
    node = findNodeAtLocation2(tree, path);
  }
  if (node === void 0) return void 0;
  const selected = node.parent?.type === "property" ? node.parent.children[0] : node;
  return diagnosticLocation(content2, selected.offset, selected.length);
}
function inspectJsonDocument(content2, jsonc = true) {
  const errors = [];
  const tree = parseTree2(content2.replace(/^\uFEFF/u, " "), errors, { allowTrailingComma: jsonc, disallowComments: !jsonc, allowEmptyContent: false });
  if (tree === void 0 || errors.length) return { tree, diagnostics: [diagnostic("invalid-jsonc", "content", diagnosticLocation(content2, errors[0]?.offset ?? 0, errors[0]?.length ?? 0))] };
  const diagnostics = [];
  const walk = (node, path, depth2) => {
    if (depth2 > 32) {
      diagnostics.push(diagnostic("invalid-type", safeDiagnosticField(path), diagnosticLocation(content2, node.offset, node.length)));
      return;
    }
    if (node.type === "object") {
      const found = /* @__PURE__ */ new Set();
      for (const property2 of node.children ?? []) {
        const keyNode = property2.children[0], key = String(keyNode.value), next = [...path, key];
        const code = ["__proto__", "constructor", "prototype"].includes(key) ? "unsafe-field" : found.has(key) ? "duplicate-field" : void 0;
        if (code !== void 0) diagnostics.push(diagnostic(code, safeDiagnosticField(next), diagnosticLocation(content2, keyNode.offset, keyNode.length)));
        found.add(key);
        walk(property2.children[1], next, depth2 + 1);
      }
    } else if (node.type === "array") (node.children ?? []).forEach((child2, index) => walk(child2, [...path, index], depth2 + 1));
  };
  walk(tree, [], 0);
  return { tree, diagnostics };
}

// src/config-revision.ts
function isConfigRevision(value) {
  return typeof value === "string" && (/^[a-f0-9]{64}$/u.test(value) || /^stat-v1--?\d{1,24}--?\d{1,24}$/u.test(value));
}
function isProfileReference(value) {
  return typeof value === "string" && (/^[a-f0-9]{64}$/u.test(value) || /^snapshot-v1-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value));
}

// src/profile-remote.ts
var errorCodes = /* @__PURE__ */ new Set(["validation", "conflict", "not-found", "lock-timeout", "unsafe-path", "io", "activation", "corrupt-selection", "limit", "busy", "maintenance", "disposed", "not-owned", "unavailable", "cancelled"]);
var idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
var revisionPattern = /^[a-f0-9]{64}$/u;
var rolePattern = /^dsmm-(?:orchestrator|planner|plan-critic|builder|reviewer|oracle|oracle-2nd|creative|code-search|doc-search|clarifier|media-reader|frontend|hard-reasoning|research|quick|coding|normal-task|complex|deep|documenting|cross-cutting)$/u;
function isProfileId(value) {
  return typeof value === "string" && idPattern.test(value) && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/iu.test(value);
}
function fail2(field) {
  throw new TypeError(`Invalid Deepwork profile wire field: ${field}`);
}
function text2(value, field, maximum = 1024) {
  if (typeof value !== "string" || value.length > maximum) fail2(field);
  return value;
}
function id(value) {
  const result = text2(value, "id", 64);
  if (!isProfileId(result)) fail2("id");
  return result;
}
function revision(value) {
  const result = text2(value, "revision", 128);
  if (!isConfigRevision(result)) fail2("revision");
  return result;
}
function epoch(value) {
  if (typeof value !== "string" || !revisionPattern.test(value)) fail2("epoch");
  return value;
}
function reference(value) {
  if (!isProfileReference(value)) fail2("reference");
  return value;
}
function modeRevision(value) {
  if (typeof value !== "string" || !/^(?:[a-f0-9]{64}|mode-v1-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/u.test(value)) fail2("mode revision");
  return value;
}
function refresh(value) {
  if (value !== true) fail2("refreshRequired");
  return true;
}
function observedRevision(value, row) {
  return value === "unavailable" && row.refreshRequired === true ? value : selectionRevision(value);
}
function selectionRevision(value) {
  return value === "absent" ? value : revision(value);
}
function isNativeSessionId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value) && new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(value)) === value;
}
function sessionId(value) {
  if (!isNativeSessionId(value)) fail2("sessionId");
  return value;
}
function boolean(value, field) {
  if (typeof value !== "boolean") fail2(field);
  return value;
}
function integer2(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) fail2(field);
  return value;
}
function role2(value) {
  if (typeof value !== "string" || !rolePattern.test(value)) fail2("role");
  return value;
}
function object(value, required, optional2 = []) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail2("object");
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some((property2) => !Object.hasOwn(property2, "value") || !property2.enumerable)) fail2("object");
  const result = value;
  if (Object.keys(result).some((key) => !required.includes(key) && !optional2.includes(key)) || required.some((key) => !Object.hasOwn(result, key))) fail2("object keys");
  return result;
}
function optional(value, key, parse3) {
  return Object.hasOwn(value, key) ? { [key]: parse3(value[key]) } : {};
}
function parseProfileErrorInfo(value) {
  const item = object(value, ["code", "message"], ["field", "reason", "location"]);
  const code = text2(item.code, "code");
  if (!errorCodes.has(code)) fail2("code");
  const reason = item.reason === void 0 ? void 0 : text2(item.reason, "reason", 64);
  if (reason !== void 0 && (!Object.hasOwn(PROFILE_DIAGNOSTIC_REASONS, reason) || reason === "blank-label")) fail2("reason");
  const field = item.field === void 0 ? void 0 : diagnosticField(item.field);
  return {
    code,
    message: reason === void 0 ? text2(item.message, "message", 4096) : `${field ?? "document"}: ${diagnostic(reason, field ?? "document").reason}`,
    ...field === void 0 ? {} : { field },
    ...reason === void 0 ? {} : { reason },
    ...optional(item, "location", diagnosticPosition)
  };
}
var errorInfo = parseProfileErrorInfo;
function diagnosticField(value) {
  if (!isSafeDiagnosticField(value)) fail2("field");
  return value;
}
function diagnosticPosition(value) {
  const item = object(value, ["offset", "length", "line", "column"]);
  const result = { offset: integer2(item.offset, "offset", 128 * 1024), length: integer2(item.length, "length", 128 * 1024), line: integer2(item.line, "line", 128 * 1024 + 1), column: integer2(item.column, "column", 128 * 1024 + 1) };
  if (result.line < 1 || result.column < 1 || result.offset + result.length > 128 * 1024) fail2("location");
  return result;
}
function parseProfileDiagnostic(value) {
  const row = object(value, ["severity", "code", "field", "reason"], ["location"]);
  if (typeof row.code !== "string" || !Object.hasOwn(PROFILE_DIAGNOSTIC_REASONS, row.code)) fail2("diagnostic code");
  const result = diagnostic(row.code, diagnosticField(row.field));
  if (row.severity !== result.severity || row.reason !== result.reason) fail2("diagnostic severity/reason");
  return { ...result, ...optional(row, "location", diagnosticPosition) };
}
function warnings(value) {
  if (!Array.isArray(value) || value.length > 1) fail2("warnings");
  return value.map((value2) => {
    const result = parseProfileDiagnostic(value2);
    if (result.severity !== "warning" || result.code !== "blank-label" || result.field !== "label") fail2("warning");
    return result;
  });
}
function parseRoleAvailability(value) {
  const row = object(value, ["id", "required", "startupAvailable", "deploymentEnabled", "admitted", "source", "capture"], ["requiredReason", "namedEnabled", "reason"]);
  if (typeof row.source !== "string" || !["defaults", "global", "profile", "named-session"].includes(row.source) || typeof row.capture !== "string" || !["startup", "deployment", "named-session"].includes(row.capture)) fail2("role source/capture");
  if (row.reason !== void 0 && (typeof row.reason !== "string" || !["module-off", "deployment-disabled", "startup-unavailable", "profile-disabled", "required-role", "current-root-disabled"].includes(row.reason))) fail2("role reason");
  if (row.requiredReason !== void 0 && (typeof row.requiredReason !== "string" || !["deepwork-planning", "legacy-review"].includes(row.requiredReason))) fail2("requiredReason");
  return {
    id: role2(row.id),
    required: boolean(row.required, "required"),
    startupAvailable: boolean(row.startupAvailable, "startupAvailable"),
    deploymentEnabled: boolean(row.deploymentEnabled, "deploymentEnabled"),
    admitted: boolean(row.admitted, "admitted"),
    source: row.source,
    capture: row.capture,
    ...optional(row, "namedEnabled", (value2) => boolean(value2, "namedEnabled")),
    ...row.reason === void 0 ? {} : { reason: row.reason },
    ...row.requiredReason === void 0 ? {} : { requiredReason: row.requiredReason }
  };
}
function roleAvailabilityList(value) {
  if (!Array.isArray(value) || value.length > 22) fail2("roles");
  const result = value.map(parseRoleAvailability);
  if (new Set(result.map((role3) => role3.id)).size !== result.length) fail2("roles");
  return result;
}
function parseSubagentRuntimeAdmissionView(value) {
  const row = object(value, ["binding", "deliveryFenceReady", "restartRequired"], ["reason"]);
  if (typeof row.binding !== "string" || !["stock", "unavailable"].includes(row.binding) || row.reason !== void 0 && row.reason !== "authority-not-ready") fail2("subagentRuntime");
  const ready = boolean(row.deliveryFenceReady, "deliveryFenceReady");
  if (ready && (row.binding === "unavailable" || row.reason !== void 0)) fail2("subagentRuntime readiness");
  return { binding: row.binding, deliveryFenceReady: ready, restartRequired: boolean(row.restartRequired, "restartRequired"), ...row.reason === void 0 ? {} : { reason: row.reason } };
}
function readResult(value) {
  const item = object(value, ["id", "revision", "content"], ["label", "warnings", "refreshRequired"]);
  return { id: id(item.id), revision: item.revision === "unavailable" && item.refreshRequired === true ? "unavailable" : revision(item.revision), content: content(item.content), ...optional(item, "refreshRequired", refresh), ...optional(item, "label", (input) => text2(input, "label", 120)), ...optional(item, "warnings", warnings) };
}
function content(value) {
  const result = text2(value, "content", 128 * 1024);
  if (new TextEncoder().encode(result).byteLength > 128 * 1024) fail2("content");
  return result;
}
function snapshot2(value) {
  const item = object(value, ["profiles", "selectedId", "appliedRevision", "selectionRevision"], ["selectionError", "roles", "editorDefaults", "origin", "readOnly", "writeRestriction", "selectedWarnings", "sourceRevision", "refreshRequired"]);
  if (!Array.isArray(item.profiles) || item.profiles.length > 128) fail2("profiles");
  return {
    profiles: item.profiles.map((input) => {
      const row = object(input, ["id", "revision"], ["label", "error", "warnings"]);
      return { id: text2(row.id, "id", 64), revision: row.revision === null ? null : revision(row.revision), ...optional(row, "label", (input2) => text2(input2, "label", 120)), ...optional(row, "error", errorInfo), ...optional(row, "warnings", warnings) };
    }),
    selectedId: item.selectedId === null ? null : id(item.selectedId),
    appliedRevision: item.appliedRevision === null ? null : reference(item.appliedRevision),
    selectionRevision: item.selectionRevision === "unavailable" && Object.hasOwn(item, "selectionError") ? "unavailable" : observedRevision(item.selectionRevision, item),
    ...optional(item, "sourceRevision", revision),
    ...optional(item, "refreshRequired", refresh),
    ...optional(item, "selectionError", errorInfo),
    ...optional(item, "selectedWarnings", warnings),
    ...optional(item, "roles", (input) => {
      if (!Array.isArray(input) || input.length > 22) fail2("roles");
      const result = input.map((value2) => {
        const row = object(value2, ["id", "label", "enabled"], ["runtimePolicy", "availability"]);
        return { id: role2(row.id), label: text2(row.label, "label", 120), enabled: boolean(row.enabled, "enabled"), ...optional(row, "availability", parseRoleAvailability), ...optional(row, "runtimePolicy", (input2) => {
          const policy = object(input2, [], ["strategy", "rateLimit"]);
          return { ...optional(policy, "strategy", normalizeRoutingStrategy), ...optional(policy, "rateLimit", normalizeRateLimitOverrides) };
        }) };
      });
      if (new Set(result.map((row) => row.id)).size !== result.length) fail2("roles");
      return result;
    }),
    ...optional(item, "editorDefaults", runtimePolicy),
    ...optional(item, "origin", (input) => {
      if (typeof input !== "string" || !["central", "legacy", "explicit"].includes(input)) fail2("origin");
      return input;
    }),
    ...optional(item, "readOnly", (input) => boolean(input, "readOnly")),
    ...optional(item, "writeRestriction", (input) => text2(input, "writeRestriction", 1024))
  };
}
function rateLimit2(value) {
  const item = object(value, Object.keys(DSMM_RATE_LIMIT_BOUNDS));
  return normalizeRateLimitPolicy(item);
}
function runtimePolicy(value) {
  const item = object(value, ["strategy", "rateLimit"]);
  return { strategy: normalizeRoutingStrategy(item.strategy), rateLimit: rateLimit2(item.rateLimit) };
}
function rolePolicy(value) {
  const item = object(value, ["strategy", "rateLimit", "retries", "rateLimitFailures", "switches", "totalDelayMs"], ["role", "route"]);
  return {
    ...runtimePolicy({ strategy: item.strategy, rateLimit: item.rateLimit }),
    retries: integer2(item.retries, "retries", 10),
    rateLimitFailures: integer2(item.rateLimitFailures, "rateLimitFailures"),
    switches: integer2(item.switches, "switches", 10),
    totalDelayMs: integer2(item.totalDelayMs, "totalDelayMs", 12e4),
    ...optional(item, "role", role2),
    ...optional(item, "route", modelRoute)
  };
}
function modelRoute(value) {
  return normalizeModelRouteJson(value);
}
function initialRoleRoute(value) {
  const row = object(value, ["status"], ["source", "route", "reason"]);
  if (row.status === "known") {
    object(row, ["status", "source", "route"]);
    if (row.source !== "invocation-capture") fail2("initialRoute source");
    return { status: "known", source: "invocation-capture", route: modelRoute(row.route) };
  }
  object(row, ["status", "reason"]);
  if (row.status !== "unknown" || row.reason !== "missing-invocation-capture") fail2("initialRoute reason");
  return { status: "unknown", reason: "missing-invocation-capture" };
}
function liveRoleRoute(value) {
  const row = object(value, ["status"], ["source", "route", "reason"]);
  if (row.status === "known") {
    object(row, ["status", "source", "route"]);
    if (row.source !== "own-native-request-header") fail2("liveRoute source");
    return { status: "known", source: "own-native-request-header", route: modelRoute(row.route) };
  }
  object(row, ["status", "reason"]);
  if (row.status !== "unknown" || typeof row.reason !== "string" || !["no-own-request-header", "invalid-own-request-header", "not-observed"].includes(row.reason)) fail2("liveRoute reason");
  return { status: "unknown", reason: row.reason };
}
function parseDsmmRoleRouteComparison(value) {
  const row = object(jsonData(value), ["childId", "initialRoute", "liveRoute"]);
  return { childId: sessionId(row.childId), initialRoute: initialRoleRoute(row.initialRoute), liveRoute: liveRoleRoute(row.liveRoute) };
}
function parseDsmmInvocationView(value) {
  const row = object(jsonData(value), ["role", "label", "level", "routeSource", "mode"], ["route", "runId", "childId", "jobId", "routeComparison"]);
  if (typeof row.level !== "string" || !["normal", "low", "high", "max"].includes(row.level) || !DSMM_ROUTE_SOURCES.includes(row.routeSource) || typeof row.mode !== "string" || !["one-shot", "continuable"].includes(row.mode)) fail2("invocation");
  const target = role2(row.role);
  if (target === "dsmm-orchestrator") fail2("invocation target");
  const routeComparison = Object.hasOwn(row, "routeComparison") ? parseDsmmRoleRouteComparison(row.routeComparison) : void 0;
  if (routeComparison !== void 0 && (!Object.hasOwn(row, "childId") || routeComparison.childId !== row.childId)) fail2("invocation routeComparison childId");
  return { role: target, label: text2(row.label, "label", 120), level: row.level, routeSource: row.routeSource, mode: row.mode, ...optional(row, "route", modelRoute), ...optional(row, "runId", sessionId), ...optional(row, "childId", sessionId), ...optional(row, "jobId", sessionId), ...routeComparison === void 0 ? {} : { routeComparison } };
}
function selectionState(value) {
  const item = object(value, ["selectedId", "appliedRevision", "selectionRevision"], ["sourceRevision", "refreshRequired"]);
  return { selectedId: item.selectedId === null ? null : id(item.selectedId), appliedRevision: item.appliedRevision === null ? null : reference(item.appliedRevision), selectionRevision: observedRevision(item.selectionRevision, item), ...optional(item, "sourceRevision", revision), ...optional(item, "refreshRequired", refresh) };
}
function actionUnavailableReason(value) {
  if (typeof value !== "string" || !["busy", "maintenance", "module-off", "runtime-unavailable", "model-unconfigured", "model-service-unavailable", "new-session-required"].includes(value)) fail2("actionUnavailableReason");
  return value;
}
function sessionSnapshot(value) {
  const item = object(value, ["sessionId", "globalDefault", "selection", "scope", "admissionEpoch", "switchAllowed", "canSelectModel", "canToggleMode", "canApplyOverlay"], ["admittedSelection", "switchUnavailableReason", "selectModelUnavailableReason", "toggleModeUnavailableReason", "applyOverlayUnavailableReason", "rolePolicy", "profileModel", "deepwork", "modules", "configuration", "warnings", "roles", "subagentRuntime", "refreshRequired"]);
  if (typeof item.scope !== "string" || !["global-default", "session-override", "deployment-baseline"].includes(item.scope)) fail2("scope");
  return {
    sessionId: sessionId(item.sessionId),
    globalDefault: selectionState(item.globalDefault),
    selection: selectionState(item.selection),
    scope: item.scope,
    admissionEpoch: epoch(item.admissionEpoch),
    switchAllowed: boolean(item.switchAllowed, "switchAllowed"),
    canSelectModel: boolean(item.canSelectModel, "canSelectModel"),
    canToggleMode: boolean(item.canToggleMode, "canToggleMode"),
    canApplyOverlay: boolean(item.canApplyOverlay, "canApplyOverlay"),
    ...optional(item, "selectModelUnavailableReason", actionUnavailableReason),
    ...optional(item, "toggleModeUnavailableReason", actionUnavailableReason),
    ...optional(item, "applyOverlayUnavailableReason", actionUnavailableReason),
    ...optional(item, "refreshRequired", refresh),
    ...optional(item, "admittedSelection", selectionState),
    ...optional(item, "switchUnavailableReason", (input) => {
      if (typeof input !== "string" || !["busy", "maintenance", "disposed", "not-owned", "unavailable"].includes(input)) fail2("switchUnavailableReason");
      return input;
    }),
    ...optional(item, "rolePolicy", rolePolicy),
    ...optional(item, "profileModel", modelRoute),
    ...optional(item, "modules", moduleStates),
    ...optional(item, "configuration", admissionView),
    ...optional(item, "warnings", warnings),
    ...optional(item, "roles", roleAvailabilityList),
    ...optional(item, "subagentRuntime", parseSubagentRuntimeAdmissionView),
    ...optional(item, "deepwork", (input) => {
      const mode = object(input, ["active", "explicit", "locked", "revision"]);
      return { active: boolean(mode.active, "active"), explicit: boolean(mode.explicit, "explicit"), locked: boolean(mode.locked, "locked"), revision: modeRevision(mode.revision) };
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
  if (result.id !== null && result.expectedRevision === void 0) fail2("expectedRevision");
  if (result.id === null && result.expectedRevision !== void 0) fail2("expectedRevision");
  return result;
}
function sessionSelectRequest(value) {
  const item = object(value, ["sessionId", "id", "expectedSelectionRevision", "expectedAdmissionEpoch"], ["expectedRevision"]);
  const { sessionId: inputSessionId, expectedAdmissionEpoch, ...profileRequest } = item;
  return { ...selectRequest(profileRequest), sessionId: sessionId(inputSessionId), expectedAdmissionEpoch: epoch(expectedAdmissionEpoch) };
}
function modeSelectRequest(value) {
  const item = object(value, ["sessionId", "active", "expectedModeRevision", "expectedAdmissionEpoch"]);
  return { sessionId: sessionId(item.sessionId), active: boolean(item.active, "active"), expectedModeRevision: modeRevision(item.expectedModeRevision), expectedAdmissionEpoch: epoch(item.expectedAdmissionEpoch) };
}
function codec(symbol, parse3) {
  return { mode: "strict", typeSymbol: `@dsmm/dsmm#${symbol}`, create: () => ({ parse: (value) => parse3(jsonData(value)) }) };
}
function descriptor(method, result, parameter) {
  return { id: `@dsmm/dsmm#dsmmProfiles/${method}`, service: "dsmmProfiles", namespace: "dsmmProfiles", method, invocation: { kind: "direct" }, parameters: parameter === void 0 ? [] : [{ name: parameter.name, wire: parameter.name, source: "json", codec: parameter.codec }], result };
}
function jsonData(value, depth2 = 0, active = /* @__PURE__ */ new Set()) {
  if (depth2 > 32) fail2("JSON depth");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || value === null || active.has(value)) fail2("JSON value");
  if (Array.isArray(value) ? Object.getPrototypeOf(value) !== Array.prototype : Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail2("JSON object");
  if (Object.getOwnPropertySymbols(value).length) fail2("JSON symbols");
  const properties = Object.getOwnPropertyDescriptors(value);
  for (const [key, property2] of Object.entries(properties)) {
    if (Array.isArray(value) && key === "length") continue;
    if (!Object.hasOwn(property2, "value") || !property2.enumerable || Array.isArray(value) && !/^(0|[1-9][0-9]*)$/u.test(key)) fail2("JSON property");
  }
  if (Array.isArray(value) && Object.keys(value).length !== value.length) fail2("JSON array holes");
  active.add(value);
  const result = Array.isArray(value) ? value.map((child2) => jsonData(child2, depth2 + 1, active)) : Object.fromEntries(Object.entries(value).map(([key, child2]) => {
    if (["__proto__", "prototype", "constructor"].includes(key)) fail2("JSON key");
    return [key, jsonData(child2, depth2 + 1, active)];
  }));
  active.delete(value);
  return result;
}
function globalSnapshot(value) {
  const row = object(value, ["config", "revision"], ["refreshRequired"]);
  object(row.config, [], Object.keys(row.config));
  return { config: jsonData(row.config), revision: observedRevision(row.revision, row), ...optional(row, "refreshRequired", refresh) };
}
function admissionView(value) {
  const row = object(value, ["settings", "sources", "captures", "restartRequired", "named"], ["modelParameterPolicy"]);
  object(row.settings, [], Object.keys(row.settings));
  for (const key of ["sources", "captures"]) {
    const map = object(row[key], [], Object.keys(row[key]));
    for (const [path, value2] of Object.entries(map)) {
      if (path.startsWith("lsp.env.")) fail2("private environment field");
      text2(value2, key, 128);
    }
  }
  if (!Array.isArray(row.restartRequired) || row.restartRequired.length > 256) fail2("restartRequired");
  const named = row.named === null ? null : object(row.named, ["id", "revision"]);
  return {
    ...optional(row, "modelParameterPolicy", (value2) => parseModelParameterPolicy(jsonData(value2))),
    settings: readOnlySettingsData(row.settings),
    sources: jsonData(row.sources),
    captures: jsonData(row.captures),
    restartRequired: row.restartRequired.map((value2) => text2(value2, "field", 256)),
    named: named === null ? null : { id: id(named.id), revision: reference(named.revision) }
  };
}
function readOnlySettingsData(value) {
  const settings = jsonData(value);
  const configured = (value2) => {
    if (value2 !== "" && value2 !== "<configured>") fail2("private configured value");
  };
  if (settings.lsp !== void 0) {
    const lsp = object(settings.lsp, ["enabled", "serverName", "command", "args", "cwd", "env", "toolCallTimeoutMs", "failOnStartupError"]);
    configured(lsp.command);
    configured(lsp.cwd);
    if (!Array.isArray(lsp.args) || lsp.args.some((value2) => value2 !== "<configured>")) fail2("private arguments");
    const env = object(lsp.env, [], Object.keys(lsp.env));
    for (const [key, value2] of Object.entries(env)) if (!/^variable-[1-9][0-9]*$/u.test(key) || value2 !== "<redacted>") fail2("private environment");
  }
  if (settings.presets !== void 0) {
    const presets = object(settings.presets, ["materialize"], ["root", "plannerRootEnabled"]);
    if (Object.hasOwn(presets, "plannerRootEnabled")) boolean(presets.plannerRootEnabled, "presets.plannerRootEnabled");
    if (presets.root !== void 0 && presets.root !== "<configured>") fail2("private directory");
  }
  if (settings.runtimeRecovery !== void 0) {
    const recovery = object(settings.runtimeRecovery, ["enabled", "retryOnStatusCodes", "retryOnCodes", "fallbackRoutes", "maxFallbackAttempts", "idleContinuation"]);
    const idle = object(recovery.idleContinuation, ["enabled", "maxContinuations", "prompt"]);
    configured(idle.prompt);
  }
  return settings;
}
function editorSnapshot(value) {
  const row = object(value, ["entryId", "namespace", "hostProfileKey", "global", "globalRevision", "profile", "nativeRevision", "nativeFormRevision", "nativeForm", "desired", "sources", "startup", "defaults", "schema", "nextRoot", "modules"], ["startupSources", "nativeSchema", "subagentRuntime"]);
  const result = jsonData(row);
  text2(row.entryId, "entryId", 256);
  if (row.namespace !== null) text2(row.namespace, "namespace", 256);
  epoch(row.hostProfileKey);
  selectionRevision(row.globalRevision);
  if (row.nativeRevision !== "unavailable" && (typeof row.nativeRevision !== "string" || !/^native-v1-\d+$/u.test(row.nativeRevision))) fail2("nativeRevision");
  if (row.nativeFormRevision !== null) integer2(row.nativeFormRevision, "nativeFormRevision");
  for (const key of ["global", "profile", "desired", "sources", "startup", "defaults", "schema"]) object(row[key], [], Object.keys(row[key]));
  if (row.nativeForm !== null) object(row.nativeForm, ["base", "user"]);
  if (row.nextRoot !== null) result.nextRoot = admissionView(row.nextRoot);
  result.desired = readOnlySettingsData(row.desired);
  result.startup = readOnlySettingsData(row.startup);
  result.schema = schemaNode(row.schema);
  if (row.nativeSchema !== void 0) result.nativeSchema = schemaNode(row.nativeSchema);
  if (row.subagentRuntime !== void 0) result.subagentRuntime = parseSubagentRuntimeAdmissionView(row.subagentRuntime);
  for (const map of [result.sources, result.startupSources]) {
    if (map === void 0) continue;
    object(map, [], Object.keys(map));
    for (const [path, value2] of Object.entries(map)) {
      if (path.startsWith("lsp.env.")) fail2("private environment field");
      text2(value2, "source", 128);
    }
  }
  result.modules = moduleStates(row.modules);
  return result;
}
function schemaNode(value) {
  const row = object(value, ["type"], ["fields", "inner", "alternatives", "value", "min", "max", "step", "required", "keys", "nonempty", "additionalProperties"]);
  if (typeof row.type !== "string" || !["object", "dict", "array", "union", "const", "string", "number", "boolean"].includes(row.type)) fail2("schema type");
  const node = { type: row.type };
  if (row.fields !== void 0) node.fields = Object.fromEntries(Object.entries(object(row.fields, [], Object.keys(row.fields))).map(([key, child2]) => [key, schemaNode(child2)]));
  if (row.inner !== void 0) node.inner = schemaNode(row.inner);
  if (row.alternatives !== void 0) {
    if (!Array.isArray(row.alternatives)) fail2("schema alternatives");
    node.alternatives = row.alternatives.map(schemaNode);
  }
  if (Object.hasOwn(row, "value")) {
    if (!["string", "number", "boolean"].includes(typeof row.value)) fail2("schema value");
    node.value = row.value;
  }
  for (const key of ["min", "max", "step"]) if (row[key] !== void 0) {
    if (typeof row[key] !== "number" || !Number.isFinite(row[key])) fail2("schema bound");
    node[key] = row[key];
  }
  if (row.required !== void 0) node.required = boolean(row.required, "schema required");
  if (row.nonempty !== void 0) {
    if (row.type !== "string") fail2("schema nonempty");
    node.nonempty = boolean(row.nonempty, "schema nonempty");
  }
  if (Object.hasOwn(row, "additionalProperties")) {
    if (row.type !== "object" || row.additionalProperties !== "json") fail2("schema additionalProperties");
    node.additionalProperties = "json";
  }
  if (row.keys !== void 0) {
    if (row.type !== "dict" || !Array.isArray(row.keys) || row.keys.length > 64) fail2("schema keys");
    node.keys = row.keys.map((key) => text2(key, "schema key", 128));
  }
  return node;
}
function globalSaveRequest(value) {
  const row = object(value, ["expectedRevision", "edits"]);
  if (!Array.isArray(row.edits) || row.edits.length > 128) fail2("edits");
  return { expectedRevision: selectionRevision(row.expectedRevision), edits: row.edits.map((value2) => {
    const edit = object(value2, ["op", "path"], ["value"]);
    if (!Array.isArray(edit.path) || edit.path.length < 1 || edit.path.length > 8) fail2("field path");
    const path = edit.path.map((part) => {
      const key = text2(part, "field", 128);
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/u.test(key) || ["constructor", "prototype", "__proto__"].includes(key)) fail2("field");
      return key;
    });
    if (edit.op === "unset" && !Object.hasOwn(edit, "value")) return { op: "unset", path };
    if (edit.op !== "set" || !Object.hasOwn(edit, "value")) fail2("edit");
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
  if (!Array.isArray(value) || value.length !== DSMM_MODULE_DESCRIPTORS.length) fail2("modules");
  const ids = /* @__PURE__ */ new Set();
  return value.map((value2) => {
    const row = object(value2, ["descriptor", "hostBundleEnabled", "desired", "startupMounted", "admitted", "nextRoot", "reason", "pending"]);
    const descriptor4 = object(row.descriptor, ["id", "label", "key"]);
    const known = DSMM_MODULE_DESCRIPTORS.find((known2) => known2.id === descriptor4.id);
    if (known === void 0 || descriptor4.label !== known.label || descriptor4.key !== known.key || row.hostBundleEnabled !== "unknown" || ids.has(known.id)) fail2("module descriptor");
    ids.add(known.id);
    const desired = object(row.desired, ["enabled", "source", "capture"]), next = object(row.nextRoot, ["admitted", "reason"]);
    if (typeof desired.source !== "string" || !["defaults", "global", "profile"].includes(desired.source) || typeof desired.capture !== "string" || !["current-global", "admission", "startup"].includes(desired.capture) || ![null, "global-disabled", "restart-required"].includes(next.reason) || ![null, "global-disabled", "restart-required", "captured-off"].includes(row.reason)) fail2("module state");
    return {
      descriptor: { ...known },
      hostBundleEnabled: "unknown",
      desired: { enabled: boolean(desired.enabled, "desired.enabled"), source: desired.source, capture: desired.capture },
      startupMounted: row.startupMounted === null ? null : boolean(row.startupMounted, "startupMounted"),
      admitted: row.admitted === null ? null : boolean(row.admitted, "admitted"),
      nextRoot: { admitted: next.admitted === null ? null : boolean(next.admitted, "nextRoot.admitted"), reason: next.reason },
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
    { ...configDescriptor("describeSettings"), result: codec("DeploymentEditorSnapshot", editorSnapshot) },
    {
      ...descriptor("selectMode", codec("SessionProfileSnapshot", sessionSnapshot)),
      parameters: [
        { name: "sessionId", wire: "sessionId", source: "json", codec: codec("NativeSessionId", sessionId) },
        { name: "request", wire: "request", source: "json", codec: codec("SessionModeSelectRequest", modeSelectRequest) }
      ]
    },
    descriptor("describe", codec("ProfileSnapshot", snapshot2)),
    descriptor("read", codec("ProfileReadResult", readResult), { name: "id", codec: codec("ProfileId", id) }),
    descriptor("save", codec("ProfileReadResult", readResult), { name: "request", codec: codec("ProfileSaveRequest", saveRequest) }),
    descriptor("select", codec("ProfileSnapshot", snapshot2), { name: "request", codec: codec("ProfileSelectRequest", selectRequest) }),
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

// src/client/diagnostics.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function safeIssue(info) {
  try {
    const parsed = parseProfileErrorInfo(info);
    return {
      kind: "domain",
      code: parsed.code,
      ...parsed.field === void 0 ? {} : { field: parsed.field },
      ...parsed.reason === void 0 ? {} : { reason: parsed.reason },
      ...parsed.location === void 0 ? {} : { location: parsed.location }
    };
  } catch {
    return { kind: "assembly", code: "unavailable" };
  }
}
function profileWarnings(warnings2) {
  return (warnings2 ?? []).flatMap((value) => {
    try {
      const warning = parseProfileDiagnostic(value);
      return warning.severity === "warning" && warning.code === "blank-label" && warning.field === "label" ? [warning] : [];
    } catch {
      return [];
    }
  });
}
function draftWarnings(content2) {
  const { tree, diagnostics } = inspectJsonDocument(content2);
  if (tree?.type !== "object" || diagnostics.length !== 0) return [];
  const node = findNodeAtLocation2(tree, ["label"]);
  if (node?.type !== "string") return [];
  const label = node.value;
  if (label.length > 120 || /[\u0000-\u001f\u007f]/u.test(label) || label.trim() !== "" || new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(label)) !== label) return [];
  return [diagnostic("blank-label", "label", fieldLocation(content2, tree, "label"))];
}
function ProfileWarnings({ warnings: warnings2, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: profileWarnings(warnings2).map((warning) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-warning", "data-dsmm-warning": true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("warningMarker", { code: warning.code, field: warning.field }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("details") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("blankLabelWarning") })
    ] })
  ] }, `${warning.code}:${warning.field}`)) });
}
function IssueDetails({ issue, t }) {
  const safe = safeIssue({
    code: issue.code,
    message: "",
    ...issue.field === void 0 ? {} : { field: issue.field },
    ...issue.reason === void 0 ? {} : { reason: issue.reason },
    ...issue.location === void 0 ? {} : { location: issue.location }
  });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-diagnostic", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("blockingMarker", { code: safe.reason ?? safe.code, field: safe.field ?? "document" }) }),
    safe.location !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("diagnosticLocation", { line: safe.location.line, column: safe.location.column }) }),
    safe.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("details") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t(DIAGNOSTIC_LABELS[safe.reason]) })
    ] })
  ] });
}
var DIAGNOSTIC_LABELS = {
  "invalid-jsonc": "diagnosticJsonc",
  "duplicate-field": "diagnosticDuplicate",
  "unsafe-field": "diagnosticUnsafe",
  "unknown-field": "diagnosticUnknown",
  "deprecated-field": "diagnosticDeprecated",
  "invalid-type": "diagnosticType",
  "unsupported-value": "diagnosticValue",
  "invalid-route": "diagnosticRoute",
  "required-role": "diagnosticRequired",
  "deployment-ceiling": "diagnosticCeiling",
  "blank-label": "blankLabelWarning"
};

// src/client/configuration-display.ts
var writableSelectionVersion = (value) => value === "absent" || isConfigRevision(value);
function configurationVersionState(value) {
  if (value === "absent") return "versionAbsent";
  return isConfigRevision(value) || typeof value === "string" && /^native-v1-\d+$/u.test(value) ? "versionObserved" : "versionUnknown";
}
function sourceRelationship(selection, savedRevision) {
  return selection.sourceRevision === void 0 || savedRevision == null || !isConfigRevision(savedRevision) ? "unknown" : selection.sourceRevision === savedRevision ? "current" : "changed";
}

// src/client/structured.ts
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function route2(value) {
  return record(value) && typeof value.provider === "string" && typeof value.model === "string" && (value.reasoningEffort === void 0 || typeof value.reasoningEffort === "string");
}
function level(value) {
  return route2(value) || record(value) && value.provider === void 0 && value.model === void 0 && typeof value.reasoningEffort === "string";
}
function validTree(node, depth2 = 0) {
  if (depth2 > 32) return false;
  if (node.type === "object") {
    const seen = /* @__PURE__ */ new Set();
    for (const property2 of node.children ?? []) {
      const key = property2.children?.[0]?.value;
      if (typeof key !== "string" || seen.has(key) || ["__proto__", "prototype", "constructor"].includes(key)) return false;
      seen.add(key);
    }
  }
  return (node.children ?? []).every((child2) => validTree(child2, depth2 + 1));
}
function structuredDocument(content2) {
  const errors = [];
  const tree = parseTree2(content2, errors, { allowTrailingComma: true });
  if (errors.length !== 0 || tree === void 0 || !validTree(tree)) return null;
  const document2 = parse2(content2, errors, { allowTrailingComma: true });
  if (errors.length !== 0 || !record(document2) || document2.version !== 1 || typeof document2.id !== "string" || !record(document2.settings) || document2.label !== void 0 && typeof document2.label !== "string") return null;
  const settings = document2.settings;
  if (settings.defaultActive !== void 0 && typeof settings.defaultActive !== "boolean") return null;
  if (settings.locale !== void 0 && typeof settings.locale !== "string") return null;
  if (settings.roles !== void 0 && (!record(settings.roles) || !Object.values(settings.roles).every((value) => typeof value === "boolean"))) return null;
  if (settings.subagents !== void 0 && (!record(settings.subagents) || Object.keys(settings.subagents).some((key) => key !== "toolTopology") || settings.subagents.toolTopology !== void 0 && (typeof settings.subagents.toolTopology !== "string" || !["per-role", "parameterized"].includes(settings.subagents.toolTopology)))) return null;
  if (settings.roleRouting !== void 0 && !record(settings.roleRouting)) return null;
  if (settings.runtimePolicy !== void 0 && !record(settings.runtimePolicy)) return null;
  const runtimePolicy2 = settings.runtimePolicy ?? {};
  const policies = settings.roleRouting ?? {};
  try {
    if (Object.keys(runtimePolicy2).some((key) => key !== "strategy" && key !== "rateLimit")) return null;
    if (runtimePolicy2.strategy !== void 0) normalizeRoutingStrategy(runtimePolicy2.strategy);
    if (runtimePolicy2.rateLimit !== void 0) normalizeRateLimitOverrides(runtimePolicy2.rateLimit);
    for (const [role3, raw] of Object.entries(policies)) {
      if (!record(raw) || Object.keys(raw).some((key) => !["primary", "fallbackRoutes", "strategy", "rateLimit", "levels"].includes(key))) return null;
      if (raw.levels !== void 0 && (role3 === "dsmm-orchestrator" || !record(raw.levels) || Object.entries(raw.levels).some(([key, value]) => !["low", "high", "max"].includes(key) || !level(value)))) return null;
      if (raw.primary !== void 0 && !route2(raw.primary)) return null;
      if (raw.fallbackRoutes !== void 0 && (!Array.isArray(raw.fallbackRoutes) || raw.fallbackRoutes.length > 32 || !raw.fallbackRoutes.every(route2))) return null;
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
    return applyEdits(content2, modify(content2, path, value, {}));
  } catch {
    return null;
  }
}
function moveFallback(content2, role3, from2, to) {
  const document2 = structuredDocument(content2);
  const chain = document2?.roleRouting[role3]?.fallbackRoutes;
  if (chain === void 0 || from2 < 0 || from2 >= chain.length || to < 0 || to >= chain.length) return null;
  const low = Math.min(from2, to), high = Math.max(from2, to);
  const tree = parseTree2(content2);
  if (tree === void 0) return null;
  const nodes = chain.map((_, index) => findNodeAtLocation2(tree, ["settings", "roleRouting", role3, "fallbackRoutes", index]));
  if (nodes.some((node) => node === void 0)) return null;
  const order = nodes.map((node) => content2.slice(node.offset, node.offset + node.length));
  order.splice(to, 0, order.splice(from2, 1)[0]);
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
function canReconcileSelection(snapshot4) {
  return snapshot4 !== null && !snapshot4.refreshRequired && writableSelectionVersion(snapshot4.selectionRevision) && (snapshot4.selectionError === void 0 || snapshot4.selectionError.code === "conflict");
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
    editorEpoch: 0,
    validationEpoch: 0
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
    readProfileView: () => this.store.getSnapshot(),
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
    moveFallback: (role3, from2, to) => this.editFallbackOrder(role3, from2, to),
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
    setFieldInvalid: (field, invalid2) => {
      if (this.disposed) return;
      const invalidFields = this.current.invalidFields.filter((candidate) => candidate !== field);
      if (invalid2) invalidFields.push(field);
      if (invalidFields.join("\n") !== this.current.invalidFields.join("\n")) this.publish({ invalidFields, ...invalid2 ? { dirty: true } : {} });
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
    if (this.disposed || id2 === null || session?.deepwork === void 0 || session.refreshRequired || session.selection.refreshRequired || session.deepwork.locked || session.canToggleMode !== true || this.current.sessionBusy !== null || this.current.busy !== null || this.remote.selectMode === void 0) return;
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
    const { currentSessionId: id2, session, sessionChoice, snapshot: snapshot4 } = this.current;
    if (this.disposed || id2 === null || session === null || session.refreshRequired || session.selection.refreshRequired || !writableSelectionVersion(session.selection.selectionRevision) || (modelOnly ? session.canSelectModel !== true : session.canApplyOverlay !== true || session.applyOverlayUnavailableReason === "new-session-required") || this.current.sessionBusy !== null || this.current.busy !== null || this.current.dirty || this.current.invalidFields.length > 0 || this.current.pendingEditor !== null) return;
    const selectedId = reset ? null : sessionChoice;
    const revision2 = snapshot4?.profiles.find((profile) => profile.id === selectedId)?.revision;
    if (!modelOnly && selectedId !== null && !isConfigRevision(revision2)) return;
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
      if (modelOnly && (accepted.admissionEpoch !== session.admissionEpoch || accepted.deepwork?.revision !== session.deepwork?.revision)) throw { kind: "domain", code: "conflict" };
      if (!live()) return;
      this.publish({ session: accepted, sessionChoice: accepted.selection.selectedId, sessionNotice: useProfileModel ? null : reset ? "reset" : "applied" });
      if (!useProfileModel || accepted.refreshRequired || accepted.selection.refreshRequired || !live()) return;
      if (accepted.canSelectModel !== true || !writableSelectionVersion(accepted.selection.selectionRevision)) {
        this.publish({ sessionIssue: { kind: "assembly", code: accepted.selectModelUnavailableReason ?? "unavailable", source: "profile-model" } });
        return;
      }
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
        const { provider, model, reasoningEffort } = accepted.profileModel;
        await this.unwrap(selector.selectModel({
          sessionId: id2,
          provider,
          model,
          ...reasoningEffort === void 0 ? {} : { reasoningEffort }
        }));
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
      throw safeIssue(result.error.details);
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
      if (live()) {
        const issue = this.issue(error);
        this.publish({ issue, ...busy === "save" && issue.kind === "domain" && issue.code === "validation" ? { validationEpoch: this.current.validationEpoch + 1 } : {} });
      }
    } finally {
      if (live()) this.publish({ busy: null });
    }
  }
  async refresh() {
    await this.perform("refresh", async (live) => {
      const snapshot4 = await this.unwrap(this.remote.describe());
      if (live()) this.publish({ snapshot: snapshot4 });
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
    if (editor === null || editor.refreshRequired || this.current.busy !== null || this.current.pendingEditor !== null) return;
    this.publish({ editor: { ...editor, content: content2 }, dirty: this.accepted === null || this.accepted.content !== content2 || this.accepted.id !== editor.id, issue: null, notice: null });
  }
  editPath(path, value) {
    const editor = this.current.editor;
    if (editor === null || editor.refreshRequired || this.current.busy !== null || this.current.pendingEditor !== null) return;
    const content2 = editStructuredPath(editor.content, path, value);
    if (content2 === null) {
      this.publish({ issue: { kind: "domain", code: "validation", field: "content" }, notice: null });
      return;
    }
    this.editContent(content2);
  }
  editRoute(path, provider, model) {
    const editor = this.current.editor;
    if (editor === null || editor.refreshRequired || this.current.busy !== null || this.current.pendingEditor !== null) return;
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
  editFallbackOrder(role3, from2, to) {
    const editor = this.current.editor;
    if (editor === null || editor.refreshRequired || this.current.busy !== null || this.current.pendingEditor !== null) return;
    const content2 = moveFallback(editor.content, role3, from2, to);
    if (content2 !== null) this.editContent(content2);
  }
  async save() {
    const editor = this.current.editor;
    if (editor === null || editor.refreshRequired || editor.revision !== null && !isConfigRevision(editor.revision) || !this.current.dirty || this.current.snapshot === null || this.current.busy !== null || this.current.pendingEditor !== null || this.current.invalidFields.length > 0) return;
    if (!isProfileId(editor.id)) {
      this.publish({ issue: { kind: "domain", code: "validation", field: "id" }, notice: null, validationEpoch: this.current.validationEpoch + 1 });
      return;
    }
    await this.perform("save", async (live) => {
      const document2 = await this.unwrap(this.remote.save({ id: editor.id, content: editor.content, expectedRevision: editor.revision }), "content");
      if (!live()) return;
      this.accept(document2);
      const old = this.current.snapshot;
      const profiles = old.profiles.filter((item) => item.id !== document2.id);
      profiles.push({ id: document2.id, revision: document2.revision, ...document2.label === void 0 ? {} : { label: document2.label }, ...document2.warnings === void 0 ? {} : { warnings: document2.warnings } });
      profiles.sort((a, b) => a.id.localeCompare(b.id));
      this.publish({ snapshot: { ...old, profiles }, notice: { key: "saved", id: document2.id } });
    });
  }
  async apply() {
    const { editor, snapshot: snapshot4, dirty } = this.current;
    if (editor?.refreshRequired || !isConfigRevision(editor?.revision) || !canReconcileSelection(snapshot4) || dirty) return;
    await this.perform("apply", async (live) => {
      const accepted = await this.unwrap(this.remote.select({ id: editor.id, expectedRevision: editor.revision, expectedSelectionRevision: snapshot4.selectionRevision }));
      if (live()) this.acceptSelection(accepted, { key: "applied", id: accepted.selectedId ?? void 0 });
    });
  }
  async reset() {
    const snapshot4 = this.current.snapshot;
    if (!canReconcileSelection(snapshot4)) return;
    await this.perform("reset", async (live) => {
      const accepted = await this.unwrap(this.remote.select({ id: null, expectedSelectionRevision: snapshot4.selectionRevision }));
      if (live()) this.acceptSelection(accepted, { key: "reset" });
    });
  }
  acceptSelection(snapshot4, notice) {
    this.publish({
      snapshot: snapshot4,
      notice: snapshot4.selectionError === void 0 ? notice : null,
      issue: snapshot4.selectionError === void 0 ? null : { ...safeIssue(snapshot4.selectionError), source: "selection" }
    });
  }
};

// src/client/locales.ts
var NS = "settings.dsmm-profiles";
var en = {
  diagnosticJsonc: "Correct the JSONC syntax at the indicated location.",
  diagnosticDuplicate: "Remove the duplicate field at this location.",
  diagnosticUnsafe: "Unsafe object keys are not supported; remove this field.",
  diagnosticUnknown: "Remove this unsupported field. Private and installation configuration belongs in native deployment settings.",
  diagnosticDeprecated: "This retired field is rejected. Configure explicit role levels instead; no migration is performed.",
  diagnosticType: "Use the declared field type and bounded value.",
  diagnosticValue: "Choose an explicitly supported value. Output-language choices are shown in the structured language field.",
  diagnosticRoute: "Use a complete provider/model route or a nonempty exact-effort override.",
  diagnosticRequired: "This role is required by the selected Deepwork policy and cannot be disabled.",
  diagnosticCeiling: "A named profile cannot enable capabilities outside its captured startup/deployment ceiling.",
  browseZone: "Browse saved profiles",
  editZone: "Edit draft",
  savedRevision: "Saved revision: {revision}",
  savedInventory: "Saved profiles and diagnostics",
  futurePin: "Future selection revision: {revision}",
  noEditor: "Open a saved profile or create a draft to edit. Browsing does not activate a profile.",
  warningMarker: "Warning · nonblocking · {code} · {field}",
  blockingMarker: "Blocked · {code} · {field}",
  blankLabelWarning: "The label is blank. The profile ID is used for display; the original document can still be saved and selected.",
  diagnosticLocation: "JSONC line {line}, column {column}.",
  savedWarnings: "Saved revision warnings",
  draftWarnings: "Draft warnings",
  futureWarnings: "Future-default pin warnings",
  admissionWarnings: "Current-admission warnings",
  warningProfile: "warning (nonblocking)",
  omitLabel: "Inherit display name from ID (omit label)",
  businessLocale: "Default output language",
  inheritLocale: "Inherit deployment / native language",
  unsupportedLocale: "Unsupported draft language — choose an allowed value",
  localeHint: "Omitted locale inherits the deployment preference, then native/user language. An explicit user request wins. This never changes the interface language.",
  toolTopology: "Subagent tool topology",
  topologyHint: "per-role exposes role tools plus the category entry; parameterized exposes role/category entries. Omitted inherits deployment (default per-role). Background, depth and route-override permissions remain deployment-only.",
  levelName: "Invocation level: {level}",
  levelMode: "{level} override",
  levelUnconfigured: "Not configured / inherit deployment level",
  levelEffortOnly: "Exact effort only",
  levelFullRoute: "Complete provider/model route",
  normalLevel: "normal · default route (read-only alias; omission means normal)",
  orchestratorLevels: "The ordinary orchestrator root has no invocation levels. Its native model is unchanged.",
  levelsHint: "Levels are call resources, not workflow tiers. An unconfigured requested level is rejected; an effort-only override uses the resolved model. An explicit complete route replaces model and effort together.",
  namedRole: "{name} named-profile availability",
  namedRoleHint: "Omitted inherits the captured deployment ceiling. Required roles cannot be disabled; enable requests cannot lift startup or deployment restrictions. Routing remains editable even for disabled roles.",
  availabilityUnknown: "Role availability metadata is unavailable. Required status and startup/deployment ceilings cannot be inferred; refresh before requesting an availability change.",
  roleRequired: "Required role · {reason}",
  roleOptional: "Optional role",
  roleCeiling: "Startup: {startup}; deployment: {deployment}; captured admission: {admitted}.",
  roleProvenance: "Source: {source}; capture: {capture}.",
  roleUnavailableReason: "Availability reason: {reason}.",
  admittedRoles: "Captured role availability",
  bindingUnknown: "Subagent runtime binding is unconfirmed; no delivery-readiness guarantee can be inferred from configuration.",
  bindingState: "Captured subagent binding: {binding}; delivery fence: {ready}; restart required: {restart}. Fence readiness does not establish persistence or child-delegation support.",
  bindingReason: "Binding reason: {reason}.",
  sessionModelHint: "Apply/Baseline keep the native root model and existing children. Only Use profile model explicitly asks native model selection to change.",
  savedOnlyHint: "Select the editor's saved immutable revision, not its dirty draft. Save does not select or apply it.",
  centralOrigin: "Named resources: shared central store.",
  legacyOrigin: "Named resources: legacy native-profile store (read-only).",
  explicitOrigin: "Named resources: explicitly configured store.",
  readOnlyOrigin: "This legacy store is read-only. Files are not copied or migrated; selection and current-session actions retain their own authority.",
  headerCompactProfiles: "Profiles · keep model",
  headerCompactRefresh: "Refresh",
  headerNoSession: "Select a session to make changes.",
  sessionNewRequired: "Applying a profile or baseline requires a new session. Save and future-default selection remain available.",
  sessionModuleOff: "Deepwork is unavailable within this session's captured module settings.",
  headerModeEnable: "Enable Deepwork",
  headerModeDisable: "Disable Deepwork",
  headerModePreset: "Deepwork · DW preset",
  headerModeUnavailable: "Deepwork unavailable",
  headerModeOn: "Deepwork enabled.",
  headerModeOff: "Deepwork disabled.",
  headerUseCurrentModel: "Use profile model",
  title: "Deepwork Profiles",
  description: "Save independent runtime configurations and choose which one new sessions use.",
  newSessions: "This saved pin is the default for future sessions only. Current admissions and existing children remain unchanged; explicit session selections retain their own authority.",
  editorSelect: "Profile to edit",
  choose: "Choose a profile",
  newDraft: "New unsaved profile",
  new: "New profile",
  profileId: "Profile ID (name)",
  idHint: "Use 1–64 lowercase letters, digits, hyphens or underscores. The ID cannot be changed after saving. Add an optional display label in the JSONC document.",
  configuration: "Runtime configuration (JSONC)",
  configurationHint: "Document: version 1, matching id, optional label, and settings. Runtime overlays support role routes/levels, locale, role availability, topology, workflow, guards, recovery, calibration and default effort. Retired max-preset fields are rejected, not migrated.",
  structuralHint: "Skills, prompt content, preset installation, providers/accounts, background/depth and arbitrary route permissions remain deployment-only. Never paste credentials. JSONC and structured controls edit the same draft without normalizing unrelated bytes.",
  save: "Save profile",
  saving: "Saving profile…",
  apply: "Set as future default",
  applying: "Selecting future default…",
  reset: "Use baseline for future sessions",
  resetting: "Resetting future default…",
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
  dirty: "Draft differs from the saved version. Save or explicitly discard before selecting it.",
  savedNotApplied: "Saved source version differs from the recorded future-default source, or this profile is not selected.",
  savedApplied: "Saved source version matches the recorded future-default source, not necessarily the current admission.",
  versionObserved: "Metadata observed",
  versionAbsent: "Not stored",
  versionUnknown: "Version unavailable",
  savedRelationshipUnknown: "Saved; relationship to the selected source version is unknown. Refresh to inspect current metadata.",
  savedRefreshRequired: "Committed — reload the affected source before editing or selecting it again. No automatic replay.",
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
  globalActionHint: "Set as future default selects only the saved revision for future sessions. It does not apply to the current session.",
  headerProfile: "Profile",
  headerProfileLabel: "Current-session profile (header)",
  headerCaptured: "captured admission · exact profile unavailable",
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
  noSession: "No native session is selected. Applying to the current session is unavailable.",
  sessionUnavailable: "The current session could not be confirmed. Refresh its state before retrying; the prior policy is kept.",
  sessionBusy: "Switching is unavailable: {reason}. The Host must reserve a truly idle ordinary session before applying.",
  sessionState: "Current admission: {profile}; scope {scope}.",
  sessionBaseline: "deployment baseline",
  sessionGlobalCaptured: "captured admission (exact profile identity unavailable)",
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
  diagnosticJsonc: "请修正所示位置的 JSONC 语法。",
  diagnosticDuplicate: "请删除此位置的重复字段。",
  diagnosticUnsafe: "不支持不安全对象键，请删除此字段。",
  diagnosticUnknown: "请删除不支持的字段。私有及安装配置应放在原生部署设置中。",
  diagnosticDeprecated: "此已退休字段被拒绝，请改用明确的角色调用等级，不自动迁移。",
  diagnosticType: "请使用声明的字段类型和有界数值。",
  diagnosticValue: "请选择明确支持的值。允许的输出语言见结构化语言字段。",
  diagnosticRoute: "请提供完整提供商与模型路由，或非空精确强度覆盖。",
  diagnosticRequired: "所选 Deepwork 策略要求此角色，不可禁用。",
  diagnosticCeiling: "具名配置档不能启用超出已捕获启动或部署上限的能力。",
  browseZone: "浏览已保存配置档",
  editZone: "编辑草稿",
  savedRevision: "保存的修订：{revision}",
  savedInventory: "已保存配置档与诊断",
  futurePin: "未来默认选择修订：{revision}",
  noEditor: "打开已保存配置档或新建草稿。浏览不会启用配置档。",
  warningMarker: "警告 · 不阻断 · {code} · {field}",
  blockingMarker: "已阻断 · {code} · {field}",
  blankLabelWarning: "显示名称为空，使用配置档 ID 显示。原文仍可保存和选择。",
  diagnosticLocation: "JSONC 第 {line} 行，第 {column} 列。",
  savedWarnings: "保存修订的警告",
  draftWarnings: "草稿警告",
  futureWarnings: "未来默认固定修订的警告",
  admissionWarnings: "当前准入的警告",
  warningProfile: "警告（不阻断）",
  omitLabel: "使用 ID 显示（省略 label）",
  businessLocale: "默认输出语言",
  inheritLocale: "继承部署或原生语言",
  unsupportedLocale: "草稿语言不受支持，请选择允许值",
  localeHint: "省略 locale 时继承部署偏好，再继承原生或用户语言。本次用户明确请求优先，不改变界面语言。",
  toolTopology: "子 Agent 工具拓扑",
  topologyHint: "per-role 暴露角色工具及类别入口；parameterized 暴露角色与类别参数化入口。省略时继承部署（默认 per-role）。后台、深度及路由覆盖权限仅可在部署中配置。",
  levelName: "调用资源等级：{level}",
  levelMode: "{level} 覆盖",
  levelUnconfigured: "未配置或继承部署等级",
  levelEffortOnly: "仅精确推理强度",
  levelFullRoute: "完整提供商与模型路由",
  normalLevel: "normal · 默认路由（只读别名；省略即 normal）",
  orchestratorLevels: "普通 orchestrator 根会话没有调用等级，不改变其原生模型。",
  levelsHint: "等级代表调用资源，不代表流程等级。请求未配置等级会被拒绝；仅强度覆盖使用已解析模型；完整路由同时替换模型和强度。",
  namedRole: "{name} 的具名配置可用性",
  namedRoleHint: "省略时继承已捕获部署上限。必需角色不可禁用；启用请求不能突破启动或部署限制。禁用角色仍可编辑路由。",
  availabilityUnknown: "角色可用性元数据不可用，不能猜测必需集合或启动与部署上限。请求更改可用性前请刷新。",
  roleRequired: "必需角色 · {reason}",
  roleOptional: "可选角色",
  roleCeiling: "启动：{startup}；部署：{deployment}；捕获准入：{admitted}。",
  roleProvenance: "来源：{source}；捕获：{capture}。",
  roleUnavailableReason: "可用性原因：{reason}。",
  admittedRoles: "已捕获角色可用性",
  bindingUnknown: "尚未确认子 Agent 运行时绑定，不能从配置推断投递守卫已就绪。",
  bindingState: "捕获的子 Agent 绑定：{binding}；投递守卫：{ready}；需重启：{restart}。守卫就绪不证明持久化或 child 委派支持。",
  bindingReason: "绑定原因：{reason}。",
  sessionModelHint: "应用或固定基线保留原生根模型和已有子会话。只有「使用配置档模型」会明确请求原生模型切换。",
  savedOnlyHint: "选择编辑器对应的已保存固定修订，而不是脏草稿。保存不会选择或应用。",
  centralOrigin: "具名资源：共享中央存储。",
  legacyOrigin: "具名资源：旧原生配置存储（只读）。",
  explicitOrigin: "具名资源：显式指定的存储。",
  readOnlyOrigin: "此旧存储只读，不复制或迁移文件；选择与当前会话操作仍使用各自的权限。",
  headerCompactProfiles: "配置档 · 保留模型",
  headerCompactRefresh: "刷新",
  headerNoSession: "选择会话后可更改。",
  sessionNewRequired: "应用配置档或基线需要新会话。仍可保存配置档或设置未来默认。",
  sessionModuleOff: "此会话捕获的模块设置不允许使用 Deepwork。",
  headerModeEnable: "启用 Deepwork",
  headerModeDisable: "关闭 Deepwork",
  headerModePreset: "Deepwork · DW 预设",
  headerModeUnavailable: "Deepwork 不可用",
  headerModeOn: "Deepwork 已启用。",
  headerModeOff: "Deepwork 已关闭。",
  headerUseCurrentModel: "使用配置档模型",
  title: "Deepwork 配置档",
  description: "保存独立的运行时配置，并选择新会话使用的配置档。",
  newSessions: "此固定修订仅作为未来会话默认值。当前准入与已有子会话不变；明确的会话选择保留自己的权限。",
  editorSelect: "要编辑的配置档",
  choose: "选择配置档",
  newDraft: "新的未保存配置档",
  new: "新建配置档",
  profileId: "配置档 ID（名称）",
  idHint: "使用 1–64 个小写字母、数字、连字符或下划线。保存后不能修改 ID。可在 JSONC 文档中添加可选的显示名称 label。",
  configuration: "运行时配置（JSONC）",
  configurationHint: "文档包含 version: 1、相同 id、可选 label 和 settings。支持角色路由与调用等级、语言、角色可用性、拓扑、流程、守卫、恢复、校准与默认推理强度。已退休的最高强度预设字段会被拒绝，不自动迁移。",
  structuralHint: "技能、提示内容、预设安装、提供商与账户、后台与深度及任意路由权限仅可在部署中配置。请勿粘贴凭证。JSONC 与结构化控件共享草稿，不规范化无关字节。",
  save: "保存配置档",
  saving: "正在保存配置档…",
  apply: "设为未来默认",
  applying: "正在选择未来默认…",
  reset: "未来会话使用基线",
  resetting: "正在重置未来默认…",
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
  dirty: "草稿与保存版本不同。选择前请保存或明确丢弃。",
  savedNotApplied: "保存的来源版本与未来默认记录不同，或尚未选择此配置档。",
  savedApplied: "保存的来源版本与未来默认记录一致，但未必是当前准入。",
  versionObserved: "已观测元数据",
  versionAbsent: "未存储",
  versionUnknown: "版本不可用",
  savedRelationshipUnknown: "已保存；与所选来源版本的关系未知，请刷新核对当前元数据。",
  savedRefreshRequired: "已提交——请重新加载受影响的来源后再编辑或选择，不会自动重放。",
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
  globalActionHint: "「设为未来默认」只为未来会话选择已保存修订，不应用到当前会话。",
  headerProfile: "配置档",
  headerProfileLabel: "当前会话配置档（会话栏）",
  headerCaptured: "已捕获准入 · 精确配置档不可用",
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
  noSession: "未选择原生会话。无法应用到当前会话。",
  sessionUnavailable: "无法确认当前会话。重试前请刷新状态；原策略已保留。",
  sessionBusy: "暂不可切换：{reason}。Host 必须先保留真正空闲的普通会话。",
  sessionState: "当前准入：{profile}；范围 {scope}。",
  sessionBaseline: "部署基线",
  sessionGlobalCaptured: "已捕获准入（精确配置档身份不可用）",
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
var import_react4 = require("react");
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/StructuredEditor.tsx
var import_react2 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/profile-locale.ts
var DSMM_LOCALES = ["en", "zh-Hans", "zh-Hant", "ja", "ko", "de", "fr", "es", "pt-BR", "ru"];

// src/client/RoleAvailability.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function roleAvailability(value) {
  if (value === void 0) return void 0;
  try {
    return parseRoleAvailability(value);
  } catch {
    return void 0;
  }
}
function RoleAvailability({ value, t }) {
  const state = roleAvailability(value);
  if (state === void 0) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsmm-hint", children: t("availabilityUnknown") });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsmm-availability", "data-dsmm-role-availability": state.id, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t(state.required ? "roleRequired" : "roleOptional", { reason: state.requiredReason ?? "—" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t("roleCeiling", { startup: t(state.startupAvailable ? "enabled" : "disabled"), deployment: t(state.deploymentEnabled ? "enabled" : "disabled"), admitted: t(state.admitted ? "enabled" : "disabled") }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsmm-hint", children: t("roleProvenance", { source: state.source, capture: state.capture }) }),
    state.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t("roleUnavailableReason", { reason: state.reason }) })
  ] });
}

// src/client/EditableChoice.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime3 = require("react/jsx-runtime");
function EditableChoice({ id: id2, label, value, options, disabled, placeholder, onChange, onSelect }) {
  const input = (0, import_react.useRef)(null);
  const [open, setOpen] = (0, import_react.useState)(false);
  const [activeId, setActiveId] = (0, import_react.useState)(null);
  const distinct = new Map(options.map((option) => [option.id, option]));
  if (value !== "" && !distinct.has(value)) distinct.set(value, { id: value, name: value });
  const choices = [...distinct.values()];
  const activeIndex = choices.findIndex((option) => option.id === activeId);
  const visible = open && !disabled && choices.length > 0;
  const close = () => {
    setOpen(false);
    setActiveId(null);
  };
  const choose = (next) => {
    if (next !== value) (onSelect ?? onChange)(next);
    close();
  };
  (0, import_react.useEffect)(() => {
    if (disabled) close();
  }, [disabled]);
  (0, import_react.useEffect)(() => {
    if (activeId !== null && activeIndex < 0) setActiveId(null);
  }, [activeId, activeIndex]);
  (0, import_react.useEffect)(() => {
    if (visible && activeIndex >= 0) document.getElementById(`${id2}-choice-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [id2, visible, activeIndex]);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-choice", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives.Input,
      {
        ref: input,
        id: id2,
        className: "dsmm-input",
        role: "combobox",
        "aria-autocomplete": "list",
        "aria-expanded": visible,
        "aria-controls": visible ? `${id2}-choices` : void 0,
        "aria-activedescendant": visible && activeIndex >= 0 ? `${id2}-choice-${activeIndex}` : void 0,
        value,
        disabled,
        placeholder,
        autoComplete: "off",
        onBlur: close,
        onChange: (event) => {
          onChange(event.currentTarget.value);
          setOpen(true);
          setActiveId(null);
        },
        onKeyDown: (event) => {
          if (event.nativeEvent.isComposing) return;
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && choices.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
            const next = event.key === "ArrowDown" ? !visible || activeIndex < 0 ? 0 : (activeIndex + 1) % choices.length : !visible || activeIndex < 0 ? choices.length - 1 : (activeIndex - 1 + choices.length) % choices.length;
            setActiveId(choices[next].id);
          } else if (visible && (event.key === "Escape" || event.key === "Enter")) {
            event.preventDefault();
            event.stopPropagation();
            if (event.key === "Enter" && activeIndex >= 0) choose(choices[activeIndex].id);
            else close();
          }
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives.Button,
      {
        type: "button",
        size: "sm",
        variant: "toolbar",
        tabIndex: -1,
        className: "dsmm-choice-toggle",
        "aria-label": label,
        "aria-haspopup": "listbox",
        "aria-expanded": visible,
        disabled: disabled || choices.length === 0,
        icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {}),
        onMouseDown: (event) => event.preventDefault(),
        onClick: () => {
          input.current?.focus();
          setOpen(!visible);
          setActiveId(null);
        }
      }
    ),
    visible && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { className: "dsmm-choice-list", id: `${id2}-choices`, role: "listbox", "aria-label": label, children: choices.map((option, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "li",
      {
        id: `${id2}-choice-${index}`,
        role: "option",
        "data-value": option.id,
        "aria-selected": option.id === activeId,
        onMouseDown: (event) => event.preventDefault(),
        onClick: () => choose(option.id),
        children: option.name === option.id ? option.id : `${option.name} (${option.id})`
      },
      option.id
    )) })
  ] });
}

// src/client/StructuredEditor.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function RetryNumber({ id: id2, name, field, value, inherited, path, disabled, actions: actions2, t }) {
  const [draft2, setDraft] = (0, import_react2.useState)(value === void 0 ? "" : String(value));
  const [invalid2, setInvalid] = (0, import_react2.useState)(false);
  const [min, max] = DSMM_RATE_LIMIT_BOUNDS[field];
  const key = path.join(".");
  (0, import_react2.useEffect)(() => {
    setDraft(value === void 0 ? "" : String(value));
    setInvalid(false);
  }, [value]);
  (0, import_react2.useEffect)(() => {
    actions2.setFieldInvalid(key, invalid2);
    return () => actions2.setFieldInvalid(key, false);
  }, [actions2.setFieldInvalid, key, invalid2]);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: id2, children: t("retryField", { name, field: t(RETRY_FIELD_LABEL_KEYS[field]) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      import_dsh_client_ui_primitives2.Input,
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
        value: draft2,
        placeholder: inherited === void 0 ? t("unknownDefault") : t("inheritNumber", { value: inherited }),
        "aria-invalid": invalid2 || void 0,
        "aria-describedby": `${id2}-hint${invalid2 ? ` ${id2}-invalid` : ""}`,
        onChange: (event) => {
          const input = event.currentTarget;
          setDraft(input.value);
          const valid = input.validity.valid && (input.value === "" || Number.isSafeInteger(input.valueAsNumber));
          setInvalid(!valid);
          actions2.setFieldInvalid(key, !valid);
          if (valid) actions2.editPath(path, input.value === "" ? void 0 : input.valueAsNumber);
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", id: `${id2}-hint`, children: t("retryBounds", { min, max, value: inherited ?? t("unknownDefault") }) }),
    invalid2 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { id: `${id2}-invalid`, children: t("invalidNumber") })
  ] });
}
function RouteFields({ value, path, name, catalog, disabled, edit, editRoute, t }) {
  const prefix = (0, import_react2.useId)();
  const providers = catalog?.groups ?? [];
  const group = providers.find((candidate) => candidate.id === value.provider);
  const model = group?.models.find((candidate) => candidate.id === value.model);
  const efforts = model?.reasoning?.efforts ?? [];
  const updateModel = (provider, modelId) => {
    editRoute(path, provider, modelId);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-route-fields", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-provider`, children: t("routeProvider", { name }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        EditableChoice,
        {
          id: `${prefix}-provider`,
          label: t("routeProvider", { name }),
          value: value.provider,
          options: providers,
          disabled,
          onChange: (provider) => updateModel(provider, value.model),
          onSelect: (provider) => updateModel(provider, "")
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-model`, children: t("routeModel", { name }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        EditableChoice,
        {
          id: `${prefix}-model`,
          label: t("routeModel", { name }),
          value: value.model,
          options: group?.models ?? [],
          disabled,
          onChange: (modelId) => updateModel(value.provider, modelId)
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-effort`, children: t("routeEffort", { name }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        EditableChoice,
        {
          id: `${prefix}-effort`,
          label: t("routeEffort", { name }),
          value: value.reasoningEffort ?? "",
          options: efforts,
          disabled,
          placeholder: t("effortDefault"),
          onChange: (effort) => edit([...path, "reasoningEffort"], effort || void 0)
        }
      )
    ] })
  ] });
}
function PolicyFields({ value, inherited, path, name, disabled, actions: actions2, t }) {
  const prefix = (0, import_react2.useId)();
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-policy-fields", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-strategy`, children: t("strategy", { name }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { id: `${prefix}-strategy`, disabled, value: value.strategy ?? "", onChange: (event) => actions2.editPath([...path, "strategy"], event.currentTarget.value || void 0), children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "", children: t("inheritStrategy", { value: inherited?.strategy ?? t("unknownDefault") }) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "startup-lock", children: t("startupLock") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "rate-limit-fallback", children: t("rateFallback") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", children: t("strategyHint") }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsmm-route-fields", children: Object.keys(DSMM_RATE_LIMIT_BOUNDS).map((field) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RetryNumber, { id: `${prefix}-${field}`, t, name, field, value: value.rateLimit?.[field], inherited: inherited?.rateLimit[field], path: [...path, "rateLimit", field], disabled, actions: actions2 }, field)) })
  ] });
}
function LevelFields({ level: level2, value, path, catalog, disabled, actions: actions2, t }) {
  const prefix = (0, import_react2.useId)();
  const mode = value === void 0 ? "inherit" : value.provider === void 0 ? "effort" : "route";
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("fieldset", { "data-dsmm-level": level2, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("legend", { children: t("levelName", { level: level2 }) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-mode`, children: t("levelMode", { level: level2 }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { id: `${prefix}-mode`, value: mode, disabled, onChange: (event) => actions2.editPath(
        path,
        event.currentTarget.value === "inherit" ? void 0 : event.currentTarget.value === "effort" ? { reasoningEffort: "" } : { provider: "", model: "" }
      ), children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "inherit", children: t("levelUnconfigured") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "effort", children: t("levelEffortOnly") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "route", children: t("levelFullRoute") })
      ] })
    ] }),
    mode === "effort" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-effort`, children: t("routeEffort", { name: level2 }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        EditableChoice,
        {
          id: `${prefix}-effort`,
          label: t("routeEffort", { name: level2 }),
          value: value?.reasoningEffort ?? "",
          options: [],
          disabled,
          onChange: (effort) => actions2.editPath([...path, "reasoningEffort"], effort)
        }
      )
    ] }),
    value?.provider !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RouteFields, { value, path, name: t("levelName", { level: level2 }), catalog, disabled, edit: actions2.editPath, editRoute: actions2.editRoute, t })
  ] });
}
function StructuredEditor({ state, actions: actions2, disabled, t }) {
  const prefix = (0, import_react2.useId)();
  const [selectedRole, setSelectedRole] = (0, import_react2.useState)("dsmm-orchestrator");
  const document2 = state.editor === null ? null : structuredDocument(state.editor.content);
  if (document2 === null) return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", "data-dsmm-structured-invalid": true, children: t("rawInvalid") });
  const roles2 = state.snapshot?.roles ?? [];
  const role3 = roles2.find((candidate) => candidate.id === selectedRole) ?? roles2[0];
  const policy = role3 === void 0 ? void 0 : document2.roleRouting[role3.id] ?? {};
  const baseline = state.snapshot?.editorDefaults;
  let inherited;
  try {
    if (baseline !== void 0) {
      const profileDefaults = { strategy: document2.runtimePolicy.strategy ?? baseline.strategy, rateLimit: normalizeRateLimitPolicy(document2.runtimePolicy.rateLimit, baseline.rateLimit) };
      inherited = { strategy: role3?.runtimePolicy?.strategy ?? profileDefaults.strategy, rateLimit: normalizeRateLimitPolicy(role3?.runtimePolicy?.rateLimit, profileDefaults.rateLimit) };
    }
  } catch {
  }
  const rolePath = ["settings", "roleRouting", role3?.id ?? ""];
  const availability2 = roleAvailability(role3?.availability);
  const namedRoles = document2.settings.roles;
  const topology = document2.settings.subagents?.toolTopology;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-structured", "data-dsmm-structured": true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-label`, children: t("profileLabel") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives2.Input, { id: `${prefix}-label`, className: "dsmm-input", value: document2.label ?? "", disabled, onChange: (event) => actions2.editPath(["label"], event.currentTarget.value) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives2.Button, { type: "button", variant: "outline", disabled: disabled || document2.label === void 0, onClick: () => actions2.editPath(["label"], void 0), children: t("omitLabel") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-locale`, children: t("businessLocale") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { id: `${prefix}-locale`, value: String(document2.settings.locale ?? ""), disabled, "aria-describedby": `${prefix}-locale-hint`, onChange: (event) => actions2.editPath(["settings", "locale"], event.currentTarget.value || void 0), children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "", children: t("inheritLocale") }),
        typeof document2.settings.locale === "string" && !DSMM_LOCALES.includes(document2.settings.locale) && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: document2.settings.locale, children: t("unsupportedLocale") }),
        DSMM_LOCALES.map((locale) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: locale, children: locale }, locale))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { id: `${prefix}-locale-hint`, className: "dsmm-hint", children: t("localeHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-topology`, children: t("toolTopology") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { id: `${prefix}-topology`, value: topology ?? "", disabled, "aria-describedby": `${prefix}-topology-hint`, onChange: (event) => actions2.editPath(["settings", "subagents", "toolTopology"], event.currentTarget.value || void 0), children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "", children: t("inherit") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "per-role", children: "per-role" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "parameterized", children: "parameterized" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { id: `${prefix}-topology-hint`, className: "dsmm-hint", children: t("topologyHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-active`, children: t("defaultActive") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { id: `${prefix}-active`, disabled, value: document2.settings.defaultActive === void 0 ? "" : String(document2.settings.defaultActive), onChange: (event) => actions2.editPath(["settings", "defaultActive"], event.currentTarget.value === "" ? void 0 : event.currentTarget.value === "true"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "", children: t("inherit") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "true", children: t("enabled") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "false", children: t("disabled") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", children: t("activeHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("fieldset", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("legend", { children: t("profileDefaults") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(PolicyFields, { t, value: document2.runtimePolicy, inherited: baseline, path: ["settings", "runtimePolicy"], name: t("profileDefaults"), disabled, actions: actions2 })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-role`, children: t("roleSelect") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { id: `${prefix}-role`, disabled: disabled || roles2.length === 0 || state.invalidFields.length > 0, value: role3?.id ?? "", onChange: (event) => setSelectedRole(event.currentTarget.value), children: [
        roles2.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "", children: t("rolesUnavailable") }),
        roles2.map((candidate) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("option", { value: candidate.id, children: [
          candidate.label,
          candidate.enabled ? "" : ` — ${t("roleDisabled")}`
        ] }, candidate.id))
      ] })
    ] }),
    role3 !== void 0 && policy !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("fieldset", { "data-dsmm-role": role3.id, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("legend", { children: role3.label }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RoleAvailability, { value: role3.availability, t }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-role-enabled`, children: t("namedRole", { name: role3.label }) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { id: `${prefix}-role-enabled`, value: namedRoles?.[role3.id] === void 0 ? "" : String(namedRoles[role3.id]), disabled, "aria-describedby": `${prefix}-role-hint`, onChange: (event) => actions2.editPath(["settings", "roles", role3.id], event.currentTarget.value === "" ? void 0 : event.currentTarget.value === "true"), children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "", children: t("inherit") }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "true", disabled: availability2 === void 0 || !availability2.startupAvailable || !availability2.deploymentEnabled || availability2.reason === "module-off", children: t("enabled") }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "false", disabled: availability2 === void 0 || availability2.required, children: t("disabled") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { id: `${prefix}-role-hint`, className: "dsmm-hint", children: t("namedRoleHint") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(PolicyFields, { t, value: policy, inherited, path: rolePath, name: role3.label, disabled, actions: actions2 }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-primary-mode`, children: t("primaryMode", { name: role3.label }) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { id: `${prefix}-primary-mode`, disabled, value: policy.primary === void 0 ? "inherit" : "explicit", onChange: (event) => actions2.editPath([...rolePath, "primary"], event.currentTarget.value === "inherit" ? void 0 : { provider: "", model: "" }), children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "inherit", children: t("inheritRoute") }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "explicit", children: t("configuredRoute") })
        ] })
      ] }),
      policy.primary !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RouteFields, { t, value: policy.primary, path: [...rolePath, "primary"], name: t("primaryName", { name: role3.label }), catalog: state.catalog, disabled, edit: actions2.editPath, editRoute: actions2.editRoute }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", children: t("effortChangeHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", children: t("normalLevel") }),
      role3.id === "dsmm-orchestrator" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", children: t("orchestratorLevels") }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", children: t("levelsHint") }),
        ["low", "high", "max"].map((level2) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(LevelFields, { level: level2, value: policy.levels?.[level2], path: [...rolePath, "levels", level2], catalog: state.catalog, disabled, actions: actions2, t }, level2))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-fallback-mode`, children: t("fallbackMode", { name: role3.label }) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { id: `${prefix}-fallback-mode`, disabled, value: policy.fallbackRoutes === void 0 ? "inherit" : "explicit", onChange: (event) => actions2.editPath([...rolePath, "fallbackRoutes"], event.currentTarget.value === "inherit" ? void 0 : []), children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "inherit", children: t("inheritChain") }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "explicit", children: t("configuredChain") })
        ] })
      ] }),
      policy.fallbackRoutes?.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", children: t("emptyChain") }),
      policy.fallbackRoutes?.map((candidate, index) => {
        const name = t("fallbackName", { name: role3.label, index: index + 1 });
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("fieldset", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("legend", { children: name }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RouteFields, { t, value: candidate, path: [...rolePath, "fallbackRoutes", index], name, catalog: state.catalog, disabled, edit: actions2.editPath, editRoute: actions2.editRoute }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives2.Button, { type: "button", variant: "outline", disabled: disabled || index === 0, onClick: () => actions2.moveFallback(role3.id, index, index - 1), children: t("moveUp", { name }) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives2.Button, { type: "button", variant: "outline", disabled: disabled || index === policy.fallbackRoutes.length - 1, onClick: () => actions2.moveFallback(role3.id, index, index + 1), children: t("moveDown", { name }) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives2.Button, { type: "button", variant: "outline", disabled, onClick: () => actions2.editPath([...rolePath, "fallbackRoutes", index], void 0), children: t("removeFallback", { name }) })
          ] })
        ] }, index);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives2.Button, { type: "button", variant: "outline", disabled: disabled || (policy.fallbackRoutes?.length ?? 0) >= 32, onClick: () => {
        if (policy.fallbackRoutes === void 0) actions2.editPath([...rolePath, "fallbackRoutes"], [{ provider: "", model: "" }]);
        else actions2.editPath([...rolePath, "fallbackRoutes", policy.fallbackRoutes.length], { provider: "", model: "" });
      }, children: t("addFallback", { name: role3.label }) })
    ] }, role3.id)
  ] });
}

// src/client/SessionProfiles.tsx
var import_react3 = require("react");
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/session-labels.ts
function sessionProfileLabels(session, t) {
  const admitted = session.admittedSelection;
  const profile = admitted === void 0 ? t("sessionGlobalCaptured") : admitted.selectedId === null ? t("sessionBaseline") : t("sessionAdmittedProfile", { id: admitted.selectedId, revision: t(configurationVersionState(admitted.sourceRevision)) });
  const future = session.globalDefault;
  return {
    admitted: t("sessionState", { profile, scope: session.scope }),
    futureDefault: t("sessionFutureDefault", { profile: future.selectedId === null ? t("sessionBaseline") : t("sessionAdmittedProfile", { id: future.selectedId, revision: t(configurationVersionState(future.sourceRevision)) }) })
  };
}

// src/client/SessionProfiles.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var MENU_ISSUE_CODES = /* @__PURE__ */ new Set(["validation", "conflict", "not-found", "lock-timeout", "unsafe-path", "io", "activation", "corrupt-selection", "limit", "busy", "maintenance", "disposed", "not-owned", "unavailable", "cancelled", "module-off", "runtime-unavailable", "new-session-required", "model-unconfigured", "model-choice-changed", "model-service-unavailable", "model-observation-unavailable", "model-selection-failed"]);
function capabilityReason(reason, t) {
  switch (reason) {
    case "busy":
      return t("headerBusy");
    case "maintenance":
      return t("headerMaintenanceRefused");
    case "module-off":
      return t("sessionModuleOff");
    case "runtime-unavailable":
      return t("headerUnavailableRefused");
    case "model-unconfigured":
      return t("headerNoProfileModel");
    case "model-service-unavailable":
      return t("headerModelUnconfirmed");
    case "new-session-required":
      return t("sessionNewRequired");
    default:
      return t("headerUnavailable");
  }
}
function menuIssue(issue) {
  const code = MENU_ISSUE_CODES.has(issue.code) ? issue.code : issue.kind === "transport" ? "transport" : "unavailable";
  const field = issue.field;
  return { code, ...isSafeDiagnosticField(field) ? { field } : {} };
}
function SessionScope({ state, actions: actions2, t, compact = false }) {
  const prefix = (0, import_react3.useId)();
  const session = state.session;
  const labels = session === null ? null : sessionProfileLabels(session, t);
  const selected = state.snapshot?.profiles.find((profile) => profile.id === state.sessionChoice);
  const disabled = state.busy !== null || state.pendingEditor !== null || state.sessionBusy !== null || state.dirty || state.invalidFields.length > 0;
  const current = () => actions2.readProfileView().currentSessionId === state.currentSessionId;
  const ready = session !== null && !session.refreshRequired && !session.selection.refreshRequired && writableSelectionVersion(session.selection.selectionRevision);
  const allowed = ready && session.canApplyOverlay === true && session.applyOverlayUnavailableReason !== "new-session-required";
  const modelAllowed = ready && session.canSelectModel === true && session.profileModel !== void 0;
  const status = state.sessionNotice === null ? "" : t(state.sessionNotice === "mode-on" ? "headerModeOn" : state.sessionNotice === "mode-off" ? "headerModeOff" : state.sessionNotice === "applied-with-model" ? "sessionAppliedWithModel" : state.sessionNotice === "applied" ? "sessionApplied" : "sessionResetDone");
  let binding = session?.subagentRuntime;
  try {
    if (binding !== void 0) binding = parseSubagentRuntimeAdmissionView(binding);
  } catch {
    binding = void 0;
  }
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-session-scope", "aria-busy": state.sessionBusy !== null, "data-dsmm-session-scope": true, children: [
    !compact && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { children: t("sessionScope") }),
    state.currentSessionId === null ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("noSession") }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      labels !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { "data-dsmm-session-state": true, children: labels.admitted }),
      labels !== null && !compact && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", "data-dsmm-session-future-default": true, children: labels.futureDefault }),
      session === null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", id: `${prefix}-overlay-reason`, children: t("sessionUnavailable") }),
      session?.warnings?.length ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("admissionWarnings") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ProfileWarnings, { warnings: session.warnings, t })
      ] }) : null,
      session !== null && !allowed && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", id: `${prefix}-overlay-reason`, children: capabilityReason(session.applyOverlayUnavailableReason, t) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("label", { htmlFor: `${prefix}-choice`, children: t("sessionSelect") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("select", { id: `${prefix}-choice`, value: state.sessionChoice ?? "", disabled: disabled || !allowed, "aria-describedby": !allowed ? `${prefix}-overlay-reason` : void 0, onChange: (event) => {
          if (current()) actions2.chooseSessionProfile(event.currentTarget.value || null);
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: t("sessionBaseline") }),
          state.sessionChoice !== null && selected === void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: state.sessionChoice, children: state.sessionChoice }),
          state.snapshot?.profiles.map((profile) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("option", { value: profile.id, disabled: !isConfigRevision(profile.revision) || profile.error !== void 0, children: [
            profile.label?.trim() ? `${profile.label} (${profile.id})` : profile.id,
            profileWarnings(profile.warnings).length ? ` — ${t("warningProfile")}` : ""
          ] }, profile.id))
        ] })
      ] }),
      !compact && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("sessionModelHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled: disabled || !modelAllowed, "aria-describedby": !modelAllowed ? `${prefix}-model-reason` : void 0, onClick: () => {
          if (current()) void actions2.useSessionProfileModel();
        }, children: t("headerUseCurrentModel") }),
        !modelAllowed && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", id: `${prefix}-model-reason`, children: capabilityReason(session?.selectModelUnavailableReason, t) }),
        session !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-availability", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: binding === void 0 ? t("bindingUnknown") : t("bindingState", { binding: binding.binding, ready: t(binding.deliveryFenceReady ? "enabled" : "disabled"), restart: t(binding.restartRequired ? "enabled" : "disabled") }) }),
          binding?.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("bindingReason", { reason: binding.reason }) })
        ] }),
        session?.roles !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("summary", { children: t("admittedRoles") }),
          session.roles.map((role3) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-availability", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: role3.id }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(RoleAvailability, { value: role3, t })
          ] }, role3.id))
        ] })
      ] }),
      state.dirty && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("sessionDirty") }),
      (session?.refreshRequired || session?.selection.refreshRequired) && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "status", children: t("savedRefreshRequired") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled: disabled || !allowed || state.sessionChoice !== null && !isConfigRevision(selected?.revision), "aria-describedby": !allowed ? `${prefix}-overlay-reason` : void 0, onClick: () => {
          if (current()) void actions2.applySession();
        }, children: t(state.sessionBusy === "apply" ? "sessionApplying" : "sessionApply") }),
        !compact && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled: disabled || !allowed, "aria-describedby": !allowed ? `${prefix}-overlay-reason` : void 0, onClick: () => {
          if (current()) void actions2.resetSession();
        }, children: t(state.sessionBusy === "reset" ? "sessionResetting" : "sessionReset") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled: state.sessionBusy !== null || state.busy !== null || state.pendingEditor !== null, onClick: () => {
          if (current()) void actions2.refreshSession();
        }, children: t("sessionRefresh") })
      ] }),
      !compact && session?.rolePolicy !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { "data-dsmm-session-policy": true, children: t("roleState", { route: session.rolePolicy.route === void 0 ? t("inheritRoute") : `${session.rolePolicy.route.provider}/${session.rolePolicy.route.model}${session.rolePolicy.route.reasoningEffort === void 0 ? "" : ` (${session.rolePolicy.route.reasoningEffort})`}`, strategy: session.rolePolicy.strategy, retries: session.rolePolicy.retries, failures: session.rolePolicy.rateLimitFailures, switches: session.rolePolicy.switches, delay: session.rolePolicy.totalDelayMs }) })
    ] }),
    state.sessionIssue !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "alert", children: state.sessionIssue.source === "profile-model" ? t(state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed") : state.sessionIssue.code === "conflict" ? t("sessionConflict") : ["busy", "maintenance", "disposed", "not-owned"].includes(state.sessionIssue.code) ? t("sessionBusy", { reason: state.sessionIssue.code }) : t(state.sessionIssue.code === "validation" ? "validation" : "sessionUnavailable") }),
    state.sessionIssue !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(IssueDetails, { issue: state.sessionIssue, t }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", "aria-atomic": "true", children: state.sessionBusy === "read" ? t("reading") : status })
  ] });
}
function SessionProfiles(props) {
  const prefix = (0, import_react3.useId)();
  const state = props.useProfiles((snapshot4) => snapshot4);
  const id2 = state.currentSessionId;
  const [openFor, setOpenFor] = (0, import_react3.useState)(void 0);
  (0, import_react3.useEffect)(() => {
    setOpenFor(void 0);
  }, [id2]);
  if (props.sessionId !== void 0 && props.sessionId !== id2) return null;
  const { t } = props;
  const session = state.session;
  const admission = session?.admittedSelection;
  const unknownCaptured = session !== null && admission === void 0;
  const current = session === null ? "__dsmm_session_unavailable__" : unknownCaptured ? "__dsmm_captured_default__" : admission?.selectedId ?? "";
  const profiles = state.snapshot?.profiles ?? [];
  const currentSaved = profiles.find((profile) => profile.id === current);
  const committing = state.sessionBusy !== null;
  const unavailable = id2 === null || committing || state.busy !== null || session === null || session.refreshRequired === true || session.selection.refreshRequired === true;
  const profileDisabled = unavailable || state.pendingEditor !== null || state.dirty || state.invalidFields.length > 0 || session === null || !writableSelectionVersion(session.selection.selectionRevision);
  const disabled = profileDisabled || session?.canApplyOverlay !== true || session?.applyOverlayUnavailableReason === "new-session-required" || state.snapshot === null;
  let feedback = "";
  if (state.sessionIssue !== null) feedback = t(state.sessionIssue.source === "profile-model" ? state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed" : state.sessionIssue.code === "conflict" ? "headerConflict" : state.sessionIssue.code === "activation" ? "headerActivationRefused" : state.sessionIssue.code === "maintenance" ? "headerMaintenanceRefused" : state.sessionIssue.code === "busy" ? "headerBusyRefused" : state.sessionIssue.code === "cancelled" ? "headerCancelledRefused" : state.sessionIssue.code === "unavailable" || state.sessionIssue.kind === "assembly" ? "headerUnavailableRefused" : "headerSelectionRefused");
  else if (committing || state.busy !== null) feedback = t(state.sessionBusy === "apply" || state.sessionBusy === "reset" ? "headerApplying" : "headerLoading");
  else if (state.dirty || state.invalidFields.length > 0 || state.pendingEditor !== null) feedback = t("headerDraft");
  else if (id2 === null) feedback = t("headerNoSession");
  else if (session === null || state.snapshot === null) feedback = t("headerUnavailable");
  else if (session.refreshRequired || session.selection.refreshRequired) feedback = t("savedRefreshRequired");
  else if (state.sessionNotice !== null) feedback = t(state.sessionNotice === "mode-on" ? "headerModeOn" : state.sessionNotice === "mode-off" ? "headerModeOff" : state.sessionNotice === "applied-with-model" ? "headerAppliedWithModel" : "headerApplied");
  const profileName = unknownCaptured ? t("headerCaptured") : admission !== void 0 && sourceRelationship(admission, currentSaved?.revision) === "current" && currentSaved?.label?.trim() ? `${currentSaved.label} (${currentSaved.id})` : admission?.selectedId ?? t("sessionBaseline");
  const currentLabel = t("headerCurrentProfile", { profile: session === null ? t("headerUnavailable") : profileName });
  const entries = [{ type: "label", id: "@current", text: currentLabel }];
  for (const warning of profileWarnings(session?.warnings)) entries.push({ type: "label", id: `@warning:${warning.code}`, text: t("warningMarker", { code: warning.code, field: warning.field }) });
  if (id2 === null && state.snapshot !== null) entries.push({ type: "label", id: "@future", text: t("sessionFutureDefault", { profile: state.snapshot.profiles.find((profile) => profile.id === state.snapshot.selectedId)?.label?.trim() || state.snapshot.selectedId || t("sessionBaseline") }) });
  if (feedback !== "" && (state.sessionNotice === null || state.sessionIssue !== null)) entries.push({ type: "label", id: "@status", text: feedback });
  const mode = session?.deepwork;
  entries.push({
    id: "@mode",
    label: t(mode === void 0 ? "headerModeUnavailable" : mode.locked ? "headerModePreset" : mode.active ? "headerModeDisable" : "headerModeEnable"),
    disabled: unavailable || session?.canToggleMode !== true || mode === void 0 || mode.locked
  });
  if (session !== null && session.canToggleMode !== true) entries.push({ type: "label", id: "@mode-reason", text: capabilityReason(session.toggleModeUnavailableReason, t) });
  const diagnostic2 = state.sessionIssue === null ? null : menuIssue(state.sessionIssue);
  const diagnosticText = diagnostic2 === null ? "" : t("headerIssueCode", { code: diagnostic2.code }) + (diagnostic2.field === void 0 ? "" : ` ${t("headerIssueField", { field: diagnostic2.field })}`);
  const retryHint = t(diagnostic2?.code === "maintenance" || diagnostic2?.code === "busy" ? "headerWaitRetryHint" : "headerRetryHint");
  if (diagnostic2 !== null) entries.push({ type: "label", id: "@diagnostic", text: diagnosticText }, { type: "label", id: "@retry", text: retryHint });
  if (admission?.selectedId != null && currentSaved === void 0) entries.push({ id: admission.selectedId, label: `${admission.selectedId} — ${t("headerSavedUnavailable")}`, disabled: true });
  if (unknownCaptured) entries.push({ id: "__dsmm_captured_default__", label: t("headerCaptured"), disabled: true });
  entries.push({ type: "separator", id: "@keep-separator" }, { type: "label", id: "@keep-heading", text: t("headerCompactProfiles") }, { id: "", label: t("sessionBaseline"), disabled });
  if (session !== null && (session.canApplyOverlay !== true || session.applyOverlayUnavailableReason === "new-session-required")) entries.push({ type: "label", id: "@overlay-reason", text: capabilityReason(session.applyOverlayUnavailableReason, t) });
  for (const profile of profiles) entries.push({ id: profile.id, label: (profile.label?.trim() ? profile.label : profile.id) + (profile.error === void 0 && isConfigRevision(profile.revision) ? "" : ` — ${t("headerSavedUnavailable")}`) + (profileWarnings(profile.warnings).length ? ` — ${t("warningProfile")}` : ""), disabled: disabled || !isConfigRevision(profile.revision) || profile.error !== void 0 });
  entries.push({ type: "separator", id: "@model-separator" }, { id: "@use-model", label: t("headerUseCurrentModel"), disabled: profileDisabled || session?.canSelectModel !== true || session?.profileModel === void 0 });
  if (session !== null && session.canSelectModel !== true) entries.push({ type: "label", id: "@model-reason", text: capabilityReason(session.selectModelUnavailableReason, t) });
  const open = openFor === id2;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-header-profiles", "data-dsmm-header-profile": true, "aria-busy": committing, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      import_dsh_client_ui_primitives3.Menu,
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
        anchor: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", size: "sm", variant: "toolbar", className: "dsmm-profile-trigger", icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.IconBranchOutlineRegular, {}), "aria-label": t("headerProfileLabel"), "aria-haspopup": "menu", "aria-expanded": open, "aria-describedby": `${prefix}-feedback`, onClick: () => setOpenFor(open ? void 0 : id2) }),
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
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "dsmm-profile-announcement", id: `${prefix}-feedback`, role: state.sessionIssue === null ? "status" : "alert", "aria-live": "polite", "aria-atomic": "true", children: [
      feedback || currentLabel,
      diagnostic2 === null ? "" : ` ${diagnosticText} ${retryHint}`
    ] })
  ] });
}

// src/client/ProfilesSection.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function issueKey(issue) {
  if (issue.source === "selection") return issue.code === "conflict" ? "selectionConflict" : "appliedInvalid";
  if (issue.kind === "assembly") return "unavailable";
  if (issue.kind === "transport") return "transport";
  return issue.code === "conflict" || issue.code === "validation" ? issue.code : "io";
}
function ProfilesSection(props) {
  const { t } = props;
  const state = props.useProfiles((snapshot5) => snapshot5);
  const prefix = (0, import_react4.useId)();
  const selectRef = (0, import_react4.useRef)(null);
  const inputRef = (0, import_react4.useRef)(null);
  const editorRef = (0, import_react4.useRef)(null);
  const advancedRef = (0, import_react4.useRef)(null);
  const handledValidation = (0, import_react4.useRef)(0);
  const cancelRef = (0, import_react4.useRef)(null);
  const hadConfirmation = (0, import_react4.useRef)(false);
  const disabled = state.busy !== null || state.pendingEditor !== null || state.sessionBusy === "apply" || state.sessionBusy === "reset";
  const snapshot4 = state.snapshot;
  const editor = state.editor;
  const readOnly = snapshot4?.readOnly === true;
  const editorDisabled = disabled || readOnly || editor?.refreshRequired === true || editor?.revision === "unavailable";
  const reconcilable = canReconcileSelection(snapshot4);
  const selectionConflict = reconcilable && snapshot4?.selectionError?.code === "conflict";
  const invalid2 = state.issue?.kind === "domain" && state.issue.code === "validation";
  const idInvalid = invalid2 && state.issue?.field === "id" && state.issue.location === void 0 && editor?.revision === null && !editorDisabled;
  const rawInvalid = editor !== null && structuredDocument(editor.content) === null;
  (0, import_react4.useEffect)(() => {
    if (state.pendingEditor !== null) {
      cancelRef.current?.focus();
      hadConfirmation.current = true;
    } else if (hadConfirmation.current) {
      selectRef.current?.focus();
      hadConfirmation.current = false;
    }
  }, [state.pendingEditor]);
  (0, import_react4.useEffect)(() => {
    if (state.busy === null && state.validationEpoch > handledValidation.current && state.issue?.kind === "domain" && state.issue.code === "validation") {
      handledValidation.current = state.validationEpoch;
      if (state.issue.location === void 0 && state.issue.field === "id" && inputRef.current !== null && !inputRef.current.disabled && !inputRef.current.readOnly) inputRef.current.focus();
      else {
        if (advancedRef.current !== null) advancedRef.current.open = true;
        const input = editorRef.current;
        if (input !== null) {
          input.focus();
          const location = state.issue.location;
          if (location !== void 0 && location.offset + location.length <= input.value.length) input.setSelectionRange(location.offset, location.offset + location.length);
        }
      }
    }
  }, [state.issue, state.busy, state.validationEpoch]);
  const relationship = editor?.revision != null && editor.id === snapshot4?.selectedId ? sourceRelationship(snapshot4, editor.revision) : "changed";
  const applied = relationship === "current";
  let selection = t(snapshot4 === null ? "unavailable" : "baseline");
  if (snapshot4?.selectionError !== void 0 && !selectionConflict) selection = t("appliedInvalid");
  else if (snapshot4?.selectedId !== null && snapshot4?.selectedId !== void 0) selection = t("appliedProfile", { id: snapshot4.selectedId, revision: t(configurationVersionState(snapshot4.sourceRevision)) });
  const notice = state.notice === null ? "" : t(state.notice.key === "reset" ? "resetDone" : state.notice.key, { id: state.notice.id });
  const warnings2 = editor === null ? [] : draftWarnings(editor.content);
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { className: "dsmm-profiles", "aria-labelledby": `${prefix}-title`, "aria-busy": state.busy !== null, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h2", { id: `${prefix}-title`, children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: t("description") }),
    snapshot4?.origin !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t(snapshot4.origin === "legacy" ? "legacyOrigin" : snapshot4.origin === "central" ? "centralOrigin" : "explicitOrigin") }),
    readOnly && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { role: "status", className: "dsmm-hint", children: t("readOnlyOrigin") }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { className: "dsmm-zone", "aria-labelledby": `${prefix}-browse`, "data-dsmm-zone": "browse", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { id: `${prefix}-browse`, children: t("browseZone") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { type: "button", variant: "outline", disabled: editorDisabled || snapshot4 === null, onClick: () => {
          void props.create();
        }, children: t("new") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { type: "button", variant: "outline", disabled, onClick: () => {
          void props.refresh();
        }, children: t(state.busy === "refresh" ? "refreshing" : "refresh") })
      ] }),
      snapshot4 !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { htmlFor: `${prefix}-select`, children: t("editorSelect") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("select", { ref: selectRef, id: `${prefix}-select`, disabled, value: editor?.revision == null ? "" : editor.id, onChange: (event) => {
          if (event.currentTarget.value) void props.open(event.currentTarget.value);
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "", children: t(editor?.revision === null ? "newDraft" : "choose") }),
          snapshot4.profiles.map((profile, index) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("option", { value: profile.id, children: [
            profile.label?.trim() ? `${profile.label} (${profile.id})` : profile.id,
            profile.error === void 0 ? "" : ` — ${t("invalidProfile", { id: profile.id })}`,
            profile.warnings?.length ? ` — ${t("warningProfile")}` : ""
          ] }, `${index}:${profile.id}`))
        ] }),
        snapshot4.profiles.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("empty") })
      ] }),
      snapshot4 !== null && snapshot4.profiles.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("ul", { className: "dsmm-profile-list", "aria-label": t("savedInventory"), children: snapshot4.profiles.map((profile, index) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: profile.label?.trim() ? `${profile.label} (${profile.id})` : profile.id }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("savedRevision", { revision: t(configurationVersionState(profile.revision)) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ProfileWarnings, { warnings: profile.warnings, t }),
        profile.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(IssueDetails, { issue: profile.error, t })
      ] }, `${index}:${profile.id}`)) }),
      state.pendingEditor !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-confirm", role: "group", "aria-labelledby": `${prefix}-confirm`, onKeyDown: (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          props.cancelDiscard();
        }
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { id: `${prefix}-confirm`, children: t("discardPrompt") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { type: "button", variant: "outline", onClick: () => {
            void props.discardAndOpen();
          }, children: t("discard") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { ref: cancelRef, type: "button", variant: "primary", onClick: props.cancelDiscard, children: t("cancel") })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { className: "dsmm-zone", "aria-labelledby": `${prefix}-edit`, "data-dsmm-zone": "edit", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { id: `${prefix}-edit`, children: t("editZone") }),
      editor === null && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("noEditor") }),
      editor !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-editor", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { "data-dsmm-editor-state": true, children: t(editor.refreshRequired ? "savedRefreshRequired" : state.dirty ? "dirty" : applied ? "savedApplied" : relationship === "unknown" ? "savedRelationshipUnknown" : "savedNotApplied") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("savedRevision", { revision: t(editor.revision === null ? "versionAbsent" : configurationVersionState(editor.revision)) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { type: "button", variant: "primary", disabled: editorDisabled || !state.dirty || snapshot4 === null || state.invalidFields.length > 0, onClick: () => {
            void props.save();
          }, children: t(state.busy === "save" ? "saving" : "save") }),
          editor.revision !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { type: "button", variant: "outline", disabled, onClick: () => {
            void props.reload();
          }, children: t("reload") })
        ] }),
        warnings2.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: t("draftWarnings") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ProfileWarnings, { warnings: warnings2, t })
        ] }),
        editor.warnings?.length ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: t("savedWarnings") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ProfileWarnings, { warnings: editor.warnings, t })
        ] }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { htmlFor: `${prefix}-id`, children: t("profileId") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Input, { ref: inputRef, id: `${prefix}-id`, className: "dsmm-input", value: editor.id, disabled: editorDisabled || editor.revision !== null, "aria-invalid": idInvalid || void 0, "aria-describedby": `${prefix}-id-hint${idInvalid ? ` ${prefix}-issue` : ""}`, onChange: (event) => props.editId(event.currentTarget.value) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { id: `${prefix}-id-hint`, className: "dsmm-hint", children: t("idHint") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-catalog", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { children: t("catalogTitle") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("catalogHint") }),
          state.catalogUnavailable && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("catalogUnavailable") }),
          state.catalog?.failures.map((failure) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("catalogFailure", { name: failure.name, id: failure.id }) }, failure.id)),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { type: "button", variant: "outline", disabled: state.catalogBusy, onClick: () => {
            void props.refreshCatalog();
          }, children: t(state.catalogBusy ? "catalogRefreshing" : "catalogRefresh") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(StructuredEditor, { state, actions: props, disabled: editorDisabled, t }, `structured:${state.editorEpoch}`),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { ref: advancedRef, className: "dsmm-advanced", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("summary", { children: t("advanced") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { htmlFor: `${prefix}-content`, children: t("configuration") }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("textarea", { ref: editorRef, id: `${prefix}-content`, rows: 12, spellCheck: false, value: editor.content, readOnly, disabled: editorDisabled, "aria-invalid": rawInvalid || invalid2 && !idInvalid || void 0, "aria-describedby": `${prefix}-content-hint ${prefix}-structural-hint${invalid2 && !idInvalid ? ` ${prefix}-issue` : ""}`, onChange: (event) => props.editContent(event.currentTarget.value) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { id: `${prefix}-content-hint`, className: "dsmm-hint", children: t("configurationHint") }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { id: `${prefix}-structural-hint`, className: "dsmm-hint", children: t("structuralHint") })
          ] })
        ] }, `advanced:${state.editorEpoch}`)
      ] }),
      state.issue !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-issue", id: `${prefix}-issue`, role: "alert", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: t(issueKey(state.issue)) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(IssueDetails, { issue: state.issue, t })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { className: "dsmm-zone", "aria-labelledby": `${prefix}-global`, "data-dsmm-zone": "future-default", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { id: `${prefix}-global`, children: t("globalScope") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("newSessions") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { "data-dsmm-selection": true, children: selection }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("futurePin", { revision: t(configurationVersionState(snapshot4?.selectionRevision)) }) }),
      snapshot4?.refreshRequired && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { role: "status", children: t("savedRefreshRequired") }),
      snapshot4?.selectedWarnings?.length ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: t("futureWarnings") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ProfileWarnings, { warnings: snapshot4.selectedWarnings, t })
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("savedOnlyHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { id: `${prefix}-global-action`, className: "dsmm-hint", children: t("globalActionHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { type: "button", variant: "primary", "aria-describedby": `${prefix}-global-action`, disabled: editorDisabled || state.dirty || editor?.revision == null || !reconcilable || applied && !selectionConflict, onClick: () => {
          void props.apply();
        }, children: t(state.busy === "apply" ? "applying" : "apply") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { type: "button", variant: "outline", disabled: editorDisabled || !reconcilable || snapshot4?.selectedId === null && !selectionConflict, onClick: () => {
          void props.reset();
        }, children: t(state.busy === "reset" ? "resetting" : "reset") })
      ] }),
      snapshot4?.selectionError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-issue", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: t(selectionConflict ? "selectionConflict" : "retry") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(IssueDetails, { issue: snapshot4.selectionError, t })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("section", { className: "dsmm-zone", "aria-label": t("sessionScope"), "data-dsmm-zone": "current-session", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(SessionScope, { state, actions: props, t }) }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", "aria-atomic": "true", children: state.busy === "refresh" && snapshot4 === null ? t("loading") : state.busy === "read" ? t("reading") : notice })
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
.dsmm-profiles .dsmm-choice{position:relative;min-width:0}
.dsmm-profiles .dsmm-choice .dsmm-input input{padding-right:32px}
.dsmm-profiles .dsmm-choice .dsmm-choice-toggle{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:28px;height:28px;min-height:28px;padding:4px}
.dsmm-profiles .dsmm-choice-list{position:absolute;z-index:1;top:100%;left:0;right:0;max-height:240px;overflow-y:auto;list-style:none;margin:4px 0 0;padding:4px;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dsmm-profiles .dsmm-choice-list [role=option]{padding:8px 10px;min-width:0;overflow-wrap:anywhere;cursor:pointer}
.dsmm-profiles .dsmm-choice-list [role=option]:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsmm-profiles .dsmm-choice-list [aria-selected=true]{background:var(--dsw-alias-interactive-bg-active);outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dsmm-profiles select,.dsmm-profiles textarea{box-sizing:border-box;min-width:0;max-width:100%;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-md)}
.dsmm-profiles select{width:240px;height:32px;padding:0 10px;text-overflow:ellipsis}
.dsmm-profiles textarea{width:100%;padding:12px;font-family:var(--ds-font-family-code);resize:vertical;overflow:auto;white-space:pre;}
.dsmm-profiles select:hover:not(:disabled),.dsmm-profiles textarea:hover:not(:disabled){border-color:var(--dsw-alias-label-primary)}
.dsmm-profiles select:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.dsmm-profiles :is(select,textarea,button):focus-visible,.dsmm-profiles .dsmm-input:has(input:focus-visible){outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.dsmm-profiles input[type=checkbox]:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.dsmm-permissions label.dsmm-actions{min-height:32px}
.dsmm-permissions input[type=checkbox]{accent-color:var(--dsw-alias-state-business-primary)}
.dsmm-profiles :is(select,textarea):disabled{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform);cursor:not-allowed}
.dsmm-profiles .dsmm-editor,.dsmm-profiles .dsmm-confirm{min-width:0;display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform)}
.dsmm-profiles .dsmm-issue{padding:12px;border-left:4px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.dsmm-profiles .dsmm-issue p+p{margin-top:8px}
.dsmm-profiles .dsmm-status{min-height:22px}
.dsmm-profiles .dsmm-zone{min-width:0;display:flex;flex-direction:column;gap:12px;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l4)}
.dsmm-profiles .dsmm-profile-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:12px;min-width:0}
.dsmm-profiles .dsmm-profile-list li{min-width:0;display:flex;flex-direction:column;gap:4px}
.dsmm-profiles :is(.dsmm-warning,.dsmm-diagnostic,.dsmm-availability){min-width:0;display:flex;flex-direction:column;gap:4px;overflow-wrap:anywhere}
.dsmm-profiles .dsmm-warning{border-left:4px solid var(--dsw-alias-state-warn-primary);padding:8px 12px;color:var(--dsw-alias-label-primary)}
.dsmm-deployment{gap:8px}
.dsmm-deployment-frame{display:grid;grid-template-columns:minmax(0,240px) minmax(0,1fr);gap:16px;min-width:0;align-items:start}
.dsmm-module-list{display:flex;flex-direction:column;gap:8px;min-width:0}
.dsmm-module-list button{justify-content:flex-start;text-align:start}
.dsmm-module-list button[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-active);border-color:var(--dsw-alias-label-secondary)}
.dsmm-module-drawer{display:flex;flex-direction:column;gap:16px;min-width:0;width:100%;box-sizing:border-box;padding:16px;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}
.dsmm-drawer-heading{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;min-width:0}
.dsmm-drawer-heading h2:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.dsmm-scope-save{display:flex;flex-direction:column;gap:8px;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l4)}
@media(max-width:768px){.dsmm-deployment-frame{grid-template-columns:minmax(0,1fr)}.dsmm-deployment-frame[data-drawer-open=true]>.dsmm-module-list{display:none}}
.dsmm-deployment .dsmm-deployment-group{border-top:1px solid var(--dsw-alias-border-l4);padding-top:8px;min-width:0}
.dsmm-deployment .dsmm-deployment-group>div{display:flex;flex-direction:column;gap:8px;padding-top:8px}
.dsmm-deployment code{font-family:var(--ds-font-family-code);overflow-wrap:anywhere}
.dsmm-deployment label code,.dsmm-deployment summary code{margin-left:8px;font-size:12px;line-height:18px;font-weight:400;color:var(--dsw-alias-label-secondary)}
.dsmm-deployment pre{margin:0;max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--ds-font-family-code)}
.dsmm-deployment .dsmm-deployment-state{display:flex;flex-direction:column;gap:4px;margin:0;padding:12px;border-top:1px solid var(--dsw-alias-border-l4)}
.dsmm-deployment .dsmm-deployment-state dd{margin:0;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dsmm-children .dsmm-child-composer{min-width:0;display:flex;flex-direction:column;gap:12px}
.dsmm-children .dsmm-child-meta{margin:0;display:flex;flex-direction:column;gap:4px;min-width:0}
.dsmm-children .dsmm-child-meta dt{font-weight:500;overflow-wrap:anywhere}
.dsmm-children .dsmm-child-meta dd{margin:0;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dsmm-children textarea.dsmm-child-message{font-family:var(--dsw-font-family);white-space:pre-wrap;overflow-wrap:anywhere}
@media(prefers-reduced-motion:reduce){.dsmm-profiles *{transition:none!important;animation:none!important}}
`;

// src/client/deployment-data.ts
function record2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function scopeSchema(snapshot4, layer) {
  return layer === "profile" ? snapshot4.nativeSchema ?? snapshot4.schema : snapshot4.schema;
}
function at(value, path) {
  return path.reduce((node, key) => record2(node) && Object.hasOwn(node, key) ? node[key] : void 0, value);
}
function equal(a, b) {
  if (record2(a) && record2(b)) return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, i) => equal(value, b[i]));
  return a === b;
}
function mergeLayer(base, override) {
  if (!record2(base) || !record2(override)) return override;
  return Object.fromEntries([.../* @__PURE__ */ new Set([...Object.keys(base), ...Object.keys(override)])].map((key) => [
    key,
    Object.hasOwn(override, key) ? mergeLayer(base[key], override[key]) : base[key]
  ]));
}
function parseAdvanced(text5) {
  if (text5.trim() === "") return void 0;
  const errors = [];
  const root = parseTree2(text5, errors, { disallowComments: true, allowTrailingComma: false });
  const unique = (node) => {
    if (node.type === "object") {
      const keys = node.children.map((child2) => child2.children[0].value);
      if (new Set(keys).size !== keys.length) return false;
    }
    return (node.children ?? []).every(unique);
  };
  if (root === void 0 || errors.length || !unique(root)) throw new Error("Invalid JSON");
  return JSON.parse(text5);
}
function editLayer(base, path, value) {
  const next = structuredClone(base);
  let node = next;
  for (const key2 of path.slice(0, -1)) {
    if (!record2(node[key2])) node[key2] = {};
    node = node[key2];
  }
  const key = path.at(-1);
  if (value === void 0) delete node[key];
  else node[key] = structuredClone(value);
  return next;
}
function layerDiff(base, draft2, prefix = []) {
  return [.../* @__PURE__ */ new Set([...Object.keys(base), ...Object.keys(draft2)])].flatMap((key) => {
    const path = [...prefix, key], before = base[key], after = draft2[key];
    if (equal(before, after)) return [];
    if (!Object.hasOwn(draft2, key)) return [{ op: "unset", path }];
    if (record2(before) && record2(after)) return layerDiff(before, after, path);
    return [{ op: "set", path, value: after }];
  });
}
function validateEditorValue(value, schema, sparse = false) {
  if (schema.type === "transform") return schema.inner !== void 0 && validateEditorValue(value, schema.inner, sparse);
  if (schema.type === "any") {
    try {
      copyRouteJson(value);
      return true;
    } catch {
      return false;
    }
  }
  if (schema.type === "union") return schema.alternatives?.some((node) => validateEditorValue(value, node, sparse)) === true;
  if (schema.type === "const") return value === schema.value;
  if (schema.type === "object" && schema.additionalProperties === "json") {
    try {
      if (schema.fields?.provider?.type === "string" && schema.fields.model?.type === "string") {
        normalizeModelRouteJson(value, sparse, true);
        return true;
      }
      copyRouteJson(value);
    } catch {
      return false;
    }
  }
  if (schema.type === "object" || schema.type === "dict") return record2(value) && (sparse || schema.type !== "object" || Object.entries(schema.fields ?? {}).every(([key, node]) => !node.required || Object.hasOwn(value, key))) && Object.entries(value).every(([key, child2]) => {
    if (["__proto__", "prototype", "constructor"].includes(key)) return false;
    if (schema.keys !== void 0 && !schema.keys.includes(key)) return false;
    const node = schema.type === "dict" ? schema.inner : schema.fields !== void 0 && Object.hasOwn(schema.fields, key) ? schema.fields[key] : void 0;
    return node !== void 0 ? validateEditorValue(child2, node, sparse) : schema.type === "object" && schema.additionalProperties === "json";
  });
  if (schema.type === "array") return Array.isArray(value) && (schema.max === void 0 || value.length <= schema.max) && schema.inner !== void 0 && value.every((child2) => validateEditorValue(child2, schema.inner));
  if (schema.type === "string" && schema.nonempty) return typeof value === "string" && value.trim() !== "";
  if (["string", "boolean", "number"].includes(schema.type)) return typeof value === schema.type && (typeof value !== "number" || Number.isFinite(value) && (schema.min === void 0 || value >= schema.min) && (schema.max === void 0 || value <= schema.max) && (schema.step === void 0 || Number.isInteger(value / schema.step)));
  return false;
}
function enumValues(schema) {
  return schema.type === "union" && schema.alternatives?.every((node) => node.type === "const") ? schema.alternatives.map((node) => node.value) : null;
}
function visibleDeploymentPath(path) {
  return !["lsp", "modeName", "section"].includes(path[0]);
}
function inspectorPaths(snapshot4, admitted) {
  const paths = /* @__PURE__ */ new Set([
    ...Object.keys(snapshot4.sources),
    ...Object.keys(snapshot4.startupSources ?? {}),
    ...Object.keys(snapshot4.nextRoot?.sources ?? {}),
    ...Object.keys(snapshot4.nextRoot?.captures ?? {}),
    ...Object.keys(admitted?.sources ?? {}),
    ...Object.keys(admitted?.captures ?? {})
  ]);
  const visit2 = (value, path) => {
    if (!visibleDeploymentPath(path)) return;
    if (record2(value) && Object.keys(value).length) for (const [key, child2] of Object.entries(value)) visit2(child2, [...path, key]);
    else if (path.length) paths.add(path.join("."));
  };
  for (const value of [snapshot4.desired, snapshot4.startup, snapshot4.nextRoot?.settings, admitted?.settings]) if (value !== void 0) visit2(value, []);
  return [...paths].filter((path) => visibleDeploymentPath(path.split("."))).sort();
}

// src/client/deployment-controller.ts
var Refusal = class extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
};
function isNativeJson(value, active = /* @__PURE__ */ new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || active.has(value) || Object.getOwnPropertySymbols(value).length > 0) return false;
  const array2 = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if (array2 ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
  active.add(value);
  const properties = Object.getOwnPropertyDescriptors(value);
  const valid = Object.entries(properties).every(([key, descriptor4]) => array2 && key === "length" || descriptor4.enumerable && Object.hasOwn(descriptor4, "value") && (!array2 || /^(0|[1-9][0-9]*)$/u.test(key) && Number(key) < value.length) && isNativeJson(descriptor4.value, active));
  active.delete(value);
  return valid && (!array2 || Object.keys(properties).length === value.length + 1);
}
function nativePathEdit(edit) {
  if (edit.op === "unset") return edit;
  if (!isNativeJson(edit.value)) throw new Refusal("validation");
  return { op: "set", path: edit.path, value: edit.value };
}
async function unwrap(promise) {
  const result = await promise;
  if (result.ok) return result.value;
  if (result.error.code === "dsmm-profiles/refused") {
    const code = result.error.details.code;
    throw new Refusal(["conflict", "validation", "not-owned"].includes(code) ? code : "unavailable");
  }
  throw new Refusal("transport");
}
var DeploymentController = class _DeploymentController {
  constructor(remote, layer, rowNamespace = null) {
    this.remote = remote;
    this.layer = layer;
    this.rowNamespace = rowNamespace;
  }
  state = { snapshot: null, draft: {}, dirty: false, busy: false, issue: null, saved: false, session: null, raw: {}, invalidFields: [], refreshRequired: false };
  listeners = /* @__PURE__ */ new Set();
  generation = 0;
  disposed = false;
  baseline = {};
  form = null;
  invalid = /* @__PURE__ */ new Set();
  connection = null;
  connectionBaseline;
  stopConnection = null;
  children = /* @__PURE__ */ new Set();
  getSnapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  dispose() {
    this.disposed = true;
    this.generation++;
    this.stopConnection?.();
    this.listeners.clear();
    this.form = null;
  }
  bindConnection(source) {
    this.stopConnection?.();
    this.connection = source;
    for (const child2 of this.children) child2.bindConnection(source);
    this.stopConnection = source.subscribe(() => {
      if (this.disposed) return;
      this.generation++;
      this.publish({ busy: false, issue: source.getSnapshot() === void 0 ? "transport" : "conflict", saved: false });
    });
  }
  forProfile(namespace) {
    const controller = new _DeploymentController(this.remote, "profile", namespace);
    if (this.connection !== null) controller.bindConnection(this.connection);
    this.children.add(controller);
    return controller;
  }
  currentConnection() {
    return this.connection === null || this.connection.getSnapshot() !== void 0 && this.connection.getSnapshot() === this.connectionBaseline;
  }
  setSession(session) {
    this.publish({ session });
  }
  publish(patch) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  attachForm(form) {
    this.form = form;
  }
  setInvalid(path, invalid2) {
    if (this.invalid.has(path) === invalid2) return;
    if (invalid2) this.invalid.add(path);
    else this.invalid.delete(path);
    this.publish({ invalidFields: [...this.invalid], dirty: this.invalid.size > 0 || !equal(this.baseline, this.state.draft), saved: false });
  }
  setRaw(path, text5, invalid2) {
    if (!this.canEdit()) return;
    this.publish({ raw: { ...this.state.raw, [path]: { text: text5, invalid: invalid2 } } });
    this.setInvalid(path, invalid2);
  }
  clearRaw(prefix) {
    if (!this.canEdit()) return;
    const raw = Object.fromEntries(Object.entries(this.state.raw).filter(([path]) => path !== prefix && !path.startsWith(`${prefix}.`)));
    for (const path of [...this.invalid]) if (path === prefix || path.startsWith(`${prefix}.`)) this.invalid.delete(path);
    this.publish({ raw, invalidFields: [...this.invalid], dirty: this.invalid.size > 0 || !equal(this.baseline, this.state.draft) });
  }
  canEdit() {
    return !this.disposed && !this.state.busy && !this.state.refreshRequired && this.state.snapshot !== null && this.state.snapshot.globalRevision !== "unavailable" && (this.layer === "global" || this.state.snapshot.nativeRevision !== "unavailable") && this.currentConnection() && (this.state.issue === null || this.state.issue === "validation") && (this.layer === "global" || this.canWriteProfile());
  }
  canSave() {
    return this.canEdit() && this.state.issue === null && this.state.dirty && this.invalid.size === 0;
  }
  pendingPaths() {
    return [.../* @__PURE__ */ new Set([...layerDiff(this.baseline, this.state.draft).map((edit) => edit.path.join(".")), ...this.invalid])];
  }
  canWriteProfile(snapshot4 = this.state.snapshot) {
    const native = this.form?.state;
    return this.currentConnection() && snapshot4 !== null && this.rowNamespace !== null && this.rowNamespace === snapshot4.namespace && native?.status === "ready" && native.writable && native.revision === snapshot4.nativeFormRevision && snapshot4.nativeForm !== null && equal(native.base ?? null, snapshot4.nativeForm.base) && equal(native.user ?? null, snapshot4.nativeForm.user);
  }
  edit(path, value) {
    if (!this.canEdit()) return;
    const draft2 = editLayer(this.state.draft, path, value);
    this.publish({ draft: draft2, dirty: this.invalid.size > 0 || !equal(this.baseline, draft2), issue: null, saved: false });
  }
  async refresh(discard = false) {
    if (this.disposed || this.state.busy) return;
    const generation = ++this.generation;
    const connection = this.connection?.getSnapshot();
    this.publish({ busy: true, saved: false });
    try {
      if (this.connection !== null && connection === void 0) throw new Refusal("transport");
      const snapshot4 = await unwrap(this.remote.describeSettings());
      if (this.disposed || generation !== this.generation) return;
      if (snapshot4.globalRevision === "unavailable" || this.layer === "profile" && snapshot4.nativeRevision === "unavailable") throw new Refusal("unavailable");
      const old = this.state.snapshot;
      if (old !== null && (old.entryId !== snapshot4.entryId || old.hostProfileKey !== snapshot4.hostProfileKey)) throw new Refusal("unavailable");
      if (this.state.dirty && !discard) {
        const stale = !this.currentConnection() || (this.layer === "global" ? old?.globalRevision !== snapshot4.globalRevision : old?.nativeRevision !== snapshot4.nativeRevision || old?.globalRevision !== snapshot4.globalRevision);
        this.publish({ issue: stale ? "conflict" : null });
      } else {
        this.invalid.clear();
        this.connectionBaseline = connection;
        this.baseline = this.layer === "global" ? snapshot4.global : record2(snapshot4.nativeForm?.user) ? snapshot4.nativeForm.user : {};
        this.publish({ snapshot: snapshot4, draft: structuredClone(this.baseline), raw: {}, invalidFields: [], dirty: false, issue: null, refreshRequired: false });
      }
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.publish({ issue: error instanceof Refusal ? error.code : "transport" });
    } finally {
      if (!this.disposed && generation === this.generation) this.publish({ busy: false });
    }
  }
  async save() {
    const { snapshot: snapshot4, draft: draft2, dirty, busy, issue } = this.state;
    if (!this.canSave() || snapshot4 === null || !dirty || busy || issue !== null) return;
    if (snapshot4.globalRevision === "unavailable" || this.layer === "profile" && snapshot4.nativeRevision === "unavailable") {
      this.publish({ issue: "unavailable" });
      return;
    }
    const selectedSchema = scopeSchema(snapshot4, this.layer);
    const schema = { ...selectedSchema, fields: Object.fromEntries(Object.entries(selectedSchema.fields ?? {}).filter(([key]) => key !== (this.layer === "global" ? "runtime" : "modules"))) };
    const mergedSchema = { ...snapshot4.schema, fields: { ...snapshot4.schema.fields, ...snapshot4.nativeSchema?.fields } };
    const editable = { ...draft2 };
    const lower = this.layer === "global" ? snapshot4.defaults : mergeLayer(mergeLayer(snapshot4.defaults, snapshot4.global), snapshot4.nativeForm?.base ?? {});
    const candidate = mergeLayer(lower, editable);
    const merged = this.layer === "global" ? mergeLayer(candidate, snapshot4.profile) : candidate;
    if (!validateEditorValue(editable, schema, true) || !validateEditorValue(merged, mergedSchema)) {
      this.publish({ issue: "validation" });
      return;
    }
    const edits = layerDiff(this.baseline, draft2);
    if (edits.length > 128) {
      this.publish({ issue: "validation" });
      return;
    }
    const generation = ++this.generation;
    this.publish({ busy: true, saved: false });
    try {
      const current = await unwrap(this.remote.describeSettings());
      if (this.disposed || generation !== this.generation) return;
      if (current.entryId !== snapshot4.entryId || current.hostProfileKey !== snapshot4.hostProfileKey || current.globalRevision !== snapshot4.globalRevision) throw new Refusal("conflict");
      let acceptedRefreshRequired = false;
      if (this.layer === "global") {
        const accepted = await unwrap(this.remote.save({ expectedRevision: snapshot4.globalRevision, edits }));
        acceptedRefreshRequired = accepted.refreshRequired === true || accepted.revision === "unavailable";
      } else {
        if (current.nativeRevision !== snapshot4.nativeRevision || !this.canWriteProfile(current)) throw new Refusal("conflict");
        const form = this.form;
        if (!await form.mutate(edits.map(nativePathEdit), snapshot4.nativeFormRevision)) throw new Refusal("unconfirmed");
      }
      if (this.disposed || generation !== this.generation) return;
      this.baseline = structuredClone(draft2);
      this.invalid.clear();
      this.publish({ dirty: false, saved: true, issue: null, raw: {}, invalidFields: [], refreshRequired: true });
      if (acceptedRefreshRequired) return;
      try {
        const next = await unwrap(this.remote.describeSettings());
        if (!this.disposed && generation === this.generation) {
          if (next.entryId !== snapshot4.entryId || next.hostProfileKey !== snapshot4.hostProfileKey || next.globalRevision === "unavailable" || this.layer === "profile" && next.nativeRevision === "unavailable") this.publish({ refreshRequired: true });
          else {
            this.baseline = structuredClone(this.layer === "global" ? next.global : record2(next.nativeForm?.user) ? next.nativeForm.user : {});
            this.publish({ snapshot: next, draft: structuredClone(this.baseline), refreshRequired: false });
          }
        }
      } catch {
        if (!this.disposed && generation === this.generation) this.publish({ refreshRequired: true });
      }
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.publish({ issue: error instanceof Refusal ? error.code : "transport" });
    } finally {
      if (!this.disposed && generation === this.generation) this.publish({ busy: false });
    }
  }
};

// src/client/DeploymentPage.tsx
var import_react8 = require("react");
var import_dsh_client_ui_primitives8 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/deployment-workspace.ts
var DeploymentWorkspace = class {
  constructor(core, permissions) {
    this.core = core;
    this.permissions = permissions;
    this.stopCore = core.subscribe(() => {
      this.sync();
      this.changed();
    });
    this.stopPermissions = permissions?.store.subscribe(() => this.changed());
    this.sync();
  }
  state = { scope: "global", module: null, pending: null, native: null, revision: 0 };
  listeners = /* @__PURE__ */ new Set();
  forms = null;
  profiles = /* @__PURE__ */ new Map();
  stopForm;
  stopNative;
  stopCore;
  stopPermissions;
  identity = null;
  globalVersion;
  sourceBlocked = false;
  attachCurrentForm;
  getSnapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  changed(patch = {}) {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 };
    for (const listener of this.listeners) listener();
  }
  bindForms(forms) {
    if (this.forms === forms) return;
    this.forms = forms;
    this.identity = null;
    this.sync();
    this.changed();
  }
  sync() {
    const snapshot4 = this.core.getSnapshot().snapshot;
    const issue = this.core.getSnapshot().issue, blocked = issue === "unavailable" || issue === "not-owned" || issue === "transport", restored = this.sourceBlocked && !blocked;
    this.sourceBlocked = blocked;
    const key = snapshot4?.namespace == null ? null : JSON.stringify([snapshot4.hostProfileKey, snapshot4.entryId, snapshot4.namespace]);
    const changedGlobal = snapshot4?.globalRevision !== this.globalVersion;
    this.globalVersion = snapshot4?.globalRevision;
    if (key === this.identity) {
      if (blocked) this.state.native?.attachForm(null);
      else if (restored) this.attachCurrentForm?.();
      if (!blocked && changedGlobal && this.state.native !== null && !this.state.native.getSnapshot().busy) void this.state.native.refresh();
      return;
    }
    this.identity = key;
    this.stopForm?.();
    this.stopNative?.();
    this.attachCurrentForm = void 0;
    let native = null;
    if (key !== null && snapshot4 !== null) {
      native = this.profiles.get(key) ?? this.core.forProfile(snapshot4.namespace);
      this.profiles.set(key, native);
      this.stopNative = native.subscribe(() => this.changed());
      if (this.forms !== null) {
        const form = this.forms.get(snapshot4.namespace);
        const attach = () => {
          native.attachForm(this.sourceBlocked ? null : { state: form.getSnapshot(), mutate: (ops, revision2) => form.mutate(ops, revision2) });
          this.changed();
          if (!this.sourceBlocked && !native.getSnapshot().busy) void native.refresh();
        };
        this.attachCurrentForm = attach;
        this.stopForm = form.subscribe(attach);
        attach();
      } else native.attachForm(null);
      if (native.getSnapshot().snapshot === null) void native.refresh();
    }
    this.changed({ native });
  }
  controller(scope = this.state.scope) {
    return scope === "global" ? this.core : this.state.native;
  }
  hasPending() {
    return this.controller()?.getSnapshot().dirty === true || this.state.module === "permissions" && this.permissions?.store.getSnapshot().dirty === true;
  }
  request(destination) {
    const switched = destination.scope !== this.state.scope;
    const leaving = switched || this.state.module !== null && destination.module !== this.state.module;
    if (leaving && this.hasPending()) this.changed({ pending: destination });
    else {
      this.changed({ ...destination, pending: null });
      if (switched) void this.controller()?.refresh();
    }
  }
  continueEditing() {
    this.changed({ pending: null });
  }
  keepAndNavigate() {
    const target = this.state.pending;
    if (target !== null) {
      const switched = target.scope !== this.state.scope;
      this.changed({ ...target, pending: null });
      if (switched) void this.controller()?.refresh();
    }
  }
  async discardAndNavigate() {
    const destination = this.state.pending;
    if (destination === null) return;
    const controller = this.controller();
    if (controller?.getSnapshot().dirty) {
      await controller.refresh(true);
      if (controller.getSnapshot().dirty || controller.getSnapshot().issue !== null) return;
    }
    if (this.state.module === "permissions" && this.permissions?.store.getSnapshot().dirty) {
      await this.permissions.refresh(this.permissions.store.getSnapshot().generation, true);
      if (this.permissions.store.getSnapshot().dirty) return;
    }
    if (this.state.pending === destination) this.changed({ ...destination, pending: null });
  }
  async save() {
    const controller = this.controller();
    if (controller === null) return;
    await controller.save();
    if (controller !== this.core && controller.getSnapshot().saved) await this.core.refresh();
  }
  dispose() {
    this.stopCore();
    this.stopForm?.();
    this.stopNative?.();
    this.stopPermissions?.();
    for (const controller of this.profiles.values()) controller.dispose();
    this.listeners.clear();
  }
};
var workspaces = /* @__PURE__ */ new WeakMap();
function deploymentWorkspace(core, permissions) {
  let workspace = workspaces.get(core);
  if (workspace === void 0) {
    workspace = new DeploymentWorkspace(core, permissions);
    workspaces.set(core, workspace);
  }
  return workspace;
}

// src/client/deployment-modules.ts
var CONFIG_MODULES = ["run", "routes", "workflow", "subagents", "permissions", "other", "state"];
var moduleTitle = (module2) => `module:${module2}`;
function moduleFor(path) {
  const key = path.split(".")[0];
  if (["defaultActive", "modules", "modelParameters", "runtime"].includes(key)) return "run";
  if (["roleRouting", "runtimePolicy", "runtimeRecovery"].includes(key)) return "routes";
  if (["workflow", "roles", "skills", "presets", "businessLocale", "locale", "promptOrder", "plannerRootEnabled"].includes(key)) return "workflow";
  if (key === "subagents") return "subagents";
  if (["permissionControl", "guards"].includes(key)) return "permissions";
  return "other";
}
function editableConfigField(key, layer) {
  return !["lsp", "modeName", "section"].includes(key) && !(key === "modules" && layer === "profile") && !(key === "runtime" && layer === "global");
}
function moduleFields(schema, module2, layer) {
  return Object.entries(schema.fields ?? {}).filter(([key]) => editableConfigField(key, layer) && moduleFor(key) === module2);
}

// src/client/DeploymentFields.tsx
var import_react6 = require("react");
var import_dsh_client_ui_primitives6 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/deployment-locales.ts
var DEPLOYMENT_NS = "plugins.dsmm";
var deploymentEn = {
  title: "DSMM",
  summary: "Global config and profile overrides",
  description: "Layers save independently; native models and running sessions stay unchanged.",
  global: "DSMM Global config",
  globalHint: "Shared by this Home’s DSH profiles. Unset fields use built-in defaults.",
  profile: "Current DSH profile overrides",
  profileHint: "This native entry only. Ordinary Unset fields inherit Global plus Host base pins. Native runtime uses Host base/native defaults, never Global.",
  profileUnavailable: "Unavailable",
  unavailableForm: "Current profile is read-only: no verified writable native form at this connection, namespace and revision. Global configuration remains a separate authority.",
  ceiling: "Deepwork master is Global-only; profiles and session modes cannot lift its captured ceiling.",
  hostUnknown: "Host bundle status: unknown (separate switch).",
  boundaries: "New roots capture saved settings within startup capabilities. Save does not restart the Host; startup-only changes require a separate Host restart, which may cancel sessions.",
  core: "Core",
  coreHint: "Core-owned desired settings. Model-parameter passthrough is ordinary config, not a subplugin. The permission-control enabled flag is startup-pinned. Save does not change current-session admission; inspect desired, startup and admitted values below. Unavailable admission stays unknown.",
  modelParametersHint: "Default On. Off retains saved custom/opaque model parameters without forwarding them, and DSMM reasoningEffort / reasoning_effort aliases use native defaults. Standard SDK parameters and explicit native root choices remain intact. Raw JSON and exact effort values remain editable; saving desired settings does not verify provider transport readiness.",
  permissionControlHint: "Permission-control mounting is startup-pinned. Saved configuration does not prove runtime coverage or remove current protections. Root rules keep their independent authority inside Permissions.",
  modules: "Configuration modules",
  scope: "Configuration scope",
  close: "Close module",
  loading: "Loading configuration…",
  unset: "Unset — inherit",
  "module:run": "Run and modules",
  "module:routes": "Model routes and recovery",
  "module:workflow": "Workflow, roles and skills",
  "module:subagents": "Subagent settings",
  "module:permissions": "Permissions and guards",
  "module:other": "Other settings",
  "module:state": "Configuration state",
  saveScope: "Save selected configuration scope",
  pendingModules: "Pending modules in this scope",
  savedRefreshRequired: "Saved — refresh required before further edits",
  sessionObserved: "Current-session admission observed",
  noModuleFields: "No editable schema fields for this module in the selected scope.",
  leaveDraft: "Unsaved or invalid draft. Choose how to leave; nothing is saved or discarded automatically.",
  continueEditing: "Continue editing",
  keepDraft: "Keep draft and return",
  discardDraft: "Discard draft and leave",
  rootRules: "Current Root rules",
  rootRulesHint: "This transaction is separate from Global/native configuration Save. It requires an open trusted Root, writable operator authority and synchronized runtime. It never borrows Global authority to bypass a refusal.",
  rootRulesUnavailable: "Root rules service unavailable. No session or authority is inferred.",
  nativeRuntimeHint: "Native default On; Host base pins still apply. Mounting is captured at startup. Saving stages desired configuration only; it does not start/stop providers or cancel running sessions. A separate Host restart may cancel sessions.",
  nativeRuntimeReadinessHint: "Official Host services own execution and JSONL storage. This snapshot reports native execution admission readiness, not guaranteed inbox acceptance or completion. Storage is configured on the native JSONL service, not DSMM.",
  unsetGroup: "Unset this group — restore inheritance",
  nativeRuntimeState: "Observed native runtime",
  nativeRuntimeBinding: "Observed runtime composition",
  nativeRuntimeFence: "Execution admission ready",
  nativeRuntimeRestart: "Restart required",
  nativeRuntimeStock: "Official Host runtime",
  nativeRuntimeUnavailable: "Unavailable / unknown",
  "nativeRuntimeReason-explicit-composition-required": "The Host requires an explicit native runtime composition.",
  "nativeRuntimeReason-duplicate-provider": "More than one native provider is present; readiness is not confirmed.",
  "nativeRuntimeReason-authority-not-ready": "Native execution authority is not ready.",
  "nativeRuntimeReason-disabled": "The saved native runtime is disabled.",
  "nativeRuntimeReason-pending-restart": "Saved desired state differs from the mounted native composition; restart is pending.",
  "nativeRuntimeReason-scope-conflict": "Native scope ownership conflicts; readiness is not confirmed.",
  saveGlobal: "Save Global config",
  saveProfile: "Save profile overrides",
  saving: "Saving…",
  refresh: "Refresh",
  discard: "Discard and reload",
  dirty: "Unsaved changes",
  saved: "Saved",
  inherit: "Inherit",
  explicit: "Override",
  defaultPin: "Built-in default pinned",
  hostPin: "Host pin remains when cleared",
  globalSource: "Global",
  profileSource: "DSH profile",
  defaultsSource: "Built-in default",
  namedSource: "Named/session",
  startupSource: "Startup capture",
  deploymentCapture: "Deployment capture",
  desired: "Merged desired",
  startup: "Startup mounted / captured",
  next: "Next root",
  session: "Current-session admitted",
  noSession: "No active session: admission is unknown.",
  sessionUnavailable: "Session admission unavailable. Reconnect and refresh the session separately.",
  absent: "Absent",
  mixedSource: "Mixed sources",
  inspectorStale: "Saved state, not draft",
  pending: "Pending independent restart",
  unknown: "Unknown",
  on: "On",
  off: "Off",
  state: "Field sources and effective state",
  module: "Deepwork module",
  versionObserved: "Metadata observed",
  versionAbsent: "Not stored",
  versionUnknown: "Version unavailable",
  advanced: "Advanced JSON",
  advancedHint: "Schema keys only; omit to inherit. Arrays replace. No credentials or scripts; use existing providers.",
  invalid: "Invalid field. Check type, bounds and keys; draft retained.",
  conflict: "Revision conflict; draft retained. Review changes, then discard and reload. Refresh does not merge.",
  unavailable: "Scope unavailable; draft retained. Reconnect and refresh.",
  "not-owned": "Read-only: requires an authenticated local Host operator.",
  validation: "Host rejected configuration; draft retained. Check fields and merged constraints.",
  transport: "Disconnected; draft retained. Reconnect and refresh.",
  unconfirmed: "The native form did not confirm Save. The Host may have committed; refresh the affected source before deciding to retry. Draft retained; no automatic replay.",
  namedIndependent: "Deepwork Profiles is a separate named JSONC runtime-resource editor in Settings. Saving here does not apply a named profile or select its model."
};
var deploymentZh = {
  title: "DSMM",
  summary: "全局配置与当前配置覆盖",
  description: "两层独立保存，不改原生模型或运行中会话。",
  global: "DSMM 全局配置",
  globalHint: "同一 Home 的 DSH 配置共用；未设置字段使用内建默认值。",
  profile: "当前 DSH 配置覆盖",
  profileHint: "仅此原生实例。普通字段 Unset 后继承 Global 与 Host base 固定值；原生 runtime 仅取 Host base／原生默认值，不继承 Global。",
  profileUnavailable: "不可用",
  unavailableForm: "当前配置只读：连接、namespace 与版本尚无已核验的可写原生表单；Global 配置仍使用独立权限。",
  ceiling: "Deepwork 总开关仅全局可改；配置和会话模式不能突破已捕获上限。",
  hostUnknown: "宿主整包状态：未知（独立开关）。",
  boundaries: "新根会话在启动能力内采用已保存设置。保存不重启宿主；仅启动时生效的更改需另行重启宿主，可能取消会话。",
  core: "Core 核心配置",
  coreHint: "Core 所有的 desired 意图配置。模型参数透传为普通配置，非子插件；权限控制 enabled 仅启动时捕获。保存不改变当前会话准入；下方可检查意图、启动与准入值，不可用的准入仍为未知。",
  modelParametersHint: "默认开启。关闭后仍保存 custom／opaque 模型参数但不发送；DSMM reasoningEffort／reasoning_effort 两种别名采用原生默认值。标准 SDK 参数与根会话原生显式选择保留。仍可编辑原始 JSON 和精确 effort 值；保存意图不代表提供商传输已就绪。",
  permissionControlHint: "权限控制挂载仅启动时捕获。保存配置不证明运行时覆盖，也不移除当前保护；Root 规则在权限模块内保持独立权限。",
  modules: "配置模块",
  scope: "配置作用域",
  close: "关闭模块",
  loading: "正在加载配置…",
  unset: "Unset——继承",
  "module:run": "运行与模块",
  "module:routes": "模型路由与恢复",
  "module:workflow": "工作流、角色与技能",
  "module:subagents": "子 Agent 设置",
  "module:permissions": "权限与保护",
  "module:other": "其他设置",
  "module:state": "配置状态",
  saveScope: "保存所选配置作用域",
  pendingModules: "此作用域的待保存模块",
  savedRefreshRequired: "已保存——需刷新后继续编辑",
  sessionObserved: "已观测当前会话准入",
  noModuleFields: "所选作用域中，此模块没有可编辑的 schema 字段。",
  leaveDraft: "仍有未保存或无效草稿，请选择离开方式；不会自动保存或丢弃。",
  continueEditing: "继续编辑",
  keepDraft: "保留草稿并返回",
  discardDraft: "放弃草稿并离开",
  rootRules: "当前 Root 规则",
  rootRulesHint: "此事务与 Global／native 配置保存分开，需要已打开的可信 Root、可写 operator 权限及已同步运行时；不会借 Global 权限绕过拒绝。",
  rootRulesUnavailable: "Root 规则服务不可用，不推断或创建会话和权限。",
  nativeRuntimeHint: "原生默认开启，Host base 固定值仍适用；挂载仅启动时捕获。保存只设置 desired，不会启动／停止提供商或取消当前会话；独立 Host 重启可能取消会话。",
  nativeRuntimeReadinessHint: "执行和 JSONL 存储由官方 Host 服务负责。此快照只报告原生执行准入就绪，不保证收件箱接受或任务完成。存储配置属于原生 JSONL 服务，不属于 DSMM。",
  unsetGroup: "Unset 整组——恢复继承",
  nativeRuntimeState: "已观测原生运行时",
  nativeRuntimeBinding: "已观测运行时组合",
  nativeRuntimeFence: "执行准入已就绪",
  nativeRuntimeRestart: "需要重启",
  nativeRuntimeStock: "官方 Host 运行时",
  nativeRuntimeUnavailable: "不可用／未知",
  "nativeRuntimeReason-explicit-composition-required": "Host 需要显式的原生运行时组合。",
  "nativeRuntimeReason-duplicate-provider": "存在重复原生 provider，无法确认就绪状态。",
  "nativeRuntimeReason-authority-not-ready": "原生执行权限尚未就绪。",
  "nativeRuntimeReason-disabled": "已保存的原生运行时为关闭。",
  "nativeRuntimeReason-pending-restart": "已保存 desired 与已挂载原生组合不同，等待独立重启。",
  "nativeRuntimeReason-scope-conflict": "原生 scope 所有权冲突，无法确认就绪状态。",
  saveGlobal: "保存全局配置",
  saveProfile: "保存当前配置覆盖",
  saving: "正在保存…",
  refresh: "刷新",
  discard: "丢弃并重载",
  dirty: "未保存",
  saved: "已保存",
  inherit: "继承",
  explicit: "覆盖",
  defaultPin: "固定为内建默认值",
  hostPin: "清除后仍有宿主固定值",
  globalSource: "全局",
  profileSource: "DSH 配置",
  defaultsSource: "内建默认",
  namedSource: "具名／会话",
  startupSource: "启动捕获",
  deploymentCapture: "部署捕获",
  desired: "合并后意图",
  startup: "启动挂载／捕获",
  next: "下一个根会话",
  session: "当前会话准入",
  noSession: "没有活动会话：准入状态未知。",
  sessionUnavailable: "会话准入暂不可用；恢复连接后另行刷新会话。",
  absent: "不存在",
  mixedSource: "混合来源",
  inspectorStale: "已保存状态，非草稿",
  pending: "等待独立重启",
  unknown: "未知",
  on: "开启",
  off: "关闭",
  state: "字段来源与实际生效状态",
  module: "Deepwork 子模块",
  versionObserved: "已观测元数据",
  versionAbsent: "未存储",
  versionUnknown: "版本不可用",
  advanced: "高级 JSON",
  advancedHint: "仅 schema 声明的键；省略为继承，数组整项替换。不填凭据或脚本，仅用已有提供商。",
  invalid: "字段无效，请核对类型、范围与键；草稿保留。",
  conflict: "版本冲突，草稿保留。核对后丢弃并重载；刷新不自动合并。",
  unavailable: "作用域不可用，草稿保留；重连后刷新。",
  "not-owned": "只读：需要本地宿主已认证 operator 权限。",
  validation: "宿主拒绝配置，草稿保留；核对字段及合并约束。",
  transport: "连接中断，草稿保留；重连后刷新。",
  unconfirmed: "原生表单未确认保存结果，Host 可能已提交。请先刷新受影响的来源再决定是否重试；草稿已保留，不会自动重放。",
  namedIndependent: "设置中的 Deepwork Profiles 是独立的具名 JSONC 运行时资源编辑器。在此保存不会应用具名配置或选择其模型。"
};
var deploymentFieldLabels = {
  modelParameters: ["Model parameters", "模型参数"],
  passthrough: ["Model parameter passthrough", "模型参数透传"],
  locale: ["Agent business language", "Agent 业务语言"],
  permissionControl: ["Permission-control module", "权限控制子模块"],
  modules: ["Modules", "子模块"],
  skills: ["Skills", "技能"],
  roles: ["Agent roles", "Agent 角色"],
  deepwork: ["Deepwork", "Deepwork"],
  runtime: ["Native runtime (restart required)", "原生运行时（需重启）"],
  roleRouting: ["Existing-provider routes", "已有提供商路由"],
  runtimePolicy: ["Routing and retry policy", "路由与重试策略"],
  workflow: ["Workflow gates", "工作流关卡"],
  guards: ["Safety guards", "安全保护"],
  runtimeRecovery: ["Runtime recovery", "运行时恢复"],
  subagents: ["Subagents", "子 Agent"],
  lsp: ["LSP", "LSP"],
  presets: ["Preset materialization", "预设物化"],
  promptOrder: ["Prompt order", "提示词顺序"],
  defaultActive: ["Default Deepwork mode", "默认 Deepwork 模式"],
  enabled: ["Enabled", "启用"],
  materialize: ["Materialize presets", "物化预设"],
  scope: ["Guard scope", "保护范围"],
  plannerRootEnabled: ["Planner main-chat preset (restart required)", "Planner 主聊天预设（需重启）"],
  shellCommandSafety: ["Shell command safety", "Shell 命令安全"],
  gitWriteGuard: ["Git write policy", "Git 写入策略"],
  toolOutputTruncation: ["Tool output truncation", "工具输出截断"],
  maxInlineBytes: ["Inline byte limit", "内联字节上限"],
  planFormatValidation: ["Plan format validation", "计划格式校验"],
  questionLabelHelper: ["Question labels", "提问标签"],
  maxLabelChars: ["Label character limit", "标签字符上限"],
  todoDisciplineHelper: ["Todo discipline", "待办纪律"],
  enableRunInBackground: ["Allow background runs", "允许后台执行"],
  backgroundMode: ["Background mode", "后台模式"],
  maxDepth: ["Maximum depth", "最大深度"],
  policy: ["Policy", "策略"],
  strictGates: ["Strict gates", "严格关卡"],
  reviewCap: ["Review limit", "审查上限"],
  finalReviewPolicy: ["Final review policy", "最终审查策略"],
  retryOnStatusCodes: ["Retry HTTP statuses", "重试 HTTP 状态码"],
  retryOnCodes: ["Retry error codes", "重试错误码"],
  fallbackRoutes: ["Ordered fallback routes", "有序备用路由"],
  maxFallbackAttempts: ["Fallback attempt limit", "备用尝试上限"],
  idleContinuation: ["Idle continuation", "空闲继续"],
  maxContinuations: ["Continuation limit", "继续次数上限"],
  prompt: ["Continuation prompt", "继续提示词"],
  root: ["Materialization directory", "物化目录"],
  strategy: ["Routing strategy", "路由策略"],
  rateLimit: ["Bounded rate-limit retry", "有界限流重试"],
  maxRetries: ["Retry limit", "重试上限"],
  initialDelayMs: ["Initial delay (ms)", "初始延迟（毫秒）"],
  maxDelayMs: ["Delay limit (ms)", "延迟上限（毫秒）"],
  maxTotalDelayMs: ["Total wait budget (ms)", "累计等待上限（毫秒）"],
  switchAfterRateLimits: ["Rate limits before switching", "切换前限流次数"],
  maxSwitches: ["Switch limit", "切换上限"],
  serverName: ["LSP server name", "LSP 服务名称"],
  command: ["LSP command", "LSP 命令"],
  args: ["LSP arguments", "LSP 参数"],
  cwd: ["LSP working directory", "LSP 工作目录"],
  env: ["LSP environment", "LSP 环境变量"],
  toolCallTimeoutMs: ["LSP tool timeout (ms)", "LSP 工具超时（毫秒）"],
  failOnStartupError: ["Fail on LSP startup error", "LSP 启动错误时拒绝加载"]
};

// src/client/permission-locales.ts
var PERMISSIONS_NS = "settings.dsmm-permissions";
var permissionEn = {
  title: "Permission control",
  rules: "Global permission rules",
  nativeApproval: "Command approval uses the native prompt; ordinary Allow is once only. Deployment permission settings and exact nativeCommands are in this Permissions module. Choose Global or Current DSH profile above; Root rules below save independently.",
  root: "Selected native Root session",
  noRoot: "Select a trusted Root session in native session navigation. No Root is inferred from task or model text.",
  child: "This is a child session. Select its Root in native session navigation to edit Global rules.",
  unknown: "Unavailable / unknown",
  reading: "Reading…",
  busy: "Operation pending…",
  executable: "Native Shell registration identity (exact)",
  command: "Full command (exact)",
  cwd: "Working directory (exact)",
  id: "Rule ID",
  action: "Rule action",
  match: "Match kind",
  outsideReads: "Outside-workspace reads",
  webSearch: "Web search",
  webFetch: "Web fetch",
  enabled: "Enabled",
  rule: "Coarse rule",
  inherit: "Inherit native policy",
  "action:allow": "Allow",
  "action:ask": "Ask",
  "action:deny": "Deny",
  "kind:outside-read": "Outside-workspace read",
  "kind:shell": "Shell operation",
  "kind:webSearch": "Web search",
  "kind:webFetch": "Web fetch",
  path: "Canonical path",
  pathScope: "Path match",
  exact: "Exact path",
  tree: "Path and descendants",
  networkLimit: "SDK network boundary: allowing public web fetch does not allow private-network destinations. These web policies are not an all-shell or socket firewall.",
  rulesHint: "This Save uses the trusted Root’s Global rules CAS authority. Native dynamic permission overrides can refuse this RPC: edit or Unset them in the profile scope above, then refresh Root rules. No fallback Global write bypasses a refusal. Enabled and nativeCommands use configuration Save, not this Root transaction.",
  configPolicyHint: "Sparse permission settings: Global Unset restores built-in defaults; profile Unset inherits Global plus any Host base pin. Profile overrides win over Global. Arrays replace as a whole. Config Save does not bypass Root/operator/readonly checks or prove runtime synchronization; inspect saved/startup/admitted state below and refresh Permission control for live coverage.",
  configRulesHint: "Persisted rule records (exact schema, including source/revision/revoked). Edit existing records or supply valid import provenance; this config editor does not mint verified operator approval. Empty array explicitly replaces inherited records; Unset restores inheritance. The Root rules editor can stamp verified operator changes when its authority is writable.",
  coldHint: "Enabled is a cold switch (default On). Saving requires an independent Host restart to change mounting; it does not remove current protection. Restart may cancel sessions.",
  nativeCommands: "Exact native command entries",
  nativeCommandsHint: "Default Off. Each entry matches tool, executable, optional subcommand, ordered args, workingDirectory and sandboxMode exactly; no wildcards, command parsing or normalization. Allow cannot override downstream Ask/Deny or role readonly. New entries use Ask and workspace-write; no full-access grant is generated.",
  registrationUnresolved: "Native command registration / executor identity is unresolved here. A trusted kind:shell tool name is not proof of a nativeCommands bash/pwsh executor, executable, environment or sandbox. Enter only independently verified exact values; nothing is auto-filled or certified by this UI. Stale scope, controller or registration is still rejected by the Host.",
  entryId: "Entry ID",
  tool: "Tool (exact)",
  nativeExecutable: "Executable (exact)",
  subcommand: "Subcommand (optional; blank omits)",
  args: "Ordered arguments (JSON string array)",
  sandboxMode: "Sandbox mode (exact)",
  mode: "Native action",
  addEntry: "Add exact entry",
  removeEntry: "Remove entry",
  noEntries: "No exact command entries.",
  unset: "Unset — restore inheritance",
  inheritedEntries: "Inherited entries; editing pins a replacement array in this layer.",
  explicitEntries: "Explicit replacement array in this layer.",
  invalidEntry: "Invalid exact entry: use unique nonblank IDs, exact nonblank strings, an absolute Host working directory, and a JSON string array. Draft retained; Save locked.",
  rulesUnavailable: "Global rules are not editable until a trusted, open Root and writable local operator authority return a synchronized policy. A refusal is not an empty rules list. Edit or Unset native overrides in this module’s profile scope; there is no automatic Global-write fallback.",
  invalidArgsHint: "Correct invalid argument JSON before removing rows, or explicitly Unset this entire array to restore inheritance. Other fields do not discard invalid text.",
  observedPolicy: "Last observed effective policy (may include native profile overrides; not the sparse Global document)",
  profileOverrideState: "Native profile override state",
  profileOverrideUnknown: "Unknown from this Root rules response. Choose Current DSH profile above to inspect explicit overrides and inheritance. A failed Global rules Save does not clear or bypass them.",
  matchHint: "Rules match actual canonical paths (exact/tree), the native Shell registration identity plus full command/cwd, or web kind. Rule Allow only satisfies that rule; it does not grant external writes. Different IDs add records until explicitly revoked.",
  source: "Actual source",
  recordVersion: "Record version",
  savedAt: "Saved at",
  operator: "Verified Host operator",
  imported: "User import",
  active: "Active record",
  revoked: "Revoked record",
  base: "Draft CAS source",
  savedRevision: "Saved source",
  runtimeRevision: "Runtime source",
  runtime: "Runtime synchronization",
  synced: "Synced",
  updating: "Updating",
  unsynced: "Unsynced — rules saves locked",
  mounted: "Startup mounted",
  on: "On",
  off: "Off",
  restart: "Independent restart required",
  coverageTitle: "Observed trusted tool coverage",
  coverage: "Last observed for this Root from trusted registrations and the native rule consumer, separately from source synchronization. Saved, synced, mounted or a matching tool name does not prove coverage. Listed registrations do not prove executor readiness, network reachability or final-body ownership.",
  coverageUnavailable: "Coverage unavailable / unknown. No trusted live observation was returned.",
  coverageEmpty: "No trusted tool registrations observed for this Root.",
  coverageRuntime: "Observed consumer state",
  coverageRevision: "Observed consumer runtime source",
  toolName: "Observed tool name",
  toolKind: "Trusted registration kind",
  toolApproval: "Approval boundary",
  nativeOnce: "Native prompt — once only",
  toolMemory: "Scoped approval memory",
  notProvided: "Not provided",
  finalInode: "Final-inode / full filesystem guarantee",
  searchDestinations: "Web search destination rules",
  proxyBinding: "Proxy / address binding",
  shellSockets: "Shell / socket isolation",
  providerAuthMcp: "Provider authentication / MCP",
  "limit:outsideReads": "Tool-call boundary only; no complete filesystem confinement.",
  "limit:finalInode": "Not guaranteed.",
  "limit:scopedMemory": "Not provided by native rules.",
  "limit:webFetch": "Native public-address checks remain authoritative; private-network access is not granted.",
  "limit:webSearchDestinations": "Unsupported.",
  "limit:proxyAddressBinding": "Depends on the native proxy; no stronger address-binding guarantee.",
  "limit:shellSockets": "Depends on the native executor; no all-Shell or socket firewall.",
  "limit:providerAuthMcp": "Not covered by these rules.",
  pathEvidence: "Path evidence: read uses its actual scoped native FS. Glob/grep's production rg executor coLocation remains unproven; trusted registration is not shared-path proof. Shell read interpretation and path checks depend on explicit native executor evidence. No final-inode, full-filesystem or socket guarantee.",
  newRule: "Add exact-match rule",
  editRule: "Edit rule",
  stage: "Stage rule",
  cancel: "Cancel rule edit",
  stageRevoke: "Stage revocation",
  unstage: "Remove staged change",
  editor: "Rule draft",
  staged: "Staged changes — not saved",
  noRules: "No persisted rule records.",
  save: "Save Global rules",
  discard: "Discard draft and reload",
  dirty: "Unsaved rules draft",
  saved: "Host accepted Global rules. Check runtime synchronization below.",
  "issue:not-owned": "Root/operator/readonly authority refused. Select the intended Root and refresh.",
  "issue:stale": "Source conflict. Draft retained. Review, then explicitly discard and reload.",
  "issue:cancelled": "Operation cancelled; refresh actual saved state.",
  "issue:unavailable": "Service or runtime unavailable. Draft retained; saved and runtime state may differ.",
  "issue:validation": "Host refused the rule. Draft retained; check exact fields and native overrides.",
  "issue:not-found": "The rule no longer exists.",
  "issue:scope-unavailable": "The requested operation is unavailable.",
  "issue:replayed": "The operation is no longer current.",
  "issue:denied": "Current Root policy denied this operation. No local bypass is available.",
  "issue:transport": "Connection lost or outcome unconfirmed. Draft retained; refresh actual saved/runtime state.",
  "issue:protocol": "Untrusted or mismatched service response. Refresh or reconnect."
};
var permissionZh = {
  title: "权限控制",
  rules: "全局权限规则",
  nativeApproval: "命令批准使用原生提示，普通 Allow 仅批准本次。部署权限配置与精确 nativeCommands 在本权限模块内；上方选择 Global 或当前 DSH 配置，下面的 Root 规则独立保存。",
  root: "当前原生 Root 会话",
  noRoot: "请在原生会话导航中选择可信 Root 会话；不从任务或模型文本推断 Root。",
  child: "当前为 child 会话；编辑全局规则请在原生导航选择其 Root。",
  unknown: "不可用／未知",
  reading: "正在读取…",
  busy: "操作处理中…",
  executable: "原生 Shell 注册身份（精确匹配）",
  command: "完整命令（精确匹配）",
  cwd: "工作目录（精确匹配）",
  id: "规则 ID",
  action: "规则动作",
  match: "匹配类型",
  outsideReads: "工作区外读取",
  webSearch: "网页搜索",
  webFetch: "网页抓取",
  enabled: "启用",
  rule: "粗粒度规则",
  inherit: "继承原生策略",
  "action:allow": "允许",
  "action:ask": "询问",
  "action:deny": "拒绝",
  "kind:outside-read": "工作区外读取",
  "kind:shell": "Shell 操作",
  "kind:webSearch": "网页搜索",
  "kind:webFetch": "网页抓取",
  path: "规范路径",
  pathScope: "路径匹配",
  exact: "精确路径",
  tree: "此路径及子树",
  networkLimit: "SDK 网络边界：允许 public web fetch 不代表放行私网目标；这些网页策略不是全部 Shell 或 socket 的防火墙。",
  rulesHint: "此保存使用可信 Root 的 Global 规则 CAS 权限。native 动态权限覆盖可能使此 RPC 拒绝：请在上方当前配置作用域编辑或 Unset 覆盖，再刷新 Root 规则。拒绝后不会改走 Global 写入绕过。enabled 与 nativeCommands 使用配置保存，不属于此 Root 事务。",
  configPolicyHint: "稀疏权限配置：Global 的 Unset 恢复内建默认；当前配置的 Unset 继承 Global 及宿主 base 固定值。当前配置覆盖 Global；数组整体替换。配置保存不绕过 Root／operator／只读检查，也不证明运行时同步；请核对下方保存／启动／准入状态，并在权限控制页刷新实时覆盖。",
  configRulesHint: "持久规则记录（精确 schema，包含 source／revision／revoked）。可编辑现有记录或提供合法导入来源；此配置编辑器不生成已核验 operator 批准。空数组显式替换继承记录；Unset 恢复继承。Root 规则编辑器仅在权限可写时写入已核验 operator 来源。",
  coldHint: "enabled 为冷开关（默认开启），保存后需另行重启宿主才改变挂载；不会移除当前保护。重启可能取消会话。",
  nativeCommands: "精确原生命令条目",
  nativeCommandsHint: "默认关闭。每条精确匹配 tool、executable、可选 subcommand、有序 args、workingDirectory 与 sandboxMode；不使用通配符、不解析或归一化命令。Allow 不能覆盖下游 Ask／Deny 或角色只读。新条目使用 Ask 和 workspace-write，不生成完全访问授权。",
  registrationUnresolved: "此处原生命令注册／执行器身份未解析。可信 kind:shell 工具名称不证明 nativeCommands 的 bash／pwsh 执行器、executable、环境或沙箱。仅填写独立核验的精确值；本 UI 不自动填充或认证可信身份。过期 scope、controller 或注册仍由宿主拒绝。",
  entryId: "条目 ID",
  tool: "工具（精确）",
  nativeExecutable: "可执行程序（精确）",
  subcommand: "子命令（可选，留空省略）",
  args: "有序参数（JSON 字符串数组）",
  sandboxMode: "沙箱模式（精确）",
  mode: "原生动作",
  addEntry: "添加精确条目",
  removeEntry: "移除条目",
  noEntries: "没有精确命令条目。",
  unset: "Unset——恢复继承",
  inheritedEntries: "继承的条目；编辑后在此层固定为整体替换数组。",
  explicitEntries: "此层显式整体替换数组。",
  invalidEntry: "精确条目无效：ID 需唯一且非空，精确字符串不可空，工作目录为宿主绝对路径，参数为 JSON 字符串数组。草稿保留，保存已锁定。",
  rulesUnavailable: "需可信且已打开的 Root、可写的本地 operator 权限及已同步策略，才能编辑 Global 规则。拒绝不代表空规则列表。请在本模块的当前配置作用域编辑或 Unset native 覆盖；不会自动改走 Global 写入。",
  invalidArgsHint: "请修正无效参数 JSON 后再移除条目；也可显式 Unset 整个数组以恢复继承。修改其他字段不会丢弃无效文本。",
  observedPolicy: "最近观测的有效策略（可能包含 native 配置覆盖，非稀疏 Global 文档）",
  profileOverrideState: "Native 配置覆盖状态",
  profileOverrideUnknown: "此 Root 规则响应未提供覆盖状态。请在上方选择当前 DSH 配置，核对显式覆盖与继承；Global 规则保存失败不会清除或绕过覆盖。",
  matchHint: "规则匹配实际规范路径、原生 Shell 注册身份＋完整命令＋工作目录，或网页类型。规则 Allow 仅满足该规则，不授予外部写。不同 ID 添加记录，保留至显式撤销。",
  source: "实际来源",
  recordVersion: "记录版本",
  savedAt: "保存时间",
  operator: "宿主已核验 operator",
  imported: "用户导入",
  active: "有效记录",
  revoked: "已撤销记录",
  base: "草稿 CAS 来源",
  savedRevision: "已保存来源",
  runtimeRevision: "运行时来源",
  runtime: "运行时同步",
  synced: "已同步",
  updating: "同步中",
  unsynced: "未同步——规则保存已锁定",
  mounted: "启动时已挂载",
  on: "开启",
  off: "关闭",
  restart: "需要另行重启",
  coverageTitle: "已观测的可信工具覆盖",
  coverage: "此 Root 最近一次可信注册及原生规则 consumer 观测，与来源同步分开。已保存、已同步、已挂载或工具同名均不证明覆盖；所列注册不证明执行器就绪、网络可达或最终 body 归属。",
  coverageUnavailable: "覆盖不可用／未知：未返回可信的实时观测。",
  coverageEmpty: "未观测到此 Root 的可信工具注册。",
  coverageRuntime: "已观测 consumer 状态",
  coverageRevision: "已观测 consumer 运行时来源",
  toolName: "已观测工具名称",
  toolKind: "可信注册类型",
  toolApproval: "批准边界",
  nativeOnce: "原生提示——仅本次",
  toolMemory: "作用域批准记忆",
  notProvided: "不提供",
  finalInode: "最终 inode／完整文件系统保证",
  searchDestinations: "网页搜索目标规则",
  proxyBinding: "代理／地址绑定",
  shellSockets: "Shell／socket 隔离",
  providerAuthMcp: "Provider 认证／MCP",
  "limit:outsideReads": "仅工具调用边界，不是完整文件系统隔离。",
  "limit:finalInode": "不保证。",
  "limit:scopedMemory": "原生规则不提供。",
  "limit:webFetch": "仍以原生 public-address 检查为准，不授予私网访问。",
  "limit:webSearchDestinations": "不支持。",
  "limit:proxyAddressBinding": "依赖原生代理，不提供更强的地址绑定保证。",
  "limit:shellSockets": "依赖原生执行器，不是全部 Shell 或 socket 的防火墙。",
  "limit:providerAuthMcp": "不在这些规则覆盖范围。",
  pathEvidence: "路径证据：read 使用其实际 scope 的原生 FS。glob／grep 的生产 rg 执行器 coLocation 仍未证明；可信注册不等于共享路径证据。Shell 读取解析及路径检查依赖明确的原生执行器证据。不保证最终 inode、完整文件系统或 socket 隔离。",
  newRule: "添加精确匹配规则",
  editRule: "编辑规则",
  stage: "暂存规则",
  cancel: "取消规则编辑",
  stageRevoke: "暂存撤销",
  unstage: "移除暂存更改",
  editor: "规则草稿",
  staged: "暂存更改——尚未保存",
  noRules: "尚无持久化规则记录。",
  save: "保存全局规则",
  discard: "丢弃草稿并重载",
  dirty: "规则草稿未保存",
  saved: "宿主已接受全局规则，请核对运行时同步状态。",
  "issue:not-owned": "Root／operator／只读权限拒绝，请选择目标 Root 后刷新。",
  "issue:stale": "来源冲突，草稿保留；核对后显式丢弃并重载。",
  "issue:cancelled": "操作已取消，请刷新实际保存状态。",
  "issue:unavailable": "服务或运行时不可用，草稿保留；已保存与运行时可能不同。",
  "issue:validation": "宿主拒绝规则，草稿保留；请核对精确字段与原生覆盖。",
  "issue:not-found": "规则已不存在。",
  "issue:scope-unavailable": "所请求的操作不可用。",
  "issue:replayed": "操作已不再有效。",
  "issue:denied": "当前 Root 策略拒绝操作，没有本地绕过入口。",
  "issue:transport": "连接中断或结果未确认，草稿保留；请刷新实际保存／运行时状态。",
  "issue:protocol": "服务响应不可信或不匹配，请刷新或重连。"
};

// src/client/NativeCommandEntries.tsx
var import_react5 = require("react");
var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime7 = require("react/jsx-runtime");
function validNativeEntries(entries) {
  try {
    parseNativeCommands({ entries });
    return true;
  } catch {
    return false;
  }
}
function emptyNativeEntry() {
  return { id: "", mode: "ask", sandboxMode: "workspace-write", match: { tool: "bash", executable: "", args: [], workingDirectory: "" } };
}
function Arguments({ value, controller, name, disabled, onChange, t }) {
  const state = (0, import_react5.useSyncExternalStore)(controller.subscribe, controller.getSnapshot), id2 = (0, import_react5.useId)(), raw = state.raw[name], text5 = raw?.text ?? JSON.stringify(value), bad = raw?.invalid === true;
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: id2, children: t("args") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("textarea", { id: id2, rows: 3, maxLength: 32768, disabled, value: text5, "aria-invalid": bad, "aria-describedby": `${id2}-error`, onChange: (event) => {
      const raw2 = event.currentTarget.value;
      let parsed;
      try {
        parsed = parseAdvanced(raw2);
      } catch {
      }
      const valid = Array.isArray(parsed) && parsed.every((item) => typeof item === "string" && item.trim() !== "" && !item.includes("\0") && item.length <= 32768);
      controller.setRaw(name, raw2, !valid);
      if (valid) onChange(parsed);
    } }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { id: `${id2}-error`, className: "dsmm-hint", children: bad ? t("invalidEntry") : "" })
  ] });
}
function Entry({ entry, index, controller, disabled, removeDisabled, change, remove, t }) {
  const id2 = (0, import_react5.useId)();
  const valid = validNativeEntries([entry]);
  const text5 = (key, label) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: `${id2}-${key}`, children: t(label) }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Input, { className: "dsmm-input", id: `${id2}-${key}`, value: key === "id" ? entry.id : entry.match[key] ?? "", maxLength: 32768, disabled, required: key !== "subcommand", onChange: (event) => {
      const value = event.currentTarget.value;
      if (key === "id") change({ ...entry, id: value });
      else if (key === "subcommand" && value === "") {
        const { subcommand: _omitted, ...match } = entry.match;
        change({ ...entry, match });
      } else change({ ...entry, match: { ...entry.match, [key]: value } });
    } })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("fieldset", { "aria-describedby": !valid ? `${id2}-error` : void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("legend", { children: [
      t("nativeCommands"),
      " ",
      index + 1
    ] }),
    !valid && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", id: `${id2}-error`, children: t("invalidEntry") }),
    text5("id", "entryId"),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: `${id2}-tool`, children: t("tool") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("select", { id: `${id2}-tool`, disabled, value: entry.match.tool, onChange: (event) => {
        const tool = event.currentTarget.value;
        if (tool === "bash" || tool === "pwsh") change({ ...entry, match: { ...entry.match, tool } });
      }, children: ["bash", "pwsh"].map((value) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value, children: value }, value)) })
    ] }),
    text5("executable", "nativeExecutable"),
    text5("subcommand", "subcommand"),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Arguments, { value: entry.match.args, controller, name: `permissionControl.nativeCommands.entries.${index}.args`, disabled, t, onChange: (args) => change({ ...entry, match: { ...entry.match, args } }) }),
    text5("workingDirectory", "cwd"),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: `${id2}-sandbox`, children: t("sandboxMode") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("select", { id: `${id2}-sandbox`, disabled, value: entry.sandboxMode, onChange: (event) => {
        if (event.currentTarget.value === "workspace-write") change({ ...entry, sandboxMode: "workspace-write" });
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "workspace-write", children: "workspace-write" }),
        entry.sandboxMode === "danger-full-access" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("option", { value: "danger-full-access", disabled: true, children: [
          "danger-full-access (",
          t("source"),
          ")"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: `${id2}-mode`, children: t("mode") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("select", { id: `${id2}-mode`, disabled, value: entry.mode, onChange: (event) => {
        const mode = event.currentTarget.value;
        if (mode === "ask" || mode === "allow") change({ ...entry, mode });
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "ask", children: t("action:ask") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "allow", children: t("action:allow") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_dsh_client_ui_primitives5.Button, { type: "button", variant: "outline", disabled: disabled || removeDisabled, onClick: remove, children: [
      t("removeEntry"),
      " ",
      index + 1
    ] })
  ] });
}
function NativeCommandEntries({ value, inherited, controller, disabled, onChange, setInvalid, t }) {
  const entries = value ?? inherited, name = "permissionControl.nativeCommands.entries";
  const state = (0, import_react5.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
  const invalidArgs = state.invalidFields.filter((path) => path.startsWith(`${name}.`) && path.endsWith(".args"));
  const valid = validNativeEntries(entries);
  const change = (next) => {
    setInvalid(name, !validNativeEntries(next ?? inherited));
    onChange(next);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("details", { className: "dsmm-deployment-group", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("summary", { children: [
      t("nativeCommands"),
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("code", { children: name })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-structured", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("nativeCommandsHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("registrationUnresolved") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t(value === void 0 ? "inheritedEntries" : "explicitEntries") }),
      !valid && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-issue", role: "alert", children: t("invalidEntry") }),
      invalidArgs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("invalidArgsHint") }),
      entries.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t("noEntries") }),
      entries.map((entry, index) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        Entry,
        {
          entry,
          index,
          controller,
          disabled,
          removeDisabled: invalidArgs.length > 0,
          t,
          change: (next) => change(entries.map((row, position) => position === index ? next : row)),
          remove: () => {
            controller.clearRaw(name);
            change(entries.filter((_, position) => position !== index));
          }
        },
        index
      )),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { type: "button", variant: "outline", disabled: disabled || entries.length >= 1024, onClick: () => change([...entries, emptyNativeEntry()]), children: t("addEntry") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { type: "button", variant: "outline", "data-dsmm-unset": name, disabled: disabled || value === void 0 && invalidArgs.length === 0, onClick: () => {
          controller.clearRaw(name);
          change(void 0);
        }, children: t("unset") })
      ] })
    ] })
  ] });
}

// src/client/DeploymentFields.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var permissionText = (t) => (key) => (t("global") === "DSMM 全局配置" ? permissionZh : permissionEn)[key];
function fieldLabel(path, t) {
  const key = path.at(-1);
  if (path[0] === "permissionControl" && ["outsideReads", "webSearch", "webFetch", "rules", "nativeCommands", "rule"].includes(key)) return permissionText(t)(key);
  const item = deploymentFieldLabels[key];
  return item === void 0 ? key.replace(/^dsmm-/u, "").replace(/([a-z])([A-Z])/gu, "$1 $2") : item[t("global") === "DSMM 全局配置" ? 1 : 0];
}
function displayValue(value, t) {
  if (value === void 0) return t("unknown");
  if (typeof value === "boolean") return t(value ? "on" : "off");
  const text5 = JSON.stringify(value);
  return text5.length > 120 ? `${text5.slice(0, 120)}…` : text5;
}
function AdvancedField({ schema, path, controller, inherited, upper, t }) {
  const state = (0, import_react6.useSyncExternalStore)(controller.subscribe, controller.getSnapshot), id2 = (0, import_react6.useId)(), name = path.join(".");
  const value = at(state.draft, path), raw = state.raw[name], text5 = raw?.text ?? (value === void 0 ? "" : JSON.stringify(value, null, 2)), invalid2 = raw?.invalid === true;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("details", { className: "dsmm-deployment-group", "data-field": name, children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("summary", { children: [
      fieldLabel(path, t),
      " · ",
      t("advanced")
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { htmlFor: id2, children: [
        fieldLabel(path, t),
        " · ",
        t("advanced")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsmm-hint", id: `${id2}-hint`, children: t("advancedHint") }),
      path[0] === "permissionControl" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsmm-hint", children: permissionText(t)("configRulesHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsmm-hint", children: t(value === void 0 ? "inherit" : "explicit") }),
      upper !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "dsmm-hint", children: [
        t("profileSource"),
        ": ",
        displayValue(upper, t)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("textarea", { id: id2, rows: 6, maxLength: 32768, value: text5, disabled: !controller.canEdit(), "aria-invalid": invalid2, "aria-describedby": `${id2}-hint ${id2}-error`, onChange: (event) => {
        const next = event.currentTarget.value;
        let parsed, valid = true;
        try {
          parsed = parseAdvanced(next);
          const candidate = parsed === void 0 ? inherited : mergeLayer(inherited, parsed);
          valid = parsed === void 0 || validateEditorValue(parsed, schema, true) && validateEditorValue(upper === void 0 ? candidate : mergeLayer(candidate, upper), schema);
        } catch {
          valid = false;
        }
        controller.setRaw(name, next, !valid);
        if (valid) controller.edit(path, parsed);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { id: `${id2}-error`, className: "dsmm-hint", children: invalid2 ? t("invalid") : "" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { type: "button", variant: "outline", "data-dsmm-unset": name, disabled: !controller.canEdit() || value === void 0 && raw === void 0, onClick: () => {
        controller.clearRaw(name);
        controller.edit(path, void 0);
      }, children: t("unset") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("details", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("summary", { children: t("inherit") }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("pre", { children: JSON.stringify(inherited, null, 2) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("details", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("summary", { children: "schema" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("pre", { children: JSON.stringify(schema, null, 2) })
      ] })
    ] })
  ] });
}
function ScalarField({ schema, path, controller, inherited, t }) {
  const state = (0, import_react6.useSyncExternalStore)(controller.subscribe, controller.getSnapshot), id2 = (0, import_react6.useId)(), name = path.join(".");
  const value = at(state.draft, path), raw = state.raw[name], bad = raw?.invalid === true;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("label", { htmlFor: id2, children: fieldLabel(path, t) }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsmm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Input, { className: "dsmm-input", id: id2, type: "text", inputMode: schema.type === "number" ? "decimal" : void 0, value: raw?.text ?? String(value ?? inherited ?? ""), disabled: !controller.canEdit(), "aria-invalid": bad, "aria-describedby": `${id2}-error`, onChange: (event) => {
        const text5 = event.currentTarget.value, candidate = schema.type === "number" ? Number(text5) : text5;
        const valid = (schema.type !== "number" || text5.trim() !== "") && validateEditorValue(candidate, schema);
        controller.setRaw(name, text5, !valid);
        if (valid) controller.edit(path, candidate);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { type: "button", variant: "outline", "data-dsmm-unset": name, disabled: !controller.canEdit() || value === void 0 && raw === void 0, onClick: () => {
        controller.clearRaw(name);
        controller.edit(path, void 0);
      }, children: t("unset") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { id: `${id2}-error`, className: "dsmm-hint", children: [
      bad ? t("invalid") : "",
      schema.type === "number" && (schema.min !== void 0 || schema.max !== void 0) ? ` ${schema.min ?? "—"} – ${schema.max ?? "—"}` : ""
    ] })
  ] });
}
function Field({ schema, path, controller, t }) {
  if (schema.type === "transform" && schema.inner !== void 0) schema = schema.inner;
  const state = (0, import_react6.useSyncExternalStore)(controller.subscribe, controller.getSnapshot), snapshot4 = state.snapshot, id2 = (0, import_react6.useId)(), name = path.join(".");
  const explicit = at(state.draft, path), inherited = controller.layer === "global" ? at(snapshot4.defaults, path) : at(mergeLayer(mergeLayer(snapshot4.defaults, snapshot4.global), snapshot4.nativeForm?.base ?? {}), path);
  const choices = enumValues(schema), disabled = !controller.canEdit();
  if (name === "permissionControl.nativeCommands.entries") return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { "data-field": name, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(NativeCommandEntries, { controller, value: explicit, inherited: inherited ?? [], disabled, onChange: (value) => controller.edit(path, value), setInvalid: (key, bad) => controller.setInvalid(key, bad), t: permissionText(t) }) });
  if (schema.type === "object" && schema.fields !== void 0 && path[0] !== "roleRouting") return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("details", { className: "dsmm-deployment-group", "data-field": name, children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("summary", { children: fieldLabel(path, t) }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
      name === "permissionControl" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsmm-hint", children: permissionText(t)("configPolicyHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsmm-hint", children: t(explicit === void 0 ? "inherit" : "explicit") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { type: "button", variant: "outline", "data-dsmm-unset": name, disabled: disabled || explicit === void 0 && !Object.keys(state.raw).some((key) => key === name || key.startsWith(`${name}.`)), onClick: () => {
        controller.clearRaw(name);
        controller.edit(path, void 0);
      }, children: t("unsetGroup") }),
      Object.entries(schema.fields).map(([key, node]) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Field, { schema: node, path: [...path, key], controller, t }, key))
    ] })
  ] });
  if (!["boolean", "string", "number"].includes(schema.type) && choices === null) return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(AdvancedField, { schema, path, controller, inherited, upper: controller.layer === "global" ? at(snapshot4.profile, path) : void 0, t });
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsmm-field dsmm-deployment-field", "data-field": name, children: [
    schema.type === "boolean" || choices !== null ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("label", { htmlFor: id2, children: fieldLabel(path, t) }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("select", { id: id2, disabled, value: explicit === void 0 ? "inherit" : JSON.stringify(explicit), onChange: (event) => controller.edit(path, event.currentTarget.value === "inherit" ? void 0 : JSON.parse(event.currentTarget.value)), children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: "inherit", children: `${t("unset")} · ${displayValue(inherited, t)}` }),
        (choices ?? [true, false]).map((choice2) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: JSON.stringify(choice2), children: displayValue(choice2, t) }, String(choice2)))
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(ScalarField, { schema, path, controller, inherited, t }),
    name === "modelParameters.passthrough" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsmm-hint", children: t("modelParametersHint") }),
    name === "permissionControl.enabled" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsmm-hint", children: permissionText(t)("coldHint") }),
    explicit !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsmm-hint", children: t(equal(explicit, at(snapshot4.defaults, path)) ? "defaultPin" : "explicit") }),
    controller.layer === "profile" && at(snapshot4.nativeForm?.base, path) !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsmm-hint", children: t("hostPin") }),
    controller.layer === "global" && at(snapshot4.profile, path) !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "dsmm-hint", children: [
      t("profileSource"),
      ": ",
      displayValue(at(snapshot4.profile, path), t),
      " · ",
      t("explicit")
    ] })
  ] });
}

// src/client/PermissionsPanel.tsx
var import_react7 = require("react");
var import_dsh_client_ui_primitives7 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime9 = require("react/jsx-runtime");
var actions = ["inherit", "allow", "ask", "deny"];
var kinds = ["outside-read", "shell", "webSearch", "webFetch"];
var ruleDraft = (rule) => ({ id: rule.id, action: rule.action, match: structuredClone(rule.match) });
var newMatch = (kind) => kind === "outside-read" ? { kind, path: "", scope: "exact" } : kind === "shell" ? { kind, executable: "", command: "", workingDirectory: "" } : { kind };
function Issue({ value, t }) {
  return value === null ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "dsmm-issue", role: "alert", children: [
    t(`issue:${value}`),
    " ",
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("code", { children: value })
  ] });
}
function RootState({ state, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { children: [
      t("root"),
      ": ",
      t(state.scope === "root" && state.connected ? "active" : "unknown")
    ] }),
    state.scope !== "root" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t(state.scope === "child" ? "child" : "noRoot") }),
    !state.connected && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t("unknown") })
  ] });
}
function ActionSelect({ id: id2, value, inherit = true, onChange, disabled, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("select", { id: id2, value, disabled, onChange: (event) => {
    const choice2 = actions.find((value2) => value2 === event.currentTarget.value);
    if (choice2 !== void 0) onChange(choice2);
  }, children: actions.filter((value2) => inherit || value2 !== "inherit").map((value2) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: value2, children: t(value2 === "inherit" ? "inherit" : `action:${value2}`) }, value2)) });
}
function RuleEditor({ controller, state, t }) {
  const id2 = (0, import_react7.useId)(), editor = state.draft?.editor;
  if (editor == null) return null;
  const disabled = !controller.canEdit(state.generation), change = (value) => controller.edit(state.generation, { editor: value });
  const field = (key, label) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("label", { htmlFor: `${id2}-${key}`, children: t(label) }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Input, { className: "dsmm-input", id: `${id2}-${key}`, required: true, maxLength: 32768, disabled, value: key in editor.match ? String(Reflect.get(editor.match, key)) : "", onChange: (event) => change({ ...editor, match: { ...editor.match, [key]: event.currentTarget.value } }) })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("form", { className: "dsmm-structured", "aria-label": t("editor"), onSubmit: (event) => {
    event.preventDefault();
    controller.stageRule(state.generation);
  }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("label", { htmlFor: `${id2}-id`, children: t("id") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Input, { className: "dsmm-input", id: `${id2}-id`, required: true, maxLength: 256, value: editor.id, disabled, onChange: (event) => change({ ...editor, id: event.currentTarget.value }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("label", { htmlFor: `${id2}-action`, children: t("action") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ActionSelect, { id: `${id2}-action`, value: editor.action, disabled, inherit: false, t, onChange: (action2) => {
        if (action2 !== "inherit") change({ ...editor, action: action2 });
      } })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("label", { htmlFor: `${id2}-kind`, children: t("match") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("select", { id: `${id2}-kind`, value: editor.match.kind, disabled, onChange: (event) => {
        const kind = kinds.find((value) => value === event.currentTarget.value);
        if (kind !== void 0) change({ ...editor, match: newMatch(kind) });
      }, children: kinds.map((kind) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: kind, children: t(`kind:${kind}`) }, kind)) })
    ] }),
    editor.match.kind === "outside-read" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
      field("path", "path"),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("label", { htmlFor: `${id2}-path-scope`, children: t("pathScope") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("select", { id: `${id2}-path-scope`, value: editor.match.scope, disabled, onChange: (event) => {
          const scope = event.currentTarget.value;
          if (editor.match.kind === "outside-read" && (scope === "exact" || scope === "tree")) change({ ...editor, match: { ...editor.match, scope } });
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: "exact", children: t("exact") }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: "tree", children: t("tree") })
        ] })
      ] })
    ] }),
    editor.match.kind === "shell" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
      field("executable", "executable"),
      field("command", "command"),
      field("workingDirectory", "cwd")
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { type: "submit", variant: "outline", disabled, children: t("stage") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { type: "button", variant: "outline", disabled, onClick: () => controller.edit(state.generation, { editor: null }), children: t("cancel") })
    ] })
  ] });
}
function RuleRecords({ controller, state, t }) {
  const records = state.rules?.snapshot.policy.rules ?? state.base?.policy.rules;
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-structured", children: [
    records?.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: t("noRules") }),
    records?.map((rule) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("fieldset", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("legend", { children: rule.id }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { children: [
        t(rule.revoked ? "revoked" : "active"),
        " · ",
        t(`action:${rule.action}`)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("dl", { className: "dsmm-child-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("match") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: t(`kind:${rule.match.kind}`) }),
        rule.match.kind === "outside-read" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("path") }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("dd", { children: [
            rule.match.path,
            " · ",
            t(rule.match.scope)
          ] })
        ] }),
        rule.match.kind === "shell" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("executable") }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: rule.match.executable }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("command") }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("code", { children: rule.match.command }) }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("cwd") }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: rule.match.workingDirectory })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("source") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: t(rule.source.kind === "operator" ? "operator" : "imported") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { type: "button", variant: "outline", disabled: !controller.canEdit(state.generation) || state.draft === null, onClick: () => controller.edit(state.generation, { editor: ruleDraft(rule) }), children: t("editRule") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { type: "button", variant: "outline", disabled: !controller.canEdit(state.generation) || state.draft === null || rule.revoked || state.draft.revoke.includes(rule.id), onClick: () => controller.stageRevoke(state.generation, rule.id), children: t("stageRevoke") })
      ] })
    ] }, rule.id))
  ] });
}
function PermissionCoverage({ state, t }) {
  const value = state.rules?.capabilities;
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "dsmm-structured", "aria-label": t("coverageTitle"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: t("coverageTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t("coverage") }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t("registrationUnresolved") }),
    value === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: t("coverageUnavailable") }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("dl", { className: "dsmm-child-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("coverageRuntime") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("dd", { children: [
          t(value.runtime.state),
          " · ",
          t("mounted"),
          ": ",
          t(value.runtime.mounted ? "on" : "off")
        ] })
      ] }),
      value.runtime.restartRequired && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: t("restart") }),
      value.tools.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: t("coverageEmpty") }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("ul", { className: "dsmm-profile-list", children: value.tools.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("dl", { className: "dsmm-child-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("toolName") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("code", { children: tool.name }) }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("toolKind") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("code", { children: tool.kind }) }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("toolApproval") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: t("nativeOnce") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("toolMemory") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: t("notProvided") })
      ] }) }, tool.name)) }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("dl", { className: "dsmm-child-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("outsideReads") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: t("limit:outsideReads") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("finalInode") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: t("limit:finalInode") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("toolMemory") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: t("limit:scopedMemory") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("webFetch") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: t("limit:webFetch") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("searchDestinations") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: t("limit:webSearchDestinations") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("proxyBinding") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: t("limit:proxyAddressBinding") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("shellSockets") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: t("limit:shellSockets") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("providerAuthMcp") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: t("limit:providerAuthMcp") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t("pathEvidence") })
  ] });
}
function PermissionRulesEditor({ controller, state, t }) {
  const id2 = (0, import_react7.useId)(), draft2 = state.draft, disabled = !controller.canEdit(state.generation), value = state.rules;
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "dsmm-zone", "aria-label": t("rules"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: t("rules") }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t("rulesHint") }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t("networkLimit") }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t("matchHint") }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Issue, { value: state.rulesIssue, t }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t("observedPolicy") }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("dl", { className: "dsmm-child-meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("profileOverrideState") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: t("profileOverrideUnknown") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("dl", { className: "dsmm-child-meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("runtime") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: value === null ? t("unknown") : t(value.runtime.state) }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: t("mounted") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: value === null ? t("unknown") : t(value.runtime.mounted ? "on" : "off") })
    ] }),
    value?.runtime.restartRequired && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: t("restart") }),
    disabled && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t(state.reading ? "reading" : "rulesUnavailable") }),
    state.base !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("dl", { className: "dsmm-child-meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: "permissionControl.enabled" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("dd", { children: [
        t(state.base.policy.enabled ? "on" : "off"),
        " · ",
        t("coldHint")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: "permissionControl.nativeCommands.enabled" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: t(state.base.policy.nativeCommands.enabled ? "on" : "off") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(PermissionCoverage, { state, t }),
    draft2 !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("label", { htmlFor: `${id2}-outside`, children: t("outsideReads") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ActionSelect, { id: `${id2}-outside`, value: draft2.outsideReads, disabled, t, onChange: (outsideReads) => controller.edit(state.generation, { outsideReads }) })
      ] }),
      ["webSearch", "webFetch"].map((key) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("fieldset", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("legend", { children: t(key) }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "dsmm-actions", htmlFor: `${id2}-${key}-enabled`, children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("input", { type: "checkbox", id: `${id2}-${key}-enabled`, checked: draft2[key].enabled, disabled, onChange: (event) => controller.edit(state.generation, { [key]: { ...draft2[key], enabled: event.currentTarget.checked } }) }),
          t("enabled")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("label", { htmlFor: `${id2}-${key}-rule`, children: t("rule") }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ActionSelect, { id: `${id2}-${key}-rule`, value: draft2[key].rule, disabled, t, onChange: (rule) => controller.edit(state.generation, { [key]: { ...draft2[key], rule } }) })
        ] })
      ] }, key)),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { type: "button", variant: "outline", disabled: disabled || draft2.editor !== null, onClick: () => controller.edit(state.generation, { editor: { id: "", action: "ask", match: newMatch("outside-read") } }), children: t("newRule") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(RuleEditor, { controller, state, t }),
      (draft2.upsert.length > 0 || draft2.revoke.length > 0) && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-structured", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: t("staged") }),
        draft2.upsert.map((row) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { children: [
            row.id,
            " · ",
            t(`kind:${row.match.kind}`),
            " · ",
            t(`action:${row.action}`)
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_dsh_client_ui_primitives7.Button, { type: "button", variant: "outline", disabled, onClick: () => controller.edit(state.generation, { upsert: draft2.upsert.filter((rule) => rule.id !== row.id) }), children: [
            t("unstage"),
            ": ",
            row.id
          ] })
        ] }, row.id)),
        draft2.revoke.map((ruleId) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { children: [
            t("stageRevoke"),
            ": ",
            ruleId
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_dsh_client_ui_primitives7.Button, { type: "button", variant: "outline", disabled, onClick: () => controller.edit(state.generation, { revoke: draft2.revoke.filter((id3) => id3 !== ruleId) }), children: [
            t("unstage"),
            ": ",
            ruleId
          ] })
        ] }, ruleId))
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(RuleRecords, { state, controller, t }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { type: "button", variant: "primary", disabled: !controller.canSave(state.generation), onClick: () => void controller.save(state.generation), children: t("save") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { type: "button", variant: "outline", disabled: state.scope !== "root" || !state.connected || state.reading || state.busy !== null, onClick: () => void controller.refresh(state.generation, true), children: t("discard") })
    ] }),
    state.dirty && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: t("dirty") })
  ] });
}
function PermissionsPanel({ controller, t, sessionId: sessionId2 }) {
  const state = (0, import_react7.useSyncExternalStore)(controller.store.subscribe, controller.store.getSnapshot);
  (0, import_react7.useEffect)(() => controller.watch(), [controller]);
  if (sessionId2 !== void 0 && sessionId2 !== state.sessionId) return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", role: "status", children: t("rulesUnavailable") });
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "dsmm-profiles dsmm-children dsmm-permissions", "data-dsmm-permissions": true, "aria-label": t("title"), "aria-busy": state.reading || state.busy !== null, children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h2", { children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(RootState, { state, t }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t("nativeApproval") }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", children: state.busy !== null ? t("busy") : state.reading ? t("reading") : state.notice === null ? "" : t(state.notice) }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(PermissionRulesEditor, { controller, state, t })
  ] });
}

// src/client/DeploymentPage.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
function ScopeSave({ controller, workspace, refreshOnly = false, t }) {
  const state = (0, import_react8.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
  const pending = [...new Set(controller.pendingPaths().map(moduleFor))];
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "dsmm-scope-save", "aria-label": t(refreshOnly ? "refresh" : "saveScope"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", children: refreshOnly ? state.busy ? t("loading") : "" : state.busy ? t("saving") : state.refreshRequired ? t("savedRefreshRequired") : state.saved ? t("saved") : state.dirty ? t("dirty") : "" }),
    !refreshOnly && pending.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { children: [
      t("pendingModules"),
      ": ",
      pending.map((module2) => t(moduleTitle(module2))).join(" · ")
    ] }),
    state.issue !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-issue", role: "alert", children: t(state.issue) }),
    !refreshOnly && state.invalidFields.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-issue", role: "alert", children: t("invalid") }),
    controller.layer === "profile" && !controller.canWriteProfile() && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("unavailableForm") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-actions", children: [
      !refreshOnly && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { type: "button", variant: "primary", disabled: !controller.canSave(), onClick: () => void (workspace?.save() ?? controller.save()), children: t(controller.layer === "global" ? "saveGlobal" : "saveProfile") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { type: "button", variant: "outline", disabled: state.busy, onClick: () => void controller.refresh(), children: t("refresh") }),
      !refreshOnly && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { type: "button", variant: "outline", disabled: state.busy || !state.dirty && state.issue === null && !state.refreshRequired, onClick: () => void controller.refresh(true), children: t("discard") })
    ] })
  ] });
}
function NativeRuntimeState({ value, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "dsmm-availability", "aria-label": t("nativeRuntimeState"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h3", { children: t("nativeRuntimeState") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { children: [
      t("nativeRuntimeBinding"),
      ": ",
      t(value?.binding === "stock" ? "nativeRuntimeStock" : value?.binding === "unavailable" ? "nativeRuntimeUnavailable" : "unknown")
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { children: [
      t("nativeRuntimeFence"),
      ": ",
      value === void 0 ? t("unknown") : t(value.deliveryFenceReady ? "on" : "off"),
      " · ",
      t("nativeRuntimeRestart"),
      ": ",
      value === void 0 ? t("unknown") : t(value.restartRequired ? "on" : "off")
    ] }),
    value?.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t(`nativeRuntimeReason-${value.reason}`) }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("nativeRuntimeReadinessHint") })
  ] });
}
function StateInspector({ controller, t }) {
  const { snapshot: snapshot4, session, dirty, issue } = (0, import_react8.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
  if (snapshot4 === null) return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t("unavailable") });
  const admitted = session?.configuration ?? null;
  const source = (value2) => t(value2 === "profile" ? "profileSource" : value2 === "global" ? "globalSource" : value2 === "defaults" ? "defaultsSource" : value2 === "named-session" ? "namedSource" : value2 === "startup" ? "startupSource" : value2 === "deployment" ? "deploymentCapture" : value2 === "mixed" ? "mixedSource" : "unknown");
  const value = (layer, path) => layer === void 0 ? t("unknown") : at(layer, path.split(".")) === void 0 ? t("absent") : displayValue(at(layer, path.split(".")), t);
  const restart = (snapshot4.nextRoot?.restartRequired ?? []).filter((path) => visibleDeploymentPath(path.split(".")));
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-structured", children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { role: "status", children: session === null ? t("noSession") : admitted === null ? t("sessionUnavailable") : t("sessionObserved") }),
    (dirty || issue !== null) && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("inspectorStale") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { children: [
      t("globalSource"),
      ": ",
      t(configurationVersionState(snapshot4.globalRevision)),
      " · ",
      t("profileSource"),
      ": ",
      t(configurationVersionState(snapshot4.nativeRevision))
    ] }),
    snapshot4.subagentRuntime !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(NativeRuntimeState, { value: snapshot4.subagentRuntime, t }),
    snapshot4.modules.map((module2) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "dsmm-zone", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h3", { children: module2.descriptor.label }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { children: [
        t("desired"),
        ": ",
        t(module2.desired.enabled ? "on" : "off"),
        " · ",
        source(module2.desired.source)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { children: [
        t("startup"),
        ": ",
        module2.startupMounted == null ? t("unknown") : t(module2.startupMounted ? "on" : "off")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { children: [
        t("next"),
        ": ",
        module2.nextRoot.admitted == null ? t("unknown") : t(module2.nextRoot.admitted ? "on" : "off")
      ] }),
      module2.pending && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t("pending") })
    ] }, module2.descriptor.id)),
    inspectorPaths(snapshot4, admitted).map((path) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dl", { className: "dsmm-deployment-state", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: path }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dd", { children: [
        t("desired"),
        ": ",
        value(snapshot4.desired, path),
        " · ",
        source(snapshot4.sources[path])
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dd", { children: [
        t("startup"),
        ": ",
        value(snapshot4.startup, path),
        " · ",
        source(snapshot4.startupSources?.[path])
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dd", { children: [
        t("next"),
        ": ",
        value(snapshot4.nextRoot?.settings, path),
        " · ",
        source(snapshot4.nextRoot?.sources[path])
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dd", { children: [
        t("session"),
        ": ",
        value(admitted?.settings, path),
        " · ",
        source(admitted?.sources[path])
      ] })
    ] }, path)),
    restart.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { children: [
      t("pending"),
      ": ",
      restart.join(", ")
    ] })
  ] });
}
function DeploymentPage(props) {
  const workspace = props.workspace ?? deploymentWorkspace(props.core, props.permissions);
  const navigation = (0, import_react8.useSyncExternalStore)(workspace.subscribe, workspace.getSnapshot);
  const core = (0, import_react8.useSyncExternalStore)(props.core.subscribe, props.core.getSnapshot);
  const controller = workspace.controller() ?? props.core;
  const state = (0, import_react8.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
  const id2 = (0, import_react8.useId)(), heading = (0, import_react8.useRef)(null), triggers = (0, import_react8.useRef)(/* @__PURE__ */ new Map()), previous = (0, import_react8.useRef)(null);
  const scopeControl = (0, import_react8.useRef)(null), confirmation = (0, import_react8.useRef)(null);
  const resume = (0, import_react8.useRef)(null);
  const { t } = props, snapshot4 = state.snapshot ?? core.snapshot, active = navigation.module;
  (0, import_react8.useEffect)(() => {
    if (props.view === "page") void props.core.refresh();
  }, [props.core, props.view]);
  (0, import_react8.useEffect)(() => {
    if (props.forms !== void 0) workspace.bindForms(props.forms);
  }, [workspace, props.forms]);
  (0, import_react8.useEffect)(() => {
    if (active !== null) heading.current?.focus();
    else if (previous.current !== null) triggers.current.get(previous.current)?.focus();
    previous.current = active;
  }, [active]);
  (0, import_react8.useEffect)(() => {
    if (navigation.pending !== null) {
      resume.current = { element: document.activeElement, scope: navigation.scope, module: active };
      confirmation.current?.focus();
    } else if (resume.current !== null) {
      const from2 = resume.current;
      resume.current = null;
      if (from2.scope === navigation.scope && from2.module === active) {
        if (from2.element.isConnected) from2.element.focus();
      } else if (active !== null) heading.current?.focus();
      else if (from2.scope !== navigation.scope) scopeControl.current?.focus();
    }
  }, [navigation.pending, navigation.scope, active]);
  if (props.view === "summary") return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: t("summary") });
  const fields = snapshot4 === null || active === null ? [] : moduleFields(scopeSchema(snapshot4, controller.layer), active, controller.layer);
  const modules = CONFIG_MODULES.filter((module2) => module2 === "state" || module2 === "permissions" || snapshot4 === null || moduleFields(snapshot4.schema, module2, "global").length + moduleFields(scopeSchema(snapshot4, "profile"), module2, "profile").length > 0);
  const scopeActions = /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ScopeSave, { controller: active === "state" ? props.core : controller, workspace, refreshOnly: active === "state" || workspace.controller() === null, t });
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "dsmm-profiles dsmm-deployment", "data-dsmm-page": true, "aria-label": t("title"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t("description") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("boundaries") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("label", { htmlFor: `${id2}-scope`, children: t("scope") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("select", { ref: scopeControl, id: `${id2}-scope`, value: navigation.scope, disabled: state.busy || navigation.pending !== null, onChange: (event) => {
        const scope = event.currentTarget.value;
        if (scope === "global" || scope === "profile") workspace.request({ scope, module: active });
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "global", children: t("global") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "profile", children: t("profile") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t(navigation.scope === "global" ? "globalHint" : "profileHint") }),
    navigation.scope === "profile" && (navigation.native === null || !navigation.native.canWriteProfile()) && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("unavailableForm") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-deployment-frame", "data-drawer-open": active !== null, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("nav", { className: "dsmm-module-list", "aria-label": t("modules"), children: modules.map((module2) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { ref: (element) => {
        if (element !== null) triggers.current.set(module2, element);
      }, type: "button", variant: "outline", disabled: navigation.pending !== null, "aria-expanded": active === module2, "aria-controls": `${id2}-drawer`, onClick: () => workspace.request({ scope: navigation.scope, module: module2 }), children: t(moduleTitle(module2)) }, module2)) }),
      active !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("aside", { id: `${id2}-drawer`, className: "dsmm-module-drawer", "aria-labelledby": `${id2}-heading`, "data-dsmm-module": active, onKeyDown: (event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        const target = event.target;
        if (target.tagName === "SELECT" && (!globalThis.CSS?.supports("selector(select:open)") || target.matches("select:open"))) return;
        event.preventDefault();
        if (navigation.pending !== null) workspace.continueEditing();
        else workspace.request({ scope: navigation.scope, module: null });
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-drawer-heading", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h2", { id: `${id2}-heading`, ref: heading, tabIndex: -1, children: t(moduleTitle(active)) }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { type: "button", variant: "outline", disabled: state.busy, onClick: () => workspace.request({ scope: navigation.scope, module: null }), children: t("close") })
        ] }),
        active === "state" ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(StateInspector, { controller: props.core, t }),
          scopeActions
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
          navigation.scope === "profile" && navigation.native === null ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t("unavailableForm") }) : state.snapshot === null ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t(state.busy ? "loading" : "unavailable") }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { "data-dsmm-layer": controller.layer, "aria-busy": state.busy, className: "dsmm-structured", children: [
            fields.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("noModuleFields") }),
            fields.map(([key, schema]) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Field, { schema, path: [key], controller, t }, key)),
            active === "run" && controller.layer === "profile" && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(NativeRuntimeState, { value: state.snapshot.subagentRuntime, t })
          ] }),
          scopeActions,
          active === "permissions" && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "dsmm-zone", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h3", { children: t("rootRules") }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("rootRulesHint") }),
            workspace.permissions === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t("rootRulesUnavailable") }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(PermissionsPanel, { controller: workspace.permissions, t: (key) => Object.hasOwn(permissionEn, key) ? permissionText(t)(key) : key })
          ] })
        ] })
      ] })
    ] }),
    navigation.pending !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "dsmm-confirm", role: "group", "aria-label": t("leaveDraft"), onKeyDown: (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        workspace.continueEditing();
      }
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t("leaveDraft") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { ref: confirmation, type: "button", variant: "primary", onClick: () => workspace.continueEditing(), children: t("continueEditing") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { type: "button", variant: "outline", onClick: () => workspace.keepAndNavigate(), children: t("keepDraft") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { type: "button", variant: "outline", disabled: state.busy, onClick: () => void workspace.discardAndNavigate(), children: t("discardDraft") })
      ] })
    ] })
  ] });
}

// src/role-control-types.ts
var ROLE_CONTROL_DISABLED_REASONS = [
  "module-off",
  "role-disabled",
  "read-only",
  "one-shot",
  "unknown-mode",
  "not-direct-child",
  "evidence-unavailable",
  "unavailable"
];
var ROLE_CONTROL_ERROR_CODES = ["validation", "not-owned", "unavailable", "cancelled", "conflict", "not-found", "not-resumable", "invalid-content", "invalid-time-zone", "disabled"];
var ROLE_CONTROL_ERROR_FIELDS = ["sessionId", "parentSessionId", "childSessionId", "request", "content", "clientTimeZone"];

// src/role-control-remote.ts
function fail3() {
  throw new TypeError("Invalid Deepwork child control DTO.");
}
function json(value, depth2 = 0, active = /* @__PURE__ */ new Set()) {
  if (depth2 > 24) fail3();
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || value === null || active.has(value)) fail3();
  const isArray = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype) && (isArray || Object.getPrototypeOf(value) !== null)) fail3();
  if (Object.getOwnPropertySymbols(value).length) fail3();
  for (const [key, property2] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (isArray && key === "length") continue;
    if (!Object.hasOwn(property2, "value") || !property2.enumerable || ["__proto__", "prototype", "constructor"].includes(key) || isArray && !/^(0|[1-9][0-9]*)$/u.test(key)) fail3();
  }
  if (isArray && Object.keys(value).length !== value.length) fail3();
  active.add(value);
  const result = isArray ? value.map((child2) => json(child2, depth2 + 1, active)) : Object.fromEntries(Object.entries(value).map(([key, child2]) => [key, json(child2, depth2 + 1, active)]));
  active.delete(value);
  return result;
}
function object2(value, required, optional2 = []) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail3();
  const row = value;
  if (required.some((key) => !Object.hasOwn(row, key)) || Object.keys(row).some((key) => !required.includes(key) && !optional2.includes(key))) fail3();
  return row;
}
function choice(value, choices) {
  if (!choices.includes(value)) fail3();
  return value;
}
function text3(value, max) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/u.test(value) || new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(value)) !== value) fail3();
  return value;
}
function identity(value) {
  if (!isNativeSessionId(value)) fail3();
  return value;
}
function epoch2(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) fail3();
  return value;
}
function array(value, max = 4096) {
  if (!Array.isArray(value) || value.length > max) fail3();
  return value;
}
function bool(value) {
  if (typeof value !== "boolean") fail3();
  return value;
}
function depth(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 4096) fail3();
  return value;
}
function availability(value) {
  const row = object2(value, ["enabled"], ["reason"]);
  if (row.enabled === true && !Object.hasOwn(row, "reason")) return { enabled: true };
  if (row.enabled !== false) fail3();
  return { enabled: false, reason: choice(row.reason, ROLE_CONTROL_DISABLED_REASONS) };
}
function capabilities(value) {
  const row = object2(value, ["prompt", "interrupt", "images", "runtime"]);
  return { prompt: availability(row.prompt), interrupt: availability(row.interrupt), images: availability(row.images), runtime: parseSubagentRuntimeAdmissionView(row.runtime) };
}
function child(value) {
  const row = object2(value, ["id", "parentSessionId", "mode", "activity", "readonly", "controls"], ["label", "invocation", "routeComparison"]);
  const controls = object2(row.controls, ["prompt", "interrupt"]);
  const mode = choice(row.mode, ["one-shot", "continuable", "unknown"]);
  const prompt = availability(controls.prompt), interrupt = availability(controls.interrupt);
  const readonly = bool(row.readonly);
  if (readonly !== (!prompt.enabled && !interrupt.enabled) || mode !== "continuable" && (prompt.enabled || interrupt.enabled)) fail3();
  const invocation = Object.hasOwn(row, "invocation") ? parseDsmmInvocationView(row.invocation) : void 0;
  const routeComparison = Object.hasOwn(row, "routeComparison") ? parseDsmmRoleRouteComparison(row.routeComparison) : void 0;
  const id2 = identity(row.id);
  if (invocation !== void 0 && (invocation.childId !== id2 || invocation.mode !== mode)) fail3();
  if (routeComparison !== void 0 && routeComparison.childId !== id2) fail3();
  return {
    id: id2,
    parentSessionId: identity(row.parentSessionId),
    mode,
    activity: choice(row.activity, ["running", "inactive"]),
    readonly,
    controls: { prompt, interrupt },
    ...Object.hasOwn(row, "label") ? { label: text3(row.label, 120) } : {},
    ...invocation === void 0 ? {} : { invocation },
    ...routeComparison === void 0 ? {} : { routeComparison }
  };
}
function snapshot3(value) {
  const row = object2(value, ["sessionId", "admissionEpoch", "children", "capabilities"]);
  const sessionId2 = identity(row.sessionId), admissionEpoch = epoch2(row.admissionEpoch), children = array(row.children).map(child);
  if (children.some((child2) => child2.parentSessionId !== sessionId2)) fail3();
  return { sessionId: sessionId2, admissionEpoch, children, capabilities: capabilities(row.capabilities) };
}
function descendants(value) {
  const row = object2(value, ["sessionId", "admissionEpoch", "descendants"]);
  const sessionId2 = identity(row.sessionId), admissionEpoch = epoch2(row.admissionEpoch);
  const entries = array(row.descendants).map((value2) => {
    const entry = object2(value2, ["kind", "depth"], ["child", "hasChildren", "id", "parentSessionId", "reason"]);
    if (entry.kind === "child") {
      object2(entry, ["kind", "depth", "child", "hasChildren"]);
      const projected = child(entry.child);
      if (entry.depth !== 1 && (projected.controls.prompt.enabled || projected.controls.interrupt.enabled)) fail3();
      return { kind: "child", depth: depth(entry.depth), child: projected, hasChildren: bool(entry.hasChildren) };
    }
    object2(entry, ["kind", "depth", "id", "parentSessionId", "reason"]);
    if (entry.kind !== "diagnostic") fail3();
    return { kind: "diagnostic", depth: depth(entry.depth), id: identity(entry.id), parentSessionId: identity(entry.parentSessionId), reason: choice(entry.reason, ["corrupt", "unsupported", "unavailable"]) };
  });
  for (const entry of entries) {
    const parent = entry.kind === "child" ? entry.child.parentSessionId : entry.parentSessionId;
    if (entry.depth === 1 !== (parent === sessionId2)) fail3();
  }
  return { sessionId: sessionId2, admissionEpoch, descendants: entries };
}
function promptRequest(value) {
  const row = object2(value, ["requestId", "parentSessionId", "childSessionId", "mode", "delivery", "content"], ["clientTimeZone"]);
  if (row.mode !== "continuable") fail3();
  const content2 = array(row.content, Number.MAX_SAFE_INTEGER).map((value2) => {
    const part = object2(value2, ["type"], ["text", "mediaType", "data", "name"]);
    if (part.type === "text") {
      object2(part, ["type", "text"]);
      if (typeof part.text !== "string") fail3();
      return { type: "text", text: part.text };
    }
    object2(part, ["type", "mediaType", "data"], ["name"]);
    if (part.type !== "image" || typeof part.data !== "string") fail3();
    return {
      type: "image",
      mediaType: choice(part.mediaType, ["image/png", "image/jpeg", "image/webp", "image/gif"]),
      data: part.data,
      ...Object.hasOwn(part, "name") ? { name: text3(part.name, 256) } : {}
    };
  });
  if (content2.length === 0) fail3();
  return {
    requestId: identity(row.requestId),
    parentSessionId: identity(row.parentSessionId),
    childSessionId: identity(row.childSessionId),
    mode: "continuable",
    delivery: choice(row.delivery, ["queue", "steer"]),
    content: content2,
    ...Object.hasOwn(row, "clientTimeZone") ? { clientTimeZone: text3(row.clientTimeZone, 128) } : {}
  };
}
function interruptRequest(value) {
  const row = object2(value, ["parentSessionId", "childSessionId", "mode"]);
  if (row.mode !== "continuable") fail3();
  return { parentSessionId: identity(row.parentSessionId), childSessionId: identity(row.childSessionId), mode: "continuable" };
}
function promptReceipt(value) {
  const row = object2(value, ["messageId"]);
  return { messageId: identity(row.messageId) };
}
function interruptReceipt(value) {
  const row = object2(value, ["accepted"]);
  if (row.accepted !== true) fail3();
  return { accepted: true };
}
function errorInfo2(value) {
  const row = object2(value, ["code"], ["field", "reason"]);
  return {
    code: choice(row.code, ROLE_CONTROL_ERROR_CODES),
    ...Object.hasOwn(row, "field") ? { field: choice(row.field, ROLE_CONTROL_ERROR_FIELDS) } : {},
    ...Object.hasOwn(row, "reason") ? { reason: choice(row.reason, ROLE_CONTROL_DISABLED_REASONS) } : {}
  };
}
var parseRoleControlErrorInfo = (value) => errorInfo2(json(value));
var parseChildSessionSnapshot = (value) => snapshot3(json(value));
var parseRoleControlDescendants = (value) => descendants(json(value));
var parseRoleControlPromptRequest = (value) => promptRequest(json(value));
function codec2(symbol, parse3) {
  return { mode: "strict", typeSymbol: `@dsmm/dsmm#${symbol}`, create: () => ({ parse: (value) => parse3(json(value)) }) };
}
function descriptor2(method, result, request) {
  return {
    id: `@dsmm/dsmm-children#dsmmChildren/${method}`,
    service: "dsmmChildren",
    namespace: "dsmmChildren",
    method,
    invocation: { kind: "direct" },
    parameters: [
      { name: "sessionId", wire: "sessionId", source: "json", codec: codec2("ChildControlSessionId", identity) },
      ...request === void 0 ? [] : [{ name: "request", wire: "request", source: "json", codec: request }]
    ],
    result
  };
}
var ROLE_CONTROL_REMOTE = { package: "@dsmm/dsmm-children", descriptors: [
  descriptor2("describe", codec2("ChildSessionSnapshot", snapshot3)),
  descriptor2("descendants", codec2("RoleControlDescendantsSnapshot", descendants)),
  descriptor2("prompt", codec2("SubagentPromptReceipt", promptReceipt), codec2("SubagentPromptRequest", promptRequest)),
  descriptor2("interrupt", codec2("SubagentInterruptReceipt", interruptReceipt), codec2("RoleControlInterruptRequest", interruptRequest))
] };
var ROLE_CONTROL_HOST = { package: ROLE_CONTROL_REMOTE.package, face: "host", schemas: [], model: { services: [], events: [], objects: [] }, invocations: ROLE_CONTROL_REMOTE.descriptors };

// src/permission-remote.ts
function fail4() {
  throw new TypeError("Invalid permission DTO.");
}
function text4(value, max = 512) {
  if (typeof value !== "string" || value.length === 0 || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail4();
  return value;
}
function parsePermissionSessionId(value) {
  return text4(value, 256);
}
function parseRuntime(value) {
  const runtime = permissionRuleRow(value, ["savedRevision", "runtimeRevision", "state", "mounted", "restartRequired"]);
  if (!["synced", "updating", "unsynced"].includes(runtime.state) || typeof runtime.mounted !== "boolean" || typeof runtime.restartRequired !== "boolean") fail4();
  return { savedRevision: permissionRevision(runtime.savedRevision), runtimeRevision: permissionRevision(runtime.runtimeRevision), state: runtime.state, mounted: runtime.mounted, restartRequired: runtime.restartRequired };
}
function parseCapabilities(value) {
  const input = permissionRuleRow(value, ["limits", "runtime", "tools"]);
  const limits = permissionRuleRow(input.limits, ["outsideReads", "finalInode", "scopedMemory", "webFetch", "webSearchDestinations", "proxyAddressBinding", "shellSockets", "providerAuthMcp"]);
  if (limits.outsideReads !== "tool-call-boundary" || limits.finalInode !== false || limits.scopedMemory !== "not-provided-by-native-rules" || limits.webFetch !== "native-public-only" || limits.webSearchDestinations !== "unsupported" || limits.proxyAddressBinding !== "native-proxy-dependent" || limits.shellSockets !== "native-executor-dependent" || limits.providerAuthMcp !== "not-covered") fail4();
  if (!Array.isArray(input.tools) || input.tools.length > 1024) fail4();
  const tools = [];
  const names = /* @__PURE__ */ new Set();
  for (const value2 of input.tools) {
    const tool = permissionRuleRow(value2, ["name", "kind", "approval", "scopedMemory"]), name = text4(tool.name);
    if (!["read", "glob", "grep", "shell", "webSearch", "webFetch"].includes(tool.kind) || tool.approval !== "native-once" || tool.scopedMemory !== false || names.has(name)) fail4();
    names.add(name);
    tools.push({ name, kind: tool.kind, approval: "native-once", scopedMemory: false });
  }
  return { limits: {
    outsideReads: "tool-call-boundary",
    finalInode: false,
    scopedMemory: "not-provided-by-native-rules",
    webFetch: "native-public-only",
    webSearchDestinations: "unsupported",
    proxyAddressBinding: "native-proxy-dependent",
    shellSockets: "native-executor-dependent",
    providerAuthMcp: "not-covered"
  }, runtime: parseRuntime(input.runtime), tools };
}
function parsePermissionRulesResult(value) {
  const input = permissionRuleRow(value, ["snapshot", "runtime"], ["capabilities"]), snapshot4 = permissionRuleRow(input.snapshot, ["revision", "policy"]);
  return {
    snapshot: { revision: permissionRevision(snapshot4.revision), policy: resolvePermissionControl(snapshot4.policy) },
    runtime: parseRuntime(input.runtime),
    ...Object.hasOwn(input, "capabilities") ? { capabilities: parseCapabilities(input.capabilities) } : {}
  };
}
var codec3 = (name, parse3) => ({ mode: "strict", typeSymbol: `@dsmm/dsmm#${name}`, create: () => ({ parse: parse3 }) });
function descriptor3(method, result, request) {
  return {
    id: `@dsmm/dsmm-permissions#dsmmPermissions/${method}`,
    service: "dsmmPermissions",
    namespace: "dsmmPermissions",
    method,
    invocation: { kind: "direct" },
    parameters: [
      { name: "sessionId", wire: "sessionId", source: "json", codec: codec3("PermissionSessionId", parsePermissionSessionId) },
      ...request === void 0 ? [] : [{ name: "request", wire: "request", source: "json", codec: request }]
    ],
    result
  };
}
var PERMISSION_REMOTE = { package: "@dsmm/dsmm-permissions", descriptors: [
  descriptor3("describeRules", codec3("PermissionRulesResult", parsePermissionRulesResult)),
  descriptor3("saveRules", codec3("PermissionRulesResult", parsePermissionRulesResult), codec3("PermissionRulesSaveRequest", parsePermissionRulesSave))
] };
var PERMISSION_HOST = { package: PERMISSION_REMOTE.package, face: "host", schemas: [], model: { services: [], events: [], objects: [] }, invocations: PERMISSION_REMOTE.descriptors };

// src/client/permission-client.ts
var PermissionClientError = class extends Error {
  constructor(code) {
    super("Permission operation unavailable.");
    this.code = code;
  }
};
var codes = /* @__PURE__ */ new Set(["not-owned", "stale", "cancelled", "unavailable", "validation", "not-found", "scope-unavailable", "replayed", "denied"]);
function permissionClient(connection) {
  return async (method, args, signal) => {
    const descriptor4 = PERMISSION_REMOTE.descriptors.find((item) => item.method === method);
    const payload = {};
    descriptor4.parameters.forEach((parameter, index) => {
      payload[parameter.wire] = args[index];
    });
    let result;
    try {
      result = await connection.rpc.call("/api", `dsmmPermissions/${method}`, { args: payload }, signal);
    } catch {
      throw new PermissionClientError(signal.aborted ? "cancelled" : "transport");
    }
    if (!result.ok) {
      const code = Reflect.get(result.error.details, "code");
      throw new PermissionClientError(result.error.code === "dsmm-permissions/refused" && codes.has(code) ? code : "unavailable");
    }
    signal.throwIfAborted();
    try {
      if (descriptor4.result.mode !== "strict") throw new Error("Strict permission codec required.");
      return descriptor4.result.create().parse(result.value);
    } catch {
      throw new PermissionClientError("protocol");
    }
  };
}

// src/client/permission-controller.ts
var draftOf = (policy) => ({ outsideReads: policy.outsideReads, webSearch: { ...policy.webSearch }, webFetch: { ...policy.webFetch }, upsert: [], revoke: [], editor: null });
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function permissionChanges(view) {
  const { base, draft: draft2 } = view;
  if (base === null || draft2 === null) return null;
  const changes = Object.fromEntries(["outsideReads", "webSearch", "webFetch"].filter((key) => !same(base.policy[key], draft2[key])).map((key) => [key, draft2[key]]));
  if (Object.keys(changes).length === 0 && draft2.upsert.length === 0 && draft2.revoke.length === 0) return null;
  return { expectedRevision: base.revision, ...Object.keys(changes).length ? { changes } : {}, ...draft2.upsert.length ? { upsert: draft2.upsert } : {}, ...draft2.revoke.length ? { revoke: draft2.revoke } : {} };
}
var empty = () => ({
  generation: 0,
  sessionId: null,
  scope: "unknown",
  connected: false,
  reading: false,
  busy: null,
  rules: null,
  base: null,
  draft: null,
  rulesIssue: null,
  dirty: false,
  notice: null
});
var PermissionController = class {
  state = empty();
  listeners = /* @__PURE__ */ new Set();
  invoke = null;
  connection;
  owner = null;
  request = new AbortController();
  requestSequence = 0;
  timer;
  watchers = 0;
  disposed = false;
  store = { getSnapshot: () => this.state, subscribe: (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  } };
  publish(patch) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  cancel() {
    this.request.abort();
    this.request = new AbortController();
    this.requestSequence++;
    clearTimeout(this.timer);
  }
  fence(preserve) {
    this.cancel();
    this.publish({
      generation: this.state.generation + 1,
      reading: false,
      busy: null,
      notice: null,
      rules: null,
      rulesIssue: null,
      ...preserve ? {} : { base: null, draft: null, dirty: false }
    });
  }
  bindConnection(invoke, generation) {
    if (this.disposed || this.invoke === invoke && this.connection === generation) return;
    this.invoke = invoke;
    this.connection = generation;
    this.fence(true);
    this.publish({ connected: invoke !== null });
    this.schedule(true);
  }
  bindScope(sessionId2, owner, scope) {
    if (this.disposed || this.state.sessionId === sessionId2 && this.owner === owner && this.state.scope === scope) return;
    const preserve = sessionId2 === this.state.sessionId;
    this.owner = owner;
    this.fence(preserve);
    this.publish({ sessionId: sessionId2, scope });
    this.schedule(true);
  }
  watch() {
    this.watchers++;
    if (this.watchers === 1) this.schedule(true);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.watchers--;
      if (this.watchers === 0) this.fence(true);
    };
  }
  dispose() {
    if (this.disposed) return;
    this.fence(false);
    this.disposed = true;
    this.listeners.clear();
    this.invoke = null;
    this.owner = null;
  }
  live(generation) {
    return !this.disposed && generation === this.state.generation && this.owner !== null && this.invoke !== null && this.state.scope === "root" && this.state.sessionId !== null;
  }
  schedule(immediate = false) {
    clearTimeout(this.timer);
    if (this.watchers === 0 || !this.live(this.state.generation)) return;
    this.timer = setTimeout(() => {
      void this.refresh(this.state.generation);
    }, immediate ? 0 : 1e3);
    this.timer.unref?.();
  }
  issue(error) {
    return error instanceof PermissionClientError ? error.code : "transport";
  }
  synchronized() {
    const value = this.state.rules;
    return value !== null && value.runtime.state === "synced" && value.runtime.savedRevision === value.snapshot.revision && value.runtime.runtimeRevision === value.snapshot.revision;
  }
  canEdit(generation) {
    return this.live(generation) && this.state.rulesIssue === null && this.synchronized() && this.state.busy === null;
  }
  canSave(generation) {
    return this.canEdit(generation) && !this.state.reading && this.state.dirty && this.state.draft?.editor === null;
  }
  async refresh(generation, discard = false) {
    if (!this.live(generation) || this.state.reading || this.state.busy !== null) return;
    const sequence = ++this.requestSequence, signal = this.request.signal, id2 = this.state.sessionId;
    this.publish({ reading: true });
    const [rules] = await Promise.allSettled([this.invoke("describeRules", [id2], signal)]);
    if (!this.live(generation) || signal.aborted || sequence !== this.requestSequence) return;
    if (rules.status === "rejected") {
      this.publish({ rules: null, rulesIssue: this.issue(rules.reason), reading: false });
    } else {
      const value = rules.value;
      const retain = this.state.dirty && !discard;
      this.publish({
        rules: value,
        rulesIssue: retain && this.state.base?.revision !== value.snapshot.revision ? "stale" : null,
        reading: false,
        ...retain ? {} : { base: value.snapshot, draft: draftOf(value.snapshot.policy), dirty: false }
      });
    }
    this.schedule();
  }
  edit(generation, patch) {
    if (!this.canEdit(generation) || this.state.draft === null) return;
    const draft2 = { ...this.state.draft, ...patch };
    this.publish({ draft: draft2, notice: null });
    this.publish({ dirty: draft2.editor !== null || permissionChanges(this.state) !== null });
  }
  stageRule(generation) {
    const draft2 = this.state.draft, editor = draft2?.editor;
    if (editor == null || !editor.id || editor.id.length > 256 || editor.id.includes("\0")) return;
    const match = editor.match;
    if (match.kind === "outside-read" && !match.path || match.kind === "shell" && (!match.executable || !match.command || !match.workingDirectory)) return;
    this.edit(generation, { upsert: [...draft2.upsert.filter((row) => row.id !== editor.id), structuredClone(editor)], revoke: draft2.revoke.filter((id2) => id2 !== editor.id), editor: null });
  }
  stageRevoke(generation, id2) {
    const draft2 = this.state.draft;
    if (draft2 === null || !this.state.base?.policy.rules.some((rule) => rule.id === id2)) return;
    this.edit(generation, { upsert: draft2.upsert.filter((row) => row.id !== id2), revoke: [.../* @__PURE__ */ new Set([...draft2.revoke, id2])], editor: draft2.editor?.id === id2 ? null : draft2.editor });
  }
  begin(busy) {
    this.cancel();
    this.publish({ busy, notice: null });
    return { signal: this.request.signal, id: this.state.sessionId };
  }
  async save(generation) {
    const request = permissionChanges(this.state);
    if (!this.canSave(generation) || request === null) return;
    const current = this.begin("save");
    try {
      const result = await this.invoke("saveRules", [current.id, request], current.signal);
      if (this.live(generation)) this.publish({ rules: result, base: result.snapshot, draft: draftOf(result.snapshot.policy), dirty: false, rulesIssue: null, notice: "saved" });
    } catch (error) {
      if (this.live(generation)) this.publish({ rules: null, rulesIssue: this.issue(error) });
    } finally {
      if (this.live(generation)) {
        this.publish({ busy: null });
        this.schedule();
      }
    }
  }
};

// src/client/RoleToolView.tsx
var import_dsh_client_ui_primitives9 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/RoleToolView-data.ts
var roleToolKeys = {
  dsmm_planner: "dsmm-planner",
  dsmm_plan_critic: "dsmm-plan-critic",
  dsmm_builder: "dsmm-builder",
  dsmm_reviewer: "dsmm-reviewer",
  dsmm_oracle: "dsmm-oracle",
  dsmm_oracle_2nd: "dsmm-oracle-2nd",
  dsmm_code_search: "dsmm-code-search",
  dsmm_doc_search: "dsmm-doc-search",
  dsmm_clarifier: "dsmm-clarifier",
  dsmm_media_reader: "dsmm-media-reader"
};
var categories = /* @__PURE__ */ new Set(["dsmm-creative", "dsmm-frontend", "dsmm-hard-reasoning", "dsmm-research", "dsmm-quick", "dsmm-coding", "dsmm-normal-task", "dsmm-complex", "dsmm-deep", "dsmm-documenting", "dsmm-cross-cutting"]);
var roles = new Set(Object.values(roleToolKeys));
function roleToolArguments(raw) {
  try {
    const value = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
  } catch {
    return void 0;
  }
}
function requestedRoleTool(toolName, raw) {
  const args = roleToolArguments(raw), kind = toolName === "dsmm_category" ? "category" : "role";
  const fixed = Object.hasOwn(roleToolKeys, toolName) ? roleToolKeys[toolName] : void 0;
  const candidate = fixed ?? args?.[kind];
  const target = typeof candidate === "string" && (kind === "category" ? categories : roles).has(candidate) ? candidate : void 0;
  const level2 = typeof args?.level === "string" && ["normal", "low", "high", "max"].includes(args.level) ? args.level : void 0;
  return { kind, target, level: level2, description: typeof args?.description === "string" ? args.description : void 0 };
}
function preparingRoleTool(toolName, args) {
  const received = Object.fromEntries(args.keys().flatMap((key) => {
    const value = args.text(key) ?? args.value(key);
    return value === void 0 ? [] : [[key, value]];
  }));
  const complete = Object.fromEntries(Object.entries(received).filter(([key]) => args.complete(key)));
  return {
    requested: requestedRoleTool(toolName, args.invalid ? "" : JSON.stringify(complete)),
    preview: Object.keys(received).length === 0 ? "" : JSON.stringify(received, null, 2)
  };
}
function actualRoleTool(toolName, meta, failed) {
  if (failed) return void 0;
  try {
    const value = parseDsmmInvocationView(meta);
    return (toolName === "dsmm_category" ? categories : roles).has(value.role) ? value : void 0;
  } catch {
    return void 0;
  }
}
function roleToolDisplay(target) {
  return target.slice("dsmm-".length).split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

// src/client/RoleToolView-locales.ts
var ROLE_TOOL_NS = "conversation.dsmm-role-tool";
var roleToolEn = {
  call: "Call",
  unknownTarget: "DSMM agent · target pending",
  requested: "Requested",
  actual: "Actual",
  role: "Role",
  category: "Category",
  unknown: "Unknown",
  preparing: "Preparing",
  running: "Running",
  result: "Tool returned · child completion not inferred",
  background: "Started / handed off · child completion not confirmed",
  error: "Tool error",
  stopped: "Interrupted",
  args: "Original arguments",
  preparingArgs: "Arguments received so far",
  output: "Complete result content",
  failure: "Error details",
  metadata: "Invocation metadata",
  inspect: "Inspect tool call",
  copy: "Copy",
  copied: "Copied",
  emptyArgs: "Arguments not available yet",
  unavailable: "Actual identity unavailable; requested identity only",
  level: "Level",
  route: "Reported route",
  routeSource: "Route source"
};
var roleToolZh = {
  call: "调用",
  unknownTarget: "DSMM 代理 · 目标待确定",
  requested: "请求",
  actual: "实际",
  role: "角色",
  category: "类别",
  unknown: "未知",
  preparing: "准备中",
  running: "运行中",
  result: "工具已返回 · 不推断子任务完成",
  background: "已启动／移交 · 尚未确认子任务完成",
  error: "工具错误",
  stopped: "已中断",
  args: "原始参数",
  preparingArgs: "目前已收到的参数",
  output: "完整结果内容",
  failure: "错误详情",
  metadata: "调用元数据",
  inspect: "检查工具调用",
  copy: "复制",
  copied: "已复制",
  emptyArgs: "参数尚不可用",
  unavailable: "实际身份不可用，仅显示请求身份",
  level: "等级",
  route: "报告的路由",
  routeSource: "路由来源"
};

// src/client/RoleToolView.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
var styles = `
.dsmm-role-tool{min-width:0;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:14px;line-height:22px}
.dsmm-role-tool .dsmm-role-heading{color:var(--dsw-alias-label-primary);height:auto;min-height:32px}
.dsmm-role-tool .dsmm-role-title{white-space:normal;overflow-wrap:anywhere;min-width:0;max-width:100%;color:inherit;font-size:inherit;line-height:inherit}
.dsmm-role-tool .dsmm-role-text{flex:1;min-width:0}
.dsmm-role-tool .dsmm-role-body{display:flex;flex-direction:column;gap:12px;min-width:0;padding:8px 0}
.dsmm-role-tool p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.dsmm-role-tool .dsmm-role-status{color:var(--dsw-alias-label-secondary)}
.dsmm-role-tool .dsmm-role-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.dsmm-role-tool :is(button,[role=button]):focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
`;
function RoleToolView(props) {
  const { expanded, toggle } = props.useDisclosure();
  const partial = props.phase === "preparing" ? preparingRoleTool(props.toolName, props.block.args) : void 0;
  const { t } = props;
  const raw = props.phase === "preparing" ? partial.preview : props.phase === "start" ? props.block.argsRaw : props.block.call?.argsRaw ?? "";
  const requested = partial?.requested ?? requestedRoleTool(props.toolName, raw);
  const result = props.phase === "result" ? props.block : void 0;
  const failed = result !== void 0 && (result.isError || result.error != null);
  const actual = result === void 0 ? void 0 : actualRoleTool(props.toolName, result.meta, failed);
  const target = actual?.role ?? requested.target;
  const title = `${t("call")} ${target === void 0 ? t("unknownTarget") : roleToolDisplay(target)}${(actual?.level ?? requested.level) === void 0 ? "" : ` · ${actual?.level ?? requested.level}`}`;
  const state = result?.error?.code === "interrupted" ? "stopped" : failed ? "error" : result === void 0 ? props.phase === "preparing" ? "preparing" : "running" : actual?.jobId !== void 0 || actual?.mode === "continuable" ? "background" : "result";
  const code = (value) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives9.CodeBlock, { code: value, copyLabel: t("copy"), copiedLabel: t("copied") });
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsmm-role-tool", "data-dsmm-role-tool": props.toolName, "data-identity": actual === void 0 ? "requested" : "actual", "data-state": state, children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
      import_dsh_client_ui_primitives9.DisclosureRow,
      {
        title,
        titleClassName: "dsmm-role-title",
        rowClassName: "dsmm-role-heading",
        contentClassName: "dsmm-role-text",
        icon: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives9.StateDot, { state: state === "error" ? "error" : state === "stopped" ? "warning" : result === void 0 ? "ongoing" : state === "background" ? "idle" : "done" }),
        open: expanded,
        expandable: true,
        onToggle: toggle,
        expandOnRowClick: true,
        children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsmm-role-body", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("p", { children: [
            props.toolName,
            " · ",
            props.callId
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("p", { className: "dsmm-role-status", children: [
            t("requested"),
            " ",
            t(requested.kind),
            ": ",
            requested.target === void 0 ? t("unknown") : roleToolDisplay(requested.target)
          ] }),
          requested.description !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "dsmm-role-status", children: requested.description }),
          actual !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("p", { children: [
              t("actual"),
              " ",
              t(requested.kind),
              ": ",
              roleToolDisplay(actual.role),
              " · ",
              t("level"),
              ": ",
              actual.level
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("p", { children: [
              t("routeSource"),
              ": ",
              actual.routeSource,
              " · ",
              t("route"),
              ": ",
              actual.route === void 0 ? t("unknown") : `${actual.route.provider}/${actual.route.model}${actual.route.reasoningEffort === void 0 ? "" : ` · ${actual.route.reasoningEffort}`}`
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { children: t(props.phase === "preparing" ? "preparingArgs" : "args") }),
            raw === "" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { children: t("emptyArgs") }) : code(raw)
          ] }),
          result !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
            actual === void 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { children: t("unavailable") }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { children: t("output") }),
              code(JSON.stringify(result.content, null, 2))
            ] }),
            result.error != null && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { children: t("failure") }),
              code(JSON.stringify(result.error, null, 2))
            ] }),
            result.meta != null && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { children: t("metadata") }),
              code(JSON.stringify(result.meta, null, 2))
            ] })
          ] })
        ] })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsmm-role-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "dsmm-role-status", role: "status", children: t(state) }),
      props.inspect !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives9.Button, { variant: "ghost", size: "sm", onClick: props.inspect, children: t("inspect") })
    ] })
  ] });
}
function registerRoleToolViews(ctx) {
  ctx.effect(() => ctx.locale.register(ROLE_TOOL_NS, { en: roleToolEn, zh: roleToolZh }), "dsmm: role tool locale");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.dsmmRoleToolStyles = "";
    style.textContent = styles;
    document.head.append(style);
    return () => style.remove();
  }, "dsmm: role tool styles");
  ctx.slots.inject("tool.call.toolview", () => {
    const disposers = [...Object.keys(roleToolKeys), "dsmm_role", "dsmm_category"].map((key) => ctx.slots.register({ name: "tool.call.toolview", key, locale: ROLE_TOOL_NS }, RoleToolView));
    return () => {
      for (const dispose of disposers.reverse()) dispose();
    };
  });
}

// src/client/children-controller.ts
var EMPTY_CHILD_DRAFT = { text: "", delivery: "queue", images: [], imageBusy: false, uncertain: false };
var childActionKey = (childId) => `child:${childId}`;
function enabled(availability2) {
  return availability2?.enabled === true;
}
var ControlFailure = class extends Error {
  constructor(safe) {
    super("Child control refused.");
    this.safe = safe;
  }
};
var ChildrenController = class {
  constructor(remote) {
    this.remote = remote;
  }
  current = {
    sessionId: null,
    generation: 0,
    snapshot: null,
    descendants: null,
    fresh: false,
    reading: false,
    issue: null,
    descendantIssue: null,
    drafts: /* @__PURE__ */ new Map(),
    pending: /* @__PURE__ */ new Map(),
    issues: /* @__PURE__ */ new Map(),
    outcomes: /* @__PURE__ */ new Map()
  };
  owner = null;
  connection = null;
  connectionGeneration;
  observedAdmission = null;
  disposed = false;
  listeners = /* @__PURE__ */ new Set();
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
    refresh: (generation) => this.refresh(generation),
    prompt: (generation, child2) => this.prompt(generation, child2),
    interrupt: (generation, child2) => this.interrupt(generation, child2),
    editText: (generation, child2, text5) => this.editDraft(generation, child2, { text: text5 }),
    setDelivery: (generation, child2, delivery) => this.editDraft(generation, child2, { delivery }),
    addImages: (generation, child2, files) => this.addImages(generation, child2, files),
    removeImage: (generation, child2, image) => {
      const draft2 = this.draft(child2);
      if (!draft2.imageBusy) this.editDraft(generation, child2, { images: draft2.images.filter((part) => part !== image) });
    },
    acknowledgeUnknown: (generation, child2) => {
      if (this.available(generation)) this.editDraft(generation, child2, { uncertain: false });
    }
  };
  dispose() {
    if (this.disposed) return;
    this.owner = null;
    this.connection = null;
    this.fence(false);
    this.disposed = true;
    this.listeners.clear();
  }
  bindConnection(connection, generation) {
    if (this.disposed || connection === this.connection && generation === this.connectionGeneration) return;
    this.connection = connection;
    this.connectionGeneration = generation;
    this.fence(true);
    if (connection !== null) void this.refresh(this.current.generation);
  }
  bindScope(sessionId2, owner) {
    if (this.disposed || sessionId2 === this.current.sessionId && owner === this.owner) return;
    this.owner = owner;
    this.observedAdmission = null;
    this.fence(false, sessionId2);
    if (sessionId2 !== null && owner !== null) void this.refresh(this.current.generation);
  }
  observeAdmission(sessionId2, epoch3) {
    if (this.disposed || sessionId2 !== this.current.sessionId || epoch3 === this.observedAdmission) return;
    this.observedAdmission = epoch3;
    if (this.current.snapshot?.admissionEpoch === epoch3) return;
    this.fence(true);
    void this.refresh(this.current.generation);
  }
  publish(patch) {
    if (this.disposed) return;
    this.current = { ...this.current, ...patch };
    for (const listener of this.listeners) listener();
  }
  fence(preserveDrafts, sessionId2 = this.current.sessionId) {
    const drafts = /* @__PURE__ */ new Map();
    if (preserveDrafts) for (const [id2, draft2] of this.current.drafts) drafts.set(id2, {
      ...draft2,
      imageBusy: false,
      uncertain: draft2.uncertain || this.current.pending.get(childActionKey(id2)) === "prompt"
    });
    this.publish({
      sessionId: sessionId2,
      generation: this.current.generation + 1,
      snapshot: preserveDrafts ? this.current.snapshot : null,
      fresh: false,
      descendants: null,
      reading: false,
      drafts,
      pending: /* @__PURE__ */ new Map(),
      issues: /* @__PURE__ */ new Map(),
      outcomes: /* @__PURE__ */ new Map(),
      issue: null,
      descendantIssue: null
    });
  }
  live(generation) {
    return !this.disposed && generation === this.current.generation && this.owner !== null && this.connection !== null && this.current.sessionId !== null;
  }
  available(generation) {
    return this.live(generation) && this.current.fresh && !this.current.reading;
  }
  draft(id2) {
    return this.current.drafts.get(id2) ?? EMPTY_CHILD_DRAFT;
  }
  child(id2) {
    return this.current.snapshot?.children.find((child2) => child2.id === id2 && child2.parentSessionId === this.current.sessionId);
  }
  editDraft(generation, id2, patch) {
    if (this.disposed || generation !== this.current.generation || this.child(id2)?.mode !== "continuable" || this.current.pending.has(childActionKey(id2))) return;
    this.publishDraft(id2, patch);
  }
  publishDraft(id2, patch) {
    const drafts = new Map(this.current.drafts);
    drafts.set(id2, { ...this.draft(id2), ...patch });
    this.publish({ drafts });
  }
  issue(error) {
    if (error instanceof ControlFailure) return error.safe;
    return { kind: "transport", code: "unavailable", unknown: true };
  }
  async unwrap(method, call) {
    const result = await call();
    if (!result.ok) {
      if (result.error.code === "dsmm-children/refused") {
        let info;
        try {
          info = parseRoleControlErrorInfo(result.error.details);
        } catch {
          throw new ControlFailure({ kind: "protocol", code: "unavailable", unknown: true });
        }
        throw new ControlFailure({ kind: "domain", ...info });
      }
      throw new ControlFailure({ kind: "transport", code: "unavailable", unknown: true });
    }
    try {
      const codec4 = ROLE_CONTROL_REMOTE.descriptors.find((row) => row.method === method).result;
      if (codec4.mode !== "strict") throw new TypeError("Child result requires a strict codec.");
      return codec4.create().parse(result.value);
    } catch {
      throw new ControlFailure({ kind: "protocol", code: "unavailable", unknown: true });
    }
  }
  async refresh(generation) {
    if (!this.live(generation) || this.current.reading || this.current.pending.size > 0 || [...this.current.drafts.values()].some((draft2) => draft2.imageBusy)) return;
    const id2 = this.current.sessionId;
    this.publish({ reading: true, issue: null, descendantIssue: null, fresh: false });
    const [description, descendants2] = await Promise.allSettled([this.unwrap("describe", () => this.remote.describe(id2)), this.unwrap("descendants", () => this.remote.descendants(id2))]);
    if (!this.live(generation)) return;
    if (description.status === "rejected") {
      this.publish({ reading: false, issue: this.issue(description.reason), descendants: null });
      return;
    }
    const snapshot4 = parseChildSessionSnapshot(description.value);
    if (snapshot4.sessionId !== id2) {
      this.publish({ reading: false, issue: { kind: "protocol", code: "not-owned" }, descendants: null });
      return;
    }
    if (this.observedAdmission !== null && snapshot4.admissionEpoch !== this.observedAdmission) {
      this.publish({ reading: false, issue: { kind: "protocol", code: "conflict" }, descendants: null });
      return;
    }
    let tree = null, descendantIssue = null;
    if (descendants2.status === "rejected") descendantIssue = this.issue(descendants2.reason);
    else {
      tree = parseRoleControlDescendants(descendants2.value);
      if (tree.sessionId !== id2 || tree.admissionEpoch !== snapshot4.admissionEpoch) {
        tree = null;
        descendantIssue = { kind: "protocol", code: "conflict" };
      }
    }
    this.publish({ snapshot: snapshot4, descendants: tree, descendantIssue, fresh: true, reading: false, generation: generation + 1 });
  }
  begin(key, kind) {
    const pending = new Map(this.current.pending), issues = new Map(this.current.issues), outcomes = new Map(this.current.outcomes);
    pending.set(key, kind);
    issues.delete(key);
    outcomes.delete(key);
    this.publish({ pending, issues, outcomes });
  }
  finish(key) {
    const pending = new Map(this.current.pending);
    pending.delete(key);
    this.publish({ pending });
  }
  refuse(key, error) {
    const issues = new Map(this.current.issues);
    issues.set(key, this.issue(error));
    this.publish({ issues });
  }
  accepted(key, outcome) {
    const outcomes = new Map(this.current.outcomes);
    outcomes.set(key, outcome);
    this.publish({ outcomes });
  }
  canControl(generation, id2, action2) {
    const child2 = this.child(id2);
    return this.available(generation) && !this.current.pending.has(childActionKey(id2)) && child2?.mode === "continuable" && !child2.readonly && enabled(child2.controls[action2]) && enabled(this.current.snapshot?.capabilities[action2]);
  }
  async prompt(generation, id2) {
    const draft2 = this.draft(id2), key = childActionKey(id2);
    if (!this.canControl(generation, id2, "prompt") || draft2.uncertain || draft2.imageBusy || draft2.text.trim() === "" && draft2.images.length === 0 || draft2.images.length > 0 && !enabled(this.current.snapshot?.capabilities.images)) return;
    this.begin(key, "prompt");
    try {
      let clientTimeZone;
      try {
        clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
      }
      let request;
      try {
        request = parseRoleControlPromptRequest({
          requestId: crypto.randomUUID(),
          parentSessionId: this.current.sessionId,
          childSessionId: id2,
          mode: "continuable",
          delivery: draft2.delivery,
          content: [...draft2.text === "" ? [] : [{ type: "text", text: draft2.text }], ...draft2.images],
          ...clientTimeZone === void 0 ? {} : { clientTimeZone }
        });
      } catch {
        throw new ControlFailure({ kind: "local", code: "invalid-content" });
      }
      const receipt = await this.unwrap("prompt", () => this.remote.prompt(this.current.sessionId, request));
      if (!this.live(generation)) return;
      this.accepted(key, { kind: "prompt", receipt });
      const drafts = new Map(this.current.drafts);
      drafts.set(id2, { ...draft2, text: "", images: [], uncertain: false });
      this.publish({ drafts });
    } catch (error) {
      if (this.live(generation)) {
        const issue = this.issue(error);
        this.refuse(key, error);
        if (issue.unknown) {
          const drafts = new Map(this.current.drafts);
          drafts.set(id2, { ...this.draft(id2), uncertain: true });
          this.publish({ drafts });
        }
      }
    } finally {
      if (this.live(generation)) this.finish(key);
    }
  }
  async interrupt(generation, id2) {
    if (!this.canControl(generation, id2, "interrupt")) return;
    const key = childActionKey(id2);
    this.begin(key, "interrupt");
    try {
      const receipt = await this.unwrap("interrupt", () => this.remote.interrupt(this.current.sessionId, { parentSessionId: this.current.sessionId, childSessionId: id2, mode: "continuable" }));
      if (this.live(generation)) this.accepted(key, { kind: "interrupt", receipt });
    } catch (error) {
      if (this.live(generation)) this.refuse(key, error);
    } finally {
      if (this.live(generation)) this.finish(key);
    }
  }
  async addImages(generation, id2, files) {
    if (!this.canControl(generation, id2, "prompt") || !enabled(this.current.snapshot?.capabilities.images) || this.draft(id2).imageBusy || files.length === 0) return;
    this.editDraft(generation, id2, { imageBusy: true });
    try {
      const images = [];
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!this.live(generation)) return;
        let body = "";
        for (const byte of bytes) body += String.fromCharCode(byte);
        const parsed = parseRoleControlPromptRequest({
          requestId: "image-intake",
          parentSessionId: this.current.sessionId,
          childSessionId: id2,
          mode: "continuable",
          delivery: "queue",
          content: [{ type: "image", mediaType: file.type, data: btoa(body), name: file.name }]
        });
        images.push(parsed.content[0]);
      }
      if (this.live(generation)) this.publishDraft(id2, { images: [...this.draft(id2).images, ...images] });
    } catch {
      if (this.live(generation)) this.refuse(childActionKey(id2), new ControlFailure({ kind: "local", code: "invalid-content" }));
    } finally {
      if (this.live(generation)) this.publishDraft(id2, { imageBusy: false });
    }
  }
};

// src/client/ChildrenPanel.tsx
var import_react9 = require("react");
var import_dsh_client_ui_primitives10 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime12 = require("react/jsx-runtime");
function ControlAvailability({ value, label, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-availability", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
      t(label),
      ": ",
      t(value?.enabled === true ? "enabled" : "disabled")
    ] }),
    value?.enabled !== true && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t(`reason:${value?.reason ?? "unavailable"}`) })
  ] });
}
function routeText(route3) {
  return `${route3.provider}/${route3.model}${route3.reasoningEffort === void 0 ? "" : ` (${route3.reasoningEffort})`}`;
}
function RouteComparisonDetails({ value, t }) {
  const initial = value?.initialRoute, live = value?.liveRoute;
  const liveReasons = { "no-own-request-header": "routeNoOwnHeader", "invalid-own-request-header": "routeInvalidOwnHeader", "not-observed": "routeNotObserved" };
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-availability", children: [
    value === void 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("comparisonUnobserved") }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dl", { className: "dsmm-child-meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: t("initialRoute") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: initial?.status === "known" ? routeText(initial.route) : t("routeUnknown") }),
      initial?.status === "known" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: t("initialRouteSource") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dd", { children: [
          t("routeCaptureSource"),
          " · ",
          initial.source
        ] })
      ] }) : initial !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: t("initialRouteReason") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dd", { children: [
          t("routeMissingCapture"),
          " · ",
          initial.reason
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: t("liveRoute") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: live?.status === "known" ? routeText(live.route) : t("routeUnknown") }),
      live?.status === "known" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: t("liveRouteSource") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dd", { children: [
          t("routeOwnHeaderSource"),
          " · ",
          live.source
        ] })
      ] }) : live !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: t("liveRouteReason") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dd", { children: [
          t(liveReasons[live.reason]),
          " · ",
          live.reason
        ] })
      ] })
    ] })
  ] });
}
function InvocationDetails({ value, t, showComparison = true }) {
  if (value === void 0) return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("invocationUnavailable") });
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
    showComparison && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(RouteComparisonDetails, { value: value.routeComparison, t }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dl", { className: "dsmm-child-meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: t("role") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dd", { children: [
        value.label,
        " · ",
        value.role
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: t("level") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: value.level }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: t("mode") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: value.mode }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: t("reportedRoute") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: value.route === void 0 ? t("routeUnreported") : routeText(value.route) }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: t("routeSource") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: value.routeSource }),
      value.runId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: t("runId") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: value.runId })
      ] }),
      value.childId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: t("childId") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: value.childId })
      ] }),
      value.jobId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: t("jobId") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: value.jobId })
      ] })
    ] })
  ] });
}
function Issue2({ value, t }) {
  if (!value) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-issue", role: "alert", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t(value.unknown ? "unknownAction" : "error", { code: value.code }) }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
      value.code,
      value.field === void 0 ? "" : ` · ${t("field")}: ${value.field}`
    ] }),
    value.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t(`reason:${value.reason}`) })
  ] });
}
function Outcome({ value, t }) {
  if (!value) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "dsmm-availability", role: "status", "aria-live": "polite", children: value.kind === "prompt" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t("promptAccepted", { id: value.receipt.messageId }) }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t("interruptAccepted") }) });
}
function ChildComposer({ child: child2, state, actions: actions2, t }) {
  const prefix = (0, import_react9.useId)(), picker = (0, import_react9.useRef)(null), generation = state.generation, key = childActionKey(child2.id);
  const draft2 = state.drafts.get(child2.id) ?? EMPTY_CHILD_DRAFT;
  const pending = state.pending.has(key), available = state.fresh && !state.reading && !pending;
  const canPrompt = available && enabled(state.snapshot?.capabilities.prompt) && enabled(child2.controls.prompt) && !child2.readonly && child2.mode === "continuable";
  const canImages = canPrompt && enabled(state.snapshot?.capabilities.images) && !draft2.imageBusy;
  const submit = canPrompt && !draft2.uncertain && !draft2.imageBusy && (draft2.text.trim() !== "" || draft2.images.length > 0) && (draft2.images.length === 0 || enabled(state.snapshot?.capabilities.images));
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("form", { className: "dsmm-child-composer", "aria-label": t("prompt"), onSubmit: (event) => {
    event.preventDefault();
    if (submit) void actions2.prompt(generation, child2.id);
  }, children: [
    !state.fresh && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t(state.reading ? "reading" : "stale") }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("label", { htmlFor: `${prefix}-message`, children: t("text") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        "textarea",
        {
          id: `${prefix}-message`,
          className: "dsmm-child-message",
          rows: 4,
          value: draft2.text,
          disabled: pending,
          "aria-describedby": `${prefix}-delivery-hint${draft2.uncertain ? ` ${prefix}-unknown` : ""}`,
          onChange: (event) => actions2.editText(generation, child2.id, event.currentTarget.value)
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("label", { htmlFor: `${prefix}-delivery`, children: t("delivery") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("select", { id: `${prefix}-delivery`, value: draft2.delivery, disabled: !canPrompt, "aria-describedby": `${prefix}-delivery-hint`, onChange: (event) => {
        const value = event.currentTarget.value;
        if (value === "queue" || value === "steer") actions2.setDelivery(generation, child2.id, value);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("option", { value: "queue", children: t("queue") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("option", { value: "steer", children: t("steer") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { id: `${prefix}-delivery-hint`, className: "dsmm-hint", children: t("deliveryHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { id: `${prefix}-images-hint`, className: "dsmm-hint", children: t("imagesHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("input", { ref: picker, hidden: true, type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", multiple: true, disabled: !canImages, "aria-label": t("images"), onChange: (event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = "";
        if (canImages) void actions2.addImages(generation, child2.id, files);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Button, { type: "button", variant: "outline", disabled: !canImages, "aria-describedby": `${prefix}-images-hint`, onClick: () => {
        if (canImages) picker.current?.click();
      }, children: t("images") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ControlAvailability, { value: state.snapshot?.capabilities.images, label: "imageAvailability", t }),
      draft2.images.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { className: "dsmm-profile-list", children: draft2.images.map((image, index) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
          image.name ?? image.mediaType,
          " · ",
          image.mediaType
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Button, { type: "button", variant: "outline", disabled: pending || draft2.imageBusy, onClick: () => actions2.removeImage(generation, child2.id, image), "aria-label": `${t("removeImage")}: ${image.name ?? image.mediaType}`, children: t("removeImage") })
      ] }, index)) })
    ] }),
    draft2.uncertain && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-warning", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { id: `${prefix}-unknown`, children: t("unknown") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Button, { type: "button", variant: "outline", disabled: !state.fresh || state.reading || pending, onClick: () => actions2.acknowledgeUnknown(generation, child2.id), children: t("acknowledge") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ControlAvailability, { value: !enabled(state.snapshot?.capabilities.prompt) ? state.snapshot?.capabilities.prompt : child2.controls.prompt, label: "promptAvailability", t }),
    draft2.text.trim() === "" && draft2.images.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("emptyMessage") }),
    draft2.images.length > 0 && !enabled(state.snapshot?.capabilities.images) && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("deniedImages") }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Button, { type: "submit", variant: "primary", disabled: !submit, children: t("send") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        import_dsh_client_ui_primitives10.Button,
        {
          type: "button",
          variant: "outline",
          disabled: !available || !enabled(state.snapshot?.capabilities.interrupt) || !enabled(child2.controls.interrupt) || child2.readonly || child2.mode !== "continuable",
          onClick: () => void actions2.interrupt(generation, child2.id),
          children: t("interrupt")
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", children: pending ? t("pending") : draft2.imageBusy ? t("imageReading") : "" })
  ] });
}
function ChildDetails({ child: child2, state, actions: actions2, t, inspection = false }) {
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("fieldset", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("legend", { children: child2.label?.trim() ? child2.label : child2.id }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
      t("childId"),
      ": ",
      child2.id
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
      t("parentId"),
      ": ",
      child2.parentSessionId
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
      t("mode"),
      ": ",
      child2.mode
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
      t("activity"),
      ": ",
      child2.activity
    ] }),
    (inspection || child2.readonly) && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t("readonly") }),
    child2.mode === "one-shot" && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("oneShot") }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(RouteComparisonDetails, { value: child2.routeComparison, t }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(InvocationDetails, { value: child2.invocation, t, showComparison: false }),
    (!inspection || !child2.controls.prompt.enabled) && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ControlAvailability, { value: child2.controls.prompt, label: "promptAvailability", t }),
    (!inspection || !child2.controls.interrupt.enabled) && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ControlAvailability, { value: child2.controls.interrupt, label: "interruptAvailability", t }),
    !inspection && child2.mode === "continuable" && !child2.readonly && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ChildComposer, { child: child2, state, actions: actions2, t }),
    !inspection && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Issue2, { value: state.issues.get(childActionKey(child2.id)), t }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Outcome, { value: state.outcomes.get(childActionKey(child2.id)), t })
    ] })
  ] });
}
function ChildrenPanel(props) {
  const state = props.useChildren((snapshot4) => snapshot4), { t } = props, generation = state.generation;
  if (props.sessionId === void 0 || props.sessionId !== state.sessionId) return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("section", { className: "dsmm-profiles dsmm-children", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h2", { children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t(state.sessionId === null ? "noSession" : "foreign") })
  ] });
  const data = state.snapshot;
  const refreshingDisabled = state.reading || state.pending.size > 0 || [...state.drafts.values()].some((draft2) => draft2.imageBusy);
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("section", { className: "dsmm-profiles dsmm-children", "aria-label": t("title"), "aria-busy": state.reading, children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h2", { children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("description") }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
      t("session"),
      ": ",
      state.sessionId
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "dsmm-actions", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Button, { type: "button", variant: "outline", disabled: refreshingDisabled, onClick: () => void props.refresh(generation), children: t("refresh") }) }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", children: state.reading ? t("reading") : state.pending.size > 0 ? t("pending") : !state.fresh ? t(data === null ? "unavailable" : "stale") : "" }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Issue2, { value: state.issue, t }),
    data !== null && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
        t("epoch"),
        ": ",
        data.admissionEpoch
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("section", { className: "dsmm-availability", children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
          t("runtime"),
          ": ",
          data.capabilities.runtime.binding
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
          t("fence"),
          ": ",
          t(data.capabilities.runtime.deliveryFenceReady ? "yes" : "no")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
          t("restart"),
          ": ",
          t(data.capabilities.runtime.restartRequired ? "yes" : "no")
        ] }),
        data.capabilities.runtime.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t("authority") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ControlAvailability, { value: data.capabilities.prompt, label: "promptAvailability", t }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ControlAvailability, { value: data.capabilities.interrupt, label: "interruptAvailability", t })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("backgroundHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("section", { className: "dsmm-zone", "aria-label": t("children"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h3", { children: t("children") }),
        data.children.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("emptyChildren") }) : data.children.map((child2) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ChildDetails, { child: child2, state, actions: props, t }, child2.id))
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("section", { className: "dsmm-zone", "aria-label": t("descendants"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h3", { children: t("descendants") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Issue2, { value: state.descendantIssue, t }),
      state.descendants === null ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("treeUnavailable") }) : state.descendants.descendants.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("emptyDescendants") }) : state.descendants.descendants.map((entry, index) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-availability", children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
          t("depth"),
          ": ",
          entry.depth
        ] }),
        entry.kind === "diagnostic" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-issue", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t("diagnostic", { reason: entry.reason }) }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
            t("childId"),
            ": ",
            entry.id
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
            t("parentId"),
            ": ",
            entry.parentSessionId
          ] })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
            t("subtree"),
            ": ",
            t(entry.hasChildren ? "yes" : "no")
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ChildDetails, { child: entry.child, state, actions: props, t, inspection: true })
        ] })
      ] }, index))
    ] })
  ] });
}

// src/client/index.ts
var inject = ["slots", "locale", "remote"];
async function apply(ctx) {
  registerRoleToolViews(ctx);
  await ctx.remote.$mount(TYPERT_REMOTE);
  await ctx.remote.$mount(ROLE_CONTROL_REMOTE);
  await ctx.remote.$mount(PERMISSION_REMOTE);
  const permissions = new PermissionController();
  ctx.effect(() => () => permissions.dispose(), "dsmm: permission controls");
  ctx.effect(() => ctx.locale.register(PERMISSIONS_NS, { en: permissionEn, zh: permissionZh }), "dsmm: permission locale");
  void ctx.inject(["connection"], (connectionCtx) => {
    const handle = connectionCtx.connection, invoke = permissionClient(handle);
    const update = () => {
      const generation = handle.generation.getSnapshot();
      permissions.bindConnection(generation === void 0 ? null : invoke, generation);
    };
    update();
    connectionCtx.effect(() => handle.generation.subscribe(update));
    connectionCtx.effect(() => () => permissions.bindConnection(null), "dsmm: permission connection withdrawal");
  });
  void ctx.inject(["uiSession", "sessions"], (sessionCtx) => {
    const source = sessionCtx.uiSession.adapter.current, sessions = sessionCtx.sessions;
    let observed, stop;
    const update = () => {
      const id2 = source.getSnapshot().key, binding = id2 === void 0 ? void 0 : sessions.binding(id2);
      if (binding !== observed) {
        stop?.();
        observed = binding;
        stop = binding?.session.subscribe(update);
      }
      const snapshot4 = binding?.session.getSnapshot(), catalog = sessions.list.getSnapshot(), summary = id2 === void 0 ? void 0 : catalog.byId[id2];
      const child2 = snapshot4?.subagent != null || summary?.origin === "subagent" || summary?.parentId !== void 0;
      const root = id2 !== void 0 && binding?.sessionId === id2 && snapshot4?.sessionId === id2 && snapshot4.openState === "open" && !snapshot4.removed && catalog.ids.includes(id2) && summary !== void 0 && !child2;
      permissions.bindScope(id2 ?? null, binding ?? null, child2 ? "child" : root ? "root" : "unknown");
    };
    update();
    sessionCtx.effect(() => source.subscribe(update));
    sessionCtx.effect(() => sessions.list.subscribe(update));
    sessionCtx.effect(() => () => {
      stop?.();
      permissions.bindScope(null, null, "unknown");
    }, "dsmm: permission native session withdrawal");
  });
  let deployment = null;
  let profiles = null;
  await ctx.inject(["remote.dsmmConfig"], (coreCtx) => {
    const core = new DeploymentController(coreCtx.remote.dsmmConfig, "global");
    const workspace = deploymentWorkspace(core, permissions);
    void coreCtx.inject(["connection"], (connectionCtx) => {
      core.bindConnection(connectionCtx.connection.generation);
      void core.refresh();
    });
    deployment = core;
    if (profiles !== null) core.setSession(profiles.store.getSnapshot().session);
    coreCtx.effect(() => () => {
      deployment = null;
      workspace.dispose();
      core.dispose();
    }, "dsmm: core settings editor");
    coreCtx.effect(() => coreCtx.locale.register(DEPLOYMENT_NS, { en: deploymentEn, zh: deploymentZh }), "dsmm: core locale");
    coreCtx.effect(() => {
      const style = document.createElement("style");
      style.dataset.dsmmSettings = "";
      style.textContent = PROFILE_STYLES;
      document.head.append(style);
      return () => style.remove();
    }, "dsmm: core styles");
    const inject2 = () => ({ core, remote: coreCtx.remote.dsmmConfig, workspace });
    coreCtx.slots.inject("plugins.bundle.config", () => coreCtx.slots.register({ name: "plugins.bundle.config", key: "@dsmm/dsmm", locale: DEPLOYMENT_NS, inject: inject2 }, DeploymentPage));
    void coreCtx.inject(["configForms"], (formCtx) => {
      workspace.bindForms(formCtx.configForms);
      formCtx.effect(() => () => workspace.bindForms(null));
    });
    void core.refresh();
  });
  await ctx.inject(["remote.dsmmProfiles"], (profileCtx) => {
    const controller = new ProfilesController(profileCtx.remote.dsmmProfiles);
    profiles = controller;
    profileCtx.effect(() => controller.store.subscribe(() => {
      deployment?.setSession(controller.store.getSnapshot().session);
    }));
    profileCtx.effect(() => () => {
      profiles = null;
      deployment?.setSession(null);
    });
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
      inject: () => ({ hooks: { profiles: controller.store }, ...controller.actions })
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
