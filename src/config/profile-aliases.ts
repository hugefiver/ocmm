import type { FallbackEntry, ModelRequirement } from "../shared/types.ts"
import { deepMerge, isPlainObject } from "./merge.ts"
import { normalizeDirectRequirement } from "./normalize.ts"
import type { ProfileDescriptorMap } from "./profile-types.ts"
import type { AgentEntry, OcmmConfig } from "./schema.ts"

export type QualifiedAgentAlias = { profile: string; agent: string }

type AliasScope =
  | { kind: "active" }
  | { kind: "profile"; name: string }

type ScopedAgent = { scope: AliasScope; agent: string }

export function parseQualifiedAgentAlias(alias: string): QualifiedAgentAlias | null {
  const separator = alias.indexOf(":")
  if (separator < 0) return null

  const profile = alias.slice(0, separator)
  const agent = alias.slice(separator + 1)
  if (!profile || !agent || !/^[A-Za-z0-9_-]+$/.test(profile)) {
    throw new Error(`invalid-qualified-alias: ${alias}`)
  }
  return { profile, agent }
}

function cloneFallbackEntry(entry: FallbackEntry): FallbackEntry {
  return {
    ...entry,
    providers: [...entry.providers],
    ...(entry.thinking ? { thinking: { ...entry.thinking } } : {}),
  }
}

function cloneRequirement(requirement: ModelRequirement): ModelRequirement {
  return {
    ...requirement,
    fallbackChain: requirement.fallbackChain.map(cloneFallbackEntry),
    ...(requirement.requiresProvider ? { requiresProvider: [...requirement.requiresProvider] } : {}),
  }
}

function scopedAgentKey(node: ScopedAgent): string {
  return JSON.stringify([
    node.scope.kind,
    node.scope.kind === "profile" ? node.scope.name : null,
    node.agent,
  ])
}

function formatScopedAgent(node: ScopedAgent): string {
  return node.scope.kind === "active"
    ? `active:${node.agent}`
    : `profile:${node.scope.name}:${node.agent}`
}

function qualifiedAliasError(path: readonly ScopedAgent[], detail: string): Error {
  return new Error(`${detail}: ${path.map(formatScopedAgent).join(" -> ")}`)
}

function parseQualifiedAliasAtPath(alias: string, path: readonly ScopedAgent[]): QualifiedAgentAlias | null {
  try {
    return parseQualifiedAgentAlias(alias)
  } catch (err) {
    throw qualifiedAliasError(path, (err as Error).message)
  }
}

export function materializeQualifiedAgentAliases(args: {
  config: OcmmConfig
  baseAgents: Record<string, AgentEntry>
  profiles: ProfileDescriptorMap
}): OcmmConfig {
  if (!args.config.agents) return args.config

  const targetViews = new Map<string, Record<string, AgentEntry>>()
  const activeAgents = args.config.agents

  const profileAgents = (name: string, path: readonly ScopedAgent[]): Record<string, AgentEntry> => {
    const cached = targetViews.get(name)
    if (cached) return cached

    const descriptor = args.profiles.get(name)
    if (!descriptor) {
      throw qualifiedAliasError(path, `qualified alias target profile "${name}" not found`)
    }
    if (descriptor.error) {
      const location = descriptor.path ?? descriptor.source
      throw qualifiedAliasError(path,
        `qualified alias target profile "${name}" from ${location} is invalid (${descriptor.error.kind}): ${descriptor.error.message}`,
      )
    }
    if (!isPlainObject(descriptor.value)) {
      throw qualifiedAliasError(path, `qualified alias target profile "${name}" has no materialized value`)
    }

    const overlay = isPlainObject(descriptor.value.agents)
      ? descriptor.value.agents as Record<string, AgentEntry>
      : undefined
    const view = deepMerge(args.baseAgents, overlay, undefined, { profileOverlay: true }) as Record<string, AgentEntry>
    targetViews.set(name, view)
    return view
  }

  const agentsForScope = (scope: AliasScope, path: readonly ScopedAgent[]): Record<string, AgentEntry> =>
    scope.kind === "active" ? activeAgents : profileAgents(scope.name, path)

  const resolve = (scope: AliasScope, agent: string, stack: ScopedAgent[], membership: Set<string>): ModelRequirement => {
    const node: ScopedAgent = { scope, agent }
    const nodeKey = scopedAgentKey(node)
    if (membership.has(nodeKey)) {
      throw qualifiedAliasError([...stack, node], "circular qualified alias")
    }

    membership.add(nodeKey)
    stack.push(node)
    try {
      const path = stack
      const entry = agentsForScope(scope, path)[agent]
      if (!entry) {
        throw qualifiedAliasError(path, `qualified alias target ${formatScopedAgent(node)} not found`)
      }

      const direct = normalizeDirectRequirement(entry)
      if (direct) return cloneRequirement(direct)

      const alias = entry.alias
      if (!alias) {
        throw qualifiedAliasError(path, `qualified alias target ${formatScopedAgent(node)} has no requirement`)
      }
      const qualified = parseQualifiedAliasAtPath(alias, path)
      if (qualified) {
        return resolve({ kind: "profile", name: qualified.profile }, qualified.agent, stack, membership)
      }
      return resolve(scope, alias, stack, membership)
    } finally {
      stack.pop()
      membership.delete(nodeKey)
    }
  }

  let agents = activeAgents
  for (const [name, entry] of Object.entries(activeAgents)) {
    if (normalizeDirectRequirement(entry)) continue
    if (!entry.alias) continue
    const source: ScopedAgent = { scope: { kind: "active" }, agent: name }
    if (!parseQualifiedAliasAtPath(entry.alias, [source])) continue

    const requirement = resolve({ kind: "active" }, name, [], new Set())
    if (agents === activeAgents) agents = { ...activeAgents }
    agents[name] = { ...entry, requirement }
  }

  return agents === activeAgents ? args.config : { ...args.config, agents }
}
