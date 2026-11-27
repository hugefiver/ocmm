import { existsSync } from "node:fs"
import { join } from "node:path"

import { BUILTIN_AGENTS } from "../data/agents.ts"
import { BUILTIN_CATEGORIES } from "../data/categories.ts"
import { loadBuiltinCommands, type CommandDefinition } from "../commands/builtin.ts"
import { getAgentPrompt, getAvoidAiSlopPrompt, getCategoryModelCalibration, getCategoryPrompt, getDeepworkPrompt, getShellSafetyPrompt, pickDeepworkVariantForAgent, pickModelBaseCalibrationVariant, pickModelCalibrationVariants } from "../intent/prompt-loader.ts"
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
import { reasoningToVariant } from "../shared/reasoning.ts"
import { isRecord, log } from "../shared/logger.ts"
import type { AgentProfileRegistrationOverrides } from "../logical-tiers/materialize.ts"
import { expandPlanningAgents, isExpandedPlanningAgentDisabled } from "../planning-agents/profiles.ts"
import { parsePlanningAgentName } from "../planning-agents/names.ts"
import { expandReviewAgents, isExpandedReviewAgentDisabled } from "../review-agents/expand.ts"
import { isReviewAgentName, parseReviewAgentName } from "../review-agents/names.ts"
import { createCategoryAvailabilityDiagnosticReporter } from "./category-availability-diagnostics.ts"
import { createSubagentDepthDiagnosticReporter, type SubagentDepthDiagnosticLogger } from "./subagent-depth-diagnostics.ts"

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
const LOCAL_COORDINATORS = ["deep", "complex", "cross-cutting"] as const
const SPECIALIST_EXECUTION_AGENTS = [
  "coding",
  "frontend",
  "hard-reasoning",
  "creative",
  "documenting",
] as const
const QUESTION_ENABLED_WORKFLOW_AGENTS = ["deep", "complex", "cross-cutting", "coding", "normal-task"] as const

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
  promptPrefixWithoutBody?: boolean
  promptSuffix?: string
  /** Catalog-confirmed runtime upgrade; never overrides an explicit user model. */
  model?: string
}

function applyAgentEntry(
  agentMap: Record<string, unknown>,
  agent: Agent,
  override: NormalizedShorthand | undefined,
  extras?: AgentExtras,
  registration?: AgentProfileRegistrationOverrides,
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
  if (extras?.promptPrefix && (typeof existing.prompt === "string" || extras.promptPrefixWithoutBody)) {
    const basePrompt = typeof existing.prompt === "string" ? existing.prompt : ""
    existing.prompt = prependPromptPrefix(basePrompt, extras.promptPrefix)
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
  if (existing.variant === undefined) {
    const reasoning = head.reasoning ?? agent.requirement.reasoning
    const visibleVariant = reasoning === undefined ? undefined : reasoningToVariant(reasoning)
    if (visibleVariant !== undefined) existing.variant = visibleVariant
  }

  agentMap[agent.name] = existing
  return true
}

function buildLocaleGuidance(locale?: string): string {
  const configuredLocale = locale?.trim()
  const guidance = configuredLocale
    ? [
        `Configured locale: ${configuredLocale}.`,
        "Use it as the default for visible replies, plans, and role or category output.",
      ]
    : [
        "No locale is configured.",
        "Infer the user's preferred visible-output language from their latest message and conversation context.",
        "If the user mixes languages, use the language that best matches the current request.",
      ]

  return [
    `<${LOCALE_GUIDANCE_TAG}>`,
    "Language and locale:",
    ...guidance.map((line) => `- ${line}`),
    "- Follow the user's explicit visible-output language request before the configured or inferred default.",
    "- Preserve code, identifiers, file paths, commands, protocol names, quotes, and user-requested wording in their original language when accuracy requires it.",
    "- This guidance applies to visible output only; it does not require or claim a reasoning language.",
    `</${LOCALE_GUIDANCE_TAG}>`,
  ].join("\n")
}

function prependPromptPrefix(prompt: string, prefix: string): string {
  const body = prompt.replace(LOCALE_GUIDANCE_BLOCK, "").trim()
  const cleanPrefix = prefix.trim()
  return body ? `${cleanPrefix}\n\n---\n\n${body}` : cleanPrefix
}

const DELEGATION_CONTRACT_TAG = "ocmm-delegation-contract"
const COMPRESSION_POLICY_TAG = "ocmm-subagent-compression-policy"
const REVIEW_SESSION_EFFICIENCY_POLICY_TAG = "ocmm-review-session-efficiency-policy"
const SHELL_SAFETY_TAG = "ocmm-shell-command-safety"
const WORKFLOW_BOUNDARIES_TAG = "ocmm-workflow-boundaries"
const AVOID_AI_SLOP_TAG = "ocmm-avoid-ai-slop"
const TERMINAL_POLICY_TAGS = [
  DELEGATION_CONTRACT_TAG,
  COMPRESSION_POLICY_TAG,
  REVIEW_SESSION_EFFICIENCY_POLICY_TAG,
  SHELL_SAFETY_TAG,
  WORKFLOW_BOUNDARIES_TAG,
  AVOID_AI_SLOP_TAG,
].join("|")
const TERMINAL_POLICY_BLOCK = new RegExp(
  `(?:\\n\\n---\\n\\n)?(?:<(${TERMINAL_POLICY_TAGS})>(?:(?!<\\/\\1>)[\\s\\S])*<\\/\\1>(?:\\s*---\\s*|\\s*))+\\s*$`,
)

function appendPromptSuffix(prompt: string, suffix: string): string {
  const body = prompt.replace(TERMINAL_POLICY_BLOCK, "").trim()
  const cleanSuffix = suffix.trim()
  // Shared boundaries alone are not a role when prompt resources are missing.
  if (!body && cleanSuffix === workflowBoundariesPolicy()) return ""
  return body ? `${body}\n\n---\n\n${cleanSuffix}` : cleanSuffix
}

const UTILITY_LEAF_AGENT_SET: ReadonlySet<string> = new Set(UTILITY_LEAF_AGENTS)
const STANDARD_WORKFLOW_SUBAGENT_SET: ReadonlySet<string> = new Set(STANDARD_WORKFLOW_SUBAGENTS)
const READ_ONLY_WORKFLOW_AGENT_SET: ReadonlySet<string> = new Set(READ_ONLY_WORKFLOW_AGENTS)
const LOCAL_COORDINATOR_SET: ReadonlySet<string> = new Set(LOCAL_COORDINATORS)

function formatTargets(names: readonly string[]): string {
  return names.map((name) => `\`${name}\``).join(", ")
}

function wrapTerminalPolicy(tag: string, title: string, lines: readonly string[]): string {
  return [
    `<${tag}>`,
    `## ${title}`,
    ...lines,
    `</${tag}>`,
  ].join("\n")
}

function wrapDelegationContract(lines: readonly string[]): string {
  return wrapTerminalPolicy(DELEGATION_CONTRACT_TAG, "Delegation Contract (Authoritative)", [
    ...lines,
    "This contract overrides any skill, model calibration, generated-adapter compatibility text, or other prompt layer that suggests broader delegation.",
  ])
}

function compressionPolicyFor(name: string): string {
  const lines = [
    "Apply this policy only when the current execution is a subagent session and a `compress` tool is available.",
    "If `compress` is unavailable, do not propose, simulate, or attempt compression.",
    "A long conversation, a high message count, one large tool result, or a stage boundary is not sufficient.",
    "Trustworthy capacity or size information alone is insufficient: do not proactively compress.",
    "When no trustworthy capacity signal or size estimate exists, do not compress proactively.",
    "Emergency compression is allowed only when an explicit capacity warning, context-budget signal, or concrete evidence shows the next bounded task cannot fit. Remove only the smallest closed range needed to continue safely.",
    "Preserve the task goal, constraints, current state, pending work, decisions, paths, interfaces, and necessary evidence.",
    "Never compress the active phase, unresolved errors, or source material still needed for exact quotation or verification.",
    "",
    "### Completed large-exploration recommendation",
    "This recommended proactive path applies only when every condition holds:",
    "- The exploration is completely finished; no file, search branch, or evidence question from that batch remains open.",
    "- A trustworthy estimate shows that the completed exploration introduced more than 100k tokens of source material into the current context.",
    "- Required findings, paths, decisions, constraints, and exact evidence that must survive have been materialized in the response or a durable note.",
    "- The selected raw exploration range is closed and no longer needed verbatim.",
    "- The same subagent will continue into a subsequent synthesis, planning, implementation, or review phase within the same assignment. If exploration completes the assignment and the subagent will return immediately, do not compress.",
    "This is a recommendation, not a mandatory tool call. If the token estimate is unavailable, do not invent it. Never compress during an active exploration, even if cumulative reads appear large.",
  ]

  if (isReviewAgentName(name)) {
    lines.push(
      "",
      "### Additional continued Reviewer/Oracle proactive exception (~130k guardrail)",
      "The common emergency and completed >100k exploration paths remain independently available. This is an additional path only for other closed review material.",
      "This additional path is available only when every condition holds:",
      "- The caller explicitly continued this same review session inside the current review stage rather than starting a fresh consultation or crossing a stage boundary.",
      "- A substantial phase has closed, such as a large read/search batch with recorded findings or a review pass with stable conclusions.",
      "- Those conclusions have been materialized in a response or durable note.",
      "- The selected range is closed and is no longer needed verbatim by the active review.",
      "- The same session is expected to continue; stage-ending compression with no expected follow-up is forbidden.",
      "- Trustworthy estimates indicate approximately 130k or more current context, at least 50k removable closed context, and either a real capacity signal or about ten additional model turns.",
      "These constraints do not prohibit a bounded follow-up under either common path when its own conditions are met.",
      "If any estimate is unavailable, do not invent it; only this additional path becomes unavailable, while the common paths (the emergency and completed >100k exploration paths) remain independently available under their own conditions. A single completed tool call is not a phase boundary.",
    )
  }

  return wrapTerminalPolicy(COMPRESSION_POLICY_TAG, "Subagent Compression Policy", lines)
}

function reviewSessionEfficiencyPolicy(): string {
  return wrapTerminalPolicy(REVIEW_SESSION_EFFICIENCY_POLICY_TAG, "Review Session Efficiency Policy", [
    "A review stage is one role, one authoritative artifact or decision target, and one review objective from initial dispatch through corrections until approval or receipt, abandonment, or handoff to another workflow phase.",
    "Continue the same reviewer or plan-critic `task_id` for corrections and rechecks inside that stage.",
    "A plan-critic rejection followed by a corrected version of the same plan remains the same stage; reviewer findings followed by fixes to the same implementation review also remain the same stage.",
    "Start a fresh session at every stage boundary: design review to plan review, plan-critic approval to implementation, implementation to final acceptance, or any change of role, artifact, or review objective.",
    "Also start fresh when prior context is unavailable or invalid for the current target, continuation fails, or intentionally independent evidence is required.",
    "Do not fan out additional reviewers merely because profiles or tiers are configured. Existing reviewer-selection rules remain authoritative.",
    "On continuation, supply the current authoritative artifact path/revision, the files changed since the previous pass, changed plan sections when applicable, and new or updated evidence. This focus manifest avoids repeated broad exploration but never excuses the reviewer or plan-critic from reading the current authoritative artifact required for its verdict.",
    "Do not paste the whole accumulated conversation when the current artifact plus change manifest and evidence are sufficient.",
    "A timeout, partial response, stale-revision receipt, or failed continuation is not approval.",
  ])
}

function shellSafetyPolicy(): string {
  const prompt = getShellSafetyPrompt().trim()
  return prompt ? `<${SHELL_SAFETY_TAG}>\n${prompt}\n</${SHELL_SAFETY_TAG}>` : ""
}

function workflowBoundariesPolicy(): string {
  return wrapTerminalPolicy(WORKFLOW_BOUNDARIES_TAG, "Shared Workflow Boundaries", [
    "Keep the authoritative role, requested scope, acceptance, and permissions. Research, explanation, planning, and review do not authorize implementation. Escalate changes to scope/acceptance, security/data guarantees, public APIs/protocols, permissions, or irreversible actions. Git authorization is operation-specific: implement/fix is not commit; commit is not push, tag, rebase, or release.",
    "A user refusal cannot be bypassed with another tool, path, command, or agent. For a permission denial, follow only the host's expressly permitted approval path; otherwise stop that operation.",
    "The orchestrator owns planner/critic dispatch, workflow coordination, and final acceptance. Complex product behavior implementation requires planner → plan-critic → implementation unless the governing policy permits a limited/simple/low-risk/bounded exception or the user explicitly requests a skip; state the applicable exception. Workers never start nested workflows or claim the parent goal complete. Explicit process and safety requirements remain binding.",
    "Reuse passing evidence by relevance: rerun affected or missing checks when behavior/interfaces change, not unchanged checks for reassurance. Workers run lightweight local checks; the orchestrator consolidates global verification. Report unresolved blockers, harness failures, and unverified requirements honestly; never weaken a valid failing check to claim completion.",
    "Artifacts state final requirements/design/behavior, not development histories or rejected alternatives; history belongs in Git except chronological documents. Product specs/plans alone belong in docs/superpowers/specs/ and docs/superpowers/plans/; keep other coordination in conversation or task-owned temporary plans. Uncommitted edits do not erase committed API/security/data/permission contracts.",
    "Tests protect valid behavior and external boundaries, never incidental prose, package metadata, local environment snapshots, or removed components' absence. Update tests for changed requirements and delete dedicated tests for removed components. Preserve real safety/protocol/integrity coverage.",
    "Zero tolerance: immediately abort invented hash/receipt locks, redundant verification, ceremony tests, gate inflation, and unnecessary confirmation. Discard only task-owned artifacts they produced, disclose the correction briefly, and continue authorized work; never resume the prohibited behavior under another name. Required integrity/release checks and substantive approval boundaries are not optional.",
  ])
}

function terminalPromptSuffixFor({
  name,
  includeCompressionPolicy,
  includeReviewSessionEfficiency = false,
  avoidAiSlopBrief,
  compressionIdentity = name,
}: {
  name: string
  includeCompressionPolicy: boolean
  includeReviewSessionEfficiency?: boolean
  avoidAiSlopBrief: string
  compressionIdentity?: string
}): string {
  const policies = [
    shellSafetyPolicy(),
    workflowBoundariesPolicy(),
    avoidAiSlopBrief ? `<${AVOID_AI_SLOP_TAG}>\n${avoidAiSlopBrief}\n</${AVOID_AI_SLOP_TAG}>` : "",
    includeCompressionPolicy ? compressionPolicyFor(compressionIdentity) : "",
    includeReviewSessionEfficiency ? reviewSessionEfficiencyPolicy() : "",
    delegationContractFor(name),
  ].filter((policy): policy is string => policy.length > 0)
  return policies.join("\n\n")
}

function delegationContractFor(name: string): string {
  const planningIdentity = parsePlanningAgentName(name)
  const readOnlyReviewRole = isReviewAgentName(name) || planningIdentity?.role === "plan-critic"
  if (UTILITY_LEAF_AGENT_SET.has(name)) {
    return wrapDelegationContract([
      "This role is a utility leaf agent. Do not dispatch any subagent.",
      "Complete the bounded assignment with direct tools and return the result to the caller.",
    ])
  }

  if (planningIdentity?.role === "planner") {
    return wrapDelegationContract([
      "Use direct tools first. Delegate only when direct tools are insufficient and a separate bounded research result materially improves completion.",
      `Allowed utility targets: ${formatTargets(READ_ONLY_UTILITY_AGENTS)}.`,
      "If repository evidence cannot settle a genuinely difficult decision, return the blocker to the orchestrator for optional `hard-reasoning`; strict or high-risk conditions alone do not qualify, and you must not dispatch a decision agent yourself.",
      "`quick` is forbidden. Do not dispatch `plan-critic`, any Reviewer profile, any Oracle profile, implementation agents, decision agents, or routine review checks.",
      "Return the completed plan to the caller. Difficult-decision routing, formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review are orchestrator-owned.",
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
      "Do not call `orchestrator`, `builder`, `planner`, `clarifier`, `plan-critic`, any Reviewer profile (`reviewer`, `reviewer-low`, `reviewer-high`, `reviewer-max`), any Oracle profile (`oracle`, `oracle-2nd`, configured `oracle-3rd`…`oracle-9th`, and their `low`/`high`/`max` tier variants), `normal-task`, `deep`, `complex`, or `cross-cutting`.",
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
  selectedModel: string | undefined,
  promptName: string,
): string {
  const chain =
    override?.requirement?.fallbackChain?.length
      ? override.requirement.fallbackChain
      : agent.requirement.fallbackChain
  const prefModel = selectedModel ?? chain[0]?.model ?? ""
  const modelCalibrations = pickModelCalibrationVariants(prefModel)
    .map((variant) => getDeepworkPrompt(variant))
  const variant = pickDeepworkVariantForAgent({
    agentName: promptName,
    preferenceModel: prefModel,
  })
  const base = getDeepworkPrompt(variant)
  const plannerCalibration = variant === "planner"
    ? getDeepworkPrompt(pickModelBaseCalibrationVariant(prefModel) ?? "default")
    : ""
  return joinPromptLayers([
    base,
    plannerCalibration,
    workflow === "codex" ? getDeepworkPrompt("codex") : "",
    ...modelCalibrations,
  ])
}

const DEEPWORK_MODE_BLOCK = /^<deepwork-mode>\s*([\s\S]*?)\s*<\/deepwork-mode>$/

function joinPromptLayers(prompts: readonly string[]): string {
  let wrapped = false
  const layers: string[] = []
  for (const prompt of prompts) {
    const trimmed = prompt.trim()
    if (!trimmed) continue
    const match = trimmed.match(DEEPWORK_MODE_BLOCK)
    const body = (match?.[1] ?? trimmed).trim()
    if (match) wrapped = true
    if (body && !layers.includes(body)) layers.push(body)
  }
  const joined = layers.join("\n\n---\n\n")
  return wrapped && joined ? `<deepwork-mode>\n\n${joined}\n\n</deepwork-mode>` : joined
}

function promptForBuiltinAgent(
  agent: Agent,
  override: NormalizedShorthand | undefined,
  workflow: string,
  selectedModel?: string,
): string {
  const promptName = agent.promptSource ?? agent.name
  const rolePrompt = getAgentPrompt(promptName).trim()
  const modelPrompt = deepworkPromptForAgent(agent, override, workflow, selectedModel, promptName).trim()
  const prompt = !rolePrompt
    ? modelPrompt
    : !modelPrompt
      ? rolePrompt
      : `${rolePrompt}\n\n---\n\n<workflow-model-calibration>\nThe role prompt above is authoritative for this agent's scope, permissions, and output contract. Use the selected workflow guidance below only for reliability and general execution discipline when it does not conflict with the role prompt.\n\n${modelPrompt}\n</workflow-model-calibration>`
  return prompt
}

function promptForBuiltinCategory(
  categoryName: string,
  workflow: string,
  selectedModel: string,
): string {
  const rolePrompt = getCategoryPrompt(categoryName).trim()
  const modelID = selectedModel
  const categoryCalibration = getCategoryModelCalibration(categoryName, modelID).trim()
  const modelBase = pickModelBaseCalibrationVariant(modelID) ?? "default"
  const modelCalibrations = pickModelCalibrationVariants(modelID)
    .map((variant) => getDeepworkPrompt(variant).trim())
  const calibration = joinPromptLayers([
    getDeepworkPrompt(modelBase).trim(),
    workflow === "codex" ? getDeepworkPrompt("codex").trim() : "",
    categoryCalibration,
    ...modelCalibrations,
  ])
  const calibrationIntro = calibration
    ? "The category role prompt above is authoritative for this agent's scope, permissions, and output contract. Use the workflow/model guidance below only for model calibration when it does not conflict with the category role prompt."
    : ""
  const prompt = !rolePrompt
    ? calibration
    : !calibration
      ? rolePrompt
      : `${rolePrompt}\n\n---\n\n<workflow-model-calibration>\n${calibrationIntro}\n\n${calibration}\n</workflow-model-calibration>`
  return prompt
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
  logger?: SubagentDepthDiagnosticLogger
  selectRegistrationModel?: (input: {
    agentName: string
    requirement: ModelRequirement
    requirementSource: RequirementSource
    selectedModel: string
  }) => string | undefined
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
  promptModel?: string
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
  catalogBeforeUserRequirement?: boolean
}): PrimarySelection {
  if (args.existingModel) return { model: args.existingModel, source: "existing-model" }
  const catalogModel = args.allowCatalogUpgrade
    && (args.requirementSource !== "user-config" || args.catalogBeforeUserRequirement)
    ? selectCatalogModel(args.target, args.agentName, args.requirement)
    : undefined
  if (catalogModel) return { model: catalogModel, source: "catalog-upgrade" }
  if (args.requirementSource === "user-config") {
    return { model: fmtModel(args.requirement.fallbackChain[0]!), source: "user-requirement" }
  }
  return { model: fmtModel(args.requirement.fallbackChain[0]!), source: "builtin-requirement" }
}

function promptModelFromRoute(model: string): string {
  return model.slice(model.indexOf("/") + 1)
}

function selectRegistrationPrimary(
  handler: ConfigHandlerBaseArgs,
  input: Parameters<typeof selectRoutePrimary>[0],
): PrimarySelection & { promptModel: string } {
  const primary = selectRoutePrimary(input)
  const selectedModel = handler.selectRegistrationModel?.({
    agentName: input.agentName,
    requirement: input.requirement,
    requirementSource: input.requirementSource,
    selectedModel: primary.model,
  })
  return selectedModel
    ? { ...primary, model: selectedModel, promptModel: selectedModel }
    : { ...primary, promptModel: promptModelFromRoute(primary.model) }
}

function hasExplicitRouteSelection(cfg: OcmmConfig, name: string): boolean {
  return [cfg.agents?.[name], cfg.categories?.[name]].some((entry) =>
    entry !== undefined && ["model", "models", "fallbackModels", "requirement", "alias"].some((field) =>
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

type ManagedAgentProfile = {
  name: string
  requirement: ModelRequirement
  registration: AgentProfileRegistrationOverrides
  resolutionSource: "user-config" | "agent-default"
  suppressCatalogUpgrade: boolean
  promptSource: string
  mode: "all" | "subagent"
}

function expandManagedAgentProfiles(cfg: OcmmConfig): ManagedAgentProfile[] {
  const input = { agents: cfg.agents, disabledAgents: cfg.disabledAgents }
  const reviewProfiles: ManagedAgentProfile[] = expandReviewAgents(input).map((profile) => ({
    name: profile.name,
    requirement: profile.requirement,
    registration: profile.registration,
    resolutionSource: profile.resolutionSource,
    suppressCatalogUpgrade: profile.suppressCatalogUpgrade,
    promptSource: profile.promptSource,
    mode: "subagent",
  }))
  const planningProfiles: ManagedAgentProfile[] = expandPlanningAgents(input).map((profile) => ({
    name: profile.name,
    requirement: profile.requirement,
    registration: profile.registration,
    resolutionSource: profile.resolutionSource,
    suppressCatalogUpgrade: profile.suppressCatalogUpgrade,
    promptSource: profile.policy.promptSource,
    mode: profile.policy.mode,
  }))
  return [...reviewProfiles, ...planningProfiles]
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
  const logger = args.logger ?? log
  const reportSubagentDepth = createSubagentDepthDiagnosticReporter(logger)
  const reportCategoryAvailability = createCategoryAvailabilityDiagnosticReporter(logger)
  const skillRegistrations = new WeakMap<Record<string, unknown>, SkillRegistration>()
  const agentBriefRegistrations = new WeakMap<Record<string, unknown>, Map<string, string>>()
  const compatPromptRegistrations = new WeakMap<Record<string, unknown>, Map<string, string>>()

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
    reportSubagentDepth(target, cfg)
    const registered = registerSkillsAndCommands(target, cfg, args.skillsRoot, skillRegistrations)
    const avoidAiSlopBrief = registered.avoidAiSlop ? getAvoidAiSlopPrompt().trim() : ""
    const registeredMcps = registerMcps(target, cfg, args.cwd)

    if (!cfg.registerBuiltinAgents) {
      if (!avoidAiSlopBrief && isRecord(target.agent)) {
        for (const [name, brief] of agentBriefRegistrations.get(target) ?? []) {
          const entry = target.agent[name]
          if (!isRecord(entry) || typeof entry.prompt !== "string") continue
          const block = `<${AVOID_AI_SLOP_TAG}>\n${brief}\n</${AVOID_AI_SLOP_TAG}>`
          entry.prompt = entry.prompt.replace(TERMINAL_POLICY_BLOCK, (suffix) => suffix.replace(block, ""))
        }
        agentBriefRegistrations.delete(target)
      }
      logger.info(`config: registered ${registered.skills} skills, ${registered.commands} commands, ${registeredMcps} MCPs`)
      if (registryManaged && routeBuild && generation !== undefined) {
        args.routeRegistry.publish(generation, routeBuild.nextRoutes)
      }
      return
    }

    if (!registryManaged && !isRecord(target.agent)) target.agent = {}
    const agentMap = registryManaged
      ? cloneAgentMap(isRecord(target.agent) ? target.agent : {})
      : target.agent as Record<string, unknown>
    const agentBriefs = new Map<string, string>()
    const existingModels = new Map<string, string>()
    const existingPrompts = new Set<string>()
    const previousCompatPrompts = compatPromptRegistrations.get(target)
    for (const [name, raw] of Object.entries(agentMap)) {
      if (!isRecord(raw)) continue
      if (typeof raw.model === "string") existingModels.set(name, raw.model)
      if (typeof raw.prompt === "string" && previousCompatPrompts?.get(name) !== raw.prompt) {
        existingPrompts.add(name)
      }
    }

    const disabled = new Set(cfg.disabledAgents ?? [])
    const primarySelections = new Map<string, PrimarySelection>()
    const selectPrimary = (input: Parameters<typeof selectRoutePrimary>[0]) => {
      const primary = selectRegistrationPrimary(args, input)
      primarySelections.set(input.agentName, primary)
      return primary
    }

    for (const [name, raw] of Object.entries(agentMap)) {
      const disabledReview = parseReviewAgentName(name) !== null && isExpandedReviewAgentDisabled(name, {
        agents: cfg.agents,
        disabledAgents: cfg.disabledAgents,
      })
      const disabledPlanning = parsePlanningAgentName(name) !== null && isExpandedPlanningAgentDisabled(name, {
        agents: cfg.agents,
        disabledAgents: cfg.disabledAgents,
      })
      if ((disabled.has(name) || disabledReview || disabledPlanning) && isRecord(raw)) raw.disable = true
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
      if (parseReviewAgentName(a.name) || parsePlanningAgentName(a.name)) continue
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
      const primary = selectPrimary({
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
      const prompt = promptForBuiltinAgent(a, norm, cfg.workflow, primary.promptModel)
      const mode = a.name === "orchestrator" || a.name === "builder"
        ? "primary"
        : a.name === "planner"
          ? "all"
          : "subagent"
      const extras: AgentExtras = {}
      if (prompt) extras.prompt = prompt
      extras.mode = mode
      extras.model = primary.model
      extras.promptPrefix = buildLocaleGuidance(cfg.locale)
      const terminalSuffix = terminalPromptSuffixFor({
        name: a.name,
        avoidAiSlopBrief,
        includeCompressionPolicy: mode !== "primary",
        includeReviewSessionEfficiency: a.name === "orchestrator",
      })
      if (terminalSuffix) extras.promptSuffix = terminalSuffix
      if (applyAgentEntry(agentMap, a, norm, extras)) {
        if (avoidAiSlopBrief) agentBriefs.set(a.name, avoidAiSlopBrief)
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

    for (const profile of expandManagedAgentProfiles(cfg)) {
      const synthetic: Agent = {
        name: profile.name,
        ...(profile.registration.description ? { description: profile.registration.description } : {}),
        requirement: profile.requirement,
        promptSource: profile.promptSource,
      }
      const effective = {
        requirement: profile.requirement,
        source: profile.resolutionSource,
      }
      const primary = selectPrimary({
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
        catalogBeforeUserRequirement:
          effective.source === "user-config" && !profile.suppressCatalogUpgrade,
      })
      let prompt = promptForBuiltinAgent(synthetic, { requirement: profile.requirement }, cfg.workflow, primary.promptModel)
      if (profile.registration.promptAppend) prompt = `${prompt}\n\n${profile.registration.promptAppend.trim()}`
      const extras: AgentExtras = {
        mode: profile.mode,
        model: primary.model,
        promptPrefix: buildLocaleGuidance(cfg.locale),
      }
      if (prompt) extras.prompt = prompt
      const terminalSuffix = terminalPromptSuffixFor({
        name: profile.name,
        avoidAiSlopBrief,
        includeCompressionPolicy: true,
        compressionIdentity: profile.name,
      })
      if (terminalSuffix) extras.promptSuffix = terminalSuffix
      if (applyAgentEntry(agentMap, synthetic, {
        ...(profile.registration.description ? { description: profile.registration.description } : {}),
        requirement: profile.requirement,
        ...(profile.registration.permission ? { permission: profile.registration.permission } : {}),
      }, extras, profile.registration)) {
        if (avoidAiSlopBrief) agentBriefs.set(profile.name, avoidAiSlopBrief)
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
      if (c.optIn) {
        // Opt-in category: register only when the user explicitly names it in
        // `categories` or `agents` config.
        if (!hasOwnAgentEntry(cfg, c.name) && cfg.categories?.[c.name] === undefined) continue
      } else if (registryManaged && hasOwnAgentEntry(cfg, c.name) && !agentOverride?.requirement?.fallbackChain?.length) {
        continue
      }
      const categoryOverride = normalizeShorthand(cfg.categories?.[c.name])
      const effective = resolveRouteRequirement(cfg, c.name)
      if (!effective) continue
      const baseAgent = categoryAsAgent(c, effective.requirement)
      const merged: NormalizedShorthand | undefined =
        agentOverride ?? categoryOverride
      const primary = selectPrimary({
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
      const extras: AgentExtras = {
        mode: "subagent",
        promptPrefix: buildLocaleGuidance(cfg.locale),
      }
      const prompt = promptForBuiltinCategory(c.name, cfg.workflow, primary.promptModel)
      if (prompt) extras.prompt = prompt
      extras.model = primary.model
      const terminalSuffix = terminalPromptSuffixFor({
        name: c.name,
        avoidAiSlopBrief,
        includeCompressionPolicy: true,
        compressionIdentity: c.name,
      })
      if (terminalSuffix) extras.promptSuffix = terminalSuffix
      if (applyAgentEntry(agentMap, baseAgent, merged, extras)) {
        if (avoidAiSlopBrief) agentBriefs.set(c.name, avoidAiSlopBrief)
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
        reportCategoryAvailability({
          name: c.name,
          target,
          requirement: effective.requirement,
          requirementSource: effective.source,
          primarySource: primary.source,
          selectedModel: primary.model,
        })
      }
    }

    if (cfg.agents) {
      for (const name of Object.keys(cfg.agents)) {
        if (disabled.has(name)) continue
        if (BUILTIN_AGENTS.some((b) => b.name === name)) continue
        if (BUILTIN_CATEGORIES.some((c) => c.name === name)) continue
        if (parseReviewAgentName(name)) continue
        if (parsePlanningAgentName(name)) continue
        const norm = normalizeAgentShorthand(name, cfg.agents)
        if (!norm?.requirement?.fallbackChain?.length) continue
        const effective = resolveRouteRequirement(cfg, name)
        if (!effective) continue
        const primary = selectPrimary({
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
        const registeredAgent = applyAgentEntry(agentMap, synthetic, norm, {
          model: primary.model,
          promptPrefix: buildLocaleGuidance(cfg.locale),
          promptPrefixWithoutBody: true,
        })
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
        const primary = selectPrimary({
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
        if (applyAgentEntry(agentMap, synthetic, merged, {
          mode: "subagent",
          model: primary.model,
          promptPrefix: buildLocaleGuidance(cfg.locale),
          promptPrefixWithoutBody: true,
        })) {
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
          reportCategoryAvailability({
            name,
            target,
            requirement: effective.requirement,
            requirementSource: effective.source,
            primarySource: primary.source,
            selectedModel: primary.model,
          })
        }
      }
    }

    const compatAliasPrompts = new Map<string, string>()
    registerCompatAgentAliases({
      agentMap,
      disabled,
      cfg,
      registryManaged,
      existingModels,
      existingPrompts,
      primarySelections,
      avoidAiSlopBrief,
      agentBriefs,
      generatedPrompts: compatAliasPrompts,
    })
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

    logger.info(
      `config: registered ${Object.keys(agentMap).length} agents (built-in + categories + user), ${registered.skills} skills, ${registered.commands} commands, ${registeredMcps} MCPs`,
    )
    if (registryManaged && routeBuild && generation !== undefined && args.routeRegistry.publish(generation, routeBuild.nextRoutes)) {
      target.agent = agentMap
    }
    if (!registryManaged || target.agent === agentMap) {
      agentBriefRegistrations.set(target, agentBriefs)
      compatPromptRegistrations.set(target, compatAliasPrompts)
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

  for (const name of READ_ONLY_WORKFLOW_AGENTS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: taskAllowlist(READ_ONLY_UTILITY_AGENTS) }, false)
  }

  for (const [name, entry] of Object.entries(agentMap)) {
    if (!isRecord(entry)) continue
    const planningIdentity = parsePlanningAgentName(name)
    if (planningIdentity?.role === "planner") {
      mergePermission(entry, {
        task: taskAllowlist(READ_ONLY_UTILITY_AGENTS),
        question: "allow",
      }, false)
    } else if (isReviewAgentName(name) || planningIdentity?.role === "plan-critic") {
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

function registerCompatAgentAliases(args: {
  agentMap: Record<string, unknown>
  disabled: Set<string>
  cfg: OcmmConfig
  registryManaged: boolean
  existingModels: ReadonlyMap<string, string>
  existingPrompts: ReadonlySet<string>
  primarySelections: ReadonlyMap<string, PrimarySelection>
  avoidAiSlopBrief: string
  agentBriefs: Map<string, string>
  generatedPrompts: Map<string, string>
}): void {
  for (const { alias, target: targetName } of COMPAT_AGENT_ALIASES) {
    if (args.disabled.has(alias) || args.disabled.has(targetName) || isCompatAliasDisabled(alias, targetName, args.cfg.agents)) {
      if (args.registryManaged) delete args.agentMap[alias]
      continue
    }
    const source = args.agentMap[targetName]
    if (!isRecord(source) || source.disable === true) {
      if (args.registryManaged) delete args.agentMap[alias]
      continue
    }
    if (!args.existingPrompts.has(targetName) && typeof source.prompt === "string") {
      args.generatedPrompts.set(targetName, source.prompt)
    }

    const existing = isRecord(args.agentMap[alias]) ? (args.agentMap[alias] as Record<string, unknown>) : {}
    if (existing.disable === true) continue
    const aliasEntry = { ...source, ...existing }
    if (typeof aliasEntry.description !== "string") {
      aliasEntry.description = `Compatibility alias for @${targetName}.`
    }

    const preservesHostPrompt = args.existingPrompts.has(alias) && typeof existing.prompt === "string"
    if (preservesHostPrompt) {
      aliasEntry.prompt = prependPromptPrefix(existing.prompt as string, buildLocaleGuidance(args.cfg.locale))
    } else if (args.existingPrompts.has(targetName) && typeof source.prompt === "string") {
      aliasEntry.prompt = prependPromptPrefix(source.prompt, buildLocaleGuidance(args.cfg.locale))
    } else {
      const sourceAgent = BUILTIN_AGENTS.find(({ name }) => name === targetName)
      const selectedModel = typeof aliasEntry.model === "string" ? aliasEntry.model : undefined
      const ownPromptModel = args.primarySelections.get(alias)?.promptModel
        ?? (args.existingModels.has(alias) && selectedModel !== undefined ? promptModelFromRoute(selectedModel) : undefined)
      const promptModel = ownPromptModel ?? args.primarySelections.get(targetName)?.promptModel
        ?? (selectedModel !== undefined ? promptModelFromRoute(selectedModel) : undefined)
      const rolePrompt = sourceAgent
        ? promptForBuiltinAgent(
            sourceAgent,
            normalizeAgentShorthand(alias, args.cfg.agents),
            args.cfg.workflow,
            promptModel,
          )
        : ""
      aliasEntry.prompt = prependPromptPrefix(rolePrompt, buildLocaleGuidance(args.cfg.locale))
    }

    const terminalSuffix = terminalPromptSuffixFor({
      name: alias,
      avoidAiSlopBrief: args.avoidAiSlopBrief,
      includeCompressionPolicy: aliasEntry.mode !== "primary",
      compressionIdentity: isReviewAgentName(alias) ? alias : targetName,
    })
    if (terminalSuffix) {
      aliasEntry.prompt = appendPromptSuffix(String(aliasEntry.prompt), terminalSuffix)
      if (args.avoidAiSlopBrief) args.agentBriefs.set(alias, args.avoidAiSlopBrief)
    }
    args.agentMap[alias] = aliasEntry
    if (!preservesHostPrompt) args.generatedPrompts.set(alias, String(aliasEntry.prompt))
  }
}

type SkillRegistration = {
  paths: Set<string>
  commands: Map<string, unknown>
}

function registerSkillsAndCommands(
  target: Record<string, unknown>,
  cfg: OcmmConfig,
  skillsRoot: string = DEFAULT_SKILLS_ROOT,
  registrations: WeakMap<Record<string, unknown>, SkillRegistration>,
): { skills: number; commands: number; avoidAiSlop: boolean } {
  const previous = registrations.get(target)
  if (previous) {
    if (isRecord(target.skills) && Array.isArray(target.skills.paths)) {
      target.skills.paths = target.skills.paths.filter((path) => !previous.paths.has(path))
    }
    if (isRecord(target.command)) {
      for (const [name, command] of previous.commands) {
        if (target.command[name] === command) delete target.command[name]
      }
    }
  }
  const registration: SkillRegistration = { paths: new Set(), commands: new Map() }
  registrations.set(target, registration)
  const disabledSkills = [...cfg.skills.disable, ...(cfg.disabledSkills ?? [])]
  const selected = loadSharedSkills({
    rootDir: skillsRoot,
    sources: cfg.skills.sources,
    enable: cfg.skills.enable,
    disable: disabledSkills,
  })

  const skillDirs = new Set<string>()
  for (const skill of selected) {
    skillDirs.add(skill.path)
  }
  if (cfg.workflow === "v1") {
    const v1SkillRoot = join(skillsRoot, "v1")
    if (existsSync(v1SkillRoot)) skillDirs.add(v1SkillRoot)
  }

  if (skillDirs.size > 0) {
    if (!isRecord(target.skills)) target.skills = {}
    const skillsConfig = target.skills as Record<string, unknown>
    if (!Array.isArray(skillsConfig.paths)) skillsConfig.paths = []
    const paths = skillsConfig.paths as unknown[]
    const seen = new Set(paths.filter((p): p is string => typeof p === "string"))

    for (const dir of skillDirs) {
      if (!seen.has(dir)) {
        paths.push(dir)
        seen.add(dir)
        registration.paths.add(dir)
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
  ], new Set(cfg.disabledCommands ?? []), registration.commands)

  return { skills: selected.length, commands, avoidAiSlop: selected.some((skill) => skill.name === "avoid-ai-slop") }
}

function registerCommands(
  target: Record<string, unknown>,
  definitions: readonly CommandDefinition[],
  disabled: ReadonlySet<string>,
  registeredCommands: Map<string, unknown>,
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
    if ("path" in definition) registeredCommands.set(definition.name, entry)
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
