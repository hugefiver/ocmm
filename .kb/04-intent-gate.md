# Intent Gate and Mode Prompts

OCMM scans user messages for intent keywords; on hit, it injects a model-tuned mode prompt that **prepends** the agent's normal system prompt.

## Detection rules

Patterns evaluated in order. First match wins, except `superplan-deepwork` which combines both.

| Type | Regex | Mode prompt source |
|---|---|---|
| `superplan-deepwork` | `\b(sp\|superplan)\s+(dw\|deepwork)\b` (and reverse) | `mode/superplan.md` + deepwork variant (see below) |
| `deepwork` | `\b(deepwork\|dw)\b` | deepwork variant |
| `superplan` | `\b(sp\|superplan)\b` | `mode/superplan.md` |
| `team` | `\b(team-mode\|teammode\|/team)\b` | `mode/team.md` |

OMO also has runtime variants like `ralph-loop`, but Phase 1 of OCMM keeps just these four.

## Detection guards

Drop a match if any of these hold:

1. **System directive context** — message originates from a tool result or system block, not raw user input.
2. **`<SYSTEM_REMINDER>` blocks must be stripped** before pattern matching to avoid self-triggering on injected reminders.
3. **`isNonOmoAgent`** — skip if the active agent is a builtin OpenCode agent (Builder, Plan) that we explicitly do not want to override.
4. **`isPlannerAgent`** — for standalone `deepwork` (not `superplan-deepwork`), skip when the active agent is `planner` or `plan` (planners get planner.md instead).

## Deepwork variant routing

When intent is `deepwork` or `superplan-deepwork`, choose the deepwork prompt variant by this priority:

1. `isPlannerAgent(agentName)` → `prompts/deepwork/planner.md`
2. `isGptModel(modelId)` → `prompts/deepwork/gpt.md`
3. `isGeminiModel(modelId)` → `prompts/deepwork/gemini.md`
4. _(else default — Claude/Kimi/GLM/etc.)_ → `prompts/deepwork/default.md`

Model family detectors (mirrored from `model-core/model-family-detectors.ts`):

```ts
extractModelName("google/gemini-3.1-pro") // → "gemini-3.1-pro"

isGptModel(m: string)        // lowercase modelname includes "gpt"
isGeminiModel(m: string)     // starts with "google/" | "google-vertex/"
                             // OR "github-copilot/" + name lc startsWith("gemini")
                             // OR plain modelname lc startsWith("gemini-")
isClaudeOpus47Model(m)       // lc replaceAll "." → "-" includes "claude-opus-4-7"
isClaudeOpus47OrLaterModel   // if "claude-fable" → true
                             // else /claude-opus-(\d+)-(\d+)/ → major>4 OR (==4 && minor>=7)
isKimiK2Model(m)             // lc includes "kimi" OR /k2[-.]?p[567]/
isKimiK27Model(m)            // /kimi-k2[.-]?7/ OR /k2[-.]?p7/
isMiniMaxModel(m), isGlmModel(m) // lc substring match
```

## Composition order

When intent is detected, the system prompt is composed:

```
<mode prompt (superplan/team)>
<empty line>
<deepwork variant prompt (gpt/gemini/default/planner)>
<empty line>
<original agent system prompt>
```

For `superplan-deepwork`, both blocks are present. For other types, only the relevant one.

## Edge-trigger semantics

The mode prompt is injected **once per session**, on the first user message containing the keyword. Subsequent messages do not re-inject. Implementation: track a per-session `Set<intentType>` flag.

## Files

Local (already copied from omo):

- `.kb/prompts/deepwork/default.md` — full deepwork (CODE RED, certainty protocol, TDD, …)
- `.kb/prompts/deepwork/gpt.md` — decision-framework variant
- `.kb/prompts/deepwork/gemini.md` — intent gate + tool mandate variant
- `.kb/prompts/deepwork/planner.md` — concise plan-only
- `.kb/prompts/deepwork/codex.md` — codex variant (used by codex edition; OCMM ignores Phase 1)
- `.kb/prompts/mode/superplan.md` — adversarial multi-agent planning
- `.kb/prompts/mode/team.md` — team-tool orchestration (OCMM Phase 2 if at all)

These are loaded at plugin init from disk (or bundled as text imports if compiled).
