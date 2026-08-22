import Schema from "@deepseek-ai/schemastery";
import type { DshContext, DshSettingsRegistry } from "./dsh-types.js";
import { DSMM_ROLE_IDS } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";

export type DeepseekCalibration = "off" | "auto" | "strict";
export type DsmmFinalReviewPolicy = "simple-oracle-complex-reviewer" | "reviewer-only" | "off";
export const DSMM_SKILL_NAMES = [
  "brainstorming",
  "writing-plans",
  "requesting-code-review",
  "receiving-code-review",
  "subagent-driven-development",
  "dispatching-parallel-agents",
  "remove-ai-slops"
] as const;
export const MVP_SKILL_NAMES = DSMM_SKILL_NAMES;
export type DsmmSkillName = (typeof DSMM_SKILL_NAMES)[number];
export type MvpSkillName = DsmmSkillName;

export interface DsmmWorkflowSettings {
  strictGates: boolean;
  reviewCap: number;
  finalReviewPolicy: DsmmFinalReviewPolicy;
}

export interface DsmmPresetSettings {
  materialize: boolean;
  root?: string;
}

export interface DsmmPluginConfig {
  modeName?: string;
  section?: string;
  deepseekV4ProCalibration?: DeepseekCalibration;
  defaultActive?: boolean;
  promptOrder?: number;
  skills?: Partial<Record<DsmmSkillName, boolean>>;
  roles?: Partial<Record<DsmmRoleId, boolean>>;
  presets?: Partial<DsmmPresetSettings>;
  workflow?: Partial<DsmmWorkflowSettings>;
}

export interface DsmmSettings {
  modeName: string;
  defaultActive: boolean;
  promptOrder: number;
  deepseekV4ProCalibration: DeepseekCalibration;
  skills: Record<DsmmSkillName, boolean>;
  roles: Record<DsmmRoleId, boolean>;
  presets: DsmmPresetSettings;
  workflow: DsmmWorkflowSettings;
}

export const DSMM_SETTINGS_NAMESPACE = "dsmm";

export interface RegisterSettingsOptions {
  onChange?: (settings: DsmmSettings) => void;
}

export const DEFAULT_DSMM_SETTINGS: DsmmSettings = {
  modeName: "deepwork",
  defaultActive: false,
  promptOrder: 50,
  deepseekV4ProCalibration: "auto",
  skills: createDefaultSkillSettings(),
  roles: createDefaultRoleSettings(),
  presets: {
    materialize: false
  },
  workflow: {
    strictGates: true,
    reviewCap: 5,
    finalReviewPolicy: "simple-oracle-complex-reviewer"
  }
};

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

const ROLES_SCHEMA = Schema.object({
  "dsmm-orchestrator": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-orchestrator"]),
  "dsmm-planner": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-planner"]),
  "dsmm-plan-critic": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-plan-critic"]),
  "dsmm-reviewer": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-reviewer"]),
  "dsmm-code-search": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-code-search"]),
  "dsmm-doc-search": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-doc-search"]),
  "dsmm-clarifier": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-clarifier"]),
  "dsmm-media-reader": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-media-reader"])
});

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
  strictGates: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.workflow.strictGates),
  reviewCap: Schema.number().default(DEFAULT_DSMM_SETTINGS.workflow.reviewCap),
  finalReviewPolicy: FINAL_REVIEW_POLICY_SCHEMA
});

const DEEPSEEK_CALIBRATION_SCHEMA = Schema.union([
  Schema.const("off"),
  Schema.const("auto"),
  Schema.const("strict")
]).default(DEFAULT_DSMM_SETTINGS.deepseekV4ProCalibration);

export const DSMM_CONFIG_SCHEMA = Schema.object({
  modeName: Schema.string().default(DEFAULT_DSMM_SETTINGS.modeName),
  section: Schema.string(),
  defaultActive: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.defaultActive),
  promptOrder: Schema.number().default(DEFAULT_DSMM_SETTINGS.promptOrder),
  deepseekV4ProCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
  skills: SKILLS_SCHEMA,
  roles: ROLES_SCHEMA,
  presets: PRESETS_SCHEMA,
  workflow: WORKFLOW_SCHEMA
});

export const DSMM_SETTINGS_SCHEMA = Schema.object({
  modeName: Schema.string().default(DEFAULT_DSMM_SETTINGS.modeName),
  defaultActive: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.defaultActive),
  promptOrder: Schema.number().default(DEFAULT_DSMM_SETTINGS.promptOrder),
  deepseekV4ProCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
  skills: SKILLS_SCHEMA,
  roles: ROLES_SCHEMA,
  presets: PRESETS_SCHEMA,
  workflow: WORKFLOW_SCHEMA
});

export function resolveConfig(config: DsmmPluginConfig = {}): DsmmSettings {
  return {
    modeName: config.modeName ?? DEFAULT_DSMM_SETTINGS.modeName,
    defaultActive: config.defaultActive ?? DEFAULT_DSMM_SETTINGS.defaultActive,
    promptOrder: config.promptOrder ?? DEFAULT_DSMM_SETTINGS.promptOrder,
    deepseekV4ProCalibration: config.deepseekV4ProCalibration ?? DEFAULT_DSMM_SETTINGS.deepseekV4ProCalibration,
    skills: { ...DEFAULT_DSMM_SETTINGS.skills, ...config.skills },
    roles: { ...DEFAULT_DSMM_SETTINGS.roles, ...config.roles },
    presets: resolvePresetSettings(config.presets),
    workflow: resolveWorkflowSettings(config.workflow)
  };
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
  return {
    ...DEFAULT_DSMM_SETTINGS.workflow,
    ...config
  };
}

export function registerSettings(ctx: DshContext, config: DsmmPluginConfig = {}, options: RegisterSettingsOptions = {}): () => DsmmSettings {
  const base = resolveConfig(config);
  let getSettings = (): DsmmSettings => base;
  let attached = false;

  const attach = (settings: DshSettingsRegistry | undefined): void => {
    if (settings === undefined) return;
    const scope = settings.register<DsmmSettings>(DSMM_SETTINGS_NAMESPACE, DSMM_SETTINGS_SCHEMA, { base, applies: "restart" });
    getSettings = () => scope.get();
    attached = true;
    options.onChange?.(scope.get());
  };

  if (ctx.inject !== undefined) {
    ctx.inject(["settings"], (services) => attach(services.settings));
    return () => getSettings();
  }

  if (Object.prototype.hasOwnProperty.call(ctx, "settings")) {
    attach(Object.getOwnPropertyDescriptor(ctx, "settings")?.value as DshSettingsRegistry | undefined);
  }

  if (!attached) options.onChange?.(base);

  return () => getSettings();
}
