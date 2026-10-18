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
  const copy = (value2, depth2) => {
    if (depth2 > 32) fail();
    if (value2 === null || typeof value2 === "boolean") return value2;
    if (typeof value2 === "string") {
      if (new TextDecoder("utf-8", { ignoreBOM: true }).decode(new TextEncoder().encode(value2)) !== value2) fail();
      return value2;
    }
    if (typeof value2 === "number" && Number.isFinite(value2) && !Object.is(value2, -0)) return value2;
    if (typeof value2 !== "object" || value2 === null || active.has(value2)) fail();
    const prototype = Object.getPrototypeOf(value2);
    if (Array.isArray(value2) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail();
    if (Object.getOwnPropertySymbols(value2).length) fail();
    active.add(value2);
    const result2 = Array.isArray(value2) ? [] : {};
    for (const [key, descriptor6] of Object.entries(Object.getOwnPropertyDescriptors(value2))) {
      if (Array.isArray(value2) && key === "length") continue;
      if (new TextDecoder("utf-8", { ignoreBOM: true }).decode(new TextEncoder().encode(key)) !== key || ["__proto__", "prototype", "constructor"].includes(key) || !Object.hasOwn(descriptor6, "value") || !descriptor6.enumerable) fail();
      if (Array.isArray(value2) && !/^(0|[1-9][0-9]*)$/u.test(key)) fail();
      Reflect.set(result2, key, copy(descriptor6.value, depth2 + 1));
    }
    if (Array.isArray(value2) && Object.keys(result2).length !== value2.length) fail();
    active.delete(value2);
    return result2;
  };
  const result = copy(input, 0);
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_ROUTE_BYTES) fail();
  return result;
}
function boundedText(value2, max) {
  if (typeof value2 !== "string" || !value2.trim() || value2.length > max || /[\u0000-\u001f\u007f]/u.test(value2)) fail();
}
function normalizeModelRouteJson(input, sparse = false, allowIdentityWhitespace = false) {
  const route3 = copyRouteJson(input);
  if (route3 === null || typeof route3 !== "object" || Array.isArray(route3)) fail();
  const row2 = route3;
  if (!sparse && (!Object.hasOwn(row2, "provider") || !Object.hasOwn(row2, "model"))) fail();
  for (const key of Object.keys(row2)) {
    validateModelRouteFieldName(key);
    const value2 = row2[key];
    if (key === "provider") {
      boundedText(value2, 128);
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(allowIdentityWhitespace ? value2.trim() : value2)) fail();
    } else if (key === "model") {
      boundedText(value2, 512);
      if (value2.includes("://")) fail();
    } else if (key === "reasoningEffort" || key === "reasoning_effort") {
      boundedText(value2, 64);
    } else if (key === "temperature") {
      if (typeof value2 !== "number") fail();
    } else if (aliases[1].includes(key)) {
      if (typeof value2 !== "number" || !Number.isSafeInteger(value2) || value2 <= 0) fail();
    } else if (key === "stop") {
      if (!Array.isArray(value2) || !value2.every((item) => typeof item === "string")) fail();
    }
  }
  for (const group of aliases) if (group.filter((key) => Object.hasOwn(row2, key)).length > 1) fail();
  return row2;
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
function normalizeRoutingStrategy(value2) {
  if (value2 !== "startup-lock" && value2 !== "rate-limit-fallback") {
    throw new TypeError("dsmm strategy must be startup-lock or rate-limit-fallback");
  }
  return value2;
}
function normalizeRateLimitOverrides(value2) {
  if (!isRecord(value2)) throw new TypeError("dsmm rateLimit must be an object");
  const result = {};
  for (const [field, raw] of Object.entries(value2)) {
    if (!Object.hasOwn(DSMM_RATE_LIMIT_BOUNDS, field)) throw new TypeError("dsmm rateLimit contains an unknown field");
    const [minimum, maximum] = DSMM_RATE_LIMIT_BOUNDS[field];
    if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < minimum || raw > maximum) {
      throw new TypeError(`dsmm rateLimit ${field} must be an integer from ${minimum} to ${maximum}`);
    }
    result[field] = raw;
  }
  return result;
}
function normalizeRateLimitPolicy(value2 = void 0, defaults = DEFAULT_DSMM_RATE_LIMIT_POLICY) {
  return { ...defaults, ...value2 === void 0 ? {} : normalizeRateLimitOverrides(value2) };
}
function isRecord(value2) {
  return typeof value2 === "object" && value2 !== null && !Array.isArray(value2);
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
function parseModelParameterPolicy(value2) {
  if (value2 === null || typeof value2 !== "object" || Array.isArray(value2) || Object.keys(value2).length !== 1 || !("mode" in value2)) throw new TypeError("Invalid model parameter policy");
  switch (value2.mode) {
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
function createScanner(text6, ignoreTrivia = false) {
  const len = text6.length;
  let pos = 0, value2 = "", tokenOffset = 0, token = 16, lineNumber = 0, lineStartOffset = 0, tokenLineStartOffset = 0, prevTokenLineStartOffset = 0, scanError = 0;
  function scanHexDigits(count, exact) {
    let digits = 0;
    let value3 = 0;
    while (digits < count || !exact) {
      let ch = text6.charCodeAt(pos);
      if (ch >= 48 && ch <= 57) {
        value3 = value3 * 16 + ch - 48;
      } else if (ch >= 65 && ch <= 70) {
        value3 = value3 * 16 + ch - 65 + 10;
      } else if (ch >= 97 && ch <= 102) {
        value3 = value3 * 16 + ch - 97 + 10;
      } else {
        break;
      }
      pos++;
      digits++;
    }
    if (digits < count) {
      value3 = -1;
    }
    return value3;
  }
  function setPosition(newPosition) {
    pos = newPosition;
    value2 = "";
    tokenOffset = 0;
    token = 16;
    scanError = 0;
  }
  function scanNumber() {
    let start = pos;
    if (text6.charCodeAt(pos) === 48) {
      pos++;
    } else {
      pos++;
      while (pos < text6.length && isDigit(text6.charCodeAt(pos))) {
        pos++;
      }
    }
    if (pos < text6.length && text6.charCodeAt(pos) === 46) {
      pos++;
      if (pos < text6.length && isDigit(text6.charCodeAt(pos))) {
        pos++;
        while (pos < text6.length && isDigit(text6.charCodeAt(pos))) {
          pos++;
        }
      } else {
        scanError = 3;
        return text6.substring(start, pos);
      }
    }
    let end = pos;
    if (pos < text6.length && (text6.charCodeAt(pos) === 69 || text6.charCodeAt(pos) === 101)) {
      pos++;
      if (pos < text6.length && text6.charCodeAt(pos) === 43 || text6.charCodeAt(pos) === 45) {
        pos++;
      }
      if (pos < text6.length && isDigit(text6.charCodeAt(pos))) {
        pos++;
        while (pos < text6.length && isDigit(text6.charCodeAt(pos))) {
          pos++;
        }
        end = pos;
      } else {
        scanError = 3;
      }
    }
    return text6.substring(start, end);
  }
  function scanString() {
    let result = "", start = pos;
    while (true) {
      if (pos >= len) {
        result += text6.substring(start, pos);
        scanError = 2;
        break;
      }
      const ch = text6.charCodeAt(pos);
      if (ch === 34) {
        result += text6.substring(start, pos);
        pos++;
        break;
      }
      if (ch === 92) {
        result += text6.substring(start, pos);
        pos++;
        if (pos >= len) {
          scanError = 2;
          break;
        }
        const ch2 = text6.charCodeAt(pos++);
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
          result += text6.substring(start, pos);
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
    value2 = "";
    scanError = 0;
    tokenOffset = pos;
    lineStartOffset = lineNumber;
    prevTokenLineStartOffset = tokenLineStartOffset;
    if (pos >= len) {
      tokenOffset = len;
      return token = 17;
    }
    let code2 = text6.charCodeAt(pos);
    if (isWhiteSpace(code2)) {
      do {
        pos++;
        value2 += String.fromCharCode(code2);
        code2 = text6.charCodeAt(pos);
      } while (isWhiteSpace(code2));
      return token = 15;
    }
    if (isLineBreak(code2)) {
      pos++;
      value2 += String.fromCharCode(code2);
      if (code2 === 13 && text6.charCodeAt(pos) === 10) {
        pos++;
        value2 += "\n";
      }
      lineNumber++;
      tokenLineStartOffset = pos;
      return token = 14;
    }
    switch (code2) {
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
        value2 = scanString();
        return token = 10;
      // comments
      case 47:
        const start = pos - 1;
        if (text6.charCodeAt(pos + 1) === 47) {
          pos += 2;
          while (pos < len) {
            if (isLineBreak(text6.charCodeAt(pos))) {
              break;
            }
            pos++;
          }
          value2 = text6.substring(start, pos);
          return token = 12;
        }
        if (text6.charCodeAt(pos + 1) === 42) {
          pos += 2;
          const safeLength = len - 1;
          let commentClosed = false;
          while (pos < safeLength) {
            const ch = text6.charCodeAt(pos);
            if (ch === 42 && text6.charCodeAt(pos + 1) === 47) {
              pos += 2;
              commentClosed = true;
              break;
            }
            pos++;
            if (isLineBreak(ch)) {
              if (ch === 13 && text6.charCodeAt(pos) === 10) {
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
          value2 = text6.substring(start, pos);
          return token = 13;
        }
        value2 += String.fromCharCode(code2);
        pos++;
        return token = 16;
      // numbers
      case 45:
        value2 += String.fromCharCode(code2);
        pos++;
        if (pos === len || !isDigit(text6.charCodeAt(pos))) {
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
        value2 += scanNumber();
        return token = 11;
      // literals and unknown symbols
      default:
        while (pos < len && isUnknownContentCharacter(code2)) {
          pos++;
          code2 = text6.charCodeAt(pos);
        }
        if (tokenOffset !== pos) {
          value2 = text6.substring(tokenOffset, pos);
          switch (value2) {
            case "true":
              return token = 8;
            case "false":
              return token = 9;
            case "null":
              return token = 7;
          }
          return token = 16;
        }
        value2 += String.fromCharCode(code2);
        pos++;
        return token = 16;
    }
  }
  function isUnknownContentCharacter(code2) {
    if (isWhiteSpace(code2) || isLineBreak(code2)) {
      return false;
    }
    switch (code2) {
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
    getTokenValue: () => value2,
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
  function addEdit(text6, startOffset, endOffset) {
    if (!hasError && (!range || startOffset < rangeEnd && endOffset > rangeStart) && documentText.substring(startOffset, endOffset) !== text6) {
      editOperations.push({ offset: startOffset, length: endOffset - startOffset, content: text6 });
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
function getEOL(options, text6) {
  for (let i = 0; i < text6.length; i++) {
    const ch = text6.charAt(i);
    if (ch === "\r") {
      if (i + 1 < text6.length && text6.charAt(i + 1) === "\n") {
        return "\r\n";
      }
      return "\r";
    } else if (ch === "\n") {
      return "\n";
    }
  }
  return options && options.eol || "\n";
}
function isEOL(text6, offset) {
  return "\r\n".indexOf(text6.charAt(offset)) !== -1;
}

// ../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/parser.js
var ParseOptions;
(function(ParseOptions2) {
  ParseOptions2.DEFAULT = {
    allowTrailingComma: false
  };
})(ParseOptions || (ParseOptions = {}));
function parse(text6, errors2 = [], options = ParseOptions.DEFAULT) {
  let currentProperty = null;
  let currentParent = [];
  const previousParents = [];
  function onValue(value2) {
    if (Array.isArray(currentParent)) {
      currentParent.push(value2);
    } else if (currentProperty !== null) {
      currentParent[currentProperty] = value2;
    }
  }
  const visitor = {
    onObjectBegin: () => {
      const object4 = {};
      onValue(object4);
      previousParents.push(currentParent);
      currentParent = object4;
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
      errors2.push({ error, offset, length });
    }
  };
  visit(text6, visitor, options);
  return currentParent[0];
}
function parseTree(text6, errors2 = [], options = ParseOptions.DEFAULT) {
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
    onLiteralValue: (value2, offset, length) => {
      onValue({ type: getNodeType(value2), offset, length, parent: currentParent, value: value2 });
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
      errors2.push({ error, offset, length });
    }
  };
  visit(text6, visitor, options);
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
function visit(text6, visitor, options = ParseOptions.DEFAULT) {
  const _scanner = createScanner(text6, false);
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
    const value2 = _scanner.getTokenValue();
    if (isValue) {
      onLiteralValue(value2);
    } else {
      onObjectProperty(value2);
      _jsonPath.push(value2);
    }
    scanNext();
    return true;
  }
  function parseLiteral() {
    switch (_scanner.getToken()) {
      case 11:
        const tokenValue = _scanner.getTokenValue();
        let value2 = Number(tokenValue);
        if (isNaN(value2)) {
          handleError(
            2
            /* ParseErrorCode.InvalidNumberFormat */
          );
          value2 = 0;
        }
        onLiteralValue(value2);
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
function getNodeType(value2) {
  switch (typeof value2) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "string":
      return "string";
    case "object": {
      if (!value2) {
        return "null";
      } else if (Array.isArray(value2)) {
        return "array";
      }
      return "object";
    }
    default:
      return "null";
  }
}

// ../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/edit.js
function setProperty(text6, originalPath, value2, options) {
  const path = originalPath.slice();
  const errors2 = [];
  const root = parseTree(text6, errors2);
  let parent = void 0;
  let lastSegment = void 0;
  while (path.length > 0) {
    lastSegment = path.pop();
    parent = findNodeAtLocation(root, path);
    if (parent === void 0 && value2 !== void 0) {
      if (typeof lastSegment === "string") {
        value2 = { [lastSegment]: value2 };
      } else {
        value2 = [value2];
      }
    } else {
      break;
    }
  }
  if (!parent) {
    if (value2 === void 0) {
      throw new Error("Can not delete in empty document");
    }
    return withFormatting(text6, { offset: root ? root.offset : 0, length: root ? root.length : 0, content: JSON.stringify(value2) }, options);
  } else if (parent.type === "object" && typeof lastSegment === "string" && Array.isArray(parent.children)) {
    const existing = findNodeAtLocation(parent, [lastSegment]);
    if (existing !== void 0) {
      if (value2 === void 0) {
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
        return withFormatting(text6, { offset: removeBegin, length: removeEnd - removeBegin, content: "" }, options);
      } else {
        return withFormatting(text6, { offset: existing.offset, length: existing.length, content: JSON.stringify(value2) }, options);
      }
    } else {
      if (value2 === void 0) {
        return [];
      }
      const newProperty = `${JSON.stringify(lastSegment)}: ${JSON.stringify(value2)}`;
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
      return withFormatting(text6, edit, options);
    }
  } else if (parent.type === "array" && typeof lastSegment === "number" && Array.isArray(parent.children)) {
    const insertIndex = lastSegment;
    if (insertIndex === -1) {
      const newProperty = `${JSON.stringify(value2)}`;
      let edit;
      if (parent.children.length === 0) {
        edit = { offset: parent.offset + 1, length: 0, content: newProperty };
      } else {
        const previous = parent.children[parent.children.length - 1];
        edit = { offset: previous.offset + previous.length, length: 0, content: "," + newProperty };
      }
      return withFormatting(text6, edit, options);
    } else if (value2 === void 0 && parent.children.length >= 0) {
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
      return withFormatting(text6, edit, options);
    } else if (value2 !== void 0) {
      let edit;
      const newProperty = `${JSON.stringify(value2)}`;
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
      return withFormatting(text6, edit, options);
    } else {
      throw new Error(`Can not ${value2 === void 0 ? "remove" : options.isArrayInsertion ? "insert" : "modify"} Array index ${insertIndex} as length is not sufficient`);
    }
  } else {
    throw new Error(`Can not add ${typeof lastSegment !== "number" ? "index" : "property"} to parent of type ${parent.type}`);
  }
}
function withFormatting(text6, edit, options) {
  if (!options.formattingOptions) {
    return [edit];
  }
  let newText = applyEdit(text6, edit);
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
  const editLength = text6.length - (newText.length - end) - begin;
  return [{ offset: begin, length: editLength, content: newText.substring(begin, end) }];
}
function applyEdit(text6, edit) {
  return text6.substring(0, edit.offset) + edit.content + text6.substring(edit.offset + edit.length);
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
function modify(text6, path, value2, options) {
  return setProperty(text6, path, value2, options);
}
function applyEdits(text6, edits) {
  let sortedEdits = edits.slice(0).sort((a, b) => {
    const diff = a.offset - b.offset;
    if (diff === 0) {
      return a.length - b.length;
    }
    return diff;
  });
  let lastModifiedOffset = text6.length;
  for (let i = sortedEdits.length - 1; i >= 0; i--) {
    let e = sortedEdits[i];
    if (e.offset + e.length <= lastModifiedOffset) {
      text6 = applyEdit(text6, e);
    } else {
      throw new Error("Overlapping edit");
    }
    lastModifiedOffset = e.offset;
  }
  return text6;
}

// ../node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.6/node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value2) {
  return value2 === null || value2 === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object4, filter) {
  return Object.fromEntries(Object.entries(object4).filter(([key, value2]) => filter(key, value2)));
}
function mapValues(object4, transform) {
  return Object.fromEntries(Object.entries(object4).map(([key, value2]) => [key, transform(value2, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
var write = Symbol.for("cosmokit.volatile.write");
function snapshot(value2, ancestors = /* @__PURE__ */ new Set()) {
  if (typeof value2 === "function") throw new TypeError("volatile config cannot contain functions");
  if (value2 === null || typeof value2 !== "object") return value2;
  if (ancestors.has(value2)) throw new TypeError("volatile config cannot contain cycles");
  ancestors.add(value2);
  try {
    if (Array.isArray(value2)) return Object.freeze(value2.map((item) => snapshot(item, ancestors)));
    if (Object.getPrototypeOf(value2) !== Object.prototype && Object.getPrototypeOf(value2) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
    return Object.freeze(Object.fromEntries(Object.entries(value2).map(([key, item]) => [key, snapshot(item, ancestors)])));
  } finally {
    ancestors.delete(value2);
  }
}
function createVolatile(value2) {
  let current2 = snapshot(value2);
  return Object.freeze({
    get: () => current2,
    [write]: (value3) => {
      current2 = value3;
    }
  });
}
function isVolatile(value2) {
  return typeof value2 === "object" && value2 !== null && write in value2;
}
function is(type, value2) {
  if (arguments.length === 1) return (value3) => is(type, value3);
  return type in globalThis && value2 instanceof globalThis[type] || Object.prototype.toString.call(value2).slice(8, -1) === type;
}
function isArrayBufferLike(value2) {
  return is("ArrayBuffer", value2) || is("SharedArrayBuffer", value2);
}
function isArrayBufferSource(value2) {
  return isArrayBufferLike(value2) || ArrayBuffer.isView(value2);
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
    source.forEach((value2, index) => {
      result2[index] = Reflect.apply(clone, null, [value2, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor6 = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor6) descriptor6.value = Reflect.apply(clone, null, [descriptor6.value, refs]);
    Reflect.defineProperty(result, key, descriptor6);
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
      }) ?? ((!strict || [a2, b2].every((value2) => Object.getPrototypeOf(value2) === Object.prototype || Object.getPrototypeOf(value2) === null)) && Object.keys({
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
  function fromDateNumber(value2, offset) {
    const date2 = new Date(value2 * Time2.day);
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
    validate: (value2) => {
      try {
        return { value: Schema.resolve(value2, this, {})[0] };
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
Schema.prototype.set = function set(key, value2) {
  this.dict[key] = value2;
  return this;
};
Schema.prototype.push = function push(value2) {
  this.list.push(value2);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value2 = messages[locale];
    if (value2?.$description || value2?.$desc) result[locale] = value2.$description || value2.$desc;
    else if (typeof value2 === "string") result[locale] = value2;
  }
  return result;
}
function getInner(value2) {
  return value2?.$value ?? value2?.$inner;
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
Schema.prototype.extra = function extra(key, value2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value2
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value2 = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value2
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
Schema.prototype.simplify = function simplify(value2) {
  if (isVolatile(value2)) value2 = value2.get();
  if (deepEqual(value2, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value2)) return value2;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value2) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value2[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value2.forEach((value3, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value3) : value3;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value2));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value2, schema, {});
    return schema.simplify(value2);
  } catch {
  }
  return value2;
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
]) Object.assign(Schema.prototype, { [key](value2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value2
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
    const [value2, adapted] = Schema.resolve(data, inner, options, strict);
    try {
      return [createVolatile(value2), adapted];
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : String(error), options);
    }
  }
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
    let current2 = schema;
    let fallback = schema.meta.default;
    while (current2?.type === "intersect" && isNullable(fallback)) {
      current2 = current2.list[0];
      fallback = current2?.meta.default;
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
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value2, options) => {
    const date2 = new Date(value2);
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value2}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value2, options) => {
    try {
      return new RegExp(value2, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value2, options) => {
      if (Binary.isSource(value2)) return Binary.fromSource(value2);
      throw new ValidationError(`expected ArrayBufferSource but got ${value2}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value2, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value2) : Binary.fromHex(value2);
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
Schema.extend("const", (data, { value: value2 }, options) => {
  if (deepEqual(data, value2)) return [value2];
  throw new ValidationError(`expected ${value2} but got ${data}`, options);
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
  let value2 = 0, keys = [];
  if (typeof data === "number") {
    value2 = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value2 |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value2 === meta.default) return [value2];
  return [value2, keys];
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
    const [value2, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value2;
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
Schema.extend("tuple", (data, { list: list2 }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  const result = list2.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list2.length));
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
    const value2 = property(data, key, dict[key], options);
    if (!isNullable(value2) || key in data) result[key] = value2;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list: list2, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list2) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list: list2, toString: toString2 }, options, strict) => {
  if (!list2.length) return [data];
  let result;
  for (const inner of list2) {
    const value2 = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value2)) continue;
    if (isNullable(result)) result = value2;
    else if (typeof result !== typeof value2) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value2 === "object") merge(result ??= {}, value2);
    else if (result !== value2) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
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
defineMethod("const", ["value"], ({ value: value2 }) => typeof value2 === "string" ? JSON.stringify(value2) : value2);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list: list2 }) => `[${list2.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list: list2 }, inline) => {
  const result = list2.map(({ toString: format2 }) => format2()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list: list2 }) => {
  return `${list2.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// src/permission-errors.ts
var PermissionRefusal = class extends Error {
  constructor(code2) {
    super("The Host refused the permission operation.");
    this.code = code2;
  }
};

// src/permission-rules.ts
function invalid() {
  throw new PermissionRefusal("validation");
}
function permissionRuleRow(value2, required, optional2 = []) {
  if (value2 === null || typeof value2 !== "object" || Array.isArray(value2) || ![Object.prototype, null].includes(Object.getPrototypeOf(value2))) invalid();
  const fields = Object.getOwnPropertyDescriptors(value2);
  if (Reflect.ownKeys(value2).some((key) => typeof key !== "string" || !required.includes(key) && !optional2.includes(key)) || required.some((key) => !Object.hasOwn(fields, key)) || Object.values(fields).some((field) => !Object.hasOwn(field, "value") || !field.enumerable)) invalid();
  return value2;
}
function text(value2, max = 32768) {
  if (typeof value2 !== "string" || value2.length === 0 || value2.length > max || value2.includes("\0")) invalid();
  return value2;
}
function permissionRevision(value2) {
  return text(value2, 4096);
}
function integer(value2) {
  if (typeof value2 !== "number" || !Number.isSafeInteger(value2) || value2 < 0) invalid();
  return value2;
}
function ruleAction(value2, inherit = false) {
  if (typeof value2 !== "string" || !(inherit ? ["inherit", "allow", "ask", "deny"] : ["allow", "ask", "deny"]).includes(value2)) invalid();
  return value2;
}
function draft(value2, persisted = false) {
  const input = permissionRuleRow(value2, ["id", "action", "match", ...persisted ? ["source", "revision", "revoked"] : []]);
  const kind = permissionRuleRow(input.match, ["kind"], ["path", "scope", "executable", "command", "workingDirectory"]).kind;
  let match;
  if (kind === "outside-read") {
    const row2 = permissionRuleRow(input.match, ["kind", "path", "scope"]);
    if (row2.scope !== "exact" && row2.scope !== "tree") invalid();
    match = { kind, path: text(row2.path), scope: row2.scope };
  } else if (kind === "shell") {
    const row2 = permissionRuleRow(input.match, ["kind", "executable", "command", "workingDirectory"]);
    match = { kind, executable: text(row2.executable), command: text(row2.command), workingDirectory: text(row2.workingDirectory) };
  } else if (kind === "webSearch" || kind === "webFetch") {
    permissionRuleRow(input.match, ["kind"]);
    match = { kind };
  } else invalid();
  return Object.freeze({ id: text(input.id, 256), action: ruleAction(input.action), match: Object.freeze(match) });
}
function parsePermissionRules(value2) {
  if (!Array.isArray(value2) || value2.length > 1024) invalid();
  const ids = /* @__PURE__ */ new Set();
  return Object.freeze(value2.map((item) => {
    const parsed = draft(item, true), row2 = item;
    if (ids.has(parsed.id) || typeof row2.revoked !== "boolean") invalid();
    ids.add(parsed.id);
    const sourceRow = permissionRuleRow(row2.source, ["kind"], ["sessionId", "savedAt", "label"]);
    let source;
    if (sourceRow.kind === "operator") {
      permissionRuleRow(row2.source, ["kind", "sessionId", "savedAt"]);
      source = { kind: "operator", sessionId: text(sourceRow.sessionId, 256), savedAt: integer(sourceRow.savedAt) };
    } else if (sourceRow.kind === "user-import") {
      permissionRuleRow(row2.source, ["kind", "label"]);
      source = { kind: "user-import", label: text(sourceRow.label, 512) };
    } else invalid();
    return Object.freeze({ ...parsed, source: Object.freeze(source), revision: integer(row2.revision), revoked: row2.revoked });
  }));
}
function parsePermissionRulesSave(value2) {
  const row2 = permissionRuleRow(value2, ["expectedRevision"], ["changes", "upsert", "revoke"]);
  let changes;
  if (row2.changes !== void 0) {
    const input = permissionRuleRow(row2.changes, [], ["outsideReads", "webSearch", "webFetch"]);
    const web2 = (value3) => {
      const row3 = permissionRuleRow(value3, ["enabled", "rule"]);
      if (typeof row3.enabled !== "boolean") invalid();
      return Object.freeze({ enabled: row3.enabled, rule: ruleAction(row3.rule, true) });
    };
    changes = Object.freeze({
      ...input.outsideReads === void 0 ? {} : { outsideReads: ruleAction(input.outsideReads, true) },
      ...input.webSearch === void 0 ? {} : { webSearch: web2(input.webSearch) },
      ...input.webFetch === void 0 ? {} : { webFetch: web2(input.webFetch) }
    });
  }
  if (row2.upsert !== void 0 && (!Array.isArray(row2.upsert) || row2.upsert.length > 1024) || row2.revoke !== void 0 && (!Array.isArray(row2.revoke) || row2.revoke.length > 1024)) invalid();
  const upsert = row2.upsert?.map((item) => draft(item)), revoke = row2.revoke?.map((item) => text(item, 256));
  const ids = [...upsert?.map((item) => item.id) ?? [], ...revoke ?? []];
  if (ids.length !== new Set(ids).size || ids.length === 0 && (changes === void 0 || Object.keys(changes).length === 0)) invalid();
  return Object.freeze({
    expectedRevision: permissionRevision(row2.expectedRevision),
    ...changes === void 0 ? {} : { changes },
    ...upsert === void 0 ? {} : { upsert: Object.freeze(upsert) },
    ...revoke === void 0 ? {} : { revoke: Object.freeze(revoke) }
  });
}

// src/permission-settings.ts
function parseNativeCommands(input = {}) {
  const row2 = permissionRuleRow(input, [], ["enabled", "entries"]);
  if (row2.enabled !== void 0 && typeof row2.enabled !== "boolean" || row2.entries !== void 0 && (!Array.isArray(row2.entries) || row2.entries.length > 1024)) throw new PermissionRefusal("validation");
  const text6 = (value2) => {
    if (typeof value2 !== "string" || value2.trim().length === 0 || value2.length > 32768 || value2.includes("\0")) throw new PermissionRefusal("validation");
    return value2;
  };
  const ids = /* @__PURE__ */ new Set();
  const entries = (row2.entries ?? []).map((value2) => {
    const entry = permissionRuleRow(value2, ["id", "mode", "match", "sandboxMode"]), match = permissionRuleRow(entry.match, ["tool", "executable", "args", "workingDirectory"], ["subcommand"]);
    const id3 = text6(entry.id), cwd = text6(match.workingDirectory);
    if (ids.has(id3) || !["ask", "allow"].includes(entry.mode) || !["bash", "pwsh"].includes(match.tool) || !["workspace-write", "danger-full-access"].includes(entry.sandboxMode) || !/^(?:\/|[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$))/iu.test(cwd) || !Array.isArray(match.args)) throw new PermissionRefusal("validation");
    ids.add(id3);
    return Object.freeze({ id: id3, mode: entry.mode, sandboxMode: entry.sandboxMode, match: Object.freeze({
      tool: match.tool,
      executable: text6(match.executable),
      ...match.subcommand === void 0 ? {} : { subcommand: text6(match.subcommand) },
      args: Object.freeze(match.args.map(text6)),
      workingDirectory: cwd
    }) });
  });
  return Object.freeze({ enabled: row2.enabled ?? false, entries: Object.freeze(entries) });
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
function isSafeDiagnosticField(value2) {
  return typeof value2 === "string" && value2.length <= 256 && /^(?:[a-zA-Z][a-zA-Z0-9_-]{0,63}|\[unknown\])(?:\.(?:[a-zA-Z][a-zA-Z0-9_-]{0,63}|\[unknown\])|\[(?:0|[1-9][0-9]{0,5})\])*$/u.test(value2) && safeDiagnosticField(fieldParts(value2)) === value2;
}
function diagnostic(code2, field, location) {
  const reason = code2 === "unsupported-value" && (field === "locale" || field === "settings.locale") ? "Supported locales: en, zh-Hans, zh-Hant, ja, ko, de, fr, es, pt-BR, ru." : PROFILE_DIAGNOSTIC_REASONS[code2];
  return { severity: code2 === "blank-label" ? "warning" : "error", code: code2, field: safeDiagnosticField(fieldParts(field)), reason, ...location === void 0 ? {} : { location } };
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
  const errors2 = [];
  const tree = parseTree2(content2.replace(/^\uFEFF/u, " "), errors2, { allowTrailingComma: jsonc, disallowComments: !jsonc, allowEmptyContent: false });
  if (tree === void 0 || errors2.length) return { tree, diagnostics: [diagnostic("invalid-jsonc", "content", diagnosticLocation(content2, errors2[0]?.offset ?? 0, errors2[0]?.length ?? 0))] };
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
        const code2 = ["__proto__", "constructor", "prototype"].includes(key) ? "unsafe-field" : found.has(key) ? "duplicate-field" : void 0;
        if (code2 !== void 0) diagnostics.push(diagnostic(code2, safeDiagnosticField(next), diagnosticLocation(content2, keyNode.offset, keyNode.length)));
        found.add(key);
        walk(property2.children[1], next, depth2 + 1);
      }
    } else if (node.type === "array") (node.children ?? []).forEach((child2, index) => walk(child2, [...path, index], depth2 + 1));
  };
  walk(tree, [], 0);
  return { tree, diagnostics };
}

// src/config-revision.ts
function isConfigRevision(value2) {
  return typeof value2 === "string" && (/^[a-f0-9]{64}$/u.test(value2) || /^stat-v1--?\d{1,24}--?\d{1,24}$/u.test(value2));
}
function isProfileReference(value2) {
  return typeof value2 === "string" && (/^[a-f0-9]{64}$/u.test(value2) || /^snapshot-v1-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value2));
}

// src/profile-remote.ts
var errorCodes = /* @__PURE__ */ new Set(["validation", "conflict", "not-found", "lock-timeout", "unsafe-path", "io", "activation", "corrupt-selection", "limit", "busy", "maintenance", "disposed", "not-owned", "unavailable", "cancelled"]);
var idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
var revisionPattern = /^[a-f0-9]{64}$/u;
var rolePattern = /^dsmm-(?:orchestrator|planner|plan-critic|builder|reviewer|oracle|oracle-2nd|creative|code-search|doc-search|clarifier|media-reader|frontend|hard-reasoning|research|quick|coding|normal-task|complex|deep|documenting|cross-cutting)$/u;
function isProfileId(value2) {
  return typeof value2 === "string" && idPattern.test(value2) && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/iu.test(value2);
}
function fail2(field) {
  throw new TypeError(`Invalid Deepwork profile wire field: ${field}`);
}
function text2(value2, field, maximum = 1024) {
  if (typeof value2 !== "string" || value2.length > maximum) fail2(field);
  return value2;
}
function id(value2) {
  const result = text2(value2, "id", 64);
  if (!isProfileId(result)) fail2("id");
  return result;
}
function revision(value2) {
  const result = text2(value2, "revision", 128);
  if (!isConfigRevision(result)) fail2("revision");
  return result;
}
function epoch(value2) {
  if (typeof value2 !== "string" || !revisionPattern.test(value2)) fail2("epoch");
  return value2;
}
function reference(value2) {
  if (!isProfileReference(value2)) fail2("reference");
  return value2;
}
function modeRevision(value2) {
  if (typeof value2 !== "string" || !/^(?:[a-f0-9]{64}|mode-v1-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/u.test(value2)) fail2("mode revision");
  return value2;
}
function refresh(value2) {
  if (value2 !== true) fail2("refreshRequired");
  return true;
}
function observedRevision(value2, row2) {
  return value2 === "unavailable" && row2.refreshRequired === true ? value2 : selectionRevision(value2);
}
function selectionRevision(value2) {
  return value2 === "absent" ? value2 : revision(value2);
}
function isNativeSessionId(value2) {
  return typeof value2 === "string" && value2.length > 0 && value2.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value2) && new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(value2)) === value2;
}
function sessionId(value2) {
  if (!isNativeSessionId(value2)) fail2("sessionId");
  return value2;
}
function boolean(value2, field) {
  if (typeof value2 !== "boolean") fail2(field);
  return value2;
}
function integer2(value2, field, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof value2 !== "number" || !Number.isSafeInteger(value2) || value2 < 0 || value2 > maximum) fail2(field);
  return value2;
}
function role2(value2) {
  if (typeof value2 !== "string" || !rolePattern.test(value2)) fail2("role");
  return value2;
}
function object(value2, required, optional2 = []) {
  if (value2 === null || typeof value2 !== "object" || Array.isArray(value2)) fail2("object");
  if (Object.getPrototypeOf(value2) !== Object.prototype && Object.getPrototypeOf(value2) !== null || Object.getOwnPropertySymbols(value2).length || Object.values(Object.getOwnPropertyDescriptors(value2)).some((property2) => !Object.hasOwn(property2, "value") || !property2.enumerable)) fail2("object");
  const result = value2;
  if (Object.keys(result).some((key) => !required.includes(key) && !optional2.includes(key)) || required.some((key) => !Object.hasOwn(result, key))) fail2("object keys");
  return result;
}
function optional(value2, key, parse3) {
  return Object.hasOwn(value2, key) ? { [key]: parse3(value2[key]) } : {};
}
function parseProfileErrorInfo(value2) {
  const item = object(value2, ["code", "message"], ["field", "reason", "location"]);
  const code2 = text2(item.code, "code");
  if (!errorCodes.has(code2)) fail2("code");
  const reason = item.reason === void 0 ? void 0 : text2(item.reason, "reason", 64);
  if (reason !== void 0 && (!Object.hasOwn(PROFILE_DIAGNOSTIC_REASONS, reason) || reason === "blank-label")) fail2("reason");
  const field = item.field === void 0 ? void 0 : diagnosticField(item.field);
  return {
    code: code2,
    message: reason === void 0 ? text2(item.message, "message", 4096) : `${field ?? "document"}: ${diagnostic(reason, field ?? "document").reason}`,
    ...field === void 0 ? {} : { field },
    ...reason === void 0 ? {} : { reason },
    ...optional(item, "location", diagnosticPosition)
  };
}
var errorInfo = parseProfileErrorInfo;
function diagnosticField(value2) {
  if (!isSafeDiagnosticField(value2)) fail2("field");
  return value2;
}
function diagnosticPosition(value2) {
  const item = object(value2, ["offset", "length", "line", "column"]);
  const result = { offset: integer2(item.offset, "offset", 128 * 1024), length: integer2(item.length, "length", 128 * 1024), line: integer2(item.line, "line", 128 * 1024 + 1), column: integer2(item.column, "column", 128 * 1024 + 1) };
  if (result.line < 1 || result.column < 1 || result.offset + result.length > 128 * 1024) fail2("location");
  return result;
}
function parseProfileDiagnostic(value2) {
  const row2 = object(value2, ["severity", "code", "field", "reason"], ["location"]);
  if (typeof row2.code !== "string" || !Object.hasOwn(PROFILE_DIAGNOSTIC_REASONS, row2.code)) fail2("diagnostic code");
  const result = diagnostic(row2.code, diagnosticField(row2.field));
  if (row2.severity !== result.severity || row2.reason !== result.reason) fail2("diagnostic severity/reason");
  return { ...result, ...optional(row2, "location", diagnosticPosition) };
}
function warnings(value2) {
  if (!Array.isArray(value2) || value2.length > 1) fail2("warnings");
  return value2.map((value3) => {
    const result = parseProfileDiagnostic(value3);
    if (result.severity !== "warning" || result.code !== "blank-label" || result.field !== "label") fail2("warning");
    return result;
  });
}
function parseRoleAvailability(value2) {
  const row2 = object(value2, ["id", "required", "startupAvailable", "deploymentEnabled", "admitted", "source", "capture"], ["requiredReason", "namedEnabled", "reason"]);
  if (typeof row2.source !== "string" || !["defaults", "global", "profile", "named-session"].includes(row2.source) || typeof row2.capture !== "string" || !["startup", "deployment", "named-session"].includes(row2.capture)) fail2("role source/capture");
  if (row2.reason !== void 0 && (typeof row2.reason !== "string" || !["module-off", "deployment-disabled", "startup-unavailable", "profile-disabled", "required-role", "current-root-disabled"].includes(row2.reason))) fail2("role reason");
  if (row2.requiredReason !== void 0 && (typeof row2.requiredReason !== "string" || !["deepwork-planning", "legacy-review"].includes(row2.requiredReason))) fail2("requiredReason");
  return {
    id: role2(row2.id),
    required: boolean(row2.required, "required"),
    startupAvailable: boolean(row2.startupAvailable, "startupAvailable"),
    deploymentEnabled: boolean(row2.deploymentEnabled, "deploymentEnabled"),
    admitted: boolean(row2.admitted, "admitted"),
    source: row2.source,
    capture: row2.capture,
    ...optional(row2, "namedEnabled", (value3) => boolean(value3, "namedEnabled")),
    ...row2.reason === void 0 ? {} : { reason: row2.reason },
    ...row2.requiredReason === void 0 ? {} : { requiredReason: row2.requiredReason }
  };
}
function roleAvailabilityList(value2) {
  if (!Array.isArray(value2) || value2.length > 22) fail2("roles");
  const result = value2.map(parseRoleAvailability);
  if (new Set(result.map((role3) => role3.id)).size !== result.length) fail2("roles");
  return result;
}
function parseSubagentRuntimeAdmissionView(value2) {
  const row2 = object(value2, ["binding", "deliveryFenceReady", "restartRequired"], ["reason"]);
  if (typeof row2.binding !== "string" || !["stock", "unavailable"].includes(row2.binding) || row2.reason !== void 0 && row2.reason !== "authority-not-ready") fail2("subagentRuntime");
  const ready = boolean(row2.deliveryFenceReady, "deliveryFenceReady");
  if (ready && (row2.binding === "unavailable" || row2.reason !== void 0)) fail2("subagentRuntime readiness");
  return { binding: row2.binding, deliveryFenceReady: ready, restartRequired: boolean(row2.restartRequired, "restartRequired"), ...row2.reason === void 0 ? {} : { reason: row2.reason } };
}
function readResult(value2) {
  const item = object(value2, ["id", "revision", "content"], ["label", "warnings", "refreshRequired"]);
  return { id: id(item.id), revision: item.revision === "unavailable" && item.refreshRequired === true ? "unavailable" : revision(item.revision), content: content(item.content), ...optional(item, "refreshRequired", refresh), ...optional(item, "label", (input) => text2(input, "label", 120)), ...optional(item, "warnings", warnings) };
}
function content(value2) {
  const result = text2(value2, "content", 128 * 1024);
  if (new TextEncoder().encode(result).byteLength > 128 * 1024) fail2("content");
  return result;
}
function snapshot2(value2) {
  const item = object(value2, ["profiles", "selectedId", "appliedRevision", "selectionRevision"], ["selectionError", "roles", "editorDefaults", "origin", "readOnly", "writeRestriction", "selectedWarnings", "sourceRevision", "refreshRequired"]);
  if (!Array.isArray(item.profiles) || item.profiles.length > 128) fail2("profiles");
  return {
    profiles: item.profiles.map((input) => {
      const row2 = object(input, ["id", "revision"], ["label", "error", "warnings"]);
      return { id: text2(row2.id, "id", 64), revision: row2.revision === null ? null : revision(row2.revision), ...optional(row2, "label", (input2) => text2(input2, "label", 120)), ...optional(row2, "error", errorInfo), ...optional(row2, "warnings", warnings) };
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
      const result = input.map((value3) => {
        const row2 = object(value3, ["id", "label", "enabled"], ["runtimePolicy", "availability"]);
        return { id: role2(row2.id), label: text2(row2.label, "label", 120), enabled: boolean(row2.enabled, "enabled"), ...optional(row2, "availability", parseRoleAvailability), ...optional(row2, "runtimePolicy", (input2) => {
          const policy = object(input2, [], ["strategy", "rateLimit"]);
          return { ...optional(policy, "strategy", normalizeRoutingStrategy), ...optional(policy, "rateLimit", normalizeRateLimitOverrides) };
        }) };
      });
      if (new Set(result.map((row2) => row2.id)).size !== result.length) fail2("roles");
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
function rateLimit2(value2) {
  const item = object(value2, Object.keys(DSMM_RATE_LIMIT_BOUNDS));
  return normalizeRateLimitPolicy(item);
}
function runtimePolicy(value2) {
  const item = object(value2, ["strategy", "rateLimit"]);
  return { strategy: normalizeRoutingStrategy(item.strategy), rateLimit: rateLimit2(item.rateLimit) };
}
function rolePolicy(value2) {
  const item = object(value2, ["strategy", "rateLimit", "retries", "rateLimitFailures", "switches", "totalDelayMs"], ["role", "route"]);
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
function modelRoute(value2) {
  return normalizeModelRouteJson(value2);
}
function initialRoleRoute(value2) {
  const row2 = object(value2, ["status"], ["source", "route", "reason"]);
  if (row2.status === "known") {
    object(row2, ["status", "source", "route"]);
    if (row2.source !== "invocation-capture") fail2("initialRoute source");
    return { status: "known", source: "invocation-capture", route: modelRoute(row2.route) };
  }
  object(row2, ["status", "reason"]);
  if (row2.status !== "unknown" || row2.reason !== "missing-invocation-capture") fail2("initialRoute reason");
  return { status: "unknown", reason: "missing-invocation-capture" };
}
function liveRoleRoute(value2) {
  const row2 = object(value2, ["status"], ["source", "route", "reason"]);
  if (row2.status === "known") {
    object(row2, ["status", "source", "route"]);
    if (row2.source !== "own-native-request-header") fail2("liveRoute source");
    return { status: "known", source: "own-native-request-header", route: modelRoute(row2.route) };
  }
  object(row2, ["status", "reason"]);
  if (row2.status !== "unknown" || typeof row2.reason !== "string" || !["no-own-request-header", "invalid-own-request-header", "not-observed"].includes(row2.reason)) fail2("liveRoute reason");
  return { status: "unknown", reason: row2.reason };
}
function parseDsmmRoleRouteComparison(value2) {
  const row2 = object(jsonData(value2), ["childId", "initialRoute", "liveRoute"]);
  return { childId: sessionId(row2.childId), initialRoute: initialRoleRoute(row2.initialRoute), liveRoute: liveRoleRoute(row2.liveRoute) };
}
function parseDsmmInvocationView(value2) {
  const row2 = object(jsonData(value2), ["role", "label", "level", "routeSource", "mode"], ["route", "runId", "childId", "jobId", "routeComparison"]);
  if (typeof row2.level !== "string" || !["normal", "low", "high", "max"].includes(row2.level) || !DSMM_ROUTE_SOURCES.includes(row2.routeSource) || typeof row2.mode !== "string" || !["one-shot", "continuable"].includes(row2.mode)) fail2("invocation");
  const target = role2(row2.role);
  if (target === "dsmm-orchestrator") fail2("invocation target");
  const routeComparison = Object.hasOwn(row2, "routeComparison") ? parseDsmmRoleRouteComparison(row2.routeComparison) : void 0;
  if (routeComparison !== void 0 && (!Object.hasOwn(row2, "childId") || routeComparison.childId !== row2.childId)) fail2("invocation routeComparison childId");
  return { role: target, label: text2(row2.label, "label", 120), level: row2.level, routeSource: row2.routeSource, mode: row2.mode, ...optional(row2, "route", modelRoute), ...optional(row2, "runId", sessionId), ...optional(row2, "childId", sessionId), ...optional(row2, "jobId", sessionId), ...routeComparison === void 0 ? {} : { routeComparison } };
}
function selectionState(value2) {
  const item = object(value2, ["selectedId", "appliedRevision", "selectionRevision"], ["sourceRevision", "refreshRequired"]);
  return { selectedId: item.selectedId === null ? null : id(item.selectedId), appliedRevision: item.appliedRevision === null ? null : reference(item.appliedRevision), selectionRevision: observedRevision(item.selectionRevision, item), ...optional(item, "sourceRevision", revision), ...optional(item, "refreshRequired", refresh) };
}
function actionUnavailableReason(value2) {
  if (typeof value2 !== "string" || !["busy", "maintenance", "module-off", "runtime-unavailable", "model-unconfigured", "model-service-unavailable", "new-session-required"].includes(value2)) fail2("actionUnavailableReason");
  return value2;
}
function sessionSnapshot(value2) {
  const item = object(value2, ["sessionId", "globalDefault", "selection", "scope", "admissionEpoch", "switchAllowed", "canSelectModel", "canToggleMode", "canApplyOverlay"], ["admittedSelection", "switchUnavailableReason", "selectModelUnavailableReason", "toggleModeUnavailableReason", "applyOverlayUnavailableReason", "rolePolicy", "profileModel", "deepwork", "modules", "configuration", "warnings", "roles", "subagentRuntime", "refreshRequired"]);
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
function saveRequest(value2) {
  const item = object(value2, ["id", "content", "expectedRevision"]);
  return { id: id(item.id), content: content(item.content), expectedRevision: item.expectedRevision === null ? null : revision(item.expectedRevision) };
}
function selectRequest(value2) {
  const item = object(value2, ["id", "expectedSelectionRevision"], ["expectedRevision"]);
  const result = { id: item.id === null ? null : id(item.id), expectedSelectionRevision: selectionRevision(item.expectedSelectionRevision), ...optional(item, "expectedRevision", revision) };
  if (result.id !== null && result.expectedRevision === void 0) fail2("expectedRevision");
  if (result.id === null && result.expectedRevision !== void 0) fail2("expectedRevision");
  return result;
}
function sessionSelectRequest(value2) {
  const item = object(value2, ["sessionId", "id", "expectedSelectionRevision", "expectedAdmissionEpoch"], ["expectedRevision"]);
  const { sessionId: inputSessionId, expectedAdmissionEpoch, ...profileRequest } = item;
  return { ...selectRequest(profileRequest), sessionId: sessionId(inputSessionId), expectedAdmissionEpoch: epoch(expectedAdmissionEpoch) };
}
function modeSelectRequest(value2) {
  const item = object(value2, ["sessionId", "active", "expectedModeRevision", "expectedAdmissionEpoch"]);
  return { sessionId: sessionId(item.sessionId), active: boolean(item.active, "active"), expectedModeRevision: modeRevision(item.expectedModeRevision), expectedAdmissionEpoch: epoch(item.expectedAdmissionEpoch) };
}
function codec(symbol, parse3) {
  return { mode: "strict", typeSymbol: `@dsmm/dsmm#${symbol}`, create: () => ({ parse: (value2) => parse3(jsonData(value2)) }) };
}
function descriptor(method, result, parameter) {
  return { id: `@dsmm/dsmm#dsmmProfiles/${method}`, service: "dsmmProfiles", namespace: "dsmmProfiles", method, invocation: { kind: "direct" }, parameters: parameter === void 0 ? [] : [{ name: parameter.name, wire: parameter.name, source: "json", codec: parameter.codec }], result };
}
function jsonData(value2, depth2 = 0, active = /* @__PURE__ */ new Set()) {
  if (depth2 > 32) fail2("JSON depth");
  if (value2 === null || typeof value2 === "string" || typeof value2 === "boolean") return value2;
  if (typeof value2 === "number" && Number.isFinite(value2)) return value2;
  if (typeof value2 !== "object" || value2 === null || active.has(value2)) fail2("JSON value");
  if (Array.isArray(value2) ? Object.getPrototypeOf(value2) !== Array.prototype : Object.getPrototypeOf(value2) !== Object.prototype && Object.getPrototypeOf(value2) !== null) fail2("JSON object");
  if (Object.getOwnPropertySymbols(value2).length) fail2("JSON symbols");
  const properties = Object.getOwnPropertyDescriptors(value2);
  for (const [key, property2] of Object.entries(properties)) {
    if (Array.isArray(value2) && key === "length") continue;
    if (!Object.hasOwn(property2, "value") || !property2.enumerable || Array.isArray(value2) && !/^(0|[1-9][0-9]*)$/u.test(key)) fail2("JSON property");
  }
  if (Array.isArray(value2) && Object.keys(value2).length !== value2.length) fail2("JSON array holes");
  active.add(value2);
  const result = Array.isArray(value2) ? value2.map((child2) => jsonData(child2, depth2 + 1, active)) : Object.fromEntries(Object.entries(value2).map(([key, child2]) => {
    if (["__proto__", "prototype", "constructor"].includes(key)) fail2("JSON key");
    return [key, jsonData(child2, depth2 + 1, active)];
  }));
  active.delete(value2);
  return result;
}
function globalSnapshot(value2) {
  const row2 = object(value2, ["config", "revision"], ["refreshRequired"]);
  object(row2.config, [], Object.keys(row2.config));
  return { config: jsonData(row2.config), revision: observedRevision(row2.revision, row2), ...optional(row2, "refreshRequired", refresh) };
}
function admissionView(value2) {
  const row2 = object(value2, ["settings", "sources", "captures", "restartRequired", "named"], ["modelParameterPolicy"]);
  object(row2.settings, [], Object.keys(row2.settings));
  for (const key of ["sources", "captures"]) {
    const map = object(row2[key], [], Object.keys(row2[key]));
    for (const [path, value3] of Object.entries(map)) {
      if (path.startsWith("lsp.env.")) fail2("private environment field");
      text2(value3, key, 128);
    }
  }
  if (!Array.isArray(row2.restartRequired) || row2.restartRequired.length > 256) fail2("restartRequired");
  const named = row2.named === null ? null : object(row2.named, ["id", "revision"]);
  return {
    ...optional(row2, "modelParameterPolicy", (value3) => parseModelParameterPolicy(jsonData(value3))),
    settings: readOnlySettingsData(row2.settings),
    sources: jsonData(row2.sources),
    captures: jsonData(row2.captures),
    restartRequired: row2.restartRequired.map((value3) => text2(value3, "field", 256)),
    named: named === null ? null : { id: id(named.id), revision: reference(named.revision) }
  };
}
function readOnlySettingsData(value2) {
  const settings = jsonData(value2);
  const configured = (value3) => {
    if (value3 !== "" && value3 !== "<configured>") fail2("private configured value");
  };
  if (settings.lsp !== void 0) {
    const lsp = object(settings.lsp, ["enabled", "serverName", "command", "args", "cwd", "env", "toolCallTimeoutMs", "failOnStartupError"]);
    configured(lsp.command);
    configured(lsp.cwd);
    if (!Array.isArray(lsp.args) || lsp.args.some((value3) => value3 !== "<configured>")) fail2("private arguments");
    const env = object(lsp.env, [], Object.keys(lsp.env));
    for (const [key, value3] of Object.entries(env)) if (!/^variable-[1-9][0-9]*$/u.test(key) || value3 !== "<redacted>") fail2("private environment");
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
function editorSnapshot(value2) {
  const row2 = object(value2, ["entryId", "namespace", "hostProfileKey", "global", "globalRevision", "profile", "nativeRevision", "nativeFormRevision", "nativeForm", "desired", "sources", "startup", "defaults", "schema", "nextRoot", "modules"], ["startupSources", "nativeSchema", "subagentRuntime"]);
  const result = jsonData(row2);
  text2(row2.entryId, "entryId", 256);
  if (row2.namespace !== null) text2(row2.namespace, "namespace", 256);
  epoch(row2.hostProfileKey);
  selectionRevision(row2.globalRevision);
  if (row2.nativeRevision !== "unavailable" && (typeof row2.nativeRevision !== "string" || !/^native-v1-\d+$/u.test(row2.nativeRevision))) fail2("nativeRevision");
  if (row2.nativeFormRevision !== null) integer2(row2.nativeFormRevision, "nativeFormRevision");
  for (const key of ["global", "profile", "desired", "sources", "startup", "defaults", "schema"]) object(row2[key], [], Object.keys(row2[key]));
  if (row2.nativeForm !== null) object(row2.nativeForm, ["base", "user"]);
  if (row2.nextRoot !== null) result.nextRoot = admissionView(row2.nextRoot);
  result.desired = readOnlySettingsData(row2.desired);
  result.startup = readOnlySettingsData(row2.startup);
  result.schema = schemaNode(row2.schema);
  if (row2.nativeSchema !== void 0) result.nativeSchema = schemaNode(row2.nativeSchema);
  if (row2.subagentRuntime !== void 0) result.subagentRuntime = parseSubagentRuntimeAdmissionView(row2.subagentRuntime);
  for (const map of [result.sources, result.startupSources]) {
    if (map === void 0) continue;
    object(map, [], Object.keys(map));
    for (const [path, value3] of Object.entries(map)) {
      if (path.startsWith("lsp.env.")) fail2("private environment field");
      text2(value3, "source", 128);
    }
  }
  result.modules = moduleStates(row2.modules);
  return result;
}
function schemaNode(value2) {
  const row2 = object(value2, ["type"], ["fields", "inner", "alternatives", "value", "min", "max", "step", "required", "keys", "nonempty", "additionalProperties"]);
  if (typeof row2.type !== "string" || !["object", "dict", "array", "union", "const", "string", "number", "boolean"].includes(row2.type)) fail2("schema type");
  const node = { type: row2.type };
  if (row2.fields !== void 0) node.fields = Object.fromEntries(Object.entries(object(row2.fields, [], Object.keys(row2.fields))).map(([key, child2]) => [key, schemaNode(child2)]));
  if (row2.inner !== void 0) node.inner = schemaNode(row2.inner);
  if (row2.alternatives !== void 0) {
    if (!Array.isArray(row2.alternatives)) fail2("schema alternatives");
    node.alternatives = row2.alternatives.map(schemaNode);
  }
  if (Object.hasOwn(row2, "value")) {
    if (!["string", "number", "boolean"].includes(typeof row2.value)) fail2("schema value");
    node.value = row2.value;
  }
  for (const key of ["min", "max", "step"]) if (row2[key] !== void 0) {
    if (typeof row2[key] !== "number" || !Number.isFinite(row2[key])) fail2("schema bound");
    node[key] = row2[key];
  }
  if (row2.required !== void 0) node.required = boolean(row2.required, "schema required");
  if (row2.nonempty !== void 0) {
    if (row2.type !== "string") fail2("schema nonempty");
    node.nonempty = boolean(row2.nonempty, "schema nonempty");
  }
  if (Object.hasOwn(row2, "additionalProperties")) {
    if (row2.type !== "object" || row2.additionalProperties !== "json") fail2("schema additionalProperties");
    node.additionalProperties = "json";
  }
  if (row2.keys !== void 0) {
    if (row2.type !== "dict" || !Array.isArray(row2.keys) || row2.keys.length > 64) fail2("schema keys");
    node.keys = row2.keys.map((key) => text2(key, "schema key", 128));
  }
  return node;
}
function globalSaveRequest(value2) {
  const row2 = object(value2, ["expectedRevision", "edits"]);
  if (!Array.isArray(row2.edits) || row2.edits.length > 128) fail2("edits");
  return { expectedRevision: selectionRevision(row2.expectedRevision), edits: row2.edits.map((value3) => {
    const edit = object(value3, ["op", "path"], ["value"]);
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
function moduleStates(value2) {
  if (!Array.isArray(value2) || value2.length !== DSMM_MODULE_DESCRIPTORS.length) fail2("modules");
  const ids = /* @__PURE__ */ new Set();
  return value2.map((value3) => {
    const row2 = object(value3, ["descriptor", "hostBundleEnabled", "desired", "startupMounted", "admitted", "nextRoot", "reason", "pending"]);
    const descriptor6 = object(row2.descriptor, ["id", "label", "key"]);
    const known = DSMM_MODULE_DESCRIPTORS.find((known2) => known2.id === descriptor6.id);
    if (known === void 0 || descriptor6.label !== known.label || descriptor6.key !== known.key || row2.hostBundleEnabled !== "unknown" || ids.has(known.id)) fail2("module descriptor");
    ids.add(known.id);
    const desired = object(row2.desired, ["enabled", "source", "capture"]), next = object(row2.nextRoot, ["admitted", "reason"]);
    if (typeof desired.source !== "string" || !["defaults", "global", "profile"].includes(desired.source) || typeof desired.capture !== "string" || !["current-global", "admission", "startup"].includes(desired.capture) || ![null, "global-disabled", "restart-required"].includes(next.reason) || ![null, "global-disabled", "restart-required", "captured-off"].includes(row2.reason)) fail2("module state");
    return {
      descriptor: { ...known },
      hostBundleEnabled: "unknown",
      desired: { enabled: boolean(desired.enabled, "desired.enabled"), source: desired.source, capture: desired.capture },
      startupMounted: row2.startupMounted === null ? null : boolean(row2.startupMounted, "startupMounted"),
      admitted: row2.admitted === null ? null : boolean(row2.admitted, "admitted"),
      nextRoot: { admitted: next.admitted === null ? null : boolean(next.admitted, "nextRoot.admitted"), reason: next.reason },
      reason: row2.reason,
      pending: boolean(row2.pending, "pending")
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
  return (warnings2 ?? []).flatMap((value2) => {
    try {
      const warning = parseProfileDiagnostic(value2);
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
var writableSelectionVersion = (value2) => value2 === "absent" || isConfigRevision(value2);
function configurationVersionState(value2) {
  if (value2 === "absent") return "versionAbsent";
  return isConfigRevision(value2) || typeof value2 === "string" && /^native-v1-\d+$/u.test(value2) ? "versionObserved" : "versionUnknown";
}
function sourceRelationship(selection, savedRevision) {
  return selection.sourceRevision === void 0 || savedRevision == null || !isConfigRevision(savedRevision) ? "unknown" : selection.sourceRevision === savedRevision ? "current" : "changed";
}

// src/client/structured.ts
function record(value2) {
  return value2 !== null && typeof value2 === "object" && !Array.isArray(value2);
}
function route2(value2) {
  return record(value2) && typeof value2.provider === "string" && typeof value2.model === "string" && (value2.reasoningEffort === void 0 || typeof value2.reasoningEffort === "string");
}
function level(value2) {
  return route2(value2) || record(value2) && value2.provider === void 0 && value2.model === void 0 && typeof value2.reasoningEffort === "string";
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
  const errors2 = [];
  const tree = parseTree2(content2, errors2, { allowTrailingComma: true });
  if (errors2.length !== 0 || tree === void 0 || !validTree(tree)) return null;
  const document2 = parse2(content2, errors2, { allowTrailingComma: true });
  if (errors2.length !== 0 || !record(document2) || document2.version !== 1 || typeof document2.id !== "string" || !record(document2.settings) || document2.label !== void 0 && typeof document2.label !== "string") return null;
  const settings = document2.settings;
  if (settings.defaultActive !== void 0 && typeof settings.defaultActive !== "boolean") return null;
  if (settings.locale !== void 0 && typeof settings.locale !== "string") return null;
  if (settings.roles !== void 0 && (!record(settings.roles) || !Object.values(settings.roles).every((value2) => typeof value2 === "boolean"))) return null;
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
      if (raw.levels !== void 0 && (role3 === "dsmm-orchestrator" || !record(raw.levels) || Object.entries(raw.levels).some(([key, value2]) => !["low", "high", "max"].includes(key) || !level(value2)))) return null;
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
function editStructuredPath(content2, path, value2) {
  if (structuredDocument(content2) === null) return null;
  try {
    return applyEdits(content2, modify(content2, path, value2, {}));
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
function modelSelectionWatermark(window2) {
  let watermark = -1;
  for (const entry of window2.entries) if (entry.type === "event" && entry.event.type === "model/selection") watermark = Math.max(watermark, Number(entry.event.seq));
  return watermark;
}
function modeIntentWatermark(window2) {
  let watermark = -1;
  for (const entry of window2.entries) if (entry.type === "event" && (entry.event.type === "deepwork/mode" || entry.event.type === "agent-preset/selected")) watermark = Math.max(watermark, Number(entry.event.seq));
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
    sessionViewEpoch: 0,
    sessionUnconfirmed: false,
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
  pendingSessionSelections = /* @__PURE__ */ new Set();
  connection = null;
  connectionBaseline;
  connectionBound = false;
  stopConnection = null;
  composerBlocks = null;
  composerReason = null;
  composerBlock = null;
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
    open: (id3) => this.open(id3),
    create: () => this.open(NEW_EDITOR),
    reload: () => this.reload(),
    editId: (id3) => this.editId(id3),
    editContent: (content2) => this.editContent(content2),
    save: () => this.save(),
    apply: () => this.apply(),
    reset: () => this.reset(),
    discardAndOpen: () => this.discardAndOpen(),
    cancelDiscard: () => this.publish({ pendingEditor: null }),
    editPath: (path, value2) => this.editPath(path, value2),
    moveFallback: (role3, from2, to) => this.editFallbackOrder(role3, from2, to),
    editRoute: (path, provider, model) => this.editRoute(path, provider, model),
    refreshCatalog: () => this.refreshCatalog(),
    refreshSession: () => this.refreshSession(),
    chooseSessionProfile: (id3) => {
      if (!this.disposed && this.connectionCurrent() && !this.current.sessionUnconfirmed && this.current.sessionBusy === null && this.current.busy === null && !this.current.dirty && this.current.pendingEditor === null && this.current.invalidFields.length === 0) this.publish({ sessionChoice: id3, sessionNotice: null });
    },
    applySession: (options) => this.selectSession(false, options),
    resetSession: () => this.selectSession(true),
    setDeepwork: (active) => this.setDeepwork(active),
    useSessionProfileModel: () => this.selectSession(false, { useProfileModel: true }, true),
    setFieldInvalid: (field, invalid3) => {
      if (this.disposed) return;
      const invalidFields = this.current.invalidFields.filter((candidate2) => candidate2 !== field);
      if (invalid3) invalidFields.push(field);
      if (invalidFields.join("\n") !== this.current.invalidFields.join("\n")) this.publish({ invalidFields, ...invalid3 ? { dirty: true } : {} });
    }
  };
  dispose() {
    this.releaseComposerBlock();
    this.stopConnection?.();
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
  bindConnection(source) {
    if (this.disposed) return;
    const replacement = this.connectionBound && (source !== this.connection || source?.getSnapshot() !== this.connectionBaseline);
    this.stopConnection?.();
    this.connection = source;
    this.connectionBound = true;
    this.connectionBaseline = source?.getSnapshot();
    const invalidate = () => {
      this.connectionBaseline = source?.getSnapshot();
      this.generation += 1;
      this.sessionGeneration += 1;
      this.modelSelectorGeneration += 1;
      this.publish({
        session: null,
        sessionBusy: null,
        sessionNotice: null,
        sessionUnconfirmed: this.current.currentSessionId !== null,
        sessionViewEpoch: this.current.sessionViewEpoch + 1,
        busy: null,
        issue: { kind: "transport", code: "unavailable" }
      });
    };
    if (replacement || source === null || this.connectionBaseline === void 0) invalidate();
    this.stopConnection = source?.subscribe(() => {
      invalidate();
      if (this.connectionCurrent()) {
        void this.refresh();
        void this.refreshSession();
      }
    }) ?? null;
  }
  connectionCurrent() {
    return !this.connectionBound || this.connectionBaseline !== void 0 && this.connection?.getSnapshot() === this.connectionBaseline;
  }
  attachComposerBlocks(blocks, reason) {
    if (this.disposed) return;
    this.releaseComposerBlock();
    this.composerBlocks = blocks;
    this.composerReason = reason ?? null;
    this.syncComposerBlock();
  }
  releaseComposerBlock() {
    const held = this.composerBlock;
    this.composerBlock = null;
    if (held !== null && this.composerBlocks?.storeFor(held.id) === held.store && held.store.getSnapshot() === held.block) this.composerBlocks.set(held.id, void 0);
  }
  syncComposerBlock() {
    const { currentSessionId, sessionBusy, sessionUnconfirmed, session } = this.current;
    const wanted = currentSessionId !== null && (sessionBusy === "apply" || sessionBusy === "reset" || sessionUnconfirmed || session?.refreshRequired || session?.selection.refreshRequired);
    if (!wanted || this.composerBlock?.id !== currentSessionId) this.releaseComposerBlock();
    if (!wanted || this.composerBlock !== null || this.composerBlocks === null || this.composerReason === null) return;
    const id3 = currentSessionId, store = this.composerBlocks.storeFor(id3);
    if (store.getSnapshot() !== void 0) return;
    const block = { reason: this.composerReason() };
    this.composerBlock = { id: id3, store, block };
    this.composerBlocks.set(id3, block);
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
      const window2 = source.getSnapshot(), change = window2.change;
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
  setSession(id3) {
    if (this.disposed || id3 === this.current.currentSessionId) return;
    this.sessionGeneration += 1;
    this.modeRefreshPending = false;
    if (id3 !== this.modelSelectionSessionId) this.attachModelSelectionSource(null, null);
    if (id3 !== this.modelEventsSessionId) this.attachModelEventSource(null, null);
    if (id3 !== this.modelInteractionSessionId) this.attachModelInteractionSource(null, null);
    this.publish({ currentSessionId: id3, sessionViewEpoch: this.current.sessionViewEpoch + 1, sessionUnconfirmed: id3 !== null && this.pendingSessionSelections.has(id3), session: null, sessionChoice: null, sessionBusy: null, sessionIssue: null, sessionNotice: null });
    if (id3 !== null) void this.refreshSession();
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
    const id3 = this.current.currentSessionId;
    if (this.disposed || !this.connectionCurrent() || id3 === null || this.current.sessionBusy !== null) return;
    this.modeRefreshPending = false;
    const generation = ++this.sessionGeneration;
    const live = () => !this.disposed && this.connectionCurrent() && generation === this.sessionGeneration && id3 === this.current.currentSessionId;
    this.publish({ sessionBusy: "read", ...preserveFeedback ? {} : { sessionIssue: null, sessionNotice: null } });
    try {
      const session = await this.unwrap(this.remote.describeSession(id3));
      if (session.sessionId !== id3) throw { kind: "assembly", code: "unavailable" };
      if (live()) this.publish({ session, sessionChoice: (session.admittedSelection ?? session.selection).selectedId, sessionUnconfirmed: this.pendingSessionSelections.has(id3) });
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
    const { currentSessionId: id3, session } = this.current;
    if (this.disposed || !this.connectionCurrent() || this.current.sessionUnconfirmed || id3 === null || session?.deepwork === void 0 || session.refreshRequired || session.selection.refreshRequired || session.deepwork.locked || session.canToggleMode !== true || this.current.sessionBusy !== null || this.current.busy !== null || this.remote.selectMode === void 0) return;
    const generation = ++this.sessionGeneration;
    const live = () => !this.disposed && this.connectionCurrent() && generation === this.sessionGeneration && id3 === this.current.currentSessionId;
    this.publish({ sessionBusy: "mode", sessionIssue: null, sessionNotice: null });
    try {
      if (!live()) return;
      const accepted = await this.unwrap(this.remote.selectMode(id3, {
        sessionId: id3,
        active,
        expectedModeRevision: session.deepwork.revision,
        expectedAdmissionEpoch: session.admissionEpoch
      }));
      if (accepted.sessionId !== id3 || accepted.deepwork?.active !== active || !accepted.deepwork.explicit) throw { kind: "assembly", code: "unavailable" };
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
    const { currentSessionId: id3, session, sessionChoice, snapshot: snapshot4 } = this.current;
    if (this.disposed || !this.connectionCurrent() || this.current.sessionUnconfirmed || id3 === null || session === null || session.refreshRequired || session.selection.refreshRequired || !writableSelectionVersion(session.selection.selectionRevision) || (modelOnly ? session.canSelectModel !== true : session.canApplyOverlay !== true || session.applyOverlayUnavailableReason === "new-session-required") || this.current.sessionBusy !== null || this.current.busy !== null || this.current.dirty || this.current.invalidFields.length > 0 || this.current.pendingEditor !== null) return;
    const selectedId = reset ? null : sessionChoice;
    const profile = snapshot4?.profiles.find((profile2) => profile2.id === selectedId), revision2 = profile?.revision;
    if (!modelOnly && selectedId !== null && (!isConfigRevision(revision2) || profile?.error !== void 0)) return;
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
    const live = () => !this.disposed && this.connectionCurrent() && generation === this.sessionGeneration && id3 === this.current.currentSessionId;
    const selectorLive = () => live() && selector !== null && selector === this.modelSelector && selectorGeneration === this.modelSelectorGeneration;
    if (!modelOnly) this.pendingSessionSelections.add(id3);
    this.publish({ sessionBusy: reset ? "reset" : "apply", sessionIssue: null, sessionNotice: null });
    try {
      if (!live()) return;
      const accepted = await this.unwrap(modelOnly ? this.remote.describeSession(id3) : this.remote.selectSession(id3, {
        sessionId: id3,
        id: selectedId,
        ...selectedId === null ? {} : { expectedRevision: revision2 },
        expectedSelectionRevision: session.selection.selectionRevision,
        expectedAdmissionEpoch: session.admissionEpoch
      }));
      if (accepted.sessionId !== id3) throw { kind: "assembly", code: "unavailable" };
      if (modelOnly && (accepted.admissionEpoch !== session.admissionEpoch || accepted.deepwork?.revision !== session.deepwork?.revision)) throw { kind: "domain", code: "conflict" };
      if (!live()) return;
      this.publish({
        session: accepted,
        sessionChoice: (accepted.admittedSelection ?? accepted.selection).selectedId,
        sessionNotice: useProfileModel || accepted.refreshRequired || accepted.selection.refreshRequired ? null : reset ? "reset" : "applied"
      });
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
      if (modelSource === null || modelSnapshot === void 0 || this.modelSelectionSessionId !== id3 || modelSource !== this.modelSelectionSource || modelSource.getSnapshot() === void 0) {
        this.publish({ sessionIssue: { kind: "assembly", code: "model-observation-unavailable", source: "profile-model" } });
        return;
      }
      if (modelGeneration !== this.modelSelectionGeneration || !Object.is(modelSnapshot, modelSource.getSnapshot())) {
        this.publish({ sessionIssue: { kind: "assembly", code: "model-choice-changed", source: "profile-model" } });
        return;
      }
      if (eventSource === null || eventSource !== this.modelEvents || this.modelEventsSessionId !== id3 || interaction === null || interaction !== this.modelInteraction || this.modelInteractionSessionId !== id3) {
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
          sessionId: id3,
          provider,
          model,
          ...reasoningEffort === void 0 ? {} : { reasoningEffort }
        }));
        if (live()) this.publish(selectorLive() && modelSource === this.modelSelectionSource && this.modelSelectionSessionId === id3 ? { sessionNotice: "applied-with-model" } : { sessionIssue: { kind: "assembly", code: "model-service-unavailable", source: "profile-model" } });
      } catch {
        if (live()) this.publish({ sessionIssue: { kind: "assembly", code: selectorLive() ? "model-selection-failed" : "model-service-unavailable", source: "profile-model" } });
      }
    } catch (error) {
      if (live()) {
        const issue = this.issue(error);
        this.publish({ sessionIssue: issue, sessionUnconfirmed: !modelOnly && (issue.kind !== "domain" || issue.code === "cancelled") });
      }
    } finally {
      if (!modelOnly) this.pendingSessionSelections.delete(id3);
      if (live()) {
        this.publish({ sessionBusy: null });
        this.refreshObservedMode();
      } else if (!modelOnly && !this.disposed && this.connectionCurrent() && id3 === this.current.currentSessionId) {
        this.modeRefreshPending = true;
        this.refreshObservedMode();
      }
    }
  }
  publish(patch) {
    if (this.disposed) return;
    this.current = { ...this.current, ...patch };
    this.syncComposerBlock();
    for (const listener of this.listeners) listener();
  }
  accept(document2) {
    this.accepted = { ...document2 };
    this.publish({ editor: { ...document2 }, dirty: false, pendingEditor: null, invalidFields: [], editorEpoch: this.current.editorEpoch + 1 });
  }
  async unwrap(request2, field) {
    const result = await request2;
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
    if (this.disposed || !this.connectionCurrent() || this.current.busy !== null || this.current.sessionBusy === "apply" || this.current.sessionBusy === "reset" || this.current.pendingEditor !== null) return;
    const generation = ++this.generation;
    const live = () => !this.disposed && this.connectionCurrent() && generation === this.generation;
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
  async open(id3) {
    if (this.disposed || this.current.busy !== null || this.current.pendingEditor !== null) return;
    if (id3 !== NEW_EDITOR && this.current.editor?.id === id3) return;
    if (this.current.dirty) {
      this.publish({ pendingEditor: id3 });
      return;
    }
    await this.loadEditor(id3);
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
  async loadEditor(id3) {
    if (id3 === NEW_EDITOR) {
      this.accepted = null;
      this.publish({ editor: { id: "new-profile", content: NEW_PROFILE_CONTENT, revision: null }, dirty: true, issue: null, notice: null, pendingEditor: null, invalidFields: [], editorEpoch: this.current.editorEpoch + 1 });
      return;
    }
    await this.perform("read", async (live) => {
      const document2 = await this.unwrap(this.remote.read(id3), "id");
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
  editId(id3) {
    const editor = this.current.editor;
    if (editor === null || editor.revision !== null || this.current.busy !== null || this.current.pendingEditor !== null) return;
    const content2 = editStructuredPath(editor.content, ["id"], id3);
    if (content2 === null) {
      this.publish({ issue: { kind: "domain", code: "validation", field: "content" }, notice: null });
      return;
    }
    this.publish({ editor: { ...editor, id: id3, content: content2 }, dirty: true, issue: null, notice: null });
  }
  editContent(content2) {
    const editor = this.current.editor;
    if (editor === null || editor.refreshRequired || this.current.busy !== null || this.current.pendingEditor !== null) return;
    this.publish({ editor: { ...editor, content: content2 }, dirty: this.accepted === null || this.accepted.content !== content2 || this.accepted.id !== editor.id, issue: null, notice: null });
  }
  editPath(path, value2) {
    const editor = this.current.editor;
    if (editor === null || editor.refreshRequired || this.current.busy !== null || this.current.pendingEditor !== null) return;
    const content2 = editStructuredPath(editor.content, path, value2);
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
    for (const [key, value2] of [["provider", provider], ["model", model], ["reasoningEffort", void 0]]) {
      content2 = editStructuredPath(content2, [...path, key], value2);
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
  sessionChooseWorkspace: "Choose a workspace to start a blank session, then choose its configuration before sending.",
  sessionSelectionBlock: "DSMM session configuration is being confirmed. Wait for selection to finish, or refresh its state.",
  sessionCommittedRefresh: "Session configuration saved. Refresh to confirm it; do not apply again.",
  sessionUnconfirmedRefresh: "Session configuration result unconfirmed. Refresh its state before selecting or sending; do not retry the change.",
  technicalDetails: "Technical details",
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
  browseZone: "Saved profiles",
  editZone: "Edit profile",
  savedRevision: "Saved version: {revision}",
  savedInventory: "Profile warnings and errors",
  futurePin: "Default selection version: {revision}",
  noEditor: "Choose a profile or create one to edit.",
  warningMarker: "Warning · nonblocking · {code} · {field}",
  blockingMarker: "Blocked · {code} · {field}",
  blankLabelWarning: "The label is blank. The profile ID is used for display; the original document can still be saved and selected.",
  diagnosticLocation: "JSONC line {line}, column {column}.",
  savedWarnings: "Saved profile warnings",
  draftWarnings: "Draft warnings",
  futureWarnings: "New-session default warnings",
  admissionWarnings: "Current-session warnings",
  warningProfile: "warning (nonblocking)",
  omitLabel: "Use ID as display name",
  businessLocale: "Default output language",
  inheritLocale: "Use deployment or native language",
  unsupportedLocale: "Unsupported language — choose an allowed value",
  localeHint: "User requests take priority. Interface language stays unchanged.",
  toolTopology: "Subagent tools",
  topologyHint: "per-role: one tool per role plus a category tool. parameterized: choose the role or category in the tool arguments.",
  levelName: "Invocation level: {level}",
  levelMode: "{level} override",
  levelUnconfigured: "Use deployment level",
  levelEffortOnly: "Reasoning effort only",
  levelFullRoute: "Provider, model and effort",
  normalLevel: "normal · default route",
  orchestratorLevels: "Invocation levels are unavailable for the main orchestrator.",
  levelsHint: "Unconfigured levels cannot be used. Effort-only keeps the configured model; a full route replaces both model and effort.",
  namedRole: "Enable {name}",
  namedRoleHint: "Required roles must stay enabled. Roles blocked by deployment settings cannot be enabled here.",
  availabilityUnknown: "Role availability is unknown. Refresh before changing it.",
  roleRequired: "Required role · {reason}",
  roleOptional: "Optional role",
  roleCeiling: "Startup: {startup}; deployment: {deployment}; captured admission: {admitted}.",
  roleProvenance: "Source: {source}; capture: {capture}.",
  roleUnavailableReason: "Availability reason: {reason}.",
  admittedRoles: "Role availability",
  bindingUnknown: "Subagent readiness is unknown. Refresh to check.",
  bindingState: "Subagent execution ready: {ready}; restart required: {restart}.",
  bindingReason: "Reason: {reason}.",
  sessionModelHint: "Selecting a profile keeps your current model. Use profile model changes it explicitly.",
  savedOnlyHint: "Save changes before selecting this profile.",
  centralOrigin: "Shared profile storage.",
  legacyOrigin: "Legacy profile storage (read-only).",
  explicitOrigin: "Custom profile storage.",
  readOnlyOrigin: "These legacy profiles are read-only.",
  headerCompactProfiles: "Profiles · keep model",
  headerCompactRefresh: "Refresh",
  headerNoSession: "Select a session to make changes.",
  sessionNewRequired: "Start a new session to change its profile. You can still save profiles and set the new-session default.",
  sessionModuleOff: "Deepwork is unavailable in this session.",
  headerModeEnable: "Enable Deepwork",
  headerModeDisable: "Disable Deepwork",
  headerModePreset: "Deepwork · DW preset",
  headerModeUnavailable: "Deepwork unavailable",
  headerModeOn: "Deepwork enabled.",
  headerModeOff: "Deepwork disabled.",
  headerUseCurrentModel: "Use profile model",
  title: "Deepwork Profiles",
  description: "Save configurations and choose a default for new sessions.",
  newSessions: "Choose a saved profile for new sessions. Existing sessions stay unchanged.",
  editorSelect: "Profile to edit",
  choose: "Choose a profile",
  newDraft: "New unsaved profile",
  new: "New profile",
  profileId: "Profile ID",
  idHint: "1–64 lowercase letters, digits, hyphens or underscores. Cannot be changed after saving.",
  configuration: "Configuration (JSONC)",
  configurationHint: "Use version: 1, the ID shown above, and settings. An optional label sets the display name.",
  structuralHint: "Permissions, accounts and plugins are managed in application settings. Never paste passwords or keys.",
  save: "Save",
  saving: "Saving…",
  apply: "Set as new-session default",
  applying: "Setting default…",
  reset: "Use default configuration",
  resetting: "Restoring default…",
  refresh: "Refresh profiles",
  refreshing: "Refreshing profiles…",
  reload: "Reload saved profile",
  loading: "Loading profiles…",
  reading: "Reading profile…",
  empty: "No saved profiles. Create one to get started.",
  baseline: "Default configuration",
  appliedProfile: "{id}",
  appliedInvalid: "Default selection is unconfirmed. Resolve the error below and refresh before changing it. Existing sessions stay unchanged.",
  selectionConflict: "The default changed elsewhere. This Host still uses the selection shown above. Select a saved profile or use default configuration to update it. Restarting adopts the stored selection.",
  dirty: "Unsaved changes. Save or discard before selecting this profile.",
  savedNotApplied: "Saved; this version is not the new-session default.",
  savedApplied: "Saved; this version is the new-session default.",
  versionObserved: "Available",
  versionAbsent: "Not saved",
  versionUnknown: "Unknown",
  savedRelationshipUnknown: "Saved; refresh to check the new-session default.",
  savedRefreshRequired: "Saved. Reload before editing or selecting again.",
  saved: "Saved {id}.",
  applied: "New sessions will use {id}. Existing sessions stay unchanged.",
  resetDone: "New sessions will use default configuration. Existing sessions stay unchanged.",
  discardPrompt: "Discard the unsaved draft before changing the editor?",
  discard: "Discard changes",
  cancel: "Cancel",
  conflict: "The saved file or selection changed elsewhere. Your draft and the prior selection were kept. Refresh profiles, then reload the saved profile or review your draft before retrying.",
  validation: "This profile is not valid. Correct the field below; your draft is unchanged.",
  io: "Could not save. Your draft is kept. Check configuration storage access and retry.",
  unavailable: "Configuration service unavailable. Your draft is kept. Reconnect and refresh.",
  transport: "Connection interrupted; the result is unconfirmed. Your draft is kept. Refresh before retrying.",
  invalidProfile: "Unavailable profile: {id}",
  details: "Error details",
  retry: "Resolve the issue shown, refresh and retry.",
  globalScope: "New-session default configuration",
  sessionScope: "Current-session configuration",
  sessionSelect: "Current-session configuration",
  globalActionHint: "Set as future default selects only the saved revision for future sessions. It does not apply to the current session.",
  headerProfile: "Profile",
  headerProfileLabel: "Current-session configuration",
  headerCaptured: "Current configuration · profile unknown",
  headerSavedUnavailable: "Saved profile unavailable",
  headerCurrentProfile: "Current profile: {profile}",
  headerRefresh: "Refresh profiles and session state",
  headerUseModelAction: "Use profile model: {profile}",
  headerLoading: "Loading profile…",
  headerApplying: "Applying profile…",
  headerApplied: "Profile applied.",
  headerBusy: "Session is busy.",
  headerUnavailable: "Profile unavailable.",
  headerDraft: "Save or discard the draft in Settings.",
  headerConflict: "The session configuration changed elsewhere. Refresh before retrying.",
  headerRefused: "Profile change unconfirmed. Check Settings.",
  headerKeepModelGroup: "Switch profile — keep current model",
  headerUseModelGroup: "Switch and use profile model",
  headerModelDefaultHint: "Normal switching preserves the current model. Explicit switch-and-use-model also saves the native model default, like the Models tab.",
  headerNoProfileModel: "No model is set for this configuration.",
  headerModelUnconfirmed: "Model change unconfirmed. Check model settings.",
  headerAppliedWithModel: "Configuration and model applied.",
  headerModelChoiceChanged: "Your newer model selection was kept.",
  headerActionUnavailable: "This action is unavailable. Refresh to check again.",
  headerActivationRefused: "Profile activation was refused. Check its configuration and native model catalog.",
  headerSelectionRefused: "The profile change could not be confirmed.",
  headerIssueCode: "Reason: {code}.",
  headerIssueField: "Configuration field: {field}.",
  headerRetryHint: "Refresh profiles and current-session state, resolve the indicated issue in Settings or native Models, then retry when the session is idle.",
  headerMaintenanceRefused: "Another session operation is in progress. Try again shortly.",
  headerBusyRefused: "The session is running. Try again when it finishes.",
  headerCancelledRefused: "Operation cancelled. Refresh to confirm the current configuration.",
  headerUnavailableRefused: "Cannot read the session configuration. Reconnect and refresh.",
  headerWaitRetryHint: "Refresh and retry when the session is ready.",
  noSession: "Select a session to change its configuration.",
  sessionUnavailable: "Cannot confirm the current session. Refresh before retrying.",
  sessionBusy: "Cannot switch: {reason}. Wait for the session to be idle, then retry.",
  sessionState: "{profile}",
  sessionBaseline: "Default configuration",
  sessionGlobalCaptured: "Current configuration (profile unknown)",
  sessionAdmittedProfile: "{id}",
  sessionFutureDefault: "New-session default configuration: {profile}.",
  sessionConflict: "The session configuration changed elsewhere. Your draft is kept. Refresh before retrying.",
  sessionApply: "Use this profile",
  sessionApplying: "Applying…",
  sessionReset: "Use default configuration",
  sessionResetting: "Restoring default…",
  sessionRefresh: "Refresh session state",
  sessionApplied: "Applied to this session only. New-session default and existing children stay unchanged.",
  sessionResetDone: "This session uses default configuration. New-session default stays unchanged.",
  sessionAppliedWithModel: "Applied this session profile and explicitly selected its native main model. Native model-default persistence follows the Models tab; the global profile default was not changed.",
  sessionDirty: "Save or explicitly discard the editor draft before applying a current-session choice.",
  roleState: "Admitted route {route}; strategy {strategy}; retries {retries}; rate-limit failures {failures}; switches {switches}; total delay {delay} ms.",
  catalogTitle: "Model catalog",
  catalogHint: "You can enter models that are not listed.",
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
  profileDefaults: "Configuration defaults",
  roleSelect: "Agent role to edit",
  rolesUnavailable: "Role list unavailable. Refresh or use the advanced editor.",
  roleEnabled: "Enabled in application settings",
  roleDisabled: "Disabled in application settings",
  strategy: "{name} strategy",
  inheritStrategy: "Inherit ({value})",
  startupLock: "Keep the starting route",
  rateFallback: "Switch after repeated rate limits",
  strategyHint: "Model switches require a rate-limit failure with no output. Authentication and quota errors stop the attempt. Leave numbers blank to inherit; zero is explicit.",
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
  rawInvalid: "Correct the invalid draft in Advanced JSONC to use these controls. Your draft is kept.",
  invalidNumber: "Enter a whole number within the limits before saving or changing roles."
};
var zh = {
  sessionChooseWorkspace: "请先选择工作区创建空白会话，再选择本次配置后发送。",
  sessionSelectionBlock: "正在确认 DSMM 本次会话配置。请等待选择完成，或刷新会话状态。",
  sessionCommittedRefresh: "本次会话配置已保存，请刷新确认，不要再次应用。",
  sessionUnconfirmedRefresh: "本次会话配置结果待确认。请刷新状态后再选择或发送，不要重试更改。",
  technicalDetails: "技术详情",
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
  browseZone: "已保存配置",
  editZone: "编辑配置",
  savedRevision: "保存版本：{revision}",
  savedInventory: "配置警告与错误",
  futurePin: "默认选择版本：{revision}",
  noEditor: "选择配置或新建配置后编辑。",
  warningMarker: "警告 · 不阻断 · {code} · {field}",
  blockingMarker: "已阻断 · {code} · {field}",
  blankLabelWarning: "显示名称为空，使用配置档 ID 显示。原文仍可保存和选择。",
  diagnosticLocation: "JSONC 第 {line} 行，第 {column} 列。",
  savedWarnings: "已保存配置的警告",
  draftWarnings: "草稿警告",
  futureWarnings: "新会话默认配置的警告",
  admissionWarnings: "本次会话的警告",
  warningProfile: "警告（不阻断）",
  omitLabel: "使用 ID 作为显示名称",
  businessLocale: "默认输出语言",
  inheritLocale: "使用部署或原生语言",
  unsupportedLocale: "语言不受支持，请选择允许值",
  localeHint: "用户明确要求的语言优先，界面语言不变。",
  toolTopology: "子代理工具",
  topologyHint: "per-role：每个角色一个工具，另有类别工具。parameterized：通过工具参数选择角色或类别。",
  levelName: "调用等级：{level}",
  levelMode: "{level} 覆盖",
  levelUnconfigured: "使用部署等级",
  levelEffortOnly: "仅推理强度",
  levelFullRoute: "提供商、模型与强度",
  normalLevel: "normal · 默认路由",
  orchestratorLevels: "主 orchestrator 不支持调用等级。",
  levelsHint: "未配置的等级不可使用。仅强度覆盖保留配置中的模型；完整路由同时替换模型和强度。",
  namedRole: "启用 {name}",
  namedRoleHint: "必需角色必须保持启用；部署设置禁止的角色无法在此启用。",
  availabilityUnknown: "角色可用性未知，请刷新后再更改。",
  roleRequired: "必需角色 · {reason}",
  roleOptional: "可选角色",
  roleCeiling: "启动：{startup}；部署：{deployment}；捕获准入：{admitted}。",
  roleProvenance: "来源：{source}；捕获：{capture}。",
  roleUnavailableReason: "可用性原因：{reason}。",
  admittedRoles: "角色可用性",
  bindingUnknown: "子代理就绪状态未知，请刷新确认。",
  bindingState: "子代理执行就绪：{ready}；需重启：{restart}。",
  bindingReason: "原因：{reason}。",
  sessionModelHint: "选择配置时保留当前模型；「使用配置中的模型」会明确切换模型。",
  savedOnlyHint: "选择此配置前请保存更改。",
  centralOrigin: "共享配置存储。",
  legacyOrigin: "旧配置存储（只读）。",
  explicitOrigin: "自定义配置存储。",
  readOnlyOrigin: "这些旧配置只读。",
  headerCompactProfiles: "配置档 · 保留模型",
  headerCompactRefresh: "刷新",
  headerNoSession: "选择会话后可更改。",
  sessionNewRequired: "请新建会话后选择配置。仍可保存配置或设置新会话默认配置。",
  sessionModuleOff: "此会话无法使用 Deepwork。",
  headerModeEnable: "启用 Deepwork",
  headerModeDisable: "关闭 Deepwork",
  headerModePreset: "Deepwork · DW 预设",
  headerModeUnavailable: "Deepwork 不可用",
  headerModeOn: "Deepwork 已启用。",
  headerModeOff: "Deepwork 已关闭。",
  headerUseCurrentModel: "使用配置中的模型",
  title: "Deepwork 配置",
  description: "保存配置并选择新会话的默认配置。",
  newSessions: "选择已保存的配置供新会话使用，已有会话不变。",
  editorSelect: "要编辑的配置",
  choose: "选择配置",
  newDraft: "未保存的新配置",
  new: "新建配置",
  profileId: "配置 ID",
  idHint: "1–64 个小写字母、数字、连字符或下划线，保存后不可修改。",
  configuration: "配置内容（JSONC）",
  configurationHint: "使用 version: 1、与上方一致的 id，以及 settings；label 可填写显示名称。",
  structuralHint: "权限、账户、插件等由应用设置管理。请勿粘贴密码或密钥。",
  save: "保存",
  saving: "正在保存…",
  apply: "设为新会话默认配置",
  applying: "正在设置默认配置…",
  reset: "使用默认配置",
  resetting: "正在恢复默认配置…",
  refresh: "刷新配置",
  refreshing: "正在刷新…",
  reload: "重新加载已保存配置",
  loading: "正在加载…",
  reading: "正在读取…",
  empty: "尚无已保存的配置，请先新建配置。",
  baseline: "默认配置",
  appliedProfile: "{id}",
  appliedInvalid: "默认选择未确认，请解决下方错误并刷新后再更改。已有会话不变。",
  selectionConflict: "默认选择已在其他位置改变，此宿主仍使用上方选择。请选择已保存的配置或使用默认配置进行更新；重启将采用存储中的选择。",
  dirty: "有未保存的更改，选择此配置前请保存或丢弃。",
  savedNotApplied: "已保存，此版本尚未设为新会话默认配置。",
  savedApplied: "已保存，此版本已设为新会话默认配置。",
  versionObserved: "可用",
  versionAbsent: "未保存",
  versionUnknown: "未知",
  savedRelationshipUnknown: "已保存，请刷新确认新会话默认配置。",
  savedRefreshRequired: "已保存，请重新加载后再编辑或选择。",
  saved: "已保存 {id}。",
  applied: "新会话将使用 {id}，已有会话不变。",
  resetDone: "新会话将使用默认配置，已有会话不变。",
  discardPrompt: "切换编辑器之前，是否丢弃未保存的草稿？",
  discard: "丢弃更改",
  cancel: "取消",
  conflict: "已保存文件或选择已被其他操作修改。草稿和原选择已保留。请刷新配置档，然后重新加载已保存配置档或检查草稿后重试。",
  validation: "此配置档无效。请修正下方字段；草稿未改变。",
  io: "无法保存。草稿已保留，请检查配置存储权限后重试。",
  unavailable: "配置服务暂不可用。草稿已保留，请重新连接后刷新。",
  transport: "连接中断，操作结果待确认。草稿已保留，请先刷新状态。",
  invalidProfile: "配置不可用：{id}",
  details: "错误详情",
  retry: "请处理所示问题，刷新后重试。",
  globalScope: "新会话默认配置",
  sessionScope: "本次会话配置",
  sessionSelect: "本次会话配置",
  globalActionHint: "「设为未来默认」只为未来会话选择已保存修订，不应用到当前会话。",
  headerProfile: "配置",
  headerProfileLabel: "本次会话配置",
  headerCaptured: "当前配置 · 来源未知",
  headerSavedUnavailable: "已保存的配置不可用",
  headerCurrentProfile: "本次配置：{profile}",
  headerRefresh: "刷新配置和会话状态",
  headerUseModelAction: "使用配置中的模型：{profile}",
  headerLoading: "加载配置…",
  headerApplying: "应用配置…",
  headerApplied: "配置已应用。",
  headerBusy: "会话忙碌。",
  headerUnavailable: "配置不可用。",
  headerDraft: "请在设置中保存或丢弃草稿。",
  headerConflict: "会话配置已在其他位置改变，请刷新后重试。",
  headerRefused: "配置更改未确认，请检查设置。",
  headerKeepModelGroup: "切换配置，保留当前模型",
  headerUseModelGroup: "切换配置和模型",
  headerModelDefaultHint: "使用配置中的模型也会更新默认模型。",
  headerNoProfileModel: "此配置未指定模型。",
  headerModelUnconfirmed: "模型更改尚未确认，请检查模型设置。",
  headerAppliedWithModel: "配置和模型已应用。",
  headerModelChoiceChanged: "已保留你最新选择的模型。",
  headerActionUnavailable: "此操作暂不可用，请刷新确认。",
  headerActivationRefused: "配置档启用被拒绝，请检查其配置和原生模型目录。",
  headerSelectionRefused: "无法确认配置档更改。",
  headerIssueCode: "原因：{code}。",
  headerIssueField: "配置字段：{field}。",
  headerRetryHint: "请刷新配置档和当前会话状态，在设置或原生模型页解决所示问题，然后在会话空闲时重试。",
  headerMaintenanceRefused: "会话正在处理其他操作，请稍后重试。",
  headerBusyRefused: "会话正在运行，请结束后重试。",
  headerCancelledRefused: "操作已取消，请刷新以确认当前配置。",
  headerUnavailableRefused: "无法读取会话配置，请重新连接后刷新。",
  headerWaitRetryHint: "请稍后刷新并重试。",
  noSession: "选择会话后可更改配置。",
  sessionUnavailable: "无法确认当前会话，请刷新后重试。",
  sessionBusy: "暂不可切换：{reason}。请等待会话空闲后重试。",
  sessionState: "{profile}",
  sessionBaseline: "默认配置",
  sessionGlobalCaptured: "当前配置（来源未知）",
  sessionAdmittedProfile: "{id}",
  sessionFutureDefault: "新会话默认配置：{profile}。",
  sessionConflict: "会话配置已在其他位置改变，草稿已保留。请刷新后重试。",
  sessionApply: "使用此配置",
  sessionApplying: "正在应用…",
  sessionReset: "使用默认配置",
  sessionResetting: "正在恢复默认配置…",
  sessionRefresh: "刷新会话状态",
  sessionApplied: "已应用到本次会话，新会话默认配置和已有子会话不变。",
  sessionResetDone: "本次会话已使用默认配置，新会话默认配置不变。",
  sessionDirty: "选择本次会话配置前，请保存或丢弃草稿。",
  sessionAppliedWithModel: "已应用此会话配置档，并明确选择其原生主模型。模型默认值像模型页一样保存；全局配置档默认值未改变。",
  roleState: "准入路由 {route}；策略 {strategy}；重试 {retries}；限流失败 {failures}；切换 {switches}；累计延迟 {delay} 毫秒。",
  catalogTitle: "模型目录",
  catalogHint: "可手动输入目录中未列出的模型。",
  catalogUnavailable: "模型目录不可用，可手动输入提供商、模型和推理强度。",
  catalogRefresh: "刷新模型目录",
  catalogRefreshing: "正在刷新模型目录…",
  catalogFailure: "提供商目录不可用：{name}（{id}）。",
  profileLabel: "配置名称",
  defaultActive: "默认 Deepwork 模式",
  activeHint: "会话中明确选择的模式优先。",
  enabled: "启用",
  disabled: "禁用",
  inherit: "使用上层设置",
  profileDefaults: "配置默认值",
  roleSelect: "要编辑的角色",
  rolesUnavailable: "角色列表暂不可用，请刷新或使用高级编辑器。",
  roleEnabled: "应用设置已启用",
  roleDisabled: "应用设置已禁用",
  strategy: "{name} 策略",
  inheritStrategy: "继承（{value}）",
  startupLock: "保留起始路由",
  rateFallback: "多次限流后切换",
  strategyHint: "仅在限流且没有输出时切换模型；认证或配额错误会停止尝试。数字留空表示继承，零为明确值。",
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
  effortChangeHint: "更改提供商或模型会清除该路由的推理强度，需要时请重新选择。",
  advanced: "高级 JSONC",
  rawInvalid: "请在高级 JSONC 中修正草稿后使用这些控件，草稿已保留。",
  invalidNumber: "保存或切换角色前，请输入范围内的整数。"
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
function roleAvailability(value2) {
  if (value2 === void 0) return void 0;
  try {
    return parseRoleAvailability(value2);
  } catch {
    return void 0;
  }
}
function RoleAvailability({ value: value2, t }) {
  const state = roleAvailability(value2);
  if (state === void 0) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsmm-hint", children: t("availabilityUnknown") });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsmm-availability", "data-dsmm-role-availability": state.id, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t(state.required ? "roleRequired" : "roleOptional", { reason: state.requiredReason ?? "—" }) }),
    state.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t("roleUnavailableReason", { reason: state.reason }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("details", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("summary", { children: t("technicalDetails") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t("roleCeiling", { startup: t(state.startupAvailable ? "enabled" : "disabled"), deployment: t(state.deploymentEnabled ? "enabled" : "disabled"), admitted: t(state.admitted ? "enabled" : "disabled") }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsmm-hint", children: t("roleProvenance", { source: state.source, capture: state.capture }) })
    ] })
  ] });
}

// src/client/EditableChoice.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime3 = require("react/jsx-runtime");
function EditableChoice({ id: id3, label, value: value2, options, disabled, placeholder, onChange, onSelect }) {
  const input = (0, import_react.useRef)(null);
  const [open, setOpen] = (0, import_react.useState)(false);
  const [activeId, setActiveId] = (0, import_react.useState)(null);
  const distinct = new Map(options.map((option) => [option.id, option]));
  if (value2 !== "" && !distinct.has(value2)) distinct.set(value2, { id: value2, name: value2 });
  const choices = [...distinct.values()];
  const activeIndex = choices.findIndex((option) => option.id === activeId);
  const visible = open && !disabled && choices.length > 0;
  const close = () => {
    setOpen(false);
    setActiveId(null);
  };
  const choose = (next) => {
    if (next !== value2) (onSelect ?? onChange)(next);
    close();
  };
  (0, import_react.useEffect)(() => {
    if (disabled) close();
  }, [disabled]);
  (0, import_react.useEffect)(() => {
    if (activeId !== null && activeIndex < 0) setActiveId(null);
  }, [activeId, activeIndex]);
  (0, import_react.useEffect)(() => {
    if (visible && activeIndex >= 0) document.getElementById(`${id3}-choice-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [id3, visible, activeIndex]);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-choice", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives.Input,
      {
        ref: input,
        id: id3,
        className: "dsmm-input",
        role: "combobox",
        "aria-autocomplete": "list",
        "aria-expanded": visible,
        "aria-controls": visible ? `${id3}-choices` : void 0,
        "aria-activedescendant": visible && activeIndex >= 0 ? `${id3}-choice-${activeIndex}` : void 0,
        value: value2,
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
    visible && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { className: "dsmm-choice-list", id: `${id3}-choices`, role: "listbox", "aria-label": label, children: choices.map((option, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "li",
      {
        id: `${id3}-choice-${index}`,
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
function RetryNumber({ id: id3, name, field, value: value2, inherited, path, disabled, actions: actions2, t }) {
  const [draft2, setDraft] = (0, import_react2.useState)(value2 === void 0 ? "" : String(value2));
  const [invalid3, setInvalid] = (0, import_react2.useState)(false);
  const [min, max] = DSMM_RATE_LIMIT_BOUNDS[field];
  const key = path.join(".");
  (0, import_react2.useEffect)(() => {
    setDraft(value2 === void 0 ? "" : String(value2));
    setInvalid(false);
  }, [value2]);
  (0, import_react2.useEffect)(() => {
    actions2.setFieldInvalid(key, invalid3);
    return () => actions2.setFieldInvalid(key, false);
  }, [actions2.setFieldInvalid, key, invalid3]);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: id3, children: t("retryField", { name, field: t(RETRY_FIELD_LABEL_KEYS[field]) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      import_dsh_client_ui_primitives2.Input,
      {
        id: id3,
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
        "aria-invalid": invalid3 || void 0,
        "aria-describedby": `${id3}-hint${invalid3 ? ` ${id3}-invalid` : ""}`,
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
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", id: `${id3}-hint`, children: t("retryBounds", { min, max, value: inherited ?? t("unknownDefault") }) }),
    invalid3 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { id: `${id3}-invalid`, children: t("invalidNumber") })
  ] });
}
function RouteFields({ value: value2, path, name, catalog, disabled, edit, editRoute, t }) {
  const prefix = (0, import_react2.useId)();
  const providers = catalog?.groups ?? [];
  const group = providers.find((candidate2) => candidate2.id === value2.provider);
  const model = group?.models.find((candidate2) => candidate2.id === value2.model);
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
          value: value2.provider,
          options: providers,
          disabled,
          onChange: (provider) => updateModel(provider, value2.model),
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
          value: value2.model,
          options: group?.models ?? [],
          disabled,
          onChange: (modelId) => updateModel(value2.provider, modelId)
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
          value: value2.reasoningEffort ?? "",
          options: efforts,
          disabled,
          placeholder: t("effortDefault"),
          onChange: (effort) => edit([...path, "reasoningEffort"], effort || void 0)
        }
      )
    ] })
  ] });
}
function PolicyFields({ value: value2, inherited, path, name, disabled, actions: actions2, t }) {
  const prefix = (0, import_react2.useId)();
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-policy-fields", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-strategy`, children: t("strategy", { name }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { id: `${prefix}-strategy`, disabled, value: value2.strategy ?? "", onChange: (event) => actions2.editPath([...path, "strategy"], event.currentTarget.value || void 0), children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "", children: t("inheritStrategy", { value: inherited?.strategy ?? t("unknownDefault") }) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "startup-lock", children: t("startupLock") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "rate-limit-fallback", children: t("rateFallback") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", children: t("strategyHint") }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsmm-route-fields", children: Object.keys(DSMM_RATE_LIMIT_BOUNDS).map((field) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RetryNumber, { id: `${prefix}-${field}`, t, name, field, value: value2.rateLimit?.[field], inherited: inherited?.rateLimit[field], path: [...path, "rateLimit", field], disabled, actions: actions2 }, field)) })
  ] });
}
function LevelFields({ level: level2, value: value2, path, catalog, disabled, actions: actions2, t }) {
  const prefix = (0, import_react2.useId)();
  const mode = value2 === void 0 ? "inherit" : value2.provider === void 0 ? "effort" : "route";
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
          value: value2?.reasoningEffort ?? "",
          options: [],
          disabled,
          onChange: (effort) => actions2.editPath([...path, "reasoningEffort"], effort)
        }
      )
    ] }),
    value2?.provider !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RouteFields, { value: value2, path, name: t("levelName", { level: level2 }), catalog, disabled, edit: actions2.editPath, editRoute: actions2.editRoute, t })
  ] });
}
function StructuredEditor({ state, actions: actions2, disabled, t }) {
  const prefix = (0, import_react2.useId)();
  const [selectedRole, setSelectedRole] = (0, import_react2.useState)("dsmm-orchestrator");
  const document2 = state.editor === null ? null : structuredDocument(state.editor.content);
  if (document2 === null) return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", "data-dsmm-structured-invalid": true, children: t("rawInvalid") });
  const roles2 = state.snapshot?.roles ?? [];
  const role3 = roles2.find((candidate2) => candidate2.id === selectedRole) ?? roles2[0];
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
        roles2.map((candidate2) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("option", { value: candidate2.id, children: [
          candidate2.label,
          candidate2.enabled ? "" : ` — ${t("roleDisabled")}`
        ] }, candidate2.id))
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
      policy.fallbackRoutes?.map((candidate2, index) => {
        const name = t("fallbackName", { name: role3.label, index: index + 1 });
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("fieldset", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("legend", { children: name }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RouteFields, { t, value: candidate2, path: [...rolePath, "fallbackRoutes", index], name, catalog: state.catalog, disabled, edit: actions2.editPath, editRoute: actions2.editRoute }),
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
      return t("headerActionUnavailable");
  }
}
function menuIssue(issue) {
  const code2 = MENU_ISSUE_CODES.has(issue.code) ? issue.code : issue.kind === "transport" ? "transport" : "unavailable";
  const field = issue.field;
  return { code: code2, ...isSafeDiagnosticField(field) ? { field } : {} };
}
function SessionScope({ state, actions: actions2, t, compact = false }) {
  const prefix = (0, import_react3.useId)();
  const session = state.session;
  const labels = session === null ? null : sessionProfileLabels(session, t);
  const selected = state.snapshot?.profiles.find((profile) => profile.id === state.sessionChoice);
  const disabled = state.busy !== null || state.pendingEditor !== null || state.sessionBusy !== null || state.dirty || state.invalidFields.length > 0;
  const current2 = () => {
    const live = actions2.readProfileView();
    return live.currentSessionId === state.currentSessionId && live.sessionViewEpoch === state.sessionViewEpoch && live.session === session;
  };
  const ready = session !== null && !state.sessionUnconfirmed && !session.refreshRequired && !session.selection.refreshRequired && writableSelectionVersion(session.selection.selectionRevision);
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
    state.currentSessionId === null ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("sessionChooseWorkspace") }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
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
          if (current2()) actions2.chooseSessionProfile(event.currentTarget.value || null);
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: t("sessionBaseline") }),
          state.sessionChoice !== null && selected === void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: state.sessionChoice, children: state.sessionChoice }),
          state.snapshot?.profiles.map((profile) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("option", { value: profile.id, disabled: !isConfigRevision(profile.revision) || profile.error !== void 0, children: [
            profile.label?.trim() || profile.id,
            profileWarnings(profile.warnings).length ? ` — ${t("warningProfile")}` : ""
          ] }, profile.id))
        ] })
      ] }),
      !compact && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("sessionModelHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled: disabled || !modelAllowed, "aria-describedby": !modelAllowed ? `${prefix}-model-reason` : void 0, onClick: () => {
          if (current2()) void actions2.useSessionProfileModel();
        }, children: t("headerUseCurrentModel") }),
        !modelAllowed && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", id: `${prefix}-model-reason`, children: capabilityReason(session?.selectModelUnavailableReason, t) }),
        session !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("summary", { children: t("technicalDetails") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-availability", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: binding === void 0 ? t("bindingUnknown") : t("bindingState", { binding: binding.binding, ready: t(binding.deliveryFenceReady ? "enabled" : "disabled"), restart: t(binding.restartRequired ? "enabled" : "disabled") }) }),
            binding?.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("bindingReason", { reason: binding.reason }) })
          ] }),
          session.roles !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("summary", { children: t("admittedRoles") }),
            session.roles.map((role3) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-availability", children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: role3.id }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(RoleAvailability, { value: role3, t })
            ] }, role3.id))
          ] }),
          session.rolePolicy !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { "data-dsmm-session-policy": true, children: t("roleState", { route: session.rolePolicy.route === void 0 ? t("inheritRoute") : `${session.rolePolicy.route.provider}/${session.rolePolicy.route.model}${session.rolePolicy.route.reasoningEffort === void 0 ? "" : ` (${session.rolePolicy.route.reasoningEffort})`}`, strategy: session.rolePolicy.strategy, retries: session.rolePolicy.retries, failures: session.rolePolicy.rateLimitFailures, switches: session.rolePolicy.switches, delay: session.rolePolicy.totalDelayMs }) })
        ] })
      ] }),
      state.dirty && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("sessionDirty") }),
      (session?.refreshRequired || session?.selection.refreshRequired) && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "status", children: t("sessionCommittedRefresh") }),
      state.sessionUnconfirmed && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "status", children: t("sessionUnconfirmedRefresh") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled: disabled || !allowed || state.sessionChoice !== null && !isConfigRevision(selected?.revision), "aria-describedby": !allowed ? `${prefix}-overlay-reason` : void 0, onClick: () => {
          if (current2()) void actions2.applySession();
        }, children: t(state.sessionBusy === "apply" ? "sessionApplying" : "sessionApply") }),
        !compact && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled: disabled || !allowed, "aria-describedby": !allowed ? `${prefix}-overlay-reason` : void 0, onClick: () => {
          if (current2()) void actions2.resetSession();
        }, children: t(state.sessionBusy === "reset" ? "sessionResetting" : "sessionReset") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled: state.sessionBusy !== null || state.busy !== null || state.pendingEditor !== null, onClick: () => {
          if (current2()) void actions2.refreshSession();
        }, children: t("sessionRefresh") })
      ] })
    ] }),
    state.sessionIssue !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "alert", children: state.sessionIssue.source === "profile-model" ? t(state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed") : state.sessionIssue.code === "conflict" ? t("sessionConflict") : ["busy", "maintenance", "disposed", "not-owned"].includes(state.sessionIssue.code) ? t("sessionBusy", { reason: state.sessionIssue.code }) : t(state.sessionIssue.code === "validation" ? "validation" : "sessionUnavailable") }),
    state.sessionIssue !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(IssueDetails, { issue: state.sessionIssue, t }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", "aria-atomic": "true", children: state.sessionBusy === "read" ? t("reading") : status })
  ] });
}
function SessionProfiles(props) {
  const prefix = (0, import_react3.useId)();
  const state = props.useProfiles((snapshot4) => snapshot4);
  const id3 = state.currentSessionId;
  const [openFor, setOpenFor] = (0, import_react3.useState)(void 0);
  (0, import_react3.useEffect)(() => {
    setOpenFor(void 0);
  }, [id3]);
  if (props.sessionId !== void 0 && props.sessionId !== id3) return null;
  const { t } = props;
  const session = state.session;
  const admission = session?.admittedSelection;
  const unknownCaptured = session !== null && admission === void 0;
  const current2 = session === null ? "__dsmm_session_unavailable__" : unknownCaptured ? "__dsmm_captured_default__" : admission?.selectedId ?? "";
  const profiles = state.snapshot?.profiles ?? [];
  const currentSaved = profiles.find((profile) => profile.id === current2);
  const committing = state.sessionBusy !== null;
  const unavailable = id3 === null || committing || state.busy !== null || state.sessionUnconfirmed || session === null || session.refreshRequired === true || session.selection.refreshRequired === true;
  const profileDisabled = unavailable || state.pendingEditor !== null || state.dirty || state.invalidFields.length > 0 || session === null || !writableSelectionVersion(session.selection.selectionRevision);
  const disabled = profileDisabled || session?.canApplyOverlay !== true || session?.applyOverlayUnavailableReason === "new-session-required" || state.snapshot === null;
  let feedback = "";
  if (state.sessionUnconfirmed) feedback = t("sessionUnconfirmedRefresh");
  else if (session?.refreshRequired || session?.selection.refreshRequired) feedback = t("sessionCommittedRefresh");
  else if (state.sessionIssue !== null) feedback = t(state.sessionIssue.source === "profile-model" ? state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed" : state.sessionIssue.code === "conflict" ? "headerConflict" : state.sessionIssue.code === "activation" ? "headerActivationRefused" : state.sessionIssue.code === "maintenance" ? "headerMaintenanceRefused" : state.sessionIssue.code === "busy" ? "headerBusyRefused" : state.sessionIssue.code === "cancelled" ? "headerCancelledRefused" : state.sessionIssue.code === "unavailable" || state.sessionIssue.kind === "assembly" ? "headerUnavailableRefused" : "headerSelectionRefused");
  else if (committing || state.busy !== null) feedback = t(state.sessionBusy === "apply" || state.sessionBusy === "reset" ? "headerApplying" : "headerLoading");
  else if (state.dirty || state.invalidFields.length > 0 || state.pendingEditor !== null) feedback = t("headerDraft");
  else if (id3 === null) feedback = t("sessionChooseWorkspace");
  else if (session === null || state.snapshot === null) feedback = t("headerUnavailable");
  else if (state.sessionNotice !== null) feedback = t(state.sessionNotice === "mode-on" ? "headerModeOn" : state.sessionNotice === "mode-off" ? "headerModeOff" : state.sessionNotice === "applied-with-model" ? "headerAppliedWithModel" : "headerApplied");
  const profileName = unknownCaptured ? t("headerCaptured") : admission !== void 0 && sourceRelationship(admission, currentSaved?.revision) === "current" && currentSaved?.label?.trim() ? currentSaved.label : admission?.selectedId ?? t("sessionBaseline");
  const currentLabel = t("headerCurrentProfile", { profile: session === null ? t("headerUnavailable") : profileName });
  const entries = [{ type: "label", id: "@current", text: currentLabel }];
  for (const warning of profileWarnings(session?.warnings)) entries.push({ type: "label", id: `@warning:${warning.code}`, text: t("warningMarker", { code: warning.code, field: warning.field }) });
  if ((id3 === null || session?.canApplyOverlay === true) && state.snapshot !== null) entries.push({ type: "label", id: "@future", text: t("sessionFutureDefault", { profile: state.snapshot.profiles.find((profile) => profile.id === state.snapshot.selectedId)?.label?.trim() || state.snapshot.selectedId || t("sessionBaseline") }) });
  if (feedback !== "" && (state.sessionNotice === null || state.sessionIssue !== null || state.sessionUnconfirmed || session?.refreshRequired || session?.selection.refreshRequired)) entries.push({ type: "label", id: "@status", text: feedback });
  const mode = session?.deepwork;
  entries.push({
    id: "@mode",
    label: t(mode === void 0 ? "headerModeUnavailable" : mode.locked ? "headerModePreset" : mode.active ? "headerModeDisable" : "headerModeEnable"),
    disabled: unavailable || session?.canToggleMode !== true || mode === void 0 || mode.locked
  });
  if (session !== null && session.canToggleMode !== true) entries.push({ type: "label", id: "@mode-reason", text: capabilityReason(session.toggleModeUnavailableReason, t) });
  const diagnostic2 = state.sessionIssue === null ? null : menuIssue(state.sessionIssue);
  const diagnosticText = diagnostic2 === null ? "" : t("headerIssueCode", { code: diagnostic2.code }) + (diagnostic2.field === void 0 ? "" : ` ${t("headerIssueField", { field: diagnostic2.field })}`);
  const retryHint = t(state.sessionUnconfirmed ? "sessionUnconfirmedRefresh" : diagnostic2?.code === "maintenance" || diagnostic2?.code === "busy" ? "headerWaitRetryHint" : "headerRetryHint");
  if (diagnostic2 !== null) entries.push({ type: "label", id: "@diagnostic", text: diagnosticText }, { type: "label", id: "@retry", text: retryHint });
  if (admission?.selectedId != null && currentSaved === void 0) entries.push({ id: admission.selectedId, label: `${admission.selectedId} — ${t("headerSavedUnavailable")}`, disabled: true });
  if (unknownCaptured) entries.push({ id: "__dsmm_captured_default__", label: t("headerCaptured"), disabled: true });
  entries.push({ type: "separator", id: "@keep-separator" }, { type: "label", id: "@keep-heading", text: t("headerCompactProfiles") }, { id: "", label: t("sessionBaseline"), disabled });
  if (session !== null && (session.canApplyOverlay !== true || session.applyOverlayUnavailableReason === "new-session-required")) entries.push({ type: "label", id: "@overlay-reason", text: capabilityReason(session.applyOverlayUnavailableReason, t) });
  for (const profile of profiles) entries.push({ id: profile.id, label: (profile.label?.trim() ? profile.label : profile.id) + (profile.error === void 0 && isConfigRevision(profile.revision) ? "" : ` — ${t("headerSavedUnavailable")}`) + (profileWarnings(profile.warnings).length ? ` — ${t("warningProfile")}` : ""), disabled: disabled || !isConfigRevision(profile.revision) || profile.error !== void 0 });
  entries.push({ type: "separator", id: "@model-separator" }, { id: "@use-model", label: t("headerUseCurrentModel"), disabled: profileDisabled || session?.canSelectModel !== true || session?.profileModel === void 0 });
  if (session !== null && session.canSelectModel !== true) entries.push({ type: "label", id: "@model-reason", text: capabilityReason(session.selectModelUnavailableReason, t) });
  const open = openFor === id3;
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
        selectedId: current2,
        footer: [{ id: "@refresh", label: t("headerCompactRefresh"), disabled: committing || state.busy !== null }],
        anchor: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", size: "sm", variant: "toolbar", className: "dsmm-profile-trigger", icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.IconBranchOutlineRegular, {}), "aria-label": t("headerProfileLabel"), "aria-haspopup": "menu", "aria-expanded": open, "aria-describedby": `${prefix}-feedback`, onClick: () => setOpenFor(open ? void 0 : id3) }),
        onClose: () => setOpenFor(void 0),
        onSelect: (value2) => {
          const live = props.readProfileView();
          if (live.currentSessionId !== id3 || live.sessionViewEpoch !== state.sessionViewEpoch || live.session !== session) return;
          if (value2 === "@refresh") {
            if (committing || state.busy !== null) return;
            void (async () => {
              await props.refresh();
              if (id3 !== null && props.readProfileView().currentSessionId === id3 && props.readProfileView().sessionViewEpoch === state.sessionViewEpoch) await props.refreshSession();
            })();
          } else {
            const row2 = entries.find((entry) => entry.id === value2 && !("type" in entry));
            if (row2 === void 0 || !("disabled" in row2) || row2.disabled) return;
            if (value2 === "@mode") {
              if (mode !== void 0) void props.setDeepwork(!mode.active);
            } else if (value2 === "@use-model") void props.useSessionProfileModel();
            else {
              props.chooseSessionProfile(value2 || null);
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
  const invalid3 = state.issue?.kind === "domain" && state.issue.code === "validation";
  const idInvalid = invalid3 && state.issue?.field === "id" && state.issue.location === void 0 && editor?.revision === null && !editorDisabled;
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
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { className: "dsmm-profiles", "aria-label": t("title"), "aria-busy": state.busy !== null, children: [
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
      snapshot4 !== null && snapshot4.profiles.some((profile) => profile.error !== void 0 || profile.warnings?.length) && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("ul", { className: "dsmm-profile-list", "aria-label": t("savedInventory"), children: snapshot4.profiles.filter((profile) => profile.error !== void 0 || profile.warnings?.length).map((profile, index) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: profile.label?.trim() ? `${profile.label} (${profile.id})` : profile.id }),
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
          state.catalogUnavailable && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("catalogUnavailable") }),
          state.catalog?.failures.map((failure2) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("catalogFailure", { name: failure2.name, id: failure2.id }) }, failure2.id)),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { type: "button", variant: "outline", disabled: state.catalogBusy, onClick: () => {
            void props.refreshCatalog();
          }, children: t(state.catalogBusy ? "catalogRefreshing" : "catalogRefresh") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(StructuredEditor, { state, actions: props, disabled: editorDisabled, t }, `structured:${state.editorEpoch}`),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { ref: advancedRef, className: "dsmm-advanced", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("summary", { children: t("advanced") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { htmlFor: `${prefix}-content`, children: t("configuration") }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("textarea", { ref: editorRef, id: `${prefix}-content`, rows: 12, spellCheck: false, value: editor.content, readOnly, disabled: editorDisabled, "aria-invalid": rawInvalid || invalid3 && !idInvalid || void 0, "aria-describedby": `${prefix}-content-hint ${prefix}-structural-hint${invalid3 && !idInvalid ? ` ${prefix}-issue` : ""}`, onChange: (event) => props.editContent(event.currentTarget.value) }),
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
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { id: `${prefix}-global-action`, className: "dsmm-hint", children: t("newSessions") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { "data-dsmm-selection": true, children: selection }),
      snapshot4?.refreshRequired && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { role: "status", children: t("savedRefreshRequired") }),
      snapshot4?.selectedWarnings?.length ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: t("futureWarnings") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ProfileWarnings, { warnings: snapshot4.selectedWarnings, t })
      ] }) : null,
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
function record2(value2) {
  return value2 !== null && typeof value2 === "object" && !Array.isArray(value2);
}
function scopeSchema(snapshot4, layer) {
  return layer === "profile" ? snapshot4.nativeSchema ?? snapshot4.schema : snapshot4.schema;
}
function at(value2, path) {
  return path.reduce((node, key) => record2(node) && Object.hasOwn(node, key) ? node[key] : void 0, value2);
}
function equal(a, b) {
  if (record2(a) && record2(b)) return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value2, i) => equal(value2, b[i]));
  return a === b;
}
function mergeLayer(base, override) {
  if (!record2(base) || !record2(override)) return override;
  return Object.fromEntries([.../* @__PURE__ */ new Set([...Object.keys(base), ...Object.keys(override)])].map((key) => [
    key,
    Object.hasOwn(override, key) ? mergeLayer(base[key], override[key]) : base[key]
  ]));
}
function parseAdvanced(text6) {
  if (text6.trim() === "") return void 0;
  const errors2 = [];
  const root = parseTree2(text6, errors2, { disallowComments: true, allowTrailingComma: false });
  const unique = (node) => {
    if (node.type === "object") {
      const keys = node.children.map((child2) => child2.children[0].value);
      if (new Set(keys).size !== keys.length) return false;
    }
    return (node.children ?? []).every(unique);
  };
  if (root === void 0 || errors2.length || !unique(root)) throw new Error("Invalid JSON");
  return JSON.parse(text6);
}
function editLayer(base, path, value2) {
  const next = structuredClone(base);
  let node = next;
  for (const key2 of path.slice(0, -1)) {
    if (!record2(node[key2])) node[key2] = {};
    node = node[key2];
  }
  const key = path.at(-1);
  if (value2 === void 0) delete node[key];
  else node[key] = structuredClone(value2);
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
function validateEditorValue(value2, schema, sparse = false) {
  if (schema.type === "transform") return schema.inner !== void 0 && validateEditorValue(value2, schema.inner, sparse);
  if (schema.type === "any") {
    try {
      copyRouteJson(value2);
      return true;
    } catch {
      return false;
    }
  }
  if (schema.type === "union") return schema.alternatives?.some((node) => validateEditorValue(value2, node, sparse)) === true;
  if (schema.type === "const") return value2 === schema.value;
  if (schema.type === "object" && schema.additionalProperties === "json") {
    try {
      if (schema.fields?.provider?.type === "string" && schema.fields.model?.type === "string") {
        normalizeModelRouteJson(value2, sparse, true);
        return true;
      }
      copyRouteJson(value2);
    } catch {
      return false;
    }
  }
  if (schema.type === "object" || schema.type === "dict") return record2(value2) && (sparse || schema.type !== "object" || Object.entries(schema.fields ?? {}).every(([key, node]) => !node.required || Object.hasOwn(value2, key))) && Object.entries(value2).every(([key, child2]) => {
    if (["__proto__", "prototype", "constructor"].includes(key)) return false;
    if (schema.keys !== void 0 && !schema.keys.includes(key)) return false;
    const node = schema.type === "dict" ? schema.inner : schema.fields !== void 0 && Object.hasOwn(schema.fields, key) ? schema.fields[key] : void 0;
    return node !== void 0 ? validateEditorValue(child2, node, sparse) : schema.type === "object" && schema.additionalProperties === "json";
  });
  if (schema.type === "array") return Array.isArray(value2) && (schema.max === void 0 || value2.length <= schema.max) && schema.inner !== void 0 && value2.every((child2) => validateEditorValue(child2, schema.inner));
  if (schema.type === "string" && schema.nonempty) return typeof value2 === "string" && value2.trim() !== "";
  if (["string", "boolean", "number"].includes(schema.type)) return typeof value2 === schema.type && (typeof value2 !== "number" || Number.isFinite(value2) && (schema.min === void 0 || value2 >= schema.min) && (schema.max === void 0 || value2 <= schema.max) && (schema.step === void 0 || Number.isInteger(value2 / schema.step)));
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
  const visit2 = (value2, path) => {
    if (!visibleDeploymentPath(path)) return;
    if (record2(value2) && Object.keys(value2).length) for (const [key, child2] of Object.entries(value2)) visit2(child2, [...path, key]);
    else if (path.length) paths.add(path.join("."));
  };
  for (const value2 of [snapshot4.desired, snapshot4.startup, snapshot4.nextRoot?.settings, admitted?.settings]) if (value2 !== void 0) visit2(value2, []);
  return [...paths].filter((path) => visibleDeploymentPath(path.split("."))).sort();
}

// src/client/deployment-controller.ts
var Refusal = class extends Error {
  constructor(code2) {
    super(code2);
    this.code = code2;
  }
};
function isNativeJson(value2, active = /* @__PURE__ */ new Set()) {
  if (value2 === null || typeof value2 === "string" || typeof value2 === "boolean") return true;
  if (typeof value2 === "number") return Number.isFinite(value2);
  if (typeof value2 !== "object" || active.has(value2) || Object.getOwnPropertySymbols(value2).length > 0) return false;
  const array2 = Array.isArray(value2), prototype = Object.getPrototypeOf(value2);
  if (array2 ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
  active.add(value2);
  const properties = Object.getOwnPropertyDescriptors(value2);
  const valid = Object.entries(properties).every(([key, descriptor6]) => array2 && key === "length" || descriptor6.enumerable && Object.hasOwn(descriptor6, "value") && (!array2 || /^(0|[1-9][0-9]*)$/u.test(key) && Number(key) < value2.length) && isNativeJson(descriptor6.value, active));
  active.delete(value2);
  return valid && (!array2 || Object.keys(properties).length === value2.length + 1);
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
    const code2 = result.error.details.code;
    throw new Refusal(["conflict", "validation", "not-owned"].includes(code2) ? code2 : "unavailable");
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
  setInvalid(path, invalid3) {
    if (this.invalid.has(path) === invalid3) return;
    if (invalid3) this.invalid.add(path);
    else this.invalid.delete(path);
    this.publish({ invalidFields: [...this.invalid], dirty: this.invalid.size > 0 || !equal(this.baseline, this.state.draft), saved: false });
  }
  setRaw(path, text6, invalid3) {
    if (!this.canEdit()) return;
    this.publish({ raw: { ...this.state.raw, [path]: { text: text6, invalid: invalid3 } } });
    this.setInvalid(path, invalid3);
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
  edit(path, value2) {
    if (!this.canEdit()) return;
    const draft2 = editLayer(this.state.draft, path, value2);
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
    const candidate2 = mergeLayer(lower, editable);
    const merged = this.layer === "global" ? mergeLayer(candidate2, snapshot4.profile) : candidate2;
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
      const current2 = await unwrap(this.remote.describeSettings());
      if (this.disposed || generation !== this.generation) return;
      if (current2.entryId !== snapshot4.entryId || current2.hostProfileKey !== snapshot4.hostProfileKey || current2.globalRevision !== snapshot4.globalRevision) throw new Refusal("conflict");
      let acceptedRefreshRequired = false;
      if (this.layer === "global") {
        const accepted = await unwrap(this.remote.save({ expectedRevision: snapshot4.globalRevision, edits }));
        acceptedRefreshRequired = accepted.refreshRequired === true || accepted.revision === "unavailable";
      } else {
        if (current2.nativeRevision !== snapshot4.nativeRevision || !this.canWriteProfile(current2)) throw new Refusal("conflict");
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
var import_react10 = require("react");
var import_dsh_client_ui_primitives9 = require("@deepseek-ai/dsh-client-ui-primitives");

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
  profileHint: "This DSH profile only. Unset fields use Global and Host defaults; native runtime uses Host defaults.",
  profileUnavailable: "Unavailable",
  unavailableForm: "This DSH profile is read-only. Reconnect and refresh to check editing access.",
  ceiling: "Deepwork master is Global-only; profiles and session modes cannot lift its captured ceiling.",
  hostUnknown: "Host bundle status: unknown (separate switch).",
  boundaries: "Saved settings apply to new sessions. Changes marked restart required need a separate Host restart, which may cancel sessions.",
  core: "Core",
  coreHint: "Core-owned desired settings. Model-parameter passthrough is ordinary config, not a subplugin. The permission-control enabled flag is startup-pinned. Save does not change current-session admission; inspect desired, startup and admitted values below. Unavailable admission stays unknown.",
  modelParametersHint: "Off stops sending custom parameters and uses native reasoning defaults. Saved values and your selected model stay unchanged.",
  permissionControlHint: "Permission-control mounting is startup-pinned. Saved configuration does not prove runtime coverage or remove current protections. Root rules keep their independent authority inside Permissions.",
  modules: "Configuration modules",
  scope: "Configuration scope",
  close: "Close module",
  loading: "Loading configuration…",
  unset: "Use default configuration",
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
  noModuleFields: "No editable settings in this scope.",
  leaveDraft: "Unsaved or invalid draft. Choose how to leave; nothing is saved or discarded automatically.",
  continueEditing: "Continue editing",
  keepDraft: "Keep draft and return",
  discardDraft: "Discard draft and leave",
  rootRules: "Session permission rules",
  rootRulesHint: "Rules save separately. Select an open main session with editing access and synchronized permissions.",
  rootRulesUnavailable: "Permission rules unavailable. Reconnect and refresh.",
  nativeRuntimeHint: "Native default On; Host base pins still apply. Mounting is captured at startup. Saving stages desired configuration only; it does not start/stop providers or cancel running sessions. A separate Host restart may cancel sessions.",
  nativeRuntimeReadinessHint: "Task progress is available in the session.",
  unsetGroup: "Use defaults for this group",
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
  saveGlobal: "Save",
  saveProfile: "Save",
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
  advancedHint: "Use supported fields; omit to inherit. Arrays replace inherited values. Do not enter credentials or scripts.",
  invalid: "Invalid field. Check type, bounds and keys; draft retained.",
  conflict: "Revision conflict; draft retained. Review changes, then discard and reload. Refresh does not merge.",
  unavailable: "Scope unavailable; draft retained. Reconnect and refresh.",
  "not-owned": "Read-only: requires an authenticated local Host operator.",
  validation: "Host rejected configuration; draft retained. Check fields and merged constraints.",
  transport: "Connection lost; result unknown. Draft kept. Reconnect and refresh before retrying.",
  unconfirmed: "Save result unknown. Draft kept. Refresh before retrying.",
  namedIndependent: "Deepwork Profiles is a separate named JSONC runtime-resource editor in Settings. Saving here does not apply a named profile or select its model."
};
var deploymentZh = {
  title: "DSMM",
  summary: "全局配置与当前配置覆盖",
  description: "两层独立保存，不改原生模型或运行中会话。",
  global: "DSMM 全局配置",
  globalHint: "同一 Home 的 DSH 配置共用；未设置字段使用内建默认值。",
  profile: "当前 DSH 配置覆盖",
  profileHint: "仅影响此 DSH 配置。未设置字段使用全局与宿主默认值；原生运行时使用宿主默认值。",
  profileUnavailable: "不可用",
  unavailableForm: "此 DSH 配置只读，请重连并刷新以检查编辑权限。",
  ceiling: "Deepwork 总开关仅全局可改；配置和会话模式不能突破已捕获上限。",
  hostUnknown: "宿主整包状态：未知（独立开关）。",
  boundaries: "保存的设置供新会话使用。标注「需重启」的更改需另行重启宿主，可能取消会话。",
  core: "Core 核心配置",
  coreHint: "Core 所有的 desired 意图配置。模型参数透传为普通配置，非子插件；权限控制 enabled 仅启动时捕获。保存不改变当前会话准入；下方可检查意图、启动与准入值，不可用的准入仍为未知。",
  modelParametersHint: "关闭后停止发送自定义参数，并使用原生推理默认值；已保存的值和所选模型不变。",
  permissionControlHint: "权限控制挂载仅启动时捕获。保存配置不证明运行时覆盖，也不移除当前保护；Root 规则在权限模块内保持独立权限。",
  modules: "配置模块",
  scope: "配置范围",
  close: "关闭模块",
  loading: "正在加载配置…",
  unset: "使用默认配置",
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
  noModuleFields: "此范围内没有可编辑的设置。",
  leaveDraft: "仍有未保存或无效草稿，请选择离开方式；不会自动保存或丢弃。",
  continueEditing: "继续编辑",
  keepDraft: "保留草稿并返回",
  discardDraft: "放弃草稿并离开",
  rootRules: "会话权限规则",
  rootRulesHint: "规则单独保存。请选择已打开的主会话，并确认有编辑权限且权限已同步。",
  rootRulesUnavailable: "权限规则不可用，请重连后刷新。",
  nativeRuntimeHint: "原生默认开启，Host base 固定值仍适用；挂载仅启动时捕获。保存只设置 desired，不会启动／停止提供商或取消当前会话；独立 Host 重启可能取消会话。",
  nativeRuntimeReadinessHint: "任务进度可在会话中查看。",
  unsetGroup: "整组使用默认配置",
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
  saveGlobal: "保存",
  saveProfile: "保存",
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
  advancedHint: "仅使用支持的字段，省略表示继承；数组整体替换继承值。请勿填写凭据或脚本。",
  invalid: "字段无效，请核对类型、范围与键；草稿保留。",
  conflict: "版本冲突，草稿保留。核对后丢弃并重载；刷新不自动合并。",
  unavailable: "作用域不可用，草稿保留；重连后刷新。",
  "not-owned": "只读：需要本地宿主已认证 operator 权限。",
  validation: "宿主拒绝配置，草稿保留；核对字段及合并约束。",
  transport: "连接中断，结果未知，草稿已保留。请重连并刷新后再重试。",
  unconfirmed: "保存结果未知，草稿已保留。请刷新后再重试。",
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
  childPermissions: "Permissions",
  childEnable: "Allow this child to ask me for approval",
  childRevoke: "Revoke child approvals",
  childPermissionBoundary: "Future approvals for this live child only. Root grants, siblings and future children are unchanged. Role and sandbox limits remain. Revocation does not cancel an already pending native request or replay work.",
  childUnavailable: "Verified live ownership, policy or approval route is unavailable. Refresh; retired children cannot be revived here.",
  childNoPending: "No native approval is pending for this child.",
  childEnabled: "This child may request approval.",
  childDisabled: "Interactive approval is off for this child.",
  childUnconfirmed: "The child permission result is unavailable or unconfirmed. Refresh before retrying.",
  childProject: "Project",
  childRole: "Role ceiling",
  childReadOnly: "Read-only",
  temporaryChildSession: "This child task",
  temporaryWebBoundary: "Exact scheme, host and port for native Web Fetch only; no subdomains, shell sockets, search, model or MCP access. Existing redirect, DNS, proxy and Fake-IP restrictions remain. A proxy path does not provide local DNS proof.",
  temporaryTitle: "Temporary approvals",
  temporaryDuration: "Approval duration",
  temporaryApprove: "Approve",
  temporaryRevoke: "Revoke",
  temporaryRefresh: "Refresh",
  temporaryEmpty: "No active temporary approvals.",
  "temporary:once": "Once only",
  "temporary:session": "This session",
  "temporary:15min": "15 minutes",
  "temporary:1h": "1 hour",
  temporaryBoundary: "Selected tool scope in this live session only; no child inheritance or sandbox upgrade. Revocation stops future handoffs, not effects already started. File scopes do not confine shell processes or guarantee final-inode/hardlink isolation.",
  temporaryUnavailable: "Temporary approval is unavailable or unconfirmed. Refresh, or use the native once-only prompt. No operation is replayed.",
  title: "Permission control",
  rules: "Global permission rules",
  nativeApproval: "Approve commands in the native prompt. Allow approves only that call.",
  root: "Selected main session",
  noRoot: "Select a main session to view its permission rules.",
  child: "Select this child’s main session to edit Global rules.",
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
  networkLimit: "Web rules cover public web tools only. Private networks, shell commands and sockets remain outside this permission.",
  rulesHint: "Saves Global rules for the selected main session. If profile overrides block saving, edit or clear them in the profile scope above, then refresh.",
  configPolicyHint: "Profile settings override Global settings. Arrays replace inherited lists. Refresh session permissions after saving to check what is effective.",
  configRulesHint: "Edit existing records or imported rules with valid provenance. Use the session rules editor for verified approvals. An empty array clears inherited records.",
  coldHint: "Changing this switch requires a Host restart. Current protection stays active until then. Restart may cancel sessions.",
  nativeCommands: "Exact command rules",
  nativeCommandsHint: "Default Off. Match the tool, executable, subcommand, ordered arguments, directory and sandbox exactly. No wildcards. Other approval, denial and read-only restrictions still apply. New entries ask for approval and use workspace-write.",
  registrationUnresolved: "Executor identity is unconfirmed. Verify the tool, executable, environment and sandbox before entering exact values.",
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
  rulesUnavailable: "Editing requires an open main session, local editing permission and synchronized rules. Check profile overrides, reconnect and refresh.",
  invalidArgsHint: "Correct invalid argument JSON before removing rows, or explicitly Unset this entire array to restore inheritance. Other fields do not discard invalid text.",
  observedPolicy: "Effective policy (including profile overrides)",
  profileOverrideState: "Profile overrides",
  profileOverrideUnknown: "Unknown. Choose Current DSH profile above to inspect overrides.",
  matchHint: "Match an exact path or directory tree, an exact shell tool/command/directory, or a web tool. Allow does not grant outside-workspace writes. Rules stay active until revoked.",
  source: "Actual source",
  recordVersion: "Record version",
  savedAt: "Saved at",
  operator: "Verified Host operator",
  imported: "User import",
  active: "Active record",
  revoked: "Revoked record",
  base: "Draft version",
  savedRevision: "Saved version",
  runtimeRevision: "Effective version",
  runtime: "Rule synchronization",
  synced: "Synced",
  updating: "Updating",
  unsynced: "Unsynced — saving unavailable",
  mounted: "Startup mounted",
  on: "On",
  off: "Off",
  restart: "Independent restart required",
  coverageTitle: "Tool coverage",
  coverage: "Last observed for this main session. Executor readiness and network access must be checked separately.",
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
  pathEvidence: "Read checks its active filesystem. Search and shell path checks depend on the executor. Final-file identity, full filesystem confinement and socket isolation are not guaranteed.",
  newRule: "Add exact-match rule",
  editRule: "Edit rule",
  stage: "Stage rule",
  cancel: "Cancel rule edit",
  stageRevoke: "Stage revocation",
  unstage: "Remove staged change",
  editor: "Rule draft",
  staged: "Unsaved rule changes",
  noRules: "No saved rules.",
  save: "Save",
  discard: "Discard draft and reload",
  dirty: "Unsaved rules draft",
  saved: "Rules saved. Check synchronization below.",
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
  childPermissions: "权限",
  childEnable: "允许此子任务向我请求批准",
  childRevoke: "撤销子任务批准",
  childPermissionBoundary: "仅影响此 live 子任务的后续审批，不继承 Root 批准，不影响同级或未来子任务。角色与沙箱上限不变。撤销不取消已经 pending 的原生请求，也不重放任务。",
  childUnavailable: "可信 live ownership、策略或审批入口不可用。请刷新；这里不能复活已结束的子任务。",
  childNoPending: "此子任务当前没有原生待审批请求。",
  childEnabled: "此子任务可请求批准。",
  childDisabled: "此子任务的交互审批已关闭。",
  childUnconfirmed: "子任务权限结果不可用或待确认。请刷新后再重试。",
  childProject: "项目",
  childRole: "角色上限",
  childReadOnly: "只读",
  temporaryChildSession: "本次子任务",
  temporaryWebBoundary: "仅限原生 Web Fetch 的精确 scheme、主机与端口，不含子域、Shell socket、搜索、模型或 MCP。原有重定向、DNS、代理和 Fake-IP 限制保留；代理路径不提供本地 DNS 证明。",
  temporaryTitle: "临时批准",
  temporaryDuration: "批准时长",
  temporaryApprove: "批准",
  temporaryRevoke: "撤销",
  temporaryRefresh: "刷新",
  temporaryEmpty: "没有生效中的临时批准。",
  "temporary:once": "仅本次",
  "temporary:session": "本次会话",
  "temporary:15min": "15 分钟",
  "temporary:1h": "1 小时",
  temporaryBoundary: "仅限当前 live 会话的所选工具范围，不传给子任务、不提升沙箱。撤销阻止后续交接，不回滚已经开始的效果。文件范围不约束 Shell 进程，也不保证最终 inode／hardlink 隔离。",
  temporaryUnavailable: "临时批准不可用或结果待确认。请刷新，或使用原生仅本次审批；不会自动重放操作。",
  title: "权限控制",
  rules: "全局权限规则",
  nativeApproval: "请在原生提示中批准命令；「允许」仅批准本次调用。",
  root: "所选主会话",
  noRoot: "请选择主会话以查看权限规则。",
  child: "请切换到此子会话的主会话后编辑全局规则。",
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
  networkLimit: "网页规则仅覆盖公共网页工具，不包含私网、Shell 命令或 socket 权限。",
  rulesHint: "为所选主会话保存全局规则。若配置覆盖阻止保存，请在上方当前配置范围内编辑或清除覆盖，再刷新。",
  configPolicyHint: "当前配置优先于全局配置，数组整体替换继承列表。保存后请刷新会话权限以检查实际生效状态。",
  configRulesHint: "可编辑已有记录或带合法来源的导入规则。经核验的批准请使用会话规则编辑器。空数组会清除继承的记录。",
  coldHint: "更改此开关需重启宿主，此前保留当前保护。重启可能取消会话。",
  nativeCommands: "精确命令规则",
  nativeCommandsHint: "默认关闭。精确匹配工具、可执行程序、子命令、有序参数、目录和沙箱，不支持通配符。其他审批、拒绝和只读限制仍有效。新条目使用询问与 workspace-write。",
  registrationUnresolved: "执行器身份尚未确认，请核验工具、可执行程序、环境和沙箱后再填写精确值。",
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
  rulesUnavailable: "编辑需要已打开的主会话、本地编辑权限和已同步的规则。请检查配置覆盖，重连后刷新。",
  invalidArgsHint: "请修正无效参数 JSON 后再移除条目；也可显式 Unset 整个数组以恢复继承。修改其他字段不会丢弃无效文本。",
  observedPolicy: "有效策略（含当前配置覆盖）",
  profileOverrideState: "配置覆盖",
  profileOverrideUnknown: "未知，请在上方选择当前 DSH 配置查看覆盖值。",
  matchHint: "可匹配精确路径或目录树、精确 Shell 工具与命令及目录，或网页工具。允许不授予工作区外写入权限。规则保留至撤销。",
  source: "实际来源",
  recordVersion: "记录版本",
  savedAt: "保存时间",
  operator: "宿主已核验 operator",
  imported: "用户导入",
  active: "有效记录",
  revoked: "已撤销记录",
  base: "草稿版本",
  savedRevision: "保存版本",
  runtimeRevision: "生效版本",
  runtime: "规则同步",
  synced: "已同步",
  updating: "同步中",
  unsynced: "未同步——暂不可保存",
  mounted: "启动时已挂载",
  on: "开启",
  off: "关闭",
  restart: "需要另行重启",
  coverageTitle: "工具覆盖范围",
  coverage: "所选主会话最近观测的覆盖范围，执行器就绪和网络访问需另行检查。",
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
  pathEvidence: "读取检查当前文件系统；搜索和 Shell 的路径检查取决于执行器。不保证最终文件身份、完整文件系统或 socket 隔离。",
  newRule: "添加精确匹配规则",
  editRule: "编辑规则",
  stage: "暂存规则",
  cancel: "取消规则编辑",
  stageRevoke: "暂存撤销",
  unstage: "移除暂存更改",
  editor: "规则草稿",
  staged: "未保存的规则更改",
  noRules: "尚无已保存规则。",
  save: "保存",
  discard: "丢弃草稿并重载",
  dirty: "规则草稿未保存",
  saved: "规则已保存，请核对下方同步状态。",
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
function Arguments({ value: value2, controller, name, disabled, onChange, t }) {
  const state = (0, import_react5.useSyncExternalStore)(controller.subscribe, controller.getSnapshot), id3 = (0, import_react5.useId)(), raw = state.raw[name], text6 = raw?.text ?? JSON.stringify(value2), bad = raw?.invalid === true;
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: id3, children: t("args") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("textarea", { id: id3, rows: 3, maxLength: 32768, disabled, value: text6, "aria-invalid": bad, "aria-describedby": `${id3}-error`, onChange: (event) => {
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
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { id: `${id3}-error`, className: "dsmm-hint", children: bad ? t("invalidEntry") : "" })
  ] });
}
function Entry({ entry, index, controller, disabled, removeDisabled, change, remove, t }) {
  const id3 = (0, import_react5.useId)();
  const valid = validNativeEntries([entry]);
  const text6 = (key, label) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: `${id3}-${key}`, children: t(label) }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Input, { className: "dsmm-input", id: `${id3}-${key}`, value: key === "id" ? entry.id : entry.match[key] ?? "", maxLength: 32768, disabled, required: key !== "subcommand", onChange: (event) => {
      const value2 = event.currentTarget.value;
      if (key === "id") change({ ...entry, id: value2 });
      else if (key === "subcommand" && value2 === "") {
        const { subcommand: _omitted, ...match } = entry.match;
        change({ ...entry, match });
      } else change({ ...entry, match: { ...entry.match, [key]: value2 } });
    } })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("fieldset", { "aria-describedby": !valid ? `${id3}-error` : void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("legend", { children: [
      t("nativeCommands"),
      " ",
      index + 1
    ] }),
    !valid && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", id: `${id3}-error`, children: t("invalidEntry") }),
    text6("id", "entryId"),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: `${id3}-tool`, children: t("tool") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("select", { id: `${id3}-tool`, disabled, value: entry.match.tool, onChange: (event) => {
        const tool = event.currentTarget.value;
        if (tool === "bash" || tool === "pwsh") change({ ...entry, match: { ...entry.match, tool } });
      }, children: ["bash", "pwsh"].map((value2) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: value2, children: value2 }, value2)) })
    ] }),
    text6("executable", "nativeExecutable"),
    text6("subcommand", "subcommand"),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Arguments, { value: entry.match.args, controller, name: `permissionControl.nativeCommands.entries.${index}.args`, disabled, t, onChange: (args) => change({ ...entry, match: { ...entry.match, args } }) }),
    text6("workingDirectory", "cwd"),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: `${id3}-sandbox`, children: t("sandboxMode") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("select", { id: `${id3}-sandbox`, disabled, value: entry.sandboxMode, onChange: (event) => {
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
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: `${id3}-mode`, children: t("mode") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("select", { id: `${id3}-mode`, disabled, value: entry.mode, onChange: (event) => {
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
function NativeCommandEntries({ value: value2, inherited, controller, disabled, onChange, setInvalid, t }) {
  const entries = value2 ?? inherited, name = "permissionControl.nativeCommands.entries";
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
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t(value2 === void 0 ? "inheritedEntries" : "explicitEntries") }),
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
          change: (next) => change(entries.map((row2, position) => position === index ? next : row2)),
          remove: () => {
            controller.clearRaw(name);
            change(entries.filter((_, position) => position !== index));
          }
        },
        index
      )),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { type: "button", variant: "outline", disabled: disabled || entries.length >= 1024, onClick: () => change([...entries, emptyNativeEntry()]), children: t("addEntry") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { type: "button", variant: "outline", "data-dsmm-unset": name, disabled: disabled || value2 === void 0 && invalidArgs.length === 0, onClick: () => {
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
function displayValue(value2, t) {
  if (value2 === void 0) return t("unknown");
  if (typeof value2 === "boolean") return t(value2 ? "on" : "off");
  const text6 = JSON.stringify(value2);
  return text6.length > 120 ? `${text6.slice(0, 120)}…` : text6;
}
function AdvancedField({ schema, path, controller, inherited, upper, expanded, onExpandedChange, t }) {
  const state = (0, import_react6.useSyncExternalStore)(controller.subscribe, controller.getSnapshot), id3 = (0, import_react6.useId)(), name = path.join(".");
  const value2 = at(state.draft, path), raw = state.raw[name], text6 = raw?.text ?? (value2 === void 0 ? "" : JSON.stringify(value2, null, 2)), invalid3 = raw?.invalid === true;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("details", { className: "dsmm-deployment-group", "data-field": name, open: expanded, onToggle: (event) => onExpandedChange?.(event.currentTarget.open), children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("summary", { id: `${id3}-label`, children: [
      fieldLabel(path, t),
      " · ",
      t("advanced")
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsmm-hint", id: `${id3}-hint`, children: t("advancedHint") }),
      path[0] === "permissionControl" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsmm-hint", children: permissionText(t)("configRulesHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsmm-hint", children: t(value2 === void 0 ? "inherit" : "explicit") }),
      upper !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "dsmm-hint", children: [
        t("profileSource"),
        ": ",
        displayValue(upper, t)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("textarea", { id: id3, rows: 6, maxLength: 32768, value: text6, disabled: !controller.canEdit(), "aria-labelledby": `${id3}-label`, "aria-invalid": invalid3, "aria-describedby": `${id3}-hint ${id3}-error`, onChange: (event) => {
        const next = event.currentTarget.value;
        let parsed, valid = true;
        try {
          parsed = parseAdvanced(next);
          const candidate2 = parsed === void 0 ? inherited : mergeLayer(inherited, parsed);
          valid = parsed === void 0 || validateEditorValue(parsed, schema, true) && validateEditorValue(upper === void 0 ? candidate2 : mergeLayer(candidate2, upper), schema);
        } catch {
          valid = false;
        }
        controller.setRaw(name, next, !valid);
        if (valid) controller.edit(path, parsed);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { id: `${id3}-error`, className: "dsmm-hint", children: invalid3 ? t("invalid") : "" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { type: "button", variant: "outline", "data-dsmm-unset": name, disabled: !controller.canEdit() || value2 === void 0 && raw === void 0, onClick: () => {
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
  const state = (0, import_react6.useSyncExternalStore)(controller.subscribe, controller.getSnapshot), id3 = (0, import_react6.useId)(), name = path.join(".");
  const value2 = at(state.draft, path), raw = state.raw[name], bad = raw?.invalid === true;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("label", { htmlFor: id3, children: fieldLabel(path, t) }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsmm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Input, { className: "dsmm-input", id: id3, type: "text", inputMode: schema.type === "number" ? "decimal" : void 0, value: raw?.text ?? String(value2 ?? inherited ?? ""), disabled: !controller.canEdit(), "aria-invalid": bad, "aria-describedby": `${id3}-error`, onChange: (event) => {
        const text6 = event.currentTarget.value, candidate2 = schema.type === "number" ? Number(text6) : text6;
        const valid = (schema.type !== "number" || text6.trim() !== "") && validateEditorValue(candidate2, schema);
        controller.setRaw(name, text6, !valid);
        if (valid) controller.edit(path, candidate2);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { type: "button", variant: "outline", "data-dsmm-unset": name, disabled: !controller.canEdit() || value2 === void 0 && raw === void 0, onClick: () => {
        controller.clearRaw(name);
        controller.edit(path, void 0);
      }, children: t("unset") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { id: `${id3}-error`, className: "dsmm-hint", children: [
      bad ? t("invalid") : "",
      schema.type === "number" && (schema.min !== void 0 || schema.max !== void 0) ? ` ${schema.min ?? "—"} – ${schema.max ?? "—"}` : ""
    ] })
  ] });
}
function Field({ schema, path, controller, initiallyOpen = false, disclosures, t }) {
  if (schema.type === "transform" && schema.inner !== void 0) schema = schema.inner;
  const state = (0, import_react6.useSyncExternalStore)(controller.subscribe, controller.getSnapshot), snapshot4 = state.snapshot, id3 = (0, import_react6.useId)(), name = path.join(".");
  const [open, setOpen] = (0, import_react6.useState)(disclosures?.get(name) ?? initiallyOpen);
  const expand = (expanded) => {
    disclosures?.set(name, expanded);
    setOpen(expanded);
  };
  const explicit = at(state.draft, path), inherited = controller.layer === "global" ? at(snapshot4.defaults, path) : at(mergeLayer(mergeLayer(snapshot4.defaults, snapshot4.global), snapshot4.nativeForm?.base ?? {}), path);
  const choices = enumValues(schema), disabled = !controller.canEdit();
  if (name === "permissionControl.nativeCommands.entries") return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { "data-field": name, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(NativeCommandEntries, { controller, value: explicit, inherited: inherited ?? [], disabled, onChange: (value2) => controller.edit(path, value2), setInvalid: (key, bad) => controller.setInvalid(key, bad), t: permissionText(t) }) });
  if (schema.type === "object" && schema.fields !== void 0 && path[0] !== "roleRouting") return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("details", { className: "dsmm-deployment-group", "data-field": name, open, onToggle: (event) => expand(event.currentTarget.open), children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("summary", { children: fieldLabel(path, t) }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
      name === "permissionControl" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsmm-hint", children: permissionText(t)("configPolicyHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsmm-hint", children: t(explicit === void 0 ? "inherit" : "explicit") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { type: "button", variant: "outline", "data-dsmm-unset": name, disabled: disabled || explicit === void 0 && !Object.keys(state.raw).some((key) => key === name || key.startsWith(`${name}.`)), onClick: () => {
        controller.clearRaw(name);
        controller.edit(path, void 0);
      }, children: t("unsetGroup") }),
      Object.entries(schema.fields).map(([key, node]) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Field, { schema: node, path: [...path, key], controller, disclosures, t }, key))
    ] })
  ] });
  if (!["boolean", "string", "number"].includes(schema.type) && choices === null) return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(AdvancedField, { schema, path, controller, inherited, upper: controller.layer === "global" ? at(snapshot4.profile, path) : void 0, expanded: open, onExpandedChange: expand, t });
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsmm-field dsmm-deployment-field", "data-field": name, children: [
    schema.type === "boolean" || choices !== null ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("label", { htmlFor: id3, children: fieldLabel(path, t) }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("select", { id: id3, disabled, value: explicit === void 0 ? "inherit" : JSON.stringify(explicit), onChange: (event) => controller.edit(path, event.currentTarget.value === "inherit" ? void 0 : JSON.parse(event.currentTarget.value)), children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: "inherit", children: `${t("unset")} · ${displayValue(inherited, t)}` }),
        (choices ?? [true, false]).map((choice3) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: JSON.stringify(choice3), children: displayValue(choice3, t) }, String(choice3)))
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

// src/client/PermissionPanelEntry.tsx
var import_react9 = require("react");

// src/client/PermissionsPanel.tsx
var import_react8 = require("react");
var import_dsh_client_ui_primitives8 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/TemporaryPermissions.tsx
var import_react7 = require("react");
var import_dsh_client_ui_primitives7 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/permission-temporary-remote.ts
function row(value2, required, optional2 = []) {
  if (!value2 || typeof value2 !== "object" || Array.isArray(value2) || required.some((key) => !Object.hasOwn(value2, key)) || Object.keys(value2).some((key) => !required.includes(key) && !optional2.includes(key))) throw new TypeError("Invalid temporary permission DTO.");
  return value2;
}
function parseTemporaryId(value2) {
  if (typeof value2 !== "string" || !value2.length || value2.length > 512 || /[\u0000-\u001f]/u.test(value2)) throw new TypeError("Invalid temporary permission identity.");
  return value2;
}
function parseTemporaryDuration(value2) {
  if (value2 !== "once" && value2 !== "session" && value2 !== "15min" && value2 !== "1h") throw new TypeError("Invalid duration.");
  return value2;
}
function parseTemporaryDelivery(value2) {
  const input = row(value2, ["requestId", "deliveryId"]);
  return { requestId: parseTemporaryId(input.requestId), deliveryId: parseTemporaryId(input.deliveryId) };
}
function summary(value2) {
  if (typeof value2 !== "string" || value2.length > 65536) throw new TypeError("Invalid summary.");
  return value2;
}
function parseTemporaryGrants(value2) {
  if (!Array.isArray(value2) || value2.length > 1024) throw new TypeError("Invalid grants.");
  return value2.map((item) => {
    const input = row(item, ["id", "sessionId", "tool", "summary", "duration"], ["remainingMs"]), duration = parseTemporaryDuration(input.duration);
    if (duration === "once" || input.remainingMs !== void 0 && (typeof input.remainingMs !== "number" || !Number.isFinite(input.remainingMs) || input.remainingMs < 0)) throw new TypeError("Invalid grant lifetime.");
    return {
      id: parseTemporaryId(input.id),
      sessionId: parseTemporaryId(input.sessionId),
      tool: parseTemporaryId(input.tool),
      summary: summary(input.summary),
      duration,
      ...typeof input.remainingMs === "number" ? { remainingMs: input.remainingMs } : {}
    };
  });
}
function parseTemporaryRequest(value2) {
  const input = row(value2, ["requestId", "deliveryId", "sessionId", "tool", "summary", "reusable"], ["scopes"]);
  if (typeof input.reusable !== "boolean") throw new TypeError("Invalid request capability.");
  let scopes;
  if (input.scopes !== void 0) {
    if (!Array.isArray(input.scopes) || input.scopes.length > 4) throw new TypeError("Invalid scopes.");
    scopes = input.scopes.map((value3) => {
      const scope = row(value3, ["id", "summary"]);
      return { id: parseTemporaryId(scope.id), summary: summary(scope.summary) };
    });
  }
  return {
    requestId: parseTemporaryId(input.requestId),
    deliveryId: parseTemporaryId(input.deliveryId),
    sessionId: parseTemporaryId(input.sessionId),
    tool: parseTemporaryId(input.tool),
    summary: summary(input.summary),
    reusable: input.reusable,
    ...scopes ? { scopes } : {}
  };
}
var codec2 = (name, parse3) => ({ mode: "strict", typeSymbol: `@dsmm/dsmm#Temporary${name}`, create: () => ({ parse: parse3 }) });
function parseChildPermission(value2) {
  const input = row(value2, ["parentSessionId", "childSessionId", "project", "state", "canEnable", "canRevoke"], ["role", "readOnly"]);
  const state = input.state;
  if (state !== "disabled" && state !== "enabled" && state !== "unavailable" || typeof input.canEnable !== "boolean" || typeof input.canRevoke !== "boolean" || input.readOnly !== void 0 && typeof input.readOnly !== "boolean") throw new TypeError("Invalid child permission state.");
  return {
    parentSessionId: parseTemporaryId(input.parentSessionId),
    childSessionId: parseTemporaryId(input.childSessionId),
    project: summary(input.project),
    state,
    canEnable: input.canEnable,
    canRevoke: input.canRevoke,
    ...input.role === void 0 ? {} : { role: parseTemporaryId(input.role) },
    ...typeof input.readOnly === "boolean" ? { readOnly: input.readOnly } : {}
  };
}
var id2 = codec2("Id", parseTemporaryId);
var delivery = codec2("Delivery", parseTemporaryDelivery);
var grants = codec2("Grants", parseTemporaryGrants);
var request = codec2("Request", parseTemporaryRequest);
function descriptor2(method, fields, result) {
  return {
    id: `@dsmm/dsmm-temporary-permissions#dsmmTemporaryPermissions/${method}`,
    service: "dsmmTemporaryPermissions",
    namespace: "dsmmTemporaryPermissions",
    method,
    invocation: { kind: "direct" },
    parameters: [["sessionId", id2], ...fields].map(([name, codec6]) => ({ name, wire: name, source: "json", codec: codec6 })),
    result
  };
}
var TEMPORARY_PERMISSION_REMOTE = { package: "@dsmm/dsmm-temporary-permissions", descriptors: [
  descriptor2("describe", [], grants),
  descriptor2("request", [["delivery", delivery]], request),
  descriptor2("retain", [["delivery", delivery], ["duration", codec2("Duration", parseTemporaryDuration)], ["scope", codec2("Scope", (value2) => value2 === void 0 ? "exact" : parseTemporaryId(value2))]], id2),
  descriptor2("permit", [["delivery", delivery]], codec2("Permit", (value2) => value2 === null ? null : parseTemporaryId(value2))),
  descriptor2("revoke", [["grantId", id2]], grants),
  ...["child", "enableChild", "revokeChild"].map((method) => descriptor2(method, [["childSessionId", id2]], codec2("Child", parseChildPermission)))
] };
var TEMPORARY_PERMISSION_HOST = { package: TEMPORARY_PERMISSION_REMOTE.package, face: "host", schemas: [], model: { services: [], events: [], objects: [] }, invocations: TEMPORARY_PERMISSION_REMOTE.descriptors };

// src/client/temporary-permission-client.ts
function temporaryPermissionClient(connection, signal) {
  const generation = connection.generation.getSnapshot();
  const check = () => {
    signal.throwIfAborted();
    if (connection.generation.getSnapshot() !== generation) throw new Error("Connection generation changed.");
  };
  async function call(method, args) {
    check();
    const result = await connection.rpc.call("/api", `dsmmTemporaryPermissions/${method}`, { args }, signal);
    check();
    if (!result.ok) throw new Error("Temporary permission service unavailable; use the native once-only prompt.");
    const descriptor6 = TEMPORARY_PERMISSION_REMOTE.descriptors.find((value2) => value2.method === method);
    if (descriptor6.result.mode !== "strict") throw new Error("Invalid permission protocol.");
    return descriptor6.result.create().parse(result.value);
  }
  return {
    async describe(sessionId2) {
      return parseTemporaryGrants(await call("describe", { sessionId: sessionId2 }));
    },
    async request(sessionId2, delivery2) {
      return parseTemporaryRequest(await call("request", { sessionId: sessionId2, delivery: delivery2 }));
    },
    async retain(sessionId2, delivery2, duration, scope = "exact") {
      return String(await call("retain", { sessionId: sessionId2, delivery: delivery2, duration, scope }));
    },
    async permit(sessionId2, delivery2) {
      const value2 = await call("permit", { sessionId: sessionId2, delivery: delivery2 });
      return value2 === null ? null : String(value2);
    },
    async revoke(sessionId2, grantId) {
      return parseTemporaryGrants(await call("revoke", { sessionId: sessionId2, grantId }));
    },
    async child(sessionId2, childSessionId) {
      return parseChildPermission(await call("child", { sessionId: sessionId2, childSessionId }));
    },
    async enableChild(sessionId2, childSessionId) {
      return parseChildPermission(await call("enableChild", { sessionId: sessionId2, childSessionId }));
    },
    async revokeChild(sessionId2, childSessionId) {
      return parseChildPermission(await call("revokeChild", { sessionId: sessionId2, childSessionId }));
    }
  };
}
function pendingDelivery(pending) {
  return pending.requestId && pending.deliveryId ? { requestId: pending.requestId, deliveryId: pending.deliveryId } : void 0;
}
async function retainAndAnswer(pending, remote, duration, current2, scope = "exact") {
  if (!current2() || !pending.answerable) return;
  const delivery2 = pendingDelivery(pending);
  let retention;
  if (duration !== "once") {
    if (!delivery2) throw new Error("Scoped approval unsupported.");
    retention = await remote.retain(pending.sessionId, delivery2, duration, scope);
  }
  if (current2() && pending.answerable) await pending.answer("allowed-once", retention === void 0 ? void 0 : { retention });
}
async function answerWithTemporaryPermit(pending, remote, current2) {
  const delivery2 = pendingDelivery(pending);
  if (!delivery2 || !current2() || !pending.answerable) return;
  const permit = await remote.permit(pending.sessionId, delivery2);
  if (permit && current2() && pending.answerable) await pending.answer("allowed-once", { permit });
}

// src/client/TemporaryPermissions.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
var durations = ["once", "session", "15min", "1h"];
function registerTemporaryPermissionSlots(ctx, connection) {
  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort());
  ctx.slots.inject("conversation.composer", () => ctx.slots.register({
    name: "conversation.approval.permissions",
    priority: 0,
    locale: PERMISSIONS_NS
  }, function PermissionSlot(props) {
    const remote = (0, import_react7.useMemo)(() => temporaryPermissionClient(connection, lifetime.signal), [props.pending]);
    const child2 = props.useSession((snapshot4) => snapshot4.subagent !== void 0);
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(TemporaryApproval, { pending: props.pending, remote, t: props.t, child: child2 }, props.pending.key);
  }));
}
function TemporaryApproval({ pending, remote, t, child: child2 = false }) {
  const id3 = (0, import_react7.useId)(), [view, setView] = (0, import_react7.useState)(), [duration, setDuration] = (0, import_react7.useState)("once");
  const [busy, setBusy] = (0, import_react7.useState)(false), [error, setError] = (0, import_react7.useState)(false);
  const [scope, setScope] = (0, import_react7.useState)("exact");
  const identity2 = (0, import_react7.useRef)({ pending, remote, active: true });
  if (identity2.current.pending !== pending || identity2.current.remote !== remote) identity2.current = { pending, remote, active: true };
  const captured = identity2.current, isCurrent = () => captured.active && identity2.current === captured;
  (0, import_react7.useEffect)(() => {
    let current2 = true;
    setView(void 0);
    setDuration("once");
    setScope("exact");
    setError(false);
    setBusy(false);
    const delivery2 = pendingDelivery(pending);
    if (delivery2) void remote.request(pending.sessionId, delivery2).then(async (value2) => {
      if (!current2) return;
      setView(value2);
      if (value2.reusable) await answerWithTemporaryPermit(pending, remote, () => current2);
    }).catch(() => {
      if (current2) setError(true);
    });
    captured.active = true;
    return () => {
      current2 = false;
      captured.active = false;
    };
  }, [pending, remote]);
  if (!pendingDelivery(pending)) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "dsmm-structured", "aria-label": t("temporaryTitle"), "aria-busy": busy, children: [
    view && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: view.summary }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("label", { htmlFor: id3, children: t("temporaryDuration") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("select", { id: id3, value: duration, disabled: busy || !pending.answerable, onChange: (event) => {
          const value2 = durations.find((value3) => value3 === event.currentTarget.value);
          if (value2) setDuration(value2);
        }, children: durations.filter((value2) => view.reusable || value2 === "once").map((value2) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: value2, children: t(child2 && value2 === "session" ? "temporaryChildSession" : `temporary:${value2}`) }, value2)) })
      ] }),
      !!view.scopes?.length && duration !== "once" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("label", { htmlFor: `${id3}-scope`, children: t("pathScope") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("select", { id: `${id3}-scope`, value: scope, disabled: busy || !pending.answerable, onChange: (event) => setScope(event.currentTarget.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: "exact", children: view.summary }),
          view.scopes.map((choice3) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: choice3.id, children: choice3.summary }, choice3.id))
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { variant: "primary", disabled: busy || !pending.answerable, onClick: () => {
        setBusy(true);
        setError(false);
        void retainAndAnswer(pending, remote, duration, isCurrent, scope).catch(() => {
          if (isCurrent()) setError(true);
        }).finally(() => {
          if (isCurrent()) setBusy(false);
        });
      }, children: t("temporaryApprove") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t("temporaryBoundary") }),
    view?.tool === "web_fetch" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t("temporaryWebBoundary") }),
    error && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-issue", role: "alert", children: t("temporaryUnavailable") })
  ] });
}
function TemporaryGrants({ sessionId: sessionId2, remote, t, child: child2 = false }) {
  const [grants2, setGrants] = (0, import_react7.useState)(), [busy, setBusy] = (0, import_react7.useState)(false), [error, setError] = (0, import_react7.useState)(false);
  const identity2 = (0, import_react7.useRef)({ sessionId: sessionId2, remote, active: true });
  if (identity2.current.sessionId !== sessionId2 || identity2.current.remote !== remote) identity2.current = { sessionId: sessionId2, remote, active: true };
  const captured = identity2.current, current2 = () => captured.active && identity2.current === captured;
  const accept = (value2) => {
    if (current2()) setGrants(value2);
  };
  const fail5 = () => {
    if (current2()) setError(true);
  };
  const finish = () => {
    if (current2()) setBusy(false);
  };
  (0, import_react7.useEffect)(() => {
    let current3 = true;
    setGrants(void 0);
    setError(false);
    void remote.describe(sessionId2).then((value2) => {
      if (current3) setGrants(value2);
    }).catch(() => {
      if (current3) setError(true);
    });
    captured.active = true;
    return () => {
      current3 = false;
      captured.active = false;
    };
  }, [sessionId2, remote]);
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "dsmm-zone", "aria-label": t("temporaryTitle"), "aria-busy": busy, children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: t("temporaryTitle") }),
    grants2?.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: t("temporaryEmpty") }),
    grants2?.map((grant) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("fieldset", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("legend", { children: grant.tool }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: grant.summary }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: t(child2 && grant.duration === "session" ? "temporaryChildSession" : `temporary:${grant.duration}`) }),
      grant.tool === "web_fetch" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t("temporaryWebBoundary") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { variant: "outline", disabled: busy, onClick: () => {
        setBusy(true);
        setError(false);
        void remote.revoke(sessionId2, grant.id).then(accept).catch(fail5).finally(finish);
      }, children: t("temporaryRevoke") })
    ] }, grant.id)),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { variant: "outline", disabled: busy, onClick: () => {
      setBusy(true);
      setError(false);
      void remote.describe(sessionId2).then(accept).catch(fail5).finally(finish);
    }, children: t("temporaryRefresh") }),
    error && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-issue", role: "alert", children: t("temporaryUnavailable") }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "dsmm-hint", children: t("temporaryBoundary") })
  ] });
}

// src/client/PermissionsPanel.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
var actions = ["inherit", "allow", "ask", "deny"];
var kinds = ["outside-read", "shell", "webSearch", "webFetch"];
var ruleDraft = (rule) => ({ id: rule.id, action: rule.action, match: structuredClone(rule.match) });
var newMatch = (kind) => kind === "outside-read" ? { kind, path: "", scope: "exact" } : kind === "shell" ? { kind, executable: "", command: "", workingDirectory: "" } : { kind };
function Issue({ value: value2, t }) {
  return value2 === null ? null : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { className: "dsmm-issue", role: "alert", children: [
    t(`issue:${value2}`),
    " ",
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("code", { children: value2 })
  ] });
}
function RootState({ state, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { children: [
      t("root"),
      ": ",
      t(state.scope === "root" && state.connected ? "active" : "unknown")
    ] }),
    state.scope !== "root" && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t(state.scope === "child" ? "child" : "noRoot") }),
    !state.connected && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("unknown") })
  ] });
}
function ActionSelect({ id: id3, value: value2, inherit = true, onChange, disabled, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("select", { id: id3, value: value2, disabled, onChange: (event) => {
    const choice3 = actions.find((value3) => value3 === event.currentTarget.value);
    if (choice3 !== void 0) onChange(choice3);
  }, children: actions.filter((value3) => inherit || value3 !== "inherit").map((value3) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: value3, children: t(value3 === "inherit" ? "inherit" : `action:${value3}`) }, value3)) });
}
function RuleEditor({ controller, state, t }) {
  const id3 = (0, import_react8.useId)(), editor = state.draft?.editor;
  if (editor == null) return null;
  const disabled = !controller.canEdit(state.generation), change = (value2) => controller.edit(state.generation, { editor: value2 });
  const field = (key, label) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("label", { htmlFor: `${id3}-${key}`, children: t(label) }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Input, { className: "dsmm-input", id: `${id3}-${key}`, required: true, maxLength: 32768, disabled, value: key in editor.match ? String(Reflect.get(editor.match, key)) : "", onChange: (event) => change({ ...editor, match: { ...editor.match, [key]: event.currentTarget.value } }) })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("form", { className: "dsmm-structured", "aria-label": t("editor"), onSubmit: (event) => {
    event.preventDefault();
    controller.stageRule(state.generation);
  }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("label", { htmlFor: `${id3}-id`, children: t("id") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Input, { className: "dsmm-input", id: `${id3}-id`, required: true, maxLength: 256, value: editor.id, disabled, onChange: (event) => change({ ...editor, id: event.currentTarget.value }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("label", { htmlFor: `${id3}-action`, children: t("action") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ActionSelect, { id: `${id3}-action`, value: editor.action, disabled, inherit: false, t, onChange: (action2) => {
        if (action2 !== "inherit") change({ ...editor, action: action2 });
      } })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("label", { htmlFor: `${id3}-kind`, children: t("match") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("select", { id: `${id3}-kind`, value: editor.match.kind, disabled, onChange: (event) => {
        const kind = kinds.find((value2) => value2 === event.currentTarget.value);
        if (kind !== void 0) change({ ...editor, match: newMatch(kind) });
      }, children: kinds.map((kind) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: kind, children: t(`kind:${kind}`) }, kind)) })
    ] }),
    editor.match.kind === "outside-read" && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
      field("path", "path"),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("label", { htmlFor: `${id3}-path-scope`, children: t("pathScope") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("select", { id: `${id3}-path-scope`, value: editor.match.scope, disabled, onChange: (event) => {
          const scope = event.currentTarget.value;
          if (editor.match.kind === "outside-read" && (scope === "exact" || scope === "tree")) change({ ...editor, match: { ...editor.match, scope } });
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "exact", children: t("exact") }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "tree", children: t("tree") })
        ] })
      ] })
    ] }),
    editor.match.kind === "shell" && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
      field("executable", "executable"),
      field("command", "command"),
      field("workingDirectory", "cwd")
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { type: "submit", variant: "outline", disabled, children: t("stage") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { type: "button", variant: "outline", disabled, onClick: () => controller.edit(state.generation, { editor: null }), children: t("cancel") })
    ] })
  ] });
}
function RuleRecords({ controller, state, t }) {
  const records = state.rules?.snapshot.policy.rules ?? state.base?.policy.rules;
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-structured", children: [
    records?.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t("noRules") }),
    records?.map((rule) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("fieldset", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("legend", { children: rule.id }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { children: [
        t(rule.revoked ? "revoked" : "active"),
        " · ",
        t(`action:${rule.action}`)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dl", { className: "dsmm-child-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("match") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: t(`kind:${rule.match.kind}`) }),
        rule.match.kind === "outside-read" && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("path") }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dd", { children: [
            rule.match.path,
            " · ",
            t(rule.match.scope)
          ] })
        ] }),
        rule.match.kind === "shell" && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("executable") }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: rule.match.executable }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("command") }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("code", { children: rule.match.command }) }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("cwd") }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: rule.match.workingDirectory })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("source") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: t(rule.source.kind === "operator" ? "operator" : "imported") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { type: "button", variant: "outline", disabled: !controller.canEdit(state.generation) || state.draft === null, onClick: () => controller.edit(state.generation, { editor: ruleDraft(rule) }), children: t("editRule") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { type: "button", variant: "outline", disabled: !controller.canEdit(state.generation) || state.draft === null || rule.revoked || state.draft.revoke.includes(rule.id), onClick: () => controller.stageRevoke(state.generation, rule.id), children: t("stageRevoke") })
      ] })
    ] }, rule.id))
  ] });
}
function PermissionCoverage({ state, t }) {
  const value2 = state.rules?.capabilities;
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "dsmm-structured", "aria-label": t("coverageTitle"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h3", { children: t("coverageTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("coverage") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("registrationUnresolved") }),
    value2 === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t("coverageUnavailable") }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dl", { className: "dsmm-child-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("coverageRuntime") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dd", { children: [
          t(value2.runtime.state),
          " · ",
          t("mounted"),
          ": ",
          t(value2.runtime.mounted ? "on" : "off")
        ] })
      ] }),
      value2.runtime.restartRequired && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t("restart") }),
      value2.tools.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t("coverageEmpty") }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("ul", { className: "dsmm-profile-list", children: value2.tools.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dl", { className: "dsmm-child-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("toolName") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("code", { children: tool.name }) }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("toolKind") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("code", { children: tool.kind }) }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("toolApproval") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: t("nativeOnce") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("toolMemory") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: t("notProvided") })
      ] }) }, tool.name)) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dl", { className: "dsmm-child-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("outsideReads") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: t("limit:outsideReads") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("finalInode") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: t("limit:finalInode") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("toolMemory") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: t("limit:scopedMemory") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("webFetch") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: t("limit:webFetch") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("searchDestinations") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: t("limit:webSearchDestinations") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("proxyBinding") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: t("limit:proxyAddressBinding") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("shellSockets") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: t("limit:shellSockets") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("providerAuthMcp") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: t("limit:providerAuthMcp") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("pathEvidence") })
  ] });
}
function PermissionRulesEditor({ controller, state, t }) {
  const id3 = (0, import_react8.useId)(), draft2 = state.draft, disabled = !controller.canEdit(state.generation), value2 = state.rules;
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "dsmm-zone", "aria-label": t("rules"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h3", { children: t("rules") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("rulesHint") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("networkLimit") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("matchHint") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Issue, { value: state.rulesIssue, t }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("observedPolicy") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dl", { className: "dsmm-child-meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("profileOverrideState") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: t("profileOverrideUnknown") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dl", { className: "dsmm-child-meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("runtime") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: value2 === null ? t("unknown") : t(value2.runtime.state) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("mounted") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: value2 === null ? t("unknown") : t(value2.runtime.mounted ? "on" : "off") })
    ] }),
    value2?.runtime.restartRequired && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t("restart") }),
    disabled && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t(state.reading ? "reading" : "rulesUnavailable") }),
    state.base !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dl", { className: "dsmm-child-meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: "permissionControl.enabled" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dd", { children: [
        t(state.base.policy.enabled ? "on" : "off"),
        " · ",
        t("coldHint")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: "permissionControl.nativeCommands.enabled" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: t(state.base.policy.nativeCommands.enabled ? "on" : "off") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(PermissionCoverage, { state, t }),
    draft2 !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("label", { htmlFor: `${id3}-outside`, children: t("outsideReads") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ActionSelect, { id: `${id3}-outside`, value: draft2.outsideReads, disabled, t, onChange: (outsideReads) => controller.edit(state.generation, { outsideReads }) })
      ] }),
      ["webSearch", "webFetch"].map((key) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("fieldset", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("legend", { children: t(key) }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("label", { className: "dsmm-actions", htmlFor: `${id3}-${key}-enabled`, children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("input", { type: "checkbox", id: `${id3}-${key}-enabled`, checked: draft2[key].enabled, disabled, onChange: (event) => controller.edit(state.generation, { [key]: { ...draft2[key], enabled: event.currentTarget.checked } }) }),
          t("enabled")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("label", { htmlFor: `${id3}-${key}-rule`, children: t("rule") }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ActionSelect, { id: `${id3}-${key}-rule`, value: draft2[key].rule, disabled, t, onChange: (rule) => controller.edit(state.generation, { [key]: { ...draft2[key], rule } }) })
        ] })
      ] }, key)),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { type: "button", variant: "outline", disabled: disabled || draft2.editor !== null, onClick: () => controller.edit(state.generation, { editor: { id: "", action: "ask", match: newMatch("outside-read") } }), children: t("newRule") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(RuleEditor, { controller, state, t }),
      (draft2.upsert.length > 0 || draft2.revoke.length > 0) && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-structured", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h3", { children: t("staged") }),
        draft2.upsert.map((row2) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { children: [
            row2.id,
            " · ",
            t(`kind:${row2.match.kind}`),
            " · ",
            t(`action:${row2.action}`)
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_dsh_client_ui_primitives8.Button, { type: "button", variant: "outline", disabled, onClick: () => controller.edit(state.generation, { upsert: draft2.upsert.filter((rule) => rule.id !== row2.id) }), children: [
            t("unstage"),
            ": ",
            row2.id
          ] })
        ] }, row2.id)),
        draft2.revoke.map((ruleId) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { children: [
            t("stageRevoke"),
            ": ",
            ruleId
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_dsh_client_ui_primitives8.Button, { type: "button", variant: "outline", disabled, onClick: () => controller.edit(state.generation, { revoke: draft2.revoke.filter((id4) => id4 !== ruleId) }), children: [
            t("unstage"),
            ": ",
            ruleId
          ] })
        ] }, ruleId))
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(RuleRecords, { state, controller, t }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsmm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { type: "button", variant: "primary", disabled: !controller.canSave(state.generation), onClick: () => void controller.save(state.generation), children: t("save") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { type: "button", variant: "outline", disabled: state.scope !== "root" || !state.connected || state.reading || state.busy !== null, onClick: () => void controller.refresh(state.generation, true), children: t("discard") })
    ] }),
    state.dirty && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t("dirty") })
  ] });
}
function PermissionsPanel({ controller, t, sessionId: sessionId2, temporary }) {
  const state = (0, import_react8.useSyncExternalStore)(controller.store.subscribe, controller.store.getSnapshot);
  (0, import_react8.useEffect)(() => controller.watch(), [controller]);
  if (sessionId2 !== void 0 && sessionId2 !== state.sessionId) return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", role: "status", children: t("rulesUnavailable") });
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "dsmm-profiles dsmm-children dsmm-permissions", "data-dsmm-permissions": true, "aria-label": t("title"), "aria-busy": state.reading || state.busy !== null, children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h2", { children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(RootState, { state, t }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-hint", children: t("nativeApproval") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", children: state.busy !== null ? t("busy") : state.reading ? t("reading") : state.notice === null ? "" : t(state.notice) }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(PermissionRulesEditor, { controller, state, t }),
    temporary && sessionId2 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(TemporaryGrants, { remote: temporary, sessionId: sessionId2, t }, sessionId2)
  ] });
}

// src/client/PermissionPanelEntry.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
var absent = { getSnapshot: () => void 0, subscribe: () => () => {
} };
function PermissionPanelEntry({ controller, temporary, t }) {
  const scope = (0, import_react9.useSyncExternalStore)(controller.store.subscribe, controller.store.getSnapshot);
  const source = temporary ?? absent;
  const remote = (0, import_react9.useSyncExternalStore)(source.subscribe, source.getSnapshot);
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(PermissionsPanel, { controller, sessionId: scope.sessionId ?? void 0, temporary: remote, t });
}

// src/client/DeploymentPage.tsx
var import_jsx_runtime12 = require("react/jsx-runtime");
function ScopeSave({ controller, workspace, refreshOnly = false, t }) {
  const state = (0, import_react10.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
  const pending = [...new Set(controller.pendingPaths().map(moduleFor))];
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("section", { className: "dsmm-scope-save", "aria-label": t(refreshOnly ? "refresh" : "saveScope"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", children: refreshOnly ? state.busy ? t("loading") : "" : state.busy ? t("saving") : state.refreshRequired ? t("savedRefreshRequired") : state.saved ? t("saved") : state.dirty ? t("dirty") : "" }),
    !refreshOnly && pending.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
      t("pendingModules"),
      ": ",
      pending.map((module2) => t(moduleTitle(module2))).join(" · ")
    ] }),
    state.issue !== null && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-issue", role: "alert", children: t(state.issue) }),
    !refreshOnly && state.invalidFields.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-issue", role: "alert", children: t("invalid") }),
    controller.layer === "profile" && !controller.canWriteProfile() && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("unavailableForm") }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-actions", children: [
      !refreshOnly && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives9.Button, { type: "button", variant: "primary", disabled: !controller.canSave(), onClick: () => void (workspace?.save() ?? controller.save()), children: t(controller.layer === "global" ? "saveGlobal" : "saveProfile") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives9.Button, { type: "button", variant: "outline", disabled: state.busy, onClick: () => void controller.refresh(), children: t("refresh") }),
      !refreshOnly && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives9.Button, { type: "button", variant: "outline", disabled: state.busy || !state.dirty && state.issue === null && !state.refreshRequired, onClick: () => void controller.refresh(true), children: t("discard") })
    ] })
  ] });
}
function NativeRuntimeState({ value: value2, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("details", { className: "dsmm-availability", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("summary", { children: t("nativeRuntimeState") }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
      t("nativeRuntimeBinding"),
      ": ",
      t(value2?.binding === "stock" ? "nativeRuntimeStock" : value2?.binding === "unavailable" ? "nativeRuntimeUnavailable" : "unknown")
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
      t("nativeRuntimeFence"),
      ": ",
      value2 === void 0 ? t("unknown") : t(value2.deliveryFenceReady ? "on" : "off"),
      " · ",
      t("nativeRuntimeRestart"),
      ": ",
      value2 === void 0 ? t("unknown") : t(value2.restartRequired ? "on" : "off")
    ] }),
    value2?.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t(`nativeRuntimeReason-${value2.reason}`) })
  ] });
}
function StateInspector({ controller, t }) {
  const { snapshot: snapshot4, session, dirty, issue } = (0, import_react10.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
  if (snapshot4 === null) return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t("unavailable") });
  const admitted = session?.configuration ?? null;
  const source = (value3) => t(value3 === "profile" ? "profileSource" : value3 === "global" ? "globalSource" : value3 === "defaults" ? "defaultsSource" : value3 === "named-session" ? "namedSource" : value3 === "startup" ? "startupSource" : value3 === "deployment" ? "deploymentCapture" : value3 === "mixed" ? "mixedSource" : "unknown");
  const value2 = (layer, path) => layer === void 0 ? t("unknown") : at(layer, path.split(".")) === void 0 ? t("absent") : displayValue(at(layer, path.split(".")), t);
  const restart = (snapshot4.nextRoot?.restartRequired ?? []).filter((path) => visibleDeploymentPath(path.split(".")));
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-structured", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { role: "status", children: session === null ? t("noSession") : admitted === null ? t("sessionUnavailable") : t("sessionObserved") }),
    (dirty || issue !== null) && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("inspectorStale") }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
      t("globalSource"),
      ": ",
      t(configurationVersionState(snapshot4.globalRevision)),
      " · ",
      t("profileSource"),
      ": ",
      t(configurationVersionState(snapshot4.nativeRevision))
    ] }),
    snapshot4.subagentRuntime !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(NativeRuntimeState, { value: snapshot4.subagentRuntime, t }),
    snapshot4.modules.map((module2) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("section", { className: "dsmm-zone", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h3", { children: module2.descriptor.label }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
        t("desired"),
        ": ",
        t(module2.desired.enabled ? "on" : "off"),
        " · ",
        source(module2.desired.source)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
        t("startup"),
        ": ",
        module2.startupMounted == null ? t("unknown") : t(module2.startupMounted ? "on" : "off")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
        t("next"),
        ": ",
        module2.nextRoot.admitted == null ? t("unknown") : t(module2.nextRoot.admitted ? "on" : "off")
      ] }),
      module2.pending && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t("pending") })
    ] }, module2.descriptor.id)),
    inspectorPaths(snapshot4, admitted).map((path) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dl", { className: "dsmm-deployment-state", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: path }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dd", { children: [
        t("desired"),
        ": ",
        value2(snapshot4.desired, path),
        " · ",
        source(snapshot4.sources[path])
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dd", { children: [
        t("startup"),
        ": ",
        value2(snapshot4.startup, path),
        " · ",
        source(snapshot4.startupSources?.[path])
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dd", { children: [
        t("next"),
        ": ",
        value2(snapshot4.nextRoot?.settings, path),
        " · ",
        source(snapshot4.nextRoot?.sources[path])
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dd", { children: [
        t("session"),
        ": ",
        value2(admitted?.settings, path),
        " · ",
        source(admitted?.sources[path])
      ] })
    ] }, path)),
    restart.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { children: [
      t("pending"),
      ": ",
      restart.join(", ")
    ] })
  ] });
}
function DeploymentPage(props) {
  const workspace = props.workspace ?? deploymentWorkspace(props.core, props.permissions);
  const navigation = (0, import_react10.useSyncExternalStore)(workspace.subscribe, workspace.getSnapshot);
  const core = (0, import_react10.useSyncExternalStore)(props.core.subscribe, props.core.getSnapshot);
  const controller = workspace.controller() ?? props.core;
  const state = (0, import_react10.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
  const id3 = (0, import_react10.useId)(), heading = (0, import_react10.useRef)(null), triggers = (0, import_react10.useRef)(/* @__PURE__ */ new Map()), previous = (0, import_react10.useRef)(null);
  const scopeControl = (0, import_react10.useRef)(null), confirmation = (0, import_react10.useRef)(null);
  const resume = (0, import_react10.useRef)(null);
  const disclosures = (0, import_react10.useRef)({ global: /* @__PURE__ */ new Map(), profile: /* @__PURE__ */ new Map() });
  const { t } = props, snapshot4 = state.snapshot ?? core.snapshot, active = navigation.module;
  (0, import_react10.useEffect)(() => {
    if (props.view === "page") void props.core.refresh();
  }, [props.core, props.view]);
  (0, import_react10.useEffect)(() => {
    if (props.forms !== void 0) workspace.bindForms(props.forms);
  }, [workspace, props.forms]);
  (0, import_react10.useEffect)(() => {
    if (active !== null) heading.current?.focus();
    else if (previous.current !== null) triggers.current.get(previous.current)?.focus();
    previous.current = active;
  }, [active]);
  (0, import_react10.useEffect)(() => {
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
  if (props.view === "summary") return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: t("summary") });
  const fields = snapshot4 === null || active === null ? [] : moduleFields(scopeSchema(snapshot4, controller.layer), active, controller.layer);
  const modules = CONFIG_MODULES.filter((module2) => module2 === "state" || module2 === "permissions" || snapshot4 === null || moduleFields(snapshot4.schema, module2, "global").length + moduleFields(scopeSchema(snapshot4, "profile"), module2, "profile").length > 0);
  const scopeActions = /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ScopeSave, { controller: active === "state" ? props.core : controller, workspace, refreshOnly: active === "state" || workspace.controller() === null, t });
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("section", { className: "dsmm-profiles dsmm-deployment", "data-dsmm-page": true, "aria-label": t("title"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("boundaries") }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("label", { htmlFor: `${id3}-scope`, children: t("scope") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("select", { ref: scopeControl, id: `${id3}-scope`, value: navigation.scope, disabled: state.busy || navigation.pending !== null, onChange: (event) => {
        const scope = event.currentTarget.value;
        if (scope === "global" || scope === "profile") workspace.request({ scope, module: active });
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("option", { value: "global", children: t("global") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("option", { value: "profile", children: t("profile") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t(navigation.scope === "global" ? "globalHint" : "profileHint") }),
    navigation.scope === "profile" && (navigation.native === null || !navigation.native.canWriteProfile()) && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("unavailableForm") }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-deployment-frame", "data-drawer-open": active !== null, children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("nav", { className: "dsmm-module-list", "aria-label": t("modules"), children: modules.map((module2) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives9.Button, { ref: (element) => {
        if (element !== null) triggers.current.set(module2, element);
      }, type: "button", variant: "outline", disabled: navigation.pending !== null, "aria-expanded": active === module2, "aria-controls": `${id3}-drawer`, onClick: () => workspace.request({ scope: navigation.scope, module: module2 }), children: t(moduleTitle(module2)) }, module2)) }),
      active !== null && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("aside", { id: `${id3}-drawer`, className: "dsmm-module-drawer", "aria-labelledby": `${id3}-heading`, "data-dsmm-module": active, onKeyDown: (event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        const target = event.target;
        if (target.tagName === "SELECT" && (!globalThis.CSS?.supports("selector(select:open)") || target.matches("select:open"))) return;
        event.preventDefault();
        if (navigation.pending !== null) workspace.continueEditing();
        else workspace.request({ scope: navigation.scope, module: null });
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-drawer-heading", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h2", { id: `${id3}-heading`, ref: heading, tabIndex: -1, children: t(moduleTitle(active)) }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives9.Button, { type: "button", variant: "outline", disabled: state.busy, onClick: () => workspace.request({ scope: navigation.scope, module: null }), children: t("close") })
        ] }),
        active === "state" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(StateInspector, { controller: props.core, t }),
          scopeActions
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
          navigation.scope === "profile" && navigation.native === null ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t("unavailableForm") }) : state.snapshot === null ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t(state.busy ? "loading" : "unavailable") }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { "data-dsmm-layer": controller.layer, "aria-busy": state.busy, className: "dsmm-structured", children: [
            fields.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("noModuleFields") }),
            fields.map(([key, schema]) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Field, { schema, path: [key], controller, initiallyOpen: fields.length === 1 && active !== "permissions", disclosures: disclosures.current[navigation.scope], t }, `${navigation.scope}:${key}`)),
            active === "run" && controller.layer === "profile" && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(NativeRuntimeState, { value: state.snapshot.subagentRuntime, t })
          ] }),
          scopeActions,
          active === "permissions" && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("section", { className: "dsmm-zone", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h3", { children: t("rootRules") }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dsmm-hint", children: t("rootRulesHint") }),
            workspace.permissions === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t("rootRulesUnavailable") }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(PermissionPanelEntry, { controller: workspace.permissions, temporary: props.temporaryPermissions, t: props.permissionsT ?? ((key) => Object.hasOwn(permissionEn, key) ? permissionText(t)(key) : key) })
          ] })
        ] })
      ] })
    ] }),
    navigation.pending !== null && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("section", { className: "dsmm-confirm", role: "group", "aria-label": t("leaveDraft"), onKeyDown: (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        workspace.continueEditing();
      }
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { children: t("leaveDraft") }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives9.Button, { ref: confirmation, type: "button", variant: "primary", onClick: () => workspace.continueEditing(), children: t("continueEditing") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives9.Button, { type: "button", variant: "outline", onClick: () => workspace.keepAndNavigate(), children: t("keepDraft") }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives9.Button, { type: "button", variant: "outline", disabled: state.busy, onClick: () => void workspace.discardAndNavigate(), children: t("discardDraft") })
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
function json(value2, depth2 = 0, active = /* @__PURE__ */ new Set()) {
  if (depth2 > 24) fail3();
  if (value2 === null || typeof value2 === "boolean" || typeof value2 === "string") return value2;
  if (typeof value2 === "number" && Number.isFinite(value2)) return value2;
  if (typeof value2 !== "object" || value2 === null || active.has(value2)) fail3();
  const isArray = Array.isArray(value2);
  if (Object.getPrototypeOf(value2) !== (isArray ? Array.prototype : Object.prototype) && (isArray || Object.getPrototypeOf(value2) !== null)) fail3();
  if (Object.getOwnPropertySymbols(value2).length) fail3();
  for (const [key, property2] of Object.entries(Object.getOwnPropertyDescriptors(value2))) {
    if (isArray && key === "length") continue;
    if (!Object.hasOwn(property2, "value") || !property2.enumerable || ["__proto__", "prototype", "constructor"].includes(key) || isArray && !/^(0|[1-9][0-9]*)$/u.test(key)) fail3();
  }
  if (isArray && Object.keys(value2).length !== value2.length) fail3();
  active.add(value2);
  const result = isArray ? value2.map((child2) => json(child2, depth2 + 1, active)) : Object.fromEntries(Object.entries(value2).map(([key, child2]) => [key, json(child2, depth2 + 1, active)]));
  active.delete(value2);
  return result;
}
function object2(value2, required, optional2 = []) {
  if (typeof value2 !== "object" || value2 === null || Array.isArray(value2)) fail3();
  const row2 = value2;
  if (required.some((key) => !Object.hasOwn(row2, key)) || Object.keys(row2).some((key) => !required.includes(key) && !optional2.includes(key))) fail3();
  return row2;
}
function choice(value2, choices) {
  if (!choices.includes(value2)) fail3();
  return value2;
}
function text3(value2, max) {
  if (typeof value2 !== "string" || value2.length > max || /[\u0000-\u001f\u007f]/u.test(value2) || new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(value2)) !== value2) fail3();
  return value2;
}
function identity(value2) {
  if (!isNativeSessionId(value2)) fail3();
  return value2;
}
function epoch2(value2) {
  if (typeof value2 !== "string" || !/^[a-f0-9]{64}$/u.test(value2)) fail3();
  return value2;
}
function array(value2, max = 4096) {
  if (!Array.isArray(value2) || value2.length > max) fail3();
  return value2;
}
function bool(value2) {
  if (typeof value2 !== "boolean") fail3();
  return value2;
}
function depth(value2) {
  if (typeof value2 !== "number" || !Number.isSafeInteger(value2) || value2 < 1 || value2 > 4096) fail3();
  return value2;
}
function availability(value2) {
  const row2 = object2(value2, ["enabled"], ["reason"]);
  if (row2.enabled === true && !Object.hasOwn(row2, "reason")) return { enabled: true };
  if (row2.enabled !== false) fail3();
  return { enabled: false, reason: choice(row2.reason, ROLE_CONTROL_DISABLED_REASONS) };
}
function capabilities(value2) {
  const row2 = object2(value2, ["prompt", "interrupt", "images", "runtime"]);
  return { prompt: availability(row2.prompt), interrupt: availability(row2.interrupt), images: availability(row2.images), runtime: parseSubagentRuntimeAdmissionView(row2.runtime) };
}
function child(value2) {
  const row2 = object2(value2, ["id", "parentSessionId", "mode", "activity", "readonly", "controls"], ["label", "invocation", "routeComparison"]);
  const controls = object2(row2.controls, ["prompt", "interrupt"]);
  const mode = choice(row2.mode, ["one-shot", "continuable", "unknown"]);
  const prompt = availability(controls.prompt), interrupt = availability(controls.interrupt);
  const readonly = bool(row2.readonly);
  if (readonly !== (!prompt.enabled && !interrupt.enabled) || mode !== "continuable" && (prompt.enabled || interrupt.enabled)) fail3();
  const invocation = Object.hasOwn(row2, "invocation") ? parseDsmmInvocationView(row2.invocation) : void 0;
  const routeComparison = Object.hasOwn(row2, "routeComparison") ? parseDsmmRoleRouteComparison(row2.routeComparison) : void 0;
  const id3 = identity(row2.id);
  if (invocation !== void 0 && (invocation.childId !== id3 || invocation.mode !== mode)) fail3();
  if (routeComparison !== void 0 && routeComparison.childId !== id3) fail3();
  return {
    id: id3,
    parentSessionId: identity(row2.parentSessionId),
    mode,
    activity: choice(row2.activity, ["running", "inactive"]),
    readonly,
    controls: { prompt, interrupt },
    ...Object.hasOwn(row2, "label") ? { label: text3(row2.label, 120) } : {},
    ...invocation === void 0 ? {} : { invocation },
    ...routeComparison === void 0 ? {} : { routeComparison }
  };
}
function snapshot3(value2) {
  const row2 = object2(value2, ["sessionId", "admissionEpoch", "children", "capabilities"]);
  const sessionId2 = identity(row2.sessionId), admissionEpoch = epoch2(row2.admissionEpoch), children = array(row2.children).map(child);
  if (children.some((child2) => child2.parentSessionId !== sessionId2)) fail3();
  return { sessionId: sessionId2, admissionEpoch, children, capabilities: capabilities(row2.capabilities) };
}
function descendants(value2) {
  const row2 = object2(value2, ["sessionId", "admissionEpoch", "descendants"]);
  const sessionId2 = identity(row2.sessionId), admissionEpoch = epoch2(row2.admissionEpoch);
  const entries = array(row2.descendants).map((value3) => {
    const entry = object2(value3, ["kind", "depth"], ["child", "hasChildren", "id", "parentSessionId", "reason"]);
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
function promptRequest(value2) {
  const row2 = object2(value2, ["requestId", "parentSessionId", "childSessionId", "mode", "delivery", "content"], ["clientTimeZone"]);
  if (row2.mode !== "continuable") fail3();
  const content2 = array(row2.content, Number.MAX_SAFE_INTEGER).map((value3) => {
    const part = object2(value3, ["type"], ["text", "mediaType", "data", "name"]);
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
    requestId: identity(row2.requestId),
    parentSessionId: identity(row2.parentSessionId),
    childSessionId: identity(row2.childSessionId),
    mode: "continuable",
    delivery: choice(row2.delivery, ["queue", "steer"]),
    content: content2,
    ...Object.hasOwn(row2, "clientTimeZone") ? { clientTimeZone: text3(row2.clientTimeZone, 128) } : {}
  };
}
function interruptRequest(value2) {
  const row2 = object2(value2, ["parentSessionId", "childSessionId", "mode"]);
  if (row2.mode !== "continuable") fail3();
  return { parentSessionId: identity(row2.parentSessionId), childSessionId: identity(row2.childSessionId), mode: "continuable" };
}
function promptReceipt(value2) {
  const row2 = object2(value2, ["messageId"]);
  return { messageId: identity(row2.messageId) };
}
function interruptReceipt(value2) {
  const row2 = object2(value2, ["accepted"]);
  if (row2.accepted !== true) fail3();
  return { accepted: true };
}
function errorInfo2(value2) {
  const row2 = object2(value2, ["code"], ["field", "reason"]);
  return {
    code: choice(row2.code, ROLE_CONTROL_ERROR_CODES),
    ...Object.hasOwn(row2, "field") ? { field: choice(row2.field, ROLE_CONTROL_ERROR_FIELDS) } : {},
    ...Object.hasOwn(row2, "reason") ? { reason: choice(row2.reason, ROLE_CONTROL_DISABLED_REASONS) } : {}
  };
}
var parseRoleControlErrorInfo = (value2) => errorInfo2(json(value2));
var parseChildSessionSnapshot = (value2) => snapshot3(json(value2));
var parseRoleControlDescendants = (value2) => descendants(json(value2));
var parseRoleControlPromptRequest = (value2) => promptRequest(json(value2));
function codec3(symbol, parse3) {
  return { mode: "strict", typeSymbol: `@dsmm/dsmm#${symbol}`, create: () => ({ parse: (value2) => parse3(json(value2)) }) };
}
function descriptor3(method, result, request2) {
  return {
    id: `@dsmm/dsmm-children#dsmmChildren/${method}`,
    service: "dsmmChildren",
    namespace: "dsmmChildren",
    method,
    invocation: { kind: "direct" },
    parameters: [
      { name: "sessionId", wire: "sessionId", source: "json", codec: codec3("ChildControlSessionId", identity) },
      ...request2 === void 0 ? [] : [{ name: "request", wire: "request", source: "json", codec: request2 }]
    ],
    result
  };
}
var ROLE_CONTROL_REMOTE = { package: "@dsmm/dsmm-children", descriptors: [
  descriptor3("describe", codec3("ChildSessionSnapshot", snapshot3)),
  descriptor3("descendants", codec3("RoleControlDescendantsSnapshot", descendants)),
  descriptor3("prompt", codec3("SubagentPromptReceipt", promptReceipt), codec3("SubagentPromptRequest", promptRequest)),
  descriptor3("interrupt", codec3("SubagentInterruptReceipt", interruptReceipt), codec3("RoleControlInterruptRequest", interruptRequest))
] };
var ROLE_CONTROL_HOST = { package: ROLE_CONTROL_REMOTE.package, face: "host", schemas: [], model: { services: [], events: [], objects: [] }, invocations: ROLE_CONTROL_REMOTE.descriptors };

// src/permission-remote.ts
function fail4() {
  throw new TypeError("Invalid permission DTO.");
}
function text4(value2, max = 512) {
  if (typeof value2 !== "string" || value2.length === 0 || value2.length > max || /[\u0000-\u001f\u007f]/u.test(value2)) fail4();
  return value2;
}
function parsePermissionSessionId(value2) {
  return text4(value2, 256);
}
function parseRuntime(value2) {
  const runtime = permissionRuleRow(value2, ["savedRevision", "runtimeRevision", "state", "mounted", "restartRequired"]);
  if (!["synced", "updating", "unsynced"].includes(runtime.state) || typeof runtime.mounted !== "boolean" || typeof runtime.restartRequired !== "boolean") fail4();
  return { savedRevision: permissionRevision(runtime.savedRevision), runtimeRevision: permissionRevision(runtime.runtimeRevision), state: runtime.state, mounted: runtime.mounted, restartRequired: runtime.restartRequired };
}
function parseCapabilities(value2) {
  const input = permissionRuleRow(value2, ["limits", "runtime", "tools"]);
  const limits = permissionRuleRow(input.limits, ["outsideReads", "finalInode", "scopedMemory", "webFetch", "webSearchDestinations", "proxyAddressBinding", "shellSockets", "providerAuthMcp"]);
  if (limits.outsideReads !== "tool-call-boundary" || limits.finalInode !== false || limits.scopedMemory !== "not-provided-by-native-rules" || limits.webFetch !== "native-public-only" || limits.webSearchDestinations !== "unsupported" || limits.proxyAddressBinding !== "native-proxy-dependent" || limits.shellSockets !== "native-executor-dependent" || limits.providerAuthMcp !== "not-covered") fail4();
  if (!Array.isArray(input.tools) || input.tools.length > 1024) fail4();
  const tools = [];
  const names = /* @__PURE__ */ new Set();
  for (const value3 of input.tools) {
    const tool = permissionRuleRow(value3, ["name", "kind", "approval", "scopedMemory"]), name = text4(tool.name);
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
function parsePermissionRulesResult(value2) {
  const input = permissionRuleRow(value2, ["snapshot", "runtime"], ["capabilities"]), snapshot4 = permissionRuleRow(input.snapshot, ["revision", "policy"]);
  return {
    snapshot: { revision: permissionRevision(snapshot4.revision), policy: resolvePermissionControl(snapshot4.policy) },
    runtime: parseRuntime(input.runtime),
    ...Object.hasOwn(input, "capabilities") ? { capabilities: parseCapabilities(input.capabilities) } : {}
  };
}
var codec4 = (name, parse3) => ({ mode: "strict", typeSymbol: `@dsmm/dsmm#${name}`, create: () => ({ parse: parse3 }) });
function descriptor4(method, result, request2) {
  return {
    id: `@dsmm/dsmm-permissions#dsmmPermissions/${method}`,
    service: "dsmmPermissions",
    namespace: "dsmmPermissions",
    method,
    invocation: { kind: "direct" },
    parameters: [
      { name: "sessionId", wire: "sessionId", source: "json", codec: codec4("PermissionSessionId", parsePermissionSessionId) },
      ...request2 === void 0 ? [] : [{ name: "request", wire: "request", source: "json", codec: request2 }]
    ],
    result
  };
}
var PERMISSION_REMOTE = { package: "@dsmm/dsmm-permissions", descriptors: [
  descriptor4("describeRules", codec4("PermissionRulesResult", parsePermissionRulesResult)),
  descriptor4("saveRules", codec4("PermissionRulesResult", parsePermissionRulesResult), codec4("PermissionRulesSaveRequest", parsePermissionRulesSave))
] };
var PERMISSION_HOST = { package: PERMISSION_REMOTE.package, face: "host", schemas: [], model: { services: [], events: [], objects: [] }, invocations: PERMISSION_REMOTE.descriptors };

// src/client/permission-client.ts
var PermissionClientError = class extends Error {
  constructor(code2) {
    super("Permission operation unavailable.");
    this.code = code2;
  }
};
var codes = /* @__PURE__ */ new Set(["not-owned", "stale", "cancelled", "unavailable", "validation", "not-found", "scope-unavailable", "replayed", "denied"]);
function permissionClient(connection) {
  return async (method, args, signal) => {
    const descriptor6 = PERMISSION_REMOTE.descriptors.find((item) => item.method === method);
    const payload = {};
    descriptor6.parameters.forEach((parameter, index) => {
      payload[parameter.wire] = args[index];
    });
    let result;
    try {
      result = await connection.rpc.call("/api", `dsmmPermissions/${method}`, { args: payload }, signal);
    } catch {
      throw new PermissionClientError(signal.aborted ? "cancelled" : "transport");
    }
    if (!result.ok) {
      const code2 = Reflect.get(result.error.details, "code");
      throw new PermissionClientError(result.error.code === "dsmm-permissions/refused" && codes.has(code2) ? code2 : "unavailable");
    }
    signal.throwIfAborted();
    try {
      if (descriptor6.result.mode !== "strict") throw new Error("Strict permission codec required.");
      return descriptor6.result.create().parse(result.value);
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
    const value2 = this.state.rules;
    return value2 !== null && value2.runtime.state === "synced" && value2.runtime.savedRevision === value2.snapshot.revision && value2.runtime.runtimeRevision === value2.snapshot.revision;
  }
  canEdit(generation) {
    return this.live(generation) && this.state.rulesIssue === null && this.synchronized() && this.state.busy === null;
  }
  canSave(generation) {
    return this.canEdit(generation) && !this.state.reading && this.state.dirty && this.state.draft?.editor === null;
  }
  async refresh(generation, discard = false) {
    if (!this.live(generation) || this.state.reading || this.state.busy !== null) return;
    const sequence = ++this.requestSequence, signal = this.request.signal, id3 = this.state.sessionId;
    this.publish({ reading: true });
    const [rules] = await Promise.allSettled([this.invoke("describeRules", [id3], signal)]);
    if (!this.live(generation) || signal.aborted || sequence !== this.requestSequence) return;
    if (rules.status === "rejected") {
      this.publish({ rules: null, rulesIssue: this.issue(rules.reason), reading: false });
    } else {
      const value2 = rules.value;
      const retain = this.state.dirty && !discard;
      this.publish({
        rules: value2,
        rulesIssue: retain && this.state.base?.revision !== value2.snapshot.revision ? "stale" : null,
        reading: false,
        ...retain ? {} : { base: value2.snapshot, draft: draftOf(value2.snapshot.policy), dirty: false }
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
    this.edit(generation, { upsert: [...draft2.upsert.filter((row2) => row2.id !== editor.id), structuredClone(editor)], revoke: draft2.revoke.filter((id3) => id3 !== editor.id), editor: null });
  }
  stageRevoke(generation, id3) {
    const draft2 = this.state.draft;
    if (draft2 === null || !this.state.base?.policy.rules.some((rule) => rule.id === id3)) return;
    this.edit(generation, { upsert: draft2.upsert.filter((row2) => row2.id !== id3), revoke: [.../* @__PURE__ */ new Set([...draft2.revoke, id3])], editor: draft2.editor?.id === id3 ? null : draft2.editor });
  }
  begin(busy) {
    this.cancel();
    this.publish({ busy, notice: null });
    return { signal: this.request.signal, id: this.state.sessionId };
  }
  async save(generation) {
    const request2 = permissionChanges(this.state);
    if (!this.canSave(generation) || request2 === null) return;
    const current2 = this.begin("save");
    try {
      const result = await this.invoke("saveRules", [current2.id, request2], current2.signal);
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
var import_dsh_client_ui_primitives10 = require("@deepseek-ai/dsh-client-ui-primitives");

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
    const value2 = JSON.parse(raw);
    return value2 !== null && typeof value2 === "object" && !Array.isArray(value2) ? value2 : void 0;
  } catch {
    return void 0;
  }
}
function requestedRoleTool(toolName, raw) {
  const args = roleToolArguments(raw), kind = toolName === "dsmm_category" ? "category" : "role";
  const fixed = Object.hasOwn(roleToolKeys, toolName) ? roleToolKeys[toolName] : void 0;
  const candidate2 = fixed ?? args?.[kind];
  const target = typeof candidate2 === "string" && (kind === "category" ? categories : roles).has(candidate2) ? candidate2 : void 0;
  const level2 = typeof args?.level === "string" && ["normal", "low", "high", "max"].includes(args.level) ? args.level : void 0;
  return { kind, target, level: level2, description: typeof args?.description === "string" ? args.description : void 0 };
}
function preparingRoleTool(toolName, args) {
  const received = Object.fromEntries(args.keys().flatMap((key) => {
    const value2 = args.text(key) ?? args.value(key);
    return value2 === void 0 ? [] : [[key, value2]];
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
    const value2 = parseDsmmInvocationView(meta);
    return (toolName === "dsmm_category" ? categories : roles).has(value2.role) ? value2 : void 0;
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
var import_jsx_runtime13 = require("react/jsx-runtime");
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
  const code2 = (value2) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(import_dsh_client_ui_primitives10.CodeBlock, { code: value2, copyLabel: t("copy"), copiedLabel: t("copied") });
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dsmm-role-tool", "data-dsmm-role-tool": props.toolName, "data-identity": actual === void 0 ? "requested" : "actual", "data-state": state, children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
      import_dsh_client_ui_primitives10.DisclosureRow,
      {
        title,
        titleClassName: "dsmm-role-title",
        rowClassName: "dsmm-role-heading",
        contentClassName: "dsmm-role-text",
        icon: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(import_dsh_client_ui_primitives10.StateDot, { state: state === "error" ? "error" : state === "stopped" ? "warning" : result === void 0 ? "ongoing" : state === "background" ? "idle" : "done" }),
        open: expanded,
        expandable: true,
        onToggle: toggle,
        expandOnRowClick: true,
        children: /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dsmm-role-body", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("p", { children: [
            props.toolName,
            " · ",
            props.callId
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("p", { className: "dsmm-role-status", children: [
            t("requested"),
            " ",
            t(requested.kind),
            ": ",
            requested.target === void 0 ? t("unknown") : roleToolDisplay(requested.target)
          ] }),
          requested.description !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "dsmm-role-status", children: requested.description }),
          actual !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("p", { children: [
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
            /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("p", { children: [
              t("routeSource"),
              ": ",
              actual.routeSource,
              " · ",
              t("route"),
              ": ",
              actual.route === void 0 ? t("unknown") : `${actual.route.provider}/${actual.route.model}${actual.route.reasoningEffort === void 0 ? "" : ` · ${actual.route.reasoningEffort}`}`
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { children: t(props.phase === "preparing" ? "preparingArgs" : "args") }),
            raw === "" ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { children: t("emptyArgs") }) : code2(raw)
          ] }),
          result !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
            actual === void 0 && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { children: t("unavailable") }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { children: t("output") }),
              code2(JSON.stringify(result.content, null, 2))
            ] }),
            result.error != null && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { children: t("failure") }),
              code2(JSON.stringify(result.error, null, 2))
            ] }),
            result.meta != null && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { children: t("metadata") }),
              code2(JSON.stringify(result.meta, null, 2))
            ] })
          ] })
        ] })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dsmm-role-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "dsmm-role-status", role: "status", children: t(state) }),
      props.inspect !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(import_dsh_client_ui_primitives10.Button, { variant: "ghost", size: "sm", onClick: props.inspect, children: t("inspect") })
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

// src/history-codec.ts
var codes2 = ["validation", "not-owned", "not-found", "unsupported-host", "unsupported-backend", "unavailable", "busy", "stale", "cancelled", "authorization-required", "child-owner-required", "format-unavailable", "initialization-failed"];
function invalid2() {
  throw new TypeError("Invalid history continuation request or response");
}
function object3(input, required, optional2 = []) {
  if (!input || typeof input !== "object" || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input)) || Object.getOwnPropertySymbols(input).length || Object.values(Object.getOwnPropertyDescriptors(input)).some((row3) => !Object.hasOwn(row3, "value") || !row3.enumerable)) invalid2();
  const row2 = input;
  if (required.some((key) => !Object.hasOwn(row2, key)) || Object.keys(row2).some((key) => !required.includes(key) && !optional2.includes(key))) invalid2();
  return row2;
}
function text5(input, maximum = 4096) {
  if (typeof input !== "string" || input.length > maximum) invalid2();
  return input;
}
function bool2(input) {
  if (typeof input !== "boolean") invalid2();
  return input;
}
function list(input, parse3) {
  if (!Array.isArray(input)) invalid2();
  return input.map((value2) => parse3(value2));
}
function code(input) {
  if (!codes2.includes(input)) invalid2();
  return input;
}
function historySessionId(input) {
  if (!isNativeSessionId(input)) invalid2();
  return input;
}
function intentId(input) {
  const id3 = text5(input, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id3)) invalid2();
  return id3;
}
function profileId(input) {
  if (input === null) return null;
  if (!isProfileId(input)) invalid2();
  return input;
}
function presetId(input) {
  return historySessionId(input);
}
function choice2(input) {
  const row2 = object3(input, ["id", "label"]);
  return { id: text5(row2.id, 256), label: text5(row2.label, 120) };
}
function historyJson(input, depth2 = 0, active = /* @__PURE__ */ new Set()) {
  if (depth2 > 32) invalid2();
  if (input === null || typeof input === "boolean" || typeof input === "string") return input;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) invalid2();
    return input;
  }
  if (!input || typeof input !== "object") invalid2();
  if (active.has(input)) invalid2();
  active.add(input);
  try {
    if (Array.isArray(input)) {
      if (Object.getOwnPropertySymbols(input).length || Object.entries(Object.getOwnPropertyDescriptors(input)).some(([key, property2]) => key !== "length" && (!/^(0|[1-9][0-9]*)$/u.test(key) || !Object.hasOwn(property2, "value") || !property2.enumerable))) invalid2();
      return input.map((value2) => historyJson(value2, depth2 + 1, active));
    }
    const row2 = object3(input, Object.keys(input));
    return Object.fromEntries(Object.entries(row2).map(([key, value2]) => [key, historyJson(value2, depth2 + 1, active)]));
  } finally {
    active.delete(input);
  }
}
function parseHistoryFailure(input) {
  const row2 = object3(input, ["code", "storageEffects"]);
  if (row2.storageEffects !== "none" && row2.storageEffects !== "may-have-committed") invalid2();
  return { code: code(row2.code), storageEffects: row2.storageEffects };
}
function parseHistoryStatus(input) {
  const row2 = object3(input, ["sessionId", "readable", "execution", "compatibleHost"], ["reason"]);
  if (row2.readable !== "readable" && row2.readable !== "unavailable") invalid2();
  if (!["authorization-required", "activating", "active", "unavailable"].includes(String(row2.execution))) invalid2();
  return { sessionId: historySessionId(row2.sessionId), readable: row2.readable, execution: row2.execution, compatibleHost: bool2(row2.compatibleHost), ...row2.reason === void 0 ? {} : { reason: code(row2.reason) } };
}
function parseHistoryChoices(input) {
  const row2 = object3(input, ["presets", "profiles"]);
  return { presets: list(row2.presets, (value2) => {
    const result = choice2(value2);
    presetId(result.id);
    return result;
  }), profiles: list(row2.profiles, (value2) => {
    const result = choice2(value2);
    profileId(result.id);
    return result;
  }) };
}
function parseHistoryPreviewRequest(input) {
  const row2 = object3(input, ["sessionId", "preset", "profileId"]);
  return { sessionId: historySessionId(row2.sessionId), preset: presetId(row2.preset), profileId: profileId(row2.profileId) };
}
function parseHistoryConfirmRequest(input) {
  const row2 = object3(input, ["sessionId", "intentId", "processPending", "acceptMigration"]);
  return { sessionId: historySessionId(row2.sessionId), intentId: intentId(row2.intentId), processPending: bool2(row2.processPending), acceptMigration: bool2(row2.acceptMigration) };
}
function candidate(input) {
  const row2 = object3(input, ["preset", "profile", "model", "roles", "restrictions", "differences"]);
  const model = object3(row2.model, ["provider", "model"], ["reasoningEffort"]);
  return {
    preset: choice2(row2.preset),
    profile: row2.profile === null ? null : choice2(row2.profile),
    model: { provider: text5(model.provider, 256), model: text5(model.model, 256), ...model.reasoningEffort === void 0 ? {} : { reasoningEffort: text5(model.reasoningEffort, 128) } },
    roles: list(row2.roles, choice2),
    restrictions: list(row2.restrictions, (value2) => text5(value2)),
    differences: list(row2.differences, (value2) => text5(value2))
  };
}
function parseHistoryPreview(input) {
  const row2 = object3(input, ["sessionId", "intentId", "cwd", "candidate", "migrationRequired", "pending"]), pending = object3(row2.pending, ["nextTurn", "nextStep"]);
  return { sessionId: historySessionId(row2.sessionId), intentId: intentId(row2.intentId), cwd: text5(row2.cwd), candidate: candidate(row2.candidate), migrationRequired: bool2(row2.migrationRequired), pending: { nextTurn: list(pending.nextTurn, historyJson), nextStep: list(pending.nextStep, historyJson) } };
}
function parseHistoryResult(input) {
  const row2 = object3(input, ["sessionId", "execution"]);
  if (row2.execution !== "active") invalid2();
  return { sessionId: historySessionId(row2.sessionId), execution: "active" };
}

// src/history-remote.ts
function codec5(name, parse3) {
  return { mode: "strict", typeSymbol: `@dsmm/dsmm#${name}`, create: () => ({ parse: (value2) => parse3(historyJson(value2)) }) };
}
function descriptor5(method, result, request2, session = true) {
  return {
    id: `@dsmm/dsmm-history#dsmmHistory/${method}`,
    service: "dsmmHistory",
    namespace: "dsmmHistory",
    method,
    invocation: { kind: "direct" },
    parameters: [...session ? [{ name: "sessionId", wire: "sessionId", source: "json", codec: codec5("HistorySessionId", historySessionId) }] : [], ...request2 ? [{ name: "request", wire: "request", source: "json", codec: request2 }] : []],
    result
  };
}
var HISTORY_REMOTE = { package: "@dsmm/dsmm-history", descriptors: [
  descriptor5("describe", codec5("HistoryStatus", parseHistoryStatus)),
  descriptor5("choices", codec5("HistoryChoices", parseHistoryChoices), void 0, false),
  descriptor5("preview", codec5("HistoryPreview", parseHistoryPreview), codec5("HistoryPreviewRequest", parseHistoryPreviewRequest)),
  descriptor5("confirm", codec5("HistoryContinuationResult", parseHistoryResult), codec5("HistoryConfirmRequest", parseHistoryConfirmRequest))
] };
var HISTORY_HOST = { package: HISTORY_REMOTE.package, face: "host", schemas: [], model: { services: [], events: [], objects: [] }, invocations: HISTORY_REMOTE.descriptors };

// src/client/history-entry.tsx
var import_react12 = require("react");

// src/client/HistoryContinuation.tsx
var import_react11 = require("react");
var import_dsh_client_ui_primitives11 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/history-locales.ts
var en2 = {
  title: "Continue this session",
  preset: "Current agent preset",
  profile: "Session configuration",
  baseline: "Use deployment defaults",
  choose: "Choose a current preset",
  preview: "Review continuation",
  confirm: "Continue this session",
  refresh: "Refresh status",
  loading: "Loading current configuration…",
  preparing: "Preparing confirmation…",
  confirming: "Activating session…",
  active: "This session is active. Continue using the native conversation.",
  browsing: "History remains available without continuing execution.",
  unknown: "The result is not confirmed. Refresh status before taking another action.",
  pending: "Pending input",
  pendingWarning: "These stored inputs are untrusted. Continuing processes this exact pending set under current permissions; it does not restore old approvals.",
  consent: "Process the pending inputs shown above",
  migration: "Publish the required native format migration and recovery entries",
  effects: "Native recovery entries or a migration may already have been committed. History and pending input are not rolled back.",
  model: "Current model",
  roles: "Current roles",
  permissions: "Current restrictions",
  differences: "Changes to execution",
  project: "Project",
  noPending: "No pending inputs.",
  nextTurn: "Next turn",
  nextStep: "Next step",
  candidate: "Configuration to be used",
  disconnected: "Connect to the local Host to review continuation.",
  reasons: {
    validation: "The request is invalid. Refresh and review the selection.",
    "not-owned": "Use the current local Host operator connection.",
    "not-found": "The stored session is unavailable.",
    "unsupported-host": "A compatible Host with read-only history following is required. The original Desktop has not been patched by this plugin.",
    "unsupported-backend": "This storage backend cannot validate continuation before writing.",
    unavailable: "Current execution services are unavailable. History can still be inspected.",
    busy: "An activation or other owner is already using this session. Refresh its status.",
    stale: "The session or current configuration changed. Review a new confirmation.",
    cancelled: "Continuation was cancelled. Refresh before trying again.",
    "authorization-required": "Review the current configuration and explicitly confirm continuation.",
    "child-owner-required": "This child can be browsed here. Continuing requires its exact live parent owner.",
    "format-unavailable": "The native reader could not load this format. Keep the existing history view and inspect its diagnostic.",
    "initialization-failed": "Execution initialization failed. Refresh status; do not replay the request."
  }
};
var historyLocales = { en: en2, zh: {
  title: "继续此会话",
  preset: "当前 Agent 预设",
  profile: "本次会话配置",
  baseline: "使用部署默认配置",
  choose: "选择当前可用的预设",
  preview: "查看继续方案",
  confirm: "继续此会话",
  refresh: "刷新状态",
  loading: "正在读取当前配置…",
  preparing: "正在准备确认信息…",
  confirming: "正在激活会话…",
  active: "此会话已激活，可继续使用原生对话界面。",
  browsing: "不继续执行也可以浏览历史。",
  unknown: "结果待确认。请先刷新状态，不要重复执行。",
  pending: "待处理输入",
  pendingWarning: "以下历史输入是不可信内容。继续后将按当前权限处理这一组输入，不恢复旧审批。",
  consent: "处理上方列出的待处理输入",
  migration: "允许发布所需的原生格式迁移和恢复记录",
  effects: "原生恢复记录或迁移可能已经提交，不承诺回滚历史或待处理输入。",
  model: "当前模型",
  roles: "当前角色",
  permissions: "当前限制",
  differences: "执行变化",
  project: "项目",
  noPending: "没有待处理输入。",
  nextTurn: "下一轮",
  nextStep: "下一步",
  candidate: "将采用的配置",
  disconnected: "连接本地 Host 后可查看继续方案。",
  reasons: {
    validation: "请求无效，请刷新后重新查看选择。",
    "not-owned": "请使用当前本地 Host 的操作者连接。",
    "not-found": "找不到该持久化会话。",
    "unsupported-host": "需要支持只读历史跟随的兼容 Host。仅安装插件不会修补原版 Desktop。",
    "unsupported-backend": "当前存储后端不能在写入前校验继续权限。",
    unavailable: "当前执行服务不可用，仍可查看历史。",
    busy: "该会话正被其他执行者或激活操作使用，请刷新状态。",
    stale: "会话或当前配置已变化，请重新查看确认信息。",
    cancelled: "继续操作已取消，请刷新后再试。",
    "authorization-required": "请查看当前配置并明确确认继续。",
    "child-owner-required": "此处可浏览子会话，继续执行需要其真实存活的父级所有者。",
    "format-unavailable": "原生读取器无法加载此格式。请保留现有历史视图并查看诊断。",
    "initialization-failed": "执行初始化失败，请刷新状态，不要重放请求。"
  }
} };

// src/client/HistoryContinuation.tsx
var import_jsx_runtime14 = require("react/jsx-runtime");
function HistoryContinuation({ controller, locale = "en" }) {
  const state = (0, import_react11.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const t = historyLocales[locale], id3 = (0, import_react11.useId)();
  const [preset, setPreset] = (0, import_react11.useState)(""), [profile, setProfile] = (0, import_react11.useState)("");
  const proposal = state.preview;
  const [consent, setConsent] = (0, import_react11.useState)({ proposal: null, pending: false, migration: false });
  const pending = consent.proposal === proposal && consent.pending, migration = consent.proposal === proposal && consent.migration;
  (0, import_react11.useEffect)(() => {
    setPreset("");
    setProfile("");
  }, [state.sessionId, controller]);
  const busy = ["loading", "previewing", "confirming"].includes(state.phase);
  const selectable = state.phase === "ready" && state.status?.execution === "authorization-required" && state.status.compatibleHost && state.choices !== null;
  const selectedMatches = proposal?.candidate.preset.id === preset && (proposal?.candidate.profile?.id ?? "") === profile;
  const reason = state.issue?.code ?? (state.status?.compatibleHost === false ? "unsupported-host" : state.status?.reason);
  const notice = state.phase === "disconnected" ? t.disconnected : state.phase === "loading" ? t.loading : state.phase === "previewing" ? t.preparing : state.phase === "confirming" || state.status?.execution === "activating" ? t.confirming : state.phase === "unknown" ? t.unknown : state.status?.execution === "active" ? t.active : t.browsing;
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("section", { className: "dsmm-profiles", "aria-labelledby": `${id3}-heading`, "aria-busy": busy, "data-dsmm-history-continuation": true, children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "dsmm-session-scope", children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h3", { id: `${id3}-heading`, children: t.title }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { role: "status", children: notice }),
    reason && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { role: "alert", children: t.reasons[reason] }),
    state.issue?.storageEffects === "may-have-committed" && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { children: t.effects }),
    selectable && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("label", { htmlFor: `${id3}-preset`, children: t.preset }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("select", { id: `${id3}-preset`, value: preset, onChange: (event) => setPreset(event.currentTarget.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: "", children: t.choose }),
          state.choices.presets.map((row2) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: row2.id, children: row2.label || row2.id }, row2.id))
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("label", { htmlFor: `${id3}-profile`, children: t.profile }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("select", { id: `${id3}-profile`, value: profile, onChange: (event) => setProfile(event.currentTarget.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: "", children: t.baseline }),
          state.choices.profiles.map((row2) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: row2.id, children: row2.label || row2.id }, row2.id))
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "dsmm-actions", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives11.Button, { type: "button", variant: "outline", disabled: !preset || !state.choices.presets.some((row2) => row2.id === preset), onClick: () => {
        void controller.preview(state, preset, profile || null);
      }, children: t.preview }) })
    ] }),
    proposal && selectedMatches && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "dsmm-session-scope", "aria-labelledby": `${id3}-proposal`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h4", { id: `${id3}-proposal`, children: t.candidate }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { children: [
        proposal.candidate.preset.label || proposal.candidate.preset.id,
        " · ",
        proposal.candidate.profile?.label || proposal.candidate.profile?.id || t.baseline
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { children: [
        t.project,
        ": ",
        proposal.cwd
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { children: [
        t.model,
        ": ",
        proposal.candidate.model.provider,
        "/",
        proposal.candidate.model.model,
        proposal.candidate.model.reasoningEffort ? ` (${proposal.candidate.model.reasoningEffort})` : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { children: [
        t.roles,
        ": ",
        proposal.candidate.roles.map((row2) => row2.label || row2.id).join(", ")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h4", { children: t.permissions }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("ul", { children: proposal.candidate.restrictions.map((text6, index) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("li", { children: text6 }, index)) })
      ] }),
      proposal.candidate.differences.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h4", { children: t.differences }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("ul", { children: proposal.candidate.differences.map((text6, index) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("li", { children: text6 }, index)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h4", { children: t.pending }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { id: `${id3}-pending-hint`, children: t.pendingWarning }),
        proposal.pending.nextTurn.length === 0 && proposal.pending.nextStep.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { children: t.noPending }) : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("label", { htmlFor: `${id3}-next-turn`, children: t.nextTurn }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("textarea", { id: `${id3}-next-turn`, rows: 5, readOnly: true, value: JSON.stringify(proposal.pending.nextTurn, null, 2) }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("label", { htmlFor: `${id3}-next-step`, children: t.nextStep }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("textarea", { id: `${id3}-next-step`, rows: 5, readOnly: true, value: JSON.stringify(proposal.pending.nextStep, null, 2) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("input", { type: "checkbox", checked: pending, disabled: busy, "aria-describedby": `${id3}-pending-hint`, onChange: (event) => setConsent({ proposal, pending: event.currentTarget.checked, migration }) }),
          " ",
          t.consent
        ] }),
        proposal.migrationRequired && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("input", { type: "checkbox", checked: migration, disabled: busy, onChange: (event) => setConsent({ proposal, pending, migration: event.currentTarget.checked }) }),
          " ",
          t.migration
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "dsmm-actions", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives11.Button, { type: "button", disabled: busy || state.phase !== "ready" || !pending || proposal.migrationRequired && !migration, onClick: () => {
        void controller.confirm(state, pending, migration);
      }, children: t.confirm }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "dsmm-actions", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives11.Button, { type: "button", variant: "outline", disabled: busy || state.phase === "disconnected", onClick: () => {
      void controller.refresh(state);
    }, children: t.refresh }) })
  ] }) });
}

// src/client/history-controller.ts
function initial(sessionId2 = null) {
  return { sessionId: sessionId2, phase: sessionId2 === null ? "disconnected" : "loading", status: null, choices: null, preview: null, issue: null };
}
function value(result, parse3) {
  if (result.ok) return parse3(result.value);
  throw result.error;
}
function failure(error, confirming = false) {
  if (error && typeof error === "object" && Reflect.get(error, "code") === "dsmm-history/refused") {
    try {
      return parseHistoryFailure(Reflect.get(error, "details"));
    } catch {
    }
  }
  return { code: "unavailable", storageEffects: confirming ? "may-have-committed" : "none" };
}
var HistoryContinuationController = class {
  scope;
  state = initial();
  request;
  disposed = false;
  listeners = /* @__PURE__ */ new Set();
  getSnapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  publish(next) {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
  bind(remote, connection, sessionId2, owner) {
    if (this.disposed) return;
    if (this.scope?.remote === remote && this.scope?.connection === connection && this.scope?.sessionId === sessionId2 && this.scope?.owner === owner) return;
    if (!this.scope && (!remote || !connection || !sessionId2) && this.state.sessionId === sessionId2 && this.state.phase === "disconnected") return;
    this.scope = remote && connection && sessionId2 ? { remote, connection, sessionId: sessionId2, owner } : void 0;
    const scope = this.scope;
    this.request = void 0;
    this.publish({ ...initial(sessionId2), phase: this.scope ? "loading" : "disconnected" });
    if (scope && this.scope === scope) void this.refresh(this.state);
  }
  /** Observed compatibility only, never a pre-follow navigation or write-admission guard. */
  get historyBrowsingAllowed() {
    return this.state.status?.compatibleHost === true;
  }
  dispose() {
    this.scope = void 0;
    this.request = void 0;
    this.disposed = true;
    this.listeners.clear();
  }
  async refresh(expected) {
    const scope = this.scope;
    if (!scope || this.state !== expected || this.state.phase === "confirming") return;
    const request2 = this.request = {};
    this.publish({ ...this.state, phase: "loading", preview: null, issue: null });
    if (this.scope !== scope || this.request !== request2) return;
    try {
      const status = value(await scope.remote.describe(scope.sessionId), parseHistoryStatus);
      if (this.scope !== scope || this.request !== request2) return;
      if (status.sessionId !== scope.sessionId) throw new TypeError("Mismatched history response");
      const choices = status.execution === "authorization-required" ? value(await scope.remote.choices(), parseHistoryChoices) : null;
      if (this.scope !== scope || this.request !== request2) return;
      this.publish({ sessionId: scope.sessionId, phase: "ready", status, choices, preview: null, issue: null });
    } catch (error) {
      if (this.scope === scope && this.request === request2) this.publish({ ...this.state, phase: "ready", issue: failure(error), preview: null });
    }
  }
  async preview(expected, preset, profileId2) {
    const scope = this.scope;
    if (!scope || this.state !== expected || expected.phase !== "ready" || expected.status?.execution !== "authorization-required" || !expected.status.compatibleHost) return;
    const request2 = this.request = {};
    this.publish({ ...this.state, phase: "previewing", preview: null, issue: null });
    if (this.scope !== scope || this.request !== request2) return;
    try {
      const preview = value(await scope.remote.preview(scope.sessionId, { sessionId: scope.sessionId, preset, profileId: profileId2 }), parseHistoryPreview);
      if (this.scope !== scope || this.request !== request2) return;
      if (preview.sessionId !== scope.sessionId || preview.candidate.preset.id !== preset || (preview.candidate.profile?.id ?? null) !== profileId2) throw new TypeError("Mismatched continuation proposal");
      this.publish({ ...this.state, phase: "ready", preview });
    } catch (error) {
      if (this.scope === scope && this.request === request2) this.publish({ ...this.state, phase: "ready", issue: failure(error), preview: null });
    }
  }
  async confirm(expected, processPending, acceptMigration) {
    const scope = this.scope, preview = expected.preview;
    if (!scope || this.state !== expected || expected.phase !== "ready" || !preview || !processPending || preview.migrationRequired && !acceptMigration) return;
    const request2 = this.request = {};
    this.publish({ ...this.state, phase: "confirming", issue: null });
    if (this.scope !== scope || this.request !== request2) return;
    try {
      const receipt = value(await scope.remote.confirm(scope.sessionId, { sessionId: scope.sessionId, intentId: preview.intentId, processPending, acceptMigration }), parseHistoryResult);
      if (this.scope !== scope || this.request !== request2) return;
      if (receipt.sessionId !== scope.sessionId) throw new TypeError("Mismatched continuation receipt");
      this.publish({ ...this.state, phase: "ready", preview: null, status: { sessionId: scope.sessionId, readable: "readable", compatibleHost: true, execution: "active" } });
    } catch (error) {
      if (this.scope !== scope || this.request !== request2) return;
      const issue = failure(error, true);
      this.publish({ ...this.state, phase: issue.storageEffects === "may-have-committed" ? "unknown" : "ready", preview: null, issue });
    }
  }
};

// src/client/history-entry.tsx
var import_jsx_runtime15 = require("react/jsx-runtime");
function HistoryContinuationEntry({ controller, locale, sessionId: sessionId2 }) {
  const state = (0, import_react12.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const language = (0, import_react12.useSyncExternalStore)((listener) => locale.subscribe(listener), () => locale.getSnapshot());
  if (state.sessionId !== sessionId2 || state.status?.execution === "active" || state.phase === "loading" && state.status === null && state.issue === null) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(HistoryContinuation, { controller, locale: language.active === "zh" ? "zh" : "en" });
}
function registerHistoryContinuation(ctx) {
  void ctx.inject(["remote.dsmmHistory"], (historyCtx) => {
    const controller = new HistoryContinuationController(), remote = historyCtx.remote.dsmmHistory;
    let disposed = false;
    let connection, selected;
    let blocks;
    let held;
    let watched, stopBlock;
    const release = () => {
      const owned = held;
      held = void 0;
      if (owned && blocks?.storeFor(owned.id) === owned.store && owned.store.getSnapshot() === owned.block) blocks.set(owned.id, void 0);
    };
    const syncBlock = () => {
      const state = controller.getSnapshot(), id3 = state.sessionId;
      if (disposed || id3 === null || state.status?.execution === "active") {
        stopBlock?.();
        stopBlock = void 0;
        watched = void 0;
        release();
        return;
      }
      if (held && held.id !== id3) release();
      const text6 = historyLocales[historyCtx.locale.getLocale().active === "zh" ? "zh" : "en"];
      const reason = state.phase === "disconnected" ? text6.disconnected : state.phase === "unknown" ? text6.unknown : state.phase === "confirming" || state.status?.execution === "activating" ? text6.confirming : text6.reasons[state.issue?.code ?? (state.status?.compatibleHost === false ? "unsupported-host" : state.status?.reason) ?? "authorization-required"];
      const store = blocks?.storeFor(id3);
      if (watched !== store) {
        stopBlock?.();
        watched = store;
        stopBlock = store?.subscribe(syncBlock);
      }
      if (held && (held.store !== store || held.store.getSnapshot() !== held.block)) held = void 0;
      if (held && (held.id !== id3 || held.block.reason !== reason)) release();
      if (!blocks || !store || held) return;
      if (store.getSnapshot() !== void 0) return;
      const block = { reason };
      held = { id: id3, store, block };
      blocks.set(id3, block);
    };
    const update = () => {
      if (disposed) return;
      const state = selected?.session.getSnapshot();
      const id3 = selected && state?.sessionId === selected.sessionId && !state.removed ? selected.sessionId : null;
      controller.bind(remote, connection?.generation.getSnapshot(), id3, selected);
      syncBlock();
    };
    historyCtx.effect(() => controller.subscribe(syncBlock));
    historyCtx.effect(() => historyCtx.locale.subscribe(syncBlock));
    historyCtx.effect(() => () => {
      disposed = true;
      stopBlock?.();
      release();
      controller.dispose();
    }, "dsmm: history continuation owner");
    historyCtx.slots.inject("conversation.input.dock", () => historyCtx.slots.register({
      name: "conversation.input.dock",
      id: "dsmm-history-continuation",
      order: 10,
      inject: () => ({ controller, locale: historyCtx.locale })
    }, HistoryContinuationEntry));
    void historyCtx.inject(["conversation"], (conversationCtx) => {
      blocks = conversationCtx.conversation.blocks;
      syncBlock();
      conversationCtx.effect(() => () => {
        stopBlock?.();
        stopBlock = void 0;
        watched = void 0;
        release();
        blocks = void 0;
      }, "dsmm: history composer lifetime");
    });
    void historyCtx.inject(["connection"], (connectionCtx) => {
      connection = connectionCtx.connection;
      update();
      connectionCtx.effect(() => connection.generation.subscribe(update));
      connectionCtx.effect(() => () => {
        connection = void 0;
        update();
      }, "dsmm: history connection lifetime");
    });
    void historyCtx.inject(["uiSession", "sessions"], (sessionCtx) => {
      const source = sessionCtx.uiSession.adapter.current, sessions = sessionCtx.sessions;
      let stop;
      const observe = () => {
        const id3 = source.getSnapshot().key;
        const candidate2 = id3 === void 0 ? void 0 : sessions.binding(id3);
        const binding = candidate2?.sessionId === id3 ? candidate2 : void 0;
        if (binding !== selected) {
          stop?.();
          selected = binding;
          stop = binding?.session.subscribe(update);
        }
        update();
      };
      observe();
      sessionCtx.effect(() => source.subscribe(observe));
      sessionCtx.effect(() => sessions.list.subscribe(observe));
      sessionCtx.effect(() => () => {
        stop?.();
        selected = void 0;
        update();
      }, "dsmm: history native scope lifetime");
    });
  });
}

// ../node_modules/.pnpm/zustand@4.4.7_@types+react@18.3.31_immer@10.1.1_react@18.3.1/node_modules/zustand/esm/vanilla.mjs
var import_meta = {};
var createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const destroy = () => {
    if ((import_meta.env ? import_meta.env.MODE : void 0) !== "production") {
      console.warn(
        "[DEPRECATED] The `destroy` method will be unsupported in a future version. Instead use unsubscribe function returned by subscribe. Everything will be garbage-collected if store is garbage-collected."
      );
    }
    listeners.clear();
  };
  const api = { setState, getState, subscribe, destroy };
  state = createState(setState, getState, api);
  return api;
};
var createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;

// ../node_modules/.pnpm/zustand@4.4.7_@types+react@18.3.31_immer@10.1.1_react@18.3.1/node_modules/zustand/esm/middleware.mjs
var subscribeWithSelectorImpl = (fn) => (set3, get, api) => {
  const origSubscribe = api.subscribe;
  api.subscribe = (selector, optListener, options) => {
    let listener = selector;
    if (optListener) {
      const equalityFn = (options == null ? void 0 : options.equalityFn) || Object.is;
      let currentSlice = selector(api.getState());
      listener = (state) => {
        const nextSlice = selector(state);
        if (!equalityFn(currentSlice, nextSlice)) {
          const previousSlice = currentSlice;
          optListener(currentSlice = nextSlice, previousSlice);
        }
      };
      if (options == null ? void 0 : options.fireImmediately) {
        optListener(currentSlice, currentSlice);
      }
    }
    return origSubscribe(listener);
  };
  const initialState = fn(set3, get, api);
  return initialState;
};
var subscribeWithSelector = subscribeWithSelectorImpl;

// ../node_modules/.pnpm/immer@10.1.1/node_modules/immer/dist/immer.mjs
var NOTHING = Symbol.for("immer-nothing");
var DRAFTABLE = Symbol.for("immer-draftable");
var DRAFT_STATE = Symbol.for("immer-state");
var errors = true ? [
  // All error codes, starting by 0:
  function(plugin) {
    return `The plugin for '${plugin}' has not been loaded into Immer. To enable the plugin, import and call \`enable${plugin}()\` when initializing your application.`;
  },
  function(thing) {
    return `produce can only be called on things that are draftable: plain objects, arrays, Map, Set or classes that are marked with '[immerable]: true'. Got '${thing}'`;
  },
  "This object has been frozen and should not be mutated",
  function(data) {
    return "Cannot use a proxy that has been revoked. Did you pass an object from inside an immer function to an async process? " + data;
  },
  "An immer producer returned a new value *and* modified its draft. Either return a new value *or* modify the draft.",
  "Immer forbids circular references",
  "The first or second argument to `produce` must be a function",
  "The third argument to `produce` must be a function or undefined",
  "First argument to `createDraft` must be a plain object, an array, or an immerable object",
  "First argument to `finishDraft` must be a draft returned by `createDraft`",
  function(thing) {
    return `'current' expects a draft, got: ${thing}`;
  },
  "Object.defineProperty() cannot be used on an Immer draft",
  "Object.setPrototypeOf() cannot be used on an Immer draft",
  "Immer only supports deleting array indices",
  "Immer only supports setting array indices and the 'length' property",
  function(thing) {
    return `'original' expects a draft, got: ${thing}`;
  }
  // Note: if more errors are added, the errorOffset in Patches.ts should be increased
  // See Patches.ts for additional errors
] : [];
function die(error, ...args) {
  if (true) {
    const e = errors[error];
    const msg = typeof e === "function" ? e.apply(null, args) : e;
    throw new Error(`[Immer] ${msg}`);
  }
  throw new Error(
    `[Immer] minified error nr: ${error}. Full error at: https://bit.ly/3cXEKWf`
  );
}
var getPrototypeOf = Object.getPrototypeOf;
function isDraft(value2) {
  return !!value2 && !!value2[DRAFT_STATE];
}
function isDraftable(value2) {
  if (!value2)
    return false;
  return isPlainObject2(value2) || Array.isArray(value2) || !!value2[DRAFTABLE] || !!value2.constructor?.[DRAFTABLE] || isMap(value2) || isSet(value2);
}
var objectCtorString = Object.prototype.constructor.toString();
function isPlainObject2(value2) {
  if (!value2 || typeof value2 !== "object")
    return false;
  const proto = getPrototypeOf(value2);
  if (proto === null) {
    return true;
  }
  const Ctor = Object.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  if (Ctor === Object)
    return true;
  return typeof Ctor == "function" && Function.toString.call(Ctor) === objectCtorString;
}
function each(obj, iter) {
  if (getArchtype(obj) === 0) {
    Reflect.ownKeys(obj).forEach((key) => {
      iter(key, obj[key], obj);
    });
  } else {
    obj.forEach((entry, index) => iter(index, entry, obj));
  }
}
function getArchtype(thing) {
  const state = thing[DRAFT_STATE];
  return state ? state.type_ : Array.isArray(thing) ? 1 : isMap(thing) ? 2 : isSet(thing) ? 3 : 0;
}
function has(thing, prop) {
  return getArchtype(thing) === 2 ? thing.has(prop) : Object.prototype.hasOwnProperty.call(thing, prop);
}
function set2(thing, propOrOldValue, value2) {
  const t = getArchtype(thing);
  if (t === 2)
    thing.set(propOrOldValue, value2);
  else if (t === 3) {
    thing.add(value2);
  } else
    thing[propOrOldValue] = value2;
}
function is2(x, y) {
  if (x === y) {
    return x !== 0 || 1 / x === 1 / y;
  } else {
    return x !== x && y !== y;
  }
}
function isMap(target) {
  return target instanceof Map;
}
function isSet(target) {
  return target instanceof Set;
}
function latest(state) {
  return state.copy_ || state.base_;
}
function shallowCopy(base, strict) {
  if (isMap(base)) {
    return new Map(base);
  }
  if (isSet(base)) {
    return new Set(base);
  }
  if (Array.isArray(base))
    return Array.prototype.slice.call(base);
  const isPlain = isPlainObject2(base);
  if (strict === true || strict === "class_only" && !isPlain) {
    const descriptors = Object.getOwnPropertyDescriptors(base);
    delete descriptors[DRAFT_STATE];
    let keys = Reflect.ownKeys(descriptors);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const desc = descriptors[key];
      if (desc.writable === false) {
        desc.writable = true;
        desc.configurable = true;
      }
      if (desc.get || desc.set)
        descriptors[key] = {
          configurable: true,
          writable: true,
          // could live with !!desc.set as well here...
          enumerable: desc.enumerable,
          value: base[key]
        };
    }
    return Object.create(getPrototypeOf(base), descriptors);
  } else {
    const proto = getPrototypeOf(base);
    if (proto !== null && isPlain) {
      return { ...base };
    }
    const obj = Object.create(proto);
    return Object.assign(obj, base);
  }
}
function freeze(obj, deep = false) {
  if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj))
    return obj;
  if (getArchtype(obj) > 1) {
    obj.set = obj.add = obj.clear = obj.delete = dontMutateFrozenCollections;
  }
  Object.freeze(obj);
  if (deep)
    Object.entries(obj).forEach(([key, value2]) => freeze(value2, true));
  return obj;
}
function dontMutateFrozenCollections() {
  die(2);
}
function isFrozen(obj) {
  return Object.isFrozen(obj);
}
var plugins = {};
function getPlugin(pluginKey) {
  const plugin = plugins[pluginKey];
  if (!plugin) {
    die(0, pluginKey);
  }
  return plugin;
}
var currentScope;
function getCurrentScope() {
  return currentScope;
}
function createScope(parent_, immer_) {
  return {
    drafts_: [],
    parent_,
    immer_,
    // Whenever the modified draft contains a draft from another scope, we
    // need to prevent auto-freezing so the unowned draft can be finalized.
    canAutoFreeze_: true,
    unfinalizedDrafts_: 0
  };
}
function usePatchesInScope(scope, patchListener) {
  if (patchListener) {
    getPlugin("Patches");
    scope.patches_ = [];
    scope.inversePatches_ = [];
    scope.patchListener_ = patchListener;
  }
}
function revokeScope(scope) {
  leaveScope(scope);
  scope.drafts_.forEach(revokeDraft);
  scope.drafts_ = null;
}
function leaveScope(scope) {
  if (scope === currentScope) {
    currentScope = scope.parent_;
  }
}
function enterScope(immer2) {
  return currentScope = createScope(currentScope, immer2);
}
function revokeDraft(draft2) {
  const state = draft2[DRAFT_STATE];
  if (state.type_ === 0 || state.type_ === 1)
    state.revoke_();
  else
    state.revoked_ = true;
}
function processResult(result, scope) {
  scope.unfinalizedDrafts_ = scope.drafts_.length;
  const baseDraft = scope.drafts_[0];
  const isReplaced = result !== void 0 && result !== baseDraft;
  if (isReplaced) {
    if (baseDraft[DRAFT_STATE].modified_) {
      revokeScope(scope);
      die(4);
    }
    if (isDraftable(result)) {
      result = finalize(scope, result);
      if (!scope.parent_)
        maybeFreeze(scope, result);
    }
    if (scope.patches_) {
      getPlugin("Patches").generateReplacementPatches_(
        baseDraft[DRAFT_STATE].base_,
        result,
        scope.patches_,
        scope.inversePatches_
      );
    }
  } else {
    result = finalize(scope, baseDraft, []);
  }
  revokeScope(scope);
  if (scope.patches_) {
    scope.patchListener_(scope.patches_, scope.inversePatches_);
  }
  return result !== NOTHING ? result : void 0;
}
function finalize(rootScope, value2, path) {
  if (isFrozen(value2))
    return value2;
  const state = value2[DRAFT_STATE];
  if (!state) {
    each(
      value2,
      (key, childValue) => finalizeProperty(rootScope, state, value2, key, childValue, path)
    );
    return value2;
  }
  if (state.scope_ !== rootScope)
    return value2;
  if (!state.modified_) {
    maybeFreeze(rootScope, state.base_, true);
    return state.base_;
  }
  if (!state.finalized_) {
    state.finalized_ = true;
    state.scope_.unfinalizedDrafts_--;
    const result = state.copy_;
    let resultEach = result;
    let isSet2 = false;
    if (state.type_ === 3) {
      resultEach = new Set(result);
      result.clear();
      isSet2 = true;
    }
    each(
      resultEach,
      (key, childValue) => finalizeProperty(rootScope, state, result, key, childValue, path, isSet2)
    );
    maybeFreeze(rootScope, result, false);
    if (path && rootScope.patches_) {
      getPlugin("Patches").generatePatches_(
        state,
        path,
        rootScope.patches_,
        rootScope.inversePatches_
      );
    }
  }
  return state.copy_;
}
function finalizeProperty(rootScope, parentState, targetObject, prop, childValue, rootPath, targetIsSet) {
  if (childValue === targetObject)
    die(5);
  if (isDraft(childValue)) {
    const path = rootPath && parentState && parentState.type_ !== 3 && // Set objects are atomic since they have no keys.
    !has(parentState.assigned_, prop) ? rootPath.concat(prop) : void 0;
    const res = finalize(rootScope, childValue, path);
    set2(targetObject, prop, res);
    if (isDraft(res)) {
      rootScope.canAutoFreeze_ = false;
    } else
      return;
  } else if (targetIsSet) {
    targetObject.add(childValue);
  }
  if (isDraftable(childValue) && !isFrozen(childValue)) {
    if (!rootScope.immer_.autoFreeze_ && rootScope.unfinalizedDrafts_ < 1) {
      return;
    }
    finalize(rootScope, childValue);
    if ((!parentState || !parentState.scope_.parent_) && typeof prop !== "symbol" && Object.prototype.propertyIsEnumerable.call(targetObject, prop))
      maybeFreeze(rootScope, childValue);
  }
}
function maybeFreeze(scope, value2, deep = false) {
  if (!scope.parent_ && scope.immer_.autoFreeze_ && scope.canAutoFreeze_) {
    freeze(value2, deep);
  }
}
function createProxyProxy(base, parent) {
  const isArray = Array.isArray(base);
  const state = {
    type_: isArray ? 1 : 0,
    // Track which produce call this is associated with.
    scope_: parent ? parent.scope_ : getCurrentScope(),
    // True for both shallow and deep changes.
    modified_: false,
    // Used during finalization.
    finalized_: false,
    // Track which properties have been assigned (true) or deleted (false).
    assigned_: {},
    // The parent draft state.
    parent_: parent,
    // The base state.
    base_: base,
    // The base proxy.
    draft_: null,
    // set below
    // The base copy with any updated values.
    copy_: null,
    // Called by the `produce` function.
    revoke_: null,
    isManual_: false
  };
  let target = state;
  let traps = objectTraps;
  if (isArray) {
    target = [state];
    traps = arrayTraps;
  }
  const { revoke, proxy } = Proxy.revocable(target, traps);
  state.draft_ = proxy;
  state.revoke_ = revoke;
  return proxy;
}
var objectTraps = {
  get(state, prop) {
    if (prop === DRAFT_STATE)
      return state;
    const source = latest(state);
    if (!has(source, prop)) {
      return readPropFromProto(state, source, prop);
    }
    const value2 = source[prop];
    if (state.finalized_ || !isDraftable(value2)) {
      return value2;
    }
    if (value2 === peek(state.base_, prop)) {
      prepareCopy(state);
      return state.copy_[prop] = createProxy(value2, state);
    }
    return value2;
  },
  has(state, prop) {
    return prop in latest(state);
  },
  ownKeys(state) {
    return Reflect.ownKeys(latest(state));
  },
  set(state, prop, value2) {
    const desc = getDescriptorFromProto(latest(state), prop);
    if (desc?.set) {
      desc.set.call(state.draft_, value2);
      return true;
    }
    if (!state.modified_) {
      const current2 = peek(latest(state), prop);
      const currentState = current2?.[DRAFT_STATE];
      if (currentState && currentState.base_ === value2) {
        state.copy_[prop] = value2;
        state.assigned_[prop] = false;
        return true;
      }
      if (is2(value2, current2) && (value2 !== void 0 || has(state.base_, prop)))
        return true;
      prepareCopy(state);
      markChanged(state);
    }
    if (state.copy_[prop] === value2 && // special case: handle new props with value 'undefined'
    (value2 !== void 0 || prop in state.copy_) || // special case: NaN
    Number.isNaN(value2) && Number.isNaN(state.copy_[prop]))
      return true;
    state.copy_[prop] = value2;
    state.assigned_[prop] = true;
    return true;
  },
  deleteProperty(state, prop) {
    if (peek(state.base_, prop) !== void 0 || prop in state.base_) {
      state.assigned_[prop] = false;
      prepareCopy(state);
      markChanged(state);
    } else {
      delete state.assigned_[prop];
    }
    if (state.copy_) {
      delete state.copy_[prop];
    }
    return true;
  },
  // Note: We never coerce `desc.value` into an Immer draft, because we can't make
  // the same guarantee in ES5 mode.
  getOwnPropertyDescriptor(state, prop) {
    const owner = latest(state);
    const desc = Reflect.getOwnPropertyDescriptor(owner, prop);
    if (!desc)
      return desc;
    return {
      writable: true,
      configurable: state.type_ !== 1 || prop !== "length",
      enumerable: desc.enumerable,
      value: owner[prop]
    };
  },
  defineProperty() {
    die(11);
  },
  getPrototypeOf(state) {
    return getPrototypeOf(state.base_);
  },
  setPrototypeOf() {
    die(12);
  }
};
var arrayTraps = {};
each(objectTraps, (key, fn) => {
  arrayTraps[key] = function() {
    arguments[0] = arguments[0][0];
    return fn.apply(this, arguments);
  };
});
arrayTraps.deleteProperty = function(state, prop) {
  if (isNaN(parseInt(prop)))
    die(13);
  return arrayTraps.set.call(this, state, prop, void 0);
};
arrayTraps.set = function(state, prop, value2) {
  if (prop !== "length" && isNaN(parseInt(prop)))
    die(14);
  return objectTraps.set.call(this, state[0], prop, value2, state[0]);
};
function peek(draft2, prop) {
  const state = draft2[DRAFT_STATE];
  const source = state ? latest(state) : draft2;
  return source[prop];
}
function readPropFromProto(state, source, prop) {
  const desc = getDescriptorFromProto(source, prop);
  return desc ? `value` in desc ? desc.value : (
    // This is a very special case, if the prop is a getter defined by the
    // prototype, we should invoke it with the draft as context!
    desc.get?.call(state.draft_)
  ) : void 0;
}
function getDescriptorFromProto(source, prop) {
  if (!(prop in source))
    return void 0;
  let proto = getPrototypeOf(source);
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc)
      return desc;
    proto = getPrototypeOf(proto);
  }
  return void 0;
}
function markChanged(state) {
  if (!state.modified_) {
    state.modified_ = true;
    if (state.parent_) {
      markChanged(state.parent_);
    }
  }
}
function prepareCopy(state) {
  if (!state.copy_) {
    state.copy_ = shallowCopy(
      state.base_,
      state.scope_.immer_.useStrictShallowCopy_
    );
  }
}
var Immer2 = class {
  constructor(config) {
    this.autoFreeze_ = true;
    this.useStrictShallowCopy_ = false;
    this.produce = (base, recipe, patchListener) => {
      if (typeof base === "function" && typeof recipe !== "function") {
        const defaultBase = recipe;
        recipe = base;
        const self = this;
        return function curriedProduce(base2 = defaultBase, ...args) {
          return self.produce(base2, (draft2) => recipe.call(this, draft2, ...args));
        };
      }
      if (typeof recipe !== "function")
        die(6);
      if (patchListener !== void 0 && typeof patchListener !== "function")
        die(7);
      let result;
      if (isDraftable(base)) {
        const scope = enterScope(this);
        const proxy = createProxy(base, void 0);
        let hasError = true;
        try {
          result = recipe(proxy);
          hasError = false;
        } finally {
          if (hasError)
            revokeScope(scope);
          else
            leaveScope(scope);
        }
        usePatchesInScope(scope, patchListener);
        return processResult(result, scope);
      } else if (!base || typeof base !== "object") {
        result = recipe(base);
        if (result === void 0)
          result = base;
        if (result === NOTHING)
          result = void 0;
        if (this.autoFreeze_)
          freeze(result, true);
        if (patchListener) {
          const p = [];
          const ip = [];
          getPlugin("Patches").generateReplacementPatches_(base, result, p, ip);
          patchListener(p, ip);
        }
        return result;
      } else
        die(1, base);
    };
    this.produceWithPatches = (base, recipe) => {
      if (typeof base === "function") {
        return (state, ...args) => this.produceWithPatches(state, (draft2) => base(draft2, ...args));
      }
      let patches, inversePatches;
      const result = this.produce(base, recipe, (p, ip) => {
        patches = p;
        inversePatches = ip;
      });
      return [result, patches, inversePatches];
    };
    if (typeof config?.autoFreeze === "boolean")
      this.setAutoFreeze(config.autoFreeze);
    if (typeof config?.useStrictShallowCopy === "boolean")
      this.setUseStrictShallowCopy(config.useStrictShallowCopy);
  }
  createDraft(base) {
    if (!isDraftable(base))
      die(8);
    if (isDraft(base))
      base = current(base);
    const scope = enterScope(this);
    const proxy = createProxy(base, void 0);
    proxy[DRAFT_STATE].isManual_ = true;
    leaveScope(scope);
    return proxy;
  }
  finishDraft(draft2, patchListener) {
    const state = draft2 && draft2[DRAFT_STATE];
    if (!state || !state.isManual_)
      die(9);
    const { scope_: scope } = state;
    usePatchesInScope(scope, patchListener);
    return processResult(void 0, scope);
  }
  /**
   * Pass true to automatically freeze all copies created by Immer.
   *
   * By default, auto-freezing is enabled.
   */
  setAutoFreeze(value2) {
    this.autoFreeze_ = value2;
  }
  /**
   * Pass true to enable strict shallow copy.
   *
   * By default, immer does not copy the object descriptors such as getter, setter and non-enumrable properties.
   */
  setUseStrictShallowCopy(value2) {
    this.useStrictShallowCopy_ = value2;
  }
  applyPatches(base, patches) {
    let i;
    for (i = patches.length - 1; i >= 0; i--) {
      const patch = patches[i];
      if (patch.path.length === 0 && patch.op === "replace") {
        base = patch.value;
        break;
      }
    }
    if (i > -1) {
      patches = patches.slice(i + 1);
    }
    const applyPatchesImpl = getPlugin("Patches").applyPatches_;
    if (isDraft(base)) {
      return applyPatchesImpl(base, patches);
    }
    return this.produce(
      base,
      (draft2) => applyPatchesImpl(draft2, patches)
    );
  }
};
function createProxy(value2, parent) {
  const draft2 = isMap(value2) ? getPlugin("MapSet").proxyMap_(value2, parent) : isSet(value2) ? getPlugin("MapSet").proxySet_(value2, parent) : createProxyProxy(value2, parent);
  const scope = parent ? parent.scope_ : getCurrentScope();
  scope.drafts_.push(draft2);
  return draft2;
}
function current(value2) {
  if (!isDraft(value2))
    die(10, value2);
  return currentImpl(value2);
}
function currentImpl(value2) {
  if (!isDraftable(value2) || isFrozen(value2))
    return value2;
  const state = value2[DRAFT_STATE];
  let copy;
  if (state) {
    if (!state.modified_)
      return state.base_;
    state.finalized_ = true;
    copy = shallowCopy(value2, state.scope_.immer_.useStrictShallowCopy_);
  } else {
    copy = shallowCopy(value2, true);
  }
  each(copy, (key, childValue) => {
    set2(copy, key, currentImpl(childValue));
  });
  if (state) {
    state.finalized_ = false;
  }
  return copy;
}
var immer = new Immer2();
var produce = immer.produce;
var produceWithPatches = immer.produceWithPatches.bind(
  immer
);
var setAutoFreeze = immer.setAutoFreeze.bind(immer);
var setUseStrictShallowCopy = immer.setUseStrictShallowCopy.bind(immer);
var applyPatches = immer.applyPatches.bind(immer);
var createDraft = immer.createDraft.bind(immer);
var finishDraft = immer.finishDraft.bind(immer);

// ../node_modules/.pnpm/@deepseek-ai+dsh-client-sto_c4dee28068babcc7f9caf397e2e88b6e/node_modules/@deepseek-ai/dsh-client-store/lib/index.js
function notifySubscribers(listeners, label, ...args) {
  for (const listener of [...listeners]) try {
    listener(...args);
  } catch (error) {
    console.error(`${label} subscriber failed:`, error);
  }
}
function rafBatch(notify) {
  const schedule = typeof requestAnimationFrame === "function" ? (fn) => {
    requestAnimationFrame(() => {
      fn();
    });
  } : (fn) => {
    queueMicrotask(fn);
  };
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      notify();
    });
  };
}
function createSnapshotStore(init, opts) {
  const withSelector = subscribeWithSelector(() => init);
  const api = createStore()(withSelector);
  if (opts?.persist) attachPersistence(api, opts.persist.name);
  let subscribe = (fn) => api.subscribe(() => {
    notifySubscribers([fn], "[client-store]");
  });
  if (opts?.flush === "raf") {
    const listeners = /* @__PURE__ */ new Set();
    const flush = rafBatch(() => {
      notifySubscribers(listeners, "[client-store]");
    });
    api.subscribe(flush);
    subscribe = (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    };
  }
  return {
    getSnapshot: () => api.getState(),
    subscribe: (fn) => subscribe(fn),
    update: (mutator) => {
      api.setState(produce(api.getState(), (draft2) => {
        mutator(draft2);
      }), true);
    },
    set: (next) => {
      api.setState(devFreeze(next), true);
    }
  };
}
function attachPersistence(api, name) {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(name);
    if (raw !== null) api.setState(devFreeze(JSON.parse(raw)), true);
  } catch (error) {
    console.error(`snapshot store '${name}' rehydration failed:`, error);
  }
  api.subscribe((state) => {
    try {
      localStorage.setItem(name, JSON.stringify(state));
    } catch (error) {
      console.error(`snapshot store '${name}' persistence failed:`, error);
    }
  });
}
function devFreeze(value2) {
  return freeze(value2, true);
}

// src/client/temporary-permission-entry.ts
function registerTemporaryPermissionEntry(ctx, permissions) {
  const store = createSnapshotStore(void 0);
  void ctx.inject(["connection"], (connectionCtx) => {
    const connection = connectionCtx.connection;
    let generation = connection.generation.getSnapshot(), lifetime;
    let owner;
    let scopeLifetime, scopeKey = "";
    const bindScope = () => {
      const state = permissions.store.getSnapshot();
      const key = JSON.stringify([state.generation, state.sessionId, state.scope, state.connected]);
      if (key === scopeKey) return;
      scopeKey = key;
      scopeLifetime?.abort();
      scopeLifetime = void 0;
      store.set(void 0);
      if (!lifetime || lifetime.signal.aborted || !state.connected || state.sessionId === null || state.scope === "unknown") return;
      scopeLifetime = new AbortController();
      store.set(temporaryPermissionClient(connection, AbortSignal.any([lifetime.signal, scopeLifetime.signal])));
    };
    const update = () => {
      const next = connection.generation.getSnapshot();
      if (lifetime && generation === next) return;
      generation = next;
      lifetime?.abort();
      lifetime = void 0;
      scopeLifetime?.abort();
      scopeKey = "";
      void owner?.dispose();
      owner = void 0;
      store.set(void 0);
      if (next !== void 0) {
        const current2 = lifetime = new AbortController();
        owner = connectionCtx.plugin({ name: "dsmm-temporary-permission-generation", apply(ownerCtx) {
          ownerCtx.effect(() => () => current2.abort());
          if (current2.signal.aborted || connection.generation.getSnapshot() !== next) return;
          registerTemporaryPermissionSlots(ownerCtx, connection);
        } });
      }
      bindScope();
    };
    update();
    connectionCtx.effect(() => connection.generation.subscribe(update));
    connectionCtx.effect(() => permissions.store.subscribe(bindScope));
    connectionCtx.effect(() => () => {
      lifetime?.abort();
      scopeLifetime?.abort();
      store.set(void 0);
    }, "dsmm: temporary permission connection lifetime");
  });
  return store;
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
    editText: (generation, child2, text6) => this.editDraft(generation, child2, { text: text6 }),
    setDelivery: (generation, child2, delivery2) => this.editDraft(generation, child2, { delivery: delivery2 }),
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
    if (preserveDrafts) for (const [id3, draft2] of this.current.drafts) drafts.set(id3, {
      ...draft2,
      imageBusy: false,
      uncertain: draft2.uncertain || this.current.pending.get(childActionKey(id3)) === "prompt"
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
  draft(id3) {
    return this.current.drafts.get(id3) ?? EMPTY_CHILD_DRAFT;
  }
  child(id3) {
    return this.current.snapshot?.children.find((child2) => child2.id === id3 && child2.parentSessionId === this.current.sessionId);
  }
  editDraft(generation, id3, patch) {
    if (this.disposed || generation !== this.current.generation || this.child(id3)?.mode !== "continuable" || this.current.pending.has(childActionKey(id3))) return;
    this.publishDraft(id3, patch);
  }
  publishDraft(id3, patch) {
    const drafts = new Map(this.current.drafts);
    drafts.set(id3, { ...this.draft(id3), ...patch });
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
      const codec6 = ROLE_CONTROL_REMOTE.descriptors.find((row2) => row2.method === method).result;
      if (codec6.mode !== "strict") throw new TypeError("Child result requires a strict codec.");
      return codec6.create().parse(result.value);
    } catch {
      throw new ControlFailure({ kind: "protocol", code: "unavailable", unknown: true });
    }
  }
  async refresh(generation) {
    if (!this.live(generation) || this.current.reading || this.current.pending.size > 0 || [...this.current.drafts.values()].some((draft2) => draft2.imageBusy)) return;
    const id3 = this.current.sessionId;
    this.publish({ reading: true, issue: null, descendantIssue: null, fresh: false });
    const [description, descendants2] = await Promise.allSettled([this.unwrap("describe", () => this.remote.describe(id3)), this.unwrap("descendants", () => this.remote.descendants(id3))]);
    if (!this.live(generation)) return;
    if (description.status === "rejected") {
      this.publish({ reading: false, issue: this.issue(description.reason), descendants: null });
      return;
    }
    const snapshot4 = parseChildSessionSnapshot(description.value);
    if (snapshot4.sessionId !== id3) {
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
      if (tree.sessionId !== id3 || tree.admissionEpoch !== snapshot4.admissionEpoch) {
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
  canControl(generation, id3, action2) {
    const child2 = this.child(id3);
    return this.available(generation) && !this.current.pending.has(childActionKey(id3)) && child2?.mode === "continuable" && !child2.readonly && enabled(child2.controls[action2]) && enabled(this.current.snapshot?.capabilities[action2]);
  }
  async prompt(generation, id3) {
    const draft2 = this.draft(id3), key = childActionKey(id3);
    if (!this.canControl(generation, id3, "prompt") || draft2.uncertain || draft2.imageBusy || draft2.text.trim() === "" && draft2.images.length === 0 || draft2.images.length > 0 && !enabled(this.current.snapshot?.capabilities.images)) return;
    this.begin(key, "prompt");
    try {
      let clientTimeZone;
      try {
        clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
      }
      let request2;
      try {
        request2 = parseRoleControlPromptRequest({
          requestId: crypto.randomUUID(),
          parentSessionId: this.current.sessionId,
          childSessionId: id3,
          mode: "continuable",
          delivery: draft2.delivery,
          content: [...draft2.text === "" ? [] : [{ type: "text", text: draft2.text }], ...draft2.images],
          ...clientTimeZone === void 0 ? {} : { clientTimeZone }
        });
      } catch {
        throw new ControlFailure({ kind: "local", code: "invalid-content" });
      }
      const receipt = await this.unwrap("prompt", () => this.remote.prompt(this.current.sessionId, request2));
      if (!this.live(generation)) return;
      this.accepted(key, { kind: "prompt", receipt });
      const drafts = new Map(this.current.drafts);
      drafts.set(id3, { ...draft2, text: "", images: [], uncertain: false });
      this.publish({ drafts });
    } catch (error) {
      if (this.live(generation)) {
        const issue = this.issue(error);
        this.refuse(key, error);
        if (issue.unknown) {
          const drafts = new Map(this.current.drafts);
          drafts.set(id3, { ...this.draft(id3), uncertain: true });
          this.publish({ drafts });
        }
      }
    } finally {
      if (this.live(generation)) this.finish(key);
    }
  }
  async interrupt(generation, id3) {
    if (!this.canControl(generation, id3, "interrupt")) return;
    const key = childActionKey(id3);
    this.begin(key, "interrupt");
    try {
      const receipt = await this.unwrap("interrupt", () => this.remote.interrupt(this.current.sessionId, { parentSessionId: this.current.sessionId, childSessionId: id3, mode: "continuable" }));
      if (this.live(generation)) this.accepted(key, { kind: "interrupt", receipt });
    } catch (error) {
      if (this.live(generation)) this.refuse(key, error);
    } finally {
      if (this.live(generation)) this.finish(key);
    }
  }
  async addImages(generation, id3, files) {
    if (!this.canControl(generation, id3, "prompt") || !enabled(this.current.snapshot?.capabilities.images) || this.draft(id3).imageBusy || files.length === 0) return;
    this.editDraft(generation, id3, { imageBusy: true });
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
          childSessionId: id3,
          mode: "continuable",
          delivery: "queue",
          content: [{ type: "image", mediaType: file.type, data: btoa(body), name: file.name }]
        });
        images.push(parsed.content[0]);
      }
      if (this.live(generation)) this.publishDraft(id3, { images: [...this.draft(id3).images, ...images] });
    } catch {
      if (this.live(generation)) this.refuse(childActionKey(id3), new ControlFailure({ kind: "local", code: "invalid-content" }));
    } finally {
      if (this.live(generation)) this.publishDraft(id3, { imageBusy: false });
    }
  }
};

// src/client/ChildrenPanel.tsx
var import_react13 = require("react");
var import_dsh_client_ui_primitives12 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime16 = require("react/jsx-runtime");
function ControlAvailability({ value: value2, label, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dsmm-availability", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
      t(label),
      ": ",
      t(value2?.enabled === true ? "enabled" : "disabled")
    ] }),
    value2?.enabled !== true && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dsmm-hint", children: t(`reason:${value2?.reason ?? "unavailable"}`) })
  ] });
}
function routeText(route3) {
  return `${route3.provider}/${route3.model}${route3.reasoningEffort === void 0 ? "" : ` (${route3.reasoningEffort})`}`;
}
function RouteComparisonDetails({ value: value2, t }) {
  const initial2 = value2?.initialRoute, live = value2?.liveRoute;
  const liveReasons = { "no-own-request-header": "routeNoOwnHeader", "invalid-own-request-header": "routeInvalidOwnHeader", "not-observed": "routeNotObserved" };
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dsmm-availability", children: [
    value2 === void 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dsmm-hint", children: t("comparisonUnobserved") }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("dl", { className: "dsmm-child-meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dt", { children: t("initialRoute") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dd", { children: initial2?.status === "known" ? routeText(initial2.route) : t("routeUnknown") }),
      initial2?.status === "known" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dt", { children: t("initialRouteSource") }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("dd", { children: [
          t("routeCaptureSource"),
          " · ",
          initial2.source
        ] })
      ] }) : initial2 !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dt", { children: t("initialRouteReason") }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("dd", { children: [
          t("routeMissingCapture"),
          " · ",
          initial2.reason
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dt", { children: t("liveRoute") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dd", { children: live?.status === "known" ? routeText(live.route) : t("routeUnknown") }),
      live?.status === "known" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dt", { children: t("liveRouteSource") }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("dd", { children: [
          t("routeOwnHeaderSource"),
          " · ",
          live.source
        ] })
      ] }) : live !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dt", { children: t("liveRouteReason") }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("dd", { children: [
          t(liveReasons[live.reason]),
          " · ",
          live.reason
        ] })
      ] })
    ] })
  ] });
}
function InvocationDetails({ value: value2, t, showComparison = true }) {
  if (value2 === void 0) return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dsmm-hint", children: t("invocationUnavailable") });
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
    showComparison && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(RouteComparisonDetails, { value: value2.routeComparison, t }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("dl", { className: "dsmm-child-meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dt", { children: t("role") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("dd", { children: [
        value2.label,
        " · ",
        value2.role
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dt", { children: t("level") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dd", { children: value2.level }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dt", { children: t("mode") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dd", { children: value2.mode }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dt", { children: t("reportedRoute") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dd", { children: value2.route === void 0 ? t("routeUnreported") : routeText(value2.route) }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dt", { children: t("routeSource") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dd", { children: value2.routeSource }),
      value2.runId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dt", { children: t("runId") }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dd", { children: value2.runId })
      ] }),
      value2.childId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dt", { children: t("childId") }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dd", { children: value2.childId })
      ] }),
      value2.jobId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dt", { children: t("jobId") }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("dd", { children: value2.jobId })
      ] })
    ] })
  ] });
}
function Issue2({ value: value2, t }) {
  if (!value2) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dsmm-issue", role: "alert", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { children: t(value2.unknown ? "unknownAction" : "error", { code: value2.code }) }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
      value2.code,
      value2.field === void 0 ? "" : ` · ${t("field")}: ${value2.field}`
    ] }),
    value2.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { children: t(`reason:${value2.reason}`) })
  ] });
}
function Outcome({ value: value2, t }) {
  if (!value2) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dsmm-availability", role: "status", "aria-live": "polite", children: value2.kind === "prompt" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { children: t("promptAccepted", { id: value2.receipt.messageId }) }) : /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { children: t("interruptAccepted") }) });
}
function ChildComposer({ child: child2, state, actions: actions2, t }) {
  const prefix = (0, import_react13.useId)(), picker = (0, import_react13.useRef)(null), generation = state.generation, key = childActionKey(child2.id);
  const draft2 = state.drafts.get(child2.id) ?? EMPTY_CHILD_DRAFT;
  const pending = state.pending.has(key), available = state.fresh && !state.reading && !pending;
  const canPrompt = available && enabled(state.snapshot?.capabilities.prompt) && enabled(child2.controls.prompt) && !child2.readonly && child2.mode === "continuable";
  const canImages = canPrompt && enabled(state.snapshot?.capabilities.images) && !draft2.imageBusy;
  const submit = canPrompt && !draft2.uncertain && !draft2.imageBusy && (draft2.text.trim() !== "" || draft2.images.length > 0) && (draft2.images.length === 0 || enabled(state.snapshot?.capabilities.images));
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("form", { className: "dsmm-child-composer", "aria-label": t("prompt"), onSubmit: (event) => {
    event.preventDefault();
    if (submit) void actions2.prompt(generation, child2.id);
  }, children: [
    !state.fresh && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dsmm-hint", children: t(state.reading ? "reading" : "stale") }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("label", { htmlFor: `${prefix}-message`, children: t("text") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("label", { htmlFor: `${prefix}-delivery`, children: t("delivery") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("select", { id: `${prefix}-delivery`, value: draft2.delivery, disabled: !canPrompt, "aria-describedby": `${prefix}-delivery-hint`, onChange: (event) => {
        const value2 = event.currentTarget.value;
        if (value2 === "queue" || value2 === "steer") actions2.setDelivery(generation, child2.id, value2);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: "queue", children: t("queue") }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: "steer", children: t("steer") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { id: `${prefix}-delivery-hint`, className: "dsmm-hint", children: t("deliveryHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { id: `${prefix}-images-hint`, className: "dsmm-hint", children: t("imagesHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("input", { ref: picker, hidden: true, type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", multiple: true, disabled: !canImages, "aria-label": t("images"), onChange: (event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = "";
        if (canImages) void actions2.addImages(generation, child2.id, files);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(import_dsh_client_ui_primitives12.Button, { type: "button", variant: "outline", disabled: !canImages, "aria-describedby": `${prefix}-images-hint`, onClick: () => {
        if (canImages) picker.current?.click();
      }, children: t("images") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ControlAvailability, { value: state.snapshot?.capabilities.images, label: "imageAvailability", t }),
      draft2.images.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("ul", { className: "dsmm-profile-list", children: draft2.images.map((image, index) => /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
          image.name ?? image.mediaType,
          " · ",
          image.mediaType
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(import_dsh_client_ui_primitives12.Button, { type: "button", variant: "outline", disabled: pending || draft2.imageBusy, onClick: () => actions2.removeImage(generation, child2.id, image), "aria-label": `${t("removeImage")}: ${image.name ?? image.mediaType}`, children: t("removeImage") })
      ] }, index)) })
    ] }),
    draft2.uncertain && /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dsmm-warning", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { id: `${prefix}-unknown`, children: t("unknown") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(import_dsh_client_ui_primitives12.Button, { type: "button", variant: "outline", disabled: !state.fresh || state.reading || pending, onClick: () => actions2.acknowledgeUnknown(generation, child2.id), children: t("acknowledge") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ControlAvailability, { value: !enabled(state.snapshot?.capabilities.prompt) ? state.snapshot?.capabilities.prompt : child2.controls.prompt, label: "promptAvailability", t }),
    draft2.text.trim() === "" && draft2.images.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dsmm-hint", children: t("emptyMessage") }),
    draft2.images.length > 0 && !enabled(state.snapshot?.capabilities.images) && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dsmm-hint", children: t("deniedImages") }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dsmm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(import_dsh_client_ui_primitives12.Button, { type: "submit", variant: "primary", disabled: !submit, children: t("send") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
        import_dsh_client_ui_primitives12.Button,
        {
          type: "button",
          variant: "outline",
          disabled: !available || !enabled(state.snapshot?.capabilities.interrupt) || !enabled(child2.controls.interrupt) || child2.readonly || child2.mode !== "continuable",
          onClick: () => void actions2.interrupt(generation, child2.id),
          children: t("interrupt")
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", children: pending ? t("pending") : draft2.imageBusy ? t("imageReading") : "" })
  ] });
}
function ChildDetails({ child: child2, state, actions: actions2, t, inspection = false, renderChildPermissions }) {
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("fieldset", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("legend", { children: child2.label?.trim() ? child2.label : child2.id }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
      t("childId"),
      ": ",
      child2.id
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
      t("parentId"),
      ": ",
      child2.parentSessionId
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
      t("mode"),
      ": ",
      child2.mode
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
      t("activity"),
      ": ",
      child2.activity
    ] }),
    (inspection || child2.readonly) && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { children: t("readonly") }),
    child2.mode === "one-shot" && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dsmm-hint", children: t("oneShot") }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(RouteComparisonDetails, { value: child2.routeComparison, t }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(InvocationDetails, { value: child2.invocation, t, showComparison: false }),
    (!inspection || !child2.controls.prompt.enabled) && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ControlAvailability, { value: child2.controls.prompt, label: "promptAvailability", t }),
    (!inspection || !child2.controls.interrupt.enabled) && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ControlAvailability, { value: child2.controls.interrupt, label: "interruptAvailability", t }),
    !inspection && child2.mode === "continuable" && !child2.readonly && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ChildComposer, { child: child2, state, actions: actions2, t }),
    !inspection && child2.mode === "continuable" && !child2.readonly && renderChildPermissions?.(child2),
    !inspection && /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Issue2, { value: state.issues.get(childActionKey(child2.id)), t }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Outcome, { value: state.outcomes.get(childActionKey(child2.id)), t })
    ] })
  ] });
}
function ChildrenPanel(props) {
  const state = props.useChildren((snapshot4) => snapshot4), { t } = props, generation = state.generation;
  if (props.sessionId === void 0 || props.sessionId !== state.sessionId) return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "dsmm-profiles dsmm-children", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h2", { children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { children: t(state.sessionId === null ? "noSession" : "foreign") })
  ] });
  const data = state.snapshot;
  const refreshingDisabled = state.reading || state.pending.size > 0 || [...state.drafts.values()].some((draft2) => draft2.imageBusy);
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "dsmm-profiles dsmm-children", "aria-label": t("title"), "aria-busy": state.reading, children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h2", { children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dsmm-hint", children: t("description") }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
      t("session"),
      ": ",
      state.sessionId
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dsmm-actions", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(import_dsh_client_ui_primitives12.Button, { type: "button", variant: "outline", disabled: refreshingDisabled, onClick: () => void props.refresh(generation), children: t("refresh") }) }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", children: state.reading ? t("reading") : state.pending.size > 0 ? t("pending") : !state.fresh ? t(data === null ? "unavailable" : "stale") : "" }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Issue2, { value: state.issue, t }),
    data !== null && /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
        t("epoch"),
        ": ",
        data.admissionEpoch
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "dsmm-availability", children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
          t("runtime"),
          ": ",
          data.capabilities.runtime.binding
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
          t("fence"),
          ": ",
          t(data.capabilities.runtime.deliveryFenceReady ? "yes" : "no")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
          t("restart"),
          ": ",
          t(data.capabilities.runtime.restartRequired ? "yes" : "no")
        ] }),
        data.capabilities.runtime.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { children: t("authority") }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ControlAvailability, { value: data.capabilities.prompt, label: "promptAvailability", t }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ControlAvailability, { value: data.capabilities.interrupt, label: "interruptAvailability", t })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dsmm-hint", children: t("backgroundHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "dsmm-zone", "aria-label": t("children"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h3", { children: t("children") }),
        data.children.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dsmm-hint", children: t("emptyChildren") }) : data.children.map((child2) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ChildDetails, { child: child2, state, actions: props, t, renderChildPermissions: props.renderChildPermissions }, child2.id))
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "dsmm-zone", "aria-label": t("descendants"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h3", { children: t("descendants") }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Issue2, { value: state.descendantIssue, t }),
      state.descendants === null ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dsmm-hint", children: t("treeUnavailable") }) : state.descendants.descendants.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "dsmm-hint", children: t("emptyDescendants") }) : state.descendants.descendants.map((entry, index) => /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dsmm-availability", children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
          t("depth"),
          ": ",
          entry.depth
        ] }),
        entry.kind === "diagnostic" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "dsmm-issue", children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { children: t("diagnostic", { reason: entry.reason }) }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
            t("childId"),
            ": ",
            entry.id
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
            t("parentId"),
            ": ",
            entry.parentSessionId
          ] })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { children: [
            t("subtree"),
            ": ",
            t(entry.hasChildren ? "yes" : "no")
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ChildDetails, { child: entry.child, state, actions: props, t, inspection: true })
        ] })
      ] }, index))
    ] })
  ] });
}

// src/client/index.ts
var inject = ["slots", "locale", "remote"];
async function apply(ctx) {
  registerRoleToolViews(ctx);
  await ctx.remote.$mount({ ...TYPERT_REMOTE, descriptors: [...TYPERT_REMOTE.descriptors, ...HISTORY_REMOTE.descriptors] });
  await ctx.remote.$mount(ROLE_CONTROL_REMOTE);
  await ctx.remote.$mount(PERMISSION_REMOTE);
  registerHistoryContinuation(ctx);
  const permissions = new PermissionController();
  ctx.effect(() => () => permissions.dispose(), "dsmm: permission controls");
  ctx.effect(() => ctx.locale.register(PERMISSIONS_NS, { en: permissionEn, zh: permissionZh }), "dsmm: permission locale");
  const temporaryPermissions = registerTemporaryPermissionEntry(ctx, permissions);
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
      const id3 = source.getSnapshot().key, binding = id3 === void 0 ? void 0 : sessions.binding(id3);
      if (binding !== observed) {
        stop?.();
        observed = binding;
        stop = binding?.session.subscribe(update);
      }
      const snapshot4 = binding?.session.getSnapshot(), catalog = sessions.list.getSnapshot(), summary2 = id3 === void 0 ? void 0 : catalog.byId[id3];
      const child2 = snapshot4?.subagent != null || summary2?.origin === "subagent" || summary2?.parentId !== void 0;
      const root = id3 !== void 0 && binding?.sessionId === id3 && snapshot4?.sessionId === id3 && snapshot4.openState === "open" && !snapshot4.removed && catalog.ids.includes(id3) && summary2 !== void 0 && !child2;
      permissions.bindScope(id3 ?? null, binding ?? null, child2 ? "child" : root ? "root" : "unknown");
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
    const inject2 = () => ({ core, remote: coreCtx.remote.dsmmConfig, workspace, temporaryPermissions, permissionsT: coreCtx.locale.bind(PERMISSIONS_NS) });
    coreCtx.slots.inject("plugins.bundle.config", () => coreCtx.slots.register({ name: "plugins.bundle.config", key: "@dsmm/dsmm", locale: DEPLOYMENT_NS, inject: inject2 }, DeploymentPage));
    void coreCtx.inject(["configForms"], (formCtx) => {
      workspace.bindForms(formCtx.configForms);
      formCtx.effect(() => () => workspace.bindForms(null));
    });
    void core.refresh();
  });
  await ctx.inject(["remote.dsmmProfiles"], (profileCtx) => {
    const controller = new ProfilesController(profileCtx.remote.dsmmProfiles);
    void profileCtx.inject(["connection"], (connectionCtx) => {
      controller.bindConnection(connectionCtx.connection.generation);
      void controller.refresh();
      connectionCtx.effect(() => () => controller.bindConnection(null), "dsmm: profile connection withdrawal");
    });
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
    void profileCtx.inject(["conversation"], (conversationCtx) => {
      controller.attachComposerBlocks(conversationCtx.conversation.blocks, () => t("sessionSelectionBlock"));
      conversationCtx.effect(() => () => controller.attachComposerBlocks(null), "dsmm: profile composer block lifetime");
    });
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
          const id3 = source.getSnapshot().key;
          if (id3 === void 0 || nativeSessions.binding(id3) === void 0) {
            controller.attachModelInteractionSource(null, null);
            return;
          }
          try {
            controller.attachModelInteractionSource(id3, modelCtx.modelDirectories.directoryFor(id3).store);
          } catch {
            controller.attachModelInteractionSource(null, null);
          }
        };
        updateInteraction();
        modelCtx.effect(() => source.subscribe(updateInteraction), "dsmm: native model interaction binding");
        modelCtx.effect(() => () => controller.attachModelInteractionSource(null, null), "dsmm: native model interaction withdrawal");
      });
    });
  });
}
return module.exports; } });
