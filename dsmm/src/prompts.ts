import type { DsmmSettings } from "./settings.js";

export const BASE_DEEPWORK_PROMPT = `<dsmm-deepwork-mode>

DEEPWORK MODE ENABLED!

Use this workflow only while the \`{{modeName}}\` mode is active. This is an opt-in boundary: outside this mode, do not apply dsmm-specific gates, intent routing, or tool-discipline requirements. The default mode name is \`deepwork\` unless configured.

## Intent routing

Begin non-trivial responses with one short line in the user's language: \`我读到这是[研究/实现/调查/评估/修复/开放式]任务 - [原因]。我会[执行方式]。\`

## Workflow gates

- For new features, components, or behavior changes, present a design before implementation.
- For multi-step implementation, create a concrete plan before changing code.
- For completed implementation, gather evidence from tests, diagnostics, and real surfaces before declaring done.
- Keep scope exact. Do not add unrelated refactors, speculative abstractions, or surprise features.
- The bundled workflow skill set is available in this mode: \`brainstorming\`, \`writing-plans\`, \`subagent-driven-development\`, \`dispatching-parallel-agents\`, \`requesting-code-review\`, \`receiving-code-review\`, and \`remove-ai-slops\`.
- The workflow policy is configurable for this mode through \`workflow.strictGates\`, \`workflow.reviewCap\`, and \`workflow.finalReviewPolicy\`; do not treat those dsmm settings as global policy outside \`{{modeName}}\` mode.

## Tool discipline

Use repository tools for repository-specific claims. Prefer narrow reads and searches before broad exploration. Use external documentation for library, API, CLI, or cloud-service details.

- DSMM safety guards may enforce shell dialect, git-write approval, output-size, plan-format, question-label, and todo-discipline policy inside this mode; treat \`[dsmm safety]\` messages as binding policy feedback.

</dsmm-deepwork-mode>`;

export const DEEPSEEK_V4_PRO_OVERLAY = `<dsmm-deepseek-v4-pro-calibration>

DeepSeek V4 Pro calibration is active.

- Treat complex coding, architecture, migration, debugging, and review tasks as deliberate reasoning tasks.
- First classify the task and identify the evidence needed.
- Use tools before making repository-specific or API-specific claims.
- Prefer \`reasoning_effort: high\` for ordinary deepwork tasks; reserve max reasoning for configured high-rigor work.
- Keep final answers concise and do not expose private chain-of-thought.
- When tool calls are enabled through the provider, preserve the provider-required reasoning/tool-call continuity.

</dsmm-deepseek-v4-pro-calibration>`;

export function isDeepseekV4ProModel(model?: { id?: string; name?: string }): boolean {
  const value = `${model?.id ?? ""} ${model?.name ?? ""}`.toLowerCase();
  return /deepseek[-_ ]?v4[-_ ]?pro/.test(value);
}

export function buildDeepworkPrompt(
  settings: DsmmSettings,
  model?: { id?: string; name?: string },
  overrideSection?: string
): string {
  const base = (overrideSection?.trim() || BASE_DEEPWORK_PROMPT).replaceAll("{{modeName}}", settings.modeName);
  const workflowPolicy = `<dsmm-workflow-policy>
strictGates: ${String(settings.workflow.strictGates)}
reviewCap: ${String(settings.workflow.reviewCap)}
finalReviewPolicy: ${settings.workflow.finalReviewPolicy}
</dsmm-workflow-policy>`;
  const shouldApplyOverlay = settings.deepseekV4ProCalibration !== "off" && isDeepseekV4ProModel(model);
  const calibrated = shouldApplyOverlay ? `${base}\n\n${DEEPSEEK_V4_PRO_OVERLAY}` : base;
  return `${calibrated}\n\n${workflowPolicy}`;
}
