/** Configuration versions are metadata markers, not content-integrity proofs. */
export declare function isConfigRevision(value: unknown): value is string;
/** Immutable snapshot references are bounded path components, including historical IDs. */
export declare function isProfileReference(value: unknown): value is string;
//# sourceMappingURL=config-revision.d.ts.map