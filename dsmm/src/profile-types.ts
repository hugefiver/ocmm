/** Wire-only profile data: safe to import from the native browser client. */
import type { DsmmRoleId } from "./roles.js";
import type { DsmmModuleState } from "./modules.js";
import type { DsmmModelRoute, DsmmProfileScope } from "./settings.js";

/** Non-executable schema projection for the native deployment editor. */
export interface DeploymentSchemaNode {
  type: string;
  fields?: Record<string, DeploymentSchemaNode>;
  inner?: DeploymentSchemaNode;
  alternatives?: DeploymentSchemaNode[];
  value?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  keys?: readonly string[];
  nonempty?: boolean;
}
export interface DeploymentAdmissionView {
  /** Host-redacted read-only view, never raw editor input or actual runtime settings. */
  settings: Record<string, unknown>;
  sources: Record<string, string>;
  captures: Record<string, string>;
  restartRequired: readonly string[];
  named: { id: string; revision: string } | null;
}
export interface DeploymentEditorSnapshot {
  entryId: string;
  namespace: string | null;
  hostProfileKey: string;
  global: Record<string, unknown>;
  globalRevision: string;
  profile: Record<string, unknown>;
  nativeRevision: string;
  nativeFormRevision: number | null;
  nativeForm: { base: unknown; user: unknown } | null;
  /** Host-redacted inspector layers. global/profile/nativeForm remain C0 editor input. */
  desired: Record<string, unknown>;
  sources: Record<string, string>;
  startup: Record<string, unknown>;
  startupSources?: Record<string, string>;
  defaults: Record<string, unknown>;
  schema: DeploymentSchemaNode;
  nextRoot: DeploymentAdmissionView | null;
  modules: DsmmModuleState[];
}
import type { DsmmRateLimitPolicy, DsmmRoutingStrategy, DsmmRuntimePolicyConfig, DsmmRuntimePolicySettings } from "./routing-policy.js";

export type ProfileErrorCode = "validation" | "conflict" | "not-found" | "lock-timeout" | "unsafe-path" | "io" | "activation" | "corrupt-selection" | "limit"
  | "busy" | "maintenance" | "disposed" | "not-owned" | "unavailable" | "cancelled";

export interface ProfileErrorInfo {
  code: ProfileErrorCode;
  message: string;
  field?: string;
}

export interface ProfileSummary {
  id: string;
  label?: string;
  revision: string | null;
  error?: ProfileErrorInfo;
}

export interface ProfileSelectionState {
  selectedId: string | null;
  appliedRevision: string | null;
  selectionRevision: string;
}

export interface ProfileSnapshot extends ProfileSelectionState {
  profiles: ProfileSummary[];
  selectionError?: ProfileErrorInfo;
  /** Native deployment role inventory; excludes provider accounts and auth data. */
  roles?: ProfileRoleMetadata[];
  editorDefaults?: DsmmRuntimePolicySettings;
  origin?: "central" | "legacy" | "explicit";
  readOnly?: boolean;
  writeRestriction?: string;
}

export interface ProfileReadResult {
  id: string;
  label?: string;
  revision: string;
  content: string;
}

export interface ProfileSaveRequest {
  id: string;
  content: string;
  expectedRevision: string | null;
}

export interface ProfileSelectRequest {
  id: string | null;
  expectedRevision?: string;
  expectedSelectionRevision: string;
}

export interface ProfileRoleMetadata {
  id: DsmmRoleId;
  label: string;
  enabled: boolean;
  /** Explicit deployment overrides inherited by a profile's omitted role fields. */
  runtimePolicy?: DsmmRuntimePolicyConfig;
}

export interface DsmmRoleRuntimeState {
  role?: DsmmRoleId;
  strategy: DsmmRoutingStrategy;
  rateLimit: DsmmRateLimitPolicy;
  route?: DsmmModelRoute;
  retries: number;
  rateLimitFailures: number;
  switches: number;
  totalDelayMs: number;
}

export interface SessionProfileSnapshot {
  sessionId: string;
  globalDefault: ProfileSelectionState;
  /** Current sidecar state: the authority for session-selection CAS. */
  selection: ProfileSelectionState;
  /** Exact live admission, for display only; may differ from the future global default. */
  admittedSelection?: ProfileSelectionState;
  scope: DsmmProfileScope;
  admissionEpoch: string;
  switchAllowed: boolean;
  switchUnavailableReason?: "busy" | "maintenance" | "disposed" | "not-owned" | "unavailable";
  rolePolicy?: DsmmRoleRuntimeState;
  /** Declared profile primary for the current ordinary root role, not an applied native selection. */
  profileModel?: DsmmModelRoute;
  /** Optional for older Hosts; explicit session intent always beats defaults. */
  deepwork?: SessionDeepworkState;
  /** Safe captured module admission; not a read of the current global editor. */
  modules?: DsmmModuleState[];
  configuration?: DeploymentAdmissionView;
}

export interface SessionDeepworkState {
  active: boolean;
  explicit: boolean;
  /** Standing DW presets own their composition; only ordinary presets toggle. */
  locked: boolean;
  revision: string;
}

export interface SessionModeSelectRequest {
  sessionId: string;
  active: boolean;
  expectedModeRevision: string;
  expectedAdmissionEpoch: string;
}

export interface SessionProfileSelectRequest extends ProfileSelectRequest {
  sessionId: string;
  expectedAdmissionEpoch: string;
}

export const ABSENT_PROFILE_SELECTION_REVISION = "absent";
