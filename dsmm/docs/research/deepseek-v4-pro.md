# DeepSeek V4 Pro Prompt Calibration Notes

Date: 2026-08-21

## Status of evidence

The user reports that DeepSeek V4 Pro currently shows an overfitting-like behavior and needs specialized prompting to activate its full capability. Public official sources reviewed for this design do not state that diagnosis directly. The design therefore treats "overfitting" as a field observation and uses official model behavior to derive safe calibration rules.

## Official and public facts used

1. The DeepSeek API documents `deepseek-v4-pro` thinking mode with `reasoning_effort` and `extra_body: { "thinking": { "type": "enabled" } }`.
2. In thinking mode, sampling controls such as `temperature`, `top_p`, `presence_penalty`, and `frequency_penalty` are documented as ineffective in the official API path.
3. Thinking mode supports tool calls.
4. Tool-calling conversations in thinking mode require reasoning content to be preserved across subsequent user interaction turns; otherwise the integration can fail or lose the model's reasoning continuity.
5. DeepSeek V4 Pro public model material describes non-think, think-high, and think-max operating modes. Think-max uses an additional prompt/prefix mechanism and is intended for the hardest reasoning tasks.
6. General API usage does not accept the `developer` role, even though the open encoding docs mention it for an internal search-agent pipeline.

## dsmm calibration implications

### Prompt structure

DeepSeek V4 Pro calibration should be concrete and trigger-based:

- classify the task before acting;
- decompose architectural/debugging/migration work before editing;
- use tools for repository-specific facts;
- avoid claiming file state without reading/searching;
- keep the final answer concise while letting reasoning effort do the heavy lifting;
- make review and evidence gates explicit.

Avoid vague text such as "use your full intelligence" as the primary mechanism. It is acceptable as a short reinforcement, but the main prompt should specify observable behaviors.

### Reasoning policy

Recommended default policy for dsmm settings:

```yaml
dsmm:
  prompts:
    deepseekV4ProCalibration: auto
  models:
    defaultReasoningEffort: high
    maxReasoningForArchitecturalWork: true
```

Interpretation:

- `off`: no DeepSeek-specific overlay.
- `auto`: apply overlay only when the active model is detected as DeepSeek V4 Pro.
- `strict`: apply overlay and prefer max reasoning for architecture, migration, review, runtime-safety, or hard-reasoning tasks.

### Tool-call continuity

dsmm should not itself assume it can manage DeepSeek API message encoding. If dsh exposes a hook or adapter setting for reasoning-content retention, dsmm v0.6 should verify it for DeepSeek V4 Pro tool calls. Until then, dsmm docs should warn that provider/adapter correctness matters for thinking-mode tool use.

### Mode boundary

The calibration overlay belongs inside dsmm's `deepwork` custom mode or dsmm-managed role scopes. It should not be global, because ordinary dsh sessions may prefer concise non-think behavior.

## Draft calibration text shape

The final prompt should be maintained in source files, but its shape should remain close to this:

```text
When the active model is DeepSeek V4 Pro and dsmm deepwork mode is active:
- Treat complex coding, architecture, migration, debugging, and review tasks as deliberate reasoning tasks.
- First classify the task and identify the evidence needed.
- Use repository and documentation tools before making repo-specific claims.
- For multi-step work, maintain a visible plan or task list and verify each completed boundary.
- Use concise user-facing answers; do not expose private chain-of-thought.
- Prefer high reasoning effort by default; use max only for configured high-rigor tasks.
```

This text is intentionally behavioral rather than motivational. It should compose with dsh's own model adapter rather than fighting the adapter's chat template.
