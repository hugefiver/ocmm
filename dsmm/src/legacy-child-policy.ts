import { randomBytes } from "node:crypto";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { SubagentError } from "@deepseek-ai/dsh-subagent";
import type { ToolDefinition, ToolExecution, ToolGuard, ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { ChildAdmissionLimitation, ChildEvidenceField, LegacyChildEvidence } from "./child-capture.js";
import { parseLegacyChildEvidence } from "./child-capture.js";
import { DSMM_ROLE_IDS } from "./roles.js";
import type { DsmmProfileAdmission, DsmmSettings } from "./settings.js";
import { copyJson, freezeSettings, resolveConfig } from "./settings.js";
import type { LegacyReadCompositionLease } from "./legacy-read-contracts.js";
import type { LegacyReadProxy } from "./legacy-read-proxy.js";

export interface LegacyToolCapability {
  readonly kind: "read" | "child-report" | "write" | "shell" | "delegation" | "other";
  /** Stable native definition identity; name alone does not prove parameter permissions. */
  readonly definition: ToolDefinition;
  /** Exact schema/argument contract is audited by the Host/B collaborator, never inferred from a name. */
  assertArguments(arguments_: unknown): void;
  /** A read is admitted only inside the real registered proxy's leased native invocation. */
  readonly operation?: LegacyReadOperationCapability;
}
export interface LegacyReadOperationCapability {
  readonly parent: Agent;
  readonly child: Agent;
  readonly definition: ToolDefinition;
  assertLeasedOperation(exec: Readonly<ToolExecution>): void;
}
const readOperations = new WeakSet<object>();
/** Process-local glue for the trusted startup adapter, never a permission-query or wire grant. */
export function createLegacyReadOperationCapability(proxy: LegacyReadProxy,
  leaseFor: (exec: Readonly<ToolExecution>) => LegacyReadCompositionLease | undefined): LegacyReadOperationCapability {
  const { parent, child, definition } = proxy;
  const capability = Object.freeze({ parent, child, definition, assertLeasedOperation(exec: Readonly<ToolExecution>) {
    const lease = leaseFor(exec);
    if (lease === undefined || definition === proxy.nativeDefinition || exec.agent !== child || exec.name !== "read"
      || child.ctx.tools.get("read", child) !== definition || parent.ctx.tools.get("read", parent) !== proxy.nativeDefinition
      || lease.bindings.parent !== parent || lease.bindings.child !== child || lease.bindings.definition !== proxy.nativeDefinition
      || lease.ticket.parent !== parent) throw new SubagentError("Legacy read requires the real proxy's leased invocation", "UNAUTHORIZED");
    lease.assertActive();
  } });
  readOperations.add(capability);
  return capability;
}
export interface LegacyCapabilityCollaborators {
  classifyTool(name: string, tools: ToolRuntime, child: Agent): LegacyToolCapability | undefined;
  /** Exact direct-parent reporting authority only; read permission is decided by the real parent pipeline. */
  assertParentReport?(parent: Agent, child: Agent, arguments_: unknown, definition: ToolDefinition, evidence: LegacyChildEvidence): void;
  /** Older report collaborators may use this spelling. It is NEVER consulted for read. */
  assertParentTool?(parent: Agent, name: string, arguments_: unknown, definition: ToolDefinition): void;
  /** Trusted cold Host inventory of the actual registered child guard; never a permission grant. */
  onGuardInstalled?(child: Agent, guard: ToolGuard): void;
}
export interface LegacyToolDenial { readonly field: ChildEvidenceField; readonly code: ChildAdmissionLimitation["code"] }

/** A restrictive current admission, explicitly NOT a reconstruction of the original settings or epoch. */
export function createConservativeLegacyAdmission(raw: LegacyChildEvidence, parent: DsmmProfileAdmission, nativeSubstrate: DsmmSettings): DsmmProfileAdmission {
  const evidence = parseLegacyChildEvidence(raw);
  if (!parent.settings.modules.deepwork.enabled || !parent.settings.roles[evidence.role]) throw new SubagentError("Current parent denies the legacy role", "UNAUTHORIZED");
  const { locale: _locale, ...substrate } = copyJson(nativeSubstrate);
  const settings = resolveConfig({ ...substrate,
    modules: { deepwork: { enabled: true } },
    roles: Object.fromEntries(DSMM_ROLE_IDS.map(role => [role, role === evidence.role])),
    roleRouting: { [evidence.role]: { primary: evidence.route, fallbackRoutes: [] } },
    defaultActive: evidence.active ?? false,
    skills: Object.fromEntries(Object.keys(substrate.skills).map(skill => [skill, false])),
    deepseekV4ProCalibration: "off", deepseekV4ProDefaultReasoningEffort: "off", deepseekFlashCalibration: "off", deepseekFlashDefaultReasoningEffort: "off",
    workflow: { policy: "risk-based", strictGates: true, reviewCap: 0, finalReviewPolicy: "off" },
    guards: { scope: "always", shellCommandSafety: true, gitWriteGuard: "deny" },
    runtimeRecovery: { enabled: false, fallbackRoutes: [], idleContinuation: { enabled: false } },
    subagents: { toolTopology: "per-role", allowRouteOverride: false, enableRunInBackground: false, backgroundMode: "continuable", maxDepth: evidence.depth },
  });
  return freezeSettings({ settings, profile: null, epoch: randomBytes(32).toString("hex"), scope: "deployment-baseline", childEvidence: {
    mode: "legacy-conservative", parentAdmissionEpoch: parent.epoch, provenFields: evidence.provenFields, limitations: evidence.limitations } });
}

/** Body-before guard for the proven read subset and the native child -> direct-parent report path. */
export class LegacyChildToolPolicy {
  private readonly evidence: LegacyChildEvidence;
  private readonly parent: Agent;
  private readonly child: Agent;
  private readonly collaborators: LegacyCapabilityCollaborators;

  constructor(evidence: LegacyChildEvidence, parent: Agent, child: Agent, collaborators: LegacyCapabilityCollaborators) {
    this.evidence = parseLegacyChildEvidence(evidence);
    if (child.id !== evidence.childSessionId || parent.id !== evidence.parentSessionId || child.session.header.parentSession !== parent.id) {
      throw new SubagentError("Legacy tools require exact child/direct-parent identity", "UNAUTHORIZED");
    }
    this.parent = parent; this.child = child; this.collaborators = collaborators;
  }

  denial(name: string, arguments_: unknown, tools: ToolRuntime, exec?: Readonly<ToolExecution>): LegacyToolDenial | undefined {
    const capability = this.collaborators.classifyTool(name, tools, this.child);
    if (capability?.kind === "write") return { field: "runtime-policy", code: "missing-evidence" };
    if (capability?.kind === "shell") return { field: "shell", code: "missing-evidence" };
    if (capability?.kind === "delegation") return { field: "delegation", code: "missing-evidence" };
    if (capability === undefined || capability.kind === "other" || tools.get(name, this.child) !== capability.definition) return { field: "tool-filter", code: "missing-evidence" };
    if (capability.kind === "read" && (this.evidence.toolFilter?.allow === undefined || !this.evidence.toolFilter.allow.includes(name)
      || this.evidence.toolFilter.deny?.includes(name))) return { field: "tool-filter", code: "missing-evidence" };
    // The report collaborator must check the explicit destination against the exact direct parent.
    try { capability.assertArguments(arguments_); }
    catch { return { field: "tool-filter", code: "missing-evidence" }; }
    if (capability.kind === "read") {
      const operation = capability.operation;
      if (operation === undefined || !readOperations.has(operation) || operation.parent !== this.parent || operation.child !== this.child
        || operation.definition !== capability.definition || exec === undefined || exec.agent !== this.child || exec.name !== name
        || exec.arguments !== arguments_) return { field: "tool-filter", code: "unverified" };
      try { operation.assertLeasedOperation(exec); }
      catch { return { field: "tool-filter", code: "unverified" }; }
      return undefined;
    }
    try {
      if (this.collaborators.assertParentReport !== undefined) this.collaborators.assertParentReport(this.parent, this.child, arguments_, capability.definition, this.evidence);
      else if (this.collaborators.assertParentTool !== undefined) this.collaborators.assertParentTool(this.parent, name, arguments_, capability.definition);
      else throw new SubagentError("Legacy report requires exact parent authority", "UNAUTHORIZED");
    }
    catch { return { field: "tool-filter", code: "parent-denied" }; }
    return undefined;
  }

  assertTool(name: string, arguments_: unknown, tools: ToolRuntime, exec?: Readonly<ToolExecution>): void {
    if (this.denial(name, arguments_, tools, exec) !== undefined) throw new SubagentError("Legacy evidence does not authorize this tool capability", "UNAUTHORIZED");
  }
}

/** Scoped monotonic native guard; denied bodies never execute, including locally registered tools. */
export function installLegacyChildToolPolicy(evidence: LegacyChildEvidence, parent: Agent, child: Agent, collaborators: LegacyCapabilityCollaborators): () => void {
  const tools = child.ctx.get("tools");
  if (tools === undefined) throw new SubagentError("Legacy execution requires a native tool guard", "UNAUTHORIZED");
  const policy = new LegacyChildToolPolicy(evidence, parent, child, collaborators);
  const guard: ToolGuard = exec => exec.agent !== child || policy.denial(exec.name, exec.arguments, tools, exec) !== undefined
    ? "Legacy child capability is not proven by its durable evidence" : undefined;
  const release = tools.guard(guard);
  collaborators.onGuardInstalled?.(child, guard);
  return release;
}
