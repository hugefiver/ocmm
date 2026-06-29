/**
 * Minimal comment-preserving patcher for top-level scalar fields in JSONC.
 *
 * Supports setting or removing a single top-level string/number/boolean field
 * without rewriting the whole file. Intended for `activeProfile`.
 * Does NOT handle nested keys, arrays, or objects.
 *
 * On structural surprise, throws PatchError; caller falls back to full rewrite.
 */
export class PatchError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = "PatchError"
  }
}

/** Strip // line and /* block comments + trailing commas for validation only. */
function stripJsonc(input: string): string {
  let out = ""
  let i = 0
  let inStr: '"' | "'" | null = null
  while (i < input.length) {
    const c = input[i]
    if (inStr) {
      out += c
      if (c === "\\" && i + 1 < input.length) {
        out += input[i + 1]
        i += 2
        continue
      }
      if (c === inStr) inStr = null
      i++
      continue
    }
    if (c === '"' || c === "'") {
      inStr = c as '"' | "'"
      out += c
      i++
      continue
    }
    if (c === "/" && input[i + 1] === "/") {
      const nl = input.indexOf("\n", i + 2)
      i = nl < 0 ? input.length : nl
      continue
    }
    if (c === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2)
      i = end < 0 ? input.length : end + 2
      continue
    }
    out += c
    i++
  }
  return out.replace(/,(\s*[}\]])/g, "$1")
}

function serializeValue(value: string | number | boolean): string {
  if (typeof value === "string") return JSON.stringify(value)
  return String(value)
}

/** Skip leading whitespace; return index of first non-ws char. */
function scanValueStart(src: string, start: number): number {
  let i = start
  while (i < src.length && /[ \t]/.test(src[i]!)) i++
  return i
}

/**
 * Scan a scalar value (string, number, boolean, null) starting at position
 * `start` (must point at the first char of the value, not whitespace).
 * Returns the index just past the value (i.e., the next structural char:
 * comma, newline, or closing brace — outside strings/comments).
 *
 * String- and comment-aware: commas/braces inside string literals or
 * comments do not terminate the scan.
 */
function scanScalarEnd(src: string, start: number): number {
  let i = start
  if (i >= src.length) return i
  const c = src[i]!
  if (c === '"' || c === "'") {
    const quote = c
    i++
    while (i < src.length) {
      const ch = src[i]!
      if (ch === "\\" && i + 1 < src.length) {
        i += 2
        continue
      }
      if (ch === quote) {
        i++
        return i
      }
      i++
    }
    return i
  }
  while (i < src.length) {
    const ch = src[i]!
    if (ch === "," || ch === "\n" || ch === "\r" || ch === "}") return i
    if (ch === "/" && src[i + 1] === "/") return i
    if (ch === "/" && src[i + 1] === "*") return i
    i++
  }
  return i
}

export function patchTopLevelScalar(
  source: string,
  key: string,
  value: string | number | boolean | null,
): string {
  // Locate the top-level "key": <scalar> line via a char-aware scan.
  // We find the key as a JSON property name at depth 1 (not inside nested
  // objects/arrays or strings/comments), then scan its value.
  const found = findTopLevelKey(source, key)
  if (value !== null) {
    const serialized = serializeValue(value)
    if (found) {
      // Replace the value region [valueStart, valueEnd) with serialized.
      const before = source.slice(0, found.valueStart)
      const after = source.slice(found.valueEnd)
      const result = before + serialized + after
      validateJsonc(result, key)
      return result
    }
    return insertField(source, key, serialized)
  }
  // Remove.
  if (!found) return source
  return removeLine(source, found.lineStart, found.lineEnd, key)
}

interface KeyLocation {
  /** Index of the start of the line containing the key (for removal). */
  lineStart: number
  /** Index just past the end of the line (including newline) containing the key. */
  lineEnd: number
  /** Index where the value starts (after `": `). */
  valueStart: number
  /** Index just past the value (structural terminator position). */
  valueEnd: number
}

/**
 * Find a top-level property `key` in the JSONC source. Returns its location
 * or null if not found. Uses a depth-tracking, string/comment-aware scan.
 *
 * Key insight: at depth 1, a `"` could be either a property key or a string
 * value. We check for the `"key":` pattern *before* entering string-scan mode;
 * if it doesn't match a key, we treat it as a string value and skip to its
 * closing quote.
 */
function findTopLevelKey(src: string, key: string): KeyLocation | null {
  let i = 0
  let depth = 0
  const keyQuoted = `"${key}"`
  while (i < src.length) {
    const c = src[i]!
    // Comment skipping.
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i + 2)
      i = nl < 0 ? src.length : nl + 1
      continue
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2)
      i = end < 0 ? src.length : end + 2
      continue
    }
    if (c === "{" || c === "[") {
      depth++
      i++
      continue
    }
    if (c === "}" || c === "]") {
      depth--
      i++
      continue
    }
    // At depth 1, check if this is our target key before treating " as string.
    if (depth === 1 && c === '"' && src.startsWith(keyQuoted, i)) {
      // Verify it's a key (followed by optional ws + colon).
      let j = i + keyQuoted.length
      while (j < src.length && /[ \t]/.test(src[j]!)) j++
      if (src[j] === ":") {
        j++
        const lineStart = src.lastIndexOf("\n", i) + 1
        const valueStart = scanValueStart(src, j)
        const valueEnd = scanScalarEnd(src, valueStart)
        let nl = src.indexOf("\n", valueEnd)
        if (nl < 0) nl = src.length
        else nl++
        return { lineStart, lineEnd: nl, valueStart, valueEnd }
      }
    }
    // If it's a string (key or value) that isn't our target, skip to closing quote.
    if (c === '"' || c === "'") {
      const quote = c
      i++
      while (i < src.length) {
        const ch = src[i]!
        if (ch === "\\" && i + 1 < src.length) {
          i += 2
          continue
        }
        if (ch === quote) break
        i++
      }
      i++
      continue
    }
    i++
  }
  return null
}

/**
 * Find the position of the last non-whitespace, non-comment character before
 * `closeIdx` in the source. Used to decide whether a comma is needed when
 * inserting a new field before the closing brace.
 *
 * Comment-aware: skips // line comments and /* block comments.
 */
function lastSignificantCharBefore(src: string, closeIdx: number): number {
  let i = closeIdx - 1
  while (i >= 0) {
    const c = src[i]!
    if (/[ \t\n\r]/.test(c)) {
      i--
      continue
    }
    // Skip back over a line comment: // ... \n
    if (c === "\n") {
      i--
      continue
    }
    // Check if we're inside a line comment: scan back for // on this line.
    const lineStart = src.lastIndexOf("\n", i) + 1
    const lineText = src.slice(lineStart, i + 1)
    const lineCommentIdx = lineText.lastIndexOf("//")
    if (lineCommentIdx >= 0) {
      // Everything from // to end of line is a comment.
      i = lineStart + lineCommentIdx - 1
      continue
    }
    // Check if we're inside a block comment: /* ... */
    // Scan back for the nearest /* before this position that isn't closed.
    const blockEnd = src.lastIndexOf("*/", i)
    if (blockEnd >= 0 && blockEnd < i) {
      // Is there an opening /* before this */ without another */ between?
      // Simplify: find the /* that pairs with this */.
      const blockStart = src.lastIndexOf("/*", blockEnd)
      if (blockStart >= 0) {
        // If our position i is between blockStart and blockEnd+2, we're in the comment.
        if (i >= blockStart && i < blockEnd + 2) {
          i = blockStart - 1
          continue
        }
      }
    }
    return i
  }
  return -1
}

function insertField(source: string, key: string, serializedValue: string): string {
  const closeIdx = source.lastIndexOf("}")
  if (closeIdx < 0) throw new PatchError("no closing brace found")

  // Find the last significant (non-ws, non-comment) char before the close.
  const lastIdx = lastSignificantCharBefore(source, closeIdx)
  const indent = detectIndent(source)

  // Strategy: insert `,"<key>": <value>` right after lastIdx (if comma needed),
  // then let the existing whitespace/newline before `}` carry the new field
  // onto its own line. If lastIdx is the opening `{` (empty-ish object),
  // no comma needed; insert the field on a new line with proper indent.
  let insertionPoint: number
  let insertion: string
  if (lastIdx >= 0 && source[lastIdx] !== "{" && source[lastIdx] !== ",") {
    // Need a comma. Insert right after the last significant char.
    insertionPoint = lastIdx + 1
    // After the comma, add a newline + indent + the field. The existing
    // content between lastIdx+1 and closeIdx (whitespace/comments/newline)
    // follows the insertion, so we end up with: lastChar , \n indent field <existing-ws> }
    insertion = `,\n${indent}"${key}": ${serializedValue}`
  } else if (lastIdx >= 0 && (source[lastIdx] === "{" || source[lastIdx] === ",")) {
    // Object already has content ending in a comma or opening brace; no new comma.
    insertionPoint = lastIdx + 1
    insertion = `\n${indent}"${key}": ${serializedValue}`
  } else {
    // Empty object `{}` or `{  }`.
    insertionPoint = closeIdx
    insertion = `\n${indent}"${key}": ${serializedValue}\n`
  }

  const result = source.slice(0, insertionPoint) + insertion + source.slice(insertionPoint)
  validateJsonc(result, key)
  return result
}

function removeLine(
  source: string,
  lineStart: number,
  lineEnd: number,
  key: string,
): string {
  let result = source.slice(0, lineStart) + source.slice(lineEnd)
  // Handle dangling comma: if the removed line was the last property, the
  // preceding property may now have a trailing comma before `}`.
  const closeIdx = result.lastIndexOf("}")
  if (closeIdx > 0) {
    const lastIdx = lastSignificantCharBefore(result, closeIdx)
    if (lastIdx >= 0 && result[lastIdx] === ",") {
      result = result.slice(0, lastIdx) + result.slice(lastIdx + 1)
    }
  }
  validateJsonc(result, key)
  return result
}

function detectIndent(source: string): string {
  const m = source.match(/\n([ \t]+)"[^"]+"\s*:/)
  return m ? m[1]! : "  "
}

function validateJsonc(text: string, key: string): void {
  try {
    JSON.parse(stripJsonc(text)) as Record<string, unknown>
  } catch (err) {
    throw new PatchError(`patching "${key}" produced invalid JSONC: ${(err as Error).message}`)
  }
}
