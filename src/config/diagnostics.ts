import { createHash } from "node:crypto"

import { log } from "../shared/logger.ts"
import type { RemovedUnknownKey } from "./tolerant-parse.ts"

const MAX_DIAGNOSTIC_ENTRIES = 20
const MAX_TRACKED_IDENTITIES = 4_096
const MAX_DISPLAY_CHARACTERS = 240
const ELLIPSIS = "…"

export type ConfigUnknownKeyDiagnosticEntry = {
  source: string
  path: readonly (string | number)[]
}

export type ConfigDiagnostics = {
  collect(source: string, unknownKeys: readonly RemovedUnknownKey[], prefix?: readonly (string | number)[]): void
  flush(): void
}

export function createConfigDiagnostics(): ConfigDiagnostics {
  const entries: ConfigUnknownKeyDiagnosticEntry[] = []
  const trackedIdentities = new Set<string>()
  let total = 0
  let omitted = 0
  let truncated = false
  let flushed = false

  return {
    collect(source, unknownKeys, prefix = []) {
      if (flushed) return
      for (const unknownKey of unknownKeys) {
        const identity = rawIdentityFingerprint(source, prefix, unknownKey.path)
        if (trackedIdentities.has(identity)) continue
        if (trackedIdentities.size >= MAX_TRACKED_IDENTITIES) {
          truncated = true
          continue
        }

        trackedIdentities.add(identity)
        total++
        if (entries.length < MAX_DIAGNOSTIC_ENTRIES) {
          entries.push({
            source: boundedSource(source),
            path: boundedPath([...prefix, ...unknownKey.path]),
          })
        } else {
          omitted++
        }
      }
    },
    flush() {
      if (flushed) return
      flushed = true
      if (entries.length === 0) return
      log.warn({
        code: "OCMM_CONFIG_UNKNOWN_KEYS",
        entries,
        total,
        omitted,
        // When true, total and omitted are lower bounds capped by tracked identities.
        truncated,
      })
    },
  }
}

function rawIdentityFingerprint(
  source: string,
  prefix: readonly (string | number)[],
  path: readonly (string | number)[],
): string {
  const fingerprint = createHash("sha256")
  fingerprint.update(JSON.stringify([source, [...prefix, ...path]]))
  return fingerprint.digest("base64")
}

function boundedSource(source: string): string {
  if (JSON.stringify(source).length <= MAX_DISPLAY_CHARACTERS) return source
  return boundedTail(source, (candidate) => JSON.stringify(candidate).length)
}

function boundedPath(path: readonly (string | number)[]): readonly (string | number)[] {
  if (JSON.stringify(path).length <= MAX_DISPLAY_CHARACTERS) return path

  const tail: (string | number)[] = []
  for (let index = path.length - 1; index >= 0; index--) {
    const pathSegment = path[index]!
    const candidate = [ELLIPSIS, pathSegment, ...tail]
    if (JSON.stringify(candidate).length <= MAX_DISPLAY_CHARACTERS) {
      tail.unshift(pathSegment)
      continue
    }
    if (tail.length > 0) return [ELLIPSIS, ...tail]
    if (typeof pathSegment === "string") {
      const segment = boundedTail(pathSegment, (value) => JSON.stringify([value]).length)
      return [segment]
    }
  }
  return [ELLIPSIS, ...tail]
}

function boundedTail(value: string, displayLength: (candidate: string) => number): string {
  const characters = Array.from(value)
  let low = 0
  let high = characters.length
  while (low < high) {
    const length = Math.ceil((low + high) / 2)
    const candidate = ELLIPSIS + characters.slice(-length).join("")
    if (displayLength(candidate) <= MAX_DISPLAY_CHARACTERS) low = length
    else high = length - 1
  }
  return ELLIPSIS + characters.slice(-low).join("")
}
