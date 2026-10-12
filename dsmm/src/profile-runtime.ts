import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { DshAgent, DshContext, DshLlmRuntime } from "./dsh-types.js";
import { ProfileStore, validateSessionProfileId } from "./profile-store.js";
import type { LoadedProfileSelection, LoadedSessionProfileSelection, SessionProfileCommit } from "./profile-store.js";
import type { ProfileReadResult, ProfileSaveRequest, ProfileSelectRequest, ProfileSelectionState, ProfileSnapshot, SessionModeSelectRequest, SessionProfileSelectRequest, SessionProfileSnapshot } from "./profile-types.js";
import { DsmmProfileError, profileDocumentWarnings, requiredReason, resolveProfileSettings } from "./profiles.js";
import type { DsmmProfileDocument } from "./profiles.js";
import { DSMM_ROLES, isRootRole, isDsmmRoleId } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmModelRoute, DsmmPluginConfig, DsmmProfileAdmission, DsmmSettings, DsmmSettingsGetter } from "./settings.js";
import { roleRouteRuntimeState, selectInitialModelRoute } from "./role-routing.js";
import { sessionEvents } from "./session-scope.js";
import { resolveAdmittedDsmmRole as resolveEffectiveDsmmRole } from "./role-policy.js";
import { DeepworkModeController, hasOpenTurn } from "./state.js";
import { resolveRoleRuntimePolicy } from "./settings.js";
import { freezeSettings } from "./settings.js";
import type { DsmmDeploymentSnapshot } from "./settings.js";
import { resolveDshHome } from "./dsh-home.js";
import { lstatSync } from "node:fs";
import { projectDeepworkModule } from "./modules.js";
import { Context } from "@deepseek-ai/cordis";
import type { DeploymentAdmissionView } from "./profile-types.js";
import { readOnlySettings, readOnlySettingSources } from "./status.js";
import { resolveSelectedAgentPreset } from "./session-scope.js";
import type { ChildAdmissionCompletion, DsmmChildAdmissionAuthority, LegacyChildEvidenceReader, ParentAdmissionTicket } from "./child-admission-contract.js";
import { admissionFromChildCapture, parseChildAdmissionCapture, parseLegacyChildEvidence } from "./child-capture.js";
import type { ChildAdmissionCapture, ChildAdmissionEvidence, PreparedChildAdmission } from "./child-capture.js";
import type { DsmmRoleAvailabilityState, SubagentRuntimeAdmissionView } from "./profile-types.js";

function deploymentAdmissionView(admission: DsmmProfileAdmission): DeploymentAdmissionView {
  return { settings: { ...readOnlySettings(admission.settings) }, sources: readOnlySettingSources(admission.sources ?? {}),
    captures: readOnlySettingSources(admission.sourceCaptures?.fields ?? {}), restartRequired: [...admission.restartRequired ?? []], named: admission.profile === null ? null : { ...admission.profile } };
}

interface NativeAgents {
  list(): DshAgent[];
  get?(id: string): DshAgent | undefined;
  isOwnedBy(id: string, owner: DshAgent): boolean;
}

interface NativePresetAudit {
  resolve(id: string): Promise<{ id: string; broken?: string }>;
}

export interface DsmmProfileRuntimeStore {
  createChildAdmission?(capture: ChildAdmissionCapture, assertCurrent?: () => void): Promise<ChildAdmissionCapture>;
  readChildAdmission?(childId: string, parentId: string): Promise<ChildAdmissionCapture | null>;
  deleteChildAdmission?(childId: string, parentId: string): Promise<void>;
  readonly readOnly?: boolean;
  readonly origin?: "central" | "legacy" | "explicit";
  readonly writeRestriction?: string;
  loadSelection(): Promise<LoadedProfileSelection>;
  describe(): Promise<ProfileSnapshot>;
  read(id: string): Promise<ProfileReadResult>;
  save(request: ProfileSaveRequest): Promise<ProfileReadResult>;
  select<T>(request: ProfileSelectRequest, validateCandidate: (document: DsmmProfileDocument | null) => T | Promise<T>): Promise<{ selection: ProfileSelectionState; prepared: T }>;
  loadSessionSelection(sessionId: string): Promise<LoadedSessionProfileSelection>;
  selectSession<T>(request: SessionProfileSelectRequest, epoch: string, validateCandidate: (document: DsmmProfileDocument | null) => T | Promise<T>, commit: SessionProfileCommit<T>): Promise<{ selection: LoadedSessionProfileSelection; prepared: T }>;
}

export interface DsmmProfileRuntimeOptions {
  /** Separate Host-owned central sidecars keep legacy profile libraries read-only. */
  childCaptureStore?: Pick<DsmmProfileRuntimeStore, "createChildAdmission" | "readChildAdmission" | "deleteChildAdmission">;
  childAuthority?: DsmmChildAdmissionAuthority;
  /** Exact entry identity bound by the stable Host authority; never wire input. */
  childAuthorityOwner?: object;
  childAdmission?: ChildAdmissionCompletion;
  /** B's synchronous candidate-role/ceiling validation; Apply preparation must not publish identity changes. */
  validateRootRole?: (agent: DshAgent, admission: DsmmProfileAdmission) => void;
  /** Host session substrate decides this; resident mode makes no restart claim. */
  childCapturePersistence?: "durable" | "resident";
  /** Parent composition may enable its bound policy after guards exist, before retained Agents are admitted. */
  onAdmissionGuardsInstalled?: (runtime: DsmmProfileRuntime) => void | Promise<void>;
  /** Trusted test/integration seam, never a wire-supplied path or callback. */
  validateCandidate?: (settings: DsmmSettings) => void | Promise<void>;
  modeController?: DeepworkModeController;
  /** Awaited once per new ordinary root; never used by children or idle switches. */
  readDesired?: () => Promise<DsmmDeploymentSnapshot>;
  startup?: DsmmDeploymentSnapshot;
  /** Frozen actual native startup substrate; omission is the trusted legacy seam. */
  subagentCapabilities?: { backgroundJobs: boolean; continuable: boolean };
}

interface AdmittedProfile extends ProfileSelectionState, DsmmProfileAdmission { baseline: DsmmSettings }

// Exact live native children retain their capture across DSMM runtime replacement.
const childAdmissions = new WeakMap<DshAgent, { parent: DshAgent; admission: AdmittedProfile; evidence: ChildAdmissionEvidence }>();

function immutableSettings(settings: DsmmSettings): DsmmSettings {
  return freezeSettings(settings);
}

/** Global defaults admit new roots; scoped idle switches replace one root's epoch. */
export class DsmmProfileRuntime {
  readonly childCaptureStore: Pick<DsmmProfileRuntimeStore, "createChildAdmission" | "readChildAdmission" | "deleteChildAdmission">;
  readonly getSettings: DsmmSettingsGetter = (agent) => agent === undefined ? this.current.settings : this.bind(agent).settings;
  private current: AdmittedProfile;
  private currentDocument: DsmmProfileDocument | null = null;
  private readonly baseline: DsmmSettings;
  private readonly bound = new WeakMap<DshAgent, AdmittedProfile>();
  private readonly admitting = new WeakSet<DshAgent>();
  private readonly disposedAgents = new WeakSet<DshAgent>();
  private readonly switching = new WeakSet<DshAgent>();
  private disposed = false;
  private selectionQueue: Promise<unknown> = Promise.resolve();
  private readonly mode: DeepworkModeController;

  constructor(
    private readonly ctx: DshContext,
    baseline: DsmmSettings,
    private readonly store: DsmmProfileRuntimeStore,
    private readonly options: DsmmProfileRuntimeOptions = {}
  ) {
    this.childCaptureStore = options.childCaptureStore ?? store;
    this.baseline = immutableSettings(baseline);
    this.mode = options.modeController ?? new DeepworkModeController({ get: (name) => ctx.get?.(name) }, (agent) => this.getSettings(agent).modules.deepwork.enabled);
    this.current = this.prepare(null, { selectedId: null, appliedRevision: null, selectionRevision: "absent" });
    this.getSettings.admission = (agent) => this.admission(agent);
    this.getSettings.moduleStates = (agent) => { const admission = this.admission(agent); return [projectDeepworkModule(this.baseline, admission.deployment, admission)]; };
    this.getSettings.subagentRuntime = () => this.subagentRuntimeView();
  }

  async initialize(): Promise<void> {
    const selection = await this.store.loadSelection();
    this.currentDocument = selection.document === null ? null : freezeSettings(selection.document);
    this.current = this.prepare(selection.document, selection);
    this.ctx.on?.("agent/created", async ({ agent, signal }: { agent: DshAgent; signal?: AbortSignal }) => {
      // Factory initialization already owns native maintenance: never whenIdle
      // or reserve maintenance from inside this serial creation listener.
      await this.completeAdmission(agent, signal);
    }, { global: true, prepend: true });
    this.ctx.on?.("agent/disposed", ({ agent }: { agent: DshAgent }) => { this.options.childAuthority?.revokeParent(agent, "agent-disposed"); this.disposedAgents.add(agent); childAdmissions.delete(agent); }, { global: true });
    this.ctx.effect?.(() => () => { this.disposed = true; for (const agent of this.agents()?.list() ?? []) if (this.bound.has(agent)) this.options.childAuthority?.revokeParent(agent, "runtime-disposed"); });
    if (this.options.onAdmissionGuardsInstalled !== undefined) await this.options.onAdmissionGuardsInstalled(this);
    // Installation into an already-running host treats those Agents as admitted
    // now, while all later profile switches continue to preserve their snapshot.
    const visited = new Set<DshAgent>(), visiting = new Set<DshAgent>();
    const admitExisting = async (agent: DshAgent): Promise<void> => {
      if (visited.has(agent)) return;
      if (visiting.has(agent)) throw new DsmmProfileError("not-owned", "Existing Agent ownership has a cycle; no child authority was inferred.");
      visiting.add(agent);
      const parent = this.owner(agent);
      if (parent !== undefined) await admitExisting(parent);
      await this.completeAdmission(agent, undefined, this.options.startup);
      visiting.delete(agent); visited.add(agent);
    };
    for (const agent of this.agents()?.list() ?? []) await admitExisting(agent);
  }

  admission(agent?: DshAgent): AdmittedProfile { return agent === undefined ? this.current : this.bind(agent); }

  async getSession(agent: DshAgent): Promise<SessionProfileSnapshot> {
    this.assertRoot(agent);
    const admitted = this.bind(agent);
    const disk = await this.store.loadSessionSelection(agent.id!);
    this.assertRoot(agent);
    if (this.bind(agent) !== admitted) throw new DsmmProfileError("conflict", "The session admission changed while reading. Refresh before selecting again.");
    if ((disk.admissionEpoch === null && admitted.scope !== "global-default") || (disk.admissionEpoch !== null && (disk.admissionEpoch !== admitted.epoch || disk.selectedId !== admitted.selectedId || disk.appliedRevision !== admitted.appliedRevision))) {
      throw new DsmmProfileError("conflict", "The session choice changed outside this Host. Its admitted policy was retained; refresh or resume explicitly.");
    }
    const reason = this.store.readOnly ? "unavailable" : this.switching.has(agent) ? "maintenance" : agent.status === "running" ? "busy" : agent.runMaintenance === undefined ? "unavailable" : undefined;
    const role = resolveEffectiveDsmmRole(agent, admitted.settings, this.mode.active(agent, admitted.settings.defaultActive));
    const profileModel = this.declaredProfileModel(admitted.settings, role);
    return { sessionId: agent.id!, globalDefault: selectionState(this.current), selection: selectionState(disk), admittedSelection: selectionState(admitted), scope: admitted.scope,
      rolePolicy: roleRouteRuntimeState(agent, admitted.settings, role, admitted.epoch), deepwork: this.mode.describe(agent, admitted.settings.defaultActive),
      modules: [projectDeepworkModule(this.baseline, admitted.deployment, admitted)],
      configuration: deploymentAdmissionView(admitted),
      warnings: structuredClone(admitted.warnings ?? []), roles: structuredClone(admitted.roleAvailability ?? []), subagentRuntime: this.subagentRuntimeView(),
      ...(profileModel === undefined ? {} : { profileModel }),
      admissionEpoch: admitted.epoch, switchAllowed: reason === undefined, ...(reason === undefined ? {} : { switchUnavailableReason: reason }) };
  }

  /** The fourth argument is trusted native caller authority, never wire data. */
  async selectMode(request: SessionModeSelectRequest, agent: DshAgent, signal?: AbortSignal, assertAuthority?: () => void): Promise<SessionProfileSnapshot> {
    this.assertRoot(agent);
    if (request.sessionId !== agent.id) throw new DsmmProfileError("not-owned", "The native session does not match the captured Agent.");
    const admitted = this.bind(agent);
    const assertCurrent = (maintenanceSignal?: AbortSignal): void => {
      this.assertRoot(agent);
      if (signal?.aborted || maintenanceSignal?.aborted) throw new DsmmProfileError("cancelled", "The Deepwork change was cancelled.");
      const mode = this.mode.describe(agent, admitted.settings.defaultActive);
      if (this.bind(agent) !== admitted || admitted.epoch !== request.expectedAdmissionEpoch || mode.revision !== request.expectedModeRevision) {
        throw new DsmmProfileError("conflict", "The session profile, preset or mode changed. Refresh before retrying.");
      }
      assertAuthority?.();
    };
    assertCurrent();
    if (request.active && !admitted.settings.modules.deepwork.enabled) throw new DsmmProfileError("unavailable", "Deepwork module is not admitted in this session; changing mode cannot enable it.", "modules.deepwork.enabled");
    if (agent.status === "running") throw new DsmmProfileError("busy", "Wait for the session to become idle.");
    if (agent.runMaintenance === undefined) throw new DsmmProfileError("unavailable", "Native idle maintenance is unavailable.");
    // Read before the write, so a later read failure cannot misreport a commit.
    const before = await this.getSession(agent);
    assertCurrent();
    try {
      return await agent.runMaintenance(async (maintenanceSignal) => {
        this.switching.add(agent);
        try {
          assertCurrent(maintenanceSignal);
          if (hasOpenTurn(sessionEvents(agent.session))) throw new DsmmProfileError("busy", "A session turn is still open.");
          try { await this.mode.selectIdle(agent, request.active, admitted.settings.defaultActive); }
          catch { throw new DsmmProfileError("io", "The session mode could not be saved. Refresh before retrying."); }
          const role = resolveEffectiveDsmmRole(agent, admitted.settings, this.mode.active(agent, admitted.settings.defaultActive));
          const profileModel = this.declaredProfileModel(admitted.settings, role);
          const { profileModel: _previousModel, rolePolicy: _previousPolicy, ...snapshot } = before;
          return { ...snapshot, deepwork: this.mode.describe(agent, admitted.settings.defaultActive),
            rolePolicy: roleRouteRuntimeState(agent, admitted.settings, role, admitted.epoch), ...(profileModel === undefined ? {} : { profileModel }) };
        } finally { this.switching.delete(agent); }
      });
    } catch (error) {
      if (error instanceof DsmmProfileError) throw error;
      throw new DsmmProfileError("maintenance", "The native session refused the Deepwork change. Refresh before retrying.");
    }
  }

  selectSession(request: SessionProfileSelectRequest, agent: DshAgent, signal?: AbortSignal, assertAuthority?: () => void): Promise<SessionProfileSnapshot> {
    this.assertRoot(agent);
    if (request.sessionId !== agent.id) throw new DsmmProfileError("not-owned", "The native session does not match the captured Agent.");
    const admitted = this.bind(agent);
    const assertCurrent = (maintenanceSignal?: AbortSignal): void => {
      this.assertRoot(agent);
      if (signal?.aborted || maintenanceSignal?.aborted) throw new DsmmProfileError("cancelled", "Session profile selection was cancelled; the previous admission was retained.");
      if (this.bind(agent) !== admitted || admitted.epoch !== request.expectedAdmissionEpoch) throw new DsmmProfileError("conflict", "The session admission changed. Refresh before selecting again.");
      if (this.options.childAuthority !== undefined) {
        const ticket = this.options.childAuthority.acquireParentTicket(agent);
        if (ticket.admission !== admitted || ticket.owner !== (this.options.childAuthorityOwner ?? this)) throw new DsmmProfileError("not-owned", "The stable Host authority does not own this exact admission.");
      }
      assertAuthority?.();
    };
    assertCurrent();
    if (agent.status === "running") throw new DsmmProfileError("busy", "The session is running. Wait for its current activity before selecting a profile.");
    if (agent.runMaintenance === undefined) throw new DsmmProfileError("unavailable", "Native idle maintenance is unavailable; no session selection was committed.");
    let operation: Promise<SessionProfileSnapshot>;
    try {
      operation = agent.runMaintenance(async (maintenanceSignal) => {
        this.switching.add(agent);
        try {
          assertCurrent(maintenanceSignal);
          const epoch = newEpoch();
          let profileModel: DsmmModelRoute | undefined;
          let committed!: AdmittedProfile;
          let next!: AdmittedProfile;
          const result = await this.store.selectSession(request, epoch, async (document) => {
            const prepared = immutableSettings(resolveProfileSettings(admitted.baseline as DsmmPluginConfig, document?.settings ?? {}));
            this.assertRootRole(agent, prepared);
            if (["roles", "guards", "subagents"].some(key => JSON.stringify(Reflect.get(prepared, key)) !== JSON.stringify(Reflect.get(admitted.settings, key)))) this.assertDeliveryFence();
            await this.validate(prepared, agent, maintenanceSignal);
            const role = resolveEffectiveDsmmRole(agent, prepared, this.mode.active(agent, prepared.defaultActive));
            profileModel = this.declaredProfileModel(prepared, role);
            assertCurrent(maintenanceSignal);
            return prepared;
          }, {
            assertCurrent: () => assertCurrent(maintenanceSignal),
            prepare: (selection, settings) => {
              next = this.profileAdmission(selection, settings, epoch, request.id === null ? "deployment-baseline" : "session-override", admitted.baseline, admitted.deployment, admitted.restartRequired, selection.document, selection.warnings);
              this.validateRootRole(agent, next);
              this.options.childAuthority?.prepareParentAdmission(agent, admitted.epoch, next);
            },
            committed: (selection, settings) => {
              const install = (): void => { this.bound.set(agent, next); };
              if (this.options.childAuthority !== undefined) this.options.childAuthority.publishParentAdmission(agent, admitted.epoch, next, install);
              else install();
              committed = next;
            }
          });
          try { this.mode.changed(agent); } catch { /* Observers cannot undo a successful durable admission publication. */ }
          // A committed selection remains a successful transaction even if a
          // queued wake or disposal wins immediately when maintenance releases.
          return { sessionId: request.sessionId, globalDefault: selectionState(this.current), selection: selectionState(result.selection), admittedSelection: selectionState(result.selection),
            deepwork: this.mode.describe(agent, result.prepared.defaultActive),
            modules: [projectDeepworkModule(this.baseline, committed.deployment, committed)],
            configuration: deploymentAdmissionView(committed),
            warnings: structuredClone(committed.warnings ?? []), roles: structuredClone(committed.roleAvailability ?? []), subagentRuntime: this.subagentRuntimeView(),
            ...(profileModel === undefined ? {} : { profileModel }),
            scope: request.id === null ? "deployment-baseline" : "session-override", admissionEpoch: epoch, switchAllowed: true };
        } finally { this.switching.delete(agent); }
      });
    } catch (error) {
      if (error instanceof DsmmProfileError) throw error;
      throw new DsmmProfileError("maintenance", "Another activity owns the session's idle maintenance phase. No selection was queued or committed.");
    }
    return operation;
  }

  async describe(): Promise<ProfileSnapshot> {
    const persisted = await this.store.describe();
    const current = this.current;
    const changedOutsideHost = persisted.selectedId !== current.selectedId
      || persisted.appliedRevision !== current.appliedRevision
      || persisted.selectionRevision !== current.selectionRevision;
    return {
      ...persisted,
      selectedWarnings: structuredClone(current.warnings ?? []),
      roles: DSMM_ROLES.map((role) => {
        const configured = this.baseline.roleRouting[role.id];
        const runtimePolicy = { ...(configured?.strategy === undefined ? {} : { strategy: configured.strategy }),
          ...(configured?.rateLimit === undefined ? {} : { rateLimit: structuredClone(configured.rateLimit) }) };
        return { id: role.id, label: role.name, enabled: this.current.settings.roles[role.id], availability: this.current.roleAvailability?.find(state => state.id === role.id),
          ...(Object.keys(runtimePolicy).length === 0 ? {} : { runtimePolicy }) };
      }),
      editorDefaults: structuredClone(this.baseline.runtimePolicy),
      selectedId: current.selectedId,
      appliedRevision: current.appliedRevision,
      // Keep the disk revision for CAS, but never label its unvalidated policy
      // as admitted in this Host. Existing Agent snapshots remain untouched.
      ...(persisted.selectionError === undefined && changedOutsideHost ? {
        selectionError: {
          code: "conflict" as const,
          message: "The persisted selection changed outside this Host. New Agents still use this Host's admitted current policy; reapply the desired profile or restart."
        }
      } : {})
    };
  }
  read(id: string): Promise<ProfileReadResult> { return this.store.read(id); }
  save(request: ProfileSaveRequest): Promise<ProfileReadResult> { return this.store.save(request); }
  getStartupSettings(): DsmmSettings { return this.baseline; }

  /** Preview uses the admission path but neither binds nor creates an Agent. */
  previewDeployment(desired: DsmmDeploymentSnapshot): DeploymentAdmissionView {
    return deploymentAdmissionView(this.prepare(this.currentDocument, this.current, this.current.epoch, "global-default", desired));
  }

  async describeDeployment(agent?: DshAgent): Promise<{
    startup: DsmmDeploymentSnapshot | null;
    desired: DsmmDeploymentSnapshot | null;
    admission: DsmmProfileAdmission;
  }> {
    const desired = await this.options.readDesired?.();
    return { startup: this.options.startup ?? null, desired: desired ?? null, admission: this.admission(agent) };
  }

  select(request: ProfileSelectRequest): Promise<ProfileSnapshot> {
    const operation = this.selectionQueue.then(async () => {
      let selectedDocument: DsmmProfileDocument | null = null;
      const baseline = this.current.baseline;
      const result = await this.store.select(request, async (document) => {
        selectedDocument = document === null ? null : freezeSettings(document);
        const prepared = immutableSettings(resolveProfileSettings(baseline as DsmmPluginConfig, document?.settings ?? {}));
        await this.validate(prepared);
        return prepared;
      });
      // There is no await between successful durable commit and publication of
      // the complete settings value. Draft saves never reach this assignment.
       this.current = this.profileAdmission(result.selection, result.prepared, newEpoch(), "global-default", baseline, this.options.startup, this.current.restartRequired, selectedDocument, (result.selection as LoadedProfileSelection).warnings);
      this.currentDocument = selectedDocument;
      return this.describe();
    });
    this.selectionQueue = operation.catch(() => undefined);
    return operation;
  }

  private prepare(document: DsmmProfileDocument | null, selection: ProfileSelectionState, epoch = newEpoch(), scope: DsmmProfileAdmission["scope"] = "global-default", deployment = this.options.startup): AdmittedProfile {
    const desired = deployment?.settings ?? this.baseline;
    const effective = structuredClone(desired);
    const restartRequired: string[] = [];
    effective.modules.deepwork.enabled = desired.modules.deepwork.enabled && this.baseline.modules.deepwork.enabled;
    effective.subagents.allowRouteOverride = desired.subagents.allowRouteOverride && this.baseline.subagents.allowRouteOverride;
    if (desired.subagents.allowRouteOverride && !this.baseline.subagents.allowRouteOverride) restartRequired.push("subagents.allowRouteOverride");
    if (this.baseline.subagents.maxDepth !== undefined && (desired.subagents.maxDepth === undefined || desired.subagents.maxDepth > this.baseline.subagents.maxDepth)) {
      effective.subagents.maxDepth = this.baseline.subagents.maxDepth;
      restartRequired.push("subagents.maxDepth");
    }
    if (desired.modules.deepwork.enabled && !this.baseline.modules.deepwork.enabled) restartRequired.push("modules.deepwork.enabled");
    for (const role of DSMM_ROLES) {
      if (desired.roles[role.id] && !this.baseline.roles[role.id]) restartRequired.push(`roles.${role.id}`);
      effective.roles[role.id] = desired.roles[role.id] && this.baseline.roles[role.id];
    }
    const capability = desired.subagents.backgroundMode === "continuable" ? this.options.subagentCapabilities?.continuable : this.options.subagentCapabilities?.backgroundJobs;
    if (desired.subagents.enableRunInBackground && capability === false) {
      effective.subagents.enableRunInBackground = false;
      restartRequired.push("subagents");
    }
    for (const key of ["modeName", "promptOrder", "presets", "lsp"] as const) {
      if (JSON.stringify(desired[key]) !== JSON.stringify(this.baseline[key])) restartRequired.push(key);
      Object.assign(effective, { [key]: this.baseline[key] });
    }
    if (deployment !== undefined && this.options.startup !== undefined
      && (deployment.profile.section ?? deployment.global.section) !== (this.options.startup.profile.section ?? this.options.startup.global.section)) restartRequired.push("section");
    const baseline = immutableSettings(effective);
    return this.profileAdmission(selection, immutableSettings(resolveProfileSettings(baseline as DsmmPluginConfig, document?.settings ?? {})), epoch, scope, baseline, deployment, restartRequired, document, (selection as LoadedProfileSelection).warnings);
  }

  private profileAdmission(selection: ProfileSelectionState, settings: DsmmSettings, epoch: string, scope: DsmmProfileAdmission["scope"], baseline = this.baseline, deployment = this.options.startup, restartRequired: readonly string[] = [], document: DsmmProfileDocument | null = null, warnings = profileDocumentWarnings(document)): AdmittedProfile {
    const sources: NonNullable<DsmmProfileAdmission["sources"]> = { ...deployment?.sources };
    const fields: NonNullable<DsmmProfileAdmission["sourceCaptures"]>["fields"] = Object.fromEntries(Object.keys(sources).map((path) => [path, "deployment"]));
    const pinStartup = (prefix: string): void => {
      const matches = (path: string): boolean => path === prefix || path.startsWith(`${prefix}.`);
      for (const path of Object.keys(sources).filter(matches)) { delete sources[path]; delete fields[path]; }
      for (const [path, source] of Object.entries(this.options.startup?.sources ?? {}).filter(([path]) => matches(path))) {
        sources[path] = source;
        fields[path] = "startup";
      }
    };
    for (const key of ["modeName", "promptOrder", "presets", "lsp"]) pinStartup(key);
    if (deployment?.settings.modules.deepwork.enabled && !baseline.modules.deepwork.enabled) pinStartup("modules.deepwork.enabled");
    if (deployment?.settings.subagents.allowRouteOverride && !baseline.subagents.allowRouteOverride) pinStartup("subagents.allowRouteOverride");
    if (deployment !== undefined && deployment.settings.subagents.maxDepth !== baseline.subagents.maxDepth) pinStartup("subagents.maxDepth");
    for (const role of DSMM_ROLES) {
      if (deployment?.settings.roles[role.id] && !baseline.roles[role.id]) pinStartup(`roles.${role.id}`);
    }
    const mark = (value: unknown, path: string[]): void => {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        for (const [key, child] of Object.entries(value)) mark(child, [...path, key]);
      } else { sources[path.join(".")] = "named-session"; fields[path.join(".")] = "named-session"; }
    };
    for (const [role, policy] of Object.entries(document?.settings.roleRouting ?? {})) {
      const prefixes = [...policy?.primary === undefined ? [] : [`roleRouting.${role}.primary.`], ...Object.keys(policy?.levels ?? {}).map(level => `roleRouting.${role}.levels.${level}.`)];
      for (const prefix of prefixes) for (const path of Object.keys(sources).filter((path) => path.startsWith(prefix))) { delete sources[path]; delete fields[path]; }
    }
    mark(document?.settings ?? {}, []);
    return Object.freeze({ ...selectionState(selection), settings, baseline, epoch, scope, ...(deployment === undefined ? {} : { deployment }),
      warnings: freezeSettings(warnings), roleAvailability: freezeSettings(this.roleAvailability(settings, baseline, deployment, document)), subagentRuntime: freezeSettings(this.subagentRuntimeView()),
      ...(this.store.origin === undefined ? {} : { store: Object.freeze({ origin: this.store.origin, readOnly: this.store.readOnly === true,
        ...(this.store.writeRestriction === undefined ? {} : { writeRestriction: this.store.writeRestriction }) }) }),
      sources: Object.freeze(sources), sourceCaptures: Object.freeze({ fields: Object.freeze(fields), ...(this.options.startup === undefined ? {} : { startup: Object.freeze({
        globalRevision: this.options.startup.globalRevision, nativeRevision: this.options.startup.nativeRevision
      }) }) }), restartRequired: Object.freeze([...restartRequired]), profile: selection.selectedId === null || selection.appliedRevision === null ? null : Object.freeze({ id: selection.selectedId, revision: selection.appliedRevision }) });
  }

  private declaredProfileModel(settings: DsmmSettings, role: DsmmRoleId | undefined): DsmmModelRoute | undefined {
    const primary = role === undefined ? undefined : settings.roleRouting[role]?.primary;
    return primary === undefined ? undefined : { provider: primary.provider, model: primary.model,
      ...(primary.reasoningEffort === undefined ? {} : { reasoningEffort: primary.reasoningEffort }) };
  }

  private agents(): NativeAgents | undefined { return this.ctx.get?.<NativeAgents>("agents"); }

  private bind(agent: DshAgent): AdmittedProfile {
    const existing = this.bound.get(agent);
    if (existing !== undefined) return existing;
    if (this.admitting.has(agent)) throw new DsmmProfileError("activation", "The session's profile admission has not completed.");
    if (agent.id !== undefined && this.agents()?.get !== undefined) {
      // Native enter() precedes serial created admission. An early RPC or
      // extension (including unpublished setup) cannot make a native root skip
      // its persisted sidecar by eagerly creating a default binding.
      throw new DsmmProfileError("activation", "The native session has not completed its awaited profile admission.");
    }
    // The native factory enters the exact child/owner pair before announcing
    // creation. Durable lineage and inherited persona never establish ownership.
    const parent = this.owner(agent);
    if (parent === undefined && agent.session.header?.origin === "subagent") throw new DsmmProfileError("not-owned", "A child requires exact direct-parent admission, not current root defaults.");
    if (parent !== undefined) throw new DsmmProfileError("activation", "A retained child must complete role validation and authority registration before its settings are published.");
    const admitted = this.current;
    this.assertRootRole(agent, admitted.settings);
    this.validateRootRole(agent, admitted);
    this.bound.set(agent, admitted);
    try { this.options.childAuthority?.registerParent(agent, admitted, this.options.childAuthorityOwner ?? this); }
    catch (error) { this.bound.delete(agent); throw error; }
    return admitted;
  }

  private owner(agent: DshAgent): DshAgent | undefined {
    const agents = this.agents();
    return agent.id === undefined ? undefined : agents?.list().find((candidate) => candidate !== agent && agents.isOwnedBy(agent.id!, candidate));
  }

  private assertRoot(agent: DshAgent): void {
    if (this.disposed || this.disposedAgents.has(agent)) throw new DsmmProfileError("disposed", "The session or profile service was disposed; no selection was committed.");
    validateSessionProfileId(agent.id);
    const agents = this.agents();
    if (agents?.get === undefined) throw new DsmmProfileError("unavailable", "Native live Agent lookup is unavailable; no session selection was committed.");
    if (agents.get(agent.id) !== agent || this.owner(agent) !== undefined || agent.session.header?.origin === "subagent") {
      throw new DsmmProfileError("not-owned", "Session profile selection requires the exact live ordinary root Agent.");
    }
  }

  /** Host-only awaited completion for fresh, retained and cold exact Agents; no execution occurs here. */
  async completeAdmission(agent: DshAgent, signal?: AbortSignal, startup?: DsmmDeploymentSnapshot): Promise<DsmmProfileAdmission> {
    await this.admit(agent, signal, startup);
    return this.bound.get(agent)!;
  }

  private async admit(agent: DshAgent, signal?: AbortSignal, startup?: DsmmDeploymentSnapshot): Promise<void> {
    if (this.bound.has(agent)) return;
    const parent = this.owner(agent);
    if (parent !== undefined) {
      this.assertDeliveryFence();
      if (this.options.childAdmission === undefined) throw new DsmmProfileError("unavailable", "Child admission completion is not installed; no child policy was inferred from its current parent.");
      const ticket = this.options.childAuthority!.acquireParentTicket(parent);
      this.assertOwnedParentTicket(ticket);
      const merged = AbortSignal.any([ticket.signal, ...signal === undefined ? [] : [signal]]);
      const prepared = await this.options.childAdmission.prepare(agent, parent, ticket, merged);
      merged.throwIfAborted();
      await this.completeChildAdmission(agent, parent, prepared, merged);
      return;
    }
    if (agent.session.header?.origin === "subagent") throw new DsmmProfileError("not-owned", "A child cannot be admitted as a new root without its exact live direct parent.");
    if (agent.id === undefined) { this.bind(agent); return; }
    this.admitting.add(agent);
    try {
      signal?.throwIfAborted();
      const deployment = startup ?? await this.options.readDesired?.();
      signal?.throwIfAborted();
      const selection = await this.store.loadSessionSelection(agent.id);
      signal?.throwIfAborted();
      if (this.disposed || this.disposedAgents.has(agent)) throw new DsmmProfileError("disposed", "The session was disposed during profile admission.");
      const registry = this.agents();
      if (registry?.get !== undefined && registry.get(agent.id) !== agent) throw new DsmmProfileError("not-owned", "The live session changed during profile admission.");
      const candidate = selection.admissionEpoch === null
        ? this.options.readDesired === undefined ? this.current : this.prepare(this.currentDocument, this.current, newEpoch(), "global-default", deployment)
        : this.prepare(selection.document, selection, selection.admissionEpoch, selection.selectedId === null ? "deployment-baseline" : "session-override", deployment);
      this.assertRootRole(agent, candidate.settings);
      if (this.options.readDesired !== undefined) await this.validate(candidate.settings, agent, signal, startup !== undefined);
      signal?.throwIfAborted();
      if (this.disposed || this.disposedAgents.has(agent)) throw new DsmmProfileError("disposed", "The session was disposed during deployment admission.");
      if (registry?.get !== undefined && registry.get(agent.id) !== agent) throw new DsmmProfileError("not-owned", "The live session changed during deployment admission.");
      this.validateRootRole(agent, candidate);
      this.bound.set(agent, candidate);
      try { this.options.childAuthority?.registerParent(agent, candidate, this.options.childAuthorityOwner ?? this); }
      catch (error) { this.bound.delete(agent); throw error; }
    } finally { this.admitting.delete(agent); }
  }

  /** Awaited native creation completion: evidence + persistence + role identity + exact-parent authority. */
  async completeChildAdmission(agent: DshAgent, parent: DshAgent, prepared: PreparedChildAdmission, signal?: AbortSignal): Promise<void> {
    this.assertDeliveryFence();
    if (this.options.childAdmission === undefined) throw new DsmmProfileError("unavailable", "Child role validation is unavailable.");
    const ticket = this.options.childAuthority!.acquireParentTicket(parent);
    this.assertOwnedParentTicket(ticket);
    const merged = AbortSignal.any([ticket.signal, ...signal === undefined ? [] : [signal]]);
    const evidence = "mode" in prepared.evidence ? parseLegacyChildEvidence(prepared.evidence) : parseChildAdmissionCapture(prepared.evidence);
    const check = (): void => {
      merged.throwIfAborted();
      if (this.disposed || this.disposedAgents.has(agent) || this.owner(agent) !== parent || this.agents()?.get?.(agent.id!) !== agent || this.agents()?.get?.(parent.id!) !== parent || evidence.childSessionId !== agent.id || evidence.parentSessionId !== parent.id) throw new DsmmProfileError("not-owned", "The exact child or its direct parent changed during admission.");
      const current = this.options.childAuthority!.acquireParentTicket(parent);
      this.assertOwnedParentTicket(current);
      if (current.admission !== ticket.admission || current.owner !== ticket.owner) throw new DsmmProfileError("conflict", "The child creation parent ticket changed.");
    };
    check();
    if (prepared.creation && "mode" in evidence) throw new DsmmProfileError("validation", "New children require a full original capture, not legacy evidence.");
    const original = "mode" in evidence ? prepared.admission : admissionFromChildCapture(evidence, this.baseline);
    const retained = childAdmissions.get(agent);
    if (retained !== undefined && retained.parent !== parent) throw new DsmmProfileError("not-owned", "The retained child's exact direct parent changed.");
    if (retained !== undefined && prepared.creation) throw new DsmmProfileError("validation", "A retained child cannot be admitted as a new creation.");
    if (retained !== undefined && JSON.stringify(retained.evidence) !== JSON.stringify(evidence)) throw new DsmmProfileError("corrupt-selection", "Retained child evidence cannot be replaced by a new parent policy.");
    const admission: AdmittedProfile = retained?.admission ?? freezeSettings({ ...original, baseline: original.settings,
      selectedId: original.profile?.id ?? null, appliedRevision: original.profile?.revision ?? null, selectionRevision: "absent" });
    if (!("mode" in evidence)) {
      if (prepared.creation && evidence.originalAdmissionEpoch !== ticket.parentEpoch) throw new DsmmProfileError("conflict", "The child creation invocation epoch changed.");
      if (prepared.admission.epoch !== evidence.originalAdmissionEpoch || JSON.stringify(prepared.admission.profile) !== JSON.stringify(evidence.profilePin)) throw new DsmmProfileError("validation", "Child admission identity does not match its original capture.");
      if (this.options.childCapturePersistence === "resident") {
        if (!prepared.creation && retained === undefined) throw new DsmmProfileError("unavailable", "Resident-only child capture has no cold restart guarantee.");
      } else {
        if (this.childCaptureStore.readChildAdmission === undefined || this.childCaptureStore.createChildAdmission === undefined) throw new DsmmProfileError("unavailable", "Durable child capture storage is unavailable.");
        if (prepared.creation) await this.childCaptureStore.createChildAdmission(evidence, check);
        else {
          const stored = await this.childCaptureStore.readChildAdmission(evidence.childSessionId, evidence.parentSessionId);
          if (JSON.stringify(stored) !== JSON.stringify(evidence)) throw new DsmmProfileError("corrupt-selection", "The child evidence does not match its immutable stored capture.");
        }
      }
    } else {
      if (prepared.admission.profile !== null) throw new DsmmProfileError("validation", "Legacy admission cannot synthesize an original profile pin.");
      if (this.childCaptureStore.readChildAdmission === undefined) throw new DsmmProfileError("unavailable", "Legacy admission requires a safe capture-absence check.");
      if (await this.childCaptureStore.readChildAdmission(evidence.childSessionId, evidence.parentSessionId) !== null) throw new DsmmProfileError("corrupt-selection", "A captured child cannot be downgraded to legacy recovery.");
    }
    check();
    this.options.childAdmission.validateRole(agent, parent, { ...prepared, evidence, admission, retained: retained !== undefined });
    check();
    this.bound.set(agent, admission);
    try { this.options.childAuthority!.registerParent(agent, admission, this.options.childAuthorityOwner ?? this); }
    catch (error) { this.bound.delete(agent); throw error; }
    childAdmissions.set(agent, { parent, admission, evidence });
  }

  /** C's scoped resolver callback: original resident/durable evidence, then explicit trusted legacy folds. */
  async resolveOriginalChildEvidence(ticket: ParentAdmissionTicket, childId: string, signal: AbortSignal, readLegacy?: LegacyChildEvidenceReader): Promise<ChildAdmissionEvidence> {
    validateSessionProfileId(childId);
    const merged = AbortSignal.any([ticket.signal, signal]);
    const check = (): void => {
      merged.throwIfAborted();
      this.assertDeliveryFence();
      if (this.disposed || this.disposedAgents.has(ticket.parent) || this.agents()?.get?.(ticket.parent.id!) !== ticket.parent) throw new DsmmProfileError("not-owned", "Original child evidence requires its exact live direct parent.");
      const current = this.options.childAuthority!.acquireParentTicket(ticket.parent);
      this.assertOwnedParentTicket(current);
      if (current.owner !== ticket.owner || current.admission !== ticket.admission || current.parentEpoch !== ticket.parentEpoch) throw new DsmmProfileError("conflict", "The original child evidence ticket changed.");
    };
    check();
    const child = this.agents()!.get!(childId);
    if (child !== undefined && this.owner(child) !== ticket.parent) throw new DsmmProfileError("not-owned", "Original evidence is scoped to the actual direct child, not an ancestor.");
    const retained = child === undefined ? undefined : childAdmissions.get(child);
    if (retained !== undefined && retained.parent !== ticket.parent) throw new DsmmProfileError("not-owned", "The retained evidence has a different exact parent.");
    const checkChild = (): void => {
      const current = this.agents()!.get!(childId);
      if (current !== undefined && this.owner(current) !== ticket.parent) throw new DsmmProfileError("not-owned", "The addressed child's direct owner changed during evidence reading.");
      if (retained !== undefined && (current !== child || childAdmissions.get(child!) !== retained)) throw new DsmmProfileError("conflict", "The retained child residency changed during evidence reading.");
    };
    const stored = await this.childCaptureStore.readChildAdmission?.(childId, ticket.parent.id!);
    check(); checkChild();
    if (stored !== undefined && stored !== null) {
      const capture = parseChildAdmissionCapture(stored);
      if (capture.childSessionId !== childId || capture.parentSessionId !== ticket.parent.id || retained !== undefined && JSON.stringify(retained.evidence) !== JSON.stringify(capture)) throw new DsmmProfileError("corrupt-selection", "Original child capture identity does not match its scoped residency.");
      return capture;
    }
    if (retained !== undefined) {
      if (!("mode" in retained.evidence)) {
        if (this.options.childCapturePersistence !== "resident") throw new DsmmProfileError("corrupt-selection", "The durable original child capture is missing; legacy recovery is not allowed.");
        return retained.evidence;
      }
      if (stored === undefined) throw new DsmmProfileError("unavailable", "Legacy evidence requires a safe capture-absence check.");
      return retained.evidence;
    }
    if (stored === undefined || readLegacy === undefined) throw new DsmmProfileError("unavailable", "Original capture is unavailable; only an explicit trusted legacy evidence reader can recover a captureless child.");
    const evidence = parseLegacyChildEvidence(await readLegacy(ticket, childId, merged));
    check(); checkChild();
    if (evidence.childSessionId !== childId || evidence.parentSessionId !== ticket.parent.id) throw new DsmmProfileError("not-owned", "Legacy evidence does not identify the addressed direct child.");
    return evidence;
  }

  private assertOwnedParentTicket(ticket: ParentAdmissionTicket): void {
    if (ticket.owner !== (this.options.childAuthorityOwner ?? this) || this.bound.get(ticket.parent) !== ticket.admission || ticket.parentEpoch !== ticket.admission.epoch) throw new DsmmProfileError("not-owned", "Child admission requires this entry's exact completed parent admission and owner.");
  }

  private subagentRuntimeView(): SubagentRuntimeAdmissionView {
    const view = this.options.childAuthority?.view() ?? { binding: "unavailable" as const, deliveryFenceReady: false, restartRequired: true, reason: "explicit-composition-required" as const };
    if (view.binding === "dsmm" && view.deliveryFenceReady && (this.options.childAdmission === undefined || this.options.validateRootRole === undefined)) return { ...view, deliveryFenceReady: false, restartRequired: true, reason: "authority-not-ready" };
    return view;
  }
  private assertDeliveryFence(): void {
    const view = this.subagentRuntimeView();
    if (view.binding !== "dsmm" || !view.deliveryFenceReady || this.options.childAuthority === undefined) throw new DsmmProfileError("unavailable", "This operation requires the explicit DSMM SubagentRuntime composition and ready Host admission authority; configure and restart before retrying.");
  }
  private assertRootRole(agent: DshAgent, settings: DsmmSettings): void {
    const role = resolveSelectedAgentPreset(agent.session);
    if (isDsmmRoleId(role) && (!settings.modules.deepwork.enabled || !settings.roles[role])) throw new DsmmProfileError("activation", "The selected root role is disabled by the candidate admission.", `settings.roles.${role}`, "deployment-ceiling");
  }
  private validateRootRole(agent: DshAgent, admission: DsmmProfileAdmission): void {
    if (this.options.childAuthority !== undefined && this.options.validateRootRole === undefined) throw new DsmmProfileError("unavailable", "Root role admission completion is unavailable; no direct-parent authority was registered.");
    this.options.validateRootRole?.(agent, admission);
  }
  private roleAvailability(settings: DsmmSettings, baseline: DsmmSettings, deployment?: DsmmDeploymentSnapshot, document?: DsmmProfileDocument | null): DsmmRoleAvailabilityState[] {
    return DSMM_ROLES.map(role => {
      const required = requiredReason(settings, role.id), named = document?.settings.roles?.[role.id];
      const startup = this.baseline.roles[role.id], desired = deployment?.settings.roles[role.id] ?? baseline.roles[role.id];
      const admitted = settings.modules.deepwork.enabled && settings.roles[role.id];
      const reason = !settings.modules.deepwork.enabled ? "module-off" : !desired ? "deployment-disabled" : !startup ? "startup-unavailable" : named === false ? "profile-disabled" : undefined;
      const startupCeiling = !startup && desired;
      const source = named !== undefined ? "named-session" : startupCeiling ? this.options.startup?.sources[`roles.${role.id}`] ?? "defaults" : deployment?.sources[`roles.${role.id}`] ?? "defaults";
      const capture = named !== undefined ? "named-session" : startupCeiling ? "startup" : "deployment";
      return { id: role.id, required: required !== undefined, ...(required === undefined ? {} : { requiredReason: required }), startupAvailable: startup, deploymentEnabled: desired,
        ...(named === undefined ? {} : { namedEnabled: named }), admitted, ...(reason === undefined ? {} : { reason }), source, capture };
    });
  }

  private async validate(settings: DsmmSettings, agent?: DshAgent, signal?: AbortSignal, auditCatalog = true): Promise<void> {
    if (!settings.modules.deepwork.enabled) return;
    if (this.options.validateCandidate !== undefined) {
      await this.options.validateCandidate(settings);
      return;
    }
    const registry = this.ctx.get?.<NativePresetAudit>("agentPresets");
    if (registry !== undefined) {
      for (const role of DSMM_ROLES.filter((role) => isRootRole(role) && settings.roles[role.id])) {
        try {
          const preset = await registry.resolve(role.id);
          if (preset.broken !== undefined) throw new Error("unusable root preset");
        } catch {
          throw new DsmmProfileError("activation", "An enabled DW root preset is unavailable. Resolve the native preset loading error before applying a profile.", role.id);
        }
      }
    }
    // New-root capture validates deployment/schema and standing capability, not
    // dormant role routes. Actual root requests and role/alias preflight own
    // model selection. Named Apply and retained-root startup keep full audits.
    if (!auditCatalog) return;
    const nativeAgent = agent ?? (this.agents()?.list() ?? []).find((candidate) => candidate.ctx?.get?.<DshLlmRuntime>("llm")?.resolveCallConfig !== undefined);
    const inherited = nativeAgent?.options;
    const inheritedRoute: DsmmModelRoute | undefined = inherited?.provider === undefined || inherited.model === undefined ? undefined
      : { provider: inherited.provider, model: inherited.model, ...(inherited.reasoningEffort === undefined ? {} : { reasoningEffort: inherited.reasoningEffort }) };
    const chains: Array<{ routes: DsmmModelRoute[]; field: string }> = [];
    for (const role of DSMM_ROLES) {
      if (!settings.roles[role.id]) continue;
      const policy = resolveRoleRuntimePolicy(settings, role.id);
      for (const [level, override] of Object.entries(settings.roleRouting[role.id]?.levels ?? {})) {
        const field = `settings.roleRouting.${role.id}.levels.${level}`;
        if (override.provider !== undefined) chains.push({ routes: [override, ...policy.fallbackRoutes], field });
        else {
          if (policy.primary === undefined && inheritedRoute === undefined) throw new DsmmProfileError("activation", "Open a native chat to validate the inherited model's exact level effort.", field, "invalid-route");
          chains.push({ routes: [policy.primary ?? inheritedRoute!, ...policy.fallbackRoutes].map(route => ({ ...route, reasoningEffort: override.reasoningEffort })), field });
        }
      }
      // No explicit primary inherits native routing. Dormant fallbacks alone
      // cannot make a usable inherited route fail profile Apply. If that exact
      // route is unavailable here, native request preflight remains authority.
      if (policy.primary === undefined && inheritedRoute === undefined) continue;
      const routes = [policy.primary ?? inheritedRoute!, ...policy.fallbackRoutes];
      if (routes.length > 0) chains.push({ routes, field: `settings.roleRouting.${role.id}.${policy.primary === undefined ? "fallbackRoutes" : "primary"}` });
    }
    if (chains.length === 0) return;
    const llm = nativeAgent?.ctx?.get?.<DshLlmRuntime>("llm")
      ?? this.ctx.get?.<DshLlmRuntime>("llm") ?? (this.ctx.get === undefined ? this.ctx.llm : undefined);
    if (llm?.resolveCallConfig === undefined) {
      throw new DsmmProfileError("activation", "Open a chat so its native model service can validate configured routes before applying this profile.");
    }
    for (const { routes, field } of chains) {
      try { await selectInitialModelRoute(llm, routes, signal); }
      catch { throw new DsmmProfileError("activation", "The configured provider, model or exact reasoning effort is unavailable in the native model catalog.", field); }
    }
  }
}

function newEpoch(): string { return createHash("sha256").update(randomUUID()).digest("hex"); }

function selectionState(selection: ProfileSelectionState): ProfileSelectionState {
  return { selectedId: selection.selectedId, appliedRevision: selection.appliedRevision, selectionRevision: selection.selectionRevision };
}

/** No guessed home fallback: native deployment context owns this directory. */
export async function createProfileRuntime(ctx: DshContext, baseline: DsmmSettings, options: DsmmProfileRuntimeOptions = {}): Promise<DsmmProfileRuntime> {
  const profile = ctx.get?.<{ dir?: string; home?: string }>("profileContext");
  if (typeof profile?.dir !== "string" || profile.dir.trim() === "") throw new DsmmProfileError("activation", "Deepwork profiles require the native deployment profile directory.");
  const legacy = join(profile.dir, "dsmm-profiles");
  let exists = false;
  try { lstatSync(legacy); exists = true; } catch (error) {
    if (!(error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw new DsmmProfileError("unsafe-path", "The current profile's legacy store could not be safely checked.");
  }
  // Loader callers use its actual public entry key. The old trusted non-Loader
  // constructor path has one compatibility namespace, not a guessed entry.
  const entry = options.startup?.entryId ?? (ctx instanceof Context ? ctx.fiber.entry?.id : undefined) ?? "trusted-direct";
  const store = exists ? ProfileStore.fromLegacy(legacy) : ProfileStore.fromCentral(resolveDshHome(profile.home), profile.dir, entry);
  const childCaptureStore = options.childCaptureStore ?? (exists ? ProfileStore.fromCentral(resolveDshHome(profile.home), profile.dir, entry) : store);
  const runtime = new DsmmProfileRuntime(ctx, baseline, store, { ...options, childCaptureStore });
  await runtime.initialize();
  return runtime;
}
