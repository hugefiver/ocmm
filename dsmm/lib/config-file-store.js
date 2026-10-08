import { renameSync } from "node:fs";
import { join } from "node:path";
import { profileStoreFilePrimitives as files } from "./profile-store.js";
import { DsmmProfileError, validateProfileRevision } from "./profiles.js";
export const MAX_CONFIG_FILE_BYTES = 65536;
/** Trusted backend only: the caller resolves the public SDK home and validates sparse JSON. */
export class FixedConfigFileStore {
    directory;
    path;
    identities = new Map();
    timeoutMs;
    pollMs;
    rename;
    constructor(home, options = {}) {
        this.directory = join(files.trustedHome(home), "plugins", "dsmm");
        this.path = join(this.directory, "config.json");
        this.timeoutMs = files.boundedOption(options.lockTimeoutMs, 2000, 0, 30000);
        this.pollMs = files.boundedOption(options.lockPollMs, 25, 1, 1000);
        this.rename = options.rename ?? renameSync;
        this.validateRoot(false);
    }
    read() {
        try {
            this.validateRoot(false);
            if (files.status(this.path) === undefined) {
                this.validateRoot(false);
                if (files.status(this.path) !== undefined)
                    throw new DsmmProfileError("conflict", "Global configuration changed while being read. Refresh before retrying.");
                return { content: null, revision: "absent" };
            }
            const file = files.regularFile(this.path, MAX_CONFIG_FILE_BYTES);
            this.validateRoot(false);
            return { content: file.content, revision: file.revision };
        }
        catch (error) {
            if (error instanceof DsmmProfileError)
                throw error;
            throw new DsmmProfileError("io", "Global configuration could not be read safely.");
        }
    }
    async save(content, expectedRevision, assertCurrent) {
        if (typeof content !== "string")
            throw new DsmmProfileError("validation", "Global configuration must be UTF-8 text.", "content");
        if (content.length > MAX_CONFIG_FILE_BYTES)
            throw new DsmmProfileError("limit", "Global configuration must not exceed 64 KiB.", "content");
        const bytes = Buffer.from(content, "utf8");
        if (bytes.length > MAX_CONFIG_FILE_BYTES)
            throw new DsmmProfileError("limit", "Global configuration must not exceed 64 KiB.", "content");
        if (bytes.toString("utf8") !== content)
            throw new DsmmProfileError("validation", "Global configuration must round-trip through UTF-8.", "content");
        if (expectedRevision !== "absent")
            validateProfileRevision(expectedRevision);
        return files.locked(this.directory, ".config.lock", (create) => this.validateRoot(create), this.timeoutMs, this.pollMs, (assertLock) => {
            const recheck = () => {
                if (this.read().revision !== expectedRevision)
                    throw new DsmmProfileError("conflict", "Global configuration changed. Refresh before saving; existing bytes were retained.");
            };
            recheck();
            files.atomicReplace(this.path, bytes, recheck, assertLock, this.rename, assertCurrent);
            return { content, revision: files.digest(bytes) };
        });
    }
    validateRoot(create) {
        files.validateDirectories(this.directory, create, true, this.identities);
    }
}
//# sourceMappingURL=config-file-store.js.map