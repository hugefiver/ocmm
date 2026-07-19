import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

import { BUILTIN_AGENTS } from "../data/agents.ts"
import { BUILTIN_CATEGORIES } from "../data/categories.ts"
import { loadBuiltinCommands, type CommandDefinition } from "../commands/builtin.ts"
import { getAgentPrompt, getCategoryPrompt, getDeepworkPrompt, isGpt56Model, pickDeepworkVariantForAgent } from "../intent/prompt-loader.ts"
import { buildSkillCommand, DEFAULT_SKILLS_ROOT, loadSharedSkills, loadV1SkillCommands } from "../intent/skill-loader.ts"
import { resolveMcpServers } from "../mcp/index.ts"
import type {
  Agent,
  Category,
  FallbackEntry,
  ModelRequirement,
  PrimarySource,
  RequirementSource,
} from "../shared/types.ts"
import { normalizeAgentShorthand, normalizeShorthand, type NormalizedShorthand } from "../config/normalize.ts"
import type { OcmmConfig } from "../config/schema.ts"
import { buildEffectiveModelRoute } from "../routing/effective-route.ts"
import { selectCatalogModel } from "../routing/model-upgrades.ts"
import type { EffectiveRouteRegistry } from "../routing/route-registry.ts"
import { resolveEffectiveRequirement } from "../routing/resolver.ts"
import { isRecord, log } from "../shared/logger.ts"
import { expandReviewAgents, isExpandedReviewAgentDisabled, type ReviewAgentRegistrationOverrides } from "../review-agents/expand.ts"
import { isReviewAgentName, parseReviewAgentName } from "../review-agents/names.ts"

const COMPAT_AGENT_ALIASES = [
  { alias: "explore", target: "code-search" },
] as const

type PermissionAction = "ask" | "allow" | "deny"
type GranularPermission = Record<string, PermissionAction>
type PermissionDefault = PermissionAction | GranularPermission
type PermissionDefaults = Record<string, PermissionDefault>

const PRIMARY_COORDINATORS = ["orchestrator", "builder"] as const
const UTILITY_LEAF_AGENTS = [
  "quick",
  "code-search",
  "explore",
  "doc-search",
  "research",
  "media-reader",
] as const
const READ_ONLY_UTILITY_AGENTS = [
  "code-search",
  "explore",
  "doc-search",
  "research",
  "media-reader",
] as const
const STANDARD_WORKFLOW_SUBAGENTS = [
  "coding",
  "normal-task",
  "frontend",
  "creative",
  "hard-reasoning",
  "documenting",
] as const
const READ_ONLY_WORKFLOW_AGENTS = [
  "clarifier",
] as const
const LOCAL_COORDINATORS = ["deep", "complex"] as const
const SPECIALIST_EXECUTION_AGENTS = [
  "coding",
  "frontend",
  "hard-reasoning",
  "creative",
  "documenting",
] as const
const QUESTION_ENABLED_WORKFLOW_AGENTS = ["planner", "deep", "complex", "coding", "normal-task"] as const

function taskAllowlist(allowed: readonly string[]): GranularPermission {
  const rules: GranularPermission = { "*": "deny" }
  for (const name of allowed) rules[name] = "allow"
  return rules
}

const LOCALE_GUIDANCE_TAG = "ocmm-locale-guidance"
const LOCALE_GUIDANCE_BLOCK = new RegExp(
  `<${LOCALE_GUIDANCE_TAG}>[\\s\\S]*?<\\/${LOCALE_GUIDANCE_TAG}>\\s*(?:---\\s*)?`,
  "g",
)

function fmtModel(entry: FallbackEntry): string {
  const provider = entry.providers[0] ?? ""
  return provider ? `${provider}/${entry.model}` : entry.model
}

type AgentExtras = {
  mode?: string
  prompt?: string
  promptPrefix?: string
  promptSuffix?: string
  /** Catalog-confirmed runtime upgrade; never overrides an explicit user model. */
  model?: string
}

function applyAgentEntry(
  agentMap: Record<string, unknown>,
  agent: Agent,
  override: NormalizedShorthand | undefined,
  extras?: AgentExtras,
  registration?: ReviewAgentRegistrationOverrides,
): boolean {
  const current = agentMap[agent.name]
  if (isRecord(current) && current.disable === true) return false
  if (override?.disabled) return false

  let chain: FallbackEntry[] = agent.requirement.fallbackChain
  const description = override?.description ?? agent.description

  if (override?.requirement?.fallbackChain?.length) {
    chain = override.requirement.fallbackChain
  }
  if (!chain.length) return false
  const head = chain[0]!
  const modelStr = extras?.model ?? fmtModel(head)

  const existing = isRecord(current)
    ? current
    : {}

  if (typeof existing.model !== "string") existing.model = modelStr
  if (description && typeof existing.description !== "string") {
    existing.description = description
  }
  if (extras?.mode && typeof existing.mode !== "string") existing.mode = extras.mode
  if (extras?.prompt && typeof existing.prompt !== "string") existing.prompt = extras.prompt
  if (extras?.promptPrefix && typeof existing.prompt === "string") {
    existing.prompt = prependPromptPrefix(existing.prompt, extras.promptPrefix)
  }
  if (extras?.promptSuffix) {
    const basePrompt = typeof existing.prompt === "string" ? existing.prompt : ""
    existing.prompt = appendPromptSuffix(basePrompt, extras.promptSuffix)
  }
  if (registration?.tools) {
    mergePermission(
      existing,
      Object.fromEntries(
        Object.entries(registration.tools).map(([name, enabled]) => [name, enabled ? "allow" : "deny"]),
      ) as PermissionDefaults,
      true,
    )
  }
  if (override?.permission) mergePermission(existing, override.permission, true)
  if (registration) {
    for (const key of ["skills", "temperature", "topP", "maxTokens", "thinking", "reasoningEffort"] as const) {
      if (existing[key] !== undefined) continue
      const value = registration[key]
      if (value === undefined) continue
      existing[key] = Array.isArray(value)
        ? [...value]
        : typeof value === "object" && value !== null
          ? structuredClone(value)
          : value
    }
  }

  agentMap[agent.name] = existing
  return true
}

function buildLocaleGuidance(locale?: string): string {
  const configuredLocale = locale?.trim()
  const guidance = configuredLocale
    ? [
        `Configured locale: ${configuredLocale}.`,
        "Prefer this language/locale for your thinking process, visible planning, and conversation with the user.",
      ]
    : [
        "No locale is configured.",
        "Infer the user's preferred language from their latest message and conversation context, then prefer that language for your thinking process, visible planning, and conversation.",
        "If the user mixes languages, use the language that best matches the current request.",
      ]

  return [
    `<${LOCALE_GUIDANCE_TAG}>`,
    "Language and locale:",
    ...guidance.map((line) => `- ${line}`),
    "- Preserve code, identifiers, file paths, commands, protocol names, quotes, and user-requested wording in their original language when accuracy requires it.",
    "- If the user explicitly asks for a different output language for a specific answer, follow that local request unless it conflicts with higher-priority instructions.",
    `</${LOCALE_GUIDANCE_TAG}>`,
  ].join("\n")
}

function prependPromptPrefix(prompt: string, prefix: string): string {
  const body = prompt.replace(LOCALE_GUIDANCE_BLOCK, "").trim()
  const cleanPrefix = prefix.trim()
  return body ? `${cleanPrefix}\n\n---\n\n${body}` : cleanPrefix
}

const DELEGATION_CONTRACT_TAG = "ocmm-delegation-contract"
const DELEGATION_CONTRACT_BLOCK = new RegExp(
  `(?:\\n\\n---\\n\\n)?<${DELEGATION_CONTRACT_TAG}>[\\s\\S]*?<\\/${DELEGATION_CONTRACT_TAG}>\\s*`,
  "g",
)

function appendPromptSuffix(prompt: string, suffix: string): string {
  const body = prompt.replace(DELEGATION_CONTRACT_BLOCK, "").trim()
  const cleanSuffix = suffix.trim()
  return body ? `${body}\n\n---\n\n${cleanSuffix}` : cleanSuffix
}

const UTILITY_LEAF_AGENT_SET: ReadonlySet<string> = new Set(UTILITY_LEAF_AGENTS)
const STANDARD_WORKFLOW_SUBAGENT_SET: ReadonlySet<string> = new Set(STANDARD_WORKFLOW_SUBAGENTS)
const READ_ONLY_WORKFLOW_AGENT_SET: ReadonlySet<string> = new Set(READ_ONLY_WORKFLOW_AGENTS)
const LOCAL_COORDINATOR_SET: ReadonlySet<string> = new Set(LOCAL_COORDINATORS)

function formatTargets(names: readonly string[]): string {
  return names.map((name) => `\`${name}\``).join(", ")
}

function wrapDelegationContract(lines: readonly string[]): string {
  return [
    `<${DELEGATION_CONTRACT_TAG}>`,
    "## Delegation Contract (Authoritative)",
    ...lines,
    "This contract overrides any skill, model calibration, generated-adapter compatibility text, or other prompt layer that suggests broader delegation.",
    `</${DELEGATION_CONTRACT_TAG}>`,
  ].join("\n")
}

function delegationContractFor(name: string): string {
  const readOnlyReviewRole = isReviewAgentName(name) || name === "plan-critic"
  if (UTILITY_LEAF_AGENT_SET.has(name)) {
    return wrapDelegationContract([
      "This role is a utility leaf agent. Do not dispatch any subagent.",
      "Complete the bounded assignment with direct tools and return the result to the caller.",
    ])
  }

  if (name === "planner") {
    return wrapDelegationContract([
      "Use direct tools first. Delegate only when direct tools are insufficient and a separate bounded research result materially improves completion.",
      `Allowed utility targets: ${formatTargets(READ_ONLY_UTILITY_AGENTS)}.`,
      "You may consult exactly the unsuffixed `reviewer` at most once, only for one concrete blocking architecture, security, or performance decision that repository evidence cannot settle. This is not formal plan review or final acceptance.",
      "`quick` is forbidden. Do not dispatch `plan-critic`, any Reviewer tier (`reviewer-low`, `reviewer-high`, `reviewer-max`), any Oracle profile, implementation agents, or routine reviewer self-checks.",
      "Return the completed plan to the caller. Formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review are orchestrator-owned.",
    ])
  }

  if (READ_ONLY_WORKFLOW_AGENT_SET.has(name) || readOnlyReviewRole) {
    return wrapDelegationContract([
      "Use direct tools first. Delegate only when direct tools are insufficient and a separate bounded research result materially improves completion.",
      `Allowed utility targets: ${formatTargets(READ_ONLY_UTILITY_AGENTS)}.`,
      "`quick` is forbidden because this read-only role must not modify work by proxy. Planning, review, coordination, and implementation workflow agents are also forbidden.",
      "Return the completed plan or findings to the caller. Formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review are orchestrator-owned.",
    ])
  }

  if (STANDARD_WORKFLOW_SUBAGENT_SET.has(name)) {
    return wrapDelegationContract([
      "Use direct tools first. Delegate only when direct tools are insufficient or a separate bounded utility result materially improves completion.",
      `Allowed utility targets: ${formatTargets(UTILITY_LEAF_AGENTS)}.`,
      "Do not dispatch planning, review, coordination, or implementation workflow agents.",
      "After local verification, return status and evidence to the caller. Formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review are orchestrator-owned.",
    ])
  }

  if (LOCAL_COORDINATOR_SET.has(name)) {
    return wrapDelegationContract([
      "Use direct tools first. Delegate only when the child owns a distinct bounded deliverable that materially improves completion.",
      "Multiple steps, routine confirmation, or wanting another opinion are not sufficient.",
      `Allowed utility targets: ${formatTargets(UTILITY_LEAF_AGENTS)}.`,
      `Allowed specialist targets: ${formatTargets(SPECIALIST_EXECUTION_AGENTS)}.`,
      "Do not call `orchestrator`, `builder`, `planner`, `clarifier`, `plan-critic`, any Reviewer profile (`reviewer`, `reviewer-low`, `reviewer-high`, `reviewer-max`), any Oracle profile (`oracle`, `oracle-2nd`, configured `oracle-3rd`…`oracle-9th`, and their `low`/`high`/`max` tier variants), `normal-task`, `deep`, or `complex`.",
      "Integrate and verify child results, then return to the parent. Formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review are orchestrator-owned.",
    ])
  }

  return ""
}

function mergePermission(entry: Record<string, unknown>, permission: PermissionDefaults, overwrite: boolean): void {
  const existing = isRecord(entry.permission) ? entry.permission : {}
  const merged: Record<string, unknown> = { ...existing }
  for (const [name, value] of Object.entries(permission)) {
    if (overwrite || merged[name] === undefined) merged[name] = value
  }
  entry.permission = merged
}

function deepworkPromptForAgent(
  agent: Agent,
  override: NormalizedShorthand | undefined,
  workflow: string,
  selectedModel?: string,
): string {
  const chain =
    override?.requirement?.fallbackChain?.length
      ? override.requirement.fallbackChain
      : agent.requirement.fallbackChain
  const prefModel = selectedModel ?? chain[0]?.model ?? ""
  const gpt56Specialization = isGpt56Model(prefModel) ? getDeepworkPrompt("gpt-5.6") : ""
  // Codex profiles are generated ahead of runtime model overrides. Carry the
  // separately guarded GPT-5.6 layer in every Codex profile so a later Sol or
  // Terra override can apply it; non-5.6 models are explicitly told to ignore it.
  if (workflow === "codex") {
    const base = getDeepworkPrompt("gpt")
    const specialization = getDeepworkPrompt("gpt-5.6")
    return specialization ? `${base}\n\n---\n\n${specialization}` : base
  }
  const variant = pickDeepworkVariantForAgent({
    agentName: agent.name,
    preferenceModel: prefModel,
  })
  if (variant === "gpt-5.6") {
    return `${getDeepworkPrompt("gpt")}\n\n---\n\n${getDeepworkPrompt("gpt-5.6")}`
  }
  const base = getDeepworkPrompt(variant)
  return gpt56Specialization ? `${base}\n\n---\n\n${gpt56Specialization}` : base
}

function promptForBuiltinAgent(
  agent: Agent,
  override: NormalizedShorthand | undefined,
  workflow: string,
  selectedModel?: string,
): string {
  const promptName = agent.promptSource ?? agent.name
  const rolePrompt = getAgentPrompt(promptName).trim()
  const modelPrompt = deepworkPromptForAgent(agent, override, workflow, selectedModel).trim()
  if (!rolePrompt) return modelPrompt
  if (!modelPrompt) return rolePrompt
  return `${rolePrompt}\n\n---\n\n<workflow-model-calibration>\nThe role prompt above is authoritative for this agent's scope, permissions, and output contract. Use the workflow/model guidance below only for reliability, model-family calibration, and general execution discipline when it does not conflict with the role prompt.\n\n${modelPrompt}\n</workflow-model-calibration>`
}

function promptForBuiltinCategory(
  categoryName: string,
  workflow: string,
  selectedModel: string,
): string {
  const rolePrompt = getCategoryPrompt(categoryName).trim()
  const needsGpt56Calibration = workflow === "codex" || isGpt56Model(selectedModel)
  const modelPrompt = needsGpt56Calibration ? getDeepworkPrompt("gpt-5.6").trim() : ""
  if (!rolePrompt) return modelPrompt
  if (!modelPrompt) return rolePrompt
  return `${rolePrompt}\n\n---\n\n<workflow-model-calibration>\nThe category role prompt above is authoritative for this agent's scope, permissions, and output contract. Use the workflow/model guidance below only for GPT-5.6 calibration when it does not conflict with the category role prompt.\n\n${modelPrompt}\n</workflow-model-calibration>`
}

function categoryAsAgent(c: Category, override?: ModelRequirement): Agent {
  return {
    name: c.name,
    description: c.description,
    requirement: override ?? c.requirement,
  }
}

export type ConfigHandlerBaseArgs = {
  getConfig: () => OcmmConfig
  skillsRoot?: string
  cwd?: string
}

export type ConfigHandlerRouteMode =
  | {
      routeRegistry: EffectiveRouteRegistry
      getFastMode: () => boolean
      registeredAgentModels?: never
    }
  | {
      routeRegistry?: undefined
      getFastMode?: undefined
      registeredAgentModels?: Map<string, string>
    }

type ConfigHandlerArgs = ConfigHandlerBaseArgs & ConfigHandlerRouteMode

type RouteBuild = {
  fastMode: boolean
  nextRoutes: Map<string, ReturnType<typeof buildEffectiveModelRoute>>
}

type PrimarySelection = {
  model: string
  source: PrimarySource
}

function hasRouteRegistry(
  args: ConfigHandlerArgs,
): args is ConfigHandlerBaseArgs & Extract<ConfigHandlerRouteMode, { routeRegistry: EffectiveRouteRegistry }> {
  return args.routeRegistry !== undefined
}

function requirementSourceForRoute(source: string): RequirementSource {
  if (source === "user-config" || source === "agent-default" || source === "category-default") {
    return source
  }
  throw new Error(`unsupported route requirement source: ${source}`)
}

function resolveRouteRequirement(cfg: OcmmConfig, agentName: string): {
  requirement: ModelRequirement
  source: RequirementSource
} | null {
  const resolved = resolveEffectiveRequirement({
    agentName,
    agentsConfig: cfg.agents,
    categoriesConfig: cfg.categories,
    disabledAgents: cfg.disabledAgents,
  })
  if (!resolved) return null
  return {
    requirement: resolved.requirement,
    source: requirementSourceForRoute(resolved.source),
  }
}

function selectRoutePrimary(args: {
  target: Record<string, unknown>
  agentName: string
  requirement: ModelRequirement
  requirementSource: RequirementSource
  existingModel?: string
  allowCatalogUpgrade: boolean
}): PrimarySelection {
  if (args.existingModel) return { model: args.existingModel, source: "existing-model" }
  if (args.requirementSource === "user-config") {
    return { model: fmtModel(args.requirement.fallbackChain[0]!), source: "user-requirement" }
  }
  const catalogModel = args.allowCatalogUpgrade
    ? selectCatalogModel(args.target, args.agentName, args.requirement)
    : undefined
  if (catalogModel) return { model: catalogModel, source: "catalog-upgrade" }
  return { model: fmtModel(args.requirement.fallbackChain[0]!), source: "builtin-requirement" }
}

function hasExplicitRouteSelection(cfg: OcmmConfig, name: string): boolean {
  return [cfg.agents?.[name], cfg.categories?.[name]].some((entry) =>
    entry !== undefined && ["model", "fallbackModels", "requirement", "alias"].some((field) =>
      Object.prototype.hasOwnProperty.call(entry, field)
    )
  )
}

function hasOwnAgentEntry(cfg: OcmmConfig, name: string): boolean {
  return cfg.agents !== undefined && Object.prototype.hasOwnProperty.call(cfg.agents, name)
}

function isCompatAliasDisabled(alias: string, target: string, agents: OcmmConfig["agents"]): boolean {
  return [alias, target].some((name) =>
    agents?.[name]?.disabled === true || normalizeAgentShorthand(name, agents)?.disabled === true
  )
}

function cloneAgentMap(agentMap: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(agentMap)
}

function allowCatalogUpgrade(args: {
  registryManaged: boolean
  cfg: OcmmConfig
  agentName: string
  requested: boolean
}): boolean {
  if (!args.requested) return false
  return args.registryManaged || !hasExplicitRouteSelection(args.cfg, args.agentName)
}

function selectedProviderCatalogModels(
  target: Record<string, unknown>,
  selectedModel: string,
): ReadonlySet<string> | undefined {
  const separator = selectedModel.indexOf("/")
  if (separator <= 0 || separator === selectedModel.length - 1) return undefined
  const providers = isRecord(target.provider) ? target.provider : undefined
  const provider = providers?.[selectedModel.slice(0, separator)]
  if (!isRecord(provider) || !isRecord(provider.models)) return undefined
  return new Set(Object.keys(provider.models))
}

function registerEffectiveRoute(args: {
  build?: RouteBuild
  agentMap: Record<string, unknown>
  target: Record<string, unknown>
  cfg: OcmmConfig
  name: string
  requirement: ModelRequirement
  requirementSource: RequirementSource
  primary: PrimarySelection
}): void {
  if (!args.build) return
  const route = buildEffectiveModelRoute({
    selectedModel: args.primary.model,
    requirement: args.requirement,
    requirementSource: args.requirementSource,
    primarySource: args.primary.source,
    fastMode: args.build.fastMode,
    fastModels: args.cfg.fastModels,
    catalogModels: selectedProviderCatalogModels(args.target, args.primary.model),
  })
  args.build.nextRoutes.set(args.name, route)
  const entry = args.agentMap[args.name]
  if (isRecord(entry)) entry.model = route.model
}

export function createConfigHandler(
  args: ConfigHandlerArgs,
): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput, _output) => {
    const registryManaged = hasRouteRegistry(args)
    if (!registryManaged) args.registeredAgentModels?.clear()
    const compatibilityConfig = registryManaged ? undefined : args.getConfig()
    const generation = registryManaged ? args.routeRegistry.beginBuild() : undefined
    if (!isRecord(rawInput)) return

    const target = isRecord(rawInput.config) ? rawInput.config : rawInput
    const routeBuild = registryManaged
      ? { fastMode: args.getFastMode(), nextRoutes: new Map<string, ReturnType<typeof buildEffectiveModelRoute>>() }
      : undefined
    const cfg = compatibilityConfig ?? args.getConfig()
    const registered = registerSkillsAndCommands(target, cfg, args.skillsRoot)
    const registeredMcps = registerMcps(target, cfg, args.cwd)

    if (!cfg.registerBuiltinAgents) {
      log.info(`config: registered ${registered.skills} skills, ${registered.commands} commands, ${registeredMcps} MCPs`)
      if (registryManaged && routeBuild && generation !== undefined) {
        args.routeRegistry.publish(generation, routeBuild.nextRoutes)
      }
      return
    }

    if (!registryManaged && !isRecord(target.agent)) target.agent = {}
    const agentMap = registryManaged
      ? cloneAgentMap(isRecord(target.agent) ? target.agent : {})
      : target.agent as Record<string, unknown>
    const existingModels = new Map<string, string>()
    for (const [name, raw] of Object.entries(agentMap)) {
      if (isRecord(raw) && typeof raw.model === "string") existingModels.set(name, raw.model)
    }

    const disabled = new Set(cfg.disabledAgents ?? [])

    for (const [name, raw] of Object.entries(agentMap)) {
      const disabledReview = parseReviewAgentName(name) !== null && isExpandedReviewAgentDisabled(name, {
        agents: cfg.agents,
        disabledAgents: cfg.disabledAgents,
      })
      if ((disabled.has(name) || disabledReview) && isRecord(raw)) raw.disable = true
    }

    if (cfg.disableOpenCodeBuiltinAgents) {
      for (const name of ["build", "plan"]) {
        if (!isRecord(agentMap[name])) agentMap[name] = {}
        const entry = agentMap[name] as Record<string, unknown>
        if (entry.disable === undefined) entry.disable = true
      }
    }

    if (cfg.defaultAgent !== false) {
      const desired = typeof cfg.defaultAgent === "string" ? cfg.defaultAgent : "orchestrator"
      if (!disabled.has(desired) && typeof target.default_agent !== "string") {
        target.default_agent = desired
      }
    }

    for (const a of BUILTIN_AGENTS) {
      if (parseReviewAgentName(a.name)) continue
      if (disabled.has(a.name)) continue
      let norm = normalizeAgentShorthand(a.name, cfg.agents)
      // Inject builtin defaultAlias when the user wrote an entry for this agent
      // but didn't specify a model (no requirement) and didn't set an explicit
      // alias. If there is no user entry at all, the builtin requirement stands.
      const userEntryForAgent = cfg.agents?.[a.name]
      if (userEntryForAgent !== undefined && !norm?.requirement?.fallbackChain?.length && a.defaultAlias && !userEntryForAgent.alias) {
        const aliasNorm = normalizeAgentShorthand(a.defaultAlias, cfg.agents)
        if (aliasNorm?.requirement?.fallbackChain?.length) {
          norm = { ...norm, requirement: aliasNorm.requirement }
        }
      }
      const effective = resolveRouteRequirement(cfg, a.name)
      if (!effective) continue
      const primary = selectRoutePrimary({
        target,
        agentName: a.name,
        requirement: effective.requirement,
        requirementSource: effective.source,
        existingModel: existingModels.get(a.name),
        allowCatalogUpgrade: allowCatalogUpgrade({
          registryManaged,
          cfg,
          agentName: a.name,
          requested: true,
        }),
      })
      const prompt = promptForBuiltinAgent(a, norm, cfg.workflow, primary.model)
      const mode = a.name === "orchestrator" || a.name === "builder"
        ? "primary"
        : a.name === "planner"
          ? "all"
          : "subagent"
      const extras: AgentExtras = {}
      if (prompt) extras.prompt = prompt
      extras.mode = mode
      extras.model = primary.model
      if (mode === "primary" || mode === "all") {
        extras.promptPrefix = buildLocaleGuidance(cfg.locale)
      }
      const contract = delegationContractFor(a.name)
      if (contract) extras.promptSuffix = contract
      if (applyAgentEntry(agentMap, a, norm, extras)) {
        registerEffectiveRoute({
          build: routeBuild,
          agentMap,
          target,
          cfg,
          name: a.name,
          requirement: effective.requirement,
          requirementSource: effective.source,
          primary,
        })
      }
    }

    for (const profile of expandReviewAgents({ agents: cfg.agents, disabledAgents: cfg.disabledAgents })) {
      const synthetic: Agent = {
        name: profile.name,
        ...(profile.registration.description ? { description: profile.registration.description } : {}),
        requirement: profile.requirement,
        promptSource: profile.promptSource,
      }
      const effective = resolveRouteRequirement(cfg, profile.name) ?? {
        requirement: profile.requirement,
        source: "agent-default" as const,
      }
      const primary = selectRoutePrimary({
        target,
        agentName: profile.name,
        requirement: effective.requirement,
        requirementSource: effective.source,
        existingModel: existingModels.get(profile.name),
        allowCatalogUpgrade: allowCatalogUpgrade({
          registryManaged,
          cfg,
          agentName: profile.name,
          requested: !profile.suppressCatalogUpgrade,
        }),
      })
      let prompt = promptForBuiltinAgent(synthetic, { requirement: profile.requirement }, cfg.workflow, primary.model)
      if (profile.registration.promptAppend) prompt = `${prompt}\n\n${profile.registration.promptAppend.trim()}`
      const extras: AgentExtras = { mode: "subagent", model: primary.model }
      if (prompt) extras.prompt = prompt
      const contract = delegationContractFor(profile.name)
      if (contract) extras.promptSuffix = contract
      if (applyAgentEntry(agentMap, synthetic, {
        ...(profile.registration.description ? { description: profile.registration.description } : {}),
        requirement: profile.requirement,
        ...(profile.registration.permission ? { permission: profile.registration.permission } : {}),
      }, extras, profile.registration)) {
        registerEffectiveRoute({
          build: routeBuild,
          agentMap,
          target,
          cfg,
          name: profile.name,
          requirement: effective.requirement,
          requirementSource: effective.source,
          primary,
        })
      }
    }

    for (const c of BUILTIN_CATEGORIES) {
      if (disabled.has(c.name)) continue
      const agentOverride = normalizeAgentShorthand(c.name, cfg.agents)
      if (registryManaged && hasOwnAgentEntry(cfg, c.name) && !agentOverride?.requirement?.fallbackChain?.length) {
        continue
      }
      const categoryOverride = normalizeShorthand(cfg.categories?.[c.name])
      const effective = resolveRouteRequirement(cfg, c.name)
      if (!effective) continue
      const baseAgent = categoryAsAgent(c, effective.requirement)
      const merged: NormalizedShorthand | undefined =
        agentOverride ?? categoryOverride
      const primary = selectRoutePrimary({
        target,
        agentName: c.name,
        requirement: effective.requirement,
        requirementSource: effective.source,
        existingModel: existingModels.get(c.name),
        allowCatalogUpgrade: allowCatalogUpgrade({
          registryManaged,
          cfg,
          agentName: c.name,
          requested: true,
        }),
      })
      const extras: AgentExtras = { mode: "subagent" }
      const prompt = promptForBuiltinCategory(c.name, cfg.workflow, primary.model)
      if (prompt) extras.prompt = prompt
      extras.model = primary.model
      const contract = delegationContractFor(c.name)
      if (contract) extras.promptSuffix = contract
      if (applyAgentEntry(agentMap, baseAgent, merged, extras)) {
        registerEffectiveRoute({
          build: routeBuild,
          agentMap,
          target,
          cfg,
          name: c.name,
          requirement: effective.requirement,
          requirementSource: effective.source,
          primary,
        })
      }
    }

    if (cfg.agents) {
      for (const name of Object.keys(cfg.agents)) {
        if (disabled.has(name)) continue
        if (BUILTIN_AGENTS.some((b) => b.name === name)) continue
        if (BUILTIN_CATEGORIES.some((c) => c.name === name)) continue
        if (parseReviewAgentName(name)) continue
        const norm = normalizeAgentShorthand(name, cfg.agents)
        if (!norm?.requirement?.fallbackChain?.length) continue
        const effective = resolveRouteRequirement(cfg, name)
        if (!effective) continue
        const primary = selectRoutePrimary({
          target,
          agentName: name,
          requirement: effective.requirement,
          requirementSource: effective.source,
          existingModel: existingModels.get(name),
          allowCatalogUpgrade: false,
        })
        const synthetic: Agent = {
          name,
          ...(norm.description ? { description: norm.description } : {}),
          requirement: norm.requirement,
        }
        const registeredAgent = applyAgentEntry(agentMap, synthetic, norm, { model: primary.model })
        if (registeredAgent && !COMPAT_AGENT_ALIASES.some((entry) => entry.alias === name)) {
          registerEffectiveRoute({
            build: routeBuild,
            agentMap,
            target,
            cfg,
            name,
            requirement: effective.requirement,
            requirementSource: effective.source,
            primary,
          })
        }
      }
    }

    if (registryManaged && cfg.categories) {
      for (const name of Object.keys(cfg.categories)) {
        if (disabled.has(name)) continue
        if (BUILTIN_AGENTS.some((a) => a.name === name)) continue
        if (BUILTIN_CATEGORIES.some((c) => c.name === name)) continue
        if (hasOwnAgentEntry(cfg, name)) continue
        const agentOverride = normalizeAgentShorthand(name, cfg.agents)
        const categoryOverride = normalizeShorthand(cfg.categories[name])
        if (!agentOverride?.requirement?.fallbackChain?.length && !categoryOverride?.requirement?.fallbackChain?.length) {
          continue
        }
        const effective = resolveRouteRequirement(cfg, name)
        if (!effective) continue
        const primary = selectRoutePrimary({
          target,
          agentName: name,
          requirement: effective.requirement,
          requirementSource: effective.source,
          existingModel: existingModels.get(name),
          allowCatalogUpgrade: false,
        })
        const synthetic: Agent = {
          name,
          ...(agentOverride?.description ?? categoryOverride?.description
            ? { description: agentOverride?.description ?? categoryOverride?.description }
            : {}),
          requirement: effective.requirement,
        }
        const merged = agentOverride?.requirement ? agentOverride : categoryOverride
        if (applyAgentEntry(agentMap, synthetic, merged, { mode: "subagent", model: primary.model })) {
          registerEffectiveRoute({
            build: routeBuild,
            agentMap,
            target,
            cfg,
            name,
            requirement: effective.requirement,
            requirementSource: effective.source,
            primary,
          })
        }
      }
    }

    registerCompatAgentAliases(agentMap, disabled, cfg.agents, registryManaged)
    registerDefaultPermissions(target, agentMap)

    for (const { alias, target: compatTarget } of COMPAT_AGENT_ALIASES) {
      if (!routeBuild || disabled.has(alias) || disabled.has(compatTarget) || isCompatAliasDisabled(alias, compatTarget, cfg.agents)) continue
      const currentTarget = agentMap[compatTarget]
      const aliasEntry = agentMap[alias]
      const targetRoute = routeBuild.nextRoutes.get(compatTarget)
      const effective = resolveRouteRequirement(cfg, alias)
      if (
        !isRecord(currentTarget)
        || currentTarget.disable === true
        || !isRecord(aliasEntry)
        || aliasEntry.disable === true
        || typeof aliasEntry.model !== "string"
        || !effective
      ) continue
      const explicitAliasRequirement = normalizeAgentShorthand(alias, cfg.agents)?.requirement
      const primary: PrimarySelection = existingModels.has(alias)
        ? { model: aliasEntry.model, source: "existing-model" }
        : explicitAliasRequirement
          ? { model: aliasEntry.model, source: "user-requirement" }
          : { model: aliasEntry.model, source: targetRoute?.primarySource ?? "builtin-requirement" }
      registerEffectiveRoute({
        build: routeBuild,
        agentMap,
        target,
        cfg,
        name: alias,
        requirement: effective.requirement,
        requirementSource: effective.source,
        primary,
      })
    }

    if (!registryManaged) {
      for (const [name, raw] of Object.entries(agentMap)) {
        if (isRecord(raw) && typeof raw.model === "string") {
          args.registeredAgentModels?.set(name, raw.model)
        }
      }
    }

    log.info(
      `config: registered ${Object.keys(agentMap).length} agents (built-in + categories + user), ${registered.skills} skills, ${registered.commands} commands, ${registeredMcps} MCPs`,
    )
    if (registryManaged && routeBuild && generation !== undefined && args.routeRegistry.publish(generation, routeBuild.nextRoutes)) {
      target.agent = agentMap
    }
  }
}

function registerDefaultPermissions(target: Record<string, unknown>, agentMap: Record<string, unknown>): void {
  const topLevel = isRecord(target.permission) ? target.permission : {}
  target.permission = topLevel
  mergePermission(target, { webfetch: "allow", external_directory: "allow", task: "deny" }, false)

  for (const name of PRIMARY_COORDINATORS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: "allow", question: "allow", "task_*": "allow" }, false)
  }

  for (const name of STANDARD_WORKFLOW_SUBAGENTS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: taskAllowlist(UTILITY_LEAF_AGENTS) }, false)
  }

  const planner = agentMap.planner
  if (isRecord(planner)) {
    mergePermission(planner, { task: taskAllowlist([...READ_ONLY_UTILITY_AGENTS, "reviewer"]) }, false)
  }

  for (const name of READ_ONLY_WORKFLOW_AGENTS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: taskAllowlist(READ_ONLY_UTILITY_AGENTS) }, false)
  }

  for (const [name, entry] of Object.entries(agentMap)) {
    if (isRecord(entry) && (isReviewAgentName(name) || name === "plan-critic")) {
      mergePermission(entry, { task: taskAllowlist(READ_ONLY_UTILITY_AGENTS) }, false)
    }
  }

  for (const name of LOCAL_COORDINATORS) {
    const entry = agentMap[name]
    if (isRecord(entry)) {
      mergePermission(entry, {
        task: taskAllowlist([...UTILITY_LEAF_AGENTS, ...SPECIALIST_EXECUTION_AGENTS]),
      }, false)
    }
  }

  for (const name of UTILITY_LEAF_AGENTS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: "deny" }, false)
  }

  for (const name of QUESTION_ENABLED_WORKFLOW_AGENTS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { question: "allow" }, false)
  }

  const docSearch = agentMap["doc-search"]
  if (isRecord(docSearch)) mergePermission(docSearch, { "grep_app_*": "allow" }, false)
}

function registerCompatAgentAliases(
  agentMap: Record<string, unknown>,
  disabled: Set<string>,
  agents: OcmmConfig["agents"],
  registryManaged: boolean,
): void {
  for (const { alias, target } of COMPAT_AGENT_ALIASES) {
    if (disabled.has(alias) || disabled.has(target) || isCompatAliasDisabled(alias, target, agents)) {
      if (registryManaged) delete agentMap[alias]
      continue
    }
    const source = agentMap[target]
    if (!isRecord(source) || source.disable === true) {
      if (registryManaged) delete agentMap[alias]
      continue
    }

    const existing = isRecord(agentMap[alias]) ? (agentMap[alias] as Record<string, unknown>) : {}
    if (existing.disable === true) continue
    const aliasEntry = { ...source, ...existing }
    if (typeof aliasEntry.description !== "string") {
      aliasEntry.description = `Compatibility alias for @${target}.`
    }
    const contract = delegationContractFor(alias)
    if (contract) {
      const basePrompt = typeof aliasEntry.prompt === "string" ? aliasEntry.prompt : ""
      aliasEntry.prompt = appendPromptSuffix(basePrompt, contract)
    }
    agentMap[alias] = aliasEntry
  }
}

function registerSkillsAndCommands(
  target: Record<string, unknown>,
  cfg: OcmmConfig,
  skillsRoot: string = DEFAULT_SKILLS_ROOT,
): { skills: number; commands: number } {
  const disabledSkills = [...cfg.skills.disable, ...(cfg.disabledSkills ?? [])]
  const selected = loadSharedSkills({
    rootDir: skillsRoot,
    sources: cfg.skills.sources,
    enable: cfg.skills.enable,
    disable: disabledSkills,
  })

  const parentDirs = new Set<string>()
  for (const skill of selected) {
    parentDirs.add(dirname(skill.path))
  }
  if (cfg.workflow === "v1") {
    const v1SkillRoot = join(skillsRoot, "v1")
    if (existsSync(v1SkillRoot)) parentDirs.add(v1SkillRoot)
  }

  if (parentDirs.size > 0) {
    if (!isRecord(target.skills)) target.skills = {}
    const skillsConfig = target.skills as Record<string, unknown>
    if (!Array.isArray(skillsConfig.paths)) skillsConfig.paths = []
    const paths = skillsConfig.paths as unknown[]
    const seen = new Set(paths.filter((p): p is string => typeof p === "string"))

    for (const dir of parentDirs) {
      if (!seen.has(dir)) {
        paths.push(dir)
        seen.add(dir)
      }
    }
  }

  const skillCommands = selected
    .map((skill) => buildSkillCommand(skill, "ocmm"))
    .filter((skill): skill is NonNullable<typeof skill> => skill !== null)

  const v1Commands =
    cfg.workflow === "v1"
      ? loadV1SkillCommands({ rootDir: skillsRoot, disable: disabledSkills })
      : []

  const commands = registerCommands(target, [
    ...loadBuiltinCommands(cfg.disabledCommands),
    ...skillCommands,
    ...v1Commands,
  ], new Set(cfg.disabledCommands ?? []))

  return { skills: selected.length, commands }
}

function registerCommands(
  target: Record<string, unknown>,
  definitions: readonly CommandDefinition[],
  disabled: ReadonlySet<string>,
): number {
  if (!definitions.length) return 0
  if (!isRecord(target.command)) target.command = {}
  const commandMap = target.command as Record<string, unknown>

  let registered = 0
  for (const definition of definitions) {
    if (disabled.has(definition.name)) continue
    if (commandMap[definition.name] !== undefined) continue
    const { name: _name, path: _path, ...entry } = definition as CommandDefinition & { path?: string }
    commandMap[definition.name] = entry
    registered++
  }
  return registered
}

function registerMcps(target: Record<string, unknown>, cfg: OcmmConfig, cwd?: string): number {
  const selected = resolveMcpServers(cfg.mcp, { disabledMcps: cfg.disabledMcps, ...(cwd ? { cwd } : {}) })
  if (!Object.keys(selected).length) return 0

  if (!isRecord(target.mcp)) target.mcp = {}
  const mcpConfig = target.mcp as Record<string, unknown>
  for (const [name, server] of Object.entries(selected)) {
    if (isRecord(mcpConfig[name]) && (mcpConfig[name] as Record<string, unknown>).enabled === false) {
      continue
    }
    mcpConfig[name] = server
  }
  return Object.keys(selected).length
}
