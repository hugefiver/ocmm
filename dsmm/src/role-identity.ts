import type { DshAgent } from "./dsh-types.js";
import { nativeAgentContext } from "./native-scope.js";
import { buildRoleIdentity } from "./prompt-content.js";
import { DSMM_ROLES } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";

/** The caller supplies the policy-admitted identity; only its Agent layer is changed. */
export function registerRoleHarnessIdentity(agent: DshAgent, role: DsmmRoleId): () => void {
  const prompt = nativeAgentContext(agent).get("systemPrompt")!;
  return prompt.section({ name: "harness:identity", order: prompt.getSectionOrder("HARNESS_IDENTITY"),
    text: buildRoleIdentity(DSMM_ROLES.find(row => row.id === role)!) });
}
