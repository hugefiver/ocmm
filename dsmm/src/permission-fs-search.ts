import type { Context } from "@deepseek-ai/cordis";
import * as Native from "@deepseek-ai/dsh-tool-fs-search";
import { DsmmPermissionController } from "./permission-controller.js";
import { temporaryFileToolScope } from "./permission-temporary-files.js";

export { Config, inject, name } from "@deepseek-ai/dsh-tool-fs-search";
export function apply(ctx: Context, config: Native.Config): ReturnType<typeof Native.apply> {
  return Native.apply(temporaryFileToolScope(DsmmPermissionController.toolScope(ctx, "fs-search"), "fs-search"), config);
}
