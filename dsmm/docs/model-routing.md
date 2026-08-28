# Model routing

## Scope

DeepSeek V4 Pro calibration applies only while the active deepwork mode or a selected DSMM preset is in scope. It applies only to the exact, case-normalized official route `deepseek-official/deepseek-v4-pro`; a similarly named provider or model does not match.

## Settings

The flat settings and their defaults are:

- `deepseekV4ProCalibration: auto`
- `deepseekV4ProDefaultReasoningEffort: high`
- `deepseekV4ProMaxReasoningPresets: dsmm-plan-critic, dsmm-reviewer`

## Calibration modes

- `off` is a no-op.
- `auto` fills an omitted upstream effort and preserves explicit upstream effort.
- `strict` overrides upstream effort with the computed policy.

## Preset max policy

The selected preset is resolved from the newest valid selection event, then the session header. Only configured presets receive `max`; ordinary work uses the configured default effort.

## Advertised capabilities

For `max`, selection is `max → high → valid defaultEffort → unchanged`. For a non-max desired effort, selection is `exact desired → valid defaultEffort → unchanged`. DSMM never emits an effort the adapter has not advertised.

## Failure behavior

If capabilities cannot be resolved or no permitted effort is available, DSMM emits one sanitized warning and leaves downstream config unchanged.

## Boundaries

This policy makes no provider/model switch, text heuristic, retry/recovery, or ownership claim over provider reasoning-content/tool-call serialization. It does not infer policy from request content; runtime enforcement remains in `agent/request`.
