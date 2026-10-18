import { nativeAgentContext } from "./native-scope.js";
import { buildRoleIdentity } from "./prompt-content.js";
import { DSMM_ROLES } from "./roles.js";
/** The caller supplies the policy-admitted identity; only its Agent layer is changed. */
export function registerRoleHarnessIdentity(agent, role) {
    const prompt = nativeAgentContext(agent).get("systemPrompt");
    return prompt.section({ name: "harness:identity", order: prompt.getSectionOrder("HARNESS_IDENTITY"),
        text: buildRoleIdentity(DSMM_ROLES.find(row => row.id === role)) });
}
//# sourceMappingURL=role-identity.js.map