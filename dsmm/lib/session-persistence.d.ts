import { Context, Service } from "@deepseek-ai/cordis";
import type { SessionHeader, SessionId } from "@deepseek-ai/dsh-session";
import { SessionPersistence } from "@deepseek-ai/dsh-session-persistence";
import type { SessionAccess, SessionHandle, SessionPersistenceCreateOptions, SessionPersistenceListOptions, SessionPersistenceOpenOptions, SessionPersistenceStatOptions } from "@deepseek-ai/dsh-session-persistence";
import type { Config } from "@deepseek-ai/dsh-session-persistence-jsonl";
export { DSMM_PERSISTENCE_COMPATIBILITY } from "./session-metadata.js";
export type { Config } from "@deepseek-ai/dsh-session-persistence-jsonl";
/**
 * Drop-in native JSONL persistence companion for audited DSMM metadata.
 * A separate root Context is intentional: a child service-isolation scope still
 * shares the host event bus and would persist every live event twice.
 */
export default class DsmmSessionPersistence extends SessionPersistence {
    readonly config: Config;
    static Config: import("@deepseek-ai/schemastery").default<Config>;
    readonly name = "dsmm-session-persistence";
    private readonly inner;
    private readonly ready;
    private readonly handles;
    private readonly writers;
    private readonly acquisitions;
    private readonly closeFailures;
    private disposed;
    constructor(ctx: Context, config: Config);
    [Service.init](): Promise<void>;
    create(header: SessionHeader, options?: SessionPersistenceCreateOptions): Promise<SessionHandle>;
    open(id: SessionId, access: SessionAccess, options?: SessionPersistenceOpenOptions): Promise<SessionHandle>;
    flush(): Promise<void>;
    stat(id: SessionId, options?: SessionPersistenceStatOptions): Promise<import("@deepseek-ai/dsh-session-persistence").SessionPersistenceSnapshot | undefined>;
    list(options?: SessionPersistenceListOptions): Promise<readonly import("@deepseek-ai/dsh-session-persistence").SessionPersistenceSnapshot[]>;
    private acquire;
    private warn;
    private assertActive;
}
//# sourceMappingURL=session-persistence.d.ts.map