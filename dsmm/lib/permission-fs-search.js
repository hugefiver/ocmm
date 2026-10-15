import * as Native from "@deepseek-ai/dsh-tool-fs-search";
import { DsmmPermissionController } from "./permission-controller.js";
export { Config, inject, name } from "@deepseek-ai/dsh-tool-fs-search";
export function apply(ctx, config) {
    return Native.apply(DsmmPermissionController.toolScope(ctx, "fs-search"), config);
}
//# sourceMappingURL=permission-fs-search.js.map