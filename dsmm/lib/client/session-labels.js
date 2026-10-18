import { configurationVersionState } from "./configuration-display.js";
/** Presentation only: admitted identity never substitutes for sidecar CAS. */
export function sessionProfileLabels(session, t) {
    const admitted = session.admittedSelection;
    const profile = admitted === undefined ? t("sessionGlobalCaptured")
        : admitted.selectedId === null ? t("sessionBaseline")
            : t("sessionAdmittedProfile", { id: admitted.selectedId, revision: t(configurationVersionState(admitted.sourceRevision)) });
    const future = session.globalDefault;
    return {
        admitted: t("sessionState", { profile, scope: session.scope }),
        futureDefault: t("sessionFutureDefault", { profile: future.selectedId === null ? t("sessionBaseline") : t("sessionAdmittedProfile", { id: future.selectedId, revision: t(configurationVersionState(future.sourceRevision)) }) }),
    };
}
//# sourceMappingURL=session-labels.js.map