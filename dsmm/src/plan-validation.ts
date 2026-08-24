import { readFileSync } from "node:fs";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import type { DshPreToolDecision, DshToolExecution } from "./dsh-types.js";

const GUARD_PREFIX = "[dsmm safety]";
const PLAN_PATH_PATTERN = /^(?:docs\/superpowers\/plans|\.omo\/plans)\/[^/]+\.md$/iu;
const PLAN_PATH_SUFFIX_PATTERN = /(?:^|\/)(?:docs\/superpowers\/plans|\.omo\/plans)\/[^/]+\.md$/iu;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringField(value: unknown, keys: readonly string[]): string | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;

  for (const key of keys) {
    if (typeof record[key] === "string") return record[key];
  }

  return undefined;
}

function normalizedPath(path: string): string {
  return path.replace(/\\/gu, "/");
}

function hasPlanPathSuffix(path: string): boolean {
  return PLAN_PATH_SUFFIX_PATTERN.test(posix.normalize(normalizedPath(path)));
}

function isOutside(cwd: string, target: string): boolean {
  const targetRelative = relative(cwd, target);
  return isAbsolute(targetRelative) || targetRelative === ".." || targetRelative.startsWith(`..${sep}`);
}

function malformedChecklistLine(content: string): string | undefined {
  return content.split(/\r?\n/u).find((line) => {
    const token = /^\s*[-*]\s+(\[[^\]\r\n]*(?:\]|$))/u.exec(line)?.[1];
    return token !== undefined && !/^\[(?: |x|X)\]$/u.test(token);
  });
}

function malformedChecklistDecision(content: string): DshPreToolDecision | undefined {
  const malformed = malformedChecklistLine(content);
  if (malformed === undefined) return undefined;
  return {
    kind: "deny",
    reason: `${GUARD_PREFIX} plan file contains a malformed checklist entry: ${malformed.trim()}`
  };
}

function countMatches(content: string, search: string): number {
  let count = 0;
  let start = 0;

  while (start <= content.length - search.length) {
    const match = content.indexOf(search, start);
    if (match === -1) break;
    count += 1;
    start = match + search.length;
  }

  return count;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateWrite(arguments_: Record<string, unknown>): DshPreToolDecision | undefined {
  if (typeof arguments_.content !== "string") {
    return { kind: "deny", reason: `${GUARD_PREFIX} cannot validate plan write: content must be a string` };
  }
  return malformedChecklistDecision(arguments_.content);
}

function validateEdit(suppliedPath: string, target: string, arguments_: Record<string, unknown>): DshPreToolDecision | undefined {
  if (typeof arguments_.old_string !== "string" || arguments_.old_string === "") {
    return { kind: "deny", reason: `${GUARD_PREFIX} cannot validate plan edit for ${suppliedPath}: old_string must be non-empty` };
  }
  if (typeof arguments_.new_string !== "string") {
    return { kind: "deny", reason: `${GUARD_PREFIX} cannot validate plan edit for ${suppliedPath}: new_string must be a string` };
  }
  if (arguments_.replace_all !== undefined && typeof arguments_.replace_all !== "boolean") {
    return { kind: "deny", reason: `${GUARD_PREFIX} cannot validate plan edit for ${suppliedPath}: replace_all must be boolean` };
  }

  let current: string;
  try {
    current = readFileSync(target, "utf8");
  } catch (error) {
    return { kind: "deny", reason: `${GUARD_PREFIX} cannot read plan edit target ${suppliedPath}: ${errorMessage(error)}` };
  }

  const matchCount = countMatches(current, arguments_.old_string);
  let finalDocument: string;
  if (arguments_.replace_all === true) {
    if (matchCount === 0) {
      return { kind: "deny", reason: `${GUARD_PREFIX} cannot reconstruct plan edit for ${suppliedPath}: old_string was not found` };
    }
    finalDocument = current.split(arguments_.old_string).join(arguments_.new_string);
  } else {
    if (matchCount !== 1) {
      return { kind: "deny", reason: `${GUARD_PREFIX} cannot reconstruct plan edit for ${suppliedPath}: expected exactly one old_string match, found ${String(matchCount)}` };
    }
    const match = current.indexOf(arguments_.old_string);
    finalDocument = `${current.slice(0, match)}${arguments_.new_string}${current.slice(match + arguments_.old_string.length)}`;
  }

  return malformedChecklistDecision(finalDocument);
}

export function validatePlanMutation(exec: DshToolExecution): DshPreToolDecision | undefined {
  const name = exec.name.toLowerCase();
  if (name !== "write" && name !== "edit") return undefined;

  const arguments_ = asRecord(exec.arguments);
  const suppliedPath = stringField(arguments_, ["file_path", "path"]);
  if (arguments_ === undefined || suppliedPath === undefined) return undefined;

  const cwd = resolve(exec.agent?.session.header?.cwd ?? process.cwd());
  const target = resolve(cwd, suppliedPath);
  if (isOutside(cwd, target)) {
    if (!hasPlanPathSuffix(suppliedPath)) return undefined;
    return { kind: "deny", reason: `${GUARD_PREFIX} cannot validate plan target outside session cwd: ${suppliedPath}` };
  }

  const targetRelative = normalizedPath(relative(cwd, target));
  if (!PLAN_PATH_PATTERN.test(targetRelative)) return undefined;
  return name === "write" ? validateWrite(arguments_) : validateEdit(suppliedPath, target, arguments_);
}
