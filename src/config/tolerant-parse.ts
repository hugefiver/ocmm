import type { ZodType } from "zod"

type PathSegment = string | number
type ArrayIndexTracker = WeakMap<unknown[], number[]>
type Issue = {
  path: readonly PropertyKey[]
  code?: string
  keys?: readonly string[]
  errors?: readonly (readonly Issue[])[]
}

export type RemovedUnknownKey = {
  path: readonly (string | number)[]
  layer?: number
}

export type TolerantParseLayer = {
  value: unknown
  profileOverlay?: boolean
}

export type TolerantParseResult<T> =
  | { success: true; data: T; unknownKeys: readonly RemovedUnknownKey[] }
  | { success: false; issues: readonly Issue[]; unknownKeys: readonly RemovedUnknownKey[] }

export type TolerantParseLayersResult<T> =
  | { success: true; data: T; layers: TolerantParseLayer[]; unknownKeys: readonly RemovedUnknownKey[] }
  | { success: false; issues: readonly Issue[]; unknownKeys: readonly RemovedUnknownKey[] }

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
  if (result.success) {
    return { success: true, data: result.data, unknownKeys: silentUnknownKeys(value, result.data) }
  }
  const unknownKeys: RemovedUnknownKey[] = []
  if (!isPlainObject(value)) return { success: false, issues: result.error.issues, unknownKeys }

  const arrayIndices: ArrayIndexTracker = new WeakMap()
  const candidate = cloneValue(value, arrayIndices) as Record<string, unknown>
  while (!result.success) {
    if (!discardIssues([candidate], [arrayIndices], result.error.issues, unknownKeys, false)) {
      return { success: false, issues: result.error.issues, unknownKeys: dedupeUnknownKeys(unknownKeys) }
    }
    result = schema.safeParse(candidate)
  }
  unknownKeys.push(...silentUnknownKeys(candidate, result.data, arrayIndices))
  return { success: true, data: result.data, unknownKeys: dedupeUnknownKeys(unknownKeys) }
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
  const arrayIndices = layers.map((): ArrayIndexTracker => new WeakMap())
  const candidates: TolerantParseLayer[] = layers.map((layer, index) => ({
    ...layer,
    value: cloneValue(layer.value, arrayIndices[index]),
  }))
  const unknownKeys: RemovedUnknownKey[] = []
  let result = schema.safeParse(merge(candidates))
  while (!result.success) {
    if (discardIssues(
      candidates.map(({ value }) => value),
      arrayIndices,
      result.error.issues,
      unknownKeys,
      true,
    )) {
      result = schema.safeParse(merge(candidates))
      continue
    }
    if (!hasRootIssue(result.error.issues) || !clearHighestPriorityLayer(candidates)) {
      return { success: false, issues: result.error.issues, unknownKeys: dedupeUnknownKeys(unknownKeys) }
    }
    result = schema.safeParse(merge(candidates))
  }
  const merged = merge(candidates)
  for (const removed of silentUnknownKeys(merged, result.data)) {
    const layer = highestLayerContainingPath(candidates, removed.path)
    unknownKeys.push(layer === undefined
      ? removed
      : { path: originalPathAtValue(candidates[layer].value, removed.path, arrayIndices[layer]), layer })
  }
  return { success: true, data: result.data, layers: candidates, unknownKeys: dedupeUnknownKeys(unknownKeys) }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function cloneValue(value: unknown, arrayIndices?: ArrayIndexTracker): unknown {
  if (Array.isArray(value)) {
    const cloned = value.map((child) => cloneValue(child, arrayIndices))
    arrayIndices?.set(cloned, value.map((_, index) => index))
    return cloned
  }
  if (!isPlainObject(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child, arrayIndices)]))
}

function discardIssues(
  values: readonly unknown[],
  arrayIndices: readonly ArrayIndexTracker[],
  issues: readonly Issue[],
  unknownKeys: RemovedUnknownKey[],
  includeLayer: boolean,
): boolean {
  const unknownPaths = unknownIssuePaths(issues).sort((left, right) => right.length - left.length)
  for (const path of unknownPaths) {
    for (let index = values.length - 1; index >= 0; index--) {
      const reportedPath = originalPathAtValue(values[index], path, arrayIndices[index])
      if (!discardAtPath(values[index], path, arrayIndices[index])) continue
      if (!path.some((segment) => typeof segment === "string" && isUnsafeObjectKey(segment))) {
        unknownKeys.push(includeLayer ? { path: reportedPath, layer: index } : { path: reportedPath })
      }
      return true
    }
  }

  const paths = issues
    .flatMap((issue) => issuePaths(issue))
    .sort((left, right) => right.length - left.length)

  for (const path of paths) {
    for (let index = values.length - 1; index >= 0; index--) {
      if (discardAtPath(values[index], path, arrayIndices[index])) return true
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
  if (fallback) return discardAtPath(fallback.value, fallback.path, arrayIndices[fallback.layer])
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
  if (issue.code === "unrecognized_keys") return []
  if (issue.code === "invalid_union" && issue.errors) {
    const nested = issue.errors.flatMap((branch) => branch.flatMap((child) => issuePaths(child, fullPath)))
    if (nested.length > 0) return nested
  }
  return [fullPath]
}

function unknownIssuePaths(issues: readonly Issue[], prefix: readonly PathSegment[] = []): PathSegment[][] {
  return issues.flatMap((issue) => {
    const path = asPath(issue.path)
    if (!path) return []
    const fullPath = [...prefix, ...path]
    if (issue.code === "unrecognized_keys") {
      return (issue.keys ?? []).map((key) => [...fullPath, key])
    }
    if (issue.code !== "invalid_union" || !issue.errors) return []

    const viableBranch = issue.errors.find((branch) => branch.length > 0 && branch.every(containsOnlyUnknownIssues))
    return viableBranch ? unknownIssuePaths(viableBranch, fullPath) : []
  })
}

function containsOnlyUnknownIssues(issue: Issue): boolean {
  if (issue.code === "unrecognized_keys") return true
  return issue.code === "invalid_union"
    && issue.errors !== undefined
    && issue.errors.some((branch) => branch.length > 0 && branch.every(containsOnlyUnknownIssues))
}

function asPath(path: readonly PropertyKey[]): PathSegment[] | undefined {
  if (!path.every(isPathSegment)) return undefined
  return path as PathSegment[]
}

function canDiscardAtPath(value: unknown, path: readonly PathSegment[]): boolean {
  return parentAtPath(value, path) !== undefined
}

function discardAtPath(value: unknown, path: readonly PathSegment[], arrayIndices?: ArrayIndexTracker): boolean {
  const parentAndTarget = parentAtPath(value, path)
  if (!parentAndTarget) return false

  if (typeof parentAndTarget.target === "number") {
    const parent = parentAndTarget.parent as unknown[]
    arrayIndices?.get(parent)?.splice(parentAndTarget.target, 1)
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

function silentUnknownKeys(
  input: unknown,
  output: unknown,
  arrayIndices?: ArrayIndexTracker,
): RemovedUnknownKey[] {
  const removed: RemovedUnknownKey[] = []
  collectSilentUnknownKeys(input, output, [], removed, arrayIndices)
  return removed
}

function collectSilentUnknownKeys(
  input: unknown,
  output: unknown,
  path: readonly PathSegment[],
  removed: RemovedUnknownKey[],
  arrayIndices?: ArrayIndexTracker,
): void {
  if (input === output) return
  if (Array.isArray(input) && Array.isArray(output)) {
    const retainedLength = Math.min(input.length, output.length)
    for (let index = 0; index < retainedLength; index++) {
      const originalIndex = arrayIndices?.get(input)?.[index] ?? index
      collectSilentUnknownKeys(input[index], output[index], [...path, originalIndex], removed, arrayIndices)
    }
    return
  }
  if (!isPlainObject(input) || !isPlainObject(output)) return

  for (const key of Object.keys(input)) {
    if (isUnsafeObjectKey(key)) continue
    const childPath = [...path, key]
    if (!Object.hasOwn(output, key)) {
      removed.push({ path: childPath })
      continue
    }
    collectSilentUnknownKeys(input[key], output[key], childPath, removed, arrayIndices)
  }
}

function highestLayerContainingPath(
  layers: readonly TolerantParseLayer[],
  path: readonly PathSegment[],
): number | undefined {
  for (let index = layers.length - 1; index >= 0; index--) {
    if (canDiscardAtPath(layers[index].value, path)) return index
  }
  return undefined
}

function dedupeUnknownKeys(keys: readonly RemovedUnknownKey[]): RemovedUnknownKey[] {
  const seen = new Set<string>()
  return keys.filter((entry) => {
    const key = `${entry.layer ?? ""}:${JSON.stringify(entry.path)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function originalPathAtValue(
  value: unknown,
  path: readonly PathSegment[],
  arrayIndices: ArrayIndexTracker,
): PathSegment[] {
  const originalPath: PathSegment[] = []
  let current = value
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === "number") {
      originalPath.push(arrayIndices.get(current)?.[segment] ?? segment)
      current = current[segment]
      continue
    }
    originalPath.push(segment)
    current = getChild(current, segment)
  }
  return originalPath
}

function isUnsafeObjectKey(key: string): boolean {
  return key === "__proto__" || key === "prototype" || key === "constructor"
}
