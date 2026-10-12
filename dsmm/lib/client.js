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

// src/profile-types.ts
var DSMM_ROUTE_SOURCES = ["inherited", "primary", "level", "invocation-route"];

// ../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/scanner.js
function createScanner(text3, ignoreTrivia = false) {
  const len = text3.length;
  let pos = 0, value = "", tokenOffset = 0, token = 16, lineNumber = 0, lineStartOffset = 0, tokenLineStartOffset = 0, prevTokenLineStartOffset = 0, scanError = 0;
  function scanHexDigits(count, exact) {
    let digits = 0;
    let value2 = 0;
    while (digits < count || !exact) {
      let ch = text3.charCodeAt(pos);
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
    if (text3.charCodeAt(pos) === 48) {
      pos++;
    } else {
      pos++;
      while (pos < text3.length && isDigit(text3.charCodeAt(pos))) {
        pos++;
      }
    }
    if (pos < text3.length && text3.charCodeAt(pos) === 46) {
      pos++;
      if (pos < text3.length && isDigit(text3.charCodeAt(pos))) {
        pos++;
        while (pos < text3.length && isDigit(text3.charCodeAt(pos))) {
          pos++;
        }
      } else {
        scanError = 3;
        return text3.substring(start, pos);
      }
    }
    let end = pos;
    if (pos < text3.length && (text3.charCodeAt(pos) === 69 || text3.charCodeAt(pos) === 101)) {
      pos++;
      if (pos < text3.length && text3.charCodeAt(pos) === 43 || text3.charCodeAt(pos) === 45) {
        pos++;
      }
      if (pos < text3.length && isDigit(text3.charCodeAt(pos))) {
        pos++;
        while (pos < text3.length && isDigit(text3.charCodeAt(pos))) {
          pos++;
        }
        end = pos;
      } else {
        scanError = 3;
      }
    }
    return text3.substring(start, end);
  }
  function scanString() {
    let result = "", start = pos;
    while (true) {
      if (pos >= len) {
        result += text3.substring(start, pos);
        scanError = 2;
        break;
      }
      const ch = text3.charCodeAt(pos);
      if (ch === 34) {
        result += text3.substring(start, pos);
        pos++;
        break;
      }
      if (ch === 92) {
        result += text3.substring(start, pos);
        pos++;
        if (pos >= len) {
          scanError = 2;
          break;
        }
        const ch2 = text3.charCodeAt(pos++);
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
          result += text3.substring(start, pos);
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
    let code = text3.charCodeAt(pos);
    if (isWhiteSpace(code)) {
      do {
        pos++;
        value += String.fromCharCode(code);
        code = text3.charCodeAt(pos);
      } while (isWhiteSpace(code));
      return token = 15;
    }
    if (isLineBreak(code)) {
      pos++;
      value += String.fromCharCode(code);
      if (code === 13 && text3.charCodeAt(pos) === 10) {
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
        if (text3.charCodeAt(pos + 1) === 47) {
          pos += 2;
          while (pos < len) {
            if (isLineBreak(text3.charCodeAt(pos))) {
              break;
            }
            pos++;
          }
          value = text3.substring(start, pos);
          return token = 12;
        }
        if (text3.charCodeAt(pos + 1) === 42) {
          pos += 2;
          const safeLength = len - 1;
          let commentClosed = false;
          while (pos < safeLength) {
            const ch = text3.charCodeAt(pos);
            if (ch === 42 && text3.charCodeAt(pos + 1) === 47) {
              pos += 2;
              commentClosed = true;
              break;
            }
            pos++;
            if (isLineBreak(ch)) {
              if (ch === 13 && text3.charCodeAt(pos) === 10) {
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
          value = text3.substring(start, pos);
          return token = 13;
        }
        value += String.fromCharCode(code);
        pos++;
        return token = 16;
      // numbers
      case 45:
        value += String.fromCharCode(code);
        pos++;
        if (pos === len || !isDigit(text3.charCodeAt(pos))) {
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
          code = text3.charCodeAt(pos);
        }
        if (tokenOffset !== pos) {
          value = text3.substring(tokenOffset, pos);
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
  function addEdit(text3, startOffset, endOffset) {
    if (!hasError && (!range || startOffset < rangeEnd && endOffset > rangeStart) && documentText.substring(startOffset, endOffset) !== text3) {
      editOperations.push({ offset: startOffset, length: endOffset - startOffset, content: text3 });
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
function getEOL(options, text3) {
  for (let i = 0; i < text3.length; i++) {
    const ch = text3.charAt(i);
    if (ch === "\r") {
      if (i + 1 < text3.length && text3.charAt(i + 1) === "\n") {
        return "\r\n";
      }
      return "\r";
    } else if (ch === "\n") {
      return "\n";
    }
  }
  return options && options.eol || "\n";
}
function isEOL(text3, offset) {
  return "\r\n".indexOf(text3.charAt(offset)) !== -1;
}

// ../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/parser.js
var ParseOptions;
(function(ParseOptions2) {
  ParseOptions2.DEFAULT = {
    allowTrailingComma: false
  };
})(ParseOptions || (ParseOptions = {}));
function parse(text3, errors = [], options = ParseOptions.DEFAULT) {
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
      const array3 = [];
      onValue(array3);
      previousParents.push(currentParent);
      currentParent = array3;
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
  visit(text3, visitor, options);
  return currentParent[0];
}
function parseTree(text3, errors = [], options = ParseOptions.DEFAULT) {
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
  visit(text3, visitor, options);
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
function visit(text3, visitor, options = ParseOptions.DEFAULT) {
  const _scanner = createScanner(text3, false);
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
function setProperty(text3, originalPath, value, options) {
  const path = originalPath.slice();
  const errors = [];
  const root = parseTree(text3, errors);
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
    return withFormatting(text3, { offset: root ? root.offset : 0, length: root ? root.length : 0, content: JSON.stringify(value) }, options);
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
        return withFormatting(text3, { offset: removeBegin, length: removeEnd - removeBegin, content: "" }, options);
      } else {
        return withFormatting(text3, { offset: existing.offset, length: existing.length, content: JSON.stringify(value) }, options);
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
      return withFormatting(text3, edit, options);
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
      return withFormatting(text3, edit, options);
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
      return withFormatting(text3, edit, options);
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
      return withFormatting(text3, edit, options);
    } else {
      throw new Error(`Can not ${value === void 0 ? "remove" : options.isArrayInsertion ? "insert" : "modify"} Array index ${insertIndex} as length is not sufficient`);
    }
  } else {
    throw new Error(`Can not add ${typeof lastSegment !== "number" ? "index" : "property"} to parent of type ${parent.type}`);
  }
}
function withFormatting(text3, edit, options) {
  if (!options.formattingOptions) {
    return [edit];
  }
  let newText = applyEdit(text3, edit);
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
  const editLength = text3.length - (newText.length - end) - begin;
  return [{ offset: begin, length: editLength, content: newText.substring(begin, end) }];
}
function applyEdit(text3, edit) {
  return text3.substring(0, edit.offset) + edit.content + text3.substring(edit.offset + edit.length);
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
function modify(text3, path, value, options) {
  return setProperty(text3, path, value, options);
}
function applyEdits(text3, edits) {
  let sortedEdits = edits.slice(0).sort((a, b) => {
    const diff = a.offset - b.offset;
    if (diff === 0) {
      return a.length - b.length;
    }
    return diff;
  });
  let lastModifiedOffset = text3.length;
  for (let i = sortedEdits.length - 1; i >= 0; i--) {
    let e = sortedEdits[i];
    if (e.offset + e.length <= lastModifiedOffset) {
      text3 = applyEdit(text3, e);
    } else {
      throw new Error("Overlapping edit");
    }
    lastModifiedOffset = e.offset;
  }
  return text3;
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
var roleId = /^dsmm-(?:orchestrator|planner|plan-critic|builder|reviewer|oracle|oracle-2nd|creative|code-search|doc-search|clarifier|media-reader|frontend|hard-reasoning|research|quick|coding|normal-task|complex|deep|documenting|cross-cutting)$/u;
var skillId = /^(?:brainstorming|writing-plans|requesting-code-review|receiving-code-review|subagent-driven-development|dispatching-parallel-agents|remove-ai-slops|debugging|frontend|git-master|ast-grep|coding-agent-sessions|init-deep|using-git-worktrees)$/u;
var route = { provider: null, model: null, reasoningEffort: null };
var rateLimit = Object.fromEntries(Object.keys(DSMM_RATE_LIMIT_BOUNDS).map((key) => [key, null]));
var roleRouting = { primary: route, fallbackRoutes: [route], strategy: null, rateLimit, levels: { low: route, high: route, max: route } };
var configFields = {
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
  sessionPersistence: { root: null, compression: null },
  skills: "skills",
  roles: "roles",
  roleRouting: "role-routing",
  runtimePolicy: { strategy: null, rateLimit },
  presets: { materialize: null, root: null },
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
      for (const property of node.children ?? []) {
        const keyNode = property.children[0], key = String(keyNode.value), next = [...path, key];
        const code = ["__proto__", "constructor", "prototype"].includes(key) ? "unsafe-field" : found.has(key) ? "duplicate-field" : void 0;
        if (code !== void 0) diagnostics.push(diagnostic(code, safeDiagnosticField(next), diagnosticLocation(content2, keyNode.offset, keyNode.length)));
        found.add(key);
        walk(property.children[1], next, depth2 + 1);
      }
    } else if (node.type === "array") (node.children ?? []).forEach((child2, index) => walk(child2, [...path, index], depth2 + 1));
  };
  walk(tree, [], 0);
  return { tree, diagnostics };
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
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some((property) => !Object.hasOwn(property, "value") || !property.enumerable)) fail("object");
  const result = value;
  if (Object.keys(result).some((key) => !required.includes(key) && !optional2.includes(key)) || required.some((key) => !Object.hasOwn(result, key))) fail("object keys");
  return result;
}
function optional(value, key, parse3) {
  return Object.hasOwn(value, key) ? { [key]: parse3(value[key]) } : {};
}
function parseProfileErrorInfo(value) {
  const item = object(value, ["code", "message"], ["field", "reason", "location"]);
  const code = text(item.code, "code");
  if (!errorCodes.has(code)) fail("code");
  const reason = item.reason === void 0 ? void 0 : text(item.reason, "reason", 64);
  if (reason !== void 0 && (!Object.hasOwn(PROFILE_DIAGNOSTIC_REASONS, reason) || reason === "blank-label")) fail("reason");
  const field = item.field === void 0 ? void 0 : diagnosticField(item.field);
  return {
    code,
    message: reason === void 0 ? text(item.message, "message", 4096) : `${field ?? "document"}: ${diagnostic(reason, field ?? "document").reason}`,
    ...field === void 0 ? {} : { field },
    ...reason === void 0 ? {} : { reason },
    ...optional(item, "location", diagnosticPosition)
  };
}
var errorInfo = parseProfileErrorInfo;
function diagnosticField(value) {
  if (!isSafeDiagnosticField(value)) fail("field");
  return value;
}
function diagnosticPosition(value) {
  const item = object(value, ["offset", "length", "line", "column"]);
  const result = { offset: integer(item.offset, "offset", 128 * 1024), length: integer(item.length, "length", 128 * 1024), line: integer(item.line, "line", 128 * 1024 + 1), column: integer(item.column, "column", 128 * 1024 + 1) };
  if (result.line < 1 || result.column < 1 || result.offset + result.length > 128 * 1024) fail("location");
  return result;
}
function parseProfileDiagnostic(value) {
  const row = object(value, ["severity", "code", "field", "reason"], ["location"]);
  if (typeof row.code !== "string" || !Object.hasOwn(PROFILE_DIAGNOSTIC_REASONS, row.code)) fail("diagnostic code");
  const result = diagnostic(row.code, diagnosticField(row.field));
  if (row.severity !== result.severity || row.reason !== result.reason) fail("diagnostic severity/reason");
  return { ...result, ...optional(row, "location", diagnosticPosition) };
}
function warnings(value) {
  if (!Array.isArray(value) || value.length > 1) fail("warnings");
  return value.map((value2) => {
    const result = parseProfileDiagnostic(value2);
    if (result.severity !== "warning" || result.code !== "blank-label" || result.field !== "label") fail("warning");
    return result;
  });
}
function parseRoleAvailability(value) {
  const row = object(value, ["id", "required", "startupAvailable", "deploymentEnabled", "admitted", "source", "capture"], ["requiredReason", "namedEnabled", "reason"]);
  if (typeof row.source !== "string" || !["defaults", "global", "profile", "named-session"].includes(row.source) || typeof row.capture !== "string" || !["startup", "deployment", "named-session"].includes(row.capture)) fail("role source/capture");
  if (row.reason !== void 0 && (typeof row.reason !== "string" || !["module-off", "deployment-disabled", "startup-unavailable", "profile-disabled", "required-role", "current-root-disabled"].includes(row.reason))) fail("role reason");
  if (row.requiredReason !== void 0 && (typeof row.requiredReason !== "string" || !["deepwork-planning", "legacy-review"].includes(row.requiredReason))) fail("requiredReason");
  return {
    id: role(row.id),
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
  if (!Array.isArray(value) || value.length > 22) fail("roles");
  const result = value.map(parseRoleAvailability);
  if (new Set(result.map((role2) => role2.id)).size !== result.length) fail("roles");
  return result;
}
function parseSubagentRuntimeAdmissionView(value) {
  const row = object(value, ["binding", "deliveryFenceReady", "restartRequired"], ["reason"]);
  if (typeof row.binding !== "string" || !["stock", "dsmm", "unavailable"].includes(row.binding) || row.reason !== void 0 && (typeof row.reason !== "string" || !["explicit-composition-required", "duplicate-provider", "authority-not-ready"].includes(row.reason))) fail("subagentRuntime");
  const ready = boolean(row.deliveryFenceReady, "deliveryFenceReady");
  if (ready && (row.binding !== "dsmm" || row.reason !== void 0)) fail("subagentRuntime readiness");
  return { binding: row.binding, deliveryFenceReady: ready, restartRequired: boolean(row.restartRequired, "restartRequired"), ...row.reason === void 0 ? {} : { reason: row.reason } };
}
function readResult(value) {
  const item = object(value, ["id", "revision", "content"], ["label", "warnings"]);
  return { id: id(item.id), revision: revision(item.revision), content: content(item.content), ...optional(item, "label", (input) => text(input, "label", 120)), ...optional(item, "warnings", warnings) };
}
function content(value) {
  const result = text(value, "content", 128 * 1024);
  if (new TextEncoder().encode(result).byteLength > 128 * 1024) fail("content");
  return result;
}
function snapshot(value) {
  const item = object(value, ["profiles", "selectedId", "appliedRevision", "selectionRevision"], ["selectionError", "roles", "editorDefaults", "origin", "readOnly", "writeRestriction", "selectedWarnings"]);
  if (!Array.isArray(item.profiles) || item.profiles.length > 128) fail("profiles");
  return {
    profiles: item.profiles.map((input) => {
      const row = object(input, ["id", "revision"], ["label", "error", "warnings"]);
      return { id: text(row.id, "id", 64), revision: row.revision === null ? null : revision(row.revision), ...optional(row, "label", (input2) => text(input2, "label", 120)), ...optional(row, "error", errorInfo), ...optional(row, "warnings", warnings) };
    }),
    selectedId: item.selectedId === null ? null : id(item.selectedId),
    appliedRevision: item.appliedRevision === null ? null : revision(item.appliedRevision),
    selectionRevision: item.selectionRevision === "unavailable" && Object.hasOwn(item, "selectionError") ? "unavailable" : selectionRevision(item.selectionRevision),
    ...optional(item, "selectionError", errorInfo),
    ...optional(item, "selectedWarnings", warnings),
    ...optional(item, "roles", (input) => {
      if (!Array.isArray(input) || input.length > 22) fail("roles");
      const result = input.map((value2) => {
        const row = object(value2, ["id", "label", "enabled"], ["runtimePolicy", "availability"]);
        return { id: role(row.id), label: text(row.label, "label", 120), enabled: boolean(row.enabled, "enabled"), ...optional(row, "availability", parseRoleAvailability), ...optional(row, "runtimePolicy", (input2) => {
          const policy = object(input2, [], ["strategy", "rateLimit"]);
          return { ...optional(policy, "strategy", normalizeRoutingStrategy), ...optional(policy, "rateLimit", normalizeRateLimitOverrides) };
        }) };
      });
      if (new Set(result.map((row) => row.id)).size !== result.length) fail("roles");
      return result;
    }),
    ...optional(item, "editorDefaults", runtimePolicy),
    ...optional(item, "origin", (input) => {
      if (typeof input !== "string" || !["central", "legacy", "explicit"].includes(input)) fail("origin");
      return input;
    }),
    ...optional(item, "readOnly", (input) => boolean(input, "readOnly")),
    ...optional(item, "writeRestriction", (input) => text(input, "writeRestriction", 1024))
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
    retries: integer(item.retries, "retries", 10),
    rateLimitFailures: integer(item.rateLimitFailures, "rateLimitFailures"),
    switches: integer(item.switches, "switches", 10),
    totalDelayMs: integer(item.totalDelayMs, "totalDelayMs", 12e4),
    ...optional(item, "role", role),
    ...optional(item, "route", modelRoute)
  };
}
function modelRoute(value) {
  const route3 = object(value, ["provider", "model"], ["reasoningEffort"]);
  const provider = routeText(route3.provider, "provider", 128);
  const model = routeText(route3.model, "model", 512);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(provider) || model.includes("://")) fail("route");
  return { provider, model, ...optional(route3, "reasoningEffort", (input) => routeText(input, "reasoningEffort", 64)) };
}
function initialRoleRoute(value) {
  const row = object(value, ["status"], ["source", "route", "reason"]);
  if (row.status === "known") {
    object(row, ["status", "source", "route"]);
    if (row.source !== "invocation-capture") fail("initialRoute source");
    return { status: "known", source: "invocation-capture", route: modelRoute(row.route) };
  }
  object(row, ["status", "reason"]);
  if (row.status !== "unknown" || row.reason !== "missing-invocation-capture") fail("initialRoute reason");
  return { status: "unknown", reason: "missing-invocation-capture" };
}
function liveRoleRoute(value) {
  const row = object(value, ["status"], ["source", "route", "reason"]);
  if (row.status === "known") {
    object(row, ["status", "source", "route"]);
    if (row.source !== "own-native-request-header") fail("liveRoute source");
    return { status: "known", source: "own-native-request-header", route: modelRoute(row.route) };
  }
  object(row, ["status", "reason"]);
  if (row.status !== "unknown" || typeof row.reason !== "string" || !["no-own-request-header", "invalid-own-request-header", "not-observed"].includes(row.reason)) fail("liveRoute reason");
  return { status: "unknown", reason: row.reason };
}
function parseDsmmRoleRouteComparison(value) {
  const row = object(jsonData(value), ["childId", "initialRoute", "liveRoute"]);
  return { childId: sessionId(row.childId), initialRoute: initialRoleRoute(row.initialRoute), liveRoute: liveRoleRoute(row.liveRoute) };
}
function parseDsmmInvocationView(value) {
  const row = object(jsonData(value), ["role", "label", "level", "routeSource", "mode"], ["route", "runId", "childId", "jobId", "routeComparison"]);
  if (typeof row.level !== "string" || !["normal", "low", "high", "max"].includes(row.level) || !DSMM_ROUTE_SOURCES.includes(row.routeSource) || typeof row.mode !== "string" || !["one-shot", "continuable"].includes(row.mode)) fail("invocation");
  const target = role(row.role);
  if (target === "dsmm-orchestrator") fail("invocation target");
  const routeComparison = Object.hasOwn(row, "routeComparison") ? parseDsmmRoleRouteComparison(row.routeComparison) : void 0;
  if (routeComparison !== void 0 && (!Object.hasOwn(row, "childId") || routeComparison.childId !== row.childId)) fail("invocation routeComparison childId");
  return { role: target, label: text(row.label, "label", 120), level: row.level, routeSource: row.routeSource, mode: row.mode, ...optional(row, "route", modelRoute), ...optional(row, "runId", sessionId), ...optional(row, "childId", sessionId), ...optional(row, "jobId", sessionId), ...routeComparison === void 0 ? {} : { routeComparison } };
}
function selectionState(value) {
  const item = object(value, ["selectedId", "appliedRevision", "selectionRevision"]);
  return { selectedId: item.selectedId === null ? null : id(item.selectedId), appliedRevision: item.appliedRevision === null ? null : revision(item.appliedRevision), selectionRevision: selectionRevision(item.selectionRevision) };
}
function sessionSnapshot(value) {
  const item = object(value, ["sessionId", "globalDefault", "selection", "scope", "admissionEpoch", "switchAllowed"], ["admittedSelection", "switchUnavailableReason", "rolePolicy", "profileModel", "deepwork", "modules", "configuration", "warnings", "roles", "subagentRuntime"]);
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
    ...optional(item, "configuration", admissionView),
    ...optional(item, "warnings", warnings),
    ...optional(item, "roles", roleAvailabilityList),
    ...optional(item, "subagentRuntime", parseSubagentRuntimeAdmissionView),
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
  return { mode: "strict", typeSymbol: `@dsmm/dsmm#${symbol}`, create: () => ({ parse: (value) => parse3(jsonData(value)) }) };
}
function descriptor(method, result, parameter) {
  return { id: `@dsmm/dsmm#dsmmProfiles/${method}`, service: "dsmmProfiles", namespace: "dsmmProfiles", method, invocation: { kind: "direct" }, parameters: parameter === void 0 ? [] : [{ name: parameter.name, wire: parameter.name, source: "json", codec: parameter.codec }], result };
}
function jsonData(value, depth2 = 0, active = /* @__PURE__ */ new Set()) {
  if (depth2 > 32) fail("JSON depth");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || value === null || active.has(value)) fail("JSON value");
  if (Array.isArray(value) ? Object.getPrototypeOf(value) !== Array.prototype : Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail("JSON object");
  if (Object.getOwnPropertySymbols(value).length) fail("JSON symbols");
  const properties = Object.getOwnPropertyDescriptors(value);
  for (const [key, property] of Object.entries(properties)) {
    if (Array.isArray(value) && key === "length") continue;
    if (!Object.hasOwn(property, "value") || !property.enumerable || Array.isArray(value) && !/^(0|[1-9][0-9]*)$/u.test(key)) fail("JSON property");
  }
  if (Array.isArray(value) && Object.keys(value).length !== value.length) fail("JSON array holes");
  active.add(value);
  const result = Array.isArray(value) ? value.map((child2) => jsonData(child2, depth2 + 1, active)) : Object.fromEntries(Object.entries(value).map(([key, child2]) => {
    if (["__proto__", "prototype", "constructor"].includes(key)) fail("JSON key");
    return [key, jsonData(child2, depth2 + 1, active)];
  }));
  active.delete(value);
  return result;
}
function globalSnapshot(value) {
  const row = object(value, ["config", "revision"]);
  object(row.config, [], Object.keys(row.config));
  return { config: jsonData(row.config), revision: selectionRevision(row.revision) };
}
function admissionView(value) {
  const row = object(value, ["settings", "sources", "captures", "restartRequired", "named"]);
  object(row.settings, [], Object.keys(row.settings));
  for (const key of ["sources", "captures"]) {
    const map = object(row[key], [], Object.keys(row[key]));
    for (const [path, value2] of Object.entries(map)) {
      if (path.startsWith("lsp.env.")) fail("private environment field");
      text(value2, key, 128);
    }
  }
  if (!Array.isArray(row.restartRequired) || row.restartRequired.length > 256) fail("restartRequired");
  const named = row.named === null ? null : object(row.named, ["id", "revision"]);
  return {
    settings: readOnlySettingsData(row.settings),
    sources: jsonData(row.sources),
    captures: jsonData(row.captures),
    restartRequired: row.restartRequired.map((value2) => text(value2, "field", 256)),
    named: named === null ? null : { id: id(named.id), revision: revision(named.revision) }
  };
}
function readOnlySettingsData(value) {
  const settings = jsonData(value);
  const configured = (value2) => {
    if (value2 !== "" && value2 !== "<configured>") fail("private configured value");
  };
  if (settings.lsp !== void 0) {
    const lsp = object(settings.lsp, ["enabled", "serverName", "command", "args", "cwd", "env", "toolCallTimeoutMs", "failOnStartupError"]);
    configured(lsp.command);
    configured(lsp.cwd);
    if (!Array.isArray(lsp.args) || lsp.args.some((value2) => value2 !== "<configured>")) fail("private arguments");
    const env = object(lsp.env, [], Object.keys(lsp.env));
    for (const [key, value2] of Object.entries(env)) if (!/^variable-[1-9][0-9]*$/u.test(key) || value2 !== "<redacted>") fail("private environment");
  }
  if (settings.presets !== void 0) {
    const presets = object(settings.presets, ["materialize"], ["root"]);
    if (presets.root !== void 0 && presets.root !== "<configured>") fail("private directory");
  }
  if (settings.runtimeRecovery !== void 0) {
    const recovery = object(settings.runtimeRecovery, ["enabled", "retryOnStatusCodes", "retryOnCodes", "fallbackRoutes", "maxFallbackAttempts", "idleContinuation"]);
    const idle = object(recovery.idleContinuation, ["enabled", "maxContinuations", "prompt"]);
    configured(idle.prompt);
  }
  return settings;
}
function editorSnapshot(value) {
  const row = object(value, ["entryId", "namespace", "hostProfileKey", "global", "globalRevision", "profile", "nativeRevision", "nativeFormRevision", "nativeForm", "desired", "sources", "startup", "defaults", "schema", "nextRoot", "modules"], ["startupSources"]);
  const result = jsonData(row);
  text(row.entryId, "entryId", 256);
  if (row.namespace !== null) text(row.namespace, "namespace", 256);
  revision(row.hostProfileKey);
  selectionRevision(row.globalRevision);
  revision(row.nativeRevision);
  if (row.nativeFormRevision !== null) integer(row.nativeFormRevision, "nativeFormRevision");
  for (const key of ["global", "profile", "desired", "sources", "startup", "defaults", "schema"]) object(row[key], [], Object.keys(row[key]));
  if (row.nativeForm !== null) object(row.nativeForm, ["base", "user"]);
  if (row.nextRoot !== null) result.nextRoot = admissionView(row.nextRoot);
  result.desired = readOnlySettingsData(row.desired);
  result.startup = readOnlySettingsData(row.startup);
  result.schema = schemaNode(row.schema);
  for (const map of [result.sources, result.startupSources]) {
    if (map === void 0) continue;
    object(map, [], Object.keys(map));
    for (const [path, value2] of Object.entries(map)) {
      if (path.startsWith("lsp.env.")) fail("private environment field");
      text(value2, "source", 128);
    }
  }
  result.modules = moduleStates(row.modules);
  return result;
}
function schemaNode(value) {
  const row = object(value, ["type"], ["fields", "inner", "alternatives", "value", "min", "max", "step", "required", "keys", "nonempty"]);
  if (typeof row.type !== "string" || !["object", "dict", "array", "union", "const", "string", "number", "boolean"].includes(row.type)) fail("schema type");
  const node = { type: row.type };
  if (row.fields !== void 0) node.fields = Object.fromEntries(Object.entries(object(row.fields, [], Object.keys(row.fields))).map(([key, child2]) => [key, schemaNode(child2)]));
  if (row.inner !== void 0) node.inner = schemaNode(row.inner);
  if (row.alternatives !== void 0) {
    if (!Array.isArray(row.alternatives)) fail("schema alternatives");
    node.alternatives = row.alternatives.map(schemaNode);
  }
  if (Object.hasOwn(row, "value")) {
    if (!["string", "number", "boolean"].includes(typeof row.value)) fail("schema value");
    node.value = row.value;
  }
  for (const key of ["min", "max", "step"]) if (row[key] !== void 0) {
    if (typeof row[key] !== "number" || !Number.isFinite(row[key])) fail("schema bound");
    node[key] = row[key];
  }
  if (row.required !== void 0) node.required = boolean(row.required, "schema required");
  if (row.nonempty !== void 0) {
    if (row.type !== "string") fail("schema nonempty");
    node.nonempty = boolean(row.nonempty, "schema nonempty");
  }
  if (row.keys !== void 0) {
    if (row.type !== "dict" || !Array.isArray(row.keys) || row.keys.length > 64) fail("schema keys");
    node.keys = row.keys.map((key) => text(key, "schema key", 128));
  }
  return node;
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
    const descriptor3 = object(row.descriptor, ["id", "label", "key"]);
    if (descriptor3.id !== "deepwork" || descriptor3.label !== "Deepwork" || descriptor3.key !== "modules.deepwork.enabled" || row.hostBundleEnabled !== "unknown") fail("module descriptor");
    const desired = object(row.desired, ["enabled", "source", "capture"]), next = object(row.nextRoot, ["admitted", "reason"]);
    if (typeof desired.source !== "string" || !["defaults", "global"].includes(desired.source) || typeof desired.capture !== "string" || !["current-global", "admission", "startup"].includes(desired.capture) || ![null, "global-disabled", "restart-required"].includes(next.reason) || ![null, "global-disabled", "restart-required", "captured-off"].includes(row.reason)) fail("module state");
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
    { ...configDescriptor("describeSettings"), result: codec("DeploymentEditorSnapshot", editorSnapshot) },
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
  const label2 = node.value;
  if (label2.length > 120 || /[\u0000-\u001f\u007f]/u.test(label2) || label2.trim() !== "" || new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(label2)) !== label2) return [];
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

// src/client/structured.ts
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function route2(value) {
  return record(value) && typeof value.provider === "string" && typeof value.model === "string" && (value.reasoningEffort === void 0 || typeof value.reasoningEffort === "string") && Object.keys(value).every((key) => ["provider", "model", "reasoningEffort"].includes(key));
}
function level(value) {
  return route2(value) || record(value) && typeof value.reasoningEffort === "string" && Object.keys(value).every((key) => key === "reasoningEffort");
}
function validTree(node, depth2 = 0) {
  if (depth2 > 32) return false;
  if (node.type === "object") {
    const seen = /* @__PURE__ */ new Set();
    for (const property of node.children ?? []) {
      const key = property.children?.[0]?.value;
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
    for (const [role2, raw] of Object.entries(policies)) {
      if (!record(raw) || Object.keys(raw).some((key) => !["primary", "fallbackRoutes", "strategy", "rateLimit", "levels"].includes(key))) return null;
      if (raw.levels !== void 0 && (role2 === "dsmm-orchestrator" || !record(raw.levels) || Object.entries(raw.levels).some(([key, value]) => !["low", "high", "max"].includes(key) || !level(value)))) return null;
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
function canReconcileSelection(snapshot3) {
  return snapshot3 !== null && (snapshot3.selectionRevision === "absent" || /^[a-f0-9]{64}$/u.test(snapshot3.selectionRevision)) && (snapshot3.selectionError === void 0 || snapshot3.selectionError.code === "conflict");
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
    const { currentSessionId: id2, session, sessionChoice, snapshot: snapshot3 } = this.current;
    if (this.disposed || id2 === null || session === null || !session.switchAllowed || this.current.sessionBusy !== null || this.current.busy !== null || this.current.dirty || this.current.pendingEditor !== null) return;
    const selectedId = reset ? null : sessionChoice;
    const revision2 = snapshot3?.profiles.find((profile) => profile.id === selectedId)?.revision;
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
      const snapshot3 = await this.unwrap(this.remote.describe());
      if (live()) this.publish({ snapshot: snapshot3 });
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
    const { editor, snapshot: snapshot3, dirty } = this.current;
    if (editor?.revision == null || !canReconcileSelection(snapshot3) || dirty) return;
    await this.perform("apply", async (live) => {
      const accepted = await this.unwrap(this.remote.select({ id: editor.id, expectedRevision: editor.revision, expectedSelectionRevision: snapshot3.selectionRevision }));
      if (live()) this.acceptSelection(accepted, { key: "applied", id: accepted.selectedId ?? void 0 });
    });
  }
  async reset() {
    const snapshot3 = this.current.snapshot;
    if (!canReconcileSelection(snapshot3)) return;
    await this.perform("reset", async (live) => {
      const accepted = await this.unwrap(this.remote.select({ id: null, expectedSelectionRevision: snapshot3.selectionRevision }));
      if (live()) this.acceptSelection(accepted, { key: "reset" });
    });
  }
  acceptSelection(snapshot3, notice) {
    this.publish({
      snapshot: snapshot3,
      notice: snapshot3.selectionError === void 0 ? notice : null,
      issue: snapshot3.selectionError === void 0 ? null : { ...safeIssue(snapshot3.selectionError), source: "selection" }
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
  bindingState: "Captured subagent binding: {binding}; delivery fence: {ready}; restart required: {restart}.",
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
  structuralHint: "Skills, prompt content, preset installation, LSP, providers/accounts, background/depth and arbitrary route permissions remain deployment-only. Never paste credentials. JSONC and structured controls edit the same draft without normalizing unrelated bytes.",
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
  dirty: "Draft differs from the saved revision. Save or explicitly discard before selecting it.",
  savedNotApplied: "Saved revision; not the future-default pin.",
  savedApplied: "Saved revision matches the future-default pin, not necessarily the current admission.",
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
  sessionState: "Session {id}: {profile}; scope {scope}; admission epoch {epoch}.",
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
  bindingState: "捕获的子 Agent 绑定：{binding}；投递守卫：{ready}；需重启：{restart}。",
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
  structuralHint: "技能、提示内容、预设安装、LSP、提供商与账户、后台与深度及任意路由权限仅可在部署中配置。请勿粘贴凭证。JSONC 与结构化控件共享草稿，不规范化无关字节。",
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
  dirty: "草稿与保存修订不同。选择前请保存或明确丢弃。",
  savedNotApplied: "已保存修订；不是未来默认的固定修订。",
  savedApplied: "保存修订与未来默认固定修订一致，但未必是当前准入。",
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
  sessionState: "会话 {id}：{profile}；范围 {scope}；准入代次 {epoch}。",
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
var import_react3 = require("react");
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/StructuredEditor.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

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

// src/client/StructuredEditor.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: id2, children: t("retryField", { name, field: t(RETRY_FIELD_LABEL_KEYS[field]) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-hint", id: `${id2}-hint`, children: t("retryBounds", { min, max, value: inherited ?? t("unknownDefault") }) }),
    invalid && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { id: `${id2}-invalid`, children: t("invalidNumber") })
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
  const [manualProvider, setManualProvider] = (0, import_react.useState)(!providerListed);
  const [manualModel, setManualModel] = (0, import_react.useState)(!modelListed);
  const updateModel = (provider, modelId) => {
    editRoute(path, provider, modelId);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-route-fields", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-provider`, children: t("routeProvider", { name }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { id: `${prefix}-provider`, disabled, value: manualProvider || !providerListed ? MANUAL : value.provider, onChange: (event) => {
        setManualProvider(event.currentTarget.value === MANUAL);
        setManualModel(true);
        updateModel(event.currentTarget.value === MANUAL ? "" : event.currentTarget.value, "");
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: MANUAL, children: providerListed ? t("manual") : t("manualValue", { value: value.provider || t("unset") }) }),
        providers.map((provider) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: provider.id, children: [
          provider.name,
          " (",
          provider.id,
          ")"
        ] }, provider.id))
      ] }),
      (manualProvider || !providerListed) && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives.Input, { "aria-label": t("manualProvider", { name }), className: "dsmm-input", value: value.provider, disabled, onChange: (event) => updateModel(event.currentTarget.value, value.model) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-model`, children: t("routeModel", { name }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { id: `${prefix}-model`, disabled, value: manualModel || !modelListed ? MANUAL : value.model, onChange: (event) => {
        setManualModel(event.currentTarget.value === MANUAL);
        updateModel(value.provider, event.currentTarget.value === MANUAL ? "" : event.currentTarget.value);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: MANUAL, children: modelListed ? t("manual") : t("manualValue", { value: value.model || t("unset") }) }),
        group?.models.map((candidate) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: candidate.id, children: [
          candidate.name,
          " (",
          candidate.id,
          ")"
        ] }, candidate.id))
      ] }),
      (manualModel || !modelListed) && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives.Input, { "aria-label": t("manualModel", { name }), className: "dsmm-input", value: value.model, disabled, onChange: (event) => updateModel(value.provider, event.currentTarget.value) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-effort`, children: t("routeEffort", { name }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { id: `${prefix}-effort`, disabled, value: value.reasoningEffort ?? "", onChange: (event) => edit([...path, "reasoningEffort"], event.currentTarget.value || void 0), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: t("effortDefault") }),
        value.reasoningEffort !== void 0 && !efforts.some((effort) => effort.id === value.reasoningEffort) && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: value.reasoningEffort, children: t("manualValue", { value: value.reasoningEffort }) }),
        efforts.map((effort) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: effort.id, children: [
          effort.name,
          " (",
          effort.id,
          ")"
        ] }, effort.id))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives.Input, { "aria-label": t("manualEffort", { name }), className: "dsmm-input", value: value.reasoningEffort ?? "", disabled, placeholder: t("effortDefault"), onChange: (event) => edit([...path, "reasoningEffort"], event.currentTarget.value || void 0) })
    ] })
  ] });
}
function PolicyFields({ value, inherited, path, name, disabled, actions, t }) {
  const prefix = (0, import_react.useId)();
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-policy-fields", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-strategy`, children: t("strategy", { name }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { id: `${prefix}-strategy`, disabled, value: value.strategy ?? "", onChange: (event) => actions.editPath([...path, "strategy"], event.currentTarget.value || void 0), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: t("inheritStrategy", { value: inherited?.strategy ?? t("unknownDefault") }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "startup-lock", children: t("startupLock") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "rate-limit-fallback", children: t("rateFallback") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-hint", children: t("strategyHint") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsmm-route-fields", children: Object.keys(DSMM_RATE_LIMIT_BOUNDS).map((field) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(RetryNumber, { id: `${prefix}-${field}`, t, name, field, value: value.rateLimit?.[field], inherited: inherited?.rateLimit[field], path: [...path, "rateLimit", field], disabled, actions }, field)) })
  ] });
}
function LevelFields({ level: level2, value, path, catalog, disabled, actions, t }) {
  const prefix = (0, import_react.useId)();
  const mode = value === void 0 ? "inherit" : value.provider === void 0 ? "effort" : "route";
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("fieldset", { "data-dsmm-level": level2, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("legend", { children: t("levelName", { level: level2 }) }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-mode`, children: t("levelMode", { level: level2 }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { id: `${prefix}-mode`, value: mode, disabled, onChange: (event) => actions.editPath(
        path,
        event.currentTarget.value === "inherit" ? void 0 : event.currentTarget.value === "effort" ? { reasoningEffort: "" } : { provider: "", model: "" }
      ), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "inherit", children: t("levelUnconfigured") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "effort", children: t("levelEffortOnly") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "route", children: t("levelFullRoute") })
      ] })
    ] }),
    mode === "effort" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-effort`, children: t("routeEffort", { name: level2 }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives.Input, { id: `${prefix}-effort`, className: "dsmm-input", value: value?.reasoningEffort ?? "", disabled, onChange: (event) => actions.editPath([...path, "reasoningEffort"], event.currentTarget.value) })
    ] }),
    value?.provider !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(RouteFields, { value, path, name: t("levelName", { level: level2 }), catalog, disabled, edit: actions.editPath, editRoute: actions.editRoute, t })
  ] });
}
function StructuredEditor({ state, actions, disabled, t }) {
  const prefix = (0, import_react.useId)();
  const [selectedRole, setSelectedRole] = (0, import_react.useState)("dsmm-orchestrator");
  const document2 = state.editor === null ? null : structuredDocument(state.editor.content);
  if (document2 === null) return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-hint", "data-dsmm-structured-invalid": true, children: t("rawInvalid") });
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
  const availability2 = roleAvailability(role2?.availability);
  const namedRoles = document2.settings.roles;
  const topology = document2.settings.subagents?.toolTopology;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-structured", "data-dsmm-structured": true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-label`, children: t("profileLabel") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives.Input, { id: `${prefix}-label`, className: "dsmm-input", value: document2.label ?? "", disabled, onChange: (event) => actions.editPath(["label"], event.currentTarget.value) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled: disabled || document2.label === void 0, onClick: () => actions.editPath(["label"], void 0), children: t("omitLabel") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-locale`, children: t("businessLocale") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { id: `${prefix}-locale`, value: String(document2.settings.locale ?? ""), disabled, "aria-describedby": `${prefix}-locale-hint`, onChange: (event) => actions.editPath(["settings", "locale"], event.currentTarget.value || void 0), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: t("inheritLocale") }),
        typeof document2.settings.locale === "string" && !DSMM_LOCALES.includes(document2.settings.locale) && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: document2.settings.locale, children: t("unsupportedLocale") }),
        DSMM_LOCALES.map((locale) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: locale, children: locale }, locale))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { id: `${prefix}-locale-hint`, className: "dsmm-hint", children: t("localeHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-topology`, children: t("toolTopology") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { id: `${prefix}-topology`, value: topology ?? "", disabled, "aria-describedby": `${prefix}-topology-hint`, onChange: (event) => actions.editPath(["settings", "subagents", "toolTopology"], event.currentTarget.value || void 0), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: t("inherit") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "per-role", children: "per-role" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "parameterized", children: "parameterized" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { id: `${prefix}-topology-hint`, className: "dsmm-hint", children: t("topologyHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-active`, children: t("defaultActive") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { id: `${prefix}-active`, disabled, value: document2.settings.defaultActive === void 0 ? "" : String(document2.settings.defaultActive), onChange: (event) => actions.editPath(["settings", "defaultActive"], event.currentTarget.value === "" ? void 0 : event.currentTarget.value === "true"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: t("inherit") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "true", children: t("enabled") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "false", children: t("disabled") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-hint", children: t("activeHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("fieldset", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("legend", { children: t("profileDefaults") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(PolicyFields, { t, value: document2.runtimePolicy, inherited: baseline, path: ["settings", "runtimePolicy"], name: t("profileDefaults"), disabled, actions })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-role`, children: t("roleSelect") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { id: `${prefix}-role`, disabled: disabled || roles.length === 0 || state.invalidFields.length > 0, value: role2?.id ?? "", onChange: (event) => setSelectedRole(event.currentTarget.value), children: [
        roles.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: t("rolesUnavailable") }),
        roles.map((candidate) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: candidate.id, children: [
          candidate.label,
          candidate.enabled ? "" : ` — ${t("roleDisabled")}`
        ] }, candidate.id))
      ] })
    ] }),
    role2 !== void 0 && policy !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("fieldset", { "data-dsmm-role": role2.id, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("legend", { children: role2.label }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(RoleAvailability, { value: role2.availability, t }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-role-enabled`, children: t("namedRole", { name: role2.label }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { id: `${prefix}-role-enabled`, value: namedRoles?.[role2.id] === void 0 ? "" : String(namedRoles[role2.id]), disabled, "aria-describedby": `${prefix}-role-hint`, onChange: (event) => actions.editPath(["settings", "roles", role2.id], event.currentTarget.value === "" ? void 0 : event.currentTarget.value === "true"), children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: t("inherit") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "true", disabled: availability2 === void 0 || !availability2.startupAvailable || !availability2.deploymentEnabled || availability2.reason === "module-off", children: t("enabled") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "false", disabled: availability2 === void 0 || availability2.required, children: t("disabled") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { id: `${prefix}-role-hint`, className: "dsmm-hint", children: t("namedRoleHint") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(PolicyFields, { t, value: policy, inherited, path: rolePath, name: role2.label, disabled, actions }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-primary-mode`, children: t("primaryMode", { name: role2.label }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { id: `${prefix}-primary-mode`, disabled, value: policy.primary === void 0 ? "inherit" : "explicit", onChange: (event) => actions.editPath([...rolePath, "primary"], event.currentTarget.value === "inherit" ? void 0 : { provider: "", model: "" }), children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "inherit", children: t("inheritRoute") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "explicit", children: t("configuredRoute") })
        ] })
      ] }),
      policy.primary !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(RouteFields, { t, value: policy.primary, path: [...rolePath, "primary"], name: t("primaryName", { name: role2.label }), catalog: state.catalog, disabled, edit: actions.editPath, editRoute: actions.editRoute }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-hint", children: t("effortChangeHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-hint", children: t("normalLevel") }),
      role2.id === "dsmm-orchestrator" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-hint", children: t("orchestratorLevels") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-hint", children: t("levelsHint") }),
        ["low", "high", "max"].map((level2) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(LevelFields, { level: level2, value: policy.levels?.[level2], path: [...rolePath, "levels", level2], catalog: state.catalog, disabled, actions, t }, level2))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: `${prefix}-fallback-mode`, children: t("fallbackMode", { name: role2.label }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { id: `${prefix}-fallback-mode`, disabled, value: policy.fallbackRoutes === void 0 ? "inherit" : "explicit", onChange: (event) => actions.editPath([...rolePath, "fallbackRoutes"], event.currentTarget.value === "inherit" ? void 0 : []), children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "inherit", children: t("inheritChain") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "explicit", children: t("configuredChain") })
        ] })
      ] }),
      policy.fallbackRoutes?.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsmm-hint", children: t("emptyChain") }),
      policy.fallbackRoutes?.map((candidate, index) => {
        const name = t("fallbackName", { name: role2.label, index: index + 1 });
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("fieldset", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("legend", { children: name }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(RouteFields, { t, value: candidate, path: [...rolePath, "fallbackRoutes", index], name, catalog: state.catalog, disabled, edit: actions.editPath, editRoute: actions.editRoute }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsmm-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled: disabled || index === 0, onClick: () => actions.moveFallback(role2.id, index, index - 1), children: t("moveUp", { name }) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled: disabled || index === policy.fallbackRoutes.length - 1, onClick: () => actions.moveFallback(role2.id, index, index + 1), children: t("moveDown", { name }) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled, onClick: () => actions.editPath([...rolePath, "fallbackRoutes", index], void 0), children: t("removeFallback", { name }) })
          ] })
        ] }, index);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", disabled: disabled || (policy.fallbackRoutes?.length ?? 0) >= 32, onClick: () => {
        if (policy.fallbackRoutes === void 0) actions.editPath([...rolePath, "fallbackRoutes"], [{ provider: "", model: "" }]);
        else actions.editPath([...rolePath, "fallbackRoutes", policy.fallbackRoutes.length], { provider: "", model: "" });
      }, children: t("addFallback", { name: role2.label }) })
    ] }, role2.id)
  ] });
}

// src/client/SessionProfiles.tsx
var import_react2 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/session-labels.ts
function sessionProfileLabels(session, t) {
  const admitted = session.admittedSelection;
  const profile = admitted === void 0 ? t("sessionGlobalCaptured") : admitted.selectedId === null ? t("sessionBaseline") : t("sessionAdmittedProfile", { id: admitted.selectedId, revision: admitted.appliedRevision ?? "—" });
  const future = session.globalDefault;
  return {
    admitted: t("sessionState", { id: session.sessionId, profile, scope: session.scope, epoch: session.admissionEpoch }),
    futureDefault: t("sessionFutureDefault", { profile: future.selectedId === null ? t("sessionBaseline") : t("sessionAdmittedProfile", { id: future.selectedId, revision: future.appliedRevision ?? "—" }) })
  };
}

// src/client/SessionProfiles.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var MENU_ISSUE_CODES = /* @__PURE__ */ new Set(["validation", "conflict", "not-found", "lock-timeout", "unsafe-path", "io", "activation", "corrupt-selection", "limit", "busy", "maintenance", "disposed", "not-owned", "unavailable", "cancelled", "model-unconfigured", "model-choice-changed", "model-service-unavailable", "model-observation-unavailable", "model-selection-failed"]);
function menuIssue(issue) {
  const code = MENU_ISSUE_CODES.has(issue.code) ? issue.code : issue.kind === "transport" ? "transport" : "unavailable";
  const field = issue.field;
  return { code, ...isSafeDiagnosticField(field) ? { field } : {} };
}
function SessionScope({ state, actions, t, compact = false }) {
  const prefix = (0, import_react2.useId)();
  const session = state.session;
  const labels = session === null ? null : sessionProfileLabels(session, t);
  const selected = state.snapshot?.profiles.find((profile) => profile.id === state.sessionChoice);
  const disabled = state.busy !== null || state.pendingEditor !== null || state.sessionBusy !== null || state.dirty;
  const current = () => actions.readProfileView().currentSessionId === state.currentSessionId;
  const allowed = session !== null && session.switchAllowed && /^[a-f0-9]{64}$|^absent$/u.test(session.selection.selectionRevision);
  const status = state.sessionNotice === null ? "" : t(state.sessionNotice === "mode-on" ? "headerModeOn" : state.sessionNotice === "mode-off" ? "headerModeOff" : state.sessionNotice === "applied-with-model" ? "sessionAppliedWithModel" : state.sessionNotice === "applied" ? "sessionApplied" : "sessionResetDone");
  let binding = session?.subagentRuntime;
  try {
    if (binding !== void 0) binding = parseSubagentRuntimeAdmissionView(binding);
  } catch {
    binding = void 0;
  }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-session-scope", "aria-busy": state.sessionBusy !== null, "data-dsmm-session-scope": true, children: [
    !compact && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: t("sessionScope") }),
    state.currentSessionId === null ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", children: t("noSession") }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
      labels !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { "data-dsmm-session-state": true, children: labels.admitted }),
      labels !== null && !compact && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", "data-dsmm-session-future-default": true, children: labels.futureDefault }),
      session === null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", children: t("sessionUnavailable") }),
      session?.warnings?.length ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: t("admissionWarnings") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ProfileWarnings, { warnings: session.warnings, t })
      ] }) : null,
      session !== null && !session.switchAllowed && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", children: t("sessionBusy", { reason: session.switchUnavailableReason ?? "unavailable" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: `${prefix}-choice`, children: t("sessionSelect") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { id: `${prefix}-choice`, value: state.sessionChoice ?? "", disabled: disabled || !allowed, onChange: (event) => {
          if (current()) actions.chooseSessionProfile(event.currentTarget.value || null);
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "", children: t("sessionBaseline") }),
          state.sessionChoice !== null && selected === void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: state.sessionChoice, children: state.sessionChoice }),
          state.snapshot?.profiles.map((profile) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("option", { value: profile.id, disabled: profile.revision === null || profile.error !== void 0, children: [
            profile.label?.trim() ? `${profile.label} (${profile.id})` : profile.id,
            profileWarnings(profile.warnings).length ? ` — ${t("warningProfile")}` : ""
          ] }, profile.id))
        ] })
      ] }),
      !compact && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", children: t("sessionModelHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives2.Button, { type: "button", variant: "outline", disabled: disabled || !allowed || session?.profileModel === void 0, onClick: () => {
          if (current()) void actions.useSessionProfileModel();
        }, children: t("headerUseCurrentModel") }),
        session !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-availability", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: binding === void 0 ? t("bindingUnknown") : t("bindingState", { binding: binding.binding, ready: t(binding.deliveryFenceReady ? "enabled" : "disabled"), restart: t(binding.restartRequired ? "enabled" : "disabled") }) }),
          binding?.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: t("bindingReason", { reason: binding.reason }) })
        ] }),
        session?.roles !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("details", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("summary", { children: t("admittedRoles") }),
          session.roles.map((role2) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-availability", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: role2.id }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RoleAvailability, { value: role2, t })
          ] }, role2.id))
        ] })
      ] }),
      state.dirty && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-hint", children: t("sessionDirty") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives2.Button, { type: "button", variant: "outline", disabled: disabled || !allowed || state.sessionChoice !== null && selected?.revision == null, onClick: () => {
          if (current()) void actions.applySession();
        }, children: t(state.sessionBusy === "apply" ? "sessionApplying" : "sessionApply") }),
        !compact && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives2.Button, { type: "button", variant: "outline", disabled: disabled || !allowed, onClick: () => {
          if (current()) void actions.resetSession();
        }, children: t(state.sessionBusy === "reset" ? "sessionResetting" : "sessionReset") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives2.Button, { type: "button", variant: "outline", disabled: state.sessionBusy !== null || state.busy !== null || state.pendingEditor !== null, onClick: () => {
          if (current()) void actions.refreshSession();
        }, children: t("sessionRefresh") })
      ] }),
      !compact && session?.rolePolicy !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { "data-dsmm-session-policy": true, children: t("roleState", { route: session.rolePolicy.route === void 0 ? t("inheritRoute") : `${session.rolePolicy.route.provider}/${session.rolePolicy.route.model}${session.rolePolicy.route.reasoningEffort === void 0 ? "" : ` (${session.rolePolicy.route.reasoningEffort})`}`, strategy: session.rolePolicy.strategy, retries: session.rolePolicy.retries, failures: session.rolePolicy.rateLimitFailures, switches: session.rolePolicy.switches, delay: session.rolePolicy.totalDelayMs }) })
    ] }),
    state.sessionIssue !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "alert", children: state.sessionIssue.source === "profile-model" ? t(state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed") : state.sessionIssue.code === "conflict" ? t("sessionConflict") : ["busy", "maintenance", "disposed", "not-owned"].includes(state.sessionIssue.code) ? t("sessionBusy", { reason: state.sessionIssue.code }) : t(state.sessionIssue.code === "validation" ? "validation" : "sessionUnavailable") }),
    state.sessionIssue !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(IssueDetails, { issue: state.sessionIssue, t }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", "aria-atomic": "true", children: state.sessionBusy === "read" ? t("reading") : status })
  ] });
}
function SessionProfiles(props) {
  const prefix = (0, import_react2.useId)();
  const state = props.useProfiles((snapshot3) => snapshot3);
  const id2 = state.currentSessionId;
  const [openFor, setOpenFor] = (0, import_react2.useState)(void 0);
  (0, import_react2.useEffect)(() => {
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
  const disabled = id2 === null || committing || state.busy !== null || state.pendingEditor !== null || state.dirty || state.invalidFields.length > 0 || session === null || !session.switchAllowed || state.snapshot === null;
  let feedback = "";
  if (state.sessionIssue !== null) feedback = t(state.sessionIssue.source === "profile-model" ? state.sessionIssue.code === "model-unconfigured" ? "headerNoProfileModel" : state.sessionIssue.code === "model-choice-changed" ? "headerModelChoiceChanged" : "headerModelUnconfirmed" : state.sessionIssue.code === "conflict" ? "headerConflict" : state.sessionIssue.code === "activation" ? "headerActivationRefused" : state.sessionIssue.code === "maintenance" ? "headerMaintenanceRefused" : state.sessionIssue.code === "busy" ? "headerBusyRefused" : state.sessionIssue.code === "cancelled" ? "headerCancelledRefused" : state.sessionIssue.code === "unavailable" || state.sessionIssue.kind === "assembly" ? "headerUnavailableRefused" : "headerSelectionRefused");
  else if (committing || state.busy !== null) feedback = t(state.sessionBusy === "apply" || state.sessionBusy === "reset" ? "headerApplying" : "headerLoading");
  else if (state.dirty || state.invalidFields.length > 0 || state.pendingEditor !== null) feedback = t("headerDraft");
  else if (id2 === null) feedback = t("headerNoSession");
  else if (session === null || state.snapshot === null) feedback = t("headerUnavailable");
  else if (!session.switchAllowed) feedback = t("headerBusy");
  else if (state.sessionNotice !== null) feedback = t(state.sessionNotice === "mode-on" ? "headerModeOn" : state.sessionNotice === "mode-off" ? "headerModeOff" : state.sessionNotice === "applied-with-model" ? "headerAppliedWithModel" : "headerApplied");
  const profileName = unknownCaptured ? t("headerCaptured") : currentSaved?.revision === admission?.appliedRevision && currentSaved?.label?.trim() ? `${currentSaved.label} (${currentSaved.id})` : admission?.selectedId ?? t("sessionBaseline");
  const currentLabel = t("headerCurrentProfile", { profile: session === null ? t("headerUnavailable") : profileName });
  const entries = [{ type: "label", id: "@current", text: currentLabel }];
  for (const warning of profileWarnings(session?.warnings)) entries.push({ type: "label", id: `@warning:${warning.code}`, text: t("warningMarker", { code: warning.code, field: warning.field }) });
  if (id2 === null && state.snapshot !== null) entries.push({ type: "label", id: "@future", text: t("sessionFutureDefault", { profile: state.snapshot.profiles.find((profile) => profile.id === state.snapshot.selectedId)?.label?.trim() || state.snapshot.selectedId || t("sessionBaseline") }) });
  if (feedback !== "" && (state.sessionNotice === null || state.sessionIssue !== null)) entries.push({ type: "label", id: "@status", text: feedback });
  const mode = session?.deepwork;
  entries.push({
    id: "@mode",
    label: t(mode === void 0 ? "headerModeUnavailable" : mode.locked ? "headerModePreset" : mode.active ? "headerModeDisable" : "headerModeEnable"),
    disabled: id2 === null || committing || state.busy !== null || session === null || !session.switchAllowed || mode === void 0 || mode.locked
  });
  const diagnostic2 = state.sessionIssue === null ? null : menuIssue(state.sessionIssue);
  const diagnosticText = diagnostic2 === null ? "" : t("headerIssueCode", { code: diagnostic2.code }) + (diagnostic2.field === void 0 ? "" : ` ${t("headerIssueField", { field: diagnostic2.field })}`);
  const retryHint = t(diagnostic2?.code === "maintenance" || diagnostic2?.code === "busy" ? "headerWaitRetryHint" : "headerRetryHint");
  if (diagnostic2 !== null) entries.push({ type: "label", id: "@diagnostic", text: diagnosticText }, { type: "label", id: "@retry", text: retryHint });
  if (admission?.selectedId != null && currentSaved === void 0) entries.push({ id: admission.selectedId, label: `${admission.selectedId} — ${t("headerSavedUnavailable")}`, disabled: true });
  if (unknownCaptured) entries.push({ id: "__dsmm_captured_default__", label: t("headerCaptured"), disabled: true });
  entries.push({ type: "separator", id: "@keep-separator" }, { type: "label", id: "@keep-heading", text: t("headerCompactProfiles") }, { id: "", label: t("sessionBaseline"), disabled });
  for (const profile of profiles) entries.push({ id: profile.id, label: (profile.label?.trim() ? profile.label : profile.id) + (profile.error === void 0 && profile.revision !== null ? "" : ` — ${t("headerSavedUnavailable")}`) + (profileWarnings(profile.warnings).length ? ` — ${t("warningProfile")}` : ""), disabled: disabled || profile.revision === null || profile.error !== void 0 });
  entries.push({ type: "separator", id: "@model-separator" }, { id: "@use-model", label: t("headerUseCurrentModel"), disabled: disabled || session?.profileModel === void 0 });
  const open = openFor === id2;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsmm-header-profiles", "data-dsmm-header-profile": true, "aria-busy": committing, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
        anchor: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives2.Button, { type: "button", size: "sm", variant: "toolbar", className: "dsmm-profile-trigger", icon: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives2.IconBranchOutlineRegular, {}), "aria-label": t("headerProfileLabel"), "aria-haspopup": "menu", "aria-expanded": open, "aria-describedby": `${prefix}-feedback`, onClick: () => setOpenFor(open ? void 0 : id2) }),
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
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsmm-profile-announcement", id: `${prefix}-feedback`, role: state.sessionIssue === null ? "status" : "alert", "aria-live": "polite", "aria-atomic": "true", children: [
      feedback || currentLabel,
      diagnostic2 === null ? "" : ` ${diagnosticText} ${retryHint}`
    ] })
  ] });
}

// src/client/ProfilesSection.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function issueKey(issue) {
  if (issue.source === "selection") return issue.code === "conflict" ? "selectionConflict" : "appliedInvalid";
  if (issue.kind === "assembly") return "unavailable";
  if (issue.kind === "transport") return "transport";
  return issue.code === "conflict" || issue.code === "validation" ? issue.code : "io";
}
function ProfilesSection(props) {
  const { t } = props;
  const state = props.useProfiles((snapshot4) => snapshot4);
  const prefix = (0, import_react3.useId)();
  const selectRef = (0, import_react3.useRef)(null);
  const inputRef = (0, import_react3.useRef)(null);
  const editorRef = (0, import_react3.useRef)(null);
  const advancedRef = (0, import_react3.useRef)(null);
  const handledValidation = (0, import_react3.useRef)(0);
  const cancelRef = (0, import_react3.useRef)(null);
  const hadConfirmation = (0, import_react3.useRef)(false);
  const disabled = state.busy !== null || state.pendingEditor !== null || state.sessionBusy === "apply" || state.sessionBusy === "reset";
  const snapshot3 = state.snapshot;
  const editor = state.editor;
  const readOnly = snapshot3?.readOnly === true;
  const editorDisabled = disabled || readOnly;
  const reconcilable = canReconcileSelection(snapshot3);
  const selectionConflict = reconcilable && snapshot3?.selectionError?.code === "conflict";
  const invalid = state.issue?.kind === "domain" && state.issue.code === "validation";
  const idInvalid = invalid && state.issue?.field === "id" && state.issue.location === void 0 && editor?.revision === null && !editorDisabled;
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
  const applied = editor?.revision != null && editor.id === snapshot3?.selectedId && editor.revision === snapshot3?.appliedRevision;
  let selection = t(snapshot3 === null ? "unavailable" : "baseline");
  if (snapshot3?.selectionError !== void 0 && !selectionConflict) selection = t("appliedInvalid");
  else if (snapshot3?.selectedId !== null && snapshot3?.selectedId !== void 0) selection = t("appliedProfile", { id: snapshot3.selectedId, revision: snapshot3.appliedRevision ?? "—" });
  const notice = state.notice === null ? "" : t(state.notice.key === "reset" ? "resetDone" : state.notice.key, { id: state.notice.id });
  const warnings2 = editor === null ? [] : draftWarnings(editor.content);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "dsmm-profiles", "aria-labelledby": `${prefix}-title`, "aria-busy": state.busy !== null, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h2", { id: `${prefix}-title`, children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("description") }),
    snapshot3?.origin !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t(snapshot3.origin === "legacy" ? "legacyOrigin" : snapshot3.origin === "central" ? "centralOrigin" : "explicitOrigin") }),
    readOnly && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "status", className: "dsmm-hint", children: t("readOnlyOrigin") }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "dsmm-zone", "aria-labelledby": `${prefix}-browse`, "data-dsmm-zone": "browse", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { id: `${prefix}-browse`, children: t("browseZone") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled: editorDisabled || snapshot3 === null, onClick: () => {
          void props.create();
        }, children: t("new") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled, onClick: () => {
          void props.refresh();
        }, children: t(state.busy === "refresh" ? "refreshing" : "refresh") })
      ] }),
      snapshot3 !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("label", { htmlFor: `${prefix}-select`, children: t("editorSelect") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("select", { ref: selectRef, id: `${prefix}-select`, disabled, value: editor?.revision == null ? "" : editor.id, onChange: (event) => {
          if (event.currentTarget.value) void props.open(event.currentTarget.value);
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: t(editor?.revision === null ? "newDraft" : "choose") }),
          snapshot3.profiles.map((profile, index) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("option", { value: profile.id, children: [
            profile.label?.trim() ? `${profile.label} (${profile.id})` : profile.id,
            profile.error === void 0 ? "" : ` — ${t("invalidProfile", { id: profile.id })}`,
            profile.warnings?.length ? ` — ${t("warningProfile")}` : ""
          ] }, `${index}:${profile.id}`))
        ] }),
        snapshot3.profiles.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("empty") })
      ] }),
      snapshot3 !== null && snapshot3.profiles.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "dsmm-profile-list", "aria-label": t("savedInventory"), children: snapshot3.profiles.map((profile, index) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: profile.label?.trim() ? `${profile.label} (${profile.id})` : profile.id }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("savedRevision", { revision: profile.revision ?? "—" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ProfileWarnings, { warnings: profile.warnings, t }),
        profile.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(IssueDetails, { issue: profile.error, t })
      ] }, `${index}:${profile.id}`)) }),
      state.pendingEditor !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-confirm", role: "group", "aria-labelledby": `${prefix}-confirm`, onKeyDown: (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          props.cancelDiscard();
        }
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { id: `${prefix}-confirm`, children: t("discardPrompt") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", onClick: () => {
            void props.discardAndOpen();
          }, children: t("discard") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { ref: cancelRef, type: "button", variant: "primary", onClick: props.cancelDiscard, children: t("cancel") })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "dsmm-zone", "aria-labelledby": `${prefix}-edit`, "data-dsmm-zone": "edit", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { id: `${prefix}-edit`, children: t("editZone") }),
      editor === null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("noEditor") }),
      editor !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-editor", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { "data-dsmm-editor-state": true, children: t(state.dirty ? "dirty" : applied ? "savedApplied" : "savedNotApplied") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("savedRevision", { revision: editor.revision ?? "—" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "primary", disabled: editorDisabled || !state.dirty || snapshot3 === null || state.invalidFields.length > 0, onClick: () => {
            void props.save();
          }, children: t(state.busy === "save" ? "saving" : "save") }),
          editor.revision !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled, onClick: () => {
            void props.reload();
          }, children: t("reload") })
        ] }),
        warnings2.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("draftWarnings") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ProfileWarnings, { warnings: warnings2, t })
        ] }),
        editor.warnings?.length ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("savedWarnings") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ProfileWarnings, { warnings: editor.warnings, t })
        ] }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("label", { htmlFor: `${prefix}-id`, children: t("profileId") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Input, { ref: inputRef, id: `${prefix}-id`, className: "dsmm-input", value: editor.id, disabled: editorDisabled || editor.revision !== null, "aria-invalid": idInvalid || void 0, "aria-describedby": `${prefix}-id-hint${idInvalid ? ` ${prefix}-issue` : ""}`, onChange: (event) => props.editId(event.currentTarget.value) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { id: `${prefix}-id-hint`, className: "dsmm-hint", children: t("idHint") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-catalog", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { children: t("catalogTitle") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("catalogHint") }),
          state.catalogUnavailable && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("catalogUnavailable") }),
          state.catalog?.failures.map((failure) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("catalogFailure", { name: failure.name, id: failure.id }) }, failure.id)),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled: state.catalogBusy, onClick: () => {
            void props.refreshCatalog();
          }, children: t(state.catalogBusy ? "catalogRefreshing" : "catalogRefresh") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(StructuredEditor, { state, actions: props, disabled: editorDisabled, t }, state.editorEpoch),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { ref: advancedRef, className: "dsmm-advanced", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("summary", { children: t("advanced") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("label", { htmlFor: `${prefix}-content`, children: t("configuration") }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("textarea", { ref: editorRef, id: `${prefix}-content`, rows: 12, spellCheck: false, value: editor.content, readOnly, disabled, "aria-invalid": rawInvalid || invalid && !idInvalid || void 0, "aria-describedby": `${prefix}-content-hint ${prefix}-structural-hint${invalid && !idInvalid ? ` ${prefix}-issue` : ""}`, onChange: (event) => props.editContent(event.currentTarget.value) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { id: `${prefix}-content-hint`, className: "dsmm-hint", children: t("configurationHint") }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { id: `${prefix}-structural-hint`, className: "dsmm-hint", children: t("structuralHint") })
          ] })
        ] }, state.editorEpoch)
      ] }),
      state.issue !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-issue", id: `${prefix}-issue`, role: "alert", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t(issueKey(state.issue)) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(IssueDetails, { issue: state.issue, t })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "dsmm-zone", "aria-labelledby": `${prefix}-global`, "data-dsmm-zone": "future-default", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { id: `${prefix}-global`, children: t("globalScope") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("newSessions") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { "data-dsmm-selection": true, children: selection }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("futurePin", { revision: snapshot3?.selectionRevision ?? "—" }) }),
      snapshot3?.selectedWarnings?.length ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("futureWarnings") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ProfileWarnings, { warnings: snapshot3.selectedWarnings, t })
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-hint", children: t("savedOnlyHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { id: `${prefix}-global-action`, className: "dsmm-hint", children: t("globalActionHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "primary", "aria-describedby": `${prefix}-global-action`, disabled: editorDisabled || state.dirty || editor?.revision == null || !reconcilable || applied && !selectionConflict, onClick: () => {
          void props.apply();
        }, children: t(state.busy === "apply" ? "applying" : "apply") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "button", variant: "outline", disabled: editorDisabled || !reconcilable || snapshot3?.selectedId === null && !selectionConflict, onClick: () => {
          void props.reset();
        }, children: t(state.busy === "reset" ? "resetting" : "reset") })
      ] }),
      snapshot3?.selectionError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsmm-issue", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t(selectionConflict ? "selectionConflict" : "retry") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(IssueDetails, { issue: snapshot3.selectionError, t })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("section", { className: "dsmm-zone", "aria-label": t("sessionScope"), "data-dsmm-zone": "current-session", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(SessionScope, { state, actions: props, t }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", "aria-atomic": "true", children: state.busy === "refresh" && snapshot3 === null ? t("loading") : state.busy === "read" ? t("reading") : notice })
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
.dsmm-profiles .dsmm-zone{min-width:0;display:flex;flex-direction:column;gap:12px;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l4)}
.dsmm-profiles .dsmm-profile-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:12px;min-width:0}
.dsmm-profiles .dsmm-profile-list li{min-width:0;display:flex;flex-direction:column;gap:4px}
.dsmm-profiles :is(.dsmm-warning,.dsmm-diagnostic,.dsmm-availability){min-width:0;display:flex;flex-direction:column;gap:4px;overflow-wrap:anywhere}
.dsmm-profiles .dsmm-warning{border-left:4px solid var(--dsw-alias-state-warn-primary);padding:8px 12px;color:var(--dsw-alias-label-primary)}
.dsmm-deployment{gap:8px}
.dsmm-deployment .dsmm-deployment-card{min-width:0;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md)}
.dsmm-deployment .dsmm-deployment-card>summary{padding:8px 12px;font-weight:500;line-height:22px;min-height:32px;box-sizing:border-box}
.dsmm-deployment .dsmm-deployment-card>summary:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsmm-deployment .dsmm-deployment-card>summary:active{background:var(--dsw-alias-interactive-bg-active)}
.dsmm-deployment .dsmm-deployment-card>summary>span{margin-left:8px;font-weight:400}
.dsmm-deployment .dsmm-deployment-card>summary>span:empty{display:none}
.dsmm-deployment .dsmm-deployment-card>div,.dsmm-deployment .dsmm-deployment-card>fieldset{display:flex;flex-direction:column;gap:8px;padding:0 12px 12px;border:0}
.dsmm-deployment .dsmm-deployment-card>fieldset>legend{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
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
function parseAdvanced(text3) {
  if (text3.trim() === "") return void 0;
  const errors = [];
  const root = parseTree2(text3, errors, { disallowComments: true, allowTrailingComma: false });
  const unique = (node) => {
    if (node.type === "object") {
      const keys = node.children.map((child2) => child2.children[0].value);
      if (new Set(keys).size !== keys.length) return false;
    }
    return (node.children ?? []).every(unique);
  };
  if (root === void 0 || errors.length || !unique(root)) throw new Error("Invalid JSON");
  return JSON.parse(text3);
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
function layerDiff(base, draft, prefix = []) {
  return [.../* @__PURE__ */ new Set([...Object.keys(base), ...Object.keys(draft)])].flatMap((key) => {
    const path = [...prefix, key], before = base[key], after = draft[key];
    if (equal(before, after)) return [];
    if (!Object.hasOwn(draft, key)) return [{ op: "unset", path }];
    if (record2(before) && record2(after)) return layerDiff(before, after, path);
    return [{ op: "set", path, value: after }];
  });
}
function validateEditorValue(value, schema, sparse = false) {
  if (schema.type === "union") return schema.alternatives?.some((node) => validateEditorValue(value, node, sparse)) === true;
  if (schema.type === "const") return value === schema.value;
  if (schema.type === "object" || schema.type === "dict") return record2(value) && (sparse || schema.type !== "object" || Object.entries(schema.fields ?? {}).every(([key, node]) => !node.required || Object.hasOwn(value, key))) && Object.entries(value).every(([key, child2]) => {
    if (["__proto__", "prototype", "constructor"].includes(key)) return false;
    if (schema.keys !== void 0 && !schema.keys.includes(key)) return false;
    const node = schema.type === "dict" ? schema.inner : schema.fields?.[key];
    return node !== void 0 && validateEditorValue(child2, node, sparse);
  });
  if (schema.type === "array") return Array.isArray(value) && (schema.max === void 0 || value.length <= schema.max) && schema.inner !== void 0 && value.every((child2) => validateEditorValue(child2, schema.inner));
  if (schema.type === "string" && schema.nonempty) return typeof value === "string" && value.trim() !== "";
  if (["string", "boolean", "number"].includes(schema.type)) return typeof value === schema.type && (typeof value !== "number" || Number.isFinite(value) && (schema.min === void 0 || value >= schema.min) && (schema.max === void 0 || value <= schema.max) && (schema.step === void 0 || Number.isInteger(value / schema.step)));
  return false;
}
function enumValues(schema) {
  return schema.type === "union" && schema.alternatives?.every((node) => node.type === "const") ? schema.alternatives.map((node) => node.value) : null;
}
function inspectorPaths(snapshot3, admitted) {
  const paths = /* @__PURE__ */ new Set([
    ...Object.keys(snapshot3.sources),
    ...Object.keys(snapshot3.startupSources ?? {}),
    ...Object.keys(snapshot3.nextRoot?.sources ?? {}),
    ...Object.keys(snapshot3.nextRoot?.captures ?? {}),
    ...Object.keys(admitted?.sources ?? {}),
    ...Object.keys(admitted?.captures ?? {})
  ]);
  const visit2 = (value, path) => {
    if (record2(value) && Object.keys(value).length && path.join(".") !== "lsp.env") for (const [key, child2] of Object.entries(value)) visit2(child2, [...path, key]);
    else if (path.length) paths.add(path.join("."));
  };
  for (const value of [snapshot3.desired, snapshot3.startup, snapshot3.nextRoot?.settings, admitted?.settings]) if (value !== void 0) visit2(value, []);
  return [...paths].sort();
}

// src/client/deployment-controller.ts
var Refusal = class extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
};
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
  state = { snapshot: null, draft: {}, dirty: false, busy: false, issue: null, saved: false, session: null };
  listeners = /* @__PURE__ */ new Set();
  generation = 0;
  disposed = false;
  baseline = {};
  form = null;
  invalid = /* @__PURE__ */ new Set();
  connection = null;
  connectionBaseline;
  stopConnection = null;
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
    this.stopConnection = source.subscribe(() => {
      if (this.disposed) return;
      this.generation++;
      this.publish({ busy: false, issue: source.getSnapshot() === void 0 ? "transport" : "conflict", saved: false });
    });
  }
  forProfile(namespace) {
    const controller = new _DeploymentController(this.remote, "profile", namespace);
    if (this.connection !== null) controller.bindConnection(this.connection);
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
  setInvalid(path, invalid) {
    if (this.invalid.has(path) === invalid) return;
    if (invalid) this.invalid.add(path);
    else this.invalid.delete(path);
    this.publish({ dirty: this.invalid.size > 0 || !equal(this.baseline, this.state.draft), saved: false });
  }
  canWriteProfile(snapshot3 = this.state.snapshot) {
    const native = this.form?.state;
    return this.currentConnection() && snapshot3 !== null && this.rowNamespace !== null && this.rowNamespace === snapshot3.namespace && native?.status === "ready" && native.mode === "host" && native.writable && native.revision === snapshot3.nativeFormRevision && snapshot3.nativeForm !== null && equal(native.base ?? null, snapshot3.nativeForm.base) && equal(native.user ?? null, snapshot3.nativeForm.user);
  }
  edit(path, value) {
    if (this.state.busy || this.disposed || this.state.snapshot === null || !this.currentConnection() || this.state.issue === "not-owned" || this.layer === "profile" && !this.canWriteProfile()) return;
    const draft = editLayer(this.state.draft, path, value);
    this.publish({ draft, dirty: this.invalid.size > 0 || !equal(this.baseline, draft), issue: null, saved: false });
  }
  async refresh(discard = false) {
    if (this.disposed || this.state.busy) return;
    const generation = ++this.generation;
    const connection = this.connection?.getSnapshot();
    this.publish({ busy: true, saved: false });
    try {
      if (this.connection !== null && connection === void 0) throw new Refusal("transport");
      const snapshot3 = await unwrap(this.remote.describeSettings());
      if (this.disposed || generation !== this.generation) return;
      const old = this.state.snapshot;
      if (old !== null && (old.entryId !== snapshot3.entryId || old.hostProfileKey !== snapshot3.hostProfileKey)) throw new Refusal("unavailable");
      if (this.state.dirty && !discard) {
        const stale = !this.currentConnection() || (this.layer === "global" ? old?.globalRevision !== snapshot3.globalRevision : old?.nativeRevision !== snapshot3.nativeRevision || old?.globalRevision !== snapshot3.globalRevision);
        this.publish({ issue: stale ? "conflict" : null });
      } else {
        this.invalid.clear();
        this.connectionBaseline = connection;
        this.baseline = this.layer === "global" ? snapshot3.global : record2(snapshot3.nativeForm?.user) ? snapshot3.nativeForm.user : {};
        this.publish({ snapshot: snapshot3, draft: structuredClone(this.baseline), dirty: false, issue: null });
      }
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.publish({ issue: error instanceof Refusal ? error.code : "transport" });
    } finally {
      if (!this.disposed && generation === this.generation) this.publish({ busy: false });
    }
  }
  async save() {
    const { snapshot: snapshot3, draft, dirty, busy, issue } = this.state;
    if (this.disposed || snapshot3 === null || !dirty || busy || issue !== null || !this.currentConnection() || this.invalid.size > 0 || this.layer === "profile" && !this.canWriteProfile()) return;
    const schema = this.layer === "global" ? snapshot3.schema : { ...snapshot3.schema, fields: Object.fromEntries(Object.entries(snapshot3.schema.fields ?? {}).filter(([key]) => key !== "modules")) };
    const editable = { ...draft };
    if (this.layer === "profile") {
      if (!equal(editable.sessionPersistence, this.baseline.sessionPersistence)) {
        this.publish({ issue: "validation" });
        return;
      }
      delete editable.sessionPersistence;
    }
    const lower = this.layer === "global" ? snapshot3.defaults : mergeLayer(mergeLayer(snapshot3.defaults, snapshot3.global), snapshot3.nativeForm?.base ?? {});
    const candidate = mergeLayer(lower, editable);
    const merged = this.layer === "global" ? mergeLayer(candidate, snapshot3.profile) : candidate;
    delete merged.sessionPersistence;
    if (!validateEditorValue(editable, schema, true) || !validateEditorValue(merged, snapshot3.schema)) {
      this.publish({ issue: "validation" });
      return;
    }
    const edits = layerDiff(this.baseline, draft);
    if (edits.length > 128) {
      this.publish({ issue: "validation" });
      return;
    }
    const generation = ++this.generation;
    this.publish({ busy: true, saved: false });
    try {
      const current = await unwrap(this.remote.describeSettings());
      if (this.disposed || generation !== this.generation) return;
      if (current.entryId !== snapshot3.entryId || current.hostProfileKey !== snapshot3.hostProfileKey || current.globalRevision !== snapshot3.globalRevision) throw new Refusal("conflict");
      if (this.layer === "global") await unwrap(this.remote.save({ expectedRevision: snapshot3.globalRevision, edits }));
      else {
        if (current.nativeRevision !== snapshot3.nativeRevision || !this.canWriteProfile(current)) throw new Refusal("conflict");
        const form = this.form;
        if (!await form.mutate(edits, snapshot3.nativeFormRevision)) throw new Refusal("conflict");
      }
      if (this.disposed || generation !== this.generation) return;
      this.baseline = structuredClone(draft);
      this.publish({ dirty: false, saved: true, issue: null });
      try {
        const next = await unwrap(this.remote.describeSettings());
        if (!this.disposed && generation === this.generation) this.publish({ snapshot: next });
      } catch {
        if (!this.disposed && generation === this.generation) this.publish({ issue: "unavailable" });
      }
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.publish({ issue: error instanceof Refusal ? error.code : "transport" });
    } finally {
      if (!this.disposed && generation === this.generation) this.publish({ busy: false });
    }
  }
};

// src/client/DeploymentPage.tsx
var import_react4 = require("react");
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/deployment-locales.ts
var DEPLOYMENT_NS = "plugins.dsmm";
var deploymentEn = {
  title: "DSMM",
  summary: "Global config and profile overrides",
  description: "Layers save independently; native models and running sessions stay unchanged.",
  global: "DSMM Global config",
  globalHint: "Shared by this Home’s DSH profiles. Unset fields use built-in defaults.",
  profile: "Current DSH profile overrides",
  profileHint: "This entry only. Unset fields inherit Global config.",
  profileUnavailable: "Unavailable",
  unavailableForm: "No verified writable form. Open this entry’s bundle or row config to edit profile overrides.",
  ceiling: "Deepwork master is Global-only; profiles and session modes cannot lift its captured ceiling.",
  hostUnknown: "Host bundle status: unknown (separate switch).",
  boundaries: "New roots capture saved settings within startup capabilities. Save does not restart or reload LSP; startup-only changes require a separate Host restart, which may cancel sessions.",
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
  advanced: "Advanced JSON",
  advancedHint: "Schema keys only; omit to inherit. Arrays replace. No credentials or scripts; use existing providers.",
  invalid: "Invalid field. Check type, bounds and keys; draft retained.",
  conflict: "Revision conflict; draft retained. Review changes, then discard and reload. Refresh does not merge.",
  unavailable: "Scope unavailable; draft retained. Reconnect and refresh.",
  "not-owned": "Read-only: requires an authenticated local Host operator.",
  validation: "Host rejected configuration; draft retained. Check fields and merged constraints.",
  transport: "Disconnected; draft retained. Reconnect and refresh.",
  namedIndependent: "Deepwork Profiles is a separate named JSONC runtime-resource editor in Settings. Saving here does not apply a named profile or select its model."
};
var deploymentZh = {
  title: "DSMM",
  summary: "全局配置与当前配置覆盖",
  description: "两层独立保存，不改原生模型或运行中会话。",
  global: "DSMM 全局配置",
  globalHint: "同一 Home 的 DSH 配置共用；未设置字段使用内建默认值。",
  profile: "当前 DSH 配置覆盖",
  profileHint: "仅此实例；未设置字段继承全局配置。",
  profileUnavailable: "不可用",
  unavailableForm: "没有已核验的可写表单。请打开此实例的 bundle 或条目配置以编辑覆盖。",
  ceiling: "Deepwork 总开关仅全局可改；配置和会话模式不能突破已捕获上限。",
  hostUnknown: "宿主整包状态：未知（独立开关）。",
  boundaries: "新根会话在启动能力内采用已保存设置。保存不重启或重载 LSP；仅启动时生效的更改需另行重启宿主，可能取消会话。",
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
  advanced: "高级 JSON",
  advancedHint: "仅 schema 声明的键；省略为继承，数组整项替换。不填凭据或脚本，仅用已有提供商。",
  invalid: "字段无效，请核对类型、范围与键；草稿保留。",
  conflict: "版本冲突，草稿保留。核对后丢弃并重载；刷新不自动合并。",
  unavailable: "作用域不可用，草稿保留；重连后刷新。",
  "not-owned": "只读：需要本地宿主已认证 operator 权限。",
  validation: "宿主拒绝配置，草稿保留；核对字段及合并约束。",
  transport: "连接中断，草稿保留；重连后刷新。",
  namedIndependent: "设置中的 Deepwork Profiles 是独立的具名 JSONC 运行时资源编辑器。在此保存不会应用具名配置或选择其模型。"
};
var deploymentFieldLabels = {
  modules: ["Modules", "子模块"],
  skills: ["Skills", "技能"],
  roles: ["Agent roles", "Agent 角色"],
  deepwork: ["Deepwork", "Deepwork"],
  deepseekV4ProCalibration: ["DeepSeek V4 Pro calibration", "DeepSeek V4 Pro 校准"],
  deepseekV4ProDefaultReasoningEffort: ["DeepSeek V4 Pro default reasoning", "DeepSeek V4 Pro 默认推理强度"],
  deepseekV4ProMaxReasoningPresets: ["DeepSeek V4 Pro max presets", "DeepSeek V4 Pro 最高强度预设"],
  deepseekFlashCalibration: ["DeepSeek Flash calibration", "DeepSeek Flash 校准"],
  deepseekFlashDefaultReasoningEffort: ["DeepSeek Flash default reasoning", "DeepSeek Flash 默认推理强度"],
  deepseekFlashMaxReasoningPresets: ["DeepSeek Flash max presets", "DeepSeek Flash 最高强度预设"],
  roleRouting: ["Existing-provider routes", "已有提供商路由"],
  runtimePolicy: ["Routing and retry policy", "路由与重试策略"],
  workflow: ["Workflow gates", "工作流关卡"],
  guards: ["Safety guards", "安全保护"],
  runtimeRecovery: ["Runtime recovery", "运行时恢复"],
  subagents: ["Subagents", "子 Agent"],
  lsp: ["LSP", "LSP"],
  presets: ["Preset materialization", "预设物化"],
  modeName: ["Mode name", "模式名称"],
  section: ["Prompt section", "提示词章节"],
  promptOrder: ["Prompt order", "提示词顺序"],
  defaultActive: ["Default Deepwork mode", "默认 Deepwork 模式"],
  enabled: ["Enabled", "启用"],
  materialize: ["Materialize presets", "物化预设"],
  scope: ["Guard scope", "保护范围"],
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

// src/client/DeploymentPage.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function label(path, t) {
  const key = path.at(-1);
  const item = deploymentFieldLabels[key];
  return item === void 0 ? key.replace(/^dsmm-/u, "").replace(/([a-z])([A-Z])/gu, "$1 $2") : item[t("global") === "DSMM 全局配置" ? 1 : 0];
}
function displayValue(value, t) {
  if (value === void 0) return t("unknown");
  if (typeof value === "boolean") return t(value ? "on" : "off");
  const text3 = JSON.stringify(value);
  return text3.length > 120 ? `${text3.slice(0, 120)}…` : text3;
}
function AdvancedField({ schema, path, value, inherited, upper, reset, disabled, onChange, setInvalid, t }) {
  const id2 = (0, import_react4.useId)(), name = path.join(".");
  const serialized = value === void 0 ? "" : JSON.stringify(value, null, 2);
  const [text3, setText] = (0, import_react4.useState)(serialized);
  const [invalid, setLocalInvalid] = (0, import_react4.useState)(false);
  (0, import_react4.useEffect)(() => {
    setText(serialized);
    setLocalInvalid(false);
    setInvalid(name, false);
  }, [serialized, reset]);
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { className: "dsmm-deployment-group", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("summary", { children: [
      label(path, t),
      " · ",
      t("advanced"),
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: name })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { htmlFor: id2, children: [
        label(path, t),
        " · ",
        t("advanced"),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: name })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", id: `${id2}-hint`, children: t("advancedHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("textarea", { id: id2, rows: 6, maxLength: 32768, value: text3, disabled, "aria-invalid": invalid, "aria-describedby": `${id2}-hint ${id2}-error`, onChange: (event) => {
        const next = event.currentTarget.value;
        setText(next);
        let parsed, valid = true;
        try {
          parsed = parseAdvanced(next);
          const candidate = parsed === void 0 ? inherited : mergeLayer(inherited, parsed);
          valid = parsed === void 0 || validateEditorValue(parsed, schema, true) && validateEditorValue(upper === void 0 ? candidate : mergeLayer(candidate, upper), schema);
        } catch {
          valid = false;
        }
        setLocalInvalid(!valid);
        setInvalid(name, !valid);
        if (valid) onChange(parsed);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { id: `${id2}-error`, className: "dsmm-hint", children: invalid ? t("invalid") : "" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("summary", { children: [
          t("advanced"),
          " · schema"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("pre", { children: JSON.stringify(schema, null, 2) })
      ] })
    ] })
  ] });
}
function ScalarField({ schema, path, controller, disabled, inherited, invalid, t }) {
  const state = (0, import_react4.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
  const value = at(state.draft, path), name = path.join("."), id2 = (0, import_react4.useId)();
  const [text3, setText] = (0, import_react4.useState)(String(value ?? inherited ?? ""));
  const [bad, setBad] = (0, import_react4.useState)(false);
  (0, import_react4.useEffect)(() => {
    setText(String(value ?? inherited ?? ""));
    setBad(false);
    invalid(name, false);
  }, [value, inherited, state.snapshot]);
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { htmlFor: id2, children: [
      label(path, t),
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: name })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Input, { className: "dsmm-input", id: id2, type: "text", inputMode: schema.type === "number" ? "decimal" : void 0, value: text3, disabled, "aria-invalid": bad, "aria-describedby": `${id2}-error`, onChange: (event) => {
        const raw = event.currentTarget.value;
        setText(raw);
        const candidate = schema.type === "number" ? Number(raw) : raw;
        const valid = (schema.type !== "number" || raw.trim() !== "") && validateEditorValue(candidate, schema);
        setBad(!valid);
        invalid(name, !valid);
        if (valid) controller.edit(path, candidate);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { type: "button", variant: "outline", disabled: disabled || value === void 0 && !bad, onClick: () => {
        setText(String(inherited ?? ""));
        setBad(false);
        invalid(name, false);
        controller.edit(path, void 0);
      }, children: t("inherit") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { id: `${id2}-error`, className: "dsmm-hint", children: [
      bad ? t("invalid") : "",
      schema.type === "number" && (schema.min !== void 0 || schema.max !== void 0) ? ` ${schema.min ?? "—"} – ${schema.max ?? "—"}` : ""
    ] })
  ] });
}
function Field({ schema, path, controller, invalid, t }) {
  const state = (0, import_react4.useSyncExternalStore)(controller.subscribe, controller.getSnapshot), snapshot3 = state.snapshot;
  const id2 = (0, import_react4.useId)(), name = path.join("."), explicit = at(state.draft, path);
  const inherited = controller.layer === "global" ? at(snapshot3.defaults, path) : at(mergeLayer(mergeLayer(snapshot3.defaults, snapshot3.global), snapshot3.nativeForm?.base ?? {}), path);
  const disabled = state.busy || state.issue === "not-owned" || state.issue === "unavailable" || state.issue === "transport" || controller.layer === "profile" && !controller.canWriteProfile();
  const choices = enumValues(schema);
  if (schema.type === "object" && schema.fields !== void 0 && path[0] !== "roleRouting" && path[0] !== "lsp") return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { className: "dsmm-deployment-group", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("summary", { children: [
      label(path, t),
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: name })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { children: Object.entries(schema.fields).map(([key, node]) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { schema: node, path: [...path, key], controller, invalid, t }, key)) })
  ] });
  if (!["boolean", "string", "number"].includes(schema.type) && choices === null) return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(AdvancedField, { schema, path, value: explicit, inherited, upper: controller.layer === "global" ? at(snapshot3.profile, path) : void 0, reset: snapshot3, disabled, t, onChange: (value) => controller.edit(path, value), setInvalid: invalid });
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-field dsmm-deployment-field", children: [
    schema.type === "boolean" || choices !== null ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { htmlFor: id2, children: [
        label(path, t),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: name })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("select", { id: id2, disabled, value: explicit === void 0 ? "inherit" : JSON.stringify(explicit), onChange: (event) => controller.edit(path, event.currentTarget.value === "inherit" ? void 0 : JSON.parse(event.currentTarget.value)), children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("option", { value: "inherit", children: [
          t("inherit"),
          " · ",
          displayValue(inherited, t)
        ] }),
        (choices ?? [true, false]).map((choice2) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: JSON.stringify(choice2), children: displayValue(choice2, t) }, String(choice2)))
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ScalarField, { schema, path, controller, disabled, inherited, invalid, t }),
    (explicit !== void 0 || controller.layer === "profile" && at(snapshot3.nativeForm?.base, path) !== void 0) && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { className: "dsmm-hint", children: [
      explicit === void 0 ? "" : equal(explicit, at(snapshot3.defaults, path)) ? t("defaultPin") : t("explicit"),
      controller.layer === "profile" && at(snapshot3.nativeForm?.base, path) !== void 0 ? `${explicit === void 0 ? "" : " · "}${t("hostPin")}` : ""
    ] })
  ] });
}
function Layer({ controller, t }) {
  const state = (0, import_react4.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
  const [invalid, setInvalid] = (0, import_react4.useState)(/* @__PURE__ */ new Set());
  const updateInvalid = (path, bad) => {
    controller.setInvalid(path, bad);
    setInvalid((previous) => {
      if (previous.has(path) === bad) return previous;
      const next = new Set(previous);
      if (bad) next.add(path);
      else next.delete(path);
      return next;
    });
  };
  const title = controller.layer === "global" ? "global" : "profile";
  const disabled = state.busy || state.snapshot === null || state.issue !== null || invalid.size > 0 || controller.layer === "profile" && !controller.canWriteProfile();
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { "data-dsmm-layer": controller.layer, "aria-busy": state.busy, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { className: "dsmm-deployment-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("summary", { children: [
        t(title),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { role: "status", "aria-live": "polite", className: "dsmm-hint", children: state.busy ? t("saving") : state.dirty ? t("dirty") : state.saved ? t("saved") : "" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("fieldset", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("legend", { children: t(title) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t(title === "global" ? "globalHint" : "profileHint") }),
        state.snapshot !== null && Object.entries(state.snapshot.schema.fields ?? {}).filter(([key]) => controller.layer === "global" || key !== "modules").sort(([a], [b]) => a === "modules" ? -1 : b === "modules" ? 1 : 0).map(([key, schema]) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { schema, path: [key], controller, invalid: updateInvalid, t }, key)),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsmm-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { type: "button", variant: "primary", disabled: disabled || !state.dirty, onClick: () => {
            void controller.save();
          }, children: t(state.busy ? "saving" : title === "global" ? "saveGlobal" : "saveProfile") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { type: "button", variant: "outline", disabled: state.busy, onClick: () => {
            void controller.refresh();
          }, children: t("refresh") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { type: "button", variant: "outline", disabled: state.busy || !state.dirty && state.issue === null, onClick: () => {
            setInvalid(/* @__PURE__ */ new Set());
            void controller.refresh(true);
          }, children: t("discard") })
        ] })
      ] })
    ] }),
    state.issue !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-issue", role: "alert", children: t(state.issue) }),
    invalid.size > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-issue", role: "alert", children: t("invalid") }),
    controller.layer === "profile" && !controller.canWriteProfile() && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("unavailableForm") })
  ] });
}
function NativeProfileLayer({ namespace, forms, remote, form, core, t }) {
  const shared = (0, import_react4.useMemo)(() => forms.get(namespace), [forms, namespace]);
  const snapshot3 = (0, import_react4.useSyncExternalStore)((listener) => shared.subscribe(listener), () => shared.getSnapshot());
  const controller = (0, import_react4.useMemo)(() => core.forProfile(namespace), [core, remote, namespace]);
  const state = (0, import_react4.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
  const coreState = (0, import_react4.useSyncExternalStore)(core.subscribe, core.getSnapshot);
  controller.attachForm(form ?? { state: snapshot3, mutate: (ops, revision2) => shared.mutate(ops, revision2) });
  (0, import_react4.useEffect)(() => {
    void controller.refresh();
    return () => controller.dispose();
  }, [controller]);
  (0, import_react4.useEffect)(() => {
    if (state.saved) void core.refresh();
  }, [state.saved, core]);
  (0, import_react4.useEffect)(() => {
    if (controller.getSnapshot().snapshot !== null) void controller.refresh();
  }, [coreState.snapshot?.globalRevision, snapshot3.revision, controller]);
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Layer, { controller, t });
}
function StateInspector({ controller, session, t }) {
  const { snapshot: snapshot3, dirty, issue } = (0, import_react4.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
  if (snapshot3 === null) return null;
  const admitted = session?.configuration ?? null;
  const source = (value2) => t(value2 === "profile" ? "profileSource" : value2 === "global" ? "globalSource" : value2 === "defaults" ? "defaultsSource" : value2 === "named-session" ? "namedSource" : value2 === "startup" ? "startupSource" : value2 === "deployment" ? "deploymentCapture" : value2 === "mixed" ? "mixedSource" : "unknown");
  const value = (layer, path) => layer === void 0 ? t("unknown") : at(layer, path.split(".")) === void 0 ? t("absent") : displayValue(at(layer, path.split(".")), t);
  const metadata = (layer, path, entry) => layer !== void 0 && at(layer, path.split(".")) === void 0 && entry === void 0 ? t("absent") : source(entry);
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { className: "dsmm-deployment-card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("summary", { children: [
      t("state"),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsmm-hint", children: (snapshot3.nextRoot?.restartRequired.length ?? 0) > 0 ? t("pending") : dirty || issue !== null ? t("inspectorStale") : "" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { role: "status", "aria-live": "polite", children: session === null ? t("noSession") : admitted === null ? t("sessionUnavailable") : `${t("namedSource")}: ${admitted.named?.id ?? "—"}` }),
      session !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { children: [
        t("session"),
        ": ",
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: session.sessionId }),
        " · ",
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: session.admissionEpoch }),
        " · ",
        session.scope
      ] }),
      (dirty || issue !== null) && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("inspectorStale") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { className: "dsmm-hint", children: [
        "Global CAS: ",
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: snapshot3.globalRevision }),
        " · native CAS: ",
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: snapshot3.nativeRevision }),
        " · Host form: ",
        snapshot3.nativeFormRevision ?? "—"
      ] }),
      inspectorPaths(snapshot3, admitted).map((path) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dl", { className: "dsmm-deployment-state", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: path }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dd", { children: [
          t("globalSource"),
          ": ",
          at(snapshot3.global, path.split(".")) === void 0 ? t("absent") : t("globalSource")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dd", { children: [
          t("desired"),
          ": ",
          value(snapshot3.desired, path),
          " · ",
          metadata(snapshot3.desired, path, snapshot3.sources[path])
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dd", { children: [
          t("startup"),
          ": ",
          value(snapshot3.startup, path),
          " · ",
          metadata(snapshot3.startup, path, snapshot3.startupSources?.[path]),
          " / ",
          at(snapshot3.startup, path.split(".")) === void 0 ? t("absent") : t("startupSource")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dd", { children: [
          t("next"),
          ": ",
          value(snapshot3.nextRoot?.settings, path),
          " · ",
          metadata(snapshot3.nextRoot?.settings, path, snapshot3.nextRoot?.sources[path]),
          " / ",
          metadata(snapshot3.nextRoot?.settings, path, snapshot3.nextRoot?.captures[path])
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dd", { children: [
          t("session"),
          ": ",
          value(admitted?.settings, path),
          " · ",
          metadata(admitted?.settings, path, admitted?.sources[path]),
          " / ",
          metadata(admitted?.settings, path, admitted?.captures[path])
        ] })
      ] }, path)),
      (snapshot3.nextRoot?.restartRequired.length ?? 0) > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { children: [
        t("pending"),
        ": ",
        snapshot3.nextRoot.restartRequired.join(", ")
      ] })
    ] })
  ] });
}
function DeploymentPage(props) {
  const state = (0, import_react4.useSyncExternalStore)(props.core.subscribe, props.core.getSnapshot);
  (0, import_react4.useEffect)(() => {
    if (props.view === "page") void props.core.refresh();
  }, [props.core, props.view]);
  if (props.view === "summary") return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: props.t("summary") });
  const { t } = props, snapshot3 = state.snapshot, module2 = snapshot3?.modules[0];
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { className: "dsmm-profiles dsmm-deployment", "data-dsmm-page": true, "aria-label": t("title"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("description") }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("boundaries") }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { className: "dsmm-deployment-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("summary", { children: [
        t("module"),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsmm-hint", children: module2?.pending ? t("pending") : module2 === void 0 ? t("unknown") : t(module2.desired.enabled ? "on" : "off") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: t("hostUnknown") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { children: [
          t("desired"),
          ": ",
          module2 === void 0 ? t("unknown") : t(module2.desired.enabled ? "on" : "off"),
          " · ",
          module2?.desired.source ?? "—"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { children: [
          t("startup"),
          ": ",
          module2 === void 0 ? t("unknown") : t(module2.startupMounted ? "on" : "off"),
          " · ",
          t("next"),
          ": ",
          module2 === void 0 ? t("unknown") : t(module2.nextRoot.admitted ? "on" : "off")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { children: [
          t("session"),
          ": ",
          state.session?.modules?.[0]?.admitted == null ? t("unknown") : t(state.session.modules[0].admitted ? "on" : "off")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("ceiling") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Layer, { controller: props.core, t }),
    props.profilePage && props.forms !== void 0 && snapshot3?.namespace !== null && snapshot3?.namespace !== void 0 && (props.rowNamespace === void 0 || props.rowNamespace === snapshot3.namespace) ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NativeProfileLayer, { namespace: snapshot3.namespace, forms: props.forms, remote: props.remote, form: props.form, core: props.core, t }, `${snapshot3.hostProfileKey}:${snapshot3.entryId}`) : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { className: "dsmm-deployment-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("summary", { children: [
          t("profile"),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsmm-hint", children: t("profileUnavailable") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: t("profileHint") }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsmm-hint", children: t("unavailableForm") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(StateInspector, { controller: props.core, session: state.session, t })
  ] });
}

// src/child-evidence.ts
var CHILD_EVIDENCE_FIELDS = ["lineage", "role", "route", "profile-pin", "admission-epoch", "invocation-level", "runtime-policy", "modules", "roles", "read-only", "tool-filter", "route-override", "max-depth", "locale", "tool-topology", "guards", "git-write", "shell", "delegation", "active-intent", "max-tokens", "output-schema"];
function object2(value, required, optional2 = []) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some((property) => !Object.hasOwn(property, "value") || !property.enumerable)) throw new TypeError("Invalid child evidence object");
  const row = value;
  if (required.some((key) => !Object.hasOwn(row, key)) || Object.keys(row).some((key) => !required.includes(key) && !optional2.includes(key))) throw new TypeError("Invalid child evidence fields");
  return row;
}
function epoch(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError("Invalid child evidence epoch");
  return value;
}
function array(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum || Object.getOwnPropertySymbols(value).length || Object.keys(value).length !== value.length || Object.entries(Object.getOwnPropertyDescriptors(value)).some(([key, property]) => key !== "length" && (!/^(0|[1-9][0-9]*)$/u.test(key) || !Object.hasOwn(property, "value") || !property.enumerable))) throw new TypeError("Invalid child evidence array");
  return value;
}
function parseChildAdmissionEvidenceView(input) {
  const row = object2(input, ["mode", "parentAdmissionEpoch", "provenFields", "limitations"], ["originalAdmissionEpoch"]);
  if (row.mode !== "captured" && row.mode !== "legacy-conservative") throw new TypeError("Invalid child evidence mode");
  if (row.mode === "legacy-conservative" && Object.hasOwn(row, "originalAdmissionEpoch")) throw new TypeError("Legacy evidence has no original admission epoch");
  const proven = array(row.provenFields, CHILD_EVIDENCE_FIELDS.length);
  if (new Set(proven).size !== proven.length || proven.some((field) => !CHILD_EVIDENCE_FIELDS.includes(field))) throw new TypeError("Invalid proven evidence fields");
  const limitations = array(row.limitations, CHILD_EVIDENCE_FIELDS.length).map((input2) => {
    const limitation = object2(input2, ["field", "code", "effect"]);
    if (!CHILD_EVIDENCE_FIELDS.includes(limitation.field) || typeof limitation.code !== "string" || !["missing-evidence", "not-persisted", "unverified", "parent-denied"].includes(limitation.code) || typeof limitation.effect !== "string" || !["capability-denied", "native-default", "display-only"].includes(limitation.effect)) throw new TypeError("Invalid child evidence limitation");
    return { field: limitation.field, code: limitation.code, effect: limitation.effect };
  });
  if (row.mode === "legacy-conservative" && proven.some((field) => ["admission-epoch", "profile-pin", "invocation-level"].includes(field))) throw new TypeError("Legacy evidence cannot synthesize original capture identity");
  return { mode: row.mode, parentAdmissionEpoch: epoch(row.parentAdmissionEpoch), ...row.mode === "captured" ? { originalAdmissionEpoch: epoch(row.originalAdmissionEpoch) } : {}, provenFields: [...proven], limitations };
}

// src/role-control-types.ts
var ROLE_CONTROL_DISABLED_REASONS = [
  "module-off",
  "role-disabled",
  "read-only",
  "background-disabled",
  "jobs-unavailable",
  "starting",
  "already-background",
  "already-settled",
  "cancelled",
  "one-shot",
  "unknown-mode",
  "not-direct-child",
  "delivery-fence-unavailable",
  "evidence-unavailable",
  "legacy-capability-denied",
  "unavailable"
];
var ROLE_CONTROL_ERROR_CODES = ["validation", "not-owned", "unavailable", "cancelled", "conflict", "not-found", "not-resumable", "invalid-content", "invalid-time-zone", "disabled"];
var ROLE_CONTROL_ERROR_FIELDS = ["sessionId", "parentSessionId", "childSessionId", "toolCallId", "runId", "expectedAdmissionEpoch", "request", "content", "clientTimeZone"];

// src/role-control-remote.ts
function fail2() {
  throw new TypeError("Invalid Deepwork child control DTO.");
}
function json(value, depth2 = 0, active = /* @__PURE__ */ new Set()) {
  if (depth2 > 24) fail2();
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || value === null || active.has(value)) fail2();
  const isArray = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype) && (isArray || Object.getPrototypeOf(value) !== null)) fail2();
  if (Object.getOwnPropertySymbols(value).length) fail2();
  for (const [key, property] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (isArray && key === "length") continue;
    if (!Object.hasOwn(property, "value") || !property.enumerable || ["__proto__", "prototype", "constructor"].includes(key) || isArray && !/^(0|[1-9][0-9]*)$/u.test(key)) fail2();
  }
  if (isArray && Object.keys(value).length !== value.length) fail2();
  active.add(value);
  const result = isArray ? value.map((child2) => json(child2, depth2 + 1, active)) : Object.fromEntries(Object.entries(value).map(([key, child2]) => [key, json(child2, depth2 + 1, active)]));
  active.delete(value);
  return result;
}
function object3(value, required, optional2 = []) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail2();
  const row = value;
  if (required.some((key) => !Object.hasOwn(row, key)) || Object.keys(row).some((key) => !required.includes(key) && !optional2.includes(key))) fail2();
  return row;
}
function choice(value, choices) {
  if (!choices.includes(value)) fail2();
  return value;
}
function text2(value, max) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/u.test(value) || new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(value)) !== value) fail2();
  return value;
}
function identity(value) {
  if (!isNativeSessionId(value)) fail2();
  return value;
}
function epoch2(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) fail2();
  return value;
}
function array2(value, max = 4096) {
  if (!Array.isArray(value) || value.length > max) fail2();
  return value;
}
function bool(value) {
  if (typeof value !== "boolean") fail2();
  return value;
}
function depth(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 4096) fail2();
  return value;
}
function availability(value) {
  const row = object3(value, ["enabled"], ["reason"]);
  if (row.enabled === true && !Object.hasOwn(row, "reason")) return { enabled: true };
  if (row.enabled !== false) fail2();
  return { enabled: false, reason: choice(row.reason, ROLE_CONTROL_DISABLED_REASONS) };
}
function capabilities(value) {
  const row = object3(value, ["background", "prompt", "interrupt", "images", "runtime"]);
  return { background: availability(row.background), prompt: availability(row.prompt), interrupt: availability(row.interrupt), images: availability(row.images), runtime: parseSubagentRuntimeAdmissionView(row.runtime) };
}
function run(value) {
  const row = object3(value, ["sessionId", "toolCallId", "state", "background"], ["invocation"]);
  const state = choice(row.state, ["starting", "running", "background", "settled", "cancelled"]);
  const invocation = Object.hasOwn(row, "invocation") ? parseDsmmInvocationView(row.invocation) : void 0;
  if (state === "starting" && invocation !== void 0 || invocation !== void 0 && (invocation.mode !== "one-shot" || invocation.runId === void 0) || ["running", "background", "settled"].includes(state) && invocation === void 0) fail2();
  return { sessionId: identity(row.sessionId), toolCallId: identity(row.toolCallId), state, background: availability(row.background), ...invocation === void 0 ? {} : { invocation } };
}
function child(value) {
  const row = object3(value, ["id", "parentSessionId", "mode", "activity", "readonly", "controls"], ["label", "invocation", "routeComparison", "evidence"]);
  const controls = object3(row.controls, ["prompt", "interrupt"]);
  const mode = choice(row.mode, ["one-shot", "continuable", "unknown"]);
  const prompt = availability(controls.prompt), interrupt = availability(controls.interrupt);
  const readonly = bool(row.readonly);
  if (readonly !== (!prompt.enabled && !interrupt.enabled) || mode !== "continuable" && (prompt.enabled || interrupt.enabled)) fail2();
  const invocation = Object.hasOwn(row, "invocation") ? parseDsmmInvocationView(row.invocation) : void 0;
  const routeComparison = Object.hasOwn(row, "routeComparison") ? parseDsmmRoleRouteComparison(row.routeComparison) : void 0;
  const evidence = Object.hasOwn(row, "evidence") ? parseChildAdmissionEvidenceView(row.evidence) : void 0;
  const id2 = identity(row.id);
  if (invocation !== void 0 && (invocation.childId !== id2 || invocation.mode !== mode)) fail2();
  if (routeComparison !== void 0 && routeComparison.childId !== id2) fail2();
  if (evidence?.mode === "legacy-conservative" && invocation !== void 0) fail2();
  return {
    id: id2,
    parentSessionId: identity(row.parentSessionId),
    mode,
    activity: choice(row.activity, ["running", "inactive"]),
    readonly,
    controls: { prompt, interrupt },
    ...Object.hasOwn(row, "label") ? { label: text2(row.label, 120) } : {},
    ...invocation === void 0 ? {} : { invocation },
    ...routeComparison === void 0 ? {} : { routeComparison },
    ...evidence === void 0 ? {} : { evidence }
  };
}
function snapshot2(value) {
  const row = object3(value, ["sessionId", "admissionEpoch", "runs", "children", "capabilities"]);
  const sessionId2 = identity(row.sessionId), admissionEpoch = epoch2(row.admissionEpoch), runs = array2(row.runs).map(run), children = array2(row.children).map(child);
  if (runs.some((run2) => run2.sessionId !== sessionId2) || children.some((child2) => child2.parentSessionId !== sessionId2 || child2.evidence !== void 0 && child2.evidence.parentAdmissionEpoch !== admissionEpoch)) fail2();
  return { sessionId: sessionId2, admissionEpoch, runs, children, capabilities: capabilities(row.capabilities) };
}
function descendants(value) {
  const row = object3(value, ["sessionId", "admissionEpoch", "descendants"]);
  const sessionId2 = identity(row.sessionId), admissionEpoch = epoch2(row.admissionEpoch);
  const entries = array2(row.descendants).map((value2) => {
    const entry = object3(value2, ["kind", "depth"], ["child", "hasChildren", "id", "parentSessionId", "reason"]);
    if (entry.kind === "child") {
      object3(entry, ["kind", "depth", "child", "hasChildren"]);
      const projected = child(entry.child);
      if (entry.depth !== 1 && (projected.controls.prompt.enabled || projected.controls.interrupt.enabled)) fail2();
      return { kind: "child", depth: depth(entry.depth), child: projected, hasChildren: bool(entry.hasChildren) };
    }
    object3(entry, ["kind", "depth", "id", "parentSessionId", "reason"]);
    if (entry.kind !== "diagnostic") fail2();
    return { kind: "diagnostic", depth: depth(entry.depth), id: identity(entry.id), parentSessionId: identity(entry.parentSessionId), reason: choice(entry.reason, ["corrupt", "unsupported", "unavailable"]) };
  });
  for (const entry of entries) {
    const parent = entry.kind === "child" ? entry.child.parentSessionId : entry.parentSessionId;
    if (entry.depth === 1 !== (parent === sessionId2)) fail2();
    if (entry.kind === "child" && entry.child.evidence !== void 0 && entry.child.evidence.parentAdmissionEpoch !== admissionEpoch) fail2();
  }
  return { sessionId: sessionId2, admissionEpoch, descendants: entries };
}
function backgroundRequest(value) {
  const row = object3(value, ["sessionId", "toolCallId", "runId", "expectedAdmissionEpoch"]);
  return { sessionId: identity(row.sessionId), toolCallId: identity(row.toolCallId), runId: identity(row.runId), expectedAdmissionEpoch: epoch2(row.expectedAdmissionEpoch) };
}
function transition(value) {
  const row = object3(value, ["status", "runId"], ["jobId"]);
  const status = choice(row.status, ["background", "already-background", "already-settled", "cancelled"]);
  if (["background", "already-background"].includes(status) !== Object.hasOwn(row, "jobId")) fail2();
  return { status, runId: identity(row.runId), ...Object.hasOwn(row, "jobId") ? { jobId: identity(row.jobId) } : {} };
}
function promptRequest(value) {
  const row = object3(value, ["requestId", "parentSessionId", "childSessionId", "mode", "delivery", "content"], ["clientTimeZone"]);
  if (row.mode !== "continuable") fail2();
  const content2 = array2(row.content, Number.MAX_SAFE_INTEGER).map((value2) => {
    const part = object3(value2, ["type"], ["text", "mediaType", "data", "name"]);
    if (part.type === "text") {
      object3(part, ["type", "text"]);
      if (typeof part.text !== "string") fail2();
      return { type: "text", text: part.text };
    }
    object3(part, ["type", "mediaType", "data"], ["name"]);
    if (part.type !== "image" || typeof part.data !== "string") fail2();
    return {
      type: "image",
      mediaType: choice(part.mediaType, ["image/png", "image/jpeg", "image/webp", "image/gif"]),
      data: part.data,
      ...Object.hasOwn(part, "name") ? { name: text2(part.name, 256) } : {}
    };
  });
  if (content2.length === 0) fail2();
  return {
    requestId: identity(row.requestId),
    parentSessionId: identity(row.parentSessionId),
    childSessionId: identity(row.childSessionId),
    mode: "continuable",
    delivery: choice(row.delivery, ["queue", "steer"]),
    content: content2,
    ...Object.hasOwn(row, "clientTimeZone") ? { clientTimeZone: text2(row.clientTimeZone, 128) } : {}
  };
}
function interruptRequest(value) {
  const row = object3(value, ["parentSessionId", "childSessionId", "mode"]);
  if (row.mode !== "continuable") fail2();
  return { parentSessionId: identity(row.parentSessionId), childSessionId: identity(row.childSessionId), mode: "continuable" };
}
function promptReceipt(value) {
  const row = object3(value, ["messageId"]);
  return { messageId: identity(row.messageId) };
}
function interruptReceipt(value) {
  const row = object3(value, ["accepted"]);
  if (row.accepted !== true) fail2();
  return { accepted: true };
}
function errorInfo2(value) {
  const row = object3(value, ["code"], ["field", "reason"]);
  return {
    code: choice(row.code, ROLE_CONTROL_ERROR_CODES),
    ...Object.hasOwn(row, "field") ? { field: choice(row.field, ROLE_CONTROL_ERROR_FIELDS) } : {},
    ...Object.hasOwn(row, "reason") ? { reason: choice(row.reason, ROLE_CONTROL_DISABLED_REASONS) } : {}
  };
}
var parseRoleControlErrorInfo = (value) => errorInfo2(json(value));
var parseChildSessionSnapshot = (value) => snapshot2(json(value));
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
  descriptor2("describe", codec2("ChildSessionSnapshot", snapshot2)),
  descriptor2("descendants", codec2("RoleControlDescendantsSnapshot", descendants)),
  descriptor2("background", codec2("BackgroundTransitionResult", transition), codec2("RoleControlBackgroundRequest", backgroundRequest)),
  descriptor2("prompt", codec2("SubagentPromptReceipt", promptReceipt), codec2("SubagentPromptRequest", promptRequest)),
  descriptor2("interrupt", codec2("SubagentInterruptReceipt", interruptReceipt), codec2("RoleControlInterruptRequest", interruptRequest))
] };
var ROLE_CONTROL_HOST = { package: ROLE_CONTROL_REMOTE.package, face: "host", schemas: [], model: { services: [], events: [], objects: [] }, invocations: ROLE_CONTROL_REMOTE.descriptors };

// src/client/children-controller.ts
var EMPTY_CHILD_DRAFT = { text: "", delivery: "queue", images: [], imageBusy: false, uncertain: false };
var childActionKey = (childId) => `child:${childId}`;
var runActionKey = (toolCallId, runId) => `run:${JSON.stringify([toolCallId, runId])}`;
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
    background: (generation, call, run2) => this.background(generation, call, run2),
    prompt: (generation, child2) => this.prompt(generation, child2),
    interrupt: (generation, child2) => this.interrupt(generation, child2),
    editText: (generation, child2, text3) => this.editDraft(generation, child2, { text: text3 }),
    setDelivery: (generation, child2, delivery) => this.editDraft(generation, child2, { delivery }),
    addImages: (generation, child2, files) => this.addImages(generation, child2, files),
    removeImage: (generation, child2, image) => {
      const draft = this.draft(child2);
      if (!draft.imageBusy) this.editDraft(generation, child2, { images: draft.images.filter((part) => part !== image) });
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
    if (preserveDrafts) for (const [id2, draft] of this.current.drafts) drafts.set(id2, {
      ...draft,
      imageBusy: false,
      uncertain: draft.uncertain || this.current.pending.get(childActionKey(id2)) === "prompt"
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
      const codec3 = ROLE_CONTROL_REMOTE.descriptors.find((row) => row.method === method).result;
      if (codec3.mode !== "strict") throw new TypeError("Child result requires a strict codec.");
      return codec3.create().parse(result.value);
    } catch {
      throw new ControlFailure({ kind: "protocol", code: "unavailable", unknown: true });
    }
  }
  async refresh(generation) {
    if (!this.live(generation) || this.current.reading || this.current.pending.size > 0 || [...this.current.drafts.values()].some((draft) => draft.imageBusy)) return;
    const id2 = this.current.sessionId;
    this.publish({ reading: true, issue: null, descendantIssue: null, fresh: false });
    const [description, descendants2] = await Promise.allSettled([this.unwrap("describe", () => this.remote.describe(id2)), this.unwrap("descendants", () => this.remote.descendants(id2))]);
    if (!this.live(generation)) return;
    if (description.status === "rejected") {
      this.publish({ reading: false, issue: this.issue(description.reason), descendants: null });
      return;
    }
    const snapshot3 = parseChildSessionSnapshot(description.value);
    if (snapshot3.sessionId !== id2) {
      this.publish({ reading: false, issue: { kind: "protocol", code: "not-owned" }, descendants: null });
      return;
    }
    if (this.observedAdmission !== null && snapshot3.admissionEpoch !== this.observedAdmission) {
      this.publish({ reading: false, issue: { kind: "protocol", code: "conflict" }, descendants: null });
      return;
    }
    let tree = null, descendantIssue = null;
    if (descendants2.status === "rejected") descendantIssue = this.issue(descendants2.reason);
    else {
      tree = parseRoleControlDescendants(descendants2.value);
      if (tree.sessionId !== id2 || tree.admissionEpoch !== snapshot3.admissionEpoch) {
        tree = null;
        descendantIssue = { kind: "protocol", code: "conflict" };
      }
    }
    this.publish({ snapshot: snapshot3, descendants: tree, descendantIssue, fresh: true, reading: false, generation: generation + 1 });
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
  async background(generation, toolCallId, runId) {
    const key = runActionKey(toolCallId, runId), snapshot3 = this.current.snapshot;
    const run2 = snapshot3?.runs.find((row) => row.toolCallId === toolCallId && row.invocation?.runId === runId);
    if (!this.available(generation) || this.current.pending.has(key) || this.current.outcomes.get(key)?.kind === "background" || run2?.state !== "running" || !enabled(run2.background) || !enabled(snapshot3?.capabilities.background)) return;
    this.begin(key, "background");
    try {
      const receipt = await this.unwrap("background", () => this.remote.background(snapshot3.sessionId, { sessionId: snapshot3.sessionId, toolCallId, runId, expectedAdmissionEpoch: snapshot3.admissionEpoch }));
      if (!this.live(generation)) return;
      if (receipt.runId !== runId) throw new ControlFailure({ kind: "protocol", code: "conflict", unknown: true });
      this.accepted(key, { kind: "background", receipt });
    } catch (error) {
      if (this.live(generation)) this.refuse(key, error);
    } finally {
      if (this.live(generation)) this.finish(key);
    }
  }
  canControl(generation, id2, action) {
    const child2 = this.child(id2);
    return this.available(generation) && !this.current.pending.has(childActionKey(id2)) && child2?.mode === "continuable" && !child2.readonly && enabled(child2.controls[action]) && enabled(this.current.snapshot?.capabilities[action]);
  }
  async prompt(generation, id2) {
    const draft = this.draft(id2), key = childActionKey(id2);
    if (!this.canControl(generation, id2, "prompt") || draft.uncertain || draft.imageBusy || draft.text.trim() === "" && draft.images.length === 0 || draft.images.length > 0 && !enabled(this.current.snapshot?.capabilities.images)) return;
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
          delivery: draft.delivery,
          content: [...draft.text === "" ? [] : [{ type: "text", text: draft.text }], ...draft.images],
          ...clientTimeZone === void 0 ? {} : { clientTimeZone }
        });
      } catch {
        throw new ControlFailure({ kind: "local", code: "invalid-content" });
      }
      const receipt = await this.unwrap("prompt", () => this.remote.prompt(this.current.sessionId, request));
      if (!this.live(generation)) return;
      this.accepted(key, { kind: "prompt", receipt });
      const drafts = new Map(this.current.drafts);
      drafts.set(id2, { ...draft, text: "", images: [], uncertain: false });
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
var import_react5 = require("react");
var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime7 = require("react/jsx-runtime");
function ControlAvailability({ value, label: label2, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-availability", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
      t(label2),
      ": ",
      t(value?.enabled === true ? "enabled" : "disabled")
    ] }),
    value?.enabled !== true && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t(`reason:${value?.reason ?? "unavailable"}`) })
  ] });
}
function routeText2(route3) {
  return `${route3.provider}/${route3.model}${route3.reasoningEffort === void 0 ? "" : ` (${route3.reasoningEffort})`}`;
}
function RouteComparisonDetails({ value, t }) {
  const initial = value?.initialRoute, live = value?.liveRoute;
  const liveReasons = { "no-own-request-header": "routeNoOwnHeader", "invalid-own-request-header": "routeInvalidOwnHeader", "not-observed": "routeNotObserved" };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-availability", children: [
    value === void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("comparisonUnobserved") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dl", { className: "dsmm-child-meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("initialRoute") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: initial?.status === "known" ? routeText2(initial.route) : t("routeUnknown") }),
      initial?.status === "known" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("initialRouteSource") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dd", { children: [
          t("routeCaptureSource"),
          " · ",
          initial.source
        ] })
      ] }) : initial !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("initialRouteReason") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dd", { children: [
          t("routeMissingCapture"),
          " · ",
          initial.reason
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("liveRoute") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: live?.status === "known" ? routeText2(live.route) : t("routeUnknown") }),
      live?.status === "known" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("liveRouteSource") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dd", { children: [
          t("routeOwnHeaderSource"),
          " · ",
          live.source
        ] })
      ] }) : live !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("liveRouteReason") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dd", { children: [
          t(liveReasons[live.reason]),
          " · ",
          live.reason
        ] })
      ] })
    ] })
  ] });
}
function InvocationDetails({ value, t, showComparison = true }) {
  if (value === void 0) return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("invocationUnavailable") });
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
    showComparison && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(RouteComparisonDetails, { value: value.routeComparison, t }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dl", { className: "dsmm-child-meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("role") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dd", { children: [
        value.label,
        " · ",
        value.role
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("level") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: value.level }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("mode") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: value.mode }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("reportedRoute") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: value.route === void 0 ? t("routeUnreported") : routeText2(value.route) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("routeSource") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: value.routeSource }),
      value.runId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("runId") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: value.runId })
      ] }),
      value.childId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("childId") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: value.childId })
      ] }),
      value.jobId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("jobId") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: value.jobId })
      ] })
    ] })
  ] });
}
function EvidenceDetails({ value, t }) {
  if (value === void 0) return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("evidenceMissing") });
  const codes = { "missing-evidence": "missingEvidence", "not-persisted": "notPersisted", unverified: "unverified", "parent-denied": "parentDenied" };
  const effects = { "capability-denied": "capabilityDenied", "native-default": "nativeDefault", "display-only": "displayOnly" };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { className: "dsmm-availability", "aria-label": t("evidence"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t(value.mode === "captured" ? "captured" : "legacy") }),
    value.originalAdmissionEpoch !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
      t("originalEpoch"),
      ": ",
      value.originalAdmissionEpoch
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
      t("epoch"),
      ": ",
      value.parentAdmissionEpoch
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
      t("proven"),
      ": ",
      value.provenFields.length ? value.provenFields.join(", ") : t("noneProven")
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t("limitations") }),
    value.limitations.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("noLimitations") }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { className: "dsmm-profile-list", children: value.limitations.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("li", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
        item.field,
        " · ",
        item.code,
        " · ",
        t(codes[item.code])
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
        item.effect,
        " · ",
        t(effects[item.effect])
      ] })
    ] }, `${item.field}-${index}`)) })
  ] });
}
function Issue({ value, t }) {
  if (!value) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-issue", role: "alert", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t(value.unknown ? "unknownAction" : "error", { code: value.code }) }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
      value.code,
      value.field === void 0 ? "" : ` · ${t("field")}: ${value.field}`
    ] }),
    value.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t(`reason:${value.reason}`) })
  ] });
}
function Outcome({ value, t }) {
  if (!value) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dsmm-availability", role: "status", "aria-live": "polite", children: value.kind === "prompt" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t("promptAccepted", { id: value.receipt.messageId }) }) : value.kind === "interrupt" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t("interruptAccepted") }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t("backgroundReceipt", { status: value.receipt.status, id: value.receipt.runId }) }),
    value.receipt.jobId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
      t("jobId"),
      ": ",
      value.receipt.jobId
    ] })
  ] }) });
}
function ChildComposer({ child: child2, state, actions, t }) {
  const prefix = (0, import_react5.useId)(), picker = (0, import_react5.useRef)(null), generation = state.generation, key = childActionKey(child2.id);
  const draft = state.drafts.get(child2.id) ?? EMPTY_CHILD_DRAFT;
  const pending = state.pending.has(key), available = state.fresh && !state.reading && !pending;
  const canPrompt = available && enabled(state.snapshot?.capabilities.prompt) && enabled(child2.controls.prompt) && !child2.readonly && child2.mode === "continuable";
  const canImages = canPrompt && enabled(state.snapshot?.capabilities.images) && !draft.imageBusy;
  const submit = canPrompt && !draft.uncertain && !draft.imageBusy && (draft.text.trim() !== "" || draft.images.length > 0) && (draft.images.length === 0 || enabled(state.snapshot?.capabilities.images));
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("form", { className: "dsmm-child-composer", "aria-label": t("prompt"), onSubmit: (event) => {
    event.preventDefault();
    if (submit) void actions.prompt(generation, child2.id);
  }, children: [
    !state.fresh && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t(state.reading ? "reading" : "stale") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: `${prefix}-message`, children: t("text") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "textarea",
        {
          id: `${prefix}-message`,
          className: "dsmm-child-message",
          rows: 4,
          value: draft.text,
          disabled: pending,
          "aria-describedby": `${prefix}-delivery-hint${draft.uncertain ? ` ${prefix}-unknown` : ""}`,
          onChange: (event) => actions.editText(generation, child2.id, event.currentTarget.value)
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: `${prefix}-delivery`, children: t("delivery") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("select", { id: `${prefix}-delivery`, value: draft.delivery, disabled: !canPrompt, "aria-describedby": `${prefix}-delivery-hint`, onChange: (event) => {
        const value = event.currentTarget.value;
        if (value === "queue" || value === "steer") actions.setDelivery(generation, child2.id, value);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "queue", children: t("queue") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "steer", children: t("steer") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { id: `${prefix}-delivery-hint`, className: "dsmm-hint", children: t("deliveryHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { id: `${prefix}-images-hint`, className: "dsmm-hint", children: t("imagesHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { ref: picker, hidden: true, type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", multiple: true, disabled: !canImages, "aria-label": t("images"), onChange: (event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = "";
        if (canImages) void actions.addImages(generation, child2.id, files);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { type: "button", variant: "outline", disabled: !canImages, "aria-describedby": `${prefix}-images-hint`, onClick: () => {
        if (canImages) picker.current?.click();
      }, children: t("images") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ControlAvailability, { value: state.snapshot?.capabilities.images, label: "imageAvailability", t }),
      draft.images.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { className: "dsmm-profile-list", children: draft.images.map((image, index) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
          image.name ?? image.mediaType,
          " · ",
          image.mediaType
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { type: "button", variant: "outline", disabled: pending || draft.imageBusy, onClick: () => actions.removeImage(generation, child2.id, image), "aria-label": `${t("removeImage")}: ${image.name ?? image.mediaType}`, children: t("removeImage") })
      ] }, index)) })
    ] }),
    draft.uncertain && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-warning", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { id: `${prefix}-unknown`, children: t("unknown") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { type: "button", variant: "outline", disabled: !state.fresh || state.reading || pending, onClick: () => actions.acknowledgeUnknown(generation, child2.id), children: t("acknowledge") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ControlAvailability, { value: !enabled(state.snapshot?.capabilities.prompt) ? state.snapshot?.capabilities.prompt : child2.controls.prompt, label: "promptAvailability", t }),
    draft.text.trim() === "" && draft.images.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("emptyMessage") }),
    draft.images.length > 0 && !enabled(state.snapshot?.capabilities.images) && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("deniedImages") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { type: "submit", variant: "primary", disabled: !submit, children: t("send") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        import_dsh_client_ui_primitives5.Button,
        {
          type: "button",
          variant: "outline",
          disabled: !available || !enabled(state.snapshot?.capabilities.interrupt) || !enabled(child2.controls.interrupt) || child2.readonly || child2.mode !== "continuable",
          onClick: () => void actions.interrupt(generation, child2.id),
          children: t("interrupt")
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", children: pending ? t("pending") : draft.imageBusy ? t("imageReading") : "" })
  ] });
}
function ChildDetails({ child: child2, state, actions, t, inspection = false }) {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("fieldset", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("legend", { children: child2.label?.trim() ? child2.label : child2.id }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
      t("childId"),
      ": ",
      child2.id
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
      t("parentId"),
      ": ",
      child2.parentSessionId
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
      t("mode"),
      ": ",
      child2.mode
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
      t("activity"),
      ": ",
      child2.activity
    ] }),
    (inspection || child2.readonly) && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t("readonly") }),
    child2.mode === "one-shot" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("oneShot") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(RouteComparisonDetails, { value: child2.routeComparison, t }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(InvocationDetails, { value: child2.invocation, t, showComparison: false }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(EvidenceDetails, { value: child2.evidence, t }),
    (!inspection || !child2.controls.prompt.enabled) && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ControlAvailability, { value: child2.controls.prompt, label: "promptAvailability", t }),
    (!inspection || !child2.controls.interrupt.enabled) && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ControlAvailability, { value: child2.controls.interrupt, label: "interruptAvailability", t }),
    !inspection && child2.mode === "continuable" && !child2.readonly && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ChildComposer, { child: child2, state, actions, t }),
    !inspection && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Issue, { value: state.issues.get(childActionKey(child2.id)), t }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Outcome, { value: state.outcomes.get(childActionKey(child2.id)), t })
    ] })
  ] });
}
function ChildrenPanel(props) {
  const state = props.useChildren((snapshot3) => snapshot3), { t } = props, generation = state.generation;
  if (props.sessionId === void 0 || props.sessionId !== state.sessionId) return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { className: "dsmm-profiles dsmm-children", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h2", { children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t(state.sessionId === null ? "noSession" : "foreign") })
  ] });
  const data = state.snapshot;
  const refreshingDisabled = state.reading || state.pending.size > 0 || [...state.drafts.values()].some((draft) => draft.imageBusy);
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { className: "dsmm-profiles dsmm-children", "aria-label": t("title"), "aria-busy": state.reading, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h2", { children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("description") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
      t("session"),
      ": ",
      state.sessionId
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dsmm-actions", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { type: "button", variant: "outline", disabled: refreshingDisabled, onClick: () => void props.refresh(generation), children: t("refresh") }) }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", children: state.reading ? t("reading") : state.pending.size > 0 ? t("pending") : !state.fresh ? t(data === null ? "unavailable" : "stale") : "" }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Issue, { value: state.issue, t }),
    data !== null && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
        t("epoch"),
        ": ",
        data.admissionEpoch
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { className: "dsmm-availability", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
          t("runtime"),
          ": ",
          data.capabilities.runtime.binding
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
          t("fence"),
          ": ",
          t(data.capabilities.runtime.deliveryFenceReady ? "yes" : "no")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
          t("restart"),
          ": ",
          t(data.capabilities.runtime.restartRequired ? "yes" : "no")
        ] }),
        data.capabilities.runtime.reason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t(data.capabilities.runtime.reason === "explicit-composition-required" ? "composition" : data.capabilities.runtime.reason === "duplicate-provider" ? "duplicate" : "authority") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ControlAvailability, { value: data.capabilities.background, label: "backgroundAvailability", t }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ControlAvailability, { value: data.capabilities.prompt, label: "promptAvailability", t }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ControlAvailability, { value: data.capabilities.interrupt, label: "interruptAvailability", t })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { className: "dsmm-zone", "aria-label": t("runs"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { children: t("runs") }),
        data.runs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("emptyRuns") }) : data.runs.map((run2) => {
          const runId = run2.invocation?.runId, key = runId === void 0 ? null : runActionKey(run2.toolCallId, runId);
          const disabled = !state.fresh || state.reading || run2.state !== "running" || !enabled(run2.background) || !enabled(data.capabilities.background) || key === null || state.pending.has(key) || state.outcomes.get(key)?.kind === "background";
          return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("fieldset", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("legend", { children: run2.invocation?.label ?? t(run2.state === "starting" ? "starting" : "invocationUnavailable") }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
              t("toolCallId"),
              ": ",
              run2.toolCallId
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
              t("runState"),
              ": ",
              run2.state
            ] }),
            run2.invocation !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(InvocationDetails, { value: run2.invocation, t }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ControlAvailability, { value: run2.background, label: "backgroundAvailability", t }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("backgroundHint") }),
            runId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { type: "button", variant: "outline", disabled, onClick: () => void props.background(generation, run2.toolCallId, runId), children: t("background") }),
            key !== null && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-status", role: "status", "aria-live": "polite", children: state.pending.has(key) ? t("pending") : "" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Issue, { value: state.issues.get(key), t }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Outcome, { value: state.outcomes.get(key), t })
            ] })
          ] }, run2.toolCallId);
        })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { className: "dsmm-zone", "aria-label": t("children"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { children: t("children") }),
        data.children.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("emptyChildren") }) : data.children.map((child2) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ChildDetails, { child: child2, state, actions: props, t }, child2.id))
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { className: "dsmm-zone", "aria-label": t("descendants"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { children: t("descendants") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Issue, { value: state.descendantIssue, t }),
      state.descendants === null ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("treeUnavailable") }) : state.descendants.descendants.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsmm-hint", children: t("emptyDescendants") }) : state.descendants.descendants.map((entry, index) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-availability", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
          t("depth"),
          ": ",
          entry.depth
        ] }),
        entry.kind === "diagnostic" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsmm-issue", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t("diagnostic", { reason: entry.reason }) }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
            t("childId"),
            ": ",
            entry.id
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
            t("parentId"),
            ": ",
            entry.parentSessionId
          ] })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
            t("subtree"),
            ": ",
            t(entry.hasChildren ? "yes" : "no")
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ChildDetails, { child: entry.child, state, actions: props, t, inspection: true })
        ] })
      ] }, index))
    ] })
  ] });
}

// src/client/children-locales.ts
var CHILDREN_NS = "conversation.dsmm-children";
var childrenEn = {
  title: "Deepwork children",
  description: "Observed native runs and child conversations. Refresh for current state; receipts are not completion.",
  refresh: "Refresh",
  reading: "Reading…",
  pending: "Request pending…",
  noSession: "No native session scope. Child controls are unavailable.",
  unavailable: "Observation unavailable. Reconnect and refresh; no action was inferred.",
  stale: "Previous observation only. Refresh before controlling this session.",
  foreign: "This view does not own the current native session scope.",
  session: "Session",
  epoch: "Parent admission epoch",
  runs: "One-shot runs",
  children: "Direct children",
  descendants: "Descendant inspection",
  emptyRuns: "No observed runs.",
  emptyChildren: "No observed direct children.",
  emptyDescendants: "No observed descendants.",
  treeUnavailable: "Descendants unavailable; this is not an empty successful listing.",
  runState: "Last observed run state",
  activity: "Observed residency/activity (not completion)",
  starting: "Starting: native invocation identity has not been published.",
  background: "Move this run to background",
  backgroundHint: "Hands this exact published run to native jobs; does not start another child.",
  role: "Role",
  level: "Invocation level",
  mode: "Mode",
  reportedRoute: "Reported invocation route · compatibility projection, not comparison",
  routeSource: "Invocation route source · compatibility projection",
  routeUnreported: "Not reported; no root-route inference.",
  initialRoute: "Initial route",
  liveRoute: "Latest own native request route",
  routeUnknown: "Unknown",
  initialRouteSource: "Initial route source",
  liveRouteSource: "Latest request route source",
  initialRouteReason: "Initial route unknown reason",
  liveRouteReason: "Latest request route unknown reason",
  comparisonUnobserved: "Route comparison has not been observed. No initial or latest request route is inferred.",
  routeCaptureSource: "Original invocation capture",
  routeOwnHeaderSource: "This child's own native request header",
  routeMissingCapture: "Original invocation capture is missing.",
  routeNoOwnHeader: "No own native request header has been observed yet.",
  routeInvalidOwnHeader: "The observed own native request header is invalid.",
  routeNotObserved: "The child's own native request route was not observed.",
  invocationUnavailable: "Invocation capture unavailable; role and level are not inferred. Native request observation is separate.",
  runId: "Run ID",
  childId: "Child ID",
  jobId: "Job ID",
  toolCallId: "Tool call ID",
  parentId: "Direct parent ID",
  depth: "Depth",
  subtree: "Child catalog contains descendants",
  yes: "Yes",
  no: "No",
  readonly: "Inspection only",
  oneShot: "One-shot children cannot be resumed or messaged.",
  prompt: "Message this child",
  text: "Message",
  delivery: "Delivery",
  queue: "Queue · later turn",
  steer: "Steer · nearest step",
  send: "Send message",
  interrupt: "Request interrupt",
  deliveryHint: "Queue accepts a distinct later turn; Steer targets the nearest step. Idle/cold continuable children keep the same child ID.",
  emptyMessage: "Enter message text or choose an available image before sending.",
  deniedImages: "Images are currently unavailable. Remove picked images to send a text-only message; their bytes are not automatically retried.",
  images: "Add images",
  imagesHint: "PNG, JPEG, WebP or GIF body bytes. Native image/model admission still applies; no durable attachment IDs are supplied.",
  removeImage: "Remove image",
  imageReading: "Reading image bytes…",
  unknown: "Send outcome unknown. Draft retained; do not resend automatically. Check the native child conversation before allowing a new message, which may duplicate an accepted one.",
  acknowledge: "I checked; allow a new message",
  promptAccepted: "Inbox accepted message {id}. Execution is not confirmed.",
  interruptAccepted: "Interrupt request acknowledged. Running/queued work is not reported as completed; queued work remains native-owned.",
  backgroundReceipt: "Transition receipt: {status}; same run {id}.",
  unknownAction: "Outcome unknown; refresh and verify the native run/child before another action.",
  error: "Request unavailable/refused: {code}.",
  field: "Field",
  diagnostic: "Branch diagnostic: {reason}; no successful child result is inferred.",
  backgroundAvailability: "Background handoff",
  promptAvailability: "Human messages",
  interruptAvailability: "Interrupts",
  imageAvailability: "Images",
  enabled: "Available",
  disabled: "Unavailable",
  runtime: "Observed runtime binding",
  fence: "Delivery fence ready",
  restart: "Explicit Host restart required",
  composition: "Explicit DSMM composition is required; UI settings do not replace the Host runtime.",
  duplicate: "Duplicate provider binding; fix explicit composition before restarting.",
  authority: "Host admission authority is not ready.",
  evidence: "Admission evidence",
  captured: "Captured original admission",
  legacy: "Legacy conservative evidence · not full configuration recovery",
  evidenceMissing: "Original admission evidence is unavailable; do not infer it from current root settings.",
  originalEpoch: "Original child epoch",
  proven: "Proven fields",
  limitations: "Evidence limitations",
  noneProven: "No proven fields reported",
  noLimitations: "No additional limitations reported (not a claim of restored configuration).",
  capabilityDenied: "Capability denied",
  nativeDefault: "Native default, not restored",
  displayOnly: "Display-only evidence",
  missingEvidence: "Missing evidence",
  notPersisted: "Not persisted",
  unverified: "Unverified",
  parentDenied: "Current parent denies this capability"
};
var childrenZh = {
  title: "Deepwork 子任务",
  description: "已观察到的原生运行和子会话。刷新以获取现况；回执不代表完成。",
  refresh: "刷新",
  reading: "读取中…",
  pending: "请求处理中…",
  noSession: "没有原生会话作用域，子任务控制不可用。",
  unavailable: "无法观察当前状态。重新连接并刷新；不推断动作结果。",
  stale: "仅显示此前观察。请刷新后再控制当前会话。",
  foreign: "此视图不拥有当前原生会话作用域。",
  session: "会话",
  epoch: "当前父准入 epoch",
  runs: "一次性运行",
  children: "直接子会话",
  descendants: "后代检查",
  emptyRuns: "没有观察到运行。",
  emptyChildren: "没有观察到直接子会话。",
  emptyDescendants: "没有观察到后代。",
  treeUnavailable: "后代列表不可用；这不代表已成功读取空列表。",
  runState: "上次观察的运行状态",
  activity: "已观察驻留/活动状态（非完成）",
  starting: "正在启动：原生调用身份尚未发布。",
  background: "将此运行移交后台",
  backgroundHint: "把此已发布的同一运行移交原生 jobs；不创建另一个子会话。",
  role: "角色",
  level: "调用等级",
  mode: "模式",
  reportedRoute: "报告的调用路由 · 兼容投影，非路由对比",
  routeSource: "调用路由来源 · 兼容投影",
  routeUnreported: "未报告；不推断根会话路由。",
  initialRoute: "初始路由",
  liveRoute: "最近一次自身原生请求路由",
  routeUnknown: "未知",
  initialRouteSource: "初始路由来源",
  liveRouteSource: "最近请求路由来源",
  initialRouteReason: "初始路由未知原因",
  liveRouteReason: "最近请求路由未知原因",
  comparisonUnobserved: "尚未观察到路由对比，不推断初始或最近请求路由。",
  routeCaptureSource: "原始调用捕获",
  routeOwnHeaderSource: "此子会话自身的原生请求 header",
  routeMissingCapture: "缺少原始调用捕获。",
  routeNoOwnHeader: "尚未观察到自身原生请求 header。",
  routeInvalidOwnHeader: "已观察的自身原生请求 header 无效。",
  routeNotObserved: "未观察此子会话自身的原生请求路由。",
  invocationUnavailable: "调用捕获不可用，不推断角色或等级；原生请求观察是独立信息。",
  runId: "Run ID",
  childId: "子会话 ID",
  jobId: "Job ID",
  toolCallId: "工具调用 ID",
  parentId: "直接父会话 ID",
  depth: "深度",
  subtree: "子会话目录含后代",
  yes: "是",
  no: "否",
  readonly: "仅可检查",
  oneShot: "一次性子会话不能恢复或接收续话。",
  prompt: "向此子会话发送消息",
  text: "消息内容",
  delivery: "投递方式",
  queue: "Queue · 后续独立轮次",
  steer: "Steer · 最近步骤边界",
  send: "发送消息",
  interrupt: "请求中断",
  deliveryHint: "Queue 接受新的后续轮次；Steer 在最近步骤边界接收。空闲/冷恢复的 continuable 子会话仍使用同一 ID。",
  emptyMessage: "发送前请输入消息或选择可用图片。",
  deniedImages: "图片目前不可用。移除已选图片后可发送纯文本消息；不自动重试其数据。",
  images: "添加图片",
  imagesHint: "PNG、JPEG、WebP 或 GIF 的真实图片数据。仍由原生图片/模型准入校验；不提供虚构持久 attachment ID。",
  removeImage: "移除图片",
  imageReading: "正在读取图片数据…",
  unknown: "发送结果未知。保留草稿，不自动重发。允许新消息前请检查原生子会话；新发送可能重复已接受的消息。",
  acknowledge: "我已检查，允许新消息",
  promptAccepted: "收件箱已接受消息 {id}；尚未确认执行。",
  interruptAccepted: "中断请求已确认，不表示运行或队列已完成；队列仍由原生系统管理。",
  backgroundReceipt: "移交回执：{status}；同一运行 {id}。",
  unknownAction: "结果未知，请刷新并核实原生运行/子会话后再操作。",
  error: "请求不可用或被拒绝：{code}。",
  field: "字段",
  diagnostic: "分支诊断：{reason}；不推断成功的子会话结果。",
  backgroundAvailability: "后台移交",
  promptAvailability: "用户消息",
  interruptAvailability: "中断",
  imageAvailability: "图片",
  enabled: "可用",
  disabled: "不可用",
  runtime: "已观察运行时绑定",
  fence: "投递隔离已就绪",
  restart: "需要显式重启 Host",
  composition: "需要显式 DSMM 启动组合；UI 设置不能替换 Host 运行时。",
  duplicate: "存在重复 provider 绑定，请修正显式启动组合后再重启。",
  authority: "Host 准入权威尚未就绪。",
  evidence: "准入证据",
  captured: "已捕获原始准入",
  legacy: "旧会话保守证据 · 非完整配置恢复",
  evidenceMissing: "原始准入证据不可用，不从当前根会话设置推断。",
  originalEpoch: "子会话原始 epoch",
  proven: "已证明字段",
  limitations: "证据限制",
  noneProven: "未报告已证明字段",
  noLimitations: "未报告额外限制（不代表配置已恢复）。",
  capabilityDenied: "此能力被拒绝",
  nativeDefault: "使用原生默认值，非已恢复",
  displayOnly: "仅供显示的证据",
  missingEvidence: "缺少证据",
  notPersisted: "未持久化",
  unverified: "尚未验证",
  parentDenied: "当前父会话拒绝此能力"
};
var childDisabledCopy = {
  "module-off": ["Deepwork module is off.", "Deepwork 模块已关闭。"],
  "role-disabled": ["Role is denied by captured/current admission.", "角色被捕获/当前准入拒绝。"],
  "read-only": ["This child is read-only.", "此子会话为只读。"],
  "background-disabled": ["Captured admission does not allow background handoff.", "捕获准入不允许后台移交。"],
  "jobs-unavailable": ["Native jobs are unavailable for this owner.", "此 owner 的原生 jobs 不可用。"],
  "starting": ["Native run identity has not been published.", "原生 run 身份尚未发布。"],
  "already-background": ["This run already belongs to native background jobs.", "此运行已由原生后台 jobs 管理。"],
  "already-settled": ["This run is already settled.", "此运行已经结束。"],
  cancelled: ["This run was cancelled and cannot be revived.", "此运行已取消，不能复活。"],
  "one-shot": ["One-shot children cannot receive follow-up messages.", "一次性子会话不能接收续话。"],
  "unknown-mode": ["Child mode is unverified.", "子会话模式未验证。"],
  "not-direct-child": ["Only the exact direct parent can control this child.", "只有精确的直接父会话可控制此子会话。"],
  "delivery-fence-unavailable": ["Managed delivery fencing is unavailable; fix explicit Host composition.", "受管投递隔离不可用，请修正显式 Host 启动组合。"],
  "evidence-unavailable": ["Required original admission evidence is unavailable.", "必需的原始准入证据不可用。"],
  "legacy-capability-denied": ["Legacy evidence does not prove this capability.", "旧会话证据无法证明此能力。"],
  unavailable: ["Capability unavailable. Refresh after reconnecting.", "此能力不可用。重新连接后刷新。"]
};
var childrenLocaleEn = { ...childrenEn, ...Object.fromEntries(Object.entries(childDisabledCopy).map(([reason, copy]) => [`reason:${reason}`, copy[0]])) };
var childrenLocaleZh = { ...childrenZh, ...Object.fromEntries(Object.entries(childDisabledCopy).map(([reason, copy]) => [`reason:${reason}`, copy[1]])) };

// src/client/index.ts
var inject = ["slots", "locale", "remote"];
async function apply(ctx) {
  await ctx.remote.$mount(TYPERT_REMOTE);
  await ctx.remote.$mount(ROLE_CONTROL_REMOTE);
  let deployment = null;
  let profiles = null;
  let children = null;
  const observeChildAdmission = () => {
    const session = profiles?.store.getSnapshot().session;
    if (session !== null && session !== void 0) children?.observeAdmission(session.sessionId, session.admissionEpoch);
  };
  await ctx.inject(["remote.dsmmChildren"], (childCtx) => {
    const controller = new ChildrenController(childCtx.remote.dsmmChildren);
    children = controller;
    childCtx.effect(() => () => {
      children = null;
      controller.dispose();
    }, "dsmm: child controls");
    childCtx.effect(() => childCtx.locale.register(CHILDREN_NS, { en: childrenLocaleEn, zh: childrenLocaleZh }), "dsmm: child locale");
    childCtx.effect(() => {
      const style = document.createElement("style");
      style.dataset.dsmmChildren = "";
      style.textContent = PROFILE_STYLES;
      document.head.append(style);
      return () => style.remove();
    }, "dsmm: child styles");
    const t = childCtx.locale.bind(CHILDREN_NS);
    childCtx.slots.inject("conversation.view", () => childCtx.slots.register({
      name: "conversation.view",
      id: "dsmm-children",
      order: 30,
      label: () => t("title"),
      locale: CHILDREN_NS,
      inject: () => ({ hooks: { children: controller.store }, ...controller.actions })
    }, ChildrenPanel));
    void childCtx.inject(["connection"], (connectionCtx) => {
      const handle = connectionCtx.connection;
      const update = () => {
        const generation = handle.generation.getSnapshot();
        controller.bindConnection(generation === void 0 ? null : handle, generation);
      };
      update();
      connectionCtx.effect(() => handle.generation.subscribe(update));
      connectionCtx.effect(() => () => controller.bindConnection(null), "dsmm: child connection withdrawal");
    });
    void childCtx.inject(["uiSession", "sessions"], (sessionCtx) => {
      const source = sessionCtx.uiSession.adapter.current, nativeSessions = sessionCtx.sessions;
      const update = () => {
        const id2 = source.getSnapshot().key;
        controller.bindScope(id2 ?? null, id2 === void 0 ? null : nativeSessions.binding(id2) ?? null);
        observeChildAdmission();
      };
      update();
      sessionCtx.effect(() => source.subscribe(update));
      sessionCtx.effect(() => () => controller.bindScope(null, null), "dsmm: child session withdrawal");
    });
    observeChildAdmission();
  });
  await ctx.inject(["remote.dsmmConfig"], (coreCtx) => {
    const core = new DeploymentController(coreCtx.remote.dsmmConfig, "global");
    void coreCtx.inject(["connection"], (connectionCtx) => {
      core.bindConnection(connectionCtx.connection.generation);
      void core.refresh();
    });
    deployment = core;
    if (profiles !== null) core.setSession(profiles.store.getSnapshot().session);
    coreCtx.effect(() => () => {
      deployment = null;
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
    const t = coreCtx.locale.bind(DEPLOYMENT_NS);
    const inject2 = () => ({ core, remote: coreCtx.remote.dsmmConfig });
    coreCtx.slots.inject("plugins.item", () => coreCtx.slots.register({ name: "plugins.item", id: "dsmm", label: () => t("title"), order: 30, locale: DEPLOYMENT_NS, inject: inject2 }, DeploymentPage));
    void coreCtx.inject(["configForms"], (formCtx) => {
      const injectProfile = () => ({ ...inject2(), forms: formCtx.configForms, profilePage: true });
      formCtx.slots.inject("plugins.bundle.config", () => formCtx.slots.register({ name: "plugins.bundle.config", key: "@dsmm/dsmm", locale: DEPLOYMENT_NS, inject: injectProfile }, DeploymentPage));
      let namespace = null, disposeRow;
      const registerRow = () => {
        const next = core.getSnapshot().snapshot?.namespace ?? null;
        if (next === namespace) return;
        disposeRow?.();
        namespace = next;
        if (next !== null) disposeRow = formCtx.slots.inject("plugins.row.config", () => formCtx.slots.register({ name: "plugins.row.config", key: `@dsmm/dsmm#${next}`, locale: DEPLOYMENT_NS, inject: () => ({ ...injectProfile(), rowNamespace: next }) }, DeploymentPage));
      };
      registerRow();
      formCtx.effect(() => core.subscribe(registerRow));
      formCtx.effect(() => () => disposeRow?.());
    });
    void core.refresh();
  });
  await ctx.inject(["remote.dsmmProfiles"], (profileCtx) => {
    const controller = new ProfilesController(profileCtx.remote.dsmmProfiles);
    profiles = controller;
    profileCtx.effect(() => controller.store.subscribe(() => {
      deployment?.setSession(controller.store.getSnapshot().session);
      observeChildAdmission();
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
