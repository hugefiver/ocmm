import * as Native from "@deepseek-ai/dsh-tool-fs";
import { DsmmPermissionController } from "./permission-controller.js";
import { temporaryFileToolScope } from "./permission-temporary-files.js";
export { Config, inject, name } from "@deepseek-ai/dsh-tool-fs";
export function apply(ctx, config) {
    return Native.apply(temporaryFileToolScope(DsmmPermissionController.toolScope(ctx, "fs"), "fs"), config);
}
//# sourceMappingURL=permission-fs.js.map