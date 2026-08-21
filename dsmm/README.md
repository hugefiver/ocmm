# dsmm

`dsmm` is the planned DeepSeek Harness migration of ocmm's deepwork workflow. It is designed as a dsh-native subtree project rather than an OpenCode compatibility shim.

Current status: design and roadmap only. The first implementation target is a minimal installable dsh bundle that exposes deepwork as an opt-in custom mode instead of globally changing every dsh session.

## Documents

- `docs/design.md` — architecture, MVP scope, configuration model, DeepSeek V4 Pro calibration policy.
- `docs/roadmap.md` — version-by-version delivery plan and acceptance gates.
- `docs/research/oh-dsh.md` — notes from `hust-open-atom-club/oh-dsh` relevant to dsmm.
- `docs/research/deepseek-v4-pro.md` — public DeepSeek V4 Pro facts and prompt-calibration implications.

## Working principles

1. Prefer dsh-native Cordis services and events over emulating OpenCode hooks.
2. Keep deepwork opt-in through a dsh custom mode named `deepwork` by default.
3. Make workflow features configurable through composition config and user settings.
4. Start with the smallest useful bundle, then add ocmm parity in versioned layers.
