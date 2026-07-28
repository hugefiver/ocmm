import type { FastOptionRule } from "../config/schema.ts"
import type { EffectiveModelRoute, FallbackEntry, FastPath, ModelRequirement } from "../shared/types.ts"

export type EffectiveRouteSnapshot = Readonly<{
  published: boolean
  snapshotId: number
  routes: ReadonlyMap<string, EffectiveModelRoute>
}>

export type EffectiveRouteRegistry = {
  beginBuild(): number
  publish(generation: number, routes: ReadonlyMap<string, EffectiveModelRoute>): boolean
  snapshot(): EffectiveRouteSnapshot
  isCurrentSnapshot(snapshotId: number): boolean
}

function freezeArray<T>(values: T[]): T[] {
  return Object.freeze(values) as T[]
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function cloneAndFreezeOptionValue(value: unknown): unknown {
  if (Array.isArray(value)) return freezeArray(value.map(cloneAndFreezeOptionValue))
  if (isPlainObject(value)) return cloneAndFreezeOptionRecord(value)
  return value
}

function cloneAndFreezeOptionRecord(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneAndFreezeOptionValue(entry)]),
  ))
}

function cloneAndFreezeFastOptionRule(rule: FastOptionRule): FastOptionRule {
  return Object.freeze({
    match: cloneAndFreezeOptionRecord(rule.match) as FastOptionRule["match"],
    options: cloneAndFreezeOptionRecord(rule.options) as FastOptionRule["options"],
  })
}

function cloneAndFreezeFastPath(fastPath: FastPath): FastPath {
  if (fastPath.kind === "off") return Object.freeze({ kind: "off" } as const)
  if (fastPath.kind === "model") return Object.freeze({ kind: "model", modelID: fastPath.modelID } as const)
  return Object.freeze({
    kind: "options" as const,
    defaultRules: fastPath.defaultRules,
    rules: freezeArray(fastPath.rules.map(cloneAndFreezeFastOptionRule)),
  })
}

function cloneAndFreezeRoute(route: EffectiveModelRoute): EffectiveModelRoute {
  const fallbackChain = freezeArray(route.requirement.fallbackChain.map((entry) => {
    const copy: FallbackEntry = {
      ...entry,
      providers: freezeArray([...entry.providers]),
      ...(entry.thinking === undefined ? {} : { thinking: Object.freeze({ ...entry.thinking }) }),
    }
    return Object.freeze(copy) as FallbackEntry
  }))
  const requirement: ModelRequirement = {
    ...route.requirement,
    fallbackChain,
    ...(route.requirement.requiresProvider === undefined
      ? {}
      : { requiresProvider: freezeArray([...route.requirement.requiresProvider]) }),
  }

  return Object.freeze({
    ...route,
    requirement: Object.freeze(requirement),
    fastPath: cloneAndFreezeFastPath(route.fastPath),
  }) as EffectiveModelRoute
}

function createReadonlyMapView<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const copied = new Map(source)
  let view: ReadonlyMap<K, V>
  view = Object.freeze({
    get size(): number {
      return copied.size
    },
    has(key: K): boolean {
      return copied.has(key)
    },
    get(key: K): V | undefined {
      return copied.get(key)
    },
    entries(): MapIterator<[K, V]> {
      return copied.entries()
    },
    keys(): MapIterator<K> {
      return copied.keys()
    },
    values(): MapIterator<V> {
      return copied.values()
    },
    forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
      copied.forEach((value, key) => callbackfn.call(thisArg, value, key, view))
    },
    [Symbol.iterator](): MapIterator<[K, V]> {
      return copied[Symbol.iterator]()
    },
  } satisfies ReadonlyMap<K, V>)
  return view
}

function createSnapshot(
  published: boolean,
  snapshotId: number,
  routes: ReadonlyMap<string, EffectiveModelRoute>,
): EffectiveRouteSnapshot {
  return Object.freeze({
    published,
    snapshotId,
    routes: createReadonlyMapView(routes),
  })
}

export function createEffectiveRouteRegistry(): EffectiveRouteRegistry {
  let latestStartedGeneration = 0
  let currentSnapshot = createSnapshot(false, 0, new Map())

  function beginBuild(): number {
    latestStartedGeneration += 1
    return latestStartedGeneration
  }

  function publish(generation: number, routes: ReadonlyMap<string, EffectiveModelRoute>): boolean {
    if (generation !== latestStartedGeneration) return false

    const frozenRoutes = new Map<string, EffectiveModelRoute>()
    for (const [name, route] of routes) frozenRoutes.set(name, cloneAndFreezeRoute(route))
    currentSnapshot = createSnapshot(true, currentSnapshot.snapshotId + 1, frozenRoutes)
    return true
  }

  function snapshot(): EffectiveRouteSnapshot {
    return currentSnapshot
  }

  function isCurrentSnapshot(snapshotId: number): boolean {
    return snapshotId === currentSnapshot.snapshotId
  }

  return { beginBuild, publish, snapshot, isCurrentSnapshot }
}
