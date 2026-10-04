# Model routing

DSMM calibrates only exact verified routes while deepwork mode or a selected DSMM preset is in scope:

| Route | Calibration settings | Default |
| --- | --- | --- |
| `deepseek-official/deepseek-v4-pro` | `deepseekV4ProCalibration`, `deepseekV4ProDefaultReasoningEffort`, `deepseekV4ProMaxReasoningPresets` | `auto`, `high`, plan-critic/reviewer |
| `deepseek-official/deepseek-flash` or `deepseek-account/deepseek-flash` | `deepseekFlashCalibration`, `deepseekFlashDefaultReasoningEffort`, `deepseekFlashMaxReasoningPresets` | `auto`, `high`, plan-critic/reviewer |

The Flash model ID is `deepseek-flash` (catalog name `DeepSeek-V41-Flash`), not `deepseek-v4-pro` or a guessed V4.1 alias. Other provider IDs, even with an identical model string, are not calibrated. DSMM does not change the user's default provider/model.

`off` leaves the request unchanged. `auto` fills an omitted reasoning effort while preserving an explicit upstream effort. `strict` may replace an upstream effort only when configured and when the final route's `llm.resolveModelInfo` advertises a permitted value. The chosen effort is `max → high → valid default → unchanged` for a max-designated role; otherwise it is `desired → valid default → unchanged`. No effort is invented when the model has no reasoning metadata. The provider and host retain temperature and tool/reasoning-content serialization ownership.

The selected preset comes from the latest valid selection event or session header. A role-specific child has its own persona and tool filter but inherits the parent preset identity and route; a role label alone cannot trigger external-model routing or prove heterogeneity. DSMM's built-in role tools keep native per-call model selection off so a standing Web preset cannot remount tools inside a restricted child scope; an explicitly configured separate host tool must preserve that same safety boundary when selecting a different model. Runtime recovery chooses any final route before this calibration middleware evaluates it.

The capability-failure warning is sanitized to route and desired effort; it includes no prompt, credentials, response body or request headers. The actual persisted request header, not an outer middleware probe's earlier snapshot, is authoritative for the resolved effort.
