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

export function patchTopLevelScalar(
  source: string,
  key: string,
  value: string | number | boolean | null,
): string {
  // Regex: a line whose only top-level content is "key": <scalar>.
  // Handles leading block comments (/* ... */) before the key and trailing
  // content (comments) after the value+comma on the same line.
  // Groups: 1=leading ws+comments, 2=value, 3=comma, 4=rest of line
  const keyPattern = new RegExp(
    `^(\\s*(?:\\/\\*[^*]*\\*+(?:[^/*][^*]*\\*+)*\\/\\s*)*)"${key}"\\s*:\\s*([^\\n,}]+)(,?)([^\\n]*)$`,
    "m",
  )
  const match = source.match(keyPattern)
  if (value !== null) {
    // Set (insert or replace).
    const serialized = serializeValue(value)
    if (match) {
      const replacement = `${match[1]}"${key}": ${serialized}${match[3]}${match[4]}`
      const result = source.replace(keyPattern, replacement)
      validateJsonc(result, key)
      return result
    }
    // Insert before final closing brace.
    return insertField(source, key, serialized)
  }
  // Remove.
  if (!match) {
    // Nothing to remove; return unchanged.
    return source
  }
  return removeLine(source, match[0], key)
}

function insertField(source: string, key: string, serializedValue: string): string {
  // Find the last top-level closing brace (naive: last `}` in file).
  const closeIdx = source.lastIndexOf("}")
  if (closeIdx < 0) throw new PatchError("no closing brace found")
  let before = source.slice(0, closeIdx)
  const after = source.slice(closeIdx)
  // Determine if we need a leading comma: scan backward for non-whitespace.
  let i = before.length - 1
  while (i >= 0 && /\s/.test(before[i]!)) i--
  const needsComma = i >= 0 && before[i] !== "{" && before[i] !== ","
  // Preserve indentation: match the indentation of the last property line if possible.
  const indent = detectIndent(source)

  // If a comma is needed, append it right after the last non-whitespace character
  // (the end of the last property value), before the trailing whitespace.
  if (needsComma) {
    before = before.slice(0, i + 1) + ","
  }

  const insertion = `\n${indent}"${key}": ${serializedValue}`
  const result = before + insertion + after
  validateJsonc(result, key)
  return result
}

function removeLine(source: string, line: string, key: string): string {
  // Remove the matched line plus its trailing newline.
  const withNewline = line.endsWith("\n") ? line : line + "\n"
  let result = source.replace(withNewline, "")
  // Handle dangling comma: if the removed line was the last property, the
  // preceding property may now have a trailing comma before `}`.
  const closeIdx = result.lastIndexOf("}")
  if (closeIdx > 0) {
    let i = closeIdx - 1
    while (i >= 0 && /\s/.test(result[i]!)) i--
    if (i >= 0 && result[i] === ",") {
      result = result.slice(0, i) + result.slice(i + 1)
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
