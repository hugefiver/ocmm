import type { Context } from "@deepseek-ai/cordis";
import type { ToolExecution } from "@deepseek-ai/dsh-tools";
import type { CorePermissionAuthority } from "./core-permission-authority.js";
import type { DsmmRolePolicy } from "./role-policy.js";
import type { DshAgent } from "./dsh-types.js";
import type { PermissionRulesRuntimeSync } from "./permission-rules.js";
import { PermissionRefusal, permissionOriginal } from "./permission-control.js";
import { TemporaryPermissionGrants } from "./permission-temporary-grants.js";
import { installPermissionExecArgv } from "./permission-exec-argv.js";
import type { ArgvPermissionOptions, ArgvPermissionAuthority } from "./permission-exec-argv.js";
import { installTemporaryFilePermissions } from "./permission-temporary-files.js";
import { installTemporaryWebPermissions } from "./permission-temporary-web.js";
import { registerTemporaryPermissionRpc } from "./permission-temporary-rpc.js";
import { ChildPermissionControl } from "./permission-child-control.js";
import { DSMM_ROLES } from "./roles.js";

export interface TemporaryPermissionInstallOptions {
  readonly core: CorePermissionAuthority;
  readonly roles: DsmmRolePolicy;
  readonly rules: PermissionRulesRuntimeSync;
  /** Explicit owned argv composition. Omit only when this capability is not installed. */
  readonly argv?: Pick<ArgvPermissionOptions, "programKind" | "environment" | "maxOutputBytes" | "timeoutMs">;
}

/** Composition from the real Core/role owners; no boolean ownership or test-provider authority. */
export function temporaryPermissionCapture(options: TemporaryPermissionInstallOptions, exec: Readonly<ToolExecution>): ArgvPermissionAuthority {
  const current = options.core.authority.current(exec), integrity = options.core.authority.captureIntegrity?.(exec);
  if (!integrity || !integrity.signal || !exec.agent) throw new PermissionRefusal("unavailable");
  const snapshot = options.rules.getPolicy();
  const assertIntegrity = () => {
    integrity.assertCurrent(); options.roles.assertToolExecution(exec);
    const tools = exec.agent!.ctx.get("tools");
    if (!tools || options.roles.toolDenial(exec.agent as unknown as DshAgent, exec.name, tools, exec)) throw new PermissionRefusal("denied");
  };
  return { owner: current.owner, generation: current.permissionRevision, sessionSignal: integrity.signal, assertIntegrity,
    assertProgramAllowed() {
      assertIntegrity(); options.core.authority.assertCurrent(current, exec);
      if (options.rules.getPolicy() !== snapshot || options.rules.status().state !== "synced") throw new PermissionRefusal("stale");
    } };
}

/** Install in the same Host fiber as the Core authority, after the patched Approval/Gateway and rules owners. */
export function installTemporaryPermissions(ctx: Context, options: TemporaryPermissionInstallOptions) {
  const approval = ctx.get("approval"), gateway = ctx.get("typertGateway");
  if (!options.rules.status().mounted || !approval || !gateway || typeof approval.settlement !== "function" || typeof gateway.registerApprovalPermits !== "function") throw new PermissionRefusal("unavailable");
  const grants = new TemporaryPermissionGrants(approval, gateway);
  ctx.effect(() => () => grants.dispose());
  const children = new ChildPermissionControl(ctx, grants, { refresh: () => options.rules.refresh(), capture(parent, child) {
    options.core.assertWritable(parent);
    const structural = child as unknown as DshAgent, root = parent as unknown as DshAgent;
    options.roles.assertModuleAdmission(structural);
    const identity = options.roles.identity(structural), parentIdentity = options.roles.identity(root);
    const check = () => {
      options.core.assertWritable(parent); options.roles.assertModuleAdmission(structural);
      const current = options.roles.identity(structural), currentParent = options.roles.identity(root);
      if (!current.child || current.parent !== parent || current.epoch !== identity.epoch || current.role !== identity.role || current.readOnly !== identity.readOnly
        || currentParent.epoch !== parentIdentity.epoch || currentParent.role !== parentIdentity.role) throw new PermissionRefusal("stale");
    };
    check(); return { check, role: identity.role, readOnly: identity.readOnly === true || DSMM_ROLES.find(role => role.id === identity.role)?.access === "read-only" };
  } });
  const capture = (exec: Readonly<ToolExecution>) => {
    const nativeApproval = exec.agent?.ctx.get("approval");
    if (!nativeApproval || permissionOriginal(nativeApproval) !== permissionOriginal(approval)) throw new PermissionRefusal("unavailable");
    const authority = temporaryPermissionCapture(options, exec);
    return { ...authority, assertRetentionAllowed() {
      if (!exec.agent || !ctx.get("agents")?.roots().includes(exec.agent) || exec.agent.session.header.origin === "subagent") children.assertEnabled(exec.agent!);
    } };
  };
  const files = installTemporaryFilePermissions(ctx, { grants, capture, refresh: () => options.rules.refresh() });
  const web = installTemporaryWebPermissions(ctx, { grants, capture, refresh: () => options.rules.refresh() });
  const argv = options.argv && installPermissionExecArgv(ctx, { ...options.argv, grants, capture(exec) {
    const authority = capture(exec);
    return { ...authority, assertProgramAllowed() {
      authority.assertProgramAllowed();
      const { policy } = options.rules.getPolicy();
      // Arbitrary argv cannot prove shell-rule equivalence or confined file reads.
      if (policy.outsideReads === "deny" || policy.rules.some(rule => !rule.revoked && rule.action === "deny"
        && (rule.match.kind === "shell" || rule.match.kind === "outside-read"))) throw new PermissionRefusal("unavailable");
    } };
  } });
  const argvDefinition = argv && ctx.tools.get("dsmm_exec_argv");
  const refreshArgv = argvDefinition && ctx.on("tools/pre-execute", async (exec, next) => {
    if (ctx.tools.get(exec.name, exec.agent) === argvDefinition) await options.rules.refresh();
    return next();
  }, { prepend: true, global: true });
  const rpc = registerTemporaryPermissionRpc(ctx, grants, { children });
  ctx.on("agent/disposed", ({ agent }) => grants.revokeAgent(agent), { global: true });
  return { grants, rpc, children, dispose() { children.dispose(); refreshArgv?.(); argv?.(); web(); files(); grants.dispose(); } };
}
