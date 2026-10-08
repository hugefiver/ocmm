import type { DeploymentAdmissionView, DeploymentEditorSnapshot, DeploymentSchemaNode } from "../profile-types.js";
import type { DeploymentPathEdit } from "../deployment-config.js";
export declare function record(value: unknown): value is Record<string, unknown>;
export declare function at(value: unknown, path: readonly string[]): unknown;
export declare function equal(a: unknown, b: unknown): boolean;
export declare function mergeLayer(base: unknown, override: unknown): unknown;
/** Strict JSON with duplicate-key rejection; never silently last-key-wins. */
export declare function parseAdvanced(text: string): unknown;
export declare function editLayer(base: Record<string, unknown>, path: readonly string[], value: unknown): Record<string, unknown>;
/** Preserve untouched sparse fields; arrays are one schema field, not indexed RPC paths. */
export declare function layerDiff(base: Record<string, unknown>, draft: Record<string, unknown>, prefix?: string[]): DeploymentPathEdit[];
export declare function validateEditorValue(value: unknown, schema: DeploymentSchemaNode, sparse?: boolean): boolean;
export declare function enumValues(schema: DeploymentSchemaNode): Array<string | number | boolean> | null;
/** Only Host-projected inspector layers, never raw sparse editor input. */
export declare function inspectorPaths(snapshot: DeploymentEditorSnapshot, admitted: DeploymentAdmissionView | null): string[];
//# sourceMappingURL=deployment-data.d.ts.map