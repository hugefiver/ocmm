import type { ZodType } from "zod"

type PathSegment = string | number
type Issue = {
  path: readonly PropertyKey[]
  code?: string
  errors?: readonly (readonly Issue[])[]
}

export type TolerantParseLayer = {
  value: unknown
  profileOverlay?: boolean
}

export type TolerantParseResult<T> =
  | { success: true; data: T }
  | { success: false; issues: readonly Issue[] }

export type TolerantParseLayersResult<T> =
  | { success: true; data: T; layers: TolerantParseLayer[] }
  | { success: false; issues: readonly Issue[] }

/**
 * Parse a JSON-object-like config value while retaining valid siblings.
 *
 * Each retry removes the deepest invalid field or array element identified
 * by Zod. If that terminal field was already removed, the closest surviving
 * parent entry is removed instead. Zod applies defaults on the successful
 * parse after the invalid input has been discarded.
 */
export function tolerantParse<T>(schema: ZodType<T>, value: unknown): TolerantParseResult<T> {
  let result = schema.safeParse(value)
  if (result.success) return result
  if (!isPlainObject(value)) return { success: false, issues: result.error.issues }

  const candidate = cloneValue(value) as Record<string, unknown>
  while (!result.success) {
    if (!discardIssues([candidate], result.error.issues)) {
      return { success: false, issues: result.error.issues }
    }
    result = schema.safeParse(candidate)
  }
  return result
}

/**
 * Parse layered config inputs without letting an invalid override erase a
 * valid lower-priority value. The merge callback is invoked again after every
 * removal, so each discarded value behaves exactly as if its layer omitted it.
 */
export function tolerantParseLayers<T>(
  schema: ZodType<T>,
  layers: readonly TolerantParseLayer[],
  merge: (layers: readonly TolerantParseLayer[]) => unknown,
): TolerantParseLayersResult<T> {
  const candidates: TolerantParseLayer[] = layers.map((layer) => ({ ...layer, value: cloneValue(layer.value) }))
  let result = schema.safeParse(merge(candidates))
  while (!result.success) {
    if (discardIssues(candidates.map(({ value }) => value), result.error.issues)) {
      result = schema.safeParse(merge(candidates))
      continue
    }
    if (!hasRootIssue(result.error.issues) || !clearHighestPriorityLayer(candidates)) {
      return { success: false, issues: result.error.issues }
    }
    result = schema.safeParse(merge(candidates))
  }
  return { success: true, data: result.data, layers: candidates }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]))
}

function discardIssues(values: readonly unknown[], issues: readonly Issue[]): boolean {
  const paths = issues
    .flatMap((issue) => issuePaths(issue))
    .sort((left, right) => right.length - left.length)

  for (const path of paths) {
    for (let index = values.length - 1; index >= 0; index--) {
      if (discardAtPath(values[index], path)) return true
    }
  }

  let fallback: { value: unknown; path: readonly PathSegment[]; layer: number } | undefined
  for (const path of paths) {
    for (let length = path.length - 1; length > 0; length--) {
      const parentPath = path.slice(0, length)
      for (let index = values.length - 1; index >= 0; index--) {
        if (!canDiscardAtPath(values[index], parentPath)) continue
        if (
          !fallback
          || parentPath.length > fallback.path.length
          || (parentPath.length === fallback.path.length && index > fallback.layer)
        ) {
          fallback = { value: values[index], path: parentPath, layer: index }
        }
      }
    }
  }
  if (fallback) return discardAtPath(fallback.value, fallback.path)
  return false
}

function hasRootIssue(issues: readonly Issue[]): boolean {
  return issues.some((issue) => issue.path.length === 0)
}

function clearHighestPriorityLayer(layers: TolerantParseLayer[]): boolean {
  for (let index = layers.length - 1; index >= 0; index--) {
    if (isEmptyLayer(layers[index].value)) continue
    layers[index].value = undefined
    return true
  }
  return false
}

function isEmptyLayer(value: unknown): boolean {
  if (value === undefined) return true
  return isPlainObject(value) && Object.keys(value).length === 0
}

function isPathSegment(segment: PropertyKey): segment is PathSegment {
  return typeof segment === "string" || typeof segment === "number"
}

function issuePaths(issue: Issue, prefix: readonly PathSegment[] = []): PathSegment[][] {
  const path = asPath(issue.path)
  if (!path) return []
  const fullPath = [...prefix, ...path]
  if (issue.code === "invalid_union" && issue.errors) {
    const nested = issue.errors.flatMap((branch) => branch.flatMap((child) => issuePaths(child, fullPath)))
    if (nested.length > 0) return nested
  }
  return [fullPath]
}

function asPath(path: readonly PropertyKey[]): PathSegment[] | undefined {
  if (!path.every(isPathSegment)) return undefined
  return path as PathSegment[]
}

function canDiscardAtPath(value: unknown, path: readonly PathSegment[]): boolean {
  return parentAtPath(value, path) !== undefined
}

function discardAtPath(value: unknown, path: readonly PathSegment[]): boolean {
  const parentAndTarget = parentAtPath(value, path)
  if (!parentAndTarget) return false

  if (typeof parentAndTarget.target === "number") {
    const parent = parentAndTarget.parent as unknown[]
    parent.splice(parentAndTarget.target, 1)
    return true
  }
  delete (parentAndTarget.parent as Record<string, unknown>)[parentAndTarget.target]
  return true
}

function parentAtPath(
  value: unknown,
  path: readonly PathSegment[],
): { parent: unknown[]; target: number } | { parent: Record<string, unknown>; target: string } | undefined {
  const target = path.at(-1)
  if (target === undefined) return undefined

  let parent: unknown = value
  for (const segment of path.slice(0, -1)) {
    parent = getChild(parent, segment)
    if (parent === undefined) return undefined
  }

  if (Array.isArray(parent)) {
    if (typeof target !== "number" || !Number.isInteger(target) || target < 0 || target >= parent.length) return undefined
    return { parent, target }
  }
  if (!isPlainObject(parent) || !Object.hasOwn(parent, String(target))) return undefined
  return { parent, target: String(target) }
}

function getChild(value: unknown, segment: PathSegment): unknown {
  if (Array.isArray(value)) {
    if (typeof segment !== "number" || !Number.isInteger(segment) || segment < 0 || segment >= value.length) return undefined
    return value[segment]
  }
  if (!isPlainObject(value) || !Object.hasOwn(value, String(segment))) return undefined
  return value[String(segment)]
}
