import type { NativeCommandEntry } from "../permission-settings.js";
import type { PermissionLocaleKey } from "./permission-locales.js";
import type { DeploymentController } from "./deployment-controller.js";
type Text = (key: PermissionLocaleKey) => string;
export declare function validNativeEntries(entries: readonly NativeCommandEntry[]): boolean;
export declare function emptyNativeEntry(): NativeCommandEntry;
export declare function NativeCommandEntries({ value, inherited, controller, disabled, onChange, setInvalid, t }: {
    value: readonly NativeCommandEntry[] | undefined;
    inherited: readonly NativeCommandEntry[];
    controller: DeploymentController;
    disabled: boolean;
    onChange(value: readonly NativeCommandEntry[] | undefined): void;
    setInvalid(path: string, bad: boolean): void;
    t: Text;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=NativeCommandEntries.d.ts.map