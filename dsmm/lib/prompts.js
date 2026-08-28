import { desiredDeepseekEffort, isDeepseekV4ProRoute } from "./model-routing.js";
export const BASE_DEEPWORK_PROMPT = `<dsmm-deepwork-mode>

DEEPWORK MODE ENABLED!

Use this workflow only while the \`{{modeName}}\` mode is active OR a DSMM-managed preset is selected. This is an opt-in boundary: outside both conditions, do not apply dsmm-specific gates, intent routing, or tool-discipline requirements. The default mode name is \`deepwork\` unless configured.

## Intent routing

Begin non-trivial responses with one short line in the user's language: \`我读到这是[研究/实现/调查/评估/修复/开放式]任务 - [原因]。我会[执行方式]。\`

## Workflow gates

- For new features, components, or behavior changes, present a design before implementation.
- For multi-step implementation, create a concrete plan before changing code.
- For completed implementation, gather evidence from tests, diagnostics, and real surfaces before declaring done.
- Keep scope exact. Do not add unrelated refactors, speculative abstractions, or surprise features.
- The bundled workflow skill set is available in this mode: \`brainstorming\`, \`writing-plans\`, \`subagent-driven-development\`, \`dispatching-parallel-agents\`, \`requesting-code-review\`, \`receiving-code-review\`, and \`remove-ai-slops\`.
- The workflow policy is configurable through \`workflow.strictGates\`, \`workflow.reviewCap\`, and \`workflow.finalReviewPolicy\`; do not treat those dsmm settings as global policy outside active \`{{modeName}}\` mode or DSMM-managed preset scope.

## Tool discipline

Use repository tools for repository-specific claims. Prefer narrow reads and searches before broad exploration. Use external documentation for library, API, CLI, or cloud-service details.

- DSMM safety guards may enforce shell dialect, git-write approval, output-size, plan-format, question-label, and todo-discipline policy inside this mode; treat \`[dsmm safety]\` messages as binding policy feedback.

</dsmm-deepwork-mode>`;
export const DEEPSEEK_V4_PRO_OVERLAY = `<dsmm-deepseek-v4-pro-calibration>

DeepSeek V4 Pro calibration is active.

- Treat complex coding, architecture, migration, debugging, and review tasks as deliberate reasoning tasks.
- First classify the task and identify the evidence needed.
- Use tools before making repository-specific or API-specific claims.
- Runtime reasoning effort is enforced by \`agent/request\`, not this prompt.
- In \`auto\` calibration, explicit upstream reasoning effort is preserved; \`strict\` overrides it with computed policy.
- Only adapter-advertised reasoning efforts are emitted; \`max\` is selected only for configured DSMM presets.
- Keep final answers concise and do not expose private chain-of-thought.
- When tool calls are enabled through the provider, preserve the provider-required reasoning/tool-call continuity.

</dsmm-deepseek-v4-pro-calibration>`;
export function buildDeepworkPrompt(settings, options = {}) {
    const base = (options.overrideSection?.trim() || BASE_DEEPWORK_PROMPT).replaceAll("{{modeName}}", settings.modeName);
    const workflowPolicy = `<dsmm-workflow-policy>
strictGates: ${String(settings.workflow.strictGates)}
reviewCap: ${String(settings.workflow.reviewCap)}
finalReviewPolicy: ${settings.workflow.finalReviewPolicy}
</dsmm-workflow-policy>`;
    const shouldApplyOverlay = settings.deepseekV4ProCalibration !== "off"
        && options.route !== undefined
        && isDeepseekV4ProRoute(options.route);
    const calibrationPolicy = `<dsmm-deepseek-v4-pro-policy>
calibrationMode: ${settings.deepseekV4ProCalibration}
defaultReasoningEffort: ${settings.deepseekV4ProDefaultReasoningEffort}
maxReasoningPresets: ${settings.deepseekV4ProMaxReasoningPresets.join(", ")}
effectiveDesiredReasoningEffort: ${desiredDeepseekEffort(settings, options.selectedPreset)}
</dsmm-deepseek-v4-pro-policy>`;
    const calibrated = shouldApplyOverlay ? `${base}\n\n${DEEPSEEK_V4_PRO_OVERLAY}\n\n${calibrationPolicy}` : base;
    const prompt = `${calibrated}\n\n${workflowPolicy}`;
    return options.skillPrompt === undefined || options.skillPrompt === "" ? prompt : `${prompt}\n\n${options.skillPrompt}`;
}
//# sourceMappingURL=prompts.js.map