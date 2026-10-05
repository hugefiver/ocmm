import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { SessionProfileSnapshot } from "../profile-types.js";
import type {} from "./locales.js";

/** Presentation only: admitted identity never substitutes for sidecar CAS. */
export function sessionProfileLabels(session: SessionProfileSnapshot, t: PropsLocale<"settings.dsmm-profiles">["t"]): { admitted: string; futureDefault: string } {
  const admitted = session.admittedSelection;
  const profile = admitted === undefined && session.scope === "global-default" ? t("sessionGlobalCaptured")
    : (admitted ?? session.selection).selectedId === null ? t("sessionBaseline")
    : t("sessionAdmittedProfile", { id: (admitted ?? session.selection).selectedId!, revision: (admitted ?? session.selection).appliedRevision?.slice(0, 12) ?? "—" });
  const future = session.globalDefault;
  return {
    admitted: t("sessionState", { id: session.sessionId, profile, scope: session.scope, epoch: session.admissionEpoch }),
    futureDefault: t("sessionFutureDefault", { profile: future.selectedId === null ? t("sessionBaseline") : t("sessionAdmittedProfile", { id: future.selectedId, revision: future.appliedRevision?.slice(0, 12) ?? "—" }) }),
  };
}
