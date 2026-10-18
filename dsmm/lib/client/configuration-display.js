import { isConfigRevision } from "../config-revision.js";
export const writableSelectionVersion = (value) => value === "absent" || isConfigRevision(value);
export function configurationVersionState(value) {
    if (value === "absent")
        return "versionAbsent";
    return isConfigRevision(value) || typeof value === "string" && /^native-v1-\d+$/u.test(value) ? "versionObserved" : "versionUnknown";
}
export function sourceRelationship(selection, savedRevision) {
    return selection.sourceRevision === undefined || savedRevision == null || !isConfigRevision(savedRevision) ? "unknown" : selection.sourceRevision === savedRevision ? "current" : "changed";
}
//# sourceMappingURL=configuration-display.js.map