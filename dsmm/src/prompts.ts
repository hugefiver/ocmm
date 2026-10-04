import type { DshLlmCallConfig } from "./dsh-types.js";
import { desiredDeepseekEffort, isDeepseekFlashRoute, isDeepseekV4ProRoute } from "./model-routing.js";
import type { DsmmSettings } from "./settings.js";

export const BASE_DEEPWORK_PROMPT = `<dsmm-deepwork-mode>

DEEPWORK MODE ENABLED!

Use this workflow only while the \`{{modeName}}\` mode is active OR a DSMM-managed preset is selected. This is an opt-in boundary: outside both conditions, do not apply dsmm-specific gates, intent routing, or tool-discipline requirements. The default mode name is \`deepwork\` unless configured.

## Intent routing

Determine whether the user requests an explanation, diagnosis, implementation, or open-ended design. State the outcome and evidence in the user's language; classify aloud only when it helps the user.

## Workflow gates

- A clear implementation request authorizes its stated scope. Do not require design reapproval or a separate approval loop for equivalent implementation decisions.
- For complex business or behavior implementation, default to planner → plan-critic → implementation. Skip this sequence only for a bounded, simple, low-risk change or an explicit permitted user request. A task having multiple steps alone is not the criterion.
- Escalate choices that change scope or acceptance, weaken safety/data guarantees, change a public API/protocol or permissions, or cause an irreversible effect. Preserve explicit user configuration.
- Request implementation review when risk, uncertainty, or user requirements warrant it; reviewer is primary-lane self-review, while an Oracle is an externally configured cross-check. Do not run fixed review loops or manufacture an Oracle model.
- For completed implementation, gather evidence from tests, diagnostics, and real surfaces before declaring done.
- Keep scope exact. Do not add unrelated refactors, speculative abstractions, or surprise features.
- The bundled workflow skill set is available in this mode: \`brainstorming\`, \`writing-plans\`, \`subagent-driven-development\`, \`dispatching-parallel-agents\`, \`requesting-code-review\`, \`receiving-code-review\`, and \`remove-ai-slops\`.
- \`workflow.policy=risk-based\` uses the rules above. Explicit \`workflow.policy=legacy\` retains the configured \`strictGates\`, \`reviewCap\`, and \`finalReviewPolicy\` gates. Do not apply any DSMM policy outside active \`{{modeName}}\` mode or DSMM-managed preset scope.

## Tool discipline

Use repository tools for repository-specific claims. Prefer narrow reads and searches before broad exploration. Use external documentation for library, API, CLI, or cloud-service details.

- Use the shell dialect available in the current DSH runtime. Keep commands short and inspectable; resolve exact paths before destructive actions and do not string-build cross-shell deletes.
- No autonomous Git writes: implementing or fixing does not authorize a commit, and a commit does not authorize pushing, tagging, rebasing, or releasing.
- Child tasks inherit the host's authority and depth limits. Delegate only through actually available DSH tools; preset files alone do not prove that a role is callable.

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

export const DEEPSEEK_FLASH_OVERLAY = `<dsmm-deepseek-flash-calibration>

DeepSeek-V41-Flash applies only to the verified deepseek-official/deepseek-flash or deepseek-account/deepseek-flash routes. The host catalog and explicit user model choice are authoritative.

- Keep work outcome-first and avoid procedural review or approval loops.
- Runtime reasoning effort is chosen by the adapter only from the resolved model's advertised efforts. If the catalog advertises no reasoning efforts, leave the request unchanged.
- Auto preserves explicit upstream effort; strict overrides it only with an advertised effort.
- Do not assume max, high, temperature, or another model's capabilities. Do not claim model heterogeneity when all child roles use the same route.
- Maintain tool-call continuity required by the provider and never reveal private reasoning.

</dsmm-deepseek-flash-calibration>`;

export interface DeepworkPromptOptions {
  route?: Pick<DshLlmCallConfig, "provider" | "model">;
  selectedPreset?: string;
  overrideSection?: string;
  skillPrompt?: string;
}

export function buildDeepworkPrompt(
  settings: DsmmSettings,
  options: DeepworkPromptOptions = {}
): string {
  const base = (options.overrideSection?.trim() || BASE_DEEPWORK_PROMPT).replaceAll("{{modeName}}", settings.modeName);
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
  const prompt = `${calibrated}\n\n${workflowPolicy}`;
  return options.skillPrompt === undefined || options.skillPrompt === "" ? prompt : `${prompt}\n\n${options.skillPrompt}`;
}
