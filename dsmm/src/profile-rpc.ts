import { symbols } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import { Remote, RemoteError, TypertRemoteService, remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import type { HostConnectionHandle } from "@deepseek-ai/dsh-client-connection";
import type { SessionController } from "@deepseek-ai/dsh-api-session-controller";
import { SessionId } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-typert-registry";
import { TYPERT_HOST } from "./profile-remote.js";
import type { ProfileReadResult, ProfileSaveRequest, ProfileSelectRequest, ProfileSnapshot, SessionProfileSelectRequest, SessionProfileSnapshot } from "./profile-types.js";
import { DsmmProfileError, profileErrorInfo } from "./profiles.js";
import type { DshAgent, DshAgentsRegistry } from "./dsh-types.js";

/** The public SessionController capability, without importing its client graph. */
type NativeSessionAuthority = Pick<SessionController, "resolveAgent">;

export interface ProfilesBackend {
  describe(): Promise<ProfileSnapshot>;
  read(id: string): Promise<ProfileReadResult>;
  save(request: ProfileSaveRequest): Promise<ProfileReadResult>;
  select(request: ProfileSelectRequest): Promise<ProfileSnapshot>;
  getSession(agent: DshAgent): Promise<SessionProfileSnapshot>;
  selectSession(request: SessionProfileSelectRequest, capturedAgent: DshAgent, signal?: AbortSignal, assertAuthority?: () => void): Promise<SessionProfileSnapshot>;
}

/** Business service addressed only by native Typert Gateway invocations. */
export class DsmmProfilesHost extends TypertRemoteService {
  private readonly lifetime = new AbortController();

  constructor(ctx: Context, readonly backend: ProfilesBackend) {
    super(ctx, "dsmmProfiles");
    ctx.effect(() => () => this.lifetime.abort(), "dsmmProfiles: cancel scoped operations");
  }

  private async invoke<T>(operation: () => Promise<T>): Promise<T> {
    const invocation = this.ctx.invocation;
    if (invocation === undefined || invocation.peer === undefined) {
      throw new RemoteError("dsmm-profiles/peer-required", "Use Deepwork Profiles through the native Host connection.", {});
    }
    invocation.signal.throwIfAborted();
    try { return await operation(); }
    catch (error) { throw new RemoteError("dsmm-profiles/refused", "The Host refused the profile operation.", profileErrorInfo(error)); }
  }

  @Remote
  describe(): Promise<ProfileSnapshot> { return this.invoke(() => this.backend.describe()); }
  @Remote
  read(id: string): Promise<ProfileReadResult> { return this.invoke(() => this.backend.read(id)); }
  @Remote
  save(request: ProfileSaveRequest): Promise<ProfileReadResult> { return this.invoke(() => this.backend.save(request)); }
  @Remote
  select(request: ProfileSelectRequest): Promise<ProfileSnapshot> { return this.invoke(() => this.backend.select(request)); }

  /** Native Connection's exact operator is authority, not a claimed Peer ID. */
  private async invokeSession<T>(sessionId: string, operation: (agent: DshAgent, signal: AbortSignal, assertAuthority: () => void) => Promise<T>, readOnly = false): Promise<T> {
    return this.invoke(async () => {
      const invocation = this.ctx.invocation!;
      const connection = this.ctx.get("connection") as HostConnectionHandle | undefined;
      if (connection === undefined || connection.operator !== invocation.peer) {
        throw new DsmmProfileError("not-owned", "The native Host operator must own this session profile operation.");
      }
      // Cordis rebinds Service projections for each accessing Context. Its
      // public original symbol identifies the exact native authority owner.
      const connectionOwner: unknown = Reflect.get(connection, symbols.original) ?? connection;
      const signal = AbortSignal.any([invocation.signal, this.lifetime.signal]);
      const checkAuthority = (): DshAgentsRegistry => {
        if (signal.aborted) throw new DsmmProfileError("cancelled", "The session profile operation was cancelled; no late selection is allowed.");
        const currentConnection = this.ctx.get("connection") as HostConnectionHandle | undefined;
        const currentOwner: unknown = currentConnection === undefined ? undefined : Reflect.get(currentConnection, symbols.original) ?? currentConnection;
        if (currentOwner !== connectionOwner || currentConnection?.operator !== invocation.peer) {
          throw new DsmmProfileError("not-owned", "The native Host operator connection is no longer active.");
        }
        const agents = this.ctx.get("agents") as DshAgentsRegistry | undefined;
        if (agents === undefined || typeof agents.get !== "function" || typeof agents.roots !== "function" || typeof agents.list !== "function" || typeof agents.isOwnedBy !== "function") {
          throw new DsmmProfileError("unavailable", "Native session authority is unavailable.");
        }
        return agents;
      };
      let agents = checkAuthority();
      let captured = agents.get(sessionId);
      if (captured === undefined) {
        // Gateway lookups run before invocation authentication. Resolve here,
        // after full strict JSON decoding and operator admission, so invalid or
        // unauthorized calls cannot cold-resume a native session as a side effect.
        const controller = this.ctx.get("sessionController") as NativeSessionAuthority | undefined;
        if (controller === undefined || typeof controller.resolveAgent !== "function") {
          throw new DsmmProfileError("unavailable", "The native ordinary-session resume service is unavailable.");
        }
        let found: Awaited<ReturnType<NativeSessionAuthority["resolveAgent"]>>;
        try { found = await controller.resolveAgent(SessionId(sessionId)); }
        catch {
          checkAuthority();
          throw new DsmmProfileError("unavailable", "The native session could not be safely resumed.", "sessionId");
        }
        agents = checkAuthority();
        if ("error" in found) {
          const code = remoteErrorOf(found.error)?.code as string | undefined;
          if (code === "session/not-found") throw new DsmmProfileError("not-found", "The native session was not found.", "sessionId");
          if (code === "session/agent-busy") throw new DsmmProfileError("not-owned", "Subagent-owned sessions cannot select a root profile.", "sessionId");
          if (code === "session/writer-held") throw new DsmmProfileError("busy", "The native session is owned by another active writer.", "sessionId");
          throw new DsmmProfileError("unavailable", "The native session could not be safely resumed.", "sessionId");
        }
        captured = found.agent as unknown as DshAgent;
      }
      const agent = captured;
      const checkCaptured = (): void => {
        const current = checkAuthority();
        if (agent.id !== sessionId || agent.session.id !== sessionId || current.get(sessionId) !== agent
          || agent.session.header?.origin === "subagent" || !current.roots().includes(agent)
          || current.list().some((owner) => owner !== agent && current.isOwnedBy(sessionId, owner))) {
          throw new DsmmProfileError("not-owned", "Only an exact live ordinary root session can select a profile.", "sessionId");
        }
      };
      checkCaptured();
      const result = await operation(agent, signal, checkCaptured);
      // Mutation owns its final pre-commit fence in native maintenance. A
      // successful durable commit must not be relabeled as a failed write if
      // a queued wake/disposal wins immediately after maintenance releases.
      if (readOnly) checkCaptured();
      return result;
    });
  }

  @Remote
  describeSession(sessionId: string): Promise<SessionProfileSnapshot> {
    return this.invokeSession(sessionId, (agent) => this.backend.getSession(agent), true);
  }

  @Remote
  selectSession(sessionId: string, request: SessionProfileSelectRequest): Promise<SessionProfileSnapshot> {
    // The redundant stable identity is a fence, never an authority assertion.
    // Check it before any native resume or profile-store operation.
    if (request.sessionId !== sessionId) {
      return this.invoke(async () => { throw new DsmmProfileError("validation", "The requested session identities must match.", "sessionId"); });
    }
    return this.invokeSession(sessionId, (agent, signal, assertAuthority) => this.backend.selectSession(request, agent, signal, assertAuthority));
  }
}

declare module "@deepseek-ai/cordis" { interface Context { dsmmProfiles: DsmmProfilesHost } }

/** The caller supplies the owned injection fiber; withdrawal stays native. */
export function registerProfilesRpc(ctx: Context, backend: ProfilesBackend): DsmmProfilesHost {
  const service = new DsmmProfilesHost(ctx, backend);
  ctx.typert.register(TYPERT_HOST);
  return service;
}
