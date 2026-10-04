import type { Context } from "@deepseek-ai/cordis";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type {} from "@deepseek-ai/dsh-typert-registry";
import { TYPERT_HOST } from "./profile-remote.js";
import type { ProfileReadResult, ProfileSaveRequest, ProfileSelectRequest, ProfileSnapshot } from "./profile-types.js";
import { profileErrorInfo } from "./profiles.js";

export interface ProfilesBackend {
  describe(): Promise<ProfileSnapshot>;
  read(id: string): Promise<ProfileReadResult>;
  save(request: ProfileSaveRequest): Promise<ProfileReadResult>;
  select(request: ProfileSelectRequest): Promise<ProfileSnapshot>;
}

/** Business service addressed only by native Typert Gateway invocations. */
export class DsmmProfilesHost extends TypertRemoteService {
  constructor(ctx: Context, readonly backend: ProfilesBackend) { super(ctx, "dsmmProfiles"); }

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
}

declare module "@deepseek-ai/cordis" { interface Context { dsmmProfiles: DsmmProfilesHost } }

/** The caller supplies the owned injection fiber; withdrawal stays native. */
export function registerProfilesRpc(ctx: Context, backend: ProfilesBackend): DsmmProfilesHost {
  const service = new DsmmProfilesHost(ctx, backend);
  ctx.typert.register(TYPERT_HOST);
  return service;
}
