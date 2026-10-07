import { desiredDeepseekEffort, isDeepseekFlashRoute, isDeepseekV4ProRoute } from "./model-routing.js";
import { readPromptAsset as asset, SOURCE_ROLE_CATALOG, splitCategory } from "./prompt-content.js";
export { SOURCE_ROLE_CATALOG, buildRolePersona } from "./prompt-content.js";
const activation = `<dsmm-deepwork-mode>
Use this workflow only while the \`{{modeName}}\` mode is effectively active. This is an opt-in boundary: ordinary presets default off; DW roles default on, but explicit off wins and retains only persona/access. Never force common workflow or skills on merely from a role name.
\`workflow.policy=risk-based\` follows the source workflow below. Explicit \`workflow.policy=legacy\` retains the configured \`strictGates\`, \`reviewCap\` and \`finalReviewPolicy\` gates; it is compatibility policy, not extra authorization. Role scope, output and terminal delegation policy are authoritative over all workflow/model guidance.
Skills are native metadata and lazy bodies, never automatically injected. Load matching skills only through the actual native skill catalog. Treat \`[dsmm safety]\` messages as binding feedback. Implementing does not authorize a commit; a commit does not authorize push/tag/rebase/release.
</dsmm-deepwork-mode>`;
export const BASE_DEEPWORK_PROMPT = [activation, asset("deepwork/default.md"), asset("shared/shell-safety.md"), asset("shared/dsh-host-contract.md")].join("\n\n---\n\n");
// Prompt-only matching follows src/intent/model-family.ts, not model routing.
function modelName(fullId) {
    const name = fullId.slice(fullId.lastIndexOf("/") + 1).toLowerCase();
    const vendors = { openai: /^(?:gpt-|o\d|chatgpt-|codex-)/u, anthropic: /^claude-/u, google: /^gemini-/u, zhipu: /^glm-/u, deepseek: /^deepseek-/u };
    const parts = name.split("."), direct = parts.slice(1).join("."), regional = parts.slice(2).join(".");
    if (vendors[parts[0]]?.test(direct))
        return direct;
    if (/^(?:[a-z]{2}|[a-z]{2}-[a-z]+-\d+)$/u.test(parts[0]) && vendors[parts[1]]?.test(regional))
        return regional;
    return name;
}
export function promptModelVariants(role, model) {
    const name = modelName(model);
    const gpt = name.includes("gpt") || model.toLowerCase().includes("codex");
    const opus = /^claude-opus-5(?:[-.]5)?(?:$|[-.](?:20\d{6}(?:[-.][a-z0-9]+)*|[a-z][a-z0-9-]*))$/iu.test(name.replace(/^global\.anthropic\./iu, "").replace(/@default$/iu, ""));
    const kimi = ["kimi-for-coding", "kimi-for-coding-highspeed"].includes(name) || /^(?:kimi-k2[.-]?[78]|k2[-.]?p[78])(?:$|[-_.])/u.test(name);
    const additive = gpt ? ["gpt"] : kimi ? ["kimi-k27"] : /^swe-2(?:[-.]|$)/u.test(name) ? ["swe-2"] : [];
    const base = role === "planner" ? "planner" : role === "orchestrator" && opus ? "claude-opus-5"
        : model.toLowerCase().includes("codex") ? "codex" : gpt ? "gpt" : name.startsWith("gemini-") ? "gemini" : name.includes("glm") ? "glm" : "default";
    return [...new Set([base, ...additive])].filter((variant) => variant !== "default");
}
export function roleModelCalibration(role, model) {
    const variants = promptModelVariants(role?.sourceId, model);
    const layers = variants.map((variant) => asset(`deepwork/${variant}.md`));
    if (role?.kind === "category" && role.promptArtifact !== null) {
        const category = splitCategory(asset(role.promptArtifact.replace("prompts/source/", "")));
        const name = modelName(model);
        const family = model.toLowerCase().includes("codex") || name.includes("gpt") ? "gpt" : name.startsWith("gemini-") ? "gemini" : name.includes("glm") ? "glm" : name.includes("claude") ? "claude" : "unknown";
        // Categories carry only their own family layer + additive model calibration,
        // not the base-agent Gemini/GLM/planner workflow variants.
        return [category.calibrations.get(family), ...layers.filter((_layer, index) => ["gpt", "kimi-k27", "swe-2"].includes(variants[index]))].filter(Boolean).join("\n\n---\n\n");
    }
    return layers.join("\n\n---\n\n");
}
export const DEEPSEEK_V4_PRO_OVERLAY = `<dsmm-deepseek-v4-pro-calibration>

DeepSeek V4 Pro calibration is active.

- Treat complex coding, architecture, migration, debugging, and review tasks as deliberate reasoning tasks.
- First classify the task and identify the evidence needed.
- Use tools before making repository-specific or API-specific claims.
- Runtime reasoning effort is enforced by \`agent/request\`, not this prompt.
- In \`auto\` calibration, explicit upstream reasoning effort is preserved; \`strict\` overrides it with computed policy.
- Only adapter-advertised reasoning efforts are emitted; \`max\` is selected only for configured DW presets.
- Keep final answers concise and do not expose private chain-of-thought.
- When tool calls are enabled through the provider, preserve the provider-required reasoning/tool-call continuity.

</dsmm-deepseek-v4-pro-calibration>`;
export const DEEPSEEK_FLASH_OVERLAY = `<dsmm-deepseek-flash-calibration>

DeepSeek-V41-Flash applies only to the verified deepseek-official/deepseek-flash or deepseek-account/deepseek-flash routes. The host catalog and explicit user model choice are authoritative.

- Keep work outcome-first and avoid procedural review or approval loops.
- Runtime reasoning effort is chosen by the adapter only from the resolved model's advertised efforts. If the catalog advertises no reasoning efforts, leave the request unchanged.
- Auto preserves explicit upstream effort; strict overrides it only with an advertised effort.
- Do not assume max, high, temperature, or another model's capabilities. Do not claim model heterogeneity when all child roles use the same route.
- Maintain tool-call continuity required by the provider and never reveal private reasoning.

</dsmm-deepseek-flash-calibration>`;
export function buildDeepworkPrompt(settings, options = {}) {
    const role = SOURCE_ROLE_CATALOG.find((role) => role.id === (options.roleId === undefined ? options.selectedPreset : options.roleId));
    const common = role === undefined ? BASE_DEEPWORK_PROMPT : [activation, asset("deepwork/default.md")].join("\n\n---\n\n");
    const family = roleModelCalibration(role, options.route?.model ?? "");
    const base = [options.overrideSection?.trim() || common, family === "" ? "" : `<workflow-model-calibration>\nThe role prompt is authoritative for scope, permissions and output. Model calibration never grants tools or changes the native route.\n\n${family}\n</workflow-model-calibration>`].filter(Boolean).join("\n\n---\n\n").replaceAll("{{modeName}}", settings.modeName);
    const workflowPolicy = settings.workflow.policy === "legacy" ? `<dsmm-workflow-policy>
policy: legacy
strictGates: ${String(settings.workflow.strictGates)}
reviewCap: ${String(settings.workflow.reviewCap)}
finalReviewPolicy: ${settings.workflow.finalReviewPolicy}
</dsmm-workflow-policy>` : `<dsmm-workflow-policy>policy: risk-based</dsmm-workflow-policy>`;
    const route = options.route;
    const model = route !== undefined && isDeepseekV4ProRoute(route) ? "v4-pro"
        : route !== undefined && isDeepseekFlashRoute(route) ? "flash" : undefined;
    const calibration = model === "flash" ? settings.deepseekFlashCalibration : settings.deepseekV4ProCalibration;
    const calibrationPolicy = model === undefined ? "" : `<dsmm-deepseek-${model}-policy>
calibrationMode: ${calibration}
defaultReasoningEffort: ${model === "flash" ? settings.deepseekFlashDefaultReasoningEffort : settings.deepseekV4ProDefaultReasoningEffort}
maxReasoningPresets: ${(model === "flash" ? settings.deepseekFlashMaxReasoningPresets : settings.deepseekV4ProMaxReasoningPresets).join(", ")}
effectiveDesiredReasoningEffort: ${desiredDeepseekEffort(settings, options.selectedPreset, model)}
</dsmm-deepseek-${model}-policy>`;
    const calibrated = model !== undefined && calibration !== "off"
        ? `${base}\n\n${model === "flash" ? DEEPSEEK_FLASH_OVERLAY : DEEPSEEK_V4_PRO_OVERLAY}\n\n${calibrationPolicy}` : base;
    return `${calibrated}\n\n${workflowPolicy}`;
}
//# sourceMappingURL=prompts.js.map