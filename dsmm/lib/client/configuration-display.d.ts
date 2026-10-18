import type { ProfileSelectionState } from "../profile-types.js";
export declare const writableSelectionVersion: (value: unknown) => boolean;
export declare function configurationVersionState(value: unknown): "versionObserved" | "versionAbsent" | "versionUnknown";
export declare function sourceRelationship(selection: Pick<ProfileSelectionState, "sourceRevision">, savedRevision: string | null | undefined): "current" | "changed" | "unknown";
//# sourceMappingURL=configuration-display.d.ts.map