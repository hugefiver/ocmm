import type { DsmmInvocationLevel, DsmmLocale, DsmmModelRoute, DsmmProfileAdmission, DsmmSettings, DsmmToolTopology } from "./settings.js";
import { copyJson, DEFAULT_DSMM_SETTINGS, freezeSettings, resolveConfig, validateSparseConfig } from "./settings.js";
import { validateProfileOverlay } from "./profiles.js";
import type { DsmmRoleId } from "./roles.js";
import { DSMM_ROLE_IDS } from "./roles.js";

import { CHILD_EVIDENCE_FIELDS } from "./child-evidence.js";
import type { ChildAdmissionLimitation, ChildEvidenceField } from "./child-evidence.js";
export { CHILD_EVIDENCE_FIELDS, parseChildAdmissionEvidenceView } from "./child-evidence.js";
export type { ChildAdmissionEvidenceView, ChildAdmissionLimitation, ChildEvidenceField } from "./child-evidence.js";
import { DSMM_ROUTE_SOURCES } from "./profile-types.js";
import type { DsmmRouteSource } from "./profile-types.js";
export { DSMM_ROUTE_SOURCES } from "./profile-types.js";
export type { DsmmRouteSource } from "./profile-types.js";
export interface ChildToolFilter { allow?: string[]; deny?: string[] }
export interface ChildAuthorityCeiling {
  roles: DsmmRoleId[];
  readOnly: boolean;
  toolFilter?: ChildToolFilter;
  allowRouteOverride: boolean;
  maxDepth: number;
}
export type ChildRuntimePolicyCapture = Pick<DsmmSettings, "modules" | "roleRouting" | "runtimePolicy" | "workflow" | "guards" | "runtimeRecovery" | "defaultActive" | "deepseekV4ProCalibration" | "deepseekV4ProDefaultReasoningEffort" | "deepseekFlashCalibration" | "deepseekFlashDefaultReasoningEffort" | "skills"> & {
  subagents: Pick<DsmmSettings["subagents"], "enableRunInBackground" | "backgroundMode">;
};
export interface ChildAdmissionCapture {
  version: 1;
  childSessionId: string;
  parentSessionId: string;
  role: DsmmRoleId;
  profilePin: { id: string; revision: string } | null;
  originalAdmissionEpoch: string;
  invocation: { level: DsmmInvocationLevel; initialRoute: DsmmModelRoute; routeSource: DsmmRouteSource };
  runtimePolicyCapture: ChildRuntimePolicyCapture;
  authorityCeiling: ChildAuthorityCeiling;
  locale?: DsmmLocale;
  toolTopology: DsmmToolTopology;
}
/** Trusted native folds only; never synthesized from the current parent's settings. */
export interface LegacyChildEvidence {
  version: 1;
  mode: "legacy-conservative";
  childSessionId: string;
  parentSessionId: string;
  role: DsmmRoleId;
  route: DsmmModelRoute;
  depth: number;
  toolFilter?: ChildToolFilter;
  active?: boolean;
  provenFields: ChildEvidenceField[];
  limitations: ChildAdmissionLimitation[];
}
export type ChildAdmissionEvidence = ChildAdmissionCapture | LegacyChildEvidence;
export interface PreparedChildAdmission {
  evidence: ChildAdmissionEvidence;
  /** The trusted resolver supplies legacy's conservative intersection, not a parent clone. */
  admission: DsmmProfileAdmission;
  /** Only new creation writes a capture. Retained/cold evidence never rewrites it. */
  creation: boolean;
}

function fail(): never { throw new TypeError("Invalid child admission data"); }
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail();
  const row = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(row, key)) || Object.keys(row).some(key => !required.includes(key) && !optional.includes(key))) fail();
  return row;
}
function text(value: unknown, max: number): asserts value is string {
  if (typeof value !== "string" || !value.length || value.length > max || /[\u0000-\u001f\u007f]/u.test(value) || new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(value)) !== value) fail();
}
function epoch(value: unknown): void { if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) fail(); }
function role(value: unknown): void { if (!(DSMM_ROLE_IDS as readonly unknown[]).includes(value) || value === "dsmm-orchestrator") fail(); }
function boolean(value: unknown): void { if (typeof value !== "boolean") fail(); }
function integer(value: unknown): void { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail(); }
function route(value: unknown): void {
  const row = object(value, ["provider", "model"], ["reasoningEffort"]);
  text(row.provider, 128); text(row.model, 512);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(row.provider) || row.model.includes("://")) fail();
  if (Object.hasOwn(row, "reasoningEffort")) text(row.reasoningEffort, 64);
}
function filter(value: unknown): void {
  const row = object(value, [], ["allow", "deny"]);
  for (const list of Object.values(row)) {
    if (!Array.isArray(list) || list.length > 256 || new Set(list).size !== list.length) fail();
    list.forEach(value => text(value, 128));
  }
}
function fields(value: unknown): void {
  if (!Array.isArray(value) || value.length > CHILD_EVIDENCE_FIELDS.length || new Set(value).size !== value.length || value.some(field => !(CHILD_EVIDENCE_FIELDS as readonly unknown[]).includes(field))) fail();
}
function limitations(value: unknown): void {
  if (!Array.isArray(value) || value.length > CHILD_EVIDENCE_FIELDS.length) fail();
  for (const input of value) {
    const row = object(input, ["field", "code", "effect"]);
    if (!(CHILD_EVIDENCE_FIELDS as readonly unknown[]).includes(row.field) || typeof row.code !== "string" || !["missing-evidence", "not-persisted", "unverified", "parent-denied"].includes(row.code) || typeof row.effect !== "string" || !["capability-denied", "native-default", "display-only"].includes(row.effect)) fail();
  }
}
export function parseLegacyChildEvidence(input: unknown): LegacyChildEvidence {
  const row = object(copyJson(input), ["version", "mode", "childSessionId", "parentSessionId", "role", "route", "depth", "provenFields", "limitations"], ["toolFilter", "active"]);
  if (row.version !== 1 || row.mode !== "legacy-conservative") fail();
  text(row.childSessionId, 256); text(row.parentSessionId, 256); role(row.role); route(row.route); integer(row.depth);
  if (row.childSessionId === row.parentSessionId) fail();
  if (Object.hasOwn(row, "toolFilter")) filter(row.toolFilter);
  if (Object.hasOwn(row, "active")) boolean(row.active);
  fields(row.provenFields); limitations(row.limitations);
  const proven = row.provenFields as string[];
  if (!["lineage", "role", "route"].every(field => proven.includes(field)) || proven.includes("admission-epoch") || proven.includes("profile-pin") || proven.includes("invocation-level")) fail();
  if (Object.hasOwn(row, "toolFilter") !== proven.includes("tool-filter") || Object.hasOwn(row, "active") !== proven.includes("active-intent")) fail();
  return freezeSettings(row) as unknown as LegacyChildEvidence;
}
export function parseChildAdmissionCapture(input: unknown): ChildAdmissionCapture {
  const row = object(copyJson(input), ["version", "childSessionId", "parentSessionId", "role", "profilePin", "originalAdmissionEpoch", "invocation", "runtimePolicyCapture", "authorityCeiling", "toolTopology"], ["locale"]);
  if (row.version !== 1) fail();
  text(row.childSessionId, 256); text(row.parentSessionId, 256); role(row.role); epoch(row.originalAdmissionEpoch);
  if (row.childSessionId === row.parentSessionId) fail();
  if (row.profilePin !== null) {
    const pin = object(row.profilePin, ["id", "revision"]);
    if (typeof pin.id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(pin.id) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/iu.test(pin.id)) fail();
    epoch(pin.revision);
  }
  const invocation = object(row.invocation, ["level", "initialRoute", "routeSource"]);
  if (typeof invocation.level !== "string" || !["normal", "low", "high", "max"].includes(invocation.level) || !(DSMM_ROUTE_SOURCES as readonly unknown[]).includes(invocation.routeSource)) fail();
  route(invocation.initialRoute);
  const policyKeys = ["modules", "roleRouting", "runtimePolicy", "workflow", "guards", "runtimeRecovery", "defaultActive", "deepseekV4ProCalibration", "deepseekV4ProDefaultReasoningEffort", "deepseekFlashCalibration", "deepseekFlashDefaultReasoningEffort", "skills", "subagents"];
  const policy = object(row.runtimePolicyCapture, policyKeys);
  const { modules, skills, subagents, ...overlay } = policy;
  validateProfileOverlay(overlay);
  object(modules, ["deepwork"]); boolean(object((modules as Record<string, unknown>).deepwork, ["enabled"]).enabled);
  const skillMap = object(skills, Object.keys(DEFAULT_DSMM_SETTINGS.skills));
  Object.values(skillMap).forEach(boolean);
  const background = object(subagents, ["enableRunInBackground", "backgroundMode"]);
  boolean(background.enableRunInBackground);
  if (typeof background.backgroundMode !== "string" || !["one-shot", "continuable"].includes(background.backgroundMode)) fail();
  const ceiling = object(row.authorityCeiling, ["roles", "readOnly", "allowRouteOverride", "maxDepth"], ["toolFilter"]);
  if (!Array.isArray(ceiling.roles) || ceiling.roles.length > DSMM_ROLE_IDS.length || new Set(ceiling.roles).size !== ceiling.roles.length || ceiling.roles.some(role => !(DSMM_ROLE_IDS as readonly unknown[]).includes(role))) fail();
  boolean(ceiling.readOnly); boolean(ceiling.allowRouteOverride); integer(ceiling.maxDepth);
  if (Object.hasOwn(ceiling, "toolFilter")) filter(ceiling.toolFilter);
  if (!(ceiling.roles as unknown[]).includes(row.role) || !(modules as { deepwork: { enabled: boolean } }).deepwork.enabled) fail();
  if (typeof row.toolTopology !== "string" || !["per-role", "parameterized"].includes(row.toolTopology)) fail();
  validateSparseConfig({ ...policy, ...(Object.hasOwn(row, "locale") ? { locale: row.locale } : {}), subagents: { ...background, toolTopology: row.toolTopology, allowRouteOverride: ceiling.allowRouteOverride, maxDepth: ceiling.maxDepth } }, true);
  for (const key of ["modules", "runtimePolicy", "workflow", "guards", "runtimeRecovery"] as const) completeResolvedObject(policy[key], DEFAULT_DSMM_SETTINGS[key]);
  return freezeSettings(row) as unknown as ChildAdmissionCapture;
}

function completeResolvedObject(input: unknown, template: unknown): void {
  if (template === null || typeof template !== "object" || Array.isArray(template)) return;
  const row = object(input, Object.keys(template));
  for (const [key, value] of Object.entries(template)) completeResolvedObject(row[key], value);
}

/** Native service substrate stays Host-owned; all executable policy comes from original capture. */
export function admissionFromChildCapture(input: ChildAdmissionCapture, nativeSubstrate: DsmmSettings): DsmmProfileAdmission {
  const capture = parseChildAdmissionCapture(input);
  const { locale: _locale, ...substrate } = nativeSubstrate;
  const settings = resolveConfig({ ...substrate, ...capture.runtimePolicyCapture,
    roles: Object.fromEntries(DSMM_ROLE_IDS.map(role => [role, capture.authorityCeiling.roles.includes(role)])),
    ...(capture.locale === undefined ? {} : { locale: capture.locale }), subagents: { ...capture.runtimePolicyCapture.subagents,
      toolTopology: capture.toolTopology, allowRouteOverride: capture.authorityCeiling.allowRouteOverride, maxDepth: capture.authorityCeiling.maxDepth } });
  return freezeSettings({ settings, profile: capture.profilePin, epoch: capture.originalAdmissionEpoch,
    scope: capture.profilePin === null ? "deployment-baseline" : "session-override", childCapture: capture } as DsmmProfileAdmission);
}
