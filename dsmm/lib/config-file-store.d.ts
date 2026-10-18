import type { ProfileStoreOptions } from "./profile-store.js";
export declare const MAX_CONFIG_FILE_BYTES = 65536;
export interface ConfigFileReadResult {
    refreshRequired?: true;
    content: string | null;
    revision: string;
}
/** Trusted backend only: the caller resolves the public SDK home and validates sparse JSON. */
export declare class FixedConfigFileStore {
    private readonly directory;
    private readonly path;
    private readonly identities;
    private readonly timeoutMs;
    private readonly pollMs;
    private readonly rename;
    private readonly observe?;
    constructor(home: string, options?: ProfileStoreOptions);
    read(): ConfigFileReadResult;
    save(content: string, expectedRevision: string, assertCurrent?: () => void): Promise<{
        content: string;
        revision: string;
        refreshRequired?: true;
    }>;
    private validateRoot;
}
//# sourceMappingURL=config-file-store.d.ts.map