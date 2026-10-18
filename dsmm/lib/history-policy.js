/** The DSMM Git guard for the candidate's effective mode, not a grant from other policy layers. */
export function effectiveHistoryGitWriteGuard(settings, nativeFullAccess, deepworkActive) {
    const inScope = settings.guards.scope === "always" || settings.guards.scope !== "off" && deepworkActive;
    if (!inScope || nativeFullAccess && settings.guards.gitWriteGuard !== "deny")
        return "off";
    return settings.guards.gitWriteGuard;
}
//# sourceMappingURL=history-policy.js.map