import Schema from "@deepseek-ai/schemastery";
import type { DshContext, DshSettingsRegistry } from "./dsh-types.js";
import { DEFAULT_DSMM_LSP_SETTINGS, resolveLspSettings } from "./lsp.js";
import type { DsmmLspSettings } from "./lsp.js";
import { DSMM_ROLE_IDS } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import { DSMM_SKILL_NAMES } from "./skills.js";
import type { DsmmSkillName } from "./skills.js";

export { DSMM_SKILL_NAMES, MVP_SKILL_NAMES } from "./skills.js";
export type { DsmmSkillName, MvpSkillName } from "./skills.js";

export type DeepseekCalibration = "off" | "auto" | "strict";
export type DeepseekDefaultReasoningEffort = "off" | "low" | "high";
export type DsmmFinalReviewPolicy = "simple-oracle-complex-reviewer" | "reviewer-only" | "off";
export type DsmmGuardScope = "deepwork-or-dsmm-agent" | "always" | "off";
export type DsmmGitWritePolicy = "ask" | "deny" | "off";

export interface DsmmWorkflowSettings {
  policy: "risk-based" | "legacy";
  strictGates: boolean;
  reviewCap: number;
  finalReviewPolicy: DsmmFinalReviewPolicy;
}

export interface DsmmPresetSettings {
  materialize: boolean;
  root?: string;
}

export interface DsmmGuardSettings {
  scope: DsmmGuardScope;
  shellCommandSafety: boolean;
  gitWriteGuard: DsmmGitWritePolicy;
  toolOutputTruncation: {
    enabled: boolean;
    maxInlineBytes: number;
  };
  planFormatValidation: boolean;
  questionLabelHelper: {
    enabled: boolean;
    maxLabelChars: number;
  };
  todoDisciplineHelper: boolean;
}

export interface DsmmRecoveryRoute {
  provider: string;
  model: string;
}

export interface DsmmRuntimeRecoverySettings {
  enabled: boolean;
  retryOnStatusCodes: number[];
  retryOnCodes: string[];
  fallbackRoutes: DsmmRecoveryRoute[];
  maxFallbackAttempts: number;
  idleContinuation: {
    enabled: boolean;
    maxContinuations: number;
    prompt: string;
  };
}

type DsmmGuardConfig = Partial<Omit<DsmmGuardSettings, "toolOutputTruncation" | "questionLabelHelper">> & {
  toolOutputTruncation?: Partial<DsmmGuardSettings["toolOutputTruncation"]>;
  questionLabelHelper?: Partial<DsmmGuardSettings["questionLabelHelper"]>;
};

type DsmmRuntimeRecoveryConfig = Partial<Omit<DsmmRuntimeRecoverySettings, "fallbackRoutes" | "idleContinuation">> & {
  fallbackRoutes?: Array<Partial<DsmmRecoveryRoute>>;
  idleContinuation?: Partial<DsmmRuntimeRecoverySettings["idleContinuation"]>;
};

export interface DsmmPluginConfig {
  modeName?: string;
  section?: string;
  deepseekV4ProCalibration?: DeepseekCalibration;
  deepseekV4ProDefaultReasoningEffort?: DeepseekDefaultReasoningEffort;
  deepseekV4ProMaxReasoningPresets?: DsmmRoleId[];
  deepseekFlashCalibration?: DeepseekCalibration;
  deepseekFlashDefaultReasoningEffort?: DeepseekDefaultReasoningEffort;
  deepseekFlashMaxReasoningPresets?: DsmmRoleId[];
  defaultActive?: boolean;
  promptOrder?: number;
  skills?: Partial<Record<DsmmSkillName, boolean>>;
  roles?: Partial<Record<DsmmRoleId, boolean>>;
  presets?: Partial<DsmmPresetSettings>;
  workflow?: Partial<DsmmWorkflowSettings>;
  guards?: DsmmGuardConfig;
  runtimeRecovery?: DsmmRuntimeRecoveryConfig;
  lsp?: Partial<DsmmLspSettings>;
}

export interface DsmmSettings {
  modeName: string;
  defaultActive: boolean;
  promptOrder: number;
  deepseekV4ProCalibration: DeepseekCalibration;
  deepseekV4ProDefaultReasoningEffort: DeepseekDefaultReasoningEffort;
  deepseekV4ProMaxReasoningPresets: DsmmRoleId[];
  deepseekFlashCalibration: DeepseekCalibration;
  deepseekFlashDefaultReasoningEffort: DeepseekDefaultReasoningEffort;
  deepseekFlashMaxReasoningPresets: DsmmRoleId[];
  skills: Record<DsmmSkillName, boolean>;
  roles: Record<DsmmRoleId, boolean>;
  presets: DsmmPresetSettings;
  workflow: DsmmWorkflowSettings;
  guards: DsmmGuardSettings;
  runtimeRecovery: DsmmRuntimeRecoverySettings;
  lsp: DsmmLspSettings;
}

export const DSMM_SETTINGS_NAMESPACE = "dsmm";
export const DSMM_STATUS_COMMAND = "dsmm-status";

export interface RegisterSettingsOptions {
  onChange?: (settings: DsmmSettings) => void;
  install?: (readyCtx: DshContext, getSettings: () => DsmmSettings) => void;
}

export const DEFAULT_DSMM_SETTINGS: DsmmSettings = {
  modeName: "deepwork",
  defaultActive: false,
  promptOrder: 50,
  deepseekV4ProCalibration: "auto",
  deepseekV4ProDefaultReasoningEffort: "high",
  deepseekV4ProMaxReasoningPresets: ["dsmm-plan-critic", "dsmm-reviewer"],
  deepseekFlashCalibration: "auto",
  deepseekFlashDefaultReasoningEffort: "high",
  deepseekFlashMaxReasoningPresets: ["dsmm-plan-critic", "dsmm-reviewer"],
  skills: createDefaultSkillSettings(),
  roles: createDefaultRoleSettings(),
  presets: {
    materialize: false
  },
  workflow: {
    policy: "risk-based",
    strictGates: true,
    reviewCap: 5,
    finalReviewPolicy: "simple-oracle-complex-reviewer"
  },
  guards: {
    scope: "deepwork-or-dsmm-agent",
    shellCommandSafety: true,
    gitWriteGuard: "ask",
    toolOutputTruncation: {
      enabled: true,
      maxInlineBytes: 12000
    },
    planFormatValidation: true,
    questionLabelHelper: {
      enabled: true,
      maxLabelChars: 30
    },
    todoDisciplineHelper: true
  },
  runtimeRecovery: {
    enabled: false,
    retryOnStatusCodes: [429, 500, 502, 503, 504],
    retryOnCodes: [],
    fallbackRoutes: [],
    maxFallbackAttempts: 2,
    idleContinuation: {
      enabled: false,
      maxContinuations: 3,
      prompt: "Continue the current task from the durable goal or unfinished todo list. Do not repeat completed work."
    }
  },
  lsp: DEFAULT_DSMM_LSP_SETTINGS
};

function normalizeModeName(modeName: string | undefined): string {
  return modeName === DSMM_STATUS_COMMAND ? DEFAULT_DSMM_SETTINGS.modeName : modeName ?? DEFAULT_DSMM_SETTINGS.modeName;
}

function createDefaultSkillSettings(): Record<DsmmSkillName, boolean> {
  return Object.fromEntries(DSMM_SKILL_NAMES.map((id) => [id, true])) as Record<DsmmSkillName, boolean>;
}

function createDefaultRoleSettings(): Record<DsmmRoleId, boolean> {
  return Object.fromEntries(DSMM_ROLE_IDS.map((id) => [id, true])) as Record<DsmmRoleId, boolean>;
}

const SKILLS_SCHEMA = Schema.object({
  brainstorming: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills.brainstorming),
  "writing-plans": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["writing-plans"]),
  "requesting-code-review": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["requesting-code-review"]),
  "receiving-code-review": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["receiving-code-review"]),
  "subagent-driven-development": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["subagent-driven-development"]),
  "dispatching-parallel-agents": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["dispatching-parallel-agents"]),
  "remove-ai-slops": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["remove-ai-slops"])
});

const ROLES_SCHEMA = Schema.object(Object.fromEntries(
  DSMM_ROLE_IDS.map((id) => [id, Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles[id])])
)) as Schema<Partial<Record<DsmmRoleId, boolean>>>;

const PRESETS_SCHEMA = Schema.object({
  materialize: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.presets.materialize),
  root: Schema.string()
});

const FINAL_REVIEW_POLICY_SCHEMA = Schema.union([
  Schema.const("simple-oracle-complex-reviewer"),
  Schema.const("reviewer-only"),
  Schema.const("off")
]).default(DEFAULT_DSMM_SETTINGS.workflow.finalReviewPolicy);

const WORKFLOW_SCHEMA = Schema.object({
  policy: Schema.union([Schema.const("risk-based"), Schema.const("legacy")]).default(DEFAULT_DSMM_SETTINGS.workflow.policy),
  strictGates: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.workflow.strictGates),
  reviewCap: Schema.number().default(DEFAULT_DSMM_SETTINGS.workflow.reviewCap),
  finalReviewPolicy: FINAL_REVIEW_POLICY_SCHEMA
});

const WORKFLOW_CONFIG_SCHEMA = Schema.object({
  policy: Schema.union([Schema.const("risk-based"), Schema.const("legacy")]),
  strictGates: Schema.boolean(),
  reviewCap: Schema.number(),
  finalReviewPolicy: Schema.union([
    Schema.const("simple-oracle-complex-reviewer"), Schema.const("reviewer-only"), Schema.const("off")
  ])
});

const GUARD_SCOPE_SCHEMA = Schema.union([
  Schema.const("deepwork-or-dsmm-agent"),
  Schema.const("always"),
  Schema.const("off")
]).default(DEFAULT_DSMM_SETTINGS.guards.scope);

const GIT_WRITE_POLICY_SCHEMA = Schema.union([
  Schema.const("ask"),
  Schema.const("deny"),
  Schema.const("off")
]).default(DEFAULT_DSMM_SETTINGS.guards.gitWriteGuard);

const TOOL_OUTPUT_TRUNCATION_SCHEMA = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.toolOutputTruncation.enabled),
  maxInlineBytes: Schema.number().default(DEFAULT_DSMM_SETTINGS.guards.toolOutputTruncation.maxInlineBytes)
});

const QUESTION_LABEL_HELPER_SCHEMA = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.questionLabelHelper.enabled),
  maxLabelChars: Schema.number().default(DEFAULT_DSMM_SETTINGS.guards.questionLabelHelper.maxLabelChars)
});

const GUARDS_SCHEMA = Schema.object({
  scope: GUARD_SCOPE_SCHEMA,
  shellCommandSafety: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.shellCommandSafety),
  gitWriteGuard: GIT_WRITE_POLICY_SCHEMA,
  toolOutputTruncation: TOOL_OUTPUT_TRUNCATION_SCHEMA,
  planFormatValidation: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.planFormatValidation),
  questionLabelHelper: QUESTION_LABEL_HELPER_SCHEMA,
  todoDisciplineHelper: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.todoDisciplineHelper)
});

const RUNTIME_RECOVERY_IDLE_CONTINUATION_SCHEMA = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.runtimeRecovery.idleContinuation.enabled),
  maxContinuations: Schema.number().default(DEFAULT_DSMM_SETTINGS.runtimeRecovery.idleContinuation.maxContinuations),
  prompt: Schema.string().default(DEFAULT_DSMM_SETTINGS.runtimeRecovery.idleContinuation.prompt)
});

const RUNTIME_RECOVERY_SCHEMA = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.runtimeRecovery.enabled),
  retryOnStatusCodes: Schema.array(Number).default([...DEFAULT_DSMM_SETTINGS.runtimeRecovery.retryOnStatusCodes]),
  retryOnCodes: Schema.array(String).default([...DEFAULT_DSMM_SETTINGS.runtimeRecovery.retryOnCodes]),
  fallbackRoutes: Schema.array(Schema.object({
    provider: Schema.string(),
    model: Schema.string()
  })).default(DEFAULT_DSMM_SETTINGS.runtimeRecovery.fallbackRoutes.map((route) => ({ ...route }))),
  maxFallbackAttempts: Schema.number().default(DEFAULT_DSMM_SETTINGS.runtimeRecovery.maxFallbackAttempts),
  idleContinuation: RUNTIME_RECOVERY_IDLE_CONTINUATION_SCHEMA
});

const DEEPSEEK_CALIBRATION_SCHEMA = Schema.union([
  Schema.const("off"),
  Schema.const("auto"),
  Schema.const("strict")
]).default(DEFAULT_DSMM_SETTINGS.deepseekV4ProCalibration);

const DEEPSEEK_DEFAULT_REASONING_EFFORT_SCHEMA = Schema.union([
  Schema.const("off"),
  Schema.const("low"),
  Schema.const("high")
]).default(DEFAULT_DSMM_SETTINGS.deepseekV4ProDefaultReasoningEffort);

const DEEPSEEK_MAX_REASONING_PRESETS_SCHEMA = Schema.array(String)
  .default([...DEFAULT_DSMM_SETTINGS.deepseekV4ProMaxReasoningPresets]) as Schema<DsmmRoleId[]>;

const LSP_SCHEMA = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.lsp.enabled),
  serverName: Schema.string().default(DEFAULT_DSMM_SETTINGS.lsp.serverName),
  command: Schema.string().default(DEFAULT_DSMM_SETTINGS.lsp.command),
  args: Schema.array(String).default([...DEFAULT_DSMM_SETTINGS.lsp.args]),
  cwd: Schema.string().default(DEFAULT_DSMM_SETTINGS.lsp.cwd),
  env: Schema.dict(String).default({ ...DEFAULT_DSMM_SETTINGS.lsp.env }),
  toolCallTimeoutMs: Schema.number().default(DEFAULT_DSMM_SETTINGS.lsp.toolCallTimeoutMs),
  failOnStartupError: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.lsp.failOnStartupError)
});

export const DSMM_CONFIG_SCHEMA: Schema<DsmmPluginConfig> = Schema.object({
  modeName: Schema.string().default(DEFAULT_DSMM_SETTINGS.modeName),
  section: Schema.string(),
  defaultActive: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.defaultActive),
  promptOrder: Schema.number().default(DEFAULT_DSMM_SETTINGS.promptOrder),
  deepseekV4ProCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
  deepseekV4ProDefaultReasoningEffort: DEEPSEEK_DEFAULT_REASONING_EFFORT_SCHEMA,
  deepseekV4ProMaxReasoningPresets: DEEPSEEK_MAX_REASONING_PRESETS_SCHEMA,
  deepseekFlashCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
  deepseekFlashDefaultReasoningEffort: DEEPSEEK_DEFAULT_REASONING_EFFORT_SCHEMA,
  deepseekFlashMaxReasoningPresets: DEEPSEEK_MAX_REASONING_PRESETS_SCHEMA,
  skills: SKILLS_SCHEMA,
  roles: ROLES_SCHEMA,
  presets: PRESETS_SCHEMA,
  workflow: WORKFLOW_CONFIG_SCHEMA,
  guards: GUARDS_SCHEMA,
  runtimeRecovery: RUNTIME_RECOVERY_SCHEMA,
  lsp: LSP_SCHEMA
});

export const DSMM_SETTINGS_SCHEMA: Schema<DsmmSettings> = Schema.object({
  modeName: Schema.string().default(DEFAULT_DSMM_SETTINGS.modeName),
  defaultActive: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.defaultActive),
  promptOrder: Schema.number().default(DEFAULT_DSMM_SETTINGS.promptOrder),
  deepseekV4ProCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
  deepseekV4ProDefaultReasoningEffort: DEEPSEEK_DEFAULT_REASONING_EFFORT_SCHEMA,
  deepseekV4ProMaxReasoningPresets: DEEPSEEK_MAX_REASONING_PRESETS_SCHEMA,
  deepseekFlashCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
  deepseekFlashDefaultReasoningEffort: DEEPSEEK_DEFAULT_REASONING_EFFORT_SCHEMA,
  deepseekFlashMaxReasoningPresets: DEEPSEEK_MAX_REASONING_PRESETS_SCHEMA,
  skills: SKILLS_SCHEMA,
  roles: ROLES_SCHEMA as Schema<Record<DsmmRoleId, boolean>>,
  presets: PRESETS_SCHEMA,
  workflow: WORKFLOW_SCHEMA,
  guards: GUARDS_SCHEMA,
  runtimeRecovery: RUNTIME_RECOVERY_SCHEMA,
  lsp: LSP_SCHEMA
});

export function resolveConfig(config: DsmmPluginConfig = {}): DsmmSettings {
  return {
    modeName: normalizeModeName(config.modeName),
    defaultActive: config.defaultActive ?? DEFAULT_DSMM_SETTINGS.defaultActive,
    promptOrder: config.promptOrder ?? DEFAULT_DSMM_SETTINGS.promptOrder,
    deepseekV4ProCalibration: config.deepseekV4ProCalibration ?? DEFAULT_DSMM_SETTINGS.deepseekV4ProCalibration,
    deepseekV4ProDefaultReasoningEffort: config.deepseekV4ProDefaultReasoningEffort ?? DEFAULT_DSMM_SETTINGS.deepseekV4ProDefaultReasoningEffort,
    deepseekV4ProMaxReasoningPresets: resolveMaxReasoningPresets(config.deepseekV4ProMaxReasoningPresets, DEFAULT_DSMM_SETTINGS.deepseekV4ProMaxReasoningPresets),
    deepseekFlashCalibration: config.deepseekFlashCalibration ?? DEFAULT_DSMM_SETTINGS.deepseekFlashCalibration,
    deepseekFlashDefaultReasoningEffort: config.deepseekFlashDefaultReasoningEffort ?? DEFAULT_DSMM_SETTINGS.deepseekFlashDefaultReasoningEffort,
    deepseekFlashMaxReasoningPresets: resolveMaxReasoningPresets(config.deepseekFlashMaxReasoningPresets, DEFAULT_DSMM_SETTINGS.deepseekFlashMaxReasoningPresets),
    skills: { ...DEFAULT_DSMM_SETTINGS.skills, ...config.skills },
    roles: { ...DEFAULT_DSMM_SETTINGS.roles, ...config.roles },
    presets: resolvePresetSettings(config.presets),
    workflow: resolveWorkflowSettings(config.workflow),
    guards: resolveGuardSettings(config.guards),
    runtimeRecovery: resolveRuntimeRecoverySettings(config.runtimeRecovery),
    lsp: resolveLspSettings(config.lsp)
  };
}

function resolveMaxReasoningPresets(input: readonly unknown[] | undefined, defaults: readonly DsmmRoleId[]): DsmmRoleId[] {
  const requested = new Set(input ?? defaults);
  return DSMM_ROLE_IDS.filter((id) => requested.has(id));
}

export function isRoleEnabled(settings: DsmmSettings, role: DsmmRoleId): boolean {
  return settings.roles[role];
}

function resolvePresetSettings(config: DsmmPluginConfig["presets"]): DsmmPresetSettings {
  return {
    materialize: config?.materialize ?? DEFAULT_DSMM_SETTINGS.presets.materialize,
    ...(config?.root === undefined ? {} : { root: config.root })
  };
}

function resolveWorkflowSettings(config: DsmmPluginConfig["workflow"]): DsmmWorkflowSettings {
  const legacy = config !== undefined && (config.strictGates !== undefined || config.reviewCap !== undefined || config.finalReviewPolicy !== undefined);
  return {
    ...DEFAULT_DSMM_SETTINGS.workflow,
    ...config,
    policy: config?.policy ?? (legacy ? "legacy" : "risk-based")
  };
}

export function resolveGuardSettings(config: DsmmPluginConfig["guards"]): DsmmGuardSettings {
  const defaults = DEFAULT_DSMM_SETTINGS.guards;

  return {
    ...defaults,
    ...config,
    toolOutputTruncation: {
      ...defaults.toolOutputTruncation,
      ...config?.toolOutputTruncation,
      maxInlineBytes: normalizePositiveInteger(
        config?.toolOutputTruncation?.maxInlineBytes,
        defaults.toolOutputTruncation.maxInlineBytes
      )
    },
    questionLabelHelper: {
      ...defaults.questionLabelHelper,
      ...config?.questionLabelHelper,
      maxLabelChars: normalizePositiveInteger(config?.questionLabelHelper?.maxLabelChars, defaults.questionLabelHelper.maxLabelChars)
    }
  };
}

function resolveRuntimeRecoverySettings(config: DsmmPluginConfig["runtimeRecovery"]): DsmmRuntimeRecoverySettings {
  const defaults = DEFAULT_DSMM_SETTINGS.runtimeRecovery;

  return {
    enabled: config?.enabled ?? defaults.enabled,
    retryOnStatusCodes: normalizeStatusCodes(config?.retryOnStatusCodes, defaults.retryOnStatusCodes),
    retryOnCodes: normalizeRetryCodes(config?.retryOnCodes, defaults.retryOnCodes),
    fallbackRoutes: normalizeRecoveryRoutes(config?.fallbackRoutes, defaults.fallbackRoutes),
    maxFallbackAttempts: normalizeBoundedInteger(config?.maxFallbackAttempts, defaults.maxFallbackAttempts),
    idleContinuation: {
      enabled: config?.idleContinuation?.enabled ?? defaults.idleContinuation.enabled,
      maxContinuations: normalizeBoundedInteger(
        config?.idleContinuation?.maxContinuations,
        defaults.idleContinuation.maxContinuations
      ),
      prompt: config?.idleContinuation?.prompt ?? defaults.idleContinuation.prompt
    }
  };
}

function normalizeStatusCodes(input: readonly number[] | undefined, defaults: readonly number[]): number[] {
  const normalized: number[] = [];

  for (const status of input ?? defaults) {
    if (Number.isInteger(status) && status >= 100 && status <= 599 && !normalized.includes(status)) normalized.push(status);
  }

  return normalized;
}

function normalizeRetryCodes(input: readonly string[] | undefined, defaults: readonly string[]): string[] {
  const normalized: string[] = [];

  for (const code of input ?? defaults) {
    const normalizedCode = code.trim().toLowerCase();
    if (normalizedCode !== "" && !normalized.includes(normalizedCode)) normalized.push(normalizedCode);
  }

  return normalized;
}

function normalizeRecoveryRoutes(input: readonly Partial<DsmmRecoveryRoute>[] | undefined, defaults: readonly DsmmRecoveryRoute[]): DsmmRecoveryRoute[] {
  const normalized: DsmmRecoveryRoute[] = [];

  for (const route of input ?? defaults) {
    const provider = route.provider?.trim() ?? "";
    const model = route.model?.trim() ?? "";
    if (provider === "" || model === "" || normalized.some((candidate) => candidate.provider === provider && candidate.model === model)) continue;
    normalized.push({ provider, model });
  }

  return normalized;
}

function normalizeBoundedInteger(value: number | undefined, defaultValue: number): number {
  if (value === undefined || !Number.isFinite(value)) return defaultValue;
  return Math.min(10, Math.max(0, Math.floor(value)));
}

function normalizePositiveInteger(value: number | undefined, defaultValue: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return defaultValue;
  return Math.floor(value);
}

export function registerSettings(ctx: DshContext, config: DsmmPluginConfig = {}, options: RegisterSettingsOptions = {}): () => DsmmSettings {
  const base = resolveConfig(config);
  // Current Cordis loads restart-scoped Config itself; SettingsForms has no register().
  if (ctx.get !== undefined) {
    const getSettings = (): DsmmSettings => base;
    options.onChange?.(base);
    options.install?.(ctx, getSettings);
    return getSettings;
  }
  let getSettings = (): DsmmSettings => base;
  let attached = false;
  const installedSettingsByReadyContext = new WeakMap<DshContext, DshSettingsRegistry>();

  const ready = (readyCtx: DshContext, settings: DshSettingsRegistry | undefined): void => {
    if (settings === undefined || installedSettingsByReadyContext.get(readyCtx) === settings) return;
    const scope = settings.register<DsmmSettings>(DSMM_SETTINGS_NAMESPACE, DSMM_SETTINGS_SCHEMA, { base, applies: "restart" });
    const previousGetSettings = getSettings;
    const previousAttached = attached;
    getSettings = () => resolveConfig(scope.get() as DsmmPluginConfig);
    try {
      options.onChange?.(getSettings());
      options.install?.(readyCtx, () => getSettings());
      installedSettingsByReadyContext.set(readyCtx, settings);
      readyCtx.effect?.(() => () => {
        if (installedSettingsByReadyContext.get(readyCtx) === settings) installedSettingsByReadyContext.delete(readyCtx);
      });
      attached = true;
    } catch (error) {
      if (installedSettingsByReadyContext.get(readyCtx) === settings) installedSettingsByReadyContext.delete(readyCtx);
      getSettings = previousGetSettings;
      attached = previousAttached;
      throw error;
    }
  };

  if (ctx.inject !== undefined) {
    ctx.inject(["settings", "systemPrompt"], (readyCtx) => ready(readyCtx, readyCtx.settings));
    return () => getSettings();
  }

  if (Object.prototype.hasOwnProperty.call(ctx, "settings")) {
    ready(ctx, Object.getOwnPropertyDescriptor(ctx, "settings")?.value as DshSettingsRegistry | undefined);
  }

  if (!attached) {
    options.onChange?.(getSettings());
    options.install?.(ctx, () => getSettings());
  }

  return () => getSettings();
}
