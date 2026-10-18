import type { TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry";
import type { ChildPermissionView, TemporaryPermissionDelivery, TemporaryPermissionDuration, TemporaryPermissionGrantView, TemporaryPermissionRequestView } from "./permission-temporary-types.js";
export declare function parseTemporaryId(value: unknown): string;
export declare function parseTemporaryDuration(value: unknown): TemporaryPermissionDuration;
export declare function parseTemporaryDelivery(value: unknown): TemporaryPermissionDelivery;
export declare function parseTemporaryGrants(value: unknown): readonly TemporaryPermissionGrantView[];
export declare function parseTemporaryRequest(value: unknown): TemporaryPermissionRequestView;
export declare function parseChildPermission(value: unknown): ChildPermissionView;
export declare const TEMPORARY_PERMISSION_REMOTE: TypertRemoteContribution;
export declare const TEMPORARY_PERMISSION_HOST: TypertContribution;
declare module "@deepseek-ai/dsh-typert-protocol/types" {
    interface RemoteErrorDetailsMap {
        "dsmm-temporary-permissions/refused": {
            code: string;
        };
    }
}
//# sourceMappingURL=permission-temporary-remote.d.ts.map