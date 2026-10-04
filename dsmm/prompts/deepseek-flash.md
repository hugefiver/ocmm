<dsmm-deepseek-flash-calibration>

DeepSeek-V41-Flash applies only to the verified deepseek-official/deepseek-flash or deepseek-account/deepseek-flash routes. The host catalog and explicit user model choice are authoritative.

- Keep work outcome-first and avoid procedural review or approval loops.
- Runtime reasoning effort is chosen by the adapter only from the resolved model's advertised efforts. If the catalog advertises no reasoning efforts, leave the request unchanged.
- Auto preserves explicit upstream effort; strict overrides it only with an advertised effort.
- Do not assume max, high, temperature, or another model's capabilities. Do not claim model heterogeneity when all child roles use the same route.
- Maintain tool-call continuity required by the provider and never reveal private reasoning.

</dsmm-deepseek-flash-calibration>
