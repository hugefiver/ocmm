import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { DeploymentSchemaNode } from "../profile-types.js";
import type { DeploymentController } from "./deployment-controller.js";
import type { PermissionLocaleKey } from "./permission-locales.js";
type Locale = PropsLocale<"plugins.dsmm">;
export declare const permissionText: (t: Locale["t"]) => (key: PermissionLocaleKey) => string;
export declare function fieldLabel(path: readonly string[], t: Locale["t"]): string;
export declare function displayValue(value: unknown, t: Locale["t"]): string;
export declare function AdvancedField({ schema, path, controller, inherited, upper, t }: Locale & {
    schema: DeploymentSchemaNode;
    path: string[];
    controller: DeploymentController;
    inherited: unknown;
    upper: unknown;
}): import("react").JSX.Element;
export declare function ScalarField({ schema, path, controller, inherited, t }: Locale & {
    schema: DeploymentSchemaNode;
    path: string[];
    controller: DeploymentController;
    inherited: unknown;
}): import("react").JSX.Element;
export declare function Field({ schema, path, controller, t }: Locale & {
    schema: DeploymentSchemaNode;
    path: string[];
    controller: DeploymentController;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=DeploymentFields.d.ts.map