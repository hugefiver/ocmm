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
  TYPERT_REMOTE: () => TYPERT_REMOTE,
  apply: () => apply,
  en: () => en,
  inject: () => inject,
  zh: () => zh
});
module.exports = __toCommonJS(index_exports);

// src/profile-remote.ts
var errorCodes = /* @__PURE__ */ new Set(["validation", "conflict", "not-found", "lock-timeout", "unsafe-path", "io", "activation", "corrupt-selection", "limit"]);
var idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
var revisionPattern = /^[a-f0-9]{64}$/u;
function isProfileId(value) {
  return typeof value === "string" && idPattern.test(value) && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/iu.test(value);
}
function fail(field) {
  throw new TypeError(`Invalid DSMM profile wire field: ${field}`);
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
function object(value, required, optional2 = []) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("object");
  const result = value;
  if (Object.keys(result).some((key) => !required.includes(key) && !optional2.includes(key)) || required.some((key) => !Object.hasOwn(result, key))) fail("object keys");
  return result;
}
function optional(value, key, parse2) {
  return Object.hasOwn(value, key) ? { [key]: parse2(value[key]) } : {};
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
  const item = object(value, ["profiles", "selectedId", "appliedRevision", "selectionRevision"], ["selectionError"]);
  if (!Array.isArray(item.profiles) || item.profiles.length > 128) fail("profiles");
  return {
    profiles: item.profiles.map((input) => {
      const row = object(input, ["id", "revision"], ["label", "error"]);
      return { id: text(row.id, "id", 64), revision: row.revision === null ? null : revision(row.revision), ...optional(row, "label", (input2) => text(input2, "label", 120)), ...optional(row, "error", errorInfo) };
    }),
    selectedId: item.selectedId === null ? null : id(item.selectedId),
    appliedRevision: item.appliedRevision === null ? null : revision(item.appliedRevision),
    selectionRevision: item.selectionRevision === "unavailable" && Object.hasOwn(item, "selectionError") ? "unavailable" : selectionRevision(item.selectionRevision),
    ...optional(item, "selectionError", errorInfo)
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
function codec(symbol, parse2) {
  return { mode: "strict", typeSymbol: `@dsmm/dsmm#${symbol}`, create: () => ({ parse: parse2 }) };
}
function descriptor(method, result, parameter) {
  return { id: `@dsmm/dsmm#dsmmProfiles/${method}`, service: "dsmmProfiles", namespace: "dsmmProfiles", method, invocation: { kind: "direct" }, parameters: parameter === void 0 ? [] : [{ name: parameter.name, wire: parameter.name, source: "json", codec: parameter.codec }], result };
}
var TYPERT_REMOTE = {
  package: "@dsmm/dsmm",
  descriptors: [
    descriptor("describe", codec("ProfileSnapshot", snapshot)),
    descriptor("read", codec("ProfileReadResult", readResult), { name: "id", codec: codec("ProfileId", id) }),
    descriptor("save", codec("ProfileReadResult", readResult), { name: "request", codec: codec("ProfileSaveRequest", saveRequest) }),
    descriptor("select", codec("ProfileSnapshot", snapshot), { name: "request", codec: codec("ProfileSelectRequest", selectRequest) })
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

// src/client/controller.ts
var NEW_EDITOR = "";
var NEW_PROFILE_CONTENT = '{\n  "version": 1,\n  "id": "new-profile",\n  "label": "New profile",\n  "settings": {\n    // Runtime overlay only. Omitted fields inherit the deployment baseline.\n    "defaultActive": true\n  }\n}\n';
function canReconcileSelection(snapshot2) {
  return snapshot2 !== null && (snapshot2.selectionRevision === "absent" || /^[a-f0-9]{64}$/u.test(snapshot2.selectionRevision)) && (snapshot2.selectionError === void 0 || snapshot2.selectionError.code === "conflict");
}
var ProfilesController = class {
  constructor(remote) {
    this.remote = remote;
  }
  current = { snapshot: null, editor: null, dirty: false, busy: null, issue: null, notice: null, pendingEditor: null };
  accepted = null;
  listeners = /* @__PURE__ */ new Set();
  generation = 0;
  disposed = false;
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
    cancelDiscard: () => this.publish({ pendingEditor: null })
  };
  dispose() {
    this.disposed = true;
    this.generation += 1;
    this.listeners.clear();
  }
  publish(patch) {
    if (this.disposed) return;
    this.current = { ...this.current, ...patch };
    for (const listener of this.listeners) listener();
  }
  accept(document2) {
    this.accepted = { ...document2 };
    this.publish({ editor: { ...document2 }, dirty: false, pendingEditor: null });
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
    if (this.disposed || this.current.busy !== null || this.current.pendingEditor !== null) return;
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
      this.publish({ editor: { id: "new-profile", content: NEW_PROFILE_CONTENT, revision: null }, dirty: true, issue: null, notice: null, pendingEditor: null });
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
    let content2 = editor.content;
    try {
      content2 = applyEdits(content2, modify(content2, ["id"], id2, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
    } catch {
    }
    this.publish({ editor: { ...editor, id: id2, content: content2 }, dirty: true, issue: null, notice: null });
  }
  editContent(content2) {
    const editor = this.current.editor;
    if (editor === null || this.current.busy !== null || this.current.pendingEditor !== null) return;
    this.publish({ editor: { ...editor, content: content2 }, dirty: this.accepted === null || this.accepted.content !== content2 || this.accepted.id !== editor.id, issue: null, notice: null });
  }
  async save() {
    const editor = this.current.editor;
    if (editor === null || !this.current.dirty || this.current.snapshot === null || this.current.busy !== null || this.current.pendingEditor !== null) return;
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
  title: "DSMM Profiles",
  description: "Save independent runtime configurations and choose which one new sessions use.",
  newSessions: "Apply and reset affect new sessions only. Existing sessions, including blank sessions, keep their current policy. A cold resume uses the currently applied policy.",
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
  unavailable: "The native profile service is unavailable. Your draft is kept. Refresh after the Host reconnects or DSMM is enabled.",
  transport: "The native connection could not confirm this operation. Your draft is kept. Refresh the Host state before retrying; do not assume a save or apply completed.",
  invalidProfile: "Unavailable profile: {id}",
  details: "Host diagnostic",
  retry: "Resolve the diagnostic, refresh profiles, then retry."
};
var zh = {
  title: "DSMM 配置档",
  description: "保存独立的运行时配置，并选择新会话使用的配置档。",
  newSessions: "应用和重置仅影响新会话。已有会话（包括空白会话）保留原策略。冷恢复使用当前已应用的策略。",
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
  unavailable: "原生配置档服务不可用。草稿已保留。Host 重新连接或启用 DSMM 后请刷新。",
  transport: "原生连接无法确认此操作。草稿已保留。重试之前请刷新 Host 状态；不要假定保存或应用已完成。",
  invalidProfile: "不可用配置档：{id}",
  details: "Host 诊断",
  retry: "请解决诊断问题，刷新配置档后重试。"
};

// src/client/ProfilesSection.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
function issueKey(issue) {
  if (issue.source === "selection") return issue.code === "conflict" ? "selectionConflict" : "appliedInvalid";
  if (issue.kind === "assembly") return "unavailable";
  if (issue.kind === "transport") return "transport";
  return issue.code === "conflict" || issue.code === "validation" ? issue.code : "io";
}
function ProfilesSection(props) {
  const { t } = props;
  const state = props.useProfiles((snapshot3) => snapshot3);
  const prefix = (0, import_react.useId)();
  const selectRef = (0, import_react.useRef)(null);
  const inputRef = (0, import_react.useRef)(null);
  const editorRef = (0, import_react.useRef)(null);
  const cancelRef = (0, import_react.useRef)(null);
  const hadConfirmation = (0, import_react.useRef)(false);
  const disabled = state.busy !== null || state.pendingEditor !== null;
  const snapshot2 = state.snapshot;
  const editor = state.editor;
  const reconcilable = canReconcileSelection(snapshot2);
  const selectionConflict = reconcilable && snapshot2?.selectionError?.code === "conflict";
  const invalid = state.issue?.kind === "domain" && state.issue.code === "validation";
  const idInvalid = invalid && state.issue?.field === "id";
  (0, import_react.useEffect)(() => {
    if (state.pendingEditor !== null) {
      cancelRef.current?.focus();
      hadConfirmation.current = true;
    } else if (hadConfirmation.current) {
      selectRef.current?.focus();
      hadConfirmation.current = false;
    }
  }, [state.pendingEditor]);
  (0, import_react.useEffect)(() => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsmm-profiles", "aria-labelledby": `${prefix}-title`, "aria-busy": state.busy !== null, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { id: `${prefix}-title`, children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("description") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsmm-hint", children: t("newSessions") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { "data-dsmm-selection": true, children: selection }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled: disabled || snapshot2 === null, onClick: () => {
        void props.create();
      }, children: t("new") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled, onClick: () => {
        void props.refresh();
      }, children: t(state.busy === "refresh" ? "refreshing" : "refresh") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled: disabled || !reconcilable || snapshot2?.selectedId === null && !selectionConflict, onClick: () => {
        void props.reset();
      }, children: t(state.busy === "reset" ? "resetting" : "reset") })
    ] }),
    snapshot2 !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `${prefix}-select`, children: t("editorSelect") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { ref: selectRef, id: `${prefix}-select`, disabled, value: editor?.revision == null ? "" : editor.id, onChange: (event) => {
        if (event.currentTarget.value) void props.open(event.currentTarget.value);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: t(editor?.revision === null ? "newDraft" : "choose") }),
        snapshot2.profiles.map((profile, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: profile.id, children: [
          profile.label === void 0 ? profile.id : `${profile.label} (${profile.id})`,
          profile.error === void 0 ? "" : ` — ${t("invalidProfile", { id: profile.id })}`
        ] }, `${index}:${profile.id}`))
      ] }),
      snapshot2.profiles.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsmm-hint", children: t("empty") })
    ] }),
    state.pendingEditor !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-confirm", role: "group", "aria-labelledby": `${prefix}-confirm`, onKeyDown: (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.cancelDiscard();
      }
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { id: `${prefix}-confirm`, children: t("discardPrompt") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", onClick: () => {
          void props.discardAndOpen();
        }, children: t("discard") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { ref: cancelRef, type: "button", variant: "primary", onClick: props.cancelDiscard, children: t("cancel") })
      ] })
    ] }),
    editor !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-editor", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `${prefix}-id`, children: t("profileId") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Input, { ref: inputRef, id: `${prefix}-id`, className: "dsmm-input", value: editor.id, disabled: disabled || editor.revision !== null, "aria-invalid": idInvalid || void 0, "aria-describedby": `${prefix}-id-hint${idInvalid ? ` ${prefix}-issue` : ""}`, onChange: (event) => props.editId(event.currentTarget.value) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { id: `${prefix}-id-hint`, className: "dsmm-hint", children: t("idHint") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: `${prefix}-content`, children: t("configuration") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { ref: editorRef, id: `${prefix}-content`, rows: 12, spellCheck: false, value: editor.content, disabled, "aria-invalid": invalid && !idInvalid || void 0, "aria-describedby": `${prefix}-content-hint ${prefix}-structural-hint${invalid && !idInvalid ? ` ${prefix}-issue` : ""}`, onChange: (event) => props.editContent(event.currentTarget.value) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { id: `${prefix}-content-hint`, className: "dsmm-hint", children: t("configurationHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { id: `${prefix}-structural-hint`, className: "dsmm-hint", children: t("structuralHint") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { "data-dsmm-editor-state": true, children: t(state.dirty ? "dirty" : applied ? "savedApplied" : "savedNotApplied") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "primary", disabled: disabled || !state.dirty || snapshot2 === null, onClick: () => {
          void props.save();
        }, children: t(state.busy === "save" ? "saving" : "save") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled: disabled || state.dirty || editor.revision === null || !reconcilable || applied && !selectionConflict, onClick: () => {
          void props.apply();
        }, children: t(state.busy === "apply" ? "applying" : "apply") }),
        editor.revision !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled, onClick: () => {
          void props.reload();
        }, children: t("reload") })
      ] })
    ] }),
    state.issue !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-issue", id: `${prefix}-issue`, role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t(issueKey(state.issue)) }),
      state.issue.kind === "domain" && state.issue.message !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
        t("details"),
        ": ",
        state.issue.message
      ] })
    ] }),
    snapshot2?.selectionError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsmm-issue", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
        t("details"),
        ": ",
        snapshot2.selectionError.message
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t(selectionConflict ? "selectionConflict" : "retry") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", "aria-atomic": "true", children: state.busy === "refresh" && snapshot2 === null ? t("loading") : state.busy === "read" ? t("reading") : notice })
  ] });
}

// src/client/styles.ts
var PROFILE_STYLES = `
.dsmm-profiles{width:100%;max-width:760px;min-width:0;display:flex;flex-direction:column;gap:12px;font-family:var(--dsw-font-family);font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}
.dsmm-profiles h2{margin:0;font-size:18px;font-weight:600}
.dsmm-profiles p{margin:0;overflow-wrap:anywhere}
.dsmm-profiles .dsmm-hint{color:var(--dsw-alias-label-secondary)}
.dsmm-profiles .dsmm-field{min-width:0;display:flex;flex-direction:column;gap:6px}
.dsmm-profiles .dsmm-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.dsmm-profiles .dsmm-actions>button{max-width:100%;white-space:normal;overflow-wrap:anywhere;min-height:36px;height:auto}
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
  const controller = new ProfilesController(ctx.remote.dsmmProfiles);
  ctx.effect(() => () => controller.dispose(), "dsmm: profile editor");
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), "dsmm: profile locale");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.dsmmProfiles = "";
    style.textContent = PROFILE_STYLES;
    document.head.append(style);
    return () => style.remove();
  }, "dsmm: profile styles");
  const t = ctx.locale.bind(NS);
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "dsmm-profiles",
    order: 30,
    label: () => t("title"),
    locale: NS,
    inject: () => ({ hooks: { profiles: controller.store }, ...controller.actions })
  }, ProfilesSection));
  void controller.refresh();
}
return module.exports; } });
