import { appendPluginRecord } from "@deepseek-ai/dsh-session";
/** Model-hidden observations use the official ignorable record boundary, never authorization. */
export function appendModeRecord(session, active) {
    appendPluginRecord(session, "plugin:dsmm/mode", { active });
}
export function appendRolePolicyRecord(session, data) {
    appendPluginRecord(session, "plugin:dsmm/role-policy", data);
}
//# sourceMappingURL=session-metadata.js.map