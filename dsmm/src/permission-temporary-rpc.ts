import type { Context } from "@deepseek-ai/cordis";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { HostConnectionHandle } from "@deepseek-ai/dsh-client-connection";
import { SessionId } from "@deepseek-ai/dsh-session";
import { permissionOriginal } from "./permission-control.js";
import type { TemporaryPermissionGrants } from "./permission-temporary-grants.js";
import { TEMPORARY_PERMISSION_HOST, parseTemporaryDelivery, parseTemporaryDuration, parseTemporaryId } from "./permission-temporary-remote.js";
import type { TemporaryPermissionDelivery, TemporaryPermissionDuration } from "./permission-temporary-types.js";
import type { ChildPermissionControl } from "./permission-child-control.js";

/** Child access is an explicit current operator capability, never inferred from lineage strings. */
export interface TemporaryPermissionRpcOptions {
  readonly children?: ChildPermissionControl;
  authorizeChild?(peer: object, child: Agent): { assertCurrent(): void };
}
export class DsmmTemporaryPermissionsHost extends TypertRemoteService {
  private readonly lifetime = new AbortController();
  constructor(ctx: Context, private readonly grants: TemporaryPermissionGrants, private readonly options: TemporaryPermissionRpcOptions) {
    super(ctx, "dsmmTemporaryPermissions"); ctx.effect(() => () => this.lifetime.abort());
  }
  private invoke<T>(sessionId: string, operation: (agent: Agent, peer: object) => T): T {
    try {
      const id = SessionId(parseTemporaryId(sessionId)), invocation = this.ctx.invocation;
      const connection = this.ctx.get("connection") as HostConnectionHandle | undefined;
      const peer = invocation?.peer, registry = this.ctx.get("agents"), agent = registry?.get(id);
      if (!connection || !peer || peer !== connection.browserPeer || !agent || peer.signal.aborted || invocation.signal.aborted
        || this.lifetime.signal.aborted) throw new Error("Operator ownership unavailable.");
      if (agent.session.id !== sessionId) throw new Error("Session identity mismatch.");
      if (!registry!.roots().includes(agent) || agent.session.header.origin === "subagent") {
        const child = this.options.authorizeChild?.(peer, agent) ?? this.options.children?.authorizeChild(peer, agent);
        if (!child) throw new Error("Explicit child operator authorization required.");
        child.assertCurrent();
      }
      if (permissionOriginal(this.ctx.get("connection")!) !== permissionOriginal(connection)) throw new Error("Connection changed.");
      return operation(agent, peer);
    } catch (error) {
      throw new RemoteError("dsmm-temporary-permissions/refused", "Temporary permission operation refused.", { code: error instanceof TypeError ? "validation" : "unavailable" });
    }
  }
  private delivery(sessionId: string, input: TemporaryPermissionDelivery, operation: (peer: object, delivery: TemporaryPermissionDelivery) => unknown) {
    const delivery = parseTemporaryDelivery(input);
    return this.invoke(sessionId, (_agent, peer) => {
      const view = this.grants.request(peer, delivery.requestId, delivery.deliveryId);
      if (view.sessionId !== sessionId) throw new Error("Approval belongs to another session.");
      return operation(peer, delivery);
    });
  }
  @Remote describe(sessionId: string) { return this.invoke(sessionId, agent => this.grants.list(agent)); }
  @Remote request(sessionId: string, delivery: TemporaryPermissionDelivery) {
    return this.delivery(sessionId, delivery, (peer, value) => this.grants.request(peer, value.requestId, value.deliveryId));
  }
  @Remote retain(sessionId: string, delivery: TemporaryPermissionDelivery, duration: TemporaryPermissionDuration, scope = "exact") {
    return this.delivery(sessionId, delivery, (peer, value) => this.grants.retain(peer, value.requestId, value.deliveryId, parseTemporaryDuration(duration), parseTemporaryId(scope)));
  }
  @Remote permit(sessionId: string, delivery: TemporaryPermissionDelivery) {
    return this.delivery(sessionId, delivery, (peer, value) => this.grants.permit(peer, value.requestId, value.deliveryId));
  }
  @Remote revoke(sessionId: string, grantId: string) { return this.invoke(sessionId, agent => this.grants.revoke(agent, parseTemporaryId(grantId))); }
  private async childOperation(sessionId: string, childSessionId: string, action: "describe" | "enable" | "revoke") {
    try {
      return await this.invoke(sessionId, (parent, peer) => {
        const children = this.options.children, registry = this.ctx.get("agents"), child = registry?.get(SessionId(parseTemporaryId(childSessionId)));
        const connection = permissionOriginal(this.ctx.get("connection")!);
        if (!children || !child || !registry!.roots().includes(parent) || !registry!.isOwnedBy(child.id, parent)) throw new Error("Exact direct child required.");
        const check = () => this.invoke(sessionId, (current, currentPeer) => {
          if (current !== parent || currentPeer !== peer || permissionOriginal(this.ctx.get("connection")!) !== connection
            || registry!.get(child.id) !== child || !registry!.isOwnedBy(child.id, parent)) throw new Error("Child operator changed.");
        });
        return action === "describe" ? children.describe(parent, child) : children[action](parent, child, check);
      });
    } catch { throw new RemoteError("dsmm-temporary-permissions/refused", "Child permission operation refused.", { code: "unavailable" }); }
  }
  @Remote child(sessionId: string, childSessionId: string) { return this.childOperation(sessionId, childSessionId, "describe"); }
  @Remote enableChild(sessionId: string, childSessionId: string) { return this.childOperation(sessionId, childSessionId, "enable"); }
  @Remote revokeChild(sessionId: string, childSessionId: string) { return this.childOperation(sessionId, childSessionId, "revoke"); }
}
declare module "@deepseek-ai/cordis" { interface Context { dsmmTemporaryPermissions: DsmmTemporaryPermissionsHost } }
export function registerTemporaryPermissionRpc(ctx: Context, grants: TemporaryPermissionGrants, options: TemporaryPermissionRpcOptions = {}): DsmmTemporaryPermissionsHost {
  const host = new DsmmTemporaryPermissionsHost(ctx, grants, options); ctx.typert.register(TEMPORARY_PERMISSION_HOST); return host;
}
