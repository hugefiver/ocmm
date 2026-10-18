import type { Context } from "@deepseek-ai/cordis";
import type { TemporaryFileOptions } from "./permission-temporary-files.js";
/** Captures only the native Web Fetch definition; search remains unchanged. */
export declare function temporaryWebToolScope(scope: Context): Context;
export declare function installTemporaryWebPermissions(ctx: Context, options: TemporaryFileOptions): () => void;
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmTemporaryWebPermissions: AbortSignal;
    }
}
//# sourceMappingURL=permission-temporary-web.d.ts.map