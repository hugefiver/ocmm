# Work Categories — Tier Grading

Eight work-content categories. Each maps to a default model+variant and carries a domain description used for category selection.

## Category table

| Category | Default model | Variant | Domain |
|---|---|---|---|
| `frontend` | `google/gemini-3.1-pro` | `high` | Frontend, UI/UX, design, styling, animation, visual design systems |
| `creative` | `google/gemini-3.1-pro` | `high` | Creative/unconventional approaches, ambiguous problems, novel exploration |
| `hard-reasoning` | `openai/gpt-5.5` | `xhigh` | Hard logic, heavy reasoning, strategic architecture decisions |
| `deep` | `openai/gpt-5.5` | `medium` | Goal-oriented autonomous multi-step problem-solving (long horizon) |
| `quick` | `openai/gpt-5.4-mini` | _(none)_ | Trivial, single-file changes, typo fixes, mechanical edits |
| `low-effort` | `anthropic/claude-sonnet-4-6` | _(none)_ | Moderate effort, doesn't fit other categories |
| `high-effort` | `anthropic/claude-opus-4-7` | `max` | High effort, doesn't fit other categories |
| `writing` | `kimi-for-coding/k2p5` | _(none)_ | Documentation, prose, technical writing |

## Variant semantics

A "variant" is reasoning effort or feature flag. Recognized values (from omo `known-variants.ts`):

```
low | medium | high | xhigh | max | minimal | none | auto | thinking
```

Plugins translate variants to provider-specific knobs:

- OpenAI / GPT-style: `reasoningEffort`.
- Anthropic Claude: `thinking.budgetTokens` (`max` → unbounded reasoning).
- Gemini: thinking + temperature presets.

## Per-category prompt-append themes

Each category injects a system-prompt addendum when its model is selected through the delegation pathway. Themes (full bodies live in agent prompt files; we only need the **theme summary** for routing-only Phase 1):

- `frontend` — DESIGN_SYSTEM_WORKFLOW_MANDATE (4-phase: ANALYZE → BUILD-IF-MISSING → BUILD-WITH-SYSTEM → VERIFY) + DESIGN_QUALITY (avoid Arial/Inter/Roboto, no purple-on-white).
- `creative` — diverse bold options first, embrace ambiguity, balance novelty with coherence.
- `hard-reasoning` — strategic-advisor mindset, response = bottom line / action plan / risks. Effort estimate Quick/Short/Medium/Large.
- `deep` — when GPT-5.5: 5–15 min silent exploration budget, goal-not-plan, atomic-task treatment, root-cause bias. Otherwise generic deep mode.
- `quick` — Caller_Warning to caller: smaller model needs EXHAUSTIVELY EXPLICIT prompts (TASK / MUST DO / MUST NOT DO / EXPECTED OUTPUT structure).
- `low-effort/high` — Selection_Gate (reverify task doesn't fit a more specific category) + Caller_Warning.
- `writing` — ANTI-AI-SLOP rules (no em/en dashes; ban "delve, leverage, utilize, robust, streamline"; use contractions; vary sentence length).

Phase 1 of OCMM only stores **category → model+variant**. Phase 2 may add per-category prompt-append injection.

## Selection signals

OCMM determines category via (priority order):

1. Explicit override in user config (`category: hard-reasoning` in plugin config).
2. Prefix on user message: `[hard-reasoning] do the thing` → category `hard-reasoning`.
3. Tool call argument when delegated: `delegate_task(category="deep", …)`.
4. Default: agent's preferred category (e.g. orchestrator → `deep`, junior → `low-effort`).
