import type { FastOptionRule } from "../config/schema.ts"

export type FastOptionMatchContext = {
  provider: string
  model: string
  sdk?: string
}

export type FastOptionMergeResult = {
  options: Record<string, unknown>
  matchedRuleIndexes: number[]
}

function globMatches(pattern: string, value: string): boolean {
  let source = ""
  for (const character of pattern) {
    if (character === "*") {
      source += ".*"
    } else if (character === "?") {
      source += "."
    } else {
      source += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }
  }
  return new RegExp(`^(?:${source})(?![\\s\\S])`, "su").test(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function ownValue(object: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.getOwnPropertyDescriptor(object, key)?.value
}

function defineValue(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  })
}

function cloneOptionValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneOptionValue)
  if (isPlainObject(value)) return cloneOptions(value)
  return value
}

function cloneOptions(options: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const cloned: Record<string, unknown> = {}
  for (const key of Object.keys(options)) {
    defineValue(cloned, key, cloneOptionValue(ownValue(options, key)))
  }
  return cloned
}

function mergeOptions(
  baseOptions: Readonly<Record<string, unknown>>,
  ruleOptions: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const merged = cloneOptions(baseOptions)
  for (const key of Object.keys(ruleOptions)) {
    const ruleValue = ownValue(ruleOptions, key)
    const baseValue = ownValue(merged, key)
    defineValue(
      merged,
      key,
      isPlainObject(baseValue) && isPlainObject(ruleValue)
        ? mergeOptions(baseValue, ruleValue)
        : cloneOptionValue(ruleValue),
    )
  }
  return merged
}

export function matchesFastOptionRule(
  rule: FastOptionRule,
  context: FastOptionMatchContext,
): boolean {
  const { match } = rule
  if (match.provider !== undefined && !globMatches(match.provider, context.provider)) return false
  if (match.model !== undefined && !globMatches(match.model, context.model)) return false
  if (match.sdk !== undefined && (context.sdk === undefined || !globMatches(match.sdk, context.sdk))) return false
  return true
}

export function mergeFastOptionRules(
  baseOptions: Readonly<Record<string, unknown>>,
  rules: readonly FastOptionRule[],
  context: FastOptionMatchContext,
): FastOptionMergeResult {
  let options = cloneOptions(baseOptions)
  const matchedRuleIndexes: number[] = []
  for (const [index, rule] of rules.entries()) {
    if (!matchesFastOptionRule(rule, context)) continue
    options = mergeOptions(options, rule.options)
    matchedRuleIndexes.push(index)
  }
  return { options, matchedRuleIndexes }
}
